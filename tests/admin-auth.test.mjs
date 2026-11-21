import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdminServer,passwordRecord} from '../server/admin-server.mjs';
const password='test-only-administrator-password-32';
const credentials=await passwordRecord('MahAdmin',password);
const template='<form><input name="csrf" value="__CSRF__"><p>__ERROR__</p></form>';
async function setup(t){
 let clock=1_000_000,reads=0;
 const server=createAdminServer({credentials,loginTemplate:template,now:()=>clock,readAdminFile:async name=>{reads++;return 'private '+name;}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 const origin='http://127.0.0.1:'+server.address().port,jar=new Map();
 async function request(route,options={}){
  const response=await fetch(origin+route,{redirect:'manual',...options,headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...options.headers}});
  const entries=response.headers.getSetCookie?.()||((response.headers.get('set-cookie')||'').split(/, (?=__Host-)/).filter(Boolean));
  for(const entry of entries){const [name,value]=entry.split(';')[0].split('=');if(/Max-Age=0(?:;|$)/.test(entry))jar.delete(name);else jar.set(name,value);}
  return response;
 }
 async function form(){const response=await request('/admin/login');const html=await response.text();return html.match(/name="csrf" value="([^"]+)"/)[1];}
 const submit=(csrf,secret=password,origin='https://hooyamode.ir')=>request('/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'MahAdmin',password:secret,csrf})});
 return {request,form,submit,jar,advance:ms=>clock+=ms,reads:()=>reads};
}
test('anonymous and forged sessions cannot read the panel or its private assets',async t=>{
 const app=await setup(t);
 for(const route of ['/admin/','/admin/index.html']){const r=await app.request(route);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/admin/login');assert.equal(await r.text(),'');}
 for(const route of ['/admin/admin.js','/admin/admin.css'])assert.equal((await app.request(route)).status,401);
 app.jar.set('__Host-hooya_admin','a'.repeat(43));assert.equal((await app.request('/admin/admin.js')).status,401);
 assert.equal(app.reads(),0);assert.equal((await app.request('/admin/%2e%2e/credentials.json')).status,404);
});
test('correct credentials rotate a secure session; logout invalidates it on the server',async t=>{
 const app=await setup(t),response=await app.submit(await app.form());
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/admin/');
 const cookies=response.headers.get('set-cookie');for(const flag of ['Secure','HttpOnly','SameSite=Strict','Path=/'])assert.ok(cookies.includes(flag));
 const first=app.jar.get('__Host-hooya_admin');assert.equal((await app.request('/admin/')).status,200);
 assert.equal((await app.request('/admin/admin.js')).status,200);
 assert.equal((await app.request('/admin/logout')).status,405);
 assert.equal((await app.request('/admin/logout',{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await app.request('/admin/')).status,200);
 // A second login replaces the prior session, including when its cookie was copied.
 await app.request('/admin/logout',{method:'POST',headers:{Origin:'https://hooyamode.ir'}});
 app.jar.set('__Host-hooya_admin',first);assert.equal((await app.request('/admin/admin.js')).status,401);
 await app.submit(await app.form());assert.notEqual(app.jar.get('__Host-hooya_admin'),first);
});
test('wrong passwords and invalid or replayed login forms never create an authenticated session',async t=>{
 const app=await setup(t),csrf=await app.form();
 assert.equal((await app.submit(csrf,password,'https://evil.example')).status,403);
 assert.equal((await app.submit(csrf,'incorrect-password')).status,401);
 assert.equal(app.jar.has('__Host-hooya_admin'),false);
 assert.equal((await app.submit(csrf)).status,403);
 app.advance(11*60*1000);assert.equal((await app.submit(await app.form()+'tampered')).status,403);
 assert.equal((await app.request('/admin/')).status,303);
});
test('repeated failed logins are throttled and idle sessions expire',async t=>{
 const app=await setup(t);
 for(let i=0;i<8;i++)assert.equal((await app.submit(await app.form(),'incorrect-password')).status,401);
 assert.equal((await app.submit(await app.form())).status,429);
 app.advance(16*60*1000);assert.equal((await app.submit(await app.form())).status,303);
 app.advance(61*60*1000);assert.equal((await app.request('/admin/')).status,303);
});
test('login pages cannot be cached, framed or used to expose credentials',async t=>{
 const app=await setup(t),response=await app.request('/admin/login');
 assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('cache-control'),/no-transform/);
 assert.equal(response.headers.get('x-frame-options'),'DENY');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const html=await response.text();assert.ok(!html.includes(password));assert.ok(!html.includes(credentials.hash));
 assert.equal((await app.request('/admin/login',{method:'POST',headers:{Origin:'https://hooyamode.ir','Content-Type':'application/json'},body:'{}'})).status,415);
});
