import { hullOnWater } from "../../../../src/game/boats.js";
import { town } from "../../../../src/world/town.js";
import { carContact } from "../../../../src/world/vehicle-shape.js";

export const meta = { feature: "Traffic on la Ferre", needs: "probe" };

export default async (d) => {
  const { river, ring } = town;
  const island = river.islands[0];
  const crossings = [
    ...river.bridges.map(({ col, x }) => ({ id: "road-" + col, x })),
    { id: "west-rail", x: ring.left },
    { id: "east-rail", x: ring.right },
    { id: "island-channels", x: (island.left + island.right) / 2 },
  ];
  const directions = new Set();
  const distances = new Map();
  let last = new Map();
  let samples = 0;
  await d.step("watch 260 seconds of river traffic", async () => {
    const start = (await d.state()).time;
    const result = await d.waitFor("260 seconds of running simulation", ({ state }) => {
      const boats = state.boats;
      for (const [i, boat] of boats.entries()) {
        if (!hullOnWater(river, boat)) throw Error("Hull entered land: " + JSON.stringify(boat));
        for (const other of boats.slice(i + 1)) {
          if (carContact(boat, other)) throw Error("Overlapping hulls: " + JSON.stringify([boat, other]));
        }
        const before = last.get(boat.id);
        if (!boat.traffic || !before || Math.abs(boat.x - before.x) > 100) continue;
        distances.set(boat.id, (distances.get(boat.id) ?? 0) + Math.abs(boat.x - before.x));
        for (const { id, x } of crossings) {
          if (before.x < x && boat.x >= x && (id !== "island-channels" || boat.y > island.bottom))
            directions.add(id + " east");
          if (before.x > x && boat.x <= x && (id !== "island-channels" || boat.y < island.top))
            directions.add(id + " west");
        }
      }
      last = new Map(boats.map((boat) => [boat.id, boat]));
      samples++;
      return state.time - start >= 260;
    }, 450000);
    d.expect(distances.size === 4 && [...distances.values()].every((x) => x > 3000),
      "Four traffic boats each travelled at least 3,000 units", [...distances]);
    d.expect(directions.size === crossings.length * 2,
      "Traffic crossed every road and rail bridge both ways and used both island channels", [...directions].sort());
    d.note("river traffic samples", { samples, seconds: result.state.time - start });
  });
};
