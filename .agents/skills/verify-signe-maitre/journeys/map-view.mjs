// Open the city map with the map control, check the street pauses behind it, and close it again.
export const meta = { feature: "map-view", needs: "hud" };

export default async function (d) {
  await d.step("map-open", async () => {
    await d.press("map");
    // The button label flips on the press; the card hides on the next drawn frame.
    const { hud } = await d.waitFor("map view", ({ hud }) => hud.map === d.t("closeMap") && hud.route === null);
    const rows = d.page.locator("#fileList li");
    for (const [index, id] of ["repo", "noise", "flat"].entries()) {
      const row = rows.nth(index);
      d.expect(await row.isVisible() && await row.locator("strong").textContent() === d.t(id), "the map lists the " + id + " file");
      d.expect(await row.locator("p").first().textContent() === d.t(id + "Summary"), "the file has its localized brief");
    }
    d.expect(hud.route === null, "the route card hides while the map is open", hud.route);
  });
  await d.step("map-ignores-movement", async () => {
    const before = await d.hud();
    // Phones hide the touch pad behind the map sheet, so there is nothing to press there.
    const stopped = d.mode === "probe" ? await d.state() : null;
    if (d.device === "desktop") await d.hold(["right"], 500);
    else {
      d.expect(await d.page.locator("#touch").isHidden(), "the map hides the touch pad");
      await d.page.waitForTimeout(500);
    }
    const after = await d.hud();
    d.expect(after.map === d.t("closeMap") && after.district === before.district, "the map stays open in the same district", { before, after });
    if (stopped) {
      const now = await d.state();
      d.expect(now.time === stopped.time && now.p.x === stopped.p.x && now.p.y === stopped.p.y,
        "the simulation clock and player position stay still on the map", { before: stopped.p, after: now.p });
    }
  });
  await d.step("map-closed", async () => {
    await d.press("map");
    const { hud } = await d.waitFor("street view", ({ hud }) => hud.map === d.t("map") && hud.route);
    d.expect(hud.hint !== d.t("mapHint"), "the street hint returns", hud.hint);
  });
}
