# Big city: Paris-like Port-Fer, roundabouts, bridges, alleys and ring viaduct

Port-Fer expands to a 16×12 Paris-inspired city crossed by River la Ferre with ten road bridges and Île de la Ferre, encircled by the Petite Ceinture viaduct railway with eight stations, and connected by grand boulevards, anticlockwise roundabouts, seven monuments and narrow cobblestone alleys.

## Sub-features

- Full 16×12 city map (`M`) renders avenues, streets, alleys, roundabouts, River la Ferre, Île de la Ferre, bridges, parks, monuments and the Petite Ceinture ring with stations.
- Localized FR/EN Paris-like district names update in the HUD as the player crosses between neighbourhoods and over the river.
- Roundabouts enforce solid central islands, anticlockwise circulation and yield-on-entry traffic that clears without gridlock.
- River bridges carry cars and walkers between the North Bank, Île de la Ferre and the South Bank while open river water stays blocked to land actors.
- Narrow alleys (`halfWidth = 7`) admit walkers and narrow vehicles (`halfWidth ≤ 3.6`) while physically refusing wide sedans (`halfWidth = 4.8`).
- The Petite Ceinture elevated ring viaduct encircles the city with walkable street-level station stair landings beneath overhead canopies.

## How to get to it (user POV)

Open the map with **M** from the étude on Place de la Contrainte to see the whole city. Board the Étude 2000 sedan with **F**, drive west and circulate anticlockwise around the Obelisk roundabout, then drive south across Pont de la Contrainte over River la Ferre onto Quai Sud. Drive east to the mouth of Ruelle des Écoles at column 9: the wide sedan is stopped at the narrow mouth, while exiting with **F** lets you walk straight down the cobblestone alley. Follow the column 8 avenue south on foot to row 11 (Petite Ceinture South) and walk onto the Gare du Sud station landing under the elevated viaduct.

## Driving it with pf

Run `pf run big-city --build probe` on `desktop/en` and `pf run big-city --build probe --device phone --lang fr` for touch controls and French labels.

- **`big-city-map-open` / `big-city-map-close`**: presses `map`, captures the full 16×12 Paris map, checks the localized Paris-like district HUD and closes the map.
- **`board-sedan`**: walks to the Étude 2000 and boards it with `car`.
- **`drive-around-roundabout`**: steers along `town.roads` west along row 5 and circulates anticlockwise around the Place de la Contrainte obelisk island.
- **`observe-roundabout-traffic`**: pauses clear of the roundabout kerb and verifies moving city traffic circulates anticlockwise around the island.
- **`on-river-bridge` / `drive-across-river-bridge`**: drives south down column 6 onto Pont de la Contrainte over River la Ferre (checking the river district name) and continues onto Quai Sud (checking the South Bank district name).
- **`wide-car-refused-by-alley`**: drives east along Quai Sud to column 9, faces south into Ruelle des Écoles and confirms the wide sedan cannot enter the narrow `halfWidth = 7` alley.
- **`walk-narrow-alley`**: parks clear on the Quai Sud riverside shoulder, exits on foot and walks down the same cobblestone alley.
- **`ring-viaduct-and-station`**: walks down column 8 avenue to Petite Ceinture South (row 11) and reaches the Gare du Sud station stair landing under the elevated viaduct.

## Gotchas

- `driveRouteTo` plans paths on `town.roads` via `findRoute` and steers using real keyboard/touch pulses while regulating speed for turns and yielding to traffic ahead. On a heavily loaded host, rerun once if timing jitter slows a leg.
- Final district and monument paintings are integrated later by Fable; until then, procedural night overlays render the roundabouts, river, island, alleys, monuments and ring viaduct.
