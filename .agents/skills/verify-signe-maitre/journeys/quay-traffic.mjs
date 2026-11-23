import { town } from "../../../../src/world/town.js";
import { findRoute } from "../../../../src/world/routes.js";

export const meta = { feature: "Boarding river traffic from the quay", needs: "probe" };

export default async (d) => {
  const start = await d.state();
  const quay = start.river.moorings.find((m) => m.id === "quai-ouest");
  const landing = { x: quay.x - 80, y: start.river.top - 3 };
  await d.step("walk-to-west-quay-apron", async () => {
    const path = findRoute(town, start.p, quay.quay);
    for (const point of path.slice(1, -1)) await d.walkTo(point, { tol: 9, timeout: 30000 });
    await d.walkTo({ x: landing.x, y: quay.quay.y }, { tol: 2, timeout: 12000 });
    await d.walkTo(landing, { tol: 1.3, run: false, timeout: 8000 });
  });
  let passing;
  await d.step("watch-for-a-boat-alongside", async () => {
    const { state } = await d.waitFor("cargo boat alongside the apron", ({ state, hud }) => {
      if (!hud.hint.includes(d.t("boatEnter")) || !hud.hint.includes(d.t("barge"))) return false;
      passing = state.boats.find((b) => b.model === "barge" && b.traffic &&
        Math.abs(b.x - state.p.x) < b.halfLength && Math.hypot(b.vx, b.vy) <= 7.5);
      return !!passing;
    }, 150000);
    d.expect(!passing.mooring && Math.abs(state.p.x - quay.quay.x) > 35, "the moving barge is alongside the open apron");
    if (d.device !== "desktop")
      d.expect(await d.page.locator('[data-key="car"]').innerText() === d.t("touchBoat"), "the touch action reads Boat");
  });
  await d.step("take-the-traffic-barge", async () => {
    await d.press("car");
    const { state, hud } = await d.waitFor("at the helm of the traffic barge", ({ state, hud }) =>
      state.ride?.model === "barge" && hud.ticker.includes(d.t("boatTaken")));
    d.expect(!state.ride.traffic && !state.ride.mooring && state.heat > 0, "boarding ends traffic control and raises heat", state.ride);
    d.expect(hud.stats.includes(d.t("barge")), "the helm names the barge", hud.stats);
  });
};
