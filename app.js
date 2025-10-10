/* ===========================
   Tokyo Spring ERP Frontend
   CORS-safe + bigger login
   =========================== */

/** GANTI dengan URL Web App terbaru (akhiran /exec) */
const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";
const API_KEY  = ""; // optional

const PROCESS_LIST = [
  "準備","シャッター溶接","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","出荷（組立済）"
];

const $  = (q,el=document)=> el.querySelector(q);
const $$ = (q,el=document)=> [...el.querySelectorAll(q)];
const qs = (o)=> Object.entries(o).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const fmt = (d)=> d? new Date(d).toLocaleString("ja-JP"):"";
const nz  = (n)=> isFinite(+n)? +n : 0;
const normalizeProc = (s)=> String(s||"").trim().replace("レーサ加工","レザー加工").replace("外作加工","外注加工/組立") || "未設定";

const procToChip = (p)=>{
  p = normalizeProc(p);
  const ic=(i)=>`<i class="${i}"></i>`;
  if(/レザー加工|レーザー/.test(p)) return `<span class="chip p-laser">${ic("fa-solid fa-bolt")}${p}</span>`;
  if(/曲げ/.test(p)) return `<span class="chip p-bend">${ic("fa-solid fa-wave-square")}${p}</span>`;
  if(/外注加工|加工/.test(p)) return `<span class="chip p-press">${ic("fa-solid fa-compass-drafting")}${p}</span>`;
  if(/組立/.test(p)) return `<span class="chip p-assembly">${ic("fa-solid fa-screwdriver-wrench")}${p}</span>`;
  if(/検査/.test(p)) return `<span class="chip p-inspection">${ic("fa-regular fa-square-check")}${p}</span>`;
  return `<span class="chip p-other"><i class="fa-regular fa-square"></i>${p}</span>`;
};
const statusToBadge = (s)=>{
  s = String(s||"");
  const ic=(i)=>`<i class="${i}"></i>`;
  if(/組立中/.test(s)) return `<span class="badge">${ic('fa-solid fa-screwdriver-wrench')}${s}</span>`;
  if(/組立済/.test(s)) return `<span class="badge">${ic('fa-regular fa-circle-check')}${s}</span>`;
  if(/検査中/.test(s)) return `<span class="badge st-inspected">${ic('fa-regular fa-clipboard')}${s}</span>`;
  if(/検査済/.test(s)) return `<span class="badge st-inspected">${ic('fa-regular fa-circle-check')}${s}</span>`;
  if(/出荷準備/.test(s)) return `<span class="badge st-ready">${ic('fa-solid fa-box-open')}${s}</span>`;
  if(/出荷済/.test(s)) return `<span class="badge st-shipped">${ic('fa-solid fa-truck')}${s}</span>`;
  return `<span class="badge">${ic('fa-regular fa-clock')}${s||"—"}</span>`;
};

// --- API helpers (GET/POST) ---
async function apiGet(action, params={}){
  const url = `${API_BASE}?${qs({action, ...params})}`;
  const r = await fetch(url, { method:"GET" });     // simple request (tanpa header custom)
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||"API error");
  return j.data;
}
async function apiPost(action, payload={}){
  const r = await fetch(API_BASE, {
    method:"POST",
    headers:{ "Content-Type":"text/plain" },       // simple, tanpa preflight
    body: JSON.stringify({ action, apiKey:API_KEY, ...payload })
  });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||"API error");
  return j.data;
}

// --- Auth & Role ---
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

// --- Nav ---
function show(id){
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageInventory","pageFinished","pageInvoice","pageCharts"].forEach(p=>$("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}
$("#btnToDash").onclick=()=>{ show("pageDash"); refreshAll(); };
$("#btnToSales").onclick=()=> show("pageSales");
$("#btnToPlan").onclick =()=> show("pagePlan");
$("#btnToShip").onclick =()=> show("pageShip");
$("#btnToInvPage").onclick=()=> show("pageInventory");
$("#btnToFinPage").onclick=()=> show("pageFinished");
$("#btnToInvoice").onclick=()=> show("pageInvoice");
$("#btnToCharts").onclick =()=> show("pageCharts");
$("#btnLogout").onclick  =()=> setUser(null);

// --- Login (dengan debug jelas) ---
$("#btnLogin").onclick = async ()=>{
  const u = $("#inUser").value.trim();
  const p = $("#inPass").value.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");
  try{
    console.log("[Login] API_BASE =", API_BASE);
    const me = await apiPost("login", { username:u, password:p });
    console.log("[Login] OK", me);
    setUser(me);
  }catch(e){
    console.error("[Login] error:", e);
    alert("ログイン失敗: " + (e?.message || e) + "\n(1) API_BASE? (2) Web Appの公開設定? (3) CORS/OPTIONS?");
  }
};

// --- Orders & Dash (ringkas, sama seperti versi sebelumnya) ---
async function loadOrders(){
  const list = await apiGet("listOrders");
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
  const snap = await apiGet("locSnapshotAll");
  const grid = $("#gridProc"); grid.innerHTML = "";
  PROCESS_LIST.forEach(p=>{
    const name = normalizeProc(p);
    const c = snap[name] || 0;
    const span = document.createElement("span");
    span.innerHTML = procToChip(name)+`<span class="muted s" style="margin-left:.35rem">${c}</span>`;
    grid.appendChild(span);
  });
  const s = await apiGet("stock");
  $("#statFinished").textContent = s.finishedStock ?? 0;
  $("#statReady").textContent    = s.ready ?? 0;
  $("#statShipped").textContent  = s.shipped ?? 0;

  const today = await apiGet("todayShip");
  const ul = $("#listToday"); ul.innerHTML="";
  if(!today.length){ ul.innerHTML = `<div class="muted s">なし</div>`; }
  else today.forEach(x=>{
    const div = document.createElement("div");
    div.innerHTML = `<div class="row"><span class="badge st-ready"><i class="fa-solid fa-truck"></i>${(x.scheduled_date||"").slice(0,10)}</span><b style="margin-left:.4rem">${x.po_id}</b> × ${x.qty||0}</div>`;
    ul.appendChild(div);
  });
}
async function refreshAll(){ await Promise.all([loadOrders(), loadStats()]); }
$("#btnRefresh").onclick = refreshAll;

// --- Dialog scan / manual (sama seperti versi sebelumnya) ---
/* ... (biarkan sesuai file kirimanku sebelumnya; tidak memengaruhi login) ... */

// Init
document.addEventListener("DOMContentLoaded", ()=> setUser(null));
