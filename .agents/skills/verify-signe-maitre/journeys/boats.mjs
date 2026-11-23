import { X, Y } from "../../../../src/world/town.js";

export const meta = { feature: "River boats and moorings", needs: "probe" };

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

async function poweredUntil(d, controls, reaches, limit = 62) {
  for (let i = 0; i < limit; i++) {
    const state = await d.state();
    if (reaches(state.ride, state)) return state;
    await d.hold(controls, 220);
  }
  throw Error("Boat did not reach its mark: " + JSON.stringify((await d.state()).ride));
}

async function lineUpForBridge(d, bridge) {
  const target = bridge.x - bridge.halfWidth + 8;
  for (let i = 0; i < 100; i++) {
    const { ride } = await d.state();
    const delta = target - ride.x;
    if (Math.abs(delta) <= 5 && Math.abs(ride.vx) <= 6) return;
    const speed = Math.sign(delta) * Math.min(44, Math.max(3, Math.abs(delta) * 0.7));
    const error = speed - ride.vx;
    await d.hold(Math.abs(error) > 2 ? [error > 0 ? "up" : "down"] : [], 120);
  }
  throw Error("The launch did not line up with the bridge deck");
}

async function backToBerth(d, home) {
  let state = await d.state();
  for (let i = 0; !state.boatDock && i < 175; i++) {
    const { ride } = state;
    const dx = home.x - ride.x, dy = home.y - ride.y;
    const aim = Math.atan2(dy, dx);
    const reverse = Math.abs(angleDiff(aim, ride.a)) > Math.PI / 2;
    const error = angleDiff(aim, ride.a + (reverse ? Math.PI : 0));
    const speed = Math.hypot(ride.vx, ride.vy);
    const heading = error - ride.yaw * 0.18;
    const turn = Math.abs(heading) > 0.075 ? (heading * (reverse ? -1 : 1) > 0 ? "right" : "left") : null;
    const targetSpeed = Math.min(reverse ? 28 : 46, Math.max(5, Math.hypot(dx, dy) * 0.42));
    let power = reverse ? "down" : "up";
    if (speed >= targetSpeed && ride.speed * (reverse ? -1 : 1) > 0) power = null;
    await d.hold([power, turn].filter(Boolean), 155);
    state = await d.state();
  }
  d.expect(state.boatDock === home.id, "The boat is slow enough and the quay is clear", state.ride);
}

async function takeBarge(d, initial, home) {
  await d.step("take the moored barge from beside its hull", async () => {
    const barge = initial.boats.find((b) => b.model === "barge" && b.mooring);
    const berth = initial.river.moorings.find((m) => m.id === barge.mooring);
    // Break up the north promenade at bridge crossings. Scale the time allowance to
    // each stretch so slower touch frames still have time to reach the next crossing.
    const walkPromenade = async (x) => {
      const { p } = await d.state();
      await d.walkTo({ x, y: berth.quay.y }, { tol: 5, timeout: 15000 + 80 * Math.abs(x - p.x) });
    };
    for (const b of initial.river.bridges.filter((b) => b.x > home.x && b.x < berth.x))
      await walkPromenade(b.x + 44);
    await walkPromenade(berth.quay.x - barge.halfLength * 0.7);
    d.expect(gap((await d.state()).p, berth.quay) > 35, "The player is beside the long hull, away from the anchor");
    await d.waitFor("the hull offers boarding", ({ hud }) =>
      hud.hint.includes(d.t("boatEnter")) && hud.hint.includes(d.t("barge")));
    if (d.device !== "desktop")
      d.expect(await d.page.locator('[data-key="car"]').innerText() === d.t("touchBoat"), "The touch action reads Boat");
    await d.press("car");
    const result = await d.waitFor("barge theft", ({ state }) => state.ride?.model === "barge" && state.heat > 0);
    d.expect(result.state.heat < 1, "Taking the barge raises heat by less than a level", result.state.heat);
    d.expect(result.hud.ticker.includes(d.t("boatTaken")), "The harbour warning is shown");
  });
}

export default async (d, { bargeOnly = false } = {}) => {
  const initial = await d.state();
  const launch = initial.boats.find((b) => b.model === "launch");
  const home = initial.river.moorings.find((m) => m.id === launch.mooring);
  const bridge = initial.river.bridges.find((b) => b.x > home.x);
  await d.step("walk down to the quay", async () => {
    const avenue = { x: X(7) + 17, y: Y(5) - 16 };
    const pastSedan = initial.p.x - 9;
    await d.walkTo({ x: pastSedan, y: initial.p.y }, { tol: 2.5 });
    await d.walkTo({ x: pastSedan, y: avenue.y }, { tol: 2.5 });
    await d.walkTo(avenue, { tol: 4 });
    await d.walkTo({ x: avenue.x, y: home.quay.y }, { tol: 4, timeout: 45000 });
    await d.walkTo(home.quay, { tol: 4 });
    d.expect((await d.hud()).hint.includes(d.t("boatEnter")), "The quay offers boarding in the current language");
  });
  if (bargeOnly) return takeBarge(d, initial, home);
  await d.step("board the launch and sound the horn", async () => {
    await d.press("car");
    await d.waitFor("launch at the helm with the cast-off ticker", ({ state, hud }) =>
      state.ride?.model === "launch" && hud.ticker.includes(d.t("boatBoarded")),
    );
    const button = d.device === "desktop" ? "#vehicleSignal" : "#touchSignal";
    d.expect(await d.page.locator(button).textContent() === d.t("shipHorn"), "The horn control takes the ship label");
    await Promise.all([
      d.hold(["horn"], 480),
      d.waitFor("ship horn held", ({ state }) => state.shipHorn, 2000),
    ]);
    const { stats } = await d.hud();
    d.expect(stats.includes(d.t("launch")) && stats.includes(d.t("knots")), "The helm shows knots and the launch name");
  });
  await d.step("pass beneath the bridge", async () => {
    await lineUpForBridge(d, bridge);
    await d.shot("launch under the bridge deck");
    const passed = await poweredUntil(d, ["up"], (b) => b.x > bridge.x + bridge.halfWidth + 25);
    d.expect(passed.ride.model === "launch", "The player sailed through to the far side", passed.ride);
  });
  await d.step("stay aboard away from a mooring", async () => {
    await d.press("car");
    const result = await d.waitFor("stepping ashore refused", ({ hud }) => hud.ticker === d.t("boatDockFirst"));
    d.expect(result.state.ride?.model === "launch", "The player remains aboard in open water");
  });
  await d.step("slow down and bump the quay", async () => {
    const first = (await d.state()).ride;
    // Make room to turn the full hull, then approach the north quay bow-first.
    await poweredUntil(d, ["up", "right"], (b) => b.y > initial.river.top + 42 && b.a > 0.7, 24);
    await poweredUntil(d, ["up", "left"], (b) => b.a < -1.12, 30);
    // The hull can recoil after the impact. Use the bow's maximum reach and allow
    // another approach when passing traffic makes contact in deeper water.
    const reach = Math.hypot(first.halfLength, first.halfWidth) + 4;
    const struckQuay = (b, previousBumps) => b.bumps > previousBumps && b.y <= initial.river.top + reach;
    let hit = await d.state();
    let struck = struckQuay(hit.ride, first.bumps);
    for (let pulse = 0; pulse < 70 && !struck; pulse++) {
      const previousBumps = hit.ride.bumps;
      const correction = angleDiff(-Math.PI / 2, hit.ride.a) - hit.ride.yaw * 0.18;
      const rudder = Math.abs(correction) > 0.14 ? [correction > 0 ? "right" : "left"] : [];
      await d.hold(["up", ...rudder], 140);
      hit = await d.state();
      struck = struckQuay(hit.ride, previousBumps);
    }
    d.expect(struck, "The bow struck the north quay", hit.ride);
    d.expect(hit.ride.lastImpact >= 3 && hit.ride.condition > 0, "The quay deflects the hull and keeps the helm usable", hit.ride);
  });
  await d.step("return to the anchor", async () => {
    await backToBerth(d, { ...launch, id: home.id });
    d.expect((await d.hud()).hint === d.t("boatDisembark"), "The HUD offers to moor and step ashore");
  });
  await d.step("moor and step ashore", async () => {
    await d.press("car");
    const result = await d.waitFor("player back on the quay", ({ state }) => !state.ride && gap(state.p, home.quay) <= 2.6);
    d.expect(result.state.boats.some((b) => b.model === "launch" && b.mooring === home.id), "The launch stays tied up");
    d.expect(gap(result.state.sedan, initial.sedan) < 0.1, "The office sedan stayed parked");
    d.expect((await d.hud()).ticker === d.t("boatMoored"), "The ticker confirms that the launch is moored");
  });
  await takeBarge(d, initial, home);
};
