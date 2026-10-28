// CrazyGames SDK v3, used only by the CrazyGames build (index.html loads the
// SDK there). Every call is optional: when the SDK is missing or a call
// fails, the game behaves like the web version.
let sdk = null;

/** Waits for the SDK script and initialises it (gives up after `ms`). */
export async function init(ms = 4000) {
  const deadline = Date.now() + ms;
  while (!window.CrazyGames?.SDK?.init && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  const SDK = window.CrazyGames?.SDK;
  if (!SDK?.init) return false;
  try {
    await Promise.race([SDK.init(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), Math.max(0, deadline - Date.now())))]);
    sdk = SDK;
  } catch {
    sdk = null;
  }
  return sdk !== null;
}

export const active = () => sdk !== null;

/** The loading screen: CrazyGames measures load time between these two calls. */
export function loading(on) {
  try { if (on) sdk?.game?.loadingStart?.(); else sdk?.game?.loadingStop?.(); } catch { /* optional */ }
}

let playing = null;
/** Tells CrazyGames when a ride is on screen (gameplayStart) or not (gameplayStop). */
export function gameplay(on) {
  if (!sdk || playing === on) return;
  playing = on;
  try { if (on) sdk.game.gameplayStart(); else sdk.game.gameplayStop(); } catch { /* optional */ }
}

/** A moment of celebration (a new record). */
export function happytime() {
  try { sdk?.game?.happytime?.(); } catch { /* optional */ }
}

/** The language CrazyGames shows the player (e.g. "it-IT"), or null. */
export function locale() {
  try { return sdk?.user?.systemInfo?.locale ?? null; } catch { return null; }
}

/** Calls fn(muted) whenever the CrazyGames audio setting changes (and once now). */
export function onMute(fn) {
  try {
    const settings = () => sdk?.game?.settings;
    if (settings()) fn(Boolean(settings().muteAudio));
    sdk?.game?.addSettingsChangeListener?.((s) => fn(Boolean((s ?? settings())?.muteAudio)));
  } catch { /* optional */ }
}

/** CrazyGames pauses the game itself; nothing to listen to. */
export function onPause() {}

/** No ads in the CrazyGames build. */
export async function adBreak() {}

/** Progress stays in localStorage (CrazyGames' automatic progress save covers it). */
export async function loadProgress() { return {}; }
export function saveProgress() {}
