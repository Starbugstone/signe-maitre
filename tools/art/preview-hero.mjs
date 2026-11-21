// Render the hero rig outside the game: layer sheets, every stride at gameplay scale and a
// treadmill filmstrip whose ground moves at walking or running pace, to check that planted
// feet stay on their cobble.
//   node tools/art/preview-hero.mjs <out-dir> [--frames] [--soles] [--compare] [--before <revision>]
// --frames: close studies of each facing. --soles: where the shoes meet the ground through a cycle.
// --compare: stills and a film against the rig at an earlier revision.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(process.argv[2] || ".verify/hero-preview");
const frames = process.argv.includes("--frames");
// The four-frame rig this one replaced; pass --before <revision> to compare against another.
const revision = process.argv.includes("--before") ? process.argv[process.argv.indexOf("--before") + 1] : "edcdcb5";

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
import walk from "./assets/walk.webp";
import run from "./assets/run.webp";
import slapping from "./assets/slapping.webp";
import sweep from "./assets/sweep.png";
import konamiHeads from "./assets/konami-heads.webp";
import { artwork } from "./src/core/state.js";
import { drawHero, prepareHero } from "./src/art/hero.js";
import { strides } from "./src/art/gait.js";
import { prepareHero as prepareBefore } from "earlier:hero.js";
window.boot = async () => {
  for (const [key, src] of Object.entries({ walk, run, slapping, sweep, konamiHeads })) {
    const img = new Image();
    img.src = src;
    await img.decode();
    artwork[key] = img;
  }
  window.heroes = { hero: prepareHero(), konami: prepareHero(true) };
  window.before = prepareBefore();
};
window.sheet = (who, key) => window.heroes[who][key].toDataURL();
// One picture: columns are moments of the cycle, rows are facings. zoom is screen pixels per world unit.
window.strip = ({ who = "hero", run = 0, zoom = 4.1, steps = 16, rows = [0, 1, 2, 3], treadmill = false, from = 0, span = 1 }) => {
  const cell = 26 * zoom, tall = 24 * zoom;
  const c = document.createElement("canvas");
  c.width = Math.round(cell * steps); c.height = Math.round(tall * rows.length);
  const g = c.getContext("2d");
  g.fillStyle = "#4b3a52"; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "low";
  rows.forEach((row, j) => {
    for (let i = 0; i < steps; i++) {
      const turn = from + (span * i) / steps;
      g.save();
      g.beginPath(); g.rect(i * cell, j * tall, cell, tall); g.clip();
      g.translate(i * cell + cell / 2, j * tall + tall - 3 * zoom);
      g.scale(zoom, zoom);
      if (treadmill) {
        // Cobbles fixed in the world: the body has travelled turn * 2 strides.
        const travelled = turn * 2 * strides[run > 0.5 ? "run" : "walk"];
        g.fillStyle = "#7b6a80";
        for (let k = -6; k < 7; k++) {
          const at = k * strides.walk / 2 - (travelled % (strides.walk / 2));
          if (row === 0 || row === 3) g.fillRect((row === 3 ? -1 : 1) * at - 0.15, 0.2, 0.3, 1.2);
          else g.fillRect(-9, (row === 1 ? 1 : -1) * at * 0.4, 18, 0.2);
        }
      }
      drawHero(g, window.heroes[who], { row, moving: true, turn, run });
      g.restore();
    }
  });
  return c.toDataURL();
};
// Where the soles meet the ground, in world units from the body: runs of shoe on the bottom scanlines.
window.soles = ({ who = "hero", run = 0, row = 0, turn = 0 }) => {
  const scale = 152 / 19.6, c = document.createElement("canvas");
  c.width = 220; c.height = 160;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.translate(110, 150); g.scale(scale, scale);
  drawHero(g, window.heroes[who], { row, moving: true, turn, run });
  const v = g.getImageData(0, 146, 220, 4).data, runs = [];
  let start = -1;
  for (let x = 0; x <= 220; x++) {
    let solid = false;
    if (x < 220) for (let y = 0; y < 4; y++) if (v[(y * 220 + x) * 4 + 3] > 128) solid = true;
    if (solid && start < 0) start = x;
    if (!solid && start >= 0) { if (x - start > 5) runs.push([start, x - 1]); start = -1; }
  }
  return runs.map(([a, b]) => [+((a - 110) / scale).toFixed(1), +((b - 110) / scale).toFixed(1)]);
};
// The rig this one replaces: four composite frames, the same short stride at both gaits.
function drawBefore(g, row, run, distance) {
  const step = Math.floor(distance / 3.4) % 4;
  g.drawImage(window.before[run ? "run" : "walk"], step * 152, row * 132, 152, 132, -9.8, -16.8, 19.6, 17);
}
function cobbles(g, row, distance) {
  g.fillStyle = "#6f5d78";
  for (let k = -8; k < 9; k++) {
    const at = k * 3.4 - (distance % 3.4);
    if (row === 0 || row === 3) g.fillRect((row === 3 ? -1 : 1) * -at - 0.15, 0.3, 0.3, 1.1);
    else g.fillRect(-7, (row === 1 ? -1 : 1) * at * 0.5, 14, 0.2);
  }
}
// One film frame: before above, after below, each facing on ground that passes at the true pace.
window.film = ({ zoom = 6, time = 0 }) => {
  const cell = 24 * zoom, tall = 25 * zoom, c = document.createElement("canvas");
  c.width = Math.round(cell * 8 + 12); c.height = Math.round((tall + 20) * 2);
  const g = c.getContext("2d");
  g.fillStyle = "#3d2f45"; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "low";
  g.font = "bold 12px system-ui, sans-serif"; g.fillStyle = "#ffd98a";
  [["walk", 24], ["run", 48]].forEach(([gait, pace], half) => {
    const distance = pace * time, run = gait === "run" ? 1 : 0;
    g.fillStyle = "#ffd98a";
    g.fillText(gait + " — before (4 frames, 6.8 stride)", half * (cell * 4 + 12) + 6, 14);
    g.fillText(gait + " — after (stride " + strides[gait] + ", layered rig)", half * (cell * 4 + 12) + 6, tall + 34);
    [0, 1, 2, 3].forEach((row, i) => {
      for (const after of [0, 1]) {
        g.save();
        g.beginPath(); g.rect(half * (cell * 4 + 12) + i * cell, 20 + after * (tall + 20), cell, tall); g.clip();
        g.fillStyle = "#4b3a52"; g.fillRect(0, 0, c.width, c.height);
        g.translate(half * (cell * 4 + 12) + i * cell + cell / 2, 20 + after * (tall + 20) + tall - 4.5 * zoom);
        g.scale(zoom, zoom);
        cobbles(g, row, distance);
        g.fillStyle = "#15112580"; g.beginPath(); g.ellipse(0.7, 0.2, 3.5, 1.2, 0, 0, 7); g.fill();
        if (after) drawHero(g, window.heroes.hero, { row, moving: true, turn: distance / (2 * strides[gait]), run });
        else drawBefore(g, row, run, distance);
        g.restore();
      }
    });
  });
  return c.toDataURL();
};
// Stills at gameplay scale: eight moments of half a cycle, before above after.
window.stills = ({ zoom = 4.1, run = 0 }) => {
  const cell = 21 * zoom, tall = 20 * zoom, c = document.createElement("canvas");
  c.width = Math.round(cell * 8); c.height = Math.round(tall * 8);
  const g = c.getContext("2d");
  g.fillStyle = "#4b3a52"; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "low";
  const gait = run ? "run" : "walk";
  [0, 1, 2, 3].forEach((row) => {
    for (const after of [0, 1])
      for (let i = 0; i < 8; i++) {
        const distance = (i / 8) * 2 * strides[gait];
        g.save();
        g.beginPath(); g.rect(i * cell, (row * 2 + after) * tall, cell, tall); g.clip();
        if (after) { g.fillStyle = "#54425b"; g.fillRect(0, 0, c.width, c.height); }
        g.translate(i * cell + cell / 2, (row * 2 + after) * tall + tall - 1.6 * zoom);
        g.scale(zoom, zoom);
        g.fillStyle = "#15112580"; g.beginPath(); g.ellipse(0.7, 0.2, 3.5, 1.2, 0, 0, 7); g.fill();
        if (after) drawHero(g, window.heroes.hero, { row, moving: true, turn: i / 8, run });
        else drawBefore(g, row, run, distance);
        g.restore();
      }
  });
  return c.toDataURL();
};
window.single = ({ who = "hero", zoom = 4.1, pose }) => {
  const c = document.createElement("canvas");
  c.width = Math.round(26 * zoom); c.height = Math.round(24 * zoom);
  const g = c.getContext("2d");
  g.fillStyle = "#4b3a52"; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height - 3 * zoom); g.scale(zoom, zoom);
  drawHero(g, window.heroes[who], pose);
  return c.toDataURL();
};
`;

// The rig to compare against is read from git, so no copy of it lives in the tree.
const earlier = {
  name: "earlier-rig",
  setup(build) {
    build.onResolve({ filter: /^earlier:/ }, (args) => ({ path: args.path.slice(8), namespace: "earlier" }));
    build.onResolve({ filter: /^\.\/hero-rig\.js$/, namespace: "earlier" }, () => ({ path: "hero-rig.js", namespace: "earlier" }));
    build.onLoad({ filter: /.*/, namespace: "earlier" }, (args) => ({
      contents: execFileSync("git", ["show", `${revision}:src/art/${args.path}`], { cwd: root, encoding: "utf8" }),
      resolveDir: join(root, "src/art"),
    }));
  },
};
const bundle = await build({
  absWorkingDir: root,
  stdin: { contents: entry, resolveDir: root, sourcefile: "preview-entry.js" },
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  loader: { ".webp": "dataurl", ".png": "dataurl" },
  plugins: [earlier],
});
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.setContent("<!doctype html><canvas id=game></canvas><dialog id=panel></dialog>");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => window.boot());
  const save = async (name, url) => writeFile(join(out, name), Buffer.from(url.split(",")[1], "base64"));
  for (const who of ["hero", "konami"])
    for (const key of ["walk", "run", "body", "slapping"]) await save(`${who}-${key}.png`, await page.evaluate(([w, k]) => window.sheet(w, k), [who, key]));
  for (const who of ["hero", "konami"])
    for (const [gait, run] of [["walk", 0], ["run", 1]]) {
      await save(`${who}-${gait}-game.png`, await page.evaluate((o) => window.strip(o), { who, run, zoom: 4.1, steps: 16 }));
      await save(`${who}-${gait}-large.png`, await page.evaluate((o) => window.strip(o), { who, run, zoom: 8, steps: 8, treadmill: true }));
    }
  if (process.argv.includes("--soles"))
    for (const [gait, run, stride] of [["walk", 0, 6.8], ["run", 1, 13.6]]) {
      console.log(gait + ": sole spans on the ground in world units (body travel added), facing right");
      for (let i = 0; i < 32; i++) {
        const turn = i / 32, runs = await page.evaluate((o) => window.soles(o), { run, turn });
        const travel = turn * 2 * stride;
        console.log(turn.toFixed(3), runs.map(([a, b]) => `[${(a + travel).toFixed(1)} ${(b + travel).toFixed(1)}]`).join(" "));
      }
    }
  if (process.argv.includes("--compare")) {
    for (const [gait, run] of [["walk", 0], ["run", 1]])
      await save(`compare-${gait}-gameplay-scale.png`, await page.evaluate((o) => window.stills(o), { run }));
    await mkdir(join(out, "film"), { recursive: true });
    // Three seconds at 30 frames a second; ffmpeg joins them (see the README beside the showcase).
    for (let i = 0; i < 90; i++)
      await save(`film/${String(i).padStart(3, "0")}.png`, await page.evaluate((o) => window.film(o), { time: i / 30 }));
  }
  // Close study: each facing on its own sheet, half a cycle per picture.
  if (frames)
    for (const [gait, run] of [["walk", 0], ["run", 1]])
      for (const row of [0, 1, 2, 3])
        for (const half of [0, 1])
          await save(
            `study-${gait}-row${row}-${half}.png`,
            await page.evaluate((o) => window.strip(o), { run, zoom: 9, steps: 8, rows: [row], treadmill: true, from: half / 2, span: 0.5 }),
          );
} finally {
  await browser.close();
}
console.log("hero previews in " + out);
