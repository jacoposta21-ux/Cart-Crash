// The downhill course: sections (street, sidewalk, stairs, market), the road's
// curve and width, and what lies on it. Everything comes from one seed, so a
// seed is a course: the daily ride gives everybody the same one.

export const TRACK_LENGTH = 760;
export const FINISH_RUNOUT = 40;

/** Small fast seeded RNG (mulberry32). Returns a function giving [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string, for seeds such as "daily:2026-10-27". */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer hash for decorations (stable, no state). */
export function hash2(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Half width of the rideable surface and how steep each section is.
export const SECTION = {
  street: { hw: 3.3, slope: 1.0 },
  sidewalk: { hw: 2.5, slope: 0.9 },
  stairs: { hw: 2.9, slope: 1.25 },
  market: { hw: 3.7, slope: 0.75 },
  finish: { hw: 4.2, slope: 0.4 },
};
export const STEP_LENGTH = 1.15; // one stair

// Obstacles: radius on the ground, height (a hop higher than this clears it), solid or not.
export const OBSTACLES = {
  cone: { r: 0.32, height: 0.55, solid: true },
  bin: { r: 0.48, height: 1.15, solid: true },
  crate: { r: 0.5, height: 0.95, solid: true },
  bollard: { r: 0.26, height: 0.9, solid: true },
  scooter: { r: 0.5, height: 0.9, solid: true },
  pothole: { r: 0.5, height: 0.15, solid: false },
  puddle: { r: 0.75, height: 0.1, solid: false },
  ramp: { r: 0.62, height: 0.3, solid: false },
};

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function createTrack(seed) {
  const r = rng(seed);
  const pick = (weights) => {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let x = r() * total;
    for (const [k, w] of Object.entries(weights)) if ((x -= w) < 0) return k;
    return Object.keys(weights)[0];
  };
  const range = (a, b) => a + r() * (b - a);

  // ---- sections ----
  const sections = [];
  let y = 0;
  const push = (kind, len) => { sections.push({ kind, start: y, end: y + len }); y += len; };
  push('street', range(70, 95));
  let prev = 'street';
  const LEN = { street: [60, 95], sidewalk: [45, 70], stairs: [22, 34], market: [65, 95] };
  while (y < TRACK_LENGTH - 50) {
    const weights = { street: 3, sidewalk: 2, stairs: 2, market: 2 };
    delete weights[prev];
    if (sections.some((s) => s.kind === 'market') === false && y > 250) weights.market = 6;
    if (sections.some((s) => s.kind === 'stairs') === false && y > 120) weights.stairs = 6;
    const kind = pick(weights);
    const len = Math.min(range(...LEN[kind]), TRACK_LENGTH - y);
    push(kind, len);
    prev = kind;
  }
  if (y < TRACK_LENGTH) sections[sections.length - 1].end = TRACK_LENGTH;
  y = TRACK_LENGTH;
  push('finish', FINISH_RUNOUT + 60);

  // ---- curve ----
  const p1 = r() * 6.28, p2 = r() * 6.28, f1 = range(24, 32), f2 = range(10, 14);
  const a1 = range(1.5, 2.1), a2 = range(0.5, 0.9);
  const curveRaw = (yy) => a1 * Math.sin(yy / f1 + p1) + a2 * Math.sin(yy / f2 + p2);
  const base = curveRaw(0);
  const center = (yy) => {
    const fade = smooth(yy / 40) * (1 - smooth((yy - (TRACK_LENGTH - 30)) / 30));
    return (curveRaw(yy) - base) * fade;
  };

  const sectionAt = (yy) => {
    let lo = 0, hi = sections.length - 1;
    if (yy <= 0) return sections[0];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (sections[mid].start <= yy) lo = mid; else hi = mid - 1;
    }
    return sections[lo];
  };
  const halfWidth = (yy) => {
    const s = sectionAt(yy);
    const i = sections.indexOf(s);
    const w = SECTION[s.kind].hw;
    if (i > 0) {
      const t = (yy - s.start) / 7;
      if (t < 1) return SECTION[sections[i - 1].kind].hw + (w - SECTION[sections[i - 1].kind].hw) * smooth(t);
    }
    return w;
  };

  // ---- what lies on the road ----
  const entities = [];
  let id = 0;
  const itemWeights = (kind) => (kind === 'market'
    ? { goods: 44, melon: 22, balloon: 10, oil: 10, eggs: 14 }
    : kind === 'stairs'
      ? { goods: 54, balloon: 12, eggs: 10, oil: 8, melon: 16 }
      : { goods: 44, melon: 16, balloon: 9, oil: 13, eggs: 14 });
  const obstacleFor = (kind) => pick(kind === 'market'
    ? { crate: 5, bin: 1, cone: 1 }
    : kind === 'sidewalk'
      ? { bollard: 4, bin: 3, scooter: 2 }
      : { cone: 4, bin: 2, scooter: 2, crate: 1 });
  const free = (x, yy, d = 1.15) => !entities.some((e) => Math.abs(e.y - yy) < d && Math.abs(e.x - x) < d);
  const add = (kind, type, yy, off, extra = {}) => {
    const s = sectionAt(yy);
    if (s.kind === 'finish' || yy > TRACK_LENGTH - 8) return;
    const lim = halfWidth(yy) - 0.55;
    const x = center(yy) + Math.max(-lim, Math.min(lim, off));
    if (!free(x, yy)) return;
    entities.push({ id: id++, kind, type, x, y: yy, ...extra });
  };
  const addItem = (yy, off, type) => add('item', type || pick(itemWeights(sectionAt(yy).kind)), yy, off, { variant: Math.floor(r() * 8) });

  y = 24;
  while (y < TRACK_LENGTH - 14) {
    const s = sectionAt(y);
    const lim = halfWidth(y) - 0.7;
    const u = () => range(-lim, lim);
    const early = y < 60;
    let pattern;
    if (s.kind === 'stairs') pattern = pick({ single: 3, row: 3, trail: 2, balloonTrail: 0.6 });
    else if (s.kind === 'market') pattern = pick({ single: 3, row: 3, trail: 2, obstacle: 3, gate: 3, potholes: 1, puddle: 1 });
    else pattern = early
      ? pick({ single: 3, row: 2, trail: 2, obstacle: 1 })
      : pick({ single: 3, row: 2, trail: 2, obstacle: 3, gate: 2, potholes: 2, puddle: 1.2, ramp: s.kind === 'street' ? 1.2 : 0 });

    switch (pattern) {
      case 'single': addItem(y, u()); break;
      case 'row': {
        const n = r() < 0.5 ? 2 : 3, w = Math.min(lim, 2.2), mid = range(-lim + w, lim - w) || 0;
        for (let i = 0; i < n; i++) addItem(y + i * 0.4, mid - w + (i * 2 * w) / (n - 1), r() < 0.75 ? 'goods' : undefined);
        break;
      }
      case 'trail': {
        let off = u();
        const drift = range(-0.9, 0.9);
        for (let i = 0; i < 3; i++) { addItem(y + i * 1.8, off, i === 2 && r() < 0.5 ? undefined : 'goods'); off += drift; }
        y += 4;
        break;
      }
      case 'balloonTrail': {
        const off = u();
        addItem(y, off, 'balloon'); addItem(y + 1.8, off, 'balloon');
        y += 2;
        break;
      }
      case 'obstacle': {
        const off = u();
        add('obstacle', obstacleFor(s.kind), y, off);
        addItem(y + range(-0.5, 0.5), off > 0 ? off - range(1.6, 2.6) : off + range(1.6, 2.6));
        break;
      }
      case 'gate': {
        // Two obstacles with a prize between them: the gap is always at least 1.9 wide.
        const gap = range(1.9, 2.5);
        const mid = range(-lim + gap / 2 + 0.3, lim - gap / 2 - 0.3) || 0;
        const type = obstacleFor(s.kind);
        add('obstacle', type, y, mid - gap / 2 - 0.35);
        add('obstacle', type, y, mid + gap / 2 + 0.35);
        addItem(y + 0.1, mid, pick({ melon: 3, eggs: 3, oil: 1, balloon: 1 }));
        break;
      }
      case 'potholes': {
        const n = 2 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++) add('obstacle', 'pothole', y + i * range(1.4, 2.4), u());
        y += n * 1.5;
        break;
      }
      case 'puddle': add('obstacle', 'puddle', y, u()); addItem(y + 3, u()); break;
      case 'ramp': {
        const off = range(-lim * 0.6, lim * 0.6);
        add('obstacle', 'ramp', y, off);
        // Things to grab while flying, in a little arc past the ramp.
        for (let i = 1; i <= 3; i++) addItem(y + 2.6 * i, off, i === 2 ? (r() < 0.4 ? 'balloon' : 'eggs') : 'goods');
        y += 7;
        break;
      }
      default: break;
    }
    y += s.kind === 'market' ? range(7, 9.5) : s.kind === 'stairs' ? range(7.5, 10) : range(8.5, 11.5);
  }
  entities.sort((a, b) => a.y - b.y);

  return { seed, length: TRACK_LENGTH, sections, entities, center, halfWidth, sectionAt };
}
