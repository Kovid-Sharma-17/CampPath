"""Removes buildings that are too far from central campus to be a realistic
part of day-to-day student navigation - the airport, remote agricultural
research stations (turfgrass/equine/sheep/swine research barns), and VT
Electric Service substations/storage that add_all_campus_buildings.py pulled
in along with everything else under the "VIRGINIA TECH" GIS community.

Rule: distance from the pilot core's centroid (the 19 hand-curated
buildings) to each non-core building. A straight 2000m radius was picked by
inspecting the actual distribution: every Athletic building (Lane Stadium,
Cassell Coliseum, the rec fields, Steger Hall) sits under 1996m, every
Residential & Dining building sits under 1507m, and the nearest airport
building sits at 2308m - so 2000m keeps all of campus life (dorms,
academics, athletics, rec fields) and drops the remote research/utility
long tail without needing per-category guesswork.

Only affects buildings added by add_all_campus_buildings.py (buildings with
its "Added 2026-09-19: campus-wide building marker" note) - never touches
the 19 hand-curated pilot buildings.

Safe to re-run: it's a pure filter over the current file, not an import: a
second run against already-pruned data is a no-op.
"""
import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "dist" / "data"
MAX_DISTANCE_M = 2000
CORE_IDS = {
    "VT-GOODWIN", "VT-DURHAM", "VT-WHITTEMORE", "VT-MCBRYDE", "VT-HANCOCK",
    "VT-TORGERSEN", "VT-SQUIRES", "VT-BURRUSS", "VT-NEWMAN-LIB", "VT-DDS",
    "VT-KELLY", "VT-CFA", "VT-HITT", "VT-MITCHELL", "VT-DERRING",
    "VT-PAMPLIN", "VT-NCB", "VT-DAVIDSON", "VT-WILLIAMS",
}
ADDED_MARK = "campus-wide building marker"


def haversine(a, b):
    R = 6371000
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def main():
    path = DATA / "buildings.geojson"
    geo = json.loads(path.read_text())
    features = geo["features"]

    core = [f for f in features if f["properties"]["building_id"] in CORE_IDS]
    clat = sum(f["geometry"]["coordinates"][1] for f in core) / len(core)
    clon = sum(f["geometry"]["coordinates"][0] for f in core) / len(core)
    center = [clon, clat]

    kept, removed = [], []
    for f in features:
        p = f["properties"]
        is_added = ADDED_MARK in (p.get("notes") or "")
        if not is_added:
            kept.append(f)
            continue
        dist = haversine(center, f["geometry"]["coordinates"])
        if dist <= MAX_DISTANCE_M:
            kept.append(f)
        else:
            removed.append((round(dist), p["name"]))

    geo["features"] = kept
    path.write_text(json.dumps(geo, indent=2) + "\n")

    removed.sort()
    print(f"Removed {len(removed)} buildings beyond {MAX_DISTANCE_M}m from the pilot core.")
    print(f"Kept {len(kept)} total.")
    print("\nFirst 20 removed (closest to the cutoff, for a sanity check):")
    for dist, name in removed[:20]:
        print(f"  {dist}m  {name}")


if __name__ == "__main__":
    main()
