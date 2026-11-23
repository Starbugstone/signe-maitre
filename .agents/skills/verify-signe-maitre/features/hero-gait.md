# Hero walk and run animation

The player walks and runs on a layered rig built from the painted walk, run and slap atlases. The walk lands a footfall every 6.8 units with hip rise and an arm that opposes the leg; the run covers 13.6 units per footfall with a flight phase, forward lean and a pumping bent arm. Facing holds through diagonals, starting again after a rest of more than 0.12 s lifts the same foot, and a profile halt from full reach gathers the trailing foot.

## Sub-features

- `gait-walk` and `gait-run` in all four facings, plus diagonals, at gameplay scale.
- `gait-start-stop`: first step from a standstill, settle when halting, standing pose after turning without walking (getting out of a car, going through a door).
- `gait-konami`: the Konami costume uses the same rig; its folio seal stays red.
- `npc-strides`: residents, fighters and walking medics take their stride from the ground they actually cover and stop cycling when they stop.

## How to get to it (user POV)

- Walk with the arrows or WASD, hold Shift to run. Type the Konami code for the costume.

## Driving it with pf

Preconditions: a fresh probe game, with the player on foot beside the étude. Capture video for the gait tour and use the keyboard for the costume sequence.

- `pf run tools/art/journeys/hero-gait.mjs --build probe --video --mute` walks and runs every direction, diagonal and stop for a video. `tools/art/gait-reel.mjs` cuts two recordings into before/after strips.
- `pf run tools/art/journeys/hero-strides.mjs --build probe --mute` photographs mid-stride and halt poses; `tools/art/stride-sheet.mjs` tiles them into a contact sheet. Costume shots use the desktop keyboard. If traffic boxes the player in, the journey records which road views it skipped. Use the indoor gait tour for all four directions.
- `test/gait.test.js` covers facing, stride phase and start/stop rules.

## Gotchas

- Judge animation from video at gameplay scale on desktop and phone; a passing journey does not prove the visual standard.
- Front and back views have only the four painted strides; there are no in-between leg frames there.
