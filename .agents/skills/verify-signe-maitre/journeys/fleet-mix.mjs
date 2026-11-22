import { X, Y } from "../../../../src/world/town.js";
import { driveRouteTo } from "./big-city.mjs";

export const meta = { feature: "Normal road traffic mix", needs: "probe" };

const destinations = [
  { x: X(8) + 6, y: Y(4) },
  { x: X(8) + 6, y: Y(3) + 6 },
  { x: X(7), y: Y(3) - 6 },
  { x: X(7) - 6, y: Y(6) - 6 },
  { x: X(8) - 6, y: Y(6) + 6 },
  { x: X(8) + 6, y: Y(4) },
];

export default async (d) => {
  await d.step("take-the-office-sedan", async () => {
    await d.press("car");
    await d.waitFor("at the wheel", ({ state }) => state.ride?.label === "Étude 2000");
  });

  const start = await d.state();
  const models = ["sedan", "volta", "suv", "moto", "bus", "dumper"];
  const sightings = new Map();
  const { width, height } = d.page.viewportSize();
  const zoom = Math.max(1.95, Math.min(5.15, width / 280, height / 185));
  const watch = ({ time, p, ride, traffic, cam }) => {
    if (time - start.time > 60 || Math.abs(ride.speed) < 4) return;
    for (const car of traffic) {
      if (!models.includes(car.model) || sightings.has(car.model) || Math.abs(car.speed) < 2) continue;
      if (Math.hypot(car.x - p.x, car.y - p.y) > 85) continue;
      if (Math.abs(car.x - cam.x) > width / zoom / 2 - 12 || Math.abs(car.y - cam.y) > height / zoom / 2 - 12) continue;
      const sighting = { time: +(time - start.time).toFixed(1), x: car.x, y: car.y };
      sightings.set(car.model, sighting);
      d.note("passed " + car.model, sighting);
    }
  };

  await d.step("drive-through-moving-traffic", async () => {
    for (const destination of destinations) {
      await driveRouteTo(d, destination, { maxSpeed: 50, tol: 26, stop: false, onSample: watch, timeout: 75000 });
      if ((await d.state()).time - start.time > 60) break;
    }
    const elapsed = (await d.state()).time - start.time;
    d.note("models passed in the first minute of driving", Object.fromEntries(sightings));
    d.expect(elapsed >= 60 || sightings.size === models.length, "the player drove for a full minute or passed the whole fleet sooner", elapsed);
    d.expect(models.every((model) => sightings.has(model)), "the player passes each road model in ordinary moving traffic", Object.fromEntries(sightings));
  });
};
