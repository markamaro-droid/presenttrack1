/* How-it-works tour: a scripted, looping demo driven by one clock */
(()=>{
const $$=q=>[...document.querySelectorAll(q)];
const st=$('stage'),sc=$$('.scene'),segs=$$('.seg'),cur=$('cur'),D=5,N=4;
const rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
const caps=['Pick your talk length and press Start.','Speak while the timer, voice bars and pace meter follow along.','Tap each filler word you hear yourself say.','Finish to get a score and clear next steps.'];
let t=0,play=!rm,last=performance.now(),shown=-1;
const cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),sg=(p,a,b)=>cl((p-a)/(b-a)),ez=x=>x*x*(3-2*x);
const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
const bars=[],wave=$('wave');for(let i=0;i<28;i++){const b=document.createElement('i');wave.appendChild(b);bars.push(b)}
const pos=q=>{const s=st.getBoundingClientRect();if(q.xy)return[q.xy[0]*s.width,q.xy[1]*s.height];const r=q.el.getBoundingClientRect();return[r.left-s.left+r.width/2-4,r.top-s.top+r.height/2-4]};
function drive(p,pts){
  let a=pts[0],b=pts[pts.length-1];
  for(let i=0;i<pts.length-1;i++)if(p>=pts[i].t&&p<=pts[i+1].t){a=pts[i];b=pts[i+1];break}
  const k=ez(sg(p,a.t+.04,b.t-.02)),A=pos(a),B=pos(b);
  const down=pts.some(q=>q.c&&Math.abs(p-q.t)<.03);
  cur.style.transform='translate('+(A[0]+(B[0]-A[0])*k)+'px,'+(A[1]+(B[1]-A[1])*k)+'px) scale('+(down?.8:1)+')';
  return down;
}
const c5=$('c5'),go=$('go'),pre=$$('.presets button'),ch=$$('#s2 .chip');
const rest={t:0,xy:[.9,.85]};
const P0=[rest,{t:.3,el:c5,c:1},{t:.7,el:go,c:1},{t:1,el:go}];
const fp=[rest],seq=[[.18,'um'],[.36,'like'],[.52,'um'],[.68,'so'],[.84,'um']];
seq.forEach(([t,f])=>fp.push({t,k:f,c:1,el:ch.find(c=>c.dataset.f===f)}));fp.push({t:1,el:ch[0]});
const scenes=[
 p=>{drive(p,P0);pre.forEach(b=>b.setAttribute('aria-pressed',b===c5&&p>.31));
   go.style.transform=p>.7&&p<.8?'scale(.94)':'';$('s0m').style.opacity=p>.8?1:0},
 p=>{const e=p*150,fr=e/300;$('clock').textContent=fmt(e);
   $('prg').style.strokeDashoffset=339.3*(1-fr);
   const pace=Math.round(142+26*Math.sin(p*7));
   $('pv').textContent=pace+' wpm · '+(pace>160?'Fast':pace<120?'Slow':'Clear');
   $('pm').style.left=cl((pace-80)/120*100,2,98)+'%'},
 p=>{const d=drive(p,fp);ch.forEach(c=>{const f=c.dataset.f;
     c.lastChild.textContent=fp.filter(q=>q.k===f&&p>q.t+.01).length;
     c.style.transform=d&&fp.some(q=>q.k===f&&q.c&&Math.abs(p-q.t)<.03)?'scale(1.12)':''})},
 p=>{const k=ez(sg(p,.05,.5));$('sc').textContent=Math.round(86*k);
   $('sl').textContent=p>.5?'Ready to present':'Scoring…';
   $$('.tips li').forEach((li,i)=>{const o=sg(p,.45+i*.14,.57+i*.14);li.style.opacity=o;li.style.transform='translateY('+(1-o)*8+'px)'})}
];
function render(){
  t=cl(t,0,N*D);const s=Math.min(N-1,Math.floor(t/D)),p=cl((t-s*D)/D);
  if(s!==shown){sc.forEach((e,i)=>e.classList.toggle('on',i===s));
    $('capn').textContent=s+1;$('capt').textContent=caps[s];
    $('rec').hidden=!(s===1||s===2);cur.style.opacity=(s===0||s===2)?1:0;shown=s}
  segs.forEach((g,i)=>g.firstElementChild.style.width=(i<s?100:i===s?p*100:0)+'%');
  $('tm').textContent=fmt(t)+' / 0:20';
  bars.forEach((b,i)=>b.style.transform='scaleY('+(s===1?.2+.8*Math.abs(Math.sin(t*6+i*.7))*(.55+.45*Math.sin(t*2+i*1.3)):.08).toFixed(3)+')');
  scenes[s](p);
}
function frame(now){
  const dt=cl((now-last)/1000,0,.5);last=now;
  if(play){t+=dt;if(t>=N*D)t=0}
  render();requestAnimationFrame(frame);
}
const pp=$('pp'),lab=()=>pp.textContent=play?'Pause':'Play';lab();
pp.onclick=()=>{play=!play;lab()};
segs.forEach((g,i)=>g.onclick=()=>{t=i*D+.001;render()});
requestAnimationFrame(frame);
})();

