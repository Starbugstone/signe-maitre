// All map coordinates are in world units. Artwork is registered to street centres.
export const CELL_W = 290,
  CELL_H = 228;
export const X = (col) => 75 + col * CELL_W;
export const Y = (row) => 72 + row * CELL_H;

const defaultPalettes = new Set(["market", "garage", "docks", "square"]);

export const ROAD_HALF_WIDTH = {
  avenue: 25,
  street: 25,
  alley: 7,
};
export const ALLEY_MAX_VEHICLE_HALF_WIDTH = 3.6;

export function roundaboutOuterRadius(radius) {
  if (radius >= 21) return 54;
  if (radius >= 17) return 46;
  return 42;
}

// Build a smooth clockwise rounded-rectangle closed polyline for the Petite Ceinture ring viaduct.
export function buildRingLoop({ left, right, top, bottom, cornerR = 36, cornerSteps = 8 }) {
  const pts = [];
  const addArc = (cx, cy, startA, endA) => {
    for (let i = 0; i <= cornerSteps; i++) {
      const a = startA + ((endA - startA) * i) / cornerSteps;
      pts.push({ x: +(cx + Math.cos(a) * cornerR).toFixed(2), y: +(cy + Math.sin(a) * cornerR).toFixed(2) });
    }
  };
  // Clockwise on screen (+X right, +Y down):
  // Top-right corner (-pi/2 -> 0), Bottom-right (0 -> pi/2), Bottom-left (pi/2 -> pi), Top-left (pi -> 3pi/2).
  addArc(right - cornerR, top + cornerR, -Math.PI / 2, 0);
  addArc(right - cornerR, bottom - cornerR, 0, Math.PI / 2);
  addArc(left + cornerR, bottom - cornerR, Math.PI / 2, Math.PI);
  addArc(left + cornerR, top + cornerR, Math.PI, (3 * Math.PI) / 2);
  // Close the loop explicitly back to the first point.
  pts.push({ x: pts[0].x, y: pts[0].y });

  let length = 0;
  for (let i = 0; i < pts.length - 1; i++)
    length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return { points: pts, length };
}

// Project a point onto the closed ring loop, returning its arc length `s` and snapped `{x, y}`.
export function projectOnRing(points, target) {
  let bestDist = Infinity,
    bestS = 0,
    bestPt = points[0],
    acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / (len * len)));
    const px = a.x + dx * t,
      py = a.y + dy * t;
    const d = Math.hypot(target.x - px, target.y - py);
    if (d < bestDist) {
      bestDist = d;
      bestS = acc + len * t;
      bestPt = { x: +px.toFixed(2), y: +py.toFixed(2) };
    }
    acc += len;
  }
  return { s: +bestS.toFixed(2), stop: bestPt, dist: bestDist };
}

// Evaluate position and unit tangent along a closed ring at arc length `s`.
export function sampleRingAt(ring, s) {
  const pts = ring.points;
  const total = ring.length;
  let target = ((s % total) + total) % total;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    if (acc + len >= target || i === pts.length - 2) {
      const t = Math.max(0, Math.min(1, (target - acc) / len));
      return { x: a.x + dx * t, y: a.y + dy * t, a: Math.atan2(dy, dx) };
    }
    acc += len;
  }
  return { x: pts[0].x, y: pts[0].y, a: 0 };
}

function makeDefaultRoads(cols, rows, canalRow, riverSouthRow, bridgeCols) {
  const nodes = [];
  const byCoord = new Map();
  const addNode = (col, row, kind = "cross") => {
    const id = `c${col}r${row}`;
    const node = { id, col, row, x: X(col), y: Y(row), kind };
    nodes.push(node);
    byCoord.set(id, node);
    return node;
  };
  const hasRiverRow = riverSouthRow === canalRow + 2;
  for (let r = 0; r < rows; r++) {
    if (hasRiverRow && r === canalRow + 1) continue;
    for (let c = 0; c < cols; c++) addNode(c, r);
  }
  const edges = [];
  const addEdge = (a, b, cls = "street") =>
    edges.push({ a, b, class: cls, halfWidth: ROAD_HALF_WIDTH[cls] });

  for (let r = 0; r < rows; r++) {
    if (hasRiverRow && r === canalRow + 1) continue;
    for (let c = 0; c < cols - 1; c++) addEdge(`c${c}r${r}`, `c${c + 1}r${r}`, "street");
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 1; r++) {
      if (hasRiverRow && r === canalRow) {
        if (bridgeCols.has(c)) addEdge(`c${c}r${r}`, `c${c}r${r + 2}`, "street");
        continue;
      }
      if (hasRiverRow && r === canalRow + 1) continue;
      if (!hasRiverRow && r === canalRow && !bridgeCols.has(c)) continue;
      addEdge(`c${c}r${r}`, `c${c}r${r + 1}`, "street");
    }
  }
  return { nodes, edges };
}

function makeRiver({ top, bottom, islands = [], bridges = [], centreline = [], moorings = [], width }) {
  function onWater(x, y, r = 0) {
    if (x - r < 0 || x + r > width) return false;
    if (y - r < top || y + r > bottom) return false;
    for (const isl of islands) {
      const cx = Math.max(isl.left, Math.min(x, isl.right));
      const cy = Math.max(isl.top, Math.min(y, isl.bottom));
      const d = Math.hypot(x - cx, y - cy);
      if (r > 0 ? d < r : x >= isl.left && x <= isl.right && y >= isl.top && y <= isl.bottom) return false;
    }
    return true;
  }
  return { top, bottom, islands, bridges, centreline, moorings, onWater };
}

function rectOverlapsCell(rect, col, row, pad = 28) {
  const cx = X(col),
    cy = Y(row);
  return (
    rect.right >= cx - CELL_W / 2 - pad &&
    rect.left <= cx + CELL_W / 2 + pad &&
    rect.bottom >= cy - CELL_H / 2 - pad &&
    rect.top <= cy + CELL_H / 2 + pad
  );
}

function polyBounds(poly) {
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (const [x, y] of poly) {
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  return { left, right, top, bottom };
}

export function buildTown({
  blocks,
  cellKinds,
  canalRow,
  river: riverSpec,
  roads: roadsSpec,
  ring: ringSpec,
  monuments = [],
  parks = [],
  railways = [],
  addresses = [],
  interiors = [],
  palettes = defaultPalettes,
  buildPiers,
}) {
  const rows = blocks.length,
    cols = blocks[0]?.length ?? 0;
  if (
    rows < 2 ||
    cols < 2 ||
    blocks.some((row) => row.length !== cols || row.some((key) => !palettes.has(key)))
  )
    throw new Error("Town needs a rectangular grid of registered street paintings");
  if (!Number.isInteger(canalRow) || canalRow < 0 || canalRow + 1 >= rows)
    throw new Error("Canal needs two banks");

  const width = X(cols - 1) + 75,
    height = Y(rows - 1) + 72;

  // Determine river geometry (either full two-bank + island riverSpec, or legacy single-band canal fallback).
  const singleBandCanal = !riverSpec;
  const riverSouthRow = singleBandCanal ? canalRow + 1 : (riverSpec.southRow ?? canalRow + 2);
  const riverRow = singleBandCanal ? null : (riverSpec.riverRow ?? canalRow + 1);
  const riverTop = singleBandCanal ? Y(canalRow) + 16 + (CELL_H - 31) * 0.13 : riverSpec.top;
  const riverBottom = singleBandCanal ? Y(canalRow) + 16 + (CELL_H - 31) * 0.86 : riverSpec.bottom;
  const bridgeList = singleBandCanal
    ? Array.from({ length: cols }, (_, col) => ({ col, x: X(col), halfWidth: 22, clearance: true }))
    : riverSpec.bridges.map((b) => ({
        col: b.col,
        x: b.x ?? X(b.col),
        halfWidth: b.halfWidth ?? 22,
        clearance: b.clearance !== false,
      }));
  const bridgeCols = new Set(bridgeList.map((b) => b.col));
  const islands = singleBandCanal ? [] : (riverSpec.islands || []).map((i) => ({ ...i }));
  const centreline =
    !singleBandCanal && riverSpec.centreline?.length
      ? riverSpec.centreline.map((pt) => ({ x: pt.x, y: pt.y }))
      : [
          { x: 0, y: (riverTop + riverBottom) / 2 },
          { x: width, y: (riverTop + riverBottom) / 2 },
        ];
  const moorings = (riverSpec?.moorings || []).map((m) => ({
    id: m.id,
    x: m.x,
    y: m.y,
    a: m.a ?? 0,
    quay: { x: m.quay.x, y: m.quay.y },
  }));
  const river = makeRiver({
    top: riverTop,
    bottom: riverBottom,
    islands,
    bridges: bridgeList,
    centreline,
    moorings,
    width,
  });

  // Build and validate road graph.
  const rawRoads = roadsSpec || makeDefaultRoads(cols, rows, canalRow, riverSouthRow, bridgeCols);
  const roadNodeById = new Map();
  const roadNodes = rawRoads.nodes.map((n) => {
    const node = {
      id: n.id,
      col: n.col,
      row: n.row,
      x: n.x ?? X(n.col),
      y: n.y ?? Y(n.row),
      kind: n.kind || "cross",
      ...(n.radius ? { radius: n.radius, outerRadius: n.outerRadius ?? roundaboutOuterRadius(n.radius) } : {}),
    };
    if (roadNodeById.has(node.id)) throw new Error("Duplicate road node: " + node.id);
    roadNodeById.set(node.id, node);
    return node;
  });

  const roadAdj = new Map(roadNodes.map((n) => [n.id, []]));
  const roadEdges = rawRoads.edges.map((e) => {
    const na = roadNodeById.get(e.a),
      nb = roadNodeById.get(e.b);
    if (!na || !nb) throw new Error(`Road edge references missing node: ${e.a} -> ${e.b}`);
    const cls = e.class || "street";
    const halfWidth = e.halfWidth ?? ROAD_HALF_WIDTH[cls];
    const edge = {
      a: e.a,
      b: e.b,
      class: cls,
      halfWidth,
      ...(e.oneWay ? { oneWay: e.oneWay } : {}),
      ...(e.seam ? { seam: true } : {}),
      ...(e.bridge ? { bridge: true } : {}),
    };
    const length = Math.hypot(nb.x - na.x, nb.y - na.y);
    roadAdj.get(e.a).push({ to: e.b, edge, length, dir: "a>b" });
    roadAdj.get(e.b).push({ to: e.a, edge, length, dir: "b>a" });
    return edge;
  });

  // Auto-derive kind ("cross" | "tee" | "end") for non-roundabout nodes from actual degree.
  for (const node of roadNodes) {
    if (node.kind === "roundabout") continue;
    const deg = roadAdj.get(node.id).length;
    if (deg <= 1) node.kind = "end";
    else if (deg === 2 || deg === 3) node.kind = "tee";
    else node.kind = "cross";
  }

  const roads = { nodes: roadNodes, edges: roadEdges };

  // Build ring railway (Petite Ceinture).
  let ring = null;
  if (ringSpec) {
    const loop = ringSpec.points?.length
      ? { points: ringSpec.points, length: ringSpec.length }
      : buildRingLoop(ringSpec);
    const stations = (ringSpec.stations || []).map((st) => {
      const proj = projectOnRing(loop.points, st.stop);
      return {
        id: st.id,
        name: { fr: st.name.fr, en: st.name.en },
        s: st.s ?? proj.s,
        stop: proj.stop,
        street: { x: st.street.x, y: st.street.y },
      };
    });
    stations.sort((a, b) => a.s - b.s);
    ring = {
      points: loop.points,
      length: +loop.length.toFixed(2),
      deckLift: ringSpec.deckLift ?? 40,
      stations,
      northRow: ringSpec.northRow,
      southRow: ringSpec.southRow,
      minCol: ringSpec.minCol,
      maxCol: ringSpec.maxCol,
      left: ringSpec.left,
      right: ringSpec.right,
      top: ringSpec.top,
      bottom: ringSpec.bottom,
      cornerR: ringSpec.cornerR ?? 36,
      piers: [],
    };
  } else if (rows >= 4 && cols >= 4) {
    // Auto perimeter ring for synthetic grids without an explicit ringSpec.
    const railScaleY = (CELL_H / 2 - 16.8) / 429;
    const pierDepth = -CELL_H / 2 + 378 * railScaleY;
    const geom = {
      northRow: 1,
      southRow: rows - 1,
      minCol: 1,
      maxCol: cols - 2,
      left: (X(0) + X(1)) / 2,
      right: (X(cols - 2) + X(cols - 1)) / 2,
      top: Y(1) + pierDepth,
      bottom: Y(rows - 1) + pierDepth,
      cornerR: 36,
    };
    const loop = buildRingLoop(geom);
    ring = { ...geom, points: loop.points, length: +loop.length.toFixed(2), deckLift: 40, stations: [], piers: [] };
  }

  // Legacy straight lines map (only populated if caller explicitly passes legacy `railways`).
  const lines = new Map();
  for (const line of railways) {
    if (
      !Number.isInteger(line.row) ||
      line.row < 0 ||
      line.row >= rows ||
      line.row === canalRow + 1 ||
      lines.has(line.row)
    )
      throw new Error("Invalid or overlapping viaduct row " + line.row);
    if (line.from !== "west" || line.to !== "east")
      throw new Error("A through line must reach both town boundaries");
    if (!(line.speed > 0) || !Number.isFinite(line.phase)) throw new Error("Invalid train timetable");
    lines.set(line.row, line);
  }

  // Validate that market paintings sit on a viaduct row (either ring horizontal leg or legacy railway).
  const viaductRows = new Set(lines.keys());
  if (ring) {
    if (ring.northRow != null) viaductRows.add(ring.northRow);
    if (ring.southRow != null) viaductRows.add(ring.southRow);
  }
  for (const [j, row] of blocks.entries()) {
    if (row.includes("market") && j !== riverRow && !viaductRows.has(j))
      throw new Error("Market painting has an unconnected viaduct in row " + j);
  }

  // Validate addresses and interiors.
  const jobs = addresses.map(({ col, row, dx, dy, ...address }) => {
    if (!Number.isInteger(col) || !Number.isInteger(row) || !blocks[row]?.[col])
      throw new Error("Address outside town: " + address.id);
    return { ...address, col, row, name: address.id, x: X(col) + dx, y: Y(row) + dy };
  });
  const byId = new Map(jobs.map((job) => [job.id, job]));
  if (jobs.length !== byId.size) throw new Error("Duplicate address");

  const rooms = new Map();
  for (const room of interiors) {
    if (!byId.has(room.door) || rooms.has(room.door))
      throw new Error("Interior needs a unique street door: " + room.door);
    const f = room.floor;
    if (
      !f ||
      !(
        room.width > 0 &&
        room.height > 0 &&
        f.left >= 0 &&
        f.right <= room.width &&
        f.left < f.right &&
        f.top >= 0 &&
        f.bottom <= room.height &&
        f.top < f.bottom
      )
    )
      throw new Error("Invalid room floor");
    for (const point of [room.entry, room.exit, room.desk])
      if (!point || !(point.x >= f.left && point.x <= f.right && point.y >= f.top && point.y <= f.bottom))
        throw new Error("Unreachable room anchor: " + room.door);
    rooms.set(room.door, room);
  }

  function cellAt(x, y) {
    return {
      col: Math.max(0, Math.min(cols - 1, Math.round((x - X(0)) / CELL_W))),
      row: Math.max(0, Math.min(rows - 1, Math.round((y - Y(0)) / CELL_H))),
    };
  }
  function visibleCells(x, y, w, h, pad = 0) {
    const a = cellAt(x - pad, y - pad),
      b = cellAt(x + w + pad, y + h + pad);
    return { firstCol: a.col, lastCol: b.col, firstRow: a.row, lastRow: b.row };
  }

  const normalizedMonuments = monuments.map((m) => ({
    id: m.id,
    name: { fr: m.name.fr, en: m.name.en },
    col: m.col,
    row: m.row,
    x: m.x ?? X(m.col),
    y: m.y ?? Y(m.row),
    footprint: m.footprint,
    ...(m.passUnder ? { passUnder: true } : {}),
    ...(m.piers ? { piers: m.piers } : {}),
    ...(m.style ? { style: m.style } : {}),
  }));

  const layout = {
    blocks,
    cellKinds: cellKinds || blocks,
    rows,
    cols,
    width,
    height,
    lines,
    byId,
    jobs,
    rooms,
    cellAt,
    visibleCells,
    canalRow,
    riverRow,
    riverSouthRow,
    singleBandCanal,
    roads,
    roadNodeById,
    roadAdj,
    river,
    ring,
    monuments: normalizedMonuments,
    parks,
    roadsX: Array.from({ length: cols }, (_, i) => X(i)),
    roadsY: Array.from({ length: rows }, (_, i) => Y(i)),
  };

  // Populate ring viaduct piers once layout is formed.
  if (ring && buildPiers) ring.piers = buildPiers(layout);

  // Precompute per-cell open walkable/driveable rectangles, roundabouts, solid monument polygons, and ring piers.
  const openRectsAll = [];
  const northPavement = 28,
    southPavement = 23,
    streetHW = 25;

  // 1. Road edges -> open rectangles.
  for (const e of roadEdges) {
    const na = roadNodeById.get(e.a),
      nb = roadNodeById.get(e.b);
    const alley = e.class === "alley";
    const horiz = Math.abs(na.y - nb.y) < 1;
    if (horiz) {
      const minX = Math.min(na.x, nb.x),
        maxX = Math.max(na.x, nb.x);
      const pad = alley ? e.halfWidth : streetHW;
      openRectsAll.push({
        left: minX - pad,
        right: maxX + pad,
        top: na.y - (alley ? e.halfWidth : northPavement),
        bottom: na.y + (alley ? e.halfWidth : southPavement),
        alley,
        edge: e,
      });
    } else {
      const minY = Math.min(na.y, nb.y),
        maxY = Math.max(na.y, nb.y);
      const isBridge =
        !alley &&
        minY < river.bottom &&
        maxY > river.top &&
        bridgeCols.has(Math.round((na.x - X(0)) / CELL_W));
      const hw = alley ? e.halfWidth : isBridge ? 22 : streetHW;
      const topPad = alley ? e.halfWidth : northPavement;
      const botPad = alley ? e.halfWidth : southPavement;
      openRectsAll.push({
        left: na.x - hw,
        right: na.x + hw,
        top: minY - topPad,
        bottom: maxY + botPad,
        alley,
        edge: e,
      });
    }
  }

  // 2. Outer map-edge road stubs so edge streets reach map bounds cleanly (needed for edge ambulance spawns & tests).
  for (const node of roadNodes) {
    const inc = roadAdj.get(node.id);
    const hasWide = inc.some((x) => x.edge.class !== "alley");
    if (!hasWide) continue;
    if (node.col === 0) {
      openRectsAll.push({
        left: 0,
        right: node.x + streetHW,
        top: node.y - northPavement,
        bottom: node.y + southPavement,
        alley: false,
      });
    }
    if (node.col === cols - 1) {
      openRectsAll.push({
        left: node.x - streetHW,
        right: width,
        top: node.y - northPavement,
        bottom: node.y + southPavement,
        alley: false,
      });
    }
    if (node.row === 0) {
      const hasVertical = inc.some((x) => x.edge.class !== "alley" && Math.abs(roadNodeById.get(x.to).x - node.x) < 1);
      if (hasVertical)
        openRectsAll.push({
          left: node.x - streetHW,
          right: node.x + streetHW,
          top: 0,
          bottom: node.y + southPavement,
          alley: false,
        });
    }
    if (node.row === rows - 1) {
      const hasVertical = inc.some((x) => x.edge.class !== "alley" && Math.abs(roadNodeById.get(x.to).x - node.x) < 1);
      if (hasVertical)
        openRectsAll.push({
          left: node.x - streetHW,
          right: node.x + streetHW,
          top: node.y - northPavement,
          bottom: height,
          alley: false,
        });
    }
  }

  // 3. Riverside walkable quay promenades (north bank, south bank, and island quays connecting moorings to streets).
  if (!singleBandCanal) {
    // North quay promenade along row canalRow between road and river.top (foot-walkable & kerb-safe).
    openRectsAll.push({
      left: 0,
      right: width,
      top: Y(canalRow) + 14,
      bottom: river.top - 1,
      alley: false,
      quay: true,
    });
    // South quay promenade along row riverSouthRow between river.bottom and south road.
    openRectsAll.push({
      left: 0,
      right: width,
      top: river.bottom + 1,
      bottom: Y(riverSouthRow) - 14,
      alley: false,
      quay: true,
    });
    // Island quay promenades & cross-island walkway at mooring cols.
    for (const isl of islands) {
      // Walkable south quay apron and north quay apron connected to the island central street.
      openRectsAll.push({
        left: isl.left + 8,
        right: isl.right - 8,
        top: isl.top + 2,
        bottom: isl.bottom - 2,
        alley: false,
        quay: true,
      });
    }
  } else {
    // Single-band legacy canal: quay shoulders outside water (y <= riverTop or y >= riverBottom) along canalRow & canalRow+1.
    openRectsAll.push({
      left: 0,
      right: width,
      top: Y(canalRow) + 14,
      bottom: riverTop,
      alley: false,
      quay: true,
    });
    openRectsAll.push({
      left: 0,
      right: width,
      top: riverBottom,
      bottom: Y(canalRow + 1) - 14,
      alley: false,
      quay: true,
    });
  }

  // 4. Roundabouts list.
  const roundaboutsAll = roadNodes
    .filter((n) => n.kind === "roundabout")
    .map((n) => ({ id: n.id, col: n.col, row: n.row, x: n.x, y: n.y, radius: n.radius, outerRadius: n.outerRadius }));

  // 5. Monument solid polygons (Tour de Fer uses its 4 corner piers so roads pass beneath it!).
  const solidPolysAll = [];
  for (const m of normalizedMonuments) {
    const polys = m.piers ? m.piers : m.footprint ? [m.footprint] : [];
    for (const poly of polys) solidPolysAll.push({ poly, bounds: polyBounds(poly), monument: m });
  }

  // 6. Index per cell for fast O(1) collision & rendering lookups.
  const cells = new Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = X(col),
        cy = Y(row);
      const node = roadNodeById.get(`c${col}r${row}`) || null;
      const inc = node ? roadAdj.get(node.id) : [];
      const wideArms = { n: false, s: false, e: false, w: false };
      const allArms = { n: null, s: null, e: null, w: null };
      for (const { to, edge } of inc) {
        const other = roadNodeById.get(to);
        const dx = other.x - node.x,
          dy = other.y - node.y;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "e" : "w") : dy > 0 ? "s" : "n";
        allArms[dir] = edge.class;
        if (edge.class !== "alley") wideArms[dir] = true;
      }
      // Boundary stubs count as wide arms when the edge node has wide roads.
      const hasWideRoad = !!(wideArms.n || wideArms.s || wideArms.e || wideArms.w);
      if (hasWideRoad) {
        if (col === 0) wideArms.w = true;
        if (col === cols - 1) wideArms.e = true;
        if (row === 0 && (wideArms.s || allArms.s)) wideArms.n = true;
        if (row === rows - 1 && (wideArms.n || allArms.n)) wideArms.s = true;
      }

      const island = islands.find((isl) => cx >= isl.left && cx <= isl.right && cy >= isl.top && cy <= isl.bottom) || null;
      const openRects = openRectsAll.filter((r) => rectOverlapsCell(r, col, row, 32));
      const roundabouts = roundaboutsAll.filter(
        (rb) => Math.abs(rb.x - cx) <= CELL_W / 2 + rb.outerRadius + 24 && Math.abs(rb.y - cy) <= CELL_H / 2 + rb.outerRadius + 24,
      );
      const solidPolys = solidPolysAll
        .filter((s) => rectOverlapsCell(s.bounds, col, row, 28))
        .map((s) => s.poly);
      const ringPiers = (ring?.piers || []).filter((p) => rectOverlapsCell(p, col, row, 24));
      const edges = roadEdges.filter((e) => {
        const na = roadNodeById.get(e.a),
          nb = roadNodeById.get(e.b);
        return rectOverlapsCell(
          {
            left: Math.min(na.x, nb.x) - e.halfWidth,
            right: Math.max(na.x, nb.x) + e.halfWidth,
            top: Math.min(na.y, nb.y) - e.halfWidth,
            bottom: Math.max(na.y, nb.y) + e.halfWidth,
          },
          col,
          row,
          16,
        );
      });

      cells[row * cols + col] = {
        col,
        row,
        node,
        hasWideRoad,
        wideArms,
        allArms,
        isRiverRow: riverRow !== null && row === riverRow,
        isIsland: !!island,
        island,
        hasBridge: bridgeCols.has(col),
        openRects,
        roundabouts,
        solidPolys,
        ringPiers,
        edges,
      };
    }
  }

  layout.cellMeta = (col, row) => {
    const c = Math.max(0, Math.min(cols - 1, col));
    const r = Math.max(0, Math.min(rows - 1, row));
    return cells[r * cols + c];
  };
  layout.roadNodeAt = (col, row) => roadNodeById.get(`c${col}r${row}`) || null;

  return layout;
}

export function trainPosition(line, width, seconds) {
  const carLength = 51,
    gap = 0.6,
    count = 3,
    length = count * (carLength + gap);
  return { head: (seconds * line.speed + line.phase) % (width + length + 36), carLength, gap, count };
}
