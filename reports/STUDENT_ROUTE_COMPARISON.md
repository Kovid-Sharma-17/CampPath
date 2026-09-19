# Student route comparison — 19 September 2026

## Result

The updated application runs, and all 23 existing routing tests pass. Its current routes do **not yet faithfully reproduce the supplied student paths**. Several new connections are straight lines between selected building corners, and some existing lines still use old endpoint coordinates. The DDS destination floor is not part of route selection.

This is an evaluation of the current implementation against the user's annotated screenshots, not a physical survey. No routing code or application data was changed during this audit. Added artifacts are this report, the diagnostic output, and the read-only audit script.

## Evidence and method

- Read `CHANGELOG.md`, the current routing engine, migration scripts, data files, and tests.
- Ran `node --test tests/router.test.mjs`: **23 passed, 0 failed**.
- Reloaded the running application at `http://127.0.0.1:5173/` and exercised all five distinct origin/destination pairs. The page showed the updated 19-building dataset and the AI/voice controls.
- Read the displayed route distances, estimates, directions, and selected entrance; inspected each route on the map. No browser console errors were reported during this pass.
- Executed the same route engine directly to record segment IDs and coordinates. The repeatable script uses a fixed status timestamp of `2026-09-19T16:00:00Z`.
- Compared shared path endpoints and entrance coordinates for geometric continuity.
- Sampled selected outdoor lines against locally saved, simplified building footprint rings from `scripts/nad_gis_data_20260919.py`. This flags likely building crossings; it does not replace exact polygons or field checking.

### Screenshot interpretation

Blue dotted lines are the Google Maps recommendations **as identified by the user**. Red lines are student paths, and yellow lines are alternatives. For DDS destinations, **red means arrival on floor 1; yellow means arrival on floor 2**. Those are different destination requirements, not interchangeable shortest-path options.

The two IMG_3109 files show the same Perry Place → Pamplin example, leaving five distinct journeys. Some hand-drawn lines are interrupted or obscured by map panels, so comparisons are qualitative. No exact student-route distances or savings were inferred from those images.

## Route-by-route comparison

All five cases currently return the same path under “Indoor shortcuts” and “Outdoor only.” Every selected segment in these five outputs is marked outdoor.

| Journey | Current browser result | Comparison with student trace |
| --- | --- | --- |
| Perry Place → Pamplin | **189 m; 3–5 min**. SEG-031 → 041 → 042 → 035. | **Mismatch.** Goes around the southwest end of Derring rather than following the red crossing toward Pamplin, which appears to pass through Derring. The starting entrance is also a footprint-corner placeholder and does not reproduce the drawn red start. “No indoor shortcut advantage” is an outcome of this graph, not proof that the student shortcut has no advantage. |
| Pamplin → NCB | **261 m; 4–6 min**. SEG-035 → 042 → 041 → 044. | **Mismatch.** Your red route heads through the Derring/Hitt area before approaching NCB. The application instead selects the southwest wrap-around. SEG-044 is a straight diagonal that intersects Hitt's saved footprint, despite being marked outdoor. |
| Davidson → NCB | **355 m; 5–7 min**. SEG-045 → 046 → 041 → 044. | **Partial corridor match.** Uses the Hahn-side corridor rather than the West Campus Drive loop. It omits the bends and entrances in the red trace. SEG-045 crosses Davidson's saved footprint; SEG-046 crosses Hahn South's. The south-corner origin is also different from the apparent student departure point on the screenshot. |
| Goodwin → DDS | **127 m; 2–4 min**, arriving at DDS E2. SEG-021 → 022. | **Floor distinction missing.** The graph chooses the entrance described in notes as floor 2, even if the intended destination is floor 1. A separate E1 edge exists, but the UI has no floor/entrance destination selector. Existing path lines do not meet the updated Goodwin/DDS entrance markers. |
| Davidson → DDS | **662 m; 10–12 min**, arriving at DDS E1. SEG-045 → 046 → 041 → 031 → 024 → 023. | **Mismatch.** Starts along the Hahn-side route and then uses a long Hitt-to-DDS diagonal. It misses the Williams/Pamplin-side approach and the red/yellow divergence shown in the screenshot. Williams has a building and entrance record but no connected walking path: Davidson → Williams returns no route. Floor 2 cannot be selected in the UI. |

These are the app's current estimates, not validated walking distances. Comparing its estimates directly with the screenshots' Google times would be misleading because the entrances, geometry, floors, and timing assumptions differ.

## DDS floor-specific diagnostic

To isolate the floor issue, the audit exposed the existing DDS entrance nodes as destinations **only in memory**, without changing app files. It used the existing notes' mapping of E1 to floor 1 and E2 to floor 2.

| Origin | Pin to DDS E1 / floor 1 | Pin to DDS E2 / floor 2 |
| --- | --- | --- |
| Goodwin | 139.6 m through SEG-047 | 127.3 m through SEG-021 → 022 |
| Davidson | 662.2 m ending through SEG-023 | 713.5 m: same route, then SEG-P11 |

These calculations show that the graph can reach both existing entrance nodes. They do not show that the stored geometry matches the two drawn approaches.

The relevant implementation gaps are:

1. Floor assignments exist only as prose in entrance `notes`; `resolvePlace` and the route controls do not use them.
2. A building destination can terminate at whichever entrance yields the shortest distance.
3. `buildGraph` connects **every entrance of a building to its lowest connector-referenced floor**. For DDS this maps E2 to floor 1 as well, contradicting the supplied floor-2 arrival requirement.
4. Elevators are represented as single endpoint-to-endpoint edges. A floor-1-to-floor-5 edge does not expose floor 2 as a selectable stop.
5. A two-endpoint outdoor “perimeter” edge between E1 and E2 does not encode the real grade, stairs, or floor transition between those doors.

Use the user's floor information as separately sourced arrival metadata. It can drive destination selection without implying that either entrance or route has verified step-free accessibility.

## Geometry defects affecting the comparison

### Disconnected coordinates with connected node IDs

The engine joins paths by node ID, while the map draws each path's own coordinates. Consequently, inconsistent coordinates can create jumps that are not counted in the route distance.

| Node / endpoint | Measured inconsistency | Evidence |
| --- | --- | --- |
| J-WCD-N | **144.7 m** between incident lines | SEG-031/041/044 use the new location, but SEG-032 still begins at the old coordinate. |
| DDS E1 | **56.2 m** | SEG-023 and SEG-P11 still use the old E1 coordinate; SEG-047 uses the current entrance coordinate. |
| DDS E2 | **44.0 m** | SEG-022 and SEG-P11 end at the old coordinate rather than the current entrance point. |
| Goodwin E1 | **26.8 m** | SEG-001, SEG-021, and SEG-P01 disagree with the updated entrance point used by SEG-047. |

Other endpoint offsets are listed in the JSON output. These defects explain why a route may look connected in the graph while its line misses a marker or jumps between paths.

### Outdoor straight lines intersect building footprints

The audit flagged the following selected outdoor lines against the repository's simplified footprint rings:

| Segment | Footprint intersected | Approximate line length inside the saved polygon |
| --- | --- | --- |
| SEG-024 | Hitt Hall | 34 m |
| SEG-041 | Derring Hall | 34 m |
| SEG-044 | Hitt Hall | 22 m |
| SEG-045 | Davidson Hall | 49 m |
| SEG-046 | Hahn Hall South | 29 m |

These are sampling results against simplified polygons, so boundary-adjacent cases, especially SEG-041, require checking with full footprints. They are sufficient to flag the straight-line geometry for review; the table is not proof of an actual corridor or a precise collision survey.

An official footprint corner is not necessarily a door. Connecting extreme corners with straight segments also does not guarantee that the line follows a sidewalk or stays outside the building.

## Why passing tests did not catch this

Several tests assert particular segment IDs and exact distances produced by the migration. They confirm repeatability of the current model, rather than independently checking the student's route.

Examples:

- The Perry → Pamplin test explicitly requires the outdoor wrap-around and absence of IND-DERRING-1.
- The Goodwin → DDS test checks that the direct edge exists and that entrance notes contain floor text. It does not test a floor-specific destination.
- The “New Classroom Building, Davidson Hall, and Williams Hall connect” test exercises NCB and Davidson, but does not test a journey to Williams.
- No current test checks that all occurrences of the same node have matching endpoint coordinates, or that outdoor routes avoid building interiors.

## Suggested repair order

1. **Unify graph coordinates.** Assign one canonical coordinate per node and regenerate incident path endpoints. Add a continuity check with an explicit tolerance.
2. **Add floor-specific DDS destinations.** Offer “DDS — floor 1” and “DDS — floor 2,” preserve the user's source attribution, and connect each entrance to its actual entry level. Expand elevator stops only where the served floors are supported by the source.
3. **Trace the actual student corridors.** Add meaningful intermediate vertices and the correct doors for Hitt/Derring, the Hahn corridor, and the Davidson/Williams/Pamplin route. Keep outdoor and indoor sections explicit.
4. **Keep the Google-style exterior route and student route distinct.** An “Indoor shortcuts” toggle alone does not represent two outdoor alternatives or two destination floors.
5. **Add independent route checks.** Assert expected waypoints/entrances/floors, geometric continuity, no unintended outdoor building crossings, Williams connectivity, and closure behavior for the chosen route.
6. **Recalculate distances and demo claims after geometry is repaired.** Do not preserve 189 m or a claimed saving merely to keep current tests passing.

The immediate priority is coordinate continuity and floor-aware destinations. Adding more buildings or AI features will not resolve these route mismatches.

## Files and reproduction

- [Read-only diagnostic script](../scripts/compare_student_routes.mjs)
- [Full route and geometry results](student-route-audit.json)
- [Changelog reviewed](../CHANGELOG.md)

From the project root:

```sh
node --test tests/router.test.mjs
node scripts/compare_student_routes.mjs
```

Reference screenshots:

- [Davidson → NCB](</Users/kovidsharma/Downloads/Screenshot 2026-09-19 at 10.48.54.png>)
- [Perry Place → Pamplin](</Users/kovidsharma/Downloads/IMG_3109.jpg>)
- [Duplicate Perry Place → Pamplin](</Users/kovidsharma/Downloads/IMG_3109 2.jpg>)
- [Pamplin → NCB](</Users/kovidsharma/Downloads/IMG_3110.jpg>)
- [Goodwin → DDS](</Users/kovidsharma/Downloads/IMG_3111.jpg>)
- [Davidson → DDS](</Users/kovidsharma/Downloads/IMG_3113.jpg>)

