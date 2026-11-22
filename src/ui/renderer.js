import { taunt, tauntLine } from "../game/taunts.js";
import { viewport } from "../world/viewport.js";
import { interior, drawInterior } from "../scenes/interiors.js";
import { t } from "./dialogs.js";
import { cars, dist, done, fx, game, p, people, trails } from "../core/state.js";
import { $, g, hud, label, rect } from "../platform/canvas.js";
import { H, TAU, W, canalBottom, canalTop, jobs, roadsX, roadsY } from "../world/town.js";
import { directions } from "../world/navigation.js";
import { goal, nextFile } from "../game/cases.js";
import { drawStreetProp, streetLayer, visibleStreetProps } from "../world/streets.js";
import { target } from "../world/population.js";
import { ambulance, medicalCrew, nearbyPatient } from "../game/rescue.js";
import { drawAmbulance, drawCrew } from "../art/emergency.js";
import { drawVehicle } from "../art/fleet-art.js";
import { dude } from "../art/pedestrians.js";
import { visibleRails } from "../world/rail.js";
import { arrivalMarker, drawRouteArrow } from "./waypoint.js";
import { atObjective, routeHUD, showMapSheet } from "./guidance.js";
import { nearestCar } from "../game/boarding.js";
import { recoveryCar } from "../game/damage.js";

const addressPinHeight = 23;

function speech(s, x, y, viewportLeft, markers) {
  g.save();
  g.font = "bold 4px system-ui";
  g.textAlign = "center";
  const width = g.measureText(s).width + 5;
  const center = Math.max(viewportLeft + width / 2 + 1, Math.min(x, viewportLeft + game.vw - width / 2 - 1));
  // Move past the lowest marker first when a door pin and route arrow are stacked.
  for (const marker of markers.sort((a, b) => b.y - a.y))
    if (Math.abs(marker.x - center) < width / 2 + 6 && Math.abs(marker.y - y) < 11)
      y = marker.y - 11;
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
  let r = small ? 1.3 : 3.4;
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
  rect(g, left, top, w, h, "#363343");
  const inset = full ? 5 : 2;
  const scale = Math.min((w - 2 * inset) / W, (h - 2 * inset) / H);
  const mw = W * scale, mh = H * scale;
  const x = left + (w - mw) / 2, y = top + (h - mh) / 2;
  g.save();
  const roadWidth = full ? 1.4 : 0.45;
  for (const rx of roadsX) rect(g, x + rx * scale - roadWidth / 2, top, roadWidth, h, "#8a8390");
  for (const ry of roadsY) rect(g, left, y + ry * scale - roadWidth / 2, w, roadWidth, "#8a8390");
  rect(g, left, y + (canalTop + 23) * scale, w, (canalBottom - canalTop - 49) * scale, "#397483");
  const bridgeWidth = Math.max(1, 28 * scale);
  for (const rx of roadsX)
    rect(
      g,
      x + rx * scale - bridgeWidth / 2,
      y + (canalTop + 23) * scale,
      bridgeWidth,
      (canalBottom - canalTop - 49) * scale,
      "#a39a99",
    );
  const nav = directions(origin);
  if (nav) {
    g.beginPath();
    g.moveTo(x + origin.x * scale, y + origin.y * scale);
    for (const k of nav.path.slice(1)) g.lineTo(x + k.x * scale, y + k.y * scale);
    g.strokeStyle = "#ffe080";
    g.lineWidth = full ? 1.1 : 0.42;
    g.stroke();
  }
  for (const j of jobs) if (!done.has(j.id)) pin(j, x + j.x * scale, y + j.y * scale, !full);
  let q = goal();
  if (q) {
    g.strokeStyle = "#ffe18a";
    g.lineWidth = full ? 1 : 0.45;
    g.beginPath();
    const pulse = Math.sin(game.time * 3);
    g.arc(x + q.x * scale, y + q.y * scale, full ? 5 + pulse : 2.05 + pulse * 0.2, 0, TAU);
    g.stroke();
  }
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
  showMapSheet(end);
  rect(g, 0, 0, game.vw, game.vh, "#151521eb");
  const area = $("#mapWindow").getBoundingClientRect();
  const unit = game.vw / innerWidth;
  const w = Math.min(area.width * unit, area.height * unit * W / H, 225);
  const h = w * H / W;
  const x = (area.left + area.width / 2) * unit - w / 2;
  const y = (area.top + area.height / 2) * unit - h / 2;
  map(x, y, w, h, true, origin);
}
function district() {
  return p.y < canalTop
    ? p.x < 548
      ? "Les Abattoirs"
      : p.x < 1030
        ? "Centre-Ville"
        : "Quartier des Prêts"
    : p.y < canalBottom
      ? "Canal Saint-Procès"
      : p.x < 825
        ? "Les Docks"
        : "La Foire";
}
function draw() {
  if (interior) {
    const room = interior.room;
    const anchor = game.active ? room.exit : nextFile() ? room.desk : null;
    drawInterior(anchor && !atObjective(anchor, room) ? anchor : null);
    routeHUD(anchor, room);
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
  const visible = (o) => Math.abs(o.x - cx) < game.vw / 2 + 30 && Math.abs(o.y - cy) < game.vh / 2 + 28;
  const end = goal();
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
    // Speech clears the top of the pin's bob, so a displaced bubble holds still.
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
  if (!game.ride) actors.push({ o: p });
  for (const prop of visibleStreetProps(ox, oy)) actors.push({ o: prop, prop: true });
  const rails = visibleRails(ox, oy);
  for (const rail of rails) actors.push({ o: rail, rail: true });
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
  if (end && !game.viewMap) {
    if (visible(end)) markers.push(arrivalMarker(end, end === target ? 12 : addressPinHeight + 4));
    if (!atObjective(end)) markers.push(drawRouteArrow(directions().path));
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
  const mw = compact ? 27 : 33,
    mh = (mw * H) / W;
  routeHUD(end);
  if (game.viewMap) {
    drawFullMap(end, p);
  } else {
    $("#mapSheet").hidden = true;
    map(game.vw - mw - 4, game.vh - mh - (compact ? 60 : 10), mw, mh, false);
  }
  hud("#district", district() + "  /  Port-Fer");
  hud(
    "#stats",
    "€" +
      game.wallet +
      "  ·  " +
      t("health") +
      " " +
      p.hp +
      "/5  ·  " +
      t("heat") +
      " " +
      Math.ceil(game.heat) +
      "/3" +
      (game.ride
        ? // The readout only wraps before the speed, never inside "7 km/h · Car 44%".
          "　" +
          Math.round(Math.abs(game.ride.speed) * 0.53) +
          "\u00a0km/h\u00a0\u00a0·\u00a0\u00a0" +
          t("vehicle") +
          "\u00a0" +
          game.ride.condition +
          "%"
        : ""),
  );
  const j = jobs.find((j) => dist(j, p) < 36);
  const nearJob = j ? t("jobKey") + " · " + t(j.name) : "";
  let hint = game.viewMap
    ? t("mapHint")
    : game.ride
      ? nearJob || t("outHint")
      : nearestCar()
        ? t("enterHint") + (nearJob ? "　/　" + nearJob : "")
        : nearJob || t("footHint");
  if (!game.viewMap && recoveryCar()) hint = t("callRecovery") + (game.ride ? "　/　" + t("outHint") : "");
  if (!game.ride && !game.viewMap && nearestCar()?.medical && nearestCar().condition > 0)
    hint = t("medicKeys");
  $("#reportBtn").hidden = !nearbyPatient();
  hud("#hint", hint);
  hud("[data-key=action]", t(game.ride ? "touchBrake" : "touchHit"));
}

export { draw };
