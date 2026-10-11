/* CAD Drawer — 3D fittings.
 *  1. Transition builder: rectangular/round inlet → rectangular/round outlet, length and offsets.
 *     Live 3D preview, surface area, add to cut list, and a flat pattern (triangulation
 *     development) as a 1:1 SVG for the workshop.
 *  3. Room planner: room size + bulkheads, grilles, columns… positioned by measuring from the walls,
 *     shown in 3D and as a dimensioned plan. Saved with the drawing.
 *  2. 3D sketch: tap to place points in 3D on a floor or wall plane at any height; points join
 *     into lines with their true lengths shown. Saved with the drawing.
 * Pure canvas, offline. Extends the main script's globals.
 */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const SET_KEY='cad-fitting-settings';
let sketch={points:[],lines:[]},chainFrom=null;

// ---------------- shared 3D view ----------------
function makeView(canvas){
  const v={yaw:.7,pitch:.45,dist:1,target:[0,0,0],span:1000,canvas,ctx:canvas.getContext('2d')};
  v.camera=()=>{const d=v.span*2.2*v.dist,cp=Math.cos(v.pitch),t=v.target;
    const pos=[t[0]-Math.sin(v.yaw)*cp*d,t[1]-Math.cos(v.yaw)*cp*d,t[2]+Math.sin(v.pitch)*d];
    const f=[t[0]-pos[0],t[1]-pos[1],t[2]-pos[2]],fl=Math.hypot(...f);for(let i=0;i<3;i++)f[i]/=fl;
    let r=[f[1],-f[0],0];const rl=Math.hypot(...r)||1;r=r.map(q=>q/rl);
    const u=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]];
    return {pos,f,r,u,focal:Math.min(canvas.clientWidth,canvas.clientHeight)*1.15,W:canvas.clientWidth,H:canvas.clientHeight}};
  v.project=(cam,p)=>{const d=[p[0]-cam.pos[0],p[1]-cam.pos[1],p[2]-cam.pos[2]],z=d[0]*cam.f[0]+d[1]*cam.f[1]+d[2]*cam.f[2];if(z<1)return null;
    return {x:cam.W/2+(d[0]*cam.r[0]+d[1]*cam.r[1]+d[2]*cam.r[2])/z*cam.focal,y:cam.H/2-(d[0]*cam.u[0]+d[1]*cam.u[1]+d[2]*cam.u[2])/z*cam.focal,z}};
  v.ray=(cam,sx,sy)=>{const px=(sx-cam.W/2)/cam.focal,py=-(sy-cam.H/2)/cam.focal;return {o:cam.pos,d:[cam.f[0]+cam.r[0]*px+cam.u[0]*py,cam.f[1]+cam.r[1]*px+cam.u[1]*py,cam.f[2]+cam.r[2]*px+cam.u[2]*py]}};
  v.begin=()=>{const W=canvas.clientWidth,H=canvas.clientHeight,D=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(W*D)||canvas.height!==Math.round(H*D)){canvas.width=Math.round(W*D);canvas.height=Math.round(H*D)}
    v.ctx.setTransform(D,0,0,D,0,0);v.ctx.fillStyle='#14181e';v.ctx.fillRect(0,0,W,H);return v.camera()};
  return v;
}
// Orbit with drag, pinch/wheel zoom; quick taps are reported to onTap(x,y).
function bindOrbit(v,redraw,onTap){
  const C=v.canvas,ptr=new Map();let g=null;
  C.style.touchAction='none';
  C.addEventListener('pointerdown',e=>{C.setPointerCapture(e.pointerId);ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});const pts=[...ptr.values()];
    g=pts.length>=2?{pinch:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),dist:v.dist}:{x:e.clientX,y:e.clientY,yaw:v.yaw,pitch:v.pitch,moved:false}});
  C.addEventListener('pointermove',e=>{if(!ptr.has(e.pointerId)||!g)return;ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});const pts=[...ptr.values()];
    if(g.pinch&&pts.length>=2)v.dist=Math.max(.2,Math.min(5,g.dist*g.pinch/(Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)||1)));
    else if(!g.pinch){const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.hypot(dx,dy)>8)g.moved=true;if(g.moved){v.yaw=g.yaw+dx*.008;v.pitch=Math.max(-1.45,Math.min(1.45,g.pitch+dy*.006))}}
    redraw()});
  const end=e=>{const was=g;ptr.delete(e.pointerId);if(!ptr.size){g=null;if(was&&!was.pinch&&!was.moved&&e.type==='pointerup'&&onTap){const r=C.getBoundingClientRect();onTap(e.clientX-r.left,e.clientY-r.top)}}};
  C.addEventListener('pointerup',end);C.addEventListener('pointercancel',end);
  C.addEventListener('wheel',e=>{e.preventDefault();v.dist=Math.max(.2,Math.min(5,v.dist*(e.deltaY>0?1.1:.9)));redraw()},{passive:false});
}

// ---------------- transition geometry ----------------
function ring(shape,cx,cy,z,n){
  const pts=[];
  for(let k=0;k<n;k++){const a=2*Math.PI*k/n,c=Math.cos(a),s=Math.sin(a);
    if(shape.type==='round'){pts.push([cx+shape.d/2*c,cy+shape.d/2*s,z]);continue}
    const t=Math.min(Math.abs(c)>1e-9?shape.w/2/Math.abs(c):Infinity,Math.abs(s)>1e-9?shape.h/2/Math.abs(s):Infinity);pts.push([cx+t*c,cy+t*s,z])}
  if(shape.type==='rect'){ // put exact corners on the nearest samples so edges stay crisp
    for(const [sx,sy] of [[1,1],[-1,1],[-1,-1],[1,-1]]){const a=Math.atan2(sy*shape.h,sx*shape.w);let k=Math.round(((a+2*Math.PI)%(2*Math.PI))/(2*Math.PI)*n)%n;pts[k]=[cx+sx*shape.w/2,cy+sy*shape.h/2,z]}}
  return pts;
}
function transition(p){
  const n=p.segments||32;
  const A=ring(p.inlet,0,0,0,n),B=ring(p.outlet,p.offX||0,p.offY||0,p.length,n);
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  let area=0;const tris=[];
  for(let k=0;k<n;k++){const k1=(k+1)%n;tris.push([A[k],B[k],A[k1]],[A[k1],B[k],B[k1]])}
  for(const t of tris){const a=dist(t[0],t[1]),b=dist(t[1],t[2]),c=dist(t[2],t[0]),s=(a+b+c)/2;area+=Math.sqrt(Math.max(0,s*(s-a)*(s-b)*(s-c)))}
  const per=pts=>pts.reduce((s,p,i)=>s+dist(p,pts[(i+1)%pts.length]),0);
  const slant=A.reduce((s,a,i)=>s+dist(a,B[i]),0)/n;
  return {A,B,n,tris,areaM2:area/1e6,perimeterIn:per(A),perimeterOut:per(B),slant};
}
// Flat pattern by triangulation: every 3D edge keeps its true length.
function flatPattern(T){
  const {A,B,n}=T,d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const place=(P,Q,lp,lq)=>{ // point at distance lp from P and lq from Q, to the left of P->Q
    const dx=Q[0]-P[0],dy=Q[1]-P[1],L=Math.hypot(dx,dy)||1e-9,a=(lp*lp-lq*lq+L*L)/(2*L),h=Math.sqrt(Math.max(0,lp*lp-a*a));
    const mx=P[0]+a*dx/L,my=P[1]+a*dy/L;return [mx-h*dy/L,my+h*dx/L]};
  const a2=[[0,0]],b2=[[0,d(A[0],B[0])]];
  for(let k=0;k<n;k++){const k1=(k+1)%n;
    a2[k+1]=place(b2[k],a2[k],d(B[k],A[k1]),d(A[k],A[k1]));
    b2[k+1]=place(b2[k],a2[k+1],d(B[k],B[k1]),d(A[k1],B[k1]))}
  const all=[...a2,...b2],minX=Math.min(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1]));
  const sh=p=>[p[0]-minX,p[1]-minY];
  return {a:a2.map(sh),b:b2.map(sh),w:Math.max(...all.map(p=>p[0]))-minX,h:Math.max(...all.map(p=>p[1]))-minY};
}
function patternSvg(F,label){
  const m=20,pts=[...F.a,...[...F.b].reverse()].map(p=>`${(p[0]+m).toFixed(1)},${(p[1]+m).toFixed(1)}`).join(' ');
  const folds=F.a.map((p,i)=>i===0||i===F.a.length-1?'':`<line x1="${(p[0]+m).toFixed(1)}" y1="${(p[1]+m).toFixed(1)}" x2="${(F.b[i][0]+m).toFixed(1)}" y2="${(F.b[i][1]+m).toFixed(1)}"/>`).join('');
  const W=Math.ceil(F.w+2*m),H=Math.ceil(F.h+2*m+40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><polygon points="${pts}" fill="none" stroke="#000" stroke-width="0.6"/><g stroke="#888" stroke-width="0.3" stroke-dasharray="4 3">${folds}</g><text x="${m}" y="${H-22}" font-family="Arial" font-size="9">${esc(label)}</text><text x="${m}" y="${H-10}" font-family="Arial" font-size="7">Flat pattern 1:1 in mm (${Math.round(F.w)} × ${Math.round(F.h)}). Dashed = bend lines. No seam or lock allowance added. Check before cutting.</text></svg>`;
}

// ---------------- UI ----------------
const sec=document.createElement('div');sec.className='section';
sec.innerHTML='<div class="title">3D planning</div><div class="grid"><button id="openRoomPlan" class="primary">Room planner (measure)</button><button id="openTransition">Transition builder</button><button id="openSketch">3D sketch</button></div><div class="note">Room planner: enter the room size, then add a bulkhead, grilles, columns… by measuring from the walls, and see them in 3D or plan. Transition builder: set both ends, length and offset, turn it in 3D, add to the cut list or download its flat pattern. 3D sketch: tap to place points in 3D and join them into lines.</div>';
($('#photo3dSection')||$('#list').closest('.section')).after(sec);

const pane=document.createElement('div');pane.id='fittingPane';
pane.style.cssText='display:none;position:fixed;inset:0;height:100dvh;z-index:65;background:#14181e;flex-direction:column';
pane.innerHTML=`<div style="display:flex;gap:6px;padding:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #3a4352">
  <button id="tabRoom" style="width:auto">Room</button><button id="tabTransition" style="width:auto">Transition</button><button id="tabSketch" style="width:auto">3D sketch</button><span style="flex:1"></span>
  <button id="fitPng" style="width:auto">Save image</button><button id="fitClose" class="danger" style="width:auto">Close</button></div>
<div id="fitControls" style="padding:8px;overflow:auto;max-height:42dvh;border-bottom:1px solid #3a4352"></div>
<canvas id="fitCanvas" style="flex:1 1 auto;min-height:0;height:0;width:100%;cursor:grab"></canvas>
<div id="fitInfo" class="note" style="padding:6px 10px;margin:0"></div>`;
document.body.appendChild(pane);
const FC=pane.querySelector('#fitCanvas'),view=makeView(FC),controls=pane.querySelector('#fitControls'),info=pane.querySelector('#fitInfo');
let mode='transition',raf=false;
const request=()=>{if(!raf){raf=true;requestAnimationFrame(()=>{raf=false;if(pane.style.display!=='flex')return;mode==='transition'?drawTransition():mode==='room'?drawRoom():drawSketch()})}};

// ---- transition tab ----
const defaults={inType:'rect',inW:600,inH:400,inD:400,outType:'round',outW:400,outH:300,outD:350,length:500,offX:0,offY:0,segments:32};
let tp;try{tp={...defaults,...JSON.parse(localStorage.getItem(SET_KEY)||'{}')}}catch{tp={...defaults}}
function params(){return {inlet:tp.inType==='round'?{type:'round',d:+tp.inD}:{type:'rect',w:+tp.inW,h:+tp.inH},outlet:tp.outType==='round'?{type:'round',d:+tp.outD}:{type:'rect',w:+tp.outW,h:+tp.outH},length:+tp.length,offX:+tp.offX,offY:+tp.offY,segments:+tp.segments}}
function endLabel(t,w,h,d){return t==='round'?`Ø${d}`:`${w}×${h}`}
function tLabel(){return `Transition ${endLabel(tp.inType,tp.inW,tp.inH,tp.inD)} → ${endLabel(tp.outType,tp.outW,tp.outH,tp.outD)} × ${tp.length}${(+tp.offX||+tp.offY)?` (offset ${tp.offX}/${tp.offY})`:''}`}
function transitionControls(){
  const num=(k,l)=>`<div><label>${l}</label><input data-k="${k}" type="number" min="0" step="10" value="${esc(tp[k])}"></div>`;
  const sel=(k,l)=>`<div><label>${l}</label><select data-k="${k}"><option value="rect" ${tp[k]==='rect'?'selected':''}>Rectangular</option><option value="round" ${tp[k]==='round'?'selected':''}>Round</option></select></div>`;
  controls.innerHTML=`<div class="fields">${sel('inType','Inlet')}${tp.inType==='round'?num('inD','Inlet Ø (mm)'):num('inW','Inlet width')+num('inH','Inlet height')}
  ${sel('outType','Outlet')}${tp.outType==='round'?num('outD','Outlet Ø (mm)'):num('outW','Outlet width')+num('outH','Outlet height')}
  ${num('length','Length (mm)')}${num('offX','Offset across (mm)')}${num('offY','Offset up/down (mm)')}</div>
  <div class="grid" style="margin-top:8px"><button id="tAdd" class="primary">Add to cut list</button><button id="tPattern">Flat pattern (SVG)</button></div>`;
  controls.querySelectorAll('[data-k]').forEach(el=>el.oninput=el.onchange=()=>{tp[el.dataset.k]=el.tagName==='SELECT'?el.value:el.value;try{localStorage.setItem(SET_KEY,JSON.stringify(tp))}catch{}if(el.tagName==='SELECT')transitionControls();request()});
  controls.querySelector('#tAdd').onclick=()=>{const T=transition(params());saveHistory();
    const it={id:makeId(),type:'transition',name:tLabel(),qty:1,material:'0.55 BMT galvanised',allowance:0,width:Math.round((T.perimeterIn+T.perimeterOut)/2),length:Math.round(T.slant),
      notes:`Built in 3D. Developed area ≈ ${T.areaM2.toFixed(2)} m² (cut list uses mean perimeter × slant length).`,fitting:{kind:'transition',...params()},x:snap(-cam.x/cam.z+60),y:snap(-cam.y/cam.z+120),w:grid*6,h:grid*4,stroke:'#57d884',fill:'#57d884',fillOpacity:20,lineWidth:3};
    items.push(it);selected=it;selectedFields(it);tally();queueSave();info.textContent='Added to cut list: '+it.name};
  controls.querySelector('#tPattern').onclick=()=>{const svg=patternSvg(flatPattern(transition(params())),tLabel());download(`flat-pattern-${tLabel().replace(/[^a-z0-9]+/gi,'-')}.svg`,'image/svg+xml',svg)};
}
function drawTransition(){
  const T=transition(params()),span=Math.max(+tp.length,+tp.inW||+tp.inD,+tp.outW||+tp.outD,+tp.inH||0,+tp.outH||0);
  view.span=span;view.target=[(+tp.offX||0)/2,(+tp.offY||0)/2,+tp.length/2];
  // display axes: X across, Y up/down → shown on X/Z plane; run length along Y (depth)
  const P=p=>[p[0],p[2],p[1]];
  const cam=view.begin(),g=view.ctx,light=[.4,-.6,.7];
  const faces=T.tris.map(t=>{const q=t.map(P),pr=q.map(p=>view.project(cam,p));if(pr.some(x=>!x))return null;
    const u=[q[1][0]-q[0][0],q[1][1]-q[0][1],q[1][2]-q[0][2]],w=[q[2][0]-q[0][0],q[2][1]-q[0][1],q[2][2]-q[0][2]],n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],nl=Math.hypot(...n)||1;
    const shade=Math.abs((n[0]*light[0]+n[1]*light[1]+n[2]*light[2])/nl);return {pr,z:(pr[0].z+pr[1].z+pr[2].z)/3,shade}}).filter(Boolean).sort((a,b)=>b.z-a.z);
  for(const f of faces){const c=Math.round(110+120*f.shade);g.fillStyle=`rgb(${c-25},${c},${c+20})`;g.strokeStyle=g.fillStyle;g.lineWidth=.6;g.beginPath();f.pr.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();g.stroke()}
  for(const [ringPts,col] of [[T.A,'#ffb84d'],[T.B,'#5cb8ff']]){const pr=ringPts.map(p=>view.project(cam,P(p)));if(pr.some(x=>!x))continue;g.strokeStyle=col;g.lineWidth=2;g.beginPath();pr.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.stroke()}
  info.textContent=`${tLabel()} · developed area ≈ ${T.areaM2.toFixed(2)} m² · slant ${Math.round(T.slant)} mm · orange = inlet, blue = outlet. Drag to turn, pinch to zoom.`;
}

// ---- 3D sketch tab ----
const sk={plane:'floor',height:0,grid:50};
function sketchControls(){
  controls.innerHTML=`<div class="fields"><div><label>Draw on</label><select id="skPlane"><option value="floor">Floor / ceiling plane (flat)</option><option value="front">Front wall plane</option><option value="side">Side wall plane</option></select></div>
  <div><label id="skHLabel">Height (mm)</label><input id="skHeight" type="number" step="50" value="${sk.height}"></div><div><label>Snap (mm)</label><select id="skSnap"><option>10</option><option selected>50</option><option>100</option></select></div></div>
  <div class="grid" style="margin-top:8px"><button id="skBreak">New line (lift pen)</button><button id="skUndo">Undo point</button><button id="skClear" class="danger">Clear sketch</button></div>
  <div class="note">Tap to place a point; each tap joins to the last one. Tap an existing point to join to it. Drag to turn the view. Change the plane or height to draw up walls or across ceilings.</div>`;
  const plane=controls.querySelector('#skPlane');plane.value=sk.plane;
  const label=()=>{controls.querySelector('#skHLabel').textContent=sk.plane==='floor'?'Height (mm)':sk.plane==='front'?'Depth (mm)':'Across (mm)'};label();
  plane.onchange=()=>{sk.plane=plane.value;label();request()};
  controls.querySelector('#skHeight').oninput=e=>{sk.height=+e.target.value||0;request()};
  controls.querySelector('#skSnap').onchange=e=>{sk.grid=+e.target.value};
  controls.querySelector('#skBreak').onclick=()=>{chainFrom=null;request()};
  controls.querySelector('#skUndo').onclick=()=>{if(!sketch.points.length)return;const last=sketch.points.length-1;sketch.lines=sketch.lines.filter(l=>l[0]!==last&&l[1]!==last);sketch.points.pop();chainFrom=sketch.points.length?sketch.points.length-1:null;queueSave();request()};
  controls.querySelector('#skClear').onclick=()=>{if(sketch.points.length&&!confirm('Clear the 3D sketch?'))return;sketch={points:[],lines:[]};chainFrom=null;queueSave();request()};
}
function planeHit(cam,sx,sy){
  const r=view.ray(cam,sx,sy),axis=sk.plane==='floor'?2:sk.plane==='front'?1:0;
  if(Math.abs(r.d[axis])<1e-6)return null;const t=(sk.height-r.o[axis])/r.d[axis];if(t<=0)return null;
  const p=[0,1,2].map(i=>r.o[i]+r.d[i]*t);p[axis]=sk.height;
  for(let i=0;i<3;i++)if(i!==axis)p[i]=Math.round(p[i]/sk.grid)*sk.grid;
  return p;
}
function sketchTap(sx,sy){
  if(mode!=='sketch')return;
  const cam=view.camera();
  let idx=sketch.points.findIndex(p=>{const s=view.project(cam,[p.x,p.y,p.z]);return s&&Math.hypot(s.x-sx,s.y-sy)<16});
  if(idx<0){const p=planeHit(cam,sx,sy);if(!p)return;sketch.points.push({x:p[0],y:p[1],z:p[2]});idx=sketch.points.length-1}
  if(chainFrom!=null&&chainFrom!==idx&&!sketch.lines.some(l=>(l[0]===chainFrom&&l[1]===idx)||(l[0]===idx&&l[1]===chainFrom)))sketch.lines.push([chainFrom,idx]);
  chainFrom=idx;queueSave();request();
}
function drawSketch(){
  const pts=sketch.points;
  if(pts.length){const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),zs=pts.map(p=>p.z);view.target=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,(Math.min(...zs)+Math.max(...zs))/2];view.span=Math.max(800,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),Math.max(...zs)-Math.min(...zs))}
  else{view.target=[500,500,0];view.span=1000}
  const cam=view.begin(),g=view.ctx,axis=sk.plane==='floor'?2:sk.plane==='front'?1:0,S=Math.ceil(view.span*1.5/100)*100,c=view.target;
  // active plane grid
  g.lineWidth=1;
  for(let a=-S;a<=S;a+=100){for(const dir of [0,1]){
    const p1=[0,0,0],p2=[0,0,0],other=[0,1,2].filter(i=>i!==axis);p1[axis]=p2[axis]=sk.height;
    const i=other[dir],j=other[1-dir];p1[i]=p2[i]=Math.round(c[i]/100)*100+a;p1[j]=Math.round(c[j]/100)*100-S;p2[j]=Math.round(c[j]/100)*100+S;
    const s1=view.project(cam,p1),s2=view.project(cam,p2);if(!s1||!s2)continue;g.strokeStyle=a%500?'#232a34':'#334050';g.beginPath();g.moveTo(s1.x,s1.y);g.lineTo(s2.x,s2.y);g.stroke()}}
  // axes at origin
  for(const [v,col] of [[[600,0,0],'#ff7777'],[[0,600,0],'#57d884'],[[0,0,600],'#5cb8ff']]){const o=view.project(cam,[0,0,0]),e=view.project(cam,v);if(o&&e){g.strokeStyle=col;g.lineWidth=2;g.beginPath();g.moveTo(o.x,o.y);g.lineTo(e.x,e.y);g.stroke()}}
  g.font='12px system-ui';
  for(const [a,b] of sketch.lines){const A=pts[a],B=pts[b],s1=view.project(cam,[A.x,A.y,A.z]),s2=view.project(cam,[B.x,B.y,B.z]);if(!s1||!s2)continue;
    g.strokeStyle='#ffcd6b';g.lineWidth=3;g.beginPath();g.moveTo(s1.x,s1.y);g.lineTo(s2.x,s2.y);g.stroke();
    g.fillStyle='#ffe2a8';g.fillText(Math.round(Math.hypot(A.x-B.x,A.y-B.y,A.z-B.z))+' mm',(s1.x+s2.x)/2+5,(s1.y+s2.y)/2-5)}
  pts.forEach((p,i)=>{const s=view.project(cam,[p.x,p.y,p.z]);if(!s)return;g.fillStyle=i===chainFrom?'#57d884':'#eaf2f8';g.beginPath();g.arc(s.x,s.y,i===chainFrom?7:5,0,Math.PI*2);g.fill()});
  const total=sketch.lines.reduce((s,[a,b])=>s+Math.hypot(pts[a].x-pts[b].x,pts[a].y-pts[b].y,pts[a].z-pts[b].z),0);
  info.textContent=`${pts.length} point(s) · ${sketch.lines.length} line(s) · total ${(total/1000).toFixed(2)} m · drawing on ${sk.plane==='floor'?'flat plane at height':sk.plane==='front'?'front plane at depth':'side plane at'} ${sk.height} mm. Red = X, green = Y, blue = up.`;
}

// ---- room planner: room size + objects placed by measuring from the walls ----
// Axes: X left wall (0) → right wall (W); Y front wall (0) → back wall (D); Z floor (0) → ceiling (H).
// Every distance is measured from the named wall to the NEAR edge of the object.
const TYPES={
  bulkhead:{label:'Bulkhead',color:[150,160,175],def:{w:1200,d:600,h:300,xRef:'left',x:0,yRef:'back',y:0,zMode:'ceiling',z:0}},
  grille:{label:'Supply grille',color:[92,184,255],def:{gA:600,gB:150,face:'down',xRef:'left',x:600,yRef:'back',y:0,zMode:'under',z:0}},
  return:{label:'Return grille',color:[255,184,77],def:{gA:600,gB:600,face:'down',xRef:'left',x:1500,yRef:'front',y:600,zMode:'ceiling',z:0}},
  column:{label:'Column',color:[200,140,110],def:{w:300,d:300,h:0,xRef:'left',x:1500,yRef:'back',y:1500,zMode:'full',z:0}},
  unit:{label:'Indoor unit',color:[87,216,132],def:{w:1000,d:700,h:250,xRef:'left',x:1000,yRef:'back',y:0,zMode:'ceiling',z:0}},
  box:{label:'Other / box',color:[190,150,230],def:{w:500,d:500,h:500,xRef:'left',x:500,yRef:'front',y:500,zMode:'floor',z:0}}};
let plan={room:null,objects:[]},planSel=null,planView='3d';
const isGrille=o=>o.type==='grille'||o.type==='return';
function planRoom(){if(!plan.room){const r=typeof room==='function'?room():{w:3000,d:3000,h:2700};plan.room={w:r.w,d:r.d,h:r.h}}return plan.room}
function dims(o,R){if(isGrille(o)){const T=20;return o.face==='down'?[+o.gA,+o.gB,T]:o.face==='front'?[+o.gA,T,+o.gB]:[T,+o.gA,+o.gB]}
  return [+o.w||0,+o.d||0,o.zMode==='full'?R.h:+o.h||0]}
function boxOf(o,R,all){const [sx,sy,sz]=dims(o,R);
  const x0=o.xRef==='right'?R.w-(+o.x||0)-sx:+o.x||0,y0=o.yRef==='front'?+o.y||0:R.d-(+o.y||0)-sy;let z0;
  if(o.zMode==='floor'||o.zMode==='full')z0=0;else if(o.zMode==='height')z0=+o.z||0;else if(o.zMode==='under'){
    const cx=x0+sx/2,cy=y0+sy/2;let top=R.h;
    for(const q of all||[]){if(q===o||isGrille(q))continue;const b=boxOf(q,R,null);if(cx>=b.x0-1&&cx<=b.x1+1&&cy>=b.y0-1&&cy<=b.y1+1&&b.z0>0&&b.z0<top)top=b.z0}
    z0=top-sz}
  else z0=R.h-sz;
  return {x0,x1:x0+sx,y0,y1:y0+sy,z0,z1:z0+sz}}
function addObject(type){const t=TYPES[type],n=plan.objects.filter(o=>o.type===type).length+1;
  const o={id:makeId(),type,name:t.label+(n>1?' '+n:''),...t.def};plan.objects.push(o);planSel=o.id;queueSave();roomControls();request()}
function roomControls(){
  const R=planRoom(),o=plan.objects.find(q=>q.id===planSel);
  const num=(k,l,v,extra='')=>`<div><label>${l}</label><input data-pk="${k}" type="number" step="10" value="${esc(v)}" ${extra}></div>`;
  const sel=(k,l,opts,v)=>`<div><label>${l}</label><select data-pk="${k}">${opts.map(([val,t])=>`<option value="${val}" ${v===val?'selected':''}>${t}</option>`).join('')}</select></div>`;
  let form='';
  if(o){const g=isGrille(o);
    form=`<div class="fields" style="margin-top:8px"><div style="grid-column:1/-1"><label>Name</label><input data-pk="name" value="${esc(o.name)}"></div>
    ${g?num('gA',o.face==='side'?'Grille length along wall':'Grille width (across)',o.gA)+num('gB',o.face==='down'?'Grille depth (front–back)':'Grille height',o.gB)+sel('face','Grille faces',[['down','Down (ceiling / bulkhead)'],['front','Into room (back/front wall)'],['side','Into room (side wall)']],o.face)
      :num('w','Width (left–right)',o.w)+num('d','Depth (front–back)',o.d)+(o.zMode==='full'?'':num('h',o.type==='bulkhead'?'Drop from ceiling':'Height',o.h))}
    ${sel('xRef','Measure across from',[['left','Left wall'],['right','Right wall']],o.xRef)}${num('x','Distance (mm)',o.x)}
    ${sel('yRef','Measure from',[['back','Back wall'],['front','Front wall']],o.yRef)}${num('y','Distance (mm)',o.y)}
    ${sel('zMode','Height',[['ceiling','Fixed to ceiling'],['under','Under bulkhead / unit above'],['floor','Sits on floor'],['full','Floor to ceiling'],['height','Bottom at height…']],o.zMode)}
    ${o.zMode==='height'?num('z','Bottom height from floor',o.z):''}</div>
    <div class="grid" style="margin-top:8px"><button id="rpDup">Duplicate</button><button id="rpDel" class="danger">Delete</button></div>`}
  controls.innerHTML=`<div class="fields">${num('rw','Room width (left–right)',R.w)}${num('rd','Room depth (front–back)',R.d)}${num('rh','Ceiling height',R.h)}</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${Object.entries(TYPES).map(([k,t])=>`<button data-add="${k}" style="width:auto;padding:6px 10px">+ ${t.label}</button>`).join('')}</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${plan.objects.map(q=>`<button data-sel="${esc(q.id)}" style="width:auto" class="${q.id===planSel?'active':''}">${esc(q.name)}</button>`).join('')||'<span class="note">Add the bulkhead, grilles, columns… then type their measurements.</span>'}</div>
  ${form}
  <div class="grid" style="margin-top:8px"><button id="rpView" class="primary">${planView==='3d'?'Show plan (top view)':'Show 3D view'}</button><button id="rpSync">Use this room in 3D mock-up</button></div>
  <div class="note">Distances are from the wall to the nearest edge of the item. Standing at the front wall looking at the back wall: left is left. Tap an item in the view to select it.</div>`;
  controls.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addObject(b.dataset.add));
  controls.querySelectorAll('[data-sel]').forEach(b=>b.onclick=()=>{planSel=b.dataset.sel;roomControls();request()});
  controls.querySelectorAll('[data-pk]').forEach(el=>{const k=el.dataset.pk;el.oninput=el.onchange=e=>{
    if(k==='rw'||k==='rd'||k==='rh'){R[{rw:'w',rd:'d',rh:'h'}[k]]=Math.max(100,+el.value||0)}
    else if(o){o[k]=el.type==='number'?(+el.value||0):el.value;if(el.tagName==='SELECT'&&e.type==='change'){queueSave();roomControls();request();return}}
    queueSave();request()}});
  const dup=controls.querySelector('#rpDup');if(dup)dup.onclick=()=>{const c={...o,id:makeId(),name:o.name+' copy'};plan.objects.push(c);planSel=c.id;queueSave();roomControls();request()};
  const del=controls.querySelector('#rpDel');if(del)del.onclick=()=>{plan.objects=plan.objects.filter(q=>q!==o);planSel=null;queueSave();roomControls();request()};
  controls.querySelector('#rpView').onclick=()=>{planView=planView==='3d'?'plan':'3d';roomControls();request()};
  controls.querySelector('#rpSync').onclick=()=>{const m={roomW:R.w,roomD:R.d,roomH:R.h};for(const [id,v] of Object.entries(m)){const el=$('#'+id);if(el){el.value=v;el.dispatchEvent(new Event('input'))}}queueSave();info.textContent='3D mock-up room set to '+R.w+' × '+R.d+' × '+R.h};
}
const rgb=(c,k=1,a=1)=>`rgba(${Math.round(c[0]*k)},${Math.round(c[1]*k)},${Math.round(c[2]*k)},${a})`;
function boxFaces(b){const {x0,x1,y0,y1,z0,z1}=b;return [
  [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]],[[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[0,1,0]],
  [[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[-1,0,0]],[[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0]],
  [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],[[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0],[0,0,-1]]]}
function dimLine3d(cam,g,a,b,text,col){const s1=view.project(cam,a),s2=view.project(cam,b);if(!s1||!s2)return;
  g.strokeStyle=col;g.lineWidth=1.5;g.setLineDash([5,4]);g.beginPath();g.moveTo(s1.x,s1.y);g.lineTo(s2.x,s2.y);g.stroke();g.setLineDash([]);
  for(const s of [s1,s2]){g.beginPath();g.arc(s.x,s.y,2.5,0,7);g.fillStyle=col;g.fill()}
  label(g,text,(s1.x+s2.x)/2,(s1.y+s2.y)/2,col)}
function label(g,text,x,y,col){g.font='bold 12px system-ui';const w=g.measureText(text).width+8;g.fillStyle='rgba(10,13,18,.85)';g.fillRect(x-w/2,y-9,w,18);g.fillStyle=col;g.textAlign='center';g.textBaseline='middle';g.fillText(text,x,y);g.textAlign='start';g.textBaseline='alphabetic'}
function drawRoom(){planView==='plan'?drawPlan2d():drawRoom3d()}
function drawRoom3d(){
  const R=planRoom(),all=plan.objects;view.target=[R.w/2,R.d/2,R.h/2];view.span=Math.max(R.w,R.d,R.h)*(FC.clientWidth<FC.clientHeight*1.2?.72:.5);
  const cam=view.begin(),g=view.ctx,light=[.35,-.55,.75];
  const quad=(pts,fill,stroke)=>{const pr=pts.map(p=>view.project(cam,p));if(pr.some(q=>!q))return;g.beginPath();pr.forEach((q,i)=>i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y));g.closePath();if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=1;g.stroke()}};
  // room shell: show only the surfaces facing us from inside (far walls, floor, ceiling from below)
  const shell=[{n:'floor',p:[[0,0,0],[R.w,0,0],[R.w,R.d,0],[0,R.d,0]],in:[0,0,1],c:'#33404e'},{n:'back',p:[[0,R.d,0],[R.w,R.d,0],[R.w,R.d,R.h],[0,R.d,R.h]],in:[0,-1,0],c:'#2a3542'},
    {n:'front',p:[[R.w,0,0],[0,0,0],[0,0,R.h],[R.w,0,R.h]],in:[0,1,0],c:'#2a3542'},{n:'left',p:[[0,0,0],[0,R.d,0],[0,R.d,R.h],[0,0,R.h]],in:[1,0,0],c:'#26303c'},
    {n:'right',p:[[R.w,R.d,0],[R.w,0,0],[R.w,0,R.h],[R.w,R.d,R.h]],in:[-1,0,0],c:'#26303c'},{n:'ceiling',p:[[0,0,R.h],[0,R.d,R.h],[R.w,R.d,R.h],[R.w,0,R.h]],in:[0,0,-1],c:'#222b36'}];
  for(const s of shell){const c=s.p.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4,a[2]+p[2]/4],[0,0,0]),v=[c[0]-cam.pos[0],c[1]-cam.pos[1],c[2]-cam.pos[2]];
    if(v[0]*s.in[0]+v[1]*s.in[1]+v[2]*s.in[2]<0)quad(s.p,s.c,'#3a4656')}
  // floor grid every 500
  g.strokeStyle='#2e3845';for(let x=500;x<R.w;x+=500)quad([[x,0,0],[x,R.d,0],[x,R.d,0],[x,0,0]],null,'#2e3845');for(let y=500;y<R.d;y+=500)quad([[0,y,0],[R.w,y,0],[R.w,y,0],[0,y,0]],null,'#2e3845');
  // wall names on the floor edges
  for(const [t,p] of [['LEFT',[0,R.d/2,0]],['RIGHT',[R.w,R.d/2,0]],['BACK',[R.w/2,R.d,0]],['FRONT',[R.w/2,0,0]]]){const s=view.project(cam,p);if(s){g.font='bold 11px system-ui';g.fillStyle='#8fa3b8';g.textAlign='center';g.fillText(t,s.x,s.y+14);g.textAlign='start'}}
  // objects (painter's algorithm over visible faces)
  const faces=[];
  for(const o of all){const b=boxOf(o,R,all),col=TYPES[o.type]?.color||[180,180,180],selected=o.id===planSel;
    for(const f of boxFaces(b)){const pts=f.slice(0,4),n=f[4],c=pts.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4,a[2]+p[2]/4],[0,0,0]),v=[c[0]-cam.pos[0],c[1]-cam.pos[1],c[2]-cam.pos[2]];
      if(v[0]*n[0]+v[1]*n[1]+v[2]*n[2]>=0)continue;const pr=pts.map(p=>view.project(cam,p));if(pr.some(q=>!q))continue;
      faces.push({pr,z:Math.hypot(...v),shade:.55+.45*Math.abs(n[0]*light[0]+n[1]*light[1]+n[2]*light[2]),col,selected})}}
  faces.sort((a,b)=>b.z-a.z);
  for(const f of faces){g.beginPath();f.pr.forEach((q,i)=>i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y));g.closePath();g.fillStyle=rgb(f.col,f.shade,.92);g.fill();g.strokeStyle=f.selected?'#ffffff':'rgba(0,0,0,.45)';g.lineWidth=f.selected?2:1;g.stroke()}
  for(const o of all){const b=boxOf(o,R,all),s=view.project(cam,[(b.x0+b.x1)/2,(b.y0+b.y1)/2,isGrille(o)?b.z0:b.z1]);if(s){g.font='11px system-ui';g.fillStyle='#eaf2f8';g.textAlign='center';g.fillText(o.name,s.x,isGrille(o)?s.y+14:s.y-6);g.textAlign='start'}}
  // dimensions for the selected item, drawn at its base level
  const o=all.find(q=>q.id===planSel);
  if(o){const b=boxOf(o,R,all),z=Math.max(0,Math.min(R.h,b.z0)),cy=(b.y0+b.y1)/2,cx=(b.x0+b.x1)/2;
    if(o.xRef==='right')dimLine3d(cam,g,[b.x1,cy,z],[R.w,cy,z],(+o.x||0)+' from right','#ffcd6b');else dimLine3d(cam,g,[0,cy,z],[b.x0,cy,z],(+o.x||0)+' from left','#ffcd6b');
    if(o.yRef==='front')dimLine3d(cam,g,[cx,0,z],[cx,b.y0,z],(+o.y||0)+' from front','#7fe0a8');else dimLine3d(cam,g,[cx,b.y1,z],[cx,R.d,z],(+o.y||0)+' from back','#7fe0a8');
    if(b.z0>1)dimLine3d(cam,g,[b.x1,b.y0,0],[b.x1,b.y0,b.z0],Math.round(b.z0)+' AFL','#9fc8ff')}
  info.textContent=summary()+' Drag to turn, pinch to zoom, tap an item to select.';
}
function summary(){const R=planRoom();return `Room ${R.w} × ${R.d} × ${R.h} mm · ${plan.objects.length} item(s).`+(()=>{const o=plan.objects.find(q=>q.id===planSel);if(!o)return '';const b=boxOf(o,R,plan.objects);
  return ` ${o.name}: ${Math.round(b.x1-b.x0)}×${Math.round(b.y1-b.y0)}×${Math.round(b.z1-b.z0)}, ${o.x} from ${o.xRef}, ${o.y} from ${o.yRef}, bottom ${Math.round(b.z0)} AFL.`})()}
let planFit=null;
function drawPlan2d(){
  const R=planRoom(),all=plan.objects,W=FC.clientWidth,H=FC.clientHeight;view.begin();const g=view.ctx,m=56,s=Math.min((W-2*m)/R.w,(H-2*m)/R.d),ox=(W-R.w*s)/2,oy=(H-R.d*s)/2;
  const X=x=>ox+x*s,Y=y=>oy+(R.d-y)*s;planFit={X,Y,s,ox,oy};
  g.fillStyle='#262e38';g.fillRect(X(0),Y(R.d),R.w*s,R.d*s);g.strokeStyle='#8fa3b8';g.lineWidth=3;g.strokeRect(X(0),Y(R.d),R.w*s,R.d*s);
  g.font='bold 11px system-ui';g.fillStyle='#8fa3b8';g.textAlign='center';g.fillText('BACK WALL',X(R.w/2),Y(R.d)-30);g.fillText('FRONT WALL',X(R.w/2),Y(0)+40);
  g.save();g.translate(X(0)-38,Y(R.d/2));g.rotate(-Math.PI/2);g.fillText('LEFT WALL',0,0);g.restore();g.save();g.translate(X(R.w)+38,Y(R.d/2));g.rotate(Math.PI/2);g.fillText('RIGHT WALL',0,0);g.restore();g.textAlign='start';
  label(g,R.w+'',X(R.w/2),Y(R.d)-14,'#cfd8e3');g.save();g.translate(X(0)-18,Y(R.d/2));g.rotate(-Math.PI/2);label(g,R.d+'',0,0,'#cfd8e3');g.restore();
  // higher items drawn last so grilles on a bulkhead stay visible
  const sorted=[...all].sort((a,b)=>(isGrille(a)?1:0)-(isGrille(b)?1:0));
  for(const o of sorted){const b=boxOf(o,R,all),col=TYPES[o.type]?.color||[180,180,180];const x=X(b.x0),y=Y(b.y1),w=(b.x1-b.x0)*s,h=(b.y1-b.y0)*s;
    g.fillStyle=rgb(col,1,isGrille(o)?.9:.55);g.fillRect(x,y,Math.max(w,2),Math.max(h,2));g.strokeStyle=o.id===planSel?'#fff':rgb(col,1.1);g.lineWidth=o.id===planSel?2.5:1.2;g.strokeRect(x,y,Math.max(w,2),Math.max(h,2));
    if(isGrille(o)&&o.face==='down'){g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;for(let k=4;k<w;k+=6){g.beginPath();g.moveTo(x+k,y);g.lineTo(x+k,y+h);g.stroke()}}
    g.font='11px system-ui';g.fillStyle='#eaf2f8';if(isGrille(o)){g.textAlign='center';g.fillText(o.name,x+w/2,y+h+13)}else g.fillText(o.name,x+4,y+13);g.textAlign='start'}
  // dimension lines from the reference walls (all items, selected one brighter)
  for(const o of all){const b=boxOf(o,R,all),sel=o.id===planSel,col=sel?'#ffcd6b':'rgba(255,205,107,.55)',col2=sel?'#7fe0a8':'rgba(127,224,168,.55)',cy=Y((b.y0+b.y1)/2),cx=X((b.x0+b.x1)/2);
    const dl=(x1,y1,x2,y2,t,c)=>{if(Math.hypot(x2-x1,y2-y1)<2)return;g.strokeStyle=c;g.lineWidth=1;g.setLineDash([4,3]);g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();g.setLineDash([]);if(sel||Math.hypot(x2-x1,y2-y1)>40)label(g,t,(x1+x2)/2,(y1+y2)/2,c)};
    if(o.xRef==='right')dl(X(b.x1),cy,X(R.w),cy,String(o.x),col);else dl(X(0),cy,X(b.x0),cy,String(o.x),col);
    if(o.yRef==='front')dl(cx,Y(0),cx,Y(b.y0),String(o.y),col2);else dl(cx,Y(R.d),cx,Y(b.y1),String(o.y),col2)}
  info.textContent=summary()+' Plan view from above (back wall at the top). Tap an item to select it.';
}
function pickRoom(sx,sy){
  const R=planRoom(),all=plan.objects;let best=null,bt=Infinity;
  if(planView==='plan'&&planFit){const {X,Y}=planFit;for(const o of [...all].reverse()){const b=boxOf(o,R,all);if(sx>=X(b.x0)-6&&sx<=X(b.x1)+6&&sy>=Y(b.y1)-6&&sy<=Y(b.y0)+6){best=o;break}}}
  else{const cam=view.camera(),r=view.ray(cam,sx,sy);
    for(const o of all){const b=boxOf(o,R,all),lo=[b.x0,b.y0,b.z0],hi=[b.x1,b.y1,b.z1];let t0=0,t1=Infinity,hit=true;
      for(let i=0;i<3;i++){if(Math.abs(r.d[i])<1e-9){if(r.o[i]<lo[i]-15||r.o[i]>hi[i]+15){hit=false;break}continue}
        let a=(lo[i]-15-r.o[i])/r.d[i],c=(hi[i]+15-r.o[i])/r.d[i];if(a>c)[a,c]=[c,a];t0=Math.max(t0,a);t1=Math.min(t1,c);if(t0>t1){hit=false;break}}
      if(hit&&t0<bt){bt=t0;best=o}}}
  planSel=best?best.id:null;roomControls();request();
}

// ---- pane wiring ----
const tabs={transition:'#tabTransition',sketch:'#tabSketch',room:'#tabRoom'};
function openPane(m){mode=m;pane.style.display='flex';for(const [k,s] of Object.entries(tabs))$(s).classList.toggle('active',k===m);
  view.yaw=m==='transition'?.7:m==='room'?.45:.6;view.pitch=m==='transition'?.35:m==='room'?.4:.6;view.dist=1;({transition:transitionControls,sketch:sketchControls,room:roomControls})[m]();request()}
bindOrbit(view,request,(x,y)=>mode==='room'?pickRoom(x,y):sketchTap(x,y));
$('#openTransition').onclick=()=>openPane('transition');$('#openSketch').onclick=()=>openPane('sketch');$('#openRoomPlan').onclick=()=>openPane('room');
$('#tabTransition').onclick=()=>openPane('transition');$('#tabSketch').onclick=()=>openPane('sketch');$('#tabRoom').onclick=()=>openPane('room');
$('#fitClose').onclick=()=>{pane.style.display='none'};
$('#fitPng').onclick=()=>FC.toBlob(b=>download(`${mode==='transition'?'transition':mode==='room'?'room-plan':'3d-sketch'}-${($('#job').value||'job').replace(/[^a-z0-9]+/gi,'-')}.png`,'image/png',b),'image/png');
addEventListener('resize',()=>{if(pane.style.display==='flex')request()});

// ---- persistence: sketch travels with the drawing (local autosave and WorkBrain cloud) ----
const basePayload=payload;payload=function(){const p=basePayload();p.sketch3d=sketch;p.roomPlan=plan;return p};
const validPlan=v=>v&&Array.isArray(v.objects)?{room:v.room&&+v.room.w&&+v.room.d&&+v.room.h?{w:+v.room.w,d:+v.room.d,h:+v.room.h}:null,objects:v.objects.filter(o=>o&&TYPES[o.type])}:{room:null,objects:[]};
try{const d=JSON.parse(localStorage.getItem(wbAutoKey)||localStorage.getItem(wbSaveKey)||'null');if(d&&d.sketch3d&&Array.isArray(d.sketch3d.points))sketch=d.sketch3d;if(d&&d.roomPlan)plan=validPlan(d.roomPlan)}catch{}

window.CADFittings={transition,flatPattern,patternSvg,ring,getSketch:()=>sketch,setSketch:s=>{sketch=s&&Array.isArray(s.points)?s:{points:[],lines:[]};chainFrom=null;request()},open:openPane,getPlan:()=>plan,setPlan:v=>{plan=validPlan(v);planSel=null;if(mode==='room'&&pane.style.display==='flex')roomControls();request()},boxOf,
  addObject:(type,fields)=>{addObject(type);const o=plan.objects[plan.objects.length-1];Object.assign(o,fields||{});if(mode==='room')roomControls();request();return o}};
})();
