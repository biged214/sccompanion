import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.DOMParser = dom.window.DOMParser;
async function load(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'browser' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { prepareGuide, videoEmbed } = await load('src/guides/GuideContent.tsx');
const result = prepareGuide('<h2 id="flight">Flight</h2><script>alert(1)</script><p onclick="evil()">Text</p><img src="/hc/image.png" onerror="evil()"><a href="javascript:evil()">bad</a><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe><video src="https://example.org/video.mp4"></video>', 'https://support.robertsspaceindustries.com/hc/guide');
assert.ok(result.html.includes('<h2'));
assert.ok(result.html.includes('https://support.robertsspaceindustries.com/hc/image.png'));
assert.ok(!/onclick|onerror|javascript:|<script|<iframe/.test(result.html));
assert.ok(result.html.includes('controls'));
assert.equal(result.videos[0].embed, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
assert.equal(videoEmbed('https://youtube.com.evil.test/embed/dQw4w9WgXcQ'), null);
assert.equal(videoEmbed('http://youtube.com/embed/dQw4w9WgXcQ'), null);
assert.equal(videoEmbed('https://vimeo.com/123456'), 'https://player.vimeo.com/video/123456');
const { fetchGuides, guideGroup } = await load('src/guides/service.ts');
assert.equal(guideGroup('How to Land Your Ship'), 'Ships & Travel');
assert.equal(guideGroup('Equipping Your Character'), 'Equipment & Daily Life');
let calls = 0;
window.fetch = async () => ({ ok: true, json: async () => {
  calls++;
  return { articles: [{ id: calls, title: 'Missions and Contracts', body: '<p>Guide</p>', updated_at: '2026-01-01' }], next_page: calls === 1 ? 'https://support.robertsspaceindustries.com/api/v2/help_center/en-us/categories/360000783053/articles.json?page=2' : null };
} });
assert.equal((await fetchGuides(new AbortController().signal)).length, 2);
window.fetch = async () => ({ ok: true, json: async () => ({ articles: [], next_page: 'https://evil.test/api' }) });
await assert.rejects(fetchGuides(new AbortController().signal), /pagination/);
console.log('Guides: sanitization, media allowlist, relative images, grouping, pagination, and origin validation passed.');
