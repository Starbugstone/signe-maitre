import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { renderGame } from "../build.mjs";

const dir = await mkdtemp(join(tmpdir(), "port-fer-scenery-"));
let browser;
try {
  const file = join(dir, "game.html");
  await writeFile(file, await renderGame({ entry: 'import "./scripts/scenery/scene.js";' }));
  browser = await chromium.launch({ executablePath: process.env.PF_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1560, height: 1000 }, offline: true });
  const errors = [],
    failures = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The fixture advances the real simulation and renderer one pose at a time.
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.scenery?.ready(), null, { polling: 50, timeout: 120000 }).catch((error) => {
    throw new Error("The game did not start: " + (errors.join("; ") || error.message));
  });
  const names = await page.evaluate(() => scenery.names);
  for (const name of names) {
    try {
      await page.evaluate((name) => scenery.check(name), name);
      assert.deepEqual(errors.splice(0), []);
      console.log("Passed", name);
    } catch (error) {
      await mkdir(".verify/evidence/scenery-failure", { recursive: true });
      await page.screenshot({ path: ".verify/evidence/scenery-failure/" + name + ".png" });
      failures.push(name + ": " + error.message.split("\n")[0]);
    }
  }
  // Every fixture runs, so one report lists all that need attention.
  if (failures.length) throw new Error("Scenery fixtures failed:\n  " + failures.join("\n  "));
} finally {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
}
