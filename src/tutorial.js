// The first ride: an Old Town street that teaches one thing at a time, each
// set out just ahead of the cart when its turn comes:
//   steer      coins on the left, then on the right
//   dodge      a bin, a cone, a crate: steer round them
//   jump       a row of barriers
//   balloon    a balloon to grab…
//   superjump  …and two rows of barriers: the next jump is a super jump
//   light      a traffic light that turns red: brake and wait for the green
//   cheese     a cheese (not on the list)…
//   dog        …and a dog that chases you: drop the cheese to keep it busy
//   grab       the two things on the list (then the checkout appears)
//   checkout   reach it
//   done       "Well done! Now a real race" (src/main.js starts one)
// Crashes cost nothing here, missed things come round again, and time slows
// down while the game waits for the move it asks for.
import { lightPhase } from './game.js';

export const TUTORIAL = {
  seed: 2040, // an Old Town without stairs and with few bends for the first 750 m
  track: 'borgo',
  list: [{ key: 'bread', need: 1 }, { key: 'soda', need: 1 }],
};
const ORDER = ['steer', 'dodge', 'jump', 'balloon', 'superjump', 'light', 'cheese', 'dog', 'grab', 'checkout', 'done'];
const SLOW = 0.3; // how fast time runs while the game waits
const NEAR = 9; // metres before a jump where time slows down

/** Lays out the start on a new game made with TUTORIAL.seed and TUTORIAL.track. */
export function stageTutorial(g) {
  const w = g.world;
  g.list = TUTORIAL.list.map((l) => ({ ...l }));
  w.wanted = g.list.map((l) => l.key);
  w.ensure(820);
  w.clear(8, 800);
  for (let y = 22; y <= 34; y += 3) put(g, { kind: 'coin', h: 0 }, y, -1.6); // steer left…
  for (let y = 44; y <= 56; y += 3) put(g, { kind: 'coin', h: 0 }, y, 1.6); // …and right
  return { step: 'steer', y0: 0, t: 0, left: 0, right: 0, jumped: false, rows: [], slowT: 0, doneT: 0 };
}

/** Puts something on the road `dx` from the middle (or, with dx === null, where the cart is heading). */
function put(g, ent, y, dx) {
  const w = g.world;
  const lim = w.halfWidth(y) - 0.8;
  const off = dx === null ? Math.max(-lim, Math.min(lim, g.cart.x - w.center(y))) : dx;
  const e = { id: w.nextId++, ...ent, x: w.center(y) + off, y, tut: true };
  w.entities.push(e);
  w.entities.sort((a, b) => a.y - b.y);
  return e;
}

/** The next lesson: what it needs is set out ahead of the cart. */
function enter(tu, g, step) {
  const Y = g.cart.y;
  Object.assign(tu, { step, y0: Y, t: 0, jumped: false, slowT: 0, tries: 0 });
  // only the lesson's own things on the road ahead (none of the race's)
  const w = g.world;
  w.ensure(Y + 400);
  w.entities = w.entities.filter((e) => e.tut || e.y < Y + 3 || e.y > Y + 160 || e.taken);
  const row = (y) => { for (const dx of [-2.2, 0, 2.2]) put(g, { kind: 'obstacle', type: 'barrier', w: 1.0 }, y, dx); return y; };
  if (step === 'dodge') {
    put(g, { kind: 'obstacle', type: 'bin' }, Y + 30, -1.2);
    put(g, { kind: 'obstacle', type: 'cone' }, Y + 40, 1.2);
    put(g, { kind: 'obstacle', type: 'crate' }, Y + 50, 0);
  }
  if (step === 'jump') tu.rows = [row(Y + 30)];
  if (step === 'balloon') put(g, { kind: 'item', type: 'balloon', color: 0 }, Y + 22, null);
  if (step === 'superjump') tu.rows = [row(Y + 26), row(Y + 31)];
  if (step === 'light') tu.light = put(g, { kind: 'light', state: 'idle', willRed: true, crowd: 6 }, Y + 70, 0);
  if (step === 'cheese') put(g, { kind: 'item', type: 'goods', goods: 'cheese' }, Y + 20, null);
  if (step === 'dog') put(g, { kind: 'dog', species: 'dog', look: 1 }, Y + 16, g.world.halfWidth(Y + 16) + 0.6);
  if (step === 'grab') {
    put(g, { kind: 'item', type: 'goods', goods: g.list[0].key }, Y + 24, -1.1);
    put(g, { kind: 'item', type: 'goods', goods: g.list[1].key }, Y + 40, 1.1);
  }
}
const next = (tu, g) => enter(tu, g, ORDER[ORDER.indexOf(tu.step) + 1]);

/** What the player is doing (each simulation step): counts the steering. */
export function tutorialInput(tu, input, dt) {
  if (input.steer < 0) tu.left += dt;
  if (input.steer > 0) tu.right += dt;
}

/** Moves the lesson on with the game's events. */
export function tutorialEvents(tu, g, events) {
  for (const e of events) {
    if (e.type === 'jump' || e.type === 'glide') tu.jumped = true;
    // nothing is lost here: a crash, a bite or a fine keeps every life
    if (['crash', 'respawn', 'bite', 'caught'].includes(e.type)) g.lives = g.maxLives;
    if (e.type === 'pickup' && e.item === 'balloon' && tu.step === 'balloon') next(tu, g);
    if (e.type === 'pickup' && e.goods === 'cheese' && tu.step === 'cheese') next(tu, g);
    if (e.type === 'dogeats' && tu.step === 'dog') next(tu, g);
    if (e.type === 'listdone' && tu.step === 'grab') next(tu, g);
  }
}

/** Something the lesson needs was missed: it comes round again in the cart's way. */
function again(tu, g, match, ent) {
  const y = g.cart.y;
  if (g.world.entities.some((e) => match(e) && !e.taken && e.y > y && e.y < y + 40)) return;
  tu.tries++;
  put(g, ent, y + 22, null);
}

/**
 * Once a frame: the lesson to show (with a variant, e.g. 'light-red') and how
 * fast time should run (1 = normal).
 */
export function tutorialUpdate(tu, g, dt) {
  const c = g.cart, y = c.y;
  tu.t += dt;
  let show = tu.step, slow = 1;
  const air = c.z > 0.02;
  const lastRow = tu.rows.at(-1);
  switch (tu.step) {
    case 'steer': if ((tu.left > 0.2 && tu.right > 0.2) || y > 60) next(tu, g); break;
    case 'dodge': if (y > tu.y0 + 53) next(tu, g); break;
    case 'jump':
    case 'superjump': {
      const first = tu.rows[0];
      if (!tu.jumped && !air && first - y < NEAR && first - y > 0.5 && (tu.slowT += dt) < 4) slow = SLOW;
      if (y > lastRow + 2) next(tu, g);
      break;
    }
    case 'balloon':
      if (g.balloons.length) next(tu, g);
      else if (tu.tries >= 3) enter(tu, g, 'light'); // missed it again and again: on with the rest
      else again(tu, g, (e) => e.kind === 'item' && e.type === 'balloon', { kind: 'item', type: 'balloon', color: 0 });
      break;
    case 'light': {
      const L = tu.light;
      const phase = lightPhase(g, L);
      const red = phase !== 'green';
      if (red) show = c.v < 0.5 ? 'light-wait' : 'light-red';
      else if (L.state === 'cycle') show = 'light-go';
      if (red && c.v > 1 && L.y - y < 14 && L.y - y > 3 && (tu.slowT += dt) < 3) slow = 0.5;
      if (y > L.y + 2) next(tu, g);
      break;
    }
    case 'cheese':
      // not taken: no cheese lesson, on to the dog all the same
      if (tu.t > 1 && !g.world.entities.some((e) => e.goods === 'cheese' && !e.taken && e.y > y - 1)) next(tu, g);
      break;
    case 'dog': {
      const chasing = g.dogs.some((d) => d.state === 'chase');
      const cheese = g.stack.some((it) => it.goods === 'cheese');
      if (chasing) { show = cheese ? 'dog-drop' : 'dog-run'; if (cheese && (tu.slowT += dt) < 3) slow = 0.4; }
      if ((tu.t > 2 && !chasing) || tu.t > (cheese ? 7 : 5)) next(tu, g); // the chase may go on, the lesson moves on
      break;
    }
    case 'grab':
      for (const l of g.list) {
        if (g.stack.filter((it) => it.goods === l.key).length < l.need) again(tu, g, (e) => e.kind === 'item' && e.goods === l.key, { kind: 'item', type: 'goods', goods: l.key });
      }
      break;
    default: break;
  }
  if (g.won && tu.step !== 'done') enter(tu, g, 'done');
  if (tu.step === 'done') { tu.doneT += dt; show = 'done'; }
  return { step: show, slow };
}
