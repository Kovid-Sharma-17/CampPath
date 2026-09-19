"""First draft of full campus coverage: adds every named, existing VT
building from the Enterprise GIS inventory (scripts/vt_gis_all_buildings_20260919.py)
to dist/data/buildings.geojson as a marker, including the residential side of
campus (dorms, dining) that the original pilot dataset omitted entirely.

Deliberately does NOT add entrances, paths, or connectors for these new
buildings - just the building point and name, same as the request that
produced this script: mark every building first, decide on entrances later
via scripts/add_entrance.py once someone has looked at the real doors.

Skips:
  - Any GIS record whose name matches an already-curated building (by
    normalized name) - those keep their hand-corrected coordinates and
    richer properties, not the raw GIS point.
  - bldg_use == "NON-BUILDING" (ponds, towers - not structures).
  - Records with a blank name (28 of 583; mostly unlabeled utility footprints).

Safe to re-run: skips any building_id that already exists.
"""
import json
import re
from pathlib import Path

from vt_gis_all_buildings_20260919 import RECORDS

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist" / "data"
SOURCE = "arcgis-central.gis.vt.edu/arcgis/rest/services/vtcampusmap/Buildings/FeatureServer/0, fetched 2026-09-19 (community='VIRGINIA TECH' AND status='Existing Conditions')"


def normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def slugify(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", name.strip()).strip("-").upper()
    return s[:40] or "BLDG"


def address(rec) -> str | None:
    parts = [
        str(int(rec["stnum"])) if rec.get("stnum") else None,
        rec.get("stpredir"),
        rec.get("stname"),
        rec.get("stsuffix"),
        rec.get("stpostdir"),
    ]
    parts = [p for p in parts if p and str(p).strip() and str(p) != "<Null>"]
    return " ".join(parts) if parts else None


def main():
    buildings_path = DATA / "buildings.geojson"
    geo = json.loads(buildings_path.read_text())
    features = geo["features"]

    existing_names = {normalize(f["properties"]["name"]) for f in features}
    existing_ids = {f["properties"]["building_id"] for f in features}

    added, skipped_existing, skipped_nonbuilding, skipped_blank = 0, 0, 0, 0
    used_ids = set(existing_ids)

    for rec in RECORDS:
        name = (rec.get("name") or "").strip()
        if not name:
            skipped_blank += 1
            continue
        if rec.get("bldg_use") == "NON-BUILDING":
            skipped_nonbuilding += 1
            continue
        if normalize(name) in existing_names:
            skipped_existing += 1
            continue

        bldg_num = rec.get("bldg_num")
        bldg_num = bldg_num if bldg_num and bldg_num != "<Null>" else None
        base_id = "VT-" + slugify(name)
        building_id = base_id
        if building_id in used_ids and bldg_num:
            building_id = base_id + "-B" + bldg_num  # disambiguate same-name buildings (e.g. duplicate storage sheds)
        n = 2
        while building_id in used_ids:
            building_id = f"{base_id}-{n}"
            n += 1
        used_ids.add(building_id)
        existing_names.add(normalize(name))

        props = {
            "building_id": building_id,
            "name": name,
            "building_number": bldg_num if bldg_num and bldg_num != "<Null>" else None,
            "abbreviation": None,
            "address": address(rec),
            "year_built": str(int(rec["yrbuilt"])) if rec.get("yrbuilt") else None,
            "new_since_2006": None,
            "coord_source": SOURCE,
            "confidence": "official",
            "display_tier": "CONFIRMED",
            "floorplan_in_archive": "NO",
            "notes": "Added 2026-09-19: campus-wide building marker, first draft. No entrances, paths, or connectors yet - use scripts/add_entrance.py to add real entry/exit points before routing through this building.",
        }
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [rec["longitude"], rec["latitude"]]},
            "properties": props,
        })
        added += 1

    buildings_path.write_text(json.dumps(geo, indent=2) + "\n")
    print(f"Added {added} buildings. Skipped {skipped_existing} already-curated, "
          f"{skipped_nonbuilding} non-building records, {skipped_blank} blank-name records.")
    print(f"Total buildings now: {len(features)}")


if __name__ == "__main__":
    main()
