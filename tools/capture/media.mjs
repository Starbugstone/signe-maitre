import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fps } from "./browser.mjs";

const localFFmpeg = join(homedir(), ".local/bin/ffmpeg");
const ffmpeg = process.env.FFMPEG || (existsSync(localFFmpeg) ? localFFmpeg : "ffmpeg");
const common = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];

function start(args, piped = false) {
  const proc = spawn(ffmpeg, [...common, ...args], { stdio: [piped ? "pipe" : "ignore", "pipe", "pipe"] });
  const output = [];
  const errors = [];
  proc.stdout.on("data", (bytes) => output.push(bytes));
  proc.stderr.on("data", (bytes) => errors.push(bytes));
  const done = once(proc, "close").then(([code]) => {
    if (code !== 0) throw Error("ffmpeg failed: " + Buffer.concat(errors).toString());
    return Buffer.concat(output).toString();
  });
  // Keep failures from a child whose input is still being written until finish() awaits them.
  done.catch(() => {});
  proc.stdin?.on("error", () => {});
  return { proc, done };
}

export function encoder(path) {
  const { proc, done } = start([
    "-threads", "1", "-f", "image2pipe", "-framerate", String(fps), "-vcodec", "mjpeg", "-i", "pipe:0",
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-threads", "2", "-crf", "18", "-pix_fmt", "yuv420p",
    "-color_range", "tv", "-fps_mode", "passthrough", "-movflags", "+faststart", path,
  ], true);
  return {
    async write(jpeg) {
      try {
        await new Promise((resolve, reject) => proc.stdin.write(jpeg, (error) => error ? reject(error) : resolve()));
      } catch (error) {
        await done;
        throw error;
      }
    },
    async finish() {
      proc.stdin.end();
      await done;
    },
    abort() { proc.kill(); },
  };
}

export async function concatenate(files, path, manifest, { trailer = false } = {}) {
  const escape = (file) => file.replaceAll("'", "'\\''");
  await writeFile(manifest, files.map((file) => "file '" + escape(file) + "'").join("\n") + "\n");
  const codec = trailer
    ? ["-c:v", "libx264", "-preset", "fast", "-threads", "3", "-crf", "20", "-maxrate", "4M", "-bufsize", "8M",
      "-pix_fmt", "yuv420p", "-fps_mode", "passthrough"]
    : ["-c", "copy"];
  await start(["-f", "concat", "-safe", "0", "-i", manifest, ...codec, "-movflags", "+faststart", path]).done;
}

export async function verifyVideo(path, expectedFrames) {
  // Decode every frame. Read the stream's declared cadence and the MP4's frame timing
  // independently of the encoder's source-frame counter.
  const args = [
    "-hide_banner", "-nostdin", "-nostats", "-threads", "2", "-i", path,
    "-map", "0:v:0", "-an", "-vf", "vfrdet", "-fps_mode", "passthrough", "-f", "framemd5", "pipe:1", "-progress", "pipe:2",
  ];
  const proc = spawn(ffmpeg, args);
  const output = [];
  const reports = [];
  proc.stdout.on("data", (bytes) => output.push(bytes));
  proc.stderr.on("data", (bytes) => reports.push(bytes));
  const [code] = await once(proc, "close");
  const report = Buffer.concat(reports).toString();
  const checksums = Buffer.concat(output).toString();
  const hashes = [...checksums.matchAll(/^0,.* ([0-9a-f]{32})$/gm)].map((match) => match[1]);
  const frames = Number([...report.matchAll(/^frame=(\d+)$/gm)].at(-1)?.[1]);
  const seconds = Number([...report.matchAll(/^out_time_us=(\d+)$/gm)].at(-1)?.[1]) / 1e6;
  const header = report.match(/Stream #0:\d+.*Video:.*\b(\d{3,4})x(\d{3,4})\b.*?, (\d+(?:\.\d+)?) fps/);
  const uniform = report.includes(`VFR:0.000000 (0/${frames - 1})`);
  const distinct = new Set(hashes).size;
  if (code !== 0 || !uniform || frames !== expectedFrames || Number(header?.[3]) !== fps ||
      Math.abs(seconds * fps - frames) > 0.01 || hashes.length !== frames || distinct !== frames) {
    throw Error(`Unexpected frame timing or repeats in ${path} (${distinct} distinct frames)\n${report}`);
  }
  return { seconds: frames / fps, fps, frames, width: Number(header[1]), height: Number(header[2]), bytes: (await stat(path)).size };
}
