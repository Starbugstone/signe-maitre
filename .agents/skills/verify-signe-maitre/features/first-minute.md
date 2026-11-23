# Finding vehicles, boats and trains

The clerk points out the seized vehicles on the étude's street and the boat and train routes on the map. A travel waypoint gives directions to the nearest parked motorbike, occupied mooring or ring station.

## Sub-features

- The map uses an amber triangle for the motorbike, cyan squares for moorings and cream circles for ring stations. Occupied moorings are brighter.
- Choosing a map destination closes the map and puts its name and directions on the street HUD. The route clears on boarding. The case card returns on land.
- On foot, the prompt names the vehicle or station and the touch button changes with the action. Speed and condition identify the vehicle being driven.

## How to get to it (user POV)

Open **Map & files** and choose **Motorbike**, **Moored boat** or **Ring station**. Follow the arrow until the prompt offers to board. Use **F** or the matching touch button. At the station, go up to the platform and wait there for the next train.

## Driving it with pf

Run `pf run first-minute --build probe` on desktop/en, phone/fr and phone-portrait/fr. The journey steers from the displayed direction and distance and uses the contextual boarding prompts. The probe verifies which rides it boarded. The journey can also run with `--build shipped`.

## Gotchas

Traffic can block a direct walk. Step around vehicles and pick up the route arrow again. A ring train can take over a minute to arrive at the platform.
