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
  await cp(new URL('../build-storefront.mjs',import.meta.url),path.join(temporary,'build-storefront.mjs'));
  const build=()=>execFileSync(process.execPath,['build-storefront.mjs'],{cwd:temporary});
  build();
  const pages=['index.html','products.html','cart.html','checkout.html','about.html','contact.html'];
  const previous=await Promise.all(pages.map(name=>readFile(path.join(temporary,'docs',name),'utf8')));
  build();
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
