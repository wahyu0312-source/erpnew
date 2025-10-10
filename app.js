/* =================================================
   Frontend JSONP (bebas CORS)
   Menu CRUD + Flow + QR Scan + A4 Print
   ================================================= */
const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";
const PROCESS_LIST = ["準備","シャッター溶接","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","出荷（組立済）"];

const $  = (q,el=document)=> el.querySelector(q);
const $$ = (q,el=document)=> [...el.querySelectorAll(q)];
const qs = (o)=> Object.entries(o).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const fmt = (d)=> d? new Date(d).toLocaleString("ja-JP"):"";
const normalizeProc = (s)=> String(s||"").trim().replace("レーサ加工","レザー加工").replace("外作加工","外注加工/組立") || "未設定";

/* ---------- JSONP ---------- */
function jsonp(action, params={}){
  return new Promise((resolve,reject)=>{
    const cb = "cb_" + Math.random().toString(36).slice(2);
    params = { ...params, action, callback: cb };
    const url = `${API_BASE}?${qs(params)}`;
    const s = document.createElement("script");
    s.src = url;
    window[cb] = (resp)=>{
      delete window[cb]; s.remove();
      if(resp && resp.ok) resolve(resp.data);
      else reject(new Error(resp && resp.error || "API error"));
    };
    s.onerror = ()=>{ delete window[cb]; s.remove(); reject(new Error("JSONP load error")); };
    document.body.appendChild(s);
  });
}

/* ---------- UI helpers ---------- */
const procToChip = (p)=>{
  p = normalizeProc(p);
  if(/レザー加工|レーザー/.test(p)) return `<span class="chip p-laser"><i class="fa-solid fa-bolt"></i>${p}</span>`;
  if(/曲げ/.test(p)) return `<span class="chip p-bend"><i class="fa-solid fa-wave-square"></i>${p}</span>`;
  if(/外注加工|加工/.test(p)) return `<span class="chip p-press"><i class="fa-solid fa-compass-drafting"></i>${p}</span>`;
  if(/組立/.test(p)) return `<span class="chip p-assembly"><i class="fa-solid fa-screwdriver-wrench"></i>${p}</span>`;
  if(/検査/.test(p)) return `<span class="chip p-inspection"><i class="fa-regular fa-square-check"></i>${p}</span>`;
  return `<span class="chip p-other"><i class="fa-regular fa-square"></i>${p}</span>`;
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
  'admin': { pages:['pageDash','pageSales','pagePlan','pageShip','pageInventory','pageFinished','pageInvoice','pageCharts'], nav:true },
  '営業': { pages:['pageSales','pageInvoice','pageDash'], nav:true },
  '生産管理': { pages:['pagePlan','pageShip','pageInventory','pageFinished','pageDash'], nav:true },
  '生産管理部': { pages:['pagePlan','pageShip','pageInventory','pageFinished','pageDash'], nav:true },
  '製造': { pages:['pageDash'], nav:true },
  '検査': { pages:['pageDash'], nav:true }
};
function setUser(u){
  CURRENT_USER = u || null;
  $("#userInfo").textContent = u ? `${u.role} / ${u.department}` : "";
  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip","pageInventory","pageFinished","pageInvoice","pageCharts"];
  pages.forEach(p => $("#"+p)?.classList.add("hidden"));
  ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToInvPage','btnToFinPage','btnToInvoice','btnToCharts','ddSetting'].forEach(id=> $("#"+id)?.classList.add("hidden"));
  if(!u){ $("#authView")?.classList.remove("hidden"); return; }

  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP['admin'];
  if(allow?.nav){
    if(allow.pages.includes('pageDash')) $("#btnToDash").classList.remove("hidden");
    if(allow.pages.includes('pageSales')) $("#btnToSales").classList.remove("hidden");
    if(allow.pages.includes('pagePlan')) $("#btnToPlan").classList.remove("hidden");
    if(allow.pages.includes('pageShip')) $("#btnToShip").classList.remove("hidden");
    if(allow.pages.includes('pageInventory')) $("#btnToInvPage").classList.remove("hidden");
    if(allow.pages.includes('pageFinished')) $("#btnToFinPage").classList.remove("hidden");
    if(allow.pages.includes('pageInvoice')) $("#btnToInvoice").classList.remove("hidden");
    if(allow.pages.includes('pageCharts')) $("#btnToCharts").classList.remove("hidden");
    $("#ddSetting").classList.remove("hidden");
  }
  show("pageDash");
  refreshAll();
}

/* ---------- Nav ---------- */
function show(id){
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageInventory","pageFinished","pageInvoice","pageCharts"].forEach(p=>$("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}
$("#btnToDash").onclick=()=>{ show("pageDash"); refreshAll(); };
$("#btnToSales").onclick=()=>{ show("pageSales"); loadSheetToTable(SH.PRODUCTION_ORDERS, '#ordHead','#ordBody','po_id'); };
$("#btnToPlan").onclick =()=>{ show("pagePlan");  loadSheetToTable(SH.PLANS, '#planHead','#planBody','plan_id'); };
$("#btnToShip").onclick =()=>{ show("pageShip");  loadSheetToTable(SH.SHIPMENTS, '#shipHead','#shipBody','ship_id'); };
$("#btnToInvPage").onclick=()=>{ show("pageInventory"); loadSheetToTable(SH.INVENTORY, '#invHead','#invBody','item_code'); };
$("#btnToFinPage").onclick=()=>{ show("pageFinished"); loadSheetToTable(SH.FINISHED, '#finHead','#finBody','fg_id'); };
$("#btnToInvoice").onclick=()=>{ show("pageInvoice");  loadSheetToTable(SH.INVOICES, '#invHead2','#invBody2','inv_no'); };
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
  }catch(e){
    console.error("[Login] error:", e);
    alert("ログイン失敗: " + (e?.message || e));
  }
};

/* ---------- Dashboard (tetap) ---------- */
async function loadOrders(){
  const list = await jsonp("listOrders");
  const q = ($("#searchQ").value||"").trim().toLowerCase();
  const rows = list.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  const tb = $("#tbOrders"); tb.innerHTML = "";
  for(const r of rows){
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
          <button class="btn ghost btn-manual" data-po="${r.po_id}"><i class="fa-regular fa-pen-to-square"></i> 手動更新</button>
        </div>
      </td>`;
    tb.appendChild(tr);
  }
  $$(".btn-scan",tb).forEach(b=> b.onclick=(e)=> openScanDialog(e.currentTarget.dataset.po));
  $$(".btn-manual",tb).forEach(b=> b.onclick=(e)=> openManualDialog(e.currentTarget.dataset.po));
}
async function loadStats(){
  const snap = await jsonp("locSnapshotAll");
  const grid = $("#gridProc"); grid.innerHTML = "";
  PROCESS_LIST.forEach(p=>{
    const name = normalizeProc(p);
    const c = snap[name] || 0;
    const span = document.createElement("span");
    span.innerHTML = procToChip(name)+`<span class="muted s" style="margin-left:.35rem">${c}</span>`;
    grid.appendChild(span);
  });
  const s = await jsonp("stock");
  $("#statFinished").textContent = s.finishedStock ?? 0;
  $("#statReady").textContent    = s.ready ?? 0;
  $("#statShipped").textContent  = s.shipped ?? 0;

  const today = await jsonp("todayShip");
  const ul = $("#listToday"); ul.innerHTML="";
  if(!today.length){ ul.innerHTML = `<div class="muted s">なし</div>`; }
  else today.forEach(x=>{
    const div = document.createElement("div");
    div.innerHTML = `<div class="row"><span class="badge st-ready"><i class="fa-solid fa-truck"></i>${(String(x.scheduled_date||"")).slice(0,10)}</span><b style="margin-left:.4rem">${x.po_id}</b> × ${x.qty||0}</div>`;
    ul.appendChild(div);
  });
}
async function refreshAll(){ await Promise.all([loadOrders(), loadStats()]); }
$("#btnRefresh").onclick = refreshAll;

/* ---------- Generic Sheet Helpers (CRUD) ---------- */
const SH = {
  PRODUCTION_ORDERS: 'ProductionOrders',
  PLANS: 'ProductionPlans',
  SHIPMENTS: 'Shipments',
  INVENTORY: 'Inventory',
  FINISHED: 'FinishedGoods',
  INVOICES: 'Invoices',
};

async function loadSheetToTable(sheet, headSel, bodySel, keyCol){
  const data = await jsonp('listSheet', { sheet });
  // Render header from keys union
  const keys = data.length ? Object.keys(data[0]) : [keyCol,'備考'];
  $(headSel).innerHTML = `<tr>${keys.map(k=>`<th>${k}</th>`).join('')}<th>操作</th></tr>`;
  const tbody = $(bodySel); tbody.innerHTML = "";
  data.forEach(row=>{
    const tr = document.createElement('tr');
    tr.dataset.key = row[keyCol] || '';
    tr.innerHTML = keys.map(k=>`<td contenteditable data-k="${k}">${row[k]??''}</td>`).join('')
      + `<td class="center"><button class="btn ghost btn-del">削除</button></td>`;
    tbody.appendChild(tr);
  });
  // delete
  $$('.btn-del', tbody).forEach(btn=>{
    btn.onclick = async (e)=>{
      const tr = e.currentTarget.closest('tr');
      const keyVal = tr.dataset.key || tr.querySelector(`[data-k="${keyCol}"]`)?.textContent.trim();
      if(!keyVal) return alert('キー未設定');
      if(!confirm('削除しますか？')) return;
      await jsonp('deleteRow', { sheet, key: keyCol, value: keyVal });
      tr.remove();
    };
  });
}

function collectTableRows(headSel, bodySel){
  const headTh = $$( 'th', $(headSel) );
  const keys = headTh.slice(0,-1).map(th=>th.textContent.trim()); // exclude 操作
  const rows = [];
  $$('#'+$(bodySel).id+' tr', $(bodySel).parentElement).forEach(tr=>{
    const obj = {};
    $$('td[contenteditable]', tr).forEach(td=>{
      obj[td.dataset.k] = td.textContent.trim();
    });
    rows.push(obj);
  });
  return rows;
}

/* ---------- CSV Export/Import ---------- */
function downloadCSV(filename, rows){
  if(!rows.length) return alert('データなし');
  const keys = Object.keys(rows[0]);
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const csv = [keys.join(','), ...rows.map(r=> keys.map(k=>esc(r[k])).join(','))].join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

async function handleImport(inputEl, targetSheet, headSel, bodySel, keyCol){
  const file = inputEl.files[0]; if(!file) return;
  const wb = await file.arrayBuffer().then(ExcelJSread); // helper below
  const rows = wb.rows; // [{col:val,...}]
  // render and allow edit before save
  $(headSel).innerHTML = `<tr>${Object.keys(rows[0]||{[keyCol]:''}).map(k=>`<th>${k}</th>`).join('')}<th>操作</th></tr>`;
  const tbody = $(bodySel); tbody.innerHTML="";
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.dataset.key = r[keyCol]||'';
    tr.innerHTML = Object.keys(r).map(k=>`<td contenteditable data-k="${k}">${r[k]??''}</td>`).join('')
      + `<td class="center"><button class="btn ghost btn-del">削除</button></td>`;
    tbody.appendChild(tr);
  });
}

async function ExcelJSread(arrayBuffer){
  // menggunakan SheetJS (XLSX) yang sudah di-load
  const wb = XLSX.read(arrayBuffer, {type:'array'});
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const json = XLSX.utils.sheet_to_json(ws, {defval:''});
  return { rows: json };
}

/* ---------- Toolbar wiring (per menu) ---------- */
// 受注
$("#ordCreate").onclick = ()=> {
  const body = $("#ordBody");
  const tr = document.createElement('tr');
  tr.innerHTML = `<td contenteditable data-k="po_id"></td>
  <td contenteditable data-k="得意先"></td>
  <td contenteditable data-k="品名"></td>
  <td contenteditable data-k="品番"></td>
  <td contenteditable data-k="図番"></td>
  <td contenteditable data-k="qty">0</td>
  <td contenteditable data-k="status">進行</td>
  <td contenteditable data-k="current_process">準備</td>
  <td contenteditable data-k="updated_at"></td>
  <td contenteditable data-k="updated_by"></td>
  <td class="center"><button class="btn ghost btn-del">削除</button></td>`;
  body.prepend(tr);
};
$("#ordImport").onchange = ()=> handleImport($("#ordImport"), SH.PRODUCTION_ORDERS, "#ordHead","#ordBody",'po_id');
$("#ordExport").onclick = async ()=>{
  const rows = collectTableRows("#ordHead","#ordBody");
  downloadCSV(`orders_${new Date().toISOString().slice(0,10)}.csv`, rows);
};
$("#ordSave").onclick = async ()=>{
  const rows = collectTableRows("#ordHead","#ordBody");
  await jsonp('batchUpsert', { sheet:SH.PRODUCTION_ORDERS, key:'po_id', rows: JSON.stringify(rows), user: JSON.stringify(CURRENT_USER||{}) });
  alert('保存しました'); refreshAll();
};
$("#ordPrint").onclick = ()=> window.print();

// 生産計画
$("#planCreate").onclick = ()=>{
  const body = $("#planBody");
  const tr = document.createElement('tr');
  tr.innerHTML = `<td contenteditable data-k="plan_id"></td>
  <td contenteditable data-k="po_id"></td>
  <td contenteditable data-k="start_date"></td>
  <td contenteditable data-k="due_date"></td>
  <td contenteditable data-k="line"></td>
  <td contenteditable data-k="note"></td>
  <td contenteditable data-k="updated_at"></td>
  <td contenteditable data-k="updated_by"></td>
  <td class="center"><button class="btn ghost btn-del">削除</button></td>`;
  body.prepend(tr);
};
$("#planImport").onchange = ()=> handleImport($("#planImport"), SH.PLANS, "#planHead","#planBody",'plan_id');
$("#planExport").onclick = ()=> downloadCSV(`plans_${new Date().toISOString().slice(0,10)}.csv`, collectTableRows("#planHead","#planBody"));
$("#planSave").onclick = async ()=>{
  const rows = collectTableRows("#planHead","#planBody");
  await jsonp('batchUpsert', { sheet:SH.PLANS, key:'plan_id', rows: JSON.stringify(rows), user: JSON.stringify(CURRENT_USER||{}) });
  alert('保存しました');
  // Alur: jika ada plan baru, otomatis show di dashboard (data sumber tetap dari sheet)
  refreshAll();
};
$("#planPrint").onclick = ()=> window.print();

// 出荷予定
$("#shipCreate").onclick = ()=>{
  const body = $("#shipBody");
  const tr = document.createElement('tr');
  tr.innerHTML = `<td contenteditable data-k="ship_id"></td>
  <td contenteditable data-k="po_id"></td>
  <td contenteditable data-k="scheduled_date"></td>
  <td contenteditable data-k="qty"></td>
  <td contenteditable data-k="status">予定</td>
  <td contenteditable data-k="created_at"></td>
  <td contenteditable data-k="created_by"></td>
  <td class="center"><button class="btn ghost btn-del">削除</button></td>`;
  body.prepend(tr);
};
$("#shipImport").onchange = ()=> handleImport($("#shipImport"), SH.SHIPMENTS, "#shipHead","#shipBody",'ship_id');
$("#shipExport").onclick = ()=> downloadCSV(`shipments_${new Date().toISOString().slice(0,10)}.csv`, collectTableRows("#shipHead","#shipBody"));
$("#shipSave").onclick = async ()=>{
  const rows = collectTableRows("#shipHead","#shipBody");
  await jsonp('batchUpsert', { sheet:SH.SHIPMENTS, key:'ship_id', rows: JSON.stringify(rows), user: JSON.stringify(CURRENT_USER||{}) });
  alert('保存しました'); refreshAll();
};
$("#shipPrint").onclick = ()=> window.print();

// 在庫
$("#invCreate").onclick = ()=>{
  const body = $("#invBody");
  const tr = document.createElement('tr');
  tr.innerHTML = `<td contenteditable data-k="item_code"></td>
  <td contenteditable data-k="品名"></td>
  <td contenteditable data-k="在庫数">0</td>
  <td contenteditable data-k="loc"></td>
  <td contenteditable data-k="updated_at"></td>
  <td contenteditable data-k="updated_by"></td>
  <td class="center"><button class="btn ghost btn-del">削除</button></td>`;
  body.prepend(tr);
};
$("#invImport").onchange = ()=> handleImport($("#invImport"), SH.INVENTORY, "#invHead","#invBody",'item_code');
$("#invExport").onclick = ()=> downloadCSV(`inventory_${new Date().toISOString().slice(0,10)}.csv`, collectTableRows("#invHead","#invBody"));
$("#invSave").onclick = async ()=>{
  const rows = collectTableRows("#invHead","#invBody");
  await jsonp('batchUpsert', { sheet:SH.INVENTORY, key:'item_code', rows: JSON.stringify(rows), user: JSON.stringify(CURRENT_USER||{}) });
  alert('保存しました'); refreshAll();
};
$("#invPrint").onclick = ()=> window.print();

// 完成品一覧
$("#finCreate").onclick = ()=>{
  const body = $("#finBody");
  const tr = document.createElement('tr');
  tr.innerHTML = `<td contenteditable data-k="fg_id"></td>
  <td contenteditable data-k="po_id"></td>
  <td contenteditable data-k="qty">0</td>
  <td contenteditable data-k="検査結果"></td>
  <td contenteditable data-k="status"></td>
  <td contenteditable data-k="updated_at"></td>
  <td contenteditable data-k="updated_by"></td>
  <td class="center"><button class="btn ghost btn-del">削除</button></td>`;
  body.prepend(tr);
};
$("#finImport").onchange = ()=> handleImport($("#finImport"), SH.FINISHED, "#finHead","#finBody",'fg_id');
$("#finExport").onclick = ()=> downloadCSV(`finished_${new Date().toISOString().slice(0,10)}.csv`, collectTableRows("#finHead","#finBody"));
$("#finSave").onclick = async ()=>{
  const rows = collectTableRows("#finHead","#finBody");
  await jsonp('batchUpsert', { sheet:SH.FINISHED, key:'fg_id', rows: JSON.stringify(rows), user: JSON.stringify(CURRENT_USER||{}) });
  alert('保存しました'); refreshAll();
};
$("#finPrint").onclick = ()=> window.print();

// 請求書
$("#invCreate2").onclick = ()=>{
  const body = $("#invBody2");
  const tr = document.createElement('tr');
  tr.innerHTML = `<td contenteditable data-k="inv_no"></td>
  <td contenteditable data-k="po_id"></td>
  <td contenteditable data-k="得意先"></td>
  <td contenteditable data-k="金額JPY">0</td>
  <td contenteditable data-k="発行日"></td>
  <td contenteditable data-k="担当"></td>
  <td contenteditable data-k="備考"></td>
  <td class="center"><button class="btn ghost btn-del">削除</button></td>`;
  body.prepend(tr);
};
$("#invImport2").onchange = ()=> handleImport($("#invImport2"), SH.INVOICES, "#invHead2","#invBody2",'inv_no');
$("#invExport2").onclick = ()=> downloadCSV(`invoices_${new Date().toISOString().slice(0,10)}.csv`, collectTableRows("#invHead2","#invBody2"));
$("#invSave2").onclick = async ()=>{
  const rows = collectTableRows("#invHead2","#invBody2");
  await jsonp('batchUpsert', { sheet:SH.INVOICES, key:'inv_no', rows: JSON.stringify(rows), user: JSON.stringify(CURRENT_USER||{}) });
  alert('保存しました');
};
$("#invPrint2").onclick = ()=> window.print();

/* ---------- Manual update dialog (tetap) ---------- */
function ensureManualDialog(){
  if($("#dlgManual")) return;
  const dlg = document.createElement("dialog");
  dlg.id="dlgManual"; dlg.className="paper";
  dlg.innerHTML = `
  <div class="body">
    <h3>工程 手動更新（PO: <span id="mPO"></span>）</h3>
    <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem">
      <div><div class="muted s">工程</div><select id="mProc"></select></div>
      <div><div class="muted s">状態</div>
        <select id="mStatus">
          <option value="進行">進行</option>
          <option value="組立中">組立中</option>
          <option value="組立済">組立済</option>
          <option value="検査中">検査中</option>
          <option value="検査済">検査済</option>
          <option value="出荷準備">出荷準備</option>
          <option value="出荷済">出荷済</option>
        </select>
      </div>
      <div style="grid-column:1 / -1"><div class="muted s">メモ</div><input id="mNote" placeholder="備考"></div>
    </div>
  </div>
  <footer class="row-end"><button class="btn ghost" id="mCancel">閉じる</button><button class="btn primary" id="mSave">保存</button></footer>`;
  document.body.appendChild(dlg);
  $("#mCancel").onclick=()=> $("#dlgManual").close();
  $("#mSave").onclick=saveManual;
}
function openManualDialog(po){
  ensureManualDialog();
  $("#mPO").textContent = po;
  const sel=$("#mProc"); sel.innerHTML="";
  PROCESS_LIST.forEach(p=>{ const o=document.createElement("option"); o.value=normalizeProc(p); o.textContent=normalizeProc(p); sel.appendChild(o); });
  $("#mStatus").value="進行"; $("#mNote").value=""; $("#dlgManual").showModal();
}
async function saveManual(){
  const po=$("#mPO").textContent, proc=normalizeProc($("#mProc").value), status=$("#mStatus").value, note=$("#mNote").value;
  await jsonp("setProcess", {
    po_id: po,
    updates: JSON.stringify({ current_process:proc, status, note }),
    user: JSON.stringify(CURRENT_USER||{})
  });
  $("#dlgManual").close(); await refreshAll();
}

/* ---------- Station QR ---------- */
$("#miStationQR")?.addEventListener("click", ()=>{
  const dlg = $("#dlgStationQR");
  const wrap = $("#qrWrap"); wrap.innerHTML = "";
  PROCESS_LIST.forEach(p=>{
    const box = document.createElement("div");
    box.style = "border:1px solid var(--border);padding:.6rem;border-radius:10px;display:flex;align-items:center;gap:.6rem";
    const qrDiv = document.createElement("div");
    qrDiv.style = "width:96px;height:96px";
    box.appendChild(qrDiv);
    const txt = document.createElement("div");
    txt.innerHTML = `<b>${normalizeProc(p)}</b><div class="muted s">ST:${normalizeProc(p)}</div>`;
    box.appendChild(txt);
    wrap.appendChild(box);
    new QRCode(qrDiv, { text:`ST:${normalizeProc(p)}`, width:96, height:96 });
  });
  dlg.showModal();
});

/* ---------- QR Camera Decode (jsQR) ---------- */
let scanStream=null, scanRaf=null;
async function startScan(){
  const video=$("#scanVideo"), canvas=$("#scanCanvas"), ctx=canvas.getContext('2d');
  if(scanStream){ stopScan(); }
  try{
    scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject = scanStream; await video.play();
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const loop = async ()=>{
      if(video.readyState===video.HAVE_ENOUGH_DATA){
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const img = ctx.getImageData(0,0,canvas.width,canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if(code && code.data){
          $("#scanResult").textContent = code.data;
          // payload: "ST:工程名" atau "PO:xxx:工程"
          const txt = code.data.trim();
          if(/^ST:/.test(txt)){
            const proc = txt.slice(3);
            const po = $("#scanPO").textContent.trim();
            if(po){
              await jsonp("setProcess", {
                po_id: po,
                updates: JSON.stringify({ current_process: normalizeProc(proc), status: '進行', note:'QR Scan' }),
                user: JSON.stringify(CURRENT_USER||{})
              });
              alert(`更新: ${po} → ${proc}`);
              refreshAll(); stopScan();
            }
          }else if(/^PO:/i.test(txt)){
            const parts = txt.split(':'); // PO:xxxx:工程名(opsional)
            const po = parts[1]; const proc = parts[2]||'';
            $("#scanPO").textContent = po;
            if(proc){
              await jsonp("setProcess", {
                po_id: po,
                updates: JSON.stringify({ current_process: normalizeProc(proc), status:'進行', note:'QR Scan' }),
                user: JSON.stringify(CURRENT_USER||{})
              });
              alert(`更新: ${po} → ${proc}`); refreshAll(); stopScan();
            }
          }
        }
      }
      scanRaf = requestAnimationFrame(loop);
    };
    loop();
  }catch(e){
    $("#scanResult").textContent = 'カメラ起動失敗: '+e;
  }
}
function stopScan(){
  if(scanRaf) cancelAnimationFrame(scanRaf), scanRaf=null;
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream=null; }
}
$("#btnScanStart").onclick = startScan;
$("#btnScanClose").onclick = ()=>{ stopScan(); $("#dlgScan").close(); };

function openScanDialog(po){
  $("#scanPO").textContent = po||'';
  $("#scanResult").textContent = '';
  $("#dlgScan").showModal();
}

/* ---------- Weather (no key) ---------- */
async function initWeather(){
  const cityEl=$("#wxCity"), iconEl=$("#wxIcon"), tempEl=$("#wxTemp");
  const iconFor = (code)=> code===0?'☀️':[1,2,3].includes(code)?'⛅':[45,48].includes(code)?'🌫️':[51,53,55,61,63,65,80,81,82].includes(code)?'🌧️':[95,96,99].includes(code)?'⛈️':'🌡️';
  try{
    let lat=35.6812, lon=139.7671, city="東京";
    if(navigator.geolocation){
      await new Promise((res)=> navigator.geolocation.getCurrentPosition(p=>{lat=p.coords.latitude;lon=p.coords.longitude;res();}, ()=>res(), {timeout:2500}));
    }
    try{
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ja`);
      if(r.ok){ const j = await r.json(); city = j.city || j.locality || j.principalSubdivision || "現在地"; }
    }catch(_){}
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
    const j = await w.json();
    const t = Math.round(j?.current?.temperature_2m ?? 0);
    const code = j?.current?.weather_code ?? -1;
    cityEl.textContent = city; iconEl.textContent = iconFor(code); tempEl.textContent = `${t}℃`;
  }catch(e){ cityEl.textContent = "取得失敗"; iconEl.textContent = "—"; tempEl.textContent = "--℃"; }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
  setUser(null);
  initWeather();
});

/* ---------- Flow helper: Orders -> Plan -> Dashboard -> Shipment ---------- */
/* Gunakan tombol Save di masing-masing page. Data otomatis tampil di Dashboard
   karena sumbernya sama (Sheet yang sama) dan dashboard refresh setelah Save. */
