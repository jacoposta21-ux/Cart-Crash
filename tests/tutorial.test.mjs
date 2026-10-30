import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, drainEvents } from '../src/game.js';
import { TUTORIAL, stageTutorial, tutorialInput, tutorialEvents, tutorialUpdate } from '../src/tutorial.js';
import { botSteer } from '../src/bot.js';

const DT = 1 / 120;
/** Rides the tutorial with a driver; returns the steps in order, the time and the game. */
function ride(drive, seconds = 90) {
  const g = createGame(TUTORIAL.seed, { track: TUTORIAL.track });
  const tu = stageTutorial(g);
  const steps = [];
  let t = 0;
  for (; t < seconds && tu.step !== 'done'; t += DT) {
    const { step: now, slow } = tutorialUpdate(tu, g, DT);
    if (steps.at(-1) !== now) steps.push(now);
    const input = drive(g, now);
    tutorialInput(tu, input, DT);
    step(g, DT * slow, input);
    tutorialEvents(tu, g, drainEvents(g));
  }
  return { steps, t, g, tu };
}

test('the tutorial teaches steer, jump, grab, then the checkout; a good driver is done in under 30 s', () => {
  const { steps, t, g } = ride((g) => botSteer(g));
  assert.deepEqual(steps.slice(0, 4), ['steer', 'jump', 'grab', 'checkout']);
  assert.equal(steps.at(-1), 'done');
  assert.ok(g.won && t < 30, `${t.toFixed(1)} s`);
});

test('even without touching anything the tutorial ends: crashes cost nothing, missed things come round again', () => {
  const { steps, t, g } = ride(() => ({ steer: 0 }));
  assert.equal(steps.at(-1), 'done');
  assert.ok(t < 45, `${t.toFixed(1)} s`);
  assert.equal(g.lives, g.maxLives);
});

test('something off the list on the way to the checkout: the drop lesson', () => {
  const { steps } = ride((g, now) => ({ steer: 0, drop: now === 'drop' }));
  assert.ok(steps.includes('drop'));
  assert.equal(steps.at(-1), 'done');
});
