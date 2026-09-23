import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const server = await createServer({ server: { host: '127.0.0.1', port: 1435, strictPort: true } });
await server.listen();
let browser;
try {
 browser = await chromium.launch({ channel: 'chrome', headless: true });
 const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
 const errors=[];
 page.on('pageerror', e=>errors.push(e.message));
 await page.route('**/api/**', route=>route.fulfill({status:503,body:'Offline test'}));
 await page.goto('http://127.0.0.1:1435');
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 await page.getByLabel('Language',{exact:true}).selectOption('fr');
 assert.equal(await page.locator('html').getAttribute('lang'),'fr');
 assert.ok(await page.getByRole('heading',{name:'Paramètres',exact:true}).isVisible());
 await mkdir('output/french-qa',{recursive:true});
 await page.screenshot({path:'output/french-qa/settings.png',fullPage:true});
 await page.getByRole('button',{name:'Fermer les paramètres',exact:true}).click();
 const expected=['Guides de démarrage','Vaisseaux','Composants de vaisseau','Organisations','Plans de fabrication'];
 assert.deepEqual(await page.locator('section[aria-labelledby="category-reference"] .category-card').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))),expected);
 await page.getByRole('button',{name:'Ouvrir les paramètres',exact:true}).click();
 await page.getByLabel('Langue',{exact:true}).selectOption('es');
 assert.equal(await page.locator('html').getAttribute('lang'),'es');
 assert.ok(await page.getByRole('heading',{name:'Configuración',exact:true}).isVisible());
 await page.getByRole('button',{name:'Cerrar configuración',exact:true}).click();
 assert.ok(await page.getByRole('button',{name:'Naves',exact:true}).isVisible());
 await page.screenshot({path:'output/french-qa/home.png',fullPage:true});
 await page.getByRole('button',{name:'Abrir configuración',exact:true}).click();
 await page.getByLabel('Idioma',{exact:true}).selectOption('fr');
 await page.getByRole('button',{name:'Fermer les paramètres',exact:true}).click();
 await page.getByRole('button',{name:'Vaisseaux',exact:true}).click();
 await page.locator('.ship-search input').fill('Corsair');
 await page.getByRole('button',{name:'Ouvrir les paramètres',exact:true}).click();
 await page.getByLabel('Langue',{exact:true}).selectOption('en');
 await page.getByRole('button',{name:'Close settings',exact:true}).click();
 assert.equal(await page.getByPlaceholder('Search ships').inputValue(),'Corsair');
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 await page.getByLabel('Language',{exact:true}).selectOption('fr');
 await page.getByRole('button',{name:'Fermer les paramètres',exact:true}).click();
 await page.reload();
 assert.equal(await page.locator('html').getAttribute('lang'),'fr');
 await page.getByRole('button',{name:'Vaisseaux',exact:true}).click();
 assert.equal(await page.locator('.ship-search input').inputValue(),'Corsair');
 await page.getByRole('button',{name:'Accueil',exact:true}).click();
 await page.getByRole('button',{name:'Plans de fabrication',exact:true}).click();
 const acquisition=page.locator('select').filter({has:page.locator('option[value="Available by default"]')});
 await acquisition.selectOption('Mission-linked');
 assert.equal(await acquisition.inputValue(),'Mission-linked');
 assert.notEqual(await acquisition.locator('option:checked').innerText(),'Mission-linked');
 await page.screenshot({path:'output/french-qa/blueprints.png',fullPage:true});
 for(const width of [860,390]) {
  await page.setViewportSize({width,height:850});
  await page.screenshot({path:`output/french-qa/blueprints-${width}.png`,fullPage:true});
  const overflowing=await page.locator('body *').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().right>window.innerWidth+1).map(n=>`${n.tagName}.${n.className}`).slice(0,20));
  assert.ok(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),`Overflow at ${width}: ${overflowing.join(', ')}`);
 }
 await page.setViewportSize({width:1100,height:900});
 for(const name of ['Annonces','Actualités','Notes de mise à jour','État des serveurs','Guides de démarrage','Composants de vaisseau','Organisations','Marché','Marché des joueurs','Routes commerciales','Sessions en direct']) {
  await page.getByRole('button',{name:'Accueil',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('lang'),'fr');
 }
 assert.deepEqual(errors,[]);
 console.log('French browser: switching, persistence, filters, fallback/offline and responsive layout passed.');
} finally { await browser?.close(); await server.close(); }
