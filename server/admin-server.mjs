import http from 'node:http';
import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createOrderStore} from './order-store.mjs';
import {createOrders,sendKavenegar} from './orders.mjs';
import {createCatalogPublisher,createFileCatalogStore} from './catalog-publisher.mjs';

const derive=promisify(scrypt),COOKIE='__Host-hooya_admin',LOGIN='__Host-hooya_login';
const digest=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const cookies=request=>Object.fromEntries((request.headers.cookie||'').split(';').map(item=>item.trim().split('=')).filter(parts=>parts.length===2));
const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Strict`;
// Opaque browser contexts may send Origin: null. They still have to prove the
// unpredictable form token and matching HttpOnly cookie; foreign origins fail.
const allowedOrigin=value=>!value||value==='null'||value==='https://hooyamode.ir';
const types={'index.html':'text/html; charset=utf-8','orders.html':'text/html; charset=utf-8','orders.css':'text/css; charset=utf-8','orders.js':'application/javascript; charset=utf-8','admin.css':'text/css; charset=utf-8','admin.js':'application/javascript; charset=utf-8'};

export async function passwordRecord(username,password){
 if(!/^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(username)||typeof password!=='string'||password.length<16||password.length>128)throw Error('Invalid administrator credential format');
 const salt=randomBytes(32),hash=await derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return {username,salt:salt.toString('base64'),hash:hash.toString('base64')};
}

export function createAdminServer({credentials,loginTemplate,readAdminFile,commerce,catalogPublisher,now=Date.now}){
 if(!credentials||!/^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(credentials.username)||Buffer.from(credentials.salt||'','base64').length!==32||Buffer.from(credentials.hash||'','base64').length!==64)throw Error('Invalid administrator configuration');
 const sessions=new Map(),challenges=new Map(),failures=new Map(),rateSalt=randomBytes(32).toString('hex');
 let checking=0;
 const session=request=>{
  const token=cookies(request)[COOKIE];if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const key=digest(token),value=sessions.get(key);
  if(!value)return null;
  if(now()>value.expires||now()-value.lastSeen>60*60*1000){sessions.delete(key);return null;}
  value.lastSeen=now();return key;
 };
 function respond(response,status,body='',headers={}){
  response.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",...headers});response.end(body);
 }
 function loginPage(response,status=200,message=''){
  const stamp=now();for(const [key,expiry] of challenges)if(expiry<stamp)challenges.delete(key);
  while(challenges.size>=1000)challenges.delete(challenges.keys().next().value);
  const token=randomBytes(32).toString('base64url');challenges.set(digest(token),stamp+10*60*1000);
  respond(response,status,loginTemplate.replaceAll('__CSRF__',token).replaceAll('__ERROR__',message),{'Set-Cookie':cookie(LOGIN,token,600)});
 }
 const handler=async(request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(catalogPublisher&&await catalogPublisher(request,response,req=>{const key=session(req);return key?sessions.get(key):null;}))return;
  if(commerce&&await commerce(request,response,req=>{const key=session(req);return key?sessions.get(key):null;}))return;
  if(request.method==='GET'&&pathname==='/admin/login'){
   if(session(request)){respond(response,303,'',{Location:'/admin/'});return;}
   loginPage(response);return;
  }
  if(request.method==='POST'&&pathname==='/admin/login'){
   if(!allowedOrigin(request.headers.origin)){respond(response,403,'درخواست ورود معتبر نیست.');return;}
   if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers['content-type']||'')){respond(response,415,'فرمت درخواست معتبر نیست.');return;}
   let body='';for await(const part of request){body+=part;if(Buffer.byteLength(body)>4096){respond(response,413,'درخواست بیش از حد بزرگ است.');return;}}
   const fields=new URLSearchParams(body),csrf=fields.get('csrf')||'',browser=cookies(request)[LOGIN]||'',key=digest(csrf);
   const expiry=challenges.get(key);challenges.delete(key);
   if(!expiry||expiry<now()||!equal(csrf,browser)){loginPage(response,403,'فرم ورود منقضی شده است. دوباره تلاش کنید.');return;}
   const address=String(request.headers['x-real-ip']||request.socket.remoteAddress||'local'),rateKey=digest(rateSalt+address),stamp=now();
   for(const [key,value] of failures)if(value.until<stamp)failures.delete(key);
   const failure=failures.get(rateKey)||{count:0,until:stamp+15*60*1000};
   if(failure.count>=8||failures.size>=1000){loginPage(response,429,'تلاش های ورود زیاد است. پانزده دقیقه بعد دوباره تلاش کنید.');return;}
   if(checking>=2){loginPage(response,503,'لطفا چند لحظه بعد دوباره تلاش کنید.');return;}
   const password=fields.get('password')||'',username=(fields.get('username')||'').trim();
   if(password.length>128||username.length>64){failure.count++;failures.set(rateKey,failure);loginPage(response,401,'نام کاربری یا رمز عبور درست نیست.');return;}
   checking++;
   let verified=false;
   try{const candidate=await derive(password,Buffer.from(credentials.salt,'base64'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});verified=equal(candidate,Buffer.from(credentials.hash,'base64'))&&username.toLowerCase()===credentials.username.toLowerCase();}
   finally{checking--;}
   if(!verified){failure.count++;failures.set(rateKey,failure);loginPage(response,401,'نام کاربری یا رمز عبور درست نیست.');return;}
   failures.delete(rateKey);
   const previous=cookies(request)[COOKIE];if(previous)sessions.delete(digest(previous));
   const token=randomBytes(32).toString('base64url');
   for(const [key,value] of sessions)if(value.expires<stamp||stamp-value.lastSeen>60*60*1000)sessions.delete(key);
   while(sessions.size>=100)sessions.delete(sessions.keys().next().value);
   sessions.set(digest(token),{expires:stamp+8*60*60*1000,lastSeen:stamp,csrf:randomBytes(32).toString('base64url')});
   respond(response,303,'',{Location:'/admin/','Set-Cookie':[cookie(COOKIE,token,8*60*60),cookie(LOGIN,'',0)]});return;
  }
  if(pathname==='/admin/logout'){
   if(request.method!=='POST'){respond(response,405,'',{Allow:'POST'});return;}
   if(!allowedOrigin(request.headers.origin)){respond(response,403,'درخواست خروج معتبر نیست.');return;}
   const key=session(request);
   if(key){
    let body='';for await(const part of request){body+=part;if(Buffer.byteLength(body)>4096){respond(response,413,'درخواست بیش از حد بزرگ است.');return;}}
    if(!equal(new URLSearchParams(body).get('csrf')||'',sessions.get(key).csrf)){respond(response,403,'درخواست خروج معتبر نیست.');return;}
    sessions.delete(key);
   }
   respond(response,303,'',{Location:'/admin/login','Set-Cookie':cookie(COOKIE,'',0)});return;
  }
  if(request.method!=='GET'&&request.method!=='HEAD'){respond(response,405,'',{Allow:'GET, HEAD'});return;}
  const file=pathname==='/admin/'||pathname==='/admin/index.html'?'index.html':pathname==='/admin/orders'||pathname==='/admin/orders.html'?'orders.html':['admin.js','admin.css','orders.js','orders.css'].find(name=>pathname==='/admin/'+name)||null;
  if(!file){respond(response,404,'پیدا نشد.');return;}
  const key=session(request);
  if(!key){
   if(file.endsWith('.html'))respond(response,303,'',{Location:'/admin/login'});
   else respond(response,401,'دسترسی نیاز به ورود دارد.');
   return;
  }
  let body=request.method==='HEAD'?'':await readAdminFile(file);
  if(file.endsWith('.html'))body=body.toString().replaceAll('__LOGOUT_CSRF__',sessions.get(key).csrf);
  respond(response,200,body,{'Content-Type':types[file]});
 };
 const server=http.createServer({maxHeaderSize:8192},(request,response)=>handler(request,response).catch(()=>{if(!response.headersSent)respond(response,503,'سرویس ورود موقتا در دسترس نیست.');else response.end();}));
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href){
 const credentials=JSON.parse(await fs.readFile(process.env.HOOYA_ADMIN_CREDENTIALS||'/etc/hooya-admin/credentials.json','utf8'));
 const loginTemplate=await fs.readFile(new URL('./admin-login.html',import.meta.url),'utf8');
 const directory=process.env.HOOYA_ADMIN_UI||'/var/lib/hooya-source/admin-current';
 const state=process.env.HOOYA_ORDER_STATE||'/var/lib/hooya-orders';
 const readCatalog=async()=>JSON.parse(await fs.readFile(process.env.HOOYA_CATALOG||'/var/www/hooyamode.ir/current/products.json','utf8'));
 const catalogPublisher=createCatalogPublisher({store:createFileCatalogStore(process.env.HOOYA_CATALOG_STATE||'/var/lib/hooya-catalog'),readLive:readCatalog});
 const secret=(await fs.readFile(path.join(state,'secret'),'utf8')).trim();
 const smsFile=path.join(state,'sms.json');
 const readSmsConfig=async()=>{try{return JSON.parse(await fs.readFile(smsFile,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}};
 const commerce=createOrders({store:createOrderStore(path.join(state,'orders.sqlite3')),secret,
  readCatalog,
  readSmsConfig,writeSmsConfig:async config=>{const temporary=smsFile+'.next';await fs.writeFile(temporary,JSON.stringify(config),{mode:0o600});await fs.rename(temporary,smsFile);},sendSms:sendKavenegar});
 const server=createAdminServer({credentials,loginTemplate,readAdminFile:name=>fs.readFile(path.join(directory,name)),commerce,catalogPublisher});
 server.listen(18481,'127.0.0.1',()=>console.log('Hooya administrator sign-in ready on loopback.'));
}
