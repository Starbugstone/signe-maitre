// Take each seized vehicle at the étude's kerb in turn: walk to it, take the wheel, pull
// out, crash it and get out. The motorbike is ridden until it is a wreck and the Volta
// until it is dented, so every damage state is on screen. Then watch the traffic mix
// and wait for a line bus to pull up at a stop.
export const meta = { feature: "fleet", needs: "probe" };

const junctions = [75, 365, 655, 945, 1235, 1525];
const turnTo = (want, a) => Math.atan2(Math.sin(want - a), Math.cos(want - a));

// Each model, the condition to crash it down to, the speed it must reach on the straight,
// how fast it steers (rad/s), so a tap on the wheel is as long as the turn needs, and its
// acceleration (units/s²), so the throttle is held just long enough.
const fleet = [
  ["moto", 0, 70, 3.7, 215],
  ["suv", 99, 40, 2.3, 104],
  ["volta", 64, 60, 2.6, 196],
  ["dumper", 99, 22, 1.4, 40],
  ["bus", 99, 22, 1.3, 46],
];

export default async function (d) {
  const pavement = (await d.state()).p.y;
  const seen = new Map();

  // One tap on the wheel toward a heading: no longer than the turn needs, then straight on.
  async function steer(want, ms, rate, keys = ["up"]) {
    const { ride } = await d.state();
    const turn = turnTo(want, ride.a);
    if (Math.abs(turn) < 0.07) return d.hold(keys, ms);
    const tap = Math.min(ms, Math.max(18, (Math.abs(turn) / rate) * 800));
    await d.hold([...keys, turn > 0 ? "right" : "left"], tap);
    if (ms - tap > 16) await d.hold(keys, ms - tap);
  }

  for (const [model, wreckTo, pace, rate, accel] of fleet) {
    let parkedAt;
    await d.step(`walk-to-${model}`, async () => {
      const { parked, p } = await d.state();
      const car = parked.find((c) => c.model === model && c.condition > 0 && Math.abs(c.y - pavement) < 14);
      d.expect(!!car, `a seized ${model} stands at the étude's kerb`, parked.filter((c) => c.model !== "sedan"));
      parkedAt = car;
      // Back to the pavement first, then along it to the vehicle's door.
      if (Math.abs(p.y - pavement) > 3) await d.walkTo({ x: p.x, y: pavement }, { tol: 3, timeout: 20000 });
      await d.walkTo({ x: car.x, y: pavement }, { tol: 5, timeout: 90000 });
      d.expect((await d.hud()).hint.includes(d.t("enterHint")), "the hint offers the wheel", await d.hud());
    });
    await d.step(`board-${model}`, async () => {
      await d.press("car");
      const { state, hud } = await d.waitFor(`riding the ${model}`, ({ state, hud }) => state.ride?.model === model && hud.stats.includes("km/h"));
      d.note(`${model} at the kerb`, state.ride);
      d.expect(hud.ticker.includes(d.t("fleet:" + model)), "the ticker names the model", hud.ticker);
      seen.set(model, state.ride);
    });
    await d.step(`drive-${model}`, async () => {
      // Parked facing west on the north kerb: ease out into the westbound lane at a crawl,
      // then hold the throttle open along it while tapping the wheel to keep straight.
      const start = (await d.state()).ride,
        lane = parkedAt.y + 12.5; // a little south of the lane line: the étude sedan rubs into it
      let top = 0;
      const aim = (ride) => Math.PI - Math.max(-0.8, Math.min(0.8, (lane - ride.y) * 0.07));
      for (let i = 0; i < 70; i++) {
        const { ride } = await d.state();
        top = Math.max(top, Math.abs(ride.speed));
        if (ride.condition < 100 || start.x - ride.x > 120) break;
        if (Math.abs(lane - ride.y) < 5 && Math.abs(turnTo(Math.PI, ride.a)) < 0.35) break;
        await steer(aim(ride), 90, rate, Math.abs(ride.speed) < 22 ? ["up"] : []);
      }
      // Throttle held through every tap of the wheel, until the model is up to its pace.
      for (let i = 0; i < 60 && top <= pace * 1.1; i++) {
        const { ride } = await d.state();
        top = Math.max(top, Math.abs(ride.speed));
        if (ride.condition < 100 || start.x - ride.x > 170) break;
        await steer(aim(ride), 110, rate);
      }
      const { ride } = await d.state();
      top = Math.max(top, Math.abs(ride.speed));
      d.note(`${model} pulled out`, { start, ride, top });
      d.expect(Math.hypot(ride.x - start.x, ride.y - start.y) > 20, `the ${model} drives off down the street`, { start, ride });
      d.expect(top > pace, `the ${model} gets up to speed (${top.toFixed(0)} units/s)`, { top, pace });
    });
    await d.step(`crash-${model}`, async () => {
      // Across the street into the buildings on the south side, where nothing is parked,
      // backing off and ramming again as needed.
      let still = 0,
        hits = 0,
        last = (await d.state()).ride.condition;
      const end = Date.now() + 120000;
      while (Date.now() < end) {
        const { ride } = await d.state();
        if (!ride) break;
        if (ride.condition < last) hits++;
        last = ride.condition;
        if (ride.condition <= wreckTo) break;
        // Clear of a junction, turn for the wall; in one, carry on to the next block.
        const crossing = junctions.some((x) => Math.abs(ride.x - x) < 34);
        still = Math.abs(ride.speed) < 3 ? still + 1 : 0;
        if (still > 4) {
          await d.hold(["down"], model === "bus" || model === "dumper" ? 1500 : 800);
          still = 0;
        } else await steer(crossing ? Math.PI : Math.PI / 2, 150, rate);
      }
      const { ride } = await d.state();
      d.note(`${model} after the crash`, { ride, hits });
      d.expect(ride.condition <= wreckTo, `the ${model} is damaged down to ${wreckTo}% or less`, ride);
      if (wreckTo === 0) d.expect((await d.hud()).hint.includes(d.t("callRecovery")), "a wreck offers roadside assistance", await d.hud());
    });
    await d.step(`leave-${model}`, async () => {
      for (let i = 0; i < 5 && (await d.state()).ride; i++) {
        const { ride } = await d.state();
        if (Math.abs(ride.speed) > 2) await d.hold(["action"], 700);
        await d.press("car");
        await new Promise((r) => setTimeout(r, 250));
        // No room at the door: back the vehicle off the wall and try again.
        if ((await d.state()).ride && ride.condition > 0) await d.hold(["down"], 700);
      }
      const { state } = await d.waitFor("on foot", ({ state }) => state.ride === null);
      const left = state.parked.find((c) => c.model === model && c.condition < 100);
      d.expect(!!left, `the damaged ${model} stays where it was left`, state.parked);
    });
  }

  await d.step("traffic-mix", async () => {
    // Back at the étude, watch what drives by.
    const models = new Set();
    let halted = null;
    const end = Date.now() + 150000;
    while (Date.now() < end && !(halted && models.size >= 4)) {
      const { traffic } = await d.state();
      for (const c of traffic) models.add(c.model);
      halted ||= traffic.find((c) => c.model === "bus" && c.halted && Math.abs(c.speed) < 0.5);
      await new Promise((r) => setTimeout(r, 500));
    }
    d.note("traffic models", [...models]);
    d.expect(models.size >= 4, "traffic is a mix of at least four models", [...models]);
    d.expect(models.has("sedan") && [...models].some((m) => m === "bus" || m === "dumper"), "cars and heavy vehicles share the streets", [...models]);
    d.expect(!!halted, "a line bus pulls up at a stop", halted);
    if (halted) {
      const { state } = await d.waitFor(
        "the bus moves off again",
        ({ state }) => state.traffic.some((c) => c.model === "bus" && !c.halted && c.speed > 4),
        30000,
      );
      d.expect(state.traffic.some((c) => c.model === "bus"), "the bus drives on", state.traffic);
    }
  });
}
