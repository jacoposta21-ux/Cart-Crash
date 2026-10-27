// The ride itself, without any drawing: the cart, its load and how the load
// changes the steering. step() is deterministic for a seed and a sequence of
// steering inputs, so tests can drive whole rides.
import { createTrack, rng, OBSTACLES, SECTION, STEP_LENGTH } from './track.js';

// value: points if it reaches the bottom. weight: how heavy (balloons lift).
// h: height in the pile (balloons fly on strings instead).
export const ITEMS = {
  goods: { value: 10, weight: 0.3 },
  melon: { value: 25, weight: 2.2, h: 0.72 },
  balloon: { value: 15, weight: -0.35, h: 0 },
  oil: { value: 20, weight: 0.45, h: 0.62 },
  eggs: { value: 40, weight: 0.15, h: 0.3 },
};
// Everyday stuff for the pile, each a little different in height.
export const GOODS = ['cereal', 'roll', 'can', 'bread', 'cheese', 'soda', 'pineapple', 'detergent'];
export const GOODS_H = { cereal: 0.62, roll: 0.46, can: 0.38, bread: 0.34, cheese: 0.32, soda: 0.56, pineapple: 0.62, detergent: 0.54 };
export const itemHeight = (it) => (it.type === 'goods' ? GOODS_H[it.goods] : ITEMS[it.type].h);

export const RIM = 0.62; // the basket holds anything below this height
export const MAX_PILE = 9; // higher than this, the top just slides off
export const CART_R = 0.45;
const GRAVITY = 21;
const OIL_TIME = 3.2;
const PUDDLE_TIME = 2.2;

export function createGame(seed, opts = {}) {
  const track = createTrack(seed);
  return {
    seed,
    daily: Boolean(opts.daily),
    track,
    t: 0,
    finished: false,
    finishT: 0,
    next: 0, // first entity not yet behind the cart
    rand: rng(seed ^ 0x9e3779b9),
    cart: { x: 0, y: 0, v: 0, vx: 0, z: 0, vz: 0, oil: 0, spin: 0, hopIn: 1.2, curbCd: 0, hitCd: 0, step: 0, air: 0 },
    stack: [], // bottom first: { type, goods?, h }
    balloons: [], // { color }
    tilt: 0,
    tiltV: 0,
    wobble: 0, // 0..1+, how close the pile is to tipping
    tallMark: 0,
    picked: 0,
    lost: [], // items that fell off, broke or popped
    events: [],
  };
}

export const stackHeight = (g) => g.stack.reduce((a, it) => a + it.h, 0);
export const count = (g, type) => (type === 'balloon' ? g.balloons.length : g.stack.filter((it) => it.type === type).length);
export const cartValue = (g) => g.stack.reduce((a, it) => a + ITEMS[it.type].value, 0) + g.balloons.length * ITEMS.balloon.value;
export const mass = (g) => Math.max(0.55, 1 + g.stack.reduce((a, it) => a + ITEMS[it.type].weight, 0) + g.balloons.length * ITEMS.balloon.weight);
export const progress = (g) => Math.min(1, g.cart.y / g.track.length);

/** How the load changes the handling right now (also shown in the HUD). */
export function handling(g) {
  const melons = count(g, 'melon');
  const balloons = g.balloons.length;
  const heavy = 1 + 0.5 * melons;
  return {
    maxLat: 7.4 / (1 + 0.16 * melons),
    grip: g.cart.oil > 0 ? 1.1 : 10 / heavy,
    hopEvery: balloons ? Math.max(1.1, 2.9 - 0.3 * balloons) : 0,
    hopPower: balloons ? (4.2 + 1.15 * Math.min(balloons, 6)) / Math.sqrt(mass(g)) : 0,
    gravity: GRAVITY * Math.max(0.4, 1 - 0.09 * balloons),
  };
}

function emit(g, type, data = {}) {
  g.events.push({ type, t: g.t, ...data });
}

function loseTop(g, why, side = 0) {
  const it = g.stack.pop();
  if (!it) return null;
  g.lost.push({ ...it, why });
  emit(g, 'fall', { item: it, why, side: side || (g.rand() < 0.5 ? -1 : 1), height: stackHeight(g) });
  return it;
}

/** A bump: shakes the pile, may throw off what sticks out, breaks eggs on hard ones. */
export function jolt(g, j, cause) {
  const H = stackHeight(g);
  const side = g.rand() < 0.5 ? -1 : 1;
  g.tiltV += side * j * (0.7 + 0.25 * H);
  emit(g, 'bump', { j, cause });
  if (j >= 0.6) {
    for (let i = g.stack.length - 1; i >= 0; i--) {
      if (g.stack[i].type === 'eggs' && g.rand() < 0.45 + 0.4 * (j - 0.6)) {
        const [egg] = g.stack.splice(i, 1);
        g.lost.push({ ...egg, why: 'broke' });
        emit(g, 'break', { item: egg });
      }
    }
  }
  const over = stackHeight(g) - RIM;
  if (over > 0 && j >= 0.4 && g.rand() < j * 0.2 * Math.min(2.5, over)) loseTop(g, 'bump', side);
}

function pickUp(g, e) {
  e.taken = true;
  g.picked++;
  const c = g.cart;
  if (e.type === 'balloon') {
    g.balloons.push({ color: e.variant % 5 });
  } else {
    const it = { type: e.type, h: 0 };
    if (e.type === 'goods') it.goods = GOODS[e.variant % GOODS.length];
    it.h = itemHeight(it);
    g.stack.push(it);
    // Something landing in the basket rocks it a little.
    g.tiltV += (g.rand() - 0.5) * (0.6 + it.h);
  }
  if (e.type === 'oil') c.oil = Math.max(c.oil, OIL_TIME);
  emit(g, 'pickup', { item: e.type, goods: e.type === 'goods' ? GOODS[e.variant % GOODS.length] : null, value: ITEMS[e.type].value, x: e.x, y: e.y });
}

function crash(g, e) {
  const c = g.cart;
  const o = OBSTACLES[e.type];
  e.knocked = true;
  e.knockDir = Math.sign(e.x - c.x) || 1;
  c.hitCd = 0.5;
  c.v *= 0.55;
  c.vx = -e.knockDir * 4.5;
  emit(g, 'crash', { obstacle: e.type, x: e.x, y: e.y });
  if (g.balloons.length && g.rand() < 0.5) {
    const b = g.balloons.pop();
    g.lost.push({ type: 'balloon', why: 'popped', ...b });
    emit(g, 'pop', {});
  }
  loseTop(g, 'crash', -e.knockDir);
  jolt(g, 0.75 + o.height * 0.3, 'crash');
}

/** Advance the ride by dt seconds; steer is -1 (left) .. 1 (right). */
export function step(g, dt, steer = 0) {
  const c = g.cart;
  const tr = g.track;
  g.t += dt;
  if (g.finished) {
    g.finishT += dt;
    c.v = Math.max(0, c.v - 14 * dt);
    c.y += c.v * dt;
    c.vx *= Math.max(0, 1 - 4 * dt);
    c.x += c.vx * dt;
    steer = 0;
  }
  const hd = handling(g);
  const sec = tr.sectionAt(c.y);

  if (!g.finished) {
    // Downhill: steeper sections and a heavier cart roll faster, and it speeds up as the ride goes on.
    const target = 6.5 + 4.2 * SECTION[sec.kind].slope + 3.6 * progress(g) + 0.35 * Math.min(mass(g) - 1, 6);
    c.v += (target - c.v) * Math.min(1, (c.v < 4 ? 2.4 : 1.1) * dt);
    c.y += c.v * dt;
  }

  // Steering: watermelons slow it down, oil makes the cart slide, in the air there is little grip.
  const airborne = c.z > 0.02;
  const grip = hd.grip * (airborne ? 0.25 : 1);
  const vx0 = c.vx;
  c.vx += (steer * hd.maxLat - c.vx) * Math.min(1, grip * dt);
  if (c.oil > 0) {
    c.oil -= dt;
    c.spin += (c.vx * 0.35 + 2.2 * Math.sin(g.t * 5)) * dt;
  } else {
    c.spin *= Math.max(0, 1 - 6 * dt);
  }
  c.x += c.vx * dt;
  const ax = (c.vx - vx0) / Math.max(dt, 1e-6);

  // Hops (balloons) and jumps (ramps).
  if (c.z > 0 || c.vz > 0) {
    c.vz -= hd.gravity * dt;
    c.z += c.vz * dt;
    c.air += dt;
    if (c.z <= 0) {
      const impact = -c.vz;
      c.z = 0; c.vz = 0; c.air = 0;
      emit(g, 'land', { impact });
      if (impact > 3) jolt(g, Math.min(1.1, (impact - 3) * 0.1 + 0.15), 'land');
    }
  } else if (hd.hopEvery && !g.finished) {
    c.hopIn -= dt;
    if (c.hopIn <= 0) {
      c.vz = hd.hopPower;
      c.hopIn = hd.hopEvery;
      emit(g, 'hop', {});
    }
  }

  // The road's edges: curbs, walls and market stalls bounce the cart back.
  c.curbCd -= dt;
  c.hitCd -= dt;
  const cx = tr.center(c.y);
  const lim = tr.halfWidth(c.y) - CART_R;
  if (Math.abs(c.x - cx) > lim) {
    const side = Math.sign(c.x - cx);
    c.x = cx + side * lim;
    if (c.curbCd <= 0 && Math.abs(c.vx) > 1.2) {
      c.curbCd = 0.35;
      c.v *= 0.94;
      emit(g, 'curb', { side });
      jolt(g, Math.min(0.55, 0.2 + Math.abs(c.vx) * 0.05), 'curb');
    }
    c.vx = -side * Math.max(1.2, Math.abs(c.vx) * 0.45);
  }

  // Stairs: every step is a small bump (unless you fly over it).
  if (sec.kind === 'stairs' && !airborne) {
    const s = Math.floor(c.y / STEP_LENGTH);
    if (s !== c.step) { c.step = s; jolt(g, 0.22, 'stairs'); }
  } else c.step = Math.floor(c.y / STEP_LENGTH);

  // What the cart touches.
  const ents = tr.entities;
  while (g.next < ents.length && ents[g.next].y < c.y - 2) g.next++;
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 1.5; i++) {
    const e = ents[i];
    if (e.taken || e.knocked) continue;
    const dx = e.x - c.x, dy = e.y - c.y;
    if (e.kind === 'item') {
      if (dx * dx + dy * dy < 0.78 * 0.78 && c.z < 1.4) pickUp(g, e);
      continue;
    }
    const o = OBSTACLES[e.type];
    const rr = o.r + CART_R * 0.85;
    if (dx * dx + dy * dy > rr * rr || c.z > o.height) continue;
    if (o.solid) { if (c.hitCd <= 0) crash(g, e); continue; }
    if (e.used) continue;
    e.used = true;
    if (e.type === 'pothole') jolt(g, 0.75, 'pothole');
    else if (e.type === 'puddle') { c.oil = Math.max(c.oil, PUDDLE_TIME); emit(g, 'slip', {}); }
    else if (e.type === 'ramp') { c.vz = 8.4; c.z = 0.03; emit(g, 'ramp', {}); }
  }

  // The pile: a spring that sways with the steering and topples when it leans too far.
  const H = stackHeight(g);
  const K = 26 / (1 + 0.3 * H);
  const drive = -ax * 0.0035 * (0.35 + H);
  g.tiltV += (-K * g.tilt - 2.6 * g.tiltV + drive) * dt;
  g.tilt += g.tiltV * dt;
  const over = H - RIM;
  if (over <= 0) {
    // Low loads sit in the basket.
    const cap = 0.1 + over * 0.05;
    if (Math.abs(g.tilt) > cap) { g.tilt = Math.sign(g.tilt) * cap; g.tiltV *= 0.3; }
    g.wobble = Math.abs(g.tilt) / 0.6;
  } else {
    const crit = 0.8 / (1 + 0.12 * over) / (1 + 0.02 * over * over);
    g.wobble = Math.abs(g.tilt) / crit;
    if (g.wobble > 1 || H > MAX_PILE) {
      loseTop(g, H > MAX_PILE ? 'full' : 'tipped', Math.sign(g.tilt));
      g.tilt *= 0.3;
      g.tiltV *= 0.25;
    }
  }
  // A new personal tallest pile in this ride (at 3, 5 and 7 units).
  const mark = [3, 5, 7].filter((m) => H >= m).length;
  if (mark > g.tallMark) { g.tallMark = mark; emit(g, 'tall', { height: H }); }

  if (!g.finished && c.y >= tr.length) {
    g.finished = true;
    g.finishT = 0;
    emit(g, 'finish', { score: cartValue(g) });
  }
}

/** Pops this step's events (for sound and effects). */
export function drainEvents(g) {
  const out = g.events;
  g.events = [];
  return out;
}

/** The ride's outcome, for the end screen and the records. */
export function result(g) {
  const byType = {};
  for (const it of g.stack) byType[it.type] = (byType[it.type] || 0) + 1;
  if (g.balloons.length) byType.balloon = g.balloons.length;
  const lostValue = g.lost.reduce((a, it) => a + ITEMS[it.type].value, 0);
  return {
    score: cartValue(g),
    items: g.stack.length + g.balloons.length,
    byType,
    lost: g.lost.length,
    lostValue,
    broken: g.lost.filter((it) => it.why === 'broke').length,
    popped: g.lost.filter((it) => it.why === 'popped').length,
    tallest: g.stack.length,
    time: g.t,
  };
}
