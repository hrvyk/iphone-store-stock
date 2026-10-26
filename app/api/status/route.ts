import { env } from 'cloudflare:workers';
import { readStatus } from '../../../lib/monitor.mjs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return Response.json(await readStatus(env.DB),{headers:{'Cache-Control':'no-store'}}); }
  catch { return Response.json({error:'資料庫暫時未能連線，請稍後重試'},{status:503}); }
}
