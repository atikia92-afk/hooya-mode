import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID,webcrypto} from 'node:crypto';
const seed=JSON.parse(await readFile(new URL('../docs/products.json',import.meta.url),'utf8'));
async function setup({health=true,postStatus=201}={}){
 const nodes=new Map(),requests=[],session=new Map(),reference=randomUUID();let serviceAvailable=health;
 const element=key=>{if(!nodes.has(key))nodes.set(key,{value:'',dataset:{},textContent:'',innerHTML:'',hidden:false,disabled:false,checked:false,append(){},setAttribute(){},removeAttribute(){},focus(){this.focused=true;},reset(){this.didReset=true;},querySelector:()=>({textContent:''}),classList:{add(){},remove(){},toggle(){}}});return nodes.get(key);};
 element('#catalog-snapshot').textContent=JSON.stringify(seed);element('#billing-success').hidden=true;
 const stored=new Map([['hooya-demo-bag',JSON.stringify([{id:'horse-tishter',size:'Free',mode:'pending',qty:1}])]]);
 const context={window:{addEventListener(){},HooyaCheckoutConfig:{endpoints:['/api/customer']}},document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>({})},localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},sessionStorage:{getItem:key=>session.get(key)||null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)},TextEncoder,Intl,URL,URLSearchParams,AbortSignal,crypto:{randomUUID,subtle:webcrypto.subtle},setTimeout:()=>0,clearTimeout(){},fetch:async(url,options={})=>{
  requests.push({url,options});let data={},status=200;
  if(url.endsWith('/health')){status=serviceAvailable?200:503;data={available:serviceAvailable};}
  else if(url.endsWith('/v1/shipping'))data={postageToman:80000,version:1};
  else if(url.endsWith('/v1/session'))data={csrf:'browser-session-proof'};
  else if(url.endsWith('/v1/customer-details')){status=postStatus;data=postStatus===201?{status:'received',reference,trackingToken:'A'.repeat(43)}:{message:'سرویس موقتا در دسترس نیست.'};}
  else status=401;
  return{ok:status<400,status,json:async()=>data};
 }};
 for(const name of ['catalog.js','cart.js','customer-data.js'])vm.runInNewContext(await readFile(new URL('../docs/'+name,import.meta.url),'utf8'),context);
 context.window.Hooya.loadCatalog=async()=>seed;
 await vm.runInNewContext(await readFile(new URL('../docs/checkout.js',import.meta.url),'utf8'),context);
 const values={firstName:'آزمون',lastName:'سامانه',country:'IR',province:'تهران',city:'تهران',address:'نشانی آزمایشی سامانه پلاک صفر',unit:'',postcode:'1111111111',phone:'09120000000'};
 for(const [key,value] of Object.entries(values))element('#billing-'+key).value=value;
 element('#shipping-consent').checked=true;
 return {element,requests,reference,stored,submit:()=>element('#billing-form').onsubmit({preventDefault(){}}),connect:()=>{serviceAvailable=true;return element('#retry-checkout').onclick();}};
}
test('checkout sends the browser proof and confirms only a durable server receipt',async()=>{
 const app=await setup();assert.equal(app.element('#save-customer').disabled,false);await app.submit();
 const request=app.requests.find(r=>r.url.endsWith('/v1/customer-details'));
 assert.ok(request);assert.equal(request.options.headers['X-CSRF-Token'],'browser-session-proof');assert.equal(request.options.credentials,'same-origin');
 assert.equal(app.element('#customer-reference').textContent,app.reference);assert.equal(app.element('#billing-success').hidden,false);assert.equal(app.element('#billing-form').didReset,true);assert.equal(app.stored.get('hooya-demo-bag'),'[]');
});
test('a failed server submission keeps the form and cart and retries the same idempotency key',async()=>{
 const app=await setup({postStatus:503});await app.submit();await app.submit();
 const posts=app.requests.filter(r=>r.url.endsWith('/v1/customer-details'));assert.equal(posts.length,2);assert.equal(posts[0].options.headers['Idempotency-Key'],posts[1].options.headers['Idempotency-Key']);
 assert.equal(app.element('#billing-firstName').value,'آزمون');assert.equal(app.element('#billing-form').didReset,undefined);assert.equal(app.element('#billing-success').hidden,true);assert.notEqual(app.stored.get('hooya-demo-bag'),'[]');
});
test('a temporarily unavailable service can reconnect without reloading or losing the form',async()=>{
 const app=await setup({health:false});assert.equal(app.element('#save-customer').disabled,true);await app.connect();assert.equal(app.element('#billing-firstName').value,'آزمون');assert.equal(app.element('#save-customer').disabled,false);await app.submit();assert.equal(app.element('#billing-success').hidden,false);
});


test('checkout displays postage in total and courier separately; changing recipient disables courier',async()=>{
 const app=await setup();app.element('#billing-form').oninput();
 assert.match(app.element('#bill-shipping-cost').textContent,/۸۰٬۰۰۰/);
 assert.match(app.element('#bill-total').textContent,/۱۷٬۸۸۰٬۰۰۰/);
 app.element('#delivery-method').value='courier';app.element('#delivery-method').onchange();
 assert.match(app.element('#bill-shipping-cost').textContent,/پرداخت مستقیم/);
 assert.match(app.element('#bill-total').textContent,/۱۷٬۸۰۰٬۰۰۰/);
 app.element('#billing-city').value='کرج';app.element('#billing-form').oninput();
 assert.equal(app.element('#courier-option').disabled,true);assert.equal(app.element('#delivery-method').value,'post');
 assert.match(app.element('#error-delivery-method').textContent,/تغییر کرد/);
});
