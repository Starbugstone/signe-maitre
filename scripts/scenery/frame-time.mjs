// Time the renderer while the camera crosses the city, as a car would at speed.
//   node scripts/scenery/frame-time.mjs [repository root]
// Pass another checkout as the root to compare two builds with the same route.
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] || join(here, "../.."));
if (root !== resolve(here, "../..")) await copyFile(join(here, "tour.js"), join(root, "scripts/scenery/tour.js"));
const { renderGame } = await import(pathToFileURL(join(root, "scripts/build.mjs")).href);
const dir = await mkdtemp(join(tmpdir(), "port-fer-frames-"));
const browser = await chromium.launch({ executablePath: process.env.PF_CHROMIUM });
try {
  const file = join(dir, "game.html");
  await writeFile(file, await renderGame({ entry: 'import "./scripts/scenery/tour.js";' }));
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, offline: true });
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.tour?.ready(), null, { polling: 50, timeout: 120000 });
  // Grands Boulevards west to east, down the east avenue, back along Quai Sud and over a bridge.
  const times = await page.evaluate(() => {
    const at = (col, row) => Object.values(tour.cell(col, row));
    const path = [at(1, 2), at(13, 2), at(13, 8), at(3, 8), at(3, 5), at(8, 5), at(8, 0)];
    tour.drive(path.slice(0, 2), 40); // decode every plate on the first leg before timing
    return tour.drive(path, 3);
  });
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  console.log(
    JSON.stringify({
      root,
      frames: times.length,
      meanMs: +mean.toFixed(2),
      medianMs: +at(0.5).toFixed(2),
      p95Ms: +at(0.95).toFixed(2),
      p99Ms: +at(0.99).toFixed(2),
      maxMs: +sorted.at(-1).toFixed(2),
      over16ms: times.filter((t) => t > 16.7).length,
    }),
  );
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
