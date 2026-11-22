# Signé, Maître ! verification map

This folder lists the player-facing behavior of Signé, Maître ! and how to prove each part with `pf`. `pf` is `node .agents/skills/verify-signe-maitre/scripts/pf.mjs`, run from the repository root. Read this index, then use the matching feature file as the recipe.

## Baseline preconditions

- Run `npm ci` once.
- After any change in `src/`, run `npm run build`.
- `pf doctor` must report all `ok` lines.
- Each journey starts a fresh game in its own browser context: `€0 · HP 5/5 · Heat 0/3`. The player starts on foot beside the étude in column 7, row 5 (Place de la Contrainte), and the Étude 2000 sedan is parked next to them. No case is done.
- Language follows `--lang` (`en` or `fr`), the same way a fresh player's browser locale does.

## Driving conventions

- Act only through player controls: keys on desktop, the touch pad on phones, and the toolbar and dialog buttons. Read the HUD to see what happened.
- Choose dialog buttons by string key with `d.choose("take")`, never by English text or position.
- Steering needs `--build probe`. Shipped and URL runs can only run journeys marked `needs: "hud"`.
- Run every changed feature on `desktop/en` and `phone/fr`. Those two runs cover keyboard and touch input and both languages.

## Proof and skip reporting

- Proof is in `.verify/evidence/<run-id>/<journey>-<device>-<lang>/`: step screenshots, `journal.jsonl` and `summary.json`.
- Name the journey, device, language and build mode with every claim.
- A feature without a journey is unverified until someone drives it. A manual recipe in this map does not count as a run.
- If seed data cannot reach a precondition, the journey fails and the reason goes in Gotchas. Do not weaken the check.

## Feature entry contract

Each feature file begins with an H1 and one paragraph. It then has exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with pf`, and `Gotchas`.

## Features

| Feature | Journey | Status |
| --- | --- | --- |
| [Boot, HUD, toolbar and language](./boot-hud.md) | `boot` | Scripted for shipped, probe and URL builds |
| [City map and case files](./map-view.md) | `map-view` | Scripted for shipped, probe and URL builds |
| [Finding vehicles, boats and trains](./first-minute.md) | `first-minute` | Follows the clerk's tip, map and street HUD to a motorbike, a 4×4, a moored boat and a ring train. Can run against the shipped build. |
| [Étude interior](./office-interior.md) | `office-interior` | Scripted for the probe build |
| [Cases: noise, home visit and repossession](./cases.md) | `noise-case`, `home-visit` | Noise and home visit are scripted for the probe build. Repossession is not scripted. |
| [Cars: boarding, driving, damage and repair](./vehicles.md) | `street-life` | Boarding and departure are checked. The starter sedan stuck in the kerb bollards on `ef81f95`/`253cd55` is fixed; `south-pavement` also drives it off. |
| [Fleet: Volta E, SUV, city bus, dump truck and motorbike](./fleet.md) | `fleet`, `fleet-mix` | Board, drive, crash and leave each model. Pass all road models in ordinary moving traffic and watch a bus serve an avenue stop. |
| [Street incidents and ambulance dispatch](./street-incident.md) | `street-report`, `ambulance` | Separate probe journeys verify filing a copy and waiting for the crew to load a patient. |
| [Hero walk and run animation](./hero-gait.md) | `tools/art/journeys/hero-gait.mjs`, `tools/art/journeys/hero-strides.mjs` | Scripted for the probe build; judged on video |
| [Street life: traffic, pedestrians and getting unstuck](./street-life.md) | `street-life` | The traffic watch follows the sedan departure check. Traffic and collision fixtures also cover pinches and recovery. |
| [Street scenery and railway pillars](./street-scenery.md) | `street-scenery`, `south-pavement`, `city-scenery` | Walks the garage pavement and seam alley, and the south pavement past the old kerb wall. `city-scenery` drives and walks past every monument, onto the island, to a station door and out to a ring corner. `npm run test:scenery` also compares actor and foreground pixels at the monument islands, closed arms, alleys, bridges, quays, Tour de Fer and the ring's legs. |
| [Big city: Paris-like Port-Fer, roundabouts, bridges, alleys and ring viaduct](./big-city.md) | `big-city` | Scripted for the probe build: opens the 16×12 map, drives anticlockwise around a roundabout, verifies anticlockwise roundabout traffic, crosses a river bridge, confirms a wide sedan is refused by an alley while a walker passes through, and visits Gare du Sud beneath the Petite Ceinture ring viaduct. |
| [River boats and moorings](./boats.md) | `boats`, `quay-traffic`, `island-voyage`, `river-traffic` | Board the launch, a barge from beside its hull and a passing barge at Quai Ouest. Sail under bridges and round Île de la Ferre. A 260-second traffic watch checks the two island channels and all road and railway crossings. |
| [Ring railway: La Petite Ceinture](./ring-train.md) | `ring-train`, `ring-escape` | Scripted for the probe build on desktop/en and phone/fr. Rides the published `town.ring`, across a corner and the west rail bridge. |
