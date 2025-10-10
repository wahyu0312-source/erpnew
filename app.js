/************* CONFIG *************/
const API_BASE = 'https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec'; // <== ganti dgn URL web-app GAS kamu
const state = { user:null, orders:[] };

/************* UTIL *************/
const qs = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];
const PROC_ALIAS = p => p==='外作加工' ? '外注加工/組立' : (p||'—');
const STATUS_VIEW = s => (/組立中|組立済|検査中|検査済|出荷準備|出荷済|進行/.test(s||'') ? s : '進行');
const ROLE_CAN_UPDATE = ['admin','生産管理部','製造部','検査部'];

async function API(action, data={}){
  const res = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({action, ...data}) });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { throw new Error('Server format'); }
}
function setRoleNav(role){
  const show = id => qs('#'+id)?.classList.remove('hidden');
  show('btnToDash');
  if (['営業','admin'].includes(role)){ show('btnToSales'); show('btnToInvoice'); }
  if (['生産管理部','admin'].includes(role)){ show('btnToPlan'); show('btnToShip'); show('btnToInvPage'); show('btnToFinPage'); show('btnToCharts'); }
  if (['製造部','admin'].includes(role)){ show('btnToCharts'); }
  if (['検査部','admin'].includes(role)){ show('btnToCharts'); }
  if (role==='admin') qs('#ddSetting')?.classList.remove('hidden');
}
function statusOptionsByRole(role){
  if (role==='検査部') return ['検査中','検査済','出荷準備','出荷済'];
  if (role==='製造部') return ['組立中','組立済','出荷準備','出荷済'];
  if (role==='生産管理部' || role==='admin') return ['進行','組立中','組立済','検査中','検査済','出荷準備','出荷済'];
  return ['進行'];
}

/************* AUTH *************/
async function login(){
  const username = qs('#inUser').value.trim();
  const password = qs('#inPass').value.trim();
  const r = await API('login',{username,password});
  if(!r.ok){ alert('ログイン失敗'); return; }
  state.user = r.user;
  qs('#userInfo').textContent = `${state.user.full_name} / ${state.user.department}`;
  qs('#authView').classList.add('hidden');
  qs('#pageDash').classList.remove('hidden');
  setRoleNav(state.user.role || state.user.department);
  refreshAll();
}
qs('#btnLogin').addEventListener('click', login);

/************* USERS (Admin only) *************/
qs('#btnNewUser').addEventListener('click', async ()=>{
  const payload = {
    username: qs('#nuUser').value.trim(),
    password: qs('#nuPass').value.trim(),
    full_name: qs('#nuName').value.trim(),
    department: qs('#nuDept').value,
    role: qs('#nuRole').value
  };
  const r = await API('addUser', payload);
  alert(r.ok? '追加しました' : '追加失敗（権限 or 入力）');
});

/************* ORDERS *************/
async function refreshAll(){
  const r = await API('listOrders', {});
  state.orders = r.data || [];
  renderOrders(state.orders);
  renderDash(r.summary||{});
}

function renderOrders(list){
  const tb = qs('#tbOrders'); tb.innerHTML = '';
  const q = (qs('#searchQ').value||'').trim().toLowerCase();
  list.filter(o=>{
    return !q || JSON.stringify(o).toLowerCase().includes(q);
  }).forEach(o=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-po" data-label="注番 / 得意先">
        <div class="muted s">注番</div>${o.po_id||'—'}<div class="muted s">${o.customer||''}</div>
      </td>
      <td class="col-name" data-label="品名">${o.item_name||'—'}</td>
      <td class="col-part" data-label="品番">${o.part_no||'—'}</td>
      <td class="col-drw" data-label="図番">${o.draw_no||'—'}</td>
      <td class="col-status" data-label="状態"><span class="badge proc">${STATUS_VIEW(o.status)}</span></td>
      <td class="col-proc" data-label="工程"><span class="badge">${PROC_ALIAS(o.current_process)}</span></td>
      <td class="col-updAt" data-label="更新日時">${o.updated_at||'—'}</td>
      <td class="col-updBy" data-label="更新者">${o.updated_by||'—'}</td>
      <td class="col-act" data-label="操作">
        <div class="row gap">
          <button class="btn ghost btn-scan"><i class="fa-solid fa-qrcode"></i> スキャン</button>
          <button class="btn ghost btn-manual"><i class="fa-solid fa-pen-to-square"></i> 手動更新</button>
        </div>
      </td>`;
    const can = state.user && ROLE_CAN_UPDATE.includes(state.user.role||state.user.department);
    const bScan = tr.querySelector('.btn-scan'), bMan = tr.querySelector('.btn-manual');
    bScan.disabled = !can; bMan.disabled = !can;
    if (can){
      bScan.onclick = ()=> openScan(o.po_id);
      bMan .onclick = ()=> openManual(o.po_id);
    }
    tb.appendChild(tr);
  });
}
qs('#searchQ').addEventListener('input', ()=>renderOrders(state.orders));

function renderDash(sum){
  qs('#statFinished').textContent = sum.finished || 0;
  qs('#statReady').textContent    = sum.ready || 0;
  qs('#statShipped').textContent  = sum.shipped || 0;
  const gp = qs('#gridProc'); gp.innerHTML='';
  (sum.proc||[]).forEach(p=>{
    const d=document.createElement('div'); d.className='chip'; d.textContent = `${PROC_ALIAS(p.name)} ${p.cnt}`;
    gp.appendChild(d);
  });
}
qs('#btnRefresh').addEventListener('click', refreshAll);

/************* Station QR *************/
qs('#miStationQR')?.addEventListener('click', async ()=>{
  const wrap = qs('#qrWrap'); wrap.innerHTML='';
  const r = await API('stationQR');
  (r.data?.stations || []).forEach(name=>{
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `<strong>${PROC_ALIAS(name)}</strong><div class="qr"></div>`;
    wrap.appendChild(div);
    new QRCode(div.querySelector('.qr'), { text:`ST:${name}`, width:120, height:120 });
  });
  qs('#dlgStationQR').showModal();
});

/************* Manual Update *************/
async function openManual(po){
  const dlg = qs('#dlgManual'); qs('#mPO').textContent = po;
  const st = await API('stationQR'); const sel = qs('#mProc');
  sel.innerHTML = (st.data?.stations||[]).map(s=>`<option>${PROC_ALIAS(s)}</option>`).join('');
  const ssel = qs('#mStatus'); const opts = statusOptionsByRole(state.user?.role||state.user?.department||'');
  ssel.innerHTML = opts.map(x=>`<option>${x}</option>`).join('');
  dlg.showModal();
  qs('#mClose').onclick = ()=> dlg.close();
  qs('#mSave').onclick = async ()=>{
    const payload = {
      po_id: po,
      process: sel.value.replace('外注加工/組立','外作加工'),
      status: ssel.value,
      ok: qs('#mOK').value||0,
      ng: qs('#mNG').value||0,
      note: qs('#mNote').value||'',
      user: state.user?.username||'system'
    };
    const r = await API('updateProcess', payload);
    if(!r.ok) alert('更新失敗');
    dlg.close(); refreshAll();
  };
}

/************* QR Scan *************/
let _scanTimer=null, _stream=null;
async function openScan(po){
  qs('#scanPO').textContent = po; qs('#scanResult').textContent='';
  qs('#dlgScan').showModal();
}
qs('#btnScanStart').addEventListener('click', async ()=>{
  const v=qs('#scanVideo'), c=qs('#scanCanvas'), ctx=c.getContext('2d');
  _stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  v.srcObject=_stream; await v.play();
  c.width=v.videoWidth; c.height=v.videoHeight;
  _scanTimer = setInterval(async ()=>{
    ctx.drawImage(v,0,0,c.width,c.height);
    const img = ctx.getImageData(0,0,c.width,c.height);
    const code = jsQR(img.data, img.width, img.height);
    if(code && code.data && code.data.startsWith('ST:')){
      clearInterval(_scanTimer); _scanTimer=null;
      const station = code.data.slice(3);
      const po = qs('#scanPO').textContent;
      qs('#scanResult').textContent = `読み取り: ${PROC_ALIAS(station)}`;
      await API('updateProcess',{po_id:po, process:station, status:'進行', ok:0, ng:0, user:state.user?.username||'system'});
      qs('#dlgScan').close(); stopScan();
      refreshAll();
    }
  }, 220);
});
function stopScan(){ try{_stream?.getTracks().forEach(t=>t.stop());}catch{} }
qs('#btnScanClose').addEventListener('click', ()=>{ clearInterval(_scanTimer); _scanTimer=null; stopScan(); qs('#dlgScan').close(); });

/************* Invoice (営業) = print placeholder *************/
qs('#btnToInvoice')?.addEventListener('click', ()=> window.print());

/************* Init: auto-admin seed + ping *************/
window.addEventListener('DOMContentLoaded', async ()=>{
  try{
    await API('ping');
  }catch{
    console.warn('API unreachable. Set API_BASE!');
  }
});
