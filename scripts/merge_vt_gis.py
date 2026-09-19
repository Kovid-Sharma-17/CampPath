"""One-time correction pass against VT's public Enterprise GIS REST catalog
(arcgis-central.gis.vt.edu/arcgis/rest/services), applied 2026-09-19 and kept
here for provenance and reproducibility, the same way import_pilot.py
documents the original ZIP import.

It does two things to dist/data/*.geojson:
  1. Corrects 6 building coordinates (one, Hitt Hall, by ~255 m) against the
     vtcampusmap/Buildings layer - see README.md's "Coordinate corrections".
  2. Adds 29 real elevator/chairlift connectors, sourced from the
     facilities/CriticalElevators layer - see README.md's "Indoor and
     vertical routing" and "VT Enterprise GIS" sections.

The raw data it merges in is in vt_gis_snapshot_20260919.py, a live fetch
transcribed by hand, not fabricated - see that file's own docstring. This
script does not re-fetch from the API (the snapshot is the record of what was
fetched); to redo this exercise with current data, re-query the same REST
endpoints (documented in source-data/DATA_SOURCES.md) and edit the snapshot.

Safe to re-run: it is a no-op on buildings.geojson beyond resetting the same
values, and skips any connector_id that already exists in connectors.geojson.
This intentionally does NOT touch paths.geojson or entrances.geojson - those
needed judgement calls (which side of a footprint an entrance placeholder
should sit on, how a path's geometry should reconnect) that were made by hand
and are not worth re-deriving mechanically; see their own per-record `notes`.
"""
import datetime
import json
from pathlib import Path

from vt_gis_snapshot_20260919 import RAW, BUILDING_ID_BY_NUM, NODE_SUFFIX

DATA = Path(__file__).resolve().parents[1] / "dist" / "data"

# --- 1. Building coordinates -------------------------------------------------
# Only buildings >30 m from the previously stored point were touched; smaller
# VT-page-vs-GIS differences (a handful of metres, typical centroid-vs-
# address-point variance) were left alone.
GIS_SOURCE = "arcgis-central.gis.vt.edu/arcgis/rest/services/vtcampusmap/Buildings/FeatureServer/0, fetched 2026-09-19"
COORD_FIXES = {
    "VT-HITT": {
        "lon": -80.42606666, "lat": 37.22945502,
        "year_built": "2023",
        "notes": "Corrected 2026-09-19: the Perry St address interpolation placed this building "
                 "roughly 255 m from its actual location. VT's own Enterprise GIS building layer, "
                 "VT News (Aug 23, 2024, 'Hitt Hall is in the North Academic District near Derring "
                 "and Cowgill halls'), and VT Facilities' project page (site 'amongst the existing "
                 "New Classroom Building, Derring Hall') all agree it is next to Pamplin Hall near "
                 "West Campus Drive, not far northwest near Whittemore. Coordinate now taken directly "
                 "from the GIS building record.",
    },
    "VT-CFA": {"lon": -80.41814971, "lat": 37.23188113,
        "notes": "Corrected 2026-09-19 (67 m) using VT Enterprise GIS, which disagrees with the "
                 "vt.edu building page by that margin - both are nominally 'official' VT sources; "
                 "GIS was preferred as the more precise, footprint-derived one. yrbuilt in GIS is "
                 "2013 vs. this record's 2011; not reconciled, left as a known open question."},
    "VT-DDS": {"lon": -80.42745759, "lat": 37.23154673,
        "notes": "Corrected 2026-09-19 (58 m) using VT Enterprise GIS."},
    "VT-KELLY": {"lon": -80.4224306, "lat": 37.23140889,
        "notes": "Corrected 2026-09-19 (37 m) using VT Enterprise GIS."},
    "VT-GOODWIN": {"lon": -80.42581866, "lat": 37.23231294,
        "notes": "Corrected 2026-09-19 (36 m) using VT Enterprise GIS."},
    "VT-BURRUSS": {"lon": -80.42360038, "lat": 37.22893256,
        "notes": "Corrected 2026-09-19 (12 m) using VT Enterprise GIS. That layer has two Burruss "
                 "polygons under building 0176 (a 36 m gap between them, likely separate wings of a "
                 "936,000 sq ft building); the one closer to the existing vt.edu-sourced point was used."},
}


def fix_buildings():
    path = DATA / "buildings.geojson"
    data = json.loads(path.read_text())
    fixed = []
    for feature in data["features"]:
        bid = feature["properties"]["building_id"]
        if bid not in COORD_FIXES:
            continue
        fix = COORD_FIXES[bid]
        feature["geometry"]["coordinates"] = [fix["lon"], fix["lat"]]
        feature["properties"]["confidence"] = "official"
        feature["properties"]["display_tier"] = "CONFIRMED"
        feature["properties"]["coord_source"] = GIS_SOURCE
        if "year_built" in fix:
            feature["properties"]["year_built"] = fix["year_built"]
        feature["properties"]["notes"] = fix["notes"]
        fixed.append(bid)
    path.write_text(json.dumps(data, indent=2) + "\n")
    print("Fixed building coordinates:", fixed)


# --- 2. Real elevator connectors ---------------------------------------------
# Rows with only a single floor_access value (no stated companion floor) are
# skipped rather than guessing which second floor they connect to.
STATUS_MAP = {"Reported as Functional": "available", "Closed for repairs": "closed"}
EVIDENCE = ("VT Facilities 'Critical Elevators' layer "
            "(arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/CriticalElevators), "
            "elevator_id {eid}, last edited {edited}")


def build_connector_features():
    skipped, features = [], []
    for bldg_num, eid, floor_access, etype, status, edited_ms in RAW:
        eid = eid.strip()
        floors = sorted(set(int(x) for x in floor_access.split(",")))
        if len(floors) < 2:
            skipped.append(eid)
            continue
        building_id = BUILDING_ID_BY_NUM[bldg_num]
        suffix = NODE_SUFFIX[building_id]
        lo, hi = floors[0], floors[-1]
        edited = datetime.datetime.utcfromtimestamp(edited_ms / 1000).strftime("%Y-%m-%d")
        if etype == "Chair Lift":
            connector_type, accessibility_status = "chairlift", "unknown"
            access_note = ("Chair/stair lift; VT's source data does not state whether this "
                            "specific unit is usable without transfer. Not assumed step-free.")
        else:
            connector_type, accessibility_status = "elevator", "step_free"
            access_note = "Standard cab elevator."
        features.append({
            "type": "Feature",
            "geometry": None,
            "properties": {
                "connector_id": eid,
                "building_id": building_id,
                "from_node": f"N-{suffix}-L{lo}",
                "to_node": f"N-{suffix}-L{hi}",
                "connector_type": connector_type,
                "floors_served": f"{lo:02d}-{hi:02d}",
                "accessibility_status": accessibility_status,
                "operational_status": STATUS_MAP[status],
                "confidence": "official",
                "operational_confidence": "official",
                "display_tier": "CONFIRMED",
                "evidence_source": EVIDENCE.format(eid=eid, edited=edited),
                "notes": (f"{etype} elevator, "
                          f"{'functional' if status.startswith('Reported') else 'CLOSED for repairs'} "
                          f"as of {edited} per VT Facilities. {access_note}"),
            },
        })
    return features, skipped


def add_connectors():
    path = DATA / "connectors.geojson"
    data = json.loads(path.read_text())
    existing_ids = {f["properties"]["connector_id"] for f in data["features"]}
    features, skipped = build_connector_features()
    added = 0
    for feature in features:
        if feature["properties"]["connector_id"] in existing_ids:
            print("SKIP (duplicate id):", feature["properties"]["connector_id"])
            continue
        data["features"].append(feature)
        added += 1
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Added {added} real elevator connectors; skipped {len(skipped)} single-floor rows: {skipped}")


if __name__ == "__main__":
    fix_buildings()
    add_connectors()
