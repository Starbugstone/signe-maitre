import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { startBrowser } from "./browser.mjs";
import { encoder } from "./media.mjs";

const captionStyle = `
#capture-caption {
  position: absolute;
  right: 16px;
  bottom: 37px;
  max-width: min(600px, 47vw);
  padding: 8px 12px 10px;
  z-index: 2;
  pointer-events: none;
  color: #fff3ce;
  background: #191723f5;
  border: 1px solid #96806b;
  border-left: 3px solid #ef679a;
  box-shadow: 3px 3px 0 #060810;
  font: 600 16px/1.35 system-ui, sans-serif;
  white-space: pre-line;
}
#capture-caption:after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 1px;
  background: #efbb59;
  transform: scaleX(var(--progress));
  transform-origin: left;
}
#capture-heading {
  display: block;
  margin-bottom: 2px;
  color: #edc58d;
  font: 700 12px/1.3 monospace;
  text-transform: uppercase;
  letter-spacing: .08em;
}
@media (pointer: coarse) {
  #capture-caption {
    top: 84px;
    bottom: auto;
    right: 8px;
    max-width: 36vw;
    padding: 5px 8px 7px;
    font-size: 12px;
  }
  #capture-heading { font-size: 10px; }
}
`;

export async function replay(device, probe, traceFile, clips) {
  const trace = JSON.parse(await readFile(traceFile, "utf8"));
  const run = await startBrowser(device, probe, { capture: true });
  const { d, page, cdp } = run;
  let eventIndex = 0;
  let checkpoint = 0;
  const steps = trace.journal;

  // Drive through gaps, keeping the exact same substeps. Check every visited marker
  // against the planning run before retaining the encoded footage.
  async function seek(frame, paint, progress) {
    while (run.frame < frame) {
      const event = trace.events[eventIndex];
      while (steps[checkpoint]?.frame === run.frame) {
        const { p, ride, transit, step } = steps[checkpoint++];
        const state = await d.state();
        if (JSON.stringify([p, ride, transit]) !== JSON.stringify([state.p, state.ride, state.transit])) {
          throw Error("Input trace diverged at " + step + " in " + traceFile);
        }
      }
      if (event?.frame === run.frame) {
        await d[event.method](event.value);
        eventIndex++;
      } else {
        const next = Math.min(frame, event?.frame ?? frame, steps[checkpoint]?.frame ?? frame);
        await run.advance(next - run.frame, paint, progress);
      }
    }
  }

  async function screenshot(format) {
    let timer;
    try {
      const options = { format, ...(format === "jpeg" ? { quality: 88 } : {}), optimizeForSpeed: true };
      const shot = run.beginFrame
        ? cdp.send("HeadlessExperimental.beginFrame", { screenshot: options })
        : cdp.send("Page.captureScreenshot", { ...options, fromSurface: true });
      const { screenshotData, data } = await Promise.race([
        shot,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("Chromium stalled at capture tick " + run.frame)), 20000);
        }),
      ]);
      const bytes = screenshotData ?? data;
      if (!bytes) throw Error("Chromium returned no " + format + " frame at tick " + run.frame);
      return Buffer.from(bytes, "base64");
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    if (run.beginFrame) await cdp.send("HeadlessExperimental.beginFrame");
    await page.evaluate((css) => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.append(style);
      const caption = document.createElement("aside");
      caption.id = "capture-caption";
      caption.hidden = true;
      const heading = document.createElement("strong");
      heading.id = "capture-heading";
      caption.append(heading, document.createTextNode(""));
      document.body.append(caption);
    }, captionStyle);

    for (const clip of [...clips].sort((a, b) => a.start - b.start)) {
      if (clip.start <= run.frame) throw Error("Overlapping clip or missing lead-in for " + clip.name);
      if (clip.start + clip.frames - 1 > trace.frames) throw Error("Trace ends before " + clip.name);
      await seek(clip.start - 1, false);
      await page.evaluate(({ heading, caption }) => {
        const box = document.querySelector("#capture-caption");
        box.firstChild.textContent = heading;
        box.lastChild.textContent = caption;
        box.hidden = false;
      }, clip);
      console.log(device, clip.name, clip.frames + " frames");
      const partial = clip.path + ".partial.mp4";
      const writer = encoder(partial);
      try {
        for (let i = 0; i < clip.frames; i++) {
          await seek(clip.start + i, true, (i + 1) / clip.frames);
          const jpeg = await screenshot("jpeg");
          await writer.write(jpeg);
          const still = clip.stills?.find((entry) => entry.offset === i);
          if (still) {
            if (still.clean) await page.evaluate(() => { document.querySelector("#capture-caption").hidden = true; });
            await writeFile(still.path, await screenshot("png"));
            if (still.clean) await page.evaluate(() => { document.querySelector("#capture-caption").hidden = false; });
          }
        }
        await writer.finish();
        await rename(partial, clip.path);
      } catch (error) {
        writer.abort();
        await rm(partial, { force: true });
        throw error;
      }
    }
    if (d.errors.length) throw Error(d.errors.join("\n"));
  } finally {
    await run.browser.close();
  }
}
