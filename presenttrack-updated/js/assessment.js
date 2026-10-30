/* Initial Presentation Assessment (new users): card, assessment page with recording, results view.
   Talks to the Supabase Edge Functions through PTCloud. The OpenAI key never reaches the browser. */
(()=>{
const X=podium.ext;if(!X)return;
const {S,V,B,go,render,toast,esc,page,sec,nodata,fmt,flash,robot,notify,today,confirmDlg}=X;
const $=id=>document.getElementById(id);
const cloud=()=>!!(window.PTCloud&&PTCloud.enabled);
const A={loading:false,err:null,poll:0,slide:0,rec:{st:'idle'},retake:false,busyDel:false};
const CLASS={proficient:['Proficient','The measured performance meets the assessment criteria.','ok'],developing:['Developing','You show some effective speaking skills and have room to improve.','warn'],needs_improvement:['Needs Improvement','Several areas need practice. That is normal for a first baseline.','warn']};
const STAT={ready:['Assessment Required','warn'],in_progress:['Assessment In Progress','warn'],completed:['Assessment Completed','ok'],generating:['Preparing…',''],failed:['Could not prepare','warn']};
const mmss=s=>fmt(Math.max(0,s||0));
const T0=t=>mmss(t);

/* ------------ state sync with the server ------------ */
function setRow(row,required){
  S.assess=row||null;
  if(typeof required==='boolean'){S.assessRequired=required;PTCloud.assessmentDone=!required}
  if(row&&row.status==='completed'&&row.results)syncSession(row.results);
}
function syncSession(r){
  const m=r.metrics||{},d=r.durationAssessment||{},tg=Math.round(((d.targetMinSec||120)+(d.targetMaxSec||180))/2);
  const x={id:null,deck:'Initial Assessment',d:today(),dur:Math.round(m.totalDurationSec||0),wpm:Math.round(m.wpm||0),fill:m.fillerCount||0,pau:m.pauseCount||0,score:Math.round(r.score||0),tg,assess:true};
  const i=S.ses.findIndex(q=>q.assess);
  if(i>=0){x.id=S.ses[i].id;x.d=S.ses[i].d;if(r.created_at&&S.ses[i].at===r.created_at)return;S.ses[i]=Object.assign(x,{at:r.created_at})}
  else{x.id=S.nid++;x.at=r.created_at;S.ses.push(x)}
}
function refresh(){if(!$('app').hidden&&['decks','dash','assess','assres'].includes(S.view)){const y=$('mainc').scrollTop;render();$('mainc').scrollTop=y}}
async function call(action){
  const r=await PTCloud.assessment(action);
  if(r.error)return r;
  setRow(r.data.assessment,!r.data.userState.initial_assessment_completed&&r.data.required!==false);
  if(r.data.required===false&&!r.data.assessment)S.assessRequired=false;
  return r;
}
podium.assessInit=async()=>{
  if(!cloud())return;
  A.loading=true;A.err=null;A.poll=0;refresh();
  await loadEnsure();
};
async function loadEnsure(retryAction){
  A.loading=true;refresh();
  const r=await call(retryAction||'ensure');
  A.loading=false;A.err=r.error?r.error:null;
  refresh();
  if(!r.error&&S.assess&&S.assess.status==='generating'&&A.poll++<12)setTimeout(()=>{if(S.assess&&S.assess.status==='generating')loadEnsure('status')},4000);
  if(!r.error&&S.assess&&S.assess.status==='ready'&&S.assessRequired&&!A.greeted){A.greeted=1;robot('reminder','Your Initial Presentation Assessment is ready in My Presentations.',5200)}
}
const retry=()=>{A.err=null;A.poll=0;loadEnsure('ensure')};

/* ------------ pieces shown in other pages ------------ */
const first=row=>{const s=row&&row.slides&&row.slides[0];return s?s:{title:'Initial Presentation Assessment',bullets:[]}};
podium.assessCard=i=>{
  if(!cloud())return '';
  const row=S.assess,st=row&&STAT[row.status];
  if(row&&row.status==='completed'&&!row.file_path)return '';   /* deck was deleted; results stay in Reports */
  const head=`<section class="pn rise dcard acard" style="--i:${i}" data-assess="1">`;
  if(!row&&!A.err&&(A.loading||S.assessRequired))return head+`<div class="th pv ph" aria-hidden="true"><b>…</b></div><div class="dkt"><b>Initial Presentation Assessment</b><small>Preparing your baseline presentation. This takes a few seconds.</small></div><div class="alo" role="status"><i></i>Generating your practice slides…</div></section>`;
  if(!row&&!A.err)return '';
  if(A.err&&!row||row&&row.status==='failed')return head+`<div class="th pv ph" aria-hidden="true"><b>!</b></div><div class="dkt"><b>Initial Presentation Assessment</b><small>${esc(A.err||'We could not prepare your assessment right now. Please try again.')}</small></div><div class="acts"><button class="bt sm" data-act="aretry" type="button">RETRY</button></div></section>`;
  if(row.status==='generating')return head+`<div class="th pv ph" aria-hidden="true"><b>…</b></div><div class="dkt"><b>Initial Presentation Assessment</b><small>Preparing your baseline presentation…</small></div><div class="alo" role="status"><i></i>Generating your practice slides…</div></section>`;
  const f=first(row),done=row.status==='completed',low=row.quality==='low';
  return head+`<div class="th pv"><b>${esc(f.title)}</b>${(f.bullets||[]).slice(0,2).map(l=>`<span>${esc(l)}</span>`).join('')}</div>
  <div class="dk"><span class="ftp ppt">PowerPoint</span><div class="dkt"><b>Initial Presentation Assessment</b><small class="albl">SYSTEM-PROVIDED · BASELINE</small><small>${esc(row.title||'Practice talk')}</small></div></div>
  <p class="sub" style="margin:0 0 10px">A short baseline so we can measure how you speak today: speed, duration, filler words and pauses. It is not a final judgment of your ability.</p>
  <div class="rd0"><div><p class="sub" style="margin:0 0 8px"><span class="st ${STAT[row.status][1]}">${STAT[row.status][0]}</span></p><div class="acts">${done?`<button class="bt sm" data-go="assres" type="button">VIEW RESULTS</button>${low?'<button class="bt gh sm" data-act="aretake" type="button">RETAKE</button>':''}`:`<button class="bt sm" data-go="assess" type="button">PRACTICE</button>`}<button class="bt gh sm" data-act="adel" type="button"${done&&!A.busyDel?'':' disabled'} title="${done?'Delete this presentation':'Finish the assessment before deleting it'}">${A.busyDel?'DELETING…':'DELETE'}</button></div></div></div></section>`;
};
podium.assessBanner=()=>{
  if(!cloud()||!S.assessRequired)return '';
  const row=S.assess,st=row?row.status:'';
  const txt=A.err&&!row?'We could not prepare your assessment. You can retry from My Presentations.':st==='generating'||!row?'We are preparing a short practice presentation for you…':'Do a short baseline assessment first. It takes about 3 minutes and unlocks practice with your own presentations.';
  const btn=A.err&&!row?'<button class="bt" data-act="aretry" type="button">RETRY</button>':row&&row.status==='failed'?'<button class="bt" data-act="aretry" type="button">RETRY</button>':row&&(st==='ready'||st==='in_progress')?'<button class="bt" data-go="assess" type="button">START ASSESSMENT</button>':'<button class="bt gh" data-go="decks" type="button">OPEN MY PRESENTATIONS</button>';
  return `<section class="pn rise cont" style="--i:0"><div><h3 class="sh">START HERE · INITIAL PRESENTATION ASSESSMENT</h3><p class="sub" style="margin:0">${esc(txt)}</p></div>${btn}</section>`;
};

/* ------------ assessment page ------------ */
V.assess=()=>{
  const row=S.assess;
  if(!cloud())return page('Initial Presentation Assessment','',sec('NOT AVAILABLE',1,nodata('The assessment needs an account connected to the cloud.')));
  if(row&&row.status==='completed'&&!A.retake)return V.assres();
  if(!row||row.status==='generating'||row.status==='failed'){
    const busy=!row&&!A.err||row&&row.status==='generating'||A.loading;
    return page('Initial Presentation Assessment','Your baseline practice talk.',sec('PREPARING',1,busy?`<div class="alo" role="status"><i></i>Generating your practice slides…</div>`:nodata(esc(A.err||'We could not prepare your assessment right now.'),'<button class="bt" data-act="aretry" type="button">RETRY</button>')+(!S.assessRequired&&!row?'':'')));
  }
  const g=row.guidelines||{},n=(row.slides||[]).length;A.slide=Math.max(0,Math.min(A.slide,n-1));
  return page('Initial Presentation Assessment','Present this short talk out loud. We measure how you speak today.',
   sec('ABOUT THIS ASSESSMENT',1,`<ul class="tp"><li>This is a <b>baseline</b> to measure your current speaking. It is not a definitive judgment of your public-speaking ability.</li><li>We measure <b>speaking speed (WPM)</b>, <b>duration</b> (target 2 to 3 minutes), <b>filler words</b> and <b>long pauses</b>.</li><li>We do <b>not</b> evaluate eye contact, gestures, confidence or body language.</li><li>Find a quiet place and allow microphone access when asked. Speak naturally, as if presenting to a class.</li></ul>`)
   +`<div class="g-next">${sec('YOUR SLIDES',2,`<div class="vwh"><span id="ac" aria-live="polite"></span></div><div class="vst" id="avst" aria-live="polite"></div><div class="vctl"><div class="vbt" role="group" aria-label="Slide controls"><button class="bt gh sm vic" id="apv" type="button" aria-label="Previous slide"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><button class="bt sm vic" id="anx" type="button" aria-label="Next slide"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button><button class="bt gh sm" id="adl" type="button"${row.file_path?'':' disabled'}>Download .pptx</button></div></div>`)}
   ${sec('ASSESSMENT GUIDELINES',3,`<p class="sub" style="margin:0 0 8px">${esc(g.overview||'Present the slides in your own words.')}</p>${g.estimatedMinutes?`<p class="basis" style="margin:0 0 8px">Estimated time: about ${esc(g.estimatedMinutes)} minutes</p>`:''}<ul class="tp">${(g.instructions||[]).map(t=>`<li>${esc(t)}</li>`).join('')}${(g.tips||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`)}</div>`
   +sec('RECORD YOUR PRESENTATION',4,`<div id="arec"></div>`));
};
function slideEl(s,i,n){
  const d=document.createElement('div');d.className='sld'+(s.kind==='title'?' stitle':'');
  const h=document.createElement('h4');h.textContent=s.title||'Slide '+(i+1);d.appendChild(h);
  if((s.bullets||[]).length){const u=document.createElement('ul');s.bullets.forEach(t=>{const l=document.createElement('li');l.textContent=t;u.appendChild(l)});d.appendChild(u)}
  return d}
function showSlide(){
  const row=S.assess,host=$('avst');if(!row||!host)return;const sl=row.slides||[];
  A.slide=Math.max(0,Math.min(A.slide,sl.length-1));
  host.replaceChildren(slideEl(sl[A.slide],A.slide,sl.length));$('ac').textContent='Slide '+(A.slide+1)+' / '+sl.length;
  $('apv').disabled=A.slide<=0;$('anx').disabled=A.slide>=sl.length-1}
document.addEventListener('keydown',e=>{if(!$('avst')||e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;
  if(e.key==='ArrowRight'){A.slide++;showSlide();e.preventDefault()}else if(e.key==='ArrowLeft'){A.slide--;showSlide();e.preventDefault()}});

/* ------------ recorder ------------ */
const R={mr:null,stream:null,chunks:[],t0:0,iv:null,ctx:null,raf:0,mime:'',blob:null,dur:0};
const MIN=20,MAX=600;
function setRec(o){A.rec=o;drawRec()}
function drawRec(){
  const h=$('arec');if(!h)return;const r=A.rec;let b='';
  if(r.st==='idle')b=`<div class="arec"><div class="atm"><b id="atm">0:00</b><small>Recommended: 2 to 3 minutes</small></div><p class="sub" style="margin:0">Press Start, then present the slides out loud in your own words. Press Finish when you are done.</p><div class="acts"><button class="bt" data-act="astart" type="button">START ASSESSMENT</button></div></div>`;
  else if(r.st==='ask')b=`<div class="alo" role="status"><i></i>Waiting for microphone permission…</div>`;
  else if(r.st==='rec')b=`<div class="arec"><div class="atm rec"><b id="atm">0:00</b><small>● Recording</small></div><div class="alv" id="alv" aria-hidden="true">${'<i></i>'.repeat(28)}</div><p class="vnote" id="anote" role="status" style="text-align:left"></p><div class="acts"><button class="bt" data-act="afin" type="button">FINISH</button><button class="bt gh" data-act="acancel" type="button">Cancel</button></div></div>`;
  else if(r.st==='busy')b=`<div class="alo" role="status"><i></i>Transcribing and analyzing your speech. This can take up to a minute…</div>`;
  else if(r.st==='err')b=`<div class="arec"><p class="wr" role="alert">${esc(r.msg)}</p>${(r.warnings||[]).length?`<ul class="tp">${r.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}<div class="acts">${r.again&&R.blob?'<button class="bt" data-act="asend" type="button">TRY AGAIN WITH THE SAME RECORDING</button>':''}<button class="bt ${r.again&&R.blob?'gh':''}" data-act="astart" type="button">RECORD AGAIN</button></div></div>`;
  h.innerHTML=b;
}
function stopMedia(){clearInterval(R.iv);cancelAnimationFrame(R.raf);try{R.ctx&&R.ctx.close()}catch(e){}R.ctx=null;try{R.stream&&R.stream.getTracks().forEach(t=>t.stop())}catch(e){}R.stream=null}
podium.leave=()=>{if(R.mr&&R.mr.state!=='inactive'){R.mr.ondataavailable=R.mr.onstop=null;try{R.mr.stop()}catch(e){}R.mr=null;R.chunks=[];stopMedia();A.rec={st:'idle'}}};
const elapsed=()=>(performance.now()-R.t0)/1000;
async function startRec(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder)return setRec({st:'err',msg:'This browser cannot record audio. Please use a recent Chrome, Edge, Firefox or Safari.'});
  setRec({st:'ask'});R.blob=null;
  try{R.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})}
  catch(e){return setRec({st:'err',msg:e&&e.name==='NotFoundError'?'No microphone was found. Connect one and try again.':'Microphone access was blocked. Allow it in your browser settings, then try again.'})}
  if(!$('arec')){stopMedia();return}
  R.mime=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))||'';
  try{R.mr=new MediaRecorder(R.stream,R.mime?{mimeType:R.mime}:undefined)}catch(e){stopMedia();return setRec({st:'err',msg:'Recording is not supported on this device.'})}
  R.chunks=[];R.mr.ondataavailable=e=>{if(e.data&&e.data.size)R.chunks.push(e.data)};R.mr.start(1000);R.t0=performance.now();
  setRec({st:'rec'});
  PTCloud.assessment('start').then(r=>{if(r.data&&r.data.assessment&&S.assess)S.assess.status=r.data.assessment.status});
  try{const AC=window.AudioContext||window.webkitAudioContext,c=R.ctx=new AC(),an=c.createAnalyser();an.fftSize=64;c.createMediaStreamSource(R.stream).connect(an);const buf=new Uint8Array(an.frequencyBinCount);
    const loop=()=>{R.raf=requestAnimationFrame(loop);const bars=$('alv');if(!bars)return;an.getByteFrequencyData(buf);[...bars.children].forEach((b,i)=>b.style.transform='scaleY('+(Math.max(.08,(buf[i%buf.length]||0)/255)).toFixed(2)+')')};loop()}catch(e){}
  R.iv=setInterval(()=>{const t=$('atm');if(!t){return}const e=elapsed();t.textContent=mmss(e);if(e>=MAX)finishRec(true)},250);
}
function finishRec(auto){
  if(!R.mr||R.mr.state==='inactive')return;
  const e=elapsed();
  if(e<MIN&&!auto){const n=$('anote');if(n)n.textContent='Please speak for at least '+MIN+' seconds so we have enough to measure.';return}
  R.dur=e;const mr=R.mr;
  mr.onstop=()=>{const type=(R.chunks[0]&&R.chunks[0].type)||R.mime||'audio/webm';R.blob=new Blob(R.chunks,{type});R.chunks=[];R.mr=null;stopMedia();sendRec()};
  try{mr.stop()}catch(x){stopMedia();setRec({st:'err',msg:'The recording could not be saved. Please record again.'})}
}
async function sendRec(){
  if(!R.blob||!R.blob.size)return setRec({st:'err',msg:'No audio was captured. Please record again.'});
  setRec({st:'busy'});robot('thinking','Analyzing your speech…',6000);
  const t=R.blob.type||'';const ext=/mp4/.test(t)?'m4a':/ogg/.test(t)?'ogg':'webm';
  const r=await PTCloud.submitAssessment(R.blob,'assessment.'+ext,R.dur);
  if(!$('arec')&&S.view!=='assess'){/* user navigated away: still store the result below */}
  if(r.error){
    if(r.code==='unusable_recording'){R.blob=null;return setRec({st:'err',msg:r.error,warnings:(r.quality&&r.quality.warnings)||[],again:false})}
    return setRec({st:'err',msg:r.error,again:r.retryable!==false})}
  const res=r.data.results;R.blob=null;A.retake=false;
  const row=Object.assign({},S.assess||{},{status:'completed',results:res,classification:res.classification,quality:(res.quality||{}).level});
  setRow(row,false);
  notify('✅','Initial assessment complete','Your baseline report is ready.');flash('Initial assessment completed!','success','Great job! Your baseline report is ready.');
  podium.save&&podium.save();go('assres');
}

/* ------------ results ------------ */
function paceGauge(wpm,c){
  const lo=60,hi=220,W=420,x=v=>10+(Math.max(lo,Math.min(hi,v))-lo)/(hi-lo)*(W-20),p=c.pace||{idealMin:130,idealMax:160,acceptableMin:110,acceptableMax:180};
  return `<svg class="cht" viewBox="0 0 ${W} 78" role="img" aria-label="Speaking speed ${Math.round(wpm)} words per minute. Clear range ${p.idealMin} to ${p.idealMax}."><rect x="10" y="30" width="${W-20}" height="12" rx="6" fill="var(--cs)" style="filter:none" stroke="var(--ish)"/><rect x="${x(p.acceptableMin)}" y="30" width="${x(p.acceptableMax)-x(p.acceptableMin)}" height="12" rx="6" fill="color-mix(in srgb,var(--ok) 28%,transparent)" style="filter:none"/><rect x="${x(p.idealMin)}" y="30" width="${x(p.idealMax)-x(p.idealMin)}" height="12" rx="6" fill="var(--ok)" style="filter:none"/><path d="M${x(wpm)} 26l-7-14h14z" fill="var(--b2)"/><text x="${x(wpm)}" y="8" text-anchor="middle" class="pv">${Math.round(wpm)}</text><text x="10" y="62">${lo}</text><text x="${x(p.idealMin)}" y="62" text-anchor="middle">${p.idealMin}</text><text x="${x(p.idealMax)}" y="62" text-anchor="middle">${p.idealMax}</text><text x="${W-10}" y="62" text-anchor="end">${hi}+</text></svg>`}
function timeline(m){
  const W=600,tot=Math.max(1,m.totalDurationSec||1),x=t=>8+Math.min(1,t/tot)*(W-16);
  const pa=(m.pauses||[]).map(p=>`<rect x="${x(p.t)}" y="22" width="${Math.max(3,x(p.t+p.dur)-x(p.t))}" height="26" rx="3" fill="color-mix(in srgb,var(--err) 55%,transparent)" style="filter:none"><title>Pause ${mmss(p.t)} · ${p.dur}s</title></rect>`).join('');
  const fi=(m.fillers||[]).map(f=>`<rect x="${x(f.t)-1.5}" y="14" width="3" height="42" rx="1.5" fill="#E8930C" style="filter:none"><title>${esc(f.word)} at ${mmss(f.t)}</title></rect>`).join('');
  return `<svg class="cht" viewBox="0 0 ${W} 86" role="img" aria-label="Timeline of your talk with ${m.fillerCount} filler words and ${m.pauseCount} long pauses"><rect x="8" y="22" width="${W-16}" height="26" rx="8" fill="var(--cs)" style="filter:none" stroke="var(--ish)"/>${pa}${fi}<text x="8" y="72">0:00</text><text x="${W-8}" y="72" text-anchor="end">${mmss(tot)}</text><text x="${W/2}" y="72" text-anchor="middle">Talk timeline</text></svg><p class="basis" style="margin:6px 0 0"><span class="lg amber"></span> filler word &nbsp; <span class="lg red"></span> long pause</p>`}
V.assres=()=>{
  const row=S.assess,r=row&&row.results;
  if(!r)return page('Assessment results','',sec('RESULTS',1,nodata('No assessment results yet.','<button class="bt" data-go="decks" type="button">MY PRESENTATIONS</button>')));
  const m=r.metrics||{},q=r.quality||{},c=r.criteria||{},d=r.durationAssessment||{},dims=r.dims||{},f=r.feedback||{},cl=CLASS[r.classification]||['Result',''],
    dst={too_short:'Too short',within_range:'Within the target range',too_long:'Too long'}[d.status]||'',
    pst=dims.pace?dims.pace.label:'';
  const list=a=>(a&&a.length)?`<ul class="tp">${a.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'<p class="em">Nothing to show here.</p>';
  const dimRow=(k,n)=>{const x=dims[k];return x?`<div class="gl2"><div class="gh2"><span>${n}</span><b>${esc(x.label)}</b></div><div class="bar2"><i style="width:${(x.points/2*100)}%"></i></div><p class="basis" style="margin:4px 0 0">${esc(x.detail||'')}</p></div>`:''};
  const ft=m.fillers||[],ps=m.pauses||[];
  return page('Initial Assessment Results',(r.created_at?new Date(r.created_at).toLocaleDateString('en',{month:'long',day:'numeric',year:'numeric'}):'')+' · Baseline assessment',
   (q.level==='low'?`<div class="bn warn" role="alert"><span>⚠</span><b>${esc((q.warnings&&q.warnings[0])||'The audio quality or speech recognition confidence was low.')} Some numbers may be off. You can record again for a more reliable baseline.</b><button class="bt sm" data-act="aretake" type="button">RETAKE</button></div>`:'')
   +sec('YOUR BASELINE',1,`<div class="cont"><div><h2 class="pt">${cl[0]} <span class="st ${cl[2]}">${Math.round(r.score||0)} / 100</span></h2><p class="sub" style="margin:0">${esc(cl[1])}</p></div></div><p class="basis" style="margin:12px 0 0">${esc(r.explanation||'This is a baseline assessment, not a definitive judgment of your public-speaking ability. Eye contact, gestures, confidence and body language are not evaluated.')}</p>`)
   +`<div class="g-perf five">${[['Speaking Speed',Math.round(m.wpm||0)+' WPM',pst],['Spoken Words',m.words||0,'Recognized by speech-to-text'],['Duration',mmss(m.totalDurationSec),dst],['Filler Words',m.fillerCount||0,'Possible fillers'],['Long Pauses',m.pauseCount||0,m.longestPause?'Longest '+m.longestPause+'s':'None detected']].map(([n,v,s])=>`<article class="mc"><h4>${n}</h4><p class="mv">${v}</p><small>${esc(s||'')}</small></article>`).join('')}</div>`
   +`<div class="g2">${sec('SPEAKING SPEED',2,paceGauge(m.wpm||0,c)+`<p class="basis" style="margin:6px 0 0">WPM counts words per minute of actual speaking time. Pauses of ${c.pauses?c.pauses.longPauseSec:2} seconds or more are not counted as speaking time. Overall pace including those pauses: ${Math.round(m.overallWpm||0)} WPM.</p>`)}${sec('HOW YOUR SCORE ADDS UP',3,dimRow('pace','Pace')+dimRow('fillers','Filler words')+dimRow('pauses','Pauses')+dimRow('duration','Duration'))}</div>`
   +sec('YOUR TALK AT A GLANCE',4,timeline(m))
   +`<div class="g2">${sec('STRENGTHS',5,list(f.strengths))}${sec('AREAS TO IMPROVE',6,list(f.improvements))}</div>`
   +sec('NEXT PRACTICE SESSION',7,(f.summary?`<p class="rec">${esc(f.summary)}</p>`:'')+list(f.recommendations)+`<div class="acts"><button class="bt" data-go="decks" type="button">GO TO MY PRESENTATIONS</button><button class="bt gh" data-go="dash" type="button">Dashboard</button>${q.level==='low'?'<button class="bt gh" data-act="aretake" type="button">Record again</button>':''}</div>`)
   +sec('DETAILS',8,`<details><summary>Filler words (${ft.length})</summary>${ft.length?`<div class="tw"><table><tr><th>Time</th><th>Word</th></tr>${ft.map(x=>`<tr><td>${T0(x.t)}</td><td>${esc(x.word)}</td></tr>`).join('')}</table></div><p class="basis">“Like” is counted only when it is likely used as a filler. Speech recognition can skip or add small words, so treat these counts as estimates.</p>`:'<p class="em">No filler words detected.</p>'}</details><details><summary>Long pauses (${ps.length})</summary>${ps.length?`<div class="tw"><table><tr><th>Starts at</th><th>Length</th></tr>${ps.map(x=>`<tr><td>${T0(x.t)}</td><td>${x.dur}s</td></tr>`).join('')}</table></div>`:'<p class="em">No long pauses detected.</p>'}</details><details><summary>Recognition quality</summary><p class="basis">Confidence: ${Math.round((q.confidence||0)*100)}% · Level: ${esc(q.level||'')}. A low value can come from background noise or accents the recognizer handles poorly. Recognition mistakes are not speaking mistakes.</p>${(q.warnings||[]).length?`<ul class="tp">${q.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}</details><details><summary>Transcript</summary><p class="basis" style="white-space:pre-wrap">${esc(r.transcript||'')}</p></details>`));
};

/* ------------ bindings ------------ */
B.assess=()=>{if($('avst')){showSlide();$('apv').onclick=()=>{A.slide--;showSlide()};$('anx').onclick=()=>{A.slide++;showSlide()};
  $('adl').onclick=async()=>{const row=S.assess;if(!row||!row.file_path)return;const b=$('adl');b.disabled=true;const r=await PTCloud.download(row.file_path);b.disabled=false;
    if(r.error)return toast('Could not download the file. Please try again.');const a=document.createElement('a'),u=URL.createObjectURL(r.blob);a.href=u;a.download=row.file_name||'Initial Presentation Assessment.pptx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)};
  drawRec()}};
$('app').addEventListener('click',async e=>{
  const t=e.target.closest('[data-act]');if(!t)return;const a=t.dataset.act;
  if(a==='aretry')retry();
  else if(a==='astart'){if(S.view!=='assess')go('assess');else startRec()}
  else if(a==='afin')finishRec();
  else if(a==='acancel'){podium.leave();setRec({st:'idle'})}
  else if(a==='asend')sendRec();
  else if(a==='aretake'){A.retake=true;A.rec={st:'idle'};go('assess')}
  else if(a==='adel'){
    if(A.busyDel||!S.assess||S.assess.status!=='completed')return;
    if(!await confirmDlg({title:'Delete presentation?',text:'Are you sure you want to delete this presentation? This action cannot be undone.',yes:'Delete'}))return;
    A.busyDel=true;refresh();const r=await call('remove');A.busyDel=false;
    if(r.error){refresh();toast('Could not delete the presentation. Please try again.');return}
    refresh();flash('Presentation deleted.','success');toast('Presentation deleted. Your results are still in Reports.')}
});
})();
