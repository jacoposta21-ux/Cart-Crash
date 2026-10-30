// The first ride: a short, staged stretch of the Old Town that teaches one
// thing at a time (steer, jump, grab what is on the list, drop what is not),
// then the checkout. Crashes cost nothing here, missed things come round again,
// and time slows down while the game waits for the move it asks for. When it
// is done, a real race starts (src/main.js).
//
// steps: steer → jump → grab → (drop, only if something off the list is
// picked up) → checkout → done.

export const TUTORIAL = {
  seed: 156, // a straight Old Town street for the first 300 m
  track: 'borgo',
  list: [{ key: 'bread', need: 1 }, { key: 'soda', need: 1 }],
};
const JUMP_Y = 78; // the row of barriers to jump
const GRAB_Y = [100, 118]; // where the two things on the list are
const SLOW = 0.3; // how fast time runs while the game waits

/** Lays out the stretch on a new game made with TUTORIAL.seed and TUTORIAL.track. */
export function stageTutorial(g) {
  const w = g.world;
  g.list = TUTORIAL.list.map((l) => ({ ...l }));
  w.wanted = g.list.map((l) => l.key);
  w.ensure(420);
  w.clear(8, 400);
  const put = ({ dx = 0, ...e }) => w.entities.push({ id: w.nextId++, x: w.center(e.y) + dx, ...e });
  for (let y = 22; y <= 34; y += 3) put({ kind: 'coin', y, dx: -1.6, h: 0 }); // steer left…
  for (let y = 44; y <= 56; y += 3) put({ kind: 'coin', y, dx: 1.6, h: 0 }); // …and right
  for (const dx of [-2.2, 0, 2.2]) put({ kind: 'obstacle', type: 'barrier', y: JUMP_Y, dx, w: 1.0 });
  GRAB_Y.forEach((y, i) => put({ kind: 'item', type: 'goods', goods: g.list[i].key, y, dx: i ? 1.3 : -1.3 }));
  w.entities.sort((a, b) => a.y - b.y);
  return createTutorial();
}

export function createTutorial() {
  return { step: 'steer', left: 0, right: 0, jumped: false, junk: false, dropT: 0, doneT: 0 };
}

/** What the player is doing (each simulation step): counts the steering. */
export function tutorialInput(tu, input, dt) {
  if (input.steer < 0) tu.left += dt;
  if (input.steer > 0) tu.right += dt;
}

/** Moves the lesson on with the game's events. */
export function tutorialEvents(tu, g, events) {
  for (const e of events) {
    if (e.type === 'jump' || e.type === 'glide') tu.jumped = true;
    // nothing is lost here: a crash keeps every life
    if (e.type === 'crash' || e.type === 'respawn') g.lives = g.maxLives;
    if (e.type === 'pickup' && !e.wanted && e.item !== 'balloon' && tu.step === 'checkout') { tu.junk = true; tu.step = 'drop'; }
    if (e.type === 'drop' && tu.step === 'drop') tu.step = 'checkout';
    if (e.type === 'listdone' && tu.step === 'grab') {
      tu.step = 'checkout';
      // something not on the list right in the way, to learn to drop it
      const w = g.world, y = g.cart.y + 20;
      w.entities.push({ id: w.nextId++, kind: 'item', type: 'goods', goods: 'cheese', x: g.cart.x - w.center(g.cart.y) + w.center(y), y });
      w.entities.sort((a, b) => a.y - b.y);
    }
  }
}

/**
 * Once a frame: the step to show and how fast time should run (1 = normal).
 * Things on the list that were missed come round again further on.
 */
export function tutorialUpdate(tu, g, dt) {
  const y = g.cart.y;
  if (tu.step === 'steer' && ((tu.left > 0.2 && tu.right > 0.2) || y > JUMP_Y - 22)) tu.step = 'jump';
  if (tu.step === 'jump' && (tu.jumped || y > JUMP_Y + 2) && y > JUMP_Y - 12) tu.step = 'grab';
  if (tu.step === 'grab') {
    const w = g.world;
    for (const l of g.list) {
      const have = g.stack.filter((it) => it.type === 'goods' && it.goods === l.key).length;
      const ahead = w.entities.some((e) => e.kind === 'item' && !e.taken && e.goods === l.key && e.y > y && e.y < y + 40);
      if (have < l.need && !ahead) {
        const ny = y + 22;
        w.entities.push({ id: w.nextId++, kind: 'item', type: 'goods', goods: l.key, x: Math.max(-1, Math.min(1, (g.cart.x - w.center(ny)) / (w.halfWidth(ny) - 0.8))) * (w.halfWidth(ny) - 0.8) + w.center(ny), y: ny }); // right in its way
        w.entities.sort((a, b) => a.y - b.y);
      }
    }
  }
  if (g.won) { tu.step = 'done'; tu.doneT += dt; }
  let slow = 1;
  const air = g.cart.z > 0.02;
  if (tu.step === 'jump' && !tu.jumped && !air && JUMP_Y - y < 9 && JUMP_Y - y > 1) slow = SLOW;
  if (tu.step === 'drop' && (tu.dropT += dt) < 3) slow = SLOW; // not for ever
  return { step: tu.step, slow };
}
