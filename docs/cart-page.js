'use strict';
(async()=>{
  const H=window.Hooya,C=window.HooyaCart,$=s=>document.querySelector(s),esc=H.escape;
  let products=[],lines=[],timer;
  const money=value=>value===null?'در انتظار تعیین قیمت':H.number(value)+' تومان';
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
  function render(){
    const total=C.totals(lines,products);
    $('#bag-count').textContent=H.number(total.count);$('#bag-open').setAttribute('aria-label','سبد خرید، '+H.number(total.count)+' لباس');
    $('#cart-item-count').textContent=H.number(total.count)+' کالا';$('#subtotal-label').textContent='قیمت کالاها ('+H.number(total.count)+')';
    $('#cart-subtotal').textContent=money(total.subtotal);$('#cart-total').textContent=money(total.subtotal);
    $('.cart-summary').hidden=!lines.length;$('#cart-empty').hidden=!!lines.length;$('.cart-return').hidden=!lines.length;
    $('#cart-lines').innerHTML=lines.map((line,i)=>{
      const p=products.find(p=>p.id===line.id),choice=C.options(p,line.size).find(x=>x.id===line.mode);
      const delivery=choice?.days?choice.label+' · '+H.number(choice.days)+' روز کاری':choice?.id==='pending'?'زمان آماده سازی پیش از ثبت سفارش تایید می‌شود':choice?.label||'';
      return `<article class="cart-line"><div class="cart-visual"><a href="products.html?product=${encodeURIComponent(p.id)}" aria-label="مشاهده ${esc(p.name)}">${H.photo(p)}</a><div class="cart-quantity" role="group" aria-label="تعداد ${esc(p.name)} اندازه ${esc(H.sizeLabel(line.size))}"><button data-quantity="${i}" data-step="1" ${line.qty>=C.limit(p,line)?'disabled':''} aria-label="افزایش تعداد ${esc(p.name)}">+</button><span aria-label="تعداد">${H.number(line.qty)}</span><button data-quantity="${i}" data-step="-1" aria-label="${line.qty===1?'حذف':'کاهش تعداد'} ${esc(p.name)}">${line.qty===1?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 3h6M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>':'−'}</button></div></div><div class="cart-line-copy"><a class="cart-product-name" href="products.html?product=${encodeURIComponent(p.id)}">${esc(p.name)}</a><p class="cart-variant"><span>${esc(H.collections[H.collectionOf(p)]||'هویا')}</span><span class="cart-size">اندازه: <b dir="ltr">${esc(H.sizeLabel(line.size))}</b></span></p><p class="cart-seller"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18l-2-6H5L3 9ZM5 9v12h14V9M9 21v-7h6v7"/></svg>خانه هویا</p><p class="cart-delivery"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h12v12H2ZM14 10h4l4 4v3h-8"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>${esc(delivery)}</p></div><button class="cart-remove" data-remove="${i}" aria-label="حذف ${esc(p.name)} از سبد">×</button><p class="cart-line-price">${money(p.price===null?null:p.price*line.qty)}</p></article>`;
    }).join('');
  }
  document.addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove]'),quantity=event.target.closest('[data-quantity]');
    if(!remove&&!quantity)return;
    const previous=lines.map(x=>({...x}));
    if(remove)lines.splice(Number(remove.dataset.remove),1);
    else{
      const index=Number(quantity.dataset.quantity),line=lines[index];if(!line)return;
      const p=products.find(p=>p.id===line.id),next=line.qty+Number(quantity.dataset.step);
      if(next>C.limit(p,line))return;
      if(next<=0)lines.splice(index,1);else line.qty=next;
    }
    if(!C.save(lines)){lines=previous;toast('ذخیره تغییرات سبد ممکن نشد. دوباره تلاش کنید.');return;}
    render();$('#cart-status').textContent=remove||!quantity?'لباس از سبد حذف شد.':'سبد خرید به‌روز شد.';
  });
  try{
    products=(await H.loadCatalog()).products.filter(p=>p.status==='published');lines=C.read(products);render();
    $('#cart-status').textContent='';
  }catch{$('#cart-status').textContent='دریافت سبد خرید ممکن نشد. لطفا صفحه را دوباره بارگذاری کنید.';}
  window.addEventListener('storage',event=>{if(event.key==='hooya-demo-bag'&&products.length){lines=C.read(products);render();}});
})();
