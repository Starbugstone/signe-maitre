# Cases: noise, home visit and repossession

There are three case files: **Bass complaint** (Le Boum), **Home visit** (Résidence Mireille) and **Late payment** (the Moutarde GT). The player takes a file at the office or a coloured marker, follows the route card, acts on site, and earns the fee shown in the wallet and ticker.

## Sub-features

- `case-take` opens a file's brief from the office dialog. **Take the file** sets the route card to the case.
- `case-noise` uses **E** on foot at Le Boum to open **Statement of facts**. **Stamp the report** pays `+€125`.
- `case-flat` uses **E** on foot at Résidence Mireille to open **Tag lot 51**. The player then hands the lot over at the auction hall, on foot or by car, for `+€145`.
- `case-repo` uses **F** beside the yellow Moutarde GT to seize it, then the player drives it to the auction hall and presses **E** for `+€190`.
- `case-drop` uses **Return this file** at the office desk to abandon the active case.
- `case-marker` opens a file directly with **E** at its coloured street marker, without visiting the office.

## How to get to it (user POV)

- At the office door or desk, press **E** and choose a file, then **Take the file**.
- Walk to a coloured case marker (`R`, `C` or `S`) and press **E**.
- Follow the gold arrow beside the player or vehicle. The route card reads **On site** on arrival.

## Driving it with pf

Preconditions: use `--build probe` on a fresh game. No case is active.

- **Noise.** Run `pf run noise-case --build probe`. The journey takes `noise` at the office, then uses `d.followRoute()` until the route card reads `t("onSite")` with action `t("useMeter")`. It presses `d.press("job")`, then uses `d.choose("sign")`. The stats begin `€125`, `state().done` includes `noise`, and the ticker includes `+€125`.
- **Home visit.** Run `pf run home-visit --build probe`. The journey takes `flat`, follows the route, presses **job**, uses `d.choose("tag")`, and waits for the route card place `t("auction")`. It follows the route again and presses **job**. The stats begin `€145`.
- **Repossession.** This case is not scripted. A manual recipe: take `repo`, follow the route to `state().target`, press **car** within 22 units, drive to `state().jobs` `auction`, then press **job**. Expect `€190`. A `driveTo` helper is required before it can be a journey.
- **Run both devices.** Repeat each journey with `--device phone --lang fr`.
- **Proof.** Use `04-arrived.png` with **On site** and `06-signed.png` with the wallet and ticker, or `05-sold.png` for the home visit.

## Gotchas

- Wait on the HUD, not on probe state. The route card redraws one frame after `state().stage` changes, so checking the card on the next poll can fail.
- `followRoute` stops at **On site**, which is 36 units from the door. The exact door point can be behind a lamp post or bollard, which blocks a straight walk.
- Cases use real time. The route on foot is about 30 s for noise and about 55 s for the home visit, or 70 s on a phone.
- Passing cars can knock the player over and stop `walkTo`, which reports `Stuck`. Rerun once. If the same place blocks it twice, record that position here.
