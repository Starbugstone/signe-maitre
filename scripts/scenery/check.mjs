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
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The fixture advances the real simulation and renderer one pose at a time.
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.scenery?.ready(), null, { polling: 50 });
  const names = await page.evaluate(() => scenery.names);
  for (const name of names) {
    try {
      await page.evaluate((name) => scenery.check(name), name);
      assert.deepEqual(errors, []);
      console.log("Passed", name);
    } catch (error) {
      await mkdir(".verify/evidence/scenery-failure", { recursive: true });
      await page.screenshot({ path: ".verify/evidence/scenery-failure/" + name + ".png" });
      throw error;
    }
  }
} finally {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
}
