import { CELL_W, CELL_H, X, Y } from "./layout.js";

export const kerbX = 17.6,
  kerbY = 16.8;
export const plateRegistration = {
  market: [
    [667, 749, 841],
    [429, 500, 559],
  ],
  garage: [
    [668, 750, 838],
    [430, 503, 575],
  ],
  docks: [
    [667, 751, 842],
    [429, 499, 573],
  ],
  square: [
    [669, 749, 840],
    [429, 499, 572],
  ],
};

// Locations in the 900-pixel reference prints. Lamp entries give x, finial and foot.
// Bollards on one kerb share a height and a baseline.
// prettier-ignore
const fixtures = {
  garage: {
    lamps: [[383,96,222],[516,138,222],[382,350,428],[521,349,428],[372,489,575],[528,489,575]],
    bollards: [[246,20,28,62,144,310,364,533,575,727,814,880]],
  },
  market: {
    lamps: [[379,29,91],[521,29,91],[324,199,249],[571,208,249],[370,354,423],[527,354,423]],
    bollards: [[249,18,15,85,271,367,533,640,710,877],[374,24,345,555],[524,24,379],[580,25,346,520]],
  },
  docks: {
    lamps: [[384,21,90],[516,21,90],[375,152,230],[525,152,230],[375,342,420],[525,342,420]],
    bollards: [[250,19,92,165,335,566,646,724,861],[370,20,349,555],[584,22,370,531]],
  },
  square: {
    lamps: [[377,81,148],[524,81,148],[361,169,239],[540,169,239],[359,348,416],[540,348,416],[361,497,572],[541,497,572]],
    bollards: [[251,14,58,100,144,189,290,332,570,604,652,692,750,801,844,880],[240,15,382,518],[214,17,386,513],
      [357,14,327,569],[392,19,384,516],[425,18,384,516],[514,18,385,515],[576,18,385,515]],
  },
};

function register(pixel, source, target) {
  const end = source.findIndex((stop, i) => i > 0 && pixel <= stop);
  const i = end < 0 ? source.length - 2 : end - 1;
  return target[i] + ((target[i + 1] - target[i]) * (pixel - source[i])) / (source[i + 1] - source[i]);
}
function makeProps(key, mapX, mapY, lamps, bollards) {
  function prop(x, top, bottom, widths) {
    const height = bottom - top;
    const right = widths.map(([f, w]) => [mapX(x + w), mapY(top + height * f)]);
    const left = widths.map(([f, w]) => [mapX(x - w), mapY(top + height * f)]).reverse();
    return {
      key,
      x: mapX(x),
      y: mapY(bottom),
      radius: (right.at(-1)[0] - left[0][0]) / 2,
      outline: [...right, ...left],
    };
  }
  return [
    ...lamps.map(([x, top, foot]) =>
      prop(x, top, foot, [
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
        [1, 4.1],
      ]),
    ),
    ...bollards.flatMap(([foot, h, ...xs]) =>
      xs.map((x) =>
        prop(x, foot - h, foot, [
          [0, 0.7],
          [0.08, 1.6],
          [0.22, 1.8],
          [0.32, 1],
          [0.78, 1.2],
          [0.9, 1.8],
          [1, 2.3],
        ]),
      ),
    ),
  ];
}
const props = {};
for (const [key, { lamps, bollards }] of Object.entries(fixtures)) {
  const [xs, ys] = plateRegistration[key];
  props[key] = makeProps(
    key,
    (x) => register(x / 0.6, [0, ...xs, 1500], [-CELL_W / 2, -kerbX, 0, kerbX, CELL_W / 2]),
    (y) => register(y / 0.6, [0, ...ys, 1000], [-CELL_H / 2, -kerbY, 0, kerbY, CELL_H / 2]),
    lamps,
    bollards,
  );
}
const canalHeight = CELL_H - 31 + 5;
props.canal = makeProps(
  "canal",
  (x) => register((x * 1536) / 900, [0, 700, 769, 834, 1536], [-145, -13, 0, 13, 145]),
  (y) =>
    16 +
    register(
      (y * 1536) / 900,
      [10, 65, 389, 456, 467],
      [0, 27, canalHeight - 28, canalHeight - 4, canalHeight],
    ),
  [
    [368, 172, 232],
    [532, 172, 232],
    [44, 206, 260],
    [249, 206, 260],
    [653, 206, 260],
    [854, 206, 260],
  ],
  [
    [251, 15, 291, 608, 816],
    [260, 12, 64, 204, 888],
  ],
);

const byLayout = new WeakMap();
export function streetProps(layout, col, row) {
  if (!byLayout.has(layout)) byLayout.set(layout, new Map());
  const cache = byLayout.get(layout),
    id = row * layout.cols + col;
  if (cache.has(id)) return cache.get(id);
  const key = layout.blocks[row][col],
    result = [];
  for (const item of props[key]) {
    if (row === layout.canalRow && item.y > 0) continue;
    if (row === layout.canalRow + 1 && item.y < -11) continue;
    result.push({ x: X(col) + item.x, y: Y(row) + item.y, item });
  }
  // Canal posts belong to the cell containing their feet, including the south quay.
  if (row === layout.canalRow || row === layout.canalRow + 1)
    for (const item of props.canal) {
      const y = Y(layout.canalRow) + item.y;
      if (layout.cellAt(X(col), y).row === row) result.push({ x: X(col) + item.x, y, item });
    }
  cache.set(id, result);
  return result;
}
