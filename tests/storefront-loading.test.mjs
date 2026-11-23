import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

for(const listing of [
 {name:'home',search:'',full:false},
 {name:'catalog',search:'',full:true},
 {name:'collection',search:'?collection=mythical-creatures',full:true},
 {name:'search',search:'?q='+encodeURIComponent('وست'),full:true}
])test(listing.name+' shows newest products immediately and after refresh, with a working product dialog',async()=>{
  const seed=JSON.parse(await readFile(new URL('../docs/products.json',import.meta.url),'utf8'));
  const nodes=new Map(),handlers=new Map();
  const element=key=>{
    if(!nodes.has(key))nodes.set(key,{dataset:{},value:'',textContent:'',innerHTML:'',hidden:false,
      setAttribute(){},append(){},classList:{add(){},remove(){},toggle(){}},addEventListener(){},
      showModal(){this.open=true;},close(){this.open=false;}});
    return nodes.get(key);
  };
  element('#catalog-snapshot').textContent=JSON.stringify(seed);
  if(listing.full)element('#main').dataset.catalog='full';
  const context={window:{location:{href:'https://hooyamode.ir/'+listing.search,search:listing.search},addEventListener(){}},
    document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>({}),addEventListener:(key,fn)=>handlers.set(key,fn)},
    localStorage:{getItem:()=>null,setItem(){}},TextEncoder,Intl,URL,URLSearchParams,
    setTimeout:()=>0,clearTimeout(){}};
  const run=async name=>vm.runInNewContext(await readFile(new URL('../docs/'+name,import.meta.url),'utf8'),context);
  for(const name of ['catalog.js','cart.js','product-content.js'])await run(name);
  let finishRefresh;
  context.window.Hooya.loadCatalog=()=>new Promise(resolve=>{finishRefresh=resolve;});
  // Do not await this script: the refresh intentionally remains pending.
  const pending=vm.runInNewContext(await readFile(new URL('../docs/storefront.js',import.meta.url),'utf8'),context);
  const expected=listing.full?seed.products.filter(p=>p.status==='published'&&(!listing.search.includes('collection=')||p.collection==='mythical-creatures')):seed.products.filter(p=>p.status==='published');
  const H=context.window.Hooya,ids=Array.from(listing.full?H.newest(expected):H.latest(expected,4),p=>p.id);
  const rendered=()=>[...element('#product-grid').innerHTML.matchAll(/class="product-view" data-product="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(rendered(),ids);
  if(!listing.full)assert.equal(rendered().length,4);
  handlers.get('click')({target:{closest:selector=>selector==='[data-product]'?{dataset:{product:'horse-tishter'}}:null}});
  assert.equal(element('#product-dialog').open,true);
  assert.match(element('#product-dialog').innerHTML,/وست اسب تیشتر/);
  finishRefresh(seed);
  await pending;
  assert.deepEqual(rendered(),ids);
});

for(const page of ['cart-page.js','checkout.js'])test(page+' displays saved selections before any network request completes',async()=>{
 const seed=JSON.parse(await readFile(new URL('../docs/products.json',import.meta.url),'utf8'));
 const nodes=new Map();
 const element=key=>{
  if(!nodes.has(key))nodes.set(key,{dataset:{},value:'',textContent:'',innerHTML:'',hidden:true,
   setAttribute(){},append(){},addEventListener(){},classList:{add(){},remove(){},toggle(){}}});
  return nodes.get(key);
 };
 element('#catalog-snapshot').textContent=JSON.stringify(seed);
 const context={window:{addEventListener(){},HooyaCheckoutConfig:{endpoints:['/api/customer']}},
  document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}},
  localStorage:{getItem:()=>JSON.stringify([{id:'horse-tishter',size:'Free',mode:'pending',qty:1}]),setItem(){}},
  TextEncoder,Intl,URL,URLSearchParams,AbortSignal,setTimeout:()=>0,clearTimeout(){},fetch:()=>new Promise(()=>{})};
 for(const name of ['catalog.js','cart.js',...(page==='checkout.js'?['customer-data.js']:[])])vm.runInNewContext(await readFile(new URL('../docs/'+name,import.meta.url),'utf8'),context);
 context.window.Hooya.loadCatalog=()=>new Promise(()=>{});
 vm.runInNewContext(await readFile(new URL('../docs/'+page,import.meta.url),'utf8'),context);
 assert.match(element(page==='checkout.js'?'#bill-products':'#cart-lines').innerHTML,/وست اسب تیشتر/);
 assert.equal(element(page==='checkout.js'?'#billing-layout':'.cart-summary').hidden,false);
 if(page==='checkout.js')assert.equal(element('#save-customer').disabled,true,'unverified storage must not accept submission');
});
