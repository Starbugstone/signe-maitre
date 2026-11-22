#!/usr/bin/env node
// Drive Signé, Maître ! in headless Chromium the way a player does and keep the evidence.
// Usage: see ../SKILL.md, or run `pf.mjs help`.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const skill = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(skill, "../../..");
const verifyDir = join(root, ".verify");
const evidenceRoot = join(verifyDir, "evidence");
const runsRoot = join(verifyDir, "runs");

const KEYS = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  run: "Shift",
  action: "Space",
  car: "f",
  horn: "h",
  job: "e",
  report: "r",
  map: "m",
  quip: "v",
};
// Keyboard labels the HUD shows for {control} placeholders, mirroring src/ui/dialogs.js.
const KEY_LABELS = {
  car: ["F", "F"],
  job: ["E", "E"],
  report: ["R", "R"],
  map: ["M", "M"],
  action: ["Space", "Espace"],
};
// Phone controls: the on-screen pad and the toolbar buttons a thumb reaches.
const TOUCH = {
  up: "[data-key=up]",
  down: "[data-key=down]",
  left: "[data-key=left]",
  right: "[data-key=right]",
  run: "[data-key=run]",
  action: "[data-key=action]",
  car: "[data-key=car]",
  horn: "#touchSignal",
  job: "[data-key=job]",
  report: "#reportBtn",
  map: "#mapBtn",
  quip: "#quip",
};
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 760 } },
  phone: { viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  "phone-portrait": { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) out._.push(a);
    else if (["--video", "--headed", "--mute", "--keep-going"].includes(a)) out[a.slice(2)] = true;
    else out[a.slice(2)] = argv[++i];
  }
  return out;
}
const sha = (s) => createHash("sha256").update(s).digest("hex");
const git = (...a) => {
  try {
    return execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

export function findChromium() {
  if (process.env.PF_CHROMIUM) return process.env.PF_CHROMIUM;
  const cache = join(homedir(), ".cache/ms-playwright");
  if (!existsSync(cache)) return null;
  const candidates = [];
  for (const dir of readdirSync(cache)) {
    for (const rel of [
      "chrome-headless-shell-linux64/chrome-headless-shell",
      "chrome-linux64/chrome",
      "chrome-linux/chrome",
    ]) {
      const file = join(cache, dir, rel);
      if (/^chromium/.test(dir) && existsSync(file)) candidates.push(file);
    }
  }
  // Prefer the newest headless shell, then the newest full Chromium.
  const rank = (f) => (f.includes("headless") ? 1e6 : 0) + Number(f.match(/-(\d+)\//)?.[1] || 0);
  return candidates.sort((a, b) => rank(b) - rank(a))[0] || null;
}

async function probeEntry() {
  // Read-only observer. It returns copies, so a journey can look at the game but never set it.
  return `
import "./src/main.js";
import { game, p, done, held, people, cars } from "./src/core/state.js";
import { boatFleet, river } from "./src/game/boats.js";
import { berthInReach } from "./src/game/boarding.js";
import { interior } from "./src/scenes/interiors.js";
import { goal } from "./src/game/cases.js";
import { directions } from "./src/world/navigation.js";
import { ambulance } from "./src/game/rescue.js";
import { jobs } from "./src/world/town.js";
import { target, sedan } from "./src/world/population.js";
import { panel } from "./src/platform/canvas.js";
const xy = (o) => o && { x: +o.x.toFixed(2), y: +o.y.toFixed(2) };
const veh = (v) => v && {
  ...xy(v), model: v.model, speed: +(v.speed || 0).toFixed(2), condition: v.condition, medical: !!v.medical,
  ...(v.domain === "water" && {
    a: +v.a.toFixed(4), vx: +v.slideX.toFixed(2), vy: +v.slideY.toFixed(2), yaw: +v.yaw.toFixed(3),
    bumps: v.bumps, lastImpact: +v.lastImpact.toFixed(2), mooring: v.mooring, traffic: !!v.traffic,
  }),
};
window.__pf = Object.freeze({
  snapshot() {
    const end = goal();
    return {
      artReady: game.artReady, time: +game.time.toFixed(2),
      p: { ...xy(p), a: +p.a.toFixed(3), hp: p.hp },
      ride: veh(game.ride), active: game.active, stage: game.stage, wallet: game.wallet, heat: game.heat,
      done: [...done], viewMap: game.viewMap, dialogOpen: panel.open,
      interior: interior && { door: interior.room.door, exit: xy(interior.room.exit), desk: xy(interior.room.desk), returnTo: xy(interior.returnTo) },
      goal: end && { id: end === target ? "target" : end.id, ...xy(end) },
      route: !interior && end && game.ride?.domain !== "water" ? (directions()?.path || []).map(xy) : [],
      ambulance: ambulance && { ...veh(ambulance), state: ambulance.state, loaded: ambulance.loaded || 0 },
      downed: people.filter((n) => n.knockedOut && !n.onStretcher).map(xy),
      jobs: jobs.map((j) => ({ id: j.id, ...xy(j) })),
      target: veh(target), sedan: veh(sedan),
      traffic: cars.filter((c) => c.route).map(veh),
      boats: boatFleet.boats.filter((b) => !b.incoming).map(veh),
      boatDock: game.ride?.domain === "water" ? berthInReach()?.id ?? null : null,
      shipHorn: game.ride?.domain === "water" && held.has("horn"),
      river: { top: river.top, bottom: river.bottom, bridges: river.bridges.map((b) => ({ ...b })),
        moorings: river.moorings.map((m) => ({ ...m, quay: xy(m.quay) })) },
    };
  },
});
`;
}

async function buildFiles(mode) {
  const { renderGame } = await import(pathToFileURL(join(root, "scripts/build.mjs")).href);
  if (mode === "probe") {
    await mkdir(verifyDir, { recursive: true });
    const html = await renderGame({ entry: await probeEntry() });
    const file = join(verifyDir, "probe.html");
    await writeFile(file, html);
    return file;
  }
  return join(root, "index.html");
}

async function doctor(opts) {
  const report = { ok: true, checks: [] };
  const check = (name, ok, detail) => {
    report.checks.push({ name, ok, detail });
    if (!ok) report.ok = false;
  };
  check("node >= 22", Number(process.versions.node.split(".")[0]) >= 22, process.versions.node);
  let pw;
  try {
    pw = await import("playwright-core");
    check("playwright-core installed", true, "run `npm ci` if this ever fails");
  } catch (e) {
    check("playwright-core installed", false, "run `npm ci` in " + root);
  }
  try {
    const source = await readFile(join(root, "src/ui/dialogs.js"), "utf8");
    const game = Object.fromEntries([...source.matchAll(/^\s+(\w+): \["([^"]+)", "([^"]+)", "[^"]+"\]/gm)].map((m) => [m[1], [m[2], m[3]]]));
    const same = JSON.stringify(game) === JSON.stringify(KEY_LABELS);
    check("HUD key labels match src/ui/dialogs.js", same, same ? Object.keys(game).join(" ") : "game " + JSON.stringify(game) + " vs pf " + JSON.stringify(KEY_LABELS));
  } catch (e) {
    check("HUD key labels match src/ui/dialogs.js", false, e.message);
  }
  const chrome = findChromium();
  check("chromium binary", !!chrome, chrome || "set PF_CHROMIUM or run `npx playwright-core install chromium-headless-shell`");
  if (!opts.url) {
    try {
      const { renderGame } = await import(pathToFileURL(join(root, "scripts/build.mjs")).href);
      const fresh = sha(await renderGame());
      const shipped = sha(await readFile(join(root, "index.html"), "utf8"));
      check("index.html matches src/ (fresh build)", fresh === shipped, fresh === shipped ? shipped.slice(0, 12) : "stale: run `npm run build`");
    } catch (e) {
      check("index.html matches src/ (fresh build)", false, e.message);
    }
  }
  if (pw && chrome) {
    const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage({ ...DEVICES.desktop, locale: "en-US" });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const url = opts.url || pathToFileURL(join(root, "index.html")).href;
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector("#stats")?.textContent.includes("€"), null, { timeout: 20000 });
      const stats = (await page.locator("#stats").innerText()).replace(/\s+/g, " ").trim();
      check("game boots to a playable street", stats === "€0 · HP 5/5 · Heat 0/3", stats + " @ " + url);
      check("no page errors during boot", errors.length === 0, errors.join(" | ") || "none");
    } catch (e) {
      check("game boots to a playable street", false, e.message.split("\n")[0]);
    } finally {
      await browser.close();
    }
  }
  const live = existsSync(runsRoot) ? readdirSync(runsRoot) : [];
  check("no stranded runs", live.length === 0, live.length ? "run `pf.mjs cleanup` for: " + live.join(", ") : "none");
  for (const c of report.checks) console.log((c.ok ? "ok   " : "FAIL ") + c.name + " — " + c.detail);
  process.exitCode = report.ok ? 0 : 1;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function cleanup(opts) {
  if (!existsSync(runsRoot)) return console.log("nothing to clean");
  for (const id of readdirSync(runsRoot)) {
    if (opts["run-id"] && id !== opts["run-id"]) continue;
    const dir = join(runsRoot, id);
    let pids = {};
    try {
      pids = JSON.parse(await readFile(join(dir, "pids.json"), "utf8"));
    } catch {}
    // Kill only processes this harness recorded, never by name.
    for (const [what, pid] of Object.entries(pids))
      if (pid && pid !== process.pid && alive(pid)) {
        process.kill(pid, "SIGTERM");
        console.log("stopped " + what + " " + pid);
      }
    await rm(dir, { recursive: true, force: true });
    console.log("removed run state " + id + " (evidence kept in .verify/evidence/" + id + ")");
  }
}

async function run(opts) {
  const pw = await import("playwright-core");
  const chrome = findChromium();
  if (!chrome) throw Error("No Chromium. Run `pf.mjs doctor`.");
  const journeys = opts._.map((j) => (j.endsWith(".mjs") ? resolve(j) : join(skill, "journeys", j + ".mjs")));
  if (!journeys.length) throw Error("Name at least one journey, e.g. `pf.mjs run boot`.");
  const device = opts.device || "desktop";
  if (!DEVICES[device]) throw Error("Unknown device " + device + ". Use " + Object.keys(DEVICES).join(", "));
  const lang = opts.lang || "en";
  const mode = opts.url ? "url" : opts.build || "shipped";
  const id = opts["run-id"] || new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "-" + process.pid;
  const file = mode === "url" ? null : await buildFiles(mode);
  if (mode === "shipped") {
    const { renderGame } = await import(pathToFileURL(join(root, "scripts/build.mjs")).href);
    if (sha(await renderGame()) !== sha(await readFile(file, "utf8")))
      throw Error("index.html is stale against src/. Run `npm run build` first, or pass --build probe.");
  }
  const url = opts.url || pathToFileURL(file).href;
  const build = file ? sha(await readFile(file, "utf8")).slice(0, 12) : "remote";
  const runDir = join(runsRoot, id);
  await mkdir(runDir, { recursive: true });
  const server = await pw.chromium.launchServer({ executablePath: chrome, args: ["--no-sandbox"], headless: !opts.headed });
  await writeFile(join(runDir, "pids.json"), JSON.stringify({ harness: process.pid, chromium: server.process().pid }));
  let browser,
    failed = 0,
    skipped = 0;
  try {
    browser = await pw.chromium.connect(server.wsEndpoint());
    const words = (await import(pathToFileURL(join(root, "src/ui/strings.js")).href)).words;
    for (const journeyFile of journeys) {
      const mod = await import(pathToFileURL(journeyFile).href);
      const name = basename(journeyFile, ".mjs");
      const out = join(evidenceRoot, id, `${name}-${device}-${lang}`);
      await mkdir(out, { recursive: true });
      if (mod.meta?.needs === "probe" && mode !== "probe") {
        const msg = `SKIPPED ${name}: needs --build probe to steer (this run is ${mode})`;
        await writeFile(join(out, "summary.json"), JSON.stringify({ journey: name, result: "skipped", reason: msg }, null, 2));
        console.log(msg);
        skipped++;
        continue;
      }
      const context = await browser.newContext({
        ...DEVICES[device],
        locale: lang === "fr" ? "fr-FR" : "en-US",
        ...(opts.video ? { recordVideo: { dir: out, size: DEVICES[device].viewport } } : {}),
      });
      if (opts.mute) await context.addInitScript(() => localStorage.setItem("port-fer-sound", "off"));
      const page = await context.newPage();
      const d = driver({ page, context, out, mode, device, lang, words });
      const started = Date.now();
      let result = "pass",
        error = null;
      try {
        await page.goto(url);
        await d.ready();
        await mod.default(d);
        if (d.errors.length) throw Error("Page errors: " + d.errors.join(" | "));
      } catch (e) {
        result = "fail";
        error = e.stack || String(e);
        failed++;
        await d.shot("failure").catch(() => {});
      }
      await d.release().catch(() => {});
      const video = page.video();
      await context.close();
      let videoFile = null;
      if (video) {
        videoFile = join(out, "video.webm");
        await video.saveAs(videoFile);
        await video.delete();
      }
      const summary = {
        journey: name,
        feature: mod.meta?.feature,
        result,
        error,
        device,
        lang,
        mode,
        url,
        build,
        commit: git("rev-parse", "--short", "HEAD") + (git("status", "--porcelain", "--", "src", "index.html") ? "+dirty" : ""),
        seconds: +((Date.now() - started) / 1000).toFixed(1),
        steps: d.steps,
        video: videoFile,
        evidence: out,
      };
      await writeFile(join(out, "summary.json"), JSON.stringify(summary, null, 2));
      console.log(`${result.toUpperCase()} ${name} [${device}/${lang}/${mode} ${build}] ${summary.seconds}s → ${out}`);
      if (error) console.log(error);
      if (failed && !opts["keep-going"]) break;
    }
  } finally {
    await browser?.close().catch(() => {});
    await server.close();
    await rm(runDir, { recursive: true, force: true });
  }
  // 1 = a journey failed, 3 = nothing failed but something was skipped (not a pass).
  process.exitCode = failed ? 1 : skipped ? 3 : 0;
}

function driver({ page, out, mode, device, lang, words }) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  const steps = [];
  let shotIndex = 0;
  let held = new Set();
  let cdp;
  const t = (key, inLang = lang) => {
    const pair = words[key];
    if (!pair) throw Error("Unknown string key " + key + " (see src/ui/strings.js)");
    const i = inLang === "fr" ? 1 : 0;
    // Strings name controls as {job}, {map}… and the game fills in the keyboard label
    // (src/ui/dialogs.js `bindings`). The harness never uses a gamepad, so keyboard labels apply.
    return pair[i].replace(/\{(\w+)\}/g, (_, control) => {
      if (!KEY_LABELS[control]) throw Error(`String ${key} uses {${control}}; add it to KEY_LABELS in pf.mjs to match src/ui/dialogs.js`);
      return KEY_LABELS[control][i];
    });
  };
  async function hud() {
    return page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const text = (s) => q(s)?.textContent.trim() || "";
      const panel = q("#panel");
      return {
        district: text("#district"),
        stats: text("#stats"),
        ticker: text("#ticker"),
        hint: text("#hint"),
        route: q("#routeCard").hidden
          ? null
          : {
              type: text("#routeType"), title: text("#routeTitle"), brief: text("#routeBrief"),
              place: text("#routePlace"), action: text("#routeAction"), distance: text("#routeDistance"),
            },
        report: !q("#reportBtn").hidden,
        map: text("#mapBtn"),
        dialog: panel.open
          ? { heading: text("#heading"), copy: text("#copy"), choices: [...panel.querySelectorAll("#choices button")].map((b) => b.textContent) }
          : null,
        lang: document.documentElement.lang,
      };
    });
  }
  async function state() {
    if (mode !== "probe") throw Error("state() needs --build probe; the shipped build only exposes the HUD");
    return page.evaluate(() => window.__pf.snapshot());
  }
  async function setHeld(next) {
    next = new Set(next);
    if (device === "desktop") {
      for (const k of held) if (!next.has(k)) await page.keyboard.up(KEYS[k]);
      for (const k of next) if (!held.has(k)) await page.keyboard.down(KEYS[k]);
    } else {
      cdp ||= await page.context().newCDPSession(page);
      const points = [];
      for (const k of next) {
        const box = await page.locator(TOUCH[k]).boundingBox();
        if (!box) throw Error("Touch control " + k + " is not on screen");
        points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, id: Object.keys(TOUCH).indexOf(k) });
      }
      // Lift every finger, then press the new set, so each button gets a fresh pointerdown.
      if (held.size) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      if (points.length) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points });
    }
    held = next;
  }
  const d = {
    page,
    out,
    mode,
    device,
    lang,
    errors,
    steps,
    t,
    hud,
    state,
    async ready() {
      await page.waitForFunction(() => document.querySelector("#stats")?.textContent.includes("€"), null, { timeout: 30000 });
    },
    note(text, data) {
      steps.push({ at: new Date().toISOString(), note: text, ...(data ? { data } : {}) });
    },
    async step(name, fn) {
      const before = await hud();
      const at = new Date().toISOString();
      const value = await fn();
      await page.waitForTimeout(120);
      const after = await hud();
      const shot = await d.shot(name);
      const entry = { at, step: name, before, after, shot, ...(mode === "probe" ? { state: await state() } : {}) };
      steps.push(entry);
      await appendFile(join(out, "journal.jsonl"), JSON.stringify(entry) + "\n");
      return value;
    },
    async shot(name) {
      const file = join(out, String(++shotIndex).padStart(2, "0") + "-" + name.replace(/[^a-z0-9-]+/gi, "-") + ".png");
      await page.screenshot({ path: file });
      return basename(file);
    },
    async press(control) {
      if (device === "desktop") await page.keyboard.press(KEYS[control]);
      else if (TOUCH[control].startsWith("[data-key")) {
        await setHeld([...held, control]);
        await page.waitForTimeout(60);
        await setHeld([...held].filter((k) => k !== control));
      } else await page.locator(TOUCH[control]).tap();
    },
    async hold(controls, ms) {
      await setHeld([...held, ...controls]);
      await page.waitForTimeout(ms);
      await setHeld([...held].filter((k) => !controls.includes(k)));
    },
    release: () => setHeld([]),
    async click(selector) {
      if (device === "desktop") await page.locator(selector).click();
      else await page.locator(selector).tap();
    },
    async choose(key) {
      const label = t(key);
      const button = page.locator("#panel[open] #choices button", { hasText: label }).filter({ hasText: new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") });
      if ((await button.count()) !== 1) throw Error(`Dialog has no "${label}" choice: ${JSON.stringify((await hud()).dialog)}`);
      if (device === "desktop") await button.click();
      else await button.tap();
    },
    async waitFor(what, pred, timeout = 8000) {
      const end = Date.now() + timeout;
      let last;
      while (Date.now() < end) {
        last = { hud: await hud(), ...(mode === "probe" ? { state: await state() } : {}) };
        if (await pred(last)) return last;
        await page.waitForTimeout(80);
      }
      throw Error("Timed out waiting for " + what + ": " + JSON.stringify(last).slice(0, 1500));
    },
    expect(ok, message, data) {
      if (!ok) throw Error("Expected " + message + (data ? ": " + JSON.stringify(data).slice(0, 1500) : ""));
      steps.push({ at: new Date().toISOString(), check: message, ok: true });
    },
    // Steer on foot (or indoors) with real direction controls until within `tol` of a point.
    // `until(hud)` ends the walk early once the player-visible HUD shows the goal is met.
    async walkTo(point, { tol = 3, run = true, timeout = 30000, until } = {}) {
      const end = Date.now() + timeout;
      let best = Infinity,
        bestAt = Date.now(),
        ticksSinceBest = 0,
        sidesteps = 0,
        blockedDistance = Infinity;
      try {
        while (Date.now() < end) {
          const s = await state();
          if (s.ride) throw Error("walkTo is for walking; leave the car first");
          const dx = point.x - s.p.x,
            dy = point.y - s.p.y,
            dist = Math.hypot(dx, dy);
          if (dist <= tol) return s;
          if (until && (await until(await hud()))) return s;
          if (dist < blockedDistance - 24) sidesteps = 0;
          if (dist < best - 0.5) {
            best = dist;
            bestAt = Date.now();
            ticksSinceBest = 0;
          } else if (++ticksSinceBest >= 6 && Date.now() - bestAt > 1500) {
            // Caught on a lamp post, bollard or parked car: step sideways and try again.
            if (++sidesteps > 3) throw Error(`Stuck ${dist.toFixed(1)} from ${JSON.stringify(point)} at ${JSON.stringify(s.p)}`);
            blockedDistance = dist;
            const side = Math.abs(dx) > Math.abs(dy) ? (sidesteps % 2 ? "up" : "down") : sidesteps % 2 ? "left" : "right";
            d.note("sidestep " + side, { at: s.p, to: point });
            await setHeld([side]);
            // Clear a vehicle's full width. On another attempt, cross the original
            // line of travel to try the opposite side of the blockage.
            await page.waitForTimeout(sidesteps === 1 ? 850 : 1750);
            await setHeld([]);
            bestAt = Date.now();
            ticksSinceBest = 0;
            best = Infinity;
            continue;
          }
          const keys = [];
          const dead = Math.max(tol * 0.6, 1.2);
          if (dx > dead && Math.abs(dx) > Math.abs(dy) * 0.4) keys.push("right");
          if (dx < -dead && Math.abs(dx) > Math.abs(dy) * 0.4) keys.push("left");
          if (dy > dead && Math.abs(dy) > Math.abs(dx) * 0.4) keys.push("down");
          if (dy < -dead && Math.abs(dy) > Math.abs(dx) * 0.4) keys.push("up");
          const far = dist > 30;
          if (run && far) keys.push("run");
          await setHeld(keys);
          // Near the target, pulse the controls: release before looking again, so a slow
          // machine cannot carry the player past the goal between two observations.
          if (!far) {
            await page.waitForTimeout(Math.min(140, 25 + dist * 5));
            await setHeld([]);
          } else await page.waitForTimeout(35);
        }
        throw Error("walkTo timed out before reaching " + JSON.stringify(point));
      } finally {
        await setHeld([]);
      }
    },
    // Walk the street route the game itself plans (the city map's route) to the current objective.
    async followRoute({ timeout = 90000 } = {}) {
      const start = await state();
      if (!start.goal) throw Error("No objective to follow");
      const path = start.route.slice(1);
      d.note("following route", { goal: start.goal, path });
      const end = Date.now() + timeout;
      const onSite = (h) => h.route?.distance === t("onSite");
      for (const [i, node] of path.entries())
        await d.walkTo(node, {
          tol: 4,
          timeout: Math.max(1000, end - Date.now()),
          ...(i === path.length - 1 ? { until: onSite } : {}),
        });
      return d.waitFor("route card to read on site", ({ hud }) => hud.route?.distance === t("onSite"), 3000);
    },
  };
  return d;
}

const opts = args(process.argv.slice(2));
const command = opts._.shift();
const commands = { doctor, run, cleanup, build: async (o) => console.log(await buildFiles(o.probe ? "probe" : o.build || "probe")) };
if (!commands[command]) {
  console.log(`pf.mjs doctor [--url URL]
pf.mjs run <journey...> [--build shipped|probe] [--url URL] [--device desktop|phone|phone-portrait] [--lang en|fr] [--video] [--mute] [--headed] [--keep-going] [--run-id ID]
pf.mjs build --probe
pf.mjs cleanup [--run-id ID]
Journeys: ${readdirSync(join(skill, "journeys")).map((f) => f.replace(".mjs", "")).join(", ")}`);
  process.exitCode = command && command !== "help" ? 2 : 0;
} else await commands[command](opts);
