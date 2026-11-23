import { cars, dist, game, p } from "../core/state.js";
import { boatFleet, river } from "../game/boats.js";
import { ringLine, stationName } from "../game/transit.js";
import { directions } from "../world/navigation.js";
import { walkableBetween } from "../world/ambulance-route.js";
import { town, Y } from "../world/town.js";
import { $, hud } from "../platform/canvas.js";
import { t } from "./dialogs.js";

let trip;

export function nearestBike(origin) {
  return nearest(cars.filter((car) => car.model === "moto" && !car.route && car.condition > 0 && car !== game.ride), origin);
}

function nearest(points, origin, position = (point) => point) {
  return points.reduce((best, point) => !best || dist(origin, position(point)) < dist(origin, position(best)) ? point : best, null);
}

export function tripOptions(origin) {
  const bike = nearestBike(origin);
  const mooring = nearest(river.moorings.filter(hasBoat), origin, (m) => m.quay);
  const station = nearest(ringLine().ring.stations, origin, (s) => s.street);
  return { bike, mooring, station };
}

export function hasBoat(mooring) {
  return boatFleet.boats.some((boat) => boat.mooring === mooring.id);
}

export function selectTrip(kind, origin) {
  if (trip?.kind === kind) {
    trip = null;
    return;
  }
  const destination = tripOptions(origin)[kind];
  if (!destination) return;
  const point = destination.quay ?? destination.street ?? destination;
  const startQuay = river.moorings.find((m) => dist(origin, m.quay) < 32);
  trip = {
    kind, destination, point,
    approach: kind === "mooring" ? quayApproach(point) : null,
    departure: startQuay ? quayApproach(startQuay.quay) : null,
  };
}

function quayApproach(point) {
  const streetY = Y(town.cellAt(point.x, point.y).row);
  if (walkableBetween({ x: point.x, y: streetY }, point, 2.6)) return null;
  // Join the promenade through the closest clear opening beside the berth.
  for (let offset = 10; offset <= 140; offset += 10) {
    for (const x of [point.x - offset, point.x + offset]) {
      const bend = { x, y: point.y };
      if (walkableBetween({ x, y: streetY }, bend, 2.6) && walkableBetween(bend, point, 2.6)) return { ...bend, streetY };
    }
  }
  return null;
}

export function tripPath(guide, origin = p) {
  const { point, approach, departure } = guide;
  const viaQuay = departure && !game.ride && dist(origin, departure) < 145 &&
    walkableBetween(origin, departure, 2.6) &&
    !walkableBetween(origin, { x: origin.x, y: departure.streetY }, 2.6);
  const from = viaQuay ? departure : origin;
  const to = approach && (dist(origin, point) >= 115 || !walkableBetween(origin, point, 2.6)) ? approach : point;
  const path = directions(from, to).path;
  return from === origin && to === point ? path :
    [...(from === origin ? [] : [origin]), ...path, ...(to === point ? [] : [point])];
}

export function currentTrip() {
  if (!trip) return null;
  const { kind, destination } = trip;
  if (
    (kind === "bike" && (game.ride === destination || destination.condition === 0)) ||
    (kind === "mooring" && !hasBoat(destination)) ||
    (kind === "station" && game.transit)
  ) trip = null;
  return trip;
}

export function tripName({ kind, destination }) {
  if (kind === "station") return stationName(destination);
  if (kind === "bike") return t(destination.label);
  return t(boatFleet.boats.find((boat) => boat.mooring === destination.id).model);
}

const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];

export function travelHUD(guide, ready, stopToWalk, angle) {
  $("#travelCard").hidden = !guide || game.viewMap;
  if (!guide || game.viewMap) return;
  const { point, kind } = guide;
  hud("#travelType", t(kind === "bike" ? "travelBike" : kind === "mooring" ? "travelBoat" : "travelTrain"));
  hud("#travelTitle", tripName(guide));
  hud("#travelDistance", ready || stopToWalk ? "" : Math.round(dist(p, point) * 0.15) + " m");

  let instruction = t(ready ? "onSite" : "travelPark");
  if (!ready && !stopToWalk && angle !== undefined) {
    instruction = arrows[(8 + Math.round(angle / (Math.PI / 4))) % 8] + " " + t("travelFollow");
  }
  hud("#travelStep", instruction);
}
