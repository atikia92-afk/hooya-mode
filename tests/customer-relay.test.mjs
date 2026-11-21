import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const source=(await fs.readFile(new URL('../worker/customer-relay.mjs',import.meta.url),'utf8')).replace('export default','globalThis.relay =');
function relay(fetch){const context=vm.createContext({Request,Response,URL,Uint8Array,AbortSignal,fetch});vm.runInContext(source,context);return context.relay;}
test('old checkout POSTs use the same VPS store without forwarding cookies or credentials',async()=>{
 let calls=0;const worker=relay(async(url,init)=>{calls++;assert.equal(url,'https://hooyamode.ir/api/customer/v1/customer-details');assert.equal(init.redirect,'manual');assert.equal(init.headers.Cookie,undefined);assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers['Idempotency-Key'],'same-request');assert.equal(new TextDecoder().decode(init.body),'{}');return new Response(JSON.stringify({status:'received',reference:'same-order'}),{status:201});});
 const response=await worker.fetch(new Request('https://api.hooyamode.ir/v1/customer-details',{method:'POST',headers:{Origin:'https://hooyamode.ir','Content-Type':'application/json','Idempotency-Key':'same-request',Cookie:'private=value',Authorization:'secret'},body:'{}'}));
 assert.equal(response.status,201);assert.equal(calls,1);assert.equal(response.headers.get('access-control-allow-origin'),'https://hooyamode.ir');assert.match(response.headers.get('cache-control'),/no-store/);
});
test('legacy relay exposes no customer read routes, refuses foreign writes and never follows redirects',async()=>{
 let calls=0;const worker=relay(async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://other.example/'}});});
 assert.equal((await worker.fetch(new Request('https://api.hooyamode.ir/v1/customer-details'))).status,405);
 assert.equal((await worker.fetch(new Request('https://api.hooyamode.ir/admin/api/orders'))).status,404);
 assert.equal((await worker.fetch(new Request('https://api.hooyamode.ir/v1/customer-details',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}))).status,403);assert.equal(calls,0);
 assert.equal((await worker.fetch(new Request('https://api.hooyamode.ir/health'))).status,503);assert.equal(calls,1);
});
