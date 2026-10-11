/* CAD Drawer — WorkBrain cloud save.
 * Active only when CAD Drawer runs inside WorkBrain (https://<workbrain>/cad/) for a WorkBrain job
 * (?wbJobId=…) on a device that is signed in to WorkBrain. Then every change is saved to the
 * WorkBrain cloud automatically (drawing + site photo), and opening the same job on another
 * device loads the newest copy. Standalone use (reset-3pm.pages.dev) stays on-device only.
 */
(function(){
'use strict';
if(!WB.jobId)return;
const PHOTO_KEY=wbAutoKey+':photo',API='/api/cad?jobId='+encodeURIComponent(WB.jobId);
let enabled=false,version=0,pushing=false,again=false,applying=false,timer=null;
const badge=document.createElement('span');badge.className='pill';badge.id='cloudState';badge.textContent='Cloud: checking…';
$('.topbar').insertBefore(badge,$('#saveState'));
const say=t=>{badge.textContent=t};
const time=()=>new Date().toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'});

async function api(method,body){
  const r=await fetch(API,{method,credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));return {status:r.status,ok:r.ok,d};
}
function localSavedAt(){try{return Date.parse(JSON.parse(localStorage.getItem(wbAutoKey)||'null')?.savedAt||'')||0}catch{return 0}}

async function loadPhoto(box){
  const r=await fetch(API+'&photo=1',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;
  const blob=await r.blob(),url=URL.createObjectURL(blob),im=new Image();
  await new Promise((ok,bad)=>{im.onload=ok;im.onerror=bad;im.src=url});
  photo.img=im;photo.box=box;photo.corners=null;photo.edit=false;
  try{const fr=new FileReader();fr.onload=()=>{try{localStorage.setItem(PHOTO_KEY,fr.result)}catch{}};fr.readAsDataURL(blob)}catch{}
  draw();
}
async function apply(dr){
  applying=true;
  try{
    items=Array.isArray(dr.items)?dr.items:[];pins=Array.isArray(dr.pins)?dr.pins:[];
    $('#job').value=dr.job||$('#job').value;
    if(dr.scale){window.CADTakeoff?.ensureScaleOption(dr.scale);$('#scale').value=String(dr.scale)}
    if(dr.room){for(const [k,id] of [['w','roomW'],['d','roomD'],['h','roomH']])if(dr.room[k]&&$('#'+id))$('#'+id).value=dr.room[k]}
    window.CADPhoto3D?.setTrace(dr.roomTrace||null);
    window.CADFittings?.setSketch(dr.sketch3d||null);window.CADFittings?.setPlan(dr.roomPlan||null);
    selected=null;selectedFields(null);tally();
    if(dr.photoBox)await loadPhoto(dr.photoBox).catch(()=>{});
    queueSave();
  }finally{setTimeout(()=>{applying=false},700)}
}
async function push(){
  if(!enabled)return;
  if(pushing){again=true;return}
  pushing=true;say('Cloud: saving…');
  try{
    const drawing=payload();
    const r=await api('PUT',{jobId:WB.jobId,baseVersion:version,drawing});
    if(r.ok){version=r.d.version;say('Cloud ✓ '+time())}
    else if(r.status===409){
      const cloud=r.d.drawing,cloudAt=Date.parse(cloud?.savedAt||'')||0,mineAt=Date.parse(drawing.savedAt)||0;
      version=r.d.version||0;
      if(cloud&&cloudAt>mineAt){await apply(cloud);say('Cloud ✓ newer copy loaded')}
      else again=true;
    }else if(r.status===401){enabled=false;say('Cloud: sign in to WorkBrain on this device')}
    else say('Cloud: retrying soon');
  }catch{say('Cloud: offline · saved on device')}
  finally{pushing=false;if(again){again=false;schedule(800)}}
}
async function pushPhoto(){
  if(!enabled)return;
  const data=localStorage.getItem(PHOTO_KEY);if(!data)return;
  try{const blob=await (await fetch(data)).blob(),form=new FormData();form.append('file',blob,'photo.jpg');
    const r=await fetch(API+'&photo=1',{method:'POST',credentials:'same-origin',body:form});if(!r.ok)throw Error(r.status)}
  catch{say('Cloud: photo will upload when online')}
}
function schedule(ms=2500){if(!enabled||applying)return;clearTimeout(timer);timer=setTimeout(push,ms)}

// Every local autosave also schedules a cloud save.
const baseQueue=queueSave;queueSave=function(){baseQueue();schedule()};
const baseFit=fitPhoto;fitPhoto=function(){baseFit();setTimeout(()=>{void pushPhoto();schedule(300)},50)};
addEventListener('online',()=>{if(enabled){void pushPhoto();schedule(300)}});

async function start(){
  try{const r=await fetch('/api/pair',{credentials:'same-origin',cache:'no-store'});const d=await r.json();
    if(!d.connected){say('Saved on this device');return}}
  catch{say('Saved on this device');return}
  enabled=true;
  try{
    const r=await api('GET');if(!r.ok)throw Error(r.status);
    version=r.d.version||0;const cloud=r.d.drawing,cloudAt=Date.parse(cloud?.savedAt||'')||0;
    if(cloud&&(cloudAt>localSavedAt()||!items.length)){await apply(cloud);say('Cloud ✓ loaded')}
    else if(items.length||photo.img){if(photo.img&&localStorage.getItem(PHOTO_KEY))void pushPhoto();await push()}
    else say('Cloud ✓ ready');
  }catch{say('Cloud: offline · saved on device')}
}
window.CADCloud={push,start,state:()=>({enabled,version})};
void start();
})();
