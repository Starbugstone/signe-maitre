// Leave the sedan stopped in a traffic lane and watch the street deal with it:
// traffic keeps flowing (drivers pull out around a stopped car instead of queueing
// forever) and the player can walk away from the car door.
export const meta = { feature: "street-life", needs: "probe" };

export default async function (d) {
  await d.step("board", async () => {
    await d.press("car");
    await d.waitFor("in the sedan", ({ state, hud }) => state.ride?.model === "Étude 2000" && hud.stats.includes("km/h"));
    if (d.device !== "desktop") {
      const signal = d.page.locator("#touchSignal");
      d.expect(await signal.isVisible() && await signal.innerText() === d.t("vehicleHorn"), "the Horn control appears");
      d.expect(await d.page.locator("[data-key=action]").innerText() === d.t("touchBrake"), "the action button reads Brake");
    }
  });
  await d.step("stop-in-lane", async () => {
    const start = (await d.state()).ride;
    await d.hold(["up", "right"], 450);
    await d.hold(["up"], 450);
    const driven = (await d.state()).ride;
    d.expect(Math.hypot(driven.x - start.x, driven.y - start.y) > 2,
      "the sedan pulls away from its parking spot", { start, driven });
    await d.hold(["down"], 700);
    const { state } = await d.waitFor("stopped", ({ state }) => Math.abs(state.ride?.speed ?? 99) < 2, 6000);
    d.expect(state.ride.condition > 0, "the sedan still runs", state.ride);
  });
  await d.step("get-out", async () => {
    await d.press("car");
    const { state } = await d.waitFor("on foot", ({ state }) => state.ride === null);
    d.expect(state.ride === null, "the player is on foot beside the car", state.p);
  });
  await d.step("walk-away", async () => {
    const before = (await d.state()).p;
    await d.hold(["up"], 700);
    const after = (await d.state()).p;
    d.expect(Math.hypot(after.x - before.x, after.y - before.y) > 6, "the player walks away from the door", { before, after });
  });
  await d.step("traffic-flows", async () => {
    // Sample stopped positions near the sedan. Moving samples can belong to the same car.
    let streak = 0,
      longest = 0,
      passing = 0,
      previous = [];
    for (let i = 0; i < 20; i++) {
      const { traffic, sedan } = await d.state();
      const near = traffic.filter((c) => Math.hypot(c.x - sedan.x, c.y - sedan.y) < 40);
      passing += near.filter((c) => c.speed > 2).length;
      const stopped = near.filter((c) => c.speed < 1);
      const held = stopped.some((c) => previous.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 2));
      streak = held ? streak + 1 : 0;
      longest = Math.max(longest, streak);
      previous = stopped;
      await new Promise((r) => setTimeout(r, 1000));
    }
    d.note("traffic near the sedan", { longest, movingSamples: passing });
    d.expect(longest < 8, "no stopped position persists across eight sample intervals", { longest });
    const { traffic } = await d.state();
    d.expect(traffic.length > 0 && traffic.filter((c) => c.speed > 2).length >= traffic.length / 2,
      "at least half the observed traffic is moving at the end", traffic);
  });
}
