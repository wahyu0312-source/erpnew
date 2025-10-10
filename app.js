/* =================================================
   Frontend JSONP (bebas CORS) + login UI lebih besar
   ================================================= */

/** GANTI dengan Web App URL (akhiran /exec) */
const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

const PROCESS_LIST = [
  "準備","シャッター溶接","レザー加工","曲げ加工","外注加工/組立","組立","検査工程","出荷（組立済）"
];

/* ---------- DOM helpers ---------- */
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
    const url = `${API_BASE}?${qs(params)}`;
    const s = document.createElement("script");
    s.src = url;
    window[cb] = (resp)=>{
      delete window[cb]; s.remove();
      if(resp && resp.ok) resolve(resp.data);
      else reject(new Error(resp && resp.error || "API error"));
    };
    s.onerror = ()=>{
      delete window[cb]; s.remove();
      reject(new Error("JSONP load error"));
    };
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
$("#btnToSales").onclick=()=> show("pageSales");
$("#btnToPlan").onclick =()=> show("pagePlan");
$("#btnToShip").onclick =()=> show("pageShip");
$("#btnToInvPage").onclick=()=> show("pageInventory");
$("#btnToFinPage").onclick=()=> show("pageFinished");
$("#btnToInvoice").onclick=()=> show("pageInvoice");
$("#btnToCharts").onclick =()=> show("pageCharts");
$("#btnLogout").onclick  =()=> setUser(null);

/* ---------- Login (pakai JSONP) ---------- */
$("#btnLogin").onclick = async ()=>{
  const u = $("#inUser").value.trim();
  const p = $("#inPass").value.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");

  try{
    await jsonp('ping'); // sanity check
    const me = await jsonp("login", { username:u, password:p });
    setUser(me);
  }catch(e){
    console.error("[Login] error:", e);
    alert("ログイン失敗: " + (e?.message || e));
  }
};

/* ---------- Orders & Dashboard ---------- */
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

/* ---------- Manual update (pakai JSONP) ---------- */
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

/* ---------- Station QR (設定 → 工程QR) ---------- */
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
    // qrcodejs
    /* global QRCode */
    new QRCode(qrDiv, { text:`ST:${normalizeProc(p)}`, width:96, height:96 });
  });
  dlg.showModal();
});

/* ---------- Scanner dialog skeleton (optional to wire later) ---------- */
function openScanDialog(po){
  $("#scanPO").textContent = po;
  $("#dlgScan").showModal();
}
$("#btnScanClose")?.addEventListener("click", ()=> $("#dlgScan").close());

/* ---------- Weather (no key, Open-Meteo + reverse geocode) ---------- */
async function initWeather(){
  const cityEl=$("#wxCity"), iconEl=$("#wxIcon"), tempEl=$("#wxTemp");
  const iconFor = (code)=>{
    // Simple mapping
    if([0].includes(code)) return "☀️";
    if([1,2,3].includes(code)) return "⛅";
    if([45,48].includes(code)) return "🌫️";
    if([51,53,55,61,63,65,80,81,82].includes(code)) return "🌧️";
    if([56,57,66,67,71,73,75,77,85,86].includes(code)) return "🌨️";
    if([95,96,99].includes(code)) return "⛈️";
    return "🌡️";
  };
  try{
    // cari lokasi
    let lat=35.6812, lon=139.7671, city="東京";
    if(navigator.geolocation){
      await new Promise((res)=> {
        navigator.geolocation.getCurrentPosition(p=>{
          lat=p.coords.latitude; lon=p.coords.longitude; res();
        }, ()=>res(), {timeout:2500});
      });
    }
    // reverse geocode (tanpa key)
    try{
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ja`);
      if(r.ok){
        const j = await r.json();
        city = j.city || j.locality || j.principalSubdivision || "現在地";
      }
    }catch(_){}
    // weather
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
    const j = await w.json();
    const t = Math.round(j?.current?.temperature_2m ?? 0);
    const code = j?.current?.weather_code ?? -1;
    cityEl.textContent = city;
    iconEl.textContent = iconFor(code);
    tempEl.textContent = `${t}℃`;
  }catch(e){
    cityEl.textContent = "取得失敗";
    iconEl.textContent = "—";
    tempEl.textContent = "--℃";
  }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
  setUser(null);
  initWeather();
});
