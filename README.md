# AccessPath — first campus pilot

A browser application using the supplied Virginia Tech pilot data: 16 buildings,
32 entrances, 64 path segments, 8 named places, and 41 archived floorplan images
across 8 buildings. Routing runs locally in the browser. No account, API key,
location permission, or backend database is needed for the core planner —
voice narration and the natural-language assistant are optional, bring-your-own-key
upgrades on top of it (see **Optional AI & voice** below).

## Run locally

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:5173. Run routing and data checks with `node --test tests/*.test.mjs`
(no Node runtime was available in the environment this was built in, so the same
assertions were instead run live against `dist/router.mjs` in a browser — see
`tests/router.test.mjs` for the authoritative suite to run before trusting a change).
Leaflet 1.9.4 is vendored with its license. OpenStreetMap tiles and Google Fonts
need internet access; the route network remains usable if basemap tiles fail.

## First demo

1. Start with Perry Place → Pamplin Hall: approximately 360 m through Derring,
   compared with 428 m outdoors, based on the supplied approximate geometry.
2. Close the Derring shortcut using the simulation control. The preview reroutes.
3. Turn on **Require verified step-free**. The app correctly returns no route
   because none of the supplied path accessibility has been verified.
4. Switch the simulation to **Hitt Hall · elevator · floors 01-03** and close it.
   Hitt's elevator and stairs are wired into the actual route graph (not just
   displayed), so this is a real closure with a real effect on any route that
   depends on it — unlike most other buildings' connectors, which stay
   unmapped until their mechanism is confirmed (see **Indoor and vertical
   routing** below).
5. Open **Floorplans** → Torgersen Hall. View floors 1–3 and the penthouse sheet.
6. Open **Ask AccessPath** and type something like "get from Perry Place to
   Pamplin Hall avoiding stairs." Without a Gemini key it falls back to
   keyword matching and says so; with one, Gemini only ever picks places from
   the pilot's own list and never claims a route is accessible — the app's
   data decides that, not the model.
7. Click **Read aloud** on any route's directions. Works with no setup via the
   browser's built-in voice; add an ElevenLabs key in **AI & voice keys** for
   higher-quality narration.
8. Open **About the data** for imported status dates and coverage limitations.

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

Nineteen connector records exist (elevators, stairs, and three enclosed
bridges). `dist/router.mjs`'s `buildGraph()` now wires the twelve with a known
mechanism into the actual route graph: it creates a floor pseudo-node per
connector endpoint, links each building's floor 1 to its entrances, and adds
the connector as a real edge with a fixed time cost (elevator/lift 45 s flat,
stairs/ramp 25 s per flight, bridge 10 s). Closing one — from `status.csv` or
the simulation control — now reroutes anything that depends on it, the same
as closing an outdoor path.

The seven connectors of unknown mechanism (`connector_type: unknown`) stay
unmapped rather than guessed. So does anything reachable only through them:
Torgersen's bridge lands on its floor 2, and Whittemore's on floor 3, and
neither building has a surveyed floor-1 link to get there, so those bridges
are wired but structurally unreachable until that gap is surveyed — not
patched over with an invented middle floor. Hitt Hall is the one building
where floor 1, its elevator, and its stairs are all present, so it is the
clearest place to see this working end to end.

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
and floorplan mapping. Browser checks cover the main controls and floorplan viewer.

Optional WebMCP tools expose current route read-back and validated route configuration
in supported browsers. They use the same state and constraints as the visible controls.
