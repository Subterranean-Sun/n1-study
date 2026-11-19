(() => {
  'use strict';
  const PREFIX='n1.study.2026.v1.';
  const empty=()=>({total:0,gradable:0,excluded:0,answered:0,answeredGradable:0,correct:0,wrong:0,unansweredGradable:0});
  const add=(a,b)=>{for(const k of Object.keys(empty()))a[k]+=b[k];return a;};
  function effective(q,s) {
    if(!s)return null;
    if(q.sort){
      const order=s.orders?.[q.id],index=q.sort.starIndex;
      if(!Array.isArray(order)||order.length!==4||new Set(order).size!==4||!order.every(x=>Number.isInteger(x)&&x>=1&&x<=4)||!Number.isInteger(index)||index<0||index>3)return null;
      return order[index];
    }
    const n=s.answers?.[q.id];return Number.isInteger(n)&&n>=1&&n<=q.options.length?n:null;
  }
  function measure(qs,s) {
    const out=empty();
    for(const q of qs){
      out.total++;const answer=effective(q,s),known=!q.excludeFromScore&&Number.isInteger(q.answer)&&q.answer>=1&&q.answer<=q.options.length;
      if(answer!==null)out.answered++;
      if(!known){out.excluded++;continue;}
      out.gradable++;
      if(answer===null)out.unansweredGradable++;
      else {out.answeredGradable++;if(answer===q.answer)out.correct++;else out.wrong++;}
    }
    return out;
  }
  function examStats(exam,records,submittedOnly) {
    const out={...empty(),id:exam.id,label:exam.label,submittedGroups:0,recordedGroups:0,groupCount:exam.groups.length,sections:{language:empty(),reading:empty(),listening:empty()},groups:[]};
    const qmap=new Map(exam.questions.map(q=>[String(q.id),q]));
    for(const g of exam.groups){
      const saved=records[PREFIX+exam.id+'.'+g.id],valid=saved&&typeof saved.answers==='object'&&!Array.isArray(saved.answers),s=valid&&(!submittedOnly||saved.submitted)?saved:null;
      const qs=g.questionIds.map(id=>qmap.get(String(id))).filter(Boolean),m=measure(qs,s);
      if(valid)out.recordedGroups++;if(valid&&saved.submitted)out.submittedGroups++;
      const part=String(g.id).startsWith('L')?'listening':Number(g.id)<=7?'language':'reading';
      add(out,m);add(out.sections[part],m);
      out.groups.push({...m,id:g.id,title:g.title,status:!valid?'未开始':saved.submitted?'已提交':submittedOnly?'练习中（未计入作答）':'练习中'});
    }
    return out;
  }
  // Pure functions are exposed so an AI or maintainer can test the scoring rules.
  const API={PREFIX,empty,add,effective,measure,examStats};
  if(typeof window!=='undefined')window.N1_STATS=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id), C=window.N1_CATALOG, DATA=window.N1_DATA=window.N1_DATA||{};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=(n,d)=>d?(n/d*100).toFixed(1)+'%':'—';
  let imported=null,lastRows=[],token=0;
  function browserRecords(){
    const records={};let failed=false;
    try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(PREFIX))try{const s=JSON.parse(localStorage.getItem(k));if(s&&typeof s.answers==='object'&&!Array.isArray(s.answers))records[k]=s;}catch{}}}
    catch{failed=true;}
    return {records,failed};
  }
  function ensure(id){return new Promise((resolve,reject)=>{if(DATA[id])return resolve(DATA[id]);const s=document.createElement('script');s.src='data/'+id+'.js';s.onload=()=>DATA[id]?resolve(DATA[id]):reject(Error(id+' 数据未注册'));s.onerror=()=>reject(Error('无法打开 data/'+id+'.js'));document.head.append(s);});}
  function row(label,s,status=''){return '<tr><td>'+esc(label)+(status?'<small>'+esc(status)+'</small>':'')+'</td><td>'+s.correct+' / '+s.gradable+'</td><td>'+s.answeredGradable+'</td><td>'+s.wrong+'</td><td>'+s.unansweredGradable+'</td><td>'+s.excluded+'</td><td>'+pct(s.correct,s.answeredGradable)+'</td><td>'+pct(s.correct,s.gradable)+'</td><td>'+pct(s.answered,s.total)+'</td></tr>';}
  const head='<thead><tr><th>范围</th><th>原始题数分</th><th>已做计分题</th><th>答错</th><th>未做计分题</th><th>待核不计分</th><th>已做题正确率</th><th>整卷/组得分率</th><th>作答完成率</th></tr></thead>';
  async function render(){
    const mine=++token,source=imported||browserRecords(),records=source.records,submitted=$('submitted').checked,chosen=$('exam-filter').value;
    $('source-label').textContent=imported?'当前来源：所选 JSON 备份（仅在本页读取）':'当前来源：当前浏览器练习记录';
    $('result').innerHTML='<p class="empty">正在计算…</p>';
    const metas=C.exams.filter(e=>(!chosen||e.id===chosen)&&e.groups.some(g=>{const s=records[PREFIX+e.id+'.'+g.id];return s&&typeof s.answers==='object'&&(!submitted||s.submitted);}));
    try{
      const exams=await Promise.all(metas.map(e=>ensure(e.id)));if(mine!==token)return;
      const rows=exams.map(e=>examStats(e,records,submitted));lastRows=rows;
      if(!rows.length){$('metrics').innerHTML='';$('result').innerHTML='<div class="panel empty"><h2>当前范围没有可统计记录</h2><p>'+(source.failed?'浏览器不允许读取本地存储。请在题库导出练习记录后，点击“读取练习备份”。':submitted?'可以先提交一个题型，或取消“只统计已提交题型”。':'请先做题，或读取题库导出的练习 JSON。')+'</p></div>';return;}
      const total=rows.reduce((a,r)=>add(a,r),empty());
      $('metrics').innerHTML=[['原始题数分',total.correct+' / '+total.gradable],['已做题正确率',pct(total.correct,total.answeredGradable)],['整卷得分率',pct(total.correct,total.gradable)],['已作答 / 全部题',total.answered+' / '+total.total]].map(([label,val])=>'<div class="metric"><span>'+label+'</span><b>'+val+'</b></div>').join('');
      let body='<section class="panel"><h2>按试卷汇总</h2><div class="table-wrap"><table>'+head+'<tbody>'+rows.map(s=>row(s.label,s,'已提交 '+s.submittedGroups+' / '+s.groupCount+' 组')).join('')+'</tbody></table></div></section>';
      for(const s of rows){
        body+='<details class="panel"><summary>'+esc(s.label)+' · 分科与题型</summary><div class="table-wrap"><table>'+head+'<tbody>'+row('语言知识（词汇＋文法）',s.sections.language)+row('阅读',s.sections.reading)+row('听力',s.sections.listening)+'</tbody></table></div><div class="table-wrap"><table>'+head+'<tbody>'+s.groups.map(g=>row(g.title,g,g.status)).join('')+'</tbody></table></div></details>';
      }
      $('result').innerHTML=body;
    }catch(e){if(mine===token){$('metrics').innerHTML='';$('result').innerHTML='<p class="panel error">'+esc(e.message)+'。请把统计页面和脚本放入完整题库目录。</p>';}}
  }
  function exportCSV(){
    if(!lastRows.length)return;
    const lines=[['试卷','范围','原始得分','可计分总题数','已做可计分题','答错','未做可计分题','不计分题','已做题正确率','整卷或组得分率','作答完成率']];
    function push(label,r,exam){lines.push([exam,label,r.correct,r.gradable,r.answeredGradable,r.wrong,r.unansweredGradable,r.excluded,pct(r.correct,r.answeredGradable),pct(r.correct,r.gradable),pct(r.answered,r.total)]);}
    for(const r of lastRows){push('全卷',r,r.label);for(const [key,label]of [['language','语言知识'],['reading','阅读'],['listening','听力']])push(label,r.sections[key],r.label);for(const g of r.groups)push(g.title,g,r.label);}
    const csv='\ufeff'+lines.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='N1练习统计_'+(imported?'备份':'本机')+'_'+($('submitted').checked?'已提交':'全部当前')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(!C){$('result').textContent='未找到 data/catalog.js。请按维护手册把扩展复制到题库根目录。';return;}
  $('exam-filter').innerHTML='<option value="">所有有记录的试卷</option>'+C.exams.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.label)+'</option>').join('');
  $('exam-filter').addEventListener('change',render);$('submitted').addEventListener('change',render);
  $('refresh').addEventListener('click',()=>{imported=null;render();});$('backup-open').addEventListener('click',()=>$('backup').click());$('csv').addEventListener('click',exportCSV);
  $('backup').addEventListener('change',async e=>{
    const f=e.target.files[0];if(!f)return;
    try{if(f.size>20000000)throw Error('备份文件过大');const d=JSON.parse(await f.text());if(d.format!=='n1-study-cache'||d.version!==1||!d.records||Array.isArray(d.records)||typeof d.records!=='object')throw Error('请选择题库导出的 n1-study-cache 第1版 JSON');imported={records:d.records,failed:false};render();}
    catch(err){$('result').innerHTML='<p class="panel error">'+esc(err.message)+'</p>';}finally{e.target.value='';}
  });
  window.addEventListener('storage',e=>{if(!imported&&e.key?.startsWith(PREFIX))render();});
  render();
})();
