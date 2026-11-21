// Tile coordinates follow the rig's right, front, back and left facing rows.
const headSlots = [
  { box: [63, 6, 24, 28], cut: [[61, 4], [93, 4], [94, 34], [81, 34], [68, 27], [61, 27]] },
  { box: [64, 6, 25, 30], cut: [[62, 4], [91, 4], [91, 27], [85, 29], [84, 37], [69, 37], [69, 29], [62, 27]] },
  { box: [62, 6, 25, 24], cut: [[60, 4], [86, 4], [86, 28], [81, 29], [65, 29], [60, 27]] },
  { box: [67, 6, 24, 28], cut: [[62, 4], [96, 4], [96, 26], [86, 27], [77, 35], [62, 36]] },
];
const tie = [
  [[80, 35], [83, 36], [83, 38], [86, 42], [85, 45], [81, 39], [79, 37]],
  [[75, 37], [81, 37], [80, 40], [80.5, 45], [77.5, 48], [75.5, 45], [76.5, 40]],
  null,
  [[75, 35], [78, 36], [76, 39], [73, 45], [71, 46], [72.5, 42], [74, 38]],
];
// On the profile wind-ups, the raised palm passes in front of the head replacement.
const raisedHand = [
  [[56, 34], [57, 21], [61, 20], [62, 16], [69, 16], [70, 18], [69, 25], [70, 26], [74, 24], [75, 24], [75, 27], [71, 30], [69, 32], [67, 35], [57, 36]],
  null,
  null,
  [[48, 15], [62, 14], [66, 18], [66, 30], [61, 35], [48, 35]],
];

function trace(context, points) {
  context.beginPath();
  context.moveTo(...points[0]);
  for (const point of points.slice(1)) context.lineTo(...point);
  context.closePath();
}

export function dressKonami(tile, heads, row, windup) {
  const c = tile.getContext("2d");
  const { box, cut } = headSlots[row];
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
  const [, , w, h] = box;
  c.drawImage(heads, 0, row * 32, w, h, ...box);
  c.restore();
  return tile;
}

export function tintKonamiSuit(context, x, y, width, height) {
  const pixels = context.getImageData(x, y, width, height);
  const v = pixels.data;
  for (let i = 0; i < v.length; i += 4) {
    const r = v[i], g = v[i + 1], b = v[i + 2];
    // Shift the burgundy fabric to charcoal while keeping the ink shading and warm accents.
    if (v[i + 3] && r > g + 8 && g < 0.79 * r && b > 0.82 * g) {
      const blend = Math.min(1, (b - 0.82 * g) / Math.max(1, 0.13 * g));
      const light = 0.36 * r + 0.54 * g + 0.1 * b;
      v[i] = r + (0.76 * light + 3 - r) * blend;
      v[i + 1] = g + (0.83 * light + 4 - g) * blend;
      v[i + 2] = b + (0.91 * light + 8 - b) * blend;
    }
  }
  context.putImageData(pixels, x, y);
}
