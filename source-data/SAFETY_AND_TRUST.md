# Safety and trust

The failure mode for this app is not a slow route. It is a person in a wheelchair
arriving at a door with three steps, two hundred metres from the nearest ramp,
possibly in the rain, possibly late, because a screen told them the route was
step-free and nobody had ever checked.

Everything below exists to prevent that specific outcome.

---

## The four rules

**1. A guess and a checked fact never look the same.**

Confirmed is a solid line. Unverified is dashed. Confirmed gets a tick, unverified
gets a question mark. This holds in the map, the leg list and any screenshot that
leaves the room. If you demo on a projector, the distinction has to survive being
photographed badly.

**2. `require_step_free` means confirmed step-free.**

An unverified guess does not satisfy a step-free request. Today that means the
request returns nothing, with an explanation. That is correct. A wrong yes here
strands someone; a no sends them to ask a human, which is a worse experience and
a much better outcome.

**3. When a constraint cannot be met, say so. Never silently relax it.**

If no route satisfies the preferences, return the failure and the reason —
"4 edges rejected as not confirmed step-free" — and let the user choose to loosen
it. Falling back to a route they did not ask for is the single most dangerous
thing this codebase could do.

**4. `inferred` is not a weak yes. It is no data.**

Map it to unknown everywhere. If a demo only works when you treat `inferred` as
`step_free`, the demo is lying and the fix is a survey, not a config change.

---

## Enforced in code

`engine/test_router.py` has six invariant tests. They are not style checks.

| Test | Guards against |
|---|---|
| `require_step_free` never returns an unverified leg | rule 2 |
| `require_step_free` fails loudly on unverified data | rule 3 |
| `avoid_unknown` returns only confirmed legs | rule 1 |
| trust summary admits the route is unverified | over-claiming in copy |
| trust summary never claims full verification while legs are unknown | the same, inverted |
| no real edge is confirmed before any survey | someone quietly upgrading data |

That last one will start failing once you do the survey. When it does, update the
expectation — do not delete the test.

---

## Writing the interface

Every route carries a trust summary. Show it at the same visual weight as the
distance, not in a footnote.

```
100% of this route is unverified (4 of 5 steps).
Treat it as a suggestion, not a guarantee.
```

Wording that works:

- "Nobody has checked this route."
- "3 of 7 steps unverified."
- "Verified by a person on 12 October."

Wording that does not:

- "Accessible route" — over-claims, and to whom?
- "Estimated accessible" — invented confidence.
- A green tick on unverified data.
- Burying the caveat in an About page.

Say *unverified*, not *unavailable*. The data is missing, not the pavement.

---

## Times are bands

Never show a duration to the second. Wheelchair speeds, crutch speeds and
stroller speeds vary enormously, and the fixed costs here (45 s for a lift, 25 s
for a flight) are averages invented for a scaffold. "About 5 minutes" is honest.
"5 min 24 s" is not.

---

## Crowdsourced reports

If you add user reporting — a good idea, and the thing VT's own map does not do —
those arrive as `community_report`, which is **not** CONFIRMED. One person
reporting a door step-free is evidence, not verification. Options: require several
independent reports before promotion, or have Facilities confirm. Decide the rule
before you collect the first report, and write it down here.

Reports also go stale. A ramp closes, a door gets a temporary threshold. Age
entries out to `unknown` after a period you choose — there is an example row in
`status.csv` doing exactly that.

---

## Privacy

Do not collect names, diagnoses, student IDs or movement history. Preferences
like "avoid stairs" stay on the device and travel with the request. Nothing
identifying belongs in the dataset, ever.

A route log is a disability disclosure. Treat it accordingly: don't keep one.

---

## Before you show it to anyone

- [ ] `python scripts/validate_data.py` — no errors
- [ ] `python -m engine.test_router` — all pass
- [ ] Ask for a step-free route. Confirm it fails honestly.
- [ ] Screenshot a route. Can a stranger tell which parts are unverified?
- [ ] Read your own copy aloud. Does any of it claim more than you know?
