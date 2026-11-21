import { words } from "./strings.js";
import { game, held } from "../core/state.js";
import { $, canvas, panel } from "../platform/canvas.js";

let lang = navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
let usingGamepad = false;
const bindings = {
  car: ["F", "F", "Y"],
  job: ["E", "E", "A"],
  report: ["R", "R", "RS"],
  map: ["M", "M", "View"],
  action: ["Space", "Espace", "X"],
};
try {
  const saved = localStorage.getItem("port-fer-language");
  if (["en", "fr"].includes(saved)) lang = saved;
} catch {}
function t(key) {
  const pair = words[key];
  if (!pair) return key;
  const language = Number(lang === "fr");
  const text = pair[language];
  return text.includes("{")
    ? text.replace(/\{(\w+)\}/g, (_, control) => bindings[control][usingGamepad ? 2 : language])
    : text;
}
let message = null;
function say(id, seconds = 4, prefix = "", suffix = "") {
  message = { id, prefix, suffix };
  game.msgLife = seconds;
  renderMessage();
}
function renderMessage() {
  const m = message;
  $("#ticker").textContent =
    m && game.msgLife > 0 ? (m.prefix ? t(m.prefix) + " · " : "") + t(m.id) + m.suffix : "";
}
function setLanguage() {
  lang = lang === "fr" ? "en" : "fr";
  try {
    localStorage.setItem("port-fer-language", lang);
  } catch {}
  refreshLanguage();
}
function refreshInputHints() {
  $("#reportBtn").textContent = t("reportKey");
  $("#keys").textContent = t(usingGamepad ? "gamepadControls" : "controls");
  $("#dialogControls").textContent = t("dialogControls");
  renderMessage();
}
function setGamepadMode(enabled) {
  if (usingGamepad === enabled) return;
  usingGamepad = enabled;
  panel.toggleAttribute("data-gamepad", enabled);
  $("#dialogControls").hidden = !enabled;
  refreshInputHints();
}
function refreshLanguage() {
  document.documentElement.lang = lang;
  $("#language").textContent = lang === "en" ? "FR" : "EN";
  $("#language").setAttribute("aria-label", t(lang === "en" ? "frLang" : "enLang"));
  for (const [selector, id] of [
    ["#help", "help"],
    ["#quip", "quip"],
    ["#mapBtn", game.viewMap ? "closeMap" : "map"],
    ["#sound", game.sound ? "audioOn" : "audioOff"],
    ["[data-key=car]", "touchCar"],
    ["[data-key=job]", "touchJob"],
    ["[data-key=action]", game.ride ? "touchBrake" : "touchHit"],
    ["[data-key=run]", "run"],
  ])
    $(selector).textContent = t(id);
  for (const key of ["up", "down", "left", "right"])
    $("[data-key=" + key + "]").setAttribute("aria-label", t(key));
  canvas.setAttribute("aria-label", t("canvas"));
  refreshInputHints();
  if (panel.open && dialogState) renderDialog();
}
let dialogState;
function renderDialog() {
  const { title, copy, choices } = dialogState;
  const heading = $("#heading");
  heading.textContent = t(title);
  // Open long control instructions at their heading on short screens.
  if (title === "help") heading.tabIndex = -1;
  else heading.removeAttribute("tabindex");
  heading.toggleAttribute("autofocus", title === "help");
  const description = $("#copy");
  description.textContent = t(copy);
  description.classList.toggle("keyboard-help", title === "help");
  const controllerHelp = $("#controllerHelp");
  controllerHelp.hidden = title !== "help";
  if (title === "help") controllerHelp.textContent = t("controllerHelp");
  const root = $("#choices");
  root.replaceChildren();
  for (const [name, fn] of choices) {
    const b = document.createElement("button");
    b.textContent = t(name);
    b.onclick = () => {
      panel.close();
      if (fn) fn();
    };
    root.append(b);
  }
  const language = document.createElement("button");
  language.textContent = lang === "en" ? "Français" : "English";
  language.onclick = () => {
    setLanguage();
    root.lastElementChild.focus();
  };
  root.append(language);
}
function box(title, copy, choices) {
  held.clear();
  dialogState = { title, copy, choices };
  renderDialog();
  if (!panel.open) panel.showModal();
  if (title === "help" && usingGamepad) $("#choices button").focus({ preventScroll: true });
}
function speak() {
  if (panel.open || game.viewMap || game.quipCooldown > 0) return;
  game.quipTime = 2.5;
  game.quipCooldown = 1.2;
}

export { box, lang, refreshLanguage, renderMessage, say, setGamepadMode, setLanguage, speak, t };
