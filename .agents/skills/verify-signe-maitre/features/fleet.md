# Road fleet and traffic mix

Saloons, Volta Es, Mastodon 4×4s, buses, dump trucks and motorbikes share the streets. Five seized vehicles wait along the étude's street beside the company saloon. Each model has its own size, handling, engine sound and damage states (intact, dented below 65%, wreck at 0%).

## Sub-features

- `fleet-board` takes the wheel of any model within reach of its body, not only near its centre, so a 12 m bus can be boarded at either end. The ticker names the model (`Volta E · The keys were in it…`).
- `fleet-handling` gives each model its own acceleration, top speed, steering and grip: the Volta E is quick and near-silent, the SUV heavy, the bus and dump truck slow with a wide turning circle, the motorbike fast and twitchy. The HUD names the model beside its speed and condition.
- `fleet-moto` shows the bailiff on the motorbike while he rides it and a courier in blue on motorbikes in traffic; the picture banks into a turn. A parked motorbike stands without a rider.
- `fleet-damage` shares impact damage by mass and divides each vehicle's damage by its insurance factor. Heavier bodies can push parked cars and wrecks aside. Dented and wreck pictures follow the condition.
- `fleet-exit` puts the player beside the body at the sedan's door distance whatever the length or width.
- `fleet-traffic` draws moving and parked vehicles from the [traffic percentage table](../../../../src/game/fleet.js). Alleys only draw vehicles narrow enough to fit. Long vehicles stop with their nose at the junction line and take corners on a wider arc.
- `fleet-bus-stop` makes a line bus pull up for about 3.4 s after about 240 units of travel when it has a clear avenue straight; cars behind pull out around it.
- `fleet-roundabout` lets the bus and dump truck steer around an island while their front and rear overhangs sweep the corner pavement.
- `fleet-sound` uses an electric whine for the Volta E, a diesel with a firing pulse for the bus and dump truck and a higher four-gear engine for the motorbike. Sound cannot be checked from a silent capture.

Ordinary street and avenue spawn weights and full-condition player speed limits come from [the fleet registry](../../../../src/game/fleet.js). Alley traffic draws only the motorbike. The ambulance and seized vehicles are placed separately.

| Model | Moving | Parked | Insurance factor | Top speed (world units/s) |
| --- | ---: | ---: | ---: | ---: |
| Saloon | 46% | 52% | 1 | 181 |
| Volta E | 13% | 14% | 1.1 | 214 |
| Mastodon 4×4 | 15% | 16% | 1.6 | 156 |
| City bus | 7% | 0% | 2.6 | 90 |
| Dump truck | 7% | 0% | 3 | 84 |
| Pétrolette motorbike | 12% | 18% | 0.7 | 236 |

## How to get to it (user POV)

- From the start, walk along the north pavement of the étude's street. Going east past the company sedan, you reach the motorbike, the SUV and the Volta E. Across the junction to the west are the dump truck and bus.
- Stand by any of them and press **F** or tap **Board** or **Bike**. Drive with the usual controls.
- To find the nearest parked motorbike from elsewhere, choose **Motorbike** in **Map & files** and follow the travel card.

## Driving it with pf

Preconditions: `--build probe`. `state().parked` lists parked vehicles with `model`, `label`, `condition` and `showpiece` for the seized vehicles. Traffic entries include the current segment's `roadClass`, `routeId` and `halted` (a bus at a stop).

- **Seized fleet and bus lap.** `pf run fleet --build probe --video` verifies the nameplate, departure, model-specific pace and crash damage when driving the seized vehicles. The bus and dump truck must each lap the Obelisk roundabout west of the étude within a minute. The motorbike reaches 0% with a roadside-assistance hint and the Volta E drops below 65%. The traffic watch requires four models, including a bus or dump truck, and observes one bus halt on an avenue and move off again.
- `pf run fleet-mix --build probe` drives the étude's sedan around town and checks that all six ordinary moving models pass within the player's visible street during the first minute of driving.
- Repeat with `--device phone --lang fr`.
- Art review: `node tools/art/fleet-sheet.mjs` writes contact sheets to `.verify/evidence/fleet-art/`: every model at all 64 headings beside the sedan and the ambulance at gameplay scale, in each state, the two motorbike riders, and a line-up of all models on a street painting. Look at them and at the journey's screenshots; a passing journey does not prove the visual standard.
- `test/fleet.test.js` checks the registry against the bake recipe and the paintings' measurements. `test/traffic.test.js` runs mixed traffic around the city's junctions and bridges. It also runs each heavy vehicle around every roundabout and over la Ferre for 150 seconds, then checks a motorbike alley circuit and sedan exclusion.

## Gotchas

- The journey steers by heading and rams the nearest wall, so the exact crash site varies with traffic. Between vehicles it plans its walk around every parked or crashed vehicle from `state().parked`; moving traffic can still hold it up, so rerun once before suspecting the game.
- The bus and dump truck are insured against knocks (`insurance` in src/game/fleet.js) and lose about 1% per wall impact at kerb-side speeds. The journey only asks them for any damage.
- `fleet-mix` proves sightings, while `test/fleet.test.js` checks the weight totals and seeded model selection. The driving journey checks minimum pace and damage states. Exact top speeds and insurance multipliers are registry values that need controlled comparison to measure in play. The speed limits apply to player driving, and a damaged vehicle has a lower limit.
- A wreck cannot be boarded; the hint offers roadside assistance instead.
- Engine sounds need a manual listen with sound on.
