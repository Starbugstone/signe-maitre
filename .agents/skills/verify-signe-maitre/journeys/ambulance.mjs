import { openReport } from "./street-report.mjs";

export const meta = { feature: "street-incident", needs: "probe" };

export default async function (d) {
  await openReport(d);
  await d.step("wait-for-crew", async () => {
    await d.choose("awaitMedics");
    await d.waitFor("patient still waiting", ({ hud, state }) => !hud.dialog && state.downed.length > 0);
  });
  await d.step("stretcher-loading", async () => {
    await d.waitFor("crew loading the patient", ({ state }) => state.ambulance?.state === "loading", 90000);
  });
}
