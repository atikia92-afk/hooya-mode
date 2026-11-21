/* Keep the embedded preview visible until the full photograph really loads. */
(()=>{
 const observed=new WeakSet(),queue=[];let active=0;
 const local=value=>{try{const url=new URL(value,document.baseURI);return url.origin===location.origin&&/\/assets\//.test(url.pathname)?url:null;}catch{return null;}};
 function pump(){
  while(active<2&&queue.length){const {element,source,background}=queue.shift();if(!element.isConnected)continue;active++;
   let attempt=0;const load=()=>{
    const url=local(source);if(!url){active--;pump();return;}if(attempt)url.searchParams.set('_media_retry','1');
    const image=new Image();image.decoding='async';
    let finished=false;const timeout=setTimeout(()=>failed(),7000);
    const finish=()=>{if(finished)return false;finished=true;clearTimeout(timeout);image.onload=image.onerror=null;return true;};
    const failed=()=>{if(!finish())return;image.src='';if(attempt++===0)load();else{active--;pump();}};
    image.onload=()=>{if(!finish())return;if(image.naturalWidth&&element.isConnected){if(background)element.style.backgroundImage='url('+JSON.stringify(url.href)+')';else element.src=url.href;}active--;pump();};
    image.onerror=failed;image.src=url.href;
   };load();
  }
 }
 function enqueue(element){const background=element.hasAttribute('data-full-background'),source=element.getAttribute(background?'data-full-background':'data-full-src');if(!source)return;queue.push({element,source,background});pump();}
 const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);enqueue(entry.target);}}),{rootMargin:'100px'}):null;
 function watch(element){
  if(observed.has(element))return;observed.add(element);
  if(element.hasAttribute('data-full-src')||element.hasAttribute('data-full-background')){if(observer)observer.observe(element);else enqueue(element);return;}
  if(element.tagName==='IMG'){
   let retried=false;const retry=()=>{const url=local(element.getAttribute('src'));if(!url||retried)return;retried=true;url.searchParams.set('_media_retry','1');element.src=url.href;};
   element.addEventListener('error',retry);if(element.complete&&!element.naturalWidth)retry();
  }
 }
 const scan=root=>{if(root.matches?.('img,[data-full-background]'))watch(root);root.querySelectorAll?.('img,[data-full-background]').forEach(watch);};
 scan(document);new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node);}))).observe(document.body,{childList:true,subtree:true});
})();
