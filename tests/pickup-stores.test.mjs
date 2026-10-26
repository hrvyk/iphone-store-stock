import test from 'node:test';
import assert from 'node:assert/strict';
import {pickupStores,emptyCells,STALE_MS} from '../lib/catalog.mjs';
test('pickup stores preserve multiple stores and variants while separating test model and rejecting stale/error',()=>{
 const now=Date.now(),cells=emptyCells();
 for(const [storeId,variantId] of [['ifc','white-512'],['ifc','black-1tb'],['apm','white-1tb'],['shatin','18pro-silver-256']])Object.assign(cells.find(c=>c.storeId===storeId&&c.variantId===variantId),{status:'available',lastSuccessAt:new Date(now).toISOString(),checkedAt:new Date(now).toISOString()});
 const stale=cells.find(c=>c.storeId==='canton'&&c.variantId==='white-512');Object.assign(stale,{status:'available',lastSuccessAt:new Date(now-STALE_MS-1).toISOString()});
 const error=cells.find(c=>c.storeId==='festival'&&c.variantId==='white-512');Object.assign(error,{status:'error',lastSuccessAt:new Date(now).toISOString()});
 const result=pickupStores(cells,'duo',now);
 assert.deepEqual(result.map(s=>s.id),['ifc','apm']);
 assert.deepEqual(result[0].items.map(v=>[v.capacity,v.colorName]),[['512GB','星光白色'],['1TB','夜空色']]);
 assert.equal(result[0].district,'中環');assert.ok(result[0].items[0].url.startsWith('https://www.apple.com/'));
 assert.deepEqual(pickupStores(cells,'iphone18pro',now).map(s=>s.id),['shatin']);
 assert.deepEqual(pickupStores(cells,'duo',now+STALE_MS+1),[]);
 assert.deepEqual(pickupStores(emptyCells(),'duo',now),[]);
});
