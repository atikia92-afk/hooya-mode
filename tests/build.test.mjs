import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

test('rebuilding pages is repeatable and emits exactly one working bundle and public snapshot',async()=>{
 const temporary=await mkdtemp(path.join(tmpdir(),'hooya-build-'));
 try{
  await cp(new URL('../docs/',import.meta.url),path.join(temporary,'docs'),{recursive:true});
  await cp(new URL('../server/admin-ui/',import.meta.url),path.join(temporary,'server','admin-ui'),{recursive:true});
  await cp(new URL('../build-storefront.mjs',import.meta.url),path.join(temporary,'build-storefront.mjs'));
  const build=()=>execFileSync(process.execPath,['build-storefront.mjs'],{cwd:temporary});
  build();
  const publicAdmin=await readFile(path.join(temporary,'docs','admin','index.html'),'utf8');
  assert.ok(publicAdmin.includes('https://hooyamode.ir/admin/'));
  assert.ok(!publicAdmin.includes('product-form'));
  const pages=['index.html','products.html','cart.html','checkout.html','about.html','contact.html'];
  const previous=await Promise.all(pages.map(name=>readFile(path.join(temporary,'docs',name),'utf8')));
  const privateBefore=await readFile(path.join(temporary,'server','admin-ui','index.html'),'utf8');
  build();
  const privateAfter=await readFile(path.join(temporary,'server','admin-ui','index.html'),'utf8');
  assert.equal(privateAfter,privateBefore);
  assert.equal([...privateAfter.matchAll(/<script data-hooya-admin-bundle=/g)].length,1);
  assert.ok(!/<script[^>]*src=/.test(privateAfter));
  for(const [,attributes,content] of privateAfter.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!attributes.includes('application/json'))new vm.Script(content);
  for(const [index,name] of pages.entries()){
   const html=await readFile(path.join(temporary,'docs',name),'utf8');
   assert.equal(html,previous[index],name+' must not grow on repeated builds');
   const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
   assert.equal(scripts.filter(([,attributes])=>attributes.includes('data-hooya-bundle=')).length,1,name);
   assert.equal(scripts.filter(([,attributes])=>attributes.includes('src=')).length,0,name);
   for(const [,attributes,content] of scripts){
    if(attributes.includes('application/json')){const data=JSON.parse(content);assert.ok(data.products.every(p=>p.status==='published'));}
    else new vm.Script(content,{filename:name});
   }
   if(!['about.html','contact.html'].includes(name))assert.equal(scripts.filter(([,attributes])=>attributes.includes('id="catalog-snapshot"')).length,1,name);
  }
 }finally{await rm(temporary,{recursive:true,force:true});}
});
