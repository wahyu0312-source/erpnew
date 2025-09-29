/* ============ 設定 ============ */
// Web App /exec のURL
const API_BASE = "https://script.google.com/macros/s/AKfycbzjiN5ePhvRAs6fTKEraiEXXOFP-OndOFgw1VuAH2i5SX2-z3CGYHXr3_m8SHG01gFyFA/exec";
const API_KEY  = ""; // 使わないなら空

// 日本語工程・状態
const PROCESSES = ['レーザ加工','曲げ加工','外枠組立','シャッター組立','シャッター溶接','コーキング','外枠塗装','組立（組立中）','組立（組立済）','外注','検査工程'];
const STATUSES  = ['生産開始','検査保留','検査済','出荷準備','出荷済','不良品（要リペア）'];

const $ = s=>document.querySelector(s);
const fmtDT = s=> s? new Date(s).toLocaleString(): '';
const fmtD  = s=> s? new Date(s).toLocaleDateString(): '';
let SESSION=null;

/* ============ API (no preflight) ============ */
async function apiPost(action, body){
  const payload = { action, ...body };
  if (API_KEY) payload.apiKey = API_KEY;
  const res = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload) });
  if (!res.ok) throw new Error('Network '+res.status);
  const j=await res.json(); if(!j.ok) throw new Error(j.error); return j.data;
}
async function apiGet(params){
  const url = API_BASE + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url); if(!res.ok) throw new Error('Network '+res.status);
  const j=await res.json(); if(!j.ok) throw new Error(j.error); return j.data;
}

/* ============ Boot ============ */
window.addEventListener('DOMContentLoaded', ()=>{
  // nav routing
  $('#btnToDash').onclick = ()=>showPage('pageDash');
  $('#btnToPlan').onclick = ()=>showPage('pagePlan');
  $('#btnToShip').onclick = ()=>showPage('pageShip');

  // login area
  $('#btnLogin').onclick = onLogin;
  $('#btnNewUser').onclick = addUserFromLoginUI;
  $('#btnLogout').onclick = ()=>{ SESSION=null; localStorage.removeItem('erp_session'); location.reload(); };
  $('#btnChangePass').onclick = changePasswordUI;

  // feature buttons
  $('#btnRefresh').onclick = refreshAll;
  $('#btnCreateOrder').onclick = createOrderUI;
  $('#btnSchedule').onclick = scheduleUI;
  $('#btnExportOrders').onclick = exportOrdersCSV;
  $('#btnExportShip').onclick = exportShipCSV;
  $('#btnShipByPO').onclick = ()=>{ const po=$('#s_po').value.trim(); if(!po) return alert('POを入力'); openShipByPO(po); };
  $('#btnShipByID').onclick = ()=>{ const id=prompt('Ship ID:'); if(!id) return; openShipByID(id.trim()); };
  $('#searchQ').addEventListener('input', renderOrders);

  // QR scan modal
  $('#btnScan').onclick = openScanModal;
  $('#btnScanStart').onclick = scanStart;
  $('#btnScanClose').onclick = scanClose;

  // add user from navbar (only 生産管理部/admin)
  $('#btnAddUserWeb').onclick = openAddUserModal;

  const saved = localStorage.getItem('erp_session');
  if (saved){ SESSION=JSON.parse(saved); enterApp(); } else { showPage('authView'); }
});

/* ============ Auth ============ */
async function onLogin(){
  const username=$('#inUser').value.trim();
  const password=$('#inPass').value.trim();
  try{
    const user=await apiPost('login',{username,password});
    SESSION=user; localStorage.setItem('erp_session', JSON.stringify(SESSION));
    enterApp();
  }catch(e){ alert(e.message||e); }
}
async function addUserFromLoginUI(){
  if (!SESSION) return alert('ログインしてください');
  if (!(SESSION.role==='admin'||SESSION.department==='生産管理部')) return alert('権限不足');
  const payload={ username:$('#nuUser').value.trim(), password:$('#nuPass').value.trim(), full_name:$('#nuName').value.trim(), department:$('#nuDept').value, role:$('#nuRole').value };
  if (!payload.username||!payload.password||!payload.full_name) return alert('必須項目を入力');
  try{ await apiPost('createUser',{user:SESSION,payload}); alert('作成しました'); }catch(e){ alert(e.message||e); }
}
async function changePasswordUI(){
  if (!SESSION) return alert('ログインしてください');
  const oldPass = prompt('旧パスワード:'); if(oldPass===null) return;
  const newPass = prompt('新パスワード:'); if(newPass===null) return;
  try{ await apiPost('changePassword',{user:SESSION,oldPass,newPass}); alert('変更しました。再ログインしてください。'); SESSION=null; localStorage.removeItem('erp_session'); location.reload(); }catch(e){ alert(e.message||e); }
}

function enterApp(){
  // navbar controls
  $('#userInfo').textContent = `${SESSION.full_name}・${SESSION.department}`;
  ['btnLogout','btnChangePass','btnToDash','btnToPlan','btnToShip','btnScan'].forEach(id=>$('#'+id).classList.remove('hidden'));
  if (SESSION.role==='admin' || SESSION.department==='生産管理部'){ $('#btnAddUserWeb').classList.remove('hidden'); }
  else { $('#btnAddUserWeb').classList.add('hidden'); }

  showPage('pageDash');
  loadMasters();
  refreshAll();
}

function showPage(id){
  ['authView','pageDash','pagePlan','pageShip'].forEach(pid=> document.getElementById(pid)?.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

/* ============ Masters ============ */
async function loadMasters(){
  try{
    const opts = await apiGet({action:'masters',types:'得意先,品名,品番,図番'});
    const fill = (id,arr)=>{ $(id).innerHTML=(arr||[]).map(v=>`<option value="${v}"></option>`).join(''); };
    fill('#dl_tokui',opts['得意先']); fill('#dl_hinmei',opts['品名']); fill('#dl_hinban',opts['品番']); fill('#dl_zuban',opts['図番']);
  }catch(e){ console.warn(e); }
}

/* ============ Orders ============ */
async function createOrderUI(){
  if (!(SESSION.role==='admin'||SESSION.department==='生産管理部')) return alert('権限不足（生産管理部）');
  const payload={
    '通知書番号':$('#c_tsuchi').value.trim(),'得意先':$('#c_tokui').value.trim(),'得意先品番':$('#c_tokui_hin').value.trim(),
    '製番号':$('#c_sei').value.trim(),'品名':$('#c_hinmei').value.trim(),'品番':$('#c_hinban').value.trim(),'図番':$('#c_zuban').value.trim(),
    '管理No':$('#c_kanri').value.trim()
  };
  try{ const r=await apiPost('createOrder',{payload,user:SESSION}); alert('発行しました: '+r.po_id); refreshAll(); }catch(e){ alert(e.message||e); }
}
async function listOrders(){ const q=$('#searchQ').value.trim(); return apiGet({action:'listOrders',q}); }
async function renderOrders(){
  const rows=await listOrders();
  $('#tbOrders').innerHTML = rows.map(r=>`
    <tr>
      <td><b>${r.po_id}</b></td>
      <td>${r['得意先']||''}</td>
      <td>${r['製番号']||''}</td>
      <td>${r['品名']||''}</td>
      <td>${r['品番']||''}</td>
      <td>${r['図番']||''}</td>
      <td><span class="badge">${r.status}</span></td>
      <td>${r.current_process}</td>
      <td class="muted s">${fmtDT(r.updated_at)}</td>
      <td class="muted s">${r.updated_by||''}</td>
      <td>
        <button class="btn ghost s" onclick="openTicket('${r.po_id}')">現品票</button>
        <button class="btn ghost s" onclick="promptUpdate('${r.po_id}','${r.status}','${r.current_process}')">更新</button>
        <button class="btn ghost s" onclick="openShipByPO('${r.po_id}')">出荷確認</button>
      </td>
    </tr>`).join('');
}
async function promptUpdate(po_id, curStatus, curProc){
  const status = prompt('新しい状態（生産開始/検査保留/検査済/出荷準備/出荷済/不良品（要リペア））:', curStatus||'');
  if (status===null) return;
  const proc = prompt('新しい工程:', curProc||''); if (proc===null) return;
  const note = prompt('備考（任意）:','')||'';
  try{
    await apiPost('updateOrder',{po_id,updates:{status:status,current_process:proc,note},user:SESSION});
    alert('更新しました'); refreshAll(true);
  }catch(e){ alert(e.message||e); }
}

/* ============ 出荷 ============ */
async function scheduleUI(){
  if (!(SESSION.role==='admin'||SESSION.department==='生産管理部')) return alert('権限不足（生産管理部）');
  const po_id=$('#s_po').value.trim(), dateIso=$('#s_date').value, qty=$('#s_qty').value;
  if (!po_id||!dateIso) return alert('POと日付を入力');
  try{ const r=await apiPost('scheduleShipment',{po_id,dateIso,qty,user:SESSION}); alert('登録: '+r.ship_id); refreshAll(true);}catch(e){ alert(e.message||e); }
}
async function openShipByPO(po_id){
  try{ const doc=await apiGet({action:'shipByPo',po_id}); showShipDoc(doc.shipment,doc.order); }catch(e){ alert(e.message||e); }
}
async function openShipByID(id){
  try{ const doc=await apiGet({action:'shipById',ship_id:id}); showShipDoc(doc.shipment,doc.order); }catch(e){ alert(e.message||e); }
}

/* ============ ダッシュボード ============ */
async function refreshAll(keep=false){
  try{
    const s=await apiGet({action:'stock'});
    $('#statFinished').textContent=s.finishedStock; $('#statReady').textContent=s.ready; $('#statShipped').textContent=s.shipped;

    const today=await apiGet({action:'todayShip'});
    $('#listToday').innerHTML = today.length? today.map(r=>`<div><span>${r.po_id}</span><span>${fmtD(r.scheduled_date)}・${r.qty}</span></div>`).join('') : '<div class="muted">本日予定なし</div>';

    const loc=await apiGet({action:'locSnapshot'});
    $('#gridProc').innerHTML = PROCESSES.map(p=> `<div class="grid-chip"><div class="muted s">${p}</div><div class="h">${loc[p]||0}</div></div>`).join('');

    if (!keep) $('#searchQ').value='';
    await renderOrders(); await renderCharts();
  }catch(e){ console.error(e); }
}
let chM=null,chC=null,chS=null;
async function renderCharts(){
  const d=await apiGet({action:'charts'});
  const months=['1','2','3','4','5','6','7','8','9','10','11','12'];
  chM?.destroy(); chM=new Chart($('#chartMonthly'),{type:'bar',data:{labels:months,datasets:[{label:'月別出荷数量（'+d.year+'）',data:d.perMonth}] }});
  chC?.destroy(); chC=new Chart($('#chartCustomer'),{type:'bar',data:{labels:Object.keys(d.perCust),datasets:[{label:'得意先別出荷',data:Object.values(d.perCust)}]}});
  chS?.destroy(); chS=new Chart($('#chartStock'),{type:'pie',data:{labels:Object.keys(d.stockBuckets),datasets:[{label:'在庫区分',data:Object.values(d.stockBuckets)}]}});
}

/* ============ 票 ============ */
async function openTicket(po_id){
  try{
    const o=await apiGet({action:'ticket',po_id});
    const body=`
      <h3>生産現品票</h3>
      <table>
        <tr><th>管理No</th><td>${o['管理No']||'-'}</td><th>通知書番号</th><td>${o['通知書番号']||'-'}</td></tr>
        <tr><th>得意先</th><td>${o['得意先']||''}</td><th>得意先品番</th><td>${o['得意先品番']||''}</td></tr>
        <tr><th>製番号</th><td>${o['製番号']||''}</td><th>投入日</th><td>${o['created_at']?new Date(o['created_at']).toLocaleDateString():'-'}</td></tr>
        <tr><th>品名</th><td>${o['品名']||''}</td><th>品番/図番</th><td>${(o['品番']||'')+' / '+(o['図番']||'')}</td></tr>
        <tr><th>工程</th><td colspan="3">${o.current_process}</td></tr>
        <tr><th>状態</th><td>${o.status}</td><th>更新</th><td>${fmtDT(o.updated_at)} / ${o.updated_by||''}</td></tr>
      </table>`;
    showDialog('dlgTicket', body);
  }catch(e){ alert(e.message||e); }
}
function showShipDoc(s,o){
  const dt=s.scheduled_date? new Date(s.scheduled_date): null;
  const body=`
    <h3>出荷確認書</h3>
    <table>
      <tr><th>得意先</th><td>${o['得意先']||''}</td><th>出荷日</th><td>${dt?dt.toLocaleDateString():'-'}</td></tr>
      <tr><th>品名</th><td>${o['品名']||''}</td><th>品番/図番</th><td>${(o['品番']||'')+' / '+(o['図番']||'')}</td></tr>
      <tr><th>PO</th><td>${o.po_id||s.po_id}</td><th>数量</th><td>${s.qty||0}</td></tr>
      <tr><th>出荷ステータス</th><td>${s.status}</td><th>備考</th><td></td></tr>
    </table>`;
  showDialog('dlgShip', body);
}
function showDialog(id, html){
  const dlg=document.getElementById(id); dlg.querySelector('.body').innerHTML=html; dlg.showModal();
}

/* ============ Export ============ */
async function exportOrdersCSV(){ const rows=await apiGet({action:'listOrders'}); downloadCSV('orders.csv',rows); }
async function exportShipCSV(){ const rows=await apiGet({action:'todayShip'}); downloadCSV('ship_today.csv',rows); }
function downloadCSV(name,rows){
  if(!rows||!rows.length) return downloadFile(name,'');
  const headers=Object.keys(rows[0]);
  const csv=[headers.join(',')].concat(rows.map(r=> headers.map(h=> String(r[h]??'').replaceAll('"','""')).map(v=>`"${v}"`).join(','))).join('\n');
  downloadFile(name,csv);
}
function downloadFile(name,content){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type:'text/csv'})); a.download=name; a.click();
}

/* ============ ユーザー追加（Navbar） ============ */
function openAddUserModal(){
  if (!(SESSION.role==='admin'||SESSION.department==='生産管理部')) return alert('権限不足');
  const html=`
    <h3>ユーザー追加</h3>
    <div class="grid">
      <input id="au_username" placeholder="ユーザー名">
      <input id="au_password" type="password" placeholder="パスワード">
      <input id="au_fullname" placeholder="氏名">
      <select id="au_dept"><option>生産管理部</option><option>製造部</option><option>検査部</option></select>
      <select id="au_role"><option>member</option><option>manager</option><option>admin</option></select>
    </div>
    <div class="row-end" style="margin-top:.6rem"><button class="btn primary" id="au_save">保存</button></div>`;
  showDialog('dlgTicket', html);
  document.getElementById('au_save').onclick = async ()=>{
    const payload={ username:$('#au_username').value.trim(), password:$('#au_password').value.trim(), full_name:$('#au_fullname').value.trim(), department:$('#au_dept').value, role:$('#au_role').value };
    if(!payload.username||!payload.password||!payload.full_name) return alert('必須項目');
    try{ await apiPost('createUser',{user:SESSION,payload}); alert('作成しました'); document.getElementById('dlgTicket').close(); }catch(e){ alert(e.message||e); }
  };
}

/* ============ QR スキャン ============ */
let scanStream=null, scanTimer=null;
function openScanModal(){
  $('#dlgScan').showModal();
  $('#scanResult').textContent='カメラを開始してください';
}
async function scanStart(){
  try{
    if (scanStream) return;
    const v=$('#scanVideo'); const c=$('#scanCanvas'); const ctx=c.getContext('2d');
    const st = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
    scanStream=st; v.srcObject=st; await v.play();
    scanTimer = setInterval(async ()=>{
      c.width=v.videoWidth; c.height=v.videoHeight;
      ctx.drawImage(v,0,0,c.width,c.height);
      const img=ctx.getImageData(0,0,c.width,c.height);
      const code = jsQR(img.data, img.width, img.height);
      if (code && code.data){
        const text=code.data.trim();
        $('#scanResult').textContent='読み取り: '+text;
        if (/^PO-/.test(text)){
          const status=$('#scanStatus').value, proc=$('#scanProcess').value;
          try{
            await apiPost('updateOrder',{po_id:text, updates:{status:status,current_process:proc}, user:SESSION});
            $('#scanResult').textContent=`更新完了: ${text} → ${status} / ${proc}`;
            refreshAll(true);
          }catch(e){ $('#scanResult').textContent='更新失敗: '+(e.message||e); }
        }else{
          $('#scanResult').textContent='PO形式ではありません: '+text;
        }
      }
    }, 500);
  }catch(e){ alert('カメラ起動失敗: '+(e.message||e)); }
}
function scanClose(){
  clearInterval(scanTimer); scanTimer=null;
  if (scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream=null; }
  $('#dlgScan').close();
}
