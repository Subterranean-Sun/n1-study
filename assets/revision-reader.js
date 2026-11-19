'use strict';
(() => {
  const $=s=>document.querySelector(s),all=[...document.querySelectorAll('.section')];
  const norm=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s～〜~]/g,'');
  const items=all.map(el=>({el,category:el.dataset.category,level:Number(el.dataset.level),text:norm(el.querySelector('.body')?.textContent||''),title:norm(el.querySelector('h2,h3')?.textContent||'')}));
  let expanded=false;
  function filter(){
    const qs=$('#local-query').value.trim().split(/\s+/).filter(Boolean).map(norm),cat=$('#local-category').value;
    const visible=new Set(),parents=[];let count=0;
    for(const x of items){
      while(parents.length&&parents.at(-1).level>=x.level)parents.pop();
      const yes=(!cat||x.category===cat)&&qs.every(q=>x.text.includes(q)||x.title.includes(q));
      if(yes){visible.add(x.el);parents.forEach(p=>visible.add(p.el));if(x.text)count++;}
      parents.push(x);
    }
    items.forEach(x=>x.el.hidden=!visible.has(x.el));
    $('#local-count').textContent=`显示 ${count} 个内容小节`;
    $('#local-empty').hidden=count>0;
  }
  function reset(){ $('#local-query').value='';$('#local-category').value='';filter(); }
  function openHash(){
    let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
    const target=document.getElementById(id);
    if(!target||!target.classList.contains('section'))return;
    if(target.hidden)reset();
    const link=document.querySelector('.toc a[href="#'+CSS.escape(id)+'"]');
    for(let parent=link?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));
  }
  let timer;$('#local-query').oninput=()=>{clearTimeout(timer);timer=setTimeout(filter,130);};$('#local-category').onchange=filter;$('#local-reset').onclick=reset;
  $('#font-toggle').onclick=()=>{const big=$('#reader').classList.toggle('bigtype');$('#font-toggle').textContent=big?'标准字号':'放大字号';};
  $('#toc-toggle').onclick=()=>{expanded=!expanded;document.querySelectorAll('.toc details').forEach(x=>x.open=expanded);$('#toc-toggle').textContent=expanded?'折叠全部目录':'展开全部目录';};
  document.querySelectorAll('.session-switch').forEach(x=>x.onchange=()=>{if(x.value)location.href=x.value+'.html';});
  document.querySelector('.toc').addEventListener('click',ev=>{const a=ev.target.closest('a[href^="#"]');if(a){const target=document.getElementById(a.hash.slice(1));if(target?.hidden)reset();}});
  window.addEventListener('hashchange',openHash);filter();if(location.hash)openHash();
})();
