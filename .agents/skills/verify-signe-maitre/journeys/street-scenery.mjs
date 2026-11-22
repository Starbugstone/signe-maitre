export const meta = { feature: "street-scenery", needs: "probe" };

export default async function (d) {
  // Start beside the étude on the garage block (col 7, row 5): walk past the garage pillar
  // into the seam alley between (7, 5) and (8, 5), pass into the alley, and return to the pavement.
  const start = (await d.state()).p;
  const colX = Math.round((start.x - 75) / 290) * 290 + 75;
  const rowY = Math.round((start.y - 72) / 228) * 228 + 72;
  const gate = { x: colX + 86, y: rowY - 25 };
  const alley = { x: colX + 145, y: rowY - 25 };
  for (const [name, point, tol] of [
    ["in-front-of-garage-pillar", gate, 3],
    ["alley-mouth", alley, 2.5],
    ["inside-seam-alley", { x: alley.x, y: rowY - 38 }, 2.5],
    ["back-on-the-pavement", { x: alley.x, y: rowY - 23 }, 2.5],
  ]) {
    await d.step(name, async () => {
      await d.walkTo(point, { tol });
      const { p, ride } = await d.state();
      d.expect(
        !ride && Math.hypot(p.x - point.x, p.y - point.y) <= tol,
        "the player reaches " + name + " on foot",
        p,
      );
    });
  }
}
