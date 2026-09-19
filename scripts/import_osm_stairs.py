"""Imports real staircases from OpenStreetMap into dist/data/barriers.geojson.

Source: scripts/osm_campus_steps_20260919.raw.json, a filtered snapshot of
230 highway=steps ways fetched live from api.openstreetmap.org/api/0.6/map
for a campus-wide bounding box (2026-09-19). That's the official OSM API,
not a third-party Overpass mirror - the mirrors (overpass-api.de,
overpass.kumi.systems) were unreachable from this environment; the official
API wasn't.

Each staircase becomes a LineString barrier feature (real shape, not a
single guessed point) carrying whatever OSM contributors actually recorded:
step_count, incline, handrail, tactile_paving, ramp, surface. Confidence is
community_report, matching the existing hand-reported stair point in this
file - OSM tagging is crowd-sourced, not a VT-authoritative or field-surveyed
source, so it doesn't get promoted to official/field_verified.

This only adds barrier *evidence* (for router.mjs's has_recorded_stairs
proximity check and for display). It does NOT create routable path segments
or step-free alternates - see the route editor's "Mark stairs on this path"
tool for turning a specific stair barrier into a split, routable path with a
drawn alternative.

Safe to re-run: skips any barrier_id that already exists.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "scripts" / "osm_campus_steps_20260919.raw.json"
BARRIERS = ROOT / "dist" / "data" / "barriers.geojson"


def main():
    raw = json.loads(RAW.read_text())
    barriers = json.loads(BARRIERS.read_text())
    existing_ids = {f["properties"].get("barrier_id") for f in barriers["features"]}

    added = 0
    for rec in raw["features"]:
        barrier_id = "OSM-STEPS-" + rec["osm_way_id"]
        if barrier_id in existing_ids:
            continue
        tags = rec["tags"]
        notes_parts = []
        if tags.get("step_count"):
            notes_parts.append(tags["step_count"] + " steps (OSM-reported)")
        if tags.get("incline"):
            notes_parts.append("incline: " + tags["incline"])
        if tags.get("ramp") == "yes":
            notes_parts.append("has an adjoining ramp per OSM")
        if tags.get("tactile_paving") == "yes":
            notes_parts.append("tactile paving present per OSM")
        notes = "; ".join(notes_parts) or "OpenStreetMap-tagged staircase; no further detail recorded."

        barriers["features"].append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": rec["coordinates"]},
            "properties": {
                "barrier_id": barrier_id,
                "name": "Stairs (OpenStreetMap)",
                "barrier_type": "stairs",
                "confidence": "community_report",
                "source": "OpenStreetMap way " + rec["osm_way_id"] + ", fetched 2026-09-19 via api.openstreetmap.org",
                "notes": notes,
                "step_count": tags.get("step_count"),
                "handrail": tags.get("handrail"),
                "surface": tags.get("surface"),
                "span_mapped": False,
            },
        })
        existing_ids.add(barrier_id)
        added += 1

    BARRIERS.write_text(json.dumps(barriers, indent=2) + "\n")
    print(f"Added {added} OSM-sourced stair barriers. Total barriers: {len(barriers['features'])}")


if __name__ == "__main__":
    main()
