# Boot, HUD, toolbar and language

The game opens to the streets of Port-Fer at night. The HUD shows money, health and heat. The route card points to the next file, and the toolbar has Map, Controls, Sound, Quip and a language switch. All text is available in English and French.

## Sub-features

- `boot-ready` loads the street with `€0 · HP 5/5 · Heat 0/3` and no page errors.
- `boot-route` shows **Next case · Late payment → Crédit Sec** on the route card.
- `boot-locale` uses French on a fresh game in a French browser and English otherwise.
- `boot-controls` opens and closes the **Controls** dialog, with its heading on screen even on short landscape phones.
- `boot-language` relabels the toolbar, dialog and touch buttons when **FR/EN** changes the language, and remembers the choice across reloads.
- `boot-sound` toggles **Sound on/off** and remembers the setting.

## How to get to it (user POV)

- Open `index.html` or the published page.
- Click or tap **Controls** (`#help`), **FR/EN** (`#language`) or **Sound** (`#sound`) in the toolbar.
- Close a dialog with **Back to the street**. Each dialog also has a language button.

## Driving it with pf

Preconditions: `pf doctor` is all ok.

- **Boot and read the HUD.** Run `pf run boot`. Step `street-ready` checks `€0`, the route card's `Crédit Sec` and the page language.
- **Controls dialog.** The same run opens `#help`, checks the heading is `t("help")` and its top is `>= 0`, then closes the dialog with `d.choose("back")`.
- **Language switch.** The same run clicks `#language`, checks `<html lang>` and checks that the Map button reads `t("map", other)`. It then switches the language back.
- **Phone and French.** Run `pf run boot --device phone --lang fr`.
- **Published build.** Run `pf run boot --url https://starbugstone.github.io/signe-maitre/`.
- **Proof.** Use `.verify/evidence/<run>/boot-<device>-<lang>/01-street-ready.png` through `05-language-restored.png`, along with `summary.json`.

## Gotchas

- Sound and language persistence across reloads are not scripted. Each run starts with empty `localStorage`. To check persistence, reload `d.page` in a custom journey and read the HUD again.
- Space or Enter on a focused toolbar button activates the button. It does not slap. Use `d.click` for toolbar buttons rather than keys.
- `#stats` uses double spaces around `·`. Match with `^€0 ` or a regular expression, not the exact string.
