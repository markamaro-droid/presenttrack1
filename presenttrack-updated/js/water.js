/* 3D water ripples that follow the cursor (WebGL, no libraries) */
(()=>{
const cv=$('water'),gl=cv.getContext('webgl',{antialias:false,alpha:false});
if(!gl)return;
const N=24,rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
const vs='attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const fs=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes,uM;uniform float uT,uDark;uniform vec3 uP[${N}];
float H(vec2 p){
  float h=1.4*sin(p.x*.018+uT*.6)*sin(p.y*.022-uT*.5);
  for(int i=0;i<${N};i++){
    float age=uT-uP[i].z;
    if(age>0.&&age<4.5){
      float d=length(p-uP[i].xy),f=age*230.;
      float env=1.-smoothstep(f-40.,f,d);
      h+=7.*env*sin(d*.12-age*15.)*exp(-age*1.05)*exp(-d*.0045);
    }
  }
  return h;
}
void main(){
  vec2 p=gl_FragCoord.xy,uv=p/uRes;
  float e=2.;
  float dx=(H(p+vec2(e,0.))-H(p-vec2(e,0.)))/(2.*e);
  float dy=(H(p+vec2(0.,e))-H(p-vec2(0.,e)))/(2.*e);
  vec3 n=normalize(vec3(-dx*1.6,-dy*1.6,1.));
  vec3 L=normalize(vec3(-.45,.55,.7)),V=vec3(0.,0.,1.);
  float diff=dot(n,L)*.5+.5;
  vec3 dark=mix(vec3(.055,.043,.11),vec3(.23,.14,.62),clamp(uv.x*.45+uv.y*.55,0.,1.));
  vec3 lite=mix(vec3(.47,.71,.90),vec3(.22,.50,.81),clamp(uv.x*.4+(1.-uv.y)*.6,0.,1.));
  vec3 base=mix(lite,dark,uDark);
  vec3 col=base*(.72+.55*diff);
  float spec=pow(max(dot(n,normalize(L+V)),0.),70.);
  col+=mix(vec3(1.),vec3(.75,.68,1.),uDark)*spec*mix(.85,1.,uDark);
  col+=(1.-uDark)*vec3(.85,.95,1.)*pow(max(n.y*.5+.5,0.),3.)*.12*(1.-n.z)*8.;
  float fres=pow(1.-n.z,2.)*6.;
  col+=mix(vec3(.55,.85,1.),vec3(.5,.42,1.),uDark)*fres*mix(.4,.4,uDark);
  col+=mix(vec3(.9,.97,1.),vec3(.42,.32,1.),uDark)*exp(-length(p-uM)/150.)*mix(.22,.16,uDark);
  gl_FragColor=vec4(col,1.);
}`;
function sh(t,src){const o=gl.createShader(t);gl.shaderSource(o,src);gl.compileShader(o);return o}
const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);
if(!gl.getProgramParameter(pr,gl.LINK_STATUS))return;
gl.useProgram(pr);
const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const al=gl.getAttribLocation(pr,'a');gl.enableVertexAttribArray(al);gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
const U=n=>gl.getUniformLocation(pr,n),uRes=U('uRes'),uT=U('uT'),uM=U('uM'),uD=U('uDark'),uP=U('uP[0]');
const pts=new Float32Array(N*3);for(let i=0;i<N;i++)pts[i*3+2]=-1e4;
let k=0,sc=1,mx=-999,my=-999,lx=null,ly=null,t0=performance.now();
const now=()=>rm?0:(performance.now()-t0)/1000;
const isDark=()=>{const t=document.documentElement.dataset.theme;return t?t==='dark':matchMedia('(prefers-color-scheme:dark)').matches};
function size(){sc=Math.min(devicePixelRatio||1,1)*.7;cv.width=Math.round(innerWidth*sc);cv.height=Math.round(innerHeight*sc);gl.viewport(0,0,cv.width,cv.height);if(rm)draw()}
function drop(x,y,dt){pts[k*3]=x*sc;pts[k*3+1]=(innerHeight-y)*sc;pts[k*3+2]=now()-(dt||0);k=(k+1)%N}
function draw(){
  gl.uniform2f(uRes,cv.width,cv.height);gl.uniform1f(uT,now());gl.uniform2f(uM,mx*sc,(innerHeight-my)*sc);
  gl.uniform1f(uD,isDark()?1:0);gl.uniform3fv(uP,pts);gl.drawArrays(gl.TRIANGLES,0,3);
}
function loop(){if(!document.documentElement.classList.contains('clay'))draw();requestAnimationFrame(loop)}
addEventListener('resize',size);size();
if(!rm){
  addEventListener('pointermove',e=>{
    mx=e.clientX;my=e.clientY;
    if(lx===null||Math.hypot(mx-lx,my-ly)>26){drop(mx,my);lx=mx;ly=my}
  },{passive:true});
  addEventListener('pointerdown',e=>{drop(e.clientX,e.clientY);drop(e.clientX,e.clientY,.18)},{passive:true});
  loop();
}else draw();
})();

