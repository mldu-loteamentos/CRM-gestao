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

    init() {
        this.render();
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
                        <button class="btn btn-primary" onclick="window.VerificarConstrucaoApp.loadData()">
                            <i data-lucide="refresh-cw" style="width: 16px;"></i> Carregar Pendentes
                        </button>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-outline" style="border-color: #94a3b8; color: #475569;" onclick="window.VerificarConstrucaoApp.editarRegua()">
                            <i data-lucide="settings" style="width: 16px;"></i> Editar Régua
                        </button>
                        <button class="btn btn-success" onclick="window.VerificarConstrucaoApp.solicitarWhatsApp()" id="btn-solicitar-wpp" disabled>
                            <i data-lucide="message-circle" style="width: 16px;"></i> Solicitar Vistoria (WhatsApp)
                        </button>
                        <button class="btn btn-outline" onclick="window.VerificarConstrucaoApp.abrirVistoriasRecebidas()">
                            <i data-lucide="inbox" style="width: 16px;"></i> Vistorias Recebidas
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

            <!-- Modal Vistorias Recebidas -->
            <div id="modal-vistorias-recebidas" class="modal-overlay" style="display:none; align-items:flex-start; padding-top:50px; z-index: 9999;">
                <div class="modal-content" style="width: 800px; max-width: 95%;">
                    <div class="modal-header">
                        <h2>Vistorias Recebidas (Para Validação)</h2>
                        <button class="modal-close" onclick="document.getElementById('modal-vistorias-recebidas').style.display='none'"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body" id="vistorias-recebidas-body" style="min-height: 200px;">
                        Carregando...
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    },

    async loadData() {
        const loading = document.getElementById('vc-loading');
        const results = document.getElementById('vc-results');
        const tbody = document.getElementById('vc-tbody');
        const btnWpp = document.getElementById('btn-solicitar-wpp');

        loading.style.display = 'block';
        results.style.display = 'none';
        if (btnWpp) btnWpp.disabled = true;

        const thresholdDays = _vcGetThreshold();

        try {
            // 1. Filtrar clientes pelo atraso
            const clients = window.rawClientList || (window.AppState && window.AppState.sales) || [];
            const elegiveis = clients.filter(c => {
                const maxDelay = parseInt(c.maxDaysDelay) || 0;
                return maxDelay >= thresholdDays;
            });

            // 2. Buscar vistorias ativas no Firebase
            const checksByContract = {};
            if (window.firebaseDb && window.firebaseCollections) {
                try {
                    const { collection, getDocs, query, where } = window.firebaseCollections;
                    const q = query(
                        collection(window.firebaseDb, 'vistorias'),
                        where('status', '!=', 'concluida')
                    );
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        checksByContract[String(doc.data().contractId)] = { id: doc.id, ...doc.data() };
                    });
                } catch (err) {
                    console.warn('[Vistoria] Erro ao buscar histórico:', err);
                }
            }

            // 3. Montar linhas com campos corretos
            const rows = [];
            elegiveis.forEach(c => {
                const costCenterId = c.costCenterId;
                const city = _vcGetCity(costCenterId);
                const ccName = _vcGetCostCenterName(costCenterId);

                // Empreendimento: parte após o "-" do nome do centro de custo
                let empreendimento = '-';
                if (ccName && ccName !== '-') {
                    if (ccName.includes('-')) {
                        empreendimento = ccName.split('-').slice(1).join('-').trim();
                    } else {
                        empreendimento = ccName.trim();
                    }
                }

                const contractId = c.saleId || c.contractId || c.id;
                // unitName é o campo correto do objeto consolidated
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

                rows.push({ customerId: c.customerId, contractId, cidade: city, costCenterId, empreendimento, unidade, statusLabel, statusColor, vistoriaAtiva });
            });

            // Ordenar: validação primeiro, depois aguardando, depois pendente, por cidade, empreendimento, unidade
            rows.sort((a, b) => {
                const rank = s => s.includes('Validar') ? 0 : (s.includes('Aguardando') ? 1 : 2);
                if (rank(a.statusLabel) !== rank(b.statusLabel)) return rank(a.statusLabel) - rank(b.statusLabel);
                return a.cidade.localeCompare(b.cidade) || a.empreendimento.localeCompare(b.empreendimento) || a.unidade.localeCompare(b.unidade);
            });

            this.renderedRows = rows;

            let html = '';
            if (rows.length === 0) {
                html = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #666;">Nenhum título com atraso >= ${thresholdDays} dias.</td></tr>`;
            } else {
                rows.forEach((r, idx) => {
                    html += `
                        <tr style="border-bottom: 1px solid #e2e8f0;" data-idx="${idx}">
                            <td style="padding: 12px; text-align: center;">
                                <input type="checkbox" class="vc-row-checkbox" value="${idx}" onchange="window.VerificarConstrucaoApp.updateBtn()">
                            </td>
                            <td style="padding: 12px;">${r.cidade}</td>
                            <td style="padding: 12px;">${r.empreendimento}</td>
                            <td style="padding: 12px; font-weight: 600;">${r.unidade}</td>
                            <td style="padding: 12px; ${r.statusColor}">
                                ${r.statusLabel === 'Aguardando Validação' ? `<button class="btn btn-primary btn-sm" onclick="window.VerificarConstrucaoApp.validarVistoria(${idx})" style="padding: 4px 8px; font-size: 0.8rem;">Validar Vistoria</button>` : r.statusLabel}
                            </td>
                        </tr>
                    `;
                });
            }

            tbody.innerHTML = html;
            loading.style.display = 'none';
            results.style.display = 'block';

        } catch (e) {
            console.error('[Vistoria] Erro ao carregar dados:', e);
            loading.innerHTML = '<span style="color:red">Erro ao carregar os dados: ' + e.message + '</span>';
        }
    },

    toggleAll(cb) {
        document.querySelectorAll('.vc-row-checkbox').forEach(c => c.checked = cb.checked);
        this.updateBtn();
    },

    updateBtn() {
        const cbs = document.querySelectorAll('.vc-row-checkbox:checked');
        const btn = document.getElementById('btn-solicitar-wpp');
        if (btn) btn.disabled = cbs.length === 0;
    },

    editarRegua() {
        if (typeof window.switchTab === 'function') {
            window.switchTab('config');
            setTimeout(() => {
                const regrasTab = document.querySelector('.config-tab-btn[data-tab="regras"]');
                if (regrasTab) regrasTab.click();
            }, 100);
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
            let cidadeStr = numCidades > 1 ? 'cidades' : 'cidade';
            
            let message = `${greeting}! Segue a lista de vistorias a serem realizadas na(s) ${cidadeStr}:\n\n`;

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

        const confirmacao = confirm(`Deseja validar e enviar as fotos da vistoria da unidade ${row.unidade} para o Sienge?`);
        if (!confirmacao) return;

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
            const cRes = await fetch(`http://${host}${port}/sienge-proxy/sales-contracts/${row.contractId}`, {
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
                
                const apiUrl = `http://${host}${port}/sienge-proxy/units/${siengeUnitId}/attachments?description=${encodeURIComponent(descricaoSienge)}`;
                
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
