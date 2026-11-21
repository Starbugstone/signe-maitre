# Port-Fer visual standard

Every graphic in the playable game must match the quality and visual style of the approved Port-Fer concept art and its finished street scenes. This applies to vehicles, characters, equipment, animation frames, damage states, effects and future additions.

Match the elevated camera, world scale, inked contours, painted material detail, night-time palette, lighting and ground shadows of comparable assets already in the game. Maintain character proportions, handedness and props across poses and directions. Keep interface symbols legible in the established HUD style.

Verify new or changed graphics in the running game, at normal gameplay scale, alongside existing art. Inspect every supported direction and animation or damage state. Regenerate affected screenshots and gameplay footage from the verified build before publishing.

For every scenery change, run `npm run test:scenery`. Revisit each changed obstacle in the game with the player, an NPC and a vehicle. Check the front, rear, base and the join with the neighbouring painting. Add a fixture in `scripts/scenery/scene.js` for any new obstacle or join that the existing checks do not exercise.

For town layout, street and railway joins, or enterable buildings, use the [Port-Fer town skill](.agents/skills/port-fer-town/SKILL.md). Maintain the ES modules in `src/`; `npm run build` produces the playable offline `index.html`.

To prove a change in the running game, use the [verification skill](.agents/skills/verify-signe-maitre/SKILL.md). It drives the game with real keyboard and touch input and keeps screenshots, video and a HUD journal in `.verify/evidence/`. Add or repair a journey and its [feature map](.agents/skills/verify-signe-maitre/features/README.md) entry when you change what a player can do.

## Alpha publishing

During alpha, push all completed changes directly to `main`. Remove this section when the project enters beta.
