import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runCheck as dynamicRunCheck,readStatus,syncCatalog} from '../lib/monitor.mjs';
import {variants,stores,mergeCells,modelHealth} from '../lib/catalog.mjs';
const runCheck=(db,fetcher)=>dynamicRunCheck(db,fetcher,async()=>({models:(await import("../lib/catalog.mjs")).models,variants}));
function database(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../drizzle/0000_fantastic_ezekiel_stane.sql',import.meta.url),'utf8'));
 function prepare(query){let values=[];const s={bind(...v){values=v;return s},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}}},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}}};return s;}
 return {prepare,sql,async batch(stmts){sql.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
}
const catalog=readFileSync(new URL('./fixtures/catalog.html',import.meta.url),'utf8');
const proCatalog=readFileSync(new URL('./fixtures/catalog-18-pro.html',import.meta.url),'utf8');
const pageFor=url=>String(url).includes('iphone-18-pro')?proCatalog:catalog;
const fetcher=async url=>{
 if(String(url).includes('/buy-iphone/'))return new Response(pageFor(url));
 const part=new URL(url).searchParams.get('parts.0');
 return Response.json({body:{content:{pickupMessage:{stores:stores.map(s=>({storeName:s.name,storeNumber:'fixture-'+s.id,partsAvailability:{[part]:{pickupDisplay:'available'}}}))}}}});
};
test('one run persists 30 real parsed cells, history and catalog verification',async()=>{const db=database();const r=await runCheck(db,fetcher);assert(r.accepted);assert.equal(r.cells.filter(c=>c.status==='available').length,30);assert(r.lastSuccessAt);assert(r.catalogVerifiedAt);assert.equal(r.runs.length,1);assert.equal(r.runs[0].detail.changes.length,30);assert.equal((await readStatus(db)).cells.length,30)});
test('shared cooldown prevents another upstream round',async()=>{const db=database();await runCheck(db,fetcher);let calls=0;const r=await runCheck(db,async()=>{calls++;throw Error('should not fetch')});assert(!r.accepted);assert.equal(calls,0);assert.equal(r.runs.length,1)});
test('atomic lock prevents simultaneous checks',async()=>{const db=database();const results=await Promise.all([runCheck(db,fetcher),runCheck(db,fetcher)]);assert.equal(results.filter(r=>r.accepted).length,1);assert.equal((await readStatus(db)).runs.length,1)});
test('upstream 541 is recorded as error with 15 minute backoff',async()=>{const db=database();const r=await runCheck(db,async url=>String(url).includes('/buy-iphone/')?new Response(pageFor(url)):new Response('',{status:541}));assert(r.cells.every(c=>c.status==='error'));assert.equal(r.lastSuccessAt,null);assert(r.nextAllowedAt>Date.now()+899000);assert.equal(r.runs[0].outcome,'error')});
test('network failure retains prior success time, never reports sold out',async()=>{const db=database();const first=await runCheck(db,fetcher);db.sql.exec('UPDATE monitor_state SET next_allowed_at=0');const r=await runCheck(db,async()=>{throw Error('network down')});assert(r.cells.every(c=>c.status==='error'));assert.equal(r.lastSuccessAt,first.lastSuccessAt);assert.equal(r.cells[0].lastSuccessAt,first.cells[0].lastSuccessAt)});
test('missing one store remains partial and does not claim full success',async()=>{const db=database();const r=await runCheck(db,async url=>{const res=await fetcher(url);if(String(url).includes('/buy-iphone/'))return res;const p=await res.json();p.body.content.pickupMessage.stores.pop();return Response.json(p)});assert.equal(r.runs[0].outcome,'partial');assert.equal(r.lastSuccessAt,null);assert.equal(r.cells.filter(c=>c.status==='unknown').length,5)});
test('one failed variant does not erase the other variants',async()=>{const db=database();const r=await runCheck(db,async url=>String(url).includes(encodeURIComponent(variants[1].part))?new Response('upstream failed',{status:500}):fetcher(url));assert.equal(r.cells.filter(c=>c.status==='error').length,6);assert.equal(r.cells.filter(c=>c.status==='available').length,24);assert.equal(r.runs[0].outcome,'partial')});

test('legacy Duo snapshots gain unknown test cells without losing previous observations',async()=>{const db=database();const first=await runCheck(db,fetcher);const old=first.cells.filter(c=>c.variantId!=='18pro-silver-256');db.sql.prepare('UPDATE monitor_state SET snapshot=?').run(JSON.stringify(old));const read=await readStatus(db);assert.equal(read.cells.length,30);assert.equal(read.lastSuccessAt,null);assert.equal(read.cells.filter(c=>c.variantId==='18pro-silver-256'&&c.status==='unknown').length,6);assert.equal(read.cells.filter(c=>c.status==='available').length,24);db.sql.exec('UPDATE monitor_state SET next_allowed_at=0');const repaired=await runCheck(db,fetcher);assert.equal(repaired.cells.filter(c=>c.status==='available').length,30)});
test('test model catalog failure leaves Duo successful and test cells in error',async()=>{const db=database();const r=await runCheck(db,async url=>String(url).includes('/buy-iphone/iphone-18-pro')?new Response('changed page'):fetcher(url));assert.equal(r.cells.filter(c=>c.status==='error').length,6);assert.equal(r.cells.filter(c=>c.status==='available').length,24);assert.equal(r.runs[0].outcome,'partial');assert.equal(r.lastSuccessAt,null)});
test('model health keeps stale or failed test reads separate from healthy stock',()=>{const at=new Date().toISOString();const cells=mergeCells().map(c=>({...c,status:'available',lastSuccessAt:at}));assert(modelHealth(cells).every(m=>m.healthy));const stale=modelHealth(cells,Date.now()+601000);assert(stale.every(m=>!m.healthy&&m.available===0));cells.find(c=>c.variantId==='18pro-silver-256').status='error';const h=modelHealth(cells);assert(h.find(m=>m.id==='duo').healthy);assert(!h.find(m=>m.id==='iphone18pro').healthy)});

test('catalog-only sync discovers future models while preserving stock and releasing lock',async()=>{
 const db=database();const first=await runCheck(db,fetcher);db.sql.exec('UPDATE monitor_state SET next_allowed_at=0');
 const result=await syncCatalog(db,fetcher,async(f,previous)=>({...previous,models:[...previous.models,{id:'future',name:'iPhone Future',catalogUrl:'https://www.apple.com/hk-zh/shop/buy-iphone/iphone-future'}],variants:[...previous.variants,{...variants[0],id:'future-256',modelId:'future',part:'FUTUREZA/A'}],syncedAt:new Date().toISOString(),errors:[]}));
 assert(result.accepted);assert.deepEqual(result.addedModels,['iPhone Future']);assert.equal(result.addedVariants,1);assert.equal(result.checking,false);
 const persisted=await readStatus(db);assert.equal(persisted.cells.length,36);assert.deepEqual(persisted.cells.slice(0,5),first.cells.slice(0,5));assert.equal(persisted.runs.length,1);assert.equal(persisted.checking,false);
});
test('catalog sync respects active stock cooldown without contacting Apple',async()=>{
 const db=database();await runCheck(db,fetcher);const result=await syncCatalog(db,fetcher,async()=>{throw Error('must not run')});assert.equal(result.accepted,false);
});
