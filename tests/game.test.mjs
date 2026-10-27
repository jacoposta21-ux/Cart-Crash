import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, drainEvents, handling, multiplier, cartValue, jolt, result, LIVES, RIM, MAX_PILE, stackHeight } from '../src/game.js';
import { botSteer } from '../src/bot.js';

const DT = 1 / 120;
// A game on an empty road (nothing to hit, nothing to grab) for controlled checks.
function emptyGame(seed = 1) {
  const g = createGame(seed);
  g.world.ensure(400);
  g.world.entities.length = 0;
  g.world.ensure = () => {};
  return g;
}
const add = (g, it) => { g.stack.push({ h: it.type === 'melon' ? 0.72 : it.type === 'eggs' ? 0.3 : 0.5, ...it }); };
function run(g, seconds, steer = 0) {
  const events = [];
  for (let i = 0; i < seconds / DT && !g.over; i++) { step(g, DT, typeof steer === 'function' ? steer(g) : steer); events.push(...drainEvents(g)); }
  return events;
}

test('a ride is deterministic for a seed and the same inputs', () => {
  const a = createGame(1234), b = createGame(1234);
  run(a, 30, botSteer); run(b, 30, botSteer);
  assert.equal(a.score, b.score);
  assert.equal(a.cart.x, b.cart.x);
});

test('the cart rolls downhill and speeds up the further it gets', () => {
  const g = emptyGame();
  run(g, 5);
  const early = g.cart.v;
  assert.ok(g.distance > 30);
  g.distance = g.cart.y = 1500;
  run(g, 4);
  assert.ok(g.cart.v > early + 3);
});

test('score: one point per metre with an empty cart, more with a full one', () => {
  const g = emptyGame();
  assert.equal(multiplier(g), 1);
  run(g, 3);
  assert.ok(Math.abs(g.score - g.distance) < 1e-6);
  add(g, { type: 'melon' }); add(g, { type: 'melon' }); add(g, { type: 'eggs' }); add(g, { type: 'goods', goods: 'can' });
  assert.equal(cartValue(g), 100);
  assert.equal(multiplier(g), 2);
  const s0 = g.score, d0 = g.distance;
  run(g, 1);
  assert.ok(Math.abs((g.score - s0) - 2 * (g.distance - d0)) < 1e-6);
});

test('watermelons make the steering slower', () => {
  const plain = emptyGame(), heavy = emptyGame();
  add(heavy, { type: 'melon' }); add(heavy, { type: 'melon' });
  assert.ok(handling(heavy).grip < handling(plain).grip / 1.5);
  run(plain, 0.25, 1); run(heavy, 0.25, 1);
  assert.ok(heavy.cart.x < plain.cart.x * 0.8, `${heavy.cart.x} vs ${plain.cart.x}`);
});

test('balloons make the cart hop, and a hop clears a pothole', () => {
  const g = emptyGame();
  g.balloons.push({ color: 0 }, { color: 1 });
  const ev = run(g, 4);
  assert.ok(ev.filter((e) => e.type === 'hop').length >= 1);
  assert.ok(handling(g).hopPower > 0);
  // in the air over a pothole: no bump
  const h = emptyGame();
  h.cart.z = 1; h.cart.vz = 2;
  h.world.entities.push({ id: 1, kind: 'obstacle', type: 'pothole', x: 0, y: h.cart.y + 0.3 });
  const ev2 = run(h, 0.1);
  assert.equal(ev2.filter((e) => e.cause === 'pothole').length, 0);
});

test('olive oil makes the cart slide for a few seconds', () => {
  const g = emptyGame();
  g.world.entities.push({ id: 1, kind: 'item', type: 'oil', variant: 0, x: 0, y: g.cart.y + 0.3 });
  run(g, 0.05);
  assert.ok(g.cart.oil > 2.5);
  assert.ok(handling(g).grip < 2);
  run(g, 4);
  assert.equal(g.cart.oil <= 0, true);
});

test('a pothole shakes things off a tall pile and breaks eggs', () => {
  let fell = 0, broke = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = emptyGame(seed);
    for (let i = 0; i < 8; i++) add(g, { type: 'goods', goods: 'cereal' });
    add(g, { type: 'eggs' });
    const before = g.stack.length;
    jolt(g, 0.9, 'pothole');
    const ev = drainEvents(g);
    fell += ev.filter((e) => e.type === 'fall').length;
    broke += ev.filter((e) => e.type === 'break').length;
    assert.ok(g.stack.length <= before);
  }
  assert.ok(fell > 5 && broke > 10, `fell ${fell}, broke ${broke}`);
});

test('a low load sits safely in the basket', () => {
  const g = emptyGame();
  add(g, { type: 'goods', goods: 'can', h: 0.4 });
  assert.ok(stackHeight(g) < RIM);
  run(g, 4, (gg) => (Math.floor(gg.t * 3) % 2 ? 1 : -1));
  assert.equal(g.stack.length, 1);
});

test('the pile never grows past its limit', () => {
  const g = emptyGame();
  for (let i = 0; i < 30; i++) add(g, { type: 'goods', goods: 'cereal', h: 0.62 });
  run(g, 1);
  assert.ok(stackHeight(g) <= MAX_PILE + 0.7);
});

test('three crashes and the ride is over', () => {
  const g = emptyGame();
  let crashes = 0;
  for (let i = 0; i < LIVES; i++) {
    g.cart.safe = 0;
    g.world.entities.push({ id: 100 + i, kind: 'obstacle', type: 'bin', x: g.cart.x, y: g.cart.y + 0.6 });
    g.world.entities.sort((a, b) => a.y - b.y);
    const ev = run(g, 0.2);
    crashes += ev.filter((e) => e.type === 'crash').length;
    if (i < LIVES - 1) assert.equal(g.over, false);
  }
  assert.equal(crashes, LIVES);
  assert.equal(g.lives, 0);
  assert.equal(g.over, true);
  assert.equal(result(g).score, Math.floor(g.score));
});

test('after a crash there is a moment of safety', () => {
  const g = emptyGame();
  g.world.entities.push({ id: 1, kind: 'obstacle', type: 'cone', x: 0, y: g.cart.y + 0.5 }, { id: 2, kind: 'obstacle', type: 'cone', x: 0, y: g.cart.y + 1.6 });
  run(g, 0.5);
  assert.equal(g.lives, LIVES - 1);
});

test('people cross the street when the cart gets close', () => {
  const g = emptyGame();
  const w = g.world;
  const y = 40;
  const e = { id: 1, kind: 'obstacle', type: 'walker', side: 1, speed: 1.6, wake: 14, look: 3, y, x: w.center(y) + w.halfWidth(y) + 1.2 };
  w.entities.push(e);
  const x0 = e.x;
  run(g, 1);
  assert.equal(e.going, undefined);
  while (g.cart.y < y - 13) step(g, DT, 0);
  run(g, 0.5);
  assert.equal(e.going, true);
  assert.ok(e.x < x0);
});

test('a dog chases the cart for a while, then gives up', () => {
  const g = emptyGame();
  g.world.entities.push({ id: 1, kind: 'dog', x: 3, y: g.cart.y + 4, look: 0 });
  const ev = run(g, 1);
  assert.ok(ev.some((e) => e.type === 'dog'));
  assert.ok(g.dog && g.dog.y < g.cart.y && g.dog.y > g.cart.y - 6, 'running just behind');
  run(g, 15);
  assert.equal(g.dog, null);
  assert.equal(g.lives, LIVES, 'the dog never costs a life');
});

test('a whole ride by the bot ends with a sensible score', () => {
  for (const seed of [5, 6, 7]) {
    const g = createGame(seed);
    run(g, 400, botSteer);
    assert.ok(g.over, 'the bot crashes out eventually');
    const r = result(g);
    assert.ok(r.distance > 200 && r.score > r.distance, JSON.stringify(r));
    assert.ok(g.world.entities.length < 600, 'old things are forgotten');
  }
});
