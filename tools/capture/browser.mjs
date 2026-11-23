import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { driver, findChromium } from "../../.agents/skills/verify-signe-maitre/scripts/pf.mjs";
import { words } from "../../src/ui/strings.js";

export const fps = 60;
export const profiles = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
};

export async function startBrowser(device, file, { capture = false, record = false } = {}) {
  const executablePath = findChromium();
  if (!executablePath) throw Error("Set PF_CHROMIUM to a Chromium headless shell binary.");
  const beginFrame = capture && device === "desktop";
  const browser = await chromium.launch({
    executablePath,
    args: [
      "--allow-file-access-from-files",
      ...(beginFrame ? ["--run-all-compositor-stages-before-draw"] : ["--disable-gpu"]),
    ],
  });

  try {
    const context = await browser.newContext({ ...profiles[device], locale: "en", offline: true });
    const bootstrap = await context.newPage();
    let page = bootstrap;
    if (beginFrame) {
      const session = await context.newCDPSession(bootstrap);
      const { targetInfo: { browserContextId } } = await session.send("Target.getTargetInfo");
      const created = context.waitForEvent("page");
      await session.send("Target.createTarget", { url: "about:blank", browserContextId, enableBeginFrameControl: true });
      page = await created;
      await bootstrap.close();
    }
    const cdp = await context.newCDPSession(page);
    let frame = 0;
    const events = [];
    const advance = async (count, paint = false, progress) => {
      if (!count) return;
      await page.evaluate(([count, paint, progress]) => window.__captureClock.advance(count, paint, progress), [count, paint, progress]);
      frame += count;
    };
    const d = driver({
      page, mode: "probe", device, lang: "en", words,
      now: () => frame * 1000 / fps,
      wait: (ms) => advance(Math.max(1, Math.round(ms * fps / 1000))),
      recordInput: record ? (method, value) => events.push({ frame, method, value }) : undefined,
    });
    // Geometry is available after the game has drawn. A direct pointer click also works
    // when Chromium's compositor is waiting for the next beginFrame command.
    d.click = async (selector) => {
      const box = await page.locator(selector).boundingBox();
      if (!box) throw Error("Control is outside the viewport: " + selector);
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      if (device === "desktop") await page.mouse.click(x, y);
      else await page.touchscreen.tap(x, y);
      if (record) events.push({ frame, method: "click", value: selector });
    };
    await page.addInitScript((fps) => {
      // Start with repeatable traffic and render clocks. Input still enters through Chromium.
      let seed = 13;
      let frame = 0;
      let nextId = 0;
      const callbacks = new Map();
      let suppressPixels = false;
      for (const method of ["clearRect", "fillRect", "drawImage", "stroke", "fill", "fillText", "strokeText", "putImageData"]) {
        const paint = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          if (!suppressPixels || this.canvas.id !== "game") return paint.apply(this, args);
        };
      }
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
      };
      performance.now = () => frame * 1000 / fps;
      localStorage.setItem("port-fer-sound", "off");
      window.requestAnimationFrame = (callback) => {
        callbacks.set(++nextId, callback);
        return nextId;
      };
      window.cancelAnimationFrame = (id) => callbacks.delete(id);
      window.__captureClock = Object.freeze({
        advance(count, paint, progress) {
          if (progress != null) document.querySelector("#capture-caption").style.setProperty("--progress", progress);
          for (let i = 0; i < count; i++) {
            const pending = [...callbacks];
            if (pending.length !== 1) throw Error("Expected one game RAF, found " + pending.length);
            const [id, callback] = pending[0];
            callbacks.delete(id);
            suppressPixels = !paint;
            try {
              callback(++frame * 1000 / fps);
            } finally {
              suppressPixels = false;
            }
          }
        },
      });
    }, fps);
    await page.goto(pathToFileURL(file).href, { timeout: 90000 });
    await page.waitForFunction(() => window.__pf?.snapshot().artReady, null, { polling: 50, timeout: 90000 });
    await advance(1, true);
    if (!(await d.hud()).stats.includes("€")) throw Error("The game did not draw its HUD.");
    return { browser, page, cdp, d, events, advance, beginFrame, get frame() { return frame; } };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
