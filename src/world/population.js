import { cars, p, people, rand } from "../core/state.js";
import { town, canalRow, TAU, X, Y } from "./town.js";
function car(x, y, a, tint, model, route) {
  const v = { x, y, a, tint, model, route, condition: 100, speed: 0, slideX: 0, slideY: 0 };
  cars.push(v);
  return v;
}
export const sedan = car(p.x + 11, Y(1) - 16, 0, "cream", "Étude 2000");
export const target = car(X(4) + 97, Y(0) - 10, Math.PI, "gold", "Moutarde GT");
const colors = ["blue", "olive", "rose", "silver"];
export function person(x, y, kind = "local", axis = "x", random = rand) {
  const n = {
    x,
    y,
    homeX: x,
    homeY: y,
    a: 0,
    phase: random() * TAU,
    look: ["civilian", "worker", "lady"][Math.floor(random() * 3)],
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
  const horizontal = person(
    X(col) + (col === town.cols - 1 ? -1 : 1) * (40 + random() * 43),
    Y(row) - 20,
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
  if (col < town.cols - 1 && (col + row) % 2 && !(col === 2 && row === 1))
    car(X(col) + 112, Y(row) - 16, Math.PI, colors[(col + row) % 4], "Biscotte").homeCell = key;
  if (col >= town.cols - 1 || row >= town.rows - 1 || (col + row * 2) % 5 === 4) return;
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
  const q = Math.floor(random() * 4),
    a = points[q],
    to = (q + 1) % 4,
    b = points[to],
    f = 0.12 + random() * 0.65;
  car(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, Math.atan2(b.y - a.y, b.x - a.x), colors[q], "Citadine", {
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
