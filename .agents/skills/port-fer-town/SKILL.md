---
name: port-fer-town
description: Extend or repair Port-Fer districts, through railways, street and canal joins, and enterable addresses. Use when editing map layout, street paintings, route continuity or interior portals.
---

# Build a connected district

Edit the town definition in `src/world/town.js`. A cell is centred on an intersection. Its four boundaries lie halfway to the neighbouring intersections. Use the same world coordinates for artwork, collision, navigation, traffic and doors. Grid dimensions and viewport ranges come from `src/world/layout.js`.

**Follow each feature into the next painting.** A market roofline contains a painted railway. Trace the viaduct west and east through neighbouring blocks, including their alleys and cross streets. Declare its route once. Draw intermediate spans from the original ironwork at the same deck height, give street crossings clear headroom, and let a train wrap only after its tail has left the map. The south-bank canal overlay replaces the upper part of its source painting. Check the visible result there before treating an obscured feature as a connection.

**Connect streets at ground level.** Register a new painting against its kerbs in `src/world/streets.js`. Cross each edited seam in both directions on foot and by car. Check bridge mouths, pavements and approaches to case markers. `blockedIn` must agree with the road and bank that the player sees. Use the existing viewport cache and neighbourhood population loader when adding districts.

**Pair interiors with street addresses.** Give a room a stable street door, painted backdrop, walkable floor, entry, exit and interaction anchor. Enter on foot, operate the fixture, return to the same street position, and verify that the active case and parked vehicle survive. Exercise both languages.

Run `npm run test:scenery` whenever a street painting, prop, foreground layer or collision footprint changes. It runs the game in Chromium. Check the changed location as well as the garage gate and both sides of market joins. Walk toward the base and across its front with the player and an NPC, pass behind it where accessible, and drive diagonally into the corner. The actor should cover the foreground on the near side, and the far side should reveal the actor through actual gaps. Add each newly affected geometry to the browser fixtures.

Run `npm test` to check the shipped map, its roads and bridges, a larger rectangular fixture, rail continuity and room anchors. Run `npm run build`. In the resulting game, follow a full train across the edited join and check the new foreground against both neighbours. Regenerate affected gameplay captures from that build under the project's visual standard.
