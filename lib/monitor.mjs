import { variants, models, stores, emptyCells, mergeCells, modelHealth, availabilityChanges } from './catalog.mjs';
import {discoverCatalog} from './discovery.mjs';
import { appleFetch, verifyCatalog, checkVariant } from './apple.mjs';
export async function ensureState(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS product_catalog (id INTEGER PRIMARY KEY, data TEXT NOT NULL)').run();
  await db.prepare('INSERT OR IGNORE INTO monitor_state (id,snapshot,lock_until,next_allowed_at) VALUES (1,?,0,0)').bind(JSON.stringify(emptyCells())).run();
}
export async function readStatus(db) {
  await ensureState(db);
  const state=await db.prepare('SELECT * FROM monitor_state WHERE id=1').first();
  const runs=await db.prepare('SELECT * FROM monitor_runs ORDER BY at DESC LIMIT 30').all();
  const row=await db.prepare('SELECT data FROM product_catalog WHERE id=1').first();
  const catalog=row?JSON.parse(row.data):{models,variants};
  const saved=JSON.parse(state.snapshot);
  const cells=mergeCells(saved,catalog.variants);
  return {models:catalog.models,variants:catalog.variants,catalog,stores,cells,modelHealth:modelHealth(cells,Date.now(),catalog.models,catalog.variants),serverTime:new Date().toISOString(),lastAttemptAt:state.last_attempt_at,lastSuccessAt:saved.length===cells.length?state.last_success_at:null,catalogVerifiedAt:state.catalog_verified_at,nextAllowedAt:state.next_allowed_at,checking:state.lock_until>Date.now(),runs:runs.results.map(r=>({...r,detail:JSON.parse(r.detail)})),background:{enabled:state.background_enabled===1,lastRunAt:state.last_background_at,message:state.background_enabled===1 ? '雲端排程已配置，每小時嘗試檢測；以最近背景執行時間為準' : '尚未配置雲端排程；關閉頁面後不會由此頁持續檢測'}};
}
export async function runCheck(db,fetcher=(...args)=>globalThis.fetch(...args), discoverer=discoverCatalog) {
  await ensureState(db);
  const now=Date.now(),token=crypto.randomUUID(),at=new Date(now).toISOString();
  const acquired=await db.prepare('UPDATE monitor_state SET lock_token=?,lock_until=?,last_attempt_at=? WHERE id=1 AND lock_until<=? AND next_allowed_at<=?').bind(token,now+180000,at,now,now).run();
  if(!acquired.meta.changes) return {accepted:false,...await readStatus(db)};
  const state=await db.prepare('SELECT * FROM monitor_state WHERE id=1').first();
  const row=await db.prepare('SELECT data FROM product_catalog WHERE id=1').first();
  const catalog=await discoverer(fetcher,row?JSON.parse(row.data):{models,variants});
  await db.prepare('INSERT OR REPLACE INTO product_catalog (id,data) VALUES (1,?)').bind(JSON.stringify(catalog)).run();
  const activeModels=catalog.models,activeVariants=catalog.variants;
  const persisted=JSON.parse(state.snapshot);
  const previousSuccess=persisted.length===emptyCells(activeVariants).length?state.last_success_at:null;
  const before=mergeCells(persisted,activeVariants),cells=before.map(c=>({...c})),errors=[];
  let backoff=60000,verifiedCount=0,blocked=false;
  const fail=(selected,message)=>{for(const c of cells.filter(c=>selected.some(v=>v.id===c.variantId))){c.status='error';c.checkedAt=new Date().toISOString();c.message=message;}};
  for(const model of activeModels){
    const group=activeVariants.filter(v=>v.modelId===model.id);
    if(blocked){fail(group,'來源暫時限制請求，稍後再試');continue;}
    try {
      // Verify each model independently on every round, including newly added models.
      const html=await (await appleFetch(model.catalogUrl,fetcher)).text();
      verifyCatalog(html,group);verifiedCount++;
    } catch(error){
      errors.push(`${model.name}：${error.message}`);fail(group,error.message);
      backoff=Math.max(backoff,error.retryAfter||0);
      if([403,429,541].includes(error.status)){blocked=true;backoff=Math.max(backoff,900000);}
      continue;
    }
    for(let offset=0;offset<group.length;offset+=4){
    if(Date.now()-now>105000){fail(group.slice(offset),'本輪時間上限，待下輪檢測');errors.push('部分規格待下輪檢測');break;}
    await Promise.all(group.slice(offset,offset+4).map(async variant=>{
      if(blocked){fail([variant],'來源暫時限制請求，稍後再試');return;}
      try {
        const results=await checkVariant(variant,fetcher);
        for(const item of results){const i=cells.findIndex(c=>c.variantId===item.variantId&&c.storeId===item.storeId);cells[i]={...cells[i],...item,lastSuccessAt:item.lastSuccessAt||cells[i].lastSuccessAt};}
      }catch(error){
        errors.push(`${model.name} ${variant.capacity} ${variant.colorName}：${error.message}`);fail([variant],error.message);backoff=Math.max(backoff,error.retryAfter||0);
        if([403,429,541].includes(error.status)){blocked=true;backoff=Math.max(backoff,900000);}
      }
    }));
    }
  }
  const updated=cells.filter(c=>['available','unavailable'].includes(c.status)&&Date.parse(c.checkedAt)>=now).length;
  const complete=updated===cells.length;
  const changes=availabilityChanges(before,cells);
  const outcome=complete?'success':updated?'partial':'error';
  const detail={errors,changes:changes.map(c=>({storeId:c.storeId,variantId:c.variantId})),confirmed:updated,total:cells.length,message:complete?`全部 ${cells.length} 個狀態已更新`:errors[0]||'部分門市回應缺漏，未判定為無貨'};
  const result=await db.batch([
    db.prepare('INSERT INTO monitor_runs(id,at,outcome,detail) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM monitor_state WHERE id=1 AND lock_token=?)').bind(token,at,outcome,JSON.stringify(detail),token),
    db.prepare('UPDATE monitor_state SET snapshot=?,lock_token=NULL,lock_until=0,next_allowed_at=?,last_success_at=?,catalog_verified_at=? WHERE id=1 AND lock_token=?').bind(JSON.stringify(cells),Date.now()+backoff,complete?at:previousSuccess,verifiedCount===activeModels.length?at:state.catalog_verified_at,token),
    db.prepare('DELETE FROM monitor_runs WHERE id NOT IN (SELECT id FROM monitor_runs ORDER BY at DESC LIMIT 200)')
  ]);
  if(!result[1].meta.changes) return {accepted:false,...await readStatus(db)};
  return {accepted:true,...await readStatus(db)};
}

// Catalog-only operation shares the stock lock and source cooldown.
export async function syncCatalog(db,fetcher=globalThis.fetch,discoverer=discoverCatalog) {
 await ensureState(db);
 const now=Date.now(),token=crypto.randomUUID();
 let retryAt=0;
 const acquired=await db.prepare('UPDATE monitor_state SET lock_token=?,lock_until=? WHERE id=1 AND lock_until<=? AND next_allowed_at<=?').bind(token,now+180000,now,now).run();
 if(!acquired.meta.changes)return {accepted:false,...await readStatus(db)};
 try {
  const row=await db.prepare('SELECT data FROM product_catalog WHERE id=1').first();
  const before=row?JSON.parse(row.data):{models,variants};
  const catalog=await discoverer(fetcher,before);
  if(catalog.errors?.length)retryAt=Date.now()+900000;
  const saved=await db.prepare('INSERT OR REPLACE INTO product_catalog (id,data) SELECT 1,? WHERE EXISTS (SELECT 1 FROM monitor_state WHERE id=1 AND lock_token=?)').bind(JSON.stringify(catalog),token).run();
  if(!saved.meta.changes)return {accepted:false,...await readStatus(db)};
  return {accepted:true,addedModels:catalog.models.filter(m=>!before.models.some(old=>old.id===m.id)).map(m=>m.name),addedVariants:catalog.variants.filter(v=>!before.variants.some(old=>old.part===v.part)).length,...await readStatus(db),checking:false,nextAllowedAt:retryAt};
 } finally {
  await db.prepare('UPDATE monitor_state SET lock_token=NULL,lock_until=0,next_allowed_at=? WHERE id=1 AND lock_token=?').bind(retryAt,token).run();
 }
}
