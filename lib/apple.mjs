import { stores, normalize } from './catalog.mjs';
export class SourceError extends Error { constructor(message, status=0, retryAfter=0) { super(message); this.status=status; this.retryAfter=retryAfter; } }
export async function appleFetch(url, fetcher=(...args)=>globalThis.fetch(...args)) {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://www.apple.com' || !parsed.pathname.startsWith('/hk-zh/shop/')) throw new SourceError('來源網址不符合限制');
  let response;
  try { response=await fetcher(url,{headers:{Accept:'application/json, text/html;q=0.9','Accept-Language':'zh-HK,zh;q=0.9,en;q=0.8'},redirect:'manual',signal:AbortSignal.timeout(15000)}); }
  catch { throw new SourceError('無法連接 Apple，請稍後再試'); }
  if (!response.ok) {
    const retry=response.headers.get('retry-after');
    const seconds=retry && /^\d+$/.test(retry) ? Number(retry) : Math.max(0,(Date.parse(retry||'')-Date.now())/1000)||0;
    throw new SourceError(`Apple 回應 HTTP ${response.status}`,response.status,seconds*1000);
  }
  return response;
}
export function parsePickup(payload, variant, checkedAt=new Date().toISOString()) {
  const list=payload?.body?.stores ?? payload?.body?.content?.pickupMessage?.stores;
  if (!Array.isArray(list) || !list.length) throw new SourceError('Apple 未提供可辨識的門市庫存，未判定為無貨');
  return stores.map(store=>{
    const matches=list.filter(s=>(s.country === undefined || s.country === 'HK') && store.aliases.includes(normalize(s.storeName)));
    const found=matches.length===1 ? matches[0] : null;
    const part=found?.partsAvailability?.[variant.part];
    const raw=part?.pickupDisplay;
    const status=raw==='available' ? 'available' : raw==='unavailable' ? 'unavailable' : 'unknown';
    return { storeId:store.id,variantId:variant.id,status,checkedAt,lastSuccessAt:status==='unknown'?null:checkedAt,
      message:status==='available'?'可預約取貨':status==='unavailable'?'暫不提供取貨':found?'官方狀態未能辨識':'此次回應未覆蓋這家門市',
      rawStatus:typeof raw==='string'?raw:null,officialStoreNumber:found?.storeNumber??null };
  });
}
export function verifyCatalog(html, variants) {
  for (const v of variants) {
    const name=v.productName;
    const regex=/\{[^{}]*"partNumber"\s*:\s*"([^"<>]+)"[^{}]*(?:\{[^{}]*\}[^{}]*)*"name"\s*:\s*"([^"<>]+)"[^{}]*\}/g;
    let found=false;
    for (const match of html.matchAll(regex)) if(match[1]===v.part && match[2].replace(/\s/g,' ')===name) found=true;
    // The analytics product object has a nested price object. Exact part + exact model/capacity/colour are required together.
    if (!found) throw new SourceError(`尚未驗證 ${v.capacity} ${v.colorName} 官方料號`);
  }
  return true;
}
export async function checkVariant(variant,fetcher=(...args)=>globalThis.fetch(...args)) {
  const url=new URL('https://www.apple.com/hk-zh/shop/retail/pickup-message');
  url.search=new URLSearchParams({pl:'true','mts.0':'regular','parts.0':variant.part,location:'Hong Kong'}).toString();
  const response=await appleFetch(url,fetcher);
  let payload;
  try { payload=await response.json(); } catch { throw new SourceError('Apple 回傳非 JSON 資料，未判定為無貨'); }
  return parsePickup(payload,variant);
}
