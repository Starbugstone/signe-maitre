import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

// The street simulation (src/game, with src/core and src/world beneath it) reports to the player
// through src/core/events.js. It never reaches the interface, the mixer, the page or the drawing
// code, so that it runs headless and a change to how something looks cannot change the game.
const allowed = new Map([["src/art/gait.js", "stride lengths only: no drawing, no page"]]);

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith(".js") ? [path] : [];
  });
}

const imports = new Map(
  sources("src").map((file) => {
    const text = readFileSync(file, "utf8");
    const specifiers = [
      ...text.matchAll(/^(?:import|export)\s[^;]*?from\s+"(\.[^"]+)"/gms),
      ...text.matchAll(/^import\s+"(\.[^"]+)"/gm),
    ].map((match) => normalize(join(dirname(file), match[1])));
    return [file, specifiers.filter((path) => path.endsWith(".js"))];
  }),
);

test("the simulation never imports the interface, audio, page or drawing modules", () => {
  const via = new Map();
  const queue = [...imports.keys()].filter((file) => /^src\/(game|core)\//.test(file)).map((file) => [file, null]);
  while (queue.length) {
    const [file, from] = queue.shift();
    if (via.has(file)) continue;
    via.set(file, from);
    for (const next of imports.get(file) ?? []) queue.push([next, file]);
  }
  const outside = [...via].filter(([file]) => !/^src\/(game|core|world)\//.test(file) && !allowed.has(file));
  assert.deepEqual(
    outside.map(([file, from]) => file + " (imported by " + from + ")"),
    [],
    "Report to the player through src/core/events.js instead",
  );
  for (const [file] of via)
    if (file.startsWith("src/world/"))
      assert.doesNotMatch(readFileSync(file, "utf8"), /\bdocument\.|getContext\(|platform\/canvas/, file + " draws or touches the page");
});
