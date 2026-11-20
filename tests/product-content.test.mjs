import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const catalog=JSON.parse(await fs.readFile(new URL('../docs/products.json',import.meta.url),'utf8'));
const ctx={window:{},Intl,TextEncoder,URL};
vm.runInNewContext(await fs.readFile(new URL('../docs/catalog.js',import.meta.url),'utf8'),ctx);
vm.runInNewContext(await fs.readFile(new URL('../docs/product-content.js',import.meta.url),'utf8'),ctx);
const H=ctx.window.Hooya,P=ctx.window.HooyaProductContent,clone=x=>JSON.parse(JSON.stringify(x));
test('legacy content stays optional, while malformed structured content is rejected',()=>{
  const legacy=clone(catalog);for(const p of legacy.products){delete p.narrative;delete p.details;}
  assert.equal(H.validate(legacy),legacy);assert.equal(P.narrative(legacy.products[0]),'');assert.equal(P.specifications(legacy.products[0]),'');
  for(const mutate of [p=>p.narrative=[],p=>p.narrative.text={},p=>p.narrative.unknown='x',p=>p.details=null,p=>p.details.embroideryHours='89',p=>p.details.lengthCm=-1,p=>p.details.sizeNotes={XL:'unavailable size'},p=>p.sizes=[['Free']],p=>p.sizes=['Free','Free']]){
    const bad=clone(catalog);mutate(bad.products[0]);assert.throws(()=>H.validate(bad));
  }
});
test('unprovided stories stay blank, poetry keeps its verse layout, and detail fields remain distinct',()=>{
  for(const id of ['nightingale','malakeh-kheir']){const p=catalog.products.find(p=>p.id===id);assert.equal(P.narrative(p),'');assert.equal(p.description,'');}
  const poem=P.narrative(catalog.products.find(p=>p.id==='swallow'));
  assert.match(poem,/<blockquote class="garment-verse">/);assert.match(poem,/یارش<\/span><span>گل/);
  const tishter=catalog.products.find(p=>p.id==='horse-tishter');assert.match(P.craft(tishter),/۸۹/);assert.match(P.specifications(tishter),/۶۵ سانتی متر/);assert.equal(tishter.productionDays,null);
});
test('narrative, measurements, poems and custom instructions are rendered as escaped text',()=>{
  const p=clone(catalog.products[0]);p.narrative={text:'<img src=x onerror=alert(1)>',quote:'<script>bad</script>',verse:'<svg onload=x>\nSecond line'};
  p.details.fabric='<iframe>';p.details.customization='<input autofocus>';p.details.care='<script>';p.details.sizeNotes={Free:'<img>'};
  const html=P.narrative(p)+P.craft(p)+P.specifications(p)+P.notes(p)+P.sizeGuide(p,'Free');
  assert.ok(!/<(?:img|script|svg|iframe|input)\b/.test(html));assert.match(html,/&lt;img/);assert.match(html,/&lt;iframe/);
});
test('real sizing uses Free or numbered sizes, and hours do not change availability or price',()=>{
  const sizes=Object.fromEntries(catalog.products.map(p=>[p.id,p.sizes.join(',')]));
  assert.equal(sizes.swallow,'1,2');assert.equal(sizes.nightingale,'1,2');assert.equal(sizes.iris,'Free');
  for(const id of ['horse-brown','horse-cream']){const p=catalog.products.find(p=>p.id===id);assert.equal(p.stock,0);assert.deepEqual(p.sizeStock,{Free:0});}
  assert.equal(catalog.products.find(p=>p.id==='horse-tishter').price,17800000);assert.equal(catalog.products.find(p=>p.id==='iris').details.sizeNotes.Free,'');
});
