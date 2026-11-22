// Draw the fleet with the game's own renderer, outside the game, to judge the baked atlases:
//   - one contact sheet per model and state: all 64 headings, each beside the sedan and the
//     ambulance at the same heading and at gameplay scale;
//   - a line-up of every model parked on a real street painting.
//   node tools/art/fleet-sheet.mjs [out-dir] [model ...]
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(process.argv[2] || ".verify/evidence/fleet-art");
const only = process.argv.slice(3);

function findChromium() {
  if (process.env.PF_CHROMIUM) return process.env.PF_CHROMIUM;
  const cache = join(homedir(), ".cache/ms-playwright"),
    found = [];
  if (existsSync(cache))
    for (const dir of readdirSync(cache)) {
      const file = join(cache, dir, "chrome-headless-shell-linux64/chrome-headless-shell");
      if (/^chromium/.test(dir) && existsSync(file)) found.push(file);
    }
  return found.sort().pop();
}
const entry = `
import { imageData } from "./src/art/assets.js";
import { artwork, game } from "./src/core/state.js";
import { g, canvas } from "./src/platform/canvas.js";
import { drawVehicle } from "./src/art/fleet-art.js";
import { drawAmbulance } from "./src/art/emergency.js";
import { fleet } from "./src/game/fleet.js";
import { prepareTown, streetLayer } from "./src/world/streets.js";
import { office, X, Y } from "./src/world/town.js";
const TAU = Math.PI * 2;
window.boot = async () => {
  await Promise.all(Object.entries(imageData).map(async ([key, src]) => {
    const img = new Image(); img.src = src; await img.decode(); artwork[key] = img;
  }));
  prepareTown();
  return Object.keys(fleet).filter((id) => fleet[id].atlas && id !== "ambulance");
};
const body = (model, x, y, a, condition, more = {}) => ({ x, y, a, model, tint: "cream", condition, speed: 0, slideX: 0, slideY: 0, halfLength: fleet[model].halfLength, halfWidth: fleet[model].halfWidth, ...more });
function draw(v) {
  if (v.model === "ambulance") drawAmbulance({ ...v, medical: true, state: "parked", dx: Math.cos(v.a), dy: Math.sin(v.a) });
  else drawVehicle(v);
}
// 64 headings, 8 to a row. Each cell: sedan, ambulance, then the model, all at one heading.
window.sheet = ({ model, condition, zoom, who }) => {
  const spec = fleet[model], reach = spec.halfLength + 4;
  const cellW = 30 + 34 + 2 * reach, cellH = Math.max(40, 2 * reach * 0.78 + 26);
  canvas.width = Math.round(cellW * 8 * zoom); canvas.height = Math.round(cellH * 8 * zoom);
  game.time = 3; game.ride = null;
  g.setTransform(zoom, 0, 0, zoom, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "low";
  g.fillStyle = "#3d3547"; g.fillRect(0, 0, cellW * 8, cellH * 8);
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU, x = (i % 8) * cellW, y = Math.floor(i / 8) * cellH + cellH * 0.62;
    g.strokeStyle = "#51475c"; g.lineWidth = 0.3; g.strokeRect((i % 8) * cellW, Math.floor(i / 8) * cellH, cellW, cellH);
    draw(body("sedan", x + 15, y, a, condition));
    draw(body("ambulance", x + 30 + 17, y, a, condition));
    const v = body(model, x + 64 + reach, y, a, condition, who === "courier" ? { route: {} } : who === "red" ? { tint: "rose" } : {});
    if (who === "bailiff") game.ride = v;
    draw(v); game.ride = null;
    g.fillStyle = "#b9a9c4"; g.font = "3px monospace"; g.fillText(String(i), (i % 8) * cellW + 1.5, Math.floor(i / 8) * cellH + 4);
  }
  return canvas.toDataURL();
};
// Every model on a real street painting, at eight headings.
window.lineup = ({ zoom, condition }) => {
  const models = ["sedan", "ambulance", "volta", "suv", "moto", "dumper", "bus"];
  const vw = 300, vh = 120, rows = 8;
  const sheet = document.createElement("canvas");
  sheet.width = Math.round(vw * zoom); sheet.height = Math.round(vh * zoom) * rows;
  // The same stretch of the étude's street behind every row.
  const kerbY = Y(office.row);
  const ox = X(office.col) + 32, oy = kerbY - vh / 2;
  game.vw = vw; game.vh = vh; game.time = 3; game.ride = null;
  for (let r = 0; r < rows; r++) {
    canvas.width = sheet.width; canvas.height = Math.round(vh * zoom);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "low";
    streetLayer(ox, oy);
    g.setTransform(zoom, 0, 0, zoom, -ox * zoom, -oy * zoom);
    const a = (r / rows) * TAU;
    let x = ox + 5;
    for (const [i, model] of models.entries()) {
      const spec = fleet[model], span = Math.abs(Math.cos(a)) * spec.halfLength + Math.abs(Math.sin(a)) * spec.halfWidth + 3;
      x += span;
      draw(body(model, x, kerbY + (i % 2 ? 8 : -8), a, condition, model === "moto" && r % 2 ? { route: {} } : {}));
      x += span;
    }
    sheet.getContext("2d").drawImage(canvas, 0, r * canvas.height);
  }
  return sheet.toDataURL();
};
`;
const bundle = await build({
  absWorkingDir: root,
  stdin: { contents: entry, resolveDir: root, sourcefile: "fleet-sheet-entry.js" },
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  loader: { ".webp": "dataurl", ".png": "dataurl" },
});
// The street modules expect the game page around them.
const shell = await readFile(join(root, "src/shell.html"), "utf8");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
const save = async (name, url) => writeFile(join(out, name), Buffer.from(url.split(",")[1], "base64"));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.setContent(shell.replace("<!--STYLE-->", "").replace("<!--GAME-->", ""));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const models = (await page.evaluate(() => window.boot())).filter((id) => !only.length || only.includes(id));
  // 4.27 canvas pixels per world unit is the desktop game's own scale (1280 px across 300 units).
  for (const model of models) {
    for (const [state, condition] of [["intact", 100], ["dented", 50], ["wreck", 0]])
      await save(`${model}-${state}.png`, await page.evaluate((o) => window.sheet(o), { model, condition, zoom: 4.27 }));
    await save(`${model}-intact-2x.png`, await page.evaluate((o) => window.sheet(o), { model, condition: 100, zoom: 8.54 }));
    if (model === "volta")
      await save("volta-red.png", await page.evaluate((o) => window.sheet(o), { model, condition: 100, zoom: 4.27, who: "red" }));
    if (model === "moto")
      for (const who of ["bailiff", "courier"])
        await save(`moto-${who}.png`, await page.evaluate((o) => window.sheet(o), { model, condition: 100, zoom: 4.27, who }));
  }
  if (!only.length)
    for (const [state, condition] of [["intact", 100], ["dented", 50], ["wreck", 0]])
      await save(`lineup-${state}.png`, await page.evaluate((o) => window.lineup(o), { zoom: 4.27, condition }));
} finally {
  await browser.close();
}
console.log("fleet sheets in " + out);
