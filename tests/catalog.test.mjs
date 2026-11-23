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
  const before=Array.from(H.latest(products,3),p=>p.id);
  products[0].updatedAt='2099-01-01T00:00:00Z';
  const latest=H.latest(products,3);
  assert.equal(latest.length,3);assert.deepEqual(Array.from(latest,p=>p.id),before);
  assert.ok(!latest.some(p=>p.id===products[0].id));
  const invalid=clone(seed);invalid.products[0].createdAt='invalid';assert.throws(()=>H.validate(invalid));
});
test('all product lists use creation dates, newest first, without changing the catalog',()=>{
 const H=contract(),products=[
  {id:'old',sku:'HYA-001',createdAt:'2026-11-01T00:00:00Z',updatedAt:'2099-01-01T00:00:00Z'},
  {id:'new',sku:'HYA-004',createdAt:'2026-11-22T00:00:00Z'},
  {id:'tie-first',sku:'HYA-002',createdAt:'2026-11-19T00:00:00Z'},
  {id:'legacy',sku:'HYA-005',updatedAt:'2026-11-20T00:00:00Z'},
  {id:'tie-last',sku:'HYA-003',createdAt:'2026-11-19T00:00:00Z'}
 ];
 assert.deepEqual(Array.from(H.newest(products),p=>p.id),['new','legacy','tie-last','tie-first','old']);
 assert.deepEqual(Array.from(H.latest(products),p=>p.id),['new','legacy','tie-last','tie-first']);
 assert.deepEqual(products.map(p=>p.id),['old','new','tie-first','legacy','tie-last']);
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
test('every published gallery image is packaged or embedded with the site',async()=>{
  for(const p of seed.products){assert.equal(p.images[0],p.image);for(const image of p.images){const bytes=image.startsWith('data:')?Buffer.from(image.split(',')[1],'base64'):await readFile(new URL('../docs/'+image,import.meta.url));assert.ok(bytes.length>0);}}
});

test('the private inline administrator bundle resolves product images at the storefront root',()=>{
 const context={window:{},document:{currentScript:{dataset:{assetBase:'/'},src:''},baseURI:'https://hooyamode.ir/admin/'},TextEncoder,Intl,URL};
 vm.runInNewContext(source,context);
 assert.equal(context.window.Hooya.imageUrl('assets/products/swallow/card.webp'),'https://hooyamode.ir/assets/products/swallow/card.webp');
});

// Exercise the real publishing controller against the signed-in server transport.
async function setup(remote=clone(seed),putStatus=200,editId=null,options={}){
  const elements=new Map(),store=new Map(options.saved?[['hooya-catalog-workspace-v1',JSON.stringify(options.saved)]]:[]),calls=[],handlers=new Map(),timers=[];
  let encodedImages=0,committedCatalog;
  function element(key){if(!elements.has(key))elements.set(key,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,listeners:new Map(),childNodes:[{textContent:''}],classList:{add(){},remove(){},toggle(){}},reset(){},addEventListener(event,handler){this.listeners.set(event,handler);},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(key);}
  const formValues={name:'A new garment',sku:'QA-NEW',kind:'vest',type:'Linen',story:'myth',tag:'Story',description:'A garment',price:'1200000',stock:'4','stock-M':'4',madeToOrder:'on',productionDays:'12',dispatchDays:'2',colors:'#aabbcc',status:'draft',...options.formValues};
  element('#sample-photo').value='0';element('#kind-filter').value='all';element('#collection-filter').value='all';element('#collection').value='mythical-creatures';element('#sort').value='newest';
  element('#admin-csrf').value='test-session-proof';
  const context={window:{addEventListener(){}},document:{querySelector:element,querySelectorAll:()=>[],createElement(tag){assert.equal(tag,'canvas');return {getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/webp;base64,'+Buffer.from('encoded-image-'+ ++encodedImages).toString('base64')};},addEventListener(event,handler){handlers.set(event,handler);}},Image:class{width=100;height=100;async decode(){}},AbortSignal,TextEncoder,TextDecoder,Intl,Date,URL,Blob,crypto:{randomUUID:()=> 'test-id'},setTimeout:()=>0,setInterval:(handler,ms)=>{timers.push({handler,ms});return 0;},clearTimeout(){},btoa:x=>Buffer.from(x,'binary').toString('base64'),atob:x=>Buffer.from(x,'base64').toString('binary'),FormData:class{get(k){if(k==='collection')return element('#collection').value;if(k.startsWith('fit-')&&editId)return seed.products.find(p=>p.id===editId).details?.sizeNotes[k.slice(4)]||'';return formValues[k]??elements.get('#'+k)?.value??'';}getAll(){if(options.sizes)return options.sizes;return editId?seed.products.find(p=>p.id===editId).sizes:['M'];}},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},fetch:async(url,options={})=>{
    calls.push({url,options});if(setupOptions.transport){const custom=await setupOptions.transport(url,options);if(custom)return custom;}if(url==='../products.json'||url.startsWith('../products.json?v='))return {ok:true,json:async()=>clone(committedCatalog||seed)};
    if(url==='/admin/api/catalog'&&options.method!=='POST')return {ok:true,json:async()=>({catalog:clone(setupOptions.server||seed),liveCatalog:clone(seed)})};
    if(url==='/admin/api/catalog'&&options.method==='POST'){
      if(setupOptions.nonJson)return {ok:false,status:putStatus,json:async()=>{throw new SyntaxError('JSON.parse: unexpected character at line 1 column 1');}};
      if(putStatus>=400)return {ok:false,status:putStatus,json:async()=>({error:putStatus===401?'نشست مدیریت منقضی شده است. دوباره وارد شوید.':'ذخیره روی سرور انجام نشد.'})};
      const body=JSON.parse(options.body);if(body.baseVersion!==(setupOptions.server||remote).version)return {ok:false,status:409,json:async()=>({error:'محصولات در سیستم دیگری تغییر کرده‌اند.'})};
      const accepted={...body.catalog,version:new Date(Date.parse(remote.version)+1).toISOString()};if(setupOptions.confirmWebsite)committedCatalog=clone(accepted);
      return {ok:true,status:202,json:async()=>({catalog:accepted,liveCatalog:clone(seed),status:'pending'})};
    }
    throw Error('Unexpected request '+url);
  }};
  const setupOptions=options;
  vm.createContext(context);vm.runInContext(source,context);vm.runInContext(adminSource,context);
  await new Promise(resolve=>setImmediate(resolve));
  if(editId)await handlers.get('click')({target:{closest:selector=>selector==='[data-edit]'?{dataset:{edit:editId}}:null}});
  const save=()=>element('#product-form').onsubmit({preventDefault(){}});
  if(options.submit!==false)save();
  const galleryClick=(selector,dataset)=>element('#gallery-preview').listeners.get('click')({target:{closest:s=>s===selector?{dataset}:null}});
  return {element,store,calls,formValues,save,timers,refresh:()=>element('#refresh-catalog').onclick(),edit:async id=>handlers.get('click')({target:{closest:s=>s==='[data-edit]'?{dataset:{edit:id}}:null}}),resolve:async(id,choice)=>handlers.get('click')({target:{closest:s=>s==='[data-resolve]'?{dataset:{conflict:id,resolve:choice}}:null}}),upload:async files=>{element('#image-file').files=files;await element('#image-file').onchange();},cover:index=>galleryClick('[data-gallery-cover]',{galleryCover:index}),remove:index=>galleryClick('[data-gallery-remove]',{galleryRemove:index}),publish:async()=>{await element('#publish-form').onsubmit({preventDefault(){}});}};
}

test('automatic product codes advance beyond every saved or archived code',()=>{
 const H=contract();assert.equal(H.nextSku([]),'HYA-001');assert.equal(H.nextSku(seed.products),'HYA-009');
 assert.equal(H.nextSku([{sku:'HYA-999',status:'archived'},{sku:'hya-1001'},{sku:'custom'},{sku:''}]),'HYA-1002');
});
test('saving a new product replaces a repeated or empty manual code; editing preserves its identity',async()=>{
 const s=await setup(clone(seed),200,null,{submit:false});s.formValues.sku='HYA-005';s.save();
 assert.equal(JSON.parse([...s.store.values()][0]).catalog.products[0].sku,'HYA-009');
 const original=seed.products[0],edited=await setup(clone(seed),200,original.id);
 assert.equal(JSON.parse([...edited.store.values()][0]).catalog.products.find(p=>p.id===original.id).sku,original.sku);
});
test('multiple uploaded photographs append, can become the cover and can be removed individually',async()=>{
 const original=seed.products[0],s=await setup(clone(seed),200,original.id,{submit:false});
 await s.upload([new File(['first'],'first.png',{type:'image/png'}),new File(['second'],'second.jpg',{type:'image/jpeg'})]);
 assert.equal(s.element('#form-error').textContent,'');s.cover(4);s.remove(2);s.save();
 const p=JSON.parse([...s.store.values()][0]).catalog.products.find(p=>p.id===original.id);
 assert.equal(p.images.length,4);assert.equal(p.image,p.images[0]);assert.match(p.image,/^data:image\/webp/);assert.equal(p.images[1],original.images[0]);assert.equal(p.thumbnail,undefined);
 assert.equal(s.element('#save-product').disabled,false);assert.equal(s.element('#image-file').value,'');
});
test('a failed image batch preserves the previous gallery and restores the save button',async()=>{
 const p=seed.products[0],s=await setup(clone(seed),200,p.id,{submit:false});
 await s.upload([new File(['first'],'first.png',{type:'image/png'}),new File(['invalid'],'invalid.txt',{type:'text/plain'})]);
 assert.match(s.element('#form-error').textContent,/invalid.txt/);assert.equal(s.element('#save-product').disabled,false);assert.equal(s.element('#image-file').disabled,false);
 s.save();const saved=JSON.parse([...s.store.values()][0]).catalog.products.find(x=>x.id===p.id);assert.deepEqual(saved.images,p.images);
});
test('an empty required name fails visibly without discarding the form',async()=>{
 const s=await setup(clone(seed),200,null,{submit:false});s.formValues.name='';s.save();assert.match(s.element('#form-error').textContent,/نام/);assert.deepEqual(JSON.parse([...s.store.values()][0]).catalog,seed);
});

test('selecting published opens the actual publishing step and keeps the live count unchanged',async()=>{
 const s=await setup(clone(seed),200,null,{submit:false});s.formValues.status='published';s.save();
 assert.equal(s.element('#publish-dialog').open,true);assert.match(s.element('#products-region').innerHTML,/آماده انتشار/);
 assert.equal(s.element('#stat-published').textContent,contract().number(seed.products.length));
 assert.ok(!s.calls.some(c=>c.options.method==='POST'));
});
test('a server acknowledgement alone does not claim a product is live',async()=>{
 const s=await setup(clone(seed),200,null,{submit:false});s.formValues.status='published';s.save();await s.publish();await new Promise(resolve=>setImmediate(resolve));
 assert.match(s.element('#products-region').innerHTML,/در حال انتشار/);assert.match(s.element('#sync-title').textContent,/در انتظار/);
 assert.equal(s.element('#stat-published').textContent,contract().number(seed.products.length));
});
test('published status is confirmed only after the website returns the expected catalog version',async()=>{
 const s=await setup(clone(seed),200,null,{submit:false,confirmWebsite:true});s.formValues.status='published';s.save();await s.publish();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.element('#sync-title').textContent,'انتشار در سایت تایید شد');assert.ok(!s.element('#products-region').innerHTML.includes('در حال انتشار'));
 assert.equal(s.element('#stat-published').textContent,contract().number(seed.products.length+1));
});
test('a matching external publication clears the local pending state without depending on product order',async()=>{
 const local=clone(seed),old=clone(seed);local.products.reverse();old.products=old.products.filter(p=>p.sku!=='HYA-008');old.version='2026-11-20T00:00:00.000Z';
 const s=await setup(clone(seed),200,null,{submit:false,saved:{catalog:local,baseline:old}});
 assert.equal(s.element('#open-publish').disabled,true);const saved=JSON.parse([...s.store.values()][0]);assert.deepEqual(saved.catalog,seed);assert.deepEqual(saved.baseline,seed);
});
test('a website refresh never drops genuine unpublished local edits',async()=>{
 const local=clone(seed);local.products[0].price=12500000;
 const s=await setup(clone(seed),200,null,{submit:false,saved:{catalog:local,baseline:clone(seed)}});
 assert.equal(s.element('#open-publish').disabled,false);assert.match(s.element('#products-region').innerHTML,/تغییرات ارسال نشده/);
 assert.equal(JSON.parse([...s.store.values()][0]).catalog.products[0].price,12500000);
});
test('publishes directly with the manager session and revision guard, without a GitHub credential',async()=>{
  const s=await setup();await s.publish();const put=s.calls.find(c=>c.options.method==='POST');assert.ok(put);
  const body=JSON.parse(put.options.body);assert.equal(body.baseVersion,seed.version);assert.equal(put.url,'/admin/api/catalog');assert.equal(put.options.credentials,'same-origin');assert.equal(put.options.headers['X-CSRF-Token'],'test-session-proof');
  const catalog=body.catalog;assert.equal(catalog.products.length,seed.products.length+1);assert.equal(catalog.products[1].name,seed.products[0].name);assert.equal(catalog.products[0].status,'draft');assert.deepEqual(catalog.products[1].images,seed.products[0].images);
  assert.deepEqual(catalog.products[0].sizeStock,{M:4});assert.equal(catalog.products[0].stock,4);assert.equal(catalog.products[0].madeToOrder,true);assert.equal(catalog.products[0].productionDays,12);assert.equal(catalog.products[0].dispatchDays,2);
  assert.ok(![...s.store.values()].join('').includes('test-session-proof'));assert.ok(s.calls.every(c=>!c.url.includes('github')));assert.equal(s.element('#publish-error').textContent,'');
});
test('concurrent catalog changes stop publication without a PUT',async()=>{
  const remote=clone(seed);remote.products[0].name='Changed by another editor';remote.version='2099-01-01T00:00:00.000Z';const s=await setup(remote);await s.publish();assert.match(s.element('#publish-error').textContent,/تغییر کرده/);
});
test('editing product metadata preserves its three-image gallery through publication',async()=>{
  const p=seed.products[0],s=await setup(clone(seed),200,p.id);await s.publish();
  const body=JSON.parse(s.calls.find(c=>c.options.method==='POST').options.body);
  const catalog=body.catalog;
  const edited=catalog.products.find(x=>x.id===p.id);assert.deepEqual(edited.images,p.images);assert.equal(edited.image,p.image);assert.equal(edited.collection,p.collection);assert.equal(catalog.products.length,seed.products.length);
  assert.deepEqual(edited.narrative,p.narrative);assert.deepEqual(edited.details,p.details);assert.deepEqual(edited.sizes,p.sizes);
});
test('failed publication retains local changes and re-enables retry',async()=>{
  const s=await setup(clone(seed),503);await s.publish();assert.match(s.element('#publish-error').textContent,/ذخیره روی سرور/);const saved=JSON.parse([...s.store.values()][0]);assert.equal(saved.catalog.products.length,seed.products.length+1);assert.equal(saved.baseline.products.length,seed.products.length);assert.equal(s.element('#publish-submit').disabled,false);
});
test('an expired manager session offers sign-in without losing local product data',async()=>{
 const s=await setup(clone(seed),401);await s.publish();assert.equal(s.element('#publish-login').hidden,false);assert.match(s.element('#publish-error').textContent,/نشست/);assert.equal(JSON.parse([...s.store.values()][0]).catalog.products.length,seed.products.length+1);
});
test('HTML proxy errors produce useful messages and preserve the pending price and subtitle',async()=>{
 for(const status of [413,502,503,504,200]){
  const s=await setup(clone(seed),status,null,{submit:false,nonJson:true});s.formValues.price='19900000';s.formValues.type='زیرعنوان آزمایشی';s.save();await s.publish();
  assert.ok(!s.element('#publish-error').textContent.includes('JSON.parse'));assert.match(s.element('#publish-error').textContent,/محفوظ/);
  const pending=JSON.parse([...s.store.values()][0]);assert.equal(pending.catalog.products[0].price,19900000);assert.equal(pending.catalog.products[0].type,'زیرعنوان آزمایشی');assert.deepEqual(pending.baseline,seed);assert.equal(s.element('#publish-submit').disabled,false);
 }
});
test('a different device reads the accepted catalog from the server before deployment completes',async()=>{
 const server=clone(seed);server.version='2099-01-01T00:00:00.000Z';server.products[0].name='به‌روز شده روی سیستم دیگر';
 const s=await setup(clone(seed),200,null,{submit:false,server});assert.match(s.element('#products-region').innerHTML,/به‌روز شده روی سیستم دیگر/);assert.equal(s.element('#open-publish').disabled,true);assert.match(s.element('#sync-title').textContent,/در انتظار/);
});

test('single-size inventory saves the editable quantity, including zero and an unknown quantity',async()=>{
 for(const [value,expected] of [['7',7],['0',0],['',null]]){
  const s=await setup(clone(seed),200,null,{formValues:{stock:value,'stock-M':'99'}});
  const p=JSON.parse([...s.store.values()][0]).catalog.products[0];
  assert.equal(p.stock,expected);assert.deepEqual(p.sizeStock,{M:expected});
 }
 for(const value of ['-1','1.5']){
  const s=await setup(clone(seed),200,null,{formValues:{stock:value}});
  assert.deepEqual(JSON.parse([...s.store.values()][0]).catalog,seed);assert.ok(s.element('#form-error').textContent);
 }
});

test('multiple-size inventory saves each size and calculates a total only when every quantity is known',async()=>{
 for(const [large,expected] of [['2',7],['0',5],['',null]]){
  const s=await setup(clone(seed),200,null,{sizes:['M','L'],formValues:{stock:'99','stock-M':'5','stock-L':large}});
  const p=JSON.parse([...s.store.values()][0]).catalog.products[0];
  assert.equal(p.stock,expected);assert.deepEqual(p.sizeStock,{M:5,L:large===''?null:Number(large)});
 }
});

test('size inventory and preparation times validate without inventing legacy stock',()=>{
  const H=contract(),c=clone(seed),p=c.products[0];
  p.sizes=['S','M','L'];p.details.sizeNotes={};
  p.sizeStock={S:0,M:2,L:null};p.stock=null;p.madeToOrder=true;p.productionDays=12;p.dispatchDays=2;
  assert.equal(H.validate(c),c);
  for(const mutate of [p=>p.sizeStock.M=-1,p=>p.sizeStock.M=1.5,p=>delete p.sizeStock.S,p=>p.sizeStock.XL=1,p=>p.stock=2,p=>p.productionDays=0,p=>p.dispatchDays=1.5,p=>p.madeToOrder='yes']){const bad=clone(c);mutate(bad.products[0]);assert.throws(()=>H.validate(bad));}
  p.sizeStock.L=1;p.stock=3;assert.equal(H.validate(c),c);
});

const workspace=s=>JSON.parse(s.store.get('hooya-catalog-workspace-v1'));
test('stale local edits rebase onto shared products, including remote additions and deletions',async()=>{
 const local=clone(seed),server=clone(seed);local.products[0].price=12500000;
 server.version='2099-01-01T00:00:00.000Z';server.products[1].type='زیرعنوان تازه از سیستم دیگر';
 const removed=server.products.pop().id,newProduct={...clone(server.products[2]),id:'remote-new',sku:'HYA-010',name:'محصول تازه روی سرور',status:'draft'};server.products.push(newProduct);
 const s=await setup(clone(seed),200,null,{submit:false,server,saved:{catalog:local,baseline:clone(seed)}}),w=workspace(s);
 assert.equal(w.catalog.products.find(p=>p.id===seed.products[0].id).price,12500000);
 assert.equal(w.catalog.products.find(p=>p.id===seed.products[1].id).type,server.products[1].type);
 assert.ok(w.catalog.products.some(p=>p.id===newProduct.id));assert.ok(!w.catalog.products.some(p=>p.id===removed));
 assert.deepEqual(w.baseline,server);assert.equal(w.conflicts.length,0);assert.match(s.element('#products-region').innerHTML,/محصول تازه روی سرور/);assert.equal(s.element('#open-publish').disabled,false);
});

test('a simultaneous edit shows the current server product and preserves both copies across reloads until resolved',async()=>{
 for(const choice of ['server','local']){
  const local=clone(seed),server=clone(seed),id=seed.products[0].id;local.products[0].price=12500000;server.products[0].price=13500000;server.version='2099-01-01T00:00:00.000Z';
  const s=await setup(clone(seed),200,null,{submit:false,server,saved:{catalog:local,baseline:clone(seed)}}),w=workspace(s);
  assert.equal(w.catalog.products[0].price,13500000);assert.equal(w.conflicts[0].local.price,12500000);assert.equal(w.conflicts[0].remote.price,13500000);
  assert.equal(s.element('#sync-conflicts').hidden,false);assert.equal(s.element('#open-publish').disabled,true);assert.match(s.element('#conflict-list').innerHTML,/قیمت/);
  await s.edit(id);assert.equal(s.element('#editor').open,false);assert.match(s.element('#toast').textContent,/ابتدا نسخه/);
  const reopened=await setup(clone(seed),200,null,{submit:false,server,saved:w});assert.equal(workspace(reopened).conflicts.length,1);
  await reopened.resolve(id,choice);const resolved=workspace(reopened);assert.equal(resolved.conflicts.length,0);assert.equal(resolved.catalog.products.find(p=>p.id===id).price,choice==='local'?12500000:13500000);assert.equal(reopened.element('#open-publish').disabled,choice==='server');
 }
});

test('polling updates a clean second device and preserves an editor already open when the server changes',async()=>{
 const options={submit:false,server:clone(seed)},s=await setup(clone(seed),200,null,options),id=seed.products[0].id;
 await s.edit(id);options.server.products[0].name='نام تازه از سیستم اول';options.server.version='2099-01-01T00:00:00.000Z';
 assert.equal(s.timers[0].ms,5000);await s.timers[0].handler();
 assert.match(s.element('#products-region').innerHTML,/نام تازه از سیستم اول/);assert.match(s.element('#sync-status').textContent,/آخرین دریافت/);
 s.save();const w=workspace(s);assert.equal(w.catalog.products.find(p=>p.id===id).name,'نام تازه از سیستم اول');assert.equal(w.conflicts[0].local.name,'A new garment');assert.equal(s.element('#editor').open,false);
});

test('remote deletion against a local edit remains reviewable, while matching changes need no review',async()=>{
 const local=clone(seed),server=clone(seed),id=seed.products[0].id;local.products[0].price=12500000;server.products.shift();server.version='2099-01-01T00:00:00.000Z';
 const s=await setup(clone(seed),200,null,{submit:false,server,saved:{catalog:local,baseline:clone(seed)}});
 assert.equal(workspace(s).conflicts[0].remote,null);assert.ok(!workspace(s).catalog.products.some(p=>p.id===id));await s.resolve(id,'local');assert.equal(workspace(s).catalog.products.find(p=>p.id===id).price,12500000);
 const matching=await setup(clone(seed),200,null,{submit:false,server:local,saved:{catalog:local,baseline:clone(seed)}});assert.equal(workspace(matching).conflicts.length,0);assert.equal(matching.element('#open-publish').disabled,true);
});

test('new products from independent devices retain unique automatic codes after synchronization',async()=>{
 const options={submit:false,server:clone(seed)},s=await setup(clone(seed),200,null,options);s.save();const mine=workspace(s).catalog.products[0];
 options.server.products.push({...clone(mine),id:'remote-new',name:'محصول دستگاه دیگر'});options.server.version='2099-01-01T00:00:00.000Z';await s.refresh();
 const w=workspace(s);assert.equal(w.catalog.products.find(p=>p.id===mine.id).sku,'HYA-010');assert.equal(w.catalog.products.find(p=>p.id==='remote-new').sku,'HYA-009');assert.equal(w.conflicts.length,0);
});

test('unchanged polling uses the ETag and never discards pending local changes',async()=>{
 let reads=0;const transport=async(url,options)=>{if(url!=='/admin/api/catalog'||options.method==='POST')return;reads++;return reads===1?{ok:true,status:200,headers:{get:()=> '"catalog-test"'},json:async()=>({catalog:clone(seed),liveCatalog:clone(seed)})}:{ok:false,status:304};};
 const s=await setup(clone(seed),200,null,{transport});await s.refresh();assert.equal(s.calls.at(-1).options.headers['If-None-Match'],'"catalog-test"');assert.equal(workspace(s).catalog.products.length,seed.products.length+1);assert.equal(workspace(s).conflicts.length,0);
});

test('publication fetches and shows newly accepted shared changes before asking for a second submission',async()=>{
 const options={submit:false,server:clone(seed)},s=await setup(clone(seed),200,null,options);s.save();options.server.products[1].name='تغییر تازه پیش از انتشار';options.server.version='2099-01-01T00:00:00.000Z';
 await s.publish();assert.ok(!s.calls.some(c=>c.options.method==='POST'));assert.match(s.element('#publish-error').textContent,/بررسی/);assert.match(s.element('#products-region').innerHTML,/تغییر تازه پیش از انتشار/);assert.equal(workspace(s).catalog.products.length,seed.products.length+1);
 await s.publish();const posted=JSON.parse(s.calls.find(c=>c.options.method==='POST').options.body);assert.equal(posted.baseVersion,options.server.version);assert.equal(posted.catalog.products.find(p=>p.id===seed.products[1].id).name,'تغییر تازه پیش از انتشار');
});
