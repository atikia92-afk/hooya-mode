import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import H from '../docs/catalog.js';

const sameProducts=(a,b)=>a.products.length===b.products.length&&a.products.every(p=>JSON.stringify(p)===JSON.stringify(b.products.find(x=>x.id===p.id)));
const error=(status,message)=>Object.assign(new Error(message),{status});
function validate(catalog){
 H.validate(catalog);
 const codes=new Set();
 for(const p of catalog.products){const code=H.normalize(p.sku).trim();if(code&&codes.has(code))throw Error('کد محصولات نباید تکراری باشد.');if(code)codes.add(code);}
 return catalog;
}
export function createFileCatalogStore(directory){
 const filename=path.join(directory,'catalog.json');
 return {
  async read(){try{return validate(JSON.parse(await fs.readFile(filename,'utf8')));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  async write(catalog){
   validate(catalog);const text=JSON.stringify(catalog,null,2)+'\n',temporary=path.join(directory,'.catalog-'+randomUUID()+'.tmp');
   try{
    const old=await this.read();
    if(old){const history=path.join(directory,'history');await fs.mkdir(history,{recursive:true,mode:0o750});const contents=JSON.stringify(old,null,2)+'\n';const hash=createHash('sha256').update(contents).digest('hex');const backup=path.join(history,hash+'.json');await fs.writeFile(backup,contents,{mode:0o640});await fs.chmod(backup,0o640);}
    const handle=await fs.open(temporary,'wx',0o640);
    try{await handle.writeFile(text);await handle.chmod(0o640);await handle.sync();}finally{await handle.close();}
    await fs.rename(temporary,filename);
    if(process.platform!=='win32'){const folder=await fs.open(directory,'r');try{await folder.sync();}finally{await folder.close();}}
   }finally{await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
 };
}

export function createCatalogPublisher({store,readLive,now=Date.now}){
 let queue=Promise.resolve();
 const serial=fn=>{const task=queue.then(fn,fn);queue=task.catch(()=>{});return task;};
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});res.end(JSON.stringify(data));}
 const current=async()=>validate(await store.read()||await readLive());
 const state=async catalog=>{const liveCatalog=validate(await readLive());return {catalog,liveCatalog,status:liveCatalog.version===catalog.version?'live':'pending'};};
 return async(req,res,getSession)=>{
  if(new URL(req.url,'http://localhost').pathname!=='/admin/api/catalog')return false;
  try{
   const session=getSession(req);if(!session)throw error(401,'نشست مدیریت منقضی شده است. دوباره وارد شوید.');
   if(req.method==='GET'){json(res,200,await state(await current()));return true;}
   if(req.method!=='POST')throw error(405,'روش درخواست معتبر نیست.');
   if(req.headers.origin&&!['https://hooyamode.ir','null'].includes(req.headers.origin))throw error(403,'مبدا درخواست معتبر نیست.');
   if(req.headers['x-csrf-token']!==session.csrf)throw error(403,'درخواست انتشار معتبر نیست. صفحه را دوباره باز کنید.');
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw error(415,'فرمت درخواست معتبر نیست.');
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>950000)throw error(413,'حجم کاتالوگ بیش از حد مجاز است.');chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));validate(body.catalog);}catch(e){throw error(422,e.message?.startsWith('Unexpected')?'اطلاعات محصولات معتبر نیست.':e.message||'اطلاعات محصولات معتبر نیست.');}
   const result=await serial(async()=>{
    const before=await current();
    // A retry of an accepted submission is safe, even after another device logs in.
    if(sameProducts(body.catalog,before))return state(before);
    if(body.baseVersion!==before.version)throw error(409,'محصولات در سیستم دیگری تغییر کرده‌اند. تغییرهای شما محفوظ است؛ نسخه جدید را بررسی کنید.');
    const version=new Date(Math.max(now(),Date.parse(before.version)+1)).toISOString();
    const catalog={...body.catalog,version};validate(catalog);await store.write(catalog);return state(catalog);
   });
   json(res,result.status==='live'?200:202,result);
  }catch(e){json(res,e.status||503,{error:e.status?e.message:'ذخیره روی سرور انجام نشد. تغییرهای محلی شما محفوظ است؛ دوباره تلاش کنید.'});}
  return true;
 };
}
