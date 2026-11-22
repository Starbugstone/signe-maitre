import { cars, game, p, people, rand } from "../core/state.js";
import { footBlocked, vehicleBlocked } from "./collision.js";
import { town, canalRow, CELL_W, TAU, X, Y } from "./town.js";
import { fleet, pickModel, routeClass } from "../game/fleet.js";
import { carContact } from "./vehicle-shape.js";
// `model` is a fleet id. A name the fleet does not know ("Biscotte") is a sedan's nameplate.
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
// Seized vehicles waiting for the auction stand along the étude's own kerb, one of each
// kind: [model, distance east of the cell's junction].
const pound = {
  "1,1": [["bus", -60], ["dumper", 60], ["volta", 125]],
  "2,1": [["moto", -90], ["suv", 110]],
};
// Chosen so that the six blocks around the étude show every model.
const trafficSalt = 4,
  parkedSalt = 7;
// Parked against the kerb bollards. Any closer to the kerb and the posts hold it fast;
// its offside rubs 0.6 units into the westbound lane, so traffic pulls round it.
export const sedan = car(p.x + 11, Y(1) - 15, 0, "cream", "Étude 2000");
sedan.home = { x: sedan.x, y: sedan.y, a: 0 };
export const target = car(X(4) + 97, Y(0) - 10, Math.PI, "gold", "Moutarde GT");
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
function populate(col, row, key) {
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
  const kerbside = pound[key] || [];
  if (!kerbside.length && col < town.cols - 1 && (col + row) % 2)
    kerbside.push([pickModel("street", draw(parkedSalt), true), 112]);
  for (const [model, east] of kerbside) {
    const kerbX = X(col) + east, y = Y(row) - 16;
    const { halfLength, halfWidth } = fleet[model];
    // Find the nearest gap in the posts along this kerb.
    const free = (x) => {
      const pose = { x, y, a: Math.PI, halfLength, halfWidth };
      return !vehicleBlocked(pose) && !cars.some((o) => carContact(pose, o));
    };
    for (let offset = 0; offset < CELL_W / 2; offset++) {
      const x = [kerbX + offset, kerbX - offset].find(free);
      if (x !== undefined) {
        car(x, y, Math.PI, colors[(col + row) % 4], model === "sedan" ? "Biscotte" : model).homeCell = key;
        break;
      }
    }
  }
  const horizontal = person(
    X(col) + (col === town.cols - 1 ? -1 : 1) * (40 + random() * 43),
    Y(row) - 24,
    col % 4 === 0 ? "tough" : "local",
    "x",
    random,
  );
  const vertical = person(
    X(col) + (row === canalRow ? 15 : 20),
    Y(row) + (row === town.rows - 1 ? -1 : 1) * (32 + random() * 39),
    "local",
    "y",
    random,
  );
  horizontal.homeCell = vertical.homeCell = key;
  if (col >= town.cols - 1 || row >= town.rows - 1 || (col + row * 2) % 5 === 4) return;
  const q = Math.floor(random() * 4),
    f = 0.12 + random() * 0.65;
  const model = pickModel(routeClass(null), draw(trafficSalt));
  const left = X(col) + 6,
    right = X(col + 1) - 6,
    top = Y(row) + 6,
    bottom = Y(row + 1) - 6;
  const points = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  const a = points[q],
    to = (q + 1) % 4,
    b = points[to];
  car(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, Math.atan2(b.y - a.y, b.x - a.x), colors[q], model === "sedan" ? "Citadine" : model, {
    points,
    to,
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
person(p.x - 24, p.y, "tough").rest = 2.2;
