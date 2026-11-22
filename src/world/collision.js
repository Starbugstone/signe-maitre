import { town, CELL_H, CELL_W, X, Y } from "./town.js";
import { ALLEY_MAX_VEHICLE_HALF_WIDTH } from "./layout.js";
import { streetProps } from "./street-props.js";
import { cars } from "../core/state.js";
import { viaductSection, pierDepth, pierThickness } from "./viaduct.js";
import { carContact, sedanHalfLength, sedanHalfWidth } from "./vehicle-shape.js";

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function circleHitsPoly(x, y, r, poly) {
  if (pointInPoly(x, y, poly)) return true;
  if (r <= 0) return false;
  const r2 = r * r;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    const dx = xj - xi,
      dy = yj - yi,
      len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len2)) : 0;
    const px = xi + dx * t - x,
      py = yi + dy * t - y;
    if (px * px + py * py < r2) return true;
  }
  return false;
}

function circleHitsBox(x, y, r, b) {
  const cx = Math.max(b.left, Math.min(x, b.right));
  const cy = Math.max(b.top, Math.min(y, b.bottom));
  const dx = x - cx,
    dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

function obbHitsCircle(pose, cx, cy, r) {
  const dx = cx - pose.x,
    dy = cy - pose.y;
  const c = Math.cos(pose.a),
    s = Math.sin(pose.a);
  const localX = dx * c + dy * s;
  const localY = -dx * s + dy * c;
  const clampedX = Math.max(-pose.halfLength, Math.min(localX, pose.halfLength));
  const clampedY = Math.max(-pose.halfWidth, Math.min(localY, pose.halfWidth));
  const rx = localX - clampedX,
    ry = localY - clampedY;
  return rx * rx + ry * ry < r * r;
}

function obbCorners(pose) {
  const c = Math.cos(pose.a),
    s = Math.sin(pose.a);
  const lx = c * pose.halfLength,
    ly = s * pose.halfLength;
  const wx = -s * pose.halfWidth,
    wy = c * pose.halfWidth;
  return [
    [pose.x + lx + wx, pose.y + ly + wy],
    [pose.x + lx - wx, pose.y + ly - wy],
    [pose.x - lx - wx, pose.y - ly - wy],
    [pose.x - lx + wx, pose.y - ly + wy],
  ];
}

// Separating Axis Theorem check between vehicle OBB and a convex/simple polygon.
function obbHitsPoly(pose, poly) {
  const rect = obbCorners(pose);
  const axes = [
    [Math.cos(pose.a), Math.sin(pose.a)],
    [-Math.sin(pose.a), Math.cos(pose.a)],
  ];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const dx = poly[i][0] - poly[j][0],
      dy = poly[i][1] - poly[j][1];
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) axes.push([-dy / len, dx / len]);
  }
  for (const [ax, ay] of axes) {
    let minA = Infinity,
      maxA = -Infinity;
    for (const [px, py] of rect) {
      const p = px * ax + py * ay;
      if (p < minA) minA = p;
      if (p > maxA) maxA = p;
    }
    let minB = Infinity,
      maxB = -Infinity;
    for (const [px, py] of poly) {
      const p = px * ax + py * ay;
      if (p < minB) minB = p;
      if (p > maxB) maxB = p;
    }
    if (maxA <= minB || maxB <= minA) return false;
  }
  return true;
}

function pointInOpenSpace(layout, cell, x, y, allowAlley, allowServiceSeam) {
  for (const r of cell.openRects) {
    if (r.alley && !allowAlley) continue;
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  for (const rb of cell.roundabouts) {
    const dx = x - rb.x,
      dy = y - rb.y;
    if (dx * dx + dy * dy <= rb.outerRadius * rb.outerRadius) return true;
  }
  if (allowServiceSeam) {
    // Unopened service alleys between painted blocks remain walkable on foot away from river water.
    if (!layout.river || !layout.river.onWater(x, y, 0)) {
      const { col, row } = layout.cellAt(x, y);
      const dx = Math.abs(x - X(col)),
        dy = Math.abs(y - Y(row));
      if (Math.abs(dx - CELL_W / 2) < 2.9 || Math.abs(dy - CELL_H / 2) < 2.9) {
        // Do not open a seam straight across open river water or along a river-row gap.
        const m = layout.cellMeta(col, row);
        if (!m.isRiverRow || m.isIsland) return true;
      }
    }
  }
  return false;
}

const CIRCLE_DIRS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
});

function hitsLegacyLines(layout, x, y, r) {
  if (!layout.lines?.size) return false;
  const { row } = layout.cellAt(x, y);
  const fromFoot = y - Y(row) - pierDepth;
  if (layout.lines.has(row) && fromFoot < r && fromFoot > -pierThickness - r) {
    const { col: first } = layout.cellAt(x - r, y),
      { col: last } = layout.cellAt(x + r, y);
    for (let i = first; i <= last; i++)
      for (const [left, right] of viaductSection(layout, row, i).bases)
        if (x + r > X(i) + left && x - r < X(i) + right) return true;
  }
  return false;
}

export function blockedIn(layout, x, y, r) {
  const W = layout.width,
    H = layout.height;
  if (x < r || y < r || x > W - r || y > H - r) return true;

  const { col, row } = layout.cellAt(x, y);
  const cell = layout.cellMeta(col, row);
  const allowAlley = r <= ALLEY_MAX_VEHICLE_HALF_WIDTH;
  const allowServiceSeam = r < 4;

  // 1. Street furniture (lamps and bollards) in this cell.
  for (const post of streetProps(layout, col, row)) {
    const radius = post.item.radius;
    if (Math.abs(x - post.x) < r + radius && Math.hypot(x - post.x, y - post.y + radius / 2) < r + radius)
      return true;
  }

  // 2. Roundabout central islands.
  for (const rb of cell.roundabouts) {
    const minD = rb.radius + r;
    const dx = x - rb.x,
      dy = y - rb.y;
    if (dx * dx + dy * dy < minD * minD) return true;
  }

  // 3. Monument footprints / Tour de Fer piers.
  for (const poly of cell.solidPolys) {
    if (circleHitsPoly(x, y, r, poly)) return true;
  }

  // 4. Ring viaduct piers (and legacy straight-line piers if any).
  for (const pier of cell.ringPiers) {
    if (circleHitsBox(x, y, r, pier)) return true;
  }
  if (hitsLegacyLines(layout, x, y, r)) return true;

  // 4b. Unopened service lanes between painted blocks remain walkable on foot away from river water.
  if (allowServiceSeam && (!layout.river || !layout.river.onWater(x, y, 0)) && (!cell.isRiverRow || cell.isIsland)) {
    const seamX = Math.abs(Math.abs(x - X(col)) - CELL_W / 2);
    const seamY = Math.abs(Math.abs(y - Y(row)) - CELL_H / 2);
    if (seamX < 2.9 || seamY < 2.9) return false;
  }

  // 5. Fast-path open ground check: strictly inside a single allowed open rect or roundabout plaza.
  for (const rect of cell.openRects) {
    if (rect.alley && !allowAlley) continue;
    if (x >= rect.left + r && x <= rect.right - r && y >= rect.top + r && y <= rect.bottom - r) return false;
  }
  for (const rb of cell.roundabouts) {
    const maxR = rb.outerRadius - r;
    if (maxR > 0) {
      const dx = x - rb.x,
        dy = y - rb.y;
      if (dx * dx + dy * dy <= maxR * maxR) return false;
    }
  }

  // 6. Slow path (near corners, seams, bridge mouths, alley mouths, roundabout transitions):
  // verify centre and 8 perimeter points of the circle all lie in the union of allowed open shapes.
  if (!pointInOpenSpace(layout, cell, x, y, allowAlley, allowServiceSeam)) return true;
  for (const [cx, cy] of CIRCLE_DIRS) {
    const sx = x + cx * r,
      sy = y + cy * r;
    const sc = layout.cellAt(sx, sy);
    const sCell = sc.col === col && sc.row === row ? cell : layout.cellMeta(sc.col, sc.row);
    if (!pointInOpenSpace(layout, sCell, sx, sy, allowAlley, allowServiceSeam)) return true;
  }
  return false;
}

export function vehicleBlockedIn(layout, vehicle, x = vehicle.x, y = vehicle.y, a = vehicle.a, leaving = false) {
  const halfLength = vehicle.halfLength ?? sedanHalfLength,
    halfWidth = vehicle.halfWidth ?? sedanHalfWidth;
  const cos = Math.abs(Math.cos(a)),
    sin = Math.abs(Math.sin(a));
  const rx = cos * halfLength + sin * halfWidth,
    ry = sin * halfLength + cos * halfWidth;
  if (!leaving && (x < rx || y < ry || x > layout.width - rx || y > layout.height - ry)) return true;

  const canUseAlley = halfWidth <= ALLEY_MAX_VEHICLE_HALF_WIDTH;
  const pose = { x, y, a, halfLength, halfWidth };
  const first = layout.cellAt(x - rx, y - ry),
    last = layout.cellAt(x + rx, y + ry);

  // 1. Check solid obstacles across overlapping cells.
  for (let row = first.row; row <= last.row; row++) {
    for (let col = first.col; col <= last.col; col++) {
      const cell = layout.cellMeta(col, row);
      // Roundabout islands.
      for (const rb of cell.roundabouts) {
        if (obbHitsCircle(pose, rb.x, rb.y, rb.radius)) return true;
      }
      // Monument footprints / piers.
      for (const poly of cell.solidPolys) {
        if (obbHitsPoly(pose, poly)) return true;
      }
      // Ring viaduct piers.
      for (const pier of cell.ringPiers) {
        const box = {
          x: (pier.left + pier.right) / 2,
          y: (pier.top + pier.bottom) / 2,
          a: 0,
          halfLength: (pier.right - pier.left) / 2,
          halfWidth: (pier.bottom - pier.top) / 2,
        };
        if (
          Math.abs(box.x - x) < rx + box.halfLength &&
          Math.abs(box.y - y) < ry + box.halfWidth &&
          carContact(pose, box)
        )
          return true;
      }
      // Legacy straight-line piers (if present on a test layout).
      if (layout.lines?.has(row)) {
        const cy = Y(row);
        for (const [left, right] of viaductSection(layout, row, col).bases) {
          const box = {
            x: X(col) + (left + right) / 2,
            y: cy + pierDepth - pierThickness / 2,
            a: 0,
            halfLength: (right - left) / 2,
            halfWidth: pierThickness / 2,
          };
          if (
            Math.abs(box.x - x) < rx + box.halfLength &&
            Math.abs(box.y - y) < ry + box.halfWidth &&
            carContact(pose, box)
          )
            return true;
        }
      }
      // Street props (lamps and bollards).
      for (const post of streetProps(layout, col, row)) {
        const r = post.item.radius;
        const box = { x: post.x, y: post.y - r / 2, a: 0, halfLength: r, halfWidth: r / 2 };
        if (
          Math.abs(box.x - x) < rx + box.halfLength &&
          Math.abs(box.y - y) < ry + box.halfWidth &&
          carContact(pose, box)
        )
          return true;
      }
    }
  }

  // 2. Check that the vehicle body lies completely within allowed road space (respecting alleys, river & walls).
  const centerCell = layout.cellMeta(layout.cellAt(x, y).col, layout.cellAt(x, y).row);
  const corners = obbCorners(pose);

  // Fast path: all 4 corners inside a single allowed open rectangle (convex -> entire OBB is inside).
  for (const rect of centerCell.openRects) {
    if (rect.alley && !canUseAlley) continue;
    if (
      corners[0][0] >= rect.left &&
      corners[0][0] <= rect.right &&
      corners[0][1] >= rect.top &&
      corners[0][1] <= rect.bottom &&
      corners[1][0] >= rect.left &&
      corners[1][0] <= rect.right &&
      corners[1][1] >= rect.top &&
      corners[1][1] <= rect.bottom &&
      corners[2][0] >= rect.left &&
      corners[2][0] <= rect.right &&
      corners[2][1] >= rect.top &&
      corners[2][1] <= rect.bottom &&
      corners[3][0] >= rect.left &&
      corners[3][0] <= rect.right &&
      corners[3][1] >= rect.top &&
      corners[3][1] <= rect.bottom
    )
      return false;
  }

  // Fast path: all 4 corners inside a single roundabout plaza.
  for (const rb of centerCell.roundabouts) {
    const r2 = rb.outerRadius * rb.outerRadius;
    if (corners.every(([px, py]) => (px - rb.x) ** 2 + (py - rb.y) ** 2 <= r2)) return false;
  }

  // Slow path: sample OBB perimeter (corners + along sides + ends) so inside building corners cannot clip mid-body.
  const c = Math.cos(a),
    s = Math.sin(a);
  const samples = [
    [x, y],
    ...corners,
    // Front & rear centres.
    [x + c * halfLength, y + s * halfLength],
    [x - c * halfLength, y - s * halfLength],
  ];
  for (const f of [-0.6, -0.2, 0.2, 0.6]) {
    const lx = c * halfLength * f,
      ly = s * halfLength * f;
    samples.push([x + lx - s * halfWidth, y + ly + c * halfWidth]);
    samples.push([x + lx + s * halfWidth, y + ly - c * halfWidth]);
  }
  for (const [px, py] of samples) {
    if (leaving && (px < 0 || py < 0 || px > layout.width || py > layout.height)) continue;
    const sc = layout.cellAt(px, py);
    const cell = layout.cellMeta(sc.col, sc.row);
    if (!pointInOpenSpace(layout, cell, px, py, canUseAlley, false)) return true;
  }
  return false;
}

export function vehicleBlocked(vehicle, x = vehicle.x, y = vehicle.y, a = vehicle.a, leaving = false) {
  return vehicleBlockedIn(town, vehicle, x, y, a, leaving);
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

// How far a foot circle of radius r sinks into each nearby vehicle body.
function carOverlaps(x, y, r) {
  const overlaps = new Map();
  for (const v of cars) {
    if (Math.abs(v.x - x) > 22 || Math.abs(v.y - y) > 22) continue;
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
// can be reached in a straight line without crossing a wall, a pier or the river.
export function lineClear(x, y, tx, ty) {
  const steps = Math.ceil(Math.hypot(tx - x, ty - y));
  for (let i = 1; i <= steps; i++)
    if (blocked(x + ((tx - x) * i) / steps, y + ((ty - y) * i) / steps, 1)) return false;
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
      if (Math.abs(v.x - sx) < 14 && Math.abs(v.y - sy) < 14 && distanceToBody(v, sx, sy) < 0) return false;
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
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
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
