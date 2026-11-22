import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fleet, fleetOf, pickModel } from "../src/game/fleet.js";
import { sedanHalfLength, sedanHalfWidth } from "../src/world/vehicle-shape.js";

const bake = JSON.parse(readFileSync(new URL("../tools/art/fleet-bake.json", import.meta.url), "utf8")).vehicles;

test("every fleet entry carries the contract's fields", () => {
  for (const [id, entry] of Object.entries(fleet)) {
    assert.equal(entry.id, id);
    assert.ok(entry.name.fr && entry.name.en, id + " has both names");
    assert.ok(["road", "water", "rail"].includes(entry.domain));
    for (const field of ["halfLength", "halfWidth", "mass", "topSpeed", "reverseSpeed", "accel", "brake", "steer", "grip", "turn"])
      assert.ok(entry[field] > 0, `${id}.${field}`);
    assert.ok(["petrol", "electric", "diesel", "moto", "boat"].includes(entry.sound), id + " sound");
    assert.ok(entry.traffic.weight >= 0 && entry.traffic.lanes.length, id + " traffic");
  }
});

test("the sedan and the ambulance keep their measurements and handling", () => {
  const { sedan, ambulance } = fleet;
  assert.deepEqual([sedan.halfLength, sedan.halfWidth], [sedanHalfLength, sedanHalfWidth]);
  assert.deepEqual([ambulance.halfLength, ambulance.halfWidth], [13.3, 5.45]);
  for (const entry of [sedan, ambulance]) {
    assert.deepEqual([entry.accel, entry.reverseAccel, entry.brake, entry.topSpeed, entry.reverseSpeed, entry.steer, entry.grip, entry.mass], [122, 85, 260, 181, 57, 2.65, 1, 1]);
    // Steering reaches its full rate at 18 units/s, as before.
    assert.ok(Math.abs(entry.steer * entry.turn - 18) < 1e-9);
  }
  assert.equal(fleetOf({ model: "Biscotte" }), sedan);
  assert.equal(fleetOf(null), sedan);
});

test("each atlas is drawn with the frame it was baked with", () => {
  for (const [id, entry] of Object.entries(fleet)) {
    if (!entry.atlas) continue;
    const baked = bake[id];
    assert.ok(baked, id + " has a bake recipe");
    assert.deepEqual(entry.sprite, { frame: baked.frame, scale: baked.scale, cx: baked.cx, cy: baked.cy }, id);
    for (const state of ["intact", "dented", "wreck"]) assert.equal(entry.atlas[state], baked.states[state].file, `${id} ${state}`);
  }
  const rider = bake.motoRider;
  assert.deepEqual(fleet.moto.sprite, { frame: rider.frame, scale: fleet.moto.sprite.scale, cx: rider.cx, cy: rider.cy });
  assert.deepEqual([fleet.moto.atlas.ridden, fleet.moto.atlas.courier], [rider.states.bailiff.file, rider.states.courier.file]);
});

test("the body sizes follow the paintings' real measurements", () => {
  // Length in metres from each spec.json, at the baking scale in world units per metre.
  const metres = { volta: 5, suv: 5.2, bus: 12, dumper: 8, moto: 2.2 };
  for (const [id, length] of Object.entries(metres)) {
    const scale = bake[id].unitsPerMetre ?? 4.76;
    assert.ok(Math.abs(fleet[id].halfLength - (length * scale) / 2) < 0.2, `${id} is ${fleet[id].halfLength * 2} units long`);
  }
  assert.ok(fleet.moto.halfWidth <= 3.6, "a motorbike fits an alley");
  for (const id of ["volta", "suv"]) assert.equal(fleet[id].halfWidth, sedanHalfWidth, id + " keeps to the car lane");
});

test("traffic draws its models by weight and by the class of road", () => {
  let seed = 9;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const count = (roadClass, parked) => {
    const seen = {};
    for (let i = 0; i < 4000; i++) {
      const id = pickModel(roadClass, random, parked);
      seen[id] = (seen[id] || 0) + 1;
    }
    return seen;
  };
  const street = count("street", false);
  for (const id of ["sedan", "volta", "suv", "bus", "dumper", "moto"]) assert.ok(street[id] > 100, `${id} drives on streets (${street[id]})`);
  assert.ok(street.sedan > street.bus * 3, "cars outnumber buses");
  assert.equal(street.ambulance, undefined);
  const alley = count("alley", false);
  assert.deepEqual(Object.keys(alley), ["moto"], "only a motorbike is narrow enough for an alley");
  const parked = count("street", true);
  assert.equal(parked.bus, undefined);
  assert.equal(parked.dumper, undefined);
  assert.ok(parked.moto > 100 && parked.volta > 100);
});
