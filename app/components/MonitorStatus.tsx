import {Activity,Check,Clock3,MapPin,Radio,RefreshCw,Smartphone,WifiOff} from 'lucide-react';
import {modelHealth,pickupStores} from '../../lib/catalog.mjs';
type Cell={storeId:string;variantId:string;status:string;checkedAt:string|null;lastSuccessAt:string|null;message:string;rawStatus:string|null};
type Props={models:any[];variants:any[];cells:Cell[];now:number;lastAttemptAt:string|null;lastSuccessAt:string|null;lastReadAt:string|null;serverTime?:string;checking:boolean;connectionError:string;background:{enabled:boolean;lastRunAt?:string|null;message:string};onRefresh:()=>void;onCheck:()=>void;refreshing:boolean;busy:boolean;cool:number;onModel:(id:string)=>void};
function format(value?:string|null){return value?new Intl.DateTimeFormat('zh-HK',{timeZone:'Asia/Hong_Kong',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)):'尚未取得'}
export default function MonitorStatus(p:Props){
 const health=modelHealth(p.cells,p.now,p.models,p.variants);
 const backgroundRecent=!!p.background.lastRunAt&&p.now-Date.parse(p.background.lastRunAt)<75*60000;
 return <>
  <section className="panel monitor-health" aria-label="監測服務狀態">
   <div className="panel-heading"><div><h2><Activity size={18}/>監測服務狀態</h2><p>區分網頁刷新、來源檢測與背景執行；時間均為香港時間。</p></div><span className={'health-badge '+(p.connectionError?'warning':'good')}>{p.connectionError?<WifiOff size={14}/>:<Check size={14}/ >}{p.connectionError?'服務連線異常':p.lastReadAt?'服務可連線':'正在連線'}</span></div>
   <div className="health-times"><div><span>畫面最後刷新</span><b>{format(p.lastReadAt)}</b></div><div><span>最後嘗試檢測</span><b>{format(p.lastAttemptAt)}</b></div><div><span>全部機型最後成功</span><b>{format(p.lastSuccessAt)}</b></div><div><span>背景入口最後執行</span><b>{format(p.background.lastRunAt)}</b></div></div>
   <div className="health-footer"><span><Radio size={14}/>{p.background.enabled?(backgroundRecent?'背景排程已配置 · 近期有執行紀錄':'背景排程已配置 · 尚未見近期執行紀錄'):'背景排程未啟用'}</span><span>{p.checking||p.busy?'正在向 Apple 檢測…':p.cool?`來源檢測冷卻中，${p.cool} 秒後可重試`:'可以重新檢測庫存'}</span></div>
  </section>
  <section className="model-health-grid" aria-label="各機型檢測結果">{health.map(h=><article className={'panel model-health-card '+(h.test?'test-model':'')} key={h.id}>
   <div className="model-card-heading"><span className="model-symbol"><Smartphone size={24}/></span><div><h2>{h.name}</h2><p>{h.test?'來源健康測試':'官網機型 · 各容量與顏色'}</p></div>{h.test&&<span className="subtle-tag">測試機型</span>}</div>
   <div className="model-counts"><div><b>{h.available}</b><span>可取貨項目</span></div><div><b>{h.confirmed}<small> / {h.total}</small></b><span>最新有效回應</span></div></div>
   <p className={'model-verdict '+(h.healthy?'good':'warning')}>{h.healthy?<Check size={15}/>:<Clock3 size={15}/ >}{h.healthy?`來源查詢正常${h.available?'，已取得可取貨回應':'，本次暫無可取貨項目'}`:h.errors?'部分檢測失敗，請查看紀錄':'尚未檢測或資料已過期，請重新檢測'}</p>
   <div className="pickup-stores" aria-label={`${h.name}可取貨門店`}>
    <h3><MapPin size={15}/>{h.test?'測試機型可取貨門店':'可取貨門店'}</h3>
    <p className="pickup-note">{h.test?'僅供功能測試，不作 Duo 到貨通知。':'僅列出 10 分鐘內官方確認可預約取貨的門店。'}</p>
    {pickupStores(p.cells,h.id,p.now,p.variants).length?pickupStores(p.cells,h.id,p.now,p.variants).map(s=><article className="pickup-store" key={s.id}>
     <b>{s.name}</b><small>{s.district} · {s.area}</small>
     <ul>{s.items.map(item=><li key={item.variantId}><a href={item.url} target="_blank" rel="noreferrer">{item.capacity} · {item.colorName} ↗</a><small>檢測：{format(item.checkedAt)}</small></li>)}</ul>
    </article>):<p className="pickup-empty">{h.healthy?'目前沒有可預約取貨的門店。':'目前沒有最新確認可取貨的門店；資料待確認，請重新檢測。'}</p>}
   </div>
   <div className="model-card-bottom"><small>最後完整取得：{format(h.lastSuccessAt)}</small><button className="text-button" onClick={()=>p.onModel(h.id)}>查看門市庫存 →</button></div>
  </article>)}</section>
  <section className="panel manual-panel"><div><h2>手動驗證</h2><p>「刷新畫面資料」讀取已儲存的結果；「重新檢測庫存」會向 Apple 查詢全部機型。</p></div><div className="manual-actions"><button className="outline" onClick={p.onRefresh} disabled={p.refreshing}><RefreshCw size={14} className={p.refreshing?'spin':''}/>{p.refreshing?'正在刷新…':'刷新畫面資料'}</button><button className="primary" onClick={p.onCheck} disabled={p.busy||p.checking||p.cool>0}><RefreshCw size={15} className={p.busy?'spin':''}/>{p.busy?'正在檢測…':'重新檢測庫存'}</button></div></section>
 </>;
}
