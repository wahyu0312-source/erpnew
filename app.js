/* =================================================
   東京精密発條株式会社システム - app.js (optimized)
   ================================================= */

/* ---------- Config & tiny utils ---------- */
const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => [...el.querySelectorAll(q)];
const fmt = d => d ? new Date(d).toLocaleString("ja-JP") : "";
const qs = o => Object.entries(o).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const normalizeProc = s => String(s||"").trim()
  .replace("レーサ加工","レザー加工").replace("外作加工","外注加工/組立") || "未設定";
const rafLoop = (fn) => { const tick=()=>{ if(fn()!==false) requestAnimationFrame(tick); }; requestAnimationFrame(tick); };
const showEl = (el, yes) => el && el.classList.toggle("hidden", !yes);

/* ---------- JSONP helper (8s timeout) ---------- */
function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const cleanup = () => { try{ delete window[cb]; s.remove(); }catch{} };
    const t = setTimeout(() => { cleanup(); reject(new Error("API timeout")); }, 8000);

    window[cb] = (resp) => {
      clearTimeout(t); cleanup();
      if (resp && resp.ok) resolve(resp.data);
      else reject(new Error((resp && resp.error) || "API error"));
    };

    params = { ...params, action, callback: cb };
    s.src = `${API_BASE}?${qs(params)}`;
    s.onerror = () => { clearTimeout(t); cleanup(); reject(new Error("JSONP load error")); };
    document.body.appendChild(s);
  });
}

/* ---------- MEM cache ---------- */
const apiCache = new Map();
async function cached(action, params = {}, ttlMs = 15000) {
  const key = action + ":" + JSON.stringify(params||{});
  const hit = apiCache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await jsonp(action, params);
  apiCache.set(key, { v, t: now });
  return v;
}

/* ---------- Badges ---------- */
const procToChip = (p) => {
  p = normalizeProc(p);
  if (/レザー加工|レーザー/.test(p)) return `<span class="chip p-laser"><i class="fa-solid fa-bolt"></i>${p}</span>`;
  if (/曲げ/.test(p))            return `<span class="chip p-bend"><i class="fa-solid fa-wave-square"></i>${p}</span>`;
  if (/外注加工|加工/.test(p))    return `<span class="chip p-press"><i class="fa-solid fa-compass-drafting"></i>${p}</span>`;
  if (/組立/.test(p))            return `<span class="chip p-assembly"><i class="fa-solid fa-screwdriver-wrench"></i>${p}</span>`;
  if (/検査/.test(p))            return `<span class="chip p-inspection"><i class="fa-regular fa-square-check"></i>${p}</span>`;
  return `<span class="chip p-other"><i class="fa-regular fa-square"></i>${p||'—'}</span>`;
};
const statusToBadge = (s) => {
  s = String(s||"");
  if (/組立中/.test(s)) return `<span class="badge"><i class="fa-solid fa-screwdriver-wrench"></i>${s}</span>`;
  if (/組立済/.test(s)) return `<span class="badge"><i class="fa-regular fa-circle-check"></i>${s}</span>`;
  if (/検査中/.test(s)) return `<span class="badge st-inspected"><i class="fa-regular fa-clipboard"></i>${s}</span>`;
  if (/検査済/.test(s)) return `<span class="badge st-inspected"><i class="fa-regular fa-circle-check"></i>${s}</span>`;
  if (/出荷準備/.test(s)) return `<span class="badge st-ready"><i class="fa-solid fa-box-open"></i>${s}</span>`;
  if (/出荷済/.test(s)) return `<span class="badge st-shipped"><i class="fa-solid fa-truck"></i>${s}</span>`;
  return `<span class="badge"><i class="fa-regular fa-clock"></i>${s||"—"}</span>`;
};

/* ---------- Auth & Role ---------- */
let CURRENT_USER = null;
const ROLE_MAP = {
  'admin':     { pages:['pageDash','pageSales','pagePlan','pageShip','pageFinished','pageInv','pageInvoice','pageCharts'], nav:true },
  '営業':       { pages:['pageSales','pageDash','pageFinished','pageInv','pageInvoice','pageCharts'], nav:true },
  '生産管理':    { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv','pageInvoice','pageCharts'], nav:true },
  '生産管理部':  { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv','pageInvoice','pageCharts'], nav:true },
  '製造':       { pages:['pageDash','pageFinished','pageInv','pageCharts'], nav:true },
  '検査':       { pages:['pageDash','pageFinished','pageInv','pageCharts'], nav:true }
};

function setUser(u){
  CURRENT_USER = u || null;
  $("#userInfo").textContent = u ? `${u.role||''} / ${u.department||''}` : "";

  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice","pageCharts"];
  pages.forEach(p => $("#"+p)?.classList.add("active")==false && $("#"+p)?.classList.remove("active"));

  // Hide all nav buttons first
  ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToFinPage','btnToInvPage','btnToInvoice','btnToAnalytics','ddSetting','weatherWrap']
    .forEach(id => $("#"+id)?.classList.add("hidden"));

  if(!u){
    $("#authView")?.classList.add("active");
    return;
  }

  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP['admin'];
  if (allow?.nav) {
    if (allow.pages.includes('pageDash'))     $("#btnToDash").classList.remove("hidden");
    if (allow.pages.includes('pageSales'))    $("#btnToSales").classList.remove("hidden");
    if (allow.pages.includes('pagePlan'))     $("#btnToPlan").classList.remove("hidden");
    if (allow.pages.includes('pageShip'))     $("#btnToShip").classList.remove("hidden");
    if (allow.pages.includes('pageFinished')) $("#btnToFinPage").classList.remove("hidden");
    if (allow.pages.includes('pageInv'))      $("#btnToInvPage").classList.remove("hidden");
    if (allow.pages.includes('pageInvoice'))  $("#btnToInvoice").classList.remove("hidden");
    if (allow.pages.includes('pageCharts'))   $("#btnToAnalytics").classList.remove("hidden");
    $("#ddSetting").classList.remove("hidden");
    $("#weatherWrap").classList.remove("hidden");
    ensureWeather();
    loadMasters();
  }
  show("pageDash");
  refreshAll();
}

/* ---------- Navigation ---------- */
function show(id){
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice","pageCharts"]
    .forEach(p => $("#"+p)?.classList.remove("active"));
  $("#"+id)?.classList.add("active");
}
$("#btnToDash").onclick = ()=>{ show("pageDash"); refreshAll(); };
$("#btnToSales").onclick= ()=>{ show("pageSales"); loadSales(); };
$("#btnToPlan").onclick = ()=>{ show("pagePlan");  loadPlans(); };
$("#btnToShip").onclick = ()=>{ show("pageShip");  loadShips(); };
$("#btnToFinPage").onclick = ()=>{ show("pageFinished"); loadFinished(); };
$("#btnToInvPage").onclick = ()=>{ show("pageInv"); loadInventory(); };
$("#btnToInvoice").onclick = ()=>{ show("pageInvoice"); loadInvoices(); };
$("#btnToAnalytics").onclick = ()=>{ show("pageCharts"); loadCharts(); };
$("#btnLogout").onclick = ()=> setUser(null);

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
  }catch(e){
    alert("ログイン失敗: " + (e?.message || e));
  }
}

/* ---------- Dashboard + Orders ---------- */
let ORDERS = [];
function toggleSkeleton(el, on){ showEl(el, on); }

async function loadOrders(){
  toggleSkeleton($("#ordersSkeleton"), true);
  try {
    ORDERS = await cached("listOrders", {}, 15000);
    renderOrders();
    loadShipsMini();
  } finally {
    toggleSkeleton($("#ordersSkeleton"), false);
  }
}
function renderOrders(){
  const q = ($("#searchQ").value||"").trim().toLowerCase();
  const rows = (ORDERS||[]).filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  const tb = $("#tbOrders");
  tb.innerHTML = "";
  let i = 0, chunk = 160;

  rafLoop(()=>{
    const end = Math.min(i + chunk, rows.length);
    const frag = document.createDocumentFragment();
    for(; i < end; i++){
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
        <td class="center"><div class="cell-stack">${statusToBadge(r.status)}</div></td>
        <td class="center">
          <div class="cell-stack">
            ${procToChip(r.current_process)}
            <div class="counts s"><span class="count ok">OK:${ok}</span> <span class="count ng">NG:${ng}</span></div>
          </div>
        </td>
        <td class="center">${fmt(r.updated_at)}</td>
        <td class="center">${r.updated_by||"—"}</td>
        <td class="center">
          <div class="row">
            <button class="btn icon ghost btn-stqr" title="工程QR"><i class="fa-solid fa-qrcode"></i><span>工程QR</span></button>
            <button class="btn icon ghost btn-scan" data-po="${r.po_id}" title="スキャン"><i class="fa-solid fa-camera"></i><span>スキャン</span></button>
            <button class="btn icon ghost btn-op" data-po="${r.po_id}" title="手入力"><i class="fa-solid fa-keyboard"></i><span>手入力</span></button>
          </div>
        </td>`;
      frag.appendChild(tr);
    }
    tb.appendChild(frag);
    if(i >= rows.length){
      $$(".btn-stqr",tb).forEach(b=> b.onclick = openStationQrSheet);
      $$(".btn-scan",tb).forEach(b=> b.onclick = e => openScanDialog(e.currentTarget.dataset.po));
      $$(".btn-op",tb).forEach(b=> b.onclick = e => openOpDialog(e.currentTarget.dataset.po));
      return false;
    }
  });
}
$("#searchQ").addEventListener("input", debounce(()=>renderOrders(),250));
$("#btnExportOrders").onclick = ()=> exportTableCSV("#tbOrders","orders.csv");
async function refreshAll(){ await loadOrders(); }

/* ---------- Masters ---------- */
let MASTERS = { customers:[], drawings:[], item_names:[], part_nos:[], destinations:[], carriers:[], po_ids:[] };
async function loadMasters(){
  try{ MASTERS = await cached("listMasters", {}, 60000); }catch(_){ }
}

/* ---------- Sales ---------- */
const SALES_FIELDS = [
  {name:'po_id', label:'注番', req:true},
  {name:'得意先', label:'得意先', type:'select', options:()=>MASTERS.customers, free:true},
  {name:'図番', label:'図番', type:'select', options:()=>MASTERS.drawings, free:true},
  {name:'品名', label:'品名', type:'select', options:()=>MASTERS.item_names,free:true},
  {name:'品番', label:'品番', type:'select', options:()=>MASTERS.part_nos, free:true},
  {name:'受注日', label:'受注日', type:'date'},
  {name:'製造番号', label:'製造番号'},
  {name:'qty', label:'数量'},
  {name:'納期', label:'納期', type:'date'},
  {name:'備考', label:'備考'}
];
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
  toggleSkeleton($("#salesSkeleton"), true);
  try{
    const dat = await cached("listSales", {}, 15000);
    renderSalesSlim(dat);
  }finally{
    toggleSkeleton($("#salesSkeleton"), false);
  }
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
    let i=0, chunk=160;

    rafLoop(()=>{
      const end = Math.min(i+chunk, rows.length);
      const frag = document.createDocumentFragment();
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
        const tr = document.createElement('tr');
        tr.innerHTML = `${tds}<td class="center"><div class="row"><button class="btn ghost btn-edit" data-po="${po}"><i class="fa-regular fa-pen-to-square"></i> 編集</button><button class="btn ghost btn-del" data-po="${po}"><i class="fa-regular fa-trash-can"></i> 削除</button></div></td>`;
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i>=rows.length){
        $$(".btn-edit", tb).forEach(b=> b.onclick = (e)=> editSales(e.currentTarget.dataset.po, dat));
        $$(".btn-del", tb).forEach(b=> b.onclick = (e)=> deleteSales(e.currentTarget.dataset.po));
        return false;
      }
    });
  };
  search.oninput = debounce(render, 250);
  render();
}
function rowToObject(dat, po_id){
  const header = dat.header || [];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const keyPO = (idx['po_id']!=null ? 'po_id' : (idx['注番']!=null ? '注番' : header[0]));
  const row = (dat.rows||[]).find(r => String(r[idx[keyPO]])===String(po_id));
  if(!row) return null;
  const obj = {}; header.forEach((h,i)=> obj[String(h).trim()] = row[i]);
  obj.po_id = obj.po_id || obj['注番'] || po_id;
  return obj;
}
function editSales(po_id, dat){
  const obj = rowToObject(dat, po_id);
  if(!obj) return alert('データが見つかりません');
  const initial = {
    po_id: obj.po_id,
    '得意先': obj['得意先'] || obj.customer || '',
    '図番': obj['図番'] || obj.drawing_no || '',
    '品名': obj['品名'] || obj.item_name || '',
    '品番': obj['品番'] || obj.part_no || obj.item_code || '',
    '受注日': obj['受注日'] || '',
    '製造番号': obj['製造番号'] || obj['製番号'] || '',
    'qty': obj['数量'] || obj.qty || '',
    '納期': obj['希望納期'] || obj['納期'] || obj.due || '',
    '備考': obj['備考'] || obj.note || ''
  };
  openForm("受注 編集", SALES_FIELDS, "saveSales", async ()=>{ await loadSales(); }, initial);
}
async function deleteSales(po_id){
  if(!confirm(`注番 ${po_id} を削除しますか？`)) return;
  try{ await jsonp('deleteSales', { po_id }); await loadSales(); }
  catch(e){ alert('削除失敗: ' + (e?.message || e)); }
}
$("#btnSalesCreate").onclick = ()=> openForm("受注作成", SALES_FIELDS, "saveSales");
$("#btnSalesExport").onclick = ()=> exportTableCSV("#tbSales","sales.csv");
$("#btnSalesImport").onclick = ()=> importCSVtoSheet("bulkImportSales", ()=> loadSales());
$("#btnSalesPrint").onclick  = ()=> window.print();
$("#btnSalesTpl")?.addEventListener('click', ()=>{
  const headers = ['po_id','得意先','図番','品名','品番','受注日','製造番号','qty','納期','備考'];
  downloadCSV('sales_template.csv', headers.map(h=>`"${h}"`).join(',')+'\n');
});

/* ---------- 生産計画 ---------- */
const PLAN_FIELDS = [
  {name:'po_id', label:'注番', type:'select', options:()=>MASTERS.po_ids, free:true, req:true},
  {name:'得意先', label:'得意先', type:'select', options:()=>MASTERS.customers, free:true},
  {name:'図番', label:'図番', type:'select', options:()=>MASTERS.drawings, free:true},
  {name:'品名', label:'品名', type:'select', options:()=>MASTERS.item_names,free:true},
  {name:'品番', label:'品番', type:'select', options:()=>MASTERS.part_nos, free:true},
  {name:'製造番号', label:'製造番号'},
  {name:'qty', label:'数量'},
  {name:'due_date', label:'納期希望', type:'date'},
  {name:'start_date', label:'開始希望', type:'date'},
  {name:'note', label:'備考'}
];
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
  toggleSkeleton($("#planSkeleton"), true);
  try{
    const dat = await cached("listPlans", {}, 20000);
    renderPlansSlim(dat);
  }finally{
    toggleSkeleton($("#planSkeleton"), false);
  }
}
function rowToObjectPlan(dat, po_id){
  const header = dat.header || [];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const keyPO = (idx['po_id']!=null ? 'po_id' : (idx['注番']!=null ? '注番' : header[0]));
  const row = (dat.rows||[]).find(r => String(r[idx[keyPO]])===String(po_id));
  if(!row) return null;
  const obj = {}; header.forEach((h,i)=> obj[String(h).trim()] = row[i]);
  obj.po_id = obj.po_id || obj['注番'] || po_id;
  return obj;
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
    let i=0, chunk=160;
    rafLoop(()=>{
      const end=Math.min(i+chunk, rows.length);
      const frag=document.createDocumentFragment();
      for(;i<end;i++){
        const r = rows[i];
        const po = String((r[idx['po_id']]??r[idx['注番']]??''));
        const tds = PLAN_VIEW.map(col=>{
          let v = pick(r, col.keys);
          if(v && /希望/.test(col.label)){ const d=(v instanceof Date)?v:new Date(v); if(!isNaN(d)) v = d.toLocaleDateString('ja-JP'); }
          return `<td>${v ?? ''}</td>`;
        }).join('');
        const tr=document.createElement('tr');
        tr.innerHTML = `${tds}<td class="center"><div class="row"><button class="btn ghost btn-edit-plan" data-po="${po}"><i class="fa-regular fa-pen-to-square"></i> 編集</button></div></td>`;
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i>=rows.length){
        $$(".btn-edit-plan", tb).forEach(b=> b.onclick = (e)=> editPlan(e.currentTarget.dataset.po, dat));
        return false;
      }
    });
  };
  if(search && !search._bind){ search._bind = true; search.oninput = debounce(render, 250); }
  render();
}
function editPlan(po_id, dat){
  const obj = rowToObjectPlan(dat, po_id);
  if(!obj) return alert('データが見つかりません');
  const initial = {
    po_id: obj.po_id || obj['注番'] || '',
    '得意先': obj['得意先'] || obj.customer || '',
    '図番': obj['図番'] || obj.drawing_no || '',
    '品名': obj['品名'] || obj.item_name || '',
    '品番': obj['品番'] || obj.part_no || '',
    '製造番号': obj['製造番号'] || obj['製番号'] || '',
    'qty': obj['数量'] || obj['qty'] || '',
    'due_date': obj['納期希望'] || obj['完了予定'] || obj['due_date'] || obj['due'] || '',
    'start_date': obj['開始希望'] || obj['開始日'] || obj['start_date'] || '',
    'note': obj['備考'] || obj['note'] || ''
  };
  openForm("生産計画 編集", PLAN_FIELDS, "savePlan", async ()=>{ await loadPlans(); await loadOrders(); }, initial);
}
$("#btnPlanCreate").onclick = ()=> openForm("生産計画 作成", PLAN_FIELDS, "savePlan", ()=> { loadPlans(); loadOrders(); });
$("#btnPlanExport").onclick = ()=> exportTableCSV("#tbPlan","plans.csv");
$("#btnPlanImport").onclick = ()=> importCSVtoSheet("bulkImportPlans", ()=> { loadPlans(); loadOrders(); });
$("#btnPlanPrint").onclick  = ()=> window.print();
$("#btnPlanTpl")?.addEventListener('click', ()=>{
  const headers = ['注番','得意先','品番','製造番号','品名','図番','数量','納期希望','開始希望','備考'];
  downloadCSV('production_plans_template.csv', headers.map(h=>`"${h}"`).join(',')+'\n');
});

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
  toggleSkeleton($("#shipSkeleton"), true);
  try{
    const dat = await cached("listShip", {}, 15000);
    renderShipSlim(dat);
  }finally{
    toggleSkeleton($("#shipSkeleton"), false);
  }
}
function renderShipSlim(dat){
  const th = $("#thShip"), tb = $("#tbShip"), search = $("#shipSearch");
  const header = dat.header || [];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const keySID = (idx['ship_id']!=null ? 'ship_id' : null);
  const keyPO = (idx['po_id']!=null ? 'po_id' : (idx['注番']!=null ? '注番' : header[0]));
  const pick = (row, keys)=>{ for(const k of keys){ const i=idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; } return ''; };
  const dstr = (v)=>{ const d=(v instanceof Date)?v:new Date(v); return isNaN(d)?'':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
  th.innerHTML = `<tr>${SHIP_VIEW.map(c=>`<th>${c.label}</th>`).join('')}<th>操作</th></tr>`;

  const render = ()=>{
    const q = (search?.value||'').toLowerCase();
    tb.innerHTML = '';
    const rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
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
      tr.innerHTML = `${tds}<td class="center"><div class="row"><button class="btn ghost btn-edit-ship" data-po="${po}" data-sid="${shipId}"><i class="fa-regular fa-pen-to-square"></i> 編集</button><button class="btn ghost btn-del-ship" data-po="${po}" data-sid="${shipId}"><i class="fa-regular fa-trash-can"></i> 削除</button></div></td>`;
      frag.appendChild(tr);
    });
    tb.appendChild(frag);
    $$(".btn-edit-ship", tb).forEach(b=> b.onclick = (e)=> editShip(e.currentTarget.dataset.po, e.currentTarget.dataset.sid, dat));
    $$(".btn-del-ship", tb).forEach(b=> b.onclick = (e)=> deleteShip(e.currentTarget.dataset.po, e.currentTarget.dataset.sid));
  };
  search.oninput = debounce(render, 250);
  render();
}
function editShip(po_id, ship_id, dat){
  const header = dat.header||[];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const keyPO = (idx['po_id']!=null) ? 'po_id' : (idx['注番']!=null ? '注番' : null);
  const row = (dat.rows||[]).find(r => (ship_id && idx['ship_id']!=null && String(r[idx['ship_id']]) === String(ship_id)) || (keyPO && String(r[idx[keyPO]]) === String(po_id)) );
  if(!row) return alert('データが見つかりません');
  const initial = {
    ship_id: row[idx['ship_id']]||'',
    po_id: row[idx['po_id']]||row[idx['注番']]||'',
    '得意先': row[idx['得意先']]||row[idx['customer']]||'',
    '図番': row[idx['図番']]||row[idx['drawing_no']]||'',
    '品名': row[idx['品名']]||row[idx['item_name']]||'',
    '品番': row[idx['品番']]||row[idx['part_no']]||'',
    '製造番号': row[idx['製造番号']]||row[idx['製番号']]||'',
    'qty': row[idx['qty']]||row[idx['数量']]||'',
    'destination': row[idx['destination']]||row[idx['送り先']]||'',
    'scheduled_date': row[idx['scheduled_date']]||row[idx['出荷日']]||'',
    'delivery_date': row[idx['delivery_date']]||row[idx['納入日']]||'',
    'carrier': row[idx['carrier']]||row[idx['運送会社']]||'',
    'note': row[idx['note']]||row[idx['備考']]||''
  };
  openForm("出荷予定 編集", SHIP_FIELDS, "saveShip", async ()=>{ await loadShips(); }, initial, { extraHidden: { ship_id: initial.ship_id } });
}
async function deleteShip(po_id, ship_id){
  if(!confirm(`出荷予定を削除しますか？\n注番:${po_id}${ship_id? ' / ID:'+ship_id:''}`)) return;
  try{ await jsonp('deleteShip', { po_id, ship_id }); await loadShips(); }
  catch(e){ alert('削除失敗: ' + (e?.message || e)); }
}
$("#btnShipCreate").onclick = ()=> openForm("出荷予定 作成", SHIP_FIELDS, "saveShip", ()=> { loadShips(); loadShipsMini(); });
$("#btnShipExport").onclick = ()=> exportTableCSV("#tbShip","shipments.csv");
$("#btnShipImport").onclick = ()=> importCSVtoSheet("bulkImportShip", ()=> { loadShips(); loadShipsMini(); });
$("#btnShipPrint").onclick  = ()=> window.print();
$("#btnShipTpl")?.addEventListener('click', ()=>{
  const headers = ['po_id','得意先','図番','品名','品番','製造番号','qty','destination','scheduled_date','delivery_date','carrier','note'];
  downloadCSV('shipments_template.csv', headers.map(h=>`"${h}"`).join(',')+'\n');
});

/* ミニ: 本日出荷 & 予定 */
async function loadShipsMini(){
  try{
    const dat = await cached("listShip", {}, 10000);
    const rows = dat.rows || []; const head = dat.header || [];
    const idx = Object.fromEntries(head.map((h,i)=>[h,i]));
    const today = new Date(); const ymd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = (s)=>{ const t = new Date(s); return t.getFullYear()===ymd.getFullYear() && t.getMonth()===ymd.getMonth() && t.getDate()===ymd.getDate(); };
    const statusCol = idx.status ?? idx['状態']; const dateCol = idx.scheduled_date ?? idx['出荷日'] ?? idx['納期']; const poCol = idx.po_id ?? idx['注番'];
    const todayList = [], futureList = [];
    rows.forEach(r=>{
      const st = String(r[statusCol]||''); const dt = r[dateCol];
      if(!dt || /出荷済/.test(st)) return;
      const entry = { po: r[poCol], date: dt, status: st, dest: r[idx.destination]||'' , qty: r[idx.qty]||'' };
      if(isToday(dt)) todayList.push(entry); else if(new Date(dt) > ymd) futureList.push(entry);
    });
    const renderSide = (arr, el)=>{ el.innerHTML = arr.slice(0,50).map(e=> `<div class="ship-item"><div><b>${e.po||''}</b> <span class="muted s">${e.dest||''}</span></div><div class="row-between s"><span>${new Date(e.date).toLocaleDateString('ja-JP')}</span><span>${e.qty||''}</span></div></div>`).join('') || `<div class="muted s">なし</div>`; };
    renderSide(todayList, $("#shipToday")); renderSide(futureList, $("#shipPlan"));
  }catch(_){}
}

/* ---------- 完成品一覧 ---------- */
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
  toggleSkeleton($("#finSkeleton"), true);
  try{
    const dat = await cached("listFinished", {}, 8000);
    const th = $("#thFin"), tb = $("#tbFin"), search = $("#finSearch");
    const head = dat.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
    const pick = (row, keys)=>{ for(const k of keys){ const i=idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; } return ''; };
    th.innerHTML = `<tr>${FIN_VIEW.map(c=>`<th>${c.label}</th>`).join('')}</tr>`;
    const render = ()=>{
      const q = (search?.value||'').toLowerCase();
      tb.innerHTML = '';
      const rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      let i=0, chunk=160;
      rafLoop(()=>{
        const end=Math.min(i+chunk, rows.length);
        const frag=document.createDocumentFragment();
        for(;i<end;i++){
          const r = rows[i];
          const tds = FIN_VIEW.map(col=>{
            let v = pick(r, col.keys);
            if(col.label==='完了日' && v){ const d=(v instanceof Date)?v:new Date(v); if(!isNaN(d)) v = d.toLocaleString('ja-JP'); }
            return `<td>${v??''}</td>`;
          }).join('');
          const tr=document.createElement('tr'); tr.innerHTML = tds; frag.appendChild(tr);
        }
        tb.appendChild(frag);
        if(i>=rows.length) return false;
      });
    };
    search.oninput = debounce(render, 250);
    render();
  }finally{
    toggleSkeleton($("#finSkeleton"), false);
  }
}
$("#btnFinExport")?.addEventListener('click', ()=> exportTableCSV("#tbFin","finished_goods.csv"));
$("#btnFinPrint")?.addEventListener('click', ()=> window.print());

/* ---------- 在庫 ---------- */
const INV_UI = { cust:'', item:'' };
async function loadInventory(){
  toggleSkeleton($("#invSkeleton"), true);
  try{
    const dat = await cached("listInventory", {}, 5000).catch(()=>({header:['得意先','図番','機種','品名','在庫数','最終更新'], rows:[]}));
    ensureInvControls(dat); renderInventory(dat);
  }finally{
    toggleSkeleton($("#invSkeleton"), false);
  }
}
function ensureInvControls(dat){
  if($("#invCtrlBar")) return;
  const wrap = $("#pageInv");
  const bar = document.createElement("div");
  bar.id = "invCtrlBar"; bar.className = "row wrap gap"; bar.style.margin = "8px 0 12px";
  const h = dat.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[x,i]));
  const colCust = idx['得意先']; const colModel= (idx['機種']!=null ? idx['機種'] : idx['品名']);
  const setOpts = (values)=> [...new Set(values.filter(Boolean))].sort();
  const selCust = document.createElement("select");
  selCust.className="btn"; selCust.innerHTML = `<option value="">(すべての得意先)</option>` + setOpts(dat.rows.map(r=> r[colCust]||'')).map(v=>`<option value="${v}">${v}</option>`).join('');
  const selItem = document.createElement("select");
  selItem.className="btn"; selItem.innerHTML = `<option value="">(すべての機種/品名)</option>` + setOpts(dat.rows.map(r=> r[colModel]||r[idx['品名']]||'')).map(v=>`<option value="${v}">${v}</option>`).join('');
  const mk = (txt, el)=>{ const w=document.createElement("div"); w.className="row gap s"; w.innerHTML=`<div class="muted s" style="min-width:72px">${txt}</div>`; w.append(el); return w; };
  bar.append(mk("得意先", selCust), mk("機種/品名", selItem));
  wrap.insertBefore(bar, wrap.querySelector(".card"));
  selCust.onchange = ()=>{ INV_UI.cust = selCust.value; renderInventory(dat); };
  selItem.onchange = ()=>{ INV_UI.item = selItem.value; renderInventory(dat); };
}
function renderInventory(dat){
  const th = $("#thInv"), tb = $("#tbInv"), search = $("#invSearch");
  th.innerHTML = `<tr>${(dat.header||[]).map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const h = dat.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[x,i]));
  const colCust = idx['得意先']; const colModel= (idx['機種']!=null ? idx['機種'] : idx['品名']);
  const render = ()=>{
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
    let i=0, chunk=150;
    rafLoop(()=>{
      const end=Math.min(i+chunk, rows.length);
      const frag=document.createDocumentFragment();
      for(;i<end;i++){
        const tr=document.createElement('tr');
        tr.innerHTML = rows[i].map(c=>`<td>${c??''}</td>`).join('');
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i>=rows.length) return false;
    });
  };
  if(search && !search._invBind){ search._invBind=true; search.oninput = debounce(render, 250); }
  render();
}
$("#btnInvExport")?.addEventListener('click', ()=> exportTableCSV("#tbInv","inventory.csv"));
$("#btnInvPrint")?.addEventListener('click', ()=> window.print());

/* ---------- Form dialog generator ---------- */
let CURRENT_API = null;
function openForm(title, fields, api, after, initial={}, opts={}){
  CURRENT_API = api;
  $("#dlgTitle").textContent = title;
  const f = $("#formBody");
  f.innerHTML = "";
  const extras = opts?.extraHidden || {};
  Object.entries(extras).forEach(([k,v])=>{
    const hid = document.createElement("input");
    hid.type="hidden"; hid.name=k; hid.value=v??''; f.appendChild(hid);
  });
  fields.forEach(x=>{
    const wrap = document.createElement("div"); wrap.className = "form-item";
    const label = `<div class="muted s">${x.label}${x.req? ' <span style="color:#c00">*</span>':''}</div>`;
    let input = ''; let opts = (typeof x.options === 'function') ? x.options() : (x.options||[]);
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
    wrap.innerHTML = label + input; f.appendChild(wrap);
  });
  $("#dlgForm").showModal();
  $("#btnDlgSave").onclick = async ()=>{
    const data = {};
    [...f.querySelectorAll("[name]")].forEach(inp=>{
      let v = inp.value; if(inp.type==='date' && v) v = new Date(v).toISOString().slice(0,10);
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

/* ---------- CSV Export / Import ---------- */
function downloadCSV(filename, data){ const blob = new Blob([data], {type:'text/csv;charset=utf-8;'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); }
function exportTableCSV(tbodySel, filename){
  const rows = $$(tbodySel+" tr").map(tr=> [...tr.children].map(td=> td.textContent));
  const csv = rows.map(r => r.map(v=>{ const s = (v??'').toString().replace(/"/g,'""'); return `"${s}"`; }).join(',')).join('\n');
  downloadCSV(filename, csv);
}
function importCSVtoSheet(api, after){
  const input = document.createElement('input'); input.type='file'; input.accept='.csv,.xlsx';
  input.onchange = async ()=>{
    const file = input.files[0]; if(!file) return;
    const buf = await file.arrayBuffer(); const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]]; const arr = XLSX.utils.sheet_to_json(ws, {header:1, blankrows:false, defval:''});
    const looksHeader = arr.length && arr[0].some(c=> typeof c==='string' && /[A-Za-zぁ-んァ-ヴ一-龯]/.test(c));
    const rows = looksHeader ? arr.slice(1) : arr;
    await jsonp(api, { rows: JSON.stringify(rows) });
    if(after) after();
  };
  input.click();
}

/* =================================================
   QR 工程 (Station, universal)
   ================================================= */
const STATION_PROCESSES = [ "レザー加工","曲げ加工","外注加工/組立","組立","検査工程","検査中","検査済","出荷準備","出荷（組立済）","出荷済" ];
const QR_ACCEPT_PATTERNS = [
  /^STN\|(.+)$/i, /^PROC[:|](.+)$/i, /^工程[:|](.+)$/
];
function qrUrl(payload, size=512){ return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`; }
function openStationQrSheet(){
  const tiles = STATION_PROCESSES.map(p=>{
    const payload = `STN|${p}`;
    return `<div class="tile"><img src="${qrUrl(payload)}" alt="QR ${p}" loading="eager"><div class="lbl"><b>${p}</b></div><div class="s muted">${payload}</div></div>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>工程QR</title>
  <style>
  :root{--gap:16px; --tile:236px; --border:#e5e7eb;}
  *{box-sizing:border-box} body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;margin:16px;background:#fafafa;color:#111827}
  .toolbar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px;z-index:2}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--tile),1fr));gap:var(--gap)}
  .tile{border:1px solid var(--border);border-radius:14px;padding:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  .tile img{width:100%;height:auto;display:block;border-radius:8px}
  .lbl{margin-top:8px} .muted{color:#6b7280} .s{font-size:12px}
  @media print{body{margin:0}.toolbar{display:none}.grid{gap:10px}.tile{page-break-inside:avoid}}
  </style></head><body><div class="toolbar"><h1>工程QR（Station, universal）</h1><button onclick="window.print()">印刷</button></div><div class="grid">${tiles}</div></body></html>`;
  const w = window.open('about:blank'); w.document.write(html); w.document.close();
}
$("#btnStationQR")?.addEventListener("click", openStationQrSheet);

/* ---------- QR Scan ---------- */
let scanStream=null, scanRAF=null;
function parseProcessFromStationQR(text){
  for(const rx of QR_ACCEPT_PATTERNS){ const m = text.match(rx); if(m) return normalizeProc(m[1]); }
  return null;
}
function openScanDialog(po){
  $("#scanResult").textContent = `PO: ${po}`;
  $("#dlgScan").showModal();
  $("#btnScanStart").onclick = async ()=>{
    const video = $("#scanVideo"), canvas=$("#scanCanvas");
    try{
      scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      video.srcObject = scanStream; await video.play();
      const ctx = canvas.getContext("2d");
      const tick = async ()=>{
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0,0, canvas.width, canvas.height);
        const img = ctx.getImageData(0,0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if(code){
          if(scanRAF) cancelAnimationFrame(scanRAF);
          if(scanStream) scanStream.getTracks().forEach(t=> t.stop());
          const raw = String(code.data||'').trim();
          const stProc = parseProcessFromStationQR(raw);
          if(stProc){ $("#scanResult").textContent = `工程QR: ${stProc}`; quickQuantityPrompt(po, stProc); return; }
          const parts = raw.split('|');
          if(parts.length>=2){
            const cPO = (parts[0]||'').trim(); const proc = normalizeProc(parts[1]||'');
            const okv = Number(parts[2]||''); const ngv = Number(parts[3]||''); const note = parts[4]||''; const po_id = cPO || po;
            if(Number.isFinite(okv) || Number.isFinite(ngv)){
              try{
                await jsonp("saveOp", { data: JSON.stringify({ po_id, process: proc, ok_count: (Number.isFinite(okv)?okv:0), ng_count: (Number.isFinite(ngv)?ngv:0), note }), user: JSON.stringify(CURRENT_USER||{}) });
                $("#scanResult").textContent = `保存: ${po_id} / ${proc} / OK=${okv||0} / NG=${ngv||0}`;
                setTimeout(()=>{ $("#dlgScan").close(); refreshAll(); }, 700);
              }catch(e){ alert("保存失敗: " + e.message); }
              return;
            }
            quickQuantityPrompt(po_id, proc, note); return;
          }
          alert("未対応のQR形式です。'STN|工程' または 'PO|工程|OK|NG|備考' を使用してください。"); return;
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
function quickQuantityPrompt(po, process, note=''){
  const wrap = document.createElement("div");
  wrap.innerHTML = `<dialog id="dlgQuick" class="dlg card">
    <h3>${po} / ${process}</h3>
    <div class="row gap"><label>OK <input id="qOK" type="number" min="0" value="0" style="width:120px"></label>
    <label>NG <input id="qNG" type="number" min="0" value="0" style="width:120px"></label></div>
    <div class="row gap" style="margin-top:8px"><button class="btn primary" id="qSave">保存</button><button class="btn" id="qCancel">キャンセル</button></div>
  </dialog>`;
  document.body.appendChild(wrap);
  const dlg = wrap.querySelector("#dlgQuick"); dlg.showModal();
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

/* ---------- Weather ---------- */
async function ensureWeather(){
  try{
    const cacheKey = 'wx_cache_v1';
    const cachedWX = JSON.parse(localStorage.getItem(cacheKey)||'null'); const now = Date.now();
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
  }catch(_){}
}
function renderWeather(v){
  if(!v?.current) return;
  $("#wxTemp").textContent  = Math.round(v.current.temperature_2m) + "°C";
  $("#wxWind").textContent  = Math.round(v.current.wind_speed_10m) + " m/s";
  $("#wxPlace").textContent = v.timezone_abbreviation || "";
}

/* ---------- 分析チャート ---------- */
let CHARTS = { daily:null, monthly:null, custTop:null, custMonthly:null };

function destroyChart(name){
  try{ CHARTS[name]?.destroy(); }catch(_){} CHARTS[name]=null;
}
function upsert(name, ctx, cfg){
  destroyChart(name); CHARTS[name] = new Chart(ctx, cfg);
}
async function loadCharts(){
  // sumber: listShip (lebih stabil & dekat kebutuhan)
  let dat;
  try{ dat = await cached("listShip", {}, 10000); }catch(e){ console.warn(e); return; }
  const rows = dat.rows||[]; const head = dat.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
  const colDate = idx['scheduled_date'] ?? idx['出荷日']; const colCust = idx['得意先'] ?? idx['customer']; const colQty = idx['qty'] ?? idx['数量'] ?? null;

  const S = s => String(s==null?'':s).trim();
  const toDate = v => { const d=new Date(v); return isNaN(d)?null:d; };
  const keyDay  = d => d.toISOString().slice(0,10);
  const keyMon  = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,'0');

  const mapDay = {}, mapMon = {}, mapCust = {}, mapCustMon = {};
  rows.forEach(r=>{
    const d = toDate(r[colDate]); if(!d) return;
    const qty = colQty!=null ? (+r[colQty]||0) : 1;
    const cust = S(r[colCust]) || '—';
    const kd = keyDay(d), km = keyMon(d);
    mapDay[kd]=(mapDay[kd]||0)+qty;
    mapMon[km]=(mapMon[km]||0)+qty;
    mapCust[cust]=(mapCust[cust]||0)+qty;
    (mapCustMon[km]||(mapCustMon[km]={}))[cust]=(mapCustMon[km][cust]||0)+qty;
  });

  // Daily
  const dLabels = Object.keys(mapDay).sort();
  const dValues = dLabels.map(k=>mapDay[k]);
  upsert("daily", $("#cDaily"), {
    type:"line",
    data:{ labels:dLabels, datasets:[{ label:"数量", data:dValues, tension:.25, pointRadius:2, fill:false }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, datalabels:{display:false} } }
  });

  // Monthly YTD (12 slot)
  const now = new Date(); const y = now.getFullYear();
  const mLabels = Array.from({length:12}, (_,i)=> (i+1)+"月");
  const mValues = mLabels.map((_,i)=> mapMon[`${y}-${String(i+1).padStart(2,'0')}`]||0);
  upsert("monthly", $("#cMonthly"), {
    type:"bar",
    data:{ labels:mLabels, datasets:[{ label:"数量", data:mValues }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, datalabels:{display:false} } }
  });

  // Customer Top
  const custTop = Object.entries(mapCust).sort((a,b)=>b[1]-a[1]).slice(0,10);
  upsert("custTop", $("#cCustTop"), {
    type:"bar",
    data:{ labels:custTop.map(x=>x[0]), datasets:[{ label:"数量", data:custTop.map(x=>x[1]) }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, datalabels:{display:false} } }
  });

  // Customer Monthly stacked (Top6)
  const top6 = Object.entries(mapCust).sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);
  const mons = Array.from(new Set(Object.keys(mapCustMon))).sort();
  const ds = top6.map(c=>{
    return { label:c, data: mons.map(m=> (mapCustMon[m]?.[c])||0), stack:'s' };
  });
  upsert("custMonthly", $("#cCustMonthly"), {
    type:"bar",
    data:{ labels:mons, datasets:ds },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ x:{stacked:true}, y:{stacked:true} },
      plugins:{ legend:{position:'bottom'}, datalabels:{display:false} } }
  });
}

/* ---------- 請求書 (placeholder minimal) ---------- */
async function loadInvoices(){
  const tb = $("#tbInvoice"); tb.innerHTML = "";
  try{
    const dat = await cached("listInvoice", {}, 8000).catch(()=>({rows:[]}));
    (dat.rows||[]).forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.no||''}</td><td>${r.customer||''}</td><td>${r.issued||''}</td><td class="center">${r.total||0}</td><td>${r.file||''}</td><td>${r.user||''}</td>`;
      tb.appendChild(tr);
    });
  }catch(_){}
}

/* ---------- Utils ---------- */
function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", ()=> setUser(null));
