# Street incidents and ambulance dispatch

On foot beside a downed pedestrian, the player can file an incident report or leave the patient for the ambulance crew. The office keeps a copy of each filed report.

## Sub-features

- Three landed slaps on the same pedestrian can knock them down. A fast vehicle impact can also cause an injury.
- **Incident report** opens within 21 units on foot. The report describes a scuffle or collision. A tough who insulted the commissaire during a repossession or home visit can trigger an outrage report when knocked down by slaps.
- **File and hand over a copy** numbers the report, removes the patient and adds **Latest incident report** to the office choices.
- **Leave for the ambulance crew** keeps the patient on the street. After 12 seconds the patient is eligible for dispatch. The van approaches from outside the camera and a crew can load up to four nearby patients.
- Taking an in-service ambulance raises heat and interrupts the rescue.

## How to get to it (user POV)

Walk west from the office and face the tough near the starting sedan. Land three slaps, approach the downed pedestrian and press **R** or tap the report button. Choose one outcome. To read a filed copy, return to the office and open the latest report.

## Driving it with pf

- `pf run street-report --build probe` opens a scuffle report through play, files copy № 1 and reads the same report back at the office.
- `pf run ambulance --build probe` starts a fresh game, chooses to wait and observes the crew reach the stretcher-loading stage. Add `--video` to inspect the approach and animation.
- Repeat both with `--device phone --lang fr`. Compare `01-report-open.png` with `03-office-record.png` or `03-stretcher-loading.png`.

## Gotchas

Dispatch and travel take separate amounts of time. Keep the simulation running while waiting for the crew. Filing the copy removes that patient from the rescue queue. These two journeys cover one scuffle patient each. Traffic injuries, outrage reports, theft and multi-patient rescues need their own encounters.
