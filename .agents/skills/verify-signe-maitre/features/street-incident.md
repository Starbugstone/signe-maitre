# Street incidents and ambulance dispatch

Slapping a pedestrian three times, or hitting one with a car, knocks them down. On foot beside a downed pedestrian, **R** writes an incident report. Twelve seconds later, an ambulance arrives from off-camera. Its medic carries up to four nearby patients on stretchers, and dispatch sends more crews if more patients are waiting.

## Sub-features

- `incident-slap` uses **Space** near a pedestrian. The first hit shows `service`, the second `initial`, and the third knocks the pedestrian down and shows `served`. Heat rises.
- `incident-report` shows the **R · Incident report** button (`#reportBtn`) beside a downed pedestrian. It opens **Street incident report**, or **outrage** if the pedestrian insulted the commissaire. **File and hand over a copy** files it.
- `incident-office` lists **Latest incident report** at the office desk.
- `ambulance-arrive` sends an ambulance in traffic from outside the camera after 12 s. A medic loads up to four patients.
- `ambulance-theft` uses **Space** on the medic, then **F** beside the van (`F · Take the ambulance`) to take it. Heat rises, and another crew is sent.

## How to get to it (user POV)

- Walk up to a pedestrian and press **Space** three times. Then press **R** or tap the report button.

## Driving it with pf

Preconditions: use `--build probe`. A pedestrian must be within 18 units, and the street population depends on the camera neighbourhood.

- **Find a pedestrian.** No journey exists. The probe's `snapshot()` does not list standing pedestrians yet. Add a read-only `people` list of `{x, y, down}` to the probe before scripting this.
- **Knock down.** `d.press("action")` three times, with at least 0.5 s between presses. `state().downed.length` increases.
- **Report.** `d.waitFor(..., ({hud}) => hud.report)`, then `d.press("report")` and `d.choose("serveCopy")`.
- **Ambulance.** `d.waitFor("ambulance", ({state}) => state.ambulance?.state === "collecting", 30000)`.
- **Proof.** Use screenshots of the report dialog, the van arriving and the stretcher, with `--video` for the animation.

## Gotchas

- Do not place pedestrians or knock them down from a script. The probe is read-only, and the old film-direction scripts that set patients do not count as proof.
- The ambulance has to enter from outside the camera. A screenshot showing it appearing on screen is a bug, not a pass.
- `npm test` covers the dispatch logic with fixtures. It does not replace a run in the game.
