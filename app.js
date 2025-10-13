/* =================================================
JSONP Frontend (Optimized, with Inventory + Station QR universal)
- Dashboard status merge StatusLog
- CRUD: 受注 / 生産計画 / 出荷予定 / 完成品一覧 / 在庫(表示)
- 操作: QR 工程(Station, universal) + 手入力 (OK/NG/工程)
- Import / Export / Print
- Cuaca (Open-Meteo, cached)
- 請求書 (multi-line) + PriceMaster + PDF
================================================= */

const API_BASE = "https://script.google.com/macros/s/AKfycbxf74M8L8PhbzSRR_b-A-3MQ7hqrDBzrJe-X_YXsoLIaC-zxkAiBMEt1H4ANZxUM1Q/exec";

/* ---------- DOM helpers ---------- */
const $ = (q,el=document)=> el.querySelector(q);
const $$ = (q,el=document)=> [...el.querySelectorAll(q)];
const qs = (o)=> Object.entries(o).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const fmt = (d)=> d? new Date(d).toLocaleString("ja-JP"):"";
const normalizeProc = (s)=> String(s||"").trim()
  .replace("レーサ加工","レザー加工").replace("外作加工","外注加工/組立") || "未設定";

/* ---------- tiny styles injection ---------- */
(function injectStyles(){
  if($('#__injected_dash_styles')) return;
  const css = `
.table .center{ text-align:center }
.row{ display:flex; gap:.5rem; align-items:center }
.row-between{ display:flex; justify-content:space-between; align-items:center; gap:.5rem }
.actions{ display:flex; justify-content:center; gap:.5rem; flex-wrap:wrap }
.btn.icon{ display:inline-flex; align-items:center; gap:.4rem }
.chip{ display:inline-flex; align-items:center; gap:.35rem; padding:.2rem .55rem; border-radius:999px; background:#eef2ff; font-size:.85em; white-space:nowrap }
.badge{ display:inline-flex; align-items:center; gap:.35rem; padding:.2rem .55rem; border-radius:8px; background:#f1f5f9; font-size:.85em; white-space:nowrap }
.p-laser{ background:#fef3c7 }
.p-bend{ background:#e0f2fe }
.p-press{ background:#e2e8f0 }
.p-assembly{ background:#e9d5ff }
.p-inspection{ background:#dcfce7 }
.p-other{ background:#f1f5f9 }
.cell-stack{ display:flex; flex-direction:column; align-items:center; gap:.25rem }
.counts{ display:flex; gap:.4rem; }
.counts .count{ font-size:.78em; padding:.15rem .45rem; border-radius:999px; background:#f8fafc }
.counts .ok{ background:#e2fbe2 }
.counts .ng{ background:#ffe4e6 }
.ship-item{ padding:.35rem .5rem; border-bottom:1px dashed #eee }
/* invoice builder */
.table-compact th,.table-compact td{ padding:6px 8px }
.input-sm{ height:32px; padding:4px 8px }
  `;
  const el = document.createElement('style'); el.id='__injected_dash_styles'; el.textContent = css; document.head.appendChild(el);
})();

/* ---------- JSONP helper ---------- */
function jsonp(action, params={}){ return new Promise((resolve,reject)=>{
  const cb = "cb_" + Math.random().toString(36).slice(2);
  params = { ...params, action, callback: cb };
  const s = document.createElement("script");
  s.src = `${API_BASE}?${qs(params)}`;
  let timeout = setTimeout(()=>{ cleanup(); reject(new Error("API timeout")); }, 20000);
  function cleanup(){ delete window[cb]; s.remove(); clearTimeout(timeout); }
  window[cb] = (resp)=>{ cleanup(); if(resp && resp.ok) resolve(resp.data); else reject(new Error((resp && resp.error) || "API error")); };
  s.onerror = ()=>{ cleanup(); reject(new Error("JSONP load error")); };
  document.body.appendChild(s);
}); }

/* ---------- MEM cache ---------- */
const apiCache = new Map();
async function cached(action, params={}, ttlMs=15000){
  const key = action + ":" + JSON.stringify(params||{});
  const hit = apiCache.get(key);
  const now = Date.now();
  if(hit && now-hit.t < ttlMs) return hit.v;
  const v = await jsonp(action, params);
  apiCache.set(key, {v, t: now});
  return v;
}

/* ---------- Badges ---------- */
const procToChip = (p)=>{ p = normalizeProc(p);
  if(/レザー加工|レーザー/.test(p)) return `<span class="chip p-laser"><i class="fa-solid fa-bolt"></i>${p}</span>`;
  if(/曲げ/.test(p)) return `<span class="chip p-bend"><i class="fa-solid fa-wave-square"></i>${p}</span>`;
  if(/外注加工|加工/.test(p)) return `<span class="chip p-press"><i class="fa-solid fa-compass-drafting"></i>${p}</span>`;
  if(/組立/.test(p)) return `<span class="chip p-assembly"><i class="fa-solid fa-screwdriver-wrench"></i>${p}</span>`;
  if(/検査/.test(p)) return `<span class="chip p-inspection"><i class="fa-regular fa-square-check"></i>${p}</span>`;
  return `<span class="chip p-other"><i class="fa-regular fa-square"></i>${p||'—'}</span>`;
};
const statusToBadge = (s)=>{ s = String(s||"");
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
  'admin':       { pages:['pageDash','pageSales','pagePlan','pageShip','pageFinished','pageInv','pageInvoice'], nav:true },
  '営業':        { pages:['pageSales','pageDash','pageFinished','pageInv','pageInvoice'], nav:true },
  '生産管理':     { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv','pageInvoice'], nav:true },
  '生産管理部':    { pages:['pagePlan','pageShip','pageDash','pageFinished','pageInv','pageInvoice'], nav:true },
  '製造':        { pages:['pageDash','pageFinished','pageInv'], nav:true },
  '検査':        { pages:['pageDash','pageFinished','pageInv'], nav:true }
};
function setUser(u){
  CURRENT_USER = u || null;
  $("#userInfo").textContent = u ? `${u.role} / ${u.department}` : "";

  const pages = ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice"];
  pages.forEach(p => $("#"+p)?.classList.add("hidden"));

  ['btnToDash','btnToSales','btnToPlan','btnToShip','btnToFinPage','btnToInvPage','btnToInvoice','ddSetting','weatherWrap']
    .forEach(id=> $("#"+id)?.classList.add("hidden"));

  if(!u){ $("#authView")?.classList.remove("hidden"); return; }

  const allow = ROLE_MAP[u.role] || ROLE_MAP[u.department] || ROLE_MAP['admin'];
  if(allow?.nav){
    if(allow.pages.includes('pageDash'))      $("#btnToDash").classList.remove("hidden");
    if(allow.pages.includes('pageSales'))     $("#btnToSales").classList.remove("hidden");
    if(allow.pages.includes('pagePlan'))      $("#btnToPlan").classList.remove("hidden");
    if(allow.pages.includes('pageShip'))      $("#btnToShip").classList.remove("hidden");
    if(allow.pages.includes('pageFinished'))  $("#btnToFinPage").classList.remove("hidden");
    if(allow.pages.includes('pageInv'))       $("#btnToInvPage").classList.remove("hidden");
    if(allow.pages.includes('pageInvoice'))   $("#btnToInvoice").classList.remove("hidden");
    $("#ddSetting").classList.remove("hidden");
    $("#weatherWrap").classList.remove("hidden");
    ensureWeather();
    loadMasters();
  }
  show("pageDash");
  refreshAll();
}

/* ---------- Nav ---------- */
function show(id){
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice"]
    .forEach(p=> $("#"+p)?.classList.add("hidden"));
  $("#"+id)?.classList.remove("hidden");
}
$("#btnToDash").onclick     = ()=>{ show("pageDash");    refreshAll(); };
$("#btnToSales").onclick    = ()=>{ show("pageSales");   loadSales(); };
$("#btnToPlan").onclick     = ()=>{ show("pagePlan");    loadPlans(); };
$("#btnToShip").onclick     = ()=>{ show("pageShip");    loadShips(); };
$("#btnToFinPage").onclick  = ()=>{ show("pageFinished");loadFinished(); };
$("#btnToInvPage").onclick  = ()=>{ show("pageInv");     loadInventory(); };
$("#btnToInvoice").onclick  = ()=>{ show("pageInvoice"); loadInvoices(); };
$("#btnLogout").onclick     = ()=> setUser(null);

/* ---------- Login ---------- */
$("#btnLogin").onclick = loginSubmit;
$("#inUser").addEventListener("keydown", e=>{ if(e.key==='Enter') loginSubmit(); });
$("#inPass").addEventListener("keydown", e=>{ if(e.key==='Enter') loginSubmit(); });
async function loginSubmit(){
  const u = $("#inUser").value.trim();
  const p = $("#inPass").value.trim();
  if(!u || !p) return alert("ユーザー名 / パスワード を入力してください");
  try{
    await jsonp('ping');
    const me = await jsonp("login", { username:u, password:p });
    setUser(me);
  }catch(e){ alert("ログイン失敗: " + (e?.message || e)); }
}

/* ---------- Dashboard + 操作 ---------- */
// ... (SEMUA KODE DASHBOARD/SALES/PLAN/SHIP/FIN/INV & QR — tetap sama seperti versi Anda) ...
// (Potongan tersebut sudah ada di file Anda; saya tidak ulangi di sini agar jawaban tidak terlalu panjang)
// ===> Catatan: gunakan versi lengkap app.js yang Anda kirim terakhir + penambahan modul invoice di bawah <==

/* =========================
   ===== INVOICE UI ========
   ========================= */

const INV_HEADERS = ['invoice_no','customer','bill_to','issue_date','due_date','currency','tax_rate','sub_total','tax_amount','grand_total','status','note','updated_at','updated_by'];

async function loadInvoices(){
  const dat = await cached('listInvoices', {}, 5000);
  const th = $("#thInvoice"), tb = $("#tbInvoice"), search = $("#invoiceSearch");
  th.innerHTML = `<tr>
    <th>請求番号</th><th>得意先</th><th>請求日</th><th>支払期日</th>
    <th class="right">小計</th><th class="right">消費税</th><th class="right">合計</th>
    <th>状態</th><th>更新日時</th><th>操作</th></tr>`;

  const head = dat.header||INV_HEADERS;
  const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
  const render = ()=>{
    const q = (search?.value||'').toLowerCase();
    tb.innerHTML = '';
    const rows = dat.rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    const frag = document.createDocumentFragment();
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${r[idx['invoice_no']]||''}</b></td>
        <td>${r[idx['customer']]||''}</td>
        <td>${(r[idx['issue_date']]||'').toString().slice(0,10)}</td>
        <td>${(r[idx['due_date']]||'').toString().slice(0,10)}</td>
        <td class="right">${Number(r[idx['sub_total']]||0).toLocaleString()}</td>
        <td class="right">${Number(r[idx['tax_amount']]||0).toLocaleString()}</td>
        <td class="right">${Number(r[idx['grand_total']]||0).toLocaleString()}</td>
        <td>${r[idx['status']]||''}</td>
        <td>${r[idx['updated_at']]? new Date(r[idx['updated_at']]).toLocaleString('ja-JP'):''}</td>
        <td class="center">
          <div class="row">
            <button class="btn ghost btn-inv-edit" data-id="${r[idx['invoice_no']]}"><i class="fa-regular fa-pen-to-square"></i> 編集</button>
            <button class="btn ghost btn-inv-pdf"  data-id="${r[idx['invoice_no']]}"><i class="fa-regular fa-file-pdf"></i> PDF</button>
            <button class="btn ghost btn-inv-del"  data-id="${r[idx['invoice_no']]}"><i class="fa-regular fa-trash-can"></i> 削除</button>
          </div>
        </td>`;
      frag.appendChild(tr);
    });
    tb.appendChild(frag);
    $$(".btn-inv-edit",tb).forEach(b=> b.onclick = ()=> openInvoiceEditor(b.dataset.id));
    $$(".btn-inv-pdf",tb).forEach(b=> b.onclick = ()=> downloadInvoicePdf(b.dataset.id));
    $$(".btn-inv-del",tb).forEach(b=> b.onclick = ()=> deleteInvoice(b.dataset.id));
  };
  if(search && !search._bind){ search._bind=true; search.oninput = debounce(render, 250); }
  render();

  $("#btnInvNew").onclick = ()=> openInvoiceEditor('');
  $("#btnInvExportList").onclick = ()=> exportTableCSV("#tbInvoice","invoices.csv");
  $("#btnInvPrintList").onclick  = ()=> window.print();
}

/* --- Invoice Editor (dialog full-screen feel) --- */
async function openInvoiceEditor(invoice_no){
  let inv = { header:{invoice_no:'', customer:'', bill_to:'', issue_date:'', due_date:'', currency:'JPY', tax_rate:10, status:'発行済', note:''}, lines:[] };
  if(invoice_no){
    const d = await jsonp('getInvoice', { invoice_no });
    inv = d;
  }

  // builder HTML
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <dialog id="dlgInvoice" class="paper" style="max-width:1100px;width:96%">
    <div class="body">
      <h3>請求書 ${inv.header.invoice_no? '編集: '+inv.header.invoice_no : '作成'}</h3>
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap:10px">
        <div class="form-item"><div class="muted s">得意先</div><input id="ivCustomer" value="${inv.header.customer||''}"></div>
        <div class="form-item"><div class="muted s">請求先(Bill To)</div><input id="ivBillTo" value="${inv.header.bill_to||''}"></div>
        <div class="form-item"><div class="muted s">請求日</div><input id="ivIssue" type="date"></div>
        <div class="form-item"><div class="muted s">支払期日</div><input id="ivDue" type="date"></div>
        <div class="form-item"><div class="muted s">通貨</div><input id="ivCur" class="input-sm" value="${inv.header.currency||'JPY'}"></div>
        <div class="form-item"><div class="muted s">税率(%)</div><input id="ivTax" class="input-sm" type="number" min="0" value="${inv.header.tax_rate!=null? inv.header.tax_rate : 10}"></div>
        <div class="form-item"><div class="muted s">状態</div>
          <select id="ivStatus" class="input-sm">
            <option value="発行済">発行済</option>
            <option value="支払済">支払済</option>
          </select>
        </div>
        <div class="form-item" style="grid-column:1/-1"><div class="muted s">備考</div><input id="ivNote" value="${inv.header.note||''}"></div>
      </div>

      <div class="row" style="margin:.6rem 0">
        <button id="btnAddFromShip" class="btn"><i class="fa-solid fa-plus"></i> 出荷済から追加</button>
        <button id="btnAddBlank" class="btn ghost"><i class="fa-solid fa-plus"></i> 行を追加</button>
      </div>

      <div class="table-wrap" style="max-height:48vh">
        <table class="table table-compact">
          <thead>
            <tr>
              <th>#</th><th>注番</th><th>品名</th><th>品番</th><th>図番</th>
              <th class="right">数量</th><th class="right">単価</th><th class="right">金額</th><th class="right">税</th><th class="right">合計</th><th></th>
            </tr>
          </thead>
          <tbody id="tbIvLines"></tbody>
          <tfoot>
            <tr><td colspan="7" class="right">小計</td><td class="right" id="ivSub">0</td><td class="right" id="ivTaxAmt">0</td><td class="right" id="ivGrand">0</td><td></td></tr>
          </tfoot>
        </table>
      </div>
    </div>
    <footer class="row-between">
      <div class="row">
        <button class="btn ghost" id="btnIvPdf"><i class="fa-regular fa-file-pdf"></i> PDF</button>
      </div>
      <div class="row">
        <button class="btn ghost" id="btnIvCancel">閉じる</button>
        <button class="btn primary" id="btnIvSave">保存</button>
      </div>
    </footer>
  </dialog>`;
  document.body.appendChild(wrap);
  const dlg = wrap.querySelector('#dlgInvoice'); dlg.showModal();

  // set dates
  const setDate = (id, v)=>{ const el = wrap.querySelector(id); if(!el) return;
    const d = v? new Date(v) : null; el.value = d && !isNaN(d) ? new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10) : '';
  };
  setDate('#ivIssue', inv.header.issue_date);
  setDate('#ivDue',   inv.header.due_date);
  wrap.querySelector('#ivStatus').value = inv.header.status || '発行済';

  // lines state
  let LINES = inv.lines.length? inv.lines.map(x=>({...x})) : [];

  const renderLines = ()=>{
    const tb = wrap.querySelector('#tbIvLines'); tb.innerHTML = '';
    let sub=0, tax=0, grand=0;
    LINES.forEach((ln,idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td><input class="input-sm" value="${ln.po_id||''}" data-k="po_id"></td>
        <td><input class="input-sm" value="${ln.item_name||''}" data-k="item_name" style="width:180px"></td>
        <td><input class="input-sm" value="${ln.part_no||''}" data-k="part_no"></td>
        <td><input class="input-sm" value="${ln.drawing_no||''}" data-k="drawing_no"></td>
        <td class="right"><input class="input-sm" type="number" min="0" step="1" value="${ln.qty||0}" data-k="qty" style="width:90px"></td>
        <td class="right"><input class="input-sm" type="number" min="0" step="0.01" value="${ln.unit_price||0}" data-k="unit_price" style="width:110px"></td>
        <td class="right">${Number(ln.amount||0).toLocaleString()}</td>
        <td class="right">${Number(ln.tax||0).toLocaleString()}</td>
        <td class="right">${Number(ln.total||0).toLocaleString()}</td>
        <td><button class="btn ghost btn-row-del" data-i="${idx}"><i class="fa-regular fa-trash-can"></i></button></td>`;
      tb.appendChild(tr);

      // bind change
      $$('input',tr).forEach(inp=>{
        inp.oninput = async ()=>{
          const k = inp.dataset.k;
          let v = inp.value;
          if(k==='qty' || k==='unit_price') v = Number(v||0);
          LINES[idx][k] = v;

          // auto price lookup jika kosong
          if(k==='part_no' && (!LINES[idx].unit_price || LINES[idx].unit_price===0)){
            const cust = wrap.querySelector('#ivCustomer').value.trim();
            const m = await cached('listPriceMaster', {}, 10000);
            // client-side lookup cepat
            const head = m.header||[];
            const ix = Object.fromEntries(head.map((h,i)=>[String(h).trim(), i]));
            const row = (m.rows||[]).find(r =>
              String(r[ix['customer']]||r[ix['得意先']]||'')===cust &&
              String(r[ix['part_no']]||r[ix['品番']]||'')===String(LINES[idx].part_no||'')
            );
            if(row){
              LINES[idx].unit_price = Number(row[ix['unit_price']]||0);
              if(!wrap.querySelector('#ivCur').value) wrap.querySelector('#ivCur').value = row[ix['currency']]||'JPY';
              if(!wrap.querySelector('#ivTax').value) wrap.querySelector('#ivTax').value = Number(row[ix['tax_rate']]||10);
            }
          }
          recalcAndPaint();
        };
      });
      tr.querySelector('.btn-row-del').onclick = ()=>{ LINES.splice(idx,1); recalcAndPaint(); };
      sub += Number(ln.amount||0); tax += Number(ln.tax||0); grand += Number(ln.total||0);
    });
    wrap.querySelector('#ivSub').textContent   = sub.toLocaleString();
    wrap.querySelector('#ivTaxAmt').textContent= tax.toLocaleString();
    wrap.querySelector('#ivGrand').textContent = grand.toLocaleString();
  };

  const recalcAndPaint = ()=>{
    const rate = Number(wrap.querySelector('#ivTax').value||10)/100;
    LINES = LINES.map((l,i)=>{
      const qty = Number(l.qty||0), up = Number(l.unit_price||0);
      const amount = Math.round(qty*up*100)/100;
      const tax = Math.round(amount*rate*100)/100;
      const total = Math.round((amount+tax)*100)/100;
      return {...l, line_no:(i+1), amount, tax, total};
    });
    renderLines();
  };

  // init lines
  if(!LINES.length){ LINES.push({ po_id:'', item_name:'', part_no:'', drawing_no:'', qty:0, unit_price:0, amount:0, tax:0, total:0 }); }
  recalcAndPaint();

  // Actions
  wrap.querySelector('#btnAddBlank').onclick = ()=>{ LINES.push({ po_id:'', item_name:'', part_no:'', drawing_no:'', qty:0, unit_price:0, amount:0, tax:0, total:0 }); recalcAndPaint(); };

  wrap.querySelector('#btnAddFromShip').onclick = async ()=>{
    const list = await cached('listShippedPOs', {}, 10000);
    const pick = document.createElement('div');
    pick.innerHTML = `
      <dialog id="dlgPick" class="paper" style="width:92%;max-width:1000px">
        <div class="body">
          <h3>出荷済から追加</h3>
          <div class="table-wrap" style="max-height:55vh">
            <table class="table s">
              <thead><tr><th></th>${list.header.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
              <tbody>${(list.rows||[]).map((r,i)=>`
                <tr>
                  <td><input type="checkbox" data-i="${i}"></td>
                  ${r.map(c=>`<td>${c??''}</td>`).join('')}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <footer class="row-end">
          <button class="btn ghost" id="btnPkCancel">閉じる</button>
          <button class="btn primary" id="btnPkAdd">追加</button>
        </footer>
      </dialog>`;
    document.body.appendChild(pick);
    const dlgp = pick.querySelector('#dlgPick'); dlgp.showModal();
    pick.querySelector('#btnPkCancel').onclick = ()=>{ dlgp.close(); pick.remove(); };
    pick.querySelector('#btnPkAdd').onclick = ()=>{
      const head = list.header||[];
      const ix = Object.fromEntries(head.map((h,i)=>[h,i]));
      $$('input[type="checkbox"]', pick).forEach(cb=>{
        if(cb.checked){
          const r = list.rows[cb.dataset.i];
          LINES.push({
            po_id: r[ix['po_id']]||r[ix['注番']]||'',
            item_name: r[ix['品名']]||'',
            part_no: r[ix['品番']]||'',
            drawing_no: r[ix['図番']]||'',
            qty: Number(r[ix['qty']]||0),
            unit_price: 0, amount:0, tax:0, total:0
          });
        }
      });
      dlgp.close(); pick.remove(); recalcAndPaint();
    };
  };

  wrap.querySelector('#ivTax').oninput = recalcAndPaint;

  wrap.querySelector('#btnIvCancel').onclick = ()=>{ dlg.close(); wrap.remove(); };

  wrap.querySelector('#btnIvSave').onclick = async ()=>{
    const payload = {
      invoice_no: inv.header.invoice_no || undefined,
      customer: wrap.querySelector('#ivCustomer').value.trim(),
      bill_to:  wrap.querySelector('#ivBillTo').value.trim(),
      issue_date: wrap.querySelector('#ivIssue').value,
      due_date:   wrap.querySelector('#ivDue').value,
      currency:   wrap.querySelector('#ivCur').value.trim() || 'JPY',
      tax_rate:   Number(wrap.querySelector('#ivTax').value||10),
      status:     wrap.querySelector('#ivStatus').value,
      note:       wrap.querySelector('#ivNote').value,
      lines:      LINES
    };
    if(!payload.customer) return alert('得意先を入力してください');
    if(!payload.issue_date) return alert('請求日を入力してください');
    if(!LINES.length) return alert('明細がありません');

    try{
      const res = await jsonp('saveInvoice', { data: JSON.stringify(payload), user: JSON.stringify(CURRENT_USER||{}) });
      alert('保存しました: ' + res.invoice_no);
      dlg.close(); wrap.remove();
      await loadInvoices();
    }catch(e){ alert('保存失敗: ' + e.message); }
  };

  wrap.querySelector('#btnIvPdf').onclick = async ()=>{
    try{
      const id = inv.header.invoice_no;
      const data = id? { invoice_no: id } : { data: JSON.stringify({
        ...inv.header,
        invoice_no: inv.header.invoice_no || 'PREVIEW',
        lines: LINES,
        currency: wrap.querySelector('#ivCur').value || 'JPY',
        tax_rate: Number(wrap.querySelector('#ivTax').value||10),
        issue_date: wrap.querySelector('#ivIssue').value,
        due_date: wrap.querySelector('#ivDue').value
      }) };
      const res = await jsonp('invoicePdf', data);
      const blob = b64toBlob(res.base64, res.contentType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
    }catch(e){ alert('PDF 生成失敗: ' + e.message); }
  };
}

async function downloadInvoicePdf(invoice_no){
  try{
    const res = await jsonp('invoicePdf', { invoice_no });
    const blob = b64toBlob(res.base64, res.contentType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = res.filename; a.click();
    URL.revokeObjectURL(url);
  }catch(e){ alert('PDF 生成失敗: ' + e.message); }
}
async function deleteInvoice(invoice_no){
  if(!confirm(`請求書を削除しますか？\nNo: ${invoice_no}`)) return;
  try{ await jsonp('deleteInvoice', { invoice_no }); await loadInvoices(); }catch(e){ alert('削除失敗: ' + e.message); }
}

/* ---------- Helpers ---------- */
function b64toBlob(b64, type='application/octet-stream'){
  const bin = atob(b64); const len = bin.length; const arr = new Uint8Array(len);
  for(let i=0;i<len;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type});
}

/* ---------- Weather / debounce / init ---------- */
// (tetap sama seperti sebelumnya)
async function ensureWeather(){ try{
  const cacheKey = 'wx_cache_v1';
  const cachedWX = JSON.parse(localStorage.getItem(cacheKey)||'null');
  const now = Date.now();
  if(cachedWX && (now - cachedWX.t) < 30*60*1000){ renderWeather(cachedWX.v); return; }
  let lat=35.6762, lon=139.6503;
  if(navigator.geolocation){
    await new Promise(res=> navigator.geolocation.getCurrentPosition(
      pos=>{ lat=pos.coords.latitude; lon=pos.coords.longitude; res(); },
      ()=> res(),
      {maximumAge: 600000, timeout: 2000}
    ));
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m&timezone=auto`;
  const v = await fetch(url).then(r=>r.json());
  localStorage.setItem(cacheKey, JSON.stringify({v,t:now}));
  renderWeather(v);
}catch(_){ } }
function renderWeather(v){
  if(!v?.current) return;
  $("#wxTemp").textContent = Math.round(v.current.temperature_2m) + "°C";
  $("#wxWind").textContent = Math.round(v.current.wind_speed_10m) + " m/s";
  $("#wxPlace").textContent = v.timezone_abbreviation || "";
}
function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }
document.addEventListener("DOMContentLoaded", ()=> setUser(null));
