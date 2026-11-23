// On foot from the étude into Le Vieux Marais: through the mouth of a ruelle on a wide street,
// along the lane to the crossing of four, up to the street on the north side, and round by
// the second crossing to the mouth on the east side. Every step's screenshot shows a painted
// ruelle or mouth at gameplay scale with the player in it; read them.
import { X, Y } from "../../../../src/world/town.js";

export const meta = { feature: "street-scenery", needs: "probe" };

export default async function (d) {
  const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) <= r;
  const walk = async (name, points, what) => {
    await d.step(name, async () => {
      let s;
      for (const point of points) s = await d.walkTo(point, { tol: 3, timeout: 60000 });
      const { p, ride } = await d.state();
      d.expect(!ride && near(p, points.at(-1), 5), what, p);
      return s;
    });
  };
  const north = (row) => Y(row) - 24; // on the north pavement of a street
  await walk(
    "to-rue-du-marais",
    [
      { x: X(8) - 21, y: north(5) },
      { x: X(8) - 21, y: north(4) },
      { x: X(9) + 21, y: north(4) },
    ],
    "the player reaches the wide street west of the Marais",
  );
  await walk("ruelle-mouth-west", [{ x: X(9) + 21, y: Y(4) }, { x: X(9) + 34, y: Y(4) }], "the player stands in the mouth of the ruelle");
  await walk("in-the-ruelle", [{ x: (X(9) + X(10)) / 2, y: Y(4) }], "the player walks the lane between the houses");
  await d.step("the-houses-are-walls", async () => {
    await d.hold(["up"], 700);
    const { p } = await d.state();
    d.expect(Math.abs(p.y - Y(4)) < 6, "the walls of the lane hold the player in", p);
  });
  await walk("crossing-of-four", [{ x: X(10), y: Y(4) }], "the player reaches the crossing of four ruelles");
  await walk("up-to-the-north-mouth", [{ x: X(10), y: Y(3) + 40 }, { x: X(10), y: Y(3) + 20 }], "the player comes out on the south pavement of the street");
  await walk(
    "along-the-street",
    [
      { x: X(11), y: Y(3) + 20 },
      { x: X(11), y: Y(3) + 60 },
    ],
    "the player turns into the next ruelle",
  );
  await walk("second-crossing", [{ x: X(11), y: Y(4) }], "the player reaches the second crossing");
  await walk("ruelle-mouth-east", [{ x: X(12) - 34, y: Y(4) }, { x: X(12) - 21, y: Y(4) }], "the player comes out on the wide street east of the Marais");
  await walk("down-the-south-lane", [{ x: X(11) + 80, y: Y(4) }, { x: X(11), y: Y(4) }, { x: X(11), y: Y(5) - 44 }, { x: X(11), y: north(5) }], "the player leaves by the mouth on the south side");
}
