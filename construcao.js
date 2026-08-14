// Lógica para a aba de Construção e Histórico de Vistorias

window.ConstrucaoApp = {
    stages: ["Terraplanagem", "Fundação / Alicerce", "Alvenaria", "Cobertura", "Acabamento", "Concluído"],
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
        const q = query(
            collection(window.firebaseDb, "construction_checks"),
            where("customerId", "==", String(customerId)),
            where("contractId", "==", String(contractNumber))
        );
        
        const snapshot = await getDocs(q);
        const results = [];
        snapshot.forEach(doc => {
            results.push({ id: doc.id, ...doc.data() });
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
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666; background: #f8f9fa; border-radius: 8px;">Nenhuma vistoria registrada para este contrato.</div>';
        return;
    }

    let html = `
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
            <tr style="background-color: #f1f5f9; text-align: left; font-size: 0.85rem; color: #475569;">
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">DATA</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">RESPONSÁVEL</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">ESTÁGIO</th>
                <th style="padding: 12px; border-bottom: 2px solid #e2e8f0; text-align: center;">ANEXO</th>
            </tr>
        </thead>
        <tbody>
    `;

    checks.forEach(check => {
        // Date parse keeping local timezone to avoid off-by-one errors (if date was saved as YYYY-MM-DD)
        const dateStr = check.date.split('-').reverse().join('/');
        let fileLink = '-';
        if (check.fileUrl) {
            fileLink = `<a href="${check.fileUrl}" target="_blank" class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 0.75rem;"><i data-lucide="download" style="width:14px; height:14px; margin-right:4px;"></i> Ver Arquivo</a>`;
        }

        html += `
        <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: 12px; font-weight: 500; font-size: 0.9rem;">${dateStr}</td>
            <td style="padding: 12px; font-size: 0.9rem;">${check.responsible || '-'}</td>
            <td style="padding: 12px; font-size: 0.9rem;">
                <span style="background: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">
                    ${check.stage || '-'}
                </span>
            </td>
            <td style="padding: 12px; text-align: center;">${fileLink}</td>
        </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
    
    if (window.lucide) {
        lucide.createIcons();
    }
}

window.openNewConstrucaoModal = function() {
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

        const today = new Date().toISOString().split('T')[0];
        const responsible = window.ConstrucaoApp.getResponsibleOperator(contractObj);
        
        let stageOptions = window.ConstrucaoApp.stages.map(s => `<option value="${s}">${s}</option>`).join('');

        const modalHtml = `
        <div id="modal-nova-vistoria" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999; align-items: center; justify-content: center;">
            <div class="modal-box" style="background: white; padding: 25px; border-radius: 12px; width: 100%; max-width: 500px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                <h3 style="margin-top: 0; margin-bottom: 20px; color: #1e293b; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="plus-circle" style="width: 20px;"></i> Inserir Vistoria Manual
                </h3>
                
                <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Data da Vistoria</label>
                        <input type="date" id="vistoria-data" value="${today}" class="form-control" style="width: 100%;">
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Responsável</label>
                        <input type="text" id="vistoria-resp" value="${responsible}" class="form-control" style="width: 100%; background: #f1f5f9;">
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Estágio da Obra</label>
                    <select id="vistoria-stage" class="form-control" style="width: 100%;">
                        ${stageOptions}
                    </select>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Arquivo (Foto ou PDF)</label>
                    <input type="file" id="vistoria-file" accept="image/*,.pdf" class="form-control" style="width: 100%; padding: 8px;">
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
        alert("Erro ao abrir janela de vistoria. Verifique se há um contrato válido.");
    }
};

window.saveNovaVistoria = async function() {
    const btn = document.getElementById('btn-salvar-vistoria');
    const date = document.getElementById('vistoria-data').value;
    const responsible = document.getElementById('vistoria-resp').value;
    const stage = document.getElementById('vistoria-stage').value;
    const fileInput = document.getElementById('vistoria-file');

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

    let contractNumber = saleId;
    let companyId = "N/D";
    
    if (window.AnexosState && window.AnexosState.activeContract && (String(window.AnexosState.activeContract.id) === String(saleId) || String(window.AnexosState.activeContract.receivableBillId) === String(saleId))) {
        contractNumber = window.AnexosState.activeContract.contractNumber || window.AnexosState.activeContract.id || saleId;
        companyId = window.AnexosState.activeContract.companyId || companyId;
    } else if (typeof AppState !== 'undefined' && AppState.sales) {
        const saleObj = AppState.sales.find(s => String(s.id) === String(saleId) || String(s.receivableBillId) === String(saleId));
        if (saleObj) {
            contractNumber = saleObj.contractNumber || saleObj.id || saleId;
            companyId = saleObj.companyId || companyId;
        }
    }
    
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    try {
        let fileUrl = null;
        let fileName = null;
        
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const uploadRes = await window.ConstrucaoApp.uploadFile(file, customerId);
            fileUrl = uploadRes.url;
            fileName = uploadRes.name;
        }

        const { collection, addDoc } = window.firebaseCollections;
        const newCheck = {
            customerId: String(customerId),
            contractId: String(contractNumber),
            companyId: String(companyId),
            date: date,
            responsible: responsible,
            stage: stage,
            fileUrl: fileUrl,
            fileName: fileName,
            createdAt: new Date().toISOString()
        };

        await addDoc(collection(window.firebaseDb, "construction_checks"), newCheck);
        
        document.getElementById('modal-nova-vistoria').remove();
        alert("Vistoria salva com sucesso!");
        window.loadConstrucoes();

    } catch(e) {
        console.error("Erro ao salvar vistoria:", e);
        alert("Erro ao salvar vistoria: " + e.message);
        btn.disabled = false;
        btn.innerHTML = 'Salvar Vistoria';
    }
};

window.openConstrucaoSettingsModal = function() {
    const stagesText = window.ConstrucaoApp.stages.join('\\n');
    
    const modalHtml = `
    <div id="modal-settings-vistoria" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999; align-items: center; justify-content: center;">
        <div class="modal-box" style="background: white; padding: 25px; border-radius: 12px; width: 100%; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <h3 style="margin-top: 0; margin-bottom: 20px; color: #1e293b; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="settings" style="width: 20px;"></i> Estágios da Construção
            </h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 6px;">Adicione um estágio por linha:</label>
                <textarea id="settings-stages-text" rows="8" class="form-control" style="width: 100%; padding: 10px;">${stagesText}</textarea>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn btn-outline" onclick="document.getElementById('modal-settings-vistoria').remove()">Cancelar</button>
                <button type="button" class="btn btn-primary" onclick="window.saveConstrucaoSettings()">Salvar</button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (window.lucide) lucide.createIcons();
};

window.saveConstrucaoSettings = function() {
    const text = document.getElementById('settings-stages-text').value;
    const newStages = text.split('\\n').map(s => s.trim()).filter(s => s.length > 0);
    
    if (newStages.length === 0) {
        alert("É necessário ter pelo menos um estágio.");
        return;
    }

    window.ConstrucaoApp.saveStages(newStages).then(() => {
        document.getElementById('modal-settings-vistoria').remove();
    });
};

// Initialize after script load
setTimeout(() => {
    window.ConstrucaoApp.init();
}, 1500);
