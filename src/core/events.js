// What the street simulation tells the player, without knowing who shows it.
//
// The simulation reports a ticker line, a dialog or a sound cue here. src/ui/feedback.js
// connects them to the ticker, the dialog panel and the mixer in the page. Headless runs and
// tests may connect nothing. Listeners run at once, in the order they were added, so the
// player sees a line or a dialog in the same frame the simulation reports it.
import { game } from "./state.js";

const listeners = new Map();

export function on(type, listener) {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(listener);
  return () => listeners.set(type, listeners.get(type).filter((other) => other !== listener));
}

function emit(type, detail) {
  for (const listener of listeners.get(type) ?? []) listener(detail);
}

// A ticker line: a strings.js key, shown for `seconds`, after an optional speaker and before
// an optional literal suffix. The line is game state; the ticker only draws it.
export function say(id, seconds = 4, prefix = "", suffix = "") {
  game.message = { id, prefix, suffix };
  game.msgLife = seconds;
  emit("message");
}

// The ticker line has run out.
export function clearMessage() {
  emit("message");
}

// A dialog with a title and copy (strings.js keys) and choices [label, action?]. Choosing runs
// the action, which may be part of the simulation.
export function ask(title, copy, choices) {
  emit("dialog", { title, copy, choices });
}

// A sound: the name of a mixer cue and its arguments, optionally `after` seconds.
export function cue(name, ...args) {
  emit("sound", { name, args, after: 0 });
}
export function cueAfter(after, name, ...args) {
  emit("sound", { name, args, after });
}
