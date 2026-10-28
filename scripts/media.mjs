// Store materials, rendered from the game itself (build dist/ first):
//   crazygames/cover-1920x1080.png    landscape cover
//   crazygames/cover-800x1200.png     portrait cover (2:3)
//   crazygames/cover-800x800.png      square cover
//   playgama/cover-800x800.png        square cover for Playgama (its 1920x1080 and
//   1080x1920 covers are the artwork in brand/cover-art-*.webp, cropped to size)
// Usage: node scripts/media.mjs covers
// The preview videos come from scripts/trailer.mjs.
// The icons in assets/ come from the logo (brand/logo-transparent.png).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { ROOT } from './lib/util.mjs';

const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const want = process.argv.slice(2);
const all = want.length === 0;
const SEED = 572; // a race with a red light and its crowd, a dog, a jump and the checkout, all within 30 s
for (const d of ['crazygames', 'playgama']) mkdirSync(join(ROOT, d), { recursive: true });
mkdirSync(join(ROOT, 'assets'), { recursive: true });

const server = await startServer(8121, join(ROOT, 'dist'));
const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(viewport, query) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:8121/?test&manual&seed=${SEED}${query}`);
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
  await page.evaluate(() => document.fonts.ready);
  return page;
}

if (all || want.includes('covers')) {
  const COVERS = { crazygames: [[1920, 1080], [800, 1200], [800, 800]], playgama: [[800, 800]] };
  for (const [dir, w, h] of Object.entries(COVERS).flatMap(([d, sizes]) => sizes.map(([w, h]) => [d, w, h]))) {
    const page = await open({ width: w, height: h }, '');
    await page.evaluate((s) => window.__cc.poster(s, true), 12.9);
    await page.screenshot({ path: join(ROOT, dir, `cover-${w}x${h}.png`) });
    console.log(`${dir}: cover ${w}x${h}`);
    await page.close();
  }
}

await browser.close();
server.close();
