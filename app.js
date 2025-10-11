/* =================================================
   JSONP Frontend
   - Dashboard status merge StatusLog
   - CRUD: 受注 / 生産計画 / 出荷予定
   - Import / Export / Print
   - QR scanner (jsQR)
   ================================================= */

/** GANTI dengan Web App URL (akhiran /exec) */
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
    s.src = `${API_BASE}?${qs(params)}`;
    window[cb] = (resp)=>{
      delete window[cb]; s.remove();
      if(resp && resp.ok) resolve(resp.data);
      else reject(new Error((resp && resp.error) || "API error"));
    };
    s.onerror = ()=>{ delete window[cb]; s.remove(); reject(new Error("JSONP load error")); };
    document.body.appendChild(s);
  });
}

/* ---------- Badges ---------- */
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

/* ---------- Auth & Role (sederhana) ---------- */
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
  ['btnToDash','btnToSales','btnToPlan','btnToShip','ddSetting'].forEach(id=> $("#"+id)?.classList.add("hidden"));
  if(!u){ $("#authView")?.classList.remove("hidden"); return; }
  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP['admin'];
  if(allow?.nav){
    if(allow.pages.includes('pageDash')) $("#btnToDash").classList.remove("hidden");
    if(allow.pages.includes('pageSales')) $("#btnToSales").classList.remove("hidden");
    if(allow.pages.includes('pagePlan')) $("#btnToPlan").classList.remove("hidden");
    if(allow.pages.includes('pageShip')) $("#btnToShip").classList.remove("hidden");
    $("#ddSetting").classList.remove("hidden");
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

/* ---------- Dashboard Orders ---------- */
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
        </div>
      </td>`;
    tb.appendChild(tr);
  }
  $$(".btn-scan",tb).forEach(b=> b.onclick=(e)=> openScanDialog(e.currentTarget.dataset.po));
}
async function refreshAll(){ await loadOrders(); }
$("#btnExportOrders").onclick = ()=> exportTableCSV("#tbOrders","orders.csv");

/* ---------- 受注 ---------- */
const SALES_FIELDS = [
  {name:'po_id', label:'注番', req:true},
  {name:'得意先', label:'得意先'},
  {name:'図番', label:'図番'},
  {name:'品名', label:'品名'},
  {name:'品番', label:'品番'},
  {name:'qty', label:'数量'},
  {name:'納期', label:'納期', type:'date'}
];
async function loadSales(){
  const dat = await jsonp("listSales");
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
  {name:'current_process', label:'工程(開始)', type:'select', options:["準備","シャッター溶接","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","出荷（組立済）"]},
  {name:'status', label:'状態', type:'select', options:["進行","組立中","組立済","検査中","検査済","出荷準備","出荷済"]},
  {name:'start_date', label:'開始日', type:'date'},
  {name:'due_date', label:'完了予定', type:'date'},
  {name:'note', label:'備考'}
];
async function loadPlans(){
  const dat = await jsonp("listPlans");
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
  const dat = await jsonp("listShip");
  renderTable(dat, "#thShip", "#tbShip", "#shipSearch");
}
$("#btnShipCreate").onclick = ()=> openForm("出荷予定 作成", SHIP_FIELDS, "saveShip", ()=> { loadShips(); });
$("#btnShipExport").onclick = ()=> exportTableCSV("#tbShip","shipments.csv");
$("#btnShipImport").onclick = ()=> importCSVtoSheet("bulkImportShip", ()=> loadShips());
$("#btnShipPrint").onclick  = ()=> window.print();

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
    if(x.type==='select'){
      input = `<select name="${x.name}">${(x.options||[]).map(o=>`<option value="${o}">${o}</option>`).join('')}</select>`;
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
      if(after) after(); // refresh
      if(api==="savePlan") await loadOrders(); // dashboard update
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
    dat.rows
      .filter(r => !q || JSON.stringify(r).toLowerCase().includes(q))
      .forEach(r=>{
        const tr = document.createElement('tr');
        tr.innerHTML = r.map(c=>`<td>${c??''}</td>`).join('');
        tb.appendChild(tr);
      });
  };
  search.oninput = render;
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
    const arr = XLSX.utils.sheet_to_json(ws, {header:1});
    // Kirim ke backend
    await jsonp(api, { rows: JSON.stringify(arr.slice(1)) });
    if(after) after();
  };
  input.click();
}

/* ---------- QR Scan ---------- */
let scanStream=null, scanRAF=null;
function openScanDialog(po){
  $("#scanResult").textContent = `PO: ${po}`;
  $("#dlgScan").showModal();
}
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
      if(code){ $("#scanResult").textContent = `QR: ${code.data}`; }
      scanRAF = requestAnimationFrame(tick);
    };
    tick();
  }catch(e){ alert("Camera error: "+e.message); }
};
$("#btnScanClose").onclick = ()=>{
  if(scanRAF) cancelAnimationFrame(scanRAF);
  if(scanStream) scanStream.getTracks().forEach(t=> t.stop());
  $("#dlgScan").close();
};

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", ()=> setUser(null));
