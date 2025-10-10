/* ======= Config ======= */
const API_BASE = 'https://script.google.com/macros/s/AKfycbwYfhB5dD-vTNDCzlzuCfLGZvV9D8FsKc0zz9gUCZDRcLWWs_yp2U9bN6XMnorXFhiS/exec'; // ex: https://script.google.com/macros/s/AKfycb.../exec

/* ======= API utils (error friendly) ======= */
function apiGet(params){
  const url = new URL(API_BASE);
  Object.entries(params||{}).forEach(([k,v])=> url.searchParams.set(k,v));
  return fetch(url.toString()).then(r=>r.json()).then(j=>{
    if(!j.ok) throw new Error(j.error||'HTTP');
    return j;
  });
}
function apiPost(action, body){
  return fetch(API_BASE, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body })
  }).then(async r=>{
    let j; try{ j=await r.json(); }catch(e){
      throw new Error(`API not JSON. Cek deploy Web App (/exec).`);
    }
    if(!j.ok) throw new Error(j.error||`API error: ${action}`);
    return j;
  });
}

/* ======= SWR mini (ETag-aware batch) ======= */
const swr = { etag:null, data:null, last:0, inflight:null };
async function fetchBatch(){
  if(swr.inflight) return swr.inflight;
  const url = new URL(API_BASE);
  url.searchParams.set('action','batch');
  if(swr.etag) url.searchParams.set('since', swr.etag);
  const p = fetch(url.toString()).then(r=>r.json()).then(j=>{
    if(!j.ok) throw new Error(j.error||'HTTP');
    if(j.notModified) return swr.data;
    swr.etag = j.etag||null; swr.data = j.data; swr.last=Date.now(); return j.data;
  }).finally(()=> swr.inflight=null);
  swr.inflight=p; return p;
}
function useBatch(){
  const [data,setData] = React.useState(swr.data);
  React.useEffect(()=>{
    let cancel=false;
    if(swr.data && Date.now()-swr.last<10_000) setData(swr.data);
    fetchBatch().then(d=>{ if(!cancel) setData(d); }).catch(err=> alert(err.message));
    const t=setInterval(()=> fetchBatch().then(d=>{ if(!cancel) setData(d); }), 60_000);
    return ()=>{ cancel=true; clearInterval(t); };
  },[]);
  return [data, setData];
}

/* ======= Helpers ======= */
const fmtDate = s => s ? (new Date(s)).toLocaleDateString('ja-JP') : '';
const num = v => (v==null||v==='')?0:Number(v);
const qMatch = (row,q)=> !q || JSON.stringify(row).toLowerCase().includes(q.toLowerCase());

/* ======= UI ======= */
const Card = ({title, right, children})=>(
  <section className="card"><header className="row-between"><h3>{title}</h3>{right}</header>{children}</section>
);
const Table = ({columns, rows})=>(
  <div className="table-wrap">
    <table className="table">
      <thead><tr>{columns.map(c=><th key={c.title}>{c.title}</th>)}</tr></thead>
      <tbody>
        {rows.length===0? <tr><td colSpan={columns.length} className="muted">データなし</td></tr>:
          rows.map((r,i)=>(
            <tr key={i}>{columns.map(c=><td key={c.title}>{c.render? c.render(r): (r[c.key]??'')}</td>)}</tr>
          ))}
      </tbody>
    </table>
  </div>
);

/* ======= Auth ======= */
function Login({ onOk }){
  const [u,setU] = React.useState('admin');
  const [p,setP] = React.useState('');
  const [remember,setRemember] = React.useState(true);
  const doLogin = ()=>{
    apiPost('login',{ username:u, password:p })
      .then(({data})=>{
        if(remember) localStorage.setItem('session', JSON.stringify(data));
        onOk(data);
      }).catch(e=> alert(e.message));
  };
  return (
    <div className="center">
      <section className="card card-tight" style={{maxWidth:460}}>
        <header><h3>ログイン</h3></header>
        <div className="grid">
          <input value={u} onChange={e=>setU(e.target.value)} placeholder="ユーザーID"/>
          <input value={p} onChange={e=>setP(e.target.value)} type="password" placeholder="パスワード"/>
          <label className="row"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> <span>ログイン状態を保持</span></label>
          <button className="btn" onClick={doLogin}>ログイン</button>
        </div>
      </section>
    </div>
  );
}

/* ======= Weather ======= */
function Weather(){
  const [state,setState]=React.useState(null);
  React.useEffect(()=>{
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude, longitude} = pos.coords;
      apiGet({ action:'weather', lat:latitude, lon:longitude })
        .then(({data})=> setState({ t:data?.current?.temperature_2m }))
        .catch(()=> setState({ t:'-' }));
    });
  },[]);
  if(!state) return <div className="muted s">天気 取得中…</div>;
  return <div className="weather"><span className="emoji">⛅</span><span>現在 {state.t}°C</span></div>;
}

/* ======= Pages ======= */
function Dashboard(){
  const [batch] = useBatch();
  const tickets = batch?.tickets||[];
  const okSum = tickets.reduce((a,b)=> a+num(b['OK']), 0);
  const ngSum = tickets.reduce((a,b)=> a+num(b['NG']), 0);

  const cols = [
    { title:'注番', key:'注番' },
    { title:'得意先', key:'得意先' },
    { title:'図番', key:'図番' },
    { title:'機種', key:'機種' },
    { title:'商品名', key:'商品名' },
    { title:'数量', key:'数量' },
    { title:'工程', key:'工程' },
    { title:'状態', key:'状態' },
    { title:'操作', render:r=><button className="btn ghost s" onClick={()=> openUpdateDialog(r)}>更新</button> }
  ];

  return (
    <div className="grid-3">
      <Card title="当日スナップショット">
        <div className="grid-3">
          <div><div className="stat-num">{tickets.length}</div><div className="muted s">現品票</div></div>
          <div><div className="stat-num">{okSum}</div><div className="muted s">OK品</div></div>
          <div><div className="stat-num">{ngSum}</div><div className="muted s">不良品</div></div>
        </div>
        <div style={{marginTop:8}}><Weather/></div>
      </Card>
      <Card title="現品票一覧" right={<SearchBox targetId="qMini"/>}>
        <TicketsMini columns={cols}/>
      </Card>
    </div>
  );
}

function TicketsMini({ columns }){
  const [batch] = useBatch();
  const data = batch?.tickets||[];
  const [q,setQ]=React.useState('');
  React.useEffect(()=>{
    const h=(e)=>{ if(e.detail?.id==='qMini') setQ(e.detail.q||''); };
    window.addEventListener('global-search',h); return ()=> window.removeEventListener('global-search',h);
  },[]);
  return <Table columns={columns} rows={data.filter(r=> qMatch(r,q)).slice(0,10)}/>;
}

function SearchBox({ targetId }){
  return <input className="input" placeholder="検索…" onInput={e=>{
    window.dispatchEvent(new CustomEvent('global-search',{ detail:{ id:targetId, q:e.target.value }}));
  }}/>;
}

function Shipments(){
  const [batch] = useBatch();
  const finished = batch?.finished||[];
  const rows = batch?.shipments||[];
  const cols = [
    { title:'出荷日', render:r=> fmtDate(r['出荷日']) },
    { title:'注番', key:'注番' },
    { title:'得意先', key:'得意先' },
    { title:'図番', key:'図番' },
    { title:'商品名', key:'商品名' },
    { title:'数量', key:'数量' },
    { title:'状態', key:'ステータス' },
    { title:'完成品', render:r=> {
      const f=finished.find(x=> String(x['注番'])===String(r['注番']));
      return f? `${f['完成数']} / ${r['数量']}`:'-';
    }},
    { title:'詳細', render:r=> <button className="btn ghost s" onClick={()=> openFinishedDetail(r['注番'])}>完成品を見る</button> }
  ];
  return <Card title="出荷予定" right={<SearchBox targetId="qShip"/>}>
    <FilterTable columns={cols} rows={rows} targetId="qShip"/>
  </Card>;
}

function Tickets(){
  const [batch] = useBatch();
  const rows = batch?.tickets||[];
  const cols = [
    { title:'注番', key:'注番' },{ title:'得意先', key:'得意先' },{ title:'図番', key:'図番' },
    { title:'機種', key:'機種' },{ title:'商品名', key:'商品名' },{ title:'数量', key:'数量' },
    { title:'工程', key:'工程' },{ title:'状態', key:'状態' },{ title:'OK', key:'OK' },{ title:'NG', key:'NG' },
    { title:'操作', render:r=> <button className="btn ghost s" onClick={()=> openUpdateDialog(r)}>更新</button> }
  ];
  return <Card title="生産現品票" right={
    <div className="row gap">
      <button className="btn" onClick={exportTickets}>Export</button>
      <input id="fileImport" className="hidden" type="file" accept=".xlsx,.xls,.csv"/>
      <button className="btn ghost" onClick={()=> document.getElementById('fileImport').click()}>Import</button>
      <SearchBox targetId="qTickets"/>
    </div>
  }>
    <FilterTable columns={cols} rows={rows} targetId="qTickets"/>
  </Card>;
}

function Stock(){
  const [batch] = useBatch();
  const rows = batch?.stock||[];
  const cols = [
    { title:'図番', key:'図番' },{ title:'機種', key:'機種' },{ title:'商品名', key:'商品名' },
    { title:'在庫数', key:'在庫数' },{ title:'最終更新', render:r=> fmtDate(r['最終更新']) }
  ];
  return <Card title="在庫" right={<SearchBox targetId="qStock"/>}>
    <FilterTable columns={cols} rows={rows} targetId="qStock"/>
  </Card>;
}

function Finished(){
  const [batch] = useBatch();
  const rows = batch?.finished||[];
  const cols = [
    { title:'注番', key:'注番' },{ title:'図番', key:'図番' },{ title:'機種', key:'機種' },
    { title:'商品名', key:'商品名' },{ title:'完成数', key:'完成数' },{ title:'検査結果', key:'検査結果' },
    { title:'最終更新', render:r=> fmtDate(r['最終更新']) }
  ];
  return <Card title="完成品一覧" right={<SearchBox targetId="qFinished"/>}>
    <FilterTable columns={cols} rows={rows} targetId="qFinished"/>
  </Card>;
}

function Charts(){
  const [batch] = useBatch();
  const tickets = batch?.tickets||[];
  React.useEffect(()=>{
    const el = document.getElementById('chDefect'); if(!el) return;
    const byProc = {}; tickets.forEach(t=>{ const p=t['工程']||'-'; byProc[p]=(byProc[p]||0)+num(t['NG']); });
    const c = new Chart(el,{ type:'bar', data:{ labels:Object.keys(byProc), datasets:[{ label:'不良品', data:Object.values(byProc)}] },
      options:{ responsive:true, maintainAspectRatio:false }});
    return ()=> c.destroy();
  },[batch]);
  return <Card title="工程チャート"><div style={{height:280}}><canvas id="chDefect"/></div></Card>;
}

function FilterTable({ columns, rows, targetId }){
  const [q,setQ] = React.useState('');
  React.useEffect(()=>{
    const h=(e)=>{ if(e.detail?.id===targetId) setQ(e.detail.q||''); };
    window.addEventListener('global-search',h); return ()=> window.removeEventListener('global-search',h);
  },[targetId]);
  return <Table columns={columns} rows={rows.filter(r=> qMatch(r,q))}/>;
}

/* ======= Router ======= */
function useRoute(){
  const [route,setRoute] = React.useState(location.hash||'#/login');
  React.useEffect(()=>{
    const fn=()=> setRoute(location.hash||'#/login');
    window.addEventListener('hashchange',fn); return ()=> window.removeEventListener('hashchange',fn);
  },[]);
  return route;
}

function App(){
  const route = useRoute();
  const [session,setSession] = React.useState(null);
  React.useEffect(()=>{
    try{ const s=JSON.parse(localStorage.getItem('session')||'null'); if(s) setSession(s); }catch(_){}
    // import handler
    const f = document.getElementById('fileImport');
    if(f) f.onchange = (e)=>{
      const file = e.target.files?.[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = ev=>{
        const wb = XLSX.read(ev.target.result,{ type:'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws,{ defval:'' });
        apiPost('importorders',{ rows, user:session }).then(()=>{ alert('Import 完了'); fetchBatch(); })
          .catch(err=> alert(err.message));
      };
      reader.readAsBinaryString(file); e.target.value='';
    };
  },[]);

  if(!session && route!=='#/dash'){
    return <Login onOk={(u)=>{ setSession(u); location.hash='#/dash'; }}/>;
  }

  if(route==="#/ship")     return <Shipments/>;
  if(route==="#/tickets")  return <Tickets/>;
  if(route==="#/stock")    return <Stock/>;
  if(route==="#/finished") return <Finished/>;
  if(route==="#/chart")    return <Charts/>;
  return <Dashboard/>;
}

/* ======= Global actions ======= */
window.openUpdateDialog = function(row){
  const ok = Number(prompt(`OK数量 (現在 ${row['OK']||0})`,'0')||0);
  const ng = Number(prompt(`NG数量 (現在 ${row['NG']||0})`,'0')||0);
  const proc = prompt(`工程 (現在 ${row['工程']||''})`, row['工程']||'') || row['工程']||'';
  const st   = prompt(`状態 (完成/出荷準備/検査中 など; 現在 ${row['状態']||''})`, row['状態']||'') || row['状態']||'';
  const note = prompt('備考','')||'';
  apiPost('setprocess',{ po_id:row['注番'], updates:{ current_process:proc, status:st, ok_qty:ok, ng_qty:ng, note }, user:{ username:'System Admin' } })
    .then(()=>{ alert('更新しました'); fetchBatch(); })
    .catch(e=> alert(e.message));
};
window.openFinishedDetail = function(po){
  location.hash = '#/finished';
  setTimeout(()=>{
    const inp=[...document.querySelectorAll('input')].find(i=> i.placeholder==='検索…');
    if(inp){ inp.value=po; inp.dispatchEvent(new Event('input',{bubbles:true})); }
  },0);
};
window.exportTickets = function(){
  fetchBatch().then(d=>{
    const rows = d.tickets||[];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '現品票');
    XLSX.writeFile(wb, 'tickets_export.xlsx');
  });
};

/* ======= Mount ======= */
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
