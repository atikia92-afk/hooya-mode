import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../docs/catalog.js',import.meta.url),'utf8');
const adminSource=await readFile(new URL('../docs/admin/admin.js',import.meta.url),'utf8');
const seed=JSON.parse(await readFile(new URL('../docs/products.json',import.meta.url),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
function contract(){const context={window:{},TextEncoder,Intl};vm.runInNewContext(source,context);return context.window.Hooya;}
test('initial catalog validates without inventing prices or stock',()=>{const H=contract();assert.equal(H.validate(seed),seed);assert.ok(seed.products.every(p=>p.price===null&&p.stock===null));});
test('rejects unsafe images, unknown enums, duplicate IDs and fractional inventory',()=>{
  const H=contract();
  for(const mutate of [p=>p.image='javascript:alert(1)',p=>p.image='data:image/svg+xml;base64,abc',p=>p.kind='toString',p=>p.status='constructor',p=>p.stock=1.5,p=>p.sizes=[],p=>p.colors=['red;display:none']]){const c=clone(seed);mutate(c.products[0]);assert.throws(()=>H.validate(c));}
  const c=clone(seed);c.products.push(clone(c.products[0]));assert.throws(()=>H.validate(c));
});
test('escapes product content and image attributes',()=>{const H=contract();assert.equal(H.escape('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');assert.equal(H.safeImage('https://example.com/a.jpg" onerror="x'),false);});

// Exercise the real publishing controller against an in-memory DOM and GitHub transport.
async function setup(remote=clone(seed),putStatus=200){
  const elements=new Map(),store=new Map(),calls=[];
  function element(key){if(!elements.has(key))elements.set(key,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,childNodes:[{textContent:''}],classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(key);}
  const formValues={name:'A new garment',sku:'QA-NEW',kind:'vest',type:'Linen',story:'myth',tag:'Story',description:'A garment',price:'1200000',stock:'4',colors:'#aabbcc',status:'draft'};
  element('#sample-photo').value='0';element('#kind-filter').value='all';element('#sort').value='newest';
  const context={window:{addEventListener(){}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},TextEncoder,TextDecoder,Intl,Date,URL,Blob,crypto:{randomUUID:()=> 'test-id'},setTimeout:()=>0,clearTimeout(){},btoa:x=>Buffer.from(x,'binary').toString('base64'),atob:x=>Buffer.from(x,'base64').toString('binary'),FormData:class{get(k){return formValues[k]??'';}getAll(){return ['M'];}},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},fetch:async(url,options={})=>{
    calls.push({url,options});if(url==='../products.json')return {ok:true,json:async()=>clone(seed)};
    if(options.method==='PUT')return{ok:putStatus===200,status:putStatus,json:async()=>({commit:{sha:'commit'}})};
    return{ok:true,json:async()=>({sha:'baseline-sha',encoding:'base64',content:Buffer.from(JSON.stringify(remote)).toString('base64')})};
  }};
  vm.createContext(context);vm.runInContext(source,context);vm.runInContext(adminSource,context);
  await new Promise(resolve=>setImmediate(resolve));
  element('#product-form').onsubmit({preventDefault(){}});
  return {element,store,calls,publish:async()=>{element('#github-token').value='fake-session-token';await element('#publish-form').onsubmit({preventDefault(){}});}};
}
test('publishes UTF-8 catalog with SHA guard and never persists the token',async()=>{
  const s=await setup();await s.publish();const put=s.calls.find(c=>c.options.method==='PUT');assert.ok(put);
  const body=JSON.parse(put.options.body);assert.equal(body.sha,'baseline-sha');assert.equal(body.branch,'main');
  const catalog=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));assert.equal(catalog.products.length,4);assert.equal(catalog.products[1].name,seed.products[0].name);assert.equal(catalog.products[0].status,'draft');
  assert.ok(![...s.store.values()].join('').includes('fake-session-token'));assert.equal(s.element('#github-token').value,'');assert.equal(s.element('#publish-error').textContent,'');
});
test('concurrent catalog changes stop publication without a PUT',async()=>{
  const remote=clone(seed);remote.products[0].name='Changed by another editor';const s=await setup(remote);await s.publish();assert.ok(!s.calls.some(c=>c.options.method==='PUT'));assert.match(s.element('#publish-error').textContent,/تغییر کرده/);
});
test('failed publication retains local changes and re-enables retry',async()=>{
  const s=await setup(clone(seed),403);await s.publish();assert.match(s.element('#publish-error').textContent,/دسترسی نوشتن/);const saved=JSON.parse([...s.store.values()][0]);assert.equal(saved.catalog.products.length,4);assert.equal(saved.baseline.products.length,3);assert.equal(s.element('#publish-submit').disabled,false);
});
