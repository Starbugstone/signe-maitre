# Boot, HUD, toolbar and language

The game opens to the streets of Port-Fer at night. The HUD shows money, health and heat. The route card points to the next file, and the toolbar has Map & files, Controls, Sound, Quip and a language switch. All text is available in English and French.

## Sub-features

- `boot-ready` loads the street with `€0 · HP 5/5 · Heat 0/3` and no page errors.
- `boot-route` shows **Next case · Late payment → Crédit Sec** on the route card.
- `boot-locale` uses French on a fresh game in a French browser and English otherwise.
- `boot-controls` opens and closes the **Controls** dialog, with its heading on screen even on short landscape phones.
- `boot-language` relabels the toolbar, dialog and touch buttons when **FR/EN** changes the language, and remembers the choice across reloads.
- `boot-sound` toggles **Sound on/off** and remembers the setting.

## How to get to it (user POV)

- Open the local HTTP URL from [Launch](../SKILL.md#launch) or the published page.
- Click or tap **Controls** (`#help`), **FR/EN** (`#language`) or **Sound** (`#sound`) in the toolbar.
- Choose **Back to the street** to close Controls. Use the toolbar language button on the street.

## Driving it with pf

Preconditions: doctor passes against the chosen build or URL. Start each language check in a fresh browser context.

- **Boot and read the HUD.** Run `pf run boot`. Step `street-ready` checks all three localized starting stats, the next file’s title, short brief, destination and the page language.
- **Controls dialog.** The same run opens `#help`, checks the heading is `t("help")` and its top is `>= 0`, then closes the dialog with `d.choose("back")`.
- **Language switch.** The same run clicks `#language`, checks `<html lang>` and checks that the Map button reads `t("map", other)`. It reloads the page, checks the saved language and mission brief, then restores the starting language.
- **Phone and French.** Run `pf run boot --device phone --lang fr`.
- **Published build.** Run `pf run boot --url https://starbugstone.github.io/signe-maitre/`.
- **Proof.** Use `.verify/evidence/<run>/boot-<device>-<lang>/01-street-ready.png` through `05-language-restored.png`, along with `summary.json`.

## Gotchas

- To check sound persistence, run without `--mute`, toggle Sound, reload and compare its label.
- With a physical Xbox controller, press Menu to open Controls, use the D-pad to navigate, A to confirm and B to dismiss. Use View for the city map. Check that prompts follow the most recently used input. This requires a manual controller run.
- Normalize whitespace before comparing the full localized stats line.
