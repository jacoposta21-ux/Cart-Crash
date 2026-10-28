// Stand-in for https://bridge.playgama.com/v2/stable/playgama-bridge.js in the
// e2e tests: records every call in window.__sdkCalls, keeps storage in memory
// and lets the test switch audio, pause the game and decide whether an ad shows.
(() => {
  const calls = [];
  const handlers = {};
  const emit = (name, ...args) => { for (const fn of handlers[name] || []) fn(...args); };
  const emitter = {
    on: (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); },
    off: (name, fn) => { handlers[name] = (handlers[name] || []).filter((f) => f !== fn); },
  };
  const store = { 'cartcrash:bestScore': 41.5, 'cartcrash:rides': 12 };
  let adReady = true;
  window.__sdkCalls = calls;
  window.__sdkStore = store;
  window.__sdkSetAudio = (on) => { platform.isAudioEnabled = on; emit('audio_state_changed', on); };
  window.__sdkPause = (paused) => emit('pause_state_changed', paused);
  window.__sdkAdReady = (ready) => { adReady = ready; };
  window.__sdkCloseAd = () => { calls.push('adclosed'); emit('interstitial_state_changed', 'closed'); };
  const platform = {
    ...emitter,
    language: 'de',
    isAudioEnabled: false,
    sendMessage: async (message) => { calls.push(message); },
  };
  window.bridge = {
    initialize: async () => { calls.push('initialize'); },
    platform,
    advertisement: {
      ...emitter,
      isInterstitialSupported: true,
      interstitialState: 'closed',
      showInterstitial: () => {
        calls.push('showInterstitial');
        if (adReady) emit('interstitial_state_changed', 'opened');
      },
    },
    storage: {
      get: async (keys) => { calls.push('storage.get'); return keys.map((k) => (k in store ? store[k] : null)); },
      set: async (key, value) => { calls.push(`storage.set:${key}`); store[key] = value; },
    },
  };
})();
