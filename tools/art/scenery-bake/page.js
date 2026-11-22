// Recipes for tools/art/bake-scenery.mjs. Runs inside headless Chromium.
// Source coordinates are pixels of the 1500 × 1000 paintings in art-src/scenery, as measured
// in its manifest.json. Plate coordinates are 5 px per world unit, a cell being 290 × 228 units.
(() => {
  const P = 5,
    CW = 290,
    CH = 228,
    KX = 17.6,
    KY = 16.8;
  const XT = [0, CW / 2 - KX, CW / 2, CW / 2 + KX, CW],
    YT = [0, CH / 2 - KY, CH / 2, CH / 2 + KY, CH];
  // The ring deck is drawn 40 units above its pier feet (town.ring.deckLift); see src/world/viaduct.js.
  const RING_FOOT = CH / 2 - CH / 2 + (378 * (CH / 2 - KY)) / 429, // 85.64 from the cell top
    RING_DECK = RING_FOOT - 40;
  const ALLEY = 7;

  const images = {};
  let manifest = {};

  async function load(name, url) {
    if (images[name]) return images[name];
    const img = new Image();
    img.src = url || "/src/" + name + ".png";
    await img.decode();
    return (images[name] = img);
  }
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.round(w);
    c.height = Math.round(h);
    return c;
  }
  const context = (c) => c.getContext("2d", { willReadFrequently: true });

  // Piecewise-linear map through matching stop lists.
  function mapper(source, target) {
    return (v) => {
      let i = source.findIndex((stop, k) => k > 0 && v <= stop) - 1;
      if (i < 0) i = source.length - 2;
      return target[i] + ((target[i + 1] - target[i]) * (v - source[i])) / (source[i + 1] - source[i]);
    };
  }
  // Draw `image` so that its source stops land on the target stops (world units from the plate's corner).
  function register(image, xs, ys, xt, yt) {
    const c = canvas(xt.at(-1) * P, yt.at(-1) * P),
      ctx = context(c);
    for (let j = 0; j < ys.length - 1; j++)
      for (let i = 0; i < xs.length - 1; i++) {
        const [x, x2] = xt.slice(i, i + 2).map((n) => Math.round(n * P));
        const [y, y2] = yt.slice(j, j + 2).map((n) => Math.round(n * P));
        ctx.drawImage(image, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j], x, y, x2 - x, y2 - y);
      }
    return c;
  }

  // Lift the pale paint of the artist's lane dashes; the game paints its own. `range` limits the
  // pass to the part of the road that exists (plate units along the road).
  function clearMarkings(plate, across, mark, reach, exclude, range) {
    const ctx = context(plate),
      w = plate.width,
      h = plate.height;
    const band = Math.round(reach * P),
      mid = Math.round(mark * P);
    const span = across ? w : h;
    const x = across ? 0 : mid - band,
      y = across ? mid - band : 0;
    const bw = across ? w : band * 2 + 1,
      bh = across ? band * 2 + 1 : h;
    const slice = ctx.getImageData(x, y, bw, bh),
      pixels = slice.data;
    const index = (u, v) => (across ? v * bw + u : u * bw + v) * 4;
    const from = range ? Math.round(range[0] * P) : 0,
      to = range ? Math.round(range[1] * P) : span;
    for (let u = from; u < to; u++) {
      if (Math.abs(u - span / 2) < exclude * P) continue;
      const a = index(u, 0),
        b = index(u, band * 2);
      for (let v = 1; v < band * 2; v++) {
        const d = index(u, v),
          weight = 1 - Math.abs(v - band) / band;
        const paint = Math.min(1, Math.max(0, (pixels[d + 1] - 69) / 27));
        for (let k = 0; k < 3; k++) {
          const asphalt = pixels[a + k] + ((pixels[b + k] - pixels[a + k]) * v) / (band * 2);
          pixels[d + k] += (asphalt - pixels[d + k]) * paint * Math.min(1, weight * 3);
        }
      }
    }
    ctx.putImageData(slice, x, y);
  }

  // One night palette. The first four paintings set it: asphalt near luma 57, facades below the
  // pastel range. `pivot` pins the asphalt while `gamma` moves everything brighter than it.
  const grades = {
    district: { gamma: 1.13, pivot: 0.22, saturation: 1.03 },
    ring: { gamma: 0.89, pivot: 0, saturation: 0.93 },
    river: { gamma: 0.94, pivot: 0, saturation: 0.94 },
    alley: { gamma: 1, pivot: 0, saturation: 0.97 },
  };
  function grade(c, name) {
    const { gamma, pivot, saturation } = grades[name];
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const t = v / 255;
      lut[v] = Math.round(255 * (t <= pivot ? t : pivot + (1 - pivot) * ((t - pivot) / (1 - pivot)) ** gamma));
    }
    const ctx = context(c),
      data = ctx.getImageData(0, 0, c.width, c.height),
      d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = lut[d[i]],
        g = lut[d[i + 1]],
        b = lut[d[i + 2]];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      d[i] = l + (r - l) * saturation;
      d[i + 1] = l + (g - l) * saturation;
      d[i + 2] = l + (b - l) * saturation;
    }
    ctx.putImageData(data, 0, 0);
    return c;
  }

  const entry = (key) => manifest[key];
  const kerbStops = (key) => {
    const { kerbs } = entry(key);
    return { xs: [0, ...kerbs.x, 1500], ys: [0, ...kerbs.y, 1000] };
  };
  // Source pixel -> plate pixel for a painting registered on its kerbs.
  function plateMap(key, ringRow = false) {
    const { xs, ys } = ringRow ? ringStops(key) : kerbStops(key);
    const mx = mapper(xs, XT),
      my = mapper(ys, ringRow ? RING_YT : YT);
    return { x: (v) => mx(v) * P, y: (v) => my(v) * P };
  }
  const RING_YT = [0, RING_DECK, RING_FOOT, ...YT.slice(1)];
  function ringStops(key) {
    const { xs, ys } = kerbStops(key);
    // Railheads at y 182 and pier feet at y 378 in every horizontal ring painting.
    return { xs, ys: [0, 182, 378, ...ys.slice(1)] };
  }

  async function districtPlate(key, { arms = "nesw", markings = true } = {}) {
    const { xs, ys } = kerbStops(key);
    const plate = register(await load(key), xs, ys, XT, YT);
    if (markings) {
      clearMarkings(plate, true, CH / 2, 2.4, 41, [arms.includes("w") ? 0 : CW / 2, arms.includes("e") ? CW : CW / 2]);
      clearMarkings(plate, false, CW / 2, 2.45, 35, [arms.includes("n") ? 0 : CH / 2, arms.includes("s") ? CH : CH / 2]);
    }
    return plate;
  }
  async function ringPlate(key) {
    const { xs, ys } = ringStops(key);
    const plate = register(await load(key), xs, ys, XT, RING_YT);
    clearMarkings(plate, true, CH / 2, 2.4, 41);
    clearMarkings(plate, false, CW / 2, 2.45, 35);
    return plate;
  }

  // Paste a rectangle of one plate into another with soft vertical edges.
  function paste(target, source, sx, sy, w, h, dx, dy, feather = 6) {
    const piece = canvas(w, h),
      ctx = piece.getContext("2d");
    ctx.drawImage(source, sx, sy, w, h, 0, 0, w, h);
    if (feather) {
      const mask = ctx.createLinearGradient(0, 0, w, 0);
      mask.addColorStop(0, "#0000");
      mask.addColorStop(feather / w, "#000");
      mask.addColorStop(1 - feather / w, "#000");
      mask.addColorStop(1, "#0000");
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, w, h);
    }
    target.getContext("2d").drawImage(piece, dx, dy);
  }

  const recipes = {};
  const districts = {
    haussmann: {},
    haussmannCafe: {},
    boulevard: {},
    starArch: {},
    obeliskSquare: {},
    towerBase: {},
    opera: {},
    basilica: {},
    palaisJustice: {},
    park: {},
    marketHall: {},
    teeNorth: { arms: "esw" },
  };
  for (const [key, options] of Object.entries(districts))
    recipes[key] = async () => grade(await districtPlate(key, options), "district");

  // Four alley arms. The lane between the gutters becomes the 14-unit ruelle of the road graph.
  recipes.alleyCross = async () => {
    const { xs, ys } = kerbStops("alleyCross");
    const plate = register(
      await load("alleyCross"),
      xs,
      ys,
      [0, CW / 2 - ALLEY, CW / 2, CW / 2 + ALLEY, CW],
      [0, CH / 2 - ALLEY, CH / 2, CH / 2 + ALLEY, CH],
    );
    return grade(plate, "alley");
  };
  // Seam strips at their painted scale, lane centred.
  recipes.alleyStripV = async () => {
    const [left, centre, right] = entry("alleyStripV").kerbs.x;
    const side = (left * CW) / 1500,
      far = ((200 - right) * CW) / 1500;
    const strip = register(
      await load("alleyStripV"),
      [0, left, centre, right, 200],
      [0, 1000],
      [0, side, side + ALLEY, side + 2 * ALLEY, side + 2 * ALLEY + far],
      [0, CH],
    );
    return grade(strip, "alley");
  };
  recipes.alleyStripH = async () => {
    const [top, centre, bottom] = entry("alleyStripH").kerbs.y;
    const side = (top * CH) / 1000,
      far = ((200 - bottom) * CH) / 1000;
    const strip = register(
      await load("alleyStripH"),
      [0, 1500],
      [0, top, centre, bottom, 200],
      [0, CW],
      [0, side, side + ALLEY, side + 2 * ALLEY, side + 2 * ALLEY + far],
    );
    return grade(strip, "alley");
  };

  // Horizontal ring viaduct. Railheads and pier feet land on town.ring (deck 40 above the feet).
  recipes.ringNorth = async () => grade(await ringPlate("ringNorth"), "ring");
  // The straight halves of the two northern corner paintings make a second through-span.
  recipes.ringNorthB = async () => {
    const west = await ringPlate("ringCornerNE"),
      east = await ringPlate("ringCornerNW");
    const half = (CW / 2) * P;
    paste(west, east, half - 8, 0, half + 8, CH * P, half - 8, 0, 8);
    west.getContext("2d").drawImage(east, half, 0, half, CH * P, half, 0, half, CH * P);
    return grade(west, "ring");
  };
  // The station stands east of the cross street, platform centred on the ring stop at +88.
  async function stationOn(baseKey) {
    const base = await recipes[baseKey].ungraded();
    const station = await ringPlate("ringStationNorth");
    const from = plateMap("ringStationNorth", true);
    const left = Math.round(from.x(150)),
      right = Math.round(from.x(655)),
      bottom = Math.round(from.y(402));
    const platform = from.x(entry("ringStationNorth").rail.platformCentre[0]);
    const dx = Math.round((CW / 2 + 88) * P - platform);
    paste(base, station, left, 0, right - left, bottom, left + dx, 0, 7);
    return grade(base, "ring");
  }
  recipes.ringNorth.ungraded = () => ringPlate("ringNorth");
  recipes.ringNorthB.ungraded = async () => {
    const west = await ringPlate("ringCornerNE"),
      east = await ringPlate("ringCornerNW");
    const half = (CW / 2) * P;
    paste(west, east, half - 8, 0, half + 8, CH * P, half - 8, 0, 8);
    west.getContext("2d").drawImage(east, half, 0, half, CH * P, half, 0, half, CH * P);
    return west;
  };
  recipes.ringStation = () => stationOn("ringNorth");
  recipes.ringStationB = () => stationOn("ringNorthB");


  // ---------------------------------------------------------------------------------------
  // La Ferre. The paintings show a river one cell deep; the published river (town.river) is
  // 372 units from bank to bank with a 156-unit island. Banks, bridge ends, island edges, trees,
  // lamps and the cathedral keep their painted scale. Only open water, bridge mid-spans, island
  // asphalt and bare paving are lengthened. A river plate runs from the south kerb of Quai Nord
  // (a band of clean quay setts, then the painted cap 27 units south of the centre line) to
  // the Quai Sud kerb.
  const RIVER_TOP = -211, // plate top, world units from the river row's centre line
    RIVER_H = 422.2;
  const ry = (u) => Math.round((u - RIVER_TOP) * P);
  const BANK_N = ry(-201), // the north quay cap (source row 150)
    WATER_N = ry(-186), // north water edge (source row 225)
    WATER_S = ry(186), // 1935: south water edge (source row 813)
    ISLE_N = ry(-78),
    ISLE_S = ry(78),
    KERB_N = ry(-KY),
    KERB_S = ry(KY),
    PLATE_H = Math.round(RIVER_H * P);

  // Lift bright paint within `reach` pixels of a line, like clearMarkings but in pixels.
  function liftDashes(c, across, centre, reach, from, to) {
    const ctx = context(c);
    const x = across ? from : centre - reach,
      y = across ? centre - reach : from;
    const w = across ? to - from : 2 * reach + 1,
      h = across ? 2 * reach + 1 : to - from;
    const slice = ctx.getImageData(x, y, w, h),
      d = slice.data;
    const index = (u, v) => (across ? v * w + u : u * w + v) * 4;
    for (let u = 0; u < to - from; u++) {
      const a = index(u, 0),
        b = index(u, 2 * reach);
      for (let v = 1; v < 2 * reach; v++) {
        const k = index(u, v);
        const paint = Math.min(1, Math.max(0, (d[k + 1] - 69) / 27));
        for (let ch = 0; ch < 3; ch++)
          d[k + ch] += (d[a + ch] + ((d[b + ch] - d[a + ch]) * v) / (2 * reach) - d[k + ch]) * paint;
      }
    }
    ctx.putImageData(slice, x, y);
  }

  // Register a river painting across its width only; rows stay in source pixels.
  async function riverSource(key, xs, xt) {
    const image = await load(key);
    xs ||= entry(key).kind === "river" || key === "islandCathedral" ? [0, 1500] : kerbStops(key).xs;
    xt ||= xs.length === 2 ? [0, CW] : XT;
    const c = register(image, xs, [0, 1000], xt, [0, 1000 / P]);
    return { c, x: (v) => Math.round(mapper(xs, xt)(v) * P) };
  }
  // Copy source rows [sy0, sy1) of columns [x0, x1) to plate rows [dy0, dy1).
  function rows(target, source, sy0, sy1, dy0, dy1, x0 = 0, x1 = source.width) {
    target.getContext("2d").drawImage(source, x0, sy0, x1 - x0, sy1 - sy0, x0, dy0, x1 - x0, dy1 - dy0);
  }
  // Repeat source rows down the plate; `mirror` flips alternate copies so any texture joins.
  function repeatRows(target, source, sy0, sy1, dy0, dy1, { x0 = 0, x1 = source.width, mirror = false } = {}) {
    const ctx = target.getContext("2d"),
      h = sy1 - sy0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, dy0, x1 - x0, dy1 - dy0);
    ctx.clip();
    for (let y = dy0, i = 0; y < dy1; y += h, i++) {
      if (mirror && i % 2) {
        ctx.save();
        ctx.translate(0, y + h);
        ctx.scale(1, -1);
        ctx.drawImage(source, x0, sy0, x1 - x0, h, x0, 0, x1 - x0, h);
        ctx.restore();
      } else ctx.drawImage(source, x0, sy0, x1 - x0, h, x0, y, x1 - x0, h);
    }
    ctx.restore();
  }
  // Draw `draw(ctx)` through a polygon given in plate pixels, grown by `grow` and softened.
  function throughPolygon(target, polygon, draw, { grow = 0, inset = 0, soften = 0 } = {}) {
    const layer = canvas(target.width, target.height),
      ctx = layer.getContext("2d");
    draw(ctx);
    const mask = canvas(target.width, target.height),
      m = mask.getContext("2d");
    if (soften) m.filter = "blur(" + soften + "px)";
    const shape = canvas(target.width, target.height),
      s = shape.getContext("2d");
    s.beginPath();
    for (const [x, y] of polygon) s.lineTo(x, y);
    s.closePath();
    s.fill();
    s.lineJoin = "round";
    if (grow) {
      s.lineWidth = 2 * grow;
      s.stroke();
    }
    if (inset) {
      s.globalCompositeOperation = "destination-out";
      s.lineWidth = 2 * inset;
      s.stroke();
    }
    m.drawImage(shape, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    target.getContext("2d").drawImage(layer, 0, 0);
  }

  let waterLayer;
  // Open water for every river plate: lamp reflections off the north quay, then deep water.
  async function water() {
    if (waterLayer) return waterLayer;
    const { c } = await riverSource("river");
    const plate = canvas(CW * P, PLATE_H);
    rows(plate, c, 226, 600, WATER_N, WATER_N + 748);
    // Rows 612-736 carry no reflection of either bank.
    repeatRows(plate, c, 612, 736, WATER_N + 748, WATER_S - 76, { mirror: true });
    rows(plate, c, 736, 812, WATER_S - 76, WATER_S);
    return (waterLayer = plate);
  }
  // Both banks at their painted scale. The upper north walk is the Quai Nord pavement of the
  // district painting; the south promenade ends at the Quai Sud kerb.
  function banks(plate, c, key, tile, road) {
    // Quai Nord's south pavement, in the setts of the quays; a bridge's road runs through it.
    const ctx = plate.getContext("2d");
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fillRect(0, 0, plate.width, BANK_N);
    if (road) rows(plate, c, 150 - BANK_N, 150, 0, BANK_N, road[0], road[1]);
    rows(plate, c, 150, 232, BANK_N, BANK_N + 82);
    const lamps = entry(key).bankForeground?.southLamps;
    const end = Math.min(999, Math.max(939, (lamps?.footY ?? 0) + 8));
    rows(plate, c, 735, 865, WATER_S - 78, WATER_S + 52);
    rows(plate, c, 865, end, WATER_S + 52, PLATE_H);
  }
  function finishRiver(plate) {
    return grade(plate, "river");
  }

  recipes.river = async () => {
    const { c } = await riverSource("river");
    const plate = canvas(CW * P, PLATE_H);
    rows(plate, await water(), 0, PLATE_H, 0, PLATE_H);
    banks(plate, c, "river", await paving());
    return finishRiver(plate);
  };

  // A road bridge: both painted ends rigid, the mid-span repeated between them.
  async function bridge(key, { northEnd, southStart, deck }) {
    const { c, x } = await riverSource(key);
    liftDashes(c, false, x(entry(key).kerbs.x[1]), 12, 0, 1000);
    const plate = canvas(CW * P, PLATE_H);
    rows(plate, await water(), 0, PLATE_H, 0, PLATE_H);
    banks(plate, c, key, await paving(), [x(636), x(874)]);
    const outline = Object.values(entry(key).outlineEnvelopes)[0];
    const north = (y) => y - 225 + WATER_N,
      south = (y) => y - 813 + WATER_S;
    throughPolygon(
      plate,
      outline.map(([px, py]) => [x(px), north(py)]),
      (ctx) => ctx.drawImage(c, 0, 232, c.width, northEnd - 232, 0, north(232), c.width, northEnd - 232),
      { grow: 5 },
    );
    throughPolygon(
      plate,
      outline.map(([px, py]) => [x(px), south(py)]),
      (ctx) => ctx.drawImage(c, 0, southStart, c.width, 735 - southStart, 0, south(southStart), c.width, 735 - southStart),
      { grow: 5 },
    );
    repeatRows(plate, c, deck[2], deck[3], north(northEnd), south(southStart), { x0: x(deck[0]), x1: x(deck[1]) });
    return finishRiver(plate);
  }
  recipes.riverBridge = () => bridge("riverBridge", { northEnd: 340, southStart: 500, deck: [566, 954, 350, 490] });
  recipes.riverIronBridge = () => bridge("riverIronBridge", { northEnd: 345, southStart: 590, deck: [598, 908, 352, 582] });

  // Île de la Ferre. Edge bands (walls, trees, lamps, the cathedral) are rigid; the street is
  // widened to the road graph's 33.6 units and the aprons are paved from a clean sample.
  const ISLAND = { top: 380, bottom: 655, street: [469.5, 529.5] };
  let pavingSample;
  async function paving() {
    if (pavingSample) return pavingSample;
    const { c } = await riverSource("islandWest", [0, 1500], [0, CW]);
    const tile = canvas(2 * 400, 2 * 64),
      ctx = tile.getContext("2d");
    for (const [i, j] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      ctx.save();
      ctx.translate(i ? 800 : 0, j ? 128 : 0);
      ctx.scale(i ? -1 : 1, j ? -1 : 1);
      ctx.drawImage(c, Math.round((196 * CW * P) / 1500), 438, 400, 64, 0, 0, 400, 64);
      ctx.restore();
    }
    return (pavingSample = tile);
  }
  // `nose`: "west" | "east" | null. `road`: source columns of the through road, if any.
  async function island(key, { nose, xs, xt, road, cathedral }) {
    const { c, x } = await riverSource(key, xs, xt);
    const mid = Math.round((ISLAND.street[0] + ISLAND.street[1]) / 2);
    const streetCols = nose === "west" ? [x(road[1]), c.width] : nose === "east" ? [0, x(road[0])] : [0, c.width];
    liftDashes(c, true, mid, 9, streetCols[0], streetCols[1]);
    if (road) liftDashes(c, false, x(entry(key).kerbs.x[1]), 12, 0, 1000);
    const plate = canvas(CW * P, PLATE_H);
    rows(plate, await water(), 0, PLATE_H, 0, PLATE_H);
    banks(plate, c, key, await paving(), road && [x(road[0]), x(road[1])]);

    const nTop = 300,
      nEnd = 458,
      sStart = 545,
      sNose = 505,
      sEnd = 690;
    const yN = (y) => y - ISLAND.top + ISLE_N, // rigid north band
      yS = (y) => y - ISLAND.bottom + ISLE_S; // rigid south band
    const scale = (KERB_S - KERB_N) / (ISLAND.street[1] - ISLAND.street[0]);
    const yM = (y) => Math.round(KERB_N + (y - ISLAND.street[0]) * scale); // widened street band
    const mTop = 463,
      mEnd = 535;

    // Bridge decks over both channels.
    if (road) {
      const [r0, r1] = [x(road[0]), x(road[1])];
      repeatRows(plate, c, 244, 300, BANK_N + 82, yN(nTop), { x0: r0, x1: r1 });
      repeatRows(plate, c, sEnd, 735, yS(sEnd), WATER_S - 78, { x0: r0, x1: r1 });
    }
    // Columns with the island street (and the through road).
    const [m0, m1] = road ? (nose === "west" ? [x(road[0]), c.width] : [0, x(road[1])]) : [0, c.width];
    // The southern trees reach up over the street in the painting. Their crowns are lifted off
    // the painted kerb and asphalt row by row and set back on the trunks in the rigid band.
    const crowns = [];
    for (const [tx, ty] of entry(key).islandTreeFeet || []) {
      const cx = x(tx);
      if (ty < 560 || cx < m0 + 60 || cx > m1 - 60) continue;
      const half = 58,
        top = 498,
        h = sStart + 3 - top;
      const ctx = context(c);
      const crown = ctx.getImageData(cx - half, top, 2 * half, h),
        d = crown.data;
      const left = ctx.getImageData(cx - half - 34, top, 30, h).data,
        right = ctx.getImageData(cx + half + 4, top, 30, h).data;
      for (let j = 0; j < h; j++) {
        const back = [0, 0, 0];
        for (let i = 0; i < 30; i++)
          for (let k = 0; k < 3; k++) back[k] += (left[(j * 30 + i) * 4 + k] + right[(j * 30 + i) * 4 + k]) / 60;
        for (let i = 0; i < 2 * half; i++) {
          const o = (j * 2 * half + i) * 4;
          const away = Math.max(Math.abs(d[o] - back[0]), Math.abs(d[o + 1] - back[1]), Math.abs(d[o + 2] - back[2]));
          const inside = ((i - half) / 50) ** 2 + ((j - h) / 40) ** 2 < 1;
          d[o + 3] = inside && away > 42 ? 255 : 0;
        }
      }
      const sprite = canvas(2 * half, h);
      sprite.getContext("2d").putImageData(crown, 0, 0);
      crowns.push([sprite, cx - half, yS(top)]);
      // Leave bare kerb and asphalt where the crown was, so the widened street stays clean.
      const bare = ctx.getImageData(cx - half, top, 2 * half, h),
        b = bare.data;
      for (let j = 0; j < h; j++)
        for (let i = 0; i < 2 * half; i++) {
          const o = (j * 2 * half + i) * 4;
          if (!d[o + 3]) continue;
          const from = (j * 30 + (i % 30)) * 4;
          for (let k = 0; k < 3; k++) b[o + k] = i < half ? left[from + k] : right[from + k];
        }
      ctx.putImageData(bare, cx - half, top);
    }
    rows(plate, c, nTop, nEnd, yN(nTop), yN(nEnd), m0, m1);
    rows(plate, c, nEnd, mTop, yN(nEnd), yM(mTop), m0, m1);
    rows(plate, c, mTop, mEnd, yM(mTop), yM(mEnd), m0, m1);
    rows(plate, c, mEnd, sStart, yM(mEnd), yS(sStart), m0, m1);
    // The through road keeps its grain across both aprons: its own asphalt, repeated.
    if (road) {
      const [r0, r1] = [x(road[0]), x(road[1])];
      repeatRows(plate, c, 396, 440, yN(nEnd), yM(mTop), { x0: r0, x1: r1, mirror: true });
      repeatRows(plate, c, 552, 600, yM(mEnd), yS(sStart), { x0: r0, x1: r1, mirror: true });
    }
    rows(plate, c, sStart, sEnd, yS(sStart), yS(sEnd), m0, m1);
    // The pointed end: its wall follows the painted curve, drawn out between the rigid bands.
    if (nose) {
      const [n0, n1] = nose === "west" ? [0, x(road[0])] : [x(road[1]), c.width];
      rows(plate, c, nTop, nEnd, yN(nTop), yN(nEnd), n0, n1);
      rows(plate, c, nEnd, sNose, yN(nEnd), yS(sNose), n0, n1);
      rows(plate, c, sNose, sEnd, yS(sNose), yS(sEnd), n0, n1);
    }
    // Aprons: clean setts inside the quay wall, outside the rigid bands, street and road.
    const yNose = mapper([0, nEnd, sNose, 1000], [yN(0), yN(nEnd), yS(sNose), yS(1000)]);
    // The outline runs on into the neighbouring island plates; only real quay walls are inset.
    const outline = entry(key).islandOutline.map(([px, py]) => [px <= 0 ? -200 : px >= 1499 ? c.width + 200 : x(px), yNose(py)]);
    const tile = await paving();
    const fade = 14;
    throughPolygon(
      plate,
      outline,
      (ctx) => {
        ctx.fillStyle = ctx.createPattern(tile, "repeat");
        const band = (x0, x1, y0, y1) => {
          if (x1 <= x0 || y1 <= y0) return;
          const part = canvas(x1 - x0, y1 - y0),
            p = part.getContext("2d");
          p.fillStyle = p.createPattern(tile, "repeat");
          p.translate(-x0, -y0);
          p.fillRect(x0, y0, x1 - x0, y1 - y0);
          p.setTransform(1, 0, 0, 1, 0, 0);
          const g = p.createLinearGradient(0, 0, 0, y1 - y0);
          g.addColorStop(0, "#0000");
          g.addColorStop(fade / (y1 - y0), "#000");
          g.addColorStop(1 - fade / (y1 - y0), "#000");
          g.addColorStop(1, "#0000");
          p.globalCompositeOperation = "destination-in";
          p.fillStyle = g;
          p.fillRect(0, 0, x1 - x0, y1 - y0);
          ctx.drawImage(part, x0, y0);
        };
        const cols = road
          ? nose === "west"
            ? { nose: [0, x(road[0]) - 4], street: [x(road[1]) + 4, c.width] }
            : { nose: [x(road[1]) + 4, c.width], street: [0, x(road[0]) - 4] }
          : { street: [0, c.width] };
        band(...cols.street, yN(nEnd) - fade, yM(mTop) + fade);
        band(...cols.street, yM(mEnd) - fade, yS(sStart) + fade);
        if (cols.nose) band(...cols.nose, yN(nEnd) - fade, yS(sNose) + fade);
      },
      { inset: 30, soften: 3 },
    );
    for (const [sprite, sx, sy] of crowns) plate.getContext("2d").drawImage(sprite, sx, sy);
    if (cathedral) {
      const shape = entry(key).outlineEnvelopes["cathedral outline"].map(([px, py]) => [x(px), yN(py)]);
      throughPolygon(plate, shape, (ctx) => ctx.drawImage(c, 0, 0, c.width, nTop + 2, 0, yN(0), c.width, nTop + 2), {
        grow: 3,
      });
    }
    return finishRiver(plate);
  }
  const noseAt = 145 - 108; // the island ends 108 units beyond its bridge centre lines
  recipes.islandWest = () =>
    island("islandWest", {
      nose: "west",
      xs: [0, 82, 666, 752, 839, 1500],
      xt: [0, noseAt, ...XT.slice(1)],
      road: [636, 866],
    });
  recipes.islandEast = () =>
    island("islandEast", {
      nose: "east",
      xs: [0, 665, 754, 843, 1398, 1500],
      xt: [...XT.slice(0, 4), CW - noseAt, CW],
      road: [636, 872],
    });
  recipes.islandCathedral = () => island("islandCathedral", { cathedral: true });


  // ---------------------------------------------------------------------------------------
  // Pieces lifted out of paintings to stand where the published geometry needs them.
  const SX = (CW * P) / 1500, // source pixel -> plate pixel away from the kerb stops
    SY = (CH * P) / 1000;
  // Cut polygons (source pixels) out of a painting onto a transparent sprite covering `box`.
  async function cutOut(key, box, polygons, gradeName, alpha) {
    const image = await load(key);
    const [x0, y0, x1, y1] = box;
    const c = canvas((x1 - x0) * SX, (y1 - y0) * SY),
      ctx = context(c);
    ctx.save();
    ctx.scale(SX, SY);
    ctx.translate(-x0, -y0);
    ctx.beginPath();
    for (const polygon of polygons) {
      ctx.moveTo(...polygon[0]);
      for (const point of polygon.slice(1)) ctx.lineTo(...point);
      ctx.closePath();
    }
    ctx.clip();
    ctx.drawImage(image, 0, 0);
    ctx.restore();
    grade(c, gradeName);
    if (alpha) {
      const data = ctx.getImageData(0, 0, c.width, c.height),
        d = data.data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) d[i + 3] = Math.round(d[i + 3] * alpha(d[i], d[i + 1], d[i + 2]));
      ctx.putImageData(data, 0, 0);
    }
    return c;
  }
  const box = (x0, y0, x1, y1) => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];

  // The deck seen from above, from the east-side straight. Doubled head to tail so it repeats.
  recipes.ringDeck = async () => {
    const image = await load("ringEast");
    const x0 = 1026,
      w = 72,
      y0 = 120,
      h = 208;
    const c = canvas(w * SX, 2 * h * SY),
      ctx = c.getContext("2d");
    ctx.drawImage(image, x0, y0, w, h, 0, 0, c.width, c.height / 2);
    ctx.translate(0, c.height);
    ctx.scale(1, -1);
    ctx.drawImage(image, x0, y0, w, h, 0, 0, c.width, c.height / 2);
    return grade(c, "ring");
  };
  // East side: the iron portal that carries the deck over a cross street. Feet at y 606.
  recipes.ringPortal = () =>
    cutOut(
      "ringEast",
      [996, 388, 1128, 608],
      [
        box(1006, 390, 1036, 412),
        box(1086, 390, 1121, 412),
        box(1002, 410, 1126, 431),
        [
          [1004, 431],
          [1037, 431],
          [1037, 577],
          [1041, 579],
          [1041, 607],
          [997, 607],
          [997, 579],
          [1004, 575],
          [1013, 552],
          [1013, 458],
        ],
        [
          [1086, 431],
          [1124, 431],
          [1112, 458],
          [1112, 552],
          [1120, 575],
          [1126, 579],
          [1126, 607],
          [1084, 607],
          [1084, 579],
          [1086, 577],
        ],
      ],
      "ring",
    );
  // West side: a cantilever bracket and its masonry foot. Foot at y 386, deck edge at x 474.
  recipes.ringBracket = () =>
    cutOut(
      "ringWest",
      [474, 190, 598, 388],
      [
        [
          [474, 191],
          [597, 191],
          [597, 206],
          [591, 222],
          [585, 243],
          [585, 338],
          [591, 342],
          [598, 387],
          [530, 387],
          [538, 342],
          [545, 338],
          [545, 262],
          [537, 246],
          [520, 233],
          [497, 229],
          [474, 233],
        ],
      ],
      "ring",
    );
  // Glazed platform canopies either side of the track. Platform centre at (440, 744).
  recipes.ringCanopies = async () => {
    const shapes = entry("ringStationWest").outlineEnvelopes;
    return cutOut("ringStationWest", [356, 548, 550, 932], [shapes["west glazed canopy"], shapes["east glazed canopy"]], "ring");
  };
  // The rail bridge over la Ferre: track bed and side trusses, and the cross-braces that pass
  // over a train. One clear mid-river bay, doubled so it repeats from bank to bank.
  async function railTruss(top) {
    const image = await load("riverRailBridge");
    const x0 = 394,
      w = 96,
      y0 = 430,
      h = 200;
    const c = canvas(w * SX, 2 * h * SY),
      ctx = context(c);
    ctx.drawImage(image, x0, y0, w, h, 0, 0, c.width, c.height / 2);
    ctx.translate(0, c.height);
    ctx.scale(1, -1);
    ctx.drawImage(image, x0, y0, w, h, 0, 0, c.width, c.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    grade(c, "river");
    if (top) {
      // Olive iron only: the bed and rails stay under the train.
      const data = ctx.getImageData(0, 0, c.width, c.height),
        d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const iron = d[i + 1] > d[i] * 0.86 && d[i + 1] > d[i + 2] * 1.12 && d[i + 1] > 60;
        d[i + 3] = iron ? 255 : 0;
      }
      ctx.putImageData(data, 0, 0);
      const soft = canvas(c.width, c.height),
        s = soft.getContext("2d");
      s.filter = "blur(0.6px)";
      s.drawImage(c, 0, 0);
      s.filter = "none";
      s.drawImage(c, 0, 0);
      return soft;
    }
    return c;
  }
  recipes.railBridgeBed = () => railTruss(false);
  recipes.railBridgeTop = () => railTruss(true);

  // Tour de Fer ironwork above street level. The dark hollows of the lattice are thinned so a
  // walker or a car passing beneath shows between the iron ribbons.
  recipes.towerIron = async () => {
    const m = plateMap("towerBase");
    const image = await districtPlate("towerBase", { markings: false });
    // Near leg, then the platform underside with the rear leg: the side arch between the two
    // legs and the rear arch over the road stay open.
    const legWest = [
      [197, 0],
      [290, 0],
      [320, 50],
      [340, 110],
      [362, 187],
      [380, 247],
      [397, 340],
      [428, 434],
      [454, 520],
      [480, 600],
      [502, 654],
      [352, 654],
      [374, 600],
      [369, 520],
      [349, 434],
      [337, 340],
      [323, 247],
      [293, 187],
      [263, 110],
      [230, 50],
    ];
    const deckWest = [
      [290, 0],
      [750, 0],
      [750, 49],
      [727, 50],
      [653, 57],
      [613, 68],
      [580, 83],
      [547, 110],
      [527, 157],
      [523, 187],
      [530, 247],
      [540, 300],
      [545, 314],
      [468, 314],
      [477, 247],
      [463, 187],
      [443, 133],
      [433, 110],
      [420, 97],
      [387, 113],
      [367, 147],
      [362, 187],
      [340, 110],
      [320, 50],
    ];
    const mirror = (polygon) => polygon.map(([px, py]) => [1500 - px, py]);
    const lamp = box(722, 0, 778, 100);
    const bottom = Math.round(m.y(656));
    const c = canvas(CW * P, bottom),
      ctx = context(c);
    ctx.beginPath();
    for (const polygon of [legWest, mirror(legWest), deckWest, mirror(deckWest), lamp]) {
      ctx.moveTo(m.x(polygon[0][0]), m.y(polygon[0][1]));
      for (const [px, py] of polygon.slice(1)) ctx.lineTo(m.x(px), m.y(py));
      ctx.closePath();
    }
    ctx.clip();
    ctx.drawImage(image, 0, 0);
    grade(c, "district");
    const data = ctx.getImageData(0, 0, c.width, c.height),
      d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const light = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const solid = Math.min(1, Math.max(0, (light - 38) / 46));
      d[i + 3] = Math.round(d[i + 3] * (0.3 + 0.7 * solid));
    }
    ctx.putImageData(data, 0, 0);
    return c;
  };

  // A plain roundabout from Place de la Contrainte: the obelisk comes off its plinth and one of
  // the square's own three-lantern standards takes its place.
  recipes.rondPoint = async () => {
    const plate = await districtPlate("obeliskSquare");
    const m = plateMap("obeliskSquare");
    const ctx = context(plate);
    const left = Math.round(m.x(724)),
      right = Math.round(m.x(776)),
      top = Math.round(m.y(246)),
      bottom = Math.round(m.y(472));
    const w = right - left;
    // Asphalt and planting from just west of the shaft, turned about its edge.
    const patch = canvas(w, bottom - top),
      pc = patch.getContext("2d");
    pc.translate(w, 0);
    pc.scale(-1, 1);
    pc.drawImage(plate, left - w, top, w, bottom - top, 0, 0, w, bottom - top);
    pc.setTransform(1, 0, 0, 1, 0, 0);
    const fade = pc.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, "#000");
    fade.addColorStop(0.72, "#000");
    fade.addColorStop(1, "#0000");
    pc.globalCompositeOperation = "destination-in";
    pc.fillStyle = fade;
    pc.fillRect(0, 0, w, bottom - top);
    const east = canvas(w, bottom - top),
      ec = east.getContext("2d");
    ec.translate(w, 0);
    ec.scale(-1, 1);
    ec.drawImage(plate, right, top, w, bottom - top, 0, 0, w, bottom - top);
    ctx.drawImage(east, left, top);
    ctx.drawImage(patch, left, top);
    // The standard: black iron and lit glass only.
    const sx = Math.round(m.x(996)),
      sy = Math.round(m.y(271)),
      sw = Math.round(m.x(1060)) - sx,
      sh = Math.round(m.y(414)) - sy;
    const lampData = ctx.getImageData(sx, sy, sw, sh),
      d = lampData.data;
    for (let i = 0; i < d.length; i += 4) {
      const light = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const glass = d[i] > 225 && d[i + 1] > 170;
      d[i + 3] = light < 58 || glass ? 255 : 0;
    }
    const standard = canvas(sw, sh);
    standard.getContext("2d").putImageData(lampData, 0, 0);
    const foot = [Math.round(m.x(750)), Math.round(m.y(474))];
    const dx = foot[0] - Math.round(sw / 2) - 1,
      dy = foot[1] - sh;
    const glow = ctx.createRadialGradient(foot[0], dy + sh * 0.22, 2, foot[0], dy + sh * 0.22, sw * 0.95);
    glow.addColorStop(0, "#ffc35a66");
    glow.addColorStop(1, "#ffc35a00");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = glow;
    ctx.fillRect(dx - sw, dy - sw, 3 * sw, sh + sw);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(standard, dx, dy);
    return grade(plate, "district");
  };

  window.bake = {
    recipes,
    helpers: { P, CW, CH, KX, KY, XT, YT, RING_YT, load, canvas, context, mapper, register, grade, grades, paste, plateMap, kerbStops, entry, clearMarkings },
    init(list) {
      manifest = Object.fromEntries(list.map((e) => [e.key, e]));
      return Object.keys(recipes);
    },
    async run(name, quality, png) {
      const c = await recipes[name]();
      return {
        width: c.width,
        height: c.height,
        webp: c.toDataURL("image/webp", quality),
        png: png ? c.toDataURL("image/png") : null,
      };
    },
  };
})();
