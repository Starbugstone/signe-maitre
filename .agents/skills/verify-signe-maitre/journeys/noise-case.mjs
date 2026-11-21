// Take the Bass complaint at the office, walk the planned street route to Le Boum,
// stamp the report, and see the fee land in the wallet.
export const meta = { feature: "cases", needs: "probe" };

export default async function (d) {
  const office = (await d.state()).jobs.find((j) => j.id === "office");
  await d.step("office-menu", async () => {
    await d.walkTo({ x: office.x, y: office.y + 6 }, { tol: 6 });
    await d.press("job");
    const { hud } = await d.waitFor("office dialog", ({ hud }) => hud.dialog);
    d.expect(hud.dialog.choices.includes(d.t("noise")), "the office offers the Bass complaint", hud.dialog.choices);
  });
  await d.step("brief", async () => {
    await d.choose("noise");
    const { hud } = await d.waitFor("brief", ({ hud }) => hud.dialog?.heading === d.t("noise"));
    d.expect(hud.dialog.copy === d.t("noiseBrief"), "the brief explains the case", hud.dialog.copy);
  });
  await d.step("file-taken", async () => {
    await d.choose("take");
    const { hud, state } = await d.waitFor("active case", ({ hud }) => !hud.dialog && hud.route?.type === d.t("noise"));
    d.expect(state.active === "noise", "the noise case is active", state.active);
    d.expect(hud.route.place === "Le Boum", "the route card points at Le Boum", hud.route);
  });
  await d.step("arrived", async () => {
    const { hud } = await d.followRoute();
    d.expect(hud.route.action === d.t("useMeter"), "on site, the card says to take a reading", hud.route);
  });
  await d.step("report-draft", async () => {
    await d.press("job");
    const { hud } = await d.waitFor("report dialog", ({ hud }) => hud.dialog);
    d.expect(hud.dialog.heading === d.t("pv"), "the constat draft opens", hud.dialog);
  });
  await d.step("signed", async () => {
    await d.choose("sign");
    const { hud, state } = await d.waitFor("fee", ({ hud }) => /^€125 /.test(hud.stats));
    d.expect(state.done.includes("noise") && !state.active, "the case is closed", state);
    d.expect(hud.ticker.includes("+€125"), "the ticker announces the fee", hud.ticker);
    d.expect(hud.route?.place !== "Le Boum", "the route card moves on to the next file", hud.route);
  });
}
