# Camp Path

Local Virginia Tech walking-navigation demonstration, redesigned around OpenStreetMap and the supplied `campus-corrections.osc`. Includes 113 destinations, search with building aliases, continuous GPS, rerouting, spoken directions, and a Gemini assistant. The route editor, historical floorplans, and screenshot-route overrides have been removed from the app.

## Run locally

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:5173/. No build or package installation is needed. Leaflet is bundled. OSM map tiles, Google Fonts, and Gemini need an internet connection; route calculation uses bundled OSM data in the browser.

GPS works on localhost or an HTTPS origin, with browser location permission. Opening a plain HTTP LAN address on a phone is not a secure context and normally prevents geolocation. The localhost demo is intended to run on the device being used. GPS behavior is tested with synthetic positions; real walking and indoor reception still need an on-campus check. No location history is saved or sent to the AI provider.

## Demonstration journeys

The four buttons use the supplied route requirements as OSM entrance/via-node constraints. Each journey is calculated over the same graph; none contains stored screenshot polylines.

| Journey | Path | Distance |
|---|---|---:|
| Goodwin → Data and Decision Sciences | North entrance, northern sidewalk, DDS east-side entrance | 283 m |
| Perry Place → Pamplin | Hitt south main entrance, Derring Hall passage, Pamplin southwest entrance | 135 m |
| Davidson → Classroom Building | Davidson west entrance, Hahn Hall North passage, NCB west main entrance | 381 m |
| Turner Place → Newman Library | Lavery east entrance, Upper Quad passage, Torgersen Bridge, library bridge elevator | 617 m |

DDS now has an entrance selector: **Side entrance** (the original 283 m Goodwin route) or **Second-floor entrance** (the west entrance, approximately 317 m from Goodwin). The second-floor designation comes from the user's annotated screenshot; OSM supplies the entrance node and paths, not the floor label. The selected entrance is preserved during GPS rerouting, route swapping, spoken arrival instructions, and assistant requests such as ‘Goodwin to DDS second floor.’ No new path geometry is traced from the screenshot.

Reverse journeys use reversed constraints. Building passages require open doors; building access hours and elevator operation are not available in this snapshot. `layer` tags are not treated as floor numbers. Live rerouting uses the connected OSM network from the user's position to the destination; it does not require backtracking to a demo journey's original waypoints.

## Navigation and voice

- `Start walking` starts a continuous high-accuracy GPS watch. `Stop navigation` clears the watch and queued speech.
- A blue marker and accuracy circle show the actual GPS fix. Routing projects onto a nearby eligible OSM path without drawing a fabricated connector from the GPS point.
- Fixes older than 30 seconds or with accuracy worse than 45 m do not generate turn prompts. The UI reports stale/lost signals.
- Three consecutive deviations beyond the accuracy-aware threshold trigger rerouting, with a ten-second cooldown.
- Arrival requires proximity to the route endpoint and little remaining distance; a route crossing alone does not trigger arrival.
- Browser speech synthesis supplies turn instructions without an API key. Available voices depend on the device.
- Written and spoken directions include distances, expanded campus abbreviations, clearer departure/turn/indoor-entry/exit language, and selected-entrance arrival wording. During live navigation, the current maneuver is highlighted, the next turn is announced in advance, closely spaced turns are grouped, and Repeat/Mute controls are available.
- GPS jitter does not replay a maneuver: low-confidence or off-path fixes pause cues, three confirmed deviations trigger a reroute, and arrival requires a close, accurate fix at the mapped endpoint.
- “Avoid stairs” excludes OSM `highway=steps` segments. It is not a wheelchair-accessibility certification.

## AI assistant

Open **AI & voice** and enter a Gemini API key. The default model is `gemini-2.5-flash`; the model field is configurable. The key is stored only in sessionStorage for this browser tab/session and sent to Google in the API request header. No API key is needed for OSM or browser speech.

The assistant can choose existing campus places, set stair avoidance, and explain measured routes. The router—not AI-generated coordinates—computes all directions. Invalid place IDs are rejected. Basic place matching is available without a key and is explicitly labeled as such. Live Gemini calls have not been tested with a real key; provider success/error behavior is covered using mocked HTTP responses.

## OSM data and supplied corrections

The raw snapshot is `source-data/campus.osm`, downloaded from the official OSM map API on 2026-09-20. The user-supplied change file is `source-data/campus-corrections.osc`.

All supplied changes were already published to OSM in changeset **189287015**. The importer reconciles negative IDs with those published objects and applies the overlay once. Untagged building-boundary ways remain geometry and are never converted into walkable paths. The three supplied construction polygons explicitly block intersecting route segments, as requested.

The compiled graph has **15,340 segments**, including **285 mapped stair segments** and **45 segments blocked by the supplied construction areas**. Topology uses OSM node identity. It does not connect unrelated paths merely because they cross on the screen. Pedestrian permissions and pedestrian one-way tags are respected.

The supplied building catalog supplies names and lookup seeds. Display locations and graph geometry are derived from OSM. Where a connected entrance is unavailable, a nearby OSM path node serves as an explicitly labeled arrival point; no straight-line entrance path is invented. **30 buildings use nearby-path arrivals.** Mitchell Hall remains searchable but cannot be used as an arrival destination while under construction.

Rebuild from the saved snapshot:

```sh
python3 scripts/build_camp_path.py
```

Refresh the snapshot through the OSM API and rebuild:

```sh
python3 scripts/build_camp_path.py --refresh
```

This is a deliberate refresh, not a live construction/door-status feed. The coverage report is `reports/CAMP_PATH_COVERAGE.json`. All open destinations are connected to the core campus graph without mapped stairs, either through mapped entrances or clearly identified nearby-path arrival points.

© OpenStreetMap contributors. OSM data is available under the [Open Database License](https://www.openstreetmap.org/copyright). Leaflet's license is in `dist/vendor/leaflet/LICENSE`.

## Validation

```sh
npm test
```

The tests cover all four demo journeys in both directions, all open catalog destinations, stair and construction constraints, overlay reconciliation, route continuity, GPS projection and navigation decisions, location-watch cleanup, and assistant validation/error handling. Desktop and phone layouts are manually checked in the browser.

## Main files

- `dist/index.html`, `dist/styles.css`, `dist/app.js`: interface and interactions.
- `dist/router.mjs`: OSM routing, directions, GPS projection, navigation decisions.
- `dist/guidance.mjs`: distance formatting, narration, live cue timing, and speech queue controls.
- `dist/location.mjs`: continuous GPS watch lifecycle.
- `dist/assistant.mjs`: Gemini integration and basic local place matching.
- `scripts/build_camp_path.py`: reproducible OSM + OSC import.

Older handoff documents, reports, import scripts, and server code describe the previous AccessPath prototype; they are historical context and are not part of the active Camp Path application. Use this README and the new importer for the current demo.
