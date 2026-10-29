import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, drainEvents, handling, targetSpeed } from '../src/game.js';
import { botSteer } from '../src/bot.js';
import { TRACKS, TRACK_ORDER } from '../src/tracks.js';
import { CARTS } from '../src/carts.js';
import { createProgress, mergeProgress, bestKey, KEYS } from '../src/progress.js';

const DT = 1 / 120;
function run(g, seconds, input = 0) {
  const events = [];
  for (let i = 0; i < seconds / DT && !g.over; i++) { step(g, DT, typeof input === 'function' ? input(g) : input); events.push(...drainEvents(g)); }
  return events;
}
function emptyGame(seed, opts) {
  const g = createGame(seed, opts);
  g.world.ensure(600);
  g.world.entities.length = 0;
  g.world.ensure = () => {};
  return g;
}
const memoryStore = () => { const m = new Map(); return { m, load: (k, d) => (m.has(k) ? m.get(k) : d), save: (k, v) => m.set(k, v) }; };

test('every track builds its road and can be ridden by the bot', () => {
  for (const id of TRACK_ORDER) {
    const g = createGame(99, { track: id });
    run(g, 40, (gg) => botSteer(gg));
    assert.equal(g.track, id);
    assert.ok(g.distance > 150, `${id}: ${g.distance}`);
  }
});

test('the Rainbow Road has no people, no dogs, no lights and no trains; the Mountain has ice', () => {
  const rb = createGame(5, { track: 'arcobaleno' });
  rb.world.ensure(2000);
  assert.ok(!rb.world.entities.some((e) => e.type === 'walker' || e.kind === 'dog' || e.kind === 'light' || e.kind === 'rail'));
  const mt = createGame(5, { track: 'montagna' });
  mt.world.ensure(2000);
  assert.ok(mt.world.entities.some((e) => e.type === 'ice'));
  const town = createGame(5);
  town.world.ensure(2000);
  assert.ok(!town.world.entities.some((e) => e.type === 'ice'));
});

test('later tracks roll faster', () => {
  const speeds = TRACK_ORDER.map((id) => targetSpeed(createGame(1, { track: id }), 'street'));
  for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] > speeds[i - 1], speeds.join());
});

test('coins on the road are counted, also over a jump', () => {
  const g = emptyGame(3);
  const put = (e) => { e.id = g.world.nextId++; g.world.entities.push(e); g.world.entities.sort((a, b) => a.y - b.y); };
  put({ kind: 'coin', x: 0, y: 12, h: 0 });
  put({ kind: 'coin', x: 0, y: 16, h: 0 });
  put({ kind: 'coin', x: 0, y: 40, h: 1.3 }); // in the air: only a jump reaches it
  const ev = run(g, 3, (gg) => ({ steer: -gg.cart.x }));
  assert.equal(g.coins, 2);
  assert.equal(ev.filter((e) => e.type === 'coin').length, 2);
  // Now jump under the high coin.
  const g2 = emptyGame(3);
  g2.world.entities.push({ id: 1, kind: 'coin', x: 0, y: 30, h: 1.3 });
  let jumped = false;
  run(g2, 4, (gg) => { const j = !jumped && gg.cart.y > 30 - gg.cart.v * 0.32; if (j) jumped = true; return { steer: -gg.cart.x, jump: j }; });
  assert.equal(g2.coins, 1);
});

test('reaching the checkout adds the track bonus', () => {
  for (const id of ['borgo', 'arcobaleno']) {
    const g = emptyGame(4, { track: id, list: [{ key: 'bread', need: 1 }] });
    g.stack.push({ type: 'goods', goods: 'bread', h: 0.34, id: 1 });
    run(g, 20, (gg) => ({ steer: (gg.world.center(gg.cart.y + 2) - gg.cart.x) * 0.8 }));
    assert.ok(g.won);
    assert.equal(g.bonus, TRACKS[id].bonus);
    assert.equal(g.coins, TRACKS[id].bonus);
  }
});

test('the carts: lives, speed and steering', () => {
  assert.equal(createGame(1).lives, 3);
  assert.equal(createGame(1, { cart: 'iron' }).lives, 4);
  assert.equal(createGame(1, { cart: 'rocket' }).lives, 5);
  assert.ok(targetSpeed(createGame(1, { cart: 'racer' }), 'street') > targetSpeed(createGame(1), 'street'));
  assert.ok(handling(createGame(1, { cart: 'iron' })).maxLat < handling(createGame(1)).maxLat);
  assert.equal(createGame(1, { cart: 'nope', track: 'nope' }).cartType, 'classic');
  assert.equal(createGame(1, { cart: 'nope', track: 'nope' }).track, 'borgo');
});

test('off the edge of the Rainbow Road you fall: a life less, then back on the road', () => {
  const g = emptyGame(8, { track: 'arcobaleno' });
  run(g, 1.5);
  const ev = [];
  for (let i = 0; i < 4 / DT && !ev.some((e) => e.type === 'respawn'); i++) { step(g, DT, { steer: 1 }); ev.push(...drainEvents(g)); }
  assert.ok(ev.some((e) => e.type === 'falling'));
  assert.ok(ev.some((e) => e.type === 'respawn'));
  assert.equal(g.lives, 2);
  assert.ok(Math.abs(g.cart.x - g.world.center(g.cart.y)) < g.world.halfWidth(g.cart.y));
  // Keep falling off: out of lives, the race ends on the fall.
  run(g, 12, { steer: 1 });
  assert.ok(g.over && !g.won);
  assert.equal(g.reason, 'fell');
  // On the other tracks the walls keep you on the road.
  const town = emptyGame(8);
  const ev2 = run(town, 4, { steer: 1 });
  assert.ok(!ev2.some((e) => e.type === 'falling'));
  assert.equal(town.lives, 3);
});

test('progress: coins, buying carts, unlocking tracks one after another', () => {
  const st = memoryStore();
  const P = createProgress(st);
  assert.equal(P.coins(), 0);
  assert.deepEqual(P.owned(), ['classic']);
  assert.equal(P.buy('iron'), false); // no coins
  P.addCoins(CARTS.iron.price + 10);
  assert.equal(P.buy('iron'), true);
  assert.equal(P.coins(), 10);
  assert.equal(P.cart(), 'iron');
  assert.equal(P.buy('iron'), false); // already yours
  P.selectCart('rocket'); // not bought: ignored
  assert.equal(P.cart(), 'iron');
  assert.equal(P.unlocked(), 1);
  assert.ok(!P.isOpen('porto'));
  P.selectTrack('porto'); // locked: ignored
  assert.equal(P.track(), 'borgo');
  assert.equal(P.finished('porto'), null); // not open yet: finishing it opens nothing
  assert.equal(P.finished('borgo'), 'porto');
  assert.equal(P.finished('borgo'), null); // already open
  assert.ok(P.isOpen('porto') && !P.isOpen('montagna'));
  assert.equal(P.finished('porto'), 'montagna');
  assert.equal(P.finished('montagna'), 'arcobaleno');
  assert.equal(P.finished('arcobaleno'), null); // the last one
  assert.equal(P.unlocked(), 4);
  P.setBest('porto', 51.2);
  assert.equal(P.best('porto'), 51.2);
  assert.equal(st.m.get(bestKey('porto')), 51.2);
  assert.equal(bestKey('borgo'), 'cartcrash:bestScore');
});

test('progress saved on the platform joins this device', () => {
  const local = { [KEYS.coins]: 30, [KEYS.carts]: ['iron'], [KEYS.unlocked]: 2, [bestKey('borgo')]: 40 };
  const cloud = { [KEYS.coins]: 80, [KEYS.carts]: ['racer'], [KEYS.unlocked]: 3, [bestKey('borgo')]: 45, [bestKey('porto')]: 50 };
  const out = mergeProgress(local, cloud);
  assert.equal(out[KEYS.coins], 80);
  assert.deepEqual(out[KEYS.carts].sort(), ['iron', 'racer']);
  assert.equal(out[KEYS.unlocked], 3);
  assert.equal(out[bestKey('borgo')], undefined); // the local one is better
  assert.equal(out[bestKey('porto')], 50);
  assert.deepEqual(mergeProgress(local, {}), {});
});
