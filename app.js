// ====== KONFIGURASI ======
const API_BASE = 'https://script.google.com/macros/s/AKfycbyZZe7ZSpYM3ogRgb7a9AjK8D9NWfeax0VuI0XcNmKLsjYvtGvrbstpEE1TMQ-V8ETs/exec'; // <--- GANTI dengan URL /exec
const STORAGE_KEY = 'erp.session';

const PROCESSES = [
  '準備','シャッター溶接','レザー加工','曲げ加工','外注加工/組立','検査工程','出荷（組立中）','出荷（組立済）'
];

const STATUS_SHOW = ['進行','組立中','組立済','検査中','出荷準備','出荷済','NG'];

let SESSION = null;        // {user, role, dept, token}
let SELECTED_PO = null;    // contoh state

// ====== UTIL ======
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
function show(id){ $(id).classList.remove('hide'); }
function hide(id){ $(id).classList.add('hide'); }
function toast(msg){ alert(msg); }

// ==== API tanpa preflight (form-encoded) ====
async function API(action, data={}) {
  if (!API_BASE || !/^https:\/\/script\.googleusercontent\.com|^https:\/\/script\.google\.com/.test(API_BASE)) {
    throw new Error('API_BASE belum di-set');
  }
  const body = new URLSearchParams({ payload: JSON.stringify({ action, token:SESSION?.token, ...data }) });
  const r = await fetch(API_BASE, {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
    body
  });
  const txt = await r.text();
  try { return JSON.parse(txt); }
  catch(e){ throw new Error(txt||'API error'); }
}

// ====== AUTH ======
function applyRoleVisibility(role){
  // menu tombol
  $$('.menu').forEach(btn=>{
    const allow = (btn.dataset.roles||'').split(',').includes(role) || role==='admin';
    btn.classList.toggle('hide', !allow);
  });
  // settings dropdown
  $('#ddSetting').classList.remove('hide');
  // per item dalam panel settings
  $$('#ddSetting .menu-item').forEach(mi=>{
    const roles = (mi.dataset.roles||'営業,生産管理,製造,検査,admin').split(',');
    const ok = roles.includes(role) || role==='admin';
    mi.classList.toggle('hide', !ok);
  });
}

async function login(){
  const username = $('#inUser').value.trim();
  const password = $('#inPass').value.trim();
  if(!username || !password) return toast('ユーザー名とパスワード');

  const res = await API('login', { username, password });
  if(!res.ok) throw new Error(res.error||'ログイン失敗');

  SESSION = res.data; // {user, role, dept, token}
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SESSION));

  $('#userInfo').textContent = `${SESSION.user} / ${SESSION.dept} (${SESSION.role})`;

  // NAV tampil, login hilang
  show('#nav'); hide('#authView');
  applyRoleVisibility(SESSION.role);
  go('dash');
}

function restoreSession(){
  try{
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(s && s.token){ SESSION = s; $('#userInfo').textContent = `${s.user} / ${s.dept} (${s.role})`; show('#nav'); hide('#authView'); applyRoleVisibility(s.role); go('dash'); }
  }catch{}
}

function logout(){
  localStorage.removeItem(STORAGE_KEY);
  SESSION=null;
  hide('#nav');
  show('#authView');
}

// ====== NAVIGATION ======
function go(name){
  ['dash','sales','plan','ship','inv','fin','invoice','charts'].forEach(p=>hide(`#page${cap(p)}`));
  show(`#page${cap(name)}`);
  if(name==='dash') refresh();
}
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);

// ====== DASHBOARD DEMO LOAD ======
async function refresh(){
  // contoh panggil data
  try{
    const res = await API('listOrders', {});
    if(!res.ok) throw new Error(res.error||'NG');

    const rows = res.data||[];
    const tb = $('#tbOrders'); tb.innerHTML='';
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      // 状態: tanpa OK/NG, proses label sudah ganti 外注加工/組立
      tr.innerHTML = `
        <td><div class="muted s">注番</div>${r.po_id||'-'}<div class="muted s">${r.customer||''}</div></td>
        <td>${r.item_name||''}</td>
        <td>${r.part_no||''}</td>
        <td>${r.draw_no||''}</td>
        <td><span class="chip">${r.status||'進行'}</span></td>
        <td><span class="chip">${r.current_process||''}</span></td>
        <td>${r.updated_at||''}</td>
        <td>${r.updated_by||''}</td>
        <td class="row">
          <button class="btn ghost s" onclick="openManual('${r.po_id}')">手動更新</button>
          <button class="btn ghost s" onclick="scanStart('${r.po_id}')">スキャン</button>
        </td>`;
      tb.appendChild(tr);
    });

    // ringkas WIP (dummy: hitung berdasarkan current_process)
    const wip = {};
    rows.forEach(r=>{ const k=r.current_process||'—'; wip[k]=(wip[k]||0)+1; });
    const grid = $('#gridProc'); grid.innerHTML='';
    Object.entries(wip).forEach(([k,v])=>{
      const b = document.createElement('div');
      b.className='chip'; b.textContent=`${k} ${v}`;
      grid.appendChild(b);
    });

  }catch(e){
    console.error(e);
    toast('読み込みに失敗しました。API_BASE を確認してください。');
  }
}

// ====== MANUAL UPDATE DIALOG ======
function openManual(po){
  SELECTED_PO = po;
  // isi pilihan proses
  const sel = $('#manProc'); sel.innerHTML='';
  PROCESSES.forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p; sel.appendChild(o); });

  $('#manOk').value = 0; $('#manNg').value = 0; $('#manNote').value = '';
  $('#dlgManual').showModal();
}
$('#btnManCancel').onclick = ()=> $('#dlgManual').close();
$('#btnManSave').onclick = async ()=>{
  try{
    const payload = {
      po_id: SELECTED_PO,
      process: $('#manProc').value,
      status: $('#manStatus').value,
      ok_qty: +$('#manOk').value||0,
      ng_qty: +$('#manNg').value||0,
      note: $('#manNote').value||''
    };
    const res = await API('updateProcess', payload);
    if(!res.ok) throw new Error(res.error||'更新失敗');
    $('#dlgManual').close();
    refresh();
  }catch(e){ toast(e.message); }
};

// ====== QR (placeholder) ======
function scanStart(po){ alert(`QRスキャン（PO: ${po}）\n※ 実装は既存のjsQRでOK`); }

// ====== WEATHER (ringkas) ======
(async function weather(){
  try{
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.68&longitude=139.76&current_weather=true&timezone=auto',{cache:'no-store'});
    const j = await r.json(); $('#wxTemp').textContent = Math.round(j.current_weather.temperature)+'℃'; $('#wxCity').textContent='横浜市';
  }catch{ /* ignore */ }
})();

// ====== EVENT BIND ======
window.addEventListener('DOMContentLoaded', ()=>{
  $('#btnLogin').onclick = () => login().catch(e=>toast(e.message));
  $('#btnLogout').onclick = logout;

  // nav route
  $$('.nav-right .menu').forEach(b=> b.addEventListener('click',()=> go(b.dataset.menu)));

  // default: hide nav
  hide('#nav');
  restoreSession();
});
