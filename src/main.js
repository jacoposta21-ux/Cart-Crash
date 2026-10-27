// Cart Crash: screens, input, the game loop, records and the CrazyGames hooks.
import { BUILD } from './build.js';
import { createGame, step, drainEvents, result, cartValue, progress, count, handling, ITEMS } from './game.js';
import { hashString } from './track.js';
import { createView, resizeView, onEvents, render } from './render.js';
import { botSteer } from './bot.js';
import { itemIcon } from './draw-items.js';
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
const DAILY_KEY = 'cartcrash:daily';
const SHAKE_KEY = 'cartcrash:shake';
const RIDES_KEY = 'cartcrash:rides';


const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const view = createView();
view.reduceShake = load(SHAKE_KEY, true) === false;

let mode = 'menu'; // menu | play | paused | end
let game = null;
let demo = null; // the ride behind the menu
let rideDaily = false;
let lastTime = 0;
let acc = 0;
let lastSection = null;
let shownTips = new Set();
let lastValue = 0;
const touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touchMode) document.documentElement.classList.add('touch');

// ---------- canvas size ----------
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  resizeView(view, W, H);
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
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (mode !== 'play') return;
  pointers.set(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
});
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
  const first = id && $(id)?.querySelector('.btn-primary');
  if (first && !touchMode) first.focus({ preventScroll: true });
}

function todayKey() { return new Date().toISOString().slice(0, 10); }
function dailyBest() { const d = load(DAILY_KEY, null); return d && d.day === todayKey() ? d.best : null; }

function renderMenu() {
  const best = load(BEST_KEY, 0) || 0;
  const daily = dailyBest();
  const parts = [];
  if (best) parts.push(t('Best: {n}', { n: `<b>${formatNumber(best)}</b>` }));
  if (daily !== null) parts.push(t('Today: {n}', { n: `<b>${formatNumber(daily)}</b>` }));
  $('menu-records').innerHTML = parts.join(' · ') || t('Grab everything. Bring it to the bottom.');
  const legend = $('legend');
  legend.replaceChildren(...LEGEND.map((type) => {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = t(ITEM_NAME[type]);
    const sp = document.createElement('span'); sp.textContent = t(ITEM_EFFECT[type]);
    li.append(itemIcon(type, 40), b, sp);
    return li;
  }));
  $('controls-help').innerHTML = touchMode
    ? t('Hold the left or right side of the screen to steer.')
    : t('Steer with {keys}', { keys: '<span class="keys"><kbd>←</kbd> <kbd>→</kbd> / <kbd>A</kbd> <kbd>D</kbd></span>' });
}

function goMenu() {
  mode = 'menu';
  portal.gameplay(false);
  audio.stopMusic();
  game = null;
  renderMenu();
  show('screen-menu');
}

function start(daily) {
  audio.unlock();
  rideDaily = daily;
  const seed = daily ? hashString(`daily:${todayKey()}`) : (TEST && params.get('seed') ? Number(params.get('seed')) : (Math.random() * 2 ** 32) >>> 0);
  game = createGame(seed, { daily });
  view.debris = []; view.parts = []; view.texts = []; view.decals = [];
  view.camX = NaN;
  lastSection = 'street';
  lastValue = 0;
  acc = 0;
  pointers.clear();
  mode = 'play';
  show(null);
  updateHud(true);
  $('hint').innerHTML = touchMode ? t('Hold left or right to steer') : t('Steer with {keys}', { keys: '<b>← →</b>' });
  $('hint').hidden = false;
  setTimeout(() => { if (game && game.t > 2) $('hint').hidden = true; }, 3500);
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
  let isRecord = false;
  if (rideDaily) {
    const prev = dailyBest();
    if (prev === null || r.score > prev) { save(DAILY_KEY, { day: todayKey(), best: r.score }); isRecord = prev !== null && r.score > 0; }
  }
  const best = load(BEST_KEY, 0) || 0;
  if (r.score > best) { save(BEST_KEY, r.score); isRecord = isRecord || (best > 0); }
  renderEnd(r, isRecord);
  show('screen-end');
  if (isRecord) { audio.record(); portal.happytime(); }
}

function endTitle(r) {
  if (r.score === 0) return t('Empty cart. Bold strategy.');
  if (r.items >= 25) return t('That is not a cart, that is a tower!');
  if (r.broken >= 2) return t('Scrambled eggs, anyone?');
  if (r.lost > r.items * 2) return t('Half the town has your shopping now.');
  if (r.byType.melon >= 3) return t('Melon delivery service!');
  if (r.byType.balloon >= 5) return t('Practically flying!');
  return t('Delivered!');
}

function renderEnd(r, isRecord) {
  $('end-kicker').textContent = rideDaily ? t('Daily ride · {date}', { date: new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'long' }).format(new Date()) }) : t('Quick ride');
  $('end-title').textContent = endTitle(r);
  $('end-record').hidden = !isRecord;
  const items = $('end-items');
  items.replaceChildren(...LEGEND.filter((type) => r.byType[type]).map((type) => {
    const li = document.createElement('li');
    li.title = t(ITEM_NAME[type]);
    li.append(itemIcon(type, 34), `×${r.byType[type]}`);
    return li;
  }));
  $('end-lost').textContent = r.lost
    ? t('Lost on the way: {n} ({v} points)', { n: r.lost, v: formatNumber(r.lostValue) })
    : t('Nothing lost on the way. Impressive!');
  const best = load(BEST_KEY, 0) || 0;
  const daily = dailyBest();
  $('end-best').innerHTML = [t('Best: {n}', { n: `<b>${formatNumber(best)}</b>` }), rideDaily && daily !== null ? t('Today: {n}', { n: `<b>${formatNumber(daily)}</b>` }) : ''].filter(Boolean).join(' · ');
  // Count the score up.
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
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1100);
}

function chip(type, text, warn) {
  const c = document.createElement('span');
  c.className = `chip${warn ? ' warn' : ''}`;
  c.append(itemIcon(type, 26), text);
  return c;
}

let chipsKey = '';
function updateHud(force) {
  const g = game;
  const value = cartValue(g);
  const el = $('hud-value');
  if (force || value !== lastValue) {
    el.textContent = formatNumber(value);
    el.classList.remove('up', 'down');
    void el.offsetWidth;
    if (!force) el.classList.add(value > lastValue ? 'up' : 'down');
    lastValue = value;
  }
  const p = progress(g) * 100;
  $('hud-bar').style.width = `${p}%`;
  $('hud-marker').style.left = `${p}%`;
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
  if (kind === 'pop') return t('Pop!');
  return '';
}

function handleEvents(g, events, live) {
  onEvents(view, g, events, label);
  if (!live) return;
  for (const e of events) {
    audio.play(e);
    if (e.type === 'pickup' && !shownTips.has(e.item)) {
      shownTips.add(e.item);
      if (e.item !== 'goods' || g.stack.length > 3) showHint(t(TIPS[e.item]));
      else shownTips.delete('goods');
    }
    if (e.type === 'tall') toast(t('What a pile!'));
    if (e.type === 'crash') toast(t('Crash!'));
    if (e.type === 'ramp') toast(t('Wheee!'));
    if (e.type === 'finish') toast(t('Checkout!'));
  }
}

let hintTimer = null;
function showHint(text) {
  const el = $('hint');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.hidden = true; }, 3200);
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
  view.debris = []; view.parts = []; view.texts = []; view.decals = [];
  view.camX = NaN;
}

function frame(dt) {
  if (mode === 'play' && game) {
    const autopilot = params.has('autopilot');
    simulate(game, dt, () => (autopilot ? botSteer(game) : steerInput()), true);
    const sec = game.track.sectionAt(game.cart.y + 8).kind;
    if (sec !== lastSection) { lastSection = sec; if (SECTION_TOAST[sec] && !game.finished) toast(t(SECTION_TOAST[sec])); }
    audio.rolling(game.cart.v, game.cart.z <= 0.02 && !game.finished);
    updateHud(false);
    if (game.t > 3 && !$('hint').hidden && !hintTimer) $('hint').hidden = true;
    if (game.finished && game.finishT > 1.4) finish();
    render(ctx, view, game, dt, t);
  } else if ((mode === 'paused' || mode === 'end') && game) {
    if (mode === 'end') { acc += 0; step(game, Math.min(dt, 0.05), 0); drainEvents(game); }
    render(ctx, view, game, mode === 'end' ? dt : 0, t);
  } else {
    if (!demo || (demo.finished && demo.finishT > 2)) newDemo();
    simulate(demo, dt * 0.85, () => botSteer(demo), false);
    render(ctx, view, demo, dt, t);
  }
}

function loop(now) {
  const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0;
  lastTime = now;
  if (!manual) frame(dt);
  requestAnimationFrame(loop);
}
const manual = TEST && params.has('manual');

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
  $('set-shake').setAttribute('aria-pressed', String(!view.reduceShake));
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
  on('btn-play', () => start(false));
  on('btn-daily', () => start(true));
  on('btn-again', () => start(rideDaily));
  on('btn-menu', goMenu);
  on('btn-pause', pause);
  on('btn-resume', resume);
  on('btn-restart', () => start(rideDaily));
  on('btn-quit', goMenu);
  on('btn-settings', () => openSettings('screen-menu'));
  on('btn-pause-settings', () => openSettings('screen-pause'));
  on('btn-settings-done', closeSettings);
  on('set-sound', () => { audio.setSound(!audio.soundEnabled()); syncToggles(); });
  on('set-music', () => { audio.setMusic(!audio.musicEnabled()); syncToggles(); });
  on('set-shake', () => { view.reduceShake = !view.reduceShake; save(SHAKE_KEY, !view.reduceShake); syncToggles(); });
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
if (portalReady) portal.loading(false);
requestAnimationFrame(loop);

// Hooks for the automated tests and the trailer recorder (only with ?test).
if (TEST) {
  window.__cc = {
    get mode() { return mode; },
    get game() { return game; },
    get demo() { return demo; },
    start,
    frame: (dt = 1 / 30) => frame(dt),
    run(seconds, steer = null) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n && mode === 'play'; i++) {
        step(game, DT, steer === null ? botSteer(game) : steer);
        handleEvents(game, drainEvents(game), false);
        if (game.finished && game.finishT > 1.4) { finish(); break; }
      }
      updateHud(false);
    },
    handling: () => handling(game),
    ITEMS,
  };
}
