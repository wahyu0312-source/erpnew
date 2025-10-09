/* =========================
 * Frontend minimal patch
 * ========================= */
const API_BASE = 'https://script.google.com/macros/s/AKfycbwU5weHTlKMx7cztUIs060C9nCrQlQHCiGj3qvOzDdRFNgrAc9FO6nhqkin42nEq3df/exec'; // ← isi dengan URL Web App Apps Script

/* ====== View switch ====== */
const navBtns = [...document.querySelectorAll('.nav button[data-view]')];
const views = [...document.querySelectorAll('.view')];
navBtns.forEach(b=>b.addEventListener('click',()=>{
  navBtns.forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const id = 'view-'+b.dataset.view;
  views.forEach(v=>v.classList.toggle('show', v.id===id));
}));

/* ====== Helpers ====== */
const $ = s => document.querySelector(s);
const fetchJSON = (url, opt={}) => fetch(url,{headers:{'Content-Type':'application/json'},...opt}).then(r=>r.json());
function parseSheet(file, cb){
  const ext = file.name.toLowerCase().split('.').pop();
  if(ext==='csv'){
    const fr = new FileReader();
    fr.onload = e => {
      const rows = e.target.result.split(/\r?\n/).map(l=>l.split(','));
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
function normalizeProcess(p){
  if(!p) return '';
  p = String(p).trim().replace('レーサ加工','レザー加工');
  if(p==='検査工程') return '検査中';
  return p;
}

/* ====== 生産現品票 ====== */
const mapGenpinHeader = h => ({
  生産開始: h.indexOf('生産開始'),
  得意先: h.indexOf('得意先'),
  図番:   h.indexOf('図番'),
  機種:   h.indexOf('機種'),
  商品名: h.indexOf('商品名'),
  数量:   h.indexOf('数量'),
  注番:   h.indexOf('注番'),
  備考:   h.indexOf('備考'),
});
$('#btn-genpin-upload')?.addEventListener('click',()=>{
  const f = $('#imp-genpin').files?.[0];
  if(!f) return alert('ファイルを選択してください');
  parseSheet(f, rows=>{
    const h = rows[0]||[]; const pos = mapGenpinHeader(h);
    const mapped = rows.slice(1).filter(r=>r.some(c=>String(c).trim()!=='')).map(r=>({
      start_date: r[pos.生産開始]||'',
      customer:   r[pos.得意先]||'',
      drawing:    r[pos.図番]||'',
      model:      r[pos.機種]||'',
      item_name:  r[pos.商品名]||'',
      qty: Number(r[pos.数量]||0),
      order_no:   r[pos.注番]||'',
      note:       r[pos.備考]||''
    }));
    fetchJSON(API_BASE+'?route=importGenpin',{method:'POST',body:JSON.stringify(mapped)})
      .then(res=>alert(res.message||'取込完了'));
  });
});
$('#btn-genpin-add')?.addEventListener('click',()=>{
  const payload = {
    start_date: $('#gp-start').value, customer: $('#gp-cust').value, drawing: $('#gp-zu').value,
    model: $('#gp-kishu').value, item_name: $('#gp-shohin').value, qty: Number($('#gp-qty').value||0),
    order_no: $('#gp-chuban').value, note: $('#gp-biko').value
  };
  fetchJSON(API_BASE+'?route=importGenpin',{method:'POST',body:JSON.stringify([payload])})
    .then(res=>alert(res.message||'登録しました'));
});

/* ====== 出荷予定 ====== */
const mapYoteiHeader = h => ({
  出荷日: h.indexOf('出荷日'),
  得意先: h.indexOf('得意先'),
  図番:   h.indexOf('図番'),
  機種:   h.indexOf('機種'),
  商品名: h.indexOf('商品名'),
  数量:   h.indexOf('数量'),
  送り先: h.indexOf('送り先'),
  注番:   h.indexOf('注番'),
  備考:   h.indexOf('備考'),
});
$('#btn-yotei-upload')?.addEventListener('click',()=>{
  const f = $('#imp-yotei').files?.[0];
  if(!f) return alert('ファイルを選択してください');
  parseSheet(f, rows=>{
    const h = rows[0]||[]; const pos = mapYoteiHeader(h);
    const mapped = rows.slice(1).filter(r=>r.some(c=>String(c).trim()!=='')).map(r=>({
      ship_date:  r[pos.出荷日]||'',
      customer:   r[pos.得意先]||'',
      drawing:    r[pos.図番]||'',
      model:      r[pos.機種]||'',
      item_name:  r[pos.商品名]||'',
      qty: Number(r[pos.数量]||0),
      dest:       r[pos.送り先]||'',
      order_no:   r[pos.注番]||'',
      note:       r[pos.備考]||''
    }));
    fetchJSON(API_BASE+'?route=importYotei',{method:'POST',body:JSON.stringify(mapped)})
      .then(res=>alert(res.message||'取込完了'));
  });
});
$('#btn-yotei-add')?.addEventListener('click',()=>{
  const payload = {
    ship_date: $('#yt-date').value, customer: $('#yt-cust').value, drawing: $('#yt-zu').value,
    model: $('#yt-kishu').value, item_name: $('#yt-shohin').value, qty: Number($('#yt-qty').value||0),
    dest: $('#yt-okuri').value, order_no: $('#yt-chuban').value, note: $('#yt-biko').value
  };
  fetchJSON(API_BASE+'?route=importYotei',{method:'POST',body:JSON.stringify([payload])})
    .then(res=>alert(res.message||'登録しました'));
});

/* ====== スキャン/手動 ====== */
$('#btn-set-process')?.addEventListener('click', async ()=>{
  const payload = {
    order_no: $('#sc-chuban').value.trim(),
    process: normalizeProcess($('#sc-process').value),
    status: $('#sc-status').value.trim(),
    ok_qty: Number($('#sc-ok').value||0),
    ng_qty: Number($('#sc-ng').value||0)
  };
  if(!payload.order_no) return alert('注番を入力してください。');
  const res = await fetchJSON(API_BASE+'?route=setProcess',{method:'POST',body:JSON.stringify(payload)})
    .catch(e=>({ok:false,message:String(e)}));
  if(!res.ok) return alert(res.message||'更新失敗');
  alert(res.message||'工程を更新しました');
});

/* ====== Charts & Snapshot ====== */
async function loadSnapshot(){
  const s = await fetchJSON(API_BASE+'?route=snapshot').catch(()=>null);
  if(!s) return;
  $('#kpi-orders').textContent = s.orders||0;
  $('#kpi-ok').textContent = s.ok||0;
  $('#kpi-ng').textContent = s.ng||0;
}
async function renderDefectCharts(){
  const d = await fetchJSON(API_BASE+'?route=defectsByProcess').catch(()=>null);
  if(!d) return;
  const ctx1 = document.getElementById('chart-defect-by-process')?.getContext('2d');
  if(ctx1){
    new Chart(ctx1,{type:'bar',data:{labels:d.labels,datasets:[{label:'不良（個）',data:d.values}]},options:{responsive:true,scales:{y:{beginAtZero:true}}}});
  }
  const ctx2 = document.getElementById('chart-defect')?.getContext('2d');
  if(ctx2){
    new Chart(ctx2,{type:'bar',data:{labels:d.labels,datasets:[{label:'不良（個）',data:d.values}]},options:{responsive:true,scales:{y:{beginAtZero:true}}}});
  }
}
document.addEventListener('DOMContentLoaded', ()=>{
  loadSnapshot(); renderDefectCharts();
});
