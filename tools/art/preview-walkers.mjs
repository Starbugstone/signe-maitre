// Render the passers-by, fighters and medics walking outside the game, one row per kind and
// facing, columns a twentieth of a second apart, to check that strides match the ground covered.
//   node tools/art/preview-walkers.mjs <out-dir>
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(process.argv[2] || ".verify/walker-preview");

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
import { dude } from "./src/art/pedestrians.js";
import { g, canvas } from "./src/platform/canvas.js";
window.boot = async () => {
  for (const key of ["flatCap","bomber","rigger","chelsea","mariniere","civilian","worker","lady","rescueMedic","scuffle","medicDown"]) {
    const img = new Image(); img.src = imageData[key]; await img.decode(); artwork[key] = img;
  }
};
// Walk each kind across the picture at a pace; one row per (kind, heading), columns are moments.
window.strip = ({ pace = 16, steps = 12, zoom = 6, every = 0.05 }) => {
  const kinds = [["tough","flatCap"],["tough","bomber"],["local","civilian"],["local","lady"],["medic","rescueMedic"]];
  const headings = [0, Math.PI/2, -Math.PI/2, Math.PI];
  const cell = 20*zoom, tall = 19*zoom;
  canvas.width = cell*steps; canvas.height = tall*kinds.length*headings.length;
  g.setTransform(1,0,0,1,0,0);
  g.fillStyle = "#4b3a52"; g.fillRect(0,0,canvas.width,canvas.height);
  kinds.forEach(([kind, look], k) => headings.forEach((a, h) => {
    const n = { x: 0, y: 0, a, kind, look, down: 0, swing: 0, stagger: 0, anger: 0 };
    game.time = 100 + k*10 + h;
    // warm up so the walk is established, then sample
    for (let i = -20; i < steps*3; i++) {
      game.time += every/3;
      n.x += Math.cos(a)*pace*every/3; n.y += Math.sin(a)*pace*every/3;
      const show = i >= 0 && i % 3 === 0;
      g.save();
      const col = Math.floor(i/3), row = k*headings.length + h;
      g.setTransform(zoom,0,0,zoom, col*cell + cell/2 - n.x*zoom, row*tall + tall - 2*zoom - n.y*zoom);
      if (!show) { g.beginPath(); g.rect(0,0,0,0); g.clip(); }
      else { g.beginPath(); g.rect(n.x - cell/2/zoom, n.y - (tall-2*zoom)/zoom, cell/zoom, tall/zoom); g.clip(); }
      dude(n, false);
      g.restore();
    }
  }));
  return canvas.toDataURL();
};
`;
const bundle = await build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, sourcefile: "preview-entry.js" }, bundle: true, write: false, format: "iife", target: "es2022", loader: { ".webp": "dataurl", ".png": "dataurl" } });
// The street modules expect the game page around them.
const shell = await readFile(join(root, "src/shell.html"), "utf8");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.setContent(shell.replace("<!--STYLE-->", "").replace("<!--GAME-->", ""));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => window.boot());
  for (const [name, pace] of [["walk", 16], ["flee", 46]]) {
    const url = await page.evaluate((o) => window.strip(o), { pace, every: pace > 30 ? 0.03 : 0.05 });
    await writeFile(join(out, "walkers-" + name + ".png"), Buffer.from(url.split(",")[1], "base64"));
  }
} finally { await browser.close(); }
console.log("walker previews in " + out);
