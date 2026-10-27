import { test } from 'node:test';
import assert from 'node:assert/strict';
import { i18nKeys } from '../scripts/i18n-keys.mjs';
import { LANGS } from '../src/i18n.js';

const keys = i18nKeys();

for (const lang of Object.keys(LANGS).filter((l) => l !== 'en')) {
  test(`${lang}: every string is translated, with the same placeholders`, async () => {
    const dict = (await import(`../src/locales/${lang}.js`)).default;
    const missing = keys.filter((k) => !(k in dict));
    assert.deepEqual(missing, []);
    for (const k of keys) {
      const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
      assert.equal(ph(dict[k]), ph(k), `${lang}: ${k}`);
      assert.ok(dict[k].trim().length > 0);
    }
    const unused = Object.keys(dict).filter((k) => !keys.includes(k));
    assert.deepEqual(unused, [], 'no leftovers');
  });
}
