import { sedanHalfLength, sedanHalfWidth } from "../world/vehicle-shape.js";

// Every vehicle the city knows, by id. Sizes are world units at the sedan's scale
// (4.76 units to the metre along the body). The lanes are 12 units apart and cars park
// 10 units off the lane line, so every four-wheeled body keeps the sedan's half-width for
// collision. The bus and the dump truck are painted at their true 2.55 m and overhang it
// by a little over a unit a side.
//
// Handling: accel and brake in units/s², speeds in units/s (the HUD shows ×0.53 km/h),
// steer in rad/s at speed, turn the tightest corner radius, pivot how far behind the centre
// (as a share of halfLength) a long body swings about, grip 1 for tyres that track
// the steering exactly and less for a body that carries on sideways through a turn.
// mass is relative to the sedan and shares out impact damage and shoving. insurance divides
// what a crash costs the body on top of that: a bus or a dump truck shrugs off a knock that
// dents a saloon, and the motorbike folds sooner. footprint is the share of a long body's
// length that lies between its wheels: the overhangs pass over bollards and, at a roundabout,
// the corner pavements (src/world/collision.js).
//
// sprite: frame is the atlas cell in pixels at `scale` pixels per world unit, with the
// body's ground centre at (cx, cy) in the cell. Damaged states are stored smaller. The
// numbers are the ones tools/art/fleet-bake.json bakes with; test/fleet.test.js compares them.
// The sedan has no atlas: it is wrapped at run time from its panel sheet.
// The sedan steers at full rate from 18 units/s: steer × turn.
const car = { domain: "road", halfWidth: sedanHalfWidth, reverseAccel: 85, turn: 18 / 2.65 };
const midnightRed = { intact: "voltaRedTurns", dented: "voltaRedDented", wreck: "voltaRedWreck" };

// Percent of ordinary spawns on avenues and streets. Alleys use the same draw
// after removing models that cannot fit. The ambulance and seized fleet are placed separately.
export const trafficPercent = {
  sedan:     { moving: 46, parked: 52 },
  ambulance: { moving:  0, parked:  0 },
  volta:     { moving: 13, parked: 14 },
  suv:       { moving: 15, parked: 16 },
  bus:       { moving:  7, parked:  0 },
  dumper:    { moving:  7, parked:  0 },
  moto:      { moving: 12, parked: 18 },
};

export const fleet = {
  sedan: {
    ...car,
    name: { fr: "Berline", en: "Saloon" },
    halfLength: sedanHalfLength,
    mass: 1,
    insurance: 1,
    topSpeed: 181,
    reverseSpeed: 57,
    accel: 122,
    brake: 260,
    steer: 2.65,
    grip: 1,
    sound: "petrol",
    atlas: null,
    traffic: { lanes: ["avenue", "street"], pace: 1 },
  },
  ambulance: {
    ...car,
    name: { fr: "Ambulance", en: "Ambulance" },
    halfLength: 13.3,
    halfWidth: 5.45,
    mass: 1,
    insurance: 1.2,
    topSpeed: 181,
    reverseSpeed: 57,
    accel: 122,
    brake: 260,
    steer: 2.65,
    grip: 1,
    sound: "petrol",
    atlas: { intact: "ambulanceTurns", dented: "ambulanceDented", wreck: "ambulanceWreck" },
    sprite: { frame: 192, scale: 5.65, cx: 96, cy: 126 },
    traffic: { lanes: ["avenue", "street"], pace: 1 },
  },
  volta: {
    ...car,
    name: { fr: "Volta E", en: "Volta E" },
    halfLength: 11.9,
    mass: 1.25,
    insurance: 1.1,
    topSpeed: 214,
    reverseSpeed: 60,
    accel: 196,
    brake: 300,
    steer: 2.7,
    turn: 7,
    grip: 1,
    sound: "electric",
    atlas: { intact: "voltaTurns", dented: "voltaDented", wreck: "voltaWreck" },
    // Pearl white, or midnight red where the street's paint would be rose or olive.
    tints: { rose: midnightRed, olive: midnightRed },
    sprite: { frame: 160, scale: 5, cx: 80, cy: 102 },
    traffic: { lanes: ["avenue", "street"], pace: 1.1 },
  },
  suv: {
    ...car,
    name: { fr: "Mastodonte 4×4", en: "Mastodon 4×4" },
    halfLength: 12.4,
    mass: 1.7,
    insurance: 1.6,
    topSpeed: 156,
    reverseSpeed: 52,
    accel: 104,
    brake: 240,
    steer: 2.35,
    turn: 7.6,
    grip: 0.8,
    sound: "petrol",
    atlas: { intact: "suvTurns", dented: "suvDented", wreck: "suvWreck" },
    sprite: { frame: 160, scale: 5, cx: 80, cy: 104 },
    traffic: { lanes: ["avenue", "street"], pace: 0.95 },
  },
  bus: {
    ...car,
    name: { fr: "Autobus de ligne", en: "City bus" },
    halfLength: 28.5,
    mass: 6,
    insurance: 2.6,
    footprint: 0.68,
    topSpeed: 90,
    reverseSpeed: 32,
    accel: 46,
    reverseAccel: 34,
    brake: 150,
    steer: 1.3,
    turn: 24,
    pivot: 0.6,
    grip: 0.5,
    sound: "diesel",
    atlas: { intact: "busTurns", dented: "busDented", wreck: "busWreck" },
    sprite: { frame: 264, scale: 4.2, cx: 132, cy: 164 },
    traffic: { lanes: ["avenue", "street"], pace: 0.8, stops: true },
  },
  dumper: {
    ...car,
    name: { fr: "Camion-benne", en: "Dump truck" },
    halfLength: 19,
    mass: 8,
    insurance: 3,
    footprint: 0.74,
    topSpeed: 84,
    reverseSpeed: 30,
    accel: 40,
    reverseAccel: 30,
    brake: 140,
    steer: 1.45,
    turn: 16,
    pivot: 0.55,
    grip: 0.45,
    sound: "diesel",
    atlas: { intact: "dumperTurns", dented: "dumperDented", wreck: "dumperWreck" },
    sprite: { frame: 200, scale: 4.2, cx: 100, cy: 130 },
    traffic: { lanes: ["avenue", "street"], pace: 0.75 },
  },
  moto: {
    ...car,
    name: { fr: "Pétrolette", en: "Pétrolette" },
    // Drawn a third larger than the cars' scale, like the people: the rider is in plain view.
    halfLength: 7,
    halfWidth: 2.3,
    mass: 0.22,
    insurance: 0.7,
    topSpeed: 236,
    reverseSpeed: 14,
    accel: 215,
    reverseAccel: 40,
    brake: 330,
    steer: 3.75,
    turn: 4,
    grip: 1,
    leans: true,
    sound: "moto",
    // The ridden pictures are a painted sheet of 16 headings: the bailiff, and a courier in blue.
    atlas: { intact: "motoTurns", dented: "motoDented", wreck: "motoWreck", ridden: "motoRider", courier: "motoCourier", riddenHeadings: 16 },
    sprite: { frame: 128, scale: 6, cx: 64, cy: 92 },
    traffic: { lanes: ["avenue", "street", "alley"], pace: 1.25 },
  },
};
// `label` is the key of the model's name in the interface strings.
for (const [id, entry] of Object.entries(fleet)) Object.assign(entry, { id, label: "fleet:" + id });

export function fleetOf(vehicle) {
  return fleet[vehicle?.model] || fleet.sedan;
}

// A weighted draw of the models allowed on a class of road. `random` is a 0..1 source,
// so a seeded stream keeps a district's traffic the same on every visit.
export function pickModel(roadClass = "street", random = Math.random, parked = false) {
  const column = parked ? "parked" : "moving";
  const options = Object.entries(trafficPercent).filter(([id]) => fleet[id].traffic.lanes.includes(roadClass));
  let roll = random() * options.reduce((sum, [, share]) => sum + share[column], 0);
  for (const [id, share] of options) {
    roll -= share[column];
    if (roll < 0) return id;
  }
  return "sedan";
}

// The road class of a traffic route: the narrowest street it uses decides who fits.
export function routeClass(route) {
  return route?.class || route?.roadClass || "street";
}
