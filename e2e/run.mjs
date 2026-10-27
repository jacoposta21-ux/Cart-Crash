// End-to-end checks in headless Chromium (no test framework).
// Runs against dist/ and dist-crazygames/ (`npm run test:e2e` builds both).
//   - menu, ride, pause, end screen and settings on a phone, a landscape phone and a desktop
//   - nothing scrolls, every button is at least 44px, no console errors
//   - keyboard and touch steering, language switch, storage blocked
//   - the CrazyGames build against a fake SDK: init, loading, gameplay start/stop, mute, locale
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from '../scripts/serve.mjs';
import { ROOT } from '../scripts/lib/util.mjs';

const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const SHOTS = join(ROOT, 'e2e', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const failures = [];
let passes = 0;
const check = (cond, msg) => { if (cond) passes++; else { failures.push(msg); console.log(`  ✗ ${msg}`); } };
const log = (msg) => console.log(msg);

async function audit(page, label) {
  const res = await page.evaluate(() => {
    const out = { scroll: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1, small: [], clipped: [] };
    for (const el of document.querySelectorAll('a, button, select')) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width === 0 || s.visibility === 'hidden' || el.closest('[hidden]')) continue;
      if (r.width < 44 || r.height < 44) out.small.push(`${el.id || el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1 || r.left < -1) out.clipped.push(el.id || el.textContent.trim().slice(0, 20));
    }
    return out;
  });
  check(!res.scroll, `${label}: page scrolls`);
  check(res.small.length === 0, `${label}: small tap targets ${res.small.join(', ')}`);
  check(res.clipped.length === 0, `${label}: buttons outside the frame ${res.clipped.join(', ')}`);
}

const frames = (page, n, dt = 1 / 30) => page.evaluate(([k, d]) => { for (let i = 0; i < k; i++) window.__cc.frame(d); }, [n, dt]);
const visible = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && !el.closest('[hidden]') && el.getBoundingClientRect().height > 0; }, sel);

const server = await startServer(8097, join(ROOT, 'dist'));
const serverCg = await startServer(8098, join(ROOT, 'dist-crazygames'));
const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

const VIEWPORTS = [
  ['phone', { width: 360, height: 640 }, true],
  ['phone-landscape', { width: 740, height: 360 }, true],
  ['desktop', { width: 1280, height: 720 }, false],
];

for (const [name, viewport, touch] of VIEWPORTS) {
  log(`\n▶ web build, ${name} ${viewport.width}x${viewport.height}`);
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:8097/?test&manual&seed=7');
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
  await frames(page, 10);
  check(await visible(page, '#btn-play'), `${name}: Play button visible`);
  check((await page.textContent('#btn-play')).trim() === 'Play', `${name}: English menu`);
  check(await page.evaluate(() => document.querySelectorAll('#legend li img').length === 5), `${name}: legend shows the five items`);
  await audit(page, `${name} menu`);
  await page.screenshot({ path: join(SHOTS, `${name}-menu.png`) });

  // Ride.
  await page.click('#btn-play');
  check(await page.evaluate(() => window.__cc.mode) === 'play', `${name}: Play starts a ride`);
  check(await visible(page, '#hud'), `${name}: HUD visible`);
  check(await visible(page, '#touch') === touch, `${name}: touch arrows only on touch screens`);
  await frames(page, 30);
  const x0 = await page.evaluate(() => window.__cc.game.cart.x);
  if (touch) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: viewport.width - 30, y: viewport.height / 2 }] });
    await frames(page, 15);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.keyboard.down('ArrowRight');
    await frames(page, 15);
    await page.keyboard.up('ArrowRight');
  }
  const x1 = await page.evaluate(() => window.__cc.game.cart.x);
  check(x1 > x0 + 0.3, `${name}: steering right moves the cart right (${x0.toFixed(2)} → ${x1.toFixed(2)})`);
  await page.evaluate(() => window.__cc.run(25));
  await frames(page, 10);
  const hud = await page.evaluate(() => ({ score: document.querySelector('#hud-score').textContent, mult: document.querySelector('#hud-mult').textContent, dist: document.querySelector('#hud-dist').textContent, lives: document.querySelectorAll('#hud-lives .life').length }));
  check(parseInt(hud.score.replace(/\D/g, ''), 10) > 100, `${name}: score counts up (${hud.score})`);
  check(/^×\d+\.\d$/.test(hud.mult), `${name}: multiplier shown (${hud.mult})`);
  check(/\d+ m$/.test(hud.dist), `${name}: distance shown (${hud.dist})`);
  check(hud.lives === 3, `${name}: three lives shown`);
  await audit(page, `${name} ride`);
  await page.screenshot({ path: join(SHOTS, `${name}-ride.png`) });

  // Pause and resume.
  if (touch) await page.click('#btn-pause'); else await page.keyboard.press('Escape');
  check(await page.evaluate(() => window.__cc.mode) === 'paused', `${name}: pause`);
  check(await visible(page, '#screen-pause'), `${name}: pause screen visible`);
  await audit(page, `${name} pause`);
  await page.click('#btn-resume');
  check(await page.evaluate(() => window.__cc.mode) === 'play', `${name}: resume`);

  // The end.
  await page.evaluate(() => window.__cc.crashOut());
  await frames(page, 70);
  check(await page.evaluate(() => window.__cc.mode) === 'end', `${name}: the third crash ends the ride`);
  await page.waitForTimeout(1000);
  check(await visible(page, '#screen-end'), `${name}: end screen visible`);
  const end = await page.evaluate(() => ({ score: document.querySelector('#end-score').textContent, dist: document.querySelector('#end-dist').textContent, best: localStorage.getItem('cartcrash:best') }));
  check(parseInt(end.score.replace(/\D/g, ''), 10) > 0 && Number(end.best) > 0, `${name}: score shown and saved (${end.score}, best ${end.best})`);
  check(/\d+ m/.test(end.dist), `${name}: distance on the end screen`);
  await audit(page, `${name} end`);
  await page.screenshot({ path: join(SHOTS, `${name}-end.png`) });
  await page.click('#btn-again');
  check(await page.evaluate(() => window.__cc.mode) === 'play', `${name}: Play again starts a new ride`);
  await page.evaluate(() => window.__cc.pause());
  await page.click('#btn-quit');
  check(await page.evaluate(() => window.__cc.mode) === 'menu', `${name}: back to the menu`);
  check((await page.textContent('#menu-records')).includes('Best'), `${name}: the record is on the menu`);

  // Settings and languages.
  await page.click('#btn-settings');
  check(await visible(page, '#screen-settings'), `${name}: settings open`);
  await audit(page, `${name} settings`);
  await page.selectOption('#set-lang', 'it');
  await page.waitForFunction(() => document.querySelector('#btn-settings-done').textContent === 'Fatto');
  await page.click('#btn-settings-done');
  check((await page.textContent('#btn-play')).trim() === 'Gioca', `${name}: Italian after switching`);
  for (const [lang, play] of [['fr', 'Jouer'], ['es', 'Jugar'], ['de', 'Spielen'], ['pt', 'Jogar'], ['en', 'Play']]) {
    await page.click('#btn-settings');
    await page.selectOption('#set-lang', lang);
    await page.waitForFunction((p) => document.querySelector('#btn-play').textContent.trim() === p, play);
    await page.click('#btn-settings-done');
    await audit(page, `${name} menu ${lang}`);
    check((await page.textContent('#btn-play')).trim() === play, `${name}: ${lang} menu`);
  }
  check(errors.length === 0, `${name}: console errors ${errors.join(' | ')}`);
  await ctx.close();
}

log('\n▶ storage blocked');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8097/?test&manual');
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
  await page.click('#btn-play');
  await page.evaluate(() => { window.__cc.run(5); window.__cc.frame(); });
  check(await page.evaluate(() => window.__cc.mode) === 'play', 'storage blocked: the game still plays');
  check(errors.length === 0, `storage blocked: errors ${errors.join(' | ')}`);
  await ctx.close();
}

log('\n▶ privacy page and links');
{
  const res = await fetch('http://127.0.0.1:8097/privacy.html');
  const html = await res.text();
  check(res.ok && html.includes('info@eyeball.cloud'), 'privacy.html is served with the contact address');
  for (const dir of ['dist', 'dist-crazygames']) {
    for (const f of ['index.html', 'privacy.html']) {
      const src = readFileSync(join(ROOT, dir, f), 'utf8');
      const external = [...src.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /^(https?:)?\/\//.test(h));
      check(external.length === 0, `${dir}/${f}: no links to other sites (${external.join(', ')})`);
    }
  }
}

log('\n▶ CrazyGames build with a fake SDK (it-IT, muted)');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
  await ctx.route('https://sdk.crazygames.com/crazygames-sdk-v3.js', (route) => route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(ROOT, 'e2e', 'fake-crazygames-sdk.js'), 'utf8') }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:8098/?test&manual&seed=3');
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
  const calls = () => page.evaluate(() => [...window.__sdkCalls]);
  let c = await calls();
  check(c[0] === 'init', 'portal: init first');
  check(c.indexOf('loadingStart') > 0 && c.indexOf('loadingStop') > c.indexOf('loadingStart'), `portal: loadingStart then loadingStop (${c.join(',')})`);
  check(!c.includes('gameplayStart'), 'portal: no gameplay on the menu');
  check((await page.textContent('#btn-play')).trim() === 'Gioca', 'portal: language from user.systemInfo.locale (it-IT)');
  check(await page.evaluate(() => window.__cc.portalMuted()) === true, 'portal: settings.muteAudio respected');
  await page.evaluate(() => window.__sdkSetMute(false));
  check(await page.evaluate(() => window.__cc.portalMuted()) === false, 'portal: addSettingsChangeListener unmutes');
  await page.click('#btn-play');
  c = await calls();
  check(c[c.length - 1] === 'gameplayStart', 'portal: gameplayStart when the ride starts');
  await page.keyboard.press('Escape');
  c = await calls();
  check(c[c.length - 1] === 'gameplayStop', 'portal: gameplayStop on pause');
  await page.click('#btn-resume');
  c = await calls();
  check(c[c.length - 1] === 'gameplayStart', 'portal: gameplayStart on resume');
  await page.evaluate(() => { window.__cc.run(10); window.__cc.crashOut(); });
  await frames(page, 70);
  c = await calls();
  check(await page.evaluate(() => window.__cc.mode) === 'end' && c[c.length - 1] === 'gameplayStop', 'portal: gameplayStop at the end of the ride');
  const html = readFileSync(join(ROOT, 'dist-crazygames', 'index.html'), 'utf8');
  check(html.includes('https://sdk.crazygames.com/crazygames-sdk-v3.js'), 'portal: the CrazyGames build loads SDK v3');
  check(!readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8').includes('crazygames-sdk'), 'web: the web build does not load the SDK');
  check(errors.length === 0, `portal: console errors ${errors.join(' | ')}`);
  await ctx.close();
}

await browser.close();
server.close();
serverCg.close();
console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
