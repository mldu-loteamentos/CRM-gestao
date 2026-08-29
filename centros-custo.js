const CentrosCustoState = {
  costCenters: [],
  companies: [],
  customFields: {},
  loading: false,
  selectedFilterIds: [], // IDs of cost centers to show (empty = show all)
  tiposCc: [
    'Loteamento Aberto', 'Loteamento Fechado', 'Frota', 
    'Corporativo', 'Diretoria', 'Sócios', 'Contrapartida'
  ]
};

const CentrosCustoApp = {
  async loadData(forceRefresh = false) {
    CentrosCustoState.loading = true;
    this.render();

    try {
      const host = (window.location.hostname === "" || window.location.hostname === "127.0.0.1") ? "localhost" : window.location.hostname;
      const port = 3000;
      
      const localCustom = localStorage.getItem('crm_centros_custo_custom');
      if (localCustom) {
        try {
          CentrosCustoState.customFields = JSON.parse(localCustom);
        } catch(e) { console.error("Erro ao ler customFields", e); }
      }

      const localTipos = localStorage.getItem('crm_centros_custo_tipos');
      if (localTipos) {
        try {
          CentrosCustoState.tiposCc = JSON.parse(localTipos);
        } catch(e) {}
      }

      // Fetch Cost Centers
      let ccList = await SiengeApiService.getCostCenters(forceRefresh);
      ccList.sort((a, b) => a.id - b.id);
      CentrosCustoState.costCenters = ccList;
      
      let customFieldsChanged = false;
      ccList.forEach(cc => {
          const idStr = String(cc.id);
          if (!CentrosCustoState.customFields[cc.id]) {
              CentrosCustoState.customFields[cc.id] = { cc_id: cc.id };
          }
          
          const custom = CentrosCustoState.customFields[cc.id];
          
          if (!custom.tipo_cc) {
              if (idStr.startsWith('1')) {
                  custom.tipo_cc = 'Loteamento Aberto';
                  custom.imposto_pago_empresa = true;
                  custom.perc_ml = 100;
                  custom.perc_terrenista = 0;
                  customFieldsChanged = true;
              } else if (idStr.startsWith('6') || idStr.startsWith('7') || idStr.startsWith('9')) {
                  custom.tipo_cc = 'Corporativo';
                  custom.perc_ml = 100;
                  customFieldsChanged = true;
              }
          }
      });
      
      if (customFieldsChanged) {
          localStorage.setItem('crm_centros_custo_custom', JSON.stringify(CentrosCustoState.customFields));
      }
      
      // Load companies
      CentrosCustoState.companies = await SiengeApiService.getCompanies();

    } catch (e) {
      console.error(e);
      alert("Erro ao carregar centros de custo: " + e.message);
    } finally {
      CentrosCustoState.loading = false;
      this.render();
    }
  },

  addFilter(id) {
    if (!CentrosCustoState.selectedFilterIds.includes(id)) {
        CentrosCustoState.selectedFilterIds.push(id);
        this.render();
    }
  },

  removeFilter(id) {
    CentrosCustoState.selectedFilterIds = CentrosCustoState.selectedFilterIds.filter(fid => fid !== id);
    this.render();
  },

  saveCustom(id) {
    const custom = CentrosCustoState.customFields[id] || { cc_id: id };
    
    custom.valor_vgv = parseFloat(document.getElementById(`edit-vgv-${id}`).value) || 0;
    custom.perc_ml = parseFloat(document.getElementById(`edit-perc-ml-${id}`).value) || 0;
    custom.perc_terrenista = parseFloat(document.getElementById(`edit-perc-terrenista-${id}`).value) || 0;
    const tipoCcEl = document.getElementById(`edit-tipo-cc-${id}`);
    if (tipoCcEl) custom.tipo_cc = tipoCcEl.value;

    const impostoPagoEl = document.getElementById(`edit-imposto-pago-${id}`);
    if (impostoPagoEl) custom.imposto_pago_empresa = impostoPagoEl.checked;

    const suspensivaAtivaEl = document.getElementById(`edit-suspensiva-ativa-${id}`);
    if (suspensivaAtivaEl) custom.clausula_suspensiva_ativa = suspensivaAtivaEl.checked;

    const suspensivaDiasEl = document.getElementById(`edit-suspensiva-dias-${id}`);
    if (suspensivaDiasEl) custom.clausula_suspensiva_dias = parseInt(suspensivaDiasEl.value) || 30;

    CentrosCustoState.customFields[id] = custom;
    localStorage.setItem('crm_centros_custo_custom', JSON.stringify(CentrosCustoState.customFields));
    
    this.closeModal();
    this.render();
  },

  openEditModal(id) {
    const cc = CentrosCustoState.costCenters.find(c => c.id === id);
    if (!cc) return;
    
    const custom = CentrosCustoState.customFields[id] || {};
    const vgv = custom.valor_vgv || 0;
    const preambulo = custom.preambulo_id || '';
    const perc_ml = custom.perc_ml || 0;
    const perc_terrenista = custom.perc_terrenista || 0;
    const tipo_cc = custom.tipo_cc || '';
    const imposto_pago = custom.imposto_pago_empresa === true;
    const suspensiva_ativa = custom.clausula_suspensiva_ativa === true;
    const suspensiva_dias = custom.clausula_suspensiva_dias || 30;

    const modalHtml = `
      <div id="cc-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; justify-content: center; align-items: center;">
        <div style="background: white; border-radius: 8px; width: 700px; max-width: 95%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: flex; flex-direction: column;">
          <div style="padding: 16px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 1.1rem; color: var(--color-primary);">Editar Centro de Custo: ${cc.id} - ${cc.name}</h3>
            <button onclick="CentrosCustoApp.closeModal()" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: #999;">&times;</button>
          </div>
          <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <div>
                <label style="display: block; font-weight: bold; margin-bottom: 5px; font-size: 0.85rem;">Valor VGV (R$)</label>
                <input type="number" id="edit-vgv-${id}" class="form-control" step="0.01" value="${vgv}">
              </div>
              <div>
                <label style="display: block; font-weight: bold; margin-bottom: 5px; font-size: 0.85rem;">Tipo de Centro de Custo</label>
                <div style="display: flex; gap: 8px;">
                  <select id="edit-tipo-cc-${id}" class="form-control" style="flex: 1;">
                    <option value="">Selecione...</option>
                    ${CentrosCustoState.tiposCc.map(t => `<option value="${t}" ${tipo_cc === t ? 'selected' : ''}>${t}</option>`).join('')}
                  </select>
                  <button class="btn btn-outline" style="padding: 0 10px;" onclick="CentrosCustoApp.openManageTiposModal(${id})" title="Gerenciar Tipos">
                    <i data-lucide="settings" style="width: 16px;"></i>
                  </button>
                </div>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                  <label style="display: block; font-weight: bold; margin-bottom: 5px; font-size: 0.85rem;">Percentual Moura Leite (%)</label>
                  <input type="number" id="edit-perc-ml-${id}" class="form-control" step="0.01" value="${perc_ml}">
                </div>
                <div>
                  <label style="display: block; font-weight: bold; margin-bottom: 5px; font-size: 0.85rem;">Percentual Terrenista (%)</label>
                  <input type="number" id="edit-perc-terrenista-${id}" class="form-control" step="0.01" value="${perc_terrenista}">
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="edit-imposto-pago-${id}" ${imposto_pago ? 'checked' : ''} style="width: 16px; height: 16px;">
                <label for="edit-imposto-pago-${id}" style="font-weight: bold; font-size: 0.85rem; cursor: pointer;">Imposto pago pela empresa?</label>
            </div>
            
            <hr style="border: 0; border-top: 1px solid #eee; margin: 5px 0;">
            <h4 style="margin: 0; color: #334155; font-size: 0.95rem;">Automações de Cobrança</h4>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="edit-suspensiva-ativa-${id}" ${suspensiva_ativa ? 'checked' : ''} style="width: 16px; height: 16px;" onchange="document.getElementById('edit-suspensiva-dias-${id}').disabled = !this.checked">
                    <label for="edit-suspensiva-ativa-${id}" style="font-weight: bold; font-size: 0.85rem; cursor: pointer; color: #b91c1c;">Habilitar Termo de Cláusula Suspensiva (Sinal)</label>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label for="edit-suspensiva-dias-${id}" style="font-size: 0.85rem; color: #64748b;">Dias pós-vencimento:</label>
                    <input type="number" id="edit-suspensiva-dias-${id}" class="form-control" style="width: 70px; padding: 4px;" value="${suspensiva_dias}" ${!suspensiva_ativa ? 'disabled' : ''}>
                </div>
            </div>
          </div>
          <div style="padding: 16px 20px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
            <button class="btn btn-cancel" onclick="CentrosCustoApp.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="CentrosCustoApp.saveCustom(${id})"><i data-lucide="save" style="width: 14px;"></i> Salvar</button>
          </div>
        </div>
      </div>
    `;
    
    let container = document.getElementById('cc-modal-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'cc-modal-container';
        document.body.appendChild(container);
    }
    container.innerHTML = modalHtml;
    if (window.lucide) window.lucide.createIcons();
  },

  closeModal() {
    const container = document.getElementById('cc-modal-container');
    if (container) container.innerHTML = '';
  },

  openManageTiposModal(currentCcId) {
    const modalHtml = `
      <div id="tipos-cc-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; justify-content: center; align-items: center;">
        <div style="background: white; border-radius: 8px; width: 400px; max-width: 95%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: flex; flex-direction: column;">
          <div style="padding: 16px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 1.1rem; color: var(--color-primary);">Tipos de Centro de Custo</h3>
            <button onclick="CentrosCustoApp.closeManageTiposModal(${currentCcId})" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: #999;">&times;</button>
          </div>
          <div style="padding: 20px; display: flex; flex-direction: column; gap: 15px;">
            <div style="display: flex; gap: 8px;">
               <input type="text" id="novo-tipo-cc" class="form-control" placeholder="Novo tipo..." style="flex: 1;">
               <button class="btn btn-primary" onclick="CentrosCustoApp.addTipoCc(${currentCcId})"><i data-lucide="plus" style="width: 16px;"></i></button>
            </div>
            <div id="lista-tipos-cc" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
               ${CentrosCustoState.tiposCc.map((t, idx) => `
                 <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <span style="font-size: 0.9rem;">${t}</span>
                    <button class="btn btn-sm btn-outline" style="color: #ef4444; border-color: #fca5a5; padding: 2px 6px;" onclick="CentrosCustoApp.removeTipoCc(${idx}, ${currentCcId})"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                 </div>
               `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    let container = document.getElementById('tipos-cc-modal-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'tipos-cc-modal-container';
        document.body.appendChild(container);
    }
    container.innerHTML = modalHtml;
    if (window.lucide) window.lucide.createIcons();
  },

  closeManageTiposModal(currentCcId) {
    const container = document.getElementById('tipos-cc-modal-container');
    if (container) container.innerHTML = '';
    if (currentCcId) {
       const select = document.getElementById(`edit-tipo-cc-${currentCcId}`);
       if (select) {
          const val = select.value;
          select.innerHTML = '<option value="">Selecione...</option>' + 
             CentrosCustoState.tiposCc.map(t => `<option value="${t}" ${val === t ? 'selected' : ''}>${t}</option>`).join('');
       }
    }
  },

  addTipoCc(currentCcId) {
     const input = document.getElementById('novo-tipo-cc');
     if(!input) return;
     const val = input.value.trim();
     if (val && !CentrosCustoState.tiposCc.includes(val)) {
        CentrosCustoState.tiposCc.push(val);
        localStorage.setItem('crm_centros_custo_tipos', JSON.stringify(CentrosCustoState.tiposCc));
        CentrosCustoApp.openManageTiposModal(currentCcId);
     }
  },

  removeTipoCc(idx, currentCcId) {
     if (confirm('Tem certeza que deseja remover este tipo?')) {
        CentrosCustoState.tiposCc.splice(idx, 1);
        localStorage.setItem('crm_centros_custo_tipos', JSON.stringify(CentrosCustoState.tiposCc));
        CentrosCustoApp.openManageTiposModal(currentCcId);
     }
  },

  render() {
    const contentDiv = document.getElementById('centros-custo-content');
    if (!contentDiv) return;

    if (CentrosCustoState.loading) {
      contentDiv.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          <div class="spinner" style="margin-bottom: 15px;"></div>
          <p>Carregando centros de custo...</p>
        </div>
      `;
      return;
    }

    let filteredCCs = CentrosCustoState.costCenters;
    if (CentrosCustoState.selectedFilterIds.length > 0) {
        filteredCCs = filteredCCs.filter(c => CentrosCustoState.selectedFilterIds.includes(c.id));
    }
    
    // Sort by CC ID ASC
    filteredCCs.sort((a, b) => a.id - b.id);

    let unselectedOptions = CentrosCustoState.costCenters.filter(c => !CentrosCustoState.selectedFilterIds.includes(c.id));

    let filterPills = CentrosCustoState.selectedFilterIds.map(fid => {
        const cc = CentrosCustoState.costCenters.find(c => c.id === fid);
        const name = cc ? cc.name : fid;
        return `<div style="background: #e0e0e0; border-radius: 16px; padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; font-weight: bold; color: #555;">
            ${fid} - ${name}
            <span style="cursor: pointer; background: #999; color: white; border-radius: 50%; width: 16px; height: 16px; display: inline-flex; justify-content: center; align-items: center; font-size: 10px;" onclick="CentrosCustoApp.removeFilter(${fid})">&times;</span>
        </div>`;
    }).join('');

    let optionsHtml = unselectedOptions.map(c => `<option value="${c.id} - ${c.name}"></option>`).join('');

    let html = `
      <style>
        .empresas-table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
        .empresas-table thead th { position: sticky; top: 0; background-color: #1b8253; color: #ffffff; padding: 12px; text-align: left; font-weight: 600; z-index: 10; white-space: nowrap; }
        .empresas-table tbody tr { border-bottom: 1px solid #e0e5e0; }
        .empresas-table tbody tr:nth-child(even) { background-color: #f4f6f4; }
        .empresas-table tbody tr:hover { background-color: #eef2ef; }
        .empresas-table td { padding: 10px 12px; vertical-align: middle; }
        .cc-filter-container { border: 1px solid #ccc; border-radius: 6px; padding: 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: white; min-height: 42px; margin-bottom: 20px;}
        .cc-filter-select { border: none; outline: none; background: transparent; font-size: 0.85rem; flex-grow: 1; min-width: 200px; color: #777;}
      </style>

      <div style="display: flex; justify-content: flex-end; margin-bottom: 15px;">
        <button class="btn btn-primary" style="display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 16px; font-weight: 600; border-radius: 6px; cursor: pointer; border: none;" onclick="CentrosCustoApp.loadData(true)">
          <i data-lucide="refresh-cw" style="width: 16px;"></i> Atualizar
        </button>
      </div>

      <div class="cc-filter-container">
        ${filterPills}
        <input list="cc-datalist" class="cc-filter-select" placeholder="Pesquisar centro de custo ou empresa..." onchange="
          const val = this.value; 
          const match = CentrosCustoState.costCenters.find(c => (c.id + ' - ' + c.name) === val || c.id == val);
          if (match) { CentrosCustoApp.addFilter(match.id); this.value=''; }
        ">
        <datalist id="cc-datalist">
            ${optionsHtml}
        </datalist>
      </div>

      <div class="card" style="overflow: hidden; border-radius: 8px;">
        <div style="max-height: 65vh; overflow-y: auto;">
          <table class="empresas-table">
            <thead>
              <tr>
                <th style="width: 80px;">ID Empresa</th>
                <th style="width: 80px;">ID CC</th>
                <th style="min-width: 250px;">Centro de Custo</th>
                <th style="width: 150px;">Tipo</th>
                <th style="width: 120px; text-align: right;">Valor VGV</th>
                <th style="width: 150px; text-align: center;">ID Preâmbulo</th>
                <th style="width: 120px; text-align: center;">% Moura Leite</th>
                <th style="width: 120px; text-align: center;">% Terrenista</th>
                <th style="width: 100px; text-align: center;">Ações</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (filteredCCs.length === 0) {
      html += `<tr><td colspan="7" style="text-align: center; padding: 30px;">Nenhum centro de custo para exibir.</td></tr>`;
    }

    const preamblesList = (AppState && AppState.preamblesList) ? AppState.preamblesList : [];
    
    // Sort by CC ID ascending
    filteredCCs.sort((a, b) => a.id - b.id);

    filteredCCs.forEach(cc => {
      const custom = CentrosCustoState.customFields[cc.id] || {};
      const vgv = custom.valor_vgv ? parseFloat(custom.valor_vgv).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
      
      const foundPreamble = preamblesList.find(p => p.centrosCustoIds && p.centrosCustoIds.includes(cc.id));
      const preambulo = foundPreamble ? foundPreamble.id : '-';
      
      const percMl = custom.perc_ml ? custom.perc_ml + '%' : '-';
      const percTerr = custom.perc_terrenista ? custom.perc_terrenista + '%' : '-';
      const tipoCc = custom.tipo_cc || '-';

      html += `
        <tr>
          <td>${cc.idCompany || cc.companyId || '-'}</td>
          <td><strong>${cc.id}</strong></td>
          <td>${cc.name}</td>
          <td><span style="background: #f0f2f5; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; color: #555;">${tipoCc}</span></td>
          <td style="text-align: right; font-weight: 500; color: #1b8253;">${vgv}</td>
          <td style="text-align: center;">${preambulo}</td>
          <td style="text-align: center;">${percMl}</td>
          <td style="text-align: center;">${percTerr}</td>
          <td style="text-align: center;">
             <button class="btn btn-outline btn-sm" onclick="CentrosCustoApp.openEditModal(${cc.id})" style="padding: 4px 10px; font-size: 0.75rem;">
                <i data-lucide="edit-3" style="width: 14px;"></i> Editar
             </button>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    contentDiv.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }
};

function initCentrosCustoModule() {
  const root = document.getElementById('centros-custo-root');
  if (!root) return;

  root.innerHTML = `
    <div style="padding: 20px; max-width: 1400px; margin: 0 auto;">
      <div id="centros-custo-content">
        <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          <div class="spinner" style="margin-bottom: 15px;"></div>
          <p>Carregando dados dos centros de custo...</p>
        </div>
      </div>
    </div>
  `;
  
  if (window.lucide) window.lucide.createIcons();
  
  if (CentrosCustoState.costCenters.length > 0) {
    CentrosCustoApp.render();
  } else {
    CentrosCustoApp.loadData();
  }
}

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'centros-custo') {
    initCentrosCustoModule();
  }
});
