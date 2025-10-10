/* ==========================
 * Frontend ERP — Wahyu
 * ========================== */

/** 1) SET API BASE — isi dgn URL Web App (exec) mu */
const API_BASE = 'https://script.google.com/macros/s/AKfycbyZZe7ZSpYM3ogRgb7a9AjK8D9NWfeax0VuI0XcNmKLsjYvtGvrbstpEE1TMQ-V8ETs/exec'; // <— ganti

/** 2) Proses & status */
const PROCESSES = ['準備','シャッター溶接','レザー加工','曲げ加工','外注加工/組立','検査工程','出荷（組立済）'];
const STATUS = ['組立中','組立済','検査中','出荷準備','出荷済','生産開始','進行'];

/** 3) State sederhana */
let CURRENT_USER = null;
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/** 4) API helper: POST text/plain (hindari preflight) */
async function apip(a, data={}, who=CURRENT_USER){
  if (!API_BASE || !/^https/.test(API_BASE)) throw new Error('API_BASE belum diisi');
  const body = JSON.stringify({a, data, who});
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {'Content-Type':'text/plain'},
    body
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.msg||'Failed');
  return j;
}

/** 5) Auth UI */
function guardNavEnabled(enabled){
  const nav = $('#navRight');
  if (!nav) return;
  nav.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function show(pageId){
  ['authView','pageDash','pageSales','pagePlan','pageShip','pageInventory','pageFinished','pageInvoice','pageCharts']
    .forEach(id => { const el = $('#'+id); if (el) el.classList.add('hidden'); });
  const tgt = $('#'+pageId);
  if (tgt) tgt.classList.remove('hidden');
}

function applyRoleVisibility(){
  // Sembunyikan semua role-target dulu
  $$('.role-営業,.role-生産管理,.admin-only').forEach(b=>b.classList.add('hidden'));

  if (!CURRENT_USER) return;
  const role = CURRENT_USER.role;
  if (role === 'admin') {
    $$('.role-営業,.role-生産管理,.admin-only').forEach(b=>b.classList.remove('hidden'));
  } else if (role === '営業') {
    $$('.role-営業').forEach(b=>b.classList.remove('hidden'));
  } else if (role === '生産管理') {
    $$('.role-生産管理').forEach(b=>b.classList.remove('hidden'));
  } else if (role === '製造' || role === '検査') {
    // tidak ada menu khusus; dibiarkan default (dashboard + Charts)
  }
}

/** 6) Login flow */
async function login(){
  try{
    const username = $('#inUser').value.trim();
    const password = $('#inPass').value;
    const j = await apip('login', {username, password});
    CURRENT_USER = j.user;
    $('#userInfo').textContent = `${CURRENT_USER.username} / ${CURRENT_USER.department || CURRENT_USER.role}`;
    guardNavEnabled(true);
    applyRoleVisibility();
    await refresh();
    show('pageDash');
  }catch(err){
    alert(err.message || err);
  }
}

async function addUserAdmin(){
  try{
    if (!CURRENT_USER || CURRENT_USER.role!=='admin') return alert('admin only');
    const data = {
      username: $('#nuUser').value.trim(),
      password: $('#nuPass').value,
      full_name: $('#nuName').value.trim(),
      department: $('#nuDept').value,
      role: $('#nuRole').value
    };
    if (!data.username || !data.password) return alert('入力不足');
    await apip('user_add', data);
    alert('ユーザー追加OK');
  }catch(e){ alert(e.message||e); }
}

function logout(){
  CURRENT_USER = null;
  guardNavEnabled(false);
  $('#userInfo').textContent = '';
  show('authView');
}

/** 7) Orders table render */
function td(txt){ const td=document.createElement('td'); td.textContent = txt; return td; }
function chip(txt,cls){ const s=document.createElement('span'); s.className='chip '+(cls||''); s.textContent = txt; return s; }

function renderOrders(rows){
  const tb = $('#tbOrders'); if (!tb) return;
  tb.innerHTML = '';
  const q = ($('#searchQ')?.value||'').trim();
  const rx = q? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i') : null;

  rows.forEach(r=>{
    const po = r.po_id || '';
    const cust = r['得意先'] || '';
    const hin = r['品名'] || '';
    const part = r['品番'] || '';
    const drw = r['図番'] || '';
    const st = r['status'] || '';
    const proc = r['current_process'] || '';
    const updated = r['updated_at'] || '';
    const updater = r['updated_by'] || '';

    const rowTxt = [po,cust,hin,part,drw,st,proc,updated,updater].join(' ');
    if (rx && !rx.test(rowTxt)) return;

    const tr = document.createElement('tr');
    const left = document.createElement('td');
    left.innerHTML = `<div class="muted s">注番</div><div>${po}</div><div class="muted s">${cust}</div>`;
    tr.appendChild(left);
    tr.appendChild(td(hin));
    tr.appendChild(td(part));
    tr.appendChild(td(drw));

    const tdStatus = document.createElement('td');
    if (st) tdStatus.appendChild(chip(st, /済/.test(st)?'badge-ok':''));
    tr.appendChild(tdStatus);

    const tdProc = document.createElement('td');
    if (proc) tdProc.appendChild(chip(proc,'badge-proc'));
    tr.appendChild(tdProc);

    tr.appendChild(td(updated));
    tr.appendChild(td(updater));

    // 操作: 手動更新 + スキャン (scan button muncul untuk 生産管理/製造/検査/admin)
    const op = document.createElement('td');
    const bMan = document.createElement('button');
    bMan.className='btn ghost'; bMan.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 手動更新';
    bMan.onclick = ()=> openManual(po, st, proc);
    op.appendChild(bMan);

    if (CURRENT_USER && ['admin','生産管理','製造','検査'].includes(CURRENT_USER.role||'')) {
      const bScan = document.createElement('button');
      bScan.className='btn ghost'; bScan.style.marginLeft='.35rem';
      bScan.innerHTML = '<i class="fa-solid fa-qrcode"></i> スキャン';
      bScan.onclick = ()=> alert('QRスキャンは次ステップ：camera dialog + jsQR（placeholder）');
      op.appendChild(bScan);
    }
    tr.appendChild(op);

    tb.appendChild(tr);
  });
}

async function refresh(){
  const j = await apip('orders_list');
  renderOrders(j.rows || []);
  // statistik kecil (placeholder cepat)
  $('#gridProc').innerHTML = '';
  const counts = {};
  (j.rows||[]).forEach(r=>{
    const p = r.current_process||'—';
    counts[p] = (counts[p]||0)+1;
  });
  Object.entries(counts).forEach(([k,v])=>{
    const chipEl = chip(`${k}  ${v}`,'badge-proc');
    chipEl.style.marginRight = '.35rem';
    $('#gridProc').appendChild(chipEl);
  });
}

/** 8) Manual update dialog */
function fillSelect(sel, arr){
  sel.innerHTML = ''; arr.forEach(x=>{
    const o=document.createElement('option'); o.textContent = x; sel.appendChild(o);
  });
}

function openManual(po, prevStatus, prevProc){
  $('#manPO').textContent = po;
  fillSelect($('#manProcess'), PROCESSES);
  fillSelect($('#manStatus'), STATUS);
  $('#manOk').value = 0; $('#manNg').value = 0; $('#manNote').value = '';
  $('#dlgManual').showModal();
  $('#btnManSave').onclick = async ()=>{
    try{
      const data = {
        po_id: po,
        prev_status: prevStatus||'',
        prev_process: prevProc||'',
        new_process: $('#manProcess').value,
        new_status: $('#manStatus').value,
        ok_qty: +($('#manOk').value||0),
        ng_qty: +($('#manNg').value||0),
        note: $('#manNote').value||''
      };
      await apip('manual_update', data);
      $('#dlgManual').close();
      await refresh();
    }catch(e){ alert(e.message||e); }
  };
  $('#btnManClose').onclick = ()=> $('#dlgManual').close();
}

/** 9) Weather (ringkas, no key) */
(async function weatherInit(){
  const W = (id)=>document.getElementById(id);
  try{
    const fallback = {lat:35.68, lon:139.76, city:'東京'};
    const pos = await new Promise(res=>{
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(p=>res(p.coords), _=>res(null), {timeout:5000});
    });
    const lat = pos?.latitude ?? fallback.lat, lon = pos?.longitude ?? fallback.lon;
    const cityRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ja`);
    const cityJ = await cityRes.json().catch(_=>({}));
    const city = cityJ.city || cityJ.locality || cityJ.principalSubdivision || fallback.city;
    const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`, {cache:'no-store'});
    const wJ = await wRes.json();
    W('wxCity').textContent = city||'—';
    const t = Math.round(wJ?.current_weather?.temperature ?? NaN);
    W('wxTemp').textContent = (isFinite(t)?t:'--')+'℃';
    W('wxIcon').textContent = '●';
  }catch{}
})();

/** 10) Events */
document.addEventListener('DOMContentLoaded', ()=>{
  guardNavEnabled(false);
  // nav click
  $$('.navbtn').forEach(b=> b.addEventListener('click', ()=>{
    if (b.closest('#navRight')?.getAttribute('aria-disabled') === 'true') return;
    show(b.dataset.goto);
  }));
  // login
  $('#btnLogin')?.addEventListener('click', login);
  $('#btnNewUser')?.addEventListener('click', addUserAdmin);
  $('#btnLogout')?.addEventListener('click', logout);
  $('#btnRefresh')?.addEventListener('click', refresh);

  // station QR dialog
  $('#miStationQR')?.addEventListener('click', async ()=>{
    const j = await apip('station_list');
    alert('工程QR: \n- '+ (j.processes||[]).join('\n- '));
  });

  // Mulai di auth
  show('authView');
});
