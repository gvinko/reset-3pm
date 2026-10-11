const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const {chromium}=pw.default||pw;
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:8781';const b=await chromium.launch();let fails=0;
async function open(mobile){const ctx=await b.newContext(mobile?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{viewport:{width:1280,height:800}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(base+'/index.html?wbJobId=j1&wbJobRef=WB-2026-0001&wbCustomer=Mel');await p.waitForTimeout(500);return {p,errs,ctx}}
const check=async(n,f)=>{try{await f();console.log('ok -',n)}catch(e){fails++;console.log('not ok -',n,e.message)}};
const box=async p=>p.locator('#c').boundingBox();
await check('flex runs total metres by diameter (desktop mouse)',async()=>{const {p,errs}=await open(false);const r=await box(p);
  await p.click('[data-kind="flex"]');await p.selectOption('#flexSize','350');
  await p.mouse.move(r.x+100,r.y+100);await p.mouse.down();await p.mouse.move(r.x+300,r.y+100,{steps:5});await p.mouse.up(); // 200px = 10 grid = 500mm @50
  await p.selectOption('#flexSize','250');
  await p.mouse.move(r.x+100,r.y+200);await p.mouse.down();await p.mouse.move(r.x+100,r.y+600,{steps:5});await p.mouse.up(); // 400px = 1000mm
  const rows=await p.$$eval('#takeoff tr',t=>t.map(r=>[...r.cells].map(c=>c.textContent.trim()).join(' ')));
  assert.deepEqual(rows,['Ø250 flex duct (m) 1 1.1','Ø350 flex duct (m) 0.5 0.55']);
  assert.match(await p.textContent('#total'),/^0 pieces/,'flex not in sheet cut list');assert.deepEqual(errs,[])});
await check('symbols place on tap, count in takeoff, survive Update selected',async()=>{const {p,errs}=await open(true);
  await p.click('#mobileTools');await p.click('[data-kind="symbol"]');await p.selectOption('#symbolType','supply');await p.click('#mobileTools');
  const tap=(x,y)=>p.evaluate(([x,y])=>{const c=document.querySelector('#c');for(const t of ['pointerdown','pointerup'])c.dispatchEvent(new PointerEvent(t,{pointerId:1,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}))},[x,y]);
  await tap(100,300);await tap(200,300);
  await p.evaluate(()=>{document.querySelector('#symbolType').value='return'});await tap(150,450);
  await p.evaluate(()=>{selected=items[0];selectedFields(selected);document.querySelector('#qty').value=3;document.querySelector('#apply').click()});
  const rows=await p.$$eval('#takeoff tr',t=>t.map(r=>[...r.cells].map(c=>c.textContent.trim()).join(' ')));
  assert.deepEqual(rows,['Supply grille 4 4','Return air grille 1 1']);
  assert.ok(await p.evaluate(()=>items[0].w>0),'symbol keeps its size after Update');assert.deepEqual(errs,[])});
await check('calibrate from a known line rescales measurements and persists',async()=>{const {p}=await open(false);const r=await box(p);
  await p.click('[data-tool="line"]:not([data-kind])');
  await p.mouse.move(r.x+100,r.y+100);await p.mouse.down();await p.mouse.move(r.x+300,r.y+100,{steps:5});await p.mouse.up(); // 10 grid
  p.on('dialog',d=>d.accept('820'));await p.click('#calibrate');
  assert.equal(await p.inputValue('#scale'),'82');assert.equal(await p.evaluate(()=>items[0].width),820);
  await p.waitForTimeout(700);await p.reload();await p.waitForTimeout(500);
  assert.equal(await p.inputValue('#scale'),'82');assert.equal(await p.evaluate(()=>mm()),82)});
await check('print sheet lists takeoff and escapes the job name',async()=>{const {p}=await open(false);const r=await box(p);
  await p.fill('#job','Mel <b>Smith</b>');await p.click('[data-kind="flex"]');
  await p.mouse.move(r.x+100,r.y+100);await p.mouse.down();await p.mouse.move(r.x+300,r.y+100,{steps:5});await p.mouse.up();
  const [w]=await Promise.all([p.waitForEvent('popup'),p.click('#printSheet')]);
  const html=await w.content();assert.match(html,/HVAC takeoff/);assert.match(html,/Ø350 flex duct/);assert.match(html,/Mel &lt;b&gt;Smith/);assert.match(html,/WorkBrain WB-2026-0001/)});
await check('CSV includes cut list and takeoff sections',async()=>{const {p}=await open(false);const r=await box(p);
  await p.click('[data-tool="rect"]:not([data-kind])');await p.mouse.move(r.x+100,r.y+100);await p.mouse.down();await p.mouse.move(r.x+200,r.y+200,{steps:4});await p.mouse.up();
  await p.click('[data-kind="flex"]');await p.mouse.move(r.x+100,r.y+300);await p.mouse.down();await p.mouse.move(r.x+300,r.y+300,{steps:4});await p.mouse.up();
  const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#csv')]);const txt=await (await dl.createReadStream()).toArray().then(c=>Buffer.concat(c).toString());
  assert.match(txt,/^Section,Piece/);assert.match(txt,/"Cut list","rect","rect","1"/);assert.match(txt,/"HVAC takeoff","Ø350 flex duct \(m\)","","0.5"/)});
await check('Export mock-up PNG downloads an image',async()=>{const {p,errs}=await open(false);const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#mockup')]);assert.match(dl.suggestedFilename(),/\.png$/);assert.deepEqual(errs,[])});
await b.close();if(fails){console.log(fails+' failed');process.exit(1)}console.log('all passed');
