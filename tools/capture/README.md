# Port-Fer showcase capture

Record the current game with Chromium and encode it with FFmpeg. Run these commands from the repository root with Node 22 or newer.

```sh
npm ci
npm run build
export PF_CHROMIUM="$HOME/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell"
node tools/capture/showcase.mjs all
```

Set `FFMPEG` to override `~/.local/bin/ffmpeg` or the binary on PATH. The recorder uses Chromium headless shell and FFmpeg with libx264.

The full run writes five desktop topics, two landscape touch cuts, PNGs and a combined explainer to `.verify/evidence/showcase-60fps/`. The `find` video ends with the GitHub Pages layout. The command also refreshes `port-fer-gameplay.png` and `port-fer-gameplay.mp4` at the repository root. The manifest gives the resolution and byte count for each file, plus the decoded frame count, duration and frame rate for each video.

## Recapture a topic

`drive.mjs` names the driving sources. `cuts.mjs` selects spans around cues in those drives and sets their captions and still frames. To update the train, for example:

```sh
node tools/capture/showcase.mjs plan desktop train
node tools/capture/showcase.mjs capture desktop train
node tools/capture/showcase.mjs assemble
```

Use `capture <device> <topic> <source…>` to recapture selected sources within a topic. After an interrupted capture, use `--resume` to keep completed shots, with the same build and cuts. The input traces, HUD journals and clips are in `.work/` inside the output directory. Assembly reads those clips in the same order as the captions.

## Frame timing

The capture page bundles the shipped source and the verification skill’s read-only observer. The recorder supplies one callback timestamp spaced 1/60 s apart to the game loop. The drive scripts use the same keyboard and CDP touch inputs as the verification journeys. Playback replays the input trace, checks positions and ride state at journey markers, and takes one full Chromium frame for each selected tick. Cuts omit travel and waiting between scenes. Within each cut, the footage plays at game speed.

FFmpeg reads one JPEG per frame at 60 FPS and encodes H.264 with yuv420p. The recorder checks the decoded frame count, cadence and duration and looks for identical decoded frames. The PNGs come from the browser at the chosen gameplay ticks.
