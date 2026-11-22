# Street scenery

The garage and market share a railway above a pedestrian alley. The player can enter the alley from the pavement and walk in front of the garage pillar.

## Sub-features

- Railway pillars, streetlamps and bollards have solid bases.
- Pedestrians and vehicles cover objects behind them. The elevated deck stays overhead.
- The market span meets the next painting at its painted pillar, leaving the alley open.

## How to get to it (user POV)

Walk west from the étude along the north pavement. Visit the garage gate, walk back east to the alley between the market and garage, then pass under the span and return to the pavement.

## Driving it with pf

Run `npm run test:scenery` after every scenery edit. Its `street-scenery` journey visits the two reported locations through real controls using the read-only probe. Review the screenshots under `.verify/evidence/`. Run `pf run street-scenery --build probe --device phone --lang fr` for the touch route.

The same npm command also compares rendered pixels for the player, an NPC and vehicles in controlled poses, and checks the artwork and ground collision on every market join. Add the changed placement to `scripts/scenery/scene.js` when extending the town.

## Gotchas

The pavement bollards are in front of the garage pillar. A pedestrian passing behind a bollard can legitimately have one foot hidden. Inspect the torso against the pillar and the feet against the pavement.
