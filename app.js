/* ===========================
   Tokyo Spring ERP Frontend
   =========================== */
const API_BASE = "https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec"; // << ganti URL Web App
const API_KEY  = ""; // optional jika kamu pakai kunci

// ======= PROSES MASTER (urut tampil & label chip) =======
const PROCESS_LIST = [
  "準備", "シャッター溶接", "レザー加工", "曲げ加工",
  "外作加工", "組立", "検査工程", "出荷（組立済）"
];

// ===== Utilities =====
const $  = (q,el=document)=> el.querySelector(q);
const $$ = (q,el=document)=> [...el.querySelectorAll(q)];
const qs = (o)=> Object.entries(o).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const fmt = (d)=> d? new Date(d).toLocaleString("ja-JP"):"";
const nz  = (n)=> isFinite(+n)? +n : 0;
const normalizeProc = (s)=>{
  s = String(s||"").trim();
  // typo: レーサ加工 → レザー加工
  return s.replace("レーサ加工","レザー加工") || "未設定";
};
const procToChip = (p)=>{
  p = normalizeProc(p);
  const ic = (i)=> `<i class="${i}"></i>`;
  if(/レザー加工|レーザー/.test(p))  return `<span class="chip p-laser">${ic("fa-solid fa-bolt")}${p}</span>`;
  if(/曲げ/.test(p))                return `<span class="chip p-bend">${ic("fa-solid fa-wave-square")}${p}</span>`;
  if(/プレス|打抜|外作/.test(p))     return `<span class="chip p-press">${ic("fa-solid fa-compass-drafting")}${p}</span>`;
  if(/組立/.test(p))                return `<span class="chip p-assembly">${ic("fa-solid fa-screwdriver-wrench")}${p}</span>`;
  if(/検査/.test(p))                return `<span class="chip p-inspection">${ic("fa-regular fa-square-check")}${p}</span>`;
  return `<span class="chip p-other">${ic("fa-regular fa-square")}${p}</span>`;
};
const statusToBadge = (s)=>{
  s = String(s||"").trim();
  const ic=(i)=>`<i class="${i}"></i>`;
  if(/NG|不良|異常|不適合/i.test(s)) return `<span class="badge st-ng">${ic('fa-solid fa-triangle-exclamation')}${s}</span>`;
  if(/OK|良|合格/i.test(s))         return `<span class="badge st-ok">${ic('fa-solid fa-check')}${s}</span>`;
  if(/出荷準備/.test(s))            return `<span class="badge st-ready">${ic('fa-solid fa-box-open')}${s}</span>`;
  if(/検査済/.test(s))              return `<span class="badge st-inspected">${ic('fa-regular fa-circle-check')}${s}</span>`;
  if(/出荷済/.test(s))              return `<span class="badge st-shipped">${ic('fa-solid fa-truck')}${s}</span>`;
  if(!s)                            return `<span class="badge st-other">${ic('fa-regular fa-clock')}—</span>`;
  return `<span class="badge st-other">${ic('fa-regular fa-clock')}${s}</span>`;
};

// ===== API =====
async function apiGet(action, params={}){
  const url = `${API_BASE}?${qs({action, ...params})}`;
  const r = await fetch(url, {method:"GET", mode:"cors", cache:"no-store"});
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||"API error");
  return j.data;
}
async function apiPost(action, payload={}){
  const r = await fetch(API_BASE, {
    method:"POST", mode:"cors",
    headers:{"Content-Type":"text/plain"},
    body: JSON.stringify({ action, apiKey:API_KEY, ...payload })
  });
  const j = await r.json();
  if(!j.ok) throw new Error(j.error||"API error");
  return j.data;
}

// ===== State / Auth =====
let CURRENT_USER = null;

function setUser(u){
  CURRENT_USER = u || null;
  $("#userInfo").textContent = u ? `${u.role} / ${u.department}` : "";
  const ids = ["btnToDash","btnToSales","btnToPlan","btnToShip","btnToInvPage","btnToFinPage","btnToInvoice","btnToCharts","ddSetting"];
  ids.forEach(id => u ? $("#"+id).classList.remove("hidden") : $("#"+id).classList.add("hidden"));

  // batasi menu "ユーザー追加" khusus admin
  if(u && u.role === "admin"){ $("#miAddUser").classList.remove("hidden"); }
  else { $("#miAddUser").classList.add("hidden"); }

  if(!u){ show("authView"); return; }
  show("pageDash");
  refreshAll();
}

// ===== NAV =====
function show(id){
  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip","pageInventory","pageFinished","pageInvoice","pageCharts"];
  pages.forEach(p => $("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}

$("#btnToDash").onclick = ()=>{ show("pageDash"); refreshAll(); };
$("#btnToSales").onclick = ()=> show("pageSales");
$("#btnToPlan").onclick  = ()=> show("pagePlan");
$("#btnToShip").onclick  = ()=> show("pageShip");
$("#btnToInvPage").onclick=()=> show("pageInventory");
$("#btnToFinPage").onclick=()=> show("pageFinished");
$("#btnToInvoice").onclick=()=> show("pageInvoice");
$("#btnToCharts").onclick =()=> show("pageCharts");

$("#btnLogout").onclick = ()=> setUser(null);

$("#btnLogin").onclick = async ()=>{
  const u = $("#inUser").value.trim();
  const p = $("#inPass").value.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");
  try{
    const me = await apiPost("login", { username:u, password:p });
    setUser(me);
  }catch(e){
    alert("ログイン失敗: "+e.message+"\n初回は admin / admin123 をお試しください。");
  }
};

// ====== Orders ======
let LAST_LOGS = {}; // {po_id: {ok_qty, ng_qty, process}}

async function loadOrders(){
  const list = await apiGet("listOrders");
  const q = ($("#searchQ").value||"").trim().toLowerCase();
  const rows = list.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));

  // Ambil OK/NG terakhir per PO (batch, cepat)
  const po_ids = rows.map(r=>r.po_id).filter(Boolean);
  LAST_LOGS = await apiPost("poLastLogs", { po_ids });

  const tb = $("#tbOrders"); tb.innerHTML = "";
  for(const r of rows){
    const po     = r.po_id || "";
    const cust   = r["得意先"] || "";
    const hin    = r["品名"]  || "—";
    const part   = r["品番"]  || "—";
    const zuban  = r["図番"]  || "—";
    const status = statusToBadge(r.status);
    const proc   = procToChip(r.current_process);
    const upd    = fmt(r.updated_at);
    const by     = r.updated_by || "—";
    const last   = LAST_LOGS[po] || {};
    const inProc = normalizeProc(r.current_process||"");
    const okng   = (last.process===inProc) ? ` <span class="muted s">(OK:${nz(last.ok_qty)} / NG:${nz(last.ng_qty)})</span>` : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="s muted">注番</div>
        <div><b>${po}</b></div>
        <div class="muted s">${cust||"—"}</div>
      </td>
      <td>${hin}</td>
      <td class="center">${part}</td>
      <td class="center">${zuban}</td>
      <td class="center">${status}</td>
      <td class="center">${proc}${okng}</td>
      <td class="center">${upd||"—"}</td>
      <td class="center">${by}</td>
      <td class="center">
        <div class="row">
          <button class="btn ghost btn-scan"  data-po="${po}"><i class="fa-solid fa-qrcode"></i> スキャン</button>
          <button class="btn ghost btn-manual" data-po="${po}"><i class="fa-regular fa-pen-to-square"></i> 手動更新</button>
          <button class="btn ghost btn-history"data-po="${po}"><i class="fa-regular fa-clock"></i> 更新</button>
        </div>
      </td>
    `;
    tb.appendChild(tr);
  }

  // actions
  $$(".btn-scan", tb).forEach(b => b.onclick   = (e)=> openScanDialog(e.currentTarget.dataset.po));
  $$(".btn-history", tb).forEach(b => b.onclick= (e)=> openHistory(e.currentTarget.dataset.po));
  $$(".btn-manual", tb).forEach(b => b.onclick = (e)=> openManualDialog(e.currentTarget.dataset.po));
}
$("#searchQ").oninput = ()=> loadOrders();

// ===== Dashboard =====
async function loadStats(){
  // snapshot lokasi (kembalikan semua proses dengan nol jika tidak ada)
  const snap = await apiGet("locSnapshotAll");
  const grid = $("#gridProc"); grid.innerHTML = "";
  PROCESS_LIST.forEach(p=>{
    const c = nz(snap[normalizeProc(p)]);
    const chip = document.createElement("span");
    chip.innerHTML = procToChip(p)+`<span class="muted s" style="margin-left:.35rem">${c}</span>`;
    grid.appendChild(chip);
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
    div.innerHTML = `<div class="row">
      <span class="badge st-ready"><i class="fa-solid fa-truck"></i>${(x.scheduled_date||"").slice(0,10)}</span>
      <b style="margin-left:.4rem">${x.po_id}</b> × ${x.qty||0}
    </div>`;
    ul.appendChild(div);
  });
}

async function refreshAll(){ await Promise.all([loadOrders(), loadStats()]); }
$("#btnRefresh").onclick = refreshAll;

// ===== Scan dialog (QR per station) =====
let _scanStream=null, _scanTimer=null;
function openScanDialog(po){
  $("#dlgScan").showModal();
  $("#scanPO").textContent = po;
  $("#scanResult").textContent = "";
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
      const code = jsQR(img.data, w, h);
      if(code && code.data){
        const text = String(code.data||"").trim();
        $("#scanResult").textContent = text;
        if(/^ST:/i.test(text)){
          const proc = normalizeProc(text.replace(/^ST:/i,"").trim());
          const po = $("#scanPO").textContent;
          await apiPost("setProcess",{ po_id:po, updates:{ current_process:proc, status:"進行", note:"scan" }, user:CURRENT_USER });
          stopScan();
          await refreshAll();
        }
      }
    }, 350);
  }catch(e){ $("#scanResult").textContent = "カメラ不可: "+e.message; }
}
function stopScan(){
  if(_scanTimer){ clearInterval(_scanTimer); _scanTimer=null; }
  if(_scanStream){ _scanStream.getTracks().forEach(t=>t.stop()); _scanStream=null; }
  $("#dlgScan").close();
}

// ===== Manual dialog (工程 + OK/NG) =====
function ensureManualDialog(){
  if($("#dlgManual")) return;
  const dlg = document.createElement("dialog");
  dlg.id = "dlgManual";
  dlg.className = "paper";
  dlg.innerHTML = `
    <div class="body">
      <h3>工程 手動更新（PO: <span id="mPO"></span>）</h3>
      <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem">
        <div>
          <div class="muted s">工程</div>
          <select id="mProc"></select>
        </div>
        <div>
          <div class="muted s">状態</div>
          <select id="mStatus">
            <option value="進行">進行</option>
            <option value="検査済">検査済</option>
            <option value="出荷準備">出荷準備</option>
            <option value="出荷済">出荷済</option>
            <option value="OK">OK</option>
            <option value="NG">NG</option>
          </select>
        </div>
        <div>
          <div class="muted s">OK 数</div>
          <input id="mOK" type="number" min="0" value="0">
        </div>
        <div>
          <div class="muted s">NG 数</div>
          <input id="mNG" type="number" min="0" value="0">
        </div>
        <div style="grid-column:1 / -1">
          <div class="muted s">メモ</div>
          <input id="mNote" placeholder="備考">
        </div>
      </div>
    </div>
    <footer class="row-end">
      <button class="btn ghost" id="mCancel">閉じる</button>
      <button class="btn primary" id="mSave">保存</button>
    </footer>
  `;
  document.body.appendChild(dlg);
  $("#mCancel").onclick = ()=> $("#dlgManual").close();
  $("#mSave").onclick   = saveManual;
}
function openManualDialog(po){
  ensureManualDialog();
  $("#mPO").textContent = po;
  const sel = $("#mProc"); sel.innerHTML="";
  PROCESS_LIST.forEach(p=>{
    const opt = document.createElement("option");
    opt.value = p; opt.textContent = p;
    sel.appendChild(opt);
  });
  $("#mStatus").value = "進行";
  $("#mOK").value = 0; $("#mNG").value = 0; $("#mNote").value="";
  $("#dlgManual").showModal();
}
async function saveManual(){
  const po = $("#mPO").textContent;
  const proc = normalizeProc($("#mProc").value);
  const status = $("#mStatus").value;
  const ok = nz($("#mOK").value); const ng = nz($("#mNG").value);
  const note = $("#mNote").value;
  await apiPost("setProcess",{
    po_id:po,
    updates:{ current_process:proc, status, ok_qty:ok, ng_qty:ng, note },
    user:CURRENT_USER
  });
  $("#dlgManual").close();
  await refreshAll();
}

// ===== History =====
async function openHistory(po){
  const rows = await apiGet("history",{ po_id:po });
  const body = $("#histBody"); body.innerHTML="";
  rows.forEach(r=>{
    const div = document.createElement("div");
    div.className="row";
    div.innerHTML = `
      <span class="badge">${fmt(r.timestamp)||""}</span>
      ${statusToBadge(r.new_status)} ${procToChip(r.new_process)}
      <span class="muted s">OK:${nz(r.ok_qty)} / NG:${nz(r.ng_qty)}</span>
      <span class="muted s">${r.updated_by||""}</span>
    `;
    body.appendChild(div);
  });
  $("#dlgHistory").showModal();
}

// ===== 出荷予定 (tetap sederhana) =====
$("#btnSchedule").onclick = async ()=>{
  const po = $("#s_po").value.trim(), date = $("#s_date").value, qty = nz($("#s_qty").value);
  if(!po || !date) return alert("注番 と 日付 を入力してください");
  await apiPost("scheduleShipment",{ po_id:po, dateIso:date, qty, user:CURRENT_USER });
  $("#s_po").value=""; $("#s_date").value=""; $("#s_qty").value="";
  await loadStats();
  alert("出荷予定を登録しました");
};

// ===== Init =====
document.addEventListener("DOMContentLoaded", ()=>{
  setUser(null); // mulai di halaman login
});
