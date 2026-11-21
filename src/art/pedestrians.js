import { shadow } from "./vehicles.js";
import { g } from "../platform/canvas.js";
import { artwork, game, held, p } from "../core/state.js";
import { slapDuration } from "../game/slap.js";
import { stepLength } from "../game/simulation.js";
import { crowdPose, dazedStars } from "./emergency.js";

function dude(n, player) {
  shadow(n.x, n.y, player ? 3.5 : 2.6, 1.2);
  g.save();
  g.translate(n.x, n.y);
  if (player) {
    const vertical = Math.abs(Math.sin(n.a)) > 0.78;
    if (!vertical) game.lastDir = Math.cos(n.a) < 0 ? -1 : 1;
    const row = vertical ? (Math.sin(p.a) > 0 ? 1 : 2) : game.lastDir > 0 ? 0 : 3;
    if (game.flash > 0) {
      const frame = Math.min(3, Math.floor(((slapDuration - game.flash) / slapDuration) * 4));
      g.drawImage(artwork.slapping, 152 * frame, 132 * row, 152, 132, -9.8, -16.8, 19.6, 17);
    } else if (n.moving) {
      const step = Math.floor((n.walkDistance || 0) / (stepLength / 2)) % 4;
      g.drawImage(
        held.has("run") ? artwork.run : artwork.walk,
        step * 152,
        row * 132,
        152,
        132,
        -9.8,
        -16.8,
        19.6,
        17,
      );
    } else {
      // Standing pose (also at spawn): the same suit and hands as the walk, run and slap atlases.
      g.drawImage(artwork.slapping, 3 * 152, row * 132, 152, 132, -9.8, -16.8, 19.6, 17);
    }
  } else if (n.kind === "medic") {
    if (n.down) {
      g.drawImage(artwork.medicDown, -6.2, -10.2, 12.4, 10.6);
      g.restore();
      dazedStars(n);
      return;
    }
    const vertical = Math.abs(Math.sin(n.a)) > 0.7,
      row = vertical ? (Math.sin(n.a) > 0 ? 1 : 2) : 0;
    if (!vertical && Math.cos(n.a) < 0) g.scale(-1, 1);
    if (n.stagger > 0) g.rotate(-0.12 * Math.sin((n.stagger / 0.33) * Math.PI));
    g.drawImage(
      artwork.rescueMedic,
      (n.moving ? Math.floor(n.gait) % 4 : 0) * 104,
      row * 148,
      104,
      148,
      -5.2,
      -14.5,
      10.4,
      14.8,
    );
  } else {
    if (n.down || n.swing > 0 || n.stagger > 0) {
      const column = n.down ? 3 : n.swing > 0 ? Math.min(2, Math.floor(((0.37 - n.swing) / 0.37) * 3)) : 2;
      crowdPose(n, column);
      g.restore();
      if (n.down) dazedStars(n);
      return;
    }
    const vertical = Math.abs(Math.sin(n.a)) > 0.7,
      dir = vertical ? (Math.sin(n.a) > 0 ? 1 : 2) : 0;
    if (!vertical && Math.cos(n.a) < 0) g.scale(-1, 1);
    const cycle = n.moving && !n.down ? 1 + (Math.floor(n.gait || 0) % 4) : 0;
    g.drawImage(artwork[n.look], cycle * 92, dir * 114, 92, 114, -5.6, -13.65, 11.2, 13.8);
  }
  g.restore();
}

export { dude };
