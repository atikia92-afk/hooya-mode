/* Shared, bounded customer-details validation. No customer records are stored here. */
((root)=>{
  const provinces=['آذربایجان شرقی','آذربایجان غربی','اردبیل','اصفهان','البرز','ایلام','بوشهر','تهران','چهارمحال و بختیاری','خراسان جنوبی','خراسان رضوی','خراسان شمالی','خوزستان','زنجان','سمنان','سیستان و بلوچستان','فارس','قزوین','قم','کردستان','کرمان','کرمانشاه','کهگیلویه و بویراحمد','گلستان','گیلان','لرستان','مازندران','مرکزی','هرمزگان','همدان','یزد'];
  const digits=value=>String(value??'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));
  const limits={firstName:60,lastName:80,phone:25,province:60,city:80,address:500,unit:120,postcode:20};
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  function contact(value,prefix,errors){
    const data={country:'IR'};
    for(const [key,max] of Object.entries(limits)){
      const raw=value?.[key];
      data[key]=typeof raw==='string'?raw.trim():'';
      if(typeof raw!=='string'||data[key].length>max||/[\u0000-\u001f\u007f]/.test(data[key]))errors[prefix+'.'+key]='این بخش را به درستی وارد کنید.';
    }
    data.phone=digits(data.phone).replace(/[\s()-]/g,'').replace(/^(\+98|0098|98)/,'0');
    data.postcode=digits(data.postcode).replace(/[\s-]/g,'');
    for(const key of ['firstName','lastName'])if(data[key].length<2)errors[prefix+'.'+key]='این بخش را کامل کنید.';
    if(!/^09\d{9}$/.test(data.phone))errors[prefix+'.phone']='شماره موبایل را با ۰۹ و ۱۱ رقم وارد کنید.';
    if(!provinces.includes(data.province))errors[prefix+'.province']='استان را انتخاب کنید.';
    if(data.city.length<2)errors[prefix+'.city']='نام شهر را وارد کنید.';
    if(data.address.length<10)errors[prefix+'.address']='آدرس کامل خیابان، کوچه و پلاک را وارد کنید.';
    if(!/^\d{10}$/.test(data.postcode))errors[prefix+'.postcode']='کد پستی باید ۱۰ رقم باشد.';
    if(value?.country!=='IR')errors[prefix+'.country']='در حال حاضر ارسال فقط داخل ایران انجام می‌شود.';
    return data;
  }
  const isTehran=address=>address?.province==='تهران'&&String(address?.city||'').trim().replace(/[\s\u200c]/g,'')==='تهران';
  function validate(value){
    const errors={};
    if(!object(value))return {data:null,errors:{form:'اطلاعات فرم معتبر نیست.'}};
    const billing=contact(value.billing,'billing',errors),differentShipping=value.differentShipping===true;
    if(typeof value.differentShipping!=='boolean')errors.form='اطلاعات گیرنده را بررسی کنید.';
    const shipping=differentShipping?contact(value.shipping,'shipping',errors):{...billing};
    const notes=typeof value.notes==='string'?value.notes.trim():'';
    if(typeof value.notes!=='string'||notes.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes))errors.notes='توضیحات را حداکثر در ۱۰۰۰ حرف وارد کنید.';
    if(value.shippingConsent!==true)errors.shippingConsent='لطفا اطلاع از شرایط ارسال را تایید کنید.';
    const delivery={};
    // Absent fields preserve receipts from clients opened before delivery selection existed.
    if(value.deliveryMethod!==undefined){
      delivery.deliveryMethod=value.deliveryMethod;delivery.shippingVersion=value.shippingVersion;
      if(!['post','courier'].includes(value.deliveryMethod))errors.deliveryMethod='روش ارسال را انتخاب کنید.';
      if(value.deliveryMethod==='courier'&&!isTehran(shipping))errors.deliveryMethod='پیک فقط برای نشانی داخل شهر تهران در دسترس است.';
      if(!Number.isSafeInteger(value.shippingVersion)||value.shippingVersion<1)errors.deliveryMethod='شرایط ارسال را دوباره دریافت کنید.';
    }
    return {data:{billing,shipping,differentShipping,notes,shippingConsent:value.shippingConsent===true,...delivery},errors};
  }
  root.HooyaCustomer={provinces,digits,validate,isTehran};
})(typeof window==='undefined'?globalThis:window);
