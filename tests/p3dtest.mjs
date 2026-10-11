const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const {chromium}=pw.default||pw;
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:8781';const b=await chromium.launch();let fails=0;
const check=async(n,f)=>{try{await f();console.log('ok -',n)}catch(e){fails++;console.log('not ok -',n,e.message)}};
async function open(mobile){const ctx=await b.newContext(mobile?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{viewport:{width:1280,height:800}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(base+'/index.html?wbJobId=p3d&wbJobRef=WB-2026-0101');await p.waitForTimeout(400);
  await p.setInputFiles('#photoFile',''+new URL('./room.png',import.meta.url).pathname+'');await p.waitForFunction(()=>photo.img&&photo.box);return {p,errs,ctx}}
// map the synthetic photo's true corners (image px) into world coords
const place=p=>p.evaluate(()=>{const bx=photo.box,sx=bx.w/1200,sy=bx.h/900,P=(x,y)=>({x:bx.x+x*sx,y:bx.y+y*sy});
  CADPhoto3D.setTrace({front:[P(0,0),P(1200,0),P(1200,900),P(0,900)],back:[P(380,260),P(820,260),P(820,640),P(380,640)]});return bx});
await check('photo points map to the right surface and position',async()=>{const {p,errs}=await open(false);await place(p);
  const r=await p.evaluate(()=>{const bx=photo.box,sx=bx.w/1200,sy=bx.h/900,P=(x,y)=>({x:bx.x+x*sx,y:bx.y+y*sy}),R={w:4000,d:5000,h:2700},t=CADPhoto3D.getTrace();
    return {back:CADPhoto3D.photoTo3d(t,R,P(600,450)),ceil:CADPhoto3D.photoTo3d(t,R,P(600,100)),left:CADPhoto3D.photoTo3d(t,R,P(100,450))}});
  assert.equal(r.back.face,'back');assert.ok(Math.abs(r.back.xyz[0]-2000)<60&&Math.abs(r.back.xyz[1]-5000)<1&&Math.abs(r.back.xyz[2]-1350)<60,JSON.stringify(r.back.xyz));
  assert.equal(r.ceil.face,'ceiling');assert.equal(Math.round(r.ceil.xyz[2]),2700);
  assert.equal(r.left.face,'left');assert.equal(Math.round(r.left.xyz[0]),0);assert.deepEqual(errs,[])});
await check('dragging a corner handle by finger moves it',async()=>{const {p}=await open(true);await place(p);
  await p.evaluate(()=>{document.querySelector('#traceRoom').click()});
  const h=await p.evaluate(()=>{const q=CADPhoto3D.getTrace().back[0],r=document.querySelector('#c').getBoundingClientRect();return {x:r.left+cam.x+q.x*cam.z,y:r.top+cam.y+q.y*cam.z,orig:q}});
  await p.evaluate(({x,y})=>{const c=document.querySelector('#c');const ev=(t,cx,cy)=>c.dispatchEvent(new PointerEvent(t,{pointerId:3,pointerType:'touch',clientX:cx,clientY:cy,bubbles:true,cancelable:true}));ev('pointerdown',x,y);ev('pointermove',x+30,y+20);ev('pointerup',x+30,y+20)},h);
  const moved=await p.evaluate(()=>CADPhoto3D.getTrace().back[0]);
  assert.ok(Math.abs(moved.x-h.orig.x-30/ (await p.evaluate(()=>cam.z)))<1.5,'x moved');assert.equal(await p.evaluate(()=>items.length),0,'no shape drawn while tracing')});
await check('3D view renders the photo room with a ceiling flex run and a symbol',async()=>{const {p,errs}=await open(false);await place(p);
  await p.evaluate(()=>{const bx=photo.box,sx=bx.w/1200,sy=bx.h/900;items.push({id:'f1',type:'line',kind:'flex',diameter:350,x:bx.x+300*sx,y:bx.y+120*sy,w:600*sx,h:0,qty:1});
    items.push({id:'s1',type:'rect',kind:'symbol',symbol:'supply',x:bx.x+580*sx,y:bx.y+60*sy,w:40,h:40,qty:1,stroke:'#5cb8ff'});tally()});
  await p.click('#open3dPhoto');await p.waitForTimeout(400);
  assert.match(await p.textContent('#p3dInfo'),/1 duct run\(s\) · 1 symbol\(s\)/);
  const stats=await p.evaluate(()=>{const c=document.querySelector('#p3d'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let lit=0,green=0;for(let i=0;i<d.length;i+=16){if(d[i]+d[i+1]+d[i+2]>120)lit++;if(d[i+1]>150&&d[i]<140&&d[i+2]<140)green++}return {lit,green,total:d.length/16}});
  assert.ok(stats.lit/stats.total>.4,'room painted: '+JSON.stringify(stats));assert.ok(stats.green>50,'far wall texture visible');
  
  const C=await p.locator('#p3d').boundingBox();await p.mouse.move(C.x+C.width/2,C.y+C.height/2);await p.mouse.down();await p.mouse.move(C.x+C.width/2+220,C.y+C.height/2-80,{steps:6});await p.mouse.up();await p.waitForTimeout(200);
  assert.deepEqual(errs,[])});
await check('photo and corners are still there after reopening the job',async()=>{const {p}=await open(false);await place(p);await p.evaluate(()=>queueSave());await p.waitForTimeout(800);
  await p.goto(base+'/index.html?wbJobId=p3d&wbJobRef=WB-2026-0101');await p.waitForFunction(()=>photo.img&&photo.box,null,{timeout:5000});
  assert.ok(await p.evaluate(()=>!!CADPhoto3D.getTrace()&&CADPhoto3D.getTrace().back.length===4))});
await b.close();if(fails){console.log(fails+' failed');process.exit(1)}console.log('all passed');
