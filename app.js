/* ===== ERP Frontend (clean build) ===== */

/* ---- Config ---- */
var API_BASE = "https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec"; // <-- ganti dengan /exec
var API_KEY  = ""; // jika pakai token, isi di sini

/* ---- Small helpers ---- */
function $(q){ return document.querySelector(q); }
function qs(obj){
  return Object.keys(obj).map(function(k){
    return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]);
  }).join("&");
}
function show(id){
  var ids=["authView","pageDash","pagePlan","pageShip","pageCharts"];
  ids.forEach(function(v){
    var el=$("#"+v); if(el){ el.classList.add("hidden"); }
  });
  var v=$("#"+id); if(v){ v.classList.remove("hidden"); }
  var nav = ["#btnToDash","#btnToPlan","#btnToShip","#btnToCharts","#btnLogout"];
  nav.forEach(function(sel){
    var b=$(sel); if(!b) return;
    if(id==="authView"){ b.classList.add("hidden"); } else { b.classList.remove("hidden"); }
  });
}

/* ---- API helpers (CORS-safe) ---- */
function apiGet(params){
  var url = API_BASE + "?" + qs(params);
  return fetch(url, { method:"GET" })
    .then(function(r){ return r.json(); })
    .then(function(j){ if(!j.ok) throw new Error(j.error||"HTTP"); return j.data; });
}
function apiPost(action, body){
  body = body || {};
  return fetch(API_BASE, {
    method:"POST",
    headers:{ "Content-Type":"text/plain;charset=utf-8" }, // hindari preflight
    body: JSON.stringify(Object.assign({ action:action, apiKey:API_KEY }, body)),
    redirect:"follow"
  })
  .then(function(r){ return r.json(); })
  .then(function(j){ if(!j.ok) throw new Error(j.error||"HTTP"); return j.data; });
}

/* ---- State ---- */
var SESSION = null;
var CURRENT_PO = null;
var scanStream = null;
var scanTimer = null;

/* ---- Auth ---- */
function onLogin(){
  var username = ($("#inUser")||{}).value || "";
  var password = ($("#inPass")||{}).value || "";
  var remember = ($("#inRemember")||{}).checked || false;
  apiPost("login",{ username:username, password:password })
    .then(function(u){
      SESSION = u;
      if(remember){ localStorage.setItem("session", JSON.stringify(u)); }
      var ui=$("#userInfo"); if(ui){ ui.textContent=(u.full_name||u.username)+" / "+(u.department||u.role||""); }
      show("pageDash");
      refreshAll(true);
    })
    .catch(function(e){ alert(e.message||e); });
}
function onLogout(){
  localStorage.removeItem("session");
  SESSION=null;
  var ui=$("#userInfo"); if(ui){ ui.textContent=""; }
  show("authView");
}

/* ---- Station rules (normalize QR) ---- */
var STATION_RULES = {
  "レーザ加工": function(o){ return { current_process:"レーザ加工" }; },
  "曲げ工程":   function(o){ return { current_process:"曲げ加工" }; },
  "外枠組立":   function(o){ return { current_process:"外枠組立" }; },
  "シャッター組立": function(o){ return { current_process:"シャッター組立" }; },
  "シャッター溶接": function(o){ return { current_process:"シャッター溶接" }; },
  "コーキング": function(o){ return { current_process:"コーキング" }; },
  "外枠塗装":   function(o){ return { current_process:"外枠塗装" }; },
  "組立工程":   function(o){ return (o.current_process==="組立（組立中）" ? { current_process:"組立（組立済）" } : { current_process:"組立（組立中）" }); },
  "検査工程":   function(o){ return (o.status==="出荷準備" ? { current_process:"検査工程", status:"出荷済" } : { current_process:"検査工程" }); },
  "出荷工程":   function(o){ return (o.status==="出荷準備" ? { current_process:(o.current_process||"検査工程"), status:"出荷済" } : { current_process:"検査工程", status:"出荷準備" }); }
};

/* ---- Scan ---- */
function startScanFor(po){
  CURRENT_PO = po;
  var s=$("#scanPO"); if(s) s.textContent = po;
  var dlg=$("#dlgScan"); if(dlg) dlg.showModal();
}
function initScan(){
  var video=$("#scanVideo");
  var canvas=$("#scanCanvas");
  var result=$("#scanResult");
  if(!video || !canvas) return;

  navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } })
    .then(function(stream){
      scanStream = stream;
      video.srcObject=stream;
      return video.play();
    })
    .then(function(){
      var ctx = canvas.getContext("2d");
      scanTimer = setInterval(function(){
        if(video.readyState!==video.HAVE_ENOUGH_DATA) return;
        canvas.width = video.videoWidth;
        canvas.height= video.videoHeight;
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        var img = ctx.getImageData(0,0,canvas.width,canvas.height);
        var code = jsQR(img.data, img.width, img.height);
        if(code && code.data){
          if(result){ result.textContent = "読み取り: " + code.data; }
          onScanToken(code.data)
            .finally(function(){
              stopScan();
              var dlg=$("#dlgScan"); if(dlg) dlg.close();
            });
        }
      }, 280);
    })
    .catch(function(e){ alert("カメラ起動不可: " + (e.message||e)); });
}
function stopScan(){
  if(scanTimer){ clearInterval(scanTimer); scanTimer=null; }
  if(scanStream){ try{ scanStream.getTracks().forEach(function(t){ t.stop(); }); }catch(_e){} scanStream=null; }
}
function onScanToken(token){
  var parts = String(token).split(":");
  var prefix = parts[0], station = parts[1];
  if(prefix!=="ST" || !station){ alert("QR無効"); return Promise.resolve(); }
  if(!CURRENT_PO){ alert("PO未選択"); return Promise.resolve(); }
  return apiGet({ action:"ticket", po_id:CURRENT_PO })
    .then(function(o){
      var rule = STATION_RULES[station] || function(){ return { current_process:station }; };
      var updates = rule(o) || {};
      var okQty = Number(($("#inOkQty")||{}).value || 0);
      var ngQty = Number(($("#inNgQty")||{}).value || 0);
      var note  = String(($("#inNote")||{}).value || "");
      return apiPost("setProcess", { po_id:CURRENT_PO, updates:Object.assign({}, updates, { ok_qty:okQty, ng_qty:ngQty, note:note }), user:SESSION });
    })
    .then(function(){ alert("更新しました"); refreshAll(true); })
    .catch(function(e){ alert(e.message||e); });
}

/* ---- Manual change (fallback) ---- */
function manualSetProcess(po_id){
  var process = prompt("工程を入力（例: レーザ加工/検査工程/…）:");
  if(process===null) return;
  var okQty = Number(prompt("OK品 数量 (空=0):")||0);
  var ngQty = Number(prompt("不良品 数量 (空=0):")||0);
  var note  = prompt("備考/メモ（任意）:")||"";
  apiPost("setProcess",{ po_id:po_id, updates:{ current_process:process, ok_qty:okQty, ng_qty:ngQty, note:note }, user:SESSION })
    .then(function(){ alert("更新しました"); refreshAll(true); })
    .catch(function(e){ alert(e.message||e); });
}

/* ---- Orders (list minimal) ---- */
function loadOrders(){
  var q = ($("#qOrders")||{}).value || "";
  return apiGet({ action:"listOrders", q:q })
    .then(function(rows){
      var el=$("#tblOrders"); if(!el) return;
      var html = '<table><thead><tr>'
        + '<th>注番</th><th>得意先</th><th>図番</th><th>機種</th><th>商品名</th><th>数量</th><th>工程</th><th>状態</th><th>操作</th>'
        + '</tr></thead><tbody>';
      rows.forEach(function(r){
        html += '<tr>'
          + '<td>'+(r.po_id||'')+'</td>'
          + '<td>'+(r["得意先"]||'')+'</td>'
          + '<td>'+(r["図番"]||'')+'</td>'
          + '<td>'+(r["品番"]||'')+'</td>'
          + '<td>'+(r["品名"]||'')+'</td>'
          + '<td>'+(r["数量"]||'')+'</td>'
          + '<td>'+(r.current_process||'')+'</td>'
          + '<td>'+(r.status||'')+'</td>'
          + '<td>'
          + '<button class="btn ghost s" onclick="startScanFor(\''+(r.po_id||'')+'\')"><i class="fa-solid fa-qrcode"></i></button> '
          + '<button class="btn ghost s" onclick="manualSetProcess(\''+(r.po_id||'')+'\')"><i class="fa-solid fa-screwdriver-wrench"></i></button>'
          + '</td>'
          + '</tr>';
      });
      html += '</tbody></table>';
      el.innerHTML = html;
    });
}
function createOrderUI(){
  var p = {
    "得意先": ($("#c_tokui")||{}).value || "",
    "図番":   ($("#c_zuban")||{}).value || "",
    "品番":   ($("#c_kishu")||{}).value || "",
    "品名":   ($("#c_hinmei")||{}).value || "",
    "数量":   ($("#c_qty")||{}).value || "",
    "備考":   ($("#c_biko")||{}).value || ""
  };
  var po = ($("#c_po")||{}).value || "";
  if(po){
    apiPost("updateOrder",{ po_id:po, updates:p, user:SESSION })
      .then(function(){ alert("編集保存しました"); loadOrders(); })
      .catch(function(e){ alert(e.message||e); });
  }else{
    apiPost("createOrder",{ payload:p, user:SESSION })
      .then(function(r){ alert("作成: "+r.po_id); var f=$("#c_po"); if(f) f.value=r.po_id; loadOrders(); })
      .catch(function(e){ alert(e.message||e); });
  }
}

/* ---- Charts ---- */
function drawBar(id, data){
  var el = $("#"+id); if(!el) return;
  new Chart(el, { type:"bar", data:data, options:{ responsive:true, maintainAspectRatio:false }});
}
function renderCharts(){
  return apiGet({ action:"charts" })
    .then(function(d){
      drawBar("chWipProc", { labels:Object.keys(d.wipByProcess||{}), datasets:[{ label:"点数", data:Object.values(d.wipByProcess||{}) }] });
      drawBar("chPlan",     { labels:["1","2","3","4","5","6","7","8","9","10","11","12"], datasets:[{ label:"件数", data:d.planPerMonth||[] }] });
      drawBar("chSales",    { labels:["1","2","3","4","5","6","7","8","9","10","11","12"], datasets:[{ label:"受注", data:d.salesPerMonth||[] }] });
      drawBar("chDefects",  { labels:Object.keys(d.defectByProcess||{}), datasets:[{ label:"不良品 数量", data:Object.values(d.defectByProcess||{}) }] });
      // dashboard mini
      drawBar("chDefectByProc", { labels:Object.keys(d.defectByProcess||{}), datasets:[{ label:"不良品 数量", data:Object.values(d.defectByProcess||{}) }] });
    });
}

/* ---- Refresh ---- */
function refreshAll(){
  return loadOrders().then(renderCharts).catch(function(e){ console.warn(e); });
}

/* ---- Wiring ---- */
function onReady(){
  try { SESSION = JSON.parse(localStorage.getItem("session")||"null"); } catch(_e){}
  if(SESSION && SESSION.username){
    var ui=$("#userInfo"); if(ui){ ui.textContent=(SESSION.full_name||SESSION.username)+" / "+(SESSION.department||""); }
    show("pageDash"); refreshAll();
  }else{
    show("authView");
  }

  var b;
  b=$("#btnLogin"); if(b) b.addEventListener("click", onLogin);
  b=$("#btnLogout"); if(b) b.addEventListener("click", onLogout);

  b=$("#btnToDash");  if(b) b.addEventListener("click", function(){ show("pageDash"); });
  b=$("#btnToPlan");  if(b) b.addEventListener("click", function(){ show("pagePlan"); loadOrders(); });
  b=$("#btnToShip");  if(b) b.addEventListener("click", function(){ show("pageShip"); });
  b=$("#btnToCharts");if(b) b.addEventListener("click", function(){ show("pageCharts"); renderCharts(); });

  b=$("#btnCreateOrder"); if(b) b.addEventListener("click", createOrderUI);
  b=$("#qOrders"); if(b) b.addEventListener("input", loadOrders);

  b=$("#btnOpenScan"); if(b) b.addEventListener("click", function(){
    var po = prompt("QR 更新する注番（PO）を入力:"); if(po) startScanFor(po);
  });
  b=$("#btnScanStart"); if(b) b.addEventListener("click", initScan);
  b=$("#btnScanClose"); if(b) b.addEventListener("click", function(){ stopScan(); var dlg=$("#dlgScan"); if(dlg) dlg.close(); });
}
window.addEventListener("DOMContentLoaded", onReady);
