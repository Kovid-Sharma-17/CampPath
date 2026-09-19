"""Adds New Classroom Building, Davidson Hall, and Williams Hall to the pilot,
and rebuilds the Hitt/Derring/Pamplin/NCB/Davidson local path network to
match rider-supplied route traces (screenshots of real walking directions,
annotated red/yellow for the preferred route vs. the stock map-app blue
route) instead of the earlier straight-line guesses.

This does NOT delete the existing north/east-corner path around Derring
(SEG-032/033/034) - Derring's north entrance (N-DERRING-EN) and the indoor
shortcut (IND-DERRING-1) still depend on it being reachable. It ADDS a
shorter, real-footprint-anchored west/south route that the router will
naturally prefer, matching what was actually traced as the way people go.

Safe to re-run: each section skips any id that already exists. Not idempotent
in the deeper sense that re-running it after further hand-edits to the
affected records (e.g. the DDS entrance notes) will overwrite those edits -
this is a one-time migration kept for provenance, the same way
merge_vt_gis.py and import_pilot.py are, not a general-purpose importer.
"""
import json
from pathlib import Path

from nad_gis_data_20260919 import POINTS, RINGS

DATA = Path(__file__).resolve().parents[1] / "dist" / "data"
GIS_SOURCE = "arcgis-central.gis.vt.edu/arcgis/rest/services/vtcampusmap/Buildings/FeatureServer/0, fetched 2026-09-19"
TRACE_SOURCE = "Rider-supplied Apple Maps route screenshots (2026-09-19), annotated to mark the preferred walking route vs. the app's stock suggestion. Shape approximated against real VT GIS building footprints, not itself a survey."


def westmost(ring):
    return min(ring, key=lambda p: p[0])


def eastmost(ring):
    return max(ring, key=lambda p: p[0])


def southmost(ring):
    return min(ring, key=lambda p: p[1])


def northmost(ring):
    return max(ring, key=lambda p: p[1])


# ---- 1. New buildings -------------------------------------------------
buildings_path = DATA / "buildings.geojson"
buildings = json.loads(buildings_path.read_text())

NEW_BUILDINGS = [
    ("VT-NCB", "Classroom Building (NCB)", "0159", "1455 Perry St."),
    ("VT-DAVIDSON", "Davidson Hall", "0156", "1040 Drillfield Dr."),
    ("VT-WILLIAMS", "Williams Hall", "0152", "890 Drillfield Dr."),
]
existing_building_ids = {f["properties"]["building_id"] for f in buildings["features"]}
added_buildings = []
for building_id, name, bldg_num, address in NEW_BUILDINGS:
    if building_id in existing_building_ids:
        print("SKIP (exists):", building_id)
        continue
    added_buildings.append(building_id)
    p = POINTS[bldg_num]
    display_num = bldg_num.lstrip("0") or "0"  # match the existing convention (Hitt: "0168" -> "168")
    buildings["features"].append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
        "properties": {
            "building_id": building_id, "name": name, "building_number": display_num,
            "abbreviation": None, "address": address, "year_built": str(p["yrbuilt"]),
            "new_since_2006": "no" if p["yrbuilt"] < 2006 else "yes",
            "coord_source": GIS_SOURCE, "confidence": "official", "display_tier": "CONFIRMED",
            "floorplan_in_archive": "NO",
            "notes": "Added 2026-09-19 because rider-supplied route traces named it as a real origin/destination in this pilot zone.",
        },
    })
buildings_path.write_text(json.dumps(buildings, indent=2) + "\n")
print("Added buildings:", added_buildings)

# ---- 2. Entrances for the new buildings --------------------------------
entrances_path = DATA / "entrances.geojson"
entrances = json.loads(entrances_path.read_text())
existing_entrance_ids = {f["properties"]["entrance_id"] for f in entrances["features"]}


def entrance_feature(entrance_id, building_id, node_id, name, coords, notes):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": list(coords)},
        "properties": {
            "entrance_id": entrance_id, "building_id": building_id, "node_id": node_id,
            "entrance_name": name, "accessibility_status": "unknown", "operational_status": "unknown",
            "step_count": None, "geometry_precision": "placeholder_on_real_footprint",
            "confidence": "inferred", "display_tier": "UNKNOWN", "last_verified": None,
            "notes": notes,
        },
    }


def add_entrance(entrance_id, *args):
    if entrance_id in existing_entrance_ids:
        print("SKIP (exists):", entrance_id)
        return
    entrances["features"].append(entrance_feature(entrance_id, *args))


ncb_e1 = eastmost(RINGS["0159"])
davidson_e1 = southmost(RINGS["0156"])
williams_e1 = westmost(RINGS["0152"])

add_entrance("VT-NCB-E1", "VT-NCB", "N-NCB-E1", "East side toward Derring", ncb_e1,
    f"Positioned on the real building footprint, east side (faces the Derring/Hitt cluster, matching every rider-supplied route). {TRACE_SOURCE}")
add_entrance("VT-DAVIDSON-E1", "VT-DAVIDSON", "N-DAVIDSON-E1", "South side toward Lot 13", davidson_e1,
    f"Positioned on the real building footprint, south side, matching where rider-supplied routes reach this building near Lot 13. {TRACE_SOURCE}")
add_entrance("VT-WILLIAMS-E1", "VT-WILLIAMS", "N-WILLIAMS-E1", "West side toward Davidson/Derring", williams_e1,
    "Positioned on the real building footprint, west side. Williams Hall is a waypoint in the rider-supplied spine route (Perry St Lot / Hitt / Derring / Williams / Davidson to D&DS), not itself a traced origin or destination - treat this entrance as lower-confidence placement than the others added in this pass.")
entrances_path.write_text(json.dumps(entrances, indent=2) + "\n")
print("Added entrances (see SKIP lines above for any already present)")

# ---- 3. Rebuilt / new path segments ------------------------------------
paths_path = DATA / "paths.geojson"
paths = json.loads(paths_path.read_text())
by_id = {f["properties"]["segment_id"]: f for f in paths["features"]}


def path_feature(segment_id, from_node, to_node, coords, notes, is_indoor=False):
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": [list(c) for c in coords]},
        "properties": {
            "segment_id": segment_id, "from_node": from_node, "to_node": to_node,
            "accessibility_status": "unknown", "operational_status": "unknown",
            "surface": "unknown", "max_grade_pct": None, "width_m": None,
            "is_indoor": is_indoor, "open_hours": "unknown" if is_indoor else None,
            "access_control": "unknown" if is_indoor else "outdoor",
            "confidence": "inferred", "display_tier": "UNKNOWN", "notes": notes,
        },
    }


derring_w = westmost(RINGS["0155"])
derring_s = southmost(RINGS["0155"])
hahn_s_e = eastmost(RINGS["0157"])  # Hahn Hall South's east edge - not a pilot building, just a real waypoint

# J-WCD-N repositioned onto Derring's real west edge (near Derring Lot), replacing the
# earlier straight-line guess. Existing SEG-032/033/034 (the north/NE-corner route to
# N-DERRING-EN) still work from here - they are not deleted, just re-anchored.
JUNCTIONS = {
    "J-WCD-N": derring_w,
    "J-DERRING-S": derring_s,
    "J-HAHN-S": hahn_s_e,
}

# SEG-031: Hitt-E1 -> J-WCD-N (re-anchored to Derring's real west edge)
hitt_e1 = json.loads((DATA / "entrances.geojson").read_text())
hitt_e1_coords = next(f["geometry"]["coordinates"] for f in hitt_e1["features"] if f["properties"]["entrance_id"] == "VT-HITT-E1")
by_id["SEG-031"]["geometry"]["coordinates"] = [hitt_e1_coords, JUNCTIONS["J-WCD-N"]]
by_id["SEG-031"]["properties"]["notes"] = (
    "Redrawn 2026-09-19: re-anchored to Derring Hall's real west footprint edge (near "
    f"Derring Lot), replacing an earlier straight-line guess. {TRACE_SOURCE}")

new_segments = [
    path_feature("SEG-041", "J-WCD-N", "J-DERRING-S", [JUNCTIONS["J-WCD-N"], JUNCTIONS["J-DERRING-S"]],
                 f"NEW 2026-09-19: west side of Derring Hall, real footprint edge. Part of the shorter west/south route around Derring that rider-supplied traces mark as the one actually used, replacing the longer north/east-corner walk (SEG-032/033/034) as the router's preferred pick without removing that route. {TRACE_SOURCE}"),
    path_feature("SEG-042", "J-DERRING-S", "N-DERRING-EE", [JUNCTIONS["J-DERRING-S"], next(f["geometry"]["coordinates"] for f in hitt_e1["features"] if f["properties"]["entrance_id"] == "VT-DERRING-EE")],
                 f"NEW 2026-09-19: south side of Derring Hall to its east entrance, completing the west/south wrap-around. {TRACE_SOURCE}"),
    path_feature("SEG-044", "J-WCD-N", "N-NCB-E1", [JUNCTIONS["J-WCD-N"], ncb_e1],
                 f"NEW 2026-09-19: Derring Lot west side continuing to Classroom Building (NCB)'s east entrance - the Pamplin<->NCB and Hitt<->NCB rider-supplied routes both use this same stretch. {TRACE_SOURCE}"),
    path_feature("SEG-045", "N-DAVIDSON-E1", "J-HAHN-S", [davidson_e1, JUNCTIONS["J-HAHN-S"]],
                 f"NEW 2026-09-19: Davidson Hall north past Hahn Hall South / VTSports Lot 13A, per the rider-supplied Davidson<->NCB shortcut (the alternative to the official W Campus Dr route). {TRACE_SOURCE}"),
    path_feature("SEG-046", "J-HAHN-S", "J-DERRING-S", [JUNCTIONS["J-HAHN-S"], JUNCTIONS["J-DERRING-S"]],
                 f"NEW 2026-09-19: connects the Hahn Hall South shortcut into the Derring south-side route, giving Davidson Hall a path to the Derring/Pamplin/NCB cluster and (via the existing J-NAD-2 connection) toward D&DS. {TRACE_SOURCE}"),
]

# Direct Goodwin <-> D&DS segment along Prices Fork Rd, matching the rider-supplied
# "red / 1st floor entrance" trace. The existing Goodwin-E1 -> J-NAD-1 -> DDS-E2 route
# is kept and re-labelled as the "yellow / 2nd floor entrance" approach - see the notes
# added to both DDS entrances below. Neither floor assignment is confirmed.
goodwin_e1 = next(f["geometry"]["coordinates"] for f in hitt_e1["features"] if f["properties"]["entrance_id"] == "VT-GOODWIN-E1")
dds_e1 = next(f["geometry"]["coordinates"] for f in hitt_e1["features"] if f["properties"]["entrance_id"] == "VT-DDS-E1")
new_segments.append(path_feature(
    "SEG-047", "N-GOODWIN-E1", "N-DDS-E1", [goodwin_e1, dds_e1],
    f"NEW 2026-09-19: direct Prices Fork Rd connection, matching the rider-supplied 'red' trace to D&DS's Prices Fork Road entrance. The rider's route notes this as the 1st-floor entrance - NOT confirmed against building plans, carried over as-is from the trace. {TRACE_SOURCE}"))

existing_segment_ids = set(by_id.keys())
added_segments = []
for seg in new_segments:
    sid = seg["properties"]["segment_id"]
    if sid in existing_segment_ids:
        print("SKIP (exists):", sid)
        continue
    paths["features"].append(seg)
    added_segments.append(sid)

paths_path.write_text(json.dumps(paths, indent=2) + "\n")
print(f"Added {len(added_segments)} new path segments:", added_segments)
print("Re-anchored SEG-031 to the real Derring west footprint edge.")

# ---- 4. Note the floor-entrance distinction on DDS's existing entrances ----
entrances = json.loads(entrances_path.read_text())
for f in entrances["features"]:
    if f["properties"]["entrance_id"] == "VT-DDS-E1":
        f["properties"]["notes"] = ("Rider-supplied route trace marks this as the '1st floor' entrance reached "
                                     "directly from Goodwin Hall via Prices Fork Rd (SEG-047). Floor level not "
                                     "confirmed against building plans.")
    if f["properties"]["entrance_id"] == "VT-DDS-E2":
        f["properties"]["notes"] = ("Rider-supplied route trace marks this as the '2nd floor' entrance, reached "
                                     "from Goodwin Hall via J-NAD-1 (SEG-021/022) rather than directly - a real "
                                     "second door, plausible on this site's sloped terrain, but its floor level "
                                     "is not confirmed against building plans.")
entrances_path.write_text(json.dumps(entrances, indent=2) + "\n")
print("Updated DDS entrance notes with the floor-entrance distinction.")
