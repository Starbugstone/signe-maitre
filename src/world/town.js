import { buildTown, CELL_W, CELL_H, X, Y } from "./layout.js";
export { CELL_W, CELL_H, X, Y };
export const TAU = 2 * Math.PI;
export const definition = {
  blocks: [
    ["garage", "docks", "square", "garage", "garage", "square"],
    ["square", "garage", "market", "square", "docks", "market"],
    ["market", "square", "garage", "docks", "market", "garage"],
    ["garage", "market", "square", "garage", "docks", "square"],
    ["square", "garage", "market", "docks", "square", "market"],
    ["docks", "square", "garage", "market", "garage", "docks"],
  ],
  canalRow: 2,
  railways: [1, 2, 4, 5].map((row, i) => ({
    row,
    from: "west",
    to: "east",
    speed: 49 + 3 * i,
    phase: 420 + i * 347,
  })),
  addresses: [
    { id: "office", col: 2, row: 1, dx: 63, dy: -21, symbol: "É", color: "#ffc857" },
    { id: "repo", col: 1, row: 0, dx: 69, dy: -20, symbol: "R", color: "#ff79ae" },
    { id: "noise", col: 4, row: 3, dx: -57, dy: -18, symbol: "C", color: "#64ebd0" },
    { id: "flat", col: 0, row: 4, dx: 77, dy: -22, symbol: "S", color: "#ffa851" },
    { id: "auction", col: 3, row: 4, dx: 72, dy: -20, symbol: "A", color: "#c2a0ff" },
  ],
  interiors: [
    {
      door: "office",
      image: "officeInterior",
      width: 160,
      height: 100,
      floor: { left: 14, right: 146, top: 63, bottom: 94 },
      entry: { x: 80, y: 90 },
      exit: { x: 80, y: 93 },
      desk: { x: 80, y: 65 },
      action: "caseDesk",
    },
  ],
};
export const town = buildTown(definition);
export const { blocks: city, width: W, height: H, jobs, roadsX, roadsY, canalRow } = town;
export const office = town.byId.get("office"),
  auction = town.byId.get("auction");
export const canalTop = Y(canalRow) + 16,
  canalBottom = Y(canalRow + 1) - 15;
