// Find the new rides from the clerk's tip, map and street prompts on a fresh save.
export const meta = { feature: "Finding vehicles, boats and trains", needs: "hud" };

const directions = {
  "→": ["right"], "↘": ["right", "down"], "↓": ["down"], "↙": ["left", "down"],
  "←": ["left"], "↖": ["left", "up"], "↑": ["up"], "↗": ["right", "up"],
};

async function select(d, kind, label) {
  if ((await d.hud()).map !== d.t("closeMap")) await d.press("map");
  await d.waitFor("map open", ({ hud }) => hud.map === d.t("closeMap"));
  await d.click(`[data-trip="${kind}"]`);
  const { hud } = await d.waitFor(label, ({ hud }) => hud.travel?.type === label);
  return hud.travel.title;
}

export async function follow(d, hint) {
  let sinceProgress = d.now();
  let lastDistance;
  let detours = 0;
  const end = d.now() + 75000;
  while (d.now() < end) {
    const hud = await d.hud();
    if (hud.travel?.step === d.t("onSite") && hud.hint.includes(d.t(hint))) return;
    const { step, distance } = hud.travel;
    const direction = directions[step[0]];
    if (!direction) throw Error("Expected a direction: " + JSON.stringify(hud.travel));
    const metres = parseInt(distance, 10);
    if (metres !== lastDistance) sinceProgress = d.now();
    lastDistance = metres;
    if (d.now() - sinceProgress > 1500) {
      // Walk around a parked car or a street prop, then pick the arrow back up.
      const avoid = direction.some((key) => key === "left" || key === "right") ? ["up", "down"] : ["left", "right"];
      const sweep = Math.min(700, 310 + Math.floor(detours / 2) * 130);
      await d.hold(["run", avoid[detours++ % 2]], sweep);
      await d.hold(["run", ...direction], 620);
      sinceProgress = d.now();
    } else await d.hold(metres > 12 ? ["run", ...direction] : direction, metres > 18 ? 330 : 100);
  }
  throw Error("The travel card did not lead to " + hint + ": " + JSON.stringify(await d.hud()));
}

async function board(d, touchKey, hintKey, title) {
  const { hud } = await d.waitFor(title, ({ hud }) => hud.hint.includes(d.t(hintKey)) && hud.hint.includes(title));
  if (d.device !== "desktop") {
    const button = d.page.locator('[data-key="car"]');
    d.expect(await button.isVisible() && await button.textContent() === d.t(touchKey),
      "the touch action matches the boarding prompt", hud.hint);
  }
  await d.press("car");
}

export default async (d) => {
  const started = Date.now();
  await d.step("read-the-clerks-tip", async () => {
    d.expect((await d.hud()).ticker.includes(d.t("start")), "the clerk points out seized vehicles, boats and trains");
  });
  await d.step("find-rides-on-the-map", async () => {
    await d.press("map");
    await d.page.locator("#tripOptions").waitFor({ state: "visible" });
    for (const [kind, key] of [["bike", "travelBike"], ["mooring", "travelBoat"], ["station", "travelTrain"]]) {
      const button = d.page.locator(`[data-trip="${kind}"]`);
      d.expect(await button.isVisible() && await button.isEnabled() && (await button.innerText()).includes(d.t(key)),
        "the map offers " + d.t(key));
    }
  });

  let bike;
  await d.step("follow-the-route-to-the-motorbike", async () => {
    bike = await select(d, "bike", d.t("travelBike"));
    await follow(d, "motoEnter");
  });
  await d.step("ride-the-motorbike", async () => {
    await board(d, "touchBike", "motoEnter", bike);
    const { hud, state } = await d.waitFor("riding the named motorbike", ({ hud }) =>
      hud.stats.includes(bike) && hud.stats.includes("km/h") && !hud.travel);
    if (state) d.expect(state.ride?.model === "moto", "boarding takes the motorbike", state.ride);
    d.expect(hud.route !== null, "the next case returns when the route to the bike is done");
    d.expect(Date.now() - started < 60000, "the ride and map destinations are found within one minute");
    await d.hold(["up"], 400);
    await d.waitFor("the motorbike pulls away", ({ hud }) => /[1-9]\d*\s+km\/h/.test(hud.stats));
  });

  await d.step("take-the-wheel-of-another-seized-vehicle", async () => {
    await d.press("car");
    const suv = d.t("fleet:suv");
    for (let i = 0; i < 18 && !(await d.hud()).hint.includes(suv); i++) {
      // The next parked car is visible up the street from the bike.
      await d.hold(["right"], 110);
    }
    await board(d, "touchCar", "enterHint", suv);
    const { state } = await d.waitFor("driving the named 4×4", ({ hud }) => hud.stats.includes(suv));
    if (state) d.expect(state.ride?.model === "suv", "boarding takes the 4×4", state.ride);
    await d.shot("at-the-wheel-of-the-4x4");
    await d.press("car");
  });

  let boat;
  await d.step("follow-the-route-to-an-occupied-mooring", async () => {
    boat = await select(d, "mooring", d.t("travelBoat"));
    await follow(d, "boatEnter");
  });
  await d.step("cast-off", async () => {
    await board(d, "touchBoat", "boatEnter", boat);
    const { state } = await d.waitFor("at the helm of the named boat", ({ hud }) =>
      hud.stats.includes(boat) && hud.stats.includes(d.t("knots")) && !hud.travel);
    if (state) d.expect(state.ride?.domain === "water", "boarding takes a boat", state.ride);
    await d.hold(["up"], 200);
    await d.waitFor("the boat moves", ({ hud }) => new RegExp(`[1-9]\\d*\\s+${d.t("knots")}`).test(hud.stats));
    await d.shot("at-the-helm");
    await d.waitFor("the boat can moor", ({ hud }) => hud.hint === d.t("boatDisembark"), 12000);
    await d.press("car");
    await d.waitFor("back on the quay", ({ hud }) => hud.ticker === d.t("boatMoored"));
  });

  let station;
  await d.step("follow-the-route-to-a-ring-station", async () => {
    station = await select(d, "station", d.t("travelTrain"));
    await follow(d, "stationHint");
  });
  await d.step("climb-to-the-platform", async () => {
    await board(d, "touchTrain", "stationHint", station);
    await d.waitFor("the platform tells the player to wait", ({ hud }) =>
      hud.hint === d.t("platformHint") || hud.hint.includes(d.t("doorsOpenHint")));
  });
  await d.step("board-the-train", async () => {
    const { state } = await d.waitFor("the train arrives and the player boards", ({ hud }) =>
      hud.hint.includes(d.t("doorsOpenHint")) || hud.hint.includes(d.t("nextStopHint")), 90000);
    if (state) d.expect(state.transit?.phase === "riding", "the player is on the train", state.transit);
  });
};
