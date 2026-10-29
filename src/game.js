// The ride itself, without any drawing: the cart, its load, the shopping list
// and how the load changes the steering. A ride is a race: get everything on
// the list into the cart, then reach the checkout. Three crashes (or the
// train) and you are out; the cart (src/carts.js) can give more lives, and the
// track (src/tracks.js) sets the pace. Coins on the road are counted in
// g.coins. step() is deterministic for a seed and a sequence of inputs, so
// tests can drive whole rides.
import { createWorld, rng, OBSTACLES, SECTION, STEP_LENGTH, GOODS, LIGHT_STOP, LAUNCH } from './world.js';
import { TRACKS } from './tracks.js';
import { catalogOf, GOODS_H } from './catalog.js';
import { CARTS } from './carts.js';

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
export { GOODS_H };
export const itemHeight = (it) => (it.type === 'goods' ? GOODS_H[it.goods] ?? 0.4 : ITEMS[it.type].h);
/** What a thing is called on the shopping list. */
export const itemKey = (it) => (it.type === 'goods' ? it.goods : it.type);

export const RIM = 0.62; // the basket holds anything below this height
export const MAX_PILE = 5.2; // higher than this, the top just slides off: there is no room
export const CART_R = 0.45;
export const LIVES = 3; // with the classic cart
const FALL_TIME = 0.9; // off the edge or into a gap: how long the fall lasts before you are put back
const ICE_TIME = 2.6;
const GLIDE_TIME = 1.5; // a balloon spent in the air: a long, slow glide
const BOOST_TIME = 1.4; // turbo arrows
const BOOST_SPEED = 7;
const HEART_COINS = 25; // a heart with every life still there
// Rope bridges give way behind the cart: the planks fall a few metres back and
// the collapse follows at nearly the cart's usual speed. Slow down and you go with them.
const BRIDGE_HEAD = 6; // metres between the cart and the collapse when it starts
const BRIDGE_PACE = 0.86; // of the usual speed on the bridge
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
// Crossings: a warning (bells, a horn), then something goes by: the train, the
// snowplow, a big wave. length and speed decide how long it takes; reach is how far along
// the road it sweeps (half its width).
export const RAIL_WARN = 2.4;
export const VEHICLES = {
  train: { length: 58, speed: 24, reach: 1.7 },
  plow: { length: 7, speed: 10, reach: 1.7 },
  bigwave: { length: 6, speed: 12, reach: 3.2 },
};
const vehicleOf = (e) => VEHICLES[e.vehicle] || VEHICLES.train;
/** How long the thing takes to cross the road. */
export const crossTime = (g, e) => (2 * (g.world.halfWidth(e.y) + 6) + 4 + vehicleOf(e).length) / vehicleOf(e).speed;
// Animals that chase: how fast, and whether they bite (a life) or steal (the top of the pile).
export const SPECIES = {
  dog: { speed: 10.5, time: 12 },
  goat: { speed: 11, time: 10 },
  crab: { speed: 9.5, time: 9 },
  gull: { speed: 13, time: 8, thief: true },
  monkey: { speed: 12, time: 9, thief: true },
};
// The traffic warden: runs after you for 10 s when you run a red light.
export const COP_SPEED = 11;
export const COP_TIME = 10;
// Things that roll down after you: a snowball now and then, the boulder all the way.
export const ROLLERS = {
  snowball: { start: 10, slack: 1.04, time: 8, r: 1.0 }, // a little faster than you: keep the speed up
  boulder: { start: 26, slack: 0.97, time: Infinity, r: 1.6, max: 30 }, // a little slower: it gets you when you stop
};
// Chasers run beside the cart, just behind it, where the camera sees them.
// They keep up with a cart that rolls on and catch one that slows down.
export const CHASE_GAP = 2.4; // metres behind the cart at most
const CATCH_GAP = 0.5;
/** A fast cart shakes off whatever chases it sooner, a slow one later. */
const chaseTime = (g, base) => base * Math.max(0.6, Math.min(1.4, 1 - 0.25 * g.K.speed));


/** A shopping list from this track's shops: 4 different things, 2–3 of each (1–2 of the heavy one), about 9 in all. */
export function makeList(seed, n = 4, track = 'borgo') {
  const r = rng(seed ^ 0x51ed27);
  const pool = ['melon', 'oil', 'eggs', ...catalogOf(track).goods];
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

/**
 * opts: list (else a random one), track (a TRACKS id), cart (a CARTS id), versus
 * (a race against rivals for 7 things, src/versus.js: no lives lost, no checkout,
 * whatever falls off the cart stays on the road for anyone to grab).
 */
export function createGame(seed, opts = {}) {
  const track = TRACKS[opts.track] ? opts.track : 'borgo';
  const cart = CARTS[opts.cart] ? opts.cart : 'classic';
  const T = TRACKS[track];
  const K = CARTS[cart];
  const list = opts.versus ? [] : opts.list || makeList(seed, T.listSize, track);
  return {
    seed,
    versus: Boolean(opts.versus),
    list,
    track,
    T,
    cartType: cart,
    K,
    coins: 0, // picked up on this ride (plus the bonus at the checkout)
    bonus: 0,
    world: opts.world || createWorld(seed, { wanted: list.map((l) => l.key), track, versus: Boolean(opts.versus) }),
    t: 0,
    over: false,
    won: false,
    reason: null, // 'crashes' | 'train' | 'fell' when out
    overT: 0,
    finishTime: 0,
    distance: 0,
    lives: opts.versus ? 99 : K.lives,
    maxLives: opts.versus ? 0 : K.lives,
    crashes: 0,
    checkoutY: null,
    next: 0, // first entity not yet behind the cart
    rand: rng(seed ^ 0x9e3779b9),
    cart: { x: 0, y: 0, v: 0, vx: 0, z: 0, vz: 0, fall: 0, glide: 0, boost: 0, oil: 0, spin: 0, curbCd: 0, safe: 0, step: 0, flip: 0, braking: false, jumped: false },
    stack: [], // bottom first: { type, goods?, h, id }
    balloons: [], // { color }
    tilt: 0,
    tiltV: 0,
    wobble: 0, // 0..1+, how close the pile is to tipping
    tallMark: 0,
    picked: 0,
    dropped: 0,
    lost: [], // items that fell off, broke, popped or were knocked out
    dogs: [], // { species, x, y, gap, side, t, look, run, state: 'chase' | 'fetch' | 'eat' | 'leave', bit }
    rollers: T.roller === 'boulder' ? [{ type: 'boulder', gap: ROLLERS.boulder.start, t: 0, spin: 0, state: 'roll' }] : [], // { type, gap, t, spin, state: 'roll' | 'gone' }
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
    maxLat: (7.4 * g.K.steer) / (1 + 0.16 * melons),
    grip: (g.cart.oil > 0 ? 1.1 : 10 / (1 + 0.5 * melons)) * g.K.grip,
    gravity: GRAVITY * Math.max(0.4, 1 - 0.09 * balloons) * (g.cart.glide > 0 ? 0.2 : 1),
  };
}

/** Rolling speed: faster on steep bits, with a heavy cart, and the further you get. */
export function targetSpeed(g, kind) {
  return 8 + 4.2 * SECTION[kind].pace + Math.min(8, g.distance / 150) + 0.35 * Math.min(mass(g) - 1, 6) + g.T.speed + g.K.speed;
}

function emit(g, type, data = {}) {
  g.events.push({ type, t: g.t, ...data });
}

function loseTop(g, why, side = 0) {
  const it = g.stack.pop();
  if (!it) return null;
  g.lost.push({ ...it, why });
  const sd = side || (g.rand() < 0.5 ? -1 : 1);
  emit(g, 'fall', { item: it, why, side: sd, height: stackHeight(g), wanted: wanted(g, itemKey(it)) });
  if (g.versus) spill(g, it, sd);
  return it;
}

/** The top thing falls off (why: 'bump', 'crash'…); in versus it lands on the road. */
export const knockOff = (g, why, side = 0) => loseTop(g, why, side);

/** Versus: what falls off lands on the road a little behind and to the side, for anyone to grab. */
function spill(g, it, side) {
  const c = g.cart;
  const w = g.world;
  const y = c.y - 2.2 - g.rand() * 1.5;
  const lim = w.halfWidth(y) - 0.6;
  const x = Math.max(w.center(y) - lim, Math.min(w.center(y) + lim, c.x + side * (0.8 + g.rand() * 1.2)));
  const e = { id: w.nextId++, kind: 'item', type: it.type, x, y, vs: true };
  if (it.goods) e.goods = it.goods;
  insertEntity(g, e);
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
  const isWanted = g.versus || wanted(g, key);
  g.stack.push(it);
  // Something landing in the basket rocks it a little.
  g.tiltV += (g.rand() - 0.5) * (0.6 + it.h);
  if (e.type === 'oil') g.cart.oil = Math.max(g.cart.oil, OIL_TIME);
  emit(g, 'pickup', { item: e.type, goods: it.goods || null, key, x: e.x, y: e.y, wanted: isWanted });
  if (stackHeight(g) > MAX_PILE + g.K.pile) loseTop(g, 'full');
}

/** Loses a life (crash or dog bite). Returns true when that was the last one. */
function loseLife(g, why) {
  if (g.versus) { loseTop(g, 'crash'); g.cart.safe = SAFE_TIME; return false; } // no lives in versus: a thing falls off instead
  g.lives--;
  g.crashes++;
  g.cart.safe = SAFE_TIME;
  if (g.lives <= 0) { gameOver(g, why === 'fall' ? 'fell' : 'crashes', why); return true; }
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
  if (g.versus) { jolt(g, 0.75 + o.height * 0.2, 'crash'); return; }
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
  g.bonus = g.T.bonus;
  g.coins += g.bonus;
  emit(g, 'checkout', { time: g.t, extras: g.extrasAtCheckout, bonus: g.bonus });
}

/** Drops the thing on top of the pile behind the cart (to make room, or for a dog). */
function drop(g) {
  if (g.versus) { if (g.stack.length) { g.dropped++; loseTop(g, 'dropped'); } return; }
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
    if (c.fall > 0) { c.vz -= GRAVITY * dt; c.z += c.vz * dt; } else if (c.z > 0) { c.vz -= GRAVITY * dt; c.z = Math.max(0, c.z + c.vz * dt); }
    stepDogs(g, dt);
    stepCops(g, dt);
    stepRollers(g, dt);
    return;
  }
  w.ensure(c.y + 160);
  if (c.fall > 0) {
    // Off the edge (or into a gap): down you go, then back on the road (a life less).
    c.fall += dt;
    c.vz -= GRAVITY * dt;
    c.z += c.vz * dt;
    c.x += c.vx * dt;
    c.y += c.v * 0.5 * dt;
    g.distance = c.y;
    if (c.fall > FALL_TIME) {
      if (loseLife(g, 'fall')) return;
      if (!g.versus) loseTop(g, 'fell');
      c.fall = 0; c.z = 0; c.vz = 0; c.vx = 0; c.oil = 0; c.glide = 0;
      // back on solid road: past the gap (or the broken bridge), in the middle
      for (const gp of w.gapsIn(c.y - 1, c.y + 1)) c.y = gp.y + gp.len + 1;
      const under = w.sectionAt(c.y);
      if (under.kind === 'bridge' && under.fallY !== undefined) c.y = under.end + 1;
      c.x = w.center(c.y);
      c.v = Math.min(c.v, 6);
      c.safe = SAFE_TIME;
      emit(g, 'respawn', { lives: g.lives });
    }
    stepDogs(g, dt);
    stepCops(g, dt);
    stepRollers(g, dt);
    return;
  }
  const hd = handling(g);
  const sec = w.sectionAt(c.y);

  // Downhill, unless braking (turbo arrows give a burst).
  c.boost = Math.max(0, c.boost - dt);
  const target = targetSpeed(g, sec.kind) + (c.boost > 0 ? BOOST_SPEED : 0);
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
  } else if (inp.jump && airborne && g.balloons.length && c.glide <= 0) {
    // A balloon spent: glide a long way (over gaps, water, lava).
    const b = g.balloons.pop();
    c.glide = GLIDE_TIME;
    c.vz = Math.max(c.vz, 2.5);
    emit(g, 'glide', { color: b.color });
  }
  if (c.glide > 0) c.glide = c.z > 0 ? c.glide - dt : 0;
  if (c.z > 0 || c.vz > 0) {
    c.vz -= hd.gravity * dt;
    c.z += c.vz * dt;
    if (c.z <= 0) {
      const impact = -c.vz;
      c.z = 0; c.vz = 0;
      emit(g, 'land', { impact });
      if (impact > 3) jolt(g, Math.min(1.1, (impact - 3) * 0.12 + 0.2), 'land');
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
  // No road under the wheels (off a pier, a rope bridge, the rainbow, or into a gap): the cart falls.
  const inGap = c.z <= 0.02 && w.gapsIn(c.y, c.y + 0.01).length > 0;
  if (inGap || (w.isVoid(c.y) && Math.abs(c.x - cx) > w.halfWidth(c.y) + 0.1 && c.z <= 0.02)) {
    c.fall = 0.001;
    c.vz = 0;
    const kind = sec.kind;
    g.fellInto = inGap ? (w.gapsIn(c.y, c.y + 0.01)[0].lava ? 'lava' : 'water') : g.T.void ? 'space' : kind === 'bridge' ? 'chasm' : 'water';
    emit(g, 'falling', { into: g.fellInto });
    return;
  }
  if (SECTION[sec.kind].sway) c.x += Math.sin(g.t * 1.7 + sec.start) * 0.9 * dt; // the rope bridge swings
  // Rope bridges collapse behind the cart.
  if (sec.kind === 'bridge' && sec.fallY === undefined) { sec.fallY = c.y - BRIDGE_HEAD; emit(g, 'bridge', {}); }
  for (const bs of w.sections) {
    if (bs.kind === 'bridge' && bs.fallY !== undefined && bs.fallY < bs.end) bs.fallY = Math.min(bs.end, bs.fallY + targetSpeed(g, 'bridge') * BRIDGE_PACE * dt);
  }
  if (sec.kind === 'bridge' && c.z <= 0.02 && c.y - sec.fallY < 0.3) {
    c.fall = 0.001;
    c.vz = 0;
    g.fellInto = 'chasm';
    emit(g, 'falling', { into: 'chasm' });
    return;
  }
  if (SECTION[sec.kind].ice) c.oil = Math.max(c.oil, 0.3); // a frozen lake
  if (!w.isVoid(c.y) && Math.abs(c.x - cx) > lim) {
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
      const species = SPECIES[e.species] ? e.species : 'dog';
      g.dogs.push({ species, x: e.x, y: e.y, gap: CHASE_GAP, side, t: 0, look: e.look, run: 0, state: 'chase', time: chaseTime(g, SPECIES[species].time) });
      emit(g, 'dog', { species });
    } else if (e.kind === 'roller' && !e.started && c.y > e.y) {
      e.started = true;
      if (!g.rollers.some((q) => q.state === 'roll')) {
        g.rollers.push({ type: e.type, gap: ROLLERS[e.type].start, t: 0, spin: 0, state: 'roll', time: chaseTime(g, ROLLERS[e.type].time) });
        emit(g, 'roller', { roller: e.type });
      }
    } else if (e.kind === 'wave') {
      // it sets off so as to reach the middle of the pier just as the cart gets there
      if (!e.going && e.y > c.y && (e.y - c.y) / Math.max(c.v, 3) < (w.halfWidth(e.y) + 2) / 7) { e.going = true; e.t0 = g.t; emit(g, 'wave', {}); }
      if (e.going && !e.done) {
        // It rolls across from one side to the other at 7 m/s and shoves what it meets.
        const hw = w.halfWidth(e.y) + 2;
        e.x = w.center(e.y) - e.side * hw + e.side * 7 * (g.t - e.t0);
        if (Math.abs(e.x - w.center(e.y)) > hw + 0.5 && g.t - e.t0 > 0.5) e.done = true;
        if (!e.hit && Math.abs(c.y - e.y) < 1.1 && Math.abs(c.x - e.x) < 0.9 && c.z < 0.5) {
          e.hit = true;
          c.vx = e.side * 7.5;
          jolt(g, 0.5, 'wave');
          emit(g, 'splash', { x: c.x, y: c.y });
        }
      }
    } else if (e.type === 'block' && e.move) {
      e.x = e.x0 + Math.sin(g.t * e.freq + e.phase) * e.move;
    }
  }
  stepDogs(g, dt);
  stepCops(g, dt);
  stepRollers(g, dt);
  if (g.over) return;

  // What the cart touches.
  for (let i = g.next; i < ents.length && ents[i].y < c.y + 1.5; i++) {
    const e = ents[i];
    if (e.taken || e.knocked || e.gone) continue;
    const dx = e.x - c.x, dyy = e.y - c.y;
    if (e.kind === 'coin') {
      if (dx * dx + dyy * dyy < 0.75 * 0.75 && Math.abs(c.z - e.h) < 0.95) {
        e.taken = true;
        g.coins++;
        emit(g, 'coin', { x: e.x, y: e.y, h: e.h });
      }
      continue;
    }
    if (e.kind === 'heart') {
      if (dx * dx + dyy * dyy < 0.8 * 0.8 && c.z < 1.2) {
        e.taken = true;
        if (g.lives < g.maxLives) { g.lives++; emit(g, 'heart', { x: e.x, y: e.y, lives: g.lives }); } else { g.coins += HEART_COINS; emit(g, 'heart', { x: e.x, y: e.y, coins: HEART_COINS }); }
      }
      continue;
    }
    if (e.kind !== 'item' && e.kind !== 'obstacle') continue;
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
    if (e.type === 'geyser' && !geyserUp(g, e)) continue; // it only throws you up when it blows
    if (e.used) continue;
    e.used = true;
    if (LAUNCH[e.type]) { c.vz = LAUNCH[e.type]; c.z = 0.03; emit(g, e.type === 'ramp' ? 'ramp' : e.type, {}); continue; }
    if (e.type === 'boost') { c.boost = BOOST_TIME; c.v += 4; emit(g, 'boost', {}); continue; }
    if (e.type === 'pothole') jolt(g, 0.75, 'pothole');
    else if (e.type === 'puddle') { c.oil = Math.max(c.oil, PUDDLE_TIME); emit(g, 'slip', {}); }
    else if (e.type === 'ice') { c.oil = Math.max(c.oil, ICE_TIME); emit(g, 'slip', { ice: true }); }

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
    const crit = (0.8 * g.K.steady) / (1 + 0.12 * over) / (1 + 0.02 * over * over);
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

  // The checkout appears once everything on the list is in the cart (not in versus).
  if (g.versus) return;
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
  const V = vehicleOf(e);
  if (t < 0 || t > crossTime(g, e) + 1) return null;
  const hw = g.world.halfWidth(e.y) + 6;
  const start = e.x - e.dir * (hw + 4);
  const front = start + e.dir * V.speed * t;
  const back = front - e.dir * V.length;
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
      emit(g, 'bells', { y: e.y, vehicle: e.vehicle || 'train' });
    }
  }
  if (e.state === 'warn') {
    const t = g.t - e.t0;
    if (!e.trainSaid && t > RAIL_WARN - 0.4) { e.trainSaid = true; emit(g, 'train', { y: e.y }); }
    if (t > RAIL_WARN + crossTime(g, e) + 1.2) e.state = 'done';
    const span = trainSpan(g, e);
    if (span && Math.abs(c.y - e.y) < vehicleOf(e).reach && c.x > span.min - 0.6 && c.x < span.max + 0.6 && c.z < 2) {
      c.v = 0;
      g.hitBy = e.vehicle || 'train';
      if (g.versus) {
        // knocked flat: two things fly off, and a moment to get going again
        if (c.safe <= 0) { loseTop(g, 'crash'); loseTop(g, 'crash'); emit(g, 'crash', { obstacle: g.hitBy, x: c.x, y: c.y, lives: g.lives }); }
        c.safe = Math.max(c.safe, 2);
        return;
      }
      gameOver(g, 'train', g.hitBy);
    }
  }
}
export const railBarrierDown = (g, e) => e.state === 'warn' && g.t - e.t0 < RAIL_WARN + crossTime(g, e) + 0.6;
/** Is the geyser blowing right now? (1.3 s in every 3.2) */
export const geyserUp = (g, e) => ((g.t + e.phase) % 3.2) < 1.3;

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
      const S = SPECIES[d.species] || SPECIES.dog;
      if (chase(g, d, S.speed, dt)) {
        d.state = 'leave';
        if (S.thief) {
          // A gull or a monkey snatches the top of the pile and is off with it.
          const it = g.stack.length ? loseTop(g, 'stolen', d.side) : null;
          d.stole = it;
          emit(g, 'stolen', { species: d.species, item: it });
        } else { d.bit = true; caught(g, 'bite'); }
      } else if (d.t > (d.time ?? S.time)) d.state = 'leave';
    } else if (d.state === 'fetch') {
      const treat = d.target;
      const sp = (SPECIES[d.species] || SPECIES.dog).speed;
      d.y += Math.max(-sp * dt, Math.min(sp * dt, treat.y - d.y));
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
    if (chase(g, p, COP_SPEED, dt)) { p.state = 'leave'; p.caught = true; caught(g, 'caught'); } else if (p.t > chaseTime(g, COP_TIME)) { p.state = 'leave'; emit(g, 'copgaveup', {}); }
  }
  g.cops = g.cops.filter((p) => p.y > c.y - 45);
}

// ---------- snowballs and the boulder ----------
/**
 * They roll down behind the cart at about its usual speed (a snowball a little
 * faster, the boulder a little slower): brake, crash or fall and they catch up.
 * Caught: a crash (a life). The boulder then drops back and keeps coming.
 */
function stepRollers(g, dt) {
  const c = g.cart;
  for (const q of g.rollers) {
    if (q.state !== 'roll') continue;
    const R = ROLLERS[q.type];
    q.t += dt;
    const cruise = targetSpeed(g, g.world.sectionAt(c.y).kind);
    // (the boulder starts with the race, from a standstill; a snowball comes down already rolling)
    const v = q.type === 'boulder' ? Math.min(cruise * R.slack, 4 + 4 * q.t) : cruise * R.slack;
    q.gap = Math.min(R.max ?? 99, q.gap + (c.v - v) * dt);
    q.spin += v * dt / R.r;
    if (g.over) continue;
    if (q.gap < R.r * 0.6 && c.fall <= 0) {
      emit(g, 'squashed', { roller: q.type, lives: g.lives - 1 });
      if (c.safe <= 0) loseLife(g, q.type);
      c.safe = Math.max(c.safe, SAFE_TIME);
      if (g.over) continue;
      jolt(g, 0.9, 'crash');
      if (q.type === 'boulder') q.gap = 18; else q.state = 'gone';
    } else if (q.t > (q.time ?? R.time)) {
      q.state = 'gone';
      emit(g, 'rollergone', { roller: q.type });
    }
  }
  g.rollers = g.rollers.filter((q) => q.state === 'roll');
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
