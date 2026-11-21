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
// Browser and system shortcuts (Ctrl+R, Cmd+F, Alt+D) stay with the browser.
export function control(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || typeof e.key !== "string") return undefined;
  return keys[e.key.toLowerCase()];
}
// A released key always clears its control, whichever modifiers are now down.
export function released(e) {
  return typeof e.key === "string" ? keys[e.key.toLowerCase()] : undefined;
}
