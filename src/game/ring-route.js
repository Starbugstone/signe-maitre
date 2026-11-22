// La Petite Ceinture: the ring line's geometry, timetable and ride states.
// Everything here is pure and derived from the clock, so the trains cost
// nothing to simulate and the same moment always shows the same trains.
import { CELL_H, CELL_W, X, Y } from "../world/layout.js";

const TAU = 2 * Math.PI;
const mod = (a, n) => ((a % n) + n) % n;

// The rail head of the painted market viaduct stands this far above its pier foot.
export const RING_DECK_LIFT = 47.7;
// Carriages keep the length of the painted metro car.
export const CAR_LENGTH = 51,
  CAR_GAP = 1.4,
  CAR_HALF_WIDTH = 3.8;
const BOGIE = 0.34 * CAR_LENGTH;

// The ring the town publishes replaces the old straight lines and their trains.
// This is the one switch rail.js reads.
export function ringReplacesLineTrains(layout) {
  return Boolean(layout.ring);
}

// Until the town publishes `town.ring`, run a temporary loop just inside the outer
// streets, on the block backs between the outer street and the next one. The side
// legs keep clear of the painting seams, where the market viaduct joins are checked.
export function fallbackRing(layout) {
  const left = X(0) + CELL_W / 2 + 20,
    right = X(layout.cols - 1) - CELL_W / 2 - 20,
    top = Y(0) + CELL_H / 2 - 8,
    bottom = Y(layout.rows - 1) - CELL_H / 2 + 8,
    radius = 70;
  const points = [];
  const corner = (cx, cy, from) => {
    for (let i = 0; i <= 12; i++) {
      const a = from + (i / 12) * (Math.PI / 2);
      points.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
  };
  // Clockwise on screen: east along the north leg, south, west, then north.
  corner(left + radius, top + radius, Math.PI);
  corner(right - radius, top + radius, -Math.PI / 2);
  corner(right - radius, bottom - radius, 0);
  corner(left + radius, bottom - radius, Math.PI / 2);
  const midRow = Math.min(layout.rows - 2, layout.canalRow + 1),
    eastRow = 1,
    northCol = Math.min(2, layout.cols - 2),
    southCol = Math.max(1, layout.cols - 2);
  const stations = [
    { id: "centre", name: { fr: "Centre-Ville", en: "Centre-Ville" }, stop: { x: X(northCol), y: top }, street: { x: X(northCol) + 14, y: top + 12 } },
    { id: "prets", name: { fr: "Quai des Prêts", en: "Quai des Prêts" }, stop: { x: right, y: Y(eastRow) }, street: { x: right - 14, y: Y(eastRow) + 12 } },
    { id: "foire", name: { fr: "La Foire", en: "La Foire" }, stop: { x: X(southCol), y: bottom }, street: { x: X(southCol) - 14, y: bottom - 12 } },
    { id: "docks", name: { fr: "Les Docks", en: "Les Docks" }, stop: { x: left, y: Y(midRow) }, street: { x: left + 14, y: Y(midRow) + 12 } },
  ];
  return { points, deckLift: RING_DECK_LIFT, stations, fallback: true };
}

// Builds arc-length lookups for a published or fallback ring.
export function prepareRing(source) {
  const points = source.points.slice();
  const first = points[0],
    last = points.at(-1);
  if (points.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) points.pop();
  if (points.length < 3) throw new Error("The ring needs a closed loop");
  const cum = [0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const length = cum.at(-1);
  function pointAt(s) {
    s = mod(s, length);
    let lo = 0,
      hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const a = points[lo],
      b = points[(lo + 1) % points.length],
      f = (s - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  // Arc length of the closest point on the loop.
  function project(q) {
    let best = Infinity,
      at = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        dx = b.x - a.x,
        dy = b.y - a.y,
        l2 = dx * dx + dy * dy || 1,
        f = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)),
        d = Math.hypot(a.x + dx * f - q.x, a.y + dy * f - q.y);
      if (d < best) {
        best = d;
        at = cum[i] + f * (cum[i + 1] - cum[i]);
      }
    }
    return at;
  }
  // Heading and centre from the two bogies, so a carriage swings smoothly through a corner.
  function poseAt(s, half = BOGIE) {
    const f = pointAt(s + half),
      r = pointAt(s - half);
    return { x: (f.x + r.x) / 2, y: (f.y + r.y) / 2, a: Math.atan2(f.y - r.y, f.x - r.x) };
  }
  const stations = source.stations
    .map((st) => ({ ...st, s: mod(Number.isFinite(st.s) ? st.s : project(st.stop), length) }))
    .sort((a, b) => a.s - b.s);
  if (!stations.length) throw new Error("The ring needs a station");
  const deckLift = source.deckLift ?? RING_DECK_LIFT;
  return { points, cum, length, deckLift, stations, fallback: !!source.fallback, pointAt, poseAt, project };
}

const ringCache = new WeakMap();
// The one adapter from a town to its ring line.
export function ringOf(layout) {
  if (!ringCache.has(layout)) ringCache.set(layout, prepareRing(layout.ring ?? fallbackRing(layout)));
  return ringCache.get(layout);
}

// A trapezoidal run between two platforms: accelerate, cruise, brake.
function runProfile(distance, vmax, accel) {
  const rampDistance = (vmax * vmax) / accel;
  if (distance <= rampDistance) {
    const peak = Math.sqrt(distance * accel);
    return { distance, peak, ramp: peak / accel, cruise: 0, time: (2 * peak) / accel };
  }
  const cruise = (distance - rampDistance) / vmax;
  return { distance, peak: vmax, ramp: vmax / accel, cruise, time: (2 * vmax) / accel + cruise };
}
function along(run, t, accel) {
  const { peak, ramp, cruise, distance } = run;
  if (t <= 0) return { d: 0, v: 0 };
  if (t < ramp) return { d: 0.5 * accel * t * t, v: accel * t };
  const rampD = 0.5 * accel * ramp * ramp;
  if (t < ramp + cruise) return { d: rampD + peak * (t - ramp), v: peak };
  const braking = Math.min(ramp, t - ramp - cruise);
  return {
    d: Math.min(distance, rampD + peak * cruise + peak * braking - 0.5 * accel * braking * braking),
    v: Math.max(0, peak - accel * braking),
  };
}

export function timetable(ring, options = {}) {
  const {
    vmax = 92,
    accel = 18,
    dwell = 8,
    doorsOpen = 1,
    doorsClose = 1.6,
    count = 4,
    sets = ring.length < 3000 ? 2 : 3,
    // At time zero the first train is this many seconds from the first platform.
    arrivesIn = 12,
  } = options;
  const n = ring.stations.length;
  let start = 0;
  const legs = ring.stations.map((from, i) => {
    const to = ring.stations[(i + 1) % n];
    const distance = n === 1 ? ring.length : mod(to.s - from.s, ring.length) || ring.length;
    const run = runProfile(distance, vmax, accel);
    const leg = { from: i, to: (i + 1) % n, start, run };
    start += dwell + run.time;
    return leg;
  });
  const period = start;
  const lastRun = legs.at(-1).run.time;
  return {
    ring,
    legs,
    period,
    sets,
    count,
    dwell,
    doorsOpen,
    doorsClose,
    accel,
    vmax,
    headway: period / sets,
    phase: period - Math.min(arrivesIn, lastRun),
    trainLength: count * CAR_LENGTH + (count - 1) * CAR_GAP,
  };
}

// Where trainset k is at a given time. `s` is the arc length of the train's centre.
export function trainsetAt(tt, k, time) {
  const tau = mod(time + tt.phase - k * tt.headway, tt.period);
  let lo = 0,
    hi = tt.legs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tt.legs[mid].start <= tau) lo = mid;
    else hi = mid - 1;
  }
  const leg = tt.legs[lo],
    local = tau - leg.start,
    from = tt.ring.stations[leg.from];
  if (local < tt.dwell)
    return {
      k,
      s: from.s,
      v: 0,
      station: leg.from,
      next: leg.to,
      dwellLeft: tt.dwell - local,
      doors: local >= tt.doorsOpen && local < tt.dwell - tt.doorsClose,
    };
  const { d, v } = along(leg.run, local - tt.dwell, tt.accel);
  return { k, s: mod(from.s + d, tt.ring.length), v, station: -1, next: leg.to, dwellLeft: 0, doors: false };
}

// Cab cars at both ends; carriage 0 leads.
export function carriagesOf(tt, state) {
  const pitch = CAR_LENGTH + CAR_GAP;
  return Array.from({ length: tt.count }, (_, i) => {
    const s = state.s + ((tt.count - 1) / 2 - i) * pitch;
    return { i, k: state.k, s, ...tt.ring.poseAt(s), cab: i === 0 ? "front" : i === tt.count - 1 ? "rear" : null };
  });
}

// The rider's carriage: the one behind the leading cab.
export const RIDER_CAR = 1;

// A walker on the platform boards the first train whose doors open there.
// A rider stays aboard until the train opens its doors at the requested stop.
export function rideStep(tt, ride, time) {
  if (!ride) return { ride };
  if (ride.phase === "platform") {
    for (let k = 0; k < tt.sets; k++) {
      const st = trainsetAt(tt, k, time);
      if (st.station === ride.station && st.doors)
        return {
          ride: { phase: "riding", set: k, car: RIDER_CAR, boardedAt: ride.station, alightAt: null },
          event: "boarded",
        };
    }
    return { ride };
  }
  const st = trainsetAt(tt, ride.set, time);
  if (ride.alightAt !== null && st.station === ride.alightAt && st.doors)
    return { ride: null, event: "alighted", station: ride.alightAt, boardedAt: ride.boardedAt };
  return { ride };
}

// The car key: leave the platform, step off now if the doors are open, or ask for the next stop.
export function rideRequest(tt, ride, time) {
  if (!ride) return { ride };
  if (ride.phase === "platform") return { ride: null, event: "leftPlatform", station: ride.station };
  const st = trainsetAt(tt, ride.set, time);
  if (st.station >= 0 && st.doors)
    return { ride: null, event: "alighted", station: st.station, boardedAt: ride.boardedAt };
  const stop = st.station >= 0 && st.dwellLeft > tt.doorsClose ? st.station : st.next;
  return { ride: { ...ride, alightAt: stop }, event: "alightRequested", station: stop };
}

// The stop the rider's train calls at next. While the doors are open here, that is the following one.
export function nextStop(tt, ride, time) {
  if (!ride || ride.phase !== "riding") return -1;
  const st = trainsetAt(tt, ride.set, time);
  return st.station >= 0 && !st.doors && st.dwellLeft > tt.doorsClose ? st.station : st.next;
}

// The station whose platform the rider's open doors face, or -1.
export function doorsOpenAt(tt, ride, time) {
  if (!ride || ride.phase !== "riding") return -1;
  const st = trainsetAt(tt, ride.set, time);
  return st.doors ? st.station : -1;
}

// Where someone waiting on the platform stands: beside the track, on the right of travel.
export function platformSpot(ring, station, side = 8.5) {
  const pose = ring.poseAt(station.s, 4);
  return { x: pose.x - Math.sin(pose.a) * side, y: pose.y + Math.cos(pose.a) * side, a: pose.a };
}

export { TAU };
