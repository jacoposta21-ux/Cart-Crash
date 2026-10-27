// Gameplay highlights, recorded frame by frame from the game itself (build dist/ first):
//   crazygames/highlights/<clip>-<w>x<h>.mp4   one short clip per moment
//   crazygames/preview-1920x1080.mp4          the logo menu, then all the clips (~30 s)
//   crazygames/preview-1080x1620.mp4          the same, portrait (2:3)
// Each clip is a seed and a way of driving (see POLICIES in src/bot.js) that
// reach the moment at a known time; the game is fast-forwarded to just before it.
// Usage: node scripts/highlights.mjs [landscape|portrait]
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { ROOT } from './lib/util.mjs';

const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const FPS = 30;
// seed, policy, start (s into the race), length (s)
export const CLIPS = [
  { name: 'red-light-crowd', seed: 399, policy: 'runred', start: 7.2, length: 4.5 },
  { name: 'warden-chase', seed: 231, policy: 'runred', start: 8.6, length: 5 },
  { name: 'jump-and-crash', seed: 109, policy: 'bot', start: 5.0, length: 3.6 },
  { name: 'dog-treat', seed: 2, policy: 'bot', start: 5.4, length: 5 },
  { name: 'train', seed: 397, policy: 'bot', start: 19.4, length: 5 },
  { name: 'checkout', seed: 54, policy: 'bot', start: 15.2, length: 6.2 },
];
const MENU = 2; // seconds of the menu with the logo, first

const formats = { landscape: [1920, 1080], portrait: [1080, 1620] };
const which = process.argv[2] ? [process.argv[2]] : Object.keys(formats);
const outDir = join(ROOT, 'crazygames', 'highlights');
mkdirSync(outDir, { recursive: true });

const server = await startServer(8131, join(ROOT, 'dist'));
const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

function encoder(file) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20', '-r', String(FPS), '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  return {
    async frame(jpg) { if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r)); },
    done: () => { ff.stdin.end(); return new Promise((r) => ff.on('close', r)); },
  };
}

async function record(page, file, seconds, before) {
  const enc = encoder(file);
  for (let i = 0; i < Math.round(seconds * FPS); i++) {
    if (before) await before(i);
    await page.evaluate((dt) => window.__cc.frame(dt), 1 / FPS);
    await enc.frame(await page.screenshot({ type: 'jpeg', quality: 92 }));
  }
  await enc.done();
}

for (const fmt of which) {
  const [w, h] = formats[fmt];
  const parts = [];
  // The menu, with the logo and the ride going on behind it.
  {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:8131/?test&manual&seed=1');
    await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { for (let i = 0; i < 45; i++) window.__cc.frame(1 / 30); });
    const file = join(outDir, `menu-${w}x${h}.mp4`);
    await record(page, file, MENU);
    parts.push(file);
    await page.close();
  }
  for (const clip of CLIPS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:8131/?test&manual&autopilot&policy=${clip.policy}&seed=${clip.seed}`);
    await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate((s) => {
      document.documentElement.classList.add('clean');
      window.__cc.start();
      window.__cc.run(s);
      // a few frames so the camera and the town settle before recording
      for (let i = 0; i < 3; i++) window.__cc.frame(0.0001);
    }, clip.start);
    const file = join(outDir, `${clip.name}-${w}x${h}.mp4`);
    await record(page, file, clip.length);
    console.log(`${fmt}: ${clip.name}`);
    parts.push(file);
    await page.close();
  }
  // All together: the store preview.
  const list = join(outDir, `list-${w}x${h}.txt`);
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', join(ROOT, 'crazygames', `preview-${w}x${h}.mp4`)]);
  rmSync(list);
  rmSync(join(outDir, `menu-${w}x${h}.mp4`));
  console.log(`${fmt}: preview done`);
}

await browser.close();
server.close();
