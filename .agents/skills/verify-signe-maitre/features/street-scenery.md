# Street scenery

The garage and market share a railway above a pedestrian alley. The player can enter the alley from the pavement and walk in front of the garage pillar.

## Sub-features

- Railway pillars, streetlamps and bollards have solid bases.
- Pedestrians and vehicles cover objects behind them. The elevated deck stays overhead.
- The market span meets the next painting at its painted pillar, leaving the alley open.

## How to get to it (user POV)

Walk east from the étude along the north pavement of Place de la Contrainte (column 7, row 5) past the garage pillar into the adjacent seam alley, step inside the alley, and return to the pavement. The automated pixel suite (`scripts/scenery/scene.js`) also inspects the northern and southern Petite Ceinture market joins, roundabout islands, Marais alleys, bridges, Tour de Fer underpass and vertical ring viaduct piers.

## Driving it with pf

`pf run south-pavement --build probe` walks onto the south pavement past the kerb line, along it both ways, then drives the étude sedan off its spot and along the south kerb. Before the fix, walkers and cars met an invisible wall at the kerb line (`southPavement` was 17; the painted pavement runs to the bollards at about 23).

Run `npm run test:scenery` after every scenery edit. Its `street-scenery` journey visits the two reported locations through real controls using the read-only probe. Review the screenshots under `.verify/evidence/`. Run `pf run street-scenery --build probe --device phone --lang fr` for the touch route.

The same npm command also compares rendered pixels for the player, an NPC and vehicles in controlled poses, and checks the artwork and ground collision on every market join. Add the changed placement to `scripts/scenery/scene.js` when extending the town.

## Gotchas

The pavement bollards are in front of the garage pillar. A pedestrian passing behind a bollard can legitimately have one foot hidden. Inspect the torso against the pillar and the feet against the pavement.
