import '../docs/customer-data.js';

// Write-only intake. Private customer records have no public read endpoint.
const V=globalThis.HooyaCustomer;
export const schema=`CREATE TABLE IF NOT EXISTS customer_details (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
 first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT NOT NULL,
 country TEXT NOT NULL, province TEXT NOT NULL, city TEXT NOT NULL,
 address TEXT NOT NULL, unit TEXT NOT NULL, postcode TEXT NOT NULL,
 different_shipping INTEGER NOT NULL, shipping_json TEXT NOT NULL, notes TEXT NOT NULL,
 items_json TEXT NOT NULL, subtotal_toman INTEGER, status TEXT NOT NULL DEFAULT 'received',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_details_created ON customer_details(created_at DESC);
CREATE TABLE IF NOT EXISTS intake_rate (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);`;
const initialized=new WeakMap();
async function initialize(db){
  if(!initialized.has(db))initialized.set(db,db.exec(schema).catch(error=>{initialized.delete(db);throw error;}));
  await initialized.get(db);
}
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function boundedJson(request){
  if(Number(request.headers.get('Content-Length'))>24000)throw Error('large');
  const reader=request.body?.getReader();if(!reader)throw Error('json');
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();throw Error('large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
function selections(input,products){
  if(!Array.isArray(input)||!input.length||input.length>50)return null;
  const result=[],seen=new Set();
  for(const line of input){
    const p=products.find(p=>p.id===line?.id&&p.status==='published');
    if(!p||!p.sizes?.includes(line.size)||!Number.isSafeInteger(line.qty)||line.qty<1||line.qty>10)return null;
    const stock=p.sizeStock?.[line.size]??(p.stock===0?0:null),key=[p.id,line.size,line.mode].join(':');
    if(seen.has(key))return null;seen.add(key);
    if(line.mode==='ready'){if(stock===null||stock<line.qty)return null;}
    else if(line.mode==='order'){if(!p.madeToOrder)return null;}
    else if(line.mode==='pending'){if(stock!==null||p.madeToOrder)return null;}
    else return null;
    result.push({id:p.id,name:p.name,size:line.size,mode:line.mode,qty:line.qty,unitPriceToman:p.price??null});
  }
  return result;
}
export function createHandler({fetchCatalog=fetch}={}){
  return {async fetch(request,env){
    const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'https://hooyamode.ir,https://www.hooyamode.ir').split(',').map(x=>x.trim());
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
    if(allowed.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Idempotency-Key','Access-Control-Max-Age':'600'});
    const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
    const path=new URL(request.url).pathname;
    if(path!=='/health'&&path!=='/v1/customer-details')return respond({message:'پیدا نشد.'},404);
    if(request.method==='OPTIONS')return new Response(null,{status:allowed.includes(origin)?204:403,headers});
    if(path==='/v1/customer-details'&&request.method!=='POST')return respond({message:'این مسیر فقط برای ثبت اطلاعات است.'},405);
    if(path==='/health'&&request.method!=='GET')return respond({available:false},405);
    if(path!=='/health'&&!allowed.includes(origin))return respond({message:'درخواست مجاز نیست.'},403);
    if(!env.DB)return respond({available:false,message:'ثبت اطلاعات فعلا در دسترس نیست.'},503);
    try{
      await initialize(env.DB);
      if(path==='/health'){await env.DB.prepare('SELECT id FROM customer_details LIMIT 1').first();return respond({available:true});}
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return respond({message:'ساختار درخواست معتبر نیست.'},415);
      const key=request.headers.get('Idempotency-Key');
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key||''))return respond({message:'شناسه درخواست معتبر نیست.'},400);
      let input;try{input=await boundedJson(request);}catch{return respond({message:'اطلاعات فرم معتبر نیست.'},400);}
      if(input?.website)return respond({message:'ثبت اطلاعات انجام نشد.'},400);
      const {data,errors}=V.validate(input);
      if(Object.keys(errors).length)return respond({message:'اطلاعات فرم را بررسی کنید.',errors},422);
      // Canonical contact + original selection identifiers support safe network retries.
      const hash=await digest(JSON.stringify({...data,items:input.items}));
      const previous=await env.DB.prepare('SELECT id, payload_hash FROM customer_details WHERE request_key = ?').bind(key).first();
      if(previous)return previous.payload_hash===hash?respond({status:'received',reference:previous.id}):respond({message:'اطلاعات این درخواست تغییر کرده است. فرم را دوباره ثبت کنید.'},409);
      const hour=Math.floor(Date.now()/3600000),ip=request.headers.get('CF-Connecting-IP')||'unknown';
      const bucket=await digest(hour+':'+ip);
      const rate=await env.DB.prepare('INSERT INTO intake_rate (bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,(hour+1)*3600000).first();
      if(!rate||rate.count>10)return respond({message:'تعداد تلاش ها زیاد شده است. کمی بعد دوباره تلاش کنید.'},429);
      const catalogResponse=await fetchCatalog(env.CATALOG_URL||'https://hooyamode.ir/products.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!catalogResponse.ok)throw Error('catalog');const catalog=await catalogResponse.json();
      if(catalog.schema!==1||!Array.isArray(catalog.products))throw Error('catalog');
      const items=selections(input.items,catalog.products);
      if(!items)return respond({message:'محصول یا موجودی تغییر کرده است. سبد خرید را دوباره بررسی کنید.'},409);
      const subtotal=items.every(x=>Number.isSafeInteger(x.unitPriceToman)&&x.unitPriceToman>=0)?items.reduce((n,x)=>n+x.qty*x.unitPriceToman,0):null;
      const id=crypto.randomUUID(),b=data.billing;
      await env.DB.prepare('INSERT INTO customer_details (id, request_key, payload_hash, first_name, last_name, phone, country, province, city, address, unit, postcode, different_shipping, shipping_json, notes, items_json, subtotal_toman, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_key) DO NOTHING').bind(id,key,hash,b.firstName,b.lastName,b.phone,b.country,b.province,b.city,b.address,b.unit,b.postcode,data.differentShipping?1:0,JSON.stringify(data.shipping),data.notes,JSON.stringify(items),subtotal,new Date().toISOString()).run();
      const saved=await env.DB.prepare('SELECT id, payload_hash FROM customer_details WHERE request_key = ?').bind(key).first();
      if(!saved)throw Error('not saved');
      if(saved.payload_hash!==hash)return respond({message:'اطلاعات این درخواست تغییر کرده است. فرم را دوباره ثبت کنید.'},409);
      await env.DB.prepare('DELETE FROM intake_rate WHERE expires_at < ?').bind(Date.now()-86400000).run();
      return respond({status:'received',reference:saved.id},201);
    }catch{
      // Never log contact details, request bodies, or database exceptions.
      return respond({message:'ثبت اطلاعات انجام نشد. لطفا دوباره تلاش کنید.'},503);
    }
  }};
}
export default createHandler();
