/* ===== ERP Frontend (final) ===== */

/* ---- Config ---- */
var API_BASE = "https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec"; // /exec web app
var API_KEY  = ""; // optional

/* ---- Helpers ---- */
function $(q){ return document.querySelector(q); }
function el(tag, attrs={}, children=[]){
  const n=document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=> (k==="class")? n.className=v : n.setAttribute(k,v));
  (Array.isArray(children)?children:[children]).forEach(c=> n.appendChild(typeof c==="string"? document.createTextNode(c): c));
  return n;
}
function qs(obj){ return Object.keys(obj).map(k=> encodeURIComponent(k)+"="+encodeURIComponent(obj[k])).join("&"); }
function apiGet(p){ return fetch(API_BASE+"?"+qs(p)).then(r=>r.json()).then(j=>{ if(!j.ok) throw (j.error||"HTTP"); return j.data; }); }
function apiPost(action, body){
  body = body || {};
  return fetch(API_BASE, {
    method:"POST",
    headers:{ "Content-Type":"text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ action, apiKey:API_KEY }, body))
  }).then(r=>r.json()).then(j=>{ if(!j.ok) throw (j.error||"HTTP"); return j.data; });
}

/* ---- State ---- */
var SESSION = null;
var CURRENT_PO = null;
var scanStream = null, scanTimer = null;

/* ---- Proses master ---- */
const PROCESSES = [
  "レーザ加工","曲げ加工","外枠組立","シャッター組立","シャッター溶接",
  "コーキング","外枠塗装","組立（組立中）","組立（組立済）","外注","検査工程"
];

/* ---- Station rules (normalize QR) ---- */
var STATION_RULES = {
  "レーザ加工":     o=>({ current_process:"レーザ加工" }),
  "曲げ工程":       o=>({ current_process:"曲げ加工" }),
  "曲げ加工":       o=>({ current_process:"曲げ加工" }),
  "外枠組立":       o=>({ current_process:"外枠組立" }),
  "ｼｬｯﾀｰ組立":     o=>({ current_process:"シャッター組立" }),
  "シャッター組立": o=>({ current_process:"シャッター組立" }),
  "シャッター溶接": o=>({ current_process:"シャッター溶接" }),
  "コーキング":     o=>({ current_process:"コーキング" }),
  "外枠塗装":       o=>({ current_process:"外枠塗装" }),
  "組立工程":       o=> (o.current_process==="組立（組立中）"? {current_process:"組立（組立済）"}:{current_process:"組立（組立中）"}),
  "検査工程":       o=>({ current_process:"検査工程" }),
  "出荷工程":       o=>({ status:"出荷準備" })
}; // basis dari berkas awalmu, dirapikan & diperluas. :contentReference[oaicite:4]{index=4}

/* ---- Auth ---- */
function onLogin(){
  const username = ($("#inUser")||{}).value||"";
  const password = ($("#inPass")||{}).value||"";
  const remember = ($("#inRemember")||{}).checked||false;

  apiPost("login",{ username,password })
    .then(u=>{
      SESSION=u;
      if(remember) localStorage.setItem("session", JSON.stringify(u));
      const ui=$("#userInfo"); if(ui) ui.textContent=(u.full_name||u.username)+" / "+(u.department||u.role||"");
      show("pageDash");
      refreshAll(true);
    })
    .catch(e=> alert(e));
}
function onLogout(){
  localStorage.removeItem("session");
  SESSION=null;
  const ui=$("#userInfo"); if(ui) ui.textContent="";
  show("authView");
}

/* ---- Nav ---- */
function show(id){
  ["authView","pageDash","pageCharts"].forEach(v=>{
    const el=$("#"+v); if(el) el.classList.add("hidden");
  });
  const v=$("#"+id); if(v) v.classList.remove("hidden");

  ["#btnToDash","#btnToCharts","#btnLogout"].forEach(sel=>{
    const b=$(sel); if(!b) return;
    if(id==="authView") b.classList.add("hidden"); else b.classList.remove("hidden");
  });
}
function wireNav(){
  let b;
  b=$("#btnToDash");   if(b) b.addEventListener("click", ()=> show("pageDash"));
  b=$("#btnToCharts"); if(b) b.addEventListener("click", ()=>{ show("pageCharts"); renderCharts(); });
  b=$("#btnLogout");   if(b) b.addEventListener("click", onLogout);
}

/* ---- Dashboard: Orders table ---- */
function badgeProcess(p){
  const map = {
    "レーザ加工":"prc-laser","曲げ加工":"prc-bend","外枠組立":"prc-frame","シャッター組立":"prc-shassy",
    "シャッター溶接":"prc-shweld","コーキング":"prc-caulk","外枠塗装":"prc-tosou","組立（組立中）":"prc-asm-in",
    "組立（組立済）":"prc-asm-ok","外注":"prc-out","検査工程":"prc-inspect"
  };
  const cls = map[p]||"";
  return `<span class="badge ${cls}"><span class="dot"></span>${p||'-'}</span>`;
}
function badgeStatus(s){
  const cls = s==="出荷済"?"st-shipped":
              s==="出荷準備"?"st-ready":
              s==="停止"?"st-hold":
              s==="検査中"?"st-inspect":
              s==="不良"?"st-ng":"st-begin";
  return `<span class="badge ${cls}"><span class="dot"></span>${s||'-'}</span>`;
}
function loadOrders(){
  const q = ($("#qOrders")||{}).value||"";
  return apiGet({ action:"listOrders", q })
    .then(rows=>{
      // snapshot ringan
      $("#ssTickets").textContent = rows.length;
      // ssOk/ssNg dihitung dari log via charts endpoint (diambil saat renderCharts)
      const tb=$("#tbodyOrders"); if(!tb) return;
      tb.innerHTML = "";

      rows.forEach(r=>{
        const tr = el("tr",{},[
          el("td",{},r.po_id||""),
          el("td",{},r["得意先"]||""),
          el("td",{},r["図番"]||""),
          el("td",{},r["品番"]||""),
          el("td",{},r["品名"]||""),
          el("td",{},String(r["数量"]||"")),
          el("td",{class:"col-proc"},[el("span",{class:"nowrap",innerHTML:badgeProcess(r.current_process)},[])]),
          el("td",{class:"col-status"},[el("span",{class:"nowrap",innerHTML:badgeStatus(r.status)},[])]),
          el("td",{},[
            el("div",{class:"actions-2col"},[
              el("button",{class:"btn ghost s", title:"更新", onclick:()=> openUpdateDialog(r.po_id,r)},[el("i",{class:"fa-solid fa-pen-to-square"})]),
              el("button",{class:"btn ghost s", title:"スキャン", onclick:()=> startScanFor(r.po_id)},[el("i",{class:"fa-solid fa-qrcode"})])
            ])
          ])
        ]);
        tb.appendChild(tr);
      });
    });
}

/* ---- Manual 更新 dialog ---- */
function fillProcessOptions(sel, current){
  sel.innerHTML="";
  PROCESSES.forEach(p=>{
    const o=el("option",{value:p},p);
    if(p===current) o.selected=true;
    sel.appendChild(o);
  });
}
function openUpdateDialog(po_id, row){
  CURRENT_PO = po_id;
  $("#updPO").textContent = po_id;
  fillProcessOptions($("#updProcess"), row.current_process||"");
  $("#updOk").value = "";
  $("#updNg").value = "";
  $("#updNote").value = "";
  $("#dlgUpdate").showModal();
}
function saveUpdate(){
  const po = CURRENT_PO; if(!po) return;
  const payload = {
    current_process: ($("#updProcess")||{}).value||"",
    ok_qty: Number(($("#updOk")||{}).value||0),
    ng_qty: Number(($("#updNg")||{}).value||0),
    note: ($("#updNote")||{}).value||""
  };
  apiPost("setProcess", { po_id:po, updates:payload, user:SESSION })
    .then(()=>{ $("#dlgUpdate").close(); refreshAll(true); alert("更新しました"); })
    .catch(e=> alert(e));
}

/* ---- QR scan/update ---- */
function startScanFor(po){ CURRENT_PO = po; $("#scanPO").textContent=po; $("#dlgScan").showModal(); }
function initScan(){
  const video=$("#scanVideo"), canvas=$("#scanCanvas"), result=$("#scanResult");
  if(!video || !canvas) return;
  navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } })
    .then(stream=>{
      scanStream=stream; video.srcObject=stream; return video.play();
    })
    .then(()=>{
      const ctx = canvas.getContext("2d");
      scanTimer = setInterval(()=>{
        if(video.readyState!==video.HAVE_ENOUGH_DATA) return;
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const img = ctx.getImageData(0,0,canvas.width,canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if(code && code.data){
          result.textContent = "読み取り: " + code.data;
          onScanToken(code.data).finally(()=>{
            stopScan(); $("#dlgScan").close();
          });
        }
      }, 280);
    })
    .catch(e=> alert("カメラ起動不可: "+(e.message||e)));
}
function stopScan(){
  if(scanTimer){ clearInterval(scanTimer); scanTimer=null; }
  if(scanStream){ try{ scanStream.getTracks().forEach(t=>t.stop()); }catch(_e){} scanStream=null; }
}
function onScanToken(token){
  const parts = String(token).split(":");
  const prefix = parts[0], station = parts[1];
  if(prefix!=="ST" || !station){ alert("QR無効"); return Promise.resolve(); }
  if(!CURRENT_PO){ alert("PO未選択"); return Promise.resolve(); }

  return apiGet({ action:"ticket", po_id:CURRENT_PO })
    .then(o=>{
      const rule = STATION_RULES[station] || (_=>({ current_process:station }));
      const updates = rule(o) || {};
      const okQty = Number(($("#inOkQty")||{}).value||0);
      const ngQty = Number(($("#inNgQty")||{}).value||0);
      const note  = ($("#inNote")||{}).value||"";
      return apiPost("setProcess",{ po_id:CURRENT_PO, updates:Object.assign({},updates,{ ok_qty:okQty, ng_qty:ngQty, note }), user:SESSION });
    })
    .then(()=>{ alert("更新しました"); refreshAll(true); });
}

/* ---- Station QR generator ---- */
function buildStationQRMenu(){
  const m = $("#stationQrMenu"); if(!m) return;
  m.innerHTML = "";
  PROCESSES.forEach(st=>{
    const btn = el("button",{class:"menu-item",onclick:()=> openStationQR(st)},[
      el("i",{class:"fa-solid fa-qrcode"}), document.createTextNode(st)
    ]);
    m.appendChild(btn);
  });
}
function openStationQR(station){
  $("#qrStationName").textContent = station;
  const box = $("#qrBox"); box.innerHTML="";
  new QRCode(box, { text:"ST:"+station, width:220, height:220, correctLevel: QRCode.CorrectLevel.M });
  $("#dlgStationQR").showModal();
}

/* ---- Charts ---- */
function drawBar(id, data){
  const el = $("#"+id); if(!el) return;
  if(el._chart) { el._chart.destroy(); }
  el._chart = new Chart(el, { type:"bar", data, options:{ responsive:true, maintainAspectRatio:false }});
}
function renderCharts(){
  return apiGet({ action:"charts" })
    .then(d=>{
      drawBar("chWipProc", { labels:Object.keys(d.wipByProcess||{}), datasets:[{ label:"点数", data:Object.values(d.wipByProcess||{}) }] });
      drawBar("chPlan",     { labels:[..."123456789101112"].map((_,i)=> (i+1)+""), datasets:[{ label:"件数", data:d.planPerMonth||[] }] });
      drawBar("chSales",    { labels:[..."123456789101112"].map((_,i)=> (i+1)+""), datasets:[{ label:"受注", data:d.salesPerMonth||[] }] });
      drawBar("chDefects",  { labels:Object.keys(d.defectByProcess||{}), datasets:[{ label:"不良品 数量", data:Object.values(d.defectByProcess||{}) }] });
      // update snapshot OK/NG (agregat dari charts)
      const totalNg = Object.values(d.defectByProcess||{}).reduce((a,b)=>a+(+b||0),0);
      $("#ssNg").textContent = totalNg;
      // heuristic OK: sum plan or WIP? kita tampilkan total jumlah 数量 dari orders sebagai pendekatan → ambil saat loadOrders bila perlu
    });
}

/* ---- Import/Export (SheetJS) ---- */
function exportOrdersXlsx(){
  apiGet({ action:"listOrders", q:($("#qOrders")||{}).value||"" })
    .then(rows=>{
      // mapping header JP untuk template import
      const data = rows.map(r=>({
        "得意先": r["得意先"]||"", "図番": r["図番"]||"", "機種": r["品番"]||"", "商品名": r["品名"]||"",
        "数量": r["数量"]||"", "注番": r.po_id||"", "備考": r["備考"]||""
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "現品票");
      XLSX.writeFile(wb, "orders_export.xlsx");
    });
}
function importOrdersFromFile(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    const wb = XLSX.read(e.target.result, { type:"binary" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval:"" });
    // kirim ke backend menggunakan header JP yang diminta endpoint
    apiPost("importOrders", { rows, user:SESSION })
      .then(()=>{ alert("Import 完了"); refreshAll(true); })
      .catch(e=> alert(e));
  };
  reader.readAsBinaryString(file);
}

/* ---- Refresh ---- */
function refreshAll(){
  return loadOrders().then(renderCharts).catch(e=> console.warn(e));
}

/* ---- Wiring ---- */
function onReady(){
  try { SESSION = JSON.parse(localStorage.getItem("session")||"null"); } catch(_e){}
  if(SESSION && SESSION.username){
    const ui=$("#userInfo"); if(ui) ui.textContent=(SESSION.full_name||SESSION.username)+" / "+(SESSION.department||"");
    show("pageDash"); refreshAll();
  }else{
    show("authView");
  }

  let b;
  b=$("#btnLogin"); if(b) b.addEventListener("click", onLogin);
  wireNav();

  // search
  b=$("#qOrders"); if(b) b.addEventListener("input", loadOrders);

  // scan dialog
  b=$("#btnOpenScan"); if(b) b.addEventListener("click", ()=>{
    const po = prompt("QR 更新する注番（PO）を入力:"); if(po) startScanFor(po);
  });
  b=$("#btnScanStart"); if(b) b.addEventListener("click", initScan);
  b=$("#btnScanClose"); if(b) b.addEventListener("click", ()=>{ stopScan(); $("#dlgScan").close(); });

  // manual update dialog
  b=$("#btnUpdSave");  if(b) b.addEventListener("click", saveUpdate);
  b=$("#btnUpdClose"); if(b) b.addEventListener("click", ()=> $("#dlgUpdate").close());

  // station QR
  buildStationQRMenu();
  b=$("#btnQrClose"); if(b) b.addEventListener("click", ()=> $("#dlgStationQR").close());

  // import/export
  b=$("#btnExportOrders"); if(b) b.addEventListener("click", exportOrdersXlsx);
  b=$("#btnImportOrders"); if(b) b.addEventListener("click", ()=> $("#fileImportOrders").click());
  b=$("#fileImportOrders"); if(b) b.addEventListener("change", (e)=> {
    const f=e.target.files && e.target.files[0]; if(f) importOrdersFromFile(f);
    e.target.value="";
  });

  // charts refresh
  b=$("#btnChartsRefresh"); if(b) b.addEventListener("click", renderCharts);
}
window.addEventListener("DOMContentLoaded", onReady);
