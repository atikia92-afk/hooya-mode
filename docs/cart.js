/* Preview cart only. Production orders and payment must be validated on the server. */
(() => {
  const key='hooya-demo-bag';
  const stock=(p,size)=>p.sizeStock?.[size] ?? (p.stock===0?0:null);
  function options(p,size){
    const choices=[],n=stock(p,size);
    if(n>0)choices.push({id:'ready',label:'آماده ارسال',days:p.dispatchDays??null});
    if(p.madeToOrder)choices.push({id:'order',label:'دوخت پس از سفارش',days:p.productionDays??null});
    if(!choices.length&&n===null)choices.push({id:'pending',label:'وضعیت آماده سازی در انتظار تکمیل',days:null});
    return choices;
  }
  function limit(p,line){
    if(line.mode==='ready')return Math.min(10,stock(p,line.size)??0);
    return 10;
  }
  function normalize(input,products){
    if(!Array.isArray(input))return [];
    const result=[];
    for(const item of input.slice(0,250)){
      const p=products.find(p=>p.id===item?.id&&p.status==='published');
      if(!p||!p.sizes.includes(item.size))continue;
      const choices=options(p,item.size), mode=item.mode?choices.find(x=>x.id===item.mode)?.id:choices[0]?.id;
      if(!mode)continue;
      const line={id:p.id,size:item.size,mode,qty:Number.isSafeInteger(item.qty)&&item.qty>0?item.qty:1};
      const existing=result.find(x=>x.id===line.id&&x.size===line.size&&x.mode===mode);
      if(existing)existing.qty=Math.min(limit(p,line),existing.qty+line.qty);
      else {line.qty=Math.min(limit(p,line),line.qty);if(line.qty)result.push(line);}
    }
    return result;
  }
  function read(products){try{return normalize(JSON.parse(localStorage.getItem(key)||'[]'),products);}catch{return [];}}
  function save(lines){try{localStorage.setItem(key,JSON.stringify(lines));return true;}catch{return false;}}
  function totals(lines,products){
    let subtotal=0,known=true;
    for(const line of lines){const p=products.find(p=>p.id===line.id);if(!p||p.price===null){known=false;continue;}subtotal+=p.price*line.qty;}
    return {count:lines.reduce((n,x)=>n+x.qty,0),subtotal:known?subtotal:null};
  }
  const digits=value=>String(value).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  function validateCustomer(data){
    const errors={};
    if((data.name||'').trim().length<3)errors.name='نام و نام خانوادگی گیرنده را وارد کنید.';
    if(!/^09\d{9}$/.test(digits(data.phone).replace(/[\s-]/g,'')))errors.phone='شماره موبایل را با ۰۹ و ۱۱ رقم وارد کنید.';
    for(const field of ['province','city'])if(!(data[field]||'').trim())errors[field]='این بخش را کامل کنید.';
    if((data.address||'').trim().length<10)errors.address='آدرس کامل همراه با پلاک و واحد را وارد کنید.';
    if(!/^\d{10}$/.test(digits(data.postcode).replace(/[\s-]/g,'')))errors.postcode='کد پستی باید ۱۰ رقم باشد.';
    return errors;
  }
  window.HooyaCart={stock,options,limit,normalize,read,save,totals,digits,validateCustomer};
})();
