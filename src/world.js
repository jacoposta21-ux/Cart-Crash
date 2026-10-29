// The downhill world. Sections (street, stairs, ski slope, pier, jungle trail…)
// are made one after another as the cart gets close, each with its curve,
// width, slope and what lies on it: things to grab (often the ones on your
// shopping list), obstacles (some low enough to jump), people, birds, animals
// that chase or steal, traffic lights, crossings (train, snowplow, big wave), gaps
// to jump, waves, geysers, coins and now and then a heart. The deeper you go,
// the busier. Each track (src/tracks.js) picks its own mix.
// Units are metres: x across the road, y down the road, elevation up.
import { trackOf } from './tracks.js';
import { catalogOf } from './catalog.js';

export const STEP_LENGTH = 1.15; // one stair
export const STEP_HEIGHT = 0.38;
/** The Old Town's groceries (every track has its own: src/catalog.js). */
export const GOODS = catalogOf('borgo').goods;

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

/** Integer hash for decorations (stable, no state). */
export function hash2(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Half width of the rideable surface, how fast it rolls (pace), how steep it looks (drop per metre),
// and what is at the sides: walls/kerbs that bounce you back, or nothing ('void': you fall).
export const SECTION = {
  street: { hw: 3.4, pace: 1.0, drop: 0.1 },
  sidewalk: { hw: 2.6, pace: 0.9, drop: 0.08 },
  stairs: { hw: 3.0, pace: 1.2, drop: STEP_HEIGHT / STEP_LENGTH },
  market: { hw: 3.8, pace: 0.8, drop: 0.05 },
  slope: { hw: 4.2, pace: 1.15, drop: 0.15 }, // ski slope
  lake: { hw: 4.4, pace: 1.0, drop: 0.02, ice: true }, // frozen: slippery all the way
  pier: { hw: 2.0, pace: 1.0, drop: 0.04, edge: 'void' }, // over the sea
  island: { hw: 3.6, pace: 0.95, drop: 0.06 },
  trail: { hw: 3.0, pace: 1.0, drop: 0.11 }, // jungle
  bridge: { hw: 1.8, pace: 1.0, drop: 0.03, edge: 'void', sway: true }, // rope bridge
};
const LEN = {
  street: [60, 100], sidewalk: [45, 70], stairs: [18, 30], market: [60, 90],
  slope: [70, 110], lake: [45, 65], pier: [55, 85], island: [50, 75], trail: [60, 95], bridge: [26, 40],
};

// Obstacles: radius on the ground (or w/d: half width across and half depth along the road for
// long ones), height (a jump higher than this clears it) and solid (a crash) or not.
export const OBSTACLES = {
  cone: { r: 0.32, height: 0.6, solid: true },
  bin: { r: 0.5, height: 1.2, solid: true },
  crate: { r: 0.52, height: 0.95, solid: true },
  bollard: { r: 0.26, height: 0.9, solid: true },
  scooter: { r: 0.55, height: 1.05, solid: true },
  walker: { r: 0.4, height: 1.7, solid: true },
  barrier: { r: 1.0, w: 1.0, d: 0.15, height: 0.75, solid: true },
  bench: { r: 0.85, w: 0.85, d: 0.28, height: 0.55, solid: true },
  boxes: { r: 0.55, w: 0.5, d: 0.45, height: 0.62, solid: true },
  pipe: { r: 1.5, w: 1.5, d: 0.22, height: 0.45, solid: true },
  snowman: { r: 0.5, height: 1.5, solid: true },
  flag: { r: 0.18, height: 1.5, solid: true },
  pine: { r: 0.55, height: 3, solid: true },
  barrel: { r: 0.45, height: 1.0, solid: true },
  umbrella: { r: 0.3, height: 2.2, solid: true },
  sandcastle: { r: 0.6, w: 0.6, d: 0.5, height: 0.55, solid: true },
  deckchair: { r: 0.7, w: 0.7, d: 0.4, height: 0.6, solid: true },
  rock: { r: 0.6, height: 1.1, solid: true },
  stump: { r: 0.45, height: 0.55, solid: true },
  log: { r: 1.4, w: 1.4, d: 0.3, height: 0.5, solid: true },
  block: { r: 0.5, height: 1.0, solid: true }, // Rainbow Road (some move from side to side)
  neon: { r: 1.1, w: 1.1, d: 0.15, height: 0.55, solid: true }, // Rainbow Road, low: jump it
  pothole: { r: 0.5, height: 0.15, solid: false },
  puddle: { r: 0.75, height: 0.1, solid: false },
  ice: { r: 1.0, height: 0.05, solid: false }, // slide like on oil
  ramp: { r: 0.65, height: 0.35, solid: false },
  skijump: { r: 0.9, height: 0.5, solid: false }, // a big launch
  geyser: { r: 0.7, height: 0.1, solid: false }, // throws you up when it blows
  boost: { r: 0.85, height: 0.05, solid: false }, // turbo arrows
};
/** Low enough to jump over. */
export const JUMPABLE = new Set(['cone', 'barrier', 'bench', 'boxes', 'pipe', 'neon', 'sandcastle', 'deckchair', 'stump', 'log']);
/** Things that throw the cart in the air (and how hard). */
export const LAUNCH = { ramp: 8.4, skijump: 11, geyser: 10.5 };

// Traffic lights and crossings: where the cart must stop (metres before the light/track).
export const LIGHT_STOP = 2.6;
export const RAIL_STOP = 5;

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** wanted: keys of the things on the shopping list ('melon', 'eggs', 'oil' or a GOODS name). track: a TRACKS id. */
/** versus: no shopping on the road (the 7 things of the race are placed by src/versus.js) and no hearts; coins stay. */
export function createWorld(seed, { wanted = [], track = 'borgo', versus = false } = {}) {
  const T = trackOf(track);
  const shop = catalogOf(track).goods;
  const r = rng(seed);
  const pick = (weights) => {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let x = r() * total;
    for (const [k, w] of entries) if ((x -= w) < 0) return k;
    return entries[0][0];
  };
  const range = (a, b) => a + r() * (b - a);

  // ---- the road's curve (infinite) ----
  const p1 = r() * 6.28, p2 = r() * 6.28, f1 = range(26, 34), f2 = range(10, 14);
  const a1 = range(1.6, 2.2) * T.curve, a2 = range(0.5, 0.9) * T.curve;
  const raw = (y) => a1 * Math.sin(y / f1 + p1) + a2 * Math.sin(y / f2 + p2);
  const base = raw(0);
  const center = (y) => (raw(y) - base) * smooth(y / 40);

  const world = { seed, track: T, sections: [], entities: [], made: 0, center, nextId: 0, wanted: [...wanted] };
  const sections = world.sections;

  const sectionAt = (y) => {
    if (y <= 0 || !sections.length) return sections[0];
    let lo = 0, hi = sections.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (sections[mid].start <= y) lo = mid; else hi = mid - 1;
    }
    return sections[lo];
  };
  const halfWidth = (y) => {
    const s = sectionAt(y);
    const w = SECTION[s.kind].hw;
    if (s.prev) {
      const t = (y - s.start) / 7;
      if (t < 1) return (SECTION[s.prev].hw + (w - SECTION[s.prev].hw) * smooth(t)) * T.hw;
    }
    return w * T.hw;
  };
  /** Height of the ground (it only goes down). Stairs come in steps. */
  const elevation = (y) => {
    const s = sectionAt(y);
    const d = Math.max(0, y - s.start);
    if (s.kind === 'stairs') return s.e0 - Math.min(Math.floor(d / STEP_LENGTH + 1e-9) + (d > 0 ? 1 : 0), s.steps) * STEP_HEIGHT;
    return s.e0 - d * SECTION[s.kind].drop;
  };
  /** No wall at the side here: off the edge, the cart falls. */
  const isVoid = (y) => T.void || SECTION[sectionAt(y).kind].edge === 'void';
  /** The gaps (no road: jump them) inside a stretch of road. */
  const gapsIn = (y0, y1) => world.entities.filter((e) => e.kind === 'gap' && e.y < y1 && e.y + e.len > y0);
  Object.assign(world, { sectionAt, halfWidth, elevation, isVoid, gapsIn });

  // ---- sections ----
  let nextLight = range(110, 150);
  let nextRail = range(330, 420);
  function addSection() {
    const last = sections[sections.length - 1];
    const start = last ? last.end : 0;
    const kinds = Object.keys(T.sections);
    let kind = kinds[0];
    let len = range(80, 100);
    if (last) {
      const weights = { ...T.sections };
      // Never twice the same in a row (except on a track with few kinds).
      if (kinds.length < 3) weights[last.kind] /= 2;
      else weights[last.kind] = 0;
      kind = pick(weights);
      len = range(...LEN[kind]);
    }
    const s = { kind, start, end: start + len, prev: last?.kind ?? null, e0: last ? last.e1 : 0 };
    if (kind === 'stairs') {
      s.steps = Math.floor(len / STEP_LENGTH);
      s.end = start + s.steps * STEP_LENGTH;
      s.e1 = s.e0 - s.steps * STEP_HEIGHT;
    } else s.e1 = s.e0 - len * SECTION[kind].drop;
    sections.push(s);
    populate(s);
    world.made = s.end;
  }

  // ---- things to grab ----
  const itemWeights = (kind) => (kind === 'market'
    ? { goods: 46, melon: 18, balloon: 7, oil: 12, eggs: 14 }
    : kind === 'stairs'
      ? { goods: 54, balloon: 12, eggs: 10, oil: 8, melon: 14 }
      : { goods: 46, melon: 14, balloon: 9, oil: 14, eggs: 14 });
  /** Often something from the list (the shop has what you need, if you can grab it): about two times in three. */
  function itemSpec(kind, forced) {
    let key = forced;
    if (!key) key = world.wanted.length && r() < 0.68 ? world.wanted[Math.floor(r() * world.wanted.length)] : pick(itemWeights(kind));
    if (key === 'goods') key = shop[Math.floor(r() * shop.length)];
    if (shop.includes(key)) return { type: 'goods', goods: key };
    return key === 'balloon' ? { type: 'balloon', color: Math.floor(r() * 5) } : { type: key };
  }
  const obstacleFor = (kind) => {
    if (T.void) return pick({ block: 3, bollard: 1 });
    switch (kind) {
      case 'market': return pick({ crate: 5, bin: 1, cone: 1, boxes: 3 });
      case 'sidewalk': return pick({ bollard: 4, bin: 3, scooter: 2, bench: 2 });
      case 'slope': return pick({ snowman: 3, pine: 1.5, flag: 1 });
      case 'lake': return pick({ snowman: 2, flag: 1 });
      case 'pier': return pick({ crate: 2, barrel: 3, bollard: 1 });
      case 'island': return pick({ umbrella: 3, barrel: 1, crate: 1 });
      case 'trail': return pick({ rock: 3, stump: 1, crate: 0.5 });
      case 'bridge': return pick({ crate: 1, barrel: 1 });
      default: return T.theme === 'alpine' ? pick({ cone: 3, bin: 2, crate: 1, snowman: 2 }) : pick({ cone: 4, bin: 2, scooter: 2, crate: 1, boxes: 1 });
    }
  };
  const jumpFor = (kind) => {
    if (T.void) return 'neon';
    switch (kind) {
      case 'market': return pick({ boxes: 2, bench: 1, barrier: 1 });
      case 'island': return pick({ sandcastle: 2, deckchair: 2 });
      case 'trail': case 'bridge': return pick({ log: 2, stump: 1 });
      case 'slope': case 'lake': return 'barrier';
      default: return pick({ barrier: 2, bench: 1, boxes: 1, pipe: 1 });
    }
  };
  const gateFor = (kind) => (T.void ? 'block' : kind === 'slope' || kind === 'lake' ? 'flag' : kind === 'pier' ? 'barrel' : kind === 'trail' ? 'rock' : kind === 'island' ? 'umbrella' : pick({ crate: 1, bin: 1, cone: 2, bollard: 1 }));

  /** What can happen on this kind of stretch at difficulty d (weights of the patterns). */
  function patterns(kind, d, early) {
    const P = { single: 2.5, row: 1, trail: 0.9, coins: 1.6, heart: 0.07 };
    const people = !T.void;
    const animal = T.animal ? (0.45 + 0.3 * d) * (T.animal === 'dog' ? 1 : 1.2) : 0;
    const thief = T.thief ? 0.4 + 0.3 * d : 0;
    const birds = T.birds ? 1 : 0;
    if (T.void) return { ...P, balloons: 0.6, coins: 1.8, obstacle: 1.6 + 1.5 * d, gate: 1 + d, jump: kind === 'street' ? 1.8 + d : 0, ramp: kind === 'street' ? 1 : 0, boost: early ? 0 : 1.3, mover: early ? 0 : 1 + 1.2 * d, none: 0.8 };
    if (early) return { ...P, single: 3, obstacle: 1, crosser: people && kind !== 'pier' && kind !== 'bridge' ? 1 : 0, pigeons: birds };
    switch (kind) {
      case 'stairs': return { ...P, single: 2, balloons: 0.3, coins: 1.2, pigeons: birds, crosser: T.theme === 'jungle' ? 0 : 1.5 + d, thief: thief * 0.6, none: 1.5 };
      case 'market': return { ...P, row: 1.2, coins: 1.2, obstacle: 2.5 + 2 * d, gate: 2.5, jump: 1.5, crosser: 2.5 + 2 * d, crowd: 1 + 1.5 * d, along: 1.5 + d, pigeons: birds };
      case 'slope': return { ...P, obstacle: 2.2 + 2 * d, gate: 2.2, skijump: 1.5, ice: 0.6 + 0.6 * d, snowball: 0.55 + 0.4 * d, crosser: 1.4 + d, along: 1 + d, animal, balloons: 0.4 };
      case 'lake': return { ...P, row: 1.4, coins: 2.2, obstacle: 1.2 + d, crosser: 1 + d, none: 0.8 };
      case 'pier': return { ...P, single: 2, coins: 1.1, obstacle: 1.4 + d, gap: 1.6 + d, wave: 1.1 + d, animal: animal * 0.6, thief, balloons: 0.7, none: 0.6 };
      case 'island': return { ...P, row: 1.2, obstacle: 2 + 2 * d, gate: 1.6, jump: 1.6 + d, crosser: 2 + 2 * d, crowd: 0.8 + 1.5 * d, along: 1 + d, animal, thief: thief * 0.7, pigeons: birds };
      case 'trail': return { ...P, obstacle: 2 + 2 * d, gate: 1.4, jump: 1.8 + d, gap: 1.4 + d, geyser: 1.2 + 0.6 * d, thief, balloons: 0.6, ramp: 0.5 };
      case 'bridge': return { ...P, single: 1.5, coins: 1.6, obstacle: 0.15 + 0.2 * d, thief: thief * 0.3, none: 1 };
      default: return {
        ...P, obstacle: 2 + 2 * d, gate: 2 + d, potholes: T.theme === 'alpine' ? 0 : 1.2 + d, puddle: T.theme === 'alpine' ? 0 : 1, ice: T.theme === 'alpine' ? 1 + d : 0, jump: 2 + d,
        roadworks: kind === 'street' ? 1 + d : 0, ramp: kind === 'street' ? 0.8 : 0,
        crosser: 2.5 + 3 * d, crowd: 0.8 + 2 * d, along: 1.2 + 1.5 * d, pigeons: birds, animal,
      };
    }
  }

  function populate(s) {
    const local = [];
    const free = (x, y, d = 1.15) => !local.some((e) => Math.abs(e.y - y) < d && Math.abs(e.x - x) < d + (e.w || 0));
    // Nothing on a crossing, nothing in a gap or on its edges.
    const blocked = (y) => local.some((e) => ((e.kind === 'light' || e.kind === 'rail') && y > e.y - 14 && y < e.y + 9)
      || (e.kind === 'gap' && y > e.y - 1.5 && y < e.y + e.len + 2));
    const add = (kind, type, y, off, extra = {}) => {
      if (y >= s.end - 0.5 || y < s.start || blocked(y)) return null;
      const lim = halfWidth(y) - 0.55 - (OBSTACLES[type]?.w || 0);
      const x = center(y) + Math.max(-lim, Math.min(lim, off));
      if (!free(x, y)) return null;
      const e = { id: world.nextId++, kind, type, x, y, ...extra };
      if (OBSTACLES[type]?.w) e.w = OBSTACLES[type].w;
      local.push(e);
      return e;
    };
    const addItem = (y, off, key) => {
      if (versus && key !== 'balloon') return null; // in versus only the race's 7 things (and balloons)
      const spec = itemSpec(s.kind, key);
      return add('item', spec.type, y, off, spec);
    };
    // Someone crossing: starts at the side and walks over when the cart comes close.
    const style = T.theme === 'alpine' && s.kind !== 'street' ? 'skier' : T.theme === 'sea' ? 'bather' : null;
    const addCrosser = (y, side, d, extra = {}) => {
      const lim = halfWidth(y) - 0.7;
      const e = add('obstacle', 'walker', y, side * lim, { mode: 'cross', side, speed: range(1.3, 2.1) + 0.7 * d + (style === 'skier' ? 1.5 : 0), wake: range(10, 17), look: Math.floor(r() * 64), style, ...extra });
      if (e) e.x = center(y) + side * (halfWidth(y) + 1.2);
      return e;
    };
    const addCoin = (x, y, h = 0) => local.push({ id: world.nextId++, kind: 'coin', x, y, h });
    // A line of coins to follow (curving a little).
    const addCoins = (y, off, n = 5) => {
      const drift = range(-0.35, 0.35);
      for (let i = 0; i < n; i++) {
        const yy = y + i * 1.3;
        if (yy >= s.end - 0.5 || blocked(yy)) break;
        const lim = halfWidth(yy) - 0.6;
        addCoin(center(yy) + Math.max(-lim, Math.min(lim, off + drift * i)), yy);
      }
    };
    // Something that chases (or steals) when the cart goes by.
    const addChaser = (y, species) => local.push({ id: world.nextId++, kind: 'dog', species, x: center(y) + (r() < 0.5 ? -1 : 1) * (halfWidth(y) + 0.6), y, look: Math.floor(r() * 4) });

    // Traffic light with a zebra crossing, or a crossing (train, snowplow, big wave).
    const C = T.crossing;
    if (C && C.on.includes(s.kind) && nextRail < s.end - 30 && nextRail > s.start + 25) {
      local.push({ id: world.nextId++, kind: 'rail', vehicle: C.vehicle, x: center(nextRail), y: nextRail, state: 'idle' });
      nextRail += range(420, 620);
    } else if (T.lights.includes(s.kind) && nextLight < s.end - 25 && nextLight > s.start + 20) {
      local.push({ id: world.nextId++, kind: 'light', x: center(nextLight), y: nextLight, state: 'idle', willRed: r() < 0.8, crowd: 5 + Math.floor(r() * 5) });
      nextLight += range(140, 220);
    }
    if (nextLight < s.end) nextLight = Math.max(nextLight, s.end + 25);
    if (nextRail < s.end) nextRail = Math.max(nextRail, s.end + 40);

    let y = Math.max(s.start + 2, 22);
    while (y < s.end - 2) {
      // Difficulty 0 → 1 over the first 2.5 km (later tracks start harder).
      const d = Math.min(1, T.d0 + y / 2500);
      const lim = halfWidth(y) - 0.7;
      const u = () => range(-lim, lim);
      let pattern = pick(patterns(s.kind, d, y < 60));
      if (versus && ['single', 'row', 'trail', 'heart'].includes(pattern)) pattern = 'none';

      switch (pattern) {
        case 'single': addItem(y, u()); break;
        case 'row': {
          const n = r() < 0.75 ? 2 : 3, w = Math.min(lim, 2.2), mid = range(-lim + w, lim - w) || 0;
          for (let i = 0; i < n; i++) addItem(y + i * 0.4, mid - w + (i * 2 * w) / (n - 1));
          break;
        }
        case 'trail': {
          let off = u();
          const drift = range(-0.9, 0.9);
          for (let i = 0; i < 3; i++) { if (i !== 1 || r() < 0.5) addItem(y + i * 1.8, off); off += drift; }
          y += 4;
          break;
        }
        case 'balloons': {
          const off = u();
          addItem(y, off, 'balloon'); addItem(y + 1.8, off, 'balloon');
          y += 2;
          break;
        }
        case 'heart': {
          const off = u();
          if (!blocked(y) && free(center(y) + off, y)) local.push({ id: world.nextId++, kind: 'heart', x: center(y) + off, y, h: 0 });
          break;
        }
        case 'obstacle': {
          const off = u();
          add('obstacle', obstacleFor(s.kind), y, off);
          if (r() < 0.4 && !versus) addItem(y + range(-0.5, 0.5), off > 0 ? off - range(1.6, 2.6) : off + range(1.6, 2.6));
          break;
        }
        case 'gate': {
          // Two obstacles with a prize between them (the clear gap is at least 1.7: the cart is 0.9 wide).
          const gap = range(1.95, 2.5) - 0.25 * d;
          const type = gateFor(s.kind);
          const half = gap / 2 + OBSTACLES[type].r;
          const mid = range(-lim + half, lim - half) || 0;
          add('obstacle', type, y, mid - half);
          add('obstacle', type, y, mid + half);
          addItem(y + 0.1, mid);
          break;
        }
        case 'jump': {
          // Something low and wide: jump it (coins in the air over it), or find the way round.
          const e = add('obstacle', jumpFor(s.kind), y, u());
          if (e) for (let i = -1; i <= 1; i++) addCoin(e.x, y + i * 1.1, 1.3 - Math.abs(i) * 0.35);
          if (r() < 0.35) addItem(y + 3, u());
          break;
        }
        case 'coins': addCoins(y, u() * 0.8); y += 5; break;
        case 'ice': add('obstacle', 'ice', y, u()); if (r() < 0.5) addCoins(y - 1.3, u() * 0.6, 3); break;
        case 'roadworks': {
          // A pipe across most of the road with barriers: jump or squeeze past the end.
          const side = r() < 0.5 ? -1 : 1;
          add('obstacle', 'pipe', y, side * (lim - 1.5) * 0.6);
          add('obstacle', 'barrier', y - 1.6, side * (lim - 1.0));
          add('obstacle', 'cone', y - 1.6, -side * 0.4);
          y += 3;
          break;
        }
        case 'potholes': {
          const n = 2 + Math.floor(r() * (2 + 2 * d));
          for (let i = 0; i < n; i++) add('obstacle', 'pothole', y + i * range(1.4, 2.4), u());
          y += n * 1.5;
          break;
        }
        case 'puddle': add('obstacle', 'puddle', y, u()); if (r() < 0.4) addItem(y + 3, u()); break;
        case 'ramp': {
          const off = range(-lim * 0.6, lim * 0.6);
          add('obstacle', 'ramp', y, off);
          addItem(y + 5.2, off);
          y += 7;
          break;
        }
        case 'skijump': {
          // A ski jump: a long flight, coins in the air.
          const off = range(-lim * 0.5, lim * 0.5);
          if (add('obstacle', 'skijump', y, off)) for (let i = 1; i <= 4; i++) addCoin(center(y + i * 2.6) + off, y + i * 2.6, 1.6 + Math.sin((i / 5) * Math.PI) * 1.6);
          y += 11;
          break;
        }
        case 'geyser': {
          const off = u() * 0.8;
          if (add('obstacle', 'geyser', y, off, { phase: r() * 3 })) for (let i = 1; i <= 3; i++) addCoin(center(y) + off, y + i * 1.2, 2.2 + i * 0.5);
          y += 4;
          break;
        }
        case 'gap': {
          // No road for a few metres (water or lava below): jump it, or take the ramp in the middle.
          if (y + 16 > s.end - 3 || blocked(y) || blocked(y + 12)) break;
          const len = range(4.2, 5.4) + 0.8 * d;
          const off = range(-lim * 0.4, lim * 0.4);
          const ramp = add('obstacle', 'ramp', y, off);
          const g0 = y + 3.2;
          local.push({ id: world.nextId++, kind: 'gap', x: center(g0), y: g0, len, lava: s.kind === 'trail' });
          for (let i = 0; i < 3; i++) addCoin(center(g0 + (i + 0.5) * len / 3) + (ramp ? off : 0), g0 + (i + 0.5) * len / 3, 1.4 + (i === 1 ? 0.4 : 0));
          y = g0 + len + 2;
          break;
        }
        case 'wave': {
          // A wave rolls across the pier when the cart gets close: jump it or get pushed.
          if (!blocked(y)) local.push({ id: world.nextId++, kind: 'wave', side: r() < 0.5 ? -1 : 1, x: center(y), y, wake: range(9, 13) });
          break;
        }
        case 'snowball': local.push({ id: world.nextId++, kind: 'roller', type: 'snowball', x: center(y), y }); y += 6; break;
        case 'boost': {
          const off = range(-lim * 0.7, lim * 0.7);
          add('obstacle', 'boost', y, off);
          addCoins(y + 2, off, 4);
          y += 4;
          break;
        }
        case 'mover': {
          // A block sliding from one side of the road to the other.
          const amp = Math.max(0.6, lim - 0.4);
          const e = add('obstacle', 'block', y, 0, { move: amp, freq: range(1.1, 1.8) + 0.4 * d, phase: r() * 6.28 });
          if (e) e.x0 = center(y);
          break;
        }
        case 'crosser': addCrosser(y, r() < 0.5 ? -1 : 1, d); break;
        case 'crowd': {
          // A few people crossing together, from both sides.
          const n = 2 + Math.floor(r() * (2 + 2 * d));
          for (let i = 0; i < n; i++) addCrosser(y + i * range(0.9, 1.6), r() < 0.5 ? -1 : 1, d, { wake: range(12, 18) });
          y += n * 1.2;
          break;
        }
        case 'along': {
          // Someone coming up the road towards the cart.
          add('obstacle', 'walker', y + 8, u(), { mode: 'along', speed: range(1.0, 1.6), wake: 40, look: Math.floor(r() * 64), sway: r() * 6, style });
          break;
        }
        case 'pigeons': {
          const off = u();
          local.push({ id: world.nextId++, kind: 'pigeons', x: center(y) + off, y, n: 3 + Math.floor(r() * 4) });
          if (r() < 0.4) addItem(y + 2.5, u());
          break;
        }
        case 'animal': addChaser(y, T.animal); break;
        case 'thief': addChaser(y, T.thief); break;
        default: break;
      }
      const busy = (1 - 0.3 * d) * T.busy;
      y += (s.kind === 'market' ? range(6, 8.5) : s.kind === 'stairs' ? range(6.5, 9) : range(7, 10)) * busy;
    }
    local.sort((a, b) => a.y - b.y);
    for (const e of local) world.entities.push(e);
  }

  /** Makes sure the world exists up to y. */
  world.ensure = (y) => { while (world.made < y) addSection(); };
  /** Forgets what is far behind the cart. Returns how many things were dropped from the list. */
  world.prune = (y) => {
    let i = 0;
    while (i < world.entities.length && world.entities[i].y < y) i++;
    if (i) world.entities.splice(0, i);
    while (sections.length > 2 && sections[0].end < y) sections.shift();
    return i;
  };
  /** Clears a stretch of road (for the checkout). */
  world.clear = (y0, y1) => {
    world.entities = world.entities.filter((e) => e.y < y0 || e.y > y1);
  };
  world.ensure(200);
  return world;
}
