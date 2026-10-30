const $=id=>document.getElementById(id);
const tabs=$('tabs'),lf=$('loginForm'),rf=$('registerForm');
const users={}; // demo only: in-memory accounts, nothing is sent anywhere
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setTab(t){
  const reg=t==='register';
  tabs.dataset.tab=t;
  $('t-login').setAttribute('aria-selected',!reg);$('t-register').setAttribute('aria-selected',reg);
  lf.hidden=reg;rf.hidden=!reg;
  $('switch').innerHTML=reg?'Already have an account? <button type="button" data-go="login">Log in</button>':'New to PresentTrack? <button type="button" data-go="register">Create an account</button>';
  document.querySelectorAll('.err').forEach(e=>e.textContent='');
  document.querySelectorAll('input').forEach(i=>i.removeAttribute('aria-invalid'));
}
$('t-login').onclick=()=>setTab('login');$('t-register').onclick=()=>setTab('register');
$('switch').onclick=e=>{const g=e.target.dataset.go;if(g)setTab(g)};
setTab('login');

function bad(id,msg){$(id).setAttribute('aria-invalid','true');$(id+'-e').textContent=msg;return false}
function clear(...ids){ids.forEach(id=>{$(id).removeAttribute('aria-invalid');$(id+'-e').textContent=''})}

document.querySelectorAll('.eye').forEach(b=>b.onclick=()=>{
  const i=$(b.dataset.for),show=i.type==='password';
  i.type=show?'text':'password';b.textContent=show?'Hide':'Show';b.setAttribute('aria-label',show?'Hide password':'Show password');
});

function score(p){return (p.length>=8)+(/[A-Z]/.test(p))+(/\d/.test(p))+(/[^A-Za-z0-9]/.test(p))}
$('rp').oninput=e=>{
  const s=score(e.target.value),c=['','#D6336C','#E8930C','#8A6BFF','#12A382'][s];
  document.querySelectorAll('.meter i').forEach((b,i)=>b.style.background=i<s?c:'');
  $('rp-h').textContent=e.target.value?['','Weak','Fair','Good','Strong'][s]+' password':'Use 8+ characters with a number and a capital letter.';
};

const cloudOn=()=>!!(window.PTCloud&&window.PTCloud.enabled);
const busy=(f,on)=>{const b=f.querySelector('.btn');if(b)b.disabled=on};
function done(name){podium.enter(name,((podium.newUser?$('re').value:$('le').value)||'').trim()||name.toLowerCase().replace(/\s+/g,'')+'@example.com')}
lf.onsubmit=e=>{
  e.preventDefault();clear('le','lp');
  const em=$('le').value.trim().toLowerCase(),pw=$('lp').value;let ok=true;
  if(!emailRe.test(em))ok=bad('le','Enter a valid email address.');
  if(!pw)ok=bad('lp','Enter your password.');
  if(!ok)return;
  if(cloudOn()){busy(lf,true);PTCloud.signIn(em,pw).then(r=>{busy(lf,false);
    if(r.error)return bad('lp',r.error);
    podium.newUser=false;done(r.name)}).catch(err=>{busy(lf,false);bad('lp',err.message||'Network error. Try again.')});return}
  const u=users[em];
  if(u&&u.pw!==pw)return bad('lp','Incorrect password. Try again or reset it.');
  podium.newUser=false;done(u?u.name:em.split('@')[0],'You are logged in. This is a demo, so no data was sent.');
};
rf.onsubmit=e=>{
  e.preventDefault();clear('rn','re','rp','terms');
  const n=$('rn').value.trim(),em=$('re').value.trim().toLowerCase(),pw=$('rp').value;let ok=true;
  if(n.length<2)ok=bad('rn','Enter your full name.');
  if(!emailRe.test(em))ok=bad('re','Enter a valid email address.');
  else if(!cloudOn()&&users[em])ok=bad('re','This email already has an account. Log in instead.');
  if(score(pw)<3||pw.length<8)ok=bad('rp','Use 8+ characters with a capital letter and a number.');
  if(!$('terms').checked){$('terms-e').textContent='Accept the Terms to create an account.';ok=false}
  if(!ok)return;
  if(cloudOn()){busy(rf,true);PTCloud.signUp(n,em,pw).then(r=>{busy(rf,false);
    if(r.error)return bad('re',r.error);
    if(r.confirm){setTab('login');$('le').value=em;$('le-e').style.color='var(--ok)';$('le-e').textContent='Account created. Check your email and click the confirmation link, then log in.';return}
    podium.newUser=true;done(r.name.split(' ')[0])}).catch(err=>{busy(rf,false);bad('re',err.message||'Network error. Try again.')});return}
  users[em]={name:n,pw};
  podium.newUser=true;done(n.split(' ')[0],'Your account is ready. This is a demo, so no data was sent.');
};
document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{podium.newUser=false;done('there','Signed in with '+b.dataset.p+' (demo).')});
$('forgot').onclick=e=>{e.preventDefault();const em=$('le').value.trim();clear('le');
  if(cloudOn()&&emailRe.test(em)){PTCloud.reset(em.toLowerCase()).then(r=>{if(r.error){$('le-e').style.color='';return bad('le',r.error)}$('le-e').style.color='var(--ok)';$('le-e').textContent='Reset link sent to '+em+'.'});return}
  emailRe.test(em)?($('le-e').style.color='var(--ok)',$('le-e').textContent='Reset link sent to '+em+'.'):bad('le','Enter your email first, then select Forgot password.')};
$('out').onclick=()=>{$('okView').hidden=true;$('authView').hidden=false;lf.reset();rf.reset();setTab('login')};
$('theme').onclick=()=>{const r=document.documentElement,d=matchMedia('(prefers-color-scheme:dark)').matches;
  const cur=r.dataset.theme||(d?'dark':'light');r.dataset.theme=cur==='dark'?'light':'dark'};

