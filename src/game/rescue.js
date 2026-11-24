import { ask, cue, say } from "../core/events.js";
import { viewport, outsideView } from "../world/viewport.js";
import { planApproach, walkableBetween } from "../world/ambulance-route.js";
import { person } from "../world/population.js";
import { carContact, closingSpeed } from "./driving.js";
import { recordImpact } from "./damage.js";
import { nextPatient, dispatchDelay } from "./triage.js";
import { cars, clamp, dist, game, p, people } from "../core/state.js";
import { combo } from "./slap.js";
import { town, H, W, X, Y } from "../world/town.js";
import { blocked, vehicleBlocked } from "../world/collision.js";
import { fleet } from "./fleet.js";

const incidents = [];
let ambulance = null;
const departing = new Set();
export function inService(v) {
  return v != null && (v === ambulance || departing.has(v));
}
function knockDown(n, cause) {
  n.down = Infinity;
  n.knockedOut = true;
  n.downSince = game.time;
  n.cause = cause;
  n.anger = 0;
  n.swing = 0;
  n.moving = false;
}
function nearbyPatient() {
  if (game.ride || game.viewMap || game.dialogOpen) return null;
  let patient = null,
    range = 21;
  for (const n of people) {
    if (!n.knockedOut || n.onStretcher) continue;
    const d = dist(n, p);
    if (d < range) {
      range = d;
      patient = n;
    }
  }
  return patient;
}
function clearPatient(n) {
  const index = people.indexOf(n);
  if (index >= 0) people.splice(index, 1);
  if (n === combo.lastSlapped) combo.lastSlapped = null;
  if (n === combo.slapVictim) combo.slapVictim = null;
}
function reportIncident() {
  const n = nearbyPatient();
  if (!n) return;
  const outrage = !!n.insultCase && n.cause === "slaps";
  const title = outrage ? "outrageTitle" : "incidentTitle";
  const copy = outrage ? "outrageCopy" : n.cause === "traffic" ? "collisionCopy" : "scuffleCopy";
  ask(title, copy, [
    [
      "serveCopy",
      () => {
        if (!people.includes(n) || n.onStretcher) return;
        incidents.push({ title, copy });
        clearPatient(n);
        if (ambulance?.patient === n) {
          if (ambulance.state === "arriving") releaseVan(ambulance);
          else nextPickup(ambulance);
        }
        say("copyServed", 4, "clerk", " · № " + incidents.length);
        cue("beep", 440, 0.12, "triangle");
      },
    ],
    ["awaitMedics"],
  ]);
}
function streetView() {
  return viewport(game.camX, game.camY, game.vw, game.vh, W, H);
}
function dispatchAmbulance(n) {
  const route = planApproach(n, streetView(), (candidate) => cars.some((c) => carContact(candidate, c)));
  if (!route) {
    n.downSince = game.time - dispatchDelay + 1;
    return;
  }
  const { stop, apron, dx, dy, a, spawn } = route;
  const v = {
    patient: n,
    stop,
    apron,
    origin: { x: n.x, y: n.y },
    loaded: 0,
    ...spawn,
    dx,
    dy,
    a,
    medical: true,
    model: "ambulance",
    halfLength: fleet.ambulance.halfLength,
    halfWidth: fleet.ambulance.halfWidth,
    condition: 100,
    speed: 0,
    slideX: 0,
    slideY: 0,
    state: "arriving",
    clock: 0,
    travel: Math.max(0.8, dist(n, apron) / 14),
    crew: 0,
  };
  cars.push(v);
  ambulance = v;
}
function trolleyRoute(v, n) {
  return walkableBetween(v.apron, n);
}
function nextPickup(v) {
  const n = nextPatient(people, v, (candidate) => trolleyRoute(v, candidate));
  v.patient = n;
  v.clock = 0;
  v.crew = 0;
  if (n) {
    v.travel = Math.max(0.8, dist(v.apron, n) / 14);
    v.state = "collecting";
  } else releaseVan(v);
}
function releaseVan(v) {
  v.patient = null;
  v.clock = 0;
  v.crew = 0;
  v.state = "leaving";
  v.mark = null;
  departing.add(v);
  if (ambulance === v) ambulance = null;
}
function park(v) {
  v.speed = v.slideX = v.slideY = 0;
  v.apron = { x: v.x - v.dx * 24, y: v.y - v.dy * 24 };
  if (v.patient && people.includes(v.patient) && trolleyRoute(v, v.patient)) {
    v.travel = Math.max(0.8, dist(v.apron, v.patient) / 14);
    v.state = "collecting";
    v.crew = 0;
    v.clock = 0;
  } else nextPickup(v);
}
function stopMotion(v) {
  v.speed = v.slideX = v.slideY = 0;
}
// True once a van has gained no ground for `stallLimit` seconds. Waiting for the CJ
// to cross is a courtesy, so it does not count.
const stallLimit = 3;
function stalled(v, dt) {
  if (v.yielding || !v.mark || dist(v, v.mark) > 4) {
    v.mark = { x: v.x, y: v.y };
    v.stall = 0;
    return false;
  }
  v.stall += dt;
  return v.stall >= stallLimit;
}
// A van boxed in short of the scene backs out the way it came. Dispatch is then free
// to plan another approach around whatever is in the road.
function standDown(v) {
  releaseVan(v);
  v.reversing = true;
}
// `distance` is signed along the van's heading. Negative values reverse.
function medicalDrive(v, distance, dt) {
  v.yielding = false;
  if (!dt || !distance) return true;
  const next = { ...v, x: v.x + distance * v.dx, y: v.y + distance * v.dy };
  // The driver yields to the CJ crossing on foot, just as ordinary traffic does.
  if (!game.ride && !game.transit && dist(next, p) < 10 && dist(next, p) < dist(v, p)) {
    stopMotion(v);
    v.yielding = true;
    return false;
  }
  const speed = distance / dt;
  v.speed = speed;
  v.slideX = speed * v.dx;
  v.slideY = speed * v.dy;
  if (vehicleBlocked(next, next.x, next.y, next.a, v.state === "leaving")) {
    recordImpact(v, Math.abs(speed), null);
    stopMotion(v);
    return false;
  }
  for (const other of cars) {
    if (v === other) continue;
    const hit = carContact(next, other);
    if (!hit) continue;
    recordImpact(v, closingSpeed(v, other, hit), other);
    stopMotion(v);
    return false;
  }
  v.x = next.x;
  v.y = next.y;
  return true;
}
function driverPosition(v) {
  if (v.patient && (v.state === "collecting" || v.state === "loading")) return medicalCrew(v);
  const side = v.stop.horizontal
    ? v.y < Y(town.cellAt(v.x, v.y).row)
      ? -1
      : 1
    : v.x < X(town.cellAt(v.x, v.y).col)
      ? -1
      : 1;
  const spots = v.stop.horizontal
    ? [
        [v.dx * 6, side * 8],
        [v.dx * 6, -side * 8],
      ]
    : [
        [side * 8, v.dy * 6],
        [-side * 8, v.dy * 6],
      ];
  for (const [ox, oy] of spots) if (!blocked(v.x + ox, v.y + oy, 2.6)) return { x: v.x + ox, y: v.y + oy };
  return { x: v.x, y: v.y };
}
export function crewInReach() {
  let nearest = null;
  for (const v of [ambulance, ...departing]) {
    if (!v) continue;
    const spot = driverPosition(v);
    if (dist(p, spot) < 18 && (!nearest || dist(p, spot) < dist(p, nearest)))
      nearest = { ...spot, crewOf: v };
  }
  return nearest;
}
export function interruptRescue(v) {
  if (!inService(v)) return null;
  const at = driverPosition(v);
  // Patients already delivered through the rear doors have completed their pickup.
  // The person still on the trolley stays at the curb for a replacement van.
  if (v.patient) {
    if (v.patient.onStretcher) {
      v.patient.x = at.x;
      v.patient.y = at.y;
      v.patient.onStretcher = false;
    }
    v.patient.downSince = game.time;
  }
  const driver = person(at.x, at.y, "medic");
  driver.look = "rescueMedic";
  driver.rest = 2;
  driver.a = v.a;
  if (v === ambulance) ambulance = null;
  departing.delete(v);
  v.state = "parked";
  v.patient = null;
  stopMotion(v);
  return driver;
}
function retire(v) {
  const i = cars.indexOf(v);
  if (i >= 0) cars.splice(i, 1);
  departing.delete(v);
}
function updateAmbulance(dt) {
  for (const v of departing) advanceDeparture(v, dt);
  if (!ambulance) {
    const waiting = people
      .filter((n) => n.knockedOut && !n.onStretcher && game.time - n.downSince >= dispatchDelay)
      .sort((a, b) => a.downSince - b.downSince)[0];
    if (waiting) dispatchAmbulance(waiting);
    return;
  }
  const v = ambulance;
  v.clock += dt;
  if (!v.condition) {
    interruptRescue(v);
    return;
  }
  if (v.state === "arriving") {
    const left = dist(v, v.stop),
      step = Math.min(left, dt * Math.min(v.speed + 82 * dt, 15 + Math.min(left, 80) * 0.72));
    if (medicalDrive(v, step, dt)) {
      if (left <= step) park(v);
    } else if (v.condition && dist(v, v.patient) < 80) park(v);
    if (v.state === "arriving" && stalled(v, dt)) standDown(v);
  } else if (v.state === "collecting") {
    const n = v.patient;
    if (v.clock < v.travel) v.crew = v.clock / v.travel;
    else if (v.clock < v.travel + 1.4) v.crew = 1;
    else {
      n.onStretcher = true;
      v.crew = Math.max(0, 1 - (v.clock - v.travel - 1.4) / v.travel);
      if (v.crew === 0) {
        v.state = "loading";
        v.clock = 0;
      }
    }
  } else if (v.state === "loading") {
    if (v.clock >= 1.05) {
      clearPatient(v.patient);
      v.loaded++;
      nextPickup(v);
    }
  }
}
function advanceDeparture(v, dt) {
  if (!v.condition) {
    interruptRescue(v);
    return;
  }
  v.clock += dt;
  if (v.clock > 2 && outsideView(v, streetView())) {
    retire(v);
    return;
  }
  const speed = Math.min(v.reversing ? 34 : 84, Math.abs(v.speed) + 45 * dt);
  medicalDrive(v, (v.reversing ? -1 : 1) * dt * speed, dt);
  // Hemmed in on one side: try the other way out.
  if (stalled(v, dt)) {
    v.reversing = !v.reversing;
    v.mark = null;
  }
}
function medicalCrew(v) {
  const n = v.patient,
    k = v.crew;
  const a = v.apron;
  if (v.state === "loading") {
    const progress = clamp(v.clock / 0.95, 0, 1);
    return { x: a.x + v.dx * 6 * progress, y: a.y + v.dy * 6 * progress };
  }
  return { x: a.x + (n.x - a.x) * k, y: a.y + (n.y - a.y) * k };
}

export { ambulance, incidents, knockDown, medicalCrew, nearbyPatient, reportIncident, updateAmbulance };
