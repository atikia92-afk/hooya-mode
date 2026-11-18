'use strict';
(() => {
  const H = window.Hooya, $ = s => document.querySelector(s), esc = H.escape, num = H.number;
  const STORAGE = 'hooya-catalog-workspace-v1';
  const API = 'https://api.github.com/repos/atikia92-afk/hooya-mode/contents/docs/products.json';
  let catalog, baseline, statusFilter = 'all', inventoryOnly = false, view = 'table', selected = new Set(), toastTimer;
  let editingId = null, editingImage = '', editorSnapshot = '', uploading = false, publishing = false, publishedMessage = '';
  const clone = value => JSON.parse(JSON.stringify(value));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const lowStock = p => p.status !== 'archived' && (p.stock === null || p.stock < 3);
  const price = p => p.price === null ? '<span class="unset">تعیین نشده</span>' : `${num(p.price)} <small>تومان</small>`;
  const badge = p => `<span class="badge ${esc(p.status)}"><i class="dot"></i>${H.statuses[p.status]}</span>`;
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
    catch { toast('فضای ذخیرهٔ مرورگر کافی نیست. نسخهٔ پشتیبان دریافت کنید و حجم تصاویر را کاهش دهید.'); return false; }
  }
  function filtered() {
    const term = H.normalize($('#search').value.trim()), kind = $('#kind-filter').value;
    const list = catalog.products.filter(p => (statusFilter === 'all' || p.status === statusFilter) && (!inventoryOnly || lowStock(p)) && (kind === 'all' || p.kind === kind) && (!term || H.normalize(p.name+' '+p.sku+' '+p.type).includes(term)));
    const sort = $('#sort').value;
    list.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name,'fa') : sort === 'price' ? (a.price ?? Infinity)-(b.price ?? Infinity) : b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }
  function render() {
    if (!catalog) return;
    const all = catalog.products, list = filtered(), pending = changes().length;
    $('#stat-total').textContent = num(all.length); $('#stat-published').textContent = num(all.filter(p=>p.status==='published').length);
    $('#stat-drafts').textContent = num(all.filter(p=>p.status==='draft').length); $('#stat-stock').textContent = num(all.filter(lowStock).length);
    $('#nav-count').textContent = num(all.length); $('#catalog-count').textContent = num(all.length)+' محصول'; $('#tab-total').textContent = num(all.length);
    $('#sync-title').textContent = pending ? num(pending)+' محصول با تغییرهای منتشرنشده' : publishedMessage ? 'تغییرها به سایت ارسال شد' : 'کاتالوگ شما به‌روز است';
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
      $('#products-region').innerHTML = `<div class="empty-state">${icon('bag')}<h3>${all.length?'محصولی با این فیلتر پیدا نشد':'قصهٔ اولین محصول را شروع کنید'}</h3><p>${all.length?'جست‌وجو یا فیلترها را تغییر دهید.':'نام، تصویر و مشخصات محصول را وارد کنید.'}</p><button class="button secondary" id="empty-action">${all.length?'پاک کردن فیلترها':'افزودن محصول'}</button></div>`;
      $('#empty-action').onclick = () => all.length ? resetFilters() : openEditor();
      return;
    }
    if (view === 'grid') {
      $('#products-region').innerHTML = `<div class="cards">${list.map(p=>`<article class="catalog-card"><div class="card-image">${H.photo(p)}${badge(p)}</div><div class="card-copy"><h3>${esc(p.name)}</h3><p>${esc(p.type || H.kinds[p.kind])}</p><div><span>${price(p)}</span><button data-edit="${p.id}">ویرایش ←</button></div></div></article>`).join('')}</div>`;
    } else {
      $('#products-region').innerHTML = `<div class="product-table-wrap"><table class="product-table"><thead><tr><th><input type="checkbox" id="select-all" aria-label="انتخاب همهٔ نتایج" ${selected.size===list.length?'checked':''}></th><th>محصول</th><th>دسته‌بندی</th><th>قیمت</th><th>موجودی</th><th>وضعیت</th><th><span class="unset">ویرایش</span></th></tr></thead><tbody>${list.map(p=>`<tr><td><input type="checkbox" data-select="${p.id}" aria-label="انتخاب ${esc(p.name)}" ${selected.has(p.id)?'checked':''}></td><td><button class="product-cell" data-edit="${p.id}"><span class="thumb">${H.photo(p)}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.sku || p.id)}</small></span></button></td><td class="category-cell">${H.kinds[p.kind]}</td><td class="price-cell">${price(p)}</td><td>${p.stock===null?'<span class="unset">ثبت نشده</span>':`<span class="stock-value ${p.stock<3?'low':''}"><i class="dot ${p.stock<3?'amber':'green'}"></i>${num(p.stock)} <small>عدد</small></span>`}</td><td>${badge(p)}</td><td><button class="edit-button" data-edit="${p.id}" aria-label="ویرایش ${esc(p.name)}">${icon('edit')}</button></td></tr>`).join('')}</tbody></table></div>`;
      const selectAll = $('#select-all'); selectAll.indeterminate = selected.size>0 && selected.size<list.length;
      selectAll.onchange = () => { selected = selectAll.checked ? new Set(list.map(p=>p.id)) : new Set(); render(); };
    }
  }
  function resetFilters() { statusFilter='all'; inventoryOnly=false; $('#search').value=''; $('#kind-filter').value='all'; selected.clear(); render(); }
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
    return {
      id:editingId || 'product-'+crypto.randomUUID(), sku:String(f.get('sku')).trim(), name:String(f.get('name')).trim(),
      kind:f.get('kind'), type:String(f.get('type')).trim(), story:f.get('story'), tag:String(f.get('tag')).trim(),
      photo:Number($('#sample-photo').value), image:editingImage, colors:String(f.get('colors')).split(/[,،]/).map(s=>s.trim()).filter(Boolean),
      description:String(f.get('description')).trim(), price:f.get('price')===''?null:Number(f.get('price')), stock:f.get('stock')===''?null:Number(f.get('stock')),
      sizes:f.getAll('size'), status:f.get('status'), updatedAt:existing?.updatedAt || ''
    };
  }
  function editorFingerprint() { const p=readEditor(); delete p.id; return JSON.stringify(p); }
  function updatePreview() {
    const p=readEditor(); $('#preview-name').textContent=p.name||'نام محصول شما'; $('#preview-type').textContent=p.type||'جنس و هنر دوخت';
    $('#preview-price').textContent=p.price===null?'قیمت تعیین نشده':num(p.price)+' تومان';
    $('#editor-photo').innerHTML=H.photo({...p,name:p.name||'پیش‌نمایش محصول'});
  }
  function openEditor(id) {
    if (!catalog || publishing) return;
    const p=catalog.products.find(p=>p.id===id) || {name:'',sku:'',kind:'vest',type:'',story:'myth',tag:'',description:'',price:null,stock:null,sizes:['M'],colors:[],status:'draft',photo:0,image:''};
    editingId=id||null; editingImage=p.image;
    $('#product-form').reset(); $('#editor-title').textContent=id?'ویرایش '+p.name:'محصول جدید';
    for (const field of ['name','sku','kind','type','story','tag','description','price','stock','status']) $('#'+field).value=p[field]??'';
    $('#colors').value=p.colors.join(', '); $('#sample-photo').value=p.photo; $('#image-url').value=p.image.startsWith('https://')?p.image:'';
    document.querySelectorAll('[name=size]').forEach(i=>i.checked=p.sizes.includes(i.value));
    $('#form-error').textContent=''; $('#image-file').value=''; updatePreview(); editorSnapshot=editorFingerprint(); $('#editor').showModal();
  }
  async function closeEditor() {
    if (uploading) return toast('لطفاً تا پایان آماده‌سازی تصویر صبر کنید.');
    if (editorFingerprint()!==editorSnapshot && !await ask('بستن بدون ذخیره؟','تغییرهای این محصول هنوز ذخیره نشده‌اند.','بستن ویرایشگر')) return;
    $('#editor').close();
  }
  $('#product-form').addEventListener('input', updatePreview);
  $('#product-form').onsubmit=e=>{
    e.preventDefault(); if(uploading)return; $('#form-error').textContent='';
    try {
      const p=readEditor(); p.updatedAt=new Date().toISOString();
      if (p.sku && catalog.products.some(x=>x.id!==p.id && H.normalize(x.sku)===H.normalize(p.sku))) throw Error('این کد قبلاً برای محصول دیگری ثبت شده است.');
      const next=clone(catalog), index=next.products.findIndex(x=>x.id===p.id);
      if(index<0)next.products.unshift(p);else next.products[index]=p;
      H.validate(next); catalog=next; publishedMessage=''; const persisted=saveLocal(); render(); $('#editor').close(); toast(persisted?'محصول ذخیره شد. برای به‌روزرسانی سایت، تغییرها را منتشر کنید.':'ذخیره در مرورگر ممکن نشد. پیش از بستن این صفحه نسخهٔ پشتیبان دریافت کنید.');
    } catch(error) { $('#form-error').textContent=error.message; }
  };
  $('#image-url').addEventListener('change',()=>{
    const value=$('#image-url').value.trim();
    if(value && (!H.safeImage(value)||!value.startsWith('https://'))) { $('#form-error').textContent='لینک تصویر باید با https:// شروع شود.'; return; }
    editingImage=value; $('#form-error').textContent=''; updatePreview();
  });
  $('#remove-image').onclick=()=>{ editingImage=''; $('#image-url').value=''; $('#image-file').value=''; updatePreview(); };
  $('#sample-photo').onchange=()=>{ editingImage=''; $('#image-url').value=''; updatePreview(); };
  $('#image-file').onchange=async()=>{
    const file=$('#image-file').files[0]; if(!file)return;
    uploading=true; $('#save-product').disabled=true; $('#form-error').textContent='';
    let url;
    try {
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('یک تصویر JPG، PNG یا WEBP کوچک‌تر از ۱۰ مگابایت انتخاب کنید.');
      url=URL.createObjectURL(file); const image=new Image(); image.src=url; await image.decode();
      const scale=Math.min(1,900/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas'); canvas.width=Math.round(image.width*scale); canvas.height=Math.round(image.height*scale);
      const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
      let encoded=canvas.toDataURL('image/webp',.8);
      if(encoded.length>230000)encoded=canvas.toDataURL('image/webp',.55);
      if(encoded.length>300000)throw Error('این تصویر جزئیات زیادی دارد. تصویر کوچک‌تری انتخاب کنید یا لینک آن را وارد کنید.');
      editingImage=encoded; $('#image-url').value=''; updatePreview();
    } catch(error) { $('#form-error').textContent=error.message; }
    finally { if(url)URL.revokeObjectURL(url); uploading=false; $('#save-product').disabled=false; }
  };
  document.addEventListener('click',async e=>{
    const edit=e.target.closest('[data-edit]'); if(edit)openEditor(edit.dataset.edit);
    const close=e.target.closest('[data-close]'); if(close){ const id=close.dataset.close; if(id==='editor')await closeEditor();else if(!publishing){$('#'+id).close();$('#github-token').value='';} }
    const bulk=e.target.closest('[data-bulk]');
    if(bulk && !publishing){ const state=bulk.dataset.bulk; if(!await ask('تغییر وضعیت محصولات',`وضعیت ${num(selected.size)} محصول به «${H.statuses[state]}» تغییر کند؟`,'ذخیرهٔ وضعیت'))return;
      catalog.products.forEach(p=>{if(selected.has(p.id)){p.status=state;p.updatedAt=new Date().toISOString();}}); selected.clear(); const persisted=saveLocal(); render(); toast(persisted?'وضعیت محصولات ذخیره شد. تغییرها هنوز منتشر نشده‌اند.':'ذخیره در مرورگر ممکن نشد. پیش از بستن صفحه نسخهٔ پشتیبان بگیرید.'); }
  });
  document.addEventListener('change', e=>{ if(e.target.matches('[data-select]')){ if(e.target.checked)selected.add(e.target.dataset.select);else selected.delete(e.target.dataset.select); render(); } });
  $('#editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
  $('#publish-dialog').addEventListener('cancel',e=>{ if(publishing)e.preventDefault();else $('#github-token').value=''; });
  $('#add-product').onclick=()=>openEditor(); $('#side-add').onclick=()=>openEditor();
  $('#search').oninput=render; $('#kind-filter').onchange=render; $('#sort').onchange=render;
  document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{statusFilter=b.dataset.status;inventoryOnly=false;selected.clear();render();});
  $('.tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-status]')];let i=tabs.indexOf(document.activeElement);i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowLeft'?1:-1)+tabs.length)%tabs.length;tabs[i].click();tabs[i].focus();});
  $('#nav-inventory').onclick=()=>{resetFilters();inventoryOnly=true;render();}; $('#nav-drafts').onclick=()=>{resetFilters();statusFilter='draft';render();};
  $('#nav-products').onclick=resetFilters;
  $('#table-view').onclick=()=>setView('table'); $('#grid-view').onclick=()=>setView('grid');
  function setView(next){view=next;selected.clear();for(const v of ['table','grid']){$('#'+v+'-view').classList.toggle('selected',v===view);$('#'+v+'-view').setAttribute('aria-pressed',String(v===view));}render();}
  $('#clear-selection').onclick=()=>{selected.clear();render();};
  $('#export').onclick=()=>{
    if(!catalog)return; const url=URL.createObjectURL(new Blob([JSON.stringify(catalog,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hooya-products-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('نسخهٔ پشتیبان دریافت شد.');
  };
  $('#import').onclick=()=>{if(catalog&&!publishing)$('#import-file').click();};
  $('#import-file').onchange=async()=>{
    const file=$('#import-file').files[0];if(!file)return;
    try { if(file.size>900000)throw Error('فایل باید کوچک‌تر از ۹۰۰ کیلوبایت باشد.');const imported=H.validate(JSON.parse(await file.text()));
      if(!await ask('بازیابی کاتالوگ',`فهرست فعلی با ${num(imported.products.length)} محصولِ فایل جایگزین می‌شود. این تغییر تا انتشار، روی سایت اعمال نمی‌شود.`,'بازیابی فایل'))return;
      catalog={...clone(imported),version:baseline.version};const persisted=saveLocal();resetFilters();toast(persisted?'فایل بازیابی شد. تغییرها را بررسی و منتشر کنید.':'ذخیره در مرورگر ممکن نشد. پیش از بستن صفحه نسخهٔ پشتیبان بگیرید.');
    } catch(error){toast(error.message);} finally{$('#import-file').value='';}
  };
  $('#open-publish').onclick=()=>{
    $('#publish-summary').innerHTML=`<div class="change-list">${changes().map(c=>`<div><strong>${esc(c.product.name)}</strong><span>${esc(c.label)} · ${H.statuses[c.product.status]}</span></div>`).join('')}</div>`;
    $('#publish-error').textContent='';$('#github-token').value='';$('#publish-dialog').showModal();
  };
  const encode = value => { const bytes=new TextEncoder().encode(value); let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary); };
  const decode = value => { const binary=atob(value.replace(/\s/g,''));return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0))); };
  async function github(token, method='GET', body) {
    const response=await fetch(API+(method==='GET'?'?ref=main&t='+Date.now():''),{method,cache:'no-store',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok){const code=response.status;throw Error(code===401?'کلید دسترسی معتبر نیست.':code===403?'دسترسی نوشتن برای این مخزن وجود ندارد یا محدودیت GitHub فعال است.':code===409?'محصولات هم‌زمان در جای دیگری تغییر کرده‌اند. دوباره کاتالوگ را دریافت کنید.':code===404?'مخزن یا فایل در دسترس این کلید نیست. دسترسی مخزن hooya-mode را بررسی کنید.':`ارسال به GitHub انجام نشد (کد ${code}). تغییرهای محلی محفوظ‌اند.`);}
    return response.json();
  }
  $('#publish-form').onsubmit=async e=>{
    e.preventDefault();if(publishing)return;publishing=true;$('#publish-submit').disabled=true;$('#publish-error').textContent='';
    const token=$('#github-token').value.trim();$('#github-token').value='';
    try {
      H.validate(catalog);const remote=await github(token);
      if(remote.encoding!=='base64')throw Error('دریافت کاتالوگ از GitHub کامل نشد.');
      const current=H.validate(JSON.parse(decode(remote.content)));
      // Compare full baseline, not just the timestamp: never overwrite another editor silently.
      if(JSON.stringify(current)!==JSON.stringify(baseline))throw Error('کاتالوگ سایت از زمان شروع کار تغییر کرده است. یک پشتیبان بگیرید و با بازکردن داشبورد در مرورگر دیگر، نسخهٔ جدید را بررسی کنید. برای حفظ تغییرها، ارسال متوقف شد.');
      const next=clone(catalog);next.version=new Date().toISOString();
      await github(token,'PUT',{message:'Update Hooya product catalog from dashboard',content:encode(JSON.stringify(next,null,2)+'\n'),sha:remote.sha,branch:'main'});
      catalog=next;baseline=clone(next);saveLocal();publishedMessage='نمایش نسخهٔ جدید در ویترین ممکن است چند دقیقه طول بکشد.';render();$('#publish-dialog').close();toast('تغییرها به مخزن سایت ارسال شد. نسخهٔ جدید به‌زودی در ویترین نمایش داده می‌شود.');
    }catch(error){$('#publish-error').textContent=error.message||'ارتباط برقرار نشد. اتصال اینترنت را بررسی کنید.';}
    finally{publishing=false;$('#publish-submit').disabled=false;}
  };
  window.addEventListener('beforeunload',e=>{if(publishing || ($('#editor').open&&editorFingerprint()!==editorSnapshot)){e.preventDefault();e.returnValue='';}});
  async function boot() {
    $('#today').textContent=new Intl.DateTimeFormat('fa-IR',{dateStyle:'long',timeZone:'Asia/Tehran'}).format(new Date());
    try {
      let saved;try{const raw=localStorage.getItem(STORAGE);if(raw){saved=JSON.parse(raw);H.validate(saved.catalog);H.validate(saved.baseline);}}catch{saved=null;}
      let live;try{const response=await fetch('../products.json',{cache:'no-store'});if(!response.ok)throw Error();live=H.validate(await response.json());}catch{if(!saved)throw Error('دریافت محصولات ممکن نشد. اتصال اینترنت را بررسی و صفحه را دوباره بارگذاری کنید.');}
      if(saved && JSON.stringify(saved.catalog.products)!==JSON.stringify(saved.baseline.products)){
        catalog=saved.catalog;baseline=saved.baseline;
        if(live&&JSON.stringify(live)!==JSON.stringify(baseline))toast('تغییرهای محلی بازیابی شدند. کاتالوگ سایت نیز تغییر کرده؛ پیش از انتشار نسخه‌ها را بررسی کنید.');
      }else if(saved && (!live || new Date(saved.baseline.version)>new Date(live.version))){catalog=saved.catalog;baseline=saved.baseline;}
      else{catalog=clone(live);baseline=clone(live);}
      render();
    }catch(error){$('#sync-title').textContent='دریافت کاتالوگ انجام نشد';$('#sync-copy').textContent=error.message;$('#products-region').innerHTML='<div class="error-state"><h3>ارتباط با کاتالوگ برقرار نشد</h3><p>صفحه را دوباره بارگذاری کنید. تغییرهای ذخیره‌شدهٔ شما در مرورگر محفوظ‌اند.</p><button class="button secondary" onclick="location.reload()">تلاش دوباره</button></div>';}
  }
  boot();
})();
