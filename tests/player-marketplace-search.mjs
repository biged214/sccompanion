import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const calls = [];
const listing = (id, operation, title = 'MG Scrip') => ({
  id, operation, title, id_item: 4454, type: 'item', is_sold_out: 0,
  user_username: 'Example', slug: `listing-${id}`
});
globalThis.DOMParser = class {
  parseFromString(value) { return { body: { textContent: value } }; }
};
globalThis.window = {
  fetch: async (path) => {
    calls.push(path);
    const url = new URL(path, 'https://example.test');
    let data;
    if (url.pathname.endsWith('star_systems')) data = [];
    else if (!url.searchParams.has('id_item')) data = [listing(1, 'sell')];
    else if (url.searchParams.get('operation') === 'sell') data = [listing(1, 'sell'), listing(2, 'sell')];
    else data = [listing(3, 'buy')];
    return { ok: true, json: async () => ({ status: 'ok', data }) };
  }
};
const source = readFileSync(new URL('../src/playerMarketplace/service.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { listingProviders } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const load = listingProviders[0].load;
const result = await load('Example', new AbortController().signal, ' MG SCRIP ');
assert.deepEqual(result.map((row) => row.id), ['uex:1', 'uex:2', 'uex:3']);
assert.equal(result[2].transaction, 'buy');
const expanded = calls.filter((path) => path.includes('id_item='));
assert.equal(expanded.length, 2);
assert.ok(expanded.every((path) => path.includes('username=Example')));
calls.length = 0;
await load('', new AbortController().signal, '');
assert.equal(calls.filter((path) => path.includes('id_item=')).length, 0);
calls.length = 0;
await load('', new AbortController().signal, 'not in recent feed');
assert.equal(calls.filter((path) => path.includes('id_item=')).length, 0);
console.log('Marketplace search: expansion, buy/sell coverage, deduplication, seller scope, and fallback passed.');
