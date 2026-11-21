// All map coordinates are in world units. Artwork is registered to street centres.
export const CELL_W = 290,
  CELL_H = 228;
export const X = (col) => 75 + col * CELL_W;
export const Y = (row) => 72 + row * CELL_H;
const palettes = new Set(["market", "garage", "docks", "square"]);

export function buildTown({ blocks, canalRow, railways, addresses, interiors }) {
  const rows = blocks.length,
    cols = blocks[0]?.length ?? 0;
  if (
    rows < 2 ||
    cols < 2 ||
    blocks.some((row) => row.length !== cols || row.some((key) => !palettes.has(key)))
  )
    throw new Error("Town needs a rectangular grid of registered street paintings");
  if (!Number.isInteger(canalRow) || canalRow < 0 || canalRow + 1 >= rows)
    throw new Error("Canal needs two banks");
  const lines = new Map();
  for (const line of railways) {
    if (
      !Number.isInteger(line.row) ||
      line.row < 0 ||
      line.row >= rows ||
      line.row === canalRow + 1 ||
      lines.has(line.row)
    )
      throw new Error("Invalid or overlapping viaduct row " + line.row);
    if (line.from !== "west" || line.to !== "east")
      throw new Error("A through line must reach both town boundaries");
    if (!(line.speed > 0) || !Number.isFinite(line.phase)) throw new Error("Invalid train timetable");
    lines.set(line.row, line);
  }
  for (const [j, row] of blocks.entries()) {
    if (row.includes("market") && j !== canalRow + 1 && !lines.has(j))
      throw new Error("Market painting has an unconnected viaduct in row " + j);
  }
  const jobs = addresses.map(({ col, row, dx, dy, ...address }) => {
    if (!Number.isInteger(col) || !Number.isInteger(row) || !blocks[row]?.[col])
      throw new Error("Address outside town: " + address.id);
    return { ...address, name: address.id, x: X(col) + dx, y: Y(row) + dy };
  });
  const byId = new Map(jobs.map((job) => [job.id, job]));
  if (jobs.length !== byId.size) throw new Error("Duplicate address");
  const rooms = new Map();
  for (const room of interiors) {
    if (!byId.has(room.door) || rooms.has(room.door))
      throw new Error("Interior needs a unique street door: " + room.door);
    const f = room.floor;
    if (
      !f ||
      !(
        room.width > 0 &&
        room.height > 0 &&
        f.left >= 0 &&
        f.right <= room.width &&
        f.left < f.right &&
        f.top >= 0 &&
        f.bottom <= room.height &&
        f.top < f.bottom
      )
    )
      throw new Error("Invalid room floor");
    for (const point of [room.entry, room.exit, room.desk])
      if (!point || !(point.x >= f.left && point.x <= f.right && point.y >= f.top && point.y <= f.bottom))
        throw new Error("Unreachable room anchor: " + room.door);
    rooms.set(room.door, room);
  }
  // The two outer streets have 75 / 72 units of playable margin beyond their centres.
  const width = X(cols - 1) + 75,
    height = Y(rows - 1) + 72;
  function cellAt(x, y) {
    return {
      col: Math.max(0, Math.min(cols - 1, Math.round((x - X(0)) / CELL_W))),
      row: Math.max(0, Math.min(rows - 1, Math.round((y - Y(0)) / CELL_H))),
    };
  }
  function visibleCells(x, y, w, h, pad = 0) {
    const a = cellAt(x - pad, y - pad),
      b = cellAt(x + w + pad, y + h + pad);
    return { firstCol: a.col, lastCol: b.col, firstRow: a.row, lastRow: b.row };
  }
  return {
    blocks,
    rows,
    cols,
    width,
    height,
    lines,
    byId,
    jobs,
    rooms,
    cellAt,
    visibleCells,
    canalRow,
    roadsX: Array.from({ length: cols }, (_, i) => X(i)),
    roadsY: Array.from({ length: rows }, (_, i) => Y(i)),
  };
}
export function trainPosition(line, width, seconds) {
  const carLength = 51,
    gap = 0.6,
    count = 3,
    length = count * (carLength + gap);
  // Wrap only when the last carriage has cleared the playable boundary.
  return { head: (seconds * line.speed + line.phase) % (width + length + 36), carLength, gap, count };
}
