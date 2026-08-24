// Lógica para o relatório "Verificar Construção / Vistoria"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _vcGetThreshold() {
    let thresholdDays = 91;
    if (window.TimelineState && Array.isArray(window.TimelineState)) {
        const node = window.TimelineState.find(n =>
            n.acao === 'verificar_construcao' ||
            n.acao === 'vistoria' ||
            (n.label || n.nome || '').toLowerCase().includes('verificar constru') ||
            String(window.TimelineAcoesList?.find(a => a.id === n.acao)?.label || '').toLowerCase().includes('verificar constru')
        );
        if (node && node.dias !== undefined) {
            const parsed = parseInt(node.dias);
            if (!isNaN(parsed) && parsed > 0) thresholdDays = parsed;
        }
    }
    return thresholdDays;
}

function _vcGetRecurrenceDays() {
    const value = parseInt(localStorage.getItem('crm_moura_vistoria_recurrence_days') || '90', 10);
    return Number.isFinite(value) && value > 0 ? value : 90;
}

function _vcDaysSince(dateValue) {
    if (!dateValue) return null;
    const date = new Date(String(dateValue).split('T')[0] + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Math.max(0, Math.floor((today - date) / (1000 * 60 * 60 * 24)));
}

window.openVistoriaRecurrenceModal = function() {
    const modal = document.getElementById('vistoria-recurrence-modal');
    const input = document.getElementById('vistoria-recurrence-days');
    if (!modal || !input) {
        console.error('[Vistoria] Modal de recorrência não encontrado no HTML.');
        return;
    }
    input.value = localStorage.getItem('crm_moura_vistoria_recurrence_days') || '90';
    modal.style.display = 'flex';
    modal.classList.add('active');
};

window.saveVistoriaRecurrence = function() {
    const input = document.getElementById('vistoria-recurrence-days');
    const days = parseInt(input?.value || '', 10);
    if (!Number.isFinite(days) || days < 1) {
        alert('Informe um intervalo válido maior que zero.');
        return;
    }
    localStorage.setItem('crm_moura_vistoria_recurrence_days', String(days));
    const modal = document.getElementById('vistoria-recurrence-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    if (window.forceUploadLocalConfig) window.forceUploadLocalConfig(true).catch(console.error);
    if (window.VerificarConstrucaoApp && typeof window.VerificarConstrucaoApp.loadData === 'function') {
        window.VerificarConstrucaoApp.loadData();
    }
};

function _vcGetCostCenterName(costCenterId) {
    if (!costCenterId) return '-';
    const ccList = (window.AppState && window.AppState.cachedCostCenters) || [];
    const cc = ccList.find(c => String(c.id) === String(costCenterId));
    if (!cc) return '-';
    return cc.name || '-';
}

function _vcGetCity(costCenterId) {
    const ccName = _vcGetCostCenterName(costCenterId);
    if (!ccName || ccName === '-') return '-';
    if (String(costCenterId) === '14201' || ccName.toUpperCase().includes('ARAÇARI')) return 'ARAÇARIGUAMA';
    if (ccName.includes('-')) return ccName.split('-')[0].trim().toUpperCase();
    return ccName.trim().toUpperCase();
}

// Retorna "13900 - AVARÉ - CENTRAL PARQUE II" a partir do costCenterId
function _vcGetEmpLabel(costCenterId) {
    if (!costCenterId) return '-';
    const ccName = _vcGetCostCenterName(costCenterId);
    if (!ccName || ccName === '-') return '-';
    // ccName típico: "AVARÉ - CENTRAL PARQUE" ou "ARAÇARIGUAMA - JARDIM SÃO PAULO"
    return `${costCenterId} - ${ccName.trim().toUpperCase()}`;
}

// ─── App ────────────────────────────────────────────────────────────────────

window.VerificarConstrucaoApp = {
    renderedRows: null,
    allRows: null,
    activeFilters: {
        cidade: 'Todos',
        empreendimento: 'Todos',
        status: 'Todos',
        obras: 'Todos'
    },

    init() {
        this.render();
        this.loadData();
        
        if (this._unsubscribeVistorias) this._unsubscribeVistorias();
        if (window.firebaseCollections && window.firebaseDb) {
            const { collection, onSnapshot, query, where } = window.firebaseCollections;
            const q = query(collection(window.firebaseDb, 'vistorias'), where('status', '!=', 'concluida'));
            this._unsubscribeVistorias = onSnapshot(q, (snapshot) => {
                clearTimeout(this._reloadTimeout);
                this._reloadTimeout = setTimeout(() => {
                    // Only reload if the container is visible
                    const root = document.getElementById('verificar-construcao-root');
                    if (root && root.closest('.tab-pane') && root.closest('.tab-pane').style.display !== 'none') {
                        this.loadData();
                    }
                }, 1500);
            });
        }
    },

    render() {
        const root = document.getElementById('verificar-construcao-root');
        if (!root) return;

        const thresholdDays = _vcGetThreshold();

        root.innerHTML = `
            <div class="crm-card" style="padding: 24px;">
                <h3 style="font-size: 1.2rem; color: var(--color-primary); margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="camera" style="width: 24px;"></i> Verificar Construção (Atraso >= ${thresholdDays} dias)
                </h3>

                <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button class="btn btn-outline" style="border-color: #94a3b8; color: #475569;" onclick="window.VerificarConstrucaoApp.abrirModalObrasAndamento()">
                            <i data-lucide="building" style="width: 16px;"></i> Obras em andamento
                        </button>
                        <button class="btn btn-outline" style="border-color: #0f766e; color: #0f766e;" onclick="window.openVistoriaRecurrenceModal()">
                            <i data-lucide="refresh-cw" style="width: 16px;"></i> Recorrência de Vistoria
                        </button>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-left: 5px;">
                            <div style="position: relative; width: 34px; height: 20px;">
                                <input type="checkbox" id="vc-include-subjudice" onchange="window.VerificarConstrucaoApp.loadData()" style="opacity: 0; width: 0; height: 0; position: absolute;">
                                <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">
                                    <span class="vc-toggle-knob" style="position: absolute; content: ''; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.3);"></span>
                                </span>
                            </div>
                            <span style="font-size: 0.85rem; color: #475569; font-weight: 600;">Incluir Sub Judice</span>
                        </label>
                        <style>
                            #vc-include-subjudice:checked + span { background-color: #0f766e; }
                            #vc-include-subjudice:checked + span .vc-toggle-knob { transform: translateX(14px); }
                        </style>
                    </div>
                    <div>
                        <button onclick="window.VerificarConstrucaoApp.solicitarWhatsApp()" id="btn-solicitar-wpp" disabled style="padding:10px 24px; border:none; background:linear-gradient(135deg, #16a34a 0%, #15803d 100%); color:#fff; border-radius:8px; cursor:pointer; font-weight:bold; font-size:1rem; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 12px rgba(22,163,74,0.4); opacity:0.5; transition:all 0.2s;" onmouseover="if(!this.disabled) { this.style.opacity='1'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 16px rgba(22,163,74,0.5)'; }" onmouseout="if(!this.disabled) { this.style.opacity='1'; this.style.transform='none'; this.style.boxShadow='0 4px 12px rgba(22,163,74,0.4)'; } else { this.style.opacity='0.5'; this.style.transform='none'; this.style.boxShadow='0 4px 12px rgba(22,163,74,0.4)'; }">
                            <i data-lucide="message-circle" style="width: 20px; height: 20px;"></i> Solicitar Vistoria (WhatsApp)
                        </button>
                    </div>
                </div>

                <div id="vc-loading" style="display: none; text-align: center; padding: 20px; color: #666;">
                    Analisando fila de clientes...
                </div>

                <div id="vc-results" style="display: none;">
                    <div style="max-height: 75vh; overflow-y: auto; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;" id="vc-table">
                            <thead style="position: sticky; top: 0; background: linear-gradient(135deg, #2e6b3e 0%, #3d7a4a 100%); z-index: 10;">
                                <tr>
                                    <th style="padding: 12px 10px; width: 40px; text-align: center; color: rgba(255,255,255,0.8);">
                                        <input type="checkbox" onchange="window.VerificarConstrucaoApp.toggleAll(this)">
                                    </th>
                                    <th style="padding: 12px 10px; color: #fff; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em;">UNIDADE</th>
                                    <th style="padding: 12px 10px; color: #fff; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em;">CLIENTE</th>
                                    <th style="padding: 12px 10px; color: #fff; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em;">TÍTULO</th>
                                    <th style="padding: 12px 10px; color: #fff; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; text-align: center;">PARC. VENCIDAS</th>
                                    <th style="padding: 12px 10px; color: #fff; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; text-align: right;">ÚLTIMA VISTORIA</th>
                                    <th style="padding: 12px 10px; color: #fff; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em;">STATUS</th>
                                </tr>
                            </thead>
                            <tbody id="vc-tbody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        this._ensureModals();

        if (window.lucide) lucide.createIcons();
    },

    _ensureModals() {
        if (document.getElementById('modal-validar-vistoria')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'vc-modals-wrapper';
        wrapper.innerHTML = `
            <!-- Modal Validar Vistoria -->
            <div id="modal-validar-vistoria" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.55); z-index:99999; align-items:flex-start; justify-content:center; padding-top:40px; overflow-y:auto;">
                <div style="background:#fff; border-radius:14px; width:900px; max-width:95%; box-shadow:0 24px 80px rgba(0,0,0,0.35); margin-bottom:40px;">
                    <div style="padding:22px 28px; border-bottom:2px solid #1a4731; display:flex; justify-content:space-between; align-items:center; background: linear-gradient(135deg, #2e6b3e 0%, #3d7a4a 100%); border-radius: 14px 14px 0 0;">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="width:36px; height:36px; background:rgba(255,255,255,0.15); border-radius:8px; display:flex; align-items:center; justify-content:center;">
                                <svg width="20" height="20" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            </div>
                            <h2 style="margin:0; font-size:1.15rem; color:#fff; font-weight:600;">Validar Vistoria</h2>
                        </div>
                        <button onclick="document.getElementById('modal-validar-vistoria').style.display='none'" style="background:rgba(255,255,255,0.15); border:none; cursor:pointer; color:#fff; font-size:1.1rem; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">✕</button>
                    </div>
                    <div id="validar-vistoria-body" style="padding:28px; min-height:200px;">
                        Carregando...
                    </div>
                    <div style="padding:18px 28px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:12px; background:#f8fafc; border-radius: 0 0 14px 14px;">
                        <button onclick="window.VerificarConstrucaoApp.rejeitarVistoriaModal()" style="padding:10px 22px; border:2px solid #dc2626; color:#dc2626; background:transparent; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.9rem; display:flex; align-items:center; gap:6px; transition: all 0.2s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='transparent'">
                            ✕ Rejeitar
                        </button>
                        <button onclick="window.VerificarConstrucaoApp.aprovarVistoriaModal()" style="padding:10px 22px; border:none; color:#fff; background:linear-gradient(135deg, #153123 0%, #1e4a35 100%); border-radius:8px; cursor:pointer; font-weight:600; font-size:0.9rem; display:flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(21,49,35,0.3); transition: all 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                            ✓ Aprovar Vistoria
                        </button>
                    </div>
                </div>
            </div>

            <!-- Modal Obras em Andamento -->
            <div id="modal-obras-andamento" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.55); z-index:99999; align-items:flex-start; justify-content:center; padding-top:40px; overflow-y:auto;">
                <div style="background:#fff; border-radius:14px; width:660px; max-width:95%; box-shadow:0 24px 80px rgba(0,0,0,0.35); margin-bottom:40px;">
                    <div style="padding:22px 28px; border-bottom:2px solid #1a4731; display:flex; justify-content:space-between; align-items:center; background: linear-gradient(135deg, #2e6b3e 0%, #3d7a4a 100%); border-radius: 14px 14px 0 0;">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="width:36px; height:36px; background:rgba(255,255,255,0.15); border-radius:8px; display:flex; align-items:center; justify-content:center;">
                                <svg width="20" height="20" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
                            </div>
                            <div>
                                <h2 style="margin:0; font-size:1.1rem; color:#fff; font-weight:600;">Obras em Andamento</h2>
                                <p style="margin:2px 0 0; font-size:0.78rem; color:rgba(255,255,255,0.7);">Empreendimentos com obra ativa — clientes dispensados de vistoria</p>
                            </div>
                        </div>
                        <button onclick="document.getElementById('modal-obras-andamento').style.display='none'" style="background:rgba(255,255,255,0.15); border:none; cursor:pointer; color:#fff; font-size:1.1rem; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">✕</button>
                    </div>
                    <div style="padding:20px 28px; max-height:55vh; overflow-y:auto;">
                        <div id="obras-andamento-list">Carregando...</div>
                    </div>
                    <div style="padding:18px 28px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:12px; background:#f8fafc; border-radius: 0 0 14px 14px;">
                        <button onclick="document.getElementById('modal-obras-andamento').style.display='none'" style="padding:10px 22px; border:2px solid #94a3b8; color:#64748b; background:transparent; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.9rem; transition: all 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                            Fechar
                        </button>
                        <button onclick="window.VerificarConstrucaoApp.salvarObrasAndamento()" style="padding:10px 22px; border:none; color:#fff; background:linear-gradient(135deg, #153123 0%, #1e4a35 100%); border-radius:8px; cursor:pointer; font-weight:600; font-size:0.9rem; display:flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(21,49,35,0.3); transition: all 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                            Salvar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(wrapper);
    },

    async loadData() {
        const loading = document.getElementById('vc-loading');
        const results = document.getElementById('vc-results');
        const btnWpp = document.getElementById('btn-solicitar-wpp');

        loading.style.display = 'block';
        results.style.display = 'none';
        if (btnWpp) btnWpp.disabled = true;

        const thresholdDays = _vcGetThreshold();
        const recurrenceDays = _vcGetRecurrenceDays();

        try {
            const clients = window.rawClientList || (window.AppState && window.AppState.sales) || [];
            // Filter will be applied after loading checksByContract
            const checksByContract = {};
            const completedChecksByContract = {};
            const latestCheckDateByContract = {};
            
            if (window.firebaseDb && window.firebaseCollections) {
                try {
                    const { collection, getDocs, query, where } = window.firebaseCollections;
                    const q = query(collection(window.firebaseDb, 'vistorias'), where('status', '!=', 'concluida'));
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        const data = doc.data();
                        // Links de teste não concluídos devem voltar para a fila como pendentes.
                        if (data.status === 'aguardando_fotos') return;
                        const docObj = { id: doc.id, ...data };
                        checksByContract[String(data.contractId)] = docObj;
                        if (data.contractKeys && Array.isArray(data.contractKeys)) {
                            data.contractKeys.forEach(k => {
                                checksByContract[String(k)] = docObj;
                            });
                        }
                        if (data.tituloKey) {
                            checksByContract[String(data.tituloKey)] = docObj;
                        }
                    });

                    const snapChecks = await getDocs(collection(window.firebaseDb, 'construction_checks'));
                    snapChecks.forEach(doc => {
                        const data = doc.data();
                        if (data.stage && data.stage.trim() !== '') {
                            const cDate = data.date || data.createdAt || '1970-01-01';
                            
                            const keysToSet = data.contractKeys ? [...data.contractKeys] : [String(data.contractId)];
                            if (data.realSaleId) keysToSet.push(String(data.realSaleId));
                            if (data.tituloKey) keysToSet.push(String(data.tituloKey));
                            
                            keysToSet.forEach(key => {
                                if (!latestCheckDateByContract[key] || cDate >= latestCheckDateByContract[key]) {
                                    latestCheckDateByContract[key] = cDate;
                                    
                                    const stageUpper = data.stage.trim().toUpperCase();
                                    if (stageUpper === 'SEM CONSTRUÇÃO' || stageUpper === 'TERRAPLANAGEM' || stageUpper === 'SEM CONSTRUCAO') {
                                        completedChecksByContract[key] = false;
                                    } else {
                                        completedChecksByContract[key] = true;
                                    }
                                }
                            });
                        }
                    });
                } catch (err) {
                    console.warn('[Vistoria] Erro ao buscar histórico:', err);
                }
            }

            const includeSubjudice = document.getElementById('vc-include-subjudice') ? document.getElementById('vc-include-subjudice').checked : false;

            const elegiveis = clients.filter(c => {
                const maxDelay = parseInt(c.maxDaysDelay) || 0;
                if (maxDelay < thresholdDays) return false;
                
                if (!includeSubjudice && (c.subjudice === 'S' || c.subjudice === true)) return false;

                const contractId = c.saleId || c.contractId || c.id;
                let fallbackTitle = contractId;
                if (c.billIds && c.billIds.length > 0) fallbackTitle = c.billIds[0];
                const tituloKey = c.saleCode || c.contractCode || c.titulo || c.codigo || fallbackTitle;
                const realSaleIdStr = String(c.realSaleId || '');
                const contractNumberStr = String(c.contractNumber || '');
                
                const hasActive = !!(
                    checksByContract[String(contractId)] || 
                    checksByContract[String(tituloKey)] || 
                    (contractNumberStr && checksByContract[contractNumberStr]) ||
                    (realSaleIdStr && checksByContract[realSaleIdStr])
                );
                
                const latestCheckDate = [String(contractId), String(tituloKey), contractNumberStr, realSaleIdStr]
                    .map(key => latestCheckDateByContract[key])
                    .filter(Boolean)
                    .sort()
                    .pop();
                const daysSinceCheck = _vcDaysSince(latestCheckDate);

                return !latestCheckDate || daysSinceCheck >= recurrenceDays || hasActive;
            });

            const rows = [];
            elegiveis.forEach(c => {
                const contractId = c.saleId || c.contractId || c.id;
                let fallbackTitle = contractId;
                if (c.billIds && c.billIds.length > 0) fallbackTitle = c.billIds[0];
                const tituloKey = c.saleCode || c.contractCode || c.titulo || c.codigo || fallbackTitle;
                const realSaleIdStr = String(c.realSaleId || '');
                const contractNumberStr = String(c.contractNumber || '');
                
                const hasConstruction = !!(
                    completedChecksByContract[String(contractId)] || 
                    completedChecksByContract[String(tituloKey)] || 
                    (contractNumberStr && completedChecksByContract[contractNumberStr]) ||
                    (realSaleIdStr && completedChecksByContract[realSaleIdStr])
                );
                if (hasConstruction) return; // Dispensa de vistoria - remove da lista

                const costCenterId = c.costCenterId;
                const city = _vcGetCity(costCenterId);
                const ccName = _vcGetCostCenterName(costCenterId);
                let empreendimento = '-';
                if (ccName && ccName !== '-') {
                    empreendimento = ccName.includes('-') ? ccName.split('-').slice(1).join('-').trim() : ccName.trim();
                }
                // Label completo: "13900 - AVARÉ - CENTRAL PARQUE II"
                const empLabel = _vcGetEmpLabel(costCenterId);

                const unidade = c.unitName || c.unit || c.unidade || contractId || '-';
                const vistoriaAtiva = checksByContract[String(contractId)] || checksByContract[String(tituloKey)] || (contractNumberStr && checksByContract[contractNumberStr]) || (realSaleIdStr && checksByContract[realSaleIdStr]);

                // Dados financeiros do cliente
                const clienteName = c.customerName || c.name || c.nome || '-';
                const titulo = tituloKey || '-';
                const parcelasVencidas = parseInt(c.billCount || c.overdueInstallments || c.parcelasVencidas || 0);
                const valorVencido = parseFloat((c.overdueValue || 0) + (c.overdueCharges || 0));

                let statusLabel = 'Pendente de Vistoria';
                let statusColor = 'color: #dc2626; font-weight: bold;';

                if (hasConstruction) {
                    statusLabel = 'Construção Identificada (Dispensado)';
                    statusColor = 'color: #16a34a; font-weight: 600;';
                } else if (vistoriaAtiva) {
                    if (vistoriaAtiva.status === 'aguardando_fotos') {
                        statusLabel = 'Link Enviado – Aguardando Fotos';
                        statusColor = 'color: #d97706; font-weight: 600;';
                    } else if (vistoriaAtiva.status === 'aguardando_validacao') {
                        statusLabel = 'Aguardando Validação';
                        statusColor = 'color: #7c3aed; font-weight: 600;';
                    }
                }

                let lastCheckDateStr = '-';
                let lastCheckDays = '-';
                const contractKeys = [String(contractId)];
                if (tituloKey) contractKeys.push(String(tituloKey));
                if (contractNumberStr) contractKeys.push(String(contractNumberStr));
                if (realSaleIdStr) contractKeys.push(String(realSaleIdStr));
                
                let maxDate = null;
                contractKeys.forEach(k => {
                    const d = latestCheckDateByContract[k];
                    if (d && d !== '1970-01-01') {
                        if (!maxDate || d > maxDate) maxDate = d;
                    }
                });

                if (maxDate) {
                    const parts = maxDate.split('T')[0].split('-');
                    if (parts.length === 3) lastCheckDateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    
                    const dt = new Date(maxDate.split('T')[0] + 'T12:00:00');
                    const now = new Date();
                    now.setHours(12, 0, 0, 0);
                    const diffTime = now.getTime() - dt.getTime();
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    lastCheckDays = diffDays >= 0 ? `${diffDays} dia(s)` : 'Hoje';
                }

                const daysSinceCheck = maxDate ? _vcDaysSince(maxDate) : null;
                if (daysSinceCheck !== null && daysSinceCheck < recurrenceDays && !vistoriaAtiva) return;

                rows.push({
                    customerId: c.customerId, contractId, cidade: city, costCenterId, companyId: c.companyId || '',
                    empreendimento, empLabel, unidade,
                    clienteName, titulo, parcelasVencidas, valorVencido, lastCheckDateStr, lastCheckDays,
                    statusLabel, statusColor, vistoriaAtiva, originalIdx: rows.length, hasConstruction, contractKeys
                });
            });

            rows.forEach((r, i) => r.originalIdx = i);
            this.allRows = rows;
            this.renderedRows = [];

            this.renderTable();

            loading.style.display = 'none';
            results.style.display = 'block';

        } catch (e) {
            console.error('[Vistoria] Erro ao carregar dados:', e);
            loading.innerHTML = '<span style="color:red">Erro ao carregar os dados: ' + e.message + '</span>';
        }
    },

    renderTable() {
        const tbody = document.getElementById('vc-tbody');
        if (!tbody || !this.allRows) return;

        let filtered = this.allRows.filter(r => {
            if (this.activeFilters.cidade !== 'Todos' && r.cidade !== this.activeFilters.cidade) return false;
            if (this.activeFilters.empreendimento !== 'Todos' && r.empreendimento !== this.activeFilters.empreendimento) return false;
            if (this.activeFilters.status !== 'Todos' && r.statusLabel !== this.activeFilters.status) return false;
            return true;
        });

        this.renderedRows = filtered;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="padding: 30px; text-align: center; color: #666;">Nenhum título encontrado com os filtros atuais.</td></tr>`;
            return;
        }

        // Grouping: Cidade -> Empreendimento (by empLabel for display, empreendimento for key)
        const grouped = {};
        filtered.forEach((r, idx) => {
            if (!grouped[r.cidade]) grouped[r.cidade] = {};
            if (!grouped[r.cidade][r.empreendimento]) grouped[r.cidade][r.empreendimento] = { label: r.empLabel, items: [] };
            grouped[r.cidade][r.empreendimento].items.push({ ...r, currentIdx: idx });
        });

        let html = '';
        const savedState = JSON.parse(localStorage.getItem('crm_obras_andamento') || '{}');

        Object.keys(grouped).sort().forEach(cidade => {
            const safeCidade = cidade.replace(/[^a-zA-Z0-9]/g, '_');

            // City Header Row
            html += `
                <tr style="background: linear-gradient(135deg, #2e6b3e 0%, #3d7a4a 100%);">
                    <td style="padding: 10px 12px; text-align: center; width: 40px;">
                        <input type="checkbox" class="vc-city-cb" data-city="${safeCidade}" onchange="window.VerificarConstrucaoApp.toggleCity(this, '${safeCidade}')" style="accent-color: #86efac;">
                    </td>
                    <td colspan="6" style="padding: 10px 12px; font-weight: 700; font-size: 0.85rem; color: #fff; letter-spacing: 0.08em; text-transform: uppercase;">
                        📍 ${cidade}
                    </td>
                </tr>
            `;

            Object.keys(grouped[cidade]).sort().forEach(emp => {
                const safeEmp = emp.replace(/[^a-zA-Z0-9]/g, '_');
                let isObraAndamento = false;
                if (savedState[emp]) {
                    if (typeof savedState[emp] === 'boolean') isObraAndamento = savedState[emp];
                    else isObraAndamento = savedState[emp].isOn;
                }
                const empData = grouped[cidade][emp];
                const empLabelDisplay = empData.label || emp;

                // Empreendimento Header Row
                html += `
                    <tr style="background: #eaf4ee; border-bottom: 1px solid #a7d4b4;">
                        <td style="padding: 9px 12px; text-align: center; width: 40px;">
                            <input type="checkbox" class="vc-emp-cb city-${safeCidade}" data-city="${safeCidade}" data-emp="${safeEmp}" onchange="window.VerificarConstrucaoApp.toggleEmp(this, '${safeCidade}', '${safeEmp}')" ${isObraAndamento ? 'disabled' : ''} style="accent-color: #3d7a4a;">
                        </td>
                        <td colspan="6" style="padding: 9px 12px; font-weight: 700; color: #2e6b3e; font-size: 0.83rem;">
                            🏗️ ${empLabelDisplay}
                            ${isObraAndamento ? '<span style="background:#fef08a; color:#854d0e; padding:2px 8px; border-radius:4px; font-size:0.72rem; margin-left:10px; font-weight:600;">⚠ Obra em Andamento</span>' : ''}
                        </td>
                    </tr>
                `;

                if (isObraAndamento) {
                    html += `
                        <tr style="border-bottom: 1px solid #f1f5f9; background: #fffbeb;">
                            <td colspan="7" style="padding: 12px 20px; text-align: center; color: #92400e; font-style: italic; font-size: 0.82rem;">
                                Vistoria dispensada — obras do empreendimento em andamento.
                            </td>
                        </tr>
                    `;
                } else {
                    const unidades = empData.items.sort((a, b) => a.unidade.localeCompare(b.unidade));
                    unidades.forEach((u, uIdx) => {
                        const rowBg = uIdx % 2 === 0 ? '#fff' : '#f9fafb';
                        const validAction = u.statusLabel === 'Aguardando Validação'
                            ? `<button onclick="window.VerificarConstrucaoApp.validarVistoria(${u.currentIdx})" style="padding:5px 12px; font-size:0.78rem; border:none; background:linear-gradient(135deg, #2e6b3e 0%, #3d7a4a 100%); color:#fff; border-radius:6px; cursor:pointer; font-weight:600; box-shadow:0 2px 6px rgba(45,107,62,0.35);">Validar Vistoria</button>`
                            : `<span style="${u.statusColor}">${u.statusLabel}</span>`;

                        const valorFmt = u.valorVencido > 0
                            ? u.valorVencido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : '-';
                        const parcelasDisplay = u.parcelasVencidas > 0
                            ? `<span style="background:#fef2f2; color:#dc2626; padding:2px 8px; border-radius:12px; font-weight:700; font-size:0.78rem;">${u.parcelasVencidas}</span>`
                            : '<span style="color:#94a3b8;">-</span>';

                        html += `
                            <tr style="border-bottom: 1px solid #f1f5f9; background:${rowBg}; transition: background 0.15s;" onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='${rowBg}'">
                                <td style="padding: 10px 12px; text-align: center; width: 40px;">
                                    <input type="checkbox" class="vc-row-checkbox city-${safeCidade} emp-${safeEmp}" value="${u.currentIdx}" onchange="window.VerificarConstrucaoApp.updateBtn()" ${u.hasConstruction ? 'disabled' : ''} style="accent-color: #16a34a;">
                                </td>
                                <td style="padding: 10px 12px; font-weight: 700; color: #1e293b; font-size: 0.88rem;">${u.unidade}</td>
                                <td style="padding: 10px 12px; color: #334155; font-size: 0.83rem; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${u.clienteName}</td>
                                <td style="padding: 10px 12px; color: #475569; font-size: 0.82rem;">${u.titulo}</td>
                                <td style="padding: 10px 12px; text-align: center;">${parcelasDisplay}</td>
                                <td style="padding: 10px 12px; text-align: right; font-weight: 600; color: #475569; font-size: 0.83rem;">
                                    ${u.lastCheckDateStr !== '-' ? `<span style="font-size: 0.75rem;">${u.lastCheckDateStr}</span><br><span style="color: #ea580c; font-size: 0.7rem;">Há ${u.lastCheckDays}</span>` : '<span style="color: #94a3b8; font-weight: 400;">Nunca</span>'}
                                </td>
                                <td style="padding: 10px 12px;">${validAction}</td>
                            </tr>
                        `;
                    });
                }
            });
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
        this.updateBtn();
    },

    toggleAll(cb) {
        document.querySelectorAll('.vc-row-checkbox, .vc-city-cb, .vc-emp-cb').forEach(c => c.checked = cb.checked);
        this.updateBtn();
    },

    toggleCity(cb, safeCidade) {
        document.querySelectorAll(`.city-${safeCidade}`).forEach(c => c.checked = cb.checked);
        this.updateBtn();
    },

    toggleEmp(cb, safeCidade, safeEmp) {
        document.querySelectorAll(`.emp-${safeEmp}`).forEach(c => c.checked = cb.checked);
        this.updateBtn();
    },

    updateBtn() {
        const cbs = document.querySelectorAll('.vc-row-checkbox:checked');
        const btn = document.getElementById('btn-solicitar-wpp');
        if (btn) {
            btn.disabled = cbs.length === 0;
            btn.style.opacity = btn.disabled ? '0.5' : '1';
        }
    },

    abrirModalObrasAndamento() {
        this._ensureModals();
        const modal = document.getElementById('modal-obras-andamento');
        const listDiv = document.getElementById('obras-andamento-list');
        if (!modal || !listDiv) return;

        const allClientsForObras = window.rawClientList || (window.AppState && window.AppState.sales) || [];
        if (!allClientsForObras || allClientsForObras.length === 0) {
            listDiv.innerHTML = '<p style="color:#64748b; padding: 10px 0;">Nenhum centro de custo encontrado.</p>';
            modal.style.display = 'flex';
            return;
        }

        const empList = [];
        const seenEmp = new Set();
        
        allClientsForObras.forEach(c => {
            const costCenterId = c.costCenterId;
            if (costCenterId && costCenterId !== 'N/D') {
                const ccName = _vcGetCostCenterName(costCenterId);
                let empreendimento = '-';
                if (ccName && ccName !== '-') {
                    empreendimento = ccName.includes('-') ? ccName.split('-').slice(1).join('-').trim() : ccName.trim();
                }
                const empLabel = _vcGetEmpLabel(costCenterId);
                
                if (empreendimento && empreendimento !== '-' && !seenEmp.has(empreendimento)) {
                    seenEmp.add(empreendimento);
                    empList.push({
                        empreendimento: empreendimento,
                        label: empLabel,
                        id: parseInt(costCenterId) || 0
                    });
                }
            }
        });
        
        empList.sort((a,b) => a.label.localeCompare(b.label));

        const savedState = JSON.parse(localStorage.getItem('crm_obras_andamento') || '{}');
        const isFirstRun = !localStorage.getItem('crm_obras_andamento_init');
        
        // Converter estado antigo
        Object.keys(savedState).forEach(k => {
            if (typeof savedState[k] === 'boolean') {
                savedState[k] = { isOn: savedState[k], previsao: '' };
            }
        });

        // Auto-enable new
        empList.forEach(e => {
            if (!isFirstRun && !savedState[e.empreendimento]) {
                // Novo empreendimento!
                savedState[e.empreendimento] = { isOn: true, previsao: '', isNew: true };
            } else if (!savedState[e.empreendimento]) {
                savedState[e.empreendimento] = { isOn: false, previsao: '' };
            }
        });

        if (isFirstRun) localStorage.setItem('crm_obras_andamento_init', 'true');

        // Guardar estado temporário para o botão Salvar
        this._tempObrasState = JSON.parse(JSON.stringify(savedState));

        let html = '';
        if (empList.length === 0) {
            html = '<p style="color: #64748b;">Nenhum empreendimento listado no momento.</p>';
        } else {
            empList.sort((a, b) => a.id - b.id).forEach(({ empreendimento: emp, label }) => {
                const state = this._tempObrasState[emp] || { isOn: false, previsao: '' };
                const isOn = state.isOn;
                const previsao = state.previsao || '';
                const toggleId = `oa-toggle-${emp.replace(/[^a-zA-Z0-9]/g, '_')}`;
                
                const badgeNew = state.isNew ? '<span style="background:#ef4444; color:white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight:bold; margin-left: 8px;">NOVO</span>' : '';
                
                html += `
                    <div style="display: flex; flex-direction: column; padding: 14px 0; border-bottom: 1px solid #e2e8f0; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                            <div>
                                <div style="font-weight: 600; color: #1e293b; font-size: 0.9rem;">${label} ${badgeNew}</div>
                            </div>
                            <label id="${toggleId}-label" style="position: relative; display: inline-block; width: 48px; height: 26px; flex-shrink: 0; cursor: pointer;">
                                <input type="checkbox" id="${toggleId}" style="opacity: 0; width: 0; height: 0;" ${isOn ? 'checked' : ''} data-emp="${emp.replace(/"/g, '&quot;')}" onchange="window.VerificarConstrucaoApp._onToggleObraChange(this)">
                                <span id="${toggleId}-track" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isOn ? '#16a34a' : '#cbd5e1'}; border-radius: 26px; transition: .3s;">
                                    <span style="position: absolute; height: 20px; width: 20px; left: ${isOn ? '24px' : '3px'}; bottom: 3px; background-color: white; border-radius: 50%; transition: .3s; box-shadow: 0 1px 4px rgba(0,0,0,0.2);" id="${toggleId}-thumb"></span>
                                </span>
                            </label>
                        </div>
                        <div id="${toggleId}-date-container" style="display: ${isOn ? 'flex' : 'none'}; align-items: center; gap: 8px; margin-top: 4px;">
                            <span style="font-size: 0.8rem; color: #64748b;">Previsão de término:</span>
                            <input type="date" value="${previsao}" id="${toggleId}-date" onchange="window.VerificarConstrucaoApp._onPrevisaoChange('${emp.replace(/"/g, '\\"')}', this.value)" style="padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem; color: #334155; outline: none;">
                        </div>
                    </div>
                `;
            });
        }

        listDiv.innerHTML = html;
        modal.style.display = 'flex';
    },

    _onToggleObraChange(input) {
        const emp = input.dataset.emp;
        const checked = input.checked;
        const id = input.id;
        const track = document.getElementById(id + '-track');
        const thumb = document.getElementById(id + '-thumb');
        const dateContainer = document.getElementById(id + '-date-container');
        if (track) track.style.backgroundColor = checked ? '#16a34a' : '#cbd5e1';
        if (thumb) thumb.style.left = checked ? '24px' : '3px';
        if (dateContainer) dateContainer.style.display = checked ? 'flex' : 'none';
        
        if (!this._tempObrasState) this._tempObrasState = {};
        if (!this._tempObrasState[emp]) this._tempObrasState[emp] = { isOn: false, previsao: '' };
        this._tempObrasState[emp].isOn = checked;
        this._tempObrasState[emp].isNew = false; // remove the NEW badge state once interacted
    },

    _onPrevisaoChange(emp, val) {
        if (!this._tempObrasState) this._tempObrasState = {};
        if (!this._tempObrasState[emp]) this._tempObrasState[emp] = { isOn: false, previsao: '' };
        this._tempObrasState[emp].previsao = val;
    },

    salvarObrasAndamento() {
        if (this._tempObrasState) {
            // Limpa flag de isNew ao salvar para todos
            Object.keys(this._tempObrasState).forEach(k => {
                if (this._tempObrasState[k]) this._tempObrasState[k].isNew = false;
            });
            localStorage.setItem('crm_obras_andamento', JSON.stringify(this._tempObrasState));
        }
        document.getElementById('modal-obras-andamento').style.display = 'none';
        this.renderTable();
    },

    // Mantido para compatibilidade mas não é mais chamado diretamente
    toggleObraEmAndamento(emp, checked) {
        if (!this._tempObrasState) this._tempObrasState = {};
        if (!this._tempObrasState[emp]) this._tempObrasState[emp] = { isOn: false, previsao: '' };
        this._tempObrasState[emp].isOn = checked;
    },

    editarRegua() {
        if (typeof switchRegrasTab === 'function') {
            window.switchTab('config');
            setTimeout(() => {
                switchRegrasTab('regra-regua');
            }, 150);
        } else {
            alert('Acesso direto à régua não disponível.');
        }
    },

    async _fetchLoteCoords(costCenterId) {
        try {
            const res = await fetch(`/api/kmz-coords/${costCenterId}`);
            if (!res.ok) return null;
            const list = await res.json();
            if (!list || list.length === 0) return null;
            const item = list[0];
            let coordsArr = typeof item.coordinates === 'string' ? JSON.parse(item.coordinates) : item.coordinates;
            if (Array.isArray(coordsArr) && coordsArr.length > 0) {
                if (Array.isArray(coordsArr[0])) {
                    return { lng: coordsArr[0][0], lat: coordsArr[0][1] };
                } else {
                    return { lng: coordsArr[0], lat: coordsArr[1] };
                }
            }
        } catch (e) {
            console.warn('[Vistoria] Não foi possível buscar coords KMZ:', e.message);
        }
        return null;
    },

    async solicitarWhatsApp() {
        if (!this.renderedRows) return;

        const cbs = document.querySelectorAll('.vc-row-checkbox:checked');
        const selected = Array.from(cbs).map(c => this.renderedRows[parseInt(c.value)]);
        if (selected.length === 0) return;

        const btnWpp = document.getElementById('btn-solicitar-wpp');
        btnWpp.disabled = true;
        btnWpp.innerHTML = 'Gerando Links...';

        const normalizePhone = (phone) => {
            if (!phone) return '';
            const digits = String(phone).replace(/\D/g, '');
            if (!digits) return '';
            if (digits.length === 11 && digits.startsWith('55')) return digits;
            if (digits.length === 11) return `55${digits}`;
            if (digits.length === 10) return `55${digits}`;
            return digits;
        };

        const getResponsibleUsersByCity = (city) => {
            const usersStr = localStorage.getItem('crm_users');
            if (!usersStr) return [];
            try {
                const users = JSON.parse(usersStr);
                return users.filter(u => {
                    const active = !u.status || String(u.status).toUpperCase() !== 'INATIVO';
                    const isConstruction = !!u.check_construction;
                    const cities = Array.isArray(u.const_cities) ? u.const_cities : [];
                    const matchesCity = !!city && cities.map(String).map(v => v.toUpperCase().trim()).includes(String(city).toUpperCase().trim());
                    return active && isConstruction && matchesCity && normalizePhone(u.phone);
                });
            } catch (e) {
                console.warn('[Vistoria] Não foi possível ler crm_users para atribuição por cidade.', e);
                return [];
            }
        };

        try {
            const { collection, addDoc, doc, updateDoc, serverTimestamp } = window.firebaseCollections;
            const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

            const cityGroups = {};
            const targetGroups = {};
            const generatedIds = [];

            for (const r of selected) {
                let vId = r.vistoriaAtiva ? r.vistoriaAtiva.id : null;
                const loteCoords = await this._fetchLoteCoords(r.costCenterId);
                
                const contractKeys = [String(r.contractId)];
                if (r.tituloKey) contractKeys.push(String(r.tituloKey));
                if (r.contractNumberStr) contractKeys.push(String(r.contractNumberStr));
                if (r.realSaleIdStr) contractKeys.push(String(r.realSaleIdStr));

                if (!vId) {
                    const docRef = await addDoc(collection(window.firebaseDb, 'vistorias'), {
                        customerId: r.customerId,
                        contractId: r.contractId,
                        contractKeys: contractKeys,
                        tituloKey: r.tituloKey || '',
                        cidade: r.cidade,
                        empreendimento: r.empreendimento,
                        costCenterId: r.costCenterId,
                        unidade: r.unidade,
                        status: 'aguardando_fotos',
                        loteCoords: loteCoords || null,
                        createdAt: serverTimestamp()
                    });
                    vId = docRef.id;
                } else if (loteCoords) {
                    await updateDoc(doc(window.firebaseDb, 'vistorias', vId), { loteCoords });
                }

                generatedIds.push(vId);

                if (!cityGroups[r.cidade]) cityGroups[r.cidade] = {};
                if (!cityGroups[r.cidade][r.empreendimento]) cityGroups[r.cidade][r.empreendimento] = 0;
                cityGroups[r.cidade][r.empreendimento]++;

                const responsibleUsers = getResponsibleUsersByCity(r.cidade);
                if (responsibleUsers.length === 0) {
                    const fallbackKey = `sem-responsavel|5515998118246`;
                    if (!targetGroups[fallbackKey]) {
                        targetGroups[fallbackKey] = { city: r.cidade, phone: '5515998118246', name: 'Responsável não configurado', rows: [] };
                    }
                    targetGroups[fallbackKey].rows.push(r);
                    continue;
                }

                responsibleUsers.forEach(user => {
                    const phone = normalizePhone(user.phone);
                    const key = `${r.cidade}|${phone}`;
                    if (!targetGroups[key]) {
                        targetGroups[key] = { city: r.cidade, phone, name: user.name, rows: [] };
                    }
                    targetGroups[key].rows.push(r);
                });
            }

            if (Object.keys(targetGroups).length === 0) {
                throw new Error('Nenhum responsável por checar vistoria foi encontrado para as cidades selecionadas.');
            }

            const hour = new Date().getHours();
            let greeting = 'Bom dia';
            if (hour >= 12 && hour < 18) greeting = 'Boa tarde';
            else if (hour >= 18) greeting = 'Boa noite';

            const idsParam = generatedIds.join(',');
            const link = `${baseUrl}vistoria.html?ids=${idsParam}`;

            Object.values(targetGroups).forEach(target => {
                let message = `${greeting}!\n\nSegue a lista de vistorias a serem realizadas na cidade *${String(target.city).toUpperCase()}*\n\n`;
                const empMap = {};
                target.rows.forEach(r => {
                    const key = r.empreendimento || 'Empreendimento N/D';
                    empMap[key] = (empMap[key] || 0) + 1;
                });
                Object.entries(empMap).forEach(([emp, count]) => {
                    message += `- ${String(emp).toUpperCase()} (${count} lote${count > 1 ? 's' : ''})\n`;
                });
                message += `\nAcesse o link abaixo para realizar a(s) vistoria(s):\n${link}`;
                window.open(`https://api.whatsapp.com/send?phone=${target.phone}&text=${encodeURIComponent(message)}`, '_blank');
            });

            await this.loadData();

        } catch (err) {
            console.error('[Vistoria] Erro ao gerar vistorias:', err);
            alert('Erro ao gerar os links: ' + err.message);
        } finally {
            const b = document.getElementById('btn-solicitar-wpp');
            if (b) {
                b.innerHTML = '<i data-lucide="message-circle" style="width: 16px;"></i> Solicitar Vistoria (WhatsApp)';
                b.disabled = false;
                if (window.lucide) lucide.createIcons();
            }
        }
    },

    async validarVistoria(idx) {
        const row = this.renderedRows[idx];
        if (!row || !row.vistoriaAtiva) return;

        this._currentValidatingRowIdx = idx;

        const v = row.vistoriaAtiva;
        const r = v.respostasFormulario || {};

        const formatSimNao = (val) => {
            if (!val) return '<span style="color:#94a3b8;">-</span>';
            return val.toLowerCase() === 'sim'
                ? '<span style="color:#16a34a; font-weight:600;">✓ Sim</span>'
                : '<span style="color:#dc2626; font-weight:600;">✗ Não</span>';
        };

        const formatEstagio = (val) => {
            if (!val) return '<span style="color:#94a3b8;">-</span>';
            return `<span style="background:#f0fdf4; color:#15803d; padding:2px 10px; border-radius:12px; font-weight:600; font-size:0.82rem;">${val.replace(/_/g, ' ').toUpperCase()}</span>`;
        };

        let html = `
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <div style="background: #f8fafc; padding: 22px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                    <h3 style="margin:0 0 16px; color:#0f172a; font-size:1.05rem; display:flex; align-items:center; gap:8px; font-weight: 600;">
                        📋 Respostas do Questionário
                    </h3>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; font-size: 0.88rem;">
                        <div style="background:#fff; padding:14px 16px; border-radius:10px; border:1px solid #cbd5e1; display:flex; flex-direction:column; gap:6px; box-shadow: 0 2px 4px rgba(0,0,0,0.03); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                            <strong style="color:#475569; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; display:flex; align-items:center; gap:6px;"><i data-lucide="droplet" style="width:14px; height:14px; color: #3b82f6;"></i> Água</strong>
                            <div style="font-size: 1.05rem;">${formatSimNao(r.possuiAgua)}</div>
                        </div>
                        <div style="background:#fff; padding:14px 16px; border-radius:10px; border:1px solid #cbd5e1; display:flex; flex-direction:column; gap:6px; box-shadow: 0 2px 4px rgba(0,0,0,0.03); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                            <strong style="color:#475569; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; display:flex; align-items:center; gap:6px;"><i data-lucide="zap" style="width:14px; height:14px; color: #eab308;"></i> Energia</strong>
                            <div style="font-size: 1.05rem;">${formatSimNao(r.possuiEnergia)}</div>
                        </div>
                        <div style="background:#fff; padding:14px 16px; border-radius:10px; border:1px solid #cbd5e1; display:flex; flex-direction:column; gap:6px; box-shadow: 0 2px 4px rgba(0,0,0,0.03); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                            <strong style="color:#475569; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; display:flex; align-items:center; gap:6px;"><i data-lucide="trash-2" style="width:14px; height:14px; color: #f97316;"></i> Entulho</strong>
                            <div style="font-size: 1.05rem;">${formatSimNao(r.possuiEntulho)}</div>
                        </div>
                        <div style="background:#fff; padding:14px 16px; border-radius:10px; border:1px solid #cbd5e1; display:flex; flex-direction:column; gap:6px; box-shadow: 0 2px 4px rgba(0,0,0,0.03); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                            <strong style="color:#475569; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; display:flex; align-items:center; gap:6px;"><i data-lucide="door-open" style="width:14px; height:14px; color: #8b5cf6;"></i> Acesso</strong>
                            <div style="font-size: 1.05rem;">${formatSimNao(r.permiteAcesso)}</div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 14px; display: grid; grid-template-columns: 1fr; gap: 14px;">
                        <div style="background:#fff; padding:16px 20px; border-radius:10px; border:1px solid #cbd5e1; display:flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
                            <strong style="color:#475569; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; display:flex; align-items:center; gap:8px;"><i data-lucide="hammer" style="width:16px; height:16px; color: #10b981;"></i> Estágio da Obra</strong>
                            <div style="font-size: 1.15rem;">${formatEstagio(r.estagioObra)}</div>
                        </div>
                        ${r.observacoes ? `<div style="background:#fff; padding:16px 20px; border-radius:10px; border:1px solid #cbd5e1; display:flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.03);"><strong style="color:#475569; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; display:flex; align-items:center; gap:8px;"><i data-lucide="align-left" style="width:16px; height:16px; color: #64748b;"></i> Observações</strong><span style="color:#334155; line-height: 1.6; font-size: 0.95rem; background: #f8fafc; padding: 12px; border-radius: 8px;">${r.observacoes}</span></div>` : ''}
                    </div>
                </div>

                <div>
                    <h3 style="margin:0 0 16px; color:#0f172a; font-size:1.05rem; display:flex; align-items:center; gap:8px; font-weight: 600;">
                        📸 Fotos Recebidas
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px;">
                        ${v.fotoFrente ? `
                            <div style="position:relative; border-radius:12px; overflow:hidden; border:1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 10px 15px -3px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 6px -1px rgba(0,0,0,0.1)'">
                                <a href="${v.fotoFrente}" target="_blank" style="display:block; height: 240px;">
                                    <img src="${v.fotoFrente}" style="width: 100%; height: 100%; object-fit: cover; display:block; transition: filter 0.3s;" onmouseover="this.style.filter='brightness(0.85)'" onmouseout="this.style.filter='brightness(1)'">
                                </a>
                                <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent, rgba(0,0,0,0.85)); padding:16px 12px 12px; color:#fff; font-size:0.9rem; font-weight:600; text-align:center; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">Frente</div>
                            </div>
                        ` : `
                            <div style="height:240px; background:#f8fafc; border-radius:12px; border:2px dashed #94a3b8; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:12px; color:#64748b; font-size:0.95rem; font-weight: 500;">
                                <i data-lucide="image-off" style="width:40px; height:40px; opacity: 0.4;"></i>
                                Sem foto (Frente)
                            </div>
                        `}
                        ${v.fotoMeioFundo ? `
                            <div style="position:relative; border-radius:12px; overflow:hidden; border:1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 10px 15px -3px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 6px -1px rgba(0,0,0,0.1)'">
                                <a href="${v.fotoMeioFundo}" target="_blank" style="display:block; height: 240px;">
                                    <img src="${v.fotoMeioFundo}" style="width: 100%; height: 100%; object-fit: cover; display:block; transition: filter 0.3s;" onmouseover="this.style.filter='brightness(0.85)'" onmouseout="this.style.filter='brightness(1)'">
                                </a>
                                <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent, rgba(0,0,0,0.85)); padding:16px 12px 12px; color:#fff; font-size:0.9rem; font-weight:600; text-align:center; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">Meio / Fundo</div>
                            </div>
                        ` : `
                            <div style="height:240px; background:#f8fafc; border-radius:12px; border:2px dashed #94a3b8; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:12px; color:#64748b; font-size:0.95rem; font-weight: 500;">
                                <i data-lucide="image-off" style="width:40px; height:40px; opacity: 0.4;"></i>
                                Sem foto (Meio Fundo)
                            </div>
                        `}
                        ${v.fotoFundoFrente ? `
                            <div style="position:relative; border-radius:12px; overflow:hidden; border:1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 10px 15px -3px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 6px -1px rgba(0,0,0,0.1)'">
                                <a href="${v.fotoFundoFrente}" target="_blank" style="display:block; height: 240px;">
                                    <img src="${v.fotoFundoFrente}" style="width: 100%; height: 100%; object-fit: cover; display:block; transition: filter 0.3s;" onmouseover="this.style.filter='brightness(0.85)'" onmouseout="this.style.filter='brightness(1)'">
                                </a>
                                <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent, rgba(0,0,0,0.85)); padding:16px 12px 12px; color:#fff; font-size:0.9rem; font-weight:600; text-align:center; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">Fundo / Frente</div>
                            </div>
                        ` : `
                            <div style="height:240px; background:#f8fafc; border-radius:12px; border:2px dashed #94a3b8; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:12px; color:#64748b; font-size:0.95rem; font-weight: 500;">
                                <i data-lucide="image-off" style="width:40px; height:40px; opacity: 0.4;"></i>
                                Sem foto (Fundo Frente)
                            </div>
                        `}
                    </div>
                    <p style="font-size: 0.8rem; color: #64748b; margin-top: 12px; display:flex; align-items:center; gap:6px;">
                        <i data-lucide="external-link" style="width:14px; height:14px;"></i> Clique na foto para ampliar em nova guia.
                    </p>
                </div>
            </div>
        `;

        document.getElementById('validar-vistoria-body').innerHTML = html;
        if (window.lucide) lucide.createIcons();
        document.getElementById('modal-validar-vistoria').style.display = 'flex';
    },

    rejeitarVistoriaModal() {
        document.getElementById('modal-validar-vistoria').style.display = 'none';
        this._currentValidatingRowIdx = null;
    },

    async aprovarVistoriaModal() {
        if (this._currentValidatingRowIdx === null || this._currentValidatingRowIdx === undefined) return;
        const idx = this._currentValidatingRowIdx;
        const row = this.renderedRows[idx];
        if (!row || !row.vistoriaAtiva) return;

        document.getElementById('modal-validar-vistoria').style.display = 'none';
        this._currentValidatingRowIdx = null;

        const loadingDiv = document.createElement('div');
        loadingDiv.innerHTML = `
            <div style="position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,30,23,0.85); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <div style="border: 4px solid rgba(255,255,255,0.2); border-top: 4px solid #22c55e; border-radius: 50%; width: 48px; height: 48px; animation: spin 0.8s linear infinite;"></div>
                <h3 style="margin-top:20px; color:#fff; font-size:1rem;" id="vc-validar-status">Preparando validação...</h3>
            </div>
        `;
        document.body.appendChild(loadingDiv);

        try {
            const v = row.vistoriaAtiva;
            const { ref, listAll, getDownloadURL } = window.firebaseCollections;
            const storageRef = ref(window.firebaseStorage, `vistorias/${v.id}`);

            document.getElementById('vc-validar-status').textContent = 'Buscando fotos no Firebase...';
            const listRes = await listAll(storageRef);
            if (listRes.items.length === 0) {
                throw new Error("Nenhuma foto encontrada para esta vistoria.");
            }

            // Buscar o unitId pelo costCenterId + nome da unidade (igual ao fluxo de anexos.js)
            document.getElementById('vc-validar-status').textContent = 'Localizando unidade no Sienge...';
            const authHeader = typeof getBasicAuthHeader === 'function' ? getBasicAuthHeader() : '';

            let siengeUnitId = null;
            let offset = 0;
            const limit = 200;
            let found = false;

            const unitNameNorm = (row.unidade || '').trim().toUpperCase();

            while (!found) {
                const uRes = await fetch(
                    `/api/sienge-proxy/units?limit=${limit}&offset=${offset}&enterpriseId=${row.costCenterId}&additionalData=NONE`,
                    { headers: { 'Authorization': authHeader } }
                );
                if (!uRes.ok) throw new Error(`Falha ao buscar unidades no Sienge: HTTP ${uRes.status}`);
                const uData = await uRes.json();
                const uResults = uData.results || [];

                const match = uResults.find(u =>
                    (u.name || '').trim().toUpperCase() === unitNameNorm ||
                    (u.name || '').trim().replace(/[\s-]+/g, '').toUpperCase() === unitNameNorm.replace(/[\s-]+/g, '')
                );

                if (match) {
                    siengeUnitId = match.id;
                    found = true;
                } else if (uResults.length < limit) {
                    break; // Sem mais páginas
                } else {
                    offset += limit;
                }
            }

            if (!siengeUnitId) {
                throw new Error(`Unidade "${row.unidade}" não encontrada no empreendimento ${row.costCenterId} no Sienge.`);
            }

            document.getElementById('vc-validar-status').textContent = 'Enviando fotos para o Sienge...';

            const dateObj = new Date();
            const dateStrFileName = dateObj.toLocaleDateString('pt-BR').replace(/\//g, '-');
            const dateStrDesc = dateObj.toLocaleDateString('pt-BR').split('/').reverse().join('.');

            for (let i = 0; i < listRes.items.length; i++) {
                const itemRef = listRes.items[i];
                const url = await getDownloadURL(itemRef);

                const imgRes = await fetch(url);
                const blob = await imgRes.blob();

                const unitFormatted = (row.unidade || '').replace(/-/g, ' ');
                const projId = row.costCenterId || '';
                const baseName = `${projId} ${unitFormatted} - FOTO VISTORIA ${i + 1} - ${dateStrFileName}`.toUpperCase();
                const nomeFinal = `${baseName}.jpg`;
                const descricaoSienge = `${dateStrDesc} - FOTO DE VISTORIA ${i + 1}`;

                const isVercel = window.location.hostname.includes('vercel.app');
                let apiUrl = '';
                if (isVercel) {
                    apiUrl = `/api/sienge-proxy/units/${siengeUnitId}/attachments?description=${encodeURIComponent(descricaoSienge)}`;
                } else {
                    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
                    const host = (window.location.hostname === "" || window.location.hostname === "127.0.0.1") ? "localhost" : window.location.hostname;
                    apiUrl = `http://${host}:${port}/sienge-proxy/units/${siengeUnitId}/attachments?description=${encodeURIComponent(descricaoSienge)}`;
                }

                await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', apiUrl);
                    if (authHeader) xhr.setRequestHeader('Authorization', authHeader);
                    xhr.setRequestHeader('Accept', 'application/json');

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
                        else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
                    };
                    xhr.onerror = () => reject(new Error('Erro de rede'));

                    const formData = new FormData();
                    formData.append('file', blob, nomeFinal);
                    xhr.send(formData);
                });

                document.getElementById('vc-validar-status').textContent = `Enviando foto ${i + 1} de ${listRes.items.length}...`;
            }

            document.getElementById('vc-validar-status').textContent = 'Finalizando Vistoria...';
            const { doc, updateDoc, collection, addDoc } = window.firebaseCollections;
            await updateDoc(doc(window.firebaseDb, 'vistorias', v.id), { status: 'concluida' });

            const resps = v.respostasFormulario || {};
            const labels = {
                possuiEnergia: "Possui Energia",
                possuiAgua: "Possui Água",
                estagioObra: "Estágio da Obra",
                permiteAcesso: "Permite Acesso",
                possuiEntulho: "Possui Entulho"
            };
            
            let detailsText = "Respostas do Cliente:\n";
            for (const [k, val] of Object.entries(resps)) {
                if (k === 'observacoes') continue;
                const label = labels[k] || k;
                detailsText += `- ${label}: ${val}\n`;
            }

            const newCheck = {
                customerId: String(row.customerId || ''),
                contractId: String(row.contractId || ''),
                contractKeys: row.contractKeys || [],
                companyId: String(row.companyId || ''),
                date: new Date().toISOString().split('T')[0],
                responsible: "(15) 99811-8246",
                stage: resps.estagioObra || "Vistoria Validada",
                observations: resps.observacoes || "-",
                detailsText: detailsText,
                fileUrl: await getDownloadURL(listRes.items[0]),
                fileName: "Foto Vistoria 1.jpg",
                createdAt: new Date().toISOString()
            };
            await addDoc(collection(window.firebaseDb, "construction_checks"), newCheck);

            alert(`✅ Vistoria validada com sucesso!\n${listRes.items.length} foto(s) anexada(s) na unidade ${row.unidade} (ID Sienge: ${siengeUnitId}).`);
            await this.loadData();

        } catch (e) {
            console.error("Erro na validação:", e);
            alert("Erro ao validar vistoria: " + e.message);
        } finally {
            document.body.removeChild(loadingDiv);
        }
    }
};

// Ativa o módulo quando a aba "Vistoria" é aberta
document.addEventListener('tabChanged', (e) => {
    if (e.detail === 'vistoria') {
        window.VerificarConstrucaoApp.init();
    }
});
