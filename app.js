/* ===============================
   Tokyo Spring ERP Frontend
   Build 2025-10-10
   =============================== */

const API_BASE = "https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec"; // /exec
const PROCESSES = ["準備","シャッター溶接","レザー加工","曲げ加工","外注加工/組立","検査工程","出荷（組立済）"];
const STATUSES  = ["進行","検査中","組立中","組立済","出荷準備","出荷済"];

const $ = (q, r=document)=> r.querySelector(q);
const $$= (q, r=document)=> Array.from(r.querySelectorAll(q));
const fmt = (d)=> d? new Date(d).toLocaleString() : '—';

let CURRENT_USER = null;
let ORDERS = [];

async function apiget(action, params={}){
  const url = new URL(API_BASE);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v])=> url.searchParams.set(k, v));
  const r = await fetch(url, {cache:'no-store'});
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||'API error');
  return j.data;
}
async function apipost(action, data={}){
  const r = await fetch(API_BASE, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action, ...data })
  });
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||'API error');
  return j.data;
}

/* ---------- auth ---------- */
async function doLogin(){
  const u = $('#inUser')?.value?.trim();
  const p = $('#inPass')?.value?.trim();
  if(!u || !p) return alert('ユーザー名/パスワードを入力してください');
  const me = await apipost('login', {username:u, password:p});
  CURRENT_USER = me;
  setupRoleNav(me);
  show('pageDash'); refreshAll();
}
$('#btnLogin')?.addEventListener('click', doLogin);

/* default admin test (optional)
document.addEventListener('DOMContentLoaded', ()=> {
  if($('#authView') && !CURRENT_USER){ $('#inUser').value='admin'; $('#inPass').value='admin123'; }
});
*/

/* ---------- role nav ---------- */
function setupRoleNav(me){
  const role = (me?.role||'member').toLowerCase();
  const showIds = [];
  if(role==='admin'){ showIds.push('btnToDash','btnToSales','btnToPlan','btnToShip','btnToInvPage','btnToFinPage','btnToInvoice','btnToCharts'); $('#ddSetting')?.classList.remove('hidden'); }
  if(role==='member' || role==='製造'){ showIds.push('btnToDash'); }
  if(me?.department==='営業' || role==='manager'){ showIds.push('btnToSales','btnToInvoice'); }
  if(me?.department==='生産管理部' || role==='admin'){ showIds.push('btnToPlan','btnToShip','btnToInvPage','btnToFinPage'); }
  // show navs
  showIds.forEach(id=> $('#'+id)?.classList.remove('hidden'));
  // admin-only: ユーザー追加
  if(role==='admin'){ $('#miAddUser')?.classList.remove('hidden'); }
  $('#userInfo').textContent = `${me?.full_name||me?.username||''} / ${me?.department||''}`;
}

/* ---------- simple routing ---------- */
function show(id){
  ['authView','pageDash','pageSales','pagePlan','pageShip','pageInventory','pageFinished','pageInvoice','pageCharts']
    .forEach(x=> $('#'+x)?.classList.add('hidden'));
  $('#'+id)?.classList.remove('hidden');
}
$('#btnToDash')?.addEventListener('click', ()=> show('pageDash'));
$('#btnToSales')?.addEventListener('click', ()=> show('pageSales'));
$('#btnToPlan')?.addEventListener('click', ()=> show('pagePlan'));
$('#btnToShip')?.addEventListener('click', ()=> show('pageShip'));
$('#btnToInvPage')?.addEventListener('click', ()=> show('pageInventory'));
$('#btnToFinPage')?.addEventListener('click', ()=> show('pageFinished'));
$('#btnToInvoice')?.addEventListener('click', ()=> show('pageInvoice'));
$('#btnToCharts')?.addEventListener('click', ()=> show('pageCharts'));

$('#btnLogout')?.addEventListener('click', ()=>{
  CURRENT_USER=null; ORDERS=[];
  show('authView');
});

/* ---------- Dashboard ---------- */
async function refreshAll(){
  const [orders, snapshot, stock, today] = await Promise.all([
    apiget('listOrders'),
    apiget('locSnapshotAll'),
    apiget('stock'),
    apiget('todayShip'),
  ]);
  ORDERS = orders || [];
  renderOrders(ORDERS);
  renderSnapshot(snapshot);
  $('#statFinished').textContent = stock.finishedStock;
  $('#statReady').textContent    = stock.ready;
  $('#statShipped').textContent  = stock.shipped;
  $('#listToday').innerHTML = (today||[]).map(x=>`<div>${x.po_id} / ${x.qty}</div>`).join('') || '<span class="muted s">なし</span>';
}
$('#btnRefresh')?.addEventListener('click', refreshAll);

/* ---- Orders table ---- */
function renderOrders(rows){
  const q = ($('#searchQ')?.value||'').trim().toLowerCase();
  const filtered = rows.filter(r=> JSON.stringify(r).toLowerCase().includes(q));
  const html = filtered.map(r => {
    const badgeStatus = badge(r.status);
    const badgeProc   = chip(r.current_process);
    const act = `
      <button class="btn xs ghost" onclick="openManual('${r.po_id}')"><i class="fa-solid fa-pen"></i> 手動更新</button>
      <button class="btn xs ghost" onclick="openScan('${r.po_id}')"><i class="fa-solid fa-qrcode"></i> スキャン</button>`;
    return `
      <tr class="row">
        <td data-label="注番/得意先"><div class="mono">${r.po_id}</div><div class="muted s">${r.得意先||'—'}</div></td>
        <td data-label="品名">${r.品名||'—'}</td>
        <td data-label="品番">${r.品番||'—'}</td>
        <td data-label="図番">${r.図番||'—'}</td>
        <td data-label="状態">${badgeStatus}</td>
        <td data-label="工程">${badgeProc}</td>
        <td data-label="更新日時">${fmt(r.updated_at)}</td>
        <td data-label="更新者">${r.updated_by||'—'}</td>
        <td data-label="操作" class="nowrap">${act}</td>
      </tr>`;
  }).join('');
  $('#tbOrders').innerHTML = html || `<tr><td colspan="9" class="muted">データなし</td></tr>`;
}
$('#searchQ')?.addEventListener('input', ()=> renderOrders(ORDERS));

/* ---- badges ---- */
function badge(s){
  const map = {
    '進行':'teal','検査中':'indigo','組立中':'orange',
    '組立済':'slate','出荷準備':'violet','出荷済':'green'
  };
  const cls = map[s] || 'slate';
  return `<span class="badge ${cls}">${s||'—'}</span>`;
}
function chip(p){
  const map = {
    '準備':'slate','シャッター溶接':'blue','レザー加工':'emerald',
    '曲げ加工':'purple','外注加工/組立':'amber','検査工程':'indigo','出荷（組立済）':'teal'
  };
  return `<span class="chip ${map[p]||'slate'}">${p||'—'}</span>`;
}

/* ---------- Manual Update Dialog ---------- */
window.openManual = (po)=> {
  $('#dlgManual')?.remove?.();
  const wrap = document.createElement('dialog');
  wrap.id='dlgManual';
  wrap.className='paper';
  wrap.innerHTML = `
    <div class="body">
      <h3>工程 手動更新（PO: <span class="mono">${po}</span>）</h3>
      <div class="grid">
        <label>工程<select id="muProc">${PROCESSES.map(p=>`<option>${p}</option>`).join('')}</select></label>
        <label>状態<select id="muStatus">${STATUSES.map(s=>`<option>${s}</option>`).join('')}</select></label>
        <label>OK 数<input id="muOk" type="number" min="0" value="0"></label>
        <label>NG 数<input id="muNg" type="number" min="0" value="0"></label>
        <label>メモ<input id="muNote" placeholder="備考"></label>
      </div>
    </div>
    <footer class="row-end">
      <button class="btn" onclick="document.getElementById('dlgManual').close()">閉じる</button>
      <button class="btn primary" id="muSave">保存</button>
    </footer>`;
  document.body.appendChild(wrap);
  $('#muSave').addEventListener('click', async ()=>{
    const updates = {
      current_process: $('#muProc').value,
      status: $('#muStatus').value,
      ok_qty: Number($('#muOk').value||0),
      ng_qty: Number($('#muNg').value||0),
      note: $('#muNote').value||'',
    };
    await apipost('setProcess', { po_id: po, updates, user: CURRENT_USER });
    wrap.close(); refreshAll();
  });
  wrap.showModal();
};

/* ---------- QR Station (Generate) ---------- */
$('#miStationQR')?.addEventListener('click', ()=>{
  const d = $('#dlgStationQR');
  const el = $('#qrWrap', d);
  el.innerHTML = '';
  PROCESSES.forEach(p=>{
    const box = document.createElement('div');
    box.className='qrbox';
    box.innerHTML = `<div class="muted s">${p}</div><div class="qr" id="qr-${p}"></div>`;
    el.appendChild(box);
    const q = new QRCode(box.querySelector('.qr'), { text:`ST:${p}`, width:120, height:120 });
  });
  d.showModal();
});

/* ---------- QR Scan per row ---------- */
let SCAN_STREAM=null, SCAN_TIMER=null;
window.openScan = (po)=>{
  const d = $('#dlgScan');
  $('#scanPO').textContent = po;
  $('#scanResult').textContent = '';
  d.showModal();
};
$('#btnScanStart')?.addEventListener('click', async ()=>{
  const video = $('#scanVideo'), canvas=$('#scanCanvas'), res=$('#scanResult');
  const ctx = canvas.getContext('2d');
  SCAN_STREAM = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  video.srcObject = SCAN_STREAM; await video.play();

  SCAN_TIMER = setInterval(async ()=>{
    canvas.width = video.videoWidth; canvas.height=video.videoHeight;
    ctx.drawImage(video, 0,0, canvas.width, canvas.height);
    const img = ctx.getImageData(0,0, canvas.width, canvas.height);
    const q = jsQR(img.data, img.width, img.height);
    if(q && q.data){
      res.textContent = q.data;
      if(q.data.startsWith('ST:')){
        const proc = q.data.slice(3);
        const po = $('#scanPO').textContent;
        await apipost('setProcess', { po_id: po, updates:{ current_process: proc, status:'進行' }, user: CURRENT_USER });
        clearInterval(SCAN_TIMER); stopScan();
        $('#dlgScan').close(); refreshAll();
      }
    }
  }, 400);
});
function stopScan(){ try{ SCAN_STREAM?.getTracks()?.forEach(t=>t.stop()); }catch{} }
$('#btnScanClose')?.addEventListener('click', ()=>{ clearInterval(SCAN_TIMER); stopScan(); });

/* ---------- Sales / Plan / Ship basic forms ---------- */
// SALES
$('#btnSalesSave')?.addEventListener('click', async ()=>{
  const row = {
    SO: $('#so_id').value||undefined,
    受注日: $('#so_date').value, 得意先: $('#so_cust').value,
    品名: $('#so_item').value, 品番: $('#so_part').value, 図番: $('#so_drw').value,
    製番号: $('#so_sei').value, 数量: Number($('#so_qty').value||0),
    希望納期: $('#so_req').value, 備考: $('#so_note').value
  };
  await apipost('salesUpsert', { row, user: CURRENT_USER });
  alert('保存しました');
});
$('#btnSalesExport')?.addEventListener('click', ()=> exportTableCSV('#tbSales','sales.csv'));
$('#btnSalesImport')?.addEventListener('click', ()=> $('#fileSales').click());
$('#fileSales')?.addEventListener('change', handleXlsxImportSales);

// PLAN
$('#btnCreateOrder')?.addEventListener('click', async ()=>{
  const row = {
    po_id: $('#c_po').value||undefined,
    得意先: $('#c_tokui').value, 得意先品番: $('#c_tokui_hin').value, 製番号: $('#c_sei').value,
    品名: $('#c_hinmei').value, 品番: $('#c_hinban').value, 図番: $('#c_zuban').value,
    管理No: $('#c_kanri').value, 通知書番号: $('#c_tsuchi').value,
    current_process:'準備', status:'進行'
  };
  const r = await apipost('planUpsert', { row, user: CURRENT_USER });
  $('#c_po').value = r.po_id;
  alert('現品票を保存しました'); refreshAll();
});
$('#btnPlanExport')?.addEventListener('click', ()=> exportTableCSV('#tbOrders','orders.csv'));
$('#btnPlanImport')?.addEventListener('click', ()=> $('#filePlan').click());
$('#filePlan')?.addEventListener('change', handleXlsxImportPlan);

// SHIP
$('#btnSchedule')?.addEventListener('click', async ()=>{
  const po_id = $('#s_po').value, dateIso=$('#s_date').value, qty=Number($('#s_qty').value||0);
  await apipost('scheduleShipment', { po_id, dateIso, qty, user: CURRENT_USER });
  alert('出荷予定を作成しました'); refreshAll();
});
$('#btnShipExport')?.addEventListener('click', ()=> exportTableCSV('#tbOrders','today-ship.csv'));
$('#btnShipImport')?.addEventListener('click', ()=> $('#fileShip').click());
$('#fileShip')?.addEventListener('change', handleXlsxImportShip);

/* ---------- import/export helpers ---------- */
function exportTableCSV(sel, filename){
  const rows = $$(sel+' tr').map(tr=> Array.from(tr.querySelectorAll('th,td')).map(td=> (td.innerText||'').trim()));
  const csv = rows.map(r=> r.map(x=> `"${x.replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
}
async function handleXlsxImportSales(e){
  const file = e.target.files[0]; if(!file) return;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf); const ws = wb.Sheets[wb.SheetNames[0]];
  const arr = XLSX.utils.sheet_to_json(ws);
  await apipost('salesBulk', { rows: arr, user: CURRENT_USER });
  alert('Sales imported'); e.target.value=''; 
}
async function handleXlsxImportPlan(e){
  const file = e.target.files[0]; if(!file) return;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf); const ws = wb.Sheets[wb.SheetNames[0]];
  const arr = XLSX.utils.sheet_to_json(ws).map(r=> ({...r, current_process: r.current_process||'準備', status: r.status||'進行'}));
  await apipost('planBulk', { rows: arr, user: CURRENT_USER });
  alert('Plan imported'); e.target.value=''; refreshAll();
}
async function handleXlsxImportShip(e){
  const file = e.target.files[0]; if(!file) return;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf); const ws = wb.Sheets[wb.SheetNames[0]];
  const arr = XLSX.utils.sheet_to_json(ws);
  for(const r of arr){
    await apipost('scheduleShipment', { po_id:r.po_id, dateIso:r.scheduled_date, qty:r.qty, user: CURRENT_USER });
  }
  alert('Shipments imported'); e.target.value=''; refreshAll();
}

/* ---------- Charts (re-using your canvas) ---------- */
$('#btnChartsRefresh')?.addEventListener('click', ()=>{ /* sumber dari tabel; sudah ada di index.js mu */});

/* ---------- Weather (fixed) ---------- */
(async function weatherInit(){
  const elCity=$('#wxCity'), elTemp=$('#wxTemp'), elIcon=$('#wxIcon');
  const fallback = { lat:35.6809591, lon:139.7673068, city:'東京' };
  function svg(parts){ return `<svg viewBox="0 0 24 24" class="wx-ico" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${parts}</g></svg>`; }
  const ICONS = { sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    cloud:svg('<path d="M6 16a4 4 0 0 1 1-7.9A5.5 5.5 0 0 1 18 10a4 4 0 0 1 0 8H8a4 4 0 0 1-2-7.5"/>'),
    sunCloud:svg('<circle cx="6" cy="6" r="2.5"/><path d="M6 1.5v1.5M6 12V10.5M1.5 6H3M9 6h1.5M3.8 3.8l1 1M7.2 7.2l1 1"/><path d="M9 16a4 4 0 0 1 1-7.9A5.5 5.5 0 0 1 21 10a4 4 0 0 1 0 6h-8a4 4 0 0 1-2-3"/>'),
    drizzle:svg('<path d="M6 16a4 4 0 0 1 1-7.9A5.5 5.5 0 0 1 18 10a4 4 0 0 1 0 6H8a4 4 0 0 1-2-3"/><path d="M9 21l.6-1.6M12.5 21l.6-1.6M15.8 21l.6-1.6"/>'),
    rain:svg('<path d="M6 16a4 4 0 0 1 1-7.9A5.5 5.5 0 0 1 18 10a4 4 0 0 1 0 6H8a4 4 0 0 1-2-3"/><path d="M9 22l1-3M13 22l1-3M17 22l1-3"/>'),
    snow:svg('<path d="M6 16a4 4 0 0 1 1-7.9A5.5 5.5 0 0 1 18 10a4 4 0 0 1 0 6H8a4 4 0 0 1-2-3"/><path d="M12 21v-3M12 18l-1.5-1M12 18l1.5-1M12 21l-1.5 1M12 21l1.5 1"/>'),
    thunder:svg('<path d="M6 16a4 4 0 0 1 1-7.9A5.5 5.5 0 0 1 18 10a4 4 0 0 1 0 6H8a4 4 0 0 1-2-3"/><path d="M12 12l-2 4h3l-1 4l4-6h-3l1-2z"/>') };
  const codeToIcon = (c)=>{ c=Number(c); if(c===0) return ICONS.sun; if([1,2].includes(c)) return ICONS.sunCloud; if(c===3) return ICONS.cloud; if([51,53,55,56,57,45,48].includes(c)) return ICONS.drizzle; if([61,63,65,66,67,80,81,82].includes(c)) return ICONS.rain; if([71,73,75,77,85,86].includes(c)) return ICONS.snow; if([95,96,99].includes(c)) return ICONS.thunder; return ICONS.cloud; };
  function render(city, cw){ $('#wxCity').textContent = city||'—'; $('#wxTemp').textContent = (cw?.temperature!=null? Math.round(cw.temperature):'--')+'℃'; $('#wxIcon').innerHTML = codeToIcon(cw?.weathercode??3); }
  try{
    const g = await new Promise(res=>{
      if(!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude}), _=>res(null), {timeout:6000});
    });
    const lat = g?.lat ?? fallback.lat, lon = g?.lon ?? fallback.lon;
    const [cResp, wResp] = await Promise.all([
      fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ja`).then(r=>r.json()).catch(()=>({})),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`).then(r=>r.json()).catch(()=>({})),
    ]);
    render(cResp.city||cResp.locality||cResp.principalSubdivision||'東京', wResp.current_weather);
  }catch{ render('東京', null); }
})();
