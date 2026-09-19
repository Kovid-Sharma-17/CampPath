"""Compiles OpenStreetMap's pedestrian path network into a second, separate
junction/segment layer - kept apart from the VT ADA_Routes_Only import
(campus-walkways.geojson) rather than merged or deduplicated against it, per
explicit instruction: two independently-sourced layers, some visual overlap
expected where both trace the same real sidewalk, no attempt to reconcile
which one "wins" where they agree or disagree.

Source: scripts/osm_campus_footways_20260919.raw.json - a filtered snapshot
(nodes + footway/path/pedestrian/steps ways only) of a live tiled fetch from
api.openstreetmap.org/api/0.6/map (the official OSM API; third-party Overpass
mirrors were unreachable from this environment) covering the full 350-building
campus area, 2026-09-19.

Confidence split (explicitly confirmed with the user, 2026-09-19): geometry
gets maximum confidence (geometry_confidence: official) since OSM's campus
coverage is dense, community-maintained, and treated here as an "official
channel" alongside VT's own GIS. accessibility_status/confidence stay
unknown/inferred - not out of caution, but because OSM footway/path tags make
no accessibility claim at all; there is nothing to rate. (The one place OSM
does assert an accessibility-relevant fact - the highway=steps ways - is
handled separately by import_osm_stairs.py at community_report, since that
actually is a real, if crowd-sourced, claim.)

Reuses the exact chain-compiling algorithm from import_campus_walkways.py
(T-junction splitting, coordinate-noise merging, degree-two chain collapsing,
bounded-distance entrance linking, non-bridging of gaps) rather than
reimplementing it, so the two importers can't silently drift apart.
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

from import_campus_walkways import ROOT, compile_network, distance, fc, projection, read, write

RAW = ROOT / "scripts" / "osm_campus_footways_20260919.raw.json"
SOURCE_URL = "https://api.openstreetmap.org/api/0.6/map (official OSM API, tiled fetch)"
ATTRIBUTION = "© OpenStreetMap contributors, ODbL - https://www.openstreetmap.org/copyright"


def as_vt_shaped_source(raw):
    """import_campus_walkways.compile_network() expects the VT ArcGIS export
    shape: a flat FeatureCollection of LineStrings with an objectid. Convert
    OSM's node-id/way-ref structure into that same shape once, here, so the
    shared compiler needs no OSM-specific branches."""
    nodes = raw["nodes"]
    features = []
    for way in raw["ways"]:
        coords = [nodes[r] for r in way["refs"] if r in nodes]
        if len(coords) >= 2:
            features.append({"properties": {"objectid": way["id"]}, "geometry": {"type": "LineString", "coordinates": coords}})
    return {"features": features}


def main():
    raw = json.loads(RAW.read_text())
    chains = compile_network(as_vt_shaped_source(raw))

    entrances = read("entrances.geojson")["features"]
    buildings = read("buildings.geojson")["features"]
    student = read("student-routes.json")
    core_nodes = {}
    for f in read("paths.geojson")["features"]:
        p = f["properties"]
        line = student.get("edgeOverrides", {}).get(p["segment_id"], f["geometry"]["coordinates"])
        for key, point in [("from_node", line[0]), ("to_node", line[-1])]:
            if "-L" not in p[key]:
                core_nodes.setdefault(p[key], point)
    for f in entrances:
        core_nodes[f["properties"]["node_id"]] = student["entranceCoordinates"].get(f["properties"]["node_id"], f["geometry"]["coordinates"])

    serial = 0

    def nearest(p):
        best = None
        for i, e in enumerate(chains):
            for j, (a, b) in enumerate(zip(e["points"], e["points"][1:])):
                d, q, t = projection(p, a, b)
                if best is None or d < best[0]:
                    best = (d, i, j, q)
        return best

    def split_at(match):
        nonlocal serial
        _, i, j, q = match
        e = chains[i]
        if distance(q, e["points"][0]) < .5:
            return e["from"], e["points"][0]
        if distance(q, e["points"][-1]) < .5:
            return e["to"], e["points"][-1]
        serial += 1
        node = "J-OSM-SNAP-" + str(serial)
        tail = {**e, "from": node, "points": [q] + e["points"][j + 1:]}
        chains[i] = {**e, "to": node, "points": e["points"][:j + 1] + [q]}
        chains.append(tail)
        return node, q

    links, unlinked = [], []
    for node, p in core_nodes.items():
        match = nearest(p)
        if match[0] <= 8:
            end, q = split_at(match)
            links.append({"from": node, "to": end, "points": [p, q], "sources": [], "connection": True})
        else:
            unlinked.append({"node": node, "gap_m": round(match[0], 1)})

    existing_buildings = {f["properties"]["building_id"] for f in entrances}
    approaches, missing = [], []
    for f in buildings:
        b = f["properties"]
        bid = b["building_id"]
        if bid in existing_buildings:
            continue
        p = f["geometry"]["coordinates"]
        match = nearest(p)
        if match[0] > 100:
            missing.append({"building_id": bid, "name": b["name"], "gap_m": round(match[0], 1)})
            continue
        junction, q = split_at(match)
        node = "N-APPROACH-OSM-" + bid
        links.append({"from": node, "to": junction, "points": [q, q], "sources": [], "connection": True})
        approaches.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": q},
            "properties": {
                "entrance_id": "APPROACH-OSM-" + bid, "node_id": node, "building_id": bid,
                "entrance_name": "Nearby sidewalk (OSM) — door not mapped", "node_role": "approach",
                "geometry_precision": "nearest_mapped_sidewalk",
                "accessibility_status": "unknown", "operational_status": "unknown", "confidence": "inferred",
                "source": "OpenStreetMap footway geometry; nearest approach, not a surveyed entrance",
                "building_offset_m": round(match[0], 1),
            },
        })

    features = []
    for i, e in enumerate(chains + links):
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": e["points"]},
            "properties": {
                "segment_id": "OSM-WALK-" + str(i + 1), "from_node": e["from"], "to_node": e["to"],
                "name": "Entrance approach (unverified)" if e.get("connection") else "Campus path (OpenStreetMap)",
                "accessibility_status": "unknown", "operational_status": "unknown", "confidence": "inferred",
                "geometry_confidence": "inferred" if e.get("connection") else "official",
                "source": ATTRIBUTION, "source_feature_ids": e["sources"],
                "is_indoor": False, "access_control": "outdoor", "surface": "unknown", "open_hours": "unknown",
            },
        })

    adj = defaultdict(set)
    for f in features:
        p = f["properties"]
        adj[p["from_node"]].add(p["to_node"])
        adj[p["to_node"]].add(p["from_node"])
    component, sizes = {}, []
    for n in adj:
        if n in component:
            continue
        num = len(sizes)
        stack, count = [n], 0
        component[n] = num
        while stack:
            u = stack.pop()
            count += 1
            for v in adj[u]:
                if v not in component:
                    component[v] = num
                    stack.append(v)
        sizes.append(count)
    main_component = Counter(component[n] for n in core_nodes if n in component).most_common(1)[0][0]
    connected = sum(component.get(f["properties"]["node_id"]) == main_component for f in approaches)

    report = {
        "source": "OpenStreetMap", "source_url": SOURCE_URL, "attribution": ATTRIBUTION,
        "source_features": len(raw["ways"]), "segments": len(features), "nodes": len(adj),
        "components": len(sizes), "largest_component_nodes": max(sizes),
        "building_markers": len(buildings), "new_approaches": len(approaches),
        "new_approaches_on_core_component": connected,
        "buildings_without_nearby_walkway": missing, "existing_nodes_not_linked": unlinked,
        "note": "Kept as a separate layer from the VT ADA import by design - no deduplication against it. Disconnected components are not bridged.",
    }
    write("dist/data/campus-walkways-osm.geojson", fc(features))
    write("dist/data/campus-approaches-osm.geojson", fc(approaches))

    manifest_path = ROOT / "dist" / "data" / "network-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["files"]["paths"] = [manifest["files"]["paths"]] if isinstance(manifest["files"]["paths"], str) else manifest["files"]["paths"]
    manifest["files"]["entrances"] = [manifest["files"]["entrances"]] if isinstance(manifest["files"]["entrances"], str) else manifest["files"]["entrances"]
    if "campus-walkways-osm.geojson" not in manifest["files"]["paths"]:
        manifest["files"]["paths"].append("campus-walkways-osm.geojson")
    if "campus-approaches-osm.geojson" not in manifest["files"]["entrances"]:
        manifest["files"]["entrances"].append("campus-approaches-osm.geojson")
    manifest["summary_osm"] = report
    manifest_path.write_text(json.dumps(manifest, indent=None) + "\n")

    (ROOT / "reports" / "NETWORK_IMPORT_OSM.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if not isinstance(v, list)}, indent=2))


if __name__ == "__main__":
    main()
