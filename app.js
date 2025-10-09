/* =========================================================
 * app.js — Tokyo Seimitsu ERP (Frontend, revised)
 * - 全ラベルの「SO」を「注番」に統一（内部カラムは変更なし）
 * - 生産現品票/出荷予定/営業のCSV入力仕様に対応
 * - スキャン/手動工程変更：OK品・不良品の必須入力、レザー加工、検査中/検査済
 * - 不良品チャート
 * ========================================================= */

const API_BASE = "https://script.google.com/macros/s/AKfycbwU5weHTlKMx7cztUIs060C9nCrQlQHCiGj3qvOzDdRFNgrAc9FO6nhqkin42nEq3df/exec"; // ← Apps Script のデプロイURLに置換
const API_KEY = "";  // 必要なら

/* ====== 工程マスター（UI表示用） ====== */
const PROCESSES = ["切断","曲げ","レザー加工","組立","検査中","検査済","出荷"];

/* ====== View 切替 ====== */
const views = [...document.querySelectorAll('.view')];
const navBtns = [...document.querySelectorAll('.nav button[data-nav]')];
navBtns.forEach(btn=>btn.addEventListener('click',()=>{
  navBtns.forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const id = 'view-'+btn.dataset.nav;
  views.forEach(v=>v.classList.toggle('show', v.id===id));
}));

document.getElementById('logout').onclick = () => localStorage.clear();

/* ====== Helper ====== */
const fetchJSON = (url, opt={}) =>
  fetch(url, {
    ...opt,
    headers: {'Content-Type':'application/json','X-API-KEY':API_KEY, ...(opt.headers||{})}
  }).then(r=>r.json());

const qs = s => document.querySelector(s);

/* ====== 生産現品票：CSV/Excel 取込、登録 ====== */
const gpMap = {
  '生産開始':'start_date','得意先':'customer','図番':'drawing','機種':'model',
  '商品名':'item_name','数量':'qty','注番':'order_no','備考':'note'
};
function parseSheet(file, cb){
  const ext = file.name.toLowerCase().split('.').pop();
  if(ext==='csv'){
    const fr = new FileReader();
    fr.onload = e => {
      const rows = e.target.result.split(/\r?\n/).filter(Boolean).map(l=>l.split(','));
      cb(rows);
    };
    fr.readAsText(file);
  }else{
    const fr = new FileReader();
    fr.onload = e => {
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      cb(rows);
    };
    fr.readAsArrayBuffer(file);
  }
}

qs('#btn-genpin-upload').onclick = () => {
  const f = qs('#imp-genpin').files[0];
  if(!f) return alert('ファイルを選択してください。');
  parseSheet(f, rows=>{
    const header = rows[0];
    const body = rows.slice(1).filter(r=>r.some(c=>String(c).trim()!==""));
    const mapped = body.map(r=>{
      const o = {};
      header.forEach((h,i)=>{
        const key = gpMap[h];
        if(key) o[key] = r[i];
      });
      return o;
    });
    fetchJSON(API_BASE+'?route=importGenpin', {method:'POST', body:JSON.stringify(mapped)})
      .then(res=>alert(res.message||'取込完了'));
  });
};
qs('#btn-genpin-add').onclick = () => {
  const payload = {
    start_date: qs('#gp-start').value,
    customer: qs('#gp-cust').value,
    drawing: qs('#gp-zu').value,
    model: qs('#gp-kishu').value,
    item_name: qs('#gp-shohin').value,
    qty: Number(qs('#gp-qty').value||0),
    order_no: qs('#gp-chuban').value,
    note: qs('#gp-biko').value
  };
  fetchJSON(API_BASE+'?route=addGenpin',{method:'POST',body:JSON.stringify(payload)})
    .then(res=>alert(res.message||'登録しました'));
};

/* ====== 出荷予定：CSV/Excel 取込、登録 ====== */
const ytMap = {
  '出荷日':'ship_date','得意先':'customer','図番':'drawing','機種':'model',
  '商品名':'item_name','数量':'qty','送り先':'dest','注番':'order_no','備考':'note'
};
qs('#btn-yotei-upload').onclick = () => {
  const f = qs('#imp-yotei').files[0];
  if(!f) return alert('ファイルを選択してください。');
  parseSheet(f, rows=>{
    const header = rows[0];
    const body = rows.slice(1).filter(r=>r.some(c=>String(c).trim()!==""));
    const mapped = body.map(r=>{
      const o = {};
      header.forEach((h,i)=>{
        const key = ytMap[h];
        if(key) o[key] = r[i];
      });
      return o;
    });
    fetchJSON(API_BASE+'?route=importYotei', {method:'POST', body:JSON.stringify(mapped)})
      .then(res=>alert(res.message||'取込完了'));
  });
};
qs('#btn-yotei-add').onclick = () => {
  const payload = {
    ship_date: qs('#yt-date').value,
    customer: qs('#yt-cust').value,
    drawing: qs('#yt-zu').value,
    model: qs('#yt-kishu').value,
    item_name: qs('#yt-shohin').value,
    qty: Number(qs('#yt-qty').value||0),
    dest: qs('#yt-okuri').value,
    order_no: qs('#yt-chuban').value,
    note: qs('#yt-biko').value
  };
  fetchJSON(API_BASE+'?route=addYotei',{method:'POST',body:JSON.stringify(payload)})
    .then(res=>alert(res.message||'登録しました'));
};

/* ====== 営業（入力のみ、旧スキーマへマッピング） ====== */
const slMap = {
  '注番':'order_no','機種':'model','商品名':'item_name','図番':'drawing',
  '数量':'qty','得意先':'customer','受注日':'order_date','希望納期':'due_date','備考':'note'
};
qs('#btn-sales-add').onclick = () => {
  const payload = {
    order_no: qs('#sl-chuban').value, model: qs('#sl-kishu').value, item_name: qs('#sl-shohin').value,
    drawing: qs('#sl-zu').value, qty: Number(qs('#sl-qty').value||0), customer: qs('#sl-cust').value,
    order_date: qs('#sl-rec').value, due_date: qs('#sl-due').value, note: qs('#sl-biko').value
  };
  fetchJSON(API_BASE+'?route=addSales',{method:'POST',body:JSON.stringify(payload)})
    .then(res=>alert(res.message||'登録しました'));
};

/* ====== スキャン/手動工程変更 + OK/不良 ====== */
qs('#btn-set-process').onclick = () => {
  const payload = {
    order_no: qs('#sc-chuban').value.trim(),
    process: qs('#sc-process').value,
    status: qs('#sc-status').value.trim(),
    ok_qty: Number(qs('#sc-ok').value||0),
    ng_qty: Number(qs('#sc-ng').value||0)
  };
  if(!payload.order_no) return alert('注番を入力してください。');
  fetchJSON(API_BASE+'?route=setProcess', {method:'POST', body:JSON.stringify(payload)})
    .then(res=>alert(res.message||'反映しました'));
};

/* ====== ダッシュボード（スナップショット & 不良チャート） ====== */
function loadDashboard(){
  fetchJSON(API_BASE+'?route=snapshot').then(data=>{
    qs('#kpi-orders').textContent = data.orders||0;
    qs('#kpi-done').textContent = data.done||0;
    qs('#kpi-ok').textContent = data.ok||0;
    qs('#kpi-ng').textContent = data.ng||0;

    // defectByProcess (小カード)
    const ctx1 = document.getElementById('defectByProcess');
    if(ctx1){
      new Chart(ctx1, {
        type:'bar',
        data:{labels:data.defects.labels, datasets:[{label:'不良（個）', data:data.defects.values}]},
        options:{responsive:true, scales:{y:{beginAtZero:true}}}
      });
    }
  });

  fetchJSON(API_BASE+'?route=defectsByProcess').then(d=>{
    const ctx = document.getElementById('chart-defect');
    if(!ctx) return;
    new Chart(ctx, {
      type:'bar',
      data:{labels:d.labels, datasets:[{label:'不良（個）', data:d.values}]},
      options:{responsive:true, scales:{y:{beginAtZero:true}}}
    });
  });
}
document.addEventListener('DOMContentLoaded', loadDashboard);
