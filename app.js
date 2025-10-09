/* ========= util ========= */
const API_BASE = ScriptApp ? '' : ''; // dibiarkan, dipanggil via google.script.run di WebApp Apps Script, atau fetch ke doGet/doPost published URL
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);
const toA = (x)=>Array.from(x||[]);
function jfetch(url, opt) { return fetch(url, opt).then(r=>r.json()); }

/* ========= state ========= */
let SESSION = null; // {username, department, role}

/* ========= auth ========= */
async function apiPost(body){
  const url = `${google.script ? '' : ''}`; // dipanggil via google.script.run jika Apps Script HTMLService; untuk HTML statik pakai WebApp URL
  // Di Apps Script HTMLService: gunakan google.script.run
  return new Promise((resolve,reject)=>{
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(err=>reject(err))
      .doPost(JSON.stringify(body)); // server side wrapper doPostHtml harus ada pada deploy (opsional)
  });
}

/* ====== LOGIN demo (pakai GET agar mudah dari WebApp URL) ====== */
$('#btnLogin')?.addEventListener('click', async ()=>{
  const username = $('#inUser').value.trim();
  const password = $('#inPass').value.trim();
  try{
    const res = await jfetch(`?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, {method:'GET'});
    if(!res.ok) throw new Error(res.error||'Login error');
    SESSION = res.data;
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('pageDash').classList.remove('hidden');
    initNav();
    loadDashboard();
  }catch(e){
    alert('ログイン失敗: '+e.message);
  }
});

/* ========= NAV ========= */
function initNav(){
  $('#btnToDash')?.classList.remove('hidden');
  $('#btnToPlan')?.classList.remove('hidden');
  $('#btnToShip')?.classList.remove('hidden');
  $('#btnToCharts')?.classList.remove('hidden');

  $('#btnToDash')?.addEventListener('click', ()=>showPage('pageDash'));
  $('#btnToPlan')?.addEventListener('click', ()=>showPage('pagePlan'));
  $('#btnToShip')?.addEventListener('click', ()=>showPage('pageShip'));
  $('#btnToCharts')?.addEventListener('click', ()=>{ showPage('pageCharts'); renderDefectChart(); });
}
function showPage(id){
  ['authView','pageDash','pagePlan','pageShip','pageCharts'].forEach(pid=>{
    const el=document.getElementById(pid); if(!el) return;
    if(pid===id) el.classList.remove('hidden'); else el.classList.add('hidden');
  });
}

/* ========= DASHBOARD ========= */
async function loadDashboard(){
  try{
    const [ordersRes, stockRes, snapRes] = await Promise.all([
      jfetch(`?action=listOrders`),
      jfetch(`?action=stock`),
      jfetch(`?action=locSnapshot`)
    ]);
    if(!ordersRes.ok) throw new Error(ordersRes.error);
    if(!stockRes.ok) throw new Error(stockRes.error);
    if(!snapRes.ok) throw new Error(snapRes.error);

    renderOrders(ordersRes.data||[]);
    $('#statFinished').textContent = stockRes.data?.finishedStock ?? '-';
    $('#statReady').textContent = stockRes.data?.ready ?? '-';
    $('#statShipped').textContent = stockRes.data?.shipped ?? '-';

    // grid proses (snapshot)
    const map = snapRes.data||{};
    const el = $('#gridProc'); el.innerHTML='';
    Object.keys(map).forEach(k=>{
      const div=document.createElement('div');
      div.className='grid-chip';
      div.innerHTML = `<span class="h">${k||'—'}</span><span>${map[k]}</span>`;
      el.appendChild(div);
    });
  }catch(e){ console.error(e); }
}
function renderOrders(rows){
  const tb = $('#tbOrders'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td><div class="row-main"><b>${r.po_id||''}</b><div class="row-sub"><span class="kv">得意先: <b>${r['得意先']||''}</b></span></div></div></td>
      <td>${r['品名']||''}</td>
      <td>${r['品番']||''}</td>
      <td>${r['図番']||''}</td>
      <td>${r['数量']||0}</td>
      <td class="col-status">${r.status||''}</td>
      <td class="col-proc"><span class="badge">${r.current_process||''}</span></td>
      <td>${r.updated_at||''}</td>
      <td>${r.updated_by||''}</td>
      <td><button class="btn ghost s" data-po="${r.po_id}"><i class="fa-solid fa-qrcode"></i> スキャン</button></td>
    `;
    tb.appendChild(tr);
  });
  // bind scan dialog open
  tb.querySelectorAll('button[data-po]')?.forEach(btn=>{
    btn.addEventListener('click', ()=> openScanDialog(btn.getAttribute('data-po')));
  });
}

/* ========= PLAN (生産現品票) ========= */
$('#btnPlanImport')?.addEventListener('click', ()=> $('#filePlan').click());
$('#filePlan')?.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const buf = await f.arrayBuffer();
  const wb = XLSX.read(buf);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
  const required = ['出荷日','得意先','図番','機種','商品名','数量','注番','備考'];
  const head = Object.keys(rows[0]||{});
  const ok = required.every(h=> head.includes(h));
  if(!ok){ alert('ヘッダ不一致です。必要ヘッダ: '+required.join('、')); return; }
  // isi form dari baris pertama
  const r = rows[0];
  $('#p_shipdate').value = (r['出荷日']||'').slice(0,10).replace(/\./g,'-');
  $('#p_tokui').value = r['得意先']||'';
  $('#p_zuban').value = r['図番']||'';
  $('#p_kishu').value = r['機種']||'';
  $('#p_shohin').value = r['商品名']||'';
  $('#p_qty').value = r['数量']||'';
  $('#p_chuban').value = r['注番']||'';
  $('#p_biko').value = r['備考']||'';
  alert(`生産現品票：${rows.length} 行を読み込みました（先頭行をフォームに反映）。`);
});
$('#btnCreateOrder')?.addEventListener('click', async ()=>{
  const payload = {
    '注番': $('#p_chuban').value.trim(),
    '得意先': $('#p_tokui').value.trim(),
    '図番': $('#p_zuban').value.trim(),
    '機種': $('#p_kishu').value.trim(),
    '商品名': $('#p_shohin').value.trim(),
    '数量': Number($('#p_qty').value||0),
    '備考': $('#p_biko').value.trim(),
    '出荷日': $('#p_shipdate').value||'',
    ok_qty: Number($('#p_ok').value||0),
    ng_qty: Number($('#p_ng').value||0),
    status: '生産開始',
    current_process: 'レザー加工'
  };
  if((payload.ok_qty+payload.ng_qty) <= 0){ alert('OK品 または 不良品の数量を入力してください。'); return; }

  try{
    const res = await jfetch(``, {method:'POST', body: JSON.stringify({action:'createOrder', payload, user:SESSION})});
  }catch{ /* jika fetch tidak dipakai, abaikan */ }

  // fallback (GET) untuk Apps Script WebApp:
  const qs = new URLSearchParams({action:'createOrder', payload: JSON.stringify(payload), user: JSON.stringify(SESSION)});
  const r = await jfetch(`?${qs.toString()}`, {method:'GET'});
  if(!r.ok) { alert('保存失敗: '+(r.error||'')); return; }
  alert('保存しました（注番: '+(r.data?.po_id||payload['注番'])+'）');
  loadDashboard();
});

/* ========= SHIP (出荷予定) ========= */
$('#btnShipImport')?.addEventListener('click', ()=> $('#fileShip').click());
$('#fileShip')?.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const buf = await f.arrayBuffer();
  const wb = XLSX.read(buf);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
  const required = ['得意先','図番','機種','商品名','数量','送り先','注番','備考'];
  const head = Object.keys(rows[0]||{});
  const ok = required.every(h=> head.includes(h));
  if(!ok){ alert('ヘッダ不一致: '+required.join('、')); return; }
  const r = rows[0];
  $('#s_tokui').value=r['得意先']||''; $('#s_zuban').value=r['図番']||''; $('#s_kishu').value=r['機種']||'';
  $('#s_shohin').value=r['商品名']||''; $('#s_qty2').value=r['数量']||''; $('#s_okurisaki').value=r['送り先']||'';
  $('#s_chuban').value=r['注番']||''; $('#s_biko').value=r['備考']||'';
  alert(`出荷予定：${rows.length} 行を読み込みました（先頭行をフォームに反映）。`);
});
$('#btnSchedule')?.addEventListener('click', async ()=>{
  const po_id = $('#s_chuban').value.trim(); // 注番
  if(!po_id){ alert('注番を入力してください'); return; }
  const extra = {
    '得意先': $('#s_tokui').value.trim(),
    '図番': $('#s_zuban').value.trim(),
    '機種': $('#s_kishu').value.trim(),
    '商品名': $('#s_shohin').value.trim(),
    '送り先': $('#s_okurisaki').value.trim(),
    '注番': po_id,
    '備考': $('#s_biko').value.trim()
  };
  const qty = Number($('#s_qty2').value||0);
  const dateIso = new Date().toISOString().slice(0,10);
  const qs = new URLSearchParams({action:'scheduleShipment', po_id, dateIso, qty, user: JSON.stringify(SESSION), extra: JSON.stringify(extra)});
  const r = await jfetch(`?${qs.toString()}`, {method:'GET'});
  if(!r.ok){ alert('保存失敗: '+(r.error||'')); return; }
  alert('出荷予定を保存しました（ID: '+(r.data?.ship_id||'')+'）');
  loadDashboard();
});

/* ========= SCAN (OK/NG wajib) ========= */
function openScanDialog(po){
  const ok = prompt(`注番: ${po}\nOK品 数量を入力してください`, '0');
  if(ok===null) return;
  const ng = prompt('不良品 数量を入力してください', '0');
  if(ng===null) return;
  const proc = prompt('工程（ST:xxx または 工程名）を入力してください', '検査中')||'検査中';

  const payload = { po_id:po, process:proc, ok_qty:Number(ok||0), ng_qty:Number(ng||0) };
  commitScan(payload);
}
async function commitScan(payload){
  const qs = new URLSearchParams({action:'setProcess', payload: JSON.stringify(payload), user: JSON.stringify(SESSION)});
  const r = await jfetch(`?${qs.toString()}`, {method:'GET'});
  if(!r.ok){ alert('登録失敗: '+(r.error||'')); return; }
  alert('登録しました');
  loadDashboard();
}

/* ========= Defect Chart (工程別 不良品) ========= */
let chDefect=null;
async function renderDefectChart(){
  try{
    const r = await jfetch(`?action=defectsByProcess`);
    const arr = r.ok ? (r.data||[]) : [];
    const labels = arr.length? arr.map(x=>x.process) : ['データなし'];
    const data = arr.length? arr.map(x=>x.ng) : [0];
    const ctx = document.getElementById('chDefectProc').getContext('2d');
    if(chDefect) chDefect.destroy();
    chDefect = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{ label:'不良品 数量', data }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
    });
  }catch(e){
    console.warn('defect chart err', e);
  }
}

/* ========= initial ========= */
document.addEventListener('DOMContentLoaded', ()=>{
  // tunjukkan login lebih dulu
});
