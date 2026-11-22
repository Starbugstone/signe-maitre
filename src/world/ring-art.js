// The Petite Ceinture as painted: spans cut from the ring paintings, laid on town.ring.
// The north and south legs are whole paintings (see paintings.js `viaduct`). The side legs,
// the four corners and the two rail bridges follow the published line exactly, so they are
// built here from pieces lifted out of the side-leg paintings by tools/art/bake-scenery.mjs.
import { plates, plateScale } from "./streets.js";
import { CELL_H, CELL_W, X, Y, town } from "./town.js";
import { artwork, game } from "../core/state.js";
import { g } from "../platform/canvas.js";
import { fromSource, paintings, ringFoot } from "./paintings.js";
import { sideSupports } from "./viaduct.js";

const P = plateScale;
const unit = (image) => ({ w: image.width / P, h: image.height / P });

// --- North and south legs ----------------------------------------------------------------
// One pier and its arch spandrels, about the pier's centre line, in source pixels.
// prettier-ignore
const pierOutline = [[-64,236],[-35,247],[-17,260],[-11,270],[-11,322],[-15,328],[-16,348],[-20,359],[-20,377],
  [20,377],[20,359],[16,348],[15,328],[11,322],[11,270],[17,260],[35,247],[64,236]];
// The station stands east of the cross street: canopies above the deck, hall below it.
export const stationSpan = { left: 38.6, right: 134.9 };

const foregrounds = new Map();
// Everything of a painted span that stands over the street: the deck, the piers and, at a
// station, the canopies. Rows are world units from the cell centre.
export function spanForeground(key) {
  if (foregrounds.has(key)) return foregrounds.get(key);
  const { source, east, piers, eastPiers = [], station } = paintings[key].viaduct;
  const west = fromSource(source, { ring: true }),
    far = east ? fromSource(east, { ring: true }) : west;
  const top = west.y(161),
    deck = west.y(236),
    origin = station ? west.y(78) : top;
  const plate = plates[key];
  const image = document.createElement("canvas");
  image.width = plate.width;
  image.height = Math.ceil((ringFoot - origin) * P);
  const ctx = image.getContext("2d");
  const px = (x) => (x + CELL_W / 2) * P,
    py = (y) => (y - origin) * P;
  ctx.beginPath();
  ctx.rect(0, py(top), image.width, py(deck) - py(top));
  if (station) ctx.rect(px(stationSpan.left), 0, px(stationSpan.right) - px(stationSpan.left), py(deck));
  for (const [map, list] of [
    [west, piers],
    [far, eastPiers],
  ])
    for (const pier of list) {
      ctx.moveTo(px(map.x(pier + pierOutline[0][0])), py(map.y(pierOutline[0][1])));
      for (const [dx, y] of pierOutline) ctx.lineTo(px(map.x(pier + dx)), py(map.y(y)));
      ctx.closePath();
    }
  ctx.clip();
  ctx.drawImage(plate, 0, -(origin + CELL_H / 2) * P);
  const result = { image, origin, deck, foot: ringFoot, station, near: [west.y(188), west.y(252)] };
  foregrounds.set(key, result);
  return result;
}

// --- Side legs, corners and rail bridges ---------------------------------------------------
const lift = () => town.ring.deckLift;

// Lay a strip that repeats along its length from (x, y0) to (x, y1), centred on x.
function layStrip(image, x, y0, y1) {
  const { w, h } = unit(image);
  for (let y = Math.floor(y0 / h) * h; y < y1; y += h) {
    const from = Math.max(y, y0),
      to = Math.min(y + h, y1);
    g.drawImage(image, 0, (from - y) * P, image.width, (to - from) * P, x - w / 2, from, w, to - from + 0.05);
  }
}

// The near face of the girder, from the north-leg painting, for the curved decks.
let girderFace;
function face() {
  if (girderFace) return girderFace;
  const m = fromSource("ringNorth", { ring: true });
  const left = Math.round((m.x(126) + CELL_W / 2) * P),
    right = Math.round((m.x(376) + CELL_W / 2) * P);
  const top = Math.round((m.y(205) + CELL_H / 2) * P),
    bottom = Math.round((m.y(240) + CELL_H / 2) * P);
  girderFace = document.createElement("canvas");
  girderFace.width = right - left;
  girderFace.height = bottom - top;
  girderFace.getContext("2d").drawImage(plates.ringNorth, left, top, right - left, bottom - top, 0, 0, right - left, bottom - top);
  return girderFace;
}

// A quarter turn of deck on the exact arc of town.ring, with the girder face showing on
// whichever edge looks south. `quadrant` 0..3: north-east, south-east, south-west, north-west.
const corners = [];
function corner(quadrant) {
  if (corners[quadrant]) return corners[quadrant];
  const { cornerR: R } = town.ring;
  const deck = artwork.ringDeck,
    { w, h } = unit(deck);
  const skirt = face(),
    depth = skirt.height / P;
  const pad = w / 2 + 2;
  const size = R + 2 * pad;
  const image = document.createElement("canvas");
  image.width = Math.ceil(size * P);
  image.height = Math.ceil((size + depth) * P);
  const ctx = image.getContext("2d");
  ctx.scale(P, P);
  // Centre of the turn in the sprite: the arc sweeps from angle a0 to a0 + 90 degrees.
  const a0 = (quadrant - 1) * (Math.PI / 2);
  const cx = quadrant === 0 || quadrant === 1 ? pad : pad + R,
    cy = quadrant === 0 || quadrant === 3 ? pad + R : pad;
  const steps = Math.max(24, Math.ceil((R * Math.PI) / 2 / 2.5));
  // The girder face hangs below the inner edge on the northern corners, the outer on the southern.
  const edge = quadrant === 0 || quadrant === 3 ? R - w / 2 + 0.6 : R + w / 2 - 0.6;
  for (let i = 0; i < steps * 2; i++) {
    const a = a0 + ((i + 0.5) / (steps * 2)) * (Math.PI / 2),
      b = a0 + ((i + 1.5) / (steps * 2)) * (Math.PI / 2);
    const x0 = cx + Math.cos(a) * edge,
      x1 = cx + Math.cos(b) * edge;
    const width = Math.abs(x1 - x0);
    if (width < 0.01) continue;
    const along = (edge * (a - a0) * P) % (skirt.width - width * P - 1);
    ctx.drawImage(skirt, along, 0, Math.max(1, width * P), skirt.height, Math.min(x0, x1), cy + Math.sin(a) * edge, width + 0.06, depth);
  }
  for (let i = 0; i < steps; i++) {
    const a = a0 + (i / steps) * (Math.PI / 2),
      length = (R * Math.PI) / 2 / steps;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.rotate(a);
    const along = (R * (a - a0)) % (h - length - 0.4);
    ctx.drawImage(deck, 0, along * P, deck.width, (length + 0.4) * P, -w / 2, -0.1, w, length + 0.5);
    ctx.restore();
  }
  corners[quadrant] = { image, dx: -cx, dy: -cy, w: image.width / P, h: image.height / P };
  return corners[quadrant];
}

function cornerCentres() {
  const { left, right, top, bottom, cornerR: R } = town.ring;
  return [
    [right - R, top + R],
    [right - R, bottom - R],
    [left + R, bottom - R],
    [left + R, top + R],
  ];
}

// Deck along both side legs and round the four corners, with the truss floors over la Ferre.
// Everything here is overhead: it is drawn after the street and whoever is on it.
export function drawSideDeck(ox, oy) {
  const ring = town.ring,
    up = lift();
  const { left, right, top, bottom, cornerR: R } = ring;
  const viewTop = oy - 20,
    viewBottom = oy + game.vh + 20;
  const river = town.river;
  for (const x of [left, right]) {
    if (x < ox - 20 || x > ox + game.vw + 20) continue;
    const y0 = Math.max(top + R - up, viewTop),
      y1 = Math.min(bottom - R - up, viewBottom);
    if (y1 > y0) layStrip(artwork.ringDeck, x, y0, y1);
    if (river) {
      const r0 = Math.max(river.top - 6 - up, viewTop),
        r1 = Math.min(river.bottom + 6 - up, viewBottom);
      if (r1 > r0) layStrip(artwork.railBridgeBed, x, r0, r1);
    }
  }
  for (const [quadrant, [cx, cy]] of cornerCentres().entries()) {
    if (cx + R + 12 < ox || cx - R - 12 > ox + game.vw || cy - up + R + 20 < oy || cy - up - R - 12 > oy + game.vh) continue;
    const sprite = corner(quadrant);
    g.drawImage(sprite.image, cx + sprite.dx, cy - up + sprite.dy, sprite.w, sprite.h);
  }
}

// What stands over a train: the bracing of the rail bridges and the platform canopies.
export function drawOverTrain(ox, oy) {
  const ring = town.ring,
    up = lift();
  const river = town.river;
  if (river)
    for (const x of [ring.left, ring.right]) {
      if (x < ox - 20 || x > ox + game.vw + 20) continue;
      const r0 = Math.max(river.top - 6 - up, oy - 20),
        r1 = Math.min(river.bottom + 6 - up, oy + game.vh + 20);
      if (r1 > r0) layStrip(artwork.railBridgeTop, x, r0, r1);
    }
  const canopies = artwork.ringCanopies,
    size = unit(canopies);
  // Platform centre in the sprite, from the painting's (440, 744) in a box starting at (356, 548).
  const centre = [((440 - 356) * CELL_W) / 1500, ((744 - 548) * CELL_H) / 1000];
  for (const st of ring.stations) {
    const { x, y } = st.stop;
    if (x < ox - 60 || x > ox + game.vw + 60 || y - up < oy - 60 || y - up > oy + game.vh + 60) continue;
    if (Math.abs(x - ring.left) < 1 || Math.abs(x - ring.right) < 1) {
      g.drawImage(canopies, x - centre[0], y - up - centre[1], size.w, size.h);
      continue;
    }
    // On the north and south legs the near canopy is part of the station painting.
    const { col, row } = town.cellAt(x, y);
    const key = town.cellKinds[row][col];
    if (!paintings[key]?.viaduct?.station) continue;
    const { near } = spanForeground(key);
    const cx = X(col),
      cy = Y(row);
    g.drawImage(
      plates[key],
      (stationSpan.left + CELL_W / 2) * P,
      (near[0] + CELL_H / 2) * P,
      (stationSpan.right - stationSpan.left) * P,
      (near[1] - near[0]) * P,
      cx + stationSpan.left,
      cy + near[0],
      stationSpan.right - stationSpan.left,
      near[1] - near[0],
    );
  }
}

// The painted supports of the side legs, each sorted with the street at its foot.
export function sideSupportSprites(ox, oy) {
  const ring = town.ring,
    sprites = [];
  const bracket = artwork.ringBracket,
    portal = artwork.ringPortal;
  const b = unit(bracket),
    p = unit(portal);
  // Sprite anchors: the bracket's column foot and the portal's track centre line.
  const bracketFoot = ((564 - 474) * CELL_W) / 1500,
    portalCentre = ((1060 - 996) * CELL_W) / 1500;
  const seen = new Set();
  for (const pier of ring.piers) {
    if (pier.orientation !== "vertical" || pier.abutment) continue;
    const key = pier.side + pier.y;
    if (seen.has(key)) continue;
    seen.add(key);
    const x = pier.side === "west" ? ring.left : ring.right;
    if (x < ox - 40 || x > ox + game.vw + 40 || pier.y < oy - 6 || pier.y - 56 > oy + game.vh) continue;
    sprites.push({
      y: pier.y,
      draw: (overhead) => {
        if (overhead) return;
        if (pier.side === "west")
          g.drawImage(bracket, x + sideSupports.west.dx - bracketFoot, pier.y - b.h + 0.6, b.w, b.h);
        else g.drawImage(portal, x - portalCentre, pier.y - p.h + 0.4, p.w, p.h);
      },
    });
  }
  return sprites;
}
