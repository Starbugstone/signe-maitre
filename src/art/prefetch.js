// Ask for the large paintings the next frames will draw: the street within a cell of the view,
// and the vehicles, boats and trains near it. See residency.js for why they must be ready early.
import { cars, game } from "../core/state.js";
import { CELL_H, CELL_W } from "../world/town.js";
import { paintingsIn } from "../world/streets.js";
import { boatFleet } from "../game/boats.js";
import { ringLine } from "../game/transit.js";
import { carriagesOf, trainsetAt } from "../game/ring-route.js";
import { vehicleSheets } from "./fleet-art.js";
import { settle, want } from "./residency.js";

const reachX = CELL_W / 2,
  reachY = CELL_H / 2,
  moving = 160;

export function prefetchArt(ox, oy) {
  const ahead = paintingsIn(ox - reachX, oy - reachY, game.vw + 2 * reachX, game.vh + 2 * reachY);
  const inView = paintingsIn(ox, oy, game.vw, game.vh);
  for (const key of ahead) want(key, inView.has(key));
  const near = (o, extra = 0) =>
    o.x > ox - moving - extra && o.x < ox + game.vw + moving + extra && o.y > oy - moving - extra && o.y < oy + game.vh + moving + extra;
  const seen = (o, extra) => o.x > ox - extra && o.x < ox + game.vw + extra && o.y > oy - extra && o.y < oy + game.vh + extra;
  for (const v of cars) if (near(v, 30)) for (const key of vehicleSheets(v)) want(key, seen(v, 30));
  if (game.ride && game.ride.domain !== "water") for (const key of vehicleSheets(game.ride)) want(key, true);
  for (const boat of boatFleet.boats) if (near(boat, 60)) want(boat.model + "Turns", seen(boat, 60));
  const { tt } = ringLine();
  for (let k = 0; k < tt.sets; k++)
    for (const car of carriagesOf(tt, trainsetAt(tt, k, game.time)))
      if (near(car, 60)) {
        want(car.cab ? "ringTrainCabTurns" : "ringTrainTurns", seen(car, 60));
        if (car.cab) want("ringTrainTurns");
      }
  settle();
}
