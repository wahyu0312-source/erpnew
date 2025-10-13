/* =================================================
JSONP Frontend (Optimized, with Inventory + Station QR universal + Invoices)
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


/* ============================================================
   ===== 請求書 (Invoices) — menu, editor, list, PDF =====
   - 新規: isi header → 出荷済から追加 → edit unit price kalau perlu → 保存
   - Status: 発行済 / 支払済
   - PDF: tombol di editor & per baris daftar
============================================================ */
const INV_STATUS = ["発行済","支払済"];

function navShow(id){
  ["authView","pageDash","pageSales","pagePlan","pageShip","pageFinished","pageInv","pageInvoice"]
    .forEach(p=> document.getElementById(p)?.classList.add("hidden"));
  document.getElementById(id)?.classList.remove("hidden");
}
document.getElementById("btnToInvoice").onclick = ()=>{ navShow("pageInvoice"); loadInvoiceList(); };

/* ---- List view ---- */
async function loadInvoiceList(){
  const list = await jsonp("listInvoices").catch(()=>({header:[],rows:[]}));
  const head = list.header||[];
  const idx  = Object.fromEntries(head.map((h,i)=>[String(h).trim(),i]));
  const tb = document.getElementById("tbInvoices");
  const th = document.getElementById("thInvoices");
  th.innerHTML = `<tr><th>請求No</th><th>得意先</th><th>請求先</th><th>請求日</th><th>税率</th><th>通貨</th><th>状態</th><th>操作</th></tr>`;
  tb.innerHTML = '';

  const toDate = (v)=>{ const d=(v instanceof Date)?v:new Date(v); return isNaN(d)?'':d.toLocaleDateString('ja-JP'); };

  (list.rows||[]).forEach(r=>{
    const inv = r[idx['invoice_id']] || r[0];
    const tr  = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${inv||''}</b></td>
      <td>${r[idx['得意先']]||''}</td>
      <td>${r[idx['請求先']]||''}</td>
      <td>${toDate(r[idx['請求日']])||''}</td>
      <td>${r[idx['税率']]??''}</td>
      <td>${r[idx['通貨']]||''}</td>
      <td>${r[idx['状態']]||''}</td>
      <td class="center">
        <div class="row">
          <button class="btn ghost btn-edit-inv" data-id="${inv}"><i class="fa-regular fa-pen-to-square"></i> 編集</button>
          <button class="btn ghost btn-pdf" data-id="${inv}"><i class="fa-regular fa-file-pdf"></i> PDF</button>
          <button class="btn ghost btn-del-inv" data-id="${inv}"><i class="fa-regular fa-trash-can"></i> 削除</button>
        </div>
      </td>`;
    tb.appendChild(tr);
  });

  document.querySelectorAll(".btn-edit-inv").forEach(b=> b.onclick = (e)=> openInvoiceEditor(e.currentTarget.dataset.id));
  document.querySelectorAll(".btn-del-inv").forEach(b=> b.onclick = async (e)=>{
    const id = e.currentTarget.dataset.id;
    if(!confirm(`請求書 ${id} を削除しますか？`)) return;
    await jsonp("deleteInvoice", { invoice_id: id });
    await loadInvoiceList();
  });
  document.querySelectorAll(".btn-pdf").forEach(b=> b.onclick = (e)=> openInvoicePdf(e.currentTarget.dataset.id));
}
document.getElementById("btnInvoiceCreate").onclick = ()=> openInvoiceEditor('');

/* ---- Editor ---- */
const INV_HEADER_FIELDS = [
  {name:'invoice_id', label:'請求No'},
  {name:'得意先',     label:'得意先', type:'select', options:()=>MASTERS.customers, free:true},
  {name:'請求先',     label:'請求先'},
  {name:'請求日',     label:'請求日', type:'date'},
  {name:'税率',       label:'税率(%)'},
  {name:'通貨',       label:'通貨',   type:'select', options:['JPY','USD','IDR','EUR']},
  {name:'状態',       label:'状態',   type:'select', options: INV_STATUS},
  {name:'備考',       label:'備考'},
];

async function openInvoiceEditor(invoice_id){
  const dlg = document.getElementById("dlgInvoice");
  const body= document.getElementById("invFormBody");
  const linesWrap = document.getElementById("invLines");
  const btnAdd    = document.getElementById("btnAddFromShipped");
  const btnSave   = document.getElementById("btnInvSave");
  const btnPdf    = document.getElementById("btnInvPdf");

  // load header+lines kalau ada
  let header = {}, lines=[];
  if(invoice_id){
    const pack = await jsonp("exportInvoice", { invoice_id });
    header = pack.header || {};
    lines  = pack.lines  || [];
  }else{
    header = { 状態:'発行済', 税率:'10', 通貨:'JPY', 請求日: new Date().toISOString().slice(0,10) };
    lines  = [];
  }

  // render header fields
  body.innerHTML = '';
  INV_HEADER_FIELDS.forEach(x=>{
    const wrap = document.createElement('div'); wrap.className = 'form-item';
    const label = `<div class="muted s">${x.label}</div>`;
    let html = '';
    const val = header[x.name] ?? '';
    if(x.type==='select' && x.free){
      const id = `dl-${x.name}-${Math.random().toString(36).slice(2)}`;
      const opts = (typeof x.options==='function'? x.options(): x.options)||[];
      html = `<input name="${x.name}" list="${id}" value="${val??''}" placeholder="${x.label}"><datalist id="${id}">${opts.map(o=>`<option value="${o}">`).join('')}</datalist>`;
    }else if(x.type==='select'){
      const opts = (typeof x.options==='function'? x.options(): x.options)||[];
      html = `<select name="${x.name}">${opts.map(o=>`<option value="${o}">${o}</option>`).join('')}</select>`;
      setTimeout(()=>{ const s=body.querySelector(`[name="${x.name}"]`); if(s) s.value=String(val??''); },0);
    }else if(x.type==='date'){
      const iso = val ? new Date(val).toISOString().slice(0,10) : '';
      html = `<input name="${x.name}" type="date" value="${iso}">`;
    }else{
      html = `<input name="${x.name}" value="${val??''}" placeholder="${x.label}">`;
    }
    wrap.innerHTML = label+html;
    body.appendChild(wrap);
  });

  // render lines editable
  const drawLines = ()=>{
    linesWrap.innerHTML = `
      <table class="table s">
        <thead><tr>
          <th style="width:110px">注番</th><th>品名</th><th>品番</th><th>図番</th>
          <th class="right" style="width:100px">数量</th>
          <th class="right" style="width:120px">単価</th>
          <th class="right" style="width:120px">金額</th>
          <th>備考</th><th></th>
        </tr></thead>
        <tbody id="invTB"></tbody>
      </table>`;
    const tb = document.getElementById('invTB');
    tb.innerHTML = '';
    lines.forEach((ln,idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="cell" data-k="注番" value="${ln['注番']||''}"></td>
        <td><input class="cell" data-k="品名" value="${ln['品名']||''}"></td>
        <td><input class="cell" data-k="品番" value="${ln['品番']||''}"></td>
        <td><input class="cell" data-k="図番" value="${ln['図番']||''}"></td>
        <td class="right"><input class="cell right" data-k="数量" type="number" step="1" value="${ln['数量']||0}"></td>
        <td class="right"><input class="cell right" data-k="単価" type="number" step="0.01" value="${ln['単価']||0}"></td>
        <td class="right"><input class="cell right" data-k="金額" type="number" step="0.01" value="${ln['金額']|| (Number(ln['数量']||0)*Number(ln['単価']||0)).toFixed(2)}"></td>
        <td><input class="cell" data-k="備考" value="${ln['備考']||''}"></td>
        <td class="center"><button class="btn ghost btn-del-line" data-idx="${idx}"><i class="fa-regular fa-trash-can"></i></button></td>
      `;
      tb.appendChild(tr);
    });
    tb.querySelectorAll('.cell').forEach(inp=>{
      inp.oninput = ()=>{
        const tr = inp.closest('tr'); const rowIndex = [...tr.parentNode.children].indexOf(tr);
        const key = inp.dataset.k; let v = inp.value;
        if(key==='数量' || key==='単価' || key==='金額') v = Number(v||0);
        lines[rowIndex][key]=v;
        if(key==='数量' || key==='単価'){ lines[rowIndex]['金額'] = Number(lines[rowIndex]['数量']||0) * Number(lines[rowIndex]['単価']||0); drawLines(); }
      };
    });
    tb.querySelectorAll('.btn-del-line').forEach(b=> b.onclick = ()=>{ lines.splice(Number(b.dataset.idx),1); drawLines(); });
  };
  drawLines();

  // add from shipped
  btnAdd.onclick = async ()=>{
    // pilih PO dari Shipments yang 出荷済 (checklist sederhana)
    const list = await jsonp("listShip");
    const head = list.header||[]; const idx = Object.fromEntries(head.map((h,i)=>[String(h).trim(),i]));
    const statusCol = idx['status'] ?? idx['状態'];
    const poCol = idx['po_id'] ?? idx['注番'];
    const rows = (list.rows||[]).filter(r => /出荷済/.test(String(r[statusCol]||'')));
    const pos = [...new Set(rows.map(r=> String(r[poCol]||'')).filter(Boolean))];
    if(!pos.length){ alert('出荷済データがありません'); return; }

    // quick picker
    const html = `
      <dialog id="dlgPick" class="paper">
        <div class="body"><h3>出荷済から追加</h3>
          <div style="max-height:45vh;overflow:auto;border:1px solid var(--border);border-radius:12px;padding:.5rem">
            ${pos.map(p=>`<label class="row" style="padding:.25rem .35rem"><input type="checkbox" value="${p}"> <span>${p}</span></label>`).join('')}
          </div>
        </div>
        <footer class="row-end">
          <button class="btn ghost" id="pkCancel">閉じる</button>
          <button class="btn" id="pkOk">追加</button>
        </footer>
      </dialog>`;
    const wrap=document.createElement('div'); wrap.innerHTML=html; document.body.appendChild(wrap);
    const dlgP=wrap.querySelector('#dlgPick'); dlgP.showModal();
    wrap.querySelector('#pkCancel').onclick = ()=>{ dlgP.close(); wrap.remove(); };
    wrap.querySelector('#pkOk').onclick = async ()=>{
      const sel = [...wrap.querySelectorAll('input[type="checkbox"]:checked')].map(c=>c.value);
      if(!sel.length){ alert('選択してください'); return; }
      const invId = (body.querySelector('[name="invoice_id"]').value || '').trim() || `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*900)+100}`;
      body.querySelector('[name="invoice_id"]').value = invId;
      const resp = await jsonp("invoiceAddFromShip", { invoice_id: invId, po_list: JSON.stringify(sel) });
      // merge ke lines
      const pack = await jsonp("exportInvoice", { invoice_id: invId });
      lines = pack.lines || [];
      drawLines();
      dlgP.close(); wrap.remove();
    };
  };

  // save header + semua lines
  btnSave.onclick = async ()=>{
    // header
    const data = {};
    body.querySelectorAll('[name]').forEach(i=>{
      let v = i.value;
      if(i.type==='date' && v) v = new Date(v).toISOString().slice(0,10);
      data[i.name]=v;
    });
    const invId = data.invoice_id || '';
    await jsonp("saveInvoice", { data: JSON.stringify(data), user: JSON.stringify(CURRENT_USER||{}) });

    // save lines
    for(const [i,ln] of lines.entries()){
      const payload = { ...ln, invoice_id: data.invoice_id, 行番: ln['行番'] || (i+1) };
      await jsonp("saveInvoiceLine", { data: JSON.stringify(payload), user: JSON.stringify(CURRENT_USER||{}) });
    }
    alert('保存しました');
    dlg.close();
    await loadInvoiceList();
  };

  // pdf preview
  btnPdf.onclick = ()=>{
    const invId = (body.querySelector('[name="invoice_id"]').value||'').trim();
    if(!invId){ alert('先に保存してください'); return; }
    openInvoicePdf(invId);
  };

  document.getElementById("btnInvCancel").onclick = ()=> dlg.close();
  dlg.showModal();
}

/* ---- PDF window ---- */
async function openInvoicePdf(invoice_id){
  const pack = await jsonp("exportInvoice", { invoice_id });
  if(!pack || !pack.header) return alert('データが見つかりません');

  const H = pack.header, L = pack.lines||[];
  const d = (v)=>{ const x=(v instanceof Date)?v:new Date(v); return isNaN(x)?'':x.toLocaleDateString('ja-JP'); };
  const taxRate = Number(H['税率']||0)/100;
  const sub = L.reduce((s,x)=> s + Number(x['金額']|| (Number(x['数量']||0)*Number(x['単価']||0))), 0);
  const tax= Math.round(sub*taxRate);
  const tot= sub+tax;

  const rowsHtml = L.map(x=>`
    <tr>
      <td class="t-center">${x['注番']||''}</td>
      <td>${x['品名']||''}</td>
      <td class="t-center">${x['品番']||''}</td>
      <td class="t-center">${x['図番']||''}</td>
      <td class="t-right">${Number(x['数量']||0).toLocaleString()}</td>
      <td class="t-right">${Number(x['単価']||0).toLocaleString()}</td>
      <td class="t-right">${Number(x['金額']|| (Number(x['数量']||0)*Number(x['単価']||0))).toLocaleString()}</td>
      <td>${x['備考']||''}</td>
    </tr>`).join('');

  const html = `
  <html><head><meta charset="utf-8"><title>請求書 ${invoice_id}</title>
  <link rel="stylesheet" href="./style.css">
  <style>
  /* inline fallback jika style.css tidak termuat saat offline */
  </style>
  </head>
  <body class="inv-body">
  <div class="invoice">
    <div class="inv-head">
      <div class="inv-title">請 求 書</div>
      <div class="inv-meta">
        <div><span>請求No</span><b>${invoice_id}</b></div>
        <div><span>請求日</span><b>${d(H['請求日'])}</b></div>
        <div><span>通貨</span><b>${H['通貨']||''}</b></div>
        <div><span>状態</span><b>${H['状態']||''}</b></div>
      </div>
    </div>
    <div class="inv-to">
      <div class="box"><div class="lbl">得意先</div><div class="val">${H['得意先']||''}</div></div>
      <div class="box"><div class="lbl">請求先</div><div class="val">${H['請求先']||''}</div></div>
    </div>
    <table class="inv-table">
      <thead><tr><th>注番</th><th>品名</th><th>品番</th><th>図番</th><th class="t-right">数量</th><th class="t-right">単価</th><th class="t-right">金額</th><th>備考</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="8" class="t-center muted">明細はありません</td></tr>'}</tbody>
      <tfoot>
        <tr><td colspan="6" class="t-right">小計</td><td class="t-right">${sub.toLocaleString()}</td><td></td></tr>
        <tr><td colspan="6" class="t-right">消費税 (${H['税率']||0}%)</td><td class="t-right">${tax.toLocaleString()}</td><td></td></tr>
        <tr><td colspan="6" class="t-right"><b>合計</b></td><td class="t-right"><b>${tot.toLocaleString()}</b></td><td></td></tr>
      </tfoot>
    </table>
    <div class="inv-note">${H['備考']||''}</div>
  </div>
  <div class="inv-actions noprint">
    <button onclick="window.print()" class="btn">PDF / 印刷</button>
    <button onclick="window.close()" class="btn ghost">閉じる</button>
  </div>
  </body></html>`;
  const w = window.open('about:blank');
  w.document.write(html); w.document.close();
}
