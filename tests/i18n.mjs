import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('', { url: 'http://localhost' });
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
const result = await build({ entryPoints: ['src/i18n/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
const { t, setLanguage, locale, LANGUAGE_KEY, i18n } = await import(url);
assert.equal(t('Settings'), 'Settings');
setLanguage('fr');
assert.equal(t('Settings'), 'Paramètres');
assert.equal(document.documentElement.lang, 'fr');
assert.equal(localStorage.getItem(LANGUAGE_KEY), 'fr');
assert.equal(locale(), 'fr-FR');
assert.equal(t('Untranslated source content'), 'Untranslated source content');
assert.equal(t('Size {{v0}}', { v0: 3 }), 'Taille 3');
assert.equal(new Intl.NumberFormat(locale()).format(12.5), '12,5');
const reloaded = await import(url + '#reload');
assert.equal(reloaded.locale(), 'fr-FR');
for (const [key, value] of Object.entries(i18n.getResourceBundle('fr', 'translation'))) {
 assert.deepEqual([...key.matchAll(/{{(\w+)}}/g)].map(x=>x[1]).sort(), [...value.matchAll(/{{(\w+)}}/g)].map(x=>x[1]).sort(), `Interpolation mismatch: ${key}`);
}
setLanguage('en');
assert.equal(t('Size {{v0}}', { v0: 3 }), 'Size 3');
localStorage.setItem(LANGUAGE_KEY, 'unsupported');
assert.equal((await import(url+'#invalid')).locale(), 'en-US');
console.log('French catalog, interpolation, persistence, fallback, document language and number formatting passed.');
