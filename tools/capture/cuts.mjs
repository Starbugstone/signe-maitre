import { trafficPercent } from "../../src/game/fleet.js";

function clip(source, name, cue, offset, seconds, heading, caption, stills = []) {
  return { source, name, cue, offset, seconds, heading, caption, stills };
}

const split = (id, mode) => trafficPercent[id][mode] + "%";
const mix = (mode) => [
  `Saloon ${split("sedan", mode)} · Volta E ${split("volta", mode)} · 4×4 ${split("suv", mode)}`,
  `Bus ${split("bus", mode)} · Dump truck ${split("dumper", mode)} · Motorbike ${split("moto", mode)}`,
].join("\n");

const city = [
  clip("findRides", "city-map", "map-and-legend:start", 0.3, 4.5,
    "Port-Fer · 16 columns × 12 rows", "Avenues link roundabouts and bridges. Local streets and narrow ruelles fill the blocks between them.", [[2, "city-map"]]),
  clip("bigCity", "obelisk", "drive-around-roundabout:end", -7, 4.5,
    "Place de la Contrainte", "Traffic circles the obelisk anticlockwise. Drivers yield to circulating traffic before entering."),
  clip("cityWest", "arc", "arc-des-saisies:end", -2.5, 3.2,
    "Arc des Saisies", "The avenues meet at the arch’s star-shaped roundabout.", [[2.5, "city-arc"]]),
  clip("cityWest", "tower", "tour-de-fer-underpass:end", -2.4, 3.2,
    "Tour de Fer", "Traffic and pedestrians can pass beneath the ironwork."),
  clip("cityEast", "palais", "palais-de-justice:end", -2.5, 3,
    "Palais de Justice", "The law courts overlook the north quays."),
  clip("cityEast", "hotel", "hotel-des-ventes:end", -2.5, 3,
    "Hôtel des Ventes", "The auction house sits on the main avenue east of the arch."),
  clip("cityEast", "basilica", "sacre-creancier:end", -2.5, 3,
    "Sacré-Créancier", "The basilica stands north of the ring viaduct."),
  clip("bigCity", "river-road", "drive-across-river-bridge:start", 0, 4.5,
    "La Ferre", "Road bridges connect the two banks."),
  clip("cityEast", "cathedral", "cathedral-forecourt-on-foot:end", -2.7, 3.4,
    "Île de la Ferre", "Bridges reach both ends of the island. Notre-Dame-du-Port stands between them.", [[2.6, "city-cathedral"]]),
  clip("marais", "marais-mouth", "ruelle-mouth-west:end", -1.4, 2.6,
    "Le Vieux Marais", "A narrow cobbled ruelle opens onto the wider street."),
  clip("marais", "marais", "crossing-of-four:end", -2.4, 3.4,
    "Marais ruelles", "Paving carries across joins. Stone party walls close the blocks on either side.", [[2.45, "city-marais"]]),
];

const board = (id, heading, description, stills) =>
  clip(id, "board-" + id, "board-" + id + ":start", -1.15, 2.8, heading, description, stills);

const fleet = [
  clip("saloon", "board-saloon", "boot", 0.07, 3,
    "Saloon · Étude 2000", "The starting saloon’s name appears in the boarding hint."),
  board("volta", "Volta E", "The seized electric car is parked along the étude’s street.", [[1.6, "fleet-volta-intact"]]),
  board("suv", "Mastodon 4×4", "Approach the 4×4 and use Board to take the wheel."),
  board("dumper", "Dump truck", "Heavy vehicles are slower and insured against knocks."),
  board("moto", "Motorbike · Pétrolette", "The Bike prompt appears when you come within reach of the motorbike."),
  board("bus", "City bus", "Board a parked bus the same way as the other road vehicles."),
  clip("bus", "bus-lap", "roundabout-bus:end", -9.4, 9.4,
    "Bus lap · Place de la Contrainte", "Long vehicles may overhang the corner pavements at roundabouts.", [[5.5, "fleet-bus-lap"]]),
  clip("volta", "dented", "impact", -0.1, 2.6,
    "Dented · Volta E", "The HUD shows condition as a percentage. A dented car still runs.", [[0.3, "fleet-volta-dented"]]),
  clip("moto", "wreck", "impact", -1.0, 3.5,
    "Wrecked · Pétrolette", "At 0% condition the motorbike is a wreck. The HUD offers roadside assistance.", [[1.5, "fleet-motorbike-wreck"]]),
  clip("suv", "moving-mix", "drive-suv:end", -6.4, 5.8, "Moving traffic spawn mix", mix("moving")),
  clip("parkedMix", "parked-mix", "boot", 0.1, 4.5, "Parked traffic spawn mix", mix("parked")),
];

const train = [
  clip("train", "station", "walk-to-station:end", -5.5, 5.5,
    "La Petite Ceinture", "Walk up to a station entrance at street level.", [[4.8, "train-station"]]),
  clip("train", "platform", "climb-to-platform:end", 0, 4.5,
    "Climb to the platform", "Use Train at the entrance. Wait on the raised platform for the next set.", [[2, "train-platform"]]),
  clip("train", "train-boards", "board:end", -3, 5.5,
    "Board when the doors open", "The train picks you up automatically when it stops at your platform."),
  clip("train", "train-corner", "mid-corner", -1.5, 4,
    "Ride the ring", "The camera follows the middle carriage. The HUD names the next stop."),
  clip("train", "train-bridge", "on-rail-bridge", -1.4, 4.5,
    "Crossing la Ferre", "The Petite Ceinture has its own rail bridges.", [[1.9, "train-bridge"]]),
  clip("train", "train-request", "request-next-stop:end", -0.2, 3,
    "Request a stop", "Use Exit while the train is moving to ask for the next station."),
  clip("train", "train-alight", "alight:end", -2, 4,
    "Step off", "When the train reaches your stop, you return to the foot of the stairs.", [[2.6, "train-alight"]]),
];

const boats = [
  clip("island", "launch", "walk down to the quay and board the launch:end", -3, 5,
    "Board from the quay", "Use Boat when the HUD names the moored launch.", [[3.8, "boats-launch"]]),
  clip("island", "stone", "launch under the stone arch, behind the first bastion", -1.7, 5,
    "Stone bridge", "Line the launch up with a clear arch. The piers stay solid beneath the deck.", [[2.1, "boats-stone-arch"]]),
  clip("island", "iron", "launch showing through the iron spandrel", -1.3, 5,
    "Iron bridge", "The bridge ribs pass in front of the launch as it sails underneath."),
  clip("island", "north-channel", "launch behind the cathedral spire", -1.5, 5,
    "North channel", "Follow the channel behind Notre-Dame-du-Port.", [[1.45, "boats-island"]]),
  clip("island", "south-channel", "launch below the island quay wall", -2.5, 5,
    "South channel", "Round the east point and follow the quay wall back west."),
  clip("island", "moor", "return under the iron bridge and moor:end", -4, 7.5,
    "Moor and step ashore", "Slow beside a berth until the HUD offers to moor and step ashore.", [[4.7, "boats-moored"]]),
  clip("boats", "barge-hull", "take the moored barge from beside its hull:end", -3.7, 5,
    "Board along the hull", "Walk beside the moored barge until the Boat hint appears. The full hull is in reach."),
];

const find = [
  clip("findRides", "clerk", "clerks-tip:start", 0.05, 5.5,
    "Clerk’s tip", "The opening ticker points out the seized vehicles on this street and directs you to the map.", [[2, "find-clerk"]]),
  clip("findRides", "map-legend", "map-and-legend:start", 0.45, 6,
    "Map legend", "Cream circles mark ring stations. Blue squares mark moorings.", [[2.5, "find-map"]]),
  clip("findRides", "choose-a-ride", "map-and-legend:end", -4.9, 5.8,
    "Set a destination", "Pick Motorbike, Moored boat or Ring station to route to the nearest one."),
  clip("findRides", "named-prompt", "select-the-motorbike:end", -6.2, 6.3,
    "Follow the route card", "The street HUD names the vehicle as you approach. The route clears once you board.", [[3, "find-vehicle-hint"]]),
  clip("findRides", "github-pages", "hosting:end", -5.7, 6.4,
    "Hosted on GitHub Pages", "The roughly 14 KB index.html loads hashed scripts and artwork from game/.", [[3, "find-hosting"]]),
];

export const topics = { city, fleet, train, boats, find };

export function cutsFor(device, topic) {
  const clips = topics[topic];
  if (device === "desktop") return clips;
  if (topic === "fleet") {
    const include = new Set(["board-saloon", "board-volta", "board-suv", "board-dumper", "board-moto", "board-bus", "bus-lap", "wreck", "moving-mix"]);
    const still = new Set(["board-volta", "bus-lap"]);
    return clips.filter(({ name }) => include.has(name)).map((c) => ({ ...c, stills: still.has(c.name) ? c.stills : [] }));
  }
  if (topic === "boats") {
    const still = new Set(["stone", "moor"]);
    return clips.map((c) => ({ ...c, stills: still.has(c.name) ? c.stills : [] }));
  }
  throw Error("No phone cut for " + topic);
}
