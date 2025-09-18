const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyJ5YR96hzYFcAW9KGAUAosd6DB-EGZMTjLs1Az56MxioTb48V-F7rojrOEHGWiioih/exec';

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
    const CANCELED_STATUS = "キャンセル済み";
    
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
                if (link.hasAttribute('target')) return;
                e.preventDefault();
                stopScanner();
                const viewId = link.getAttribute('data-view');
                document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
                const targetView = document.getElementById(viewId);
                if (targetView) targetView.classList.remove('hidden');
                sidebarLinks.forEach(l => l.classList.remove('sidebar-active'));
                link.classList.add('sidebar-active');
            });
        });
    }

    const toggleModal = (modalId, show) => {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = show ? 'flex' : 'none';
    };

    const showSpinner = (show) => {
        document.getElementById('loading-spinner').style.display = show ? 'flex' : 'none';
    }

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
            const response = await fetch(method === 'GET' ? `${SCRIPT_URL}?action=${action}` : SCRIPT_URL, {
                method: method === 'GET' ? 'GET' : 'POST',
                mode: 'cors',
                cache: 'no-cache',
                redirect: 'follow',
                headers: method === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : {},
                body: method === 'POST' ? JSON.stringify({ action, data }) : null
            });
            if (!response.ok) throw new Error(`Network response error: ${response.statusText}`);
            const result = await response.json();
            if (result.status === 'error') throw new Error(result.message);
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
            state = { ...state, ...data };
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
        let colorClass = 'bg-slate-100 text-slate-800'; // Default
        if (status === '新規') colorClass = 'bg-blue-100 text-blue-800';
        else if (status === NG_STATUS || status === CANCELED_STATUS) colorClass = 'bg-red-100 text-red-800';
        else if (status === '完了＆請求済み') colorClass = 'bg-green-100 text-green-800';
        else if (status === '出荷済み') colorClass = 'bg-indigo-100 text-indigo-800';
        else if (status.includes('工程') || status.includes('管理')) colorClass = 'bg-yellow-100 text-yellow-800';
        return `<span class="px-2 py-1 text-xs font-semibold rounded-full ${colorClass}">${status}</span>`;
    }

    async function handlePOSubmit(e) {
        e.preventDefault();
        const poData = { poNumber: document.getElementById('po-number').value, customer: document.getElementById('po-customer').value };
        const result = await apiCall('POST', 'addPO', poData);
        if (result && result.status === 'success') {
            toggleModal('po-modal', false);
            fetchInitialData();
        }
    }
    
    function renderPOs() {
        const poTableBody = document.getElementById('po-table-body');
        poTableBody.innerHTML = state.purchaseOrders.map(po => `
            <tr class="hover:bg-slate-50">
                <td class="p-4 font-medium text-slate-700">${po.poNumber}</td>
                <td class="p-4 text-slate-600">${po.customer}</td>
                <td class="p-4 text-slate-600">${new Date(po.createdAt).toLocaleDateString()}</td>
                <td class="p-4">${getStatusBadge(po.status)}</td>
                <td class="p-4 space-x-2">
                    ${po.status === '新規' ? `<button data-po-id="${po.id}" data-po-number="${po.poNumber}" class="create-wo-btn bg-secondary text-white px-3 py-1 rounded-md hover:bg-emerald-600 text-sm font-semibold">WO作成</button>` : ''}
                    ${po.status === '新規' ? `<button data-po-id="${po.id}" class="cancel-po-btn text-danger hover:underline text-sm font-semibold">キャンセル</button>` : ''}
                </td>
            </tr>
        `).join('') || `<tr><td colspan="5" class="p-4 text-center text-slate-500">POデータがありません。</td></tr>`;
        
        poTableBody.querySelectorAll('.create-wo-btn').forEach(btn => btn.addEventListener('click', createWOFromPO));
        poTableBody.querySelectorAll('.cancel-po-btn').forEach(btn => btn.addEventListener('click', cancelPO));
    }
    
    async function createWOFromPO(e) {
        const { poId, poNumber } = e.target.dataset;
        const woNumber = `WO-${Date.now()}`;
        const result = await apiCall('POST', 'addWO', { poId, poNumber, woNumber });
        if (result && result.status === 'success') {
            document.getElementById('qr-wo-number').textContent = woNumber;
            const qrContainer = document.getElementById('qrcode-container');
            qrContainer.innerHTML = '';
            QRCode.toCanvas(qrContainer, woNumber, { width: 220, margin: 1 });
            toggleModal('qr-modal', true);
            fetchInitialData();
        }
    }
    
    async function cancelPO(e) {
        const { poId } = e.target.dataset;
        if (confirm(`PO ini akan dibatalkan. Lanjutkan?`)) {
            const result = await apiCall('POST', 'cancelPO', { poId });
            if (result && result.status === 'success') fetchInitialData();
        }
    }

    async function cancelWO(e) {
        const { woId, poId } = e.target.dataset;
        if (confirm(`WO ini akan dibatalkan dan status PO terkait akan dikembalikan. Lanjutkan?`)) {
            const result = await apiCall('POST', 'cancelWO', { woId, poId });
            if (result && result.status === 'success') fetchInitialData();
        }
    }

    function renderWOs() {
        const woTableBody = document.getElementById('wo-table-body');
        const activeWOsForDashboard = [];
        woTableBody.innerHTML = state.workOrders.map(wo => {
            const isCancelable = wo.status !== CANCELED_STATUS && wo.status !== '完了＆請求済み';
            if (isCancelable && wo.status !== NG_STATUS) activeWOsForDashboard.push(wo);
            return `
                <tr class="hover:bg-slate-50">
                    <td class="p-4 font-mono text-slate-700">${wo.woNumber}</td>
                    <td class="p-4 text-slate-600">${wo.poNumber}</td>
                    <td class="p-4">${getStatusBadge(wo.status)}</td>
                    <td class="p-4 space-x-2">
                        ${isCancelable ? `<button data-wo-id="${wo.id}" data-po-id="${wo.poId}" class="cancel-wo-btn text-danger hover:underline text-sm font-semibold">キャンセル</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('') || `<tr><td colspan="4" class="p-4 text-center text-slate-500">WOデータがありません。</td></tr>`;
        
        woTableBody.querySelectorAll('.cancel-wo-btn').forEach(btn => btn.addEventListener('click', cancelWO));
        renderWOsOnDashboard(activeWOsForDashboard.slice(-5).reverse());
    }

    function findWOForStation() {
        const woNumber = document.getElementById('wo-scan-input').value.trim();
        if(!woNumber) return;
        
        const wo = state.workOrders.find(w => w.woNumber === woNumber);
        const detailsContainer = document.getElementById('wo-station-details');
        detailsContainer.classList.remove('hidden');
        
        if (wo) {
            const currentStatusIndex = WO_STATUS_FLOW.indexOf(wo.status);
            let actionButtons = `<p class="mt-4 text-center text-green-600 font-bold">Proses untuk WO ini sudah selesai atau dibatalkan.</p>`;

            if (wo.status === NG_STATUS) {
                 actionButtons = `<p class="mt-4 text-sm text-center text-slate-600">Barang ini berstatus NG. Apakah akan dikerjakan ulang?</p>
                    <button data-wo-id="${wo.id}" data-next-status="品質管理" class="update-wo-status-btn w-full mt-2 bg-yellow-500 text-white py-3 rounded-lg hover:bg-yellow-600 font-semibold transition-colors">再作業 (Kerjakan Ulang)</button>`;
            } else if (wo.status === "品質管理") {
                const nextStatus = WO_STATUS_FLOW[currentStatusIndex + 1];
                actionButtons = `<p class="mt-4 text-sm text-center text-slate-600">Pilih hasil Quality Control:</p>
                    <div class="flex gap-4 mt-2">
                        <button data-wo-id="${wo.id}" data-next-status="${NG_STATUS}" class="update-wo-status-btn w-full bg-danger text-white py-2 rounded-lg hover:bg-red-600 font-semibold">Tidak Lolos (NG)</button>
                        <button data-wo-id="${wo.id}" data-next-status="${nextStatus}" class="update-wo-status-btn w-full bg-secondary text-white py-2 rounded-lg hover:bg-emerald-600 font-semibold">Lolos</button>
                    </div>`;
            } else if (currentStatusIndex > -1 && currentStatusIndex < WO_STATUS_FLOW.length - 1) {
                const nextStatus = WO_STATUS_FLOW[currentStatusIndex + 1];
                actionButtons = `<button data-wo-id="${wo.id}" data-next-status="${nextStatus}" class="update-wo-status-btn w-full mt-4 bg-primary text-white py-3 rounded-lg hover:bg-primary-hover font-semibold">Lanjutkan ke: ${nextStatus}</button>`;
            }

            detailsContainer.innerHTML = `<div class="border-t border-slate-200 pt-4">
                <p><strong>WO番号:</strong> <span class="font-mono">${wo.woNumber}</span></p>
                <p><strong>Status Saat Ini:</strong> ${getStatusBadge(wo.status)}</p>
                ${actionButtons}</div>`;
            detailsContainer.querySelectorAll('.update-wo-status-btn').forEach(btn => btn.addEventListener('click', updateWOStatus));
        } else {
            detailsContainer.innerHTML = `<p class="text-danger text-center font-semibold">作業指示が見つかりません。</p>`;
        }
    }
    
    async function handleInventorySubmit(e) {
        e.preventDefault();
        const invData = { id: document.getElementById('inventory-id').value, name: document.getElementById('inventory-name').value, sku: document.getElementById('inventory-sku').value, type: document.getElementById('inventory-type').value, quantity: parseInt(document.getElementById('inventory-quantity').value, 10) };
        const result = await apiCall('POST', 'addInventory', invData);
        if (result && result.status === 'success') {
            toggleModal('inventory-modal', false);
            fetchInitialData();
        }
    }

    function renderInventory() {
        const invTableBody = document.getElementById('inventory-table-body');
        invTableBody.innerHTML = state.inventory.map(item => `
            <tr class="hover:bg-slate-50">
                <td class="p-4 font-medium text-slate-700">${item.name}</td><td class="p-4">${item.sku}</td>
                <td class="p-4">${item.type}</td><td class="p-4 font-bold">${item.quantity}</td>
                <td class="p-4 space-x-3">
                    <button data-item='${JSON.stringify(item)}' class="edit-inventory-btn text-primary hover:underline text-sm font-semibold">編集</button>
                    <button data-id="${item.id}" class="delete-inventory-btn text-danger hover:underline text-sm font-semibold">削除</button>
                </td>
            </tr>
        `).join('') || `<tr><td colspan="5" class="p-4 text-center text-slate-500">在庫データがありません。</td></tr>`;
        invTableBody.querySelectorAll('.edit-inventory-btn').forEach(btn => btn.addEventListener('click', editInventoryItem));
        invTableBody.querySelectorAll('.delete-inventory-btn').forEach(btn => btn.addEventListener('click', deleteInventoryItem));
    }

    function editInventoryItem(e) {
        const item = JSON.parse(e.target.dataset.item);
        document.getElementById('inventory-id').value = item.id;
        document.getElementById('inventory-name').value = item.name;
        document.getElementById('inventory-sku').value = item.sku;
        document.getElementById('inventory-type').value = item.type;
        document.getElementById('inventory-quantity').value = item.quantity;
        toggleModal('inventory-modal', true);
    }

    async function deleteInventoryItem(e) {
        const { id } = e.target.dataset;
        if (confirm('Item ini akan dihapus. Lanjutkan?')) {
            const result = await apiCall('POST', 'deleteInventory', { id });
            if(result && result.status === 'success') fetchInitialData();
        }
    }

    function startScanner() {
        const onScanSuccess = (decodedText) => {
            document.getElementById('wo-scan-input').value = decodedText;
            stopScanner();
            findWOForStation();
        };
        document.getElementById('qr-reader').style.display = 'block';
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess);
    }

    function stopScanner() {
         if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                document.getElementById('qr-reader').style.display = 'none';
            });
        }
    }

    async function updateWOStatus(e) {
        const { woId, nextStatus } = e.target.dataset;
        const wo = state.workOrders.find(w => w.id === woId);
        if (!wo) return;
        const history = wo.history ? JSON.parse(wo.history) : [];
        const newHistory = JSON.stringify([...history, { status: nextStatus, timestamp: new Date() }]);
        const result = await apiCall('POST', 'updateWOStatus', { woId, nextStatus, newHistory });
        if(result && result.status === 'success') {
            document.getElementById('wo-scan-input').value = '';
            document.getElementById('wo-station-details').classList.add('hidden');
            fetchInitialData();
        }
    }

    function updateDashboardMetrics() {
        document.getElementById('total-po').textContent = state.purchaseOrders.length;
        document.getElementById('active-wo').textContent = state.workOrders.filter(d => !['完了＆請求済み', NG_STATUS, CANCELED_STATUS].includes(d.status)).length;
        document.getElementById('ready-to-ship').textContent = state.workOrders.filter(d => d.status === "出荷準備完了").length;
        document.getElementById('hold-ng').textContent = state.workOrders.filter(d => d.status === NG_STATUS).length;
    }

    function renderWOsOnDashboard(wos) {
        const container = document.getElementById('latest-wo-tracking');
        container.innerHTML = wos.map(wo => {
            const statusIndex = WO_STATUS_FLOW.indexOf(wo.status);
            const progress = statusIndex > -1 ? ((statusIndex + 1) / WO_STATUS_FLOW.length) * 100 : 0;
            return `<div class="mb-1"><div class="flex justify-between items-center"><p class="font-bold text-slate-700 text-sm">${wo.woNumber}</p><p class="text-xs text-slate-500">${wo.status}</p></div></div><div class="w-full bg-slate-200 rounded-full h-2"><div class="bg-primary h-2 rounded-full" style="width: ${progress}%"></div></div>`;
        }).join('') || '<p class="text-slate-500">アクティブな作業指示はありません。</p>';
    }

    function initializeCharts() {
        const chartOptions = { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 20 } } } };
        ordersChart = new Chart(document.getElementById('ordersChart'), { type: 'doughnut', data: { labels: ['新規', '処理中', '完了'], datasets: [{ data: [0, 0, 0], backgroundColor: ['#6366f1', '#94a3b8', '#10b981'], borderWidth: 0 }] }, options: chartOptions });
        shippedChart = new Chart(document.getElementById('shippedChart'), { type: 'doughnut', data: { labels: ['未出荷', '出荷済み'], datasets: [{ data: [0, 0], backgroundColor: ['#f59e0b', '#4f46e5'], borderWidth: 0 }] }, options: chartOptions });
        invoiceChart = new Chart(document.getElementById('invoiceChart'), { type: 'doughnut', data: { labels: ['未請求', '請求済み'], datasets: [{ data: [0, 0], backgroundColor: ['#ef4444', '#10b981'], borderWidth: 0 }] }, options: chartOptions });
    }

    function updateDashboardCharts() {
        const newPOs = state.purchaseOrders.filter(d => d.status === '新規').length;
        const processingPOs = state.purchaseOrders.filter(d => d.status === '処理中').length;
        const completedPOs = state.purchaseOrders.filter(d => d.status === '完了＆請求済み').length;
        ordersChart.data.datasets[0].data = [newPOs, processingPOs, completedPOs];
        ordersChart.update();
        const shipped = state.workOrders.filter(d => ['出荷済み', '完了＆請求済み'].includes(d.status)).length;
        shippedChart.data.datasets[0].data = [state.workOrders.length - shipped, shipped];
        shippedChart.update();
        const invoiced = state.workOrders.filter(d => d.status === '完了＆請求済み').length;
        invoiceChart.data.datasets[0].data = [state.workOrders.length - invoiced, invoiced];
        invoiceChart.update();
    }

    initializeAppLogic();
});

