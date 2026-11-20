'use strict';
(async () => {
  const H=window.Hooya, esc=H.escape, $=s=>document.querySelector(s);
  const P=window.HooyaProductContent,C=window.HooyaCart,isCatalog=$('#main').dataset.catalog==='full';
  let products=[], bag=[], currentFilter='all',currentCollection='',query='',selectedSize='M',activeProduct=null,galleryIndex=0,toastTimer,loadError=false;
  const price=p=>p.price===null?'برای اطلاعات بیشتر با هویا در ارتباط باشید':H.number(p.price)+' تومان';
  function render(){
    const matching=products.filter(p=>(currentFilter==='all'||p.kind===currentFilter)&&(!currentCollection||H.collectionOf(p)===currentCollection)&&(!query||H.normalize(p.name+' '+p.type+' '+p.tag+' '+p.description+' '+JSON.stringify(H.contentOf(p))+' '+(H.collections[H.collectionOf(p)]||'')).includes(H.normalize(query))));
    const list=isCatalog?matching:H.latest(products,3);
    $('#product-grid').innerHTML=list.map(p=>`<article class="product-card"><div class="product-image-wrap"><button class="product-view" data-product="${p.id}" aria-label="مشاهده ${esc(p.name)}">${H.photo(p)}</button><button class="product-quick" data-product="${p.id}" aria-label="انتخاب ${esc(p.name)}">+</button></div><div class="product-meta"><div><button class="product-name" data-product="${p.id}">${esc(p.name)}</button></div></div><div class="product-bottom"><span class="catalog-price">${p.price!==null?esc(price(p)):''}${p.stock===0?' · ناموجود':''}</span><button data-product="${p.id}">داستان این لباس ←</button></div></article>`).join('');
    $('#empty-state').hidden=!!list.length;
    $('#empty-state').textContent=loadError?'دریافت محصولات ممکن نشد. لطفا صفحه را دوباره بارگذاری کنید.':currentCollection&&!query&&currentFilter==='all'?'در حال حاضر لباسی در این کالکشن برای نمایش نیست.':products.length?'لباسی با این انتخاب پیدا نشد. واژه یا فیلتر دیگری را امتحان کنید.':'مجموعه تازه هویا به‌زودی در اینجا قرار می‌گیرد.';
    $('#collection-title').textContent=isCatalog?(currentCollection?H.collections[currentCollection]:'جهان هویا'):'تازه های هویا';
    let status=currentCollection?`کالکشن ${H.collections[currentCollection]}`:'';
    if(query)status+=(status?' · ':'')+`جست‌وجو: «${query}»`;$('#filter-status').textContent=status;
    if(status){const clear=document.createElement('button');clear.className='filter-clear';clear.textContent='نمایش همه';clear.onclick=resetFilters;$('#filter-status').append(clear);}
    document.querySelectorAll('[data-filter]').forEach(b=>{b.hidden=b.dataset.filter!=='all'&&!products.some(p=>p.kind===b.dataset.filter);b.classList.toggle('selected',b.dataset.filter===currentFilter);b.setAttribute('aria-pressed',String(b.dataset.filter===currentFilter));});
    document.querySelectorAll('[data-category]').forEach(a=>{a.hidden=a.dataset.category!=='all'&&!products.some(p=>p.kind===a.dataset.category);});
    document.querySelectorAll('.collection-tabs [data-collection]').forEach(b=>{const selected=b.dataset.collection===(currentCollection||'all');b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    document.querySelectorAll('[data-collection-count]').forEach(span=>{span.textContent=H.number(span.dataset.collectionCount==='all'?products.length:products.filter(p=>H.collectionOf(p)===span.dataset.collectionCount).length);});
    window.HooyaProductMotion?.sync($('#product-grid'));
  }
  function syncCollectionUrl(){const url=new URL(window.location.href);if(currentCollection)url.searchParams.set('collection',currentCollection);else url.searchParams.delete('collection');if(currentFilter!=='all')url.searchParams.set('kind',currentFilter);else url.searchParams.delete('kind');if(query)url.searchParams.set('q',query);else url.searchParams.delete('q');url.hash='collection';window.history.pushState(null,'',url);}
  function chooseCollection(id){if(!isCatalog){window.location.href='products.html'+(id==='all'?'':'?collection='+encodeURIComponent(id))+'#collection';return;}if(id!=='all'&&!Object.hasOwn(H.collections,id))return;currentCollection=id==='all'?'':id;currentFilter='all';query='';$('#search-input').value='';syncCollectionUrl();render();$('#collection').scrollIntoView({behavior:'smooth'});}
  function resetFilters(){chooseCollection('all');}
  function gallery(p){
    const photos=H.images(p);
    if(!photos.length)return H.photo(p);
    return `<div class="product-gallery"><div class="gallery-stage"><div class="gallery-image-slot" id="gallery-image-slot">${H.photo(p)}</div>${photos.length>1?`<button class="gallery-arrow gallery-prev" data-gallery-step="-1" aria-label="عکس قبلی">→</button><button class="gallery-arrow gallery-next" data-gallery-step="1" aria-label="عکس بعدی">←</button>`:''}</div><div class="gallery-toolbar"><span>گالری ${esc(p.name)}</span><span class="gallery-count" role="status">۱ / ${H.number(photos.length)}</span></div><div class="gallery-thumbnails" role="group" aria-label="تصاویر ${esc(p.name)}">${photos.map((src,i)=>`<button data-gallery-index="${i}" aria-label="نمای ${H.number(i+1)} از ${esc(p.name)}" aria-pressed="${i===0}" class="${i===0?'selected':''}"><img src="${esc(H.imageUrl(src))}" alt="نمای ${H.number(i+1)}" loading="lazy"></button>`).join('')}</div></div>`;
  }
  function showGallery(index){
    if(!activeProduct)return;
    const photos=H.images(activeProduct);if(!photos.length)return;
    galleryIndex=(index+photos.length)%photos.length;
    $('#gallery-image-slot').innerHTML=H.photo({...activeProduct,image:photos[galleryIndex]});
    $('.gallery-count').textContent=H.number(galleryIndex+1)+' / '+H.number(photos.length);
    document.querySelectorAll('[data-gallery-index]').forEach(b=>{const chosen=Number(b.dataset.galleryIndex)===galleryIndex;b.classList.toggle('selected',chosen);b.setAttribute('aria-pressed',String(chosen));});
  }
  function openProduct(id){
    activeProduct=products.find(p=>p.id===id);if(!activeProduct)return;
    const p=activeProduct;galleryIndex=0;selectedSize=p.sizes.includes('M')?'M':p.sizes[0];
    $('#product-dialog').innerHTML=`<form method="dialog"><button class="close" aria-label="بستن جزئیات لباس">×</button></form><div class="product-detail">${gallery(p)}<div class="product-detail-copy"><span class="eyebrow">${esc(H.collections[H.collectionOf(p)]||p.tag)}</span><h2>${esc(p.name)}</h2><p class="detail-price">${esc(price(p))}</p>${P.craft(p)}<label>اندازه لباس</label>${P.sizeGuide(p,selectedSize)}<button class="button" id="add-bag" ${C.options(p,selectedSize).length?'':'disabled'}>${C.options(p,selectedSize).length?'افزودن به سبد خرید <span>+</span>':'این اندازه فعلا ناموجود است'}</button><span class="demo-label">ثبت سفارش و پرداخت در نسخه نمایشی فعال نیست.</span><div class="product-content">${P.narrative(p)}${P.specifications(p)}${P.notes(p)}</div></div></div>`;
    $('#product-dialog').showModal();$('#product-dialog').scrollTop=0;
  }
  function updateBag(){
    bag=C.normalize(bag,products);const stored=C.save(bag),count=C.totals(bag,products).count;
    $('#bag-count').textContent=H.number(count);$('#bag-open').setAttribute('aria-label',`سبد خرید، ${H.number(count)} لباس`);return stored;
  }
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
  document.addEventListener('click',e=>{
    if(e.target.closest('#menu-dialog a'))$('#menu-dialog').close();
    const collection=e.target.closest('[data-collection]');if(collection&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();chooseCollection(collection.dataset.collection);}
    const galleryThumb=e.target.closest('[data-gallery-index]');if(galleryThumb)showGallery(Number(galleryThumb.dataset.galleryIndex));
    const galleryStep=e.target.closest('[data-gallery-step]');if(galleryStep)showGallery(galleryIndex+Number(galleryStep.dataset.galleryStep));
    const product=e.target.closest('[data-product]');if(product)openProduct(product.dataset.product);
    const filter=e.target.closest('[data-filter]');if(filter){currentFilter=filter.dataset.filter;query='';syncCollectionUrl();render();}
    const size=e.target.closest('[data-size]');if(size&&activeProduct?.sizes.includes(size.dataset.size)){selectedSize=size.dataset.size;$('#selected-size-note').textContent=H.contentOf(activeProduct).details.sizeNotes[selectedSize]||'';$('#add-bag').disabled=!C.options(activeProduct,selectedSize).length;$('#add-bag').innerHTML=C.options(activeProduct,selectedSize).length?'افزودن به سبد خرید <span>+</span>':'این اندازه فعلا ناموجود است';document.querySelectorAll('[data-size]').forEach(b=>{b.classList.toggle('selected',b===size);b.setAttribute('aria-pressed',String(b===size));});}
    if(e.target.closest('#add-bag')&&activeProduct){
      const p=activeProduct,mode=C.options(p,selectedSize)[0]?.id;if(!mode)return;
      const existing=bag.find(x=>x.id===p.id&&x.size===selectedSize&&x.mode===mode);
      if(existing&&existing.qty>=C.limit(p,existing)){toast('تعداد این لباس در سبد به حداکثر رسیده است.');return;}
      bag.push({id:p.id,size:selectedSize,mode,qty:1});const saved=updateBag();
      if(!saved){toast('ذخیره سبد خرید ممکن نشد. تنظیمات مرورگر را بررسی کنید.');return;}
      $('#product-dialog').close();$('#added-product').innerHTML=`${H.photo(p)}<div><h3>${esc(p.name)}</h3><p>اندازه: <b dir="ltr">${esc(H.sizeLabel(selectedSize))}</b></p></div>`;$('#added-dialog').showModal();
    }
    const category=e.target.closest('[data-category]');if(category){if(!isCatalog)return;e.preventDefault();currentFilter=category.dataset.category;currentCollection='';query='';syncCollectionUrl();render();}
  });
  $('#search-open').onclick=()=>$('#search-dialog').showModal();if($('#craft-more'))$('#craft-more').onclick=()=>$('#craft-dialog').showModal();$('#continue-shopping').onclick=()=>$('#added-dialog').close();$('#menu-open').onclick=()=>$('#menu-dialog').showModal();
  $('#search-form').onsubmit=e=>{e.preventDefault();query=$('#search-input').value.trim();if(!isCatalog){window.location.href='products.html?q='+encodeURIComponent(query)+'#collection';return;}currentFilter='all';currentCollection='';syncCollectionUrl();render();$('#search-dialog').close();$('#collection').scrollIntoView({behavior:'smooth'});};
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('#filter-status').textContent='در حال دریافت مجموعه…';
  try{const response=await fetch('products.json',{cache:'no-store'});if(!response.ok)throw Error();const catalog=H.validate(await response.json());products=catalog.products.filter(p=>p.status==='published');}catch{loadError=true;}
  bag=C.read(products);
  const action=new URLSearchParams(window.location.search);
  if(!isCatalog&&(action.has('collection')||action.has('kind')||action.has('q')||action.get('search')==='1')){window.location.replace('products.html?'+action.toString()+'#collection');return;}
  if(action.get('bag')==='1'){window.location.replace('cart.html');return;}
  currentFilter=Object.hasOwn(H.kinds,action.get('kind'))?action.get('kind'):'all';query=action.get('q')||'';$('#search-input').value=query;
  currentCollection=Object.hasOwn(H.collections,action.get('collection'))?action.get('collection'):'';
  render();if(!loadError)updateBag();
  if(action.get('product'))openProduct(action.get('product'));
  window.addEventListener('popstate',()=>{const id=new URLSearchParams(window.location.search).get('collection');currentCollection=Object.hasOwn(H.collections,id)?id:'';const params=new URLSearchParams(window.location.search);currentFilter=Object.hasOwn(H.kinds,params.get('kind'))?params.get('kind'):'all';query=params.get('q')||'';$('#search-input').value=query;render();});
  if(action.get('search')==='1')$('#search-dialog').showModal();
  window.addEventListener('storage',e=>{if(e.key==='hooya-demo-bag'&&!loadError){bag=C.read(products);updateBag();}});
  if(action.has('search')||action.has('bag')){action.delete('search');action.delete('bag');const suffix=action.toString();window.history.replaceState(null,'',window.location.pathname+(suffix?'?'+suffix:'')+window.location.hash);}
})();
