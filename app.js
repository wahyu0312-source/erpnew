/* ===========================
   Tokyo Spring ERP Frontend
   =========================== */

/** GANTI dengan URL Web App milikmu (akhiran /exec) */
const API_BASE = "https://script.google.com/macros/s/AKfycbzJ9jjDqmVewFXqSNICorVUN9s_D7_T154L0k256ebqUE2TTCEwWF5eNwRJ7ZXThc6H/exec";
const API_KEY  = ""; // optional jika dipakai

// ===== Master Proses (rename 外作加工 → 外注加工/組立) =====
const PROCESS_LIST = [
  "準備","シャッター溶接","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","出荷（組立済）"
];

// ===== Utilities =====
const $  = (q,el=document)=> el.querySelector(q);
const $$ = (q,el=document)=> [...el.querySelectorAll(q)];
const qs = (o)=> Object.entries(o).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const fmt = (d)=> d? new Date(d).toLocaleString("ja-JP"):"";
const nz  = (n)=> isFinite(+n)? +n : 0;

const normalizeProc = (s)=>{
  s = String(s||"").trim();
  return s.replace("レーサ加工","レザー加工").replace("外作加工","外注加工/組立") || "未設定";
};

// badges
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

// ===== API helpers (GET/POST) =====
async function apiGet(action, params={}){
  const url = `${API_BASE}?${qs({action, ...params})}`;
  const r = await fetch(url, {method:"GET", mode:"cors", cache:"no-store"});
  if(!r.ok){ throw new Error(`HTTP ${r.status}`); }
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||"API error");
  return j.data;
}
async function apiPost(action, payload={}){
  const r = await fetch(API_BASE, {
    method:"POST", mode:"cors",
    headers:{
      "Content-Type":"text/plain"
    },
    body: JSON.stringify({ action, apiKey:API_KEY, ...payload })
  });
  if(!r.ok){ throw new Error(`HTTP ${r.status}`); }
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||"API error");
  return j.data;
}

// ===== Auth & Role =====
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

  const nav = ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToInvPage','btnToFinPage','btnToInvoice','btnToCharts','ddSetting'];
  nav.forEach(id=> $("#"+id)?.classList.add("hidden"));

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

// ===== Nav
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

// ===== Login (dengan debug)
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
    alert("ログイン失敗: " + e.message + "\n(1) API_BASE? (2) Web Appの公開設定? (3) CORS/OPTIONS?");
  }
};

// ===== Orders
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
$("#searchQ").oninput = ()=> loadOrders();

// ===== Dashboard stats
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

// ===== 工程QR (list & print)
$("#miStationQR")?.addEventListener("click", ()=>{
  const wrap = $("#qrWrap"); wrap.innerHTML="";
  const dlg = $("#dlgStationQR");
  PROCESS_LIST.forEach(p=>{
    const box = document.createElement("div");
    box.style.gridColumn = "span 3"; box.style.display="flex"; box.style.flexDirection="column";
    box.style.alignItems="center"; box.style.justifyContent="center"; box.style.padding=".5rem";
    box.style.border="1px solid var(--border)"; box.style.borderRadius="12px";
    const el = document.createElement("div");
    new QRCode(el, { text:`ST:${normalizeProc(p)}`, width:128, height:128 });
    const cap = document.createElement("div"); cap.style.marginTop=".5rem"; cap.innerHTML = `<b>${normalizeProc(p)}</b>`;
    box.appendChild(el); box.appendChild(cap); wrap.appendChild(box);
  });
  dlg.showModal();
});

// ===== Scan dialog
let _scanStream=null,_scanTimer=null;
function openScanDialog(po){
  $("#dlgScan").showModal(); $("#scanPO").textContent = po; $("#scanResult").textContent = "";
}
$("#btnScanClose").onclick = stopScan;
$("#btnScanStart").onclick = startScan;
async function startScan(){
  const video=$("#scanVideo"), canvas=$("#scanCanvas");
  try{
    _scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
    video.srcObject = _scanStream; await video.play();
    _scanTimer = setInterval(async ()=>{
      const w=video.videoWidth, h=video.videoHeight; if(!w||!h) return;
      canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext("2d"); ctx.drawImage(video,0,0,w,h);
      const img=ctx.getImageData(0,0,w,h);
      const code = jsQR(img.data,w,h);
      if(code?.data){
        const text = String(code.data).trim();
        $("#scanResult").textContent = text;
        if(/^ST:/i.test(text)){
          const proc = normalizeProc(text.replace(/^ST:/i,"").trim());
          const po = $("#scanPO").textContent;
          await apiPost("setProcess",{ po_id:po, updates:{ current_process:proc, status:"進行", note:"scan" }, user:CURRENT_USER });
          stopScan(); await refreshAll();
        }
      }
    },350);
  }catch(e){ $("#scanResult").textContent = "カメラ不可: "+e.message; }
}
function stopScan(){
  if(_scanTimer){ clearInterval(_scanTimer); _scanTimer=null; }
  if(_scanStream){ _scanStream.getTracks().forEach(t=>t.stop()); _scanStream=null; }
  $("#dlgScan").close();
}

// ===== Manual dialog
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
  await apiPost("setProcess",{ po_id:po, updates:{ current_process:proc, status, note }, user:CURRENT_USER });
  $("#dlgManual").close(); await refreshAll();
}

// ===== Export helpers (contoh singkat)
function downloadCSV(filename, rows){
  const csv = rows.map(r => r.map(v=>{
    v = (v==null? "" : String(v));
    if(/[,"\n]/.test(v)) v = `"${v.replace(/"/g,'""')}"`;
    return v;
  }).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"}); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}
$("#btnExportOrders")?.addEventListener("click", ()=>{
  const rows = [["PO","得意先","品名","品番","図番","状態","工程","更新日時","更新者"]];
  $$("#tbOrders tr").forEach(tr=>{
    const tds = tr.querySelectorAll("td");
    if(!tds.length) return;
    rows.push([
      tds[0].innerText.split("\n")[1]?.trim()||"",
      tds[0].innerText.split("\n")[2]?.trim()||"",
      tds[1].innerText.trim(), tds[2].innerText.trim(), tds[3].innerText.trim(),
      tds[4].innerText.trim(), tds[5].innerText.trim(), tds[6].innerText.trim(), tds[7].innerText.trim()
    ]);
  });
  downloadCSV(`orders_${Date.now()}.csv`, rows);
});

// ===== Init
document.addEventListener("DOMContentLoaded", ()=> setUser(null));
