// Leave the sedan stopped in a traffic lane and watch the street deal with it:
// traffic keeps flowing (drivers pull out around a stopped car instead of queueing
// forever) and the player can walk away from the car door.
export const meta = { feature: "street-life", needs: "probe" };

export default async function (d) {
  await d.step("board", async () => {
    await d.press("car");
    const { state } = await d.waitFor("in the sedan", ({ state }) => state.ride?.model === "Étude 2000");
    d.expect(!!state.ride, "the player is driving the sedan", state.ride);
  });
  await d.step("stop-in-lane", async () => {
    await d.hold(["up", "right"], 450);
    await d.hold(["up"], 450);
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
    // For 20 s, watch the lane around the parked sedan. A car may queue behind it for a
    // moment, but must pull out and pass rather than wait there. Cars are matched by
    // position from one sample to the next, not by list order.
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
    d.expect(longest < 8, "no car waits behind the parked sedan for 8 s or more", { longest, passing });
    const { traffic } = await d.state();
    d.expect(traffic.filter((c) => c.speed > 2).length >= traffic.length / 2, "most traffic is moving at the end", traffic.length);
  });
}
