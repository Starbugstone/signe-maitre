// Gait bookkeeping for drawn characters. It reads where a body is and how far it has gone,
// and answers which way the sprite faces and where it is in its stride. No drawing, no DOM.

// Ground covered between two footfalls, in world units. They match the painted strides.
const strides = { walk: 6.8, run: 13.6 };
const rows = { right: 0, down: 1, up: 2, left: 3 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// A diagonal keeps the facing already shown: the sprite turns only when the heading clearly leaves it.
function facingRow(heading, current) {
  const s = Math.sin(heading),
    c = Math.cos(heading),
    upright = current === rows.down || current === rows.up;
  if (Math.abs(s) > (upright ? 0.62 : 0.8)) return s > 0 ? rows.down : rows.up;
  return c >= 0 ? rows.right : rows.left;
}
const sideways = (row) => row === rows.right || row === rows.left;

// crawl: slower than this, in world units a second, is standing.
// firstStep: where in the cycle a fresh step starts, the first foot already lifting.
// turnDelay: how long a quarter turn must be held before the sprite follows, in seconds.
// pause: a halt shorter than this is a change of keys, not a new start.
const crawl = 4,
  firstStep = 0.14,
  turnDelay = 0.07,
  pause = 0.12;

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
    steppingIn: false,
  };
}

// Advance the player's gait. `distance` is the odometer of ground walked, `now` is in seconds.
function advanceGait(gait, { distance, moving, running, heading, now }) {
  const dt = gait.clock === null ? 0 : clamp(now - gait.clock, 0, 0.1),
    travelled = gait.distance === null ? 0 : clamp(distance - gait.distance, 0, 8);
  gait.clock = now;
  gait.distance = distance;
  // Pressed against a wall he may creep a hair each frame: that is standing, not a slow-motion walk.
  if (dt > 0 && travelled < dt * crawl) moving = false;
  if (moving) {
    const wanted = facingRow(heading, gait.row);
    if (!gait.moving && gait.rest > pause) {
      // Setting off from a standstill: face the way straight away and lift a foot.
      gait.turn = firstStep;
      gait.row = wanted;
      gait.turning = 0;
      gait.run = running ? 1 : 0;
    } else if (wanted === gait.row) gait.turning = 0;
    else {
      // Keys of a diagonal are never released together. A quarter turn waits a moment
      // so the sprite does not flick to the last key on the way to a stop.
      gait.turning += dt;
      if (sideways(wanted) === sideways(gait.row) || gait.turning >= turnDelay) {
        gait.row = wanted;
        gait.turning = 0;
      }
    }
    gait.turn += travelled / (2 * strides[running ? "run" : "walk"]);
    gait.turn -= Math.floor(gait.turn);
    gait.run = clamp(gait.run + (running ? dt : -dt) / 0.14, 0, 1);
    gait.rest = 0;
    // Only a body that has got going has momentum to settle when it halts.
    gait.settle = Math.min(1, gait.settle + dt / 0.12);
  } else {
    // Turned without walking (out of a car, through a door): face the new way at once.
    if (heading !== gait.heading && gait.heading !== undefined) gait.row = facingRow(heading, gait.row);
    if (gait.moving) {
      // Halted at full reach in profile, the trailing foot steps in before he stands; otherwise it just comes down.
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

// Passers-by: measure their own ground from frame to frame so the legs match the pace,
// whatever makes them move. `stride` is the ground between two footfalls at a walk.
function createStroll() {
  return { turn: 0, x: null, y: null, clock: null, row: null, speed: 0, hurry: 0, idle: Infinity, walking: false };
}
function advanceStroll(stroll, { x, y, heading, now, stride }) {
  const dt = stroll.clock === null ? 0 : now - stroll.clock;
  // After a pause in the simulation or a relocation, start again from here.
  const fresh = stroll.x === null || dt < 0 || dt > 0.25,
    travelled = fresh ? 0 : Math.hypot(x - stroll.x, y - stroll.y),
    jumped = travelled > 12;
  stroll.clock = now;
  stroll.x = x;
  stroll.y = y;
  // Standing or walking, the body faces its heading; diagonals keep the facing already shown.
  stroll.row = facingRow(heading, stroll.row ?? rows.right);
  if (dt <= 0 || fresh || jumped) return stroll;
  const speed = travelled / dt;
  stroll.speed += (speed - stroll.speed) * Math.min(1, dt * 12);
  if (speed > 3) {
    if (!stroll.walking && stroll.idle > pause) stroll.turn = firstStep;
    stroll.idle = 0;
    stroll.walking = true;
    // Hurrying lengthens the stride before it quickens the feet.
    stroll.hurry = clamp((stroll.speed - 24) / 20, 0, 1);
    stroll.turn += travelled / (2 * stride * (1 + 0.7 * stroll.hurry));
    stroll.turn -= Math.floor(stroll.turn);
  } else {
    stroll.idle += dt;
    // Being jostled for a frame is not a stop.
    if (stroll.idle > 0.1) stroll.walking = false;
  }
  return stroll;
}

export { advanceGait, advanceStroll, createGait, createStroll, facingRow, rows, strides };
