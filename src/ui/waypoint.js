import { dist, game, p } from "../core/state.js";
import { g } from "../platform/canvas.js";

// Look a little way around the next turn while keeping the guide on the street route.
export function routeBearing(path) {
  let ahead = game.ride ? 52 : 40;
  let aim = p;
  for (const node of path.slice(1)) {
    const length = dist(aim, node);
    if (length > ahead) {
      const f = ahead / length;
      aim = { x: aim.x + f * (node.x - aim.x), y: aim.y + f * (node.y - aim.y) };
      break;
    }
    ahead -= length;
    aim = node;
  }
  return Math.atan2(aim.y - p.y, aim.x - p.x);
}

export function drawRouteArrow(path, angle = routeBearing(path)) {
  const lead = game.ride ? 26 : 17;
  const position = { x: p.x + Math.cos(angle) * lead, y: p.y - 3 + Math.sin(angle) * lead };
  g.save();
  g.translate(position.x, position.y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(5.3, 0);
  g.lineTo(-3.6, -3.9);
  g.lineTo(-1.8, 0);
  g.lineTo(-3.6, 3.9);
  g.closePath();
  g.lineJoin = "round";
  g.strokeStyle = "#21172b";
  g.lineWidth = 1.9;
  g.stroke();
  g.fillStyle = "#ffcf59";
  g.fill();
  g.beginPath();
  g.moveTo(-2.7, -3.1);
  g.lineTo(3.7, -0.2);
  g.strokeStyle = "#fff1bf";
  g.lineWidth = 0.7;
  g.stroke();
  g.restore();
  return position;
}

export function arrivalMarker(point, lift = 0) {
  const rest = point.y - lift - 2;
  const y = rest + 0.6 * Math.sin(game.time * 3);
  g.save();
  g.beginPath();
  g.moveTo(point.x - 3.5, y - 3.8);
  g.lineTo(point.x, y - 2.8);
  g.lineTo(point.x + 3.5, y - 3.8);
  g.lineTo(point.x, y + 0.6);
  g.closePath();
  g.strokeStyle = "#221728";
  g.lineJoin = "round";
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = "#ffda6e";
  g.fill();
  g.restore();
  // Report the top of the bob so speech placed above the marker stays steady.
  return { x: point.x, y: rest - 2.6 };
}
