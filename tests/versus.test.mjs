import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, standings, scores, VS_THINGS, VS_TIME } from '../src/versus.js';
import { drainEvents } from '../src/game.js';
import { TRACK_ORDER } from '../src/tracks.js';

const DT = 1 / 120;
const run = (m, seconds, input = { steer: 0 }) => {
  const ev = [];
  for (let i = 0; i < seconds / DT && !m.over; i++) { stepMatch(m, DT, typeof input === 'function' ? input(m) : input); ev.push(...drainEvents(m.games[0])); for (const g of m.games.slice(1)) drainEvents(g); }
  return ev;
};
const total = (m) => scores(m).reduce((a, b) => a + b, 0) + m.world.entities.filter((e) => e.vs && !e.taken).length;

test('a match: 2 or 3 carts on one road, 7 things on it, no shopping, no coins', () => {
  const m = createMatch(4, { track: 'borgo', rivals: 2 });
  assert.equal(m.games.length, 3);
  assert.ok(m.games.every((g) => g.world === m.world && g.versus && g.list.length === 0));
  assert.equal(total(m), VS_THINGS);
  m.world.ensure(800);
  assert.ok(!m.world.entities.some((e) => e.kind === 'coin' || e.kind === 'heart' || (e.kind === 'item' && !e.vs && e.type !== 'balloon')));
  assert.equal(createMatch(5, { rivals: 1 }).games.length, 2);
});

test('on every track the 7 things stay 7 (in carts or on the road) and nobody loses a life', () => {
  for (const track of TRACK_ORDER) {
    const m = createMatch(9, { track, rivals: 2 });
    run(m, 60);
    assert.equal(total(m), VS_THINGS, track);
    assert.ok(m.games.every((g) => !g.over || m.over), `${track}: nobody is out`);
    assert.ok(m.games.every((g) => g.lives === 99), track);
  }
});

test('bumping into a rival: both lose the top thing, and it stays on the road', () => {
  const m = createMatch(6, { track: 'borgo', rivals: 1 });
  const [a, b] = m.games;
  m.world.entities = m.world.entities.filter((e) => !e.vs);
  for (const [g, goods] of [[a, 'bread'], [b, 'cheese']]) g.stack.push({ type: 'goods', goods, h: 0.34, id: g === a ? 1 : 2 });
  b.cart.x = a.cart.x + 0.5; b.cart.y = a.cart.y;
  const ev = run(m, 0.05);
  assert.ok(ev.some((e) => e.type === 'vsbump'));
  assert.equal(a.stack.length, 0);
  assert.equal(b.stack.length, 0);
  assert.equal(m.world.entities.filter((e) => e.vs && !e.taken).length, 2);
});

test('a crash or a fall knocks a thing off, it does not cost a life', () => {
  const m = createMatch(7, { track: 'mare', rivals: 1 });
  const g = m.games[0];
  g.stack.push({ type: 'goods', goods: 'fish', h: 0.26, id: 1 });
  run(m, 8, { steer: 1 }); // off the pier
  assert.ok(g.stack.length === 0 || g.lost.length > 0);
  assert.equal(g.lives, 99);
});

test('all 7 wins at once; otherwise after 3 minutes the most things wins', () => {
  const m = createMatch(8, { track: 'borgo', rivals: 1 });
  const things = m.world.entities.filter((e) => e.vs);
  for (const e of things) { e.taken = true; m.games[1].stack.push({ type: 'goods', goods: e.goods, h: 0.3, id: e.id }); }
  run(m, 0.1);
  assert.ok(m.over);
  assert.equal(m.winner, 1);
  const n = createMatch(10, { track: 'borgo', rivals: 2 });
  run(n, VS_TIME + 1);
  assert.ok(n.over);
  assert.ok(n.t >= VS_TIME - DT);
  assert.equal(n.winner, standings(n)[0]);
});

test('things left behind every cart come back further down the road', () => {
  const m = createMatch(11, { track: 'borgo', rivals: 1 });
  const e = m.world.entities.find((q) => q.vs);
  for (const g of m.games) g.cart.y = e.y + 30;
  run(m, 0.1);
  assert.ok(e.y > m.games[0].cart.y + 40, `${e.y}`);
});
