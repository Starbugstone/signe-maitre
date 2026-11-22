// Tour the painted city with real controls: drive the étude's sedan past every monument, over
// la Ferre onto the island, under the Petite Ceinture at a station and out to a ring corner,
// getting out on foot at the tower, the cathedral and the station. Each stop is a screenshot
// at gameplay scale with the player, the street's own pedestrians and traffic in it.
import { town, X, Y } from "../../../../src/world/town.js";
import { blockedIn } from "../../../../src/world/collision.js";
import { brakeToStop, driveRouteTo } from "./big-city.mjs";

export const meta = { feature: "street-scenery", needs: "probe" };

async function leaveCar(d) {
  await brakeToStop(d);
  await d.press("car");
  const { state } = await d.waitFor("on foot", ({ state }) => !state.ride, 6000);
  return state;
}
async function boardCar(d) {
  const { sedan } = await d.state();
  await d.walkTo({ x: sedan.x, y: sedan.y - 9 }, { tol: 13 });
  await d.press("car");
  await d.waitFor("back in the sedan", ({ state }) => !!state.ride, 6000);
}

export default async function (d) {
  const drive = (dest, options = {}) => driveRouteTo(d, dest, { tol: 26, timeout: 170000, ...options });
  const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) <= r;
  const arrive = async (name, dest, what, reach = 40) => {
    await d.step(name, async () => {
      const s = await drive(dest);
      d.expect(s.ride && s.ride.condition > 0 && near(s.ride, dest, reach), what, s.ride);
    });
  };

  await d.step("board-sedan", async () => {
    const { sedan } = await d.state();
    await d.walkTo({ x: sedan.x, y: sedan.y - 10 }, { tol: 14 });
    await d.press("car");
    const { state } = await d.waitFor("in the sedan", ({ state }) => !!state.ride);
    d.expect(!!state.ride, "player boards the sedan", state.ride);
  });

  await arrive("place-de-la-contrainte", { x: X(6) + 70, y: Y(5) + 6 }, "sedan beside the obelisk roundabout");
  await arrive("arc-des-saisies", { x: X(3) + 76, y: Y(3) + 6 }, "sedan beside Arc des Saisies");

  const tower = town.monuments.find((m) => m.id === "tour-fer");
  await arrive("tour-de-fer-underpass", { x: tower.x + 60, y: tower.y - 6 }, "sedan beneath Tour de Fer");
  await d.step("tour-de-fer-on-foot", async () => {
    await leaveCar(d);
    // Under the east leg, then round the foot of the rear garden to the bridge mouth.
    await d.walkTo({ x: tower.x + 68, y: tower.y + 14 }, { tol: 5 });
    const { p } = await d.state();
    d.expect(near(p, { x: tower.x + 68, y: tower.y + 14 }, 9), "player walks beneath the tower's ironwork", p);
    for (const garden of tower.piers) {
      const cx = garden.reduce((s, q) => s + q[0], 0) / garden.length,
        cy = garden.reduce((s, q) => s + q[1], 0) / garden.length;
      d.expect(blockedIn(town, cx, cy, 2.6), "the rear gardens are solid", [cx, cy]);
    }
    await boardCar(d);
  });

  const cathedral = town.monuments.find((m) => m.id === "notre-dame-port");
  await arrive("ile-de-la-ferre", { x: X(9) - 40, y: Y(7) + 6 }, "sedan on the island street", 48);
  await d.step("cathedral-forecourt-on-foot", async () => {
    await leaveCar(d);
    const spot = { x: cathedral.x - 20, y: town.river.islands[0].top + 26 };
    await d.walkTo(spot, { tol: 5 });
    const { p } = await d.state();
    d.expect(near(p, spot, 9), "player stands on the apron before Notre-Dame-du-Port", p);
    await boardCar(d);
  });

  await arrive("palais-de-justice", { x: X(8) + 6, y: Y(6) - 60 }, "sedan beside the Palais de Justice");
  await arrive("hotel-des-ventes", { x: X(7) - 70, y: Y(3) + 6 }, "sedan before the Hôtel des Ventes");

  const station = town.ring.stations.find((st) => st.id === "butte-creancier");
  await arrive("ring-station", { x: X(8) + 6, y: Y(1) + 40 }, "sedan below the Petite Ceinture at Butte-du-Créancier");
  await d.step("station-door-on-foot", async () => {
    await leaveCar(d);
    await d.walkTo({ x: X(8) + 21, y: Y(1) - 20 }, { tol: 5 });
    await d.walkTo(station.street, { tol: 6 });
    const { p } = await d.state();
    d.expect(near(p, station.street, 9), "player reaches the station door under the canopies", p);
    await boardCar(d);
  });

  await arrive("sacre-creancier", { x: X(8) + 6, y: Y(0) + 34 }, "sedan below Sacré-Créancier");
  await arrive("ring-corner", { x: X(14) - 40, y: Y(1) + 6 }, "sedan at the north-east turn of the ring", 48);
}
