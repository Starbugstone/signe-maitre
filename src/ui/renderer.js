import { taunt, tauntLine } from "../game/taunts.js";
import { bodyExtra } from "../world/collision.js";
import { viewport } from "../world/viewport.js";
import { interior, drawInterior } from "../scenes/interiors.js";
import { t } from "./dialogs.js";
import { cars, dist, done, fx, game, p, people, trails } from "../core/state.js";
import { $, g, hud, label, rect } from "../platform/canvas.js";
import { CELL_H, CELL_W, H, TAU, W, X, Y, jobs, town } from "../world/town.js";
import { directions } from "../world/navigation.js";
import { goal, nextFile } from "../game/cases.js";
import { drawBridgeDecks, drawOverheadMonuments, drawStreetProp, streetLayer, visibleStreetProps } from "../world/streets.js";
import { target } from "../world/population.js";
import { ambulance, medicalCrew, nearbyPatient } from "../game/rescue.js";
import { drawAmbulance, drawCrew } from "../art/emergency.js";
import { drawVehicle } from "../art/fleet-art.js";
import { dude } from "../art/pedestrians.js";
import { visibleRails } from "../world/rail.js";
import { drawOverTrain } from "../world/ring-art.js";
import { arrivalMarker, drawRouteArrow, routeBearing } from "./waypoint.js";
import { atObjective, routeHUD, showMapSheet } from "./guidance.js";
import { drawBoats, drawMooring } from "../art/boats.js";
import { river } from "../game/boats.js";
import { berthInReach, boardingTarget } from "../game/boarding.js";
import { recoveryCar } from "../game/damage.js";
import { drawRingMap, drawRingTrains, ringActors } from "../art/train.js";
import { stationName, transitHint } from "../game/transit.js";
import { fleetOf } from "../game/fleet.js";
import { currentTrip, hasBoat, nearestBike, travelHUD, tripPath } from "./travel.js";

const addressPinHeight = 23;
const vehicleName = (vehicle) => t(vehicle.domain === "water" ? vehicle.model : vehicle.label || fleetOf(vehicle).label);

function speech(s, x, y, viewportLeft, markers) {
  g.save();
  g.font = "bold 4px system-ui";
  g.textAlign = "center";
  const width = g.measureText(s).width + 5;
  const center = Math.max(viewportLeft + width / 2 + 1, Math.min(x, viewportLeft + game.vw - width / 2 - 1));
  for (const marker of markers.sort((a, b) => b.y - a.y))
    if (Math.abs(marker.x - center) < width / 2 + 6 && Math.abs(marker.y - y) < 11) y = marker.y - 11;
  rect(g, center - width / 2, y - 5, width, 7, "#201728");
  rect(g, center - width / 2 + 0.45, y - 4.55, width - 0.9, 6.1, "#ffe7bc");
  g.fillStyle = "#ffe7bc";
  g.beginPath();
  g.moveTo(x - 1, y + 0.8);
  g.lineTo(x + 2, y + 0.8);
  g.lineTo(x, y + 3.8);
  g.fill();
  g.fillStyle = "#34202d";
  g.fillText(s, center, y + 0.1);
  g.restore();
}

function pin(j, x, y, small = false) {
  const r = small ? 1.35 : 3.4;
  g.fillStyle = "#191825";
  g.beginPath();
  g.arc(x, y, r + 0.55, 0, TAU);
  g.fill();
  g.fillStyle = j.color;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  if (!small) {
    g.textAlign = "center";
    label(g, j.symbol, x, y + 1.45, "#262132", 4.3);
    g.textAlign = "left";
  }
}

function map(left, top, w, h, full, origin = p) {
  rect(g, left - 2, top - 2, w + 4, h + 4, "#d3b991");
  rect(g, left, top, w, h, "#302d3d");
  const inset = full ? 5 : 1.5;
  const scale = Math.min((w - 2 * inset) / W, (h - 2 * inset) / H);
  const mw = W * scale,
    mh = H * scale;
  const x = left + (w - mw) / 2,
    y = top + (h - mh) / 2;

  g.save();
  // Parks.
  for (const pk of town.parks || []) {
    const px = x + (X(pk.cols[0]) - CELL_W / 2) * scale;
    const py = y + (Y(pk.rows[0]) - CELL_H / 2) * scale;
    const pw = (pk.cols[1] - pk.cols[0] + 1) * CELL_W * scale;
    const ph = (pk.rows[1] - pk.rows[0] + 1) * CELL_H * scale;
    rect(g, px, py, pw, ph, "#244236");
  }

  // River la Ferre.
  const river = town.river;
  if (river) {
    rect(g, left, y + river.top * scale, w, (river.bottom - river.top) * scale, "#2f6c7d");
    for (const isl of river.islands) {
      rect(
        g,
        x + isl.left * scale,
        y + isl.top * scale,
        (isl.right - isl.left) * scale,
        (isl.bottom - isl.top) * scale,
        "#484354",
      );
    }
  }

  // Road network rendered by class (alleys, streets, avenues) + roundabouts.
  for (const [cls, width, color] of [
    ["alley", full ? 0.55 : 0.22, "#655f70"],
    ["street", full ? 1.15 : 0.38, "#8a8390"],
    ["avenue", full ? 1.75 : 0.55, "#aba4b0"],
  ]) {
    g.beginPath();
    for (const e of town.roads.edges) {
      if (e.class !== cls) continue;
      const na = town.roadNodeById.get(e.a),
        nb = town.roadNodeById.get(e.b);
      g.moveTo(x + na.x * scale, y + na.y * scale);
      g.lineTo(x + nb.x * scale, y + nb.y * scale);
    }
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "round";
    g.stroke();
  }

  // Roundabouts on map.
  for (const node of town.roads.nodes) {
    if (node.kind !== "roundabout") continue;
    const rx = x + node.x * scale,
      ry = y + node.y * scale;
    g.beginPath();
    g.arc(rx, ry, Math.max(full ? 2.4 : 0.9, node.outerRadius * scale), 0, TAU);
    g.fillStyle = "#b3acb8";
    g.fill();
    g.beginPath();
    g.arc(rx, ry, Math.max(full ? 1.1 : 0.4, node.radius * scale), 0, TAU);
    g.fillStyle = "#342f40";
    g.fill();
  }

  // Petite Ceinture ring railway, stations and, on the full sheet, its trains.
  drawRingMap(x, y, scale, full);

  // Monuments highlighted softly in warm gold on full map.
  if (full) {
    for (const m of town.monuments) {
      if (!m.footprint?.length) continue;
      g.beginPath();
      g.moveTo(x + m.footprint[0][0] * scale, y + m.footprint[0][1] * scale);
      for (let i = 1; i < m.footprint.length; i++)
        g.lineTo(x + m.footprint[i][0] * scale, y + m.footprint[i][1] * scale);
      g.closePath();
      g.fillStyle = "#e8be7288";
      g.fill();
      g.strokeStyle = "#ffdf99cc";
      g.lineWidth = 0.55;
      g.stroke();
    }
  }

  for (const m of river.moorings) {
    const r = full ? 1.65 : 0.55;
    const cx = x + m.quay.x * scale, cy = y + m.quay.y * scale;
    rect(g, cx - r - 0.35, cy - r - 0.35, 2 * r + 0.7, 2 * r + 0.7, "#191825");
    rect(g, cx - r, cy - r, 2 * r, 2 * r, hasBoat(m) ? "#a1e3de" : "#61888a");
  }
  const trip = currentTrip();
  const bike = trip?.kind === "bike" ? trip.point : full && nearestBike(origin);
  if (bike) {
    const bx = x + bike.x * scale, by = y + bike.y * scale;
    const lift = full ? 7 : 1.5;
    rect(g, bx - 0.25, by - lift, 0.5, lift, "#f2bd70");
    g.textAlign = "center";
    label(g, "▲", bx, by - lift, "#f2bd70", full ? 5 : 2);
    g.textAlign = "left";
  }

  // Active navigation route.
  const path = game.ride?.domain === "water" || game.transit ? null : trip ? tripPath(trip, origin) : directions(origin)?.path;
  if (path) {
    g.beginPath();
    g.moveTo(x + origin.x * scale, y + origin.y * scale);
    for (const k of path.slice(1)) g.lineTo(x + k.x * scale, y + k.y * scale);
    g.strokeStyle = "#ffe080";
    g.lineWidth = full ? 1.15 : 0.45;
    g.stroke();
  }

  // Case pins.
  for (const j of jobs) if (!done.has(j.id)) pin(j, x + j.x * scale, y + j.y * scale, !full);

  // Pulsing goal ring.
  const q = trip?.point ?? goal();
  if (q) {
    g.strokeStyle = "#ffe18a";
    g.lineWidth = full ? 1 : 0.45;
    g.beginPath();
    const pulse = Math.sin(game.time * 3);
    g.arc(x + q.x * scale, y + q.y * scale, full ? 5 + pulse : 2.05 + pulse * 0.2, 0, TAU);
    g.stroke();
  }

  // Player diamond.
  const px = x + origin.x * scale,
    py = y + origin.y * scale;
  const radius = full ? 2.5 : 1.05;
  g.beginPath();
  g.moveTo(px, py - radius);
  g.lineTo(px + radius, py);
  g.lineTo(px, py + radius);
  g.lineTo(px - radius, py);
  g.closePath();
  g.strokeStyle = "#131524";
  g.lineWidth = full ? 1.35 : 0.55;
  g.stroke();
  g.fillStyle = "#fff8e9";
  g.fill();
  g.restore();
}

function drawFullMap(end, origin) {
  showMapSheet(end, origin);
  rect(g, 0, 0, game.vw, game.vh, "#151521eb");
  const area = $("#mapWindow").getBoundingClientRect();
  const unit = game.vw / innerWidth;
  const w = Math.min(area.width * unit, (area.height * unit * W) / H, 235);
  const h = (w * H) / W;
  const x = (area.left + area.width / 2) * unit - w / 2;
  const y = (area.top + area.height / 2) * unit - h / 2;
  map(x, y, w, h, true, origin);
}

function districtKey(x, y) {
  const river = town.river;
  if (river && y >= river.top && y <= river.bottom) {
    for (const isl of river.islands)
      if (x >= isl.left && x <= isl.right && y >= isl.top && y <= isl.bottom) return "districtIle";
    return "districtFerre";
  }
  const { col, row } = town.cellAt(x, y);
  if (row <= town.canalRow) {
    if (row <= 1 && col >= 5 && col <= 10) return "districtButte";
    if (col <= 4) return row <= 4 ? "districtArc" : "districtQuaisOuest";
    if (col <= 8) return row <= 4 ? "districtOpera" : "districtContrainte";
    if (col >= 11 && row <= 3) return "districtParcNord";
    if (col >= 14) return "districtFaubourgEst";
    return "districtMarais";
  }
  if (col <= 5) return "districtTour";
  if (col <= 10) return "districtRiveGauche";
  return "districtDocks";
}

function district() {
  return t(districtKey(p.x, p.y));
}

function draw() {
  if (interior) {
    const room = interior.room;
    const anchor = game.active ? room.exit : nextFile() ? room.desk : null;
    drawInterior(anchor && !atObjective(anchor, room) ? anchor : null);
    routeHUD(anchor, room);
    travelHUD(null);
    if (game.viewMap) drawFullMap(goal(), interior.returnTo);
    else $("#mapSheet").hidden = true;
    return;
  }
  const { left: ox, top: oy } = viewport(game.camX, game.camY, game.vw, game.vh, W, H);
  const cx = ox + game.vw / 2,
    cy = oy + game.vh / 2;
  rect(g, 0, 0, game.vw, game.vh, "#201c29");
  if (!game.artReady) {
    label(g, t("loading"), 8, game.vh / 2, "#ffc56b", 8);
    return;
  }
  streetLayer(ox, oy);
  g.save();
  g.translate(-ox, -oy);
  if (drawBoats(ox, oy)) drawBridgeDecks(ox, oy);
  for (const trail of trails) {
    g.save();
    g.translate(trail.x, trail.y);
    g.rotate(trail.a);
    g.globalAlpha = Math.min(0.45, trail.t * 0.18);
    // One tyre line per wheel track; a two-wheeler leaves a single one.
    const track = (trail.w ?? 4.8) - 1.4;
    rect(g, -5, -Math.max(0, track), 4, 0.7, "#201722");
    if (track > 1) rect(g, -5, track, 4, 0.7, "#201722");
    g.restore();
  }
  const visible = (o) => {
    const overhang = bodyExtra(o);
    return Math.abs(o.x - cx) < game.vw / 2 + 30 + overhang && Math.abs(o.y - cy) < game.vh / 2 + 28 + overhang;
  };
  for (const m of river.moorings) if (visible(m.quay)) drawMooring(m);
  const ridingBoat = game.ride?.domain === "water";
  const speed = ridingBoat ? Math.hypot(game.ride.slideX, game.ride.slideY) : Math.abs(game.ride?.speed ?? 0);
  const trip = !ridingBoat && !game.transit ? currentTrip() : null;
  const nearby = !game.viewMap ? boardingTarget() : null;
  const atTrip = trip && (nearby === trip.destination || (trip.kind === "mooring" && nearby?.mooring === trip.destination.id));
  const stopToWalk = trip && game.ride && dist(p, trip.point) < 32;
  const end = ridingBoat || game.transit ? null : trip?.point ?? goal();
  const travelPath = trip && !atTrip && !stopToWalk && !game.viewMap ? tripPath(trip) : null;
  const travelBearing = travelPath ? routeBearing(travelPath, !game.ride && trip.kind === "mooring" && dist(p, trip.point) < 115) : undefined;
  if (end && visible(end)) {
    g.save();
    g.strokeStyle = "#ffe080";
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(end.x, end.y + 1, end === target ? 13 : 5.5, end === target ? 7 : 2.4, 0, 0, TAU);
    g.stroke();
    g.restore();
  }
  const markers = [];
  for (const j of jobs) {
    if (done.has(j.id) || !visible(j)) continue;
    const y = j.y - addressPinHeight + Math.sin(game.time * 3) * 0.5;
    pin(j, j.x, y);
    markers.push({ x: j.x, y: j.y - addressPinHeight - 0.5 });
  }
  const actors = cars.filter(visible).map((o) => ({ o, car: true, medical: o.medical }));
  for (const n of people) if (!n.onStretcher && visible(n)) actors.push({ o: n });
  if (ambulance) {
    if (ambulance.state === "collecting" || ambulance.state === "loading") {
      const crew = medicalCrew(ambulance);
      if (visible(crew)) actors.push({ o: crew, crew: true });
    }
  }
  if (!game.ride && !game.transit) actors.push({ o: p });
  for (const prop of visibleStreetProps(ox, oy)) actors.push({ o: prop, prop: true });
  const rails = visibleRails(ox, oy);
  for (const rail of rails) actors.push({ o: rail, rail: true });
  for (const piece of ringActors(ox, oy)) actors.push({ o: piece, rail: true });
  actors.sort((a, b) => a.o.y - b.o.y);
  for (const a of actors) {
    if (a.prop) drawStreetProp(a.o);
    else if (a.rail) a.o.draw(false);
    else if (a.medical) drawAmbulance(a.o);
    else if (a.crew) drawCrew(a.o, ambulance);
    else if (a.car) drawVehicle(a.o);
    else dude(a.o, a.o === p);
  }
  for (const rail of rails) rail.draw(true);
  drawOverheadMonuments(g, ox, oy);
  // La Petite Ceinture's trains ride above everything else on the deck.
  drawRingTrains(ox, oy, actors);
  drawOverTrain(ox, oy);
  if (end && !game.viewMap) {
    if (visible(end)) markers.push(arrivalMarker(end, trip ? 10 : end === target ? 12 : addressPinHeight + 4));
    if (travelPath) markers.push(drawRouteArrow(travelPath, travelBearing));
    else if (!trip && !atObjective(end)) markers.push(drawRouteArrow(directions(p, end).path));
  }
  if (taunt && game.time < taunt.until && !taunt.speaker.down && visible(taunt.speaker)) {
    const speaker = taunt.speaker;
    const height = speaker.look === "flatCap" || speaker.look === "rigger" ? 15 : 18;
    speech(t(tauntLine(taunt)), speaker.x, speaker.y - height, ox, markers);
  } else if (game.quipTime > 0) speech(t("catch"), p.x, p.y - (game.ride ? 22 : 24), ox, markers);
  for (const f of fx) {
    g.save();
    g.textAlign = "center";
    g.lineWidth = 0.8;
    g.strokeStyle = "#301b2e";
    g.font = "bold italic 5px system-ui";
    const y = f.y - (1 - f.t) * 5;
    g.strokeText(t(f.s), f.x, y);
    g.fillStyle = "#ffe16a";
    g.fillText(t(f.s), f.x, y);
    g.restore();
  }
  g.restore();
  const compact = innerWidth <= 650 || matchMedia("(pointer:coarse)").matches;
  const mw = compact ? 31 : 40,
    mh = (mw * H) / W;
  routeHUD(trip ? null : end);
  travelHUD(trip, atTrip, stopToWalk, travelBearing);
  if (game.viewMap) {
    drawFullMap(goal(), p);
  } else {
    $("#mapSheet").hidden = true;
    // Scenery captures (scripts/scenery/tour.js) stitch bare street frames into one picture.
    if (!game.bareStreet) map(game.vw - mw - 4, game.vh - mh - (compact ? 60 : 10), mw, mh, false);
  }
  hud("#district", district() + "  /  Port-Fer");
  hud(
    "#playerStats",
    "€" +
      game.wallet +
      "  ·  " +
      t("health") +
      "\u00a0" +
      p.hp +
      "/5  ·  " +
      t("heat") +
      "\u00a0" +
      Math.ceil(game.heat) +
      "/3",
  );
  hud("#rideStats", game.ride
    ? " " + Math.round(speed * (ridingBoat ? 0.405 : 0.53)) + "\u00a0" + (ridingBoat ? t("knots") : "km/h") +
      " · " + vehicleName(game.ride) + " " + game.ride.condition + "%"
    : "",
  );
  const j = jobs.find((j) => dist(j, p) < 36);
  const nearJob = j ? t("jobKey") + " · " + t(j.name) : "";
  const nearbyBoat = nearby?.domain === "water";
  const nearBike = nearby?.model === "moto" && nearby.condition > 0;
  let touch = "touchCar";
  let hint = nearJob || t("footHint");
  if (game.viewMap) hint = t("mapHint");
  else if (game.transit) {
    touch = game.transit.phase === "platform" ? "touchStreet" : "touchExit";
    hint = transitHint(t);
  } else if (ridingBoat || nearbyBoat) {
    touch = "touchBoat";
    hint = ridingBoat ? t(berthInReach() ? "boatDisembark" : "boatFindDock") : t("boatEnter") + " · " + vehicleName(nearby);
  } else if (nearby?.street) {
    touch = "touchTrain";
    hint = t("stationHint") + " · " + stationName(nearby);
  } else if (game.ride) {
    touch = "touchExit";
    hint = [t("outHint"), recoveryCar() ? t("callRecovery") : nearJob].filter(Boolean).join("　/　");
  } else if (nearby?.condition === 0) hint = t("callRecovery");
  else if (nearby?.medical) hint = t("medicKeys");
  else if (nearby) {
    if (nearBike) touch = "touchBike";
    hint = [t(nearBike ? "motoEnter" : "enterHint") + " · " + vehicleName(nearby), nearJob].filter(Boolean).join("　/　");
  }
  $("#reportBtn").hidden = !!game.transit || !nearbyPatient();
  hud("#hint", hint);
  $("[data-key=action]").hidden = ridingBoat;
  hud("[data-key=car]", t(touch));
  hud("[data-key=action]", t(game.ride ? "touchBrake" : "touchHit"));
}

export { draw };
