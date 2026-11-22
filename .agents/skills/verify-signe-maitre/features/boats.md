# River boats and moorings

The étude keeps a launch at its closest mooring. Barges and passenger boats use the river in both directions. The blue squares on the map mark moorings, and an anchor on the quay marks the point where you board and land.

## Sub-features

- Board any occupied mooring. Taking a privately owned boat raises Heat.
- Use Up and Down for forward thrust and reverse, Left and Right for the rudder, and H or the ship horn button to signal.
- Release the throttle to coast. Slow at an empty mooring and press F or Boat to tie up and step ashore.
- Bridges cover boats as they pass underneath. Traffic slows and signals when held at a narrow arch. A hard impact damages the hull.

## How to get to it (user POV)

From the starting street, take the bridge approach south to the north quay. Follow the quay to the nearby anchor where the HUD offers to board the launch. The office sedan can stay where it is.

## Driving it with pf

```sh
pf run boats --build probe --video
pf run boats --build probe --device phone --lang fr --video
npm run test:scenery
```

The journey walks to the launch, boards it, uses the horn, sails under a bridge, bumps the bank and returns to the quay. It also takes a moored barge and checks the resulting Heat. It checks the boarding and docking prompts, the boat and player positions, and the sedan's parked position. The scenery fixture compares the bridge pixels with and without the launch in the arch, with the player, a pedestrian and a car on the deck.

## Gotchas

The journey uses the launch berth and bridge approach in the fallback canal. Check its walking and sailing approach again when the expanded river is integrated. The verification video records the screen. The journey checks the ship horn label and held input.
