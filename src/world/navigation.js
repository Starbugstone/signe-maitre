import { dist, game, p } from "../core/state.js";
import { town } from "./town.js";
import { blocked } from "./collision.js";
import { sedanHalfWidth } from "./vehicle-shape.js";
import { findRoute } from "./routes.js";
import { goal } from "../game/cases.js";

export { findRoute };

let routeCache;
function directions(origin = p, end = goal()) {
  if (!end) return null;
  const onFoot = !game.ride;
  const vehicleHalfWidth = game.ride?.halfWidth ?? sedanHalfWidth;
  if (
    routeCache &&
    routeCache.vehicle === game.ride &&
    routeCache.end === end &&
    routeCache.vehicleHalfWidth === vehicleHalfWidth &&
    dist(routeCache.start, origin) < 3 &&
    dist(routeCache.lastEnd, end) < 2
  )
    return routeCache;
  const start = { x: origin.x, y: origin.y },
    finish = { x: end.x, y: end.y };
  const path = findRoute(town, start, finish, { onFoot, vehicleHalfWidth, isBlocked: blocked });
  routeCache = { start, end, vehicle: game.ride, vehicleHalfWidth, lastEnd: finish, path };
  return routeCache;
}

export { directions };
