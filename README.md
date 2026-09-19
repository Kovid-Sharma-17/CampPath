# AccessPath — first campus pilot

A browser application using the supplied Virginia Tech pilot data: 16 buildings,
32 entrances, 64 path segments, 8 named places, and 41 archived floorplan images
across 8 buildings. Routing runs locally in the browser. No account, API key,
location permission, or backend database is needed.

## Run locally

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:5173. Run routing and data checks with `node --test tests/*.test.mjs`.
Leaflet 1.9.4 is vendored with its license. OpenStreetMap tiles and Google Fonts
need internet access; the route network remains usable if basemap tiles fail.

## First demo

1. Start with Perry Place → Pamplin Hall: approximately 360 m through Derring,
   compared with 428 m outdoors, based on the supplied approximate geometry.
2. Close the Derring shortcut using the simulation control. The preview reroutes.
3. Turn on **Require verified step-free**. The app correctly returns no route
   because none of the supplied path accessibility has been verified.
4. Open **Floorplans** → Torgersen Hall. View floors 1–3 and the penthouse sheet.
5. Open **About the data** for imported status dates and coverage limitations.

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
- Nineteen connector records include five elevators; none is connected to the
  walking network. Simulating an elevator closure therefore does not reroute
  outdoor paths. Connect verified floor/entrance nodes before adding that behavior.
- The source package describes mixed/unresolved reuse terms. Keep this pilot
  private while those terms and current accessibility data are established.

## Verification

The test suite covers real-data route comparison, strict accessibility failure,
closure rerouting, entrance closures in both directions, status freshness,
field-specific evidence, unmapped bridges, graph integrity, source immutability,
and floorplan mapping. Browser checks cover the main controls and floorplan viewer.

Optional WebMCP tools expose current route read-back and validated route configuration
in supported browsers. They use the same state and constraints as the visible controls.
