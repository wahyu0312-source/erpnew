/* ================== CONFIG ================== */
const API_BASE = 'https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec'; // Apps Script /exec

const ROLE = { ADMIN:'admin', SALES:'営業', SEISAN:'生産管理部', SEIZO:'製造部', KENSA:'検査部' };

const PROC_ALIAS = name => (name==='外作加工') ? '外注加工/組立' : (name || '');

function filterStationsForRole(role){
  const all = ['準備','シャッター溝段','レザー加工','曲げ加工','外注加工/組立','検査工程','出荷（組立済）'];
  if(role===ROLE.SEIZO) return ['曲げ加工','外注加工/組立','検査工程','出荷（組立済）'];
  if(role===ROLE.KENSA) return ['検査工程','出荷（組立済）'];
  return all;
}
function statusOptionsByRole(role){
  if(role===ROLE.SEIZO) return ['進行','組立中','組立済','出荷準備','出荷済'];
  if(role===ROLE.KENSA) return ['検査中','検査済','出荷準備','出荷済'];
  return ['進行','組立中','組立済','検査中','出荷準備','出荷済'];
}

const MENU_PERMS = {
  [ROLE.ADMIN]:   ['Dash','Sales','Plan','Ship','Inv','Fin','Invc','Charts','Settings'],
  [ROLE.SALES]:   ['Dash','Sales','Invc'],
  [ROLE.SEISAN]:  ['Dash','Plan','Ship','Inv','Fin','Charts','Settings'],
  [ROLE.SEIZO]:   ['Dash','Settings'],
  [ROLE.KENSA]:   ['Dash','Settings']
};

const $ = q => document.querySelector(q);
const $$ = q => Array.from(document.querySelectorAll(q));
async function API(action, data={}){
  const r = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify({action, ...data}) });
  const t = await r.text(); try{ return JSON.parse(t); } catch{ throw new Error('API parse error'); }
}

/* ================== STATE ================== */
const state = { user:null, orders:[] };

/* ================== NAV ================== */
const PAGES = ['authView','pageDash','pageSales','pagePlan','pageShip','pageInventory','pageFinished','pageInvoice','pageCharts'];
function showPage(id){ PAGES.forEach(p=>$('#'+p)?.classList.add('hidden')); $('#'+id)?.classList.remove('hidden'); }

function setupNav(){
  $('#btnToDash') .onclick=()=>showPage('pageDash');
  $('#btnToSales').onclick=()=>showPage('pageSales');
  $('#btnToPlan') .onclick=()=>showPage('pagePlan');
  $('#btnToShip') .onclick=()=>showPage('pageShip');
  $('#btnToInvPage').onclick=()=>showPage('pageInventory');
  $('#btnToFinPage').onclick=()=>showPage('pageFinished');
  $('#btnToInvoice').onclick=()=>showPage('pageInvoice');
  $('#btnToCharts').onclick=()=>showPage('pageCharts');
  $('#btnLogout')  .onclick=()=>location.reload();

  // admin-only menu item
  $('#miAddUser').classList.add('hidden');
}

/* ================== LOGIN ================== */
$('#btnLogin')?.addEventListener('click', async ()=>{
  try{
    const r = await API('login', { username: $('#inUser').value.trim(), password: $('#inPass').value.trim() });
    if(!r.ok) throw new Error('ログイン失敗');
    state.user = r.user;
    $('#userInfo').textContent = `${state.user.full_name||state.user.username}（${state.user.department||state.user.role||''}）`;
    applyRoleMenus();
    showPage('pageDash');
    await refreshAll();
  }catch(e){ alert(e.message); }
});

function applyRoleMenus(){
  const role = state.user?.role || state.user?.department || '';
  const perms = MENU_PERMS[role] || ['Dash'];
  const map = {
    Dash:'#btnToDash', Sales:'#btnToSales', Plan:'#btnToPlan', Ship:'#btnToShip',
    Inv:'#btnToInvPage', Fin:'#btnToFinPage', Invc:'#btnToInvoice', Charts:'#btnToCharts', Settings:'#ddSetting'
  };
  Object.entries(map).forEach(([k,sel])=>{
    if(perms.includes(k)) $(sel)?.classList.remove('hidden');
    else $(sel)?.classList.add('hidden');
  });

  // Admin can add user
  if(role===ROLE.ADMIN){ $('#miAddUser').classList.remove('hidden'); }
}

/* ================== USERS (admin) ================== */
$('#btnNewUser')?.addEventListener('click', async ()=>{
  if(!state.user){ alert('login first'); return; }
  const payload = {
    username: $('#nuUser').value.trim(),
    password: $('#nuPass').value.trim(),
    full_name: $('#nuName').value.trim(),
    department: $('#nuDept').value,
    role: $('#nuRole').value
  };
  const r = await API('addUser',{ me:{username:state.user.username}, payload });
  alert(r.ok?'追加しました':'権限がありません');
});

/* ================== LOAD & RENDER ================== */
async function refreshAll(){
  const r = await API('listOrders');
  if(!r.ok){ alert('データ取得失敗'); return; }
  state.orders = r.data||[];
  renderOrders();
}

function renderOrders(){
  const tb = $('#tbOrders'); tb.innerHTML='';
  state.orders.forEach(o=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="muted s">注番</div><div><b>${o.po_id||'-'}</b></div><div class="muted s">${o.得意先||''}</div></td>
      <td>${o.品名||''}</td><td>${o.品番||''}</td><td>${o.図番||''}</td>
      <td><span class="badge ${badgeFor(o.status)}">${o.status||'-'}</span></td>
      <td><span class="chip">${PROC_ALIAS(o.current_process)||'-'}</span></td>
      <td>${o.updated_at||''}</td><td>${o.updated_by||''}</td>
      <td class="row gap">
        <button class="btn s ghost js-history" data-po="${o.po_id}"><i class="fa-regular fa-clock"></i> 履歴</button>
        <button class="btn s ghost js-manual" data-po="${o.po_id}"><i class="fa-regular fa-pen-to-square"></i> 手動更新</button>
        <button class="btn s ghost js-scan" data-po="${o.po_id}"><i class="fa-solid fa-qrcode"></i> スキャン</button>
      </td>`;
    tb.appendChild(tr);
  });
  $$('.js-manual').forEach(b=> b.onclick = ()=> openManual(b.dataset.po));
  $$('.js-scan')  .forEach(b=> b.onclick = ()=> openScan(b.dataset.po));
}

function badgeFor(st){
  if(/出荷済/.test(st)) return 'ok';
  if(/検査中/.test(st)) return 'warn';
  if(/組立中/.test(st)) return 'info';
  if(/出荷準備/.test(st)) return 'accent';
  if(/組立済|検査済/.test(st)) return 'good';
  return '';
}

/* ================== STATION QR ================== */
$('#miStationQR')?.addEventListener('click', async ()=>{
  const wrap = $('#qrWrap'); wrap.innerHTML='';
  const allow = filterStationsForRole(state.user?.department || state.user?.role || '');
  allow.forEach(name=>{
    const d = document.createElement('div'); d.className='card';
    d.innerHTML = `<b>${name}</b><div class="qr"></div>`;
    wrap.appendChild(d);
    new QRCode(d.querySelector('.qr'), { text:'ST:'+name, width:120, height:120 });
  });
  $('#dlgStationQR').showModal();
});

/* ================== SCAN ================== */
let _scanStream=null,_scanTimer=null;
async function openScan(po){
  $('#scanPO').textContent = po;
  $('#dlgScan').showModal();
  const v=$('#scanVideo'), c=$('#scanCanvas'), ctx=c.getContext('2d');
  try{
    _scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    v.srcObject = _scanStream; await v.play();
    _scanTimer = setInterval(async ()=>{
      c.width=v.videoWidth; c.height=v.videoHeight; ctx.drawImage(v,0,0,c.width,c.height);
      const img=ctx.getImageData(0,0,c.width,c.height);
      const code=jsQR(img.data,c.width,c.height);
      if(code && code.data.startsWith('ST:')){
        const procRaw = code.data.slice(3);
        const status = statusOptionsByRole(state.user?.department||state.user?.role||'')[0]||'進行';
        const res = await API('updateProcess',{ po_id:po, process:procRaw, status, ok:0, ng:0, note:'scan', user: state.user?.username });
        if(res.ok){ clearScan(); refreshAll(); $('#scanResult').textContent=`更新：${PROC_ALIAS(procRaw)} → ${status}`; }
      }
    },600);
  }catch(e){ $('#scanResult').textContent=e.message; }
}
function clearScan(){
  if(_scanTimer){ clearInterval(_scanTimer); _scanTimer=null; }
  if(_scanStream){ _scanStream.getTracks().forEach(t=>t.stop()); _scanStream=null; }
}
$('#btnScanClose')?.onclick=()=>{ clearScan(); $('#dlgScan').close(); };

/* ================== MANUAL UPDATE ================== */
async function openManual(po){
  $('#muPO').textContent=po;
  const role=state.user?.department||state.user?.role||'';
  const procs=filterStationsForRole(role), stats=statusOptionsByRole(role);
  $('#mProc').innerHTML = procs.map(s=>`<option>${s}</option>`).join('');
  $('#mStatus').innerHTML = stats.map(s=>`<option>${s}</option>`).join('');
  $('#mOK').value='0'; $('#mNG').value='0'; $('#mNote').value='';
  $('#dlgManual').showModal();
  $('#mClose').onclick=()=>$('#dlgManual').close();
  $('#mSave').onclick= async ()=>{
    const payload={
      po_id:po, process:$('#mProc').value, status:$('#mStatus').value,
      ok:$('#mOK').value||0, ng:$('#mNG').value||0, note:$('#mNote').value||'',
      user:state.user?.username||'system'
    };
    const r=await API('updateProcess',payload);
    if(!r.ok) return alert('更新失敗');
    $('#dlgManual').close(); refreshAll();
  };
}

/* ================== INIT ================== */
setupNav();
(async()=>{ try{ await API('ping'); }catch(_){/* ignore */} })();
