import { env } from 'cloudflare:workers';
import { ensureState } from '../../../lib/monitor.mjs';
export async function POST(request:Request) {
  const origin=request.headers.get('origin');
  if((origin && origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'不接受跨站設定'},{status:403});
  try { const data=await request.json() as {backgroundEnabled?:unknown;retryNetworkError?:unknown}; if(typeof data.backgroundEnabled!=='boolean')return Response.json({error:'backgroundEnabled 必須為布林值'},{status:400}); await ensureState(env.DB); await env.DB!.prepare('UPDATE monitor_state SET background_enabled=? WHERE id=1').bind(data.backgroundEnabled?1:0).run(); if(data.retryNetworkError===true){const latest=await env.DB!.prepare('SELECT detail FROM monitor_runs ORDER BY at DESC LIMIT 1').first<{detail:string}>(); const errors=latest?JSON.parse(latest.detail).errors:[]; if(errors.length && errors.every((e:string)=>e.includes('無法連接 Apple')))await env.DB!.prepare('UPDATE monitor_state SET next_allowed_at=MAX(?,COALESCE(unixepoch(last_attempt_at)*1000,0)+60000) WHERE id=1 AND lock_until<=?').bind(Date.now(),Date.now()).run();} return Response.json({backgroundEnabled:data.backgroundEnabled}); }
  catch { return Response.json({error:'設定未能儲存'},{status:503}); }
}
