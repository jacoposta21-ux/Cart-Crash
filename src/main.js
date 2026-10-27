// Cart Crash: screens, input, the game loop, records and the CrazyGames hooks.
import { BUILD } from './build.js';
import { createGame, step, drainEvents, result, count, handling, listProgress, extras, LIVES, EXTRA_PENALTY } from './game.js';
import { createRenderer, resizeRenderer, setGame, onEvents, render, itemIcon } from './render3d.js';
import { botSteer } from './bot.js';
import { t, initI18n, setLang, getLang, LANGS } from './i18n.js';
import { load, save } from './storage.js';
import * as audio from './audio.js';
import * as portal from './portal.js';
import { ITEM_NAME, GOODS_NAME, ITEM_EFFECT, LEGEND, TIPS, SECTION_TOAST } from './strings.js';

const PORTAL = BUILD.target === 'crazygames';
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const DT = 1 / 120;

const BEST_KEY = 'cartcrash:bestScore'; // time + extras penalty, in seconds (lower is better)
const SHAKE_KEY = 'cartcrash:shake';
const RIDES_KEY = 'cartcrash:rides';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const R = createRenderer(canvas, $('fx'));
R.reduceShake = load(SHAKE_KEY, true) === false;
R.label = (s) => t(s);

let mode = 'menu'; // menu | play | paused | end
let game = null;
let demo = null; // the ride behind the menu
let lastTime = 0;
let acc = 0;
let lastSection = null;
const shownTips = new Set();
const touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touchMode) document.documentElement.classList.add('touch');

/** 83.4 → "1:23.4" */
export const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const nameOf = (key) => t(GOODS_NAME[key] || ITEM_NAME[key] || key);
const iconOf = (key) => (GOODS_NAME[key] ? itemIcon('goods', key) : itemIcon(key));

// ---------- size ----------
function resize() {
  resizeRenderer(R, window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

// ---------- input ----------
// Held: steering and the brake. Pressed: jump and drop (used by the next step).
const keys = { left: false, right: false, brake: false };
const pressed = { jump: false, drop: false, release: false };
const pointers = new Map(); // id → { x0, y0, t0, side, brake }
function readInput() {
  let l = keys.left, r = keys.right, brake = keys.brake;
  for (const p of pointers.values()) {
    if (p.brake) brake = true;
    else if (p.side < 0) l = true; else r = true;
  }
  const out = { steer: (r ? 1 : 0) - (l ? 1 : 0), brake, jump: pressed.jump, drop: pressed.drop, release: pressed.release };
  pressed.jump = pressed.drop = pressed.release = false;
  $('touch').querySelector('.tz-left').classList.toggle('on', l);
  $('touch').querySelector('.tz-right').classList.toggle('on', r);
  return out;
}
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'brake', KeyS: 'brake' };
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code) && mode === 'play') e.preventDefault();
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; audio.unlock(); }
  if (mode === 'play' && !e.repeat) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') pressed.jump = true;
    if (e.code === 'KeyE' || e.code === 'KeyX') pressed.drop = true;
    if (e.code === 'KeyQ' || e.code === 'KeyR') pressed.release = true;
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (mode === 'play') pause();
    else if (mode === 'paused' && $('screen-settings').hidden) resume();
  }
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
// Touch: hold a side to steer, swipe up to jump, swipe down and hold to brake.
const SWIPE = 40;
const sideOf = (x) => (x < window.innerWidth / 2 ? -1 : 1);
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (mode !== 'play') return;
  pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, t0: performance.now(), side: sideOf(e.clientX), brake: false, jumped: false });
  try { canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dy = e.clientY - p.y0;
  if (!p.jumped && !p.brake && dy < -SWIPE && performance.now() - p.t0 < 600) { p.jumped = true; pressed.jump = true; }
  if (!p.brake && dy > SWIPE) p.brake = true;
  if (!p.brake) p.side = sideOf(e.clientX);
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, (e) => pointers.delete(e.pointerId));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => { keys.left = keys.right = keys.brake = false; pointers.clear(); if (mode === 'play') pause(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'play') pause(); audio.suspend(); } else audio.resume();
});

// ---------- screens ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('hud').hidden = !(mode === 'play' || mode === 'paused');
  $('touch').hidden = !(touchMode && mode === 'play');
  $('btn-drop').hidden = mode !== 'play';
  $('btn-release').hidden = true;
  $('fx').hidden = mode === 'menu';
  const first = id && $(id)?.querySelector('.btn-primary');
  if (first && !touchMode) first.focus({ preventScroll: true });
}

function icon(src, size) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.width = img.height = size;
  return img;
}

function renderMenu() {
  const best = load(BEST_KEY, null);
  $('menu-records').innerHTML = best ? t('Best score: {time}', { time: `<b>${formatTime(best)}</b>` }) : t('Fill the list, reach the checkout, beat the clock.');
  $('legend').replaceChildren(...LEGEND.map((type) => {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = t(ITEM_NAME[type]);
    const sp = document.createElement('span'); sp.textContent = t(ITEM_EFFECT[type]);
    li.append(icon(itemIcon(type), 40), b, sp);
    return li;
  }));
  $('rules').textContent = t('Fill the list to reach the checkout. Every extra thing in the cart adds 5 seconds. Stop at red lights and level crossings. Three crashes and you are out.');
  $('controls-help').innerHTML = touchMode
    ? t('Hold left or right to steer. Swipe up to jump, swipe down and hold to brake.')
    : t('{steer} steer · {brake} brake · {jump} jump · {drop} drop the top thing · {release} let a balloon go', {
      steer: '<kbd>←</kbd><kbd>→</kbd>', brake: '<kbd>↓</kbd>', jump: '<kbd>↑</kbd>', drop: '<kbd>E</kbd>', release: '<kbd>Q</kbd>',
    });
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
  acc = 0;
  pointers.clear();
  keys.brake = false;
  mode = 'play';
  show(null);
  buildList();
  updateHud(true);
  showHint(touchMode ? t('Swipe up to jump, swipe down to brake') : t('↓ brake · ↑ jump · E drop · Q balloon'), 3500);
  portal.gameplay(true);
  audio.startMusic();
  save(RIDES_KEY, (load(RIDES_KEY, 0) || 0) + 1);
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  keys.left = keys.right = keys.brake = false;
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
  const best = load(BEST_KEY, null);
  const isRecord = r.won && (best === null || r.total < best);
  if (isRecord) save(BEST_KEY, r.total);
  renderEnd(r, isRecord, best);
  show('screen-end');
  if (isRecord) { audio.record(); portal.happytime(); }
}

function renderEnd(r, isRecord, prevBest) {
  const title = r.won
    ? (isRecord && prevBest !== null ? t('New record!') : t('Checkout!'))
    : r.reason === 'train' ? t('Hit by the train!') : t('Three crashes: you are out!');
  $('end-title').textContent = title;
  $('end-record').hidden = !(isRecord && prevBest !== null);
  $('end-score').textContent = r.won ? formatTime(r.total) : `${r.have}/${r.need}`;
  $('end-score-label').textContent = r.won ? t('time + extras') : t('on the list');
  if (r.won) {
    $('end-a-label').textContent = t('Time');
    $('end-a').textContent = formatTime(r.time);
    $('end-b-label').textContent = t('Extras');
    $('end-b').textContent = r.extras ? `${r.extras} · +${r.penalty}s` : '0';
  } else {
    $('end-a-label').textContent = t('Distance');
    $('end-a').textContent = `${Math.floor(r.distance)} m`;
    $('end-b-label').textContent = t('Time');
    $('end-b').textContent = formatTime(r.time);
  }
  $('end-crashes').textContent = String(r.crashes);
  const best = load(BEST_KEY, null);
  $('end-best').innerHTML = best ? t('Best score: {time}', { time: `<b>${formatTime(best)}</b>` }) : t('Fill the list and reach the checkout to set a time.');
}

// ---------- HUD ----------
let toastTimer = null;
function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast ${kind}`;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1300);
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
  c.append(icon(itemIcon(type), 26), text);
  return c;
}

function buildList() {
  $('hud-list').replaceChildren(...game.list.map((l) => {
    const li = document.createElement('li');
    li.dataset.key = l.key;
    li.title = nameOf(l.key);
    const n = document.createElement('b');
    li.append(icon(iconOf(l.key), 30), n);
    return li;
  }));
  listKey = '';
}

let chipsKey = '';
let listKey = '';
let livesShown = -1;
function updateHud(force) {
  const g = game;
  $('hud-time').textContent = formatTime(g.won ? g.finishTime : g.t);
  const prog = listProgress(g);
  const lk = prog.map((p) => p.have).join() + getLang();
  if (force || lk !== listKey) {
    listKey = lk;
    const items = $('hud-list').children;
    prog.forEach((p, i) => {
      const li = items[i];
      li.querySelector('b').textContent = p.have >= p.need ? '✓' : `${p.have}/${p.need}`;
      li.classList.toggle('done', p.have >= p.need);
      li.setAttribute('aria-label', `${nameOf(p.key)} ${p.have}/${p.need}`);
    });
  }
  const goal = $('hud-goal');
  if (g.checkoutY !== null && !g.over) {
    goal.textContent = t('Checkout in {n} m', { n: Math.max(0, Math.ceil(g.checkoutY - g.cart.y)) });
    goal.className = 'goal go';
  } else {
    const [have, need] = prog.reduce((a, p) => [a[0] + p.have, a[1] + p.need], [0, 0]);
    goal.textContent = t('List: {have}/{need}', { have, need });
    goal.className = 'goal';
  }
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
  // How far behind the closest chaser is (they run behind the camera, so the HUD tells).
  const behind = (list) => {
    const near = list.filter((p) => p.state === 'chase').map((p) => g.cart.y - p.y);
    return near.length ? Math.max(0, Math.round(Math.min(...near))) : null;
  };
  const dogM = behind(g.dogs);
  const dog = dogM !== null && dogM < 12 ? dogM : null;
  const nExtra = extras(g);
  $('btn-release').hidden = !(balloons > 0 && mode === 'play' && !g.over);
  const cop = behind(g.cops);
  const key = `${melons}|${balloons}|${oil}|${wobbly}|${dog}|${cop}|${nExtra}|${getLang()}`;
  if (key === chipsKey && !force) return;
  chipsKey = key;
  const chips = [];
  if (dog !== null) { const c = document.createElement('span'); c.className = 'chip warn'; c.textContent = t('Dog {n} m behind: drop something!', { n: dog }); chips.push(c); }
  if (cop !== null) { const c = document.createElement('span'); c.className = 'chip warn cop'; c.textContent = t('Police {n} m behind: don\'t slow down!', { n: cop }); chips.push(c); }
  if (nExtra) { const c = document.createElement('span'); c.className = 'chip extra'; c.textContent = t('Extras: {n} (+{s}s)', { n: nExtra, s: nExtra * EXTRA_PENALTY }); chips.push(c); }
  if (melons) chips.push(chip('melon', `${t('Heavy')} ×${melons}`));
  if (balloons) chips.push(chip('balloon', `${t('Floaty')} ×${balloons}`));
  if (oil) chips.push(chip('oil', `${t('Slippery')} ${oil}s`, true));
  if (wobbly) chips.push(chip('goods', t('Wobbly!'), true));
  $('hud-chips').replaceChildren(...chips);
}

function label(kind, e) {
  if (kind === 'pickup') return e.item === 'balloon' ? t('Balloons') : nameOf(e.key);
  if (kind === 'crowdhit') return t('Watch out!');
  if (kind === 'caught') return t('Fined!');
  if (kind === 'fall') return e.why === 'full' ? t('No room!') : t('Fell off!');
  if (kind === 'break') return t('Eggs broke!');
  if (kind === 'crash') return e.obstacle === 'walker' ? t('Sorry!') : t('Crash!');
  if (kind === 'drop') return nameOf(e.item.type === 'goods' ? e.item.goods : e.item.type);
  if (kind === 'bite') return t('Ouch!');
  return '';
}

function handleEvents(g, events, live) {
  const quiet = new Set(['pickup', 'fall', 'break', 'crash', 'drop', 'crowdhit', 'caught', 'bite']);
  onEvents(R, g, live ? events : events.filter((e) => !quiet.has(e.type)), label);
  if (!live) return;
  for (const e of events) {
    audio.play(e);
    if (e.type === 'pickup' && !shownTips.has(e.item) && TIPS[e.item]) {
      if (e.item !== 'goods' || g.stack.length > 3) { shownTips.add(e.item); showHint(t(TIPS[e.item])); }
    }
    if (e.type === 'pickup' && !e.wanted && e.item !== 'balloon' && !shownTips.has('junk')) { shownTips.add('junk'); showHint(touchMode ? t('Not on the list: +5 seconds at the checkout! Tap Drop to throw the top thing away.') : t('Not on the list: +5 seconds at the checkout! Press E to drop the top thing.'), 3800); }
    if (e.type === 'tall') toast(t('What a pile!'));
    if (e.type === 'ramp') toast(t('Wheee!'));
    if (e.type === 'dog') toast(t('Woof!'));
    if (e.type === 'yellow') toast(t('Red light ahead: brake!'), 'warn');
    if (e.type === 'bells') toast(t('Train coming: stop!'), 'warn');
    if (e.type === 'crowdhit') showHint(t('You ran into the crowd: they knocked everything out of the cart!'), 3500);
    if (e.type === 'cop') { toast(t('Police!'), 'warn'); showHint(t('You ran the red light! The traffic warden is after you for 10 seconds: keep going, don\'t slow down.'), 3800); }
    if (e.type === 'caught') showHint(t('The traffic warden caught you: a fine costs you a life.'), 3200);
    if (e.type === 'copgaveup') toast(t('Got away!'), 'go');
    if (e.type === 'bite') showHint(t('The dog caught you! Drop something next time to keep it busy.'), 3200);
    if (e.type === 'dogeats') toast(t('Good dog!'));
    if (e.type === 'listdone') toast(t('Got everything! To the checkout!'), 'go');
    if (e.type === 'listbroken') showHint(t('Something on the list fell off: get another one!'), 3000);
    if (e.type === 'crash' && e.lives === 1) showHint(t('Careful: one more crash and you are out!'), 2500);
  }
}

// ---------- loop ----------
function simulate(g, dt, inputFn, live) {
  acc += Math.min(dt, 0.1);
  while (acc >= DT) {
    acc -= DT;
    step(g, DT, inputFn());
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
    simulate(game, dt, () => (autopilot ? botSteer(game) : readInput()), true);
    const sec = game.world.sectionAt(game.cart.y + 12).kind;
    if (sec !== lastSection) { lastSection = sec; if (SECTION_TOAST[sec] && game.checkoutY === null) toast(t(SECTION_TOAST[sec])); }
    audio.rolling(game.cart.v, game.cart.z <= 0.02 && !game.over);
    updateHud(false);
    if (game.over && game.overT > (game.won ? 2.2 : 1.6)) finish();
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
  $('btn-drop').querySelector('small').hidden = touchMode;
  $('btn-release').querySelector('small').hidden = touchMode;
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
  $('btn-drop').addEventListener('pointerdown', (e) => { e.preventDefault(); if (mode === 'play') pressed.drop = true; });
  $('btn-release').addEventListener('pointerdown', (e) => { e.preventDefault(); if (mode === 'play') pressed.release = true; });
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
    listKey = '';
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
    press: (what) => { pressed[what] = true; },
    /** Simulates `seconds` of riding at once (the bot drives unless an input is given). */
    run(seconds, input = null) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n && mode === 'play'; i++) {
        step(game, DT, input === null ? botSteer(game) : input);
        handleEvents(game, drainEvents(game), false);
        if (game.over && game.overT > 1.6) { finish(); break; }
      }
      if (mode === 'play') updateHud(false);
    },
    /** Ends the ride now (three crashes' worth). */
    crashOut() { game.lives = 1; game.cart.safe = 0; const e = { kind: 'obstacle', type: 'bin', x: game.cart.x, y: game.cart.y + 0.3, id: -1 }; game.world.entities.splice(game.next, 0, e); },
    /** Fills the cart with the whole list (the checkout then appears ahead). */
    fillList() {
      game.world.clear(game.cart.y + 1, game.cart.y + 400); // a clear road to the checkout
      for (const l of game.list) for (let i = 0; i < l.need; i++) {
        const it = ['melon', 'oil', 'eggs'].includes(l.key) ? { type: l.key } : { type: 'goods', goods: l.key };
        game.stack.push({ ...it, h: 0.3, id: 9000 + game.stack.length });
      }
    },
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
