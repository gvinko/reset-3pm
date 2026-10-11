/* CAD Drawer — HVAC takeoff add-on.
 * Adds: flexible-duct runs with diameter and metre totals, HVAC symbols (grilles, units,
 * zone gear) with counts, true lengths on measure lines, calibrate scale from a known
 * dimension, an HVAC takeoff panel, takeoff rows in the CSV, and a print/PDF job sheet.
 * Runs after the main script and extends its globals; existing drawings are unaffected.
 */
(function(){
'use strict';
const FLEX_SIZES=[150,200,250,300,350,400,450,500];
const SYMBOLS={
  supply:{label:'Supply grille',short:'SG',color:'#5cb8ff'},
  return:{label:'Return air grille',short:'RA',color:'#ff9f5c'},
  idu:{label:'Indoor unit',short:'IDU',color:'#57d884'},
  odu:{label:'Outdoor unit',short:'ODU',color:'#57d884'},
  zone:{label:'Zone motor',short:'ZM',color:'#ffcd6b'},
  stat:{label:'Thermostat / controller',short:'T',color:'#c792ea'},
  spigot:{label:'Spigot / take-off',short:'SP',color:'#9ba8ba'}
};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const lineMm=i=>Math.hypot(i.w||0,i.h||0)/grid*mm();
let toolKind='';

// ---- UI: tools, takeoff panel, calibration, print ----
const tools=$('#tools');
tools.insertAdjacentHTML('beforeend','<button data-tool="line" data-kind="flex">Flex duct run</button><button data-tool="rect" data-kind="symbol">HVAC symbol</button>');
const options=document.createElement('div');options.className='fields';options.style.marginTop='8px';options.id='hvacOptions';
options.innerHTML='<div><label>Flex diameter</label><select id="flexSize">'+FLEX_SIZES.map(s=>`<option value="${s}" ${s===350?'selected':''}>Ø${s} flex</option>`).join('')+'</select></div><div><label>Symbol</label><select id="symbolType">'+Object.entries(SYMBOLS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')+'</select></div>';
$('#polyActions').after(options);
tools.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;toolKind=b.dataset.kind||''},true);

const scaleBox=$('#scale').parentElement;
scaleBox.insertAdjacentHTML('beforeend','<button type="button" id="calibrate" style="margin-top:6px">Calibrate from a line</button>');

const listSection=$('#list').closest('.section');
const take=document.createElement('div');take.className='section';
take.innerHTML='<div class="title">HVAC takeoff</div><table><thead><tr><th>Item</th><th>Qty</th><th>+10%</th></tr></thead><tbody id="takeoff"><tr><td colspan="3" style="color:#9ba8ba">Draw flex runs or place symbols</td></tr></tbody></table><div class="note">Flex metres come from the drawing at the current scale. Calibrate the scale from a known dimension before relying on photo measurements.</div>';
listSection.after(take);
$('#csv').parentElement.insertAdjacentHTML('beforeend','<button id="printSheet" class="primary">Print / PDF job sheet</button>');

// ---- creation: tag new items with flex / symbol data ----
const baseDown=c.onmousedown;
c.onmousedown=e=>{
  if(toolKind==='symbol'&&tool==='rect'&&!(e.button===1||e.altKey)){
    const p=world(e),s=$('#symbolType').value,def=SYMBOLS[s]||SYMBOLS.supply,size=grid*2;
    saveHistory();
    const it={id:makeId(),type:'rect',kind:'symbol',symbol:s,name:def.label,x:snap(p.x)-size/2,y:snap(p.y)-size/2,w:size,h:size,width:pxToMm(size),length:pxToMm(size),qty:1,stroke:def.color,fill:def.color,fillOpacity:15,lineWidth:2};
    items.push(it);selected=it;selectedFields(it);tally();return;
  }
  baseDown(e);
  if(toolKind==='flex'&&drawing&&drawing.type==='line'){const d=+$('#flexSize').value;Object.assign(drawing,{kind:'flex',diameter:d,name:'Ø'+d+' flex',stroke:'#c0c8d4',lineWidth:6})}
};

// ---- rendering ----
const basePiece=piece;
piece=function(i,sel,dash){
  if(i.kind==='symbol'){
    const b=bounds(i),def=SYMBOLS[i.symbol]||SYMBOLS.supply;
    x.save();x.setLineDash([]);x.lineWidth=(sel?3:2)/cam.z;x.strokeStyle=sel?'#5cb8ff':def.color;x.fillStyle=def.color+'26';
    if(i.symbol==='stat'){x.beginPath();x.arc(b.x+b.w/2,b.y+b.h/2,Math.min(b.w,b.h)/2,0,Math.PI*2);x.fill();x.stroke()}
    else{x.beginPath();x.rect(b.x,b.y,b.w,b.h);x.fill();x.stroke();
      if(i.symbol==='supply'){x.beginPath();x.moveTo(b.x,b.y);x.lineTo(b.x+b.w,b.y+b.h);x.moveTo(b.x+b.w,b.y);x.lineTo(b.x,b.y+b.h);x.stroke()}
      if(i.symbol==='return'){x.beginPath();for(let k=1;k<4;k++){x.moveTo(b.x,b.y+b.h*k/4);x.lineTo(b.x+b.w,b.y+b.h*k/4)}x.stroke()}}
    x.fillStyle='#f2f7ff';x.font=`bold ${Math.max(10,12/cam.z)}px system-ui`;x.textAlign='center';x.textBaseline='middle';
    if(i.symbol!=='supply'&&i.symbol!=='return')x.fillText(def.short,b.x+b.w/2,b.y+b.h/2);
    x.textAlign='left';x.textBaseline='alphabetic';x.font=`${Math.max(10,11/cam.z)}px system-ui`;
    x.fillText((i.qty>1?i.qty+'× ':'')+(i.name||def.label),b.x,b.y-5/cam.z);x.restore();return;
  }
  if(i.kind==='flex'){
    const x1=i.x,y1=i.y,x2=i.x+i.w,y2=i.y+i.h;
    x.save();x.lineCap='round';x.strokeStyle=sel?'#5cb8ff':(i.stroke||'#c0c8d4');x.lineWidth=Math.max(4,(i.diameter||350)/50)/cam.z;x.setLineDash(dash?[6/cam.z,4/cam.z]:[]);
    x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.stroke();
    x.strokeStyle='#171a1f';x.lineWidth=1/cam.z;x.setLineDash([4/cam.z,4/cam.z]);x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.stroke();
    x.setLineDash([]);x.fillStyle='#eaf2f8';x.font=`${Math.max(10,12/cam.z)}px system-ui`;
    x.fillText(`Ø${i.diameter||350} flex · ${(lineMm(i)/1000).toFixed(2)} m`,(x1+x2)/2+6/cam.z,(y1+y2)/2-6/cam.z);x.restore();return;
  }
  basePiece(i,sel,dash);
  if(i.type==='line'&&!dash){x.save();x.fillStyle='#ffcd6b';x.font=`${Math.max(10,12/cam.z)}px system-ui`;x.fillText(Math.round(lineMm(i))+' mm',i.x+i.w/2+6/cam.z,i.y+i.h/2-6/cam.z);x.restore()}
};

// ---- takeoff ----
function takeoff(){
  const sym={},flex={};
  for(const i of items){
    if(i.kind==='symbol'){const k=(SYMBOLS[i.symbol]||{}).label||i.name||'Symbol';sym[k]=(sym[k]||0)+(+i.qty||1)}
    if(i.kind==='flex'){const k='Ø'+(i.diameter||350)+' flex duct (m)';flex[k]=(flex[k]||0)+lineMm(i)/1000*(+i.qty||1)}
  }
  return [...Object.entries(flex).sort().map(([k,v])=>({item:k,qty:+v.toFixed(2),plus:+(v*1.1).toFixed(2)})),...Object.entries(sym).map(([k,v])=>({item:k,qty:v,plus:v}))];
}
function renderTakeoff(){
  const rows=takeoff();
  $('#takeoff').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.item)}</td><td>${r.qty}</td><td>${r.plus}</td></tr>`).join(''):'<tr><td colspan="3" style="color:#9ba8ba">Draw flex runs or place symbols</td></tr>';
}
// Cut list covers sheet-metal pieces only; flex runs and symbols go to the takeoff.
const baseTally=tally;
tally=function(){const all=items;items=all.filter(i=>!i.kind);try{baseTally()}finally{items=all}renderTakeoff();draw()};

// ---- calibration ----
function ensureScaleOption(v){
  v=+v;if(!v||[...$('#scale').options].some(o=>+o.value===v))return;
  const o=document.createElement('option');o.value=String(v);o.textContent=`${v} mm per grid (calibrated)`;$('#scale').appendChild(o);
}
$('#calibrate').onclick=()=>{
  if(!selected||selected.type!=='line'){alert('Draw a Measure line over something of known size (e.g. a door width), select it, then tap Calibrate.');return}
  const real=parseFloat(prompt('Actual length of the selected line in mm?',''));
  if(!(real>0))return;
  const px=Math.hypot(selected.w,selected.h);if(!px)return;
  const v=Math.round(real/(px/grid)*100)/100;
  saveHistory();ensureScaleOption(v);$('#scale').value=String(v);
  for(const i of items)if(i.type==='line'){i.width=pxToMm(i.w);i.length=pxToMm(i.h)}
  tally();queueSave();
};
// Keep calibrated scales when reopening a drawing.
try{const d=JSON.parse(localStorage.getItem(wbAutoKey)||localStorage.getItem(wbSaveKey)||'null');if(d&&d.scale){ensureScaleOption(d.scale);$('#scale').value=String(d.scale)}}catch{}
const baseOpen=$('#file').onchange;
$('#file').onchange=e=>{const f=e.target.files&&e.target.files[0];if(!f)return;f.text().then(t=>{try{ensureScaleOption(JSON.parse(t).scale)}catch{}baseOpen(e)})};

// ---- CSV with takeoff ----
$('#csv').onclick=()=>{
  const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  let s='Section,Piece,Type,Quantity,Width mm,Length mm,Allowance mm,Material,Notes\n'+items.filter(i=>!i.kind).map(i=>['Cut list',i.name||i.type,i.type,i.qty,i.width,i.length,i.allowance,i.material,i.notes].map(q).join(',')).join('\n');
  const t=takeoff();if(t.length)s+='\n'+t.map(r=>['HVAC takeoff',r.item,'',r.qty,'','','','','+10%: '+r.plus].map(q).join(',')).join('\n');
  download(`cad-${($('#job').value||'job').replace(/[^a-z0-9]+/gi,'-')}-list.csv`,'text/csv',s);
};

// ---- print / PDF job sheet ----
$('#printSheet').onclick=()=>{
  const W=c.clientWidth,H=c.clientHeight,D=2,out=document.createElement('canvas');out.width=W*D;out.height=H*D;
  const q=out.getContext('2d');q.scale(D,D);q.fillStyle='#fff';q.fillRect(0,0,W,H);
  if(photo.img&&photo.box){q.save();q.translate(cam.x,cam.y);q.scale(cam.z,cam.z);q.globalAlpha=(+$('#photoOpacity').value||62)/100;q.drawImage(photo.img,photo.box.x,photo.box.y,photo.box.w,photo.box.h);q.restore()}
  const old=x;x=q;q.save();q.translate(cam.x,cam.y);q.scale(cam.z,cam.z);items.forEach(i=>piece(i,false,false));q.restore();x=old;
  const img=out.toDataURL('image/png');
  const cut=items.filter(i=>!i.kind),t=takeoff();
  const w=window.open('','_blank');if(!w){alert('Allow pop-ups to print the job sheet.');return}
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc($('#job').value||'CAD job sheet')}</title><style>body{font:13px system-ui,Arial;margin:24px;color:#111}h1{font-size:20px;margin:0}small{color:#555}img{width:100%;border:1px solid #ccc;margin:12px 0}table{border-collapse:collapse;width:100%;margin:8px 0 16px}th,td{border:1px solid #ccc;padding:5px;text-align:left}th{background:#f2f2f2}@media print{button{display:none}}</style>
<h1>${esc($('#job').value||'Job')}</h1><small>${WB.jobRef?'WorkBrain '+esc(WB.jobRef)+' · ':''}${new Date().toLocaleDateString('en-AU')} · scale ${mm()} mm per grid</small>
<img src="${img}" alt="Drawing">
${t.length?`<h2>HVAC takeoff</h2><table><tr><th>Item</th><th>Qty</th><th>+10%</th></tr>${t.map(r=>`<tr><td>${esc(r.item)}</td><td>${r.qty}</td><td>${r.plus}</td></tr>`).join('')}</table>`:''}
${cut.length?`<h2>Cut list</h2><table><tr><th>Piece</th><th>Qty</th><th>W × L (mm)</th><th>Material</th><th>Notes</th></tr>${cut.map(i=>`<tr><td>${esc(i.name||i.type)}</td><td>${+i.qty||1}</td><td>${+i.width||0} × ${+i.length||0}</td><td>${esc(i.material||'')}</td><td>${esc(i.notes||'')}</td></tr>`).join('')}</table>`:''}
<p><small>Lengths are taken from the drawing at the stated scale. Confirm on site before ordering.</small></p><button onclick="print()">Print / Save as PDF</button>`);
  w.document.close();
};

window.CADTakeoff={takeoff,SYMBOLS,FLEX_SIZES};
tally();
})();
