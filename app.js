/* =================================================
   JSONP Frontend (Optimized & Hardened)
   - Dashboard status merge StatusLog
   - CRUD: 受注 / 生産計画 / 出荷予定 / 完成品一覧
   - 操作: QR scanner + 手入力 (OK/NG/工程)
   - Import / Export / Print
   - Cuaca (Open-Meteo, cached)
   ================================================= */

const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

/* ---------- Helpers ---------- */
const $  = (q,el=document)=> el.querySelector(q);
const $$ = (q,el=document)=> [...el.querySelectorAll(q)];
const qs = (o)=> Object.entries(o).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const fmt = (d)=> d? new Date(d).toLocaleString("ja-JP"):"";
const normalizeProc = (s)=> String(s||"").trim()
  .replace("レーサ加工","レザー加工").replace("外作加工","外注加工/組立") || "未設定";

// binder aman (tidak error kalau elemennya belum ada)
const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };

/* ---------- JSONP helper ---------- */
function jsonp(action, params={}){
  return new Promise((resolve,reject)=>{
    const cb = "cb_" + Math.random().toString(36).slice(2);
    params = { ...params, action, callback: cb };
    const s = document.createElement("script");
    s.src = `${API_BASE}?${qs(params)}`;
    let timeout = setTimeout(()=>{ cleanup(); reject(new Error("API timeout")); }, 20000);
    function cleanup(){ try{ delete window[cb]; }catch(_){} s.remove(); clearTimeout(timeout); }
    window[cb] = (resp)=>{ cleanup(); if(resp && resp.ok) resolve(resp.data); else reject(new Error((resp && resp.error) || "API error")); };
    s.onerror = ()=>{ cleanup(); reject(new Error("JSONP load error")); };
    document.body.appendChild(s);
  });
}

/* ---------- MEM cache ---------- */
const apiCache = new Map();
async function cached(action, params={}, ttlMs=15000){
  const key = action + ":" + JSON.stringify(params||{});
  const hit = apiCache.get(key); const now = Date.now();
  if(hit && now-hit.t < ttlMs) return hit.v;
  const v = await jsonp(action, params); apiCache.set(key, {v,t:now}); return v;
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
  'admin': { pages:['pageDash','pageSales','pagePlan','pageShip','pageFinished'], nav:true },
  '営業': { pages:['pageSales','pageDash','pageFinished'], nav:true },
  '生産管理': { pages:['pagePlan','pageShip','pageDash','pageFinished'], nav:true },
  '生産管理部': { pages:['pagePlan','pageShip','pageDash','pageFinished'], nav:true },
  '製造': { pages:['pageDash','pageFinished'], nav:true },
  '検査': { pages:['pageDash','pageFinished'], nav:true }
};

function setUser(u){
  CURRENT_USER = u || null;
  $("#userInfo") && ($("#userInfo").textContent = u ? `${u.role} / ${u.department}` : "");

  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished"];
  pages.forEach(p => $("#"+p)?.classList.add("hidden"));

  ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToFinPage','btnToInvPage','btnToInvoice','ddSetting','weatherWrap']
    .forEach(id=> $("#"+id)?.classList.add("hidden"));

  if(!u){ $("#authView")?.classList.remove("hidden"); return; }

  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP['admin'];
  if(allow?.nav){
    if(allow.pages.includes('pageDash')) $("#btnToDash")?.classList.remove("hidden");
    if(allow.pages.includes('pageSales')) $("#btnToSales")?.classList.remove("hidden");
    if(allow.pages.includes('pagePlan')) $("#btnToPlan")?.classList.remove("hidden");
    if(allow.pages.includes('pageShip')) $("#btnToShip")?.classList.remove("hidden");
    if(allow.pages.includes('pageFinished')) $("#btnToFinPage")?.classList.remove("hidden");
    $("#ddSetting")?.classList.remove("hidden");

    $("#weatherWrap")?.classList.remove("hidden");
    ensureWeather();
    loadMasters();
  }

  show("pageDash");
  refreshAll();
}

/* ---------- Nav (AMAN) ---------- */
function show(id){
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished"].forEach(p=>$("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}
on("#btnToDash",    "click", ()=>{ show("pageDash");  refreshAll(); });
on("#btnToSales",   "click", ()=>{ show("pageSales"); loadSales();  });
on("#btnToPlan",    "click", ()=>{ show("pagePlan");  loadPlans();  });
on("#btnToShip",    "click", ()=>{ show("pageShip");  loadShips();  });
on("#btnToFinPage", "click", ()=>{ show("pageFinished"); loadFinished(); });
on("#btnLogout",    "click", ()=> setUser(null));

/* ---------- Login (klik & Enter) ---------- */
async function loginSubmit(){
  const u = $("#inUser")?.value.trim();
  const p = $("#inPass")?.value.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");
  try{
    await jsonp('ping');
    const me = await jsonp("login", { username:u, password:p });
    setUser(me);
  }catch(e){ alert("ログイン失敗: " + (e?.message || e)); }
}
on("#btnLogin","click", loginSubmit);
on("#inUser","keydown", (e)=>{ if(e.key==='Enter') loginSubmit(); });
on("#inPass","keydown", (e)=>{ if(e.key==='Enter') loginSubmit(); });

/* ---------- Dashboard + 操作 ---------- */
let ORDERS = [];
async function loadOrders(){ ORDERS = await cached("listOrders"); renderOrders(); loadShipsMini(); }

function renderOrders(){
  const q = ($("#searchQ")?.value||"").trim().toLowerCase();
  const rows = ORDERS.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  const tb = $("#tbOrders"); if(!tb) return; tb.innerHTML = "";
  const chunk = 120; let i = 0;
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
    if(i < rows.length && 'requestIdleCallback' in window) requestIdleCallback(paint);
  }
  paint();

  $$(".btn-scan",tb).forEach(b=> b.onclick=(e)=> openScanDialog(e.currentTarget.dataset.po));
  $$(".btn-op",tb).forEach(b=> b.onclick=(e)=> openOpDialog(e.currentTarget.dataset.po));
}
const debouncedRender = (fn, wait)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };
$("#searchQ")?.addEventListener("input", debouncedRender(renderOrders, 250));
async function refreshAll(){ await loadOrders(); }
on("#btnExportOrders","click", ()=> exportTableCSV("#tbOrders","orders.csv"));

/* ---------- 操作: 手入力 ---------- */
const PROCESS_OPTIONS = ["準備","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","出荷（組立済）"];
function openOpDialog(po, defaults = {}){
  $("#opPO") && ($("#opPO").textContent = po);
  const sel = $("#opProcess"); if(!sel) return;
  sel.innerHTML = PROCESS_OPTIONS.map(o=>`<option value="${o}">${o}</option>`).join('');
  $("#opProcess").value = defaults.process || PROCESS_OPTIONS[0];
  $("#opOK")  && ($("#opOK").value   = (defaults.ok_count ?? defaults.ok ?? "") === 0 ? 0 : (defaults.ok_count ?? defaults.ok ?? ""));
  $("#opNG")  && ($("#opNG").value   = (defaults.ng_count ?? defaults.ng ?? "") === 0 ? 0 : (defaults.ng_count ?? defaults.ng ?? ""));
  $("#opNote")&& ($("#opNote").value = defaults.note || "");
  $("#dlgOp")?.showModal();
  on("#btnOpSave","click", async ()=>{
    const okStr = $("#opOK")?.value ?? "", ngStr = $("#opNG")?.value ?? "", proc = $("#opProcess")?.value ?? "";
    if(!proc) return alert("工程を選択してください");
    if(okStr === "") return alert("OK 数を入力してください（0 以上）");
    if(ngStr === "") return alert("NG 数を入力してください（0 以上）");
    const ok = Number(okStr), ng = Number(ngStr);
    if(Number.isNaN(ok) || ok < 0) return alert("OK 数は 0 以上の数値で入力してください");
    if(Number.isNaN(ng) || ng < 0) return alert("NG 数は 0 以上の数値で入力してください");
    try{
      await jsonp("saveOp", { data: JSON.stringify({ po_id: po, process: proc, ok_count: ok, ng_count: ng, note: $("#opNote")?.value || "" }), user: JSON.stringify(CURRENT_USER||{}) });
      $("#dlgOp")?.close();
      if($("#dlgScan")?.open){ if(scanRAF) cancelAnimationFrame(scanRAF); if(scanStream) scanStream.getTracks().forEach(t=> t.stop()); $("#dlgScan").close(); }
      await refreshAll();
    }catch(e){ alert("保存失敗: " + e.message); }
  });
}
on("#btnOpCancel","click", ()=> $("#dlgOp")?.close());

/* ---------- Masters ---------- */
let MASTERS = { customers:[], drawings:[], item_names:[], part_nos:[], destinations:[], carriers:[], po_ids:[] };
async function loadMasters(){ try{ MASTERS = await cached("listMasters", {}, 60000); }catch(_){ } }

/* ---------- 受注 ---------- */
const SALES_FIELDS = [
  {name:'po_id', label:'注番', req:true},
  {name:'得意先', label:'得意先', type:'select', options:()=>MASTERS.customers},
  {name:'図番',   label:'図番',   type:'select', options:()=>MASTERS.drawings},
  {name:'品名',   label:'品名',   type:'select', options:()=>MASTERS.item_names},
  {name:'品番',   label:'品番',   type:'select', options:()=>MASTERS.part_nos},
  {name:'受注日', label:'受注日', type:'date'},
  {name:'製造番号', label:'製造番号'},
  {name:'qty',   label:'数量'},
  {name:'納期',  label:'納期', type:'date'}
];
async function loadSales(){ const dat = await cached("listSales"); renderTable(dat, "#thSales", "#tbSales", "#salesSearch"); }
on("#btnSalesCreate","click", ()=> openForm("受注作成", SALES_FIELDS, "saveSales"));
on("#btnSalesExport","click", ()=> exportTableCSV("#tbSales","sales.csv"));
on("#btnSalesImport","click", ()=> importCSVtoSheet("bulkImportSales"));
on("#btnSalesPrint","click",  ()=> window.print());

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
async function loadPlans(){ const dat = await cached("listPlans"); renderTable(dat, "#thPlan", "#tbPlan", "#planSearch"); }
on("#btnPlanCreate","click", ()=> openForm("生産計画 作成", PLAN_FIELDS, "savePlan", ()=> { loadPlans(); loadOrders(); }));
on("#btnPlanExport","click", ()=> exportTableCSV("#tbPlan","plans.csv"));
on("#btnPlanImport","click", ()=> importCSVtoSheet("bulkImportPlans", ()=> { loadPlans(); loadOrders(); }));
on("#btnPlanPrint","click",  ()=> window.print());

/* ---------- 出荷予定 ---------- */
const SHIP_FIELDS = [
  {name:'po_id', label:'注番', req:true},
  {name:'得意先', label:'得意先'},
  {name:'図番', label:'図番'},
  {name:'品名', label:'品名'},
  {name:'品番', label:'品番'},
  {name:'destination', label:'送り先', type:'select', options: ()=> (MASTERS.destinations||[]) },
  {name:'qty', label:'数量'},
  {name:'scheduled_date', label:'出荷日', type:'date'},
  {name:'delivery_date',  label:'納入日', type:'date'},
  {name:'carrier',        label:'運送会社', type:'select', options: ()=> (MASTERS.carriers||[]) },
  {name:'note', label:'備考'}
];
async function loadShips(){ const dat = await cached("listShip"); renderTable(dat, "#thShip", "#tbShip", "#shipSearch"); }
on("#btnShipCreate","click", ()=> openForm("出荷予定 作成", SHIP_FIELDS, "saveShip", ()=> { loadShips(); loadShipsMini(); }));
on("#btnShipExport","click", ()=> exportTableCSV("#tbShip","shipments.csv"));
on("#btnShipImport","click", ()=> importCSVtoSheet("bulkImportShip", ()=> { loadShips(); loadShipsMini(); }));
on("#btnShipPrint","click",  ()=> window.print());

/* ---------- 完成品一覧 ---------- */
async function loadFinished(){
  // backend: gunakan router sheetExport ke sheet "FinishedGoods"
  const dat = await cached("sheetExport", { sheet: "FinishedGoods" }, 10000).catch(()=>({header:[],rows:[]}));
  renderTable(dat, "#thFinished", "#tbFinished", "#finishedSearch");
}

/* ---------- ミニ: 本日出荷 & 出荷予定 ---------- */
async function loadShipsMini(){
  const dat = await cached("listShip", {}, 10000);
  const rows = dat.rows || [];
  const head = dat.header || [];
  const idx = Object.fromEntries(head.map((h,i)=>[h,i]));
  const today = new Date(); const ymd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isToday = (s)=>{ const t = new Date(s); return t.getFullYear()===ymd.getFullYear() && t.getMonth()===ymd.getMonth() && t.getDate()===ymd.getDate(); };
  const statusCol = idx.status ?? idx['状態'];
  const dateCol   = idx.scheduled_date ?? idx['出荷日'] ?? idx['納期'];
  const poCol     = idx.po_id ?? idx['注番'];

  const todayList = [], futureList = [];
  rows.forEach(r=>{
    const st = String(r[statusCol]||'');
    const dt = r[dateCol];
    if(!dt || /出荷済/.test(st)) return;
    const entry = { po: r[poCol], date: dt, status: st, dest: r[idx.destination]||'' , qty: r[idx.qty]||'' };
    if(isToday(dt)) todayList.push(entry); else if(new Date(dt) > ymd) futureList.push(entry);
  });
  const renderSide = (arr, el)=>{ if(!el) return;
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
// openForm(title, fields, api, after, initial?)
let CURRENT_API = null;
function openForm(title, fields, api, after, initial={}){
  CURRENT_API = api;
  $("#dlgTitle") && ($("#dlgTitle").textContent = title);
  const f = $("#formBody"); if(!f) return; f.innerHTML = "";
  fields.forEach(x=>{
    const wrap = document.createElement("div");
    wrap.className = "form-item";
    const label = `<div class="muted s">${x.label}${x.req? ' <span style="color:#c00">*</span>':''}</div>`;
    let input = '';
    let opts = (typeof x.options === 'function') ? x.options() : (x.options||[]);
    const val = (initial[x.name] ?? '');
    if(x.type==='select'){
      input = `<select name="${x.name}">${opts.map(o=>`<option value="${o}" ${String(o)===String(val)?'selected':''}>${o}</option>`).join('')}</select>`;
    }else if(x.type==='date'){
      const v = val ? new Date(val) : '';
      const iso = (v && !isNaN(v)) ? new Date(v.getTime()-v.getTimezoneOffset()*60000).toISOString().slice(0,10) : '';
      input = `<input name="${x.name}" type="date" value="${iso}">`;
    }else{
      input = `<input name="${x.name}" placeholder="${x.label}" value="${val??''}">`;
    }
    wrap.innerHTML = label + input;
    f.appendChild(wrap);
  });
  $("#dlgForm")?.showModal();

  on("#btnDlgSave","click", async ()=>{
    const data = {};
    fields.forEach(x=>{
      let v = f.querySelector(`[name="${x.name}"]`)?.value ?? "";
      if(x.type==='date' && v) v = new Date(v).toISOString().slice(0,10);
      data[x.name] = v;
    });
    try{
      await jsonp(CURRENT_API, { data: JSON.stringify(data), user: JSON.stringify(CURRENT_USER||{}) });
      $("#dlgForm")?.close();
      if(after) await after();
      if(CURRENT_API==="savePlan") await loadOrders();
    }catch(e){ alert("保存失敗: " + e.message); }
  });
  on("#btnDlgCancel","click", ()=> $("#dlgForm")?.close());
}

/* ---------- Render helper ---------- */
function renderTable(dat, thSel, tbSel, searchSel){
  const th = $(thSel), tb = $(tbSel), search = $(searchSel);
  if(!th || !tb) return;
  th.innerHTML = `<tr>${dat.header.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const render = ()=>{
    const q = (search?.value||'').toLowerCase();
    tb.innerHTML = '';
    const rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
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
      if(i<rows.length && 'requestIdleCallback' in window) requestIdleCallback(paint);
    }
    paint();
  };
  search?.addEventListener("input", debouncedRender(render, 250));
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
    const looksHeader = arr.length && arr[0].some(c=> typeof c==='string' && /[A-Za-zぁ-んァ-ヴ一-龯]/.test(c));
    const rows = looksHeader ? arr.slice(1) : arr;
    await jsonp(api, { rows: JSON.stringify(rows) });
    if(after) after();
  };
  input.click();
}

/* ---------- QR Scan ---------- */
let scanStream=null, scanRAF=null;
function openScanDialog(po){
  $("#scanResult") && ($("#scanResult").textContent = `PO: ${po}`);
  $("#dlgScan")?.showModal();

  on("#btnScanStart","click", async ()=>{
    const video = $("#scanVideo"), canvas=$("#scanCanvas");
    if(!video || !canvas) return;
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
          $("#scanResult") && ($("#scanResult").textContent = `QR: ${code.data}`);
          if(scanRAF) cancelAnimationFrame(scanRAF);
          if(scanStream) { scanStream.getTracks().forEach(t=> t.stop()); }

          // QR: PO|PROCESS|OK|NG|NOTE
          const parts = String(code.data||'').split('|');
          let defaults = {};
          if(parts.length >= 4){
            defaults = { process: parts[1]||"", ok_count: Number(parts[2]||""), ng_count: Number(parts[3]||""), note: parts[4]||"" };
          }else{
            defaults = { process:"", ok_count:"", ng_count:"", note:"" };
          }
          openOpDialog(po, defaults);
          return;
        }
        scanRAF = requestAnimationFrame(tick);
      };
      tick();
    }catch(e){ alert("Camera error: "+e.message); }
  });
}
on("#btnScanClose","click", ()=>{
  if(scanRAF) cancelAnimationFrame(scanRAF);
  if(scanStream) scanStream.getTracks().forEach(t=> t.stop());
  $("#dlgScan")?.close();
});

/* ---------- Cuaca (Open-Meteo, cached 30m) ---------- */
async function ensureWeather(){
  try{
    const cacheKey = 'wx_cache_v1';
    const cachedWx = JSON.parse(localStorage.getItem(cacheKey)||'null');
    const now = Date.now();
    if(cachedWx && (now - cachedWx.t) < 30*60*1000){ renderWeather(cachedWx.v); return; }
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
  }catch(_){ }
}
function renderWeather(v){
  if(!v?.current) return;
  $("#wxTemp")  && ($("#wxTemp").textContent = Math.round(v.current.temperature_2m) + "°C");
  $("#wxWind")  && ($("#wxWind").textContent = Math.round(v.current.wind_speed_10m) + " m/s");
  $("#wxPlace") && ($("#wxPlace").textContent = v.timezone_abbreviation || "");
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", ()=> { setUser(null); });
