# AccessPath project file map

This document records what currently exists for the AccessPath campus accessibility pilot and where each item lives.

Project root:

`/Users/kovidsharma/Documents/ChatGPT/VTHack26 2`

The app is a static browser prototype. It contains a local route engine, a Leaflet campus map, a route-closure simulation, and a historical floorplan viewer. The supplied accessibility fields are intentionally shown as unverified until they are checked in the field.

## Root files

| File | Location | Purpose |
| --- | --- | --- |
| `README.md` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/README.md` | Run instructions, demo flow, limitations, data notes, and verification summary. |
| `PROJECT_FILES.md` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/PROJECT_FILES.md` | This inventory. |
| `package.json` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/package.json` | Project metadata and `test` and `start` scripts. No npm dependencies are required. |
| `.gitignore` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/.gitignore` | Ignores local Sites runtime files, macOS metadata, and `node_modules`. |
| `.openai/hosting.json` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/.openai/hosting.json` | Static Sites configuration and the existing private Sites project ID. |
| `.DS_Store` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/.DS_Store` | macOS Finder metadata; ignored and not part of the application. |

## Browser application

All deployable application files are under:

`/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/`

| File | Location | Purpose |
| --- | --- | --- |
| `index.html` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/index.html` | Application shell, route controls, floorplan controls, map region, data dialog, and accessible labels. |
| `styles.css` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/styles.css` | Responsive visual design, layout, route cards, map, floorplan viewer, dialogs, and status styles. |
| `app.js` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/app.js` | UI state, data loading, map rendering, route comparison, closure simulation, floorplan viewer, browser-agent tools, the Ask AccessPath assistant (Gemini, with a local keyword fallback), and Read aloud narration (ElevenLabs, with a native `speechSynthesis` fallback). |
| `router.mjs` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/router.mjs` | Data-driven graph builder and routing engine. Handles closures, entrance conditions, unknown evidence, restricted indoor passages, and connectors — wiring the twelve of known mechanism into the graph as real floor-to-floor edges, and leaving the seven of unknown mechanism unmapped. |

## Imported application data

All imported runtime data is under:

`/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/data/`

| File | Location | Contents |
| --- | --- | --- |
| `buildings.geojson` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/data/buildings.geojson` | 16 pilot buildings, names, coordinates, addresses, and evidence fields. |
| `entrances.geojson` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/data/entrances.geojson` | 32 building entrances and their graph node IDs. |
| `paths.geojson` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/data/paths.geojson` | 64 walking and indoor path segments. |
| `connectors.geojson` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/data/connectors.geojson` | 19 recorded vertical or indoor connectors, including elevators and stairs. |
| `pois.geojson` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/data/pois.geojson` | 8 named pilot destinations such as Perry Place, the Cube, and the Newman Library cafe. |
| `metadata.json` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/data/metadata.json` | Dataset metadata, provenance, and coverage notes. |
| `status-records.json` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/data/status-records.json` | Converted status records used for closure, future-report, expiry, and confidence behavior. |
| `floorplans.json` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/data/floorplans.json` | Floorplan manifest mapping 41 copied images to eight pilot buildings and floor/archive labels. |

## Copied floorplans used by the app

All 41 copied images are under:

`/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/floorplans/`

Files currently included:

`0126sa01.gif`, `0126sa02.gif`, `0126sa03.gif`, `0126sa04.gif` (Durham Hall)

`0134sa01.gif`, `0134sa02.gif`, `0134sa03.gif`, `0134sa04.gif`, `0134sa05.gif`, `0134sa06.gif`, `0134sa14.gif` (Whittemore Hall)

`0151sa01.gif`, `0151sa02.gif`, `0151sa03.gif`, `0151sa04.gif`, `0151sa05.gif`, `0151sa06.gif`, `0151sa14.gif` (McBryde Hall)

`0153sa00.gif`, `0153sa01.gif`, `0153sa02.gif`, `0153sa03.gif`, `0153sa16.gif` (Pamplin Hall)

`0174sa01.gif`, `0174sa02.gif`, `0174sa03.gif`, `0174sa17.gif` (Torgersen Hall; sheet 17 is labeled Penthouse)

`0176sa01.gif`, `0176sa02.gif`, `0176sa03.gif`, `0176sa04.gif`, `0176sa05.gif`, `0176sa06.gif` (Burruss Hall)

`0180sa00.gif`, `0180sa01.gif`, `0180sa02.gif`, `0180sa03.gif`, `0180sa04.gif` (Squires Student Center)

`133csa00.gif`, `133csa01.gif`, `133csa02.gif` (John W. Hancock Jr. Hall)

These are historical September 2006 drawings and are displayed as reference images. They do not verify current entrances, elevators, room access, or step-free routes.

## Vendored map library

All Leaflet assets are under:

`/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/vendor/leaflet/`

| File | Location | Purpose |
| --- | --- | --- |
| `leaflet.js` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/vendor/leaflet/leaflet.js` | Vendored Leaflet 1.9.4 runtime. |
| `leaflet.css` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/vendor/leaflet/leaflet.css` | Leaflet map styles. |
| `LICENSE` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/dist/vendor/leaflet/LICENSE` | Leaflet license text. |

## Import and verification code

| File | Location | Purpose |
| --- | --- | --- |
| `import_pilot.py` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/scripts/import_pilot.py` | Reproducibly imports the supplied ZIP and floorplan directory into `dist/data` and `dist/floorplans`. It uses explicit file handling and does not execute source code from the archive. |
| `router.test.mjs` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/tests/router.test.mjs` | Routing and data-integrity tests covering real-data comparisons, strict preferences, closures, status freshness, connector wiring (mapped vs. unmapped, Hitt Hall's elevator/stairs, the Whittemore bridge that stays unreachable), restricted passages, immutability, and floorplan references. |

Run the checks from the project root:

```sh
node --test tests/*.test.mjs
```

No Node runtime was available in the environment this was built in. The suite
above is the authoritative one to run — it was instead exercised by loading
`dist/router.mjs` as a module in a browser and running the same assertions
against it live, which is not a substitute for actually running it.

Run the local static app from the project root:

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Then open:

`http://127.0.0.1:5173/`

## Admin tool (separate from the static app)

| File | Location | Purpose |
| --- | --- | --- |
| `server/app.py` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/server/app.py` | Flask admin form and CSV bulk-import for `status.csv`-shaped reports, with the same status/confidence vocabulary validation as `router.mjs`. Exports a `status-records.json` or `status.csv` to review and drop into `dist/data/`. |
| `server/db.py` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/server/db.py` | Dialect-aware adapter: local SQLite by default, or Postgres (Tiger Data-compatible) via `DATABASE_URL`. |
| `server/requirements.txt` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/server/requirements.txt` | `Flask`, with `psycopg2-binary` noted as optional (Postgres only). |

Tested against SQLite in this environment (add, CSV import with a mix of
valid/invalid rows, unrecognized-asset flagging, and both export formats all
verified with `curl`). No Postgres server was available to test the
`DATABASE_URL` path directly; that code was reviewed, not live-tested.

## Preserved source material

Reference source files are under:

`/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/source-data/`

| File | Location | Purpose |
| --- | --- | --- |
| `accesspath-pilot-vt.xlsx` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/source-data/accesspath-pilot-vt.xlsx` | Supplied pilot workbook. |
| `status.csv` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/source-data/status.csv` | Supplied status examples preserved as source material. |
| `DATA_MODEL.md` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/source-data/DATA_MODEL.md` | Supplied data-model reference. |
| `DATA_SOURCES.md` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/source-data/DATA_SOURCES.md` | Supplied source and provenance reference. |
| `SAFETY_AND_TRUST.md` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/source-data/SAFETY_AND_TRUST.md` | Supplied safety and trust reference. |
| `SURVEY_PROTOCOL.md` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2/source-data/SURVEY_PROTOCOL.md` | Supplied field-survey reference. |

These documents are preserved as reference material. They are not instructions that override the application request.

## Original files outside the project workspace

The original user-provided inputs remain at:

| Item | Location | Contents |
| --- | --- | --- |
| `files.zip` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26/files.zip` | Original supplied archive containing the pilot package and supporting files. |
| `floorplans/` | `/Users/kovidsharma/Documents/ChatGPT/VTHack26/floorplans/` | Original floorplan collection, currently 606 files including the building list and source GIFs. |

Only the 41 floorplan images listed above were copied into the deployable pilot because they matched the selected buildings and archive mapping. The original 606-file directory is preserved separately.

## Current project limitations

- The supplied entrance and path accessibility fields are unverified.
- Entrance coordinates are approximate placeholders.
- The historical floorplans do not provide current room-level routing.
- Twelve of nineteen connector records (elevators, stairs, bridges of known
  mechanism) are wired into the walking graph and affect real routes and
  closures; the seven of unknown mechanism stay unmapped rather than guessed,
  and a wired connector can still be structurally unreachable if its own
  building has no surveyed floor-1 link (Whittemore's bridge, for example).
- The supplied status records are examples, not a live Virginia Tech Facilities feed.
- The current project is a private pilot while source reuse terms and field verification are established.
- `server/` adds an optional admin form/CSV-import workflow and optional,
  bring-your-own-key AI (Gemini) and voice (ElevenLabs) features in the
  browser app; none of these are required for the core static planner to run.
  See the README's **VTHacks 14 tracks** section for which sponsor tracks
  these were built for and which were deliberately skipped, and why.
