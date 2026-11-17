import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('', {url:'https://app.example'});
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
globalThis.window = dom.window;
const built = await build({entryPoints:['src/news/newsService.ts'], bundle:true, write:false, format:'esm', plugins:[{name:'mock-native-http', setup(b){b.onResolve({filter:/^@tauri-apps\/plugin-http$/},()=>({path:'http',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const fetch = (...args) => globalThis.nativeFetch(...args);'}));}}]});
const {fetchNewsDetails} = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const shell = (content) => {const e=dom.window.document.createElement('script');e.setAttribute('data-platform-client-props',JSON.stringify({routerParams:{component:'AlexandriaPage',props:{content}}}));return e.outerHTML;};
const introduction = dom.window.document.createElement('g-introduction');
introduction.setAttribute(':info', JSON.stringify({title:'Weekly',contents:['<p>Real article body.</p>']}));
const url='https://robertsspaceindustries.com/comm-link/transmission/123-test';
for (const native of [false,true]) {
 window.__TAURI_INTERNALS__=native ? {} : undefined;
 for (const scenario of ['success','secondary-failure','offline','video','inline','unsafe-source','storage']) {
  window.localStorage.clear();const calls=[];
  const fetcher=async (path)=>{calls.push(path);if(scenario==='offline')throw Error('offline');if(calls.length===1)return {ok:true,text:async()=>scenario==='inline'?shell({html:'<p>Inline article.</p>'}):shell({htmlUrl:scenario==='unsafe-source'?'https://evil.example/alexandria/test':'https://robertsspaceindustries.com/alexandria/html/test?version=1'})};return {ok:scenario!=='secondary-failure',status:503,text:async()=>scenario==='video'?'<g-trailer video-id="123"></g-trailer>':introduction.outerHTML};};
  window.fetch=fetcher;globalThis.nativeFetch=fetcher;
  const original=dom.window.Storage.prototype.setItem;
  if(scenario==='storage')dom.window.Storage.prototype.setItem=()=>{throw Error('full');};
  const detail=await fetchNewsDetails(url,'Listing summary',scenario==='video');
  const result=typeof detail === 'string' ? detail : detail.text;
  dom.window.Storage.prototype.setItem=original;
  if(['success','storage'].includes(scenario))assert.match(result,/Real article body/);
  else if(scenario==='inline')assert.match(result,/Inline article/);
  else {assert.match(result,/Listing summary/);assert.match(result,/original RSI article/);assert.equal(window.localStorage.length,0);}
  if(scenario==='unsafe-source')assert.equal(calls.length,1);
  if(scenario==='success')assert.equal(calls[1],native?'https://robertsspaceindustries.com/alexandria/html/test?version=1':'/api/rsi-comm-link/alexandria/html/test?version=1');
 }
}
console.log('News service: browser and native transport regressions passed.');
