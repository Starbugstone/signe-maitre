// The eastern half of the landmark tour; see city-scenery.mjs.
import { town, X, Y } from "../../../../src/world/town.js";
import { driveRouteTo } from "./big-city.mjs";
import { boardCar, leaveCar } from "./city-scenery.mjs";

export const meta = { feature: "street-scenery", needs: "probe" };

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

  const cathedral = town.monuments.find((m) => m.id === "notre-dame-port");
  await arrive("ile-de-la-ferre", { x: X(9) - 40, y: Y(7) + 6 }, "sedan on the island street", 48);
  await d.step("cathedral-forecourt-on-foot", async () => {
    await leaveCar(d);
    // The parvis: between the portals and the island street's north kerb.
    const spot = { x: cathedral.x - 20, y: Y(town.riverRow) - 22 };
    await d.walkTo(spot, { tol: 5 });
    const { p } = await d.state();
    d.expect(near(p, spot, 9), "player stands on the parvis before Notre-Dame-du-Port", p);
  });
  await d.step("back-to-the-sedan", () => boardCar(d));

  await arrive("palais-de-justice", { x: X(8) + 6, y: Y(6) - 60 }, "sedan beside the Palais de Justice");
  await arrive("hotel-des-ventes", { x: X(7) - 70, y: Y(3) + 6 }, "sedan before the Hôtel des Ventes");

  const station = town.ring.stations.find((st) => st.id === "butte-creancier");
  await arrive("ring-station", { x: X(8) + 6, y: Y(1) + 8 }, "sedan below the Petite Ceinture at Butte-du-Créancier");
  await d.step("station-door-on-foot", async () => {
    await leaveCar(d);
    await d.walkTo({ x: X(8) + 21, y: Y(1) - 20 }, { tol: 5 });
    await d.walkTo(station.street, { tol: 6 });
    const { p } = await d.state();
    d.expect(near(p, station.street, 9), "player reaches the station door under the canopies", p);
  });
  await d.step("back-to-the-sedan", () => boardCar(d));

  await arrive("sacre-creancier", { x: X(8) + 6, y: Y(0) + 34 }, "sedan below Sacré-Créancier");
  await arrive("ring-corner", { x: X(14) - 40, y: Y(1) + 6 }, "sedan at the north-east turn of the ring", 48);
}
