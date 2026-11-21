// Tile the shots of a hero-strides run into one contact sheet: one row per leg, strides then halt.
//   node tools/art/stride-sheet.mjs <evidence-dir> <out.png>
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [dir, out] = process.argv.slice(2).map((a) => resolve(a));
const ffmpeg = process.env.FFMPEG || "ffmpeg",
  run = (args) => execFileSync(ffmpeg, ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "inherit"] });
const shots = readdirSync(dir).filter((f) => /-(\d|halt\d)\.png$/.test(f)),
  legs = [...new Set(shots.map((f) => f.replace(/-(\d|halt\d)\.png$/, "")))];
const order = ["walk-right", "walk-left", "run-right", "run-left", "walk-down", "walk-up", "run-down", "run-up"],
  rank = (leg) => (leg.startsWith("konami-") ? 100 : 0) + order.indexOf(leg.replace("konami-", ""));
legs.sort((a, b) => rank(a) - rank(b));
// Phone shots are taken at twice the size: read the width from the first picture's header.
const shotWidth = readFileSync(join(dir, shots[0])).readUInt32BE(16),
  inLeg = (leg) => shots.filter((f) => f.replace(/-(\d|halt\d)\.png$/, "") === leg),
  widest = Math.max(...legs.map((leg) => inLeg(leg).length)) * shotWidth,
  work = mkdtempSync(join(dirname(out), ".strides-")),
  rows = [];
for (const leg of legs) {
  const files = inLeg(leg).sort((a, b) => a.includes("halt") - b.includes("halt") || a.localeCompare(b)),
    row = join(work, leg + ".png");
  run([...files.flatMap((f) => ["-i", join(dir, f)]), "-filter_complex", `hstack=inputs=${files.length},pad=${widest}:ih:0:0:black`, row]);
  rows.push(row);
}
run([...rows.flatMap((f) => ["-i", f]), "-filter_complex", `vstack=inputs=${rows.length}`, out]);
rmSync(work, { recursive: true, force: true });
console.log(out + ": " + legs.join(", "));
