import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
const built = await build({ entryPoints: ['src/news/parser.ts'], bundle: true, write: false, format: 'esm' });
const { parseNewsArticle } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
function component(props) {
  const el = dom.window.document.createElement('g-platform-client-component');
  el.setAttribute(':properties', JSON.stringify({ componentId: 'MiniGrid', componentProps: props }));
  return el.outerHTML;
}
const html = component({ gridOptions: { uiData: { elements: [
  { data: { text: '<h2>Article title</h2><p>Readable copy.</p>' }, dispositions: { large: { display: true } } },
  { data: { text: '<p>Hidden mobile copy</p>' }, dispositions: { large: { display: false } } }
] } } }) + component({ isHeaderDeclared: false, introduction: '<p>Placeholder header</p>', features: [{ title: 'Feature', body: '<p>Details here.</p>' }], content: { sku: { description: 'Store metadata' } } });
const text = parseNewsArticle(html);
assert.ok(text.includes('## Article title'));
assert.ok(text.includes('Readable copy.'));
assert.ok(text.includes('Details here.'));
assert.ok(!/Hidden mobile|Placeholder header|Store metadata/.test(text));
assert.equal(parseNewsArticle('<div id="layout-system"><h2>Legacy</h2><p>Old article.</p></div>'), '## Legacy\n\nOld article.');
assert.throws(() => parseNewsArticle('<g-platform-client-component :properties="invalid"></g-platform-client-component>'), /readable text/);
console.log('News parser regressions passed.');
if (process.argv.includes('--stdin')) {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  const article = parseNewsArticle(input);
  assert.ok(article.length > 300);
  assert.ok(!/Nemo enim|Duis aute/.test(article));
  console.log(`Live article: ${article.length} characters; ${article.split('\n\n').length} blocks.`);
  console.log(article.slice(0, 180));
}
