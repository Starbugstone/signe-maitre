import bigCity from "../../.agents/skills/verify-signe-maitre/journeys/big-city.mjs";
import cityWest from "../../.agents/skills/verify-signe-maitre/journeys/city-scenery.mjs";
import cityEast from "../../.agents/skills/verify-signe-maitre/journeys/city-scenery-east.mjs";
import boatJourney from "../../.agents/skills/verify-signe-maitre/journeys/boats.mjs";
import island from "../../.agents/skills/verify-signe-maitre/journeys/island-voyage.mjs";
import { follow } from "../../.agents/skills/verify-signe-maitre/journeys/first-minute.mjs";
import fleet from "../../.agents/skills/verify-signe-maitre/journeys/fleet.mjs";

import marais from "../../.agents/skills/verify-signe-maitre/journeys/marais-ruelles.mjs";
import train from "../../.agents/skills/verify-signe-maitre/journeys/ring-train.mjs";

async function saloon(d) {
  await d.step("board-saloon", async () => {
    const { sedan } = await d.state();
    await d.walkTo({ x: sedan.x, y: sedan.y - 10 }, { tol: 14 });
    await d.waitFor("named Saloon prompt", ({ hud }) => hud.hint.includes(sedan.label));
    await d.wait(1300);
    await d.press("car");
    await d.waitFor("at the Saloon's wheel", ({ state }) => state.ride?.model === "sedan");
    await d.hold(["up"], 950);
  });
}

async function findRides(d) {
  await d.step("clerks-tip", async () => {
    d.expect((await d.hud()).ticker.includes(d.t("start")), "the clerk points out the road fleet, boats and trains");
    await d.wait(5800);
  });
  await d.step("map-and-legend", async () => {
    await d.press("map");
    await d.waitFor("travel choices visible", async () => d.page.locator("#tripOptions").isVisible());
    await d.wait(12000);
  });
  await d.step("select-the-motorbike", async () => {
    await d.click('[data-trip="bike"]');
    await d.waitFor("the route card names the motorbike", ({ hud }) => hud.travel?.type === d.t("travelBike"));
    await follow(d, "motoEnter");
    await d.waitFor("a boarding prompt naming the bike", ({ hud }) => hud.hint.includes(d.t("fleet:moto")));
    await d.wait(3500);
    await d.press("car");
    await d.waitFor("the player rides the named bike", ({ state }) => state.ride?.model === "moto");
    await d.hold(["up"], 1600);
  });
  await d.step("hosting", async () => {
    await d.press("map");
    await d.waitFor("the map behind the build caption", ({ hud }) => hud.map === d.t("closeMap"));
    await d.wait(6400);
  });
}

const boats = (d) => boatJourney(d, { bargeOnly: true });
const parkedMix = (d) => d.wait(5500);
export const drives = { parkedMix, bigCity, cityWest, cityEast, boats, island, saloon, findRides, marais, train };
for (const model of ["moto", "suv", "volta", "bus", "dumper"]) {
  drives[model] = (d) => {
    const step = d.step;
    d.step = (name, action) => step(name, async () => {
      await action();
      if (name === "crash-moto" || name === "crash-volta") {
        await d.shot("impact");
        await d.wait(2700);
      }
    });
    return fleet(d, { models: [model], returnToOffice: false });
  };
}
