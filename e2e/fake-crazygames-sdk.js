// Stand-in for https://sdk.crazygames.com/crazygames-sdk-v3.js in the e2e tests:
// records every call in window.__sdkCalls and lets the test change settings.
(() => {
  const calls = [];
  const listeners = [];
  const settings = { muteAudio: true };
  const log = (name) => () => { calls.push(name); };
  window.__sdkCalls = calls;
  window.__sdkSetMute = (m) => { settings.muteAudio = m; for (const fn of listeners) fn({ ...settings }); };
  window.CrazyGames = {
    SDK: {
      init: async () => { calls.push('init'); },
      game: {
        settings,
        loadingStart: log('loadingStart'),
        loadingStop: log('loadingStop'),
        gameplayStart: log('gameplayStart'),
        gameplayStop: log('gameplayStop'),
        happytime: log('happytime'),
        addSettingsChangeListener: (fn) => { listeners.push(fn); },
      },
      user: { systemInfo: { locale: 'it-IT' } },
    },
  };
})();
