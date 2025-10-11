/* =================================================
   JSONP Frontend (Optimized)
   - Dashboard status merge StatusLog
   - CRUD: 受注 / 生産計画 / 出荷予定
   - 操作: QR scanner + 手入力 (OK/NG/工程)
   - Import / Export / Print
   - Cuaca (Open-Meteo, cached)
   ================================================= */

/** Web App URL (akhiran /exec) */
const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

const $  = (q,el=document)=> el.querySelector(q);
const $$ = (q,el=document)=> [...el.querySelectorAll(q)];
const qs = (o)=> Object.entries(o).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const fmt = (d)=> d? new Date(d).toLocaleString("ja-JP"):"";
const normalizeProc = (s)=> String(s||"").trim()
  .replace("レーサ加工","レザー加工").replace("外作加工","外注加工/組立") || "未設定";

/* ---------- JSONP helper (NO CORS) ---------- */
function jsonp(action, params={}){
  return new Promise((resolve,reject)=>{
    const cb = "cb_" + Math.random().toString(36).slice(2);
    params = { ...params, action, callback: cb };
    const s = document.createElement("script");
    s.src = `${API_BASE}?${qs(params)}`;F
    let timeout = setTimeout(()=>{ cleanup(); reject(new Error("API timeout")); }, 20000);
    function cleanup(){ delete window[cb]; s.remove(); clearTimeout(timeout); }
    window[cb] = (resp)=>{
      cleanup();
      if(resp && resp.ok) resolve(resp.data);
      else reject(new Error((resp && resp.error) || "API error"));
    };
    s.onerror = ()=>{ cleanup(); reject(new Error("JSONP load error")); };
    document.body.appendChild(s);
  });
}

/* ---------- Simple MEM cache for API ---------- */
const apiCache = new Map();
async function cached(action, params={}, ttlMs=15000){
  const key = action + ":" + JSON.stringify(params||{});
  const hit = apiCache.get(key);
  const now = Date.now();
  if(hit && now-hit.t < ttlMs) return hit.v;
  const v = await jsonp(action, params);
  apiCache.set(key, {v, t: now});
  return v;
}

/* ---------- Badges ---------- */
const procToChip = (p)=>{
  p = normalizeProc(p);
  if(/レザー加工|レーザー/.test(p)) return `<span class="chip p-laser"><i class="fa-solid fa-bolt"></i>${p}</span>`;
  if(/曲げ/.test(p)) return `<span class="chip p-bend"><i class="fa-solid fa-wave-square"></i>${p}</span>`;
  if(/外注加工|加工/.test(p)) return `<span class="chip p-press"><i class="fa-solid fa-compass-drafting"></i>${p}</span>`;
  if(/組立/.test(p)) return `<span class="chip p-assembly"><i class="fa-solid fa-screwdriver-wrench"></i>${p}</span>`;
  if(/検査/.test(p)) return `<span class="chip p-inspection"><i class="fa-regular fa-square-check"></i>${p}</span>`;
  return `<span class="chip p-other"><i class="fa-regular fa-square"></i>${p||'—'}</span>`;
};
const statusToBadge = (s)=>{
  s = String(s||"");
  if(/組立中/.test(s)) return `<span class="badge"><i class="fa-solid fa-screwdriver-wrench"></i>${s}</span>`;
  if(/組立済/.test(s)) return `<span class="badge"><i class="fa-regular fa-circle-check"></i>${s}</span>`;
  if(/検査中/.test(s)) return `<span class="badge st-inspected"><i class="fa-regular fa-clipboard"></i>${s}</span>`;
  if(/検査済/.test(s)) return `<span class="badge st-inspected"><i class="fa-regular fa-circle-check"></i>${s}</span>`;
  if(/出荷準備/.test(s)) return `<span class="badge st-ready"><i class="fa-solid fa-box-open"></i>${s}</span>`;
  if(/出荷済/.test(s)) return `<span class="badge st-shipped"><i class="fa-solid fa-truck"></i>${s}</span>`;
  return `<span class="badge"><i class="fa-regular fa-clock"></i>${s||"—"}</span>`;
};

/* ---------- Auth & Role ---------- */
let CURRENT_USER = null;
const ROLE_MAP = {
  'admin': { pages:['pageDash','pageSales','pagePlan','pageShip'], nav:true },
  '営業': { pages:['pageSales','pageDash'], nav:true },
  '生産管理': { pages:['pagePlan','pageShip','pageDash'], nav:true },
  '生産管理部': { pages:['pagePlan','pageShip','pageDash'], nav:true },
  '製造': { pages:['pageDash'], nav:true },
  '検査': { pages:['pageDash'], nav:true }
};
function setUser(u){
  CURRENT_USER = u || null;
  $("#userInfo").textContent = u ? `${u.role} / ${u.department}` : "";
  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip"];
  pages.forEach(p => $("#"+p)?.classList.add("hidden"));
  // sembunyikan SEMUA menu kanan saat belum login
  ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToInvPage','btnToFinPage','btnToInvoice','ddSetting','weatherWrap'].forEach(id=> $("#"+id)?.classList.add("hidden"));
  if(!u){ $("#authView")?.classList.remove("hidden"); return; }
  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP['admin'];
  if(allow?.nav){
    if(allow.pages.includes('pageDash')) $("#btnToDash").classList.remove("hidden");
    if(allow.pages.includes('pageSales')) $("#btnToSales").classList.remove("hidden");
    if(allow.pages.includes('pagePlan')) $("#btnToPlan").classList.remove("hidden");
    if(allow.pages.includes('pageShip')) $("#btnToShip").classList.remove("hidden");
     if(allow?.nav){
  // ...existing show buttons...
  $("#weatherWrap").classList.remove("hidden");
  ensureWeather();
  loadMasters();                // <== tambah ini
}

    $("#ddSetting").classList.remove("hidden");
    $("#weatherWrap").classList.remove("hidden");
  }
  show("pageDash");
  refreshAll();
}

/* ---------- Nav ---------- */
function show(id){
  ["authView","pageDash","pageSales","pagePlan","pageShip"].forEach(p=>$("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}
$("#btnToDash").onclick=()=>{ show("pageDash"); refreshAll(); };
$("#btnToSales").onclick=()=>{ show("pageSales"); loadSales(); };
$("#btnToPlan").onclick =()=>{ show("pagePlan");  loadPlans(); };
$("#btnToShip").onclick =()=>{ show("pageShip");  loadShips(); };
$("#btnLogout").onclick  =()=> setUser(null);

/* ---------- Login ---------- */
$("#btnLogin").onclick = async ()=>{
  const u = $("#inUser").value.trim();
  const p = $("#inPass").value.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");
  try{
    await jsonp('ping');
    const me = await jsonp("login", { username:u, password:p });
    setUser(me);
  }catch(e){ alert("ログイン失敗: " + (e?.message || e)); }
};

/* ---------- Dashboard Orders + 操作 ---------- */
let ORDERS = [];
async function loadOrders(){
  ORDERS = await cached("listOrders");
  renderOrders();
  // setelah orders, muat panel shipment & cuaca
  loadShipsMini();
  ensureWeather();
}

/* Virtual render (windowed) untuk tabel besar */
function renderOrders(){
  const q = ($("#searchQ").value||"").trim().toLowerCase();
  const rows = ORDERS.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  const tb = $("#tbOrders"); tb.innerHTML = "";

  // windowing sederhana
  const chunk = 120; // rows per paint
  let i = 0;
  function paint(){
    const end = Math.min(i+chunk, rows.length);
    const frag = document.createDocumentFragment();
    for(; i<end; i++){
      const r = rows[i];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><div class="s muted">注番</div><div><b>${r.po_id||""}</b></div><div class="muted s">${r["得意先"]||"—"}</div></td>
        <td>${r["品名"]||"—"}</td>
        <td class="center">${r["品番"]||"—"}</td>
        <td class="center">${r["図番"]||"—"}</td>
        <td class="center">${statusToBadge(r.status)}</td>
        <td class="center">${procToChip(r.current_process)}</td>
        <td class="center">${fmt(r.updated_at)}</td>
        <td class="center">${r.updated_by||"—"}</td>
        <td class="center">
          <div class="row">
            <button class="btn ghost btn-scan" data-po="${r.po_id}"><i class="fa-solid fa-qrcode"></i> スキャン</button>
            <button class="btn ghost btn-op"   data-po="${r.po_id}"><i class="fa-solid fa-keyboard"></i> 手入力</button>
          </div>
        </td>`;
      frag.appendChild(tr);
    }
    tb.appendChild(frag);
    if(i < rows.length) requestIdleCallback(paint);
    else {
      $$(".btn-scan",tb).forEach(b=> b.onclick=(e)=> openScanDialog(e.currentTarget.dataset.po));
      $$(".btn-op",tb).forEach(b=> b.onclick=(e)=> openOpDialog(e.currentTarget.dataset.po));
    }
  }
  paint();
}
const debouncedRender = debounce(renderOrders, 250);
$("#searchQ").addEventListener("input", debouncedRender);

async function refreshAll(){ await loadOrders(); }
$("#btnExportOrders").onclick = ()=> exportTableCSV("#tbOrders","orders.csv");

/* ---------- 操作: 手入力 dialog ---------- */
const PROCESS_OPTIONS = ["準備","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","出荷（組立済）"];
// === REPLACE fungsi openOpDialog lama dengan versi ini ===
function openOpDialog(po, defaults = {}){
  $("#opPO").textContent = po;
  const sel = $("#opProcess");
  sel.innerHTML = PROCESS_OPTIONS.map(o=>`<option value="${o}">${o}</option>`).join('');

  // Prefill bila ada (dari QR)
  $("#opProcess").value = defaults.process || PROCESS_OPTIONS[0];
  $("#opOK").value      = (defaults.ok_count ?? defaults.ok ?? "") === 0 ? 0 : (defaults.ok_count ?? defaults.ok ?? "");
  $("#opNG").value      = (defaults.ng_count ?? defaults.ng ?? "") === 0 ? 0 : (defaults.ng_count ?? defaults.ng ?? "");
  $("#opNote").value    = defaults.note || "";

  $("#dlgOp").showModal();

  $("#btnOpSave").onclick = async ()=>{
    const okStr = $("#opOK").value;
    const ngStr = $("#opNG").value;
    const proc  = $("#opProcess").value;

    // === VALIDASI WAJIB ===
    if(!proc) return alert("工程を選択してください");
    if(okStr === "") return alert("OK 数を入力してください（0 以上）");
    if(ngStr === "") return alert("NG 数を入力してください（0 以上）");

    const ok = Number(okStr), ng = Number(ngStr);
    if(Number.isNaN(ok) || ok < 0) return alert("OK 数は 0 以上の数値で入力してください");
    if(Number.isNaN(ng) || ng < 0) return alert("NG 数は 0 以上の数値で入力してください");

    try{
      await jsonp("saveOp", {
        data: JSON.stringify({
          po_id: po, process: proc, ok_count: ok, ng_count: ng, note: $("#opNote").value
        }),
        user: JSON.stringify(CURRENT_USER||{})
      });
      $("#dlgOp").close();

      // Jika dialog scan masih terbuka, tutup & hentikan kamera
      if($("#dlgScan").open){
        if(scanRAF) cancelAnimationFrame(scanRAF);
        if(scanStream) scanStream.getTracks().forEach(t=> t.stop());
        $("#dlgScan").close();
      }

      await refreshAll();
    }catch(e){ alert("保存失敗: " + e.message); }
  };
}

$("#btnOpCancel").onclick = ()=> $("#dlgOp").close();

/* ---------- 受注 ---------- */
let MASTERS = { customers:[], drawings:[], item_names:[], part_nos:[] };

async function loadMasters(){
  try{
    MASTERS = await cached("listMasters", {}, 60000);
  }catch(_){ /* silent */ }
}

const SALES_FIELDS = [
  {name:'po_id', label:'注番', req:true},
  {name:'得意先', label:'得意先', type:'select', options:()=>MASTERS.customers},
  {name:'図番',   label:'図番',   type:'select', options:()=>MASTERS.drawings},
  {name:'品名',   label:'品名',   type:'select', options:()=>MASTERS.item_names},
  {name:'品番',   label:'品番',   type:'select', options:()=>MASTERS.part_nos},
  {name:'受注日', label:'受注日', type:'date'},
  {name:'製造番号', label:'製造番号'}, // optional
  {name:'qty',   label:'数量'},
  {name:'納期',  label:'納期', type:'date'}
];

async function loadSales(){
  const dat = await cached("listSales");
  renderTable(dat, "#thSales", "#tbSales", "#salesSearch");
}
$("#btnSalesCreate").onclick = ()=> openForm("受注作成", SALES_FIELDS, "saveSales");
$("#btnSalesExport").onclick = ()=> exportTableCSV("#tbSales","sales.csv");
$("#btnSalesImport").onclick = ()=> importCSVtoSheet("bulkImportSales");
$("#btnSalesPrint").onclick  = ()=> window.print();

/* ---------- 生産計画 ---------- */
const PLAN_FIELDS = [
  {name:'po_id', label:'注番', req:true},
  {name:'得意先', label:'得意先'},
  {name:'図番', label:'図番'},
  {name:'品名', label:'品名'},
  {name:'品番', label:'品番'},
  {name:'current_process', label:'工程(開始)', type:'select', options: PROCESS_OPTIONS},
  {name:'status', label:'状態', type:'select', options:["進行","組立中","組立済","検査中","検査済","出荷準備","出荷済"]},
  {name:'start_date', label:'開始日', type:'date'},
  {name:'due_date', label:'完了予定', type:'date'},
  {name:'note', label:'備考'}
];
async function loadPlans(){
  const dat = await cached("listPlans");
  renderTable(dat, "#thPlan", "#tbPlan", "#planSearch");
}
$("#btnPlanCreate").onclick = ()=> openForm("生産計画 作成", PLAN_FIELDS, "savePlan", ()=> { loadPlans(); loadOrders(); });
$("#btnPlanExport").onclick = ()=> exportTableCSV("#tbPlan","plans.csv");
$("#btnPlanImport").onclick = ()=> importCSVtoSheet("bulkImportPlans", ()=> { loadPlans(); loadOrders(); });
$("#btnPlanPrint").onclick  = ()=> window.print();

/* ---------- 出荷予定 ---------- */
const SHIP_FIELDS = [
  {name:'po_id', label:'注番', req:true},
  {name:'得意先', label:'得意先'},
  {name:'図番', label:'図番'},
  {name:'品名', label:'品名'},
  {name:'品番', label:'品番'},
  {name:'destination', label:'送り先'},
  {name:'qty', label:'数量'},
  {name:'scheduled_date', label:'出荷日', type:'date'},
  {name:'note', label:'備考'}
];
async function loadShips(){
  const dat = await cached("listShip");
  renderTable(dat, "#thShip", "#tbShip", "#shipSearch");
}
$("#btnShipCreate").onclick = ()=> openForm("出荷予定 作成", SHIP_FIELDS, "saveShip", ()=> { loadShips(); loadShipsMini(); });
$("#btnShipExport").onclick = ()=> exportTableCSV("#tbShip","shipments.csv");
$("#btnShipImport").onclick = ()=> importCSVtoSheet("bulkImportShip", ()=> { loadShips(); loadShipsMini(); });
$("#btnShipPrint").onclick  = ()=> window.print();

/* ---------- ミニ: 本日出荷 & 出荷予定 ---------- */
async function loadShipsMini(){
  const dat = await cached("listShip", {}, 10000);
  const rows = dat.rows || [];
  const head = dat.header || [];
  const idx = Object.fromEntries(head.map((h,i)=>[h,i]));
  const today = new Date(); const ymd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isToday = (s)=>{
    const t = new Date(s);
    return t.getFullYear()===ymd.getFullYear() && t.getMonth()===ymd.getMonth() && t.getDate()===ymd.getDate();
  };
  const statusCol = idx.status ?? idx['状態'];
  const dateCol   = idx.scheduled_date ?? idx['出荷日'] ?? idx['納期'];
  const poCol     = idx.po_id ?? idx['注番'];

  const todayList = [];
  const futureList = [];
  rows.forEach(r=>{
    const st = String(r[statusCol]||'');
    const dt = r[dateCol];
    if(!dt || /出荷済/.test(st)) return;
    const entry = { po: r[poCol], date: dt, status: st, dest: r[idx.destination]||'' , qty: r[idx.qty]||'' };
    if(isToday(dt)) todayList.push(entry);
    else if(new Date(dt) > ymd) futureList.push(entry);
  });
  const renderSide = (arr, el)=>{
    el.innerHTML = arr.slice(0,50).map(e=>`
      <div class="ship-item">
        <div><b>${e.po||''}</b> <span class="muted s">${e.dest||''}</span></div>
        <div class="row-between s"><span>${new Date(e.date).toLocaleDateString('ja-JP')}</span><span>${e.qty||''}</span></div>
      </div>
    `).join('') || `<div class="muted s">なし</div>`;
  };
  renderSide(todayList, $("#shipToday"));
  renderSide(futureList, $("#shipPlan"));
}

/* ---------- Form dialog generator ---------- */
let CURRENT_API = null;
function openForm(title, fields, api, after){
  CURRENT_API = api;
  $("#dlgTitle").textContent = title;
  const f = $("#formBody"); f.innerHTML = "";
  fields.forEach(x=>{
    const wrap = document.createElement("div");
    wrap.className = "form-item";
    const label = `<div class="muted s">${x.label}${x.req? ' <span style="color:#c00">*</span>':''}</div>`;
    let input = '';
    let opts = (typeof x.options === 'function') ? x.options() : (x.options||[]);
    if(x.type==='select'){
      input = `<select name="${x.name}">${opts.map(o=>`<option value="${o}">${o}</option>`).join('')}</select>`;
    }else if(x.type==='date'){
      input = `<input name="${x.name}" type="date">`;
    }else{
      input = `<input name="${x.name}" placeholder="${x.label}">`;
    }
    wrap.innerHTML = label + input;
    f.appendChild(wrap);
  });
  $("#dlgForm").showModal();

  $("#btnDlgSave").onclick = async ()=>{
    const data = {};
    fields.forEach(x=>{
      let v = f.querySelector(`[name="${x.name}"]`).value;
      if(x.type==='date' && v) v = new Date(v).toISOString().slice(0,10);
      data[x.name] = v;
    });
    try{
      await jsonp(CURRENT_API, { data: JSON.stringify(data), user: JSON.stringify(CURRENT_USER||{}) });
      $("#dlgForm").close();
      if(after) after();
      if(api==="savePlan") await loadOrders();
    }catch(e){ alert("保存失敗: " + e.message); }
  };
}
$("#btnDlgCancel").onclick = ()=> $("#dlgForm").close();

/* ---------- Render helper for listSheet_ ---------- */
function renderTable(dat, thSel, tbSel, searchSel){
  const th = $(thSel), tb = $(tbSel), search = $(searchSel);
  th.innerHTML = `<tr>${dat.header.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const render = ()=>{
    const q = (search.value||'').toLowerCase();
    tb.innerHTML = '';
    const rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    // windowed render
    let i=0; const chunk=150;
    function paint(){
      const end=Math.min(i+chunk, rows.length);
      const frag=document.createDocumentFragment();
      for(;i<end;i++){
        const tr=document.createElement('tr');
        tr.innerHTML = rows[i].map(c=>`<td>${c??''}</td>`).join('');
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<rows.length) requestIdleCallback(paint);
    }
    paint();
  };
  search.oninput = debounce(render, 250);
  render();
}

/* ---------- CSV Export / Import ---------- */
function exportTableCSV(tbodySel, filename){
  const rows = $$(tbodySel+" tr").map(tr=> [...tr.children].map(td=> td.textContent));
  const csv = rows.map(r => r.map(v=>{
    const s = (v??'').toString().replace(/"/g,'""');
    return `"${s}"`;
  }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}
function importCSVtoSheet(api, after){
  const input = document.createElement('input'); input.type='file'; input.accept='.csv,.xlsx';
  input.onchange = async ()=>{
    const file = input.files[0]; if(!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const arr = XLSX.utils.sheet_to_json(ws, {header:1, blankrows:false, defval:''});
    // Jika baris pertama tampak seperti header (mengandung huruf), lewati
    const looksHeader = arr.length && arr[0].some(c=> typeof c==='string' && /[A-Za-zぁ-んァ-ヴ一-龯]/.test(c));
    const rows = looksHeader ? arr.slice(1) : arr;
    await jsonp(api, { rows: JSON.stringify(rows) });
    if(after) after();
  };
  input.click();
}


/* ---------- QR Scan ---------- */
let scanStream=null, scanRAF=null;
// === REPLACE isi openScanDialog lama dengan versi ini ===
function openScanDialog(po){
  $("#scanResult").textContent = `PO: ${po}`;
  $("#dlgScan").showModal();

  $("#btnScanStart").onclick = async ()=>{
    const video = $("#scanVideo"), canvas=$("#scanCanvas");
    try{
      scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      video.srcObject = scanStream; await video.play();
      const ctx = canvas.getContext("2d");

      const tick = ()=>{
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0,0, canvas.width, canvas.height);
        const img = ctx.getImageData(0,0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if(code){
          // ====== QR terdeteksi: hentikan kamera & buka dialog 手入力 ======
          $("#scanResult").textContent = `QR: ${code.data}`;
          if(scanRAF) cancelAnimationFrame(scanRAF);
          if(scanStream) { scanStream.getTracks().forEach(t=> t.stop()); }

          // Format QR yang didukung: PO|PROCESS|OK|NG|NOTE
          const parts = String(code.data||'').split('|');
          let defaults = {};
          if(parts.length >= 4){
            defaults = {
              process: parts[1] || "",
              ok_count: Number(parts[2]||""),
              ng_count: Number(parts[3]||""),
              note: parts[4] || ""
            };
          }else{
            // Jika format tidak lengkap, pakai kosong supaya user wajib isi
            defaults = { process:"", ok_count:"", ng_count:"", note:"" };
          }

          // Paksa isi via dialog 手入力
          openOpDialog(po, defaults);
          return; // stop loop
        }
        scanRAF = requestAnimationFrame(tick);
      };
      tick();
    }catch(e){ alert("Camera error: "+e.message); }
  };
}

$("#btnScanClose").onclick = ()=>{
  if(scanRAF) cancelAnimationFrame(scanRAF);
  if(scanStream) scanStream.getTracks().forEach(t=> t.stop());
  $("#dlgScan").close();
};

/* ---------- Cuaca (Open-Meteo, cached 30m) ---------- */
async function ensureWeather(){
  try{
    const cacheKey = 'wx_cache_v1';
    const cached = JSON.parse(localStorage.getItem(cacheKey)||'null');
    const now = Date.now();
    if(cached && (now - cached.t) < 30*60*1000){
      renderWeather(cached.v); return;
    }
    let lat=35.6762, lon=139.6503; // Tokyo default
    if(navigator.geolocation){
      await new Promise(res=> navigator.geolocation.getCurrentPosition(
        pos=>{ lat=pos.coords.latitude; lon=pos.coords.longitude; res(); },
        ()=> res(),
        {maximumAge: 600000, timeout: 2000}
      ));
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m&timezone=auto`;
    const v = await fetch(url).then(r=>r.json());
    localStorage.setItem(cacheKey, JSON.stringify({v,t:now}));
    renderWeather(v);
  }catch(_){ /* silent */ }
}
function renderWeather(v){
  if(!v?.current) return;
  $("#wxTemp").textContent = Math.round(v.current.temperature_2m) + "°C";
  $("#wxWind").textContent = Math.round(v.current.wind_speed_10m) + " m/s";
  $("#wxPlace").textContent = v.timezone_abbreviation || "";
}

/* ---------- Utils ---------- */
function debounce(fn, wait){
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); };
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", ()=> setUser(null));
