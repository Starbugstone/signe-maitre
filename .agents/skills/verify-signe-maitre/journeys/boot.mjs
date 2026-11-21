// Boot to the street, read the HUD, open and close Controls, switch language and back.
// Works on the shipped build and on the published URL: it only uses what a player sees.
export const meta = { feature: "boot-hud", needs: "hud" };

export default async function (d) {
  await d.step("street-ready", async () => {
    const { hud } = await d.waitFor("street HUD", ({ hud }) => hud.hint && hud.route);
    d.expect(/^€0 /.test(hud.stats), "a new game starts with €0", hud.stats);
    d.expect(hud.route.place === "Crédit Sec", "the first objective points at the first file (Crédit Sec)", hud.route);
    d.expect(hud.lang === d.lang, "the page language follows the browser locale", hud.lang);
  });
  await d.step("controls-open", async () => {
    await d.click("#help");
    const { hud } = await d.waitFor("Controls dialog", ({ hud }) => hud.dialog);
    d.expect(hud.dialog.heading === d.t("help"), "the dialog is titled Controls", hud.dialog);
    const top = await d.page.evaluate(() => document.querySelector("#heading").getBoundingClientRect().top);
    d.expect(top >= 0, "the Controls heading is on screen", { top });
  });
  await d.step("controls-closed", async () => {
    await d.choose("back");
    await d.waitFor("dialog to close", ({ hud }) => !hud.dialog);
  });
  const other = d.lang === "fr" ? "en" : "fr";
  await d.step("language-switched", async () => {
    await d.click("#language");
    const { hud } = await d.waitFor("language switch", ({ hud }) => hud.lang === other);
    d.expect(hud.map === d.t("map", other), "the toolbar relabels in the other language", hud.map);
  });
  await d.step("language-restored", async () => {
    await d.click("#language");
    await d.waitFor("language restore", ({ hud }) => hud.lang === d.lang && hud.map === d.t("map"));
  });
}
