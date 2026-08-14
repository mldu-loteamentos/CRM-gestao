// Lógica para o relatório "Verificar Construção / Vistoria"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _vcGetThreshold() {
    let thresholdDays = 91; // padrão caso o ponto não exista na régua
    if (window.TimelineState && Array.isArray(window.TimelineState)) {
        const node = window.TimelineState.find(n =>
            n.acao === 'verificar_construcao' || n.acao === 'vistoria' || (n.label || n.nome || '').toLowerCase().includes('verificar constru')
        );
        if (node && node.dias !== undefined) {
            const parsed = parseInt(node.dias);
            if (!isNaN(parsed) && parsed > 0) thresholdDays = parsed;
        }
    }
    return thresholdDays;
}

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

// ─── App ────────────────────────────────────────────────────────────────────

window.VerificarConstrucaoApp = {
    renderedRows: null,
    allRows: null,
    activeFilters: {
        cidade: 'Todos',
        empreendimento: 'Todos',
        status: 'Todos'
    },

    init() {
        this.render();
        this.loadData();
    },

    render() {
        const root = document.getElementById('verificar-construcao-root');
        if (!root) return;

        const thresholdDays = _vcGetThreshold();

        root.innerHTML = `
            <div class="crm-card" style="padding: 20px;">
                <h3 style="font-size: 1.2rem; color: var(--color-primary); margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="camera" style="width: 24px;"></i> Verificar Construção (Atraso >= ${thresholdDays} dias)
                </h3>

                <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap;">
                    <div>
                        <button class="btn btn-outline" style="border-color: #94a3b8; color: #475569;" onclick="window.VerificarConstrucaoApp.abrirModalObrasAndamento()">
                            <i data-lucide="building" style="width: 16px;"></i> Obras em andamento
                        </button>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-outline" style="border-color: #94a3b8; color: #475569;" onclick="window.VerificarConstrucaoApp.editarRegua()">
                            <i data-lucide="settings" style="width: 16px;"></i> Editar Régua
                        </button>
                        <button class="btn btn-success" onclick="window.VerificarConstrucaoApp.solicitarWhatsApp()" id="btn-solicitar-wpp" disabled>
                            <i data-lucide="message-circle" style="width: 16px;"></i> Solicitar Vistoria (WhatsApp)
                        </button>
                    </div>
                </div>

                <div id="vc-loading" style="display: none; text-align: center; padding: 20px; color: #666;">
                    Analisando fila de clientes...
                </div>

                <div id="vc-results" style="display: none;">
                    <div style="max-height: 500px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;" id="vc-table">
                            <thead style="position: sticky; top: 0; background: #f1f5f9; z-index: 10;">
                                <tr>
                                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; width: 40px; text-align: center;">
                                        <input type="checkbox" onchange="window.VerificarConstrucaoApp.toggleAll(this)">
                                    </th>
                                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">CIDADE</th>
                                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">EMPREENDIMENTO</th>
                                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">TÍTULO / UNIDADE</th>
                                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">STATUS</th>
                                </tr>
                            </thead>
                            <tbody id="vc-tbody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Modal Validar Vistoria -->
            <div id="modal-validar-vistoria" class="modal-overlay" style="display:none; align-items:flex-start; padding-top:50px; z-index: 9999;">
                <div class="modal-content" style="width: 800px; max-width: 95%;">
                    <div class="modal-header">
                        <h2>Validar Vistoria</h2>
                        <button class="modal-close" onclick="document.getElementById('modal-validar-vistoria').style.display='none'"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body" id="validar-vistoria-body" style="min-height: 200px;">
                        Carregando...
                    </div>
                    <div class="modal-footer" style="padding: 15px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px;">
                        <button class="btn btn-outline" style="border-color: var(--color-danger); color: var(--color-danger);" onclick="window.VerificarConstrucaoApp.rejeitarVistoriaModal()">
                            <i data-lucide="x-circle" style="width: 16px;"></i> Rejeitar
                        </button>
                        <button class="btn btn-success" onclick="window.VerificarConstrucaoApp.aprovarVistoriaModal()">
                            <i data-lucide="check-circle" style="width: 16px;"></i> Aprovar
                        </button>
                    </div>
                </div>
            </div>

            <!-- Modal Obras em Andamento -->
            <div id="modal-obras-andamento" class="modal-overlay" style="display:none; align-items:flex-start; padding-top:50px; z-index: 9999;">
                <div class="modal-content" style="width: 600px; max-width: 95%;">
                    <div class="modal-header">
                        <h2>Obras em Andamento</h2>
                        <button class="modal-close" onclick="document.getElementById('modal-obras-andamento').style.display='none'"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body" style="min-height: 200px; max-height: 60vh; overflow-y: auto;">
                        <p style="font-size: 0.9rem; color: #64748b; margin-bottom: 15px;">Ligue a chave para os empreendimentos que estão com obras em andamento. Os clientes desses empreendimentos serão dispensados de vistoria.</p>
                        <div id="obras-andamento-list">
                            Carregando...
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    },

    async loadData() {
        const loading = document.getElementById('vc-loading');
        const results = document.getElementById('vc-results');
        const btnWpp = document.getElementById('btn-solicitar-wpp');

        loading.style.display = 'block';
        results.style.display = 'none';
        if (btnWpp) btnWpp.disabled = true;

        const thresholdDays = _vcGetThreshold();

        try {
            const clients = window.rawClientList || (window.AppState && window.AppState.sales) || [];
            const elegiveis = clients.filter(c => {
                const maxDelay = parseInt(c.maxDaysDelay) || 0;
                return maxDelay >= thresholdDays;
            });

            const checksByContract = {};
            if (window.firebaseDb && window.firebaseCollections) {
                try {
                    const { collection, getDocs, query, where } = window.firebaseCollections;
                    const q = query(collection(window.firebaseDb, 'vistorias'), where('status', '!=', 'concluida'));
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        checksByContract[String(doc.data().contractId)] = { id: doc.id, ...doc.data() };
                    });
                } catch (err) {
                    console.warn('[Vistoria] Erro ao buscar histórico:', err);
                }
            }

            const rows = [];
            elegiveis.forEach(c => {
                const costCenterId = c.costCenterId;
                const city = _vcGetCity(costCenterId);
                const ccName = _vcGetCostCenterName(costCenterId);
                let empreendimento = '-';
                if (ccName && ccName !== '-') {
                    empreendimento = ccName.includes('-') ? ccName.split('-').slice(1).join('-').trim() : ccName.trim();
                }

                const contractId = c.saleId || c.contractId || c.id;
                const unidade = c.unitName || c.unit || c.unidade || contractId || '-';
                const vistoriaAtiva = checksByContract[String(contractId)];

                let statusLabel = 'Pendente de Vistoria';
                let statusColor = 'color: #dc2626; font-weight: bold;';

                if (vistoriaAtiva) {
                    if (vistoriaAtiva.status === 'aguardando_fotos') {
                        statusLabel = 'Link Enviado – Aguardando Fotos';
                        statusColor = 'color: #eab308;';
                    } else if (vistoriaAtiva.status === 'aguardando_validacao') {
                        statusLabel = 'Aguardando Validação';
                        statusColor = '';
                    }
                }

                rows.push({ customerId: c.customerId, contractId, cidade: city, costCenterId, empreendimento, unidade, statusLabel, statusColor, vistoriaAtiva, originalIdx: rows.length });
            });

            // Update originalIdx explicitly
            rows.forEach((r, i) => r.originalIdx = i);
            this.allRows = rows;
            this.renderedRows = []; // Will be populated by renderTable
            
            // Populate Filter Selects
            this.populateFilterSelects();

            // Removed DEBUG BANNER

            this.renderTable();

            loading.style.display = 'none';
            results.style.display = 'block';

        } catch (e) {
            console.error('[Vistoria] Erro ao carregar dados:', e);
            loading.innerHTML = '<span style="color:red">Erro ao carregar os dados: ' + e.message + '</span>';
        }
    },

    populateFilterSelects() {
        if (!this.allRows) return;
        const cidades = new Set();
        const empreendimentos = new Set();
        this.allRows.forEach(r => {
            cidades.add(r.cidade);
            empreendimentos.add(r.empreendimento);
        });

        const cidSel = document.getElementById('vc-filter-cidade');
        const empSel = document.getElementById('vc-filter-empreendimento');
        
        if(cidSel) {
            cidSel.innerHTML = '<option value="Todos">Todos</option>' + Array.from(cidades).sort().map(c => `<option value="${c}">${c}</option>`).join('');
            cidSel.value = this.activeFilters.cidade;
        }
        if(empSel) {
            empSel.innerHTML = '<option value="Todos">Todos</option>' + Array.from(empreendimentos).sort().map(e => `<option value="${e}">${e}</option>`).join('');
            empSel.value = this.activeFilters.empreendimento;
        }
    },

    updateFilterOptions() {
        const cid = document.getElementById('vc-filter-cidade').value;
        const empSel = document.getElementById('vc-filter-empreendimento');
        if (!this.allRows || !empSel) return;
        
        const empreendimentos = new Set();
        this.allRows.forEach(r => {
            if (cid === 'Todos' || r.cidade === cid) empreendimentos.add(r.empreendimento);
        });
        
        empSel.innerHTML = '<option value="Todos">Todos</option>' + Array.from(empreendimentos).sort().map(e => `<option value="${e}">${e}</option>`).join('');
        empSel.value = 'Todos';
    },

    applyFilters() {
        this.activeFilters.cidade = document.getElementById('vc-filter-cidade').value;
        this.activeFilters.empreendimento = document.getElementById('vc-filter-empreendimento').value;
        this.activeFilters.status = document.getElementById('vc-filter-status').value;
        document.getElementById('modal-filtros-vistoria').style.display = 'none';
        this.renderTable();
    },

    clearFilters() {
        this.activeFilters = { cidade: 'Todos', empreendimento: 'Todos', status: 'Todos' };
        document.getElementById('vc-filter-cidade').value = 'Todos';
        this.updateFilterOptions();
        document.getElementById('vc-filter-empreendimento').value = 'Todos';
        document.getElementById('vc-filter-status').value = 'Todos';
        this.applyFilters();
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

        // Store linearly for idx matching
        this.renderedRows = filtered;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #666;">Nenhum título encontrado com os filtros atuais.</td></tr>`;
            return;
        }

        // Grouping: Cidade -> Empreendimento
        const grouped = {};
        filtered.forEach((r, idx) => {
            if (!grouped[r.cidade]) grouped[r.cidade] = {};
            if (!grouped[r.cidade][r.empreendimento]) grouped[r.cidade][r.empreendimento] = [];
            grouped[r.cidade][r.empreendimento].push({ ...r, currentIdx: idx });
        });

        let html = '';
        const savedState = JSON.parse(localStorage.getItem('crm_obras_andamento') || '{}');
        
        Object.keys(grouped).sort().forEach(cidade => {
            const safeCidade = cidade.replace(/[^a-zA-Z0-9]/g, '_');
            
            // City Header Row
            html += `
                <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                    <td style="padding: 10px; text-align: center; width: 40px;">
                        <input type="checkbox" class="vc-city-cb" data-city="${safeCidade}" onchange="window.VerificarConstrucaoApp.toggleCity(this, '${safeCidade}')">
                    </td>
                    <td colspan="4" style="padding: 10px; font-weight: bold; font-size: 0.9rem;">
                        <i data-lucide="map-pin" style="width: 14px; margin-right: 5px;"></i> ${cidade}
                    </td>
                </tr>
            `;

            Object.keys(grouped[cidade]).sort().forEach(emp => {
                const safeEmp = emp.replace(/[^a-zA-Z0-9]/g, '_');
                const isObraAndamento = savedState[emp] === true;
                
                // Empreendimento Header Row
                html += `
                    <tr style="background: #fdfdfd; border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 8px; text-align: center; width: 40px; border-right: 1px solid #e2e8f0;"></td>
                        <td style="padding: 8px; text-align: center; width: 40px;">
                            <input type="checkbox" class="vc-emp-cb city-${safeCidade}" data-city="${safeCidade}" data-emp="${safeEmp}" onchange="window.VerificarConstrucaoApp.toggleEmp(this, '${safeCidade}', '${safeEmp}')" ${isObraAndamento ? 'disabled' : ''}>
                        </td>
                        <td colspan="3" style="padding: 8px; font-weight: 600; color: #475569;">
                            ${emp} ${isObraAndamento ? '<span style="background:#fef08a; color:#854d0e; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-left:10px;">Obra em Andamento</span>' : ''}
                        </td>
                    </tr>
                `;

                if (isObraAndamento) {
                    html += `
                        <tr style="border-bottom: 1px solid #f1f5f9; background: #fffbeb;">
                            <td colspan="2" style="border-right: 1px solid #e2e8f0;"></td>
                            <td colspan="3" style="padding: 15px; text-align: center; color: #854d0e; font-style: italic; font-size: 0.85rem;">
                                Vistoria dispensada - cliente não pode construir - obras do empreendimento em andamento.
                            </td>
                        </tr>
                    `;
                } else {
                    // Unidades Rows
                    const unidades = grouped[cidade][emp].sort((a, b) => a.unidade.localeCompare(b.unidade));
                    unidades.forEach(u => {
                        const validAction = u.statusLabel === 'Aguardando Validação' 
                            ? `<button class="btn btn-primary btn-sm" onclick="window.VerificarConstrucaoApp.validarVistoria(${u.currentIdx})" style="padding: 4px 8px; font-size: 0.8rem;">Validar Vistoria</button>` 
                            : u.statusLabel;

                        html += `
                            <tr style="border-bottom: 1px solid #f1f5f9;">
                                <td colspan="2" style="border-right: 1px solid #e2e8f0;"></td>
                                <td style="padding: 8px 8px 8px 20px; text-align: center; width: 40px;">
                                    <input type="checkbox" class="vc-row-checkbox city-${safeCidade} emp-${safeEmp}" value="${u.currentIdx}" onchange="window.VerificarConstrucaoApp.updateBtn()">
                                </td>
                                <td style="padding: 8px; font-weight: 600;">${u.unidade}</td>
                                <td style="padding: 8px; ${u.statusColor}">${validAction}</td>
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
        if (btn) btn.disabled = cbs.length === 0;
    },

    abrirModalObrasAndamento() {
        const modal = document.getElementById('modal-obras-andamento');
        const listDiv = document.getElementById('obras-andamento-list');
        if (!this.allRows || !listDiv) return;

        const empreendimentos = new Set();
        this.allRows.forEach(r => {
            if (r.empreendimento && r.empreendimento !== '-') {
                empreendimentos.add(r.empreendimento);
            }
        });

        const savedState = JSON.parse(localStorage.getItem('crm_obras_andamento') || '{}');

        let html = '';
        Array.from(empreendimentos).sort().forEach(emp => {
            const isChecked = savedState[emp] === true ? 'checked' : '';
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #e2e8f0;">
                    <span style="font-weight: 500; color: #1e293b;">${emp}</span>
                    <label style="position: relative; display: inline-block; width: 40px; height: 20px;">
                        <input type="checkbox" style="opacity: 0; width: 0; height: 0;" ${isChecked} onchange="window.VerificarConstrucaoApp.toggleObraEmAndamento('${emp.replace(/'/g, "\\'")}', this.checked)">
                        <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isChecked ? '#10b981' : '#cbd5e1'}; transition: .4s; border-radius: 20px;">
                            <span style="position: absolute; content: ''; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; transform: ${isChecked ? 'translateX(20px)' : 'none'};"></span>
                        </span>
                    </label>
                </div>
            `;
        });

        if (Array.from(empreendimentos).length === 0) {
            html = '<p style="color: #64748b;">Nenhum empreendimento listado no momento.</p>';
        }

        listDiv.innerHTML = html;
        modal.style.display = 'flex';
    },

    toggleObraEmAndamento(emp, checked) {
        const savedState = JSON.parse(localStorage.getItem('crm_obras_andamento') || '{}');
        savedState[emp] = checked;
        localStorage.setItem('crm_obras_andamento', JSON.stringify(savedState));
        
        // Update visually
        const evt = window.event;
        if (evt && evt.target) {
            const toggleSpan = evt.target.nextElementSibling;
            if (toggleSpan) {
                const circleSpan = toggleSpan.querySelector('span');
                if (checked) {
                    toggleSpan.style.backgroundColor = '#10b981';
                    if (circleSpan) circleSpan.style.transform = 'translateX(20px)';
                } else {
                    toggleSpan.style.backgroundColor = '#cbd5e1';
                    if (circleSpan) circleSpan.style.transform = 'none';
                }
            }
        }

        this.renderTable();
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

    // Busca coords do KMZ via servidor local para salvar no Firebase
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

        try {
            const { collection, addDoc, doc, updateDoc, serverTimestamp } = window.firebaseCollections;
            const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
            
            const cityGroups = {};
            const generatedIds = [];

            for (const r of selected) {
                let vId = r.vistoriaAtiva ? r.vistoriaAtiva.id : null;

                // Buscar coords e salvar no Firebase para que vistoria.html use sem servidor local
                const loteCoords = await this._fetchLoteCoords(r.costCenterId);

                if (!vId) {
                    const docRef = await addDoc(collection(window.firebaseDb, 'vistorias'), {
                        customerId: r.customerId,
                        contractId: r.contractId,
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
            }

            const hour = new Date().getHours();
            let greeting = 'Bom dia';
            if (hour >= 12 && hour < 18) greeting = 'Boa tarde';
            else if (hour >= 18) greeting = 'Boa noite';
            
            let numCidades = Object.keys(cityGroups).length;
            let prefixo = numCidades > 1 ? 'nas cidades:' : 'na cidade:';
            
            let message = `${greeting}! Segue a lista de vistorias a serem realizadas ${prefixo}\n\n`;

            for (const city in cityGroups) {
                message += `*${city.toUpperCase()}*\n`;
                for (const emp in cityGroups[city]) {
                    const count = cityGroups[city][emp];
                    message += `- ${emp.toUpperCase()} (${count} lote${count > 1 ? 's' : ''})\n`;
                }
                message += '\n';
            }

            const idsParam = generatedIds.join(',');
            const link = `${baseUrl}vistoria.html?ids=${idsParam}`;
            message += `Acesse o link abaixo para realizar a(s) vistoria(s):\n${link}`;

            const phone = '5515998118246';
            window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`, '_blank');

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

    async abrirVistoriasRecebidas() {
        alert("As vistorias prontas para validação agora possuem um botão 'Validar Vistoria' diretamente na coluna STATUS da tabela principal.");
    },

    async validarVistoria(idx) {
        const row = this.renderedRows[idx];
        if (!row || !row.vistoriaAtiva) return;

        this._currentValidatingRowIdx = idx;

        const v = row.vistoriaAtiva;
        const r = v.respostasFormulario || {};

        const formatSimNao = (val) => {
            if (!val) return '-';
            return val.toLowerCase() === 'sim' ? 'Sim' : 'Não';
        };

        const formatEstagio = (val) => {
            if (!val) return '-';
            return val.replace(/_/g, ' ').toUpperCase();
        };

        let html = `
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div style="display: flex; flex-direction: column; gap: 10px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <h3 style="margin-top:0; color: #1e293b; font-size: 1rem; margin-bottom: 5px;">Respostas do Questionário</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">
                        <div><strong>Água:</strong> ${formatSimNao(r.possuiAgua)}</div>
                        <div><strong>Energia:</strong> ${formatSimNao(r.possuiEnergia)}</div>
                        <div><strong>Entulho:</strong> ${formatSimNao(r.possuiEntulho)}</div>
                        <div><strong>Acesso:</strong> ${formatSimNao(r.permiteAcesso)}</div>
                        <div style="grid-column: 1 / -1;"><strong>Estágio da Obra:</strong> ${formatEstagio(r.estagioObra)}</div>
                        <div style="grid-column: 1 / -1;"><strong>Observações:</strong> ${r.observacoes || '-'}</div>
                    </div>
                </div>
                
                <div>
                    <h3 style="margin-top:0; color: #1e293b; font-size: 1rem; margin-bottom: 10px;">Fotos Recebidas</h3>
                    <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px;">
                        ${v.fotoFrente ? `<a href="${v.fotoFrente}" target="_blank"><img src="${v.fotoFrente}" style="height: 150px; border-radius: 8px; border: 1px solid #cbd5e1; object-fit: cover;"></a>` : '<span style="color:#94a3b8; font-size:0.8rem;">Sem foto (Frente)</span>'}
                        ${v.fotoMeioFundo ? `<a href="${v.fotoMeioFundo}" target="_blank"><img src="${v.fotoMeioFundo}" style="height: 150px; border-radius: 8px; border: 1px solid #cbd5e1; object-fit: cover;"></a>` : '<span style="color:#94a3b8; font-size:0.8rem;">Sem foto (Meio Fundo)</span>'}
                        ${v.fotoFundoFrente ? `<a href="${v.fotoFundoFrente}" target="_blank"><img src="${v.fotoFundoFrente}" style="height: 150px; border-radius: 8px; border: 1px solid #cbd5e1; object-fit: cover;"></a>` : '<span style="color:#94a3b8; font-size:0.8rem;">Sem foto (Fundo Frente)</span>'}
                    </div>
                    <p style="font-size: 0.8rem; color: #64748b; margin-top: 5px;">Clique na foto para ampliar em nova guia.</p>
                </div>
            </div>
        `;

        document.getElementById('validar-vistoria-body').innerHTML = html;
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
            <div style="position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.8); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <div class="loader" style="border: 4px solid #f3f3f3; border-top: 4px solid var(--color-primary); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
                <h3 style="margin-top:20px; color:var(--color-primary);" id="vc-validar-status">Preparando validação...</h3>
            </div>
        `;
        document.body.appendChild(loadingDiv);

        try {
            const v = row.vistoriaAtiva;
            const { getStorage, ref, listAll, getDownloadURL } = window.firebaseCollections;
            const storageRef = ref(window.firebaseStorage, `vistorias/${v.id}`);
            
            document.getElementById('vc-validar-status').textContent = 'Buscando fotos no Firebase...';
            const listRes = await listAll(storageRef);
            if (listRes.items.length === 0) {
                throw new Error("Nenhuma foto encontrada para esta vistoria.");
            }

            // Descobrir o unitId do contrato
            document.getElementById('vc-validar-status').textContent = 'Consultando contrato no Sienge...';
            let host = window.location.hostname;
            let port = window.location.port ? ':' + window.location.port : '';
            if (host.includes('vercel.app')) port = '';
            
            const authHeader = typeof getBasicAuthHeader === 'function' ? getBasicAuthHeader() : '';
            const cRes = await fetch(`/api/sienge-proxy/sales-contracts/${row.contractId}`, {
                headers: { 'Authorization': authHeader }
            });
            if (!cRes.ok) throw new Error("Falha ao consultar contrato no Sienge.");
            const contractData = await cRes.json();
            const siengeUnitId = contractData.unitId;
            if (!siengeUnitId) throw new Error("ID da unidade não encontrado no contrato Sienge.");

            document.getElementById('vc-validar-status').textContent = 'Enviando fotos para o Sienge...';
            
            const padraoData = new Date().toLocaleDateString('pt-BR').replace(/\//g, '.');

            for (let i = 0; i < listRes.items.length; i++) {
                const itemRef = listRes.items[i];
                const url = await getDownloadURL(itemRef);
                
                // Baixar como Blob
                const imgRes = await fetch(url);
                const blob = await imgRes.blob();
                
                // Montar FormData e POST para Sienge
                const nomeFinal = `${row.empreendimento} - ${row.unidade} - Foto de Vistoria ${i+1} - ${padraoData}.jpg`;
                const descricaoSienge = `${padraoData} - Foto de Vistoria ${i+1}`;
                
                const apiUrl = `/api/sienge-proxy/units/${siengeUnitId}/attachments?description=${encodeURIComponent(descricaoSienge)}`;
                
                const formData = new FormData();
                formData.append('file', blob, nomeFinal);
                
                const uploadRes = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
                    body: formData
                });
                
                if (!uploadRes.ok) {
                    throw new Error(`Falha ao enviar foto ${i+1}: HTTP ${uploadRes.status}`);
                }
            }

            // Atualizar status no Firebase para concluida
            document.getElementById('vc-validar-status').textContent = 'Finalizando Vistoria...';
            const { doc, updateDoc } = window.firebaseCollections;
            await updateDoc(doc(window.firebaseDb, 'vistorias', v.id), { status: 'concluida' });

            alert("Vistoria validada e fotos anexadas com sucesso!");
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
