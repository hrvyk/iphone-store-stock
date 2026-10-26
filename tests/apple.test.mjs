import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {variants,stores,emptyCells,isFresh,availabilityChanges} from '../lib/catalog.mjs';
import {parsePickup,verifyCatalog,appleFetch,checkVariant} from '../lib/apple.mjs';
const variant=variants[0];
const payload=(raw='available')=>({body:{content:{pickupMessage:{stores:stores.map(s=>({storeName:s.name,storeNumber:'fixture-'+s.id,partsAvailability:{[variant.part]:{pickupDisplay:raw}}}))}}}});
test('30 independent cells begin unknown',()=>{const cells=emptyCells();assert.equal(cells.length,30);assert.equal(new Set(cells.map(c=>c.storeId+c.variantId)).size,30);assert(cells.every(c=>c.status==='unknown'&&!c.lastSuccessAt))});
test('all four exact product identities verified against saved official page',()=>assert(verifyCatalog(readFileSync(new URL('./fixtures/catalog.html',import.meta.url),'utf8'),variants.filter(v=>v.modelId==='duo'))));
test('wrong SKU or wrong capacity is rejected',()=>assert.throws(()=>verifyCatalog('{"partNumber":"MK2F4ZA/A","name":"iPhone Duo 1TB Star White"}',[variant])));
test('explicit available and unavailable statuses only',()=>{assert(parsePickup(payload(),variant).every(c=>c.status==='available'));assert(parsePickup(payload('unavailable'),variant).every(c=>c.status==='unavailable'));for(const raw of ['true','inStock',true,null])assert(parsePickup(payload(raw),variant).every(c=>c.status==='unknown'))});
test('missing store is unknown and cannot imply sold out',()=>{const p=payload();p.body.content.pickupMessage.stores.pop();const cells=parsePickup(p,variant);assert.equal(cells.length,6);assert.equal(cells.at(-1).status,'unknown')});
test('empty or changed upstream payload is a source error',()=>{for(const p of [{},{body:{}},{body:{content:{pickupMessage:{stores:[]}}}}])assert.throws(()=>parsePickup(p,variant))});
test('stale stock is not fresh, error never becomes fresh',()=>{const now=Date.now();assert(!isFresh({status:'available',lastSuccessAt:new Date(now-601000).toISOString()},now));assert(!isFresh({status:'error',lastSuccessAt:new Date(now).toISOString()},now))});
test('notifications only on fresh new availability',()=>{const cells=parsePickup(payload(),variant);assert.equal(availabilityChanges(cells,cells).length,0);assert.equal(availabilityChanges([],cells).length,6);assert.equal(availabilityChanges([],cells,Date.now()+601000).length,0)});
test('SSRF guard rejects arbitrary origins and paths',async()=>{await assert.rejects(()=>appleFetch('https://evil.example/'));await assert.rejects(()=>appleFetch('https://www.apple.com/private'))});
test('rate limiting retains Retry-After',async()=>{await assert.rejects(()=>appleFetch('https://www.apple.com/hk-zh/shop/fulfillment-messages',async()=>new Response('',{status:429,headers:{'Retry-After':'1200'}})),e=>e.status===429&&e.retryAfter===1200000)});
test('HTML challenge does not become stock result',async()=>await assert.rejects(()=>checkVariant(variant,async()=>new Response('<html>challenge</html>'))));
test('real Apple retail pickup-message response covers all six HK stores',()=>{const p=JSON.parse(readFileSync(new URL('./fixtures/pickup-real.json',import.meta.url),'utf8'));const cells=parsePickup(p,variant);assert.equal(cells.length,6);assert(cells.every(c=>['available','unavailable'].includes(c.status)));assert(cells.every(c=>/^R\d+$/.test(c.officialStoreNumber)))});
test('foreign region with same store name is never accepted',()=>{const p=payload();p.body.content.pickupMessage.stores[0].country='US';assert.equal(parsePickup(p,variant)[0].status,'unknown')});
test('edge compatible manual redirect policy never follows another origin',async()=>{
 await assert.rejects(()=>appleFetch('https://www.apple.com/hk-zh/shop/buy-iphone/iphone-duo',async(url,options)=>{assert.equal(options.redirect,'manual');return new Response('',{status:302,headers:{Location:'https://outside.example/'}})}),e=>e.status===302);
});

test('iPhone 18 Pro exact identity verified from its own official page',()=>assert(verifyCatalog(readFileSync(new URL('./fixtures/catalog-18-pro.html',import.meta.url),'utf8'),variants.filter(v=>v.modelId==='iphone18pro'))));
test('real iPhone 18 Pro available response parses all six stores',()=>{const p=JSON.parse(readFileSync(new URL('./fixtures/pickup-18-pro-real.json',import.meta.url),'utf8'));const cells=parsePickup(p,variants.find(v=>v.modelId==='iphone18pro'));assert.equal(cells.length,6);assert(cells.every(c=>c.status==='available'))});
