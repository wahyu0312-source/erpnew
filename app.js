/* =========================================================
 * app.js — Patched
 * - Scan & manual set process => minta OK/NG, kirim ke setProcess
 * - Tambah chart: 不良品（工程別） dari d.defectByProcess
 * ========================================================= */

/* ===== Config (sama) ===== */
const API_BASE = "https://script.google.com/macros/s/AKfycbxHxbyea1odDIVDwcU_okEN6KoTfgxvHXjeuixuTAIj-AkwAC-R3GfHZvcpK69Mfdff/exec";
const API_KEY = "";

/* ===== Proses & rules (sama seperti file asli) ===== */
const PROCESSES = ['レーザ加工','曲げ加工','外枠組立','シャッター組立','シャッター溶接','コーキング','外枠塗装','組立（組立中）','組立（組立済）','外注','検査工程'];
const STATION_RULES = {
  'レーザ加工': (o)=> ({ current_process:'レーザ加工' }),
  '曲げ工程': (o)=> ({ current_process:'曲げ加工' }),
  '外枠組立': (o)=> ({ current_process:'外枠組立' }),
  'シャッター組立': (o)=> ({ current_process:'シャッター組立' }),
  'シャッター溶接': (o)=> ({ current_process:'シャッター溶接' }),
  'コーキング': (o)=> ({ current_process:'コーキング' }),
  '外枠塗装': (o)=> ({ current_process:'外枠塗装' }),
  '組立工程': (o)=> (o.current_process==='組立（組立中）' ? { current_process:'組立（組立済）' } : { current_process:'組立（組立中）' }),
  '検査工程': (o)=> (o.current_process==='検査工程' && !['検査保留','不良品（要リペア）','検査済'].includes(o.status) ? { current_process:'検査工程', status:'検査済' } : { current_process:'検査工程' }),
  '出荷工程': (o)=> (o.status==='出荷準備' ? { current_process:o.current_process||'検査工程', status:'出荷済' } : { current_process:'検査工程', status:'出荷準備' })
};

/* ===== Map badge (tetap) ===== */
const STATUS_CLASS = {'生産開始':'st-begin','検査工程':'st-inspect','検査済':'st-inspect','検査保留':'st-hold','出荷準備':'st-ready','出荷済':'st-shipped','不良品（要リペア）':'st-ng'};
const PROC_CLASS   = {'レーザ加工':'prc-laser','曲げ加工':'prc-bend','外枠組立':'prc-frame','シャッター組立':'prc-shassy','シャッター溶接':'prc-shweld','コーキング':'prc-caulk','外枠塗装':'prc-tosou','組立（組立中）':'prc-asm-in','組立（組立済）':'prc-asm-ok','外注':'prc-out','検査工程':'prc-inspect'};

/* ===== SW register, SWR, API helpers, utils, enter(), renderers ===== */
/* ... (semua bagian dari file asli tetap sama) ... */

/* ===== QR Station & Scan (PATCH utama) ===== */
let SESSION=null, CURRENT_PO=null, scanStream=null, scanTimer=null;

function startScanFor(po){
  CURRENT_PO=po;
  const dlg=document.getElementById('dlgScan'); if(!dlg) return;
  dlg.showModal();
  document.getElementById('scanPO').textContent=po;
  initScan();
}

async function initScan(){
  const video=document.getElementById('scanVideo'), canvas=document.getElementById('scanCanvas'), result=document.getElementById('scanResult');
  if(!video||!canvas) return;
  try{
    scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject=scanStream; await video.play();
    const ctx=canvas.getContext('2d');
    scanTimer = setInterval(async ()=>{
      if(video.readyState!==video.HAVE_ENOUGH_DATA) return;
      canvas.width=video.videoWidth; canvas.height=video.videoHeight;
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      const code=jsQR(img.data, img.width, img.height);
      if(code && code.data){
        result.textContent='読み取り: '+code.data;
        const token=String(code.data||''); const [prefix, station] = token.split(':');
        if(prefix==='ST' && station && CURRENT_PO){
          try{
            const o=await apiGet({action:'ticket',po_id:CURRENT_PO});
            const rule=STATION_RULES[station] || ((_o)=>({current_process:station}));
            const updates=rule(o) || {};

            // NEW: ambil OK/NG dari dialog
            const okQty = Number(document.getElementById('inOkQty')?.value||0);
            const ngQty = Number(document.getElementById('inNgQty')?.value||0);
            const note  = String(document.getElementById('inNote')?.value||'');

            // NEW: panggil endpoint setProcess supaya OK/NG tercatat ke log
            await apiPost('setProcess',{ po_id:CURRENT_PO, updates:{...updates, ok_qty:okQty, ng_qty:ngQty, note}, user:SESSION });

            alert('更新しました'); refreshAll(true);
          }catch(e){ alert(e.message||e); }
        }
        stopScan(); document.getElementById('dlgScan').close();
      }
    }, 300);
  }catch(e){ alert('カメラ起動不可: '+(e.message||e)); }
}
function stopScan(){ if(scanTimer){ clearInterval(scanTimer); scanTimer=null; } if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream=null; } }
const btnScanClose=document.getElementById('btnScanClose'); if(btnScanClose) btnScanClose.onclick=()=>{ stopScan(); document.getElementById('dlgScan').close(); };

/* ===== NEW: Manual set process (fallback) — juga minta OK/NG ===== */
async function manualSetProcess(po_id){
  const process = prompt('工程を入力（例: レーザ加工/検査工程/…）:'); if(process===null) return;
  const okQty = Number(prompt('OK品 数量 (空=0):')||0);
  const ngQty = Number(prompt('不良品 数量 (空=0):')||0);
  const note  = prompt('備考/メモ（任意）:')||'';
  try{
    await apiPost('setProcess',{ po_id:po_id, updates:{ current_process:process, ok_qty:okQty, ng_qty:ngQty, note }, user:SESSION });
    alert('更新しました'); refreshAll(true);
  }catch(e){ alert(e.message||e); }
}

/* ===== Orders table: tambah tombol manual proses (opsional tapi berguna) ===== */
// Di function renderOrders() setelah tombol “更新/出荷票/履歴”, tambahkan:
// <button class="btn ghost s" onclick="manualSetProcess('${r.po_id}')"><i class="fa-solid fa-screwdriver-wrench"></i> 工程変更</button>

/* ===== Charts (PATCH: tambah 不良品（工程別）) ===== */
async function renderCharts(){
  try{
    const d=await apiGet({action:'charts'},{swrKey:'charts'});
    const year=d.year|| (new Date()).getFullYear();
    if(document.getElementById('chartYear')) document.getElementById('chartYear').value=year;

    const ms=(arr)=>({labels:['1','2','3','4','5','6','7','8','9','10','11','12'], datasets:[{label:'数量', data:arr}]});
    drawBar('chMonthly', ms(d.perMonth));
    drawPie('chCustomer', d.perCust||{});
    drawPie('chStock', d.stockBuckets||{});
    drawBar('chWipProc', {labels:Object.keys(d.wipByProcess||{}), datasets:[{label:'点数', data:Object.values(d.wipByProcess||{})}]});
    drawBar('chSales', ms(d.salesPerMonth||[]));
    drawBar('chPlan',  ms(d.planPerMonth||[]));

    // NEW: 不良品（工程別）
    drawBar('chDefectByProc', { labels: Object.keys(d.defectByProcess||{}), datasets:[{ label:'不良品 数量', data:Object.values(d.defectByProcess||{}) }] });
  }catch(e){ console.warn(e); }
}
function drawBar(id, data){ const ctx=document.getElementById(id); if(!ctx) return; new Chart(ctx, {type:'bar', data, options:{responsive:true, maintainAspectRatio:false, animation:{duration:300}}}); }
function drawPie(id, obj){ const ctx=document.getElementById(id); if(!ctx) return; new Chart(ctx, {type:'doughnut', data:{labels:Object.keys(obj), datasets:[{data:Object.values(obj)}]}, options:{responsive:true, maintainAspectRatio:false, animation:{duration:300}}}); }

/* ===== Selebihnya (auth, masters, dashboard, sales, plan, ship, invoice, import) — tetap sama dengan file asli ===== */
// ... salin bagian lain dari file asli tanpa perubahan ...
