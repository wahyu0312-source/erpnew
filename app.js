/* ===== CONFIG ===== */
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec'; // e.g. https://script.google.com/macros/s/AKfy.../exec
const API = (action, params={}) => {
  const sp = new URLSearchParams({ action, ...params });
  // JSONP fallback => <script src="...&callback=__cb">
  return new Promise((res, rej)=>{
    const cb = '__cb' + Math.random().toString(36).slice(2);
    sp.set('callback', cb);
    window[cb] = (data)=>{ delete window[cb]; script.remove(); if(data.ok) res(data); else rej(data); };
    const script = document.createElement('script');
    script.src = `${WEB_APP_URL}?${sp.toString()}`;
    script.onerror = ()=>{ delete window[cb]; script.remove(); rej({ok:false, error:'network'}); };
    document.body.appendChild(script);
  });
};

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const state = {user:null, cache:{}};

/* ===== NAV ===== */
function showPage(id){
  ['authView','pageDash','pageSales','pagePlan','pageShip','pageInv','pageFin','pageCharts']
    .forEach(i => qs('#'+i).classList.add('hidden'));
  qs('#'+id)?.classList.remove('hidden');
}
function setRoleNav(role){
  // semua lihat dashboard
  ['btnToDash'].forEach(i=>qs('#'+i).classList.remove('hidden'));
  if(['admin','manager','営業'].includes(role)){ qs('#btnToSales').classList.remove('hidden'); qs('#btnToInvoice').classList.remove('hidden'); }
  if(['admin','manager','生産管理部','生産技術'].includes(role)){ qs('#btnToPlan').classList.remove('hidden'); qs('#btnToShip').classList.remove('hidden'); qs('#btnToInv').classList.remove('hidden'); qs('#btnToFin').classList.remove('hidden'); }
  if(['admin','manager','生産技術','製造部','検査部'].includes(role)){ qs('#btnToCharts').classList.remove('hidden'); }
  // admin-only setting
  if(role==='admin') qs('#ddSetting').classList.remove('hidden');
}

/* ===== LOGIN ===== */
async function login(){
  const u = qs('#inUser').value.trim(), p = qs('#inPass').value.trim();
  const r = await API('login',{user:u, pass:p});
  state.user = r.data.profile;
  qs('#userInfo').textContent = `${state.user.name} / ${state.user.dept}`;
  setRoleNav(state.user.role);
  await refreshAll();
  showPage('pageDash');
}
qs('#btnLogin').onclick = ()=> login().catch(e=>alert('ログイン失敗'));

qs('#btnLogout').onclick = ()=>{
  state.user=null; location.reload();
};

qs('#btnNewUser').onclick = async ()=>{
  if(!state.user || state.user.role!=='admin') return alert('adminのみ');
  const who = qs('#nuUser').value.trim(), pass=qs('#nuPass').value.trim();
  const role = qs('#nuRole').value, dept=qs('#nuDept').value;
  const r = await API('addUser',{who, pass, role, dept, by:state.user.username}).catch(e=>alert('失敗'));
  if(r?.ok) alert('追加しました');
};

/* ===== LOAD DASHBOARD ===== */
async function refreshAll(){
  const r = await API('all');
  const {orders, inv, fin, ship} = r.data;
  state.cache = {orders, inv, fin, ship};

  // orders table
  const tb = qs('#tbOrders'); tb.innerHTML='';
  const PROC_ALIAS = p => p==='外作加工' ? '外注加工/組立' : p; // rename
  orders.forEach(o=>{
    const status = String(o.status||'').trim();
    const proc = PROC_ALIAS(String(o.current_process||'').trim());
    const badgeSt =
      status.includes('出荷') ? 'st-shipped' :
      status.includes('検査') ? 'st-inspected' :
      status.includes('準備') ? 'st-ready' :
      status.includes('NG')   ? 'st-ng' : 'st-other';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div><b>${o.po_id||''}</b></div><div class="muted s">${o['得意先']||''}</div></td>
      <td class="hide-sm">${o['品名']||''}</td>
      <td class="hide-sm">${o['品番']||''} / ${o['図番']||''}</td>
      <td><span class="badge ${badgeSt}">${status||'-'}</span></td>
      <td><span class="chip p-other">${proc||'-'}</span></td>
      <td class="hide-sm">${o.updated_at||''}</td>
      <td class="hide-sm">${o.updated_by||''}</td>
      <td class="right">
        <button class="btn ghost s btn-manual">手動更新</button>
        <button class="btn ghost s btn-scan">スキャン</button>
      </td>`;
    // actions
    tr.querySelector('.btn-manual').onclick = ()=> openManual(o.po_id);
    tr.querySelector('.btn-scan').onclick   = ()=> openScan(o.po_id);
    tb.appendChild(tr);
  });

  // stats
  qs('#statFinished').textContent = fin.reduce((a,b)=>a+(Number(b['完成数']||0)),0);
  qs('#statReady').textContent    = orders.filter(o=>String(o.status||'').includes('準備')).length;
  qs('#statShipped').textContent  = orders.filter(o=>String(o.status||'').includes('出荷済')).length;

  // today shipments
  const today = new Date().toISOString().slice(0,10);
  const list = ship.filter(s => (s.scheduled_date||'').startsWith(today));
  qs('#listToday').innerHTML = list.length
    ? list.map(x=>`<div>• ${x.po_id} / ${x.qty}</div>`).join('')
    : '<span class="muted">なし</span>';

  // WIP chips (current process grouping)
  const byProc = {};
  orders.forEach(o=>{
    const p = PROC_ALIAS(o.current_process||'-');
    byProc[p]=(byProc[p]||0)+1;
  });
  const g = qs('#gridProc'); g.innerHTML='';
  Object.entries(byProc).forEach(([k,v])=>{
    const el = document.createElement('span');
    el.className = 'chip p-other';
    el.textContent = `${k}  ${v}`;
    g.appendChild(el);
  });

  // charts simple: trigger only when page opened
}

/* ==== Manual Update ==== */
async function openManual(po){
  const dlg = qs('#dlgManual'); qs('#mPO').textContent = po;
  // station list
  const st = await API('stationQR'); const sel = qs('#mProc');
  sel.innerHTML = (st.data.stations||[]).map(s=>`<option>${s}</option>`).join('');
  dlg.showModal();
  qs('#mClose').onclick = ()=> dlg.close();
  qs('#mSave').onclick = async ()=>{
    const proc = qs('#mProc').value, status = qs('#mStatus').value;
    const ok = qs('#mOK').value||0, ng = qs('#mNG').value||0;
    await API('updateProcess',{po_id:po, process:proc, status, ok, ng, user:state.user?.username||'system'})
      .catch(()=>alert('更新失敗'));
    dlg.close();
    refreshAll();
  };
}

/* ==== Scan ==== */
let scanInt=null, stream=null;
async function openScan(po){
  const dlg = qs('#dlgScan'); dlg.showModal(); qs('#scanPO').textContent=po;
  const video = qs('#scanVideo'), canvas = qs('#scanCanvas'), ctx = canvas.getContext('2d');
  const start = async ()=>{
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject = stream; await video.play();
    scanInt = setInterval(()=>{
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const img = ctx.getImageData(0,0,canvas.width,canvas.height);
      const code = jsQR(img.data, canvas.width, canvas.height);
      if(code && code.data){
        qs('#scanResult').textContent = code.data;
        // format: ST:工程名  /  PO:ID
        const m = /ST:(.+)/.exec(code.data);
        const proc = m ? m[1].trim() : code.data;
        API('updateProcess',{po_id:po, process:proc, status:'進行', ok:0, ng:0, user:state.user?.username||'scan'})
          .then(()=>refreshAll());
      }
    }, 600);
  };
  qs('#btnScanStart').onclick = start;
  qs('#btnScanClose').onclick = ()=>{
    if(scanInt) clearInterval(scanInt);
    if(stream) stream.getTracks().forEach(t=>t.stop());
    dlg.close();
  };
}

/* ==== Station QR (generate) ==== */
qs('#miStationQR').onclick = async ()=>{
  const r = await API('stationQR');
  const wrap = qs('#qrWrap'); wrap.innerHTML='';
  r.data.stations.forEach(st=>{
    const div = document.createElement('div'); div.style.padding='10px';
    const el = document.createElement('div'); wrap.appendChild(div); div.appendChild(el);
    new QRCode(el,{ text:`ST:${st}`, width:128, height:128 });
    const cap = document.createElement('div'); cap.style.textAlign='center'; cap.textContent = st; div.appendChild(cap);
  });
  qs('#dlgStationQR').showModal();
};

/* ==== Sales, Plan, Ship minimal flows ==== */
qs('#btnSalesSave').onclick = async ()=>{
  const p = {
    so_date: qs('#so_date').value, customer: qs('#so_cust').value, item_name: qs('#so_item').value,
    part: qs('#so_part').value, drawing: qs('#so_drw').value, serial: qs('#so_sei').value,
    qty: qs('#so_qty').value, req_date: qs('#so_req').value, note: qs('#so_note').value
  };
  const r = await API('createSO', p).catch(()=>alert('保存失敗'));
  if(r?.ok) alert('保存しました');
};
qs('#btnPromote').onclick = async ()=>{
  const p = {
    customer: qs('#so_cust').value, item_name: qs('#so_item').value, part: qs('#so_part').value, drawing: qs('#so_drw').value,
    serial: qs('#so_sei').value, qty: qs('#so_qty').value, by: state.user?.username||'system'
  };
  const r = await API('promotePlan', p).catch(()=>alert('変換失敗'));
  if(r?.ok){ alert('計画作成: '+r.data.po_id); refreshAll(); }
};

qs('#btnCreateOrder').onclick = async ()=>{
  const p = {
    customer: qs('#c_tokui').value, item_name: qs('#c_hinmei').value, part: qs('#c_hinban').value,
    drawing: qs('#c_zuban').value, serial: qs('#c_sei').value, qty: qs('#c_qty').value, by: state.user?.username||'system'
  };
  const r = await API('promotePlan', p).catch(()=>alert('保存失敗'));
  if(r?.ok){ alert('保存しました'); refreshAll(); }
};

qs('#btnSchedule').onclick = async ()=>{
  const p = { po_id: qs('#s_po').value, scheduled_date: qs('#s_date').value, qty: qs('#s_qty').value, note: qs('#s_note').value, by: state.user?.username||'system' };
  const r = await API('scheduleShip', p).catch(()=>alert('保存失敗'));
  if(r?.ok){ alert('保存しました'); refreshAll(); }
};

qs('#btnExportShip').onclick = async ()=>{
  const r = await API('exportToday');
  const rows = r.data.rows || [];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'ShipToday');
  XLSX.writeFile(wb, 'ShipToday.xlsx');
};
qs('#btnExportOrders').onclick = ()=>{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.cache.orders||[]), 'Orders');
  XLSX.writeFile(wb, 'Orders.xlsx');
};

/* ==== NAV bindings ==== */
qs('#btnToDash').onclick = ()=> showPage('pageDash');
qs('#btnToSales').onclick = ()=> showPage('pageSales');
qs('#btnToPlan').onclick  = ()=> showPage('pagePlan');
qs('#btnToShip').onclick  = ()=> showPage('pageShip');
qs('#btnToInv').onclick   = ()=> showPage('pageInv');
qs('#btnToFin').onclick   = ()=> showPage('pageFin');
qs('#btnToInvoice').onclick = ()=> alert('請求書は後続拡張');
qs('#btnToCharts').onclick  = ()=> showPage('pageCharts');
qs('#btnRefresh').onclick   = ()=> refreshAll();

/* ==== Weather (no key, Open-Meteo + BigDataCloud) ==== */
(async function weatherInit(){
  const elCity=qs('#wxCity'), elTemp=qs('#wxTemp');
  const fallback={lat:35.6809591, lon:139.7673068, city:'東京'};
  function getGeo(){ return new Promise(r=>{ if(!navigator.geolocation) return r(null);
    navigator.geolocation.getCurrentPosition(p=>r({lat:p.coords.latitude, lon:p.coords.longitude}), _=>r(null), {enableHighAccuracy:false, timeout:5000, maximumAge:300000}); });
  }
  async function getCity(lat,lon){ try{ const u=`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ja`; const j=await fetch(u).then(r=>r.json()); return j.city||j.locality||j.principalSubdivision||'東京'; }catch{ return '東京'; } }
  async function getWeather(lat,lon){ const u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`; const j=await fetch(u).then(r=>r.json()); return j.current_weather; }
  try{ const g=await getGeo(); const lat=g?.lat??fallback.lat, lon=g?.lon??fallback.lon; const [city,cw]=await Promise.all([getCity(lat,lon), getWeather(lat,lon)]); elCity.textContent=city; elTemp.textContent=(cw && typeof cw.temperature==='number')? Math.round(cw.temperature)+'℃' : '--℃'; }catch{ elCity.textContent=fallback.city; elTemp.textContent='--℃'; }
})();

/* ==== SW for fast load & offline data cache ==== */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

/* ==== Auto start ==== */
document.addEventListener('DOMContentLoaded', ()=> {
  // jika sudah login sebelumnya, bisa di-restore (opsional localStorage)
});
