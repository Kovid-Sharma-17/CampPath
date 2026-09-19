# Data sources

## What each value came from

| Source | Gives | Reliability |
|---|---|---|
| `vt.edu/about/locations/buildings/*` | Official name, number, abbreviation, address, grid and **coordinates** | High — the only real geometry here |
| VT Blacksburg Campus Map, 2 July 2025 | The authoritative current building list; caught the renames | High |
| VT Facilities capital construction pages | Hitt Hall, D&DS, Mitchell Hall, USLB; ADA-compliance statements; the Infinite Loop | High |
| CDCD floorplan mirror, 7 Sept 2006 | 603 floorplan GIFs, 252 buildings — where the elevator and stair rows came from | Low, 20 years stale, no licence |
| VT 2007 campus map (in the same archive) | Grid references only | Low |
| Gobblerpedia | Whittemore's third-floor bridges | Low — community wiki |

Everything derived from the 2006 archive is `inferred`. A lift that existed in
2006 may not exist now, and the plan never said whether the cab fits a wheelchair.

## Found, 2026-09-19: VT's Enterprise GIS is publicly queryable, no request needed

This whole section used to say "ask Enterprise GIS for access." That was wrong.
Virginia Tech's Interactive Campus Map (<https://www.vt.edu/maps.html> →
"Interactive Campus Map" → `campusmap.aws.gis.cloud.vt.edu`) is an Esri app
that itself calls a plain, unauthenticated ArcGIS REST catalog at
`https://arcgis-central.gis.vt.edu/arcgis/rest/services`. Anyone can query it
directly with `fetch()` — that's how the fixes and additions below were made.
The relevant services (all under the `facilities` and `vtcampusmap` folders):

| Service | Gives | Used here |
|---|---|---|
| `vtcampusmap/Buildings/FeatureServer/0` | Real building footprints, an official lat/lon point, `yrbuilt`, `status` | Corrected 6 building coordinates, one by 255 m (Hitt Hall) |
| `facilities/CriticalElevators/MapServer/0` | Named-contact-maintained elevator inventory: `elevator_id`, floors served, type (Passenger/Freight/Chair Lift/medical), and **current open/closed status** | Added 29 real elevator/chairlift connectors, `confidence: official` |
| `facilities/ADA_Routes_Only/FeatureServer/0` | An actual ADA-specific path network, with `slopelessthan5` / `slopebtwn5and833` fields — the graded, ADA-checked data `SURVEY_PROTOCOL.md` says a path needs | **Not yet used.** 428 segments intersect the pilot zone alone. Conflating them onto this dataset's 64 path segments is a real spatial-matching task with real failure modes — a wrong match silently promotes an unrelated segment to `step_free`. Do it carefully, check each match by hand, and cite `objectid` per segment; don't automate the merge blind. |
| `facilities/Slope/MapServer/0` | Raster slope layer | Not yet used; would need an `identify` call per path segment |
| `facilities/NorthAcademicDistrictAlternatePathways/FeatureServer/0` | "Alternate pathways around multiple construction projects in the North Academic District 2022-2024... both ADA and other pathways" — literally this pilot's zone during the Hitt Hall build | Not yet used; worth checking against the Perry Place / Hitt / Derring / Pamplin route specifically |
| `facilities/Construction_Closures`, `Road_Closures_new` | Live-ish closure layers | Not yet used; a real replacement for the illustrative rows in `status.csv` |

`accessibility.vt.edu` (the original lead in this section) redirected to a 404
when checked; the map above is the tool it presumably used to point to.

None of this closes the licensing question in the section below — "queryable
without a login" is not the same as "cleared for redistribution in a public
app." Keep citing `arcgis-central.gis.vt.edu` per record, and get an explicit
answer on reuse terms before this pilot goes from private to published.

### The lift inventory's asset IDs

This was flagged as something to agree with Facilities before loading data,
so it would match what they already call things: it does. `CriticalElevators`
already uses an `elevator_id` like `00153-ELEV-HYD-0001` (building 0153 =
Pamplin Hall, hydraulic unit 1) — that scheme was used directly as this
dataset's `connector_id` for every row pulled from it, rather than inventing
a parallel `VT-*-ELEV-*` name for the same physical elevator.

### Your own survey

`SURVEY_PROTOCOL.md` still stands for everything a GIS layer can't answer:
door width, whether it opens seated, and anything about *this specific hour*.
A "Reported as Functional" elevator status from Facilities is a stronger
signal than a 2006 floorplan, but it is Facilities' word, not a person at the
door — keep it at `official`, not `field_verified`.

## Floorplans: don't bother

There is no public source for VT floorplans. The 2006 mirror was a one-off scrape
and the original site is gone; current plans go through `vtspacemgmt@vt.edu` and
are not published.

They would not solve your problem anyway. A floorplan shows you a door. It does
not tell you whether that door has a step, a 1:12 ramp or a 40 mm lip. Step-free
status is a survey attribute, not a drawing attribute.

## Licensing

Unresolved, and you should resolve it before publishing.

- VT-published coordinates and maps: Virginia Tech's. Fine to cite; ask before redistributing.
- The 2006 floorplan mirror: **no established licence.** A third party scraped it.
  Do not redistribute the GIFs. Facts derived from them — "Burruss had a lift in
  2006" — are a different matter, but keep the citation.
- Your own survey data: yours. Consider contributing it back to VT or to
  OpenStreetMap, which has `wheelchair=*`, `entrance=*`, `incline=*` and `kerb=*`
  tags for exactly this, under ODbL.

If you open-source the repo, ship the code and your survey data, not the archive.
