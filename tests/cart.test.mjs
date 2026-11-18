import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../docs/cart.js',import.meta.url),'utf8');
const store=new Map(),context={window:{},localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)}};
vm.runInNewContext(source,context);const C=context.window.HooyaCart,plain=value=>JSON.parse(JSON.stringify(value));
const product={id:'vest',status:'published',sizes:['M','L'],stock:3,sizeStock:{M:2,L:1},price:1200000,dispatchDays:2,madeToOrder:true,productionDays:15};
test('ready and custom choices retain distinct preparation times',()=>{
  assert.deepEqual(plain(C.options(product,'M')),[{id:'ready',label:'آماده ارسال',days:2},{id:'order',label:'دوخت پس از سفارش',days:15}]);
  assert.deepEqual(plain(C.options({...product,sizeStock:{M:0,L:3},madeToOrder:false},'M')),[]);
  assert.equal(C.options({...product,sizeStock:{M:null,L:3},madeToOrder:false},'M')[0].id,'pending');
});
test('legacy cart migrates, merges and caps each ready size at its stock',()=>{
  const result=C.normalize([{id:'vest',size:'M'},{id:'vest',size:'M',qty:50},{id:'vest',size:'XL'},{id:'other',size:'M'}],[product]);
  assert.deepEqual(plain(result),[{id:'vest',size:'M',mode:'ready',qty:2}]);
});
test('stock loss removes a ready item instead of silently changing it to made to order',()=>{
  const changed={...product,sizeStock:{M:0,L:1},stock:1};
  assert.equal(C.normalize([{id:'vest',size:'M',mode:'ready',qty:1}],[changed]).length,0);
  assert.equal(C.normalize([{id:'vest',size:'M',mode:'order',qty:1}],[changed])[0].mode,'order');
  assert.equal(C.normalize([{id:'vest',size:'M'}],[{...product,status:'draft'}]).length,0);
});
test('unknown prices remain unknown and quantities enter totals',()=>{
  const lines=[{id:'vest',size:'M',mode:'ready',qty:2}];
  assert.deepEqual(plain(C.totals(lines,[product])),{count:2,subtotal:2400000});
  assert.equal(C.totals(lines,[{...product,price:null}]).subtotal,null);
});
test('recipient validation accepts Persian digits and rejects incomplete addresses',()=>{
  const data={name:'مشتری آزمایشی',phone:'۰۹۱۲۳۴۵۶۷۸۹',province:'تهران',city:'تهران',address:'آدرس آزمایشی، پلاک ۱، واحد ۲',postcode:'۱۲۳۴۵۶۷۸۹۰'};
  assert.deepEqual(plain(C.validateCustomer(data)),{});
  const errors=C.validateCustomer({...data,phone:'123',postcode:'123',address:''});
  assert.deepEqual(Object.keys(errors).sort(),['address','phone','postcode']);
});
test('storage contains only cart selections and survives malformed stored data',()=>{
  C.save([{id:'vest',size:'M',mode:'ready',qty:2}]);assert.equal(C.read([product])[0].qty,2);
  store.set('hooya-demo-bag','{broken');assert.equal(C.read([product]).length,0);
});
