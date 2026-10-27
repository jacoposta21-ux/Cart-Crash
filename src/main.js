// Cart Crash: screens, input, the game loop, records and the CrazyGames hooks.
import { BUILD } from './build.js';
import { createGame, step, drainEvents, result, multiplier, count, handling, LIVES } from './game.js';
import { createRenderer, resizeRenderer, setGame, onEvents, render, itemIcon } from './render3d.js';
import { botSteer } from './bot.js';
import { t, initI18n, setLang, getLang, LANGS, formatNumber } from './i18n.js';
import { load, save } from './storage.js';
import * as audio from './audio.js';
import * as portal from './portal.js';
import { ITEM_NAME, GOODS_NAME, ITEM_EFFECT, LEGEND, TIPS, SECTION_TOAST } from './strings.js';

const PORTAL = BUILD.target === 'crazygames';
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const DT = 1 / 120;

const BEST_KEY = 'cartcrash:best';
const DIST_KEY = 'cartcrash:bestDistance';
const SHAKE_KEY = 'cartcrash:shake';
const RIDES_KEY = 'cartcrash:rides';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const R = createRenderer(canvas, $('fx'));
R.reduceShake = load(SHAKE_KEY, true) === false;

let mode = 'menu'; // menu | play | paused | end
let game = null;
let demo = null; // the ride behind the menu
let lastTime = 0;
let acc = 0;
let lastSection = null;
const shownTips = new Set();
let lastScoreShown = -1;
const touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touchMode) document.documentElement.classList.add('touch');

// ---------- size ----------
function resize() {
  resizeRenderer(R, window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

// ---------- input ----------
const keys = { left: false, right: false };
const pointers = new Map();
function steerInput() {
  let l = keys.left, r = keys.right;
  for (const side of pointers.values()) { if (side < 0) l = true; else r = true; }
  $('touch').querySelector('.tz-left').classList.toggle('on', l);
  $('touch').querySelector('.tz-right').classList.toggle('on', r);
  return (r ? 1 : 0) - (l ? 1 : 0);
}
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code) && mode === 'play') e.preventDefault();
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; audio.unlock(); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (mode === 'play') pause();
    else if (mode === 'paused' && $('screen-settings').hidden) resume();
  }
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
const sideOf = (x) => (x < window.innerWidth / 2 ? -1 : 1);
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (mode !== 'play') return;
  pointers.set(e.pointerId, sideOf(e.clientX));
  try { canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
});
canvas.addEventListener('pointermove', (e) => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, sideOf(e.clientX)); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, (e) => pointers.delete(e.pointerId));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => { keys.left = keys.right = false; pointers.clear(); if (mode === 'play') pause(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'play') pause(); audio.suspend(); } else audio.resume();
});

// ---------- screens ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('hud').hidden = !(mode === 'play' || mode === 'paused');
  $('touch').hidden = !(touchMode && mode === 'play');
  $('fx').hidden = mode === 'menu';
  const first = id && $(id)?.querySelector('.btn-primary');
  if (first && !touchMode) first.focus({ preventScroll: true });
}

function icon(type, size, goods) {
  const img = document.createElement('img');
  img.src = itemIcon(type, goods);
  img.alt = '';
  img.width = img.height = size;
  return img;
}

function renderMenu() {
  const best = load(BEST_KEY, 0) || 0;
  const dist = load(DIST_KEY, 0) || 0;
  $('menu-records').innerHTML = best
    ? `${t('Best: {n}', { n: `<b>${formatNumber(best)}</b>` })} · ${t('Furthest: {n} m', { n: `<b>${formatNumber(dist)}</b>` })}`
    : t('How far down can you get?');
  $('legend').replaceChildren(...LEGEND.map((type) => {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = t(ITEM_NAME[type]);
    const sp = document.createElement('span'); sp.textContent = t(ITEM_EFFECT[type]);
    li.append(icon(type, 40), b, sp);
    return li;
  }));
  $('rules').textContent = t('The fuller the cart, the more points per metre. Three crashes and it is over.');
  $('controls-help').innerHTML = touchMode
    ? t('Hold the left or right side of the screen to steer.')
    : t('Steer with {keys}', { keys: '<span class="keys"><kbd>←</kbd> <kbd>→</kbd> / <kbd>A</kbd> <kbd>D</kbd></span>' });
}

function goMenu() {
  mode = 'menu';
  portal.gameplay(false);
  audio.stopMusic();
  audio.rolling(0, false);
  game = null;
  newDemo();
  renderMenu();
  show('screen-menu');
}

function start() {
  audio.unlock();
  const seed = TEST && params.get('seed') ? Number(params.get('seed')) : (Math.random() * 2 ** 32) >>> 0;
  game = createGame(seed);
  setGame(R, game);
  lastSection = 'street';
  lastScoreShown = -1;
  acc = 0;
  pointers.clear();
  mode = 'play';
  show(null);
  updateHud(true);
  showHint(touchMode ? t('Hold left or right to steer') : t('Steer with {keys}', { keys: '← →' }), 3500);
  portal.gameplay(true);
  audio.startMusic();
  save(RIDES_KEY, (load(RIDES_KEY, 0) || 0) + 1);
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  keys.left = keys.right = false;
  pointers.clear();
  portal.gameplay(false);
  audio.stopMusic();
  audio.rolling(0, false);
  show('screen-pause');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'play';
  show(null);
  lastTime = performance.now();
  portal.gameplay(true);
  audio.startMusic();
}

function finish() {
  mode = 'end';
  portal.gameplay(false);
  audio.stopMusic();
  audio.rolling(0, false);
  const r = result(game);
  const best = load(BEST_KEY, 0) || 0;
  const isRecord = r.score > best;
  if (isRecord) save(BEST_KEY, r.score);
  if (r.distance > (load(DIST_KEY, 0) || 0)) save(DIST_KEY, r.distance);
  renderEnd(r, isRecord && best > 0);
  show('screen-end');
  if (isRecord && best > 0) { audio.record(); portal.happytime(); }
}

function endTitle(r) {
  if (r.distance < 150) return t('Short trip!');
  if (r.bestMult >= 5) return t('That is not a cart, that is a tower!');
  if (r.broken >= 3) return t('Scrambled eggs, anyone?');
  if (r.distance > 1500) return t('All the way to the sea!');
  if (r.lost > 40) return t('Half the town has your shopping now.');
  return t('What a ride!');
}

function renderEnd(r, isRecord) {
  $('end-title').textContent = endTitle(r);
  $('end-record').hidden = !isRecord;
  $('end-dist').textContent = `${formatNumber(r.distance)} m`;
  $('end-mult').textContent = `×${r.bestMult.toFixed(1)}`;
  $('end-pile').textContent = t('{n} things', { n: r.tallest });
  const best = load(BEST_KEY, 0) || 0;
  $('end-best').innerHTML = t('Best: {n}', { n: `<b>${formatNumber(best)}</b>` });
  const el = $('end-score');
  const target = r.score;
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / 900);
    el.textContent = formatNumber(Math.round(target * (1 - (1 - k) ** 3)));
    if (k < 1 && mode === 'end') requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- HUD ----------
let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1100);
}

let hintTimer = null;
function showHint(text, ms = 3200) {
  const el = $('hint');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function chip(type, text, warn) {
  const c = document.createElement('span');
  c.className = `chip${warn ? ' warn' : ''}`;
  c.append(icon(type, 26), text);
  return c;
}

let chipsKey = '';
let livesShown = -1;
function updateHud(force) {
  const g = game;
  const score = Math.floor(g.score);
  if (force || score !== lastScoreShown) { $('hud-score').textContent = formatNumber(score); lastScoreShown = score; }
  const m = multiplier(g);
  const mult = $('hud-mult');
  const mText = `×${m.toFixed(1)}`;
  if (mult.textContent !== mText) {
    mult.classList.remove('up', 'down');
    void mult.offsetWidth;
    if (!force) mult.classList.add(parseFloat(mult.textContent.slice(1)) < m ? 'up' : 'down');
    mult.textContent = mText;
  }
  $('hud-dist').textContent = `${formatNumber(Math.floor(g.distance))} m`;
  if (force || livesShown !== g.lives) {
    livesShown = g.lives;
    const lives = $('hud-lives');
    lives.replaceChildren(...Array.from({ length: LIVES }, (_, i) => {
      const s = document.createElement('i');
      s.className = i < g.lives ? 'life' : 'life lost';
      return s;
    }));
    lives.setAttribute('aria-label', t('Crashes left: {n}', { n: g.lives }));
  }
  const melons = count(g, 'melon'), balloons = g.balloons.length;
  const oil = g.cart.oil > 0 ? Math.ceil(g.cart.oil) : 0;
  const wobbly = g.wobble > 0.65 && g.stack.length > 2;
  const key = `${melons}|${balloons}|${oil}|${wobbly}|${getLang()}`;
  if (key === chipsKey && !force) return;
  chipsKey = key;
  const chips = [];
  if (melons) chips.push(chip('melon', `${t('Heavy')} ×${melons}`));
  if (balloons) chips.push(chip('balloon', `${t('Floaty')} ×${balloons}`));
  if (oil) chips.push(chip('oil', `${t('Slippery')} ${oil}s`, true));
  if (wobbly) chips.push(chip('goods', t('Wobbly!'), true));
  $('hud-chips').replaceChildren(...chips);
}

function label(kind, e) {
  if (kind === 'pickup') return t(e.item === 'goods' ? GOODS_NAME[e.goods] : ITEM_NAME[e.item]);
  if (kind === 'fall') return e.why === 'full' ? t('No room!') : t('Fell off!');
  if (kind === 'break') return t('Eggs broke!');
  if (kind === 'crash') return e.obstacle === 'walker' ? t('Sorry!') : t('Crash!');
  return '';
}

function handleEvents(g, events, live) {
  onEvents(R, g, live ? events : events.filter((e) => e.type !== 'pickup' && e.type !== 'fall' && e.type !== 'break' && e.type !== 'crash'), label);
  if (!live) return;
  for (const e of events) {
    audio.play(e);
    if (e.type === 'pickup' && !shownTips.has(e.item)) {
      if (e.item !== 'goods' || g.stack.length > 3) { shownTips.add(e.item); showHint(t(TIPS[e.item])); }
    }
    if (e.type === 'tall') toast(t('What a pile!'));
    if (e.type === 'ramp') toast(t('Wheee!'));
    if (e.type === 'dog') toast(t('Woof!'));
    if (e.type === 'crash' && e.lives === 1) showHint(t('Careful: one more crash and it is over!'), 2500);
  }
}

// ---------- loop ----------
function simulate(g, dt, steerFn, live) {
  acc += Math.min(dt, 0.1);
  while (acc >= DT) {
    acc -= DT;
    step(g, DT, steerFn());
    handleEvents(g, drainEvents(g), live);
  }
}

function newDemo() {
  demo = createGame((Math.random() * 2 ** 32) >>> 0);
  setGame(R, demo);
}

function frame(dt) {
  if (mode === 'play' && game) {
    const autopilot = params.has('autopilot');
    simulate(game, dt, () => (autopilot ? botSteer(game) : steerInput()), true);
    const sec = game.world.sectionAt(game.cart.y + 12).kind;
    if (sec !== lastSection) { lastSection = sec; if (SECTION_TOAST[sec]) toast(t(SECTION_TOAST[sec])); }
    audio.rolling(game.cart.v, game.cart.z <= 0.02 && !game.over);
    updateHud(false);
    if (game.over && game.overT > 1.6) finish();
    render(R, game, dt);
  } else if (mode === 'end' && game) {
    step(game, Math.min(dt, 0.05), 0);
    drainEvents(game);
    render(R, game, dt);
  } else if (mode === 'paused' && game) {
    render(R, game, 0.0001);
  } else if (mode === 'menu') {
    if (!demo || (demo.over && demo.overT > 2.5)) newDemo();
    simulate(demo, dt * 0.85, () => botSteer(demo, 0.9), false);
    render(R, demo, dt);
  }
}

const manual = TEST && params.has('manual');
function loop(now) {
  const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0;
  lastTime = now;
  if (!manual) frame(dt);
  requestAnimationFrame(loop);
}

// ---------- settings ----------
let settingsBack = 'screen-menu';
function openSettings(back) {
  settingsBack = back;
  const sel = $('set-lang');
  sel.replaceChildren(...Object.entries(LANGS).map(([code, name]) => {
    const o = document.createElement('option'); o.value = code; o.textContent = name; o.selected = code === getLang(); return o;
  }));
  syncToggles();
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== 'screen-settings';
  if (!touchMode) $('btn-settings-done').focus({ preventScroll: true });
}
function syncToggles() {
  $('set-sound').setAttribute('aria-pressed', String(audio.soundEnabled()));
  $('set-music').setAttribute('aria-pressed', String(audio.musicEnabled()));
  $('set-shake').setAttribute('aria-pressed', String(!R.reduceShake));
  updateSoundButton();
}
function closeSettings() {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== settingsBack;
  if (settingsBack === 'screen-menu') renderMenu();
}

function updateSoundButton() {
  const on = audio.soundEnabled() || audio.musicEnabled();
  for (const btn of document.querySelectorAll('[data-sound-toggle]')) {
    btn.innerHTML = on
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2zM18.5 6a8.5 8.5 0 0 1 0 12l-1.4-1.4a6.5 6.5 0 0 0 0-9.2z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 9.4l1.4-1.4 2.1 2.1 2.1-2.1L23 9.4l-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1z"/></svg>';
    btn.setAttribute('aria-label', on ? t('Mute') : t('Unmute'));
    btn.setAttribute('aria-pressed', String(!on));
  }
}

function translatePage() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  document.title = 'Cart Crash';
  updateSoundButton();
}

function wire() {
  const on = (id, fn) => $(id).addEventListener('click', () => { audio.unlock(); audio.click(); fn(); });
  on('btn-play', start);
  on('btn-again', start);
  on('btn-menu', goMenu);
  on('btn-pause', pause);
  on('btn-resume', resume);
  on('btn-restart', start);
  on('btn-quit', goMenu);
  on('btn-settings', () => openSettings('screen-menu'));
  on('btn-pause-settings', () => openSettings('screen-pause'));
  on('btn-settings-done', closeSettings);
  on('set-sound', () => { audio.setSound(!audio.soundEnabled()); syncToggles(); });
  on('set-music', () => { audio.setMusic(!audio.musicEnabled()); syncToggles(); });
  on('set-shake', () => { R.reduceShake = !R.reduceShake; save(SHAKE_KEY, !R.reduceShake); syncToggles(); });
  for (const btn of document.querySelectorAll('[data-sound-toggle]')) {
    btn.addEventListener('click', () => {
      audio.unlock();
      const next = !(audio.soundEnabled() || audio.musicEnabled());
      audio.setSound(next); audio.setMusic(next);
      updateSoundButton();
    });
  }
  $('set-lang').addEventListener('change', async (e) => {
    setLang(e.target.value);
    await initI18n(null, e.target.value);
    translatePage();
    chipsKey = '';
  });
}

// ---------- boot ----------
resize();
wire();
const portalReady = PORTAL && await portal.init();
if (portalReady) portal.loading(true);
await initI18n(portalReady ? portal.locale() : null);
await document.fonts?.load?.('40px "Lilita One"').catch(() => {});
translatePage();
if (portalReady) portal.onMute((muted) => { audio.setPortalMuted(muted); });
goMenu();
render(R, demo, 0);
$('loading').hidden = true;
if (portalReady) portal.loading(false);
requestAnimationFrame(loop);

// Hooks for the automated tests and the trailer recorder (only with ?test).
if (TEST) {
  window.__cc = {
    get mode() { return mode; },
    get game() { return game; },
    start,
    pause,
    frame: (dt = 1 / 30) => frame(dt),
    /** Simulates `seconds` of riding at once (the bot drives unless steer is given). */
    run(seconds, steer = null) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n && mode === 'play'; i++) {
        step(game, DT, steer === null ? botSteer(game) : steer);
        handleEvents(game, drainEvents(game), false);
        if (game.over && game.overT > 1.6) { finish(); break; }
      }
      if (mode === 'play') updateHud(false);
    },
    /** Ends the ride now (three crashes' worth). */
    crashOut() { game.lives = 1; game.cart.safe = 0; const e = { kind: 'obstacle', type: 'bin', x: game.cart.x, y: game.cart.y + 0.3, id: -1 }; game.world.entities.splice(game.next, 0, e); },
    handling: () => handling(game),
    portalMuted: () => audio.isPortalMuted(),
    /** A still for covers and icons: a ride `seconds` in, without the HUD, with the logo if `title`. */
    poster(seconds, title, closeup = false) {
      start();
      this.run(seconds);
      R.closeup = closeup;
      document.documentElement.classList.add('poster');
      if (title) {
        const el = document.createElement('div');
        el.className = 'poster-title';
        el.innerHTML = `<h1 class="logo"><span>Cart</span><span>Crash</span></h1>`;
        document.body.append(el);
      }
      for (let i = 0; i < 40; i++) frame(1 / 30);
    },
  };
}
