import { town, CELL_H, CELL_W, X, Y } from "./town.js";

import { streetProps } from "./street-props.js";
import { cars } from "../core/state.js";
import { viaductSection, pierDepth } from "./viaduct.js";
import { carContact, sedanHalfLength, sedanHalfWidth } from "./vehicle-shape.js";

const streetHalfWidth = 25,
  northPavement = 28,
  southPavement = 17;
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
function distanceToBody(v, x, y) {
  const dx = x - v.x,
    dy = y - v.y,
    c = Math.cos(v.a),
    s = Math.sin(v.a);
  const forward = Math.abs(dx * c + dy * s) - (v.halfLength ?? sedanHalfLength),
    side = Math.abs(dy * c - dx * s) - (v.halfWidth ?? sedanHalfWidth);
  return Math.hypot(Math.max(0, forward), Math.max(0, side)) + Math.min(0, Math.max(forward, side));
}
export function footBlocked(x, y, r, from) {
  if (blocked(x, y, r)) return true;
  return cars.some((v) => {
    if (Math.abs(v.x - x) > 22 || Math.abs(v.y - y) > 22) return false;
    const gap = distanceToBody(v, x, y);
    return gap < r && (!from || gap <= distanceToBody(v, from.x, from.y));
  });
}
function move(o, dx, dy, r) {
  let bump = false;
  if (!footBlocked(o.x + dx, o.y, r, o)) o.x += dx;
  else bump = true;
  if (!footBlocked(o.x, o.y + dy, r, o)) o.y += dy;
  else bump = true;
  return bump;
}

export { blocked, move };
