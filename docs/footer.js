(()=>{
 document.querySelectorAll('[data-copy-social-number]').forEach(button=>button.addEventListener('click',async()=>{
  const panel=button.closest('.social-popover'),number=panel.querySelector('input'),status=panel.querySelector('.social-copy-status');
  try{await navigator.clipboard.writeText(number.value);status.textContent='شماره کپی شد.';}catch{number.focus();number.select();status.textContent='شماره را انتخاب و کپی کن.';}
 }));
 document.addEventListener('click',event=>document.querySelectorAll('.social-bale[open]').forEach(details=>{if(!details.contains(event.target))details.removeAttribute('open');}));
 document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.social-bale[open]').forEach(details=>{details.removeAttribute('open');details.querySelector('summary').focus();});});
})();
