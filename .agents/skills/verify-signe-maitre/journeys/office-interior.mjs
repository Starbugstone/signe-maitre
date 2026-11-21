// Enter the étude on foot, open the case files at the desk, and come back out to the same spot.
export const meta = { feature: "office-interior", needs: "probe" };

export default async function (d) {
  const office = (await d.state()).jobs.find((j) => j.id === "office");
  await d.step("at-office-door", async () => {
    await d.walkTo({ x: office.x, y: office.y + 6 }, { tol: 6 });
    const { hud } = await d.waitFor("office hint", ({ hud }) => hud.hint.includes(d.t("office")));
    d.expect(true, "the hint names the office", hud.hint);
  });
  const street = (await d.state()).p;
  await d.step("office-menu", async () => {
    await d.press("job");
    const { hud } = await d.waitFor("office dialog", ({ hud }) => hud.dialog);
    d.expect(hud.dialog.heading === d.t("office"), "the office dialog opens", hud.dialog);
    d.expect(hud.dialog.choices.includes(d.t("goInside")), "it offers Go inside", hud.dialog.choices);
  });
  await d.step("inside", async () => {
    await d.choose("goInside");
    const { state } = await d.waitFor("interior", ({ state }) => state.interior);
    d.expect(state.interior.door === "office", "the player is inside the étude", state.interior);
  });
  await d.step("at-desk", async () => {
    const { interior } = await d.state();
    await d.walkTo(interior.desk, { tol: 8, run: false });
    await d.waitFor("desk hint", ({ hud }) => hud.hint === d.t("caseDesk"));
  });
  await d.step("case-files", async () => {
    await d.press("job");
    const { hud } = await d.waitFor("desk dialog", ({ hud }) => hud.dialog);
    for (const id of ["repo", "noise", "flat"])
      d.expect(hud.dialog.choices.includes(d.t(id)), "the desk lists the " + id + " file", hud.dialog.choices);
    d.expect(!hud.dialog.choices.includes(d.t("goInside")), "no Go inside while already inside", hud.dialog.choices);
  });
  await d.step("desk-closed", async () => {
    await d.choose("back");
    await d.waitFor("dialog closed", ({ hud }) => !hud.dialog);
  });
  await d.step("back-on-street", async () => {
    const { interior } = await d.state();
    await d.walkTo(interior.exit, { tol: 5, run: false });
    await d.waitFor("exit hint", ({ hud }) => hud.hint === d.t("leaveRoom"));
    await d.press("job");
    const { state } = await d.waitFor("street", ({ state }) => !state.interior);
    d.expect(Math.hypot(state.p.x - street.x, state.p.y - street.y) < 1, "the player returns to the same street position", { street, now: state.p });
  });
}
