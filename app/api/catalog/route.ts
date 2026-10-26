import {env} from 'cloudflare:workers';
import {syncCatalog} from '../../../lib/monitor.mjs';
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'不接受跨網站同步請求'},{status:403});
 try{return Response.json(await syncCatalog(env.DB),{headers:{'Cache-Control':'no-store'}})}
 catch{return Response.json({error:'官網目錄同步未能完成，請稍後重試'},{status:503})}
}
