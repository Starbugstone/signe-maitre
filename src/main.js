import { interior, updateInterior } from "./scenes/interiors.js";
import { $, panel } from "./platform/canvas.js";
import { artwork, clamp, game, held, p } from "./core/state.js";
import { box, refreshLanguage, say, setLanguage, speak, t } from "./ui/dialogs.js";
import { reportIncident } from "./game/rescue.js";
import { beep, enableAudio, gameMix, motorSound } from "./audio/mixer.js";
import { board } from "./game/boarding.js";
import { interact } from "./game/cases.js";
import { slap } from "./game/slap.js";
import { prepareHero } from "./art/hero.js";
import { prepareTown } from "./world/streets.js";
import { update } from "./game/simulation.js";
import { CELL_H, CELL_W, TAU, X, Y } from "./world/town.js";
import { draw } from "./ui/renderer.js";
import { imageData } from "./art/assets.js";

function toggleMap() {
  if (panel.open || interior) return;
  game.viewMap = !game.viewMap;
  held.clear();
  $("#mapBtn").textContent = t(game.viewMap ? "closeMap" : "map");
}
$("#reportBtn").onclick = reportIncident;
$("#mapBtn").onclick = toggleMap;
$("#help").onclick = () => box("help", "helpText", [["back"]]);
$("#quip").onclick = speak;
$("#language").onclick = setLanguage;
$("#sound").onclick = async () => {
  game.sound = !game.sound;
  try {
    localStorage.setItem("port-fer-sound", game.sound ? "on" : "off");
  } catch {}
  if (game.sound) await enableAudio();
  if (gameMix) gameMix.gain.setTargetAtTime(game.sound ? 0.75 : 0, game.audio.currentTime, 0.012);
  if (game.sound) beep(450);
  $("#sound").textContent = t(game.sound ? "audioOn" : "audioOff");
};
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
function press(k) {
  if (game.sound && (!gameMix || game.audio?.state === "suspended")) enableAudio();
  if (interior) {
    if (k === "job") interact();
    else if (["up", "down", "left", "right", "run"].includes(k)) held.add(k);
    return;
  }
  if (k === "quip") {
    speak();
    return;
  }
  if (k === "map") {
    toggleMap();
    return;
  }
  if (game.viewMap || panel.open) return;
  held.add(k);
  if (k === "car") board();
  if (k === "job") interact();
  if (k === "report") reportIncident();
  if (k === "action" && !game.ride) slap();
}
addEventListener("keydown", (e) => {
  if (panel.open) return;
  const k = keys[e.key.toLowerCase()];
  if (!k || (e.target.tagName === "BUTTON" && e.key === " " && e.target.matches(":focus-visible"))) return;
  e.preventDefault();
  if (!e.repeat) press(k);
});
addEventListener("keyup", (e) => held.delete(keys[e.key.toLowerCase()]));
addEventListener("blur", () => {
  held.clear();
  motorSound();
});
for (const b of document.querySelectorAll("[data-key]")) {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    press(b.dataset.key);
  };
  b.onlostpointercapture = () => held.delete(b.dataset.key);
  b.onpointerup = () => held.delete(b.dataset.key);
  b.onpointercancel = () => held.delete(b.dataset.key);
}
refreshLanguage();
say("start", 6, "clerk");
Promise.all(
  Object.entries(imageData).map(async ([key, src]) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    artwork[key] = img;
  }),
).then(() => {
  prepareHero();
  prepareTown();
  game.artReady = true;
});
let prev = 0;
function loop(ms) {
  const dt = prev ? clamp((ms - prev) / 1000, 0, 0.1) : 0;
  prev = ms;
  if (game.artReady && !panel.open && !game.viewMap) {
    const steps = Math.max(1, Math.ceil(dt * 60 - 1e-8));
    for (let step = 0; step < steps; step++) (interior ? updateInterior : update)(dt / steps);
    if (!interior) {
      let follow = 1 - Math.exp(-dt * 6);
      game.camX +=
        (p.x +
          (game.ride ? game.ride.slideX * 0.16 : -16 * Math.sin(((p.x - X(0)) / CELL_W) * TAU)) -
          game.camX) *
        follow;
      game.camY +=
        (p.y +
          (game.ride ? game.ride.slideY * 0.16 : -9 * Math.sin(((p.y - Y(0)) / CELL_H) * TAU)) -
          game.camY) *
        follow;
    }
  }
  motorSound();
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
