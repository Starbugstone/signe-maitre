import { town, CELL_H, CELL_W, X, Y } from "./town.js";

export function blockedIn(layout, x, y, r) {
  const W = layout.width,
    H = layout.height,
    canalTop = Y(layout.canalRow) + 16,
    canalBottom = Y(layout.canalRow + 1) - 15;
  if (x < r || y < r || x > W - r || y > H - r) return true;
  const { col, row } = layout.cellAt(x, y);
  const dx = Math.abs(x - X(col)),
    dy = y - Y(row);
  if (y > canalTop && y < canalBottom) {
    const f = (y - canalTop) / (canalBottom - canalTop);
    if (dx < 22 - r) return false;
    return f > 0.13 - r / 200 && f < 0.86 + r / 200;
  }
  // Service lanes run between the backs of the painted blocks.
  const seamX = Math.abs(dx - CELL_W / 2),
    seamY = Math.abs(Math.abs(dy) - CELL_H / 2);
  if (r < 4 && (seamX < 2.9 || seamY < 2.9)) return false;
  const foot = 28;
  // Walkable north pavement and cross streets follow the kerbs in the registered paintings.
  return dx > 25 - r && !(dy >= -foot + r && dy <= 17 - r);
}
const blocked = (x, y, r) => blockedIn(town, x, y, r);
function move(o, dx, dy, r) {
  let bump = false;
  if (!blocked(o.x + dx, o.y, r)) o.x += dx;
  else bump = true;
  if (!blocked(o.x, o.y + dy, r)) o.y += dy;
  else bump = true;
  return bump;
}

export { blocked, move };
