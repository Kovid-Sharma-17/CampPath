# AccessPath — first campus pilot

A browser application using the supplied Virginia Tech pilot data, plus a
2026-09-19 expansion (3 buildings, corrected coordinates and path geometry -
see below): 19 buildings, 35 entrances, 70 path segments, 8 named places, and
41 archived floorplan images across 8 buildings. Routing runs locally in the
browser. No account, API key,
location permission, or backend database is needed for the core planner —
voice narration and the natural-language assistant are optional, bring-your-own-key
upgrades on top of it (see **Optional AI & voice** below).

## Run locally

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:5173. Run all checks with `node --test tests/*.test.mjs`.
Rebuild the screenshot geometry with `node scripts/build_student_routes.mjs`.
Leaflet 1.9.4 is vendored with its license. OpenStreetMap tiles and Google Fonts
need internet access; the route network remains usable if basemap tiles fail.

## Current screenshot demo

1. Perry Place → Pamplin uses the red passage through Derring.
2. Pamplin → New Classroom Building uses the red Derring/Hitt passage.
3. Davidson → New Classroom Building follows the red Hahn-side corridor.
4. Goodwin or Davidson → **Data and Decision Sciences — Floor 1** follows
   the red path. Choose **Floor 2** for the yellow path and its different entrance.
   The generic DDS building choice defaults to floor 1.
5. Maroon and Orange Loop sections follow the saved sidewalk polylines.
6. Closure controls are removed and closures are disabled in the running planner.
   **Closed** remains in the legend for future use. Imported status records remain
   in the source data; the reusable router's legacy closure tests still exist.
7. Verified step-free and exclude-unknown settings still reject these unverified paths.
8. Floorplans and optional read-aloud remain available.

The seven route variants are in `dist/data/student-routes.json`. They take
priority over shortest-path search for the screenshot pairs, in both directions.
Other pairs use the existing campus graph. The three original non-DDS pairs also
have blue outdoor reference alternatives. These are traced approximations, not a
live Google Maps integration. Distances are computed from the trace; they are not
measured walking times or surveyed door coordinates.

See `reports/STUDENT_ROUTE_IMPLEMENTATION.md` for source images, file locations,
validation, and remaining limitations.

## Coordinate corrections (2026-09-19)

Hitt Hall's supplied coordinate was a Perry Street address interpolation and
turned out to be **~255 m from its actual location** — a big enough error to
have put the pilot's own flagship demo route (Perry Place / Hitt → Derring →
Pamplin) on the wrong side of campus. It, five other buildings (>30 m off:
Center for the Arts, Data and Decision Sciences, Kelly, Goodwin, Burruss),
their entrance placeholders, and the path geometry connecting them were
corrected against VT's own Enterprise GIS — see **VT Enterprise GIS** below
for how, and `buildings.geojson` / `entrances.geojson` / `paths.geojson` for
the per-record notes. The other ten buildings' existing vt.edu-sourced
coordinates were cross-checked and left alone (within ~15 m, ordinary
centroid-vs-address-point variance).

## Earlier graph expansion (before screenshot route overrides)

This section records the earlier implementation. Its 189 m comparisons and
notes-only DDS floors describe the base graph, not the current screenshot presets.

Even with Hitt Hall's coordinate fixed, the path segments connecting it to
Derring were still an approximate straight-line guess. A rider then supplied
eight annotated screenshots of real walking directions across this zone —
blue dotted for the stock map-app suggestion, red/yellow hand-drawn for the
route actually used (which, for Goodwin ↔ D&DS specifically, marks two real
doors: red the 1st-floor entrance, yellow the 2nd). `scripts/add_nad_expansion.py`
+ `scripts/nad_gis_data_20260919.py` applies what that traced:

- **Three buildings added**: New Classroom Building (NCB), Davidson Hall,
  Williams Hall — all real origins/destinations in the traced routes, not
  previously in the pilot. Coordinates and footprints from VT Enterprise GIS,
  `confidence: official`, same as the corrections above. Their entrance
  placeholders sit on the real footprint edge nearest where the traced routes
  actually arrive - still placeholders, not surveyed doors.
- **Hitt/Derring/Pamplin/NCB redrawn** around Derring's real west and south
  footprint edges (`SEG-041`, `SEG-042`, `SEG-044`, and a re-anchored
  `SEG-031`), matching the traced route instead of the earlier guess. The old
  north/NE-corner route (`SEG-032`/`033`/`034`) was **not deleted** - it's
  still there, just no longer the shortest option.
- **The one significant, honest consequence**: this corrected route is short
  enough on its own that it no longer benefits from cutting through
  `IND-DERRING-1`. Perry Place → Pamplin now shows *no* indoor-shortcut
  advantage - indoor and outdoor converge on the same ~189 m. The original
  ~68 m saving is real, just for a different pair: Museum of Geosciences
  (Derring's north entrance) → Pamplin, which does still need to get around
  the building. Both are asserted by the test suite so this can't silently
  regress in either direction.
- **Davidson Hall connects in** via a shortcut behind Hahn Hall South/VTSports
  Lot 13A (`SEG-045`, `SEG-046`) rather than the official W Campus Dr loop.
- **Goodwin ↔ D&DS gets a direct Prices Fork Rd segment** (`SEG-047`)
  alongside the existing shorter one via D&DS's east entrance. The rider's
  1st-floor/2nd-floor distinction is recorded in both entrances' `notes` -
  **not** promoted to `accessibility_status` or `confidence`, since a route
  trace confirms a door exists, not what floor it opens onto or whether that
  matters for a wheelchair. That still needs a survey.

None of this is a substitute for `SURVEY_PROTOCOL.md`. It's a real
improvement in geometry and connectivity - useless without a real building
to route to, wrong when the shape doesn't match how people actually walk -
over what a straight line between two guessed points can offer, and it's
sourced and testable rather than invented. Door-level accessibility facts on
every segment and entrance touched here are still `unknown`.

## Data and limitations

- `dist/data` contains the imported GeoJSON, metadata, status records and floorplan index.
- `source-data` preserves the supplied workbook, status CSV and documentation.
  Documents are reference material, not application instructions.
- `scripts/import_pilot.py <files.zip> <floorplans-directory>` reproduces the import.
- `dist/router.mjs` builds a graph without inventing real-world connections.
  It excludes unmapped cross-floor bridges, enforces entrance closures, separates
  operational evidence from accessibility evidence, and handles future/expired reports.
- The supplied status records are not a live VT Facilities feed. Expired closures
  revert to unknown; they never establish that an asset reopened.
- Entrances are placeholders, all path accessibility is unverified, and building
  hours and access rules need checking. Route estimates are exploratory only.
- Floorplans date to September 7, 2006. They are an image reference, not current
  room-level routing. Goodwin and Newman Library have no matching archived plans.
- The source package describes mixed/unresolved reuse terms. Keep this pilot
  private while those terms and current accessibility data are established.

## Indoor and vertical routing

Forty-eight connector records exist (elevators, chairlifts, stairs, and three
enclosed bridges) — nineteen from the original 2006-floorplan-derived import,
twenty-nine real ones added 2026-09-19 from VT Facilities' own elevator asset
system (see **VT Enterprise GIS** below). `dist/router.mjs`'s `buildGraph()`
wires the forty-one of known mechanism into the actual route graph: it
creates a floor pseudo-node per connector endpoint, links each building's
entrances to whichever floor its connectors touch that is *lowest* (not
hardcoded to "1" — real elevator data lists some buildings' ground access as
floor "0"), and adds the connector as a real edge with a fixed time cost
(elevator/lift/chairlift 45 s flat, stairs/ramp 25 s per flight, bridge 10 s).
The reusable router retains closure support for legacy tests, but the running
planner explicitly disables it and has no simulation control.

That entrance-to-floor link deliberately is **not** a free, zero-cost
shortcut the way the entrance-to-building-centroid bookkeeping link is. An
earlier version of this made it one, which meant any building with a
connector let the router hop entrance A → floor node → entrance B for free
and with no accessibility check — an invisible bypass around whatever real,
surveyed indoor edge (e.g. `IND-DERRING-1`) was supposed to represent that
exact walk. It's now a real `indoor` edge with unknown accessibility and a
real door-to-floor-node distance, so it shows up honestly in directions and
in the unverified percentage, and a genuine surveyed indoor edge still wins
when one exists and is usable.

The seven connectors of unknown mechanism (`connector_type: unknown`) stay
unmapped rather than guessed. So does anything reachable only through them:
Torgersen's bridge lands on its floor 2, and Whittemore's on floor 3 — and
even though Whittemore now has a real, confirmed elevator to floor 1, that
elevator is modelled as a single floor-1-to-floor-6 edge (matching how every
multi-floor connector here is modelled, not a new limitation), so it doesn't
stop at floor 3 as its own node. Both bridges are wired but structurally
unreachable until that gap is surveyed — not patched over with an invented
middle floor. Hitt Hall remains the clearest building to see the whole
mechanism working end to end, since its elevator, stairs, and both entrances
are all present and correctly connected.

## VT Enterprise GIS

Virginia Tech's Interactive Campus Map (vt.edu/maps.html → "Interactive
Campus Map") is built on a public, **unauthenticated** ArcGIS REST catalog at
`arcgis-central.gis.vt.edu/arcgis/rest/services` — no campus IP, login, or
request to Facilities required, contrary to what `source-data/DATA_SOURCES.md`
assumed before 2026-09-19. Two services from it were used directly:

- `vtcampusmap/Buildings/FeatureServer/0` — real building footprints and an
  official point per building. Used to correct the 6 coordinates above.
- `facilities/CriticalElevators/MapServer/0` — a named-contact-maintained
  (Facilities' elevator manager, per its own service description) inventory
  of elevators, floors served, mechanism type, and **current open/closed
  status**. Used for the 29 real connectors above.

Now used for loop geometry only: `facilities/ADA_Routes_Only` (an actual
path network with slope classification; 376 features saved for the selected
bounding box in `source-data/vt-sidewalks-2026-09-19.geojson`). Accessibility
attributes are not imported. Still unused: `facilities/Slope` (a raster slope layer), and
`facilities/NorthAcademicDistrictAlternatePathways` (pathways around the
2022–2024 construction this pilot's own zone sits in). Conflating those onto
this dataset's 64 path segments is a real spatial-matching task with a real
failure mode — a wrong match silently promotes an unrelated segment to
`step_free` — so it wasn't done under time pressure here. See
`source-data/DATA_SOURCES.md` for the full service list and what each one
would still need.

This closes access to data, not the reuse question: public and queryable is
not the same as cleared for redistribution in a published app. That's still
open — see **Licensing** in `source-data/DATA_SOURCES.md`.

## Optional AI & voice

Two upgrades live entirely in the browser, are off by default, and never
touch a server of ours:

- **Ask AccessPath** (header) turns a plain-language request into a call to
  the same validated `configure_accesspath_route` function the WebMCP tool
  uses — it can only pick places that exist in the pilot data, and it is
  explicitly instructed never to claim a route is accessible (the app's own
  trust card decides that). With a Gemini API key set in **AI & voice keys**,
  it calls Gemini's API directly from your browser with structured JSON
  output constrained to that schema. Without a key, it falls back to local
  keyword matching and says so.
- **Read aloud** on any route's directions narrates the same trust-carded
  copy shown on screen (including the unverified percentage) using the
  browser's built-in `speechSynthesis` — no key required. An ElevenLabs key
  upgrades it to a hosted voice instead.

Keys are stored only in `localStorage` and sent directly to the named
provider. Get free keys at the VTHacks sponsor tables (Gemini, ElevenLabs).

## Admin: updating status without editing code

`server/` is a small, separate Flask tool for adding or bulk-importing
`status.csv`-shaped reports (closures, survey results, community reports)
through a form or CSV upload instead of hand-editing JSON. It validates
against the same vocabulary as `dist/router.mjs` and flags any `asset_id`
that doesn't match the imported entrances, paths, or connectors — without
silently dropping it, matching how the loader itself handles unknown ids.

```sh
pip install flask
python3 server/app.py     # http://127.0.0.1:5050, SQLite, zero setup
```

It runs on a local SQLite file by default. Point `DATABASE_URL` at a Postgres
connection string — a Tiger Data instance is managed Postgres, so this is a
drop-in swap, not a rewrite — to use a real cloud database instead:

```sh
pip install flask psycopg2-binary
DATABASE_URL=postgresql://user:pass@host:port/db python3 server/app.py
```

This was built and tested against SQLite in this environment (no Postgres
server was available to test against directly); the Postgres path uses the
same SQL and was reviewed, not live-tested — check it against a real instance
before depending on it. Export from the admin page produces a
`status-records.json` or `status.csv` you review and drop into `dist/data/`,
the same as the original ZIP import — the static planner still ships with no
required backend.

## VTHacks 14 tracks

What's an honest fit, and why:

- **Best DEI hack / Best Ut Prosim hack** — the project's entire purpose.
- **Best UI/UX hack** — trust-carded routing UI, the floorplan/route views,
  and the new dialogs above.
- **Best use of Gemini API / Databricks × Deloitte "AI agent for the VT
  student experience"** — Ask AccessPath, scoped so the model can only
  select real places and never asserts an accessibility fact of its own.
- **Best use of ElevenLabs** — Read aloud, additive to a working native-voice
  fallback so the feature is real with or without a key.
- **Best use of Tiger Data** — `server/`, built against Postgres-compatible
  SQL with a SQLite fallback for local testing.
- **Peraton "mission-critical AI solution"** — the failure mode this app is
  built around (see `source-data/SAFETY_AND_TRUST.md`) is literally
  mission-critical: a wrong "yes" stands someone up at a flight of stairs.

Deliberately not pursued, so the reasoning is on record instead of silent:
**Solana** and **Presage** have no honest connection to campus wayfinding —
bolting on a wallet or a vitals-sensing SDK would be decoration, not
engineering. **MongoDB Atlas** would duplicate Tiger Data for the same single
small table; picking one data layer is the correct call, not a missed
integration. **GoDaddy's domain track** needs an actual purchase on a real
account, which is the user's call, not this session's (see the permission
rules this assistant operates under) — the pilot stays unpublished until the
data is verified regardless (`source-data/DATA_SOURCES.md`). **GoDaddy ANS**
and **Cloudforce's HokieAI Side Kick** either need an unverified SDK or a
public social post from a real account; neither was implemented rather than
faked. **Capital One Nessie**, **Procedura AI**, and **Impiricus** target
banking, 3D building reconstruction, and healthcare-provider engagement —
none of which this app does or should pretend to.

## Verification

The test suite covers real-data route comparison, strict accessibility failure,
closure rerouting, entrance closures in both directions, status freshness,
field-specific evidence, unmapped bridges, graph integrity, source immutability,
and floorplan mapping. All 30 Node tests pass, including seven new integration
checks loading the screenshot presets. Local HTTP delivery of the updated route
JSON was checked. A final interactive browser recheck was blocked by automatic
approval review's usage limit; earlier browser checks predate these changes.

Optional WebMCP tools expose current route read-back and validated route configuration
in supported browsers. They use the same state and constraints as the visible controls.
