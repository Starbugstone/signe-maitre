(() => {
  // src/world/layout.js
  var CELL_W = 290;
  var CELL_H = 228;
  var X = (col) => 75 + col * CELL_W;
  var Y = (row) => 72 + row * CELL_H;
  var defaultPalettes = /* @__PURE__ */ new Set(["market", "garage", "docks", "square"]);
  var ROAD_HALF_WIDTH = {
    avenue: 25,
    street: 25,
    alley: 7
  };
  var ALLEY_MAX_VEHICLE_HALF_WIDTH = 3.6;
  function roundaboutOuterRadius(radius) {
    if (radius >= 21) return 54;
    if (radius >= 17) return 46;
    return 42;
  }
  function buildRingLoop({ left: left2, right, top: top2, bottom, cornerR = 36, cornerSteps = 8 }) {
    const pts = [];
    const addArc = (cx, cy, startA, endA) => {
      for (let i = 0; i <= cornerSteps; i++) {
        const a = startA + (endA - startA) * i / cornerSteps;
        pts.push({ x: +(cx + Math.cos(a) * cornerR).toFixed(2), y: +(cy + Math.sin(a) * cornerR).toFixed(2) });
      }
    };
    addArc(right - cornerR, top2 + cornerR, -Math.PI / 2, 0);
    addArc(right - cornerR, bottom - cornerR, 0, Math.PI / 2);
    addArc(left2 + cornerR, bottom - cornerR, Math.PI / 2, Math.PI);
    addArc(left2 + cornerR, top2 + cornerR, Math.PI, 3 * Math.PI / 2);
    pts.push({ x: pts[0].x, y: pts[0].y });
    let length = 0;
    for (let i = 0; i < pts.length - 1; i++)
      length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    return { points: pts, length };
  }
  function projectOnRing(points, target2) {
    let bestDist = Infinity, bestS = 0, bestPt = points[0], acc = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const t2 = Math.max(0, Math.min(1, ((target2.x - a.x) * dx + (target2.y - a.y) * dy) / (len * len)));
      const px = a.x + dx * t2, py = a.y + dy * t2;
      const d = Math.hypot(target2.x - px, target2.y - py);
      if (d < bestDist) {
        bestDist = d;
        bestS = acc + len * t2;
        bestPt = { x: +px.toFixed(2), y: +py.toFixed(2) };
      }
      acc += len;
    }
    return { s: +bestS.toFixed(2), stop: bestPt, dist: bestDist };
  }
  function makeDefaultRoads(cols, rows2, canalRow2, riverSouthRow, bridgeCols) {
    const nodes = [];
    const byCoord = /* @__PURE__ */ new Map();
    const addNode = (col, row, kind = "cross") => {
      const id = `c${col}r${row}`;
      const node = { id, col, row, x: X(col), y: Y(row), kind };
      nodes.push(node);
      byCoord.set(id, node);
      return node;
    };
    const hasRiverRow = riverSouthRow === canalRow2 + 2;
    for (let r = 0; r < rows2; r++) {
      if (hasRiverRow && r === canalRow2 + 1) continue;
      for (let c = 0; c < cols; c++) addNode(c, r);
    }
    const edges = [];
    const addEdge = (a, b, cls = "street") => edges.push({ a, b, class: cls, halfWidth: ROAD_HALF_WIDTH[cls] });
    for (let r = 0; r < rows2; r++) {
      if (hasRiverRow && r === canalRow2 + 1) continue;
      for (let c = 0; c < cols - 1; c++) addEdge(`c${c}r${r}`, `c${c + 1}r${r}`, "street");
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows2 - 1; r++) {
        if (hasRiverRow && r === canalRow2) {
          if (bridgeCols.has(c)) addEdge(`c${c}r${r}`, `c${c}r${r + 2}`, "street");
          continue;
        }
        if (hasRiverRow && r === canalRow2 + 1) continue;
        if (!hasRiverRow && r === canalRow2 && !bridgeCols.has(c)) continue;
        addEdge(`c${c}r${r}`, `c${c}r${r + 1}`, "street");
      }
    }
    return { nodes, edges };
  }
  function makeRiver({ top: top2, bottom, islands = [], bridges = [], piers = [], centreline = [], moorings = [], width: width2 }) {
    function onWater(x, y, r = 0) {
      if (x - r < 0 || x + r > width2) return false;
      if (y - r < top2 || y + r > bottom) return false;
      for (const pier of piers)
        if (x + r > pier.left && x - r < pier.right && y + r > pier.top && y - r < pier.bottom) return false;
      for (const isl of islands) {
        if (x + r < isl.left || x - r > isl.right || y + r < isl.top || y - r > isl.bottom) continue;
        const middle = (isl.top + isl.bottom) / 2;
        const bevel = (isl.prow || 0) * Math.abs(y - middle) / (middle - isl.top);
        if (y >= isl.top && y <= isl.bottom && x >= isl.left + bevel && x <= isl.right - bevel) return false;
        if (!r) continue;
        const prow = isl.prow || 0;
        const points = [
          [isl.left + prow, isl.top],
          [isl.right - prow, isl.top],
          [isl.right, middle],
          [isl.right - prow, isl.bottom],
          [isl.left + prow, isl.bottom],
          [isl.left, middle]
        ];
        for (let i = 0; i < points.length; i++) {
          const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
          const dx = bx - ax, dy = by - ay;
          const t2 = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
          if ((x - ax - t2 * dx) ** 2 + (y - ay - t2 * dy) ** 2 < r * r) return false;
        }
      }
      return true;
    }
    return { top: top2, bottom, islands, bridges, piers, centreline, moorings, onWater };
  }
  function rectOverlapsCell(rect2, col, row, pad = 28) {
    const cx = X(col), cy = Y(row);
    return rect2.right >= cx - CELL_W / 2 - pad && rect2.left <= cx + CELL_W / 2 + pad && rect2.bottom >= cy - CELL_H / 2 - pad && rect2.top <= cy + CELL_H / 2 + pad;
  }
  function polyBounds(poly) {
    let left2 = Infinity, right = -Infinity, top2 = Infinity, bottom = -Infinity;
    for (const [x, y] of poly) {
      if (x < left2) left2 = x;
      if (x > right) right = x;
      if (y < top2) top2 = y;
      if (y > bottom) bottom = y;
    }
    return { left: left2, right, top: top2, bottom };
  }
  function buildTown({
    blocks: blocks2,
    cellKinds: cellKinds2,
    canalRow: canalRow2,
    river: riverSpec,
    roads: roadsSpec,
    ring: ringSpec,
    monuments: monuments2 = [],
    solids: solids2 = [],
    bridgeDeck,
    parks: parks2 = [],
    railways = [],
    addresses = [],
    interiors = [],
    palettes = defaultPalettes,
    buildPiers
  }) {
    const rows2 = blocks2.length, cols = blocks2[0]?.length ?? 0;
    if (rows2 < 2 || cols < 2 || blocks2.some((row) => row.length !== cols || row.some((key) => !palettes.has(key))))
      throw new Error("Town needs a rectangular grid of registered street paintings");
    if (!Number.isInteger(canalRow2) || canalRow2 < 0 || canalRow2 + 1 >= rows2)
      throw new Error("Canal needs two banks");
    const width2 = X(cols - 1) + 75, height2 = Y(rows2 - 1) + 72;
    const singleBandCanal = !riverSpec;
    const riverSouthRow = singleBandCanal ? canalRow2 + 1 : riverSpec.southRow ?? canalRow2 + 2;
    const riverRow = singleBandCanal ? null : riverSpec.riverRow ?? canalRow2 + 1;
    const riverTop2 = singleBandCanal ? Y(canalRow2) + 16 + (CELL_H - 31) * 0.13 : riverSpec.top;
    const riverBottom2 = singleBandCanal ? Y(canalRow2) + 16 + (CELL_H - 31) * 0.86 : riverSpec.bottom;
    const bridgeList = singleBandCanal ? Array.from({ length: cols }, (_, col) => ({ col, x: X(col), halfWidth: 22, clearance: true })) : riverSpec.bridges.map((b) => ({
      col: b.col,
      x: b.x ?? X(b.col),
      halfWidth: b.halfWidth ?? 22,
      clearance: b.clearance !== false
    }));
    const bridgeCols = new Set(bridgeList.map((b) => b.col));
    const islands = singleBandCanal ? [] : (riverSpec.islands || []).map((i) => ({ ...i }));
    const centreline = !singleBandCanal && riverSpec.centreline?.length ? riverSpec.centreline.map((pt) => ({ x: pt.x, y: pt.y })) : [
      { x: 0, y: (riverTop2 + riverBottom2) / 2 },
      { x: width2, y: (riverTop2 + riverBottom2) / 2 }
    ];
    const moorings = (riverSpec?.moorings || []).map((m) => ({
      id: m.id,
      x: m.x,
      y: m.y,
      a: m.a ?? 0,
      quay: { x: m.quay.x, y: m.quay.y }
    }));
    const river3 = makeRiver({
      top: riverTop2,
      bottom: riverBottom2,
      islands,
      piers: singleBandCanal ? [] : (riverSpec.piers || []).map((pier) => ({ ...pier })),
      bridges: bridgeList,
      centreline,
      moorings,
      width: width2
    });
    const rawRoads = roadsSpec || makeDefaultRoads(cols, rows2, canalRow2, riverSouthRow, bridgeCols);
    const roadNodeById = /* @__PURE__ */ new Map();
    const roadNodes = rawRoads.nodes.map((n) => {
      const node = {
        id: n.id,
        col: n.col,
        row: n.row,
        x: n.x ?? X(n.col),
        y: n.y ?? Y(n.row),
        kind: n.kind || "cross",
        ...n.radius ? { radius: n.radius, outerRadius: n.outerRadius ?? roundaboutOuterRadius(n.radius) } : {}
      };
      if (roadNodeById.has(node.id)) throw new Error("Duplicate road node: " + node.id);
      roadNodeById.set(node.id, node);
      return node;
    });
    const roadAdj = new Map(roadNodes.map((n) => [n.id, []]));
    const roadEdges = rawRoads.edges.map((e) => {
      const na = roadNodeById.get(e.a), nb = roadNodeById.get(e.b);
      if (!na || !nb) throw new Error(`Road edge references missing node: ${e.a} -> ${e.b}`);
      const cls = e.class || "street";
      const halfWidth = e.halfWidth ?? ROAD_HALF_WIDTH[cls];
      const edge = {
        a: e.a,
        b: e.b,
        class: cls,
        halfWidth,
        ...e.oneWay ? { oneWay: e.oneWay } : {},
        ...e.seam ? { seam: true } : {},
        ...e.bridge ? { bridge: true } : {}
      };
      const length = Math.hypot(nb.x - na.x, nb.y - na.y);
      roadAdj.get(e.a).push({ to: e.b, edge, length, dir: "a>b" });
      roadAdj.get(e.b).push({ to: e.a, edge, length, dir: "b>a" });
      return edge;
    });
    for (const node of roadNodes) {
      if (node.kind === "roundabout") continue;
      const deg = roadAdj.get(node.id).length;
      if (deg <= 1) node.kind = "end";
      else if (deg === 2 || deg === 3) node.kind = "tee";
      else node.kind = "cross";
    }
    const roads = { nodes: roadNodes, edges: roadEdges };
    let ring2 = null;
    if (ringSpec) {
      const loop2 = ringSpec.points?.length ? { points: ringSpec.points, length: ringSpec.length } : buildRingLoop(ringSpec);
      const stations = (ringSpec.stations || []).map((st) => {
        const proj = projectOnRing(loop2.points, st.stop);
        return {
          id: st.id,
          name: { fr: st.name.fr, en: st.name.en },
          s: st.s ?? proj.s,
          stop: proj.stop,
          street: { x: st.street.x, y: st.street.y }
        };
      });
      stations.sort((a, b) => a.s - b.s);
      ring2 = {
        points: loop2.points,
        length: +loop2.length.toFixed(2),
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
        piers: []
      };
    } else if (rows2 >= 4 && cols >= 4) {
      const railScaleY2 = (CELL_H / 2 - 16.8) / 429;
      const pierDepth2 = -CELL_H / 2 + 378 * railScaleY2;
      const geom = {
        northRow: 1,
        southRow: rows2 - 1,
        minCol: 1,
        maxCol: cols - 2,
        left: (X(0) + X(1)) / 2,
        right: (X(cols - 2) + X(cols - 1)) / 2,
        top: Y(1) + pierDepth2,
        bottom: Y(rows2 - 1) + pierDepth2,
        cornerR: 36
      };
      const loop2 = buildRingLoop(geom);
      ring2 = { ...geom, points: loop2.points, length: +loop2.length.toFixed(2), deckLift: 40, stations: [], piers: [] };
    }
    const lines = /* @__PURE__ */ new Map();
    for (const line2 of railways) {
      if (!Number.isInteger(line2.row) || line2.row < 0 || line2.row >= rows2 || line2.row === canalRow2 + 1 || lines.has(line2.row))
        throw new Error("Invalid or overlapping viaduct row " + line2.row);
      if (line2.from !== "west" || line2.to !== "east")
        throw new Error("A through line must reach both town boundaries");
      if (!(line2.speed > 0) || !Number.isFinite(line2.phase)) throw new Error("Invalid train timetable");
      lines.set(line2.row, line2);
    }
    const viaductRows = new Set(lines.keys());
    if (ring2) {
      if (ring2.northRow != null) viaductRows.add(ring2.northRow);
      if (ring2.southRow != null) viaductRows.add(ring2.southRow);
    }
    for (const [j, row] of blocks2.entries()) {
      if (row.includes("market") && j !== riverRow && !viaductRows.has(j))
        throw new Error("Market painting has an unconnected viaduct in row " + j);
    }
    const jobs2 = addresses.map(({ col, row, dx, dy, ...address }) => {
      if (!Number.isInteger(col) || !Number.isInteger(row) || !blocks2[row]?.[col])
        throw new Error("Address outside town: " + address.id);
      return { ...address, col, row, name: address.id, x: X(col) + dx, y: Y(row) + dy };
    });
    const byId = new Map(jobs2.map((job) => [job.id, job]));
    if (jobs2.length !== byId.size) throw new Error("Duplicate address");
    const rooms = /* @__PURE__ */ new Map();
    for (const room of interiors) {
      if (!byId.has(room.door) || rooms.has(room.door))
        throw new Error("Interior needs a unique street door: " + room.door);
      const f = room.floor;
      if (!f || !(room.width > 0 && room.height > 0 && f.left >= 0 && f.right <= room.width && f.left < f.right && f.top >= 0 && f.bottom <= room.height && f.top < f.bottom))
        throw new Error("Invalid room floor");
      for (const point of [room.entry, room.exit, room.desk])
        if (!point || !(point.x >= f.left && point.x <= f.right && point.y >= f.top && point.y <= f.bottom))
          throw new Error("Unreachable room anchor: " + room.door);
      rooms.set(room.door, room);
    }
    function cellAt(x, y) {
      return {
        col: Math.max(0, Math.min(cols - 1, Math.round((x - X(0)) / CELL_W))),
        row: Math.max(0, Math.min(rows2 - 1, Math.round((y - Y(0)) / CELL_H)))
      };
    }
    function visibleCells(x, y, w, h, pad = 0) {
      const a = cellAt(x - pad, y - pad), b = cellAt(x + w + pad, y + h + pad);
      return { firstCol: a.col, lastCol: b.col, firstRow: a.row, lastRow: b.row };
    }
    const normalizedMonuments = monuments2.map((m) => ({
      id: m.id,
      name: { fr: m.name.fr, en: m.name.en },
      col: m.col,
      row: m.row,
      x: m.x ?? X(m.col),
      y: m.y ?? Y(m.row),
      footprint: m.footprint,
      ...m.passUnder ? { passUnder: true } : {},
      ...m.piers ? { piers: m.piers } : {},
      ...m.style ? { style: m.style } : {}
    }));
    const layout = {
      blocks: blocks2,
      cellKinds: cellKinds2 || blocks2,
      rows: rows2,
      cols,
      width: width2,
      height: height2,
      lines,
      byId,
      jobs: jobs2,
      rooms,
      cellAt,
      visibleCells,
      canalRow: canalRow2,
      riverRow,
      riverSouthRow,
      singleBandCanal,
      roads,
      roadNodeById,
      roadAdj,
      river: river3,
      ring: ring2,
      monuments: normalizedMonuments,
      parks: parks2,
      roadsX: Array.from({ length: cols }, (_, i) => X(i)),
      roadsY: Array.from({ length: rows2 }, (_, i) => Y(i))
    };
    if (ring2 && buildPiers) ring2.piers = buildPiers(layout);
    const openRectsAll = [];
    const northPavement = 28, southPavement = 23, streetHW = 25;
    for (const e of roadEdges) {
      const na = roadNodeById.get(e.a), nb = roadNodeById.get(e.b);
      const alley = e.class === "alley";
      const horiz = Math.abs(na.y - nb.y) < 1;
      if (horiz) {
        const minX = Math.min(na.x, nb.x), maxX = Math.max(na.x, nb.x);
        const pad = alley ? e.halfWidth : streetHW;
        openRectsAll.push({
          left: minX - pad,
          right: maxX + pad,
          top: na.y - (alley ? e.halfWidth : northPavement),
          bottom: na.y + (alley ? e.halfWidth : southPavement),
          alley,
          edge: e
        });
      } else {
        const minY = Math.min(na.y, nb.y), maxY = Math.max(na.y, nb.y);
        const isBridge = !alley && minY < river3.bottom && maxY > river3.top && bridgeCols.has(Math.round((na.x - X(0)) / CELL_W));
        const hw = alley ? e.halfWidth : isBridge ? bridgeDeck?.(Math.round((na.x - X(0)) / CELL_W)) ?? 22 : streetHW;
        const topPad = alley ? e.halfWidth : northPavement;
        const botPad = alley ? e.halfWidth : southPavement;
        openRectsAll.push({
          left: na.x - hw,
          right: na.x + hw,
          top: minY - topPad,
          bottom: maxY + botPad,
          alley,
          edge: e
        });
      }
    }
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
          alley: false
        });
      }
      if (node.col === cols - 1) {
        openRectsAll.push({
          left: node.x - streetHW,
          right: width2,
          top: node.y - northPavement,
          bottom: node.y + southPavement,
          alley: false
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
            alley: false
          });
      }
      if (node.row === rows2 - 1) {
        const hasVertical = inc.some((x) => x.edge.class !== "alley" && Math.abs(roadNodeById.get(x.to).x - node.x) < 1);
        if (hasVertical)
          openRectsAll.push({
            left: node.x - streetHW,
            right: node.x + streetHW,
            top: node.y - northPavement,
            bottom: height2,
            alley: false
          });
      }
    }
    if (!singleBandCanal) {
      openRectsAll.push({
        left: 0,
        right: width2,
        top: Y(canalRow2) + 14,
        bottom: river3.top - 1,
        alley: false,
        quay: true
      });
      openRectsAll.push({
        left: 0,
        right: width2,
        top: river3.bottom + 1,
        bottom: Y(riverSouthRow) - 14,
        alley: false,
        quay: true
      });
      for (const isl of islands) {
        openRectsAll.push({
          left: isl.left + (isl.prow ?? 8),
          right: isl.right - (isl.prow ?? 8),
          top: isl.top + 2,
          bottom: isl.bottom - 2,
          alley: false,
          quay: true
        });
      }
    } else {
      openRectsAll.push({
        left: 0,
        right: width2,
        top: Y(canalRow2) + 14,
        bottom: riverTop2,
        alley: false,
        quay: true
      });
      openRectsAll.push({
        left: 0,
        right: width2,
        top: riverBottom2,
        bottom: Y(canalRow2 + 1) - 14,
        alley: false,
        quay: true
      });
    }
    const roundaboutsAll = roadNodes.filter((n) => n.kind === "roundabout").map((n) => ({ id: n.id, col: n.col, row: n.row, x: n.x, y: n.y, radius: n.radius, outerRadius: n.outerRadius }));
    const solidPolysAll = [];
    for (const m of normalizedMonuments) {
      const polys = m.piers ? m.piers : m.footprint ? [m.footprint] : [];
      for (const poly of polys) solidPolysAll.push({ poly, bounds: polyBounds(poly), monument: m });
    }
    for (const poly of solids2) solidPolysAll.push({ poly, bounds: polyBounds(poly) });
    const cells = new Array(rows2 * cols);
    for (let row = 0; row < rows2; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = X(col), cy = Y(row);
        const node = roadNodeById.get(`c${col}r${row}`) || null;
        const inc = node ? roadAdj.get(node.id) : [];
        const wideArms = { n: false, s: false, e: false, w: false };
        const allArms = { n: null, s: null, e: null, w: null };
        for (const { to, edge } of inc) {
          const other = roadNodeById.get(to);
          const dx = other.x - node.x, dy = other.y - node.y;
          const dir = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "e" : "w" : dy > 0 ? "s" : "n";
          allArms[dir] = edge.class;
          if (edge.class !== "alley") wideArms[dir] = true;
        }
        const hasWideRoad = !!(wideArms.n || wideArms.s || wideArms.e || wideArms.w);
        if (hasWideRoad) {
          if (col === 0) wideArms.w = true;
          if (col === cols - 1) wideArms.e = true;
          if (row === 0 && (wideArms.s || allArms.s)) wideArms.n = true;
          if (row === rows2 - 1 && (wideArms.n || allArms.n)) wideArms.s = true;
        }
        const island2 = islands.find((isl) => cx >= isl.left && cx <= isl.right && cy >= isl.top && cy <= isl.bottom) || null;
        const openRects = openRectsAll.filter((r) => rectOverlapsCell(r, col, row, 32));
        const roundabouts = roundaboutsAll.filter(
          (rb) => Math.abs(rb.x - cx) <= CELL_W / 2 + rb.outerRadius + 24 && Math.abs(rb.y - cy) <= CELL_H / 2 + rb.outerRadius + 24
        );
        const solidPolys = solidPolysAll.filter((s) => rectOverlapsCell(s.bounds, col, row, 28)).map((s) => s.poly);
        const ringPiers = (ring2?.piers || []).filter((p2) => rectOverlapsCell(p2, col, row, 24));
        const edges = roadEdges.filter((e) => {
          const na = roadNodeById.get(e.a), nb = roadNodeById.get(e.b);
          return rectOverlapsCell(
            {
              left: Math.min(na.x, nb.x) - e.halfWidth,
              right: Math.max(na.x, nb.x) + e.halfWidth,
              top: Math.min(na.y, nb.y) - e.halfWidth,
              bottom: Math.max(na.y, nb.y) + e.halfWidth
            },
            col,
            row,
            16
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
          isIsland: !!island2,
          island: island2,
          hasBridge: bridgeCols.has(col),
          openRects,
          roundabouts,
          solidPolys,
          ringPiers,
          edges
        };
      }
    }
    layout.cellMeta = (col, row) => {
      const c = Math.max(0, Math.min(cols - 1, col));
      const r = Math.max(0, Math.min(rows2 - 1, row));
      return cells[r * cols + c];
    };
    layout.roadNodeAt = (col, row) => roadNodeById.get(`c${col}r${row}`) || null;
    return layout;
  }

  // src/world/paintings.js
  var kerbX = 17.6;
  var kerbY = 16.8;
  var ringFoot = 378 * (CELL_H / 2 - kerbY) / 429 - CELL_H / 2;
  var ringDeck = ringFoot - 40;
  var riverPlate = { top: -211, height: 422.2, approach: 10, source: [1500, 2130] };
  function mapper(source, target2) {
    return (v) => {
      let i = source.findIndex((stop, k) => k > 0 && v <= stop) - 1;
      if (i < 0) i = source.length - 2;
      return target2[i] + (target2[i + 1] - target2[i]) * (v - source[i]) / (source[i + 1] - source[i]);
    };
  }
  var xTargets = [-CELL_W / 2, -kerbX, 0, kerbX, CELL_W / 2];
  var yTargets = [-CELL_H / 2, -kerbY, 0, kerbY, CELL_H / 2];
  var kerbs = {
    haussmann: [[660, 749, 838], [426, 498, 569]],
    haussmannCafe: [[660, 750, 840], [426, 497, 568]],
    boulevard: [[660, 749, 838], [427, 498, 569]],
    starArch: [[668, 752, 836], [430, 501, 572]],
    obeliskSquare: [[670, 751, 831], [431, 501, 570]],
    towerBase: [[656, 750, 843], [430, 498, 566]],
    opera: [[661, 750, 840], [426, 497, 568]],
    basilica: [[660, 750, 839], [426, 498, 569]],
    palaisJustice: [[660, 750, 840], [426, 496, 566]],
    park: [[661, 750, 840], [426, 498, 569]],
    marketHall: [[660, 750, 839], [425, 497, 569]],
    teeNorth: [[660, 750, 839], [426, 498, 569]],
    ringNorth: [[668, 753, 838], [430, 500, 570]],
    ringCornerNE: [[667, 752, 838], [430, 500, 571]],
    ringCornerNW: [[668, 753, 838], [429, 501, 573]],
    ringStationNorth: [[668, 753, 838], [430, 500, 570]]
  };
  kerbs.rondPoint = kerbs.obeliskSquare;
  function fromSource(key, { ring: ring2 = false } = {}) {
    const [xs, ys] = kerbs[key];
    const x = mapper([0, ...xs, 1500], xTargets);
    const y = ring2 ? mapper([0, 182, 378, ...ys, 1e3], [-CELL_H / 2, ringDeck, ringFoot, ...yTargets.slice(1)]) : mapper([0, ...ys, 1e3], yTargets);
    return { x, y, point: ([px, py]) => [x(px), y(py)] };
  }
  var lantern = [
    [0, 0.03],
    [0.06, 0.05],
    [0.1, 0.2],
    [0.16, 0.21],
    [0.4, 0.14],
    [0.45, 0.07],
    [0.5, 0.05],
    [0.74, 0.05],
    [0.8, 0.09],
    [0.92, 0.1],
    [0.96, 0.15],
    [1, 0.16]
  ];
  var turned = (axis2, shapes) => [...shapes, ...shapes.map((shape2) => shape2.map(([x, y]) => [2 * axis2 - x, y]).reverse())];
  var bankLamps = (...xs) => xs.map((x) => [x, 1925, 2046]);
  var KIOSK = [[172, 1215], [190, 1190], [250, 1140], [256, 1140], [318, 1190], [338, 1215], [338, 1240], [310, 1240], [310, 1292], [195, 1292], [195, 1240], [172, 1240]];
  var riverMarks = {
    river: { lamps: bankLamps(150, 750, 1350) },
    riverBridge: {
      kerbs: [667, 753, 839],
      deck: [592, 912],
      walk: 29,
      lamps: [
        ...[452, 946, 1440].flatMap((foot2) => [[569, foot2 - 127, foot2], [935, foot2 - 127, foot2]]),
        [569, 1852, 1982],
        [935, 1852, 1982],
        ...bankLamps(152, 1347)
      ],
      // The north abutment, three piers at their waterline and the two south turrets. A pier's
      // bastion stands a storey above its base: a boat north of the base passes behind it.
      // The boxes sit inside the rounded bases, clear of the published river centreline.
      piers: [[515, 60, 990, 270], [465, 610, 1040, 705], [465, 1105, 1040, 1200], [470, 1585, 1035, 1684], [512, 1928, 993, 2010]],
      over: {
        keyed: turned(752, [
          [[290, 0], [290, 58], [300, 88], [350, 100], [400, 125], [440, 155], [475, 190], [500, 225], [515, 262], [518, 280], [600, 280], [600, 0]],
          [[600, 402], [520, 402], [470, 418], [445, 450], [433, 500], [435, 560], [448, 600], [452, 667], [600, 667]],
          [[600, 897], [520, 897], [470, 913], [445, 945], [433, 995], [435, 1055], [448, 1095], [452, 1162], [600, 1162]],
          [[600, 1378], [520, 1378], [470, 1394], [445, 1428], [433, 1475], [435, 1537], [452, 1580], [462, 1610], [488, 1660], [528, 1718], [566, 1762], [592, 1790], [600, 1794]],
          [[510, 1928], [600, 1922], [600, 2012], [510, 2012]]
        ])
      }
    },
    riverIronBridge: {
      kerbs: [664, 753, 841],
      deck: [607, 897],
      walk: 19.5,
      lamps: [[152, 1925, 2046], [430, 1890, 2052], [1072, 1890, 2052], [1347, 1925, 2046]],
      // Lanterns on brackets over the roadway: [x, top, bottom of the glass, bracket].
      hanging: [362, 740, 1120, 1497, 1872].flatMap((y) => [[652, y - 47, y + 44, y + 54], [852, y - 47, y + 44, y + 54]]),
      over: {
        // The arched ribs and their pierced spandrels, either side of the deck.
        keyed: turned(752, [
          [
            [607, 20],
            [590, 60],
            [560, 150],
            [520, 270],
            [480, 400],
            [455, 520],
            [440, 650],
            [428, 800],
            [424, 950],
            [424, 1150],
            [430, 1300],
            [445, 1420],
            [470, 1500],
            [500, 1640],
            [530, 1780],
            [560, 1900],
            [585, 1990],
            [607, 2020]
          ]
        ])
      }
    },
    islandWest: {
      kerbs: [666, 753, 839],
      deck: [635, 870],
      walk: 18.4,
      lamps: [
        ...[376, 605, 966, 1320].map((x) => [x, 605, 668]),
        ...[376, 605, 968, 1324].map((x) => [x, 1350, 1408]),
        [430, 925, 1012],
        [564, 925, 1012],
        [430, 1045, 1126],
        [565, 1045, 1126],
        [915, 714, 775],
        [1411, 714, 775],
        [916, 837, 912],
        [1410, 839, 912],
        [911, 1160, 1225],
        [1416, 1160, 1225],
        [919, 1279, 1345],
        [1410, 1279, 1345],
        ...bankLamps(152, 1347)
      ],
      solids: [
        // The two pavilion gardens behind their railings.
        [895, 722, 1430, 915],
        [895, 1162, 1430, 1345],
        // The bronze on its plinth in a ring of box, and the beds of the west garden.
        [[417, 1040], [440, 998], [497, 980], [554, 998], [577, 1040], [554, 1084], [497, 1100], [440, 1084]],
        [[470, 785], [590, 785], [590, 930], [540, 935], [500, 880], [465, 850]],
        [[590, 1140], [590, 1285], [505, 1285], [500, 1230], [540, 1180]],
        [[330, 915], [400, 905], [405, 950], [345, 1e3], [322, 985]],
        [[325, 1085], [345, 1070], [405, 1120], [400, 1150], [330, 1140]]
      ],
      trees: [[381, 890, 800, 80, 85], [400, 1315, 1215, 86, 88]],
      tall: [{ outline: [[478, 872], [500, 865], [512, 900], [520, 1e3], [525, 1040], [470, 1040], [474, 1e3], [482, 900]], foot: 1045 }],
      island: [[190, 1037], [233, 900], [267, 785], [296, 691], [311, 639], [316, 628], [1500, 628], [1500, 1445], [320, 1445], [309, 1410], [277, 1310], [236, 1180]]
    },
    islandCathedral: {
      lamps: [
        [65, 822, 912],
        [271, 862, 938],
        [1237, 862, 938],
        [1469, 822, 912],
        [472, 1148, 1200],
        [679, 1148, 1200],
        [825, 1148, 1200],
        [1034, 1148, 1200],
        [110, 1300, 1352],
        [625, 1300, 1352],
        [1250, 1300, 1352],
        ...bankLamps(150, 750, 1350)
      ],
      // Notre-Dame-du-Port from the north quay wall to its portals.
      cathedral: [150, 628, 1345, 882],
      solids: [
        [60, 720, 150, 800],
        [1345, 720, 1440, 800],
        // South of the street: two kiosks and the fountain garden behind its railings.
        [195, 1200, 310, 1292],
        [1199, 1200, 1314, 1292],
        [440, 1195, 1075, 1305]
      ],
      trees: [
        [85, 715, 650, 62, 62],
        [1415, 715, 650, 62, 62],
        [152, 925, 835, 78, 48],
        [1371, 931, 842, 78, 48],
        [140, 1242, 1180, 60, 40],
        [375, 1242, 1180, 60, 40],
        [575, 1232, 1175, 60, 40],
        [930, 1232, 1175, 60, 40],
        [1130, 1242, 1180, 60, 40],
        [1360, 1242, 1180, 60, 40]
      ],
      tall: [1, 1005].map((east) => ({ outline: KIOSK.map(([x, y]) => [x + east - 1, y]), foot: 1292 })),
      island: [[0, 628], [1500, 628], [1500, 1445], [0, 1445]],
      over: {
        // Notre-Dame-du-Port's roofs, towers and spire rise over the north channel; so do the trees at its ends.
        keyed: [
          [
            [165, 620],
            [170, 560],
            [190, 520],
            [225, 525],
            [232, 545],
            [480, 545],
            [480, 462],
            [645, 462],
            [645, 545],
            [700, 545],
            [704, 490],
            [722, 470],
            [742, 338],
            [758, 338],
            [778, 470],
            [797, 490],
            [800, 545],
            [855, 545],
            [855, 462],
            [1018, 462],
            [1018, 545],
            [1195, 545],
            [1200, 510],
            [1215, 512],
            [1222, 545],
            [1290, 575],
            [1330, 612],
            [1340, 620]
          ],
          [[25, 620], [30, 595], [70, 582], [120, 590], [150, 620]],
          [[1350, 620], [1360, 592], [1410, 582], [1460, 590], [1480, 620]]
        ]
      }
    },
    islandEast: {
      kerbs: [667, 753, 839],
      deck: [635, 870],
      walk: 18.4,
      lamps: [
        ...[92, 336, 610, 907, 1128].map((x) => [x, 630, 693]),
        ...[84, 336, 610, 903, 1128].map((x) => [x, 1350, 1410]),
        [56, 887, 937],
        [644, 887, 937],
        [647, 1144, 1200],
        [866, 906, 944],
        [862, 1150, 1200],
        [1194, 731, 781],
        [1254, 919, 969],
        [1256, 1100, 1144],
        ...bankLamps(152, 1347)
      ],
      solids: [
        // The courts with their chapel behind, the south block, and the walled garden at the point.
        [60, 700, 628, 905],
        [385, 628, 528, 700],
        [44, 1150, 628, 1335],
        [[880, 720], [1175, 720], [1200, 800], [1270, 1040], [1200, 1290], [1175, 1330], [880, 1330]]
      ],
      trees: [[106, 925, 850, 60, 50], [581, 931, 860, 62, 50]],
      island: [[0, 630], [1181, 630], [1197, 691], [1227, 785], [1262, 900], [1310, 1049], [1260, 1180], [1219, 1310], [1185, 1410], [1180, 1445], [0, 1445]],
      over: {
        // The courts' chapel spire.
        keyed: [[[395, 650], [400, 600], [415, 590], [430, 520], [441, 458], [447, 458], [458, 520], [472, 585], [500, 590], [530, 640], [535, 650]]]
      }
    }
  };
  var riverY = (py) => riverPlate.top + riverPlate.approach + py * (riverPlate.height - riverPlate.approach) / riverPlate.source[1];
  function fromRiver(key) {
    const road = riverMarks[key].kerbs;
    const x = road ? mapper([0, ...road, 1500], xTargets) : mapper([0, 1500], [-CELL_W / 2, CELL_W / 2]);
    return { x, y: riverY, point: ([px, py]) => [x(px), riverY(py)] };
  }
  var ellipse = (cx, cy, rx, ry, steps = 14) => Array.from({ length: steps }, (_, i) => {
    const a = i * 2 * Math.PI / steps;
    return [+(cx + Math.cos(a) * rx).toFixed(2), +(cy + Math.sin(a) * ry).toFixed(2)];
  });
  var rectangle = (left2, top2, right, bottom) => [
    [left2, top2],
    [right, top2],
    [right, bottom],
    [left2, bottom]
  ];
  var marketPiers = [88, 406, 602, 898, 1259, 1469];
  var paintings = {
    market: { arms: "nesw", legacy: true, viaduct: { market: true, piers: marketPiers } },
    garage: { arms: "nesw", legacy: true },
    docks: { arms: "nesw", legacy: true },
    square: { arms: "nesw", legacy: true },
    haussmann: { arms: "nesw" },
    haussmannCafe: { arms: "nesw" },
    boulevard: { arms: "nesw" },
    marketHall: { arms: "nesw" },
    park: { arms: "nesw", garden: true },
    teeNorth: { arms: "esw" },
    opera: { arms: "nesw" },
    basilica: { arms: "nesw" },
    palaisJustice: { arms: "nesw" },
    towerBase: { arms: "nesw" },
    starArch: { arms: "nesw", roundabout: true },
    obeliskSquare: { arms: "nesw", roundabout: true },
    rondPoint: { arms: "nesw", roundabout: true },
    alleyCross: { arms: "", alleys: "nesw" },
    ringNorth: { arms: "nesw", viaduct: { source: "ringNorth", piers: [89, 412, 609, 897, 1256, 1470] } },
    ringNorthB: {
      arms: "nesw",
      viaduct: { source: "ringCornerNE", east: "ringCornerNW", piers: [95, 411, 613], eastPiers: [879, 1250, 1470] }
    },
    ringStation: { arms: "nesw", viaduct: { source: "ringNorth", piers: [89, 412, 609, 897, 1470], station: true } },
    ringStationB: {
      arms: "nesw",
      viaduct: { source: "ringCornerNE", east: "ringCornerNW", piers: [95, 411, 613], eastPiers: [879, 1470], station: true }
    },
    river: { river: true },
    riverBridge: { river: true, bridge: true },
    riverIronBridge: { river: true, bridge: true },
    islandWest: { river: true, bridge: true },
    islandCathedral: { river: true },
    islandEast: { river: true, bridge: true }
  };
  {
    const m = fromSource("starArch");
    const arch = [
      [683, 368],
      [690, 332],
      [715, 324],
      [785, 324],
      [810, 332],
      [817, 368],
      [817, 440],
      [811, 533],
      [770, 533],
      [770, 470],
      [766, 445],
      [750, 427],
      [734, 445],
      [729, 470],
      [729, 533],
      [689, 533],
      [683, 440]
    ].map(m.point);
    paintings.starArch.tall = [{ outline: arch, foot: m.y(533) }];
    paintings.starArch.island = ellipse(m.x(750), m.y(500), 19.2, 21.5);
    paintings.starArch.solids = [
      rectangle(m.x(689), m.y(505), m.x(729), m.y(533)),
      rectangle(m.x(770), m.y(505), m.x(811), m.y(533))
    ];
  }
  {
    const m = fromSource("obeliskSquare");
    const obelisk = [
      [750, 254],
      [759, 279],
      [763, 452],
      [789, 470],
      [789, 528],
      [711, 528],
      [711, 470],
      [737, 452],
      [740, 279]
    ].map(m.point);
    paintings.obeliskSquare.tall = [{ outline: obelisk, foot: m.y(528) }];
    paintings.obeliskSquare.island = ellipse(m.x(750), m.y(499), 17, 19);
    const standard = [
      [750, 318],
      [776, 330],
      [780, 372],
      [760, 384],
      [756, 452],
      [789, 470],
      [789, 528],
      [711, 528],
      [711, 470],
      [744, 452],
      [740, 384],
      [720, 372],
      [724, 330]
    ].map(m.point);
    paintings.rondPoint.tall = [{ outline: standard, foot: m.y(528) }];
    paintings.rondPoint.island = paintings.obeliskSquare.island;
  }
  {
    const m = fromSource("towerBase");
    paintings.towerBase.gardens = [
      [[400, 432], [400, 300], [378, 285], [376, 215], [398, 182], [452, 176], [486, 196], [500, 255], [655, 255], [655, 432]],
      [
        [845, 432],
        [845, 255],
        [880, 255],
        [880, 140],
        [930, 100],
        [990, 120],
        [1010, 200],
        [1040, 150],
        [1075, 125],
        [1110, 150],
        [1112, 300],
        [1100, 432]
      ]
    ].map((polygon) => polygon.map(m.point));
    paintings.towerBase.solids = [
      rectangle(m.x(416), m.y(326), m.x(634), m.y(418)),
      rectangle(m.x(868), m.y(326), m.x(1090), m.y(418))
    ];
    paintings.towerBase.legs = [m.x(390), m.x(1110)];
  }
  {
    const [, sourceHeight] = riverPlate.source;
    for (const [key, mark] of Object.entries(riverMarks)) {
      const m = fromRiver(key), painting = paintings[key];
      const box2 = ([x0, y0, x1, y1]) => rectangle(m.x(x0), m.y(y0), m.x(x1), m.y(y1));
      const shape2 = (s) => typeof s[0] === "number" ? box2(s) : s.map(m.point);
      painting.walk = mark.walk;
      painting.piers = (mark.piers || []).map(([x0, y0, x1, y1]) => ({ left: m.x(x0), top: m.y(y0), right: m.x(x1), bottom: m.y(y1) }));
      const spans = (from, to) => (mark.deck ? [[from, mark.deck[0]], [mark.deck[1], to]] : [[from, to]]).filter(([a, b]) => b > a);
      const walls = spans(0, 1500).map(([a, b]) => box2([a, 40, b, 86]));
      if (mark.island) {
        const wall = mark.island.filter(([, y]) => y > 1400).map(([x]) => x);
        walls.push(...spans(Math.min(...wall), Math.max(...wall)).map(([a, b]) => box2([a, 1425, b, 1452])));
      }
      painting.solids = [...walls, ...(mark.solids || []).map(shape2)];
      const trees = (mark.trees || []).map(([x, foot2, cy, rx, ry]) => ({
        outline: [
          ...ellipse(x, cy, rx, ry, 16).filter(([, py]) => py < cy + ry * 0.85),
          [x - 10, foot2],
          [x + 10, foot2]
        ].sort((a, b) => Math.atan2(a[1] - cy, a[0] - x) - Math.atan2(b[1] - cy, b[0] - x)),
        foot: foot2,
        trunk: [x, foot2]
      }));
      painting.solids.push(...trees.map(({ trunk: [x, foot2] }) => box2([x - 12, foot2 - 14, x + 12, foot2])));
      painting.tall = [...trees, ...mark.tall || []].map(({ outline, foot: foot2 }) => ({ outline: outline.map(m.point), foot: m.y(foot2) }));
      for (const [x, top2, bottom, bracket] of mark.hanging || [])
        painting.tall.push({
          outline: [[x - 10, top2], [x + 10, top2], [x + 24, top2 + 20], [x + 20, bottom], [x - 20, bottom], [x - 24, top2 + 20]].map(m.point),
          foot: m.y(bracket)
        });
      if (mark.island) painting.quayWall = mark.island.map(m.point);
      if (mark.cathedral) {
        painting.cathedral = box2(mark.cathedral);
        painting.solids.push(painting.cathedral);
      }
      if (sourceHeight !== 2130) throw new Error("River marks are measured on 2130-row paintings");
    }
  }
  var kerbLamps = { a: [291, 397], b: [590, 694], c: [837, 953], d: [145, 245] };
  var lampRow = (rows2, west = 600, east = 900) => [...rows2].flatMap((row) => {
    const [top2, foot2] = kerbLamps[row];
    const shift = row === "d" ? 28 : 0;
    return [west + shift, east - shift].filter((x) => x != null && !Number.isNaN(x)).map((x) => [x, top2, foot2]);
  });
  for (const key of ["haussmann", "haussmannCafe", "marketHall", "park", "opera", "basilica"]) paintings[key].lamps = lampRow("abcd");
  paintings.boulevard.lamps = [...lampRow("bcd"), [600, 291, 397]];
  paintings.palaisJustice.lamps = [...lampRow("bcd"), [900, 291, 397]];
  paintings.towerBase.lamps = [...lampRow("bcd"), [611, 258, 338], [887, 258, 338]];
  paintings.teeNorth.lamps = [...lampRow("bc"), [556, 290, 412], [1106, 290, 412]];
  paintings.starArch.lamps = [
    [637, 4, 110],
    [866, 4, 110],
    [597, 132, 250],
    [906, 132, 250],
    [506, 598, 712],
    [997, 598, 712],
    [585, 748, 866],
    [917, 748, 866],
    [450, 222, 376],
    [1050, 262, 390],
    [394, 870, 990],
    [1104, 870, 990]
  ];
  paintings.obeliskSquare.lamps = [[627, 30, 194], [877, 30, 194], [597, 725, 882], [900, 725, 882], [441, 272, 410], [1030, 272, 410]];
  paintings.rondPoint.lamps = paintings.obeliskSquare.lamps;
  {
    const west = [[640, 54, 152], [550, 338, 424], [626, 600, 714]], east = [[865, 54, 154], [946, 342, 424], [874, 600, 712]];
    const cornerWest = [[639, 50, 152], [550, 338, 424], [626, 604, 714]], cornerEast = [[866, 55, 152], [946, 348, 422], [881, 611, 712]];
    paintings.ringNorth.lamps = [...west, ...east];
    paintings.ringStation.lamps = [...west, east[2]];
    Object.assign(paintings.ringNorthB, { lamps: cornerWest, eastLamps: cornerEast });
    Object.assign(paintings.ringStationB, { lamps: cornerWest, eastLamps: [cornerEast[2]] });
  }
  paintings.basilica.forecourt = { w: 100 };
  var paintingKeys = Object.keys(paintings);

  // src/world/street-props.js
  var kerbX2 = 17.6;
  var kerbY2 = 16.8;
  var plateRegistration = {
    market: [
      [667, 749, 841],
      [429, 500, 559]
    ],
    garage: [
      [668, 750, 838],
      [430, 503, 575]
    ],
    docks: [
      [667, 751, 842],
      [429, 499, 573]
    ],
    square: [
      [669, 749, 840],
      [429, 499, 572]
    ]
  };
  var fixtures = {
    garage: {
      lamps: [[383, 96, 222], [516, 138, 222], [382, 350, 428], [521, 349, 428], [372, 489, 575], [528, 489, 575]],
      bollards: [[246, 20, 28, 62, 144, 310, 364, 533, 575, 727, 814, 880]]
    },
    market: {
      lamps: [[379, 29, 91], [521, 29, 91], [324, 199, 249], [571, 208, 249], [370, 354, 423], [527, 354, 423]],
      bollards: [[249, 18, 15, 85, 271, 367, 533, 640, 710, 877], [374, 24, 345, 555], [524, 24, 379], [580, 25, 346, 520]]
    },
    docks: {
      lamps: [[384, 21, 90], [516, 21, 90], [375, 152, 230], [525, 152, 230], [375, 342, 420], [525, 342, 420]],
      bollards: [[250, 19, 92, 165, 335, 566, 646, 724, 861], [370, 20, 349, 555], [584, 22, 370, 531]]
    },
    square: {
      lamps: [[377, 81, 148], [524, 81, 148], [361, 169, 239], [540, 169, 239], [359, 348, 416], [540, 348, 416], [361, 497, 572], [541, 497, 572]],
      bollards: [
        [251, 14, 58, 100, 144, 189, 290, 332, 570, 604, 652, 692, 750, 801, 844, 880],
        [240, 15, 382, 518],
        [214, 17, 386, 513],
        [357, 14, 327, 569],
        [392, 19, 384, 516],
        [425, 18, 384, 516],
        [514, 18, 385, 515],
        [576, 18, 385, 515]
      ]
    }
  };
  function register(pixel, source, target2) {
    const end = source.findIndex((stop, i2) => i2 > 0 && pixel <= stop);
    const i = end < 0 ? source.length - 2 : end - 1;
    return target2[i] + (target2[i + 1] - target2[i]) * (pixel - source[i]) / (source[i + 1] - source[i]);
  }
  function makeProps(key, mapX, mapY, lamps, bollards) {
    function prop(x, top2, bottom, widths) {
      const height2 = bottom - top2;
      const right = widths.map(([f, w]) => [mapX(x + w), mapY(top2 + height2 * f)]);
      const left2 = widths.map(([f, w]) => [mapX(x - w), mapY(top2 + height2 * f)]).reverse();
      return {
        key,
        x: mapX(x),
        y: mapY(bottom),
        radius: (right.at(-1)[0] - left2[0][0]) / 2,
        outline: [...right, ...left2]
      };
    }
    return [
      ...lamps.map(
        ([x, top2, foot2]) => prop(x, top2, foot2, [
          [0, 0.6],
          [0.045, 2],
          [0.08, 3],
          [0.12, 6],
          [0.16, 5],
          [0.26, 3.8],
          [0.3, 1.8],
          [0.34, 1.1],
          [0.75, 1.5],
          [0.85, 2.5],
          [0.96, 3.2],
          [1, 4.1]
        ])
      ),
      ...bollards.flatMap(
        ([foot2, h, ...xs]) => xs.map(
          (x) => prop(x, foot2 - h, foot2, [
            [0, 0.7],
            [0.08, 1.6],
            [0.22, 1.8],
            [0.32, 1],
            [0.78, 1.2],
            [0.9, 1.8],
            [1, 2.3]
          ])
        )
      )
    ];
  }
  var props = {};
  function buildPlateProps(key, kerbs2, spec = { lamps: [], bollards: [] }) {
    const [xs, ys] = kerbs2;
    props[key] = makeProps(
      key,
      (x) => register(x / 0.6, [0, ...xs, 1500], [-CELL_W / 2, -kerbX2, 0, kerbX2, CELL_W / 2]),
      (y) => register(y / 0.6, [0, ...ys, 1e3], [-CELL_H / 2, -kerbY2, 0, kerbY2, CELL_H / 2]),
      spec.lamps || [],
      spec.bollards || []
    );
  }
  for (const [key, spec] of Object.entries(fixtures)) buildPlateProps(key, plateRegistration[key], spec);
  function lanternProp(key, map2, [x, top2, foot2]) {
    const h = foot2 - top2;
    const right = lantern.map(([f, w]) => map2.point([x + w * h, top2 + f * h])), left2 = lantern.map(([f, w]) => map2.point([x - w * h, top2 + f * h])).reverse();
    return {
      key,
      x: map2.x(x),
      y: map2.y(foot2),
      radius: Math.min(1.8, (right.at(-1)[0] - left2[0][0]) / 2),
      outline: [...right, ...left2],
      painted: true
    };
  }
  for (const [key, painting] of Object.entries(paintings)) {
    const items = (painting.tall || []).map(({ outline, foot: foot2 }) => {
      const xs = outline.map((p2) => p2[0]);
      return { key, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: foot2, radius: 0, outline, tall: true };
    });
    if (painting.river) {
      for (const lamp of riverMarks[key].lamps || []) items.push(lanternProp(key, fromRiver(key), lamp));
    } else if (painting.lamps) {
      const { source = key, east } = painting.viaduct || {}, ring2 = !!painting.viaduct;
      for (const lamp of painting.lamps) items.push(lanternProp(key, fromSource(source, { ring: ring2 }), lamp));
      for (const lamp of painting.eastLamps || []) items.push(lanternProp(key, fromSource(east, { ring: ring2 }), lamp));
    }
    if (items.length) props[key] = items;
  }
  var canalHeight = CELL_H - 31 + 5;
  props.canal = makeProps(
    "canal",
    (x) => register(x * 1536 / 900, [0, 700, 769, 834, 1536], [-145, -13, 0, 13, 145]),
    (y) => 16 + register(
      y * 1536 / 900,
      [10, 65, 389, 456, 467],
      [0, 27, canalHeight - 28, canalHeight - 4, canalHeight]
    ),
    [
      [368, 172, 232],
      [532, 172, 232],
      [44, 206, 260],
      [249, 206, 260],
      [653, 206, 260],
      [854, 206, 260]
    ],
    [
      [251, 15, 291, 608, 816],
      [260, 12, 64, 204, 888]
    ]
  );
  function nearPoly(x, y, poly, pad) {
    if (!poly?.length) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      const dx = xj - xi, dy = yj - yi, len2 = dx * dx + dy * dy;
      const t2 = len2 > 0 ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len2)) : 0;
      if (Math.hypot(x - (xi + dx * t2), y - (yi + dy * t2)) < pad) return true;
    }
    return inside;
  }
  var byLayout = /* @__PURE__ */ new WeakMap();
  function streetProps(layout, col, row) {
    if (!byLayout.has(layout)) byLayout.set(layout, /* @__PURE__ */ new Map());
    const cache = byLayout.get(layout), id = row * layout.cols + col;
    if (cache.has(id)) return cache.get(id);
    const key = layout.cellKinds?.[row]?.[col] ?? layout.blocks[row][col];
    const result = [];
    const cx = X(col), cy = Y(row);
    const meta = layout.cellMeta?.(col, row);
    const river3 = layout.river;
    const riverKey = layout.cellKinds?.[layout.riverRow]?.[col];
    if (paintings[riverKey]?.river && Math.abs(row - layout.riverRow) <= 1)
      for (const item of props[riverKey] || []) {
        const wy = Y(layout.riverRow) + item.y;
        if (layout.cellAt(cx, wy).row !== row) continue;
        const boarding = item.radius && river3.moorings.some((m) => Math.hypot(cx + item.x - m.quay.x, wy - m.quay.y) < 9);
        result.push({ x: cx + item.x, y: wy, item: boarding ? { ...item, radius: 0 } : item });
      }
    if (meta?.isRiverRow) {
      cache.set(id, result);
      return result;
    }
    const cellProps = props[key] || [];
    if (meta && !meta.hasWideRoad) {
      cache.set(id, result);
      return result;
    }
    const keepProp = (wx, wy, item) => {
      if (item.tall) return true;
      if (item.painted && river3 && (row === layout.canalRow && item.y > kerbY2 || row === layout.riverSouthRow && item.y < -kerbY2))
        return false;
      if (river3) {
        if (row === layout.canalRow && item.y > 26) return false;
        if (row === layout.riverSouthRow && item.y < -11) return false;
        if (wy > river3.top - 3 && wy < river3.bottom + 3 && !meta?.isIsland) return false;
        if (meta?.isIsland) {
          const isl = meta.island;
          if (wx < isl.left + 8 || wx > isl.right - 8 || wy < isl.top + 8 || wy > isl.bottom - 8) return false;
        }
      }
      if (meta) {
        if (item.x < -28 && !meta.wideArms.w) return false;
        if (item.x > 28 && !meta.wideArms.e) return false;
        if (item.y < -30 && !meta.wideArms.n) return false;
        if (item.y > 26 && !meta.wideArms.s) return false;
        for (const rb of meta.roundabouts)
          if (Math.hypot(wx - rb.x, wy - rb.y) < rb.outerRadius + 4) return false;
        for (const poly of meta.solidPolys) if (nearPoly(wx, wy, poly, 4)) return false;
        for (const rect2 of meta.openRects)
          if (rect2.alley && wx >= rect2.left - 3 && wx <= rect2.right + 3 && wy >= rect2.top - 3 && wy <= rect2.bottom + 3)
            return false;
      }
      if (layout.ring?.stations) {
        for (const st of layout.ring.stations)
          if (Math.hypot(wx - st.street.x, wy - st.street.y) < 11) return false;
      }
      if (river3?.moorings) {
        for (const m of river3.moorings)
          if (Math.hypot(wx - m.quay.x, wy - m.quay.y) < 11) return false;
      }
      if (layout.jobs) {
        for (const job of layout.jobs)
          if (Math.abs(wx - job.x) < 5 && wy >= job.y - 2 && wy <= Y(job.row) && item.radius < 2.2) return false;
      }
      if (layout.monuments) {
        for (const m of layout.monuments)
          if (m.passUnder && m.col === col && m.row === row && Math.hypot(wx - m.x, wy - m.y) < 52) return false;
      }
      return true;
    };
    for (const item of cellProps) {
      const wx = cx + item.x, wy = cy + item.y;
      if (keepProp(wx, wy, item)) result.push({ x: wx, y: wy, item });
    }
    if (layout.singleBandCanal && (row === layout.canalRow || row === layout.canalRow + 1)) {
      for (const item of props.canal) {
        const y = Y(layout.canalRow) + item.y;
        if (layout.cellAt(cx, y).row === row) result.push({ x: cx + item.x, y, item });
      }
    }
    cache.set(id, result);
    return result;
  }

  // src/world/viaduct.js
  var railScaleY = (CELL_H / 2 - kerbY2) / 429;
  var railTop = 161;
  var deckBottom = 236;
  var foot = 378;
  var bayWidth = CELL_W / 5;
  var marketPiers2 = [88, 406, 602, 898, 1259, 1469];
  var pierDepth = -CELL_H / 2 + foot * railScaleY;
  var pierThickness = 3.5;
  function marketColumnX(pixel) {
    const [left2, centre, right] = plateRegistration.market[0];
    if (pixel <= left2) return -CELL_W / 2 + pixel * (CELL_W / 2 - kerbX2) / left2;
    if (pixel <= centre) return (pixel - centre) * kerbX2 / (centre - left2);
    if (pixel <= right) return (pixel - centre) * kerbX2 / (right - centre);
    return kerbX2 + (pixel - right) * (CELL_W / 2 - kerbX2) / (1500 - right);
  }
  var laneSide = CELL_W / 2 - 3.5;
  var clearLane = ([west, east]) => [west, Math.min(east, laneSide)];
  var marketBases = marketPiers2.map((x) => clearLane([marketColumnX(x - 21), marketColumnX(x + 21)]));
  var spanBases = Array.from({ length: 6 }, (_, i) => {
    const x = (i - 2.5) * bayWidth;
    return [Math.max(-CELL_W / 2, x - 20 * bayWidth / 296), Math.min(CELL_W / 2, x + 22 * bayWidth / 296)];
  });
  function joinedSection(westExtension, eastExtension) {
    return {
      westExtension,
      eastExtension,
      bases: spanBases.slice(westExtension ? 1 : 0, eastExtension ? -1 : void 0)
    };
  }
  var lastMarketPier = CELL_W / 2 - marketColumnX(marketPiers2.at(-1));
  var firstMarketPier = CELL_W / 2 + marketColumnX(marketPiers2[0]);
  var sections = [
    [joinedSection(0, 0), joinedSection(0, firstMarketPier)],
    [joinedSection(lastMarketPier, 0), joinedSection(lastMarketPier, firstMarketPier)]
  ];
  var marketSection = { bases: marketBases };
  var paintedSections = /* @__PURE__ */ new Map();
  function paintedSection(key) {
    if (!paintedSections.has(key)) {
      const { source, east, piers, eastPiers = [] } = paintings[key].viaduct;
      const west = fromSource(source, { ring: true }).x, far = east ? fromSource(east, { ring: true }).x : west;
      paintedSections.set(key, {
        bases: [...piers.map((x) => [west(x - 21), west(x + 21)]), ...eastPiers.map((x) => [far(x - 21), far(x + 21)])].map(
          clearLane
        )
      });
    }
    return paintedSections.get(key);
  }
  var cellKey = (layout, row, col) => layout.cellKinds?.[row]?.[col] ?? layout.blocks[row][col];
  var paintedViaduct = (layout, row, col) => paintings[cellKey(layout, row, col)]?.viaduct;
  function viaductSection(layout, row, col) {
    const viaduct = paintedViaduct(layout, row, col);
    if (viaduct?.market) return marketSection;
    if (viaduct) return paintedSection(cellKey(layout, row, col));
    const minCol = layout.ring?.minCol ?? 0;
    const maxCol = layout.ring?.maxCol ?? layout.cols - 1;
    const westViaduct = col > minCol && !!paintedViaduct(layout, row, col - 1);
    const eastViaduct = col < maxCol && !!paintedViaduct(layout, row, col + 1);
    return sections[Number(westViaduct)][Number(eastViaduct)];
  }
  var sideSupports = {
    west: { dx: 24, feet: [-28.4, 18.5], half: 4.5 },
    east: { dx: [-9.1, 9.4], feet: [24], half: 3.4 }
  };
  var cornerSupports = [
    // North corners: the back of the north pavement beside the cross street, then the south
    // pavement of the street the curve crosses.
    { quadrant: 0, at: 15, kind: "column", onLeg: true },
    { quadrant: 0, at: 50.4, kind: "portal", shift: 0 },
    { quadrant: 3, at: 15, kind: "column", onLeg: true },
    { quadrant: 3, at: 50.4, kind: "portal", shift: 0 },
    // South corners: the back of the south leg's pavement, then the garage forecourt (west)
    // or yard (east) the curve sweeps over.
    { quadrant: 1, at: 15, kind: "column", onLeg: true },
    { quadrant: 1, at: 45, kind: "portal", shift: 0 },
    { quadrant: 2, at: 15, kind: "column", onLeg: true },
    { quadrant: 2, at: 45, kind: "portal", shift: 0 }
  ];
  var cornerSupportFeet = {
    column: { dx: [0], half: 4 },
    portal: { dx: [-9.1, 9.4], half: 3.4 }
  };
  function cornerSupportAt(ring2, { quadrant, at: at2, onLeg = false, shift = 0 }) {
    const { left: left2, right, top: top2, bottom, cornerR: R } = ring2;
    const east = quadrant === 0 || quadrant === 1, north = quadrant === 0 || quadrant === 3;
    const cx = east ? right - R : left2 + R, cy = north ? top2 + R : bottom - R;
    const a = at2 * Math.PI / 180;
    return {
      x: cx + (east ? 1 : -1) * R * Math.sin(a),
      y: onLeg ? north ? top2 : bottom : cy + (north ? -1 : 1) * R * Math.cos(a) + shift
    };
  }
  function buildRingPiers(layout) {
    const ring2 = layout.ring;
    if (!ring2) return [];
    const piers = [];
    const { northRow, southRow, minCol, maxCol, left: left2, right, top: top2, bottom, cornerR = 36 } = ring2;
    const river3 = layout.river;
    for (const row of [northRow, southRow]) {
      if (row == null || row < 0 || row >= layout.rows) continue;
      const yFoot = Y(row) + pierDepth;
      for (let col = minCol; col <= maxCol; col++) {
        const section = viaductSection(layout, row, col);
        for (const [bLeft, bRight] of section.bases) {
          const x1 = X(col) + bLeft, x2 = X(col) + bRight;
          if (x1 < left2 + cornerR || x2 > right - cornerR) continue;
          if (Math.abs((x1 + x2) / 2 - X(col)) < 26) continue;
          piers.push({
            left: x1,
            right: x2,
            top: yFoot - pierThickness,
            bottom: yFoot,
            x: (x1 + x2) / 2,
            y: yFoot,
            orientation: "horizontal",
            row,
            col
          });
        }
      }
    }
    const station = (x, y) => (ring2.stations || []).some((st) => Math.hypot(x - st.street.x, y - st.street.y) < 9);
    for (const [side, vx] of [
      ["west", left2],
      ["east", right]
    ]) {
      const support = sideSupports[side];
      const west = Math.floor((vx - X(0)) / CELL_W);
      const crossStreet = (row) => !layout.roads || layout.roads.edges.some((e) => [e.a, e.b].sort().join() === [`c${west}r${row}`, `c${west + 1}r${row}`].sort().join());
      for (let row = northRow + 1; row < southRow; row++) {
        if (row === layout.riverRow || !crossStreet(row)) continue;
        for (const dy of support.feet)
          for (const dx of [support.dx].flat()) {
            const x = vx + dx, y = Y(row) + dy;
            if (y < top2 + cornerR || y > bottom - cornerR + 40 || station(x, y - 2)) continue;
            piers.push({
              left: x - support.half,
              right: x + support.half,
              top: y - 3.5,
              bottom: y,
              x,
              y,
              orientation: "vertical",
              side,
              row
            });
          }
      }
      if (river3)
        for (const y of [river3.top - 10, river3.bottom + 10])
          piers.push({
            left: vx - 3.6,
            right: vx + 3.6,
            top: y - 2.6,
            bottom: y + 2.6,
            x: vx,
            y,
            orientation: "vertical",
            side,
            abutment: true
          });
    }
    for (const support of cornerSupports) {
      const { x, y } = cornerSupportAt(ring2, support);
      const feet = cornerSupportFeet[support.kind];
      for (const dx of feet.dx)
        piers.push({
          left: x + dx - feet.half,
          right: x + dx + feet.half,
          top: y - 3.5,
          bottom: y,
          x: x + dx,
          y,
          orientation: "corner",
          kind: support.kind,
          quadrant: support.quadrant,
          centre: x
        });
    }
    return piers;
  }

  // src/world/town.js
  var TAU = 2 * Math.PI;
  var COLS = 16;
  var ROWS = 12;
  var CANAL_ROW = 6;
  var RIVER_ROW = 7;
  var RIVER_SOUTH_ROW = 8;
  var BRIDGE_COLS = [1, 3, 4, 6, 8, 10, 11, 12, 13, 14];
  var BRIDGE_SET = new Set(BRIDGE_COLS);
  var ROUNDABOUTS = /* @__PURE__ */ new Map([
    ["c3r3", { radius: 22, outerRadius: 54 }],
    // Étoile des Saisies (Arc des Saisies)
    ["c6r5", { radius: 18, outerRadius: 46 }],
    // Place de la Contrainte (Obelisk)
    ["c13r2", { radius: 15, outerRadius: 42 }],
    // Rond-Point du Timbre
    ["c10r10", { radius: 15, outerRadius: 42 }]
    // Place de la Rive-Sud
  ]);
  function octagon(cx, cy, rx, ry = rx) {
    return Array.from({ length: 8 }, (_, i) => {
      const a = i * TAU / 8 + Math.PI / 8;
      return [+(cx + Math.cos(a) * rx).toFixed(1), +(cy + Math.sin(a) * ry).toFixed(1)];
    });
  }
  function boxPoly(left2, top2, right, bottom) {
    return [
      [left2, top2],
      [right, top2],
      [right, bottom],
      [left2, bottom]
    ];
  }
  var blocks = [
    // 0    1         2         3         4         5         6         7         8         9         10        11        12        13        14        15
    ["square", "garage", "square", "square", "garage", "square", "square", "square", "square", "square", "garage", "square", "square", "garage", "square", "docks"],
    // r00 Butte du Créancier
    ["square", "garage", "market", "square", "market", "garage", "square", "market", "square", "market", "garage", "market", "square", "market", "garage", "square"],
    // r01 Petite Ceinture North
    ["garage", "square", "square", "square", "square", "garage", "square", "square", "square", "square", "square", "garage", "square", "square", "square", "garage"],
    // r02 Grands Boulevards North
    ["square", "garage", "square", "square", "square", "square", "square", "square", "garage", "square", "garage", "square", "garage", "square", "square", "garage"],
    // r03 Arc / Opéra / Parc NE
    ["garage", "square", "square", "garage", "square", "garage", "square", "square", "square", "garage", "square", "garage", "square", "square", "square", "docks"],
    // r04 Bourse / Vieux Marais
    ["square", "garage", "square", "square", "garage", "square", "square", "garage", "square", "garage", "square", "garage", "square", "square", "garage", "docks"],
    // r05 Contrainte / Étude / Marais
    ["docks", "square", "garage", "square", "square", "square", "square", "square", "square", "square", "square", "square", "square", "garage", "docks", "docks"],
    // r06 Quai Nord
    ["docks", "docks", "docks", "docks", "docks", "docks", "docks", "docks", "square", "square", "square", "docks", "docks", "docks", "docks", "docks"],
    // r07 la Ferre + Île (cols 8..10)
    ["docks", "garage", "square", "square", "square", "square", "square", "square", "square", "square", "square", "square", "garage", "docks", "docks", "docks"],
    // r08 Quai Sud / Tour de Fer
    ["docks", "garage", "square", "square", "square", "garage", "square", "square", "square", "garage", "square", "garage", "square", "docks", "garage", "docks"],
    // r09 Champ-de-Fer / Sénat / Latin
    ["garage", "square", "square", "square", "square", "square", "square", "square", "square", "square", "square", "square", "garage", "docks", "square", "docks"],
    // r10 Boulevard Rive Gauche
    ["docks", "garage", "market", "square", "market", "garage", "market", "square", "market", "garage", "square", "market", "docks", "market", "garage", "docks"]
    // r11 Petite Ceinture South
  ];
  var IRON_BRIDGES = /* @__PURE__ */ new Set([1, 6, 12]);
  var STATION_COLS = /* @__PURE__ */ new Set([3, 8, 12]);
  var cellKinds = blocks.map(
    (row, r) => row.map((key, c) => {
      if (r === RIVER_ROW) {
        if (c === 8) return "islandWest";
        if (c === 9) return "islandCathedral";
        if (c === 10) return "islandEast";
        if (!BRIDGE_SET.has(c)) return "river";
        return IRON_BRIDGES.has(c) ? "riverIronBridge" : "riverBridge";
      }
      if (c === 3 && r === 3) return "starArch";
      if (c === 6 && r === 5) return "obeliskSquare";
      if (ROUNDABOUTS.has(`c${c}r${r}`)) return "rondPoint";
      if (c === 3 && r === 8) return "towerBase";
      if (c === 7 && r === 3) return "opera";
      if (c === 8 && r === 0) return "basilica";
      if (c === 8 && r === 6) return "palaisJustice";
      if ((c === 3 || c === 4) && r === 9) return "park";
      if (c === 14 && (r === 3 || r === 4)) return "park";
      if (c === 7 && r === 9) return "park";
      if ((c === 10 || c === 11) && r === 4) return "alleyCross";
      if ((r === 1 || r === 11) && c >= 2 && c <= 13) {
        if (STATION_COLS.has(c)) return (c + r) % 2 ? "ringStationB" : "ringStation";
        if (key === "market") return "market";
        return (c + r) % 2 ? "ringNorthB" : "ringNorth";
      }
      if (["5,2", "12,10", "1,5", "12,5", "4,10", "7,10"].includes(`${c},${r}`)) return "teeNorth";
      if (c === 7 && r === 5) return "garage";
      if (c === 5 && r === 4) return "garage";
      if (c === 6 && r === 6) return "haussmann";
      if (c === 9 && r === 5) return "haussmannCafe";
      if (["4,4", "11,6", "6,9", "2,4", "13,8"].includes(`${c},${r}`)) return "marketHall";
      if (c >= 9 && c <= 12 && r >= 3 && r <= 5) return (c + r) % 2 ? "haussmannCafe" : "haussmann";
      if (r === 6 || r === 8 || r === 2 || r === 10 || c === 2 || c === 13)
        return (c * 3 + r) % 4 === 0 ? "haussmann" : (c + r * 2) % 5 === 0 ? "haussmannCafe" : "boulevard";
      if (key === "square") return (c + r) % 3 === 0 ? "haussmannCafe" : (c * 2 + r) % 5 === 0 ? "square" : "haussmann";
      return key;
    })
  );
  function buildParisRoads() {
    const nodes = [];
    const nodeIds = /* @__PURE__ */ new Set();
    const addNode = (col, row, extra = {}) => {
      const id = `c${col}r${row}`;
      const rb = ROUNDABOUTS.get(id);
      const node = {
        id,
        col,
        row,
        x: X(col),
        y: Y(row),
        kind: rb ? "roundabout" : "cross",
        ...rb ? { radius: rb.radius, outerRadius: rb.outerRadius } : {},
        ...extra
      };
      nodes.push(node);
      nodeIds.add(id);
      return node;
    };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r === RIVER_ROW && (c < 8 || c > 10)) continue;
        addNode(c, r);
      }
    }
    const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
    const omitted = /* @__PURE__ */ new Set([
      // Impasse de l'Ouest at (1, 4): connects only east to (2, 4).
      edgeKey("c0r4", "c1r4"),
      edgeKey("c1r3", "c1r4"),
      edgeKey("c1r4", "c1r5"),
      // Impasse du Parchemin at (12, 4) inside Marais: alley dead end off (11, 4).
      edgeKey("c12r3", "c12r4"),
      edgeKey("c12r4", "c12r5"),
      edgeKey("c12r4", "c13r4"),
      // Allée du Champ-de-Fer at (4, 9) inside SW park: dead end off (4, 8).
      edgeKey("c3r9", "c4r9"),
      edgeKey("c4r9", "c5r9"),
      edgeKey("c4r9", "c4r10"),
      // Impasse des Buttes at (14, 3) inside Parc des Buttes-Fiscales: dead end off (13, 3).
      edgeKey("c14r2", "c14r3"),
      edgeKey("c14r3", "c14r4"),
      edgeKey("c14r3", "c15r3"),
      // Cour du Sénat at (7, 9) inside Jardin du Sénat: dead end off (7, 8).
      edgeKey("c6r9", "c7r9"),
      edgeKey("c7r9", "c8r9"),
      edgeKey("c7r9", "c7r10"),
      // Additional T-junctions for natural Parisian street rhythm.
      edgeKey("c5r1", "c5r2"),
      edgeKey("c12r9", "c12r10"),
      // Island centre square (9, 7) has no N/S bridges (bridges are at col 8 and col 10).
      edgeKey("c9r6", "c9r7"),
      edgeKey("c9r7", "c9r8")
    ]);
    const alleyEdges = /* @__PURE__ */ new Set([
      // Le Vieux Marais (centre-east dense old quarter).
      edgeKey("c10r3", "c10r4"),
      edgeKey("c10r4", "c10r5"),
      edgeKey("c11r3", "c11r4"),
      edgeKey("c11r4", "c11r5"),
      edgeKey("c9r4", "c10r4"),
      edgeKey("c10r4", "c11r4"),
      edgeKey("c11r4", "c12r4"),
      edgeKey("c10r3", "c11r3"),
      edgeKey("c10r5", "c11r5"),
      // Quartier Latin (Rive Gauche old quarter).
      edgeKey("c9r8", "c9r9"),
      edgeKey("c9r9", "c10r9"),
      // Montmartre / Butte du Créancier narrow lanes flanking Sacré-Créancier.
      edgeKey("c7r0", "c8r0"),
      edgeKey("c8r0", "c9r0")
    ]);
    function edgeClass(c1, r1, c2, r2) {
      const k = edgeKey(`c${c1}r${r1}`, `c${c2}r${r2}`);
      if (alleyEdges.has(k)) return "alley";
      if (r1 === r2) {
        if (r1 === 6 || r1 === 8) return "avenue";
        if ((r1 === 2 || r1 === 10) && Math.min(c1, c2) >= 2 && Math.max(c1, c2) <= 13) return "avenue";
        if (r1 === 3 && Math.min(c1, c2) >= 1 && Math.max(c1, c2) <= 8) return "avenue";
        if (r1 === 5 && Math.min(c1, c2) >= 3 && Math.max(c1, c2) <= 8) return "avenue";
        return "street";
      }
      if (c1 === c2) {
        if ((c1 === 2 || c1 === 13) && Math.min(r1, r2) >= 2 && Math.max(r1, r2) <= 10) return "avenue";
        if (c1 === 3 && Math.min(r1, r2) >= 1 && Math.max(r1, r2) <= 11) return "avenue";
        if (c1 === 6 && Math.min(r1, r2) >= 1 && Math.max(r1, r2) <= 10) return "avenue";
        if (c1 === 8) return "avenue";
        if (c1 === 10 && Math.min(r1, r2) >= 2 && Math.max(r1, r2) <= 10) return "avenue";
        return "street";
      }
      return "street";
    }
    const edges = [];
    const pushEdge = (a, b, cls, extra = {}) => {
      if (omitted.has(edgeKey(a, b))) return;
      edges.push({ a, b, class: cls, halfWidth: ROAD_HALF_WIDTH[cls], ...extra });
    };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const a = `c${c}r${r}`, b = `c${c + 1}r${r}`;
        if (!nodeIds.has(a) || !nodeIds.has(b)) continue;
        pushEdge(a, b, edgeClass(c, r, c + 1, r));
      }
    }
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS - 1; r++) {
        if (r === CANAL_ROW) {
          if (!BRIDGE_SET.has(c)) continue;
          if (c >= 8 && c <= 10) {
            pushEdge(`c${c}r6`, `c${c}r7`, edgeClass(c, 6, c, 7), { bridge: true });
          } else {
            pushEdge(`c${c}r6`, `c${c}r8`, edgeClass(c, 6, c, 8), { bridge: true });
          }
          continue;
        }
        if (r === RIVER_ROW) {
          if (c >= 8 && c <= 10 && BRIDGE_SET.has(c)) {
            pushEdge(`c${c}r7`, `c${c}r8`, edgeClass(c, 7, c, 8), { bridge: true });
          }
          continue;
        }
        const a = `c${c}r${r}`, b = `c${c}r${r + 1}`;
        if (!nodeIds.has(a) || !nodeIds.has(b)) continue;
        pushEdge(a, b, edgeClass(c, r, c, r + 1));
      }
    }
    const seamAlleys = [
      { col: 9.5, rowA: 4, rowB: 5 },
      // Passage des Greffes (right next to Le Boum / Marais)
      { col: 10.5, rowA: 3, rowB: 4 },
      // Passage du Sceau (Marais heart)
      { col: 6.5, rowA: 0, rowB: 1 },
      // Passage de la Butte (Montmartre steps shortcut, clear of market west pier)
      { col: 9.5, rowA: 8, rowB: 9 }
      // Passage des Écoles (Quartier Latin)
    ];
    function splitHorizontalEdge(cLeft, row, midCol) {
      const a = `c${cLeft}r${row}`, b = `c${cLeft + 1}r${row}`;
      const midId = `c${midCol}r${row}`;
      if (!nodeIds.has(midId)) {
        nodes.push({ id: midId, col: midCol, row, x: X(midCol), y: Y(row), kind: "tee" });
        nodeIds.add(midId);
      }
      const idx = edges.findIndex((e) => e.a === a && e.b === b || e.a === b && e.b === a);
      if (idx >= 0) {
        const orig = edges[idx];
        edges.splice(
          idx,
          1,
          { a, b: midId, class: orig.class, halfWidth: orig.halfWidth },
          { a: midId, b, class: orig.class, halfWidth: orig.halfWidth }
        );
      }
      return midId;
    }
    for (const s of seamAlleys) {
      const cLeft = Math.floor(s.col);
      const topId = splitHorizontalEdge(cLeft, s.rowA, s.col);
      const botId = splitHorizontalEdge(cLeft, s.rowB, s.col);
      edges.push({ a: topId, b: botId, class: "alley", halfWidth: ROAD_HALF_WIDTH.alley, seam: true });
    }
    return { nodes, edges };
  }
  var riverTop = Y(CANAL_ROW) + 42;
  var riverBottom = Y(RIVER_SOUTH_ROW) - 42;
  var island = {
    left: X(8) - 108,
    // 2287
    right: X(10) + 108,
    // 3083
    top: Y(RIVER_ROW) - 78,
    // 1590
    bottom: Y(RIVER_ROW) + 78,
    // 1746
    prow: 24
  };
  var river = {
    riverRow: RIVER_ROW,
    southRow: RIVER_SOUTH_ROW,
    top: riverTop,
    bottom: riverBottom,
    islands: [island],
    bridges: BRIDGE_COLS.map((col) => ({ col, x: X(col), halfWidth: 22, clearance: true })),
    // Painted masonry in the water: abutments, pier bases and bank turrets of the stone bridges.
    piers: BRIDGE_COLS.flatMap(
      (col) => paintings[cellKinds[RIVER_ROW][col]].piers.map((pier) => ({
        left: X(col) + pier.left,
        right: X(col) + pier.right,
        top: Y(RIVER_ROW) + pier.top,
        bottom: Y(RIVER_ROW) + pier.bottom
      }))
    ),
    // Smooth west-to-east navigation centreline curving through the wide 108-unit south channel around Île de la Ferre.
    centreline: [
      { x: 0, y: Y(RIVER_ROW) },
      { x: 1960, y: Y(RIVER_ROW) },
      { x: 2150, y: 1756 },
      { x: 2300, y: 1800 },
      { x: 2685, y: 1800 },
      { x: 3070, y: 1800 },
      { x: 3220, y: 1756 },
      { x: 3410, y: Y(RIVER_ROW) },
      { x: X(COLS - 1) + 75, y: Y(RIVER_ROW) }
    ],
    // 6 moorings: berth on open water (onWater === true) right beside a walkable stone quay.
    moorings: [
      { id: "quai-ouest", x: X(1) + 90, y: riverTop + 14, a: 0, quay: { x: X(1) + 90, y: riverTop - 12 } },
      { id: "quai-contrainte", x: X(5), y: riverTop + 14, a: 0, quay: { x: X(5), y: riverTop - 12 } },
      { id: "quai-tour", x: X(2), y: riverBottom - 14, a: 0, quay: { x: X(2), y: riverBottom + 12 } },
      { id: "ile-parvis", x: X(9), y: island.bottom + 14, a: Math.PI, quay: { x: X(9), y: island.bottom - 12 } },
      { id: "quai-marais", x: X(12) + 118, y: riverTop + 14, a: 0, quay: { x: X(12) + 118, y: riverTop - 12 } },
      { id: "quai-docks", x: X(13) + 90, y: riverBottom - 14, a: Math.PI, quay: { x: X(13) + 90, y: riverBottom + 12 } }
    ]
  };
  var ringLeft = (X(0) + X(1)) / 2;
  var ringRight = (X(14) + X(15)) / 2;
  var ringTop = Y(1) + pierDepth;
  var ringBottom = Y(11) + pierDepth;
  var ring = {
    northRow: 1,
    southRow: 11,
    minCol: 1,
    maxCol: 14,
    left: ringLeft,
    right: ringRight,
    top: ringTop,
    bottom: ringBottom,
    // 18 m coaches need wide curves: a 150-unit (about 31 m) radius keeps each
    // carriage over the deck through the corner.
    cornerR: 150,
    cornerSteps: 24,
    deckLift: 40,
    stations: [
      {
        id: "porte-etoile",
        name: { fr: "Porte de l\u2019\xC9toile", en: "Star Gate" },
        stop: { x: X(3) + 88, y: ringTop },
        street: { x: X(3) + 88, y: Y(1) - 21 }
      },
      {
        id: "butte-creancier",
        name: { fr: "Butte-du-Cr\xE9ancier", en: "Creditor Hill" },
        stop: { x: X(8) + 88, y: ringTop },
        street: { x: X(8) + 88, y: Y(1) - 21 }
      },
      {
        id: "buttes-fiscales",
        name: { fr: "Buttes-Fiscales", en: "Tax Hills" },
        stop: { x: X(12) + 88, y: ringTop },
        street: { x: X(12) + 88, y: Y(1) - 21 }
      },
      {
        id: "viaduc-est",
        name: { fr: "Viaduc-Est", en: "East Viaduct" },
        stop: { x: ringRight, y: Y(4) - 18 },
        street: { x: ringRight - 22, y: Y(4) - 18 }
      },
      {
        id: "porte-docks",
        name: { fr: "Porte des Docks", en: "Docks Gate" },
        stop: { x: X(12) + 88, y: ringBottom },
        street: { x: X(12) + 88, y: Y(11) - 21 }
      },
      {
        id: "gare-sud",
        name: { fr: "Gare du Sud", en: "South Station" },
        stop: { x: X(8) + 88, y: ringBottom },
        street: { x: X(8) + 88, y: Y(11) - 21 }
      },
      {
        id: "champ-fer",
        name: { fr: "Champ-de-Fer", en: "Iron Field" },
        stop: { x: X(3) + 88, y: ringBottom },
        street: { x: X(3) + 88, y: Y(11) - 21 }
      },
      {
        id: "viaduc-ouest",
        name: { fr: "Viaduc-Ouest", en: "West Viaduct" },
        stop: { x: ringLeft, y: Y(5) - 18 },
        street: { x: ringLeft + 22, y: Y(5) - 18 }
      }
    ]
  };
  var at = (col, row, polygon) => polygon.map(([x, y]) => [+(X(col) + x).toFixed(1), +(Y(row) + y).toFixed(1)]);
  var monuments = [
    {
      id: "arc-saisies",
      name: { fr: "Arc des Saisies", en: "Arch of Seizures" },
      col: 3,
      row: 3,
      x: X(3),
      y: Y(3),
      footprint: octagon(X(3), Y(3), 15, 13),
      piers: paintings.starArch.solids.map((poly) => at(3, 3, poly)),
      passUnder: true,
      style: "arch"
    },
    {
      id: "tour-fer",
      name: { fr: "Tour de Fer", en: "Iron Tower" },
      col: 3,
      row: 8,
      x: X(3),
      y: Y(8),
      // Roads pass beneath; the two rear stone shoes stand in fenced gardens on the quay.
      footprint: boxPoly(X(3) - 64, Y(8) - 42, X(3) + 65, Y(8) + 70),
      passUnder: true,
      piers: paintings.towerBase.solids.map((poly) => at(3, 8, poly)),
      style: "tower"
    },
    {
      id: "place-contrainte",
      name: { fr: "Place de la Contrainte", en: "Writ Square Obelisk" },
      col: 6,
      row: 5,
      x: X(6),
      y: Y(5),
      footprint: octagon(X(6), Y(5), 11, 10),
      style: "obelisk"
    },
    {
      id: "hotel-ventes",
      name: { fr: "H\xF4tel des Ventes", en: "Grand Auction House" },
      col: 7,
      row: 3,
      x: X(7) - 79,
      y: Y(3) - 62,
      footprint: boxPoly(X(7) - 112, Y(3) - 100, X(7) - 44, Y(3) - 33),
      style: "opera"
    },
    {
      id: "sacre-creancier",
      name: { fr: "Sacr\xE9-Cr\xE9ancier", en: "Sacred Creditor Basilica" },
      col: 8,
      row: 0,
      x: X(8) - 80,
      y: Y(0) - 52,
      footprint: boxPoly(X(8) - 122, 6, X(8) - 44, Y(0) - 33),
      style: "basilica"
    },
    {
      id: "palais-justice",
      name: { fr: "Palais de Justice", en: "Law Courts" },
      col: 8,
      row: 6,
      x: X(8) - 76,
      y: Y(6) - 60,
      footprint: boxPoly(X(8) - 118, Y(6) - 100, X(8) - 32, Y(6) - 33),
      style: "palais"
    },
    {
      id: "notre-dame-port",
      name: { fr: "Notre-Dame-du-Port", en: "Our Lady of the Port" },
      col: 9,
      row: 7,
      x: X(9),
      y: Y(7) - 55,
      footprint: at(9, 7, paintings.islandCathedral.cathedral),
      piers: paintings.islandCathedral.solids.map((poly) => at(9, 7, poly)),
      style: "cathedral"
    }
  ];
  var solids = [];
  for (const [r, row] of cellKinds.entries())
    for (const [c, key] of row.entries()) {
      const painting = paintings[key];
      if (painting.island && painting.roundabout) solids.push(at(c, r, painting.island));
      if (painting.river && painting.solids && key !== "islandCathedral")
        for (const poly of painting.solids) solids.push(at(c, r, poly));
    }
  var parks = [
    { id: "champ-de-fer", name: { fr: "Jardin du Champ-de-Fer", en: "Iron Field Gardens" }, cols: [3, 4], rows: [9, 9] },
    { id: "buttes-fiscales", name: { fr: "Parc des Buttes-Fiscales", en: "Tax-Hill Park" }, cols: [14, 14], rows: [3, 4] },
    { id: "jardin-senat", name: { fr: "Jardin du S\xE9nat-des-Clercs", en: "Clerks' Senate Garden" }, cols: [7, 7], rows: [9, 9] }
  ];
  var definition = {
    blocks,
    cellKinds,
    canalRow: CANAL_ROW,
    river,
    roads: buildParisRoads(),
    ring,
    monuments,
    solids,
    // Half the width between the painted parapets of each bridge.
    bridgeDeck: (col) => paintings[cellKinds[RIVER_ROW][col]].walk,
    parks,
    railways: [],
    // 5 case addresses relocated to central Paris-Port-Fer landmarks (all verified clear of props & obstacles).
    addresses: [
      { id: "office", col: 7, row: 5, dx: 78, dy: -21, symbol: "\xC9", color: "#ffc857" },
      { id: "repo", col: 5, row: 4, dx: 64, dy: -21, symbol: "R", color: "#ff79ae" },
      { id: "noise", col: 9, row: 5, dx: -64, dy: -21, symbol: "C", color: "#64ebd0" },
      { id: "flat", col: 6, row: 6, dx: 72, dy: -22, symbol: "S", color: "#ffa851" },
      { id: "auction", col: 7, row: 3, dx: -79, dy: -21, symbol: "A", color: "#c2a0ff" }
    ],
    interiors: [
      {
        door: "office",
        image: "officeInterior",
        width: 160,
        height: 100,
        floor: { left: 14, right: 146, top: 63, bottom: 94 },
        entry: { x: 80, y: 90 },
        exit: { x: 80, y: 93 },
        desk: { x: 80, y: 65 },
        action: "caseDesk"
      }
    ],
    buildPiers: buildRingPiers
  };
  var town = buildTown(definition);
  var { blocks: city, width: W, height: H, jobs, roadsX, roadsY, canalRow } = town;
  var office = town.byId.get("office");
  var auction = town.byId.get("auction");
  var canalTop = town.river.top;
  var canalBottom = town.river.bottom;

  // src/core/controls.js
  var sources = /* @__PURE__ */ new Map();
  var analog = { x: 0, y: 0, steering: 0, throttle: 0 };
  function clearAnalog() {
    analog.x = analog.y = analog.steering = analog.throttle = 0;
  }
  var held = {
    has(control2) {
      return sources.has(control2);
    },
    add(control2, source) {
      if (!sources.has(control2)) sources.set(control2, /* @__PURE__ */ new Set());
      sources.get(control2).add(source);
    },
    delete(control2, source) {
      if (source === void 0) {
        sources.delete(control2);
        return;
      }
      const owners = sources.get(control2);
      if (owners?.delete(source) && !owners.size) sources.delete(control2);
    },
    clear() {
      sources.clear();
      clearAnalog();
    }
  };
  function axis(positive, negative, fallback) {
    const plus = held.has(positive), minus = held.has(negative);
    return plus || minus ? Number(plus) - Number(minus) : fallback;
  }
  function walkVector() {
    return [axis("right", "left", analog.x), axis("down", "up", analog.y)];
  }
  function steeringInput() {
    return axis("right", "left", analog.steering);
  }
  function throttleInput() {
    return axis("up", "down", analog.throttle);
  }

  // src/core/state.js
  var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  var seed = 71;
  function rand() {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    return seed / 4294967296;
  }
  var artwork = {};
  var p = { x: office.x - 22, y: office.y - 3, a: Math.PI / 2, hp: 5 };
  var cars = [];
  var people = [];
  var trails = [];
  var fx = [];
  var done = /* @__PURE__ */ new Set();
  var game = {
    artReady: false,
    konamiHero: false,
    ride: null,
    // La Petite Ceinture: null, { phase: "platform", station } or { phase: "riding", set, car, boardedAt, alightAt }.
    transit: null,
    time: 0,
    heat: 0,
    wallet: 0,
    hitCooldown: 0,
    flash: 0,
    msgLife: 0,
    active: "",
    stage: "",
    viewMap: false,
    sound: true,
    audio: null,
    vw: 0,
    vh: 0,
    camX: p.x,
    camY: p.y,
    lastDir: 1,
    quipTime: 3,
    quipCooldown: 0
  };
  try {
    game.sound = localStorage.getItem("port-fer-sound") !== "off";
  } catch {
  }

  // src/platform/canvas.js
  var $ = (s) => document.querySelector(s);
  var canvas = $("#game");
  var g = canvas.getContext("2d");
  var panel = $("#panel");
  function resize() {
    const zoom = clamp(Math.min(innerWidth / 280, innerHeight / 185), 1.95, 5.15);
    game.vw = innerWidth / zoom;
    game.vh = innerHeight / zoom;
    const density = Math.min(devicePixelRatio || 1, innerWidth < 650 ? 1.5 : 1);
    canvas.width = Math.round(innerWidth * density);
    canvas.height = Math.round(innerHeight * density);
    g.setTransform(canvas.width / game.vw, 0, 0, canvas.height / game.vh, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "low";
  }
  resize();
  addEventListener("resize", resize);
  function rect(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }
  function label(c, s, x, y, color, size = 8) {
    c.font = "bold " + size + "px monospace";
    c.fillStyle = color;
    c.fillText(s, x, y);
  }
  function hud(selector, value) {
    const el = $(selector);
    if (el.textContent !== value) el.textContent = value;
  }

  // src/world/vehicle-shape.js
  var sedanHalfLength = 10.95;
  var sedanHalfWidth = 4.8;
  function carContact(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    const al = a.halfLength ?? sedanHalfLength, bl = b.halfLength ?? sedanHalfLength, aw = a.halfWidth ?? sedanHalfWidth, bw = b.halfWidth ?? sedanHalfWidth;
    const reach2 = Math.hypot(al, aw) + Math.hypot(bl, bw);
    if (Math.abs(dx) > reach2 || Math.abs(dy) > reach2) return null;
    const ax = Math.cos(a.a), ay = Math.sin(a.a), bx = Math.cos(b.a), by = Math.sin(b.a);
    let depth = Infinity, nx = 0, ny = 0;
    for (const [x, y] of [
      [ax, ay],
      [-ay, ax],
      [bx, by],
      [-by, bx]
    ]) {
      const span = al * Math.abs(ax * x + ay * y) + bl * Math.abs(bx * x + by * y) + aw * Math.abs(ax * y - ay * x) + bw * Math.abs(bx * y - by * x);
      const side = dx * x + dy * y, overlap = span - Math.abs(side);
      if (overlap <= 0) return null;
      if (overlap < depth) {
        depth = overlap;
        nx = (side >= 0 ? 1 : -1) * x;
        ny = (side >= 0 ? 1 : -1) * y;
      }
    }
    return { depth, nx, ny };
  }

  // src/world/collision.js
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function circleHitsPoly(x, y, r, poly) {
    if (pointInPoly(x, y, poly)) return true;
    if (r <= 0) return false;
    const r2 = r * r;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      const dx = xj - xi, dy = yj - yi, len2 = dx * dx + dy * dy;
      const t2 = len2 > 0 ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len2)) : 0;
      const px = xi + dx * t2 - x, py = yi + dy * t2 - y;
      if (px * px + py * py < r2) return true;
    }
    return false;
  }
  function circleHitsBox(x, y, r, b) {
    const cx = Math.max(b.left, Math.min(x, b.right));
    const cy = Math.max(b.top, Math.min(y, b.bottom));
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  }
  function obbHitsCircle(pose, cx, cy, r) {
    const dx = cx - pose.x, dy = cy - pose.y;
    const c = Math.cos(pose.a), s = Math.sin(pose.a);
    const localX = dx * c + dy * s;
    const localY = -dx * s + dy * c;
    const clampedX = Math.max(-pose.halfLength, Math.min(localX, pose.halfLength));
    const clampedY = Math.max(-pose.halfWidth, Math.min(localY, pose.halfWidth));
    const rx = localX - clampedX, ry = localY - clampedY;
    return rx * rx + ry * ry < r * r;
  }
  function obbCorners(pose) {
    const c = Math.cos(pose.a), s = Math.sin(pose.a);
    const lx = c * pose.halfLength, ly = s * pose.halfLength;
    const wx = -s * pose.halfWidth, wy = c * pose.halfWidth;
    return [
      [pose.x + lx + wx, pose.y + ly + wy],
      [pose.x + lx - wx, pose.y + ly - wy],
      [pose.x - lx - wx, pose.y - ly - wy],
      [pose.x - lx + wx, pose.y - ly + wy]
    ];
  }
  function obbHitsPoly(pose, poly) {
    const rect2 = obbCorners(pose);
    const axes = [
      [Math.cos(pose.a), Math.sin(pose.a)],
      [-Math.sin(pose.a), Math.cos(pose.a)]
    ];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const dx = poly[i][0] - poly[j][0], dy = poly[i][1] - poly[j][1];
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) axes.push([-dy / len, dx / len]);
    }
    for (const [ax, ay] of axes) {
      let minA = Infinity, maxA = -Infinity;
      for (const [px, py] of rect2) {
        const p2 = px * ax + py * ay;
        if (p2 < minA) minA = p2;
        if (p2 > maxA) maxA = p2;
      }
      let minB = Infinity, maxB = -Infinity;
      for (const [px, py] of poly) {
        const p2 = px * ax + py * ay;
        if (p2 < minB) minB = p2;
        if (p2 > maxB) maxB = p2;
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
      const dx = x - rb.x, dy = y - rb.y;
      if (dx * dx + dy * dy <= rb.outerRadius * rb.outerRadius) return true;
    }
    if (allowServiceSeam) {
      if (!layout.river || !layout.river.onWater(x, y, 0)) {
        const { col, row } = layout.cellAt(x, y);
        const dx = Math.abs(x - X(col)), dy = Math.abs(y - Y(row));
        if (Math.abs(dx - CELL_W / 2) < 2.9 || Math.abs(dy - CELL_H / 2) < 2.9) {
          const m = layout.cellMeta(col, row);
          if (!m.isRiverRow || m.isIsland) return true;
        }
      }
    }
    return false;
  }
  var CIRCLE_DIRS = Array.from({ length: 8 }, (_, i) => {
    const a = i * Math.PI / 4;
    return [Math.cos(a), Math.sin(a)];
  });
  function hitsLegacyLines(layout, x, y, r) {
    if (!layout.lines?.size) return false;
    const { row } = layout.cellAt(x, y);
    const fromFoot = y - Y(row) - pierDepth;
    if (layout.lines.has(row) && fromFoot < r && fromFoot > -pierThickness - r) {
      const { col: first } = layout.cellAt(x - r, y), { col: last } = layout.cellAt(x + r, y);
      for (let i = first; i <= last; i++)
        for (const [left2, right] of viaductSection(layout, row, i).bases)
          if (x + r > X(i) + left2 && x - r < X(i) + right) return true;
    }
    return false;
  }
  function blockedIn(layout, x, y, r) {
    const W2 = layout.width, H2 = layout.height;
    if (x < r || y < r || x > W2 - r || y > H2 - r) return true;
    const { col, row } = layout.cellAt(x, y);
    const cell = layout.cellMeta(col, row);
    const allowAlley = r <= ALLEY_MAX_VEHICLE_HALF_WIDTH;
    const allowServiceSeam = r < 4;
    for (const post of streetProps(layout, col, row)) {
      const radius = post.item.radius;
      if (!radius) continue;
      if (Math.abs(x - post.x) < r + radius && Math.hypot(x - post.x, y - post.y + radius / 2) < r + radius)
        return true;
    }
    for (const rb of cell.roundabouts) {
      const minD = rb.radius + r;
      const dx = x - rb.x, dy = y - rb.y;
      if (dx * dx + dy * dy < minD * minD) return true;
    }
    for (const poly of cell.solidPolys) {
      if (circleHitsPoly(x, y, r, poly)) return true;
    }
    for (const pier of cell.ringPiers) {
      if (circleHitsBox(x, y, r, pier)) return true;
    }
    if (hitsLegacyLines(layout, x, y, r)) return true;
    if (allowServiceSeam && (!layout.river || !layout.river.onWater(x, y, 0)) && (!cell.isRiverRow || cell.isIsland)) {
      const seamX = Math.abs(Math.abs(x - X(col)) - CELL_W / 2);
      const seamY = Math.abs(Math.abs(y - Y(row)) - CELL_H / 2);
      if (seamX < 2.9 || seamY < 2.9) return false;
    }
    for (const rect2 of cell.openRects) {
      if (rect2.alley && !allowAlley) continue;
      if (x >= rect2.left + r && x <= rect2.right - r && y >= rect2.top + r && y <= rect2.bottom - r) return false;
    }
    for (const rb of cell.roundabouts) {
      const maxR = rb.outerRadius - r;
      if (maxR > 0) {
        const dx = x - rb.x, dy = y - rb.y;
        if (dx * dx + dy * dy <= maxR * maxR) return false;
      }
    }
    if (!pointInOpenSpace(layout, cell, x, y, allowAlley, allowServiceSeam)) return true;
    for (const [cx, cy] of CIRCLE_DIRS) {
      const sx = x + cx * r, sy = y + cy * r;
      const sc = layout.cellAt(sx, sy);
      const sCell = sc.col === col && sc.row === row ? cell : layout.cellMeta(sc.col, sc.row);
      if (!pointInOpenSpace(layout, sCell, sx, sy, allowAlley, allowServiceSeam)) return true;
    }
    return false;
  }
  function vehicleBlockedIn(layout, vehicle, x = vehicle.x, y = vehicle.y, a = vehicle.a, leaving = false) {
    const halfLength = vehicle.halfLength ?? sedanHalfLength, halfWidth = vehicle.halfWidth ?? sedanHalfWidth;
    const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const rx = cos * halfLength + sin * halfWidth, ry = sin * halfLength + cos * halfWidth;
    if (!leaving && (x < rx || y < ry || x > layout.width - rx || y > layout.height - ry)) return true;
    const canUseAlley = halfWidth <= ALLEY_MAX_VEHICLE_HALF_WIDTH;
    const pose = { x, y, a, halfLength, halfWidth };
    const first = layout.cellAt(x - rx, y - ry), last = layout.cellAt(x + rx, y + ry);
    for (let row = first.row; row <= last.row; row++) {
      for (let col = first.col; col <= last.col; col++) {
        const cell = layout.cellMeta(col, row);
        for (const rb of cell.roundabouts) {
          if (obbHitsCircle(pose, rb.x, rb.y, rb.radius)) return true;
        }
        for (const poly of cell.solidPolys) {
          if (obbHitsPoly(pose, poly)) return true;
        }
        for (const pier of cell.ringPiers) {
          const box2 = {
            x: (pier.left + pier.right) / 2,
            y: (pier.top + pier.bottom) / 2,
            a: 0,
            halfLength: (pier.right - pier.left) / 2,
            halfWidth: (pier.bottom - pier.top) / 2
          };
          if (Math.abs(box2.x - x) < rx + box2.halfLength && Math.abs(box2.y - y) < ry + box2.halfWidth && carContact(pose, box2))
            return true;
        }
        if (layout.lines?.has(row)) {
          const cy = Y(row);
          for (const [left2, right] of viaductSection(layout, row, col).bases) {
            const box2 = {
              x: X(col) + (left2 + right) / 2,
              y: cy + pierDepth - pierThickness / 2,
              a: 0,
              halfLength: (right - left2) / 2,
              halfWidth: pierThickness / 2
            };
            if (Math.abs(box2.x - x) < rx + box2.halfLength && Math.abs(box2.y - y) < ry + box2.halfWidth && carContact(pose, box2))
              return true;
          }
        }
        for (const post of streetProps(layout, col, row)) {
          const r = post.item.radius;
          if (!r) continue;
          const box2 = { x: post.x, y: post.y - r / 2, a: 0, halfLength: r, halfWidth: r / 2 };
          if (Math.abs(box2.x - x) < rx + box2.halfLength && Math.abs(box2.y - y) < ry + box2.halfWidth && carContact(pose, box2))
            return true;
        }
      }
    }
    const centerCell = layout.cellMeta(layout.cellAt(x, y).col, layout.cellAt(x, y).row);
    const corners2 = obbCorners(pose);
    for (const rect2 of centerCell.openRects) {
      if (rect2.alley && !canUseAlley) continue;
      if (corners2[0][0] >= rect2.left && corners2[0][0] <= rect2.right && corners2[0][1] >= rect2.top && corners2[0][1] <= rect2.bottom && corners2[1][0] >= rect2.left && corners2[1][0] <= rect2.right && corners2[1][1] >= rect2.top && corners2[1][1] <= rect2.bottom && corners2[2][0] >= rect2.left && corners2[2][0] <= rect2.right && corners2[2][1] >= rect2.top && corners2[2][1] <= rect2.bottom && corners2[3][0] >= rect2.left && corners2[3][0] <= rect2.right && corners2[3][1] >= rect2.top && corners2[3][1] <= rect2.bottom)
        return false;
    }
    for (const rb of centerCell.roundabouts) {
      const r2 = rb.outerRadius * rb.outerRadius;
      if (corners2.every(([px, py]) => (px - rb.x) ** 2 + (py - rb.y) ** 2 <= r2)) return false;
    }
    const c = Math.cos(a), s = Math.sin(a);
    const samples = [
      [x, y],
      ...corners2,
      // Front & rear centres.
      [x + c * halfLength, y + s * halfLength],
      [x - c * halfLength, y - s * halfLength]
    ];
    for (const f of [-0.6, -0.2, 0.2, 0.6]) {
      const lx = c * halfLength * f, ly = s * halfLength * f;
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
  function vehicleBlocked(vehicle, x = vehicle.x, y = vehicle.y, a = vehicle.a, leaving = false) {
    return vehicleBlockedIn(town, vehicle, x, y, a, leaving);
  }
  var blocked = (x, y, r) => blockedIn(town, x, y, r);
  function distanceToBody(v, x, y) {
    const dx = x - v.x, dy = y - v.y, c = Math.cos(v.a), s = Math.sin(v.a);
    const forward = Math.abs(dx * c + dy * s) - (v.halfLength ?? sedanHalfLength), side = Math.abs(dy * c - dx * s) - (v.halfWidth ?? sedanHalfWidth);
    return Math.hypot(Math.max(0, forward), Math.max(0, side)) + Math.min(0, Math.max(forward, side));
  }
  var bodyExtra = (v) => Math.max(0, (v.halfLength ?? sedanHalfLength) - sedanHalfLength);
  function carOverlaps(x, y, r) {
    const overlaps = /* @__PURE__ */ new Map();
    for (const v of cars) {
      const near = 22 + bodyExtra(v);
      if (Math.abs(v.x - x) > near || Math.abs(v.y - y) > near) continue;
      const depth = r - distanceToBody(v, x, y);
      if (depth > 0) overlaps.set(v, depth);
    }
    return overlaps;
  }
  function footBlocked(x, y, r, from) {
    if (blocked(x, y, r)) return true;
    const overlaps = carOverlaps(x, y, r);
    if (!overlaps.size) return false;
    if (!from) return true;
    const before = carOverlaps(from.x, from.y, r);
    let total = 0, previous = 0;
    for (const depth of before.values()) previous += depth;
    for (const [v, depth] of overlaps) {
      total += depth;
      if (depth > Math.max(before.get(v) || 0, r * 0.5) + 1e-6) return true;
    }
    return total > previous + 1e-6;
  }
  var glance = [0.55, -0.55, 1, -1];
  function move(o, dx, dy, r) {
    let bump = false;
    if (!footBlocked(o.x + dx, o.y, r, o)) o.x += dx;
    else bump = true;
    if (!footBlocked(o.x, o.y + dy, r, o)) o.y += dy;
    else bump = true;
    if (bump && dx === 0 !== (dy === 0)) {
      const step = Math.hypot(dx, dy);
      for (const side of glance) {
        const scale = 1 / Math.hypot(0.7, side), sx = (dx ? dx * 0.7 : side * step) * scale, sy = (dy ? dy * 0.7 : side * step) * scale;
        if (!footBlocked(o.x + sx, o.y + sy, r, o)) {
          o.x += sx;
          o.y += sy;
          break;
        }
      }
    }
    return bump;
  }
  function lineClear(x, y, tx, ty) {
    const steps = Math.ceil(Math.hypot(tx - x, ty - y));
    for (let i = 1; i <= steps; i++)
      if (blocked(x + (tx - x) * i / steps, y + (ty - y) * i / steps, 1)) return false;
    return true;
  }
  function strikeClear(x, y, tx, ty) {
    if (!lineClear(x, y, tx, ty)) return false;
    const steps = Math.ceil(Math.hypot(tx - x, ty - y));
    for (const v of cars)
      for (let i = 1; i < steps; i++) {
        const sx = x + (tx - x) * i / steps, sy = y + (ty - y) * i / steps;
        const near = 14 + bodyExtra(v);
        if (Math.abs(v.x - sx) < near && Math.abs(v.y - sy) < near && distanceToBody(v, sx, sy) < 0) return false;
      }
    return true;
  }
  function shutIn(o, r, radius = 14) {
    const cell = 1.5, seen = /* @__PURE__ */ new Set(["0,0"]), queue = [[0, 0]];
    while (queue.length) {
      const [i, j] = queue.shift();
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const ni = i + di, nj = j + dj, key = ni + "," + nj;
        if (seen.has(key)) continue;
        seen.add(key);
        const x = o.x + ni * cell, y = o.y + nj * cell;
        if (footBlocked(x, y, r)) continue;
        if (Math.hypot(ni, nj) * cell > radius) return false;
        queue.push([ni, nj]);
      }
    }
    return true;
  }
  function freeSpot(x, y, r, beyond = 0) {
    for (let ring2 = Math.max(2, Math.ceil(beyond / 2) * 2); ring2 <= 40 + beyond; ring2 += 2)
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, nx = x + Math.cos(a) * ring2, ny = y + Math.sin(a) * ring2;
        if (!footBlocked(nx, ny, r) && lineClear(x, y, nx, ny)) return { x: nx, y: ny };
      }
    return null;
  }

  // src/world/routes.js
  var TAU2 = 2 * Math.PI;
  var RIGHT_LANE = 6;
  var CORNER_R = 8;
  var FILLET_R = 10;
  function roundaboutCircRadius(node) {
    return Math.round((node.radius + node.outerRadius) * 0.5);
  }
  function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }
  function normUnit(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  }
  function roundaboutFillet(cx, cy, R, armAngle, laneOffset, isEntry, f) {
    const ax = Math.cos(armAngle), ay = Math.sin(armAngle);
    const ux = ay, uy = -ax;
    const d = laneOffset;
    const sign = isEntry ? 1 : -1;
    const uf = sign * (d + f);
    const vf = Math.sqrt(Math.max(1, (R + f) * (R + f) - (d + f) * (d + f)));
    const fcx = cx + ux * uf + ax * vf;
    const fcy = cy + uy * uf + ay * vf;
    const straightPt = { x: cx + ux * (sign * d) + ax * vf, y: cy + uy * (sign * d) + ay * vf };
    const k = R / (R + f);
    const ringPt = { x: cx + (fcx - cx) * k, y: cy + (fcy - cy) * k };
    const ringAngle = Math.atan2(ringPt.y - cy, ringPt.x - cx);
    const aStraight = Math.atan2(straightPt.y - fcy, straightPt.x - fcx);
    const aRing = Math.atan2(ringPt.y - fcy, ringPt.x - fcx);
    let startA, deltaA;
    if (isEntry) {
      startA = aStraight;
      deltaA = wrapAngle(aRing - aStraight);
      if (deltaA <= 0) deltaA += TAU2;
    } else {
      startA = aRing;
      deltaA = wrapAngle(aStraight - aRing);
      if (deltaA <= 0) deltaA += TAU2;
    }
    return {
      straightPt,
      ringPt,
      ringAngle,
      vf,
      fillet: {
        type: "arc",
        cx: fcx,
        cy: fcy,
        r: f,
        startA,
        deltaA,
        length: f * Math.abs(deltaA),
        inRoundabout: true
      }
    };
  }
  function compileNodeCycle(town2, nodeIds, {
    laneOffset = RIGHT_LANE,
    turnRadius = CORNER_R,
    filletRadius = Math.max(FILLET_R, turnRadius),
    ringOffset = 0
  } = {}) {
    const n = nodeIds.length;
    if (n < 3) return null;
    const nodes = nodeIds.map((id) => town2.roadNodeById.get(id));
    if (nodes.some((x) => !x)) return null;
    const transitions = [];
    for (let i = 0; i < n; i++) {
      const prev2 = nodes[(i + n - 1) % n];
      const curr = nodes[i];
      const next = nodes[(i + 1) % n];
      const [ix, iy] = normUnit(curr.x - prev2.x, curr.y - prev2.y);
      const [ox, oy] = normUnit(next.x - curr.x, next.y - curr.y);
      const inLaneX = -iy * laneOffset, inLaneY = ix * laneOffset;
      const outLaneX = -oy * laneOffset, outLaneY = ox * laneOffset;
      if (curr.kind === "roundabout") {
        const R = roundaboutCircRadius(curr) + ringOffset;
        const armIn = Math.atan2(prev2.y - curr.y, prev2.x - curr.x);
        const armOut = Math.atan2(next.y - curr.y, next.x - curr.x);
        const entry = roundaboutFillet(curr.x, curr.y, R, armIn, laneOffset, true, filletRadius);
        const exit = roundaboutFillet(curr.x, curr.y, R, armOut, laneOffset, false, filletRadius);
        let deltaA2 = wrapAngle(exit.ringAngle - entry.ringAngle);
        if (deltaA2 >= -0.05) deltaA2 -= TAU2;
        const ringArc = {
          type: "arc",
          cx: curr.x,
          cy: curr.y,
          r: R,
          startA: entry.ringAngle,
          deltaA: deltaA2,
          length: R * Math.abs(deltaA2),
          inRoundabout: true,
          roundabout: { id: curr.id, x: curr.x, y: curr.y, radius: curr.radius, outerRadius: curr.outerRadius }
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
            stopOffset: Math.max(0, (curr.outerRadius ?? R + 12) - entry.vf),
            joinAngle: entry.ringAngle,
            joinPt: entry.ringPt
          },
          junction: null
        });
        continue;
      }
      const cross = ix * oy - iy * ox;
      const dot = ix * ox + iy * oy;
      if (Math.abs(cross) < 0.05 && dot > 0.5) {
        const pt = { x: curr.x + inLaneX, y: curr.y + inLaneY };
        transitions.push({
          inPt: pt,
          outPt: pt,
          arcs: [],
          junction: { x: curr.x, y: curr.y },
          roundaboutEntry: null
        });
        continue;
      }
      const r = cross > 0 ? turnRadius : turnRadius + 2 * laneOffset;
      const det = ix * oy - iy * ox;
      const dx = outLaneX - inLaneX, dy = outLaneY - inLaneY;
      const tInt = (dx * oy - dy * ox) / det;
      const cornerX = curr.x + inLaneX + ix * tInt;
      const cornerY = curr.y + inLaneY + iy * tInt;
      const inPt = { x: cornerX - ix * r, y: cornerY - iy * r };
      const outPt = { x: cornerX + ox * r, y: cornerY + oy * r };
      const sign = cross > 0 ? 1 : -1;
      const fcx = inPt.x - iy * sign * r;
      const fcy = inPt.y + ix * sign * r;
      const startA = Math.atan2(inPt.y - fcy, inPt.x - fcx);
      const endA = Math.atan2(outPt.y - fcy, outPt.x - fcx);
      let deltaA = wrapAngle(endA - startA);
      if (sign > 0 && deltaA <= 0) deltaA += TAU2;
      if (sign < 0 && deltaA >= 0) deltaA -= TAU2;
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
            junction: { x: curr.x, y: curr.y }
          }
        ],
        junction: { x: curr.x, y: curr.y },
        roundaboutEntry: null
      });
    }
    const segments = [];
    for (let i = 0; i < n; i++) {
      const prevT = transitions[(i + n - 1) % n];
      const currT = transitions[i];
      const prevNode = nodes[(i + n - 1) % n];
      const currNode = nodes[i];
      const edgeInfo = town2.roadAdj.get(prevNode.id)?.find((a) => a.to === currNode.id)?.edge;
      const roadClass = edgeInfo?.class ?? "street";
      const isAlley = roadClass === "alley";
      const x1 = prevT.outPt.x, y1 = prevT.outPt.y;
      const x2 = currT.inPt.x, y2 = currT.inPt.y;
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
          roadClass,
          junction: currT.junction,
          roundaboutEntry: currT.roundaboutEntry
        });
      }
      const outClass = town2.roadAdj.get(currNode.id)?.find((a) => a.to === nodes[(i + 1) % n].id)?.edge.class;
      for (const arc of currT.arcs) segments.push({ ...arc, isAlley: isAlley || outClass === "alley" });
    }
    return segments.length ? segments : null;
  }
  function compileLegacyPoints(points, turnRadius = CORNER_R) {
    const n = points.length;
    if (n < 3) return null;
    const transitions = [];
    for (let i = 0; i < n; i++) {
      const prev2 = points[(i + n - 1) % n];
      const curr = points[i];
      const next = points[(i + 1) % n];
      const [ix, iy] = normUnit(curr.x - prev2.x, curr.y - prev2.y);
      const [ox, oy] = normUnit(next.x - curr.x, next.y - curr.y);
      const cross = ix * oy - iy * ox;
      if (Math.abs(cross) < 0.05) {
        transitions.push({ inPt: curr, outPt: curr, arcs: [] });
        continue;
      }
      const r = turnRadius;
      const inPt = { x: curr.x - ix * r, y: curr.y - iy * r };
      const outPt = { x: curr.x + ox * r, y: curr.y + oy * r };
      const sign = cross > 0 ? 1 : -1;
      const fcx = inPt.x - iy * sign * r;
      const fcy = inPt.y + ix * sign * r;
      const startA = Math.atan2(inPt.y - fcy, inPt.x - fcx);
      const endA = Math.atan2(outPt.y - fcy, outPt.x - fcx);
      let deltaA = wrapAngle(endA - startA);
      if (sign > 0 && deltaA <= 0) deltaA += TAU2;
      if (sign < 0 && deltaA >= 0) deltaA -= TAU2;
      transitions.push({
        inPt,
        outPt,
        arcs: [{ type: "arc", cx: fcx, cy: fcy, r, startA, deltaA, length: r * Math.abs(deltaA), inRoundabout: false }]
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
          roundaboutEntry: null
        });
      }
      for (const arc of currT.arcs) segments.push(arc);
    }
    return segments;
  }
  function buildTrafficLoop(town2, col, row, { maxHalfWidth = 4.8 } = {}) {
    const allowAlley = maxHalfWidth <= ALLEY_MAX_VEHICLE_HALF_WIDTH;
    const startNode = town2.roadNodeAt(col, row);
    if (!startNode || startNode.kind === "end") return null;
    const allowed = (adj) => {
      if (!allowAlley && adj.edge.class === "alley") return false;
      if (adj.edge.oneWay && adj.edge.oneWay !== adj.dir) return false;
      const toNode = town2.roadNodeById.get(adj.to);
      if (!toNode || toNode.kind === "end") return false;
      return true;
    };
    const outs = (town2.roadAdj.get(startNode.id) || []).filter(allowed);
    const east = outs.find((a) => {
      const n = town2.roadNodeById.get(a.to);
      return n.x > startNode.x && Math.abs(n.y - startNode.y) < 1;
    });
    const firstStep2 = east || outs[0];
    if (!firstStep2) return null;
    const visited = /* @__PURE__ */ new Set([startNode.id]);
    const path = [startNode.id];
    let prevId = startNode.id;
    let currId = firstStep2.to;
    const maxSteps = 12;
    for (let step = 0; step < maxSteps; step++) {
      if (currId === startNode.id) {
        if (path.length >= 4) {
          let area = 0;
          for (let i = 0; i < path.length; i++) {
            const a = town2.roadNodeById.get(path[i]);
            const b = town2.roadNodeById.get(path[(i + 1) % path.length]);
            area += a.x * b.y - b.x * a.y;
          }
          const canReverse = path.every(
            (id, i) => (town2.roadAdj.get(id) || []).some((a) => a.to === path[(i + path.length - 1) % path.length] && allowed(a))
          );
          const ordered = area >= 0 || !canReverse ? path : [path[0], ...path.slice(1).reverse()];
          const classes = ordered.map((id, i) => town2.roadAdj.get(id).find((a) => a.to === ordered[(i + 1) % ordered.length]).edge.class);
          const roadClass = classes.includes("alley") ? "alley" : classes.includes("street") ? "street" : "avenue";
          const segments = compileNodeCycle(town2, ordered, roadClass === "alley" ? { laneOffset: 2.5 } : {});
          return segments ? { nodeIds: ordered, segments, class: roadClass } : null;
        }
        return null;
      }
      if (visited.has(currId)) return null;
      visited.add(currId);
      path.push(currId);
      const prev2 = town2.roadNodeById.get(prevId);
      const curr = town2.roadNodeById.get(currId);
      const inAngle = Math.atan2(curr.y - prev2.y, curr.x - prev2.x);
      const candidates = (town2.roadAdj.get(currId) || []).filter((a) => a.to !== prevId && allowed(a)).map((a) => {
        const next = town2.roadNodeById.get(a.to);
        const outAngle = Math.atan2(next.y - curr.y, next.x - curr.x);
        const turn = wrapAngle(outAngle - inAngle);
        const priority = turn > 0.3 ? 0 : Math.abs(turn) <= 0.3 ? 1 : 2;
        return { to: a.to, priority, turn };
      }).sort((a, b) => a.priority - b.priority || b.turn - a.turn);
      if (!candidates.length) return null;
      prevId = currId;
      currId = candidates[0].to;
    }
    return null;
  }
  function evalSegment(seg, s) {
    if (seg.type === "line") {
      const f2 = seg.length > 0 ? Math.max(0, Math.min(1, s / seg.length)) : 0;
      return {
        x: seg.x1 + (seg.x2 - seg.x1) * f2,
        y: seg.y1 + (seg.y2 - seg.y1) * f2,
        a: seg.a
      };
    }
    const f = seg.length > 0 ? Math.max(0, Math.min(1, s / seg.length)) : 0;
    const theta = seg.startA + seg.deltaA * f;
    return {
      x: seg.cx + Math.cos(theta) * seg.r,
      y: seg.cy + Math.sin(theta) * seg.r,
      a: theta + (seg.deltaA >= 0 ? Math.PI / 2 : -Math.PI / 2)
    };
  }
  function projectToEdge(point, na, nb) {
    const dx = nb.x - na.x, dy = nb.y - na.y;
    const len2 = dx * dx + dy * dy;
    const t2 = len2 > 0 ? Math.max(0, Math.min(1, ((point.x - na.x) * dx + (point.y - na.y) * dy) / len2)) : 0;
    const x = na.x + dx * t2, y = na.y + dy * t2;
    return { x, y, t: t2, dist: Math.hypot(point.x - x, point.y - y), len: Math.sqrt(len2) };
  }
  function anchorOnGraph(layout, point, canUseAlley) {
    let best = null;
    for (const edge of layout.roads.edges) {
      if (!canUseAlley && edge.class === "alley") continue;
      const na = layout.roadNodeById.get(edge.a), nb = layout.roadNodeById.get(edge.b);
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
        const prev2 = waypoints[i - 1], next = waypoints[i + 1];
        const R = roundaboutCircRadius(node);
        const aIn = Math.atan2(prev2.y - node.y, prev2.x - node.x);
        const aOut = Math.atan2(next.y - node.y, next.x - node.x);
        let delta = wrapAngle(aOut - aIn);
        if (driving) {
          if (delta >= -0.05) delta -= TAU2;
        } else {
          if (Math.abs(delta) < 0.05) delta = 0;
        }
        const steps = Math.max(2, Math.ceil(Math.abs(delta) / (Math.PI / 6)));
        for (let k = 0; k <= steps; k++) {
          const a = aIn + delta * k / steps;
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
      const prev2 = clean[clean.length - 1];
      if (Math.hypot(node.x - prev2.x, node.y - prev2.y) > 0.5) clean.push(node);
    }
    return clean;
  }
  function findRoute(layout, start, finish, { onFoot = true, vehicleHalfWidth = 4.8, isBlocked = null } = {}) {
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
    const distMap = /* @__PURE__ */ new Map();
    const prevMap = /* @__PURE__ */ new Map();
    const visited = /* @__PURE__ */ new Set();
    const relax = (id, cost, via) => {
      if (cost < (distMap.get(id) ?? Infinity)) {
        distMap.set(id, cost);
        prevMap.set(id, via);
      }
    };
    if (onFoot || a.edge.oneWay !== "a>b") relax(a.na.id, a.t * a.len, null);
    if (onFoot || a.edge.oneWay !== "b>a") relax(a.nb.id, (1 - a.t) * a.len, null);
    const goalIds = /* @__PURE__ */ new Set();
    const goalEdgeCost = /* @__PURE__ */ new Map();
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
      let u = null, bestD = Infinity;
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
    let bestGoalNode = null, bestTotal = Infinity;
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

  // src/game/fleet.js
  var car = { domain: "road", halfWidth: sedanHalfWidth, reverseAccel: 85, turn: 18 / 2.65 };
  var midnightRed = { intact: "voltaRedTurns", dented: "voltaRedDented", wreck: "voltaRedWreck" };
  var fleet = {
    sedan: {
      ...car,
      name: { fr: "Berline", en: "Saloon" },
      halfLength: sedanHalfLength,
      mass: 1,
      topSpeed: 181,
      reverseSpeed: 57,
      accel: 122,
      brake: 260,
      steer: 2.65,
      grip: 1,
      sound: "petrol",
      atlas: null,
      traffic: { weight: 46, parked: 52, lanes: ["avenue", "street"], pace: 1 }
    },
    ambulance: {
      ...car,
      name: { fr: "Ambulance", en: "Ambulance" },
      halfLength: 13.3,
      halfWidth: 5.45,
      mass: 1,
      topSpeed: 181,
      reverseSpeed: 57,
      accel: 122,
      brake: 260,
      steer: 2.65,
      grip: 1,
      sound: "petrol",
      atlas: { intact: "ambulanceTurns", dented: "ambulanceDented", wreck: "ambulanceWreck" },
      sprite: { frame: 192, scale: 5.65, cx: 96, cy: 126 },
      traffic: { weight: 0, parked: 0, lanes: ["avenue", "street"], pace: 1 }
    },
    volta: {
      ...car,
      name: { fr: "Volta E", en: "Volta E" },
      halfLength: 11.9,
      mass: 1.25,
      topSpeed: 214,
      reverseSpeed: 60,
      accel: 196,
      brake: 300,
      steer: 2.7,
      turn: 7,
      grip: 1,
      sound: "electric",
      atlas: { intact: "voltaTurns", dented: "voltaDented", wreck: "voltaWreck" },
      // Pearl white, or midnight red where the street's paint would be rose or olive.
      tints: { rose: midnightRed, olive: midnightRed },
      sprite: { frame: 160, scale: 5, cx: 80, cy: 102 },
      traffic: { weight: 13, parked: 14, lanes: ["avenue", "street"], pace: 1.1 }
    },
    suv: {
      ...car,
      name: { fr: "Mastodonte 4\xD74", en: "Mastodon 4\xD74" },
      halfLength: 12.4,
      mass: 1.7,
      topSpeed: 168,
      reverseSpeed: 52,
      accel: 104,
      brake: 240,
      steer: 2.35,
      turn: 7.6,
      grip: 0.8,
      sound: "petrol",
      atlas: { intact: "suvTurns", dented: "suvDented", wreck: "suvWreck" },
      sprite: { frame: 160, scale: 5, cx: 80, cy: 104 },
      traffic: { weight: 15, parked: 16, lanes: ["avenue", "street"], pace: 0.95 }
    },
    bus: {
      ...car,
      name: { fr: "Autobus de ligne", en: "City bus" },
      halfLength: 28.5,
      mass: 6,
      topSpeed: 112,
      reverseSpeed: 32,
      accel: 46,
      reverseAccel: 34,
      brake: 150,
      steer: 1.3,
      turn: 24,
      pivot: 0.6,
      grip: 0.5,
      sound: "diesel",
      atlas: { intact: "busTurns", dented: "busDented", wreck: "busWreck" },
      sprite: { frame: 264, scale: 4.2, cx: 132, cy: 164 },
      traffic: { weight: 7, parked: 0, lanes: ["avenue", "street"], pace: 0.8, stops: true }
    },
    dumper: {
      ...car,
      name: { fr: "Camion-benne", en: "Dump truck" },
      halfLength: 19,
      mass: 8,
      topSpeed: 104,
      reverseSpeed: 30,
      accel: 40,
      reverseAccel: 30,
      brake: 140,
      steer: 1.45,
      turn: 16,
      pivot: 0.55,
      grip: 0.45,
      sound: "diesel",
      atlas: { intact: "dumperTurns", dented: "dumperDented", wreck: "dumperWreck" },
      sprite: { frame: 200, scale: 4.2, cx: 100, cy: 130 },
      traffic: { weight: 7, parked: 0, lanes: ["avenue", "street"], pace: 0.75 }
    },
    moto: {
      ...car,
      name: { fr: "P\xE9trolette", en: "Motorbike" },
      // Drawn a third larger than the cars' scale, like the people: the rider is in plain view.
      halfLength: 7,
      halfWidth: 2.3,
      mass: 0.22,
      topSpeed: 236,
      reverseSpeed: 14,
      accel: 215,
      reverseAccel: 40,
      brake: 330,
      steer: 3.75,
      turn: 4,
      grip: 1,
      leans: true,
      sound: "moto",
      // The ridden pictures are a painted sheet of 16 headings: the bailiff, and a courier in blue.
      atlas: { intact: "motoTurns", dented: "motoDented", wreck: "motoWreck", ridden: "motoRider", courier: "motoCourier", riddenHeadings: 16 },
      sprite: { frame: 128, scale: 6, cx: 64, cy: 92 },
      traffic: { weight: 12, parked: 18, lanes: ["avenue", "street", "alley"], pace: 1.25 }
    }
  };
  for (const [id, entry] of Object.entries(fleet)) Object.assign(entry, { id, label: "fleet:" + id });
  function fleetOf(vehicle) {
    return fleet[vehicle?.model] || fleet.sedan;
  }
  function pickModel(roadClass = "street", random = Math.random, parked = false) {
    const share = (entry) => entry.domain === "road" && entry.traffic.lanes.includes(roadClass) ? parked ? entry.traffic.parked : entry.traffic.weight : 0;
    const entries = Object.values(fleet);
    let roll = random() * entries.reduce((sum, entry) => sum + share(entry), 0);
    for (const entry of entries) {
      roll -= share(entry);
      if (roll < 0) return entry.id;
    }
    return "sedan";
  }
  function routeClass(route) {
    return route?.class || route?.roadClass || "street";
  }

  // src/game/fleet-traffic.js
  function compileFleetLoop(town2, loop2, model) {
    const { halfLength, halfWidth, turn, pivot, traffic } = fleetOf({ model });
    if (!traffic.lanes.includes(loop2.class)) return null;
    if (loop2.class === "alley") {
      for (const laneOffset of [2.5, 1]) {
        const segments = laneOffset === 2.5 ? loop2.segments : compileNodeCycle(town2, loop2.nodeIds, { laneOffset });
        const clear = (seg) => {
          const samples = Math.ceil(seg.length / 2);
          for (let i = 0; i <= samples; i++) {
            const pose = evalSegment(seg, i / samples * seg.length);
            if (vehicleBlockedIn(town2, { ...pose, halfLength, halfWidth })) return false;
          }
          return true;
        };
        if (segments.every(clear)) return segments;
      }
      return null;
    }
    if (!pivot) return loop2.segments;
    return compileNodeCycle(town2, loop2.nodeIds, {
      laneOffset: 5.8,
      turnRadius: turn,
      filletRadius: model === "bus" ? 48 : 26,
      ringOffset: 2
    });
  }
  var stopSpacing = 240;
  var stopTime = 3.4;
  function busStop(c, route, probe, desired, dt) {
    route.stopIn ??= 70 + route.id * 53 % 130;
    if (route.stopFor > 0) {
      if (route.speed < 0.5) route.stopFor -= dt;
      if (route.stopFor <= 0) {
        route.stopFor = 0;
        route.stopIn = stopSpacing;
        route.wait = 0;
        return desired;
      }
      return 0;
    }
    route.stopIn -= route.speed * dt;
    const clearRoad = probe.seg.roadClass === "avenue" && !probe.turning && probe.remaining > 58 + c.halfLength && route.lane === 0 && route.laneTarget === 0;
    if (route.stopIn <= 0 && clearRoad && probe.s > 43 + c.halfLength) {
      route.stopFor = stopTime;
      return 0;
    }
    return desired;
  }

  // src/world/population.js
  function car2(x, y, a, tint, model, route) {
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
      slideY: 0
    };
    cars.push(v);
    return v;
  }
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
  var sedanSpot = findSedanSpot();
  var sedan = car2(sedanSpot.x, sedanSpot.y, sedanSpot.a, "cream", "\xC9tude 2000");
  sedan.home = { ...sedanSpot };
  var target = car2(X(5) + 95, Y(2) - 10, Math.PI, "gold", "Moutarde GT");
  var colors = ["blue", "olive", "rose", "silver"];
  var civilianLooks = [{ look: "civilian" }, { look: "worker" }, { look: "lady" }];
  var fighterLooks = [
    { look: "flatCap", konamiLook: "mariniere" },
    { look: "bomber" },
    { look: "rigger" },
    { look: "chelsea" },
    { look: "flatCap" }
  ];
  var nextReinforcement = 0;
  function isFighter(kind) {
    return kind === "tough" || kind === "inspector";
  }
  function fighterLook(n) {
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
  function person(x, y, kind = "local", axis2 = "x", random = rand) {
    if (footBlocked(x, y, 3)) {
      let clear;
      for (let r = 2; r <= 32 && !clear; r += 2)
        clear = [
          [0, r],
          [r, 0],
          [-r, 0],
          [0, -r]
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
      axis: axis2,
      sign: random() < 0.5 ? -1 : 1,
      pace: 13 + random() * 6,
      patrol: 25 + random() * 23,
      rest: random() * 0.55,
      down: 0,
      anger: 0,
      cool: 0
    };
    people.push(n);
    return n;
  }
  var loopCache = /* @__PURE__ */ new Map();
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
  var showpieces = [
    ["moto", 125],
    ["suv", 162],
    ["volta", 203],
    ["bus", -162],
    ["dumper", -95]
  ];
  for (const [model, offset] of showpieces) {
    const y = Y(office.row) - 16;
    const preferred = X(office.col) + offset;
    for (let delta = 0; delta < 32; delta++) {
      const x = [preferred + delta, preferred - delta].find((x2) => freeParking(x2, y, model));
      if (x === void 0) continue;
      const v = car2(x, y, Math.PI, model === "volta" ? "silver" : "blue", model);
      v.showpiece = true;
      break;
    }
  }
  function populate(col, row, key) {
    const meta = town.cellMeta(col, row);
    if (meta.isRiverRow && !meta.isIsland) return;
    let seed2 = (Math.imul(col + 11, 73856093) ^ Math.imul(row + 7, 19349663)) >>> 0;
    const random = () => {
      seed2 = Math.imul(seed2, 1664525) + 1013904223 >>> 0;
      return seed2 / 4294967296;
    };
    const cellSeed = seed2;
    const draw2 = (salt) => () => {
      let h = (cellSeed ^ salt) >>> 0;
      h = Math.imul(h ^ h >>> 16, 2246822507);
      h = Math.imul(h ^ h >>> 13, 3266489909);
      return ((h ^ h >>> 16) >>> 0) / 4294967296;
    };
    const east = town.roadAdj.get(meta.node?.id)?.find(({ to }) => to === town.roadNodeAt(col + 1, row)?.id);
    if (col < town.cols - 1 && east && east.edge.class !== "alley" && meta.node?.kind !== "roundabout" && (col + row) % 2 && !(col === office.col && row === office.row) && !(col === 5 && row === 2)) {
      const model2 = pickModel(east.edge.class, draw2(7), true);
      const kerbX3 = X(col) + 112, y = Y(row) - 16;
      for (let offset = 0; offset < CELL_W / 2 - 48; offset++) {
        const x = [kerbX3 + offset, kerbX3 - offset].find(
          (cand) => Math.abs(cand - X(col)) > 58 && !(town.ring?.stations || []).some((st) => Math.hypot(cand - st.street.x, y - st.street.y) < 28) && freeParking(cand, y, model2)
        );
        if (x !== void 0) {
          car2(x, y, Math.PI, colors[(col + row) % 4], model2 === "sedan" ? "Biscotte" : model2).homeCell = key;
          break;
        }
      }
    }
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
      const ax = meta.node.x, ay = meta.node.y;
      if (!footBlocked(ax, ay, 3)) {
        person(ax, ay, "local", random() < 0.5 ? "x" : "y", random).homeCell = key;
      }
    }
    if (col >= town.cols - 1 || row >= town.rows - 1 || (col + row * 2) % 5 === 4) return;
    const narrow = cachedLoop(col, row, true);
    const loop2 = narrow?.class === "alley" ? narrow : cachedLoop(col, row, false);
    if (!loop2) return;
    const model = pickModel(routeClass(loop2), draw2(1));
    const spec = fleet[model];
    const segments = compileFleetLoop(town, loop2, model);
    if (!segments) return;
    const clearance = Math.max(18, spec.halfLength + 4);
    const straights = segments.map((seg, idx) => ({ seg, idx })).filter(({ seg }) => seg.type === "line" && seg.length > 2 * clearance);
    if (!straights.length) return;
    const pick = straights[Math.floor(random() * straights.length)];
    const s = clearance + random() * (pick.seg.length - 2 * clearance);
    const pose = evalSegment(pick.seg, s);
    const body = { ...pose, halfLength: spec.halfLength, halfWidth: spec.halfWidth };
    if (vehicleBlocked(body) || cars.some((other) => carContact(body, other))) return;
    const q = Math.floor(random() * 4);
    car2(pose.x, pose.y, pose.a, colors[q], model === "sedan" ? "Citadine" : model, {
      class: loop2.class,
      segments,
      segIndex: pick.idx,
      s,
      pace: 24 + q * 6
    }).homeCell = key;
  }
  var sleeping = /* @__PURE__ */ new Map();
  var loaded = /* @__PURE__ */ new Set();
  var lastBlock = "";
  var lastWidth = 0;
  var lastHeight = 0;
  function streamPopulation(x, y, w = 300, h = 220) {
    const { col, row } = town.cellAt(x, y), key = col + "," + row;
    if (lastBlock === key && lastWidth === w && lastHeight === h) return;
    lastBlock = key;
    lastWidth = w;
    lastHeight = h;
    const area = town.visibleCells(X(col) - w / 2, Y(row) - h / 2, w, h, 310);
    const next = /* @__PURE__ */ new Set();
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
      ["people", people]
    ]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const entity = list[i], store = sleeping.get(entity.homeCell);
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

  // src/art/vehicles.js
  function shadow(x, y, w, h) {
    g.fillStyle = "#15112580";
    g.beginPath();
    g.ellipse(x + 0.7, y + 0.2, w, h, 0, 0, TAU);
    g.fill();
  }
  var paintRows = { cream: 0, blue: 1, gold: 2, olive: 3, rose: 4, silver: 5 };
  var motorCache = /* @__PURE__ */ new WeakMap();
  var noseCompression = 0.53;
  function bodyCrush(condition) {
    return clamp((60 - (condition ?? 100)) / 60, 0, 1);
  }
  function renderMotor(v) {
    const previous = motorCache.get(v);
    if (previous && previous.angle === v.a && previous.condition === v.condition) return previous.canvas;
    const surface = previous?.canvas || document.createElement("canvas");
    if (!previous) {
      surface.width = 224;
      surface.height = 192;
    }
    const c = surface.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 224, 192);
    c.setTransform(7, 0, 0, 7, 112, 110);
    c.lineJoin = "round";
    const co = Math.cos(v.a), si = Math.sin(v.a), sourceY = paintRows[v.tint] * 64;
    const wrecked = v.condition === 0, crush = bodyCrush(v.condition);
    function project(u, w, z2) {
      if (crush) {
        const nose = Math.max(0, u - 4);
        u -= nose * crush * noseCompression;
        w += nose * crush * 0.21;
        z2 -= Math.max(0, z2 - 3) * crush * 0.53 + crush * (0.35 + Math.max(0, w) * 0.13);
      }
      return [u * co - w * si, u * si + w * co - z2 * 0.77];
    }
    function face2(column2, points, outline = true) {
      const [a, b2, d, e] = points.map((n) => project(...n));
      for (const tri of [
        [a, b2, d],
        [a, d, e]
      ]) {
        const [u, v2, w] = tri;
        c.save();
        c.beginPath();
        c.moveTo(...u);
        c.lineTo(...v2);
        c.lineTo(...w);
        c.closePath();
        c.clip();
        const right = v2 === b2 ? [b2[0] - a[0], b2[1] - a[1]] : [d[0] - e[0], d[1] - e[1]];
        const bottom = v2 === b2 ? [d[0] - b2[0], d[1] - b2[1]] : [e[0] - a[0], e[1] - a[1]];
        c.transform(right[0], right[1], bottom[0], bottom[1], a[0], a[1]);
        c.drawImage(artwork.motor, column2 * 128, sourceY, 128, 64, 0, 0, 1, 1);
        c.restore();
      }
      if (outline) {
        c.beginPath();
        c.moveTo(...a);
        c.lineTo(...b2);
        c.lineTo(...d);
        c.lineTo(...e);
        c.closePath();
        c.strokeStyle = "#33252b";
        c.lineWidth = 0.18;
        c.stroke();
      }
    }
    function trim(points, color) {
      c.fillStyle = color;
      c.beginPath();
      for (const [i, vertex] of points.entries()) {
        const q = project(...vertex);
        if (i) c.lineTo(...q);
        else c.moveTo(...q);
      }
      c.closePath();
      c.fill();
    }
    const b = sedanHalfWidth, r = 3.85, z = 4.2, top2 = 7.3, endWidth = 4.05, end = sedanHalfLength;
    for (const side2 of [-1, 1]) {
      if (side2 * co < -1e-3) continue;
      face2(0, [
        [-10.05, side2 * b, 3.85],
        [10.05, side2 * b, 3.85],
        [10.05, side2 * b, 1.15],
        [-10.05, side2 * b, 1.15]
      ]);
    }
    for (const sign of [-1, 1]) {
      for (const side2 of [-1, 1]) {
        if (side2 * co + sign * si < 0) continue;
        const near = 10.05 * sign, outer = end * sign;
        trim(
          [
            [near, side2 * b, 3.85],
            [outer, side2 * endWidth, 3.58],
            [outer, side2 * endWidth, 2.4],
            [near, side2 * b, 2.4]
          ],
          sign > 0 ? "#ffc66b" : "#aa494c"
        );
        trim(
          [
            [near, side2 * b, 2.4],
            [outer, side2 * endWidth, 2.4],
            [outer, side2 * endWidth, 1.1],
            [near, side2 * b, 1.15]
          ],
          "#655158"
        );
      }
    }
    if (si > 0)
      face2(7, [
        [end, endWidth, 3.58],
        [end, -endWidth, 3.58],
        [end, -endWidth, 1.1],
        [end, endWidth, 1.1]
      ]);
    else
      face2(8, [
        [-end, -endWidth, 3.58],
        [-end, endWidth, 3.58],
        [-end, endWidth, 1.1],
        [-end, -endWidth, 1.1]
      ]);
    face2(2, [
      [4.6, b, z],
      [4.6, -b, z],
      [end, -endWidth, 3.58],
      [end, endWidth, 3.58]
    ]);
    face2(4, [
      [-6.9, -b, z],
      [-6.9, b, z],
      [-end, endWidth, 3.58],
      [-end, -endWidth, 3.58]
    ]);
    for (const side2 of [-1, 1]) {
      if (side2 * co < -0.397) continue;
      face2(1, [
        [-4.45, side2 * r, top2],
        [2.1, side2 * r, top2],
        [4.6, side2 * b, z],
        [-6.9, side2 * b, z]
      ]);
    }
    face2(5, [
      [2.1, r, top2],
      [2.1, -r, top2],
      [4.6, -b, z],
      [4.6, b, z]
    ]);
    face2(6, [
      [-4.45, -r, top2],
      [-4.45, r, top2],
      [-6.9, b, z],
      [-6.9, -b, z]
    ]);
    face2(3, [
      [-4.45, r, top2],
      [-4.45, -r, top2],
      [2.1, -r, top2],
      [2.1, r, top2]
    ]);
    const side = co < 0 ? -1 : 1;
    trim(
      [
        [3.1, side * 4.45, 4.5],
        [3.8, side * 5.3, 4.6],
        [3.3, side * 5.7, 4.9],
        [2.65, side * 5.2, 4.9]
      ],
      "#443743"
    );
    trim(
      [
        [3.15, side * 4.8, 4.82],
        [3.67, side * 5.25, 4.85],
        [3.35, side * 5.52, 5.02],
        [2.86, side * 5.15, 5.02]
      ],
      "#cfb7a7"
    );
    for (const u of [-6.9, 6.9])
      face2(
        9,
        [
          [u - 1.9, side * 4.9, 3.55],
          [u + 1.9, side * 4.9, 3.55],
          [u + 1.9, side * 4.9, -0.1],
          [u - 1.9, side * 4.9, -0.1]
        ],
        false
      );
    if (v.condition < 97) {
      const damage = 1 - v.condition / 100;
      const scratch = (path, col, weight) => {
        c.beginPath();
        for (const [i, pt] of path.entries()) {
          const q = project(...pt);
          if (i) c.lineTo(...q);
          else c.moveTo(...q);
        }
        c.strokeStyle = col;
        c.lineWidth = weight;
        c.stroke();
      };
      scratch(
        [
          [6.2, 1.3, 4.13],
          [7.8, -0.15, 4],
          [8.4, 0.3, 3.95],
          [9.9, -1, 3.78]
        ],
        "#514448",
        0.17 + damage * 0.12
      );
      if (v.condition < 76) {
        trim(
          [
            [8, -3, 3.97],
            [10.9, -3.6, 3.6],
            [10, 0.2, 3.7],
            [9.1, -0.9, 3.8]
          ],
          "#5a454d99"
        );
        scratch(
          [
            [2.7, 0.7, 6.53],
            [3.25, 1.95, 5.86],
            [3.52, 1.65, 5.48],
            [4.02, 2.85, 4.9]
          ],
          "#bedce3",
          0.18
        );
      }
      if (v.condition < 44) {
        scratch(
          [
            [2.75, 0.7, 6.55],
            [3.35, -0.25, 5.8],
            [3.55, -1.6, 5.55]
          ],
          "#e6e6cf",
          0.21
        );
        trim(
          [
            [7.4, -2.7, 4],
            [8.8, -3.15, 3.9],
            [10.1, -1, 3.74],
            [8.1, -0.4, 3.96]
          ],
          "#45383caa"
        );
      }
    }
    if (wrecked) {
      trim(
        [
          [4.6, -3.9, 4.25],
          [10.8, -3.4, 3.72],
          [10.3, 3.6, 3.72],
          [4.7, 3.9, 4.28]
        ],
        "#302831"
      );
      trim(
        [
          [5.6, -2.1, 4.6],
          [9.9, -1.8, 4.4],
          [9.8, 1.7, 4.1],
          [5.6, 1.9, 4.4]
        ],
        "#71605c"
      );
      for (let i = 0; i < 4; i++) {
        const u = 6.1 + i * 0.85;
        trim(
          [
            [u, -1.7, 4.75],
            [u + 0.32, -1.7, 4.77],
            [u + 0.32, 1.35, 4.52],
            [u, 1.35, 4.52]
          ],
          "#322e35"
        );
      }
      trim(
        [
          [5.2, -4.3, 4.4],
          [7.1, -3.7, 8.2],
          [7.8, -1.5, 6.95],
          [8.5, 0.3, 8.3],
          [6.2, 1.3, 4.5]
        ],
        "#847077"
      );
      trim(
        [
          [5.2, -4.3, 4.4],
          [7.1, -3.7, 8.2],
          [7.8, -1.5, 6.95]
        ],
        "#b6a09a"
      );
      trim(
        [
          [2.35, -3.35, 7.12],
          [3.2, -1.4, 5.65],
          [2.63, -0.5, 6.83],
          [3.55, 0.4, 5.3],
          [2.7, 1.3, 6.7],
          [3.65, 3.5, 5.17],
          [4.35, 3.7, 4.5],
          [4.28, -3.86, 4.54]
        ],
        "#211d29"
      );
      trim(
        [
          [10, -4.05, 2.9],
          [14.4, -1.85, 0.71],
          [13.8, 3.55, 0.3],
          [12.9, 3.4, 0.76],
          [13.3, -1.7, 1.13],
          [9.8, -4.13, 2.4]
        ],
        "#a3948b"
      );
      trim(
        [
          [-4.2, -2.8, 7.45],
          [-2.7, -0.9, 7.4],
          [-0.8, -1, 7.41],
          [1.35, 2.95, 7.42],
          [-1.35, 0.1, 7.44],
          [-2.9, 0.1, 7.4]
        ],
        "#69575d"
      );
      c.save();
      c.globalCompositeOperation = "source-atop";
      c.fillStyle = "rgba(45,34,40,.27)";
      c.fillRect(-17, -17, 34, 34);
      c.restore();
    }
    motorCache.set(v, { angle: v.a, condition: v.condition, canvas: surface });
    return surface;
  }
  function drawCar(v) {
    if (v.condition !== 0 && (v === game.ride || v.route)) {
      g.save();
      g.translate(v.x, v.y);
      g.rotate(v.a);
      const light = g.createRadialGradient(8, 0, 0, 14, 0, 23);
      light.addColorStop(0, "#ffce7240");
      light.addColorStop(1, "#ffd67c00");
      g.fillStyle = light;
      g.beginPath();
      g.moveTo(7, -3);
      g.lineTo(36, -8);
      g.lineTo(36, 8);
      g.lineTo(7, 3);
      g.fill();
      g.restore();
    }
    g.save();
    g.translate(v.x + 0.65, v.y + 0.9);
    g.rotate(v.a);
    g.fillStyle = "#17132183";
    g.beginPath();
    const shortening = (sedanHalfLength - 4) * bodyCrush(v.condition) * noseCompression;
    g.ellipse(-shortening / 2, 0, 11.4 - shortening / 2, 4.9, 0, 0, TAU);
    g.fill();
    g.restore();
    g.drawImage(renderMotor(v), v.x - 16, v.y - 110 / 7, 32, 192 / 7);
    drawDamageSmoke(v);
  }
  function drawDamageSmoke(v, nose = 7) {
    if (v.condition < 42) {
      const wrecked = v.condition === 0, count = wrecked ? 9 : 4, reach2 = wrecked ? 27 : 13;
      const baseX = v.x + nose * Math.cos(v.a), baseY = v.y + nose * Math.sin(v.a) - 3;
      const clock = game.time * (wrecked ? 0.54 : 0.78) + v.x * 0.013 + v.y * 9e-3;
      g.save();
      for (let i = count - 1; i >= 0; i--) {
        const age = (clock + i / count) % 1, swirl = Math.sin(game.time * 1.4 + i * 2.3);
        const x = baseX + age * (wrecked ? -6 : -2) + swirl * (0.3 + age * 1.65), y = baseY - age * reach2;
        const radius = (wrecked ? 1.85 : 1.1) + age * (wrecked ? 5.3 : 2.4);
        g.globalAlpha = (1 - age) * (wrecked ? 0.79 : 0.5);
        g.fillStyle = age < 0.46 ? "#514c58" : "#958e99";
        g.beginPath();
        g.ellipse(x, y, radius, radius * 0.81, 0, 0, TAU);
        g.fill();
        if (wrecked) {
          g.beginPath();
          g.arc(x + radius * 0.58, y - radius * 0.28, radius * 0.69, 0, TAU);
          g.fill();
        }
      }
      g.restore();
    }
  }

  // src/audio/mixer.js
  var gameMix;
  var engineOsc;
  var engineGain;
  var engineFilter;
  var engineChug;
  var chugDepth;
  var skidLoop;
  var skidGain;
  var hitNoise;
  var engines = {
    petrol: { wave: "sawtooth", idle: 35, rise: 0.72, span: 49, drop: 43, gears: 3, kick: 9, level: 0.069, push: 0.041, hum: 0, cutoff: 160, open: 0.91, bite: 80, chug: 0, pulse: 0 },
    // An electric motor has no gears and no idle: a thin whine that climbs with the speed.
    electric: { wave: "triangle", idle: 150, rise: 4.1, span: Infinity, drop: 0, gears: 0, kick: 55, level: 3e-3, push: 0.021, hum: 11e-5, cutoff: 520, open: 6.5, bite: 260, chug: 0, pulse: 0 },
    diesel: { wave: "sawtooth", idle: 23, rise: 0.56, span: 30, drop: 27, gears: 3, kick: 6, level: 0.105, push: 0.05, hum: 0, cutoff: 115, open: 0.7, bite: 55, chug: 0.5, pulse: 9 },
    moto: { wave: "square", idle: 58, rise: 1.5, span: 47, drop: 39, gears: 4, kick: 16, level: 0.034, push: 0.03, hum: 0, cutoff: 360, open: 2.3, bite: 330, chug: 0.42, pulse: 19 },
    boat: { wave: "sawtooth", idle: 27, rise: 0.16, span: Infinity, drop: 0, gears: 0, kick: 20, level: 0.069, push: 0.041, hum: 0, cutoff: 104, open: 0.43, bite: 90, chug: 0, pulse: 0 }
  };
  var signalVoice;
  var crashClips = /* @__PURE__ */ new Map();
  var signalClips = /* @__PURE__ */ new Map();
  function noiseGenerator(seed2) {
    return () => {
      seed2 = Math.imul(seed2, 1664525) + 1013904223 >>> 0;
      return seed2 / 2147483648 - 1;
    };
  }
  function makeTyreLoop() {
    const buffer = game.audio.createBuffer(1, game.audio.sampleRate, game.audio.sampleRate), samples = buffer.getChannelData(0);
    const noise = noiseGenerator(73153);
    let smooth = 0, low = 0;
    for (let i = 0; i < samples.length; i++) {
      const t2 = TAU * i / samples.length;
      smooth += 0.3 * (noise() - smooth);
      low += 0.045 * (smooth - low);
      const chatter = 0.72 + 0.22 * Math.sin(6 * t2 + 0.8 * Math.sin(t2));
      const pitch = 747 * t2 + 2.1 * Math.sin(7 * t2) + 0.5 * Math.sin(29 * t2);
      samples[i] = chatter * (0.39 * Math.sin(pitch) + 0.15 * Math.sin(1102 * t2 + 1.4 * Math.sin(11 * t2))) + 0.81 * (smooth - low);
    }
    return buffer;
  }
  function makeHornLoop(ship = false) {
    const rate = game.audio.sampleRate;
    const buffer = game.audio.createBuffer(1, rate, rate);
    const samples = buffer.getChannelData(0);
    const reed = (phase) => 0.52 * Math.sin(phase) + 0.28 * Math.sin(2 * phase - 0.7) + 0.13 * Math.sin(3 * phase + 0.5) + 0.06 * Math.sin(5 * phase);
    for (let i = 0; i < samples.length; i++) {
      const t2 = TAU * i / rate;
      const low = reed((ship ? 126 : 382) * t2 + 0.026 * Math.sin(5 * t2));
      const high = reed((ship ? 158 : 483) * t2 + 0.023 * Math.sin(7 * t2));
      samples[i] = (0.56 * low + 0.44 * high) * (0.96 + 0.04 * Math.sin(6 * t2));
    }
    return buffer;
  }
  function makeSirenLoop() {
    const rate = game.audio.sampleRate;
    const buffer = game.audio.createBuffer(1, rate, rate);
    const samples = buffer.getChannelData(0);
    const notes = [690, 520, 690];
    for (const [note, frequency] of notes.entries()) {
      const start = Math.round(note * 0.28 * rate);
      const length = Math.round(0.25 * rate);
      for (let i = 0; i < length; i++) {
        const t2 = i / rate;
        const attack = Math.min(1, t2 / 0.021);
        const release2 = Math.min(1, (length - 1 - i) / (0.034 * rate));
        const phase = TAU * frequency * (t2 - 11e-4 * (1 - Math.exp(-t2 / 0.018)));
        samples[start + i] = attack * release2 * (0.69 * Math.sin(phase) + 0.2 * Math.sin(2 * phase) + 0.11 * Math.sin(3 * phase));
      }
    }
    return buffer;
  }
  function signalClip(mode) {
    if (!signalClips.has(mode)) signalClips.set(mode, mode === "siren" ? makeSirenLoop() : makeHornLoop(mode === "ship"));
    return signalClips.get(mode);
  }
  function shipHornSound(volume) {
    if (!game.sound || !gameMix || game.audio.state !== "running") return;
    const now = game.audio.currentTime;
    const source = game.audio.createBufferSource(), gain = game.audio.createGain();
    source.buffer = signalClip("ship");
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16 * volume, now + 0.07);
    gain.gain.setValueAtTime(0.16 * volume, now + 0.35);
    gain.gain.linearRampToValueAtTime(0, now + 0.66);
    source.connect(gain);
    gain.connect(gameMix);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(now);
    source.stop(now + 0.66);
  }
  function vehicleSignalSound(mode) {
    if (!gameMix) return;
    if (!game.sound) mode = null;
    if (mode === (signalVoice?.mode ?? null)) return;
    const now = game.audio.currentTime;
    if (signalVoice) {
      signalVoice.gain.gain.setTargetAtTime(0, now, 0.018);
      signalVoice.source.stop(now + 0.1);
      signalVoice = null;
    }
    if (!mode) return;
    const source = game.audio.createBufferSource();
    const gain = game.audio.createGain();
    source.buffer = signalClip(mode);
    source.loop = true;
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(gameMix);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    gain.gain.setTargetAtTime(mode === "horn" ? 0.38 : 0.31, now, 0.011);
    source.start(now);
    signalVoice = { mode, source, gain };
  }
  function prepareAudio() {
    if (gameMix) return;
    gameMix = game.audio.createGain();
    gameMix.gain.value = 0.75;
    gameMix.connect(game.audio.destination);
    engineOsc = game.audio.createOscillator();
    engineOsc.type = "sawtooth";
    engineFilter = game.audio.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 230;
    engineGain = game.audio.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(gameMix);
    engineOsc.start();
    engineChug = game.audio.createOscillator();
    engineChug.type = "sine";
    engineChug.frequency.value = 9;
    chugDepth = game.audio.createGain();
    chugDepth.gain.value = 0;
    engineChug.connect(chugDepth);
    chugDepth.connect(engineGain.gain);
    engineChug.start();
    skidLoop = game.audio.createBufferSource();
    skidLoop.buffer = makeTyreLoop();
    skidLoop.loop = true;
    skidGain = game.audio.createGain();
    skidGain.gain.value = 0;
    skidLoop.connect(skidGain);
    skidGain.connect(gameMix);
    skidLoop.start(game.audio.currentTime);
    crashClips.clear();
    hitNoise = null;
  }
  function motorSound() {
    if (!engineGain) return;
    const running = game.sound && game.ride && game.ride.condition !== 0 && !game.viewMap && !panel.open, now = game.audio.currentTime;
    const boat = running && game.ride.domain === "water";
    const throttle = boat ? Math.abs(throttleInput()) : Math.max(0, throttleInput());
    const voice = engines[boat ? "boat" : fleetOf(game.ride).sound];
    const roll = running ? Math.hypot(game.ride.slideX, game.ride.slideY) : 0;
    const revs = !running ? 0 : boat ? roll : Math.abs(game.ride.speed);
    const level = running ? voice.level + voice.push * throttle + voice.hum * revs : 0;
    engineGain.gain.setTargetAtTime(level, now, 0.07);
    chugDepth.gain.setTargetAtTime(level * voice.chug * clamp(1.2 - revs / 110, 0.25, 1), now, 0.07);
    let friction = 0;
    if (!boat && held.has("action") && roll > 7) {
      const sideSlip = Math.abs(
        game.ride.slideY * Math.cos(game.ride.a) - game.ride.slideX * Math.sin(game.ride.a)
      );
      const load = clamp((roll - 7) / 90, 0, 1), side = clamp(sideSlip / 55, 0, 1);
      friction = clamp((roll - 7) / 14, 0, 1) * (0.09 + 0.37 * Math.sqrt(load) + 0.12 * side);
      skidLoop.playbackRate.setTargetAtTime(0.69 + 0.46 * load + 0.18 * side, now, 0.04);
    }
    skidGain.gain.setTargetAtTime(friction, now, friction ? 0.024 : 0.033);
    if (!running) return;
    const speed = revs, gear = Math.min(voice.gears, Math.floor(speed / voice.span));
    if (engineOsc.type !== voice.wave) engineOsc.type = voice.wave;
    engineOsc.frequency.setTargetAtTime(voice.idle + (speed - gear * voice.drop) * voice.rise + voice.kick * throttle, now, 0.075);
    engineFilter.frequency.setTargetAtTime(voice.cutoff + speed * voice.open + voice.bite * throttle, now, 0.1);
    if (voice.pulse) engineChug.frequency.setTargetAtTime(voice.pulse + speed * 0.09, now, 0.1);
  }
  function crashClip(kind, heavy) {
    const key = kind + (heavy ? "!" : "");
    if (crashClips.has(key)) return crashClips.get(key);
    const body = kind === "body", rate = game.audio.sampleRate, length = heavy ? 0.65 : 0.3;
    const buffer = game.audio.createBuffer(1, Math.ceil(length * rate), rate), samples = buffer.getChannelData(0);
    const noise = noiseGenerator(body ? 8969 : 2393);
    const pulses = heavy ? [0, 0.013, 0.031, 0.049, 0.084, 0.111, 0.158, 0.216, 0.279] : [0, 0.011, 0.035, 0.065];
    const pulseDecay = Math.exp(-1 / (rate * (body ? 0.016 : 9e-3)));
    let mid = 0, low = 0, burst = 0, pulse = 0;
    for (let i = 0; i < samples.length; i++) {
      const t2 = i / rate, n = noise();
      if (pulse < pulses.length && t2 >= pulses[pulse]) {
        burst += Math.pow(0.8, pulse);
        pulse++;
      }
      const attack = Math.min(1, t2 / 14e-4);
      const compression = 1 - Math.exp(-t2 / 0.018);
      const bass = Math.sin(TAU * ((heavy ? 43 : 68) * t2 + 1.72 * compression)) * Math.exp(-t2 * (heavy ? 14 : 28));
      const knock = Math.sin(TAU * ((body ? 168 : 205) * t2 + 1.15 * compression)) * Math.exp(-t2 * 32);
      mid += 0.4 * (n - mid);
      low += 0.065 * (mid - low);
      const crush = burst * (1.95 * (mid - low) + 0.55 * (n - mid));
      const metal = (0.7 * Math.sin(TAU * (body ? 438 : 697) * t2) + 0.3 * Math.sin(TAU * (body ? 791 : 1013) * t2)) * Math.exp(-t2 * (body ? 19 : 45));
      const grit = heavy && t2 > 0.1 ? burst * (n - mid) * 1.2 : 0;
      const wave = 0.91 * bass + 0.47 * knock + (body ? 0.99 : 0.81) * crush + (body ? 0.19 : 0.1) * metal + grit;
      samples[i] = attack * Math.min(1, (length - t2) / 0.014) * Math.tanh(wave * 1.4);
      burst *= pulseDecay;
    }
    crashClips.set(key, buffer);
    return buffer;
  }
  function crashSound(force, kind) {
    if (!game.sound || !game.audio || !gameMix) return;
    const now = game.audio.currentTime;
    if (kind === "body" || kind === "wall") {
      const heavy = clamp((force - 30) / 102, 0, 1), level = clamp(0.1 + force / 150, 0.12, 1.17);
      for (const hard of [false, true]) {
        const volume = level * (hard ? heavy : 1 - heavy);
        if (!volume) continue;
        const clip = game.audio.createBufferSource(), gain2 = game.audio.createGain();
        clip.buffer = crashClip(kind, hard);
        clip.playbackRate.value = 1.1 - 0.18 * heavy;
        gain2.gain.value = volume;
        clip.connect(gain2);
        gain2.connect(gameMix);
        clip.start(now);
      }
      return;
    }
    const power = clamp(force / 130, 0.14, 1), skin = kind === "slap";
    if (!hitNoise) {
      hitNoise = game.audio.createBuffer(1, Math.ceil(game.audio.sampleRate * 0.18), game.audio.sampleRate);
      const samples = hitNoise.getChannelData(0), noise2 = noiseGenerator(9137);
      for (let i = 0; i < samples.length; i++) samples[i] = noise2();
    }
    const noise = game.audio.createBufferSource(), filter = game.audio.createBiquadFilter(), env = game.audio.createGain();
    const length = skin ? 0.085 : 0.145;
    noise.buffer = hitNoise;
    filter.type = skin ? "highpass" : "bandpass";
    filter.frequency.value = skin ? 900 : 300;
    filter.Q.value = 0.62;
    env.gain.setValueAtTime(1e-3, now);
    env.gain.exponentialRampToValueAtTime((skin ? 0.62 : 0.85) * power, now + 6e-3);
    env.gain.exponentialRampToValueAtTime(1e-3, now + length);
    noise.connect(filter);
    filter.connect(env);
    env.connect(gameMix);
    noise.start(now);
    noise.stop(now + length);
    const tone = game.audio.createOscillator(), gain = game.audio.createGain(), duration = skin ? 0.065 : 0.18;
    tone.type = "triangle";
    tone.frequency.setValueAtTime(skin ? 175 : 105, now);
    tone.frequency.exponentialRampToValueAtTime(skin ? 75 : 39, now + duration);
    gain.gain.setValueAtTime((skin ? 0.24 : 0.44) * power, now);
    gain.gain.exponentialRampToValueAtTime(1e-4, now + duration);
    tone.connect(gain);
    gain.connect(gameMix);
    tone.start(now);
    tone.stop(now + duration);
  }
  async function enableAudio() {
    if (!game.sound || gameMix && game.audio?.state !== "suspended") return;
    try {
      game.audio ??= new AudioContext();
      prepareAudio();
      await game.audio.resume();
    } catch {
    }
  }
  function footfall(distance) {
    if (!game.sound || !gameMix) return;
    const now = game.audio.currentTime, osc = game.audio.createOscillator(), gain = game.audio.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(distance % 2 ? 155 : 178, now);
    osc.frequency.exponentialRampToValueAtTime(51, now + 0.06);
    gain.gain.setValueAtTime(1e-4, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 4e-3);
    gain.gain.exponentialRampToValueAtTime(1e-4, now + 0.08);
    osc.connect(gain);
    gain.connect(gameMix);
    osc.start();
    osc.stop(now + 0.085);
  }
  function beep(f = 240, d = 0.09, type = "square") {
    if (!game.sound || !gameMix) return;
    const o = game.audio.createOscillator(), v = game.audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, game.audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(f * 0.58, game.audio.currentTime + d);
    v.gain.setValueAtTime(0.045, game.audio.currentTime);
    v.gain.exponentialRampToValueAtTime(1e-3, game.audio.currentTime + d);
    o.connect(v);
    v.connect(gameMix);
    o.start();
    o.stop(game.audio.currentTime + d);
  }

  // src/world/viewport.js
  function viewport(cx, cy, width2, height2, worldWidth, worldHeight) {
    const left2 = Math.min(Math.max(cx - width2 / 2, 0), Math.max(0, worldWidth - width2));
    const top2 = Math.min(Math.max(cy - height2 / 2, 0), Math.max(0, worldHeight - height2));
    return { left: left2, top: top2, right: left2 + width2, bottom: top2 + height2 };
  }
  function outsideView(point, view, margin = 38) {
    return point.x + margin < view.left || point.x - margin > view.right || point.y + margin < view.top || point.y - margin > view.bottom;
  }

  // src/world/ambulance-route.js
  function walkableBetween(a, b) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      if (blocked(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 2)) return false;
    }
    return true;
  }
  function planApproach(patient, view, occupied) {
    const { col, row } = town.cellAt(patient.x, patient.y);
    const candidates = [
      { horizontal: true, centre: Y(row), along: patient.x, cross: patient.y },
      { horizontal: false, centre: X(col), along: patient.y, cross: patient.x }
    ];
    for (const dr of [-1, 1]) {
      if (row + dr >= 0 && row + dr < town.rows && Math.abs(patient.y - Y(row + dr)) < 90)
        candidates.push({ horizontal: true, centre: Y(row + dr), along: patient.x, cross: patient.y });
    }
    for (const dc of [-1, 1]) {
      if (col + dc >= 0 && col + dc < town.cols && Math.abs(patient.x - X(col + dc)) < 90)
        candidates.push({ horizontal: false, centre: X(col + dc), along: patient.y, cross: patient.x });
    }
    candidates.sort((a, b) => Math.abs(a.cross - a.centre) - Math.abs(b.cross - b.centre));
    for (const road of candidates) {
      const { horizontal, centre, along: along2, cross } = road;
      const point = (u, w) => horizontal ? { x: u, y: w } : { x: w, y: u };
      const extent = horizontal ? W : H;
      const bounds = horizontal ? [view.left, view.right] : [view.top, view.bottom];
      const curb = Math.sign(cross - centre) || 1;
      for (const inset of [11, 5, -6, 0, -11])
        for (const shift of [0, 14, -14, 27, -27]) {
          const apron = point(along2 + shift, centre + curb * inset);
          if (!walkableBetween(apron, patient)) continue;
          const offset = curb * inset, flow = horizontal ? Math.sign(offset) : -Math.sign(offset), first = flow || (along2 < extent / 2 ? -1 : 1);
          for (const sign of [first, -first]) {
            const end = along2 + shift + sign * 24;
            if (end < 17 || end > extent - 17) continue;
            let start = end - sign * 65;
            if (!outsideView(point(start, centre + curb * inset), view))
              start = sign > 0 ? bounds[0] - 42 : bounds[1] + 42;
            if (start < 7 || start > extent - 7) continue;
            const stop = { ...point(end, centre + curb * inset), horizontal }, spawn = point(start, centre + curb * inset);
            if (!outsideView(spawn, view)) continue;
            const dx = horizontal ? sign : 0, dy = horizontal ? 0 : sign, a = Math.atan2(dy, dx);
            const steps = Math.ceil(Math.abs(end - start) / 4);
            let clear = true;
            for (let k = 0; k <= steps; k++) {
              const q = point(start + (end - start) * k / steps, centre + curb * inset);
              const van = { ...q, a, halfLength: 13.3, halfWidth: 5.45 };
              if (vehicleBlocked(van) || occupied(van)) {
                clear = false;
                break;
              }
            }
            if (clear) return { spawn, stop, apron, dx, dy, a };
          }
        }
    }
    return null;
  }

  // src/ui/strings.js
  var words = {
    goInside: ["Go inside the office", "Entrer dans l\u2019\xE9tude"],
    leaveRoom: ["{job} \xB7 Return to the street", "{job} \xB7 Retourner dans la rue"],
    caseDesk: ["{job} \xB7 Open the case files", "{job} \xB7 Ouvrir les dossiers"],
    officeFloor: ["Walk to the desk or the street door", "Rejoignez le bureau ou la sortie"],
    stolenMedic: [
      "You have borrowed a public service. Dispatch would like a word.",
      "Vous avez emprunt\xE9 un service public. La r\xE9gulation souhaite vous parler."
    ],
    medicKeys: ["{car} \xB7 Take the ambulance", "{car} \xB7 Prendre l\u2019ambulance"],
    medicHit: ["Occupational hazard. Apparently.", "Risque du m\xE9tier. Apparemment."],
    reportKey: ["{report} \xB7 Incident report", "{report} \xB7 Signalement"],
    incidentTitle: ["Street incident report", "Fiche d\u2019incident"],
    outrageTitle: ["Suspected outrage \xB7 Art. 433-5", "Signalement d\u2019outrage pr\xE9sum\xE9 \xB7 Art. 433-5"],
    tauntConsole: ["Seizing my Super Nintendo? At least save my game!", "Tu saisis ma Super Nintendo ? Sauvegarde, au moins !"],
    tauntPermit: ["No A38, no seizure. Next window!", "Pas d\u2019A38, pas de saisie. Guichet suivant !"],
    tauntMatches: ["Seizing my Eiffel Tower? Mind the matchsticks!", "Tu saisis ma tour Eiffel ? Gaffe aux allumettes !"],
    tauntCarioca: ["Well, Bial\xE8s? Do you charge extra for the Carioca?", "Alors, Bial\xE8s, la Carioca, tu la factures en plus ?"],
    tauntDoormat: ["Wrong door, Grimbert! Here to seize the doormat?", "Mauvaise porte, Grimbert ! Tu viens saisir le paillasson ?"],
    tauntCardigan: ["Put down \u201Ccardigan\u201D. A floorcloth would fetch more.", "Note \xAB gilet \xBB, ma\xEEtre. Une serpilli\xE8re vaudrait plus cher."],
    tauntGrail: ["Put the Grail down, Perceval! My anchovies are still in it!", "Repose le Graal, Perceval ! Y a encore mes anchois dedans !"],
    bystander: ["Pedestrian", "Passant"],
    outburst: ["\u201CYou little stamp-wielding toady!\u201D", "\xAB Sale petit larbin \xE0 tampon ! \xBB"],
    outrageCopy: [
      "During an enforcement assignment the pedestrian addressed me directly: \u201CYou little stamp-wielding toady!\u201D I also record the slaps I delivered. The report goes to the public prosecutor for assessment. The carbon copy is pink.",
      "Pendant une mission d\u2019ex\xE9cution, le passant m\u2019a lanc\xE9 \xAB Sale petit larbin \xE0 tampon ! \xBB. Je consigne aussi les gifles que je lui ai donn\xE9es. Le signalement est transmis au procureur de la R\xE9publique pour appr\xE9ciation. Le double est rose."
    ],
    scuffleCopy: [
      "I record the slaps I delivered and the pedestrian\u2019s fall. The box marked \u201CWho started it?\u201D is inconveniently small. A carbon copy is ready for the pedestrian.",
      "Je consigne les gifles que j\u2019ai donn\xE9es et la chute du passant. La case \xAB Qui a commenc\xE9 ? \xBB est malencontreusement \xE9troite. Le double est pr\xEAt \xE0 remettre."
    ],
    collisionCopy: [
      "I record that the vehicle I was driving struck this pedestrian. The office will need another sheet for the circumstances. A carbon copy is ready.",
      "Je consigne que le v\xE9hicule que je conduisais a heurt\xE9 ce passant. L\u2019\xE9tude aura besoin d\u2019un feuillet de plus pour les circonstances. Le double est pr\xEAt."
    ],
    serveCopy: ["File and hand over a copy", "Classer et remettre le double"],
    awaitMedics: ["Leave for the ambulance crew", "Laisser intervenir les secours"],
    copyServed: [
      "Copy received. The pedestrian leaves with the pink original of the duplicate.",
      "Double remis. Le passant repart avec l\u2019original rose du duplicata."
    ],
    lastIncident: ["Latest incident report", "Derni\xE8re fiche d\u2019incident"],
    nextCase: ["Next case", "Prochain dossier"],
    currentCase: ["Active case", "Dossier en cours"],
    openCase: ["Available", "Disponible"],
    casebook: ["Case files", "Dossiers"],
    fileSources: ["Pick up a file at its address or at the bailiff\u2019s office.", "Retirez un dossier \xE0 son adresse ou \xE0 l\u2019\xE9tude."],
    filesWaiting: ["The other files will be available when you close or return this one.", "Les autres dossiers seront disponibles une fois celui-ci clos ou rendu."],
    waitingCase: ["On the desk", "En attente"],
    filesClosed: ["All three cases are closed. Port-Fer is yours to explore.", "Les trois dossiers sont clos. Port-Fer est \xE0 vous."],
    repoSummary: ["Recover the overdue Moutarde GT and deliver it to auction.", "Saisissez la Moutarde GT et livrez-la aux ench\xE8res."],
    noiseSummary: ["Measure the bass outside Le Boum and sign the noise report.", "Relevez le niveau sonore devant Le Boum et signez le constat."],
    flatSummary: ["Inventory a gold karaoke deck and take it to auction.", "Inventoriez un karaok\xE9 dor\xE9 et portez-le aux ench\xE8res."],
    deskRoute: ["Choose a file at the desk", "Choisir un dossier au bureau"],
    exitRoute: ["Return to the street", "Rejoindre la sortie"],
    onSite: ["On site", "Sur place"],
    openFile: ["{job} \xB7 Collect a file", "{job} \xB7 Retirer un dossier"],
    visitPickup: ["Pick up the file", "Retirer le dossier"],
    goAddress: ["Go to the marked address", "Rejoindre l\u2019adresse indiqu\xE9e"],
    leaveVehicle: ["{car} \xB7 Get out, then use {job}", "{car} \xB7 Descendre, puis appuyer sur {job}"],
    useMeter: ["{job} \xB7 Take a sound reading", "{job} \xB7 Relever le niveau sonore"],
    inventoryHere: ["{job} \xB7 Inventory the karaoke deck", "{job} \xB7 Inventorier le karaok\xE9"],
    driveAuction: ["Deliver the lot", "Livrer le lot"],
    deliverCar: ["Deliver the GT", "Livrer la GT"],
    handOverCar: ["{job} \xB7 Hand over the GT", "{job} \xB7 Remettre la GT"],
    handOver: ["{job} \xB7 Hand over the lot", "{job} \xB7 Remettre le lot"],
    switchToTarget: ["{car} \xB7 Get out beside the yellow GT", "{car} \xB7 Descendre pr\xE8s de la GT jaune"],
    boardTarget: ["{car} \xB7 Seize the yellow GT", "{car} \xB7 Saisir la GT jaune"],
    northBoulevard: ["Find the yellow car on North Boulevard", "Trouver la voiture jaune, boulevard Nord"],
    vehicle: ["Car", "Auto"],
    breakdown: [
      "The car has filed for sick leave. Call recovery with {job}.",
      "La voiture est en arr\xEAt maladie. {job} pour appeler le d\xE9pannage."
    ],
    dented: ["That dent needs its own case number.", "Cette bosse m\xE9rite son propre num\xE9ro de dossier."],
    towed: [
      "Your car was blocking traffic. The pound towed it back to the \xE9tude.",
      "Votre voiture bloquait la circulation. La fourri\xE8re l\u2019a ramen\xE9e devant l\u2019\xE9tude."
    ],
    towing: ["TOWED", "FOURRI\xC8RE"],
    platformWait: [
      "Platform ticket stamped, in triplicate. Waiting for the train at",
      "Ticket de quai compost\xE9 en trois exemplaires. En attente du train \xE0"
    ],
    boarded: [
      "Doors closing. The fare goes down as a travel expense.",
      "Attention \xE0 la fermeture des portes. Le billet passera en frais de d\xE9placement."
    ],
    alightRequest: ["Stop requested:", "Arr\xEAt demand\xE9 :"],
    leftPlatform: ["Back down to the street.", "Retour dans la rue."],
    alighted: ["Off the train at", "Descente \xE0"],
    lostTail: [
      "The inspectors are still waiting at the other station. Heat dropped.",
      "Les contr\xF4leurs vous attendent encore \xE0 l\u2019autre station. L\u2019alerte retombe."
    ],
    recovery: ["Roadside assistance", "D\xE9pannage"],
    recoveryText: [
      "Your mechanic accepts payment in exposure. Specifically, exposure to our expenses department. Order a repair?",
      "Le garagiste accepte le paiement en visibilit\xE9. Il verra tr\xE8s bien notre service comptable. On r\xE9pare ?"
    ],
    repair: ["Order a repair", "Faire r\xE9parer"],
    repaired: ["Signed, stamped, roadworthy.", "Sign\xE9, tamponn\xE9, \xE7a roule."],
    callRecovery: ["{job} \xB7 Call roadside assistance", "{job} \xB7 Appeler le d\xE9pannage"],
    catch: ["I am justice.", "La justice, c\u2019est moi."],
    office: ["Bailiff\u2019s office", "L\u2019\xE9tude"],
    repo: ["Late payment", "Retard de paiement"],
    noise: ["Bass complaint", "Tapage bien sonoris\xE9"],
    flat: ["Home visit", "Visite \xE0 domicile"],
    auction: ["Auction hall", "H\xF4tel des ventes"],
    repoBrief: [
      "The Moutarde GT is four instalments behind. Collect the yellow car on the north boulevard and bring it to auction. The bank has already seized the air freshener.",
      "La Moutarde GT a quatre mensualit\xE9s de retard. Ramenez la voiture jaune du boulevard nord aux ench\xE8res. La banque a d\xE9j\xE0 saisi le sapin d\xE9sodorisant."
    ],
    noiseBrief: [
      "Le Boum says its subwoofer is decorative. Take a reading on foot outside the club. The pavement appears to be dancing.",
      "Au Boum, le caisson de basses serait \xAB purement d\xE9coratif \xBB. Relevez le niveau sonore \xE0 pied devant la bo\xEEte. Le trottoir danse d\xE9j\xE0 tout seul."
    ],
    flatBrief: [
      "Your order lists a gold karaoke deck at R\xE9sidence Mireille. The owner calls it a medical device. Inventory the lot and deliver it to auction.",
      "Le titre vise un karaok\xE9 dor\xE9 \xE0 la r\xE9sidence Mireille. Le propri\xE9taire plaide le dispositif m\xE9dical. Dressez l\u2019inventaire et portez le lot aux ench\xE8res."
    ],
    free: ["Free roam", "Quartier libre"],
    returnCar: ["Deliver the GT to the auction hall", "Livrer la GT \xE0 l\u2019h\xF4tel des ventes"],
    findCar: ["Collect the yellow GT", "Saisir la GT jaune"],
    returnLot: ["Take lot 51 to auction", "Livrer le lot 51 aux ench\xE8res"],
    tagLot: ["Inventory lot 51", "Inventorier le lot 51"],
    record: ["Record the sound level", "Mesurer le niveau sonore"],
    dispatch: ["Dispatch", "Standard"],
    clerk: ["Clerk", "Clerc"],
    fees: ["Fees", "Honoraires"],
    soldCar: [
      "Sold to a man whose loan application is still pending.",
      "Adjug\xE9 \xE0 un monsieur dont le cr\xE9dit est encore \xE0 l\u2019\xE9tude."
    ],
    soldLot: [
      "Lot 51 sold. The buyer requests a silent demonstration.",
      "Lot 51 adjug\xE9. L\u2019acheteur exige une d\xE9monstration en sourdine."
    ],
    pv: ["Statement of facts", "Proc\xE8s-verbal de constat"],
    pvDraft: [
      "Meter: 106 dB. Assistant\u2019s draft: \u201CThe bass is criminally bad.\u201D Your version: \u201C106 dB at the door.\u201D",
      "Sonom\xE8tre : 106 dB. Brouillon de l\u2019assistant : \xAB Le DJ m\xE9rite la perp\xE9tuit\xE9. \xBB Votre version : \xAB 106 dB devant la porte. \xBB"
    ],
    sign: ["Stamp the report", "Tamponner le constat"],
    signed: [
      "Report signed. The pavement declines to testify.",
      "Constat sign\xE9. Le trottoir ne souhaite pas t\xE9moigner."
    ],
    pocket: ["Pocket the meter", "Ranger le sonom\xE8tre"],
    resident: ["R\xE9sidence Mireille", "R\xE9sidence Mireille"],
    residentText: [
      "Door 3B. Mr Perez hands over the gold karaoke deck. His farewell performance is mercifully unplugged.",
      "Porte 3B. M. Perez rend le karaok\xE9 dor\xE9. Il entonne un dernier refrain. Heureusement, vous avez d\xE9j\xE0 d\xE9branch\xE9 le micro."
    ],
    tag: ["Tag lot 51", "\xC9tiqueter le lot 51"],
    tagged: ["Lot tagged. Next stop: the auction hall.", "Lot \xE9tiquet\xE9. Direction l\u2019h\xF4tel des ventes."],
    outside: ["Back outside", "Repartir"],
    drop: ["Return this file", "Rendre le dossier"],
    dropped: [
      "The file returns to its natural habitat: the pile.",
      "Le dossier regagne son habitat naturel : la pile."
    ],
    officeBusy: [
      "Your clerk has circled the destination. Twice. In red.",
      "Votre clerc a entour\xE9 la destination. Deux fois. En rouge."
    ],
    officeRemaining: [
      "Your clerk points to the in-tray. \u201CEverything left is marked urgent. Including my lunch.\u201D",
      "Votre clerc d\xE9signe la corbeille. \xAB Tout ce qui reste est urgent. M\xEAme ma pause d\xE9jeuner. \xBB"
    ],
    officeDone: [
      "Three files closed. Your clerk has recorded this as a clerical error.",
      "Trois dossiers class\xE9s. Votre clerc a signal\xE9 une erreur de saisie."
    ],
    officeNew: [
      "Your clerk slides three files across the desk. \u201CPick one. The other two will still be late tomorrow.\u201D",
      "Votre clerc aligne trois chemises. \xAB Prenez-en une. Les deux autres seront encore en retard demain. \xBB"
    ],
    back: ["Back to the street", "Retour en ville"],
    pins: ["Look for the coloured pins. \xC9 is the office.", "Suivez les rep\xE8res de couleur. \xC9, c\u2019est l\u2019\xE9tude."],
    take: ["Take the file", "Prendre le dossier"],
    leave: ["Walk away", "Laisser tomber"],
    moveCar: ["No room at the door. Move the car.", "La porti\xE8re est coinc\xE9e. D\xE9placez la voiture."],
    closer: ["Get closer to a vehicle or a mooring.", "Approchez-vous d\u2019un v\xE9hicule ou d\u2019un amarrage."],
    launch: ["\xC9tude launch", "Vedette de l\u2019\xE9tude"],
    barge: ["Barge", "P\xE9niche"],
    riverboat: ["Riverboat", "Bateau-promenade"],
    speedboat: ["Speedboat", "Hors-bord"],
    knots: ["kn", "nd"],
    shipHorn: ["Ship horn", "Corne"],
    touchBoat: ["Boat", "Bateau"],
    boatEnter: ["{car} / Boat \xB7 Board", "{car} / Bateau \xB7 Embarquer"],
    boatDisembark: ["{car} / Boat \xB7 Moor and step ashore", "{car} / Bateau \xB7 Amarrer et d\xE9barquer"],
    boatFindDock: ["Slow down near an anchor to moor", "Ralentissez pr\xE8s d\u2019une ancre pour vous amarrer"],
    boatDockFirst: ["Slow down at a clear mooring before stepping ashore.", "Ralentissez pr\xE8s d\u2019un amarrage libre avant de d\xE9barquer."],
    boatBoarded: ["Cast off. Mind your wake.", "Larguez les amarres. Attention au sillage."],
    boatTaken: ["You took the boat. The harbour office is watching.", "Vous avez pris le bateau. La capitainerie vous surveille."],
    boatMoored: ["Moored. Back on dry land.", "Amarr\xE9. De retour \xE0 terre."],
    seized: [
      "Vehicle seized. Deliver it to the auction hall.",
      "V\xE9hicule saisi. Direction l\u2019h\xF4tel des ventes."
    ],
    sedan: [
      "Company car. All dents have been duly witnessed.",
      "Voiture de fonction. Chaque bosse a fait l\u2019objet d\u2019un constat."
    ],
    keysIn: ["The keys were in it. The paperwork can wait.", "Cl\xE9s sur le contact. Le formulaire attendra."],
    service: ["\u201CService included.\u201D", "\xAB Service compris. \xBB"],
    initial: ["\u201CInitial here.\u201D", "\xAB Paraphez ici. \xBB"],
    served: ["\u201CYou\u2019ve been served.\u201D", "\xAB Et voil\xE0 pour la signification. \xBB"],
    concussion: [
      "I moved your concussion to Thursday. Tuesday was double-booked.",
      "J\u2019ai d\xE9cal\xE9 votre commotion \xE0 jeudi. Mardi, vous aviez d\xE9j\xE0 une saisie."
    ],
    standards: [
      "Professional Standards would like a word. They brought a committee.",
      "La chambre de discipline voudrait vous parler. Elle a amen\xE9 toute la commission."
    ],
    start: [
      "Your sedan is outside. So is the man who disputes our parking expenses.",
      "Votre berline est dehors. Le monsieur qui conteste vos frais de parking aussi."
    ],
    fuel: [
      "Your petrol receipt says \u201Chigh-speed legal research\u201D. Finance has questions.",
      "Votre note d\u2019essence indique \xAB jurisprudence \xE0 grande vitesse \xBB. La compta s\u2019interroge."
    ],
    clocked: [
      "I\u2019ve put you down as \u201Cin court\u201D. Please avoid driving through it.",
      "J\u2019ai not\xE9 \xAB au tribunal \xBB. Cette fois, passez par la porte."
    ],
    printer: [
      "The printer demands a witness before it will admit to a paper jam.",
      "L\u2019imprimante exige un t\xE9moin avant de reconna\xEEtre le bourrage papier."
    ],
    horn: [
      "Beneficiary of your right of way: absolutely nobody.",
      "B\xE9n\xE9ficiaire de votre priorit\xE9 \xE0 droite : personne."
    ],
    impact: ["SMACK!", "CLAC !"],
    ouch: ["OW!", "A\xCFE !"],
    honk: ["HONK!", "TUUT !"],
    eek: ["Hey!", "Eh !"],
    clang: ["CLANG!", "BONG !"],
    health: ["HP", "PV"],
    heat: ["Heat", "Alerte"],
    map: ["Map & files", "Plan et dossiers"],
    closeMap: ["Close map", "Fermer le plan"],
    help: ["Controls", "Commandes"],
    audioOn: ["Sound on", "Son activ\xE9"],
    audioOff: ["Sound off", "Son coup\xE9"],
    soundError: ["Audio unavailable in this browser.", "Audio indisponible dans ce navigateur."],
    run: ["Run", "Courir"],
    touchCar: ["Car", "Auto"],
    touchJob: ["Job", "Acte"],
    touchHit: ["Slap", "Gifle"],
    touchBrake: ["Brake", "Frein"],
    vehicleHorn: ["Horn", "Klaxon"],
    vehicleSiren: ["Siren", "Sir\xE8ne"],
    up: ["Up", "Haut"],
    down: ["Down", "Bas"],
    left: ["Left", "Gauche"],
    right: ["Right", "Droite"],
    controls: [
      "\u2191 \u2193 \u2190 \u2192 / WASD / ZQSD\u3000Move or drive\u3000\xB7\u3000Shift  Run\u3000\xB7\u3000F  Board / exit\u3000\xB7\u3000H  Horn / siren\u3000\xB7\u3000Space  Slap / handbrake\u3000\xB7\u3000E  Job\u3000\xB7\u3000M  Map\u3000\xB7\u3000V  Quip",
      "\u2191 \u2193 \u2190 \u2192 / ZQSD / WASD\u3000Marcher ou conduire\u3000\xB7\u3000Maj  Courir\u3000\xB7\u3000F  Monter / descendre\u3000\xB7\u3000H  Klaxon / sir\xE8ne\u3000\xB7\u3000Espace  Gifle / frein \xE0 main\u3000\xB7\u3000E  Acte\u3000\xB7\u3000M  Plan\u3000\xB7\u3000V  R\xE9plique"
    ],
    helpText: [
      "Arrows, WASD or ZQSD move you on foot. Hold Shift to run, or hold Run with a direction on the touch pad. F gets you into or out of a nearby car or a boat at a mooring. Slow down near an anchor before stepping ashore. At a ring station sign, F climbs to the platform; on board, F gets you off at the next stop. Accelerate with up, brake or reverse with down, steer with left and right. Hold H or the horn button to signal. In the ambulance, press H or Siren to turn the siren on or off. Space slaps on foot or pulls the handbrake. E opens a job. Beside a downed pedestrian, press R or tap Incident report to hand over a copy. The ambulance collects anyone still waiting. M opens the city map. Press V or tap the speech button to deliver your signature line.",
      "\xC0 pied, utilisez les fl\xE8ches, ZQSD ou WASD. Maintenez Maj pour courir, ou Courir et une fl\xE8che sur l\u2019\xE9cran tactile. F pour monter en voiture ou embarquer \xE0 un point d\u2019amarrage. Ralentissez pr\xE8s d\u2019une ancre avant de d\xE9barquer. Au panneau d\u2019une gare de la Ceinture, F m\xE8ne au quai ; \xE0 bord, F vous fait descendre au prochain arr\xEAt. Haut pour acc\xE9l\xE9rer, bas pour freiner ou reculer, gauche et droite pour tourner. Maintenez H ou le bouton du klaxon pour signaler votre pr\xE9sence. Dans l\u2019ambulance, appuyez sur H ou Sir\xE8ne pour activer ou couper la sir\xE8ne. Espace pour gifler ou tirer le frein \xE0 main. E pour un dossier. Pr\xE8s d\u2019un passant \xE0 terre, R ou le bouton Signalement permet de remettre un double. L\u2019ambulance prend en charge les personnes encore sur place. M pour le plan. V ou le bouton de r\xE9plique pour sortir votre phrase f\xE9tiche."
    ],
    gamepadControls: [
      "Left stick \xB7 Move / steer\u3000 RT / LT \xB7 Accelerate / brake\u3000 Y \xB7 Car\u3000 X \xB7 Slap / handbrake\u3000 A \xB7 Job\u3000 View \xB7 Map\u3000 Menu \xB7 Controls",
      "Stick gauche \xB7 Marcher / tourner\u3000 RT / LT \xB7 Acc\xE9l\xE9rer / freiner\u3000 Y \xB7 Auto\u3000 X \xB7 Gifle / frein \xE0 main\u3000 A \xB7 Acte\u3000 View \xB7 Plan\u3000 Menu \xB7 Commandes"
    ],
    controllerHelp: [
      "Press a button on your Xbox controller to get started. Move with the left stick or D-pad and hold LB to run. Y enters and exits cars and moored boats, climbs to a ring station platform or gets you off the train at the next stop. Steer with the left stick. RT accelerates, LT brakes or reverses. Hold RB to honk or press it to toggle the ambulance siren. X slaps or pulls the handbrake. A opens a job. Click the right stick (RS) to report an incident. B delivers your quip. View opens the map, and Menu opens these controls.",
      "Appuyez sur un bouton de la manette Xbox pour l\u2019activer. D\xE9placez-vous avec le stick gauche ou la croix directionnelle et maintenez LB pour courir. Y sert \xE0 monter et \xE0 descendre des voitures et des bateaux \xE0 quai, \xE0 monter sur le quai d\u2019une gare de la Ceinture ou \xE0 descendre du train au prochain arr\xEAt. Tournez avec le stick gauche. RT acc\xE9l\xE8re, LT freine ou fait reculer. Maintenez RB pour klaxonner ou appuyez dessus pour actionner la sir\xE8ne. X sert \xE0 gifler ou \xE0 tirer le frein \xE0 main. A ouvre un dossier. Enfoncez le stick droit (RS) pour signaler un incident. B lance une r\xE9plique. View ouvre le plan et Menu affiche les commandes."
    ],
    dialogControls: [
      "Left stick / D-pad \xB7 Choose\u3000 A \xB7 Select\u3000 B \xB7 Back\u3000 Right stick \xB7 Scroll",
      "Stick gauche / Croix \xB7 Choisir\u3000 A \xB7 Valider\u3000 B \xB7 Retour\u3000 Stick droit \xB7 D\xE9filer"
    ],
    cityMap: ["PORT-FER  /  STREET MAP", "PORT-FER  /  PLAN DE VILLE"],
    legend1: ["\xC9 Office \xB7 R Repo \xB7 C Noise report", "\xC9 \xC9tude \xB7 R Saisie auto \xB7 C Constat"],
    legend2: ["S Home visit \xB7 A Auction \xB7 \u25C6 You \xB7 \u25CB Ring station \xB7 \u25A0 Mooring", "S Saisie \xE0 domicile \xB7 A Ench\xE8res \xB7 \u25C6 Vous \xB7 \u25CB Gare de la Ceinture \xB7 \u25A0 Amarrage"],
    mapHint: ["{map} / Map \xB7 Back to town", "{map} / Plan \xB7 Retour en ville"],
    outHint: ["{car} / Car \xB7 Get out", "{car} / Auto \xB7 Descendre"],
    enterHint: ["{car} / Car \xB7 Take the wheel", "{car} / Auto \xB7 Prendre le volant"],
    stationHint: ["{car} / Car \xB7 Take the Petite Ceinture", "{car} / Auto \xB7 Prendre la Petite Ceinture"],
    platformHint: ["On the platform \xB7 {car} / Car \xB7 Back to the street", "Sur le quai \xB7 {car} / Auto \xB7 Redescendre dans la rue"],
    nextStopHint: ["Next stop:", "Prochain arr\xEAt :"],
    alightKey: ["{car} / Car \xB7 Get off there", "{car} / Auto \xB7 Descendre \xE0 cet arr\xEAt"],
    alightingHint: ["Getting off at", "Vous descendez \xE0"],
    doorsOpenHint: ["Doors open:", "Portes ouvertes :"],
    alightNowKey: ["{car} / Car \xB7 Get off here", "{car} / Auto \xB7 Descendre ici"],
    footHint: ["On foot \xB7 {action} to slap", "\xC0 pied \xB7 {action} pour gifler"],
    jobKey: ["{job} / Job", "{job} / Acte"],
    quip: ["Quip", "R\xE9plique"],
    canvas: ["Overhead open-world game in Port-Fer", "Jeu en monde ouvert en vue de dessus \xE0 Port-Fer"],
    frLang: ["Switch to French", "Passer en fran\xE7ais"],
    enLang: ["Switch to English", "Passer en anglais"],
    loading: ["Opening Port-Fer\u2026", "Ouverture de Port-Fer\u2026"],
    districtArc: ["Seizure Star", "\xC9toile des Saisies"],
    districtButte: ["Creditor Hill", "Butte du Cr\xE9ancier"],
    districtOpera: ["Auction Opera", "Quartier de l\u2019Op\xE9ra"],
    districtParcNord: ["Tax-Hill Park", "Buttes-Fiscales"],
    districtContrainte: ["Writ Square", "Place de la Contrainte"],
    districtMarais: ["Old Marais", "Le Vieux Marais"],
    districtFaubourgEst: ["Clerks\u2019 Suburb", "Faubourg des Greffes"],
    districtQuaisOuest: ["West Quays", "Quais de l\u2019Ouest"],
    districtIle: ["\xCEle de la Ferre", "\xCEle de la Ferre"],
    districtFerre: ["River Ferre", "La Ferre"],
    districtTour: ["Iron Field", "Champ-de-Fer"],
    districtRiveGauche: ["Clerks\u2019 Quarter", "Quartier des Clercs"],
    districtDocks: ["Ferre Docks", "Les Docks de la Ferre"]
  };
  for (const entry of Object.values(fleet)) words[entry.label] = [entry.name.en, entry.name.fr];

  // src/ui/dialogs.js
  var lang = navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
  var usingGamepad = false;
  var bindings = {
    car: ["F", "F", "Y"],
    job: ["E", "E", "A"],
    report: ["R", "R", "RS"],
    map: ["M", "M", "View"],
    action: ["Space", "Espace", "X"]
  };
  try {
    const saved = localStorage.getItem("port-fer-language");
    if (["en", "fr"].includes(saved)) lang = saved;
  } catch {
  }
  function t(key) {
    const pair = words[key];
    if (!pair) return key;
    const language = Number(lang === "fr");
    const text = pair[language];
    return text.includes("{") ? text.replace(/\{(\w+)\}/g, (_, control2) => bindings[control2][usingGamepad ? 2 : language]) : text;
  }
  var message = null;
  function say(id, seconds = 4, prefix = "", suffix = "") {
    message = { id, prefix, suffix };
    game.msgLife = seconds;
    renderMessage();
  }
  function renderMessage() {
    const m = message;
    $("#ticker").textContent = m && game.msgLife > 0 ? (m.prefix ? t(m.prefix) + " \xB7 " : "") + t(m.id) + m.suffix : "";
  }
  function setLanguage() {
    lang = lang === "fr" ? "en" : "fr";
    try {
      localStorage.setItem("port-fer-language", lang);
    } catch {
    }
    refreshLanguage();
  }
  function refreshInputHints() {
    $("#reportBtn").textContent = t("reportKey");
    $("#keys").textContent = t(usingGamepad ? "gamepadControls" : "controls");
    $("#dialogControls").textContent = t("dialogControls");
    renderMessage();
  }
  function setGamepadMode(enabled) {
    if (usingGamepad === enabled) return;
    usingGamepad = enabled;
    panel.toggleAttribute("data-gamepad", enabled);
    $("#dialogControls").hidden = !enabled;
    refreshInputHints();
  }
  function refreshLanguage() {
    document.documentElement.lang = lang;
    $("#language").textContent = lang === "en" ? "FR" : "EN";
    $("#language").setAttribute("aria-label", t(lang === "en" ? "frLang" : "enLang"));
    for (const [selector, id] of [
      ["#help", "help"],
      ["#quip", "quip"],
      ["#mapBtn", game.viewMap ? "closeMap" : "map"],
      ["#sound", game.sound ? "audioOn" : "audioOff"],
      ["[data-key=car]", "touchCar"],
      ["[data-key=job]", "touchJob"],
      ["[data-key=action]", game.ride ? "touchBrake" : "touchHit"],
      ["[data-key=run]", "run"]
    ])
      $(selector).textContent = t(id);
    for (const key of ["up", "down", "left", "right"])
      $("[data-key=" + key + "]").setAttribute("aria-label", t(key));
    canvas.setAttribute("aria-label", t("canvas"));
    refreshInputHints();
    if (panel.open && dialogState) renderDialog();
  }
  var dialogState;
  function renderDialog() {
    const { title, copy, choices } = dialogState;
    const heading = $("#heading");
    heading.textContent = t(title);
    if (title === "help") heading.tabIndex = -1;
    else heading.removeAttribute("tabindex");
    heading.toggleAttribute("autofocus", title === "help");
    const description = $("#copy");
    description.textContent = t(copy);
    description.classList.toggle("keyboard-help", title === "help");
    const controllerHelp = $("#controllerHelp");
    controllerHelp.hidden = title !== "help";
    if (title === "help") controllerHelp.textContent = t("controllerHelp");
    const root = $("#choices");
    root.replaceChildren();
    for (const [name, fn] of choices) {
      const b = document.createElement("button");
      b.textContent = t(name);
      b.onclick = () => {
        panel.close();
        if (fn) fn();
      };
      root.append(b);
    }
    const language = document.createElement("button");
    language.textContent = lang === "en" ? "Fran\xE7ais" : "English";
    language.onclick = () => {
      setLanguage();
      root.lastElementChild.focus();
    };
    root.append(language);
  }
  function box(title, copy, choices) {
    held.clear();
    dialogState = { title, copy, choices };
    renderDialog();
    if (!panel.open) panel.showModal();
    if (title === "help" && usingGamepad) $("#choices button").focus({ preventScroll: true });
  }
  function speak() {
    if (panel.open || game.viewMap || game.quipCooldown > 0) return;
    game.quipTime = 2.5;
    game.quipCooldown = 1.2;
  }

  // src/game/boats.js
  var metre = 4.8;
  var boatTypes = {
    barge: { length: 38, beam: 5.05, mass: 90, thrust: 5, topSpeed: 29, rudder: 0.48, drag: 0.12, grip: 0.9 },
    riverboat: { length: 30, beam: 5.7, mass: 52, thrust: 8, topSpeed: 39, rudder: 0.66, drag: 0.16, grip: 1.1 },
    speedboat: { length: 7, beam: 2.15, mass: 1.8, thrust: 49, topSpeed: 123, rudder: 1.8, drag: 0.23, grip: 1.45 },
    launch: { length: 10, beam: 2.8, mass: 4, thrust: 31, topSpeed: 84, rudder: 1.48, drag: 0.32, grip: 1.85 }
  };
  function makeBoat(model, pose) {
    const type = boatTypes[model];
    return {
      model,
      domain: "water",
      halfLength: type.length * metre / 2,
      halfWidth: type.beam * metre / 2,
      mass: type.mass,
      speed: 0,
      slideX: 0,
      slideY: 0,
      yaw: 0,
      plane: 0,
      condition: 100,
      wake: [],
      wakeTime: 0,
      bumps: 0,
      lastImpact: 0,
      impactDelay: 0,
      ...pose
    };
  }
  function hullOnWater(river3, boat, x = boat.x, y = boat.y, a = boat.a) {
    const r = boat.halfWidth * 1.04;
    const span = boat.halfLength - r;
    const steps = Math.ceil(2 * span / (r * 0.55));
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let i = 0; i <= steps; i++) {
      const u = (2 * i / steps - 1) * span;
      if (!river3.onWater(x + u * dx, y + u * dy, r)) return false;
    }
    return true;
  }
  function settle(boat) {
    boat.speed = boat.slideX = boat.slideY = boat.yaw = 0;
  }
  function boardableBoat(boats, moorings, person2) {
    return boats.find((boat) => boat.mooring && moorings.some((m) => m.id === boat.mooring && dist(m.quay, person2) <= 11));
  }
  function dockingMooring(boats, moorings, boat, clear = () => true) {
    if (Math.hypot(boat.slideX, boat.slideY) > 7.5) return null;
    let nearest = null, reach2 = Math.min(29, 16 + boat.halfWidth * 1.25);
    for (const m of moorings) {
      const gap = dist(boat, m);
      if (gap >= reach2 || boats.some((b) => b !== boat && b.mooring === m.id) || !clear(m.quay)) continue;
      nearest = m;
      reach2 = gap;
    }
    return nearest;
  }
  function dockBoat(boat, mooring) {
    settle(boat);
    boat.mooring = mooring.id;
    return { ...mooring.quay, a: boat.a };
  }
  function takeBoat(boat) {
    const theft = !boat.claimed;
    boat.claimed = true;
    boat.mooring = null;
    return theft;
  }
  function hitBoat(boat, force) {
    if (force < 3 || boat.impactDelay > 0) return;
    boat.bumps++;
    boat.lastImpact = force;
    boat.impactDelay = 0.4;
    if (force > 23) boat.condition = Math.max(20, boat.condition - Math.ceil((force - 23) * 0.42));
  }
  function contactAt(boat, x, y, a, boats) {
    const pose = { x, y, a, halfLength: boat.halfLength, halfWidth: boat.halfWidth };
    for (const other of boats) {
      if (other === boat || other.incoming) continue;
      const hit = carContact(pose, other);
      if (hit) return { ...hit, other };
    }
    return null;
  }
  function driveBoat(river3, boat, boats, dt, throttle, rudder) {
    const type = boatTypes[boat.model];
    const ca = Math.cos(boat.a), sa = Math.sin(boat.a);
    let forward = boat.slideX * ca + boat.slideY * sa;
    const sideways2 = (boat.slideY * ca - boat.slideX * sa) * Math.exp(-type.grip * dt);
    const pushingBack = forward * throttle < 0;
    forward += throttle * type.thrust * (pushingBack ? 1.65 : throttle < 0 ? 0.72 : 1) * dt;
    const maxSpeed = type.topSpeed * (0.45 + boat.condition * 55e-4);
    const planing = boat.model === "speedboat" && forward > 54;
    boat.plane += (Number(planing) - boat.plane) * (1 - Math.exp(-dt * 2));
    forward = clamp(forward * Math.exp(-type.drag * (1 - 0.48 * boat.plane) * dt), -maxSpeed * 0.38, maxSpeed);
    const flow = Math.abs(forward) > 1 ? Math.sign(forward) : Math.sign(throttle);
    const desiredYaw = rudder * flow * type.rudder * clamp((Math.abs(forward) + 9 * Math.abs(throttle)) / 17, 0, 1);
    boat.yaw += (desiredYaw - boat.yaw) * (1 - Math.exp(-dt * (1.4 + type.grip)));
    const heading = boat.a + boat.yaw * dt;
    if (hullOnWater(river3, boat, boat.x, boat.y, heading) && !contactAt(boat, boat.x, boat.y, heading, boats))
      boat.a = heading;
    else boat.yaw *= Math.exp(-dt * 6);
    boat.slideX = forward * ca - sideways2 * sa;
    boat.slideY = forward * sa + sideways2 * ca;
    const nx = boat.x + boat.slideX * dt, ny = boat.y + boat.slideY * dt;
    if (!hullOnWater(river3, boat, nx, ny)) {
      const xFree = hullOnWater(river3, boat, nx, boat.y);
      const yFree = hullOnWater(river3, boat, boat.x, ny);
      const bounceX = !xFree || yFree && Math.abs(boat.slideX) < Math.abs(boat.slideY);
      const vx = boat.slideX, vy = boat.slideY;
      if (!bounceX && !contactAt(boat, nx, boat.y, boat.a, boats)) boat.x = nx;
      if (bounceX && yFree && !contactAt(boat, boat.x, ny, boat.a, boats)) boat.y = ny;
      if (bounceX) boat.slideX *= -0.24;
      if (!bounceX || !yFree) boat.slideY *= -0.24;
      hitBoat(boat, Math.hypot(bounceX ? vx : 0, !bounceX || !yFree ? vy : 0));
    } else {
      const hit = contactAt(boat, nx, ny, boat.a, boats);
      if (hit) {
        const { other } = hit;
        const closing = Math.max(
          0,
          (other.slideX - boat.slideX) * hit.nx + (other.slideY - boat.slideY) * hit.ny
        );
        const inward = Math.max(0, -boat.slideX * hit.nx - boat.slideY * hit.ny);
        boat.slideX += (inward + closing * 0.18) * hit.nx;
        boat.slideY += (inward + closing * 0.18) * hit.ny;
        hitBoat(boat, closing);
        hitBoat(other, closing * Math.min(1, boat.mass / other.mass));
      } else {
        boat.x = nx;
        boat.y = ny;
      }
    }
    boat.speed = boat.slideX * Math.cos(boat.a) + boat.slideY * Math.sin(boat.a);
  }
  function berthFleet(river3, office2) {
    const berths = [...river3.moorings].sort((a, b) => dist(office2, a.quay) - dist(office2, b.quay));
    const boats = [];
    for (const model of ["launch", "speedboat", "barge", "riverboat"]) {
      const limit = model === "launch" ? Math.min(1, berths.length) : berths.length;
      for (let i = 0; i < limit; i++) {
        const m = berths[i];
        const boat = makeBoat(model, { x: m.x, y: m.y, a: m.a, mooring: m.id, claimed: model === "launch" });
        const side = Math.sign(m.y - m.quay.y);
        for (const shift of [0, 3, 6, 10, 14, 18]) {
          boat.y = m.y + side * shift;
          if (hullOnWater(river3, boat) && !contactAt(boat, boat.x, boat.y, boat.a, boats)) break;
        }
        if (!hullOnWater(river3, boat) || contactAt(boat, boat.x, boat.y, boat.a, boats)) continue;
        boats.push(boat);
        berths.splice(i, 1);
        break;
      }
    }
    return boats;
  }
  function makeLane(river3, moored, sign) {
    const hull = makeBoat("barge", {});
    hull.halfWidth = Math.max(hull.halfWidth, boatTypes.riverboat.beam * metre / 2) + 2;
    const knots = river3.centreline;
    if (knots.length < 2) return [];
    const west = knots[0].x + hull.halfLength + 2;
    const east = knots.at(-1).x - hull.halfLength - 2;
    if (west >= east) return [];
    const segments = Math.ceil((east - west) / 16);
    const laneGap = clamp((river3.bottom - river3.top) / 30 - 2.5, 1.5, 9);
    let previous = /* @__PURE__ */ new Map(), knot = 0;
    for (let i = 0; i <= segments; i++) {
      const x = west + (east - west) * i / segments;
      while (knots[knot + 1].x < x) knot++;
      const a = knots[knot], b = knots[knot + 1];
      const mid = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
      const channel = sign > 0 ? mid : river3.top + river3.bottom - mid;
      const preferred = channel + sign * (hull.halfWidth + laneGap);
      const column2 = /* @__PURE__ */ new Map();
      for (let y = Math.ceil((river3.top + hull.halfWidth) / 2) * 2; y <= river3.bottom - hull.halfWidth; y += 2) {
        if (!river3.onWater(x, y, hull.halfWidth)) continue;
        const weight = ((y - preferred) / 12) ** 2;
        let parent = null, cost = Infinity;
        for (let offset = i ? -12 : 0; offset <= (i ? 12 : 0); offset += 2) {
          const p2 = i ? previous.get(y + offset) : { x: x - 16, y, cost: 0 };
          if (!p2) continue;
          const nextCost = p2.cost + weight + offset * offset * 0.15;
          if (nextCost >= cost) continue;
          const angle = Math.atan2(y - p2.y, x - p2.x);
          if (!hullOnWater(river3, hull, x, y, angle) || contactAt(hull, x, y, angle, moored)) continue;
          if (i) {
            const mx = (x + p2.x) * 0.5, my = (y + p2.y) * 0.5;
            if (!hullOnWater(river3, hull, p2.x, p2.y, angle) || !hullOnWater(river3, hull, mx, my, angle)) continue;
            if (contactAt(hull, p2.x, p2.y, angle, moored) || contactAt(hull, mx, my, angle, moored)) continue;
          }
          parent = i ? p2 : null;
          cost = nextCost;
        }
        if (cost < Infinity) column2.set(y, { x, y, cost, parent });
      }
      if (!column2.size) return [];
      previous = column2;
    }
    const lane = [];
    const finish = [...previous.values()].reduce((best, p2) => p2.cost < best.cost ? p2 : best);
    for (let node = finish; node; node = node.parent) lane.push({ x: node.x, y: node.y });
    return lane.reverse();
  }
  function lanePose(lane, x, sign) {
    const f = (x - lane[0].x) / (lane.at(-1).x - lane[0].x) * (lane.length - 1);
    const i = clamp(Math.floor(f), 0, lane.length - 2);
    const a = lane[i], b = lane[i + 1], t2 = clamp(f - i, 0, 1);
    return { x, y: a.y + (b.y - a.y) * t2, a: Math.atan2((b.y - a.y) * sign, (b.x - a.x) * sign) };
  }
  function narrowPassages(east, west) {
    if (!east.length || !west.length) return [];
    const gates = [];
    const clearance = boatTypes.barge.length * metre / 2 + 16;
    for (let i = 0; i < east.length; i++) {
      if (Math.abs(east[i].y - west[i].y) > boatTypes.riverboat.beam * metre + 2) continue;
      const x = east[i].x, last = gates.at(-1);
      if (last && x - clearance - last.right < clearance) last.right = x + clearance;
      else gates.push({ left: x - clearance, right: x + clearance, direction: 0, waiting: 0, inside: /* @__PURE__ */ new Set() });
    }
    return gates;
  }
  function createBoatFleet(river3, office2) {
    const boats = berthFleet(river3, office2);
    const east = makeLane(river3, boats, 1), west = makeLane(river3, boats, -1);
    const gates = narrowPassages(east, west);
    for (const [i, fraction] of [0.16, 0.4, 0.64, 0.87].entries()) {
      const sign = i % 2 ? -1 : 1, lane = sign > 0 ? east : west;
      if (!lane.length) continue;
      const x = lane[0].x + fraction * (lane.at(-1).x - lane[0].x);
      const boat = makeBoat(i < 2 ? "barge" : "riverboat", {
        ...lanePose(lane, x, sign),
        traffic: { lane, sign, hornDelay: 0 }
      });
      const gate = gates.find((g2) => x + boat.halfLength > g2.left && x - boat.halfLength < g2.right);
      if (contactAt(boat, boat.x, boat.y, boat.a, boats) || gate?.direction && gate.direction !== sign) {
        boat.incoming = 1 + i;
      } else if (gate) {
        gate.direction = sign;
        gate.inside.add(boat);
      }
      boats.push(boat);
    }
    return { boats, gates };
  }
  function aheadOfGate(boat, gate) {
    const edge = boat.traffic.sign > 0 ? gate.left : gate.right;
    return (edge - boat.x) * boat.traffic.sign - boat.halfLength;
  }
  function reserve(gate, boat) {
    if (gate.inside.has(boat)) return true;
    const { sign } = boat.traffic;
    if (gate.direction === -sign || gate.waiting === -sign) {
      if (gate.direction === -sign) gate.waiting = sign;
      return false;
    }
    gate.direction = sign;
    gate.waiting = 0;
    gate.inside.add(boat);
    return true;
  }
  function trafficStep(river3, boat, fleet2, dt, horn) {
    const { lane, sign } = boat.traffic;
    const end = sign > 0 ? lane.at(-1).x : lane[0].x;
    if (boat.incoming) {
      boat.incoming = Math.max(1e-3, boat.incoming - dt);
      if (boat.incoming > 1e-3) return;
      const start = sign > 0 ? lane[0].x : lane.at(-1).x;
      const next2 = lanePose(lane, start, sign);
      if (contactAt(boat, next2.x, next2.y, next2.a, fleet2.boats)) return;
      const gate2 = fleet2.gates.find((g2) => start + boat.halfLength > g2.left && start - boat.halfLength < g2.right);
      if (gate2 && !reserve(gate2, boat)) return;
      Object.assign(boat, next2, { incoming: 0 });
    }
    const cruise = boatTypes[boat.model].topSpeed * 0.78;
    let target2 = cruise;
    const gate = fleet2.gates.find((g2) => sign > 0 ? boat.x - boat.halfLength < g2.right : boat.x + boat.halfLength > g2.left);
    if (gate) {
      const distance = aheadOfGate(boat, gate);
      if (distance < 32 && !reserve(gate, boat))
        target2 = Math.min(target2, Math.max(0, (distance - 4) * 0.8));
    }
    let close = false;
    for (const other of fleet2.boats) {
      if (other === boat || other.incoming) continue;
      const ahead = (other.x - boat.x) * sign;
      const gap = ahead - boat.halfLength - other.halfLength;
      if (ahead <= 0 || gap > 55) continue;
      const y = lanePose(lane, other.x, sign).y;
      if (Math.abs(y - other.y) > boat.halfWidth + other.halfWidth) continue;
      close = true;
      target2 = Math.min(target2, Math.max(0, sign * other.slideX + (gap - 8) * 0.55));
    }
    boat.traffic.hornDelay = Math.max(0, boat.traffic.hornDelay - dt);
    if ((close || target2 < cruise * 0.6) && !boat.traffic.hornDelay) {
      boat.traffic.hornDelay = 4;
      horn(boat);
    }
    boat.speed += clamp(target2 - boat.speed, -22 * dt, (boat.model === "barge" ? 4 : 6) * dt);
    if (!boat.speed) {
      settle(boat);
      return;
    }
    const x = boat.x + sign * boat.speed * dt;
    if ((end - x) * sign <= 0) {
      settle(boat);
      boat.wake.length = 0;
      boat.incoming = 2;
      return;
    }
    const next = lanePose(lane, x, sign);
    if (!hullOnWater(river3, boat, next.x, next.y, next.a) || contactAt(boat, next.x, next.y, next.a, fleet2.boats)) {
      settle(boat);
      return;
    }
    boat.slideX = (next.x - boat.x) / dt;
    boat.slideY = (next.y - boat.y) / dt;
    Object.assign(boat, next);
  }
  function updateWake(boat, dt) {
    for (const point of boat.wake) point.age += dt;
    while (boat.wake[0]?.age >= 2.4) boat.wake.shift();
    const speed = Math.hypot(boat.slideX, boat.slideY);
    boat.wakeTime -= dt;
    if (speed < 4 || boat.wakeTime > 0) return;
    boat.wakeTime = speed > 50 ? 0.047 : 0.12;
    const a = boat.a + (boat.speed < 0 ? Math.PI : 0);
    const stern = boat.halfLength * 0.92;
    boat.wake.push({
      x: boat.x - stern * Math.cos(a),
      y: boat.y - stern * Math.sin(a),
      a,
      age: 0,
      power: clamp(speed / 58 + boat.plane * 0.3, 0.1, 1)
    });
  }
  function updateBoats(river3, fleet2, dt, ride, throttle, rudder, horn = () => {
  }) {
    if (dt <= 0) return;
    for (const gate of fleet2.gates) {
      for (const boat of gate.inside) {
        const cleared = boat.traffic.sign > 0 ? boat.x - boat.halfLength >= gate.right : boat.x + boat.halfLength <= gate.left;
        if (cleared || boat.incoming) gate.inside.delete(boat);
      }
      if (!gate.inside.size) gate.direction = 0;
    }
    for (const boat of fleet2.boats) boat.impactDelay = Math.max(0, boat.impactDelay - dt);
    if (ride?.domain === "water") driveBoat(river3, ride, fleet2.boats, dt, throttle, rudder);
    for (const boat of fleet2.boats) {
      if (boat.traffic) trafficStep(river3, boat, fleet2, dt, horn);
      updateWake(boat, dt);
    }
  }
  var river2 = town.river;
  var boatFleet = createBoatFleet(river2, town.byId.get("office"));

  // src/game/ring-route.js
  var TAU3 = 2 * Math.PI;
  var mod = (a, n) => (a % n + n) % n;
  var CAR_LENGTH = 308 / 3.6;
  var CAR_GAP = 1.6;
  var CAR_HALF_WIDTH = 6.5;
  var PLATFORM_OFFSET = 11;
  var PLATFORM_HALF_LENGTH = (3 * CAR_LENGTH + 2 * CAR_GAP) / 2 + 6;
  var BOGIE = 29.8;
  function prepareRing(source) {
    const points = source.points.slice();
    const first = points[0], last = points.at(-1);
    if (points.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) points.pop();
    if (points.length < 3) throw new Error("The ring needs a closed loop");
    const cum = [0];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const length = cum.at(-1);
    const bends = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[(i - 1 + points.length) % points.length], q = points[i], b = points[(i + 1) % points.length];
      const turn = Math.abs(Math.atan2((q.x - a.x) * (b.y - q.y) - (q.y - a.y) * (b.x - q.x), (q.x - a.x) * (b.x - q.x) + (q.y - a.y) * (b.y - q.y)));
      if (turn < 1e-4) continue;
      const segment = (j) => cum[j + 1] - cum[j], before = segment((i - 1 + points.length) % points.length), after = segment(i);
      bends.push({ from: cum[i] - before / 2, to: cum[i] + after / 2, curvature: turn / ((before + after) / 2) });
    }
    function pointAt(s) {
      s = mod(s, length);
      let lo = 0, hi = points.length - 1;
      while (lo < hi) {
        const mid = lo + hi + 1 >> 1;
        if (cum[mid] <= s) lo = mid;
        else hi = mid - 1;
      }
      const a = points[lo], b = points[(lo + 1) % points.length], f = (s - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    function project(q) {
      let best = Infinity, at2 = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, f = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)), d = Math.hypot(a.x + dx * f - q.x, a.y + dy * f - q.y);
        if (d < best) {
          best = d;
          at2 = cum[i] + f * (cum[i + 1] - cum[i]);
        }
      }
      return at2;
    }
    function poseAt(s, half = BOGIE) {
      const f = pointAt(s + half), r = pointAt(s - half);
      return { x: (f.x + r.x) / 2, y: (f.y + r.y) / 2, a: Math.atan2(f.y - r.y, f.x - r.x) };
    }
    const stations = source.stations.map((st) => {
      const s = mod(Number.isFinite(st.s) ? st.s : project(st.stop), length), pose = poseAt(s, 4);
      const across = -Math.sin(pose.a) * (st.street.x - pose.x) + Math.cos(pose.a) * (st.street.y - pose.y);
      const vertical = Math.abs(Math.sin(pose.a)) > 0.7;
      return { ...st, s, side: across < 0 ? -1 : 1, vertical };
    }).sort((a, b) => a.s - b.s);
    if (!stations.length) throw new Error("The ring needs a station");
    if (!Number.isFinite(source.deckLift)) throw new Error("The ring needs a deck height");
    return { points, cum, length, bends, deckLift: source.deckLift, stations, pointAt, poseAt, project };
  }
  var ringCache = /* @__PURE__ */ new WeakMap();
  function ringOf(layout) {
    if (!layout.ring) throw new Error("This town publishes no ring railway");
    if (!ringCache.has(layout)) ringCache.set(layout, prepareRing(layout.ring));
    return ringCache.get(layout);
  }
  function speedLimits(ring2, vmax, lateral, trainLength, h) {
    const n = Math.ceil(ring2.length / h), point = new Float64Array(n).fill(vmax);
    for (const bend of ring2.bends) {
      const cap = Math.min(vmax, Math.sqrt(lateral / bend.curvature));
      for (let k = Math.floor(bend.from / h); k <= Math.ceil(bend.to / h); k++) {
        const i = mod(k, n);
        point[i] = Math.min(point[i], cap);
      }
    }
    const reach2 = Math.ceil(trainLength / 2 / h) + 1, limit = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let v = vmax;
      for (let d = -reach2; d <= reach2; d++) v = Math.min(v, point[mod(i + d, n)]);
      limit[i] = v;
    }
    return (s) => limit[mod(Math.round(s / h), n)];
  }
  function runProfile(start, distance, limitAt, accel) {
    const n = Math.max(1, Math.ceil(distance / 2)), step = distance / n, v = new Float64Array(n + 1);
    for (let j = 1; j < n; j++) v[j] = limitAt(start + j * step);
    for (let j = 1; j <= n; j++) v[j] = Math.min(v[j], Math.sqrt(v[j - 1] ** 2 + 2 * accel * step));
    v[n] = 0;
    for (let j = n - 1; j >= 0; j--) v[j] = Math.min(v[j], Math.sqrt(v[j + 1] ** 2 + 2 * accel * step));
    const t2 = new Float64Array(n + 1);
    for (let j = 0; j < n; j++) t2[j + 1] = t2[j] + 2 * step / (v[j] + v[j + 1]);
    return { distance, step, v, t: t2, time: t2[n] };
  }
  function along(run, time) {
    const { t: t2, v, step } = run;
    if (time <= 0) return { d: 0, v: 0 };
    if (time >= run.time) return { d: run.distance, v: 0 };
    let lo = 0, hi = t2.length - 2;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (t2[mid] <= time) lo = mid;
      else hi = mid - 1;
    }
    const tau = time - t2[lo], a = (v[lo + 1] - v[lo]) / (t2[lo + 1] - t2[lo]);
    return { d: Math.min(run.distance, lo * step + v[lo] * tau + 0.5 * a * tau * tau), v: v[lo] + a * tau };
  }
  function timetable(ring2, options = {}) {
    const {
      vmax = 92,
      accel = 18,
      // Sideways acceleration allowed in a curve: about 50 units/s through a 160-unit bend.
      lateral = 16,
      dwell = 8,
      doorsOpen = 1,
      doorsClose = 1.6,
      count = 3,
      sets = Math.max(2, Math.round(ring2.length / 3200)),
      // At time zero the first train is this many seconds from the first platform.
      arrivesIn = 12
    } = options;
    const trainLength = count * CAR_LENGTH + (count - 1) * CAR_GAP;
    const limitAt = speedLimits(ring2, vmax, lateral, trainLength, 2);
    const n = ring2.stations.length;
    let start = 0;
    const legs = ring2.stations.map((from, i) => {
      const to = ring2.stations[(i + 1) % n];
      const distance = n === 1 ? ring2.length : mod(to.s - from.s, ring2.length) || ring2.length;
      const run = runProfile(from.s, distance, limitAt, accel);
      const leg = { from: i, to: (i + 1) % n, start, run };
      start += dwell + run.time;
      return leg;
    });
    const period = start;
    const lastRun = legs.at(-1).run.time;
    return {
      ring: ring2,
      legs,
      period,
      sets,
      count,
      dwell,
      doorsOpen,
      doorsClose,
      accel,
      vmax,
      limitAt,
      headway: period / sets,
      phase: period - Math.min(arrivesIn, lastRun),
      trainLength
    };
  }
  function trainsetAt(tt, k, time) {
    const tau = mod(time + tt.phase - k * tt.headway, tt.period);
    let lo = 0, hi = tt.legs.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (tt.legs[mid].start <= tau) lo = mid;
      else hi = mid - 1;
    }
    const leg = tt.legs[lo], local = tau - leg.start, from = tt.ring.stations[leg.from];
    if (local < tt.dwell)
      return {
        k,
        s: from.s,
        v: 0,
        station: leg.from,
        next: leg.to,
        dwellLeft: tt.dwell - local,
        doors: local >= tt.doorsOpen && local < tt.dwell - tt.doorsClose
      };
    const { d, v } = along(leg.run, local - tt.dwell);
    return { k, s: mod(from.s + d, tt.ring.length), v, station: -1, next: leg.to, dwellLeft: 0, doors: false };
  }
  function carriagesOf(tt, state) {
    const pitch = CAR_LENGTH + CAR_GAP;
    return Array.from({ length: tt.count }, (_, i) => {
      const s = state.s + ((tt.count - 1) / 2 - i) * pitch;
      return { i, k: state.k, s, ...tt.ring.poseAt(s), cab: i === 0 ? "front" : i === tt.count - 1 ? "rear" : null };
    });
  }
  var RIDER_CAR = 1;
  function rideStep(tt, ride, time) {
    if (!ride) return { ride };
    if (ride.phase === "platform") {
      for (let k = 0; k < tt.sets; k++) {
        const st2 = trainsetAt(tt, k, time);
        if (st2.station === ride.station && st2.doors)
          return {
            ride: { phase: "riding", set: k, car: RIDER_CAR, boardedAt: ride.station, alightAt: null },
            event: "boarded"
          };
      }
      return { ride };
    }
    const st = trainsetAt(tt, ride.set, time);
    if (ride.alightAt !== null && st.station === ride.alightAt && st.doors)
      return { ride: null, event: "alighted", station: ride.alightAt, boardedAt: ride.boardedAt };
    return { ride };
  }
  function rideRequest(tt, ride, time) {
    if (!ride) return { ride };
    if (ride.phase === "platform") return { ride: null, event: "leftPlatform", station: ride.station };
    const st = trainsetAt(tt, ride.set, time);
    if (st.station >= 0 && st.doors)
      return { ride: null, event: "alighted", station: st.station, boardedAt: ride.boardedAt };
    const stop = st.station >= 0 && st.dwellLeft > tt.doorsClose ? st.station : st.next;
    return { ride: { ...ride, alightAt: stop }, event: "alightRequested", station: stop };
  }
  function nextStop(tt, ride, time) {
    if (!ride || ride.phase !== "riding") return -1;
    const st = trainsetAt(tt, ride.set, time);
    return st.station >= 0 && !st.doors && st.dwellLeft > tt.doorsClose ? st.station : st.next;
  }
  function doorsOpenAt(tt, ride, time) {
    if (!ride || ride.phase !== "riding") return -1;
    const st = trainsetAt(tt, ride.set, time);
    return st.doors ? st.station : -1;
  }
  function platformSpot(ring2, station, offset = PLATFORM_OFFSET) {
    const pose = ring2.poseAt(station.s, 4), d = offset * (station.side ?? 1);
    return { x: pose.x - Math.sin(pose.a) * d, y: pose.y + Math.cos(pose.a) * d, a: pose.a };
  }

  // src/game/transit.js
  var STATION_REACH = 14;
  var line;
  function ringLine() {
    if (!line) {
      const ring2 = ringOf(town);
      line = { ring: ring2, tt: timetable(ring2) };
    }
    return line;
  }
  var stationName = (station) => station.name[lang] ?? station.name.fr;
  function nearStation(o = p) {
    if (game.ride || game.transit) return null;
    let best = null, d = STATION_REACH;
    for (const st of ringLine().ring.stations) {
      const here = dist(o, st.street);
      if (here < d) {
        d = here;
        best = st;
      }
    }
    return best;
  }
  function enterStation(station) {
    const { ring: ring2 } = ringLine();
    const index = ring2.stations.indexOf(station);
    game.transit = { phase: "platform", station: index };
    held.clear();
    Object.assign(p, platformSpot(ring2, station), { moving: false, stuck: 0 });
    beep(520, 0.08, "sine");
    say("platformWait", 5, "", " " + stationName(station) + ".");
  }
  function streetAt(station) {
    const { x, y } = station.street;
    const spot = footBlocked(x, y, 2.6) ? freeSpot(x, y, 2.6) : null;
    Object.assign(p, spot ?? { x, y }, { a: Math.PI / 2, moving: false, stuck: 0 });
  }
  function apply(result) {
    const { ring: ring2 } = ringLine();
    game.transit = result.ride;
    const station = ring2.stations[result.station];
    switch (result.event) {
      case "boarded":
        beep(330, 0.12, "sine");
        say("boarded", 4);
        break;
      case "alightRequested":
        beep(880, 0.05, "sine");
        say("alightRequest", 4, "", " " + stationName(station) + ".");
        break;
      case "leftPlatform":
        streetAt(station);
        say("leftPlatform", 3);
        break;
      case "alighted": {
        streetAt(station);
        const pursued = game.heat > 0.25 || people.some((n) => n.anger > 0 || n.kind === "inspector" && !n.down);
        if (result.station !== result.boardedAt) {
          game.heat = 0;
          for (const n of people) n.anger = 0;
        }
        if (pursued && result.station !== result.boardedAt) say("lostTail", 5, "dispatch");
        else say("alighted", 4, "", " " + stationName(station) + ".");
        break;
      }
    }
  }
  function transitControl() {
    apply(rideRequest(ringLine().tt, game.transit, game.time));
  }
  function chime() {
    beep(659, 0.22, "sine");
    setTimeout(() => beep(523, 0.3, "sine"), 230);
  }
  var lastStops = [];
  function updateTransit(dt) {
    const { ring: ring2, tt } = ringLine();
    for (let k = 0; k < tt.sets; k++) {
      const st = trainsetAt(tt, k, game.time);
      const arrived = st.station >= 0 && lastStops[k] !== st.station;
      lastStops[k] = st.station;
      if (!arrived) continue;
      const mine = game.transit && (game.transit.set === k || game.transit.station === st.station);
      const stop = ring2.stations[st.station].stop;
      if (mine || Math.hypot(stop.x - game.camX, stop.y + ring2.deckLift - game.camY) < game.vw * 0.6) chime();
    }
    if (!game.transit) return;
    const result = rideStep(tt, game.transit, game.time);
    if (result.event) apply(result);
    if (game.transit?.phase === "riding") {
      const car3 = carriagesOf(tt, trainsetAt(tt, game.transit.set, game.time))[game.transit.car];
      Object.assign(p, { x: car3.x, y: car3.y, a: car3.a, moving: false });
    }
  }
  function transitFocus() {
    if (!game.transit) return null;
    return { x: p.x, y: p.y - ringLine().ring.deckLift };
  }
  function transitHint(t2) {
    const { ring: ring2, tt } = ringLine();
    if (!game.transit) return "";
    if (game.transit.phase === "platform") return t2("platformHint");
    const alightAt = game.transit.alightAt;
    if (alightAt !== null) return t2("alightingHint") + " " + stationName(ring2.stations[alightAt]);
    const here = doorsOpenAt(tt, game.transit, game.time);
    if (here >= 0) return t2("doorsOpenHint") + " " + stationName(ring2.stations[here]) + "  \xB7  " + t2("alightNowKey");
    const next = nextStop(tt, game.transit, game.time);
    return t2("nextStopHint") + " " + stationName(ring2.stations[next]) + "  \xB7  " + t2("alightKey");
  }

  // src/game/boarding.js
  function roomToWalk(x, y) {
    return [0, 1, 2, 3].filter((i) => !footBlocked(x + Math.cos(i * Math.PI / 2) * 4, y + Math.sin(i * Math.PI / 2) * 4, 2.6)).length >= 2;
  }
  function clearLine(car3, x, y) {
    const steps = Math.ceil(Math.hypot(x - car3.x, y - car3.y) / 2);
    for (let i = 1; i < steps; i++) if (blocked(car3.x + (x - car3.x) * i / steps, car3.y + (y - car3.y) * i / steps, 1.5)) return false;
    return true;
  }
  function exitCar() {
    if (!game.ride) return false;
    const car3 = game.ride, long = (car3.halfLength ?? sedanHalfLength) - sedanHalfLength, wide = (car3.halfWidth ?? sedanHalfWidth) - sedanHalfWidth, cos = Math.cos(car3.a), sin = Math.sin(car3.a);
    for (const roomy of [true, false])
      for (const r of [19, 27, 37])
        for (let i = 0; i < 8; i++) {
          const a = Math.PI / 2 + i * Math.PI / 4, forward = Math.cos(a) * Math.max(4, r + long), side = Math.sin(a) * Math.max(4, r + wide), x = car3.x + cos * forward - sin * side, y = car3.y + sin * forward + cos * side;
          if (!footBlocked(x, y, 2.6) && clearLine(game.ride, x, y) && (!roomy || roomToWalk(x, y))) {
            game.ride.speed = 0;
            game.ride.slideX = 0;
            game.ride.slideY = 0;
            p.x = x;
            p.y = y;
            p.a = game.ride.a;
            if (game.ride.medical) game.ride.sirenOn = false;
            held.delete("horn");
            game.ride = null;
            return true;
          }
        }
    say("moveCar");
    return false;
  }
  function reach(c) {
    return Math.min(dist(c, p), distanceToBody(c, p.x, p.y) + sedanHalfLength);
  }
  function nearestCar() {
    const unattended = cars.find((v) => v.medical && v.keysUntil > game.time && dist(p, v) < 22);
    if (unattended) return unattended;
    if (game.active === "repo" && dist(p, target) < 22) return target;
    if (ambulance && dist(p, ambulance) < 21) return ambulance;
    let nearest = null, d = 22;
    for (const c of cars) {
      const distance = reach(c);
      if (distance >= 22) continue;
      const score = distance + (c.route ? 4 : 0);
      if (nearest === null || score < d) {
        d = score;
        nearest = c;
      }
    }
    return nearest;
  }
  function nearestBoat() {
    return boardableBoat(boatFleet.boats, river2.moorings, p);
  }
  function berthInReach() {
    return dockingMooring(
      boatFleet.boats,
      river2.moorings,
      game.ride,
      ({ x, y }) => !footBlocked(x, y, 2.6)
    );
  }
  function leaveBoat() {
    const berth = berthInReach();
    if (!berth) {
      say("boatDockFirst");
      return;
    }
    Object.assign(p, dockBoat(game.ride, berth));
    game.ride = null;
    held.delete("horn");
    say("boatMoored");
  }
  function board() {
    if (game.viewMap || panel.open) return;
    if (game.ride) {
      if (game.ride.domain === "water") leaveBoat();
      else exitCar();
      return;
    }
    const boat = nearestBoat();
    if (boat) {
      const theft2 = takeBoat(boat);
      if (theft2) game.heat = Math.min(3, game.heat + 0.45);
      game.ride = boat;
      p.x = boat.x;
      p.y = boat.y;
      p.a = boat.a;
      beep(170);
      say(theft2 ? "boatTaken" : "boatBoarded", 4, boat.model);
      return;
    }
    const c = nearestCar();
    const station = nearStation();
    if (station && (!c || dist(p, station.street) <= dist(p, c))) {
      enterStation(station);
      return;
    }
    if (!c) {
      say("closer");
      return;
    }
    if (c.condition === 0) {
      say("callRecovery");
      return;
    }
    const theft = inService(c);
    if (theft) {
      interruptRescue(c);
      game.heat = Math.min(3, game.heat + 0.85);
    }
    game.ride = c;
    delete c.homeCell;
    c.route = null;
    c.speed = c.slideX = c.slideY = 0;
    p.x = c.x;
    p.y = c.y;
    beep(180);
    if (game.active === "repo" && game.ride === target) {
      game.stage = "deliver";
      say("seized");
    } else if (c.medical) say("stolenMedic", 4, "dispatch");
    else say(c === sedan ? "sedan" : "keysIn", 4, c === sedan ? "" : c.label || fleetOf(c).label);
  }

  // src/game/damage.js
  function recordImpact(v, force, other) {
    if (force < 8) return;
    if (other) {
      v.impactTimes ??= /* @__PURE__ */ new WeakMap();
      other.impactTimes ??= /* @__PURE__ */ new WeakMap();
      if (game.time < (v.impactTimes.get(other) ?? -1)) return;
      v.impactTimes.set(other, game.time + 0.22);
      other.impactTimes.set(v, game.time + 0.22);
    } else {
      if (game.time < (v.nextWallImpact ?? -1)) return;
      v.nextWallImpact = game.time + 0.22;
    }
    crashSound(force, other ? "body" : "wall");
    if (force < 17) return;
    const loss = Math.max(1, Math.round(100 * Math.pow((force - 12) / 200, 1.7)));
    const mass = fleetOf(v).mass, against = other ? fleetOf(other).mass : 0;
    const share = (c) => other ? 2 * (c === v ? against : mass) / (mass + against) : 1 / Math.sqrt(mass);
    const taken = Math.max(1, Math.round(loss * share(v)));
    for (const c of other ? [v, other] : [v]) {
      c.condition = clamp((c.condition ?? 100) - Math.max(1, Math.round(loss * share(c))), 0, 100);
      if (!c.condition) {
        c.speed = c.slideX = c.slideY = 0;
        if (c.route) {
          c.pausedRoute = c.route;
          c.route = null;
        }
      }
    }
    fx.push({ x: v.x, y: v.y - 12, t: 0.65, s: "clang" });
    if (v.condition === 0) say("breakdown", 5, "clerk");
    else if (taken >= 24) say("dented", 3, "clerk");
  }
  function recoveryCar() {
    const c = game.ride || nearestCar();
    return c && c.condition === 0 ? c : null;
  }
  function repairCar(c) {
    box("recovery", "recoveryText", [
      [
        "repair",
        () => {
          c.condition = 100;
          c.speed = c.slideX = c.slideY = 0;
          c.slipRecovery = 0;
          c.nextWallImpact = 0;
          if (c.pausedRoute) {
            c.route = c.pausedRoute;
            delete c.pausedRoute;
          }
          say("repaired", 4, "clerk");
        }
      ],
      ["outside"]
    ]);
  }

  // src/game/driving.js
  var quarterTurn = Math.PI / 2;
  var TAU4 = 2 * Math.PI;
  function closingSpeed(a, b, normal) {
    return Math.max(
      0,
      ((b.slideX || 0) - (a.slideX || 0)) * normal.nx + ((b.slideY || 0) - (a.slideY || 0)) * normal.ny
    );
  }
  function shove(v, other, hit, travel) {
    const mass = fleetOf(v).mass, against = fleetOf(other).mass;
    if (mass <= against * 1.5 || other.route || other.medical || other === game.ride) return 0;
    const share = Math.min(0.85, (mass - against) / (mass + against));
    const x = other.x - hit.nx * travel * share, y = other.y - hit.ny * travel * share;
    if (vehicleBlocked(other, x, y) || cars.some((o) => o !== v && o !== other && carContact({ ...other, x, y }, o)))
      return 0;
    if ([p, ...people].some((n) => (n !== p || !game.ride) && distanceToBody({ ...other, x, y }, n.x, n.y) < 2.6)) return 0;
    other.x = x;
    other.y = y;
    delete other.homeCell;
    return share;
  }
  function clearTraffic(v, oldX, oldY, oldAngle, dt) {
    for (const other of cars) {
      if (other === v) continue;
      const hit = carContact(v, other);
      if (!hit) continue;
      const x = v.x + hit.nx * (hit.depth + 0.03), y = v.y + hit.ny * (hit.depth + 0.03);
      if (!vehicleBlocked(v, x, y)) {
        v.x = x;
        v.y = y;
      } else {
        const previous = carContact({ ...v, x: oldX, y: oldY, a: oldAngle }, other);
        if (hit.depth >= (previous?.depth || 0)) {
          v.x = oldX;
          v.y = oldY;
          v.a = oldAngle;
        }
      }
      const force = closingSpeed(v, other, hit);
      recordImpact(v, force, other);
      if (v.condition === 0) break;
      const inward = Math.max(0, -v.slideX * hit.nx - v.slideY * hit.ny);
      const share = shove(v, other, hit, inward * dt);
      const correction = Math.min(force, inward) * (1 - share);
      v.slideX += correction * hit.nx;
      v.slideY += correction * hit.ny;
      v.speed = v.slideX * Math.cos(v.a) + v.slideY * Math.sin(v.a);
    }
  }
  function angleDifference(to, from) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  }
  function drive(v, dt, throttle, steering, brake) {
    if (v.condition === 0) {
      v.speed = v.slideX = v.slideY = 0;
      return;
    }
    const { x: oldX, y: oldY, a: oldAngle } = v;
    const spec = fleetOf(v);
    const opposition = v.speed * throttle < 0 && Math.abs(v.speed) > 2;
    const acceleration = opposition ? spec.brake : throttle < 0 ? spec.reverseAccel : spec.accel;
    const top2 = spec.topSpeed * (120 + 61 * ((v.condition ?? 100) / 100)) / 181;
    v.speed = clamp(v.speed + throttle * acceleration * dt, -spec.reverseSpeed, top2);
    v.speed *= Math.exp(-dt * (brake ? 4.6 : throttle ? 0.16 : 1.45));
    if (!throttle && Math.abs(v.speed) < 0.55) v.speed = 0;
    const steerRate = (brake ? 3.6 : 2.65 - 0.72 * Math.min(1, Math.abs(v.speed) / 150)) * (spec.steer / 2.65);
    const rolling = Math.min(1, Math.abs(v.speed) / (spec.steer * spec.turn));
    v.a += steering * Math.sign(v.speed) * rolling * steerRate * dt;
    if (spec.leans) {
      const bank = steering * Math.sign(v.speed) * Math.min(1, Math.abs(v.speed) / 90);
      v.lean = (v.lean || 0) + (bank - (v.lean || 0)) * (1 - Math.exp(-dt * 9));
    }
    if (!steering && !brake && rolling) {
      const cardinal = Math.round(v.a / quarterTurn) * quarterTurn;
      const error = angleDifference(cardinal, v.a);
      if (Math.abs(error) < Math.PI / 25.7)
        v.a = Math.abs(error) < 3e-3 ? cardinal : v.a + error * (1 - Math.exp(-dt * 12 * rolling));
    }
    v.a = angleDifference(v.a, 0);
    if (v.a !== oldAngle) {
      const back = (spec.pivot || 0) * spec.halfLength, x = v.x + back * (Math.cos(v.a) - Math.cos(oldAngle)), y = v.y + back * (Math.sin(v.a) - Math.sin(oldAngle));
      if (vehicleBlocked(v, x, y)) v.a = oldAngle;
      else {
        v.x = x;
        v.y = y;
      }
    }
    const vx = Math.cos(v.a) * v.speed, vy = Math.sin(v.a) * v.speed;
    v.slipRecovery = brake ? 0.25 : Math.max(0, (v.slipRecovery || 0) - dt);
    const hold = spec.grip >= 1 ? 1 : 1 - Math.exp(-dt * 16 * spec.grip);
    const grip = v.slipRecovery > 0 ? Math.min(hold, 1 - Math.exp(-dt * (3.2 + 23 * (1 - v.slipRecovery / 0.25)))) : hold;
    v.slideX += (vx - v.slideX) * grip;
    v.slideY += (vy - v.slideY) * grip;
    const dx = v.slideX * dt, dy = v.slideY * dt;
    const hitX = dx !== 0 && vehicleBlocked(v, v.x + dx, v.y);
    if (!hitX) v.x += dx;
    const hitY = dy !== 0 && vehicleBlocked(v, v.x, v.y + dy);
    if (!hitY) v.y += dy;
    if (hitX || hitY) {
      const blockedSpeed = Math.hypot(hitX ? v.slideX : 0, hitY ? v.slideY : 0);
      const tangent = hitX ? Math.abs(v.slideY) : Math.abs(v.slideX);
      if (hitX && hitY || blockedSpeed > tangent * 1.25) {
        recordImpact(v, blockedSpeed, null);
        v.speed *= -0.18;
        v.slideX = 0;
        v.slideY = 0;
      } else {
        recordImpact(v, blockedSpeed, null);
        const tangentHeading = hitX ? Math.sign(Math.sin(v.a)) * quarterTurn : Math.cos(v.a) >= 0 ? 0 : Math.PI;
        const heading = v.a + angleDifference(tangentHeading, v.a) * (1 - Math.exp(-dt * 15));
        if (!vehicleBlocked(v, v.x, v.y, heading)) v.a = heading;
        v.speed *= Math.exp(-dt * 1.8);
        if (hitX) v.slideX = 0;
        if (hitY) v.slideY = 0;
      }
    }
    clearTraffic(v, oldX, oldY, oldAngle, dt);
    if (brake && Math.abs(v.speed) > 36) trails.push({ x: v.x, y: v.y, a: v.a, t: 5, w: spec.halfWidth });
  }
  var trafficAccel = 30;
  var trafficBrake = 130;
  var passingLanes = [-12, -17];
  var pavementLanes = [9, 12];
  var nextTrafficId = 1;
  function ensureCompiled(c, route) {
    if (route.segments) return;
    if (route.points) {
      route.segments = compileLegacyPoints(route.points, Math.max(8, fleetOf(c).turn));
      if (!route.segments) return;
      let bestIdx = 0, bestS = 0, bestD = Infinity;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.type !== "line") continue;
        const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
        const t2 = seg.length > 0 ? clamp(((c.x - seg.x1) * dx + (c.y - seg.y1) * dy) / (seg.length * seg.length), 0, 1) : 0;
        const d = Math.hypot(c.x - (seg.x1 + dx * t2), c.y - (seg.y1 + dy * t2));
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
          bestS = t2 * seg.length;
        }
      }
      route.segIndex = bestIdx;
      route.s = bestS;
    }
  }
  function advanceAlong(segments, segIndex, s, step, lane = 0) {
    const count = segments.length;
    let idx = segIndex;
    let curS = s;
    let left2 = step;
    let guard = 0;
    while (left2 > 0 && guard++ < count + 2) {
      const seg2 = segments[idx];
      const radiusScale = seg2.type === "arc" ? Math.max(0.5, seg2.r / Math.max(4, seg2.r + (seg2.deltaA >= 0 ? -lane : lane))) : 1;
      const effStep = left2 * radiusScale;
      const avail = seg2.length - curS;
      if (effStep < avail) {
        curS += effStep;
        left2 = 0;
      } else {
        left2 -= avail / radiusScale;
        idx = (idx + 1) % count;
        curS = 0;
      }
    }
    const seg = segments[idx];
    const pose = evalSegment(seg, curS);
    return {
      x: pose.x,
      y: pose.y,
      a: pose.a,
      segIndex: idx,
      s: curS,
      seg,
      turning: seg.type === "arc",
      inRoundabout: !!seg.inRoundabout,
      remaining: Math.max(0, seg.length - curS)
    };
  }
  function pathAt(route, distance, lane = route.lane || 0) {
    return advanceAlong(route.segments, route.segIndex, route.s, distance, lane);
  }
  function placed(path, lane) {
    return { x: path.x - Math.sin(path.a) * lane, y: path.y + Math.cos(path.a) * lane, a: path.a };
  }
  var crossing = (o, a) => o.route && Math.abs(Math.cos(o.a - a)) < 0.5;
  function inDeadlockCycle(c, o) {
    let x = o;
    for (let k = 0; k < 6 && x?.route; k++) {
      x = x.route.heldBy;
      if (x === c) return c.route.id < o.route.id;
    }
    return false;
  }
  function yieldsTo(c, o) {
    if (!c.route || !o.route) return false;
    if (c.route.yieldTarget === o && game.time < (c.route.yieldUntil || 0)) return true;
    if (c.route.wait < 3) return false;
    if (inDeadlockCycle(c, o)) {
      c.route.yieldTarget = o;
      c.route.yieldUntil = game.time + 2.5;
      return true;
    }
    return false;
  }
  var oncoming = (o, a) => o.route && Math.abs(o.route.lane || 0) <= 6 && Math.cos(o.a - a) <= -0.5;
  function lookAhead(c, path, laneFrom, laneTo, reach2, passing = laneFrom !== 0 || laneTo !== 0) {
    const cos = Math.cos(path.a), sin = Math.sin(path.a), length = c.halfLength ?? sedanHalfLength, width2 = c.halfWidth ?? sedanHalfWidth;
    const low = Math.min(laneFrom, laneTo) - width2, high = Math.max(laneFrom, laneTo) + width2;
    let gap = Infinity, what = null;
    function consider(o, along2, across, margin) {
      const dx = o.x - path.x, dy = o.y - path.y;
      const forward = dx * cos + dy * sin, side = -dx * sin + dy * cos;
      if (forward <= 0 || forward > reach2 + 30 + bodyExtra(c) + Math.max(0, along2 - sedanHalfLength)) return;
      if (side + across < low - margin || side - across > high + margin) return;
      const clear = forward - length - along2;
      if (clear < gap) {
        gap = clear;
        what = o;
      }
    }
    for (const o of cars) {
      if (o === c || crossing(o, path.a) || !passing && oncoming(o, path.a) || yieldsTo(c, o)) continue;
      const rel = o.a - path.a, hl = o.halfLength ?? sedanHalfLength, hw = o.halfWidth ?? sedanHalfWidth;
      consider(
        o,
        hl * Math.abs(Math.cos(rel)) + hw * Math.abs(Math.sin(rel)),
        hl * Math.abs(Math.sin(rel)) + hw * Math.abs(Math.cos(rel)),
        0.2
      );
    }
    for (const n of people) consider(n, 2.6, 2.6, 1);
    if (!game.ride && !game.transit) consider(p, 2.6, 2.6, 1);
    return { gap, what };
  }
  function clearPose(c, pose) {
    const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
    if (vehicleBlocked(body)) return false;
    if (!game.ride && !game.transit && distanceToBody(body, p.x, p.y) < 3) return false;
    return !cars.some((o) => o !== c && carContact(body, o));
  }
  function isStalled(o) {
    if (o === p || people.includes(o)) return false;
    return (Math.abs(o.speed || 0) < 1 || o.condition === 0) && !(o.route && o.route.wait < 1.5);
  }
  function startPass(c, route, probe, here) {
    if (probe.turning || probe.inRoundabout || probe.seg.isAlley || probe.remaining < 20) return;
    const lanes = route.wait > 4 ? [...passingLanes, ...pavementLanes] : passingLanes;
    const lane = lanes.find(
      (l) => [8, 22, 36, 50].every((d) => clearPose(c, placed(pathAt(route, d, l), l))) && lookAhead(c, here, l, l, 60).gap > 50
    );
    if (lane === void 0) return;
    route.laneTarget = lane;
    route.wait = 0;
  }
  function offscreen(o) {
    return outsideView(o, viewport(game.camX, game.camY, game.vw || 300, game.vh || 220, W, H), 16);
  }
  function backOff(c, route, probe, dt) {
    if (probe.turning || route.s < 2) return;
    const back = Math.min(route.s, 10 * dt);
    const nextS = route.s - back;
    const pt = evalSegment(probe.seg, nextS);
    const pose = placed(pt, route.lane);
    if (!clearPose(c, pose)) return;
    route.s = nextS;
    Object.assign(c, { x: pose.x, y: pose.y, a: pose.a });
  }
  function honk(c, at2) {
    c.route.honked = game.time;
    fx.push({ x: c.x, y: c.y - 10, t: 0.9, s: "honk" });
    if (dist(c, p) < 140) beep(392, 0.16, "sawtooth");
    if (at2 && at2 !== p && !at2.down) at2.startled = { from: c, until: game.time + 1.6 };
  }
  var behindBody = (c, other) => (other.x - c.x) * Math.cos(c.a) + (other.y - c.y) * Math.sin(c.a) < 0;
  var tailBrush = (c, other, hit) => c.route.wait > 2 && bodyExtra(c) > 0 && hit.depth < 2.5 && behindBody(c, other);
  function vehicleOnPath(c, route, lane, from, reach2) {
    const turning = route.segments[route.segIndex].type === "arc";
    for (let d = Math.max(4, from); d <= reach2; d += 4) {
      const p0 = pathAt(route, d, lane);
      const pose = placed(p0, lane);
      const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
      for (const o of cars) {
        if (o === c || yieldsTo(c, o)) continue;
        if (!p0.inRoundabout && (crossing(o, pose.a) || oncoming(o, pose.a))) continue;
        const near = 26 + bodyExtra(c) + bodyExtra(o);
        if (Math.abs(o.x - pose.x) > near || Math.abs(o.y - pose.y) > near) continue;
        const hit = carContact(body, o);
        if (hit && !(turning && tailBrush(c, o, hit)) && !carContact(c, o))
          return { gap: d - 4, what: o };
      }
    }
    return { gap: Infinity, what: null };
  }
  function walkerRoom(route) {
    if (route.wait > 4) route.squeezing = true;
    else if (route.wait === 0) route.squeezing = false;
    return route.squeezing ? 0.8 : 2.6;
  }
  function walkerOnPath(c, route, lane, reach2) {
    const walkers = game.ride || game.transit ? people : [...people, p], room = walkerRoom(route);
    for (let d = 4; d <= reach2; d += 4) {
      const pose = placed(pathAt(route, d, lane), lane);
      const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
      for (const n of walkers)
        if (Math.abs(n.x - pose.x) < 16 + bodyExtra(c) && Math.abs(n.y - pose.y) < 16 + bodyExtra(c) && distanceToBody(body, n.x, n.y) < room)
          return { gap: d - 4, what: n };
    }
    return { gap: Infinity, what: null };
  }
  function stalledTimer(c, route, dt) {
    const v = route.heldBy && !route.heldBy.route && isStalled(route.heldBy) ? route.heldBy : null;
    route.stalledFor = v && v === route.stalledBy && c.speed < 0.5 ? (route.stalledFor || 0) + dt : 0;
    route.stalledBy = v;
  }
  function roundaboutBusy(c, rbEntry) {
    const { x: rx, y: ry, outerRadius, joinAngle, joinPt } = rbEntry;
    for (const o of cars) {
      if (o === c || yieldsTo(c, o)) continue;
      const dCenter = Math.hypot(o.x - rx, o.y - ry);
      if (dCenter > outerRadius + 6) continue;
      if (o === game.ride && c.route.wait > 3) continue;
      if (Math.hypot(o.x - joinPt.x, o.y - joinPt.y) < 26) return o;
      const oAngle = Math.atan2(o.y - ry, o.x - rx);
      const upstream = ((oAngle - joinAngle) % TAU4 + TAU4) % TAU4;
      if (upstream < 1.75) return o;
    }
    return null;
  }
  function advanceTraffic(c, dt) {
    const route = c.route;
    ensureCompiled(c, route);
    if (!route.segments?.length) return;
    route.id ??= nextTrafficId++;
    route.segIndex ??= 0;
    route.s ??= 0;
    route.lane ??= 0;
    route.laneTarget ??= 0;
    route.speed ??= 0;
    route.wait ??= 0;
    const spec = fleetOf(c), long = bodyExtra(c);
    const cruise = route.pace * 1.25 * spec.traffic.pace;
    const probe = pathAt(route, 0);
    const ghost = route.wait > 6 && offscreen(c);
    const here = { x: probe.x, y: probe.y, a: probe.a };
    let desired = probe.turning || probe.remaining < 18 ? Math.min(cruise, probe.inRoundabout ? cruise * 0.85 : 15 + Math.max(0, probe.remaining)) : cruise;
    if (route.lane !== 0) desired = Math.min(desired, cruise * 0.6);
    const reach2 = 12 + route.speed * 0.9;
    const straight = !probe.turning ? Math.min(reach2, Math.max(0, probe.remaining)) : 0;
    const watchFrom = route.laneTarget !== 0 ? route.laneTarget : route.lane;
    let { gap, what } = lookAhead(c, here, watchFrom, route.laneTarget, straight);
    if (straight < reach2) {
      const curved = vehicleOnPath(c, route, route.laneTarget || route.lane, straight, reach2);
      if (curved.gap < gap) ({ gap, what } = curved);
    }
    if (what === p || people.includes(what)) ({ gap, what } = { gap: Infinity, what: null });
    const walker = walkerOnPath(c, route, route.laneTarget || route.lane, reach2);
    if (walker.gap < gap) ({ gap, what } = walker);
    const margin = what && isStalled(what) ? 9 : 3;
    if (gap < reach2 && !(ghost && offscreen(what))) desired = Math.min(desired, Math.max(0, (gap - margin) * 2.4));
    const junc = !probe.turning ? probe.seg.junction : null;
    const rbEntry = !probe.turning ? probe.seg.roundaboutEntry : null;
    const within = (o, r, extra = bodyExtra(o)) => junc && Math.abs(o.x - junc.x) < r + extra && Math.abs(o.y - junc.y) < r + extra;
    const headingIn = (o) => junc && (junc.x - o.x) * (o.slideX || 0) + (junc.y - o.y) * (o.slideY || 0) > 0;
    const onTraffic = (o) => {
      for (let k = 0; k < 3 && o?.route; k++) {
        const next2 = o.route.heldBy;
        if (!next2?.route) return false;
        if (Math.abs(next2.speed || 0) > 1) return true;
        o = next2;
      }
      return true;
    };
    const holds = (o) => junc && o !== c && (o.route ? o.route.wait <= 4 || onTraffic(o) : o === game.ride ? route.wait <= 3 : o.medical && Math.abs(o.speed || 0) > 1) && (within(o, 30) || within(o, 40) && headingIn(o));
    const outside = junc ? !within(c, 40) : false;
    const exitBlocked = () => {
      for (let d = Math.max(0, probe.remaining); d < probe.remaining + 46 + 2 * long; d += 6) {
        const pose = placed(pathAt(route, d), route.lane);
        const body2 = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
        const stuck = cars.find((o) => o !== c && !o.route && o !== game.ride && isStalled(o) && carContact(body2, o));
        if (stuck) return stuck;
      }
      return null;
    };
    const stopRem = rbEntry ? (rbEntry.stopOffset ?? 8) + (c.halfLength ?? sedanHalfLength) + 2 : 0;
    const rbOutside = rbEntry ? probe.remaining >= stopRem - 2 : false;
    let exitCar2 = null;
    let yieldCar = null;
    let occupied = false;
    if (rbEntry) {
      if (rbOutside && probe.remaining < stopRem + 36) {
        yieldCar = roundaboutBusy(c, rbEntry);
        if (yieldCar && !ghost) {
          occupied = true;
          desired = Math.min(desired, Math.max(0, (probe.remaining - stopRem) * 2.5));
        }
      }
    } else if (junc) {
      exitCar2 = probe.remaining < 34 + long && route.laneTarget === 0 ? exitBlocked() : null;
      const holdingCar = outside && !ghost ? cars.find(holds) : null;
      yieldCar = holdingCar;
      occupied = outside && !ghost && (!!holdingCar || !!exitCar2);
      if (occupied) {
        const toLine = Math.max(Math.abs(c.x - junc.x), Math.abs(c.y - junc.y)) - 40 - long - 0.5;
        desired = Math.min(desired, Math.max(0, toLine * 2.5));
      }
    }
    if (route.laneTarget !== route.lane) desired = Math.min(desired, Math.max(8, cruise * 0.6));
    if (spec.traffic.stops) desired = busStop(c, route, probe, desired, dt);
    const accel = desired > route.speed ? trafficAccel * Math.min(1, spec.accel / 122 + 0.35) : trafficBrake;
    route.speed += clamp(desired - route.speed, -accel * dt, accel * dt);
    if (what && route.laneTarget === 0 && route.lane === 0 && gap < 40 && gap > 4 && isStalled(what))
      startPass(c, route, probe, here);
    const heldBy = desired < 1 && what ? what : route.blocker && !route.blocker.route ? route.blocker : null;
    if (heldBy) {
      const person2 = heldBy === p || people.includes(heldBy);
      if ((person2 || heldBy === game.ride) && route.wait > 0.7 && game.time - (route.honked || -9) > 2.4)
        honk(c, heldBy);
      else if (isStalled(heldBy) && route.wait > 3 && game.time - (route.honked || -9) > 5) honk(c, null);
      if ((isStalled(heldBy) || person2 && route.wait > 1.5) && route.wait > 1.2 && route.laneTarget === 0 && route.lane === 0)
        startPass(c, route, probe, here);
    }
    if (route.laneTarget !== 0 && route.lane === route.laneTarget) {
      const home = [0, 10, 20].every((d) => clearPose(c, placed(pathAt(route, d), d ? route.lane * (1 - d / 25) : 0)));
      if (home && lookAhead(c, here, 0, 0, 60, false).gap > 30) route.laneTarget = 0;
    }
    if (route.laneTarget !== 0 && route.wait > 2 && (route.lane === 0 || clearPose(c, placed(here, 0))))
      route.laneTarget = 0;
    const step = route.speed * dt;
    const path = advanceAlong(route.segments, route.segIndex, route.s, step, route.lane);
    const body = (lane2, shift) => {
      const pose = placed(path, lane2);
      if (shift) pose.a = path.a + clamp(Math.atan2(shift, Math.max(step, 0.5)), -0.4, 0.4);
      return { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
    };
    const lateral = step > 0 ? step * 0.45 + 5 * dt : 4 * dt;
    const wantShift = clamp(route.laneTarget - route.lane, -lateral, lateral);
    function blockedAt(pose, moving) {
      if (!moving) return "still";
      if (!ghost && junc && outside && within(pose, 40, long) && cars.some(holds)) return "junction";
      if (!ghost && rbEntry && rbOutside && (path.segIndex !== route.segIndex || path.remaining < stopRem) && roundaboutBusy(c, rbEntry))
        return "junction";
      if ((pose.lane || route.lane || path.inRoundabout || path.seg.isAlley) && vehicleBlocked(pose)) return "kerb";
      if (!game.ride && !game.transit && distanceToBody(pose, p.x, p.y) < walkerRoom(route) && distanceToBody(pose, p.x, p.y) < distanceToBody(c, p.x, p.y))
        return p;
      for (const other2 of cars) {
        if (other2 === c || ghost && offscreen(other2) || yieldsTo(c, other2)) continue;
        const hit = carContact(pose, other2);
        if (!hit) continue;
        const before = carContact(c, other2)?.depth ?? 0;
        if (probe.turning && !other2.route && isStalled(other2) && behindBody(c, other2)) continue;
        if (probe.turning && tailBrush(c, other2, hit)) continue;
        const graze = probe.turning && route.wait > 2 && (!other2.route && isStalled(other2) && hit.depth < 0.6 || other2.route && other2.route.blocker === c && route.id < other2.route.id && hit.depth < 1.5);
        if (hit.depth < before || graze) continue;
        return other2;
      }
      return null;
    }
    let lane = route.lane + wantShift, next = body(lane, wantShift), blocker = blockedAt({ ...next, lane }, step > 0 || wantShift !== 0);
    if (blocker && blocker !== "junction" && wantShift && step > 0) {
      const straightOn = body(route.lane, 0);
      if (!blockedAt({ ...straightOn, lane: route.lane }, true)) {
        lane = route.lane;
        next = straightOn;
        blocker = null;
      }
    }
    const obstructed = !!blocker;
    if (blocker && typeof blocker === "object" && (blocker === game.ride || blocker.medical) && route.speed > 0) {
      const hit = carContact(next, blocker);
      if (hit) recordImpact(blocker, closingSpeed(c, blocker, hit), c);
    }
    if (obstructed || desired < 1) route.wait += dt;
    else if (!ghost) route.wait = Math.max(0, route.wait - dt * 2);
    else if (!yieldCar && !exitCar2 && gap > 15 && !cars.some((o) => o !== c && carContact(c, o))) route.wait = 0;
    const other = typeof blocker === "object" ? blocker : null;
    if (other?.route && other.route.blocker === c && !probe.turning && !route.lane && !other.route.lane && route.wait > 1.5) {
      if (!(other.route.id < route.id)) route.backing = game.time + 1;
    }
    if (route.lane && what?.route && Math.cos(what.a - probe.a) < -0.5 && desired < 1 && route.wait > 1.5)
      route.backing = game.time + 1;
    if (other && !other.route && isStalled(other) && !probe.turning && !route.lane && route.wait > 2 && route.laneTarget === 0)
      route.backing = game.time + 0.6;
    if (route.backing > game.time) {
      backOff(c, route, probe, dt);
      route.blocker = other;
      route.heldBy = other || what;
      stalledTimer(c, route, dt);
      route.speed = 0;
      return;
    }
    route.blocker = obstructed ? other : null;
    route.heldBy = other || (blocker === "junction" ? yieldCar : null) || (desired < 1 ? what || exitCar2 || yieldCar : null);
    stalledTimer(c, route, dt);
    if (obstructed) {
      route.speed = 0;
      c.speed = c.slideX = c.slideY = 0;
      return;
    }
    if (dt > 0) {
      c.slideX = (next.x - c.x) / dt;
      c.slideY = (next.y - c.y) / dt;
      c.speed = Math.hypot(c.slideX, c.slideY);
    }
    c.x = next.x;
    c.y = next.y;
    c.a = next.a;
    if (spec.leans) {
      const bank = path.turning ? Math.sign(path.seg.deltaA) * 0.85 : 0;
      c.lean = (c.lean || 0) + (bank - (c.lean || 0)) * (1 - Math.exp(-dt * 7));
    }
    route.segIndex = path.segIndex;
    route.s = path.s;
    route.lane = lane;
  }

  // src/game/triage.js
  var seatCount = 4;
  var pickupRadius = 52;
  var dispatchDelay = 12;
  function nextPatient(people2, scene2, reachable) {
    if (scene2.loaded >= seatCount) return null;
    return people2.filter(
      (n) => n.knockedOut && !n.onStretcher && Math.hypot(n.x - scene2.origin.x, n.y - scene2.origin.y) <= pickupRadius && reachable(n)
    ).sort(
      (a, b) => Math.hypot(a.x - scene2.apron.x, a.y - scene2.apron.y) - Math.hypot(b.x - scene2.apron.x, b.y - scene2.apron.y)
    )[0] ?? null;
  }

  // src/game/rescue.js
  var incidents = [];
  var ambulance = null;
  var departing = /* @__PURE__ */ new Set();
  function inService(v) {
    return v != null && (v === ambulance || departing.has(v));
  }
  function knockDown(n, cause) {
    n.down = Infinity;
    n.knockedOut = true;
    n.downSince = game.time;
    n.cause = cause;
    n.anger = 0;
    n.swing = 0;
    n.moving = false;
  }
  function nearbyPatient() {
    if (game.ride || game.viewMap || panel.open) return null;
    let patient = null, range = 21;
    for (const n of people) {
      if (!n.knockedOut || n.onStretcher) continue;
      const d = dist(n, p);
      if (d < range) {
        range = d;
        patient = n;
      }
    }
    return patient;
  }
  function clearPatient(n) {
    const index = people.indexOf(n);
    if (index >= 0) people.splice(index, 1);
    if (n === combo.lastSlapped) combo.lastSlapped = null;
    if (n === combo.slapVictim) combo.slapVictim = null;
  }
  function reportIncident() {
    const n = nearbyPatient();
    if (!n) return;
    const outrage = !!n.insultCase && n.cause === "slaps";
    const title = outrage ? "outrageTitle" : "incidentTitle";
    const copy = outrage ? "outrageCopy" : n.cause === "traffic" ? "collisionCopy" : "scuffleCopy";
    box(title, copy, [
      [
        "serveCopy",
        () => {
          if (!people.includes(n) || n.onStretcher) return;
          incidents.push({ title, copy });
          clearPatient(n);
          if (ambulance?.patient === n) {
            if (ambulance.state === "arriving") releaseVan(ambulance);
            else nextPickup(ambulance);
          }
          say("copyServed", 4, "clerk", " \xB7 \u2116 " + incidents.length);
          beep(440, 0.12, "triangle");
        }
      ],
      ["awaitMedics"]
    ]);
  }
  function streetView() {
    return viewport(game.camX, game.camY, game.vw, game.vh, W, H);
  }
  function dispatchAmbulance(n) {
    const route = planApproach(n, streetView(), (candidate) => cars.some((c) => carContact(candidate, c)));
    if (!route) {
      n.downSince = game.time - dispatchDelay + 1;
      return;
    }
    const { stop, apron, dx, dy, a, spawn } = route;
    const v = {
      patient: n,
      stop,
      apron,
      origin: { x: n.x, y: n.y },
      loaded: 0,
      ...spawn,
      dx,
      dy,
      a,
      medical: true,
      model: "ambulance",
      halfLength: fleet.ambulance.halfLength,
      halfWidth: fleet.ambulance.halfWidth,
      condition: 100,
      speed: 0,
      slideX: 0,
      slideY: 0,
      state: "arriving",
      clock: 0,
      travel: Math.max(0.8, dist(n, apron) / 14),
      crew: 0
    };
    cars.push(v);
    ambulance = v;
  }
  function trolleyRoute(v, n) {
    return walkableBetween(v.apron, n);
  }
  function nextPickup(v) {
    const n = nextPatient(people, v, (candidate) => trolleyRoute(v, candidate));
    v.patient = n;
    v.clock = 0;
    v.crew = 0;
    if (n) {
      v.travel = Math.max(0.8, dist(v.apron, n) / 14);
      v.state = "collecting";
    } else releaseVan(v);
  }
  function releaseVan(v) {
    v.patient = null;
    v.clock = 0;
    v.crew = 0;
    v.state = "leaving";
    v.mark = null;
    departing.add(v);
    if (ambulance === v) ambulance = null;
  }
  function park(v) {
    v.speed = v.slideX = v.slideY = 0;
    v.apron = { x: v.x - v.dx * 24, y: v.y - v.dy * 24 };
    if (v.patient && people.includes(v.patient) && trolleyRoute(v, v.patient)) {
      v.travel = Math.max(0.8, dist(v.apron, v.patient) / 14);
      v.state = "collecting";
      v.crew = 0;
      v.clock = 0;
    } else nextPickup(v);
  }
  function stopMotion(v) {
    v.speed = v.slideX = v.slideY = 0;
  }
  var stallLimit = 3;
  function stalled(v, dt) {
    if (v.yielding || !v.mark || dist(v, v.mark) > 4) {
      v.mark = { x: v.x, y: v.y };
      v.stall = 0;
      return false;
    }
    v.stall += dt;
    return v.stall >= stallLimit;
  }
  function standDown(v) {
    releaseVan(v);
    v.reversing = true;
  }
  function medicalDrive(v, distance, dt) {
    v.yielding = false;
    if (!dt || !distance) return true;
    const next = { ...v, x: v.x + distance * v.dx, y: v.y + distance * v.dy };
    if (!game.ride && !game.transit && dist(next, p) < 10 && dist(next, p) < dist(v, p)) {
      stopMotion(v);
      v.yielding = true;
      return false;
    }
    const speed = distance / dt;
    v.speed = speed;
    v.slideX = speed * v.dx;
    v.slideY = speed * v.dy;
    if (vehicleBlocked(next, next.x, next.y, next.a, v.state === "leaving")) {
      recordImpact(v, Math.abs(speed), null);
      stopMotion(v);
      return false;
    }
    for (const other of cars) {
      if (v === other) continue;
      const hit = carContact(next, other);
      if (!hit) continue;
      recordImpact(v, closingSpeed(v, other, hit), other);
      stopMotion(v);
      return false;
    }
    v.x = next.x;
    v.y = next.y;
    return true;
  }
  function driverPosition(v) {
    if (v.patient && (v.state === "collecting" || v.state === "loading")) return medicalCrew(v);
    const side = v.stop.horizontal ? v.y < Y(town.cellAt(v.x, v.y).row) ? -1 : 1 : v.x < X(town.cellAt(v.x, v.y).col) ? -1 : 1;
    const spots = v.stop.horizontal ? [
      [v.dx * 6, side * 8],
      [v.dx * 6, -side * 8]
    ] : [
      [side * 8, v.dy * 6],
      [-side * 8, v.dy * 6]
    ];
    for (const [ox, oy] of spots) if (!blocked(v.x + ox, v.y + oy, 2.6)) return { x: v.x + ox, y: v.y + oy };
    return { x: v.x, y: v.y };
  }
  function crewInReach() {
    let nearest = null;
    for (const v of [ambulance, ...departing]) {
      if (!v) continue;
      const spot = driverPosition(v);
      if (dist(p, spot) < 18 && (!nearest || dist(p, spot) < dist(p, nearest)))
        nearest = { ...spot, crewOf: v };
    }
    return nearest;
  }
  function interruptRescue(v) {
    if (!inService(v)) return null;
    const at2 = driverPosition(v);
    if (v.patient) {
      if (v.patient.onStretcher) {
        v.patient.x = at2.x;
        v.patient.y = at2.y;
        v.patient.onStretcher = false;
      }
      v.patient.downSince = game.time;
    }
    const driver = person(at2.x, at2.y, "medic");
    driver.look = "rescueMedic";
    driver.rest = 2;
    driver.a = v.a;
    if (v === ambulance) ambulance = null;
    departing.delete(v);
    v.state = "parked";
    v.patient = null;
    stopMotion(v);
    return driver;
  }
  function retire(v) {
    const i = cars.indexOf(v);
    if (i >= 0) cars.splice(i, 1);
    departing.delete(v);
  }
  function updateAmbulance(dt) {
    for (const v2 of departing) advanceDeparture(v2, dt);
    if (!ambulance) {
      const waiting = people.filter((n) => n.knockedOut && !n.onStretcher && game.time - n.downSince >= dispatchDelay).sort((a, b) => a.downSince - b.downSince)[0];
      if (waiting) dispatchAmbulance(waiting);
      return;
    }
    const v = ambulance;
    v.clock += dt;
    if (!v.condition) {
      interruptRescue(v);
      return;
    }
    if (v.state === "arriving") {
      const left2 = dist(v, v.stop), step = Math.min(left2, dt * Math.min(v.speed + 82 * dt, 15 + Math.min(left2, 80) * 0.72));
      if (medicalDrive(v, step, dt)) {
        if (left2 <= step) park(v);
      } else if (v.condition && dist(v, v.patient) < 80) park(v);
      if (v.state === "arriving" && stalled(v, dt)) standDown(v);
    } else if (v.state === "collecting") {
      const n = v.patient;
      if (v.clock < v.travel) v.crew = v.clock / v.travel;
      else if (v.clock < v.travel + 1.4) v.crew = 1;
      else {
        n.onStretcher = true;
        v.crew = Math.max(0, 1 - (v.clock - v.travel - 1.4) / v.travel);
        if (v.crew === 0) {
          v.state = "loading";
          v.clock = 0;
        }
      }
    } else if (v.state === "loading") {
      if (v.clock >= 1.05) {
        clearPatient(v.patient);
        v.loaded++;
        nextPickup(v);
      }
    }
  }
  function advanceDeparture(v, dt) {
    if (!v.condition) {
      interruptRescue(v);
      return;
    }
    v.clock += dt;
    if (v.clock > 2 && outsideView(v, streetView())) {
      retire(v);
      return;
    }
    const speed = Math.min(v.reversing ? 34 : 84, Math.abs(v.speed) + 45 * dt);
    medicalDrive(v, (v.reversing ? -1 : 1) * dt * speed, dt);
    if (stalled(v, dt)) {
      v.reversing = !v.reversing;
      v.mark = null;
    }
  }
  function medicalCrew(v) {
    const n = v.patient, k = v.crew;
    const a = v.apron;
    if (v.state === "loading") {
      const progress = clamp(v.clock / 0.95, 0, 1);
      return { x: a.x + v.dx * 6 * progress, y: a.y + v.dy * 6 * progress };
    }
    return { x: a.x + (n.x - a.x) * k, y: a.y + (n.y - a.y) * k };
  }

  // src/game/slap.js
  var combo = {};
  var slapDuration = 0.38;
  combo.slapVictim = null;
  combo.lastSlapped = null;
  var comboUntil = 0;
  combo.slapLanded = false;
  function slap() {
    if (game.ride || game.hitCooldown > 0 || game.viewMap || panel.open) return;
    p.hasWalked = true;
    game.hitCooldown = 0.46;
    game.flash = slapDuration;
    combo.slapLanded = false;
    const reachable = people.filter((n) => !n.down && dist(n, p) < 18 && strikeClear(p.x, p.y, n.x, n.y));
    const crew = crewInReach();
    if (crew && strikeClear(p.x, p.y, crew.x, crew.y)) reachable.push(crew);
    combo.slapVictim = game.time < comboUntil && reachable.includes(combo.lastSlapped) ? combo.lastSlapped : reachable.sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (combo.slapVictim) p.a = Math.atan2(combo.slapVictim.y - p.y, combo.slapVictim.x - p.x);
    if (Math.abs(Math.cos(p.a)) > 0.15) game.lastDir = Math.cos(p.a) < 0 ? -1 : 1;
  }
  function landSlap() {
    let n = combo.slapVictim;
    combo.slapVictim = null;
    if (n?.crewOf) {
      const crew = crewInReach();
      if (!crew || crew.crewOf !== n.crewOf || !inService(n.crewOf) || !strikeClear(p.x, p.y, crew.x, crew.y)) return;
      n.crewOf.keysUntil = game.time + 7;
      n = interruptRescue(n.crewOf);
    }
    if (!n || n.down || dist(p, n) > 21 || !strikeClear(p.x, p.y, n.x, n.y)) return;
    combo.lastSlapped = n;
    game.scuffle = { x: n.x, y: n.y, until: game.time + 0.3, victim: n };
    comboUntil = game.time + 0.85;
    crashSound(105, "slap");
    n.hits = (n.hits || 0) + 1;
    n.anger = isFighter(n.kind) ? 14 : 0;
    n.stagger = 0.33;
    n.swing = 0;
    n.cool = 0.55;
    move(n, Math.cos(p.a) * 2.7, Math.sin(p.a) * 2.7, 3);
    game.heat = Math.min(3, game.heat + 0.62);
    const echo = fx.find((f) => f.hit === n);
    if (echo) echo.t = 0;
    fx.push({ x: n.x, y: n.y - 12, t: 0.52, s: "impact", hit: n });
    game.quipTime = 1.1;
    if (n.hits >= 3) {
      knockDown(n, "slaps");
      say("served", 2);
    } else if (n.kind === "medic") say("medicHit", 2);
    else say(n.hits === 1 ? "service" : "initial", 1.6);
  }

  // src/art/hero-rig.js
  var hem = [
    [
      [0, 74],
      [55, 74],
      [75, 78],
      [82, 77],
      [88, 76],
      [88, 100],
      [105, 100],
      [105, 75],
      [152, 75]
    ],
    [
      [0, 74],
      [58, 74],
      [66, 73],
      [80, 79],
      [96, 73],
      [96, 101],
      [152, 101]
    ],
    [
      [0, 108],
      [55, 108],
      [55, 77],
      [66, 78],
      [86, 78],
      [94, 76],
      [152, 76]
    ],
    [
      [0, 73],
      [59, 73],
      [73, 77],
      [84, 77],
      [84, 102],
      [104, 102],
      [104, 76],
      [152, 76]
    ]
  ];
  var hips = [
    {
      at: [72, 75],
      walk: [
        [69, 77],
        [76, 78],
        [68, 78],
        [78, 78]
      ],
      run: [
        [70, 72],
        [73, 73],
        [67, 73],
        [75, 73]
      ]
    },
    {
      at: [76, 75],
      walk: [
        [74, 74],
        [77, 74],
        [72, 74],
        [76, 74]
      ],
      run: [
        [76, 72],
        [77, 72],
        [75, 72],
        [76, 72]
      ]
    },
    {
      at: [74, 76],
      walk: [
        [79, 77],
        [74, 74],
        [78, 77],
        [72, 74]
      ],
      run: [
        [74, 72],
        [73, 74],
        [75, 73],
        [72, 74]
      ]
    },
    {
      at: [77, 75],
      walk: [
        [77, 79],
        [72, 78],
        [76, 79],
        [69, 78]
      ],
      run: [
        [79, 74],
        [75, 74],
        [78, 74],
        [68, 74]
      ]
    }
  ];
  var legMasks = {
    walk: [
      [
        [
          [55, 73],
          [83, 73],
          [89, 87],
          [124, 109],
          [124, 132],
          [24, 132],
          [24, 107],
          [51, 91],
          [55, 83]
        ],
        [
          [62, 72],
          [78, 72],
          [81, 80],
          [90, 87],
          [104, 91],
          [104, 132],
          [40, 132],
          [40, 89],
          [64, 87]
        ],
        [
          [55, 73],
          [81, 73],
          [86, 84],
          [125, 111],
          [125, 132],
          [24, 132],
          [24, 104],
          [50, 90]
        ],
        [
          [67, 73],
          [89, 73],
          [91, 83],
          [100, 89],
          [105, 132],
          [45, 132],
          [45, 99],
          [64, 94],
          [67, 87]
        ]
      ],
      [
        [
          [59, 70],
          [92, 70],
          [93, 83],
          [92, 99],
          [98, 132],
          [46, 132],
          [50, 95],
          [58, 83]
        ],
        [
          [58, 70],
          [91, 70],
          [92, 78],
          [90, 89],
          [90, 96],
          [98, 103],
          [98, 132],
          [47, 132],
          [50, 92]
        ],
        [
          [59, 70],
          [92, 70],
          [95, 85],
          [96, 100],
          [96, 132],
          [47, 132],
          [49, 95],
          [56, 83]
        ],
        [
          [55, 70],
          [87, 70],
          [88, 77],
          [84, 83],
          [91, 89],
          [93, 96],
          [97, 104],
          [97, 132],
          [47, 132],
          [49, 95]
        ]
      ],
      [
        [
          [61, 72],
          [96, 72],
          [96, 81],
          [94, 98],
          [88, 132],
          [59, 132],
          [63, 109],
          [60, 92]
        ],
        [
          [60, 70],
          [93, 70],
          [93, 80],
          [90, 83],
          [89, 99],
          [91, 132],
          [52, 132],
          [52, 92],
          [60, 87]
        ],
        [
          [60, 72],
          [92, 72],
          [90, 80],
          [88, 94],
          [86, 108],
          [82, 132],
          [57, 132],
          [57, 108],
          [57, 91]
        ],
        [
          [59, 71],
          [94, 71],
          [94, 81],
          [93, 91],
          [94, 132],
          [54, 132],
          [56, 94],
          [60, 88]
        ]
      ]
    ],
    run: [
      [
        [
          [56, 70],
          [85, 70],
          [92, 83],
          [143, 85],
          [143, 132],
          [12, 132],
          [12, 90],
          [44, 84]
        ],
        [
          [59, 70],
          [81, 70],
          [95, 80],
          [115, 81],
          [115, 132],
          [36, 132],
          [36, 85],
          [56, 82]
        ],
        [
          [56, 70],
          [84, 70],
          [90, 79],
          [139, 96],
          [139, 132],
          [17, 132],
          [17, 84],
          [53, 82]
        ],
        [
          [60, 70],
          [78, 70],
          [85, 76],
          [94, 85],
          [114, 86],
          [114, 132],
          [32, 132],
          [32, 84],
          [55, 81]
        ]
      ],
      [
        [
          [58, 68],
          [90, 68],
          [94, 77],
          [94, 90],
          [94, 132],
          [49, 132],
          [49, 85],
          [59, 78]
        ],
        [
          [57, 68],
          [84, 68],
          [92, 76],
          [104, 82],
          [105, 132],
          [49, 132],
          [49, 85]
        ],
        [
          [58, 68],
          [90, 68],
          [93, 76],
          [94, 88],
          [94, 132],
          [48, 132],
          [49, 84],
          [58, 78]
        ],
        [
          [56, 68],
          [83, 68],
          [92, 77],
          [105, 84],
          [105, 132],
          [48, 132],
          [50, 85]
        ]
      ],
      [
        [
          [56, 69],
          [93, 69],
          [96, 80],
          [98, 92],
          [98, 132],
          [48, 132],
          [48, 90],
          [56, 78]
        ],
        [
          [54, 69],
          [93, 69],
          [100, 78],
          [101, 132],
          [46, 132],
          [47, 83]
        ],
        [
          [57, 69],
          [93, 69],
          [96, 80],
          [98, 132],
          [49, 132],
          [50, 86],
          [57, 77]
        ],
        [
          [54, 69],
          [94, 69],
          [99, 80],
          [101, 132],
          [46, 132],
          [47, 83]
        ]
      ]
    ]
  };
  var register2 = [
    [
      [1, 0],
      [2, 0],
      [1, 0],
      [0, 0]
    ],
    [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0]
    ],
    [
      [-4, 0],
      [6, 0],
      [-1, 0],
      [0, 0]
    ],
    [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0]
    ]
  ];
  var freeSide = [
    [
      [0, 0],
      [70, 0],
      [70, 24],
      [83, 28],
      [91, 13],
      [152, 13],
      [152, 72],
      [83, 72],
      [83, 86],
      [77, 94],
      [0, 94]
    ],
    [
      [0, 0],
      [62, 0],
      [64, 31],
      [66, 49],
      [69, 62],
      [59, 77],
      [59, 93],
      [0, 93]
    ],
    [
      [86, 0],
      [152, 0],
      [152, 89],
      [94, 91],
      [91, 67],
      [90, 54],
      [88, 40],
      [84, 31]
    ],
    [
      [0, 0],
      [63, 0],
      [65, 27],
      [65, 33],
      [72, 36],
      [67, 47],
      [64, 59],
      [60, 73],
      [60, 94],
      [0, 94]
    ]
  ];
  var rightArm = [
    [
      [65, 28],
      [71, 31],
      [71, 39],
      [69, 48],
      [69, 58],
      [70, 69],
      [71, 72],
      [77, 81],
      [76, 86],
      [73, 86],
      [72, 94],
      [55, 94],
      [55, 76],
      [54, 68],
      [51, 53],
      [52, 39],
      [56, 32]
    ],
    [
      [57, 31],
      [63, 32],
      [64, 37],
      [61, 47],
      [58, 56],
      [57, 69],
      [57, 73],
      [59, 80],
      [59, 96],
      [42, 96],
      [43, 80],
      [44, 70],
      [45, 59],
      [48, 44],
      [51, 35]
    ],
    [
      [91, 31],
      [98, 34],
      [101, 40],
      [105, 53],
      [110, 67],
      [109, 71],
      [117, 78],
      [118, 89],
      [95, 91],
      [93, 79],
      [97, 70],
      [92, 58],
      [87, 49],
      [86, 38]
    ],
    [
      [67, 30],
      [70, 33],
      [69, 43],
      [66, 54],
      [61, 65],
      [58, 74],
      [59, 81],
      [56, 92],
      [40, 92],
      [42, 79],
      [49, 72],
      [50, 66],
      [55, 51],
      [60, 39]
    ]
  ];
  var shoulders = [
    [62, 35],
    [58, 36],
    [93, 37],
    [66, 37]
  ];
  var elbows = [
    [61, 61],
    [52, 62],
    [99, 61],
    [58, 60]
  ];
  var folds = [
    [-1.25, 1],
    [0.25, 0.5],
    [-0.2, 0.45],
    [0.95, 1]
  ];
  var mend = [
    {
      from: 1,
      area: [
        [64, 27],
        [80, 27],
        [80, 54],
        [57, 54],
        [57, 34]
      ]
    },
    {
      from: 1,
      area: [
        [59, 34],
        [72, 34],
        [72, 52],
        [59, 52]
      ]
    },
    {
      from: -1,
      area: [
        [80, 34],
        [92, 34],
        [94, 50],
        [80, 50]
      ]
    },
    null
  ];
  var noHand = [
    [
      [55, 53],
      [73, 48],
      [89, 57],
      [90, 76],
      [55, 76]
    ],
    [
      [56, 51],
      [65, 46],
      [69, 74],
      [55, 74]
    ],
    [
      [83, 45],
      [93, 49],
      [94, 76],
      [80, 76]
    ],
    [
      [63, 44],
      [75, 38],
      [78, 75],
      [62, 75]
    ]
  ];
  var pelvis = [
    [60, 88, 70, 86],
    [59, 98, 70, 100],
    [59, 96, 70, 100],
    [63, 92, 70, 86]
  ];
  var wrists = [72, 71, 68, 70];
  var seals = [
    [94, 88, 1.5],
    [106, 88, 2.2],
    [45, 89, 2.1],
    [93, 89, 2.1]
  ];

  // src/art/konami-costume.js
  var headSlots = [
    { box: [63, 6, 24, 28], cut: [[61, 4], [93, 4], [94, 34], [81, 34], [68, 27], [61, 27]] },
    { box: [64, 6, 25, 30], cut: [[62, 4], [91, 4], [91, 27], [85, 29], [84, 37], [69, 37], [69, 29], [62, 27]] },
    { box: [62, 6, 25, 24], cut: [[60, 4], [86, 4], [86, 28], [81, 29], [65, 29], [60, 27]] },
    { box: [67, 6, 24, 28], cut: [[62, 4], [96, 4], [96, 26], [86, 27], [77, 35], [62, 36]] }
  ];
  var tie = [
    [[80, 35], [83, 36], [83, 38], [86, 42], [85, 45], [81, 39], [79, 37]],
    [[75, 37], [81, 37], [80, 40], [80.5, 45], [77.5, 48], [75.5, 45], [76.5, 40]],
    null,
    [[75, 35], [78, 36], [76, 39], [73, 45], [71, 46], [72.5, 42], [74, 38]]
  ];
  var raisedHand = [
    [[56, 34], [57, 21], [61, 20], [62, 16], [69, 16], [70, 18], [69, 25], [70, 26], [74, 24], [75, 24], [75, 27], [71, 30], [69, 32], [67, 35], [57, 36]],
    null,
    null,
    [[48, 15], [62, 14], [66, 18], [66, 30], [61, 35], [48, 35]]
  ];
  function trace(context, points) {
    context.beginPath();
    context.moveTo(...points[0]);
    for (const point of points.slice(1)) context.lineTo(...point);
    context.closePath();
  }
  function dressKonami(tile, heads, row, windup) {
    const c = tile.getContext("2d");
    const { box: box2, cut } = headSlots[row];
    const hand = windup && raisedHand[row];
    c.save();
    if (hand) {
      trace(c, hand);
      c.rect(0, 0, tile.width, tile.height);
      c.clip("evenodd");
    }
    c.globalCompositeOperation = "destination-out";
    trace(c, cut);
    c.fill();
    c.globalCompositeOperation = "source-over";
    if (tie[row]) {
      trace(c, tie[row]);
      c.fillStyle = "#24354a";
      c.fill();
    }
    const [, , w, h] = box2;
    c.drawImage(heads, 0, row * 32, w, h, ...box2);
    c.restore();
    return tile;
  }
  function tintKonamiSuit(context, x, y, width2, height2) {
    const pixels = context.getImageData(x, y, width2, height2);
    const v = pixels.data;
    for (let i = 0; i < v.length; i += 4) {
      const r = v[i], g2 = v[i + 1], b = v[i + 2];
      if (v[i + 3] && r > g2 + 8 && g2 < 0.79 * r && b > 0.82 * g2) {
        const blend = Math.min(1, (b - 0.82 * g2) / Math.max(1, 0.13 * g2));
        const light = 0.36 * r + 0.54 * g2 + 0.1 * b;
        v[i] = r + (0.76 * light + 3 - r) * blend;
        v[i + 1] = g2 + (0.83 * light + 4 - g2) * blend;
        v[i + 2] = b + (0.91 * light + 8 - b) * blend;
      }
    }
    context.putImageData(pixels, x, y);
  }

  // src/art/gait.js
  var strides = { walk: 6.8, run: 13.6 };
  var rows = { right: 0, down: 1, up: 2, left: 3 };
  var clamp2 = (value, min, max) => Math.min(max, Math.max(min, value));
  function facingRow(heading, current) {
    const s = Math.sin(heading), c = Math.cos(heading), upright = current === rows.down || current === rows.up;
    if (Math.abs(s) > (upright ? 0.62 : 0.8)) return s > 0 ? rows.down : rows.up;
    return c >= 0 ? rows.right : rows.left;
  }
  var sideways = (row) => row === rows.right || row === rows.left;
  var crawl = 4;
  var firstStep = 0.14;
  var turnDelay = 0.07;
  var pause = 0.12;
  function createGait() {
    return {
      turn: firstStep,
      distance: null,
      clock: null,
      row: rows.down,
      moving: false,
      rest: Infinity,
      run: 0,
      settle: 0,
      turning: 0,
      gathering: false,
      steppingIn: false
    };
  }
  function advanceGait(gait, { distance, moving, running, heading, now }) {
    const dt = gait.clock === null ? 0 : clamp2(now - gait.clock, 0, 0.1), travelled = gait.distance === null ? 0 : clamp2(distance - gait.distance, 0, 8);
    gait.clock = now;
    gait.distance = distance;
    if (dt > 0 && travelled < dt * crawl) moving = false;
    if (moving) {
      const wanted = facingRow(heading, gait.row);
      if (!gait.moving && gait.rest > pause) {
        gait.turn = firstStep;
        gait.row = wanted;
        gait.turning = 0;
        gait.run = running ? 1 : 0;
      } else if (wanted === gait.row) gait.turning = 0;
      else {
        gait.turning += dt;
        if (sideways(wanted) === sideways(gait.row) || gait.turning >= turnDelay) {
          gait.row = wanted;
          gait.turning = 0;
        }
      }
      gait.turn += travelled / (2 * strides[running ? "run" : "walk"]);
      gait.turn -= Math.floor(gait.turn);
      gait.run = clamp2(gait.run + (running ? dt : -dt) / 0.14, 0, 1);
      gait.rest = 0;
      gait.settle = Math.min(1, gait.settle + dt / 0.12);
    } else {
      if (heading !== gait.heading && gait.heading !== void 0) gait.row = facingRow(heading, gait.row);
      if (gait.moving) {
        const beat = Math.floor(gait.turn * 4 + 0.5) % 4;
        gait.gathering = beat % 2 === 0 && sideways(gait.row);
        if (gait.gathering) gait.turn = (beat + 0.499) / 4;
      }
      gait.rest += dt;
      gait.turning = 0;
      gait.settle = Math.max(0, gait.settle - dt / 0.18);
    }
    gait.moving = moving;
    gait.heading = heading;
    gait.steppingIn = !moving && gait.gathering && gait.settle > 0.5;
    return gait;
  }
  function createStroll() {
    return { turn: 0, x: null, y: null, clock: null, row: null, speed: 0, hurry: 0, idle: Infinity, walking: false };
  }
  function advanceStroll(stroll, { x, y, heading, now, stride: stride2 }) {
    const dt = stroll.clock === null ? 0 : now - stroll.clock;
    const fresh = stroll.x === null || dt < 0 || dt > 0.25, travelled = fresh ? 0 : Math.hypot(x - stroll.x, y - stroll.y), jumped = travelled > 12;
    stroll.clock = now;
    stroll.x = x;
    stroll.y = y;
    stroll.row = facingRow(heading, stroll.row ?? rows.right);
    if (dt <= 0 || fresh || jumped) return stroll;
    const speed = travelled / dt;
    stroll.speed += (speed - stroll.speed) * Math.min(1, dt * 12);
    if (speed > 3) {
      if (!stroll.walking && stroll.idle > pause) stroll.turn = firstStep;
      stroll.idle = 0;
      stroll.walking = true;
      stroll.hurry = clamp2((stroll.speed - 24) / 20, 0, 1);
      stroll.turn += travelled / (2 * stride2 * (1 + 0.7 * stroll.hurry));
      stroll.turn -= Math.floor(stroll.turn);
    } else {
      stroll.idle += dt;
      if (stroll.idle > 0.1) stroll.walking = false;
    }
    return stroll;
  }

  // src/art/hero.js
  var width = 152;
  var height = 132;
  var ground = 130;
  function prepareHero(alternate = false) {
    const sheets = {};
    for (const key of ["walk", "run", "slapping", "body"]) {
      const surface = document.createElement("canvas");
      surface.width = (key === "body" ? 3 : 4) * width;
      surface.height = 4 * height;
      sheets[key] = surface;
    }
    const size = width * height;
    const scratch = blank().getContext("2d", { willReadFrequently: true });
    function blank() {
      const tile = document.createElement("canvas");
      tile.width = width;
      tile.height = height;
      return tile;
    }
    function path(c, points) {
      c.beginPath();
      c.moveTo(...points[0]);
      for (const p2 of points.slice(1)) c.lineTo(...p2);
      c.closePath();
    }
    function inside(points, grow = 0) {
      scratch.clearRect(0, 0, width, height);
      path(scratch, points);
      scratch.fillStyle = "#000";
      scratch.fill();
      if (grow) {
        scratch.lineWidth = grow * 2;
        scratch.lineJoin = "round";
        scratch.strokeStyle = "#000";
        scratch.stroke();
      }
      const alpha = scratch.getImageData(0, 0, width, height).data, mask = new Uint8Array(size);
      for (let i = 0; i < size; i++) mask[i] = alpha[i * 4 + 3] > 127 ? 1 : 0;
      return mask;
    }
    function cell(source, frame, row, dx = 0, dy = 0) {
      scratch.clearRect(0, 0, width, height);
      scratch.drawImage(source, frame * width, row * height, width, height, dx, dy, width, height);
      return scratch.getImageData(0, 0, width, height);
    }
    function paste(target2, source, mask, keep = false) {
      const t2 = target2.data, s = source ? source.data : null;
      for (let i = 0; i < size; i++) {
        if (!mask[i] === keep) for (let k = 0; k < 4; k++) t2[i * 4 + k] = s ? s[i * 4 + k] : 0;
      }
      return target2;
    }
    function canvasOf(pixels) {
      const tile = blank();
      tile.getContext("2d").putImageData(pixels, 0, 0);
      return tile;
    }
    function heroTile(pixels, row, windup = false) {
      const tile = canvasOf(pixels);
      return alternate ? dressKonami(tile, artwork.konamiHeads, row, windup) : tile;
    }
    function upperHalf(row) {
      return [[0, 0], [width, 0], ...hem[row].slice().reverse()];
    }
    function light(v, i) {
      return v[i + 3] > 40 && v[i] > 150 && v[i + 1] > 95;
    }
    function skinned(v, i) {
      for (let dy = -1; dy < 2; dy++)
        for (let dx = -1; dx < 2; dx++) if (light(v, (i + dy * width + dx) * 4)) return true;
      return false;
    }
    function reweave(pixels, mask, from) {
      const v = pixels.data;
      let last = null;
      for (let y = height - 1; y >= 0; y--) {
        for (let x = from > 0 ? width - 2 : 1; x > 0 && x < width - 1; x -= from) {
          const i = y * width + x;
          if (!mask[i] || v[i * 4 + 3] > 200) continue;
          let reach2 = 1;
          while (reach2 < 4 && v[(i + from * reach2) * 4 + 3] <= 200) reach2++;
          if (reach2 === 4) continue;
          let cloth = i + from * reach2, best = -999;
          for (let step = reach2; step < reach2 + 7; step++) {
            const s = i + from * step;
            if (s < y * width || s >= (y + 1) * width || v[s * 4 + 3] <= 200) break;
            const red = v[s * 4] - 2 * v[s * 4 + 1];
            if (red > best) {
              best = red;
              cloth = s;
            }
          }
          if (best < 40 && last !== null) cloth = last;
          else last = cloth;
          for (let bridge = 1; bridge < reach2; bridge++) {
            for (let k = 0; k < 3; k++) v[(i + from * bridge) * 4 + k] = v[cloth * 4 + k];
            v[(i + from * bridge) * 4 + 3] = 255;
          }
          for (let fill = x; fill > 0 && fill < width - 1 && mask[y * width + fill] && v[(y * width + fill) * 4 + 3] <= 200; fill -= from) {
            for (let k = 0; k < 3; k++) v[(y * width + fill) * 4 + k] = v[cloth * 4 + k];
            v[(y * width + fill) * 4 + 3] = 255;
            x = fill;
          }
        }
      }
    }
    function armhole(row) {
      const hole = inside(rightArm[row]);
      if (!mend[row]) return hole;
      const halo = inside(rightArm[row], 2.5), torso = inside(mend[row].area), side = inside(noHand[row]), whole = inside(upperHalf(row));
      for (let i = 0; i < size; i++) hole[i] |= halo[i] & (torso[i] | side[i]) & whole[i];
      return hole;
    }
    function jacket(row, stand) {
      const coat = paste(
        new ImageData(new Uint8ClampedArray(stand.data), width, height),
        null,
        inside(upperHalf(row)),
        true
      );
      const arm = armhole(row);
      paste(coat, null, arm);
      const cloth = cell(artwork.slapping, 0, row, ...register2[row][0]), patch = inside(noHand[row]);
      for (let i = 0; i < size; i++) patch[i] &= arm[i];
      paste(coat, cloth, patch);
      if (mend[row]) {
        const gap = inside(mend[row].area), known = inside(noHand[row]);
        for (let i = 0; i < size; i++) gap[i] &= arm[i] & ~known[i];
        reweave(coat, gap, mend[row].from);
      }
      return coat;
    }
    function freeArm(row, stand) {
      const arm = paste(
        new ImageData(new Uint8ClampedArray(stand.data), width, height),
        null,
        inside(rightArm[row], 1.2),
        true
      );
      const v = arm.data, drop = [];
      for (let y = wrists[row]; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x;
          if (!v[i * 4 + 3]) continue;
          if (!skinned(v, i)) drop.push(i);
        }
      for (const i of drop) v[i * 4 + 3] = 0;
      return canvasOf(arm);
    }
    function bentArm(arm, row) {
      const [ex, ey] = elbows[row], [turn, squash] = folds[row];
      const tile = blank(), c = tile.getContext("2d");
      const v = arm.getContext("2d").getImageData(0, 0, width, height).data;
      let cloth = "#8d2338", best = -999;
      for (let dy = -3; dy < 4; dy++)
        for (let dx = -5; dx < 6; dx++) {
          const i = ((ey + dy) * width + ex + dx) * 4, red = v[i] - 2 * v[i + 1];
          if (v[i + 3] > 200 && red > best) {
            best = red;
            cloth = "rgb(" + v[i] + "," + v[i + 1] + "," + v[i + 2] + ")";
          }
        }
      c.fillStyle = "#2c0d1b";
      c.beginPath();
      c.arc(ex, ey, 5.6, 0, TAU);
      c.fill();
      c.fillStyle = cloth;
      c.beginPath();
      c.arc(ex, ey, 4.4, 0, TAU);
      c.fill();
      c.drawImage(arm, 0, 0, width, ey + 1, 0, 0, width, ey + 1);
      c.translate(ex, ey);
      c.rotate(turn);
      c.scale(1, squash);
      c.translate(-ex, -ey);
      c.drawImage(arm, 0, ey - 1, width, height - ey + 1, 0, ey - 1, width, height - ey + 1);
      return tile;
    }
    function legLayer(key, row, frame) {
      const legs = paste(cell(artwork[key], frame, row), null, inside(legMasks[key][row][frame]), true), data = legs.data;
      for (let y = 65; y < (row === 2 ? 112 : 96); y++)
        for (let x = 30; x < 123; x++) {
          if (y >= 96 && x > 70) continue;
          const i = 4 * (y * width + x);
          if (data[i] > 145 && data[i + 1] > 90 && data[i + 1] > data[i + 2] * 1.15) data[i + 3] = 0;
        }
      return canvasOf(legs);
    }
    function specks(v, limit) {
      const seen = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        if (seen[i] || v[i * 4 + 3] === 0) continue;
        const piece = [i];
        seen[i] = 1;
        for (let j = 0; j < piece.length; j++) {
          const n = piece[j], x = n % width;
          for (const nb of [n - width, n + width, x > 0 ? n - 1 : -1, x < width - 1 ? n + 1 : -1]) {
            if (nb < 0 || nb >= size || seen[nb] || !v[nb * 4 + 3]) continue;
            seen[nb] = 1;
            piece.push(nb);
          }
        }
        if (piece.length < limit) for (const n of piece) v[n * 4 + 3] = 0;
      }
    }
    function seat(c, row) {
      const [left2, right, top2, depth] = pelvis[row], pixels = c.getImageData(0, 0, width, height), v = pixels.data;
      specks(v, 55);
      for (let x = left2; x <= right; x++) {
        let y = top2;
        while (y <= depth && v[(y * width + x) * 4 + 3] < 200) y++;
        if (y > depth) continue;
        let last = y;
        for (let scan = y; scan <= depth; scan++)
          if (v[(scan * width + x) * 4 + 3] < 200) {
            let below = scan;
            while (below <= depth + 6 && v[(below * width + x) * 4 + 3] < 200) below++;
            if (below <= depth + 6) last = below;
            scan = below;
          }
        const stop = Math.max(y, last);
        let sample = stop + 3, best = -999;
        for (let probe = stop + 3; probe < stop + 13 && probe < height; probe++) {
          const p2 = (probe * width + x) * 4;
          if (v[p2 + 3] < 200) continue;
          const red = v[p2] - 2 * v[p2 + 1];
          if (red > best) {
            best = red;
            sample = probe;
          }
        }
        if (best === -999) continue;
        const s = (sample * width + x) * 4;
        for (let fill = top2; fill < stop + 3; fill++) {
          const i = (fill * width + x) * 4;
          if (fill >= y && fill < stop && v[i + 3] >= 200 && !light(v, i)) continue;
          v[i] = v[s];
          v[i + 1] = v[s + 1];
          v[i + 2] = v[s + 2];
          v[i + 3] = 255;
        }
      }
      c.putImageData(pixels, 0, 0);
    }
    function cleanEdges(sheet) {
      const c = sheet.getContext("2d");
      for (let row = 0; row < 4; row++)
        for (let frame = 0; frame < sheet.width / width; frame++) {
          const tile = c.getImageData(frame * width, row * height, width, height);
          specks(tile.data, 55);
          c.putImageData(tile, frame * width, row * height);
        }
    }
    function seal(c, row) {
      const [x, y, r] = seals[row];
      c.fillStyle = "#822c37";
      c.beginPath();
      c.ellipse(x, y, r, 2.1, 0, 0, TAU);
      c.fill();
      c.fillStyle = "#df8a61";
      c.fillRect(x - 0.4, y - 1.2, 0.85, 0.75);
    }
    function finishPose(c, frame, row) {
      if (alternate) tintKonamiSuit(c, frame * width, row * height, width, height);
      seal(c, row);
    }
    for (let row = 0; row < 4; row++) {
      const stand = cell(artwork.slapping, 3, row), coatPixels = jacket(row, stand);
      const coat = heroTile(coatPixels, row), arm = freeArm(row, stand);
      for (let frame = 0; frame < 4; frame++) {
        const hit = sheets.slapping.getContext("2d");
        hit.save();
        hit.translate(width * frame, height * row);
        const pose = new ImageData(new Uint8ClampedArray(stand.data), width, height);
        if (row === 1 && (frame === 1 || frame === 2)) {
          paste(pose, coatPixels, armhole(row));
          hit.drawImage(heroTile(pose, row), 0, 0);
          hit.save();
          if (frame === 2) {
            hit.translate(57, 35);
            hit.rotate(-0.32);
            hit.translate(-57, -35);
          }
          hit.drawImage(artwork.sweep, (frame - 1) * width, 0, width, height, 0, 0, width, height);
          hit.restore();
        } else {
          if (frame < 3)
            paste(pose, cell(artwork.slapping, frame, row, ...register2[row][frame]), inside(freeSide[row]));
          if (row === 3 && frame < 3)
            paste(
              pose,
              stand,
              inside([
                [69, 29],
                [77, 29],
                [77, 67],
                [62, 67],
                [63, 54],
                [65, 45],
                [66, 38]
              ])
            );
          let palm = null;
          if (row === 0 && frame === 2) {
            const reach2 = inside([
              [88, 55],
              [108, 55],
              [108, 73],
              [97, 73],
              [94, 70.2],
              [88, 70.2]
            ]), v = pose.data;
            palm = new ImageData(width, height);
            for (let i = 0; i < size; i++)
              if (reach2[i] && v[i * 4 + 3] && skinned(v, i))
                for (let k = 0; k < 4; k++) palm.data[i * 4 + k] = v[i * 4 + k];
            for (let i = 0; i < size; i++)
              if (palm.data[i * 4 + 3]) for (let k = 0; k < 4; k++) v[i * 4 + k] = stand.data[i * 4 + k];
          }
          hit.drawImage(heroTile(pose, row, frame === 0), 0, 0);
          if (palm) {
            hit.save();
            hit.translate(88, 62);
            hit.rotate(-0.45);
            hit.translate(-88, -62);
            hit.drawImage(canvasOf(palm), 0, 0);
            hit.restore();
          }
        }
        finishPose(hit, frame, row);
        hit.restore();
        for (const key of ["walk", "run"]) {
          const c = sheets[key].getContext("2d"), hip = hips[row];
          const sourceRow = row === 3 ? 0 : row, sourceHip = hips[sourceRow];
          const twin = row === 1 && frame > 1, sourceFrame = twin ? frame - 2 : frame;
          const [x, y] = sourceHip[key][sourceFrame], [cx, cy] = hip.at;
          const legs = blank(), l = legs.getContext("2d", { willReadFrequently: true });
          l.translate(cx, cy);
          if (row === 3 || twin) l.scale(-1, 1);
          l.scale(1, (ground - cy) / (ground - y));
          l.translate(-x, -y);
          l.drawImage(legLayer(key, sourceRow, sourceFrame), 0, 0);
          l.setTransform(1, 0, 0, 1, 0, 0);
          seat(l, row);
          if (alternate) tintKonamiSuit(l, 0, 0, width, height);
          c.drawImage(legs, frame * width, row * height);
        }
      }
      const body = sheets.body.getContext("2d");
      body.save();
      body.translate(0, height * row);
      body.drawImage(coat, 0, 0);
      body.drawImage(arm, width, 0);
      body.drawImage(bentArm(arm, row), 2 * width, 0);
      body.restore();
      if (alternate) tintKonamiSuit(body, 0, height * row, 3 * width, height);
      body.save();
      body.translate(0, height * row);
      seal(body, row);
      body.restore();
    }
    for (const sheet of Object.values(sheets)) cleanEdges(sheet);
    return sheets;
  }
  var cellWidth = 19.6;
  var cellHeight = 17;
  var left = -9.8;
  var top = -16.8;
  var unit = cellWidth / width;
  var mix = (a, b, t2) => a + (b - a) * t2;
  function drawHero(g2, hero, pose) {
    const { row } = pose;
    g2.save();
    g2.translate(left, top);
    g2.scale(cellWidth / width, cellHeight / height);
    if (pose.strike !== void 0) g2.drawImage(hero.slapping, pose.strike * width, row * height, width, height, 0, 0, width, height);
    else if (pose.moving) drawStride(g2, hero, pose);
    else if (pose.steppingIn) drawStride(g2, hero, { ...pose, poise: pose.settle });
    else {
      const settle2 = pose.settle || 0, [cx] = hips[row].at;
      if (settle2 > 1e-3) {
        const profile = row === 0 || row === 3;
        g2.translate(cx, ground);
        if (profile) g2.rotate((row === 0 ? 1 : -1) * mix(0.03, 0.13, pose.run || 0) * settle2);
        const give = mix(0.012, 0.034, pose.run || 0) * settle2;
        g2.scale(1 + give, 1 - give);
        g2.translate(-cx, -ground);
      }
      g2.drawImage(hero.slapping, 3 * width, row * height, width, height, 0, 0, width, height);
    }
    g2.restore();
  }
  function drawStride(g2, hero, { row, turn, run = 0, poise = 1 }) {
    const running = run > 0.5, key = running ? "run" : "walk", profile = row === 0 || row === 3, facing = row === 3 ? -1 : 1, [cx, cy] = hips[row].at, [sx, sy] = shoulders[row];
    turn -= Math.floor(turn);
    const beat = turn * 4 + 0.5, frame = Math.floor(beat) % 4, drift = beat - Math.floor(beat) - 0.5, reach2 = Math.cos(2 * TAU * turn), swing = (row === 2 ? -1 : 1) * Math.cos(TAU * turn), span = strides[key] / unit;
    const lift2 = running ? -4.2 * (0.5 + 0.5 * reach2) * poise : 0, sink = (running ? -1.6 * reach2 : 1.3 * Math.cos(2 * TAU * (turn - 0.03))) * poise, stretch = (ground - cy - sink) / (ground - cy);
    g2.translate(0, lift2);
    const legs = () => {
      g2.save();
      g2.translate(0, ground);
      g2.scale(1, stretch);
      g2.translate(0, -ground);
      const slope = span / (ground - cy);
      if (!profile) g2.drawImage(hero[key], frame * width, row * height, width, height, 0, 0, width, height);
      else if (frame % 2) {
        const shear = -facing * drift * 0.5 * slope * (running ? 0.7 : 0.9);
        g2.transform(1, 0, shear, 1, -shear * cy, 0);
        g2.drawImage(hero[key], frame * width, row * height, width, height, 0, 0, width, height);
      } else {
        const close = Math.abs(drift) * 0.5 * slope * (running ? 0.6 : 0.9);
        for (const side of [-facing, facing]) {
          const from = side < 0 ? 0 : cx, wide = side < 0 ? cx : width - cx, shear = -side * close, leading = side === facing, raised = (leading ? drift < 0 : drift > 0) ? 1 - Math.abs(drift) * 9 / (ground - cy) : 1;
          g2.save();
          g2.transform(1, 0, shear, raised, -shear * cy, cy * (1 - raised));
          g2.drawImage(hero[key], frame * width + from, row * height, wide, height, from, 0, wide, height);
          g2.restore();
        }
      }
      g2.restore();
    };
    const arm = () => {
      g2.save();
      g2.translate(sx, sy);
      let phase = swing * poise;
      if (row === 0 && phase < 0) phase *= 0.62;
      if (profile) g2.rotate(running ? phase * 0.5 + facing * 0.3 : phase * 0.34);
      else {
        g2.rotate(phase * (running ? 0.1 : 0.068));
        g2.scale(1, running ? 0.97 - phase * 0.08 : 0.94 + phase * 0.06);
      }
      g2.translate(-sx, -sy);
      g2.drawImage(hero.body, (running ? 2 : 1) * width, row * height, width, height, 0, 0, width, height);
      g2.restore();
    };
    const lean = () => {
      g2.translate(profile ? 0 : 0.9 * Math.sin(TAU * turn), sink);
      g2.translate(cx, cy);
      if (profile) g2.rotate(facing * (mix(0.03, 0.13, run) + (running ? 0.02 : 0.012) * reach2) * poise);
      else g2.rotate(mix(0.014, 0.03, run) * Math.sin(TAU * turn) * poise);
      g2.translate(-cx, -cy);
    };
    if (row === 3) {
      g2.save();
      lean();
      arm();
      g2.restore();
    }
    legs();
    lean();
    g2.drawImage(hero.body, 0, row * height, width, height, 0, 0, width, height);
    if (row !== 3) arm();
  }

  // src/art/emergency.js
  function rescueFacing(dx, dy) {
    return Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 0 : 1 : dy >= 0 ? 2 : 3;
  }
  function drawCrew(crew, v) {
    const returning = v.patient.onStretcher, sign = returning ? -1 : 1;
    const facing = v.state === "loading" ? rescueFacing(v.dx, v.dy) : rescueFacing(sign * (v.patient.x - v.apron.x), sign * (v.patient.y - v.apron.y));
    const walking = v.crew > 0 && v.crew < 1 || v.state === "loading";
    g.save();
    g.translate(crew.x, crew.y);
    if (v.state === "loading") g.globalAlpha = clamp((1.05 - v.clock) / 0.38, 0, 1);
    if (returning) {
      const frame = walking ? Math.floor(v.clock * 5) % 2 : 0;
      shadow(0, 0, facing < 2 ? 7.7 : 3.3, facing < 2 ? 1.8 : 3);
      g.drawImage(artwork.rescueStretcher, facing * 230, frame * 200, 230, 200, -11.5, -19.5, 23, 20);
    } else {
      const row = facing < 2 ? 0 : facing === 2 ? 1 : 2, step = walking ? Math.floor(v.clock * 7) % 4 : 0;
      shadow(0, 0, 2.5, 1.05);
      if (facing === 1) g.scale(-1, 1);
      g.drawImage(artwork.rescueMedic, step * 104, row * 148, 104, 148, -5.2, -14.5, 10.4, 14.8);
    }
    g.restore();
  }
  var rescueBeaconCentres = [
    [
      [-9.04, -13.51],
      [4.87, -13.51]
    ],
    [
      [-4.93, -13.51],
      [9.25, -13.51]
    ],
    [
      [-2.91, -12.3],
      [2.7, -12.3]
    ],
    [
      [-2.91, -12.3],
      [2.7, -12.3]
    ]
  ];
  function drawAmbulance(v) {
    const facing = rescueFacing(v.dx, v.dy), horizontal = facing < 2;
    const flash = (1 + Math.sin(game.time * 12)) * 0.5;
    g.save();
    g.translate(v.x, v.y);
    if (v.condition > 0) {
      g.save();
      g.rotate(v.a);
      const beam = g.createRadialGradient(11, 0, 0, 22, 0, 20);
      beam.addColorStop(0, "#ffd78242");
      beam.addColorStop(1, "#ffd78200");
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(9, -4);
      g.lineTo(39, -9);
      g.lineTo(39, 9);
      g.lineTo(9, 4);
      g.fill();
      g.restore();
    }
    g.save();
    g.rotate(v.a);
    shadow(0, 0.6, 13.8, 4.8);
    g.restore();
    const manual = v.state === "parked" || v.condition < 65;
    let beacons = rescueBeaconCentres[facing];
    if (manual) {
      const angle = (v.a % TAU + TAU) % TAU, frame = Math.round(angle / TAU * 64) % 64;
      const atlas = v.condition === 0 ? artwork.ambulanceWreck : v.condition < 65 ? artwork.ambulanceDented : artwork.ambulanceTurns;
      const cell = atlas.width / 8, scale = 5.65;
      g.save();
      g.rotate(Math.sin(angle - frame * TAU / 64) * 0.72);
      g.drawImage(
        atlas,
        frame % 8 * cell,
        Math.floor(frame / 8) * cell,
        cell,
        cell,
        -96 / scale,
        -126 / scale,
        192 / scale,
        192 / scale
      );
      g.restore();
      beacons = [-9, 5].map((u) => [
        u * Math.cos(angle),
        u * Math.sin(angle) * 0.78 - (v.condition < 65 ? 10.35 : 12.8)
      ]);
    } else {
      const body = v.state === "collecting" || v.state === "loading" ? artwork.rescueOpen : artwork.rescueVan;
      g.drawImage(
        body,
        facing % 2 * 288,
        Math.floor(facing / 2) * 288,
        288,
        288,
        -144 / 8.5,
        -144 / 8.5,
        288 / 8.5,
        288 / 8.5
      );
    }
    if (v.condition > 0)
      for (const [i, [x, y]] of beacons.entries()) {
        const brightness = (i ? 1 - flash : flash) ** 3;
        const halo = g.createRadialGradient(x, y, 0, x, y, 2.5);
        halo.addColorStop(0, "rgba(185,234,255," + 0.85 * brightness + ")");
        halo.addColorStop(0.35, "rgba(89,170,255," + 0.54 * brightness + ")");
        halo.addColorStop(1, "rgba(75,155,255,0)");
        g.fillStyle = halo;
        g.fillRect(x - 2.5, y - 2.5, 5, 5);
      }
    g.restore();
    drawDamageSmoke(v);
  }
  function dazedStars(n) {
    for (let i = 0; i < 3; i++) {
      const phase = game.time * 2.8 + i * TAU / 3, x = n.x + Math.cos(phase) * 4.4, y = n.y - 10.5 + Math.sin(phase) * 1.05;
      g.save();
      g.translate(x, y);
      g.rotate(phase * 0.55);
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.66 : 1.65;
        if (k) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.strokeStyle = "#392238";
      g.lineWidth = 0.55;
      g.stroke();
      g.fillStyle = "#ffdd65";
      g.fill();
      g.restore();
    }
  }
  function crowdPose(n, column2) {
    const row = n.look === "worker" ? 0 : n.look === "lady" ? 1 : 2;
    if (Math.cos(n.a) < 0) g.scale(-1, 1);
    g.drawImage(artwork.scuffle, column2 * 152, row * 132, 152, 132, -8, -13.7, 16, 14);
  }

  // src/art/pedestrians.js
  var fighterStride = 5;
  var civilianStride = 6.1;
  var medicStride = 6.3;
  var strolls = /* @__PURE__ */ new WeakMap();
  function strollOf(n, stride2) {
    let stroll = strolls.get(n);
    if (!stroll) strolls.set(n, stroll = createStroll());
    return advanceStroll(stroll, { x: n.x, y: n.y, heading: n.a, now: game.time, stride: stride2 });
  }
  function strideFrame(stroll, cycle, hold = 0.5) {
    const step = stroll.turn * 2 + hold / 2;
    return cycle[Math.floor(step) % 2 * 2 + (step - Math.floor(step) < hold ? 0 : 1)];
  }
  function carry(stroll, forward) {
    const fall = Math.cos(2 * TAU * stroll.turn), hurry = stroll.hurry || 0;
    g.translate(0, -0.42 * hurry * (0.5 + 0.5 * fall));
    if (forward) g.rotate(forward * 0.09 * hurry);
    g.scale(1 + 0.01 * fall, 1 - (0.02 + 0.012 * hurry) * fall);
  }
  function drawFighter(n) {
    const stroll = strollOf(n, fighterStride), row = stroll.row;
    let frame = 0;
    if (n.down) frame = 6;
    else if (n.stagger > 0) frame = 5;
    else if (n.swing > 0) frame = n.swing > 0.21 ? 3 : n.swing > 0.08 ? 4 : 0;
    else if (stroll.walking) {
      frame = strideFrame(stroll, [1, 0, 2, 0], 0.64 + 0.2 * stroll.hurry);
      carry(stroll, row === rows.right ? 1 : row === rows.left ? -1 : 0);
    }
    g.drawImage(artwork[fighterLook(n)], frame * 144, row * 128, 144, 128, -9, -15.625, 18, 16);
  }
  var stride = createGait();
  function drawPlayer(n) {
    const hero = game.konamiHero ? artwork.konamiHero : artwork.hero;
    const vertical = Math.abs(Math.sin(n.a)) > 0.78;
    if (!vertical) game.lastDir = Math.cos(n.a) < 0 ? -1 : 1;
    const striking = game.flash > 0;
    advanceGait(stride, {
      distance: n.walkDistance || 0,
      moving: !!n.moving && !striking,
      running: held.has("run"),
      heading: n.a,
      now: performance.now() / 1e3
    });
    let pose = stride;
    if (striking) {
      stride.row = vertical ? Math.sin(n.a) > 0 ? rows.down : rows.up : game.lastDir > 0 ? rows.right : rows.left;
      stride.settle = 0;
      pose = {
        row: stride.row,
        strike: Math.min(3, Math.floor((slapDuration - game.flash) / slapDuration * 4))
      };
    }
    const airborne = pose.moving && pose.run > 0.5 ? 0.5 + 0.5 * Math.cos(2 * TAU * pose.turn) : 0;
    shadow(n.x, n.y, 3.5 * (1 - 0.2 * airborne), 1.2 * (1 - 0.2 * airborne));
    g.save();
    g.translate(n.x, n.y);
    drawHero(g, hero, pose);
    g.restore();
  }
  function dude(n, player) {
    if (player) return drawPlayer(n);
    shadow(n.x, n.y, 2.6, 1.2);
    g.save();
    g.translate(n.x, n.y);
    if (isFighter(n.kind)) {
      drawFighter(n);
    } else if (n.kind === "medic") {
      if (n.down) {
        g.drawImage(artwork.medicDown, -6.2, -10.2, 12.4, 10.6);
        g.restore();
        dazedStars(n);
        return;
      }
      const stroll = strollOf(n, medicStride), walking = stroll.walking && !(n.stagger > 0), sideways2 = stroll.row === rows.right || stroll.row === rows.left, row = sideways2 ? 0 : stroll.row;
      if (stroll.row === rows.left) g.scale(-1, 1);
      if (n.stagger > 0) g.rotate(-0.12 * Math.sin(n.stagger / 0.33 * Math.PI));
      if (walking) carry(stroll, sideways2 ? 1 : 0);
      g.drawImage(
        artwork.rescueMedic,
        (walking ? strideFrame(stroll, [1, 2, 3, 2]) : 0) * 104,
        row * 148,
        104,
        148,
        -5.2,
        -14.5,
        10.4,
        14.8
      );
    } else {
      if (n.down || n.swing > 0 || n.stagger > 0) {
        const column2 = n.down ? 3 : n.swing > 0 ? Math.min(2, Math.floor((0.37 - n.swing) / 0.37 * 3)) : 2;
        crowdPose(n, column2);
        g.restore();
        if (n.down) dazedStars(n);
        return;
      }
      const stroll = strollOf(n, civilianStride), sideways2 = stroll.row === rows.right || stroll.row === rows.left;
      if (stroll.row === rows.left) g.scale(-1, 1);
      if (stroll.walking) carry(stroll, sideways2 ? 1 : 0);
      const cycle = stroll.walking ? strideFrame(stroll, [1, 2, 3, 4]) : 0;
      g.drawImage(artwork[n.look], cycle * 92, (sideways2 ? 0 : stroll.row) * 114, 92, 114, -5.6, -13.65, 11.2, 13.8);
    }
    g.restore();
    if (n.down) dazedStars(n);
  }

  // src/ui/waypoint.js
  function drawRouteArrow(path) {
    const lead = game.ride ? 26 : 17;
    let ahead = game.ride ? 52 : 40;
    let aim = p;
    for (const node of path.slice(1)) {
      const length = dist(aim, node);
      if (length > ahead) {
        const f = ahead / length;
        aim = { x: aim.x + f * (node.x - aim.x), y: aim.y + f * (node.y - aim.y) };
        break;
      }
      ahead -= length;
      aim = node;
    }
    const angle = Math.atan2(aim.y - p.y, aim.x - p.x);
    const position = { x: p.x + Math.cos(angle) * lead, y: p.y - 3 + Math.sin(angle) * lead };
    g.save();
    g.translate(position.x, position.y);
    g.rotate(angle);
    g.beginPath();
    g.moveTo(5.3, 0);
    g.lineTo(-3.6, -3.9);
    g.lineTo(-1.8, 0);
    g.lineTo(-3.6, 3.9);
    g.closePath();
    g.lineJoin = "round";
    g.strokeStyle = "#21172b";
    g.lineWidth = 1.9;
    g.stroke();
    g.fillStyle = "#ffcf59";
    g.fill();
    g.beginPath();
    g.moveTo(-2.7, -3.1);
    g.lineTo(3.7, -0.2);
    g.strokeStyle = "#fff1bf";
    g.lineWidth = 0.7;
    g.stroke();
    g.restore();
    return position;
  }
  function arrivalMarker(point, lift2 = 0) {
    const rest = point.y - lift2 - 2;
    const y = rest + 0.6 * Math.sin(game.time * 3);
    g.save();
    g.beginPath();
    g.moveTo(point.x - 3.5, y - 3.8);
    g.lineTo(point.x, y - 2.8);
    g.lineTo(point.x + 3.5, y - 3.8);
    g.lineTo(point.x, y + 0.6);
    g.closePath();
    g.strokeStyle = "#221728";
    g.lineJoin = "round";
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = "#ffda6e";
    g.fill();
    g.restore();
    return { x: point.x, y: rest - 2.6 };
  }

  // src/game/taunts.js
  var genericLines = [
    "tauntConsole",
    "tauntPermit",
    "tauntMatches",
    "tauntCarioca",
    "tauntDoormat",
    "tauntCardigan",
    "tauntGrail"
  ];
  var skinheadLines = ["un point de d\xE9tail de l'histoire", "Janne, au secours"];
  var linesByLook = {
    mariniere: ["Je passe partout", "rendez moi les cl\xE9s"],
    bomber: skinheadLines,
    chelsea: skinheadLines
  };
  var taunt = null;
  function tauntLine({ speaker, index }) {
    const lines = game.konamiHero && linesByLook[fighterLook(speaker)] || genericLines;
    return lines[index % lines.length];
  }
  function callOut(n) {
    if (game.time < (n.nextTaunt || 0) || taunt && game.time < taunt.until + 1) return;
    const index = n.lineIndex ?? Math.floor(n.phase);
    taunt = { speaker: n, index, until: game.time + 2.4 };
    n.lineIndex = index + 1;
    n.nextTaunt = game.time + 8;
  }

  // src/game/crowd.js
  var strikeRange = 12;
  var closeRange = 10.5;
  var maxSwingers = 2;
  var hurtWindow = 0.6;
  function swingers() {
    let count = 0;
    for (const n of people) if (n.swing > 0) count++;
    return count;
  }
  function carThreat(n) {
    let worst = null;
    for (const c of cars) {
      const vx = c.slideX || 0, vy = c.slideY || 0, speed2 = vx * vx + vy * vy;
      if (speed2 < 18 * 18) continue;
      const rx = n.x - c.x, ry = n.y - c.y;
      if (Math.abs(rx) > 80 || Math.abs(ry) > 80) continue;
      const t2 = (rx * vx + ry * vy) / speed2;
      if (t2 < 0 || t2 > 0.95) continue;
      const miss = Math.hypot(rx - vx * t2, ry - vy * t2);
      if (miss < 9.5 && (!worst || t2 < worst.t)) worst = { c, t: t2, vx, vy, rx, ry };
    }
    return worst;
  }
  function walk(n, angle, pace, dt) {
    const step = pace * dt;
    const before = { x: n.x, y: n.y }, side = Math.sign(n.detour || 1);
    for (const turn of [0, 0.7 * side, -0.7 * side, 1.4 * side, -1.4 * side]) {
      const a = angle + turn;
      n.x = before.x;
      n.y = before.y;
      move(n, Math.cos(a) * step, Math.sin(a) * step, 3);
      if (Math.hypot(n.x - before.x, n.y - before.y) > step * 0.35) {
        if (turn) n.detour = turn;
        n.a = a;
        return true;
      }
    }
    n.x = before.x;
    n.y = before.y;
    n.detour = -side;
    return false;
  }
  function shout(n, key) {
    if (game.time - (n.shouted || -9) < 3) return;
    n.shouted = game.time;
    fx.push({ x: n.x, y: n.y - 14, t: 0.8, s: key });
  }
  function hurtPlayer(n) {
    if (game.time < (p.hurtUntil || 0)) return;
    p.hurtUntil = game.time + hurtWindow;
    crashSound(90, "slap");
    p.hp--;
    fx.push({ x: p.x, y: p.y - 13, t: 0.8, s: "ouch" });
    if (p.hp > 0) return;
    p.hp = 5;
    game.heat = 0;
    p.x = office.x;
    p.y = office.y;
    people.forEach((q) => {
      q.anger = 0;
      q.swing = 0;
    });
    say("concussion", 5, "clerk");
  }
  function approach(n, d, dt) {
    const toward = Math.atan2(p.y - n.y, p.x - n.x);
    let ax = Math.cos(toward), ay = Math.sin(toward);
    const waiting = d < 26 && swingers() >= maxSwingers && !(n.swing > 0);
    if (waiting) {
      const side = Math.sin(n.phase * 7) > 0 ? 1 : -1;
      const radial = d < 18 ? -0.6 : 0.2;
      ax = Math.cos(toward) * radial - Math.sin(toward) * side;
      ay = Math.sin(toward) * radial + Math.cos(toward) * side;
    }
    for (const o of people) {
      if (o === n || o.down || !isFighter(o.kind)) continue;
      const ox = n.x - o.x, oy = n.y - o.y, gap = Math.hypot(ox, oy);
      if (gap > 0 && gap < 9) {
        ax += ox / gap * (9 - gap) * 0.25;
        ay += oy / gap * (9 - gap) * 0.25;
      }
    }
    if (!waiting && d <= closeRange) return;
    walk(n, Math.atan2(ay, ax), waiting ? 30 : 51, dt);
    n.a = toward;
  }
  function patrol(n, dt) {
    if (n.rest > 0) {
      n.rest -= dt;
      if (!game.ride && dist(n, p) < 28) n.a = Math.atan2(p.y - n.y, p.x - n.x);
      return;
    }
    const horizontal = n.axis === "x", pos = horizontal ? n.x : n.y, home = horizontal ? n.homeX : n.homeY, offLine = horizontal ? n.homeY - n.y : n.homeX - n.x;
    const awayFromHome = horizontal ? Math.abs(n.x - n.homeX) : Math.abs(n.y - n.homeY);
    if (Math.abs(offLine) > 2.5 || awayFromHome > n.patrol + 6) {
      const tx = horizontal ? clampTo(n.x, n.homeX, n.patrol) : n.homeX, ty = horizontal ? n.homeY : clampTo(n.y, n.homeY, n.patrol);
      if (!walk(n, Math.atan2(ty - n.y, tx - n.x), n.pace, dt) && (n.lost = (n.lost || 0) + dt) > 4) {
        n.homeX = n.x;
        n.homeY = n.y;
        n.lost = 0;
      }
      return;
    }
    n.lost = 0;
    const end = home + n.sign * n.patrol, delta = n.sign * Math.min(n.pace * dt, Math.abs(end - pos));
    n.a = horizontal ? n.sign > 0 ? 0 : Math.PI : n.sign * quarterTurn;
    const hit = move(n, horizontal ? delta : 0, horizontal ? 0 : delta, 3);
    const now = horizontal ? n.x : n.y;
    if (hit || now === end || (end - now) * n.sign < 0) {
      n.sign *= -1;
      n.rest = 0.38 + (1 + Math.sin(n.phase + game.time)) * 0.35 + (Math.sin(n.phase * 3 + game.time * 0.7) > 0.8 ? 2.2 : 0);
    }
  }
  function clampTo(value, home, range) {
    return Math.min(home + range, Math.max(home - range, value));
  }
  function updatePerson(n, dt) {
    const beforeX = n.x, beforeY = n.y;
    n.moving = false;
    n.cool = Math.max(0, n.cool - dt);
    if (n.down > 0) {
      if (!n.knockedOut) {
        n.down = Math.max(0, n.down - dt);
        if (!n.down) n.hits = 0;
      }
      return;
    }
    if (n.stagger > 0) {
      n.stagger -= dt;
      return;
    }
    if (n.swing > 0) {
      const before = n.swing;
      n.swing = Math.max(0, n.swing - dt);
      if (before > 0.21 && n.swing <= 0.21 && !game.ride && !game.transit && dist(n, p) < 15 && strikeClear(n.x, n.y, p.x, p.y)) hurtPlayer(n);
      return;
    }
    n.anger = Math.max(0, n.anger - dt);
    const d = dist(n, p), chase = !game.transit && (n.anger > 0 || n.kind === "inspector" && game.heat > 0.25) && d < 190;
    if (game.ride && game.ride.domain !== "water" && d < 10 && Math.abs(game.ride.speed) > 40) {
      crashSound(Math.abs(game.ride.speed), "thud");
      knockDown(n, "traffic");
      game.heat = Math.min(3, game.heat + 0.42);
      return;
    }
    if (!game.ride && d < 30 && n.kind === "tough" && !n.hits && !n.insultCase && (game.active === "flat" || game.active === "repo")) {
      n.insultCase = game.active;
      say("outburst", 3.6, "bystander");
    }
    const threat = carThreat(n);
    if (threat) {
      n.noticed = (n.noticed || 0) + dt;
      if (n.noticed > 0.12 + (1 + Math.sin(n.phase)) * 0.08) {
        const side = Math.sign(threat.ry * threat.vx - threat.rx * threat.vy) || 1, speed = Math.hypot(threat.vx, threat.vy);
        n.dodge = { x: -threat.vy / speed * side, y: threat.vx / speed * side, until: game.time + 0.45 };
        if (!isFighter(n.kind) || !chase) shout(n, "eek");
      }
    } else n.noticed = 0;
    if (n.dodge && game.time < n.dodge.until) {
      walk(n, Math.atan2(n.dodge.y, n.dodge.x), 62, dt);
    } else {
      n.dodge = null;
      const horn = game.ride && held.has("horn") && dist(n, game.ride) < 55 ? { from: game.ride, until: game.time + 1.2 } : null;
      if (horn) n.startled = horn;
      const scuffle = game.scuffle;
      if (!isFighter(n.kind) && n.kind !== "medic" && scuffle && game.time < scuffle.until && dist(n, scuffle) < 48 && n !== scuffle.victim)
        Object.assign(n, { fleeing: game.time + 2.2, fleeFrom: { x: scuffle.x, y: scuffle.y } });
      if (n.startled && game.time < n.startled.until && !chase) {
        const from = n.startled.from, side = Math.sign(-(n.x - from.x) * Math.sin(from.a) + (n.y - from.y) * Math.cos(from.a)) || 1;
        walk(n, from.a + side * Math.PI / 2 + side * 0.25, 40, dt);
        shout(n, "eek");
      } else if (n.fleeing > game.time && !chase) {
        walk(n, Math.atan2(n.y - n.fleeFrom.y, n.x - n.fleeFrom.x), 46, dt);
      } else {
        n.startled = null;
        if (chase && !game.ride && d < 42) callOut(n);
        if (chase && d <= strikeRange && !game.ride && !n.cool && swingers() < maxSwingers && strikeClear(n.x, n.y, p.x, p.y)) {
          n.a = Math.atan2(p.y - n.y, p.x - n.x);
          n.cool = 1.35 + (1 + Math.sin(n.phase * 5)) * 0.2;
          n.swing = 0.37;
        } else if (chase) approach(n, d, dt);
        else patrol(n, dt);
      }
    }
    const travel = Math.hypot(n.x - beforeX, n.y - beforeY);
    n.stuck = travel > 0.01 ? 0 : (n.stuck || 0) + dt;
    if (n.stuck > 1 && footBlocked(n.x, n.y, 3)) {
      const spot = freeSpot(n.x, n.y, 3);
      if (spot) Object.assign(n, spot);
      n.stuck = 0;
    }
    n.moving = travel > 0.35 * dt;
  }

  // src/game/simulation.js
  var inspectorClock = 0;
  var radioClock = 35;
  var radioLine = 0;
  var walkPace = 24;
  var runPace = 48;
  function update(dt) {
    streamPopulation(p.x, p.y, game.vw, game.vh);
    game.time += dt;
    game.quipTime = Math.max(0, game.quipTime - dt);
    game.quipCooldown = Math.max(0, game.quipCooldown - dt);
    radioClock -= dt;
    if (radioClock <= 0 && !game.msgLife) {
      say(["fuel", "clocked", "printer", "horn"][radioLine++ % 4], 5, "clerk");
      radioClock = 47;
    }
    game.hitCooldown = Math.max(0, game.hitCooldown - dt);
    game.flash = Math.max(0, game.flash - dt);
    if (game.flash > 0 && game.flash <= 0.24 && !combo.slapLanded) {
      combo.slapLanded = true;
      landSlap();
    }
    game.heat = Math.max(0, game.heat - dt * 0.055);
    if (game.msgLife > 0 && (game.msgLife -= dt) <= 0) {
      game.msgLife = 0;
      renderMessage();
    }
    p.moving = false;
    updateTransit(dt);
    updateBoats(river2, boatFleet, dt, game.ride, throttleInput(), steeringInput(), (boat) => {
      const volume = Math.max(0, 1 - Math.hypot(boat.x - p.x, boat.y - p.y) / 240);
      if (volume) shipHornSound(volume);
    });
    if (game.transit) {
    } else if (game.ride) {
      const v = game.ride;
      if (v.domain !== "water") drive(v, dt, throttleInput(), steeringInput(), held.has("action"));
      p.x = v.x;
      p.y = v.y;
      p.a = v.a;
      if (game.active === "repo" && v === target) game.stage = "deliver";
    } else {
      const [dx, dy] = walkVector();
      if (dx || dy) {
        if (game.flash <= 0) p.a = Math.atan2(dy, dx);
        const mag = Math.max(1, Math.hypot(dx, dy)), startX = p.x, startY = p.y, pace = held.has("run") ? runPace : walkPace;
        move(p, dx / mag * pace * dt, dy / mag * pace * dt, 2.6);
        const travel = Math.hypot(p.x - startX, p.y - startY);
        p.moving = travel > 5e-3;
        p.walkDistance = (p.walkDistance || 0) + travel;
        stepSound(travel);
        if (p.moving) p.hasWalked = true;
        p.stuck = p.moving ? 0 : (p.stuck || 0) + dt;
        const overlapping = p.stuck > 0.45 && footBlocked(p.x, p.y, 2.6);
        if (overlapping || p.stuck > 0.45 && shutIn(p, 2.6)) {
          const spot = freeSpot(p.x, p.y, 2.6, overlapping ? 0 : 16);
          if (spot) Object.assign(p, spot, { stuck: 0 });
        }
      } else p.stuck = 0;
      if (held.has("action")) slap();
    }
    for (const c of cars) if (c.route) advanceTraffic(c, dt);
    towBlockers();
    for (const n of people) updatePerson(n, dt);
    updateAmbulance(dt);
    inspectorClock -= dt;
    if (game.heat > 1.3 && !game.transit && inspectorClock <= 0 && people.filter((n) => n.kind === "inspector").length < 4) {
      for (let dx of [-70, 70, 0])
        if (!blocked(p.x + dx, p.y + 28, 4)) {
          person(p.x + dx, p.y + 28, "inspector");
          break;
        }
      inspectorClock = 8;
      say("standards", 5, "dispatch");
    }
    for (let list of [fx, trails])
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].t -= dt;
        if (list[i].t <= 0) list.splice(i, 1);
      }
  }
  function towBlockers() {
    for (const c of cars) {
      const v = c.route?.stalledBy;
      if (!v || v.route || v === game.ride || v === target || v.medical || c.route.stalledFor < 10) continue;
      if (Math.hypot(v.x - p.x, v.y - p.y) < 30 || !cars.includes(v)) continue;
      if (v === sedan) {
        if (Math.hypot(sedan.x - sedan.home.x, sedan.y - sedan.home.y) < 4) continue;
        const home = { ...sedan.home, halfLength: sedan.halfLength, halfWidth: sedan.halfWidth };
        if (vehicleBlocked(home) || cars.some((o) => o !== sedan && carContact(home, o))) continue;
        if ([p, ...people].some((n) => distanceToBody(home, n.x, n.y) < 3)) continue;
        fx.push({ x: v.x, y: v.y - 10, t: 1.2, s: "towing" });
        Object.assign(sedan, sedan.home, { speed: 0, slideX: 0, slideY: 0 });
        say("towed", 5, "clerk");
      } else {
        fx.push({ x: v.x, y: v.y - 10, t: 1.2, s: "towing" });
        cars.splice(cars.indexOf(v), 1);
      }
      c.route.heldBy = c.route.stalledBy = null;
      c.route.stalledFor = 0;
    }
  }
  function stepSound(travel) {
    const before = Math.floor(p.stepPhase || 0);
    p.stepPhase = (p.stepPhase || 0) + travel / strides[held.has("run") ? "run" : "walk"];
    const beat = Math.floor(p.stepPhase);
    if (beat !== before) footfall(beat);
  }

  // src/scenes/interiors.js
  var interior = null;
  function enterInterior(id) {
    const room = town.rooms.get(id);
    if (!room || game.ride || interior) return;
    interior = { room, returnTo: { x: p.x, y: p.y, a: p.a } };
    Object.assign(p, room.entry, { a: -Math.PI / 2, moving: false });
    held.clear();
    game.flash = 0;
  }
  function leaveInterior() {
    if (!interior) return;
    Object.assign(p, interior.returnTo, { moving: false });
    interior = null;
    held.clear();
    game.camX = p.x;
    game.camY = p.y;
  }
  function indoorAction() {
    if (!interior) return null;
    const room = interior.room;
    if (dist(p, room.exit) < 11) return "leaveRoom";
    if (dist(p, room.desk) < 15) return room.action;
    return null;
  }
  function updateInterior(dt) {
    const [dx, dy] = walkVector();
    const x = p.x, y = p.y, mag = Math.hypot(dx, dy), floor = interior.room.floor;
    if (mag) {
      const step = dt * (held.has("run") ? 48 : 24) / Math.max(1, mag);
      p.a = Math.atan2(dy, dx);
      p.x = clamp(x + dx * step, floor.left, floor.right);
      p.y = clamp(y + dy * step, floor.top, floor.bottom);
    }
    const travelled = Math.hypot(p.x - x, p.y - y), last = p.walkDistance || 0;
    p.moving = travelled > 5e-3;
    p.walkDistance = last + travelled;
    stepSound(travelled);
  }
  function drawInterior(anchor) {
    const { room } = interior, scale = Math.min(game.vw / room.width, game.vh / room.height);
    const left2 = (game.vw - room.width * scale) / 2, top2 = (game.vh - room.height * scale) / 2;
    rect(g, 0, 0, game.vw, game.vh, "#171420");
    g.save();
    g.translate(left2, top2);
    g.scale(scale, scale);
    g.drawImage(artwork[room.image], 0, 0, room.width, room.height);
    dude(p, true);
    if (anchor) arrivalMarker(anchor);
    g.restore();
    hud("#district", t(room.door) + " / Port-Fer");
    hud("#hint", t(indoorAction() || "officeFloor"));
    $("#reportBtn").hidden = true;
  }

  // src/platform/keys.js
  var keys = {
    arrowup: "up",
    w: "up",
    z: "up",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
    q: "left",
    arrowright: "right",
    d: "right",
    " ": "action",
    f: "car",
    h: "horn",
    e: "job",
    r: "report",
    m: "map",
    v: "quip",
    shift: "run"
  };
  var konami = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  function gameKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || typeof e.key !== "string") return void 0;
    return e.key.toLowerCase();
  }
  function control(e) {
    return keys[gameKey(e)];
  }
  function released(e) {
    return typeof e.key === "string" ? keys[e.key.toLowerCase()] : void 0;
  }
  function trackKonami(e, matched) {
    const key = gameKey(e);
    if (!key || e.repeat) return matched;
    if (key === konami[matched]) return matched + 1 === konami.length ? -1 : matched + 1;
    return key === konami[0] ? matched === 2 ? 2 : 1 : 0;
  }

  // src/platform/gamepad.js
  var buttons = [
    [0, "job"],
    [1, "back"],
    [2, "action"],
    [3, "car"],
    [4, "run"],
    [5, "horn"],
    [8, "map"],
    [9, "help"],
    [11, "report"],
    [12, "up"],
    [13, "down"],
    [14, "left"],
    [15, "right"]
  ];
  var stickDeadZone = 0.22;
  var triggerDeadZone = 0.08;
  function withDeadZone(value, deadZone) {
    return Math.min(1, Math.max(0, (value - deadZone) / (1 - deadZone)));
  }
  function findGamepad(index) {
    try {
      const pads = navigator.getGamepads?.();
      const supported = (pad) => pad?.connected && pad.mapping === "standard";
      return (supported(pads?.[index]) ? pads[index] : pads?.find(supported)) ?? null;
    } catch {
      return null;
    }
  }
  function readGamepad(pad) {
    const controls = /* @__PURE__ */ new Set();
    for (const [index, control2] of buttons) if (pad.buttons[index]?.pressed) controls.add(control2);
    const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
    const length = Math.hypot(x, y);
    const speed = withDeadZone(length, stickDeadZone);
    const scale = length ? speed / length : 0;
    const steering = Math.sign(x) * withDeadZone(Math.abs(x), stickDeadZone);
    const reverse = withDeadZone(pad.buttons[6]?.value ?? 0, triggerDeadZone);
    const accelerate = withDeadZone(pad.buttons[7]?.value ?? 0, triggerDeadZone);
    const padX = Number(controls.has("right")) - Number(controls.has("left"));
    const padY = Number(controls.has("down")) - Number(controls.has("up"));
    const menuX = padX || padY ? padX : x;
    const menuY = padX || padY ? padY : y;
    const direction = Math.abs(menuX) >= Math.abs(menuY) ? menuX : menuY;
    const scroll = pad.axes[3] ?? 0;
    return {
      controls,
      x: x * scale,
      y: y * scale,
      steering,
      throttle: accelerate - reverse,
      stickActive: speed > 0,
      triggersActive: accelerate > 0 || reverse > 0,
      menuStep: Math.abs(direction) >= 0.55 ? Math.sign(direction) : 0,
      menuScroll: Math.sign(scroll) * withDeadZone(Math.abs(scroll), stickDeadZone)
    };
  }

  // src/game/cases.js
  var files = ["repo", "noise", "flat"];
  function nextFile() {
    return files.find((id) => !done.has(id));
  }
  var locations = {
    office: ["Bailiff\u2019s office", "\xC9tude"],
    repo: ["Cr\xE9dit Sec", "Cr\xE9dit Sec"],
    noise: ["Le Boum", "Le Boum"],
    flat: ["R\xE9sidence Mireille", "R\xE9sidence Mireille"],
    auction: ["Auction hall", "H\xF4tel des ventes"],
    target: ["Moutarde GT", "Moutarde GT"]
  };
  var placeName = (id) => locations[id][lang === "fr" ? 1 : 0];
  function goal() {
    if (!game.active) {
      return town.byId.get(nextFile()) || null;
    }
    if (game.active === "repo") return game.ride === target ? auction : target;
    if (game.stage === "deliver") return auction;
    return jobs.find((j) => j.id === game.active);
  }
  function objective() {
    if (game.active === "repo") return game.ride === target ? "returnCar" : "findCar";
    if (game.active === "flat") return game.stage === "deliver" ? "returnLot" : "tagLot";
    return game.active === "noise" ? "record" : "free";
  }
  function accept(id) {
    game.active = id;
    game.stage = "visit";
    say(objective(), 4, "dispatch");
    beep(550);
  }
  function complete(fee, line2) {
    done.add(game.active);
    game.active = "";
    game.stage = "";
    game.wallet += fee;
    beep(780, 0.22);
    game.quipTime = 2.4;
    say(line2, 6, "clerk", "  +\u20AC" + fee);
  }
  function officeDesk() {
    const choices = files.filter((id) => !done.has(id) && !game.active).map((id) => [id, () => offer(id)]);
    if (incidents.length)
      choices.push([
        "lastIncident",
        () => {
          const note = incidents[incidents.length - 1];
          box(note.title, note.copy, [["back"]]);
        }
      ]);
    if (game.active)
      choices.push([
        "drop",
        () => {
          game.active = "";
          game.stage = "";
          say("dropped");
        }
      ]);
    box(
      "office",
      game.active ? "officeBusy" : done.size === 3 ? "officeDone" : done.size ? "officeRemaining" : "officeNew",
      [...choices, ...!interior && !game.ride ? [["goInside", () => enterInterior("office")]] : [], ["back"]]
    );
  }
  function interact() {
    if (interior) {
      const action = indoorAction();
      if (action === "leaveRoom") leaveInterior();
      else if (action === "caseDesk") officeDesk();
      return;
    }
    if (panel.open || game.viewMap) return;
    const wreck = recoveryCar();
    if (wreck) {
      repairCar(wreck);
      return;
    }
    const near = jobs.find((j) => dist(j, p) < 36);
    if (game.active === "repo" && game.ride === target && near === auction) {
      if (exitCar()) complete(190, "soldCar");
      return;
    }
    if (game.active === "flat" && game.stage === "deliver" && near === auction) {
      complete(145, "soldLot");
      return;
    }
    if (game.active === "noise" && near?.id === "noise" && !game.ride) {
      box("pv", "pvDraft", [["sign", () => complete(125, "signed")], ["pocket"]]);
      return;
    }
    if (game.active === "flat" && game.stage === "visit" && near?.id === "flat" && !game.ride) {
      box("resident", "residentText", [
        [
          "tag",
          () => {
            game.stage = "deliver";
            say("tagged");
          }
        ],
        ["outside"]
      ]);
      return;
    }
    if (near?.id === "office") {
      officeDesk();
      return;
    }
    if (near && files.includes(near.id) && !game.active && !done.has(near.id)) {
      offer(near.id);
      return;
    }
    say(game.active ? objective() : "pins", 4, "clerk");
  }
  function offer(id) {
    box(id, id + "Brief", [["take", () => accept(id)], ["leave"]]);
  }

  // src/world/streets.js
  var plateScale = 5;
  var plates = {};
  var joins = /* @__PURE__ */ new Map();
  var roadPaint;
  function paintCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.round(w * plateScale);
    c.height = Math.round(h * plateScale);
    return c;
  }
  function registerPlate(image, xs, ys, xt, yt) {
    const c = paintCanvas(xt.at(-1), yt.at(-1)), ctx = c.getContext("2d", { willReadFrequently: true });
    for (let j = 0; j < ys.length - 1; j++)
      for (let i = 0; i < xs.length - 1; i++) {
        const [x, x2] = xt.slice(i, i + 2).map((n) => Math.round(n * plateScale));
        const [y, y2] = yt.slice(j, j + 2).map((n) => Math.round(n * plateScale));
        ctx.drawImage(image, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j], x, y, x2 - x, y2 - y);
      }
    return c;
  }
  function paintPattern(image, x, y, w, h, scale, shade) {
    const tile = document.createElement("canvas");
    tile.width = w;
    tile.height = h;
    const ctx = tile.getContext("2d");
    ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
    if (shade) rect(ctx, 0, 0, w, h, shade);
    const pattern = g.createPattern(tile, "repeat");
    pattern.setTransform(new DOMMatrix().scale(scale));
    return pattern;
  }
  function clearMarkings(plate, across, mark, reach2, exclude) {
    const ctx = plate.getContext("2d"), w = plate.width, h = plate.height;
    const band = Math.round(reach2 * plateScale), mid = Math.round(mark * plateScale);
    const span = across ? w : h;
    const x = across ? 0 : mid - band, y = across ? mid - band : 0;
    const bw = across ? w : band * 2 + 1, bh = across ? band * 2 + 1 : h;
    const slice = ctx.getImageData(x, y, bw, bh), pixels = slice.data;
    const index = (u, v) => (across ? v * bw + u : u * bw + v) * 4;
    for (let u = 0; u < span; u++) {
      if (Math.abs(u - span / 2) < exclude * plateScale) continue;
      const a = index(u, 0), b = index(u, band * 2);
      for (let v = 1; v < band * 2; v++) {
        const d = index(u, v), weight = 1 - Math.abs(v - band) / band;
        const paint2 = Math.min(1, Math.max(0, (pixels[d + 1] - 69) / 27));
        for (let k = 0; k < 3; k++) {
          const asphaltPx = pixels[a + k] + (pixels[b + k] - pixels[a + k]) * v / (band * 2);
          pixels[d + k] += (asphaltPx - pixels[d + k]) * paint2 * Math.min(1, weight * 3);
        }
      }
    }
    ctx.putImageData(slice, x, y);
  }
  function getJoin(key, a, b, across, start, length, r, bStart = 0) {
    if (joins.has(key)) return joins.get(key);
    const sw = across ? r : length, sh = across ? length : r;
    const joined = paintCanvas(across ? sw * 2 : sw, across ? sh : sh * 2), ctx = joined.getContext("2d");
    const other = paintCanvas(across ? sw * 2 : sw, across ? sh : sh * 2), overlay = other.getContext("2d");
    const w = joined.width, h = joined.height, half = (across ? w : h) / 2, s = Math.round(start * plateScale);
    const startB = Math.round(bStart * plateScale);
    function copy(c, img, second) {
      const source = second ? startB : (across ? img.width : img.height) - half;
      const args = across ? [source, s, half, h] : [s, source, w, half];
      const dx = across && second ? half : 0, dy = !across && second ? half : 0;
      c.drawImage(img, ...args, dx, dy, across ? half : w, across ? h : half);
      c.save();
      if (across) {
        c.translate(w, 0);
        c.scale(-1, 1);
      } else {
        c.translate(0, h);
        c.scale(1, -1);
      }
      c.drawImage(img, ...args, dx, dy, across ? half : w, across ? h : half);
      c.restore();
    }
    copy(ctx, a, false);
    copy(overlay, b, true);
    const mask = overlay.createLinearGradient(0, 0, across ? w : 0, across ? 0 : h);
    for (const [at2, alpha] of [
      [0, 0],
      [0.18, 0.07],
      [0.5, 0.5],
      [0.82, 0.93],
      [1, 1]
    ])
      mask.addColorStop(at2, "rgba(0,0,0," + alpha + ")");
    overlay.globalCompositeOperation = "destination-in";
    rect(overlay, 0, 0, w, h, mask);
    ctx.drawImage(other, 0, 0);
    joins.set(key, joined);
    return joined;
  }
  function markLane(ctx, x, y, vertical, start, end, spacing, size, double = false) {
    for (let d = start; d + size <= end + 0.01; d += spacing) {
      const salt = Math.sin((x + y + d) * 58.97);
      if (vertical) {
        if (double) {
          rect(ctx, x - 1, y + d, 0.55, size, roadPaint);
          rect(ctx, x + 0.45, y + d, 0.55, size, roadPaint);
        } else {
          rect(ctx, x - 0.4, y + d, 0.8, size, roadPaint);
          rect(ctx, x - 0.37, y + d + (salt + 1) * size * 0.36, 0.76, 0.45, "#34283c90");
        }
      } else {
        if (double) {
          rect(ctx, x + d, y - 1.05, size, 0.58, roadPaint);
          rect(ctx, x + d, y + 0.47, size, 0.58, roadPaint);
        } else {
          rect(ctx, x + d, y - 0.44, size, 0.88, roadPaint);
          rect(ctx, x + d + (salt + 1) * size * 0.34, y - 0.44, 0.58, 0.86, "#38283790");
        }
      }
    }
  }
  function prepareTown() {
    for (const [key, [xx, yy]] of Object.entries(plateRegistration)) {
      if (!artwork[key]) continue;
      const xs = [0, ...xx, 1500], ys = [0, ...yy, 1e3];
      const xt = [0, CELL_W / 2 - kerbX2, CELL_W / 2, CELL_W / 2 + kerbX2, CELL_W];
      const yt = [0, CELL_H / 2 - kerbY2, CELL_H / 2, CELL_H / 2 + kerbY2, CELL_H];
      const plate = registerPlate(artwork[key], xs, ys, xt, yt);
      clearMarkings(plate, true, CELL_H / 2, 2.4, 41);
      clearMarkings(plate, false, CELL_W / 2, 2.45, 35);
      plates[key] = plate;
    }
    for (const key of [...Object.keys(paintings), "alleyStripV", "alleyStripH", "towerIron"])
      if (!plates[key] && artwork[key]) plates[key] = artwork[key];
    roadPaint = paintPattern(artwork.market, 32, 498, 39, 4, 0.2, "#80627362");
  }
  function cellPlateKey(col, row) {
    const kind = town.cellKinds?.[row]?.[col];
    return kind && plates[kind] ? kind : town.blocks[row][col];
  }
  function cellArms(col, row) {
    const meta = town.cellMeta(col, row), arms = {};
    for (const dir of "nesw") arms[dir] = meta.allArms[dir] === "alley" ? "alley" : meta.wideArms[dir] ? "wide" : null;
    return arms;
  }
  function blit(ctx, plate, left2, top2, w, h, dx, dy, dw = w, dh = h) {
    ctx.drawImage(
      plate,
      (left2 + CELL_W / 2) * plateScale,
      (top2 + CELL_H / 2) * plateScale,
      w * plateScale,
      h * plateScale,
      dx,
      dy,
      dw,
      dh
    );
  }
  var scrap = document.createElement("canvas");
  var scrapContext = scrap.getContext("2d");
  function blitSoft(ctx, plate, left2, top2, w, h, dx, dy, edges, soft = 5) {
    const pw = Math.round(w * plateScale), ph = Math.round(h * plateScale), f = soft * plateScale;
    scrap.width = pw;
    scrap.height = ph;
    scrapContext.drawImage(plate, (left2 + CELL_W / 2) * plateScale, (top2 + CELL_H / 2) * plateScale, pw, ph, 0, 0, pw, ph);
    scrapContext.globalCompositeOperation = "destination-in";
    for (const edge of edges) {
      const across = edge === "l" || edge === "r", far = edge === "r" || edge === "b";
      const size = across ? pw : ph;
      const fade = scrapContext.createLinearGradient(0, 0, across ? pw : 0, across ? 0 : ph);
      fade.addColorStop(far ? 1 - f / size : 0, far ? "#000" : "#0000");
      fade.addColorStop(far ? 1 : f / size, far ? "#0000" : "#000");
      scrapContext.fillStyle = fade;
      scrapContext.fillRect(0, 0, pw, ph);
    }
    scrapContext.globalCompositeOperation = "source-over";
    ctx.drawImage(scrap, dx, dy, w, h);
  }
  var capHalf = 25.6;
  function drawArmCaps(ctx, col, row) {
    const key = cellPlateKey(col, row), painting = paintings[key];
    if (!painting?.arms) return;
    const plate = plates[key], cx = X(col), cy = Y(row), arms = cellArms(col, row);
    const shows = (dir) => painting.arms.includes(dir);
    const slice = (col + row) % 2 ? 74 : -74;
    if (!arms.n && shows("n") && row !== town.riverSouthRow)
      blitSoft(ctx, plate, 74 - capHalf - 3, -CELL_H / 2, 2 * capHalf + 6, CELL_H / 2 - 16.3, cx - capHalf - 3, cy - CELL_H / 2, "lr");
    if (!arms.s && shows("s"))
      blitSoft(ctx, plate, slice - capHalf - 3, 16.3, 2 * capHalf + 6, CELL_H / 2 - 16.3, cx - capHalf - 3, cy + 16.3, "lr");
    const from = painting.capFrom ?? 46, depth = CELL_H / 2 - from;
    if (!arms.e && shows("e"))
      blitSoft(ctx, plate, 17.1, from, CELL_W / 2 - 17.1, depth, cx + 17.1, cy + 26 - depth, arms.n || arms.s ? "tb" : "tbl");
    if (!arms.w && shows("w"))
      blitSoft(ctx, plate, -CELL_W / 2, from, CELL_W / 2 - 17.1, depth, cx - CELL_W / 2, cy + 26 - depth, arms.n || arms.s ? "tb" : "tbr");
  }
  var stripV = { width: 43.2, lane: 21.72 };
  var stripH = { height: 47.2, lane: 23.42 };
  function alleyV(ctx, x, y0, y1, fit = 1) {
    if (y1 <= y0) return;
    const top2 = Y(town.cellAt(x, (y0 + y1) / 2).row) - CELL_H / 2;
    ctx.drawImage(
      plates.alleyStripV,
      0,
      (y0 - top2) * plateScale,
      stripV.width * plateScale,
      (y1 - y0) * plateScale,
      x - stripV.lane * fit,
      y0,
      stripV.width * fit,
      y1 - y0 + 0.03
    );
  }
  function alleyH(ctx, y, x0, x1, fit = 1) {
    if (x1 <= x0) return;
    const left2 = X(town.cellAt((x0 + x1) / 2, y).col) - CELL_W / 2;
    ctx.drawImage(
      plates.alleyStripH,
      (x0 - left2) * plateScale,
      0,
      (x1 - x0) * plateScale,
      stripH.height * plateScale,
      x0,
      y - stripH.lane * fit,
      x1 - x0 + 0.03,
      stripH.height * fit
    );
  }
  var corridorV = 1.16;
  var corridorH = 1.13;
  function drawAlleyArms(ctx, col, row) {
    const painting = paintings[cellPlateKey(col, row)];
    if (!painting?.arms) return;
    const arms = cellArms(col, row), cx = X(col), cy = Y(row);
    const lane = (dir) => arms[dir] === "alley" && !painting.alleys?.includes(dir);
    const forecourt = painting.forecourt?.w ?? 25;
    if (lane("n")) alleyV(ctx, cx, cy - CELL_H / 2, cy - 28, corridorV);
    if (lane("s")) alleyV(ctx, cx, cy + 23, cy + CELL_H / 2, corridorV);
    if (lane("w")) alleyH(ctx, cy, cx - CELL_W / 2, cx - forecourt, corridorH);
    if (lane("e")) alleyH(ctx, cy, cx + 25, cx + CELL_W / 2, corridorH);
  }
  function drawSeams(ctx, firstCol, lastCol, firstRow, lastRow, visible) {
    const land = (row) => row >= 0 && row < town.rows && row !== town.riverRow;
    for (let row = Math.max(0, firstRow); row <= lastRow; row++) {
      if (!land(row)) continue;
      const cy = Y(row);
      const top2 = row === town.riverSouthRow ? -16 : -CELL_H / 2, bottom = row === canalRow ? 18 : CELL_H / 2;
      for (let col = Math.max(1, firstCol); col <= lastCol; col++) {
        const x = X(col) - CELL_W / 2;
        if (!visible(x - 24, cy - CELL_H / 2, 48, CELL_H)) continue;
        const crossed = cellArms(col - 1, row).e || cellArms(col, row).w;
        if (crossed) {
          alleyV(ctx, x, cy + top2, cy - 28);
          alleyV(ctx, x, cy + 23, cy + bottom);
        } else alleyV(ctx, x, cy + top2, cy + bottom);
      }
    }
    for (let row = Math.max(1, firstRow); row <= lastRow; row++) {
      if (!land(row) || !land(row - 1)) continue;
      const y = Y(row) - CELL_H / 2;
      for (let col = Math.max(0, firstCol); col <= lastCol; col++) {
        const cx = X(col);
        if (!visible(cx - CELL_W / 2, y - 26, CELL_W, 52)) continue;
        const crossed = cellArms(col, row - 1).s || cellArms(col, row).n;
        if (crossed) {
          alleyH(ctx, y, cx - CELL_W / 2, cx - 25);
          alleyH(ctx, y, cx + 25, cx + CELL_W / 2);
        } else alleyH(ctx, y, cx - CELL_W / 2, cx + CELL_W / 2);
      }
      for (let col = Math.max(1, firstCol); col <= lastCol; col++) {
        const x = X(col) - CELL_W / 2;
        if (visible(x - 24, y - 26, 48, 52))
          blit(ctx, plates.alleyCross, -stripV.lane, -stripH.lane, stripV.width, stripH.height, x - stripV.lane, y - stripH.lane);
      }
    }
  }
  function drawRoadJoins(ctx, firstCol, lastCol, firstRow, lastRow, visible) {
    for (let row = Math.max(0, firstRow); row <= lastRow; row++) {
      if (row === town.riverRow) continue;
      for (let col = Math.max(1, firstCol); col <= lastCol; col++) {
        const x = X(col) - CELL_W / 2, y = Y(row);
        if (!visible(x - 14, y - 30, 28, 58)) continue;
        if (cellArms(col - 1, row).e !== "wide" || cellArms(col, row).w !== "wide") continue;
        const l = cellPlateKey(col - 1, row), r = cellPlateKey(col, row);
        const top2 = row === town.riverSouthRow ? 16 : 29, bottom = row === canalRow ? 17 : 27;
        const road = getJoin("road:" + l + r + top2 + bottom, plates[l], plates[r], true, CELL_H / 2 - top2, top2 + bottom, 14);
        ctx.drawImage(road, x - 14, y - top2, 28, top2 + bottom);
      }
    }
    for (let row = Math.max(1, firstRow); row <= lastRow; row++) {
      if (row === town.riverRow || row - 1 === town.riverRow) continue;
      for (let col = Math.max(0, firstCol); col <= lastCol; col++) {
        const x = X(col), y = Y(row) - CELL_H / 2;
        if (!visible(x - 27, y - 12, 54, 24)) continue;
        if (cellArms(col, row - 1).s !== "wide" || cellArms(col, row).n !== "wide") continue;
        const n = cellPlateKey(col, row - 1), s = cellPlateKey(col, row);
        const road = getJoin("cross:" + n + s, plates[n], plates[s], false, CELL_W / 2 - 26.5, 53, 12);
        ctx.drawImage(road, x - 26.5, y - 12, 53, 24);
      }
    }
  }
  function trace2(ctx, polygon, dx = 0, dy = 0) {
    ctx.moveTo(polygon[0][0] + dx, polygon[0][1] + dy);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0] + dx, polygon[i][1] + dy);
    ctx.closePath();
  }
  function drawRiver(ctx, firstCol, lastCol, visible) {
    const top2 = Y(town.riverRow) + riverPlate.top;
    for (let col = Math.max(0, firstCol); col <= lastCol; col++) {
      const left2 = X(col) - CELL_W / 2;
      if (!visible(left2, top2, CELL_W, riverPlate.height)) continue;
      ctx.drawImage(plates[cellPlateKey(col, town.riverRow)], left2, top2, CELL_W + 0.03, riverPlate.height + 0.03);
      const south = cellPlateKey(col, town.riverSouthRow), gardens = paintings[south]?.gardens;
      if (gardens) {
        const cx = X(col), cy = Y(town.riverSouthRow);
        ctx.save();
        ctx.beginPath();
        for (const garden of gardens) trace2(ctx, garden, cx, cy);
        ctx.clip();
        ctx.drawImage(plates[south], left2, cy - CELL_H / 2, CELL_W, CELL_H);
        ctx.restore();
      }
    }
  }
  function drawLaneMarks(ctx, visible) {
    for (const edge of town.roads.edges) {
      if (edge.class === "alley") continue;
      const na = town.roadNodeById.get(edge.a), nb = town.roadNodeById.get(edge.b);
      const horiz = Math.abs(na.y - nb.y) < 1;
      const dbl = edge.class === "avenue";
      if (horiz) {
        const leftN = na.x < nb.x ? na : nb, rightN = na.x < nb.x ? nb : na;
        const startOff = leftN.kind === "roundabout" ? leftN.outerRadius + 10 : 48;
        const endOff = rightN.kind === "roundabout" ? rightN.outerRadius + 10 : 48;
        const span = rightN.x - leftN.x;
        if (span > startOff + endOff && visible(leftN.x + startOff, leftN.y - 2, span - startOff - endOff, 4))
          markLane(ctx, leftN.x, leftN.y, false, startOff, span - endOff, 19, 10, dbl);
      } else {
        const topN = na.y < nb.y ? na : nb, botN = na.y < nb.y ? nb : na;
        const startOff = topN.kind === "roundabout" ? topN.outerRadius + 10 : 36;
        const endOff = botN.kind === "roundabout" ? botN.outerRadius + 10 : 36;
        const span = botN.y - topN.y;
        if (span > startOff + endOff && visible(topN.x - 2, topN.y + startOff, 4, span - startOff - endOff))
          markLane(ctx, topN.x, topN.y, true, startOff, span - endOff, 19, 10, dbl);
      }
    }
  }
  function drawTown(ox, oy, ctx, width2, height2) {
    const { firstCol, lastCol, firstRow, lastRow } = town.visibleCells(ox, oy, width2, height2, CELL_W / 2);
    const endX = ox + width2 + 1, endY = oy + height2 + 1;
    const visible = (x, y, w, h) => x + w >= ox && x <= endX && y + h >= oy && y <= endY;
    const cells = [];
    for (let row = Math.max(0, firstRow); row <= lastRow; row++) {
      if (row === town.riverRow) continue;
      for (let col = Math.max(0, firstCol); col <= lastCol; col++)
        if (visible(X(col) - CELL_W / 2, Y(row) - CELL_H / 2, CELL_W, CELL_H)) cells.push([col, row]);
    }
    for (const [col, row] of cells)
      ctx.drawImage(plates[cellPlateKey(col, row)], X(col) - CELL_W / 2, Y(row) - CELL_H / 2, CELL_W + 0.03, CELL_H + 0.03);
    for (const [col, row] of cells) drawArmCaps(ctx, col, row);
    drawRoadJoins(ctx, firstCol, lastCol, firstRow, lastRow, visible);
    for (const [col, row] of cells) drawAlleyArms(ctx, col, row);
    drawSeams(ctx, firstCol, lastCol, firstRow, lastRow, visible);
    if (lastRow >= canalRow && firstRow <= town.riverSouthRow) drawRiver(ctx, firstCol, lastCol, visible);
    drawLaneMarks(ctx, visible);
  }
  function drawOverheadMonuments(ctx, ox, oy) {
    const area = town.visibleCells(ox, oy, game.vw, game.vh, CELL_W / 2);
    for (let row = area.firstRow; row <= area.lastRow; row++)
      for (let col = area.firstCol; col <= area.lastCol; col++) {
        if (cellPlateKey(col, row) !== "towerBase") continue;
        const iron = plates.towerIron;
        ctx.drawImage(iron, X(col) - CELL_W / 2, Y(row) - CELL_H / 2, CELL_W, iron.height / plateScale);
      }
  }
  var propSprites = /* @__PURE__ */ new WeakMap();
  function drawStreetProp({ x, y, item }) {
    let sprite = propSprites.get(item);
    if (!sprite) {
      const xs = item.outline.map((p2) => p2[0]), ys = item.outline.map((p2) => p2[1]);
      const left2 = Math.floor(Math.min(...xs) * plateScale) / plateScale, top2 = Math.floor(Math.min(...ys) * plateScale) / plateScale;
      const w = Math.ceil((Math.max(...xs) - left2 + 0.2) * plateScale), h = Math.ceil((Math.max(item.y, ...ys) - top2) * plateScale);
      const image = document.createElement("canvas");
      image.width = w;
      image.height = h;
      const ctx = image.getContext("2d");
      ctx.setTransform(plateScale, 0, 0, plateScale, -left2 * plateScale, -top2 * plateScale);
      ctx.beginPath();
      for (const [px, py] of item.outline) ctx.lineTo(px, py);
      ctx.closePath();
      ctx.clip();
      const plate = plates[item.key], plateTop = paintings[item.key]?.river ? riverPlate.top : -CELL_H / 2;
      ctx.drawImage(plate, -CELL_W / 2, plateTop, plate.width / plateScale, plate.height / plateScale);
      sprite = { image, dx: left2 - item.x, dy: top2 - item.y };
      propSprites.set(item, sprite);
    }
    g.drawImage(
      sprite.image,
      x + sprite.dx,
      y + sprite.dy,
      sprite.image.width / plateScale,
      sprite.image.height / plateScale
    );
  }
  var propReach = 60;
  function visibleStreetProps(ox, oy) {
    const area = town.visibleCells(ox, oy, game.vw, game.vh + propReach);
    const result = [];
    for (let row = area.firstRow; row <= area.lastRow; row++)
      for (let col = area.firstCol; col <= area.lastCol; col++)
        for (const prop of streetProps(town, col, row)) {
          const item = prop.item;
          item.rise ??= item.y - Math.min(...item.outline.map((point) => point[1]));
          item.half ??= Math.max(...item.outline.map((point) => Math.abs(point[0] - item.x)));
          if (prop.x + item.half >= ox && prop.x - item.half <= ox + game.vw && prop.y >= oy && prop.y - item.rise <= oy + game.vh)
            result.push(prop);
        }
    return result;
  }
  var streets = document.createElement("canvas");
  var streetContext = streets.getContext("2d", { alpha: false });
  var cachedX = Infinity;
  var cachedY = Infinity;
  var groundScale = 0;
  function streetLayer(ox, oy) {
    const scale = canvas.width / game.vw, margin = 30, width2 = game.vw + 2 * margin, height2 = game.vh + 2 * margin;
    if (groundScale !== scale || ox < cachedX || oy < cachedY || ox + game.vw > cachedX + streets.width / scale || oy + game.vh > cachedY + streets.height / scale) {
      groundScale = scale;
      cachedX = ox - margin;
      cachedY = oy - margin;
      const w = Math.ceil(width2 * scale), h = Math.ceil(height2 * scale);
      if (streets.width !== w || streets.height !== h) {
        streets.width = w;
        streets.height = h;
      }
      streetContext.setTransform(scale, 0, 0, scale, -cachedX * scale, -cachedY * scale);
      rect(streetContext, cachedX, cachedY, width2, height2, "#201c29");
      drawTown(cachedX, cachedY, streetContext, width2, height2);
      overFresh = false;
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(streets, Math.round((cachedX - ox) * scale), Math.round((cachedY - oy) * scale));
    g.restore();
  }
  var over = document.createElement("canvas");
  var overContext = over.getContext("2d");
  var masks = document.createElement("canvas");
  var maskContext = masks.getContext("2d");
  var overFresh = false;
  var overEmpty = true;
  function buildOver() {
    overFresh = true;
    const scale = groundScale, width2 = streets.width / scale, height2 = streets.height / scale;
    const row = town.riverRow, top2 = Y(row) + riverPlate.top;
    overEmpty = row == null || cachedY + height2 < top2 || cachedY > top2 + riverPlate.height;
    if (overEmpty) return;
    for (const c of [over, masks])
      if (c.width !== streets.width || c.height !== streets.height) {
        c.width = streets.width;
        c.height = streets.height;
      }
    maskContext.setTransform(1, 0, 0, 1, 0, 0);
    maskContext.clearRect(0, 0, masks.width, masks.height);
    maskContext.setTransform(scale, 0, 0, scale, -cachedX * scale, -cachedY * scale);
    const { firstCol, lastCol } = town.visibleCells(cachedX, cachedY, width2, height2, CELL_W / 2);
    for (let col = Math.max(0, firstCol); col <= Math.min(town.cols - 1, lastCol); col++) {
      const mask = artwork[cellPlateKey(col, row) + "Over"];
      if (mask) maskContext.drawImage(mask, X(col) - CELL_W / 2, top2, CELL_W, riverPlate.height);
      const gardens = paintings[cellPlateKey(col, town.riverSouthRow)]?.gardens;
      if (gardens) {
        maskContext.beginPath();
        for (const garden of gardens) trace2(maskContext, garden, X(col), Y(town.riverSouthRow));
        maskContext.fill();
      }
    }
    overContext.globalCompositeOperation = "copy";
    overContext.drawImage(streets, 0, 0);
    overContext.globalCompositeOperation = "destination-in";
    overContext.drawImage(masks, 0, 0);
  }
  function drawBridgeDecks(ox, oy) {
    if (!overFresh) buildOver();
    if (overEmpty) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(over, Math.round((cachedX - ox) * groundScale), Math.round((cachedY - oy) * groundScale));
    g.restore();
  }

  // src/world/navigation.js
  var routeCache;
  function directions(origin = p) {
    const end = goal();
    if (!end) return null;
    const onFoot = !game.ride;
    const vehicleHalfWidth = game.ride?.halfWidth ?? sedanHalfWidth;
    if (routeCache && routeCache.vehicle === game.ride && routeCache.end === end && routeCache.vehicleHalfWidth === vehicleHalfWidth && dist(routeCache.start, origin) < 3 && dist(routeCache.lastEnd, end) < 2)
      return routeCache;
    const start = { x: origin.x, y: origin.y }, finish = { x: end.x, y: end.y };
    const path = findRoute(town, start, finish, { onFoot, vehicleHalfWidth, isBlocked: blocked });
    routeCache = { start, end, vehicle: game.ride, vehicleHalfWidth, lastEnd: finish, path };
    return routeCache;
  }

  // src/art/fleet-art.js
  var headings = 64;
  function headlights(v, spec) {
    const nose = spec.halfLength - 3, spread = Math.min(3, spec.halfWidth * 0.62);
    g.save();
    g.translate(v.x, v.y);
    g.rotate(v.a);
    const light = g.createRadialGradient(nose + 1, 0, 0, nose + 7, 0, 23);
    light.addColorStop(0, "#ffce7240");
    light.addColorStop(1, "#ffd67c00");
    g.fillStyle = light;
    g.beginPath();
    g.moveTo(nose, -spread);
    g.lineTo(nose + 29, -spread - 5);
    g.lineTo(nose + 29, spread + 5);
    g.lineTo(nose, spread);
    g.fill();
    g.restore();
  }
  function groundShadow(v, spec) {
    g.save();
    g.translate(v.x + 0.65, v.y + 0.9);
    g.rotate(v.a);
    g.fillStyle = "#17132183";
    g.beginPath();
    if (spec.halfLength > 15) g.roundRect(-spec.halfLength - 0.5, -spec.halfWidth - 0.2, spec.halfLength * 2 + 1, spec.halfWidth * 2 + 0.4, 2.4);
    else g.ellipse(0, 0, spec.halfLength + 0.45, spec.halfWidth + 0.1, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  function placeholder(v, spec) {
    g.save();
    g.translate(v.x, v.y);
    g.rotate(v.a);
    g.fillStyle = "#33252b";
    g.fillRect(-spec.halfLength, -spec.halfWidth, spec.halfLength * 2, spec.halfWidth * 2);
    g.fillStyle = v.condition === 0 ? "#4d4047" : "#8d7f86";
    g.fillRect(-spec.halfLength + 0.6, -spec.halfWidth + 0.6, spec.halfLength * 2 - 1.2, spec.halfWidth * 2 - 1.2);
    g.fillStyle = "#3c4a5c";
    g.fillRect(spec.halfLength * 0.25, -spec.halfWidth + 1.1, spec.halfLength * 0.3, spec.halfWidth * 2 - 2.2);
    g.restore();
  }
  function sheetFor(v, spec) {
    const atlas = { ...spec.atlas, ...spec.tints?.[v.tint] };
    if (v.condition === 0) return [artwork[atlas.wreck], headings];
    if (atlas.ridden && (v.route || v === game.ride)) {
      const sheet = artwork[v === game.ride ? atlas.ridden : atlas.courier];
      if (sheet) return [sheet, atlas.riddenHeadings];
    }
    return [artwork[v.condition < 65 ? atlas.dented : atlas.intact] || artwork[atlas.intact], headings];
  }
  function drawVehicle(v) {
    const spec = fleetOf(v);
    if (!spec.atlas) return drawCar(v);
    if (v.condition !== 0 && (v === game.ride || v.route)) headlights(v, spec);
    groundShadow(v, spec);
    const [sheet, count] = sheetFor(v, spec);
    if (!sheet) placeholder(v, spec);
    else {
      const angle = (v.a % TAU + TAU) % TAU, frame = Math.round(angle / TAU * count) % count;
      const columns = Math.sqrt(count), cell = sheet.width / columns, { frame: size, scale, cx, cy } = spec.sprite;
      g.save();
      g.translate(v.x, v.y);
      let turn = Math.sin(angle - frame * TAU / count) * 0.72;
      if (spec.leans && v.lean && count !== headings) {
        const bank = 0.3 * v.lean;
        turn -= bank * Math.sin(angle);
        const tip = bank * Math.cos(angle);
        g.scale(1, Math.cos(tip) - 0.78 * Math.sin(tip));
      }
      g.rotate(turn);
      g.drawImage(sheet, frame % columns * cell, Math.floor(frame / columns) * cell, cell, cell, -cx / scale, -cy / scale, size / scale, size / scale);
      g.restore();
    }
    drawDamageSmoke(v, spec.halfLength * 0.64);
  }

  // src/world/ring-art.js
  var P = plateScale;
  var unit2 = (image) => ({ w: image.width / P, h: image.height / P });
  var pierOutline = [
    [-64, 236],
    [-35, 247],
    [-17, 260],
    [-11, 270],
    [-11, 322],
    [-15, 328],
    [-16, 348],
    [-20, 359],
    [-20, 377],
    [20, 377],
    [20, 359],
    [16, 348],
    [15, 328],
    [11, 322],
    [11, 270],
    [17, 260],
    [35, 247],
    [64, 236]
  ];
  var stationSpan = { left: 38.6, right: 134.9 };
  var foregrounds = /* @__PURE__ */ new Map();
  function spanForeground(key) {
    if (foregrounds.has(key)) return foregrounds.get(key);
    const { source, east, piers, eastPiers = [], station } = paintings[key].viaduct;
    const west = fromSource(source, { ring: true }), far = east ? fromSource(east, { ring: true }) : west;
    const top2 = west.y(161), deck = west.y(236), origin = station ? west.y(78) : top2;
    const plate = plates[key];
    const image = document.createElement("canvas");
    image.width = plate.width;
    image.height = Math.ceil((ringFoot - origin) * P);
    const ctx = image.getContext("2d");
    const px = (x) => (x + CELL_W / 2) * P, py = (y) => (y - origin) * P;
    ctx.beginPath();
    ctx.rect(0, py(top2), image.width, py(deck) - py(top2));
    if (station) ctx.rect(px(stationSpan.left), 0, px(stationSpan.right) - px(stationSpan.left), py(deck));
    for (const [map2, list] of [
      [west, piers],
      [far, eastPiers]
    ])
      for (const pier of list) {
        ctx.moveTo(px(map2.x(pier + pierOutline[0][0])), py(map2.y(pierOutline[0][1])));
        for (const [dx, y] of pierOutline) ctx.lineTo(px(map2.x(pier + dx)), py(map2.y(y)));
        ctx.closePath();
      }
    ctx.clip();
    ctx.drawImage(plate, 0, -(origin + CELL_H / 2) * P);
    const result = { image, origin, deck, foot: ringFoot, station, near: [west.y(188), west.y(252)] };
    foregrounds.set(key, result);
    return result;
  }
  var lift = () => town.ring.deckLift;
  function layStrip(image, x, y0, y1) {
    const { w, h } = unit2(image);
    for (let y = Math.floor(y0 / h) * h; y < y1; y += h) {
      const from = Math.max(y, y0), to = Math.min(y + h, y1);
      g.drawImage(image, 0, (from - y) * P, image.width, (to - from) * P, x - w / 2, from, w, to - from + 0.05);
    }
  }
  var girderFace;
  function face() {
    if (girderFace) return girderFace;
    const m = fromSource("ringNorth", { ring: true });
    const left2 = Math.round((m.x(126) + CELL_W / 2) * P), right = Math.round((m.x(376) + CELL_W / 2) * P);
    const top2 = Math.round((m.y(205) + CELL_H / 2) * P), bottom = Math.round((m.y(240) + CELL_H / 2) * P);
    girderFace = document.createElement("canvas");
    girderFace.width = right - left2;
    girderFace.height = bottom - top2;
    girderFace.getContext("2d").drawImage(plates.ringNorth, left2, top2, right - left2, bottom - top2, 0, 0, right - left2, bottom - top2);
    return girderFace;
  }
  var corners = [];
  function corner(quadrant) {
    if (corners[quadrant]) return corners[quadrant];
    const { cornerR: R } = town.ring;
    const deck = artwork.ringDeck, { w, h } = unit2(deck);
    const skirt = face(), depth = skirt.height / P;
    const pad = w / 2 + 2;
    const size = R + 2 * pad;
    const image = document.createElement("canvas");
    image.width = Math.ceil(size * P);
    image.height = Math.ceil((size + depth) * P);
    const ctx = image.getContext("2d");
    ctx.scale(P, P);
    const a0 = (quadrant - 1) * (Math.PI / 2);
    const cx = quadrant === 0 || quadrant === 1 ? pad : pad + R, cy = quadrant === 0 || quadrant === 3 ? pad + R : pad;
    const steps = Math.max(24, Math.ceil(R * Math.PI / 2 / 2.5));
    const edge = quadrant === 0 || quadrant === 3 ? R - w / 2 + 0.6 : R + w / 2 - 0.6;
    for (let i = 0; i < steps * 2; i++) {
      const a = a0 + (i + 0.5) / (steps * 2) * (Math.PI / 2), b = a0 + (i + 1.5) / (steps * 2) * (Math.PI / 2);
      const x0 = cx + Math.cos(a) * edge, x1 = cx + Math.cos(b) * edge;
      const width2 = Math.abs(x1 - x0);
      if (width2 < 0.01) continue;
      const along2 = edge * (a - a0) * P % (skirt.width - width2 * P - 1);
      ctx.drawImage(skirt, along2, 0, Math.max(1, width2 * P), skirt.height, Math.min(x0, x1), cy + Math.sin(a) * edge, width2 + 0.06, depth);
    }
    for (let i = 0; i < steps; i++) {
      const a = a0 + i / steps * (Math.PI / 2), length = R * Math.PI / 2 / steps;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.rotate(a);
      const along2 = R * (a - a0) % (h - length - 0.4);
      ctx.drawImage(deck, 0, along2 * P, deck.width, (length + 0.4) * P, -w / 2, -0.1, w, length + 0.5);
      ctx.restore();
    }
    corners[quadrant] = { image, dx: -cx, dy: -cy, w: image.width / P, h: image.height / P };
    return corners[quadrant];
  }
  function cornerCentres() {
    const { left: left2, right, top: top2, bottom, cornerR: R } = town.ring;
    return [
      [right - R, top2 + R],
      [right - R, bottom - R],
      [left2 + R, bottom - R],
      [left2 + R, top2 + R]
    ];
  }
  function drawSideDeck(ox, oy) {
    const ring2 = town.ring, up = lift();
    const { left: left2, right, top: top2, bottom, cornerR: R } = ring2;
    const viewTop = oy - 20, viewBottom = oy + game.vh + 20;
    const river3 = town.river;
    for (const x of [left2, right]) {
      if (x < ox - 20 || x > ox + game.vw + 20) continue;
      const y0 = Math.max(top2 + R - up, viewTop), y1 = Math.min(bottom - R - up, viewBottom);
      if (y1 > y0) layStrip(artwork.ringDeck, x, y0, y1);
      if (river3) {
        const r0 = Math.max(river3.top - 6 - up, viewTop), r1 = Math.min(river3.bottom + 6 - up, viewBottom);
        if (r1 > r0) layStrip(artwork.railBridgeBed, x, r0, r1);
      }
    }
    for (const [quadrant, [cx, cy]] of cornerCentres().entries()) {
      if (cx + R + 12 < ox || cx - R - 12 > ox + game.vw || cy - up + R + 20 < oy || cy - up - R - 12 > oy + game.vh) continue;
      const sprite = corner(quadrant);
      g.drawImage(sprite.image, cx + sprite.dx, cy - up + sprite.dy, sprite.w, sprite.h);
    }
  }
  function drawOverTrain(ox, oy) {
    const ring2 = town.ring, up = lift();
    const river3 = town.river;
    if (river3)
      for (const x of [ring2.left, ring2.right]) {
        if (x < ox - 20 || x > ox + game.vw + 20) continue;
        const r0 = Math.max(river3.top - 6 - up, oy - 20), r1 = Math.min(river3.bottom + 6 - up, oy + game.vh + 20);
        if (r1 > r0) layStrip(artwork.railBridgeTop, x, r0, r1);
      }
    const canopies = artwork.ringCanopies, size = unit2(canopies);
    const centre = [(440 - 356) * CELL_W / 1500, (744 - 548) * CELL_H / 1e3];
    for (const st of ring2.stations) {
      const { x, y } = st.stop;
      if (x < ox - 60 || x > ox + game.vw + 60 || y - up < oy - 60 || y - up > oy + game.vh + 60) continue;
      if (Math.abs(x - ring2.left) < 1 || Math.abs(x - ring2.right) < 1) {
        g.drawImage(canopies, x - centre[0], y - up - centre[1], size.w, size.h);
        continue;
      }
      const { col, row } = town.cellAt(x, y);
      const key = town.cellKinds[row][col];
      if (!paintings[key]?.viaduct?.station) continue;
      const { near } = spanForeground(key);
      const cx = X(col), cy = Y(row);
      g.drawImage(
        plates[key],
        (stationSpan.left + CELL_W / 2) * P,
        (near[0] + CELL_H / 2) * P,
        (stationSpan.right - stationSpan.left) * P,
        (near[1] - near[0]) * P,
        cx + stationSpan.left,
        cy + near[0],
        stationSpan.right - stationSpan.left,
        near[1] - near[0]
      );
    }
  }
  var column;
  function cornerColumn() {
    if (column) return column;
    const m = fromSource("ringNorth", { ring: true }), pier = 897;
    const xs = pierOutline.map(([dx]) => m.x(pier + dx)), ys = pierOutline.map(([, y]) => m.y(y));
    const left2 = Math.min(...xs), top2 = Math.min(...ys);
    const image = document.createElement("canvas");
    image.width = Math.ceil((Math.max(...xs) - left2) * P);
    image.height = Math.ceil((Math.max(...ys) - top2) * P);
    const ctx = image.getContext("2d");
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) ctx.lineTo((xs[i] - left2) * P, (ys[i] - top2) * P);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(plates.ringNorth, -(left2 + CELL_W / 2) * P, -(top2 + CELL_H / 2) * P);
    column = { image, w: image.width / P, h: image.height / P, foot: [m.x(pier) - left2, m.y(377) - top2] };
    return column;
  }
  function sideSupportSprites(ox, oy) {
    const ring2 = town.ring, sprites = [];
    const bracket = artwork.ringBracket, portal = artwork.ringPortal;
    const b = unit2(bracket), p2 = unit2(portal);
    const bracketFoot = (564 - 474) * CELL_W / 1500, portalCentre = (1060 - 996) * CELL_W / 1500;
    for (const support of cornerSupports) {
      const { x, y } = cornerSupportAt(ring2, support);
      if (x < ox - 40 || x > ox + game.vw + 40 || y < oy - 6 || y - 56 > oy + game.vh) continue;
      sprites.push({
        y,
        draw: (overhead) => {
          if (overhead) return;
          if (support.kind === "portal") g.drawImage(portal, x - portalCentre, y - p2.h + 0.4, p2.w, p2.h);
          else {
            const c = cornerColumn();
            g.drawImage(c.image, x - c.foot[0], y - c.foot[1] + 0.4, c.w, c.h);
          }
        }
      });
    }
    const seen = /* @__PURE__ */ new Set();
    for (const pier of ring2.piers) {
      if (pier.orientation !== "vertical" || pier.abutment) continue;
      const key = pier.side + pier.y;
      if (seen.has(key)) continue;
      seen.add(key);
      const x = pier.side === "west" ? ring2.left : ring2.right;
      if (x < ox - 40 || x > ox + game.vw + 40 || pier.y < oy - 6 || pier.y - 56 > oy + game.vh) continue;
      sprites.push({
        y: pier.y,
        draw: (overhead) => {
          if (overhead) return;
          if (pier.side === "west")
            g.drawImage(bracket, x + sideSupports.west.dx - bracketFoot, pier.y - b.h + 0.6, b.w, b.h);
          else g.drawImage(portal, x - portalCentre, pier.y - p2.h + 0.4, p2.w, p2.h);
        }
      });
    }
    return sprites;
  }

  // src/world/rail.js
  var leftPier = 602;
  var rightPier = 898;
  var bay;
  function viaductBay() {
    if (bay) return bay;
    bay = document.createElement("canvas");
    bay.width = rightPier - leftPier;
    bay.height = foot - railTop;
    const ctx = bay.getContext("2d");
    ctx.translate(-leftPier, -railTop);
    const outline = [
      [602, 161],
      [898, 161],
      [898, 377],
      [878, 377],
      [878, 361],
      [882, 351],
      [884, 327],
      [887, 321],
      [887, 274],
      [880, 261],
      [864, 251],
      [846, 244],
      [832, 236],
      [669, 236],
      [648, 241],
      [628, 251],
      [616, 263],
      [615, 319],
      [620, 327],
      [620, 350],
      [624, 360],
      [624, 377],
      [602, 377]
    ];
    ctx.beginPath();
    for (const [x, y] of outline) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(artwork.market, 0, 0);
    clearTrussOpenings(
      ctx,
      (x) => x,
      (y) => y
    );
    return bay;
  }
  function clearTrussOpenings(ctx, sourceX, sourceY) {
    ctx.globalCompositeOperation = "destination-out";
    for (let x = 666; x < 830; x += 24) {
      for (const tri of [
        [
          [x + 2, 214],
          [x + 19, 214],
          [x + 11, 222]
        ],
        [
          [x + 2, 231],
          [x + 19, 231],
          [x + 11, 225]
        ]
      ]) {
        ctx.beginPath();
        for (const [a, b] of tri) ctx.lineTo(sourceX(a), sourceY(b));
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  var marketRail;
  function marketForeground() {
    if (marketRail) return marketRail;
    const plate = plates.market;
    marketRail = document.createElement("canvas");
    marketRail.width = plate.width;
    marketRail.height = Math.ceil((foot - railTop) * railScaleY * plateScale);
    const ctx = marketRail.getContext("2d");
    const px = (u) => (marketColumnX(u) + CELL_W / 2) * plateScale;
    const py = (v) => (v - railTop) * railScaleY * plateScale;
    const outline = [
      [-64, 236],
      [-35, 247],
      [-17, 260],
      [-11, 270],
      [-11, 322],
      [-15, 328],
      [-16, 348],
      [-20, 359],
      [-20, 377],
      [20, 377],
      [20, 359],
      [16, 348],
      [15, 328],
      [11, 322],
      [11, 270],
      [17, 260],
      [35, 247],
      [64, 236]
    ];
    ctx.beginPath();
    ctx.rect(0, 0, plate.width, py(deckBottom));
    for (const pier of marketPiers2) {
      ctx.moveTo(px(pier + outline[0][0]), py(outline[0][1]));
      for (const [dx, y] of outline) ctx.lineTo(px(pier + dx), py(y));
      ctx.closePath();
    }
    ctx.clip();
    ctx.drawImage(plate, 0, -railTop * railScaleY * plateScale);
    clearTrussOpenings(ctx, px, py);
    return marketRail;
  }
  var streetSpans = /* @__PURE__ */ new Map();
  function streetSpan(section) {
    if (streetSpans.has(section)) return streetSpans.get(section);
    const source = viaductBay(), w = source.width, h = source.height;
    const strip = document.createElement("canvas");
    strip.width = w * 5;
    strip.height = h;
    const ctx = strip.getContext("2d");
    const arch = 68;
    for (let i = 0; i < 5; i++) {
      const x = i * w;
      const west = i === 0 ? section.westExtension * w / bayWidth : 0;
      const east = i === 4 ? section.eastExtension * w / bayWidth : 0;
      if (!west && !east) {
        ctx.drawImage(source, x, 0);
        continue;
      }
      const left2 = Math.round(x - west), right = Math.round(x + w + east);
      ctx.drawImage(source, 0, 0, arch, h, left2, 0, arch, h);
      ctx.drawImage(source, arch, 0, w - 2 * arch, h, left2 + arch, 0, right - left2 - 2 * arch, h);
      ctx.drawImage(source, w - arch, 0, arch, h, right - arch, 0, arch, h);
    }
    streetSpans.set(section, strip);
    return strip;
  }
  function drawHorizontalLeg(row, firstCol, lastCol, overhead) {
    const ring2 = town.ring;
    const minC = Math.max(firstCol, ring2.minCol), maxC = Math.min(lastCol, ring2.maxCol);
    if (minC > maxC) return;
    const top2 = Y(row) - CELL_H / 2, start = overhead ? railTop : deckBottom, end = overhead ? deckBottom : foot, y = top2 + start * railScaleY, height2 = (end - start) * railScaleY;
    g.save();
    g.beginPath();
    g.rect(ring2.left + ring2.cornerR - 2, top2, ring2.right - ring2.left - 2 * ring2.cornerR + 4, CELL_H);
    g.clip();
    for (let col = minC; col <= maxC; col++) {
      const x = X(col) - CELL_W / 2;
      const viaduct = paintedViaduct(town, row, col);
      if (viaduct?.market) {
        const rail = marketForeground();
        g.drawImage(
          rail,
          0,
          (start - railTop) * railScaleY * plateScale,
          rail.width,
          height2 * plateScale,
          x,
          y,
          CELL_W + 0.02,
          height2
        );
      } else if (viaduct) {
        const span = spanForeground(town.cellKinds[row][col]);
        const from = overhead ? span.origin : span.deck, to = overhead ? span.deck : span.foot;
        g.drawImage(
          span.image,
          0,
          (from - span.origin) * plateScale,
          span.image.width,
          (to - from) * plateScale,
          x,
          Y(row) + from,
          CELL_W + 0.02,
          to - from
        );
      } else {
        const strip = streetSpan(viaductSection(town, row, col));
        g.drawImage(strip, 0, start - railTop, strip.width, end - start, x, y, CELL_W + 0.02, height2);
      }
    }
    g.restore();
  }
  function visibleRails(ox, oy) {
    const ring2 = town.ring;
    if (!ring2) return [];
    const { firstCol, lastCol } = town.visibleCells(ox, oy - 24, game.vw, game.vh + 64);
    const rails = [];
    for (const row of [ring2.northRow, ring2.southRow]) {
      if (row == null) continue;
      const y = Y(row) + pierDepth;
      if (y < oy - 12 || Y(row) - CELL_H / 2 + railTop * railScaleY - 22 > oy + game.vh) continue;
      rails.push({
        y,
        draw: (overhead) => drawHorizontalLeg(row, firstCol, lastCol, overhead)
      });
    }
    rails.push(...sideSupportSprites(ox, oy));
    rails.push({
      y: -1e9,
      draw: (overhead) => {
        if (overhead) drawSideDeck(ox, oy);
      }
    });
    return rails;
  }

  // src/ui/guidance.js
  function atObjective(end, room) {
    if (room) return dist(p, end) < (game.active ? 11 : 15);
    return dist(end, p) < (end === target ? 22 : 36);
  }
  function routeInstruction(end) {
    const near = atObjective(end);
    if (game.ride?.condition === 0 || !game.ride && near && end === target && target.condition === 0)
      return "callRecovery";
    if (!game.active) return near ? "openFile" : "visitPickup";
    if (game.active === "repo")
      return game.ride === target ? near ? "handOverCar" : "deliverCar" : near ? game.ride ? "switchToTarget" : "boardTarget" : "northBoulevard";
    if (game.stage === "deliver") return near ? "handOver" : "driveAuction";
    if (near) return game.ride ? "leaveVehicle" : game.active === "noise" ? "useMeter" : "inventoryHere";
    return game.active === "noise" ? "record" : "tagLot";
  }
  function routeHUD(end, room) {
    const card = $("#routeCard");
    card.hidden = !end || game.viewMap;
    if (card.hidden) return;
    const file = game.active || nextFile();
    const near = atObjective(end, room);
    const step = room ? game.active ? near ? "leaveRoom" : "exitRoute" : near ? "caseDesk" : "deskRoute" : routeInstruction(end);
    hud("#routeType", t(game.active ? "currentCase" : "nextCase"));
    hud("#routeTitle", t(file));
    hud("#routeBrief", t(file + "Summary"));
    hud("#routePlace", placeName(room ? room.door : end === target ? "target" : end.id));
    hud("#routeDistance", near ? t("onSite") : room ? "" : Math.round(dist(p, end) * 0.15) + " m");
    hud("#routeAction", t(step));
  }
  var sheetLanguage;
  function showMapSheet(end) {
    const sheet = $("#mapSheet");
    if (!sheet.hidden && sheetLanguage === lang) return;
    sheet.hidden = false;
    sheetLanguage = lang;
    hud("#mapTitle", t("cityMap"));
    hud("#mapKey span:first-child", t("legend1"));
    hud("#mapKey span:last-child", t("legend2"));
    hud("#filesTitle", t("casebook"));
    const list = $("#fileList");
    list.replaceChildren();
    const open = files.filter((id) => !done.has(id) && id !== game.active);
    const tracked = game.active || nextFile();
    for (const id of game.active ? [game.active, ...open] : open) {
      const row = document.createElement("li");
      const address = town.byId.get(id);
      const pin2 = document.createElement("b");
      pin2.className = "filePin";
      pin2.textContent = address.symbol;
      pin2.style.backgroundColor = address.color;
      const details = document.createElement("div");
      const status = document.createElement("small");
      const state = id === tracked ? game.active ? "currentCase" : "nextCase" : game.active ? "waitingCase" : "openCase";
      status.textContent = id === game.active ? t(state) : t(state) + " \xB7 " + placeName(id);
      const name = document.createElement("strong");
      name.textContent = t(id);
      const brief = document.createElement("p");
      brief.textContent = t(id + "Summary");
      details.append(status, name, brief);
      if (id === game.active) {
        const step = document.createElement("p");
        step.className = "fileStep";
        step.textContent = placeName(end === target ? "target" : end.id) + " \xB7 " + t(objective());
        details.append(step);
      }
      row.append(pin2, details);
      list.append(row);
    }
    hud("#filesNote", !tracked ? t("filesClosed") : game.active ? open.length ? t("filesWaiting") : "" : t("fileSources"));
    $("#casebook").scrollTop = 0;
  }

  // assets/voltaTurns.webp
  var voltaTurns_default = "game/voltaTurns-UHH3ABSE.webp";

  // assets/voltaRedTurns.webp
  var voltaRedTurns_default = "game/voltaRedTurns-MESJ4K6S.webp";

  // assets/voltaRedDented.webp
  var voltaRedDented_default = "game/voltaRedDented-NKGI2BN4.webp";

  // assets/voltaRedWreck.webp
  var voltaRedWreck_default = "game/voltaRedWreck-JQSNJA3Q.webp";

  // assets/voltaDented.webp
  var voltaDented_default = "game/voltaDented-GU3JEYCX.webp";

  // assets/voltaWreck.webp
  var voltaWreck_default = "game/voltaWreck-4QIAXVHG.webp";

  // assets/suvTurns.webp
  var suvTurns_default = "game/suvTurns-DSFMB4PS.webp";

  // assets/suvDented.webp
  var suvDented_default = "game/suvDented-D7EBC2TS.webp";

  // assets/suvWreck.webp
  var suvWreck_default = "game/suvWreck-ZLKUIG4S.webp";

  // assets/busTurns.webp
  var busTurns_default = "game/busTurns-D7ZM7M4B.webp";

  // assets/busDented.webp
  var busDented_default = "game/busDented-4RZPWITG.webp";

  // assets/busWreck.webp
  var busWreck_default = "game/busWreck-CUJWK6KB.webp";

  // assets/dumperTurns.webp
  var dumperTurns_default = "game/dumperTurns-JHJDW6KB.webp";

  // assets/dumperDented.webp
  var dumperDented_default = "game/dumperDented-SMAQ5CQQ.webp";

  // assets/dumperWreck.webp
  var dumperWreck_default = "game/dumperWreck-INIWCO7R.webp";

  // assets/motoTurns.webp
  var motoTurns_default = "game/motoTurns-6DHK2ZVJ.webp";

  // assets/motoDented.webp
  var motoDented_default = "game/motoDented-VUNC777H.webp";

  // assets/motoWreck.webp
  var motoWreck_default = "game/motoWreck-XORBQYTG.webp";

  // assets/motoRider.webp
  var motoRider_default = "game/motoRider-C7PFXXUJ.webp";

  // assets/motoCourier.webp
  var motoCourier_default = "game/motoCourier-ACAN5BRY.webp";

  // assets/flatCap.webp
  var flatCap_default = "game/flatCap-NE7EAA4T.webp";

  // assets/bomber.webp
  var bomber_default = "game/bomber-BDOASYSB.webp";

  // assets/mariniere.webp
  var mariniere_default = "game/mariniere-JHRNUPEP.webp";

  // assets/rigger.webp
  var rigger_default = "game/rigger-37XI45RA.webp";

  // assets/chelsea.webp
  var chelsea_default = "game/chelsea-663C67PS.webp";

  // assets/medicDown.webp
  var medicDown_default = "game/medicDown-MZH7I3S3.webp";

  // assets/ambulanceWreck.webp
  var ambulanceWreck_default = "game/ambulanceWreck-YIIXVDQ4.webp";

  // assets/ambulanceDented.webp
  var ambulanceDented_default = "game/ambulanceDented-SX2QQND6.webp";

  // assets/ambulanceTurns.webp
  var ambulanceTurns_default = "game/ambulanceTurns-4D5ERX5U.webp";

  // assets/ringTrainTurns.webp
  var ringTrainTurns_default = "game/ringTrainTurns-GAS6A2EZ.webp";

  // assets/ringTrainCabTurns.webp
  var ringTrainCabTurns_default = "game/ringTrainCabTurns-DKC2ZICD.webp";

  // assets/officeInterior.webp
  var officeInterior_default = "game/officeInterior-V76LRSVZ.webp";

  // assets/rescueOpen.webp
  var rescueOpen_default = "game/rescueOpen-4OWTC7JX.webp";

  // assets/rescueStretcher.webp
  var rescueStretcher_default = "game/rescueStretcher-6IRU6P7A.webp";

  // assets/rescueMedic.webp
  var rescueMedic_default = "game/rescueMedic-GGA6PHIF.webp";

  // assets/rescueVan.webp
  var rescueVan_default = "game/rescueVan-LG2TZYJU.webp";

  // assets/sweep.png
  var sweep_default = "game/sweep-KCLXRZPL.png";

  // assets/slapping.webp
  var slapping_default = "game/slapping-SLMTA62Z.webp";

  // assets/scuffle.webp
  var scuffle_default = "game/scuffle-RO3IZQOF.webp";

  // assets/run.webp
  var run_default = "game/run-NEYFJKLS.webp";

  // assets/worker.webp
  var worker_default = "game/worker-5VDGLN3E.webp";

  // assets/lady.webp
  var lady_default = "game/lady-XS6L64KA.webp";

  // assets/civilian.webp
  var civilian_default = "game/civilian-2R5UKU6T.webp";

  // assets/motor.webp
  var motor_default = "game/motor-OFCG5CEV.webp";

  // assets/walk.webp
  var walk_default = "game/walk-WMRREBKX.webp";

  // assets/konami-heads.webp
  var konami_heads_default = "game/konami-heads-CUHTXQ3C.webp";

  // assets/market.webp
  var market_default = "game/market-NPZLUM6N.webp";

  // assets/garage.webp
  var garage_default = "game/garage-PNVLYJ5D.webp";

  // assets/docks.webp
  var docks_default = "game/docks-4UHDHK64.webp";

  // assets/square.webp
  var square_default = "game/square-N5DVEOSI.webp";

  // assets/scenery/alleyCross.webp
  var alleyCross_default = "game/alleyCross-QS5TJWJ5.webp";

  // assets/scenery/alleyStripH.webp
  var alleyStripH_default = "game/alleyStripH-7ROADJ25.webp";

  // assets/scenery/alleyStripV.webp
  var alleyStripV_default = "game/alleyStripV-2SGB3FKV.webp";

  // assets/scenery/basilica.webp
  var basilica_default = "game/basilica-EIRV52RI.webp";

  // assets/scenery/boulevard.webp
  var boulevard_default = "game/boulevard-PB3MIQOA.webp";

  // assets/scenery/haussmann.webp
  var haussmann_default = "game/haussmann-EFW3QEPL.webp";

  // assets/scenery/haussmannCafe.webp
  var haussmannCafe_default = "game/haussmannCafe-MSOFIZUT.webp";

  // assets/scenery/islandCathedral.webp
  var islandCathedral_default = "game/islandCathedral-A6JTOQLK.webp";

  // assets/scenery/islandEast.webp
  var islandEast_default = "game/islandEast-TZQXOXTX.webp";

  // assets/scenery/islandWest.webp
  var islandWest_default = "game/islandWest-KEDIFGQT.webp";

  // assets/scenery/marketHall.webp
  var marketHall_default = "game/marketHall-DBU4ERMN.webp";

  // assets/scenery/obeliskSquare.webp
  var obeliskSquare_default = "game/obeliskSquare-R53NNFWG.webp";

  // assets/scenery/opera.webp
  var opera_default = "game/opera-76AI7GTN.webp";

  // assets/scenery/palaisJustice.webp
  var palaisJustice_default = "game/palaisJustice-TDUMUONC.webp";

  // assets/scenery/park.webp
  var park_default = "game/park-5J5GTOE5.webp";

  // assets/scenery/railBridgeBed.webp
  var railBridgeBed_default = "game/railBridgeBed-SKQQ75NH.webp";

  // assets/scenery/railBridgeTop.webp
  var railBridgeTop_default = "game/railBridgeTop-ID4TX5LS.webp";

  // assets/scenery/ringBracket.webp
  var ringBracket_default = "game/ringBracket-QONIHSA7.webp";

  // assets/scenery/ringCanopies.webp
  var ringCanopies_default = "game/ringCanopies-WQWICR2X.webp";

  // assets/scenery/ringDeck.webp
  var ringDeck_default = "game/ringDeck-5NZUWYFL.webp";

  // assets/scenery/ringNorth.webp
  var ringNorth_default = "game/ringNorth-6YCD6CAH.webp";

  // assets/scenery/ringNorthB.webp
  var ringNorthB_default = "game/ringNorthB-CYL4QEVY.webp";

  // assets/scenery/ringPortal.webp
  var ringPortal_default = "game/ringPortal-U5XWV4OU.webp";

  // assets/scenery/ringStation.webp
  var ringStation_default = "game/ringStation-JWK2PVGQ.webp";

  // assets/scenery/ringStationB.webp
  var ringStationB_default = "game/ringStationB-FRF2TTM7.webp";

  // assets/scenery/river.webp
  var river_default = "game/river-XHQNO4ED.webp";

  // assets/scenery/riverBridge.webp
  var riverBridge_default = "game/riverBridge-Q7IOXTDU.webp";

  // assets/scenery/riverIronBridge.webp
  var riverIronBridge_default = "game/riverIronBridge-B4VQSPE6.webp";

  // assets/scenery/rondPoint.webp
  var rondPoint_default = "game/rondPoint-3UC7MDEY.webp";

  // assets/scenery/starArch.webp
  var starArch_default = "game/starArch-A4OB42X2.webp";

  // assets/scenery/teeNorth.webp
  var teeNorth_default = "game/teeNorth-VQOZRZTJ.webp";

  // assets/scenery/towerBase.webp
  var towerBase_default = "game/towerBase-GWYTJFI4.webp";

  // assets/scenery/towerIron.webp
  var towerIron_default = "game/towerIron-5O3KVQCD.webp";

  // assets/scenery/riverOver.webp
  var riverOver_default = "game/riverOver-OSTXGEIB.webp";

  // assets/scenery/riverBridgeOver.webp
  var riverBridgeOver_default = "game/riverBridgeOver-EGFWIMZV.webp";

  // assets/scenery/riverIronBridgeOver.webp
  var riverIronBridgeOver_default = "game/riverIronBridgeOver-7UHTGZYD.webp";

  // assets/scenery/islandWestOver.webp
  var islandWestOver_default = "game/islandWestOver-F2IK5DZY.webp";

  // assets/scenery/islandCathedralOver.webp
  var islandCathedralOver_default = "game/islandCathedralOver-5HT2INYJ.webp";

  // assets/scenery/islandEastOver.webp
  var islandEastOver_default = "game/islandEastOver-DTSRKIHR.webp";

  // assets/bargeTurns.webp
  var bargeTurns_default = "game/bargeTurns-QIY7IBHA.webp";

  // assets/riverboatTurns.webp
  var riverboatTurns_default = "game/riverboatTurns-IWF4XPET.webp";

  // assets/speedboatTurns.webp
  var speedboatTurns_default = "game/speedboatTurns-GY337XFH.webp";

  // assets/launchTurns.webp
  var launchTurns_default = "game/launchTurns-UBSU7SZH.webp";

  // src/art/assets.js
  var boatFrames = {
    barge: { bodyLengthPx: 464, anchorX: 256, anchorY: 280 },
    riverboat: { bodyLengthPx: 414, anchorX: 224, anchorY: 250 },
    speedboat: { bodyLengthPx: 167, anchorX: 96, anchorY: 112 },
    launch: { bodyLengthPx: 200, anchorX: 112, anchorY: 130 }
  };
  var imageData = {
    voltaRedTurns: voltaRedTurns_default,
    voltaRedDented: voltaRedDented_default,
    voltaRedWreck: voltaRedWreck_default,
    voltaTurns: voltaTurns_default,
    voltaDented: voltaDented_default,
    voltaWreck: voltaWreck_default,
    suvTurns: suvTurns_default,
    suvDented: suvDented_default,
    suvWreck: suvWreck_default,
    busTurns: busTurns_default,
    busDented: busDented_default,
    busWreck: busWreck_default,
    dumperTurns: dumperTurns_default,
    dumperDented: dumperDented_default,
    dumperWreck: dumperWreck_default,
    motoTurns: motoTurns_default,
    motoDented: motoDented_default,
    motoWreck: motoWreck_default,
    motoRider: motoRider_default,
    motoCourier: motoCourier_default,
    flatCap: flatCap_default,
    bomber: bomber_default,
    mariniere: mariniere_default,
    rigger: rigger_default,
    chelsea: chelsea_default,
    medicDown: medicDown_default,
    ambulanceWreck: ambulanceWreck_default,
    ambulanceDented: ambulanceDented_default,
    ambulanceTurns: ambulanceTurns_default,
    ringTrainTurns: ringTrainTurns_default,
    ringTrainCabTurns: ringTrainCabTurns_default,
    officeInterior: officeInterior_default,
    rescueOpen: rescueOpen_default,
    rescueStretcher: rescueStretcher_default,
    rescueMedic: rescueMedic_default,
    rescueVan: rescueVan_default,
    sweep: sweep_default,
    slapping: slapping_default,
    scuffle: scuffle_default,
    run: run_default,
    worker: worker_default,
    lady: lady_default,
    civilian: civilian_default,
    motor: motor_default,
    walk: walk_default,
    konamiHeads: konami_heads_default,
    market: market_default,
    garage: garage_default,
    docks: docks_default,
    square: square_default,
    alleyCross: alleyCross_default,
    alleyStripH: alleyStripH_default,
    alleyStripV: alleyStripV_default,
    basilica: basilica_default,
    boulevard: boulevard_default,
    haussmann: haussmann_default,
    haussmannCafe: haussmannCafe_default,
    islandCathedral: islandCathedral_default,
    islandEast: islandEast_default,
    islandWest: islandWest_default,
    marketHall: marketHall_default,
    obeliskSquare: obeliskSquare_default,
    opera: opera_default,
    palaisJustice: palaisJustice_default,
    park: park_default,
    railBridgeBed: railBridgeBed_default,
    railBridgeTop: railBridgeTop_default,
    ringBracket: ringBracket_default,
    ringCanopies: ringCanopies_default,
    ringDeck: ringDeck_default,
    ringNorth: ringNorth_default,
    ringNorthB: ringNorthB_default,
    ringPortal: ringPortal_default,
    ringStation: ringStation_default,
    ringStationB: ringStationB_default,
    river: river_default,
    riverBridge: riverBridge_default,
    riverIronBridge: riverIronBridge_default,
    rondPoint: rondPoint_default,
    starArch: starArch_default,
    teeNorth: teeNorth_default,
    towerBase: towerBase_default,
    towerIron: towerIron_default,
    riverOver: riverOver_default,
    riverBridgeOver: riverBridgeOver_default,
    riverIronBridgeOver: riverIronBridgeOver_default,
    islandWestOver: islandWestOver_default,
    islandCathedralOver: islandCathedralOver_default,
    islandEastOver: islandEastOver_default,
    bargeTurns: bargeTurns_default,
    riverboatTurns: riverboatTurns_default,
    speedboatTurns: speedboatTurns_default,
    launchTurns: launchTurns_default
  };

  // src/art/boats.js
  var paint = {
    barge: { side: "#693b44", trim: "#aa6e57", deck: "#716355", cabin: "#ac8370" },
    riverboat: { side: "#3d5860", trim: "#b6a183", deck: "#9b806a", cabin: "#c1a587" },
    speedboat: { side: "#805357", trim: "#c49c72", deck: "#b1a78c", cabin: "#665d70" },
    launch: { side: "#253d50", trim: "#aa8552", deck: "#57666c", cabin: "#949e91" }
  };
  function shape(points, fill, outline = "#281d2a", weight = 0.5) {
    g.beginPath();
    for (const [x, y] of points) g.lineTo(x, y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (outline) {
      g.strokeStyle = outline;
      g.lineWidth = weight;
      g.stroke();
    }
  }
  function paintedHull(boat) {
    const L = boat.halfLength, B = boat.halfWidth;
    const co = Math.cos(boat.a), si = Math.sin(boat.a);
    const colors2 = paint[boat.model];
    const workboat = boat.model === "barge";
    const passenger = boat.model === "riverboat";
    const gunwale = (workboat || passenger ? 0.52 : 0.45) * B;
    const project = (u, v, z) => [u * co - v * si, u * si + v * co - z - boat.plane * (1 + u / L) * 1.35];
    const outline = [
      [L, 0],
      [L * 0.87, B * 0.62],
      [L * 0.62, B],
      [-L * 0.81, B],
      [-L, B * 0.67],
      [-L, -B * 0.67],
      [-L * 0.81, -B],
      [L * 0.62, -B],
      [L * 0.87, -B * 0.62]
    ];
    const deck = outline.map(([u, v]) => project(u, v, gunwale));
    const keel = outline.map(([u, v]) => project(u * 0.97, v * 0.85, 0));
    for (let i = 0; i < deck.length; i++) {
      const j = (i + 1) % deck.length;
      if (deck[j][0] <= deck[i][0]) shape([deck[i], deck[j], keel[j], keel[i]], colors2.side);
    }
    const gloss = g.createLinearGradient(0, -B - gunwale, 0, B);
    gloss.addColorStop(0, colors2.trim);
    gloss.addColorStop(0.48, colors2.deck);
    gloss.addColorStop(1, "#524650");
    shape(deck, gloss, "#201b26", 0.85);
    shape(outline.map(([u, v]) => project(u * 0.972, v * 0.87, gunwale)), "#85735b32", colors2.trim, 0.36);
    for (let i = 0; i < 19; i++) {
      const u = L * (i / 11 - 0.85), v = B * Math.sin(i * 45.3) * 0.53;
      shape([
        project(u, v, gunwale + 0.03),
        project(u + L * 0.04, v + 0.2, gunwale + 0.03),
        project(u - 0.1, v + 0.5, gunwale + 0.03)
      ], "#e4b88735", null);
    }
    function cabin(back, nose, width2, height2, windows) {
      const z = gunwale + height2;
      const floor = [[nose, width2], [back, width2], [back, -width2], [nose, -width2]];
      const lower = floor.map(([u, v]) => project(u, v, gunwale));
      const wallTop = floor.map(([u, v]) => project(u, v * 0.91, z));
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        if (lower[j][0] > lower[i][0]) continue;
        shape([wallTop[i], wallTop[j], lower[j], lower[i]], i % 2 ? colors2.cabin : colors2.trim);
        const count = i % 2 ? 2 : windows;
        for (let k = 0; k < count; k++) {
          const lerp = (a, b, t2) => a.map((v, n) => v + (b[n] - v) * t2);
          const f = (k + 0.16) / count, e = (k + 0.83) / count;
          const low = (t2) => lerp(lerp(lower[i], lower[j], t2), lerp(wallTop[i], wallTop[j], t2), 0.24);
          const high = (t2) => lerp(lerp(lower[i], lower[j], t2), lerp(wallTop[i], wallTop[j], t2), 0.79);
          shape([low(f), low(e), high(e), high(f)], i % 2 ? "#445763" : "#c69b65", "#342832", 0.32);
        }
      }
      shape(wallTop, colors2.cabin, "#362832", 0.72);
      shape(
        floor.map(([u, v]) => project(u * 0.98 + (back + nose) * 0.01, v * 0.73, z + 0.15)),
        "#eab47d43",
        "#403642",
        0.28
      );
    }
    if (workboat) {
      cabin(-L * 0.81, -L * 0.48, B * 0.7, B * 0.85, 3);
      const hatch = [[-L * 0.42, -B * 0.76], [L * 0.58, -B * 0.76], [L * 0.58, B * 0.76], [-L * 0.42, B * 0.76]];
      shape(hatch.map(([u, v]) => project(u, v, gunwale + 1.4)), "#554953", colors2.trim);
      for (let i = 0; i < 8; i++) {
        const u = L * (i / 8 - 0.4);
        shape([[u, -0.72], [u + 1.5, -0.72], [u + 1.5, 0.72], [u, 0.72]].map(([s, v]) => project(s, v * B, gunwale + 1.6)), "#9d7761", null);
      }
    } else if (passenger) {
      cabin(-L * 0.68, L * 0.54, B * 0.77, B * 0.86, 11);
    } else {
      cabin(-L * 0.4, L * 0.25, B * 0.78, B * (boat.model === "launch" ? 0.94 : 0.55), 3);
    }
    if (boat.condition < 92) {
      for (const side of [-1, 1]) {
        shape([[0.75, 0.58], [0.52, 0.72], [0.65, 0.5], [0.55, 0.38]].map(([u, v]) => project(u * L, v * B * side, gunwale + 0.12)), "#44383e");
      }
    }
    for (const side of [-1, 1]) {
      const [x, y] = project(L * 0.62, B * 0.78 * side, gunwale + 0.55);
      g.fillStyle = side > 0 ? "#8bcbab" : "#ec9276";
      g.beginPath();
      g.ellipse(x, y, 0.7, 0.55, 0, 0, TAU);
      g.fill();
    }
  }
  function drawWake(boat) {
    const beam = boat.halfWidth;
    for (const p2 of boat.wake) {
      const fade = 1 - p2.age / 2.4;
      const spread = beam * (0.45 + p2.age * 0.42) + p2.power * p2.age * 2.1;
      const angleX = Math.cos(p2.a), angleY = Math.sin(p2.a);
      for (const side of [-1, 1]) {
        const x = p2.x - angleY * spread * side, y = p2.y + angleX * spread * side;
        const endX = x - (1 + p2.power * 5) * angleX, endY = y - (1 + p2.power * 5) * angleY;
        if (!river2.onWater(x, y, 1.3) || !river2.onWater(endX, endY, 1.3)) continue;
        g.strokeStyle = side === 1 ? "#accdcc" : "#79aebc";
        g.globalAlpha = 0.34 * fade * p2.power;
        g.lineWidth = 0.55 + fade * p2.power * 0.55;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(endX, endY);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
  function drawBoat(boat) {
    g.save();
    g.translate(boat.x, boat.y);
    g.save();
    g.rotate(boat.a);
    g.fillStyle = "#10132482";
    g.beginPath();
    g.ellipse(0, 1, boat.halfLength * 1.015, boat.halfWidth * 0.99, 0, 0, TAU);
    g.fill();
    g.restore();
    for (let i = 0; i < 12; i++) {
      const y = boat.halfWidth * 0.4 + i * 1.1;
      const x = Math.sin(boat.x + i * 4.2 + game.time * 3) * (1 + i * 0.18);
      if (!river2.onWater(boat.x + x, boat.y + y, 2)) continue;
      g.fillStyle = i % 4 ? "#e8b471" : "#aedaaf";
      g.globalAlpha = (1 - i / 12) * 0.36;
      g.fillRect(x - i % 3, y, 2 + i % 5, 0.35 + i % 2 * 0.25);
    }
    g.globalAlpha = 1;
    const atlas = artwork[boat.model + "Turns"], metadata = boatFrames[boat.model];
    if (atlas && metadata) {
      const cell = atlas.width / 8, frame = (Math.round(boat.a * 64 / TAU) % 64 + 64) % 64;
      const scale = boat.halfLength * 2 / metadata.bodyLengthPx;
      g.drawImage(
        atlas,
        frame % 8 * cell,
        Math.floor(frame / 8) * cell,
        cell,
        cell,
        -scale * metadata.anchorX,
        -scale * metadata.anchorY - boat.plane * 1.35,
        cell * scale,
        cell * scale
      );
    } else paintedHull(boat);
    g.restore();
  }
  function drawBoats(left2, top2) {
    const visible = boatFleet.boats.filter((b) => !b.incoming && b.x + b.halfLength + 130 >= left2 && b.x - b.halfLength - 130 <= left2 + game.vw && b.y + 115 >= top2 && b.y - 115 <= top2 + game.vh);
    for (const boat of visible) drawWake(boat);
    visible.sort((a, b) => a.y - b.y);
    for (const boat of visible) drawBoat(boat);
    return visible.length > 0;
  }
  function drawMooring(m) {
    const { x, y } = m.quay;
    g.save();
    g.translate(x, y);
    g.fillStyle = "#282331";
    g.beginPath();
    g.ellipse(0, 0, 3.6, 2.7, 0, 0, TAU);
    g.fill();
    g.strokeStyle = "#edcc86";
    g.lineWidth = 0.48;
    g.stroke();
    g.beginPath();
    g.moveTo(-1.55, -0.15);
    g.quadraticCurveTo(0, 2.55, 1.55, -0.15);
    g.moveTo(0, 1.2);
    g.lineTo(0, -1.5);
    g.moveTo(-0.85, -0.65);
    g.lineTo(0.85, -0.65);
    g.stroke();
    g.restore();
  }

  // src/art/train.js
  var mod2 = (a, n) => (a % n + n) % n;
  var FRAME = 320;
  var PX_PER_UNIT = 3.6;
  var ORIGIN = [160, 192];
  var TILT = 0.78;
  function quad(points, fill) {
    g.beginPath();
    for (const q of points) g.lineTo(q.x, q.y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }
  function drawCarriage(car3, lift2, state) {
    const ux = Math.cos(car3.a), uy = Math.sin(car3.a), nx = -uy, ny = ux;
    const hl = CAR_LENGTH / 2 - 1, hw = CAR_HALF_WIDTH;
    const at2 = (u, v) => ({ x: car3.x + ux * u + nx * v, y: car3.y + uy * u + ny * v - lift2 });
    quad([at2(-hl, -hw + 0.6), at2(hl, -hw + 0.6), at2(hl + 1.2, hw + 1.6), at2(-hl + 1.2, hw + 1.6)], "#0b0812a0");
    const side = state.station >= 0 ? ringLine().ring.stations[state.station].side : 1;
    g.save();
    g.globalCompositeOperation = "lighter";
    quad([at2(-hl + 6, side * hw), at2(hl - 6, side * hw), at2(hl - 9, side * (hw + 6)), at2(-hl + 9, side * (hw + 6))], "#ff9a3212");
    if (state.doors) {
      const open = Math.min(1, (state.doorsFor ?? 1) * 2.5);
      for (const u of [-0.3 * CAR_LENGTH, 0.3 * CAR_LENGTH]) {
        const q = at2(u, side * (hw + 3));
        const glow = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, 9);
        glow.addColorStop(0, `rgba(255,214,140,${0.42 * open})`);
        glow.addColorStop(1, "rgba(255,214,140,0)");
        g.fillStyle = glow;
        g.fillRect(q.x - 9, q.y - 9, 18, 18);
      }
    }
    if (car3.cab === "front") {
      const nose = at2(hl, 0);
      const beam = g.createRadialGradient(nose.x, nose.y, 0, nose.x, nose.y, 46);
      beam.addColorStop(0, "#ffe2a048");
      beam.addColorStop(1, "#ffe2a000");
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(at2(hl, -3).x, at2(hl, -3).y);
      g.lineTo(at2(hl + 46, -11).x, at2(hl + 46, -11).y);
      g.lineTo(at2(hl + 46, 11).x, at2(hl + 46, 11).y);
      g.lineTo(at2(hl, 3).x, at2(hl, 3).y);
      g.fill();
    }
    g.restore();
    const atlas = car3.cab ? artwork.ringTrainCabTurns : artwork.ringTrainTurns;
    const heading = mod2(car3.cab === "rear" ? car3.a + Math.PI : car3.a, TAU3), frame = Math.round(heading / TAU3 * 64) % 64, cell = atlas.width / 8, unit3 = cell / FRAME * PX_PER_UNIT;
    g.save();
    g.translate(car3.x, car3.y - lift2);
    g.rotate(Math.sin(heading - frame * TAU3 / 64) * TILT);
    g.drawImage(
      atlas,
      frame % 8 * cell,
      Math.floor(frame / 8) * cell,
      cell,
      cell,
      -ORIGIN[0] / PX_PER_UNIT,
      -ORIGIN[1] / PX_PER_UNIT,
      cell / unit3,
      cell / unit3
    );
    g.restore();
  }
  function drawStationSign(st) {
    const { x, y } = st.street;
    g.fillStyle = "#15112570";
    g.beginPath();
    g.ellipse(x + 0.5, y, 2.4, 1, 0, 0, TAU3);
    g.fill();
    g.fillStyle = "#2a2f2b";
    g.fillRect(x - 0.45, y - 15, 0.9, 15);
    g.fillStyle = "#191825";
    g.beginPath();
    g.arc(x, y - 17.5, 3.9, 0, TAU3);
    g.fill();
    g.fillStyle = "#f3e3bf";
    g.beginPath();
    g.arc(x, y - 17.5, 3.4, 0, TAU3);
    g.fill();
    g.fillStyle = "#2f6b4f";
    g.beginPath();
    g.arc(x, y - 17.5, 2.6, 0, TAU3);
    g.fill();
    g.fillStyle = "#f3e3bf";
    g.font = "bold 2.6px system-ui";
    g.textAlign = "center";
    g.fillText("PC", x, y - 16.5);
    g.textAlign = "left";
  }
  function ringActors(ox, oy) {
    const { ring: ring2 } = ringLine();
    const out = [];
    const inView = (q, above = 0) => q.x > ox - 12 && q.x < ox + game.vw + 12 && q.y > oy - 4 && q.y - above < oy + game.vh + 4;
    for (const st of ring2.stations)
      if (st.vertical && inView(st.street, 25)) out.push({ y: st.street.y, x: st.street.x, draw: () => drawStationSign(st) });
    return out;
  }
  function drawRingTrains(ox, oy, actors = []) {
    const { ring: ring2, tt } = ringLine();
    const lift2 = ring2.deckLift;
    const view = { left: ox - 40, right: ox + game.vw + 40, top: oy - 20, bottom: oy + game.vh + lift2 + 30 };
    const items = [];
    for (let k = 0; k < tt.sets; k++) {
      const state = trainsetAt(tt, k, game.time);
      state.doorsFor = state.station >= 0 ? tt.dwell - state.dwellLeft - tt.doorsOpen : 0;
      for (const car3 of carriagesOf(tt, state))
        if (car3.x > view.left && car3.x < view.right && car3.y > view.top && car3.y < view.bottom)
          items.push({ y: car3.y, car: car3, state });
    }
    if (game.transit?.phase === "platform") items.push({ y: p.y, rider: true });
    items.sort((a, b) => a.y - b.y);
    const tall = actors.filter((a) => a.prop && a.o.item.outline);
    for (const item of items) {
      if (item.rider) {
        g.save();
        g.translate(0, -lift2);
        dude(p, true);
        g.restore();
        continue;
      }
      const car3 = item.car;
      drawCarriage(car3, lift2, item.state);
      const spanX = CAR_LENGTH / 2 * Math.abs(Math.cos(car3.a)) + CAR_HALF_WIDTH * Math.abs(Math.sin(car3.a)) + 1, spanY = CAR_LENGTH / 2 * Math.abs(Math.sin(car3.a)) + CAR_HALF_WIDTH * Math.abs(Math.cos(car3.a)) + 1, box2 = { left: car3.x - spanX, right: car3.x + spanX, top: car3.y - lift2 - spanY - 18, bottom: car3.y - lift2 + spanY + 2 };
      for (const a of tall) {
        const { item: prop } = a.o;
        const top2 = Math.min(...prop.outline.map((q) => q[1])) - prop.y + a.o.y;
        if (a.o.y <= car3.y || top2 >= box2.bottom || Math.abs(a.o.x - car3.x) > spanX + 8) continue;
        g.save();
        g.beginPath();
        g.rect(box2.left, box2.top, box2.right - box2.left, box2.bottom - box2.top);
        g.clip();
        drawStreetProp(a.o);
        g.restore();
      }
    }
  }
  function drawRingMap(left2, top2, scale, full) {
    const { ring: ring2, tt } = ringLine();
    g.save();
    g.beginPath();
    for (const q of ring2.points) g.lineTo(left2 + q.x * scale, top2 + q.y * scale);
    g.closePath();
    g.lineJoin = "round";
    g.lineWidth = full ? 1.6 : 0.6;
    g.strokeStyle = "#1d1b26";
    g.stroke();
    g.lineWidth = full ? 0.9 : 0.34;
    g.strokeStyle = "#6fae8a";
    g.stroke();
    if (full)
      for (let k = 0; k < tt.sets; k++) {
        const state = trainsetAt(tt, k, game.time);
        for (const car3 of carriagesOf(tt, state)) {
          g.fillStyle = "#b8343c";
          g.beginPath();
          g.arc(left2 + car3.x * scale, top2 + car3.y * scale, 0.75, 0, TAU3);
          g.fill();
        }
      }
    for (const st of ring2.stations) {
      const x = left2 + st.stop.x * scale, y = top2 + st.stop.y * scale, r = full ? 1.7 : 0.7;
      g.fillStyle = "#191825";
      g.beginPath();
      g.arc(x, y, r + (full ? 0.5 : 0.25), 0, TAU3);
      g.fill();
      g.fillStyle = "#f3e3bf";
      g.beginPath();
      g.arc(x, y, r, 0, TAU3);
      g.fill();
    }
    g.restore();
  }

  // src/ui/renderer.js
  var addressPinHeight = 23;
  function speech(s, x, y, viewportLeft, markers) {
    g.save();
    g.font = "bold 4px system-ui";
    g.textAlign = "center";
    const width2 = g.measureText(s).width + 5;
    const center = Math.max(viewportLeft + width2 / 2 + 1, Math.min(x, viewportLeft + game.vw - width2 / 2 - 1));
    for (const marker of markers.sort((a, b) => b.y - a.y))
      if (Math.abs(marker.x - center) < width2 / 2 + 6 && Math.abs(marker.y - y) < 11) y = marker.y - 11;
    rect(g, center - width2 / 2, y - 5, width2, 7, "#201728");
    rect(g, center - width2 / 2 + 0.45, y - 4.55, width2 - 0.9, 6.1, "#ffe7bc");
    g.fillStyle = "#ffe7bc";
    g.beginPath();
    g.moveTo(x - 1, y + 0.8);
    g.lineTo(x + 2, y + 0.8);
    g.lineTo(x, y + 3.8);
    g.fill();
    g.fillStyle = "#34202d";
    g.fillText(s, center, y + 0.1);
    g.restore();
  }
  function pin(j, x, y, small = false) {
    const r = small ? 1.35 : 3.4;
    g.fillStyle = "#191825";
    g.beginPath();
    g.arc(x, y, r + 0.55, 0, TAU);
    g.fill();
    g.fillStyle = j.color;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    if (!small) {
      g.textAlign = "center";
      label(g, j.symbol, x, y + 1.45, "#262132", 4.3);
      g.textAlign = "left";
    }
  }
  function map(left2, top2, w, h, full, origin = p) {
    rect(g, left2 - 2, top2 - 2, w + 4, h + 4, "#d3b991");
    rect(g, left2, top2, w, h, "#302d3d");
    const inset = full ? 5 : 1.5;
    const scale = Math.min((w - 2 * inset) / W, (h - 2 * inset) / H);
    const mw = W * scale, mh = H * scale;
    const x = left2 + (w - mw) / 2, y = top2 + (h - mh) / 2;
    g.save();
    for (const pk of town.parks || []) {
      const px2 = x + (X(pk.cols[0]) - CELL_W / 2) * scale;
      const py2 = y + (Y(pk.rows[0]) - CELL_H / 2) * scale;
      const pw = (pk.cols[1] - pk.cols[0] + 1) * CELL_W * scale;
      const ph = (pk.rows[1] - pk.rows[0] + 1) * CELL_H * scale;
      rect(g, px2, py2, pw, ph, "#244236");
    }
    const river3 = town.river;
    if (river3) {
      rect(g, left2, y + river3.top * scale, w, (river3.bottom - river3.top) * scale, "#2f6c7d");
      for (const isl of river3.islands) {
        rect(
          g,
          x + isl.left * scale,
          y + isl.top * scale,
          (isl.right - isl.left) * scale,
          (isl.bottom - isl.top) * scale,
          "#484354"
        );
      }
    }
    for (const [cls, width2, color] of [
      ["alley", full ? 0.55 : 0.22, "#655f70"],
      ["street", full ? 1.15 : 0.38, "#8a8390"],
      ["avenue", full ? 1.75 : 0.55, "#aba4b0"]
    ]) {
      g.beginPath();
      for (const e of town.roads.edges) {
        if (e.class !== cls) continue;
        const na = town.roadNodeById.get(e.a), nb = town.roadNodeById.get(e.b);
        g.moveTo(x + na.x * scale, y + na.y * scale);
        g.lineTo(x + nb.x * scale, y + nb.y * scale);
      }
      g.strokeStyle = color;
      g.lineWidth = width2;
      g.lineCap = "round";
      g.stroke();
    }
    for (const node of town.roads.nodes) {
      if (node.kind !== "roundabout") continue;
      const rx = x + node.x * scale, ry = y + node.y * scale;
      g.beginPath();
      g.arc(rx, ry, Math.max(full ? 2.4 : 0.9, node.outerRadius * scale), 0, TAU);
      g.fillStyle = "#b3acb8";
      g.fill();
      g.beginPath();
      g.arc(rx, ry, Math.max(full ? 1.1 : 0.4, node.radius * scale), 0, TAU);
      g.fillStyle = "#342f40";
      g.fill();
    }
    drawRingMap(x, y, scale, full);
    if (full) {
      for (const m of town.monuments) {
        if (!m.footprint?.length) continue;
        g.beginPath();
        g.moveTo(x + m.footprint[0][0] * scale, y + m.footprint[0][1] * scale);
        for (let i = 1; i < m.footprint.length; i++)
          g.lineTo(x + m.footprint[i][0] * scale, y + m.footprint[i][1] * scale);
        g.closePath();
        g.fillStyle = "#e8be7288";
        g.fill();
        g.strokeStyle = "#ffdf99cc";
        g.lineWidth = 0.55;
        g.stroke();
      }
    }
    for (const m of river3.moorings) {
      const r = full ? 1.15 : 0.47;
      rect(g, x + m.quay.x * scale - r, y + m.quay.y * scale - r, 2 * r, 2 * r, "#a1e3de");
    }
    const nav = game.ride?.domain === "water" ? null : directions(origin);
    if (nav) {
      g.beginPath();
      g.moveTo(x + origin.x * scale, y + origin.y * scale);
      for (const k of nav.path.slice(1)) g.lineTo(x + k.x * scale, y + k.y * scale);
      g.strokeStyle = "#ffe080";
      g.lineWidth = full ? 1.15 : 0.45;
      g.stroke();
    }
    for (const j of jobs) if (!done.has(j.id)) pin(j, x + j.x * scale, y + j.y * scale, !full);
    const q = goal();
    if (q) {
      g.strokeStyle = "#ffe18a";
      g.lineWidth = full ? 1 : 0.45;
      g.beginPath();
      const pulse = Math.sin(game.time * 3);
      g.arc(x + q.x * scale, y + q.y * scale, full ? 5 + pulse : 2.05 + pulse * 0.2, 0, TAU);
      g.stroke();
    }
    const px = x + origin.x * scale, py = y + origin.y * scale;
    const radius = full ? 2.5 : 1.05;
    g.beginPath();
    g.moveTo(px, py - radius);
    g.lineTo(px + radius, py);
    g.lineTo(px, py + radius);
    g.lineTo(px - radius, py);
    g.closePath();
    g.strokeStyle = "#131524";
    g.lineWidth = full ? 1.35 : 0.55;
    g.stroke();
    g.fillStyle = "#fff8e9";
    g.fill();
    g.restore();
  }
  function drawFullMap(end, origin) {
    showMapSheet(end);
    rect(g, 0, 0, game.vw, game.vh, "#151521eb");
    const area = $("#mapWindow").getBoundingClientRect();
    const unit3 = game.vw / innerWidth;
    const w = Math.min(area.width * unit3, area.height * unit3 * W / H, 235);
    const h = w * H / W;
    const x = (area.left + area.width / 2) * unit3 - w / 2;
    const y = (area.top + area.height / 2) * unit3 - h / 2;
    map(x, y, w, h, true, origin);
  }
  function districtKey(x, y) {
    const river3 = town.river;
    if (river3 && y >= river3.top && y <= river3.bottom) {
      for (const isl of river3.islands)
        if (x >= isl.left && x <= isl.right && y >= isl.top && y <= isl.bottom) return "districtIle";
      return "districtFerre";
    }
    const { col, row } = town.cellAt(x, y);
    if (row <= town.canalRow) {
      if (row <= 1 && col >= 5 && col <= 10) return "districtButte";
      if (col <= 4) return row <= 4 ? "districtArc" : "districtQuaisOuest";
      if (col <= 8) return row <= 4 ? "districtOpera" : "districtContrainte";
      if (col >= 11 && row <= 3) return "districtParcNord";
      if (col >= 14) return "districtFaubourgEst";
      return "districtMarais";
    }
    if (col <= 5) return "districtTour";
    if (col <= 10) return "districtRiveGauche";
    return "districtDocks";
  }
  function district() {
    return t(districtKey(p.x, p.y));
  }
  function draw() {
    if (interior) {
      const room = interior.room;
      const anchor = game.active ? room.exit : nextFile() ? room.desk : null;
      drawInterior(anchor && !atObjective(anchor, room) ? anchor : null);
      routeHUD(anchor, room);
      if (game.viewMap) drawFullMap(goal(), interior.returnTo);
      else $("#mapSheet").hidden = true;
      return;
    }
    const { left: ox, top: oy } = viewport(game.camX, game.camY, game.vw, game.vh, W, H);
    const cx = ox + game.vw / 2, cy = oy + game.vh / 2;
    rect(g, 0, 0, game.vw, game.vh, "#201c29");
    if (!game.artReady) {
      label(g, t("loading"), 8, game.vh / 2, "#ffc56b", 8);
      return;
    }
    streetLayer(ox, oy);
    g.save();
    g.translate(-ox, -oy);
    if (drawBoats(ox, oy)) drawBridgeDecks(ox, oy);
    for (const trail of trails) {
      g.save();
      g.translate(trail.x, trail.y);
      g.rotate(trail.a);
      g.globalAlpha = Math.min(0.45, trail.t * 0.18);
      const track = (trail.w ?? 4.8) - 1.4;
      rect(g, -5, -Math.max(0, track), 4, 0.7, "#201722");
      if (track > 1) rect(g, -5, track, 4, 0.7, "#201722");
      g.restore();
    }
    const visible = (o) => {
      const overhang = bodyExtra(o);
      return Math.abs(o.x - cx) < game.vw / 2 + 30 + overhang && Math.abs(o.y - cy) < game.vh / 2 + 28 + overhang;
    };
    for (const m of river2.moorings) if (visible(m.quay)) drawMooring(m);
    const ridingBoat = game.ride?.domain === "water";
    const speed = ridingBoat ? Math.hypot(game.ride.slideX, game.ride.slideY) : Math.abs(game.ride?.speed ?? 0);
    const end = ridingBoat ? null : goal();
    if (end && visible(end)) {
      g.save();
      g.strokeStyle = "#ffe080";
      g.lineWidth = 0.8;
      g.beginPath();
      g.ellipse(end.x, end.y + 1, end === target ? 13 : 5.5, end === target ? 7 : 2.4, 0, 0, TAU);
      g.stroke();
      g.restore();
    }
    const markers = [];
    for (const j2 of jobs) {
      if (done.has(j2.id) || !visible(j2)) continue;
      const y = j2.y - addressPinHeight + Math.sin(game.time * 3) * 0.5;
      pin(j2, j2.x, y);
      markers.push({ x: j2.x, y: j2.y - addressPinHeight - 0.5 });
    }
    const actors = cars.filter(visible).map((o) => ({ o, car: true, medical: o.medical }));
    for (const n of people) if (!n.onStretcher && visible(n)) actors.push({ o: n });
    if (ambulance) {
      if (ambulance.state === "collecting" || ambulance.state === "loading") {
        const crew = medicalCrew(ambulance);
        if (visible(crew)) actors.push({ o: crew, crew: true });
      }
    }
    if (!game.ride && !game.transit) actors.push({ o: p });
    for (const prop of visibleStreetProps(ox, oy)) actors.push({ o: prop, prop: true });
    const rails = visibleRails(ox, oy);
    for (const rail of rails) actors.push({ o: rail, rail: true });
    for (const piece of ringActors(ox, oy)) actors.push({ o: piece, rail: true });
    actors.sort((a, b) => a.o.y - b.o.y);
    for (const a of actors) {
      if (a.prop) drawStreetProp(a.o);
      else if (a.rail) a.o.draw(false);
      else if (a.medical) drawAmbulance(a.o);
      else if (a.crew) drawCrew(a.o, ambulance);
      else if (a.car) drawVehicle(a.o);
      else dude(a.o, a.o === p);
    }
    for (const rail of rails) rail.draw(true);
    drawOverheadMonuments(g, ox, oy);
    drawRingTrains(ox, oy, actors);
    drawOverTrain(ox, oy);
    if (end && !game.viewMap) {
      if (visible(end)) markers.push(arrivalMarker(end, end === target ? 12 : addressPinHeight + 4));
      if (!atObjective(end)) markers.push(drawRouteArrow(directions().path));
    }
    if (taunt && game.time < taunt.until && !taunt.speaker.down && visible(taunt.speaker)) {
      const speaker = taunt.speaker;
      const height2 = speaker.look === "flatCap" || speaker.look === "rigger" ? 15 : 18;
      speech(t(tauntLine(taunt)), speaker.x, speaker.y - height2, ox, markers);
    } else if (game.quipTime > 0) speech(t("catch"), p.x, p.y - (game.ride ? 22 : 24), ox, markers);
    for (const f of fx) {
      g.save();
      g.textAlign = "center";
      g.lineWidth = 0.8;
      g.strokeStyle = "#301b2e";
      g.font = "bold italic 5px system-ui";
      const y = f.y - (1 - f.t) * 5;
      g.strokeText(t(f.s), f.x, y);
      g.fillStyle = "#ffe16a";
      g.fillText(t(f.s), f.x, y);
      g.restore();
    }
    g.restore();
    const compact = innerWidth <= 650 || matchMedia("(pointer:coarse)").matches;
    const mw = compact ? 31 : 40, mh = mw * H / W;
    routeHUD(end);
    if (game.viewMap) {
      drawFullMap(goal(), p);
    } else {
      $("#mapSheet").hidden = true;
      if (!game.bareStreet) map(game.vw - mw - 4, game.vh - mh - (compact ? 60 : 10), mw, mh, false);
    }
    hud("#district", district() + "  /  Port-Fer");
    hud(
      "#stats",
      "\u20AC" + game.wallet + "  \xB7  " + t("health") + " " + p.hp + "/5  \xB7  " + t("heat") + " " + Math.ceil(game.heat) + "/3" + (game.ride ? (
        // The readout only wraps before the speed, never inside "7 km/h · Car 44%".
        "\u3000" + Math.round(speed * (ridingBoat ? 0.405 : 0.53)) + "\xA0" + (ridingBoat ? t("knots") : "km/h") + "\xA0\xA0\xB7\xA0\xA0" + t(ridingBoat ? game.ride.model : "vehicle") + "\xA0" + game.ride.condition + "%"
      ) : "")
    );
    const j = jobs.find((j2) => dist(j2, p) < 36);
    const nearJob = j ? t("jobKey") + " \xB7 " + t(j.name) : "";
    const nearbyBoat = !game.ride && !game.transit && !game.viewMap && nearestBoat();
    const car3 = !game.ride && !game.transit && !game.viewMap && !nearbyBoat ? nearestCar() : null;
    const station = !game.ride && !game.transit && !game.viewMap && !nearbyBoat && nearStation();
    let hint = nearJob || t("footHint");
    if (game.viewMap) hint = t("mapHint");
    else if (game.transit) hint = transitHint(t);
    else if (ridingBoat) hint = t(berthInReach() ? "boatDisembark" : "boatFindDock");
    else if (nearbyBoat) hint = t("boatEnter") + " \xB7 " + t(nearbyBoat.model);
    else if (station && (!car3 || dist(p, station.street) <= dist(p, car3)))
      hint = t("stationHint") + " \xB7 " + stationName(station);
    else if (recoveryCar()) hint = t("callRecovery") + (game.ride ? "\u3000/\u3000" + t("outHint") : "");
    else if (game.ride) hint = nearJob || t("outHint");
    else if (car3?.medical && car3.condition > 0) hint = t("medicKeys");
    else if (car3) hint = t("enterHint") + (nearJob ? "\u3000/\u3000" + nearJob : "");
    $("#reportBtn").hidden = !!game.transit || !nearbyPatient();
    hud("#hint", hint);
    $("[data-key=action]").hidden = ridingBoat;
    hud("[data-key=car]", t(ridingBoat || nearbyBoat ? "touchBoat" : "touchCar"));
    hud("[data-key=action]", t(game.ride ? "touchBrake" : "touchHit"));
  }

  // src/main.js
  var konamiProgress = 0;
  var signalButtons = document.querySelectorAll("[data-key=horn]");
  var touchRun = $("[data-key=run]");
  var controller = /* @__PURE__ */ Symbol("gamepad");
  var signalKey = /* @__PURE__ */ Symbol("signal button");
  var controllerKonami = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", back: "b", job: "a" };
  var gamepad = null;
  var previousPad = null;
  var scene = null;
  var waitForNeutral = false;
  var blockStick = false;
  var blockTriggers = false;
  function enterKonamiKey(e) {
    if (panel.open || game.viewMap) return false;
    konamiProgress = trackKonami(e, konamiProgress);
    if (konamiProgress !== -1) return false;
    konamiProgress = 0;
    game.konamiHero = !game.konamiHero;
    return true;
  }
  function updateVehicleSignal() {
    const ride = game.ride;
    const available = ride && ride.condition !== 0 && !game.viewMap && !panel.open;
    touchRun.hidden = !!available;
    for (const button of signalButtons) button.hidden = !available;
    if (!available) {
      vehicleSignalSound(null);
      return;
    }
    const label2 = t(ride.medical ? "vehicleSiren" : ride.domain === "water" ? "shipHorn" : "vehicleHorn");
    const pressed = ride.medical ? String(!!ride.sirenOn) : null;
    for (const button of signalButtons) {
      if (button.textContent !== label2) button.textContent = label2;
      if (button.getAttribute("aria-pressed") === pressed) continue;
      if (pressed === null) button.removeAttribute("aria-pressed");
      else button.setAttribute("aria-pressed", pressed);
    }
    let mode = null;
    if (!document.hidden && document.hasFocus()) {
      if (ride.medical && ride.sirenOn) mode = "siren";
      if (!ride.medical && held.has("horn")) mode = ride.domain === "water" ? "ship" : "horn";
    }
    vehicleSignalSound(mode);
  }
  function toggleMap() {
    if (panel.open) return;
    game.viewMap = !game.viewMap;
    konamiProgress = 0;
    held.clear();
    $("#mapBtn").textContent = t(game.viewMap ? "closeMap" : "map");
  }
  $("#reportBtn").onclick = reportIncident;
  $("#mapBtn").onclick = toggleMap;
  function showHelp() {
    box("help", "helpText", [["back"]]);
  }
  $("#help").onclick = showHelp;
  $("#quip").onclick = speak;
  $("#language").onclick = setLanguage;
  $("#sound").onclick = async () => {
    game.sound = !game.sound;
    try {
      localStorage.setItem("port-fer-sound", game.sound ? "on" : "off");
    } catch {
    }
    if (game.sound) await enableAudio();
    if (gameMix) gameMix.gain.setTargetAtTime(game.sound ? 0.75 : 0, game.audio.currentTime, 0.012);
    if (game.sound) beep(450);
    $("#sound").textContent = t(game.sound ? "audioOn" : "audioOff");
  };
  function startAudio() {
    if (game.sound && (!gameMix || game.audio?.state === "suspended")) enableAudio();
  }
  function press(k, source) {
    if (source !== controller) startAudio();
    if (k === "map") {
      toggleMap();
      return;
    }
    if (game.viewMap || panel.open) return;
    if (interior) {
      if (k === "job") interact();
      else if (["up", "down", "left", "right", "run"].includes(k)) held.add(k, source);
      return;
    }
    if (k === "quip") {
      speak();
      return;
    }
    if (game.transit) {
      if (k === "car") transitControl();
      return;
    }
    if (k === "horn") {
      if (!game.ride || game.ride.condition === 0) return;
      if (game.ride.medical) game.ride.sirenOn = !game.ride.sirenOn;
      else held.add(k, source);
      updateVehicleSignal();
      return;
    }
    held.add(k, source);
    if (k === "car") board();
    if (k === "job") interact();
    if (k === "report") reportIncident();
    if (k === "action" && !game.ride) slap();
  }
  var keySource = (e) => `key:${e.code || e.key?.toLowerCase()}`;
  var pointerSource = (e) => `pointer:${e.pointerId}`;
  addEventListener("keydown", (e) => {
    if (!e.ctrlKey && !e.metaKey && !e.altKey) setGamepadMode(false);
    if (panel.open) return;
    if (game.viewMap && e.target === $("#casebook") && e.key.startsWith("Arrow")) return;
    if ((e.key === " " || e.key === "Enter") && e.target.matches?.("button:focus-visible")) return;
    if (enterKonamiKey(e)) {
      e.preventDefault();
      return;
    }
    const k = control(e);
    if (!k) return;
    e.preventDefault();
    if (!e.repeat) press(k, keySource(e));
  });
  function release(k, source) {
    held.delete(k, source);
    if (k === "horn") updateVehicleSignal();
  }
  function clearInput() {
    held.clear();
    waitForNeutral = true;
    konamiProgress = 0;
    vehicleSignalSound(null);
    motorSound();
  }
  addEventListener("keyup", (e) => release(released(e), keySource(e)));
  addEventListener("blur", clearInput);
  addEventListener("pointerdown", () => setGamepadMode(false), { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInput();
  });
  for (const button of signalButtons) {
    button.onkeydown = (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) press("horn", signalKey);
    };
    button.onkeyup = (e) => {
      if (e.key === " " || e.key === "Enter") release("horn", signalKey);
    };
    button.onblur = () => release("horn", signalKey);
  }
  for (const b of document.querySelectorAll("[data-konami]:not([data-key])"))
    b.onclick = () => enterKonamiKey({ key: b.dataset.konami });
  for (const b of document.querySelectorAll("[data-key]")) {
    b.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      enterKonamiKey({ key: b.dataset.konami ?? b.dataset.key });
      press(b.dataset.key, pointerSource(e));
    };
    b.onlostpointercapture = b.onpointerup = b.onpointercancel = (e) => release(b.dataset.key, pointerSource(e));
  }
  function forgetGamepad() {
    for (const key of previousPad?.controls ?? []) release(key, controller);
    clearAnalog();
    previousPad = gamepad = null;
    blockStick = blockTriggers = false;
  }
  addEventListener("gamepaddisconnected", (e) => {
    if (e.gamepad.index !== gamepad?.index) return;
    forgetGamepad();
    setGamepadMode(false);
  });
  function inputScene() {
    return panel.open ? panel : game.viewMap ? "map" : interior || game.ride || game.transit;
  }
  function controllerDialog(pressed, step) {
    if (pressed.has("back")) {
      panel.close();
      return;
    }
    if (!step && !pressed.has("job")) return;
    const choices = [...panel.querySelectorAll("#choices button")];
    let index = choices.indexOf(document.activeElement);
    if (step) {
      index = index === -1 ? 0 : (index + step + choices.length) % choices.length;
      choices[index]?.focus();
    }
    if (pressed.has("job")) choices[Math.max(0, index)]?.click();
  }
  function updateGamepad(dt) {
    if (document.hidden || !document.hasFocus()) return;
    const pad = findGamepad(gamepad?.index);
    if (pad?.index !== gamepad?.index || pad?.id !== gamepad?.id) {
      forgetGamepad();
      if (!pad) setGamepadMode(false);
      gamepad = pad;
    }
    if (!pad) return;
    const sample = readGamepad(pad);
    if (waitForNeutral) {
      if (sample.controls.size || sample.stickActive || sample.triggersActive || sample.menuScroll) return;
      waitForNeutral = false;
    }
    const pressed = new Set(sample.controls);
    for (const key of previousPad?.controls ?? []) {
      if (sample.controls.has(key)) pressed.delete(key);
      else release(key, controller);
    }
    const before = inputScene();
    const menuStep = sample.menuStep === previousPad?.menuStep ? 0 : sample.menuStep;
    const moved = sample.stickActive && !previousPad?.stickActive || sample.triggersActive && !previousPad?.triggersActive;
    if (pressed.size || moved || before === panel && (menuStep || sample.menuScroll)) setGamepadMode(true);
    if (pressed.size || moved) startAudio();
    if (before === panel) {
      if (sample.menuScroll) panel.scrollTop += sample.menuScroll * dt * 420;
      controllerDialog(pressed, menuStep);
    } else if (pressed.has("help")) {
      showHelp();
    } else if (pressed.has("map") || game.viewMap && pressed.has("back")) {
      toggleMap();
    } else if (game.viewMap && sample.menuScroll) {
      $("#casebook").scrollTop += sample.menuScroll * dt * 420;
    } else if (game.artReady && !game.viewMap) {
      for (const key of pressed) {
        if (enterKonamiKey({ key: controllerKonami[key] || key })) continue;
        press(key === "back" ? "quip" : key, controller);
        if (inputScene() !== before) break;
      }
    }
    const after = inputScene();
    const changed = previousPad && before !== scene || after !== before;
    blockStick = sample.stickActive && (blockStick || changed);
    blockTriggers = sample.triggersActive && (blockTriggers || changed);
    const playing = after !== panel && after !== "map";
    analog.x = playing && !blockStick ? sample.x : 0;
    analog.y = playing && !blockStick ? sample.y : 0;
    analog.steering = playing && !blockStick ? sample.steering : 0;
    analog.throttle = playing && !blockTriggers ? sample.throttle : 0;
    previousPad = sample;
    scene = after;
  }
  refreshLanguage();
  say("start", 6, "clerk");
  Promise.all(
    Object.entries(imageData).map(async ([key, src]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      artwork[key] = img;
    })
  ).then(() => {
    artwork.hero = prepareHero();
    artwork.konamiHero = prepareHero(true);
    prepareTown();
    game.artReady = true;
  });
  var prev = 0;
  function loop(ms) {
    const dt = prev ? clamp((ms - prev) / 1e3, 0, 0.1) : 0;
    prev = ms;
    updateGamepad(dt);
    if (game.artReady && !panel.open && !game.viewMap) {
      const steps = Math.max(1, Math.ceil(dt * 60 - 1e-8));
      for (let step = 0; step < steps; step++) (interior ? updateInterior : update)(dt / steps);
      const aboard = !interior && transitFocus();
      if (aboard) {
        const follow = 1 - Math.exp(-dt * 4);
        game.camX += (aboard.x - game.camX) * follow;
        game.camY += (aboard.y - game.camY) * follow;
      } else if (!interior) {
        let follow = 1 - Math.exp(-dt * 6);
        game.camX += (p.x + (game.ride ? clamp(game.ride.slideX * 0.3, -60, 60) : -16 * Math.sin((p.x - X(0)) / CELL_W * TAU)) - game.camX) * follow;
        game.camY += (p.y + (game.ride ? clamp(game.ride.slideY * 0.3, -40, 40) : -9 * Math.sin((p.y - Y(0)) / CELL_H * TAU)) - game.camY) * follow;
      }
    }
    motorSound();
    updateVehicleSignal();
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
