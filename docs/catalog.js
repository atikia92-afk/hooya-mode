/* Shared product contract for the storefront and the editor. No credentials live here. */
(() => {
  const kinds = {vest:'وست', jacket:'کت', blouse:'شومیز'};
  const stories = {myth:'شاهنامه و اساطیر', horse:'اسب و سوارکاری', folk:'روایت‌های اقوام', iran:'نمادهای ایران'};
  const collections = {'persian-garden':'باغ ایرانی','legendary-women':'زنان افسانه ای','mythical-creatures':'موجودات اساطیری'};
  const collectionOf = p => p.collection || '';
  const statuses = {published:'منتشرشده', draft:'پیش‌نویس', archived:'بایگانی'};
  const sizeLabels = {XS:'XS',S:'S',M:'M',L:'L',XL:'XL',XXL:'XXL',Free:'فری سایز','1':'سایز ۱','2':'سایز ۲'};
  const sizeLabel = size => sizeLabels[size] || size;
  const detailFields = {fabric:'جنس پارچه',technique:'تکنیک دوخت',embroideryMaterials:'متریال گلدوزی',lining:'آستر',finishing:'جزئیات تکمیل',fit:'تن خور',customization:'امکان سفارش سازی',care:'راهنمای نگهداری'};
  const contentOf = p => ({narrative:{text:'',quote:'',verse:'',...p.narrative},details:{...Object.fromEntries(Object.keys(detailFields).map(key=>[key,''])),embroideryHours:null,lengthCm:null,...p.details,sizeNotes:{...p.details?.sizeNotes}}});
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value).replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u200c]/g,'').toLowerCase();
  const number = value => new Intl.NumberFormat('fa-IR').format(value);
  const localImage = value => typeof value === 'string' && /^assets\/products\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i.test(value);
  const safeImage = value => typeof value === 'string' && (value === '' || localImage(value) || /^https:\/\/[^\s<>"']+$/i.test(value) || /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value));
  const scriptUrl = typeof document === 'undefined' ? '' : document.currentScript?.src || '';
  const assetBase = scriptUrl ? new URL('.',scriptUrl).href : '';
  const imageUrl = value => localImage(value) && assetBase ? new URL(value,assetBase).href : value;
  const images = p => Array.isArray(p.images) && p.images.length ? p.images : p.image ? [p.image] : [];
  function validate(catalog) {
    if (!catalog || catalog.schema !== 1 || typeof catalog.version !== 'string' || !Number.isFinite(Date.parse(catalog.version)) || !Array.isArray(catalog.products) || catalog.products.length > 250) throw Error('ساختار فایل محصولات معتبر نیست (حداکثر ۲۵۰ محصول).');
    const ids = new Set();
    for (const p of catalog.products) {
      if (!p || typeof p.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(p.id) || ids.has(p.id)) throw Error('شناسه محصول نامعتبر یا تکراری است.');
      ids.add(p.id);
      for (const key of ['name','type','tag','description','sku']) if (typeof p[key] !== 'string' || p[key].length > (key === 'description' ? 3000 : 160)) throw Error('متن مشخصات محصول معتبر نیست.');
      if (!p.name.trim() || !Object.hasOwn(kinds,p.kind) || !Object.hasOwn(stories,p.story) || !Object.hasOwn(statuses,p.status)) throw Error('نام، دسته، روایت یا وضعیت محصول معتبر نیست.');
      if (p.collection !== undefined && (typeof p.collection !== 'string' || (p.collection !== '' && !Object.hasOwn(collections,p.collection)))) throw Error('کالکشن محصول معتبر نیست.');
      if (p.status === 'published' && p.collection === '') throw Error('برای انتشار، کالکشن محصول را انتخاب کنید.');
      if (!safeImage(p.image) || (p.thumbnail!==undefined&&!safeImage(p.thumbnail)) || ![0,1,2].includes(p.photo)) throw Error('تصویر محصول معتبر نیست.');
      if (p.images !== undefined && (!Array.isArray(p.images) || p.images.length > 12 || p.images.some(src => !src || !safeImage(src)) || (p.images.length && p.images[0] !== p.image))) throw Error('گالری تصاویر محصول معتبر نیست.');
      for (const key of ['price','stock']) if (p[key] !== null && (!Number.isSafeInteger(p[key]) || p[key] < 0 || p[key] > (key === 'stock' ? 1000000 : 1000000000000))) throw Error('قیمت یا موجودی معتبر نیست.');
      if (!Array.isArray(p.sizes) || !p.sizes.length || new Set(p.sizes).size!==p.sizes.length || p.sizes.some(s => typeof s!=='string'||!Object.hasOwn(sizeLabels,s))) throw Error('حداقل یک اندازه معتبر انتخاب کنید.');
      const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
      if(p.narrative!==undefined){
        if(!object(p.narrative)||Object.keys(p.narrative).some(key=>!['text','quote','verse'].includes(key)))throw Error('ساختار قصه لباس معتبر نیست.');
        for(const [key,value] of Object.entries(p.narrative))if(typeof value!=='string'||value.length>(key==='text'?8000:key==='verse'?2000:800))throw Error('متن قصه لباس معتبر نیست.');
      }
      if(p.details!==undefined){
        if(!object(p.details)||Object.keys(p.details).some(key=>!Object.hasOwn(detailFields,key)&&!['embroideryHours','lengthCm','sizeNotes'].includes(key)))throw Error('ساختار جزئیات لباس معتبر نیست.');
        for(const key of Object.keys(detailFields))if(p.details[key]!==undefined&&(typeof p.details[key]!=='string'||p.details[key].length>1500))throw Error('متن جزئیات لباس معتبر نیست.');
        for(const [key,max] of [['embroideryHours',10000],['lengthCm',300]]){const value=p.details[key];if(value!==undefined&&value!==null&&(!Number.isFinite(value)||value<=0||value>max))throw Error('زمان هنر دست یا قد لباس معتبر نیست.');}
        if(p.details.sizeNotes!==undefined&&(!object(p.details.sizeNotes)||Object.entries(p.details.sizeNotes).some(([size,note])=>!p.sizes.includes(size)||typeof note!=='string'||note.length>300)))throw Error('راهنمای سایز باید با اندازه های محصول هماهنگ باشد.');
      }
      if (p.sizeStock !== undefined) {
        if (!p.sizeStock || Array.isArray(p.sizeStock) || typeof p.sizeStock !== 'object' || Object.keys(p.sizeStock).length !== p.sizes.length || p.sizes.some(s=>!Object.hasOwn(p.sizeStock,s)) || Object.keys(p.sizeStock).some(s=>!p.sizes.includes(s))) throw Error('موجودی باید برای هر سایز انتخاب شده مشخص شود.');
        const counts=Object.values(p.sizeStock);
        if (counts.some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0||n>1000000))) throw Error('موجودی هر سایز باید عدد صحیح و نامنفی باشد.');
        const total=counts.every(n=>n!==null)?counts.reduce((a,b)=>a+b,0):null;
        if (p.stock!==total) throw Error('موجودی کل با موجودی سایزها یکسان نیست.');
      }
      if (p.madeToOrder !== undefined && typeof p.madeToOrder !== 'boolean') throw Error('وضعیت دوخت سفارشی معتبر نیست.');
      for (const key of ['productionDays','dispatchDays']) if (p[key]!==undefined && p[key]!==null && (!Number.isSafeInteger(p[key])||p[key]<1||p[key]>365)) throw Error('زمان آماده سازی باید از ۱ تا ۳۶۵ روز کاری باشد.');
      if (!Array.isArray(p.colors) || p.colors.length > 8 || p.colors.some(c => !/^#[a-f0-9]{6}$/i.test(c))) throw Error('کد رنگ معتبر نیست.');
      if (p.createdAt!==undefined && (typeof p.createdAt!=='string'||!Number.isFinite(Date.parse(p.createdAt)))) throw Error('تاریخ ایجاد محصول معتبر نیست.');
      if (typeof p.updatedAt !== 'string' || !Number.isFinite(Date.parse(p.updatedAt))) throw Error('تاریخ محصول معتبر نیست.');
    }
    if (new TextEncoder().encode(JSON.stringify(catalog)).length > 900000) throw Error('حجم کاتالوگ زیاد است. برای عکس‌ها از لینک تصویر استفاده کنید یا تعداد تصاویر را کاهش دهید.');
    return catalog;
  }
  async function loadCatalog(){
    const urls=['https://api.hooyamode.ir/v1/catalog',assetBase?new URL('products.json',assetBase).href:'products.json'];
    for(const url of urls){
      try{const response=await fetch(url,{cache:'no-cache',credentials:'omit',signal:AbortSignal.timeout(6000)});if(!response.ok)throw Error('catalog');return validate(await response.json());}catch{}
    }
    throw Error('دریافت مجموعه ممکن نشد.');
  }
  const latest=(products,count=3)=>[...products].sort((a,b)=>(b.createdAt||b.updatedAt).localeCompare(a.createdAt||a.updatedAt)||b.sku.localeCompare(a.sku,'en',{numeric:true})).slice(0,count);
  function photo(p, extra = '') {
    const photoSource=!extra.includes('full-photo')&&p.thumbnail&&safeImage(p.thumbnail)?p.thumbnail:p.image;
    return photoSource && safeImage(photoSource) ? `<img class="product-photo custom-photo ${extra}" src="${escape(imageUrl(photoSource))}" alt="${escape(p.name)}" loading="lazy">` : `<div class="product-photo photo-${p.photo} ${extra}" role="img" aria-label="${escape(p.name)}"></div>`;
  }
  window.Hooya = {sizeLabels,sizeLabel,detailFields,contentOf,latest,kinds, stories, collections, collectionOf, statuses, escape, normalize, number, safeImage, imageUrl, images, validate,loadCatalog, photo};
})();
