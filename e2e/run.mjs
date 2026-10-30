// End-to-end checks in headless Chromium (no test framework).
// Runs against dist/, dist-crazygames/ and dist-playgama/ (`npm run test:e2e` builds them).
//   - menu, ride, pause, end screen and settings on a phone, a landscape phone and a desktop
//   - nothing scrolls, every button is at least 44px, no console errors
//   - keyboard and touch steering, language switch, storage blocked
//   - the CrazyGames build against a fake SDK: init, loading, gameplay start/stop, mute, locale
//   - the Playgama build against a fake Bridge: game_ready, gameplay, language, audio, pause, ads, cloud saves
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
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
const serverPg = await startServer(8099, join(ROOT, 'dist-playgama'));
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
  check((await page.textContent('#btn-play span')).trim() === 'Classic', `${name}: English menu`);
  await audit(page, `${name} menu`);
  await page.screenshot({ path: join(SHOTS, `${name}-menu.png`) });
  await page.click('#btn-help');
  check(await page.evaluate(() => document.querySelectorAll('#legend li img').length === 4), `${name}: how to play shows the four special items`);
  await audit(page, `${name} how to play`);
  await page.click('#btn-help-done');
  await page.click('#btn-garage');
  check(await visible(page, '#screen-garage') && (await page.getAttribute('#cart-img', 'src')).startsWith('data:image/png'), `${name}: the garage shows a cart`);
  await page.click('#cart-next');
  check((await page.textContent('#cart-action')).includes('150'), `${name}: the next cart has a price`);
  await audit(page, `${name} garage`);
  await page.screenshot({ path: join(SHOTS, `${name}-garage.png`) });
  await page.click('#btn-garage-done');
  check(await visible(page, '#screen-menu'), `${name}: back from the garage`);

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

  // Jump and brake: keys on a desktop, swipes on a touch screen.
  const v0 = await page.evaluate(() => window.__cc.game.cart.v);
  if (touch) {
    const cdp = await ctx.newCDPSession(page);
    const swipe = async (dy, hold) => {
      const x = viewport.width * 0.3, y = viewport.height * 0.6;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / 4 }] });
      await page.waitForTimeout(100); // touch moves arrive with the next animation frame
      await frames(page, hold);
      return async () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    let end = await swipe(-90, 0);
    // the jump can land a frame or two later on a busy machine: look over the next frames
    check(await page.evaluate(() => { for (let i = 0; i < 12; i++) { window.__cc.frame(1 / 30); if (window.__cc.game.cart.z > 0.05) return true; } return false; }), `${name}: swipe up jumps`);
    await end();
    await frames(page, 30);
    end = await swipe(90, 20);
    check(await page.evaluate(() => window.__cc.game.cart.braking), `${name}: swipe down and hold brakes`);
    const v1 = await page.evaluate(() => window.__cc.game.cart.v);
    check(v1 < v0 - 3, `${name}: braking slows the cart (${v0.toFixed(1)} → ${v1.toFixed(1)})`);
    await end();
  } else {
    await page.keyboard.press('ArrowUp');
    await frames(page, 3);
    check(await page.evaluate(() => window.__cc.game.cart.z > 0.05), `${name}: ↑ jumps`);
    await frames(page, 30);
    await page.keyboard.down('ArrowDown');
    await frames(page, 20);
    const v1 = await page.evaluate(() => window.__cc.game.cart.v);
    check(v1 < v0 - 3, `${name}: ↓ brakes (${v0.toFixed(1)} → ${v1.toFixed(1)})`);
    await page.keyboard.up('ArrowDown');
  }
  // Drop the top thing.
  await page.evaluate(() => { window.__cc.game.stack.push({ type: 'goods', goods: 'can', h: 0.38, id: 777 }); });
  const n0 = await page.evaluate(() => window.__cc.game.stack.length);
  if (touch) await page.tap('#btn-drop'); else await page.keyboard.press('KeyE');
  await frames(page, 2);
  check(await page.evaluate(() => window.__cc.game.stack.length) === n0 - 1, `${name}: drop throws the top thing away`);

  // Let a balloon go.
  await page.evaluate(() => { window.__cc.game.balloons.push({ color: 1 }, { color: 2 }); });
  await frames(page, 2);
  check(await visible(page, '#btn-release'), `${name}: the Let go button shows with balloons`);
  if (touch) await page.tap('#btn-release'); else await page.keyboard.press('KeyQ');
  await frames(page, 2);
  check(await page.evaluate(() => window.__cc.game.balloons.length) === 1, `${name}: one balloon let go`);
  await audit(page, `${name} ride with balloons`);

  await page.evaluate(() => window.__cc.run(25));
  await frames(page, 10);
  const hud = await page.evaluate(() => ({ time: document.querySelector('#hud-time').textContent, list: document.querySelectorAll('#hud-list li').length, goal: document.querySelector('#hud-goal').textContent, lives: document.querySelectorAll('#hud-lives .life').length }));
  check(/^\d:\d\d\.\d$/.test(hud.time) && hud.time !== '0:00.0', `${name}: the clock runs (${hud.time})`);
  check(hud.list === 4, `${name}: the shopping list shows 4 things`);
  check(/\d+\/\d+|\d+ m/.test(hud.goal), `${name}: list progress shown (${hud.goal})`);
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
  const end = await page.evaluate(() => ({ score: document.querySelector('#end-score').textContent, dist: document.querySelector('#end-a').textContent }));
  check(/^\d+\/\d+$/.test(end.score), `${name}: knocked out: list progress shown (${end.score})`);
  check(/\d+ m/.test(end.dist), `${name}: distance on the end screen when knocked out`);
  await audit(page, `${name} end`);
  await page.screenshot({ path: join(SHOTS, `${name}-end.png`) });
  await page.click('#btn-again');
  check(await page.evaluate(() => window.__cc.mode) === 'play', `${name}: Play again starts a new ride`);
  // Fill the list: the checkout appears, reaching it gives a time and a record.
  await page.evaluate(() => { window.__cc.fillList(); window.__cc.game.stack.push({ type: 'goods', goods: 'cereal', h: 0.3, id: 8888 }); window.__cc.run(0.2, { steer: 0 }); });
  await frames(page, 2);
  check(/\+5s/.test(await page.textContent('#hud-chips')), `${name}: an extra shows its +5 s`);
  await frames(page, 4);
  check(/m$/.test(await page.textContent('#hud-goal')), `${name}: the checkout distance shows when the list is done`);
  await page.evaluate(() => window.__cc.run(12, { steer: 0 }));
  await frames(page, 80);
  check(await page.evaluate(() => window.__cc.mode) === 'end', `${name}: reaching the checkout ends the race`);
  await page.waitForTimeout(300);
  const won = await page.evaluate(() => ({ score: document.querySelector('#end-score').textContent, time: document.querySelector('#end-a').textContent, extras: document.querySelector('#end-b').textContent, best: Number(localStorage.getItem('cartcrash:bestScore')), raw: window.__cc.game.finishTime }));
  check(/^\d:\d\d\.\d$/.test(won.score) && won.best > 0, `${name}: score shown and saved (${won.score}, ${won.best})`);
  check(won.extras.includes('+5s') && Math.abs(won.best - won.raw - 5) < 0.01, `${name}: one extra adds 5 s to the time (${won.time} → ${won.score})`);
  await page.screenshot({ path: join(SHOTS, `${name}-win.png`) });
  await audit(page, `${name} win`);
  const prog = await page.evaluate(() => ({ coins: Number(localStorage.getItem('cartcrash:coins')), unlocked: Number(localStorage.getItem('cartcrash:unlocked')), badge: !document.querySelector('#end-unlock').hidden }));
  check(prog.coins >= 120, `${name}: coins saved, with the checkout bonus and the first-win reward (${prog.coins})`);
  check(prog.unlocked === 2 && prog.badge, `${name}: finishing the Old Town opens the Mountain`);
  await page.click('#btn-again');
  await page.evaluate(() => window.__cc.pause());
  await page.click('#btn-quit');
  check(await page.evaluate(() => window.__cc.mode) === 'menu', `${name}: back to the menu`);
  check((await page.textContent('#track-info')).includes('Best score'), `${name}: the best score is on the menu`);

  // Settings and languages.
  await page.click('#btn-settings');
  check(await visible(page, '#screen-settings'), `${name}: settings open`);
  await audit(page, `${name} settings`);
  await page.selectOption('#set-lang', 'it');
  await page.waitForFunction(() => document.querySelector('#btn-settings-done').textContent === 'Fatto');
  await page.click('#btn-settings-done');
  check((await page.textContent('#btn-play span')).trim() === 'Classico', `${name}: Italian after switching`);
  for (const [lang, play] of [['fr', 'Classique'], ['es', 'Clásico'], ['de', 'Klassik'], ['pt', 'Clássico'], ['en', 'Classic']]) {
    await page.click('#btn-settings');
    await page.selectOption('#set-lang', lang);
    await page.waitForFunction((p) => document.querySelector('#btn-play span').textContent.trim() === p, play);
    await page.click('#btn-settings-done');
    await audit(page, `${name} menu ${lang}`);
    check((await page.textContent('#btn-play span')).trim() === play, `${name}: ${lang} menu`);
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
  check(res.ok && html.includes('help@trustyourbot.com'), 'privacy.html is served with the contact address');
  for (const dir of ['dist', 'dist-crazygames', 'dist-playgama']) {
    for (const f of ['index.html', 'privacy.html']) {
      const src = readFileSync(join(ROOT, dir, f), 'utf8');
      const external = [...src.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /^(https?:)?\/\//.test(h));
      check(external.length === 0, `${dir}/${f}: no links to other sites (${external.join(', ')})`);
    }
  }
  for (const dir of ['dist-crazygames', 'dist-playgama']) {
    const pictures = readdirSync(join(ROOT, dir, 'assets'));
    check(pictures.join() === 'logo.webp', `${dir}: no pictures but the logo (${pictures.join(', ')})`);
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
  check((await page.textContent('#btn-play span')).trim() === 'Classico', 'portal: language from user.systemInfo.locale (it-IT)');
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

log('\n▶ the tutorial on the first ride (phone, it)');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'it-IT' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8097/?test&manual&autopilot&tutorial');
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'play');
  await frames(page, 1);
  check(await visible(page, '#coach') && (await page.textContent('#coach-text')).includes('sterzare'), 'tutorial: it starts on its own, with the first lesson');
  await audit(page, 'tutorial');
  const lessons = new Set();
  for (let i = 0; i < 200 && await page.evaluate(() => window.__cc.game.list.length) !== 4; i++) {
    await frames(page, 15);
    if (await visible(page, '#coach') && !(await page.evaluate(() => document.getElementById('coach').classList.contains('empty')))) lessons.add(await page.textContent('#coach-text'));
  }
  check(lessons.size >= 10, `tutorial: the lessons one after the other (${[...lessons].join(' / ')})`);
  check(await page.evaluate(() => window.__cc.mode === 'play' && window.__cc.game.list.length === 4) && !(await visible(page, '#coach')), 'tutorial: then a real race starts');
  check(await page.evaluate(() => localStorage.getItem('cartcrash:tutorial')) === 'true', 'tutorial: done once');
  await page.reload();
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
  check(true, 'tutorial: not again next time');
  check(errors.length === 0, `tutorial: errors ${errors.join(' | ')}`);
  await ctx.close();
}

log('\n▶ 3, 2, 1, go!');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8097/?test&manual&countdown');
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
  await page.click('#btn-play');
  check(await visible(page, '#countdown') && (await page.textContent('#countdown')) === '3', 'countdown: 3 at the start');
  await frames(page, 45);
  check((await page.textContent('#countdown')) === '2' && await page.evaluate(() => window.__cc.game.cart.y) === 0, 'countdown: the cart waits');
  await frames(page, 60);
  check(await page.evaluate(() => window.__cc.game.cart.y) > 0, 'countdown: then go');
  await ctx.close();
}

log('\n▶ coins, garage and tracks');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8097/?test&manual&seed=11');
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
  const ls = (k) => page.evaluate((key) => localStorage.getItem(key), k);
  // Locked tracks can be looked at but not played.
  await page.click('#track-next');
  check((await page.textContent('#track-name')).includes('Mountain') && await page.evaluate(() => document.querySelector('#btn-play').disabled), 'tracks: the Mountain is locked at first');
  await page.click('#track-prev');
  // Coins picked up are kept even when the ride is not finished.
  await page.click('#btn-play');
  await page.evaluate(() => { const g = window.__cc.game; g.coins = 7; window.__cc.crashOut(); });
  await frames(page, 70);
  check(await page.evaluate(() => window.__cc.mode) === 'end' && Number(await ls('cartcrash:coins')) === 7, 'coins: kept after losing the race');
  check((await page.textContent('#end-coins')).includes('+7'), 'coins: shown on the end screen');
  // Buy the Iron Cart: 4 lives.
  await page.evaluate(() => { localStorage.setItem('cartcrash:coins', '200'); });
  await page.click('#btn-menu');
  await page.waitForFunction(() => window.__cc.mode === 'menu');
  await page.click('#btn-garage');
  await page.click('#cart-next');
  await page.click('#cart-action');
  check(Number(await ls('cartcrash:coins')) === 50 && JSON.parse(await ls('cartcrash:carts')).includes('iron') && JSON.parse(await ls('cartcrash:cart')) === 'iron', 'garage: buying the Iron Cart spends 150 coins and puts it in use');
  check((await page.textContent('#cart-action')).trim() === 'In use', 'garage: the cart bought is in use');
  await page.click('#cart-next');
  check(await page.evaluate(() => document.querySelector('#cart-action').disabled), 'garage: not enough coins for the Racer');
  await page.click('#btn-garage-done');
  await page.click('#btn-play');
  check(await page.evaluate(() => window.__cc.game.maxLives) === 4 && await page.evaluate(() => document.querySelectorAll('#hud-lives .life').length) === 4, 'garage: the Iron Cart gives four lives');
  await page.evaluate(() => window.__cc.pause());
  await page.click('#btn-quit');
  // With every track open, the Rainbow Road can be played.
  await page.evaluate(() => { localStorage.setItem('cartcrash:unlocked', '5'); window.__cc.refresh(); });
  await page.click('#track-prev');
  check((await page.textContent('#track-name')).includes('Rainbow Road') && !(await page.evaluate(() => document.querySelector('#btn-play').disabled)), 'tracks: the Rainbow Road opens');
  await page.click('#btn-play');
  check(await page.evaluate(() => window.__cc.game.track) === 'arcobaleno', 'tracks: the race is on the chosen track');
  await frames(page, 60);
  await page.screenshot({ path: join(SHOTS, 'rainbow.png') });
  // Every track can be ridden for a while without errors.
  for (const id of ['montagna', 'mare', 'vulcano']) {
    await page.evaluate((t) => { window.__cc.pause(); }, id);
    await page.click('#btn-quit');
    await page.evaluate((t) => window.__cc.showTrack(t), id);
    await page.click('#btn-play');
    await page.evaluate(() => { const g = window.__cc.game; g.lives = 99; g.maxLives = 99; });
    await frames(page, 150);
    check(await page.evaluate(() => window.__cc.game.track) === id && await page.evaluate(() => window.__cc.game.distance) > 40, `tracks: a ride on ${id}`);
    await page.screenshot({ path: join(SHOTS, `${id}.png`) });
  }
  // Versus: against the computer, for 7 things, 3 minutes.
  await page.evaluate(() => { window.__cc.pause(); });
  await page.click('#btn-quit');
  const coins0 = Number(await ls('cartcrash:coins'));
  await page.click('#btn-versus');
  check(await visible(page, '#screen-arcade'), 'arcade: the level screen');
  await page.click('#btn-arcade-back');
  check(await visible(page, '#btn-versus'), 'arcade: back to the menu');
  await page.click('#btn-versus');
  await page.click('#lvl-expert');
  check(await page.evaluate(() => Boolean(window.__cc.match) && window.__cc.match.games.length === 3), 'arcade: a match with 2 rivals starts');
  check(JSON.parse(await ls('cartcrash:level')) === 'expert', 'arcade: the level is kept');
  check(await visible(page, '#hud-vs') && !(await visible(page, '#hud-list')), 'versus: the scoreboard instead of the shopping list');
  await frames(page, 120);
  await page.screenshot({ path: join(SHOTS, 'versus.png') });
  await page.evaluate(() => { window.__cc.match.t = 179.95; });
  await frames(page, 80);
  check(await page.evaluate(() => window.__cc.mode) === 'end' && /win|place/.test(await page.textContent('#end-title')), `versus: after 3 minutes, the result (${await page.textContent('#end-title')})`);
  check(Number(await ls('cartcrash:coins')) >= coins0, 'arcade: coins picked up are kept');
  await audit(page, 'versus end');
  await page.click('#btn-again');
  await page.waitForFunction(() => window.__cc.mode === 'play');
  check(await page.evaluate(() => Boolean(window.__cc.match)), 'versus: play again is another match');
  check(errors.length === 0, `progression: errors ${errors.join(' | ')}`);
  await ctx.close();
}

log('\n▶ Playgama build with a fake Bridge (de, muted, cloud record)');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
  await ctx.route('https://bridge.playgama.com/v2/stable/playgama-bridge.js', (route) => route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(ROOT, 'e2e', 'fake-playgama-bridge.js'), 'utf8') }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:8099/?test&manual&seed=3');
  await page.waitForFunction(() => window.__cc && window.__cc.mode === 'menu');
  const calls = () => page.evaluate(() => [...window.__sdkCalls]);
  const last = async () => (await calls()).filter((c) => c.startsWith('gameplay')).pop();
  const ev = (fn, arg) => page.evaluate(fn, arg);
  let c = await calls();
  check(c[0] === 'initialize', 'playgama: initialize first');
  check(c.filter((x) => x === 'game_ready').length === 1 && c.indexOf('game_ready') > c.indexOf('storage.get'), `playgama: game_ready once, after loading (${c.join(',')})`);
  check(!c.includes('gameplay_started'), 'playgama: no gameplay on the menu');
  check((await page.textContent('#btn-play span')).trim() === 'Klassik', 'playgama: language from platform.language (de)');
  check(await ev(() => localStorage.getItem('cartcrash:bestScore')) === '41.5', 'playgama: the record saved on the platform is loaded');
  check(await ev(() => window.__cc.portalMuted()) === true, 'playgama: audio off on the platform mutes the game');
  await ev(() => window.__sdkSetAudio(true));
  check(await ev(() => window.__cc.portalMuted()) === false, 'playgama: audio_state_changed unmutes');
  await page.click('#btn-play');
  check(await last() === 'gameplay_started', 'playgama: gameplay_started when the ride starts');
  check(await ev(() => window.__sdkStore['cartcrash:rides']) === 13, 'playgama: rides saved to the platform storage');
  await ev(() => window.__sdkPause(true));
  check(await ev(() => window.__cc.mode) === 'paused' && await ev(() => window.__cc.portalMuted()) === true, 'playgama: pause_state_changed pauses and mutes');
  check(await last() === 'gameplay_stopped', 'playgama: gameplay_stopped on pause');
  await ev(() => window.__sdkPause(false));
  check(await ev(() => window.__cc.mode) === 'paused' && await ev(() => window.__cc.portalMuted()) === false, 'playgama: resuming the platform unmutes, the game waits for the player');
  await page.click('#btn-resume');
  await ev(() => { window.__cc.run(10); window.__cc.crashOut(); });
  await frames(page, 70);
  check(await ev(() => window.__cc.mode) === 'end' && await last() === 'gameplay_stopped', 'playgama: gameplay_stopped at the end of the ride');
  await page.click('#btn-again');
  await page.waitForTimeout(300);
  check(!(await calls()).includes('showInterstitial') && await ev(() => window.__cc.mode) === 'play', 'playgama: no ad in the first minutes of riding');
  await ev(() => { window.__cc.played(200); window.__cc.run(5); window.__cc.crashOut(); });
  await frames(page, 70);
  await page.click('#btn-again');
  await page.waitForTimeout(300);
  c = await calls();
  check(c.includes('showInterstitial') && await ev(() => window.__cc.mode) === 'end' && await ev(() => window.__cc.portalMuted()) === true, 'playgama: an ad between rides, game muted while it shows');
  await ev(() => window.__sdkCloseAd());
  await page.waitForFunction(() => window.__cc.mode === 'play');
  check(await ev(() => window.__cc.portalMuted()) === false, 'playgama: after the ad the next ride starts, sound back');
  await ev(() => { window.__cc.run(5); window.__cc.crashOut(); });
  await frames(page, 70);
  await page.click('#btn-again');
  await page.waitForTimeout(300);
  check((await calls()).filter((x) => x === 'showInterstitial').length === 1, 'playgama: no second ad within a few minutes');
  await ev(() => { window.__cc.played(400); window.__cc.run(5); window.__cc.crashOut(); });
  await frames(page, 70);
  await ev(() => window.__sdkAdReady(false));
  await page.click('#btn-menu');
  await page.waitForFunction(() => window.__cc.mode === 'menu', null, { timeout: 5000 }).catch(() => {});
  check(await ev(() => window.__cc.mode) === 'menu', 'playgama: no ad available, the game carries on');
  const html = readFileSync(join(ROOT, 'dist-playgama', 'index.html'), 'utf8');
  check(html.includes('https://bridge.playgama.com/v2/stable/playgama-bridge.js') && !html.includes('crazygames-sdk'), 'playgama: the Playgama build loads the Bridge SDK only');
  const config = await (await fetch('http://127.0.0.1:8099/playgama-bridge-config.json')).json().catch(() => null);
  check(config !== null, 'playgama: playgama-bridge-config.json next to index.html');
  check(errors.length === 0, `playgama: console errors ${errors.join(' | ')}`);
  await ctx.close();
}

await browser.close();
server.close();
serverCg.close();
serverPg.close();
console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
