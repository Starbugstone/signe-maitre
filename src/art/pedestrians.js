import { fighterLook, isFighter } from "../world/population.js";
import { shadow } from "./vehicles.js";
import { g } from "../platform/canvas.js";
import { artwork, game, held } from "../core/state.js";
import { slapDuration } from "../game/slap.js";
import { TAU } from "../world/town.js";
import { drawHero } from "./hero.js";
import { advanceGait, advanceStroll, createGait, createStroll, facingRow, rows } from "./gait.js";
import { crowdPose, dazedStars } from "./emergency.js";

// Ground between two footfalls of each painted walk, in world units.
const fighterStride = 5,
  civilianStride = 6.1,
  medicStride = 6.3;
const strolls = new WeakMap();
function strollOf(n, stride) {
  let stroll = strolls.get(n);
  if (!stroll) strolls.set(n, (stroll = createStroll()));
  return advanceStroll(stroll, { x: n.x, y: n.y, heading: n.a, now: game.time, stride });
}
// The painted stride at this point of the cycle: `cycle` lists footfall, passing, footfall, passing.
// `hold` is the share of each step spent on its footfall frame.
function strideFrame(stroll, cycle, hold = 0.5) {
  const step = stroll.turn * 2 + hold / 2;
  return cycle[(Math.floor(step) % 2) * 2 + (step - Math.floor(step) < hold ? 0 : 1)];
}
// Weight drops onto each footfall and rises over the standing leg; a hurried body leans and bounds.
function carry(stroll, forward) {
  const fall = Math.cos(2 * TAU * stroll.turn),
    hurry = stroll.hurry || 0;
  g.translate(0, -0.42 * hurry * (0.5 + 0.5 * fall));
  if (forward) g.rotate(forward * 0.09 * hurry);
  g.scale(1 + 0.01 * fall, 1 - (0.02 + 0.012 * hurry) * fall);
}

function drawFighter(n) {
  const stroll = strollOf(n, fighterStride),
    row = stroll.row;
  let frame = 0;
  if (n.down) frame = 6;
  else if (n.stagger > 0) frame = 5;
  else if (n.swing > 0) frame = n.swing > 0.21 ? 3 : n.swing > 0.08 ? 4 : 0;
  else if (stroll.walking) {
    // Fighters have two painted strides and pass through their standing pose between them:
    // keep that beat short, shorter still at a run, so they stomp along instead of shuffling.
    frame = strideFrame(stroll, [1, 0, 2, 0], 0.64 + 0.2 * stroll.hurry);
    carry(stroll, row === rows.right ? 1 : row === rows.left ? -1 : 0);
  }
  g.drawImage(artwork[fighterLook(n)], frame * 144, row * 128, 144, 128, -9, -15.625, 18, 16);
}

const stride = createGait();
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
    now: performance.now() / 1000,
  });
  let pose = stride;
  if (striking) {
    // A slap faces its target, whatever the stride was showing.
    stride.row = vertical ? (Math.sin(n.a) > 0 ? rows.down : rows.up) : game.lastDir > 0 ? rows.right : rows.left;
    stride.settle = 0;
    pose = {
      row: stride.row,
      strike: Math.min(3, Math.floor(((slapDuration - game.flash) / slapDuration) * 4)),
    };
  }
  // Both feet leave the ground on each reach of the run: the shadow tightens under him.
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
    const stroll = strollOf(n, medicStride),
      walking = stroll.walking && !(n.stagger > 0),
      sideways = stroll.row === rows.right || stroll.row === rows.left,
      row = sideways ? 0 : stroll.row;
    if (stroll.row === rows.left) g.scale(-1, 1);
    if (n.stagger > 0) g.rotate(-0.12 * Math.sin((n.stagger / 0.33) * Math.PI));
    if (walking) carry(stroll, sideways ? 1 : 0);
    g.drawImage(
      artwork.rescueMedic,
      (walking ? strideFrame(stroll, [1, 2, 3, 2]) : 0) * 104,
      row * 148,
      104,
      148,
      -5.2,
      -14.5,
      10.4,
      14.8,
    );
  } else {
    if (n.down || n.swing > 0 || n.stagger > 0) {
      const column = n.down ? 3 : n.swing > 0 ? Math.min(2, Math.floor(((0.37 - n.swing) / 0.37) * 3)) : 2;
      crowdPose(n, column);
      g.restore();
      if (n.down) dazedStars(n);
      return;
    }
    const stroll = strollOf(n, civilianStride),
      sideways = stroll.row === rows.right || stroll.row === rows.left;
    if (stroll.row === rows.left) g.scale(-1, 1);
    if (stroll.walking) carry(stroll, sideways ? 1 : 0);
    const cycle = stroll.walking ? strideFrame(stroll, [1, 2, 3, 4]) : 0;
    g.drawImage(artwork[n.look], cycle * 92, (sideways ? 0 : stroll.row) * 114, 92, 114, -5.6, -13.65, 11.2, 13.8);
  }
  g.restore();
  if (n.down) dazedStars(n);
}

export { dude };
