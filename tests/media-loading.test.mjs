import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../docs/site-media.js',import.meta.url),'utf8');

test('only two full photographs download together and a failed transfer keeps its visible preview',()=>{
 const images=[],timers=new Map();let intersect;
 const elements=[0,1,2].map(index=>({tagName:'IMG',nodeType:1,isConnected:true,src:'data:image/webp;base64,preview',attrs:{'data-full-src':'assets/products/sample/photo-'+index+'.webp?v=123456abcdef'},getAttribute(key){return this.attrs[key]??null;},hasAttribute(key){return key in this.attrs;}}));
 class Picture{constructor(){this.naturalWidth=560;images.push(this);}set src(value){this.url=value;}get src(){return this.url;}}
 class Observer{constructor(callback){intersect=callback;}observe(){}unobserve(){}}
 const context={window:{IntersectionObserver:Observer},IntersectionObserver:Observer,MutationObserver:class{observe(){}},Image:Picture,URL,WeakSet,JSON,location:{origin:'https://hooyamode.ir'},document:{baseURI:'https://hooyamode.ir/',body:{},querySelectorAll:()=>elements},setTimeout(callback){const id=timers.size+1;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);}};
 vm.runInNewContext(source,context);
 assert.equal(images.length,0,'offscreen images should not download');
 intersect(elements.map(target=>({target,isIntersecting:true})));assert.equal(images.length,2);
 assert.ok(elements.every(el=>el.src.startsWith('data:')));
 images[0].onerror();assert.equal(images.length,3);assert.match(images[2].src,/_media_retry=1/);
 images[2].onerror();assert.equal(images.length,4,'the third photograph starts after one finishes');
 assert.ok(elements[0].src.startsWith('data:'),'a broken original must never replace its preview');
 images[1].onload();images[3].onload();assert.equal(elements[1].src,'https://hooyamode.ir/assets/products/sample/photo-1.webp?v=123456abcdef');assert.equal(elements[2].src,'https://hooyamode.ir/assets/products/sample/photo-2.webp?v=123456abcdef');assert.equal(timers.size,0);
});
