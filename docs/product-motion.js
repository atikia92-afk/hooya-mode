'use strict';
(() => {
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let observer=null,currentGrid=null;
  function reveal(card){
    card.classList.add('is-revealed');
    observer?.unobserve(card);
  }
  function showAll(){
    observer?.disconnect();observer=null;
    currentGrid?.querySelectorAll('.product-card').forEach(card=>{
      card.classList.remove('reveal-ready','is-revealed');
      card.style.removeProperty('--reveal-delay');
    });
  }
  function sync(grid){
    observer?.disconnect();observer=null;currentGrid=grid;
    if(!grid||preference.matches||!('IntersectionObserver' in window)){showAll();return;}
    const columns=Math.max(1,Math.min(4,getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length));
    try{
      observer=new IntersectionObserver(entries=>{
        for(const entry of entries)if(entry.isIntersecting)reveal(entry.target);
      },{threshold:0.12});
      grid.querySelectorAll('.product-card').forEach((card,index)=>{
        card.style.setProperty('--reveal-delay',`${(index%columns)*70}ms`);
        card.classList.add('reveal-ready');
        observer.observe(card);
      });
    }catch{showAll();}
  }
  preference.addEventListener('change',()=>{if(preference.matches)showAll();});
  document.addEventListener('focusin',event=>{
    const card=event.target.closest?.('#product-grid .product-card.reveal-ready');
    if(card)reveal(card);
  });
  window.HooyaProductMotion={sync};
})();
