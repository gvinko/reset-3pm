const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const {chromium}=pw.default||pw;
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:8781';
const b=await chromium.launch();
async function page(q=''){const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(base+'/index.html'+q);await p.waitForTimeout(500);return {p,ctx,errs}}
const touch=(p,steps)=>p.evaluate(steps=>{const c=document.querySelector('#c');for(const [t,id,x,y] of steps)c.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}))},steps);
let fails=0;const check=async(name,fn)=>{try{await fn();console.log('ok -',name)}catch(e){fails++;console.log('not ok -',name,e.message)}};

await check('finger drag draws a rectangle and autosaves it',async()=>{const {p,errs}=await page();
  await touch(p,[['pointerdown',1,80,300],['pointermove',1,140,350],['pointermove',1,200,400],['pointerup',1,200,400]]);
  assert.equal(await p.evaluate(()=>items.length),1);await p.waitForTimeout(700);
  assert.equal(JSON.parse(await p.evaluate(()=>localStorage.getItem('cad-drawer-autosave'))).items.length,1);assert.deepEqual(errs,[])});

await check('two-finger pinch zooms and does not draw',async()=>{const {p}=await page();
  const z0=await p.evaluate(()=>cam.z);
  await touch(p,[['pointerdown',1,150,400],['pointerdown',2,250,400],['pointermove',1,100,400],['pointermove',2,300,400],['pointerup',1,100,400],['pointerup',2,300,400]]);
  const z1=await p.evaluate(()=>cam.z);assert.ok(z1>z0*1.5,`zoom ${z0}->${z1}`);assert.equal(await p.evaluate(()=>items.length),0)});

await check('finger select-and-move moves a piece',async()=>{const {p}=await page();
  await touch(p,[['pointerdown',1,80,300],['pointermove',1,200,400],['pointerup',1,200,400]]);
  await p.click('#select');const before=await p.evaluate(()=>items[0].x);
  await touch(p,[['pointerdown',1,140,350],['pointermove',1,200,350],['pointerup',1,200,350]]);
  assert.ok(await p.evaluate(()=>items[0].x)>before)});

await check('pins and room size survive a reload',async()=>{const {p}=await page();
  await p.evaluate(()=>{pins.push({x:10,y:10,face:'front'});document.querySelector('#roomW').value=4200;queueSave()});await p.waitForTimeout(700);
  await p.reload();await p.waitForTimeout(500);
  assert.equal(await p.evaluate(()=>pins.length),1);assert.equal(await p.inputValue('#roomW'),'4200')});

await check('opened from WorkBrain: job-scoped storage and badge',async()=>{const {p}=await page('?wbJobId=job-123&wbJobRef=WB-2026-0042&wbCustomer=Mel&wbSuburb=Bowral');
  assert.equal(await p.inputValue('#job'),'Mel — Bowral');
  assert.match(await p.textContent('.topbar'),/WorkBrain: WB-2026-0042/);
  await touch(p,[['pointerdown',1,80,300],['pointermove',1,200,400],['pointerup',1,200,400]]);await p.waitForTimeout(700);
  const saved=JSON.parse(await p.evaluate(()=>localStorage.getItem('cad-drawer-autosave:job-123')));
  assert.equal(saved.workBrainJobId,'job-123');assert.equal(saved.items.length,1)});

await check('text tool shows the text',async()=>{const {p}=await page();
  p.on('dialog',d=>d.accept('Return air grille'));await p.click('#mobileTools');await p.click('[data-tool="text"]');await p.click('#mobileTools');
  await touch(p,[['pointerdown',1,100,300],['pointerup',1,100,300]]);
  assert.equal(await p.evaluate(()=>items[0]?.text),'Return air grille')});

await b.close();if(fails){console.log(fails+' failed');process.exit(1)}console.log('all passed');
