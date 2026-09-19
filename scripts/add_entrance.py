"""Add one entrance to dist/data/entrances.geojson from the command line,
instead of hand-editing the GeoJSON.

Most of the 462 buildings added by add_all_campus_buildings.py have no
entrances yet - this is the second-draft step: pick a real building, click
its actual door on a map (or just know its coordinates), and register it as
a routable node. Nothing here is guessed: accessibility_status defaults to
unknown/inferred like every other unsurveyed entrance in this dataset.

Usage (use --coords=... with an equals sign - a single point starts with
"-" and has no space, which a plain "--coords -80.42,37.23" would make
argparse misread as another flag):
    python3 scripts/add_entrance.py --building VT-PRITCHARD --name "Main entrance, Washington St side" \\
        --coords=-80.4231,37.2318

--building must be an existing building_id (see dist/data/buildings.geojson).
--coords is a single "lng,lat" point (GeoJSON order). node_id and
entrance_id are auto-assigned as N-<BUILDING>-E<n> / VT-<BUILDING>-E<n>,
picking the next free number for that building.
"""
import argparse
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "dist" / "data"


def next_entrance_number(features, building_id: str) -> int:
    nums = []
    for f in features:
        p = f["properties"]
        if p["building_id"] != building_id:
            continue
        m = re.match(r"^N-.*-E(\d+)$", p["node_id"])
        if m:
            nums.append(int(m.group(1)))
    return max(nums, default=0) + 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--building", required=True, help="building_id, e.g. VT-PRITCHARD")
    ap.add_argument("--name", required=True, help='entrance_name, e.g. "Main entrance, Washington St side"')
    ap.add_argument("--coords", required=True, help='"lng,lat" point')
    ap.add_argument("--notes", default="Added via scripts/add_entrance.py; not yet surveyed.")
    ap.add_argument("--accessibility-status", default="unknown", choices=["unknown", "step_free", "not_step_free"])
    ap.add_argument("--confidence", default="inferred", choices=["official", "field_verified", "community_report", "inferred"])
    args = ap.parse_args()

    buildings = json.loads((DATA / "buildings.geojson").read_text())
    building_ids = {f["properties"]["building_id"] for f in buildings["features"]}
    if args.building not in building_ids:
        raise SystemExit(f"Unknown building_id {args.building!r} - check dist/data/buildings.geojson")

    entrances_path = DATA / "entrances.geojson"
    geo = json.loads(entrances_path.read_text())
    features = geo["features"]

    n = next_entrance_number(features, args.building)
    building_slug = args.building.removeprefix("VT-")
    node_id = f"N-{building_slug}-E{n}"
    entrance_id = f"VT-{building_slug}-E{n}"

    lng, lat = (float(v) for v in args.coords.split(","))
    is_confirmed = args.confidence in ("official", "field_verified")
    feature = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": {
            "entrance_id": entrance_id,
            "building_id": args.building,
            "node_id": node_id,
            "entrance_name": args.name,
            "accessibility_status": args.accessibility_status,
            "operational_status": "unknown",
            "step_count": None,
            "geometry_precision": "placeholder_offset_from_centroid",
            "confidence": args.confidence,
            "display_tier": "CONFIRMED" if is_confirmed else "UNKNOWN",
            "last_verified": None,
            "notes": args.notes,
        },
    }
    features.append(feature)
    entrances_path.write_text(json.dumps(geo, indent=2) + "\n")
    print(f"Added {entrance_id} ({node_id}) to {args.building}")


if __name__ == "__main__":
    main()
