import { interior, updateInterior } from "./scenes/interiors.js";
import { $, panel } from "./platform/canvas.js";
import { control, released, trackKonami } from "./platform/keys.js";
import { findGamepad, readGamepad } from "./platform/gamepad.js";
import { artwork, clamp, game, held, p } from "./core/state.js";
import { analog, clearAnalog } from "./core/controls.js";
import { box, refreshLanguage, say, setGamepadMode, setLanguage, speak, t } from "./ui/dialogs.js";
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
const controller = Symbol("gamepad");
const signalKey = Symbol("signal button");
const controllerKonami = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", back: "b", job: "a" };
let gamepad = null, previousPad = null, scene = null;
let waitForNeutral = false, blockStick = false, blockTriggers = false;

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
  if (panel.open) return;
  game.viewMap = !game.viewMap;
  konamiProgress = 0;
  held.clear();
  $("#mapBtn").textContent = t(game.viewMap ? "closeMap" : "map");
}
$("#reportBtn").onclick = reportIncident;
$("#mapBtn").onclick = toggleMap;
function showHelp() {
  box("help", "helpText", [["back"]]);
}
$("#help").onclick = showHelp;
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
function startAudio() {
  if (game.sound && (!gameMix || game.audio?.state === "suspended")) enableAudio();
}
function press(k, source) {
  if (source !== controller) startAudio();
  if (k === "map") {
    toggleMap();
    return;
  }
  if (game.viewMap || panel.open) return;
  if (interior) {
    if (k === "job") interact();
    else if (["up", "down", "left", "right", "run"].includes(k)) held.add(k, source);
    return;
  }
  if (k === "quip") {
    speak();
    return;
  }
  if (k === "horn") {
    if (!game.ride || game.ride.condition === 0) return;
    if (game.ride.medical) game.ride.sirenOn = !game.ride.sirenOn;
    else held.add(k, source);
    updateVehicleSignal();
    return;
  }
  held.add(k, source);
  if (k === "car") board();
  if (k === "job") interact();
  if (k === "report") reportIncident();
  if (k === "action" && !game.ride) slap();
}
const keySource = (e) => `key:${e.code || e.key?.toLowerCase()}`;
const pointerSource = (e) => `pointer:${e.pointerId}`;
addEventListener("keydown", (e) => {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) setGamepadMode(false);
  if (panel.open) return;
  if (game.viewMap && e.target === $("#casebook") && e.key.startsWith("Arrow")) return;
  if ((e.key === " " || e.key === "Enter") && e.target.matches?.("button:focus-visible")) return;
  if (enterKonamiKey(e)) {
    e.preventDefault();
    return;
  }
  const k = control(e);
  if (!k) return;
  e.preventDefault();
  if (!e.repeat) press(k, keySource(e));
});
function release(k, source) {
  held.delete(k, source);
  if (k === "horn") updateVehicleSignal();
}
function clearInput() {
  held.clear();
  waitForNeutral = true;
  konamiProgress = 0;
  vehicleSignalSound(null);
  motorSound();
}
addEventListener("keyup", (e) => release(released(e), keySource(e)));
addEventListener("blur", clearInput);
addEventListener("pointerdown", () => setGamepadMode(false), { capture: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInput();
});
for (const button of signalButtons) {
  button.onkeydown = (e) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) press("horn", signalKey);
  };
  button.onkeyup = (e) => {
    if (e.key === " " || e.key === "Enter") release("horn", signalKey);
  };
  button.onblur = () => release("horn", signalKey);
}
for (const b of document.querySelectorAll("[data-konami]:not([data-key])"))
  b.onclick = () => enterKonamiKey({ key: b.dataset.konami });
for (const b of document.querySelectorAll("[data-key]")) {
  b.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    enterKonamiKey({ key: b.dataset.konami ?? b.dataset.key });
    press(b.dataset.key, pointerSource(e));
  };
  b.onlostpointercapture = b.onpointerup = b.onpointercancel = (e) => release(b.dataset.key, pointerSource(e));
}

function forgetGamepad() {
  for (const key of previousPad?.controls ?? []) release(key, controller);
  clearAnalog();
  previousPad = gamepad = null;
  blockStick = blockTriggers = false;
}
addEventListener("gamepaddisconnected", (e) => {
  if (e.gamepad.index !== gamepad?.index) return;
  forgetGamepad();
  setGamepadMode(false);
});

function inputScene() {
  return panel.open ? panel : game.viewMap ? "map" : interior || game.ride;
}

function controllerDialog(pressed, step) {
  if (pressed.has("back")) {
    panel.close();
    return;
  }
  if (!step && !pressed.has("job")) return;
  const choices = [...panel.querySelectorAll("#choices button")];
  let index = choices.indexOf(document.activeElement);
  if (step) {
    index = index === -1 ? 0 : (index + step + choices.length) % choices.length;
    choices[index]?.focus();
  }
  if (pressed.has("job")) choices[Math.max(0, index)]?.click();
}

function updateGamepad(dt) {
  if (document.hidden || !document.hasFocus()) return;
  const pad = findGamepad(gamepad?.index);
  if (pad?.index !== gamepad?.index || pad?.id !== gamepad?.id) {
    forgetGamepad();
    if (!pad) setGamepadMode(false);
    gamepad = pad;
  }
  if (!pad) return;

  const sample = readGamepad(pad);
  if (waitForNeutral) {
    if (sample.controls.size || sample.stickActive || sample.triggersActive || sample.menuScroll) return;
    waitForNeutral = false;
  }
  const pressed = new Set(sample.controls);
  for (const key of previousPad?.controls ?? []) {
    if (sample.controls.has(key)) pressed.delete(key);
    else release(key, controller);
  }
  const before = inputScene();
  const menuStep = sample.menuStep === previousPad?.menuStep ? 0 : sample.menuStep;
  const moved = (sample.stickActive && !previousPad?.stickActive) ||
    (sample.triggersActive && !previousPad?.triggersActive);
  if (pressed.size || moved || (before === panel && (menuStep || sample.menuScroll))) setGamepadMode(true);
  if (pressed.size || moved) startAudio();
  if (before === panel) {
    if (sample.menuScroll) panel.scrollTop += sample.menuScroll * dt * 420;
    controllerDialog(pressed, menuStep);
  } else if (pressed.has("help")) {
    showHelp();
  } else if (pressed.has("map") || (game.viewMap && pressed.has("back"))) {
    toggleMap();
  } else if (game.viewMap && sample.menuScroll) {
    $("#casebook").scrollTop += sample.menuScroll * dt * 420;
  } else if (game.artReady && !game.viewMap) {
    for (const key of pressed) {
      if (enterKonamiKey({ key: controllerKonami[key] || key })) continue;
      press(key === "back" ? "quip" : key, controller);
      if (inputScene() !== before) break;
    }
  }

  const after = inputScene();
  // A stick or trigger held through a scene change must return to neutral before it acts again.
  const changed = (previousPad && before !== scene) || after !== before;
  blockStick = sample.stickActive && (blockStick || changed);
  blockTriggers = sample.triggersActive && (blockTriggers || changed);
  const playing = after !== panel && after !== "map";
  analog.x = playing && !blockStick ? sample.x : 0;
  analog.y = playing && !blockStick ? sample.y : 0;
  analog.steering = playing && !blockStick ? sample.steering : 0;
  analog.throttle = playing && !blockTriggers ? sample.throttle : 0;
  previousPad = sample;
  scene = after;
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
  updateGamepad(dt);
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
