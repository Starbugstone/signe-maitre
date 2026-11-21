import { X, Y } from "../world/layout.js";
export { held } from "./controls.js";

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let seed = 71;
export function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
export const artwork = {},
  p = { x: X(2) + 28, y: Y(1) - 25, a: Math.PI / 2, hp: 5 };
export const cars = [],
  people = [],
  trails = [],
  fx = [],
  done = new Set();
export const game = {
  artReady: false,
  konamiHero: false,
  ride: null,
  time: 0,
  heat: 0,
  wallet: 0,
  hitCooldown: 0,
  flash: 0,
  msgLife: 0,
  active: "",
  stage: "",
  viewMap: false,
  sound: true,
  audio: null,
  vw: 0,
  vh: 0,
  camX: p.x,
  camY: p.y,
  lastDir: 1,
  quipTime: 3,
  quipCooldown: 0,
};
try {
  game.sound = localStorage.getItem("port-fer-sound") !== "off";
} catch {}
