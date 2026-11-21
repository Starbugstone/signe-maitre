import { interior, updateInterior } from "./scenes/interiors.js";
import { $, panel } from "./platform/canvas.js";
import { control, released, trackKonami } from "./platform/keys.js";
import { artwork, clamp, game, held, p } from "./core/state.js";
import { box, refreshLanguage, say, setLanguage, speak, t } from "./ui/dialogs.js";
import { reportIncident } from "./game/rescue.js";
import { beep, enableAudio, gameMix, motorSound, vehicleSignalSound } from "./audio/mixer.js";
import { board } from "./game/boarding.js";
import { interact } from "./game/cases.js";
import { slap } from "./game/slap.js";
import { prepareHero } from "./art/hero.js";
import { prepareTown } from "./world/streets.js";
import { update } from "./game/simulation.js";
import { CELL_H, CELL_W, TAU, X, Y } from "./world/town.js";
import { draw } from "./ui/renderer.js";
import { imageData } from "./art/assets.js";

let konamiProgress = 0;
const signalButtons = document.querySelectorAll("[data-key=horn]");
const touchRun = $("[data-key=run]");

function enterKonamiKey(e) {
  if (panel.open || game.viewMap) return false;
  konamiProgress = trackKonami(e, konamiProgress);
  if (konamiProgress !== -1) return false;
  konamiProgress = 0;
  game.konamiHero = !game.konamiHero;
  return true;
}

function updateVehicleSignal() {
  const ride = game.ride;
  const available = ride && ride.condition !== 0 && !game.viewMap && !panel.open;
  touchRun.hidden = !!available;
  for (const button of signalButtons) button.hidden = !available;
  if (!available) {
    vehicleSignalSound(null);
    return;
  }
  const label = t(ride.medical ? "vehicleSiren" : "vehicleHorn");
  const pressed = ride.medical ? String(!!ride.sirenOn) : null;
  for (const button of signalButtons) {
    if (button.textContent !== label) button.textContent = label;
    if (button.getAttribute("aria-pressed") === pressed) continue;
    if (pressed === null) button.removeAttribute("aria-pressed");
    else button.setAttribute("aria-pressed", pressed);
  }
  let mode = null;
  if (!document.hidden && document.hasFocus()) {
    if (ride.medical && ride.sirenOn) mode = "siren";
    if (!ride.medical && held.has("horn")) mode = "horn";
  }
  vehicleSignalSound(mode);
}

function toggleMap() {
  if (panel.open || interior) return;
  game.viewMap = !game.viewMap;
  konamiProgress = 0;
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
  if (k === "horn") {
    if (!game.ride || game.ride.condition === 0) return;
    if (game.ride.medical) game.ride.sirenOn = !game.ride.sirenOn;
    else held.add(k);
    updateVehicleSignal();
    return;
  }
  held.add(k);
  if (k === "car") board();
  if (k === "job") interact();
  if (k === "report") reportIncident();
  if (k === "action" && !game.ride) slap();
}
addEventListener("keydown", (e) => {
  if (panel.open) return;
  if ((e.key === " " || e.key === "Enter") && e.target.matches?.("button:focus-visible")) return;
  if (enterKonamiKey(e)) {
    e.preventDefault();
    return;
  }
  const k = control(e);
  if (!k) return;
  e.preventDefault();
  if (!e.repeat) press(k);
});
function release(k) {
  held.delete(k);
  if (k === "horn") updateVehicleSignal();
}
function clearInput() {
  held.clear();
  konamiProgress = 0;
  vehicleSignalSound(null);
  motorSound();
}
addEventListener("keyup", (e) => release(released(e)));
addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInput();
});
for (const button of signalButtons) {
  button.onkeydown = (e) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) press("horn");
  };
  button.onkeyup = (e) => {
    if (e.key === " " || e.key === "Enter") release("horn");
  };
  button.onblur = () => release("horn");
}
for (const b of document.querySelectorAll("[data-konami]:not([data-key])"))
  b.onclick = () => enterKonamiKey({ key: b.dataset.konami });
for (const b of document.querySelectorAll("[data-key]")) {
  b.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    enterKonamiKey({ key: b.dataset.konami ?? b.dataset.key });
    press(b.dataset.key);
  };
  b.onlostpointercapture = () => release(b.dataset.key);
  b.onpointerup = () => release(b.dataset.key);
  b.onpointercancel = () => release(b.dataset.key);
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
  artwork.hero = prepareHero();
  artwork.konamiHero = prepareHero(true);
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
  updateVehicleSignal();
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
