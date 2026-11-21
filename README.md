# Signé, Maître !

A bilingual browser arcade game set in Port-Fer. Play a French commissaire de justice with a company sedan, a stack of case files, and a very high opinion of himself.

## Play

Open [index.html](index.html) in a modern browser. The game, artwork, and sound synthesis are bundled in that file. You can also run a local server from this directory.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then [open the game](http://localhost:8765/index.html). Use **FR** or **EN** in the toolbar to change languages.

| Control | Action |
| --- | --- |
| Arrows, WASD or ZQSD | Walk, or accelerate, reverse and steer |
| Shift + direction | Run |
| F | Enter or leave a nearby car |
| Space | Slap on foot or use the handbrake while driving |
| E | Pick up a file, act at a destination, or call for a repair when a car breaks down |
| R | Write an incident report beside a downed pedestrian |
| M | Open the city map and view the route |
| V | Deliver the CJ’s catchphrase |

Touch controls appear on small screens. Hold **Run** together with a direction to run.

## Cases

Take work at the étude or at a coloured case marker. The HUD arrow points straight at the current objective. On arrival it becomes a dot and the card shows the action to take. Between cases it points to the next unfinished pickup. The city map shows the street route. Seize a vehicle and deliver it to auction, inventory a karaoke deck, or investigate a noise complaint. You can also explore on foot or by car between jobs.

## Town and interiors

The elevated metro crosses district boundaries on a continuous viaduct. Enter the étude on foot, choose **Go inside the office**, then press **E** near the desk to take a file or beside the mat to return to the street.

The playable demo has six rows and six columns. Edit the town definition in `src/world/town.js` to add districts, rail corridors, addresses and interiors. The grid supplies world bounds, road centres, canal banks and viewport ranges. Street painting and ambient population are limited to the camera neighbourhood.

## Development

The game is maintained in ES modules. `src/world/` owns layout, terrain, rail and population. `src/scenes/` handles interiors. `src/game/` contains the simulation, vehicles, cases and rescue crews. `src/art/`, `src/audio/` and `src/ui/` draw the world, synthesise sound and handle the interface. Paintings and sprite atlases live in `assets/`. The optional `tools/art/bake-ambulance.py` rebuilds the turning and damaged ambulance atlases from the painted van.

With Node.js 22 or later, run the following from the project folder.

```sh
npm ci
npm test
npm run build
```

The build embeds the modules, CSS and artwork in the root `index.html` for offline or HTTP play. District authors can use the [town-generation skill](.agents/skills/port-fer-town/SKILL.md) for connectivity and visual checks.

## Street incidents

After a knockdown, approach on foot and press **R** to record what happened and serve a copy. When the CJ is working a case and hears an insult directed at him, the report records the words as a possible *outrage*. After 12 seconds an ambulance approaches from outside the camera. Its medic can load up to four nearby patients by stretcher before leaving. Anyone still waiting can get another crew. Space can slap the medic, and F beside the ambulance lets you take the wheel. An interrupted stretcher trip leaves its patient available for help. The legal reference for the report is [article 433-5 of the French Criminal Code](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054716075/2026-11-11).

Traffic damage depends on how fast vehicles close along the direction of impact. A head-on crash can total the car. Use **E** for roadside assistance if the engine stops.

## Gameplay and art

- [Gameplay recording with sound](port-fer-gameplay.mp4)
- [Gameplay screenshot](port-fer-gameplay.png)
- [CJ animation frames](cj-slap-frames.png) and [slow-motion comparison](cj-animation.gif)
- [Ambulance artwork](port-fer-ambulance.png) and [in-game pickup](port-fer-rescue.png)
- [Port-Fer concept art](signe-maitre-city.png)

The earlier *Sous pli* [point-and-click prototype](sous-pli.html) and its [concept art](sous-pli-concept.png) are included as part of the project history.
