const keys = {
  arrowup: "up",
  w: "up",
  z: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  q: "left",
  arrowright: "right",
  d: "right",
  " ": "action",
  f: "car",
  e: "job",
  r: "report",
  m: "map",
  v: "quip",
  shift: "run",
};
const konami = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

function gameKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || typeof e.key !== "string") return undefined;
  return e.key.toLowerCase();
}

// Browser and system shortcuts (Ctrl+R, Cmd+F, Alt+D) stay with the browser.
export function control(e) {
  return keys[gameKey(e)];
}
// A released key always clears its control, whichever modifiers are now down.
export function released(e) {
  return typeof e.key === "string" ? keys[e.key.toLowerCase()] : undefined;
}

export function trackKonami(e, matched) {
  const key = gameKey(e);
  if (!key || e.repeat) return matched;
  if (key === konami[matched]) return matched + 1 === konami.length ? -1 : matched + 1;
  // Extra Up presses can still leave the first two inputs of the code in place.
  return key === konami[0] ? (matched === 2 ? 2 : 1) : 0;
}
