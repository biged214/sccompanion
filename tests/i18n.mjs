import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
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
for (const language of ['fr', 'es']) {
for (const [key, value] of Object.entries(i18n.getResourceBundle(language, 'translation'))) {
 assert.deepEqual([...key.matchAll(/{{(\w+)}}/g)].map(x=>x[1]).sort(), [...value.matchAll(/{{(\w+)}}/g)].map(x=>x[1]).sort(), `Interpolation mismatch: ${key}`);
}
}
const planner = ts.createSourceFile('planner.tsx', readFileSync('src/tradeRoutes/TradeRoutePlanner.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const spanish = i18n.getResourceBundle('es', 'translation');
const french = i18n.getResourceBundle('fr', 'translation');
assert.deepEqual(Object.keys(french).filter(key => !Object.hasOwn(spanish, key)), [], 'Spanish must cover every French catalog entry');
// Check all literal UI calls, including those outside the route planner.
for (const file of readdirSync('src', { recursive: true }).filter(file => /\.(tsx?|jsx?)$/.test(file) && !file.startsWith('i18n'))) {
 const source = ts.createSourceFile(file, readFileSync('src/' + file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
 function checkCalls(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
   assert.ok(Object.hasOwn(spanish, node.arguments[0].text), `${file}: missing Spanish UI text: ${node.arguments[0].text}`);
  }
  ts.forEachChild(node, checkCalls);
 }
 checkCalls(source);
}
function checkPlanner(node) {
 if (ts.isCallExpression(node) && node.expression.getText(planner) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
  assert.ok(Object.hasOwn(spanish, node.arguments[0].text), `Missing Spanish route label: ${node.arguments[0].text}`);
 }
 ts.forEachChild(node, checkPlanner);
}
checkPlanner(planner);
for (const key of ['travel + handling', 'fallback estimate', 'refining...', 'Standard cargo access', 'External loading required']) {
 assert.ok(Object.hasOwn(spanish, key), `Missing dynamic Spanish route label: ${key}`);
}
setLanguage('en');
assert.equal(t('Size {{v0}}', { v0: 3 }), 'Size 3');
setLanguage('es');
assert.equal(t('Settings'), 'Configuración');
assert.equal(document.documentElement.lang, 'es');
assert.equal(localStorage.getItem(LANGUAGE_KEY), 'es');
assert.equal(locale(), 'es-ES');
assert.equal(t('Size {{v0}}', { v0: 3 }), 'Tamaño 3');
assert.equal(t('Untranslated source content'), 'Untranslated source content');
localStorage.setItem(LANGUAGE_KEY, 'unsupported');
assert.equal((await import(url+'#invalid')).locale(), 'en-US');
console.log(`French/Spanish catalogs (${Object.keys(french).length} shared keys), all UI calls, interpolation, persistence, fallback and locale checks passed.`);
