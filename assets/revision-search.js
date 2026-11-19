'use strict';
(() => {
  const D=window.N1_REVISION,$=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s～〜~]/g,'');
  const indexed=D.entries.map(x=>({...x,haystack:norm([x.title,x.parent,x.text,...x.terms].join(' '))}));
  let mode='years',page=1;
  const pageSize=24;
  const controls={q:$('#query'),exam:$('#year'),category:$('#category')};
  function syncURL(){const p=new URLSearchParams();if(controls.q.value.trim())p.set('q',controls.q.value.trim());if(controls.exam.value)p.set('exam',controls.exam.value);if(controls.category.value)p.set('category',controls.category.value);if(mode!=='years')p.set('mode',mode);if(page>1)p.set('page',page);history.replaceState({},'',location.pathname+(p.size?'?'+p:''));}
  function excerpt(text,q){
    const simple=text.replace(/<br\s*\/?\s*>/gi,' ').replace(/\|/g,' · ').replace(/\n{2,}/g,'\n');
    let start=0;const pos=q?norm(simple).indexOf(norm(q)):0;
    if(pos>70)start=Math.max(0,pos-60);
    return (start?'…':'')+simple.slice(start,start+230).trim()+(simple.length>start+230?'…':'');
  }
  function render(){
    const q=controls.q.value.trim(),exam=controls.exam.value,category=controls.category.value;
    $('#year-panel').hidden=mode!=='years';$('#topic-panel').hidden=mode!=='topics';$('#search-panel').hidden=mode!=='search';
    for(const [id,value]of [['tab-years','years'],['tab-topics','topics'],['tab-search','search']]){$('#'+id).classList.toggle('primary',mode===value);$('#'+id).setAttribute('aria-pressed',String(mode===value));}
    document.querySelectorAll('[data-exam]').forEach(x=>x.hidden=Boolean(exam&&x.dataset.exam!==exam));
    if(mode!=='search'){syncURL();return;}
    const qs=q.split(/\s+/).filter(Boolean).map(norm);
    const hits=indexed.filter(x=>(!exam||x.exam===exam)&&(!category||x.category===category)&&qs.every(t=>x.haystack.includes(t)));
    const pages=Math.max(1,Math.ceil(hits.length/pageSize));page=Math.min(page,pages);
    $('#result-count').textContent=`找到 ${hits.length.toLocaleString()} 个内容小节${q?'，搜索“'+q+'”':''} · 第 ${page} / ${pages} 页`;
    $('#results').innerHTML=hits.length?hits.slice((page-1)*pageSize,page*pageSize).map(x=>`<article class="result"><div class="subtle">${esc(x.label)} · ${esc(D.categories[x.category])}</div><h2><a href="${x.exam}.html#${x.id}">${esc(x.title)}</a></h2>${x.parent?'<div class="bread">'+esc(x.parent)+'</div>':''}<p>${esc(excerpt(x.text,q)).replace(/\n/g,'<br>')}</p><div class="actions"><a class="button primary" href="${x.exam}.html#${x.id}">定位本节 →</a><a class="button" href="../../index.html?exam=${x.exam}">本卷做题</a></div></article>`).join(''):'<div class="empty">没有找到匹配内容。试试词干、汉字或另一种写法，例如“得ない”“必着”。</div>';
    $('#pagination').innerHTML=`<button class="button" id="prev-page" ${page<=1?'disabled':''}>← 上一页</button><span class="subtle">${page} / ${pages}</span><button class="button" id="next-page" ${page>=pages?'disabled':''}>下一页 →</button>`;
    $('#prev-page').onclick=()=>{page--;render();$('#search-form').scrollIntoView({block:'start'});};
    $('#next-page').onclick=()=>{page++;render();$('#search-form').scrollIntoView({block:'start'});};
    syncURL();
  }
  let timer;
  controls.q.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{mode=controls.q.value.trim()?'search':(controls.category.value?'search':'years');page=1;render();},160);});
  controls.exam.onchange=()=>{page=1;render();};controls.category.onchange=()=>{mode='search';page=1;render();};
  $('#search-form').onsubmit=ev=>{ev.preventDefault();mode='search';page=1;render();};
  $('#clear').onclick=()=>{Object.values(controls).forEach(x=>x.value='');mode='years';page=1;render();controls.q.focus();};
  $('#tab-years').onclick=()=>{mode='years';render();};$('#tab-topics').onclick=()=>{mode='topics';render();};$('#tab-search').onclick=()=>{mode='search';render();};
  const p=new URLSearchParams(location.search);controls.q.value=p.get('q')||'';controls.exam.value=p.get('exam')||'';controls.category.value=p.get('category')||'';mode=p.get('mode')||(controls.q.value||controls.category.value?'search':'years');if(!['years','topics','search'].includes(mode))mode='years';page=Math.max(1,Number(p.get('page'))||1);render();
})();
