// The store trailer, recorded frame by frame from the game itself (build dist/ first):
//   crazygames/preview-1920x1080.mp4   landscape
//   crazygames/preview-1080x1620.mp4   portrait (2:3)
// One staged race (scripts/trailer-stage.mjs) told in order, with captions:
// logo card, grab the list, jump, the dog, the red light, the train, the
// checkout, logo card. The waits at the light and the crossing run faster.
// Usage: node scripts/trailer.mjs [landscape|portrait]
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { ROOT } from './lib/util.mjs';
import { SEED, STAGE, captionFor } from './trailer-stage.mjs';

const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const FPS = 30;
const SPEED = 1.2; // played a little faster than recorded: ~30 s, and more lively
const INTRO = 1.8, OUTRO = 2.4, END_CARD = 1.3; // seconds of the game's own end screen (with the time)
const formats = { landscape: [1920, 1080], portrait: [1080, 1620], draft: [640, 360] };
const which = process.argv[2] ? [process.argv[2]] : Object.keys(formats);

const server = await startServer(8135, join(ROOT, 'dist'));
const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

for (const fmt of which) {
  const [w, h] = formats[fmt];
  const file = join(ROOT, 'crazygames', `preview-${w}x${h}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SPEED), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '19', '-r', String(FPS), '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  let frames = 0;
  const shoot = async (page) => {
    const jpg = await page.screenshot({ type: 'jpeg', quality: 93 });
    frames++;
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
  };

  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:8135/?test&manual&autopilot&policy=trailer&seed=${SEED}`);
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
  await page.evaluate(() => document.fonts.ready);
  const card = (text, scale) => page.evaluate(([t, s]) => {
    const c = document.getElementById('card');
    c.hidden = false;
    document.getElementById('card-text').textContent = t;
    c.querySelector('img').style.transform = `scale(${s}) rotate(${(1 - s) * -20}deg)`;
  }, [text, scale]);

  // Intro: the logo pops in.
  for (let i = 0; i < INTRO * FPS; i++) {
    const k = Math.min(1, i / (0.45 * FPS));
    await card('Race down the hill. Fill your list. Beat the clock.', 0.6 + 0.4 * (1 - (1 - k) ** 3) + (k >= 1 ? Math.sin(i / 6) * 0.01 : 0));
    await shoot(page);
  }
  // The race.
  await page.evaluate((stage) => {
    document.documentElement.classList.add('clean');
    window.__cc.start();
    window.__cc.stage(stage);
    document.getElementById('card').hidden = true;
  }, STAGE);
  let wait = 0, onEnd = 0;
  for (;;) {
    const state = await page.evaluate(() => {
      const g = window.__cc.game;
      // the caption rules live in trailer-stage.mjs; mirrored here through the game state
      window.__cc.frame(1 / 30);
      return { y: g.cart.y, v: g.cart.v, won: g.won, over: g.over, t: g.t, checkoutY: g.checkoutY, dogs: g.dogs.length, mode: window.__cc.mode };
    });
    const caption = captionFor({ cart: { y: state.y }, won: state.won, checkoutY: state.checkoutY, dogs: { length: state.dogs } });
    await page.evaluate((c) => window.__cc.caption(c), caption);
    // Waiting at the light or the crossing: keep one frame in five.
    const waiting = state.v < 2.5 && !state.over;
    wait = waiting ? wait + 1 : 0;
    if (!waiting || wait % 5 === 0) await shoot(page);
    if (state.mode === 'end') onEnd++;
    if (onEnd > END_CARD * FPS || state.t > 70) break;
  }
  // Outro.
  await page.evaluate(() => window.__cc.caption(''));
  for (let i = 0; i < OUTRO * FPS; i++) {
    const k = Math.min(1, i / (0.4 * FPS));
    await card('Play now!', 0.7 + 0.3 * (1 - (1 - k) ** 3));
    await shoot(page);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`${fmt}: ${(frames / FPS / SPEED).toFixed(1)} s → ${file}`);
  await page.close();
}

await browser.close();
server.close();
