import {appleFetch,SourceError} from './apple.mjs';
export function parseProducts(html, catalogUrl) {
 const found=new Map();
 const re=/\{[^{}]*"partNumber"\s*:\s*"([^"<>]+)"[^{}]*(?:\{[^{}]*\}[^{}]*)*"name"\s*:\s*"([^"<>]+)"[^{}]*\}/g;
 for(const m of html.matchAll(re)) {
  const name=m[2].replace(/\s/g,' '), match=name.match(/^(iPhone .+?) (\d+(?:GB|TB)) (.+)$/);
  if(!match||!/[A-Z0-9]+ZA\/A$/.test(m[1]))continue;
  const [,model,capacity,color]=match,modelId=model.toLowerCase().replace(/[^a-z0-9]/g,'');
  const colors={Silver:'銀色',Black:'黑色',White:'白色',Burgundy:'酒紅色',Glacier:'冰川色',Blue:'藍色',Pink:'粉紅色',Green:'綠色',Purple:'紫色','Star White':'星光白色','Night Sky':'夜空色'};
  found.set(m[1],{id:'apple-'+m[1].replace(/[^a-z0-9]/gi,'').toLowerCase(),modelId,capacity,color:color.toLowerCase().replace(/ /g,'-'),colorName:colors[color]||color,part:m[1],productName:name,url:catalogUrl,modelName:model});
 }
 if(!found.size)throw new SourceError('官網產品目錄格式未能辨識，保留上次目錄');
 return [...found.values()];
}
export async function discoverCatalog(fetcher, previous) {
 const started=Date.now(),errors=[],urls=new Set(previous.models.map(m=>m.catalogUrl));
 try {
  const html=await (await appleFetch('https://www.apple.com/hk-zh/shop/buy-iphone',fetcher)).text();
  for(const m of html.matchAll(/(?:https:\/\/www\.apple\.com)?(\/hk-zh\/shop\/buy-iphone\/iphone-[a-z0-9-]+)(?=["'/?#])/g))urls.add('https://www.apple.com'+m[1]);
 }catch(e){errors.push(e.message)}
 // Always inspect the current iPhone 18 family alongside discovered official links.
 urls.add('https://www.apple.com/hk-zh/shop/buy-iphone/iphone-18');
 const models=previous.models.map(m=>({...m})),variants=previous.variants.map(v=>({...v}));
 for(const url of [...urls].slice(0,20)) {
  if(Date.now()-started>45000){errors.push('目錄同步逾時，保留其餘已知規格');break;}
  try {
   const products=parseProducts(await (await appleFetch(url,fetcher)).text(),url);
   for(const v of products){
    let model=models.find(m=>m.name===v.modelName);
    if(!model){model={id:v.modelId,name:v.modelName,test:false,catalogUrl:url};models.push(model)}
    model.test=false;
    const old=variants.find(x=>x.part===v.part);
    if(old)Object.assign(old,{...v,id:old.id,modelId:model.id});else variants.push({...v,modelId:model.id});
   }
  }catch(e){errors.push(url+': '+e.message);if([403,429,541].includes(e.status))break;}
 }
 return {models,variants,syncedAt:new Date().toISOString(),errors};
}
