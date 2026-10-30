/* Supabase layer: real accounts (Supabase Auth) + per-user cloud save (table user_data).
   If js/config.js is empty or the SDK failed to load, PTCloud.enabled is false and the app stays in demo mode. */
(()=>{
const cfg=window.PT_SUPABASE||{};
const P=window.PTCloud={enabled:false,user:null,row:null,onboarded:false,ready:false,pending:null,assessmentDone:false};
if(!cfg.url||!cfg.anonKey||!window.supabase||!window.supabase.createClient)return;
let sb;try{sb=window.supabase.createClient(cfg.url,cfg.anonKey)}catch(e){console.warn('Supabase init failed',e);return}
P.enabled=true;P.client=sb;
let last='';

const nameOf=u=>(u.user_metadata&&u.user_metadata.full_name)||(u.email||'').split('@')[0]||'there';
const friendly=m=>/invalid login/i.test(m)?'Incorrect email or password.'
  :/already registered/i.test(m)?'This email already has an account. Log in instead.'
  :/email not confirmed/i.test(m)?'Confirm your email first. Check your inbox.':m;

async function load(u){
  const {data,error}=await sb.from('user_data').select('onboarded,data,initial_assessment_completed').eq('user_id',u.id).maybeSingle();
  if(error){await sb.auth.signOut();return{error:'Could not load your data: '+error.message}}
  P.user=u;P.row=data||null;P.ready=false;last='';P.assessmentDone=!!(data&&data.initial_assessment_completed);
  return{name:nameOf(u)};
}
P.signIn=async(email,pw)=>{
  const {data,error}=await sb.auth.signInWithPassword({email,password:pw});
  return error?{error:friendly(error.message)}:load(data.user);
};
P.signUp=async(name,email,pw)=>{
  const {data,error}=await sb.auth.signUp({email,password:pw,options:{data:{full_name:name}}});
  if(error)return{error:friendly(error.message)};
  if(data.user&&data.user.identities&&!data.user.identities.length)return{error:friendly('already registered')};
  if(!data.session)return{confirm:true};            // "Confirm email" is ON in Supabase: user must click the email link first
  P.user=data.user;P.row=null;P.ready=false;last='';P.assessmentDone=false;
  return{name:nameOf(data.user)};
};
P.reset=async email=>{
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  return error?{error:friendly(error.message)}:{};
};

function push(snap){
  const u=P.user;if(!u||!P.ready)return P.pending||Promise.resolve();
  const key=JSON.stringify([P.onboarded,snap]);if(key===last)return P.pending||Promise.resolve();
  last=key;
  P.pending=sb.from('user_data').upsert({user_id:u.id,onboarded:P.onboarded,data:snap,updated_at:new Date().toISOString()})
    .then(({error})=>{if(error){last='';console.warn('Cloud save failed:',error.message)}});
  return P.pending;
}

/* ---- Edge Functions (the OpenAI key lives only on the server) ---- */
const fnErr=async e=>{try{const r=e&&e.context;if(r&&typeof r.json==='function'){const j=await r.json();return{error:j.message||'Request failed. Please try again.',code:j.error,retryable:j.retryable!==false,quality:j.quality,canRetry:j.canRetry,status:r.status}}}catch(x){}return{error:'Network error. Please try again.',retryable:true}};
P.call=async(name,body)=>{
  if(!P.user)return{error:'Please sign in again.'};
  try{const {data,error}=await sb.functions.invoke(name,{body});return error?await fnErr(error):{data}}
  catch(e){return{error:'Network error. Please try again.',retryable:true}}
};
P.assessment=(action)=>P.call('assessment-ensure',{action});
P.submitAssessment=(blob,name,durationSec)=>{const f=new FormData();f.append('audio',blob,name);f.append('duration_sec',String(Math.round(durationSec)));return P.call('assessment-submit',f)};

/* ---- file storage (private bucket, one folder per user, enforced by RLS) ---- */
const BUCKET='presentations';
P.upload=async(path,file)=>{const {error}=await sb.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type||undefined});return error?{error:error.message}:{}};
P.download=async path=>{const {data,error}=await sb.storage.from(BUCKET).download(path);return error?{error:error.message}:{blob:data}};
P.remove=async paths=>{const {error}=await sb.storage.from(BUCKET).remove(paths);return error?{error:error.message}:{}};
/* save right now and report failure (used when deleting, so the user sees whether it really worked) */
P.saveNow=async snap=>{const u=P.user;if(!u)return{error:'Please sign in again.'};
  try{await P.pending}catch(e){}
  const {error}=await sb.from('user_data').upsert({user_id:u.id,onboarded:P.onboarded,data:snap,updated_at:new Date().toISOString()});
  if(error)return{error:error.message};last=JSON.stringify([P.onboarded,snap]);return{}};
P.save=push;
P.signOut=()=>{const p=P.pending;P.user=null;P.row=null;P.ready=false;last='';
  (async()=>{try{await p}catch(e){}await sb.auth.signOut()})()};

const tick=()=>{if(P.user&&P.ready&&window.podium&&podium.snapshot)push(podium.snapshot())};
setInterval(tick,4000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')tick()});

/* Password-reset link lands back here with a recovery session */
sb.auth.onAuthStateChange(ev=>{
  if(ev!=='PASSWORD_RECOVERY')return;
  setTimeout(async()=>{
    const p=prompt('Choose a new password (at least 8 characters):');
    if(p&&p.length>=8){const {error}=await sb.auth.updateUser({password:p});alert(error?error.message:'Password updated. You can log in now.')}
    await sb.auth.signOut();
  },50);
});

/* Social login buttons are demo-only until you enable providers in Supabase */
document.querySelectorAll('.or,.social').forEach(e=>e.style.display='none');
})();
