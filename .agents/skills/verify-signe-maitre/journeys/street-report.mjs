// Both incident outcomes start with the tough beside the étude, in a fresh game.
export const meta = { feature: "street-incident", needs: "probe" };

export async function openReport(d) {
  await d.step("report-open", async () => {
    const start = (await d.state()).p;
    await d.walkTo({ x: start.x - 22, y: start.y }, { tol: 4 });
    for (let i = 0; i < 12 && !(await d.state()).downed.length; i++) {
      await d.hold(["action"], 500);
    }
    const { state } = await d.waitFor("downed pedestrian", ({ state }) => state.downed.length > 0);
    await d.walkTo(state.downed[0], { tol: 12, until: hud => hud.report });
    await d.waitFor("incident report control", ({ hud }) => hud.report);
    await d.press("report");
    const { hud } = await d.waitFor("street incident report", ({ hud }) => hud.dialog?.heading === d.t("incidentTitle"));
    d.expect(hud.dialog.copy === d.t("scuffleCopy"), "the report records the scuffle");
  });
}

export default async function (d) {
  await openReport(d);
  await d.step("copy-served", async () => {
    await d.choose("serveCopy");
    await d.waitFor("signed report number one", ({ hud, state }) =>
      !hud.dialog && !hud.report && !state.downed.length && hud.ticker.includes(d.t("copyServed")) && hud.ticker.includes("№ 1"));
  });
  await d.step("office-record", async () => {
    const office = (await d.state()).jobs.find(j => j.id === "office");
    await d.walkTo(office, { tol: 28 });
    await d.press("job");
    await d.waitFor("filed report at the office", ({ hud }) => hud.dialog?.choices.includes(d.t("lastIncident")));
    await d.choose("lastIncident");
    const { hud } = await d.waitFor("filed scuffle report", ({ hud }) => hud.dialog?.heading === d.t("incidentTitle"));
    d.expect(hud.dialog.copy === d.t("scuffleCopy"), "the office copy matches the report");
  });
}
