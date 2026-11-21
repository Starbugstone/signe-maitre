// Photograph the player in mid-stride and coming to a halt, at street scale, for a contact
// sheet (tools/art/stride-sheet.mjs). Quicker than a video when checking a pose in the game:
//   node .agents/skills/verify-signe-maitre/scripts/pf.mjs run tools/art/journeys/hero-strides.mjs --build probe --mute
// On desktop it also types the Konami code and photographs the costume the same way.
import { join } from "node:path";
import { onScreen } from "./hero-gait.mjs";

export const meta = { feature: "hero-gait", needs: "probe" };

export default async function (d) {
  const pause = (ms) => d.page.waitForTimeout(ms);
  async function shoot(name, velocity) {
    const p = (await d.state()).p,
      feet = onScreen(d, p, velocity),
      { width, height } = d.page.viewportSize(),
      clip = {
        x: Math.max(0, Math.min(width - 140, feet.x - 70)),
        y: Math.max(0, Math.min(height - 120, feet.y - 95)),
        width: 140,
        height: 120,
      };
    await d.page.screenshot({ path: join(d.out, name + ".png"), clip });
  }
  async function burst(name, controls, ms, shots = 7) {
    const pace = controls.includes("run") ? 48 : 24,
      dx = controls.includes("right") - controls.includes("left"),
      dy = controls.includes("down") - controls.includes("up"),
      mag = Math.hypot(dx, dy) || 1;
    const holding = d.hold(controls, ms);
    await pause(350);
    for (let i = 0; i < shots; i++) await shoot(`${name}-${i}`, { x: (dx / mag) * pace, y: (dy / mag) * pace });
    await holding;
    // The halt: three shots straight after release.
    for (let i = 0; i < 3; i++) await shoot(`${name}-halt${i}`, { x: 0, y: 0 });
    await pause(500);
  }
  async function profiles(prefix) {
    await d.walkTo({ x: 697, y: 276 }, { tol: 2 });
    await pause(400);
    await burst(prefix + "walk-right", ["right"], 2000);
    await burst(prefix + "walk-left", ["left"], 2000);
    await burst(prefix + "run-right", ["right", "run"], 1100);
    await burst(prefix + "run-left", ["left", "run"], 1100);
  }
  await d.step("profiles", () => profiles(""));
  if (d.device === "desktop") {
    const konami = async () => {
      for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) {
        await d.page.keyboard.press(key);
        await pause(60);
      }
      await pause(400);
    };
    await d.step("konami-costume", async () => {
      await konami();
      await profiles("konami-");
      await konami();
    });
  }
  // The road last: cars stop for a man in the carriageway and can hem him in. If they do,
  // the sheet is made without these rows and the journey says so.
  await d.step("front-and-back", async () => {
    try {
      // Round the parked sedan by the kerb.
      await d.walkTo({ x: 672, y: 277 }, { tol: 2 });
      await d.walkTo({ x: 671, y: 291 }, { tol: 2 });
      await pause(400);
      await burst("walk-down", ["down"], 1300);
      await burst("walk-up", ["up"], 1300);
      await burst("run-down", ["down", "run"], 700, 4);
      await burst("run-up", ["up", "run"], 700, 4);
    } catch (e) {
      if (!/Stuck|timed out/.test(e.message)) throw e;
      await d.release();
      d.note("front and back views not shot: boxed in by traffic", { error: e.message.slice(0, 200) });
      console.log("hero-strides: front and back views not shot, boxed in by traffic");
    }
  });
}
