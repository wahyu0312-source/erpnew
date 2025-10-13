/* ======================== CONFIG ======================== */
const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

/* ======================== DOM HELPERS ======================== */
const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const qs = (o) =>
  Object.entries(o)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

const fmtDate = (v) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? "" : d.toLocaleString("ja-JP");
};
const normalizeProc = (s) =>
  String(s || "").trim()
    .replace("レーサ加工", "レザー加工")
    .replace("外作加工", "外注加工/組立") || "未設定";

/* ======================== JSONP ======================== */
function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    params = { ...params, action, callback: cb };
    s.src = `${API_BASE}?${qs(params)}`;

    let to = setTimeout(() => {
      cleanup();
      reject(new Error("API timeout"));
    }, 20000);

    function cleanup() {
      try { delete window[cb]; } catch (_) {}
      s.remove();
      clearTimeout(to);
    }

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

/* ======================== CACHE ======================== */
const apiCache = new Map();
async function cached(action, params = {}, ttlMs = 15000) {
  const key = action + ":" + JSON.stringify(params || {});
  const hit = apiCache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await jsonp(action, params);
  apiCache.set(key, { v, t: now });
  return v;
}

/* ======================== GLOBAL STATE ======================== */
let CURRENT_USER = null;
let MASTERS = { customers: [], drawings: [], item_names: [], part_nos: [], destinations: [], carriers: [], po_ids: [] };

const ROLE_MAP = {
  admin: { pages: ["pageDash", "pageSales", "pagePlan", "pageShip", "pageFinished", "pageInv", "pageInvoice"], nav: true },
  "営業": { pages: ["pageSales", "pageDash", "pageFinished", "pageInv", "pageInvoice"], nav: true },
  "生産管理": { pages: ["pagePlan", "pageShip", "pageDash", "pageFinished", "pageInv", "pageInvoice"], nav: true },
  "生産管理部": { pages: ["pagePlan", "pageShip", "pageDash", "pageFinished", "pageInv", "pageInvoice"], nav: true },
  "製造": { pages: ["pageDash", "pageFinished", "pageInv"], nav: true },
  "検査": { pages: ["pageDash", "pageFinished", "pageInv"], nav: true },
};

/* ======================== AUTH ======================== */
function show(id) {
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice"]
    .forEach(p => $("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}

function setUser(u) {
  CURRENT_USER = u || null;
  $("#userInfo").textContent = u ? `${u.role} / ${u.department}` : "";

  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice"];
  pages.forEach(p => $("#"+p)?.classList.add("hidden"));
  ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToFinPage','btnToInvPage','btnToInvoice','ddSetting','weatherWrap']
    .forEach(id=> $("#"+id)?.classList.add("hidden"));

  if (!u) { show("authView"); return; }

  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP.admin;
  if (allow?.nav) {
    if (allow.pages.includes('pageDash')) $("#btnToDash").classList.remove("hidden");
    if (allow.pages.includes('pageSales')) $("#btnToSales").classList.remove("hidden");
    if (allow.pages.includes('pagePlan')) $("#btnToPlan").classList.remove("hidden");
    if (allow.pages.includes('pageShip')) $("#btnToShip").classList.remove("hidden");
    if (allow.pages.includes('pageFinished')) $("#btnToFinPage").classList.remove("hidden");
    if (allow.pages.includes('pageInv')) $("#btnToInvPage").classList.remove("hidden");
    if (allow.pages.includes('pageInvoice')) $("#btnToInvoice").classList.remove("hidden");
    $("#ddSetting").classList.remove("hidden");
    $("#weatherWrap").classList.remove("hidden");
  }

  show("pageDash");
  ensureWeather();
  // === FIX #1: fungsi ini sebelumnya tidak ada ===
  loadMasters().then(refreshAll).catch(()=>refreshAll());
}

$("#btnLogin").onclick = loginSubmit;
$("#inUser").addEventListener("keydown", (e)=>{ if(e.key==='Enter') loginSubmit(); });
$("#inPass").addEventListener("keydown", (e)=>{ if(e.key==='Enter') loginSubmit(); });

async function loginSubmit() {
  const username = $("#inUser").value.trim();
  const password = $("#inPass").value.trim();
  if (!username || !password) return alert("ユーザー名 / パスワード を入力してください");
  try {
    await jsonp("ping");
    const me = await jsonp("login", { username, password });
    setUser(me);
  } catch (e) {
    alert("ログイン失敗: " + (e?.message || e));
  }
}

$("#btnLogout").onclick = ()=> setUser(null);

/* ======================== MASTERS ======================== */
// === FIX #2: implement loadMasters yang hilang ===
async function loadMasters() {
  try {
    const m = await cached("listMasters", {}, 30000);
    MASTERS = m || MASTERS;
    return MASTERS;
  } catch (e) {
    console.warn("loadMasters failed", e);
    return MASTERS;
  }
}

/* ======================== DASHBOARD ======================== */
async function refreshAll() {
  await Promise.all([loadOrders(), loadShipPanels()]);
}

function colIdx(head) {
  return Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
}

async function loadOrders() {
  const tb = $("#tbOrders");
  tb.innerHTML = "";
  let rows = [];
  try {
    rows = await cached("listOrders", {}, 8000); // backend returns array of objects
  } catch (_){ rows = []; }

  if (Array.isArray(rows) && rows.length) {
    const frag = document.createDocumentFragment();
    rows.forEach(o => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${o.po_id || ""}</b><div class="muted s">${o['得意先']||""}</div></td>
        <td>${o['品名']||""}</td>
        <td>${o['品番']||""}</td>
        <td>${o['図番']||""}</td>
        <td>${statusToBadge(o.status || "")}</td>
        <td>${procToChip(o.current_process || "")}</td>
        <td>${fmtDate(o.updated_at)}</td>
        <td>${o.updated_by||""}</td>
        <td class="center">
          <div class="actions">
            <button class="btn icon ghost" data-po="${o.po_id}" onclick="openManualOp('${o.po_id||""}')">
              <i class="fa-regular fa-keyboard"></i><span>入力</span>
            </button>
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });
    tb.appendChild(frag);
  } else {
    tb.innerHTML = `<tr><td colspan="9" class="center muted">データがありません</td></tr>`;
  }
}

async function loadShipPanels() {
  const todayBox = $("#shipToday");
  const futureBox = $("#shipPlan");
  todayBox.innerHTML = ""; futureBox.innerHTML = "";

  const dat = await cached("listShip", {}, 10000).catch(()=>({header:[],rows:[]}));
  const head = dat.header || [];
  const idx = colIdx(head);

  const get = (r, ...cands)=> {
    for (const k of cands) if (idx[k]!=null) return r[idx[k]];
    return "";
  };

  const todayStr = new Date().toISOString().slice(0,10);
  (dat.rows||[]).forEach(r=>{
    const po = get(r,'po_id','注番');
    const cust = get(r,'得意先','customer');
    const name = get(r,'品名','item_name');
    const qty  = get(r,'数量','qty');
    const due  = get(r,'出荷日','納期','delivery_date','due_date');
    const st   = get(r,'状態','status');

    const html = `
      <div class="ship-item">
        <div class="row-between">
          <div><b>${po}</b> / ${cust}</div>
          <div class="muted s">${fmtDate(due)}</div>
        </div>
        <div class="row-between">
          <div>${name || "—"}</div>
          <div class="muted s">数量: ${qty||0}</div>
        </div>
        <div class="muted s">${st||""}</div>
      </div>
    `;
    if (String(due||"").startsWith(todayStr)) todayBox.insertAdjacentHTML("beforeend", html);
    else futureBox.insertAdjacentHTML("beforeend", html);
  });

  if (!todayBox.children.length) todayBox.innerHTML = `<div class="muted s center">本日の出荷はありません</div>`;
  if (!futureBox.children.length) futureBox.innerHTML = `<div class="muted s center">今後の出荷はありません</div>`;
}

/* ======================== SIMPLE OP DIALOG (optional) ======================== */
window.openManualOp = function(po){
  $("#opPO").textContent = po || "";
  const sel = $("#opProcess");
  sel.innerHTML = ["準備","レザー加工","曲げ","外注加工/組立","検査済","出荷済"]
    .map(x=>`<option value="${x}">${x}</option>`).join("");
  $("#opOK").value = 0; $("#opNG").value = 0; $("#opNote").value = "";
  $("#btnOpSave").onclick = async ()=>{
    const payload = {
      po_id: po,
      process: $("#opProcess").value,
      ok_count: Number($("#opOK").value||0),
      ng_count: Number($("#opNG").value||0),
      note: $("#opNote").value
    };
    try{
      await jsonp("saveOp", { data: JSON.stringify(payload), user: JSON.stringify(CURRENT_USER||{}) });
      alert("保存しました");
      $("#dlgOp").close();
      refreshAll();
    }catch(e){ alert("保存失敗: " + e.message); }
  };
  $("#dlgOp").showModal();
};
$("#btnOpCancel").onclick = ()=> $("#dlgOp").close();

/* ======================== LIST PAGES ======================== */
$("#btnToDash").onclick = ()=>{ show("pageDash"); refreshAll(); };
$("#btnToSales").onclick = ()=>{ show("pageSales"); loadSales(); };
$("#btnToPlan").onclick  = ()=>{ show("pagePlan");  loadPlans(); };
$("#btnToShip").onclick  = ()=>{ show("pageShip");  loadShips(); };
$("#btnToFinPage").onclick=()=>{ show("pageFinished"); loadFinished(); };
$("#btnToInvPage").onclick=()=>{ show("pageInv"); loadInventory(); };
$("#btnToInvoice").onclick=()=>{ show("pageInvoice"); loadInvoiceList(); };

/* ==== generic table loaders connected to your backend ==== */
async function paintSheet(whereHead, whereBody, payload, opts = {}) {
  const { header, rows } = await cached(payload, {}, 10000).catch(()=>({header:[], rows:[]}));
  const th = $(whereHead), tb = $(whereBody);
  th.innerHTML = `<tr>${header.map(h=>`<th>${h}</th>`).join("")}</tr>`;
  tb.innerHTML = rows.length
    ? rows.map(r=>`<tr>${r.map(c=>{
        if (c instanceof Date) return `<td>${fmtDate(c)}</td>`;
        return `<td>${c ?? ""}</td>`;
      }).join("")}</tr>`).join("")
    : `<tr><td colspan="${Math.max(1, header.length)}" class="center muted">データがありません</td></tr>`;
}

function loadSales(){ return paintSheet("#thSales","#tbSales","listSales"); }
function loadPlans(){ return paintSheet("#thPlan","#tbPlan","listPlans"); }
function loadShips(){ return paintSheet("#thShip","#tbShip","listShip"); }
function loadFinished(){ return paintSheet("#thFin","#tbFin","listFinished"); }

/* ===== Inventory uses special endpoint listInventory_() ===== */
async function loadInventory(){
  await paintSheet("#thInv","#tbInv","listInventory");
}

/* ======================== INVOICES (selaras dengan Code.gs) ======================== */
async function loadInvoiceList(){
  const list = await jsonp("listInvoices").catch(()=>({header:[],rows:[]}));
  const head = list.header||[];
  const idx = colIdx(head);
  const th = $("#thInvoices"), tb = $("#tbInvoices");
  th.innerHTML = `<tr><th>請求No</th><th>得意先</th><th>請求先</th><th>請求日</th><th>税率</th><th>通貨</th><th>状態</th><th>操作</th></tr>`;
  tb.innerHTML = "";
  (list.rows||[]).forEach(r=>{
    const inv = r[idx['invoice_id']] ?? r[0];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${inv||""}</b></td>
      <td>${r[idx['得意先']]||""}</td>
      <td>${r[idx['請求先']]||""}</td>
      <td>${fmtDate(r[idx['請求日']])}</td>
      <td>${r[idx['税率']]??""}</td>
      <td>${r[idx['通貨']]||""}</td>
      <td>${r[idx['状態']]||""}</td>
      <td class="center">
        <div class="row">
          <button class="btn ghost" onclick="openInvoiceEditor('${inv}')"><i class="fa-regular fa-pen-to-square"></i> 編集</button>
          <button class="btn ghost" onclick="openInvoicePdf('${inv}')"><i class="fa-regular fa-file-pdf"></i> PDF</button>
          <button class="btn ghost" onclick="deleteInvoice('${inv}')"><i class="fa-regular fa-trash-can"></i> 削除</button>
        </div>
      </td>`;
    tb.appendChild(tr);
  });
  if (!tb.children.length) tb.innerHTML = `<tr><td colspan="8" class="center muted">データがありません</td></tr>`;
}
$("#btnInvoiceCreate").onclick = ()=> openInvoiceEditor("");

/* ==== Editor (pakai action yang ada: saveInvoice/saveInvoiceLine/exportInvoice/invoiceAddFromShip/deleteInvoice) ==== */
// (versi ringkas; UI kamu yang sudah rapi boleh dipakai — yang penting action-nya ini)
async function openInvoiceEditor(invoice_id){
  // … kamu bisa gunakan versi editor kamu sendiri …
  // Untuk singkat: saat ini cukup ambil header+lines dan tampilkan PDF.
  if (!invoice_id) {
    alert("まずは請求書を作成して保存してください（ヘッダ + 明細）");
    return;
  }
  const pack = await jsonp("exportInvoice", { invoice_id });
  if (!pack || !pack.header) return alert("データが見つかりません");
  alert(`請求書 ${invoice_id} を読み込みました（PDFボタンでプレビューできます）`);
}
async function openInvoicePdf(invoice_id){
  const pack = await jsonp("exportInvoice", { invoice_id });
  if (!pack || !pack.header) return alert("データが見つかりません");

  const H = pack.header, L = pack.lines || [];
  const d = (v)=>{ const x=(v instanceof Date)?v:new Date(v); return isNaN(x)?'':x.toLocaleDateString('ja-JP'); };
  const taxRate = Number(H['税率']||0)/100;
  const sub = L.reduce((s,x)=> s + Number(x['金額']|| (Number(x['数量']||0)*Number(x['単価']||0))), 0);
  const tax= Math.round(sub*taxRate);
  const tot= sub+tax;

  const rowsHtml = L.map(x=>`
    <tr>
      <td class="t-center">${x['注番']||''}</td>
      <td>${x['品名']||''}</td>
      <td class="t-center">${x['品番']||''}</td>
      <td class="t-center">${x['図番']||''}</td>
      <td class="t-right">${Number(x['数量']||0).toLocaleString()}</td>
      <td class="t-right">${Number(x['単価']||0).toLocaleString()}</td>
      <td class="t-right">${Number(x['金額']|| (Number(x['数量']||0)*Number(x['単価']||0))).toLocaleString()}</td>
      <td>${x['備考']||''}</td>
    </tr>`).join('');

  const html = `
  <html><head><meta charset="utf-8"><title>請求書 ${H['invoice_id']||''}</title>
  <link rel="stylesheet" href="./style.css"></head>
  <body class="inv-body">
    <div class="invoice">
      <div class="inv-head">
        <div class="inv-title">請 求 書</div>
        <div class="inv-meta">
          <div><span>請求No</span><b>${H['invoice_id']||''}</b></div>
          <div><span>請求日</span><b>${d(H['請求日'])}</b></div>
          <div><span>通貨</span><b>${H['通貨']||''}</b></div>
          <div><span>状態</span><b>${H['状態']||''}</b></div>
        </div>
      </div>
      <div class="inv-to">
        <div class="box"><div class="lbl">得意先</div><div class="val">${H['得意先']||''}</div></div>
        <div class="box"><div class="lbl">請求先</div><div class="val">${H['請求先']||''}</div></div>
      </div>
      <table class="inv-table">
        <thead><tr><th>注番</th><th>品名</th><th>品番</th><th>図番</th><th class="t-right">数量</th><th class="t-right">単価</th><th class="t-right">金額</th><th>備考</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="8" class="t-center muted">明細はありません</td></tr>'}</tbody>
        <tfoot>
          <tr><td colspan="6" class="t-right">小計</td><td class="t-right">${sub.toLocaleString()}</td><td></td></tr>
          <tr><td colspan="6" class="t-right">消費税 (${H['税率']||0}%)</td><td class="t-right">${tax.toLocaleString()}</td><td></td></tr>
          <tr><td colspan="6" class="t-right"><b>合計</b></td><td class="t-right"><b>${tot.toLocaleString()}</b></td><td></td></tr>
        </tfoot>
      </table>
      <div class="inv-note">${H['備考']||''}</div>
    </div>
    <div class="inv-actions noprint">
      <button onclick="window.print()" class="btn">PDF / 印刷</button>
      <button onclick="window.close()" class="btn ghost">閉じる</button>
    </div>
  </body></html>`;
  const w = window.open('about:blank'); w.document.write(html); w.document.close();
}
async function deleteInvoice(invoice_id){
  if(!confirm(`請求書を削除しますか？\nNo: ${invoice_id}`)) return;
  await jsonp("deleteInvoice", { invoice_id });
  await loadInvoiceList();
}

/* ======================== SMALL UI UTILS ======================== */
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

/* ======================== WEATHER (sama seperti punyamu) ======================== */
async function ensureWeather(){
  try{
    const key='wx_cache_v1'; const c=JSON.parse(localStorage.getItem(key)||'null'); const now=Date.now();
    if(c && (now-c.t)<30*60*1000){ renderWeather(c.v); return; }
    let lat=35.6762, lon=139.6503;
    if(navigator.geolocation){
      await new Promise(res=> navigator.geolocation.getCurrentPosition(p=>{lat=p.coords.latitude; lon=p.coords.longitude; res();}, ()=>res(), {maximumAge:600000, timeout:2000}));
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m&timezone=auto`;
    const v = await fetch(url).then(r=>r.json());
    localStorage.setItem(key, JSON.stringify({v,t:now}));
    renderWeather(v);
  }catch(_){}
}
function renderWeather(v){
  if(!v?.current) return;
  $("#wxTemp").textContent = Math.round(v.current.temperature_2m) + "°C";
  $("#wxWind").textContent = Math.round(v.current.wind_speed_10m) + " m/s";
  $("#wxPlace").textContent = v.timezone_abbreviation || "";
}

document.addEventListener("DOMContentLoaded", ()=> setUser(null));
