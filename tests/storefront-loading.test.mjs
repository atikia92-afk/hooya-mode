import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('the embedded collection and product dialog work while the catalog request is still pending',async()=>{
  const seed=JSON.parse(await readFile(new URL('../docs/products.json',import.meta.url),'utf8'));
  const nodes=new Map(),handlers=new Map();
  const element=key=>{
    if(!nodes.has(key))nodes.set(key,{dataset:{},value:'',textContent:'',innerHTML:'',hidden:false,
      setAttribute(){},classList:{add(){},remove(){},toggle(){}},addEventListener(){},
      showModal(){this.open=true;},close(){this.open=false;}});
    return nodes.get(key);
  };
  element('#catalog-snapshot').textContent=JSON.stringify(seed);
  const context={window:{location:{href:'https://hooyamode.ir/'},addEventListener(){}},
    document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(key,fn)=>handlers.set(key,fn)},
    localStorage:{getItem:()=>null,setItem(){}},TextEncoder,Intl,URL,URLSearchParams,
    setTimeout:()=>0,clearTimeout(){}};
  const run=async name=>vm.runInNewContext(await readFile(new URL('../docs/'+name,import.meta.url),'utf8'),context);
  for(const name of ['catalog.js','cart.js','product-content.js'])await run(name);
  let finishRefresh;
  context.window.Hooya.loadCatalog=()=>new Promise(resolve=>{finishRefresh=resolve;});
  // Do not await this script: the refresh intentionally remains pending.
  const pending=vm.runInNewContext(await readFile(new URL('../docs/storefront.js',import.meta.url),'utf8'),context);
  assert.match(element('#product-grid').innerHTML,/data-product="horse-tishter"/);
  handlers.get('click')({target:{closest:selector=>selector==='[data-product]'?{dataset:{product:'horse-tishter'}}:null}});
  assert.equal(element('#product-dialog').open,true);
  assert.match(element('#product-dialog').innerHTML,/وست اسب تیشتر/);
  finishRefresh(seed);
  await pending;
  assert.match(element('#product-grid').innerHTML,/data-product="horse-tishter"/);
});
