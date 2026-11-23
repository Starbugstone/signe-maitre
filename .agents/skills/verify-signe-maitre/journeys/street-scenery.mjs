export const meta = { feature: "street-scenery", needs: "probe" };

export default async function (d) {
  // Start beside the étude on the garage block (col 7, row 5). Walk past the garage pillar to
  // where its painting meets the next, then round the corner of Rue de l'Étude into the paved
  // passage behind the block, through it to the join of the two paintings, and back.
  const start = (await d.state()).p;
  const colX = Math.round((start.x - 75) / 290) * 290 + 75;
  const rowY = Math.round((start.y - 72) / 228) * 228 + 72;
  const gate = { x: colX + 86, y: rowY - 25 };
  const join = { x: colX + 145, y: rowY - 25 };
  // The passage is the lowest band of the painting to the north, 3.5 units above the cell edge.
  const passage = rowY - 114 - 3.5;
  for (const [name, point, tol] of [
    ["in-front-of-garage-pillar", gate, 3],
    ["where-two-paintings-meet", join, 2.5],
    ["back-at-the-corner", { x: colX + 21, y: rowY - 25 }, 2.5],
    ["up-the-side-street", { x: colX + 21, y: passage }, 2],
    ["in-the-passage-behind-the-block", { x: colX + 145, y: passage }, 2.5],
    ["out-on-the-next-street", { x: colX + 290 - 21, y: passage }, 2.5],
    ["down-to-the-pavement", { x: colX + 290 - 21, y: rowY - 25 }, 2.5],
    ["back-where-the-paintings-meet", join, 2.5],
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
  // The join itself is wall: walking north from the pavement there goes nowhere.
  await d.step("the-join-is-a-wall", async () => {
    await d.hold(["up"], 900);
    const { p } = await d.state();
    d.expect(p.y > rowY - 31, "the player stays on the pavement at the join", p);
  });
}
