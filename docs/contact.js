'use strict';
(() => {
  document.querySelectorAll('[data-copy-address]').forEach(button=>button.addEventListener('click',async()=>{
    const address=document.getElementById(button.dataset.copyAddress).textContent.trim(),status=button.closest('.store-card').querySelector('.copy-status');
    try{await navigator.clipboard.writeText(address);status.textContent='آدرس کپی شد.';}catch{status.textContent='برای کپی، متن آدرس را انتخاب کنید.';}
  }));
  fetch('contact.json',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(config=>{
    const number=config?.whatsapp;if(typeof number!=='string'||!/^[1-9]\d{7,14}$/.test(number))return;
    const details=document.querySelector('#whatsapp-details'),row=document.createElement('div'),link=document.createElement('a'),display=document.createElement('span');
    row.className='whatsapp-live';link.className='text-link';link.href='https://wa.me/'+number;link.target='_blank';link.rel='noopener noreferrer';link.textContent='گفتگو در واتساپ ↗';display.className='whatsapp-number';display.dir='ltr';display.textContent=/^98\d{10}$/.test(number)?number.replace(/^98(\d{3})(\d{3})(\d{4})$/,'+98 $1 $2 $3'):'+'+number;row.append(link,display);details.replaceChildren(row);
  }).catch(()=>{});
})();
