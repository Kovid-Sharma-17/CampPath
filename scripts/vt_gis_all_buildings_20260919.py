"""Fetches the full VT Enterprise GIS building inventory (not just the pilot
zone) so add_all_campus_buildings.py can mark every campus building,
including the residential side, which the original pilot dataset left out
entirely.

Source: arcgis-central.gis.vt.edu/arcgis/rest/services/vtcampusmap/Buildings/FeatureServer/0
Query: community='VIRGINIA TECH' AND status='Existing Conditions'
Fetched: 2026-09-19

This is a one-time snapshot kept for provenance, the same way
vt_gis_snapshot_20260919.py and nad_gis_data_20260919.py document their own
live fetches. Re-fetching would need network access this environment may not
always have; the merge script reads this file instead.
"""
import json
from pathlib import Path

RAW = json.loads((Path(__file__).resolve().parent / "vt_gis_all_buildings_20260919.raw.json").read_text())
RECORDS = [f["attributes"] for f in RAW["features"]]
