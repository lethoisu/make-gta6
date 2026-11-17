// Sound, all synthesized with WebAudio — no audio files, no network. The game
// calls these tiny functions; with no AudioContext (Node, muted, or before the
// first user gesture) every call is a silent no-op.
let ctx = null;
let master = null;
let muted = false;
let musicTimer = null;
let engineNodes = null;

function ensureContext() {
  if (ctx !== null) return ctx;
  if (typeof window === 'undefined') return null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    return null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = ensureContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.5;
}

export function isMuted() {
  return muted;
}

/** One short synthesized blip: type, frequency sweep, duration, volume. */
function blip(type, from, to, duration, volume, when = 0) {
  if (muted) return;
  const c = ensureContext();
  if (!c || !master) return;
  try {
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch {
    // Audio is decoration: never let it break the game.
  }
}

/** A burst of filtered noise (crash, gunshot, skid). */
function noiseBurst(duration, volume, cutoff = 1200) {
  if (muted) return;
  const c = ensureContext();
  if (!c || !master) return;
  try {
    const t0 = c.currentTime;
    const length = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = c.createBufferSource();
    source.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = c.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  } catch {
    // Ignore audio failures.
  }
}

export const sfx = {
  click() { blip('square', 660, 660, 0.06, 0.12); },
  pickup() { blip('sine', 520, 780, 0.12, 0.2); blip('sine', 780, 1040, 0.14, 0.16, 0.08); },
  cash() { blip('triangle', 880, 1320, 0.1, 0.2); blip('triangle', 1320, 1760, 0.12, 0.18, 0.07); },
  punch() { noiseBurst(0.09, 0.3, 900); },
  shot() { noiseBurst(0.12, 0.4, 2400); blip('square', 220, 60, 0.1, 0.22); },
  crash() { noiseBurst(0.25, 0.5, 700); blip('sawtooth', 120, 40, 0.25, 0.25); },
  steal() { blip('sawtooth', 180, 320, 0.16, 0.16); },
  siren() { blip('sine', 700, 1050, 0.4, 0.1); },
  mission() {
    blip('triangle', 523, 523, 0.12, 0.22);
    blip('triangle', 659, 659, 0.12, 0.22, 0.12);
    blip('triangle', 784, 784, 0.22, 0.24, 0.24);
  },
  fail() { blip('sawtooth', 220, 110, 0.5, 0.2); },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => blip('triangle', f, f, 0.22, 0.22, i * 0.14));
  },
  heal() { blip('sine', 440, 660, 0.18, 0.18); },
};

/** A looping engine hum that follows the car's speed (0..1). */
export function engineSound(speedRatio, on) {
  if (muted) { stopEngine(); return; }
  const c = ensureContext();
  if (!c || !master) return;
  try {
    if (!on) { stopEngine(); return; }
    if (!engineNodes) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = c.createGain();
      gain.gain.value = 0.05;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start();
      engineNodes = { osc, gain };
    }
    engineNodes.osc.frequency.value = 55 + speedRatio * 140;
    engineNodes.gain.gain.value = 0.03 + speedRatio * 0.05;
  } catch {
    // Ignore audio failures.
  }
}

export function stopEngine() {
  if (!engineNodes) return;
  try {
    engineNodes.osc.stop();
  } catch {
    // Already stopped.
  }
  engineNodes = null;
}

// --- Music: a lazy sunset groove — bass, soft keys and a hat, on a timer. ---
const BASS = [55, 55, 65.41, 49, 55, 55, 73.42, 82.41];
const KEYS = [220, 261.63, 329.63, 392];
let musicStep = 0;

export function startMusic() {
  if (musicTimer !== null) return;
  musicTimer = setInterval(() => {
    if (muted) return;
    const c = ensureContext();
    if (!c) return;
    const step = musicStep;
    musicStep += 1;
    if (step % 2 === 0) blip('triangle', BASS[(step / 2) % BASS.length | 0], BASS[(step / 2) % BASS.length | 0], 0.34, 0.12);
    if (step % 4 === 0) blip('sine', KEYS[(step / 4) % KEYS.length | 0] * 2, KEYS[(step / 4) % KEYS.length | 0] * 2, 0.5, 0.05);
    if (step % 2 === 1) noiseBurst(0.03, 0.03, 6000);
  }, 210);
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
