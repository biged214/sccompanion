import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const props={componentId:'MiniGrid',componentProps:{items:[{text:'<h3>GEAR UP IN STYLE</h3><p>With official Star Citizen merchandise</p>'},...[1,2,3].map(n=>({image:{originalFormat:{desktop:`https://media.robertsspaceindustries.com/merch-${n}.svg`}}})),{button:{text:'SHOP NOW',action:{actionType:'link',href:'https://robertsspaceindustries.com/iae2956#/Merchandise'}}}]}};
const markup=`<article><p>Article introduction</p><g-component :properties="${JSON.stringify(props).replaceAll('&','&amp;').replaceAll('"','&quot;')}"></g-component><p>After merchandise</p></article>`;
const server=await createServer({server:{host:'127.0.0.1',port:1439,strictPort:true}});await server.listen();
let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:900}});
 await page.route('**/api/**',route=>{
  const url=route.request().url();
  if(url.includes('/api/rsi-news'))return route.fulfill({body:'<a class="content-block2 hub-block" href="/comm-link/transmission/123-merch"><span class="title">Merchandise test</span><div class="over"><div class="body">Summary</div></div></a>'});
  if(url.includes('/api/rsi-comm-link'))return route.fulfill({body:markup});
  return route.fulfill({status:503,body:'Test'});
 });
 await page.route('https://media.robertsspaceindustries.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#12829e"/><text x="100" y="450" fill="white" font-size="60">Merchandise</text></svg>'}));
 await page.goto('http://127.0.0.1:1439');
 await page.getByRole('button',{name:'News',exact:true}).click();
 const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Merchandise test',exact:true})});
 await card.getByRole('button',{name:'Read',exact:true}).click();
 const promo=card.locator('.article-promotion');await promo.waitFor();
 assert.equal(await promo.locator('img').count(),3);
 assert.equal(await promo.getByRole('link',{name:'SHOP NOW',exact:true}).getAttribute('href'),'https://robertsspaceindustries.com/iae2956#/Merchandise');
 assert.equal(await card.getByRole('link',{name:'Open original image',exact:true}).count(),0);
 for(const width of [1100,390]) {
  await page.setViewportSize({width,height:900});
  assert.ok(await promo.locator('img').evaluateAll(imgs=>imgs.every(img=>img.getBoundingClientRect().height<=140)));
  assert.ok(await promo.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 }
 await mkdir('output/media-qa',{recursive:true});
 await page.screenshot({path:'output/media-qa/merchandise.png',fullPage:true});
 console.log('Merchandise browser checks passed: compact images, original shop link, mobile layout.');
} finally {await browser?.close();await server.close();}
