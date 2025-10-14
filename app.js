/* =================================================
  東京精密発條株式会社システム  — app.js
  - ダッシュボード / 受注 / 生産計画 / 出荷予定 / 在庫 / 完成品
  - 請求書 作成・一覧
  - 分析チャート (Chart.js)
================================================= */

/* ---------------- API BASE ---------------- */
const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

/* ---------------- DOM helpers ---------------- */
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => [...el.querySelectorAll(q)];
const qs = (o) => Object.entries(o).map(([k,v]) =>
  `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const fmt = (d) => d ? new Date(d).toLocaleString("ja-JP") : "";
const normalizeProc = (s)=> String(s||"").trim()
  .replace("レーサ加工","レザー加工")
  .replace("外作加工","外注加工/組立") || "未設定";

/* ---------------- Tiny styles (helpers) ---------------- */
(function injectStyles(){
  if($('#__injected_dash_styles')) return;
  const css = `
  .center{text-align:center}
  .row{display:flex;gap:.5rem;align-items:center}
  .row-between{display:flex;justify-content:space-between;align-items:center;gap:.5rem}
  .row-end{display:flex;justify-content:flex-end;gap:.5rem}
  .wrap{flex-wrap:wrap}
  .actions{display:flex;justify-content:center;gap:.5rem;flex-wrap:wrap}
  .btn.icon{display:inline-flex;align-items:center;gap:.35rem}
  .chip{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .55rem;border-radius:999px;background:#eef2ff;font-size:.85em;white-space:nowrap}
  .badge{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .55rem;border-radius:8px;background:#f1f5f9;font-size:.85em;white-space:nowrap}
  .p-laser{background:#fef3c7}.p-bend{background:#e0f2fe}.p-press{background:#e2e8f0}
  .p-assembly{background:#e9d5ff}.p-inspection{background:#dcfce7}.p-other{background:#f1f5f9}
  .cell-stack{display:flex;flex-direction:column;align-items:center;gap:.25rem}
  .counts{display:flex;gap:.4rem}.counts .count{font-size:.78em;padding:.15rem .45rem;border-radius:999px;background:#f8fafc}
  .counts .ok{background:#e2fbe2}.counts .ng{background:#ffe4e6}
  .ship-item{padding:.35rem .5rem;border-bottom:1px dashed #eee}
  .hidden{display:none !important}
  .kpi{border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  `;
  const el = document.createElement("style");
  el.id='__injected_dash_styles';
  el.textContent = css;
  document.head.appendChild(el);
})();

/* ---------------- JSONP helper + cache ---------------- */
function jsonp(action, params={}){
  return new Promise((resolve,reject)=>{
    const cb = "cb_" + Math.random().toString(36).slice(2);
    params = {...params, action, callback: cb};
    const s = document.createElement("script");
    s.src = `${API_BASE}?${qs(params)}`;

    // ↓ 9 detik saja biar nggak nahan UI lama
    let timeout = setTimeout(()=>{
      cleanup(); reject(new Error("API timeout"));
    }, 9000);

    function cleanup(){
      try{ delete window[cb]; s.remove(); }catch(_){}
      clearTimeout(timeout);
    }
    window[cb] = (resp)=>{
      cleanup();
      if(resp && resp.ok) resolve(resp.data);
      else reject(new Error((resp && resp.error) || "API error"));
    };
    s.onerror = ()=>{ cleanup(); reject(new Error("JSONP load error")); };
    document.body.appendChild(s);
  });
}

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

/* ---------------- Badges ---------------- */
const procToChip = (p)=>{
  p = normalizeProc(p);
  if(/レザー加工|レーザー/.test(p))   return `<span class="chip p-laser"><i class="fa-solid fa-bolt"></i>${p}</span>`;
  if(/曲げ/.test(p))                  return `<span class="chip p-bend"><i class="fa-solid fa-wave-square"></i>${p}</span>`;
  if(/外注加工|加工/.test(p))         return `<span class="chip p-press"><i class="fa-solid fa-compass-drafting"></i>${p}</span>`;
  if(/組立/.test(p))                  return `<span class="chip p-assembly"><i class="fa-solid fa-screwdriver-wrench"></i>${p}</span>`;
  if(/検査/.test(p))                  return `<span class="chip p-inspection"><i class="fa-regular fa-square-check"></i>${p}</span>`;
  return `<span class="chip p-other"><i class="fa-regular fa-square"></i>${p||'—'}</span>`;
};
const statusToBadge = (s)=>{
  s = String(s||"");
  if(/組立中/.test(s))   return `<span class="badge"><i class="fa-solid fa-screwdriver-wrench"></i>${s}</span>`;
  if(/組立済/.test(s))   return `<span class="badge"><i class="fa-regular fa-circle-check"></i>${s}</span>`;
  if(/検査中/.test(s))   return `<span class="badge"><i class="fa-regular fa-clipboard"></i>${s}</span>`;
  if(/検査済/.test(s))   return `<span class="badge"><i class="fa-regular fa-circle-check"></i>${s}</span>`;
  if(/出荷準備/.test(s)) return `<span class="badge"><i class="fa-solid fa-box-open"></i>${s}</span>`;
  if(/出荷済/.test(s))   return `<span class="badge"><i class="fa-solid fa-truck"></i>${s}</span>`;
  return `<span class="badge"><i class="fa-regular fa-clock"></i>${s||"—"}</span>`;
};

/* ---------------- Auth & Role ---------------- */
let CURRENT_USER = null;
const ROLE_MAP = {
  'admin': { pages:['pageDash','pageSales','pagePlan','pageShip','pageFinished','pageInv','pageInvoice','pageCharts'], nav:true },
  '営業': { pages:['pageSales','pageDash','pageFinished','pageInv','pageInvoice','pageCharts'], nav:true },
  '生産管理': { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv','pageInvoice','pageCharts'], nav:true },
  '生産管理部': { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv','pageInvoice','pageCharts'], nav:true },
  '製造': { pages:['pageDash','pageFinished','pageInv'], nav:true },
  '検査': { pages:['pageDash','pageFinished','pageInv'], nav:true }
};

function setUser(u){
  CURRENT_USER = u || null;
  $("#userInfo").textContent = u ? `${u.role} / ${u.department}` : "";

  // hide all pages & nav first
  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice","pageCharts"];
  pages.forEach(p => $("#"+p)?.classList.add("hidden"));
  ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToFinPage','btnToInvPage','btnToInvoice','btnToCharts','ddSetting','weatherWrap']
    .forEach(id=> $("#"+id)?.classList.add("hidden"));

  if(!u){
    $("#authView")?.classList.remove("hidden");
    return;
  }
  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP['admin'];
  if(allow?.nav){
    if(allow.pages.includes('pageDash'))     $("#btnToDash").classList.remove("hidden");
    if(allow.pages.includes('pageSales'))    $("#btnToSales").classList.remove("hidden");
    if(allow.pages.includes('pagePlan'))     $("#btnToPlan").classList.remove("hidden");
    if(allow.pages.includes('pageShip'))     $("#btnToShip").classList.remove("hidden");
    if(allow.pages.includes('pageFinished')) $("#btnToFinPage").classList.remove("hidden");
    if(allow.pages.includes('pageInv'))      $("#btnToInvPage").classList.remove("hidden");
    if(allow.pages.includes('pageInvoice'))  $("#btnToInvoice").classList.remove("hidden");
    if(allow.pages.includes('pageCharts'))   $("#btnToCharts").classList.remove("hidden");
    $("#ddSetting").classList.remove("hidden");
    $("#weatherWrap").classList.remove("hidden");
    ensureWeather();
    loadMasters();
  }
  show("pageDash");
  refreshAll();
}

/* ---------------- Nav ---------------- */
function show(id){
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice","pageCharts"]
    .forEach(p=> $("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}
$("#btnToDash").onclick    = ()=>{ show("pageDash");   refreshAll(); };
$("#btnToSales").onclick   = ()=>{ show("pageSales");  loadSales(); };
$("#btnToPlan").onclick    = ()=>{ show("pagePlan");   loadPlans(); };
$("#btnToShip").onclick    = ()=>{ show("pageShip");   loadShips(); };
$("#btnToFinPage").onclick = ()=>{ show("pageFinished");loadFinished(); };
$("#btnToInvPage").onclick = ()=>{ show("pageInv");    loadInventory(); };
$("#btnToInvoice").onclick = ()=>{ show("pageInvoice");initInvoiceUI(); };
$("#btnToCharts").onclick  = ()=>{ show("pageCharts"); initChartsUI(); };
$("#btnLogout").onclick    = ()=> setUser(null);

/* ---------------- Login ---------------- */
$("#btnLogin").onclick = loginSubmit;
$("#inUser").addEventListener("keydown", e=>{ if(e.key==='Enter') loginSubmit(); });
$("#inPass").addEventListener("keydown", e=>{ if(e.key==='Enter') loginSubmit(); });
async function loginSubmit(){
  const u = $("#inUser").value.trim();
  const p = $("#inPass").value.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");
  try{
    // await jsonp('ping'); ← HAPUS baris ini
    const me = await jsonp("login", { username:u, password:p });
    setUser(me);
  }catch(e){
    alert("ログイン失敗: " + (e?.message || e));
  }
}


/* ---------------- Dashboard: Orders ---------------- */
let ORDERS = [];
async function loadOrders(){
  ORDERS = await cached("listOrders");
  renderOrders();
  loadShipsMini();
}
function renderOrders(){
  const q = ($("#searchQ").value||"").trim().toLowerCase();
  const rows = ORDERS.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  const tb = $("#tbOrders");
  tb.innerHTML = "";
  const chunk = 120; let i = 0;

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
        <td class="center"><div class="cell-stack">${statusToBadge(r.status)}</div></td>
        <td class="center">
          <div class="cell-stack">
            ${procToChip(r.current_process)}
            <div class="counts">
              <span class="count ok">OK:${ok}</span>
              <span class="count ng">NG:${ng}</span>
            </div>
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
    if(i < rows.length && 'requestIdleCallback' in window) requestIdleCallback(paint);

    if(i >= rows.length){
      $$(".btn-stqr",tb).forEach(b=> b.onclick = openStationQrSheet);
      $$(".btn-scan",tb).forEach(b=> b.onclick=(e)=> openScanDialog(e.currentTarget.dataset.po));
      $$(".btn-op",tb).forEach(b=> b.onclick=(e)=> openOpDialog(e.currentTarget.dataset.po));
    }
  })();
}
const debouncedRender = debounce(renderOrders, 250);
$("#searchQ").addEventListener("input", debouncedRender);
async function refreshAll(){ await loadOrders(); }
$("#btnExportOrders").onclick = ()=> exportTableCSV("#tbOrders","orders.csv");

/* ---------------- 操作: 手入力 ---------------- */
const PROCESS_OPTIONS = [
  "準備","レザー加工","曲げ加工","外注加工/組立","組立",
  "検査工程","検査中","検査済","出荷（組立済）","出荷準備","出荷済"
];
function openOpDialog(po, defaults = {}){
  $("#opPO").textContent = po;
  const sel = $("#opProcess");
  sel.innerHTML = PROCESS_OPTIONS.map(o=>`<option value="${o}">${o}</option>`).join('');
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

/* ---------------- Masters ---------------- */
let MASTERS = { customers:[], drawings:[], item_names:[], part_nos:[], destinations:[], carriers:[], po_ids:[] };
async function loadMasters(){
  try{ MASTERS = await cached("listMasters", {}, 60000); }catch(_){}
}

/* ---------------- 受注 ---------------- */
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
async function loadSales(){ const dat = await cached("listSales"); renderSalesSlim(dat); }
function renderSalesSlim(dat){
  const th = $("#thSales"), tb = $("#tbSales"), search = $("#salesSearch");
  const header = dat.header || [];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const keyPO = (idx['po_id']!=null ? 'po_id' : (idx['注番']!=null ? '注番' : header[0]));
  const pick = (row, keys)=> {
    for(const k of keys){ const i = idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; }
    return '';
  };
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
        $$(".btn-del", tb).forEach(b=> b.onclick = (e)=> deleteSales(e.currentTarget.dataset.po));
      }
    })();
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
  const obj = {};
  header.forEach((h,i)=> obj[String(h).trim()] = row[i]);
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
$("#btnSalesImport").onclick = ()=> importCSVtoSheet("bulkImportSales");
$("#btnSalesPrint").onclick  = ()=> window.print();
$("#btnSalesTpl")?.addEventListener('click', ()=>{
  const headers = ['po_id','得意先','図番','品名','品番','受注日','製造番号','qty','納期','備考'];
  const csv = headers.map(h=>`${h}`).join(',') + '\n';
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sales_template.csv'; a.click();
});

/* ---------------- 生産計画 ---------------- */
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
        tr.innerHTML = `${tds}
          <td class="center"><div class="row">
            <button class="btn ghost btn-edit-plan" data-po="${po}"><i class="fa-regular fa-pen-to-square"></i> 編集</button>
          </div></td>`;
        frag.appendChild(tr);
      }
      tb.appendChild(frag);
      if(i<rows.length && 'requestIdleCallback' in window) requestIdleCallback(paint);
      if(i>=rows.length){
        $$(".btn-edit-plan", tb).forEach(b=> b.onclick = (e)=> editPlan(e.currentTarget.dataset.po, dat));
      }
    })();
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
async function loadPlans(){ const dat = await cached("listPlans"); renderPlansSlim(dat); }
$("#btnPlanCreate").onclick = ()=> openForm("生産計画 作成", PLAN_FIELDS, "savePlan", ()=> { loadPlans(); loadOrders(); });
$("#btnPlanExport").onclick = ()=> exportTableCSV("#tbPlan","plans.csv");
$("#btnPlanImport").onclick = ()=> importCSVtoSheet("bulkImportPlans", ()=> { loadPlans(); loadOrders(); });
$("#btnPlanPrint").onclick  = ()=> window.print();
$("#btnPlanTpl")?.addEventListener('click', ()=>{
  const headers = ['注番','得意先','品番','製造番号','品名','図番','数量','納期希望','開始希望','備考'];
  const csv = headers.map(h=>`${h}`).join(',') + '\n';
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'production_plans_template.csv'; a.click();
});

/* ---------------- 出荷予定 ---------------- */
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
const SHIP_UI = { selectedCustomer:'', selectedDate:'', groupByDate:true };
async function loadShips(){ const dat = await cached("listShip"); ensureShipControls(dat); renderShipSlim(dat); }
function ensureShipControls(dat){
  if($("#shipCtrlBar")) return;
  const tableWrap = $("#thShip")?.closest("div") || $("#pageShip");
  const bar = document.createElement("div");
  bar.id = "shipCtrlBar"; bar.className = "row wrap gap"; bar.style.margin = "8px 0 12px";
  const selCust = document.createElement("select");
  selCust.id = "shipCustSel";
  selCust.innerHTML = `<option value="">(すべての得意先)</option>` + MASTERS.customers.map(c=>`<option value="${c}">${c}</option>`).join('');
  const inDate = document.createElement("input"); inDate.type = "date"; inDate.id = "shipDateSel";
  const ckWrap = document.createElement("label"); ckWrap.style.display="inline-flex"; ckWrap.style.alignItems="center"; ckWrap.style.gap="6px"; ckWrap.innerHTML = `<input id="shipGroupChk" type="checkbox" checked> 日付でグループ化`;
  const btnPrintCust = document.createElement("button"); btnPrintCust.className = "btn ghost"; btnPrintCust.textContent = "得意先で印刷";
  const btnPrintCustDate = document.createElement("button"); btnPrintCustDate.className = "btn ghost"; btnPrintCustDate.textContent = "得意先＋日付で印刷";
  function makeLabel(txt, el){ const w=document.createElement("div"); w.className="row gap s"; w.innerHTML=`<div class="muted s" style="min-width:60px">${txt}</div>`; w.append(el); return w; }
  bar.append(makeLabel("得意先", selCust), makeLabel("日付", inDate), ckWrap, btnPrintCust, btnPrintCustDate);
  tableWrap.parentNode.insertBefore(bar, tableWrap);
  selCust.onchange = ()=>{ SHIP_UI.selectedCustomer = selCust.value; renderShipSlim(dat); };
  inDate.onchange   = ()=>{ SHIP_UI.selectedDate = inDate.value; renderShipSlim(dat); };
  $("#shipGroupChk").onchange = (e)=>{ SHIP_UI.groupByDate = e.target.checked; renderShipSlim(dat); };
  btnPrintCust.onclick = async ()=>{ if(!SHIP_UI.selectedCustomer) return alert("得意先を選択してください"); await printShipByCustomer(SHIP_UI.selectedCustomer); };
  btnPrintCustDate.onclick = async ()=>{ if(!SHIP_UI.selectedCustomer || !SHIP_UI.selectedDate) return alert("得意先と日付を選択してください"); await printShipByCustomer(SHIP_UI.selectedCustomer, SHIP_UI.selectedDate); };
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
  if(SHIP_UI.selectedCustomer){ rows = rows.filter(r => String(r[idx['得意先']]||r[idx['customer']]||'') === SHIP_UI.selectedCustomer); }
  if(SHIP_UI.selectedDate){
    rows = rows.filter(r => { const d = r[idx['scheduled_date']] ?? r[idx['出荷日']]; return d && dstr(d) === SHIP_UI.selectedDate; });
  }
  tb.innerHTML = '';
  if(SHIP_UI.groupByDate){
    const groups = {};
    rows.forEach(r=>{
      const key = dstr(r[idx['scheduled_date']] ?? r[idx['出荷日']] ?? '');
      (groups[key||'(日付未設定)'] ??= []).push(r);
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
          if(v && /出荷日|納入日/.test(col.label)){
            const d=(v instanceof Date)?v:new Date(v);
            if(!isNaN(d)) v = d.toLocaleDateString('ja-JP');
          }
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
        if(v && /出荷日|納入日/.test(col.label)){
          const d=(v instanceof Date)?v:new Date(v);
          if(!isNaN(d)) v = d.toLocaleDateString('ja-JP');
        }
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
  $$(".btn-del-ship", tb).forEach(b=> b.onclick = (e)=> deleteShip(e.currentTarget.dataset.po, e.currentTarget.dataset.sid));
  if(search) search.oninput = debounce(()=> renderShipSlim(dat), 250);
}
function editShip(po_id, ship_id, dat){
  const header = dat.header||[];
  const idx = Object.fromEntries(header.map((h,i)=>[String(h).trim(), i]));
  const keyPO = (idx['po_id']!=null) ? 'po_id' : (idx['注番']!=null ? '注番' : null);
  const row = (dat.rows||[]).find(r =>
    (ship_id && idx['ship_id']!=null && String(r[idx['ship_id']]) === String(ship_id))
    || (keyPO && String(r[idx[keyPO]]) === String(po_id))
  );
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
  const csv = headers.map(h=>`${h}`).join(',') + '\n';
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'shipments_template.csv'; a.click();
});
/* ミニ: 本日出荷 & 出荷予定 */
async function loadShipsMini(){
  const dat = await cached("listShip", {}, 10000);
  const rows = dat.rows || [];
  const head = dat.header || [];
  const idx = Object.fromEntries(head.map((h,i)=>[h,i]));
  const today = new Date();
  const ymd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isToday = (s)=>{ const t = new Date(s);
    return t.getFullYear()===ymd.getFullYear() && t.getMonth()===ymd.getMonth() && t.getDate()===ymd.getDate(); };
  const statusCol = idx.status ?? idx['状態']; const dateCol = idx.scheduled_date ?? idx['出荷日'] ?? idx['納期']; const poCol = idx.po_id ?? idx['注番'];
  const todayList = [], futureList = [];
  rows.forEach(r=>{
    const st = String(r[statusCol]||''); const dt = r[dateCol];
    if(!dt || /出荷済/.test(st)) return;
    const entry = { po: r[poCol], date: dt, status: st, dest: r[idx.destination]||'' , qty: r[idx.qty]||'' };
    if(isToday(dt)) todayList.push(entry); else if(new Date(dt) > ymd) futureList.push(entry);
  });
  const renderSide = (arr, el)=>{ el.innerHTML = arr.slice(0,50).map(e=>`
    <div class="ship-item"><div><b>${e.po||''}</b> <span class="muted s">${e.dest||''}</span></div>
    <div class="row-between s"><span>${new Date(e.date).toLocaleDateString('ja-JP')}</span><span>${e.qty||''}</span></div></div>`).join('') || `<div class="muted s">なし</div>`; };
  const tEl = $("#shipToday"), pEl = $("#shipPlan"); if(tEl && pEl){ renderSide(todayList, tEl); renderSide(futureList, pEl); }
}

/* ---------------- 完成品一覧 ---------------- */
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
  const head = dat.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
  const pick = (row, keys)=>{ for(const k of keys){ const i=idx[k]; if(i!=null && row[i]!=null && row[i]!=='') return row[i]; } return ''; };
  th.innerHTML = `<tr>${FIN_VIEW.map(c=>`<th>${c.label}</th>`).join('')}</tr>`;
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
      if(i<rows.length && 'requestIdleCallback' in window) requestIdleCallback(paint);
    })();
  };
  if(search) search.oninput = debounce(render, 250);
  render();
}
$("#btnFinExport")?.addEventListener('click', ()=> exportTableCSV("#tbFin","finished_goods.csv"));
$("#btnFinPrint")?.addEventListener('click', ()=> window.print());

/* ---------------- 在庫 ---------------- */
const INV_UI = { cust:'', item:'' };
async function loadInventory(){
  const dat = await cached("listInventory", {}, 5000).catch(()=>({header:['得意先','図番','機種','品名','在庫数','最終更新'], rows:[]}));
  ensureInvControls(dat); renderInventory(dat);
}
function ensureInvControls(dat){
  if($("#invCtrlBar")) return;
  const wrap = $("#thInv")?.closest(".card") || $("#pageInv");
  const bar = document.createElement("div");
  bar.id = "invCtrlBar"; bar.className = "row wrap gap"; bar.style.margin = "8px 0 12px";
  const h = dat.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[x,i]));
  const colCust = idx['得意先']; const colModel= (idx['機種']!=null ? idx['機種'] : idx['品名']);
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
  const th = $("#thInv"), tb = $("#tbInv"), search = $("#invSearch");
  th.innerHTML = `<tr>${dat.header.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  const h = dat.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[x,i]));
  const colCust = idx['得意先']; const colModel= (idx['機種']!=null ? idx['機種'] : idx['品名']);
  const q = (search?.value||'').toLowerCase();
  const rows = dat.rows.filter(r=>{
    if(INV_UI.cust && String(r[colCust]||'') !== INV_UI.cust) return false;
    if(INV_UI.item){ const itemVal = String(r[colModel]||r[idx['品名']]||''); if(itemVal !== INV_UI.item) return false; }
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
    if(i<rows.length && 'requestIdleCallback' in window) requestIdleCallback(paint);
  })();
  if(search && !search._invBind){ search._invBind=true; search.oninput = debounce(()=>renderInventory(dat), 250); }
}
$("#btnInvExport")?.addEventListener('click', ()=> exportTableCSV("#tbInv","inventory.csv"));
$("#btnInvPrint")?.addEventListener('click', ()=> window.print());

/* ---------------- Form dialog generator ---------------- */
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
    const val = (initial[x.name] ?? ''); const id = `in_${x.name}_${Math.random().toString(36).slice(2)}`;
    if(x.type==='select' && x.free){
      input = `<input name="${x.name}" list="dl-${id}" placeholder="${x.label}" value="${val??''}">
               <datalist id="dl-${id}">${opts.map(o=>`<option value="${o}">`).join('')}</datalist>`;
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

/* ---------------- CSV Export / Import ---------------- */
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

/* ---------------- QR 工程 (Station) ---------------- */
const STATION_PROCESSES = [ "レザー加工","曲げ加工","外注加工/組立","組立","検査工程","検査中","検査済","出荷準備","出荷（組立済）","出荷済" ];
const QR_ACCEPT_PATTERNS = [
  /^STN\|(.+)$/i, /^PROC[:|](.+)$/i, /^工程[:|](.+)$/
];
function qrUrl(payload, size=512){ return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`; }
function openStationQrSheet(){
  const tiles = STATION_PROCESSES.map(p=>{
    const payload = `STN|${p}`;
    return `<div class="tile">
      <img src="${qrUrl(payload)}" alt="QR ${p}" loading="eager">
      <div class="lbl"><b>${p}</b></div>
      <div class="s muted">${payload}</div>
    </div>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>工程QR（Station, universal）</title>
  <style>:root{--gap:16px;--tile:236px;--border:#e5e7eb}*{box-sizing:border-box}
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;margin:16px;background:#fafafa;color:#111827}
  h1{font-size:18px;margin:0 0 12px}.toolbar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px;z-index:2}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--tile),1fr));gap:var(--gap)}
  .tile{border:1px solid var(--border);border-radius:14px;padding:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  .tile img{width:100%;height:auto;display:block;border-radius:8px}.lbl{margin-top:8px}.muted{color:#6b7280}.s{font-size:12px}
  @media print{body{margin:0}.toolbar{display:none}.grid{gap:10px}.tile{page-break-inside:avoid}}</style></head>
  <body><div class="toolbar"><h1>工程QR（Station, universal）</h1><button onclick="window.print()">印刷</button></div>
  <div class="grid">${tiles}</div></body></html>`;
  const w = window.open('about:blank'); w.document.write(html); w.document.close();
}
$("#btnStationQR")?.addEventListener("click", openStationQrSheet);

/* QRスキャン */
let scanStream=null, scanRAF=null;
function parseProcessFromStationQR(text){ for(const rx of QR_ACCEPT_PATTERNS){ const m = text.match(rx); if(m) return normalizeProc(m[1]); } return null; }
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
            const okv = Number(parts[2]||''); const ngv = Number(parts[3]||''); const note = parts[4]||'';
            const po_id = cPO || po;
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
  const html = `<dialog id="dlgQuick" class="dlg">
    <h3>${po} / ${process}</h3>
    <div class="row gap"><label>OK <input id="qOK" type="number" min="0" value="0" style="width:120px"></label>
    <label>NG <input id="qNG" type="number" min="0" value="0" style="width:120px"></label></div>
    <div class="row gap" style="margin-top:8px"><button class="btn" id="qSave">保存</button>
    <button class="btn ghost" id="qCancel">キャンセル</button></div></dialog>`;
  const wrap = document.createElement("div"); wrap.innerHTML = html; document.body.appendChild(wrap);
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

/* ---------------- Weather ---------------- */
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
        ()=> res(), {maximumAge: 600000, timeout: 2000}
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
  $("#wxTemp").textContent = Math.round(v.current.temperature_2m) + "°C";
  $("#wxWind").textContent = Math.round(v.current.wind_speed_10m) + " m/s";
  $("#wxPlace").textContent = v.timezone_abbreviation || "";
}
/* ---------- rIC fallback (cepat, aman) ---------- */
// Letakkan di paling atas app.js (setelah helper, sebelum render tabel apa pun)
(function () {
  // fallback sederhana: jalankan segera dengan setTimeout(0)
  const fallback = (cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 0);

  if (!('requestIdleCallback' in window)) {
    window.requestIdleCallback = fallback;
    window.cancelIdleCallback = (id) => clearTimeout(id);
    return;
  }

  // (Opsional) Bungkus rIC asli dengan timeout guard agar tidak “nunggu lama”
  const origRIC = window.requestIdleCallback;
  const origCancel = window.cancelIdleCallback || ((id) => clearTimeout(id));
  window.requestIdleCallback = function (cb, opts) {
    const cap = (opts && opts.timeout) || 200; // maksimal nunggu 200ms
    const t = setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), cap);
    const id = origRIC((deadline) => { clearTimeout(t); cb(deadline); }, opts);
    // kembalikan id kompatibel untuk cancel
    return { __rid: id, __tid: t };
  };
  window.cancelIdleCallback = function (idObj) {
    try { clearTimeout(idObj?.__tid); origCancel(idObj?.__rid); } catch (_) {}
  };
})();

/* ---------------- Utils ---------------- */
function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }

/* ---------------- Init ---------------- */
document.addEventListener("DOMContentLoaded", ()=> setUser(null));

/* ---------------- Print 出荷予定 ---------------- */
async function printShipByCustomer(cust, ymd){
  const dat = await cached("listShip", {}, 5000);
  const head = dat.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
  const rowsAll = (dat.rows||[]).filter(r => String(r[idx['得意先']]||r[idx['customer']]||'') === cust);
  const dkey = (v)=>{ const d=(v instanceof Date)?v:new Date(v); return isNaN(d)?'(日付未設定)':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
  const rows = ymd ? rowsAll.filter(r => dkey(r[idx['scheduled_date']]||r[idx['出荷日']]) === ymd) : rowsAll;
  const groups = {}; rows.forEach(r=>{ const k = dkey(r[idx['scheduled_date']]||r[idx['出荷日']]); (groups[k] ??= []).push(r); });
  const mapDate = (v)=>{ const d=(v instanceof Date)?v:new Date(v); return isNaN(d)?'':d.toLocaleDateString('ja-JP'); };
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>出荷予定 - ${cust}${ymd? ' '+ymd:''}</title>
  <style>body{font-family:system-ui,"Segoe UI",Roboto,Helvetica,Arial;padding:24px;}h1{font-size:20px;margin:0 0 6px;}h2{font-size:14px;margin:16px 0 8px;}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}th{background:#f6f7fb;}
  .right{text-align:right}</style></head><body>
  <h1>出荷予定（${cust}${ymd? ' / '+ymd:''}）</h1>
  ${Object.keys(groups).sort().map(k=>{
    const arr = groups[k]; const total = arr.reduce((s,r)=> s + Number(r[idx['qty']]||r[idx['数量']]||0), 0);
    return `<h2>${k}　合計: ${total}</h2>
    <table><tr>${['注番','品名','品番','図番','製造番号','数量','送り先','出荷日','納入日','運送会社','備考'].map(h=>`<th>${h}</th>`).join('')}</tr>
    ${arr.map(r=>`<tr>
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
    </tr>`).join('')}</table>`; }).join('')}
  <script>window.print();</script></body></html>`;
  const w = window.open('about:blank'); w.document.write(html); w.document.close();
}

/* =================================================
   請求書  — 作成/一覧
================================================= */
let INV_SRC_CACHE = []; // 全件(得意先内)キャッシュ
async function initInvoiceUI(){
  // セレクト初期化
  const sel = $("#invCustSel");
  sel.innerHTML = `<option value="">(得意先を選択)</option>` + MASTERS.customers.map(c=>`<option value="${c}">${c}</option>`).join('');
  const today = new Date(); $("#invIssueDate").value = new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
  $("#invRefresh").onclick = ()=> refreshInvoiceTables();
  $("#invSave").onclick    = ()=> saveInvoice();
  $("#invPdf").onclick     = ()=> exportInvoice('pdf');
  $("#invXlsx").onclick    = ()=> exportInvoice('xlsx');
  sel.onchange = refreshInvoiceTables;
  await loadInvoiceList();
}
async function refreshInvoiceTables(){
  const cust = $("#invCustSel").value;
  $("#tbInvCand").innerHTML = ""; $("#tbInvAll").innerHTML = ""; $("#invTotal").textContent = "¥ 0";
  if(!cust) return;
  const dat = await cached("listShip", {}, 5000);
  const h = dat.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[String(x).trim(), i]));
  const rows = (dat.rows||[]).filter(r => String(r[idx['得意先']]||r[idx['customer']]||'') === cust);
  // 変換
  INV_SRC_CACHE = rows.map(r=>{
    const qty = Number(r[idx['qty']]||r[idx['数量']]||0);
    const unit = Number(r[idx['単価']]||0);
    const status = String(r[idx['請求状態']]||r[idx['status']]||'');
    return {
      po: r[idx['po_id']]||r[idx['注番']]||'',
      item: r[idx['品名']]||r[idx['item_name']]||'',
      part: r[idx['品番']]||r[idx['part_no']]||'',
      qty, unit, total: qty*unit,
      ship_date: r[idx['delivery_date']]||r[idx['納入日']]||r[idx['出荷日']]||'',
      invoiced: /済/.test(status)      // 請求書済 / 請求書（未）
    };
  });

  // 未(候補)= invoiced=false
  const cand = INV_SRC_CACHE.filter(x=> !x.invoiced);
  const tbC = $("#tbInvCand");
  tbC.innerHTML = cand.map((x,i)=>`
    <tr>
      <td class="center"><input type="checkbox" class="inv-pick" data-i="${i}"></td>
      <td>${x.po}</td><td>${x.item}</td><td>${x.part}</td>
      <td class="center">${x.qty}</td><td class="center">${x.unit||0}</td>
      <td class="center">${x.total||0}</td>
      <td class="center">${x.ship_date? new Date(x.ship_date).toLocaleDateString('ja-JP'):''}</td>
    </tr>`).join('') || `<tr><td colspan="8" class="center muted">未対象データなし</td></tr>`;

  // 全件(状態色)
  const tbA = $("#tbInvAll");
  tbA.innerHTML = INV_SRC_CACHE.map(x=>{
    const badge = x.invoiced
      ? `<span class="badge" style="background:#e7f8ee;color:#065f46">請求書済</span>`
      : `<span class="badge" style="background:#fee2e2;color:#991b1b">請求書（未）</span>`;
    return `<tr>
      <td>${x.po}</td><td>${x.item}</td><td>${x.part}</td>
      <td class="center">${x.qty}</td><td class="center">${x.unit||0}</td>
      <td class="center">${x.total||0}</td>
      <td class="center">${x.ship_date? new Date(x.ship_date).toLocaleDateString('ja-JP'):''}</td>
      <td class="center">${badge}</td></tr>`;
  }).join('') || `<tr><td colspan="8" class="center muted">データなし</td></tr>`;

  // 合計(候補のチェックで更新)
  const updateTotal = ()=>{
    const picks = $$(".inv-pick").filter(x=> x.checked).map(x=> cand[Number(x.dataset.i)]);
    const sum = picks.reduce((s,x)=> s + (x.total||0), 0);
    $("#invTotal").textContent = "¥ " + sum.toLocaleString('ja-JP');
  };
  $$(".inv-pick").forEach(ch=> ch.onchange = updateTotal);
  updateTotal();
}
async function saveInvoice(){
  const cust = $("#invCustSel").value;
  if(!cust) return alert("得意先を選択してください");
  const picks = $$(".inv-pick").filter(x=> x.checked).map(x=> INV_SRC_CACHE.filter(y=> !y.invoiced)[Number(x.dataset.i)]);
  if(!picks.length) return alert("対象行を選択してください");
  if(!confirm("選択した明細で請求書を作成します。よろしいですか？")) return;
  try{
    // バリデーション: 請求書済のPOは弾く
    const dup = picks.find(x=> x.invoiced);
    if(dup) return alert(`注番 ${dup.po} は既に請求書済みです`);
    const issue = $("#invIssueDate").value;
    await jsonp("saveInvoice", {
      data: JSON.stringify({ customer: cust, issue_date: issue, items: picks, user: CURRENT_USER })
    });
    alert("保存しました");
    await refreshInvoiceTables(); await loadInvoiceList();
  }catch(e){ alert("保存失敗: " + e.message); }
}
async function loadInvoiceList(){
  const list = await cached("listInvoice", {}, 5000).catch(()=>({rows:[],header:[]}));
  const h = list.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[String(x).trim(), i]));
  const tb = $("#tbInvoiceList");
  tb.innerHTML = (list.rows||[]).map(r=>`
    <tr>
      <td>${r[idx['請求書番号']]||r[idx['inv_no']]||''}</td>
      <td>${r[idx['得意先']]||r[idx['customer']]||''}</td>
      <td>${r[idx['発行日']]||r[idx['issue_date']]||''}</td>
      <td class="center">${r[idx['合計']]||r[idx['total']]||''}</td>
      <td>${r[idx['ファイル名']]||''}</td>
      <td>${r[idx['作成者']]||''}</td>
    </tr>`).join('');
}
function exportInvoice(kind){
  const cust = $("#invCustSel").value;
  const picks = $$(".inv-pick").filter(x=> x.checked).map(x=> INV_SRC_CACHE.filter(y=> !y.invoiced)[Number(x.dataset.i)]);
  if(!cust || !picks.length) return alert("得意先と明細を選択してください");
  const ymd = $("#invIssueDate").value.replaceAll('-','');
  const fname = `請求書_${cust}_${ymd}.xlsx`;
  if(kind==='xlsx'){
    const header = ['注番','商品名','品番','数量','単価','金額','出荷日'];
    const rows = picks.map(x=> [x.po,x.item,x.part,x.qty,x.unit,x.total, x.ship_date? new Date(x.ship_date).toLocaleDateString('ja-JP'):'' ]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, '請求明細');
    XLSX.writeFile(wb, fname);
  }else{
    // PNG/PDF: とりあえず新しいウィンドウの印刷 (ブラウザからPDF保存)
    const sum = picks.reduce((s,x)=> s + (x.total||0), 0);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>請求書</title>
    <style>body{font-family:"Noto Sans JP",system-ui,Segoe UI,Roboto,Helvetica,Arial;padding:28px;color:#111}
    h1{margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ddd;padding:6px 8px}
    th{background:#f6f7fb;text-align:left}.right{text-align:right}.muted{color:#666}</style></head><body>
    <h1>請求書</h1>
    <div class="muted">${new Date($("#invIssueDate").value).toLocaleDateString('ja-JP')} 発行</div>
    <div style="margin-top:12px;font-weight:600">${cust} 御中</div>
    <table><tr><th>注番</th><th>商品名</th><th>品番</th><th>数量</th><th>単価</th><th>金額</th><th>出荷日</th></tr>
    ${picks.map(x=>`<tr><td>${x.po}</td><td>${x.item}</td><td>${x.part}</td><td class="right">${x.qty}</td><td class="right">${x.unit||0}</td><td class="right">${x.total||0}</td><td>${x.ship_date? new Date(x.ship_date).toLocaleDateString('ja-JP'):''}</td></tr>`).join('')}
    <tr><td colspan="5" class="right"><b>合計</b></td><td class="right"><b>${sum.toLocaleString('ja-JP')}</b></td><td></td></tr>
    </table><script>window.print()</script></body></html>`;
    const w = window.open('about:blank'); w.document.write(html); w.document.close();
  }
}

/* =================================================
   分析チャート (Chart.js)
================================================= */
let CHARTS = {};
function destroyCharts(){ Object.values(CHARTS).forEach(c=>{ try{c.destroy()}catch(_){}}); CHARTS={}; }
function initChartsUI(){
  // フィルタ初期化
  const ySel = $("#chYear"), cSel = $("#chCust");
  const now = new Date().getFullYear();
  ySel.innerHTML = `<option value="">(全て)</option>` + Array.from({length:6},(_,k)=> now-k).map(y=>`<option value="${y}">${y}</option>`).join('');
  cSel.innerHTML = `<option value="">(全て)</option>` + MASTERS.customers.map(c=>`<option value="${c}">${c}</option>`).join('');
  $("#chRefresh").onclick = renderCharts;
  $("#chExpPNG").onclick  = ()=> exportChartPNG();
  $("#chExpXLSX").onclick = ()=> exportChartDataXLSX();

  // タブ切替
  const tabs = [
    ['chTabCust','chViewCust'],
    ['chTabMonth','chViewMonth'],
    ['chTabYear','chViewYear'],
    ['chTabKpi','chViewKpi'],
    ['chTabDash','chViewDash']
  ];
  tabs.forEach(([btn,view])=>{
    $("#"+btn).onclick = ()=>{
      ['chViewCust','chViewMonth','chViewYear','chViewKpi','chViewDash'].forEach(id=> $("#"+id).classList.add("hidden"));
      $("#"+view).classList.remove("hidden");
    };
  });

  renderCharts();
}
async function getShipRowsForChart(){
  const dat = await cached("listShip", {}, 10000);
  const h = dat.header||[]; const idx = Object.fromEntries(h.map((x,i)=>[String(x).trim(), i]));
  return (dat.rows||[]).map(r=>({
    cust: r[idx['得意先']]||r[idx['customer']]||'',
    item: r[idx['品名']]||r[idx['item_name']]||'',
    qty: Number(r[idx['qty']]||r[idx['数量']]||0),
    value: Number(r[idx['金額']]||0) || (Number(r[idx['qty']]||0) * Number(r[idx['単価']]||0)),
    date: r[idx['delivery_date']]||r[idx['納入日']]||r[idx['出荷日']]||''
  }));
}
async function loadScript(src){
  return new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = src; s.async = true; s.defer = true;
    s.onload = ()=> res();
    s.onerror = ()=> rej(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}
async function ensureChartLibs(){
  // Chart.js
  if(typeof window.Chart === 'undefined'){
    await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js');
  }
  // DataLabels plugin
  if(typeof window.ChartDataLabels === 'undefined'){
    await loadScript('https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js');
  }
}

async function renderCharts(){
  destroyCharts();
  const rows = await getShipRowsForChart();
  const y = Number($("#chYear").value||'')||null;
  const m = Number($("#chMonth").value||'')||null;
  const c = $("#chCust").value||'';
  const filter = rows.filter(r=>{
    const t = r.date ? new Date(r.date) : null;
    if(y && (!t || t.getFullYear()!==y)) return false;
    if(m && (!t || (t.getMonth()+1)!==m)) return false;
    if(c && r.cust!==c) return false;
    return true;
  });

  // 1) 顧客別合計 (bar)
  {
    const map = {};
    filter.forEach(r=> map[r.cust] = (map[r.cust]||0) + r.qty);
    const labels = Object.keys(map); const data = labels.map(k=> map[k]);
    CHARTS.cust = new Chart($("#cvCust"), {
      type:'bar',
      data:{ labels, datasets:[{label:'数量', data}]},
      options:{ responsive:true, plugins:{ tooltip:{enabled:true}, legend:{display:false} } }
    });
  }
  // 2) 月別トレンド (line)
  {
    const map = Array(12).fill(0);
    filter.forEach(r=>{ if(r.date){ const d=new Date(r.date); map[d.getMonth()] += r.qty; } });
    CHARTS.month = new Chart($("#cvMonth"), {
      type:'line',
      data:{ labels:[...Array(12)].map((_,i)=> `${i+1}月`), datasets:[{label:'数量', data:map, fill:true}]},
      options:{ responsive:true, plugins:{ tooltip:{enabled:true} } }
    });
  }
  // 3) 年別合計 (column)
  {
    const map = {};
    filter.forEach(r=>{ if(r.date){ const d=new Date(r.date); const yy=d.getFullYear(); map[yy]=(map[yy]||0)+r.qty; } });
    const labels = Object.keys(map).sort(); const data = labels.map(k=> map[k]);
    CHARTS.year = new Chart($("#cvYear"), { type:'bar', data:{labels, datasets:[{label:'数量', data}]}, options:{plugins:{legend:{display:false}}} });
  }
  // 4) KPI + 線
  {
    const total = filter.reduce((s,r)=> s + r.qty, 0);
    const orders = new Set(filter.map(r=> `${r.cust}|${r.item}|${r.date}`)).size;
    const avg = orders ? (total/orders) : 0;
    $("#kpiTotal").innerHTML = `<div class="muted s">総数量</div><div style="font-size:22px">${total.toLocaleString('ja-JP')}</div>`;
    $("#kpiOrders").innerHTML= `<div class="muted s">明細数</div><div style="font-size:22px">${orders.toLocaleString('ja-JP')}</div>`;
    $("#kpiAvg").innerHTML   = `<div class="muted s">平均/明細</div><div style="font-size:22px">${avg.toFixed(1)}</div>`;
    const trend = Array(12).fill(0); filter.forEach(r=>{ if(r.date){ const d=new Date(r.date); trend[d.getMonth()]+=r.qty; } });
    CHARTS.kpi = new Chart($("#cvKpi"), { type:'line', data:{labels:[...Array(12)].map((_,i)=>`${i+1}月`), datasets:[{label:'数量', data:trend}]}, options:{} });
  }
  // 5) 追加アナリティクス
  {
    // Top customers
    const mc = {}; filter.forEach(r=> mc[r.cust]=(mc[r.cust]||0)+r.qty);
    const topCust = Object.entries(mc).sort((a,b)=> b[1]-a[1]).slice(0,10);
    CHARTS.topCust = new Chart($("#cvTopCust"), { type:'bar', data:{labels:topCust.map(x=>x[0]), datasets:[{label:'数量', data:topCust.map(x=>x[1])}]}, options:{indexAxis:'y'} });
    // Top items
    const mi = {}; filter.forEach(r=> mi[r.item]=(mi[r.item]||0)+r.qty);
    const topItem = Object.entries(mi).sort((a,b)=> b[1]-a[1]).slice(0,10);
    CHARTS.topItem = new Chart($("#cvTopItem"), { type:'bar', data:{labels:topItem.map(x=>x[0]), datasets:[{label:'数量', data:topItem.map(x=>x[1])}]}, options:{indexAxis:'y'} });
    // Month (this year)
    const yNow = new Date().getFullYear();
    const mtrend = Array(12).fill(0);
    filter.forEach(r=>{ if(r.date){ const d=new Date(r.date); if(d.getFullYear()===yNow) mtrend[d.getMonth()]+=r.qty; } });
    CHARTS.dashMonth = new Chart($("#cvDashMonth"), { type:'line', data:{labels:[...Array(12)].map((_,i)=>`${i+1}月`), datasets:[{label:'数量', data:mtrend, fill:true}]}, options:{} });
    // Year trend
    const my = {}; filter.forEach(r=>{ if(r.date){ const d=new Date(r.date); const yy=d.getFullYear(); my[yy]=(my[yy]||0)+r.qty; } });
    const yl = Object.keys(my).sort(); const yd = yl.map(k=> my[k]);
    CHARTS.dashYear = new Chart($("#cvDashYear"), { type:'bar', data:{labels:yl, datasets:[{label:'数量', data:yd}]}, options:{plugins:{legend:{display:false}}} });
  }
}
function exportChartPNG(){
  const canv = $("#pageCharts canvas:not(.hidden)");
  if(!canv) return alert("表示中のチャートがありません");
  const a = document.createElement("a");
  a.href = canv.toDataURL("image/png");
  a.download = "chart.png"; a.click();
}
function exportChartDataXLSX(){
  // 代表: 顧客別合計を出力
  if(!CHARTS.cust) return alert("チャートを先に生成してください");
  const labels = CHARTS.cust.data.labels;
  const vals = CHARTS.cust.data.datasets[0].data;
  const rows = [["顧客","数量"], ...labels.map((l,i)=>[l, vals[i]])];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "顧客別");
  XLSX.writeFile(wb, "chart_data.xlsx");
  (function checkChartCanvases(){
  const need = ['cvCust','cvMonth','cvYear','cvKpi','cvTopCust','cvTopItem','cvDashMonth','cvDashYear'];
  const missing = need.filter(id => !document.getElementById(id));
  if(missing.length){
    console.warn('Canvas chart tidak ditemukan:', missing);
  }
})();

}
/* =========================================================
 *  分析チャート モジュール  (append-only / drop-in)
 *  Tempel di BAWAH file app.js lama Anda.
 * =======================================================*/
(function () {
  // ---------- small polyfills ----------
  if (!('requestIdleCallback' in window)) {
    window.requestIdleCallback = function (cb) {
      return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 0);
    };
    window.cancelIdleCallback = function (id) { clearTimeout(id); };
  }

  // ---------- JSONP safety wrapper (pakai yg lama jika ada) ----------
  async function callAPI(action, params = {}, { ttlMs = 15000, retry = 1 } = {}) {
    // pakai helper lama jika tersedia
    if (typeof cached === 'function') {
      try {
        return await cached(action, params, ttlMs);
      } catch (e) {
        if (retry > 0) return callAPI(action, params, { ttlMs, retry: retry - 1 });
        throw e;
      }
    }
    if (typeof jsonp === 'function') {
      try {
        return await jsonp(action, params);
      } catch (e) {
        if (retry > 0) return callAPI(action, params, { ttlMs, retry: retry - 1 });
        throw e;
      }
    }
    throw new Error('API bridge (jsonp/cached) is not available');
  }

  // ---------- nav bind ----------
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));
  function showPage(id) {
    ["authView", "pageDash", "pageSales", "pagePlan", "pageShip", "pageFinished", "pageInv", "pageInvoice", "pageCharts"]
      .forEach(x => $("#" + x)?.classList.add("hidden"));
    $("#" + id)?.classList.remove("hidden");
  }
  $("#btnToCharts")?.addEventListener("click", () => { showPage("pageCharts"); CHARTS.reload(); });

  // =================================================================
  //                          CHARTS CORE
  // =================================================================
  const CHARTS = {
    _inited: false,
    _charts: {},   // {daily, monthly, top, custMonthly}
    _state: {
      year: '', month: '', customer: '',
      mode: 'month', // or 'year'
      type: 'stacked', // stacked | pareto | pie
      pick: 'ALL'
    },
    async initOnce() {
      if (this._inited) return;
      this._inited = true;

      // fill Tahun
      const ySel = $("#chYear");
      const nowY = new Date().getFullYear();
      ySel.innerHTML = '<option value="">(全て)</option>' +
        Array.from({ length: 6 }).map((_, i) => {
          const y = nowY - i;
          return `<option value="${y}">${y}年</option>`;
        }).join('');
      ySel.value = String(nowY); // default tahun ini

      // bind filters
      $("#chYear").addEventListener("change", () => { this._state.year = $("#chYear").value; this.reload(); });
      $("#chMonth").addEventListener("change", () => { this._state.month = $("#chMonth").value; this.reload(); });
      $("#chCust").addEventListener("change", () => { this._state.customer = $("#chCust").value; this.reload(); });

      $("#chMode").addEventListener("change", () => { this._state.mode = $("#chMode").value; this.reload(); });
      $("#chType").addEventListener("change", () => { this._state.type = $("#chType").value; this.reload(); });
      $("#chPick").addEventListener("change", () => { this._state.pick = $("#chPick").value || 'ALL'; this.reload(false); });

      $("#chReload").addEventListener("click", () => this.reload(true));
      $("#chExportImg").addEventListener("click", () => this.exportPNG());
      $("#chExportXlsx").addEventListener("click", () => this.exportExcel());
    },

    // --------- fetch ship data via Apps Script (listShip) ----------
    async fetchShip() {
      // expected shape: {header:[], rows:[[]]}
      const dat = await callAPI("listShip", {}, { ttlMs: 20000, retry: 1 });

      const head = dat?.header || [];
      const rows = dat?.rows || [];
      const idx = Object.fromEntries(head.map((h, i) => [String(h).trim(), i]));
      const col = (name, alt = []) => {
        if (idx[name] != null) return idx[name];
        for (const a of alt) if (idx[a] != null) return idx[a];
        return null;
      };

      const cDate = col('scheduled_date', ['出荷日', '納期', 'delivery_date']);
      const cCust = col('得意先', ['customer']);
      const cQty = col('qty', ['数量']);
      const cItem = col('品名', ['item_name']);
      const cPO = col('po_id', ['注番']);
      // unit price optional
      const cUnit = col('単価', ['unit_price']);
      // pre-map to object
      const out = rows.map(r => ({
        date: safeDate(r[cDate]),
        year: ymd(r[cDate]).y,
        month: ymd(r[cDate]).m,
        ym: ymd(r[cDate]).ym,
        cust: String(r[cCust] ?? '').trim() || '—',
        qty: num(r[cQty]),
        item: String(r[cItem] ?? '').trim(),
        po: String(r[cPO] ?? '').trim(),
        unit: num(r[cUnit]),
      })).filter(x => !!x.date);

      // fill customer options
      const custs = Array.from(new Set(out.map(x => x.cust).filter(Boolean))).sort();
      const sel = $("#chCust");
      const cur = sel.value;
      sel.innerHTML = '<option value="">(全て)</option>' + custs.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
      if (custs.includes(cur)) sel.value = cur;

      return out;

      // helpers
      function num(v) { const n = Number(String(v || '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; }
      function safeDate(v) { const d = new Date(v); return isNaN(d) ? null : d; }
      function ymd(v) {
        const d = new Date(v); if (isNaN(d)) return { y: '', m: '', ym: '' };
        const y = d.getFullYear(); const m = d.getMonth() + 1;
        return { y, m, ym: `${y}-${String(m).padStart(2, '0')}` };
      }
      function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    },

    // --------- aggregate & filter ----------
    filter(records) {
      const { year, month, customer } = this._state;
      return records.filter(r => {
        if (year && String(r.year) !== String(year)) return false;
        if (month && String(r.month) !== String(month)) return false;
        if (customer && r.cust !== customer) return false;
        return true;
      });
    },

    aggregate(recs) {
      // daily, monthly YTD, yearly, top cust, cust-month matrix
      const byDay = new Map();
      const byYM = new Map();
      const byY = new Map();
      const byCust = new Map();
      const custMonth = new Map(); // ym -> cust -> qty
      const custYear = new Map();  // y -> cust -> qty

      for (const r of recs) {
        const day = r.date.toISOString().slice(0, 10);
        const ym = r.ym;
        const y = r.year;
        const v = r.qty;

        byDay.set(day, (byDay.get(day) || 0) + v);
        byYM.set(ym, (byYM.get(ym) || 0) + v);
        byY.set(y, (byY.get(y) || 0) + v);
        byCust.set(r.cust, (byCust.get(r.cust) || 0) + v);

        if (!custMonth.has(ym)) custMonth.set(ym, new Map());
        custMonth.get(ym).set(r.cust, (custMonth.get(ym).get(r.cust) || 0) + v);

        if (!custYear.has(y)) custYear.set(y, new Map());
        custYear.get(y).set(r.cust, (custYear.get(y).get(r.cust) || 0) + v);
      }

      const sortK = a => a.sort();
      const dailyLabels = sortK(Array.from(byDay.keys()));
      const dailyValues = dailyLabels.map(k => byDay.get(k));

      // YTD monthly 1..12
      const now = new Date();
      const yr = this._state.year ? Number(this._state.year) : now.getFullYear();
      const ytdLabels = Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, '0')}`);
      const ytdValues = ytdLabels.map(k => byYM.get(k) || 0);

      const yearlyLabels = sortK(Array.from(byY.keys()).map(String));
      const yearlyValues = yearlyLabels.map(k => byY.get(Number(k)) || 0);

      const topEntries = Array.from(byCust.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const topLabels = topEntries.map(e => e[0]);
      const topValues = topEntries.map(e => e[1]);

      const months = sortK(Array.from(custMonth.keys()));
      const years = sortK(Array.from(custYear.keys()).map(String));

      // dataset stacked (Top 6)
      const top6 = Array.from(byCust.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]);
      const custMonthDatasets = top6.map(cn => ({
        label: cn,
        data: months.map(m => (custMonth.get(m)?.get(cn) || 0))
      }));
      const custYearDatasets = top6.map(cn => ({
        label: cn,
        data: years.map(y => (custYear.get(Number(y))?.get(cn) || 0))
      }));

      // for picker (ALL/each month/year)
      const monthTotalsByCust = Object.fromEntries(months.map(m => [m, Object.fromEntries(custMonth.get(m) || [])]));
      const yearTotalsByCust = Object.fromEntries(years.map(y => [y, Object.fromEntries(custYear.get(Number(y)) || [])]));
      // ALL
      monthTotalsByCust.ALL = sumAcross(monthTotalsByCust);
      yearTotalsByCust.ALL = sumAcross(yearTotalsByCust);

      // fill pick options
      const pickSel = $("#chPick");
      const mode = this._state.mode;
      const arr = mode === 'month' ? months : years;
      const keep = pickSel.value || 'ALL';
      pickSel.innerHTML = `<option value="ALL">ALL</option>` +
        arr.map(v => `<option value="${v}">${v}</option>`).join('');
      pickSel.value = keep;

      return {
        dailyLabels, dailyValues,
        ytdLabels, ytdValues,
        yearlyLabels, yearlyValues,
        topLabels, topValues,
        months, years,
        custMonthDatasets, custYearDatasets,
        monthTotalsByCust, yearTotalsByCust
      };

      function sumAcross(mapObj) {
        const total = {};
        Object.values(mapObj).forEach(entry => {
          Object.entries(entry).forEach(([k, v]) => { total[k] = (total[k] || 0) + (v || 0); });
        });
        return total;
      }
    },

    // --------- render charts (destroy-before-create) ----------
    upsert(ref, ctx, config) {
      try {
        const instOld = this._charts[ref];
        if (instOld && typeof instOld.destroy === 'function') {
          instOld.destroy();
        }
      } catch { /* noop */ }
      this._charts[ref] = new Chart(ctx, config);
    },

    render(ag) {
      Chart.register(ChartDataLabels);

      // Daily (line)
      this.upsert('daily', $('#cDaily'), {
        type: 'line',
        data: { labels: ag.dailyLabels, datasets: [{ label: '数量', data: ag.dailyValues, tension: .25, pointRadius: 2, fill: false }] },
        options: baseOpt()
      });

      // Monthly YTD (bar)
      this.upsert('monthly', $('#cMonthly'), {
        type: 'bar',
        data: { labels: ag.ytdLabels.map(l => l.slice(5) + '月'), datasets: [{ label: '数量', data: ag.ytdValues }] },
        options: baseOpt()
      });

      // Top customers (bar horizontal)
      this.upsert('top', $('#cTopCust'), {
        type: 'bar',
        data: { labels: ag.topLabels, datasets: [{ label: '数量', data: ag.topValues }] },
        options: Object.assign(baseOpt(), { indexAxis: 'y' })
      });

      // Customer monthly/yearly
      const mode = this._state.mode;
      const type = this._state.type;
      const pick = this._state.pick || 'ALL';

      if (type === 'stacked') {
        const labels = mode === 'month' ? ag.months : ag.years;
        const dataSets = mode === 'month' ? ag.custMonthDatasets : ag.custYearDatasets;
        this.upsert('custMonthly', $('#cCustMonthly'), {
          type: 'bar',
          data: { labels, datasets: dataSets },
          options: Object.assign(baseOpt(false), {
            plugins: { legend: { position: 'bottom' }, datalabels: { display: false } },
            scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } }
          })
        });
      } else if (type === 'pie') {
        const map = (mode === 'month' ? ag.monthTotalsByCust : ag.yearTotalsByCust)[pick] || {};
        const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
        this.upsert('custMonthly', $('#cCustMonthly'), {
          type: 'pie',
          data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]) }] },
          options: Object.assign(baseOpt(false), {
            plugins: {
              legend: { position: 'right' },
              datalabels: {
                display: true,
                formatter: (v, ctx) => {
                  const sum = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
                  const p = Math.round(v / sum * 100);
                  return `${v} (${p}%)`;
                }
              }
            }
          })
        });
      } else { // pareto
        const map = (mode === 'month' ? ag.monthTotalsByCust : ag.yearTotalsByCust)[pick] || {};
        const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 12);
        const labels = entries.map(e => e[0]);
        const vals = entries.map(e => e[1]);
        const total = vals.reduce((a, b) => a + b, 0) || 1;
        const cum = [];
        vals.reduce((acc, v, i) => (cum[i] = Math.round((acc + v) / total * 100), acc + v), 0);
        this.upsert('custMonthly', $('#cCustMonthly'), {
          type: 'bar',
          data: { labels, datasets: [{ label: '数量', data: vals, yAxisID: 'y' }, { label: '累積(%)', data: cum, type: 'line', yAxisID: 'y1', tension: .25, pointRadius: 2 }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true }, datalabels: { display: true, anchor: 'end', align: 'top', formatter: (v, ctx) => ctx.dataset.type === 'line' ? v + '%' : v } },
            scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, max: 100, grid: { drawOnChartArea: false } } }
          }
        });
      }

      function baseOpt(withDatalabel = true) {
        return {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: { display: withDatalabel, anchor: 'end', align: 'top', offset: 4, formatter: v => (v == null || isNaN(v) ? '' : Math.round(v)) }
          },
          scales: { x: { grid: { color: '#eef2ff' } }, y: { grid: { color: '#f1f5f9' }, ticks: { precision: 0 } } }
        };
      }
    },

    // --------- export ----------
    async exportPNG() {
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) { alert('PDF エクスポートのライブラリが読み込まれていません'); return; }
      const doc = new jsPDF('l', 'pt', 'a4');
      const canvases = ['cDaily', 'cMonthly', 'cTopCust', 'cCustMonthly'].map(id => document.getElementById(id));
      let y = 40;
      for (const cv of canvases) {
        const url = cv.toDataURL('image/png', 1.0);
        doc.addImage(url, 'PNG', 30, y, 750, 300);
        y += 320;
        if (y > 520) { doc.addPage(); y = 40; }
      }
      const fn = `charts_${Date.now()}.pdf`;
      doc.save(fn);
    },

    async exportExcel() {
      const recs = this._lastRecs || [];
      const ag = this._lastAg || { dailyLabels: [], dailyValues: [], ytdLabels: [], ytdValues: [], yearlyLabels: [], yearlyValues: [], topLabels: [], topValues: [] };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['日付', '数量'], ...ag.dailyLabels.map((d, i) => [d, ag.dailyValues[i]])]), 'Daily');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['月', '数量'], ...ag.ytdLabels.map((m, i) => [m, ag.ytdValues[i]])]), 'MonthlyYTD');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['年', '数量'], ...ag.yearlyLabels.map((y, i) => [y, ag.yearlyValues[i]])]), 'Yearly');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['顧客', '数量'], ...ag.topLabels.map((c, i) => [c, ag.topValues[i]])]), 'TopCustomers');
      XLSX.writeFile(wb, `charts_export_${Date.now()}.xlsx`);
    },

    // --------- reload pipeline ----------
    async reload(forceRefetch = false) {
      await this.initOnce();
      try {
        $("#chReload").disabled = true;

        // ambil data
        // jika Anda sudah memiliki cache('listShip'), forceRefetch=false akan memanfaatkan TTL
        const all = await this.fetchShip();

        // simpan terakhir buat export
        this._lastRecsRaw = all.slice();

        // filter sesuai UI
        const filtered = this.filter(all);
        this._lastRecs = filtered;

        // agregasi
        const ag = this.aggregate(filtered);
        this._lastAg = ag;

        // render
        this.render(ag);
      } catch (e) {
        console.error(e);
        alert('チャートの読み込みに失敗しました: ' + (e?.message || e));
      } finally {
        $("#chReload").disabled = false;
      }
    }
  };

  // expose untuk debug jika perlu
  window.CHARTS = CHARTS;

  // auto-init saat halaman charts ditampilkan pertama kali (jika user langsung klik menu)
  document.addEventListener('DOMContentLoaded', () => {
    // kalau user sudah login & klik menu charts, handler di btnToCharts akan memanggil reload()
    // optional: autoload pertama kali agar terasa cepat ketika membuka menu
    // requestIdleCallback(() => CHARTS.reload());
  });
})();

