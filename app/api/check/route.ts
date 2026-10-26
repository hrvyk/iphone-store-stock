import { env } from 'cloudflare:workers';
import { runCheck } from '../../../lib/monitor.mjs';
export async function POST(request:Request) {
  const origin=request.headers.get('origin');
  if((origin && origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'不接受跨網站檢測請求'},{status:403});
  try { const result=await runCheck(env.DB); if(request.headers.get('x-duowatch-runner')==='background')await env.DB!.prepare('UPDATE monitor_state SET last_background_at=? WHERE id=1').bind(new Date().toISOString()).run(); return Response.json(result,{headers:{'Cache-Control':'no-store'}}); }
  catch { return Response.json({error:'檢測服務暫時未能完成，請稍後重試'},{status:503}); }
}
