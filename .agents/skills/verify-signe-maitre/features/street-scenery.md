# Street scenery

Every cell of Port-Fer shows one street painting (`town.cellKinds`). Roads the road graph does not have are built over with the painting's own frontage, ruelles and cell seams are painted lanes, la Ferre is drawn from one tall plate per column, and the Petite Ceinture runs on painted spans. Near the étude, the garage and its neighbour share the railway above a pedestrian lane: the player can enter the lane from the pavement and walk in front of the garage pillar.

## Sub-features

- Railway pillars, streetlamps and bollards have solid bases.
- Pedestrians and vehicles cover objects behind them. The elevated deck stays overhead.
- Each painted span meets the next at a seam lane that stays open beside its outer pillar.
- Arc des Saisies, the obelisk and the lamp standard cover a walker behind them; the Tour de Fer ironwork is drawn over the street; the side legs of the ring stand on painted brackets (west) and portals (east), and each of its four curves on a painted column and portal.
- Closed road arms, roundabout islands, the tower's rear gardens, bridge parapets, the faces of the quay walls and the island's cathedral, courts, gardens and tree trunks stop walkers and cars.
- The painted lanterns of every later painting, the island's trees and kiosks, and the lanterns hung over the iron bridge cover a walker behind them.

## How to get to it (user POV)

Walk east from the étude along the north pavement of Place de la Contrainte (column 7, row 5) past the garage pillar into the adjacent seam alley, step inside the alley, and return to the pavement. The automated pixel suite (`scripts/scenery/scene.js`) also inspects the ring's seam lanes, side legs and corner supports, the three monument islands, closed arms, Marais alleys, bridges between their painted parapets, the island's quay walls, stone piers and bastions over boats, one painted lantern per painting, the Tour de Fer underpass, station doors, and the decks over boats.

`node scripts/scenery/overview.mjs <dir>` writes a stitched picture of the whole city, one gameplay-scale frame of every painting in place and contact sheets. Add `spots '{"name":[x,y]}'` for named places. Look at them after any change to a painting, its registration or the bake recipes (`tools/art/bake-scenery.mjs`).

## Driving it with pf

Preconditions: fresh probe game, starting beside the étude with the company sedan. Allow several minutes per landmark tour.

`pf run south-pavement --build probe` walks onto the south pavement past the kerb line, along it both ways, then drives the étude sedan off its spot and along the south kerb. Before the fix, walkers and cars met an invisible wall at the kerb line (`southPavement` was 17; the painted pavement runs to the bollards at about 23).

`pf run city-scenery city-scenery-east --build probe` drives both halves of the landmark tour. The western journey boards the sedan and visits Place de la Contrainte and Arc des Saisies, then crosses the river and walks under Tour de Fer. The eastern journey drives onto Île de la Ferre, walks the cathedral forecourt, visits Palais de Justice and Hôtel des Ventes, walks to the Butte-du-Créancier station door and drives past Sacré-Créancier to the north-east turn of the ring. The checks prove the player reaches these places. At gameplay scale, inspect each changed obstacle from the front and rear, including its base and join, with the player, an NPC and a vehicle.

Run `npm run test:scenery` after every scenery edit. Its `street-scenery` journey visits the two reported locations through real controls using the read-only probe. Review the screenshots under `.verify/evidence/`. Run `pf run street-scenery --build probe --device phone --lang fr` for the touch route.

The same npm command also compares rendered pixels for the player, an NPC and vehicles in controlled poses, and checks the artwork and ground collision on every market join. Add the changed placement to `scripts/scenery/scene.js` when extending the town.

## Gotchas

The pavement bollards are in front of the garage pillar. A pedestrian passing behind a bollard can legitimately have one foot hidden. Inspect the torso against the pillar and the feet against the pavement.
