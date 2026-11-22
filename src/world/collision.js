import { town, CELL_H, CELL_W, X, Y } from "./town.js";

import { streetProps } from "./street-props.js";
import { cars } from "../core/state.js";
import { viaductSection, pierDepth } from "./viaduct.js";
import { carContact, sedanHalfLength, sedanHalfWidth } from "./vehicle-shape.js";

const streetHalfWidth = 25,
  northPavement = 28,
  // The painted south pavement runs from the kerb (16.8) to the bollard line at about 23.
  southPavement = 23;
const pierThickness = 3.5;

export function blockedIn(layout, x, y, r) {
  const W = layout.width,
    H = layout.height,
    canalTop = Y(layout.canalRow) + 16,
    canalBottom = Y(layout.canalRow + 1) - 15;
  if (x < r || y < r || x > W - r || y > H - r) return true;
  const { col, row } = layout.cellAt(x, y);
  const dx = Math.abs(x - X(col)),
    dy = y - Y(row);
  for (const post of streetProps(layout, col, row)) {
    const radius = post.item.radius;
    if (Math.abs(x - post.x) < r + radius && Math.hypot(x - post.x, y - post.y + radius / 2) < r + radius)
      return true;
  }
  if (y > canalTop && y < canalBottom) {
    const f = (y - canalTop) / (canalBottom - canalTop);
    if (dx < 22 - r) return false;
    return f > 0.13 - r / 200 && f < 0.86 + r / 200;
  }
  const fromFoot = dy - pierDepth;
  if (layout.lines.has(row) && fromFoot < r && fromFoot > -pierThickness - r) {
    // Include the other half of a column where two painted cells meet.
    const { col: first } = layout.cellAt(x - r, y),
      { col: last } = layout.cellAt(x + r, y);
    for (let i = first; i <= last; i++)
      for (const [left, right] of viaductSection(layout, row, i).bases)
        if (x + r > X(i) + left && x - r < X(i) + right) return true;
  }
  // Service lanes run between the backs of the painted blocks.
  const seamX = Math.abs(dx - CELL_W / 2),
    seamY = Math.abs(Math.abs(dy) - CELL_H / 2);
  if (r < 4 && (seamX < 2.9 || seamY < 2.9)) return false;
  // Walkable north pavement and cross streets follow the kerbs in the registered paintings.
  return dx > streetHalfWidth - r && !(dy >= -northPavement + r && dy <= southPavement - r);
}
// Vehicles use the full rotated body against solid ground, including the inside
// corners at junctions. The viaduct deck never occupies space at street level.
const obstacles = new Map();
function cellObstacles(col, row) {
  const id = row * town.cols + col;
  if (obstacles.has(id)) return obstacles.get(id);
  const solids = [],
    cx = X(col),
    cy = Y(row);
  function add(left, top, right, bottom) {
    solids.push({
      x: cx + (left + right) / 2,
      y: cy + (top + bottom) / 2,
      a: 0,
      halfLength: (right - left) / 2,
      halfWidth: (bottom - top) / 2,
    });
  }
  for (const side of [-1, 1]) {
    const outer = (side * CELL_W) / 2,
      inner = side * streetHalfWidth;
    const left = Math.min(inner, outer),
      right = Math.max(inner, outer);
    if (row !== town.canalRow + 1) add(left, -CELL_H / 2, right, -northPavement);
    if (row !== town.canalRow) add(left, southPavement, right, CELL_H / 2);
    if (row === town.canalRow || row === town.canalRow + 1) {
      const top = Y(town.canalRow) + 16 - cy,
        height = CELL_H - 31;
      add(
        Math.min(outer, side * 22),
        Math.max(-CELL_H / 2, top + height * 0.13),
        Math.max(outer, side * 22),
        Math.min(CELL_H / 2, top + height * 0.86),
      );
    }
  }
  if (town.lines.has(row))
    for (const [left, right] of viaductSection(town, row, col).bases)
      add(left, pierDepth - pierThickness, right, pierDepth);
  for (const post of streetProps(town, col, row)) {
    const r = post.item.radius;
    solids.push({ x: post.x, y: post.y - r / 2, a: 0, halfLength: r, halfWidth: r / 2 });
  }
  obstacles.set(id, solids);
  return solids;
}

export function vehicleBlocked(vehicle, x = vehicle.x, y = vehicle.y, a = vehicle.a, leaving = false) {
  const halfLength = vehicle.halfLength ?? sedanHalfLength,
    halfWidth = vehicle.halfWidth ?? sedanHalfWidth;
  const cos = Math.abs(Math.cos(a)),
    sin = Math.abs(Math.sin(a));
  const rx = cos * halfLength + sin * halfWidth,
    ry = sin * halfLength + cos * halfWidth;
  if (!leaving && (x < rx || y < ry || x > town.width - rx || y > town.height - ry)) return true;
  const first = town.cellAt(x - rx, y - ry),
    last = town.cellAt(x + rx, y + ry);
  const pose = { x, y, a, halfLength, halfWidth };
  for (let row = first.row; row <= last.row; row++)
    for (let col = first.col; col <= last.col; col++)
      for (const solid of cellObstacles(col, row))
        if (
          Math.abs(solid.x - x) < rx + solid.halfLength &&
          Math.abs(solid.y - y) < ry + solid.halfWidth &&
          carContact(pose, solid)
        )
          return true;
  return false;
}
const blocked = (x, y, r) => blockedIn(town, x, y, r);
// Distance to a vehicle's body measured in its local forward/sideways axes.
export function distanceToBody(v, x, y) {
  const dx = x - v.x,
    dy = y - v.y,
    c = Math.cos(v.a),
    s = Math.sin(v.a);
  const forward = Math.abs(dx * c + dy * s) - (v.halfLength ?? sedanHalfLength),
    side = Math.abs(dy * c - dx * s) - (v.halfWidth ?? sedanHalfWidth);
  return Math.hypot(Math.max(0, forward), Math.max(0, side)) + Math.min(0, Math.max(forward, side));
}
// How much longer than the sedan a body is: the quick distance rejections were sized for it.
export const bodyExtra = (v) => Math.max(0, (v.halfLength ?? sedanHalfLength) - sedanHalfLength);
// How far a foot circle of radius r sinks into each nearby vehicle body.
function carOverlaps(x, y, r) {
  const overlaps = new Map();
  for (const v of cars) {
    const near = 22 + bodyExtra(v);
    if (Math.abs(v.x - x) > near || Math.abs(v.y - y) > near) continue;
    const depth = r - distanceToBody(v, x, y);
    if (depth > 0) overlaps.set(v, depth);
  }
  return overlaps;
}
// A step into a vehicle is refused. A walker already wedged between cars may take any
// step that does not push them deeper overall, as long as no single body is entered
// more than halfway: sideways along a door or out of the gap.
export function footBlocked(x, y, r, from) {
  if (blocked(x, y, r)) return true;
  const overlaps = carOverlaps(x, y, r);
  if (!overlaps.size) return false;
  if (!from) return true;
  const before = carOverlaps(from.x, from.y, r);
  let total = 0,
    previous = 0;
  for (const depth of before.values()) previous += depth;
  for (const [v, depth] of overlaps) {
    total += depth;
    if (depth > Math.max(before.get(v) || 0, r * 0.5) + 1e-6) return true;
  }
  return total > previous + 1e-6;
}
// Round posts and car corners deflect a walker instead of stopping them dead.
const glance = [0.55, -0.55, 1, -1];
function move(o, dx, dy, r) {
  let bump = false;
  if (!footBlocked(o.x + dx, o.y, r, o)) o.x += dx;
  else bump = true;
  if (!footBlocked(o.x, o.y + dy, r, o)) o.y += dy;
  else bump = true;
  if (bump && (dx === 0) !== (dy === 0)) {
    const step = Math.hypot(dx, dy);
    for (const side of glance) {
      const scale = 1 / Math.hypot(0.7, side),
        sx = (dx ? dx * 0.7 : side * step) * scale,
        sy = (dy ? dy * 0.7 : side * step) * scale;
      if (!footBlocked(o.x + sx, o.y + sy, r, o)) {
        o.x += sx;
        o.y += sy;
        break;
      }
    }
  }
  return bump;
}
// Last resort when something has closed in around a walker: the nearest clear spot that
// can be reached in a straight line without crossing a wall, a pier or the canal.
export function lineClear(x, y, tx, ty) {
  const steps = Math.ceil(Math.hypot(tx - x, ty - y));
  for (let i = 1; i <= steps; i++) if (blocked(x + ((tx - x) * i) / steps, y + ((ty - y) * i) / steps, 1)) return false;
  return true;
}
// A blow needs a clear line: no wall, post or vehicle body between the two people.
export function strikeClear(x, y, tx, ty) {
  if (!lineClear(x, y, tx, ty)) return false;
  const steps = Math.ceil(Math.hypot(tx - x, ty - y));
  for (const v of cars)
    for (let i = 1; i < steps; i++) {
      const sx = x + ((tx - x) * i) / steps,
        sy = y + ((ty - y) * i) / steps;
      const near = 14 + bodyExtra(v);
      if (Math.abs(v.x - sx) < near && Math.abs(v.y - sy) < near && distanceToBody(v, sx, sy) < 0) return false;
    }
  return true;
}
// Shut in: the clear ground the walker can reach on foot never gets more than `radius`
// away, as in a pocket between two wrecks and the kerb. A bounded flood fill on a small grid.
export function shutIn(o, r, radius = 14) {
  const cell = 1.5,
    seen = new Set(["0,0"]),
    queue = [[0, 0]];
  while (queue.length) {
    const [i, j] = queue.shift();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di,
        nj = j + dj,
        key = ni + "," + nj;
      if (seen.has(key)) continue;
      seen.add(key);
      const x = o.x + ni * cell,
        y = o.y + nj * cell;
      if (footBlocked(x, y, r)) continue;
      if (Math.hypot(ni, nj) * cell > radius) return false;
      queue.push([ni, nj]);
    }
  }
  return true;
}
export function freeSpot(x, y, r, beyond = 0) {
  for (let ring = Math.max(2, Math.ceil(beyond / 2) * 2); ring <= 40 + beyond; ring += 2)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2,
        nx = x + Math.cos(a) * ring,
        ny = y + Math.sin(a) * ring;
      if (!footBlocked(nx, ny, r) && lineClear(x, y, nx, ny)) return { x: nx, y: ny };
    }
  return null;
}
export { blocked, move };
