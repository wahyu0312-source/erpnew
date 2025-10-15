/* =========================
   app.js (stable, safe-bind)
   ========================= */

/* ---------- Tiny DOM helpers ---------- */
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => [...el.querySelectorAll(q)];
function on(id, type, fn){ const el = (typeof id==='string') ? document.getElementById(id) : id; if(el) el.addEventListener(type, fn, false); }
function onSel(sel, type, fn){ const el = document.querySelector(sel); if(el) el.addEventListener(type, fn, false); }
const fmt = (d)=> d? new Date(d).toLocaleString("ja-JP"):"";

/* ---------- Config ---------- */
const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

/* ---------- JSONP with timeout & cleanup ---------- */
function jsonp(action, params={}, timeoutMs=20000){
  return new Promise((resolve,reject)=>{
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const s  = document.createElement("script");
    const t  = setTimeout(()=>{ cleanup(); reject(new Error("API timeout")); }, timeoutMs);
    function cleanup(){ try{ delete window[cb]; s.remove(); }catch(_){} clearTimeout(t); }
    window[cb] = (resp)=>{ cleanup(); if(resp && resp.ok){ resolve(resp.data); }else{ reject(new Error(resp?.error || "API error")); } };
    const qs = (o)=> Object.entries(o).map(([k,v])=> `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    s.src = `${API_BASE}?${qs({...params, action, callback:cb})}`;
    s.onerror = ()=>{ cleanup(); reject(new Error("JSONP load error")); };
    document.body.appendChild(s);
  });
}

/* ---------- MEM cache (short) ---------- */
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

/* ---------- Globals (role & user) ---------- */
let CURRENT_USER = null;
const ROLE_MAP = {
  admin: { pages:['pageDash','pageSales','pagePlan','pageShip','pageFinished','pageInv','pageInvoice','pageAnalytics'], nav:true },
  '営業': { pages:['pageSales','pageDash','pageFinished','pageInv','pageInvoice'], nav:true },
  '生産管理': { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv','pageInvoice','pageAnalytics'], nav:true },
  '生産管理部': { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv','pageInvoice','pageAnalytics'], nav:true },
  '製造': { pages:['pageDash','pageFinished','pageInv'], nav:true },
  '検査': { pages:['pageDash','pageFinished','pageInv'], nav:true }
};

/* ---------- Page show/hide ---------- */
function showPage(id){
  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice","pageAnalytics"];
  pages.forEach(p => $("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}

/* ---------- After login: control which nav visible ---------- */
function setUser(u){
  CURRENT_USER = u || null;

  const navIds = ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToFinPage','btnToInvPage','btnToInvoice','btnToAnalytics','ddSetting','weatherWrap'];
  navIds.forEach(id=> $("#"+id)?.classList.add("hidden"));

  // always hide pages first
  showPage("authView");
  $("#userInfo")?.textContent = u ? `${u.role||''} / ${u.department||''}` : "";

  if(!u){ return; }

  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP['admin'];
  if(allow?.nav){
    if(allow.pages.includes('pageDash')) $("#btnToDash")?.classList.remove("hidden");
    if(allow.pages.includes('pageSales')) $("#btnToSales")?.classList.remove("hidden");
    if(allow.pages.includes('pagePlan')) $("#btnToPlan")?.classList.remove("hidden");
    if(allow.pages.includes('pageShip')) $("#btnToShip")?.classList.remove("hidden");
    if(allow.pages.includes('pageFinished')) $("#btnToFinPage")?.classList.remove("hidden");
    if(allow.pages.includes('pageInv')) $("#btnToInvPage")?.classList.remove("hidden");
    if(allow.pages.includes('pageInvoice')) $("#btnToInvoice")?.classList.remove("hidden");
    if(allow.pages.includes('pageAnalytics')) $("#btnToAnalytics")?.classList.remove("hidden");
    $("#ddSetting")?.classList.remove("hidden");
    $("#weatherWrap")?.classList.remove("hidden");
    ensureWeather();
    loadMasters();
  }
  showPage("pageDash");
  refreshAll();   // initial load dashboard
}

/* ---------- Nav clicks (safe) ---------- */
on('btnToDash', 'click', ()=>{ showPage('pageDash'); refreshAll(); });
on('btnToSales','click', ()=>{ showPage('pageSales'); loadSales(); });
on('btnToPlan','click',  ()=>{ showPage('pagePlan');  loadPlans(); });
on('btnToShip','click',  ()=>{ showPage('pageShip');  loadShips(); });
on('btnToFinPage','click',()=>{ showPage('pageFinished'); loadFinished(); });
on('btnToInvPage','click', ()=>{ showPage('pageInv'); loadInventory(); });
on('btnToInvoice','click', ()=>{ showPage('pageInvoice'); invoiceInit(); });
on('btnToAnalytics','click',()=>{ showPage('pageAnalytics'); analyticsInit(); });

/* ---------- Login ---------- */
on('btnLogin','click', loginSubmit);
on('inUser','keydown', e=>{ if(e.key==='Enter') loginSubmit(); });
on('inPass','keydown', e=>{ if(e.key==='Enter') loginSubmit(); });

async function loginSubmit(){
  const u = $("#inUser")?.value?.trim();
  const p = $("#inPass")?.value?.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");
  try{
    await jsonp('ping', {}, 8000);
    const me = await jsonp("login", { username:u, password:p });
    setUser(me);
  }catch(e){
    alert("ログイン失敗: " + (e?.message || e));
  }
}

on('btnLogout','click', ()=> setUser(null));

/* ============================================================
   DASHBOARD (minimal sample list + actions)
   ============================================================ */
let ORDERS = [];
async function loadOrders(){
  ORDERS = await cached("listOrders", {}, 10000).catch(()=>[]);
  renderOrders();
  loadShipsMini(); // side mini widgets
}

// incremental renderer (safe without requestIdleCallback)
function renderOrders(){
  const q = ($("#searchQ")?.value||"").trim().toLowerCase();
  const rows = ORDERS.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  const tb = $("#tbOrders"); if(!tb) return;
  tb.innerHTML = "";
  const chunk=120; let i=0;
  (function paint(){
    const end = Math.min(i+chunk, rows.length);
    const frag = document.createDocumentFragment();
    for(; i<end; i++){
      const r = rows[i];
      const tr = document.createElement("tr");
      const ok = (r.ok_count ?? 0);
      const ng = (r.ng_count ?? 0);
      tr.innerHTML = `
        <td>
          <div class="s muted">注番</div>
          <div><b>${r.po_id||""}</b></div>
          <div class="muted s">${r["得意先"]||"—"}</div>
        </td>
        <td>${r["品名"]||"—"}</td>
        <td class="center">${r["品番"]||"—"}</td>
        <td class="center">${r["図番"]||"—"}</td>
        <td class="center">${r.status||"—"}</td>
        <td class="center">
          <div class="counts">
            <span class="count ok">OK:${ok}</span>
            <span class="count ng">NG:${ng}</span>
          </div>
        </td>
        <td class="center">${fmt(r.updated_at)}</td>
        <td class="center">${r.updated_by||"—"}</td>
        <td class="center">
          <div class="actions">
            <button class="btn icon ghost btn-stqr" title="工程QR"><i class="fa-solid fa-qrcode"></i><span>工程QR</span></button>
            <button class="btn icon ghost btn-scan" data-po="${r.po_id}" title="スキャン"><i class="fa-solid fa-camera"></i><span>スキャン</span></button>
            <button class="btn icon ghost btn-op" data-po="${r.po_id}" title="手入力"><i class="fa-solid fa-keyboard"></i><span>手入力</span></button>
          </div>
        </td>`;
      frag.appendChild(tr);
    }
    tb.appendChild(frag);
    if(i<rows.length){ setTimeout(paint, 0); }
    else{
      $$(".btn-stqr",tb).forEach(b=> b.onclick = openStationQrSheet);
      $$(".btn-scan",tb).forEach(b=> b.onclick=(e)=> openScanDialog(e.currentTarget.dataset.po));
      $$(".btn-op",tb).forEach(b=> b.onclick=(e)=> openOpDialog(e.currentTarget.dataset.po));
    }
  })();
}
on('searchQ','input', ()=> renderOrders());
on('btnExportOrders','click', ()=> exportTableCSV("#tbOrders","orders.csv"));

async function refreshAll(){ await loadOrders(); }

/* ---------- 手入力 (OK/NG) ---------- */
const PROCESS_OPTIONS = [ "準備","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","検査中","検査済","出荷（組立済）","出荷準備","出荷済" ];
function openOpDialog(po, defaults = {}){
  $("#opPO") && ($("#opPO").textContent = po);
  const sel = $("#opProcess"); if(!sel) return;
  sel.innerHTML = PROCESS_OPTIONS.map(o=>`<option value="${o}">${o}</option>`).join('');
  sel.value = defaults.process || PROCESS_OPTIONS[0];
  $("#opOK")  && ($("#opOK").value = (defaults.ok_count ?? defaults.ok ?? "") === 0 ? 0 : (defaults.ok_count ?? defaults.ok ?? ""));
  $("#opNG")  && ($("#opNG").value = (defaults.ng_count ?? defaults.ng ?? "") === 0 ? 0 : (defaults.ng_count ?? defaults.ng ?? ""));
  $("#opNote")&& ($("#opNote").value = defaults.note || "");
  $("#dlgOp")?.showModal();

  on('btnOpSave','click', async ()=>{
    const okStr = $("#opOK").value; const ngStr = $("#opNG").value; const proc = $("#opProcess").value;
    if(!proc) return alert("工程を選択してください");
    if(okStr === "") return alert("OK 数を入力してください（0 以上）");
    if(ngStr === "") return alert("NG 数を入力してください（0 以上）");
    const ok = Number(okStr), ng = Number(ngStr);
    if(Number.isNaN(ok) || ok < 0) return alert("OK 数は 0 以上の数値で入力してください");
    if(Number.isNaN(ng) || ng < 0) return alert("NG 数は 0 以上の数値で入力してください");
    try{
      await jsonp("saveOp", { data: JSON.stringify({ po_id: po, process: proc, ok_count: ok, ng_count: ng, note: $("#opNote").value }), user: JSON.stringify(CURRENT_USER||{}) });
      $("#dlgOp")?.close();
      if($("#dlgScan")?.open){ stopScan(); $("#dlgScan").close(); }
      await refreshAll();
    }catch(e){ alert("保存失敗: " + e.message); }
  });
}
on('btnOpCancel','click', ()=> $("#dlgOp")?.close());

/* ============================================================
   MASTERS
   ============================================================ */
let MASTERS = { customers:[], drawings:[], item_names:[], part_nos:[], destinations:[], carriers:[], po_ids:[] };
async function loadMasters(){ try{ MASTERS = await cached("listMasters", {}, 60000); }catch(_){} }

/* ============================================================
   SALES / PLAN / SHIP (list slim)
   (Renderer ringkas—cukup untuk kompatibilitas layout)
   ============================================================ */
async function loadSales(){
  const dat = await cached("listSales", {}, 15000).catch(()=>({header:[],rows:[]}));
  renderTableSlim(dat, "#thSales", "#tbSales", "#salesSearch", "sales");
}
async function loadPlans(){
  const dat = await cached("listPlans", {}, 15000).catch(()=>({header:[],rows:[]}));
  renderTableSlim(dat, "#thPlan", "#tbPlan", "#planSearch", "plan");
}
async function loadShips(){
  const dat = await cached("listShip", {}, 15000).catch(()=>({header:[],rows:[]}));
  renderTableSlim(dat, "#thShip", "#tbShip", "#shipSearch", "ship");
}
function renderTableSlim(dat, thSel, tbSel, searchSel, tag){
  const th = $(thSel), tb=$(tbSel), search=$(searchSel); if(!th||!tb) return;
  th.innerHTML = `<tr>${(dat.header||[]).map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const rows = dat.rows||[];
  const render = ()=>{
    const q = (search?.value||"").toLowerCase();
    const picked = rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    tb.innerHTML = "";
    const chunk=150; let i=0;
    (function paint(){
      const end=Math.min(i+chunk, picked.length);
      const frag=document.createDocumentFragment();
      for(;i<end;i++){
        const tr=document.createElement('tr');
        tr.innerHTML = (picked[i]||[]).map(c=>`<td>${c??''}</td>`).join('');
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<picked.length) setTimeout(paint,0);
    })();
  };
  search && (search.oninput = ()=> render());
  render();
}

/* ---------- Ship mini widgets ---------- */
async function loadShipsMini(){
  const dat = await cached("listShip", {}, 10000).catch(()=>({header:[],rows:[]}));
  const rows = dat.rows||[]; const head = dat.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[h,i]));
  const today = new Date(); const ymd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isToday = (s)=>{ const t = new Date(s); return t.getFullYear()===ymd.getFullYear() && t.getMonth()===ymd.getMonth() && t.getDate()===ymd.getDate(); };
  const dateCol = idx.scheduled_date ?? idx['出荷日'] ?? idx['納期'];
  const poCol = idx.po_id ?? idx['注番'];
  const todayList = [], futureList = [];
  rows.forEach(r=>{
    const dt = r[dateCol];
    if(!dt) return;
    const entry = { po: r[poCol], date: dt };
    if(isToday(dt)) todayList.push(entry); else if(new Date(dt) > ymd) futureList.push(entry);
  });
  const renderSide = (arr, el)=>{ if(!el) return; el.innerHTML = arr.slice(0,50).map(e=>`
    <div class="ship-item">
      <div><b>${e.po||''}</b></div>
      <div class="row-between s"><span>${new Date(e.date).toLocaleDateString('ja-JP')}</span></div>
    </div>`).join('') || `<div class="muted s">なし</div>`; };
  renderSide(todayList, $("#shipToday"));
  renderSide(futureList, $("#shipPlan"));
}

/* ============================================================
   FINISHED (fix error “missing ) after argument list”)
   ============================================================ */
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
  const dat = await cached("listFinished", {}, 5000).catch(()=>({header:[],rows:[]}));
  const th = $("#thFin"), tb = $("#tbFin"), search = $("#finSearch"); if(!th||!tb) return;
  const head = dat.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
  const pick = (row, keys)=>{ for(const k of keys){ const i=idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; } return ''; };
  th.innerHTML = `<tr>${FIN_VIEW.map(c=>`<th>${c.label}</th>`).join('')}</tr>`;
  const render = ()=>{
    const q = (search?.value||'').toLowerCase();
    const rows = (dat.rows||[]).filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    tb.innerHTML = ''; let i=0; const chunk=150;
    (function paint(){
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
        const tr=document.createElement('tr'); tr.innerHTML = tds; frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<rows.length) setTimeout(paint,0);
    })();
  };
  search && (search.oninput = ()=> render());
  render();
}
on('btnFinExport','click', ()=> exportTableCSV("#tbFin","finished_goods.csv"));
on('btnFinPrint','click', ()=> window.print());

/* ============================================================
   INVENTORY (simple filter)
   ============================================================ */
const INV_UI = { cust:'', item:'' };
async function loadInventory(){
  const dat = await cached("listInventory", {}, 5000).catch(()=>({header:['得意先','図番','機種','品名','在庫数','最終更新'], rows:[]}));
  ensureInvControls(dat); renderInventory(dat);
}
function ensureInvControls(dat){
  if($("#invCtrlBar")) return;
  const wrap = $("#thInv")?.closest(".card") || $("#pageInv"); if(!wrap) return;
  const bar = document.createElement("div");
  bar.id = "invCtrlBar"; bar.className = "row wrap gap"; bar.style.margin = "8px 0 12px";
  const h = dat.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[x,i]));
  const colCust = idx['得意先']; const colModel = (idx['機種']!=null ? idx['機種'] : idx['品名']);
  const setOpts = (values)=> [...new Set(values.filter(Boolean))].sort();
  const selCust = document.createElement("select");
  selCust.innerHTML = `<option value="">(すべての得意先)</option>` + setOpts(dat.rows.map(r=> r[colCust]||'')).map(v=>`<option value="${v}">${v}</option>`).join('');
  const selItem = document.createElement("select");
  selItem.innerHTML = `<option value="">(すべての機種/品名)</option>` + setOpts(dat.rows.map(r=> r[colModel]||r[idx['品名']]||'')).map(v=>`<option value="${v}">${v}</option>`).join('');
  function makeLabel(txt, el){ const w=document.createElement("div"); w.className="row gap s"; w.innerHTML=`<div class="muted s" style="min-width:72px">${txt}</div>`; w.append(el); return w; }
  bar.append(makeLabel("得意先", selCust), makeLabel("機種/品名", selItem));
  wrap.insertBefore(bar, wrap.querySelector(".table-wrap"));
  selCust.onchange = ()=>{ INV_UI.cust = selCust.value; renderInventory(dat); };
  selItem.onchange = ()=>{ INV_UI.item = selItem.value; renderInventory(dat); };
}
function renderInventory(dat){
  const th = $("#thInv"), tb = $("#tbInv"), search = $("#invSearch"); if(!th||!tb) return;
  th.innerHTML = `<tr>${(dat.header||[]).map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const h = dat.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[x,i]));
  const colCust = idx['得意先']; const colModel= (idx['機種']!=null ? idx['機種'] : idx['品名']);
  const q = (search?.value||'').toLowerCase();
  const rows = (dat.rows||[]).filter(r=>{
    if(INV_UI.cust && String(r[colCust]||'') !== INV_UI.cust) return false;
    if(INV_UI.item){
      const itemVal = String(r[colModel]||r[idx['品名']]||'');
      if(itemVal !== INV_UI.item) return false;
    }
    return !q || JSON.stringify(r).toLowerCase().includes(q);
  });
  tb.innerHTML = ''; let i=0; const chunk=150;
  (function paint(){
    const end=Math.min(i+chunk, rows.length);
    const frag=document.createDocumentFragment();
    for(;i<end;i++){
      const tr=document.createElement('tr');
      tr.innerHTML = rows[i].map(c=>`<td>${c??''}</td>`).join('');
      frag.appendChild(tr);
    }
    tb.appendChild(frag);
    if(i<rows.length) setTimeout(paint,0);
  })();
  if(search && !search._invBind){ search._invBind=true; search.oninput = ()=>renderInventory(dat); }
}
on('btnInvExport','click', ()=> exportTableCSV("#tbInv","inventory.csv"));
on('btnInvPrint','click', ()=> window.print());

/* ============================================================
   請求書 (Invoice) – basic
   ============================================================ */
let INVOICE_STATE = { cust:'', issue_date:'', pending:[], picked:[], list:[] };

function invoiceInit(){
  // set controls
  const sel = $("#invoiceCustomer"); if(sel){ sel.innerHTML = `<option value="">(得意先を選択)</option>` + (MASTERS.customers||[]).map(c=>`<option value="${c}">${c}</option>`).join(''); }
  const d = $("#invoiceIssue"); if(d && !d.value){ const z=n=>String(n).padStart(2,'0'); const now=new Date(); d.value = `${now.getFullYear()}-${z(now.getMonth()+1)}-${z(now.getDate())}`; }
  onSel('#invoiceCustomer','change', ()=> { INVOICE_STATE.cust = $("#invoiceCustomer").value; renderInvoiceTables(); });
  on('btnInvoiceReload','click', renderInvoiceTables);
  on('btnInvoiceSave','click', saveInvoice);
  on('btnInvoiceXlsx','click', exportInvoiceExcel);
  on('btnInvoicePdf','click', exportInvoicePdf);
  renderInvoiceTables();
  renderInvoiceList(); // existing invoices
}

async function renderInvoiceTables(){
  const tb = $("#tbInvoicePending"); const cust = $("#invoiceCustomer")?.value||""; if(!tb) return;
  tb.innerHTML = ""; INVOICE_STATE.pending = []; INVOICE_STATE.picked = [];
  if(!cust){ tb.innerHTML = `<tr><td class="center muted" colspan="8">得意先を選択してください</td></tr>`; return; }
  // sumber dari pengiriman (listShip)
  const dat = await cached("listShip", {}, 15000).catch(()=>({header:[],rows:[]}));
  const head = dat.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
  const rows = (dat.rows||[]).filter(r => (String(r[idx['得意先']]||r[idx['customer']]||'')===cust));
  // status “請求書済” (simulasi: kalau ada col status_invoice)
  const colInv = idx['請求書']; // ex: 済 / 未
  const pending = rows.filter(r => !colInv || !/済/.test(String(r[colInv]||'未'))).map(r=>{
    const qty = Number(r[idx['qty']] || r[idx['数量']] || 0);
    const unit = Number(r[idx['単価']] || 0);
    const price = unit * qty;
    return {
      po: r[idx['po_id']]||r[idx['注番']]||'',
      item: r[idx['品名']]||r[idx['item_name']]||'',
      qty, unit, price,
      ship: r[idx['delivery_date']]||r[idx['納入日']]||''
    };
  });
  INVOICE_STATE.pending = pending;
  if(!pending.length){ tb.innerHTML = `<tr><td class="center muted" colspan="8">対象データなし（請求書済）</td></tr>`; return; }
  const frag = document.createDocumentFragment();
  pending.forEach((r, i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="center"><input type="checkbox" data-i="${i}"></td>
      <td>${r.po}</td>
      <td>${r.item}</td>
      <td class="right">${r.qty}</td>
      <td class="right">${r.unit||0}</td>
      <td class="right">${r.price||0}</td>
      <td>${r.ship? new Date(r.ship).toLocaleDateString('ja-JP'):''}</td>`;
    frag.appendChild(tr);
  });
  tb.appendChild(frag);
  $$('#tbInvoicePending input[type="checkbox"]').forEach(chk=>{
    chk.onchange = ()=>{
      const i = Number(chk.dataset.i);
      if(chk.checked) INVOICE_STATE.picked.push(INVOICE_STATE.pending[i]);
      else INVOICE_STATE.picked = INVOICE_STATE.picked.filter((_,ix)=> ix!==INVOICE_STATE.pending.indexOf(INVOICE_STATE.pending[i]));
      invoiceUpdateTotals();
    };
  });
  invoiceUpdateTotals();
}
function invoiceUpdateTotals(){
  const sum = INVOICE_STATE.picked.reduce((s,r)=> s + (Number(r.price)||0), 0);
  $("#invoiceTotal") && ($("#invoiceTotal").textContent = new Intl.NumberFormat('ja-JP').format(sum));
}
async function saveInvoice(){
  const cust = $("#invoiceCustomer")?.value||"";
  if(!cust) return alert("得意先を選択してください");
  if(INVOICE_STATE.picked.length===0) return alert("請求項目を選択してください");
  const issue = $("#invoiceIssue")?.value||"";
  const payload = { customer:cust, issue_date: issue, items: INVOICE_STATE.picked, user: CURRENT_USER };
  try{
    await jsonp("saveInvoice", { data: JSON.stringify(payload) });
    alert("請求書を保存しました");
    INVOICE_STATE.picked = [];
    renderInvoiceTables();
    renderInvoiceList();
  }catch(e){ alert("保存失敗: " + e.message); }
}
async function renderInvoiceList(){
  // contoh ambil list dari API jika ada
  const tb = $("#tbInvoiceList"); if(!tb) return;
  tb.innerHTML = "";
  const dat = await cached("listInvoice", {}, 10000).catch(()=>({rows:[]}));
  const rows = dat.rows||[];
  if(!rows.length){ tb.innerHTML = `<tr><td class="center muted" colspan="4">なし</td></tr>`; return; }
  const frag = document.createDocumentFragment();
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.number||''}</td>
      <td>${r.customer||''}</td>
      <td>${r.issue_date? new Date(r.issue_date).toLocaleDateString('ja-JP'):''}</td>
      <td class="right">${r.total||0}</td>`;
    frag.appendChild(tr);
  });
  tb.appendChild(frag);
}
function exportInvoiceExcel(){
  if(!window.XLSX){ alert("XLSX ライブラリが読み込まれていません"); return; }
  const wb = XLSX.utils.book_new();
  const rows = [['注番','商品名','数量','単価','金額','出荷日']].concat(
    INVOICE_STATE.picked.map(r=> [r.po, r.item, r.qty, r.unit, r.price, r.ship? new Date(r.ship).toLocaleDateString('ja-JP'):'' ])
  );
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, '請求明細');
  const cust = $("#invoiceCustomer")?.value||"";
  const ymd = ($("#invoiceIssue")?.value||"").replaceAll('-','') || new Date().toISOString().slice(0,10).replaceAll('-','');
  XLSX.writeFile(wb, `請求書_${cust||'未設定'}_${ymd}.xlsx`);
}
function exportInvoicePdf(){
  if(!window.jspdf || !window.jspdf.jsPDF){ alert("jsPDF ライブラリが読み込まれていません"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const cust = $("#invoiceCustomer")?.value||"";
  const issue = $("#invoiceIssue")?.value||"";
  doc.setFont("helvetica","bold");
  doc.text("請求書", 105, 20, {align:'center'});
  doc.setFont("helvetica","normal");
  doc.text(`得意先: ${cust}`, 14, 30);
  doc.text(`発行日: ${issue}`, 150, 30);
  let y=42;
  doc.text("注番 / 品名 / 数量 / 単価 / 金額 / 出荷日", 14, y);
  y+=6;
  INVOICE_STATE.picked.forEach(r=>{
    const line = `${r.po} / ${r.item} / ${r.qty} / ${r.unit} / ${r.price} / ${r.ship? new Date(r.ship).toLocaleDateString('ja-JP'):''}`;
    doc.text(line, 14, y); y+=6;
    if(y>280){ doc.addPage(); y=20; }
  });
  doc.save("invoice.pdf");
}

/* ============================================================
   ANALYTICS (Chart.js) – destroy-safe
   ============================================================ */
let chartDaily, chartMonthly, chartCust, chartCustMon;

function destroyChart(c){ try{ c && c.destroy && c.destroy(); }catch(_){} }

async function analyticsInit(){
  // tombol & filter dasar
  on('dailyOrient','click', ()=> { state.dailyOrient = (state.dailyOrient==='v'?'h':'v'); localSave(); renderAnalytics(); });
  on('monthlyOrient','click', ()=> { state.monthlyOrient = (state.monthlyOrient==='v'?'h':'v'); localSave(); renderAnalytics(); });
  on('custTypeBar','click', ()=> { state.custType='bar'; localSave(); renderAnalytics(); });
  on('custTypeBarH','click',()=> { state.custType='barH'; localSave(); renderAnalytics(); });
  on('custTypePie','click', ()=> { state.custType='pie'; localSave(); renderAnalytics(); });
  on('custTypePareto','click',()=> { state.custType='pareto'; localSave(); renderAnalytics(); });
  on('custTop','click', ()=> { state.custTop=(state.custTop===10?20:10); localSave(); renderAnalytics(); });
  on('custMonTop','click',()=> { state.custMonTop=(state.custMonTop===6?10:6); localSave(); renderAnalytics(); });
  on('custMonOrient','click',()=> { state.custMonOrient=(state.custMonOrient==='v'?'h':'v'); localSave(); renderAnalytics(); });
  on('custMonMode','click', ()=> { state.custMonMode=(state.custMonMode==='month'?'year':'month'); localSave(); renderAnalytics(); });

  renderAnalytics();
}

const LSKEY='analyticsState';
const defaultState = { range:'ytd', metric:'qty', labels:true, interval:60000, status:null,
  custType:'barH', custTop:10, custMonTop:6, custMonOrient:'v', custMonMode:'month', custMonType:'stacked',
  dailyOrient:'v', monthlyOrient:'v'
};
let state = Object.assign({}, defaultState, readLS());
function readLS(){ try{return JSON.parse(localStorage.getItem(LSKEY)||'{}')}catch{return{}} }
function localSave(){ localStorage.setItem(LSKEY, JSON.stringify(state)); }

async function renderAnalytics(){
  if(!$("#pageAnalytics")) return;
  const dat = await cached("listShip", {}, 20000).catch(()=>({header:[],rows:[]}));
  const head = dat.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
  const dateCol = idx.scheduled_date ?? idx['出荷日'] ?? idx['納期'];
  const custCol = idx['得意先'] ?? idx['customer'];
  const qtyCol  = idx['qty'] ?? idx['数量'];

  // aggregate
  const mapDaily={}, mapMonthly={}, mapYearly={}, mapCust={}, mapCustMon={}, mapCustYear={};
  (dat.rows||[]).forEach(r=>{
    const d = new Date(r[dateCol]); if(isNaN(d)) return;
    const cust = String(r[custCol]||'—');
    const qty = Number(r[qtyCol]||0);
    const z=n=>String(n).padStart(2,'0');
    const day  = `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
    const mon  = `${d.getFullYear()}-${z(d.getMonth()+1)}`;
    const year = `${d.getFullYear()}`;
    mapDaily[day]=(mapDaily[day]||0)+qty;
    mapMonthly[mon]=(mapMonthly[mon]||0)+qty;
    mapYearly[year]=(mapYearly[year]||0)+qty;
    mapCust[cust]=(mapCust[cust]||0)+qty;
    (mapCustMon[mon]||(mapCustMon[mon]={}))[cust]=(mapCustMon[mon][cust]||0)+qty;
    (mapCustYear[year]||(mapCustYear[year]={}))[cust]=(mapCustYear[year][cust]||0)+qty;
  });

  // destroy old
  destroyChart(chartDaily); destroyChart(chartMonthly); destroyChart(chartCust); destroyChart(chartCustMon);
  if(!window.Chart) return;

  Chart.register(window.ChartDataLabels||{});

  /* Daily */
  const dL = Object.keys(mapDaily).sort();
  const dV = dL.map(k=>mapDaily[k]);
  chartDaily = new Chart($("#cDaily"), {
    type: state.dailyOrient==='h'?'bar':'line',
    data: { labels:dL, datasets:[{ label:'数量', data:dV, tension:.25, fill: state.dailyOrient!=='h' }] },
    options: makeOptions(state.dailyOrient==='h', Math.max(0,...dV))
  });

  /* Monthly YTD (12 month of current year) */
  const now = new Date(); const yr=now.getFullYear(); const ytdLabels = Array.from({length:12}, (_,i)=>`${i+1}月`);
  const ytdVals = ytdLabels.map((_,i)=> mapMonthly[`${yr}-${String(i+1).padStart(2,'0')}`] || 0);
  chartMonthly = new Chart($("#cMonthly"), {
    type:'bar',
    data:{ labels:ytdLabels, datasets:[{ label:'数量', data:ytdVals }] },
    options: Object.assign(makeOptions(state.monthlyOrient==='h', Math.max(0,...ytdVals)), state.monthlyOrient==='h'?{indexAxis:'y'}:{})
  });

  /* Customer Top */
  const custTop = Object.entries(mapCust).sort((a,b)=>b[1]-a[1]).slice(0, state.custTop);
  const cL = custTop.map(x=>x[0]); const cV=custTop.map(x=>x[1]);
  if(state.custType==='pie'){
    chartCust = new Chart($("#cCustTop"), {
      type:'pie',
      data:{ labels:cL, datasets:[{ data:cV }] },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{position:'right'}, datalabels:{ display: state.labels } }
      }
    });
  }else if(state.custType==='pareto'){
    const total = cV.reduce((a,b)=>a+b,0)||1;
    const cum=[]; cV.reduce((acc,v,i)=> (cum[i]=Math.round((acc+v)/total*100),acc+v),0);
    chartCust = new Chart($("#cCustTop"), {
      type:'bar',
      data:{ labels:cL, datasets:[
        { label:'数量', data:cV, yAxisID:'y' },
        { label:'累積(%)', data:cum, type:'line', yAxisID:'y1', tension:.25, pointRadius:3 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:true}, datalabels:{ display: state.labels } },
        scales:{ y:{beginAtZero:true}, y1:{position:'right',beginAtZero:true,max:100,grid:{drawOnChartArea:false}} }
      }
    });
  }else{
    const horiz = (state.custType==='barH');
    chartCust = new Chart($("#cCustTop"), {
      type:'bar',
      data:{ labels:cL, datasets:[{ label:'数量', data:cV }] },
      options: Object.assign(makeOptions(horiz, Math.max(0,...cV)), horiz?{indexAxis:'y'}:{})
    });
  }

  /* Customer Monthly/Yearly stacked */
  const months = Object.keys(mapCustMon).sort();
  const years  = Object.keys(mapCustYear).sort();
  const topN = Object.entries(mapCust).sort((a,b)=>b[1]-a[1]).slice(0, state.custMonTop).map(x=>x[0]);
  const labels = (state.custMonMode==='month'? months : years);
  const datasets = topN.map(cn=>{
    const data = labels.map(l=> (state.custMonMode==='month' ? (mapCustMon[l]?.[cn]||0) : (mapCustYear[l]?.[cn]||0)) );
    return { label: cn, data };
  });
  const horiz = state.custMonOrient==='h';
  chartCustMon = new Chart($("#cCustMon"), {
    type:'bar',
    data:{ labels, datasets },
    options:Object.assign({
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom'}, datalabels:{ display:false } },
      scales: horiz
        ? { x:{ stacked:true }, y:{ stacked:true, ticks:{precision:0} } }
        : { x:{ stacked:true }, y:{ stacked:true, ticks:{precision:0} } }
    }, horiz?{indexAxis:'y'}:{})
  });
}
function makeOptions(horizontal=false, maxVal=null){
  const headroom = maxVal? Math.ceil(maxVal*1.15) : undefined;
  const scales = horizontal
    ? { x:{ grid:{color:'#eef2ff'}, suggestedMax: headroom }, y:{ grid:{color:'#f1f5f9'} } }
    : { x:{ grid:{color:'#eef2ff'} }, y:{ grid:{color:'#f1f5f9'}, suggestedMax: headroom, ticks:{precision:0}} };
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false},
      datalabels:{ display: state.labels, anchor:'end', align: horizontal?'end':'top', offset:4, formatter:(v)=> (v==null||isNaN(v))?'':String(Math.round(v)) }
    },
    scales
  };
}

/* ============================================================
   QR 工程 (Station, universal) + Scan
   ============================================================ */
const STATION_PROCESSES = [ "レザー加工","曲げ加工","外注加工/組立","組立","検査工程","検査中","検査済","出荷準備","出荷（組立済）","出荷済" ];
function qrUrl(payload, size=512){ return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`; }
function openStationQrSheet(){
  const tiles = STATION_PROCESSES.map(p=>{
    const payload = `STN|${p}`;
    return `<div class="tile"><img src="${qrUrl(payload)}" alt="QR ${p}"><div class="lbl"><b>${p}</b></div><div class="s muted">${payload}</div></div>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>工程QR</title>
  <style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;margin:16px;background:#fafafa} .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(236px,1fr));gap:16px}
  .tile{border:1px solid #e5e7eb;border-radius:14px;padding:12px;background:#fff} .tile img{width:100%;border-radius:8px}</style></head>
  <body><div class="grid">${tiles}</div></body></html>`;
  const w = window.open('about:blank'); w.document.write(html); w.document.close();
}
on('miStationQR','click', openStationQrSheet);
on('btnStationQR','click', openStationQrSheet);

/* Scan dialog (jsQR) */
let scanStream=null, scanRAF=null;
function stopScan(){ try{ scanRAF && cancelAnimationFrame(scanRAF); }catch(_){ } try{ scanStream && scanStream.getTracks().forEach(t=> t.stop()); }catch(_){ } }
function parseProcessFromStationQR(text){
  const map = [/^STN\|(.+)$/i, /^PROC[:|](.+)$/i, /^工程[:|](.+)$/i];
  for(const rx of map){ const m = String(text||'').match(rx); if(m) return m[1]; }
  return null;
}
function openScanDialog(po){
  const dlg=$("#dlgScan"); if(!dlg) return; $("#scanResult") && ($("#scanResult").textContent = `PO: ${po}`);
  dlg.showModal();
  on('btnScanStart','click', async ()=>{
    const video = $("#scanVideo"), canvas=$("#scanCanvas"); if(!video||!canvas){ alert("Camera要素が見つかりません"); return; }
    try{
      scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      video.srcObject = scanStream; await video.play();
      const ctx = canvas.getContext("2d");
      const tick = ()=>{
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0,0, canvas.width, canvas.height);
        const img = ctx.getImageData(0,0, canvas.width, canvas.height);
        const code = window.jsQR? jsQR(img.data, img.width, img.height) : null;
        if(code){
          stopScan();
          const raw = String(code.data||'').trim();
          const proc = parseProcessFromStationQR(raw);
          if(proc){ quickQuantityPrompt(po, proc); return; }
          const parts = raw.split('|');
          if(parts.length>=2){
            const cPO = (parts[0]||'').trim(); const p = (parts[1]||'').trim();
            const okv = Number(parts[2]||'0'); const ngv = Number(parts[3]||'0'); const note = parts[4]||'';
            const po_id = cPO || po;
            jsonp("saveOp", { data: JSON.stringify({ po_id, process:p, ok_count:okv||0, ng_count:ngv||0, note }), user: JSON.stringify(CURRENT_USER||{}) })
              .then(()=>{ $("#scanResult").textContent = `保存: ${po_id} / ${p} / OK=${okv||0} / NG=${ngv||0}`; setTimeout(()=>{ dlg.close(); refreshAll(); }, 700); })
              .catch(e=> alert("保存失敗: " + e.message));
            return;
          }
          alert("未対応のQR形式です。'STN|工程' または 'PO|工程|OK|NG|備考' を使用してください。");
          return;
        }
        scanRAF = requestAnimationFrame(tick);
      };
      tick();
    }catch(e){ alert("Camera error: "+e.message); }
  });
  on('btnScanClose','click', ()=>{ stopScan(); dlg.close(); });
}
function quickQuantityPrompt(po, process, note=''){
  const wrap = document.createElement("div");
  wrap.innerHTML = `<dialog id="dlgQuick" class="dlg">
    <h3>${po} / ${process}</h3>
    <div class="row gap"><label>OK <input id="qOK" type="number" min="0" value="0" style="width:120px"></label>
    <label>NG <input id="qNG" type="number" min="0" value="0" style="width:120px"></label></div>
    <div class="row gap" style="margin-top:8px">
      <button class="btn" id="qSave">保存</button>
      <button class="btn ghost" id="qCancel">キャンセル</button>
    </div></dialog>`;
  document.body.appendChild(wrap);
  const dlg = wrap.querySelector("#dlgQuick"); dlg.showModal();
  wrap.querySelector("#qCancel").onclick = ()=>{ dlg.close(); wrap.remove(); };
  wrap.querySelector("#qSave").onclick = async ()=>{
    const ok = Number(wrap.querySelector("#qOK").value||0); const ng = Number(wrap.querySelector("#qNG").value||0);
    try{
      await jsonp("saveOp", { data: JSON.stringify({ po_id: po, process, ok_count: ok, ng_count: ng, note }), user: JSON.stringify(CURRENT_USER||{}) });
      dlg.close(); wrap.remove(); refreshAll();
    }catch(e){ alert("保存失敗: " + e.message); }
  };
}

/* ============================================================
   Cuaca (Open-Meteo, cached 30m)
   ============================================================ */
async function ensureWeather(){
  try{
    const key='wx_cache_v1'; const cache=JSON.parse(localStorage.getItem(key)||'null'); const now=Date.now();
    if(cache && (now-cache.t)< 30*60*1000){ renderWeather(cache.v); return; }
    let lat=35.6762, lon=139.6503;
    if(navigator.geolocation){
      await new Promise(res=> navigator.geolocation.getCurrentPosition( pos=>{ lat=pos.coords.latitude; lon=pos.coords.longitude; res(); }, ()=> res(), {maximumAge: 600000, timeout: 1500} ));
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
    const v = await fetch(url).then(r=>r.json());
    localStorage.setItem(key, JSON.stringify({v,t:now}));
    renderWeather(v);
  }catch(_){ }
}
function renderWeather(v){
  if(!v?.current) return;
  $("#wxTemp") && ($("#wxTemp").textContent = Math.round(v.current.temperature_2m) + "°C");
  $("#wxWind") && ($("#wxWind").textContent = Math.round(v.current.wind_speed_10m) + " m/s");
  $("#wxPlace") && ($("#wxPlace").textContent = v.timezone_abbreviation || "");
}

/* ============================================================
   Generic CSV Export
   ============================================================ */
function exportTableCSV(tbodySel, filename){
  const rows = $$(tbodySel+" tr").map(tr=> [...tr.children].map(td=> td.textContent));
  const csv = rows.map(r => r.map(v=>{ const s = (v??'').toString().replace(/"/g,'""'); return `"${s}"`; }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", ()=> setUser(null));
