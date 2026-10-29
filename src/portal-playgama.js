// Playgama Bridge SDK, used only by the Playgama build (index.html loads the
// SDK there, playgama-bridge-config.json sits next to it). Every call is
// optional: when the SDK is missing or a call fails, the game behaves like the
// web version.
let bridge = null;
let readySent = false;

/** Waits for the SDK script and initialises it (gives up after `ms`). */
export async function init(ms = 6000) {
  const deadline = Date.now() + ms;
  while (!window.bridge?.initialize && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  const sdk = window.bridge;
  if (!sdk?.initialize) return false;
  try {
    await Promise.race([sdk.initialize(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), Math.max(0, deadline - Date.now())))]);
    bridge = sdk;
  } catch {
    bridge = null;
  }
  return bridge !== null;
}

export const active = () => bridge !== null;

const send = (message) => {
  try { bridge?.platform?.sendMessage?.(message)?.catch?.(() => {}); } catch { /* optional */ }
};

/** The end of the loading screen tells Playgama the game is ready (once). */
export function loading(on) {
  if (on || readySent || !bridge) return;
  readySent = true;
  send('game_ready');
}

let playing = null;
/** Tells Playgama when a ride is on screen or not. */
export function gameplay(on) {
  if (!bridge || playing === on) return;
  playing = on;
  send(on ? 'gameplay_started' : 'gameplay_stopped');
}

export function happytime() {}

/** The platform's language (e.g. "it"), or null. */
export function locale() {
  try { return bridge?.platform?.language || null; } catch { return null; }
}

/** Calls fn(muted) whenever the platform's audio switch changes (and once now). */
export function onMute(fn) {
  try {
    fn(bridge.platform.isAudioEnabled === false);
    bridge.platform.on('audio_state_changed', (enabled) => fn(!enabled));
  } catch { /* optional */ }
}

/** Calls fn(paused) when the platform pauses or resumes the game (tab hidden, overlays). */
export function onPause(fn) {
  try { bridge.platform.on('pause_state_changed', (paused) => fn(Boolean(paused))); } catch { /* optional */ }
}

/**
 * A natural break between rides: shows an interstitial if the platform has one
 * ready. Resolves when it is over; onShow(true/false) brackets the ad itself.
 */
export function adBreak(onShow = () => {}) {
  const ads = bridge?.advertisement;
  if (!ads?.isInterstitialSupported) return Promise.resolve();
  return new Promise((resolve) => {
    let opened = false, done = false;
    const onState = (state) => {
      if (state === 'opened' && !opened) { opened = true; onShow(true); }
      if (state === 'closed' || state === 'failed') finish();
    };
    const finish = () => {
      if (done) return;
      done = true;
      try { ads.off('interstitial_state_changed', onState); } catch { /* optional */ }
      if (opened) onShow(false);
      resolve();
    };
    try {
      ads.on('interstitial_state_changed', onState);
      ads.showInterstitial();
    } catch { finish(); return; }
    // No ad on screen within a moment (too soon after the last one, no ad, or the
    // platform never answers): carry on rather than leave the player waiting.
    setTimeout(() => { if (!opened) finish(); }, 2500);
    setTimeout(finish, 40000);
  });
}

/** Saved progress from the platform's storage: { key: value } for the keys it has. */
export async function loadProgress(keys) {
  if (!bridge?.storage) return {};
  try {
    const values = await bridge.storage.get(keys);
    const out = {};
    keys.forEach((k, i) => { if (values?.[i] !== null && values?.[i] !== undefined) out[k] = values[i]; });
    return out;
  } catch {
    return {};
  }
}

export function saveProgress(key, value) {
  try { bridge?.storage?.set(key, value)?.catch?.(() => {}); } catch { /* optional */ }
}
