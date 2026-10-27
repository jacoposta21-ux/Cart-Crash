// The endless downhill town. Sections (street, sidewalk, stairs, market) are
// made one after another as the cart gets close, each with its curve, width,
// slope and what lies on it. The deeper you go, the busier it gets.
// Units are metres: x across the road, y down the road, elevation up.

export const STEP_LENGTH = 1.15; // one stair
export const STEP_HEIGHT = 0.38;

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

// Half width of the rideable surface, how fast it rolls (pace) and how steep it looks (drop per metre).
export const SECTION = {
  street: { hw: 3.4, pace: 1.0, drop: 0.1 },
  sidewalk: { hw: 2.6, pace: 0.9, drop: 0.08 },
  stairs: { hw: 3.0, pace: 1.2, drop: STEP_HEIGHT / STEP_LENGTH },
  market: { hw: 3.8, pace: 0.8, drop: 0.05 },
};

// Obstacles: radius on the ground, height (a hop higher than this clears it), solid (a crash) or not.
export const OBSTACLES = {
  cone: { r: 0.32, height: 0.6, solid: true },
  bin: { r: 0.5, height: 1.2, solid: true },
  crate: { r: 0.52, height: 0.95, solid: true },
  bollard: { r: 0.26, height: 0.9, solid: true },
  scooter: { r: 0.55, height: 1.0, solid: true },
  walker: { r: 0.4, height: 1.7, solid: true },
  pothole: { r: 0.5, height: 0.15, solid: false },
  puddle: { r: 0.75, height: 0.1, solid: false },
  ramp: { r: 0.65, height: 0.35, solid: false },
};

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function createWorld(seed) {
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
  const a1 = range(1.6, 2.2), a2 = range(0.5, 0.9);
  const raw = (y) => a1 * Math.sin(y / f1 + p1) + a2 * Math.sin(y / f2 + p2);
  const base = raw(0);
  const center = (y) => (raw(y) - base) * smooth(y / 40);

  const world = { seed, sections: [], entities: [], made: 0, center, nextId: 0 };
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
      if (t < 1) return SECTION[s.prev].hw + (w - SECTION[s.prev].hw) * smooth(t);
    }
    return w;
  };
  /** Height of the ground (it only goes down). Stairs come in steps. */
  const elevation = (y) => {
    const s = sectionAt(y);
    const d = Math.max(0, y - s.start);
    if (s.kind === 'stairs') return s.e0 - Math.min(Math.floor(d / STEP_LENGTH + 1e-9) + (d > 0 ? 1 : 0), s.steps) * STEP_HEIGHT;
    return s.e0 - d * SECTION[s.kind].drop;
  };
  Object.assign(world, { sectionAt, halfWidth, elevation });

  // ---- sections ----
  const LEN = { street: [60, 100], sidewalk: [45, 70], stairs: [18, 30], market: [60, 90] };
  function addSection() {
    const last = sections[sections.length - 1];
    const start = last ? last.end : 0;
    let kind = 'street';
    let len = range(80, 100);
    if (last) {
      const weights = { street: 3, sidewalk: 2, stairs: 2, market: 2 };
      weights[last.kind] = 0;
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

  // ---- what lies on the road ----
  const itemWeights = (kind) => (kind === 'market'
    ? { goods: 44, melon: 22, balloon: 8, oil: 10, eggs: 14 }
    : kind === 'stairs'
      ? { goods: 54, balloon: 12, eggs: 10, oil: 8, melon: 16 }
      : { goods: 44, melon: 16, balloon: 9, oil: 13, eggs: 14 });
  const obstacleFor = (kind) => pick(kind === 'market'
    ? { crate: 5, bin: 1, cone: 1 }
    : kind === 'sidewalk'
      ? { bollard: 4, bin: 3, scooter: 2 }
      : { cone: 4, bin: 2, scooter: 2, crate: 1 });

  function populate(s) {
    const ents = world.entities;
    const local = [];
    const free = (x, y, d = 1.15) => !local.some((e) => Math.abs(e.y - y) < d && Math.abs(e.x - x) < d);
    const add = (kind, type, y, off, extra = {}) => {
      if (y >= s.end - 0.5 || y < s.start) return null;
      const lim = halfWidth(y) - 0.55;
      const x = center(y) + Math.max(-lim, Math.min(lim, off));
      if (!free(x, y)) return null;
      const e = { id: world.nextId++, kind, type, x, y, ...extra };
      local.push(e);
      return e;
    };
    const addItem = (y, off, type) => add('item', type || pick(itemWeights(s.kind)), y, off, { variant: Math.floor(r() * 8) });

    let y = Math.max(s.start + 2, 24);
    while (y < s.end - 2) {
      // Difficulty 0 → 1 over the first ~2.5 km.
      const d = Math.min(1, y / 2500);
      const lim = halfWidth(y) - 0.7;
      const u = () => range(-lim, lim);
      const early = y < 70;
      let pattern;
      if (s.kind === 'stairs') pattern = pick({ single: 3, row: 3, trail: 2, balloons: 0.6, pigeons: 1 });
      else if (s.kind === 'market') pattern = pick({ single: 3, row: 3, trail: 2, obstacle: 3 + 2 * d, gate: 3, potholes: 1, puddle: 1, walker: 1.2 + 2 * d, pigeons: 1.2 });
      else if (early) pattern = pick({ single: 3, row: 2, trail: 2, obstacle: 1, pigeons: 1 });
      else pattern = pick({
        single: 3, row: 2, trail: 2, obstacle: 2.5 + 2 * d, gate: 2 + d, potholes: 1.5 + d, puddle: 1.2,
        ramp: s.kind === 'street' ? 1.2 : 0, walker: 1 + 2.5 * d, pigeons: 1, dog: s.kind === 'street' ? 0.35 : 0.15,
      });

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
        case 'balloons': {
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
          // Two obstacles with a prize between them
          // (the gap is the clear space between the two, at least 1.7: the cart is 0.9 wide)
          const gap = range(1.95, 2.5) - 0.25 * d;
          const type = obstacleFor(s.kind);
          const half = gap / 2 + OBSTACLES[type].r;
          const mid = range(-lim + half, lim - half) || 0;
          add('obstacle', type, y, mid - half);
          add('obstacle', type, y, mid + half);
          addItem(y + 0.1, mid, pick({ melon: 3, eggs: 3, oil: 1, balloon: 1 }));
          break;
        }
        case 'potholes': {
          const n = 2 + Math.floor(r() * (2 + 2 * d));
          for (let i = 0; i < n; i++) add('obstacle', 'pothole', y + i * range(1.4, 2.4), u());
          y += n * 1.5;
          break;
        }
        case 'puddle': add('obstacle', 'puddle', y, u()); addItem(y + 3, u()); break;
        case 'ramp': {
          const off = range(-lim * 0.6, lim * 0.6);
          add('obstacle', 'ramp', y, off);
          for (let i = 1; i <= 3; i++) addItem(y + 2.6 * i, off, i === 2 ? (r() < 0.4 ? 'balloon' : 'eggs') : 'goods');
          y += 7;
          break;
        }
        case 'walker': {
          // Someone crossing the street: starts on one side when the cart gets near.
          const side = r() < 0.5 ? -1 : 1;
          const e = add('obstacle', 'walker', y, side * (lim + 0.4), { side, speed: range(1.3, 2.0) + 0.6 * d, wake: range(11, 16), look: Math.floor(r() * 64) });
          if (e) { e.x0 = e.x; e.startX = center(y) + side * (halfWidth(y) + 1.2); e.x = e.startX; }
          break;
        }
        case 'pigeons': {
          const off = u();
          local.push({ id: world.nextId++, kind: 'pigeons', x: center(y) + off, y, n: 3 + Math.floor(r() * 4) });
          addItem(y + 2.5, u());
          break;
        }
        case 'dog': {
          local.push({ id: world.nextId++, kind: 'dog', x: center(y) + (r() < 0.5 ? -1 : 1) * (halfWidth(y) + 0.6), y, look: Math.floor(r() * 4) });
          addItem(y, u());
          break;
        }
        default: break;
      }
      const busy = 1 - 0.3 * d;
      y += (s.kind === 'market' ? range(7, 9.5) : s.kind === 'stairs' ? range(7.5, 10) : range(8.5, 11.5)) * busy;
    }
    local.sort((a, b) => a.y - b.y);
    for (const e of local) ents.push(e);
  }

  /** Makes sure the town exists up to y. */
  world.ensure = (y) => { while (world.made < y) addSection(); };
  /** Forgets what is far behind the cart. */
  world.prune = (y) => {
    let i = 0;
    while (i < world.entities.length && world.entities[i].y < y) i++;
    if (i) world.entities.splice(0, i);
    while (sections.length > 2 && sections[0].end < y) sections.shift();
    return i;
  };
  world.ensure(200);
  return world;
}
