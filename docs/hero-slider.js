'use strict';
(() => {
  const hero=document.querySelector('.hero-slider');if(!hero)return;
  const track=hero.querySelector('.hero-track'),slides=[...hero.querySelectorAll('.hero-slide')],dots=[...hero.querySelectorAll('[data-slide-index]')],pause=hero.querySelector('.slider-pause'),status=hero.querySelector('.slider-status');
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)'),holds=new Set();
  let index=0,userPaused=motion.matches,timer=null,touchStart=null;
  function schedule(){clearInterval(timer);timer=null;if(!userPaused&&!holds.size&&!document.hidden)timer=setInterval(()=>{if(!document.querySelector('dialog[open]'))show(index+1,false);},6000);}
  function paintPause(){pause.setAttribute('aria-pressed',String(userPaused));pause.setAttribute('aria-label',userPaused?'پخش اسلایدر':'توقف اسلایدر');pause.classList.toggle('is-paused',userPaused);}
  function show(next,manual=true){
    const target=(next+slides.length)%slides.length,photo=slides[target].querySelector('.slide-model');
    // Keep the current photograph visible while the next slide is still downloading.
    if(photo&&(!photo.complete||!photo.naturalWidth)){
      photo.loading='eager';
      if(manual)photo.addEventListener('load',()=>show(target,true),{once:true});
      return;
    }
    index=target;track.style.transform=`translateX(-${index*100}%)`;slides.forEach((slide,i)=>{slide.setAttribute('aria-hidden',String(i!==index));slide.inert=i!==index;});dots.forEach((dot,i)=>dot.setAttribute('aria-current',String(i===index)));if(manual){status.textContent=slides[index].getAttribute('aria-label');schedule();}
  }
  hero.addEventListener('click',event=>{const step=event.target.closest('[data-slide-step]'),dot=event.target.closest('[data-slide-index]');if(step)show(index+Number(step.dataset.slideStep));if(dot)show(Number(dot.dataset.slideIndex));if(event.target.closest('.slider-pause')){userPaused=!userPaused;paintPause();schedule();}});
  hero.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();show(event.key==='Home'?0:event.key==='End'?slides.length-1:index+(event.key==='ArrowLeft'?1:-1));});
  hero.addEventListener('mouseenter',()=>{holds.add('hover');schedule();});hero.addEventListener('mouseleave',()=>{holds.delete('hover');schedule();});
  hero.addEventListener('focusin',()=>{holds.add('focus');schedule();});hero.addEventListener('focusout',event=>{if(!hero.contains(event.relatedTarget)){holds.delete('focus');schedule();}});
  hero.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&!event.target.closest('button,a'))touchStart={x:event.clientX,y:event.clientY};});
  hero.addEventListener('pointerup',event=>{if(!touchStart)return;const dx=event.clientX-touchStart.x,dy=event.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)show(index+(dx<0?1:-1));});hero.addEventListener('pointercancel',()=>{touchStart=null;});
  document.addEventListener('visibilitychange',schedule);motion.addEventListener('change',()=>{if(motion.matches)userPaused=true;paintPause();schedule();});
  paintPause();show(0,false);schedule();
})();
