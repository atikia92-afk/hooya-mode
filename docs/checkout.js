'use strict';
(async()=>{
  const H=window.Hooya,C=window.HooyaCart,$=s=>document.querySelector(s),esc=H.escape;
  let products=[],lines=[],customer={};
  const fields=['name','phone','province','city','address','postcode','notes'];
  $('#receipt-preview').onclick=()=>$('#receipt-dialog').showModal();
  const summaryToggle=document.createElement('button');summaryToggle.type='button';summaryToggle.className='summary-toggle';summaryToggle.setAttribute('aria-expanded','false');summaryToggle.setAttribute('aria-controls','summary-products');$('#summary-products').before(summaryToggle);
  summaryToggle.onclick=()=>{const expanded=summaryToggle.getAttribute('aria-expanded')!=='true';summaryToggle.setAttribute('aria-expanded',String(expanded));$('.order-summary').classList.toggle('is-expanded',expanded);};
  function step(review){
    $('#details-panel').hidden=review;$('#review-panel').hidden=!review;
    $('#step-title').textContent=review?'بررسی و پرداخت':'تکمیل خرید';
    $('#step-details').toggleAttribute('aria-current',!review);$('#step-review').toggleAttribute('aria-current',review);
    if(review)$('#step-review').setAttribute('aria-current','step');else $('#step-details').setAttribute('aria-current','step');
    $('#step-title').focus();$('#step-title').scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('#edit-customer').onclick=()=>step(false);
  $('#customer-form').onsubmit=e=>{
    e.preventDefault();customer=Object.fromEntries(fields.map(k=>[k,$('#'+k).value.trim()]));
    const errors=C.validateCustomer(customer);if(!$('#shipping-consent').checked)errors.consent='لطفا پرداخت جداگانه هزینه ارسال را تایید کن.';
    for(const field of [...fields,'consent']){const target=$('#error-'+field);if(target)target.textContent=errors[field]||'';const input=$('#'+(field==='consent'?'shipping-consent':field));if(input)input.setAttribute('aria-invalid',String(!!errors[field]));}
    if(Object.keys(errors).length){$('#'+(Object.keys(errors)[0]==='consent'?'shipping-consent':Object.keys(errors)[0])).focus();return;}
    $('#customer-review').innerHTML=`<strong>${esc(customer.name)}</strong><p dir="ltr" class="review-phone">${esc(C.digits(customer.phone))}</p><p>${esc(customer.province)}، ${esc(customer.city)}، ${esc(customer.address)}</p><p>کد پستی: ${esc(C.digits(customer.postcode))}</p>${customer.notes?`<p>توضیحات: ${esc(customer.notes)}</p>`:''}`;
    step(true);
  };
  function render(){
    $('#checkout-empty').hidden=!!lines.length;$('#checkout-layout').hidden=!lines.length;
    const total=C.totals(lines,products),amount=total.subtotal===null?'در انتظار تعیین قیمت':H.number(total.subtotal)+' تومان';
    summaryToggle.textContent='مشاهده لباس های انتخاب شده ('+H.number(total.count)+')';
    $('#subtotal').textContent=amount;$('#payable').textContent=amount;
    $('#summary-products').innerHTML=lines.map(line=>{const p=products.find(p=>p.id===line.id),choice=C.options(p,line.size).find(x=>x.id===line.mode);return `<article class="summary-product">${H.photo(p)}<div><h3>${esc(p.name)}</h3><p>سایز <b dir="ltr">${esc(line.size)}</b> · ${H.number(line.qty)} عدد</p><span class="fulfillment-label">${esc(choice.label)}</span><p>${choice.days?H.number(choice.days)+' روز کاری تا تحویل به شرکت حمل':'زمان آماده سازی در انتظار تکمیل'}</p><strong>${p.price===null?'قیمت هنوز تعیین نشده':H.number(p.price*line.qty)+' تومان'}</strong></div></article>`;}).join('');
    const missingPrice=lines.some(l=>products.find(p=>p.id===l.id).price===null),missingTiming=lines.some(l=>!C.options(products.find(p=>p.id===l.id),l.size).find(x=>x.id===l.mode)?.days);
    $('#purchase-blockers').textContent=[missingPrice?'قیمت بعضی لباس ها هنوز تعیین نشده.':'',missingTiming?'وضعیت یا زمان آماده سازی بعضی لباس ها هنوز تکمیل نشده.':'','درگاه پرداخت هنوز فعال نشده است.'].filter(Boolean).join(' ');
    const days=lines.map(l=>C.options(products.find(p=>p.id===l.id),l.size).find(x=>x.id===l.mode)?.days);
    $('#preparation-note').textContent=missingTiming?'زمان ارسال پس از تکمیل مشخصات آماده سازی لباس ها مشخص می شود.':`همه لباس های این سفارش در یک بسته، پس از آماده شدن آخرین لباس ارسال می شوند؛ تا ${H.number(Math.max(...days))} روز کاری تا تحویل به شرکت حمل. زمان حمل به مقصد جداگانه است.`;
  }
  try{
    const response=await fetch('products.json',{cache:'no-store'});if(!response.ok)throw Error();
    products=H.validate(await response.json()).products.filter(p=>p.status==='published');lines=C.read(products);render();
  }catch{$('#checkout-error').hidden=false;$('#checkout-error').textContent='دریافت سبد ممکن نشد. صفحه را دوباره بارگذاری کن؛ انتخاب های قبلی در مرورگر باقی مانده اند.';}
  window.addEventListener('storage',event=>{if(event.key==='hooya-demo-bag'&&products.length){lines=C.read(products);render();step(false);}});
})();
