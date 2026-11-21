---
name: verify-signe-maitre
description: Drive Signé, Maître ! (the Port-Fer browser game) in headless Chromium with real keyboard or touch input, and keep screenshots, a HUD journal and optional video as proof. Use to prove a gameplay, HUD, dialog, language, touch or art change works in the running game, to check the published GitHub Pages build, or before regenerating gameplay captures.
---

# Verify Signé, Maître !

The game is one static page. `npm run build` bundles `src/` into the root `index.html`, which runs from `file://` or any static server. The player uses a canvas with HTML around it: a HUD, a toolbar, a route card, a ticker, a hint line, a `<dialog id="panel">` and touch buttons. All commands run from the repository root. `pf` is short for this command.

```sh
node .agents/skills/verify-signe-maitre/scripts/pf.mjs
```

Read [features/README.md](features/README.md) before a run. It maps what a player can do and which journey proves it.

## Launch

```sh
npm ci                     # once: esbuild + playwright-core (no browser download)
npm run build              # refresh index.html from src/
node .agents/skills/verify-signe-maitre/scripts/pf.mjs doctor
```

Every `pf run` starts its own headless Chromium and opens the game in a new browser context, so `localStorage` starts empty. It stops that Chromium when it finishes. There is no server or port, so parallel runs do not share state. The game is ready when `#stats` contains `€`. The HUD is only written after the artwork has decoded, so a `€` in `#stats` means the street is drawn and accepts input. Each run waits for that.

Two builds can be driven.

- **`--build shipped`** is the default. It drives `index.html` exactly as committed and refuses to start if `index.html` no longer matches a fresh build of `src/`. Journeys can only read what a player sees.
- **`--build probe`** bundles the same `src/` with the same esbuild settings, writes `.verify/probe.html` and adds the frozen `window.__pf.snapshot()` call. That call returns copies of player position, the active case, the wallet, the interior, the planned street route, the ambulance and downed pedestrians. Journeys use it to steer and to check side effects. It cannot change game state. All actions still go through real keys or touches.

Use `--url <address>` to drive a deployed copy, such as `https://starbugstone.github.io/signe-maitre/`. In that mode, only journeys marked `needs: "hud"` can run. Others are reported as skipped.

## Doctor

`pf doctor` is read-only. It exits 0 only if Node is version 22 or later, `playwright-core` imports, a Chromium binary exists and `index.html` matches `src/`. The game must also boot to `€0 · HP 5/5 · Heat 0/3` without page errors, and `.verify/runs/` must contain no stranded runs. With `--url`, doctor boots that address and skips the freshness check. Run doctor first, and again whenever a run behaves strangely.

Chromium comes from `PF_CHROMIUM`, otherwise from the newest `~/.cache/ms-playwright/chromium*` install. If no binary exists, run `npx playwright-core install chromium-headless-shell`.

## Drive

```sh
pf run <journey...> [--build shipped|probe] [--url URL]
       [--device desktop|phone|phone-portrait] [--lang en|fr]
       [--video] [--mute] [--headed] [--keep-going] [--run-id ID]
```

- `desktop` is 1280×760 with a keyboard. `phone` is a 740×360 landscape touch screen at 2× scale, and `phone-portrait` is 390×844. On phones, the driver presses the on-screen pad and buttons (`[data-key=up|down|left|right|run|car|job|action]` and `#touchSignal` for **Horn** or **Siren**, which only appears in a car) with real Chrome DevTools Protocol (CDP) touch events, including multi-touch for Run plus a direction. It taps `#mapBtn`, `#reportBtn` and `#quip` for Map, Report and Quip.
- `--lang` sets the browser locale. A fresh game follows the locale, as it does for a real player.
- Journeys live in `journeys/*.mjs`. You can also pass a path to your own `.mjs` file, for example in the scratchpad. A journey exports `meta = { feature, needs: "hud" | "probe" }` and `default async (d) => {}`.

The driver `d` provides these calls.

| Call | What it does |
| --- | --- |
| `d.press(control)`, `d.hold([controls], ms)` | Sends a game control as the player: `up down left right run action car horn job report map quip`. Desktop uses the keys from `src/platform/keys.js`; phones use touch. |
| `d.click(selector)` | Clicks or taps a toolbar button: `#help`, `#language`, `#sound`, `#mapBtn`, `#quip`, `#reportBtn`. |
| `d.choose(stringKey)` | Chooses the dialog button whose text is exactly `t(stringKey)` in the current language. Use keys from `src/ui/strings.js`, such as `take`, `sign`, `goInside` or `back`. |
| `d.t(key, lang?)` | Returns the localized string with control placeholders such as `{job}` filled with the keyboard labels the HUD shows, so one journey works in English and French. `pf doctor` checks these labels against `bindings` in `src/ui/dialogs.js`. |
| `d.hud()` | Returns `district`, `stats`, `ticker`, `hint`, `route{type,place,action,distance,compass}` or `null`, `report`, `map`, `dialog{heading,copy,choices}` or `null`, and `lang`. |
| `d.state()` | Probe only. Returns `window.__pf.snapshot()`. |
| `d.walkTo({x,y}, {tol, run, until})` | Probe only. Steers on foot or indoors with real direction controls, using short pulses near the target. When blocked, it sidesteps up to three times before failing with `Stuck` and the position. |
| `d.followRoute()` | Probe only. Walks the street route the game plans to the current objective and stops when the route card reads **On site**. |
| `d.waitFor(what, ({hud, state}) => bool, ms)` | Polls for an observable result and includes the last value if it times out. |
| `d.step(name, fn)` | Runs one user action and records the HUD before and after, a screenshot and, with the probe, a state snapshot. |
| `d.expect(ok, message, data)` | Records a check, or fails the journey with the data. |

The shipped journeys are `boot`, `map-view`, `office-interior`, `noise-case` and `home-visit`. Here is the full regression set on both devices and in both languages:

```sh
pf run boot map-view office-interior noise-case home-visit --build probe --keep-going
pf run boot map-view office-interior noise-case home-visit --build probe --device phone --lang fr --keep-going
```

Use `--keep-going` to continue to the next journey after a failure. Without it, the run stops at the first failure.

## Evidence

Each run writes to `.verify/evidence/<run-id>/<journey>-<device>-<lang>/`. The `.verify/` folder is ignored by Git. A run contains:

- `NN-<step>.png`, a screenshot after every step, plus `failure.png` if the journey failed;
- `journal.jsonl`, with one JSON line per step containing the HUD before and after, the screenshot name and, with the probe, state;
- `summary.json`, with the result, error, device, language, mode, URL, build hash, commit (`+dirty` if `src/` or `index.html` has changes), duration and all checks;
- `video.webm` with `--video`, recorded without sound. Use the project's capture pipeline when sound must be shown.

Proof standards:

- A pass needs the user action and the resulting state. Use `d.step` around each action and check what the HUD shows. For side effects, also check the probe: the wallet, `done`, the interior and the case stage.
- Never set game state. The probe has no setters on purpose. Do not add one, and do not reuse the film-direction scripts that place pedestrians or the player. A situation the player cannot reach through controls is not covered by this skill. Say so instead of staging it.
- Page errors and console errors fail the journey.
- A journey skipped on the shipped build or a URL is not proof for that build. Report it as skipped.
- For art changes, as required by `AGENTS.md`, look at the screenshots at gameplay scale on desktop and phone next to existing art. Use `--video` for animation, and cover each direction and state through real input. A passing journey does not prove the visual standard.
- Before publishing, run `pf doctor --url https://starbugstone.github.io/signe-maitre/` and `pf run boot map-view --url …` against the deployed page.

## Cleanup

`pf run` stops its own Chromium and removes its `.verify/runs/<id>/` state, even after a failure. If a run is killed, its PIDs stay in `.verify/runs/<id>/pids.json`. In that case, run:

```sh
pf cleanup [--run-id ID]
```

This stops only the recorded PIDs and removes the run state. Evidence in `.verify/evidence/` is never removed. Never stop Chromium by name, because other tools on this machine run their own headless Chromium. `.verify/probe.html` is rebuilt on every probe run and can be deleted.

## Helpers

- `scripts/pf.mjs` is the CLI above. Run it with `node`, or run it directly because it is executable.
- `scripts/build.mjs` exports `renderGame({ entry })`. `pf` uses it for the freshness check and the probe, so the probe always uses the shipping esbuild configuration.

## Known gaps

- There is no `driveTo` yet. Repossession, car delivery, handbrake, crash damage and roadside repair need driving and do not have journeys. Their recipes are in the feature map.
- Street incidents and ambulances do not have journeys yet. Knocking down a pedestrian through play depends on who walks past.
- `walkTo` steers in straight lines between route nodes. A parked car or passing traffic can block it, and it reports that as `Stuck`. Rerun once. If it fails again, record the problem in the feature's Gotchas.
- Journeys run in real time, so a busy machine slows them. Run `uptime` first. With a load average above the core count, phone journeys took 2–4 times longer, but they still passed. If a phone journey fails with `Stuck` while desktop passes, rerun it on a quieter machine before suspecting the game.
