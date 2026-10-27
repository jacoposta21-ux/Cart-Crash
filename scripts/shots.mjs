import { chromium } from 'playwright-core';
import { startServer } from '/home/user/Cart-Crash/scripts/serve.mjs';
const server = await startServer(8111);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const out = process.argv[2] || '/tmp/claude-0/-home-user/29cdfb8f-b8aa-5c0f-a3e6-27ea4a6183dd/scratchpad';
for (const [name, vp, touch] of [['desk', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('http://127.0.0.1:8111/?test&seed=7');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}-menu.png` });
  await page.evaluate(() => window.__cc.start(false));
  await page.evaluate(() => window.__cc.run(14));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}-play.png` });
  await page.evaluate(() => window.__cc.run(30));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}-play2.png` });
  await page.evaluate(() => window.__cc.run(30));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}-end.png` });
  console.log(name, errs);
}
await browser.close(); server.close();
