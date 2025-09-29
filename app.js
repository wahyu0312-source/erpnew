/* ================= CONFIG ================= */
// Ganti dengan URL Web App /exec hasil Deploy
const API_BASE = "https://script.google.com/macros/s/AKfycbxabdBKOO28iUW8Ho-kiVFCU6lXtjwzeV1GLO4SQLzVwpxOGoMGllRd0UIrxdD0LHpqUA/exec"; // contoh: https://script.google.com/macros/s/AKfycb.../exec
const API_KEY  = ""; // opsional: kalau CONF.API_TOKEN di Code.gs diisi, taruh lagi di sini

const PROCESSES = [
  'レーザ工程','曲げ工程','外枠組立工程','シャッター組立工程','シャッター溶接工程',
  'コーキング工程','外枠塗装工程','組立工程（組立中）','組立工程（組立済）','外注','検査工程'
];
const STATUSES = ['生産開始','検査保留','検査済','出荷準備','出荷済','不良品（要リペア）'];

const $ = sel => document.querySelector(sel);
const fmtDT = s => s ? new Date(s).toLocaleString() : '';

let SESSION = null;

/* ================= API WRAPPER (tanpa preflight) ================= */
async function apiPost(action, body){
  const payload = { action, ...body };
  if (API_KEY) payload.apiKey = API_KEY;
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // penting agar tanpa preflight
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Network error: ' + res.status);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error);
  return j.data;
}
async function apiGet(params){
  const url = API_BASE + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url); // tanpa header custom
  if (!res.ok) throw new Error('Network error: ' + res.status);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error);
  return j.data;
}

/* ================= AUTH ================= */
window.addEventListener('DOMContentLoaded', ()=>{
  $('#btnLogin').onclick = onLogin;
  $('#btnNewUser').onclick = addUserUI;
  $('#btnLogout').onclick = ()=>{ SESSION=null; localStorage.removeItem('erp_session'); location.reload(); };
  $('#btnChangePass').onclick = changePasswordUI;

  $('#btnRefresh').onclick = refreshAll;
  $('#btnCreateOrder').onclick = createOrderUI;
  $('#btnSchedule').onclick = scheduleUI;
  $('#btnExportOrders').onclick = exportOrdersCSV;
  $('#btnExportShip').onclick = exportShipCSV;
  $('#btnShipByPO').onclick = ()=>{ const po=$('#s_po').value.trim(); if(!po) return alert('Isi PO'); openShipByPO(po); };
  $('#btnShipByID').onclick = ()=>{ const id=prompt('Ship ID:'); if(!id) return; openShipByID(id.trim()); };
  $('#searchQ').addEventListener('input', renderOrders);

  const saved = localStorage.getItem('erp_session');
  if (saved){ SESSION=JSON.parse(saved); enterApp(); } else { showAuth(); }
});

async function onLogin(){
  const username = $('#inUser').value.trim();
  const password = $('#inPass').value.trim();
  try{
    const user = await apiPost('login', { username, password });
    SESSION = user; localStorage.setItem('erp_session', JSON.stringify(SESSION));
    enterApp();
  }catch(e){ alert(e.message || e); }
}

async function addUserUI(){
  if (!SESSION) return alert('Login dulu');
  if (!(SESSION.role==='admin' || SESSION.department==='生産管理')) return alert('Hanya admin/生産管理');

  const payload = {
    username: $('#nuUser').value.trim(),
    password: $('#nuPass').value.trim(),
    full_name: $('#nuName').value.trim(),
    department: $('#nuDept').value,
    role: $('#nuRole').value
  };
  if (!payload.username || !payload.password || !payload.full_name) return alert('Lengkapi data user');
  try{
    await apiPost('createUser', { user: SESSION, payload });
    alert('User ditambahkan');
  }catch(e){ alert(e.message||e); }
}

async function changePasswordUI(){
  if (!SESSION) return alert('Login dulu');
  const oldPass = prompt('Password lama:'); if (oldPass===null) return;
  const newPass = prompt('Password baru:'); if (newPass===null) return;
  try{
    await apiPost('changePassword', { user:SESSION, oldPass, newPass });
    alert('Password diganti. Silakan login ulang.');
    SESSION=null; localStorage.removeItem('erp_session'); location.reload();
  }catch(e){ alert(e.message||e); }
}

function enterApp(){
  $('#userInfo').textContent = `${SESSION.full_name} • ${SESSION.department}`;
  $('#btnLogout').classList.remove('hidden');
  $('#btnChangePass').classList.remove('hidden');
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  loadMasters(); refreshAll();
}
function showAuth(){
  $('#btnLogout').classList.add('hidden');
  $('#btnChangePass').classList.add('hidden');
  $('#authView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
}

/* ================= MASTERS ================= */
async function loadMasters(){
  try{
    const opts = await apiGet({ action:'masters', types:'得意先,品名,品番,図番' });
    const fill = (id, arr)=>{ $(id).innerHTML = (arr||[]).map(v=> `<option value="${v}"></option>`).join(''); };
    fill('#dl_tokui', opts['得意先']); fill('#dl_hinmei', opts['品名']);
    fill('#dl_hinban', opts['品番']); fill('#dl_zuban', opts['図番']);
  }catch(e){ console.warn('masters', e); }
}

/* ================= ORDERS ================= */
async function createOrderUI(){
  const payload = {
    '通知書番号': $('#c_tsuchi').value.trim(),
    '得意先': $('#c_tokui').value.trim(),
    '得意先品番': $('#c_tokui_hin').value.trim(),
    '製番号': $('#c_sei').value.trim(),
    '品名': $('#c_hinmei').value.trim(),
    '品番': $('#c_hinban').value.trim(),
    '図番': $('#c_zuban').value.trim(),
    '管理No': $('#c_kanri').value.trim()
  };
  try{
    const r = await apiPost('createOrder', { payload, user:SESSION });
    alert('Order dibuat: '+r.po_id); refreshAll();
  }catch(e){ alert(e.message||e); }
}

async function listOrders(){
  const q = $('#searchQ').value.trim();
  const rows = await apiGet({ action:'listOrders', q });
  return rows;
}
async function renderOrders(){
  const rows = await listOrders();
  $('#tbOrders').innerHTML = rows.map(r=>`
    <tr>
      <td><b>${r.po_id}</b></td>
      <td>${r['得意先']||''}</td>
      <td>${r['製番号']||''}</td>
      <td>${r['品名']||''}</td>
      <td>${r['品番']||''}</td>
      <td>${r['図番']||''}</td>
      <td><span class="badge">${r.status}</span></td>
      <td>${r.current_process}</td>
      <td class="muted s">${fmtDT(r.updated_at)}</td>
      <td class="muted s">${r.updated_by||''}</td>
      <td>
        <button class="btn ghost s" onclick="openTicket('${r.po_id}')">現品票</button>
        <button class="btn ghost s" onclick="promptUpdate('${r.po_id}','${r.status}','${r.current_process}')">Update</button>
        <button class="btn ghost s" onclick="openShipByPO('${r.po_id}')">出荷確認</button>
      </td>
    </tr>`).join('');
}
async function promptUpdate(po_id, curStatus, curProc){
  const status = prompt('Status baru (生産開始/検査保留/検査済/出荷準備/出荷済/不良品（要リペア）):', curStatus||'');
  if (status===null) return;
  const proc = prompt('Proses baru:', curProc||''); if (proc===null) return;
  const note = prompt('Catatan (opsional):','')||'';
  try{
    await apiPost('updateOrder', { po_id, updates:{ status, current_process:proc, note }, user:SESSION });
    alert('Updated'); refreshAll(true);
  }catch(e){ alert(e.message||e); }
}

/* ================= SHIPMENTS ================= */
async function scheduleUI(){
  const po_id = $('#s_po').value.trim();
  const dateIso = $('#s_date').value;
  const qty = $('#s_qty').value;
  if (!po_id || !dateIso) return alert('Isi PO & tanggal');
  try{
    const r = await apiPost('scheduleShipment', { po_id, dateIso, qty, user:SESSION });
    alert('Shipment dibuat: '+r.ship_id); refreshAll(true);
  }catch(e){ alert(e.message||e); }
}
async function openShipByPO(po_id){
  try{
    const doc = await apiGet({ action:'shipByPo', po_id });
    showShipDoc(doc.shipment, doc.order);
  }catch(e){ alert(e.message||e); }
}
async function openShipByID(ship_id){
  try{
    const doc = await apiGet({ action:'shipById', ship_id });
    showShipDoc(doc.shipment, doc.order);
  }catch(e){ alert(e.message||e); }
}

/* ================= DASHBOARD & CHARTS ================= */
async function refreshAll(keepSearch=false){
  try{
    const s = await apiGet({ action:'stock' });
    $('#statFinished').textContent = s.finishedStock;
    $('#statReady').textContent = s.ready;
    $('#statShipped').textContent = s.shipped;

    const today = await apiGet({ action:'todayShip' });
    $('#listToday').innerHTML = today.length
      ? today.map(r=> `<div><span>${r.po_id}</span><span>${new Date(r.scheduled_date).toLocaleDateString()} • Qty ${r.qty}</span></div>`).join('')
      : '<div class="muted">Tidak ada jadwal hari ini</div>';

    const loc = await apiGet({ action:'locSnapshot' });
    $('#gridProc').innerHTML = PROCESSES.map(p=> `<div class="grid-chip"><div class="muted s">${p}</div><div class="h">${loc[p]||0}</div></div>`).join('');

    if (!keepSearch) $('#searchQ').value='';

    await renderOrders(); await renderCharts();
  }catch(e){ console.error(e); }
}
let chM=null,chC=null,chS=null;
async function renderCharts(){
  const d = await apiGet({ action:'charts' });
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (chM) chM.destroy();
  chM = new Chart($('#chartMonthly'), {type:'bar', data:{ labels:months, datasets:[{label:'Total Pengiriman '+d.year, data:d.perMonth}] }});
  if (chC) chC.destroy();
  chC = new Chart($('#chartCustomer'), {type:'bar', data:{ labels:Object.keys(d.perCust), datasets:[{label:'Per Customer', data:Object.values(d.perCust)}] }});
  if (chS) chS.destroy();
  chS = new Chart($('#chartStock'), {type:'pie', data:{ labels:Object.keys(d.stockBuckets), datasets:[{label:'Stok', data:Object.values(d.stockBuckets)}] }});
}

/* ================= Documents ================= */
async function openTicket(po_id){
  try{
    const o = await apiGet({ action:'ticket', po_id });
    const body = `
    <header>
      <img src="assets/logo.png" class="logo">
      <div style="text-align:right">
        <div style="font-weight:700">シャトルガード・生産現品票</div>
        <div style="font-size:12px;color:#555">発行: ${new Date().toLocaleString()}</div>
      </div>
    </header>
    <div class="body">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><b>管理No</b><div>${o['管理No']||'-'}</div></div>
        <div><b>通知書番号</b><div>${o['通知書番号']||'-'}</div></div>
        <div><b>得意先</b><div>${o['得意先']||''}</div></div>
        <div><b>得意先品番</b><div>${o['得意先品番']||''}</div></div>
        <div><b>製番号</b><div>${o['製番号']||''}</div></div>
        <div><b>投入日</b><div>${o['created_at']? new Date(o['created_at']).toLocaleDateString(): '-'}</div></div>
        <div><b>品名</b><div>${o['品名']||''}</div></div>
        <div><b>品番/図番</b><div>${(o['品番']||'')+' / '+(o['図番']||'')}</div></div>
      </div>
      <hr>
      <table>
        <thead><tr><th style="width:18%">工程名</th><th>作業者</th><th>作業日</th><th>投入数</th><th>合格数</th><th>不合格数</th><th>修正数</th></tr></thead>
        <tbody>${PROCESSES.map(p=> `<tr><td>${p}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}</tbody>
      </table>
      <p><b>現在ステータス：</b>${o.status}　<b>工程：</b>${o.current_process}</p>
      <p style="font-size:12px;color:#555">更新: ${fmtDT(o.updated_at)} / ${o.updated_by||''}</p>
    </div>`;
    $('#ticketBody').innerHTML = body; $('#dlgTicket').showModal();
  }catch(e){ alert(e.message||e); }
}
function showShipDoc(s,o){
  const dt = s.scheduled_date ? new Date(s.scheduled_date) : null;
  const body = `
  <header>
    <img src="assets/logo.png" class="logo">
    <div style="text-align:right">
      <div style="font-weight:700">出荷確認書</div>
      <div style="font-size:12px;color:#555">発行: ${new Date().toLocaleString()}</div>
    </div>
  </header>
  <div class="body">
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div><b>得意先</b><div>${o['得意先']||''}</div></div>
      <div><b>出荷日</b><div>${dt? dt.toLocaleDateString(): '-'}</div></div>
      <div><b>品名</b><div>${o['品名']||''}</div></div>
      <div><b>品番/図番</b><div>${(o['品番']||'')+' / '+(o['図番']||'')}</div></div>
      <div><b>PO</b><div>${o.po_id||s.po_id}</div></div>
      <div><b>数量</b><div>${s.qty||0}</div></div>
      <div><b>出荷ステータス</b><div>${s.status}</div></div>
      <div><b>備考</b><div style="min-height:32px"></div></div>
    </div>
    <hr>
    <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
      <div><b>検品者</b><div style="height:40px;border-bottom:1px solid #000"></div></div>
      <div><b>出荷検査</b><div style="height:40px;border-bottom:1px solid #000"></div></div>
      <div><b>品質管理</b><div style="height:40px;border-bottom:1px solid #000"></div></div>
    </div>
  </div>`;
  $('#shipBody').innerHTML = body; $('#dlgShip').showModal();
}
