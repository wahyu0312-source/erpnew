/* ================= CONFIG ================= */
const API_BASE = 'https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec'; // <-- ganti ke /exec

/* ================= Helpers ================= */
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const fmtDate = s => s ? new Date(s).toLocaleString('ja-JP') : '';
const num = v => (v==null||v==='')?0:Number(v);

/* API */
function apiGet(params){
  const u = new URL(API_BASE);
  Object.entries(params||{}).forEach(([k,v])=> u.searchParams.set(k,v));
  return fetch(u.toString()).then(r=>r.json()).then(j=>{ if(!j.ok) throw new Error(j.error||'HTTP'); return j; });
}
function apiPost(action, body){
  return fetch(API_BASE, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body })
  }).then(async r=>{
    let j; try{ j = await r.json(); }catch(e){ throw new Error('API not JSON. Cek Deploy Web App /exec'); }
    if(!j.ok) throw new Error(j.error || `API error: ${action}`);
    return j;
  });
}

/* ================= SWR-mini for batch ================= */
const swr = { etag:null, data:null, inflight:null, last:0 };
async function fetchBatch(){
  if(swr.inflight) return swr.inflight;
  const url = new URL(API_BASE); url.searchParams.set('action','batch'); if(swr.etag) url.searchParams.set('since',swr.etag);
  const p = fetch(url.toString()).then(r=>r.json()).then(j=>{
    if(!j.ok) throw new Error(j.error||'HTTP');
    if(j.notModified) return swr.data;
    swr.etag=j.etag||null; swr.data=j.data; swr.last=Date.now(); return j.data;
  }).finally(()=> swr.inflight=null);
  swr.inflight = p; return p;
}
function revalidate(){ fetchBatch().then(renderAll).catch(e=>console.warn(e)); }

/* ================= Auth & Users ================= */
let SESSION = null;
function onLogin(){
  const username = $('#inUser').value.trim();
  const password = $('#inPass').value.trim();
  apiPost('login',{ username,password }).then(({data})=>{
    SESSION = data; localStorage.setItem('session', JSON.stringify(data));
    $('#userInfo').textContent = `${data.full_name||data.username} / ${data.department||data.role||''}`;
    show('pageDash'); revalidate(); enableMenus();
  }).catch(e=> alert(e.message));
}
function onAddUser(){
  const username = $('#nuUser').value.trim();
  const password = $('#nuPass').value.trim();
  const full_name = $('#nuName').value.trim();
  const department = $('#nuDept').value;
  const role = $('#nuRole').value;
  if(!username || !password){ alert('ユーザー名/パスワード必須'); return; }
  apiPost('adduser',{ username,password,full_name,department,role })
    .then(()=>{ alert('ユーザー追加しました'); $('#nuUser').value=''; $('#nuPass').value=''; })
    .catch(e=> alert(e.message));
}
function onLogout(){ localStorage.removeItem('session'); SESSION=null; show('authView'); disableMenus(); }

/* ================= Navigation ================= */
const PAGES = ['authView','pageDash','pageSales','pagePlan','pageShip','pageInventory','pageFinished','pageInvoice','pageCharts'];
function show(id){ PAGES.forEach(p=> $('#'+p)?.classList.add('hidden')); $('#'+id)?.classList.remove('hidden'); }
function enableMenus(){ $$('#btnToDash,#btnToSales,#btnToPlan,#btnToShip,#btnToInvPage,#btnToFinPage,#btnToInvoice,#btnToCharts,#ddSetting').forEach(b=> b?.classList.remove('hidden')); }
function disableMenus(){ $$('#btnToDash,#btnToSales,#btnToPlan,#btnToShip,#btnToInvPage,#btnToFinPage,#btnToInvoice,#btnToCharts,#ddSetting').forEach(b=> b?.classList.add('hidden')); }
function wireNav(){
  $('#btnToDash')?.addEventListener('click',()=>{ show('pageDash'); });
  $('#btnToSales')?.addEventListener('click',()=> show('pageSales'));
  $('#btnToPlan')?.addEventListener('click',()=> show('pagePlan'));
  $('#btnToShip')?.addEventListener('click',()=> show('pageShip'));
  $('#btnToInvPage')?.addEventListener('click',()=> show('pageInventory'));
  $('#btnToFinPage')?.addEventListener('click',()=> show('pageFinished'));
  $('#btnToInvoice')?.addEventListener('click',()=> show('pageInvoice'));
  $('#btnToCharts')?.addEventListener('click',()=>{ show('pageCharts'); /* chart sudah diinisialisasi oleh inline script mu */ });
}

/* ================= Renderers ================= */
function renderOrders(){
  const data = swr.data?.tickets||[];
  const q = ($('#searchQ').value||'').toLowerCase();
  const rows = data.filter(r=> JSON.stringify(r).toLowerCase().includes(q));
  const tb = $('#tbOrders'); tb.innerHTML = '';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${r['注番']||''}</b><div class="muted s">${r['得意先']||''}</div></td>
      <td>${r['商品名']||''}</td>
      <td>${r['機種']||''}</td>
      <td>${r['図番']||''}</td>
      <td>${r['状態']||''}</td>
      <td>${r['工程']||''}</td>
      <td>${fmtDate(r['更新日時'])}</td>
      <td>${r['更新者']||''}</td>
      <td><button class="btn ghost s" data-po="${r['注番']||''}">更新</button></td>`;
    tb.appendChild(tr);
  });
  // bind update
  tb.querySelectorAll('button[data-po]').forEach(b=>{
    b.addEventListener('click',()=>{
      const po = b.getAttribute('data-po');
      const row = rows.find(x=> String(x['注番'])===String(po)) || {};
      openUpdateDialog(row);
    });
  });

  // statistik ringkas untuk card di dashboard
  const finished = (swr.data?.finished||[]).length;
  $('#statFinished').textContent = finished;
  const shipToday = (swr.data?.shipments||[]).filter(x=>{
    const d=x['出荷日']; if(!d) return false;
    const dd = new Date(d); const t=new Date(); return dd.toDateString()===t.toDateString();
  });
  $('#listToday').innerHTML = shipToday.length? shipToday.map(x=> `<div>${x['注番']} / ${x['商品名']} / ${x['数量']}</div>`).join('') : '<div class="muted">なし</div>';

  // grid proses (jumlah WIP per 状態)
  const by = {};
  rows.forEach(r=>{ const k=r['状態']||'-'; by[k]=(by[k]||0)+1; });
  const chips = Object.entries(by).map(([k,v])=> `<div class="chip">${k}<span class="pill">${v}</span></div>`);
  $('#gridProc').innerHTML = chips.join('');
}
function renderInventory(){
  const tb = $('#tbInv'); tb.innerHTML = '';
  const q = ($('#invQ').value||'').toLowerCase();
  const rows = (swr.data?.tickets||[]).filter(r=>{
    const isStock = /完成|出荷準備|検査中|在庫/i.test(r['状態']||''); // proxy
    return isStock && JSON.stringify(r).toLowerCase().includes(q);
  });
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${r['注番']||''}</b><div class="muted s">${r['得意先']||''}</div></td>
      <td>${r['商品名']||''}</td><td>${r['機種']||''}</td><td>${r['図番']||''}</td>
      <td>${r['状態']||''}</td><td>${r['工程']||''}</td>
      <td>${fmtDate(r['更新日時'])}</td><td>${r['更新者']||''}</td>`;
    tb.appendChild(tr);
  });
}
function renderFinished(){
  const tb = $('#tbFin'); tb.innerHTML = '';
  const q = ($('#finQ').value||'').toLowerCase();
  const rows = (swr.data?.tickets||[]).filter(r=>{
    const isFin = /完成|出荷準備|検査済|出荷済/i.test(r['状態']||'');
    return isFin && JSON.stringify(r).toLowerCase().includes(q);
  });
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${r['注番']||''}</b><div class="muted s">${r['得意先']||''}</div></td>
      <td>${r['商品名']||''}</td><td>${r['機種']||''}</td><td>${r['図番']||''}</td>
      <td>${r['状態']||''}</td><td>${r['工程']||''}</td>
      <td>${fmtDate(r['更新日時'])}</td><td>${r['更新者']||''}</td>`;
    tb.appendChild(tr);
  });
}
function renderShipPageTable(){ /* (placeholder untuk listing penuh Shipments jika nanti dibutuhkan) */ }

/* Render all sections that are visible or have summary */
function renderAll(){
  renderOrders(); renderInventory(); renderFinished();
}

/* ================= Actions ================= */
window.openUpdateDialog = function(row){
  const ok = Number(prompt(`OK数量 (現在 ${row['OK']||0})`,'0')||0);
  const ng = Number(prompt(`NG数量 (現在 ${row['NG']||0})`,'0')||0);
  const proc = prompt(`工程 (現在 ${row['工程']||''})`, row['工程']||'') || row['工程']||'';
  const st   = prompt(`状態 (完成/出荷準備/検査中 等; 現在 ${row['状態']||''})`, row['状態']||'') || row['状態']||'';
  const note = prompt('備考','')||'';
  apiPost('setprocess',{ po_id: row['注番'], updates:{ current_process:proc, status:st, ok_qty:ok, ng_qty:ng, note }, user: SESSION||{username:'system'} })
    .then(()=>{ alert('更新しました'); revalidate(); })
    .catch(e=> alert(e.message));
};

/* Export CSV ringkas */
function toCSV(rows){
  if(!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  return [headers.join(','), ...rows.map(r=> headers.map(h=> esc(r[h])).join(','))].join('\n');
}
function download(name, text){ const blob = new Blob([text], {type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1500); }
function exportOrdersCSV(){
  const rows = swr.data?.tickets||[];
  download('orders.csv', toCSV(rows));
}
function exportTodayShipCSV(){
  const rows = (swr.data?.shipments||[]).filter(x=>{
    const d=x['出荷日']; if(!d) return false;
    const dd=new Date(d); const t=new Date(); return dd.toDateString()===t.toDateString();
  });
  download('ship_today.csv', toCSV(rows));
}

/* ================= Station QR (menu Setting) ================= */
const PROCESSES = ['レーザ加工','曲げ加工','外枠組立','シャッター組立','シャッター溶接','コーキング','外枠塗装','組立（組立中）','組立（組立済）','外注','検査工程'];
function openStationQR(){
  const wrap = $('#qrWrap'); wrap.innerHTML='';
  PROCESSES.forEach(p=>{
    const div = document.createElement('div');
    div.style.padding='8px';
    div.innerHTML = `<div class="muted s" style="margin-bottom:6px">${p}</div><div id="qr_${p}"></div>`;
    wrap.appendChild(div);
    new QRCode(div.querySelector(`#qr_${CSS.escape(p)}`), { text:`ST:${p}`, width:160, height:160, correctLevel: QRCode.CorrectLevel.M });
  });
  $('#dlgStationQR').showModal();
}

/* ================= Init ================= */
function onReady(){
  // restore session
  try{ SESSION = JSON.parse(localStorage.getItem('session')||'null'); }catch(_){}
  if(SESSION){ $('#userInfo').textContent = `${SESSION.full_name||SESSION.username} / ${SESSION.department||''}`; show('pageDash'); enableMenus(); revalidate(); }
  else { show('authView'); }

  // Nav + buttons
  wireNav();
  $('#btnLogin')?.addEventListener('click', onLogin);
  $('#btnNewUser')?.addEventListener('click', onAddUser);
  $('#btnLogout')?.addEventListener('click', onLogout);

  $('#btnRefresh')?.addEventListener('click', revalidate);
  $('#btnExportOrders')?.addEventListener('click', exportOrdersCSV);
  $('#btnExportShip')?.addEventListener('click', exportTodayShipCSV);

  $('#searchQ')?.addEventListener('input', renderOrders);
  $('#invQ')?.addEventListener('input', renderInventory);
  $('#finQ')?.addEventListener('input', renderFinished);

  $('#miStationQR')?.addEventListener('click', openStationQR);

  // QR Scan dialog (aktifkan kamera saat klik Start)
  $('#btnScanStart')?.addEventListener('click', ()=>{
    const video = $('#scanVideo'), canvas=$('#scanCanvas'), result=$('#scanResult');
    navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }).then(stream=>{
      video.srcObject=stream; return video.play();
    }).then(()=>{
      const ctx = canvas.getContext('2d');
      const timer = setInterval(()=>{
        if(video.readyState!==video.HAVE_ENOUGH_DATA) return;
        canvas.width=video.videoWidth; canvas.height=video.videoHeight;
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const img = ctx.getImageData(0,0,canvas.width,canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if(code && code.data){
          result.textContent = '読み取り: '+code.data;
          clearInterval(timer);
          // contoh: ST:検査工程 → setProcess untuk PO yang sedang dipilih (pakai prompt)
          const po = prompt('更新するPOを入力'); if(!po){ stop(); return; }
          apiPost('setprocess',{ po_id:po, updates:{ current_process: code.data.replace(/^ST:/,''), status:'工程切替' }, user:SESSION })
            .then(()=>{ alert('更新しました'); revalidate(); stop(); $('#dlgScan').close(); })
            .catch(e=>{ alert(e.message); stop(); });
        }
      }, 300);
      function stop(){ try{ video.srcObject.getTracks().forEach(t=>t.stop()); }catch(_){ } }
      $('#btnScanClose')?.addEventListener('click', ()=>{ stop(); $('#dlgScan').close(); }, { once:true });
    }).catch(e=> alert('カメラ起動不可: '+(e.message||e)));
  });

  // Setting dropdown visibility by role
  if(SESSION?.role!=='admin'){ $('#ddSetting')?.classList.add('hidden'); }
}
document.addEventListener('DOMContentLoaded', onReady);
