// Which paintings are held decoded, ready to draw.
//
// An <img> keeps only its compressed file. The browser decodes it on the main thread the first
// time it is drawn, and may drop that copy later and decode it again: a large street plate or boat
// sheet costs a visible stall each time. createImageBitmap from the file's bytes decodes on another
// thread and keeps the pixels, but every decoded painting together is about 620 MiB.
//
// So small paintings (actors, props, HUD art) are decoded once and kept. Large ones (street plates,
// vehicle, boat and train sheets) are decoded when the camera comes near them, through want(), and
// released, least recently wanted first, once the decoded total passes the budget. Until a large
// painting is ready, artwork[key] is still its <img> and draws as before.
import { artwork } from "../core/state.js";

const large = 4 * 2 ** 20;
const keep = 2; // seconds a painting stays wanted after the last frame that asked for it
const entries = new Map();
const now = () => performance.now() / 1000;
let budget = 320 * 2 ** 20,
  held = 0,
  misses = 0;

const bytesOf = (image) => (image.naturalWidth || image.width) * (image.naturalHeight || image.height) * 4;

async function fileOf(url) {
  try {
    return await (await fetch(url)).blob();
  } catch {
    // fetch refuses file:// pages; XMLHttpRequest reads them when the browser allows file access.
    return await new Promise((resolve) => {
      const request = new XMLHttpRequest();
      request.open("GET", url);
      request.responseType = "blob";
      request.onload = () => resolve(request.status === 0 || request.status === 200 ? request.response : null);
      request.onerror = () => resolve(null);
      request.send();
    });
  }
}

function decode(entry) {
  if (entry.pending || entry.bitmap || entry.unavailable) return entry.pending;
  entry.pending = (entry.file ??= fileOf(entry.url))
    .then((file) => (file ? createImageBitmap(file) : null))
    .catch(() => null)
    .then((bitmap) => {
      entry.pending = null;
      if (!bitmap) {
        entry.unavailable = true;
        return;
      }
      // Released while it was decoding.
      if (!entry.small && now() - entry.wanted > keep) {
        bitmap.close();
        return;
      }
      entry.bitmap = bitmap;
      if (!entry.small) held += entry.bytes;
      artwork[entry.key] = bitmap;
    });
  return entry.pending;
}

// Register the loaded images. Small ones start decoding at once.
export function holdArtwork(images, sources, { compact = false } = {}) {
  budget = (compact ? 192 : 320) * 2 ** 20;
  for (const [key, image] of Object.entries(images)) {
    const entry = { key, url: sources[key], image, bytes: bytesOf(image), wanted: -Infinity };
    entry.small = entry.bytes < large;
    entries.set(key, entry);
    if (entry.small) decode(entry);
  }
}

// Ask for a painting to be decoded and kept, because it is about to come into view. One already
// in view that is not ready yet is drawn from its <img> this frame: counted as a miss.
export function want(key, inView = false) {
  const entry = entries.get(key);
  if (!entry || entry.small) return;
  entry.wanted = now();
  if (inView && !entry.bitmap && !entry.unavailable) {
    misses++;
    entry.misses = (entry.misses || 0) + 1;
  }
  decode(entry);
}

// Release the least recently wanted large paintings while they hold more than the budget.
export function settle() {
  if (held <= budget) return;
  const idle = [...entries.values()]
    .filter((entry) => entry.bitmap && !entry.small && now() - entry.wanted > keep)
    .sort((a, b) => a.wanted - b.wanted);
  for (const entry of idle) {
    if (held <= budget) break;
    artwork[entry.key] = entry.image;
    entry.bitmap.close();
    entry.bitmap = null;
    held -= entry.bytes;
  }
}

export function residency() {
  let decoding = 0,
    ready = 0;
  for (const entry of entries.values()) {
    if (entry.pending) decoding++;
    if (entry.bitmap) ready++;
  }
  const missed = Object.fromEntries([...entries.values()].filter((entry) => entry.misses).map((entry) => [entry.key, entry.misses]));
  return { heldMiB: Math.round(held / 2 ** 20), budgetMiB: Math.round(budget / 2 ** 20), ready, decoding, misses, missed };
}

// Wait until everything currently asked for is decoded, for the first frame and for checks.
export function settled() {
  return Promise.all([...entries.values()].map((entry) => entry.pending));
}
