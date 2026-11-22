// Ride La Petite Ceinture: walk the streets to the nearest ring station, climb to the
// platform with the car control and board the next train. Stay aboard through the
// following stops until the train has turned a corner and crossed la Ferre on a rail
// bridge, then ask for the next stop and step off there. The parked sedan and the
// case state must not change.
import { town } from "../../../../src/world/town.js";
import { findRoute } from "../../../../src/world/routes.js";

export const meta = { feature: "ring-train", needs: "probe" };

const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// Follow the street graph on foot, as a player reading the map would.
export async function walkToStation(d, from, station, options = {}) {
  const path = findRoute(town, from, station.street, { onFoot: true });
  for (const point of path.slice(1, -1)) await d.walkTo(point, { tol: 12, run: true, ...options });
  await d.walkTo(station.street, { tol: 5, ...options });
}

export default async function (d) {
  const start = await d.state();
  const { stations } = start.ring;
  const near = (s) => Math.hypot(s.street.x - start.p.x, s.street.y - start.p.y);
  const first = stations.reduce((best, s) => (near(s) < near(best) ? s : best));
  const firstIndex = stations.indexOf(first);
  const { river } = town;

  await d.step("walk-to-station", async () => {
    await walkToStation(d, start.p, first);
    const { hud } = await d.waitFor("station prompt", ({ hud }) => hud.hint.includes(d.t("stationHint")), 4000);
    d.expect(hud.hint.includes(d.t("stationHint") + " · " + first.name), "the hint offers the Petite Ceinture at " + first.id, hud.hint);
  });

  await d.step("climb-to-platform", async () => {
    await d.press("car");
    // A train already standing with open doors takes the player aboard at once.
    const { state, hud } = await d.waitFor("on the platform",
      ({ state, hud }) =>
        (state.transit?.phase === "platform" && hud.hint.includes(d.t("platformHint").split(" · ")[0])) ||
        (state.transit?.phase === "riding" && state.transit.boardedAt === firstIndex), 4000);
    const station = state.transit.phase === "platform" ? state.transit.station : state.transit.boardedAt;
    d.expect(station === firstIndex, "the player climbs to the platform of " + first.id, state.transit);
    if (state.transit.phase === "platform") {
      d.expect(hud.hint.includes(d.t("platformHint").split(" · ")[0]), "the hint says the player is on the platform", hud.hint);
      // The platform is on the stair side of the track, above the street.
      const across = (state.p.x - first.stop.x) * (first.street.x - first.stop.x) + (state.p.y - first.stop.y) * (first.street.y - first.stop.y);
      d.expect(across > 0, "the player waits on the stair side of the track", { p: state.p, stop: first.stop, street: first.street });
    } else d.note("a train was already at the platform; boarded at once", state.transit);
  });

  let set;
  await d.step("board", async () => {
    const { state, hud } = await d.waitFor("aboard",
      ({ state, hud }) => state.transit?.phase === "riding" && hud.hint.includes(d.t("doorsOpenHint")), 90000);
    set = state.transit.set;
    d.expect(state.transit.boardedAt === firstIndex, "the player boards at " + first.id, state.transit);
    d.expect(hud.hint.includes(d.t("doorsOpenHint")), "the hint offers to get off while the doors are open", hud.hint);
  });

  // Every poll from departure on records the rider's heading and where they have been,
  // so a slow capture cannot miss the corner or the bridge.
  let departure = null,
    widest = 0,
    bridge = null,
    passed = new Set(),
    shots = new Set();
  const watch = ({ state }) => {
    if (state.transit?.phase !== "riding" || departure === null) return;
    widest = Math.max(widest, turn(state.p.a, departure));
    const train = state.ring.trains[set];
    if (train.station >= 0 && train.station !== firstIndex) passed.add(train.station);
    if (!shots.has("corner") && widest > 0.7) {
      shots.add("corner");
      d.shot("mid-corner").catch(() => {});
    }
    if (state.p.y > river.top && state.p.y < river.bottom && Math.abs(Math.cos(state.p.a)) < 0.2) {
      bridge ??= { x: state.p.x, y: state.p.y };
      if (!shots.has("bridge")) {
        shots.add("bridge");
        d.shot("on-rail-bridge").catch(() => {});
      }
    }
  };

  await d.step("train-departs", async () => {
    const { state, hud } = await d.waitFor("moving",
      ({ state, hud }) => state.ring.trains[set].station === -1 && state.ring.trains[set].v > 5 && hud.hint.includes(d.t("nextStopHint")), 20000);
    departure = state.p.a;
    const named = stations.find((s) => hud.hint.includes(d.t("nextStopHint") + " " + s.name));
    d.expect(named && named.id !== first.id, "the hint names the next stop once moving", hud.hint);
    const rider = state.ring.trains[set].cars[1];
    d.expect(Math.hypot(rider.x - state.p.x, rider.y - state.p.y) < 0.5, "the player rides in the middle carriage", { rider, p: state.p });
    d.expect(Math.abs(state.cam.y - (state.p.y - state.ring.deckLift)) < 40, "the camera follows the raised carriage", { cam: state.cam, p: state.p });
  });

  await d.step("ride-through-corner-and-over-la-ferre", async () => {
    await d.waitFor("a corner and a rail bridge", (seen) => (watch(seen), widest > 1.4 && bridge !== null && seen.state.p.y > river.bottom + 20), 240000);
    const state = await d.state();
    d.expect(state.transit?.phase === "riding", "the player stays aboard through the stops nobody asked for", { transit: state.transit, passed: [...passed] });
    d.expect(passed.size > 0, "the train called at stations on the way without dropping the player", [...passed].map((i) => stations[i].id));
    d.expect(widest > 1.4, "the carriage turned through a corner of the ring", { departure, widest });
    d.expect(bridge !== null, "the train crossed la Ferre on a rail bridge", bridge);
  });

  let next;
  await d.step("request-next-stop", async () => {
    await d.press("car");
    const { state, hud } = await d.waitFor("stop requested",
      ({ state, hud }) => state.transit?.alightAt != null && hud.hint.includes(d.t("alightingHint")), 3000);
    next = stations[state.transit.alightAt];
    d.expect(next.id !== first.id, "the request is for a later station, " + next.id, state.transit);
    d.expect(hud.hint.includes(d.t("alightingHint") + " " + next.name), "the hint confirms the stop", hud.hint);
  });

  await d.step("alight", async () => {
    const { state, hud } = await d.waitFor("on foot",
      ({ state, hud }) => state.transit === null && !hud.hint.includes(d.t("alightingHint")), 90000);
    const there = Math.hypot(state.p.x - next.street.x, state.p.y - next.street.y);
    d.expect(there < 12, "the player is at the stair foot of " + next.id, { p: state.p, street: next.street });
    d.expect(!hud.hint.includes(d.t("nextStopHint")), "the riding hint is gone", hud.hint);
  });

  await d.step("walk-off", async () => {
    const before = (await d.state()).p;
    // Step away from the viaduct: the stair foot is on the street side.
    const away = Math.abs(next.street.x - next.stop.x) > Math.abs(next.street.y - next.stop.y) ? (next.street.x > next.stop.x ? "right" : "left") : "down";
    await d.hold([away], 500);
    const after = (await d.state()).p;
    d.expect(Math.hypot(after.x - before.x, after.y - before.y) > 4, "the player walks away from the station", { before, after });
  });

  const end = await d.state();
  d.expect(
    Math.hypot(end.sedan.x - start.sedan.x, end.sedan.y - start.sedan.y) < 0.5,
    "the parked sedan stayed where it was",
    { before: start.sedan, after: end.sedan },
  );
  d.expect(end.active === start.active && end.done.length === start.done.length, "the case state is unchanged", end);
}
