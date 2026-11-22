// Riding La Petite Ceinture: enter at a station's stair foot, board the next
// train, ride, and step off at a later stop. The trains themselves come from
// the timetable in ring-route.js; this module only moves the player.
import { dist, game, held, p, people } from "../core/state.js";
import { town } from "../world/town.js";
import { footBlocked, freeSpot } from "../world/collision.js";
import { lang, say } from "../ui/dialogs.js";
import { beep } from "../audio/mixer.js";
import {
  carriagesOf,
  doorsOpenAt,
  nextStop,
  platformSpot,
  rideRequest,
  rideStep,
  ringOf,
  timetable,
  trainsetAt,
} from "./ring-route.js";

const STATION_REACH = 14;
let line;
export function ringLine() {
  if (!line) {
    const ring = ringOf(town);
    line = { ring, tt: timetable(ring) };
  }
  return line;
}

export const stationName = (station) => station.name[lang] ?? station.name.fr;

// The station whose stair foot the walker stands at.
export function nearStation(o = p) {
  if (game.ride || game.transit) return null;
  let best = null,
    d = STATION_REACH;
  for (const st of ringLine().ring.stations) {
    const here = dist(o, st.street);
    if (here < d) {
      d = here;
      best = st;
    }
  }
  return best;
}

export function enterStation(station) {
  const { ring } = ringLine();
  const index = ring.stations.indexOf(station);
  game.transit = { phase: "platform", station: index };
  held.clear();
  Object.assign(p, platformSpot(ring, station), { moving: false, stuck: 0 });
  beep(520, 0.08, "sine");
  say("platformWait", 5, "", " " + stationName(station) + ".");
}

function streetAt(station) {
  const { x, y } = station.street;
  const spot = footBlocked(x, y, 2.6) ? freeSpot(x, y, 2.6) : null;
  Object.assign(p, spot ?? { x, y }, { a: Math.PI / 2, moving: false, stuck: 0 });
}

function apply(result) {
  const { ring } = ringLine();
  game.transit = result.ride;
  const station = ring.stations[result.station];
  switch (result.event) {
    case "boarded":
      beep(330, 0.12, "sine");
      say("boarded", 4);
      break;
    case "alightRequested":
      beep(880, 0.05, "sine");
      say("alightRequest", 4, "", " " + stationName(station) + ".");
      break;
    case "leftPlatform":
      streetAt(station);
      say("leftPlatform", 3);
      break;
    case "alighted": {
      streetAt(station);
      // Riding away from the station where they lost sight of you shakes off any tail.
      const pursued = game.heat > 0.25 || people.some((n) => n.anger > 0 || (n.kind === "inspector" && !n.down));
      if (result.station !== result.boardedAt) {
        game.heat = 0;
        for (const n of people) n.anger = 0;
      }
      if (pursued && result.station !== result.boardedAt) say("lostTail", 5, "dispatch");
      else say("alighted", 4, "", " " + stationName(station) + ".");
      break;
    }
  }
}

// The car key while in a station or on a train.
export function transitControl() {
  apply(rideRequest(ringLine().tt, game.transit, game.time));
}

function chime() {
  beep(659, 0.22, "sine");
  setTimeout(() => beep(523, 0.3, "sine"), 230);
}

let lastStops = [];
export function updateTransit(dt) {
  const { ring, tt } = ringLine();
  // A chime as a train pulls in where the player can see or hear it.
  for (let k = 0; k < tt.sets; k++) {
    const st = trainsetAt(tt, k, game.time);
    const arrived = st.station >= 0 && lastStops[k] !== st.station;
    lastStops[k] = st.station;
    if (!arrived) continue;
    const mine = game.transit && (game.transit.set === k || game.transit.station === st.station);
    const stop = ring.stations[st.station].stop;
    if (mine || Math.hypot(stop.x - game.camX, stop.y + ring.deckLift - game.camY) < game.vw * 0.6) chime();
  }
  if (!game.transit) return;
  const result = rideStep(tt, game.transit, game.time);
  if (result.event) apply(result);
  if (game.transit?.phase === "riding") {
    const car = carriagesOf(tt, trainsetAt(tt, game.transit.set, game.time))[game.transit.car];
    Object.assign(p, { x: car.x, y: car.y, a: car.a, moving: false });
  }
}

// The camera follows the raised deck, not the ground below it.
export function transitFocus() {
  if (!game.transit) return null;
  return { x: p.x, y: p.y - ringLine().ring.deckLift };
}

// What the hint line says while in the station or on the train.
export function transitHint(t) {
  const { ring, tt } = ringLine();
  if (!game.transit) return "";
  if (game.transit.phase === "platform") return t("platformHint");
  const alightAt = game.transit.alightAt;
  if (alightAt !== null) return t("alightingHint") + " " + stationName(ring.stations[alightAt]);
  const here = doorsOpenAt(tt, game.transit, game.time);
  if (here >= 0) return t("doorsOpenHint") + " " + stationName(ring.stations[here]) + "  ·  " + t("alightNowKey");
  const next = nextStop(tt, game.transit, game.time);
  return t("nextStopHint") + " " + stationName(ring.stations[next]) + "  ·  " + t("alightKey");
}
