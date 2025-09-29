/* ================= CONFIG ================= */
// Ganti ini dengan URL Web App /exec hasil Deploy di Apps Script
const API_BASE = "https://script.google.com/macros/s/AKfycbzjiN5ePhvRAs6fTKEraiEXXOFP-OndOFgw1VuAH2i5SX2-z3CGYHXr3_m8SHG01gFyFA/exec"; // contoh: https://script.google.com/macros/s/AKfycb.../exec
const API_KEY  = ""; // opsional: isi jika Code.gs CONF.API_TOKEN diisi

// Daftar proses & status referensi (untuk tampilan dan validasi ringan)
const PROCESSES = [
  'レーザ工程','曲げ工程','外枠組立工程','シャッター組立工程','シャッター溶接工程',
  'コーキング工程','外枠塗装工程','組立工程（組立中）','組立工程（組立済）','外注','検査工程'
];
const STATUSES = ['生産開始','検査保留','検査済','出荷準備','出荷済','不良品（要リペア）'];

/* ================= UTIL ================= */
const $ = sel => document.querySelector(sel);
const fmtDT = s => s ? new Date(s).toLocaleString() : '';
const fmtD = s => s ? new Date(s).toLocaleDateString() : '';

let SESSION = null; // {username, full_name, department, role}

/* ================= API WRAPPER (tanpa preflight) ================= */
async function apiPost(action, body){
  const payload = { action, ...body };
  if (API_KEY) payload.apiKey = API_KEY; // jika kamu aktifkan token di server
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // penting agar tidak memicu preflight
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

/* ================= BOOT ================= */
window.addEventListener('DOMContentLoaded', ()=>{
  // Hook elemen standar yang sudah ada di index.html
  bindLoginSection();
  bindAppSection();

  // Restore sesi
  const saved = localStorage.getItem('erp_session');
  if (saved){ SESSION=JSON.parse(saved); enterApp(); } else { showAuth(); }

  // Sisipkan UI “Tambah User via Web” (navbar + modal) kalau belum ada
  ensureAddUserUI();
});

/* ================= AUTH ================= */
function bindLoginSection(){
  const btnLogin = $('#btnLogin');
  const btnNewUser = $('#btnNewUser');
  const btnLogout = $('#btnLogout');
  const btnChangePass = $('#btnChangePass');

  if (btnLogin) btnLogin.onclick = onLogin;
  if (btnNewUser) btnNewUser.onclick = addUserFromLoginUI;
  if (btnLogout) btnLogout.onclick = ()=>{ SESSION=null; localStorage.removeItem('erp_session'); location.reload(); };
  if (btnChangePass) btnChangePass.onclick = changePasswordUI;
}

function bindAppSection(){
  const btnRefresh = $('#btnRefresh');
  const btnCreateOrder = $('#btnCreateOrder');
  const btnSchedule = $('#btnSchedule');
  const btnExportOrders = $('#btnExportOrders');
  const btnExportShip = $('#btnExportShip');
  const btnShipByPO = $('#btnShipByPO');
  const btnShipByID = $('#btnShipByID');
  const searchQ = $('#searchQ');

  if (btnRefresh) btnRefresh.onclick = refreshAll;
  if (btnCreateOrder) btnCreateOrder.onclick = createOrderUI;
  if (btnSchedule) btnSchedule.onclick = scheduleUI;
  if (btnExportOrders) btnExportOrders.onclick = exportOrdersCSV;
  if (btnExportShip) btnExportShip.onclick = exportShipCSV;
  if (btnShipByPO) btnShipByPO.onclick = ()=>{ const po=$('#s_po').value.trim(); if(!po) return alert('Isi PO'); openShipByPO(po); };
  if (btnShipByID) btnShipByID.onclick = ()=>{ const id=prompt('Ship ID:'); if(!id) return; openShipByID(id.trim()); };
  if (searchQ) searchQ.addEventListener('input', renderOrders);
}

async function onLogin(){
  const username = $('#inUser').value.trim();
  const password = $('#inPass').value.trim();
  try{
    const user = await apiPost('login', { username, password });
    SESSION = user;
    localStorage.setItem('erp_session', JSON.stringify(SESSION));
    enterApp();
  }catch(e){ alert(e.message || e); }
}

// “Tambah user” di panel login (detail-section)
async function addUserFromLoginUI(){
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
  // Navbar info + tombol
  const userInfo = $('#userInfo');
  const btnLogout = $('#btnLogout');
  const btnChangePass = $('#btnChangePass');
  if (userInfo) userInfo.textContent = `${SESSION.full_name} • ${SESSION.department}`;
  if (btnLogout) btnLogout.classList.remove('hidden');
  if (btnChangePass) btnChangePass.classList.remove('hidden');

  // Switch view
  $('#authView')?.classList.add('hidden');
  $('#appView')?.classList.remove('hidden');

  loadMasters();
  refreshAll();
}

function showAuth(){
  $('#btnLogout')?.classList.add('hidden');
  $('#btnChangePass')?.classList.add('hidden');
  $('#authView')?.classList.remove('hidden');
  $('#appView')?.classList.add('hidden');
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
    alert('Order dibuat: '+r.po_id);
    refreshAll();
  }catch(e){ alert(e.message||e); }
}

async function listOrders(){
  const q = $('#searchQ')?.value.trim() || '';
  return apiGet({ action:'listOrders', q });
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
    alert('Updated');
    refreshAll(true);
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
    alert('Shipment dibuat: '+r.ship_id);
    refreshAll(true);
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
      ? today.map(r=> `<div><span>${r.po_id}</span><span>${fmtD(r.scheduled_date)} • Qty ${r.qty}</span></div>`).join('')
      : '<div class="muted">Tidak ada jadwal hari ini</div>';

    const loc = await apiGet({ action:'locSnapshot' });
    $('#gridProc').innerHTML = PROCESSES.map(p=> `<div class="grid-chip"><div class="muted s">${p}</div><div class="h">${loc[p]||0}</div></div>`).join('');

    if (!keepSearch) $('#searchQ').value='';

    await renderOrders();
    await renderCharts();
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
    showDialog('dlgTicket', body, true);
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
  showDialog('dlgShip', body, true);
}
async function openShipByID(id){
  const d=await apiGet({action:'shipById', ship_id:id});
  showShipDoc(d.shipment,d.order);
}

/* ================= EXPORT ================= */
async function exportOrdersCSV(){
  const rows = await apiGet({ action:'listOrders' });
  downloadCSV('orders.csv', rows||[]);
}
async function exportShipCSV(){
  const rows = await apiGet({ action:'todayShip' });
  downloadCSV('shipments_today.csv', rows||[]);
}
function downloadCSV(name, rows){
  if(!rows.length) return downloadFile(name,'');
  const headers=Object.keys(rows[0]);
  const csv=[headers.join(',')].concat(rows.map(r=> headers.map(h=> String(r[h]??'').replaceAll('"','""')).map(v=>`"${v}"`).join(','))).join('\n');
  downloadFile(name,csv);
}
function downloadFile(name, content){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type:'text/csv'}));
  a.download=name; a.click();
}

/* ================= GENERIC DIALOG ================= */
function showDialog(id, innerHTML, printable=false){
  let dlg = document.getElementById(id);
  if (!dlg){
    dlg = document.createElement('dialog');
    dlg.id = id; dlg.className = 'paper';
    dlg.innerHTML = `<div class="body"></div><footer class="row-end"></footer>`;
    document.body.appendChild(dlg);
  }
  dlg.querySelector('.body').innerHTML = innerHTML;
  const footer = dlg.querySelector('footer');
  footer.innerHTML = '';
  if (printable){
    const b1 = document.createElement('button'); b1.className='btn ghost'; b1.textContent='Print'; b1.onclick = ()=>window.print();
    footer.appendChild(b1);
  }
  const b2 = document.createElement('button'); b2.className='btn'; b2.textContent='Tutup'; b2.onclick = ()=>dlg.close();
  footer.appendChild(b2);
  dlg.showModal();
}

/* ================= TAMBAH USER via WEB (NAVBAR) ================= */
function ensureAddUserUI(){
  // tampilkan hanya untuk admin/生産管理 ketika sudah login
  const navRight = document.querySelector('.nav .nav-right') || document.querySelector('.nav');
  if (!navRight) return;

  // sisipkan tombol bila belum ada
  let btn = document.getElementById('btnAddUserWeb');
  if (!btn){
    btn = document.createElement('button');
    btn.id = 'btnAddUserWeb';
    btn.className = 'btn ghost hidden';
    btn.textContent = 'Tambah User';
    btn.onclick = openAddUserModal;
    navRight.insertBefore(btn, document.getElementById('btnChangePass') || null);
  }

  // saat user berganti (enterApp dipanggil), toggle akan diatur lagi
  const _origEnter = enterApp;
  enterApp = function(){
    _origEnter();
    const canAdmin = SESSION && (SESSION.role==='admin' || SESSION.department==='生産管理');
    if (canAdmin) btn.classList.remove('hidden'); else btn.classList.add('hidden');
  }
}

function openAddUserModal(){
  if (!SESSION) return alert('Login dulu');
  if (!(SESSION.role==='admin' || SESSION.department==='生産管理')) return alert('Hanya admin/生産管理');

  const body = `
    <h3 style="margin:0 0 8px 0">Tambah User</h3>
    <div class="grid">
      <input id="au_username" placeholder="username">
      <input id="au_password" type="password" placeholder="password">
      <input id="au_fullname" placeholder="Nama lengkap">
      <select id="au_dept">
        <option value="生産管理">生産管理</option>
        <option value="製造部">製造部</option>
        <option value="検査部">検査部</option>
      </select>
      <select id="au_role">
        <option value="member">member</option>
        <option value="manager">manager</option>
        <option value="admin">admin</option>
      </select>
    </div>
  `;
  showDialog('dlgAddUser', body, false);

  // tambahkan tombol Simpan ke footer
  const dlg = document.getElementById('dlgAddUser');
  const footer = dlg.querySelector('footer');
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn primary';
  saveBtn.textContent = 'Simpan';
  saveBtn.onclick = async ()=>{
    const payload = {
      username: $('#au_username').value.trim(),
      password: $('#au_password').value.trim(),
      full_name: $('#au_fullname').value.trim(),
      department: $('#au_dept').value,
      role: $('#au_role').value
    };
    if (!payload.username || !payload.password || !payload.full_name) return alert('Lengkapi data user');
    try{
      await apiPost('createUser', { user:SESSION, payload });
      alert('User dibuat');
      dlg.close();
    }catch(e){ alert(e.message||e); }
  };
  footer.insertBefore(saveBtn, footer.lastChild);
}
