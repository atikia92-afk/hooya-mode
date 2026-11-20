/* Render catalog content as editorial sections; never accept HTML from product fields. */
(() => {
  const H=window.Hooya,e=H.escape;
  const paragraphs=text=>text.split(/\n\s*\n/).filter(p=>p.trim()).map(p=>`<p>${e(p.trim()).replace(/\n/g,'<br>')}</p>`).join('');
  function narrative(p){
    const n=H.contentOf(p).narrative;if(!n.text.trim()&&!n.verse.trim()&&!n.quote.trim())return '';
    return `<section class="garment-story" aria-labelledby="garment-story-title"><span class="content-kicker">روایت این لباس</span><h3 id="garment-story-title">قصه لباس</h3>${n.text.trim()?paragraphs(n.text):''}${n.verse.trim()?`<blockquote class="garment-verse">${n.verse.split('\n').filter(line=>line.trim()).map(line=>`<span>${e(line.trim())}</span>`).join('')}</blockquote>`:''}${n.quote.trim()?`<p class="garment-quote">${e(n.quote)}</p>`:''}</section>`;
  }
  function craft(p){
    const d=H.contentOf(p).details;if(!d.embroideryHours&&!d.technique.trim()&&!d.embroideryMaterials.trim())return '';
    return `<section class="garment-craft" aria-label="هنر دست این لباس">${d.embroideryHours?`<div class="craft-hours"><strong>${H.number(d.embroideryHours)}</strong><span>ساعت<br>هنر دست</span></div>`:''}<div class="craft-facts"><h3>هنر دوخت</h3>${d.technique.trim()?`<p>${e(d.technique)}</p>`:''}${d.embroideryMaterials.trim()?`<p>${e(d.embroideryMaterials)}</p>`:''}</div></section>`;
  }
  function specifications(p){
    const d=H.contentOf(p).details,rows=[['جنس پارچه',d.fabric],['قد لباس',d.lengthCm?H.number(d.lengthCm)+' سانتی متر':''],['آستر',d.lining],['جزئیات تکمیل',d.finishing],['تن خور',d.fit]].filter(([,value])=>String(value||'').trim());
    if(!rows.length)return '';
    return `<section class="garment-specs" aria-labelledby="garment-specs-title"><h3 id="garment-specs-title">جزئیات لباس</h3><dl>${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl></section>`;
  }
  function notes(p){
    const d=H.contentOf(p).details;
    return `${d.customization.trim()?`<section class="garment-customization"><span class="customization-mark" aria-hidden="true">✳</span><div><h3>به انتخاب شما</h3>${paragraphs(d.customization)}</div></section>`:''}${p.description.trim()?`<section class="garment-description"><h3>توضیحات تکمیلی</h3>${paragraphs(p.description)}</section>`:''}${d.care.trim()?`<details class="garment-care"><summary>نگهداری از لباس</summary>${paragraphs(d.care)}</details>`:''}`;
  }
  function sizeGuide(p,selected){
    const d=H.contentOf(p).details;
    return `<div class="sizes" role="group" aria-label="انتخاب اندازه">${p.sizes.map(size=>`<button data-size="${e(size)}" class="${size===selected?'selected':''}" aria-pressed="${size===selected}">${e(H.sizeLabel(size))}</button>`).join('')}</div><p class="selected-size-note" id="selected-size-note" role="status">${e(d.sizeNotes[selected]||'')}</p>`;
  }
  window.HooyaProductContent={narrative,craft,specifications,notes,sizeGuide};
})();
