import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('',{url:'https://app.example'});globalThis.DOMParser=dom.window.DOMParser;globalThis.Node=dom.window.Node;
async function load(path){const b=await build({entryPoints:[path],bundle:true,write:false,format:'esm',plugins:[{name:'http',setup(b){b.onResolve({filter:/^@tauri-apps\/plugin-http$/},()=>({path:'http',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const fetch=(...args)=>globalThis.nativeFetch(...args);'}));}}]});return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);}
class Storage {
 data=new Map();limit=Infinity;
 get length(){return this.data.size} key(i){return [...this.data.keys()][i]??null}getItem(k){return this.data.get(k)??null}removeItem(k){this.data.delete(k)}
 setItem(k,v){const next=new Map(this.data);next.set(k,v);if([...next].reduce((n,[k,v])=>n+2*(k.length+v.length),0)>this.limit)throw new DOMException('Quota exceeded','QuotaExceededError');this.data=next;}
}
const storage=new Storage();globalThis.window={localStorage:storage};
const {saveArticleDetail,loadArticleDetail,saveFeedSnapshot}=await load('src/articles/cache.ts');
const key='star-citizen-status:patch-note-details:v4';
const detail={text:'Before\n\nAfter',media:[{kind:'image',url:'https://example.com/a.jpg',alt:'image'}],blocks:[{kind:'text',text:'Before'},{kind:'media',media:{kind:'image',url:'https://example.com/a.jpg',alt:'image'}},{kind:'text',text:'After'}]};
saveArticleDetail(key,'article',detail);assert.deepEqual(loadArticleDetail(key,'article').blocks,detail.blocks);assert.equal(loadArticleDetail(key,'article').text,detail.text);assert.equal(JSON.parse(storage.getItem(key)).article.content.text,undefined);
storage.setItem('user-settings','keep');storage.setItem('star-citizen-status:patch-note-details:v3','old');storage.setItem('star-citizen-status:news-details:v5','old');storage.setItem('sc-companion:announcement-details:v2','old');loadArticleDetail(key,'article');assert.equal(storage.getItem('star-citizen-status:patch-note-details:v3'),null);assert.equal(storage.getItem('star-citizen-status:news-details:v5'),null);assert.equal(storage.getItem('sc-companion:announcement-details:v2'),null);assert.equal(storage.getItem('user-settings'),'keep');
storage.data.clear();saveArticleDetail(key,'older','x'.repeat(200));storage.limit=1000;saveArticleDetail(key,'newer','y'.repeat(200));assert.equal(loadArticleDetail(key,'newer'),'y'.repeat(200));assert.equal(loadArticleDetail(key,'older'),null);
storage.limit=Infinity;for(let i=0;i<25;i++)saveArticleDetail(key,`large-${i}`,'x'.repeat(20000));assert.ok(storage.getItem(key).length*2<=512*1024);assert.ok(Object.keys(JSON.parse(storage.getItem(key))).length<=20);const before=storage.getItem(key);saveArticleDetail(key,'oversize','x'.repeat(600000));assert.equal(storage.getItem(key),before);
storage.setItem(key,'broken JSON');saveArticleDetail(key,'recovered','yes');assert.equal(loadArticleDetail(key,'recovered'),'yes');
storage.data.clear();storage.setItem('user-settings','keep');storage.limit=0;assert.doesNotThrow(()=>saveArticleDetail(key,'cannot-save',detail));assert.doesNotThrow(()=>saveFeedSnapshot('feed',{test:true}));assert.equal(storage.getItem('user-settings'),'keep');
const patch=await load('src/patchNotes/patchNotesService.ts');const announcements=await load('src/announcements/announcementService.ts');
const html='<script type="application/ld+json">'+JSON.stringify({'@type':'DiscussionForumPosting',articleBody:'Patch notes remain readable.'})+'</script>';
for(const native of [false,true]){window.__TAURI_INTERNALS__=native?{}:undefined;window.fetch=globalThis.nativeFetch=async()=>({ok:true,text:async()=>html});assert.equal((await patch.fetchPatchNoteDetails('https://robertsspaceindustries.com/spectrum/community/SC/forum/190048/thread/test')).text,'Patch notes remain readable.');assert.equal((await announcements.fetchAnnouncementDetails('https://robertsspaceindustries.com/spectrum/community/SC/forum/1/thread/test')).text,'Patch notes remain readable.');}
Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Disabled','SecurityError')}});assert.doesNotThrow(()=>saveArticleDetail(key,'disabled',detail));assert.equal(loadArticleDetail(key,'disabled'),null);assert.doesNotThrow(()=>saveFeedSnapshot('feed',{}));
console.log('Cache regressions passed: quota exhaustion, eviction, size bounds, compact round-trip, legacy cleanup, corrupt/disabled storage, and browser/native article loading.');
