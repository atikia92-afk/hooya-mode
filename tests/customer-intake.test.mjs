import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHandler} from '../worker/customer-worker.mjs';

const contact={firstName:'مشتری',lastName:'آزمایشی',country:'IR',phone:'۰۹۱۲۳۴۵۶۷۸۹',province:'تهران',city:'تهران',address:'آدرس آزمایشی، خیابان نمونه، پلاک ۱',unit:'واحد ۲',postcode:'۱۲۳۴۵۶۷۸۹۰'};
const payload=()=>({billing:{...contact},shipping:{...contact},differentShipping:false,notes:'نمونه آزمایشی',shippingConsent:true,website:'',items:[{id:'vest',size:'Free',mode:'ready',qty:1}]});
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 const db={exec:async sql=>{sqlite.exec(sql);return {count:1};},prepare(sql){let args=[];const statement=sqlite.prepare(sql);return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async run(){return statement.run(...args);}};}};
 const product={id:'vest',name:'وست نمونه',sizes:['Free'],status:'published',stock:1,sizeStock:{Free:1},price:12000000,madeToOrder:false};
 const handler=createHandler({fetchCatalog:async()=>Response.json({schema:1,products:[product]})});
 const env={DB:db};
 const send=(data=payload(),key=crypto.randomUUID(),extra={})=>handler.fetch(new Request('https://intake.example/v1/customer-details',{method:'POST',headers:{Origin:'https://hooyamode.ir','Content-Type':'application/json','Idempotency-Key':key,'CF-Connecting-IP':'192.0.2.1',...extra},body:JSON.stringify(data)}),env);
 return {sqlite,handler,env,send,product};
}
test('saves private contact details and server-priced items, not a paid order',async()=>{
 const f=fixture(),p=payload();p.items[0].price=1;
 const response=await f.send(p),receipt=await response.json();assert.equal(response.status,201);assert.equal(receipt.status,'received');
 const row=f.sqlite.prepare('SELECT * FROM customer_details').get();assert.equal(row.phone,'09123456789');assert.equal(row.postcode,'1234567890');assert.equal(row.subtotal_toman,12000000);assert.equal(row.status,'received');assert.equal(JSON.parse(row.shipping_json).address,contact.address);
 assert.deepEqual(Object.keys(receipt).sort(),['reference','status']);assert.equal(response.headers.get('Cache-Control'),'no-store');f.sqlite.close();
});
test('network retries create one record and reuse its confirmation',async()=>{
 const f=fixture(),key=crypto.randomUUID(),p=payload();
 const [first,second]=await Promise.all([f.send(p,key),f.send(p,key)]);
 assert.equal((await first.json()).reference,(await second.json()).reference);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM customer_details').get().n,1);
 p.notes='تغییر مشخصات';assert.equal((await f.send(p,key)).status,409);f.sqlite.close();
});
test('billing and alternate delivery addresses stay separate',async()=>{
 const f=fixture(),p=payload();p.differentShipping=true;p.shipping.firstName='گیرنده';p.shipping.city='کرج';p.shipping.province='البرز';
 assert.equal((await f.send(p)).status,201);const row=f.sqlite.prepare('SELECT * FROM customer_details').get();assert.equal(row.city,'تهران');assert.equal(JSON.parse(row.shipping_json).city,'کرج');f.sqlite.close();
});
test('rejects invalid contact, shipping consent, unavailable stock and stale selection',async()=>{
 const f=fixture(),p=payload();p.billing.phone='123';assert.equal((await f.send(p)).status,422);p.billing.phone=contact.phone;p.shippingConsent=false;assert.equal((await f.send(p)).status,422);p.shippingConsent=true;p.items[0].qty=2;assert.equal((await f.send(p)).status,409);p.items[0].qty=1;p.items[0].mode='order';assert.equal((await f.send(p)).status,409);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM customer_details').get().n,0);f.sqlite.close();
});
test('has no public customer lookup and rejects foreign origins and oversized requests',async()=>{
 const f=fixture();assert.equal((await f.send(payload(),crypto.randomUUID(),{Origin:'https://attacker.example'})).status,403);
 assert.equal((await f.handler.fetch(new Request('https://intake.example/v1/customer-details'),f.env)).status,405);
 assert.equal((await f.handler.fetch(new Request('https://intake.example/customers'),f.env)).status,404);
 const huge=payload();huge.notes='x'.repeat(25000);assert.equal((await f.send(huge)).status,400);f.sqlite.close();
});
test('limits repeated new submissions and fails honestly if storage is unavailable',async()=>{
 const f=fixture();for(let i=0;i<10;i++)assert.equal((await f.send()).status,201);assert.equal((await f.send()).status,429);
 const health=await f.handler.fetch(new Request('https://intake.example/health'),{});assert.equal(health.status,503);assert.equal((await health.json()).available,false);f.sqlite.close();
});
