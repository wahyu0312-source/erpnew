/* ============ KONFIG ============ */
const API_BASE = 'https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec'; // /exec
// Role display → tombol menu bisa kamu sembunyikan sesuai role login
const ROLE = {
  ADMIN: 'admin',
  SALES: '営業',
  SEISAN: '生産管理部',
  SEIZO: '製造部',
  KENSA: '検査部'
};

// Pemetaan nama proses ke label UI (gunakan nama baru)
const PROC_ALIAS = (name) => {
  // pastikan semua “外作加工” terlihat sebagai “外注加工/組立”
  if (name === '外作加工') return '外注加工/組立';
  return name || '';
};

// Proses yang ditampilkan untuk masing-masing role
function filterStationsForRole(role) {
  const all = ['準備','シャッター溝段','レザー加工','曲げ加工','外注加工/組立','検査工程','出荷（組立済）'];
  if (role === ROLE.SEIZO)       return ['曲げ加工','外注加工/組立','検査工程','出荷（組立済）'];
  if (role === ROLE.KENSA)       return ['検査工程','出荷（組立済）'];
  return all; // admin, 生産管理, 営業 → semua
}

// Opsi status sesuai role (tanpa OK/NG di kolom 状態)
function statusOptionsByRole(role){
  if (role === ROLE.SEIZO) return ['進行','組立中','組立済','出荷準備','出荷済'];
  if (role === ROLE.KENSA) return ['検査中','検査済','出荷準備','出荷済'];
  // admin / 生産管理: semua
  return ['進行','組立中','組立済','検査中','出荷準備','出荷済'];
}

/* ============ UTIL ============ */
const $ = q => document.querySelector(q);
const $$ = q => Array.from(document.querySelectorAll(q));

async function API(action, data={}){
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type':'text/plain' },        // ← anti preflight
    body: JSON.stringify({ action, ...data })
  });
  const txt = await res.text();
  try{ return JSON.parse(txt); }catch(e){ throw new Error('API parse error'); }
}

/* ============ STATE ============ */
const state = {
  user: null,
  orders: []
};

/* ============ LOGIN ============ */
$('#btnLogin')?.addEventListener('click', async ()=>{
  $('#btnLogin').disabled = true;
  try{
    const r = await API('login', { username: $('#inUser').value.trim(), password: $('#inPass').value.trim() });
    if(!r.ok) throw new Error('Login failed');
    state.user = r.user;
    showApp();
    await refreshAll();
  }catch(e){
    alert(e.message);
  }finally{
    $('#btnLogin').disabled = false;
  }
});

function showApp(){
  $('#authView')?.classList.add('hidden');
  $('#pageDash')?.classList.remove('hidden');
  // atur visibilitas menu kalau mau
}

/* ============ LOAD & RENDER ============ */
async function refreshAll(){
  const r = await API('listOrders');
  if(!r.ok) return;
  state.orders = r.data || [];
  renderOrders();
  renderDash();
}

function renderOrders(){
  const tbody = $('#tbOrders');
  if(!tbody) return;
  tbody.innerHTML = '';

  state.orders.forEach(o=>{
    const tr = document.createElement('tr');

    const procLabel = PROC_ALIAS(o.current_process);
    const status = o.status || '';
    const updated = o.updated_at || '';

    tr.innerHTML = `
      <td>
        <div class="muted s">注番</div>
        <div><b>${o.po_id||'-'}</b></div>
        <div class="muted s">${o.得意先||''}</div>
      </td>
      <td>${o.品名||''}</td>
      <td>${o.品番||''}</td>
      <td>${o.図番||''}</td>
      <td>
        <span class="badge ${badgeFor(status)}">${status||'-'}</span>
      </td>
      <td>
        <span class="chip">${procLabel||'-'}</span>
      </td>
      <td>${updated||''}</td>
      <td>${o.updated_by||''}</td>
      <td class="row gap">
        <button class="btn s ghost js-history" data-po="${o.po_id}"><i class="fa-regular fa-clock"></i> 履歴</button>
        <button class="btn s ghost js-manual"  data-po="${o.po_id}"><i class="fa-regular fa-pen-to-square"></i> 手動更新</button>
        <button class="btn s ghost js-scan"    data-po="${o.po_id}"><i class="fa-solid fa-qrcode"></i> スキャン</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // bind
  $$('.js-manual').forEach(b=> b.onclick = ()=> openManual(b.dataset.po));
  $$('.js-scan').forEach(b=> b.onclick   = ()=> openScan(b.dataset.po));
  $$('.js-history').forEach(b=> b.onclick= ()=> openHistory(b.dataset.po));
}

// warna badge status
function badgeFor(st){
  if(/出荷済/.test(st)) return 'ok';
  if(/検査中/.test(st)) return 'warn';
  if(/組立中/.test(st)) return 'info';
  if(/出荷準備/.test(st)) return 'accent';
  if(/組立済|検査済/.test(st)) return 'good';
  return '';
}

function renderDash(){
  // contoh kecil; kamu bisa lanjutkan stat di dashboard
}

/* ============ STATION QR (PRINT) ============ */
$('#miStationQR')?.addEventListener('click', async ()=>{
  const wrap = $('#qrWrap'); wrap.innerHTML='';
  const r = await API('stationQR');
  const allow = filterStationsForRole(state.user?.department || state.user?.role || '');

  (r.data?.stations||[]).filter(s=> allow.includes(PROC_ALIAS(s))).forEach(name=>{
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `<strong>${PROC_ALIAS(name)}</strong><div class="qr"></div>`;
    wrap.appendChild(div);
    new QRCode(div.querySelector('.qr'), { text:`ST:${name}`, width:120, height:120 });
  });
  $('#dlgStationQR').showModal();
});

/* ============ SCAN QR ============ */
let _scanStream = null, _scanTimer = null;
async function openScan(po){
  $('#scanPO').textContent = po;
  $('#dlgScan').showModal();
  $('#scanResult').textContent = '';

  const v = $('#scanVideo'), c = $('#scanCanvas'), ctx = c.getContext('2d');
  try{
    _scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    v.srcObject = _scanStream; await v.play();
    _scanTimer = setInterval(async ()=>{
      c.width = v.videoWidth; c.height = v.videoHeight;
      ctx.drawImage(v,0,0,c.width,c.height);
      const img = ctx.getImageData(0,0,c.width,c.height);
      const code = jsQR(img.data, c.width, c.height);
      if(code && code.data.startsWith('ST:')){
        const processRaw = code.data.replace(/^ST:/,'');
        const statusSel = statusOptionsByRole(state.user?.department||state.user?.role||'')[0] || '進行';
        const r = await API('updateProcess', { po_id:po, process:processRaw, status:statusSel, ok:0, ng:0, note:'scan', user: state.user?.username||'system' });
        if(r.ok){
          $('#scanResult').textContent = `更新：${PROC_ALIAS(processRaw)} → ${statusSel}`;
          clearInterval(_scanTimer); _scanTimer=null;
          _scanStream.getTracks().forEach(t=>t.stop()); _scanStream=null;
          await refreshAll();
        }
      }
    }, 500);
  }catch(e){ $('#scanResult').textContent = e.message; }
}
$('#btnScanClose')?.addEventListener('click', ()=>{
  if(_scanTimer){ clearInterval(_scanTimer); _scanTimer=null; }
  if(_scanStream){ _scanStream.getTracks().forEach(t=>t.stop()); _scanStream=null; }
  $('#dlgScan').close();
});
$('#btnScanStart')?.addEventListener('click', ()=>{}); // sudah auto start

/* ============ MANUAL UPDATE ============ */
async function openManual(po){
  $('#scanResult').textContent = '';
  $('#scanPO').textContent = po;
  const role = state.user?.department || state.user?.role || '';

  // isi stations sesuai role
  const allowed = filterStationsForRole(role);
  const selProc = $('#mProc');
  selProc.innerHTML = allowed.map(s=>`<option value="${s}">${s}</option>`).join('');

  const selStatus = $('#mStatus');
  selStatus.innerHTML = statusOptionsByRole(role).map(s=>`<option value="${s}">${s}</option>`).join('');

  $('#mOK').value='0'; $('#mNG').value='0'; $('#mNote').value='';
  $('#dlgManual').showModal();

  $('#mClose').onclick = ()=> $('#dlgManual').close();
  $('#mSave').onclick = async ()=>{
    const payload = {
      po_id: po,
      process: selProc.value,          // langsung kirim nama BARU
      status: selStatus.value,
      ok: $('#mOK').value||0,
      ng: $('#mNG').value||0,
      note: $('#mNote').value||'',
      user: state.user?.username||'system'
    };
    const res = await API('updateProcess', payload);
    if(!res.ok) return alert('更新失敗');
    $('#dlgManual').close(); refreshAll();
  };
}

/* ============ HISTORY (placeholder sederhana) ============ */
function openHistory(po){
  // Kalau perlu, tambahkan API list StatusLog dan render di dialog
  alert('履歴は後で拡張可能：PO ' + po);
}

/* ============ STARTUP ============ */
// Jika mau auto ping
(async ()=>{ try{ await API('ping'); }catch(_){ /* ignore */ } })();
