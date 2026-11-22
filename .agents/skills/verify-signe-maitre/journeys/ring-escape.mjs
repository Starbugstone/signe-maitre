// Lose the heat on La Petite Ceinture: slap the tough beside the étude until Heat
// rises, run through the streets to the nearest station, take the ring and step off
// at the next one.
// Nobody follows the player up to the platform, and the heat is gone on arrival.
import { walkToStation } from "./ring-train.mjs";

export const meta = { feature: "ring-train", needs: "probe" };

export default async function (d) {
  const start = await d.state();
  const { stations } = start.ring;
  const near = (s) => Math.hypot(s.street.x - start.p.x, s.street.y - start.p.y);
  const first = stations.reduce((best, s) => (near(s) < near(best) ? s : best));
  const next = stations[(stations.indexOf(first) + 1) % stations.length];

  await d.step("raise-heat", async () => {
    await d.walkTo({ x: start.p.x - 22, y: start.p.y }, { tol: 4 });
    for (let i = 0; i < 10 && (await d.state()).heat < 1.5; i++) await d.hold(["action"], 450);
    const { state, hud } = await d.waitFor("heat", ({ state, hud }) => state.heat >= 1 && !hud.stats.includes(d.t("heat") + " 0/3"), 3000);
    d.expect(state.heat >= 1, "slapping raises Heat", { heat: state.heat, stats: hud.stats });
  });

  let hp;
  await d.step("escape-to-platform", async () => {
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
    d.expect(state.heat === 0 && hud.stats.includes(d.t("heat") + " 0/3"), "Heat is back to zero", { heat: state.heat, stats: hud.stats });
    d.expect(state.p.hp === hp, "nobody struck the player on the platform or the train", { before: hp, after: state.p.hp });
  });
}
