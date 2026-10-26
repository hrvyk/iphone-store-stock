export const models = [
  {id:'duo',name:'iPhone Duo',test:false,catalogUrl:'https://www.apple.com/hk-zh/shop/buy-iphone/iphone-duo'},
  {id:'iphone18pro',name:'iPhone 18 Pro',test:true,catalogUrl:'https://www.apple.com/hk-zh/shop/buy-iphone/iphone-18-pro'},
];
export const variants = [
  { id:'white-512', modelId:'duo', capacity:'512GB', color:'white', colorName:'星光白色', part:'MK2F4ZA/A', productName:'iPhone Duo 512GB Star White', slug:'7.6-inch-display-512gb-star-white' },
  { id:'black-512', modelId:'duo', capacity:'512GB', color:'black', colorName:'夜空色', part:'MK2G4ZA/A', productName:'iPhone Duo 512GB Night Sky', slug:'7.6-inch-display-512gb-night-sky' },
  { id:'white-1tb', modelId:'duo', capacity:'1TB', color:'white', colorName:'星光白色', part:'MK2H4ZA/A', productName:'iPhone Duo 1TB Star White', slug:'7.6-inch-display-1tb-star-white' },
  { id:'black-1tb', modelId:'duo', capacity:'1TB', color:'black', colorName:'夜空色', part:'MK2J4ZA/A', productName:'iPhone Duo 1TB Night Sky', slug:'7.6-inch-display-1tb-night-sky' },
  { id:'18pro-silver-256', modelId:'iphone18pro', capacity:'256GB', color:'silver', colorName:'銀色', part:'MJRQ4ZA/A', productName:'iPhone 18 Pro 256GB Silver', slug:'6.3-吋顯示器-256gb-銀色' },
].map(v=>({...v,url:`${models.find(m=>m.id===v.modelId).catalogUrl}/${v.slug}`}));
export const stores = [
  { id: 'ifc', name: 'ifc mall', district: '中環', area: '香港島', aliases: ['ifcmall','國際金融中心商場'] },
  { id: 'causeway', name: 'Causeway Bay', district: '銅鑼灣', area: '香港島', aliases: ['causewaybay','銅鑼灣'] },
  { id: 'canton', name: 'Canton Road', district: '尖沙咀', area: '九龍', aliases: ['cantonroad','廣東道'] },
  { id: 'festival', name: 'Festival Walk', district: '九龍塘', area: '九龍', aliases: ['festivalwalk','又一城'] },
  { id: 'apm', name: 'apm', district: '觀塘', area: '九龍', aliases: ['apm','apmhongkong'] },
  { id: 'shatin', name: 'New Town Plaza', district: '沙田', area: '新界', aliases: ['newtownplaza','新城市廣場'] },
];
export const STALE_MS = 10 * 60_000;
export const normalize = s => String(s).toLowerCase().replace(/apple|[\s.,®™]/g, '');
export function emptyCells(catalogVariants=variants) { return stores.flatMap(s => catalogVariants.map(v => ({ storeId:s.id, variantId:v.id, status:'unknown', checkedAt:null, lastSuccessAt:null, message:'尚未檢測', rawStatus:null }))); }
export function isFresh(cell, now = Date.now()) { return !!cell.lastSuccessAt && now - Date.parse(cell.lastSuccessAt) <= STALE_MS && ['available','unavailable'].includes(cell.status); }
export function availabilityChanges(before, after, now = Date.now()) { return after.filter(c => c.status === 'available' && isFresh(c,now) && !before.some(p => p.storeId===c.storeId && p.variantId===c.variantId && p.status==='available' && isFresh(p,now))); }

// Reconcile persisted grids when models are added without dropping existing observations.
export function mergeCells(saved=[], catalogVariants=variants) {
  const byKey=new Map(saved.map(c=>[`${c.storeId}:${c.variantId}`,c]));
  return emptyCells(catalogVariants).map(c=>({...c,...byKey.get(`${c.storeId}:${c.variantId}`)}));
}
export function modelHealth(cells, now=Date.now(), catalogModels=models, catalogVariants=variants) {
  return catalogModels.map(model=>{
    const ids=new Set(catalogVariants.filter(v=>v.modelId===model.id).map(v=>v.id));
    const group=cells.filter(c=>ids.has(c.variantId));
    const fresh=group.filter(c=>isFresh(c,now));
    const successes=group.filter(c=>c.lastSuccessAt).map(c=>Date.parse(c.lastSuccessAt));
    const lastSuccessAt=successes.length===group.length?new Date(Math.min(...successes)).toISOString():null;
    return {...model,total:group.length,confirmed:fresh.length,available:fresh.filter(c=>c.status==='available').length,errors:group.filter(c=>c.status==='error').length,lastSuccessAt,healthy:fresh.length===group.length&&group.length>0};
  });
}

// Group only current, confirmed availability by the configured model and store.
export function pickupStores(cells, modelId, now=Date.now(), catalogVariants=variants) {
  return stores.map(store=>({...store,items:catalogVariants.filter(v=>v.modelId===modelId).flatMap(v=>{
    const cell=cells.find(c=>c.storeId===store.id&&c.variantId===v.id);
    return cell?.status==='available'&&isFresh(cell,now)?[{...v,variantId:v.id,checkedAt:cell.checkedAt}]:[];
  })})).filter(store=>store.items.length);
}
