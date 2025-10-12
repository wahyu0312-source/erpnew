/* =================================================
 JSONP Frontend (Optimized, with Inventory)
 - Dashboard status merge StatusLog
 - CRUD: 受注 / 生産計画 / 出荷予定 / 完成品一覧 / 在庫(表示)
 - 操作: QR scanner + 手入力 (OK/NG/工程)
 - Import / Export / Print
 - Cuaca (Open-Meteo, cached)
 ================================================= */

const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

/* ---------- DOM helpers ---------- */
const $  = (q,el=document)=> el.querySelector(q);
const $$ = (q,el=document)=> [...el.querySelectorAll(q)];
const qs = (o)=> Object.entries(o).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const fmt = (d)=> d? new Date(d).toLocaleString("ja-JP"):"";
const normalizeProc = (s)=> String(s||"").trim()
  .replace("レーサ加工","レザー加工").replace("外作加工","外注加工/組立") || "未設定";

/* ---------- JSONP helper ---------- */
function jsonp(action, params={}){
  return new Promise((resolve,reject)=>{
    const cb = "cb_" + Math.random().toString(36).slice(2);
    params = { ...params, action, callback: cb };
    const s = document.createElement("script");
    s.src = `${API_BASE}?${qs(params)}`;
    let timeout = setTimeout(()=>{ cleanup(); reject(new Error("API timeout")); }, 20000);
    function cleanup(){ delete window[cb]; s.remove(); clearTimeout(timeout); }
    window[cb] = (resp)=>{ cleanup(); if(resp && resp.ok) resolve(resp.data); else reject(new Error((resp && resp.error) || "API error")); };
    s.onerror = ()=>{ cleanup(); reject(new Error("JSONP load error")); };
    document.body.appendChild(s);
  });
}

/* ---------- MEM cache ---------- */
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
  'admin':       { pages:['pageDash','pageSales','pagePlan','pageShip','pageFinished','pageInv'], nav:true },
  '営業':        { pages:['pageSales','pageDash','pageFinished','pageInv'], nav:true },
  '生産管理':     { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv'], nav:true },
  '生産管理部':    { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv'], nav:true },
  '製造':        { pages:['pageDash','pageFinished','pageInv'], nav:true },
  '検査':        { pages:['pageDash','pageFinished','pageInv'], nav:true }
};
function setUser(u){
  CURRENT_USER = u || null;
  $("#userInfo").textContent = u ? `${u.role} / ${u.department}` : "";

  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv"];
  pages.forEach(p => $("#"+p)?.classList.add("hidden"));

  ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToFinPage','btnToInvPage','btnToInvoice','ddSetting','weatherWrap']
    .forEach(id=> $("#"+id)?.classList.add("hidden"));

  if(!u){ $("#authView")?.classList.remove("hidden"); return; }

  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP['admin'];
  if(allow?.nav){
    if(allow.pages.includes('pageDash'))      $("#btnToDash").classList.remove("hidden");
    if(allow.pages.includes('pageSales'))     $("#btnToSales").classList.remove("hidden");
    if(allow.pages.includes('pagePlan'))      $("#btnToPlan").classList.remove("hidden");
    if(allow.pages.includes('pageShip'))      $("#btnToShip").classList.remove("hidden");
    if(allow.pages.includes('pageFinished'))  $("#btnToFinPage").classList.remove("hidden");
    if(allow.pages.includes('pageInv'))       $("#btnToInvPage").classList.remove("hidden");
    $("#ddSetting").classList.remove("hidden");
    $("#weatherWrap").classList.remove("hidden");
    ensureWeather();
    loadMasters();
  }
  show("pageDash");
  refreshAll();
}

/* ---------- Nav ---------- */
function show(id){
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv"]
    .forEach(p=> $("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}
$("#btnToDash").onclick     = ()=>{ show("pageDash");    refreshAll(); };
$("#btnToSales").onclick    = ()=>{ show("pageSales");   loadSales(); };
$("#btnToPlan").onclick     = ()=>{ show("pagePlan");    loadPlans(); };
$("#btnToShip").onclick     = ()=>{ show("pageShip");    loadShips(); };
$("#btnToFinPage").onclick  = ()=>{ show("pageFinished");loadFinished(); };
$("#btnToInvPage").onclick  = ()=>{ show("pageInv");     loadInventory(); };
$("#btnLogout").onclick     = ()=> setUser(null);

/* ---------- Login ---------- */
$("#btnLogin").onclick = loginSubmit;
$("#inUser").addEventListener("keydown", e=>{ if(e.key==='Enter') loginSubmit(); });
$("#inPass").addEventListener("keydown", e=>{ if(e.key==='Enter') loginSubmit(); });
async function loginSubmit(){
  const u = $("#inUser").value.trim();
  const p = $("#inPass").value.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");
  try{
    await jsonp('ping');
    const me = await jsonp("login", { username:u, password:p });
    setUser(me);
  }catch(e){ alert("ログイン失敗: " + (e?.message || e)); }
}

/* ---------- Dashboard + 操作 ---------- */
let ORDERS = [];
async function loadOrders(){
  ORDERS = await cached("listOrders");
  renderOrders();
  loadShipsMini();
}
function renderOrders(){
  const q = ($("#searchQ").value||"").trim().toLowerCase();
  const rows = ORDERS.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  const tb = $("#tbOrders"); tb.innerHTML = "";

  const chunk = 120;
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
    if(i < rows.length && 'requestIdleCallback' in window) requestIdleCallback(paint);
  }
  paint();

  $$(".btn-scan",tb).forEach(b=> b.onclick=(e)=> openScanDialog(e.currentTarget.dataset.po));
  $$(".btn-op",tb).forEach(b=> b.onclick=(e)=> openOpDialog(e.currentTarget.dataset.po));
}
const debouncedRender = debounce(renderOrders, 250);
$("#searchQ").addEventListener("input", debouncedRender);
async function refreshAll(){ await loadOrders(); }
$("#btnExportOrders").onclick = ()=> exportTableCSV("#tbOrders","orders.csv");

/* ---------- 操作: 手入力 ---------- */
const PROCESS_OPTIONS = [
  "準備","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","検査中","検査済","出荷（組立済）","出荷準備","出荷済"
];
function openOpDialog(po, defaults = {}){
  $("#opPO").textContent = po;
  const sel = $("#opProcess");
  sel.innerHTML = PROCESS_OPTIONS.map(o=>`<option value="${o}">${o}</option>`).join('');

  $("#opProcess").value = defaults.process || PROCESS_OPTIONS[0];
  $("#opOK").value      = (defaults.ok_count ?? defaults.ok ?? "") === 0 ? 0 : (defaults.ok_count ?? defaults.ok ?? "");
  $("#opNG").value      = (defaults.ng_count ?? defaults.ng ?? "") === 0 ? 0 : (defaults.ng_count ?? defaults.ng ?? "");
  $("#opNote").value    = defaults.note || "";

  $("#dlgOp").showModal();

  $("#btnOpSave").onclick = async ()=>{
    const okStr = $("#opOK").value;
    const ngStr = $("#opNG").value;
    const proc  = $("#opProcess").value;
    if(!proc) return alert("工程を選択してください");
    if(okStr === "") return alert("OK 数を入力してください（0 以上）");
    if(ngStr === "") return alert("NG 数を入力してください（0 以上）");
    const ok = Number(okStr), ng = Number(ngStr);
    if(Number.isNaN(ok) || ok < 0) return alert("OK 数は 0 以上の数値で入力してください");
    if(Number.isNaN(ng) || ng < 0) return alert("NG 数は 0 以上の数値で入力してください");

    try{
      await jsonp("saveOp", { data: JSON.stringify({ po_id: po, process: proc, ok_count: ok, ng_count: ng, note: $("#opNote").value }), user: JSON.stringify(CURRENT_USER||{}) });
      $("#dlgOp").close();
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

/* ---------- Masters ---------- */
let MASTERS = { customers:[], drawings:[], item_names:[], part_nos:[], destinations:[], carriers:[], po_ids:[] };
async function loadMasters(){
  try{ MASTERS = await cached("listMasters", {}, 60000); }catch(_){ }
}

/* ---------- 受注 ---------- */
const SALES_FIELDS = [
  {name:'po_id', label:'注番', req:true},
  {name:'得意先', label:'得意先', type:'select', options:()=>MASTERS.customers, free:true},
  {name:'図番',   label:'図番',   type:'select', options:()=>MASTERS.drawings,  free:true},
  {name:'品名',   label:'品名',   type:'select', options:()=>MASTERS.item_names,free:true},
  {name:'品番',   label:'品番',   type:'select', options:()=>MASTERS.part_nos,  free:true},
  {name:'受注日', label:'受注日', type:'date'},
  {name:'製造番号', label:'製造番号'},
  {name:'qty',   label:'数量'},
  {name:'納期',  label:'納期', type:'date'},
  {name:'備考',  label:'備考'}
];
const SALES_VIEW = [
  {label:'受注日',   keys:['受注日']},
  {label:'得意先',   keys:['得意先','customer']},
  {label:'品名',     keys:['品名','item_name']},
  {label:'品番',     keys:['品番','part_no','item_code']},
  {label:'図番',     keys:['図番','drawing_no']},
  {label:'製番号',   keys:['製番号','製造番号']},
  {label:'数量',     keys:['数量','qty']},
  {label:'希望納期', keys:['希望納期','納期','due']},
  {label:'備考',     keys:['備考','note']}
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
    function paint(){
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
        tr.innerHTML = `${tds}
          <td class="center">
            <div class="row">
              <button class="btn ghost btn-edit" data-po="${po}"><i class="fa-regular fa-pen-to-square"></i> 編集</button>
              <button class="btn ghost btn-del"  data-po="${po}"><i class="fa-regular fa-trash-can"></i> 削除</button>
            </div>
          </td>`;
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<rows.length && 'requestIdleCallback' in window) requestIdleCallback(paint);
      if(i>=rows.length){
        $$(".btn-edit", tb).forEach(b=> b.onclick = (e)=> editSales(e.currentTarget.dataset.po, dat));
        $$(".btn-del",  tb).forEach(b=> b.onclick = (e)=> deleteSales(e.currentTarget.dataset.po));
      }
    }
    paint();
  };
  if(search) search.oninput = debounce(render, 250);
  render();
}
function rowToObject(dat, po_id){
  const header = dat.header || [];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const keyPO = (idx['po_id']!=null ? 'po_id' : (idx['注番']!=null ? '注番' : header[0]));
  const row = (dat.rows||[]).find(r => String(r[idx[keyPO]])===String(po_id));
  if(!row) return null;
  const obj = {}; header.forEach((h,i)=> obj[String(h).trim()] = row[i]); obj.po_id = obj.po_id || obj['注番'] || po_id; return obj;
}
function editSales(po_id, dat){
  const obj = rowToObject(dat, po_id);
  if(!obj) return alert('データが見つかりません');
  const initial = {
    po_id: obj.po_id,
    '得意先': obj['得意先'] || obj.customer || '',
    '図番':   obj['図番'] || obj.drawing_no || '',
    '品名':   obj['品名'] || obj.item_name || '',
    '品番':   obj['品番'] || obj.part_no || obj.item_code || '',
    '受注日': obj['受注日'] || '',
    '製造番号': obj['製造番号'] || obj['製番号'] || '',
    'qty':    obj['数量'] || obj.qty || '',
    '納期':   obj['希望納期'] || obj['納期'] || obj.due || '',
    '備考':   obj['備考'] || obj.note || ''
  };
  openForm("受注 編集", SALES_FIELDS, "saveSales", async ()=>{ await loadSales(); }, initial);
}
async function deleteSales(po_id){
  if(!confirm(`注番 ${po_id} を削除しますか？`)) return;
  try{ await jsonp('deleteSales', { po_id }); await loadSales(); }catch(e){ alert('削除失敗: ' + (e?.message || e)); }
}
$("#btnSalesCreate").onclick = ()=> openForm("受注作成", SALES_FIELDS, "saveSales");
$("#btnSalesExport").onclick = ()=> exportTableCSV("#tbSales","sales.csv");
$("#btnSalesImport").onclick = ()=> importCSVtoSheet("bulkImportSales");
$("#btnSalesPrint").onclick  = ()=> window.print();
$("#btnSalesTpl")?.addEventListener('click', ()=>{
  const headers = ['po_id','得意先','図番','品名','品番','受注日','製造番号','qty','納期','備考'];
  const csv = headers.map(h=>`"${h}"`).join(',') + '\n';
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'sales_template.csv'; a.click();
});

/* ---------- 生産計画 ---------- */
const PLAN_FIELDS = [
  {name:'po_id', label:'注番', type:'select', options:()=>MASTERS.po_ids, free:true, req:true},
  {name:'得意先', label:'得意先', type:'select', options:()=>MASTERS.customers, free:true},
  {name:'図番', label:'図番', type:'select', options:()=>MASTERS.drawings, free:true},
  {name:'品名', label:'品名', type:'select', options:()=>MASTERS.item_names, free:true},
  {name:'品番', label:'品番', type:'select', options:()=>MASTERS.part_nos, free:true},
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
  {name:'po_id', label:'注番', type:'select', options:()=>MASTERS.po_ids, free:true, req:true},
  {name:'得意先', label:'得意先', type:'select', options:()=>MASTERS.customers, free:true},
  {name:'図番', label:'図番', type:'select', options:()=>MASTERS.drawings, free:true},
  {name:'品名', label:'品名', type:'select', options:()=>MASTERS.item_names, free:true},
  {name:'品番', label:'品番', type:'select', options:()=>MASTERS.part_nos, free:true},
  {name:'製造番号', label:'製造番号'},
  {name:'qty', label:'数量'},
  {name:'destination', label:'送り先', type:'select', options:()=>MASTERS.destinations, free:true},
  {name:'scheduled_date', label:'出荷日', type:'date'},
  {name:'delivery_date', label:'納入日', type:'date'},
  {name:'carrier', label:'運送会社', type:'select', options:()=>MASTERS.carriers, free:true},
  {name:'note', label:'備考'}
];
const SHIP_VIEW = [
  {label:'注番',     keys:['po_id','注番']},
  {label:'得意先',   keys:['得意先','customer']},
  {label:'品名',     keys:['品名','item_name']},
  {label:'品番',     keys:['品番','part_no']},
  {label:'図番',     keys:['図番','drawing_no']},
  {label:'製番号',   keys:['製造番号','製番号']},
  {label:'数量',     keys:['qty','数量']},
  {label:'送り先',   keys:['destination','送り先']},
  {label:'出荷日',   keys:['scheduled_date','出荷日']},
  {label:'納入日',   keys:['delivery_date','納入日']},
  {label:'運送会社', keys:['carrier','運送会社']},
  {label:'備考',     keys:['note','備考']}
];
const SHIP_UI = { selectedCustomer:'', selectedDate:'', groupByDate:true };

async function loadShips(){
  const dat = await cached("listShip");
  ensureShipControls(dat);
  renderShipSlim(dat);
}
function ensureShipControls(dat){
  if($("#shipCtrlBar")) return;
  const tableWrap = $("#thShip")?.closest("div") || $("#pageShip");
  const bar = document.createElement("div");
  bar.id = "shipCtrlBar";
  bar.className = "row wrap gap";
  bar.style.margin = "8px 0 12px";

  const selCust = document.createElement("select");
  selCust.id = "shipCustSel";
  selCust.innerHTML = `<option value="">(すべての得意先)</option>` + MASTERS.customers.map(c=>`<option value="${c}">${c}</option>`).join('');

  const inDate = document.createElement("input");
  inDate.type = "date"; inDate.id = "shipDateSel";

  const ckWrap = document.createElement("label");
  ckWrap.style.display="inline-flex"; ckWrap.style.alignItems="center"; ckWrap.style.gap="6px";
  ckWrap.innerHTML = `<input id="shipGroupChk" type="checkbox" checked> 日付でグループ化`;

  const btnPrintCust = document.createElement("button");
  btnPrintCust.className = "btn ghost"; btnPrintCust.textContent = "得意先で印刷";
  const btnPrintCustDate = document.createElement("button");
  btnPrintCustDate.className = "btn ghost"; btnPrintCustDate.textContent = "得意先＋日付で印刷";

  bar.append(makeLabel("得意先", selCust), makeLabel("日付", inDate), ckWrap, btnPrintCust, btnPrintCustDate);
  tableWrap.parentNode.insertBefore(bar, tableWrap);

  selCust.onchange = ()=>{ SHIP_UI.selectedCustomer = selCust.value; renderShipSlim(dat); };
  inDate.onchange   = ()=>{ SHIP_UI.selectedDate    = inDate.value;  renderShipSlim(dat); };
  $("#shipGroupChk").onchange = (e)=>{ SHIP_UI.groupByDate = e.target.checked; renderShipSlim(dat); };
  btnPrintCust.onclick = async ()=>{ if(!SHIP_UI.selectedCustomer){ alert("得意先を選択してください"); return; } await printShipByCustomer(SHIP_UI.selectedCustomer); };
  btnPrintCustDate.onclick = async ()=>{ if(!SHIP_UI.selectedCustomer || !SHIP_UI.selectedDate){ alert("得意先と日付を選択してください"); return; } await printShipByCustomer(SHIP_UI.selectedCustomer, SHIP_UI.selectedDate); };

  function makeLabel(txt, el){ const w=document.createElement("div"); w.className="row gap s"; w.innerHTML=`<div class="muted s" style="min-width:60px">${txt}</div>`; w.append(el); return w; }
}
function renderShipSlim(dat){
  const th = $("#thShip"), tb = $("#tbShip"), search = $("#shipSearch");
  const header = dat.header || [];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const keySID = (idx['ship_id']!=null ? 'ship_id' : null);
  const keyPO  = (idx['po_id']!=null ? 'po_id' : (idx['注番']!=null ? '注番' : header[0]));
  const pick = (row, keys)=>{ for(const k of keys){ const i=idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; } return ''; };
  const dstr = (v)=>{ const d=(v instanceof Date)?v:new Date(v); return isNaN(d)?'':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };

  th.innerHTML = `<tr>${SHIP_VIEW.map(c=>`<th>${c.label}</th>`).join('')}<th>操作</th></tr>`;

  const q = (search?.value||'').toLowerCase();
  let rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));

  if(SHIP_UI.selectedCustomer){
    rows = rows.filter(r => String(r[idx['得意先']]||r[idx['customer']]||'') === SHIP_UI.selectedCustomer);
  }
  if(SHIP_UI.selectedDate){
    rows = rows.filter(r => {
      const d = r[idx['scheduled_date']] ?? r[idx['出荷日']];
      return d && dstr(d) === SHIP_UI.selectedDate;
    });
  }

  tb.innerHTML = '';
  if(SHIP_UI.groupByDate){
    const groups = {};
    rows.forEach(r=>{
      const key = dstr(r[idx['scheduled_date']] ?? r[idx['出荷日']] ?? '');
      groups[key||'(日付未設定)'] ??= []; groups[key||'(日付未設定)'].push(r);
    });
    Object.keys(groups).sort().forEach(dateKey=>{
      const arr = groups[dateKey];
      const total = arr.reduce((s,r)=> s + Number(r[idx['qty']]||r[idx['数量']]||0), 0);
      const trH = document.createElement('tr');
      trH.innerHTML = `<td colspan="${SHIP_VIEW.length+1}" style="background:#f6f7fb;font-weight:600">${dateKey}（合計: ${total}）</td>`;
      tb.appendChild(trH);

      const frag = document.createDocumentFragment();
      arr.forEach(r=>{
        const shipId = keySID? r[idx[keySID]] : '';
        const po = String(r[idx[keyPO]]||'');
        const tds = SHIP_VIEW.map(col=>{
          let v = pick(r, col.keys);
          if(v && /出荷日|納入日/.test(col.label)){ const d=(v instanceof Date)?v:new Date(v); if(!isNaN(d)) v = d.toLocaleDateString('ja-JP'); }
          return `<td>${v ?? ''}</td>`;
        }).join('');
        const tr = document.createElement('tr');
        tr.innerHTML = `${tds}
          <td class="center">
            <div class="row">
              <button class="btn ghost btn-edit-ship" data-po="${po}" data-sid="${shipId}"><i class="fa-regular fa-pen-to-square"></i> 編集</button>
              <button class="btn ghost btn-del-ship"  data-po="${po}" data-sid="${shipId}"><i class="fa-regular fa-trash-can"></i> 削除</button>
            </div>
          </td>`;
        frag.appendChild(tr);
      });
      tb.appendChild(frag);
    });
  }else{
    const frag = document.createDocumentFragment();
    rows.forEach(r=>{
      const shipId = keySID? r[idx[keySID]] : '';
      const po = String(r[idx[keyPO]]||'');
      const tds = SHIP_VIEW.map(col=>{
        let v = pick(r, col.keys);
        if(v && /出荷日|納入日/.test(col.label)){ const d=(v instanceof Date)?v:new Date(v); if(!isNaN(d)) v = d.toLocaleDateString('ja-JP'); }
        return `<td>${v ?? ''}</td>`;
      }).join('');
      const tr=document.createElement('tr');
      tr.innerHTML = `${tds}
        <td class="center">
          <div class="row">
            <button class="btn ghost btn-edit-ship" data-po="${po}" data-sid="${shipId}"><i class="fa-regular fa-pen-to-square"></i> 編集</button>
            <button class="btn ghost btn-del-ship"  data-po="${po}" data-sid="${shipId}"><i class="fa-regular fa-trash-can"></i> 削除</button>
          </div>
        </td>`;
      frag.appendChild(tr);
    });
    tb.appendChild(frag);
  }

  $$(".btn-edit-ship", tb).forEach(b=> b.onclick = (e)=> editShip(e.currentTarget.dataset.po, e.currentTarget.dataset.sid, dat));
  $$(".btn-del-ship",  tb).forEach(b=> b.onclick = (e)=> deleteShip(e.currentTarget.dataset.po, e.currentTarget.dataset.sid));

  if(search) search.oninput = debounce(()=> renderShipSlim(dat), 250);
}
function editShip(po_id, ship_id, dat){
  const header = dat.header||[];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));

  const keyPO = (idx['po_id']!=null) ? 'po_id' : (idx['注番']!=null ? '注番' : null);

  const row = (dat.rows||[]).find(r =>
    (ship_id && idx['ship_id']!=null && String(r[idx['ship_id']]) === String(ship_id)) ||
    (keyPO && String(r[idx[keyPO]]) === String(po_id))
  );

  if(!row) return alert('データが見つかりません');

  const initial = {
    ship_id: row[idx['ship_id']]||'',
    po_id:   row[idx['po_id']]||row[idx['注番']]||'',
    '得意先': row[idx['得意先']]||row[idx['customer']]||'',
    '図番':   row[idx['図番']]||row[idx['drawing_no']]||'',
    '品名':   row[idx['品名']]||row[idx['item_name']]||'',
    '品番':   row[idx['品番']]||row[idx['part_no']]||'',
    '製造番号': row[idx['製造番号']]||row[idx['製番号']]||'',
    'qty':    row[idx['qty']]||row[idx['数量']]||'',
    'destination':    row[idx['destination']]||row[idx['送り先']]||'',
    'scheduled_date': row[idx['scheduled_date']]||row[idx['出荷日']]||'',
    'delivery_date':  row[idx['delivery_date']]||row[idx['納入日']]||'',
    'carrier': row[idx['carrier']]||row[idx['運送会社']]||'',
    'note':    row[idx['note']]||row[idx['備考']]||''
  };

  openForm(
    "出荷予定 編集",
    SHIP_FIELDS,
    "saveShip",
    async ()=>{ await loadShips(); },
    initial,
    { extraHidden: { ship_id: initial.ship_id } }
  );
}
async function deleteShip(po_id, ship_id){
  if(!confirm(`出荷予定を削除しますか？\n注番:${po_id}${ship_id? ' / ID:'+ship_id:''}`)) return;
  try{ await jsonp('deleteShip', { po_id, ship_id }); await loadShips(); }catch(e){ alert('削除失敗: ' + (e?.message || e)); }
}
$("#btnShipCreate").onclick = ()=> openForm("出荷予定 作成", SHIP_FIELDS, "saveShip", ()=> { loadShips(); loadShipsMini(); });
$("#btnShipExport").onclick = ()=> exportTableCSV("#tbShip","shipments.csv");
$("#btnShipImport").onclick = ()=> importCSVtoSheet("bulkImportShip", ()=> { loadShips(); loadShipsMini(); });
$("#btnShipPrint").onclick  = ()=> window.print();
$("#btnShipTpl")?.addEventListener('click', ()=>{
  const headers = ['po_id','得意先','図番','品名','品番','製造番号','qty','destination','scheduled_date','delivery_date','carrier','note'];
  const csv = headers.map(h=>`"${h}"`).join(',') + '\n';
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'shipments_template.csv'; a.click();
});

/* ミニ: 本日出荷 & 出荷予定 */
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
  const renderSide = (arr, el)=>{ el.innerHTML = arr.slice(0,50).map(e=>`
    <div class="ship-item">
      <div><b>${e.po||''}</b> <span class="muted s">${e.dest||''}</span></div>
      <div class="row-between s"><span>${new Date(e.date).toLocaleDateString('ja-JP')}</span><span>${e.qty||''}</span></div>
    </div>`).join('') || `<div class="muted s">なし</div>`; };
  const tEl = $("#shipToday"), pEl = $("#shipPlan");
  if(tEl && pEl){ renderSide(todayList, tEl); renderSide(futureList, pEl); }
}

/* ---------- 完成品一覧 ---------- */
const FIN_VIEW = [
  {label:'注番',     keys:['po_id','注番']},
  {label:'得意先',   keys:['得意先','customer']},
  {label:'品名',     keys:['品名','item_name']},
  {label:'品番',     keys:['品番','part_no']},
  {label:'図番',     keys:['図番','drawing_no']},
  {label:'製番号',   keys:['製造番号','製番号']},
  {label:'完了数',   keys:['完了数']},
  {label:'状態',     keys:['状態','status']},
  {label:'完了日',   keys:['completed_at']},
  {label:'更新者',   keys:['updated_by']},
];
async function loadFinished(){
  const dat = await cached("listFinished", {}, 5000);
  const th = $("#thFin"), tb = $("#tbFin"), search = $("#finSearch");

  const head = dat.header||[];
  const idx  = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
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
            const d=(v instanceof Date)?v:new Date(v); if(!isNaN(d)) v = d.toLocaleString('ja-JP');
          }
          return `<td>${v??''}</td>`;
        }).join('');
        const tr=document.createElement('tr'); tr.innerHTML = tds; frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<rows.length && 'requestIdleCallback' in window) requestIdleCallback(paint);
    }
    paint();
  };
  if(search) search.oninput = debounce(render, 250);
  render();
}
$("#btnFinExport")?.addEventListener('click', ()=> exportTableCSV("#tbFin","finished_goods.csv"));
$("#btnFinPrint")?.addEventListener('click', ()=> window.print());

/* ---------- 在庫 ---------- */
async function loadInventory(){
  // Backend akan menghitung dari StatusLog(検査済) - Ship(出荷済)
  const dat = await cached("listInventory", {}, 5000)
    .catch(()=>({header:['得意先','品番','品名','図番','数量','備考'], rows:[]}));

  renderTable(dat, "#thInv", "#tbInv", "#invSearch");
}
$("#btnInvExport")?.addEventListener('click', ()=> exportTableCSV("#tbInv","inventory.csv"));
$("#btnInvPrint")?.addEventListener('click', ()=> window.print());

/* ---------- Form dialog generator ---------- */
let CURRENT_API = null;
// openForm(title, fields, api, after, initial={}, opts={extraHidden:{}})
function openForm(title, fields, api, after, initial={}, opts={}){
  CURRENT_API = api;
  $("#dlgTitle").textContent = title;
  const f = $("#formBody"); f.innerHTML = "";

  const extras = opts?.extraHidden || {};
  Object.entries(extras).forEach(([k,v])=>{
    const hid = document.createElement("input"); hid.type="hidden"; hid.name=k; hid.value=v??''; f.appendChild(hid);
  });

  fields.forEach(x=>{
    const wrap = document.createElement("div");
    wrap.className = "form-item";
    const label = `<div class="muted s">${x.label}${x.req? ' <span style="color:#c00">*</span>':''}</div>`;
    let input = '';
    let opts = (typeof x.options === 'function') ? x.options() : (x.options||[]);
    const val = (initial[x.name] ?? '');
    const id = `in_${x.name}_${Math.random().toString(36).slice(2)}`;

    if(x.type==='select' && x.free){
      input = `<input name="${x.name}" list="dl-${id}" placeholder="${x.label}" value="${val??''}"><datalist id="dl-${id}">${opts.map(o=>`<option value="${o}">`).join('')}</datalist>`;
    }else if(x.type==='select'){
      input = `<select name="${x.name}">${opts.map(o=>`<option value="${o}">${o}</option>`).join('')}</select>`;
      setTimeout(()=>{ const sel=f.querySelector(`[name="${x.name}"]`); if(sel) sel.value = String(val??''); },0);
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

  $("#dlgForm").showModal();

  $("#btnDlgSave").onclick = async ()=>{
    const data = {};
    [...f.querySelectorAll("[name]")].forEach(inp=>{
      let v = inp.value;
      if(inp.type==='date' && v) v = new Date(v).toISOString().slice(0,10);
      data[inp.name] = v;
    });
    try{
      await jsonp(CURRENT_API, { data: JSON.stringify(data), user: JSON.stringify(CURRENT_USER||{}) });
      $("#dlgForm").close();
      if(after) await after();
      if(api==="savePlan") await loadOrders();
    }catch(e){ alert("保存失敗: " + e.message); }
  };
}
$("#btnDlgCancel").onclick = ()=> $("#dlgForm").close();

/* ---------- Generic table renderer ---------- */
function renderTable(dat, thSel, tbSel, searchSel){
  const th = $(thSel), tb = $(tbSel), search = $(searchSel);
  th.innerHTML = `<tr>${dat.header.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const render = ()=>{
    const q = (search.value||'').toLowerCase();
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
  if(search) search.oninput = debounce(render, 250);
  render();
}

/* ---------- CSV Export / Import ---------- */
function exportTableCSV(tbodySel, filename){
  const rows = $$(tbodySel+" tr").map(tr=> [...tr.children].map(td=> td.textContent));
  const csv = rows.map(r => r.map(v=>{ const s = (v??'').toString().replace(/"/g,'""'); return `"${s}"`; }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const a = document.createElement('a');
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
          $("#scanResult").textContent = `QR: ${code.data}`;
          if(scanRAF) cancelAnimationFrame(scanRAF);
          if(scanStream) { scanStream.getTracks().forEach(t=> t.stop()); }
          const parts = String(code.data||'').split('|');
          let defaults = {};
          if(parts.length >= 4){ defaults = { process: parts[1] || "", ok_count: Number(parts[2]||""), ng_count: Number(parts[3]||""), note: parts[4] || "" }; }
          else{ defaults = { process:"", ok_count:"", ng_count:"", note:"" }; }
          openOpDialog(po, defaults); return;
        }
        scanRAF = requestAnimationFrame(tick);
      };
      tick();
    }catch(e){ alert("Camera error: "+e.message); }
  };
}
$("#btnScanClose").onclick = ()=>{ if(scanRAF) cancelAnimationFrame(scanRAF); if(scanStream) scanStream.getTracks().forEach(t=> t.stop()); $("#dlgScan").close(); };

/* ---------- Cuaca ---------- */
async function ensureWeather(){
  try{
    const cacheKey = 'wx_cache_v1';
    const cachedWX = JSON.parse(localStorage.getItem(cacheKey)||'null');
    const now = Date.now();
    if(cachedWX && (now - cachedWX.t) < 30*60*1000){ renderWeather(cachedWX.v); return; }
    let lat=35.6762, lon=139.6503;
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
  $("#wxTemp").textContent = Math.round(v.current.temperature_2m) + "°C";
  $("#wxWind").textContent = Math.round(v.current.wind_speed_10m) + " m/s";
  $("#wxPlace").textContent = v.timezone_abbreviation || "";
}

/* ---------- Utils ---------- */
function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", ()=> setUser(null));

/* ---------- Print 出荷予定 ---------- */
async function printShipByCustomer(cust, ymd){
  const dat = await cached("listShip", {}, 5000);
  const head = dat.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
  const rowsAll = (dat.rows||[]).filter(r => String(r[idx['得意先']]||r[idx['customer']]||'') === cust);
  const dkey = (v)=>{ const d=(v instanceof Date)?v:new Date(v); return isNaN(d)?'(日付未設定)':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
  const rows = ymd ? rowsAll.filter(r => dkey(r[idx['scheduled_date']]||r[idx['出荷日']]) === ymd) : rowsAll;

  const groups = {}; rows.forEach(r=>{ const k = dkey(r[idx['scheduled_date']]||r[idx['出荷日']]); groups[k] ??= []; groups[k].push(r); });
  const mapDate = (v)=>{ const d=(v instanceof Date)?v:new Date(v); return isNaN(d)?'':d.toLocaleDateString('ja-JP'); };

  const html = `
  <html><head><meta charset="utf-8"><title>出荷予定 - ${cust}${ymd? ' '+ymd:''}</title>
  <style>
    body{font-family:system-ui,"Segoe UI",Roboto,Helvetica,Arial;padding:24px;}
    h1{font-size:20px;margin:0 0 6px;}
    h2{font-size:14px;margin:16px 0 8px;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
    th{background:#f6f7fb;}
    .right{text-align:right}
  </style></head>
  <body>
    <h1>出荷予定（${cust}${ymd? ' / '+ymd:''}）</h1>
    ${Object.keys(groups).sort().map(k=>{
      const arr = groups[k];
      const total = arr.reduce((s,r)=> s + Number(r[idx['qty']]||r[idx['数量']]||0), 0);
      return `
      <h2>${k}　合計: ${total}</h2>
      <table>
        <tr>${['注番','品名','品番','図番','製造番号','数量','送り先','出荷日','納入日','運送会社','備考'].map(h=>`<th>${h}</th>`).join('')}</tr>
        ${arr.map(r=>`
          <tr>
            <td>${r[idx['po_id']]||r[idx['注番']]||''}</td>
            <td>${r[idx['品名']]||r[idx['item_name']]||''}</td>
            <td>${r[idx['品番']]||r[idx['part_no']]||''}</td>
            <td>${r[idx['図番']]||r[idx['drawing_no']]||''}</td>
            <td>${r[idx['製造番号']]||r[idx['製番号']]||''}</td>
            <td class="right">${r[idx['qty']]||r[idx['数量']]||''}</td>
            <td>${r[idx['destination']]||r[idx['送り先']]||''}</td>
            <td>${mapDate(r[idx['scheduled_date']]||r[idx['出荷日']]||'')}</td>
            <td>${mapDate(r[idx['delivery_date']]||r[idx['納入日']]||'')}</td>
            <td>${r[idx['carrier']]||r[idx['運送会社']]||''}</td>
            <td>${r[idx['note']]||r[idx['備考']]||''}</td>
          </tr>`).join('')}
      </table>`;
    }).join('')}
    <script>window.print();</script>
  </body></html>`;
  const w = window.open('about:blank'); w.document.write(html); w.document.close();
}
