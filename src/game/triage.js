// World units. Keep a short trolley trip around one parking space.
export const seatCount = 4,
  pickupRadius = 52,
  dispatchDelay = 12;
export function nextPatient(people, scene, reachable) {
  if (scene.loaded >= seatCount) return null;
  return (
    people
      .filter(
        (n) =>
          n.knockedOut &&
          !n.onStretcher &&
          Math.hypot(n.x - scene.origin.x, n.y - scene.origin.y) <= pickupRadius &&
          reachable(n),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - scene.apron.x, a.y - scene.apron.y) -
          Math.hypot(b.x - scene.apron.x, b.y - scene.apron.y),
      )[0] ?? null
  );
}
