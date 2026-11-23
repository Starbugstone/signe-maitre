import { X, Y } from "../../../../src/world/town.js";
import { trafficPercent } from "../../../../src/game/fleet.js";
import { driveRouteTo } from "./big-city.mjs";

export const meta = { feature: "Normal road traffic mix", needs: "probe" };

const destinations = [
  { x: X(8), y: Y(5) + 6 },
  { x: X(8) + 6, y: Y(4) },
  { x: X(9), y: Y(4) + 6 },
  { x: X(9) - 6, y: Y(6) },
  { x: X(7), y: Y(6) - 6 },
  { x: X(7) + 6, y: Y(5) },
];

async function leaveKerb(d, watch) {
  const lane = Y(5) + 6;
  for (let i = 0; i < 40; i++) {
    const state = await d.state();
    watch(state);
    const { ride } = state;
    const offset = lane - ride.y;
    if (Math.abs(offset) < 3 && Math.abs(ride.a) < 0.16) return;
    const aim = Math.max(-0.3, Math.min(0.5, offset / 24));
    const turn = Math.atan2(Math.sin(aim - ride.a), Math.cos(aim - ride.a));
    const controls = ride.speed < 25 ? ["up"] : [];
    if (Math.abs(turn) > 0.08) controls.push(turn > 0 ? "right" : "left");
    await d.hold(controls, 90);
  }
}

export default async (d) => {
  await d.step("take-the-office-sedan", async () => {
    await d.press("car");
    await d.waitFor("at the wheel", ({ state }) => state.ride?.label === "Étude 2000");
  });

  const start = await d.state();
  const models = Object.keys(trafficPercent).filter((model) => trafficPercent[model].moving > 0);
  const sightings = new Map();
  const { width, height } = d.page.viewportSize();
  const zoom = Math.max(1.95, Math.min(5.15, width / 280, height / 185));
  const watch = ({ time, ride, traffic, cam }) => {
    if (time - start.time > 60 || Math.abs(ride.speed) < 4) return;
    for (const car of traffic) {
      if (!models.includes(car.model) || sightings.has(car.model) || Math.abs(car.speed) < 2) continue;
      if (Math.abs(car.x - cam.x) > width / zoom / 2 - 12 || Math.abs(car.y - cam.y) > height / zoom / 2 - 12) continue;
      const sighting = { time: +(time - start.time).toFixed(1), x: car.x, y: car.y };
      sightings.set(car.model, sighting);
      d.note("passed " + car.model, sighting);
    }
  };

  await d.step("leave-the-kerb", () => leaveKerb(d, watch));
  await d.step("drive-through-moving-traffic", async () => {
    const finished = ({ time }) => time - start.time >= 60 || sightings.size === models.length;
    let state = await d.state();
    for (let leg = 0; !finished(state); leg++) {
      state = await driveRouteTo(d, destinations[leg % destinations.length], {
        maxSpeed: 58, tol: 21, stop: false, onSample: watch, timeout: 150000,
        until: finished,
      });
    }
    d.note("models passed in the first minute of driving", Object.fromEntries(sightings));
    d.expect(models.every((model) => sightings.has(model)), "the player passes each road model in ordinary moving traffic", Object.fromEntries(sightings));
  });
};
