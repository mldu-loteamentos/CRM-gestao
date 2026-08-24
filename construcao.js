// Lógica para a aba de Construção e Histórico de Vistorias

window.ConstrucaoApp = {
    stages: ['Sem construção', 'Terraplanagem', 'Alicerce', 'Apenas muro', 'Altura de laje', 'Telhado', 'Casa pronta sem acabamento', 'Casa pronta'],
    currentChecks: [],
    
    init() {
        this.loadStages();
    },

    async loadStages() {
        if (!window.firebaseDb || !window.firebaseCollections) return;
        try {
            const { doc, getDoc } = window.firebaseCollections;
            const ref = doc(window.firebaseDb, "config_stages", "construction");
            const snapshot = await getDoc(ref);
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.stages && data.stages.length > 0) {
                    this.stages = data.stages;
                }
            }
        } catch (e) {
            console.error("[Construção] Erro ao carregar estágios:", e);
        }
    },

    async saveStages(newStages) {
        if (!window.firebaseDb || !window.firebaseCollections) return;
        try {
            const { doc, setDoc } = window.firebaseCollections;
            const ref = doc(window.firebaseDb, "config_stages", "construction");
            await setDoc(ref, { stages: newStages });
            this.stages = newStages;
            alert("Estágios atualizados com sucesso!");
        } catch (e) {
            console.error("[Construção] Erro ao salvar estágios:", e);
            alert("Erro ao salvar estágios.");
        }
    },

    getResponsibleOperator(contract) {
        if (!contract) return "Não atribuído";
        
        let city = "";
        const ccId = String(contract.costCenterId || "");
        if (ccId === "14201" || (contract.costCenterName && contract.costCenterName.toUpperCase().includes("ARAÇARI"))) {
            city = "ARAÇARIGUAMA";
        } else if (contract.costCenterName && contract.costCenterName.includes('-')) {
            city = contract.costCenterName.split('-')[0].trim().toUpperCase();
        }

        const usersStr = localStorage.getItem('crm_users');
        if (!usersStr) return "Não atribuído";
        try {
            const users = JSON.parse(usersStr);
            for (const user of users) {
                if (user.check_construction) {
                    const hasCompany = user.const_companies && user.const_companies.includes(String(contract.companyId));
                    const hasCity = city && user.const_cities && user.const_cities.includes(city);
                    if (hasCompany || hasCity) {
                        return user.name;
                    }
                }
            }
        } catch(e) {}
        
        return "Não atribuído";
    },

    async uploadFile(file, customerId) {
        if (!window.firebaseStorage || !window.firebaseCollections) throw new Error("Firebase Storage não inicializado");
        
        // As functions do storage não foram expostas em firebaseCollections, vamos checar firebase-config.js
        // No firebase-config.js temos storageBucket importado, mas `uploadBytes` e `getDownloadURL` estão sendo exportados?
        // Vou carregar os imports dinamicamente caso as functions nao existam no window global
        let uploadBytesFunc = window.firebaseCollections.uploadBytes;
        let getDownloadURLFunc = window.firebaseCollections.getDownloadURL;
        let refFunc = window.firebaseCollections.ref;
        
        if (!uploadBytesFunc) {
            const storageMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js");
            uploadBytesFunc = storageMod.uploadBytes;
            getDownloadURLFunc = storageMod.getDownloadURL;
            refFunc = storageMod.ref;
        }

        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = refFunc(window.firebaseStorage, `construcoes/${customerId}/${fileName}`);
        
        await uploadBytesFunc(storageRef, file);
        const url = await getDownloadURLFunc(storageRef);
        return { url, name: file.name };
    }
};

window.loadConstrucoes = async function() {
    const container = document.getElementById('construcao-results');
    const loading = document.getElementById('construcao-loading');
    
    if (!container || !loading) return;
    
    container.style.display = 'none';
    loading.style.display = 'block';

    let customerId = typeof AppState !== 'undefined' ? AppState.selectedCustomerId : null;
    let saleId = typeof AppState !== 'undefined' ? AppState.selectedSaleId : null;

    if (!customerId && window.activeCustomerId) customerId = window.activeCustomerId;
    if (!customerId && window.AnexosState) customerId = window.AnexosState.idCliente;

    if (!saleId && window.AnexosState && window.AnexosState.activeContract) {
        saleId = window.AnexosState.activeContract.id;
    }
    if (!saleId && typeof AppState !== 'undefined' && AppState.sales && AppState.sales.length > 0) {
        saleId = AppState.sales[0].id;
    }
    
    if (!customerId || !saleId) {
        loading.innerHTML = 'Selecione um cliente e contrato primeiro.';
        return;
    }
    
    let contractNumber = saleId;
    let enterpriseId = "N/D";
    let unitId = "N/D";
    
    if (window.AnexosState && window.AnexosState.activeContract && (String(window.AnexosState.activeContract.id) === String(saleId) || String(window.AnexosState.activeContract.receivableBillId) === String(saleId))) {
        contractNumber = window.AnexosState.activeContract.contractNumber || window.AnexosState.activeContract.id || saleId;
        enterpriseId = window.AnexosState.activeContract.enterpriseId || window.AnexosState.activeContract.costCenterId || enterpriseId;
        unitId = window.AnexosState.activeContract.unitId || unitId;
    } else if (typeof AppState !== 'undefined' && AppState.sales) {
        const saleObj = AppState.sales.find(s => String(s.id) === String(saleId) || String(s.receivableBillId) === String(saleId));
        if (saleObj) {
            contractNumber = saleObj.contractNumber || saleObj.id || saleId;
            enterpriseId = saleObj.enterpriseId || saleObj.costCenterId || enterpriseId;
            unitId = saleObj.unitId || unitId;
        }
    }

    try {
        const { collection, query, where, getDocs } = window.firebaseCollections;
        const qStr = query(
            collection(window.firebaseDb, "construction_checks"),
            where("customerId", "==", String(customerId))
        );
        const qNum = query(
            collection(window.firebaseDb, "construction_checks"),
            where("customerId", "==", Number(customerId))
        );
        
        const [snapStr, snapNum] = await Promise.all([getDocs(qStr), getDocs(qNum)]);
        const snapshot = [];
        snapStr.forEach(d => snapshot.push(d));
        snapNum.forEach(d => {
            if (!snapshot.find(existing => existing.id === d.id)) snapshot.push(d);
        });
        
        const results = [];
        
        const validIds = new Set([String(contractNumber), String(saleId)]);
        if (window.AnexosState && window.AnexosState.activeContract) {
            if (window.AnexosState.activeContract.receivableBillId) validIds.add(String(window.AnexosState.activeContract.receivableBillId));
            if (window.AnexosState.activeContract.id) validIds.add(String(window.AnexosState.activeContract.id));
            if (window.AnexosState.activeContract.contractNumber) validIds.add(String(window.AnexosState.activeContract.contractNumber));
            if (window.AnexosState.activeContract.saleCode) validIds.add(String(window.AnexosState.activeContract.saleCode));
        }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            let matches = false;
            
            if (validIds.has(String(data.contractId))) matches = true;
            
            if (!matches && data.contractKeys && Array.isArray(data.contractKeys)) {
                for (let k of data.contractKeys) {
                    if (validIds.has(String(k))) {
                        matches = true;
                        break;
                    }
                }
            }
            
            // Se a vistoria foi salva sem contractId válido (ex: erro no webhook ou form), exibe para o cliente.
            if (!matches && (!data.contractId || data.contractId === "null" || data.contractId === "undefined" || String(data.contractId).trim() === "")) {
                matches = true;
            }
            
            if (matches) {
                results.push({ id: doc.id, ...data });
            }
        });
        
        results.sort((a, b) => new Date(b.date) - new Date(a.date));
        window.ConstrucaoApp.currentChecks = results;
        
        renderConstrucaoHistory(results);
    } catch(e) {
        console.error("Erro ao carregar vistorias:", e);
        loading.innerHTML = '<span style="color:red">Erro ao carregar histórico.</span>';
    }
};

function renderConstrucaoHistory(checks) {
    const container = document.getElementById('construcao-results');
    const loading = document.getElementById('construcao-loading');
    
    loading.style.display = 'none';
    container.style.display = 'block';
        if (checks.length === 0) {
          container.innerHTML = '<div style="display: flex; justify-content: center; align-items: center; min-height: 100px; padding: 20px; color: #666; background: #f8f9fa; border-radius: 8px;">Nenhuma vistoria registrada para este contrato.</div>';
          return;
      }

    let html = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
            <tr style="background-color: #f1f5f9; text-align: left; font-size: 0.85rem; color: #475569;">
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">DATA</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">RESPONSÁVEL</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">ESTÁGIO</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; width: 35%;">OBSERVAÇÕES</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: right;">AÇÕES</th>
            </tr>
        </thead>
        <tbody>
    `;

    checks.forEach(check => {
        const dateObj = new Date(check.date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('pt-BR');

        let fileLink = '-';
        if (check.fileUrl) {
            fileLink = `<button onclick="window.open('${check.fileUrl}', '_blank')" class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 0.75rem; margin-right: 4px;" title="Ver Anexo"><i data-lucide="image" style="width:14px; height:14px;"></i></button>`;
        }
        
        let obsBtn = '';
        const isAppVistoria = check.responsible === 'Vistoriador App' || check.responsible === '(15) 99811-8246' || (check.detailsText && check.detailsText.includes('Respostas do Cliente:')) || (check.observations && check.observations.includes('Respostas do Cliente:'));
        if (isAppVistoria) {
            obsBtn = `<button onclick="window.showVistoriaInfo('${check.id}')" class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 0.75rem; margin-right: 4px; color: #3b82f6; border-color: #bfdbfe;" title="Ver Detalhes"><i data-lucide="info" style="width:14px; height:14px;"></i></button>`;
        }
        
        const respName = check.responsible === 'Vistoriador App' ? '(15) 99811-8246' : (check.responsible || '-');
        const currentUser = window.AppState && window.AppState.currentUser;
        const isAdmin = !!(currentUser && (
            (currentUser.role && String(currentUser.role).toUpperCase().includes('ADMIN')) ||
            (currentUser.profile_name && String(currentUser.profile_name).toUpperCase().includes('ADMIN')) ||
            (currentUser.email && ['israel@mouraleite.com.br', 'admin@mouraleite.com.br'].includes(String(currentUser.email).toLowerCase()))
        ));
        const deleteBtn = !isAppVistoria || isAdmin
            ? `<button onclick="window.deleteNovaVistoria('${check.id}')" class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 0.75rem; color: #dc2626; border-color: #fecaca;" title="Excluir"><i data-lucide="trash" style="width:14px; height:14px;"></i></button>`
            : '<span style="color:#64748b; font-size:0.75rem;" title="Vistorias do aplicativo aprovadas só podem ser excluídas pelo administrador.">Protegida</span>';

        html += `
        <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: 12px; font-weight: 500; font-size: 0.9rem;">${dateStr}</td>
            <td style="padding: 12px; font-size: 0.9rem;">${respName}</td>
            <td style="padding: 12px; font-size: 0.9rem;">
                <span style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">
                    ${check.stage || '-'}
                </span>
            </td>
            <td style="padding: 12px; font-size: 0.8rem; color: #64748b; line-height: 1.3;">
                ${check.observations ? check.observations.replace(/\\n/g, '<br>') : '-'}
            </td>
            <td style="padding: 12px; text-align: right; white-space: nowrap;">
                ${obsBtn}
                ${fileLink}
                <button onclick="window.editNovaVistoria('${check.id}')" class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 0.75rem; margin-right: 4px;" title="Editar"><i data-lucide="edit" style="width:14px; height:14px;"></i></button>
                ${deleteBtn}
            </td>
        </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
    
    if (window.lucide) {
        lucide.createIcons();
    }
}

window.showVistoriaInfo = function(id) {
    const check = window.ConstrucaoApp.currentChecks.find(c => c.id === id);
    if (!check) return;
    
    let text = check.detailsText || check.observations || "Nenhuma informação adicional.";
    
    let hasCards = false;
    let cardsHtml = '';
    
    if (text.includes("Respostas do Cliente:") || text.includes("Possui Água:")) {
        const extract = (key) => {
            const regex = new RegExp(`- ${key}:\\s*(.*?)(?:\\n|$)`, 'i');
            const match = text.match(regex);
            return match ? match[1].trim().toLowerCase() : null;
        };
        
        const agua = extract("Possui Água");
        const energia = extract("Possui Energia");
        const entulho = extract("Possui Entulho");
        const acesso = extract("Permite Acesso");
        const estagio = extract("Estágio da Obra");
        
        if (agua || energia || entulho || acesso || estagio) {
            hasCards = true;
            const renderCard = (title, val, icon, color) => {
                if (!val) return '';
                const isSim = val === 'sim';
                return `
                <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; min-width: 120px;">
                    <div style="color: #64748b; font-size: 0.8rem; font-weight: 600; margin-bottom: 8px; display:flex; align-items:center;"><i data-lucide="${icon}" style="width: 14px; margin-right: 4px; color: ${color};"></i> ${title}</div>
                    <div style="${isSim ? 'color: #16a34a;' : 'color: #dc2626;'} font-weight: bold; font-size: 1.1rem;">
                        ${isSim ? '✓ Sim' : '✗ Não'}
                    </div>
                </div>`;
            };
            
            cardsHtml = `
            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 15px 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="clipboard-list" style="width: 18px; color: #f97316;"></i> Respostas do Questionário
                </h4>
                <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                    ${renderCard('ÁGUA', agua, 'droplet', '#3b82f6')}
                    ${renderCard('ENERGIA', energia, 'zap', '#eab308')}
                    ${renderCard('ENTULHO', entulho, 'trash-2', '#f97316')}
                    ${renderCard('ACESSO', acesso, 'door-open', '#8b5cf6')}
                </div>
                ${estagio ? `
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="color: #64748b; font-size: 0.85rem; font-weight: 600; display:flex; align-items:center;"><i data-lucide="hammer" style="width: 16px; margin-right: 6px; color: #10b981;"></i> ESTÁGIO DA OBRA</div>
                    <div style="font-weight: bold; font-size: 1.1rem; color: #10b981; text-transform: uppercase;">${estagio.replace(/_/g, ' ')}</div>
                </div>` : ''}
            </div>`;
            
            text = text.replace(/Respostas do Cliente:\n/g, '')
                       .replace(/- Possui Água:.*?\n/g, '')
                       .replace(/- Possui Energia:.*?\n/g, '')
                       .replace(/- Possui Entulho:.*?\n/g, '')
                       .replace(/- Permite Acesso:.*?\n/g, '')
                       .replace(/- Estágio da Obra:.*?(?:\n|$)/g, '');
        }
    }
    
    text = text.trim();
    let textHtml = '';
    if (text && text !== '-') {
        textHtml = `
        <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
            <strong style="display:block; margin-bottom: 8px; color: #475569; font-size: 0.9rem;">Observações Adicionais:</strong>
            ${text.replace(/\n/g, '<br>')}
        </div>`;
    }
    
    let imgHtml = '';
    if (check.fileUrl) {
        imgHtml = `
        <div style="margin-top: 20px;">
            <h4 style="margin: 0 0 15px 0; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="camera" style="width: 18px; color: #64748b;"></i> Fotos Recebidas
            </h4>
            <div style="display: flex; gap: 15px;">
                <div style="position: relative; width: 220px; height: 220px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; cursor: pointer; background: #000;" onclick="window.open('${check.fileUrl}', '_blank')" title="Clique para ampliar">
                    <img src="${check.fileUrl}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.9; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.9'">
                    <div style="position: absolute; bottom: 0; left: 0; width: 100%; background: rgba(0,0,0,0.6); color: white; padding: 6px; text-align: center; font-size: 0.8rem; font-weight: bold;">Foto da Vistoria</div>
                </div>
            </div>
        </div>`;
    }

    const modalHtml = `
    <div id="modal-vistoria-info" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.55); z-index: 100000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);">
        <div style="background: white; border-radius: 12px; width: 800px; max-width: 95%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); max-height: 90vh; display: flex; flex-direction: column; animation: modalIn 0.2s ease-out;">
            <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #166534; color: white; border-radius: 12px 12px 0 0;">
                <h3 style="margin: 0; font-size: 1.15rem; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="check-circle" style="width: 20px;"></i> Detalhes da Vistoria
                </h3>
                <button onclick="document.body.removeChild(document.getElementById('modal-vistoria-info'))" style="background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.8); font-size: 1.2rem;">✕</button>
            </div>
            <div style="padding: 24px; overflow-y: auto; color: #334155; font-size: 0.95rem; line-height: 1.6;">
                ${cardsHtml}
                ${textHtml}
                ${imgHtml}
            </div>
        </div>
    </div>
    <style>@keyframes modalIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }</style>
    `;
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div.firstElementChild);
    if(window.lucide) lucide.createIcons();
};

window.openNewConstrucaoModal = function(editId = null) {
    try {
        let customerId = typeof AppState !== 'undefined' ? AppState.selectedCustomerId : null;
        let saleId = typeof AppState !== 'undefined' ? AppState.selectedSaleId : null;

        if (!customerId && window.activeCustomerId) customerId = window.activeCustomerId;
        if (!customerId && window.AnexosState) customerId = window.AnexosState.idCliente;

        if (!saleId && window.AnexosState && window.AnexosState.activeContract) {
            saleId = window.AnexosState.activeContract.id;
        }
        if (!saleId && typeof AppState !== 'undefined' && AppState.sales && AppState.sales.length > 0) {
            saleId = AppState.sales[0].id;
        }
        
        if (!customerId || !saleId) {
            alert("Por favor, selecione um cliente e um contrato na aba Contrato de Venda primeiro.");
            return;
        }

        let contractObj = { customerName: "Cliente" };
        if (window.AnexosState && window.AnexosState.activeContract && (String(window.AnexosState.activeContract.id) === String(saleId) || String(window.AnexosState.activeContract.receivableBillId) === String(saleId))) {
            contractObj = window.AnexosState.activeContract;
        } else if (typeof AppState !== 'undefined' && AppState.sales) {
            const saleObj = AppState.sales.find(s => String(s.id) === String(saleId) || String(s.receivableBillId) === String(saleId));
            if (saleObj) contractObj = saleObj;
        }

        let editCheck = null;
        if (editId) {
            editCheck = window.ConstrucaoApp.currentChecks.find(c => c.id === editId);
        }

        const responsible = window.ConstrucaoApp.getResponsibleOperator(contractObj);
        
        const defaultDate = editCheck ? editCheck.date : new Date().toISOString().split('T')[0];
        const defaultResp = editCheck ? (editCheck.responsible || responsible) : responsible;
        const defaultObs = editCheck ? (editCheck.observations || '') : '';
        const defaultStage = editCheck ? editCheck.stage : '';

        let stageOptions = window.ConstrucaoApp.stages.map(s => `<option value="${s}" ${s === defaultStage ? 'selected' : ''}>${s}</option>`).join('');

        const modalHtml = `
        <div id="modal-nova-vistoria" class="modal-overlay active" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999; align-items: center; justify-content: center; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;">
            <div class="modal-box" style="background: white; padding: 25px; border-radius: 12px; width: 100%; max-width: 750px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                <h3 style="margin-top: 0; margin-bottom: 20px; color: #1e293b; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="${editCheck ? 'edit' : 'plus-circle'}" style="width: 20px;"></i> ${editCheck ? 'Editar Vistoria Manual' : 'Inserir Vistoria Manual'}
                </h3>
                
                <input type="hidden" id="vistoria-edit-id" value="${editCheck ? editCheck.id : ''}">
                
                <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Data da Vistoria</label>
                        <input type="date" id="vistoria-data" value="${defaultDate}" max="${new Date().toISOString().split('T')[0]}" class="form-control" style="width: 100%;">
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Responsável</label>
                        <input type="text" id="vistoria-resp" value="${defaultResp}" class="form-control" style="width: 100%; background: #f1f5f9;">
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Estágio da Obra</label>
                        <select id="vistoria-stage" class="form-control" style="width: 100%;">
                            <option value="">Selecione...</option>
                            ${stageOptions}
                        </select>
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Observações</label>
                    <textarea id="vistoria-obs" class="form-control" rows="3" style="width: 100%; padding: 8px;">${defaultObs}</textarea>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Arquivo (Foto ou PDF) ${editCheck && editCheck.fileUrl ? '- <i>(Deixe em branco para manter a foto atual)</i>' : ''}</label>
                    <input type="file" id="vistoria-file" accept="image/*,.pdf" class="form-control" style="width: 100%; padding: 8px;">
                </div>

                <div style="margin-bottom: 20px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <strong style="display: block; color: #1e293b; font-size: 0.9rem;">Enviar para o Sienge</strong>
                        <span style="color: #64748b; font-size: 0.8rem;">Anexar a foto selecionada ao contrato no Sienge</span>
                    </div>
                    <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
                        <input type="checkbox" id="vistoria-send-sienge" style="opacity: 0; width: 0; height: 0; position: absolute;" onchange="document.getElementById('send-sienge-track').style.backgroundColor = this.checked ? '#16a34a' : '#cbd5e1'; document.getElementById('send-sienge-thumb').style.transform = this.checked ? 'translateX(20px)' : 'translateX(0)';">
                        <span id="send-sienge-track" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .4s; border-radius: 24px; pointer-events: none;"></span>
                        <span id="send-sienge-thumb" style="position: absolute; height: 20px; width: 20px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.3); pointer-events: none; transform: translateX(0);"></span>
                    </label>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" class="btn btn-outline" onclick="document.getElementById('modal-nova-vistoria').remove()">Cancelar</button>
                    <button type="button" class="btn btn-primary" onclick="window.saveNovaVistoria()" id="btn-salvar-vistoria">Salvar Vistoria</button>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) lucide.createIcons();
    } catch(err) {
        console.error("Erro ao abrir modal:", err);
        alert("ERRO AO ABRIR JANELA DE VISTORIA:\n\n" + err.message + "\n\nStack:\n" + err.stack);
    }
};

window.solicitarWhatsAppFromClient = async function() {
    let customerId = typeof AppState !== 'undefined' ? AppState.selectedCustomerId : null;
    let saleId = typeof AppState !== 'undefined' ? AppState.selectedSaleId : null;
    if (!customerId && window.activeCustomerId) customerId = window.activeCustomerId;
    if (!customerId && window.AnexosState) customerId = window.AnexosState.idCliente;
    
    let saleObj = null;
    if (typeof AppState !== 'undefined' && AppState.sales) {
        saleObj = AppState.sales.find(s => String(s.id) === String(saleId) || String(s.receivableBillId) === String(saleId));
        if (!saleObj && window.AnexosState && window.AnexosState.activeContract) {
            saleObj = AppState.sales.find(s => String(s.saleId || s.contractId || s.id) === String(window.AnexosState.activeContract.id));
        }
        if (!saleObj && AppState.sales.length > 0) saleObj = AppState.sales[0];
    }
    
    let contractObj = { ...(saleObj || {}) };
    if (window.AnexosState && window.AnexosState.activeContract) {
        contractObj = { ...contractObj, ...window.AnexosState.activeContract };
    }

    if (!contractObj || Object.keys(contractObj).length === 0) {
        alert("Nenhum contrato ativo encontrado para solicitar vistoria.");
        return;
    }

    let ccName = contractObj.costCenterName || '';
    const empIdStr = String(contractObj.enterpriseId || contractObj.costCenterId || (contractObj.property && contractObj.property.costCenterId) || contractObj.unitId?.split('-')[1] || '');
    if (!ccName && typeof AppState !== 'undefined' && AppState.cachedCostCenters && empIdStr) {
        const ccObj = AppState.cachedCostCenters.find(cc => String(cc.id) === empIdStr);
        if (ccObj) ccName = ccObj.name || '';
    }

    let extractedCity = 'Cidade N/D';
    let extractedEmp = contractObj.enterpriseName || empIdStr || 'Empreendimento N/D';
    
    if (ccName) {
        if (ccName.includes('-')) {
            extractedCity = ccName.split('-')[0].trim();
            extractedEmp = ccName.substring(ccName.indexOf('-') + 1).trim();
        } else {
            extractedCity = ccName;
            extractedEmp = ccName;
        }
    }
    
    let unitStr = (contractObj.unitName || contractObj.unityName || contractObj.units || contractObj.unit || contractObj.unitIdentifier || contractObj.unidade || '').replace('Quadra-Lote: ', '').trim();
    if (!unitStr && contractObj.property && contractObj.property.unitName) unitStr = contractObj.property.unitName;
    if (!unitStr && contractObj.block && contractObj.lot) {
        unitStr = `${contractObj.block}-${contractObj.lot}`;
    }
    if (!unitStr) unitStr = 'Unidade N/D';

    const contractNumber = contractObj.saleCode || contractObj.contractCode || contractObj.contractNumber || contractObj.id || saleId;
    const companyId = contractObj.companyId || '';
    const empreendimento = extractedEmp;
    const unidade = unitStr;
    const clienteName = contractObj.customerName || 'Cliente';
    const cidade = extractedCity;
    const tituloKey = contractObj.receivableBillId || '';

    try {
        const btn = document.getElementById('btn-solicitar-wpp-client');
        if (btn) btn.disabled = true;

        const { collection, addDoc, query, where, getDocs, updateDoc, doc } = window.firebaseCollections;
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        
        let vId = null;
        const q = query(collection(window.firebaseDb, 'vistorias'), where("contractId", "==", String(contractNumber)), where("status", "==", "aguardando_fotos"));
        const snap = await getDocs(q);
        if (!snap.empty) {
            vId = snap.docs[0].id;
        }

        const allKeys = new Set([
            String(contractNumber),
            String(saleId)
        ]);
        if (contractObj) {
            if (contractObj.receivableBillId) allKeys.add(String(contractObj.receivableBillId));
            if (contractObj.id) allKeys.add(String(contractObj.id));
            if (contractObj.saleCode) allKeys.add(String(contractObj.saleCode));
        }

        const newData = {
            customerId: String(customerId),
            contractId: String(contractNumber),
            contractKeys: Array.from(allKeys),
            companyId: String(companyId),
            empreendimento: empreendimento,
            unidade: unidade,
            clienteName: clienteName,
            cidade: cidade,
            tituloKey: String(tituloKey),
            status: 'aguardando_fotos',
            createdAt: new Date().toISOString()
        };

        if (!vId) {
            const docRef = await addDoc(collection(window.firebaseDb, 'vistorias'), newData);
            vId = docRef.id;
        } else {
            await updateDoc(doc(window.firebaseDb, 'vistorias', vId), { updatedAt: new Date().toISOString() });
        }

        const url = `${baseUrl}vistoria.html?ids=${vId}`;
        
        const hour = new Date().getHours();
        let greeting = 'Bom dia';
        if (hour >= 12 && hour < 18) greeting = 'Boa tarde';
        else if (hour >= 18) greeting = 'Boa noite';

        const message = `${greeting}! Segue a lista de vistorias a serem realizadas na cidade:\n\n*${cidade.toUpperCase()}*\n· ${empreendimento.toUpperCase()} (1 lote)\n\nAcesse o link abaixo para realizar a(s) vistoria(s):\n${url}`;
        
        const phone = '5515998118246'; // Default phone
        window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`, '_blank');
        
        if (btn) btn.disabled = false;

    } catch (e) {
        console.error("Erro ao solicitar vistoria via Wpp:", e);
        alert("Erro ao solicitar vistoria: " + e.message);
        const btn = document.getElementById('btn-solicitar-wpp-client');
        if (btn) btn.disabled = false;
    }
};

window.saveNovaVistoria = async function() {
    const btn = document.getElementById('btn-salvar-vistoria');
    const date = document.getElementById('vistoria-data').value;
    const responsible = document.getElementById('vistoria-resp').value;
    const stage = document.getElementById('vistoria-stage').value;
    const obs = document.getElementById('vistoria-obs').value;
    const fileInput = document.getElementById('vistoria-file');
    const editId = document.getElementById('vistoria-edit-id').value;

    if (!date || !stage) {
        alert("Preencha a data e o estágio.");
        return;
    }

    let customerId = typeof AppState !== 'undefined' ? AppState.selectedCustomerId : null;
    let saleId = typeof AppState !== 'undefined' ? AppState.selectedSaleId : null;

    if (!customerId && window.activeCustomerId) customerId = window.activeCustomerId;
    if (!customerId && window.AnexosState) customerId = window.AnexosState.idCliente;

    if (!saleId && window.AnexosState && window.AnexosState.activeContract) {
        saleId = window.AnexosState.activeContract.id;
    }
    if (!saleId && typeof AppState !== 'undefined' && AppState.sales && AppState.sales.length > 0) {
        saleId = AppState.sales[0].id;
    }

    if (!customerId || !saleId) {
        alert("Cliente ou Contrato não identificados.");
        return;
    }

    let saleObj = null;
    if (typeof AppState !== 'undefined' && AppState.sales) {
        saleObj = AppState.sales.find(s => String(s.id) === String(saleId) || String(s.receivableBillId) === String(saleId));
        if (!saleObj && window.AnexosState && window.AnexosState.activeContract) {
            saleObj = AppState.sales.find(s => String(s.saleId || s.contractId || s.id) === String(window.AnexosState.activeContract.id));
        }
        if (!saleObj && AppState.sales.length > 0) saleObj = AppState.sales[0];
    }
    
    let contractObj = { ...(saleObj || {}) };
    if (window.AnexosState && window.AnexosState.activeContract) {
        contractObj = { ...contractObj, ...window.AnexosState.activeContract };
    }
    
    let contractNumber = contractObj.saleCode || contractObj.contractCode || contractObj.contractNumber || contractObj.id || saleId;
    let companyId = contractObj.companyId || "N/D";
    
    btn.disabled = true;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; animation: vc-spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg><style>@keyframes vc-spin { 100% { transform: rotate(360deg); } }</style> Salvando...';

    try {
        let fileUrl = null;
        let fileName = null;
        const sendToSienge = document.getElementById('vistoria-send-sienge') && document.getElementById('vistoria-send-sienge').checked;
        
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const uploadRes = await window.ConstrucaoApp.uploadFile(file, customerId);
            fileUrl = uploadRes.url;
            fileName = uploadRes.name;
        } else if (editId) {
            const editCheck = window.ConstrucaoApp.currentChecks.find(c => c.id === editId);
            if (editCheck) {
                fileUrl = editCheck.fileUrl;
                fileName = editCheck.fileName;
            }
        }
        
        if (sendToSienge && fileInput.files.length > 0) {
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; animation: vc-spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> Enviando ao Sienge...';
            const costCenterId = contractObj.enterpriseId || contractObj.costCenterId || (contractObj.property && contractObj.property.costCenterId) || contractObj.unitId?.split('-')[1];
            let unitNameNorm = (contractObj.unitName || contractObj.unityName || contractObj.units || contractObj.unit || contractObj.unitIdentifier || contractObj.unidade || '').replace('Quadra-Lote: ', '').trim().toUpperCase();
            if (!unitNameNorm && contractObj.property && contractObj.property.unitName) unitNameNorm = contractObj.property.unitName.toUpperCase();
            
            if (costCenterId && unitNameNorm) {
                const authHeader = typeof getBasicAuthHeader === 'function' ? getBasicAuthHeader() : '';

                let siengeUnitId = null;
                let offset = 0;
                let found = false;
                while (!found && offset < 1000) {
                    const uRes = await fetch(`/api/sienge-proxy/units?limit=200&offset=${offset}&enterpriseId=${costCenterId}&additionalData=NONE`, { headers: { 'Authorization': authHeader } });
                    if (!uRes.ok) break;
                    const uData = await uRes.json();
                    const uResults = uData.results || [];
                    const match = uResults.find(u => (u.name || '').trim().toUpperCase() === unitNameNorm || (u.name || '').trim().replace(/[\s-]+/g, '').toUpperCase() === unitNameNorm.replace(/[\s-]+/g, ''));
                    if (match) { siengeUnitId = match.id; found = true; }
                    else if (uResults.length < 200) break;
                    else offset += 200;
                }
                
                if (siengeUnitId) {
                    const dateObj = new Date();
                    const dateStrFileName = dateObj.toLocaleDateString('pt-BR').replace(/\//g, '-');
                    const dateStrDesc = dateObj.toLocaleDateString('pt-BR').split('/').reverse().join('.');
                    const baseName = `${costCenterId} ${unitNameNorm} - FOTO VISTORIA MANUAL - ${dateStrFileName}`.toUpperCase();
                    const nomeFinal = `${baseName}.jpg`;
                    const descricaoSienge = `${dateStrDesc} - FOTO DE VISTORIA MANUAL`;
                    
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
                        xhr.onload = () => resolve(xhr.responseText);
                        xhr.onerror = () => resolve(null);
                        const formData = new FormData();
                        formData.append('file', fileInput.files[0], nomeFinal);
                        xhr.send(formData);
                    });
                }
            }
        }

        const { collection, addDoc, doc, updateDoc } = window.firebaseCollections;
        const allKeys = new Set([
            String(contractNumber),
            String(saleId)
        ]);
        if (contractObj) {
            if (contractObj.receivableBillId) allKeys.add(String(contractObj.receivableBillId));
            if (contractObj.id) allKeys.add(String(contractObj.id));
        }

        const checkData = {
            customerId: String(customerId),
            contractId: String(contractNumber),
            contractKeys: Array.from(allKeys),
            companyId: String(companyId),
            date: date,
            responsible: responsible,
            stage: stage,
            observations: obs,
            fileUrl: fileUrl,
            fileName: fileName,
            updatedAt: new Date().toISOString()
        };

        if (editId) {
            await updateDoc(doc(window.firebaseDb, "construction_checks", editId), checkData);
        } else {
            checkData.createdAt = new Date().toISOString();
            await addDoc(collection(window.firebaseDb, "construction_checks"), checkData);
        }
        
        document.getElementById('modal-nova-vistoria').remove();
        window.loadConstrucoes();

    } catch(e) {
        console.error("Erro ao salvar vistoria:", e);
        alert("ERRO AO SALVAR VISTORIA:\n\n" + e.message + "\n\nStack:\n" + e.stack);
        btn.disabled = false;
        btn.innerHTML = 'Salvar Vistoria';
    }
};

window.editNovaVistoria = function(id) {
    window.openNewConstrucaoModal(id);
};

window.deleteNovaVistoria = async function(id) {
    const modalHtml = `
    <div id="modal-delete-vistoria" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);">
        <div style="background: white; border-radius: 12px; width: 380px; max-width: 90%; padding: 30px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); text-align: center; animation: modalIn 0.2s ease-out;">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: #fee2e2; color: #ef4444; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                <i data-lucide="alert-triangle" style="width: 32px; height: 32px;"></i>
            </div>
            <h3 style="margin: 0 0 12px; font-size: 1.25rem; font-weight: 700; color: #0f1e29;">Excluir Vistoria</h3>
            <p style="margin: 0 0 24px; font-size: 0.95rem; color: #64748b; line-height: 1.5;">Tem certeza que deseja excluir esta vistoria? Esta ação não poderá ser desfeita.</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="btn-cancel-del" style="flex: 1; padding: 10px 16px; border: 1px solid #cbd5e1; background: #fff; color: #475569; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: background 0.2s;">Cancelar</button>
                <button id="btn-confirm-del" style="flex: 1; padding: 10px 16px; border: none; background: #ef4444; color: #fff; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: background 0.2s;">Sim, excluir</button>
            </div>
        </div>
    </div>
    <style>@keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }</style>
    `;
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);
    if(window.lucide) lucide.createIcons();

    document.getElementById('btn-cancel-del').onclick = () => {
        document.body.removeChild(div);
    };

    document.getElementById('btn-confirm-del').onclick = async () => {
        document.body.removeChild(div);
        try {
            const { doc, deleteDoc } = window.firebaseCollections;
            const check = window.ConstrucaoApp.currentChecks.find(c => c.id === id);
            if (!check) return;

            const isAppVistoria = check.responsible === 'Vistoriador App' || check.responsible === '(15) 99811-8246' || (check.detailsText && check.detailsText.includes('Respostas do Cliente:')) || (check.observations && check.observations.includes('Respostas do Cliente:'));
            const currentUser = window.AppState && window.AppState.currentUser;
            const isAdmin = !!(currentUser && (
                (currentUser.role && String(currentUser.role).toUpperCase().includes('ADMIN')) ||
                (currentUser.profile_name && String(currentUser.profile_name).toUpperCase().includes('ADMIN')) ||
                (currentUser.email && ['israel@mouraleite.com.br', 'admin@mouraleite.com.br'].includes(String(currentUser.email).toLowerCase()))
            ));
            if (isAppVistoria && !isAdmin) {
                alert('Vistorias realizadas pelo aplicativo só podem ser excluídas pelo administrador.');
                return;
            }
            
            await deleteDoc(doc(window.firebaseDb, "construction_checks", id));
            window.loadConstrucoes();
        } catch(err) {
            console.error("Erro ao excluir vistoria:", err);
            alert("Erro ao excluir vistoria: " + err.message);
        }
    };
};

// Initialize after script load
setTimeout(() => {
    window.ConstrucaoApp.init();
}, 500);
