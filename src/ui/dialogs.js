import { words } from "./strings.js";
import { game, held } from "../core/state.js";
import { $, canvas, panel } from "../platform/canvas.js";

let lang = navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
try {
  const saved = localStorage.getItem("port-fer-language");
  if (["en", "fr"].includes(saved)) lang = saved;
} catch {}
function t(key) {
  const pair = words[key];
  return pair ? pair[lang === "fr" ? 1 : 0] : key;
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
function refreshLanguage() {
  document.documentElement.lang = lang;
  $("#language").textContent = lang === "en" ? "FR" : "EN";
  $("#language").setAttribute("aria-label", t(lang === "en" ? "frLang" : "enLang"));
  for (const [selector, id] of [
    ["#reportBtn", "reportKey"],
    ["#help", "help"],
    ["#quip", "quip"],
    ["#mapBtn", game.viewMap ? "closeMap" : "map"],
    ["#sound", game.sound ? "audioOn" : "audioOff"],
    ["#keys", "controls"],
    ["[data-key=car]", "touchCar"],
    ["[data-key=job]", "touchJob"],
    ["[data-key=action]", game.ride ? "touchBrake" : "touchHit"],
    ["[data-key=run]", "run"],
  ])
    $(selector).textContent = t(id);
  for (const key of ["up", "down", "left", "right"])
    $("[data-key=" + key + "]").setAttribute("aria-label", t(key));
  canvas.setAttribute("aria-label", t("canvas"));
  renderMessage();
  if (panel.open && dialogState) renderDialog();
}
let dialogState;
function renderDialog() {
  const { title, copy, choices } = dialogState;
  $("#heading").textContent = t(title);
  $("#copy").textContent = t(copy);
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
  language.onclick = setLanguage;
  root.append(language);
}
function box(title, copy, choices) {
  held.clear();
  dialogState = { title, copy, choices };
  renderDialog();
  if (!panel.open) panel.showModal();
}
function speak() {
  if (panel.open || game.viewMap || game.quipCooldown > 0) return;
  game.quipTime = 2.5;
  game.quipCooldown = 1.2;
}

export { box, lang, refreshLanguage, renderMessage, say, setLanguage, speak, t };
