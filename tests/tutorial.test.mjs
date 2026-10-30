import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, drainEvents } from '../src/game.js';
import { TUTORIAL, stageTutorial, tutorialInput, tutorialEvents, tutorialUpdate } from '../src/tutorial.js';
import { botSteer } from '../src/bot.js';

const DT = 1 / 120;
/** Rides the tutorial with a driver (given the lesson shown); returns the lessons in order, the time, the game and the events. */
function ride(drive, seconds = 150) {
  const g = createGame(TUTORIAL.seed, { track: TUTORIAL.track });
  const tu = stageTutorial(g);
  const shown = [], events = new Set();
  let t = 0;
  for (; t < seconds && tu.step !== 'done'; t += DT) {
    const { step: now, slow } = tutorialUpdate(tu, g, DT);
    if (shown.at(-1) !== now) shown.push(now);
    const input = drive(g, now);
    tutorialInput(tu, input, DT);
    step(g, DT * slow, input);
    const ev = drainEvents(g);
    for (const e of ev) events.add(e.type);
    tutorialEvents(tu, g, ev);
  }
  return { shown, t, g, tu, events };
}
// heads for the balloon, brakes at the red, gives the dog the cheese
function good(g, now) {
  const out = { ...botSteer(g), brake: now === 'light-red' || now === 'light-wait', drop: now === 'dog-drop' };
  const b = now === 'balloon' && g.world.entities.find((e) => e.type === 'balloon' && !e.taken && e.y > g.cart.y);
  if (b) out.steer = Math.sign(b.x - g.cart.x) * Math.min(1, Math.abs(b.x - g.cart.x) * 2);
  return out;
}

test('the tutorial shows obstacles, the jump, the balloon super jump, the red light and the dog, then the checkout', () => {
  const { shown, t, g, events } = ride(good);
  for (const lesson of ['steer', 'dodge', 'jump', 'balloon', 'superjump', 'light', 'light-red', 'light-wait', 'light-go', 'dog', 'grab', 'checkout', 'done']) assert.ok(shown.includes(lesson), `${lesson} in ${shown.join(' ')}`);
  assert.ok(events.has('glide'), 'a super jump');
  assert.ok(events.has('red') && !events.has('ranred'), 'stopped at the red');
  assert.ok(events.has('dog'));
  assert.ok(g.won && t < 90, `${t.toFixed(1)} s`);
});

test('even without touching anything the tutorial ends: crashes cost nothing, missed things come round again', () => {
  const { shown, t, g } = ride(() => ({ steer: 0 }));
  assert.equal(shown.at(-1), 'done');
  assert.ok(t < 90, `${t.toFixed(1)} s`);
  assert.equal(g.lives, g.maxLives);
});

test('the cheese for the dog: dropping it keeps the dog busy', () => {
  const { shown, events } = ride((g, now) => ({ steer: 0, drop: now === 'dog-drop' }));
  assert.ok(shown.includes('dog-drop'), shown.join(' '));
  assert.ok(events.has('dogeats'));
  assert.equal(shown.at(-1), 'done');
});
