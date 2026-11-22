# Street scenery

Every cell of Port-Fer shows one street painting (`town.cellKinds`). Roads the road graph does not have are built over with the painting's own frontage, ruelles and cell seams are painted lanes, la Ferre is drawn from one tall plate per column, and the Petite Ceinture runs on painted spans. Near the étude, the garage and its neighbour share the railway above a pedestrian lane: the player can enter the lane from the pavement and walk in front of the garage pillar.

## Sub-features

- Railway pillars, streetlamps and bollards have solid bases.
- Pedestrians and vehicles cover objects behind them. The elevated deck stays overhead.
- Each painted span meets the next at a seam lane that stays open beside its outer pillar.
- Arc des Saisies, the obelisk and the lamp standard cover a walker behind them; the Tour de Fer ironwork is drawn over the street; the side legs of the ring stand on painted brackets (west) and portals (east), and each of its four curves on a painted column and portal.
- Closed road arms, roundabout islands, the tower's rear gardens, the cathedral and the water at the island's corners stop walkers and cars.

## How to get to it (user POV)

Walk east from the étude along the north pavement of Place de la Contrainte (column 7, row 5) past the garage pillar into the adjacent seam alley, step inside the alley, and return to the pavement. The automated pixel suite (`scripts/scenery/scene.js`) also inspects the ring's seam lanes, side legs and corner supports, the three monument islands, closed arms, Marais alleys, bridges at their full painted width, the island and its quays, the Tour de Fer underpass, station doors, and the decks over boats.

`node scripts/scenery/overview.mjs <dir>` writes a stitched picture of the whole city, one gameplay-scale frame of every painting in place and contact sheets. Add `spots '{"name":[x,y]}'` for named places. Look at them after any change to a painting, its registration or the bake recipes (`tools/art/bake-scenery.mjs`).

## Driving it with pf

`pf run south-pavement --build probe` walks onto the south pavement past the kerb line, along it both ways, then drives the étude sedan off its spot and along the south kerb. Before the fix, walkers and cars met an invisible wall at the kerb line (`southPavement` was 17; the painted pavement runs to the bollards at about 23).

`pf run city-scenery --build probe` (about four minutes) boards the étude's sedan and drives the road graph to Place de la Contrainte, Arc des Saisies, under Tour de Fer, onto Île de la Ferre, past the Palais de Justice and the Hôtel des Ventes, under the ring at Butte-du-Créancier, up to Sacré-Créancier and out to the north-east turn of the ring. It gets out on foot beneath the tower, on the cathedral's apron and at the station door. Each step's screenshot shows the painting at gameplay scale with the player, pedestrians and traffic; read them, the checks only prove the places are reachable.

Run `npm run test:scenery` after every scenery edit. Its `street-scenery` journey visits the two reported locations through real controls using the read-only probe. Review the screenshots under `.verify/evidence/`. Run `pf run street-scenery --build probe --device phone --lang fr` for the touch route.

The same npm command also compares rendered pixels for the player, an NPC and vehicles in controlled poses, and checks the artwork and ground collision on every market join. Add the changed placement to `scripts/scenery/scene.js` when extending the town.

## Gotchas

The pavement bollards are in front of the garage pillar. A pedestrian passing behind a bollard can legitimately have one foot hidden. Inspect the torso against the pillar and the feet against the pavement.
