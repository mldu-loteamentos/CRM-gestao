// Lógica para o relatório "Verificar Construção"

window.VerificarConstrucaoApp = {
    init() {
        this.render();
    },
    
    render() {
        const root = document.getElementById('verificar-construcao-root');
        if (!root) return;
        
        let thresholdDays = 91;
        if (window.TimelineState) {
            const node = window.TimelineState.find(n => (n.label || n.nome || '').toLowerCase().includes('verificar constru'));
            if (node && node.dias !== undefined) {
                thresholdDays = parseInt(node.dias);
            }
        }

        root.innerHTML = `
            <div class="crm-card" style="padding: 20px;">
                <h3 style="font-size: 1.2rem; color: var(--color-primary); margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="hard-hat" style="width: 24px;"></i> Verificar Construção (Atraso >= ${thresholdDays} dias)
                </h3>
                
                <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                    <div>
                        <button class="btn btn-primary" onclick="window.VerificarConstrucaoApp.loadData()">
                            <i data-lucide="refresh-cw" style="width: 16px;"></i> Carregar Pendentes
                        </button>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-success" onclick="window.VerificarConstrucaoApp.solicitarWhatsApp()" id="btn-solicitar-wpp" disabled>
                            <i data-lucide="message-circle" style="width: 16px;"></i> Solicitar Vistoria (WhatsApp)
                        </button>
                        <button class="btn btn-outline" onclick="window.VerificarConstrucaoApp.abrirVistoriasRecebidas()">
                            <i data-lucide="inbox" style="width: 16px;"></i> Vistorias Recebidas
                        </button>
                    </div>
                </div>

                <div id="vc-loading" style="display: none; text-align: center; padding: 20px; color: #666;">
                    Analisando fila de clientes e cruzando com KMZs...
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
                            <tbody id="vc-tbody">
                            </tbody>
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
        btnWpp.disabled = true;
        
        let thresholdDays = 91;
        if (window.TimelineState) {
            const node = window.TimelineState.find(n => (n.label || n.nome || '').toLowerCase().includes('verificar constru'));
            if (node && node.dias !== undefined) {
                thresholdDays = parseInt(node.dias);
            }
        }
        
        try {
            // 1. Filtrar clientes
            const clients = window.rawClientList || (window.AppState && window.AppState.sales) || [];
            const elegiveis = clients.filter(c => {
                const maxDelay = parseInt(c.maxDaysDelay) || 0;
                return maxDelay >= thresholdDays;
            });
            
            // 2. Buscar Vistorias atuais do Firebase (solicitadas / recebidas)
            const checksByContract = {};
            if (window.firebaseDb && window.firebaseCollections) {
                const { collection, getDocs, query, where } = window.firebaseCollections;
                try {
                    // Pega todas as vistorias abertas
                    const q = query(collection(window.firebaseDb, "vistorias"), where("status", "!=", "concluida"));
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        checksByContract[doc.data().contractId] = { id: doc.id, ...doc.data() };
                    });
                } catch(err) {
                    console.error("Erro ao buscar historico:", err);
                }
            }

            // 3. CC to City mapper
            const ccIdToCity = {};
            if (window.AppState && window.AppState.cachedCostCenters) {
                window.AppState.cachedCostCenters.forEach(cc => {
                    let city = "";
                    if (String(cc.id) === "14201" || (cc.name && cc.name.toUpperCase().includes("ARAÇARI"))) {
                        city = "ARAÇARIGUAMA";
                    } else if (cc.name && cc.name.includes('-')) {
                        city = cc.name.split('-')[0].trim().toUpperCase();
                    }
                    if (city) ccIdToCity[cc.id] = city;
                });
            }
            
            const rows = [];
            elegiveis.forEach(c => {
                let city = ccIdToCity[c.costCenterId] || c.cidade || '-';
                const contractId = c.contractId || c.numeroContrato || c.id;
                
                const vistoriaAtiva = checksByContract[contractId];
                
                let statusLabel = 'Pendente de Vistoria';
                let statusColor = 'color: #dc2626; font-weight: bold;'; // red
                
                if (vistoriaAtiva) {
                    if (vistoriaAtiva.status === 'aguardando_fotos') {
                        statusLabel = 'Link Enviado - Aguardando Fotos';
                        statusColor = 'color: #eab308;'; // yellow
                    } else if (vistoriaAtiva.status === 'aguardando_validacao') {
                        statusLabel = 'Fotos Recebidas - Validar!';
                        statusColor = 'color: #22c55e; font-weight: bold;'; // green
                    }
                }

                rows.push({
                    customerId: c.customerId,
                    contractId: contractId,
                    cidade: city,
                    costCenterId: c.costCenterId,
                    empreendimento: c.costCenterName || c.empreendimento || '-',
                    unidade: c.unit || c.unidade || c.contractId || '-',
                    statusLabel: statusLabel,
                    statusColor: statusColor,
                    vistoriaAtiva: vistoriaAtiva
                });
            });

            // Sort
            rows.sort((a,b) => {
                if (a.statusLabel.includes('Validar') && !b.statusLabel.includes('Validar')) return -1;
                if (!a.statusLabel.includes('Validar') && b.statusLabel.includes('Validar')) return 1;
                return a.cidade.localeCompare(b.cidade);
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
                            <td style="padding: 12px; ${r.statusColor}">${r.statusLabel}</td>
                        </tr>
                    `;
                });
            }
            
            tbody.innerHTML = html;
            loading.style.display = 'none';
            results.style.display = 'block';
            
        } catch(e) {
            console.error("Erro ao carregar dados de construção", e);
            loading.innerHTML = '<span style="color:red">Erro ao carregar os dados.</span>';
        }
    },

    toggleAll(cb) {
        const cbs = document.querySelectorAll('.vc-row-checkbox');
        cbs.forEach(c => c.checked = cb.checked);
        this.updateBtn();
    },

    updateBtn() {
        const cbs = document.querySelectorAll('.vc-row-checkbox:checked');
        document.getElementById('btn-solicitar-wpp').disabled = cbs.length === 0;
    },

    async solicitarWhatsApp() {
        if (!this.renderedRows) return;
        
        const cbs = document.querySelectorAll('.vc-row-checkbox:checked');
        const selected = Array.from(cbs).map(c => this.renderedRows[parseInt(c.value)]);
        
        if (selected.length === 0) return;
        
        const btnWpp = document.getElementById('btn-solicitar-wpp');
        btnWpp.disabled = true;
        btnWpp.innerHTML = '<i data-lucide="loader" class="spin"></i> Gerando Links...';
        
        try {
            const { collection, addDoc, serverTimestamp } = window.firebaseCollections;
            const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
            
            let message = "Olá! Os seguintes lotes precisam ser vistoriados:\\n\\n";
            let cidades = new Set();
            
            for (const r of selected) {
                // Se já tem link ativo, pode reusar, senao gera um novo
                let vId = r.vistoriaAtiva ? r.vistoriaAtiva.id : null;
                
                if (!vId) {
                    const docRef = await addDoc(collection(window.firebaseDb, "vistorias"), {
                        customerId: r.customerId,
                        contractId: r.contractId,
                        cidade: r.cidade,
                        empreendimento: r.empreendimento,
                        costCenterId: r.costCenterId,
                        unidade: r.unidade,
                        status: 'aguardando_fotos',
                        createdAt: serverTimestamp()
                    });
                    vId = docRef.id;
                }
                
                cidades.add(r.cidade);
                const link = `${baseUrl}vistoria.html?id=${vId}`;
                message += `*${r.cidade} - ${r.empreendimento} - Unid: ${r.unidade}*\\nLink: ${link}\\n\\n`;
            }
            
            // Abrir Whatsapp
            const phone = "5515998118246";
            const encoded = encodeURIComponent(message);
            window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`, '_blank');
            
            this.loadData(); // recarrega a tabela
            
        } catch (err) {
            console.error("Erro ao gerar vistorias", err);
            alert("Erro ao gerar os links: " + err.message);
        } finally {
            btnWpp.innerHTML = '<i data-lucide="message-circle" style="width: 16px;"></i> Solicitar Vistoria (WhatsApp)';
            btnWpp.disabled = false;
        }
    },
    
    async abrirVistoriasRecebidas() {
        const modal = document.getElementById('modal-vistorias-recebidas');
        const body = document.getElementById('vistorias-recebidas-body');
        modal.style.display = 'flex';
        body.innerHTML = '<div style="text-align:center; padding:30px;">Carregando...</div>';
        
        try {
            const { collection, getDocs, query, where } = window.firebaseCollections;
            const q = query(collection(window.firebaseDb, "vistorias"), where("status", "==", "aguardando_validacao"));
            const snap = await getDocs(q);
            
            let html = '';
            if (snap.empty) {
                html = '<div style="padding:20px; text-align:center; color:#666;">Nenhuma vistoria pendente de validação.</div>';
            } else {
                html = '<div style="display:flex; flex-direction:column; gap:15px;">';
                snap.forEach(doc => {
                    const d = doc.data();
                    const vId = doc.id;
                    html += `
                        <div class="crm-card" style="padding:15px; display:flex; justify-content:space-between; align-items:center;" id="vistoria-card-${vId}">
                            <div>
                                <h4 style="margin-bottom:5px;">${d.cidade} - ${d.empreendimento}</h4>
                                <div style="font-size:0.9rem; color:#555;">Unidade: <b>${d.unidade}</b> | Cliente ID: ${d.customerId}</div>
                            </div>
                            <div style="display:flex; gap:10px;">
                                <button class="btn btn-outline" onclick="window.VerificarConstrucaoApp.verFotos('${vId}', '${d.fotoFrente}', '${d.fotoMeioFundo}', '${d.fotoFundoFrente}')">
                                    <i data-lucide="image"></i> Ver Fotos
                                </button>
                                <button class="btn btn-success" onclick="window.VerificarConstrucaoApp.aprovarVistoria('${vId}', '${d.customerId}', '${d.contractId}', '${d.fotoFrente}', '${d.fotoMeioFundo}', '${d.fotoFundoFrente}')">
                                    <i data-lucide="check"></i> Aprovar e Sienge
                                </button>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
            }
            body.innerHTML = html;
            lucide.createIcons();
            
        } catch(e) {
            console.error(e);
            body.innerHTML = '<div style="color:red; padding:20px;">Erro ao carregar vistorias recebidas.</div>';
        }
    },
    
    verFotos(id, f1, f2, f3) {
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Fotos da Vistoria</title></head>
            <body style="font-family:sans-serif; text-align:center; background:#eee; padding:20px;">
                <h2>Frente do Lote</h2><img src="${f1}" style="max-width:90%; border:2px solid #ccc; margin-bottom:20px;"/><br>
                <h2>Meio para o Fundo</h2><img src="${f2}" style="max-width:90%; border:2px solid #ccc; margin-bottom:20px;"/><br>
                <h2>Fundo para a Frente</h2><img src="${f3}" style="max-width:90%; border:2px solid #ccc;"/><br>
            </body></html>
        `);
    },
    
    async aprovarVistoria(vId, customerId, contractId, f1, f2, f3) {
        if (!confirm("Tem certeza que deseja aprovar as fotos e anexar no Sienge?")) return;
        
        const card = document.getElementById(`vistoria-card-${vId}`);
        const originalHtml = card.innerHTML;
        card.innerHTML = '<div style="width:100%; text-align:center; padding:20px;">Aprovando e enviando para Sienge (isso pode demorar)...</div>';
        
        try {
            const uploadToSienge = async (imgUrl, filename) => {
                const res = await fetch(imgUrl);
                const blob = await res.blob();
                const file = new File([blob], filename, { type: blob.type });
                
                const formData = new FormData();
                formData.append('file', file);
                
                const dataFormatada = new Date().toLocaleDateString('pt-BR');
                const descricaoSienge = `${dataFormatada} - Vistoria - ${filename}`;
                
                const host = window.location.hostname;
                const port = window.location.port || '80';
                
                const apiUrl = `http://${host}:${port}/sienge-proxy/customers/${customerId}/attachments?description=${encodeURIComponent(descricaoSienge)}`;
                
                const uploadRes = await fetch(apiUrl, {
                    method: 'POST',
                    body: formData
                });
                
                if (!uploadRes.ok) throw new Error("Erro no upload Sienge: " + uploadRes.statusText);
            };
            
            await uploadToSienge(f1, "vistoria_frente.jpeg");
            await uploadToSienge(f2, "vistoria_meio_fundo.jpeg");
            await uploadToSienge(f3, "vistoria_fundo_frente.jpeg");
            
            const { doc, updateDoc } = window.firebaseCollections;
            await updateDoc(doc(window.firebaseDb, "vistorias", vId), {
                status: "concluida"
            });
            
            card.innerHTML = '<div style="width:100%; text-align:center; padding:20px; color:green; font-weight:bold;">Enviado com sucesso!</div>';
            setTimeout(() => { card.style.display = 'none'; }, 2000);
            
        } catch(e) {
            console.error(e);
            alert("Erro ao aprovar vistoria: " + e.message);
            card.innerHTML = originalHtml;
        }
    }
};

document.addEventListener('tabChanged', (e) => {
    if (e.detail === 'construcao-engenharia') {
        window.VerificarConstrucaoApp.init();
    }
});
