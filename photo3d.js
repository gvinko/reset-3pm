/* CAD Drawer — Photo → 3D room.
 * Drag 8 handles onto the room in a site photo (4 corners of the far wall, 4 near corners
 * where side walls meet ceiling/floor or the photo edge), enter the room size, and view the
 * room in 3D textured from the photo. Flex duct runs and HVAC symbols drawn on the photo are
 * placed on the matching wall/ceiling/floor. Pure canvas — works offline, no libraries.
 * Runs after index.html's main script and takeoff.js; extends their globals.
 */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const PHOTO_KEY=wbAutoKey+':photo';
let trace=null;          // {front:[TL,TR,BR,BL], back:[TL,TR,BR,BL]} in canvas world coords
let tracing=false;

// ---------- geometry ----------
function homography(src,dst){ // maps src[i] -> dst[i], 4 points each
  const A=[];
  for(let i=0;i<4;i++){const X=src[i].x,Y=src[i].y,u=dst[i].x,v=dst[i].y;A.push([X,Y,1,0,0,0,-X*u,-Y*u,u]);A.push([0,0,0,X,Y,1,-X*v,-Y*v,v])}
  return solve(A);
}
function applyH(h,p){const z=h[6]*p.x+h[7]*p.y+1;return{x:(h[0]*p.x+h[1]*p.y+h[2])/z,y:(h[3]*p.x+h[4]*p.y+h[5])/z}}
function inQuad(q,p){let inside=false;for(let a=0,b=3;a<4;b=a++){const A=q[a],B=q[b];if(((A.y>p.y)!==(B.y>p.y))&&(p.x<(B.x-A.x)*(p.y-A.y)/(B.y-A.y)+A.x))inside=!inside}return inside}
const UNIT=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
function faces(t,R){
  const f=t.front,b=t.back,W=R.w,D=R.d,H=R.h;
  // 3D: X right 0..W, Y depth 0 (camera side) .. D (far wall), Z up 0..H. n = inward normal.
  return [
    {key:'back', label:'Far wall', quad:[b[0],b[1],b[2],b[3]],xyz:[[0,D,H],[W,D,H],[W,D,0],[0,D,0]],n:[0,-1,0]},
    {key:'left', label:'Left wall',quad:[f[0],b[0],b[3],f[3]],xyz:[[0,0,H],[0,D,H],[0,D,0],[0,0,0]],n:[1,0,0]},
    {key:'right',label:'Right wall',quad:[b[1],f[1],f[2],b[2]],xyz:[[W,D,H],[W,0,H],[W,0,0],[W,D,0]],n:[-1,0,0]},
    {key:'ceiling',label:'Ceiling',quad:[f[0],f[1],b[1],b[0]],xyz:[[0,0,H],[W,0,H],[W,D,H],[0,D,H]],n:[0,0,-1]},
    {key:'floor',label:'Floor',quad:[b[3],b[2],f[2],f[3]],xyz:[[0,D,0],[W,D,0],[W,0,0],[0,0,0]],n:[0,0,1]}
  ];
}
function bilinear(xyz,u,v){const r=[0,0,0];for(let k=0;k<3;k++){const top=xyz[0][k]+(xyz[1][k]-xyz[0][k])*u,bot=xyz[3][k]+(xyz[2][k]-xyz[3][k])*u;r[k]=top+(bot-top)*v}return r}
// Photo point (world coords) -> 3D point on the face it falls in, or null.
function photoTo3d(t,R,p){
  for(const f of faces(t,R)){if(!inQuad(f.quad,p))continue;const uv=applyH(homography(f.quad,UNIT),p);return {face:f.key,xyz:bilinear(f.xyz,Math.min(1,Math.max(0,uv.x)),Math.min(1,Math.max(0,uv.y))),n:f.n}}
  return null;
}
function defaultTrace(){
  const b=photo.box;const f=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];
  const ix=b.w*.28,iy=b.h*.26;const k=[{x:b.x+ix,y:b.y+iy},{x:b.x+b.w-ix,y:b.y+iy},{x:b.x+b.w-ix,y:b.y+b.h-iy},{x:b.x+ix,y:b.y+b.h-iy}];
  return {front:f,back:k};
}

// ---------- UI ----------
const sec=document.createElement('div');sec.className='section';sec.id='photo3dSection';
sec.innerHTML='<div class="title">Photo → 3D room</div><div class="grid"><button id="traceRoom">Trace room corners</button><button id="open3dPhoto" class="primary">Open photo 3D</button><button id="resetTrace">Reset corners</button></div><div class="note">1. Upload a site photo. 2. Tap Trace room corners and drag the 4 <b style="color:#ffb84d">orange</b> handles onto the corners of the far wall, and the 4 <b style="color:#5cb8ff">blue</b> handles onto the near corners (where side walls meet ceiling and floor, or the photo edge). 3. Set room width, depth and height in 3D space mock-up. 4. Open photo 3D. Flex runs and symbols drawn on the photo appear on the matching surface.</div>';
const after=$('#show3d')?.closest('.section')||$('#photoOpacity').closest('.section');after.after(sec);
const doneBtn=document.createElement('button');doneBtn.id='traceDone';doneBtn.textContent='Done corners';doneBtn.style.display='none';doneBtn.className='primary';
$('.topbar').insertBefore(doneBtn,$('.topbar').firstChild);
function setTracing(on){
  if(on&&!photo.img){alert('Upload a site photo first.');return}
  tracing=on;if(on&&!trace)trace=defaultTrace();
  $('#traceRoom').classList.toggle('active',on);$('#traceRoom').textContent=on?'Tracing… drag the handles':'Trace room corners';
  doneBtn.style.display=on?'':'none';
  if(on&&typeof $('#mobileTools')?.click==='function'&&$('#toolPanel').classList.contains('open'))$('#mobileTools').click();
  if(!on)queueSave();draw();
}
$('#traceRoom').onclick=()=>setTracing(!tracing);
doneBtn.onclick=()=>setTracing(false);
$('#resetTrace').onclick=()=>{if(!photo.img)return;trace=defaultTrace();queueSave();draw()};

// Overlay on the main canvas
const baseDraw=draw;
draw=function(){baseDraw();if(!tracing||!trace)return;
  x.save();x.translate(cam.x,cam.y);x.scale(cam.z,cam.z);x.lineWidth=2/cam.z;
  const poly=(pts,col)=>{x.strokeStyle=col;x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));x.closePath();x.stroke()};
  poly(trace.back,'#ffb84d');x.strokeStyle='#5cb8ffaa';x.setLineDash([6/cam.z,4/cam.z]);
  for(let i=0;i<4;i++){x.beginPath();x.moveTo(trace.front[i].x,trace.front[i].y);x.lineTo(trace.back[i].x,trace.back[i].y);x.stroke()}
  x.setLineDash([]);
  const dot=(p,col,t)=>{x.fillStyle=col;x.beginPath();x.arc(p.x,p.y,11/cam.z,0,Math.PI*2);x.fill();x.fillStyle='#111';x.font=`bold ${11/cam.z}px system-ui`;x.textAlign='center';x.textBaseline='middle';x.fillText(t,p.x,p.y)};
  const names=['TL','TR','BR','BL'];trace.back.forEach((p,i)=>dot(p,'#ffb84d',names[i]));trace.front.forEach((p,i)=>dot(p,'#5cb8ff',names[i]));
  x.textAlign='left';x.textBaseline='alphabetic';x.restore();
};
function hitTrace(p){if(!trace)return null;const r=18/cam.z;for(const set of ['back','front'])for(let i=0;i<4;i++){const q=trace[set][i];if(Math.hypot(q.x-p.x,q.y-p.y)<r)return {set,i}}return null}
const baseDown=c.onmousedown;
c.onmousedown=e=>{if(tracing&&!(e.button===1||e.altKey)){const h=hitTrace(world(e));if(h){drag={trace:h};return}}baseDown(e)};
function moveTrace(e){if(!drag||!drag.trace)return false;const p=world(e);trace[drag.trace.set][drag.trace.i]={x:p.x,y:p.y};draw();return true}
const baseMove=onMove;onMove=function(e){if(moveTrace(e))return;baseMove(e)};   // touch path calls onMove by name
addEventListener('mousemove',e=>{moveTrace(e)});                               // desktop path
addEventListener('mouseup',()=>{if(trace)queueSave()});

// ---------- persistence: trace in the job, photo cached on this device ----------
const basePayload=payload;payload=function(){const p=basePayload();p.roomTrace=trace;p.photoBox=photo.box||null;return p};
function savePhoto(){
  if(!photo.img)return;
  try{const src=photo.img,w=src.naturalWidth||src.width,h=src.naturalHeight||src.height,s=Math.min(1,1600/Math.max(w,h)),cv=document.createElement('canvas');cv.width=Math.round(w*s);cv.height=Math.round(h*s);cv.getContext('2d').drawImage(src,0,0,cv.width,cv.height);localStorage.setItem(PHOTO_KEY,cv.toDataURL('image/jpeg',.82))}
  catch(e){console.warn('Photo not kept on this device (storage full)',e)}
}
const baseFit=fitPhoto;fitPhoto=function(){baseFit();trace=null;savePhoto();queueSave()};
const baseClear=$('#photoClear').onclick;$('#photoClear').onclick=()=>{baseClear();trace=null;tracing&&setTracing(false);try{localStorage.removeItem(PHOTO_KEY)}catch{}queueSave()};
try{
  const saved=JSON.parse(localStorage.getItem(wbAutoKey)||'null');
  const data=localStorage.getItem(PHOTO_KEY);
  if(data&&saved&&saved.photoBox){const im=new Image();im.onload=()=>{photo.img=im;photo.box=saved.photoBox;trace=saved.roomTrace||null;draw()};im.src=data}
}catch{}

// ---------- 3D viewer ----------
const pane=document.createElement('div');pane.id='photo3dPane';
pane.style.cssText='display:none;position:fixed;inset:0;height:100dvh;z-index:60;background:#0f1216;flex-direction:column';
pane.innerHTML='<div style="display:flex;gap:6px;padding:8px;align-items:center;flex-wrap:wrap"><b style="flex:1;min-width:140px">Photo 3D room</b><button id="p3dReset" style="width:auto">Front view</button><button id="p3dPng" style="width:auto">Save image</button><button id="p3dClose" class="danger" style="width:auto">Close</button></div><canvas id="p3d" style="flex:1 1 auto;min-height:0;height:0;width:100%;touch-action:none;cursor:grab"></canvas><div id="p3dInfo" class="note" style="padding:6px 10px"></div>';
document.body.appendChild(pane);
const C3=pane.querySelector('#p3d'),g=C3.getContext('2d');
let view={yaw:0,pitch:.12,dist:1},source=null,model=null,rafPending=false,coarse=false;

function sourceImage(){ // downscale once for fast texturing
  const img=photo.img,w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,s=Math.min(1,1400/Math.max(w,h));
  const cv=document.createElement('canvas');cv.width=Math.round(w*s);cv.height=Math.round(h*s);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
  return {cv,sx:cv.width/photo.box.w,sy:cv.height/photo.box.h};
}
function buildModel(){
  const R=room(),F=faces(trace,R).map(f=>({...f,H:homography(UNIT,f.quad)}));
  const toSrc=p=>({x:(p.x-photo.box.x)*source.sx,y:(p.y-photo.box.y)*source.sy});
  const ducts=[],marks=[];
  for(const i of items){
    if(i.kind==='flex'||(i.type==='line'&&!i.kind)){
      const a=photoTo3d(trace,R,{x:i.x,y:i.y}),b=photoTo3d(trace,R,{x:i.x+i.w,y:i.y+i.h});if(!a||!b)continue;
      const r=i.kind==='flex'?(i.diameter||350)/2:15;
      const off=(p)=>p.xyz.map((v,k)=>v+p.n[k]*(r+20));
      ducts.push({a:off(a),b:off(b),r,flex:i.kind==='flex',label:i.kind==='flex'?`Ø${i.diameter||350}`:''});
    }else if(i.kind==='symbol'){
      const bb=bounds(i),p=photoTo3d(trace,R,{x:bb.x+bb.w/2,y:bb.y+bb.h/2});if(!p)continue;
      marks.push({p:p.xyz.map((v,k)=>v+p.n[k]*30),label:(window.CADTakeoff?.SYMBOLS[i.symbol]?.short)||'•',color:i.stroke||'#5cb8ff'});
    }
  }
  return {R,F,toSrc,ducts,marks};
}
function camera(){
  const R=model.R,cx=R.w/2,cy=R.d/2,cz=R.h/2,span=Math.max(R.w,R.d,R.h);
  const d=span*1.35*view.dist,cp=Math.cos(view.pitch);
  const pos=[cx-Math.sin(view.yaw)*cp*d,cy-Math.cos(view.yaw)*cp*d,cz+Math.sin(view.pitch)*d];
  const f=[cx-pos[0],cy-pos[1],cz-pos[2]],fl=Math.hypot(...f);f.forEach((v,i)=>f[i]=v/fl);
  let r=[f[1],-f[0],0];const rl=Math.hypot(...r)||1;r=r.map(v=>v/rl);
  const u=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]];
  return {pos,f,r,u,focal:Math.min(C3.clientWidth,C3.clientHeight)*1.1};
}
function project(cam,p){const d=[p[0]-cam.pos[0],p[1]-cam.pos[1],p[2]-cam.pos[2]],z=d[0]*cam.f[0]+d[1]*cam.f[1]+d[2]*cam.f[2];if(z<1)return null;
  return {x:C3.clientWidth/2+(d[0]*cam.r[0]+d[1]*cam.r[1]+d[2]*cam.r[2])/z*cam.focal,y:C3.clientHeight/2-(d[0]*cam.u[0]+d[1]*cam.u[1]+d[2]*cam.u[2])/z*cam.focal,z}}
function tri(s0,s1,s2,d0,d1,d2){
  // inflate destination slightly to hide seams
  const cx=(d0.x+d1.x+d2.x)/3,cy=(d0.y+d1.y+d2.y)/3,grow=p=>{const dx=p.x-cx,dy=p.y-cy,l=Math.hypot(dx,dy)||1;return{x:p.x+dx/l*1.1,y:p.y+dy/l*1.1}};
  const e0=grow(d0),e1=grow(d1),e2=grow(d2);
  const den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);if(Math.abs(den)<1e-6)return;
  const a=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den,b=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den,
        c2=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den,d=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den,
        e=(d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den,
        f=(d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
  g.save();g.beginPath();g.moveTo(e0.x,e0.y);g.lineTo(e1.x,e1.y);g.lineTo(e2.x,e2.y);g.closePath();g.clip();g.transform(a,b,c2,d,e,f);g.drawImage(source.cv,0,0);g.restore();
}
function render(){
  rafPending=false;if(!model)return;
  const W=C3.clientWidth,H=C3.clientHeight,DPR=Math.min(devicePixelRatio||1,2);
  if(C3.width!==Math.round(W*DPR)){C3.width=Math.round(W*DPR);C3.height=Math.round(H*DPR)}
  g.setTransform(DPR,0,0,DPR,0,0);g.fillStyle='#0f1216';g.fillRect(0,0,W,H);
  const cam=camera(),R=model.R,N=coarse?7:14;
  const visible=model.F.filter(f=>{const p=f.xyz[0],v=[cam.pos[0]-p[0],cam.pos[1]-p[1],cam.pos[2]-p[2]];return v[0]*f.n[0]+v[1]*f.n[1]+v[2]*f.n[2]>0})
    .map(f=>{const ctr=bilinear(f.xyz,.5,.5);return{f,dist:Math.hypot(ctr[0]-cam.pos[0],ctr[1]-cam.pos[1],ctr[2]-cam.pos[2])}}).sort((a,b)=>b.dist-a.dist);
  for(const {f} of visible){
    const grid=[];
    for(let j=0;j<=N;j++){grid[j]=[];for(let i=0;i<=N;i++){const u=i/N,v=j/N;grid[j][i]={s:model.toSrc(applyH(f.H,{x:u,y:v})),d:project(cam,bilinear(f.xyz,u,v))}}}
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){const A=grid[j][i],B=grid[j][i+1],Cc=grid[j+1][i+1],D=grid[j+1][i];if(!A.d||!B.d||!Cc.d||!D.d)continue;tri(A.s,B.s,Cc.s,A.d,B.d,Cc.d);tri(A.s,Cc.s,D.s,A.d,Cc.d,D.d)}
    const outline=f.xyz.map(p=>project(cam,p));if(outline.every(Boolean)){g.strokeStyle='#ffffff40';g.lineWidth=1;g.beginPath();outline.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.stroke()}
  }
  for(const dct of model.ducts){const a=project(cam,dct.a),b=project(cam,dct.b);if(!a||!b)continue;const z=(a.z+b.z)/2,w=Math.max(2,dct.r*2/z*cam.focal);
    g.lineCap='round';g.strokeStyle=dct.flex?'#9aa4b1':'#ffcd6b';g.lineWidth=w;g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();
    if(dct.flex){g.strokeStyle='#d7dde5';g.lineWidth=Math.max(1,w*.35);g.beginPath();g.moveTo(a.x,a.y-w*.18);g.lineTo(b.x,b.y-w*.18);g.stroke();g.fillStyle='#fff';g.font='12px system-ui';g.fillText(dct.label,(a.x+b.x)/2+6,(a.y+b.y)/2-w/2-4)}}
  for(const m of model.marks){const p=project(cam,m.p);if(!p)continue;g.fillStyle=m.color;g.beginPath();g.arc(p.x,p.y,9,0,Math.PI*2);g.fill();g.fillStyle='#111';g.font='bold 10px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(m.label,p.x,p.y);g.textAlign='left';g.textBaseline='alphabetic'}
  $('#p3dInfo').textContent=`Room ${R.w} × ${R.d} × ${R.h} mm · ${model.ducts.length} duct run(s) · ${model.marks.length} symbol(s). Drag to turn, pinch or scroll to zoom. Visual guide only — confirm sizes on site.`;
}
function request(){if(!rafPending){rafPending=true;requestAnimationFrame(render)}}
function open3d(){
  if(!photo.img){alert('Upload a site photo first.');return}
  if(!trace){trace=defaultTrace();alert('Drag the corner handles onto the room first (Trace room corners). Showing a default guess.')}
  if(tracing)setTracing(false);
  source=sourceImage();model=buildModel();view={yaw:0,pitch:.12,dist:1};pane.style.display='flex';coarse=false;request();
}
$('#open3dPhoto').onclick=open3d;
$('#p3dClose').onclick=()=>{pane.style.display='none'};
$('#p3dReset').onclick=()=>{view={yaw:0,pitch:.12,dist:1};request()};
$('#p3dPng').onclick=()=>C3.toBlob(b=>download(`photo-3d-${($('#job').value||'room').replace(/[^a-z0-9]+/gi,'-')}.png`,'image/png',b),'image/png');
const ptr=new Map();let gesture=null;
C3.addEventListener('pointerdown',e=>{C3.setPointerCapture(e.pointerId);ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});coarse=true;
  const pts=[...ptr.values()];gesture=pts.length>=2?{pinch:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),dist:view.dist}:{x:e.clientX,y:e.clientY,yaw:view.yaw,pitch:view.pitch}});
C3.addEventListener('pointermove',e=>{if(!ptr.has(e.pointerId)||!gesture)return;ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});const pts=[...ptr.values()];
  if(gesture.pinch&&pts.length>=2){view.dist=Math.max(.35,Math.min(3,gesture.dist*gesture.pinch/(Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)||1)))}
  else if(!gesture.pinch){view.yaw=gesture.yaw+(e.clientX-gesture.x)*.008;view.pitch=Math.max(-1.2,Math.min(1.2,gesture.pitch+(e.clientY-gesture.y)*.006))}
  request()});
const end=e=>{ptr.delete(e.pointerId);if(!ptr.size){gesture=null;coarse=false;request()}};
C3.addEventListener('pointerup',end);C3.addEventListener('pointercancel',end);
C3.addEventListener('wheel',e=>{e.preventDefault();view.dist=Math.max(.35,Math.min(3,view.dist*(e.deltaY>0?1.1:.9)));request()},{passive:false});
addEventListener('resize',()=>{if(pane.style.display==='flex')request()});

window.CADPhoto3D={faces,photoTo3d,homography,applyH,getTrace:()=>trace,setTrace:t=>{trace=t;draw()},open:open3d};
})();
