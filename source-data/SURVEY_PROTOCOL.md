# Survey protocol

Two hours on foot turns this from a grey map into a working demo. Nothing else
you can do with the time comes close.

The full walk order lives in the **Field Survey** tab of
`data/raw/accesspath-pilot-vt.xlsx`: 15 doors, Squires to Hitt.

## Take with you

Phone camera, a tape measure or a ruler, and the workbook open on your phone.
That is all.

## At each door

1. **Is there a step?** Any step at all. Yes or no.
2. **How many, and how high?** Measure the tallest. A lip over ~13 mm is not step-free.
3. **Is there a ramp or a level way in nearby?** Where, and how far around?
4. **Can you open the door seated?** Push-button, light pull, or a heavy fire door.
5. **Photograph it.** One photo per door, door and threshold both in frame.

## Deciding the value

- `step_free` — no step, or a ramp you could roll up unaided, **and** the door
  opens from a seated position.
- `limited` — passable by some wheelchair users but not all. Steep ramp, heavy
  door, narrow width, awkward approach. Write down which.
- `stairs` — steps, no step-free way in at this door.
- `unknown` — you did not check, or you are not sure.

Guessing between `limited` and `step_free` is exactly the judgement call that
hurts someone. When torn, record `limited` and note why.

## Filing it

For each finished row, copy your five answers into the matching row of the
**Entrances** tab, set `confidence` to `field_verified`, and put today's date in
`last_verified`. `display_tier` flips to CONFIRMED on its own.

Then:

```bash
python scripts/build_geojson.py
python scripts/validate_data.py
python -m engine.test_router
```

The invariant test "no real edge is confirmed before any survey" will now fail.
That is the good failure. Update its expectation to your new count.

## Survey the paths too

Entrances alone will not give you a step-free route — the segments between them
need values as well. For each path on your walk:

- **Surface** — paved, gravel, grass, broken.
- **Steps or kerbs anywhere along it?** One unramped kerb makes the whole segment
  `stairs` for a wheelchair user.
- **Steepest bit.** You do not need a clinometer; a phone level app is fine.
  Over ~8.3% (1:12) is not step-free.
- **Narrowest bit.** Under 900 mm is a problem.

Fill `max_grade_pct` and `width_m`. Until those columns have numbers, `step_free`
on a path is an opinion.

## Priority

Row 7, **Burruss Hall north entrance**, is worth more than the other fourteen
combined. The Drillfield front is a broad flight of steps. If the north door is
not step-free, Burruss — the building every judge will recognise — has no
accessible approach anywhere in your data.

## Indoor cut-throughs

While you are inside, record two things the schema has room for and no values in:

- **Opening hours.** On the door, usually. A route through a locked building is
  worse than a longer one outside.
- **Does it need a Hokie Passport?** Especially after hours.

Put them in `open_hours` and `access_control` on the matching `IND-*` row in the
Paths tab.

## Don't

- Don't guess to fill a blank. A blank row is fine; a wrong `step_free` is not.
- Don't record a door you did not personally stand at.
- Don't photograph people.
