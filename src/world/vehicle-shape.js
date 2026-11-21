export const sedanHalfLength = 10.95,
  sedanHalfWidth = 4.8;

export function carContact(a, b) {
  const dx = a.x - b.x,
    dy = a.y - b.y;
  const al = a.halfLength ?? 9.3,
    bl = b.halfLength ?? 9.3,
    aw = a.halfWidth ?? 4.45,
    bw = b.halfWidth ?? 4.45;
  const reach = Math.hypot(al, aw) + Math.hypot(bl, bw);
  if (Math.abs(dx) > reach || Math.abs(dy) > reach) return null;
  const ax = Math.cos(a.a),
    ay = Math.sin(a.a),
    bx = Math.cos(b.a),
    by = Math.sin(b.a);
  let depth = Infinity,
    nx = 0,
    ny = 0;
  for (const [x, y] of [
    [ax, ay],
    [-ay, ax],
    [bx, by],
    [-by, bx],
  ]) {
    const span =
      al * Math.abs(ax * x + ay * y) +
      bl * Math.abs(bx * x + by * y) +
      aw * Math.abs(ax * y - ay * x) +
      bw * Math.abs(bx * y - by * x);
    const side = dx * x + dy * y,
      overlap = span - Math.abs(side);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      nx = (side >= 0 ? 1 : -1) * x;
      ny = (side >= 0 ? 1 : -1) * y;
    }
  }
  return { depth, nx, ny };
}
