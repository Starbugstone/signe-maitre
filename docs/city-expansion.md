# Port-Fer city expansion: shared contract

This file is the hand-off contract between the agents building the big city. Read it in full before you start. If you must change a contract below, change it here in the same commit and say so in your final report.

Read `AGENTS.md` first. The Port-Fer visual standard and the GTA 1/2 gameplay direction apply to every piece of work.

## Goal

Port-Fer grows from a 6×6 demo grid into a large city that reads as Paris, in the Port-Fer night-time painted style:

- A much larger map (at least 14 columns × 10 rows of cells; 16 × 12 is the target if frame time allows).
- Varied roads: avenues and boulevards, ordinary streets, narrow alleys (ruelles and passages) that only motorbikes, small cars and pedestrians can use, roundabouts (including a star roundabout around a triumphal arch), dead ends and T-junctions.
- Monuments with Paris silhouettes and Port-Fer names (no real names on signs): an iron lattice tower (Tour de Fer) that roads pass beneath, a triumphal arch in a star roundabout (Arc des Saisies), an obelisk on a large square (Place de la Contrainte), a gothic cathedral and the law courts on a river island (Notre-Dame-du-Port, Palais de Justice), an opera-style auction house (Hôtel des Ventes), and a white-domed basilica on a hill with steps (Sacré-Créancier).
- A river (la Ferre) crossing the city west to east, with quays, bridges and at least one island. Players can board and steer several kinds of boat.
- A ring railway (la Petite Ceinture) that loops around the entire city on a viaduct, with stations. Players can board at a station, ride and get off at another.
- New vehicles: an electric saloon in the style of a Tesla Model S (in-game name "Volta E", no real badge), a large SUV, a city bus, a dump truck and a motorbike. Boats: a barge (péniche), a tourist river boat (bateau-promenade), a speedboat and the bailiff's river launch.

Brand names never appear in game text or art. "Tesla" is a style reference only.

## Who owns what

| Area | Owner | Branch / location |
| --- | --- | --- |
| City layout and world engine (`src/world/*` except street paintings, navigation, traffic routing) | Neon (Gemini) | worktree branch `world-v2` |
| Scenery paintings: districts, monuments, roundabouts | Astra A (GPT) | `art-src/scenery/` (git-ignored) |
| Scenery paintings: river, bridges, ring viaduct, stations, alleys | Astra B (GPT) | `art-src/scenery/` (git-ignored) |
| Vehicle, boat and train source art | Astra C (GPT) | `art-src/vehicles/` (git-ignored) |
| Vehicle fleet: registry, baking, rendering, handling, traffic mix | Fable (Claude) | worktree branch `fleet` |
| Ring train: simulation, boarding, ride, rendering | Opus (Claude) | worktree branch `ring-train` |
| Boats: water physics, moorings, boarding, river traffic | Sol (GPT) | worktree branch `boats` |
| Integration, merges to `main`, final verification | Orchestrator | `main` |

Only the orchestrator merges into `main`. Commit to your own branch. Do not push.

Art agents write only below `art-src/`. The finished `.webp` files under `assets/` are produced by the integrating agent (Fable, or the owner of the gameplay that uses them) after checking them in the running game.

## World contract (Neon publishes, everyone else consumes)

Keep the cell grid. A cell is centred on an intersection, `CELL_W = 290`, `CELL_H = 228`, `X(col)`, `Y(row)` as in `src/world/layout.js`. Each cell shows one registered painting. Everything below is in world units and is exported from `src/world/town.js` on the `town` object.

```js
town.roads = {
  nodes: [{ id, col, row, x, y, kind: "cross" | "tee" | "end" | "roundabout", radius? }],
  // class sets the paved half-width: avenue 25, street 25, alley 7.
  edges: [{ a, b, class: "avenue" | "street" | "alley", halfWidth, oneWay?: "a>b" | "b>a" }],
};
town.river = {
  top, bottom,                 // world y range of open water between the quay walls
  islands: [{ left, right, top, bottom }],
  bridges: [{ col, x, halfWidth, clearance: true }], // boats pass under every bridge
  centreline: [{ x, y }],      // west to east, for boat traffic
  moorings: [{ id, x, y, a, quay: { x, y } }], // boat berth + the quay spot where a walker boards
  onWater(x, y, r),            // true when a circle of radius r lies entirely on navigable water
};
town.ring = {
  points: [{ x, y }],          // closed loop, deck centreline at ground-projection coordinates, clockwise
  length,                      // total arc length
  deckLift,                    // how far above its ground projection the deck is drawn (world units)
  stations: [{ id, name: { fr, en }, s, stop: { x, y }, street: { x, y } }],
  // s = arc length of the platform centre; street = stair foot where walkers board/alight
};
town.monuments = [{ id, name: { fr, en }, col, row, x, y, footprint: [[x, y], ...] }];
```

Collision keeps its existing exports. `blockedIn` and `vehicleBlocked` must respect alleys (an alley admits a vehicle only if `vehicle.halfWidth <= 3.6`, which covers motorbikes; walkers always fit), roundabout islands, monument footprints, ring viaduct piers and the river. Boats use `town.river.onWater`, not `vehicleBlocked`.

Until the new paintings land, map new cell kinds onto the four existing paintings (`market`, `garage`, `docks`, `square`) plus simple procedural overlays (roundabout island, alley paving). The painting key per cell lives in `town.blocks[row][col]`. New keys are registered in `src/world/street-props.js` (`plateRegistration`) and `src/art/assets.js`.

## Painting contract (Astra A and B produce, Fable registers)

Copy the framing of the existing street paintings in `assets/market.webp`, `assets/garage.webp`, `assets/docks.webp` and `assets/square.webp`. Pass one of them to the image model as the style and framing reference for every new painting.

- 1500 × 1000 px, elevated 3/4 top-down camera, night, wet cobbles, sodium lamps, neon accents, inked contours, painted texture. Same world scale: a sedan is about 70 px long and a person is about 36 px tall.
- One intersection centred at (750, 500). Roads leave the frame on all four sides at their real widths so neighbouring paintings join. Avenue and street kerbs: north-south road between x ≈ 668 and 838, east-west road between y ≈ 430 and 573. Alley arms are about 50 px wide.
- No vehicles, people, text, logos or UI in the painting. Monuments and buildings may carry fictional French signs only if they are illegible at gameplay scale.
- Paint lane markings lightly; the game paints its own dashes.
- Save the chosen image as `art-src/scenery/<key>.png` and add an entry to `art-src/scenery/manifest.json`:

```json
{ "key": "haussmann", "file": "haussmann.png", "kind": "district",
  "kerbs": { "x": [668, 750, 838], "y": [430, 500, 573] },
  "arms": { "n": "street", "e": "street", "s": "street", "w": "street" },
  "notes": "what is where, anything tall that must occlude actors" }
```

`kerbs` are the measured pixel positions in your final image (west kerb, centre line, east kerb; north kerb, centre line, south kerb). Measure them; do not copy the target numbers.

## Vehicle art contract (Astra C paints, Fable bakes every atlas)

The game shows vehicles from the same elevated camera at 64 headings. The sedan and ambulance are baked from orthographic panel paintings onto a simple 3D body (`tools/art/bake-ambulance.py`, `assets/rescueVan.webp`). New vehicles use the same pipeline.

For each vehicle paint, on a transparent or flat magenta (#ff00ff) background, orthographic panels at the same pixel scale: left side, top (roof/deck), front and rear. Save as `art-src/vehicles/<id>/{side,top,front,rear}.png` plus `art-src/vehicles/<id>/spec.json` with the real length, width and height in metres and the pixel bounds of each panel. Also paint one 3/4 elevated hero view (`hero.png`) to check the baked result against.

Ids: `volta` (electric saloon), `suv`, `bus`, `dumper` (dump truck, tipper body), `moto` (motorbike with a rider in the bailiff colours as a separate layer `rider.png`), `barge`, `riverboat`, `speedboat`, `launch`, `ringTrain` (one carriage plus a cab end, two-tone green like `assets/metro.webp`).

Finished atlases follow the ambulance format: 64 headings, 192 × 192 px per frame, one atlas per state (`intact`, `dented`, `wreck` for road vehicles; boats and the train need `intact` only), baked by Fable into `art-src/baked/<id>Turns.webp`, `<id>Dented.webp` and `<id>Wreck.webp` in the main checkout, with `art-src/baked/<id>.json` (frame size, heading count, body length in px at frame scale) written last as the done marker. The owner of the gameplay copies them to `assets/` and registers them in `src/art/assets.js`. Until an atlas exists, draw a placeholder of the right size.

## Fleet contract (Fable publishes)

`src/game/fleet.js` exports `fleet`, a map from id to:

```js
{ id, name: { fr, en }, domain: "road" | "water" | "rail",
  halfLength, halfWidth,           // world units; sedan is 10.95 × 4.8
  mass, topSpeed, reverseSpeed, accel, brake, steer, grip,
  sound: "petrol" | "electric" | "diesel" | "moto" | "boat",
  atlas: { intact, dented?, wreck? }, // artwork keys
  traffic: { weight, lanes: ["avenue", "street", "alley"?] } }
```

Vehicles in `cars` carry `model` (a fleet id). Driving, collision and rendering read the fleet entry instead of the sedan constants.

## Verification

Every agent proves its work in the running game with the verification skill (`.agents/skills/verify-signe-maitre/SKILL.md`), adds or repairs journeys for what it changes, keeps `npm test` green and runs `npm run test:scenery` for scenery changes. Report what you verified, with evidence paths under `.verify/evidence/`, and what you could not verify.
