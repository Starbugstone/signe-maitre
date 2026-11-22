// Tour the painted city with real controls, in two drives from the étude so that one sedan
// survives the traffic. West (this journey): Place de la Contrainte, Arc des Saisies and under
// Tour de Fer, on foot beneath its ironwork. East (city-scenery-east): over la Ferre onto the
// island and the cathedral's apron, the Palais de Justice, the Hôtel des Ventes, a station of
// the Petite Ceinture, Sacré-Créancier and the ring's north-east turn. Each stop is a
// screenshot at gameplay scale with the player, the street's pedestrians and traffic in it.
import { town, X, Y } from "../../../../src/world/town.js";
import { blockedIn } from "../../../../src/world/collision.js";
import { brakeToStop, driveRouteTo } from "./big-city.mjs";

export const meta = { feature: "street-scenery", needs: "probe" };

export async function leaveCar(d) {
  await brakeToStop(d);
  await d.press("car");
  const { state } = await d.waitFor("on foot", ({ state }) => !state.ride, 6000);
  return state;
}
export async function boardCar(d) {
  const { sedan } = await d.state();
  await d.walkTo({ x: sedan.x, y: sedan.y - 9 }, { tol: 13 });
  await d.press("car");
  await d.waitFor("back in the sedan", ({ state }) => !!state.ride, 6000);
}

export default async function (d) {
  const drive = (dest, options = {}) => driveRouteTo(d, dest, { tol: 26, timeout: 170000, maxSpeed: 58, ...options });
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
    // Onto the south pavement first, clear of the parked sedan, then along it under the leg.
    const { p: start } = await d.state();
    const spot = { x: tower.x + 68, y: tower.y + 20 };
    await d.walkTo({ x: start.x, y: spot.y }, { tol: 4 });
    await d.walkTo(spot, { tol: 5 });
    const { p } = await d.state();
    d.expect(near(p, spot, 9), "player walks beneath the tower's ironwork", p);
    for (const garden of tower.piers) {
      const cx = garden.reduce((s, q) => s + q[0], 0) / garden.length,
        cy = garden.reduce((s, q) => s + q[1], 0) / garden.length;
      d.expect(blockedIn(town, cx, cy, 2.6), "the rear gardens are solid", [cx, cy]);
    }
  });
  await d.step("back-to-the-sedan", () => boardCar(d));
}
