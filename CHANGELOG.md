# Changelog

Everything done to this pilot in this session, in order. Each entry names the
commit it landed in; `git show <hash>` has the full diff and reasoning.

## 1. Initial commit — connectors wired into the route graph (`9b1756c`)

Imported the supplied pilot dataset as-is (16 buildings, 32 entrances, 64
path segments, 19 connectors, 8 POIs, 41 archival floorplans), then made one
substantive change on top of it: elevators, stairs, and bridges were
displayed but structurally inert — closing one in the simulator had no
effect on routing. `dist/router.mjs`'s `buildGraph()` now:

- Creates a floor pseudo-node per connector endpoint.
- Links each building's floor 1 to its entrances.
- Adds every connector with a known mechanism as a real, routable edge with
  a fixed time cost (45s elevator/lift, 25s per flight of stairs/ramp, 10s
  bridge).
- Leaves connectors of unknown mechanism (`connector_type: unknown`) unmapped
  rather than guessing.

Also fixed a documented vocabulary bug: three bridge connectors were typed
`lift` for lack of a `bridge` value in the schema.

No Node runtime was available in this environment, so the router test
suite's assertions were run live against `dist/router.mjs` in a browser
instead of via `node --test`. New coverage: Hitt Hall's elevator/stairs
wiring, closure-triggered rerouting, and the Whittemore bridge that stays
wired-but-unreachable until its own floor link is surveyed.

## 2. AI/voice assistant, admin backend, VTHacks track fit (`41e95b6`)

- **Ask AccessPath**: a chat panel that turns a plain-language request into
  a call to the same validated `configure_accesspath_route` function the
  WebMCP tool already used. With a user-supplied Gemini key it calls Gemini
  directly from the browser, JSON output constrained to the app's own place
  list, explicitly instructed never to assert an accessibility fact itself.
  Without a key, falls back to local keyword matching and says so.
- **Read aloud**: narrates a route's existing trust-carded copy (including
  the unverified percentage) via the browser's built-in `speechSynthesis`
  with no setup; upgradeable to ElevenLabs with a user-supplied key. Has a
  bounded safety timeout so the button can't get stuck if `onend` never
  fires.
- Both keys are optional, stored only in `localStorage`, sent directly to
  the named provider — a new "AI & voice keys" dialog explains this.
- **`server/`**: a small Flask admin tool for adding or bulk-importing
  `status.csv`-shaped reports through a form or CSV upload instead of
  hand-editing JSON, using the same status/confidence vocabulary validation
  as `router.mjs`. Runs on local SQLite with zero setup; `DATABASE_URL` can
  point it at Postgres (Tiger Data is managed Postgres) instead.
- README gained a **VTHacks 14 tracks** section naming which tracks these
  features authentically fit (DEI, UT Prosim, UI/UX, Gemini, ElevenLabs,
  Tiger Data, Databricks × Deloitte's campus AI agent, Peraton's
  mission-critical framing) and which were deliberately skipped, with
  reasons (Solana and Presage have no honest fit; MongoDB Atlas would
  duplicate Tiger Data for the same table; the GoDaddy domain purchase and
  HokieAI's public post need the user's own account/action).

## 3. Hitt Hall's ~255m coordinate error, and real VT elevator data (`fecc1d7`)

Checking coordinates against Google Maps led to VT's own public, unauthenticated
Enterprise GIS API (`arcgis-central.gis.vt.edu`) — the backend behind VT's
official interactive campus map.

- **Hitt Hall's stored coordinate was ~255m from its actual location** (a
  Perry Street address interpolation that put it near Whittemore instead of
  next to Derring and Pamplin, where it actually is per VT News, VT
  Facilities' own project page, and VT's GIS building layer). Corrected,
  along with 5 other buildings off by 12–67m (Center for the Arts, Data and
  Decision Sciences, Kelly, Goodwin, Burruss). Confidence upgraded to
  `official` for all 6.
- Hitt's entrances and the 5 path segments touching them were repositioned/
  reconnected — path and POI geometry is stored independently of a
  building's point coordinate, so fixing the centroid alone would have left
  the map showing a building marker ~255m from its own entrances and route
  lines.
- **29 real elevator/chairlift connectors** added from VT Facilities' own
  "Critical Elevators" layer (current open/closed status, not a 2006
  floorplan guess) — including Derring and Pamplin, which had zero connector
  coverage before this. Three single-floor rows with no stated companion
  floor were skipped rather than guessed at.
- Two router bugs this surfaced and fixed:
  - `operational_confidence` was hardcoded to `inferred` for every connector
    regardless of source data — now reads it the same way entrances and
    paths already do.
  - Floor-to-entrance linking assumed floor `"1"` was always a building's
    ground level; real elevator data shows some buildings use `"0"`.
    Generalized to each building's lowest connector-referenced floor.
  - Caught in review (not testable without a live Postgres instance): a
    cursor-lifetime bug in `server/db.py`'s Postgres path where a cursor
    was closed via `with` before its result was fetched.

## 4. Redraw the Hitt/Derring/Pamplin zone from a rider-supplied trace (`26ddb81`)

Even with Hitt's coordinate fixed, the path segments connecting it to Derring
were still an approximate straight line. The user supplied eight annotated
screenshots of real walking directions across this zone (blue dotted for the
stock map-app suggestion, red/yellow hand-drawn for the route actually used).

- **Three buildings added**: New Classroom Building (NCB), Davidson Hall,
  Williams Hall — real origins/destinations in the traced routes that
  weren't in the pilot at all. VT GIS coordinates and footprints,
  `confidence: official`.
- **Hitt/Derring/Pamplin/NCB redrawn** around Derring's real west and south
  footprint edges, matching the traced route. The old north/NE-corner route
  was **not deleted** — still there, just no longer the shortest option.
- **Davidson Hall connects in** via a shortcut behind Hahn Hall South /
  VTSports Lot 13A, instead of the official W Campus Dr loop.
- **Goodwin ↔ D&DS** got a direct Prices Fork Rd segment alongside the
  existing shorter one, matching the rider's noted 1st-floor/2nd-floor
  entrance distinction — recorded in entrance notes only, not promoted to
  `accessibility_status` or `confidence` (a route trace confirms a door
  exists, not what floor it opens onto or whether that matters for a
  wheelchair).
- **The one significant, honest consequence**: the corrected route is short
  enough on its own that Perry Place → Pamplin no longer benefits from
  cutting through `IND-DERRING-1` — indoor and outdoor now converge on the
  same ~189m. The original ~68m saving wasn't wrong, just mis-attributed: it
  belongs to Museum of Geosciences (Derring's own north entrance) → Pamplin,
  which still needs to get around the building. Both outcomes are asserted
  by the test suite. The README's demo flow was updated to use that pair for
  the shortcut demonstration.
- `dist/index.html`'s "16 buildings" pilot badge was hardcoded; it's now
  computed at load time like the rest of the data-driven UI.

## Screenshot routes and closure-free demo — follow-up

- Added seven route variants for the five screenshot pairs, including red DDS
  floor 1 and yellow DDS floor 2. The generic DDS choice defaults to floor 1.
- Preserved Derring/Hitt passages and Hahn/Williams corridors as approximate
  student traces. Screenshot choices now override shortest-path selection.
- Maroon/Orange Loop segments follow saved VT sidewalk geometry with no
  straight-line fallback across the loops.
- Removed closure simulation and disabled closure handling in the planner.
  Kept the Closed legend and original source records.
- Added current-data integration tests; all 30 Node tests pass. Final browser
  QA remains blocked by automatic approval review's usage limit.
- See `reports/STUDENT_ROUTE_IMPLEMENTATION.md` for the current implementation;
  earlier route distances above describe the base graph before these overrides.

## What's still unverified

No physical survey has happened — every accessibility fact in this dataset
(step-free status, door widths, slopes, hours) is still `unknown`/`inferred`
except the 29 real elevator statuses and the 6 corrected coordinates, both
`official`-sourced from VT systems, not a person at the door. A real,
GIS-hosted ADA path network with slope data was found (`facilities/ADA_Routes_Only`,
428 segments in this zone alone) but not integrated — matching it onto this
dataset's paths is a real spatial task with a real failure mode (a wrong
match silently promotes an unrelated segment to `step_free`), and wasn't
attempted under time pressure. See `source-data/DATA_SOURCES.md` and the
README's **VT Enterprise GIS** section for what's there and what it would
still take.
