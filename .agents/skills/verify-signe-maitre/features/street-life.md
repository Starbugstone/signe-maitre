# Street life: traffic, pedestrians and getting unstuck

Traffic and pedestrians react to the player and to each other. Drivers ease off and keep a gap, sound the horn at people in the road and pull out around a stopped or wrecked car. Residents jump clear of cars on a collision course, scatter from horns and landed slaps, step around obstacles and return to their beat. Toughs close to striking range, keep apart and take turns to swing, at most two at a time. A player wedged between vehicles can always walk out.

## Sub-features

- `traffic-follow` slows behind whatever shares the lane and stops about three units short of it, including the player on foot.
- `traffic-horn` shows `HONK!` / `TUUT !` above a car held up by the player or a pedestrian, and the pedestrian steps away.
- `traffic-pass` swings out around a stopped or wrecked car on a straight, then merges back. Out of sight, a car stuck for six seconds slips through the jam.
- `crowd-dodge` makes a resident leap aside from a car about to hit them and shout `Hey!` / `Eh !`. The player's horn (**H**) clears people from in front of the car.
- `crowd-scatter` sends residents within 48 units running from a slap that lands.
- `fighters` approach to striking range, keep a body's width apart and circle while two others are already swinging. A hit needs a clear line; the player loses at most one HP per 0.6 s.
- `unstuck` lets a walker wedged between cars take any step that does not push them deeper, and lifts a walker who is overlapping a car and still pushing after 0.45 s to the nearest clear spot reachable in a straight line.

## How to get to it (user POV)

- Get in the sedan beside the étude, stop it in the road and get out. Watch the traffic go around it.
- Drive at a pedestrian, or hold **H** behind one.
- Slap a tough while residents stand nearby.

## Driving it with pf

Preconditions: `--build probe`. The probe snapshot lists moving traffic in `state().traffic`.

- `pf run street-life --build probe` boards the sedan, stops it in a lane, gets out, walks away from the door and watches the lane around the parked sedan for 20 s. No car may stay stopped behind it for 8 s or more, and most traffic must be moving at the end. `test/traffic.test.js` runs the street headless for five minutes at three blocks and fails if any car stays stopped for 30 s.
- The pinch itself (two cars closing in on a walker) cannot be staged through input. `test/collision.test.js` proves that a walker between two parked cars, or in a V of crashed cars, walks out, and that clear ground still blocks a step into a car.

## Gotchas

- A car is held up by the player standing in its lane. If the far lane is also blocked, it waits and honks until the player moves; that is intended.
- Dodging depends on timing and on which cars are near; a knock-down through play is still possible at high speed.
- `state().traffic` only includes cars on a route. Parked cars and the player's car are listed separately or not at all.
