// Assemble before/after proof from two recordings of the hero-gait journey (pf ... --video):
// per-leg strips of consecutive frames at native gameplay scale, and a side-by-side reel
// that follows the player at twice gameplay scale.
//   node tools/art/gait-reel.mjs <before-evidence-dir> <after-evidence-dir> <out-dir>
// Each leg is cut where the journey clapped in the picture and at the place it noted in
// summary.json, so the two recordings line up even when the machine ran them at different speeds.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const [beforeDir, afterDir, outDir] = process.argv.slice(2).map((a) => resolve(a));
if (!outDir) throw Error("usage: gait-reel.mjs <before-evidence-dir> <after-evidence-dir> <out-dir>");
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const run = (args) => execFileSync(ffmpeg, ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "inherit"] });
const stripFrames = 10,
  half_w = 640,
  half_h = 380;

// The journey flips a small square in the top left corner between blue and yellow at each
// noted moment (see hero-gait.mjs). Read the flips back out of the video: the n-th is the n-th clap.
function claps(video) {
  const corner = execFileSync(ffmpeg, ["-v", "error", "-i", video, "-vf", "crop=2:2:3:3,fps=25", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], {
    maxBuffer: 2 ** 30,
  });
  const times = [];
  let lit = false;
  for (let f = 0; (f + 1) * 12 <= corner.length; f++) {
    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < 4; i++) {
      r += corner[f * 12 + i * 3] / 4;
      g += corner[f * 12 + i * 3 + 1] / 4;
      b += corner[f * 12 + i * 3 + 2] / 4;
    }
    // Anything else in that corner is the page before the square was put there.
    const yellow = r > 150 && g > 150 && b < 110,
      blue = b > 150 && r < 110 && g < 110;
    if ((yellow && !lit) || (blue && lit)) {
      lit = yellow;
      times.push(f / 25);
    }
  }
  return times;
}
// Every leg of a recording: when it happened in the video and where the player was on screen.
function legs(dir) {
  const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")),
    video = join(dir, "video.webm"),
    expected = summary.steps.find((s) => s.note === "end")?.data.claps;
  if (!expected) throw Error("The journey in " + dir + " did not reach its end note");
  const flips = claps(video);
  if (flips.length !== expected) throw Error(`${video} shows ${flips.length} claps, the journey made ${expected}`);
  const list = new Map();
  for (const { note, data } of summary.steps.filter((s) => s.note && s.data)) {
    if (data.mid) {
      // A leg walked again after traffic cut it short replaces the earlier attempt.
      const mid = flips[data.mid.clap - 1];
      list.set(note, {
        video,
        complete: data.moved >= 0.7 * data.expected,
        start: mid - data.mid.seconds / 2 - 0.25,
        length: data.mid.seconds + 0.9,
        mid,
        clip: data.mid.clip,
        view: data.mid.view,
      });
    } else if (data.span)
      list.set(note, {
        video,
        complete: true,
        start: flips[data.span.from - 1] - 0.2,
        length: flips[data.span.to - 1] - flips[data.span.from - 1] + 0.6,
        view: data.span.view,
      });
  }
  return list;
}
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

const before = legs(beforeDir),
  after = legs(afterDir),
  names = [...after.keys()].filter((name) => before.get(name)?.complete && after.get(name).complete),
  skipped = [...after.keys()].filter((name) => !names.includes(name));
const work = join(outDir, ".work");
mkdirSync(join(outDir, "strips"), { recursive: true });
mkdirSync(work, { recursive: true });

// This ffmpeg has no text filter: captions are drawn by the browser.
const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
const page = await browser.newPage();
async function caption(text, width, height, file) {
  const url = await page.evaluate(
    ([text, width, height]) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const g = c.getContext("2d");
      g.fillStyle = "#201c29";
      g.fillRect(0, 0, width, height);
      g.fillStyle = "#ffd98a";
      g.font = "bold " + Math.round(height * 0.55) + "px system-ui, sans-serif";
      g.textBaseline = "middle";
      g.fillText(text, 12, height / 2 + 1);
      return c.toDataURL();
    },
    [text, width, height],
  );
  writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
}

const parts = [];
for (const name of names) {
  const title = name.replace(/-/g, " ");
  // Strip: consecutive frames from the middle of the leg, before above after.
  if (after.get(name).clip) {
    const rows = [];
    for (const [label, leg] of [
      ["before", before.get(name)],
      ["after", after.get(name)],
    ]) {
      // The video's chroma is halved, so crops land on even sizes.
      const { x, y } = leg.clip,
        width = leg.clip.width & ~1,
        height = leg.clip.height & ~1,
        row = join(work, `${name}-${label}.png`);
      // Decode from three seconds earlier: frames cut straight after a seek can come out blank.
      run(["-ss", Math.max(0, leg.mid - 3.2).toFixed(3), "-i", leg.video, "-ss", Math.min(3, leg.mid - 0.2).toFixed(3), "-frames:v", "1", "-vf", `crop=${width}:${height}:${x}:${y},tile=${stripFrames}x1`, row]);
      const bar = join(work, `${name}-${label}-bar.png`);
      await caption(`${title} — ${label}, ${stripFrames} consecutive video frames, as played`, width * stripFrames, 22, bar);
      rows.push(bar, row);
    }
    run([...rows.flatMap((f) => ["-i", f]), "-filter_complex", `vstack=inputs=${rows.length}`, join(outDir, "strips", name + ".png")]);
  }
  // Reel: the same leg from both recordings. The street view follows the player at twice
  // gameplay scale; the room is shown whole, which brings him back to about street scale.
  const halves = [];
  for (const [label, leg] of [
    ["before", before.get(name)],
    ["after", after.get(name)],
  ]) {
    const { x, y } = leg.view,
      width = leg.view.width & ~1,
      height = leg.view.height & ~1,
      half = join(work, `${name}-${label}.mp4`);
    run([
      "-ss", Math.max(0, leg.start - 3).toFixed(3), "-i", leg.video, "-ss", Math.min(3, Math.max(0, leg.start)).toFixed(3), "-t", leg.length.toFixed(3),
      "-vf",
      `crop=${width}:${height}:${x}:${y},scale=${half_w}:${half_h}:force_original_aspect_ratio=decrease:flags=neighbor,` +
        `pad=${half_w}:${half_h}:(ow-iw)/2:(oh-ih)/2:color=0x171420,fps=25`,
      "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", half,
    ]);
    halves.push(half);
  }
  const bar = join(work, `${name}-reel-bar.png`),
    part = join(work, `${name}.mp4`);
  await caption(`${title}        before  |  after`, half_w * 2, 36, bar);
  run([
    "-i", halves[0], "-i", halves[1], "-loop", "1", "-i", bar,
    "-filter_complex", "[0][1]hstack=inputs=2[pair];[2][pair]vstack=inputs=2:shortest=1,format=yuv420p",
    "-c:v", "libx264", "-crf", "18", "-r", "25", part,
  ]);
  parts.push(part);
  console.log(name);
}
await browser.close();
const list = join(work, "parts.txt");
writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", join(outDir, "before-after-in-game.mp4")]);
rmSync(work, { recursive: true, force: true });
if (skipped.length) console.log("left out, cut short by traffic in one recording: " + skipped.join(", "));
console.log("strips and reel in " + outDir);
