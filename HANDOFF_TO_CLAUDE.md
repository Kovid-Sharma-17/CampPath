# AccessPath VT — handoff to Claude

This file describes the current state of the AccessPath project in this workspace. It is the current handoff document; `HANDOFF_TO_CHATGPT.md` is an older snapshot and contains stale statements that the route editor and campus network are unfinished.

Repository root:

`/Users/kovidsharma/Documents/ChatGPT/VTHack26 2`

AccessPath is a static browser prototype for walking routes around Virginia Tech's Blacksburg campus. It uses Leaflet, GeoJSON, and ES modules. There is no required build step and no required backend.

## User decisions that define the scope

- The editable network should use Virginia Tech GIS and OpenStreetMap geometry. Google walking directions may be shown as a comparison, but Google route geometry is not stored as the editable source.
- Keep the project focused on realistic student travel around the academic campus. Near-campus dorms, stadiums, recreation fields, and similar destinations may remain as building markers. Remote airport and research-farm buildings were intentionally removed.
- The user supplied annotated Google Maps screenshots. The red, yellow, maroon, and orange paths should be represented as the student-reported paths shown in those screenshots. Maroon and orange routes must follow sidewalks rather than cutting across building footprints.
- DDS red means the first-floor destination and yellow means the second-floor destination. These are screenshot semantics, not a claim that the entrances or accessibility have been field verified.
- Closed-route simulation is disabled in the running app. The `Closed` legend entry remains visible, and the reusable router still has closure logic for tests and future use.
- The user reported stairs near the student center at `37°13'46.7"N 80°25'30.3"W`, stored as GeoJSON `[lng, lat] = [-80.42508333333333, 37.22963888888889]`. The exact stair flights and the two elevator alternatives have not been surveyed or mapped, so they must not be invented. Checked 2026-09-19: this point is 12m from a real building, **Johnston Student Center Elevator Tower** (`VT-JOHNSTON-STUDENT-CENTER-ELEVATOR-TOWER`) — confirmed as the correct match (an earlier Claude turn had guessed "Johnson Hall," which was wrong).

## How to run and test

From the repository root:

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:5173/` for the planner or `http://127.0.0.1:5173/route-editor.html` for the editor. Leaflet tiles and the Google comparison link need network access, but the local route data is bundled.

The environment's normal `node` command may not be on `PATH`. The bundled runtime that was used for verification is:

```sh
/Users/kovidsharma/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs
```

Current result: **30 tests passed, 0 failed**.

To rebuild the imported VT sidewalk network from the saved snapshot:

```sh
python3 scripts/import_campus_walkways.py source-data/vt-campus-sidewalks-2026-09-19.geojson
```

That command rewrites `dist/data/campus-walkways.geojson`, `dist/data/campus-approaches.geojson`, `dist/data/network-manifest.json`, and `reports/NETWORK_IMPORT.json`.

## Current data and counts

- `dist/data/buildings.geojson`: **350** building markers. The original sweep was 462; 112 remote or non-student-facing records were pruned.
- `dist/data/entrances.geojson`: **35** manually defined building entrances.
- `dist/data/paths.geojson`: **91** base hand-authored path segments, including the supplied route additions.
- `dist/data/connectors.geojson`: **48** vertical/indoor connectors. Known VT Facilities connectors are represented as official source records; unknown-mechanism connectors remain unmapped.
- `dist/data/student-routes.json`: **7** screenshot route choices and **24** route legs.
- `dist/data/campus-walkways.geojson`: **2,461** segments compiled from 1,552 VT ADA route features.
- `dist/data/campus-approaches.geojson`: **249** inferred sidewalk approaches for buildings that do not yet have a marked door.
- `dist/data/barriers.geojson`: **231** stair barriers — the 1 original community-reported point near Johnston Student Center, plus 230 real `highway=steps` ways imported from OpenStreetMap (2026-09-19), each with whatever OSM contributors actually tagged (step_count, incline, handrail, tactile_paving where present). Confidence is `community_report` for all of them, same as the original point — OSM tagging is crowd-sourced, not field-verified or VT-official, so it isn't promoted.
- The editor loads 91 base paths + 2,461 imported network paths + 24 materialized screenshot legs, approximately **2,576 editable paths**.

The VT network report is in `reports/NETWORK_IMPORT.json`. It currently has 30 connected components, 2,046 graph nodes, and a largest component of 1,737 nodes. It deliberately does not bridge disconnected pieces merely to improve coverage. It reports 163 inferred approaches on the main core component; other building markers remain useful as map destinations but may need a user-marked entrance and a connecting route.

All imported geometry is kept separate from accessibility evidence. VT sidewalk geometry is labelled as official geometry, but path `accessibility_status` remains `unknown` and new approaches are `inferred`. Do not change these to `step_free`, `field_verified`, or another confirmed value without a field survey or authoritative record.

## Application files

### Planner and routing

- `dist/index.html` — planner shell, controls, map, legend, route cards, floorplan controls, and link to the route editor.
- `dist/app.js` — loads the dataset, applies editor changes from browser storage, renders the map, invokes the router, shows route comparisons, handles floorplans, and contains the optional Ask AccessPath and read-aloud features.
- `dist/styles.css` — planner styles and responsive layout.
- `dist/router.mjs` — graph builder, Dijkstra routing, indoor/vertical connector handling, entrance direction rules, unknown/accessibility preferences, comparison routing, screenshot-route selection, closure support, and recorded-stair avoidance. Stair barriers can be a single `Point` (the original hand-reported pin) or a `LineString` (the 230 OSM-imported staircases) — `graph.stairPoints`/`graph.stairSpans` are populated from whichever geometry type each barrier actually has (fixed 2026-09-19; the route editor's barrier rendering had the same Point-only assumption and was fixed alongside it).

The running planner calls `buildGraph(..., {enableClosures: false})`. The reusable router still supports closure tests. Google comparison links are generated from the selected origin and destination; there is no Google API key or permanent Google polyline import.

### Route editor

- `dist/route-editor.html` — editor page.
- `dist/route-editor.css` — editor layout and controls.
- `dist/route-editor.js` — Leaflet editor UI.
- `dist/editor-model.mjs` — pure data/storage operations shared by the editor: validation, localStorage overlay application, path creation, node movement, path splitting, stair-span marking, and dataset loading.

The editor is a real editor now, rather than a command-only route creator. It supports:

- searching and selecting preloaded paths;
- dragging vertices, inserting a vertex by clicking a line, and removing intermediate vertices;
- editing name, indoor/outdoor state, access classification, confidence, and notes;
- deleting paths and undoing the last saved edit;
- drawing and saving a new path;
- marking or moving a building entrance/exit, including entry floor and door direction;
- automatically connecting a new door to a nearby mapped path when the geometry is close enough;
- choosing two points on a saved path to split out a stair section;
- finding a mapped stairs-avoiding alternative or drawing a user-provided alternative;
- showing the reported student-center stair point as a red map marker.

Edits are intentionally stored as an overlay in browser `localStorage` under:

`accesspath_network_edits_v1`

The source GeoJSON is not mutated by normal editor use. Use `Export edits JSON` to save a portable edit file and `Import edits JSON` to restore it in another browser. The overlay shape is:

```json
{
  "version": 1,
  "paths": {},
  "entrances": {},
  "studentLegs": {},
  "nodes": {}
}
```

`null` values are tombstones for deletions. `nodes` moves shared graph junctions and keeps incident paths aligned. Editing a screenshot leg or one of its endpoint nodes disables the affected screenshot preset rather than continuing to present stale directions.

## Screenshot routes already implemented

The seven route presets and their source images are in `dist/data/student-routes.json`:

- Perry Place ↔ Pamplin — `IMG_3109.jpg`, red path.
- Pamplin ↔ New Classroom Building — `IMG_3110.jpg`, red path.
- Davidson Hall ↔ New Classroom Building — `Screenshot 2026-09-19 at 10.48.54.png`, red path.
- Goodwin Hall ↔ DDS floor 1 — `IMG_3111.jpg`, red path.
- Goodwin Hall ↔ DDS floor 2 — `IMG_3111.jpg`, yellow path.
- Davidson Hall ↔ DDS floor 1 — `IMG_3113.jpg`, red path.
- Davidson Hall ↔ DDS floor 2 — `IMG_3113.jpg`, yellow path.

The route leg records include the user-provided polylines, route color, source image, and indoor/outdoor metadata. The five legs identified by the user as indoor are marked `is_indoor: true`: `SEG048`, `SEG049`, `SEG051`, `SEG052`, and `SEG057`.

The tests verify that all seven screenshot selections use their continuous supplied corridors in both directions, preserve the DDS floor distinction, and never promote them to verified step-free routes.

## Network import provenance

The saved snapshot is `source-data/vt-campus-sidewalks-2026-09-19.geojson`, downloaded from VT's public ArcGIS service:

`https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/ADA_Routes_Only/MapServer/0`

`scripts/import_campus_walkways.py` splits VT linework at source vertices and T-junctions, collapses degree-two chains into editable polylines, links existing graph entrances only when they are within a bounded distance, and adds clearly labelled nearest-sidewalk approaches for buildings without an entrance. It does not create arbitrary gap bridges.

The map uses OpenStreetMap tiles with attribution. OpenStreetMap geometry was selected as an allowed source for future editable expansion, but the current saved campus network is the VT ADA route import. Do not import Google Maps geometry into permanent app data without a separate API/licensing decision.

## Scripts and reports

- `scripts/add_route.py` — adds a path segment by existing node IDs and space-separated `lng,lat` points. New paths default to `unknown`/`inferred`.
- `scripts/add_entrance.py` — adds a building entrance from a building ID, name, and `[lng,lat]` coordinate.
- `scripts/add_all_campus_buildings.py` — imports VT building markers.
- `scripts/prune_remote_buildings.py` — applies the near-campus building pruning.
- `scripts/vt_gis_all_buildings_20260919.py` and its `.raw.json` — VT building source/import work.
- `scripts/import_campus_walkways.py` — compiles VT sidewalk geometry as described above.
- `scripts/import_osm_stairs.py` — imports the 230 real OSM staircases described above, from the saved snapshot `scripts/osm_campus_steps_20260919.raw.json` (fetched live from `api.openstreetmap.org/api/0.6/map` — note this is the official OSM API, not a third-party Overpass mirror; the Overpass mirrors were unreachable from a Claude sandbox, the official API wasn't). Safe to re-run, skips existing `barrier_id`s.
- `scripts/bake_edits.mjs` — merges an exported route-editor edits file (the "Export edits" JSON from `dist/route-editor.html`, `localStorage` key `accesspath_network_edits_v1`) permanently into `dist/data/*.geojson`, using `editor-model.mjs`'s real `applyEdits()` rather than reimplementing the merge. Run with `node scripts/bake_edits.mjs <edits.json>`. Without this, edits made in the browser editor stay local to that browser until manually exported/imported elsewhere — there was previously no path from "edited in the browser" to "part of the committed dataset."
- `scripts/build_student_routes.mjs` and `scripts/compare_student_routes.mjs` — screenshot-route compilation/audit utilities.
- `scripts/import_pilot.py` — original ZIP/floorplan importer.
- `reports/NETWORK_IMPORT.json` — generated network counts and coverage gaps.
- `reports/STUDENT_ROUTE_IMPLEMENTATION.md` and `reports/STUDENT_ROUTE_COMPARISON.md` — screenshot route provenance and comparison notes.
- `PROJECT_FILES.md` — broader file inventory, including the historical floorplans.
- `CHANGELOG.md` and `README.md` — project history and architecture notes. Some older sections describe an earlier 70-path state; use this handoff and the actual files/counts above for the current network state.

The 41 historical floorplan images remain under `dist/floorplans/`, with the manifest in `dist/data/floorplans.json`. They are reference images, not current room-level routing data.

## Verification already completed

- The pruned 350-building graph builds successfully.
- All 30 automated tests pass.
- The browser route editor loaded locally and rendered the preloaded network of roughly 2,576 paths.
- Existing-path selection and vertex insertion were exercised in the browser.
- Student route directions, indoor/outdoor comparisons, connector routing, entrance rules, status freshness, and data immutability are covered by tests.

The editor still needs a full browser pass for drag → save → reload, entrance creation, path deletion → undo, stair splitting, and drawing an alternative. Those are the most useful next manual checks.

## Known limitations and safe next work

1. The imported sidewalk network has disconnected components and several existing hand-authored entrances that are more than the importer’s bounded snap distance from VT linework. Review `reports/NETWORK_IMPORT.json` before adding a connector; do not bridge a gap just because two markers look close on the map.
2. Many of the 249 new approach points are nearest mapped sidewalks, not doors. They are intentionally shown as approaches and must be replaced or supplemented with user-marked entrances.
3. The student-center stair point is approximate and community-reported. The exact stairs, elevator tower, floor connections, and alternate route still require a survey or user-drawn geometry.
4. There is no dedicated unit-test file yet for `editor-model.mjs`; add tests for storage validation, path splitting, stair spans, edit application, and entrance-direction behavior before making larger editor changes.
5. OSM `highway=steps` data may help identify candidate stairs, but it must remain a source clue until matched to the campus network and labelled with appropriate uncertainty.
6. Keep accessibility and confidence evidence conservative. A route being present in VT GIS, OSM, or Google directions does not by itself prove that it is step-free, open, or usable by every student.
7. Do not retry the prior external Sites upload without explicit approval. The existing Sites project is private/owner-only, and an earlier full-source upload was rejected by automatic review because it would send the entire source/data tree externally. Continue locally unless the user authorizes publication.

## Recommended next sequence for Claude

1. Read this file, `dist/editor-model.mjs`, `dist/route-editor.js`, `dist/router.mjs`, and `reports/NETWORK_IMPORT.json`.
2. Run the 30 tests and start the local server.
3. Exercise the editor manually, keeping any test edits in a temporary browser profile or exporting/deleting them afterward.
4. Add focused editor-model tests before changing storage or topology behavior.
5. Review disconnected components and unlinked core entrances with the user before adding new paths.
6. Map the student-center stairs only from user-supplied or surveyed endpoints; draw the two elevator alternatives as separate, explicitly unverified paths when their actual endpoints are known.
7. Update this handoff and `PROJECT_FILES.md` whenever counts, source provenance, or editor semantics change.

## Update from Claude, 2026-09-19 (after reading the above)

Verified rather than assumed: ran the actual test suite (30/30 pass, confirmed with the node
runtime path above), cross-checked `reports/NETWORK_IMPORT.json` against the real files (numbers
matched), and read `import_campus_walkways.py` and `editor-model.mjs` in full. Found and fixed the
stair-point building match (see the corrected note above) and one real bug this work surfaced
(barrier-rendering Point-only assumption, also fixed above). Also resolved four open questions the
user deferred to my judgment:

1. **CLI scripts vs. the browser editor**: kept both, with distinct roles rather than picking one.
   The CLI (`add_route.py`, `add_entrance.py`, and now `bake_edits.mjs`) is for programmatic/bulk
   changes that should land in the committed dataset immediately — importing from an external
   source, or baking in a browser edits export. The browser editor is for interactive human work
   (drag, split, preview) that may or may not get promoted to permanent via `bake_edits.mjs`. They
   aren't competing — the editor's output is meant to flow through the CLI side eventually.
2. **No merge-back path existed** from an exported edits JSON into `dist/data/*.geojson` — built
   `scripts/bake_edits.mjs` to close that gap (see the Scripts section above). Tested end-to-end
   with a scratch edit (added, verified, confirmed the test suite catches the count change as
   expected, reverted).
3. **OpenStreetMap turned out to be directly usable**, not just Google-Maps-adjacent. The Overpass
   API mirrors were unreachable from a Claude sandbox, but the *official* OSM API
   (`api.openstreetmap.org/api/0.6/map`) was — a full campus bounding box fetches in one request.
   Used it to import 230 real, tagged staircases (`scripts/import_osm_stairs.py`) — see the
   `barriers.geojson` count above. This is real Phase-3 stair-map data, not the single hand-reported
   point that existed before.
4. **Run order confirmed**: `add_all_campus_buildings.py` → `prune_remote_buildings.py` →
   `import_campus_walkways.py` → `import_osm_stairs.py`. The network report was correctly generated
   against the already-pruned 350-building set.

