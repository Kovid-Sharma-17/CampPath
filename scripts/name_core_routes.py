"""Gives the 91 hand-authored path segments a real, place-based identifier
(e.g. "pamplin-perry") instead of only a code (SEG-001, IND-DERRING-1), so
the route editor can show something meaningful without you having to
memorize what SEG-047 connects.

Writes to a NEW property, route_name - deliberately not properties.name.
`name` already has a job: dist/app.js's edgeName() falls back to it first
when rendering turn-by-turn directions and read-aloud narration in the main
planner, and a slug like "pamplin-perry" would read badly there ("Step 3:
pamplin-perry, about 45 meters"). route_name is what the route editor now
prefers to display instead of the raw segment_id; segment_id itself is left
untouched, since it's a stable key other code references directly (e.g.
router.mjs's UNMAPPED_BRIDGES set uses exact segment ids).

Safe to re-run: recomputes route_name for every segment from scratch.
"""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist" / "data"

BUILDING_SLUG = {
    "VT-GOODWIN": "goodwin", "VT-DURHAM": "durham", "VT-WHITTEMORE": "whittemore",
    "VT-MCBRYDE": "mcbryde", "VT-HANCOCK": "hancock", "VT-TORGERSEN": "torgersen",
    "VT-SQUIRES": "squires", "VT-BURRUSS": "burruss", "VT-NEWMAN-LIB": "newman",
    "VT-DDS": "dds", "VT-KELLY": "kelly", "VT-CFA": "cfa", "VT-HITT": "hitt",
    "VT-MITCHELL": "mitchell", "VT-DERRING": "derring", "VT-PAMPLIN": "pamplin",
    "VT-NCB": "ncb", "VT-DAVIDSON": "davidson", "VT-WILLIAMS": "williams",
}
JUNCTION_SLUG = {
    "J-ALUMNI-E": "alumni", "J-ALUMNI-N": "alumni", "J-ALUMNI-W": "alumni",
    "J-DERRING-NE": "derring-corner", "J-DERRING-S": "derring-corner", "J-DERRING-SW": "derring-corner",
    "J-DF-E": "drillfield", "J-DF-N": "drillfield", "J-DF-NW": "drillfield",
    "J-HAHN-S": "hahn-garden", "J-MAIN-N": "main-st", "J-MCB-S": "mcbryde-corner",
    "J-NAD-1": "nad", "J-NAD-2": "nad", "J-PERRY-E": "perry", "J-PERRY-W": "perry",
    "J-WCD-N": "west-campus-dr", "J-WHIT-S": "whittemore-corner",
}


def node_slug(node_id, building_by_node):
    if node_id in JUNCTION_SLUG:
        return JUNCTION_SLUG[node_id]
    building_id = building_by_node.get(node_id)
    if building_id and building_id in BUILDING_SLUG:
        return BUILDING_SLUG[building_id]
    # Floor pseudo-node, e.g. N-GOODWIN-L4 -> same building as its entrances.
    for bid, slug in BUILDING_SLUG.items():
        if node_id.startswith("N-" + bid.removeprefix("VT-") + "-L"):
            return slug
    return node_id.lower()


def main():
    entrances = json.loads((DATA / "entrances.geojson").read_text())["features"]
    building_by_node = {f["properties"]["node_id"]: f["properties"]["building_id"] for f in entrances}

    paths_path = DATA / "paths.geojson"
    paths = json.loads(paths_path.read_text())

    slugs = []
    for f in paths["features"]:
        p = f["properties"]
        a, b = node_slug(p["from_node"], building_by_node), node_slug(p["to_node"], building_by_node)
        if a == b:
            kind = "indoor" if p.get("is_indoor") or p["segment_id"].startswith("IND-") else "plaza"
            slug = f"{a}-{kind}"
        else:
            slug = f"{a}-{b}" if a < b else f"{b}-{a}"
        slugs.append(slug)

    counts = Counter(slugs)
    seen = Counter()
    for f, slug in zip(paths["features"], slugs):
        if counts[slug] > 1:
            seen[slug] += 1
            slug = f"{slug}-{seen[slug]}"
        f["properties"]["route_name"] = slug

    paths_path.write_text(json.dumps(paths, indent=2) + "\n")
    print(f"Named {len(paths['features'])} segments.")
    for f in paths["features"][:12]:
        print(" ", f["properties"]["segment_id"], "->", f["properties"]["route_name"])


if __name__ == "__main__":
    main()
