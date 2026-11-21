// Take the Home visit file at the office, tag lot 51 at Résidence Mireille, carry it on foot
// to the auction hall and hand it over for the fee.
export const meta = { feature: "cases", needs: "probe" };

export default async function (d) {
  const office = (await d.state()).jobs.find((j) => j.id === "office");
  await d.step("file-taken", async () => {
    await d.walkTo({ x: office.x, y: office.y + 6 }, { tol: 6 });
    await d.press("job");
    await d.waitFor("office dialog", ({ hud }) => hud.dialog);
    await d.choose("flat");
    await d.waitFor("brief", ({ hud }) => hud.dialog?.copy === d.t("flatBrief"));
    await d.choose("take");
    const { hud } = await d.waitFor("active case", ({ hud }) => !hud.dialog && hud.route?.type === d.t("flat"));
    d.expect(hud.route.place === "Résidence Mireille", "the route card points at Résidence Mireille", hud.route);
  });
  await d.step("at-residence", async () => {
    const { hud } = await d.followRoute();
    d.expect(hud.route.action === d.t("inventoryHere"), "on site, the card says to inventory", hud.route);
  });
  await d.step("lot-tagged", async () => {
    await d.press("job");
    await d.waitFor("resident dialog", ({ hud }) => hud.dialog?.heading === d.t("resident"));
    await d.choose("tag");
    // Wait on the HUD, not the state: the card redraws a frame after the stage changes.
    const { hud, state } = await d.waitFor("route card to the auction hall", ({ hud }) => hud.route?.place === d.t("auction"));
    d.expect(state.stage === "deliver", "the lot is tagged for delivery", state.stage);
    d.expect(hud.ticker === d.t("tagged"), "the ticker confirms the tag", hud.ticker);
  });
  await d.step("at-auction", async () => {
    const { hud } = await d.followRoute();
    d.expect(hud.route.action === d.t("handOver"), "on site, the card says to hand over the lot", hud.route);
  });
  await d.step("sold", async () => {
    await d.press("job");
    const { hud, state } = await d.waitFor("fee", ({ hud }) => /^€145 /.test(hud.stats));
    d.expect(state.done.includes("flat") && !state.active, "the case is closed", state);
    d.expect(hud.ticker.includes("+€145"), "the ticker announces the fee", hud.ticker);
  });
}
