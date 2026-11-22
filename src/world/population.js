import { cars, game, p, people, rand } from "../core/state.js";
import { footBlocked, vehicleBlocked } from "./collision.js";
import { town, office, CELL_W, TAU, X, Y } from "./town.js";
import { buildTrafficLoop, evalSegment } from "./routes.js";
import { fleet, pickModel, routeClass } from "../game/fleet.js";
import { compileFleetLoop } from "../game/fleet-traffic.js";
import { carContact } from "./vehicle-shape.js";

// A name the fleet does not know ("Biscotte") is a sedan's nameplate.
function car(x, y, a, tint, model, route) {
  const spec = fleet[model] || fleet.sedan;
  const v = {
    x,
    y,
    a,
    tint,
    model: spec.id,
    label: fleet[model] ? spec.label : model,
    halfLength: spec.halfLength,
    halfWidth: spec.halfWidth,
    route,
    condition: 100,
    speed: 0,
    slideX: 0,
    slideY: 0,
  };
  cars.push(v);
  return v;
}

// Find a clear kerb parking spot for the company sedan right beside the étude.
function findSedanSpot() {
  const y = Y(office.row) - 14;
  const preferred = p.x + 10;
  for (let offset = 0; offset < 70; offset++) {
    for (const x of offset ? [preferred + offset, preferred - offset] : [preferred]) {
      if (!vehicleBlocked({ x, y, a: 0 })) return { x, y, a: 0 };
    }
  }
  return { x: preferred, y, a: 0 };
}

const sedanSpot = findSedanSpot();
export const sedan = car(sedanSpot.x, sedanSpot.y, sedanSpot.a, "cream", "Étude 2000");
sedan.home = { ...sedanSpot };

// Overdue Moutarde GT parked on North Grand Boulevard (row 2, col 5).
export const target = car(X(5) + 95, Y(2) - 10, Math.PI, "gold", "Moutarde GT");

const colors = ["blue", "olive", "rose", "silver"];
const civilianLooks = [{ look: "civilian" }, { look: "worker" }, { look: "lady" }];
const fighterLooks = [
  { look: "flatCap", konamiLook: "mariniere" },
  { look: "bomber" },
  { look: "rigger" },
  { look: "chelsea" },
  { look: "flatCap" },
];
let nextReinforcement = 0;

export function isFighter(kind) {
  return kind === "tough" || kind === "inspector";
}

export function fighterLook(n) {
  return game.konamiHero && n.konamiLook ? n.konamiLook : n.look;
}

function chooseLook(kind, random) {
  if (kind === "inspector") {
    const look = fighterLooks[nextReinforcement];
    nextReinforcement = (nextReinforcement + 1) % fighterLooks.length;
    return look;
  }
  const looks = isFighter(kind) ? fighterLooks : civilianLooks;
  return looks[Math.floor(random() * looks.length)];
}

export function person(x, y, kind = "local", axis = "x", random = rand) {
  // Place residents and interrupted medics on clear ground even when their
  // requested spot is occupied by street furniture or a parked vehicle.
  if (footBlocked(x, y, 3)) {
    let clear;
    for (let r = 2; r <= 32 && !clear; r += 2)
      clear = [
        [0, r],
        [r, 0],
        [-r, 0],
        [0, -r],
      ].find(([dx, dy]) => !footBlocked(x + dx, y + dy, 3));
    if (clear) {
      x += clear[0];
      y += clear[1];
    }
  }
  const n = {
    x,
    y,
    homeX: x,
    homeY: y,
    a: 0,
    phase: random() * TAU,
    ...chooseLook(kind, random),
    kind,
    axis,
    sign: random() < 0.5 ? -1 : 1,
    pace: 13 + random() * 6,
    patrol: 25 + random() * 23,
    rest: random() * 0.55,
    down: 0,
    anger: 0,
    cool: 0,
  };
  people.push(n);
  return n;
}

const loopCache = new Map();
function cachedLoop(col, row, narrow) {
  const key = [col, row, narrow].join(",");
  if (!loopCache.has(key))
    loopCache.set(key, buildTrafficLoop(town, col, row, { maxHalfWidth: narrow ? fleet.moto.halfWidth : fleet.sedan.halfWidth }));
  return loopCache.get(key);
}

function freeParking(x, y, model) {
  const { halfLength, halfWidth } = fleet[model];
  const pose = { x, y, a: Math.PI, halfLength, halfWidth };
  return !vehicleBlocked(pose) && !cars.some((other) => carContact(pose, other));
}

// Five seized vehicles on the same avenue as the étude, clear of the office door and junctions.
const showpieces = [
  ["moto", 125], ["suv", 162], ["volta", 203], ["bus", -162], ["dumper", -95],
];
for (const [model, offset] of showpieces) {
  const y = Y(office.row) - 16;
  const preferred = X(office.col) + offset;
  for (let delta = 0; delta < 32; delta++) {
    const x = [preferred + delta, preferred - delta].find((x) => freeParking(x, y, model));
    if (x === undefined) continue;
    const v = car(x, y, Math.PI, model === "volta" ? "silver" : "blue", model);
    v.showpiece = true;
    break;
  }
}

function populate(col, row, key) {
  const meta = town.cellMeta(col, row);
  // Open river water cells have no street pedestrians or cars (Sol populates river boats).
  if (meta.isRiverRow && !meta.isIsland) return;

  let seed = (Math.imul(col + 11, 73856093) ^ Math.imul(row + 7, 19349663)) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Vehicle models draw from the cell's own well-mixed number, so the residents keep their
  // places and neighbouring blocks do not all get the same model.
  const cellSeed = seed;
  const draw = (salt) => () => {
    let h = (cellSeed ^ salt) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // Parked cars along wide east-west streets (never in alleys, river, roundabouts or at the office kerb).
  const east = town.roadAdj.get(meta.node?.id)?.find(({ to }) => to === town.roadNodeAt(col + 1, row)?.id);
  if (
    col < town.cols - 1 &&
    east && east.edge.class !== "alley" &&
    meta.node?.kind !== "roundabout" &&
    (col + row) % 2 &&
    !(col === office.col && row === office.row) &&
    !(col === 5 && row === 2)
  ) {
    const model = pickModel(east.edge.class, draw(7), true);
    const kerbX = X(col) + 112,
      y = Y(row) - 16;
    for (let offset = 0; offset < CELL_W / 2 - 48; offset++) {
      const x = [kerbX + offset, kerbX - offset].find(
        (cand) =>
          Math.abs(cand - X(col)) > 58 &&
          !(town.ring?.stations || []).some((st) => Math.hypot(cand - st.street.x, y - st.street.y) < 28) &&
          freeParking(cand, y, model),
      );
      if (x !== undefined) {
        car(x, y, Math.PI, colors[(col + row) % 4], model === "sedan" ? "Biscotte" : model).homeCell = key;
        break;
      }
    }
  }

  // Residents walking streets, quays, island parvis, and alleys.
  if (meta.hasWideRoad) {
    const hx = X(col) + (col === town.cols - 1 ? -1 : 1) * (40 + random() * 43);
    const hy = Y(row) - 24;
    if (!footBlocked(hx, hy, 3)) {
      person(hx, hy, col % 4 === 0 ? "tough" : "local", "x", random).homeCell = key;
    }
    const vx = X(col) + (row === town.canalRow ? 15 : 20);
    const vy = Y(row) + (row === town.rows - 1 ? -1 : 1) * (32 + random() * 39);
    if (!footBlocked(vx, vy, 3)) {
      person(vx, vy, "local", "y", random).homeCell = key;
    }
  } else if (meta.node) {
    // Pure alley hub (e.g. heart of Marais): pedestrians stroll the cobblestone ruelles.
    const ax = meta.node.x,
      ay = meta.node.y;
    if (!footBlocked(ax, ay, 3)) {
      person(ax, ay, "local", random() < 0.5 ? "x" : "y", random).homeCell = key;
    }
  }

  // Moving city traffic on compiled road-graph loops (never entering alleys, using roundabouts anticlockwise).
  if (col >= town.cols - 1 || row >= town.rows - 1 || (col + row * 2) % 5 === 4) return;
  const narrow = cachedLoop(col, row, true);
  const loop = narrow?.class === "alley" ? narrow : cachedLoop(col, row, false);
  if (!loop) return;

  const model = pickModel(routeClass(loop), draw(1));
  const spec = fleet[model];
  const segments = compileFleetLoop(town, loop, model);
  if (!segments) return;
  const clearance = Math.max(18, spec.halfLength + 4);
  const straights = segments
    .map((seg, idx) => ({ seg, idx }))
    .filter(({ seg }) => seg.type === "line" && seg.length > 2 * clearance);
  if (!straights.length) return;
  const pick = straights[Math.floor(random() * straights.length)];
  const s = clearance + random() * (pick.seg.length - 2 * clearance);
  const pose = evalSegment(pick.seg, s);
  const body = { ...pose, halfLength: spec.halfLength, halfWidth: spec.halfWidth };
  if (vehicleBlocked(body) || cars.some((other) => carContact(body, other))) return;
  const q = Math.floor(random() * 4);
  car(pose.x, pose.y, pose.a, colors[q], model === "sedan" ? "Citadine" : model, {
    class: loop.class,
    segments,
    segIndex: pick.idx,
    s,
    pace: 24 + q * 6,
  }).homeCell = key;
}

// Only the neighbourhood around the CJ is simulated. Archived residents retain
// their exact identities, damage and patrol progress. Removed patients stay removed.
const sleeping = new Map();
let loaded = new Set(),
  lastBlock = "",
  lastWidth = 0,
  lastHeight = 0;

export function streamPopulation(x, y, w = 300, h = 220) {
  const { col, row } = town.cellAt(x, y),
    key = col + "," + row;
  if (lastBlock === key && lastWidth === w && lastHeight === h) return;
  lastBlock = key;
  lastWidth = w;
  lastHeight = h;
  const area = town.visibleCells(X(col) - w / 2, Y(row) - h / 2, w, h, 310);
  const next = new Set();
  for (let j = area.firstRow; j <= area.lastRow; j++)
    for (let i = area.firstCol; i <= area.lastCol; i++) {
      const id = i + "," + j;
      next.add(id);
      if (loaded.has(id)) continue;
      const store = sleeping.get(id);
      if (store) {
        cars.push(...store.cars);
        people.push(...store.people);
        sleeping.delete(id);
      } else populate(i, j, id);
    }
  for (const id of loaded) if (!next.has(id)) sleeping.set(id, { cars: [], people: [] });
  for (const [kind, list] of [
    ["cars", cars],
    ["people", people],
  ]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const entity = list[i],
        store = sleeping.get(entity.homeCell);
      if (!store) continue;
      if (entity.knockedOut || entity.anger || entity.hits) {
        delete entity.homeCell;
        continue;
      }
      store[kind].push(entity);
      list.splice(i, 1);
    }
  }
  loaded = next;
}

// Keep the familiar local disputant beside the étude for incident & ambulance testing.
person(p.x - 24, p.y, "tough").rest = 2.2;
