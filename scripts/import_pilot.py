"""Import supplied pilot data and matching archival floorplans without executing source code."""
from pathlib import Path
import argparse
import csv
import io
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("floorplans", type=Path)
    args = parser.parse_args()
    data = ROOT / "dist" / "data"
    data.mkdir(parents=True, exist_ok=True)
    sources = ROOT / "source-data"
    sources.mkdir(exist_ok=True)
    with zipfile.ZipFile(args.archive) as outer:
        with zipfile.ZipFile(io.BytesIO(outer.read("accesspath.zip"))) as archive:
            for name in ("buildings.geojson", "entrances.geojson", "paths.geojson", "connectors.geojson", "pois.geojson", "metadata.json"):
                raw = archive.read("accesspath/data/" + name)
                json.loads(raw)
                (data / name).write_bytes(raw)
            status_raw = archive.read("accesspath/data/status.csv")
            (data / "status-records.json").write_text(json.dumps(list(csv.DictReader(io.StringIO(status_raw.decode()))), indent=2) + "\n")
            (sources / "status.csv").write_bytes(status_raw)
            (sources / "accesspath-pilot-vt.xlsx").write_bytes(archive.read("accesspath/data/raw/accesspath-pilot-vt.xlsx"))
            for name in ("DATA_MODEL.md", "DATA_SOURCES.md", "SAFETY_AND_TRUST.md", "SURVEY_PROTOCOL.md"):
                (sources / name).write_bytes(archive.read("accesspath/docs/" + name))
    buildings = json.loads((data / "buildings.geojson").read_text())["features"]
    image_dir = ROOT / "dist" / "floorplans"
    image_dir.mkdir(exist_ok=True)
    index = {}
    count = 0
    for feature in buildings:
        props = feature["properties"]
        records = []
        # A reused building number must never connect a newer building to an old plan.
        if str(props.get("floorplan_in_archive", "")).lower() == "yes" and str(props.get("new_since_2006", "")).lower() != "yes":
            prefix = str(props["building_number"]).zfill(4).lower()
            for image in sorted(args.floorplans.glob(prefix + "sa*.gif")):
                match = re.fullmatch(r"[0-9a-z]{4}sa(\d{2})\.gif", image.name, flags=re.I)
                if not match:
                    continue
                code = match.group(1)
                label = "Basement" if code == "00" else f"Floor {int(code)}" if int(code) <= 9 else f"Archive sheet {code}"
                if image.name == "0174sa17.gif":
                    label = "Penthouse"
                shutil.copyfile(image, image_dir / image.name)
                records.append({"code": code, "label": label, "file": "floorplans/" + image.name})
                count += 1
        index[props["building_id"]] = {"name": props["name"], "archive_date": "2006-09-07", "plans": records}
    (data / "floorplans.json").write_text(json.dumps(index, indent=2) + "\n")
    print(json.dumps({"buildings": len(buildings), "floorplans_copied": count, "buildings_with_plans": sum(bool(x["plans"]) for x in index.values())}))

if __name__ == "__main__":
    main()
