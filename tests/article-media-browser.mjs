import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const server=await createServer({server:{host:'127.0.0.1',port:1438,strictPort:true}});await server.listen();
let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:900}});
 await page.route('**/api/**',route=>{
  const url=route.request().url();
  if(url.includes('/api/rsi-news'))return route.fulfill({body:'<a class="content-block2 hub-block" href="/comm-link/transmission/123-media"><span class="title">Media test article</span><div class="over"><div class="body">Summary</div></div></a>'});
  if(url.includes('/api/rsi-comm-link'))return route.fulfill({body:'<div id="layout-system"><h2>Media test</h2><p>Article text remains visible.</p><img alt="Spaceship" src="https://media.robertsspaceindustries.com/test.png"><p>Between image and video.</p><video src="https://media.robertsspaceindustries.com/test.mp4"></video><g-trailer video-id="dQw4w9WgXcQ"></g-trailer><p>After all media.</p></div>'});
  return route.fulfill({status:503,body:'Test'});
 });
 await page.route('https://media.robertsspaceindustries.com/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
 await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<p>Mock video provider</p>'}));
 await page.goto('http://127.0.0.1:1438');
 await page.getByRole('button',{name:'News',exact:true}).click();
 const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Media test article',exact:true})});
 await card.getByRole('button',{name:'Read',exact:true}).click();
 await card.locator('.article-media img').waitFor();
 assert.equal(await card.locator('iframe').count(),0);
 assert.equal(await card.locator('video').getAttribute('preload'),'none');
 assert.equal(await card.locator('video').getAttribute('autoplay'),null);
 await card.getByRole('button',{name:'Play video',exact:true}).click();
 assert.match(await card.locator('iframe').getAttribute('src'),/^https:\/\/www.youtube-nocookie.com\/embed\//);
 assert.ok(await card.getByText('Article text remains visible.').isVisible());
 const ordered = await card.locator('.article-content').evaluate(el => [...el.children].map(child => child.querySelector('img') ? 'image' : child.querySelector('video') ? 'video' : child.querySelector('iframe') ? 'embed' : child.textContent.trim()).filter(Boolean));
 assert.deepEqual(ordered,['Media test','Article text remains visible.','image','Between image and video.','video','embed','After all media.']);

 await mkdir('output/media-qa',{recursive:true});
 await page.screenshot({path:'output/media-qa/news.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await card.locator('.article-media').evaluateAll(elements=>elements.every(el=>el.scrollWidth<=el.clientWidth+1)));
 await card.locator('img').evaluate(el=>el.dispatchEvent(new Event('error')));
 assert.ok(await card.getByText('This media could not be loaded. Open the original media to view it.').isVisible());
 await card.getByRole('button',{name:'Close',exact:true}).click();
 assert.equal(await card.locator('iframe').count(),0);
 console.log('Browser media: article rendering, click-to-play, controls, no autoplay, narrow layout, error fallback and unmount passed.');
} finally {await browser?.close();await server.close();}
