import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, OBSTACLES, SECTION, JUMPABLE, LIGHT_STOP } from '../src/world.js';

test('the same seed makes the same town', () => {
  const a = createWorld(42), b = createWorld(42);
  a.ensure(3000); b.ensure(3000);
  assert.deepEqual(a.sections.map((s) => [s.kind, s.start]), b.sections.map((s) => [s.kind, s.start]));
  assert.deepEqual(a.entities.map((e) => [e.kind, e.type, e.x, e.y]), b.entities.map((e) => [e.kind, e.type, e.x, e.y]));
});

test('the town goes on for ever, with every kind of section of its track', () => {
  const w = createWorld(7);
  w.ensure(20000);
  assert.ok(w.made >= 20000);
  const kinds = new Set(w.sections.map((s) => s.kind));
  for (const k of ['street', 'sidewalk', 'stairs', 'market']) assert.ok(kinds.has(k), k);
  for (const k of kinds) assert.ok(SECTION[k], k);
  for (let i = 1; i < w.sections.length; i++) {
    assert.equal(w.sections[i].start, w.sections[i - 1].end);
    assert.notEqual(w.sections[i].kind, w.sections[i - 1].kind);
    assert.equal(w.sections[i].e0, w.sections[i - 1].e1, 'no jumps in the ground');
  }
});

test('the ground only goes down, stairs come in steps', () => {
  const w = createWorld(3);
  w.ensure(4000);
  let prev = w.elevation(0);
  for (let y = 0.5; y < 4000; y += 0.5) {
    const e = w.elevation(y);
    assert.ok(e <= prev + 1e-9, `uphill at ${y}`);
    prev = e;
  }
});

test('things on the road stay on the road and are sorted', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = createWorld(seed);
    w.ensure(5000);
    for (let i = 1; i < w.entities.length; i++) assert.ok(w.entities[i].y >= w.entities[i - 1].y);
    for (const e of w.entities) {
      if (e.kind !== 'item' && !(e.kind === 'obstacle' && e.type !== 'walker')) continue;
      assert.ok(Math.abs(e.x - w.center(e.y)) + (e.w || 0) <= w.halfWidth(e.y) - 0.5 + 1e-9, `${e.type} off the road at ${e.y}`);
    }
  }
});

test('there is always a way through: no row of solid obstacles closes the road', () => {
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const w = createWorld(seed);
    w.ensure(6000);
    // (low obstacles can be jumped, so only the tall ones must leave a way round)
    const solid = w.entities.filter((e) => e.kind === 'obstacle' && OBSTACLES[e.type].solid && e.type !== 'walker' && !JUMPABLE.has(e.type));
    for (const e of solid) {
      const half = (o) => OBSTACLES[o.type].w || OBSTACLES[o.type].r;
      const row = solid.filter((o) => Math.abs(o.y - e.y) < 1.2).map((o) => [o.x - half(o), o.x + half(o)]).sort((a, b) => a[0] - b[0]);
      const left = w.center(e.y) - w.halfWidth(e.y), right = w.center(e.y) + w.halfWidth(e.y);
      let widest = row[0][0] - left;
      for (let i = 1; i < row.length; i++) widest = Math.max(widest, row[i][0] - row[i - 1][1]);
      widest = Math.max(widest, right - row[row.length - 1][1]);
      assert.ok(widest >= 1.4, `blocked at ${e.y.toFixed(1)} (seed ${seed})`);
    }
  }
});

test('it gets busier further down', () => {
  const w = createWorld(99);
  w.ensure(6000);
  const solid = (a, b) => w.entities.filter((e) => e.y >= a && e.y < b && e.kind === 'obstacle' && OBSTACLES[e.type].solid).length;
  assert.ok(solid(3500, 6000) > solid(0, 2500));
});

test('traffic lights and level crossings come along, on clear road', () => {
  const w = createWorld(21, { wanted: ['bread', 'melon'] });
  w.ensure(5000);
  const lights = w.entities.filter((e) => e.kind === 'light');
  const rails = w.entities.filter((e) => e.kind === 'rail');
  assert.ok(lights.length >= 10, `lights ${lights.length}`);
  assert.ok(rails.length >= 3, `rails ${rails.length}`);
  for (const x of [...lights, ...rails]) {
    assert.ok(['street', 'market'].includes(w.sectionAt(x.y).kind));
    const near = w.entities.filter((e) => (e.kind === 'obstacle' || e.kind === 'item') && e.y > x.y - LIGHT_STOP - 10 && e.y < x.y + 8);
    assert.deepEqual(near, [], 'nothing in the way at the crossing');
  }
});

test('the things on the list turn up often', () => {
  const w = createWorld(8, { wanted: ['bread'] });
  w.ensure(3000);
  const items = w.entities.filter((e) => e.kind === 'item');
  const bread = items.filter((e) => e.goods === 'bread').length;
  assert.ok(bread / items.length > 0.5, `${bread} of ${items.length}`);
});

test('not too many things on the road', () => {
  const w = createWorld(5, { wanted: ['bread', 'can'] });
  w.ensure(3000);
  const perHundred = w.entities.filter((e) => e.kind === 'item').length / 30;
  assert.ok(perHundred > 5 && perHundred < 10, perHundred.toFixed(1));
});

test('pruning forgets what is behind', () => {
  const w = createWorld(5);
  w.ensure(2000);
  const n = w.entities.length;
  const removed = w.prune(1500);
  assert.ok(removed > 0 && w.entities.length === n - removed);
  assert.ok(w.entities.every((e) => e.y >= 1500));
  assert.ok(w.sections[0].end >= 1500 || w.sections.length <= 2);
});
