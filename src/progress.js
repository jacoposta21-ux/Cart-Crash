// What the player keeps between rides: coins, the carts bought, the cart in
// use, the tracks unlocked (finish one to open the next), the track chosen and
// the best score on each track. Kept through a store { load, save } (local
// storage, mirrored to the portal's cloud save where there is one).
import { TRACKS, TRACK_ORDER } from './tracks.js';
import { CARTS, CART_ORDER } from './carts.js';

export const KEYS = {
  coins: 'cartcrash:coins',
  carts: 'cartcrash:carts',
  cart: 'cartcrash:cart',
  unlocked: 'cartcrash:unlocked', // how many tracks are open (1..4)
  track: 'cartcrash:track',
  won: 'cartcrash:won', // tracks finished at least once
};
/** The Old Town keeps the key it always had. */
export const bestKey = (track) => (track === 'borgo' ? 'cartcrash:bestScore' : `cartcrash:best:${track}`);
/** Every key worth a cloud save. */
export const PROGRESS_KEYS = [KEYS.coins, KEYS.carts, KEYS.cart, KEYS.unlocked, KEYS.track, KEYS.won, ...TRACK_ORDER.map(bestKey)];

export function createProgress(store) {
  const P = {
    coins: () => Math.max(0, Math.floor(Number(store.load(KEYS.coins, 0)) || 0)),
    addCoins(n) { if (n > 0) store.save(KEYS.coins, P.coins() + n); },
    owned: () => {
      const list = store.load(KEYS.carts, null);
      return ['classic', ...(Array.isArray(list) ? list.filter((id) => CARTS[id] && id !== 'classic') : [])];
    },
    has: (id) => P.owned().includes(id),
    /** Buys a cart if there are coins enough. Returns true when bought. */
    buy(id) {
      const cart = CARTS[id];
      if (!cart || P.has(id) || P.coins() < cart.price) return false;
      store.save(KEYS.coins, P.coins() - cart.price);
      store.save(KEYS.carts, [...P.owned().filter((c) => c !== 'classic'), id]);
      P.selectCart(id);
      return true;
    },
    cart: () => { const id = store.load(KEYS.cart, 'classic'); return P.has(id) ? id : 'classic'; },
    selectCart(id) { if (P.has(id)) store.save(KEYS.cart, id); },
    unlocked: () => Math.max(1, Math.min(TRACK_ORDER.length, Math.floor(Number(store.load(KEYS.unlocked, 1)) || 1))),
    isOpen: (id) => TRACK_ORDER.indexOf(id) >= 0 && TRACK_ORDER.indexOf(id) < P.unlocked(),
    track: () => { const id = store.load(KEYS.track, 'borgo'); return TRACKS[id] && P.isOpen(id) ? id : 'borgo'; },
    selectTrack(id) { if (P.isOpen(id)) store.save(KEYS.track, id); },
    /** A finished race on this track: opens the next one. Returns its id when it was locked until now. */
    finished(id) {
      const next = TRACK_ORDER.indexOf(id) + 1;
      if (!P.isOpen(id) || next <= 0 || next >= TRACK_ORDER.length || next < P.unlocked()) return null;
      store.save(KEYS.unlocked, next + 1);
      return TRACK_ORDER[next];
    },
    /** The first win on a track: true once (the big reward), then false. */
    firstWin(id) {
      const won = store.load(KEYS.won, []);
      const list = Array.isArray(won) ? won : [];
      if (list.includes(id)) return false;
      store.save(KEYS.won, [...list, id]);
      return true;
    },
    best: (id) => { const b = store.load(bestKey(id), null); return typeof b === 'number' ? b : null; },
    setBest(id, total) { store.save(bestKey(id), total); },
  };
  return P;
}

/**
 * Merges progress saved on the platform with this device's: the larger coin
 * count, every cart bought, the most tracks open, the best score of the two.
 */
export function mergeProgress(local, cloud) {
  const out = {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (num(cloud[KEYS.coins]) !== null && cloud[KEYS.coins] > (num(local[KEYS.coins]) ?? 0)) out[KEYS.coins] = cloud[KEYS.coins];
  if (Array.isArray(cloud[KEYS.carts])) {
    const all = [...new Set([...(Array.isArray(local[KEYS.carts]) ? local[KEYS.carts] : []), ...cloud[KEYS.carts]])].filter((id) => CARTS[id]);
    if (all.length > (Array.isArray(local[KEYS.carts]) ? local[KEYS.carts].length : 0)) out[KEYS.carts] = all;
  }
  if (Array.isArray(cloud[KEYS.won])) {
    const all = [...new Set([...(Array.isArray(local[KEYS.won]) ? local[KEYS.won] : []), ...cloud[KEYS.won]])].filter((id) => TRACKS[id]);
    if (all.length > (Array.isArray(local[KEYS.won]) ? local[KEYS.won].length : 0)) out[KEYS.won] = all;
  }
  if (num(cloud[KEYS.unlocked]) !== null && cloud[KEYS.unlocked] > (num(local[KEYS.unlocked]) ?? 1)) out[KEYS.unlocked] = cloud[KEYS.unlocked];
  for (const id of TRACK_ORDER) {
    const k = bestKey(id);
    if (num(cloud[k]) !== null && (num(local[k]) === null || cloud[k] < local[k])) out[k] = cloud[k];
  }
  return out;
}

export { CART_ORDER, TRACK_ORDER };
