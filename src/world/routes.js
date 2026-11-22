// Graph-based closed traffic route builder and C1-continuous segment compiler (straights, 90° corners, anticlockwise roundabouts).
import { ALLEY_MAX_VEHICLE_HALF_WIDTH } from "./layout.js";

const TAU = 2 * Math.PI;
const RIGHT_LANE = 6;
const CORNER_R = 8;
const FILLET_R = 10;

export function roundaboutCircRadius(node) {
  return Math.round((node.radius + node.outerRadius) * 0.5);
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function normUnit(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

// Compute the exact C1-tangent entry or exit geometry for an anticlockwise roundabout in screen coords (+X right, +Y down).
// armAngle = direction FROM roundabout centre TO the arm street.
// Returns: { straightPt, ringPt, ringAngle, fillet: { cx, cy, r, startA, deltaA } }.
function roundaboutFillet(cx, cy, R, armAngle, laneOffset, isEntry) {
  const ax = Math.cos(armAngle),
    ay = Math.sin(armAngle);
  // In arm local frame: +v along arm (outward from centre), +u to driver's right on entry (clockwise -90° from +v).
  // Check South arm (armAngle = +pi/2, ax=0, ay=1): entry driver heads North (-v), right is East (+1, 0) = (ay, -ax).
  const ux = ay,
    uy = -ax;
  const f = FILLET_R;
  const d = laneOffset;
  const sign = isEntry ? 1 : -1;
  // Local coords of fillet centre: u_f = sign * (d + f), v_f = sqrt((R+f)^2 - (d+f)^2).
  const uf = sign * (d + f);
  const vf = Math.sqrt(Math.max(1, (R + f) * (R + f) - (d + f) * (d + f)));
  const fcx = cx + ux * uf + ax * vf;
  const fcy = cy + uy * uf + ay * vf;
  // Tangent point on straight lane (u = sign * d, v = vf).
  const straightPt = { x: cx + ux * (sign * d) + ax * vf, y: cy + uy * (sign * d) + ay * vf };
  // Tangent point on roundabout ring of radius R along line from centre to fillet centre.
  const k = R / (R + f);
  const ringPt = { x: cx + (fcx - cx) * k, y: cy + (fcy - cy) * k };
  const ringAngle = Math.atan2(ringPt.y - cy, ringPt.x - cx);
  // Fillet arc angles around (fcx, fcy).
  const aStraight = Math.atan2(straightPt.y - fcy, straightPt.x - fcx);
  const aRing = Math.atan2(ringPt.y - fcy, ringPt.x - fcx);
  let startA, deltaA;
  if (isEntry) {
    // Clockwise right-turn from straight lane into anticlockwise ring => positive deltaA in screen coords.
    startA = aStraight;
    deltaA = wrapAngle(aRing - aStraight);
    if (deltaA <= 0) deltaA += TAU;
  } else {
    // Clockwise right-turn peeling off anticlockwise ring onto outgoing lane => positive deltaA.
    startA = aRing;
    deltaA = wrapAngle(aStraight - aRing);
    if (deltaA <= 0) deltaA += TAU;
  }
  return {
    straightPt,
    ringPt,
    ringAngle,
    fillet: {
      type: "arc",
      cx: fcx,
      cy: fcy,
      r: f,
      startA,
      deltaA,
      length: f * Math.abs(deltaA),
      inRoundabout: true,
    },
  };
}

// Compile a closed cycle of road node IDs from `town.roads` into C1-continuous line & arc segments.
export function compileNodeCycle(town, nodeIds, laneOffset = RIGHT_LANE) {
  const n = nodeIds.length;
  if (n < 3) return null;
  const nodes = nodeIds.map((id) => town.roadNodeById.get(id));
  if (nodes.some((x) => !x)) return null;

  // Determine the entry and exit points + transition arcs at each node in the cycle.
  const transitions = [];
  for (let i = 0; i < n; i++) {
    const prev = nodes[(i + n - 1) % n];
    const curr = nodes[i];
    const next = nodes[(i + 1) % n];
    const [ix, iy] = normUnit(curr.x - prev.x, curr.y - prev.y);
    const [ox, oy] = normUnit(next.x - curr.x, next.y - curr.y);
    // Right-hand lane shift vector for a unit direction (dx, dy) is (-dy, dx).
    const inLaneX = -iy * laneOffset,
      inLaneY = ix * laneOffset;
    const outLaneX = -oy * laneOffset,
      outLaneY = ox * laneOffset;

    if (curr.kind === "roundabout") {
      const R = roundaboutCircRadius(curr);
      const armIn = Math.atan2(prev.y - curr.y, prev.x - curr.x);
      const armOut = Math.atan2(next.y - curr.y, next.x - curr.x);
      const entry = roundaboutFillet(curr.x, curr.y, R, armIn, laneOffset, true);
      const exit = roundaboutFillet(curr.x, curr.y, R, armOut, laneOffset, false);
      // Anticlockwise sweep on screen = negative deltaA (strictly in (-TAU, 0)).
      let deltaA = wrapAngle(exit.ringAngle - entry.ringAngle);
      if (deltaA >= -0.05) deltaA -= TAU;
      const ringArc = {
        type: "arc",
        cx: curr.x,
        cy: curr.y,
        r: R,
        startA: entry.ringAngle,
        deltaA,
        length: R * Math.abs(deltaA),
        inRoundabout: true,
        roundabout: { id: curr.id, x: curr.x, y: curr.y, radius: curr.radius, outerRadius: curr.outerRadius },
      };
      transitions.push({
        inPt: entry.straightPt,
        outPt: exit.straightPt,
        arcs: [entry.fillet, ringArc, exit.fillet],
        roundaboutEntry: {
          id: curr.id,
          x: curr.x,
          y: curr.y,
          radius: curr.radius,
          outerRadius: curr.outerRadius,
          joinAngle: entry.ringAngle,
          joinPt: entry.ringPt,
        },
        junction: null,
      });
      continue;
    }

    const cross = ix * oy - iy * ox; // > 0 right turn (CW on screen), < 0 left turn (CCW on screen)
    const dot = ix * ox + iy * oy;
    if (Math.abs(cross) < 0.05 && dot > 0.5) {
      // Straight through intersection.
      const pt = { x: curr.x + inLaneX, y: curr.y + inLaneY };
      transitions.push({
        inPt: pt,
        outPt: pt,
        arcs: [],
        junction: { x: curr.x, y: curr.y },
        roundaboutEntry: null,
      });
      continue;
    }

    // Standard corner turn (right or left turn at 90° intersection).
    // Right turn (cross > 0): corner is inside the lane at (curr + inLane + outLane) pulled back by CORNER_R.
    // Left turn (cross < 0): wider turn radius so left-turning cars swing cleanly across the junction.
    const r = cross > 0 ? CORNER_R : CORNER_R + 2 * laneOffset;
    // Intersection of the two offset lane lines:
    // L_in:  (curr + inLane) + t * (ix, iy)
    // L_out: (curr + outLane) + u * (ox, oy)
    // Since orthogonal (or general), solve (inLane - outLane) = u*o - t*i.
    const det = ix * oy - iy * ox;
    const dx = outLaneX - inLaneX,
      dy = outLaneY - inLaneY;
    const tInt = (dx * oy - dy * ox) / det;
    const cornerX = curr.x + inLaneX + ix * tInt;
    const cornerY = curr.y + inLaneY + iy * tInt;

    const inPt = { x: cornerX - ix * r, y: cornerY - iy * r };
    const outPt = { x: cornerX + ox * r, y: cornerY + oy * r };
    const sign = cross > 0 ? 1 : -1;
    // Circle centre is shifted by sign * r perpendicular to incoming tangent.
    const fcx = inPt.x - iy * sign * r;
    const fcy = inPt.y + ix * sign * r;
    const startA = Math.atan2(inPt.y - fcy, inPt.x - fcx);
    const endA = Math.atan2(outPt.y - fcy, outPt.x - fcx);
    let deltaA = wrapAngle(endA - startA);
    if (sign > 0 && deltaA <= 0) deltaA += TAU;
    if (sign < 0 && deltaA >= 0) deltaA -= TAU;

    transitions.push({
      inPt,
      outPt,
      arcs: [
        {
          type: "arc",
          cx: fcx,
          cy: fcy,
          r,
          startA,
          deltaA,
          length: r * Math.abs(deltaA),
          inRoundabout: false,
          junction: { x: curr.x, y: curr.y },
        },
      ],
      junction: { x: curr.x, y: curr.y },
      roundaboutEntry: null,
    });
  }

  // Assemble alternating straight segments and transition arcs.
  const segments = [];
  for (let i = 0; i < n; i++) {
    const prevT = transitions[(i + n - 1) % n];
    const currT = transitions[i];
    const prevNode = nodes[(i + n - 1) % n];
    const currNode = nodes[i];
    const edgeInfo = town.roadAdj.get(prevNode.id)?.find((a) => a.to === currNode.id)?.edge;
    const isAlley = edgeInfo?.class === "alley";
    const x1 = prevT.outPt.x,
      y1 = prevT.outPt.y;
    const x2 = currT.inPt.x,
      y2 = currT.inPt.y;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > 0.5) {
      segments.push({
        type: "line",
        x1,
        y1,
        x2,
        y2,
        length: len,
        a: Math.atan2(y2 - y1, x2 - x1),
        inRoundabout: false,
        isAlley,
        junction: currT.junction,
        roundaboutEntry: currT.roundaboutEntry,
      });
    }
    for (const arc of currT.arcs) segments.push({ ...arc, isAlley });
  }
  return segments.length ? segments : null;
}

// Compile legacy rectangular `{ points: [{x,y}, ...], to }` routes (used in older tests) into segments.
export function compileLegacyPoints(points) {
  const n = points.length;
  if (n < 3) return null;
  const transitions = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const [ix, iy] = normUnit(curr.x - prev.x, curr.y - prev.y);
    const [ox, oy] = normUnit(next.x - curr.x, next.y - curr.y);
    const cross = ix * oy - iy * ox;
    if (Math.abs(cross) < 0.05) {
      transitions.push({ inPt: curr, outPt: curr, arcs: [] });
      continue;
    }
    const r = CORNER_R;
    const inPt = { x: curr.x - ix * r, y: curr.y - iy * r };
    const outPt = { x: curr.x + ox * r, y: curr.y + oy * r };
    const sign = cross > 0 ? 1 : -1;
    const fcx = inPt.x - iy * sign * r;
    const fcy = inPt.y + ix * sign * r;
    const startA = Math.atan2(inPt.y - fcy, inPt.x - fcx);
    const endA = Math.atan2(outPt.y - fcy, outPt.x - fcx);
    let deltaA = wrapAngle(endA - startA);
    if (sign > 0 && deltaA <= 0) deltaA += TAU;
    if (sign < 0 && deltaA >= 0) deltaA -= TAU;
    transitions.push({
      inPt,
      outPt,
      arcs: [{ type: "arc", cx: fcx, cy: fcy, r, startA, deltaA, length: r * Math.abs(deltaA), inRoundabout: false }],
    });
  }
  const segments = [];
  for (let i = 0; i < n; i++) {
    const prevT = transitions[(i + n - 1) % n];
    const currT = transitions[i];
    const len = Math.hypot(currT.inPt.x - prevT.outPt.x, currT.inPt.y - prevT.outPt.y);
    if (len > 0.5) {
      segments.push({
        type: "line",
        x1: prevT.outPt.x,
        y1: prevT.outPt.y,
        x2: currT.inPt.x,
        y2: currT.inPt.y,
        length: len,
        a: Math.atan2(currT.inPt.y - prevT.outPt.y, currT.inPt.x - prevT.outPt.x),
        inRoundabout: false,
        junction: { x: points[i].x, y: points[i].y },
        roundaboutEntry: null,
      });
    }
    for (const arc of currT.arcs) segments.push(arc);
  }
  return segments;
}

// Find a clean clockwise closed traffic loop on `town.roads` starting from cell `(col, row)`.
// Respects vehicle halfWidth (never enters alleys unless maxHalfWidth <= 3.6) and avoids dead ends.
export function buildTrafficLoop(town, col, row, { maxHalfWidth = 4.8 } = {}) {
  const allowAlley = maxHalfWidth <= ALLEY_MAX_VEHICLE_HALF_WIDTH;
  const startNode = town.roadNodeAt(col, row);
  if (!startNode || startNode.kind === "end") return null;

  const allowed = (adj) => {
    if (!allowAlley && adj.edge.class === "alley") return false;
    if (adj.edge.oneWay && adj.edge.oneWay !== adj.dir) return false;
    const toNode = town.roadNodeById.get(adj.to);
    if (!toNode || toNode.kind === "end") return false;
    return true;
  };

  // Prefer starting along the eastbound edge from (col, row) so block loops run clockwise (French right-hand flow).
  const outs = (town.roadAdj.get(startNode.id) || []).filter(allowed);
  const east = outs.find((a) => {
    const n = town.roadNodeById.get(a.to);
    return n.x > startNode.x && Math.abs(n.y - startNode.y) < 1;
  });
  const firstStep = east || outs[0];
  if (!firstStep) return null;

  // Walk clockwise (always choosing the sharpest right-hand turn first, then straight, then left — never U-turn).
  // Tracing the face boundary of a planar road graph guarantees a tight, clean, clockwise cycle around the block
  // (including roundabouts, bridges, and multi-cell faces around non-bridge river gaps or parks!).
  const visited = new Set([startNode.id]);
  const path = [startNode.id];
  let prevId = startNode.id;
  let currId = firstStep.to;
  const maxSteps = 12;

  for (let step = 0; step < maxSteps; step++) {
    if (currId === startNode.id) {
      if (path.length >= 4) {
        // Compute signed area in screen coords (+Y down): positive area = clockwise!
        let area = 0;
        for (let i = 0; i < path.length; i++) {
          const a = town.roadNodeById.get(path[i]);
          const b = town.roadNodeById.get(path[(i + 1) % path.length]);
          area += a.x * b.y - b.x * a.y;
        }
        const ordered = area >= 0 ? path : [path[0], ...path.slice(1).reverse()];
        const segments = compileNodeCycle(town, ordered, RIGHT_LANE);
        return segments ? { nodeIds: ordered, segments } : null;
      }
      return null;
    }
    if (visited.has(currId)) return null;
    visited.add(currId);
    path.push(currId);

    const prev = town.roadNodeById.get(prevId);
    const curr = town.roadNodeById.get(currId);
    const inAngle = Math.atan2(curr.y - prev.y, curr.x - prev.x);

    const candidates = (town.roadAdj.get(currId) || [])
      .filter((a) => a.to !== prevId && allowed(a))
      .map((a) => {
        const next = town.roadNodeById.get(a.to);
        const outAngle = Math.atan2(next.y - curr.y, next.x - curr.x);
        // Right turn on screen = +pi/2, straight = 0, left = -pi/2.
        // Prefer right turn (+pi/2), then straight (0), then left (-pi/2).
        const turn = wrapAngle(outAngle - inAngle);
        const priority = turn > 0.3 ? 0 : Math.abs(turn) <= 0.3 ? 1 : 2;
        return { to: a.to, priority, turn };
      })
      .sort((a, b) => a.priority - b.priority || b.turn - a.turn);

    if (!candidates.length) return null;
    prevId = currId;
    currId = candidates[0].to;
  }
  return null;
}

// Evaluate position and heading along compiled segments at `(segIndex, s)`.
export function evalSegment(seg, s) {
  if (seg.type === "line") {
    const f = seg.length > 0 ? Math.max(0, Math.min(1, s / seg.length)) : 0;
    return {
      x: seg.x1 + (seg.x2 - seg.x1) * f,
      y: seg.y1 + (seg.y2 - seg.y1) * f,
      a: seg.a,
    };
  }
  const f = seg.length > 0 ? Math.max(0, Math.min(1, s / seg.length)) : 0;
  const theta = seg.startA + seg.deltaA * f;
  return {
    x: seg.cx + Math.cos(theta) * seg.r,
    y: seg.cy + Math.sin(theta) * seg.r,
    a: theta + (seg.deltaA >= 0 ? Math.PI / 2 : -Math.PI / 2),
  };
}

function projectToEdge(point, na, nb) {
  const dx = nb.x - na.x,
    dy = nb.y - na.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((point.x - na.x) * dx + (point.y - na.y) * dy) / len2)) : 0;
  const x = na.x + dx * t,
    y = na.y + dy * t;
  return { x, y, t, dist: Math.hypot(point.x - x, point.y - y), len: Math.sqrt(len2) };
}

function anchorOnGraph(layout, point, canUseAlley) {
  let best = null;
  for (const edge of layout.roads.edges) {
    if (!canUseAlley && edge.class === "alley") continue;
    const na = layout.roadNodeById.get(edge.a),
      nb = layout.roadNodeById.get(edge.b);
    const proj = projectToEdge(point, na, nb);
    if (!best || proj.dist < best.dist) {
      best = { edge, na, nb, x: proj.x, y: proj.y, t: proj.t, len: proj.len, dist: proj.dist };
    }
  }
  return best;
}

function expandRoundabouts(waypoints, nodeSeq, driving) {
  const out = [];
  for (let i = 0; i < waypoints.length; i++) {
    const pt = waypoints[i];
    const node = nodeSeq[i];
    if (node?.kind === "roundabout" && i > 0 && i < waypoints.length - 1) {
      const prev = waypoints[i - 1],
        next = waypoints[i + 1];
      const R = roundaboutCircRadius(node);
      const aIn = Math.atan2(prev.y - node.y, prev.x - node.x);
      const aOut = Math.atan2(next.y - node.y, next.x - node.x);
      let delta = wrapAngle(aOut - aIn);
      if (driving) {
        if (delta >= -0.05) delta -= TAU;
      } else {
        if (Math.abs(delta) < 0.05) delta = 0;
      }
      const steps = Math.max(2, Math.ceil(Math.abs(delta) / (Math.PI / 6)));
      for (let k = 0; k <= steps; k++) {
        const a = aIn + (delta * k) / steps;
        out.push({ x: node.x + Math.cos(a) * R, y: node.y + Math.sin(a) * R });
      }
    } else {
      out.push(pt);
    }
  }
  return out;
}

function cleanPath(points) {
  const clean = [points[0]];
  for (const node of points.slice(1)) {
    const prev = clean[clean.length - 1];
    if (Math.hypot(node.x - prev.x, node.y - prev.y) > 0.5) clean.push(node);
  }
  return clean;
}

// Pure Dijkstra shortest path on `layout.roads`, expanding roundabouts into ring waypoints
// and admitting alleys on foot or for narrow vehicles (halfWidth <= 3.6).
export function findRoute(
  layout,
  start,
  finish,
  { onFoot = true, vehicleHalfWidth = 4.8, isBlocked = null } = {},
) {
  const canUseAlley = onFoot || vehicleHalfWidth <= ALLEY_MAX_VEHICLE_HALF_WIDTH;
  const distanceToDoor = Math.hypot(finish.x - start.x, finish.y - start.y);

  const lineWalkable = (r) => {
    if (!isBlocked) return false;
    const samples = Math.max(2, Math.ceil(distanceToDoor / 3));
    for (let i = 1; i < samples; i++) {
      const f = i / samples;
      if (isBlocked(start.x + (finish.x - start.x) * f, start.y + (finish.y - start.y) * f, r)) return false;
    }
    return true;
  };

  if (distanceToDoor < 37 && lineWalkable(onFoot ? 2.4 : 4.2)) return [start, finish];
  if (onFoot && distanceToDoor < 115 && lineWalkable(2.6)) return [start, finish];

  const a = anchorOnGraph(layout, start, canUseAlley);
  const b = anchorOnGraph(layout, finish, canUseAlley);
  if (!a || !b) return [start, finish];

  if (a.edge === b.edge) return cleanPath([start, { x: a.x, y: a.y }, { x: b.x, y: b.y }, finish]);

  const distMap = new Map();
  const prevMap = new Map();
  const visited = new Set();
  const relax = (id, cost, via) => {
    if (cost < (distMap.get(id) ?? Infinity)) {
      distMap.set(id, cost);
      prevMap.set(id, via);
    }
  };

  if (onFoot || a.edge.oneWay !== "a>b") relax(a.na.id, a.t * a.len, null);
  if (onFoot || a.edge.oneWay !== "b>a") relax(a.nb.id, (1 - a.t) * a.len, null);

  const goalIds = new Set();
  const goalEdgeCost = new Map();
  if (onFoot || b.edge.oneWay !== "b>a") {
    goalIds.add(b.na.id);
    goalEdgeCost.set(b.na.id, b.t * b.len);
  }
  if (onFoot || b.edge.oneWay !== "a>b") {
    goalIds.add(b.nb.id);
    goalEdgeCost.set(b.nb.id, (1 - b.t) * b.len);
  }

  const totalNodes = layout.roads.nodes.length;
  for (let iter = 0; iter < totalNodes; iter++) {
    let u = null,
      bestD = Infinity;
    for (const [id, d] of distMap) {
      if (!visited.has(id) && d < bestD) {
        bestD = d;
        u = id;
      }
    }
    if (u === null) break;
    visited.add(u);
    for (const step of layout.roadAdj.get(u) || []) {
      if (!canUseAlley && step.edge.class === "alley") continue;
      if (!onFoot && step.edge.oneWay && step.edge.oneWay !== step.dir) continue;
      if (visited.has(step.to)) continue;
      const weight = !onFoot && step.edge.class === "avenue" ? 0.96 : 1;
      relax(step.to, bestD + step.length * weight, u);
    }
  }

  let bestGoalNode = null,
    bestTotal = Infinity;
  for (const gid of goalIds) {
    const cost = (distMap.get(gid) ?? Infinity) + goalEdgeCost.get(gid);
    if (cost < bestTotal) {
      bestTotal = cost;
      bestGoalNode = gid;
    }
  }
  if (!bestGoalNode) return [start, finish];

  const chain = [];
  for (let cur = bestGoalNode; cur != null; cur = prevMap.get(cur)) chain.push(cur);
  chain.reverse();

  const rawPoints = [start, { x: a.x, y: a.y }];
  const rawNodes = [null, null];
  for (const id of chain) {
    const node = layout.roadNodeById.get(id);
    rawPoints.push({ x: node.x, y: node.y });
    rawNodes.push(node);
  }
  rawPoints.push({ x: b.x, y: b.y }, finish);
  rawNodes.push(null, null);

  return cleanPath(expandRoundabouts(rawPoints, rawNodes, !onFoot));
}
