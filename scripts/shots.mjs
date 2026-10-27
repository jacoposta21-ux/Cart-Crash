// Quick look: screenshots of the menu, a ride and the end screen on a desktop
// and a phone. Usage: node scripts/shots.mjs [out-dir]   (build dist/ first)
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const out = process.argv[2] || 'e2e/screenshots';
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const server = await startServer(8111);
const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, vp, touch] of [['desk', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('http://127.0.0.1:8111/?test&manual&seed=7');
  await page.waitForFunction(() => window.__cc);
  await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__cc.frame(1 / 30); });
  await page.screenshot({ path: `${out}/${name}-menu.png` });
  await page.evaluate(() => window.__cc.start());
  for (const [label, secs] of [['play', 12], ['play2', 25]]) {
    await page.evaluate((s) => { window.__cc.run(s); for (let i = 0; i < 20; i++) window.__cc.frame(1 / 30); }, secs);
    await page.screenshot({ path: `${out}/${name}-${label}.png` });
  }
  await page.evaluate(() => { window.__cc.crashOut(); for (let i = 0; i < 90; i++) window.__cc.frame(1 / 30); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}-end.png` });
  console.log(name, errs.length ? errs : 'no errors');
}
await browser.close();
server.close();
