import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const dom=new JSDOM(''); globalThis.DOMParser=dom.window.DOMParser; globalThis.Node=dom.window.Node;
const built=await build({entryPoints:['src/news/parser.ts'],bundle:true,write:false,format:'esm'});
const parser=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
async function get(url){const response=await fetch(url);assert.ok(response.ok,`${url}: ${response.status}`);return response.text();}
const listing=parser.parseNewsListing(await get('https://robertsspaceindustries.com/en/comm-link/rss'));
for(const article of listing.articles.slice(0,10)) {
 const html=await get(article.url); const source=parser.findNewsArticleSource(html);
 const body=source ? await get(source) : html;
 const text=parser.parseNewsArticle(body);
 assert.ok(text.length>150,article.title);
 console.log(`${article.category}: ${article.title}: ${text.length} characters`);
}
