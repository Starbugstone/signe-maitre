export const meta = { feature: "street-scenery", needs: "probe" };

export default async function (d) {
  const alley = { x: 510, y: 275 }, gate = { x: 452, y: 275 };
  for (const [name, point, tol] of [
    ["in-front-of-garage-pillar", gate, 3],
    ["market-alley-mouth", alley, 2],
    ["under-the-span", { x: alley.x, y: 262 }, 2],
    ["back-on-the-pavement", { x: alley.x, y: 277 }, 2],
  ]) {
    await d.step(name, async () => {
      await d.walkTo(point, { tol });
      const { p, ride } = await d.state();
      d.expect(!ride && Math.hypot(p.x-point.x,p.y-point.y) <= tol,
        "the player reaches "+name+" on foot", p);
    });
  }
}
