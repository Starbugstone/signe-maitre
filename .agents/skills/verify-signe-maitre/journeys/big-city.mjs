// Verify the expanded 16x12 Paris-like Port-Fer city with real controls:
// 1. Open the full 16x12 city map and verify the localized Paris-like district HUD.
// 2. Board the Étude 2000 sedan and drive along town.roads around Place de la Contrainte
//    (Obelisk roundabout) anticlockwise without wrecking the car.
// 3. Observe live city traffic circulating anticlockwise around the roundabout.
// 4. Drive south across Pont de la Contrainte over River la Ferre onto the South Bank.
// 5. Try to drive the wide sedan into narrow Ruelle des Écoles and verify it is refused,
//    then exit on foot and walk straight through the same narrow cobblestone alley.
// 6. Walk down avenue col 8 to Gare du Sud station under the Petite Ceinture ring viaduct.
import { town, X, Y } from "../../../../src/world/town.js";
import { findRoute } from "../../../../src/world/routes.js";

export const meta = { feature: "big-city", needs: "probe" };

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function densifyPath(points, spacing = 8) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let k = 1; k <= steps; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
    }
  }
  return out;
}

function upcomingCurvature(dense, idx, lookDist = 65) {
  let acc = 0,
    maxTurn = 0,
    prevA = null;
  for (let i = idx; i < dense.length - 1 && acc < lookDist; i++) {
    const dx = dense[i + 1].x - dense[i].x,
      dy = dense[i + 1].y - dense[i].y;
    const seg = Math.hypot(dx, dy);
    if (seg < 0.5) continue;
    const a = Math.atan2(dy, dx);
    if (prevA !== null) maxTurn = Math.max(maxTurn, Math.abs(wrapAngle(a - prevA)));
    prevA = a;
    acc += seg;
  }
  return maxTurn;
}

async function brakeToStop(d, timeout = 3500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await d.state();
    if (!s.ride || Math.abs(s.ride.speed) < 3.5) return s;
    await d.hold([s.ride.speed > 0 ? "down" : "up"], Math.min(180, Math.max(55, Math.round(Math.abs(s.ride.speed) * 4))));
  }
  return d.state();
}

function isNearRoundabout(pt, pad = 6) {
  return town.roads.nodes.some(
    (n) => n.kind === "roundabout" && Math.hypot(pt.x - n.x, pt.y - n.y) <= n.outerRadius + pad,
  );
}

// Build a French right-hand-lane polyline from findRoute so the player drives in the right lane
// (never head-on into opposing traffic exiting roundabouts or approaching on avenues).
function buildRightLaneRoute(from, dest, laneOffset = 6) {
  const raw = findRoute(town, from, dest, { onFoot: false });
  if (raw.length <= 2) return densifyPath(raw, 8);
  const shifted = [raw[0]];
  for (let i = 1; i < raw.length - 1; i++) {
    const prev = raw[i - 1],
      curr = raw[i],
      next = raw[i + 1];
    if (isNearRoundabout(curr, 2)) {
      // Skip the first/last dead-center cardinal point on the roundabout ring so right-hand entry/exit flows smoothly.
      const prevIn = isNearRoundabout(prev, 2),
        nextIn = isNearRoundabout(next, 2);
      if (prevIn && nextIn) shifted.push(curr);
      continue;
    }
    const dx1 = curr.x - prev.x,
      dy1 = curr.y - prev.y,
      l1 = Math.hypot(dx1, dy1) || 1;
    const dx2 = next.x - curr.x,
      dy2 = next.y - curr.y,
      l2 = Math.hypot(dx2, dy2) || 1;
    const rx1 = (-dy1 / l1) * laneOffset,
      ry1 = (dx1 / l1) * laneOffset;
    const rx2 = (-dy2 / l2) * laneOffset,
      ry2 = (dx2 / l2) * laneOffset;
    // Average right normals at corners (clamped) or apply exact right shift on straight runs.
    if (l1 > 10 && !isNearRoundabout(prev, 2)) {
      shifted.push({ x: curr.x + rx1, y: curr.y + ry1 });
    }
    if (l2 > 10 && !isNearRoundabout(next, 2) && Math.hypot(rx2 - rx1, ry2 - ry1) > 2) {
      shifted.push({ x: curr.x + rx2, y: curr.y + ry2 });
    } else if (!(l1 > 10 && !isNearRoundabout(prev, 2))) {
      shifted.push({ x: curr.x + rx2, y: curr.y + ry2 });
    }
  }
  shifted.push(raw.at(-1));
  return densifyPath(shifted, 8);
}

// Steer the player's car like a real driver along a road polyline on `town.roads` using real keys/touches.
async function driveRouteTo(
  d,
  dest,
  { tol = 20, stop = true, timeout = 80000, maxSpeed = 76, waypoints = null, onSample = null } = {},
) {
  const buildDense = (from) => (waypoints ? densifyPath([from, ...waypoints], 8) : buildRightLaneRoute(from, dest));

  let s = await d.state();
  if (!s.ride) throw Error("Expected to be driving a car in driveRouteTo");
  let dense = buildDense(s.ride);
  let cursor = 0;

  const end = Date.now() + timeout;
  let stuckTicks = 0;
  let trafficWaitTicks = 0;
  let prev = null;

  while (Date.now() < end) {
    s = await d.state();
    if (!s.ride) throw Error("Expected to be driving a car in driveRouteTo");
    if (s.ride.condition <= 0) throw Error(`Car wrecked at ${JSON.stringify(s.ride)} heading to ${JSON.stringify(dest)}`);
    if (onSample) onSample(s);

    const remDest = Math.hypot(dest.x - s.ride.x, dest.y - s.ride.y);
    if (remDest <= tol && cursor >= dense.length - 8) {
      return stop ? brakeToStop(d) : s;
    }

    // Advance cursor along the planned road polyline.
    let bestIdx = cursor,
      bestDist = Infinity;
    const searchEnd = Math.min(dense.length - 1, cursor + 36);
    for (let i = Math.max(0, cursor - 2); i <= searchEnd; i++) {
      const dd = Math.hypot(dense[i].x - s.ride.x, dense[i].y - s.ride.y);
      if (dd < bestDist) {
        bestDist = dd;
        bestIdx = i;
      }
    }
    cursor = bestIdx;

    // If bumped or pushed off the planned road polyline, replan along town.roads from here.
    if (!waypoints && bestDist > 34) {
      dense = buildDense(s.ride);
      cursor = 0;
    }

    // Pick lookahead point along the road polyline.
    const curve = upcomingCurvature(dense, cursor, 72);
    const nearRb = isNearRoundabout(s.ride, 22);
    const tight = curve > 0.25 || nearRb;
    const lookDist = tight ? 24 : 46;
    let lookIdx = cursor,
      walked = 0;
    while (lookIdx < dense.length - 1 && walked < lookDist) {
      walked += Math.hypot(dense[lookIdx + 1].x - dense[lookIdx].x, dense[lookIdx + 1].y - dense[lookIdx].y);
      lookIdx++;
    }
    const look = dense[lookIdx];

    // Check progress for stuck recovery.
    if (prev && Math.hypot(s.ride.x - prev.x, s.ride.y - prev.y) < 1.2) {
      stuckTicks++;
    } else {
      stuckTicks = 0;
    }
    prev = s.ride;

    // Yield briefly when moving traffic is directly ahead; if a car is dead-stopped nose-to-nose, back up and clear it.
    const cos = Math.cos(s.p.a),
      sin = Math.sin(s.p.a);
    const carAhead = s.traffic.find((c) => {
      const dx = c.x - s.ride.x,
        dy = c.y - s.ride.y;
      const fwd = dx * cos + dy * sin,
        side = -dx * sin + dy * cos;
      return fwd > 8 && fwd < 28 && Math.abs(side) < 9.5;
    });
    if (carAhead) {
      if (carAhead.speed > 1.5 && trafficWaitTicks < 8) {
        trafficWaitTicks++;
        if (s.ride.speed > 6) await d.hold(["down"], 90);
        else await d.page.waitForTimeout(160);
        stuckTicks = 0;
        continue;
      }
      if (carAhead.speed <= 1.5 && trafficWaitTicks < 3) {
        trafficWaitTicks++;
        await d.hold(["down", "right"], 320);
        await brakeToStop(d, 800);
        await d.page.waitForTimeout(260);
        stuckTicks = 0;
        continue;
      }
    }
    trafficWaitTicks = 0;

    const want = Math.atan2(look.y - s.ride.y, look.x - s.ride.x);
    const err = wrapAngle(want - s.p.a);
    const absErr = Math.abs(err);

    if (stuckTicks >= 4) {
      // Back up briefly away from a kerb or car, then replan cleanly.
      const backSteer = err > 0 ? "left" : "right";
      await d.hold(["down", backSteer], 400);
      await brakeToStop(d, 1000);
      if (!waypoints) {
        dense = buildDense((await d.state()).ride);
        cursor = 0;
      }
      stuckTicks = 0;
      continue;
    }

    // Target speed slows smoothly for turns, roundabouts and final approach.
    let vTarget = tight ? 38 : maxSpeed;
    if (absErr > 0.7) vTarget = Math.min(vTarget, 30);
    if (stop && remDest < 68) vTarget = Math.min(vTarget, Math.max(16, remDest * 0.55));

    if (s.ride.speed > vTarget + 12) {
      await d.hold(["down"], 95);
      continue;
    }

    if (absErr > 1.75) {
      // Controlled low-speed turn into the open roadway.
      const steer = err >= 0 ? "right" : "left";
      if (s.ride.speed < 28) await d.hold(["up", steer], 170);
      else await d.hold([steer], 140);
    } else if (absErr > 0.14) {
      const steer = err > 0 ? "right" : "left";
      const ms = Math.min(210, Math.max(85, Math.round(absErr * 175)));
      if (s.ride.speed < vTarget) await d.hold(["up", steer], ms);
      else await d.hold([steer], ms);
    } else {
      if (s.ride.speed < vTarget) {
        const ms = Math.min(300, Math.max(100, Math.round(remDest * 2.4)));
        await d.hold(["up"], ms);
      } else {
        await d.page.waitForTimeout(90);
      }
    }
  }
  const last = await d.state();
  throw Error(`driveRouteTo timed out reaching ${JSON.stringify(dest)} from ${JSON.stringify(last.ride)}`);
}

// Turn with a small rolling radius and check the result after braking.
async function turnSlowly(d, angle, speed, tolerance = 0.17) {
  let lastError = Infinity, stalled = 0;
  for (let i = 0; i < 54; i++) {
    const { p, ride } = await d.state();
    const error = wrapAngle(angle - p.a);
    const remaining = Math.abs(error);
    if (remaining < tolerance) break;
    const steer = error > 0 ? "right" : "left";
    stalled = lastError - remaining < 0.035 ? stalled + 1 : 0;
    lastError = remaining;
    if (stalled === 4) {
      // A kerb can stop the front of the sedan before it clears the turn. Back the nose out.
      await d.hold(["down", steer === "right" ? "left" : "right"], 320);
      await brakeToStop(d, 1000);
      stalled = 0;
    } else {
      await d.hold(ride.speed < speed ? ["up", steer] : [steer], 95);
    }
  }
  return brakeToStop(d);
}

// If the turn carried the sedan wide, use the width of the quay to reverse
// towards the alley centre before pointing the nose south again.
async function adjustAlleyApproach(d, alleyX, quaiY, state) {
  for (let i = 0; i < 38; i++) {
    const { ride } = state;
    const offset = ride.x - alleyX;
    if (Math.abs(offset) <= 5 || ride.y < quaiY - 16) break;
    const aim = Math.PI / 2 - Math.max(-0.9, Math.min(0.9, offset * 0.08));
    const error = wrapAngle(aim - ride.a);
    const power = ride.speed > -17 ? ["down"] : [];
    const steering = Math.abs(error) > 0.1 ? [error < 0 ? "right" : "left"] : [];
    await d.hold([...power, ...steering], 100);
    state = await d.state();
  }
  await brakeToStop(d);
  return turnSlowly(d, Math.PI / 2, 10);
}

export default async function (d) {
  await d.step("big-city-map-open", async () => {
    await d.press("map");
    const { hud } = await d.waitFor("city map open", ({ hud }) => hud.map === d.t("closeMap") && hud.route === null);
    d.expect(hud.district.includes(d.t("districtContrainte")), "HUD shows localized Paris-like district", hud.district);
  });

  await d.step("big-city-map-close", async () => {
    await d.press("map");
    await d.waitFor("city map closed", ({ hud }) => hud.map === d.t("map"));
  });

  await d.step("board-sedan", async () => {
    const { sedan } = await d.state();
    await d.walkTo({ x: sedan.x, y: sedan.y - 10 }, { tol: 14 });
    await d.press("car");
    const { state } = await d.waitFor("in the sedan", ({ state }) => state.ride?.label === "Étude 2000");
    d.expect(!!state.ride, "player boards the Étude 2000", state.ride);
  });

  // Drive west along row 5 and circulate anticlockwise around Place de la Contrainte (col 6, row 5).
  const rb = town.roadNodeById.get("c6r5");
  await d.step("drive-around-roundabout", async () => {
    // The parked sedan faces east. Turn at low speed within the width of the office street.
    const turned = await turnSlowly(d, Math.PI, 19);
    d.expect(Math.abs(turned.p.a) > 2.8, "The sedan faces west towards Place de la Contrainte", turned.p);

    let sawNorth = false,
      sawWest = false;
    await driveRouteTo(
      d,
      { x: rb.x - 10, y: rb.y + 62 },
      {
        tol: 20,
        stop: true,
        timeout: 90000,
        maxSpeed: 56,
        onSample: ({ ride }) => {
          if (ride.y < rb.y - 16 && Math.abs(ride.x - rb.x) < rb.outerRadius + 6) sawNorth = true;
          if (ride.x < rb.x - 16 && Math.abs(ride.y - rb.y) < rb.outerRadius + 6) sawWest = true;
        },
      },
    );
    const { ride } = await d.state();
    d.expect(
      sawNorth && sawWest && ride.y > rb.y + 36 && ride.condition >= 60,
      "sedan circulated anticlockwise around the Obelisk roundabout without wrecking",
      { sawNorth, sawWest, ride },
    );
  });

  await d.step("observe-roundabout-traffic", async () => {
    // Watch traffic circulating anticlockwise (decreasing polar angle in screen coords) inside Place de la Contrainte.
    const tracks = [];
    let bestCcw = 0;
    let sampleNear = [];
    const deadline = Date.now() + 26000;
    while (Date.now() < deadline) {
      const { traffic } = await d.state();
      const near = traffic.filter((c) => Math.hypot(c.x - rb.x, c.y - rb.y) < rb.outerRadius + 18);
      sampleNear = near;
      for (const c of near) {
        const theta = Math.atan2(c.y - rb.y, c.x - rb.x);
        const match = tracks.find((t) => !t.matched && Math.hypot(t.x - c.x, t.y - c.y) < 34);
        if (match) {
          const dTheta = wrapAngle(theta - match.theta);
          // Anticlockwise in screen coords (+Y down) means negative dTheta.
          if (dTheta < 0 && dTheta > -1.2) match.ccw += -dTheta;
          match.x = c.x;
          match.y = c.y;
          match.theta = theta;
          match.matched = true;
          bestCcw = Math.max(bestCcw, match.ccw);
        } else {
          tracks.push({ x: c.x, y: c.y, theta, ccw: 0, matched: true });
        }
      }
      for (const t of tracks) t.matched = false;
      if (bestCcw >= 0.2 && near.some((c) => Math.hypot(c.x - rb.x, c.y - rb.y) <= rb.outerRadius + 8)) break;
      await d.page.waitForTimeout(240);
    }
    d.note("roundabout traffic observation", { bestCcw: +bestCcw.toFixed(3), nearCount: sampleNear.length, sample: sampleNear.slice(0, 4) });
    d.expect(bestCcw >= 0.2, "traffic circulates anticlockwise around Place de la Contrainte roundabout", {
      bestCcw,
      sampleNear,
    });
  });

  await d.step("on-river-bridge", async () => {
    // Drive south down col 6 onto Pont de la Contrainte over River la Ferre.
    await driveRouteTo(d, { x: X(6) - 6, y: Y(7) }, { tol: 26, stop: true, timeout: 60000, maxSpeed: 68 });
    const { state, hud } = await d.waitFor(
      "on Pont de la Contrainte over River la Ferre",
      ({ state, hud }) =>
        state.ride &&
        state.ride.y >= town.river.top &&
        state.ride.y <= town.river.bottom &&
        hud.district.includes(d.t("districtFerre")),
      5000,
    );
    d.expect(
      state.ride.y >= town.river.top && state.ride.y <= town.river.bottom,
      "sedan is crossing Pont de la Contrainte over River la Ferre",
      { ride: state.ride, district: hud.district },
    );
  });

  await d.step("drive-across-river-bridge", async () => {
    // Finish crossing onto Quai Sud (row 8) and brake cleanly inside the intersection.
    await driveRouteTo(d, { x: X(6) - 6, y: Y(8) + 6 }, { tol: 20, stop: true, timeout: 60000, maxSpeed: 64 });
    const { state, hud } = await d.waitFor(
      "south bank district",
      ({ state, hud }) => state.ride && state.ride.y > Y(8) - 24 && hud.district.includes(d.t("districtRiveGauche")),
      5000,
    );
    d.expect(
      state.ride.y > Y(8) - 24 && state.ride.y < Y(8) + 32 && state.ride.condition >= 50,
      "sedan reached Quai Sud on the South Bank cleanly",
      state.ride,
    );
    d.expect(hud.district.includes(d.t("districtRiveGauche")), "HUD updated to Clerks' Quarter on South Bank", hud.district);
  });

  await d.step("wide-car-refused-by-alley", async () => {
    // Drive east along Quai Sud and turn south at the mouth of Ruelle des Écoles.
    const alleyX = X(9), quaiY = Y(8);
    await driveRouteTo(d, { x: alleyX - 39, y: quaiY + 6 }, { tol: 14, stop: true, timeout: 80000, maxSpeed: 65 });
    // Start the turn slightly farther west to leave room for the nose to swing.
    const approach = { x: alleyX - 16, y: quaiY - 8 };
    await driveRouteTo(d, approach, { tol: 4, waypoints: [approach], maxSpeed: 15 });
    let linedUp = await turnSlowly(d, Math.PI / 2, 11);
    if (Math.abs(linedUp.ride.x - alleyX) >= 9) {
      d.note("reverse to centre the sedan on the alley", linedUp.ride);
      linedUp = await adjustAlleyApproach(d, alleyX, quaiY, linedUp);
    }
    d.expect(Math.abs(linedUp.ride.x - alleyX) < 15 && Math.abs(wrapAngle(linedUp.p.a - Math.PI / 2)) < 0.35,
      "The sedan faces the alley entrance", linedUp.ride);
    // Attempt to push the wide Étude 2000 (halfWidth 4.8 > 3.6) straight south into the narrow alley.
    await d.hold(["up"], 750);
    await brakeToStop(d, 1500);
    const blockedState = await d.state();
    d.expect(
      blockedState.ride && Math.abs(blockedState.ride.x - X(9)) < 22 && blockedState.ride.y < Y(8) + 26,
      "wide sedan is physically refused by the narrow Ruelle des Écoles alley",
      blockedState.ride,
    );
  });

  await d.step("walk-narrow-alley", async () => {
    // Back straight out of the alley mouth onto Quai Sud's wide riverside shoulder, exit, and walk down the alley!
    await d.hold(["down"], 520);
    await d.hold(["down", "left"], 420);
    await brakeToStop(d, 1200);
    await d.press("car");
    await d.waitFor("on foot", ({ state }) => state.ride === null);
    // Walk straight into the exact same Ruelle des Écoles mouth that refused the sedan.
    await d.walkTo({ x: X(9), y: Y(8) + 12 }, { tol: 2.5 });
    // Centre the walker in the narrow mouth before the long southbound stretch.
    await d.walkTo({ x: X(9), y: Y(8) + 34 }, { tol: 2.5 });
    await d.walkTo({ x: X(9), y: Y(8) + 112 }, { tol: 5 });
    const { p, ride } = await d.state();
    d.expect(!ride && Math.abs(p.x - X(9)) < 8 && p.y > Y(8) + 95, "player walked through the narrow cobblestone alley on foot", p);
  });

  await d.step("ring-viaduct-and-station", async () => {
    // Continue on foot from the alley to the Gare du Sud landing.
    const station = town.ring.stations.find((st) => st.id === "gare-sud");
    const avenue = X(8) - 17;
    await d.walkTo({ x: X(9), y: Y(8) + 17 }, { tol: 5 });
    await d.walkTo({ x: avenue, y: Y(8) + 17 }, { tol: 5 });
    for (const row of [9, 10]) {
      await d.walkTo({ x: avenue, y: Y(row) - 18 }, { tol: 5 });
    }
    const streetY = Y(11) - 10;
    await d.walkTo({ x: avenue, y: streetY }, { tol: 3 });
    await d.walkTo({ x: station.street.x, y: streetY }, { tol: 3 });
    await d.walkTo(station.street, { tol: 6 });
    const { p, ride } = await d.state();
    d.expect(
      !ride && Math.hypot(p.x - station.street.x, p.y - station.street.y) <= 8,
      "player reached Gare du Sud station beneath the Petite Ceinture ring viaduct",
      { p, station },
    );
  });
}

// The landmark tour (city-scenery.mjs) drives with the same hands.
export { brakeToStop, driveRouteTo, turnSlowly };
