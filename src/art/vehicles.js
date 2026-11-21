import { g } from "../platform/canvas.js";
import { artwork, clamp, game } from "../core/state.js";
import { TAU } from "../world/town.js";

import { sedanHalfWidth, sedanHalfLength } from "../world/vehicle-shape.js";

function shadow(x, y, w, h) {
  g.fillStyle = "#15112580";
  g.beginPath();
  g.ellipse(x + 0.7, y + 0.2, w, h, 0, 0, TAU);
  g.fill();
}
const paintRows = { cream: 0, blue: 1, gold: 2, olive: 3, rose: 4, silver: 5 };
const motorCache = new WeakMap();
// The same bonnet, glazing and bumpers from the painted sedan are wrapped around its body.
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
  const co = Math.cos(v.a),
    si = Math.sin(v.a),
    sourceY = paintRows[v.tint] * 64;
  const wrecked = v.condition === 0,
    crush = clamp((60 - (v.condition ?? 100)) / 60, 0, 1);
  function project(u, w, z) {
    // Shorten the nose, twist its wings and collapse the cabin as the shell gives way.
    if (crush) {
      const nose = Math.max(0, u - 4);
      u -= nose * crush * 0.53;
      w += nose * crush * 0.21;
      z -= Math.max(0, z - 3) * crush * 0.53 + crush * (0.35 + Math.max(0, w) * 0.13);
    }
    return [u * co - w * si, u * si + w * co - z * 0.77];
  }
  function face(column, points, outline = true) {
    const [a, b, d, e] = points.map((n) => project(...n));
    // Each textured triangle maps its three exact UV corners onto the projected panel.
    for (const tri of [
      [a, b, d],
      [a, d, e],
    ]) {
      const [u, v, w] = tri;
      c.save();
      c.beginPath();
      c.moveTo(...u);
      c.lineTo(...v);
      c.lineTo(...w);
      c.closePath();
      c.clip();
      const right = v === b ? [b[0] - a[0], b[1] - a[1]] : [d[0] - e[0], d[1] - e[1]];
      const bottom = v === b ? [d[0] - b[0], d[1] - b[1]] : [e[0] - a[0], e[1] - a[1]];
      c.transform(right[0], right[1], bottom[0], bottom[1], a[0], a[1]);
      c.drawImage(artwork.motor, column * 128, sourceY, 128, 64, 0, 0, 1, 1);
      c.restore();
    }
    if (outline) {
      c.beginPath();
      c.moveTo(...a);
      c.lineTo(...b);
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
  // The bumper is narrower than the fenders. Wrapped corner lamps read in side view too.
  const b = sedanHalfWidth,
    r = 3.85,
    z = 4.2,
    top = 7.3,
    endWidth = 4.05,
    end = sedanHalfLength;
  for (const side of [-1, 1]) {
    if (side * co < -0.001) continue;
    face(0, [
      [-10.05, side * b, 3.85],
      [10.05, side * b, 3.85],
      [10.05, side * b, 1.15],
      [-10.05, side * b, 1.15],
    ]);
  }
  for (const sign of [-1, 1]) {
    for (const side of [-1, 1]) {
      if (side * co + sign * si < 0) continue;
      const near = 10.05 * sign,
        outer = end * sign;
      trim(
        [
          [near, side * b, 3.85],
          [outer, side * endWidth, 3.58],
          [outer, side * endWidth, 2.4],
          [near, side * b, 2.4],
        ],
        sign > 0 ? "#ffc66b" : "#aa494c",
      );
      trim(
        [
          [near, side * b, 2.4],
          [outer, side * endWidth, 2.4],
          [outer, side * endWidth, 1.1],
          [near, side * b, 1.15],
        ],
        "#655158",
      );
    }
  }
  if (si > 0)
    face(7, [
      [end, endWidth, 3.58],
      [end, -endWidth, 3.58],
      [end, -endWidth, 1.1],
      [end, endWidth, 1.1],
    ]);
  else
    face(8, [
      [-end, -endWidth, 3.58],
      [-end, endWidth, 3.58],
      [-end, endWidth, 1.1],
      [-end, -endWidth, 1.1],
    ]);
  face(2, [
    [4.6, b, z],
    [4.6, -b, z],
    [end, -endWidth, 3.58],
    [end, endWidth, 3.58],
  ]);
  face(4, [
    [-6.9, -b, z],
    [-6.9, b, z],
    [-end, endWidth, 3.58],
    [-end, -endWidth, 3.58],
  ]);
  for (const side of [-1, 1]) {
    if (side * co < -0.397) continue;
    face(1, [
      [-4.45, side * r, top],
      [2.1, side * r, top],
      [4.6, side * b, z],
      [-6.9, side * b, z],
    ]);
  }
  face(5, [
    [2.1, r, top],
    [2.1, -r, top],
    [4.6, -b, z],
    [4.6, b, z],
  ]);
  face(6, [
    [-4.45, -r, top],
    [-4.45, r, top],
    [-6.9, b, z],
    [-6.9, -b, z],
  ]);
  face(3, [
    [-4.45, r, top],
    [-4.45, -r, top],
    [2.1, -r, top],
    [2.1, r, top],
  ]);
  const side = co < 0 ? -1 : 1;
  trim(
    [
      [3.1, side * 4.45, 4.5],
      [3.8, side * 5.3, 4.6],
      [3.3, side * 5.7, 4.9],
      [2.65, side * 5.2, 4.9],
    ],
    "#443743",
  );
  trim(
    [
      [3.15, side * 4.8, 4.82],
      [3.67, side * 5.25, 4.85],
      [3.35, side * 5.52, 5.02],
      [2.86, side * 5.15, 5.02],
    ],
    "#cfb7a7",
  );
  for (const u of [-6.9, 6.9])
    face(
      9,
      [
        [u - 1.9, side * 4.9, 3.55],
        [u + 1.9, side * 4.9, 3.55],
        [u + 1.9, side * 4.9, -0.1],
        [u - 1.9, side * 4.9, -0.1],
      ],
      false,
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
        [9.9, -1, 3.78],
      ],
      "#514448",
      0.17 + damage * 0.12,
    );
    if (v.condition < 76) {
      trim(
        [
          [8, -3, 3.97],
          [10.9, -3.6, 3.6],
          [10, 0.2, 3.7],
          [9.1, -0.9, 3.8],
        ],
        "#5a454d99",
      );
      scratch(
        [
          [2.7, 0.7, 6.53],
          [3.25, 1.95, 5.86],
          [3.52, 1.65, 5.48],
          [4.02, 2.85, 4.9],
        ],
        "#bedce3",
        0.18,
      );
    }
    if (v.condition < 44) {
      scratch(
        [
          [2.75, 0.7, 6.55],
          [3.35, -0.25, 5.8],
          [3.55, -1.6, 5.55],
        ],
        "#e6e6cf",
        0.21,
      );
      trim(
        [
          [7.4, -2.7, 4],
          [8.8, -3.15, 3.9],
          [10.1, -1, 3.74],
          [8.1, -0.4, 3.96],
        ],
        "#45383caa",
      );
    }
  }
  if (wrecked) {
    // Exposed engine, peeled-back bonnet and jagged safety glass use the same projection.
    trim(
      [
        [4.6, -3.9, 4.25],
        [10.8, -3.4, 3.72],
        [10.3, 3.6, 3.72],
        [4.7, 3.9, 4.28],
      ],
      "#302831",
    );
    trim(
      [
        [5.6, -2.1, 4.6],
        [9.9, -1.8, 4.4],
        [9.8, 1.7, 4.1],
        [5.6, 1.9, 4.4],
      ],
      "#71605c",
    );
    for (let i = 0; i < 4; i++) {
      const u = 6.1 + i * 0.85;
      trim(
        [
          [u, -1.7, 4.75],
          [u + 0.32, -1.7, 4.77],
          [u + 0.32, 1.35, 4.52],
          [u, 1.35, 4.52],
        ],
        "#322e35",
      );
    }
    trim(
      [
        [5.2, -4.3, 4.4],
        [7.1, -3.7, 8.2],
        [7.8, -1.5, 6.95],
        [8.5, 0.3, 8.3],
        [6.2, 1.3, 4.5],
      ],
      "#847077",
    );
    trim(
      [
        [5.2, -4.3, 4.4],
        [7.1, -3.7, 8.2],
        [7.8, -1.5, 6.95],
      ],
      "#b6a09a",
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
        [4.28, -3.86, 4.54],
      ],
      "#211d29",
    );
    trim(
      [
        [10, -4.05, 2.9],
        [14.4, -1.85, 0.71],
        [13.8, 3.55, 0.3],
        [12.9, 3.4, 0.76],
        [13.3, -1.7, 1.13],
        [9.8, -4.13, 2.4],
      ],
      "#a3948b",
    );
    trim(
      [
        [-4.2, -2.8, 7.45],
        [-2.7, -0.9, 7.4],
        [-0.8, -1.0, 7.41],
        [1.35, 2.95, 7.42],
        [-1.35, 0.1, 7.44],
        [-2.9, 0.1, 7.4],
      ],
      "#69575d",
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
  g.ellipse(0, 0, 11.4, 4.9, 0, 0, TAU);
  g.fill();
  g.restore();
  g.drawImage(renderMotor(v), v.x - 16, v.y - 110 / 7, 32, 192 / 7);
  drawDamageSmoke(v);
}
export function drawDamageSmoke(v) {
  if (v.condition < 42) {
    const wrecked = v.condition === 0,
      count = wrecked ? 9 : 4,
      reach = wrecked ? 27 : 13;
    const baseX = v.x + 7 * Math.cos(v.a),
      baseY = v.y + 7 * Math.sin(v.a) - 3;
    const clock = game.time * (wrecked ? 0.54 : 0.78) + v.x * 0.013 + v.y * 0.009;
    g.save();
    for (let i = count - 1; i >= 0; i--) {
      const age = (clock + i / count) % 1,
        swirl = Math.sin(game.time * 1.4 + i * 2.3);
      const x = baseX + age * (wrecked ? -6 : -2) + swirl * (0.3 + age * 1.65),
        y = baseY - age * reach;
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
export { drawCar, shadow };
