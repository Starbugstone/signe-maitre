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
  islands: [{ left, right, top, bottom, prow? }], // prow is the width of each bevel at the island tips
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

The painting key per cell lives in `town.cellKinds[row][col]`; `town.blocks` keeps the first four paintings as the palette the layout validates. New paintings are baked with `tools/art/bake-scenery.mjs`, described in `src/world/paintings.js` and imported in `src/art/assets.js`.

## Map

Port-Fer is a **16 × 12** cell city (`cols 0..15`, `rows 0..11`, world size `4500 × 2652` with `CELL_W = 290`, `CELL_H = 228`).

- **River la Ferre** runs west→east between `row 6` (Quai Nord) and `row 8` (Quai Sud), with open water `y ∈ [1482, 1854]` (`row 7` centre at `y = 1668`). **10 road bridges** cross at columns `1, 3, 4, 6, 8, 10, 11, 12, 13, 14` (all `clearance: true`), leaving open water spans at `0, 2, 5, 7, 9, 15`. **Île de la Ferre** sits on `row 7` across columns `8..10` (`x ∈ [2287, 3083]`, `y ∈ [1590, 1746]`), leaving 108-unit north and south navigable channels, holding **Notre-Dame-du-Port** on the north apron of `(9, 7)`, with the island street and the south-quay mooring in front of it. **Palais de Justice** faces the island from Quai Nord at `(8, 6)`. Six moorings sit on water along the north quay, south quay and island quay.
- **Grand Boulevards** form an avenue ring (`row 2`, `row 10`, `col 2`, `col 13`) linked to the riverside quays (`row 6`, `row 8`) and north–south axes (`col 3`, `col 6`, `col 8`, `col 10`). Four anticlockwise **roundabouts** anchor the network: **Étoile des Saisies** `(3, 3)` (`r = 22`, around Arc des Saisies), **Place de la Contrainte** `(6, 5)` (`r = 18`, around the obelisk), **Rond-Point du Timbre** `(13, 2)` (`r = 15`), and **Place de la Rive-Sud** `(10, 10)` (`r = 15`).
- **Monuments (7)**: Arc des Saisies `(3, 3)`, Tour de Fer `(3, 8)` (roads pass beneath its four corner iron piers), Place de la Contrainte obelisk `(6, 5)`, Hôtel des Ventes opera/auction house `(7, 3)` and Sacré-Créancier hilltop basilica `(8, 0)` (both on the north-west block of their cell, as painted), Palais de Justice `(8, 6)`, and Notre-Dame-du-Port `(9, 7)`.
- **Alleys, parks, tees & dead ends**: Dense *ruelles* (`halfWidth = 7`, admitting walkers and vehicles with `halfWidth ≤ 3.6`) fill **Le Vieux Marais** (`cols 9..12, rows 3..5`), **Quartier Latin** (`cols 9..10, row 9`), and **Butte du Créancier** (`cols 7..9, row 0`), plus four opened mid-cell seam passages (`9.5, 4..5`, `10.5, 3..4`, `6.5, 0..1`, `9.5, 8..9`). Three parks (**Champ-de-Fer** `(3..4, 9)`, **Parc des Buttes-Fiscales** `(14, 3..4)`, **Jardin du Sénat** `(7, 9)`) and five impasses (`(1,4)`, `(12,4)`, `(4,9)`, `(14,3)`, `(7,9)`) provide dead ends and T-junctions.
- **Petite Ceinture ring railway** loops clockwise on a continuous elevated viaduct (`deckLift = 40`) along `row 1` (`y ≈ 271.65`), seam `col 14/15` (`x = 4280`, East Rail Bridge over la Ferre), `row 11` (`y ≈ 2551.65`), and seam `col 0/1` (`x = 220`, West Rail Bridge over la Ferre), with **8 stations** (`porte-etoile`, `butte-creancier`, `buttes-fiscales`, `viaduc-est`, `porte-docks`, `gare-sud`, `champ-fer`, `viaduc-ouest`). Straight-line trains are removed. The corners have a 150-unit radius (`cornerR`, 24 steps per quarter) so the 18 m coaches stay over the deck; each curve stands on a painted column and an iron portal (`cornerSupports` in `src/world/viaduct.js`). The trains are drawn by `drawRingTrains(ox, oy, actors)` in `src/art/train.js`, which `src/ui/renderer.js` calls once after the overhead layers and before `drawOverTrain` (rail-bridge bracing and canopies).
- **Paintings in place**: `town.cellKinds[row][col]` names the painting of every cell; `src/world/paintings.js` records what each shows (arms, pier lines, solids, silhouettes). `tools/art/bake-scenery.mjs` bakes `art-src/scenery/*.png` into `assets/scenery/*.webp` on the plate grid (5 px per world unit). Where a painting could not sit on the published geometry, its registration was adapted and the geometry kept:
  - *La Ferre.* The river paintings are one cell deep; the published river is 372 units bank to bank with a 156-unit island. The baked river plates keep banks, bridge ends, quay walls, trees and the cathedral at painted scale and lengthen only open water, bridge mid-spans, island asphalt and bare paving. The painted island ends are rounded, so the quay wall differs from `town.river.islands[0]`'s bevelled outline by up to about 10 units near the tips.
  - *Petite Ceinture.* `ringSouth` and the four corner paintings put the track 84 to 107 units from `town.ring` (south of the south street, and beside the side streets rather than on the cell seam). The south leg therefore uses the north-leg spans, and the side legs, corners and rail bridges are laid on `town.ring` from the painted deck, brackets, portals, canopies and truss. Corner decks are swept on `town.ring.cornerR` and carried by `cornerSupports`.
  - *Stations.* The painted station stands west of its cross street; the ring stops are 88 units east of it. The baked `ringStation` plates set the station building on the east block so that the platform and the hall door meet `stations[].stop` and `.street`.
  - `riverFootbridge` is not placed: the road graph has no foot-only crossing.
- **Case addresses**: `office` (Étude + interior) at `(7, 5)`, `auction` (Hôtel des Ventes, at the foot of its steps) at `(7, 3)`, `repo` (Crédit Sec) at `(5, 4)` with Moutarde GT on North Boulevard `(5, 2)`, `noise` (Le Boum) at `(9, 5)`, `flat` (Résidence Mireille) at `(6, 6)`.

```text
Col:  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
r00:  +---+---+---+---+---+---+---+.:[B]:.+-+---+---+---+---+---+---+  [B] Sacré-Créancier (8,0)
r01:  +===+===+===[S1]+===+===+===+===+==[S2]+===+===+==[S3]+===+===+  === Petite Ceinture North
r02:  +|  +===+===+===+==[GT]=+===+===+===+===+===+===+==(O)+---+---+  === Grands Boulevards
r03:  +|  +===+==(A)==+===+===+===[V]=+---+:::+-::+---+===+ [P] +  |+  (A) Arc des Saisies (3,3)
r04:  +| [x]  +===+---+--[R]--+---+---+---+:.:+:.:+[x]+===+ [P] +[S4]  [V] Hôtel des Ventes (7,3)
r05: [S8] +===+===+===+===+==(O)==[É]=+---[C]:+:::+-+---+===+---+  |+  (O) Obelisk (6,5) / [É] Étude
r06:  +===+===+===+===+===+==[S]=M+===+===+===+===+===+M+===+===+===+  Quai Nord (M = moorings)
r07: ~|~B~|~  ~|~B~B~ ~|~ ~|~B~ ~|~ ~B[J]==[M]==[N]B~B~B~B~B~ ~|~B~|~  la Ferre + Île (J=Palais, N=Cathedral)
r08:  +===+===+M==[T]=+===+===+===+===+===+===+===+===+===+M+===+===+  Quai Sud / [T] Tour de Fer (3,8)
r09:  +|  +===+===+ [P]   +---+---+[x]+:::+:::+---+===+---+---+---+ |  [P] Parks / [x] Impasses
r10:  +|  +===+===+===+===+===+===+===+===+==(O)==+===+===+===+---+ |  (O) Pl. Rive-Sud (10,10)
r11:  +===+===+===[S7]+===+===+===+===+==[S6]+===+===+==[S5]+===+===+  === Petite Ceinture South

Legend: === Avenue / Blvd   --- Street   ::: Alley (halfWidth 7)   (A)/(O) Roundabout
        [S1..S8] Ring stations   | Ring vertical viaduct   B Road bridge   ~ River la Ferre
        M River mooring   [É/R/C/S/V] Case pins (Étude, Crédit Sec, Le Boum, Mireille, Ventes)
```

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

Ids: `volta` (electric saloon), `suv`, `bus`, `dumper` (dump truck, tipper body), `moto` (motorbike with a rider in the bailiff colours as a separate layer `rider.png`), `barge`, `riverboat`, `speedboat`, `launch`, `ringTrain` (one carriage plus a cab end, two-tone green; baked into `assets/ringTrainTurns.webp` and `assets/ringTrainCabTurns.webp`).

Finished atlases follow the ambulance layout: 64 headings in an 8 × 8 grid, one atlas per state (`intact`, `dented`, `wreck` for road vehicles; boats and the train need `intact` only), baked by Fable into `art-src/baked/<id>Turns.webp`, `<id>Dented.webp` and `<id>Wreck.webp` in the main checkout, with `art-src/baked/<id>.json` (frame size, heading count, body length and ground or waterline origin in pixels) written last as the done marker. The owner of the gameplay copies them to `assets/` and registers them in `src/art/assets.js`. Until an atlas exists, draw a placeholder of the right size.

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

## Ring train hooks (Opus publishes)

The ring train reads `town.ring` through one adapter, `ringOf(town)` in `src/game/ring-route.js`, and throws if a town has none. Stations are sorted by `s`; a station without `s` is projected onto the loop from `stop`. Trains run clockwise at the height `deckLift` above the ground line, the centre of the deck that `src/world/rail.js` paints.

- Each station's platform lies on the side of the track its `street` stair is on (`station.side`: +1 right of travel, −1 left). `src/world/rail.js` paints the platform from 7.4 to 16 units off the centre line, `PLATFORM_HALF_LENGTH` either side of the stop; riders wait 11 units out (`platformSpot`).
- Trainsets are three 18 m coaches (`CAR_LENGTH` 85.6 units, from `art-src/baked/ringTrain.json`). The timetable brakes for curves: the speed limit is √(16 / curvature), held while any coach is on the bend, so about 50 units/s through the 150-unit corners against 92 on the straights. Four trainsets run on the 12 600-unit ring, about 73 s apart.
- `src/ui/renderer.js` calls `drawRingTrains(ox, oy, actors)` after the overhead layers and overhead monuments. `ringActors(ox, oy)` adds the **PC** station roundels to the depth-sorted actors.
- The carriages are the baked `ringTrainTurns` (coach) and `ringTrainCabTurns` (cab) atlases; the rear cab is the cab frame turned round.

## Verification

Every agent proves its work in the running game with the verification skill (`.agents/skills/verify-signe-maitre/SKILL.md`), adds or repairs journeys for what it changes, keeps `npm test` green and runs `npm run test:scenery` for scenery changes. Report what you verified, with evidence paths under `.verify/evidence/`, and what you could not verify.
