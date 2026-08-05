// Lógica para o relatório "Verificar Construção"

window.VerificarConstrucaoApp = {
    init() {
        this.render();
    },
    
    render() {
        const root = document.getElementById('verificar-construcao-root');
        if (!root) return;
        
        root.innerHTML = `
            <div class="crm-card" style="padding: 20px;">
                <h3 style="font-size: 1.2rem; color: var(--color-primary); margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="hard-hat" style="width: 24px;"></i> Verificar Construção (Atraso >= 61 dias)
                </h3>
                
                <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <button class="btn btn-primary" onclick="window.VerificarConstrucaoApp.loadData()">
                            <i data-lucide="refresh-cw" style="width: 16px;"></i> Carregar Pendentes
                        </button>
                    </div>
                    <div>
                        <button class="btn btn-outline" onclick="window.VerificarConstrucaoApp.solicitarPorEmail()" id="btn-solicitar-email" disabled>
                            <i data-lucide="mail" style="width: 16px;"></i> Solicitar por E-mail
                        </button>
                    </div>
                </div>

                <div id="vc-loading" style="display: none; text-align: center; padding: 20px; color: #666;">
                    Analisando fila de clientes e últimos estágios...
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
                                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">STATUS DA CONSTRUÇÃO</th>
                                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">EMAIL RESPONSÁVEL</th>
                                </tr>
                            </thead>
                            <tbody id="vc-tbody">
                            </tbody>
                        </table>
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
        const btnMail = document.getElementById('btn-solicitar-email');
        
        loading.style.display = 'block';
        results.style.display = 'none';
        btnMail.disabled = true;
        
        try {
            // Filtrar clientes com atraso >= 61 dias
            const clients = window.rawClientList || (window.currentAppState && window.currentAppState.sales) || [];
            const elegiveis = clients.filter(c => {
                const maxDelay = parseInt(c.maxDelayDays) || 0;
                return maxDelay >= 61;
            });
            
            // Buscar última vistoria para cada cliente para saber o status
            const checksByClient = {};
            if (window.firebaseDb && window.firebaseCollections) {
                const { collection, getDocs } = window.firebaseCollections;
                // Como não podemos fazer query 'IN' com muitos itens, podemos buscar todos (pode ser pesado)
                // Ou buscar apenas a ultima vistoria fazendo query ordenada pra cada contrato (muitas queries)
                // Como workaround, baixamos todas as vistorias (como é um número ok pra firebase)
                try {
                    const snap = await getDocs(collection(window.firebaseDb, "construction_checks"));
                    snap.forEach(doc => {
                        const data = doc.data();
                        const id = data.customerId;
                        if (!checksByClient[id] || new Date(data.date) > new Date(checksByClient[id].date)) {
                            checksByClient[id] = data;
                        }
                    });
                } catch(err) {
                    console.error("Erro ao buscar historico:", err);
                }
            }

            // CC to City mapper (mesma lógica)
            const ccIdToCity = {};
            if (window.currentAppState && window.currentAppState.cachedCostCenters) {
                window.currentAppState.cachedCostCenters.forEach(cc => {
                    let city = "";
                    if (String(cc.id) === "14201" || (cc.name && cc.name.toUpperCase().includes("ARAÇARI"))) {
                        city = "ARAÇARIGUAMA";
                    } else if (cc.name && cc.name.includes('-')) {
                        city = cc.name.split('-')[0].trim().toUpperCase();
                    }
                    if (city) ccIdToCity[cc.id] = city;
                });
            }

            // Pegar usuarios do localstorage para pegar o email responsável
            const usersStr = localStorage.getItem('crm_users');
            const users = usersStr ? JSON.parse(usersStr) : [];
            
            const rows = [];
            
            elegiveis.forEach(c => {
                let city = ccIdToCity[c.costCenterId] || c.cidade || '-';
                
                let respEmail = '-';
                for (const user of users) {
                    if (user.check_construction) {
                        const hasCompany = user.const_companies && user.const_companies.includes(String(c.companyId));
                        const hasCity = city && city !== '-' && user.const_cities && user.const_cities.includes(city);
                        if (hasCompany || hasCity) {
                            respEmail = user.email || respEmail;
                            break;
                        }
                    }
                }
                
                const lastCheck = checksByClient[c.customerId];
                const status = lastCheck ? lastCheck.stage : 'Pendente de Vistoria';

                rows.push({
                    customerId: c.customerId,
                    contractId: c.contractId || c.numeroContrato || c.id,
                    cidade: city,
                    empreendimento: c.costCenterName || c.empreendimento || '-',
                    unidade: c.unit || c.unidade || c.contractId || '-',
                    status: status,
                    email: respEmail
                });
            });

            // Sort by status, then city
            rows.sort((a,b) => {
                if (a.status === 'Pendente de Vistoria' && b.status !== 'Pendente de Vistoria') return -1;
                if (a.status !== 'Pendente de Vistoria' && b.status === 'Pendente de Vistoria') return 1;
                return a.cidade.localeCompare(b.cidade);
            });

            this.renderedRows = rows;
            
            let html = '';
            if (rows.length === 0) {
                html = `<tr><td colspan="6" style="padding: 20px; text-align: center; color: #666;">Nenhum cliente com atraso >= 61 dias.</td></tr>`;
            } else {
                rows.forEach((r, idx) => {
                    const statusColor = r.status === 'Pendente de Vistoria' ? 'color: #dc2626; font-weight: bold;' : 'color: #0284c7;';
                    html += `
                        <tr style="border-bottom: 1px solid #e2e8f0;" data-idx="${idx}">
                            <td style="padding: 12px; text-align: center;">
                                <input type="checkbox" class="vc-row-checkbox" value="${idx}" onchange="window.VerificarConstrucaoApp.updateBtn()">
                            </td>
                            <td style="padding: 12px;">${r.cidade}</td>
                            <td style="padding: 12px;">${r.empreendimento}</td>
                            <td style="padding: 12px; font-weight: 600;">${r.unidade}</td>
                            <td style="padding: 12px; ${statusColor}">${r.status}</td>
                            <td style="padding: 12px;">${r.email}</td>
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
        document.getElementById('btn-solicitar-email').disabled = cbs.length === 0;
    },

    solicitarPorEmail() {
        if (!this.renderedRows) return;
        
        const cbs = document.querySelectorAll('.vc-row-checkbox:checked');
        const selected = Array.from(cbs).map(c => this.renderedRows[parseInt(c.value)]);
        
        if (selected.length === 0) return;
        
        // Group by email
        const byEmail = {};
        selected.forEach(r => {
            if (r.email === '-' || !r.email) return;
            if (!byEmail[r.email]) byEmail[r.email] = [];
            byEmail[r.email].push(r);
        });

        // The user asked: "ao selecionar os pendentes e clicar em 'Solicitar por e-mail', o e-mail deve ir para o Operador responsavel... EXATAMENTE NESSA LISTA DE DADOS PRECISAMOS PASSAR O SEGUINTE EM EXCEL CIDADE | EMPREENDIMENTO | UNIDADE"
        
        let sentCount = 0;
        
        // Here we can generate a mailto link or actually use a backend endpoint if available.
        // For simplicity and since we don't have a backend mailer in the script, we can open a mailto:
        // Or if there is an endpoint, use it. Since the instruction says "gerar relatorio excel por email", we can generate CSV and download or try to send.
        // For now we will generate CSV and trigger download, and show instructions.
        
        for (const [email, list] of Object.entries(byEmail)) {
            // Generate CSV
            let csv = 'CIDADE;EMPREENDIMENTO;UNIDADE\\n';
            list.forEach(item => {
                csv += `${item.cidade};${item.empreendimento};${item.unidade}\\n`;
            });
            
            // Create Blob and download
            const blob = new Blob(["\\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `solicitacao_vistoria_${email.split('@')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Open mail client
            const subject = encodeURIComponent("Solicitação de Vistorias Pendentes");
            const body = encodeURIComponent("Olá,\\n\\nSegue em anexo (planilha baixada no seu computador) a lista de unidades pendentes de vistoria sob sua responsabilidade.\\n\\nPor favor, atualize o sistema.\\n\\nObrigado.");
            window.open(`mailto:${email}?subject=${subject}&body=${body}`);
            
            sentCount++;
        }
        
        if (sentCount > 0) {
            alert("Foram baixadas " + sentCount + " planilha(s) CSV para anexar, e o cliente de email foi aberto com os destinatários.");
        } else {
            alert("Nenhum dos itens selecionados possui email de responsável válido configurado.");
        }
    }
};

window.addEventListener('menuChange', (e) => {
    if (e.detail && e.detail.id === 'verificar_construcao') {
        window.VerificarConstrucaoApp.init();
    }
});
