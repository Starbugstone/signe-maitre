import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { buildProbe } from "../../.agents/skills/verify-signe-maitre/scripts/pf.mjs";
import { publishedPage } from "../../scripts/build.mjs";
import { fps, profiles } from "./browser.mjs";
import { cutsFor, topics } from "./cuts.mjs";
import { drives } from "./drive.mjs";
import { concatenate, verifyVideo } from "./media.mjs";
import { plan } from "./plan.mjs";
import { replay } from "./replay.mjs";

const out = resolve(".verify/evidence/showcase-60fps");
const work = join(out, ".work");
const tracePath = (device, source) => join(work, device + "-" + source + ".json");
const fragmentPath = (device, topic, name) => join(work, [device, topic, name].join("-") + ".mp4");
const stillPath = (device, name) => join(out, (device === "phone" ? "phone-" : "") + name + ".png");
const videoPath = (device, topic) => join(out, (device === "phone" ? "phone-" : "") + topic + ".mp4");
const toFrames = (seconds) => Math.round(seconds * fps);
const [command, device, ...args] = process.argv.slice(2);
const resume = args.includes("--resume");
const names = args.filter((arg) => arg !== "--resume");
const desktop = ["city", "fleet", "train", "boats", "find"];
const phone = ["fleet", "boats"];

async function assemble() {
  const results = {};
  const videos = [];
  for (const [device, topics] of [["desktop", desktop], ["phone", phone]]) {
    for (const topic of topics) {
      const cuts = cutsFor(device, topic);
      const path = videoPath(device, topic);
      await concatenate(cuts.map(({ name }) => fragmentPath(device, topic, name)), path, join(work, "concat.txt"));
      const frames = cuts.reduce((total, clip) => total + toFrames(clip.seconds), 0);
      if (frames < 30 * fps || frames > 60 * fps) throw Error("Topic must run 30–60 seconds: " + path);
      results[path] = await verifyVideo(path, frames);
      if (device === "desktop") videos.push(path);
      for (const { stills } of cuts) {
        for (const [, name] of stills) {
          const path = stillPath(device, name);
          results[path] = { ...profiles[device].viewport, bytes: (await stat(path)).size };
        }
      }
    }
  }
  const combined = join(out, "showcase.mp4");
  const allFrames = videos.reduce((total, file) => total + results[file].frames, 0);
  if (allFrames > 180 * fps) throw Error("The combined explainer must fit in three minutes.");
  await concatenate(videos, combined, join(work, "concat.txt"));
  results[combined] = await verifyVideo(combined, allFrames);

  const highlights = [
    ["city", "obelisk"], ["city", "cathedral"], ["fleet", "board-volta"], ["fleet", "board-moto"],
    ["train", "train-bridge"], ["boats", "iron"],
  ];
  const rootVideo = resolve("port-fer-gameplay.mp4");
  const rootStill = resolve("port-fer-gameplay.png");
  const pendingTrailer = join(work, "trailer.mp4");
  const highlightFrames = highlights.reduce((total, [topic, name]) =>
    total + toFrames(cutsFor("desktop", topic).find((cut) => cut.name === name).seconds), 0);
  await concatenate(highlights.map(([topic, name]) => fragmentPath("desktop", topic, name)), pendingTrailer, join(work, "concat.txt"), { trailer: true });
  results[rootVideo] = await verifyVideo(pendingTrailer, highlightFrames);
  if (results[rootVideo].seconds > 30 || results[rootVideo].bytes > 15_000_000) throw Error("The root trailer exceeds 30 s or 15 MB.");
  await copyFile(pendingTrailer, rootVideo);
  await copyFile(join(work, "clean-gameplay.png"), rootStill);
  results[rootStill] = { ...profiles.desktop.viewport, bytes: (await stat(rootStill)).size };
  const manifest = Object.fromEntries(Object.entries(results).map(([path, data]) => [relative(".", path), data]));
  await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const table = [
    "# Port-Fer showcase outputs", "",
    "FFmpeg decoded each video and confirmed a constant 60 FPS cadence and distinct frame checksums.", "",
    "- **City** shows the 16×12 map, streets, avenues and Marais alleys, the obelisk roundabout and its priority rule, la Ferre and its bridges, and all seven monuments.",
    "- **Fleet** shows boarding six road models, the moving and parked spawn weights, a city bus lap, the dented Volta E and the wrecked Pétrolette.",
    "- **Train** shows walking to the station, climbing to the platform, automatic boarding, the ring’s corner and rail bridge, requesting the next stop and stepping off.",
    "- **Boats** shows boarding a launch and boarding a barge beside its hull, sailing under stone and iron bridges, going around the island and mooring.",
    "- **Finding rides** shows the clerk’s tip, the map legend, the route card, the named boarding prompt and GitHub Pages hosting.", "",
    "| File | Resolution | Seconds | FPS | Frames | Bytes |", "| --- | --- | ---: | ---: | ---: | ---: |",
    ...Object.entries(results).map(([path, data]) => {
      const file = `[${basename(path)}](${relative(out, path)})`;
      return `| ${file} | ${data.width}×${data.height} | ${data.seconds ?? "—"} | ${data.fps ?? "—"} | ${data.frames ?? 1} | ${data.bytes.toLocaleString("en-US")} |`;
    }),
  ];
  await writeFile(join(out, "report.md"), table.join("\n") + "\n");
  console.log(table.join("\n"));
}

async function planSources(device, names, probe) {
  let failed = false;
  for (const name of names) {
    if (!(name in drives)) throw Error("Unknown source " + name);
    try {
      await plan(device, name, probe, tracePath(device, name));
    } catch (error) {
      console.error(error.message);
      failed = true;
    }
  }
  if (failed) throw Error("One or more driving plans failed.");
}

async function captureTopic(device, topic, sources, probe) {
  if (!(topic in topics)) throw Error("Unknown topic " + topic);
  const cuts = cutsFor(device, topic);
  for (const source of sources.length ? sources : new Set(cuts.map((cut) => cut.source))) {
    const selected = cuts.filter((cut) => cut.source === source);
    if (!selected.length) throw Error("No clips for source " + source + " in " + topic);
    const file = tracePath(device, source);
    const trace = JSON.parse(await readFile(file, "utf8"));
    if (trace.error) throw Error(`Plan for ${device}/${source} failed: ${trace.error}`);
    const clips = selected.map((cut) => {
      if (!(cut.cue in trace.marks)) throw Error("Missing cue " + cut.cue + " in " + file);
      const frames = toFrames(cut.seconds);
      const stills = cut.stills.map(([offset, name]) => ({ offset: toFrames(offset), path: stillPath(device, name) }));
      if (device === "desktop" && cut.name === "obelisk") {
        stills.push({ offset: toFrames(2.2), path: join(work, "clean-gameplay.png"), clean: true });
      }
      return {
        ...cut, frames, stills, path: fragmentPath(device, topic, cut.name),
        start: Math.max(2, trace.marks[cut.cue] + toFrames(cut.offset)),
      };
    });
    const pending = resume ? clips.filter((clip) =>
      !existsSync(clip.path) || clip.stills.some(({ path }) => !existsSync(path))) : clips;
    if (pending.length) await replay(device, probe, file, pending);
  }
}

async function generate(probe) {
  for (const [device, topics] of [["desktop", desktop], ["phone", phone]]) {
    const sources = new Set(topics.flatMap((topic) => cutsFor(device, topic).map((cut) => cut.source)));
    await planSources(device, sources, probe);
    for (const topic of topics) await captureTopic(device, topic, [], probe);
  }
  await assemble();
}

await mkdir(work, { recursive: true });
if (command === "assemble" && !device) {
  await assemble();
} else {
  const all = command === "all" && !device;
  if (!all && (!(device in profiles) || !names.length || !["plan", "capture"].includes(command))) {
    throw Error("Usage: showcase.mjs all | plan desktop|phone <source...> | capture desktop|phone <topic> [source...] [--resume] | assemble");
  }
  if (await publishedPage() !== await readFile("index.html", "utf8")) throw Error("Run npm run build first.");
  const temporary = await mkdtemp(join(tmpdir(), "port-fer-showcase-"));
  try {
    const probe = await buildProbe(temporary, { inline: false });
    if (all) await generate(probe);
    else if (command === "plan") await planSources(device, names, probe);
    else {
      const [topic, ...sources] = names;
      await captureTopic(device, topic, sources, probe);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
