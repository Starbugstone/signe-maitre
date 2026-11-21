# Cars: boarding, driving, damage and repair

The player can take the wheel of the Étude 2000 sedan, a parked or passing car, the case's Moutarde GT or an unattended ambulance. Cars accelerate, reverse, steer and handbrake. Crashes reduce their condition, and a broken-down car needs roadside assistance.

## Sub-features

- `car-board` uses **F** within 22 units to take the wheel. The hint becomes `F / Car · Get out`, and `#stats` adds km/h and vehicle condition.
- `car-exit` uses **F** again to get out beside the car, or shows `No room at the door. Move the car.` when the doors are blocked.
- `car-drive` uses **up** to accelerate, **down** to brake or reverse, **left/right** to steer and **Space** for the handbrake.
- `car-damage` lowers condition based on closing speed in an impact. A head-on crash can reach `0%`.
- `car-repair` uses **E** after a breakdown (`E · Call roadside assistance`), then **Order a repair**, to restore `100%`.
- `car-horn` sounds the horn while **H** is held in a car. In an ambulance, **H** switches the siren on or off. On phones, the **Horn** or **Siren** button (`#touchSignal`) appears only while driving.
- `car-touch` uses **Car**, the pad and **Slap / Brake** on phones. The action button label changes to **Brake** while driving.

## How to get to it (user POV)

- The sedan is parked beside the starting point. Stand next to it and press **F** or tap **Car**.

## Driving it with pf

Preconditions: use `--build probe`. The player is on foot within 22 units of `state().sedan`.

- **Board.** `d.press("car")`. `hud.hint` becomes `t("outHint")`, `hud.stats` contains `km/h`, and `state().ride.model` is `"Étude 2000"`.
- **Drive.** `d.hold(["up"], 800)`. `state().ride.speed` is greater than 0, and `#stats` shows a non-zero km/h.
- **Exit.** `d.press("car")`. `state().ride` is `null`.
- No journey exists yet. Write one in the scratchpad from these steps, or add `driveTo` to `pf.mjs` and a `vehicles.mjs` journey.

## Gotchas

- `d.press("action")` on a phone taps **Slap / Brake**. Its label follows whether the player is in a car.
- Steering is relative to the car's heading, not screen directions. `walkTo` does not work in a car and throws an error.
- Taking an ambulance in service raises heat and interrupts the rescue.
