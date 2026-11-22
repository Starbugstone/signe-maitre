// Recipes for tools/art/bake-scenery.mjs. Runs inside headless Chromium.
// Source coordinates are pixels of the paintings in art-src/scenery (1500 × 1000, the river
// 1500 × 2130), as measured in its manifest.json and marked in src/world/paintings.js.
// Plate coordinates are 5 px per world unit, a cell being 290 × 228 units.
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
  // A seam strip lies over the join of two paintings. Its long edges fade out over 5 units,
  // so that the lane's back walls melt into the facades they cover.
  function softEdges(strip, vertical, soft = 5 * P) {
    const ctx = strip.getContext("2d"),
      size = vertical ? strip.width : strip.height;
    const fade = ctx.createLinearGradient(0, 0, vertical ? size : 0, vertical ? 0 : size);
    fade.addColorStop(0, "#0000");
    fade.addColorStop(soft / size, "#000");
    fade.addColorStop(1 - soft / size, "#000");
    fade.addColorStop(1, "#0000");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, strip.width, strip.height);
    ctx.globalCompositeOperation = "source-over";
    return strip;
  }
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
    return softEdges(grade(strip, "alley"), true);
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
    return softEdges(grade(strip, "alley"), false);
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
  // La Ferre at its true depth. Each river painting is 1500 × 2130 px for 290 × 412.2 units,
  // from 27 units south of Quai Nord's centre line to the Quai Sud kerb. A plate starts 10
  // units farther north, at the Quai Nord kerb: that band is quay setts, and a bridge runs
  // through it. Rows are never stretched; a through road is registered on its kerbs.
  const RIVER_H = 422.2,
    PLATE_H = Math.round(RIVER_H * P),
    APPROACH = 10 * P,
    TALL = [1500, 2130];
  let marks = {},
    lantern = [];

  async function riverSource(key) {
    const image = await load(key + "Tall");
    const road = marks[key].kerbs;
    const xs = road ? [0, ...road, TALL[0]] : [0, TALL[0]],
      xt = road ? XT : [0, CW];
    const c = canvas(CW * P, PLATE_H - APPROACH),
      ctx = context(c);
    ctx.imageSmoothingQuality = "high";
    for (let i = 0; i < xs.length - 1; i++) {
      const [x, x2] = xt.slice(i, i + 2).map((n) => Math.round(n * P));
      ctx.drawImage(image, xs[i], 0, xs[i + 1] - xs[i], TALL[1], x, 0, x2 - x, c.height);
    }
    const mx = mapper(xs, xt);
    return { c, x: (v) => mx(v) * P, y: (v) => APPROACH + (v * c.height) / TALL[1] };
  }
  // Clean quay setts, from the first island painting, mirrored so that they repeat.
  let pavingSample;
  async function paving() {
    if (pavingSample) return pavingSample;
    const image = await load("islandWest");
    const tile = canvas(800, 128),
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
      ctx.drawImage(image, 196, 438, 414, 64, 0, 0, 400, 64);
      ctx.restore();
    }
    return (pavingSample = tile);
  }
  // The painting's top edge cuts through the quay terrace and its posts. Setts run from the
  // Quai Nord kerb down to the cap of the quay wall instead (source row 24).
  const TERRACE = 24;
  async function riverPlate(key) {
    const { c, x, y } = await riverSource(key);
    const mark = marks[key];
    const plate = canvas(CW * P, PLATE_H),
      ctx = plate.getContext("2d");
    ctx.drawImage(c, 0, APPROACH);
    const cap = Math.round(y(TERRACE)),
      soft = 4;
    const band = canvas(plate.width, cap + soft),
      b = band.getContext("2d");
    b.fillStyle = b.createPattern(await paving(), "repeat");
    b.fillRect(0, 0, band.width, band.height);
    const fade = b.createLinearGradient(0, cap - soft, 0, cap + soft);
    fade.addColorStop(0, "#000");
    fade.addColorStop(1, "#0000");
    b.globalCompositeOperation = "destination-in";
    b.fillStyle = fade;
    b.fillRect(0, 0, band.width, band.height);
    ctx.drawImage(band, 0, 0);
    for (const [x0, x1, row] of mark.clear || []) {
      const left = Math.round(x(x0)),
        w = Math.round(x(x1)) - left,
        h = Math.round(y(row)) - cap;
      ctx.drawImage(await paving(), left % 800, cap % 128, w, h, left, cap, w, h);
    }
    if (mark.deck) {
      // A bridge runs on to the kerb: its first rows again, turned about the painting's top edge.
      const [d0, d1] = mark.deck.map((v) => Math.round(x(v)));
      ctx.drawImage(c, d0, 0, d1 - d0, cap + soft, d0, APPROACH, d1 - d0, cap + soft);
      ctx.save();
      ctx.translate(0, APPROACH);
      ctx.scale(1, -1);
      ctx.drawImage(c, d0, 0, d1 - d0, APPROACH, d0, 0, d1 - d0, APPROACH);
      ctx.restore();
    }
    return grade(plate, "river");
  }
  // A standing lantern's silhouette, in source pixels: [x, finial, foot].
  function lanternOutline([lx, top, foot]) {
    const h = foot - top;
    const right = lantern.map(([f, w]) => [lx + w * h, top + f * h]),
      left = lantern.map(([f, w]) => [lx - w * h, top + f * h]).reverse();
    return [...right, ...left];
  }
  const isWater = (r, g, b) => r < 22 && b > g + 4 && b >= 18;
  // What stands in front of passing boats, as a half-size alpha mask over the plate.
  async function riverOver(key) {
    const { c, x, y } = await riverSource(key);
    const mark = marks[key];
    const mask = canvas(CW * P, PLATE_H),
      m = mask.getContext("2d");
    const trace = (ctx, points) => {
      ctx.beginPath();
      for (const [px, py] of points) ctx.lineTo(x(px), y(py));
      ctx.closePath();
    };
    m.fillStyle = "#fff";
    if (mark.deck) m.fillRect(x(mark.deck[0]), 0, x(mark.deck[1]) - x(mark.deck[0]), PLATE_H);
    if (mark.island) {
      trace(m, mark.island);
      m.fill();
    }
    for (const lamp of mark.lamps || []) {
      trace(m, lanternOutline(lamp));
      m.fill();
    }
    const keyed = mark.over?.keyed || [];
    if (keyed.length) {
      const layer = canvas(mask.width, mask.height),
        k = context(layer);
      k.save();
      k.beginPath();
      for (const shape of keyed) {
        k.moveTo(x(shape[0][0]), y(shape[0][1]));
        for (const [px, py] of shape.slice(1)) k.lineTo(x(px), y(py));
        k.closePath();
      }
      k.clip();
      k.drawImage(c, 0, APPROACH);
      k.restore();
      const data = k.getImageData(0, 0, layer.width, layer.height),
        d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        const solid = d[i + 3] > 128 && !isWater(d[i], d[i + 1], d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = solid ? 255 : 0;
      }
      k.putImageData(data, 0, 0);
      // Close pinholes in the ink and drop stray ripples: soften, then cut at half.
      const closed = canvas(mask.width, mask.height),
        cc = context(closed);
      cc.filter = "blur(1.6px)";
      cc.drawImage(layer, 0, 0);
      cc.filter = "none";
      const soft = cc.getImageData(0, 0, closed.width, closed.height),
        s = soft.data;
      for (let i = 3; i < s.length; i += 4) s[i] = s[i] > 118 ? 255 : 0;
      cc.putImageData(soft, 0, 0);
      m.drawImage(closed, 0, 0);
    }
    const half = canvas(mask.width / 2, Math.ceil(mask.height / 2)),
      h = half.getContext("2d");
    h.imageSmoothingQuality = "high";
    h.drawImage(mask, 0, 0, half.width, half.height);
    half.format = "png";
    return half;
  }
  // For review: the plate with its mask in red, lanterns in cyan, boat solids in yellow and
  // whatever the caller marks in green (plate pixels).
  async function riverReview(key, shapes = []) {
    const plate = await riverPlate(key),
      over = await riverOver(key);
    const { x, y } = await riverSource(key);
    const ctx = plate.getContext("2d");
    const tint = canvas(plate.width, plate.height),
      t = tint.getContext("2d");
    t.drawImage(over, 0, 0, plate.width, plate.height);
    t.globalCompositeOperation = "source-in";
    t.fillStyle = "#ff2040";
    t.fillRect(0, 0, tint.width, tint.height);
    ctx.globalAlpha = 0.42;
    ctx.drawImage(tint, 0, 0);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    const mark = marks[key];
    ctx.strokeStyle = "#20f0ff";
    for (const lamp of mark.lamps || []) {
      ctx.beginPath();
      for (const [px, py] of lanternOutline(lamp)) ctx.lineTo(x(px), y(py));
      ctx.closePath();
      ctx.stroke();
    }
    for (const [lx, top, bottom, bracket] of mark.hanging || []) {
      ctx.strokeRect(x(lx - 24), y(top), x(lx + 24) - x(lx - 24), y(bottom) - y(top));
      ctx.strokeRect(x(lx - 30), y(bracket) - 1, x(lx + 30) - x(lx - 30), 2);
    }
    ctx.strokeStyle = "#ffe020";
    for (const [l, tp, r, bt] of mark.piers || []) ctx.strokeRect(x(l), y(tp), x(r) - x(l), y(bt) - y(tp));
    ctx.strokeStyle = "#40ff40";
    for (const shape of shapes) {
      ctx.beginPath();
      for (const [px, py] of shape) ctx.lineTo(px, py);
      ctx.closePath();
      ctx.stroke();
    }
    return plate;
  }
  for (const key of ["river", "riverBridge", "riverIronBridge", "islandWest", "islandCathedral", "islandEast"]) {
    recipes[key] = () => riverPlate(key);
    recipes[key + "Over"] = () => riverOver(key);
  }


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
    init(list, river) {
      manifest = Object.fromEntries(list.map((e) => [e.key, e]));
      marks = river.marks;
      lantern = river.lantern;
      return Object.keys(recipes);
    },
    async run(name, quality, png) {
      const c = await recipes[name]();
      const type = c.format === "png" ? "image/png" : "image/webp";
      return {
        width: c.width,
        height: c.height,
        type,
        image: c.toDataURL(type, quality),
        png: png ? c.toDataURL("image/png") : null,
      };
    },
    // A review sheet of one river plate; `shapes` are polygons in plate pixels.
    async review(key, shapes) {
      return (await riverReview(key, shapes)).toDataURL("image/jpeg", 0.9);
    },
  };
})();
