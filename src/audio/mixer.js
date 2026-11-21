import { clamp, game, held } from "../core/state.js";
import { throttleInput } from "../core/controls.js";
import { TAU } from "../world/town.js";
import { panel } from "../platform/canvas.js";

let gameMix, engineOsc, engineGain, engineFilter, skidLoop, skidGain, hitNoise;
let signalVoice;
const crashClips = new Map();
const signalClips = new Map();
function noiseGenerator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
}
function makeTyreLoop() {
  const buffer = game.audio.createBuffer(1, game.audio.sampleRate, game.audio.sampleRate),
    samples = buffer.getChannelData(0);
  const noise = noiseGenerator(73153);
  let smooth = 0,
    low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = (TAU * i) / samples.length;
    smooth += 0.3 * (noise() - smooth);
    low += 0.045 * (smooth - low);
    const chatter = 0.72 + 0.22 * Math.sin(6 * t + 0.8 * Math.sin(t));
    const pitch = 747 * t + 2.1 * Math.sin(7 * t) + 0.5 * Math.sin(29 * t);
    samples[i] =
      chatter * (0.39 * Math.sin(pitch) + 0.15 * Math.sin(1102 * t + 1.4 * Math.sin(11 * t))) +
      0.81 * (smooth - low);
  }
  return buffer;
}
function makeHornLoop() {
  const rate = game.audio.sampleRate;
  const buffer = game.audio.createBuffer(1, rate, rate);
  const samples = buffer.getChannelData(0);
  const reed = (phase) =>
    0.52 * Math.sin(phase) +
    0.28 * Math.sin(2 * phase - 0.7) +
    0.13 * Math.sin(3 * phase + 0.5) +
    0.06 * Math.sin(5 * phase);
  for (let i = 0; i < samples.length; i++) {
    const t = (TAU * i) / rate;
    const low = reed(382 * t + 0.026 * Math.sin(5 * t));
    const high = reed(483 * t + 0.023 * Math.sin(7 * t));
    samples[i] = (0.56 * low + 0.44 * high) * (0.96 + 0.04 * Math.sin(6 * t));
  }
  return buffer;
}
function makeSirenLoop() {
  const rate = game.audio.sampleRate;
  const buffer = game.audio.createBuffer(1, rate, rate);
  const samples = buffer.getChannelData(0);
  // Three short notes with a longer pause before the next call.
  const notes = [690, 520, 690];
  for (const [note, frequency] of notes.entries()) {
    const start = Math.round(note * 0.28 * rate);
    const length = Math.round(0.25 * rate);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const attack = Math.min(1, t / 0.021);
      const release = Math.min(1, (length - 1 - i) / (0.034 * rate));
      const phase = TAU * frequency * (t - 0.0011 * (1 - Math.exp(-t / 0.018)));
      samples[start + i] =
        attack * release * (0.69 * Math.sin(phase) + 0.2 * Math.sin(2 * phase) + 0.11 * Math.sin(3 * phase));
    }
  }
  return buffer;
}
function vehicleSignalSound(mode) {
  if (!gameMix) return;
  if (!game.sound) mode = null;
  if (mode === (signalVoice?.mode ?? null)) return;

  const now = game.audio.currentTime;
  if (signalVoice) {
    signalVoice.gain.gain.setTargetAtTime(0, now, 0.018);
    signalVoice.source.stop(now + 0.1);
    signalVoice = null;
  }
  if (!mode) return;

  if (!signalClips.has(mode)) signalClips.set(mode, mode === "horn" ? makeHornLoop() : makeSirenLoop());
  const source = game.audio.createBufferSource();
  const gain = game.audio.createGain();
  source.buffer = signalClips.get(mode);
  source.loop = true;
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(gameMix);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  gain.gain.setTargetAtTime(mode === "horn" ? 0.38 : 0.31, now, 0.011);
  source.start(now);
  signalVoice = { mode, source, gain };
}
function prepareAudio() {
  if (gameMix) return;
  gameMix = game.audio.createGain();
  gameMix.gain.value = 0.75;
  gameMix.connect(game.audio.destination);
  engineOsc = game.audio.createOscillator();
  engineOsc.type = "sawtooth";
  engineFilter = game.audio.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 230;
  engineGain = game.audio.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(gameMix);
  engineOsc.start();
  skidLoop = game.audio.createBufferSource();
  skidLoop.buffer = makeTyreLoop();
  skidLoop.loop = true;
  skidGain = game.audio.createGain();
  skidGain.gain.value = 0;
  skidLoop.connect(skidGain);
  skidGain.connect(gameMix);
  skidLoop.start(game.audio.currentTime);
  crashClips.clear();
  hitNoise = null;
}
function motorSound() {
  if (!engineGain) return;
  const running = game.sound && game.ride && game.ride.condition !== 0 && !game.viewMap && !panel.open,
    now = game.audio.currentTime;
  const throttle = Math.max(0, throttleInput());
  engineGain.gain.setTargetAtTime(running ? 0.069 + 0.041 * throttle : 0, now, 0.07);
  const roll = running ? Math.hypot(game.ride.slideX, game.ride.slideY) : 0;
  let friction = 0;
  if (held.has("action") && roll > 7) {
    const sideSlip = Math.abs(
      game.ride.slideY * Math.cos(game.ride.a) - game.ride.slideX * Math.sin(game.ride.a),
    );
    const load = clamp((roll - 7) / 90, 0, 1),
      side = clamp(sideSlip / 55, 0, 1);
    friction = clamp((roll - 7) / 14, 0, 1) * (0.09 + 0.37 * Math.sqrt(load) + 0.12 * side);
    skidLoop.playbackRate.setTargetAtTime(0.69 + 0.46 * load + 0.18 * side, now, 0.04);
  }
  skidGain.gain.setTargetAtTime(friction, now, friction ? 0.024 : 0.033);
  if (!running) return;
  const speed = Math.abs(game.ride.speed),
    gear = Math.min(3, Math.floor(speed / 49));
  engineOsc.frequency.setTargetAtTime(35 + (speed - gear * 43) * 0.72 + 9 * throttle, now, 0.075);
  engineFilter.frequency.setTargetAtTime(160 + speed * 0.91 + 80 * throttle, now, 0.1);
}
// The initial shell impact, the crumpling panels and the loose metal decay at
// different rates. A hard crash extends the crumple and adds scattered debris.
function crashClip(kind, heavy) {
  const key = kind + (heavy ? "!" : "");
  if (crashClips.has(key)) return crashClips.get(key);
  const body = kind === "body",
    rate = game.audio.sampleRate,
    length = heavy ? 0.65 : 0.3;
  const buffer = game.audio.createBuffer(1, Math.ceil(length * rate), rate),
    samples = buffer.getChannelData(0);
  const noise = noiseGenerator(body ? 8969 : 2393);
  const pulses = heavy
    ? [0, 0.013, 0.031, 0.049, 0.084, 0.111, 0.158, 0.216, 0.279]
    : [0, 0.011, 0.035, 0.065];
  const pulseDecay = Math.exp(-1 / (rate * (body ? 0.016 : 0.009)));
  let mid = 0,
    low = 0,
    burst = 0,
    pulse = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate,
      n = noise();
    if (pulse < pulses.length && t >= pulses[pulse]) {
      burst += Math.pow(0.8, pulse);
      pulse++;
    }
    const attack = Math.min(1, t / 0.0014);
    const compression = 1 - Math.exp(-t / 0.018);
    const bass =
      Math.sin(TAU * ((heavy ? 43 : 68) * t + 1.72 * compression)) * Math.exp(-t * (heavy ? 14 : 28));
    const knock = Math.sin(TAU * ((body ? 168 : 205) * t + 1.15 * compression)) * Math.exp(-t * 32);
    mid += 0.4 * (n - mid);
    low += 0.065 * (mid - low);
    const crush = burst * (1.95 * (mid - low) + 0.55 * (n - mid));
    const metal =
      (0.7 * Math.sin(TAU * (body ? 438 : 697) * t) + 0.3 * Math.sin(TAU * (body ? 791 : 1013) * t)) *
      Math.exp(-t * (body ? 19 : 45));
    const grit = heavy && t > 0.1 ? burst * (n - mid) * 1.2 : 0;
    const wave =
      0.91 * bass + 0.47 * knock + (body ? 0.99 : 0.81) * crush + (body ? 0.19 : 0.1) * metal + grit;
    samples[i] = attack * Math.min(1, (length - t) / 0.014) * Math.tanh(wave * 1.4);
    burst *= pulseDecay;
  }
  crashClips.set(key, buffer);
  return buffer;
}
function crashSound(force, kind) {
  if (!game.sound || !game.audio || !gameMix) return;
  const now = game.audio.currentTime;
  if (kind === "body" || kind === "wall") {
    const heavy = clamp((force - 30) / 102, 0, 1),
      level = clamp(0.1 + force / 150, 0.12, 1.17);
    for (const hard of [false, true]) {
      const volume = level * (hard ? heavy : 1 - heavy);
      if (!volume) continue;
      const clip = game.audio.createBufferSource(),
        gain = game.audio.createGain();
      clip.buffer = crashClip(kind, hard);
      clip.playbackRate.value = 1.1 - 0.18 * heavy;
      gain.gain.value = volume;
      clip.connect(gain);
      gain.connect(gameMix);
      clip.start(now);
    }
    return;
  }
  const power = clamp(force / 130, 0.14, 1),
    skin = kind === "slap";
  if (!hitNoise) {
    hitNoise = game.audio.createBuffer(1, Math.ceil(game.audio.sampleRate * 0.18), game.audio.sampleRate);
    const samples = hitNoise.getChannelData(0),
      noise = noiseGenerator(9137);
    for (let i = 0; i < samples.length; i++) samples[i] = noise();
  }
  const noise = game.audio.createBufferSource(),
    filter = game.audio.createBiquadFilter(),
    env = game.audio.createGain();
  const length = skin ? 0.085 : 0.145;
  noise.buffer = hitNoise;
  filter.type = skin ? "highpass" : "bandpass";
  filter.frequency.value = skin ? 900 : 300;
  filter.Q.value = 0.62;
  env.gain.setValueAtTime(0.001, now);
  env.gain.exponentialRampToValueAtTime((skin ? 0.62 : 0.85) * power, now + 0.006);
  env.gain.exponentialRampToValueAtTime(0.001, now + length);
  noise.connect(filter);
  filter.connect(env);
  env.connect(gameMix);
  noise.start(now);
  noise.stop(now + length);
  const tone = game.audio.createOscillator(),
    gain = game.audio.createGain(),
    duration = skin ? 0.065 : 0.18;
  tone.type = "triangle";
  tone.frequency.setValueAtTime(skin ? 175 : 105, now);
  tone.frequency.exponentialRampToValueAtTime(skin ? 75 : 39, now + duration);
  gain.gain.setValueAtTime((skin ? 0.24 : 0.44) * power, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  tone.connect(gain);
  gain.connect(gameMix);
  tone.start(now);
  tone.stop(now + duration);
}
async function enableAudio() {
  if (!game.sound || (gameMix && game.audio?.state !== "suspended")) return;
  try {
    game.audio ??= new AudioContext();
    prepareAudio();
    await game.audio.resume();
  } catch {}
}

function footfall(distance) {
  if (!game.sound || !gameMix) return;
  const now = game.audio.currentTime,
    osc = game.audio.createOscillator(),
    gain = game.audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(distance % 2 ? 155 : 178, now);
  osc.frequency.exponentialRampToValueAtTime(51, now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.connect(gain);
  gain.connect(gameMix);
  osc.start();
  osc.stop(now + 0.085);
}
function beep(f = 240, d = 0.09, type = "square") {
  if (!game.sound || !gameMix) return;
  const o = game.audio.createOscillator(),
    v = game.audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, game.audio.currentTime);
  o.frequency.exponentialRampToValueAtTime(f * 0.58, game.audio.currentTime + d);
  v.gain.setValueAtTime(0.045, game.audio.currentTime);
  v.gain.exponentialRampToValueAtTime(0.001, game.audio.currentTime + d);
  o.connect(v);
  v.connect(gameMix);
  o.start();
  o.stop(game.audio.currentTime + d);
}

export { beep, crashSound, enableAudio, footfall, gameMix, motorSound, vehicleSignalSound };
