import test from "node:test";
import assert from "node:assert/strict";
import { words } from "../src/ui/strings.js";
import { game } from "../src/core/state.js";
import { fighterLook, person } from "../src/world/population.js";
import { callOut, taunt, tauntLine } from "../src/game/taunts.js";

test("the Konami toggle changes the same fighters on the street and in the reinforcement roster", () => {
  const reinforcements = Array.from({ length: 5 }, () => person(0, 0, "inspector"));
  const toughs = Array.from({ length: 5 }, (_, i) => person(0, 0, "tough", "x", () => (i + 0.5) / 5));
  const local = person(0, 0, "local", "x", () => 0);
  for (const mode of [false, true, false]) {
    game.konamiHero = mode;
    const expected = [mode ? "mariniere" : "flatCap", "bomber", "rigger", "chelsea", "flatCap"];
    assert.deepEqual(reinforcements.map(fighterLook), expected);
    assert.deepEqual(toughs.map(fighterLook), expected);
    assert.equal(local.look, "civilian");
  }
});

test("active bubbles and subsequent calls use the current mode's lines", () => {
  const generic = [
    "tauntConsole", "tauntPermit", "tauntMatches", "tauntCarioca", "tauntDoormat", "tauntCardigan", "tauntGrail",
  ];
  for (const [speaker, unlocked] of [
    [{ look: "flatCap", konamiLook: "mariniere" }, ["Je passe partout", "rendez moi les clés"]],
    [{ look: "bomber" }, ["un point de détail de l'histoire", "Janne, au secours"]],
    [{ look: "chelsea" }, ["un point de détail de l'histoire", "Janne, au secours"]],
    [{ look: "rigger" }, generic],
    [{ look: "flatCap" }, generic],
  ]) {
    speaker.phase = 0;
    for (const [index, key] of generic.entries()) {
      game.time += 10;
      callOut(speaker);
      assert.equal(tauntLine(taunt), key);
      assert.ok(words[key].length === 2 && words[key].every(Boolean));
      game.konamiHero = true;
      assert.equal(tauntLine(taunt), unlocked[index % unlocked.length]);
      callOut({ look: "chelsea", phase: 0 });
      assert.equal(taunt.speaker, speaker);
      game.konamiHero = false;
      assert.equal(tauntLine(taunt), key);
    }
  }
});
