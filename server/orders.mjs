import {createHash,createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import '../docs/customer-data.js';

const V=globalThis.HooyaCustomer,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y);};
const jar=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Strict`;
export const states={received:'ثبت شده',reviewing:'در حال بررسی',awaiting_payment:'در انتظار پرداخت',preparing:'در حال آماده سازی',shipped:'ارسال شده',delivered:'تحویل شده',cancelled:'لغو شده'};
const moves={received:['reviewing','cancelled'],reviewing:['awaiting_payment','cancelled'],awaiting_payment:['reviewing','preparing','cancelled'],preparing:['shipped','cancelled'],shipped:['delivered'],delivered:[],cancelled:[]};
const fail=(message,status=400)=>Object.assign(Error(message),{status});
async function body(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw fail('ساختار درخواست معتبر نیست.',415);
 const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>24000)throw fail('درخواست بیش از حد بزرگ است.',413);chunks.push(part);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('درخواست معتبر نیست.');}
}
export function selectItems(input,products){
 if(!Array.isArray(input)||!input.length||input.length>50)throw fail('سبد خرید معتبر نیست.',409);
 const seen=new Set();return input.map(line=>{
  const p=products.find(p=>p.id===line?.id&&p.status==='published');
  if(!p||!p.sizes?.includes(line.size)||!Number.isSafeInteger(line.qty)||line.qty<1||line.qty>10)throw fail('محصول یا اندازه تغییر کرده است. سبد را بررسی کنید.',409);
  const stock=p.sizeStock?.[line.size]??(p.stock===0?0:null),key=[p.id,line.size,line.mode].join(':');
  if(seen.has(key)||!(line.mode==='ready'?stock!==null&&stock>=line.qty:line.mode==='order'?p.madeToOrder:line.mode==='pending'?stock===null&&!p.madeToOrder:false))throw fail('موجودی محصول تغییر کرده است. سبد را بررسی کنید.',409);
  seen.add(key);return {id:p.id,name:p.name,size:line.size,mode:line.mode,qty:line.qty,unitPriceToman:p.price??null};
 });
}
// Contact data is returned only after an administrator session, a verified phone,
// or the unpredictable receipt secret. A UUID/phone alone never grants access.
export function publicOrder(order){
 const {requestKey,payloadHash,privateNote,seenAt,...result}=order;return result;
}
export function createOrders({store,secret,readCatalog,readSmsConfig,writeSmsConfig,sendSms,notifications,now=Date.now}){
 if(typeof secret!=='string'||secret.length<43)throw Error('A persistent order signing secret is required');
 const sign=value=>createHmac('sha256',secret).update(value).digest('base64url'),sessions=new Map();
 const tracking=order=>sign('receipt:'+order.id+':'+order.requestKey);
 const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow',...headers});res.end(JSON.stringify(data));};
 const user=req=>{
  const key=hash(jar(req)['__Host-hooya_customer']||''),value=sessions.get(key);
  if(!value)return null;if(value.expires<now()||now()-value.lastSeen>3600000){sessions.delete(key);return null;}value.lastSeen=now();return value;
 };
 async function rate(req,scope,limit,period){
  const slot=Math.floor(now()/period),key=sign(scope+':'+slot+':'+(req.headers['x-real-ip']||req.socket.remoteAddress||'local'));
  if(await store('rate',{key,expires:(slot+1)*period,now:now()})>limit)throw fail('تعداد تلاش ها زیاد است. کمی بعد دوباره تلاش کنید.',429);
 }
 const csrf=req=>{const token=jar(req)['__Host-hooya_browser'];return token&&/^[\w-]{43}$/.test(token)?sign('csrf:'+token):null;};
 const origin=req=>['https://hooyamode.ir','https://www.hooyamode.ir'].includes(req.headers.origin);
 const checkCsrf=(req,token)=>{if(!token||!equal(req.headers['x-csrf-token'],token))throw fail('نشست صفحه منقضی شده است. صفحه را دوباره باز کنید.',403);};
 async function update(order,version){
  order.version=version+1;order.updatedAt=new Date(now()).toISOString();
  if(!(await store('update',{order,version})).updated)throw fail('سفارش هم‌زمان تغییر کرده است. دوباره دریافت کنید.',409);
 }
 const event=(order,label,note='')=>order.history.push({at:new Date(now()).toISOString(),status:order.status,label,note});
 return async function handle(req,res,authorize){
  const url=new URL(req.url,'http://localhost'),path=url.pathname,admin=path.startsWith('/admin/api/');
  if(!admin&&!path.startsWith('/api/customer/'))return false;
  try{
   let adminSession;
   if(admin){adminSession=authorize(req);if(!adminSession)throw fail('ورود به مدیریت لازم است.',401);if(req.method!=='GET'){if(!origin(req)&&req.headers.origin!=='null')throw fail('درخواست مجاز نیست.',403);checkCsrf(req,adminSession.csrf);}}
   else if(req.method==='POST'&&!origin(req)&&!(req.headers.origin==='null'&&(path==='/api/customer/v1/track'||csrf(req)&&equal(req.headers['x-csrf-token'],csrf(req)))))throw fail('درخواست مجاز نیست.',403);
   if(path==='/api/customer/health'&&req.method==='GET'){await store('health');json(res,200,{available:true,orders:true});return true;}
   if((path==='/api/customer/v1/shipping'||path==='/admin/api/shipping')&&req.method==='GET'){json(res,200,await store('shipping_get'));return true;}
   if(path==='/admin/api/shipping'&&req.method==='POST'){
    const input=await body(req);
    if(!Number.isSafeInteger(input.version)||input.version<1||input.postageToman!==null&&(!Number.isSafeInteger(input.postageToman)||input.postageToman<0||input.postageToman>100000000))throw fail('هزینه پست را به تومان و با عدد معتبر وارد کنید.');
    if(!(await store('shipping_set',input)).updated)throw fail('تنظیمات همزمان تغییر کرده است. صفحه را تازه کنید.',409);
    json(res,200,await store('shipping_get'));return true;
   }
   if(path==='/api/customer/v1/catalog'&&req.method==='GET'){const catalog=await readCatalog();json(res,200,{...catalog,products:catalog.products.filter(p=>p.status==='published')});return true;}
   if(path==='/api/customer/v1/customer-details'&&req.method==='POST'){
    const key=req.headers['idempotency-key'];if(!uuid.test(key||''))throw fail('شناسه درخواست معتبر نیست.');
    const input=await body(req);if(input.website)throw fail('ثبت سفارش انجام نشد.');
    const validated=V.validate(input);if(Object.keys(validated.errors).length){json(res,422,{message:'اطلاعات فرم را بررسی کنید.',errors:validated.errors});return true;}
    const payloadHash=hash(JSON.stringify({...validated.data,items:input.items})),previous=await store('previous',{key});
    const receipt=order=>({status:'received',reference:order.id,trackingToken:tracking(order),orderStatus:order.status,paymentStatus:order.payment.status});
    if(previous){if(previous.hash!==payloadHash)throw fail('اطلاعات این درخواست تغییر کرده است.',409);json(res,200,receipt(previous.order));return true;}
    await rate(req,'intake',10,3600000);
    const items=selectItems(input.items,(await readCatalog()).products),createdAt=new Date(now()).toISOString();
    const subtotal=items.every(x=>Number.isSafeInteger(x.unitPriceToman)&&x.unitPriceToman>=0)?items.reduce((sum,x)=>sum+x.qty*x.unitPriceToman,0):null;
    const delivery=validated.data.deliveryMethod,settings=delivery?await store('shipping_get'):null;
    const shippingFee=delivery==='courier'?0:settings?.postageToman??null;
    const deliveryData=delivery?{shippingFeeToman:shippingFee,totalToman:subtotal===null||shippingFee===null?null:subtotal+shippingFee}:{};
    const order={id:randomUUID(),requestKey:key,payloadHash,...validated.data,items,subtotalToman:subtotal,...deliveryData,status:'received',payment:{status:'unpaid'},stockConfirmed:false,preparationDays:null,shippingEstimateToman:delivery==='post'?shippingFee:null,shippingMethod:delivery==='post'?'prepaid':'postpaid',quoteAcceptedVersion:null,privateNote:'',seenAt:null,createdAt,updatedAt:createdAt,version:1,history:[{at:createdAt,status:'received',label:'سفارش دریافت شد',note:delivery==='courier'?'ارسال با پیک در شهر تهران؛ هماهنگی با هویا و پرداخت هزینه مستقیم به پیک.':delivery==='post'?'ارسال با پست؛ هزینه '+(shippingFee===null?'در انتظار تعیین و تایید قبل از پرداخت است.':shippingFee+' تومان به جمع سفارش اضافه شد.'):'موجودی، زمان آماده سازی و هزینه ارسال پیش از پرداخت تایید می‌شود.'}]};
    const saved=await store('create',{key,hash:payloadHash,order,...(delivery==='post'?{shippingVersion:validated.data.shippingVersion}:{}),channels:notifications?await notifications.channels():[]});if(saved.shippingChanged){json(res,409,{message:'هزینه پست تغییر کرده است. مبلغ جدید را بررسی و دوباره ثبت کنید.',shippingSettings:saved.shippingSettings});return true;}if(saved.hash!==payloadHash)throw fail('اطلاعات این درخواست تغییر کرده است.',409);
    json(res,201,receipt(saved.order));notifications?.kick();return true;
   }
   if(path==='/api/customer/v1/session'&&req.method==='GET'){
    const current=user(req),sms=await readSmsConfig();let browser=jar(req)['__Host-hooya_browser'];if(!/^[\w-]{43}$/.test(browser||''))browser=randomBytes(32).toString('base64url');
    json(res,200,{authenticated:!!current,phone:current?.phone||null,csrf:current?.csrf||sign('csrf:'+browser),smsAvailable:!!(sms.apiKey&&sms.template),paymentAvailable:false},{'Set-Cookie':cookie('__Host-hooya_browser',browser,86400)});return true;
   }
   if(path==='/api/customer/v1/otp/request'&&req.method==='POST'){
    checkCsrf(req,csrf(req));const input=await body(req),phone=V.digits(input.phone).replace(/[\s()-]/g,'').replace(/^(\+98|0098|98)/,'0');
    if(!/^09\d{9}$/.test(phone))throw fail('شماره موبایل را به درستی وارد کنید.');
    const sms=await readSmsConfig();if(!sms.apiKey||!sms.template)throw fail('ورود پیامکی هنوز فعال نشده است. پیگیری با لینک خصوصی سفارش در دسترس است.',503);
    await rate(req,'otp-minute',3,60000);await rate(req,'otp-hour',15,3600000);
    for(const [scope,limit,period] of [['phone-minute',1,60000],['phone-hour',5,3600000],['phone-day',10,86400000],['global-day',100,86400000]]){
     const slot=Math.floor(now()/period),key=sign(scope+':'+(scope==='global-day'?'':phone)+':'+slot);
     if(await store('rate',{key,expires:(slot+1)*period,now:now()})>limit)throw fail('برای ارسال دوباره کد کمی صبر کنید.',429);
    }
    const id=randomBytes(32).toString('base64url'),code=String(randomInt(100000,1000000)),browser=hash(jar(req)['__Host-hooya_browser']);
    await store('otp_start',{id,phone,hash:sign('otp:'+id+':'+code),browser,expires:now()+120000,now:now()});
    try{await sendSms({config:sms,phone,code});}catch{await store('otp_delete',{id});throw fail('ارسال کد انجام نشد. کمی بعد دوباره تلاش کنید.',503);}
    json(res,200,{challenge:id,expiresIn:120,retryAfter:60});return true;
   }
   if(path==='/api/customer/v1/otp/verify'&&req.method==='POST'){
    checkCsrf(req,csrf(req));await rate(req,'otp-verify',30,3600000);const input=await body(req),id=String(input.challenge||''),code=V.digits(input.code);
    if(!/^[\w-]{43}$/.test(id)||!/^\d{6}$/.test(code))throw fail('کد ورود معتبر نیست.',401);
    const phone=await store('otp_verify',{id,hash:sign('otp:'+id+':'+code),browser:hash(jar(req)['__Host-hooya_browser']||''),now:now()});
    if(!phone)throw fail('کد اشتباه است یا اعتبار آن تمام شده است.',401);
    for(const [key,value] of sessions)if(value.expires<now())sessions.delete(key);
    if(sessions.size>=1000)sessions.delete(sessions.keys().next().value);
    const token=randomBytes(32).toString('base64url'),current={phone,csrf:randomBytes(32).toString('base64url'),expires:now()+8*3600000,lastSeen:now()};sessions.set(hash(token),current);
    json(res,200,{authenticated:true,phone,csrf:current.csrf},{'Set-Cookie':cookie('__Host-hooya_customer',token,8*3600)});return true;
   }
   if(path==='/api/customer/v1/logout'&&req.method==='POST'){
    const current=user(req);if(!current)throw fail('وارد حساب نشده‌اید.',401);checkCsrf(req,current.csrf);sessions.delete(hash(jar(req)['__Host-hooya_customer']));json(res,200,{ok:true},{'Set-Cookie':cookie('__Host-hooya_customer','',0)});return true;
   }
   if(path==='/api/customer/v1/orders'&&req.method==='GET'){
    const current=user(req);if(!current)throw fail('برای دیدن سفارش ها وارد حساب شوید.',401);
    json(res,200,{orders:(await store('list',{phone:current.phone})).map(publicOrder)});return true;
   }
   if(path==='/api/customer/v1/track'&&req.method==='POST'){
    await rate(req,'track',120,3600000);const input=await body(req),order=uuid.test(input.id||'')?await store('get',{id:input.id}):null,current=user(req);
    if(!order||!(current?.phone===order.billing.phone||equal(input.token,tracking(order))))throw fail('سفارش یافت نشد یا لینک پیگیری معتبر نیست.',404);
    json(res,200,{order:publicOrder(order)});return true;
   }
   if(path==='/admin/api/order-counts'&&req.method==='GET'){json(res,200,await store('counts'));return true;}
   if(path==='/admin/api/notifications'&&req.method==='GET'&&notifications){json(res,200,await notifications.status());return true;}
   if(path==='/admin/api/notifications'&&req.method==='POST'&&notifications){json(res,200,await notifications.configure(await body(req)));return true;}
   if(path==='/admin/api/notifications/retry'&&req.method==='POST'&&notifications){const input=await body(req);json(res,200,await notifications.retry(input.channel));return true;}
   if(path==='/admin/api/notifications/test'&&req.method==='POST'&&notifications){
    await rate(req,'notification-test',10,3600000);const input=await body(req);
    try{json(res,200,await notifications.test(input.channel));}catch(error){throw fail(error.status?error.message:'ارسال آزمایشی انجام نشد؛ توکن، شناسه گفتگو و اتصال پیام رسان را بررسی کنید.',error.status||502);}return true;
   }
   if(path==='/admin/api/orders'&&req.method==='GET'){
    const orders=await store('list');json(res,200,{orders:orders.map(({requestKey,payloadHash,...order})=>order),states,unread:orders.filter(o=>!o.seenAt).length});return true;
   }
   if(path==='/admin/api/order'&&req.method==='POST'){
    const input=await body(req),order=uuid.test(input.id||'')?await store('get',{id:input.id}):null;if(!order)throw fail('سفارش پیدا نشد.',404);
    if(input.version!==order.version)throw fail('سفارش تغییر کرده است. دوباره دریافت کنید.',409);
    const version=order.version;
    if(input.action==='seen'){order.seenAt=new Date(now()).toISOString();}
    else if(input.action==='review'){
     if(!['received','reviewing','awaiting_payment'].includes(order.status)||order.payment.status==='paid')throw fail('این سفارش در مرحله ویرایش نیست.',409);
     for(const name of ['preparationDays','shippingEstimateToman'])if(input[name]!==null&&(!Number.isSafeInteger(input[name])||input[name]<0||input[name]>(name==='preparationDays'?365:100000000)))throw fail('زمان یا هزینه ارسال معتبر نیست.');
     if(typeof input.privateNote!=='string'||input.privateNote.length>2000)throw fail('یادداشت داخلی بیش از حد طولانی است.');
     order.stockConfirmed=input.stockConfirmed===true;order.preparationDays=input.preparationDays;order.shippingEstimateToman=input.shippingEstimateToman;
     if(order.deliveryMethod==='post'){
      // A captured fixed fee never changes with later global settings or review input.
      if(order.shippingFeeToman===null)order.shippingFeeToman=input.shippingEstimateToman;
      order.shippingEstimateToman=order.shippingFeeToman;
      order.totalToman=order.subtotalToman===null||order.shippingFeeToman===null?null:order.subtotalToman+order.shippingFeeToman;
     }
     order.privateNote=input.privateNote;order.quoteAcceptedVersion=null;
     event(order,'شرایط آماده سازی به‌روز شد',`${order.preparationDays===null?'زمان آماده سازی در انتظار تایید است.':'زمان آماده سازی: '+order.preparationDays+' روز.'} ${order.deliveryMethod==='post'?'ارسال با پست: '+(order.shippingFeeToman===null?'در انتظار تعیین هزینه.':order.shippingFeeToman+' تومان همراه سفارش.'):order.deliveryMethod==='courier'?'پیک توسط هویا هماهنگ می‌شود؛ هزینه مستقیم به پیک پرداخت می‌شود.':'ارسال به صورت پس‌کرایه است.'}`);
    }else if(input.action==='status'){
     if(!moves[order.status]?.includes(input.status))throw fail('این تغییر وضعیت مجاز نیست.',409);
     if(input.status==='awaiting_payment'&&(!order.stockConfirmed||order.preparationDays===null||(order.deliveryMethod==='courier'?false:order.deliveryMethod==='post'?order.shippingFeeToman===null:order.shippingEstimateToman===null)||order.subtotalToman===null))throw fail('موجودی، زمان آماده سازی و هزینه ارسال را ابتدا تکمیل کنید.',409);
     if(input.status==='preparing'&&order.payment.status!=='paid')throw fail('ابتدا دریافت وجه باید ثبت شود.',409);
     if(input.status==='cancelled'&&order.payment.status==='paid')throw fail('سفارش پرداخت شده به بررسی و ثبت بازپرداخت نیاز دارد. از لغو مستقیم استفاده نکنید.',409);
     if(input.status==='shipped'){
      if(typeof input.carrier!=='string'||input.carrier.trim().length<2||input.carrier.length>60||typeof input.trackingCode!=='string'||!/^[A-Za-z0-9-]{5,40}$/.test(input.trackingCode))throw fail('نام شرکت ارسال و کد رهگیری معتبر لازم است.');
      order.shipment={carrier:input.carrier.trim(),trackingCode:input.trackingCode,at:new Date(now()).toISOString()};
     }
     order.status=input.status;event(order,states[order.status]);
    }else if(input.action==='payment'){
     if(order.status!=='awaiting_payment'||order.payment.status==='paid'||input.amountToman!==(order.deliveryMethod?order.totalToman:order.subtotalToman)||typeof input.reference!=='string'||input.reference.trim().length<4||input.reference.length>120)throw fail('مبلغ و شناسه دریافت وجه را بررسی کنید.',409);
     order.payment={status:'paid',method:'manual',amountToman:input.amountToman,reference:input.reference.trim(),at:new Date(now()).toISOString()};event(order,'دریافت وجه به صورت دستی ثبت شد','این تایید توسط مدیریت ثبت شده است.');
    }else throw fail('عملیات معتبر نیست.');
    await update(order,version);const {requestKey,payloadHash,...result}=order;json(res,200,{order:result});return true;
   }
   if(path==='/admin/api/sms'&&req.method==='GET'){
    const config=await readSmsConfig();json(res,200,{provider:'kavenegar',configured:!!config.apiKey,template:config.template||'',enabled:!!(config.apiKey&&config.template)});return true;
   }
   if(path==='/admin/api/sms'&&req.method==='POST'){
    const input=await body(req),current=await readSmsConfig();if(typeof input.template!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(input.template)||typeof input.apiKey!=='string'||(input.apiKey&&!/^[A-Za-z0-9]{20,200}$/.test(input.apiKey)))throw fail('نام الگو یا کلید API معتبر نیست.');
    const config={provider:'kavenegar',apiKey:input.apiKey||current.apiKey,template:input.template};if(!config.apiKey)throw fail('کلید API را وارد کنید.');await writeSmsConfig(config);json(res,200,{ok:true});return true;
   }
   json(res,404,{message:'مسیر پیدا نشد.'});
  }catch(error){json(res,error.status||503,{message:error.status?error.message:'سرویس سفارش موقتا در دسترس نیست. دوباره تلاش کنید.'});}
  return true;
 };
}

export async function sendKavenegar({config,phone,code}){
 const response=await fetch('https://api.kavenegar.com/v1/'+config.apiKey+'/verify/lookup.json',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({receptor:phone,token:code,template:config.template,type:'sms'}),signal:AbortSignal.timeout(8000),redirect:'error'});
 const data=await response.json();if(!response.ok||data?.return?.status!==200)throw Error('SMS delivery request failed');
}
