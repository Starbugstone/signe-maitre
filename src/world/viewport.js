// The same clamped rectangle drives the street camera and the dispatch boundary.
export function viewport(cx, cy, width, height, worldWidth, worldHeight) {
  const left = Math.min(Math.max(cx - width / 2, 0), Math.max(0, worldWidth - width));
  const top = Math.min(Math.max(cy - height / 2, 0), Math.max(0, worldHeight - height));
  return { left, top, right: left + width, bottom: top + height };
}
export function outsideView(point, view, margin = 38) {
  return (
    point.x + margin < view.left ||
    point.x - margin > view.right ||
    point.y + margin < view.top ||
    point.y - margin > view.bottom
  );
}
