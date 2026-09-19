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

## What you still need

### 1. VT's accessibility layer — the big one

Virginia Tech already publishes an interactive campus map that does accessible-only
routing, with accessible entrances, lifts and curb cuts as toggleable layers. It
was built by VT Enterprise GIS with the ADA campus accessibility architect.

Start at <https://accessibility.vt.edu/>.

That data is the confirmed tier you are missing. Ask Enterprise GIS or ADA and
Accessibility Services for access to the underlying layer. Worth knowing before a
judge asks: your project overlaps an official tool, so lead with what yours does
that theirs does not — through-building shortcuts, live crowdsourced lift status,
and showing users what is unknown rather than hiding it.

### 2. VT Facilities GIS layers

Basemap, boundary, **building footprints**, 5 ft contours, road centrelines,
parcels. Distributed through the University Libraries geo-data portal, downloadable
by VT students, faculty and staff **from a campus IP**. You qualify.

<https://guides.lib.vt.edu/c.php?g=660137&p=4634742>

Footprints would replace the centroids, and contours would give you real gradients
— the thing that actually determines step-free.

### 3. The lift inventory

Ask Facilities for the elevator asset list and, if it exists, the outage feed
behind their maintenance tickets. Agree the asset ID scheme **before** you load
data. `VT-BURRUSS-ELEV-1` only pays off if it matches what they already call it.

### 4. Your own survey

`SURVEY_PROTOCOL.md`. The only thing on this list you can finish today.

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
