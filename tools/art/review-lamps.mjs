// Check the hand-marked lanterns of src/world/paintings.js against the source paintings.
//
//   node tools/art/review-lamps.mjs OUT_DIR [--src DIR] [--find] [key ...]
//
// Writes one sheet per painting with every marked lantern outlined in cyan. With --find it
// also outlines, in magenta and numbered, each lit glass that has a dark post beneath it, and
// prints those as [x, finial, foot] candidates. The candidates are a starting point only:
// a lit window above a drainpipe looks the same to it. Copy the real ones into paintings.js.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { lantern, paintings, riverMarks } from "../../src/world/paintings.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf("--" + name);
  if (i < 0) return null;
  return args.splice(i, name === "find" ? 1 : 2)[1] ?? true;
};
const src = resolve(flag("src") || process.env.PF_SCENERY_SRC || join(root, "art-src/scenery"));
const find = !!flag("find");
const [out, ...only] = args;
if (!out) throw new Error("Usage: node tools/art/review-lamps.mjs OUT_DIR [--src DIR] [--find] [key ...]");
await mkdir(out, { recursive: true });

// Each plate key and the painting its lanterns are marked on.
// A ring-row plate is built from one or two viaduct paintings; its lanterns are marked on the
// west one (`viaduct.source`) and, east of the junction, on `viaduct.east`.
const sheets = [];
for (const [key, painting] of Object.entries(paintings)) {
  if (painting.legacy) continue;
  if (painting.river) sheets.push({ key, file: key + "Tall", lamps: riverMarks[key].lamps || [] });
  else if (painting.viaduct) {
    sheets.push({ key, file: painting.viaduct.source, lamps: painting.lamps || [] });
    if (painting.viaduct.east) sheets.push({ key: key + "-east", file: painting.viaduct.east, lamps: painting.eastLamps || [] });
  } else if (painting.arms != null) sheets.push({ key, file: key === "rondPoint" ? "obeliskSquare" : key, lamps: painting.lamps || [] });
}

const browser = await chromium.launch({ executablePath: process.env.PF_CHROMIUM });
try {
  const page = await browser.newPage();
  for (const { key, file, lamps } of sheets) {
    if (only.length && !only.includes(key.replace("-east", ""))) continue;
    const data = "data:image/png;base64," + (await readFile(join(src, file + ".png"))).toString("base64");
    const result = await page.evaluate(
      async ({ data, lamps, lantern, find }) => {
        const img = new Image();
        img.src = data;
        await img.decode();
        const W = img.width,
          H = img.height;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, W, H).data;
        const luma = (x, y) => {
          const i = (y * W + x) * 4;
          return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        };
        const found = [];
        if (find) {
          // Lit glass: connected near-white yellow.
          const core = new Uint8Array(W * H),
            seen = new Uint8Array(W * H);
          for (let p = 0, i = 0; p < W * H; p++, i += 4) core[p] = d[i] >= 238 && d[i + 1] >= 205 && d[i + 2] >= 90 ? 1 : 0;
          for (let p = 0; p < W * H; p++) {
            if (!core[p] || seen[p]) continue;
            const stack = [p];
            seen[p] = 1;
            let n = 0,
              x0 = W,
              x1 = 0,
              y0 = H,
              y1 = 0,
              sx = 0;
            while (stack.length) {
              const q = stack.pop(),
                x = q % W,
                y = (q / W) | 0;
              n++;
              sx += x;
              x0 = Math.min(x0, x);
              x1 = Math.max(x1, x);
              y0 = Math.min(y0, y);
              y1 = Math.max(y1, y);
              for (const r of [q - 1, q + 1, q - W, q + W])
                if (r >= 0 && r < W * H && core[r] && !seen[r]) {
                  seen[r] = 1;
                  stack.push(r);
                }
            }
            const w = x1 - x0 + 1,
              h = y1 - y0 + 1,
              cx = Math.round(sx / n);
            if (n < 6 || w > 40 || h > 48 || w < 3 || h < 4) continue;
            // A dark, narrow post under the glass, down to where it ends.
            let foot = 0,
              gap = 0,
              length = 0;
            for (let y = y1 + 2; y < Math.min(H, y1 + 200); y++) {
              let hit = -1;
              for (let x = cx - 3; x <= cx + 3; x++)
                if (luma(x, y) < 66) {
                  hit = x;
                  break;
                }
              if (luma(cx, y) > 205 && length > 6) break;
              if (hit < 0) {
                if (++gap > 7) break;
                continue;
              }
              let l = hit,
                r = hit;
              while (l > hit - 40 && luma(l - 1, y) < 80) l--;
              while (r < hit + 40 && luma(r + 1, y) < 80) r++;
              if (r - l > 46) {
                if (++gap > 3) break;
                continue;
              }
              foot = y;
              length++;
              gap = 0;
            }
            // Street lanterns stand on a pavement. Every district painting has its kerbs near
            // x 660 and 840, y 426 and 570 (docs/city-expansion.md); the river ones differ.
            const top = Math.max(0, y0 - Math.round(h * 0.55) - 4);
            const pavement =
              H !== 1000 ||
              (cx > 585 && cx < 650) ||
              (cx > 848 && cx < 915) ||
              (foot > 372 && foot < 428) ||
              (foot > 570 && foot < 640);
            if (length >= 10 && pavement && foot - top > 48 && foot - top < 140) found.push([cx, top, foot]);
          }
          found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          for (let i = found.length - 1; i > 0; i--)
            if (found.slice(0, i).some((m) => Math.abs(m[0] - found[i][0]) < 14 && Math.abs(m[1] - found[i][1]) < 40)) found.splice(i, 1);
        }
        g.lineWidth = 2;
        g.font = "bold 15px monospace";
        found.forEach(([x, top, foot], i) => {
          g.strokeStyle = "#ff3bd0";
          g.strokeRect(x - 16, top, 32, foot - top);
          g.fillStyle = "#000";
          g.fillRect(x + 18, top, 28, 16);
          g.fillStyle = "#fff";
          g.fillText(i, x + 19, top + 13);
        });
        g.strokeStyle = "#20f0ff";
        for (const [x, top, foot] of lamps) {
          const h = foot - top;
          g.beginPath();
          for (const [f, w] of lantern) g.lineTo(x + w * h, top + f * h);
          for (const [f, w] of [...lantern].reverse()) g.lineTo(x - w * h, top + f * h);
          g.closePath();
          g.stroke();
        }
        // Sheets of at most 1020 rows at four fifths of the painting's size.
        const parts = [];
        for (let y = 0; y < H; y += 1000) {
          const h = Math.min(1020, H - y);
          const t = document.createElement("canvas");
          t.width = Math.round(W * 0.8);
          t.height = Math.round(h * 0.8);
          t.getContext("2d").drawImage(c, 0, y, W, h, 0, 0, t.width, t.height);
          parts.push(t.toDataURL("image/jpeg", 0.9));
        }
        return { found, parts };
      },
      { data, lamps, lantern, find },
    );
    for (const [i, url] of result.parts.entries())
      await writeFile(join(out, key + (result.parts.length > 1 ? "-" + (i + 1) : "") + ".jpg"), Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    console.log(key, "marked", lamps.length, find ? "candidates " + JSON.stringify(result.found) : "");
  }
} finally {
  await browser.close();
}
