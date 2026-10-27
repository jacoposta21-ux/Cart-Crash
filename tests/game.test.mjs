import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, drainEvents, handling, jolt, result, makeList, listProgress, listDone, isNeeded, extras,
  LIVES, RIM, MAX_PILE, EXTRA_PENALTY, CHASE_GAP, stackHeight, itemKey, crowdPeople, lightPhase,
} from '../src/game.js';
import { botSteer } from '../src/bot.js';

const DT = 1 / 120;
// A game on an empty road (nothing to hit, nothing to grab) for controlled checks.
function emptyGame(seed = 1, list) {
  const g = createGame(seed, list ? { list } : {});
  g.world.ensure(600);
  g.world.entities.length = 0;
  g.world.ensure = () => {};
  return g;
}
const add = (g, it) => { g.stack.push({ h: it.type === 'melon' ? 0.72 : it.type === 'eggs' ? 0.3 : 0.5, id: g.stack.length + 1000, ...it }); };
const put = (g, e) => { e.id = g.world.nextId++; g.world.entities.push(e); g.world.entities.sort((a, b) => a.y - b.y); return e; };
function run(g, seconds, input = 0) {
  const events = [];
  for (let i = 0; i < seconds / DT && !g.over; i++) { step(g, DT, typeof input === 'function' ? input(g) : input); events.push(...drainEvents(g)); }
  return events;
}

test('a ride is deterministic for a seed and the same inputs', () => {
  const a = createGame(1234), b = createGame(1234);
  run(a, 30, botSteer); run(b, 30, botSteer);
  assert.equal(a.cart.y, b.cart.y);
  assert.equal(a.cart.x, b.cart.x);
  assert.deepEqual(listProgress(a), listProgress(b));
});

test('a shopping list has 4 different things, several of each', () => {
  for (let seed = 1; seed < 50; seed++) {
    const list = makeList(seed);
    assert.equal(list.length, 4);
    assert.equal(new Set(list.map((l) => l.key)).size, 4);
    for (const l of list) assert.ok(l.key === 'melon' ? l.need >= 1 && l.need <= 2 : l.need >= 2 && l.need <= 3, JSON.stringify(l));
  }
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

test('the brake stops the cart', () => {
  const g = emptyGame();
  run(g, 4);
  assert.ok(g.cart.v > 10);
  run(g, 1.5, { brake: true });
  assert.equal(g.cart.v, 0);
});

test('only what is on the list counts; the rest is junk taking up room', () => {
  const g = emptyGame(1, [{ key: 'bread', need: 2 }, { key: 'melon', need: 1 }]);
  add(g, { type: 'goods', goods: 'bread' });
  add(g, { type: 'goods', goods: 'cheese' });
  add(g, { type: 'goods', goods: 'bread' });
  add(g, { type: 'goods', goods: 'bread' });
  assert.deepEqual(listProgress(g).map((l) => l.have), [2, 0]);
  assert.equal(listDone(g), false);
  assert.deepEqual(g.stack.map((it) => isNeeded(g, it)), [true, false, true, false]);
  assert.equal(itemKey(g.stack[0]), 'bread');
});

test('with the list complete the checkout appears ahead, and reaching it wins', () => {
  const g = emptyGame(1, [{ key: 'bread', need: 1 }]);
  run(g, 1);
  assert.equal(g.checkoutY, null);
  add(g, { type: 'goods', goods: 'bread' });
  const ev = run(g, 0.1);
  assert.ok(ev.some((e) => e.type === 'listdone'));
  assert.ok(g.checkoutY > g.cart.y + 60);
  run(g, 15);
  assert.equal(g.won, true);
  const r = result(g);
  assert.ok(r.won && r.time > 1 && r.time < 16, JSON.stringify(r));
  assert.equal(r.have, 1);
});

test('every extra thing in the cart at the checkout adds 5 seconds', () => {
  const g = emptyGame(1, [{ key: 'bread', need: 2 }]);
  add(g, { type: 'goods', goods: 'bread' });
  add(g, { type: 'goods', goods: 'cheese' }); // not on the list
  add(g, { type: 'goods', goods: 'bread' });
  add(g, { type: 'goods', goods: 'bread' }); // one too many
  g.balloons.push({ color: 0 }); // balloons are not extras
  assert.equal(extras(g), 2);
  run(g, 15);
  assert.equal(g.won, true);
  const r = result(g);
  assert.equal(EXTRA_PENALTY, 5);
  assert.equal(r.extras, 2);
  assert.equal(r.penalty, 10);
  assert.ok(Math.abs(r.total - (r.time + 10)) < 1e-9);
});

test('dropping an extra before the checkout saves its 5 seconds', () => {
  const g = emptyGame(1, [{ key: 'bread', need: 1 }]);
  add(g, { type: 'goods', goods: 'bread' });
  add(g, { type: 'goods', goods: 'cheese' });
  assert.equal(extras(g), 1);
  run(g, DT, { drop: true });
  assert.equal(extras(g), 0);
  run(g, 15);
  assert.equal(result(g).total, result(g).time);
});

test('without the whole list there is no checkout and no win', () => {
  const g = emptyGame(1, [{ key: 'bread', need: 2 }]);
  add(g, { type: 'goods', goods: 'bread' });
  run(g, 20);
  assert.equal(g.checkoutY, null);
  assert.equal(g.won, false);
});

test('losing a listed thing before the checkout takes the checkout away again', () => {
  const g = emptyGame(1, [{ key: 'bread', need: 1 }]);
  add(g, { type: 'goods', goods: 'bread' });
  run(g, 0.5);
  assert.ok(g.checkoutY !== null);
  g.stack.pop();
  const ev = run(g, 0.1);
  assert.ok(ev.some((e) => e.type === 'listbroken'));
  assert.equal(g.checkoutY, null);
});

test('jumping clears a low obstacle; riding into it is a crash', () => {
  const a = emptyGame(), b = emptyGame();
  for (const g of [a, b]) { run(g, 3); put(g, { kind: 'obstacle', type: 'barrier', x: g.cart.x, y: g.cart.y + 3, w: 1.0 }); }
  run(a, 1, (g) => ({ jump: g.cart.z === 0 && g.world.entities[0].y - g.cart.y < 3.5 }));
  run(b, 1);
  assert.equal(a.lives, LIVES, 'jumped over');
  assert.equal(b.lives, LIVES - 1, 'crashed');
});

test('dropping puts the top thing on the road behind the cart', () => {
  const g = emptyGame();
  add(g, { type: 'goods', goods: 'can' });
  add(g, { type: 'goods', goods: 'soda' });
  const ev = run(g, DT, { drop: true });
  assert.ok(ev.some((e) => e.type === 'drop' && e.item.goods === 'soda'));
  assert.equal(g.stack.length, 1);
  const d = g.world.entities.find((e) => e.kind === 'dropped');
  assert.ok(d && d.y < g.cart.y);
});

test('a dog catches a braking cart and costs a life', () => {
  const g = emptyGame();
  run(g, 2);
  put(g, { kind: 'dog', x: g.cart.x + 3, y: g.cart.y + 2, look: 0 });
  run(g, 0.6);
  assert.equal(g.dogs.length, 1);
  const ev = run(g, 3, { brake: true });
  assert.ok(ev.some((e) => e.type === 'bite'));
  assert.equal(g.lives, LIVES - 1);
});

test('a dropped treat keeps the dog busy instead', () => {
  const g = emptyGame();
  add(g, { type: 'goods', goods: 'cheese' });
  run(g, 2);
  put(g, { kind: 'dog', x: g.cart.x + 3, y: g.cart.y + 2, look: 0 });
  run(g, 0.6);
  run(g, DT, { drop: true, brake: true });
  const ev = run(g, 3, { brake: true });
  assert.ok(ev.some((e) => e.type === 'dogeats'));
  assert.equal(ev.filter((e) => e.type === 'bite').length, 0);
  assert.equal(g.lives, LIVES);
});

test('a dog cannot catch a cart that keeps rolling', () => {
  const g = emptyGame();
  run(g, 3);
  put(g, { kind: 'dog', x: g.cart.x + 3, y: g.cart.y + 2, look: 0 });
  const ev = run(g, 8);
  assert.ok(ev.some((e) => e.type === 'dog'));
  assert.equal(ev.filter((e) => e.type === 'bite').length, 0);
});

test('stopping at a red light keeps the load, and you go on when it turns green', () => {
  const g = emptyGame();
  for (let i = 0; i < 4; i++) add(g, { type: 'goods', goods: 'can' });
  put(g, { kind: 'light', x: 0, y: 90, state: 'idle', willRed: true, crowd: 6 });
  const ev = run(g, 16, (gg) => ({ steer: 0, brake: botSteer(gg).brake }));
  assert.ok(ev.some((e) => e.type === 'yellow'));
  assert.ok(ev.some((e) => e.type === 'red'));
  assert.equal(ev.filter((e) => e.type === 'ranred' || e.type === 'crowdhit' || e.type === 'cop').length, 0);
  assert.equal(g.stack.length, 4);
  assert.ok(g.cart.y > 95);
});

test('riding into the crowd on the crossing knocks everything out of the cart', () => {
  const g = emptyGame();
  for (let i = 0; i < 4; i++) add(g, { type: 'goods', goods: 'can' });
  const light = put(g, { kind: 'light', x: 0, y: 90, state: 'idle', willRed: true, crowd: 6 });
  // Stop at the line like the bot, until someone is in the middle of the crossing, then aim at them.
  let person = null;
  for (let i = 0; i < 20 / DT && !person; i++) {
    step(g, DT, { steer: 0, brake: botSteer(g).brake });
    if (lightPhase(g, light) === 'red' && g.cart.v < 0.5) person = crowdPeople(g, light).find((p) => p.walking && Math.abs(p.x - g.world.center(p.y)) < 1.5);
  }
  assert.ok(person, 'someone is crossing');
  g.cart.x = person.x; g.cart.y = person.y - 0.45; g.cart.v = 3;
  const ev = run(g, 0.1, { brake: true });
  assert.ok(ev.some((e) => e.type === 'crowdhit'));
  assert.equal(g.stack.length, 0);
  run(g, 1.5);
  assert.equal(g.cops.length, 1, 'the warden comes anyway');
});

test('dogs and the warden run just behind the cart, on screen, and never drop out of view while chasing', () => {
  const g = emptyGame();
  run(g, 3);
  put(g, { kind: 'dog', x: g.cart.x + 3, y: g.cart.y + 2, look: 0 });
  for (let i = 0; i < 6 / DT; i++) {
    step(g, DT, 0);
    for (const d of g.dogs) if (d.state === 'chase') {
      assert.ok(g.cart.y - d.y <= CHASE_GAP + 1e-9 && g.cart.y - d.y >= 0, `gap ${g.cart.y - d.y}`);
      if (d.t > 1) assert.ok(Math.abs(d.x - g.cart.x) < 1.6, 'beside the cart once it has come in from the pavement');
    }
  }
  assert.equal(g.lives, LIVES);
});

test('running a red light brings the warden: he catches you only if you slow down', () => {
  const chase = (brakeAfter) => {
    const g = emptyGame();
    put(g, { kind: 'light', x: 0, y: 90, state: 'idle', willRed: true, crowd: 0 });
    const ev = run(g, 22, (gg) => ({ steer: 0, brake: brakeAfter && gg.cops.length > 0 && gg.cops[0].t > brakeAfter }));
    return { g, ev };
  };
  const fast = chase(0);
  assert.ok(fast.ev.some((e) => e.type === 'ranred'));
  assert.ok(fast.ev.some((e) => e.type === 'cop'));
  assert.ok(fast.ev.some((e) => e.type === 'copgaveup'), 'he gives up after 10 s');
  assert.equal(fast.ev.filter((e) => e.type === 'caught').length, 0);
  assert.equal(fast.g.lives, LIVES);
  const slow = chase(0.5);
  assert.ok(slow.ev.some((e) => e.type === 'caught'));
  assert.equal(slow.g.lives, LIVES - 1);
});

test('balloons can be let go one at a time', () => {
  const g = emptyGame();
  g.balloons.push({ color: 0 }, { color: 1 });
  const ev = run(g, DT, { release: true });
  assert.ok(ev.some((e) => e.type === 'release'));
  assert.equal(g.balloons.length, 1);
});

test('the train ends the ride; waiting at the barrier is safe', () => {
  const a = emptyGame(), b = emptyGame();
  for (const g of [a, b]) put(g, { kind: 'rail', x: 0, y: 110, state: 'idle' });
  const evA = run(a, 15);
  assert.ok(evA.some((e) => e.type === 'bells'));
  assert.equal(a.over, true);
  assert.equal(a.reason, 'train');
  run(b, 18, (g) => ({ steer: 0, brake: botSteer(g).brake }));
  assert.equal(b.over, false);
  assert.ok(b.cart.y > 120);
});

test('watermelons make the steering slower', () => {
  const plain = emptyGame(), heavy = emptyGame();
  run(plain, 2); run(heavy, 2);
  add(heavy, { type: 'melon' }); add(heavy, { type: 'melon' });
  assert.ok(handling(heavy).grip < handling(plain).grip / 1.5);
  const x0 = plain.cart.x, x1 = heavy.cart.x;
  run(plain, 0.25, 1); run(heavy, 0.25, 1);
  assert.ok(heavy.cart.x - x1 < (plain.cart.x - x0) * 0.8);
});

test('balloons make the cart hop, and a hop clears a pothole', () => {
  const g = emptyGame();
  g.balloons.push({ color: 0 }, { color: 1 });
  const ev = run(g, 4);
  assert.ok(ev.filter((e) => e.type === 'hop').length >= 1);
  const h = emptyGame();
  h.cart.z = 1; h.cart.vz = 2;
  put(h, { kind: 'obstacle', type: 'pothole', x: 0, y: h.cart.y + 0.3 });
  const ev2 = run(h, 0.1);
  assert.equal(ev2.filter((e) => e.cause === 'pothole').length, 0);
});

test('olive oil makes the cart slide for a few seconds', () => {
  const g = emptyGame();
  put(g, { kind: 'item', type: 'oil', x: 0, y: g.cart.y + 0.3 });
  run(g, 0.05);
  assert.ok(g.cart.oil > 2.5);
  assert.ok(handling(g).grip < 2);
  run(g, 4);
  assert.ok(g.cart.oil <= 0);
});

test('a pothole shakes things off a tall pile and breaks eggs', () => {
  let fell = 0, broke = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = emptyGame(seed);
    for (let i = 0; i < 8; i++) add(g, { type: 'goods', goods: 'cereal' });
    add(g, { type: 'eggs' });
    jolt(g, 0.9, 'pothole');
    const ev = drainEvents(g);
    fell += ev.filter((e) => e.type === 'fall').length;
    broke += ev.filter((e) => e.type === 'break').length;
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

test('when the cart is full, what you grab slides off: no room', () => {
  const g = emptyGame();
  while (stackHeight(g) < MAX_PILE - 0.3) add(g, { type: 'goods', goods: 'cereal', h: 0.62 });
  put(g, { kind: 'item', type: 'melon', x: 0, y: g.cart.y + 0.4 });
  const ev = run(g, 0.1);
  assert.ok(ev.some((e) => e.type === 'fall' && e.why === 'full'));
  assert.ok(stackHeight(g) <= MAX_PILE);
});

test('three crashes and you are out', () => {
  const g = emptyGame();
  for (let i = 0; i < LIVES; i++) {
    g.cart.safe = 0;
    put(g, { kind: 'obstacle', type: 'bin', x: g.cart.x, y: g.cart.y + 0.6 });
    run(g, 0.2);
    if (i < LIVES - 1) assert.equal(g.over, false);
  }
  assert.equal(g.lives, 0);
  assert.equal(g.over, true);
  assert.equal(g.reason, 'crashes');
  assert.equal(result(g).won, false);
});

test('people cross the street when the cart gets close, others walk up the road', () => {
  const g = emptyGame();
  const w = g.world;
  const e = put(g, { kind: 'obstacle', type: 'walker', mode: 'cross', side: 1, speed: 1.6, wake: 14, look: 3, y: 40, x: w.center(40) + w.halfWidth(40) + 1.2 });
  const up = put(g, { kind: 'obstacle', type: 'walker', mode: 'along', speed: 1.2, wake: 40, look: 3, sway: 0, y: 70, x: 2 });
  const x0 = e.x;
  run(g, 0.5);
  assert.equal(e.going, undefined);
  while (g.cart.y < 40 - 13) step(g, DT, 0);
  run(g, 0.5);
  assert.equal(e.going, true);
  assert.ok(e.x < x0);
  assert.ok(up.going && up.y < 70);
});

test('the bot finishes some races and gets knocked out of others', () => {
  let won = 0, out = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = createGame(seed * 7919);
    run(g, 300, botSteer);
    assert.ok(g.over, `seed ${seed} still running`);
    if (g.won) won++; else out++;
    assert.ok(g.world.entities.length < 700, 'old things are forgotten');
  }
  assert.ok(won >= 1 && out >= 1, `won ${won}, out ${out}`);
});
