const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzV1Ls8bmFrUJtggUcn7zXt5lesCMPeJx2oX13em1l2-ekAx5GMT_X4KfsQ5mWynBlM/exec';

document.addEventListener('DOMContentLoaded', () => {
    // State global untuk menyimpan data
    let state = {
        purchaseOrders: [],
        workOrders: [],
        inventory: []
    };

    // Alur kerja dan status yang digunakan di seluruh aplikasi
    const WO_STATUS_FLOW = ["組立工程", "品質管理", "出荷準備完了", "出荷済み", "完了＆請求済み"];
    const NG_STATUS = "保留 (NG)";
    
    // Variabel untuk menyimpan instance chart dan QR scanner
    let ordersChart, shippedChart, invoiceChart;
    let html5QrCode;

    // --- INISIALISASI ---
    function initializeAppLogic() {
        setupNavigation();
        setupEventListeners();
        initializeCharts();
        fetchInitialData();
        lucide.createIcons();
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    // --- MANAJEMEN UI & NAVIGASI ---
    function setupNavigation() {
        const sidebarLinks = document.querySelectorAll('.sidebar-link');
        
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // Jangan lakukan apa-apa jika ini adalah link eksternal
                if (link.hasAttribute('target')) {
                    return;
                }
                
                e.preventDefault();
                stopScanner();
                const viewId = link.getAttribute('data-view');
                
                // Sembunyikan semua halaman
                document.querySelectorAll('.view').forEach(view => {
                    view.classList.add('hidden');
                });
                // Tampilkan halaman yang dipilih
                const targetView = document.getElementById(viewId);
                if (targetView) {
                    targetView.classList.remove('hidden');
                }

                // Update style link yang aktif
                sidebarLinks.forEach(l => l.classList.remove('sidebar-active'));
                link.classList.add('sidebar-active');
            });
        });
    }

    // Fungsi untuk menampilkan dan menyembunyikan modal (pop-up)
    const toggleModal = (modalId, show) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = show ? 'flex' : 'none';
        }
    };

    // Fungsi untuk menampilkan dan menyembunyikan spinner loading
    const showSpinner = (show) => {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = show ? 'flex' : 'none';
        }
    }

    // Mendaftarkan semua event listener untuk tombol dan form
    function setupEventListeners() {
        document.getElementById('add-po-btn').addEventListener('click', () => {
            document.getElementById('po-form').reset();
            toggleModal('po-modal', true);
        });
        document.getElementById('add-inventory-btn').addEventListener('click', () => {
            document.getElementById('inventory-form').reset();
            document.getElementById('inventory-id').value = '';
            toggleModal('inventory-modal', true);
        });
        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-backdrop');
                if (modal) toggleModal(modal.id, false);
            });
        });
        
        document.getElementById('po-form').addEventListener('submit', handlePOSubmit);
        document.getElementById('inventory-form').addEventListener('submit', handleInventorySubmit);
        document.getElementById('find-wo-btn').addEventListener('click', findWOForStation);
        document.getElementById('scan-qr-btn').addEventListener('click', startScanner);
    }
    
    // --- PENGAMBILAN DATA (API CALLS) ---
    async function apiCall(method, action, data = {}) {
        showSpinner(true);
        try {
            let response;
            if (method === 'GET') {
                response = await fetch(`${SCRIPT_URL}?action=${action}`);
            } else { // POST
                response = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    mode: 'cors',
                    cache: 'no-cache',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action, data })
                });
            }
            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
            const result = await response.json();
            if(result.status === 'error') throw new Error(result.message);
            return result;
        } catch (error) {
            console.error('API Call Error:', error);
            alert(`エラーが発生しました: ${error.message}`);
            return null;
        } finally {
            showSpinner(false);
        }
    }

    async function fetchInitialData() {
        const data = await apiCall('GET', 'getData');
        if (data && data.status === 'success') {
            state.purchaseOrders = data.purchaseOrders || [];
            state.workOrders = data.workOrders || [];
            state.inventory = data.inventory || [];
            renderAll();
        }
    }

    // --- RENDER SEMUA DATA ---
    function renderAll() {
        renderPOs();
        renderWOs();
        renderInventory();
        updateDashboardMetrics();
        updateDashboardCharts();
    }

    // --- LOGIKA & RENDER MODUL ---
    function getStatusBadge(status) {
        switch(status) {
            case '新規': return `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">${status}</span>`;
            case '処理中': return `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-800">${status}</span>`;
            case NG_STATUS: return `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">${status}</span>`;
            case '完了＆請求済み': return `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">${status}</span>`;
            case '出荷済み': return `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">${status}</span>`;
            default: return `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">${status}</span>`;
        }
    }

    async function handlePOSubmit(e) {
        e.preventDefault();
        const poData = {
            poNumber: document.getElementById('po-number').value,
            customer: document.getElementById('po-customer').value,
        };
        const result = await apiCall('POST', 'addPO', poData);
        if (result && result.status === 'success') {
            toggleModal('po-modal', false);
            fetchInitialData();
        }
    }
    
    function renderPOs() {
        const poTableBody = document.getElementById('po-table-body');
        poTableBody.innerHTML = '';
        if (state.purchaseOrders.length === 0) {
            poTableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">POデータがありません。</td></tr>`;
            return;
        }
        state.purchaseOrders.forEach(po => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50';
            tr.innerHTML = `
                <td class="p-4 font-medium text-slate-700">${po.poNumber}</td>
                <td class="p-4 text-slate-600">${po.customer}</td>
                <td class="p-4 text-slate-600">${new Date(po.createdAt).toLocaleDateString()}</td>
                <td class="p-4">${getStatusBadge(po.status)}</td>
                <td class="p-4">
                    ${po.status === '新規' ? `<button data-po-id="${po.id}" data-po-number="${po.poNumber}" class="create-wo-btn bg-secondary text-white px-3 py-1 rounded-md hover:bg-emerald-600 text-sm font-semibold transition-colors">WO作成</button>` : ''}
                </td>
            `;
            poTableBody.appendChild(tr);
        });
        document.querySelectorAll('.create-wo-btn').forEach(btn => btn.addEventListener('click', createWOFromPO));
    }
    
    async function createWOFromPO(e) {
        const poId = e.target.dataset.poId;
        const poNumber = e.target.dataset.poNumber;
        const woNumber = `WO-${Date.now()}`;
        
        const woData = { poId, poNumber, woNumber };
        const result = await apiCall('POST', 'addWO', woData);

        if (result && result.status === 'success') {
            document.getElementById('qr-wo-number').textContent = woNumber;
            const qrContainer = document.getElementById('qrcode-container');
            qrContainer.innerHTML = '';
            const canvas = document.createElement('canvas');
            qrContainer.appendChild(canvas);
            QRCode.toCanvas(canvas, woNumber, { width: 200, margin: 2 }, (error) => {
                if (error) console.error(error);
            });
            toggleModal('qr-modal', true);
            fetchInitialData();
        }
    }

    function renderWOs() {
        const woTableBody = document.getElementById('wo-table-body');
        woTableBody.innerHTML = '';
        if (state.workOrders.length === 0) {
            woTableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">WOデータがありません。</td></tr>`;
            return;
        }
        state.workOrders.forEach(wo => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50';
            tr.innerHTML = `
                <td class="p-4 font-mono text-slate-700">${wo.woNumber}</td>
                <td class="p-4 text-slate-600">${wo.poNumber}</td>
                <td class="p-4">${getStatusBadge(wo.status)}</td>
                <td class="p-4"><button class="bg-slate-200 text-xs px-2 py-1 rounded-md text-slate-600 hover:bg-slate-300">詳細</button></td>
            `;
            woTableBody.appendChild(tr);
        });
        renderWOsOnDashboard(state.workOrders.filter(d => ![NG_STATUS, "完了＆請求済み"].includes(d.status)).slice(-5).reverse());
    }

    async function handleInventorySubmit(e) {
        e.preventDefault();
        const invData = {
            id: document.getElementById('inventory-id').value,
            name: document.getElementById('inventory-name').value,
            sku: document.getElementById('inventory-sku').value,
            type: document.getElementById('inventory-type').value,
            quantity: parseInt(document.getElementById('inventory-quantity').value, 10),
        };
        const result = await apiCall('POST', 'addInventory', invData);
        if (result && result.status === 'success') {
            toggleModal('inventory-modal', false);
            fetchInitialData();
        }
    }

    function renderInventory() {
        const invTableBody = document.getElementById('inventory-table-body');
        invTableBody.innerHTML = '';
        if (state.inventory.length === 0) {
            invTableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">在庫データがありません。</td></tr>`;
            return;
        }
        state.inventory.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50';
            tr.innerHTML = `
                <td class="p-4 font-medium text-slate-700">${item.name}</td><td class="p-4 text-slate-600">${item.sku}</td>
                <td class="p-4 text-slate-600">${item.type}</td><td class="p-4 font-bold text-slate-800">${item.quantity}</td>
                <td class="p-4">
                    <button data-id='${JSON.stringify(item)}' class="edit-inventory-btn text-primary hover:underline text-sm font-semibold">編集</button>
                    <button data-id="${item.id}" class="delete-inventory-btn text-danger hover:underline text-sm ml-3 font-semibold">削除</button>
                </td>
            `;
            invTableBody.appendChild(tr);
        });
        document.querySelectorAll('.edit-inventory-btn').forEach(btn => btn.addEventListener('click', editInventoryItem));
        document.querySelectorAll('.delete-inventory-btn').forEach(btn => btn.addEventListener('click', deleteInventoryItem));
    }
    
    function editInventoryItem(e) {
        const item = JSON.parse(e.target.dataset.id);
        document.getElementById('inventory-id').value = item.id;
        document.getElementById('inventory-name').value = item.name;
        document.getElementById('inventory-sku').value = item.sku;
        document.getElementById('inventory-type').value = item.type;
        document.getElementById('inventory-quantity').value = item.quantity;
        toggleModal('inventory-modal', true);
    }

    async function deleteInventoryItem(e) {
        const id = e.target.dataset.id;
        if (confirm('この品目を削除してもよろしいですか？')) {
            const result = await apiCall('POST', 'deleteInventory', { id });
            if(result && result.status === 'success') fetchInitialData();
        }
    }

    function startScanner() {
        const onScanSuccess = (decodedText, decodedResult) => {
            document.getElementById('wo-scan-input').value = decodedText;
            stopScanner();
            findWOForStation();
        };
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        document.getElementById('qr-reader').style.display = 'block';
        html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
            .catch(err => console.log(`Unable to start scanning, error: ${err}`));
    }
    
    function stopScanner() {
         if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(ignore => {
                document.getElementById('qr-reader').style.display = 'none';
            }).catch(err => console.log("Failed to stop scanner"));
        }
    }

    function findWOForStation() {
        const woNumber = document.getElementById('wo-scan-input').value.trim();
        if(!woNumber) return;
        
        const wo = state.workOrders.find(w => w.woNumber === woNumber);
        const detailsContainer = document.getElementById('wo-station-details');
        
        if (wo) {
            const currentStatusIndex = WO_STATUS_FLOW.indexOf(wo.status);
            let actionButtons = `<p class="mt-4 text-center text-green-600 font-bold">この工程は完了しました。</p>`;
            if (wo.status === "品質管理") {
                const nextStatus = WO_STATUS_FLOW[currentStatusIndex + 1];
                actionButtons = `<p class="mt-4 text-sm text-center text-slate-600">品質管理の結果を選択してください:</p>
                    <div class="flex gap-4 mt-2">
                        <button data-wo-id="${wo.id}" data-next-status="${NG_STATUS}" class="update-wo-status-btn w-full bg-danger text-white py-2 rounded-lg hover:bg-red-600 font-semibold transition-colors">不合格 (NG)</button>
                        <button data-wo-id="${wo.id}" data-next-status="${nextStatus}" class="update-wo-status-btn w-full bg-secondary text-white py-2 rounded-lg hover:bg-emerald-600 font-semibold transition-colors">合格</button>
                    </div>`;
            } else if (currentStatusIndex > -1 && currentStatusIndex < WO_STATUS_FLOW.length - 1) {
                const nextStatus = WO_STATUS_FLOW[currentStatusIndex + 1];
                actionButtons = `<button data-wo-id="${wo.id}" data-next-status="${nextStatus}" class="update-wo-status-btn w-full mt-4 bg-primary text-white py-3 rounded-lg hover:bg-primary-hover font-semibold transition-colors">次へ: ${nextStatus}</button>`;
            }
            detailsContainer.innerHTML = `<div class="border-t border-slate-200 pt-4">
                <p class="text-slate-600"><strong>WO番号:</strong> <span class="font-mono text-slate-800">${wo.woNumber}</span></p>
                <p class="text-slate-600"><strong>現在のステータス:</strong> ${getStatusBadge(wo.status)}</p>
                ${actionButtons}</div>`;
            detailsContainer.classList.remove('hidden');
            document.querySelectorAll('.update-wo-status-btn').forEach(btn => btn.addEventListener('click', updateWOStatus));
        } else {
            detailsContainer.innerHTML = `<p class="text-danger text-center font-semibold">作業指示が見つかりません。</p>`;
            detailsContainer.classList.remove('hidden');
        }
    }

    async function updateWOStatus(e) {
        const woId = e.target.dataset.woId;
        const nextStatus = e.target.dataset.nextStatus;
        const wo = state.workOrders.find(w => w.id === woId);
        if (!wo) return;

        const history = wo.history ? JSON.parse(wo.history) : [];
        const newHistory = [...history, { status: nextStatus, timestamp: new Date() }];
        
        const result = await apiCall('POST', 'updateWOStatus', { woId, nextStatus, newHistory: JSON.stringify(newHistory) });
        if(result && result.status === 'success') {
            document.getElementById('wo-scan-input').value = '';
            document.getElementById('wo-station-details').classList.add('hidden');
            fetchInitialData();
        }
    }
    
    // Dashboard Logic
    function updateDashboardMetrics() {
        document.getElementById('total-po').textContent = state.purchaseOrders.length;
        document.getElementById('active-wo').textContent = state.workOrders.filter(d => ![NG_STATUS, "完了＆請求済み", "出荷済み"].includes(d.status)).length;
        document.getElementById('ready-to-ship').textContent = state.workOrders.filter(d => d.status === "出荷準備完了").length;
        document.getElementById('hold-ng').textContent = state.workOrders.filter(d => d.status === NG_STATUS).length;
    }

    function renderWOsOnDashboard(wos) {
        const container = document.getElementById('latest-wo-tracking');
        container.innerHTML = '';
        if (wos.length === 0) {
            container.innerHTML = '<p class="text-slate-500">アクティブな作業指示はありません。</p>';
            return;
        }
        wos.forEach(wo => {
            const statusIndex = WO_STATUS_FLOW.indexOf(wo.status);
            const progress = statusIndex > -1 ? ((statusIndex + 1) / WO_STATUS_FLOW.length) * 100 : 0;
            container.innerHTML += `<div class="mb-1"><div class="flex justify-between items-center"><p class="font-bold text-slate-700 text-sm">${wo.woNumber}</p><p class="text-xs text-slate-500">${wo.status}</p></div></div><div class="w-full bg-slate-200 rounded-full h-2"><div class="bg-primary h-2 rounded-full transition-all duration-500" style="width: ${progress}%"></div></div>`;
        });
    }

    function initializeCharts() {
        const chartOptions = { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 20, font: { size: 12 } } } } };
        ordersChart = new Chart(document.getElementById('ordersChart'), { type: 'doughnut', data: { labels: ['新規', '処理中'], datasets: [{ data: [0, 0], backgroundColor: ['#6366f1', '#94a3b8'], borderWidth: 0 }] }, options: chartOptions });
        shippedChart = new Chart(document.getElementById('shippedChart'), { type: 'doughnut', data: { labels: ['未出荷', '出荷済み'], datasets: [{ data: [0, 0], backgroundColor: ['#f59e0b', '#4f46e5'], borderWidth: 0 }] }, options: chartOptions });
        invoiceChart = new Chart(document.getElementById('invoiceChart'), { type: 'doughnut', data: { labels: ['未請求', '請求済み'], datasets: [{ data: [0, 0], backgroundColor: ['#ef4444', '#10b981'], borderWidth: 0 }] }, options: chartOptions });
    }

    function updateDashboardCharts() {
        const newOrders = state.purchaseOrders.filter(d => d.status === '新規').length;
        const processedOrders = state.purchaseOrders.length - newOrders;
        ordersChart.data.datasets[0].data = [newOrders, processedOrders];
        ordersChart.update();

        const shipped = state.workOrders.filter(d => d.status === '出荷済み' || d.status === '完了＆請求済み').length;
        shippedChart.data.datasets[0].data = [state.workOrders.length - shipped, shipped];
        shippedChart.update();

        const invoiced = state.workOrders.filter(d => d.status === '完了＆請求済み').length;
        invoiceChart.data.datasets[0].data = [state.workOrders.length - invoiced, invoiced];
        invoiceChart.update();
    }

    initializeAppLogic();
});

