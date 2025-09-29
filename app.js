/* ====== CONFIG ====== */
const SUPABASE_URL = "https://gyafcazspbecugjmhqjk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5YWZjYXpzcGJlY3Vnam1ocWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMDEwMjEsImV4cCI6MjA3NDY3NzAyMX0.TaRWelu2eVGMQCXLcqVRgQ2lDTMstP_l33x2TPC6Fbs"; // Settings → API → Project API keys
const LOGO_SRC = "assets/logo.png"; // atau URL public Supabase Storage

const PROCESSES = [
  'レーザ工程','曲げ工程','外枠組立工程','シャッター組立工程','シャッター溶接工程',
  'コーキング工程','外枠塗装工程','組立工程（組立中）','組立工程（組立済）','外注','検査工程'
];
const STATUSES = ['生産開始','検査保留','検査済','出荷準備','出荷済','不良品（要リペア）'];

/* ====== INIT SUPABASE ====== */
let supabase, SESSION=null, PROFILE=null;
window.addEventListener('DOMContentLoaded', async ()=>{
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  document.getElementById('logoImg').src = LOGO_SRC;

  // Bind auth buttons
  document.getElementById('btnLogin').onclick = onLogin;
  document.getElementById('btnSignup').onclick = onSignup;
  document.getElementById('btnLogout').onclick = async ()=>{ await supabase.auth.signOut(); location.reload(); };

  // App actions
  document.getElementById('btnRefresh').onclick = refreshAll;
  document.getElementById('btnCreateOrder').onclick = createOrderUI;
  document.getElementById('btnSchedule').onclick = scheduleUI;
  document.getElementById('btnExportOrders').onclick = exportOrdersCSV;
  document.getElementById('btnExportShip').onclick = exportShipCSV;
  document.getElementById('btnShipByPO').onclick = ()=> {
    const po = document.getElementById('s_po').value.trim();
    if(!po) return alert('Isi PO dulu'); openShipConfirmByPO(po);
  };
  document.getElementById('btnShipByID').onclick = async ()=>{
    const id = prompt('Masukkan Ship ID:'); if(!id) return;
    openShipConfirmByID(id.trim());
  };
  document.getElementById('searchQ').addEventListener('input', renderOrders);

  // Restore session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    SESSION = session;
    PROFILE = await fetchProfile();
    enterApp();
  } else {
    showAuth();
  }
});

/* ====== AUTH ====== */
async function onLogin(){
  const email = document.getElementById('inEmail').value.trim();
  const password = document.getElementById('inPass').value.trim();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);
  SESSION = data.session;
  PROFILE = await fetchProfile();
  enterApp();
}
async function onSignup(){
  const email = document.getElementById('inEmail').value.trim();
  const password = document.getElementById('inPass').value.trim();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return alert(error.message);
  alert('Sign up berhasil. Lengkapi profile (full_name, department) di tabel profiles.');
}
async function fetchProfile(){
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}
function enterApp(){
  if (!PROFILE) { alert('Profile belum dibuat. Isi di tabel profiles.'); }
  document.getElementById('userInfo').textContent = PROFILE ? `${PROFILE.full_name} • ${PROFILE.department}` : '(No profile)';
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  loadMasters();
  refreshAll();
}
function showAuth(){
  document.getElementById('authView').classList.remove('hidden');
  document.getElementById('appView').classList.add('hidden');
}

/* ====== HELPERS ====== */
const $ = sel => document.querySelector(sel);
function uid(prefix){ return `${prefix}-${Date.now()}-${Math.floor(Math.random()*9999)}`; }
function fmtDT(s){ if(!s) return ''; return new Date(s).toLocaleString(); }

/* ====== MASTERS ====== */
async function loadMasters(){
  const { data, error } = await supabase.from('masters').select('*').eq('is_active', true);
  if (error){ console.error(error); return; }
  const byType = { '得意先':[], '品名':[], '品番':[], '図番':[] };
  data.forEach(r=>{
    if (byType[r.type]) byType[r.type].push(r.name || r.code);
  });
  Object.keys(byType).forEach(k=>{
    byType[k] = Array.from(new Set(byType[k])).sort();
  });
  const fill = (id, arr)=>{ $(id).innerHTML = (arr||[]).map(v=> `<option value="${v}"></option>`).join(''); };
  fill('#dl_tokui', byType['得意先']);
  fill('#dl_hinmei', byType['品名']);
  fill('#dl_hinban', byType['品番']);
  fill('#dl_zuban', byType['図番']);
}

/* ====== ORDERS ====== */
async function createOrderUI(){
  if (!PROFILE) return alert('Profile belum ada.');
  const payload = {
    得意先: $('#c_tokui').value.trim(),
    得意先品番: $('#c_tokui_hin').value.trim(),
    製番号: $('#c_sei').value.trim(),
    品名: $('#c_hinmei').value.trim(),
    品番: $('#c_hinban').value.trim(),
    図番: $('#c_zuban').value.trim(),
    通知書番号: $('#c_tsuchi').value.trim(),
    管理No: $('#c_kanri').value.trim()
  };
  const po_id = uid('PO');
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('production_orders').insert([{
    po_id, ...payload,
    status:'生産開始', current_process: PROCESSES[0],
    created_by: user.id, updated_by: user.id
  }]);
  if (error) return alert(error.message);

  // log
  await supabase.from('status_log').insert([{
    log_id: uid('LOG'), po_id, prev_status:'', new_status:'生産開始',
    prev_process:'', new_process:PROCESSES[0], note:'生産現品票発行',
    updated_by: user.id
  }]);

  alert('Order dibuat: '+po_id);
  refreshAll();
}

async function listOrdersRaw(){
  const q = $('#searchQ').value.trim().toLowerCase();
  let { data, error } = await supabase.from('production_orders').select('*').order('updated_at', { ascending:false });
  if (error) { console.error(error); return []; }
  if (q){
    data = data.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q)));
  }
  return data;
}
async function renderOrders(){
  const rows = await listOrdersRaw();
  $('#tbOrders').innerHTML = rows.map(r=>{
    const updated = r.updated_at ? fmtDT(r.updated_at) : '';
    return `<tr>
      <td><b>${r.po_id}</b></td>
      <td>${r['得意先']||''}</td>
      <td>${r['製番号']||''}</td>
      <td>${r['品名']||''}</td>
      <td>${r['品番']||''}</td>
      <td>${r['図番']||''}</td>
      <td><span class="badge">${r.status}</span></td>
      <td>${r.current_process}</td>
      <td class="muted s">${updated}</td>
      <td class="muted s">${r.updated_by || ''}</td>
      <td>
        <button class="btn ghost s" onclick="openTicket('${r.po_id}')">現品票</button>
        <button class="btn ghost s" onclick="promptUpdate('${r.po_id}','${r.status}','${r.current_process}')">Update</button>
        <button class="btn ghost s" onclick="openShipConfirmByPO('${r.po_id}')">出荷確認</button>
      </td>
    </tr>`;
  }).join('');
}

function canUpdateClient(targetStatus, targetProcess){
  const dep = PROFILE?.department;
  if (dep==='生産管理') return true;
  if (dep==='製造部'){
    const idx = PROCESSES.indexOf(targetProcess||'');
    const maxIdx = PROCESSES.indexOf('組立工程（組立済）');
    return idx>=0 && idx<=maxIdx && !['検査済','出荷準備','出荷済'].includes(targetStatus);
  }
  if (dep==='検査部'){
    return (targetProcess==='検査工程') && ['検査済','検査保留','不良品（要リペア）'].includes(targetStatus);
  }
  return false;
}
async function promptUpdate(po_id, curStatus, curProc){
  const status = prompt('Status baru (生産開始/検査保留/検査済/出荷準備/出荷済/不良品（要リペア）):', curStatus||'');
  if (status===null) return;
  const proc = prompt('Proses baru:', curProc||'');
  if (proc===null) return;
  const note = prompt('Catatan (opsional):','')||'';

  if (!canUpdateClient(status, proc)) return alert('Akses ditolak (role).');

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('production_orders')
    .update({ status, current_process:proc, updated_by:user.id })
    .eq('po_id', po_id);
  if (error) return alert(error.message);

  await supabase.from('status_log').insert([{
    log_id: uid('LOG'), po_id, prev_status:curStatus, new_status:status,
    prev_process:curProc, new_process:proc, note, updated_by:user.id
  }]);

  alert('Updated');
  refreshAll(true);
}

/* ====== SHIPMENTS ====== */
async function scheduleUI(){
  const po_id = document.getElementById('s_po').value.trim();
  const scheduled_date = document.getElementById('s_date').value;
  const qty = Number(document.getElementById('s_qty').value||0);
  if (!po_id || !scheduled_date) return alert('Isi PO dan tanggal');

  const ship_id = uid('SHIP');
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('shipments').insert([{
    ship_id, po_id, scheduled_date, qty, status:'出荷準備', created_by:user.id, updated_by:user.id
  }]);
  if (error) return alert(error.message);

  if (PROFILE?.department === '生産管理'){
    await supabase.from('production_orders').update({ status:'出荷準備', current_process:'検査工程', updated_by:user.id }).eq('po_id', po_id);
  }

  alert('Shipment dibuat: '+ship_id);
  refreshAll(true);
}

async function latestShipByPO(po_id){
  const { data, error } = await supabase.from('shipments').select('*').eq('po_id', po_id).order('updated_at',{ascending:false}).limit(1);
  if (error) { console.error(error); return null; }
  return (data && data[0]) || null;
}

/* ====== DASHBOARD ====== */
async function refreshAll(keepSearch=false){
  await loadMasters();
  // stats
  const s = await stockStatus();
  document.getElementById('statFinished').textContent = s.finishedStock;
  document.getElementById('statReady').textContent = s.ready;
  document.getElementById('statShipped').textContent = s.shipped;

  // today shipments
  const today = await todayShipments();
  document.getElementById('listToday').innerHTML = today.length
    ? today.map(r=>{
        const d = new Date(r.scheduled_date);
        return `<div><span>${r.po_id}</span><span>${d.toLocaleDateString()} • Qty ${r.qty}</span></div>`;
      }).join('')
    : '<div class="muted">Tidak ada jadwal hari ini</div>';

  // process grid
  const loc = await locationSnapshot();
  document.getElementById('gridProc').innerHTML = PROCESSES.map(p=> `<div class="grid-chip"><div class="muted s">${p}</div><div class="h">${loc[p]||0}</div></div>`).join('');

  if (!keepSearch) document.getElementById('searchQ').value = '';
  await renderOrders();
  await renderCharts();
}

async function stockStatus(){
  const { data, error } = await supabase.from('production_orders').select('status');
  if (error) { console.error(error); return {finishedStock:0, shipped:0, ready:0}; }
  const shipped = data.filter(o=> o.status==='出荷済').length;
  const ready = data.filter(o=> ['検査済','出荷準備'].includes(o.status)).length;
  const finishedStock = Math.max(ready - shipped, 0);
  return { finishedStock, shipped, ready };
}
async function todayShipments(){
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .gte('scheduled_date', today.toISOString().slice(0,10))
    .lt('scheduled_date', tomorrow.toISOString().slice(0,10));
  if (error){ console.error(error); return []; }
  return data;
}
async function locationSnapshot(){
  const { data, error } = await supabase.from('production_orders').select('current_process');
  if (error){ console.error(error); return {}; }
  const map = {}; PROCESSES.forEach(p=> map[p]=0);
  data.forEach(r=> map[r.current_process] = (map[r.current_process]||0)+1);
  return map;
}
async function chartsData(){
  const { data: ships } = await supabase.from('shipments').select('scheduled_date,qty');
  const { data: orders } = await supabase.from('production_orders').select('po_id,得意先,status');
  const nowY = (new Date()).getFullYear();
  const perMonth = Array(12).fill(0);
  (ships||[]).forEach(s=>{
    const d = new Date(s.scheduled_date); if (d.getFullYear()===nowY) perMonth[d.getMonth()] += Number(s.qty||0);
  });
  const perCust = {};
  (ships||[]).forEach(s=>{
    // need join: get customer via order (optional client join)
  });
  // quick client join
  const orderById = {}; (orders||[]).forEach(o=> orderById[o.po_id]=o);
  (ships||[]).forEach(s=>{
    const o = orderById[s.po_id]; const cust = o ? (o['得意先']||'その他') : '不明';
    perCust[cust] = (perCust[cust]||0) + Number(s.qty||0);
  });
  const stockBuckets = {'検査済':0,'出荷準備':0,'出荷済':0};
  (orders||[]).forEach(o=> { if (stockBuckets[o.status]!==undefined) stockBuckets[o.status]++; });
  return { perMonth, perCust, stockBuckets, year: nowY };
}
let chM=null,chC=null,chS=null;
async function renderCharts(){
  const d = await chartsData();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (chM) chM.destroy();
  chM = new Chart(document.getElementById('chartMonthly'), {type:'bar', data:{ labels:months, datasets:[{label:'Total Pengiriman '+d.year, data:d.perMonth}] }});
  if (chC) chC.destroy();
  chC = new Chart(document.getElementById('chartCustomer'), {type:'bar', data:{ labels:Object.keys(d.perCust), datasets:[{label:'Per Customer', data:Object.values(d.perCust)}] }});
  if (chS) chS.destroy();
  chS = new Chart(document.getElementById('chartStock'), {type:'pie', data:{ labels:Object.keys(d.stockBuckets), datasets:[{label:'Stok', data:Object.values(d.stockBuckets)}] }});
}

/* ====== Documents (現品票 / 出荷確認書) ====== */
async function openTicket(po_id){
  const { data, error } = await supabase.from('production_orders').select('*').eq('po_id', po_id).maybeSingle();
  if (error || !data) return alert('PO tidak ditemukan');
  const o = data;
  const body = `
  <header>
    <img src="${LOGO_SRC}" class="logo">
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
  document.getElementById('ticketBody').innerHTML = body;
  document.getElementById('dlgTicket').showModal();
}

async function openShipConfirmByPO(po_id){
  const { data: ship } = await supabase.from('shipments').select('*').eq('po_id', po_id).order('updated_at',{ascending:false}).limit(1);
  if (!ship || !ship.length) return alert('Belum ada rencana pengiriman untuk PO ini');
  const s = ship[0];
  const { data: o } = await supabase.from('production_orders').select('*').eq('po_id', po_id).maybeSingle();
  showShipDoc(s, o || { po_id });
}
async function openShipConfirmByID(ship_id){
  const { data: s } = await supabase.from('shipments').select('*').eq('ship_id', ship_id).maybeSingle();
  if (!s) return alert('Ship ID tidak ditemukan');
  const { data: o } = await supabase.from('production_orders').select('*').eq('po_id', s.po_id).maybeSingle();
  showShipDoc(s, o || { po_id: s.po_id });
}
function showShipDoc(s,o){
  const dt = s.scheduled_date ? new Date(s.scheduled_date) : null;
  const body = `
  <header>
    <img src="${LOGO_SRC}" class="logo">
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
  document.getElementById('shipBody').innerHTML = body;
  document.getElementById('dlgShip').showModal();
}

/* ====== EXPORT CSV ====== */
async function exportOrdersCSV(){
  const { data } = await supabase.from('production_orders').select('*');
  downloadCSV('orders.csv', data||[]);
}
async function exportShipCSV(){
  const { data } = await supabase.from('shipments').select('*');
  downloadCSV('shipments.csv', data||[]);
}
function downloadCSV(filename, rows){
  if(!rows.length){ return downloadFile(filename, ''); }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')].concat(
    rows.map(r=> headers.map(h=> String(r[h]??'').replaceAll('"','""')).map(v=>`"${v}"`).join(','))
  ).join('\n');
  downloadFile(filename, csv);
}
function downloadFile(name, content){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type:'text/csv'}));
  a.download = name; a.click();
}
