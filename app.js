/* ===========================
  ERP Frontend
   =========================== */
const API_BASE = "https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec"; // << ganti
const API_KEY  = ""; // optional; kalau di backend diisi

// ===== Utilities =====
const $ = (q,el=document)=> el.querySelector(q);
const $$= (q,el=document)=> [...el.querySelectorAll(q)];
const fmt = (d)=> d? new Date(d).toLocaleString('ja-JP'):'';
const qs  = (obj)=> Object.entries(obj).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const normalizeProc = (s)=> {
  s = String(s||'').trim();
  // normalisasi typo: レーサ加工 → レザー加工
  s = s.replace('レーサ加工','レザー加工');
  return s || '未設定';
};
const statusToBadge = (s)=>{
  s = String(s||'').trim();
  const icon = (i)=> `<i class="${i}"></i>`;
  if(/OK|良|合格/i.test(s))              return `<span class="badge st-ok">${icon('fa-solid fa-check')}${s}</span>`;
  if(/NG|不良|異常|不適合/i.test(s))       return `<span class="badge st-ng">${icon('fa-solid fa-triangle-exclamation')}${s}</span>`;
  if(/出荷準備/.test(s))                 return `<span class="badge st-ready">${icon('fa-solid fa-box-open')}${s}</span>`;
  if(/検査済/.test(s))                   return `<span class="badge st-inspected">${icon('fa-regular fa-circle-check')}${s}</span>`;
  if(/出荷済/.test(s))                   return `<span class="badge st-shipped">${icon('fa-solid fa-truck')}${s}</span>`;
  if(/生産開始|進行|WIP|加工|組立|検査/.test(s)) return `<span class="badge st-other">${icon('fa-regular fa-clock')}${s}</span>`;
  return `<span class="badge st-other">${icon('fa-regular fa-clock')}${s||'—'}</span>`;
};
const procToChip = (p)=>{
  p = normalizeProc(p);
  const ic = (i)=> `<i class="${i}"></i>`;
  if(/レザー加工|レーザー/.test(p))  return `<span class="chip p-laser">${ic('fa-solid fa-bolt')}${p}</span>`;
  if(/曲げ|曲げ加工|曲げ工程/.test(p))  return `<span class="chip p-bend">${ic('fa-solid fa-wave-square')}${p}</span>`;
  if(/プレス|打抜|外作/.test(p))     return `<span class="chip p-press">${ic('fa-solid fa-compass-drafting')}${p}</span>`;
  if(/組立/.test(p))                return `<span class="chip p-assembly">${ic('fa-solid fa-screwdriver-wrench')}${p}</span>`;
  if(/検査/.test(p))                return `<span class="chip p-inspection">${ic('fa-regular fa-square-check')}${p}</span>`;
  return `<span class="chip p-other">${ic('fa-regular fa-square')}${p}</span>`;
};

// ===== API =====
async function apiGet(path, params={}){
  const url = `${API_BASE}?${qs({action:path, ...params})}`;
  const r = await fetch(url, {method:'GET', mode:'cors', cache:'no-store'});
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||'API error');
  return j.data;
}
async function apiPost(action, payload={}){
  const r = await fetch(API_BASE, {
    method:'POST', mode:'cors',
    headers:{'Content-Type':'text/plain'},
    body: JSON.stringify({ action, apiKey:API_KEY, ...payload })
  });
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||'API error');
  return j.data;
}

// ===== State (login sederhana) =====
let CURRENT_USER = null;
function setUser(u){
  CURRENT_USER = u;
  $('#userInfo').textContent = u? `${u.role} / ${u.department}` : '';
  // show menus when logged-in
  const ids = ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToInvPage','btnToFinPage','btnToInvoice','btnToCharts','ddSetting'];
  ids.forEach(id => u ? $('#'+id).classList.remove('hidden') : $('#'+id).classList.add('hidden'));
  if(!u){ show('authView'); return; }
  // default to dashboard
  show('pageDash'); refreshAll();
}
function show(id){
  const pages = ['authView','pageDash','pageSales','pagePlan','pageShip','pageInventory','pageFinished','pageInvoice','pageCharts'];
  pages.forEach(p => $('#'+p)?.classList.add('hidden'));
  $('#'+id)?.classList.remove('hidden');
}

// ===== Render: Orders table =====
async function loadOrders(){
  const list = await apiGet('listOrders');
  const q = ($('#searchQ').value||'').trim().toLowerCase();
  const rows = list.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));

  const tb = $('#tbOrders'); tb.innerHTML = '';
  for(const r of rows){
    const tr = document.createElement('tr');
    const po = r.po_id || '';
    const cust = r['得意先'] || '';
    const hin = r['品名'] || '';
    const part = r['品番'] || '';
    const zuban = r['図番'] || '';
    const statusHtml = statusToBadge(r.status);
    const procHtml = procToChip(r.current_process);
    const upd = fmt(r.updated_at);
    const by  = r.updated_by || '';

    tr.innerHTML = `
      <td><div><div class="s muted">注番</div><div><b>${po}</b></div><div class="muted s">${cust||'—'}</div></div></td>
      <td>${hin||'—'}</td>
      <td class="center">${part||'—'}</td>
      <td class="center">${zuban||'—'}</td>
      <td class="center">${statusHtml}</td>
      <td class="center">${procHtml}</td>
      <td class="center">${upd||'—'}</td>
      <td class="center">${by||'—'}</td>
      <td class="center">
        <div class="row">
          <button class="btn ghost btn-edit" data-po="${po}"><i class="fa-regular fa-pen-to-square"></i> 更新</button>
          <button class="btn ghost btn-scan" data-po="${po}"><i class="fa-solid fa-qrcode"></i> スキャン</button>
        </div>
      </td>
    `;
    tb.appendChild(tr);
  }

  // actions
  $$('.btn-edit', tb).forEach(b => b.addEventListener('click', e=>{
    const po = e.currentTarget.dataset.po;
    openHistory(po); // contoh: tampilkan riwayat. Bisa diarahkan ke edit form juga.
  }));
  $$('.btn-scan', tb).forEach(b => b.addEventListener('click', e=>{
    const po = e.currentTarget.dataset.po;
    openScanDialog(po);
  }));
}

// ===== Dashboard cards =====
async function loadStats(){
  const s = await apiGet('stock');
  $('#statFinished').textContent = s.finishedStock ?? 0;
  $('#statReady').textContent    = s.ready ?? 0;
  $('#statShipped').textContent  = s.shipped ?? 0;

  const today = await apiGet('todayShip');
  const ul = $('#listToday'); ul.innerHTML = '';
  if(!today.length){ ul.innerHTML = `<div class="muted s">なし</div>`; }
  else today.forEach(x=>{
    const li = document.createElement('div');
    li.innerHTML = `<div class="row"><span class="badge st-ready"><i class="fa-solid fa-truck"></i>${x.scheduled_date?.slice(0,10)||''}</span> <b>${x.po_id}</b> × ${x.qty||0}</div>`;
    ul.appendChild(li);
  });

  const loc = await apiGet('locSnapshot');
  const grid = $('#gridProc'); grid.innerHTML = '';
  Object.entries(loc).forEach(([k,v])=>{
    const chip = document.createElement('span');
    chip.innerHTML = procToChip(k)+`<span class="muted s" style="margin-left:.35rem">${v}</span>`;
    grid.appendChild(chip);
  });
}

// ===== Scan dialog (QR per station) =====
let _scanStream=null, _scanTimer=null;
function openScanDialog(po){
  $('#dlgScan').showModal();
  $('#scanPO').textContent = po;
  $('#scanResult').textContent = '';
}
$('#btnScanClose').addEventListener('click', stopScan);
$('#btnScanStart').addEventListener('click', startScan);

async function startScan(){
  const video = $('#scanVideo'), canvas = $('#scanCanvas');
  try{
    _scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject = _scanStream; await video.play();
    _scanTimer = setInterval(async ()=>{
      const w = video.videoWidth, h=video.videoHeight;
      if(!w || !h) return;
      canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d'); ctx.drawImage(video,0,0,w,h);
      const img=ctx.getImageData(0,0,w,h);
      const code = jsQR(img.data, w, h);
      if(code && code.data){
        const text = String(code.data||'').trim();
        $('#scanResult').textContent = text;
        // Format: ST:工程名  (contoh: ST:レザー加工)
        if(/^ST:/i.test(text)){
          const proc = normalizeProc(text.replace(/^ST:/i,'').trim());
          const po = $('#scanPO').textContent;
          await apiPost('setProcess',{ po_id:po, updates:{ current_process:proc, status:'進行', note:'scan' }, user:CURRENT_USER });
          stopScan();
          await loadOrders(); await loadStats();
          $('#scanResult').textContent = `工程更新: ${proc}`;
        }
      }
    }, 350);
  }catch(err){
    $('#scanResult').textContent = 'カメラが使えません: '+err.message;
  }
}
function stopScan(){
  if(_scanTimer){ clearInterval(_scanTimer); _scanTimer=null; }
  if(_scanStream){ _scanStream.getTracks().forEach(t=>t.stop()); _scanStream=null; }
  $('#dlgScan').close();
}

// ===== History (optional) =====
async function openHistory(po){
  const body = $('#histBody'); body.innerHTML = '';
  const rows = await apiGet('history', {po_id:po});
  rows.forEach(r=>{
    const div = document.createElement('div');
    div.className='row';
    div.innerHTML = `
      <span class="badge">${fmt(r.timestamp)||''}</span>
      ${statusToBadge(r.new_status)} ${procToChip(r.new_process)}
      <span class="muted s">OK:${r.ok_qty||0} / NG:${r.ng_qty||0}</span>
      <span class="muted s">${r.updated_by||''}</span>
    `;
    body.appendChild(div);
  });
  $('#dlgHistory').showModal();
}

// ===== Sales / Plan / Ship (minimal wiring agar tidak putus) =====
$('#btnSchedule').addEventListener('click', async ()=>{
  const po = $('#s_po').value.trim(), date = $('#s_date').value, qty = Number($('#s_qty').value||0);
  if(!po || !date) return alert('注番 と 日付 を入力してください');
  await apiPost('scheduleShipment', { po_id:po, dateIso:date, qty, user:CURRENT_USER });
  $('#s_po').value=''; $('#s_date').value=''; $('#s_qty').value='';
  await loadStats();
  alert('出荷予定を登録しました');
});

// ===== Search / Nav =====
$('#searchQ').addEventListener('input', ()=> loadOrders());

$('#btnToDash').addEventListener('click',()=>{show('pageDash'); refreshAll();});
$('#btnToSales').addEventListener('click',()=> show('pageSales'));
$('#btnToPlan').addEventListener('click',()=> show('pagePlan'));
$('#btnToShip').addEventListener('click',()=> show('pageShip'));
$('#btnToInvPage').addEventListener('click',()=> show('pageInventory'));
$('#btnToFinPage').addEventListener('click',()=> show('pageFinished'));
$('#btnToInvoice').addEventListener('click',()=> show('pageInvoice'));
$('#btnToCharts').addEventListener('click',()=> show('pageCharts'));

$('#btnRefresh').addEventListener('click', refreshAll);
async function refreshAll(){ await Promise.all([loadOrders(), loadStats()]); }

// ===== Auth (login/admin minimal) =====
$('#btnLogin').addEventListener('click', async ()=>{
  const u=$('#inUser').value.trim(), p=$('#inPass').value.trim();
  try{
    const me = await apiPost('login',{username:u,password:p});
    setUser(me);
  }catch(e){ alert('ログイン失敗: '+e.message); }
});
$('#btnLogout').addEventListener('click', ()=> setUser(null));

// ===== Init =====
document.addEventListener('DOMContentLoaded', ()=>{
  // Tampilkan label menu sesuai permintaan (sudah ada di HTML)
  // Corner brand sudah fixed oleh CSS.
  // Hide all but auth at start
  setUser(null);
});
