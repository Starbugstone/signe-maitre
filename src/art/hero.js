import {
  hem,
  hips,
  legMasks,
  register,
  freeSide,
  rightArm,
  shoulders,
  mend,
  noHand,
  pelvis,
  wrists,
  seals,
} from "./hero-rig.js";
import { artwork } from "../core/state.js";
import { TAU } from "../world/town.js";
import { dressKonami, tintKonamiSuit } from "./konami-costume.js";

// Build the CJ from registered artwork. A facing has one carrying arm and folio;
// strides replace the legs, and a strike replaces only the free shoulder and arm.
function prepareHero(alternate = false) {
  const width = 152,
    height = 132;
  const sheets = {};
  for (const key of ["walk", "run", "slapping"]) {
    const surface = document.createElement("canvas");
    surface.width = 4 * width;
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
    for (const p of points.slice(1)) c.lineTo(...p);
    c.closePath();
  }
  // Layers meet on whole pixels. Antialiased clips left translucent seams between them.
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
    const alpha = scratch.getImageData(0, 0, width, height).data,
      mask = new Uint8Array(size);
    for (let i = 0; i < size; i++) mask[i] = alpha[i * 4 + 3] > 127 ? 1 : 0;
    return mask;
  }
  function cell(source, frame, row, dx = 0, dy = 0) {
    scratch.clearRect(0, 0, width, height);
    scratch.drawImage(source, frame * width, row * height, width, height, dx, dy, width, height);
    return scratch.getImageData(0, 0, width, height);
  }
  function paste(target, source, mask, keep = false) {
    const t = target.data,
      s = source ? source.data : null;
    for (let i = 0; i < size; i++) {
      if (!mask[i] === keep) for (let k = 0; k < 4; k++) t[i * 4 + k] = s ? s[i * 4 + k] : 0;
    }
    return target;
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
  // Extend cloth sideways into the gap the lifted arm leaves at the shoulder.
  // Each scanline takes the reddest nearby pixel, so outlines and buttons are not smeared.
  function reweave(pixels, mask, from) {
    const v = pixels.data;
    let last = null;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = from > 0 ? width - 2 : 1; x > 0 && x < width - 1; x -= from) {
        const i = y * width + x;
        if (!mask[i] || v[i * 4 + 3] > 200) continue;
        // The drawing leaves a hairline of daylight between sleeve and coat; bridge it too.
        let reach = 1;
        while (reach < 4 && v[(i + from * reach) * 4 + 3] <= 200) reach++;
        if (reach === 4) continue;
        let cloth = i + from * reach,
          best = -999;
        for (let step = reach; step < reach + 7; step++) {
          const s = i + from * step;
          if (s < y * width || s >= (y + 1) * width || v[s * 4 + 3] <= 200) break;
          const red = v[s * 4] - 2 * v[s * 4 + 1];
          if (red > best) {
            best = red;
            cloth = s;
          }
        }
        // Beside the collar there is no cloth to copy: continue the scanline below.
        if (best < 40 && last !== null) cloth = last;
        else last = cloth;
        for (let bridge = 1; bridge < reach; bridge++) {
          for (let k = 0; k < 3; k++) v[(i + from * bridge) * 4 + k] = v[cloth * 4 + k];
          v[(i + from * bridge) * 4 + 3] = 255;
        }
        for (
          let fill = x;
          fill > 0 && fill < width - 1 && mask[y * width + fill] && v[(y * width + fill) * 4 + 3] <= 200;
          fill -= from
        ) {
          for (let k = 0; k < 3; k++) v[(y * width + fill) * 4 + k] = v[cloth * 4 + k];
          v[(y * width + fill) * 4 + 3] = 255;
          x = fill;
        }
      }
    }
  }
  // The arm's place on the coat, with its inner outline where that lies on the torso.
  function armhole(row) {
    const hole = inside(rightArm[row]);
    if (!mend[row]) return hole;
    const halo = inside(rightArm[row], 2.5),
      torso = inside(mend[row].area),
      side = inside(noHand[row]),
      whole = inside(upperHalf(row));
    for (let i = 0; i < size; i++) hole[i] |= halo[i] & (torso[i] | side[i]) & whole[i];
    return hole;
  }
  // The standing torso without its free arm: one carrying arm and one folio per facing.
  function jacket(row, stand) {
    const coat = paste(
      new ImageData(new Uint8ClampedArray(stand.data), width, height),
      null,
      inside(upperHalf(row)),
      true,
    );
    const arm = armhole(row);
    paste(coat, null, arm);
    const cloth = cell(artwork.slapping, 0, row, ...register[row][0]),
      patch = inside(noHand[row]);
    for (let i = 0; i < size; i++) patch[i] &= arm[i];
    paste(coat, cloth, patch);
    if (mend[row]) {
      const gap = inside(mend[row].area),
        known = inside(noHand[row]);
      for (let i = 0; i < size; i++) gap[i] &= arm[i] & ~known[i];
      reweave(coat, gap, mend[row].from);
    }
    return coat;
  }
  // The free arm keeps its sleeve by outline and its hand by colour, so no trouser cloth travels with it.
  function freeArm(row, stand) {
    const arm = paste(
      new ImageData(new Uint8ClampedArray(stand.data), width, height),
      null,
      inside(rightArm[row], 1.2),
      true,
    );
    const v = arm.data,
      drop = [];
    for (let y = wrists[row]; y < height - 1; y++)
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (!v[i * 4 + 3]) continue;
        if (!skinned(v, i)) drop.push(i);
      }
    for (const i of drop) v[i * 4 + 3] = 0;
    return canvasOf(arm);
  }
  function gaitArm(c, arm, row, frame, running) {
    let phase = [-1, 0.2, 1, -0.2][frame];
    const profile = row === 0 || row === 3;
    // The near hand stops short of the grip on the folio when it swings forward.
    if (row === 0 && phase < 0) phase *= 0.62;
    const [x, y] = shoulders[row];
    c.save();
    c.translate(x, y);
    c.rotate(phase * (profile ? (running ? 0.49 : 0.32) : 0.068) * (row === 3 ? -1 : 1));
    if (!profile) c.scale(1, 0.94 + phase * 0.06);
    c.translate(-x, -y);
    c.drawImage(arm, 0, 0);
    c.restore();
  }
  function legLayer(key, row, frame) {
    const legs = paste(cell(artwork[key], frame, row), null, inside(legMasks[key][row][frame]), true),
      data = legs.data;
    // Exclude the light paper and fingers at the hip without touching raised shoes.
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
        const n = piece[j],
          x = n % width;
        for (const nb of [n - width, n + width, x > 0 ? n - 1 : -1, x < width - 1 ? n + 1 : -1]) {
          if (nb < 0 || nb >= size || seen[nb] || !v[nb * 4 + 3]) continue;
          seen[nb] = 1;
          piece.push(nb);
        }
      }
      if (piece.length < limit) for (const n of piece) v[n * 4 + 3] = 0;
    }
  }
  // Close the trouser seat under the coat where the source stride had a hand or the folio in front.
  function seat(c, row) {
    const [left, right, top, depth] = pelvis[row],
      pixels = c.getImageData(0, 0, width, height),
      v = pixels.data;
    specks(v, 55);
    for (let x = left; x <= right; x++) {
      let y = top;
      while (y <= depth && v[(y * width + x) * 4 + 3] < 200) y++;
      if (y > depth) continue;
      // Close pockets lower in the same column that are bounded by cloth.
      let last = y;
      for (let scan = y; scan <= depth; scan++)
        if (v[(scan * width + x) * 4 + 3] < 200) {
          let below = scan;
          while (below <= depth + 6 && v[(below * width + x) * 4 + 3] < 200) below++;
          if (below <= depth + 6) last = below;
          scan = below;
        }
      const stop = Math.max(y, last);
      // Copy the reddest cloth just below, never an outline, a shadow or a shoe.
      let sample = stop + 3,
        best = -999;
      for (let probe = stop + 3; probe < stop + 13 && probe < height; probe++) {
        const p = (probe * width + x) * 4;
        if (v[p + 3] < 200) continue;
        const red = v[p] - 2 * v[p + 1];
        if (red > best) {
          best = red;
          sample = probe;
        }
      }
      if (best === -999) continue;
      const s = (sample * width + x) * 4;
      for (let fill = top; fill < stop + 3; fill++) {
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
      for (let frame = 0; frame < 4; frame++) {
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
    const stand = cell(artwork.slapping, 3, row),
      coatPixels = jacket(row, stand);
    const coat = heroTile(coatPixels, row),
      arm = freeArm(row, stand);
    for (let frame = 0; frame < 4; frame++) {
      const hit = sheets.slapping.getContext("2d");
      hit.save();
      hit.translate(width * frame, height * row);
      const pose = new ImageData(new Uint8ClampedArray(stand.data), width, height);
      if (row === 1 && (frame === 1 || frame === 2)) {
        // The arm crosses the chest from his right shoulder. Keep the left grip underneath.
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
          paste(pose, cell(artwork.slapping, frame, row, ...register[row][frame]), inside(freeSide[row]));
        // The screen-left profile strikes with the far arm: the near shoulder stays in front.
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
              [66, 38],
            ]),
          );
        let palm = null;
        if (row === 0 && frame === 2) {
          // Lift the follow-through palm clear of the fist that grips the folio.
          const reach = inside([
              [88, 55],
              [108, 55],
              [108, 73],
              [97, 73],
              [94, 70.2],
              [88, 70.2],
            ]),
            v = pose.data;
          palm = new ImageData(width, height);
          for (let i = 0; i < size; i++)
            if (reach[i] && v[i * 4 + 3] && skinned(v, i))
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
        const c = sheets[key].getContext("2d"),
          hip = hips[row];
        const sourceRow = row === 3 ? 0 : row,
          sourceHip = hips[sourceRow];
        const [x, y] = sourceHip[key][frame],
          [cx, cy] = hip.at;
        const bob = frame % 2 === 0 ? 0 : key === "run" ? -3 : -1.5;
        const legs = blank(),
          l = legs.getContext("2d", { willReadFrequently: true });
        l.translate(cx, cy);
        if (row === 3) l.scale(-1, 1);
        l.scale(1, (130 - cy) / (130 - y));
        l.translate(-x, -y);
        l.drawImage(legLayer(key, sourceRow, frame), 0, 0);
        l.setTransform(1, 0, 0, 1, 0, 0);
        seat(l, row);
        const lean = (c2) => {
          c2.translate(0, bob);
          c2.translate(cx, cy);
          if (row === 0 || row === 3) c2.rotate((row === 0 ? 1 : -1) * (key === "run" ? 0.095 : 0.018));
          c2.translate(-cx, -cy);
        };
        c.save();
        c.translate(width * frame, height * row);
        // The far arm of the screen-left profile swings behind the legs and the coat.
        if (row === 3) {
          c.save();
          lean(c);
          gaitArm(c, arm, row, frame, key === "run");
          c.restore();
        }
        c.drawImage(legs, 0, 0);
        lean(c);
        c.drawImage(coat, 0, 0);
        if (row !== 3) gaitArm(c, arm, row, frame, key === "run");
        finishPose(c, frame, row);
        c.restore();
      }
    }
  }
  for (const sheet of Object.values(sheets)) cleanEdges(sheet);
  return sheets;
}

export { prepareHero };
