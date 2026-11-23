# Street scenery

Every cell of Port-Fer shows one street painting (`town.cellKinds`), and the painting shows exactly the roads the cell has: a ruelle is a painted lane between houses with a mouth on its wide street, a T-junction's closed side is one painted frontage. Two paintings meet wall against wall. Behind every block runs the paved passage in front of its south-facing houses, open on foot from one cross street to the next. La Ferre is drawn from one tall plate per column, and the Petite Ceinture runs on painted spans.

## Sub-features

- Railway pillars, streetlamps and bollards have solid bases.
- Pedestrians and vehicles cover objects behind them. The elevated deck stays overhead.
- Nobody steps off a pavement into the join of two paintings; the passage behind a block admits a walker and no vehicle.
- A ruelle admits walkers and motorbikes from its mouth to the next junction and stops a saloon; the houses stand 7 units either side of its centre line.
- Arc des Saisies, the obelisk and the lamp standard cover a walker behind them; the Tour de Fer ironwork is drawn over the street; the side legs of the ring stand on painted brackets (west) and portals (east), and each of its four curves on a painted column and portal.
- The closed side of a T-junction, the frontage beside a ruelle's mouth, roundabout islands, the tower's rear gardens, bridge parapets, the faces of the quay walls and the island's cathedral, courts, gardens and tree trunks stop walkers and cars.
- The painted lanterns of every later painting, the island's trees and kiosks, and the lanterns hung over the iron bridge cover a walker behind them.

## How to get to it (user POV)

Walk east from the étude along the north pavement of Place de la Contrainte (column 7, row 5) past the garage pillar to where its painting meets the next. Go back to the corner, up the side street, and turn into the paved passage behind the block; follow it to the next street and come back round to the join, which is a wall. The automated pixel suite (`scripts/scenery/scene.js`) also inspects every join of two paintings, the passage behind seven blocks, the ring's side legs and corner supports, the three monument islands, both T-junction pairs, every ruelle of the Marais and the Quartier Latin, bridges between their painted parapets, the island's quay walls, stone piers and bastions over boats, one painted lantern per painting, the Tour de Fer underpass, station doors, and the decks over boats.

`node scripts/scenery/overview.mjs <dir>` writes a stitched picture of the whole city, one gameplay-scale frame of every painting in place and contact sheets. Add `spots '{"name":[x,y]}'` for named places. `node scripts/scenery/region.mjs <dir> '{"marais":[2650,680,3600,1260]}'` stitches any rectangle of the empty city at gameplay scale, which is how to look at a join: a quarter is several screens wide. Look at them after any change to a painting, its registration or the bake recipes (`tools/art/bake-scenery.mjs`).

## Driving it with pf

Preconditions: fresh probe game, starting beside the étude with the company sedan. Allow several minutes per landmark tour.

`pf run south-pavement --build probe` walks onto the south pavement past the kerb line, along it both ways, then drives the étude sedan off its spot and along the south kerb. Before the fix, walkers and cars met an invisible wall at the kerb line (`southPavement` was 17; the painted pavement runs to the bollards at about 23).

`pf run city-scenery city-scenery-east --build probe` drives both halves of the landmark tour. The western journey boards the sedan and visits Place de la Contrainte and Arc des Saisies, then crosses the river and walks under Tour de Fer. The eastern journey drives onto Île de la Ferre, walks the cathedral forecourt, visits Palais de Justice and Hôtel des Ventes, walks to the Butte-du-Créancier station door and drives past Sacré-Créancier to the north-east turn of the ring. The checks prove the player reaches these places. At gameplay scale, inspect each changed obstacle from the front and rear, including its base and join, with the player, an NPC and a vehicle.

`pf run marais-ruelles --build probe` (about two minutes) walks from the étude into Le Vieux Marais: through the mouth of the ruelle on the wide street at column 9, along the lane to the crossing of four, up to the street on the north side, down the next ruelle to the second crossing, out by the east mouth and back out by the south one. It checks that the houses hold the player in the lane. Read its screenshots for the mouths (dropped kerb, two bollards, setts), the lanes and the joins between the paintings.

Run `npm run test:scenery` after every scenery edit. Its `street-scenery` journey visits the two reported locations through real controls using the read-only probe. Review the screenshots under `.verify/evidence/`. Run `pf run street-scenery --build probe --device phone --lang fr` for the touch route.

The same npm command also compares rendered pixels for the player, an NPC and vehicles in controlled poses, and checks the artwork and ground collision on every market join. Add the changed placement to `scripts/scenery/scene.js` when extending the town.

## Gotchas

The pavement bollards are in front of the garage pillar. A pedestrian passing behind a bollard can legitimately have one foot hidden. Inspect the torso against the pillar and the feet against the pavement.
