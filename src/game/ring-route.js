// La Petite Ceinture: the ring line's geometry, timetable and ride states.
// Everything here is pure and derived from the clock, so the trains cost
// nothing to simulate and the same moment always shows the same trains.
const TAU = 2 * Math.PI;
const mod = (a, n) => ((a % n) + n) % n;

// Carriages match the baked atlases (art-src/baked/ringTrain.json): an 18 m coach
// at the game's 4.76 world units per metre, 2.75 m wide.
export const CAR_LENGTH = 308 / 3.6,
  CAR_GAP = 1.6,
  CAR_HALF_WIDTH = 6.5;
// The platform edge stands clear of the coach side; waiting passengers stand this far from the track.
export const PLATFORM_OFFSET = 11;
// Platforms are a three-coach train long, with a little to spare.
export const PLATFORM_HALF_LENGTH = (3 * CAR_LENGTH + 2 * CAR_GAP) / 2 + 6;
// Bogie centres sit 12.5 m apart.
const BOGIE = 29.8;

// Builds arc-length lookups for the published ring.
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
  // Curvature spread over the half segments either side of each vertex, for the corner speed limit.
  const bends = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[(i - 1 + points.length) % points.length],
      q = points[i],
      b = points[(i + 1) % points.length];
    const turn = Math.abs(Math.atan2((q.x - a.x) * (b.y - q.y) - (q.y - a.y) * (b.x - q.x), (q.x - a.x) * (b.x - q.x) + (q.y - a.y) * (b.y - q.y)));
    if (turn < 1e-4) continue;
    const segment = (j) => cum[j + 1] - cum[j],
      before = segment((i - 1 + points.length) % points.length),
      after = segment(i);
    bends.push({ from: cum[i] - before / 2, to: cum[i] + after / 2, curvature: turn / ((before + after) / 2) });
  }
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
  // Each platform lies on the side of the track its street stair climbs from:
  // +1 on the right of travel, -1 on the left.
  const stations = source.stations
    .map((st) => {
      const s = mod(Number.isFinite(st.s) ? st.s : project(st.stop), length),
        pose = poseAt(s, 4);
      const across = -Math.sin(pose.a) * (st.street.x - pose.x) + Math.cos(pose.a) * (st.street.y - pose.y);
      return { ...st, s, side: across < 0 ? -1 : 1 };
    })
    .sort((a, b) => a.s - b.s);
  if (!stations.length) throw new Error("The ring needs a station");
  if (!Number.isFinite(source.deckLift)) throw new Error("The ring needs a deck height");
  return { points, cum, length, bends, deckLift: source.deckLift, stations, pointAt, poseAt, project };
}

const ringCache = new WeakMap();
// The one adapter from a town to its ring line: the town's published `town.ring`.
export function ringOf(layout) {
  if (!layout.ring) throw new Error("This town publishes no ring railway");
  if (!ringCache.has(layout)) ringCache.set(layout, prepareRing(layout.ring));
  return ringCache.get(layout);
}

// The ring's speed limit at grid step h: full speed on the straights, slower through a
// curve, held from the moment the leading cab enters it until the rear cab leaves.
function speedLimits(ring, vmax, lateral, trainLength, h) {
  const n = Math.ceil(ring.length / h),
    point = new Float64Array(n).fill(vmax);
  for (const bend of ring.bends) {
    const cap = Math.min(vmax, Math.sqrt(lateral / bend.curvature));
    for (let k = Math.floor(bend.from / h); k <= Math.ceil(bend.to / h); k++) {
      const i = mod(k, n);
      point[i] = Math.min(point[i], cap);
    }
  }
  const reach = Math.ceil(trainLength / 2 / h) + 1,
    limit = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = vmax;
    for (let d = -reach; d <= reach; d++) v = Math.min(v, point[mod(i + d, n)]);
    limit[i] = v;
  }
  return (s) => limit[mod(Math.round(s / h), n)];
}

// The run between two platforms: accelerate, hold the line speed, brake for curves
// and for the next platform. Samples are spaced `step` apart with their arrival times.
function runProfile(start, distance, limitAt, accel) {
  const n = Math.max(1, Math.ceil(distance / 2)),
    step = distance / n,
    v = new Float64Array(n + 1);
  for (let j = 1; j < n; j++) v[j] = limitAt(start + j * step);
  for (let j = 1; j <= n; j++) v[j] = Math.min(v[j], Math.sqrt(v[j - 1] ** 2 + 2 * accel * step));
  v[n] = 0;
  for (let j = n - 1; j >= 0; j--) v[j] = Math.min(v[j], Math.sqrt(v[j + 1] ** 2 + 2 * accel * step));
  const t = new Float64Array(n + 1);
  for (let j = 0; j < n; j++) t[j + 1] = t[j] + (2 * step) / (v[j] + v[j + 1]);
  return { distance, step, v, t, time: t[n] };
}
// Distance and speed `time` seconds after leaving the platform; constant acceleration between samples.
function along(run, time) {
  const { t, v, step } = run;
  if (time <= 0) return { d: 0, v: 0 };
  if (time >= run.time) return { d: run.distance, v: 0 };
  let lo = 0,
    hi = t.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t[mid] <= time) lo = mid;
    else hi = mid - 1;
  }
  const tau = time - t[lo],
    a = (v[lo + 1] - v[lo]) / (t[lo + 1] - t[lo]);
  return { d: Math.min(run.distance, lo * step + v[lo] * tau + 0.5 * a * tau * tau), v: v[lo] + a * tau };
}

export function timetable(ring, options = {}) {
  const {
    vmax = 92,
    accel = 18,
    // Sideways acceleration allowed in a curve: about 50 units/s through a 160-unit bend.
    lateral = 16,
    dwell = 8,
    doorsOpen = 1,
    doorsClose = 1.6,
    count = 3,
    sets = Math.max(2, Math.round(ring.length / 3200)),
    // At time zero the first train is this many seconds from the first platform.
    arrivesIn = 12,
  } = options;
  const trainLength = count * CAR_LENGTH + (count - 1) * CAR_GAP;
  const limitAt = speedLimits(ring, vmax, lateral, trainLength, 2);
  const n = ring.stations.length;
  let start = 0;
  const legs = ring.stations.map((from, i) => {
    const to = ring.stations[(i + 1) % n];
    const distance = n === 1 ? ring.length : mod(to.s - from.s, ring.length) || ring.length;
    const run = runProfile(from.s, distance, limitAt, accel);
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
    limitAt,
    headway: period / sets,
    phase: period - Math.min(arrivesIn, lastRun),
    trainLength,
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
  const { d, v } = along(leg.run, local - tt.dwell);
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

// Where someone waiting on the platform stands: beside the track, on the stair side.
export function platformSpot(ring, station, offset = PLATFORM_OFFSET) {
  const pose = ring.poseAt(station.s, 4),
    d = offset * (station.side ?? 1);
  return { x: pose.x - Math.sin(pose.a) * d, y: pose.y + Math.cos(pose.a) * d, a: pose.a };
}

export { TAU };
