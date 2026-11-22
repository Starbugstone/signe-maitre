# River boats and moorings

The étude keeps a launch at its closest mooring. Barges and passenger boats use the river in both directions. Cyan squares on the map mark moorings. An anchor on the quay marks where you can land, and you can board from alongside the hull.

## Sub-features

- Board beside the hull of a moored boat or a slow or stopped boat alongside the quay. Taking a privately owned boat raises Heat.
- Use Up and Down for forward thrust and reverse, Left and Right for the rudder, and H or the ship horn button to signal.
- Release the throttle to coast. Slow at an empty mooring and press F or Boat to tie up and step ashore.
- Bridges cover boats as they pass underneath. So do a stone bridge's bastions, an iron bridge's ribs, the island's quay wall and the cathedral's towers and spire. Stone piers, abutments and the island's walls stop a hull. Traffic slows and signals when held at a narrow arch. A hard impact damages the hull.

## How to get to it (user POV)

Choose **Moored boat** on the map for directions to an occupied mooring. The étude's launch waits at Quai de la Contrainte. The closest road bridge to its east is Pont de la Contrainte. Westbound traffic passes slowly along the low apron west of the anchor at Quai Ouest.

## Driving it with pf

```sh
pf run boats --build probe --video
pf run boats --build probe --device phone --lang fr --video
pf run quay-traffic --build probe
pf run quay-traffic --build probe --device phone --lang fr
pf run island-voyage --build probe
pf run island-voyage --build probe --device phone --lang fr
pf run river-traffic --build probe --mute
npm run test:scenery
```

`island-voyage` (about three minutes) boards the launch and sails west through the north arch of the stone bridge at column 4 and back, under the iron bridge at column 6, along the north channel behind Notre-Dame-du-Port, round the east point, back along the south channel past the moored speedboat and home to its berth. Every sample checks that the whole hull is on water, and it must return without a bump. Its screenshots show the launch behind the first bastion, through the iron spandrel, behind the cathedral towers and below the island's quay wall: read them for the layering.

`boats` walks to the launch, boards it, uses the horn, sails under a bridge, bumps the bank and returns to the quay. It also takes a moored barge beside its bow, away from the anchor, and checks the resulting Heat. `quay-traffic` takes a passing cargo barge from Quai Ouest and checks the boarding prompt, Heat and handover from river traffic. The scenery fixtures compare every road deck and both Petite Ceinture bridges with and without the launch in the water below. The road fixtures put the player, a pedestrian and a car on the deck. The traffic journey observes 260 seconds of the running game and checks that hulls stay in water, avoid one another, and cross both railway and all ten road bridges in both directions. Eastbound traffic uses the south channel and westbound traffic uses the north.

## Gotchas

The verification video records the screen. The journey checks the ship horn label and held input.

Barges keep to two lanes about the river's centre line: `island-voyage` stays north of them, waits for a gap off the island's west point before it crosses the westbound lane, and passes outside the speedboat at the island's berth. A route along the centre line meets a barge bow to bow and both stop.
