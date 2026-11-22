# Étude interior

The commissaire's office (`É`) is within interaction range just east of the starting position. On foot, the player can go inside, walk to the desk to choose a case file, and return to the same spot on the street.

## Sub-features

- `office-street` opens the office dialog with **E** beside the door. The dialog lists case files and **Go inside the office**.
- `office-enter` changes the district to `Bailiff’s office / Port-Fer` and guides a player without a file to the desk. The entrance mat offers a return to the street.
- `office-desk` shows `E · Open the case files` at the desk. **E** lists unfinished files when idle or **Return this file** when a case is active. A filed incident adds **Latest incident report**.
- `office-exit` returns the player to the exact street position with **E** on the mat (`E · Return to the street`).

## How to get to it (user POV)

- Walk right from the start to the office door, press **E** or **Job**, then choose **Go inside the office**.
- **Go inside** is not offered from a car or when the player is already inside.

## Driving it with pf

Preconditions: use `--build probe`. The player is on foot, and the office is `state().jobs` id `office`.

- **Reach the door.** `d.walkTo({x: office.x, y: office.y + 6}, {tol: 6})` stops when the hint includes `t("office")`.
- **Enter.** `d.press("job")`, then `d.choose("goInside")`. `state().interior.door` becomes `"office"`.
- **Desk.** `d.walkTo(interior.desk, {tol: 8, run: false})`, then `d.press("job")`. With no active file, the dialog choices include `t("repo")`, `t("noise")` and `t("flat")`, but not `t("goInside")`.
- **Take a case.** Choose Bass complaint and accept it. The route card points to the street exit. Open the map at the desk, check the active file and Le Boum, then close it.
- **Exit.** `d.walkTo(interior.exit)` waits for the hint `t("leaveRoom")`, then `d.press("job")`. The player position must be within 1 unit of the position before entering.
- **Run.** Run `pf run office-interior --build probe`, then repeat with `--device phone --lang fr`.
- **Proof.** Use `03-inside.png`, `05-case-files.png`, `07-indoor-map.png` and `08-back-on-street.png`.

## Gotchas

- Interior coordinates are room pixels, not world coordinates. Steer only with `state().interior.desk` and `exit` while inside.
- Use `run: false` for the short walk to the desk. On exit the journey checks the same street position, active case and destination.
