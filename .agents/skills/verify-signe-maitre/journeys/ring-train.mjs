// Ride La Petite Ceinture: walk to the nearest ring station, climb to the platform with
// the car control, board the next train, ask for the next stop, ride through a corner
// and step off at another station. The parked sedan and the case state must not change.
export const meta = { feature: "ring-train", needs: "probe" };

const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export default async function (d) {
  const start = await d.state();
  const { stations } = start.ring;
  const first = stations.reduce((best, s) =>
    Math.hypot(s.street.x - start.p.x, s.street.y - start.p.y) < Math.hypot(best.street.x - start.p.x, best.street.y - start.p.y) ? s : best,
  );
  const firstIndex = stations.indexOf(first);
  const next = stations[(firstIndex + 1) % stations.length];

  await d.step("walk-to-station", async () => {
    await d.walkTo(first.street, { tol: 5 });
    const { hud } = await d.waitFor("station prompt", ({ hud }) => hud.hint.includes(d.t("stationHint")), 4000);
    d.expect(hud.hint.includes(d.t("stationHint")), "the hint offers the Petite Ceinture at the stair foot", hud.hint);
  });

  await d.step("climb-to-platform", async () => {
    await d.press("car");
    const { state, hud } = await d.waitFor("on the platform",
      ({ state, hud }) => state.transit?.phase === "platform" && hud.hint.includes(d.t("platformHint").split(" · ")[0]), 4000);
    d.expect(state.transit.station === firstIndex, "the player waits on the platform of " + first.id, state.transit);
    d.expect(hud.hint.includes(d.t("platformHint").split(" · ")[0]), "the hint says the player is on the platform", hud.hint);
  });

  let set;
  await d.step("board", async () => {
    const { state, hud } = await d.waitFor("aboard",
      ({ state, hud }) => state.transit?.phase === "riding" && hud.hint.includes(d.t("doorsOpenHint")), 70000);
    set = state.transit.set;
    d.expect(state.transit.boardedAt === firstIndex, "the player boards at " + first.id, state.transit);
    d.expect(hud.hint.includes(d.t("doorsOpenHint")), "the hint offers to get off while the doors are open", hud.hint);
  });

  await d.step("train-departs", async () => {
    const { state, hud } = await d.waitFor("moving",
      ({ state, hud }) => state.ring.trains[set].station === -1 && state.ring.trains[set].v > 5 && hud.hint.includes(d.t("nextStopHint")), 20000);
    d.expect(hud.hint.includes(d.t("nextStopHint") + " " + next.name) && !hud.hint.includes(d.t("doorsOpenHint")), "the hint names the next stop once moving", hud.hint);
    const rider = state.ring.trains[set].cars[1];
    d.expect(Math.hypot(rider.x - state.p.x, rider.y - state.p.y) < 0.5, "the player rides in the second carriage", { rider, p: state.p });
    d.expect(Math.abs(state.cam.y - (state.p.y - state.ring.deckLift)) < 40, "the camera follows the raised carriage", { cam: state.cam, p: state.p });
  });

  await d.step("request-next-stop", async () => {
    await d.press("car");
    const { state, hud } = await d.waitFor("stop requested",
      ({ state, hud }) => state.transit?.alightAt != null && hud.hint.includes(d.t("alightingHint")), 3000);
    d.expect(stations[state.transit.alightAt].id === next.id, "the request is for the next stop, " + next.id, state.transit);
    d.expect(hud.hint.includes(d.t("alightingHint")), "the hint confirms the stop", hud.hint);
  });

  await d.step("ride-through-corner", async () => {
    const before = (await d.state()).p.a;
    let shot = false;
    const { state } = await d.waitFor(
      "a quarter turn",
      ({ state }) => {
        const angle = turn(state.p.a, before);
        if (!shot && angle > 0.6) {
          shot = true;
          d.shot("mid-corner").catch(() => {});
        }
        return angle > 1.4 || state.transit === null;
      },
      60000,
    );
    d.expect(turn(state.p.a, before) > 1.4, "the carriage turns through a corner of the ring", { before, after: state.p.a });
  });

  await d.step("alight", async () => {
    const { state, hud } = await d.waitFor("on foot",
      ({ state, hud }) => state.transit === null && !hud.hint.includes(d.t("alightingHint")), 60000);
    const there = Math.hypot(state.p.x - next.street.x, state.p.y - next.street.y);
    d.expect(there < 12, "the player is at the stair foot of " + next.id, { p: state.p, street: next.street });
    d.expect(first.id !== next.id, "the stop is another station");
    d.expect(!hud.hint.includes(d.t("nextStopHint")), "the riding hint is gone", hud.hint);
  });

  await d.step("walk-off", async () => {
    const before = (await d.state()).p;
    await d.hold(["down"], 500);
    const after = (await d.state()).p;
    d.expect(Math.hypot(after.x - before.x, after.y - before.y) > 4, "the player walks away from the station", { before, after });
  });

  const end = await d.state();
  d.expect(
    Math.hypot(end.sedan.x - start.sedan.x, end.sedan.y - start.sedan.y) < 0.5,
    "the parked sedan stayed where it was",
    { before: start.sedan, after: end.sedan },
  );
  d.expect(end.active === start.active && end.done.length === start.done.length, "the case state is unchanged", end);
}
