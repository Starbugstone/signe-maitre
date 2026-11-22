import voltaTurns from "../../assets/voltaTurns.webp";
import voltaRedTurns from "../../assets/voltaRedTurns.webp";
import voltaRedDented from "../../assets/voltaRedDented.webp";
import voltaRedWreck from "../../assets/voltaRedWreck.webp";
import voltaDented from "../../assets/voltaDented.webp";
import voltaWreck from "../../assets/voltaWreck.webp";
import suvTurns from "../../assets/suvTurns.webp";
import suvDented from "../../assets/suvDented.webp";
import suvWreck from "../../assets/suvWreck.webp";
import busTurns from "../../assets/busTurns.webp";
import busDented from "../../assets/busDented.webp";
import busWreck from "../../assets/busWreck.webp";
import dumperTurns from "../../assets/dumperTurns.webp";
import dumperDented from "../../assets/dumperDented.webp";
import dumperWreck from "../../assets/dumperWreck.webp";
import motoTurns from "../../assets/motoTurns.webp";
import motoDented from "../../assets/motoDented.webp";
import motoWreck from "../../assets/motoWreck.webp";
import motoRider from "../../assets/motoRider.webp";
import motoCourier from "../../assets/motoCourier.webp";
import flatCap from "../../assets/flatCap.webp";
import bomber from "../../assets/bomber.webp";
import mariniere from "../../assets/mariniere.webp";
import rigger from "../../assets/rigger.webp";
import chelsea from "../../assets/chelsea.webp";
import medicDown from "../../assets/medicDown.webp";
import ambulanceWreck from "../../assets/ambulanceWreck.webp";
import ambulanceDented from "../../assets/ambulanceDented.webp";
import ambulanceTurns from "../../assets/ambulanceTurns.webp";
import metro from "../../assets/metro.webp";
import officeInterior from "../../assets/officeInterior.webp";
import rescueOpenImage from "../../assets/rescueOpen.webp";
import rescueStretcherImage from "../../assets/rescueStretcher.webp";
import rescueMedicImage from "../../assets/rescueMedic.webp";
import rescueVanImage from "../../assets/rescueVan.webp";
import sweepImage from "../../assets/sweep.png";
import slappingImage from "../../assets/slapping.webp";
import scuffleImage from "../../assets/scuffle.webp";
import runImage from "../../assets/run.webp";
import workerImage from "../../assets/worker.webp";
import ladyImage from "../../assets/lady.webp";
import civilianImage from "../../assets/civilian.webp";
import motorImage from "../../assets/motor.webp";
import walkImage from "../../assets/walk.webp";
import konamiHeads from "../../assets/konami-heads.webp";
import marketImage from "../../assets/market.webp";
import garageImage from "../../assets/garage.webp";
import docksImage from "../../assets/docks.webp";
import squareImage from "../../assets/square.webp";
// Street paintings baked by tools/art/bake-scenery.mjs, keyed as in src/world/paintings.js.
import alleyCrossPlate from "../../assets/scenery/alleyCross.webp";
import alleyStripHPlate from "../../assets/scenery/alleyStripH.webp";
import alleyStripVPlate from "../../assets/scenery/alleyStripV.webp";
import basilicaPlate from "../../assets/scenery/basilica.webp";
import boulevardPlate from "../../assets/scenery/boulevard.webp";
import haussmannPlate from "../../assets/scenery/haussmann.webp";
import haussmannCafePlate from "../../assets/scenery/haussmannCafe.webp";
import islandCathedralPlate from "../../assets/scenery/islandCathedral.webp";
import islandEastPlate from "../../assets/scenery/islandEast.webp";
import islandWestPlate from "../../assets/scenery/islandWest.webp";
import marketHallPlate from "../../assets/scenery/marketHall.webp";
import obeliskSquarePlate from "../../assets/scenery/obeliskSquare.webp";
import operaPlate from "../../assets/scenery/opera.webp";
import palaisJusticePlate from "../../assets/scenery/palaisJustice.webp";
import parkPlate from "../../assets/scenery/park.webp";
import railBridgeBedPlate from "../../assets/scenery/railBridgeBed.webp";
import railBridgeTopPlate from "../../assets/scenery/railBridgeTop.webp";
import ringBracketPlate from "../../assets/scenery/ringBracket.webp";
import ringCanopiesPlate from "../../assets/scenery/ringCanopies.webp";
import ringDeckPlate from "../../assets/scenery/ringDeck.webp";
import ringNorthPlate from "../../assets/scenery/ringNorth.webp";
import ringNorthBPlate from "../../assets/scenery/ringNorthB.webp";
import ringPortalPlate from "../../assets/scenery/ringPortal.webp";
import ringStationPlate from "../../assets/scenery/ringStation.webp";
import ringStationBPlate from "../../assets/scenery/ringStationB.webp";
import riverPlate from "../../assets/scenery/river.webp";
import riverBridgePlate from "../../assets/scenery/riverBridge.webp";
import riverIronBridgePlate from "../../assets/scenery/riverIronBridge.webp";
import rondPointPlate from "../../assets/scenery/rondPoint.webp";
import starArchPlate from "../../assets/scenery/starArch.webp";
import teeNorthPlate from "../../assets/scenery/teeNorth.webp";
import towerBasePlate from "../../assets/scenery/towerBase.webp";
import towerIronPlate from "../../assets/scenery/towerIron.webp";
import bargeTurns from "../../assets/bargeTurns.webp";
import riverboatTurns from "../../assets/riverboatTurns.webp";
import speedboatTurns from "../../assets/speedboatTurns.webp";
import launchTurns from "../../assets/launchTurns.webp";
// Atlas registration uses the baker's hull length and waterline anchor in frame pixels.
export const boatFrames = {
  barge: { bodyLengthPx: 464, anchorX: 256, anchorY: 280 },
  riverboat: { bodyLengthPx: 414, anchorX: 224, anchorY: 250 },
  speedboat: { bodyLengthPx: 167, anchorX: 96, anchorY: 112 },
  launch: { bodyLengthPx: 200, anchorX: 112, anchorY: 130 },
};

export const imageData = {
  voltaRedTurns,
  voltaRedDented,
  voltaRedWreck,
  voltaTurns,
  voltaDented,
  voltaWreck,
  suvTurns,
  suvDented,
  suvWreck,
  busTurns,
  busDented,
  busWreck,
  dumperTurns,
  dumperDented,
  dumperWreck,
  motoTurns,
  motoDented,
  motoWreck,
  motoRider,
  motoCourier,
  flatCap,
  bomber,
  mariniere,
  rigger,
  chelsea,
  medicDown,
  ambulanceWreck,
  ambulanceDented,
  ambulanceTurns,
  metro,
  officeInterior,
  rescueOpen: rescueOpenImage,
  rescueStretcher: rescueStretcherImage,
  rescueMedic: rescueMedicImage,
  rescueVan: rescueVanImage,
  sweep: sweepImage,
  slapping: slappingImage,
  scuffle: scuffleImage,
  run: runImage,
  worker: workerImage,
  lady: ladyImage,
  civilian: civilianImage,
  motor: motorImage,
  walk: walkImage,
  konamiHeads,
  market: marketImage,
  garage: garageImage,
  docks: docksImage,
  square: squareImage,
  alleyCross: alleyCrossPlate,
  alleyStripH: alleyStripHPlate,
  alleyStripV: alleyStripVPlate,
  basilica: basilicaPlate,
  boulevard: boulevardPlate,
  haussmann: haussmannPlate,
  haussmannCafe: haussmannCafePlate,
  islandCathedral: islandCathedralPlate,
  islandEast: islandEastPlate,
  islandWest: islandWestPlate,
  marketHall: marketHallPlate,
  obeliskSquare: obeliskSquarePlate,
  opera: operaPlate,
  palaisJustice: palaisJusticePlate,
  park: parkPlate,
  railBridgeBed: railBridgeBedPlate,
  railBridgeTop: railBridgeTopPlate,
  ringBracket: ringBracketPlate,
  ringCanopies: ringCanopiesPlate,
  ringDeck: ringDeckPlate,
  ringNorth: ringNorthPlate,
  ringNorthB: ringNorthBPlate,
  ringPortal: ringPortalPlate,
  ringStation: ringStationPlate,
  ringStationB: ringStationBPlate,
  river: riverPlate,
  riverBridge: riverBridgePlate,
  riverIronBridge: riverIronBridgePlate,
  rondPoint: rondPointPlate,
  starArch: starArchPlate,
  teeNorth: teeNorthPlate,
  towerBase: towerBasePlate,
  towerIron: towerIronPlate,
  bargeTurns,
  riverboatTurns,
  speedboatTurns,
  launchTurns,
};
