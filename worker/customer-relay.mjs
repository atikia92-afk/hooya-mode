// Compatibility for checkout tabs opened before the VPS order service existed.
// Only the existing public routes are forwarded, without cookies or credentials.
// Historical D1 records remain intact.
export default {
 async fetch(request){
  const allowed=['https://hooyamode.ir','https://www.hooyamode.ir'],origin=request.headers.get('Origin'),path=new URL(request.url).pathname;
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(allowed.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Idempotency-Key','Access-Control-Max-Age':'600'});
  const error=(message,status)=>new Response(JSON.stringify({message}),{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:allowed.includes(origin)?204:403,headers});
  if(!['/health','/v1/catalog','/v1/customer-details'].includes(path))return error('پیدا نشد.',404);
  if((path==='/v1/customer-details'&&request.method!=='POST')||(path!=='/v1/customer-details'&&request.method!=='GET'))return error('درخواست مجاز نیست.',405);
  if(request.method==='POST'&&!allowed.includes(origin))return error('درخواست مجاز نیست.',403);
  try{
   let payload;
   if(request.method==='POST'){
    if(Number(request.headers.get('Content-Length'))>24000)return error('درخواست بیش از حد بزرگ است.',413);
    const reader=request.body?.getReader();if(!reader)return error('درخواست معتبر نیست.',400);const chunks=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();return error('درخواست بیش از حد بزرگ است.',413);}chunks.push(value);}
    payload=new Uint8Array(size);let offset=0;for(const part of chunks){payload.set(part,offset);offset+=part.byteLength;}
   }
   const upstreamHeaders={};for(const name of ['Content-Type','Idempotency-Key','Origin'])if(request.headers.has(name))upstreamHeaders[name]=request.headers.get(name);
   const upstream=await fetch('https://hooyamode.ir/api/customer'+path,{method:request.method,headers:upstreamHeaders,...(payload?{body:payload}:{}),redirect:'error',signal:AbortSignal.timeout(18000)});
   return new Response(upstream.body,{status:upstream.status,headers});
  }catch{return error('ثبت سفارش فعلا در دسترس نیست. کمی بعد دوباره تلاش کنید.',503);}
 }
};
