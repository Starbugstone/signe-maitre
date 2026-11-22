// Walk onto the south pavement of the étude's street and along it, then drive the sedan
// along the same kerb. Proves there is no invisible wall at the south kerb line.
export const meta = { feature: "street-scenery", needs: "probe" };

export default async function (d) {
  const start = (await d.state()).p;
  const kerb = Math.round((start.y - 72) / 228) * 228 + 72 + 16.8; // south kerb of this street
  await d.step("cross-to-south-pavement", async () => {
    // Pass the parked sedan on the pavement side, then cross the street.
    await d.walkTo({ x: start.x + 36, y: start.y }, { tol: 3 });
    await d.walkTo({ x: start.x + 36, y: kerb - 6 }, { tol: 3 });
    await d.hold(["down"], 900);
    const { p } = await d.state();
    d.expect(p.y > kerb + 2, "the player steps up onto the south pavement past the kerb line", { y: p.y, kerb });
  });
  await d.step("walk-east-along-south-pavement", async () => {
    const before = (await d.state()).p;
    await d.hold(["right"], 2500);
    const after = (await d.state()).p;
    d.expect(after.x - before.x > 40 && after.y > kerb + 1, "the player walks along the south pavement", { before, after, kerb });
  });
  await d.step("walk-west-along-south-pavement", async () => {
    const before = (await d.state()).p;
    await d.hold(["left", "run"], 1500);
    const after = (await d.state()).p;
    d.expect(before.x - after.x > 40, "and back the other way at a run", { before, after });
  });
  await d.step("board-sedan", async () => {
    const { sedan } = await d.state();
    await d.walkTo({ x: sedan.x, y: sedan.y + 12 }, { tol: 5 });
    await d.press("car");
    const { state } = await d.waitFor("in the sedan", ({ state }) => state.ride?.model === "Étude 2000");
    d.expect(!!state.ride, "the player drives the sedan", state.ride);
  });
  await d.step("drive-off", async () => {
    const before = (await d.state()).ride;
    await d.hold(["up"], 500);
    const { ride } = await d.state();
    d.expect(ride.x - before.x > 8, "the sedan drives off from its parking spot", { before, ride });
  });
  await d.step("drive-to-south-kerb", async () => {
    // Short throttle pulses, steering for a shallow line to the south kerb, then along it.
    let best = -Infinity;
    for (let i = 0; i < 40; i++) {
      const { ride, p } = await d.state();
      best = Math.max(best, ride.y);
      if (ride.y > kerb - 3 && Math.abs(Math.sin(p.a)) < 0.2 && i > 4) break;
      const want = ride.y < kerb - 3 ? 0.55 : 0;
      const turn = Math.atan2(Math.sin(want - p.a), Math.cos(want - p.a));
      await d.hold(Math.abs(turn) < 0.08 ? ["up"] : ["up", turn > 0 ? "right" : "left"], 110);
      await d.hold([], 60);
    }
    await d.hold(["up"], 400);
    const { ride } = await d.state();
    // Before the fix a sedan's centre stopped 4.6 short of the kerb line (body against an
    // invisible wall at the kerb). Now its nearside wheels ride up on the pavement.
    d.expect(Math.max(best, ride.y) > kerb - 3.8, "the sedan runs along the south kerb past the old invisible wall", { y: ride.y, best, kerb });
  });
}
