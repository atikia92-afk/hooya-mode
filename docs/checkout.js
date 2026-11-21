'use strict';
(async()=>{
  const H=window.Hooya,C=window.HooyaCart,V=window.HooyaCustomer,$=s=>document.querySelector(s),esc=H.escape;
  const config=window.HooyaCheckoutConfig||{},endpoints=config.endpoints||(config.endpoint?[config.endpoint]:[]),form=$('#billing-form'),button=$('#save-customer');
  let endpoint='';
  let products=[],lines=[],available=false,submitting=false,requestKey='',lastPayload='';
  const keys=['firstName','lastName','country','province','city','address','unit','postcode','phone'];
  const money=value=>value===null?'در انتظار تعیین قیمت':H.number(value)+' تومان';
  for(const prefix of ['billing','shipping'])for(const name of V.provinces){const option=document.createElement('option');option.value=option.textContent=name;$('#'+prefix+'-province').append(option);}
  function error(message){$('#billing-error').hidden=false;$('#billing-error').textContent=message;$('#billing-error').focus();}
  function clearErrors(){
    $('#billing-error').hidden=true;$('#billing-error').textContent='';
    document.querySelectorAll('.billing-error').forEach(el=>el.textContent='');
    document.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
  }
  function showErrors(errors){
    let first;
    for(const [path,message] of Object.entries(errors)){
      const id=path==='shippingConsent'?'shipping-consent':path.replace('.','-'),input=$('#'+id),label=$('#error-'+id);
      if(label)label.textContent=message;
      if(input){input.setAttribute('aria-invalid','true');first ||= input;}
    }
    if(first)first.focus();else error(errors.form||'اطلاعات فرم را بررسی کنید.');
  }
  function snapshot(){
    const contact=prefix=>Object.fromEntries(keys.map(key=>[key,$('#'+prefix+'-'+key).value]));
    return {billing:contact('billing'),differentShipping:$('#different-shipping').checked,shipping:contact('shipping'),notes:$('#notes').value,shippingConsent:$('#shipping-consent').checked};
  }
  function render(){
    const total=C.totals(lines,products),hasItems=lines.length>0;
    $('#bag-count').textContent=H.number(total.count);$('#bag-open').setAttribute('aria-label','سبد خرید، '+H.number(total.count)+' لباس');
    $('#billing-layout').hidden=!hasItems;$('#billing-empty').hidden=hasItems;button.disabled=!hasItems||!available||submitting;
    $('#bill-subtotal').textContent=$('#bill-total').textContent=money(total.subtotal);
    $('#bill-products').innerHTML=lines.map(line=>{const p=products.find(p=>p.id===line.id),choice=C.options(p,line.size).find(x=>x.id===line.mode);return `<tr><th scope="row">${esc(p.name)} <b>× ${H.number(line.qty)}</b><small>${esc(H.sizeLabel(line.size))} · ${esc(choice?.label||'')}</small></th><td>${money(p.price===null?null:p.price*line.qty)}</td></tr>`;}).join('');
  }
  $('#different-shipping').onchange=event=>{
    const enabled=event.target.checked;$('#shipping-fields').hidden=!enabled;$('#shipping-fields').disabled=!enabled;event.target.setAttribute('aria-expanded',String(enabled));
  };
  form.onsubmit=async event=>{
    event.preventDefault();if(submitting)return;clearErrors();
    const result=V.validate(snapshot());if(Object.keys(result.errors).length){showErrors(result.errors);return;}
    if(!available||!endpoint){error('ثبت اطلاعات فعلا در دسترس نیست. لطفا کمی بعد تلاش کنید یا با پشتیبانی واتساپ در ارتباط باشید.');return;}
    const latest=C.read(products);if(JSON.stringify(latest)!==JSON.stringify(lines)){lines=latest;render();error('سبد خرید تغییر کرده است. انتخاب های خود را بررسی و دوباره ثبت کنید.');return;}
    if(!lines.length){render();return;}
    const payload=JSON.stringify({...result.data,items:lines.map(({id,size,mode,qty})=>({id,size,mode,qty})),website:$('#company-website').value});
    submitting=true;button.disabled=true;button.textContent='در حال ثبت سفارش…';form.setAttribute('aria-busy','true');
    if(payload!==lastPayload){
      requestKey=crypto.randomUUID();lastPayload=payload;
      // Recover the same attempt after a lost response/reload, without retaining
      // a name, address, phone, or the form itself in browser storage.
      try{const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))].map(n=>n.toString(16).padStart(2,'0')).join(''),saved=JSON.parse(sessionStorage.getItem('hooya-checkout-attempt')||'null');if(saved?.fingerprint===fingerprint&&/^[a-f0-9-]{36}$/.test(saved.key)&&Date.now()-saved.at<86400000)requestKey=saved.key;sessionStorage.setItem('hooya-checkout-attempt',JSON.stringify({fingerprint,key:requestKey,at:Date.now()}));}catch{}
    }
    try{
      const response=await fetch(endpoint+'/v1/customer-details',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:payload,credentials:'same-origin',signal:AbortSignal.timeout(20000)});
      const data=await response.json();
      if(!response.ok){if(data.errors)showErrors(data.errors);else error(data.message||'ثبت اطلاعات انجام نشد. اطلاعات فرم حفظ شده؛ دوباره تلاش کنید.');return;}
      if(data.status!=='received'||typeof data.reference!=='string'||!/^[a-f0-9-]{36}$/.test(data.reference))throw Error('Invalid confirmation');
      $('#customer-reference').textContent=data.reference;$('#billing-layout').hidden=true;$('#billing-status').textContent='';$('#billing-success').hidden=false;form.reset();$('#shipping-fields').disabled=true;$('#shipping-fields').hidden=true;$('#success-title').focus();
      if(typeof data.trackingToken==='string'&&/^[A-Za-z0-9_-]{43}$/.test(data.trackingToken)){
        const link=document.createElement('a');link.className='outline-button';link.textContent='پیگیری سفارش و حساب من';link.href='account.html#'+new URLSearchParams({order:data.reference,key:data.trackingToken});
        const note=document.createElement('p');note.textContent='لینک پیگیری خصوصی را نزد خود نگه دارید. سفارش ثبت شده و هنوز پرداخت نشده است.';
        $('#billing-success').append(note,link);
        if(JSON.stringify(C.read(products))===JSON.stringify(lines)){C.save([]);$('#bag-count').textContent=H.number(0);}
        try{sessionStorage.removeItem('hooya-checkout-attempt');}catch{}
      }
    }catch{error('تایید ثبت اطلاعات دریافت نشد. اطلاعات فرم حفظ شده؛ دوباره تلاش کنید. تلاش مجدد، ثبت تکراری ایجاد نمی‌کند.');}
    finally{submitting=false;button.textContent='ثبت سفارش';button.disabled=!available;form.removeAttribute('aria-busy');}
  };
  try{products=H.validate(JSON.parse($('#catalog-snapshot')?.textContent||'null')).products;lines=C.read(products);render();$('#billing-status').textContent='';}catch{}
  const serviceReady=Promise.any(endpoints.map(async url=>{
    const response=await fetch(url+'/health',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(5000)});
    if(!response.ok||(await response.json()).available!==true)throw Error('Service unavailable');
    return url;
  })).then(url=>{endpoint=url;return true;}).catch(()=>false);
  try{
    products=(await H.loadCatalog()).products.filter(p=>p.status==='published');lines=C.read(products);render();$('#billing-status').textContent='';
    if(!await serviceReady)throw Error('Service unavailable');available=true;render();
  }catch{
    $('#billing-status').innerHTML='ثبت اطلاعات فعلا در دسترس نیست. لطفا کمی بعد تلاش کنید یا از <a href="https://wa.me/989010490260" target="_blank" rel="noopener noreferrer">پشتیبانی واتساپ</a> کمک بگیرید.';
    if(!products.length){$('#billing-empty').hidden=false;$('#billing-empty').querySelector('h2').textContent='دریافت سبد خرید ممکن نشد';$('#billing-empty').querySelector('p').textContent='انتخاب های قبلی شما حفظ شده‌اند. لطفا صفحه را دوباره بارگذاری کنید.';}
  }
  window.addEventListener('storage',event=>{if(event.key==='hooya-demo-bag'&&products.length&&!submitting&&$('#billing-success').hidden){lines=C.read(products);render();$('#billing-status').textContent='سبد خرید به‌روز شد. انتخاب ها را پیش از ثبت بررسی کنید.';}});
  // Only a verified customer session can restore saved contact information.
  try{const response=await fetch('/api/customer/v1/orders',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(4000)});if(response.ok){const {orders}=await response.json(),last=orders?.[0];if(last&&!keys.some(key=>!['country','province'].includes(key)&&$('#billing-'+key).value))for(const key of keys)$('#billing-'+key).value=last.billing[key]||'';}}catch{}
})();
