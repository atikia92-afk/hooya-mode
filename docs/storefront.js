'use strict';
(async () => {
  const H=window.Hooya, esc=H.escape, $=s=>document.querySelector(s);
  let products=[], bag=[], currentFilter='all',currentStory='',query='',selectedSize='M',activeProduct=null,galleryIndex=0,toastTimer,loadError=false;
  const storyNames={horse:'اگر دلت با اسب‌هاست',myth:'اگر هم‌قصهٔ شاهنامه‌ای',folk:'اگر ریشه‌ها را دوست داری',iran:'اگر ایران در دلِ توست'};
  const price=p=>p.price===null?'برای اطلاعات بیشتر با هویا در ارتباط باشید':H.number(p.price)+' تومان';
  function render(){
    const list=products.filter(p=>(currentFilter==='all'||p.kind===currentFilter)&&(!currentStory||currentStory==='iran'||p.story===currentStory)&&(!query||H.normalize(p.name+' '+p.type+' '+p.tag+' '+p.description).includes(H.normalize(query))));
    $('#product-grid').innerHTML=list.map(p=>`<article class="product-card"><div class="product-image-wrap"><button class="product-view" data-product="${p.id}" aria-label="مشاهدهٔ ${esc(p.name)}">${H.photo(p)}</button><span class="product-tag">${esc(p.tag)}</span><button class="product-quick" data-product="${p.id}" aria-label="انتخاب ${esc(p.name)}">+</button></div><div class="product-meta"><div><button class="product-name" data-product="${p.id}">${esc(p.name)}</button><p class="product-type">${esc(p.type)}</p></div><span class="swatches" aria-label="رنگ‌های محصول">${p.colors.map(c=>`<i style="background:${c}"></i>`).join('')}</span></div><div class="product-bottom"><span class="catalog-price">${p.price!==null?esc(price(p)):''}${p.stock===0?' · ناموجود':''}</span><button data-product="${p.id}">داستان این لباس ←</button></div></article>`).join('');
    $('#empty-state').hidden=!!list.length;
    $('#empty-state').textContent=loadError?'دریافت محصولات ممکن نشد. لطفاً صفحه را دوباره بارگذاری کنید.':products.length?'لباسی با این نام پیدا نشد. واژهٔ دیگری را امتحان کنید.':'مجموعهٔ تازهٔ هویا به‌زودی در اینجا قرار می‌گیرد.';
    let status=currentStory?`روایت انتخابی: ${storyNames[currentStory]}`:'';
    if(query)status+=(status?' · ':'')+`جست‌وجو: «${query}»`;$('#filter-status').textContent=status;
    if(status){const clear=document.createElement('button');clear.className='filter-clear';clear.textContent='نمایش همه';clear.onclick=resetFilters;$('#filter-status').append(clear);}
    document.querySelectorAll('[data-filter]').forEach(b=>{b.hidden=b.dataset.filter!=='all'&&!products.some(p=>p.kind===b.dataset.filter);b.classList.toggle('selected',b.dataset.filter===currentFilter);b.setAttribute('aria-pressed',String(b.dataset.filter===currentFilter));});
    document.querySelectorAll('[data-category]').forEach(a=>{a.hidden=a.dataset.category!=='all'&&!products.some(p=>p.kind===a.dataset.category);});
    document.querySelectorAll('[data-story]').forEach(b=>{b.hidden=b.dataset.story!=='iran'&&!products.some(p=>p.story===b.dataset.story);});
  }
  function resetFilters(){currentFilter='all';currentStory='';query='';$('#search-input').value='';render();}
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
    $('#product-dialog').innerHTML=`<form method="dialog"><button class="close" aria-label="بستن جزئیات لباس">×</button></form><div class="product-detail">${gallery(p)}<div class="product-detail-copy"><span class="eyebrow">${esc(p.tag)}</span><h2>${esc(p.name)}</h2><p>${esc(p.type)}</p><p class="product-description">${esc(p.description)}</p><p class="detail-price">${esc(price(p))}</p><label>اندازهٔ پیشنهادی</label><div class="sizes" role="group" aria-label="انتخاب اندازه" dir="ltr">${p.sizes.map(s=>`<button data-size="${s}" class="${s===selectedSize?'selected':''}" aria-pressed="${s===selectedSize}">${s}</button>`).join('')}</div><button class="button" id="add-bag" ${p.stock===0?'disabled':''}>${p.stock===0?'این محصول فعلاً ناموجود است':'افزودن به انتخاب‌ها <span>+</span>'}</button><span class="demo-label">اندازه‌ها نمایشی‌اند. برای تأیید اندازه، قیمت و ثبت سفارش با هویا در ارتباط باشید.</span></div></div>`;
    $('#product-dialog').showModal();
  }
  function updateBag(){
    bag=bag.filter(x=>products.some(p=>p.id===x.id&&p.sizes.includes(x.size)));
    try{localStorage.setItem('hooya-demo-bag',JSON.stringify(bag));}catch{}
    $('#bag-count').textContent=H.number(bag.length);$('#bag-open').setAttribute('aria-label',`سبد انتخاب‌ها، ${H.number(bag.length)} لباس`);
    $('#bag-items').innerHTML=bag.length?bag.map((x,i)=>{const p=products.find(p=>p.id===x.id);return `<div class="bag-item"><div>${esc(p.name)}<small>اندازه: <b dir="ltr">${esc(x.size)}</b></small></div><button data-remove="${i}" aria-label="حذف ${esc(p.name)}">حذف</button></div>`;}).join(''):'<p>هنوز لباسی انتخاب نکرده‌ای.<br>قصهٔ موردعلاقه‌ات را از مجموعه پیدا کن.</p>';
  }
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
  document.addEventListener('click',e=>{
    const galleryThumb=e.target.closest('[data-gallery-index]');if(galleryThumb)showGallery(Number(galleryThumb.dataset.galleryIndex));
    const galleryStep=e.target.closest('[data-gallery-step]');if(galleryStep)showGallery(galleryIndex+Number(galleryStep.dataset.galleryStep));
    const product=e.target.closest('[data-product]');if(product)openProduct(product.dataset.product);
    const filter=e.target.closest('[data-filter]');if(filter){currentFilter=filter.dataset.filter;currentStory='';query='';render();}
    const story=e.target.closest('[data-story]');if(story){currentStory=story.dataset.story;currentFilter='all';query='';render();$('#collection').scrollIntoView({behavior:'smooth'});}
    const size=e.target.closest('[data-size]');if(size&&activeProduct?.sizes.includes(size.dataset.size)){selectedSize=size.dataset.size;document.querySelectorAll('[data-size]').forEach(b=>{b.classList.toggle('selected',b===size);b.setAttribute('aria-pressed',String(b===size));});}
    if(e.target.closest('#add-bag')&&activeProduct?.stock!==0){if(bag.some(x=>x.id===activeProduct.id&&x.size===selectedSize)){toast('این لباس با همین اندازه در انتخاب‌هایت هست.');return;}bag.push({id:activeProduct.id,size:selectedSize});updateBag();$('#product-dialog').close();toast('این قصه به انتخاب‌هایت اضافه شد.');}
    const remove=e.target.closest('[data-remove]');if(remove){bag.splice(Number(remove.dataset.remove),1);updateBag();}
    const category=e.target.closest('[data-category]');if(category){currentFilter=category.dataset.category;currentStory='';query='';render();}
    if(e.target.closest('#menu-dialog a'))$('#menu-dialog').close();
  });
  $('#search-open').onclick=()=>$('#search-dialog').showModal();$('#bag-open').onclick=()=>$('#bag-dialog').showModal();$('#craft-more').onclick=()=>$('#craft-dialog').showModal();$('#menu-open').onclick=()=>$('#menu-dialog').showModal();
  $('#search-form').onsubmit=e=>{e.preventDefault();query=$('#search-input').value.trim();currentFilter='all';currentStory='';render();$('#search-dialog').close();$('#collection').scrollIntoView({behavior:'smooth'});};
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('#filter-status').textContent='در حال دریافت مجموعه…';
  try{const response=await fetch('products.json',{cache:'no-store'});if(!response.ok)throw Error();const catalog=H.validate(await response.json());products=catalog.products.filter(p=>p.status==='published');}catch{loadError=true;}
  try{const stored=JSON.parse(localStorage.getItem('hooya-demo-bag')||'[]');bag=Array.isArray(stored)?stored.filter(x=>x&&typeof x.id==='string'&&typeof x.size==='string'):[];}catch{}
  render();updateBag();
})();
