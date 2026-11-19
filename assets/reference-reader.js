(() => {
  'use strict';
  const meta = window.N1_READER, db = window.N1_REFERENCE_INDEX;
  if (!meta || !db) return;
  const $ = id => document.getElementById(id);
  const docId = meta.id, prefix = 'n1.reference.v2.';
  const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/\s+/g,'');
  const all = db.records.map(r => ({...r, hay:norm(r.title+' '+r.text+' '+r.chapterTitle+' '+r.topicTitle), name:norm(r.title)}));
  const localRecords = all.filter(r=>r.doc===docId), localMap = new Map(localRecords.map(r=>[r.id,r]));
  const topicMap = new Map(meta.topics.map(t=>[t.id,t]));
  const topicOrder = ['reader-start',...meta.topics.map(t=>t.id)];
  const chapterMap = new Map(meta.chapters.map(c=>[c.id,c]));
  let storageOK = true;
  function fresh() { return {version:2, bookmarks:[],recent:[],last:null,font:16,continuous:false}; }
  function readState(book) {
    try { const s=JSON.parse(localStorage.getItem(prefix+book)||'null'); return s&&s.version===2?{...fresh(),...s}:fresh(); }
    catch { storageOK=false; return fresh(); }
  }
  let state = readState(docId);
  state.bookmarks = Array.isArray(state.bookmarks)?state.bookmarks.filter(id=>localMap.has(id)):[];
  state.recent = Array.isArray(state.recent)?state.recent.filter(x=>x&&localMap.has(x.id)).slice(0,40):[];
  state.font = Math.max(14,Math.min(23,Number(state.font)||16));
  state.continuous=!!state.continuous;
  const resume = state.last && (localMap.has(state.last.id)||topicMap.has(state.last.id))?{...state.last}:null;
  let current='reader-start', activeEntry='', rail='outline', panel='search', results=[], shown=60;
  let tracking=false, scrollTimer, searchTimer, toastTimer, isNavigating=false;
  function persist() {
    try { localStorage.setItem(prefix+docId,JSON.stringify(state)); }
    catch { storageOK=false; $('storage-notice').hidden=false; }
  }
  if (!storageOK) $('storage-notice').hidden=false;
  function toast(s) { $('toast').textContent=s; $('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600); }
  function linkFor(r) { return (r.doc===docId?'':r.doc+'.html')+'#'+r.id; }
  function makeLink(title,href,cls) {const a=document.createElement('a');a.textContent=title;a.href=href;if(cls)a.className=cls;return a;}
  function setFont() {document.documentElement.style.setProperty('--reading-size',state.font+'px');}
  setFont();
  function closeNav(){document.body.classList.remove('nav-open');}
  function closePanel(){ $('search-panel').hidden=true;$('reader-search').setAttribute('aria-expanded','false'); }
  function showPanel(mode) {
    panel=mode;closeNav();$('search-panel').hidden=false;$('reader-search').setAttribute('aria-expanded','true');
    $('search-filters').hidden=mode!=='search';$('library-controls').hidden=!['saved','recent','help'].includes(mode);
  }
  function track(id,offset=0) {
    if (!tracking || id==='reader-start') return;
    state.last={id,offset:Math.round(offset),time:Date.now()};
    const rec=localMap.get(id);
    if(rec){state.recent=[{id,time:Date.now()},...state.recent.filter(x=>x.id!==id)].slice(0,40);}
    persist();
  }
  function refreshBookmarks() {
    document.querySelectorAll('[data-bookmark-count]').forEach(n=>n.textContent=state.bookmarks.length);
    document.querySelectorAll('[data-action="bookmark"]').forEach(b=>{
      const yes=state.bookmarks.includes(b.dataset.entry);b.setAttribute('aria-pressed',String(yes));b.textContent=yes?'★':'☆';
      b.title=yes?'取消收藏':'收藏本条';b.setAttribute('aria-label',b.title);
    });
  }
  function drawRail() {
    const list=$('outline-list');list.replaceChildren();
    const filter=norm($('outline-filter').value);
    document.querySelectorAll('[data-rail]').forEach(b=>b.classList.toggle('active',b.dataset.rail===rail));
    $('rail-title').textContent=rail==='outline'?'本节词条 · '+(topicMap.get(current)?.entries.length||0):rail==='bookmarks'?'本册书签 · '+state.bookmarks.length:'最近阅读';
    let rs=rail==='bookmarks'?state.bookmarks.map(id=>localMap.get(id)):rail==='recent'?state.recent.map(x=>localMap.get(x.id)):(topicMap.get(current)?.entries||[]).map(id=>localMap.get(id));
    rs=rs.filter(Boolean).filter(r=>!filter||norm(r.title).includes(filter));
    for(const r of rs){const a=makeLink(r.key||r.title,'#'+r.id);a.classList.toggle('active',r.id===activeEntry);list.append(a);}
    if(!rs.length){const p=document.createElement('p');p.className='empty';p.textContent=filter?'没有匹配的条目。':rail==='bookmarks'?'点词条右上角的 ☆ 收藏。':rail==='recent'?'阅读词条后会在这里留下记录。':'选择左侧分类后，这里显示本节词条。';list.append(p);}
  }
  function applyVisibility(topic) {
    const continuous=state.continuous;
    document.body.classList.toggle('continuous',continuous);
    document.querySelectorAll('.book-chapter').forEach(c=>{
      const chapter=topic==='reader-start'?'reader-overview':topicMap.get(topic)?.chapter;
      c.hidden=!continuous&&c.id!==chapter;
    });
    document.querySelectorAll('.reading-topic').forEach(t=>t.hidden=!continuous&&t.id!==topic);
    document.querySelectorAll('[data-action="continuous"]').forEach(b=>{
      b.setAttribute('aria-pressed',String(continuous));b.textContent=continuous?'分类阅读':'连续阅读';
    });
  }
  function updateLocation(topic) {
    current=topic;
    const info=topicMap.get(topic);
    $('breadcrumb').replaceChildren(document.createTextNode(info?info.chapterTitle:'N1 讲解阅读室'));
    const b=document.createElement('b');b.textContent=info?info.title:'复习导航';$('breadcrumb').append(b);
    document.querySelectorAll('#toc a[data-topic]').forEach(a=>{const yes=a.dataset.topic===topic;a.classList.toggle('active',yes);if(yes)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
    if(info){const detail=document.querySelector('#toc details[data-chapter="'+info.chapter+'"]');if(detail)detail.open=true;}
    const ix=topicOrder.indexOf(topic);
    $('prev-topic').href='#'+topicOrder[Math.max(0,ix-1)];$('next-topic').href='#'+topicOrder[Math.min(topicOrder.length-1,ix+1)];
    $('prev-topic').hidden=ix===0;$('next-topic').hidden=ix===topicOrder.length-1;
    $('prev-topic').textContent='← '+(topicMap.get(topicOrder[ix-1])?.title||'复习导航');
    $('next-topic').textContent=(topicMap.get(topicOrder[ix+1])?.title||'下一分类')+' →';
    $('topic-progress').textContent=ix===0?'导航 / '+meta.topics.length+' 个分类':ix+' / '+meta.topics.length+' 个分类';
    $('outline-filter').value='';drawRail();
  }
  function resolve(id) {
    if(localMap.has(id))return {topic:localMap.get(id).topic,target:id};
    if(topicMap.has(id)||id==='reader-start')return {topic:id,target:id};
    if(chapterMap.has(id))return {topic:chapterMap.get(id).topics[0],target:id};
    return {topic:'reader-start',target:'reader-start',unknown:!!id};
  }
  function activate(raw,opts={}) {
    const found=resolve(raw), target=$(found.target);
    if(opts.user)tracking=true;
    activeEntry=localMap.has(raw)?raw:'';
    applyVisibility(found.topic);updateLocation(found.topic);closeNav();closePanel();
    if(found.unknown)toast('该位置已失效，请从目录或搜索重新定位。');
    isNavigating=true;
    requestAnimationFrame(()=>{
      if(target && opts.scroll!==false){target.scrollIntoView({block:'start'});if(opts.offset)window.scrollBy(0,opts.offset);}
      if(activeEntry){target?.classList.add('target-flash');setTimeout(()=>target?.classList.remove('target-flash'),1600);}
      track(activeEntry||found.topic,opts.offset||0);
      setTimeout(()=>{isNavigating=false;},150);
    });
  }
  function navigate(id,offset=0) {
    if(location.hash.slice(1)===id){activate(id,{user:true,offset});return;}
    history.pushState(null,'','#'+id);activate(id,{user:true,offset});
  }
  function onHistory(){let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{id='';}activate(id||'reader-start',{user:true});}
  window.addEventListener('popstate',onHistory);
  window.addEventListener('hashchange',()=>{if(location.hash.slice(1)!==(activeEntry||current))onHistory();});
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;
    const u=new URL(a.href,location.href);
    if(u.pathname===location.pathname&&u.hash&&u.origin===location.origin){e.preventDefault();navigate(decodeURIComponent(u.hash.slice(1)));}
  });
  let hash;try{hash=decodeURIComponent(location.hash.slice(1));}catch{hash='';}
  activate(hash||'reader-start',{scroll:!!hash,user:!!hash});
  if(resume&&!hash){
    const title=localMap.get(resume.id)?.key||topicMap.get(resume.id)?.title||'上次阅读位置';
    $('resume-text').textContent='上次读到：'+title;$('resume-banner').hidden=false;
    $('resume-button').addEventListener('click',()=>{$('resume-banner').hidden=true;navigate(resume.id,resume.offset||0);});
  }
  refreshBookmarks();

  function highlight(el,text,tokens) {
    // Highlight literal terms. Matching also normalizes kana; snippets always preserve source text.
    if(!tokens.length){el.textContent=text;return;}
    const literal=tokens.filter(t=>t.length).sort((a,b)=>b.length-a.length).map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    if(!literal.length){el.textContent=text;return;}
    const exp=new RegExp(literal.join('|'),'gi');let at=0,match;
    while((match=exp.exec(text))){el.append(document.createTextNode(text.slice(at,match.index)));const mark=document.createElement('mark');mark.textContent=match[0];el.append(mark);at=match.index+match[0].length;}
    el.append(document.createTextNode(text.slice(at)));
  }
  function snippet(r,tokens) {
    const text=r.text||r.title;
    const positions=tokens.map(t=>text.toLowerCase().indexOf(t.toLowerCase())).filter(x=>x>=0);
    const start=positions.length?Math.max(0,Math.min(...positions)-28):0;
    return (start?'…':'')+text.slice(start,start+165)+(text.length>start+165?'…':'');
  }
  function renderResults() {
    const target=$('search-results');target.replaceChildren();
    const tokens=$('reader-search').value.trim().split(/\s+/).filter(Boolean);
    for(const r of results.slice(0,shown)){
      const a=makeLink('',linkFor(r),'result-row');
      const label=document.createElement('div');label.className='result-label';label.textContent=db.books[r.doc]+' / '+r.type+' / '+r.topicTitle;
      const title=document.createElement('strong');highlight(title,r.title,panel==='search'?tokens:[]);
      const p=document.createElement('p');highlight(p,snippet(r,panel==='search'?tokens:[]),panel==='search'?tokens:[]);
      a.append(label,title,p);target.append(a);
    }
    if(!results.length){const p=document.createElement('p');p.className='empty';p.textContent=panel==='search'?'没有找到匹配内容。可以缩短关键词，或切换搜索范围和类别。':panel==='saved'?'还没有书签。点词条右上角的 ☆ 即可收藏。':panel==='outline'?'本节没有独立词条。请从全书目录选择词汇、文法或案例分类。':'还没有最近阅读记录。打开一个词条后再来查看。';target.append(p);}
    if(results.length>shown){const more=document.createElement('button');more.className='btn result-more';more.textContent='再显示 60 条';more.addEventListener('click',()=>{shown+=60;renderResults();});target.append(more);}
  }
  function search() {
    const input=$('reader-search').value.trim();
    if(!input){closePanel();return;}
    showPanel('search');shown=60;
    const tokens=input.split(/\s+/).map(norm).filter(Boolean), scope=$('search-scope').value, kind=$('search-kind').value;
    results=all.filter(r=>(scope!=='current'||r.doc===docId)&&(kind==='all'||r.type===kind)&&tokens.every(t=>r.hay.includes(t)));
    const score=r=>tokens.reduce((s,t)=>s+(r.name===t?100:r.name.startsWith(t)?50:r.name.includes(t)?25:0),0)+(r.doc===docId?1:0);
    results.sort((a,b)=>score(b)-score(a));
    $('search-count').textContent='找到 '+results.length.toLocaleString()+' 条 · 支持中文、日文和假名检索 · 多个关键词以空格分隔';
    renderResults();
  }
  $('reader-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,160);});
  $('reader-search').addEventListener('focus',()=>{if($('reader-search').value.trim())search();});
  $('search-scope').addEventListener('change',search);$('search-kind').addEventListener('change',search);
  function library(mode) {
    showPanel(mode);shown=60;
    results=(mode==='saved'?state.bookmarks.map(id=>localMap.get(id)):mode==='outline'?(topicMap.get(current)?.entries||[]).map(id=>localMap.get(id)):state.recent.map(x=>localMap.get(x.id))).filter(Boolean);
    $('search-count').textContent=mode==='outline'?'本节词条 · '+(topicMap.get(current)?.title||'复习导航')+' · '+results.length+' 条':(mode==='saved'?'本册书签':'本册最近阅读')+' · '+results.length+' 条（只清除本册讲解记录，不影响作答记录）';
    renderResults();
  }
  async function copyLink(id) {
    const url=new URL(location.href);url.hash=id;
    try{await navigator.clipboard.writeText(url.href);toast('已复制本条链接');}
    catch{
      const area=document.createElement('textarea');area.value=url.href;area.style.cssText='position:fixed;top:-1000px';document.body.append(area);area.select();
      const ok=document.execCommand('copy');area.remove();toast(ok?'已复制本条链接':'未能复制，请复制地址栏中的链接');
      if(!ok)navigate(id);
    }
  }
  function exportRecords() {
    const backup={format:'N1-reference-reader',version:2,exportedAt:new Date().toISOString(),books:{}};
    for(const id of Object.keys(db.books))backup.books[id]=id===docId?state:readState(id);
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='N1讲解阅读记录_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出两册书签和阅读记录');
  }
  $('reader-import').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try {
      if(file.size>3000000)throw new Error('文件过大');
      const imported=JSON.parse(await file.text());
      if(imported.format!=='N1-reference-reader'||imported.version!==2||!imported.books)throw new Error('请选择本阅读室导出的记录文件');
      let changed=0;
      for(const id of Object.keys(db.books)){
        const data=imported.books[id];if(!data)continue;
        const valid=new Set(all.filter(r=>r.doc===id).map(r=>r.id)),before=id===docId?state:readState(id),merged={...before};
        merged.bookmarks=[...new Set([...before.bookmarks,...(Array.isArray(data.bookmarks)?data.bookmarks:[])])].filter(x=>valid.has(x));
        merged.recent=[...(before.recent||[]),...(Array.isArray(data.recent)?data.recent:[])].filter(x=>x&&valid.has(x.id)&&Number.isFinite(x.time)).sort((a,b)=>b.time-a.time).filter((x,i,arr)=>arr.findIndex(y=>y.id===x.id)===i).slice(0,40);
        if(data.last&&valid.has(data.last.id)&&Number.isFinite(data.last.time)&&(!before.last||data.last.time>before.last.time))merged.last={id:data.last.id,time:data.last.time,offset:Math.max(-1000,Math.min(10000,Number(data.last.offset)||0))};
        localStorage.setItem(prefix+id,JSON.stringify(merged));if(id===docId)state=merged;changed++;
      }
      refreshBookmarks();drawRail();library('saved');toast('已合并 '+changed+' 册阅读记录');
    } catch(error){toast('导入未完成：'+error.message);}finally{e.target.value='';}
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;
    if(action==='bookmark'){
      const id=b.dataset.entry,yes=state.bookmarks.includes(id);state.bookmarks=yes?state.bookmarks.filter(x=>x!==id):[...state.bookmarks,id];persist();refreshBookmarks();drawRail();toast(yes?'已取消收藏':'已加入本册书签');
    }else if(action==='copy')copyLink(b.dataset.entry);
    else if(action==='saved'||action==='recent'||action==='outline')library(action);
    else if(action==='export')exportRecords();
    else if(action==='import')$('reader-import').click();
    else if(action==='clear-reader'){
      if(confirm('清除本册的书签、最近阅读和阅读位置？本册显示设置及题库作答记录会保留。')){
        state={...state,bookmarks:[],recent:[],last:null};tracking=false;persist();refreshBookmarks();drawRail();$('resume-banner').hidden=true;library('saved');toast('已清除本册阅读记录');
      }
    }else if(action==='open-nav'){document.body.classList.add('nav-open');closePanel();}
    else if(action==='close-nav')closeNav();
    else if(action==='close-panel')closePanel();
    else if(action==='dismiss-resume')$('resume-banner').hidden=true;
    else if(action==='font-up'||action==='font-down'){state.font=Math.min(23,Math.max(14,state.font+(action==='font-up'?1:-1)));setFont();persist();toast('正文字号 '+state.font+' px');}
    else if(action==='continuous'){
      state.continuous=!state.continuous;persist();applyVisibility(current);$(activeEntry||current)?.scrollIntoView({block:'start'});toast(state.continuous?'已展开全书，可用 Ctrl+F 查找或打印':'已切回分类阅读');
    }else if(action==='help'){
      showPanel('help');$('search-count').textContent='阅读工具与快捷方式';
      $('search-results').innerHTML='<div class="added-note"><b>查找与定位</b><p>左侧按章节、分类切换；右侧列出本节词条。顶部支持两册联搜，也可限定当前册或内容类别。按 / 聚焦搜索，按 Esc 关闭浮层。</p><b>书签与阅读位置</b><p>每条右上角的 ☆ 可收藏，↗ 可复制独立链接。再次打开本页后，可从“上次读到”接着看。导出记录包含两册书签和阅读位置；导入时合并已有书签。</p><b>连续阅读与 PDF</b><p>“连续阅读”展开全书，适合 Ctrl+F 查找和打印。PDF 链接使用文件实际页码。浏览器需支持 PDF 页码跳转。</p><b>删除与备份</b><p>“清除本册记录”只删除当前册书签和阅读位置。移动文件夹或更换浏览器前，建议先导出阅读记录。</p></div>';
    }
  });
  document.querySelectorAll('[data-rail]').forEach(b=>b.addEventListener('click',()=>{rail=b.dataset.rail;drawRail();}));
  $('outline-filter').addEventListener('input',drawRail);
  $('toc-filter').addEventListener('input',e=>{
    const query=norm(e.target.value);
    document.querySelectorAll('#toc details').forEach(d=>{
      const heading=norm(d.querySelector('summary').textContent),matches=heading.includes(query);let visible=0;
      d.querySelectorAll('a').forEach(a=>{a.hidden=!!query&&!matches&&!norm(a.textContent).includes(query);if(!a.hidden)visible++;});
      d.hidden=!!query&&!visible;if(query&&visible)d.open=true;
    });
  });
  document.addEventListener('keydown',e=>{
    const editing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable;
    if(e.key==='/'&&!editing){e.preventDefault();$('reader-search').focus();}
    if(e.key==='Escape'){closePanel();closeNav();$('reader-search').blur();}
    if(e.key==='Enter'&&e.target===$('reader-search')){e.preventDefault();search();$('search-results').querySelector('a')?.focus();}
    if((e.key==='ArrowDown'||e.key==='ArrowUp')&&!$('search-panel').hidden){
      const links=[...$('search-results').querySelectorAll('a')],ix=links.indexOf(document.activeElement);
      if(links.length&&(document.activeElement===$('reader-search')||ix>=0)){e.preventDefault();links[Math.min(links.length-1,Math.max(0,ix+(e.key==='ArrowDown'?1:-1)))]?.focus();}
    }
  });
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#search-panel')&&!e.target.closest('.searchbox')&&!e.target.closest('[data-action]'))closePanel();});
  function saveScroll() {
    if(!tracking||isNavigating||document.hidden)return;
    const offset=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar'))+100;
    let currentCard=null;
    // A small current category is cheap to inspect; continuous mode narrows by visible chapters.
    for(const card of document.querySelectorAll('.entry-card')){
      if(!card.offsetParent)continue;const rect=card.getBoundingClientRect();
      if(rect.top<=offset&&rect.bottom>offset){currentCard=card;break;}
      if(rect.top>offset){if(rect.top<innerHeight*.6)currentCard=card;break;}
    }
    if(currentCard){
      activeEntry=currentCard.id;const topic=localMap.get(activeEntry).topic;
      if(topic!==current&&state.continuous)updateLocation(topic);
      document.querySelectorAll('#outline-list a').forEach(a=>a.classList.toggle('active',a.hash==='#'+activeEntry));
      const anchorMargin=parseFloat(getComputedStyle(currentCard).scrollMarginTop)||156;
      track(activeEntry,anchorMargin-currentCard.getBoundingClientRect().top);
    }else if(current!=='reader-start')track(current,0);
  }
  window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(saveScroll,300);},{passive:true});
  window.addEventListener('pagehide',()=>{clearTimeout(scrollTimer);saveScroll();});
  window.addEventListener('storage',e=>{if(e.key===prefix+docId){state=readState(docId);refreshBookmarks();drawRail();}});
})();
