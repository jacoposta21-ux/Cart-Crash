// The game portal of this build: CrazyGames, Playgama, or none (the web build).
// Both adapters have the same calls; every call is optional.
import { BUILD } from './build.js';
import * as crazygames from './portal-crazygames.js';
import * as playgama from './portal-playgama.js';

const ADAPTERS = { crazygames, playgama };

/** The adapter for this build; the plain web build gets one that does nothing. */
export const portal = ADAPTERS[BUILD.target] ?? {
  init: async () => false,
  loading() {}, gameplay() {}, happytime() {}, onMute() {}, onPause() {},
  locale: () => null,
  adBreak: async () => {},
  loadProgress: async () => ({}),
  saveProgress() {},
};
