/*
  TSH System — app.js (optimized v1)
  - Menu pindah ke kanan sudah diatur di HTML (Part 1)
  - Fokus: waktu dari login -> menu muncul jadi cepat
  - Teknik: lazy-load data per halaman, cache 10–60s, render batch (RAF),
            JSONP stabil + timeout, destroy chart sebelum re-render,
            preconnect sudah di HTML, library pihak ketiga defer.
*/
(() => {
  'use strict';

  // ==============================
  // Helpers kecil
  // ==============================
  const qs = (sel, el=document) => el.querySelector(sel);
  const qsa = (sel, el=document) => [...el.querySelectorAll(sel)];
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  const raf = cb => requestAnimationFrame(cb);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const idle = cb => (window.requestIdleCallback ? requestIdleCallback(cb, {timeout: 1200}) : setTimeout(cb, 0));

  // format util
  const fmt = {
    num: (n) => new Intl.NumberFormat('ja-JP').format(Number(n)||0),
    yen: (n) => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY'}).format(Number(n)||0),
    dt: (s) => {
      if(!s) return '';
      const d = (s instanceof Date) ? s : new Date(s);
      const pad = n => String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    }
  };

  // ==============================
  // Simple in-memory cache (TTL)
  // ==============================
  const cache = new Map();
  function setCache(key, data, ttlMs=15000){
    cache.set(key, {data, exp: Date.now()+ttlMs});
  }
  function getCache(key){
    const v = cache.get(key);
    if(!v) return null;
    if(Date.now() > v.exp){ cache.delete(key); return null; }
    return v.data;
  }

  // ==============================
  // Network helpers (fetch + JSONP)
  // ==============================
  async function fetchJSON(url, {method='GET', headers={}, body, timeout=8000}={}){
    const ctl = new AbortController();
    const to = setTimeout(()=>ctl.abort('timeout'), timeout);
    try{
      const res = await fetch(url, {method, headers:{'Content-Type':'application/json',...headers}, body: body ? JSON.stringify(body): undefined, signal: ctl.signal});
      if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } finally {
      clearTimeout(to);
    }
  }

  // Stable JSONP: auto cleanup + timeout + unique cb
  function jsonp(url, {timeout=8000, param='callback'}={}){
    return new Promise((resolve, reject) => {
      const cbName = `__jsonp_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const s = document.createElement('script');
      let done = false;
      const end = (fn, v) => { if(done) return; done=true; cleanup(); fn(v); };
      function cleanup(){
        delete window[cbName];
        s.remove();
        clearTimeout(to);
      }
      window[cbName] = (data) => end(resolve, data);
      const sep = url.includes('?') ? '&' : '?';
      s.src = `${url}${sep}${param}=${cbName}`;
      s.onerror = () => end(reject, new Error('jsonp error'));
      const to = setTimeout(()=> end(reject, new Error('jsonp timeout')), timeout);
      document.head.appendChild(s);
    });
  }

  // ==============================
  // App state & selectors
  // ==============================
  const S = {
    user: null,
    current: null,
    charts: new Map(),
  };

  // Elements (minimal eager lookup)
  const el = {
    topBar: qs('#topBar'),
    authView: qs('#authView'),
    btnLogin: qs('#btnLogin'),
    inUser: qs('#inUser'),
    inPass: qs('#inPass'),
    userInfo: qs('#userInfo'),

    // pages
    pageDash: qs('#pageDash'),
    pageSales: qs('#pageSales'),
    pagePlan: qs('#pagePlan'),
    pageShip: qs('#pageShip'),
    pageFinished: qs('#pageFinished'),
    pageInv: qs('#pageInv'),
    pageInvoice: qs('#pageInvoice'),

    // nav
    btnToDash: qs('#btnToDash'),
    btnToSales: qs('#btnToSales'),
    btnToPlan: qs('#btnToPlan'),
    btnToShip: qs('#btnToShip'),
    btnToFin: qs('#btnToFinPage'),
    btnToInv: qs('#btnToInvPage'),
    btnToInvoice: qs('#btnToInvoice'),
    btnToAnalytics: qs('#btnToAnalytics'),

    // misc
    weatherWrap: qs('#weatherWrap'),
    btnLogout: qs('#btnLogout'),

    // dashboard bits
    tbOrders: qs('#tbOrders'),
    shipToday: qs('#shipToday'),
    shipPlan: qs('#shipPlan'),

    // invoice bits
    invoiceCustomer: qs('#invoiceCustomer'),
    invoiceDate: qs('#invoiceDate'),
    tbInvoiceCandidates: qs('#tbInvoiceCandidates'),
    tbInvoiceStatus: qs('#tbInvoiceStatus'),
    tbInvoiceList: qs('#tbInvoiceList'),

    // dialogs
    dlgForm: qs('#dlgForm'), btnDlgSave: qs('#btnDlgSave'), btnDlgCancel: qs('#btnDlgCancel'),
    dlgOp: qs('#dlgOp'), btnOpSave: qs('#btnOpSave'), btnOpCancel: qs('#btnOpCancel'),
    dlgScan: qs('#dlgScan'), btnScanStart: qs('#btnScanStart'), btnScanClose: qs('#btnScanClose'),
    scanVideo: qs('#scanVideo'), scanCanvas: qs('#scanCanvas'), scanResult: qs('#scanResult'),
  };

  const PAGES = ['pageDash','pageSales','pagePlan','pageShip','pageFinished','pageInv','pageInvoice'];

  // ==============================
  // Boot — wire minimal listeners first
  // ==============================
  function boot(){
    on(el.btnLogin, 'click', login);
    on(el.inPass, 'keydown', (e)=>{ if(e.key==='Enter') login(); });

    // nav events
    on(el.btnToDash,'click',()=> go('pageDash'));
    on(el.btnToSales,'click',()=> go('pageSales'));
    on(el.btnToPlan,'click',()=> go('pagePlan'));
    on(el.btnToShip,'click',()=> go('pageShip'));
    on(el.btnToFin,'click',()=> go('pageFinished'));
    on(el.btnToInv,'click',()=> go('pageInv'));
    on(el.btnToInvoice,'click',()=> go('pageInvoice'));

    on(el.btnLogout,'click', logout);

    // dialogs
    on(el.btnDlgCancel,'click',()=> el.dlgForm.close());
    on(el.btnOpCancel,'click',()=> el.dlgOp.close());
    on(el.btnScanClose,'click', stopScan);
    on(el.btnScanStart,'click', startScan);

    // Prefill invoice date
    if(el.invoiceDate) el.invoiceDate.value = fmt.dt(new Date());

    // Optionally auto-focus username
    el.inUser && el.inUser.focus();
  }

  // ==============================
  // Auth
  // ==============================
  async function login(){
    const username = (el.inUser.value||'').trim();
    const password = (el.inPass.value||'').trim();
    if(!username || !password){
      flash(el.authView, 'ユーザー名/パスワードを入力してください');
      return;
    }

    // Tampilkan UI cepat: sembunyikan login, munculkan topbar dulu,
    // halaman nanti mengisi data secara bertahap.
    S.user = {name: username};
    showTopbar(true);
    setUserInfo(username);
    showOnly('pageDash');

    // Lakukan verifikasi ke server di belakang setelah render pertama
    // (optimistic UI). Jika gagal, otomatis logout.
    idle(async () => {
      try {
        const res = await tryLoginRemote(username, password);
        if(!res || res.ok!==true){ throw new Error('auth failed'); }
        // Setelah auth OK, muat data awal secara bertahap
        primeAfterLogin();
      } catch(err){
        console.warn('login check failed:', err);
        flash(el.topBar, 'ログイン認証に失敗しました');
        await sleep(400);
        logout();
      }
    });
  }

  async function tryLoginRemote(user, pass){
    // Ubah ke endpoint Anda sendiri (contoh):
    // return fetchJSON('https://script.google.com/macros/s/XXXXX/exec', { method:'POST', body:{a:'login', u:user, p:pass} })
    // Untuk dev tanpa server, kembalikan OK palsu agar UI bisa dites.
    await sleep(120); // simulasi latency kecil
    return {ok:true, user};
  }

  function logout(){
    S.user = null; S.current = null;
    showTopbar(false);
    showOnly(null);
    el.authView.classList.remove('hidden');
    el.inUser.focus();
  }

  function setUserInfo(name){
    if(el.userInfo) el.userInfo.textContent = `ようこそ、${name} さん`;
  }

  function showTopbar(v){
    if(!el.topBar) return;
    el.topBar.classList.toggle('hidden', !v);
  }

  // ==============================
  // Navigation
  // ==============================
  function showOnly(id){
    PAGES.forEach(p => qs('#'+p).classList.add('hidden'));
    if(id){ qs('#'+id).classList.remove('hidden'); S.current = id; }
  }

  function go(id){
    if(S.current===id) return;
    showOnly(id);
    // Lazy load per halaman
    switch(id){
      case 'pageDash': loadDash(); break;
      case 'pageSales': loadSales(); break;
      case 'pagePlan': loadPlan(); break;
      case 'pageShip': loadShip(); break;
      case 'pageFinished': loadFinished(); break;
      case 'pageInv': loadInv(); break;
      case 'pageInvoice': loadInvoice(); break;
    }
  }

  // ==============================
  // After login: prime work in background
  // ==============================
  function primeAfterLogin(){
    // 1) Tampilkan skeleton + muat dashboard dulu
    loadDash();

    // 2) Cuaca (jika ada API) – tidak memblokir UI
    idle(loadWeather);

    // 3) Prefetch ringan untuk halaman lain saat idle
    idle(()=>{ loadSales(true); loadPlan(true); });
    idle(()=>{ loadShip(true); loadFinished(true); });
    idle(()=>{ loadInv(true); loadInvoice(true); });
  }

  // ==============================
  // Weather (optional)
  // ==============================
  async function loadWeather(){
    try{
      // Contoh: pakai layanan Anda sendiri; berikut hanya dummy agar tidak error
      const w = getCache('weather') || {temp:'22°C', wind:'2m/s', place:'Tokyo'};
      setCache('weather', w, 60000);
      qs('#wxTemp').textContent = w.temp;
      qs('#wxWind').textContent = w.wind;
      qs('#wxPlace').textContent = w.place;
      el.weatherWrap.classList.remove('hidden');
    }catch(e){
      // biarkan tersembunyi
    }
  }

  // ==============================
  // Data loaders (mockable)
  // ==============================
  async function loadDash(){
    // Skeleton cepat
    setTableSkeleton(el.tbOrders, 8, 9);

    try{
      const key = 'dashOrders';
      const data = getCache(key) || await fetchDashOrders();
      setCache(key, data, 15000);
      renderOrders(data);

      const ship = getCache('shipToday') || await fetchShipToday();
      setCache('shipToday', ship, 15000);
      el.shipToday.textContent = `${ship.count} 件 / 合計 ${fmt.num(ship.qty)} 個`;

      const plan = getCache('shipPlan') || await fetchShipPlan();
      setCache('shipPlan', plan, 15000);
      el.shipPlan.textContent = `${plan.count} 件 / 週内 ${fmt.num(plan.qty)} 個`;
    } catch(e){
      flash(el.pageDash, '読み込みに失敗しました');
    }
  }

  async function loadSales(prefetch=false){
    if(prefetch && getCache('sales')) return;
    try{
      const data = await fetchSales();
      setCache('sales', data, 20000);
      if(!prefetch) renderGenericTable('#tbSales', '#thSales', data);
    }catch(e){ if(!prefetch) flash(el.pageSales, '受注データ失敗'); }
  }

  async function loadPlan(prefetch=false){
    if(prefetch && getCache('plan')) return;
    try{
      const data = await fetchPlan();
      setCache('plan', data, 20000);
      if(!prefetch) renderGenericTable('#tbPlan', '#thPlan', data);
    }catch(e){ if(!prefetch) flash(el.pagePlan, '計画データ失敗'); }
  }

  async function loadShip(prefetch=false){
    if(prefetch && getCache('ship')) return;
    try{
      const data = await fetchShip();
      setCache('ship', data, 20000);
      if(!prefetch) renderGenericTable('#tbShip', '#thShip', data);
    }catch(e){ if(!prefetch) flash(el.pageShip, '出荷データ失敗'); }
  }

  async function loadFinished(prefetch=false){
    if(prefetch && getCache('fin')) return;
    try{
      const data = await fetchFinished();
      setCache('fin', data, 20000);
      if(!prefetch) renderGenericTable('#tbFin', '#thFin', data);
    }catch(e){ if(!prefetch) flash(el.pageFinished, '完成品データ失敗'); }
  }

  async function loadInv(prefetch=false){
    if(prefetch && getCache('inv')) return;
    try{
      const data = await fetchInv();
      setCache('inv', data, 20000);
      if(!prefetch) renderGenericTable('#tbInv', '#thInv', data);
    }catch(e){ if(!prefetch) flash(el.pageInv, '在庫データ失敗'); }
  }

  async function loadInvoice(prefetch=false){
    if(prefetch && getCache('invoiceList')) return;
    try{
      const customers = await fetchCustomers();
      setCache('customers', customers, 600000);
      if(!prefetch) renderCustomers(customers);

      const list = await fetchInvoiceList();
      setCache('invoiceList', list, 20000);
      if(!prefetch) renderInvoiceList(list);

      const cand = await fetchInvoiceCandidates();
      setCache('invoiceCand', cand, 20000);
      if(!prefetch) renderInvoiceCandidates(cand);

      const stat = await fetchInvoiceStatus();
      setCache('invoiceStat', stat, 20000);
      if(!prefetch) renderInvoiceStatus(stat);
    }catch(e){ if(!prefetch) flash(el.pageInvoice, '請求書データ失敗'); }
  }

  // ==============================
  // Mock fetchers (ganti ke API Anda)
  // ==============================
  async function fetchDashOrders(){
    await sleep(120);
    return Array.from({length:18}).map((_,i)=>({
      注番:`PO-${2025000+i}`, 得意先:'ABC株式会社', 品名:'ばね', 品番:`PN-${1000+i}`,
      図番:`D-${i}`, 状態: i%3? '進行中':'待機', 工程: ['切断','研磨','検査'][i%3],
      更新: fmt.dt(new Date()), 更新者:'system'
    }));
  }
  async function fetchShipToday(){ await sleep(60); return {count:6, qty:420}; }
  async function fetchShipPlan(){ await sleep(60); return {count:18, qty:1640}; }
  async function fetchSales(){ await sleep(100); return mkTab(['注番','得意先','品名','品番','数量','金額'], 16); }
  async function fetchPlan(){ await sleep(100); return mkTab(['注番','工程','開始','終了','担当','状態'], 14); }
  async function fetchShip(){ await sleep(100); return mkTab(['注番','出荷日','数量','配送','備考'], 12); }
  async function fetchFinished(){ await sleep(100); return mkTab(['完成ID','注番','品名','数量','日付','検査'], 20); }
  async function fetchInv(){ await sleep(100); return mkTab(['品番','品名','在庫','単位','倉庫'], 18); }
  async function fetchCustomers(){ await sleep(80); return ['(得意先を選択)','ABC株式会社','DEF産業','GHI商事']; }
  async function fetchInvoiceList(){ await sleep(120); return mkTab(['請求書番号','得意先','発行日','合計','ファイル名','作成者'], 10); }
  async function fetchInvoiceCandidates(){ await sleep(80); return mkTab(['選択','注番','商品名','品番','数量','単価','金額','出荷日'], 8); }
  async function fetchInvoiceStatus(){ await sleep(80); return mkTab(['注番','商品名','品番','数量','単価','金額','出荷日','状態'], 14); }

  function mkTab(headers, n){
    const rows = Array.from({length:n}).map((_,i)=>{
      const obj = {}; headers.forEach((h,j)=> obj[h] = `${h}-${i+1}`);
      if(obj['数量']) obj['数量'] = (i+1)*10;
      if(obj['合計']||obj['金額']) obj['合計'] = obj['金額'] = (i+1)*1000;
      if(obj['発行日']||obj['出荷日']) obj['発行日'] = obj['出荷日'] = fmt.dt(new Date());
      if(obj['選択']) obj['選択'] = '';
      return obj;
    });
    return {headers, rows};
  }

  // ==============================
  // Renderers
  // ==============================
  function setTableSkeleton(tbody, rows=6, cols=6){
    if(!tbody) return;
    const frag = document.createDocumentFragment();
    for(let r=0;r<rows;r++){
      const tr = document.createElement('tr');
      for(let c=0;c<cols;c++){
        const td = document.createElement('td');
        td.innerHTML = '<div style="height:10px;width:100%;background:#f1f5f9;border-radius:6px"></div>';
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    tbody.innerHTML = '';
    tbody.appendChild(frag);
  }

  function renderOrders(list){
    if(!el.tbOrders) return;
    const frag = document.createDocumentFragment();
    list.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${row.注番}</b><div class="s muted">${row.得意先}</div></td>
        <td>${row.品名}</td>
        <td>${row.品番}</td>
        <td>${row.図番}</td>
        <td>${row.状態}</td>
        <td>${row.工程}</td>
        <td>${row.更新}</td>
        <td>${row.更新者}</td>
        <td><button class="btn s">詳細</button></td>`;
      frag.appendChild(tr);
    });
    raf(()=>{ el.tbOrders.innerHTML=''; el.tbOrders.appendChild(frag); });
  }

  function renderGenericTable(tbodySel, theadSel, data){
    const tb = qs(tbodySel), th = qs(theadSel);
    if(!tb || !th) return;
    // header
    th.innerHTML = `<tr>${data.headers.map(h=>`<th>${h}</th>`).join('')}</tr>`;
    const frag = document.createDocumentFragment();
    data.rows.forEach(r=>{
      const tr = document.createElement('tr');
      tr.innerHTML = data.headers.map(h=> `<td>${r[h]??''}</td>`).join('');
      frag.appendChild(tr);
    });
    raf(()=>{ tb.innerHTML=''; tb.appendChild(frag); });
  }

  function renderCustomers(list){
    if(!el.invoiceCustomer) return;
    el.invoiceCustomer.innerHTML = list.map(c=>`<option>${c}</option>`).join('');
  }
  function renderInvoiceList(data){ renderGenericTable('#tbInvoiceList', 'thead + nothing', data); }
  function renderInvoiceCandidates(data){ renderGenericTable('#tbInvoiceCandidates', 'thead + nothing', data); }
  function renderInvoiceStatus(data){ renderGenericTable('#tbInvoiceStatus', 'thead + nothing', data); }

  // ==============================
  // Charts — destroy before re-render
  // ==============================
  function upsertChart(id, cfg){
    const ctx = qs(id);
    if(!ctx) return null;
    const prev = S.charts.get(id);
    if(prev){ try{ prev.destroy(); }catch(e){} }
    const c = new window.Chart(ctx, cfg);
    S.charts.set(id, c);
    return c;
  }

  // ==============================
  // QR Scan (jsQR)
  // ==============================
  let mediaStream = null, scanTimer = null;
  async function startScan(){
    try{
      const video = el.scanVideo, canvas = el.scanCanvas;
      const ctx = canvas.getContext('2d');
      mediaStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      video.srcObject = mediaStream; await video.play();
      el.dlgScan.showModal();
      const loop = async ()=>{
        if(!video.videoWidth) { scanTimer = setTimeout(loop, 120); return; }
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const img = ctx.getImageData(0,0,canvas.width,canvas.height);
        const code = window.jsQR ? window.jsQR(img.data, img.width, img.height) : null;
        if(code && code.data){ el.scanResult.textContent = code.data; }
        scanTimer = setTimeout(loop, 160);
      };
      loop();
    }catch(e){ flash(el.dlgScan, 'カメラ起動に失敗しました'); }
  }
  function stopScan(){
    try{ if(scanTimer) clearTimeout(scanTimer); }catch(_){}
    try{ mediaStream && mediaStream.getTracks().forEach(t=>t.stop()); }catch(_){}
    el.dlgScan.close();
  }

  // ==============================
  // UX helpers
  // ==============================
  function flash(container, msg){
    if(!container) return;
    const div = document.createElement('div');
    div.className = 'chip';
    div.style.cssText = 'position:relative;margin:.5rem 0;background:#fee2e2;color:#b91c1c';
    div.textContent = msg;
    container.prepend(div);
    setTimeout(()=> div.remove(), 2400);
  }

  // ==============================
  // Kickstart
  // ==============================
  boot();
})();
