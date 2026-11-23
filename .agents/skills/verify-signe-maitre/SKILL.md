---
name: verify-signe-maitre
description: Drive Signé, Maître ! (the Port-Fer browser game) in headless Chromium with real keyboard or touch input, and keep screenshots, a HUD journal and optional video as proof. Use to prove a gameplay, HUD, dialog, language, touch or art change works in the running game, to check the published GitHub Pages build, or before regenerating gameplay captures.
---

# Verify Signé, Maître !

Signé, Maître ! is a static browser game. The player sees the city on a canvas and uses the HTML HUD, toolbar, route and travel cards, dialog and touch pad around it. Run commands from the repository root. Define `pf` in each shell before using the recipes in [the feature map](features/README.md).

```bash
pf() { node .agents/skills/verify-signe-maitre/scripts/pf.mjs "$@"; }
```

## Launch

```bash
npm ci
npm run build
pf doctor
```

Use Node 22 or later. `npm ci` installs esbuild and Playwright Core. Install Chromium separately as described under [Doctor](#doctor). `npm run build` refreshes the small root `index.html` and its hashed script and artwork in `game/`. GitHub Pages serves those files from `main`.

Every journey starts at the étude with the starter sedan, three available files and `€0 · HP 5/5 · Heat 0/3`. The game seeds this state on load. There is no sign-in, database or seed command. Each run starts its own Chromium and gives each journey a fresh browser context. Reloads in that context keep the language and sound preferences in `localStorage`. Runs with distinct IDs can drive the same built checkout without sharing browser state. Finish builds before driving the files they replace. Run doctor while the checkout is idle because it checks for leftover run state.

- **`--build shipped`** is the default. It checks the local publishing files against a fresh build, then opens `index.html` from `file://` with Chromium's `--allow-file-access-from-files` flag.
- **`--build probe`** uses the same esbuild configuration and an inlined page at `.verify/runs/<run-id>/probe.html`. Its read-only `window.__pf.snapshot()` supplies player position, case, wallet, interior and route, pedestrians, ambulance, road fleet, ring trains, boats and moorings for steering or checking side effects. All actions go through player controls.
- **`--url URL`** opens the supplied HTTP address. Use it to match the way players load the shipped build, or to check the deployed GitHub Pages site. Only `needs: "hud"` journeys run in shipped and URL modes.

For the HTTP path, run this block in Bash with Python 3 and ripgrep installed. The server binds to loopback. Set `PF_HTTP_PORT` to another unused port when running multiple servers. The startup check waits for this server's listener, then doctor checks the playable street. The exit trap runs [Cleanup](#cleanup) on success or failure. Use a fresh run ID for each evidence capture.

```bash
(
  set -eu
  pf_port=${PF_HTTP_PORT:-8765}
  pf_url="http://127.0.0.1:$pf_port/index.html"
  pf_run_id="http-$(date -u +%Y%m%dT%H%M%SZ)-$BASHPID"
  pf_server_dir=$(mktemp -d)
  pf_server_pid=
  pf_cleanup() {
    if [ -n "$pf_server_pid" ]; then
      kill "$pf_server_pid" 2>/dev/null || true
      wait "$pf_server_pid" 2>/dev/null || true
    fi
    pf cleanup --run-id "$pf_run_id"
    rm -r -- "$pf_server_dir"
  }
  trap pf_cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  python3 -u -m http.server "$pf_port" --bind 127.0.0.1 >"$pf_server_dir/http.log" 2>&1 &
  pf_server_pid=$!
  for pf_attempt in {1..50}; do
    if rg -Fq "Serving HTTP on 127.0.0.1 port $pf_port " "$pf_server_dir/http.log"; then break; fi
    if ! kill -0 "$pf_server_pid" 2>/dev/null; then break; fi
    sleep 0.1
  done
  if ! rg -Fq "Serving HTTP on 127.0.0.1 port $pf_port " "$pf_server_dir/http.log"; then
    cat "$pf_server_dir/http.log" >&2
    exit 1
  fi
  pf doctor --url "$pf_url"
  pf run map-view --url "$pf_url" --video --run-id "$pf_run_id"
)
```

The game is ready when `#stats` contains `€`. The HUD first displays it after the game decodes its artwork and the street is accepting input. Every journey waits for that state.

## Doctor

`pf doctor` is read-only. It checks Node, Playwright Core, Chromium, HUD key labels, and the contents of `index.html` and each expected file in `game/` against a fresh build. It opens a disposable Chromium session and checks for `€0 · HP 5/5 · Heat 0/3` with no page errors. An active or stranded run directory is also reported. Expect exit 0 and all `ok` lines. Run it before driving and whenever a run behaves strangely.

`pf doctor --url URL` checks whether the requested address boots. The local doctor and HTTP launch together establish that the files being served are the expected build. For an independently deployed URL, confirm its revision through the deployment before attributing results to a commit.

Set `PF_CHROMIUM` to override browser selection. Otherwise `pf` looks in `~/.cache/ms-playwright/`, preferring the newest headless shell. Install one with `npx playwright-core install chromium-headless-shell`. Use `--headed` with a full Chromium binary and a graphical session.

## Drive

```sh
pf run <journey...> [--build shipped|probe] [--url URL]
       [--device desktop|phone|phone-portrait] [--lang en|fr]
       [--video] [--mute] [--headed] [--keep-going] [--run-id ID]
```

- `desktop` is 1280×760 with a keyboard. `phone` is a 740×360 landscape touch screen at 2× scale, and `phone-portrait` is 390×844. On phones, the driver presses the on-screen pad and buttons (`[data-key=up|down|left|right|run|car|job|action]` and `#touchSignal` for **Horn**, **Siren** or **Ship horn** while driving) with real Chrome DevTools Protocol (CDP) touch events, including multi-touch for Run plus a direction. It taps `#mapBtn`, `#reportBtn` and `#quip` for Map, Report and Quip.
- `--lang` sets the browser locale. A fresh game follows the locale, as it does for a real player. `--mute` preselects the game's sound-off preference for that context.
- Journeys live in `journeys/*.mjs`. You can also pass a path to your own `.mjs` file, for example in the scratchpad. A journey exports `meta = { feature, needs: "hud" | "probe" }` and `default async (d) => {}`.

The driver `d` provides these calls.

| Call | What it does |
| --- | --- |
| `d.press(control)`, `d.hold([controls], ms)` | Sends a game control as the player: `up down left right run action car horn job report map quip`. Desktop uses the keys from `src/platform/keys.js`; phones use touch. |
| `d.click(selector)` | Clicks or taps a toolbar button: `#help`, `#language`, `#sound`, `#mapBtn`, `#quip`, `#reportBtn`. |
| `d.choose(stringKey)` | Chooses the dialog button whose text is exactly `t(stringKey)` in the current language. Use keys from `src/ui/strings.js`, such as `take`, `sign`, `goInside` or `back`. |
| `d.t(key, lang?)` | Returns the localized string with control placeholders such as `{job}` filled with the keyboard labels the HUD shows, so one journey works in English and French. `pf doctor` checks these labels against `bindings` in `src/ui/dialogs.js`. |
| `d.hud()` | Returns `district`, `stats`, `ticker`, `hint`, `route{type,title,brief,place,action,distance}`, `travel{type,title,step,distance}`, `report`, `map`, `dialog{heading,copy,choices}` and `lang`. Hidden cards or dialogs return `null`. |
| `d.state()` | Probe only. Returns `window.__pf.snapshot()`. |
| `d.walkTo({x,y}, {tol, run, timeout, until})` | Probe only. Steers on foot or indoors with real direction controls, using short pulses near the target. It tries detours around a blockage and reports the position if stuck. |
| `d.followRoute({timeout})` | Probe only. Walks the street route the game plans to the current objective and stops when the route card reads **On site**. The options are optional. |
| `d.waitFor(what, ({hud, state}) => bool, ms)` | Polls for an observable result and includes the last value if it times out. State is available in probe mode. |
| `d.step(name, fn)` | Runs one user action and records the HUD before and after, a screenshot and, with the probe, a state snapshot. |
| `d.expect(ok, message, data)` | Records a check or fails the journey with the data. |
| `d.shot(name)`, `d.note(message, data)` | Saves an extra numbered screenshot or adds an observation to the summary. |
| `d.page` | The Playwright page. Use its locators to inspect visible labels and call `reload()` to check browser preferences. |

Start with these shipped journeys, then use the [feature map](features/README.md) for the paths affected by the change. The art journeys and their video review steps are in [Hero gait](features/hero-gait.md).

```bash
pf run boot map-view --build shipped
pf run boot map-view --build shipped --device phone --lang fr
```

The runner stops after the first failure unless you pass `--keep-going`. Exit 0 means the journeys passed, 1 means a failure, and 3 means at least one journey was skipped and none failed.

## Evidence

Each run writes to `.verify/evidence/<run-id>/<journey>-<device>-<lang>/`. The `.verify/` folder is ignored by Git. A run contains:

- `NN-<step>.png`, a screenshot after every step, plus `NN-failure.png` if the journey failed;
- `journal.jsonl`, with one JSON line per step containing the HUD before and after, the screenshot name and, with the probe, state;
- `summary.json`, with the result, error, device, language, mode, URL, local build hash (or `remote` in URL mode), checkout commit (`+dirty` when game files have changes), duration and checks;
- `video.webm` with `--video`, recorded without sound. Use the project's capture pipeline when sound must be shown.

Proof standards:

- A pass needs the user action and the resulting state. Use `d.step` around each action and check what the HUD shows. For side effects use a second view, such as reading the filed report at the étude, reloading to confirm a language preference, or observing the wallet, completed files and case stage through the read-only probe.
- Never set game state. The probe has no setters on purpose. Do not add one, and do not reuse the film-direction scripts that place pedestrians or the player. A situation the player cannot reach through controls is not covered by this skill. Say so instead of staging it.
- Page errors and console errors fail the journey.
- A journey skipped on the shipped build or a URL is not proof for that build. Report it as skipped.
- For art changes, as required by `AGENTS.md`, look at the screenshots at gameplay scale on desktop and phone next to existing art. Use `--video` for animation, and cover each direction and state through real input. A passing journey does not prove the visual standard.
- For a live deployment check, run `pf doctor --url https://starbugstone.github.io/signe-maitre/` and `pf run boot map-view --url https://starbugstone.github.io/signe-maitre/` after GitHub Pages serves the intended revision. Report the journey, entry point, device, language and build or URL with its evidence.

## Cleanup

`pf run` normally closes its Chromium and removes `.verify/runs/<id>/` on exit. The HTTP launch block also stops the Python server it started and removes its scratch log. If a run was interrupted, check the recorded harness and Chromium PIDs in `.verify/runs/<id>/pids.json`. Clean up that ID once the harness has stopped.

```sh
pf cleanup --run-id ID
```

Cleanup stops only the recorded PIDs for that run and removes its scratch state. Confirm proof survives with `ls .verify/evidence/ID/*/`. Use the saved PID to stop a manually launched HTTP server and wait for it to exit. Other browser and server sessions can be active on the same host.

## Helpers

- Run `pf help` to list the executable CLI's commands and bundled journeys.
- Run `pf build --probe --run-id inspect-probe` to write and print the path to a standalone probe page. Use `pf cleanup --run-id inspect-probe` after inspection. This helper does not execute a journey or record proof.

For a scenery edit, run `npm run test:scenery` and review the screenshots from its `street-scenery` journey. Extend the foreground checks and the journey for new obstacles or joins. See [Street scenery](features/street-scenery.md).

## Known gaps

- `street-life` checks boarding and departure before braking with Down and exiting. GT delivery, handbrake behaviour, wreck repair and ambulance theft need manual drives. See [Vehicles](features/vehicles.md) and [Fleet](features/fleet.md).
- `street-report` and `ambulance` exercise the two choices for an on-foot scuffle. Traffic injuries, outrage reports and multi-patient dispatch have separate preconditions in [Street incidents](features/street-incident.md).
- The driver sends keyboard and touch input. Check Xbox prompts and controller navigation with a connected controller using [Boot and controls](features/boot-hud.md).
- `walkTo` steers in straight lines between route nodes. A parked car or passing traffic can block it, and it reports that as `Stuck`. Rerun once. If it fails again, record the problem in the feature's Gotchas.
- Journeys run in real time, so a busy machine slows them. Run `uptime` first. With a load average above the core count, phone journeys took 2–4 times longer, but they still passed. If a phone journey fails with `Stuck` while desktop passes, rerun it on a quieter machine before suspecting the game.
