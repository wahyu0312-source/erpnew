/* ==========================
 * Frontend App – FULL
 * ========================== */

/* ====== Konfigurasi ====== */
// Ganti dengan Web App Apps Script kamu
const API_BASE = "https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec";
const API_KEY  = ""; // kalau pakai token, isi di sini

/* ====== Util ====== */
const $ = (q)=> document.querySelector(q);
function show(id){
  const ids=['authView','pageDash','pagePlan','pageShip','pageCharts'];
  ids.forEach(v=>{ const el=$( '#'+v ); if(el) el.classList.add('hidden'); });
  const v=$('#'+id); if(v) v.classList.remove('hidden');
  // nav vis
  const navButtons = ['#btnToDash','#btnToPlan','#btnToShip','#btnToCharts','#btnLogout'];
  navButtons.forEach(sel => { const b=$(sel); if(!b) return; if(id==='authView') b.classList.add('hidden'); else b.classList.remove('hidden'); });
}
function qs(obj){ return Object.entries(obj).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'); }
async function apiGet(params){
  const url = `${API_BASE}?${qs(params)}`; const r = await fetch(url, {method:'GET'}); const j=await r.json(); if(!j.ok) throw new Error(j.error||'HTTP'); return j.data;
}
async function apiPost(action, body={}){
  const r=await fetch(API_BASE, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action, apiKey:API_KEY, ...body})});
  const j=await r.json(); if(!j.ok) throw new Error(j.error||'HTTP'); return j.data;
}

/* ====== State ====== */
let SESSION=null, CURRENT_PO=null, scanStream=null, scanTimer=null;

/* ====== Auth ====== */
async function onLogin(){
  const username = $('#inUser').value.trim();
  const password = $('#inPass').value;
  const remember = $('#inRemember').checked;
  try{
    const u = await apiPost('login',{username,password});
    SESSION = u;
    if(remember) localStorage.setItem('session', JSON.stringify(u));
    $('#userInfo').textContent = `${u.full_name||u.username} / ${u.department||u.role||''}`;
    show('pageDash'); refreshAll(true);
  }catch(e){ alert(e.message||e); }
}
function onLogout(){
  localStorage.removeItem('session');
  SESSION=null; $('#userInfo').textContent='';
  show('authView');
}

/* ====== Scan QR (selalu minta OK/NG) ====== */
function startScanFor(po){
  CURRENT_PO=po;
  $('#scanPO').textContent = po;
  $('#dlgScan').showModal();
}
async function initScan(){
  const video=$('#scanVideo'), canvas=$('#scanCanvas'), result=$('#scanResult');
  try{
    scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject=scanStream; await video.play();
    const ctx=canvas.getContext('2d');
    scanTimer = setInterval(async ()=>{
      if(video.readyState!==video.HAVE_ENOUGH_DATA) return;
      canvas.width=video.videoWidth; canvas.height=video.videoHeight;
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      const code=jsQR(img.data, img.width, img.height);
      if(code && code.data){
        result.textContent='読み取り: '+code.data;
        await onScanToken(code.data);
        stopScan(); $('#dlgScan').close();
      }
    }, 280);
  }catch(e){ alert('カメラ起動不可: '+(e.message||e)); }
}
function stopScan(){
  if(scanTimer){ clearInterval(scanTimer); scanTimer=null; }
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream=null; }
}
async function onScanToken(token){
  const [prefix, station] = String(token).split(':');
  if(prefix!=='ST' || !station){ alert('QR無効'); return; }
  if(!CURRENT_PO){ alert('PO未選択'); return; }
  try{
    const o = await apiGet({action:'ticket',po_id:CURRENT_PO});
    const rule = STATION_RULES[station] || ((_o)=>({current_process:station}));
    const updates = rule(o) || {};
    const okQty = Number($('#inOkQty').value || 0);
    const ngQty = Number($('#inNgQty').value || 0);
    const note  = String($('#inNote').value || '');
    await apiPost('setProcess',{ po_id:CURRENT_PO, updates:{...updates, ok_qty:okQty, ng_qty:ngQty, note}, user:SESSION });
    alert('更新しました');
    refreshAll(true);
  }catch(e){ alert(e.message||e); }
}

/* ====== Manual set process (fallback) ====== */
async function manualSetProcess(po_id){
  const process = prompt('工程を入力（例: レーザ加工/検査工程/…）:'); if(process===null) return;
  const okQty = Number(prompt('OK品 数量 (空=0):')||0);
  const ngQty = Number(prompt('不良品 数量 (空=0):')||0);
  const note  = prompt('備考/メモ（任意）:')||'';
  try{
    await apiPost('setProcess',{ po_id, updates:{ current_process:process, ok_qty:okQty, ng_qty:ngQty, note }, user:SESSION });
    alert('更新しました'); refreshAll(true);
  }catch(e){ alert(e.message||e); }
}

/* ====== Proses & Station rules (normalisasi QR) ====== */
const PROCESSES=['レーザ加工','曲げ加工','外枠組立','シャッター組立','シャッター溶接','コーキング','外枠塗装','組立（組立中）','組立（組立済）','外注','検査工程'];
const STATION_RULES={
  'レーザ加工':(o)=>({current_process:'レーザ加工'}),
  '曲げ工程':(o)=>({current_process:'曲げ加工'}),
  '外枠組立':(o)=>({current_process:'外枠組立'}),
  'シャッター組立':(o)=>({current_process:'シャッター組立'}),
  'シャッター溶接':(o)=>({current_process:'シャッター溶接'}),
  'コーキング':(o)=>({current_process:'コーキング'}),
  '外枠塗装':(o)=>({current_process:'外枠塗装'}),
  '組立工程':(o)=> (o.current_process==='組立（組立中）' ? {current_process:'組立（組立済）'} : {current_process:'組立（組立中）'}),
  '検査工程':(o)=> (o.status==='出荷準備' ? {current_process:'検査工程',status:'出荷済'} : {current_process:'検査工程'}) ,
  '出荷工程':(o)=> (o.status==='出荷準備' ? {current_process:o.current_process||'検査工程',status:'出荷済'} : {current_process:'検査工程',status:'出荷準備'})
};

/* ====== Orders (daftar ringkas) ====== */
async function loadOrders(){
  const q = $('#qOrders')?.value||'';
  const rows = await apiGet({action:'listOrders', q});
  const el = $('#tblOrders'); if(!el) return;
  const html = [
    `<table><thead><tr>
      <th>注番</th><th>得意先</th><th>図番</th><th>機種</th><th>商品名</th><th>数量</th><th>工程</th><th>状態</th><th>操作</th>
    </tr></thead><tbody>`,
    ...rows.map(r=>`<tr>
      <td>${r.po_id||''}</td><td>${r['得意先']||''}</td><td>${r['図番']||''}</td>
      <td>${r['品番']||''}</td><td>${r['品名']||''}</td><td>${r['数量']||''}</td>
      <td>${r.current_process||''}</td><td>${r.status||''}</td>
      <td>
        <button class="btn ghost s" onclick="startScanFor('${r.po_id||''}')"><i class="fa-solid fa-qrcode"></i></button>
        <button class="btn ghost s" onclick="manualSetProcess('${r.po_id||''}')"><i class="fa-solid fa-screwdriver-wrench"></i></button>
      </td>
    </tr>`),
    `</tbody></table>`
  ].join('');
  el.innerHTML = html;
}
async function createOrderUI(){
  const p={
    '得意先':$('#c_tokui').value||'',
    '図番'  :$('#c_zuban').value||'',
    '品番'  :$('#c_kishu').value||'',
    '品名'  :$('#c_hinmei').value||'',
    '数量'  :$('#c_qty').value||'',
    '備考'  :$('#c_biko').value||'',
  };
  const po=$('#c_po').value.trim();
  if(po){ await apiPost('updateOrder',{po_id:po, updates:p, user:SESSION}); alert('編集保存しました'); }
  else { const r=await apiPost('createOrder',{payload:p, user:SESSION}); alert('作成: '+r.po_id); $('#c_po').value=r.po_id; }
  loadOrders();
}

/* ====== Charts ▸ 不良品（工程別） + lainnya ringkas ====== */
async function renderCharts(){
  const d=await apiGet({action:'charts'});
  drawBar('chWipProc', {labels:Object.keys(d.wipByProcess||{}), datasets:[{label:'点数', data:Object.values(d.wipByProcess||{})}]});
  drawBar('chPlan',     {labels:['1','2','3','4','5','6','7','8','9','10','11','12'], datasets:[{label:'件数', data:d.planPerMonth||[]}]} );
  drawBar('chSales',    {labels:['1','2','3','4','5','6','7','8','9','10','11','12'], datasets:[{label:'受注', data:d.salesPerMonth||[]}]} );
  drawBar('chDefects',  {labels:Object.keys(d.defectByProcess||{}), datasets:[{label:'不良品 数量', data:Object.values(d.defectByProcess||{})}]});
  // Dashboard kecil
  drawBar('chDefectByProc', {labels:Object.keys(d.defectByProcess||{}), datasets:[{label:'不良品 数量', data:Object.values(d.defectByProcess||{})}]});
}
function drawBar(id, data){ const el=$('#'+id); if(!el) return; new Chart(el,{type:'bar', data, options:{responsive:true,maintainAspectRatio:false}}); }

/* ====== Refresh ringkas ====== */
async function refreshAll(){
  try{ await loadOrders(); await renderCharts(); }catch(e){ console.warn(e); }
}

/* ====== Wiring ====== */
function onReady(){
  // ambil sesi tersimpan
  try{ SESSION = JSON.parse(localStorage.getItem('session')||'null'); }catch(_){}
  if(SESSION && SESSION.username){ $('#userInfo').textContent = `${SESSION.full_name||SESSION.username} / ${SESSION.department||''}`; show('pageDash'); refreshAll(true); }
  else{ show('authView'); }

  $('#btnLogin')?.addEventListener('click', onLogin);
  $('#btnLogout')?.addEventListener('click', onLogout);

  $('#btnToDash')?.addEventListener('click', ()=> show('pageDash'));
  $('#btnToPlan')?.addEventListener('click', ()=> show('pagePlan'));
  $('#btnToShip')?.addEventListener('click', ()=> show('pageShip'));
  $('#btnToCharts')?.addEventListener('click', ()=> show('pageCharts'));

  $('#btnCreateOrder')?.addEventListener('click', createOrderUI);
  $('#qOrders')?.addEventListener('input', ()=> loadOrders());

  $('#btnOpenScan')?.addEventListener('click', ()=> {
    const po = prompt('QR 更新する注番（PO）を入力:');
    if(po) startScanFor(po);
  });
  $('#btnScanStart')?.addEventListener('click', initScan);
  $('#btnScanClose')?.addEventListener('click', ()=>{ stopScan(); $('#dlgScan').close(); });
}
window.addEventListener('DOMContentLoaded', onReady);

/* ====== (optional) simple weather demo — aman kalau dihapus ====== */
// (Jika kamu punya script cuaca sendiri, boleh abaikan bagian ini)
