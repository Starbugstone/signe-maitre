# City map

The map control replaces the street with a city map, shows the planned route, and pauses play until the player closes it.

## Sub-features

- `map-open` opens the map with **M**, the **Map** button or the touch toolbar. The button changes to **Close map** and the hint becomes `M / Map · Back to town`.
- `map-pause` keeps the map open while movement keys are pressed. The route card stays hidden.
- `map-close` returns to the street when **M** or **Close map** is pressed again.

## How to get to it (user POV)

- Press **M** on the street.
- Click or tap **Map** (`#mapBtn`) in the toolbar.

## Driving it with pf

Preconditions: the player is on the street. The map does not open indoors.

- **Open.** Run `pf run map-view`. `d.press("map")` uses the **M** key on desktop and taps `#mapBtn` on phones. The check is `hud.map === t("closeMap")`, `hud.route === null` and `hud.hint === t("mapHint")`.
- **Paused.** The journey holds **right** for 500 ms. The map stays open and the district name does not change.
- **Close.** The journey presses **map** again. The Map button label and route card return.
- **Proof.** Use `01-map-open.png`, which shows the city map and route, and `03-map-closed.png`.

## Gotchas

- The map is drawn on the canvas. The only DOM evidence is the button label, the hint and the hidden route card. Look at the screenshot to check the route line.
- Opening the map clears held keys, so a run held through it stops.
