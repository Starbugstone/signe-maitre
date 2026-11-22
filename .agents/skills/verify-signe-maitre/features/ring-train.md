# Ring railway: La Petite Ceinture

Two or three trainsets of four carriages run clockwise round the ring viaduct and stop at every station. A walker at a station's stair foot climbs to the platform with the car control, boards the next train that opens its doors there, and gets off at a later stop. Riding away from a station loses the heat.

## Sub-features

- `ring-timetable`: the trains move on a fixed timetable derived from the game clock (`src/game/ring-route.js`). They accelerate, cruise and brake between stations, wait 8 s at each platform with the doors open for 5.4 s, and keep a full headway apart. A chime sounds when a train pulls in on screen or at the player's platform.
- `ring-render`: carriages follow the curve at their own heading, 47.7 units above the ground line, in the overhead layer after the viaduct decks (`src/art/train.js`). Cab cars sit at both ends, with headlights in front and red lamps behind. Windows are lit, and the doors glow while open. Tall street props south of a carriage are painted again over it. Until the baked `ringTrainTurns` and `ringTrainCabTurns` atlases are registered, each carriage is a box textured from `assets/metro.webp`.
- `ring-station`: a green **PC** roundel marks each stair foot. Within 14 units on foot, the hint reads **F / Car · Take the Petite Ceinture · <station>**. A car closer than the station takes priority.
- `ring-platform`: the player stands on the platform above the street. The hint reads **On the platform · F / Car · Back to the street**. Pedestrians and inspectors stop chasing, and nobody can strike the player there.
- `ring-ride`: the camera follows the raised carriage. While the doors are open, the hint reads **Doors open: <station> · F / Car · Get off here**. Once the train is moving, it reads **Next stop: <station> · F / Car · Get off there**. After a stop request, it reads **Getting off at <station>**. The player reappears at that station's stair foot, facing south.
- `ring-escape`: stepping off at a station other than the boarding one resets Heat to 0 and calms angry pedestrians. If anyone was still after the player, the ticker reads **Dispatch · The inspectors are still waiting at the other station. Heat dropped.**
- `ring-map`: the city map and minimap show the ring in green with a cream dot at each station. The full map also shows the trains as red dots. The legend lists **○ Ring station**.
- Parked cars stay where they were left, and the active case and finished files are unchanged.

## How to get to it (user POV)

- From the start, walk about 80 units north up the cross street beside the étude to the **PC** roundel under the deck (Centre-Ville). Press **F** (desktop), **Car** (touch) or **Y** (Xbox).
- Wait on the platform. Trains come every 32 s or less on the fallback ring.
- On board, press **F** again to get off at the next stop.

## Driving it with pf

Preconditions: a fresh game. The probe adds `cam`, `transit` and `ring { fallback, deckLift, length, stations[{id,name,s,street,stop}], trains[{k,s,v,station,doors,cars[{x,y,a}]}] }` to the snapshot.

- **Ride.** `pf run ring-train --build probe` walks to the nearest station and checks the station hint. It climbs to the platform, waits until boarded with the doors-open hint, then checks that the player rides in the second carriage and the camera follows the deck. It requests the next stop, rides until the heading has turned by more than 1.4 rad, and steps off at the next station's stair foot. Finally it walks away and checks that the sedan has not moved and the case state is unchanged. `06-mid-corner.png` is taken during the turn.
- **Lose the heat.** `pf run ring-escape --build probe` slaps the tough beside the étude until Heat reaches at least 1. It runs to the platform, rides one stop and checks Heat 0/3, the **lostTail** ticker and unchanged HP.
- **Map.** `pf run map-view` shows the ring on `01-map-open.png`.
- **Depth.** `npm run test:scenery` runs the `ring-train-depth` fixture. A walker behind the deck is partly hidden while a train stands at Centre-Ville, and a walker in front stays fully visible.
- Run both journeys on `desktop/en` and `phone/fr`.

## Gotchas

- `town.ring` comes from the world-v2 branch. Without it, `ringOf(town)` builds a temporary rounded-rectangle loop on the block backs inside the outer streets, with four stations and a plain iron deck and piers drawn by `src/art/train.js`. The temporary side legs cross the old row viaducts at deck height. That is expected until the ring viaduct lands.
- When `town.ring` exists, `ringReplacesLineTrains(town)` stops `src/world/rail.js` from drawing the old straight-line trains. The temporary deck is drawn only for the fallback ring.
- The baked train atlases were not in `art-src/baked/` when this was written, so the atlas drawing path in `drawAtlasCar` has not been seen in the game. Check frame 0 heading, the anchor (`atlasMeta.anchor` in `src/art/train.js`, default 96, 126 at a 192 px frame) and the scale (`atlasMeta.bodyLength`) when registering them.
- The first train reaches Centre-Ville 12 s after a fresh start. A journey that dawdles waits up to one headway, so allow 70 s for boarding.
- Waits on the HUD must include the hint text as well as the state. The hint is written on the next frame.
