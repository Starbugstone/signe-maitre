import { clamp, game } from "../core/state.js";

const $ = (s) => document.querySelector(s),
  canvas = $("#game"),
  g = canvas.getContext("2d"),
  panel = $("#panel");
function resize() {
  const zoom = clamp(Math.min(innerWidth / 280, innerHeight / 185), 1.95, 5.15);
  game.vw = innerWidth / zoom;
  game.vh = innerHeight / zoom;
  const density = Math.min(devicePixelRatio || 1, innerWidth < 650 ? 1.5 : 1);
  canvas.width = Math.round(innerWidth * density);
  canvas.height = Math.round(innerHeight * density);
  g.setTransform(canvas.width / game.vw, 0, 0, canvas.height / game.vh, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "low";
}
resize();
addEventListener("resize", resize);
function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}
function label(c, s, x, y, color, size = 8) {
  c.font = "bold " + size + "px monospace";
  c.fillStyle = color;
  c.fillText(s, x, y);
}
function hud(selector, value) {
  const el = $(selector);
  if (el.textContent !== value) el.textContent = value;
}

export { $, canvas, g, hud, label, panel, rect };
