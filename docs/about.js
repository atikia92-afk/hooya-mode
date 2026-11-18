'use strict';
(() => {
  const menu=document.querySelector('#menu-dialog');document.querySelector('#menu-open').onclick=()=>menu.showModal();
  menu.addEventListener('click',event=>{if(event.target.closest('a'))menu.close();if(event.target===menu){const r=menu.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)menu.close();}});
  try{const saved=JSON.parse(localStorage.getItem('hooya-demo-bag')||'[]');if(Array.isArray(saved)){const count=String(saved.length).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);document.querySelector('#bag-count').textContent=count;document.querySelector('#bag-open').setAttribute('aria-label','سبد انتخاب ها، '+count+' لباس');}}catch{}
})();
