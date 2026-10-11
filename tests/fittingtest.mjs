const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const {chromium}=pw.default||pw;
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:8781';const b=await chromium.launch();let fails=0;
const check=async(n,f)=>{try{await f();console.log('ok -',n)}catch(e){fails++;console.log('not ok -',n,e.message)}};
async function open(mobile,job='fit'){const ctx=await b.newContext(mobile?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{viewport:{width:1280,height:800}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(base+'/index.html?wbJobId='+job+'&wbJobRef=WB-2026-0202');await p.waitForTimeout(400);return {p,errs,ctx}}
const painted=p=>p.evaluate(()=>{const c=document.querySelector('#fitCanvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let lit=0;for(let i=0;i<d.length;i+=16)if(d[i]+d[i+1]+d[i+2]>130)lit++;return lit/(d.length/16)});

await check('room planner: bulkhead back-left, grille 600 from left under it, column by measurement',async()=>{const {p,errs}=await open(false,'room1');
  await p.click('#openRoomPlan');await p.waitForTimeout(200);
  await p.fill('[data-pk="rw"]','4000');await p.fill('[data-pk="rd"]','5000');await p.fill('[data-pk="rh"]','2700');
  await p.click('[data-add="bulkhead"]');await p.fill('[data-pk="w"]','1500');await p.fill('[data-pk="d"]','600');await p.fill('[data-pk="h"]','350');
  await p.click('[data-add="grille"]');await p.fill('[data-pk="x"]','600');await p.fill('[data-pk="y"]','200');
  await p.click('[data-add="column"]');await p.fill('[data-pk="x"]','1800');await p.fill('[data-pk="y"]','2500');
  await p.selectOption('[data-pk="yRef"]','front');await p.fill('[data-pk="y"]','2200');
  await p.waitForTimeout(150);
  const r=await p.evaluate(()=>{const P=CADFittings.getPlan(),R=P.room;return P.objects.map(o=>({n:o.name,...CADFittings.boxOf(o,R,P.objects)}))});
  const [bh,gr,col]=r;
  assert.deepEqual([bh.x0,bh.x1,bh.y0,bh.y1,bh.z0,bh.z1],[0,1500,4400,5000,2350,2700],'bulkhead in back-left corner at ceiling');
  assert.deepEqual([gr.x0,gr.x1,gr.y0,gr.y1,gr.z1],[600,1200,4650,4800,2350],'grille 600 from left, sits under the bulkhead');
  assert.deepEqual([col.x0,col.x1,col.y0,col.y1,col.z0,col.z1],[1800,2100,2200,2500,0,2700],'column 1800 from left, 2200 from front, floor to ceiling');
  assert.ok(await painted(p)>.03,'3D drawn');assert.match(await p.textContent('#fitInfo'),/Room 4000 × 5000 × 2700 mm · 3 item/);
  // tap the column in 3D selects it
  await p.click('[data-sel]');const pt=await p.evaluate(()=>{const P=CADFittings.getPlan();return P.objects[2].id});
  await p.click('#rpView');await p.waitForTimeout(150);assert.ok(await painted(p)>.03,'plan drawn');
  const C=await p.locator('#fitCanvas').boundingBox();
  const tap=await p.evaluate(()=>{const c=document.querySelector('#fitCanvas'),W=c.clientWidth,H=c.clientHeight,m=56,s=Math.min((W-2*m)/4000,(H-2*m)/5000),ox=(W-4000*s)/2,oy=(H-5000*s)/2;return {x:ox+1950*s,y:oy+(5000-2350)*s}});
  await p.mouse.click(C.x+tap.x,C.y+tap.y);await p.waitForTimeout(150);
  assert.equal(await p.evaluate(()=>document.querySelector('[data-pk="name"]').value),'Column','tapped the column on the plan');
  await p.click('#rpView');await p.waitForTimeout(100);assert.deepEqual(errs,[]);
  await p.evaluate(()=>queueSave());await p.waitForTimeout(900);
  await p.reload();await p.waitForTimeout(500);
  const again=await p.evaluate(()=>CADFittings.getPlan());assert.equal(again.objects.length,3);assert.equal(again.room.w,4000);assert.equal(again.objects[2].y,2200)});

await check('room planner on a phone: controls fit, no sideways scroll',async()=>{const {p,errs}=await open(true,'room2');
  await p.evaluate(()=>document.querySelector('#openRoomPlan').click());await p.click('[data-add="bulkhead"]');await p.waitForTimeout(200);
  const ov=await p.evaluate(()=>{const pane=document.querySelector('#fittingPane');return {sw:pane.scrollWidth,cw:pane.clientWidth,ch:document.querySelector('#fitCanvas').clientHeight}});
  assert.ok(ov.sw<=ov.cw+1,'no overflow '+JSON.stringify(ov));assert.ok(ov.ch>250,'canvas has room: '+ov.ch);assert.ok(await painted(p)>.02);assert.deepEqual(errs,[])});

await check('transition: geometry, cut list and flat pattern keep true edge lengths',async()=>{const {p,errs}=await open(false,'tr');
  const r=await p.evaluate(()=>{const prm={inlet:{type:'rect',w:600,h:400},outlet:{type:'rect',w:600,h:400},length:500,offX:0,offY:0,segments:32};const T=CADFittings.transition(prm);
    const R2={inlet:{type:'rect',w:600,h:400},outlet:{type:'round',d:350},length:500,offX:100,offY:50,segments:32},T2=CADFittings.transition(R2),F=CADFittings.flatPattern(T2);
    const d3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]),d2=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);let err=0;
    for(let k=0;k<T2.n;k++){const k1=(k+1)%T2.n;err=Math.max(err,Math.abs(d2(F.a[k],F.b[k])-d3(T2.A[k],T2.B[k])),Math.abs(d2(F.a[k],F.a[k+1])-d3(T2.A[k],T2.A[k1])),Math.abs(d2(F.b[k],F.b[k+1])-d3(T2.B[k],T2.B[k1])),Math.abs(d2(F.a[k+1],F.b[k])-d3(T2.A[k1],T2.B[k])))}
    return {area:T.areaM2,per:T.perimeterIn,slant:T.slant,err,svg:CADFittings.patternSvg(F,'x').startsWith('<svg')}});
  assert.ok(Math.abs(r.area-1.0)<.001,'straight 600x400x500 = 2000 perimeter × 0.5 = 1 m²: '+r.area);assert.ok(Math.abs(r.per-2000)<.5);assert.ok(Math.abs(r.slant-500)<.01);
  assert.ok(r.err<.01,'edge length error '+r.err);assert.ok(r.svg);
  await p.click('#openTransition');await p.waitForTimeout(200);assert.ok(await painted(p)>.02);
  await p.click('#tAdd');const it=await p.evaluate(()=>items[items.length-1]);assert.equal(it.type,'transition');assert.match(it.name,/Transition 600×400 → Ø350/);
  const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#tPattern')]);assert.match(dl.suggestedFilename(),/^flat-pattern-.*\.svg$/);assert.deepEqual(errs,[])});

await check('3D sketch: taps place points on the plane and join them; survives reload',async()=>{const {p,errs}=await open(false,'sk');
  await p.click('#openSketch');await p.waitForTimeout(200);const C=await p.locator('#fitCanvas').boundingBox();
  for(const [dx,dy] of [[-120,40],[60,60],[140,-40]]){await p.mouse.click(C.x+C.width/2+dx,C.y+C.height/2+dy);await p.waitForTimeout(80)}
  const s=await p.evaluate(()=>CADFittings.getSketch());assert.equal(s.points.length,3);assert.equal(s.lines.length,2);assert.ok(s.points.every(q=>q.z===0&&q.x%50===0&&q.y%50===0));
  await p.mouse.move(C.x+C.width/2,C.y+C.height/2);await p.mouse.down();await p.mouse.move(C.x+C.width/2+150,C.y+C.height/2,{steps:5});await p.mouse.up();
  assert.equal((await p.evaluate(()=>CADFittings.getSketch())).points.length,3,'drag turns, does not add points');
  await p.evaluate(()=>queueSave());await p.waitForTimeout(900);await p.reload();await p.waitForTimeout(500);
  assert.equal((await p.evaluate(()=>CADFittings.getSketch())).lines.length,2);assert.deepEqual(errs,[])});

await b.close();if(fails){console.log(fails+' failed');process.exit(1)}console.log('all passed');
