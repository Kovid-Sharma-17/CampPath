"""Prunes dist/data/buildings.geojson down to exactly the buildings the user
hand-curated from the full 350-building list (2026-09-19) - a manual pass
more thorough than the automated 2000m-radius distance filter
(prune_remote_buildings.py) applied earlier. Removes 172 buildings: storage
sheds, greenhouses, special-purpose housing, construction trailers, bus
canopies, chiller plants, and other research/utility buildings that were
technically within range but not real day-to-day student destinations.

Also removes any orphaned approach-link entries (campus-approaches.geojson,
campus-approaches-osm.geojson, and their matching connector segments in
campus-walkways.geojson / campus-walkways-osm.geojson) that pointed at a
now-removed building, so nothing dangles.

Reads the curated name list from scripts/curated_building_names.txt (one
name per line, exact match against buildings.geojson's "name" property).
Safe to re-run; it's a pure filter, not an import.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist" / "data"
NAMES_FILE = ROOT / "scripts" / "curated_building_names.txt"


def main():
    keep_names = {line.strip() for line in NAMES_FILE.read_text().splitlines() if line.strip()}

    buildings_path = DATA / "buildings.geojson"
    buildings = json.loads(buildings_path.read_text())
    before = len(buildings["features"])
    kept, removed_ids = [], set()
    for f in buildings["features"]:
        if f["properties"]["name"] in keep_names:
            kept.append(f)
        else:
            removed_ids.add(f["properties"]["building_id"])
    buildings["features"] = kept
    buildings_path.write_text(json.dumps(buildings, indent=2) + "\n")
    print(f"buildings.geojson: {before} -> {len(kept)} ({len(removed_ids)} removed)")

    # Drop any approach point / connector stub that referenced a removed building.
    for approaches_name, walkway_name in [
        ("campus-approaches.geojson", "campus-walkways.geojson"),
        ("campus-approaches-osm.geojson", "campus-walkways-osm.geojson"),
    ]:
        approaches_path = DATA / approaches_name
        if not approaches_path.exists():
            continue
        approaches = json.loads(approaches_path.read_text())
        orphan_nodes = set()
        kept_approaches = []
        for f in approaches["features"]:
            if f["properties"]["building_id"] in removed_ids:
                orphan_nodes.add(f["properties"]["node_id"])
            else:
                kept_approaches.append(f)
        approaches["features"] = kept_approaches
        approaches_path.write_text(json.dumps(approaches, indent=2) + "\n")

        walkway_path = DATA / walkway_name
        walkway = json.loads(walkway_path.read_text())
        before_w = len(walkway["features"])
        walkway["features"] = [
            f for f in walkway["features"]
            if f["properties"]["from_node"] not in orphan_nodes and f["properties"]["to_node"] not in orphan_nodes
        ]
        walkway_path.write_text(json.dumps(walkway, indent=2) + "\n")
        print(f"{approaches_name}: {len(approaches['features']) + len(orphan_nodes)} -> {len(approaches['features'])} "
              f"({len(orphan_nodes)} orphaned); {walkway_name}: {before_w} -> {len(walkway['features'])}")


if __name__ == "__main__":
    main()
