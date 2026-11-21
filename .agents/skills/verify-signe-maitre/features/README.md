# Signé, Maître ! verification map

This folder lists the player-facing behavior of Signé, Maître ! and how to prove each part with `pf`. `pf` is `node .agents/skills/verify-signe-maitre/scripts/pf.mjs`, run from the repository root. Read this index, then use the matching feature file as the recipe.

## Baseline preconditions

- Run `npm ci` once.
- After any change in `src/`, run `npm run build`.
- `pf doctor` must report all `ok` lines.
- Each journey starts a fresh game in its own browser context: `€0 · HP 5/5 · Heat 0/3`. The player starts on foot beside the étude in column 2, row 1, and the Étude 2000 sedan is parked next to them. No case is done.
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
| [City map](./map-view.md) | `map-view` | Scripted for shipped, probe and URL builds |
| [Étude interior](./office-interior.md) | `office-interior` | Scripted for the probe build |
| [Cases: noise, home visit and repossession](./cases.md) | `noise-case`, `home-visit` | Noise and home visit are scripted for the probe build. Repossession is not scripted. |
| [Cars: boarding, driving, damage and repair](./vehicles.md) | none | Not scripted because `driveTo` does not exist |
| [Street incidents and ambulance dispatch](./street-incident.md) | none | Not scripted |
| [Street scenery and railway pillars](./street-scenery.md) | `street-scenery` | Walks the garage pavement and the market alley. `npm run test:scenery` also compares actor and foreground pixels. |
