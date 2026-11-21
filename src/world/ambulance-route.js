import { town, W, H, X, Y } from "./town.js";
import { blocked } from "./collision.js";
import { outsideView } from "./viewport.js";

export function walkableBetween(a, b) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    if (blocked(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 2)) return false;
  }
  return true;
}
// Try the patient's curb first. A parked vehicle may require a neighbouring lane,
// a bay further along the street, or an approach from the other direction.
export function planApproach(patient, view, occupied) {
  const { col, row } = town.cellAt(patient.x, patient.y);
  const streets = [
    { horizontal: true, centre: Y(row), along: patient.x, cross: patient.y },
    { horizontal: false, centre: X(col), along: patient.y, cross: patient.x },
  ].sort((a, b) => Math.abs(a.cross - a.centre) - Math.abs(b.cross - b.centre));
  for (const road of streets) {
    const { horizontal, centre, along, cross } = road;
    const point = (u, w) => (horizontal ? { x: u, y: w } : { x: w, y: u });
    const extent = horizontal ? W : H;
    const bounds = horizontal ? [view.left, view.right] : [view.top, view.bottom];
    const curb = Math.sign(cross - centre) || 1;
    for (const inset of [11, 5, -6, 0, -11])
      for (const shift of [0, 14, -14, 27, -27]) {
        const apron = point(along + shift, centre + curb * inset);
        if (!walkableBetween(apron, patient)) continue;
        // Enter with the traffic in that lane: block circuits run clockwise, so the north
        // and east lanes head west and north. The centre line has no flow to follow.
        const offset = curb * inset,
          flow = horizontal ? Math.sign(offset) : -Math.sign(offset),
          first = flow || (along < extent / 2 ? -1 : 1);
        for (const sign of [first, -first]) {
          const end = along + shift + sign * 24;
          if (end < 17 || end > extent - 17) continue;
          let start = end - sign * 65;
          if (!outsideView(point(start, centre + curb * inset), view))
            start = sign > 0 ? bounds[0] - 42 : bounds[1] + 42;
          if (start < 7 || start > extent - 7) continue;
          const stop = { ...point(end, centre + curb * inset), horizontal },
            spawn = point(start, centre + curb * inset);
          if (!outsideView(spawn, view)) continue;
          const dx = horizontal ? sign : 0,
            dy = horizontal ? 0 : sign,
            a = Math.atan2(dy, dx);
          const steps = Math.ceil(Math.abs(end - start) / 4);
          let clear = true;
          for (let k = 0; k <= steps; k++) {
            const q = point(start + ((end - start) * k) / steps, centre + curb * inset);
            if (blocked(q.x, q.y, 6) || occupied({ ...q, a, halfLength: 13.3, halfWidth: 5.45 })) {
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
