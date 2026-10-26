// Optional standalone scheduler. Credentials remain in the process environment.
const site=process.env.SITE_URL, token=process.env.SITES_SERVICE_TOKEN;
if(!site||!token)throw Error('請設定 SITE_URL 與 SITES_SERVICE_TOKEN 環境變數');
const url=new URL('/api/check',site);
if(url.protocol!=='https:')throw Error('SITE_URL 必須使用 HTTPS');
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
while(!stopping){
  try {const r=await fetch(url,{method:'POST',headers:{'OAI-Sites-Authorization':`Bearer ${token}`,'x-duowatch-runner':'background'},signal:AbortSignal.timeout(130000),redirect:'error'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();console.log(new Date().toISOString(),data.accepted?'檢測完成':'冷卻或其他檢測執行中');}
  catch(e){console.error(new Date().toISOString(),e.message);}
  for(let i=0;i<300&&!stopping;i++)await new Promise(r=>setTimeout(r,1000));
}
