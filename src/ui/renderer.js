import { viewport } from "../world/viewport.js";
import { interior, drawInterior } from "../scenes/interiors.js";
import { t } from "./dialogs.js";
import { cars, dist, done, fx, game, p, people, trails } from "../core/state.js";
import { $, g, hud, label, rect } from "../platform/canvas.js";
import { H, TAU, W, canalBottom, canalTop, jobs, roadsX, roadsY } from "../world/town.js";
import { directions } from "../world/navigation.js";
import { goal } from "../game/cases.js";
import { streetLayer } from "../world/streets.js";
import { target } from "../world/population.js";
import { ambulance, medicalCrew, nearbyPatient } from "../game/rescue.js";
import { drawAmbulance, drawCrew } from "../art/emergency.js";
import { drawCar } from "../art/vehicles.js";
import { dude } from "../art/pedestrians.js";
import { drawRail } from "../world/rail.js";
import { routeHUD } from "./guidance.js";
import { nearestCar } from "../game/boarding.js";
import { recoveryCar } from "../game/damage.js";

function speech() {
  const s = t("catch"),
    y = p.y - (game.ride ? 22 : 24);
  g.save();
  g.font = "bold 4px system-ui";
  g.textAlign = "center";
  const width = g.measureText(s).width + 5;
  rect(g, p.x - width / 2, y - 5, width, 7, "#201728");
  rect(g, p.x - width / 2 + 0.45, y - 4.55, width - 0.9, 6.1, "#ffe7bc");
  g.fillStyle = "#ffe7bc";
  g.beginPath();
  g.moveTo(p.x - 1, y + 0.8);
  g.lineTo(p.x + 2, y + 0.8);
  g.lineTo(p.x, y + 3.8);
  g.fill();
  g.fillStyle = "#34202d";
  g.fillText(s, p.x, y + 0.1);
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
function map(x, y, w, h, full) {
  let scale = Math.min(w / W, h / H),
    mw = W * scale,
    mh = H * scale;
  rect(g, x - 2, y - 2, mw + 4, mh + 4, "#d3b991");
  rect(g, x, y, mw, mh, "#363343");
  for (let rx of roadsX) rect(g, x + rx * scale - 1, y, full ? 1.4 : 0.45, mh, "#8a8390");
  for (let ry of roadsY) rect(g, x, y + ry * scale - 1, mw, full ? 1.4 : 0.45, "#8a8390");
  rect(g, x, y + (canalTop + 23) * scale, mw, (canalBottom - canalTop - 49) * scale, "#397483");
  for (let rx of roadsX)
    rect(
      g,
      x + (rx - 14) * scale,
      y + (canalTop + 23) * scale,
      Math.max(1, 28 * scale),
      (canalBottom - canalTop - 49) * scale,
      "#a39a99",
    );
  const nav = directions();
  if (nav) {
    g.beginPath();
    g.moveTo(x + p.x * scale, y + p.y * scale);
    for (const k of nav.path.slice(1)) g.lineTo(x + k.x * scale, y + k.y * scale);
    g.strokeStyle = "#ffe080";
    g.lineWidth = full ? 1.1 : 0.42;
    g.stroke();
  }
  for (const j of jobs) if (!done.has(j.id)) pin(j, x + j.x * scale, y + j.y * scale, !full);
  let q = goal();
  if (q) {
    g.strokeStyle = "#ffe18a";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x + q.x * scale, y + q.y * scale, 5 + Math.sin(game.time * 3), 0, TAU);
    g.stroke();
  }
  const px = x + p.x * scale,
    py = y + p.y * scale;
  rect(g, px - 1.1, py - 1.1, 2.2, 2.2, "#131524");
  rect(g, px - 0.6, py - 0.6, 1.3, 1.3, "#fff8e9");
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
    drawInterior();
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
    rect(g, -5, -3.4, 4, 0.7, "#201722");
    rect(g, -5, 3.4, 4, 0.7, "#201722");
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
  const actors = cars.filter(visible).map((o) => ({ o, car: true, medical: o.medical }));
  for (const n of people) if (!n.onStretcher && visible(n)) actors.push({ o: n });
  if (ambulance) {
    if (ambulance.state === "collecting" || ambulance.state === "loading") {
      const crew = medicalCrew(ambulance);
      if (visible(crew)) actors.push({ o: crew, crew: true });
    }
  }
  if (!game.ride) actors.push({ o: p });
  actors.sort((a, b) => a.o.y - b.o.y);
  for (const a of actors) {
    if (a.medical) drawAmbulance(a.o);
    else if (a.crew) drawCrew(a.o, ambulance);
    else if (a.car) drawCar(a.o);
    else dude(a.o, a.o === p);
  }
  drawRail(ox, oy);
  for (const j of jobs)
    if (!done.has(j.id) && visible(j)) pin(j, j.x, j.y - 15 + Math.sin(game.time * 3) * 0.5);
  if (game.quipTime > 0) speech();
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
  if (!game.viewMap) map(game.vw - mw - 4, game.vh - mh - (compact ? 60 : 10), mw, mh, false);
  routeHUD(end);
  if (game.viewMap) {
    rect(g, 0, 0, game.vw, game.vh, "#151521eb");
    const w = Math.min(game.vw - 16, ((game.vh - 94) * W) / H, 225),
      h = (w * H) / W,
      x = (game.vw - w) / 2,
      y = (game.vh - h) / 2;
    map(x, y, w, h, true);
    label(g, t("cityMap"), x, y - 4, "#ffcf65", 5);
    label(g, t("legend1"), x, y + h + 7, "#ffe2b2", 4.5);
    label(g, t("legend2"), x, y + h + 14, "#ffe2b2", 4.5);
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
        ? "　" +
          Math.round(Math.abs(game.ride.speed) * 0.53) +
          " km/h　·　" +
          t("vehicle") +
          " " +
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
