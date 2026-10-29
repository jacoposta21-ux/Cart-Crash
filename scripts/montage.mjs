// The preview videos: short gameplay clips recorded from the game itself, no
// captions, joined with quick crossfades. Every track, every cart, and Arcade
// with its three carts (build dist/ first):
//   crazygames/preview-1920x1080.mp4   landscape
//   crazygames/preview-1080x1620.mp4   portrait (2:3)
//   playgama/preview-1080x1920.mp4     portrait (9:16)
// The bot drives; each clip starts at a moment picked for its action (no
// crashes or falls in it).
// Usage: node scripts/montage.mjs [landscape|portrait|tall|draft]
/* global Buffer, localStorage */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { ROOT } from './lib/util.mjs';

const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const FPS = 30;
const FADE = 0.3; // seconds of crossfade between clips
const LOGO = 1.3; // the logo at the start and at the end
// track, cart, Arcade or not, seed, from (seconds into the race), how long
const CLIPS = process.env.CLIPS ? JSON.parse(process.env.CLIPS) : [ // CLIPS='[...]' to try others
  { track: 'borgo', cart: 'classic', seed: 17, from: 30, len: 4.4 }, // down the steps, the train goes by
  { track: 'mare', cart: 'jumbo', vs: true, seed: 28, from: 5, len: 4.2 }, // Arcade: three carts along the pier
  { track: 'montagna', cart: 'racer', seed: 22, from: 24, len: 4.2 }, // the ski slope
  { track: 'vulcano', cart: 'iron', seed: 29, from: 32.5, len: 4.2 }, // a rope bridge over the lava
  { track: 'borgo', cart: 'racer', vs: true, seed: 9, from: 12.5, len: 4.2 }, // Arcade: side by side
  { track: 'arcobaleno', cart: 'rocket', seed: 11, from: 14, len: 4.4 }, // turbo arrows
];
const formats = {
  landscape: { size: [1920, 1080], file: 'crazygames/preview-1920x1080.mp4' },
  portrait: { size: [1080, 1620], file: 'crazygames/preview-1080x1620.mp4' },
  tall: { size: [1080, 1920], file: 'playgama/preview-1080x1920.mp4' },
  draft: { size: [640, 360], file: 'draft-montage.mp4' },
};
const which = process.argv[2] ? [process.argv[2]] : ['landscape', 'portrait', 'tall'];

const server = await startServer(8137, join(ROOT, 'dist'));
const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

for (const fmt of which) {
  const { size: [w, h], file } = formats[fmt];
  const dir = mkdtempSync(join(tmpdir(), 'montage-'));
  const parts = [];

  const open = async (seed) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:8137/?test&manual&autopilot&seed=${seed}`);
    await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
    await page.evaluate(() => document.fonts.ready);
    return page;
  };
  const record = async (page, name, n, each) => {
    const out = join(dir, `${name}.mp4`);
    const shots = [];
    for (let i = 0; i < n; i++) { await each(i); shots.push(await page.screenshot({ type: 'jpeg', quality: 93 })); }
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '16', '-r', String(FPS), out], { input: Buffer.concat(shots), maxBuffer: 1 << 30 });
    if (r.status !== 0) throw new Error(String(r.stderr));
    parts.push({ out, len: n / FPS });
  };
  // The logo over the menu's ride: it pops in, or (at the end) just sits there.
  const logo = async (name, pop) => {
    const page = await open(3);
    await page.evaluate(() => { document.getElementById('screen-menu').hidden = true; document.getElementById('card-text').hidden = true; document.getElementById('card').hidden = false; });
    await record(page, name, Math.round(LOGO * FPS), (i) => page.evaluate(([k]) => {
      window.__cc.frame(1 / 30);
      const s = k < 1 ? 0.6 + 0.4 * (1 - (1 - k) ** 3) : 1 + Math.sin(k * 3) * 0.01;
      document.querySelector('#card img').style.transform = `scale(${s}) rotate(${(1 - s) * -20}deg)`;
    }, [pop ? i / (0.45 * FPS) : 1 + i / FPS]));
    await page.close();
  };

  if (!process.env.CLIPS) await logo('intro', true);
  for (const [k, c] of CLIPS.entries()) {
    const page = await open(c.seed);
    await page.evaluate(({ track, cart, vs, from }) => {
      localStorage.setItem('cartcrash:carts', JSON.stringify(['iron', 'racer', 'jumbo', 'rocket']));
      localStorage.setItem('cartcrash:cart', JSON.stringify(cart));
      localStorage.setItem('cartcrash:level', JSON.stringify('expert'));
      document.documentElement.classList.add('clean');
      window.__cc.start(track, Boolean(vs));
      window.__cc.run(Math.max(0, from - 0.8));
      for (let i = 0; i < 24; i++) window.__cc.frame(1 / 30); // the camera settles
    }, c);
    await record(page, `clip${k}`, Math.round(c.len * FPS), () => page.evaluate(() => window.__cc.frame(1 / 30)));
    await page.close();
  }
  if (!process.env.CLIPS) await logo('outro', false);

  // Join them with crossfades.
  const inputs = parts.flatMap((p) => ['-i', p.out]);
  let graph = parts.length > 1 ? '' : 'null[v];', last = '[0:v]', t = parts[0].len;
  for (let i = 1; i < parts.length; i++) {
    const outLabel = i === parts.length - 1 ? '[v]' : `[x${i}]`;
    graph += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${(t - FADE).toFixed(3)}${outLabel};`;
    last = outLabel;
    t += parts[i].len - FADE;
  }
  const target = fmt === 'draft' ? join(process.env.DRAFT_DIR || tmpdir(), file) : join(ROOT, file);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph.slice(0, -1), '-map', '[v]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '19', '-r', String(FPS), '-movflags', '+faststart', target]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  rmSync(dir, { recursive: true, force: true });
  console.log(`${fmt}: ${t.toFixed(1)} s → ${target}`);
}

await browser.close();
server.close();
