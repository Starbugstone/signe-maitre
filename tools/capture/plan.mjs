import { writeFile } from "node:fs/promises";
import { startBrowser } from "./browser.mjs";
import { drives } from "./drive.mjs";

export async function plan(device, source, probe, file) {
  const run = await startBrowser(device, probe, { record: true });
  const { d } = run;
  const marks = {};
  const journal = [];
  const mark = (name) => { marks[name] = run.frame; };
  d.step = async (name, action) => {
    mark(name + ":start");
    const before = await d.hud();
    try {
      const result = await action();
      await d.wait(120);
      return result;
    } finally {
      mark(name + ":end");
      const after = await d.hud();
      const { p, ride, transit, time } = await d.state();
      journal.push({ step: name, frame: run.frame, before, after, p, ride, transit, time });
      console.log(device, source, name, (run.frame / 60).toFixed(2), after.hint);
    }
  };
  d.shot = async (name) => mark(name);
  let error;
  try {
    mark("boot");
    await drives[source](d);
    await d.wait(4500);
    if (d.errors.length) throw Error(d.errors.join("\n"));
  } catch (failure) {
    error = failure.message;
  } finally {
    await writeFile(file, JSON.stringify({ frames: run.frame, marks, events: run.events, journal, checks: d.steps, error }, null, 2));
    await run.browser.close();
  }
  if (error) throw Error(device + "/" + source + ": " + error);
}
