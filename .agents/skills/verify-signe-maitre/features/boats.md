# River boats and moorings

The étude keeps a launch at its closest mooring. Barges and passenger boats use the river in both directions. The blue squares on the map mark moorings, and an anchor on the quay marks the point where you board and land.

## Sub-features

- Board any occupied mooring. Taking a privately owned boat raises Heat.
- Use Up and Down for forward thrust and reverse, Left and Right for the rudder, and H or the ship horn button to signal.
- Release the throttle to coast. Slow at an empty mooring and press F or Boat to tie up and step ashore.
- Bridges cover boats as they pass underneath. Traffic slows and signals when held at a narrow arch. A hard impact damages the hull.

## How to get to it (user POV)

From the étude in column 7, walk south to Quai Nord and turn west along the promenade. The launch waits at Quai de la Contrainte, at the anchor in column 5. The closest road bridge to the east is Pont de la Contrainte. Look for six mooring markers on the map, including one on the south side of Île de la Ferre.

## Driving it with pf

```sh
pf run boats --build probe --video
pf run boats --build probe --device phone --lang fr --video
pf run river-traffic --build probe --mute
npm run test:scenery
```

The journey walks to the launch, boards it, uses the horn, sails under a bridge, bumps the bank and returns to the quay. It also takes a moored barge and checks the resulting Heat. It checks the boarding and docking prompts, the boat and player positions, and the sedan's parked position. The scenery fixtures compare every road deck and both Petite Ceinture bridges with and without the launch in the water below. The road fixtures put the player, a pedestrian and a car on the deck. The traffic journey observes 260 seconds of the running game and checks that hulls stay in water, avoid one another, and cross both railway and all ten road bridges in both directions. Eastbound traffic uses the south channel and westbound traffic uses the north.

## Gotchas

The verification video records the screen. The journey checks the ship horn label and held input.
