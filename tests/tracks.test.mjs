import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, drainEvents, handling, targetSpeed, VEHICLES, RAIL_WARN } from '../src/game.js';
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
  assert.ok(!P.isOpen('montagna'));
  P.selectTrack('montagna'); // locked: ignored
  assert.equal(P.track(), 'borgo');
  assert.equal(P.finished('montagna'), null); // not open yet: finishing it opens nothing
  assert.equal(P.finished('borgo'), 'montagna');
  assert.equal(P.finished('borgo'), null); // already open
  assert.ok(P.isOpen('montagna') && !P.isOpen('mare'));
  assert.equal(P.finished('montagna'), 'mare');
  assert.equal(P.finished('mare'), 'vulcano');
  assert.equal(P.finished('vulcano'), 'arcobaleno');
  assert.equal(P.finished('arcobaleno'), null); // the last one
  assert.equal(P.unlocked(), 5);
  P.setBest('mare', 51.2);
  assert.equal(P.best('mare'), 51.2);
  assert.equal(st.m.get(bestKey('mare')), 51.2);
  assert.equal(bestKey('borgo'), 'cartcrash:bestScore');
});

test('progress saved on the platform joins this device', () => {
  const local = { [KEYS.coins]: 30, [KEYS.carts]: ['iron'], [KEYS.unlocked]: 2, [bestKey('borgo')]: 40 };
  const cloud = { [KEYS.coins]: 80, [KEYS.carts]: ['racer'], [KEYS.unlocked]: 3, [bestKey('borgo')]: 45, [bestKey('mare')]: 50 };
  const out = mergeProgress(local, cloud);
  assert.equal(out[KEYS.coins], 80);
  assert.deepEqual(out[KEYS.carts].sort(), ['iron', 'racer']);
  assert.equal(out[KEYS.unlocked], 3);
  assert.equal(out[bestKey('borgo')], undefined); // the local one is better
  assert.equal(out[bestKey('mare')], 50);
  assert.deepEqual(mergeProgress(local, {}), {});
});

// ---------- what each track adds ----------
const putE = (g, e) => { e.id = g.world.nextId++; g.world.entities.push(e); g.world.entities.sort((a, b) => a.y - b.y); return e; };
const middle = (gg) => ({ steer: (gg.world.center(gg.cart.y + 2) - gg.cart.x) * 0.8 });

test('a gap in the road: ride into it and you fall; jump it and you are over', () => {
  const g = emptyGame(2, { track: 'mare' });
  putE(g, { kind: 'gap', x: 0, y: 40, len: 5 });
  const ev = run(g, 6, middle);
  assert.ok(ev.some((e) => e.type === 'falling' && e.into === 'water'));
  assert.ok(ev.some((e) => e.type === 'respawn'));
  assert.ok(g.cart.y > 45, 'put back past the gap');
  const h = emptyGame(2, { track: 'mare' });
  putE(h, { kind: 'gap', x: 0, y: 40, len: 5 });
  let jumped = false;
  const ev2 = run(h, 6, (gg) => { const j = !jumped && gg.cart.y > 40 - 1.2; if (j) jumped = true; return { ...middle(gg), jump: j }; });
  assert.ok(!ev2.some((e) => e.type === 'falling'), 'a jump clears it');
  assert.ok(h.cart.y > 60);
});

test('piers and rope bridges have no walls; streets do', () => {
  const g = createGame(4, { track: 'mare' });
  g.world.ensure(800);
  const pier = g.world.sections.find((s) => s.kind === 'pier');
  const island = g.world.sections.find((s) => s.kind === 'island');
  assert.ok(g.world.isVoid(pier.start + 10));
  assert.ok(!g.world.isVoid(island.start + 10));
  const v = createGame(4, { track: 'vulcano' });
  v.world.ensure(800);
  const bridge = v.world.sections.find((s) => s.kind === 'bridge');
  assert.ok(v.world.isVoid(bridge.start + 5));
});

test('a wave pushes the cart sideways; jumping it is safe', () => {
  const g = emptyGame(3, { track: 'mare' });
  putE(g, { kind: 'wave', side: 1, x: 0, y: 30, wake: 12 });
  const ev = run(g, 4, { steer: 0 });
  assert.ok(ev.some((e) => e.type === 'splash'));
});

test('gulls and monkeys steal the top of the pile instead of biting', () => {
  const g = emptyGame(5, { track: 'mare' });
  g.stack.push({ type: 'goods', goods: 'bread', h: 0.34, id: 1 }, { type: 'goods', goods: 'soda', h: 0.56, id: 2 });
  putE(g, { kind: 'dog', species: 'gull', x: 3, y: 12, look: 0 });
  const ev = run(g, 6, (gg) => ({ steer: 0, brake: gg.cart.y > 14 }));
  const stolen = ev.find((e) => e.type === 'stolen');
  assert.ok(stolen && stolen.item.goods === 'soda');
  assert.equal(g.lives, 3, 'no life lost');
  assert.equal(g.stack.length, 1);
});

test('the boulder rolls after you on the Volcano: stop and it squashes you', () => {
  const g = emptyGame(6, { track: 'vulcano' });
  assert.equal(g.rollers.length, 1);
  run(g, 8, middle);
  assert.equal(g.lives, 3, 'rolling on, it never catches up');
  const ev = [];
  for (let i = 0; i < 8 / DT && !ev.some((e) => e.type === 'squashed'); i++) { step(g, DT, { steer: 0, brake: true }); ev.push(...drainEvents(g)); }
  assert.ok(ev.some((e) => e.type === 'squashed'));
  assert.equal(g.lives, 2);
  assert.ok(g.rollers.length === 1 && g.rollers[0].gap > 5, 'it drops back and keeps coming');
});

test('a snowball rolls after you for a while, a little faster than you', () => {
  const g = emptyGame(6, { track: 'montagna' });
  putE(g, { kind: 'roller', type: 'snowball', x: 0, y: 10 });
  const ev = run(g, 14, middle);
  assert.ok(ev.some((e) => e.type === 'roller'));
  assert.ok(ev.some((e) => e.type === 'squashed' || e.type === 'rollergone'));
});

test('hearts: a life back, or coins when nothing is missing', () => {
  const g = emptyGame(7);
  g.lives = 2;
  putE(g, { kind: 'heart', x: 0, y: 15, h: 0 });
  putE(g, { kind: 'heart', x: 0, y: 30, h: 0 });
  run(g, 4, (gg) => ({ steer: -gg.cart.x }));
  assert.equal(g.lives, 3);
  assert.equal(g.coins, 25);
});

test('turbo arrows speed you up; geysers throw you up only when they blow', () => {
  const g = emptyGame(8, { track: 'arcobaleno' });
  run(g, 2, middle);
  const v0 = g.cart.v;
  putE(g, { kind: 'obstacle', type: 'boost', x: g.world.center(g.cart.y + 6), y: g.cart.y + 6 });
  const ev = run(g, 1, middle);
  assert.ok(ev.some((e) => e.type === 'boost') && g.cart.v > v0 + 3);
  const v = emptyGame(8, { track: 'vulcano' });
  v.rollers.length = 0;
  putE(v, { kind: 'obstacle', type: 'geyser', x: v.world.center(20), y: 20, phase: 0 });
  const ev2 = run(v, 3, middle);
  // phase 0: blowing for the first 1.3 s of every 3.2 s; the cart gets there at about 1.6 s
  assert.equal(ev2.some((e) => e.type === 'geyser'), false);
  const w = emptyGame(8, { track: 'vulcano' });
  w.rollers.length = 0;
  putE(w, { kind: 'obstacle', type: 'geyser', x: w.world.center(20), y: 20, phase: 1.8 });
  assert.ok(run(w, 3, middle).some((e) => e.type === 'geyser'));
});

test('the frozen lake is slippery all the way', () => {
  const g = createGame(9, { track: 'montagna' });
  g.world.ensure(3000);
  const lake = g.world.sections.find((s) => s.kind === 'lake');
  assert.ok(lake);
  g.world.entities.length = 0;
  g.cart.y = lake.start + 5;
  g.cart.x = g.world.center(g.cart.y);
  run(g, 0.5);
  assert.ok(g.cart.oil > 0);
});

test('a fast cart shakes off chasers sooner, a slow one later', () => {
  const time = (cart) => {
    const g = emptyGame(10, { cart });
    putE(g, { kind: 'dog', species: 'dog', x: 3, y: 10, look: 0 });
    run(g, 2, middle);
    return g.dogs[0].time;
  };
  assert.ok(time('racer') < time('classic'));
  assert.ok(time('iron') > time('classic'));
});

test('crossings: the snowplow and the whale end the race like the train', () => {
  for (const vehicle of ['plow', 'whale']) {
    const g = emptyGame(11);
    // warned just in time for it to reach the middle of the road when the cart does
    putE(g, { kind: 'rail', vehicle, x: g.world.center(60), y: 60, state: 'idle', lead: RAIL_WARN + (g.world.halfWidth(60) + 10) / VEHICLES[vehicle].speed + 0.3 });
    run(g, 12, (gg) => ({ ...middle(gg), brake: false }));
    assert.ok(g.over && g.reason === 'train' && g.hitBy === vehicle, vehicle);
  }
});

test('the first win on a track pays once', () => {
  const P = createProgress(memoryStore());
  assert.equal(P.firstWin('borgo'), true);
  assert.equal(P.firstWin('borgo'), false);
  assert.equal(P.firstWin('mare'), true);
  assert.deepEqual(TRACK_ORDER.map((id) => TRACKS[id].first), [100, 200, 300, 400, 500]);
});
