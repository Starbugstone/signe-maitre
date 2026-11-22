// Bake the Port-Fer street paintings from art-src/scenery into assets/scenery/*.webp.
//
//   node tools/art/bake-scenery.mjs [--src DIR] [--only name,name] [--quality 0.62] [--png DIR] [--review DIR]
//
// --quality sets the WebP quality of the full plates. They are drawn at or below their own
// size, where 0.62 cannot be told from 0.82; cut-out pieces with soft edges keep 0.82 and the
// over-water masks are lossless.
//
// --review writes a sheet per river plate with its over-water mask, lanterns, boat solids and
// the obstacles of src/world/paintings.js drawn on it, to check the hand-marked shapes.
//
// Every painting is registered to the game's plate grid (5 px per world unit, kerbs on the
// shared kerb lines), graded to the night palette of the first four paintings, and has its
// painted lane dashes lifted, exactly as src/world/streets.js used to do at load time.
// The recipes live in tools/art/scenery-bake/page.js and run in headless Chromium so the
// pixels come from the same canvas implementation the game draws with.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { lantern, paintings, riverMarks, riverPlate } from "../../src/world/paintings.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? fallback : args[i + 1];
};
const src = resolve(option("src", process.env.PF_SCENERY_SRC || join(root, "art-src/scenery")));
const out = join(root, "assets/scenery");
const only = option("only", "")
  .split(",")
  .filter(Boolean);
const quality = Number(option("quality", "0.62"));
const pieces = new Set(["alleyStripV", "alleyStripH", "ringDeck", "ringPortal", "ringBracket", "ringCanopies", "railBridgeBed", "railBridgeTop", "towerIron"]);
const pngDir = option("png", "");
const reviewDir = option("review", "");
const decode = (url) => Buffer.from(url.slice(url.indexOf(",") + 1), "base64");

await mkdir(out, { recursive: true });
if (pngDir) await mkdir(pngDir, { recursive: true });
const manifest = JSON.parse(await readFile(join(src, "manifest.json"), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.PF_CHROMIUM });
try {
  const page = await browser.newPage();
  page.on("console", (message) => console.log("  page:", message.text()));
  page.on("pageerror", (error) => console.error("  page error:", error.message));
  // One origin for the page and the source paintings keeps the canvases readable.
  await page.route("http://bake.local/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>bake</title>" });
    if (path.startsWith("/src/")) return route.fulfill({ path: join(src, path.slice(5)) });
    if (path.startsWith("/assets/")) return route.fulfill({ path: join(root, path.slice(1)) });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://bake.local/");
  await page.addScriptTag({ path: join(root, "tools/art/scenery-bake/page.js") });
  const names = await page.evaluate(([manifest, river]) => bake.init(manifest, river), [manifest, { marks: riverMarks, lantern }]);
  let total = 0;
  for (const name of names) {
    if (only.length && !only.includes(name)) continue;
    const started = Date.now();
    const result = await page.evaluate(([name, quality, png]) => bake.run(name, quality, png), [name, pieces.has(name) ? 0.82 : quality, !!pngDir]);
    const bytes = decode(result.image);
    await writeFile(join(out, name + ".webp"), bytes);
    if (pngDir) await writeFile(join(pngDir, name + ".png"), decode(result.png));
    total += bytes.length;
    console.log(
      name.padEnd(20),
      (result.width + "×" + result.height).padEnd(11),
      (bytes.length / 1024).toFixed(0).padStart(5) + " kB",
      (Date.now() - started + " ms").padStart(8),
    );
  }
  console.log("Total", (total / 1048576).toFixed(2), "MB in", out);
  if (reviewDir) {
    await mkdir(reviewDir, { recursive: true });
    // Cell units from the river cell's centre -> plate pixels.
    const pixel = ([x, y]) => [(x + 145) * 5, (y - riverPlate.top) * 5];
    for (const key of Object.keys(riverMarks)) {
      if (only.length && !only.includes(key)) continue;
      const painting = paintings[key];
      const shapes = [...(painting.solids || []), ...(painting.tall || []).map((item) => item.outline)].map((shape) => shape.map(pixel));
      await writeFile(join(reviewDir, key + ".jpg"), decode(await page.evaluate(([key, shapes]) => bake.review(key, shapes), [key, shapes])));
    }
    console.log("Review sheets in", reviewDir);
  }
} finally {
  await browser.close();
}
