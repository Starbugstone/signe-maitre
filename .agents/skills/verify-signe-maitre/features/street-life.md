# Street life: traffic, pedestrians and getting unstuck

Traffic and pedestrians react to the player and to each other. Drivers ease off and keep a gap, sound the horn at people in the road and pull out around a stopped or wrecked car. Residents jump clear of cars on a collision course, scatter from horns and landed slaps, step around obstacles and return to their beat. Toughs close to striking range, keep apart and take turns to swing, at most two at a time. A walker pressing into a vehicle pinch can recover when there is a clear landing nearby.

## Sub-features

- `traffic-follow` slows behind whatever shares the lane and stops about three units short of it, including the player on foot.
- `traffic-horn` shows `HONK!` / `TUUT !` above a car held up by the player or a pedestrian, and the pedestrian steps away.
- `traffic-pass` swings out around a stopped or wrecked car on a straight, then merges back. Out of sight, a car stuck for six seconds slips through the jam.
- `crowd-dodge` makes a resident leap aside from a car about to hit them and shout `Hey!` / `Eh !`. The player's horn (**H**) scatters nearby residents within 55 units, including those behind the car. Chasing fighters keep pursuing.
- `crowd-scatter` sends residents within 48 units running from a slap that lands.
- `fighters` approach to striking range, keep a body's width apart and circle while two others are already swinging. A hit needs a clear line; the player loses at most one HP per 0.6 s.
- `traffic-pavement` lets a driver held up for over 4 s, with both lanes blocked, mount the kerb on its own side and squeeze past along the pavement, then merge back.
- `traffic-tow` tows a stalled car (wreck or abandoned car) that has held the same traffic car still for 10 s while the player is 30+ units away: the étude sedan goes back to its spot with a clerk line, any other car is removed. Never the car the player is in, the case GT or an ambulance; never onto a walker.
- `unstuck` lets a walker wedged between cars take any step that does not push them deeper, and lifts a walker who keeps pushing in an overlap or a tightly enclosed pocket to a reachable clear spot.

## How to get to it (user POV)

- Get in the sedan beside the étude, stop it in the road and get out. Watch the traffic go around it.
- Drive at a pedestrian, or hold **H** behind one.
- Slap a tough while residents stand nearby.

## Driving it with pf

Preconditions: `--build probe`. The probe snapshot lists moving traffic in `state().traffic`.

- `pf run street-life --build probe` boards the sedan, stops it in a lane, gets out, walks away from the door and watches the lane around the parked sedan for 20 s. It checks for repeated stopped positions near the sedan across eight sample intervals and requires a nonempty traffic sample with at least half moving at the end. The sample records local movement. Review video to identify an individual overtake. `test/traffic.test.js` runs the street headless for five minutes at three blocks and fails if any car stays stopped for 30 s.
- The pinch itself (two cars closing in on a walker) cannot be staged through input. `test/collision.test.js` proves that a walker between two parked cars, or in a V of crashed cars, walks out, and that clear ground still blocks a step into a car.

## Gotchas

- The stopped-in-lane check depends on the starter sedan clearing its parking spot. See the spawn regression in [Vehicles](vehicles.md).
- A car is held up by the player standing in its lane. If the far lane is also blocked, it waits and honks until the player moves; that is intended.
- Dodging depends on timing and on which cars are near; a knock-down through play is still possible at high speed.
- `state().traffic` only includes cars on a route. Parked cars and the player's car are listed separately or not at all.
