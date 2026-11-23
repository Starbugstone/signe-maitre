# Finding vehicles, boats and trains

The clerk points out the seized vehicles on the étude's street and the boat and train routes on the map. A travel waypoint gives directions to the nearest parked motorbike, occupied mooring or ring station.

## Sub-features

- `travel-clerk` points out the seized fleet, moorings and ring railway in the starting ticker.
- `travel-legend` uses an amber triangle for the motorbike, cyan squares for moorings and cream circles for ring stations. Occupied moorings are brighter.
- `travel-route` closes the map on selection and shows the destination name, arrow and distance in the travel card. At the destination it reads **On site**. The guide clears when you board the motorbike or boat, or climb to the train platform. On land the case card returns.
- `travel-boarding` names the vehicle or station in the approach prompt and changes the touch button to **Bike**, **Boat** or **Train**. The HUD names the vehicle beside its speed and condition.

## How to get to it (user POV)

- Read the clerk's message when the street loads. Walk up to a seized vehicle along the étude's street to see its name in the boarding prompt.
- Open **Map & files** with **M**, the toolbar or the controller's View button. Choose **Motorbike**, **Moored boat** or **Ring station**. Follow the travel arrow. Reopen the map and select **Clear route** to cancel.
- When the prompt offers to board, press **F**, tap the matching touch button or press **Y**. At the station, go up to the platform and wait for the next train.

## Driving it with pf

Preconditions: a fresh context with the motorbike and 4×4 along the étude's street, an occupied mooring and the ring railway in service. Start at boot to catch the clerk's message.

- **Shipped game over HTTP.** In the [Launch block](../SKILL.md#launch), replace `pf run map-view` with `pf run first-minute` and keep the URL, video and run ID flags. The journey checks the clerk's message and the three destination choices, then walks from the displayed arrows and distances.
- **Board and move.** The journey checks that the Pétrolette and Mastodon are named in the HUD. It finds and boards the motorbike within a minute, verifies the case card returns and checks that the motorbike pulls away. It checks that the named boat moves, ties up and returns the player to the quay. At the station it reads the platform hint, then the open-doors or next-stop hint after boarding.
- **Touch.** Run `pf run first-minute --build shipped --device phone --lang fr`, then repeat with `--device phone-portrait --lang fr`. The journey checks each contextual touch label before boarding.
- **Probe and proof.** `pf run first-minute --build probe` also checks the specific road models, the boat domain and the train ride phase. Review the map screenshot for the legend symbols. The journal records each destination selection, arrival and resulting boarding HUD.

## Gotchas

- Traffic can block a direct walk. Step around vehicles and pick up the route arrow again.
- A ring train can take over a minute to arrive. The first-minute assertion covers finding the motorbike and the map destinations. The train and boat legs have their own waits.
- The journey selects destinations and follows them through boarding. Check **Clear route** separately by reopening the map after selection and verifying the case card returns after closing it.
