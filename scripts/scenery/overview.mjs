// Capture the whole city as one stitched image, and one gameplay-scale frame per distinct painting.
//   node scripts/scenery/overview.mjs [outDir]
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { renderGame } from "../build.mjs";

const out = resolve(process.argv[2] || ".verify/evidence/scenery-overview");
const only = process.argv[3] || "all";
await mkdir(out, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "port-fer-tour-"));
const browser = await chromium.launch({ executablePath: process.env.PF_CHROMIUM });
const save = async (name, dataUrl) =>
  writeFile(join(out, name), Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
try {
  const file = join(dir, "game.html");
  await writeFile(file, await renderGame({ entry: 'import "./scripts/scenery/tour.js";' }));
  const open = async (viewport) => {
    const page = await browser.newPage({ viewport, offline: true });
    page.on("pageerror", (error) => console.error("page error:", error.message));
    await page.addInitScript(() => {
      window.requestAnimationFrame = () => 0;
    });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.tour?.ready(), null, { polling: 50, timeout: 120000 });
    return page;
  };

  if (only === "all" || only === "overview") {
    // The lowest zoom the game allows (1.95 px per world unit) in full-width strips.
    const info = await (async () => {
      const probe = await open({ width: 800, height: 360 });
      const t = await probe.evaluate(() => tour.town());
      await probe.close();
      return t;
    })();
    const zoom = 1.95,
      across = 3;
    // Three columns of strips: one viewport as wide as the city holds too many plates at once.
    const page = await open({ width: Math.round((info.width / across) * zoom), height: 360 });
    const t = await page.evaluate(() => tour.town());
    // Each tile goes straight from the game canvas onto one big canvas in the page.
    for (let i = 0; i < across; i++)
      for (let top = 0; top < t.height; top += t.vh) {
        const y = Math.min(top, t.height - t.vh),
          x = Math.min(i * t.vw, t.width - t.vw);
        await page.evaluate(
          ([x, y, t]) => {
            tour.shot(x + t.vw / 2, y + t.vh / 2);
            const game = document.querySelector("#game"),
              scale = game.width / t.vw;
            if (!window.stitched) {
              window.stitched = document.createElement("canvas");
              window.stitched.width = Math.round(t.width * scale);
              window.stitched.height = Math.round(t.height * scale);
            }
            window.stitched.getContext("2d").drawImage(game, Math.round(x * scale), Math.round(y * scale));
          },
          [x, y, t],
        );
      }
    const stitched = await page.evaluate(() => {
      const c = window.stitched;
      const half = document.createElement("canvas");
      half.width = Math.round(c.width / 2);
      half.height = Math.round(c.height / 2);
      const h = half.getContext("2d");
      h.imageSmoothingQuality = "high";
      h.drawImage(c, 0, 0, half.width, half.height);
      return { full: c.toDataURL("image/png"), half: half.toDataURL("image/jpeg", 0.9) };
    });
    await save("city-overview.png", stitched.full);
    await save("city-overview-half.jpg", stitched.half);
    await page.close();
    console.log("Wrote city overview");
  }

  if (only === "all" || only === "paintings") {
    const page = await open({ width: 1280, height: 760 });
    const t = await page.evaluate(() => tour.town());
    const seen = new Map();
    for (let row = 0; row < t.rows; row++)
      for (let col = 0; col < t.cols; col++) {
        const kind = t.kinds[row][col];
        // Prefer an interior cell so the neighbours on all four sides are in the frame.
        const interior = col > 0 && row > 0 && col < t.cols - 1 && row < t.rows - 1;
        if (!seen.has(kind) || (!seen.get(kind).interior && interior)) seen.set(kind, { col, row, interior });
      }
    const frames = [];
    for (const [kind, { col, row }] of [...seen].sort((a, b) => a[0].localeCompare(b[0]))) {
      const { x, y } = await page.evaluate(([c, r]) => tour.cell(c, r), [col, row]);
      const url = await page.evaluate(([x, y]) => tour.shot(x, y), [x, y]);
      await save(`painting-${kind}-c${col}r${row}.png`, url);
      frames.push({ kind, col, row, url });
    }
    const perRow = 4,
      tw = 640,
      th = 380,
      pad = 22;
    const sheets = await page.evaluate(
      async ({ frames, perRow, tw, th, pad }) => {
        const perSheet = perRow * 3,
          result = [];
        for (let start = 0; start < frames.length; start += perSheet) {
          const part = frames.slice(start, start + perSheet);
          const c = document.createElement("canvas");
          c.width = perRow * tw;
          c.height = Math.ceil(part.length / perRow) * (th + pad);
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#15131c";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.imageSmoothingQuality = "high";
          for (const [i, f] of part.entries()) {
            const img = await createImageBitmap(await (await fetch(f.url)).blob());
            const x = (i % perRow) * tw,
              y = Math.floor(i / perRow) * (th + pad);
            ctx.drawImage(img, x, y + pad, tw, th);
            ctx.fillStyle = "#ffe7bc";
            ctx.font = "bold 15px monospace";
            ctx.fillText(`${f.kind}  (col ${f.col}, row ${f.row})`, x + 6, y + 16);
          }
          result.push(c.toDataURL("image/jpeg", 0.92));
        }
        return result;
      },
      { frames, perRow, tw, th, pad },
    );
    for (const [i, url] of sheets.entries()) await save(`contact-sheet-${i + 1}.jpg`, url);
    await page.close();
    console.log("Wrote", frames.length, "painting frames and", sheets.length, "contact sheets");
  }
  // Named places: node scripts/scenery/overview.mjs out spots '{"name":[x,y],...}'
  if (only === "spots") {
    const page = await open({ width: 1280, height: 760 });
    for (const [name, [x, y]] of Object.entries(JSON.parse(process.argv[4] || "{}")))
      await save(`spot-${name}.png`, await page.evaluate(([x, y]) => tour.shot(x, y), [x, y]));
    await page.close();
  }
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
