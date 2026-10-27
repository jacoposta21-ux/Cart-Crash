// The ride itself, without any drawing: the cart, its load, the shopping list
// and how the load changes the steering. A ride is a race: get everything on
// the list into the cart, then reach the checkout. Three crashes (or the
// train) and you are out. step() is deterministic for a seed and a sequence
// of inputs, so tests can drive whole rides.
import { createWorld, rng, OBSTACLES, SECTION, STEP_LENGTH, GOODS, LIGHT_STOP } from './world.js';

export { GOODS };
// value: kept for the effects (a heavy pile is worth more to lose). weight: how heavy (balloons lift).
// h: height in the pile (balloons fly on strings instead).
export const ITEMS = {
  goods: { value: 10, weight: 0.3 },
  melon: { value: 25, weight: 2.2, h: 0.72 },
  balloon: { value: 15, weight: -0.35, h: 0 },
  oil: { value: 20, weight: 0.45, h: 0.62 },
  eggs: { value: 40, weight: 0.15, h: 0.3 },
};
export const GOODS_H = { cereal: 0.62, roll: 0.46, can: 0.38, bread: 0.34, cheese: 0.32, soda: 0.56, pineapple: 0.62, detergent: 0.54 };
export const itemHeight = (it) => (it.type === 'goods' ? GOODS_H[it.goods] : ITEMS[it.type].h);
/** What a thing is called on the shopping list. */
export const itemKey = (it) => (it.type === 'goods' ? it.goods : it.type);

export const RIM = 0.62; // the basket holds anything below this height
export const MAX_PILE = 5.2; // higher than this, the top just slides off: there is no room
export const CART_R = 0.45;
export const LIVES = 3;
export const JUMP_SPEED = 6.8;
const GRAVITY = 21;
const OIL_TIME = 3.2;
const PUDDLE_TIME = 2.2;
const SAFE_TIME = 1.6; // after a crash, a moment to recover
const BRAKE = 15; // m/s² of braking
const CHECKOUT_AHEAD = 70;
// Traffic lights: yellow, then red while a crowd crosses.
export const YELLOW_TIME = 1.4;
export const RED_TIME = 5.0;
// Level crossings: bells and barriers, then the train goes by.
export const RAIL_WARN = 2.4;
export const TRAIN_TIME = 3.4;
export const TRAIN_LENGTH = 58;
export const TRAIN_SPEED = 24;
// Dogs.
const DOG_SPEED = 10.5;
// The traffic warden: runs after you for 10 s when you run a red light.
export const COP_SPEED = 11;
export const COP_TIME = 10;
// Chasers run beside the cart, just behind it, where the camera sees them.
// They keep up with a cart that rolls on and catch one that slows down.
export const CHASE_GAP = 2.4; // metres behind the cart at most
const CATCH_GAP = 0.5;
const DOG_TIME = 12;

const LIST_POOL = ['melon', 'oil', 'eggs', ...GOODS];

/** A shopping list: 4 different things, 2–3 of each (1–2 watermelons), about 9 in all. */
export function makeList(seed, n = 4) {
  const r = rng(seed ^ 0x51ed27);
  const pool = [...LIST_POOL];
  const list = [];
  while (list.length < n) {
    const key = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const need = key === 'melon' ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
    list.push({ key, need });
  }
  return list;
}

/** Seconds added to the time for each thing in the cart that is not on the list (or one too many). */
export const EXTRA_PENALTY = 5;

export function createGame(seed, opts = {}) {
  const list = opts.list || makeList(seed);
  return {
    seed,
    list,
    world: createWorld(seed, { wanted: list.map((l) => l.key) }),
    t: 0,
    over: false,
    won: false,
    reason: null, // 'crashes' | 'train' when out
    overT: 0,
    finishTime: 0,
    distance: 0,
    lives: LIVES,
    crashes: 0,
    checkoutY: null,
    next: 0, // first entity not yet behind the cart
    rand: rng(seed ^ 0x9e3779b9),
    cart: { x: 0, y: 0, v: 0, vx: 0, z: 0, vz: 0, oil: 0, spin: 0, hopIn: 1.2, curbCd: 0, safe: 0, step: 0, flip: 0, braking: false, jumped: false },
    stack: [], // bottom first: { type, goods?, h, id }
    balloons: [], // { color }
    tilt: 0,
    tiltV: 0,
    wobble: 0, // 0..1+, how close the pile is to tipping
    tallMark: 0,
    picked: 0,
    dropped: 0,
    lost: [], // items that fell off, broke, popped or were knocked out
    dogs: [], // { x, y, gap, side, t, look, run, state: 'chase' | 'fetch' | 'eat' | 'leave', bit }
    cops: [], // { x, y, gap, side, t, run, state: 'chase' | 'leave', caught }
    events: [],
  };
}

export const stackHeight = (g) => g.stack.reduce((a, it) => a + it.h, 0);
export const count = (g, type) => (type === 'balloon' ? g.balloons.length : g.stack.filter((it) => it.type === type).length);
export const mass = (g) => Math.max(0.55, 1 + g.stack.reduce((a, it) => a + ITEMS[it.type].weight, 0) + g.balloons.length * ITEMS.balloon.weight);

/** For each list line, how many are in the cart now (capped at what is needed). */
export function listProgress(g) {
  const have = {};
  for (const it of g.stack) { const k = itemKey(it); have[k] = (have[k] || 0) + 1; }
  return g.list.map((l) => ({ ...l, have: Math.min(l.need, have[l.key] || 0) }));
}
export const listDone = (g) => listProgress(g).every((l) => l.have >= l.need);
/** Things in the cart beyond the list: junk and one too many (balloons do not count). */
export const extras = (g) => g.stack.filter((it) => !isNeeded(g, it)).length;
export const listCount = (g) => listProgress(g).reduce((a, l) => [a[0] + l.have, a[1] + l.need], [0, 0]);
/** Is one more of this wanted right now? */
export function wanted(g, key) {
  const p = listProgress(g).find((l) => l.key === key);
  return Boolean(p && p.have < p.need);
}

/** Is this thing in the cart one that the list needs (not junk, not one too many)? */
export function isNeeded(g, it) {
  const key = itemKey(it);
  const line = g.list.find((l) => l.key === key);
  if (!line) return false;
  let n = 0;
  for (const s of g.stack) { if (itemKey(s) === key) n++; if (s === it) break; }
  return n <= line.need;
}

/** How the load changes the handling right now (also shown in the HUD). */
export function handling(g) {
  const melons = count(g, 'melon');
  const balloons = g.balloons.length;
  return {
    maxLat: 7.4 / (1 + 0.16 * melons),
    grip: g.cart.oil > 0 ? 1.1 : 10 / (1 + 0.5 * melons),
    hopEvery: balloons ? Math.max(1.1, 2.9 - 0.3 * balloons) : 0,
    hopPower: balloons ? (4.2 + 1.15 * Math.min(balloons, 6)) / Math.sqrt(mass(g)) : 0,
    gravity: GRAVITY * Math.max(0.4, 1 - 0.09 * balloons),
  };
}

/** Rolling speed: faster on steep bits, with a heavy cart, and the further you get. */
export function targetSpeed(g, kind) {
  return 8 + 4.2 * SECTION[kind].pace + Math.min(8, g.distance / 150) + 0.35 * Math.min(mass(g) - 1, 6);
}

function emit(g, type, data = {}) {
  g.events.push({ type, t: g.t, ...data });
}

function loseTop(g, why, side = 0) {
  const it = g.stack.pop();
  if (!it) return null;
  g.lost.push({ ...it, why });
  emit(g, 'fall', { item: it, why, side: side || (g.rand() < 0.5 ? -1 : 1), height: stackHeight(g), wanted: wanted(g, itemKey(it)) });
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
  if (e.type === 'balloon') {
    g.balloons.push({ color: e.color ?? 0 });
    emit(g, 'pickup', { item: 'balloon', key: 'balloon', x: e.x, y: e.y, wanted: false });
    return;
  }
  const it = { type: e.type, h: 0, id: e.id };
  if (e.type === 'goods') it.goods = e.goods;
  it.h = itemHeight(it);
  const key = itemKey(it);
  const isWanted = wanted(g, key);
  g.stack.push(it);
  // Something landing in the basket rocks it a little.
  g.tiltV += (g.rand() - 0.5) * (0.6 + it.h);
  if (e.type === 'oil') g.cart.oil = Math.max(g.cart.oil, OIL_TIME);
  emit(g, 'pickup', { item: e.type, goods: it.goods || null, key, x: e.x, y: e.y, wanted: isWanted });
  if (stackHeight(g) > MAX_PILE) loseTop(g, 'full');
}

/** Loses a life (crash or dog bite). Returns true when that was the last one. */
function loseLife(g, why) {
  g.lives--;
  g.crashes++;
  g.cart.safe = SAFE_TIME;
  if (g.lives <= 0) { gameOver(g, 'crashes', why); return true; }
  return false;
}

function crash(g, e) {
  const c = g.cart;
  const o = OBSTACLES[e.type];
  e.knocked = true;
  e.knockT = g.t;
  e.knockDir = Math.sign(e.x - c.x) || 1;
  c.v *= 0.5;
  c.vx = -e.knockDir * 4.5;
  emit(g, 'crash', { obstacle: e.type, x: e.x, y: e.y, lives: g.lives - 1 });
  if (loseLife(g, e.type)) return;
  if (g.balloons.length && g.rand() < 0.5) {
    const b = g.balloons.pop();
    g.lost.push({ type: 'balloon', why: 'popped', ...b });
    emit(g, 'pop', {});
  }
  loseTop(g, 'crash', -e.knockDir);
  jolt(g, 0.75 + o.height * 0.2, 'crash');
}

function gameOver(g, reason, cause) {
  g.endCount = listCount(g);
  g.over = true;
  g.reason = reason;
  g.overT = 0;
  g.cart.flip = 0.001;
  emit(g, 'gameover', { reason, cause });
}

function win(g) {
  g.over = true;
  g.won = true;
  g.overT = 0;
  g.finishTime = g.t;
  g.extrasAtCheckout = extras(g);
  emit(g, 'checkout', { time: g.t, extras: g.extrasAtCheckout });
}

/** Drops the thing on top of the pile behind the cart (to make room, or for a dog). */
function drop(g) {
  const it = g.stack.pop();
  if (!it) return;
  g.dropped++;
  const c = g.cart;
  const e = { id: g.world.nextId++, kind: 'dropped', item: it, x: c.x, y: c.y - 0.6 };
  insertEntity(g, e);
  emit(g, 'drop', { item: it, wanted: wanted(g, itemKey(it)) });
}

function insertEntity(g, e) {
  const ents = g.world.entities;
  let i = ents.length;
  while (i > 0 && ents[i - 1].y > e.y) i--;
  ents.splice(i, 0, e);
  if (i < g.next) g.next++;
}

/**
 * Advance the ride by dt seconds. input: { steer: -1..1, brake, jump, drop }
 * (jump and drop are presses: true for the one step they happen), or just a steer number.
 */
export function step(g, dt, input = 0) {
  const inp = typeof input === 'number' ? { steer: input } : input;
  let steer = inp.steer || 0;
  const c = g.cart;
  const w = g.world;
  g.t += dt;
  if (g.over) {
    // Out: the cart tips over and the load goes everywhere. Won: it rolls to a stop at the till.
    g.overT += dt;
    c.v = Math.max(0, c.v - (g.won ? 9 : 12) * dt);
    c.y += c.v * dt;
    c.vx *= Math.max(0, 1 - 3 * dt);
    c.x += c.vx * dt;
    if (!g.won) {
      c.flip = Math.min(1, c.flip + dt * 2.5);
      if (g.stack.length && g.rand() < dt * 14) loseTop(g, 'gameover');
      if (g.balloons.length && g.rand() < dt * 6) { const b = g.balloons.pop(); g.lost.push({ type: 'balloon', why: 'flew', ...b }); emit(g, 'release', { color: b.color }); }
    }
    if (c.z > 0) { c.vz -= GRAVITY * dt; c.z = Math.max(0, c.z + c.vz * dt); }
    stepDogs(g, dt);
    stepCops(g, dt);
    return;
  }
  w.ensure(c.y + 160);
  const hd = handling(g);
  const sec = w.sectionAt(c.y);

  // Downhill, unless braking.
  const target = targetSpeed(g, sec.kind);
  c.braking = Boolean(inp.brake);
  if (c.braking) c.v = Math.max(0, c.v - BRAKE * (c.z <= 0.02 ? 1 : 0.5) * dt);
  else c.v += (target - c.v) * Math.min(1, (c.v < 5 ? 1.6 : 1.1) * dt);
  const dy = c.v * dt;
  c.y += dy;
  g.distance = c.y;

  // Steering: watermelons slow it down, oil makes the cart slide, in the air there is little grip.
  const airborne = c.z > 0.02;
  if (c.braking && !airborne) steer *= 0.6;
  const grip = hd.grip * (airborne ? 0.25 : 1);
  const vx0 = c.vx;
  c.vx += (steer * hd.maxLat * Math.min(1, 0.35 + c.v / 8) - c.vx) * Math.min(1, grip * dt);
  if (c.oil > 0) {
    c.oil -= dt;
    c.spin += (c.vx * 0.35 + 2.2 * Math.sin(g.t * 5)) * dt;
  } else {
    c.spin *= Math.max(0, 1 - 6 * dt);
  }
  c.x += c.vx * dt;
  const ax = (c.vx - vx0) / Math.max(dt, 1e-6);

  // Jumps (the player), hops (balloons) and ramps.
  if (inp.jump && !airborne) {
    c.vz = JUMP_SPEED;
    c.z = 0.03;
    emit(g, 'jump', {});
  }
  if (c.z > 0 || c.vz > 0) {
    c.vz -= hd.gravity * dt;
    c.z += c.vz * dt;
    if (c.z <= 0) {
      const impact = -c.vz;
      c.z = 0; c.vz = 0;
      emit(g, 'land', { impact });
      if (impact > 3) jolt(g, Math.min(1.1, (impact - 3) * 0.12 + 0.2), 'land');
    }
  } else if (hd.hopEvery) {
    c.hopIn -= dt;
    if (c.hopIn <= 0) {
      c.vz = hd.hopPower;
      c.hopIn = hd.hopEvery;
      emit(g, 'hop', {});
    }
  }
  if (inp.drop) drop(g);
  if (inp.release && g.balloons.length) {
    const b = g.balloons.pop();
    emit(g, 'release', { color: b.color });
  }

  // The road's edges: curbs, walls and market stalls bounce the cart back.
  c.curbCd -= dt;
  c.safe -= dt;
  const cx = w.center(c.y);
  const lim = w.halfWidth(c.y) - CART_R;
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
  const s = Math.floor(c.y / STEP_LENGTH);
  if (sec.kind === 'stairs' && !airborne && s !== c.step) jolt(g, 0.22, 'stairs');
  c.step = s;

  // People, pigeons, dogs, traffic lights and trains ahead.
  const ents = w.entities;
  if (g.next > 200) g.next -= w.prune(c.y - 25);
  while (g.next < ents.length && ents[g.next].y < c.y - 3) g.next++;
  for (let i = Math.max(0, g.next - 8); i < ents.length && ents[i].y < c.y + 110; i++) {
    const e = ents[i];
    if (e.kind === 'light') stepLight(g, e);
    else if (e.kind === 'rail') stepRail(g, e);
    if (g.over) return;
    if (e.y < c.y - 3) continue;
    if (e.type === 'walker' && !e.knocked) {
      if (e.mode === 'along') {
        if (!e.going && e.y - c.y < e.wake) e.going = true;
        if (e.going) { e.y -= e.speed * dt; e.walk = (e.walk || 0) + dt * e.speed; e.x += Math.sin(g.t * 0.8 + e.sway) * 0.4 * dt; }
      } else {
        if (!e.going && e.y - c.y < e.wake) e.going = true;
        if (e.going) {
          const endX = w.center(e.y) - e.side * (w.halfWidth(e.y) + 1.5);
          e.x += -e.side * e.speed * dt;
          e.walk = (e.walk || 0) + dt * e.speed;
          if ((e.x - endX) * -e.side > 0) e.gone = true;
        }
      }
    } else if (e.kind === 'pigeons' && !e.flying && e.y - c.y < 7) {
      e.flying = g.t;
      emit(g, 'pigeons', { x: e.x, y: e.y });
    } else if (e.kind === 'dog' && !e.chased && c.y > e.y + 1.5) {
      e.chased = true;
      const side = Math.sign(e.x - w.center(e.y)) || 1;
      g.dogs.push({ x: e.x, y: e.y, gap: CHASE_GAP, side, t: 0, look: e.look, run: 0, state: 'chase' });
      emit(g, 'dog', {});
    }
  }
  stepDogs(g, dt);
  stepCops(g, dt);
  if (g.over) return;

  // What the cart touches.
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 1.5; i++) {
    const e = ents[i];
    if (e.taken || e.knocked || e.gone) continue;
    if (e.kind !== 'item' && e.kind !== 'obstacle') continue;
    const dx = e.x - c.x, dyy = e.y - c.y;
    if (e.kind === 'item') {
      if (dx * dx + dyy * dyy < 0.8 * 0.8 && c.z < 1.4) pickUp(g, e);
      continue;
    }
    const o = OBSTACLES[e.type];
    const hit = o.w
      ? Math.abs(dx) < o.w + CART_R * 0.8 && Math.abs(dyy) < o.d + 0.45
      : dx * dx + dyy * dyy < (o.r + CART_R * 0.85) ** 2;
    if (!hit || c.z > o.height) continue;
    if (o.solid) {
      if (c.safe <= 0) crash(g, e);
      else { e.knocked = true; e.knockT = g.t; e.knockDir = Math.sign(e.x - c.x) || 1; }
      if (g.over) return;
      continue;
    }
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
    const cap = 0.1 + over * 0.05;
    if (Math.abs(g.tilt) > cap) { g.tilt = Math.sign(g.tilt) * cap; g.tiltV *= 0.3; }
    g.wobble = Math.abs(g.tilt) / 0.6;
  } else {
    const crit = 0.8 / (1 + 0.12 * over) / (1 + 0.02 * over * over);
    g.wobble = Math.abs(g.tilt) / crit;
    if (g.wobble > 1) {
      loseTop(g, 'tipped', Math.sign(g.tilt));
      g.tilt *= 0.3;
      g.tiltV *= 0.25;
    }
  }
  const H2 = stackHeight(g);
  const mark = [2.5, 4].filter((m) => H2 >= m).length;
  if (mark > g.tallMark) { g.tallMark = mark; emit(g, 'tall', { height: H2 }); }

  // The checkout appears once everything on the list is in the cart.
  const done = listDone(g);
  if (done && g.checkoutY === null) {
    g.checkoutY = c.y + CHECKOUT_AHEAD;
    w.ensure(g.checkoutY + 40);
    w.clear(g.checkoutY - 12, g.checkoutY + 30);
    for (const e of w.entities) if ((e.kind === 'light' || e.kind === 'rail') && Math.abs(e.y - g.checkoutY) < 40) e.disabled = true;
    emit(g, 'listdone', { y: g.checkoutY });
  } else if (!done && g.checkoutY !== null && c.y < g.checkoutY) {
    g.checkoutY = null;
    emit(g, 'listbroken', {});
  }
  if (g.checkoutY !== null && c.y >= g.checkoutY) {
    if (done) win(g);
    else g.checkoutY = null;
  }
}

// ---------- traffic lights ----------
export function lightPhase(g, e) {
  if (e.state !== 'cycle') return 'green';
  const t = g.t - e.t0;
  if (t < YELLOW_TIME) return 'yellow';
  if (t < YELLOW_TIME + RED_TIME) return 'red';
  return 'green';
}

/**
 * The people crossing at a light: where each one is right now (world x, y),
 * or null when they are not on the street. They cross during the red.
 */
export function crowdPeople(g, e) {
  if (e.state !== 'cycle') return [];
  const w = g.world;
  const hw = w.halfWidth(e.y);
  const cx = w.center(e.y);
  const t = g.t - e.t0 - YELLOW_TIME;
  const out = [];
  for (let i = 0; i < e.crowd; i++) {
    const dir = i % 2 ? 1 : -1;
    const delay = (i * 0.23) % 0.7;
    const speed = 2.1 + (i % 3) * 0.3;
    const knocked = e.knocked?.[i];
    const local = -dir * (hw + 1) + dir * speed * (t - delay);
    const onStreet = t > delay && Math.abs(local) < hw + 1.1;
    out.push({ i, dir, x: cx + local, y: e.y + 2.2 - (i % 4) * 0.7, walking: onStreet && !knocked, visible: onStreet || Boolean(knocked), phase: (t - delay) * 9, knocked });
  }
  return out;
}

function stepLight(g, e) {
  const c = g.cart;
  const stopY = e.y - LIGHT_STOP;
  if (e.disabled) return;
  if (e.state === 'idle' && e.willRed) {
    // It turns yellow when, at this speed, the cart would get there in the middle of the red.
    const eta = (stopY - c.y) / Math.max(c.v, 3);
    if (eta < (e.lead ?? YELLOW_TIME + 1.6) && stopY > c.y) { e.state = 'cycle'; e.t0 = g.t; emit(g, 'yellow', { y: e.y }); }
  }
  if (e.state === 'cycle' && !e.redSaid && lightPhase(g, e) === 'red') { e.redSaid = true; emit(g, 'red', { y: e.y }); }
  if (!e.passed && c.y >= stopY) {
    e.passed = true;
    if (e.state === 'cycle' && lightPhase(g, e) === 'red') { e.ranRed = true; emit(g, 'ranred', {}); }
  }
  // Riding into the crowd knocks everything out of the cart.
  if (e.state === 'cycle' && !e.crowdHit && Math.abs(c.y - (e.y + 1)) < 2.5) {
    for (const p of crowdPeople(g, e)) {
      if (!p.walking || Math.abs(p.x - c.x) > 0.75 || Math.abs(p.y - c.y) > 0.6 || c.z > 1.6) continue;
      e.crowdHit = true;
      e.knocked = e.knocked || {};
      e.knocked[p.i] = { t: g.t, dir: Math.sign(p.x - c.x) || 1 };
      const n = g.stack.length;
      while (g.stack.length) loseTop(g, 'crowd', g.rand() < 0.5 ? -1 : 1);
      emit(g, 'crowdhit', { lost: n, x: p.x, y: p.y });
      c.v *= 0.5;
      c.vx = -Math.sign(p.x - c.x || 1) * 3;
      break;
    }
  }
  // Through the red: the traffic warden saw you, and runs after you.
  if (e.ranRed && !e.copSent && c.y > stopY + 1) {
    e.copSent = true;
    const side = c.x > g.world.center(c.y) ? -1 : 1;
    g.cops.push({ x: c.x + side, y: c.y - CHASE_GAP, gap: CHASE_GAP, side, t: 0, run: 0, state: 'chase' });
    emit(g, 'cop', {});
  }
}

// ---------- level crossings ----------
/** Where the train is: { front, back } along x, or null when it is not on the road. */
export function trainSpan(g, e) {
  if (e.state !== 'warn') return null;
  const t = g.t - e.t0 - RAIL_WARN;
  if (t < 0 || t > TRAIN_TIME + 1) return null;
  const hw = g.world.halfWidth(e.y) + 6;
  const start = e.x - e.dir * (hw + 4);
  const front = start + e.dir * TRAIN_SPEED * t;
  const back = front - e.dir * TRAIN_LENGTH;
  return { front, back, min: Math.min(front, back), max: Math.max(front, back) };
}

function stepRail(g, e) {
  const c = g.cart;
  if (e.disabled) return;
  if (e.state === 'idle') {
    const eta = (e.y - c.y) / Math.max(c.v, 3);
    if (eta < (e.lead ?? RAIL_WARN + 2.6) && e.y > c.y) {
      e.state = 'warn';
      e.t0 = g.t;
      e.dir = g.rand() < 0.5 ? -1 : 1;
      emit(g, 'bells', { y: e.y });
    }
  }
  if (e.state === 'warn') {
    const t = g.t - e.t0;
    if (!e.trainSaid && t > RAIL_WARN - 0.4) { e.trainSaid = true; emit(g, 'train', { y: e.y }); }
    if (t > RAIL_WARN + TRAIN_TIME + 1.2) e.state = 'done';
    const span = trainSpan(g, e);
    if (span && Math.abs(c.y - e.y) < 1.7 && c.x > span.min - 0.6 && c.x < span.max + 0.6) {
      c.v = 0;
      gameOver(g, 'train', 'train');
    }
  }
}
export const railBarrierDown = (g, e) => e.state === 'warn' && g.t - e.t0 < RAIL_WARN + TRAIN_TIME + 0.6;

// ---------- dogs ----------
/**
 * A chaser (dog or warden) runs at `speed`, a little to one side of the cart and
 * at most CHASE_GAP behind it, so it is always on screen. Rolling faster than
 * that keeps it at bay; slowing down lets it close in. Returns true when caught.
 */
function chase(g, p, speed, dt) {
  const c = g.cart;
  // A running start: full speed after a second and a half.
  const v = Math.min(speed, 3 + 5 * p.t);
  p.gap = Math.min(CHASE_GAP, p.gap + (c.v - v) * dt);
  p.y = c.y - p.gap;
  const w = g.world;
  const lim = w.halfWidth(p.y) - 0.3;
  const want = Math.max(w.center(p.y) - lim, Math.min(w.center(p.y) + lim, c.x + p.side * 1.0));
  p.x += (want - p.x) * Math.min(1, dt * 5);
  return !g.over && p.gap < CATCH_GAP && c.z < 0.8;
}

/** Caught by a dog or the warden: it costs a life (once, with a moment of safety). */
function caught(g, type) {
  const c = g.cart;
  emit(g, type, { lives: g.lives - 1 });
  if (c.safe <= 0) loseLife(g, type === 'bite' ? 'dog' : 'cop');
  c.safe = Math.max(c.safe, SAFE_TIME);
}

function stepDogs(g, dt) {
  const c = g.cart;
  for (const d of g.dogs) {
    d.t += dt;
    d.run += dt;
    if (d.state === 'chase') {
      // A treat on the road beats a cart.
      const treat = g.world.entities.find((e) => e.kind === 'dropped' && !e.eaten && e.y < c.y && e.y > d.y - 2);
      if (treat) { d.state = 'fetch'; d.target = treat; continue; }
      if (chase(g, d, DOG_SPEED, dt)) { d.state = 'leave'; d.bit = true; caught(g, 'bite'); } else if (d.t > DOG_TIME) d.state = 'leave';
    } else if (d.state === 'fetch') {
      const treat = d.target;
      d.y += Math.max(-DOG_SPEED * dt, Math.min(DOG_SPEED * dt, treat.y - d.y));
      d.x += (treat.x - d.x) * Math.min(1, dt * 4);
      if (Math.abs(treat.y - d.y) < 0.4) { d.state = 'eat'; d.eatT = 0; treat.eaten = true; emit(g, 'dogeats', {}); }
    } else if (d.state === 'eat') {
      d.eatT += dt;
      if (d.eatT > 3) d.state = 'leave';
    } else {
      d.x += Math.sign(d.x - g.world.center(d.y) || 1) * 3 * dt;
    }
  }
  g.dogs = g.dogs.filter((d) => d.y > c.y - 40 && Math.abs(d.x - g.world.center(d.y)) < 14);
}

// ---------- the traffic warden ----------
function stepCops(g, dt) {
  const c = g.cart;
  for (const p of g.cops) {
    p.t += dt;
    p.run += dt;
    if (p.state !== 'chase') continue;
    if (chase(g, p, COP_SPEED, dt)) { p.state = 'leave'; p.caught = true; caught(g, 'caught'); } else if (p.t > COP_TIME) { p.state = 'leave'; emit(g, 'copgaveup', {}); }
  }
  g.cops = g.cops.filter((p) => p.y > c.y - 45);
}

/** Pops this step's events (for sound and effects). */
export function drainEvents(g) {
  const out = g.events;
  g.events = [];
  return out;
}

/** The ride's outcome, for the end screen and the records. */
export function result(g) {
  const [have, need] = g.won || !g.endCount ? listCount(g) : g.endCount;
  const extra = g.won ? g.extrasAtCheckout : extras(g);
  const time = g.won ? g.finishTime : g.t;
  return {
    won: g.won,
    reason: g.reason,
    time,
    extras: extra,
    penalty: extra * EXTRA_PENALTY,
    /** The score: time plus the penalty for extras (lower is better; only for a finished list). */
    total: time + extra * EXTRA_PENALTY,
    distance: Math.floor(g.distance),
    have,
    need,
    picked: g.picked,
    lost: g.lost.filter((it) => it.why !== 'gameover' && it.why !== 'flew').length,
    broken: g.lost.filter((it) => it.why === 'broke').length,
    crashes: g.crashes,
  };
}
