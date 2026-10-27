// Translations. English text is the key: t('Play again') returns the current
// language's version, or the English text when a translation is missing.
// Placeholders look like {name}.
import { load, save } from './storage.js';

export const LANGS = { en: 'English', it: 'Italiano', fr: 'Français', es: 'Español', de: 'Deutsch', pt: 'Português' };
const KEY = 'cartcrash:lang';

let lang = 'en';
let dict = {};

/** Saved choice, else the preferred locale or the first browser language we speak, else English. */
export function detectLang(preferred = null) {
  const saved = load(KEY, null);
  if (saved && LANGS[saved]) return saved;
  const browser = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
  const wanted = preferred ? [preferred, ...browser] : browser;
  for (const l of wanted) {
    const code = String(l || '').slice(0, 2).toLowerCase();
    if (LANGS[code]) return code;
  }
  return 'en';
}

/** Loads the language's strings. Never throws: English is the fallback. */
/** preferred: a locale such as "it-IT" that wins over the browser's (the player's own choice still wins). */
export async function initI18n(preferred = null, forced = null) {
  lang = forced && LANGS[forced] ? forced : detectLang(preferred);
  dict = {};
  if (lang !== 'en') {
    try {
      dict = (await import(`./locales/${lang}.js`)).default;
    } catch {
      lang = 'en';
      dict = {};
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  return lang;
}

export const getLang = () => lang;

export function setLang(next) {
  if (!LANGS[next]) return;
  save(KEY, next);
}

export function t(text, vars) {
  let out = dict[text] ?? text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

export const formatNumber = (n) => new Intl.NumberFormat(lang).format(n);
