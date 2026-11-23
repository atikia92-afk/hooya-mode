import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAdminServer,passwordRecord} from '../server/admin-server.mjs';
import {createCatalogPublisher,createFileCatalogStore} from '../server/catalog-publisher.mjs';

const seed=JSON.parse(await fs.readFile(new URL('../docs/products.json',import.meta.url),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
const password='test-only-manager-password-2026';
const credentials=await passwordRecord('TestManager',password);
async function setup(t,{failWrite=false}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hooya-catalog-test-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const store=createFileCatalogStore(directory);let live=clone(seed);
 const publisher=createCatalogPublisher({store:failWrite?{read:()=>store.read(),write:async()=>{throw Error('disk unavailable');}}:store,readLive:async()=>clone(live)});
 const server=createAdminServer({credentials,loginTemplate:'<input name="csrf" value="__CSRF__">',readAdminFile:async()=>'<input id="admin-csrf" value="__LOGOUT_CSRF__">',catalogPublisher:publisher});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 const origin='http://127.0.0.1:'+server.address().port;
 function device(){
  const jar=new Map();let csrf='';
  async function request(route,options={}){
   const response=await fetch(origin+route,{redirect:'manual',...options,headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...options.headers}});
   const cookies=response.headers.getSetCookie?.()||(response.headers.get('set-cookie')||'').split(/, (?=__Host-)/).filter(Boolean);
   for(const entry of cookies){const [key,value]=entry.split(';')[0].split('=');if(/Max-Age=0(?:;|$)/.test(entry))jar.delete(key);else jar.set(key,value);}
   return response;
  }
  async function login(){
   const html=await(await request('/admin/login')).text(),challenge=html.match(/name="csrf" value="([^"]+)"/)[1];
   assert.equal((await request('/admin/login',{method:'POST',headers:{Origin:'https://hooyamode.ir','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'TestManager',password,csrf:challenge})})).status,303);
   csrf=(await(await request('/admin/')).text()).match(/value="([^"]+)"/)[1];
  }
  const post=(catalog,baseVersion=seed.version,headers={})=>request('/admin/api/catalog',{method:'POST',headers:{Origin:'https://hooyamode.ir','Content-Type':'application/json','X-CSRF-Token':csrf,...headers},body:JSON.stringify({catalog,baseVersion})});
  return {request,login,post};
 }
 return {store,device,directory,setLive:catalog=>{live=clone(catalog);}};
}

test('publication requires an authenticated manager and the existing session CSRF proof',async t=>{
 const app=await setup(t),device=app.device();
 assert.equal((await device.request('/admin/api/catalog')).status,401);assert.equal((await device.post(seed)).status,401);
 await device.login();
 assert.equal((await device.post(seed,seed.version,{'X-CSRF-Token':''})).status,403);
 assert.equal((await device.post(seed,seed.version,{Origin:'https://foreign.example'})).status,403);
 const response=await device.post(seed,seed.version,{Origin:'null'});assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.status,'live');assert.deepEqual(body.catalog,seed);assert.ok(!JSON.stringify(body).includes(password));
});
test('two independently signed-in computers share durable product updates, without GitHub access',async t=>{
 const app=await setup(t),first=app.device(),second=app.device();await first.login();await second.login();
 const changed=clone(seed);changed.products[0].price=12300000;
 const response=await first.post(changed);assert.equal(response.status,202);const accepted=await response.json();assert.equal(accepted.status,'pending');assert.notEqual(accepted.catalog.version,seed.version);
 const read=await(await second.request('/admin/api/catalog')).json();assert.deepEqual(read.catalog,accepted.catalog);assert.equal(read.liveCatalog.version,seed.version);
 const reopened=createFileCatalogStore(app.directory);assert.deepEqual(await reopened.read(),accepted.catalog);
 app.setLive(accepted.catalog);assert.equal((await(await second.request('/admin/api/catalog')).json()).status,'live');
});
test('stale edits and simultaneous submissions cannot overwrite another computer; retries are idempotent',async t=>{
 const app=await setup(t),first=app.device(),second=app.device();await first.login();await second.login();
 const one=clone(seed);one.products[0].price=12300000;const accepted=await(await first.post(one)).json();
 const retry=await(await first.post(one)).json();assert.equal(retry.catalog.version,accepted.catalog.version);
 const stale=clone(seed);stale.products[0].price=99900000;assert.equal((await second.post(stale)).status,409);assert.equal((await app.store.read()).products[0].price,12300000);
 const a=clone(accepted.catalog),b=clone(a);a.products[0].price=12400000;b.products[0].price=12500000;
 const responses=await Promise.all([first.post(a,a.version),second.post(b,b.version)]);assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);
 assert.ok((await fs.readdir(path.join(app.directory,'history'))).length>=1);
});
test('invalid catalogs, duplicate codes, and oversized bodies never enter the publication queue',async t=>{
 const app=await setup(t),device=app.device();await device.login();
 for(const mutate of [p=>p.stock=-1,p=>p.image='javascript:alert(1)',p=>p.sku=seed.products[1].sku]){const bad=clone(seed);mutate(bad.products[0]);assert.equal((await device.post(bad)).status,422);}
 const oversized=clone(seed);oversized.filler='x'.repeat(960000);assert.equal((await device.post(oversized)).status,413);assert.equal(await app.store.read(),null);
});
test('a storage failure never acknowledges publication or destroys the current catalog',async t=>{
 const app=await setup(t,{failWrite:true}),device=app.device();await device.login();const changed=clone(seed);changed.products[0].price=10000000;
 const response=await device.post(changed);assert.equal(response.status,503);assert.match((await response.json()).error,/انجام نشد/);assert.equal(await app.store.read(),null);
});
