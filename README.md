# Signé, Maître !

A bilingual browser arcade game set in Port-Fer. Play a French commissaire de justice with a company sedan, a stack of case files, and a very high opinion of himself.

## Play

[Play Signé, Maître ! in your browser](https://starbugstone.github.io/signe-maitre/).

To play a local copy, serve this directory over HTTP. The page loads its script and artwork from `game/`, and browsers block that from a double-clicked file.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then [open the game](http://localhost:8765/index.html). Use **FR** or **EN** in the toolbar to change languages.

| Action | Keyboard | Xbox controller |
| --- | --- | --- |
| Walk | Arrows, WASD or ZQSD | Left stick or D-pad |
| Steer | Left / right | Left stick or D-pad |
| Accelerate, brake and reverse | Up / down | RT / LT, or D-pad up / down |
| Run | Shift + direction | LB + direction |
| Enter or leave a nearby car | F | Y |
| Hold to honk, or press to toggle the ambulance siren | H | RB |
| Slap on foot or pull the handbrake while driving | Space | X |
| Pick up a file, act at a destination, or call for roadside assistance | E | A |
| Write an incident report beside a downed pedestrian | R | Click the right stick (RS) |
| Open or close the city map | M | View |
| Deliver the CJ’s catchphrase | V | B |

Connect an Xbox controller and press a button with the game in focus. Press **Menu** for controls. In dialogs, choose with the left stick or D-pad, confirm with **A**, and go back with **B**. Use the right stick to scroll. **B** also closes the map.

Touch controls appear on small screens. Hold **Run** together with a direction to run. The **Horn** or **Siren** button appears when you take the wheel. Browser shortcuts such as Ctrl+R and Ctrl+F keep their usual meaning.

## Cases

Take work at the étude or at a coloured case marker. Follow the gold arrow beside your character or vehicle along the street route. A gold marker identifies the destination, and the case card shows what to do when you arrive. Between cases the arrow leads to the next unfinished pickup. Open **Map & files** with **M**, the controller’s **View** button or the toolbar to see the route and read a short brief for each open case.

[Case files on the map](port-fer-case-files.png) · [Gameplay clip of a noise complaint and the next pickup](port-fer-case-guidance.mp4)

## Town and interiors

The elevated metro crosses district boundaries on a continuous viaduct. Enter the étude on foot, choose **Go inside the office**, then press **E** or **A** near the desk to take a file or beside the mat to return to the street.

The playable demo has six rows and six columns. Edit the town definition in `src/world/town.js` to add districts, rail corridors, addresses and interiors. The grid supplies world bounds, road centres, canal banks and viewport ranges. Street painting and ambient population are limited to the camera neighbourhood.

## Development

The game is maintained in ES modules. `src/world/` owns layout, terrain, rail and population. `src/scenes/` handles interiors. `src/game/` contains the simulation, vehicles, cases and rescue crews. `src/art/`, `src/audio/` and `src/ui/` draw the world, synthesise sound and handle the interface. Paintings and sprite atlases live in `assets/`. `src/game/fleet.js` lists every vehicle with its size, handling, engine sound and artwork. The optional `tools/art/bake-vehicle.py` rebuilds the 64-heading atlases (intact, dented, wreck) from each vehicle's panel paintings, as set out in `tools/art/fleet-bake.json`; `node tools/art/fleet-sheet.mjs` draws them all as contact sheets with the game's own renderer.

With Node.js 22 or later, run the following from the project folder.

```sh
npm ci
npm test
npm run build
```

Run `npm run test:scenery` for scenery changes. It checks which pixels each object covers and walks the player through the garage and market crossing. Install the browser once with `npx playwright-core install chromium-headless-shell`. CI runs the checks on every push and pull request and saves gameplay screenshots on failure.

The build writes a small root `index.html` and puts the bundled script and the artwork in `game/`, each file named by its content hash. GitHub Pages serves both from `main`, and returning players download only the files that changed. Commit `game/` with `index.html`. District authors can use the [town-generation skill](.agents/skills/port-fer-town/SKILL.md) for connectivity and visual checks.

To drive the built game in headless Chromium and keep screenshots as proof, run `node .agents/skills/verify-signe-maitre/scripts/pf.mjs doctor`. The [verification skill](.agents/skills/verify-signe-maitre/SKILL.md) lists the scripted player journeys.

## Street incidents

After a knockdown, approach on foot and press **R** to record what happened and serve a copy. When the CJ is working a case and hears an insult directed at him, the report records the words as a possible *outrage*. After 12 seconds an ambulance approaches from outside the camera. Its medic can load up to four nearby patients by stretcher before leaving. Anyone still waiting can get another crew. Space can slap the medic, and F beside the ambulance lets you take the wheel. An interrupted stretcher trip leaves its patient available for help. A van that finds the road blocked short of the scene backs out, and dispatch sends another crew by a different approach. The legal reference for the report is [article 433-5 of the French Criminal Code](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054716075/2026-11-11).

Traffic damage depends on how fast vehicles close along the direction of impact. A head-on crash can total the car. Use **E** for roadside assistance if the engine stops.

The streets carry more than sedans: the near-silent Volta E, a heavy 4×4, a line bus that pulls up at its stops, a dump truck and couriers on motorbikes. Any of them can be taken with **F**, and each drives differently: the bus and the truck are slow and swing wide, the motorbike is quick, banks into its turns and folds at the first wall. In a crash the lighter vehicle takes the larger share, and a heavy one shoves parked cars aside. One of each stands at the étude's kerb, seized and waiting for the auction.

## Gameplay and art

- [Gameplay recording with sound](port-fer-gameplay.mp4)
- [Gameplay screenshot](port-fer-gameplay.png)
- [French comedy references behind the street fighters’ taunts](docs/street-dialogue.md)
- [CJ animation frames](cj-slap-frames.png) and [slow-motion comparison](cj-animation.gif)
- [Ambulance artwork](port-fer-ambulance.png) and [in-game pickup](port-fer-rescue.png)
- [Port-Fer concept art](signe-maitre-city.png)

The earlier *Sous pli* [point-and-click prototype](sous-pli.html) and its [concept art](sous-pli-concept.png) are included as part of the project history.
