# Ring railway: La Petite Ceinture

Four trainsets of three coaches run clockwise round the ring viaduct (`town.ring`) and stop at all eight stations. A walker at a station's stair foot climbs to the platform with the car control, boards the next train that opens its doors there, and gets off at a later stop. Riding away from a station loses the heat.

## Sub-features

- `ring-timetable`: the trains move on a fixed timetable derived from the game clock (`src/game/ring-route.js`). They accelerate, cruise, slow to about 50 units/s through the corners and brake between stations, wait 8 s at each platform with the doors open for 5.4 s, and keep a full headway apart. A chime sounds when a train pulls in on screen or at the player's platform.
- `ring-render`: coaches from the baked `ringTrainTurns` and `ringTrainCabTurns` atlases (64 headings) follow the curve at their own heading on the deck, `deckLift` (40) above the ground line, in the overhead layer after the painted viaduct decks (`src/art/train.js`), before `drawOverTrain` lays the rail-bridge bracing and the station canopies over them. Cab cars sit at both ends; the front one throws a headlight beam. Window light spills on the platform side and the doors glow while open. Tall street props south of a carriage are painted again over it.
- `ring-platform-art`: the platforms are Fable's paintings. On the north and south legs the `ringStation`/`ringStationB` plates put the platform and its glazed canopies on the street side of the track, with the hall door at the stair foot; on the side legs the painted `ringCanopies` stand either side of the track. The platform side (`stations[].side`) is the street side in every case.
- `ring-corners`: the four curves have a 150-unit radius (`town.ring.cornerR`) so each 18 m coach stays over the painted deck. Each curve stands on a column cut from the north-leg painting, where the track still runs east-west, and an iron portal from the east-leg painting, where it has turned (`cornerSupports` in `src/world/viaduct.js`). North corners: the column on the north pavement beside the cross street, the portal on the far pavement of the street the curve crosses. South corners: the column at the back of the south leg's pavement, the portal in the garage forecourt (west) or yard (east).
- `ring-station`: on the north and south legs the stair foot is the painted station hall's door; on the side legs a green **PC** roundel marks it. Within 14 units on foot, the hint reads **F / Car · Take the Petite Ceinture · <station>**. A car closer than the station takes priority.
- `ring-platform`: the player stands on the platform above the street. The hint reads **On the platform · F / Car · Back to the street**. Pedestrians and inspectors stop chasing, and nobody can strike the player there.
- `ring-ride`: the camera follows the raised carriage. While the doors are open, the hint reads **Doors open: <station> · F / Car · Get off here**. Once the train is moving, it reads **Next stop: <station> · F / Car · Get off there**. After a stop request, it reads **Getting off at <station>**. The player reappears at that station's stair foot, facing south.
- `ring-escape`: stepping off at a station other than the boarding one resets Heat to 0 and calms angry pedestrians. If anyone was still after the player, the ticker reads **Dispatch · The inspectors are still waiting at the other station. Heat dropped.**
- `ring-map`: the city map and minimap show the ring in green with a cream dot at each station. The full map also shows the trains as red dots. The legend lists **○ Ring station**.
- Parked cars stay where they were left, and the active case and finished files are unchanged.

## How to get to it (user POV)

- From the start, follow the streets about 1000 units north to the station hall under the north viaduct (Butte-du-Créancier, below Sacré-Créancier). Press **F** (desktop), **Car** (touch) or **Y** (Xbox).
- Wait on the platform. A train calls every 73 s or less.
- On board, press **F** to get off at the next stop. Without a request the player stays aboard through every stop.

## Driving it with pf

Preconditions: a fresh game. The probe adds `cam`, `transit` and `walkers[{x,y,kind,anger}], ring { deckLift, length, stations[{id,name,s,side,street,stop}], trains[{k,s,v,station,doors,cars[{x,y,a}]}] }` to the snapshot.

- **Ride.** `pf run ring-train --build probe` follows `findRoute` on foot to the nearest station and checks the station hint. It climbs to the platform (on the stair side), waits until boarded with the doors-open hint, then checks that the player rides in the middle coach and the camera follows the deck. It stays aboard through Buttes-Fiscales and Viaduc-Est, round the north-east corner and over the East Rail Bridge, then requests the next stop and steps off at Porte des Docks' stair foot. Finally it walks away and checks that the sedan has not moved and the case state is unchanged. `mid-corner.png` and `on-rail-bridge.png` are taken on the way.
- **Lose the heat.** `pf run ring-escape --build probe` walks to the nearest station, then slaps a passer-by (never a tough or inspector) within 400 units of the stair until Heat passes 1.3 and inspectors turn out. It runs back up to the platform, rides one stop and checks Heat 0/3, the **lostTail** ticker and unchanged HP. Heat fades by about 0.055 a second, so raising it at the étude and running the 1000 units to the station leaves nothing to lose, and the tough there knocks the player out on the way.
- **Map.** `pf run map-view` shows the ring on `01-map-open.png`.
- **Depth and corners.** `npm run test:scenery` runs the `ring-train-depth` fixture (a walker behind the deck is partly hidden while a train stands at Porte de l’Étoile; one in front stays fully visible) and `ring-corners` (each corner column and portal stops a walker and a car, the column covers whoever is behind it, the portal leaves whoever is in front clear, and the row-1 street stays open under the north curves). `test/ring-train.test.js` checks that no span round a corner is longer than a side leg's.
- Run both journeys on `desktop/en` and `phone/fr`.

## Gotchas

- A walker on the ground beside a vertical-leg station (Viaduc-Est, Viaduc-Ouest) is beneath the painted canopies and is hidden by them. That is expected; the depth fixture samples a north-leg station.
- A train is 3 coaches (about 260 units) long; the painted station is about 96 units. The middle coach stops at the canopies and the end coaches stand out over the street either side.
- The trains are drawn after the overhead monuments, so nothing overhead can cover a carriage. Sacré-Créancier stands behind the north leg, so that order is right there.
- The first train reaches the first station 12 s after a fresh start, but the walk to Butte-du-Créancier takes longer, so a journey can wait up to one headway: allow 90 s for boarding.
- The ride journey stays aboard for about two minutes of game time. On a loaded machine it can take three or four.
- Waits on the HUD must include the hint text as well as the state. The hint is written on the next frame.
