# Screenshot route implementation — 2026-09-19

The current planner prioritizes the student's drawn corridors for the five
requested pairs. DDS adds separate floor-1 and floor-2 choices, giving seven
variants. The same geometry works in reverse. The earlier comparison report
and its JSON are preserved as a **before-change** audit.

| Pair / destination | Source image | Path |
| --- | --- | --- |
| Perry Place → Pamplin | IMG_3109.jpg (IMG_3109 2.jpg is a duplicate) | Red, through Derring |
| Pamplin → NCB | IMG_3110.jpg | Red, through Derring and Hitt |
| Davidson → NCB | Screenshot 2026-09-19 at 10.48.54.png | Red, along Hahn |
| Goodwin → DDS floor 1 | IMG_3111.jpg | Red, first-floor entrance |
| Goodwin → DDS floor 2 | IMG_3111.jpg | Yellow, second-floor entrance |
| Davidson → DDS floor 1 | IMG_3113.jpg | Red, Maroon-side sidewalk approach |
| Davidson → DDS floor 2 | IMG_3113.jpg | Yellow, Hitt / Orange-side sidewalk approach |

## Geometry and limits

The drawings provide corridors, not GPS tracks. Bends and doors are approximately
aligned to campus coordinates. They are not an exact survey or validated indoor
floor route. Red and yellow retain the user's meaning; every added segment's
accessibility remains unknown. Verified step-free and exclude-unknown requests
fail explicitly. DDS floor-to-floor travel is not invented from arrival-door data.

Maroon/Orange Loop sections use connected VT sidewalk geometry, including its
bends, instead of drawing a straight line between endpoints. The compiler fails
if a loop sidewalk cannot be connected. Its only topology tolerance is 0.7 m at
GIS junctions, too small to bridge a roadway. Other screenshot corridors preserve
the hand-marked bends instead of letting the incomplete sidewalk network choose
an unrelated detour. Their source records identify them as user traces.

Sidewalk geometry source (retrieved 2026-09-19):
https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/ADA_Routes_Only/MapServer/0/query

Query envelope: west -80.4285, south 37.2265, east -80.423, north 37.233;
WGS84 output, OBJECTID field, 376 features. Only geometry is reused; official
accessibility status is not inferred for these student paths.

Closure controls are removed. The app builds its graph with closures disabled;
historical closure records are treated as unknown for this demo, never as evidence
that a route has reopened. The Closed legend entry stays visible. The reusable
router and original source records are retained for future development.

## Files (relative to the project root)

Project root: `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2`

- `dist/data/student-routes.json`: generated anchors, 24 legs, 7 route choices,
  corrected entrance positions and loop edge overrides.
- `scripts/build_student_routes.mjs`: editable screenshot waypoints and compiler.
- `source-data/vt-sidewalks-2026-09-19.geojson`: reproducible sidewalk geometry input.
- `dist/router.mjs`: route selection, reversal, floor choices, preference enforcement.
- `dist/app.js`, `dist/index.html`, `dist/styles.css`: planner controls and map styles.
- `tests/student-routes.test.mjs`: current-data integration checks.
- `tests/router.test.mjs`: preserved base-graph behavior tests without screenshot overrides.

## Verification

All 30 Node tests pass. New checks cover the seven choices and their aliases,
reverse paths, continuity, distinct DDS entrances, access restrictions, indoor
versus outdoor choices, sidewalk-only loop data, disabled closures, and shared
graph endpoints. JavaScript syntax checks pass. The local server returns the
updated route data at http://127.0.0.1:5173/data/student-routes.json.

Final interactive browser QA is incomplete: automatic approval review rejected
the browser recheck because of its usage limit. Route geometry was also inspected
in local diagnostic plots against building footprints and sidewalk lines.
