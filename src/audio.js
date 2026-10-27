// Sound effects and a little music loop, synthesised with Web Audio (no files).
// Sound and music have their own switches; the portal's mute silences both.
import { load, save } from './storage.js';

const SOUND_KEY = 'cartcrash:sound';
const MUSIC_KEY = 'cartcrash:music';
let ctx = null;
let master = null, sfx = null, musicBus = null, roll = null, rollGain = null;
let sound = load(SOUND_KEY, true) !== false;
let music = load(MUSIC_KEY, true) !== false;
let portalMuted = false;
let musicOn = false, nextBeat = 0, beat = 0, timer = null;

export const soundEnabled = () => sound;
export const musicEnabled = () => music;
export function setSound(on) { sound = on; save(SOUND_KEY, on); apply(); }
export function setMusic(on) { music = on; save(MUSIC_KEY, on); apply(); }
export function setPortalMuted(m) { portalMuted = m; apply(); }
export const isPortalMuted = () => portalMuted;

function apply() {
  if (!ctx) return;
  const now = ctx.currentTime;
  sfx.gain.setTargetAtTime(sound && !portalMuted ? 1 : 0, now, 0.02);
  musicBus.gain.setTargetAtTime(music && !portalMuted ? 0.32 : 0, now, 0.05);
}

/** Call from a user gesture: browsers only start audio after one. */
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { return; }
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    // Rolling wheels: filtered noise whose volume follows the speed.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    roll = ctx.createBufferSource(); roll.buffer = buf; roll.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    rollGain = ctx.createGain(); rollGain.gain.value = 0;
    roll.connect(f); f.connect(rollGain); rollGain.connect(sfx);
    roll.start();
    apply();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

export function rolling(speed, onGround) {
  if (!ctx) return;
  rollGain.gain.setTargetAtTime(onGround ? Math.min(0.22, speed * 0.012) : 0, ctx.currentTime, 0.05);
}

function tone(freq, dur, { type = 'square', vol = 0.18, slide = 0, delay = 0, bus = sfx } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.3, freq = 800, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(sfx);
  src.start(t);
}

const PICK = { goods: 660, melon: 330, balloon: 880, oil: 520, eggs: 990 };
export function play(e) {
  if (!ctx) return;
  switch (e.type) {
    case 'pickup':
      tone(PICK[e.item] || 600, 0.09, { type: 'square', vol: 0.12 });
      if (e.wanted) tone((PICK[e.item] || 600) * 1.5, 0.12, { type: 'square', vol: 0.1, delay: 0.06 });
      if (e.item === 'melon') tone(140, 0.2, { type: 'sine', vol: 0.3, slide: 0.6 });
      if (e.item === 'oil') tone(400, 0.35, { type: 'sine', vol: 0.12, slide: 2.2, delay: 0.05 });
      break;
    case 'fall': tone(500, 0.3, { type: 'triangle', vol: 0.16, slide: 0.35 }); break;
    case 'break': noise(0.15, { vol: 0.4, freq: 3000 }); tone(300, 0.15, { type: 'square', vol: 0.08, slide: 0.5 }); break;
    case 'crash': noise(0.3, { vol: 0.7, freq: 900 }); tone(110, 0.25, { type: 'sawtooth', vol: 0.2, slide: 0.5 }); break;
    case 'curb': noise(0.08, { vol: 0.35, freq: 600 }); break;
    case 'bump': if (e.cause === 'pothole') { noise(0.12, { vol: 0.6, freq: 400 }); tone(80, 0.15, { type: 'sine', vol: 0.4, slide: 0.6 }); } else if (e.cause === 'stairs') noise(0.05, { vol: 0.25, freq: 500 }); break;
    case 'hop': tone(300, 0.18, { type: 'sine', vol: 0.12, slide: 2 }); break;
    case 'ramp': tone(200, 0.4, { type: 'square', vol: 0.1, slide: 3 }); break;
    case 'land': if (e.impact > 4) noise(0.1, { vol: 0.4, freq: 500 }); break;
    case 'slip': tone(900, 0.4, { type: 'sine', vol: 0.12, slide: 0.4 }); break;
    case 'pop': noise(0.06, { vol: 0.6, freq: 5000 }); break;
    case 'gameover': noise(0.5, { vol: 0.8, freq: 700 }); [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.12, delay: 0.2 + i * 0.14 })); break;
    case 'bark': tone(520, 0.07, { type: 'sawtooth', vol: 0.14, slide: 0.5 }); tone(480, 0.08, { type: 'sawtooth', vol: 0.12, slide: 0.5, delay: 0.12 }); break;
    case 'jump': tone(260, 0.16, { type: 'square', vol: 0.1, slide: 2.4 }); break;
    case 'release': tone(500, 0.5, { type: 'sine', vol: 0.12, slide: 2.5 }); break;
    case 'crowdhit': noise(0.4, { vol: 0.7, freq: 1500 }); [440, 349, 262].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.12, delay: 0.1 + i * 0.1 })); break;
    case 'cop': for (let i = 0; i < 3; i++) { tone(2600, 0.12, { type: 'square', vol: 0.08, delay: i * 0.22 }); tone(2900, 0.08, { type: 'square', vol: 0.06, delay: i * 0.22 + 0.12 }); } break;
    case 'caught': tone(2600, 0.5, { type: 'square', vol: 0.1 }); tone(220, 0.3, { type: 'sawtooth', vol: 0.14, delay: 0.3 }); break;
    case 'copgaveup': [523, 784].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.12, delay: i * 0.1 })); break;
    case 'drop': tone(420, 0.12, { type: 'triangle', vol: 0.14, slide: 0.6 }); break;
    case 'yellow': [880, 880].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.09, delay: i * 0.18 })); break;
    case 'bells': for (let i = 0; i < 8; i++) tone(i % 2 ? 1180 : 1320, 0.14, { type: 'triangle', vol: 0.16, delay: i * 0.3 }); break;
    case 'train': [196, 247, 196].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.18, delay: i * 0.08 })); noise(1.8, { vol: 0.35, freq: 300, delay: 0.3 }); break;
    case 'ranred': noise(0.6, { vol: 0.6, freq: 1200 }); [330, 262, 196].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.12, delay: i * 0.1 })); break;
    case 'bite': tone(600, 0.06, { type: 'sawtooth', vol: 0.2, slide: 0.4 }); noise(0.15, { vol: 0.5, freq: 1500, delay: 0.05 }); break;
    case 'dogeats': tone(700, 0.1, { type: 'triangle', vol: 0.1, slide: 1.3 }); break;
    case 'listdone': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.1, delay: i * 0.08 })); break;
    case 'listbroken': tone(392, 0.25, { type: 'triangle', vol: 0.14, slide: 0.5 }); break;
    case 'checkout': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.12, delay: i * 0.12 })); tone(2093, 0.4, { type: 'sine', vol: 0.12, delay: 0.55 }); break;
    case 'pigeons': for (let i = 0; i < 5; i++) noise(0.05, { vol: 0.2, freq: 2500, delay: i * 0.06 }); break;
    default: break;
  }
}

export function click() { tone(720, 0.05, { type: 'square', vol: 0.08 }); }
export function record() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.18, delay: 0.3 + i * 0.09 })); }

// ---- music: a bouncy two-bar loop (bass, chords, a whistled tune) ----
const BPM = 132;
const BASS = [45, 0, 52, 0, 45, 0, 52, 47, 43, 0, 50, 0, 43, 0, 50, 52];
const LEAD = [69, 0, 72, 74, 76, 0, 74, 72, 71, 0, 67, 0, 69, 71, 72, 0, 69, 0, 72, 74, 76, 79, 76, 74, 72, 0, 71, 67, 69, 0, 0, 0];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function schedule() {
  if (!ctx || !musicOn) return;
  const spb = 60 / BPM / 2; // eighth notes
  while (nextBeat < ctx.currentTime + 0.25) {
    const delay = Math.max(0, nextBeat - ctx.currentTime);
    const b = BASS[beat % BASS.length];
    if (b) tone(midi(b), spb * 0.9, { type: 'triangle', vol: 0.5, delay, bus: musicBus });
    const l = LEAD[beat % LEAD.length];
    if (l) tone(midi(l), spb * 0.8, { type: 'square', vol: 0.08, delay, bus: musicBus });
    if (beat % 2 === 0) tone(1800, 0.03, { type: 'square', vol: 0.03, delay, bus: musicBus });
    nextBeat += spb;
    beat++;
  }
}

export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  nextBeat = ctx.currentTime + 0.05;
  timer = setInterval(schedule, 80);
}

export function stopMusic() {
  musicOn = false;
  clearInterval(timer);
  timer = null;
}
