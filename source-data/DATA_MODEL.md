# Data model

Everything is generated from `data/raw/accesspath-pilot-vt.xlsx`. Edit the
workbook, run `python scripts/build_geojson.py`, commit both.

Coordinates are EPSG:4326 (WGS 84). GeoJSON stores them lon/lat; the workbook
stores them lat/lon in separate columns, because humans read lat first. Distances
are metres.

---

## The graph

Five node kinds, one edge type.

| Node | Id pattern | Where it comes from |
|---|---|---|
| Building centroid | `B:VT-BURRUSS` | generated from `buildings.geojson` |
| Entrance | `N-BURRUSS-E1` | `entrances.geojson` |
| Junction | `J-DF-NW` | appears only as a path endpoint |
| Corner | `J-DERRING-NE` | a junction that exists to make a walk-around honest |
| Floor | `N-BURRUSS-L1` | connector endpoints — **not yet joined to the graph** |

An edge is an edge. An outdoor footway, an indoor cut-through and a lift all
become the same `Edge` object with a different `kind`. One type means the router
has one code path and cannot accidentally treat a lift like a pavement.

Building centroids are handles meaning "somewhere in this building". The router
refuses to pass *through* one mid-route — otherwise the search teleports between
two doors for free and silently skips both the indoor edge and the walk around.
That bug was real; `engine/router.py` guards against it now.

---

## Controlled vocabularies

```
accessibility_status : step_free | stairs | limited | unknown
operational_status   : available | closed  | unknown
connector_type       : elevator  | ramp    | stairs | lift | bridge | unknown
confidence           : official  | field_verified | community_report | inferred
```

`limited` means passable by some wheelchair users but not all — a steep ramp, a
heavy door, a narrow width. It is not a softer `step_free`.

`inferred` means a machine guessed it. Treat it as no data. It is not a weak yes.

---

## Confidence, and the one rule that follows from it

```
display_tier = CONFIRMED  if confidence in {official, field_verified}
               UNKNOWN    otherwise
```

`display_tier` is computed, never typed. It is a formula in the workbook, a
derived property in `engine/graph.py`, and a field in every GeoJSON feature. Three
implementations, one rule. Change `confidence` and the tier follows everywhere.

**Confidence is per field, not per row.** An `Edge` carries `confidence` for its
accessibility claim and `operational_confidence` for its operational claim. This
matters: Facilities reporting "lift closed" is official news about the lift being
closed. It says nothing about whether that lift is step-free when working. An
early version upgraded the whole row and quietly turned a guess into a fact.

---

## Files

### buildings.geojson — Point
`building_id`, `name`, `building_number`, `abbreviation`, `address`,
`year_built`, `new_since_2006`, `coord_source`, `confidence`, `display_tier`,
`floorplan_in_archive`.

The geometry is a centroid, not a footprint. Real footprints are available from
VT Facilities GIS — see `DATA_SOURCES.md`.

**Building number is not a stable key.** VT reuses numbers across demolition and
rebuild. #188 was Shultz Hall in 2006 and is the Center for the Arts today. Key on
`building_id`.

### entrances.geojson — Point
`entrance_id`, `building_id`, `node_id`, `entrance_name`, `accessibility_status`,
`operational_status`, `step_count`, `geometry_precision`, `confidence`.

Every position is currently `placeholder_offset_from_centroid`: a bearing and a
distance guessed from which way the door probably faces. Assume 30–50 m of error.
`geometry_precision` exists so you can tell a surveyed door from a guessed one
after the survey starts.

### paths.geojson — LineString
`segment_id`, `from_node`, `to_node`, `accessibility_status`,
`operational_status`, `surface`, `max_grade_pct`, `width_m`, `is_indoor`,
`open_hours`, `access_control`, `confidence`.

Outdoor segments and indoor cut-throughs share this file because both are
horizontal edges between two nodes. `is_indoor` decides which rules apply.

Three fields only matter for indoor edges, and all three are unfilled:

- `open_hours` — a cut-through through a locked building is worse than a detour.
- `access_control` — `public`, `swipe_required`, `restricted`, `unknown`.
- `surface` — `indoor`.

`max_grade_pct` is the field that ultimately decides step-free, and it is empty
everywhere. ADA tops out at 1:12, about 8.3%. Until this column has numbers,
`step_free` on a path is an opinion.

### connectors.geojson — null geometry
`connector_id`, `building_id`, `from_node`, `to_node`, `connector_type`,
`floors_served`, `accessibility_status`, `operational_status`, `evidence_source`.

Null geometry is deliberate: a lift is a real edge with nothing to draw on a map.

**Wired, with a real gap.** `dist/router.mjs`'s `buildGraph()` creates a floor
pseudo-node per connector endpoint, links each building's floor 1 to its
entrances, and adds the connector itself as a normal `Edge` (`elevator`/`lift`
45 s flat, `stairs`/`ramp` 25 s per flight, `bridge` 10 s — see Costs). A route
can now call an elevator or take stairs if its accessibility and operational
status allow it, and closing one (`status.csv` or the simulator) reroutes around
it like any other asset.

The gap this does not close: floor 1 is the only floor joined to entrances, so a
connector whose lower end is anything else — Torgersen's floor-2 bridge landing,
Whittemore's floor-3 bridge landing with no elevator row of its own — stays
structurally unreachable until the missing floor-to-floor legs are surveyed and
added. That is a missing-data problem, not a routing bug; do not paper over it
with an invented middle floor.

Torgersen's second floor connects to Newman Library's third by an enclosed bridge
over Alumni Mall; Whittemore has third-floor patio bridges to Durham and Hancock.
These three rows used to sit under `lift` as a placeholder — `connector_type` now
has a real `bridge` value, so they were corrected. Add `tunnel` and `escalator`
when you get the chance.

### pois.geojson — Point
`poi_id`, `name`, `aliases`, `building_id`, `node_id`, `floor`, `category`.

This layer exists because people search for venues, not buildings. Perry Place is
a dining hall inside Hitt Hall. Without POIs a user types "Perry Place" and gets
nothing. `aliases` is semicolon-separated in the workbook, a list in GeoJSON.

### status.csv
`asset_id, status, reason, reported_at, expected_end, source, confidence`

Overlays live state on the baseline. An `asset_id` can be a segment, a connector
or an entrance. Rows past `expected_end` are ignored. Unknown ids are reported as
warnings, never silently dropped.

**The `status` column carries two vocabularies and does not say which.** `closed`
is an operational status; `step_free` is an accessibility status. The loader
disambiguates by checking which set the value belongs to, which works only
because the two sets happen not to overlap. Before this grows, split it into
`status_field` + `status_value`.

---

## Costs

```
walking speed     1.15 m/s     conservative, mixed population
lift              45 s         call and ride, flat
stairs / ramp     25 s         per flight
door              5 s          each, so an indoor cut-through pays 10 s
unknown edge     +30 s         soft penalty, so a known route wins a tie
```

Durations are bands, not promises. Wheelchair speeds vary enormously. Never show
one to the second.

---

## Adding a building

1. Add a row to **Buildings**. Get the coordinate from
   `vt.edu/about/locations/buildings/<slug>.html` — VT publishes one per building.
   Mark `confidence` as `official` only if it came from there.
2. Add 2–3 rows to **Entrances**, one per real door.
3. Add rows to **Paths** joining those doors to the network, plus a perimeter link
   between them or the graph will split into components.
4. If you can walk through it, add an indoor row: `is_indoor = yes`.
5. Rebuild, validate, test.

`scripts/validate_data.py` catches disconnected graphs, orphan entrances, bad
vocabulary values, duplicate ids and coordinates outside Blacksburg.
