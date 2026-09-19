# AccessPath VT — handoff to ChatGPT

This covers only the last 2–3 turns of a much longer session with Claude. Project
background: **AccessPath** is a browser-based, no-build-step accessibility route
planner for Virginia Tech's Blacksburg campus (static HTML/JS/GeoJSON, no backend
required). It went from "trust nothing without evidence" data hygiene, to a working
route/entrance editor, to a campus-wide building sweep — that last step is where
Claude hit a hard technical wall, which is why this handoff exists.

Repo root: `/Users/kovidsharma/Documents/ChatGPT/VTHack26 2`

## 1. What the project actually is, in brief

- All app code/data lives in `dist/` and is served as static files —
  `python3 -m http.server 5173 --directory dist`, no npm/node build.
- Routing engine: `dist/router.mjs`. Builds a graph from GeoJSON in `dist/data/`
  (`buildings.geojson`, `entrances.geojson`, `paths.geojson`, `connectors.geojson`)
  and runs Dijkstra (`findRoute`/`compareRoutes`).
- Core data-honesty rule the whole project follows: every accessibility fact
  (`accessibility_status`, `confidence`) defaults to `unknown`/`inferred` unless
  it's been physically surveyed or comes from an authoritative source (VT's own
  Enterprise GIS). Nothing gets silently upgraded to "confirmed."
- **Confidence vocabulary**: `official | field_verified | community_report | inferred`.

## 2. What happened in the last three prompts

### Prompt N-2: "create a prompt using this info" (a rambling voice-memo roadmap)
The user dictated a 4-phase plan and Claude turned it into a structured spec:

1. **Phase 1** — source real walking routes from Google Maps, load them as a
   connected sidewalk network, build/extend a **route editor** to add/edit/delete
   routes and drag points.
2. **Phase 2** — add live GPS.
3. **Phase 3** — mark stairs in the route editor (start/end of a staircase) and
   auto-generate a step-free alternate for just that section.
4. **Phase 4** — wire in Gemini as the in-app assistant (this one turned out to
   already be ~done — see §4).

Claude flagged two things in the dictation it refused to guess on rather than
silently interpreting: an unclear "CID" reference (confirmed by the user to be
the Creativity and Innovation District, a real dorm) and an ambiguous scope
rule about which buildings count as "campus."

### Prompt N-1: scope clarification + "now do these tasks"
The user answered three blocking questions Claude asked before writing any more
code (see the full transcript for exact wording), which resolved to:

- **Building scope**: keep all near-campus buildings (dorms, stadiums, rec
  fields, Steger Hall, etc.) as markers; only prune buildings that are
  genuinely far away and unrealistic for students to walk to (the airport was
  the explicit example).
- **Route scope**: Phase 1 should build a *connected sidewalk network*
  (junctions + segments), not a manually-traced route for every building pair
  — once a network exists, Dijkstra already routes between any two buildings
  automatically. (462 buildings × pairs is ~106,000 — not something to hand-trace.)
- **Route sourcing**: Claude should browse Google/Apple Maps itself from now on,
  instead of the user supplying screenshots every time.

"Johnson Center" (from an earlier voice memo, used as the worked example for
stair-marking — "the elevators next to the Johnson Center... three flights of
stairs... or two elevators") was resolved by Claude finding a real building
named **Johnson Hall** 710m from the pilot core and treating that as the match.
**This was Claude's inference, not something the user explicitly confirmed** —
double-check before relying on it for the stair-marking work.

### Prompt N (most recent before this handoff): execution
Claude actually did the building-scope work, then hit a wall on the route-network
work. Concretely:

- **Pruned the building list**: 462 → **350 buildings**. Method: geodesic
  distance from the centroid of the 19 hand-curated pilot buildings; kept
  everything ≤2000m (this radius was picked because it's the natural gap in the
  data — every `Athletic`-category building including Lane Stadium, Cassell
  Coliseum, and the rec fields tops out at 1996m, every dorm tops out at 1507m,
  and the nearest airport building starts at 2308m). Removed 112 buildings:
  the airport, and agricultural research-farm buildings (turfgrass/equine/sheep/
  swine barns) and utility substations that only appear because they share VT's
  GIS ownership tag, not because they're part of campus life.
- **Verified** the router still builds cleanly against the pruned 350-building set
  (checked in a real browser via `buildGraph`, no console errors, `pilot-counts`
  UI badge updates correctly).
- **Tried to source real route geometry from Google Maps** for a test pair
  (Cochrane Hall → Johnson Hall) — this is where it broke down. See §3.

## 3. What Claude could NOT do (be specific with ChatGPT about this)

**The core blocker: no reliable way to extract a real coordinate polyline for a
walking route.**

1. **Google Maps' own route geometry is inaccessible.** Claude can open Google
   Maps in a browser tool, search directions, and read the *textual* summary
   (distance, duration, street names like "via Washington St SW" or "via Ag-Quad
   Ln", alternate route options) — that part works fine. But the actual route
   line is delivered through an obfuscated internal API
   (`maps/_/MapsWizUi/data/batchexecute?rpcids=...`, deeply nested
   protobuf-like `pb=` params) with no documented, stable way to decode it.
   Clicking "Preview" launches a 3D aerial flyover, not a usable flat polyline
   view either.
2. **The natural fallback — OpenStreetMap's Overpass API — is unreachable from
   Claude's sandboxed network.** Tried both `overpass-api.de` and
   `overpass.kumi.systems`; both attempts either returned `406 Not Acceptable`
   or timed out completely (120s, killed). This is almost certainly a network
   egress restriction specific to Claude's execution environment, not a problem
   with the query or the service itself.
3. **What *did* work this whole session**: VT's own public, unauthenticated
   Enterprise GIS REST API (`arcgis-central.gis.vt.edu/arcgis/rest/services/...`)
   — that's how all 350 building coordinates and the 29 real elevator connectors
   got sourced. It's a `curl`-able JSON API, no auth, no network restriction hit.
   It has building *footprints* (polygons) but not a pedestrian path/sidewalk
   network as far as has been explored.
4. **The remaining viable method** (proven earlier in the session, works but is
   slow): screenshot Google Maps' flat 2D view with a route drawn on it, then
   manually triangulate coordinates against real buildings whose GPS position is
   already verified in `dist/data/buildings.geojson` (there are 350 of these
   now, so anchor points are dense almost everywhere on campus). This is exactly
   how the original pilot's Hitt/Derring/Pamplin cluster and several other
   routes were built, from the user's own annotated phone screenshots. It works,
   but it's manual, per-segment, and doesn't scale to "the whole residential
   side of campus" in any reasonable time.

## 4. What's expected of ChatGPT

The user wants ChatGPT to pick up the **route-network sourcing problem**
specifically — i.e., get real, usable walking-path coordinate data for the
near-campus buildings that don't have one yet, ideally without hitting the same
walls Claude did. Concretely, try (roughly in order of preference):

1. **A working Google Maps Directions/Routes API integration** — if ChatGPT has
   access to an actual Maps API key/tool (not just browsing the consumer web
   app), that returns a clean encoded polyline or step-by-step lat/lng, which is
   exactly what's needed and sidesteps the obfuscation problem entirely.
2. **OpenStreetMap Overpass API**, if ChatGPT's environment has outbound network
   access that Claude's didn't. Example query for a street/way by name near VT:
   ```
   [out:json][timeout:25];
   way["highway"]["name"~"Ag-Quad",i](37.220,-80.430,37.228,-80.418);
   out geom;
   ```
   `out geom;` returns full node-by-node lat/lng for each way, which is exactly
   the shape needed. VT's core campus bounding box is roughly
   `(37.220, -80.430, 37.235, -80.415)` (south, west, north, east).
3. **If ChatGPT also can't get clean geometry**, the fallback is the same
   screenshot-triangulation method described in §3.4 — at minimum, produce the
   *sequence of streets/paths* Google Maps suggests for a given building pair, so
   a human (or Claude, later) can triangulate faster than starting from scratch.

### Output format ChatGPT should produce

Whatever method works, the useful output is one of:

**A. Direct CLI commands** (preferred — these run straight against the repo):
```bash
python3 scripts/add_route.py --from N-COCHRANE-HALL-E1 --to N-JOHNSON-HALL-E1 \
  --coords "-80.4222,37.2265 -80.4219,37.2258 ..." \
  --notes "Traced from Google Maps walking directions, not field-verified."
```
- `--from`/`--to` must be existing node ids — either an entrance (`N-<BUILDING>-E<n>`,
  only 35 buildings have these so far) or a junction id you're introducing.
- `--coords` is space-separated `lng,lat` pairs (note the order — GeoJSON, not
  the usual lat,lng).
- Every route defaults to `accessibility_status=unknown, confidence=inferred` —
  leave it that way unless there's a real survey behind it. There's also
  `--accessibility-status`, `--confidence`, `--indoor` flags — see
  `scripts/add_route.py --help`.
- For a building with no entrance yet:
  ```bash
  python3 scripts/add_entrance.py --building VT-COCHRANE-HALL \
    --name "Main entrance" --coords=-80.4222,37.2265
  ```
  (Use `--coords=` with an equals sign — a single point starts with `-` and has
  no space, which plain `--coords -80.4,37.2` makes argparse misread as another
  flag.)

**B. Raw structured data** (JSON/CSV of `{from_building, to_building, points:
[[lng,lat], ...]}`) if running the CLI directly isn't practical — Claude (or the
user) can convert this into the commands above.

### Things ChatGPT should NOT do
- Don't upgrade `accessibility_status` or `confidence` above `unknown`/`inferred`
  for anything sourced from Maps browsing — that's explicitly reserved for a
  real physical survey or an authoritative source like VT's GIS.
- Don't invent building names or coordinates — cross-check against
  `dist/data/buildings.geojson` (350 real entries, VT Enterprise GIS-sourced)
  before assuming a name/spelling.
- Don't try to route to the 112 pruned buildings (airport, remote research
  farms) — that exclusion was intentional, see §2.

## 5. Not yet started (queued behind the network-sourcing problem)

These were the other roadmap items from prompt N-2 — untouched so far, waiting
on the network question above since the stair-marking feature specifically needs
to hook into however new route segments get created:

- Route editor (`dist/route-editor.html` / `.js`) currently supports: draw a new
  route (start → end → trace points → queue → copy commands). Still needs:
  **delete** an existing segment, **edit/drag** an existing segment's points,
  and a **mark stairs** mode (pick a start/end point along a route, generate a
  step-free alternate for just that span).
- GPS / live location — not started.
- Gemini API — this is actually **already wired up** (`dist/app.js`, "Ask
  AccessPath" panel, bring-your-own-key pattern, calls
  `generativelanguage.googleapis.com` directly from the browser). Confirm with
  the user whether this satisfies Phase 4 or whether they want something more.

## 6. Current repo state (uncommitted)

```
 M PROJECT_FILES.md
 M README.md
 M dist/data/buildings.geojson
 M dist/data/paths.geojson
 M dist/index.html
 M dist/styles.css
?? dist/route-editor.html
?? dist/route-editor.js
?? scripts/add_all_campus_buildings.py
?? scripts/add_entrance.py
?? scripts/add_route.py
?? scripts/prune_remote_buildings.py
?? scripts/vt_gis_all_buildings_20260919.py
?? scripts/vt_gis_all_buildings_20260919.raw.json
```
Nothing has been committed since `6aa1f00`. Current data: 350 buildings, 35
entrances, 91 path segments.
