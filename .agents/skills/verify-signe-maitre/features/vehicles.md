# Cars: boarding, driving, damage and repair

The player can take the wheel of the Étude 2000 sedan, a parked or passing car, the case's Moutarde GT or an unattended ambulance. Cars accelerate, reverse, steer and handbrake. Crashes reduce their condition, and a broken-down car needs roadside assistance.

## Sub-features

- `car-board` uses **F** within 22 units to take the wheel. The HUD adds km/h and vehicle condition. Away from addresses and roadside recovery the hint offers **Get out**.
- `car-exit` uses **F** again to get out beside the car, preferring a door with room to walk away and never through a wall or the canal bank. It shows `No room at the door. Move the car.` when every door is blocked. Delivering the GT to auction pays only once the player is out.
- `car-drive` uses **up** to accelerate, **down** to brake or reverse, **left/right** to steer and **Space** for the handbrake.
- `car-damage` lowers condition based on closing speed in an impact. A full-speed crash costs about half the car; two or three bad crashes reach `0%`.
- `car-repair` uses **E** after a breakdown (`E · Call roadside assistance`), then **Order a repair**, to restore `100%`.
- `car-horn` sounds the horn while **H** is held in a car. In an ambulance, **H** switches the siren on or off. The **Horn** or **Siren** control is available in a working vehicle during street play. Phones use `#touchSignal`.
- `car-touch` uses **Car**, the pad and **Slap / Brake** on phones. The action button label changes to **Brake** while driving.

## How to get to it (user POV)

- The sedan is parked beside the starting point. Stand next to it and press **F** or tap **Car**.

## Driving it with pf

Preconditions: use `--build probe`. The player is on foot within 22 units of `state().sedan`.

- Run `pf run street-life --build probe`, then repeat with `--device phone --lang fr`. Boarding checks the sedan's nameplate (`state().ride.label`; `model` is now the fleet id, `sedan`) and the speed display. The touch run also checks the localized Horn and Brake controls.
- **Drive.** The journey steers, accelerates, checks that the sedan has moved more than two world units from its parking spot, then holds Down and waits for a stop.
- **Exit.** `d.press("car")`. `state().ride` is `null`.
- **Crash and exit.** `pf run fleet --build probe` checks crash damage for the seized fleet and wrecks the motorbike.
- **Manual repair.** Wreck a vehicle, press **E** at the roadside-assistance prompt, choose **Order a repair** and verify the condition returns to 100%. GT delivery and a handbrake turn also need manual drives.

## Gotchas

- The other models (Volta E, SUV, bus, dump truck, motorbike) have their own journey and recipe in [Fleet](fleet.md).

- `d.press("action")` on a phone taps **Slap / Brake**. Its label follows whether the player is in a car.
- Steering is relative to the car's heading, not screen directions. `walkTo` does not work in a car and throws an error.
- Taking an ambulance in service raises heat and interrupts the rescue.
