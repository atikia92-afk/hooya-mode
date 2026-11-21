import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createOrderStore} from '../server/order-store.mjs';
import {createOrders} from '../server/orders.mjs';

const enabled=process.platform!=='win32'||!!process.env.HOOYA_TEST_PYTHON;
const contact={firstName:'آزمون',lastName:'سامانه',country:'IR',province:'تهران',city:'تهران',address:'نشانی آزمایشی سامانه پلاک صفر',unit:'',postcode:'1111111111',phone:'09120000000'};
const payload=()=>({billing:{...contact},shipping:{...contact},differentShipping:false,notes:'',shippingConsent:true,items:[{id:'sample',size:'Free',mode:'pending',qty:1,unitPriceToman:1}]});
async function setup(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hooya-order-test-')),database=path.join(directory,'orders.sqlite3');
 const store=createOrderStore(database,{python:process.env.HOOYA_TEST_PYTHON||'python3'});let config={},sent=[],clock=Date.now();
 const options={store,secret:'test-only-order-signing-secret-abcdefghijklmnopqrstuvwxyz',readCatalog:async()=>({schema:1,products:[{id:'sample',name:'لباس آزمایشی',status:'published',sizes:['Free'],stock:null,madeToOrder:false,price:100000}]}),readSmsConfig:async()=>config,writeSmsConfig:async value=>config=value,sendSms:async message=>{sent.push(message);},now:()=>clock};
 const handle=createOrders(options),server=http.createServer((req,res)=>{handle(req,res,request=>request.headers.authorization==='test-admin'?{csrf:'test-admin-csrf'}:null).then(done=>{if(!done){res.writeHead(404);res.end();}});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 const request=async(route,data,headers={})=>{const response=await fetch(origin+route,{method:data?'POST':'GET',headers:{Origin:'https://hooyamode.ir',...(data?{'Content-Type':'application/json'}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,data:await response.json(),headers:response.headers};};
 const submit=(data=payload(),key=randomUUID())=>request('/api/customer/v1/customer-details',data,{'Idempotency-Key':key});
 const admin=(route,data)=>request('/admin/api/'+route,data,{Authorization:'test-admin','X-CSRF-Token':'test-admin-csrf'});
 return {request,submit,admin,store,sent,config:value=>config=value,advance:ms=>clock+=ms,database};
}

test('durable orders snapshot server prices, retry once and reject conflicting idempotency payloads',{skip:!enabled},async t=>{
 const app=await setup(t),key=randomUUID(),data=payload();
 const [one,two]=await Promise.all([app.submit(data,key),app.submit(data,key)]);assert.equal(one.status,201);assert.ok([200,201].includes(two.status));assert.equal(one.data.reference,two.data.reference);assert.equal(one.data.trackingToken,two.data.trackingToken);
 assert.equal((await app.store('list')).length,1);const order=await app.store('get',{id:one.data.reference});assert.equal(order.subtotalToman,100000);assert.equal(order.items[0].unitPriceToman,100000);assert.equal(order.payment.status,'unpaid');
 const counts=(await app.admin('order-counts')).data;assert.equal(counts.unread,1);assert.equal(counts.counts.received,1);assert.equal(JSON.stringify(counts).includes(contact.phone),false);
 const restored=createOrderStore(app.database,{python:process.env.HOOYA_TEST_PYTHON||'python3'});assert.equal((await restored('get',{id:order.id})).id,order.id);
 data.notes='اطلاعات تغییر کرده';assert.equal((await app.submit(data,key)).status,409);
});

test('private orders need a receipt secret or authenticated role; UUIDs, foreign origins and phone numbers are insufficient',{skip:!enabled},async t=>{
 const app=await setup(t),receipt=(await app.submit()).data;
 assert.equal((await app.request('/admin/api/orders')).status,401);assert.equal((await app.request('/api/customer/v1/orders')).status,401);
 assert.equal((await app.request('/api/customer/v1/track',{id:receipt.reference,phone:contact.phone})).status,404);
 assert.equal((await app.request('/api/customer/v1/track',{id:receipt.reference,token:'bad'})).status,404);
 const valid=await app.request('/api/customer/v1/track',{id:receipt.reference,token:receipt.trackingToken});assert.equal(valid.status,200);
 assert.equal((await app.request('/api/customer/v1/track',{id:receipt.reference,token:receipt.trackingToken},{Origin:'null'})).status,200);
 assert.equal((await app.request('/api/customer/v1/track',{id:receipt.reference},{Origin:'null'})).status,404);
 for(const field of ['privateNote','requestKey','payloadHash','seenAt'])assert.equal(field in valid.data.order,false);
 assert.match(valid.headers.get('cache-control'),/no-store/);
 assert.equal((await app.request('/api/customer/v1/track',{id:receipt.reference,token:receipt.trackingToken},{Origin:'https://evil.example'})).status,403);
 assert.equal((await app.request('/admin/api/order',{id:receipt.reference,action:'seen',version:1},{Authorization:'test-admin'})).status,403);
});

test('admin state changes enforce preparation, payment, shipment and concurrent-edit safeguards',{skip:!enabled},async t=>{
 const app=await setup(t),receipt=(await app.submit()).data;let order=(await app.admin('orders')).data.orders[0];
 const change=async data=>{const result=await app.admin('order',{id:order.id,version:order.version,...data});if(result.status===200)order=result.data.order;return result;};
 assert.equal((await change({action:'status',status:'shipped'})).status,409);
 assert.equal((await change({action:'status',status:'reviewing'})).status,200);
 assert.equal((await change({action:'status',status:'awaiting_payment'})).status,409);
 assert.equal((await change({action:'review',stockConfirmed:true,preparationDays:4,shippingEstimateToman:80000,privateNote:'یادداشت محرمانه مدیریت'})).status,200);
 assert.equal((await change({action:'status',status:'awaiting_payment'})).status,200);
 assert.equal((await change({action:'status',status:'preparing'})).status,409);
 assert.equal((await change({action:'payment',amountToman:1,reference:'test-reference'})).status,409);
 assert.equal((await change({action:'payment',amountToman:100000,reference:'test-reference'})).status,200);
 assert.equal((await change({action:'payment',amountToman:100000,reference:'test-reference'})).status,409);
 assert.equal((await change({action:'status',status:'cancelled'})).status,409);
 assert.equal((await change({action:'status',status:'preparing'})).status,200);
 assert.equal((await change({action:'status',status:'shipped'})).status,400);
 assert.equal((await change({action:'status',status:'shipped',carrier:'پست',trackingCode:'1234567890'})).status,200);
 assert.equal((await app.admin('order',{id:order.id,version:1,action:'seen'})).status,409);
 assert.equal((await change({action:'status',status:'delivered'})).status,200);
 const tracked=(await app.request('/api/customer/v1/track',{id:receipt.reference,token:receipt.trackingToken})).data.order;assert.equal(tracked.status,'delivered');assert.equal(tracked.payment.method,'manual');assert.equal(tracked.privateNote,undefined);assert.equal(tracked.shipment.trackingCode,'1234567890');assert.ok(tracked.history.length>=7);
});

test('SMS disabled never pretends a code was sent, and credentials are never returned',{skip:!enabled},async t=>{
 const app=await setup(t),session=await app.request('/api/customer/v1/session'),browser=session.headers.get('set-cookie').split(';')[0];
 assert.equal(session.data.smsAvailable,false);
 assert.equal((await app.request('/api/customer/v1/otp/request',{phone:contact.phone},{Cookie:browser,'X-CSRF-Token':session.data.csrf})).status,503);assert.equal(app.sent.length,0);
 await app.admin('sms',{apiKey:'testonlykeyabcdefghijklmnopqrstuvwxyz',template:'hooyaLogin'});const config=(await app.admin('sms')).data;assert.equal(config.configured,true);assert.equal(config.apiKey,undefined);
});

test('OTP is single-use, browser-bound, expiring and grants only the verified phone orders',{skip:!enabled},async t=>{
 const app=await setup(t);app.config({apiKey:'test',template:'test'});await app.submit();const other=payload();other.billing.phone=other.shipping.phone='09120000001';await app.submit(other);
 const initial=await app.request('/api/customer/v1/session'),browser=initial.headers.get('set-cookie').split(';')[0],headers={Cookie:browser,'X-CSRF-Token':initial.data.csrf};
 assert.equal((await app.request('/api/customer/v1/otp/request',{phone:contact.phone})).status,403);
 const sent=await app.request('/api/customer/v1/otp/request',{phone:contact.phone},headers);assert.equal(sent.status,200);const code=app.sent[0].code;
 assert.equal(JSON.stringify(sent.data).includes(code),false);
 const second=await app.request('/api/customer/v1/session'),foreign={Cookie:second.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':second.data.csrf};
 assert.equal((await app.request('/api/customer/v1/otp/verify',{challenge:sent.data.challenge,code},foreign)).status,401);
 assert.equal((await app.request('/api/customer/v1/otp/verify',{challenge:sent.data.challenge,code:'000000'},headers)).status,401);
 const login=await app.request('/api/customer/v1/otp/verify',{challenge:sent.data.challenge,code},headers);assert.equal(login.status,200);
 const auth={Cookie:browser+'; '+login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};
 assert.equal((await app.request('/api/customer/v1/otp/verify',{challenge:sent.data.challenge,code},headers)).status,401);
 const list=await app.request('/api/customer/v1/orders',null,auth);assert.equal(list.status,200);assert.equal(list.data.orders.length,1);assert.equal(list.data.orders[0].billing.phone,contact.phone);
 assert.equal((await app.request('/api/customer/v1/logout',{},auth)).status,200);assert.equal((await app.request('/api/customer/v1/orders',null,auth)).status,401);
 app.advance(61000);const again=await app.request('/api/customer/v1/otp/request',{phone:contact.phone},headers);assert.equal(again.status,200);app.advance(121000);assert.equal((await app.request('/api/customer/v1/otp/verify',{challenge:again.data.challenge,code:app.sent.at(-1).code},headers)).status,401);
});

test('OTP failed attempts and resend limits remain enforced by durable storage',{skip:!enabled},async t=>{
 const app=await setup(t);app.config({apiKey:'test',template:'test'});const session=await app.request('/api/customer/v1/session'),headers={Cookie:session.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.data.csrf};
 const sent=await app.request('/api/customer/v1/otp/request',{phone:contact.phone},headers);assert.equal(sent.status,200);
 assert.equal((await app.request('/api/customer/v1/otp/request',{phone:contact.phone},headers)).status,429);
 for(let i=0;i<5;i++)assert.equal((await app.request('/api/customer/v1/otp/verify',{challenge:sent.data.challenge,code:'000000'},headers)).status,401);
 assert.equal((await app.request('/api/customer/v1/otp/verify',{challenge:sent.data.challenge,code:app.sent[0].code},headers)).status,401);
});
