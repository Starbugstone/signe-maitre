# Fleet: Volta E, SUV, city bus, dump truck and motorbike

Five more road vehicles share the streets with the sedan and the ambulance. Each has its own size, handling, engine sound and baked artwork in three states (intact, dented below 65%, wreck at 0%). They drive in traffic by weight and road class, stand parked at kerbs, and can be taken with **F** like any car. One of each waits at the étude's kerb as a seized vehicle.

## Sub-features

- `fleet-board` takes the wheel of any model within reach of its body, not only near its centre, so a 12 m bus can be boarded at either end. The ticker names the model (`Volta E · The keys were in it…`).
- `fleet-handling` gives each model its own acceleration, top speed, steering and grip: the Volta E is quick and near-silent, the SUV heavy, the bus and dump truck slow with a wide turning circle, the motorbike fast and twitchy. The HUD names the model beside its speed and condition.
- `fleet-moto` shows the bailiff on the motorbike while he rides it and a courier in blue on motorbikes in traffic; the picture banks into a turn. A parked motorbike stands without a rider.
- `fleet-damage` shares an impact by mass: the lighter vehicle takes more, a heavy one shoves parked cars and wrecks aside, and a wall costs a motorbike far more than a truck. Dented and wreck pictures follow the condition.
- `fleet-exit` puts the player beside the body at the sedan's door distance whatever the length or width.
- `fleet-traffic` draws moving and parked vehicles from the [traffic percentage table](../../../../src/game/fleet.js). Alleys only draw vehicles narrow enough to fit. Long vehicles stop with their nose at the junction line and take corners on a wider arc.
- `fleet-bus-stop` makes a line bus pull up for about 3.4 s after about 240 units of travel when it has a clear avenue straight; cars behind pull out around it.
- `fleet-sound` uses an electric whine for the Volta E, a diesel with a firing pulse for the bus and dump truck and a higher four-gear engine for the motorbike. Sound cannot be checked from a silent capture.

## How to get to it (user POV)

- From the start, walk along the north pavement of the étude's street. Going east past the company sedan, you reach the motorbike, the SUV and the Volta E. Across the junction to the west are the dump truck and bus.
- Stand by any of them and press **F** or tap **Board** or **Bike**. Drive with the usual controls.

## Driving it with pf

Preconditions: `--build probe`. `state().parked` lists parked vehicles with `model`, `label`, `condition` and `showpiece` for the seized vehicles. Traffic entries include the current segment's `roadClass`, `routeId` and `halted` (a bus at a stop).

- `pf run fleet --build probe --video` walks to each seized vehicle, boards it, pulls out, reaches a model-specific speed, crashes it into the buildings on the south side of the street and gets out. The bus and the dump truck first drive west to the roundabout at the end of the étude's street (6,5) and must lap it within a minute (before the fix the bus managed half a lap): long bodies may sweep the corner pavements with their overhangs there. The motorbike is crashed to 0% (wreck picture, roadside-assistance hint) and the Volta E below 65% (dented picture). It then watches traffic until at least four models, including a bus or dump truck, have driven by and the same bus has halted on an avenue and moved off again.
- `pf run fleet-mix --build probe` drives the étude's sedan around town and checks that all six ordinary moving models pass within the player's visible street during the first minute of driving.
- Repeat with `--device phone --lang fr`.
- Art review: `node tools/art/fleet-sheet.mjs` writes contact sheets to `.verify/evidence/fleet-art/`: every model at all 64 headings beside the sedan and the ambulance at gameplay scale, in each state, the two motorbike riders, and a line-up of all models on a street painting. Look at them and at the journey's screenshots; a passing journey does not prove the visual standard.
- `test/fleet.test.js` checks the registry against the bake recipe and the paintings' measurements. `test/traffic.test.js` runs mixed traffic around the city's junctions and bridges. It also runs each heavy vehicle around every roundabout and over la Ferre for 150 seconds, then checks a motorbike alley circuit and sedan exclusion.

## Gotchas

- The journey steers by heading and rams the nearest wall, so the exact crash site varies with traffic. Between vehicles it plans its walk around every parked or crashed vehicle from `state().parked`; moving traffic can still hold it up, so rerun once before suspecting the game.
- The bus and dump truck are insured against knocks (`insurance` in src/game/fleet.js) and lose about 1% per wall impact at kerb-side speeds. The journey only asks them for any damage.
- A wreck cannot be boarded; the hint offers roadside assistance instead.
- Engine sounds need a manual listen with sound on.
