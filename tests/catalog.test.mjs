import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../docs/catalog.js',import.meta.url),'utf8');
const adminSource=await readFile(new URL('../server/admin-ui/admin.js',import.meta.url),'utf8');
const seed=JSON.parse(await readFile(new URL('../docs/products.json',import.meta.url),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
function contract(scriptUrl){const context={window:{},TextEncoder,Intl,URL};if(scriptUrl)context.document={currentScript:{src:scriptUrl}};vm.runInNewContext(source,context);return context.window.Hooya;}
test('published catalog validates prices and availability',()=>{const H=contract();assert.equal(H.validate(seed),seed);});
test('same-origin catalog failure falls back to the catalog service and validates each response',async()=>{
 const urls=[],context={window:{},TextEncoder,Intl,URL,AbortSignal,fetch:async url=>{urls.push(url);return urls.length===1?{ok:true,json:async()=>({schema:99})}:{ok:true,json:async()=>clone(seed)};}};
 vm.runInNewContext(source,context);const catalog=await context.window.Hooya.loadCatalog();assert.equal(catalog.schema,1);assert.equal(catalog.products.length,seed.products.length);assert.deepEqual(urls,['products.json','https://api.hooyamode.ir/v1/catalog']);
});
test('latest products keep their launch order when old product metadata is edited',()=>{
  const H=contract(),products=clone(seed.products);
  products[0].updatedAt='2099-01-01T00:00:00Z';
  const latest=H.latest(products,3);
  assert.equal(latest.length,3);assert.equal(latest[0].id,'horse-tishter');
  assert.ok(!latest.some(p=>p.id===products[0].id));
  const invalid=clone(seed);invalid.products[0].createdAt='invalid';assert.throws(()=>H.validate(invalid));
});
test('products use the three approved collections and reject unknown collection names',()=>{
  const H=contract();assert.equal(Object.keys(H.collections).length,3);assert.ok(seed.products.every(p=>Object.hasOwn(H.collections,p.collection)));
  for(const value of ['hooya-world','constructor','unknown','',null,{},['persian-garden']]){const c=clone(seed);c.products[0].collection=value;assert.throws(()=>H.validate(c));}
  const legacy=clone(seed);delete legacy.products[0].collection;assert.equal(H.validate(legacy),legacy);
});
test('rejects unsafe images, unknown enums, duplicate IDs and fractional inventory',()=>{
  const H=contract();
  for(const mutate of [p=>p.image='javascript:alert(1)',p=>p.image='data:image/svg+xml;base64,abc',p=>p.kind='toString',p=>p.status='constructor',p=>p.stock=1.5,p=>p.sizes=[],p=>p.colors=['red;display:none']]){const c=clone(seed);mutate(c.products[0]);assert.throws(()=>H.validate(c));}
  const c=clone(seed);c.products.push(clone(c.products[0]));assert.throws(()=>H.validate(c));
});
test('escapes product content and image attributes',()=>{const H=contract();assert.equal(H.escape('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');assert.equal(H.safeImage('https://example.com/a.jpg" onerror="x'),false);});
test('gallery paths resolve below a project site, including the admin preview',()=>{
  const H=contract('https://example.github.io/hooya-mode/catalog.js');
  assert.equal(H.imageUrl('assets/products/swallow/view-1.webp'),'https://example.github.io/hooya-mode/assets/products/swallow/view-1.webp');
  for(const path of ['assets/products/../secret.webp','../assets/products/a/view-1.webp','/assets/products/a/view-1.webp','assets/products/a/view-1.svg','assets/products/a/view-1.webp?x="'])assert.equal(H.safeImage(path),false);
  const c=clone(seed);c.products[0].images[1]='javascript:alert(1)';assert.throws(()=>H.validate(c));
  c.products[0].images=Array(13).fill(c.products[0].image);assert.throws(()=>H.validate(c));
});
test('every published gallery image is packaged with the site',async()=>{
  for(const p of seed.products){assert.equal(p.images[0],p.image);for(const image of p.images){const bytes=await readFile(new URL('../docs/'+image,import.meta.url));assert.ok(bytes.length>0);}}
});

test('the private inline administrator bundle resolves product images at the storefront root',()=>{
 const context={window:{},document:{currentScript:{dataset:{assetBase:'/'},src:''},baseURI:'https://hooyamode.ir/admin/'},TextEncoder,Intl,URL};
 vm.runInNewContext(source,context);
 assert.equal(context.window.Hooya.imageUrl('assets/products/swallow/card.webp'),'https://hooyamode.ir/assets/products/swallow/card.webp');
});

// Exercise the real publishing controller against an in-memory DOM and GitHub transport.
async function setup(remote=clone(seed),putStatus=200,editId=null){
  const elements=new Map(),store=new Map(),calls=[],handlers=new Map();
  function element(key){if(!elements.has(key))elements.set(key,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,childNodes:[{textContent:''}],classList:{add(){},remove(){},toggle(){}},reset(){},addEventListener(){},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(key);}
  const formValues={name:'A new garment',sku:'QA-NEW',kind:'vest',type:'Linen',story:'myth',tag:'Story',description:'A garment',price:'1200000',stock:'4','stock-M':'4',madeToOrder:'on',productionDays:'12',dispatchDays:'2',colors:'#aabbcc',status:'draft'};
  element('#sample-photo').value='0';element('#kind-filter').value='all';element('#collection-filter').value='all';element('#collection').value='mythical-creatures';element('#sort').value='newest';
  const context={window:{addEventListener(){}},document:{querySelector:element,querySelectorAll:()=>[],addEventListener(event,handler){handlers.set(event,handler);}},AbortSignal,TextEncoder,TextDecoder,Intl,Date,URL,Blob,crypto:{randomUUID:()=> 'test-id'},setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},btoa:x=>Buffer.from(x,'binary').toString('base64'),atob:x=>Buffer.from(x,'base64').toString('binary'),FormData:class{get(k){if(k==='collection')return element('#collection').value;if(k.startsWith('fit-')&&editId)return seed.products.find(p=>p.id===editId).details?.sizeNotes[k.slice(4)]||'';return formValues[k]??elements.get('#'+k)?.value??'';}getAll(){return editId?seed.products.find(p=>p.id===editId).sizes:['M'];}},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},fetch:async(url,options={})=>{
    calls.push({url,options});if(url==='../products.json')return {ok:true,json:async()=>clone(seed)};
    if(options.method==='PUT')return{ok:putStatus===200,status:putStatus,json:async()=>({commit:{sha:'commit'}})};
    return{ok:true,json:async()=>({sha:'baseline-sha',encoding:'base64',content:Buffer.from(JSON.stringify(remote)).toString('base64')})};
  }};
  vm.createContext(context);vm.runInContext(source,context);vm.runInContext(adminSource,context);
  await new Promise(resolve=>setImmediate(resolve));
  if(editId)await handlers.get('click')({target:{closest:selector=>selector==='[data-edit]'?{dataset:{edit:editId}}:null}});
  element('#product-form').onsubmit({preventDefault(){}});
  return {element,store,calls,publish:async()=>{element('#github-token').value='fake-session-token';await element('#publish-form').onsubmit({preventDefault(){}});}};
}
test('publishes UTF-8 catalog with SHA guard and never persists the token',async()=>{
  const s=await setup();await s.publish();const put=s.calls.find(c=>c.options.method==='PUT');assert.ok(put);
  const body=JSON.parse(put.options.body);assert.equal(body.sha,'baseline-sha');assert.equal(body.branch,'main');
  const catalog=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));assert.equal(catalog.products.length,seed.products.length+1);assert.equal(catalog.products[1].name,seed.products[0].name);assert.equal(catalog.products[0].status,'draft');assert.deepEqual(catalog.products[1].images,seed.products[0].images);
  assert.deepEqual(catalog.products[0].sizeStock,{M:4});assert.equal(catalog.products[0].stock,4);assert.equal(catalog.products[0].madeToOrder,true);assert.equal(catalog.products[0].productionDays,12);assert.equal(catalog.products[0].dispatchDays,2);
  assert.ok(![...s.store.values()].join('').includes('fake-session-token'));assert.equal(s.element('#github-token').value,'');assert.equal(s.element('#publish-error').textContent,'');
});
test('concurrent catalog changes stop publication without a PUT',async()=>{
  const remote=clone(seed);remote.products[0].name='Changed by another editor';const s=await setup(remote);await s.publish();assert.ok(!s.calls.some(c=>c.options.method==='PUT'));assert.match(s.element('#publish-error').textContent,/تغییر کرده/);
});
test('editing product metadata preserves its three-image gallery through publication',async()=>{
  const p=seed.products[0],s=await setup(clone(seed),200,p.id);await s.publish();
  const body=JSON.parse(s.calls.find(c=>c.options.method==='PUT').options.body);
  const catalog=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
  const edited=catalog.products.find(x=>x.id===p.id);assert.deepEqual(edited.images,p.images);assert.equal(edited.image,p.image);assert.equal(edited.collection,p.collection);assert.equal(catalog.products.length,seed.products.length);
  assert.deepEqual(edited.narrative,p.narrative);assert.deepEqual(edited.details,p.details);assert.deepEqual(edited.sizes,p.sizes);
});
test('failed publication retains local changes and re-enables retry',async()=>{
  const s=await setup(clone(seed),403);await s.publish();assert.match(s.element('#publish-error').textContent,/دسترسی نوشتن/);const saved=JSON.parse([...s.store.values()][0]);assert.equal(saved.catalog.products.length,seed.products.length+1);assert.equal(saved.baseline.products.length,seed.products.length);assert.equal(s.element('#publish-submit').disabled,false);
});

test('size inventory and preparation times validate without inventing legacy stock',()=>{
  const H=contract(),c=clone(seed),p=c.products[0];
  p.sizes=['S','M','L'];p.details.sizeNotes={};
  p.sizeStock={S:0,M:2,L:null};p.stock=null;p.madeToOrder=true;p.productionDays=12;p.dispatchDays=2;
  assert.equal(H.validate(c),c);
  for(const mutate of [p=>p.sizeStock.M=-1,p=>p.sizeStock.M=1.5,p=>delete p.sizeStock.S,p=>p.sizeStock.XL=1,p=>p.stock=2,p=>p.productionDays=0,p=>p.dispatchDays=1.5,p=>p.madeToOrder='yes']){const bad=clone(c);mutate(bad.products[0]);assert.throws(()=>H.validate(bad));}
  p.sizeStock.L=1;p.stock=3;assert.equal(H.validate(c),c);
});
