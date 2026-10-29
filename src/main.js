// Cart Crash: screens, input, the game loop, records and the portal hooks.
import { BUILD } from './build.js';
import { createGame, step, drainEvents, result, count, handling, listProgress, extras, EXTRA_PENALTY } from './game.js';
import { createRenderer, resizeRenderer, setGame, setRivals, onEvents, render, itemIcon, cartIcon } from './render3d.js';
import { createMatch, stepMatch, standings, VS_TIME, VS_THINGS } from './versus.js';
import { TRACKS, TRACK_ORDER } from './tracks.js';
import { CARTS, CART_ORDER } from './carts.js';
import { createProgress, mergeProgress, PROGRESS_KEYS, KEYS } from './progress.js';
import { catalogOf, lookOfKey, GOODS_H } from './catalog.js';
import { botSteer, POLICIES } from './bot.js';
import { t, initI18n, setLang, getLang, LANGS } from './i18n.js';
import { load, save } from './storage.js';
import * as audio from './audio.js';
import { portal } from './portal.js';
import { THING_NAME, ITEM_EFFECT, LEGEND, TIPS, SECTION_TOAST, TRACK_NAME, CART_NAME, CHASER_CHIP, CHASER_TOAST, CROSSING_TOAST, FALL_TITLE, HIT_TITLE } from './strings.js';

const PORTAL = BUILD.target !== 'web';
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const DT = 1 / 120;

const SHAKE_KEY = 'cartcrash:shake';
const RIDES_KEY = 'cartcrash:rides';
const LEVEL_KEY = 'cartcrash:level'; // the Arcade rivals' level

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
let banked = 0; // coins of this ride already added to the purse
let match = null; // a versus race (src/versus.js): game is then the player's cart in it
// Coins, carts and tracks (src/progress.js); records also go to the portal's cloud save.
const progress = createProgress({ load, save: (k, v) => saveProgress(k, v) });
let pickTrack = progress.track(); // the track shown in the menu
let pickCart = progress.cart(); // the cart shown in the garage
const shownTips = new Set();
const touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touchMode) document.documentElement.classList.add('touch');

/** 83.4 → "1:23.4" */
export const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
// Names and icons follow the track: the heavy thing is a watermelon in the Old Town, a cheese wheel on the Mountain…
const shopTrack = () => game?.track || pickTrack;
const nameOf = (key) => t(THING_NAME[lookOfKey(shopTrack(), key)] || key);
const iconOf = (key) => (GOODS_H[key] ? itemIcon('goods', key) : itemIcon(key, undefined, lookOfKey(shopTrack(), key)));

// ---------- size ----------
function resize() {
  resizeRenderer(R, window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

// ---------- input ----------
// Held: steering and the brake. Pressed: jump and drop (used by the next step).
const keys = { left: false, right: false, brake: false };
const pressed = { jump: false, drop: false, release: false };
const pointers = new Map(); // id → { x0, y0, side, brake, jumped }
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
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; wakeAudio(); }
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
  wakeAudio();
  if (mode !== 'play') return;
  pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, side: sideOf(e.clientX), brake: false, jumped: false });
  try { canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dy = e.clientY - p.y0;
  if (!p.jumped && !p.brake && dy < -SWIPE) { p.jumped = true; pressed.jump = true; } // one jump per touch
  if (!p.brake && dy > SWIPE) p.brake = true;
  if (!p.brake) p.side = sideOf(e.clientX);
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, (e) => pointers.delete(e.pointerId));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => { keys.left = keys.right = keys.brake = false; pointers.clear(); if (mode === 'play') pause(); });
window.addEventListener('pagehide', () => bankCoins());
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
  const id = pickTrack;
  const i = TRACK_ORDER.indexOf(id);
  const open = progress.isOpen(id);
  const best = progress.best(id);
  $('track-name').textContent = `${i + 1}. ${t(TRACK_NAME[id])}`;
  $('track-info').innerHTML = !open
    ? t('Finish {track} to unlock', { track: `<b>${t(TRACK_NAME[TRACK_ORDER[i - 1]])}</b>` })
    : best !== null ? t('Best score: {time}', { time: `<b>${formatTime(best)}</b>` }) : t('Fill the list, reach the checkout, beat the clock.');
  const card = $('track-card');
  card.classList.toggle('locked', !open);
  card.dataset.track = id;
  $('btn-play').disabled = !open;
  $('btn-versus').disabled = !open;
  $('menu-coins').textContent = String(progress.coins());

}

function pickTrackBy(d) {
  const i = (TRACK_ORDER.indexOf(pickTrack) + d + TRACK_ORDER.length) % TRACK_ORDER.length;
  pickTrack = TRACK_ORDER[i];
  progress.selectTrack(pickTrack);
  newDemo();
  renderMenu();
}

function renderHelp() {
  $('legend').replaceChildren(...LEGEND.map((type) => {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = nameOf(type);
    const sp = document.createElement('span'); sp.textContent = t(ITEM_EFFECT[type]);
    li.append(icon(iconOf(type), 40), b, sp);
    return li;
  }));
  $('rules').textContent = `${t('Fill the list to reach the checkout. Every extra thing in the cart adds 5 seconds. Stop at red lights and level crossings. Three crashes and you are out.')} ${t('Coins buy new carts in the garage. Finish a track to open the next one.')}`;
  $('controls-help').innerHTML = touchMode
    ? t('Hold left or right to steer. Swipe up to jump, swipe down and hold to brake.')
    : t('{steer} steer · {brake} brake · {jump} jump · {drop} drop the top thing · {release} let a balloon go', {
      steer: '<kbd>←</kbd><kbd>→</kbd>', brake: '<kbd>↓</kbd>', jump: '<kbd>↑</kbd>', drop: '<kbd>E</kbd>', release: '<kbd>Q</kbd>',
    });
}

function openScreen(id) {
  for (const sc of document.querySelectorAll('.screen')) sc.hidden = sc.id !== id;
  const first = $(id).querySelector('.btn-primary:not(:disabled), .btn');
  if (first && !touchMode) first.focus({ preventScroll: true });
}

// ---------- garage ----------
function renderGarage() {
  const id = pickCart;
  const K = CARTS[id];
  $('garage-coins').textContent = String(progress.coins());
  $('cart-img').src = cartIcon(id);
  $('cart-name').textContent = t(CART_NAME[id]);
  const bar = (v) => { const s = document.createElement('i'); s.className = 'bar'; s.style.setProperty('--v', String(Math.max(0.08, Math.min(1, v)))); return s; };
  const row = (label, value) => { const li = document.createElement('li'); const b = document.createElement('span'); b.textContent = label; li.append(b, value); return li; };
  const hearts = document.createElement('span');
  hearts.className = 'lives';
  hearts.replaceChildren(...Array.from({ length: K.lives }, () => { const h = document.createElement('i'); h.className = 'life'; return h; }));
  $('cart-stats').replaceChildren(
    row(t('Lives'), hearts),
    row(t('Speed'), bar((K.speed + 1) / 2.4)),
    row(t('Steering'), bar((K.steer - 0.75) / 0.5)),
    row(t('Load'), bar((K.pile + K.steady - 0.6) / 2.4)),
  );
  const btn = $('cart-action');
  const owned = progress.has(id);
  const using = progress.cart() === id;
  btn.disabled = using || (!owned && progress.coins() < K.price);
  btn.textContent = using ? t('In use') : owned ? t('Use') : t('Buy: {n} coins', { n: K.price });
  btn.classList.toggle('btn-secondary', using);
  btn.classList.toggle('btn-primary', !using);
}

function pickCartBy(d) {
  const i = (CART_ORDER.indexOf(pickCart) + d + CART_ORDER.length) % CART_ORDER.length;
  pickCart = CART_ORDER[i];
  renderGarage();
}

function cartAction() {
  if (progress.has(pickCart)) progress.selectCart(pickCart);
  else if (progress.buy(pickCart)) { audio.record(); toast(t('New cart!'), 'go'); }
  renderGarage();
}

/** Adds this ride's new coins to the purse (also when the ride is not finished). */
function bankCoins() {
  if (!game) return;
  const d = game.coins - banked;
  if (d > 0) { progress.addCoins(d); banked = game.coins; }
}

/** Records also go to the portal's own storage (cloud saves on Playgama), except in a tester's build. */
function saveProgress(key, value) {
  save(key, value);
  if (!BUILD.unlockAll) portal.saveProgress(key, value);
}

/** Between rides the portal may show an ad: silence while it runs, then go on. */
let breaking = false;
async function afterRide(next) {
  if (breaking) return;
  breaking = true;
  await portal.adBreak((on) => { mutes.ad = on; applyMute(); });
  breaking = false;
  if (mode === 'end') next();
}

// The portal's mute, its pause and its ads all silence the game.
const mutes = { portal: false, pause: false, ad: false };
const applyMute = () => audio.setPortalMuted(mutes.portal || mutes.pause || mutes.ad);

function goMenu() {
  bankCoins();
  mode = 'menu';
  portal.gameplay(false);
  audio.stopMusic();
  audio.rolling(0, false);
  game = null;
  match = null;
  audio.startMusic('menu');
  document.documentElement.classList.remove('versus');
  pickTrack = progress.track();
  newDemo();
  renderMenu();
  show('screen-menu');
}

/** The first tap or key unlocks the sound: on the menu, its tune starts. */
function wakeAudio() {
  audio.unlock();
  if (mode === 'menu') audio.startMusic('menu');
}

/** A new race on this track (the chosen one by default) with the cart in use. versus: against rivals for 7 things. */
function start(track = progress.track(), versus = false) {
  audio.unlock();
  bankCoins();
  const seed = TEST && params.get('seed') ? Number(params.get('seed')) : (Math.random() * 2 ** 32) >>> 0;
  const tr = TEST && params.get('track') ? params.get('track') : track;
  match = versus ? createMatch(seed, { track: tr, cart: progress.cart(), level: load(LEVEL_KEY, 'normal') }) : null;
  game = match ? match.games[0] : createGame(seed, { track: tr, cart: progress.cart() });
  banked = 0;
  setGame(R, game);
  if (match) setRivals(R, match.games.slice(1).map((g, i) => ({ game: g, color: match.colors[i], name: match.names[i] })));
  document.documentElement.classList.toggle('versus', Boolean(match));
  lastSection = game.world.sectionAt(0).kind;
  acc = 0;
  pointers.clear();
  keys.brake = false;
  mode = 'play';
  show(null);
  buildList();
  updateHud(true);
  if (match) showHint(t('You and 2 rivals, 7 things on the road. Get all 7 to win at once; after 3 minutes, the most wins. Crashes and falls knock things off: grab them!'), 5000);
  else if (game.T.roller === 'boulder') showHint(t('A boulder is rolling after you: never stop!'), 3500);
  else showHint(touchMode ? t('Swipe up to jump, swipe down to brake') : t('↓ brake · ↑ jump · E drop · Q balloon'), 3500);
  portal.gameplay(true);
  audio.startMusic(game.track);
  saveProgress(RIDES_KEY, (load(RIDES_KEY, 0) || 0) + 1);
  if (match) toast(t('Rivals: {names}', { names: match.names.join(' · ') }));
}

function pause() {
  if (mode !== 'play') return;
  bankCoins();
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
  audio.startMusic(game.track);
}

let firstReward = 0;
function finish() {
  mode = 'end';
  portal.gameplay(false);
  audio.stopMusic();
  audio.rolling(0, false);
  bankCoins();
  if (match) { renderVersusEnd(); show('screen-end'); if (match.winner === 0) audio.record(); return; }
  const r = result(game);
  const best = progress.best(game.track);
  const isRecord = r.won && (best === null || r.total < best);
  if (isRecord) progress.setBest(game.track, r.total);
  const opened = r.won ? progress.finished(game.track) : null;
  // The first time a track is finished: a big reward.
  firstReward = r.won && progress.firstWin(game.track) ? TRACKS[game.track].first : 0;
  if (firstReward) progress.addCoins(firstReward);
  renderEnd(r, isRecord, best, opened);
  show('screen-end');
  if (isRecord) { audio.record(); portal.happytime(); }
}

/** Versus: the places, and how many of the 7 each one had. */
function renderVersusEnd() {
  const order = standings(match);
  const place = order.indexOf(0);
  $('end-title').textContent = match.winner === 0 ? t('You win!') : place === 1 ? t('2nd place') : t('3rd place');
  $('end-record').hidden = true;
  $('end-unlock').hidden = true;
  $('end-score').textContent = `${game.stack.length}/${VS_THINGS}`;
  $('end-score-label').textContent = t('things');
  const slots = [['end-a-label', 'end-a'], ['end-b-label', 'end-b'], ['end-c-label', 'end-crashes']];
  const others = order.filter((i) => i !== 0);
  slots.forEach(([l, v], k) => {
    const i = others[k];
    const time = i === undefined;
    $(l).textContent = time ? t('Time') : match.names[i - 1];
    $(v).textContent = time ? formatTime(Math.min(VS_TIME, match.t)) : `${match.games[i].stack.length}/${VS_THINGS}`;
  });
  $('end-coins').textContent = '';
  $('end-best').textContent = match.winner === 0 ? t('All the things are yours!') : t('Bump into the others to make them drop theirs!');
}

function renderEnd(r, isRecord, prevBest, opened) {
  const title = r.won
    ? (isRecord && prevBest !== null ? t('New record!') : t('Checkout!'))
    : r.reason === 'train' ? t(HIT_TITLE[game.hitBy] || HIT_TITLE.train) : r.reason === 'fell' ? t(FALL_TITLE[game.fellInto] || FALL_TITLE.space) : t('Out of lives!');
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
  $('end-c-label').textContent = t('Crashes');
  $('end-crashes').textContent = String(r.crashes);
  $('end-coins').innerHTML = `<i class="coin"></i> +${game.coins + firstReward}${game.bonus ? ` <small>(${t('checkout bonus +{n}', { n: game.bonus })}${firstReward ? ` · ${t('first win +{n}', { n: firstReward })}` : ''})</small>` : ''}`;
  $('end-unlock').hidden = !opened;
  if (opened) $('end-unlock').textContent = t('New track unlocked: {track}!', { track: t(TRACK_NAME[opened]) });
  const best = progress.best(game.track);
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
  c.append(icon(type === 'goods' ? itemIcon('goods', catalogOf(shopTrack()).goods[0]) : iconOf(type), 26), text);
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
let coinsShown = -1;
function updateHud(force) {
  const g = game;
  if (match) { updateVersusHud(force); return; }
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
  if (force || coinsShown !== g.coins) { coinsShown = g.coins; $('hud-coins').textContent = String(g.coins); }
  if (force || livesShown !== g.lives) {
    livesShown = g.lives;
    const lives = $('hud-lives');
    lives.replaceChildren(...Array.from({ length: g.maxLives }, (_, i) => {
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
  const dogKind = dog !== null ? g.dogs.filter((d) => d.state === 'chase').sort((a, b) => b.y - a.y)[0].species : null;
  const roller = g.rollers.length ? g.rollers.reduce((a, q) => (q.gap < a.gap ? q : a)) : null;
  const rollM = roller && roller.gap < 20 ? Math.max(0, Math.round(roller.gap)) : null;
  const nExtra = extras(g);
  $('btn-release').hidden = !(balloons > 0 && mode === 'play' && !g.over);
  const cop = behind(g.cops);
  const key = `${melons}|${balloons}|${oil}|${wobbly}|${dog}|${dogKind}|${rollM}|${cop}|${nExtra}|${getLang()}`;
  if (key === chipsKey && !force) return;
  chipsKey = key;
  const chips = [];
  if (dog !== null) { const c = document.createElement('span'); c.className = 'chip warn'; c.textContent = t(CHASER_CHIP[dogKind] || CHASER_CHIP.dog, { n: dog }); chips.push(c); }
  if (rollM !== null) { const c = document.createElement('span'); c.className = 'chip warn'; c.textContent = t(CHASER_CHIP[roller.type], { n: rollM }); chips.push(c); }
  if (cop !== null) { const c = document.createElement('span'); c.className = 'chip warn cop'; c.textContent = t('Police {n} m behind: don\'t slow down!', { n: cop }); chips.push(c); }
  if (nExtra) { const c = document.createElement('span'); c.className = 'chip extra'; c.textContent = t('Extras: {n} (+{s}s)', { n: nExtra, s: nExtra * EXTRA_PENALTY }); chips.push(c); }
  if (melons) chips.push(chip('melon', `${t('Heavy')} ×${melons}`));
  if (balloons) chips.push(chip('balloon', `${t('Super jump')} ×${balloons}`));
  if (oil) chips.push(chip('oil', `${t('Slippery')} ${oil}s`, true));
  if (wobbly) chips.push(chip('goods', t('Wobbly!'), true));
  $('hud-chips').replaceChildren(...chips);
}

/** Versus: time left and who has how many of the 7. */
let vsKey = '';
function updateVersusHud(force) {
  $('hud-time').textContent = formatTime(Math.max(0, VS_TIME - match.t));
  $('hud-time').classList.toggle('hurry', VS_TIME - match.t < 20);
  const order = standings(match);
  const key = order.map((i) => `${i}:${match.games[i].stack.length}`).join() + getLang();
  if (key === vsKey && !force) return;
  vsKey = key;
  $('hud-vs').replaceChildren(...order.map((i) => {
    const li = document.createElement('li');
    li.className = i === 0 ? 'me' : '';
    li.style.setProperty('--c', i === 0 ? '#ff7a2f' : match.colors[i - 1]);
    const b = document.createElement('b');
    b.textContent = `${match.games[i].stack.length}/${VS_THINGS}`;
    li.append(i === 0 ? t('You') : match.names[i - 1], b);
    return li;
  }));
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
  if (kind === 'falling') return e.into === 'water' ? t('Splash!') : e.into === 'lava' ? t('Hot hot hot!') : t('Whoops!');
  if (kind === 'stolen') return t('Stolen!');
  if (kind === 'squashed') return t('Squashed!');
  return '';
}

function handleEvents(g, events, live) {
  const quiet = new Set(['pickup', 'fall', 'break', 'crash', 'drop', 'crowdhit', 'caught', 'bite']);
  onEvents(R, g, live ? events : events.filter((e) => !quiet.has(e.type)), label);
  if (!live) return;
  for (const e of events) {
    audio.play(e);
    if (e.type === 'pickup' && !shownTips.has(e.item) && TIPS[e.item]) {
      if (e.item !== 'goods' || g.stack.length > 3) { shownTips.add(e.item); showHint(t(TIPS[e.item], { item: nameOf(e.item) })); }
    }
    if (e.type === 'pickup' && !e.wanted && e.item !== 'balloon' && !shownTips.has('junk')) { shownTips.add('junk'); showHint(touchMode ? t('Not on the list: +5 seconds at the checkout! Tap Drop to throw the top thing away.') : t('Not on the list: +5 seconds at the checkout! Press E to drop the top thing.'), 3800); }
    if (e.type === 'tall') toast(t('What a pile!'));
    if (e.type === 'ramp') toast(t('Wheee!'));
    if (e.type === 'dog') toast(t(CHASER_TOAST[e.species] || CHASER_TOAST.dog));
    if (e.type === 'yellow') toast(t('Red light ahead: brake!'), 'warn');
    if (e.type === 'bells') toast(t(CROSSING_TOAST[e.vehicle] || CROSSING_TOAST.train), 'warn');
    if (e.type === 'crowdhit') showHint(t('You ran into the crowd: they knocked everything out of the cart!'), 3500);
    if (e.type === 'cop') { toast(t('Police!'), 'warn'); showHint(t('You ran the red light! The traffic warden is after you for 10 seconds: keep going, don\'t slow down.'), 3800); }
    if (e.type === 'caught') showHint(t('The traffic warden caught you: a fine costs you a life.'), 3200);
    if (e.type === 'copgaveup') toast(t('Got away!'), 'go');
    if (e.type === 'bite') showHint(t('Caught! Drop something next time to keep it busy.'), 3200);
    if (e.type === 'dogeats') toast(t('Good dog!'));
    if (e.type === 'listdone') toast(t('Got everything! To the checkout!'), 'go');
    if (e.type === 'listbroken') showHint(t('Something on the list fell off: get another one!'), 3000);
    if (e.type === 'crash' && e.lives === 1) showHint(t('Careful: one more crash and you are out!'), 2500);
    if (e.type === 'heart') toast(e.coins ? t('+{n} coins', { n: e.coins }) : t('+1 life!'), 'go');
    if (e.type === 'boost') toast(t('Turbo!'), 'go');
    if (e.type === 'skijump' || e.type === 'geyser') toast(t('Wheee!'));
    if (e.type === 'vsbump') { toast(t('Bump!')); audio.play({ type: 'crash' }); }
    if (e.type === 'bridge') toast(t('The bridge is giving way: don\'t slow down!'), 'warn');
    if (e.type === 'wave' && !shownTips.has('wave')) { shownTips.add('wave'); showHint(t('A wave! Jump it, or it pushes you off the pier.'), 3200); }
    if (e.type === 'stolen' && !shownTips.has('stolen')) { shownTips.add('stolen'); showHint(t('It stole the top of your pile! Keep rolling fast, or drop something for it.'), 3500); }
    if (e.type === 'roller') showHint(t('A giant snowball is rolling after you: don\'t slow down!'), 3200);
    if (e.type === 'glide' && !shownTips.has('glide')) { shownTips.add('glide'); toast(t('Super jump!'), 'go'); }
    if (e.type === 'respawn' && !match) showHint(e.lives === 1 ? t('Careful: one more crash and you are out!') : game.fellInto === 'space' ? t('Stay on the rainbow: off the edge costs a life!') : t('Off the edge costs a life!'), 2500);
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
  demo = createGame((Math.random() * 2 ** 32) >>> 0, { track: pickTrack });
  setGame(R, demo);
}

function frame(dt) {
  if (mode === 'play' && game) {
    const autopilot = params.has('autopilot');
    const policy = POLICIES[params.get('policy')] || POLICIES.bot;
    if (match) {
      // versus: every cart moves on the same road
      acc += Math.min(dt, 0.1);
      while (acc >= DT) {
        acc -= DT;
        stepMatch(match, DT, autopilot ? policy(game) : readInput());
        handleEvents(game, drainEvents(game), true);
        for (const g of match.games.slice(1)) drainEvents(g);
      }
    } else simulate(game, dt, () => (autopilot ? policy(game) : readInput()), true);
    const sec = game.world.sectionAt(game.cart.y + 12).kind;
    if (sec !== lastSection) { lastSection = sec; if (SECTION_TOAST[sec] && game.checkoutY === null) toast(t(SECTION_TOAST[sec])); }
    audio.rolling(game.cart.v, game.cart.z <= 0.02 && !game.over);
    updateHud(false);
    if (match ? match.over && match.overT > 2 : game.over && game.overT > (game.won ? 2.2 : 1.6)) finish();
    render(R, game, dt);
  } else if (mode === 'end' && game) {
    if (match) for (const g of match.games.slice(1)) step(g, Math.min(dt, 0.05), 0);
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
  const on = (id, fn) => $(id).addEventListener('click', () => { wakeAudio(); audio.click(); fn(); });
  on('btn-play', () => { if (progress.isOpen(pickTrack)) { progress.selectTrack(pickTrack); start(pickTrack); } });
  // Arcade: pick the rivals' level, then go.
  on('btn-versus', () => { if (progress.isOpen(pickTrack)) { const lv = load(LEVEL_KEY, 'normal'); for (const b of document.querySelectorAll('.level-btn')) { b.classList.toggle('btn-primary', b.dataset.level === lv); b.classList.toggle('btn-secondary', b.dataset.level !== lv); } openScreen('screen-arcade'); } });
  for (const b of document.querySelectorAll('.level-btn')) on(b.id, () => { save(LEVEL_KEY, b.dataset.level); progress.selectTrack(pickTrack); start(pickTrack, true); });
  on('btn-arcade-back', () => openScreen('screen-menu'));
  on('btn-again', () => afterRide(() => start(game.track, Boolean(match))));
  on('btn-menu', () => afterRide(goMenu));
  on('btn-pause', pause);
  on('btn-resume', resume);
  on('btn-restart', () => start(game.track, Boolean(match)));
  on('track-prev', () => pickTrackBy(-1));
  on('track-next', () => pickTrackBy(1));
  on('btn-garage', () => { pickCart = progress.cart(); renderGarage(); openScreen('screen-garage'); });
  on('cart-prev', () => pickCartBy(-1));
  on('cart-next', () => pickCartBy(1));
  on('cart-action', cartAction);
  on('btn-garage-done', () => { renderMenu(); openScreen('screen-menu'); });
  on('btn-help', () => { renderHelp(); openScreen('screen-help'); });
  on('btn-help-done', () => openScreen('screen-menu'));
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
if (portalReady) {
  portal.onMute((muted) => { mutes.portal = muted; applyMute(); });
  portal.onPause((paused) => { mutes.pause = paused; applyMute(); if (paused) pause(); });
  // Progress saved on the platform joins this device's (a new device, cleared data).
  const cloud = await portal.loadProgress([...PROGRESS_KEYS, RIDES_KEY]);
  const local = Object.fromEntries(PROGRESS_KEYS.map((k) => [k, load(k, null)]));
  for (const [k, v] of Object.entries(mergeProgress(local, cloud))) save(k, v);
  if (typeof cloud[RIDES_KEY] === 'number' && cloud[RIDES_KEY] > (load(RIDES_KEY, 0) || 0)) save(RIDES_KEY, cloud[RIDES_KEY]);
}
// A tester's build (npm run build:unlocked): every track open, every cart in the garage, coins to spare.
if (BUILD.unlockAll) {
  save(KEYS.unlocked, TRACK_ORDER.length);
  save(KEYS.carts, CART_ORDER.slice(1));
  if (progress.coins() < 50000) save(KEYS.coins, 50000);
}
pickTrack = progress.track();
pickCart = progress.cart();
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
    get match() { return match; },
    start,
    pause,
    progress,
    /** Shows a track in the menu (and its ride behind it). */
    showTrack(id) { pickTrack = id; newDemo(); renderMenu(); },
    refresh() { renderMenu(); renderGarage(); },
    frame: (dt = 1 / 30) => frame(dt),
    press: (what) => { pressed[what] = true; },
    /** Simulates `seconds` of riding at once (the bot drives unless an input is given; in Arcade, every cart). */
    run(seconds, input = null) {
      const n = Math.round(seconds / DT);
      const policy = POLICIES[params.get('policy')] || POLICIES.bot;
      for (let i = 0; i < n && mode === 'play'; i++) {
        if (match) {
          stepMatch(match, DT, input === null ? policy(game) : input);
          for (const g of match.games.slice(1)) drainEvents(g);
        } else step(game, DT, input === null ? policy(game) : input);
        handleEvents(game, drainEvents(game), false);
        if (match ? match.over : game.over && game.overT > 1.6) { finish(); break; }
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
    /** Replaces the race ahead with a staged one (for the trailer): a list and a set of things at given distances. */
    stage({ list, things }) {
      game.list = list;
      game.world.wanted = list.map((l) => l.key);
      game.world.ensure(520);
      game.world.clear(12, 470);
      for (const e of things) {
        const w = game.world;
        const x = w.center(e.y) + (e.dx || 0) * (e.kind === 'dog' ? w.halfWidth(e.y) + 0.6 : 1);
        const ent = { id: w.nextId++, x, ...e };
        delete ent.dx;
        if (ent.type === 'walker') ent.x = w.center(e.y) + ent.side * (w.halfWidth(e.y) + 1.2);
        if (ent.type === 'barrier') ent.w = 1.0;
        w.entities.push(ent);
      }
      game.world.entities.sort((a, b) => a.y - b.y);
      buildList();
      updateHud(true);
    },
    caption(text, scale = 1) {
      const el = document.getElementById('caption');
      el.textContent = text || '';
      el.hidden = !text;
      el.style.setProperty('--pop', scale);
    },
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
        el.innerHTML = '<h1 class="logo"><img src="assets/logo.webp" alt="Cart Crash"></h1>';
        document.body.append(el);
      }
      for (let i = 0; i < 40; i++) frame(1 / 30);
    },
  };
}
