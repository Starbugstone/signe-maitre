// Lose the heat on La Petite Ceinture: walk the streets to the nearest station, slap a
// passer-by by the stair until Heat rises and inspectors turn out, climb to the platform,
// take the ring and step off at the next station. Nobody follows the player up to the
// platform, and the heat is gone on arrival.
import { walkToStation } from "./ring-train.mjs";

export const meta = { feature: "ring-train", needs: "probe" };

const fighters = new Set(["tough", "inspector"]);
// The HUD joins each label to its value with a no-break space.
const shows = (stats, text) => stats.replace(/\s+/g, " ").includes(text);

export default async function (d) {
  const start = await d.state();
  const { stations } = start.ring;
  const near = (s) => Math.hypot(s.street.x - start.p.x, s.street.y - start.p.y);
  const first = stations.reduce((best, s) => (near(s) < near(best) ? s : best));
  const next = stations[(stations.indexOf(first) + 1) % stations.length];
  const fromStair = (o) => Math.hypot(o.x - first.street.x, o.y - first.street.y);

  await d.step("walk-to-station", async () => {
    await walkToStation(d, start.p, first);
    const { hud } = await d.waitFor("station prompt", ({ hud }) => hud.hint.includes(d.t("stationHint")), 4000);
    d.expect(hud.hint.includes(d.t("stationHint")), "the player stands at the stair foot of " + first.id, hud.hint);
  });

  await d.step("raise-heat", async () => {
    // Heat fades by about 0.055 a second, so raise it beside the stair: above 1.3 the
    // inspectors turn out, and they stay on the player's trail.
    const until = Date.now() + 90000;
    while ((await d.state()).heat < 1.4) {
      if (Date.now() > until) d.expect(false, "a passer-by came within 400 units of the stair", (await d.state()).walkers);
      const { walkers } = await d.state();
      const mark = walkers.filter((n) => !fighters.has(n.kind) && fromStair(n) < 400).sort((a, b) => fromStair(a) - fromStair(b))[0];
      if (!mark) {
        await d.hold([], 1500);
        continue;
      }
      try {
        await d.walkTo(mark, { tol: 14, run: true });
      } catch (error) {
        d.note("lost the passer-by: " + error.message);
        continue;
      }
      await d.hold(["action"], 350);
    }
    const { state, hud } = await d.waitFor("heat", ({ state, hud }) => state.heat >= 1.3 && !shows(hud.stats, d.t("heat") + " 0/3"), 3000);
    d.expect(state.heat >= 1.3, "slapping a passer-by raises Heat", { heat: state.heat, stats: hud.stats });
  });

  let hp;
  await d.step("escape-to-platform", async () => {
    // Back to the stair by the streets: a straight line catches on bollards while the
    // inspectors close in.
    await walkToStation(d, (await d.state()).p, first, { run: true });
    await d.press("car");
    const { state } = await d.waitFor("on the platform", ({ state }) => state.transit?.phase === "platform", 4000);
    hp = state.p.hp;
    d.expect(state.heat > 0.25, "the player is still wanted on the platform", { heat: state.heat });
  });

  await d.step("ride-away", async () => {
    await d.waitFor("aboard and moving", ({ state }) => state.transit?.phase === "riding" && state.ring.trains[state.transit.set].station === -1, 90000);
    await d.press("car");
    await d.waitFor("stop requested", ({ state }) => state.transit?.alightAt != null, 3000);
  });

  await d.step("lose-the-tail", async () => {
    const { state, hud } = await d.waitFor(
      "off at the next station",
      ({ state, hud }) => state.transit === null && hud.ticker.includes(d.t("lostTail")),
      60000,
    );
    d.expect(Math.hypot(state.p.x - next.street.x, state.p.y - next.street.y) < 12, "the player steps off at " + next.id, state.p);
    d.expect(state.heat === 0 && shows(hud.stats, d.t("heat") + " 0/3"), "Heat is back to zero", { heat: state.heat, stats: hud.stats });
    d.expect(state.p.hp === hp, "nobody struck the player on the platform or the train", { before: hp, after: state.p.hp });
  });
}
