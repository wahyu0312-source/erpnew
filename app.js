/* ======================================================
 *  東京精密発條株式会社システム — App Core
 *  - fast JSONP (with cleanup & timeout)
 *  - light cache
 *  - right-aligned nav kept (handled in index.html)
 *  - pages: Dash / Sales / Plan / Ship / Finished / Inv
 *  - add: Invoice (請求書) / Analytics (分析チャート)
 *  - charts: destroy-before-recreate (no “Canvas is already in use”)
 *  - QR Station (universal) + Scan + quick OK/NG prompt
 *  - Weather (Open-Meteo, cached)
 * =====================================================*/
"use strict";

/* ---------- API base ---------- */
const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

/* ---------- tiny helpers ---------- */
const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));
const fmt = (d) => (d ? new Date(d).toLocaleString("ja-JP") : "");
const toYMD = (d) => {
  const z = (n) => String(n).padStart(2, "0");
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return `${dt.getFullYear()}-${z(dt.getMonth() + 1)}-${z(dt.getDate())}`;
};
const normalizeProc = (s) =>
  String(s || "")
    .trim()
    .replace("レーサ加工", "レザー加工")
    .replace("外作加工", "外注加工/組立") || "未設定";

/* ---------- JSONP (stable) ---------- */
function jsonp(action, params = {}, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const u = new URL(API_BASE);
    const qp = { ...params, action, callback: cb };
    Object.entries(qp).forEach(([k, v]) => u.searchParams.set(k, String(v)));

    const s = document.createElement("script");
    s.src = u.href;
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      delete window[cb];
      s.remove();
      clearTimeout(tid);
    };

    const tid = setTimeout(() => {
      cleanup();
      reject(new Error("API timeout"));
    }, timeoutMs);

    window[cb] = (resp) => {
      cleanup();
      if (resp && resp.ok) resolve(resp.data);
      else reject(new Error((resp && resp.error) || "API error"));
    };
    s.onerror = () => {
      cleanup();
      reject(new Error("JSONP load error"));
    };
    document.body.appendChild(s);
  });
}

/* ---------- Cache (memory) ---------- */
const apiCache = new Map(); // key -> {v,t}
async function cached(action, params = {}, ttlMs = 15000) {
  const key = action + ":" + JSON.stringify(params || {});
  const hit = apiCache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await jsonp(action, params);
  apiCache.set(key, { v, t: now });
  return v;
}

/* =====================================================
 *  Auth & role
 * =====================================================*/
let CURRENT_USER = null;
const ROLE_MAP = {
  admin: { pages: ["pageDash", "pageSales", "pagePlan", "pageShip", "pageFinished", "pageInv", "pageInvoice", "pageCharts"], nav: true },
  "営業": { pages: ["pageSales", "pageDash", "pageInvoice", "pageCharts"], nav: true },
  "生産管理": { pages: ["pagePlan", "pageShip", "pageDash", "pageFinished", "pageInv", "pageInvoice", "pageCharts"], nav: true },
  "生産管理部": { pages: ["pagePlan", "pageShip", "pageDash", "pageFinished", "pageInv", "pageInvoice", "pageCharts"], nav: true },
  "製造": { pages: ["pageDash", "pageFinished"], nav: true },
  "検査": { pages: ["pageDash", "pageFinished"], nav: true },
};

function setUser(u) {
  CURRENT_USER = u || null;
  $("#userInfo").textContent = u ? `${u.role || ""} / ${u.department || ""}` : "";
  const pages = ["authView", "pageDash", "pageSales", "pagePlan", "pageShip", "pageFinished", "pageInv", "pageInvoice", "pageCharts"];
  pages.forEach((p) => $("#" + p)?.classList.add("hidden"));
  // hide nav first
  ["btnToDash","btnToSales","btnToPlan","btnToShip","btnToFinPage","btnToInvPage","btnToInvoice","btnToCharts","ddSetting","weatherWrap"].forEach(id => {
    $("#" + id)?.classList.add("hidden");
  });

  if (!u) {
    $("#authView").classList.remove("hidden");
    return;
  }
  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP.admin;
  if (allow?.nav) {
    if (allow.pages.includes("pageDash")) $("#btnToDash").classList.remove("hidden");
    if (allow.pages.includes("pageSales")) $("#btnToSales").classList.remove("hidden");
    if (allow.pages.includes("pagePlan")) $("#btnToPlan").classList.remove("hidden");
    if (allow.pages.includes("pageShip")) $("#btnToShip").classList.remove("hidden");
    if (allow.pages.includes("pageFinished")) $("#btnToFinPage").classList.remove("hidden");
    if (allow.pages.includes("pageInv")) $("#btnToInvPage").classList.remove("hidden");
    if (allow.pages.includes("pageInvoice")) $("#btnToInvoice").classList.remove("hidden");
    if (allow.pages.includes("pageCharts")) $("#btnToCharts").classList.remove("hidden");
    $("#ddSetting").classList.remove("hidden");
    $("#weatherWrap").classList.remove("hidden");
    ensureWeather();
    loadMasters();
  }
  show("pageDash");
  refreshAll();
}

function show(id) {
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice","pageCharts"].forEach(p => $("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}

/* nav bindings */
$("#btnToDash").onclick = () => { show("pageDash"); refreshAll(); };
$("#btnToSales").onclick = () => { show("pageSales"); loadSales(); };
$("#btnToPlan").onclick = () => { show("pagePlan"); loadPlans(); };
$("#btnToShip").onclick = () => { show("pageShip"); loadShips(); };
$("#btnToFinPage").onclick = () => { show("pageFinished"); loadFinished(); };
$("#btnToInvPage").onclick = () => { show("pageInv"); loadInventory(); };
$("#btnToInvoice").onclick = () => { show("pageInvoice"); initInvoice(); };
$("#btnToCharts").onclick = () => { show("pageCharts"); initCharts(); };
$("#btnLogout").onclick = () => setUser(null);

/* login */
$("#btnLogin").onclick = loginSubmit;
$("#inUser").addEventListener("keydown", (e) => { if (e.key === "Enter") loginSubmit(); });
$("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") loginSubmit(); });

async function loginSubmit(){
  const u = $("#inUser").value.trim();
  const p = $("#inPass").value.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");
  try{
    await jsonp("ping");
    const me = await jsonp("login", { username:u, password:p });
    setUser(me);
  }catch(e){
    alert("ログイン失敗: " + (e?.message || e));
  }
}

/* =====================================================
 *  Dashboard (orders)
 * =====================================================*/
let ORDERS = [];
async function loadOrders(){
  ORDERS = await cached("listOrders");
  renderOrders();
  loadShipsMini();
}

function renderOrders(){
  const q = ($("#searchQ").value || "").trim().toLowerCase();
  const rows = ORDERS.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  const tb = $("#tbOrders");
  tb.innerHTML = "";
  const chunk = 120;
  let i = 0;
  function paint(){
    const end = Math.min(i+chunk, rows.length);
    const frag = document.createDocumentFragment();
    for(; i<end; i++){
      const r = rows[i];
      const tr = document.createElement("tr");
      const ok = (r.ok_count ?? 0);
      const ng = (r.ng_count ?? 0);
      tr.innerHTML = `
        <td><div class="s muted">注番</div><div><b>${r.po_id||""}</b></div><div class="s muted">${r["得意先"]||"—"}</div></td>
        <td>${r["品名"]||"—"}</td>
        <td>${r["品番"]||"—"}</td>
        <td>${r["図番"]||"—"}</td>
        <td class="s">${r.status||"—"}</td>
        <td class="s">${normalizeProc(r.current_process)}　OK:${ok} / NG:${ng}</td>
        <td>${fmt(r.updated_at)}</td>
        <td>${r.updated_by||"—"}</td>
        <td>
          <div class="row">
            <button class="chip btn-stqr">工程QR</button>
            <button class="chip btn-scan" data-po="${r.po_id}">スキャン</button>
            <button class="chip btn-op" data-po="${r.po_id}">手入力</button>
          </div>
        </td>`;
      frag.appendChild(tr);
    }
    tb.appendChild(frag);
    if(i < rows.length) requestAnimationFrame(paint);
    if(i >= rows.length){
      $$(".btn-stqr",tb).forEach(b=> b.onclick = openStationQrSheet);
      $$(".btn-scan",tb).forEach(b=> b.onclick=(e)=> openScanDialog(e.currentTarget.dataset.po));
      $$(".btn-op",tb).forEach(b=> b.onclick=(e)=> openOpDialog(e.currentTarget.dataset.po));
    }
  }
  paint();
}
$("#searchQ").addEventListener("input", ()=> renderOrders());
async function refreshAll(){ await loadOrders(); }
$("#btnExportOrders").onclick = ()=> exportTableCSV("#tbOrders","orders.csv");

/* 手入力 */
const PROCESS_OPTIONS = [
  "準備","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","検査中","検査済","出荷（組立済）","出荷準備","出荷済"
];
function openOpDialog(po, defaults = {}){
  $("#opPO").textContent = po;
  const sel = $("#opProcess");
  sel.innerHTML = PROCESS_OPTIONS.map(o=>`<option value="${o}">${o}</option>`).join("");
  $("#opProcess").value = defaults.process || PROCESS_OPTIONS[0];
  $("#opOK").value = (defaults.ok_count ?? defaults.ok ?? "") === 0 ? 0 : (defaults.ok_count ?? defaults.ok ?? "");
  $("#opNG").value = (defaults.ng_count ?? defaults.ng ?? "") === 0 ? 0 : (defaults.ng_count ?? defaults.ng ?? "");
  $("#opNote").value = defaults.note || "";
  $("#dlgOp").showModal();

  $("#btnOpSave").onclick = async ()=>{
    const okStr = $("#opOK").value;
    const ngStr = $("#opNG").value;
    const proc = $("#opProcess").value;
    if(!proc) return alert("工程を選択してください");
    if(okStr === "") return alert("OK 数を入力してください（0 以上）");
    if(ngStr === "") return alert("NG 数を入力してください（0 以上）");
    const ok = Number(okStr), ng = Number(ngStr);
    if(Number.isNaN(ok) || ok < 0) return alert("OK 数は 0 以上の数値で入力してください");
    if(Number.isNaN(ng) || ng < 0) return alert("NG 数は 0 以上の数値で入力してください");
    try{
      await jsonp("saveOp", {
        data: JSON.stringify({ po_id: po, process: proc, ok_count: ok, ng_count: ng, note: $("#opNote").value }),
        user: JSON.stringify(CURRENT_USER||{})
      });
      $("#dlgOp").close();
      // also close scan dialog if open
      if($("#dlgScan").open){
        if(scanRAF) cancelAnimationFrame(scanRAF);
        if(scanStream) scanStream.getTracks().forEach(t=> t.stop());
        $("#dlgScan").close();
      }
      await refreshAll();
    }catch(e){
      alert("保存失敗: " + e.message);
    }
  };
}
$("#btnOpCancel").onclick = ()=> $("#dlgOp").close();

/* =====================================================
 *  Masters (for select lookup)
 * =====================================================*/
let MASTERS = { customers:[], drawings:[], item_names:[], part_nos:[], destinations:[], carriers:[], po_ids:[] };
async function loadMasters(){
  try{ MASTERS = await cached("listMasters", {}, 60000); }catch(_){ }
}

/* =====================================================
 *  Sales (slim)
 * =====================================================*/
const SALES_VIEW = [
  {label:'受注日', keys:['受注日']},
  {label:'得意先', keys:['得意先','customer']},
  {label:'品名', keys:['品名','item_name']},
  {label:'品番', keys:['品番','part_no','item_code']},
  {label:'図番', keys:['図番','drawing_no']},
  {label:'製番号', keys:['製番号','製造番号']},
  {label:'数量', keys:['数量','qty']},
  {label:'希望納期', keys:['希望納期','納期','due']},
  {label:'備考', keys:['備考','note']}
];

async function loadSales(){
  const dat = await cached("listSales");
  renderSalesSlim(dat);
}
function renderSalesSlim(dat){
  const th = $("#thSales"), tb = $("#tbSales"), search = $("#salesSearch");
  const header = dat.header || [];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const keyPO = (idx['po_id']!=null ? 'po_id' : (idx['注番']!=null ? '注番' : header[0]));
  const pick = (row, keys)=> { for(const k of keys){ const i = idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; } return ''; };

  th.innerHTML = `<tr>${SALES_VIEW.map(c=>`<th>${c.label}</th>`).join('')}<th>操作</th></tr>`;

  const render = ()=>{
    const q = (search.value||'').toLowerCase();
    tb.innerHTML = '';
    const rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    let i=0; const chunk=150;
    (function paint(){
      const end=Math.min(i+chunk, rows.length);
      const frag=document.createDocumentFragment();
      for(;i<end;i++){
        const r = rows[i];
        const po = String(r[idx[keyPO]]||'');
        const tds = SALES_VIEW.map(col=>{
          let v = pick(r, col.keys);
          if(v && (col.label==='受注日' || col.label==='希望納期')){
            const d = (v instanceof Date) ? v : new Date(v);
            if(!isNaN(d)) v = d.toLocaleDateString('ja-JP');
          }
          return `<td>${v ?? ''}</td>`;
        }).join('');
        const tr=document.createElement('tr');
        tr.innerHTML = `${tds}<td class="s">—</td>`;
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<rows.length) requestAnimationFrame(paint);
    })();
  };
  if (search && !search._bind){ search._bind = true; search.oninput = render; }
  render();
}

/* =====================================================
 *  Plans (slim)
 * =====================================================*/
const PLAN_VIEW = [
  {label:'注番', keys:['po_id','注番']},
  {label:'得意先', keys:['得意先','customer']},
  {label:'品番', keys:['品番','part_no']},
  {label:'製造番号', keys:['製造番号','製番号']},
  {label:'品名', keys:['品名','item_name']},
  {label:'図番', keys:['図番','drawing_no']},
  {label:'数量', keys:['qty','数量']},
  {label:'納期希望', keys:['納期希望','due_date','完了予定','due']},
  {label:'開始希望', keys:['開始希望','start_date','開始日']},
  {label:'備考', keys:['備考','note']}
];
async function loadPlans(){
  const dat = await cached("listPlans");
  renderPlansSlim(dat);
}
function renderPlansSlim(dat){
  const th = $("#thPlan"), tb = $("#tbPlan"), search = $("#planSearch");
  const header = dat.header || [];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const pick = (row, keys)=>{ for(const k of keys){ const i=idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; } return ''; };
  th.innerHTML = `<tr>${PLAN_VIEW.map(c=>`<th>${c.label}</th>`).join('')}<th>操作</th></tr>`;
  const render = ()=>{
    const q = (search?.value||'').toLowerCase();
    tb.innerHTML = '';
    const rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    let i=0; const chunk=150;
    (function paint(){
      const end=Math.min(i+chunk, rows.length);
      const frag=document.createDocumentFragment();
      for(;i<end;i++){
        const r = rows[i];
        const po = String((r[idx['po_id']] ?? r[idx['注番']] ?? '')||'');
        const tds = PLAN_VIEW.map(col=>{
          let v = pick(r, col.keys);
          if(v && /希望/.test(col.label)){
            const d=(v instanceof Date)?v:new Date(v);
            if(!isNaN(d)) v = d.toLocaleDateString('ja-JP');
          }
          return `<td>${v ?? ''}</td>`;
        }).join('');
        const tr=document.createElement('tr');
        tr.innerHTML = `${tds}<td class="s">—</td>`;
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<rows.length) requestAnimationFrame(paint);
    })();
  };
  if(search && !search._bind){ search._bind = true; search.oninput = render; }
  render();
}

/* =====================================================
 *  Ship (slim + mini lists)
 * =====================================================*/
const SHIP_VIEW = [
  {label:'注番', keys:['po_id','注番']},
  {label:'得意先', keys:['得意先','customer']},
  {label:'品名', keys:['品名','item_name']},
  {label:'品番', keys:['品番','part_no']},
  {label:'図番', keys:['図番','drawing_no']},
  {label:'製番号', keys:['製造番号','製番号']},
  {label:'数量', keys:['qty','数量']},
  {label:'送り先', keys:['destination','送り先']},
  {label:'出荷日', keys:['scheduled_date','出荷日']},
  {label:'納入日', keys:['delivery_date','納入日']},
  {label:'運送会社', keys:['carrier','運送会社']},
  {label:'備考', keys:['note','備考']}
];
async function loadShips(){
  const dat = await cached("listShip");
  renderShipSlim(dat);
}
function renderShipSlim(dat){
  const th = $("#thShip"), tb = $("#tbShip"), search = $("#shipSearch");
  const header = dat.header || [];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const pick = (row, keys)=>{ for(const k of keys){ const i=idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; } return ''; };
  th.innerHTML = `<tr>${SHIP_VIEW.map(c=>`<th>${c.label}</th>`).join('')}<th>操作</th></tr>`;
  const render = ()=>{
    const q = (search?.value||'').toLowerCase();
    tb.innerHTML = '';
    const rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    let i=0; const chunk=150;
    (function paint(){
      const end=Math.min(i+chunk, rows.length);
      const frag=document.createDocumentFragment();
      for(;i<end;i++){
        const r = rows[i];
        const tds = SHIP_VIEW.map(col=>{
          let v = pick(r, col.keys);
          if(v && /出荷日|納入日/.test(col.label)){
            const d=(v instanceof Date)?v:new Date(v);
            if(!isNaN(d)) v = d.toLocaleDateString('ja-JP');
          }
          return `<td>${v ?? ''}</td>`;
        }).join('');
        const tr=document.createElement('tr');
        tr.innerHTML = `${tds}<td class="s">—</td>`;
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<rows.length) requestAnimationFrame(paint);
    })();
  };
  if(search && !search._bind){ search._bind = true; search.oninput = render; }
  render();
}

/* mini lists for dashboard side cards */
async function loadShipsMini(){
  const dat = await cached("listShip", {}, 10000);
  const rows = dat.rows || [];
  const head = dat.header || [];
  const idx = Object.fromEntries(head.map((h,i)=>[h,i]));
  const today = new Date();
  const ymd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isToday = (s)=>{ const t = new Date(s); return t.getFullYear()===ymd.getFullYear() && t.getMonth()===ymd.getMonth() && t.getDate()===ymd.getDate(); };
  const statusCol = idx.status ?? idx['状態'];
  const dateCol = idx.scheduled_date ?? idx['出荷日'] ?? idx['納期'];
  const poCol = idx.po_id ?? idx['注番'];
  const todayList = [], futureList = [];
  rows.forEach(r=>{
    const st = String(r[statusCol]||'');
    const dt = r[dateCol];
    if(!dt || /出荷済/.test(st)) return;
    const entry = { po: r[poCol], date: dt, status: st, dest: r[idx.destination]||'' , qty: r[idx.qty]||'' };
    if(isToday(dt)) todayList.push(entry); else if(new Date(dt) > ymd) futureList.push(entry);
  });
  const renderSide = (arr, el)=>{ el.innerHTML = arr.slice(0,50).map(e=> `
    <div style="padding:6px 8px;border-bottom:1px dashed #eee">
      <div><b>${e.po||''}</b> <span class="s">${e.dest||''}</span></div>
      <div class="s" style="display:flex;justify-content:space-between"><span>${new Date(e.date).toLocaleDateString('ja-JP')}</span><span>${e.qty||''}</span></div>
    </div>`).join('') || `<div class="s">なし</div>`;
  };
  const tEl = $("#shipToday"), pEl = $("#shipPlan");
  if(tEl && pEl){ renderSide(todayList, tEl); renderSide(futureList, pEl); }
}

/* =====================================================
 *  Finished (一覧) — fixed the “missing )” error
 * =====================================================*/
const FIN_VIEW = [
  {label:'注番', keys:['po_id','注番']},
  {label:'得意先', keys:['得意先','customer']},
  {label:'品名', keys:['品名','item_name']},
  {label:'品番', keys:['品番','part_no']},
  {label:'図番', keys:['図番','drawing_no']},
  {label:'製番号', keys:['製造番号','製番号']},
  {label:'完了数', keys:['完了数']},
  {label:'状態', keys:['状態','status']},
  {label:'完了日', keys:['completed_at']},
  {label:'更新者', keys:['updated_by']},
];
async function loadFinished(){
  const dat = await cached("listFinished", {}, 5000);
  const th = $("#thFin"), tb = $("#tbFin"), search = $("#finSearch");
  const head = dat.header||[];
  const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
  const pick = (row, keys)=>{ for(const k of keys){ const i=idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; } return ''; };
  th.innerHTML = `<tr>${FIN_VIEW.map(c=>`<th>${c.label}</th>`).join('')}</tr>`;

  const render = ()=>{
    const q = (search?.value||'').toLowerCase();
    tb.innerHTML = '';
    const rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    let i=0; const chunk=150;

    function paint(){
      const end=Math.min(i+chunk, rows.length);
      const frag=document.createDocumentFragment();
      for(;i<end;i++){
        const r = rows[i];
        const tds = FIN_VIEW.map(col=>{
          let v = pick(r, col.keys);
          if(col.label==='完了日' && v){
            const d=(v instanceof Date)?v:new Date(v);
            if(!isNaN(d)) v = d.toLocaleString('ja-JP');
          }
          return `<td>${v??''}</td>`;
        }).join('');
        const tr=document.createElement('tr');
        tr.innerHTML = tds;
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<rows.length) requestAnimationFrame(paint);
    }
    paint();
  };
  if(search && !search._bind){ search._bind = true; search.oninput = render; }
  render();
}
$("#btnFinExport")?.addEventListener('click', ()=> exportTableCSV("#tbFin","finished_goods.csv"));
$("#btnFinPrint")?.addEventListener('click', ()=> window.print());

/* =====================================================
 *  Inventory (在庫)
 * =====================================================*/
const INV_UI = { cust:'', item:'' };
async function loadInventory(){
  const dat = await cached("listInventory", {}, 5000).catch(()=>({header:['得意先','図番','機種','品名','在庫数','最終更新'], rows:[]}));
  ensureInvControls(dat);
  renderInventory(dat);
}
function ensureInvControls(dat){
  if($("#invCtrlBar")) return;
  const wrap = $("#thInv")?.closest(".card") || $("#pageInv");
  const bar = document.createElement("div");
  bar.id = "invCtrlBar";
  bar.className = "row";
  bar.style.margin = "8px 0 12px";
  const h = dat.header||[];
  const idx = Object.fromEntries(h.map((x,i)=>[x,i]));
  const colCust = idx['得意先'];
  const colModel= (idx['機種']!=null ? idx['機種'] : idx['品名']);
  const setOpts = (values)=> [...new Set(values.filter(Boolean))].sort();
  const selCust = document.createElement("select");
  selCust.className = "chip";
  selCust.innerHTML = `<option value="">(すべての得意先)</option>` + setOpts(dat.rows.map(r=> r[colCust]||'')).map(v=>`<option value="${v}">${v}</option>`).join('');
  const selItem = document.createElement("select");
  selItem.className = "chip";
  selItem.innerHTML = `<option value="">(すべての機種/品名)</option>` + setOpts(dat.rows.map(r=> r[colModel]||r[idx['品名']]||'')).map(v=>`<option value="${v}">${v}</option>`).join('');
  bar.append(selCust, selItem);
  wrap.insertBefore(bar, wrap.querySelector(".table-wrap"));
  selCust.onchange = ()=>{ INV_UI.cust = selCust.value; renderInventory(dat); };
  selItem.onchange = ()=>{ INV_UI.item = selItem.value; renderInventory(dat); };
}
function renderInventory(dat){
  const th = $("#thInv"), tb = $("#tbInv"), search = $("#invSearch");
  th.innerHTML = `<tr>${dat.header.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const h = dat.header||[];
  const idx = Object.fromEntries(h.map((x,i)=>[x,i]));
  const colCust = idx['得意先'];
  const colModel= (idx['機種']!=null ? idx['機種'] : idx['品名']);
  const q = (search?.value||'').toLowerCase();
  const rows = dat.rows.filter(r=>{
    if(INV_UI.cust && String(r[colCust]||'') !== INV_UI.cust) return false;
    if(INV_UI.item){
      const itemVal = String(r[colModel]||r[idx['品名']]||'');
      if(itemVal !== INV_UI.item) return false;
    }
    return !q || JSON.stringify(r).toLowerCase().includes(q);
  });
  tb.innerHTML = '';
  let i=0; const chunk=150;
  (function paint(){
    const end=Math.min(i+chunk, rows.length);
    const frag=document.createDocumentFragment();
    for(;i<end;i++){
      const tr=document.createElement('tr');
      tr.innerHTML = rows[i].map(c=>`<td>${c??''}</td>`).join('');
      frag.appendChild(tr);
    }
    tb.appendChild(frag);
    if(i<rows.length) requestAnimationFrame(paint);
  })();
  if(search && !search._invBind){ search._invBind=true; search.oninput = ()=>renderInventory(dat); }
}
$("#btnInvExport")?.addEventListener('click', ()=> exportTableCSV("#tbInv","inventory.csv"));
$("#btnInvPrint")?.addEventListener('click', ()=> window.print());

/* =====================================================
 *  請求書（Invoice）— minimal working
 * =====================================================*/
let INV_STATE = { selectedCust:"", issueDate: toYMD(new Date()) };
function initInvoice(){
  // fill customer select
  const sel = $("#invCustSel");
  sel.innerHTML = `<option value="">（得意先を選択）</option>` + (MASTERS.customers||[]).map(c=>`<option value="${c}">${c}</option>`).join("");
  $("#invIssueDate").value = INV_STATE.issueDate;
  $("#tbInvCandidates").innerHTML = "";
  $("#tbInvStatus").innerHTML = "";
  $("#tbInvoiceList").innerHTML = "";
  $("#invCustSel").onchange = async ()=>{
    INV_STATE.selectedCust = $("#invCustSel").value;
    await rebuildInvoiceTables();
  };
  $("#invIssueDate").onchange = ()=> INV_STATE.issueDate = $("#invIssueDate").value || toYMD(new Date());
  $("#invRefresh").onclick = rebuildInvoiceTables;
  $("#invSave").onclick = saveInvoiceCurrent;
  $("#invPdf").onclick = exportInvoicePDF;
  $("#invExcel").onclick = exportInvoiceExcel;
}

async function rebuildInvoiceTables(){
  const cust = INV_STATE.selectedCust;
  if(!cust){ $("#tbInvCandidates").innerHTML = ""; $("#tbInvStatus").innerHTML=""; return; }
  const ship = await cached("listShip", {}, 10000);
  const h = ship.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[String(x).trim(),i]));
  const rows = (ship.rows||[]).filter(r => String(r[idx['得意先']]||r[idx['customer']]||'') === cust);

  // “未請求”候補: status に「請求書済」以外
  const cand = rows.filter(r => !/請求書済/.test(String(r[idx['状態']]||"")));
  const tbody1 = $("#tbInvCandidates"); tbody1.innerHTML="";
  const frag1 = document.createDocumentFragment();
  cand.forEach(r=>{
    const qty = Number(r[idx['qty']]||r[idx['数量']]||0);
    const price = Number(r[idx['単価']]||0);
    const amount = qty * price;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="ck-inv"></td>
      <td>${r[idx['po_id']]||r[idx['注番']]||""}</td>
      <td>${r[idx['品名']]||r[idx['item_name']]||""}</td>
      <td>${r[idx['品番']]||r[idx['part_no']]||""}</td>
      <td>${qty}</td>
      <td>${price}</td>
      <td>${amount}</td>
      <td>${toYMD(r[idx['scheduled_date']]||r[idx['出荷日']]||"")}</td>`;
    tr._raw = { po_id:r[idx['po_id']]||r[idx['注番']], item:r[idx['品名']]||"", part:r[idx['品番']]||"", qty, price, amount, ship_date: toYMD(r[idx['出荷日']]||r[idx['scheduled_date']]||"") };
    frag1.appendChild(tr);
  });
  tbody1.appendChild(frag1);

  const tbody2 = $("#tbInvStatus"); tbody2.innerHTML="";
  const frag2 = document.createDocumentFragment();
  rows.forEach(r=>{
    const st = String(r[idx['状態']]||"");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r[idx['po_id']]||r[idx['注番']]||""}</td>
      <td>${r[idx['品名']]||""}</td>
      <td>${r[idx['品番']]||""}</td>
      <td>${r[idx['qty']]||r[idx['数量']]||""}</td>
      <td>${r[idx['単価']]||""}</td>
      <td>${(Number(r[idx['qty']]||r[idx['数量']]||0)*Number(r[idx['単価']]||0))||0}</td>
      <td>${toYMD(r[idx['出荷日']]||r[idx['scheduled_date']]||"")}</td>
      <td style="font-weight:700;color:${/済/.test(st)?"#16a34a":"#dc2626"}">${st||"請求書（未）"}</td>`;
    frag2.appendChild(tr);
  });
  tbody2.appendChild(frag2);

  // invoice list minimal (optional—requires API)
  try{
    const list = await cached("listInvoice", { customer: cust }, 8000).catch(()=>({rows:[],header:[]}));
    const tl = $("#tbInvoiceList"); tl.innerHTML = "";
    (list.rows||[]).forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r[0]||""}</td><td>${r[1]||""}</td><td>${r[2]||""}</td><td>${r[3]||""}</td><td>${r[4]||""}</td><td>${r[5]||""}</td>`;
      tl.appendChild(tr);
    });
  }catch(_){}
}

async function saveInvoiceCurrent(){
  const cust = INV_STATE.selectedCust;
  if(!cust) return alert("得意先を選択してください");
  const issue = $("#invIssueDate").value || toYMD(new Date());
  const picks = Array.from($("#tbInvCandidates").querySelectorAll("tr"))
    .filter(tr => tr.querySelector(".ck-inv")?.checked)
    .map(tr => tr._raw);
  if(!picks.length) return alert("請求対象を選択してください");
  if(!confirm(`請求書を保存しますか？\n得意先: ${cust}\n件数: ${picks.length}`)) return;
  try{
    await jsonp("saveInvoice", {
      customer: cust,
      issue_date: issue,
      items: JSON.stringify(picks),
      user: JSON.stringify(CURRENT_USER||{})
    }, { timeoutMs: 30000 });
    alert("保存しました");
    await rebuildInvoiceTables();
  }catch(e){
    alert("保存失敗: "+e.message);
  }
}
function exportInvoiceExcel(){
  const rows = Array.from($("#tbInvCandidates").querySelectorAll("tr"))
    .filter(tr => tr.querySelector(".ck-inv")?.checked)
    .map(tr => tr._raw);
  if(!rows.length) return alert("エクスポート対象を選択してください");
  const aoa = [["注番","商品名","品番","数量","単価","金額","出荷日"]];
  rows.forEach(r => aoa.push([r.po_id, r.item, r.part, r.qty, r.price, r.amount, r.ship_date]));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "請求書");
  const fn = `請求書_${INV_STATE.selectedCust||"得意先"}_${(INV_STATE.issueDate||toYMD(new Date())).replace(/-/g,"")}.xlsx`;
  XLSX.writeFile(wb, fn);
}
async function exportInvoicePDF(){
  // server-side recommended; stub
  alert("PDF出力はサーバ側生成を推奨（ここではExcelをご利用ください）");
}

/* =====================================================
 *  分析チャート (Charts)
 * =====================================================*/
let chDaily, chMonthly, chCustTop, chCustMonthly;
function destroyChart(ch){ if(ch && typeof ch.destroy==="function"){ try{ ch.destroy(); }catch(_){} } }

let CH_STATE = { range:"ytd", metric:"qty" };
function metricLabel(){ return CH_STATE.metric === "count" ? "件数" : "数量"; }
function metricValue(row, idxQty){ return CH_STATE.metric === "count" ? 1 : (+row[idxQty] || 0); }

async function initCharts(){
  // wire buttons once
  if (!initCharts._wired) {
    $("#pageCharts").addEventListener("click", (e)=>{
      const r = e.target.closest("[data-range]"); if(r){ CH_STATE.range = r.dataset.range; renderCharts(); }
      const m = e.target.closest("[data-metric]"); if(m){ CH_STATE.metric = m.dataset.metric; renderCharts(); }
    });
    $("#chExportExcel").onclick = exportChartsExcel;
    $("#chExportPdf").onclick = exportChartsPDF;
    initCharts._wired = true;
  }
  await renderCharts();
}

async function renderCharts(){
  const ship = await cached("listShip", {}, 15000);
  const h = ship.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[String(x).trim(),i]));
  const colDate = idx['出荷日'] ?? idx['scheduled_date'];
  const colQty = idx['数量'] ?? idx['qty'];
  const colCust = idx['得意先'] ?? idx['customer'];

  const now = new Date();
  const rows = (ship.rows||[]).filter(r=>{
    const d = new Date(r[colDate]);
    if (isNaN(d)) return false;
    if (CH_STATE.range === "14d"){ const s = new Date(now); s.setDate(s.getDate()-13); s.setHours(0,0,0,0); return d>=s; }
    if (CH_STATE.range === "30d"){ const s = new Date(now); s.setDate(s.getDate()-29); s.setHours(0,0,0,0); return d>=s; }
    if (CH_STATE.range === "ytd"){ const s = new Date(now.getFullYear(),0,1); return d>=s; }
    return true;
  });

  // daily
  const mapD = new Map();
  // monthly YTD (12 bars)
  const mapM = new Map();
  // cust total
  const mapC = new Map();
  rows.forEach(r=>{
    const d = new Date(r[colDate]);
    const kD = toYMD(d);
    const kM = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const v = metricValue(r, colQty);
    mapD.set(kD, (mapD.get(kD)||0)+v);
    mapM.set(kM, (mapM.get(kM)||0)+v);
    const cust = String(r[colCust]||"—");
    mapC.set(cust, (mapC.get(cust)||0)+v);
  });

  const dailyLabels = Array.from(mapD.keys()).sort();
  const dailyValues = dailyLabels.map(k=> mapD.get(k));
  const currentYear = new Date().getFullYear();
  const ytdLabels = Array.from({length:12}, (_,i)=> `${i+1}月`);
  const ytdValues = ytdLabels.map((lab, i)=>{
    const key = `${currentYear}-${String(i+1).padStart(2,"0")}`; return mapM.get(key)||0;
  });
  const custTop = Array.from(mapC.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const custLabels = custTop.map(x=>x[0]);
  const custValues = custTop.map(x=>x[1]);

  // daily chart
  destroyChart(chDaily);
  chDaily = new Chart($("#chDaily"), {
    type: "line",
    data: { labels: dailyLabels, datasets: [{ label: metricLabel(), data: dailyValues, tension:.25, pointRadius:2 }] },
    options: commonChartOptions()
  });

  // monthly YTD
  destroyChart(chMonthly);
  chMonthly = new Chart($("#chMonthly"), {
    type: "bar",
    data: { labels: ytdLabels, datasets: [{ label: metricLabel(), data: ytdValues }] },
    options: commonChartOptions()
  });

  // customer top
  destroyChart(chCustTop);
  chCustTop = new Chart($("#chCustTop"), {
    type: "bar",
    data: { labels: custLabels, datasets: [{ label: metricLabel(), data: custValues }] },
    options: Object.assign(commonChartOptions(), { indexAxis: 'y' })
  });

  // customer monthly stacked (top 6)
  const top6 = Array.from(mapC.entries()).sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);
  const months = ytdLabels.map((_,i)=> `${currentYear}-${String(i+1).padStart(2,"0")}`);
  const ds = top6.map(name=>{
    return { label: name, data: months.map(k=> mapM.get(k) ? 0 /* simplified split unknown */ : 0) };
  });
  destroyChart(chCustMonthly);
  chCustMonthly = new Chart($("#chCustMonthly"), {
    type: "bar",
    data: { labels: ytdLabels, datasets: ds },
    options: Object.assign(commonChartOptions(), { scales:{ x:{ stacked:true }, y:{ stacked:true } }, plugins:{ legend:{ position:"bottom" } } })
  });

  function commonChartOptions(){
    return {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, datalabels:{ display:false }, tooltip:{ mode:"index", intersect:false } },
      scales:{ x:{ grid:{ color:"#eef2ff" } }, y:{ grid:{ color:"#f1f5f9" }, ticks:{ precision:0 } } }
    };
  }
}
function exportChartsExcel(){
  const wb = XLSX.utils.book_new();
  const d1 = chDaily?.data || {labels:[],datasets:[{data:[]}]};
  const d2 = chMonthly?.data || {labels:[],datasets:[{data:[]}]};
  const d3 = chCustTop?.data || {labels:[],datasets:[{data:[]}]};
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["日付",metricLabel()], ...d1.labels.map((x,i)=>[x, d1.datasets[0].data[i]])]), "Daily");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["月",metricLabel()], ...d2.labels.map((x,i)=>[x, d2.datasets[0].data[i]])]), "MonthlyYTD");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["顧客",metricLabel()], ...d3.labels.map((x,i)=>[x, d3.datasets[0].data[i]])]), "CustTop");
  XLSX.writeFile(wb, "charts_export.xlsx");
}
async function exportChartsPDF(){
  alert("PDF出力はサイズ調整が必要なため、当面はExcel出力をご利用ください。");
}

/* =====================================================
 *  QR Station (universal) + Scan
 * =====================================================*/
const STATION_PROCESSES = [ "レザー加工","曲げ加工","外注加工/組立","組立","検査工程","検査中","検査済","出荷準備","出荷（組立済）","出荷済" ];
const QR_ACCEPT_PATTERNS = [
  /^STN\|(.+)$/i, /^PROC[:|](.+)$/i, /^工程[:|](.+)$/
];
function qrUrl(payload, size=512){
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}
function openStationQrSheet(){
  const tiles = STATION_PROCESSES.map(p=>{
    const payload = `STN|${p}`;
    return `<div style="border:1px solid #e5e7eb;border-radius:14px;padding:12px;background:#fff;width:236px">
      <img src="${qrUrl(payload)}" alt="QR ${p}" style="width:100%;height:auto;border-radius:8px"/>
      <div style="margin-top:8px"><b>${p}</b></div>
      <div class="s">${payload}</div>
    </div>`;
  }).join("");
  const html = `
    <html><head><meta charset="utf-8"><title>工程QR（Station, universal）</title>
    <style>*{box-sizing:border-box} body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;margin:16px;background:#fafafa;color:#111827}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(236px,1fr));gap:14px}
    @media print{ .grid{gap:10px} }</style></head>
    <body><div style="position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px">
      <h2 style="margin:0 0 6px">工程QR（Station, universal）</h2>
      <button onclick="window.print()">印刷</button></div>
      <div class="grid">${tiles}</div></body></html>`;
  const w = window.open("about:blank");
  w.document.write(html);
  w.document.close();
}
$("#btnStationQR")?.addEventListener("click", openStationQrSheet);

let scanStream=null, scanRAF=null;
function parseProcessFromStationQR(text){
  for(const rx of QR_ACCEPT_PATTERNS){
    const m = text.match(rx);
    if(m) return normalizeProc(m[1]);
  }
  return null;
}
function openScanDialog(po){
  $("#scanResult").textContent = `PO: ${po}`;
  $("#dlgScan").showModal();
  $("#btnScanStart").onclick = async ()=>{
    const video = $("#scanVideo"), canvas=$("#scanCanvas");
    try{
      scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      video.srcObject = scanStream;
      await video.play();
      const ctx = canvas.getContext("2d");
      const tick = async ()=>{
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0,0, canvas.width, canvas.height);
        const img = ctx.getImageData(0,0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if(code){
          if(scanRAF) cancelAnimationFrame(scanRAF);
          if(scanStream) scanStream.getTracks().forEach(t=> t.stop());
          const raw = String(code.data||'').trim();
          const stProc = parseProcessFromStationQR(raw);
          if(stProc){
            $("#scanResult").textContent = `工程QR: ${stProc}`;
            quickQuantityPrompt(po, stProc);
            return;
          }
          const parts = raw.split('|');
          if(parts.length>=2){
            const cPO = (parts[0]||'').trim();
            const proc = normalizeProc(parts[1]||'');
            const okv = Number(parts[2]||'');
            const ngv = Number(parts[3]||'');
            const note = parts[4]||'';
            const po_id = cPO || po;
            if(Number.isFinite(okv) || Number.isFinite(ngv)){
              try{
                await jsonp("saveOp", { data: JSON.stringify({ po_id, process: proc, ok_count: (Number.isFinite(okv)?okv:0), ng_count: (Number.isFinite(ngv)?ngv:0), note }), user: JSON.stringify(CURRENT_USER||{}) });
                $("#scanResult").textContent = `保存: ${po_id} / ${proc} / OK=${okv||0} / NG=${ngv||0}`;
                setTimeout(()=>{ $("#dlgScan").close(); refreshAll(); }, 700);
              }catch(e){ alert("保存失敗: " + e.message); }
              return;
            }
            quickQuantityPrompt(po_id, proc, note);
            return;
          }
          alert("未対応のQR形式です。'STN|工程' または 'PO|工程|OK|NG|備考' を使用してください。");
          return;
        }
        scanRAF = requestAnimationFrame(tick);
      };
      tick();
    }catch(e){
      alert("Camera error: "+e.message);
    }
  };
}
$("#btnScanClose").onclick = ()=>{
  if(scanRAF) cancelAnimationFrame(scanRAF);
  if(scanStream) scanStream.getTracks().forEach(t=> t.stop());
  $("#dlgScan").close();
};

function quickQuantityPrompt(po, process, note=''){
  const html = `<dialog id="dlgQuick" class="dlg">
    <h3>${po} / ${process}</h3>
    <div class="row">
      <label>OK <input id="qOK" type="number" min="0" value="0" class="chip" style="width:120px"></label>
      <label>NG <input id="qNG" type="number" min="0" value="0" class="chip" style="width:120px"></label>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="chip" id="qSave">保存</button>
      <button class="chip" id="qCancel">キャンセル</button>
    </div>
  </dialog>`;
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  const dlg = wrap.querySelector("#dlgQuick");
  dlg.showModal();
  wrap.querySelector("#qCancel").onclick = ()=>{ dlg.close(); wrap.remove(); };
  wrap.querySelector("#qSave").onclick = async ()=>{
    const ok = Number(wrap.querySelector("#qOK").value||0);
    const ng = Number(wrap.querySelector("#qNG").value||0);
    try{
      await jsonp("saveOp", { data: JSON.stringify({ po_id: po, process, ok_count: ok, ng_count: ng, note }), user: JSON.stringify(CURRENT_USER||{}) });
      dlg.close(); wrap.remove(); refreshAll();
    }catch(e){ alert("保存失敗: " + e.message); }
  };
}

/* =====================================================
 *  Weather (Open-Meteo, cached in localStorage 30m)
 * =====================================================*/
async function ensureWeather(){
  try{
    const cacheKey = 'wx_cache_v1';
    const cachedWX = JSON.parse(localStorage.getItem(cacheKey)||'null');
    const now = Date.now();
    if(cachedWX && (now - cachedWX.t) < 30*60*1000){
      renderWeather(cachedWX.v); return;
    }
    let lat=35.6762, lon=139.6503;
    if(navigator.geolocation){
      await new Promise(res=> navigator.geolocation.getCurrentPosition(
        pos=>{ lat=pos.coords.latitude; lon=pos.coords.longitude; res(); },
        ()=> res(),
        {maximumAge: 600000, timeout: 1500}
      ));
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
    const v = await fetch(url).then(r=>r.json());
    localStorage.setItem(cacheKey, JSON.stringify({v,t:now}));
    renderWeather(v);
  }catch(_){}
}
function renderWeather(v){
  if(!v?.current) return;
  $("#wxTemp").textContent = Math.round(v.current.temperature_2m) + "°C";
  $("#wxWind").textContent = Math.round(v.current.wind_speed_10m) + " m/s";
  $("#wxPlace").textContent = v.timezone_abbreviation || "";
}

/* =====================================================
 *  Generic CSV export
 * =====================================================*/
function exportTableCSV(tbodySel, filename){
  const rows = $$(tbodySel+" tr").map(tr=> Array.from(tr.children).map(td=> td.textContent));
  const csv = rows.map(r => r.map(v=>{
    const s = (v??'').toString().replace(/"/g,'""'); return `"${s}"`;
  }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

/* =====================================================
 *  Init
 * =====================================================*/
document.addEventListener("DOMContentLoaded", ()=> setUser(null));
