/* Shared product contract for the storefront and the editor. No credentials live here. */
(() => {
  const kinds = {vest:'وست', jacket:'کت', blouse:'شومیز'};
  const stories = {myth:'شاهنامه و اساطیر', horse:'اسب و سوارکاری', folk:'روایت‌های اقوام', iran:'نمادهای ایران'};
  const statuses = {published:'منتشرشده', draft:'پیش‌نویس', archived:'بایگانی'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value).replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[‌ٔ]/g,'').toLowerCase();
  const number = value => new Intl.NumberFormat('fa-IR').format(value);
  const safeImage = value => typeof value === 'string' && (value === '' || /^https:\/\/[^\s<>"']+$/i.test(value) || /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value));
  function validate(catalog) {
    if (!catalog || catalog.schema !== 1 || typeof catalog.version !== 'string' || !Number.isFinite(Date.parse(catalog.version)) || !Array.isArray(catalog.products) || catalog.products.length > 250) throw Error('ساختار فایل محصولات معتبر نیست (حداکثر ۲۵۰ محصول).');
    const ids = new Set();
    for (const p of catalog.products) {
      if (!p || typeof p.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(p.id) || ids.has(p.id)) throw Error('شناسهٔ محصول نامعتبر یا تکراری است.');
      ids.add(p.id);
      for (const key of ['name','type','tag','description','sku']) if (typeof p[key] !== 'string' || p[key].length > (key === 'description' ? 3000 : 160)) throw Error('متن مشخصات محصول معتبر نیست.');
      if (!p.name.trim() || !Object.hasOwn(kinds,p.kind) || !Object.hasOwn(stories,p.story) || !Object.hasOwn(statuses,p.status)) throw Error('نام، دسته، روایت یا وضعیت محصول معتبر نیست.');
      if (!safeImage(p.image) || ![0,1,2].includes(p.photo)) throw Error('تصویر محصول معتبر نیست.');
      for (const key of ['price','stock']) if (p[key] !== null && (!Number.isSafeInteger(p[key]) || p[key] < 0 || p[key] > (key === 'stock' ? 1000000 : 1000000000000))) throw Error('قیمت یا موجودی معتبر نیست.');
      if (!Array.isArray(p.sizes) || !p.sizes.length || p.sizes.some(s => !['XS','S','M','L','XL','XXL','Free'].includes(s))) throw Error('حداقل یک اندازهٔ معتبر انتخاب کنید.');
      if (!Array.isArray(p.colors) || p.colors.length > 8 || p.colors.some(c => !/^#[a-f0-9]{6}$/i.test(c))) throw Error('کد رنگ معتبر نیست.');
      if (typeof p.updatedAt !== 'string' || !Number.isFinite(Date.parse(p.updatedAt))) throw Error('تاریخ محصول معتبر نیست.');
    }
    if (new TextEncoder().encode(JSON.stringify(catalog)).length > 900000) throw Error('حجم کاتالوگ زیاد است. برای عکس‌ها از لینک تصویر استفاده کنید یا تعداد تصاویر را کاهش دهید.');
    return catalog;
  }
  function photo(p, extra = '') {
    return p.image && safeImage(p.image) ? `<img class="product-photo custom-photo ${extra}" src="${escape(p.image)}" alt="${escape(p.name)}" loading="lazy">` : `<div class="product-photo photo-${p.photo} ${extra}" role="img" aria-label="${escape(p.name)}"></div>`;
  }
  window.Hooya = {kinds, stories, statuses, escape, normalize, number, safeImage, validate, photo};
})();
