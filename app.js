/* ===== Config ===== */
const API_BASE = 'https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec'; // ganti

/* ===== SWR-mini (cache + ETag + dedup) ===== */
const swrStore = {
  etag: null,
  data: null,
  lastFetch: 0,
  inflight: null
};

async function fetchBatch({ signal } = {}){
  // dedup inflight
  if(swrStore.inflight) return swrStore.inflight;

  const url = new URL(API_BASE);
  url.searchParams.set('action','batch');
  if(swrStore.etag) url.searchParams.set('since', swrStore.etag);

  const ctl = new AbortController();
  const sig = signal || ctl.signal;
  const p = fetch(url.toString(), { signal: sig }).then(r=>r.json()).then(j=>{
    if(!j.ok) throw new Error(j.error||'HTTP');
    if(j.notModified) return swrStore.data; // gunakan cache
    // set cache baru
    swrStore.etag = j.etag || null;
    swrStore.data = j.data;
    swrStore.lastFetch = Date.now();
    return j.data;
  }).finally(()=> swrStore.inflight=null);

  swrStore.inflight = p;
  return p;
}

function useBatchData(){
  const [data,setData] = React.useState(swrStore.data);
  React.useEffect(()=>{
    let cancelled=false;
    // gunakan cache cepat
    if(swrStore.data && Date.now()-swrStore.lastFetch < 10_000){
      setData(swrStore.data);
    }
    // revalidate background
    fetchBatch().then(d=>{ if(!cancelled) setData(d); }).catch(console.warn);
    const t = setInterval(()=> fetchBatch().then(d=>{ if(!cancelled) setData(d); }), 60_000);
    return ()=>{ cancelled=true; clearInterval(t); };
  },[]);
  return [data, setData];
}

/* ===== Helpers ===== */
const fmtDate = s => s ? (new Date(s)).toLocaleDateString('ja-JP') : '';
const num = n => (n==null || n==='') ? 0 : Number(n);
const qMatch = (row, q) => !q || JSON.stringify(row).toLowerCase().includes(q.toLowerCase());

function apiPost(action, body){
  return fetch(API_BASE, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body })
  }).then(r=>r.json()).then(j=>{ if(!j.ok) throw new Error(j.error||'HTTP'); return j.data; });
}

/* ===== UI Components ===== */
const Card = ({title, children, right}) => (
  <section className="card">
    <header className="row-between">
      <h3>{title}</h3>{right}
    </header>
    {children}
  </section>
);

function Weather(){
  const ref = React.useRef(null);
  const [state,setState] = React.useState(null);
  React.useEffect(()=>{
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos=>{
      const { latitude, longitude } = pos.coords;
      const url = `${API_BASE}?action=weather&lat=${latitude}&lon=${longitude}`;
      fetch(url).then(r=>r.json()).then(j=>{
        if(j.ok){
          const w=j.data || j;
          setState({ t:w.current?.temperature_2m, code:w.current?.weather_code });
        }
      }).catch(console.warn);
    });
  },[]);
  if(!state) return <div className="muted s">天気 取得中…</div>;
  return <div className="weather">
    <span className="emoji">⛅</span>
    <span>現在 {state.t}°C（推定）</span>
  </div>;
}

/* ===== Tables ===== */
function Table({ columns, rows }){
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{columns.map(c=><th key={c.key||c.title}>{c.title}</th>)}</tr></thead>
        <tbody>
          {rows.length===0? <tr><td colSpan={columns.length} className="muted">データなし</td></tr>:
            rows.map((r,i)=>(
              <tr key={i}>
                {columns.map(c=> <td key={c.key||c.title}>{c.render? c.render(r) : (r[c.key]??'')}</td>)}
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

/* ===== Linking logic ===== */
function useLinking(){
  const [sel,setSel] = React.useState({}); // { po, partNo }
  return { sel, setSel };
}

/* ===== Pages ===== */
function Dashboard(){
  const [batch] = useBatchData();
  const tickets = batch?.tickets || [];
  const okSum = tickets.reduce((a,b)=> a+num(b['OK']), 0);
  const ngSum = tickets.reduce((a,b)=> a+num(b['NG']), 0);

  // daftar ringkas
  const cols = [
    { title:'注番', key:'注番' },
    { title:'得意先', key:'得意先' },
    { title:'図番', key:'図番' },
    { title:'機種', key:'機種' },
    { title:'商品名', key:'商品名' },
    { title:'数量', key:'数量' },
    { title:'工程', key:'工程' },
    { title:'状態', key:'状態' },
    { title:'操作', render:r=>
      <div className="actions-2col">
        <button className="btn ghost s" onClick={()=> openUpdateDialog(r)}>更新</button>
      </div>
    }
  ];

  return (
    <>
      <div className="grid-3">
        <Card title="当日スナップショット">
          <div className="grid-3">
            <div><div className="stat-num">{tickets.length}</div><div className="muted s">現品票</div></div>
            <div><div className="stat-num">{okSum}</div><div className="muted s">OK品</div></div>
            <div><div className="stat-num">{ngSum}</div><div className="muted s">不良品</div></div>
          </div>
          <div style={{marginTop:8}}><Weather/></div>
        </Card>
        <Card title="現品票一覧" right={<SearchBox targetId="qTickets"/>}>
          <TicketsMini columns={cols}/>
        </Card>
      </div>
    </>
  );
}

function SearchBox({ targetId }){
  return <input id={targetId} className="input" placeholder="検索…"
    onInput={e=> window.dispatchEvent(new CustomEvent('global-search',{ detail:{ id:targetId, q:e.target.value }}))}
  />;
}

function TicketsMini({ columns }){
  const [batch] = useBatchData();
  const data = batch?.tickets || [];
  const [q,setQ] = React.useState('');
  React.useEffect(()=>{
    const h = (ev)=>{ if(ev.detail?.id==='qTickets') setQ(ev.detail.q||''); };
    window.addEventListener('global-search', h); return ()=> window.removeEventListener('global-search', h);
  },[]);
  const rows = data.filter(r=> qMatch(r,q)).slice(0,10);
  return <Table columns={columns} rows={rows}/>;
}

function Shipments(){
  const [batch] = useBatchData();
  const finished = batch?.finished || [];
  const shipments = batch?.shipments || [];
  const [q,setQ] = React.useState('');
  React.useEffect(()=>{
    const h = (ev)=>{ if(ev.detail?.id==='qShip') setQ(ev.detail.q||''); };
    window.addEventListener('global-search', h); return ()=> window.removeEventListener('global-search', h);
  },[]);

  const cols = [
    { title:'出荷日', render:r=> fmtDate(r['出荷日']) },
    { title:'注番', key:'注番' },
    { title:'得意先', key:'得意先' },
    { title:'図番', key:'図番' },
    { title:'商品名', key:'商品名' },
    { title:'数量', key:'数量' },
    { title:'状態', key:'ステータス' },
    { title:'完成品', render:r=>{
        const f = finished.find(x=> String(x['注番'])===String(r['注番']));
        return f? `${f['完成数']} / ${r['数量']}`:'-';
      }
    },
    { title:'詳細', render:r=>
      <button className="btn ghost s" onClick={()=> openFinishedDetail(r['注番'])}>完成品を見る</button>
    }
  ];
  const rows = shipments.filter(r=> qMatch(r,q));
  return (
    <Card title="出荷予定" right={<SearchBox targetId="qShip"/>}>
      <Table columns={cols} rows={rows}/>
    </Card>
  );
}

function Tickets(){
  const [batch, setBatch] = useBatchData();
  const tickets = batch?.tickets || [];
  const [q,setQ] = React.useState('');
  React.useEffect(()=>{
    const h = (ev)=>{ if(ev.detail?.id==='qTicketsFull') setQ(ev.detail.q||''); };
    window.addEventListener('global-search', h); return ()=> window.removeEventListener('global-search', h);
  },[]);
  const cols = [
    { title:'注番', key:'注番' },
    { title:'得意先', key:'得意先' },
    { title:'図番', key:'図番' },
    { title:'機種', key:'機種' },
    { title:'商品名', key:'商品名' },
    { title:'数量', key:'数量' },
    { title:'工程', key:'工程' },
    { title:'状態', key:'状態' },
    { title:'OK', key:'OK' },
    { title:'NG', key:'NG' },
    { title:'操作', render:r=>(
      <div className="actions-2col">
        <button className="btn ghost s" onClick={()=> openUpdateDialog(r)}>更新</button>
      </div>
    )}
  ];
  const rows = tickets.filter(r=> qMatch(r,q));
  return (
    <Card title="生産現品票" right={
      <div className="row gap">
        <button className="btn" onClick={exportOrders}>Export</button>
        <input id="fileImport" type="file" className="hidden" accept=".xlsx,.xls,.csv">
        </input>
        <button className="btn ghost" onClick={()=> document.getElementById('fileImport').click()}>Import</button>
        <SearchBox targetId="qTicketsFull"/>
      </div>
    }>
      <Table columns={cols} rows={rows}/>
    </Card>
  );
}

function Stock(){
  const [batch] = useBatchData();
  const stock = batch?.stock || [];
  const [q,setQ] = React.useState('');
  React.useEffect(()=>{
    const h = (ev)=>{ if(ev.detail?.id==='qStock') setQ(ev.detail.q||''); };
    window.addEventListener('global-search', h); return ()=> window.removeEventListener('global-search', h);
  },[]);
  const cols = [
    { title:'図番', key:'図番' },
    { title:'機種', key:'機種' },
    { title:'商品名', key:'商品名' },
    { title:'在庫数', key:'在庫数' },
    { title:'最終更新', render:r=> fmtDate(r['最終更新']) },
  ];
  const rows = stock.filter(r=> qMatch(r,q));
  return (
    <Card title="在庫" right={<SearchBox targetId="qStock"/>}>
      <Table columns={cols} rows={rows}/>
    </Card>
  );
}

function Finished(){
  const [batch] = useBatchData();
  const finished = batch?.finished || [];
  const [q,setQ] = React.useState('');
  React.useEffect(()=>{
    const h = (ev)=>{ if(ev.detail?.id==='qFinished') setQ(ev.detail.q||''); };
    window.addEventListener('global-search', h); return ()=> window.removeEventListener('global-search', h);
  },[]);
  const cols = [
    { title:'注番', key:'注番' },
    { title:'図番', key:'図番' },
    { title:'機種', key:'機種' },
    { title:'商品名', key:'商品名' },
    { title:'完成数', key:'完成数' },
    { title:'検査結果', key:'検査結果' },
    { title:'最終更新', render:r=> fmtDate(r['最終更新']) },
  ];
  const rows = finished.filter(r=> qMatch(r,q));
  return (
    <Card title="完成品一覧" right={<SearchBox targetId="qFinished"/>}>
      <Table columns={cols} rows={rows}/>
    </Card>
  );
}

function Charts(){
  const [batch] = useBatchData();
  const tickets = batch?.tickets || [];
  React.useEffect(()=>{
    const el = document.getElementById('chDefect');
    if(!el) return;
    const byProc = {};
    tickets.forEach(t=>{
      const p = t['工程'] || '-';
      byProc[p] = (byProc[p]||0) + num(t['NG']);
    });
    const chart = new Chart(el, {
      type:'bar',
      data: { labels:Object.keys(byProc), datasets:[{ label:'不良品', data:Object.values(byProc) }] },
      options:{ responsive:true, maintainAspectRatio:false }
    });
    return ()=> chart.destroy();
  },[batch]);
  return (
    <Card title="工程チャート">
      <div style={{height:280}}><canvas id="chDefect"/></div>
    </Card>
  );
}

/* ===== Router super ringan ===== */
function useHashRoute(){
  const [route,setRoute] = React.useState(location.hash||'#/dash');
  React.useEffect(()=>{
    const fn=()=> setRoute(location.hash||'#/dash');
    window.addEventListener('hashchange', fn); return ()=> window.removeEventListener('hashchange', fn);
  },[]);
  return route;
}

function App(){
  const route = useHashRoute();
  React.useEffect(()=>{
    // import handler
    const f = document.getElementById('fileImport');
    if(f) f.onchange = (e)=>{
      const file = e.target.files?.[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = (ev)=>{
        const wb = XLSX.read(ev.target.result, { type:'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });
        apiPost('importOrders', { rows }).then(()=> {
          alert('Import 完了'); fetchBatch(); // revalidate
        }).catch(err=> alert(err.message||err));
      };
      reader.readAsBinaryString(file);
      e.target.value='';
    };
  },[]);

  if(route==="#/ship")     return <Shipments/>;
  if(route==="#/tickets")  return <Tickets/>;
  if(route==="#/stock")    return <Stock/>;
  if(route==="#/finished") return <Finished/>;
  if(route==="#/chart")    return <Charts/>;
  return <Dashboard/>;
}

/* ===== Update Dialog (global) ===== */
window.openUpdateDialog = function(row){
  // simple prompt UX agar cepat; bisa diganti dialog cantik
  const ok = Number(prompt(`OK数量 (現在 ${row['OK']||0})`, '0')||0);
  const ng = Number(prompt(`NG数量 (現在 ${row['NG']||0})`, '0')||0);
  const proc = prompt(`工程 (現在 ${row['工程']||''})`, row['工程']||'') || row['工程']||'';
  const status = prompt(`状態 (完成/出荷準備/検査中 など; 現在 ${row['状態']||''})`, row['状態']||'') || row['状態']||'';
  const note = prompt('備考', '') || '';

  apiPost('setProcess', {
    po_id: row['注番'],
    updates: { current_process:proc, status, ok_qty:ok, ng_qty:ng, note },
    user: { username:'System Admin' }
  }).then(()=>{
    alert('更新しました');
    fetchBatch(); // revalidate
  }).catch(err=> alert(err.message||err));
};

window.openFinishedDetail = function(po){
  location.hash = '#/finished';
  setTimeout(()=>{
    const inp = document.querySelector('input[placeholder="検索…"]');
    if(inp) inp.value=po, inp.dispatchEvent(new Event('input',{bubbles:true}));
  }, 0);
};

window.exportOrders = function(){
  fetchBatch().then(d=>{
    const rows = d.tickets || [];
    const out = rows.map(r=>({
      '注番':r['注番'],'得意先':r['得意先'],'図番':r['図番'],'機種':r['機種'],
      '商品名':r['商品名'],'数量':r['数量'],'工程':r['工程'],'状態':r['状態'],'OK':r['OK'],'NG':r['NG'],'備考':r['備考']
    }));
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '現品票');
    XLSX.writeFile(wb, 'tickets_export.xlsx');
  });
};

/* ===== Render ===== */
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
