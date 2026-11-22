# City map and case files

The map control opens a city map from the street or the office, shows the planned route, and pauses play until the player closes it.

## Sub-features

- `map-open` opens the map with **M**, the **Map & files** button or the touch toolbar. The button changes to **Close map**. The case list shows the next pickup or active case and a short description for every open file.
- `map-pause` keeps the map open while movement keys are pressed. The route card stays hidden.
- `map-close` returns to the previous scene when **M** or **Close map** is pressed again.

## How to get to it (user POV)

- Press **M** on the street.
- Click or tap **Map & files** (`#mapBtn`) in the toolbar.

## Driving it with pf

Preconditions: the player is on the street. The control also works inside the étude, where the map uses the street door as the player’s location.

- **Open.** Run `pf run map-view`. `d.press("map")` uses the **M** key on desktop and taps `#mapBtn` on phones. The check is `hud.map === t("closeMap")`, `hud.route === null` and the three localized titles and briefs in `#fileList`.
- **Paused.** Desktop holds **right** for 500 ms. On phones the journey checks the movement pad is hidden. Both check the map stays open. Probe runs also compare the simulation clock and player coordinates across the pause.
- **Close.** The journey presses **map** again. The Map button label and route card return.
- **Active file indoors.** `pf run office-interior --build probe` opens the map at the desk, checks the active file and destination, then closes it and verifies the desk hint.
- **Proof.** Use `01-map-open.png`, which shows the city map and route, and `03-map-closed.png`.

## Gotchas

- The map is drawn on the canvas. The map title, legend and case files are HTML. Look at the screenshot to check the route line.
- Opening the map clears held keys, so a run held through it stops.
