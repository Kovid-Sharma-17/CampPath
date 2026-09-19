"""Add one path segment to dist/data/paths.geojson from the command line,
instead of hand-editing the GeoJSON.

Fills in every property the router/UI expect, defaulting anything about
real-world accessibility to unknown/inferred so this can never silently
claim a fact that hasn't been surveyed. Auto-assigns the next SEG-### id.

Usage:
    python3 scripts/add_route.py \\
        --from N-GOODWIN-E1 --to N-DDS-E1 \\
        --coords "-80.4213,37.2277 -80.4198,37.2270" \\
        --notes "Direct Prices Fork Rd crossing, not yet surveyed"

--coords takes "lng,lat lng,lat ..." (2+ points, matching Google/Apple Maps'
lng,lat-reversed display order is a common mistake - GeoJSON is lng,lat).
Only --from, --to, and --coords are required; everything else defaults to
the same "unknown/inferred" baseline every other unsurveyed segment uses.

Indoor segments (IND-* ids) are also supported via --indoor, which sets
is_indoor true and access_control to "indoor".
"""
import argparse
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "dist" / "data" / "paths.geojson"


def next_segment_id(features, indoor: bool) -> str:
    prefix = "IND" if indoor else "SEG"
    nums = []
    for f in features:
        sid = f["properties"].get("segment_id", "")
        m = re.match(rf"^{prefix}-([A-Z0-9]+)-?(\d*)$", sid) if indoor else re.match(rf"^{prefix}-(\d+)$", sid)
        if not indoor and m:
            nums.append(int(m.group(1)))
    if indoor:
        # Indoor ids are IND-<BUILDING>-<n>; just use a numbered fallback.
        existing = {f["properties"].get("segment_id") for f in features}
        n = 1
        while f"IND-NEW-{n}" in existing:
            n += 1
        return f"IND-NEW-{n}"
    n = max(nums, default=0) + 1
    return f"SEG-{n:03d}"


def parse_coords(raw: str):
    points = []
    for pair in raw.strip().split():
        lng, lat = pair.split(",")
        points.append([float(lng), float(lat)])
    if len(points) < 2:
        raise SystemExit("--coords needs at least two lng,lat points")
    return points


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="from_node", required=True, help="from_node id, e.g. N-GOODWIN-E1 or J-PERRY-W")
    ap.add_argument("--to", dest="to_node", required=True, help="to_node id")
    ap.add_argument("--coords", required=True, help='"lng,lat lng,lat ..." path geometry, 2+ points')
    ap.add_argument("--notes", default="Added via scripts/add_route.py; not yet surveyed.")
    ap.add_argument("--indoor", action="store_true", help="mark as an indoor segment (IND-* id, access_control indoor)")
    ap.add_argument("--surface", default="unknown")
    ap.add_argument("--accessibility-status", default="unknown", choices=["unknown", "step_free", "not_step_free"])
    ap.add_argument("--confidence", default="inferred", choices=["official", "field_verified", "community_report", "inferred"])
    ap.add_argument("--segment-id", default=None, help="override the auto-generated id")
    args = ap.parse_args()

    geo = json.loads(DATA.read_text())
    features = geo["features"]

    seg_id = args.segment_id or next_segment_id(features, args.indoor)
    if any(f["properties"].get("segment_id") == seg_id for f in features):
        raise SystemExit(f"segment_id {seg_id} already exists")

    is_confirmed = args.confidence in ("official", "field_verified")
    feature = {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": parse_coords(args.coords)},
        "properties": {
            "segment_id": seg_id,
            "from_node": args.from_node,
            "to_node": args.to_node,
            "accessibility_status": args.accessibility_status,
            "operational_status": "unknown",
            "surface": args.surface,
            "max_grade_pct": None,
            "width_m": None,
            "is_indoor": bool(args.indoor),
            "open_hours": None,
            "access_control": "indoor" if args.indoor else "outdoor",
            "confidence": args.confidence,
            "display_tier": "CONFIRMED" if is_confirmed else "UNKNOWN",
            "notes": args.notes,
        },
    }
    features.append(feature)
    DATA.write_text(json.dumps(geo, indent=2) + "\n")
    print(f"Added {seg_id}: {args.from_node} -> {args.to_node} ({len(parse_coords(args.coords))} points)")


if __name__ == "__main__":
    main()
