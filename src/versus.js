// Arcade: a race on one track against 2 rivals (driven by the computer, at three
// levels) for 7 things placed on the road. Nobody loses lives and there is no
// checkout: crashes, falls and chasers make things fall off the carts, and
// whatever falls stays on the road for anyone to grab. Get all 7 and you win at
// once; after 3 minutes, the most things wins. Coins on the road are yours to keep.
import { createGame, step, targetSpeed, BRIDGE_HEAD, BRIDGE_PACE } from './game.js';
import { createWorld, rng } from './world.js';
import { catalogOf } from './catalog.js';
import { botSteer } from './bot.js';

export const VS_THINGS = 7;
export const VS_TIME = 180;
const BUMP_COOLDOWN = 1.2;
/** How the rivals drive: steadiness at the wheel, a little speed, how far they look and how keen they are to bump you. */
export const LEVELS = {
  beginner: { skill: 0.65, speed: -1.2, reach: 9, bump: 0 },
  normal: { skill: 0.88, speed: 0, reach: 13, bump: 0.5 },
  expert: { skill: 1, speed: 0.9, reach: 18, bump: 1 },
};
const NAMES = ['Luca', 'Sara', 'Leo', 'Mia', 'Tom', 'Zoe', 'Max', 'Ana', 'Kai', 'Eva', 'Nico', 'Lina'];
export const RIVAL_COLORS = ['#3a86ff', '#8338ec', '#06d6a0', '#ff006e'];

/** A new match: the player's game first, then the rivals'. All share one road. */
export function createMatch(seed, { track = 'borgo', cart = 'classic', rivals = 2, level = 'normal' } = {}) {
  const L = LEVELS[level] || LEVELS.normal;
  const r = rng(seed ^ 0x7e57);
  const world = createWorld(seed, { track, versus: true });
  world.prune = () => 0; // the road behind the last cart is still needed
  const games = [];
  for (let i = 0; i <= rivals; i++) {
    const g = createGame(seed + i, { track, cart, versus: true, world });
    if (i > 0) g.K = { ...g.K, speed: g.K.speed + L.speed }; // the rivals' pace, by level
    g.cart.x = world.center(0) + (i === 0 ? 0 : i === 1 ? -1.4 : 1.4);
    g.cart.y = i === 0 ? 0 : -0.8;
    games.push(g);
  }
  const names = [];
  const pool = [...NAMES];
  for (let i = 0; i < rivals; i++) names.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  const m = {
    seed, track, world, games, names, colors: RIVAL_COLORS.slice(0, rivals),
    level, L, skill: names.map(() => L.skill - r() * 0.06), t: 0, over: false, winner: null, bumpCd: new Map(), rand: r,
  };
  // The 7 things: 7 of the track's groceries, ahead on the road.
  const shop = [...catalogOf(track).goods];
  for (let i = 0; i < VS_THINGS; i++) {
    const goods = shop.splice(Math.floor(r() * shop.length), 1)[0];
    place(m, { id: world.nextId++, kind: 'item', type: 'goods', goods, vs: true }, 45 + i * 24);
  }
  return m;
}

/** Puts a thing on the road at about y (not in a gap, not on a crossing), and keeps every cart's place in the list right. */
function place(m, e, y) {
  const w = m.world;
  w.ensure(y + 40);
  for (const gp of w.gapsIn(y - 3, y + 3)) y = gp.y + gp.len + 3;
  const lim = w.halfWidth(y) - 0.8;
  e.y = y;
  e.x = w.center(y) + (m.rand() * 2 - 1) * lim;
  e.taken = false;
  const ents = w.entities;
  const at = ents.indexOf(e);
  if (at >= 0) ents.splice(at, 1);
  let i = ents.length;
  while (i > 0 && ents[i - 1].y > e.y) i--;
  ents.splice(i, 0, e);
  for (const g of m.games) {
    g.next = 0;
    while (g.next < ents.length && ents[g.next].y < g.cart.y - 3) g.next++;
  }
}

/** How many of the 7 each cart has. */
export const scores = (m) => m.games.map((g) => g.stack.length);

/** Places: indexes of the games, best first (more things, then further down the road). */
export function standings(m) {
  return m.games.map((g, i) => i).sort((a, b) => m.games[b].stack.length - m.games[a].stack.length || m.games[b].cart.y - m.games[a].cart.y);
}

/** How a rival drives: after the nearest thing, or into a cart that has some. */
export function rivalInput(m, i) {
  const g = m.games[i];
  const c = g.cart;
  let target;
  // the nearest thing to grab, as far as this level looks
  let bestD = m.L.reach;
  for (let k = g.next; k < g.world.entities.length; k++) {
    const e = g.world.entities[k];
    const d = e.y - c.y;
    if (d > m.L.reach) break;
    if (e.vs && !e.taken && d > 1 && d < bestD) { bestD = d; target = e.x; }
  }
  // or a cart ahead with things on board, to get in its way
  if (target === undefined && m.L.bump) {
    for (const o of m.games) {
      if (o === g || !o.stack.length) continue;
      const d = o.cart.y - c.y;
      if (d > 0.5 && d < 12 * m.L.bump && Math.abs(o.cart.x - c.x) < 4) target = o.cart.x;
    }
  }
  return botSteer(g, m.skill[i - 1] ?? 0.9, { target });
}

/** Advances the match by dt: every cart, then bumps, lost things and the result. input: the player's. */
export function stepMatch(m, dt, input) {
  if (m.over) { for (const g of m.games) step(g, dt, 0); m.overT += dt; return; }
  m.t += dt;
  m.games.forEach((g, i) => step(g, dt, i === 0 ? input : rivalInput(m, i)));
  bumps(m, dt);
  collapse(m, dt);
  // A thing left far behind every cart comes back further down the road.
  const minY = Math.min(...m.games.map((g) => g.cart.y));
  const maxY = Math.max(...m.games.map((g) => g.cart.y));
  for (const e of m.world.entities) {
    if (e.y > minY - 25) break;
    if (e.vs && !e.taken) place(m, e, maxY + 50 + m.rand() * 40);
  }
  const s = scores(m);
  const full = s.findIndex((n) => n >= VS_THINGS);
  if (full >= 0 || m.t >= VS_TIME) {
    m.over = true;
    m.overT = 0;
    m.winner = full >= 0 ? full : standings(m)[0];
    m.games[0].events.push({ type: 'vsover', t: m.games[0].t, winner: m.winner });
  }
}

/**
 * Rope bridges give way only behind the last cart: the ones ahead never break
 * a bridge for those still to cross it.
 */
function collapse(m, dt) {
  const last = m.games.reduce((a, g) => (g.cart.y < a.cart.y ? g : a));
  const y = last.cart.y;
  for (const bs of m.world.sections) {
    if (bs.kind !== 'bridge' || bs.start > y) continue;
    if (bs.end < y - 60) continue;
    if (bs.fallY === undefined) {
      if (y >= bs.end) continue;
      bs.fallY = y - BRIDGE_HEAD;
      for (const g of m.games) if (g.world.sectionAt(g.cart.y) === bs) g.events.push({ type: 'bridge', t: g.t });
    } else if (bs.fallY < bs.end) bs.fallY = Math.min(bs.end, bs.fallY + targetSpeed(last, 'bridge') * BRIDGE_PACE * dt);
  }
}

/** Carts that run into each other bounce apart (nothing falls off). */
function bumps(m, dt) {
  for (const [k, v] of m.bumpCd) { if (v - dt <= 0) m.bumpCd.delete(k); else m.bumpCd.set(k, v - dt); }
  const G = m.games;
  for (let a = 0; a < G.length; a++) {
    for (let b = a + 1; b < G.length; b++) {
      const ca = G[a].cart, cb = G[b].cart;
      if (Math.abs(ca.x - cb.x) > 0.95 || Math.abs(ca.y - cb.y) > 1.3 || ca.z > 0.6 || cb.z > 0.6 || ca.fall > 0 || cb.fall > 0) continue;
      const key = `${a}-${b}`;
      if (m.bumpCd.has(key)) continue;
      m.bumpCd.set(key, BUMP_COOLDOWN);
      const side = Math.sign(ca.x - cb.x) || 1;
      ca.vx = side * 4.5; cb.vx = -side * 4.5;
      for (const g of [G[a], G[b]]) g.events.push({ type: 'vsbump', t: g.t, other: g === G[a] ? b : a });
    }
  }
}
