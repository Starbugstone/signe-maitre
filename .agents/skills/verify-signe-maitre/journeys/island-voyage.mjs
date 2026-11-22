import { hullOnWater } from "../../../../src/game/boats.js";
import { paintings } from "../../../../src/world/paintings.js";
import { town, X, Y } from "../../../../src/world/town.js";

export const meta = { feature: "River boats and moorings", needs: "probe" };

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const { river } = town;
const island = river.islands[0];
const cy = Y(town.riverRow);

// Steer the boat to a mark with the helm, never faster than it can still turn for the mark.
// Every sample must find the whole hull on water: no painted wall, pier or abutment under it.
async function sailTo(d, mark, { tol = 12, cruise = 44 } = {}) {
  for (let i = 0; i < 420; i++) {
    const { ride } = await d.state();
    if (!hullOnWater(river, ride)) throw Error("The hull left the water at " + JSON.stringify(ride));
    const dx = mark.x - ride.x,
      dy = mark.y - ride.y,
      distance = Math.hypot(dx, dy);
    if (distance < tol) return ride;
    const error = angleDiff(Math.atan2(dy, dx), ride.a),
      heading = error - ride.yaw * 0.18;
    const turn = Math.abs(heading) > 0.07 ? (heading > 0 ? "right" : "left") : null;
    const speed = Math.hypot(ride.vx, ride.vy);
    const want = Math.abs(error) > 0.8 ? 9 : Math.min(cruise, Math.max(9, distance * 0.5));
    const power = speed < want ? "up" : speed > want + 14 && ride.speed > 0 ? "down" : null;
    await d.hold([power, turn].filter(Boolean), 140);
  }
  throw Error("The boat did not reach " + JSON.stringify(mark) + ": " + JSON.stringify((await d.state()).ride));
}
const route = async (d, marks, options) => {
  let ride;
  for (const [x, y] of marks) ride = await sailTo(d, { x, y }, options);
  return ride;
};

export default async (d) => {
  const initial = await d.state();
  const launch = initial.boats.find((b) => b.model === "launch");
  const home = initial.river.moorings.find((m) => m.id === launch.mooring);
  const kinds = town.cellKinds[town.riverRow];
  // The stone bridge west of the berth and the iron bridge east of it.
  const stoneCol = kinds.lastIndexOf("riverBridge", Math.floor(home.x / 290)),
    ironCol = kinds.indexOf("riverIronBridge", Math.floor(home.x / 290));
  const stone = X(stoneCol),
    iron = X(ironCol),
    piers = paintings.riverBridge.piers;
  const arch = (i) => cy + (piers[i].bottom + piers[i + 1].top) / 2;

  await d.step("walk down to the quay and board the launch", async () => {
    const avenue = { x: X(7) + 17, y: Y(5) - 16 };
    const pastSedan = initial.p.x - 9;
    await d.walkTo({ x: pastSedan, y: initial.p.y }, { tol: 2.5 });
    await d.walkTo({ x: pastSedan, y: avenue.y }, { tol: 2.5 });
    await d.walkTo(avenue, { tol: 4 });
    await d.walkTo({ x: avenue.x, y: home.quay.y }, { tol: 4, timeout: 45000 });
    await d.walkTo(home.quay, { tol: 4 });
    await d.press("car");
    await d.waitFor("launch at the helm", ({ state }) => state.ride?.model === "launch");
  });

  // Barges keep to two lanes about the river's centre line and squeeze through one arch of
  // each stone bridge. The voyage stays north of them, and hugs the island in its channels.
  const north = cy - 93,
    west = { from: island.left - 300, to: island.left + 360 };
  const gapInTraffic = (d) =>
    d.waitFor(
      "a gap in the westbound traffic off the island's west point",
      ({ state }) => !state.boats.some((b) => b.traffic && b.x > west.from && b.x < west.to && b.y < cy + 10),
      150000,
    );

  await d.step("sail west through the stone bridge's north arch", async () => {
    await route(d, [
      [home.x - 60, arch(0)],
      [stone + 75, arch(0)],
    ]);
    await sailTo(d, { x: stone + 42, y: arch(0) + 8 }, { cruise: 14 });
    await d.shot("launch under the stone arch, behind the first bastion");
    const ride = await sailTo(d, { x: stone - 95, y: arch(0) });
    d.expect(ride.x < stone - 61, "The launch came out west of the bastions", ride);
  });

  await d.step("turn and come back through the arch", async () => {
    await route(d, [
      [stone - 125, arch(0) - 30],
      [stone - 80, arch(0)],
    ]);
    const ride = await sailTo(d, { x: stone + 95, y: arch(0) });
    d.expect(ride.x > stone + 61 && ride.bumps === launch.bumps, "The launch passed the piers twice without touching them", ride);
  });

  await d.step("pass beneath the iron bridge", async () => {
    await sailTo(d, { x: iron - 80, y: north });
    await sailTo(d, { x: iron - 46, y: north }, { cruise: 14 });
    await d.shot("launch showing through the iron spandrel");
    const ride = await sailTo(d, { x: iron + 90, y: north });
    d.expect(ride.x > iron + 63, "The launch came out east of the ribs", ride);
  });

  await d.step("sail the north channel behind Notre-Dame-du-Port", async () => {
    await sailTo(d, { x: west.from + 10, y: north }, { cruise: 16 });
    await gapInTraffic(d);
    await route(d, [
      [island.left - 20, island.top - 14],
      [X(9) - 40, island.top - 14],
    ]);
    await sailTo(d, { x: X(9), y: island.top - 13 }, { cruise: 12 });
    await d.shot("launch behind the cathedral spire");
    const ride = await sailTo(d, { x: island.right + 22, y: island.top - 14 });
    d.expect(ride.x > island.right && ride.y < island.top, "The launch cleared both north bridge arms", ride);
  });

  await d.step("round the east point and sail the south channel", async () => {
    await route(d, [
      [island.right + 38, cy],
      [island.right + 14, island.bottom + 18],
      [X(10) - 40, island.bottom + 16],
    ]);
    await sailTo(d, { x: X(10) - 80, y: island.bottom + 15 }, { cruise: 12 });
    await d.shot("launch below the island quay wall");
    // A speedboat is tied up at the island's berth: pass outside it, inside the barge lane.
    const ride = await route(d, [
      [X(9) + 70, island.bottom + 32],
      [X(9) - 70, island.bottom + 32],
      [island.left - 6, island.bottom + 18],
      [island.left - 40, cy],
    ]);
    d.expect(ride.x < island.left && ride.bumps === launch.bumps, "The launch rounded the island without touching a wall", ride);
    await gapInTraffic(d);
    await sailTo(d, { x: west.from + 10, y: north });
  });

  await d.step("return under the iron bridge and moor", async () => {
    await route(d, [
      [iron + 80, north],
      [iron - 80, north],
      [home.x + 40, home.y + 6],
    ]);
    let state = await d.state();
    for (let i = 0; !state.boatDock && i < 160; i++) {
      const { ride } = state;
      const dx = home.x - ride.x,
        dy = home.y - ride.y;
      const aim = Math.atan2(dy, dx),
        reverse = Math.abs(angleDiff(aim, ride.a)) > Math.PI / 2;
      const heading = angleDiff(aim, ride.a + (reverse ? Math.PI : 0)) - ride.yaw * 0.18;
      const turn = Math.abs(heading) > 0.075 ? (heading * (reverse ? -1 : 1) > 0 ? "right" : "left") : null;
      const target = Math.min(reverse ? 20 : 30, Math.max(4, Math.hypot(dx, dy) * 0.4));
      const power = Math.hypot(ride.vx, ride.vy) >= target && ride.speed * (reverse ? -1 : 1) > 0 ? null : reverse ? "down" : "up";
      await d.hold([power, turn].filter(Boolean), 150);
      state = await d.state();
    }
    d.expect(state.boatDock === home.id, "The launch is back at its berth, slow enough to tie up", state.ride);
    await d.press("car");
    const ashore = await d.waitFor("player back on the quay", ({ state }) => !state.ride);
    d.expect(Math.hypot(ashore.state.p.x - home.quay.x, ashore.state.p.y - home.quay.y) <= 2.6, "The player stands at the anchor");
  });
};
