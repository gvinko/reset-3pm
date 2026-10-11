// CAD Drawer cloud save, against a mocked WorkBrain /api (two devices share one cloud).
const pw=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const {chromium}=pw.default||pw;
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:8781';const b=await chromium.launch();let fails=0;
const check=async(n,f)=>{try{await f();console.log('ok -',n)}catch(e){fails++;console.log('not ok -',n,e.message)}};
const cloud={drawing:null,version:0,photo:null,puts:0};
async function device(connected=true){
  const ctx=await b.newContext({viewport:{width:1280,height:800}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/api/pair',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({connected})}));
  await p.route('**/api/cad?**',async r=>{const req=r.request(),u=new URL(req.url());
    if(u.searchParams.get('photo')==='1'){if(req.method()==='POST'){cloud.photo=req.postDataBuffer();return r.fulfill({contentType:'application/json',body:'{"ok":true}'})}
      const png=await (await import('node:fs')).promises.readFile(new URL('./room.png',import.meta.url));return cloud.photo?r.fulfill({contentType:'image/png',body:png}):r.fulfill({status:404,body:'{}'})}
    if(req.method()==='GET')return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,drawing:cloud.drawing,version:cloud.version})});
    const body=JSON.parse(req.postData());cloud.puts++;
    if(body.baseVersion!==cloud.version)return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({version:cloud.version,drawing:cloud.drawing})});
    cloud.drawing=body.drawing;cloud.version++;return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,version:cloud.version})})});
  await p.goto(base+'/index.html?wbJobId=job-77&wbJobRef=WB-2026-0077');await p.waitForTimeout(500);return {p,errs};
}
await check('device A: drawing and photo save to the cloud automatically',async()=>{const {p,errs}=await device();
  const r=await p.locator('#c').boundingBox();
  await p.mouse.move(r.x+100,r.y+100);await p.mouse.down();await p.mouse.move(r.x+300,r.y+250,{steps:4});await p.mouse.up();
  await p.setInputFiles('#photoFile',new URL('./room.png',import.meta.url).pathname);await p.waitForFunction(()=>photo.img);
  await p.waitForFunction(()=>/Cloud ✓/.test(document.querySelector('#cloudState').textContent),null,{timeout:8000});
  await p.waitForTimeout(3500);
  assert.equal(cloud.drawing.items.length,1);assert.ok(cloud.drawing.photoBox,'photo box saved');assert.ok(cloud.photo?.length>1000,'photo uploaded');assert.deepEqual(errs,[])});
await check('device B: opening the same job loads the cloud copy',async()=>{const {p,errs}=await device();
  await p.waitForFunction(()=>items.length===1&&photo.img,null,{timeout:8000});
  assert.match(await p.textContent('#cloudState'),/Cloud ✓/);assert.deepEqual(errs,[])});
await check('a stale save never overwrites a newer cloud copy',async()=>{const {p}=await device();
  await p.waitForFunction(()=>items.length===1,null,{timeout:8000});
  cloud.drawing={...cloud.drawing,items:[...cloud.drawing.items,{id:'other',type:'rect',x:0,y:0,w:40,h:40,qty:1}],savedAt:new Date(Date.now()+60000).toISOString()};cloud.version++;
  await p.evaluate(()=>CADCloud.push());await p.waitForTimeout(500);
  assert.equal(await p.evaluate(()=>items.length),2,'newer cloud copy loaded');assert.equal(cloud.drawing.items.length,2)});
await check('not signed in to WorkBrain: stays on the device, no cloud calls',async()=>{const before=cloud.puts;const {p}=await device(false);
  await p.waitForTimeout(400);assert.equal(await p.textContent('#cloudState'),'Saved on this device');assert.equal(cloud.puts,before)});
await b.close();if(fails){console.log(fails+' failed');process.exit(1)}console.log('all passed');
