// Walk and run the player in every direction, on diagonals and through stops and starts,
// so the gait can be judged on video. Run with the verification driver:
//   node .agents/skills/verify-signe-maitre/scripts/pf.mjs run tools/art/journeys/hero-gait.mjs --build probe --video --mute
// tools/art/gait-reel.mjs cuts two such recordings into before/after strips and a reel.
//
// Three parts: the pavement beside the étude (profiles, stops and starts, at street scale),
// the étude floor (all eight directions with nothing in the way; the room is drawn larger),
// and the carriageway (downs, ups and diagonals at street scale, as far as traffic allows).
import { join } from "node:path";
import { CELL_W, CELL_H, X, Y, definition } from "../../../src/world/town.js";

export const meta = { feature: "hero-gait", needs: "probe" };
const TAU = 2 * Math.PI;

const pavement = { x: 697, y: 276 },
  kerb = { x: 672, y: 277 };
const street = [
  ["right", ["right"], "long", pavement],
  ["left", ["left"], "long", { x: 745, y: 276 }],
];
const carriageway = [
  ["down", ["down"], "short", { x: 671, y: 291 }],
  ["up", ["up"], "short", { x: 671, y: 320 }],
  ["down-right", ["down", "right"], "short", { x: 648, y: 293 }],
  ["up-left", ["up", "left"], "short", { x: 668, y: 313 }],
  ["down-left", ["down", "left"], "short", { x: 668, y: 293 }],
  ["up-right", ["up", "right"], "short", { x: 648, y: 313 }],
];
const room = definition.interiors.find((r) => r.door === "office");
const indoors = [
  ["right", ["right"], "long", { x: 30, y: 82 }],
  ["left", ["left"], "long", { x: 80, y: 82 }],
  ["down", ["down"], "short", { x: 80, y: 64 }],
  ["up", ["up"], "short", { x: 80, y: 93 }],
  ["down-right", ["down", "right"], "short", { x: 50, y: 66 }],
  ["up-left", ["up", "left"], "short", { x: 71, y: 87 }],
  ["down-left", ["down", "left"], "short", { x: 71, y: 66 }],
  ["up-right", ["up", "right"], "short", { x: 50, y: 87 }],
];

// Where the player's feet are on screen once the camera has settled into following him.
// The camera eases towards a point offset from the player (src/main.js), so he sits off centre.
export function onScreen(d, p, velocity) {
  const { width, height } = d.page.viewportSize(),
    zoom = Math.min(5.15, Math.max(1.95, Math.min(width / 280, height / 185)));
  const fx = ((p.x - X(0)) / CELL_W) * TAU,
    fy = ((p.y - Y(0)) / CELL_H) * TAU;
  const lagX = ((1 - (16 * Math.cos(fx) * TAU) / CELL_W) * velocity.x) / 6,
    lagY = ((1 - (9 * Math.cos(fy) * TAU) / CELL_H) * velocity.y) / 6;
  return {
    x: Math.round(width / 2 + zoom * (16 * Math.sin(fx) + lagX)),
    y: Math.round(height / 2 + zoom * (9 * Math.sin(fy) + lagY)),
    scale: zoom,
  };
}
// Indoors the room is fitted to the screen and does not scroll (src/ui/interior-view.js).
export function inRoom(d, p) {
  const { width, height } = d.page.viewportSize(),
    scale = Math.min(width / room.width, height / room.height);
  return {
    x: Math.round((width - room.width * scale) / 2 + p.x * scale),
    y: Math.round((height - room.height * scale) / 2 + p.y * scale),
    scale,
  };
}

export default async function (d) {
  const pause = (ms) => d.page.waitForTimeout(ms);
  // A clapperboard for the reel: an eight-pixel square in the top left corner of the page flips
  // between blue and yellow at each noted moment. A busy machine drops video frames, so the
  // recording cannot be cut by the clock; the flips are in the picture itself. The square is
  // page decoration only: it touches no game state and takes no input.
  await d.page.evaluate(() => {
    const square = document.createElement("i");
    square.id = "gait-clapper";
    square.style.cssText = "position:fixed;left:0;top:0;width:8px;height:8px;background:#00f;z-index:2147483647;pointer-events:none";
    document.body.append(square);
  });
  let claps = 0;
  const clap = async () => {
    await d.page.evaluate(() => {
      const square = document.getElementById("gait-clapper");
      square.style.background = square.dataset.lit ? "#00f" : "#ff0";
      square.dataset.lit = square.dataset.lit ? "" : "1";
    });
    return ++claps;
  };
  const { width, height } = d.page.viewportSize();
  const box = (centreX, centreY, w, h) => ({
    x: Math.round(Math.max(0, Math.min(width - w, centreX - w / 2))),
    y: Math.round(Math.max(0, Math.min(height - h, centreY - h / 2))),
    width: Math.round(Math.min(width, w)),
    height: Math.round(Math.min(height, h)),
  });
  // One leg: hold the controls, and half-way through clap, note where the player is on screen
  // and photograph him there, so strips can be cut from the video at the same place and moment.
  // Returns the ground covered, so a leg cut short by traffic can be walked again.
  async function leg(name, controls, ms, place) {
    let moved = 0;
    await d.step(name, async () => {
      const before = (await d.state()).p,
        pace = controls.includes("run") ? 48 : 24,
        dx = controls.includes("right") - controls.includes("left"),
        dy = controls.includes("down") - controls.includes("up"),
        mag = Math.hypot(dx, dy) || 1;
      const holding = d.hold(controls, ms);
      await pause(ms * 0.5);
      const p = (await d.state()).p,
        mark = await clap(),
        feet = place === "room" ? inRoom(d, p) : onScreen(d, p, { x: (dx / mag) * pace, y: (dy / mag) * pace }),
        // The street camera follows him; the room does not, so the box has to cover his stride.
        clip = box(feet.x, feet.y - 8 * feet.scale, (place === "room" ? 40 : 44) * feet.scale, 34 * feet.scale),
        view =
          place === "room"
            ? box(width / 2, inRoom(d, { x: 80, y: 70 }).y, width, 54 * feet.scale)
            : box(feet.x, feet.y - 6 * feet.scale, 78 * feet.scale, 46 * feet.scale);
      await d.page.screenshot({ path: join(d.out, "mid-" + name + ".png"), clip });
      await holding;
      const after = (await d.state()).p;
      moved = Math.hypot(after.x - before.x, after.y - before.y);
      d.note(name, {
        before,
        after,
        moved: +moved.toFixed(1),
        expected: (pace * ms) / 1000,
        mid: { clap: mark, p, clip, view, seconds: ms / 1000 },
      });
    });
    await pause(300);
    return moved;
  }
  // A spell of several moves around one spot: note when it ran and the screen around it.
  async function spell(name, place, moves) {
    const p = (await d.state()).p,
      feet = place === "room" ? inRoom(d, p) : onScreen(d, p, { x: 0, y: 0 }),
      view =
        place === "room"
          ? box(width / 2, inRoom(d, { x: 80, y: 70 }).y, width, 54 * feet.scale)
          : box(feet.x, feet.y - 6 * feet.scale, 78 * feet.scale, 46 * feet.scale);
    await d.step(name, async () => {
      const from = await clap();
      await moves();
      d.note(name, { span: { from, to: await clap(), view } });
    });
    await pause(300);
  }
  // Traffic and passers-by can box the walker in. Wait for them to move on and try again;
  // a leg still shows the gait if it starts a few steps from its mark.
  async function reach(point, tries = 3) {
    for (let attempt = 0; attempt < tries; attempt++)
      try {
        await d.walkTo(point, { tol: 2 });
        return true;
      } catch (e) {
        d.note("blocked on the way to the next leg", { point, error: String(e.message).slice(0, 160) });
        await d.release();
        await pause(1500);
      }
    return false;
  }
  async function tour(prefix, list, place, attempts) {
    for (const run of [false, true]) {
      const gait = run ? "run" : "walk",
        keys = (controls) => (run ? [...controls, "run"] : controls),
        hold = { long: run ? 1000 : 2000, short: run ? 600 : 1200 };
      for (const [name, controls, length, start] of list) {
        for (let attempt = 0; attempt < attempts; attempt++) {
          await reach(start, attempts);
          await pause(300);
          const moved = await leg(prefix + gait + "-" + name, keys(controls), hold[length], place);
          if (moved > 0.7 * (run ? 48 : 24) * (hold[length] / 1000)) break;
          await pause(1200);
        }
        if (name !== "left") continue;
        // Stops and starts: short taps, then a walk that breaks into a run and back.
        await spell(prefix + gait + "-stop-start", place, async () => {
          for (const way of ["right", "left"])
            for (let i = 0; i < 3; i++) {
              await d.hold(keys([way]), run ? 200 : 300);
              await pause(300);
            }
        });
        if (run)
          await spell(prefix + "walk-into-run", place, async () => {
            await d.hold(["right"], 700);
            await d.hold(["right", "run"], 700);
            await d.hold(["left", "run"], 700);
            await d.hold(["left"], 700);
          });
      }
    }
  }

  await tour("street-", street, "street", 3);

  const office = (await d.state()).jobs.find((j) => j.id === "office");
  await d.step("into-the-etude", async () => {
    await d.walkTo({ x: office.x, y: office.y + 6 }, { tol: 6 });
    await d.waitFor("office hint", ({ hud }) => hud.hint.includes(d.t("office")));
    await d.press("job");
    await d.waitFor("office dialog", ({ hud }) => hud.dialog);
    await d.choose("goInside");
    const { state } = await d.waitFor("interior", ({ state }) => state.interior);
    d.expect(state.interior.door === "office", "the player is inside the étude", state.interior);
  });
  await tour("room-", indoors, "room", 2);
  await d.step("back-on-the-street", async () => {
    const { interior } = await d.state();
    await d.walkTo(interior.exit, { tol: 5 });
    await d.waitFor("exit hint", ({ hud }) => hud.hint === d.t("leaveRoom"));
    await d.press("job");
    await d.waitFor("street", ({ state }) => !state.interior);
  });

  // Best effort: cars stop for a man in the road and may hem him in. A leg cut short is
  // noted with the ground it covered, and the reel leaves it out.
  if (await reach(kerb, 2)) await tour("road-", carriageway, "street", 1);

  d.note("end", { claps });
  const { p, ride } = await d.state();
  d.expect(!ride && p.hp > 0, "the player finishes the gait tour on foot", p);
}
