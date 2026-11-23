// Take each seized vehicle at the étude's kerb in turn: walk to it, take the wheel, pull
// out, crash it and get out. The motorbike is ridden until it is a wreck and the Volta
// until it is dented, so every damage state is on screen. Then watch the traffic mix
// and wait for a line bus to pull up at a stop.
export const meta = { feature: "fleet", needs: "probe" };

import { blockedIn } from "../../../../src/world/collision.js";
import { office, town, Y } from "../../../../src/world/town.js";
import { brakeToStop, turnSlowly } from "./big-city.mjs";

const junctions = town.roadsX;
const turnTo = (want, a) => Math.atan2(Math.sin(want - a), Math.cos(want - a));
const halfLengths = { sedan: 11, volta: 12, suv: 12.4, moto: 7, dumper: 19, bus: 28.5 };
// Distance from a spot to a vehicle's body.
function gap(c, spot) {
  const dx = spot.x - c.x,
    dy = spot.y - c.y,
    cos = Math.cos(c.a),
    sin = Math.sin(c.a);
  const ahead = Math.abs(dx * cos + dy * sin) - c.halfLength,
    aside = Math.abs(dy * cos - dx * sin) - c.halfWidth;
  return Math.hypot(Math.max(0, ahead), Math.max(0, aside));
}
// How near the game counts a vehicle when F is pressed (`reach` in src/game/boarding.js).
const reach = (c, spot) => Math.min(Math.hypot(spot.x - c.x, spot.y - c.y), gap(c, spot) + 10.95);

// Each model, the condition to crash it down to, the speed it must reach on the straight,
// and its steering rate (rad/s), so the wheel is held as long as the turn needs.
const fleet = [
  ["moto", 0, 70, 3.7],
  ["suv", 99, 40, 2.3],
  ["volta", 64, 60, 2.6],
  // The bus before the dump truck, which crashes where the bus was parked.
  ["bus", 99, 16, 1.3],
  ["dumper", 99, 16, 1.4],
];

export default async function (d) {
  const home = (await d.state()).p,
    pavement = home.y;
  const seen = new Map();

  // Walk along the étude's street to the first spot that `arrived` accepts, around every
  // parked, crashed or abandoned vehicle: a breadth-first search over the street between
  // the two building lines. Moving traffic is left to stop for the walker, as it does.
  async function walkAround(arrived, what, required = true) {
    const cell = 3;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { parked, p } = await d.state();
      const top = Math.min(pavement - 16, p.y - 12);
      const bottom = Math.max(pavement + 60, p.y + 12);
      if (arrived(p, parked)) return true;
      // Start where the player actually got out, including a side street. Leave
      // enough room to get around the tail of a wreck lying across the route.
      const solid = (x, y) =>
        blockedIn(town, x, y, 2.6) ||
        (Math.hypot(x - p.x, y - p.y) > 9 &&
          parked.some((c) => {
            const dx = x - c.x,
              dy = y - c.y,
              cos = Math.cos(c.a),
              sin = Math.sin(c.a);
            return Math.abs(dx * cos + dy * sin) < c.halfLength + 3.4 &&
              Math.abs(dy * cos - dx * sin) < c.halfWidth + 3.4;
          }));
      const key = (i, j) => i + "," + j,
        at = (i, j) => ({ x: p.x + i * cell, y: p.y + j * cell });
      const seen = new Map([[key(0, 0), null]]),
        queue = [[0, 0]];
      let goal = null;
      while (queue.length && !goal) {
        const [i, j] = queue.shift();
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di,
            nj = j + dj,
            spot = at(ni, nj);
          if (seen.has(key(ni, nj)) || Math.abs(ni) > 260 || spot.y < top - 0.1 || spot.y > bottom + 0.1 || solid(spot.x, spot.y)) continue;
          seen.set(key(ni, nj), [i, j]);
          if (arrived(spot, parked)) {
            goal = [ni, nj];
            break;
          }
          queue.push([ni, nj]);
        }
      }
      if (!goal && !required) return false;
      d.expect(!!goal, `there is a way on foot to ${what}`, { from: p });
      // Keep the corners of the path and walk from one to the next.
      const cells = [];
      for (let step = goal; step; step = seen.get(key(...step))) cells.unshift(step);
      const corners = cells.filter((c, n) => n === cells.length - 1 || (n > 0 && (c[0] - cells[n - 1][0] !== cells[n + 1][0] - c[0] || c[1] - cells[n - 1][1] !== cells[n + 1][1] - c[1])));
      try {
        for (const corner of corners) await d.walkTo(at(...corner), { tol: 2.5, timeout: 30000 });
        const stopped = await d.state();
        if (arrived(stopped.p, stopped.parked)) return true;
        d.note("the final step carried the player past the boarding spot", { what, at: stopped.p });
      } catch (error) {
        d.note("path blocked, planning again", { what, error: error.message });
      }
    }
    if (!required) return false;
    d.expect(false, `the player reaches ${what}`);
  }

  // One tap on the wheel toward a heading: no longer than the turn needs, then straight on.
  async function steer(want, ms, rate, keys = ["up"]) {
    const { ride } = await d.state();
    const turn = turnTo(want, ride.a);
    if (Math.abs(turn) < 0.07) return d.hold(keys, ms);
    const tap = Math.min(ms, Math.max(18, (Math.abs(turn) / rate) * 800));
    await d.hold([...keys, turn > 0 ? "right" : "left"], tap);
    if (ms - tap > 16) await d.hold(keys, ms - tap);
  }

  async function wreckMotorbike(rate, observeSpeed) {
    // Set up in the middle of an ordinary block, where both kerbs are continuous.
    const streetY = Y(office.row);
    for (let i = 0; i < 70; i++) {
      const { ride } = await d.state();
      if (ride.condition === 0) return;
      const nearJunction = junctions.some((x) => Math.abs(ride.x - x) < 50);
      if (!nearJunction && Math.abs(ride.y - streetY) < 12 && Math.abs(turnTo(Math.PI, ride.a)) < 0.32) break;
      const aim = Math.PI - Math.max(-0.45, Math.min(0.45, (streetY - ride.y) * 0.06));
      await steer(aim, 110, rate, ride.speed < 34 ? ["up"] : []);
    }
    await brakeToStop(d);
    const { ride: linedUp } = await turnSlowly(d, Math.PI / 2, 15, 0.09);
    if (linedUp.condition === 0) return;
    d.expect(Math.abs(turnTo(Math.PI / 2, linedUp.a)) < 0.18, "the motorbike faces the south kerb", linedUp);
    // Back up for room to accelerate. Hitting the same wall head on makes damage repeatable.
    for (let i = 0; i < 6; i++) {
      if ((await d.state()).ride.condition === 0) break;
      await d.hold(["down"], 2100);
      let powering = true;
      await Promise.all([
        d.hold(["up"], 1150).finally(() => { powering = false; }),
        (async () => {
          while (powering) {
            const { ride } = await d.state();
            observeSpeed(ride.speed);
            await d.page.waitForTimeout(30);
          }
        })(),
      ]);
    }
  }

  for (const [model, wreckTo, pace, rate] of fleet) {
    let parkedAt;
    let top = 0;
    const observeSpeed = (speed) => { top = Math.max(top, Math.abs(speed)); };
    await d.step(`walk-to-${model}`, async () => {
      const { parked } = await d.state();
      const car = parked.find((c) => c.model === model && c.showpiece && c.condition > 0);
      d.expect(!!car, `a seized ${model} stands at the étude's kerb`, parked.filter((c) => c.model !== "sedan"));
      parkedAt = car;
      // To the vehicle's door, from the pavement or the street side, whichever is open.
      // The spot must be nearer this vehicle than any other, or F takes the wrong wheel.
      // From the pavement if there is a way: traffic stops beside a walker in the street.
      const door = (kerbSide) => (spot, cars) => {
        const now = cars.find((c) => c.model === model && c.showpiece && c.condition > 0) || car;
        const mine = reach(now, spot);
        return mine < 19 && (!kerbSide || spot.y < now.y - 6) && cars.every((c) => c === now || reach(c, spot) > mine + 3);
      };
      if (!(await walkAround(door(true), `the ${model}`, false))) await walkAround(door(false), `the ${model}`);
      // Let a passing car go by first, as a player would.
      await d.waitFor(
        "no traffic nearer than the vehicle",
        ({ state }) => state.traffic.every((c) => reach({ ...c, model: c.model }, state.p) > reach(car, state.p) - 2),
        20000,
      ).catch(() => d.note("traffic still close", {}));
      await d.waitFor("the hint offers " + model, ({ hud }) =>
        hud.hint.includes(d.t(model === "moto" ? "motoEnter" : "enterHint")) && hud.hint.includes(d.t("fleet:" + model)), 6000);
    });
    await d.step(`board-${model}`, async () => {
      await d.press("car");
      const { state, hud } = await d.waitFor(`riding the ${model}`, ({ state, hud }) => state.ride?.model === model && hud.stats.includes("km/h"));
      d.note(`${model} at the kerb`, state.ride);
      d.expect(hud.ticker.includes(d.t("fleet:" + model)), "the ticker names the model", hud.ticker);
      d.expect(hud.stats.includes(d.t("fleet:" + model)), "the speed and condition name the model", hud.stats);
      seen.set(model, state.ride);
    });
    await d.step(`drive-${model}`, async () => {
      // Parked facing west on the north kerb: ease out into the westbound lane at a crawl,
      // then hold the throttle open along it while tapping the wheel to keep straight.
      const start = (await d.state()).ride,
        lane = parkedAt.y + 12.5; // a little south of the lane line: the étude sedan rubs into it
      // A long body swings out gently, or its nose is across the oncoming lane.
      const swing = halfLengths[model] > 15 ? 0.28 : 0.8;
      const aim = (ride) => Math.PI - Math.max(-swing, Math.min(swing, (lane - ride.y) * 0.07));
      for (let i = 0; i < 70; i++) {
        const { ride } = await d.state();
        observeSpeed(ride.speed);
        // A bump from passing traffic is no reason to stop: carry on like any driver.
        if (start.x - ride.x > 120) break;
        if (Math.abs(lane - ride.y) < 5 && Math.abs(turnTo(Math.PI, ride.a)) < 0.35) break;
        await steer(aim(ride), 90, rate, Math.abs(ride.speed) < Math.min(22, pace) ? ["up"] : []);
      }
      // Throttle held through every tap of the wheel, until the model is up to its pace.
      let held = 0;
      for (let i = 0; i < 80; i++) {
        const { ride } = await d.state();
        observeSpeed(ride.speed);
        const gone = Math.hypot(ride.x - start.x, ride.y - start.y);
        if (gone > 30 && top > pace) break;
        // Nose to nose with traffic: back off a little and let it through.
        held = Math.abs(ride.speed) < 2 ? held + 1 : 0;
        if (held > 5) {
          await d.hold(["down"], 900);
          await new Promise((r) => setTimeout(r, 1500));
          held = 0;
          continue;
        }
        await steer(aim(ride), 110, rate);
      }
      const { ride } = await d.state();
      observeSpeed(ride.speed);
      d.note(`${model} pulled out`, { start, ride, top });
      d.expect(Math.hypot(ride.x - start.x, ride.y - start.y) > 20, `the ${model} drives off down the street`, { start, ride });
      if (model !== "moto") d.expect(top > pace, `the ${model} gets up to speed (${top.toFixed(0)} units/s)`, { top, pace });
    });
    // The two long bodies drive on west to the roundabout at the end of the étude's street
    // and lap it the way traffic goes, without getting stuck on the island or the kerbs.
    if (model === "bus" || model === "dumper")
      await d.step(`roundabout-${model}`, async () => {
        const here = (await d.state()).ride;
        const rb = town.roads.nodes.find((n) => n.radius && n.row === office.row && n.x < here.x);
        d.expect(!!rb, "a roundabout lies west along the étude's street", rb);
        const lane = Y(office.row) - 3.5,
          ring = (rb.radius + rb.outerRadius) / 2 + 2,
          lap = (330 / 180) * Math.PI; // round to the arm it came in by
        // Westbound in the lane up to the roundabout, letting traffic by when nose to nose.
        let blocked = 0;
        for (let i = 0; i < 400; i++) {
          const { ride } = await d.state();
          if (ride.x - rb.x < rb.outerRadius + 30) break;
          blocked = Math.abs(ride.speed) < 2 ? blocked + 1 : 0;
          if (blocked > 6) {
            await d.hold(["down"], 900);
            await new Promise((r) => setTimeout(r, 1500));
            blocked = 0;
            continue;
          }
          const aim = Math.PI - Math.max(-0.28, Math.min(0.28, (lane - ride.y) * 0.07));
          await steer(aim, 110, rate, Math.abs(ride.speed) < 30 ? ["up"] : []);
        }
        const arrived = (await d.state()).ride;
        d.expect(arrived.x - rb.x < rb.outerRadius + 30, `the ${model} reaches the roundabout`, arrived);
        // Round the island anticlockwise on the map, aiming a little ahead on the ring.
        let turned = 0,
          last = null,
          stuck = 0,
          worst = 0;
        const trace = [];
        const { time: started } = await d.state();
        const deadline = Date.now() + 150000;
        while (turned > -lap && Date.now() < deadline) {
          const { ride, time } = await d.state();
          if (time - started > 60) break;
          const theta = Math.atan2(ride.y - rb.y, ride.x - rb.x);
          if (last !== null) turned += turnTo(theta, last);
          last = theta;
          trace.push([Math.round(ride.x - rb.x), Math.round(ride.y - rb.y), +ride.a.toFixed(2), Math.round(ride.speed)]);
          const ahead = theta - 0.6,
            heading = Math.atan2(rb.y + Math.sin(ahead) * ring - ride.y, rb.x + Math.cos(ahead) * ring - ride.x);
          stuck = Math.abs(ride.speed) < 2 ? stuck + 1 : 0;
          worst = Math.max(worst, stuck);
          if (stuck > 6) {
            await d.hold(["down"], 600);
            stuck = 0;
            continue;
          }
          await steer(heading, 110, rate, Math.abs(ride.speed) < 24 ? ["up"] : []);
        }
        const { ride, time } = await d.state();
        const seconds = time - started;
        d.note(`${model} lapped the roundabout`, { rb: rb.id, turned, seconds, worst, ride, trace });
        // Before long bodies could overhang the corner pavements, the bus managed half a lap in a minute.
        d.expect(turned <= -lap, `the ${model} goes round the roundabout to its entry arm within a minute (${seconds.toFixed(0)} s)`, { turned, worst });
      });
    await d.step(`crash-${model}`, async () => {
      // Across the street into the buildings on the south side, where nothing is parked,
      // backing off and ramming again as needed.
      if (model === "moto") {
        await wreckMotorbike(rate, observeSpeed);
        d.expect(top > pace, `the motorbike gets up to speed (${top.toFixed(0)} units/s)`, { top, pace });
      }
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
      if (model === "volta") d.expect(ride.condition > 0, "the damaged Volta still runs", ride);
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

  await d.step("walk-back-to-etude", async () => {
    await walkAround((spot) => Math.abs(spot.x - home.x) < 8 && Math.abs(spot.y - pavement) < 4, "the étude");
  });
  await d.step("traffic-mix", async () => {
    // Back at the étude, watch what drives by.
    const models = new Set();
    let halted = null;
    const end = Date.now() + 150000;
    while (Date.now() < end && !(halted && models.size >= 4)) {
      const { traffic } = await d.state();
      for (const c of traffic) models.add(c.model);
      halted ||= traffic.find((c) => c.model === "bus" && c.halted && c.roadClass === "avenue" && Math.abs(c.speed) < 0.5);
      await new Promise((r) => setTimeout(r, 500));
    }
    d.note("traffic models", [...models]);
    d.expect(models.size >= 4, "traffic is a mix of at least four models", [...models]);
    d.expect(models.has("sedan") && [...models].some((m) => m === "bus" || m === "dumper"), "cars and heavy vehicles share the streets", [...models]);
    d.expect(!!halted, "a line bus pulls up at a stop", halted);
    if (halted) {
      const { state } = await d.waitFor(
        "the bus moves off again",
        ({ state }) => state.traffic.some((c) => c.routeId === halted.routeId && !c.halted && c.speed > 4),
        30000,
      );
      d.expect(state.traffic.some((c) => c.model === "bus"), "the bus drives on", state.traffic);
    }
  });
}
