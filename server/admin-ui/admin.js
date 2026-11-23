'use strict';
(() => {
  const H = window.Hooya, $ = s => document.querySelector(s), esc = H.escape, num = H.number;
  const STORAGE = 'hooya-catalog-workspace-v1';
  const API = '/admin/api/catalog';
  let catalog, baseline, websiteCatalog, deploymentPending=false, statusFilter = 'all', inventoryOnly = false, view = 'table', selected = new Set(), toastTimer;
  let editingId = null, editingImage = '', editingImages = [], editorSnapshot = '', uploading = false, publishing = false, publishedMessage = '';
  const clone = value => JSON.parse(JSON.stringify(value));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const lowStock = p => p.status !== 'archived' && (p.stock === null || p.stock < 3);
  const price = p => p.price === null ? '<span class="unset">تعیین نشده</span>' : `${num(p.price)} <small>تومان</small>`;
  const sameProducts=(a,b)=>!!a&&!!b&&a.products.length===b.products.length&&a.products.every(p=>JSON.stringify(p)===JSON.stringify(b.products.find(x=>x.id===p.id)));
  function badge(p){
    const live=(websiteCatalog||baseline)?.products.find(x=>x.id===p.id),base=baseline?.products.find(x=>x.id===p.id);
    const local=JSON.stringify(p)!==JSON.stringify(base);
    let label=H.statuses[p.status],style=p.status;
    if(p.status==='published'&&live?.status!=='published'){label=local?'آماده انتشار':'در حال انتشار';style='draft';}
    else if(local)label+=' · تغییرات ارسال نشده';
    return `<span class="badge ${esc(style)}"><i class="dot"></i>${esc(label)}</span>`;
  }
  function formError(message) {
    const error=$('#form-error');error.textContent=message;error.scrollIntoView?.({block:'center',behavior:'smooth'});error.focus?.({preventScroll:true});
  }
  function setGallery(images) {
    editingImages=[...new Set(images)];editingImage=editingImages[0]||'';
    renderGallery();updatePreview();
  }
  function renderGallery() {
    $('#gallery-preview').innerHTML=editingImages.length?`<ol class="gallery-list" aria-label="تصاویر محصول">${editingImages.map((src,index)=>`<li><button type="button" class="gallery-photo ${index===0?'is-cover':''}" data-gallery-cover="${index}" aria-label="${index===0?'عکس اصلی':'انتخاب عکس '+num(index+1)+' به عنوان عکس اصلی'}" ${uploading?'disabled':''}><img src="${esc(H.imageUrl(src))}" alt="عکس ${num(index+1)} محصول"><span>${index===0?'عکس اصلی':'اصلی شود'}</span></button><button type="button" class="gallery-remove" data-gallery-remove="${index}" aria-label="حذف عکس ${num(index+1)}" ${uploading?'disabled':''}>حذف</button></li>`).join('')}</ol>`:'<p class="gallery-empty">می‌توانید تا ۱۲ عکس برای این محصول اضافه کنید.</p>';
    $('#gallery-count').textContent=num(editingImages.length)+' از ۱۲ عکس';
    $('#remove-image').hidden=!editingImages.length;
    $('.sample-label').hidden=!!editingImages.length;
  }
  const changes = () => {
    if (!catalog || !baseline) return [];
    const before = new Map(baseline.products.map(p => [p.id,p]));
    const after = new Map(catalog.products.map(p => [p.id,p]));
    const result = catalog.products.filter(p => !before.has(p.id) || JSON.stringify(p) !== JSON.stringify(before.get(p.id))).map(p => ({product:p, label:before.has(p.id)?'ویرایش محصول':'محصول جدید'}));
    for (const p of baseline.products) if (!after.has(p.id)) result.push({product:p,label:'حذف از کاتالوگ'});
    return result;
  };
  function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4200); }
  function saveLocal() {
    try { localStorage.setItem(STORAGE, JSON.stringify({catalog,baseline})); return true; }
    catch { toast('فضای ذخیره مرورگر کافی نیست. نسخه پشتیبان دریافت کنید و حجم تصاویر را کاهش دهید.'); return false; }
  }
  function filtered() {
    const term = H.normalize($('#search').value.trim()), kind = $('#kind-filter').value, collection = $('#collection-filter').value;
    const list = catalog.products.filter(p => (statusFilter === 'all' || p.status === statusFilter) && (!inventoryOnly || lowStock(p)) && (kind === 'all' || p.kind === kind) && (collection === 'all' || H.collectionOf(p) === collection) && (!term || H.normalize(p.name+' '+p.sku+' '+p.type+' '+(H.collections[H.collectionOf(p)]||'')).includes(term)));
    const sort = $('#sort').value;
    list.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name,'fa') : sort === 'price' ? (a.price ?? Infinity)-(b.price ?? Infinity) : b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }
  function render() {
    if (!catalog) return;
    const all = catalog.products, list = filtered(), pending = changes().length;
    $('#stat-total').textContent = num(all.length); $('#stat-published').textContent = num((websiteCatalog||baseline).products.filter(p=>p.status==='published').length);
    $('#stat-drafts').textContent = num(all.filter(p=>p.status==='draft').length); $('#stat-stock').textContent = num(all.filter(lowStock).length);
    $('#nav-count').textContent = num(all.length); $('#catalog-count').textContent = num(all.length)+' محصول'; $('#tab-total').textContent = num(all.length);
    $('#sync-title').textContent = pending ? num(pending)+' محصول با تغییرهای منتشرنشده' : deploymentPending ? 'در انتظار نمایش تغییرها روی سایت' : publishedMessage ? 'انتشار در سایت تایید شد' : 'کاتالوگ شما به‌روز است';
    $('#sync-copy').textContent = pending ? 'تغییرها در فضای کار ذخیره شده‌اند. برای به‌روزرسانی ویترین، آن‌ها را منتشر کنید.' : publishedMessage || 'می‌توانید محصول جدید اضافه کنید یا جزئیات مجموعه را ویرایش کنید.';
    $('#open-publish').disabled = !pending; $('#dirty-count').hidden = !pending; $('#dirty-count').textContent = num(pending);
    $('#catalog-title').childNodes[0].textContent = inventoryOnly ? 'بررسی موجودی ' : 'کاتالوگ محصولات ';
    document.querySelectorAll('[data-status]').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.status===statusFilter)); b.tabIndex = b.dataset.status===statusFilter ? 0 : -1; });
    $('#nav-inventory').classList.toggle('active', inventoryOnly);
    $('#nav-drafts').classList.toggle('active', !inventoryOnly&&statusFilter==='draft');
    $('#nav-products').classList.toggle('active', !inventoryOnly&&statusFilter!=='draft');
    selected = new Set([...selected].filter(id=>list.some(p=>p.id===id)));
    $('#bulk-bar').hidden = !selected.size; $('#selected-count').textContent = num(selected.size)+' محصول انتخاب شده';
    $('#results-count').textContent = 'نمایش '+num(list.length)+' از '+num(all.length)+' محصول';
    if (!list.length) {
      $('#products-region').innerHTML = `<div class="empty-state">${icon('bag')}<h3>${all.length?'محصولی با این فیلتر پیدا نشد':'قصه اولین محصول را شروع کنید'}</h3><p>${all.length?'جست‌وجو یا فیلترها را تغییر دهید.':'نام، تصویر و مشخصات محصول را وارد کنید.'}</p><button class="button secondary" id="empty-action">${all.length?'پاک کردن فیلترها':'افزودن محصول'}</button></div>`;
      $('#empty-action').onclick = () => all.length ? resetFilters() : openEditor();
      return;
    }
    if (view === 'grid') {
      $('#products-region').innerHTML = `<div class="cards">${list.map(p=>`<article class="catalog-card"><div class="card-image">${H.photo(p)}${badge(p)}</div><div class="card-copy"><h3>${esc(p.name)}</h3><p>${esc(p.type || H.kinds[p.kind])}</p><div><span>${price(p)}</span><button data-edit="${p.id}">ویرایش ←</button></div></div></article>`).join('')}</div>`;
    } else {
      $('#products-region').innerHTML = `<div class="product-table-wrap"><table class="product-table"><thead><tr><th><input type="checkbox" id="select-all" aria-label="انتخاب همه نتایج" ${selected.size===list.length?'checked':''}></th><th>محصول</th><th>دسته‌بندی</th><th>قیمت</th><th>موجودی</th><th>وضعیت</th><th><span class="unset">ویرایش</span></th></tr></thead><tbody>${list.map(p=>`<tr><td><input type="checkbox" data-select="${p.id}" aria-label="انتخاب ${esc(p.name)}" ${selected.has(p.id)?'checked':''}></td><td><button class="product-cell" data-edit="${p.id}"><span class="thumb">${H.photo(p)}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.sku || p.id)}</small></span></button></td><td class="category-cell">${H.kinds[p.kind]}</td><td class="price-cell">${price(p)}</td><td>${p.stock===null?'<span class="unset">ثبت نشده</span>':`<span class="stock-value ${p.stock<3?'low':''}"><i class="dot ${p.stock<3?'amber':'green'}"></i>${num(p.stock)} <small>عدد</small></span>`}</td><td>${badge(p)}</td><td><button class="edit-button" data-edit="${p.id}" aria-label="ویرایش ${esc(p.name)}">${icon('edit')}</button></td></tr>`).join('')}</tbody></table></div>`;
      const selectAll = $('#select-all'); selectAll.indeterminate = selected.size>0 && selected.size<list.length;
      selectAll.onchange = () => { selected = selectAll.checked ? new Set(list.map(p=>p.id)) : new Set(); render(); };
    }
  }
  function resetFilters() { statusFilter='all'; inventoryOnly=false; $('#search').value=''; $('#kind-filter').value='all'; $('#collection-filter').value='all'; selected.clear(); render(); }
  function ask(title, copy, accept='ادامه') {
    $('#confirm-title').textContent=title; $('#confirm-copy').textContent=copy; $('#confirm-yes').textContent=accept;
    $('#confirm-dialog').showModal();
    return new Promise(resolve => {
      const dialog=$('#confirm-dialog');
      function done(value) { dialog.oncancel=null; $('#confirm-no').onclick=null; $('#confirm-yes').onclick=null; dialog.close(); resolve(value); }
      $('#confirm-yes').onclick=()=>done(true); $('#confirm-no').onclick=()=>done(false); dialog.oncancel=e=>{e.preventDefault();done(false);};
    });
  }
  function readEditor() {
    const f = new FormData($('#product-form')), existing = catalog.products.find(p=>p.id===editingId);
    const sizes=f.getAll('size'), sizeStock=Object.fromEntries(sizes.map(s=>{const value=f.get('stock-'+s);return [s,value===null||value===''?null:Number(value)];}));
    const days=key=>{const value=f.get(key);return value===null||value===''?null:Number(value);};
    return {
      id:editingId || 'product-'+crypto.randomUUID(), sku:existing?.sku||String(f.get('sku')||'').trim(), name:String(f.get('name')).trim(),
      kind:f.get('kind'), type:String(f.get('type')).trim(), story:existing?.story||'iran', collection:String(f.get('collection')||''), tag:String(f.get('tag')).trim(),
      ...(existing?.thumbnail&&editingImage===existing.image?{thumbnail:existing.thumbnail}:{}),
      photo:Number($('#sample-photo').value), image:editingImage, images:editingImages.slice(), colors:String(f.get('colors')).split(/[,،]/).map(s=>s.trim()).filter(Boolean),
      description:String(f.get('description')).trim(), price:f.get('price')===''?null:Number(f.get('price')),
      stock:Object.values(sizeStock).every(n=>n!==null)?Object.values(sizeStock).reduce((a,b)=>a+b,0):null,
      sizeStock, madeToOrder:f.get('madeToOrder')==='on', productionDays:days('productionDays'), dispatchDays:days('dispatchDays'),
      narrative:{text:String(f.get('narrativeText')||'').trim(),quote:String(f.get('narrativeQuote')||'').trim(),verse:String(f.get('narrativeVerse')||'').trim()},
      details:{...Object.fromEntries(Object.keys(H.detailFields).map(key=>[key,String(f.get(key)||'').trim()])),embroideryHours:days('embroideryHours'),lengthCm:days('lengthCm'),sizeNotes:Object.fromEntries(sizes.map(size=>[size,String(f.get('fit-'+size)||'').trim()]))},
      sizes, status:f.get('status'), createdAt:existing?.createdAt||existing?.updatedAt||'', updatedAt:existing?.updatedAt || ''
    };
  }
  function editorFingerprint() { const p=readEditor(); delete p.id; return JSON.stringify(p); }
  function updatePreview() {
    const p=readEditor(); $('#preview-name').textContent=p.name||'نام محصول شما'; $('#preview-type').textContent=p.type||'جنس و هنر دوخت';
    $('#stock').value=p.stock??'';
    $('#preview-price').textContent=p.price===null?'قیمت تعیین نشده':num(p.price)+' تومان';
    $('#save-product').innerHTML=(p.status==='published'?'ذخیره و ادامه انتشار':'ذخیره محصول')+' '+icon('check');
    $('#editor-photo').innerHTML=H.photo({...p,name:p.name||'پیش‌نمایش محصول'});
  }
  function openEditor(id) {
    if (!catalog || publishing) return;
    const p=catalog.products.find(p=>p.id===id) || {name:'',sku:'',kind:'vest',type:'',story:'iran',collection:'',tag:'',description:'',price:null,stock:null,sizes:['M'],colors:[],status:'draft',photo:0,image:''};
    editingId=id||null; editingImage=p.image; editingImages=H.images(p).slice();
    $('#product-form').reset(); $('#product-form').classList.remove('was-validated'); $('#editor-title').textContent=id?'ویرایش '+p.name:'محصول جدید';
    for (const field of ['name','sku','kind','type','collection','tag','description','price','stock','status']) $('#'+field).value=p[field]??'';
    $('#sku').value=p.sku||H.nextSku(catalog.products);$('#sku').readOnly=true;
    const content=H.contentOf(p);for(const key of Object.keys(H.detailFields))$('#'+key).value=content.details[key];
    $('#embroideryHours').value=content.details.embroideryHours??'';$('#lengthCm').value=content.details.lengthCm??'';
    for(const [field,key] of [['narrativeText','text'],['narrativeQuote','quote'],['narrativeVerse','verse']])$('#'+field).value=content.narrative[key];
    $('#colors').value=p.colors.join(', '); $('#sample-photo').value=p.photo; $('#image-url').value='';
    document.querySelectorAll('[name=size]').forEach(i=>i.checked=p.sizes.includes(i.value));
    $('#madeToOrder').checked=!!p.madeToOrder; $('#productionDays').value=p.productionDays??''; $('#dispatchDays').value=p.dispatchDays??'';
    renderSizeStock(p.sizeStock||{});renderSizeNotes(content.details.sizeNotes);
    $('#form-error').textContent=''; $('#gallery-status').textContent=''; $('#image-file').value=''; renderGallery(); updatePreview(); editorSnapshot=editorFingerprint(); $('#editor').showModal();
  }
  async function closeEditor() {
    if (uploading) return toast('لطفا تا پایان آماده‌سازی تصویر صبر کنید.');
    if (editorFingerprint()!==editorSnapshot && !await ask('بستن بدون ذخیره؟','تغییرهای این محصول هنوز ذخیره نشده‌اند.','بستن ویرایشگر')) return;
    $('#editor').close();
  }
  $('#product-form').addEventListener('input', updatePreview);
  function renderSizeNotes(values){
    const sizes=[...document.querySelectorAll('[name=size]:checked')].map(i=>i.value);
    $('#size-notes').innerHTML=sizes.map(size=>`<div class="field"><label for="fit-${esc(size)}">راهنمای ${esc(H.sizeLabel(size))}</label><input id="fit-${esc(size)}" name="fit-${esc(size)}" maxlength="300" value="${esc(values[size]||'')}" placeholder="مثلا مناسب تا سایز ۴۴"></div>`).join('');
  }
  function renderSizeStock(values) {
    const sizes=[...document.querySelectorAll('[name=size]:checked')].map(i=>i.value);
    $('#size-stock').innerHTML=sizes.map(size=>`<label class="size-stock-row"><span dir="ltr">${esc(H.sizeLabel(size))}</span><input name="stock-${esc(size)}" aria-label="موجودی آماده سایز ${esc(size)}" type="number" min="0" max="1000000" step="1" value="${values[size]??''}" placeholder="نامشخص"></label>`).join('');
  }
  document.querySelectorAll('[name=size]').forEach(input=>input.addEventListener('change',()=>{const values=Object.fromEntries([...document.querySelectorAll('#size-stock input')].map(i=>[i.name.slice(6),i.value]));const notes=Object.fromEntries([...document.querySelectorAll('#size-notes input')].map(i=>[i.name.slice(4),i.value]));renderSizeStock(values);renderSizeNotes(notes);updatePreview();}));
  $('#product-form').onsubmit=e=>{
    e.preventDefault(); if(uploading){formError('عکس‌ها هنوز در حال آماده سازی هستند. کمی صبر کنید.');return;} $('#form-error').textContent='';
    $('#product-form').classList.add('was-validated');
    try {
      if($('#product-form').checkValidity&&!$('#product-form').checkValidity()){
        const invalid=$('#product-form').querySelector(':invalid');const details=invalid?.closest('details');if(details)details.open=true;
        const label=invalid?.labels?.[0]?.textContent.replace(/\*/g,'').trim()||'فیلد مشخص شده';
        formError(invalid?.validity.valueMissing?label+' را وارد کنید.':'مقدار «'+label+'» معتبر نیست. عدد و محدوده مجاز آن را بررسی کنید.');invalid?.focus();return;
      }
      if($('#image-url').value.trim()&&!appendImageUrl())return;
      const p=readEditor(); p.updatedAt=new Date().toISOString();p.createdAt=p.createdAt||p.updatedAt;
      if(!editingId||!p.sku){p.sku=H.nextSku(catalog.products);$('#sku').value=p.sku;}
      if (p.sku && catalog.products.some(x=>x.id!==p.id && H.normalize(x.sku)===H.normalize(p.sku))) throw Error('این کد قبلا برای محصول دیگری ثبت شده است.');
      const next=clone(catalog), index=next.products.findIndex(x=>x.id===p.id);
      if(index<0)next.products.unshift(p);else next.products[index]=p;
      H.validate(next); catalog=next; publishedMessage=''; const persisted=saveLocal(); render(); $('#editor').close(); toast(persisted?'محصول ذخیره شد. برای به‌روزرسانی سایت، تغییرها را منتشر کنید.':'ذخیره در مرورگر ممکن نشد. پیش از بستن این صفحه نسخه پشتیبان دریافت کنید.');
      if(p.status==='published')$('#open-publish').onclick();
    } catch(error) { formError(error.message); }
  };
  function appendImageUrl(){
    const value=$('#image-url').value.trim();
    if(!value)return true;
    if(!H.safeImage(value)||!value.startsWith('https://')){formError('لینک تصویر باید با https:// شروع شود.');return false;}
    if(editingImages.includes(value)){$('#image-url').value='';return true;}
    if(editingImages.length>=12){formError('هر محصول حداکثر ۱۲ عکس دارد. ابتدا یکی از عکس‌ها را حذف کنید.');return false;}
    $('#form-error').textContent='';setGallery([...editingImages,value]);$('#image-url').value='';return true;
  }
  $('#add-image-url').onclick=()=>{if(!uploading)appendImageUrl();};
  $('#image-url').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!uploading)appendImageUrl();}});
  $('#gallery-preview').addEventListener('click',e=>{
    if(uploading)return;
    const remove=e.target.closest('[data-gallery-remove]'),cover=e.target.closest('[data-gallery-cover]');
    if(remove){const index=Number(remove.dataset.galleryRemove);setGallery(editingImages.filter((_,i)=>i!==index));}
    else if(cover){const index=Number(cover.dataset.galleryCover);if(editingImages[index])setGallery([editingImages[index],...editingImages.filter((_,i)=>i!==index)]);}
  });
  $('#remove-image').onclick=async()=>{if(!uploading&&await ask('استفاده از تصویر نمونه؟','همه عکس‌های این ویرایش از محصول کنار گذاشته می‌شوند.','استفاده از نمونه')){setGallery([]);$('#image-url').value='';$('#image-file').value='';}};
  $('#sample-photo').onchange=updatePreview;
  async function encodeImage(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('«'+file.name+'»: یک تصویر JPG، PNG یا WEBP کوچک‌تر از ۱۰ مگابایت انتخاب کنید.');
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();image.src=url;await image.decode();
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      for(const dimension of [1000,800,640,480]){
        const scale=Math.min(1,dimension/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
        for(const quality of [.82,.68,.54]){const encoded=canvas.toDataURL('image/webp',quality);if(encoded.length<=60000)return encoded;}
      }
      throw Error('«'+file.name+'»: حجم تصویر هنوز زیاد است. عکس کوچک‌تری انتخاب کنید یا لینک آن را وارد کنید.');
    }finally{URL.revokeObjectURL(url);}
  }
  $('#image-file').onchange=async()=>{
    const files=Array.from($('#image-file').files||[]);if(!files.length||uploading)return;
    uploading=true;$('#save-product').disabled=true;$('#image-file').disabled=true;$('#add-image-url').disabled=true;$('#image-url').disabled=true;$('#remove-image').disabled=true;$('#form-error').textContent='';renderGallery();
    try {
      if(editingImages.length+files.length>12)throw Error('هر محصول حداکثر ۱۲ عکس دارد. اکنون '+num(editingImages.length)+' عکس ثبت شده است.');
      const added=[];
      for(const [index,file] of files.entries()){$('#gallery-status').textContent='در حال آماده سازی عکس '+num(index+1)+' از '+num(files.length)+'…';added.push(await encodeImage(file));}
      const next=[...new Set([...editingImages,...added])];
      const candidate=readEditor();candidate.image=next[0]||'';candidate.images=next;delete candidate.thumbnail;
      const current=clone(catalog);current.products=current.products.filter(p=>p.id!==editingId);current.products.push(candidate);
      if(new TextEncoder().encode(JSON.stringify(current)).length>900000)throw Error('فضای کاتالوگ برای این تعداد عکس کافی نیست. از لینک تصاویر استفاده کنید یا تعداد عکس‌ها را کاهش دهید. عکس‌های قبلی حفظ شدند.');
      setGallery(next);$('#gallery-status').textContent=num(added.length)+' عکس آماده و به گالری اضافه شد.';
    } catch(error) { $('#gallery-status').textContent='افزودن عکس انجام نشد؛ عکس‌های قبلی حفظ شدند.';formError(error.message); }
    finally { uploading=false;$('#save-product').disabled=false;$('#image-file').disabled=false;$('#image-file').value='';$('#add-image-url').disabled=false;$('#image-url').disabled=false;$('#remove-image').disabled=false;renderGallery(); }
  };
  document.addEventListener('click',async e=>{
    const edit=e.target.closest('[data-edit]'); if(edit)openEditor(edit.dataset.edit);
    const close=e.target.closest('[data-close]'); if(close){ const id=close.dataset.close; if(id==='editor')await closeEditor();else if(!publishing)$('#'+id).close(); }
    const bulk=e.target.closest('[data-bulk]');
    if(bulk && !publishing){ const state=bulk.dataset.bulk; if(!await ask('تغییر وضعیت محصولات',`وضعیت ${num(selected.size)} محصول به «${state==='published'?'آماده انتشار':H.statuses[state]}» تغییر کند؟`,'ذخیره وضعیت'))return;
      catalog.products.forEach(p=>{if(selected.has(p.id)){p.status=state;p.updatedAt=new Date().toISOString();}}); selected.clear(); const persisted=saveLocal(); render(); toast(persisted?'وضعیت محصولات ذخیره شد. تغییرها هنوز منتشر نشده‌اند.':'ذخیره در مرورگر ممکن نشد. پیش از بستن صفحه نسخه پشتیبان بگیرید.');if(state==='published')$('#open-publish').onclick(); }
  });
  document.addEventListener('change', e=>{ if(e.target.matches('[data-select]')){ if(e.target.checked)selected.add(e.target.dataset.select);else selected.delete(e.target.dataset.select); render(); } });
  $('#editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
  $('#publish-dialog').addEventListener('cancel',e=>{ if(publishing)e.preventDefault(); });
  $('#add-product').onclick=()=>openEditor(); $('#side-add').onclick=()=>openEditor();
  $('#search').oninput=render; $('#kind-filter').onchange=render; $('#collection-filter').onchange=render; $('#sort').onchange=render;
  document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{statusFilter=b.dataset.status;inventoryOnly=false;selected.clear();render();});
  $('.tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-status]')];let i=tabs.indexOf(document.activeElement);i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowLeft'?1:-1)+tabs.length)%tabs.length;tabs[i].click();tabs[i].focus();});
  $('#nav-inventory').onclick=()=>{resetFilters();inventoryOnly=true;render();}; $('#nav-drafts').onclick=()=>{resetFilters();statusFilter='draft';render();};
  $('#nav-products').onclick=resetFilters;
  $('#table-view').onclick=()=>setView('table'); $('#grid-view').onclick=()=>setView('grid');
  function setView(next){view=next;selected.clear();for(const v of ['table','grid']){$('#'+v+'-view').classList.toggle('selected',v===view);$('#'+v+'-view').setAttribute('aria-pressed',String(v===view));}render();}
  $('#clear-selection').onclick=()=>{selected.clear();render();};
  $('#export').onclick=()=>{
    if(!catalog)return; const url=URL.createObjectURL(new Blob([JSON.stringify(catalog,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hooya-products-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('نسخه پشتیبان دریافت شد.');
  };
  $('#import').onclick=()=>{if(catalog&&!publishing)$('#import-file').click();};
  $('#import-file').onchange=async()=>{
    const file=$('#import-file').files[0];if(!file)return;
    try { if(file.size>900000)throw Error('فایل باید کوچک‌تر از ۹۰۰ کیلوبایت باشد.');const imported=H.validate(JSON.parse(await file.text()));
      if(!await ask('بازیابی کاتالوگ',`فهرست فعلی با ${num(imported.products.length)} محصول فایل جایگزین می‌شود. این تغییر تا انتشار، روی سایت اعمال نمی‌شود.`,'بازیابی فایل'))return;
      catalog={...clone(imported),version:baseline.version};const persisted=saveLocal();resetFilters();toast(persisted?'فایل بازیابی شد. تغییرها را بررسی و منتشر کنید.':'ذخیره در مرورگر ممکن نشد. پیش از بستن صفحه نسخه پشتیبان بگیرید.');
    } catch(error){toast(error.message);} finally{$('#import-file').value='';}
  };
  $('#open-publish').onclick=()=>{
    $('#publish-summary').innerHTML=`<div class="change-list">${changes().map(c=>`<div><strong>${esc(c.product.name)}</strong><span>${esc(c.label)} · ${c.product.status==='published'?'نمایش در سایت':H.statuses[c.product.status]}</span></div>`).join('')}</div>`;
    $('#publish-error').textContent='';$('#publish-login').hidden=true;$('#publish-dialog').showModal();
  };
  async function confirmWebsiteVersion(expected,attempt=0){
    if(baseline.version!==expected)return;
    try{
      const response=await fetch('../products.json?v='+encodeURIComponent(expected),{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(response.ok){const live=H.validate(await response.json());if(baseline.version!==expected)return;if(live.version===expected){websiteCatalog=live;deploymentPending=false;publishedMessage='انتشار این تغییرها در سایت تایید شد.';render();toast('انتشار در سایت تایید شد.');return;}}
    }catch{}
    if(attempt<29)setTimeout(()=>confirmWebsiteVersion(expected,attempt+1),3000);
    else{publishedMessage='ارسال انجام شده، اما انتشار در سایت هنوز تایید نشده است. کمی بعد صفحه را دوباره باز کنید.';render();}
  }
  $('#publish-form').onsubmit=async e=>{
    e.preventDefault();if(publishing)return;publishing=true;$('#publish-submit').disabled=true;$('#publish-error').textContent='';
    try {
      H.validate(catalog);
      const response=await fetch(API,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':$('#admin-csrf').value},body:JSON.stringify({catalog,baseVersion:baseline.version}),signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok){if(response.status===401)$('#publish-login').hidden=false;throw Error(result.error||'ارسال انجام نشد. تغییرهای محلی شما محفوظ است.');}
      const next=H.validate(result.catalog);websiteCatalog=H.validate(result.liveCatalog);catalog=next;baseline=clone(next);saveLocal();deploymentPending=result.status!=='live';publishedMessage=deploymentPending?'تغییرها روی سرور ذخیره شدند؛ نمایش آن‌ها در سایت در حال بررسی است.':'انتشار این تغییرها در سایت تایید شد.';render();$('#publish-dialog').close();toast(deploymentPending?'تغییرها ثبت شدند. منتظر تایید انتشار روی سایت باشید.':'انتشار در سایت تایید شد.');if(deploymentPending)confirmWebsiteVersion(next.version);
    }catch(error){$('#publish-error').textContent=error.message||'ارتباط برقرار نشد. اتصال اینترنت را بررسی کنید.';}
    finally{publishing=false;$('#publish-submit').disabled=false;}
  };
  window.addEventListener('beforeunload',e=>{if(publishing || ($('#editor').open&&editorFingerprint()!==editorSnapshot)){e.preventDefault();e.returnValue='';}});
  async function boot() {
    $('#today').textContent=new Intl.DateTimeFormat('fa-IR',{dateStyle:'long',timeZone:'Asia/Tehran'}).format(new Date());
    try {
      let saved;try{const raw=localStorage.getItem(STORAGE);if(raw){saved=JSON.parse(raw);H.validate(saved.catalog);H.validate(saved.baseline);}}catch{saved=null;}
      let snapshot;try{snapshot=H.validate(JSON.parse($('#admin-catalog-snapshot')?.textContent||'null'));}catch{}
      const restore=(target,live=target,authoritative=false)=>{
        websiteCatalog=live;
        const working=catalog?{catalog,baseline}:saved;
        if(working&&target&&sameProducts(working.catalog,target)){catalog=clone(target);baseline=clone(target);saveLocal();}
        else if(working&&!sameProducts(working.catalog,working.baseline)){
          catalog=working.catalog;baseline=working.baseline;
          if(target&&JSON.stringify(target)!==JSON.stringify(baseline))toast('محصولات روی سیستم دیگری تغییر کرده‌اند. تغییرهای محلی شما حفظ شده‌اند؛ پیش از ارسال نسخه‌ها را بررسی کنید.');
        }else if(working&&!authoritative&&(!target||new Date(working.baseline.version)>new Date(target.version))){catalog=working.catalog;baseline=working.baseline;}
        else{catalog=clone(target);baseline=clone(target);}
        deploymentPending=!!live&&!sameProducts(baseline,live)&&new Date(baseline.version)>new Date(live.version);
        render();
      };
      if(snapshot||saved)restore(snapshot||saved.baseline);
      const read=async(url,privateData=false)=>{const response=await fetch(url,{cache:'no-store',credentials:privateData?'same-origin':'omit',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();const data=await response.json();return privateData?{catalog:H.validate(data.catalog),liveCatalog:H.validate(data.liveCatalog)}:H.validate(data);};
      const [serverResult,liveResult]=await Promise.allSettled([read(API,true),read('../products.json')]);
      const live=liveResult.status==='fulfilled'?liveResult.value:serverResult.status==='fulfilled'?serverResult.value.liveCatalog:websiteCatalog||snapshot;
      if(serverResult.status==='fulfilled')restore(serverResult.value.catalog,live,true);
      else if(live)restore(live,live);
      else if(!catalog)throw Error('دریافت محصولات ممکن نشد. اتصال اینترنت را بررسی و صفحه را دوباره بارگذاری کنید.');
      if(deploymentPending)confirmWebsiteVersion(baseline.version);
    }catch(error){$('#sync-title').textContent='دریافت کاتالوگ انجام نشد';$('#sync-copy').textContent=error.message;$('#products-region').innerHTML='<div class="error-state"><h3>ارتباط با کاتالوگ برقرار نشد</h3><p>صفحه را دوباره بارگذاری کنید. تغییرهای ذخیره‌شده شما در مرورگر محفوظ‌اند.</p><button class="button secondary" onclick="location.reload()">تلاش دوباره</button></div>';}
  }
  boot();
})();

// Notify the owner while working on products without downloading customer data.
(()=>{
 async function refreshOrderBadge(){
  if(document.hidden)return;
  try{const response=await fetch('/admin/api/order-counts',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(5000)});if(!response.ok)return;const {unread}=await response.json();if(!Number.isSafeInteger(unread))return;
   for(const id of ['nav-orders','top-orders']){const link=document.getElementById(id);if(link)link.textContent=unread?'سفارش ها · '+new Intl.NumberFormat('fa-IR').format(unread)+' تازه':'سفارش ها';}
  }catch{}
 }
 refreshOrderBadge();setInterval(refreshOrderBadge,30000);
})();
