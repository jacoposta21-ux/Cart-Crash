// Every English text the game translates: t('...') calls, data-i18n attributes
// in index.html and the word lists in src/strings.js. Prints them as JSON.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/util.mjs';
import * as strings from '../src/strings.js';

export function i18nKeys() {
  const keys = new Set();
  for (const f of readdirSync(join(ROOT, 'src')).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(ROOT, 'src', f), 'utf8');
    for (const m of src.matchAll(/\b(?:t|text)\('((?:[^'\\]|\\.)+)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
  }
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)) keys.add(m[1]);
  for (const v of Object.values(strings)) if (!Array.isArray(v)) for (const s of Object.values(v)) keys.add(s);
  return [...keys].sort();
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(i18nKeys(), null, 1));
