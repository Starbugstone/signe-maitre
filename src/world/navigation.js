import { clamp, dist, game, p } from "../core/state.js";
import { town, CELL_H, CELL_W, X, Y } from "./town.js";
import { goal } from "../game/cases.js";
import { blocked } from "./collision.js";

function streetAnchor(point) {
  const i = town.cellAt(point.x, 0).col,
    j = town.cellAt(0, point.y).row;
  const horizontal = Math.abs(point.y - Y(j)) < Math.abs(point.x - X(i));
  const a = horizontal ? { x: point.x, y: Y(j) } : { x: X(i), y: point.y };
  const raw = horizontal ? (point.x - X(0)) / CELL_W : (point.y - Y(0)) / CELL_H;
  const ends = [
    ...new Set([
      clamp(Math.floor(raw), 0, (horizontal ? town.cols : town.rows) - 1),
      clamp(Math.ceil(raw), 0, (horizontal ? town.cols : town.rows) - 1),
    ]),
  ].map((k) => (horizontal ? { x: X(k), y: Y(j) } : { x: X(i), y: Y(k) }));
  return { a, ends, horizontal };
}
let routeCache;
function directions() {
  const end = goal();
  if (!end) return null;
  if (
    routeCache &&
    routeCache.vehicle === game.ride &&
    routeCache.end === end &&
    dist(routeCache.start, p) < 3 &&
    dist(routeCache.lastEnd, end) < 2
  )
    return routeCache;
  const start = { x: p.x, y: p.y },
    finish = { x: end.x, y: end.y },
    a = streetAnchor(start),
    b = streetAnchor(finish);
  let options = [];
  if (
    (a.horizontal && b.horizontal && a.a.y === b.a.y) ||
    (!a.horizontal && !b.horizontal && a.a.x === b.a.x)
  )
    options.push([start, a.a, b.a, finish]);
  for (const u of a.ends)
    for (const v of b.ends)
      for (const bend of [
        { x: u.x, y: v.y },
        { x: v.x, y: u.y },
      ])
        options.push([start, a.a, u, bend, v, b.a, finish]);
  const distanceToDoor = dist(start, finish);
  if (distanceToDoor < 37) options = [[start, finish]];
  else if (!game.ride && distanceToDoor < 115) {
    let clear = true;
    const samples = Math.ceil(distanceToDoor / 3);
    for (let i = 1; i < samples; i++) {
      const f = i / samples;
      if (blocked(start.x + (finish.x - start.x) * f, start.y + (finish.y - start.y) * f, 2.6)) {
        clear = false;
        break;
      }
    }
    if (clear) options = [[start, finish]];
  }
  let bestDistance = Infinity,
    path;
  for (const candidate of options) {
    const clean = [candidate[0]];
    for (const node of candidate.slice(1)) if (dist(node, clean[clean.length - 1]) > 0.1) clean.push(node);
    const length = clean.slice(1).reduce((sum, node, i) => sum + dist(node, clean[i]), 0);
    if (length < bestDistance) {
      bestDistance = length;
      path = clean;
    }
  }
  routeCache = { start, end, vehicle: game.ride, lastEnd: finish, path };
  return routeCache;
}

export { directions };
