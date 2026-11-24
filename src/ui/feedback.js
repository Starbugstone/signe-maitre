// Show what the simulation reports (src/core/events.js): its ticker line, its dialogs and its
// sound cues.
import { on } from "../core/events.js";
import { box, renderMessage } from "./dialogs.js";
import { beep, crashSound, footfall, shipHornSound } from "../audio/mixer.js";

const sounds = { beep, crash: crashSound, footfall, shipHorn: shipHornSound };

export function connectFeedback() {
  on("message", renderMessage);
  on("dialog", ({ title, copy, choices }) => box(title, copy, choices));
  on("sound", ({ name, args, after }) => {
    if (after) setTimeout(() => sounds[name](...args), after * 1000);
    else sounds[name](...args);
  });
}
