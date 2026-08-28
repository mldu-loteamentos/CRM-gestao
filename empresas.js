const EmpresasState = {
  companies: [],
  customFields: {},
  loading: false,
  filterManagedOnly: false,
  selectedFilterId: null
};

try {
  const raw = localStorage.getItem("crm_empresas_custom");
  if (raw) {
    const data = JSON.parse(raw);
    const map = {};
    Object.values(data).forEach(item => {
      if (item && typeof item === "object" && item.company_id != null) map[item.company_id] = item;
    });
    if (Object.keys(map).length) EmpresasState.customFields = map;
  }
} catch (e) {}

const EmpresasApp = {
  async loadData() {
    EmpresasState.loading = true;
    this.render();

    try {
      const baseUrl = window.SIENGE_CONFIG ? window.SIENGE_CONFIG.baseUrl : "";
      let url = `${baseUrl}/companies?limit=200&offset=0`;
      
      // Fallback local just in case
      if (!baseUrl) {
         const host = window.location.hostname || "localhost";
         const portStr = (window.location.port && window.location.port !== "5500" && window.location.port !== "443" && window.location.port !== "80") ? ":" + window.location.port : "";
         url = `${window.location.protocol}//${host}${portStr}/api/sienge-proxy/companies?limit=200&offset=0`;
      }
      
      let localCustom = localStorage.getItem('crm_empresas_custom');
      
      const defaultCustom = {
          "1": { company_id: 1, nome_usual: "MLDU", percentual_mldu: 100, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 },
          "2": { company_id: 2, nome_usual: "EMPREENDIMENTOS", percentual_mldu: 0, consolidacao_padrao: 0, gerida_pelo_grupo: 1, cobranca_interna: 1 },
          "3": { company_id: 3, nome_usual: "TERRA DO ARAÇARI", percentual_mldu: 0, consolidacao_padrao: 0, gerida_pelo_grupo: 1, cobranca_interna: 1 },
          "4": { company_id: 4, nome_usual: "TERRAS DE ITU", percentual_mldu: 0, consolidacao_padrao: 0, gerida_pelo_grupo: 1, cobranca_interna: 0 },
          "5": { company_id: 5, nome_usual: "MLES", percentual_mldu: 66, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 0 },
          "6": { company_id: 6, nome_usual: "ARAÇARI SPE", percentual_mldu: 50, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 },
          "12": { company_id: 12, nome_usual: "ELLENCO & MLDU BOI", percentual_mldu: 50, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 0 },
          "13": { company_id: 13, nome_usual: "VERCELLINO", percentual_mldu: 27.75, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 },
          "14": { company_id: 14, nome_usual: "PIRAPITINGUI", percentual_mldu: 0, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 0 },
          "15": { company_id: 15, nome_usual: "", percentual_mldu: 0, consolidacao_padrao: 1, gerida_pelo_grupo: 0, cobranca_interna: 0 },
          "16": { company_id: 16, nome_usual: "", percentual_mldu: 0, consolidacao_padrao: 1, gerida_pelo_grupo: 0, cobranca_interna: 0 },
          "17": { company_id: 17, nome_usual: "", percentual_mldu: 0, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 0 },
          "28": { company_id: 28, nome_usual: "RAMOS I", percentual_mldu: 0, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 },
          "32": { company_id: 32, nome_usual: "ITATINGA", percentual_mldu: 100, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 },
          "_v2": true
      };

      let customData = {};
      try {
        if (localCustom) customData = JSON.parse(localCustom);
      } catch(e) {}

      Object.keys(defaultCustom).forEach(k => {
        if (k === "_v2") return;
        if (!customData[k] || typeof customData[k] !== "object") {
          customData[k] = defaultCustom[k];
        } else {
          const cur = customData[k];
          const def = defaultCustom[k];
          if (!cur.nome_usual && def.nome_usual) cur.nome_usual = def.nome_usual;
          if (cur.percentual_mldu == null && def.percentual_mldu != null) cur.percentual_mldu = def.percentual_mldu;
          if (!this.isCobrancaInternaSet(cur) && this.isCobrancaInternaSet(def)) cur.cobranca_interna = def.cobranca_interna;
        }
      });
      customData._v2 = true;
      this.hydrateCustomFields(customData, true);
      this.persistCustomMap();

      let comps = [];
      try {
        const res = await fetch(url, { headers: { 'Authorization': typeof getBasicAuthHeader === "function" ? getBasicAuthHeader() : "" } });
        if (!res.ok) throw new Error("Falha ao carregar empresas do Sienge");
        const data = await res.json();
        comps = data.results ? data.results : (Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn("Proxy unavailable in Gestão de Empresas, using mock data");
        comps = window.MOCK_DATA ? window.MOCK_DATA.COMPANIES : [];
        if (comps.length === 0) {
          throw new Error("Não foi possível carregar empresas do Sienge nem do Mock local.");
        }
      }
      
      comps.sort((a, b) => a.id - b.id);
      this.afterCompaniesFetched(comps, true);
      
    } catch (e) {
      console.error(e);
      alert("Erro ao carregar empresas: " + e.message);
    } finally {
      EmpresasState.loading = false;
      this.render();
    }
  },

  toggleFilter() {
    EmpresasState.filterManagedOnly = !EmpresasState.filterManagedOnly;
    this.render();
  },

  setSearchFilter(id) {
    EmpresasState.selectedFilterId = id;
    this.render();
  },

  clearSearchFilter() {
    EmpresasState.selectedFilterId = null;
    this.render();
  },

  customOf(id) {
    const cf = EmpresasState.customFields || {};
    return cf[id] || cf[String(id)] || cf[Number(id)] || null;
  },

  hydrateCustomFields(parsed, preferMemory) {
    let fromLs = parsed;
    if (!fromLs || typeof fromLs !== "object") {
      try { fromLs = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {}; } catch (e) { fromLs = {}; }
    }
    if (window.mergeEmpresasCustom) {
      const memStore = { _v2: true };
      if (preferMemory) {
        Object.values(EmpresasState.customFields || {}).forEach(item => {
          if (item && typeof item === "object" && item.company_id != null) memStore[String(item.company_id)] = item;
        });
      }
      fromLs = JSON.parse(window.mergeEmpresasCustom(JSON.stringify(memStore), JSON.stringify(fromLs)));
    }
    const map = {};
    Object.keys(fromLs).forEach(k => {
      if (k === "_v2") return;
      const item = fromLs[k];
      if (!item || typeof item !== "object") return;
      const id = Number(item.company_id != null ? item.company_id : k);
      if (!Number.isFinite(id)) return;
      map[id] = { ...item, company_id: id };
    });
    EmpresasState.customFields = map;
  },

  async saveInline(companyId, field, value) {
    const id = Number(companyId);
    const custom = this.customOf(id) || {
      company_id: id,
      nome_usual: '',
      percentual_mldu: 0,
      consolidacao_padrao: 0,
      gerida_pelo_grupo: 0
    };

    if (field === 'nome_usual') custom.nome_usual = value;
    if (field === 'percentual_mldu') custom.percentual_mldu = parseFloat(value) || 0;
    if (field === 'consolidacao_padrao') custom.consolidacao_padrao = value ? 1 : 0;
    if (field === 'gerida_pelo_grupo') custom.gerida_pelo_grupo = value ? 1 : 0;
    if (field === 'cobranca_interna') {
      custom.cobranca_interna = value ? 1 : 0;
      if (window.AppState) {
        window.AppState.dashboardRendered = false;
        window.AppState.defaultersLoaded = false;
      }
    }
    custom.company_id = id;
    custom.updatedAt = Date.now();

    EmpresasState.customFields[id] = custom;
    this.persistCustomMap();
    if (window.forceUploadLocalConfig) window.forceUploadLocalConfig(true).catch(() => {});
    if (typeof this.renderFilaPrompt === "function") this.renderFilaPrompt();
    if (document.getElementById("empresas-content")) this.render();

    try {
      if (field === 'consolidacao_padrao' || field === 'gerida_pelo_grupo' || field === 'cobranca_interna') {
        const checkbox = document.getElementById(`chk-${field}-${id}`);
        if (checkbox) {
            checkbox.checked = !!value;
            checkbox.closest('td').style.backgroundColor = value ? '#e8f5e9' : 'transparent';
        }
      }
    } catch(e) {
      console.error("Save inline error:", e);
    }
  },

  render() {
    const contentDiv = document.getElementById('empresas-content');
    if (!contentDiv) return;

    if (EmpresasState.loading) {
      contentDiv.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          <div class="spinner" style="margin-bottom: 15px;"></div>
          <p>Carregando dados das empresas...</p>
        </div>
      `;
      return;
    }

    if (EmpresasState.companies.length === 0) {
      contentDiv.innerHTML = `<div class="empty-state">Nenhuma empresa encontrada no Sienge.</div>`;
      return;
    }

    let filteredCompanies = EmpresasState.companies.slice().sort((a, b) => Number(a.id) - Number(b.id));
    if (EmpresasState.filterManagedOnly) {
      filteredCompanies = filteredCompanies.filter(c => {
        const custom = this.customOf(c.id);
        return custom && custom.gerida_pelo_grupo === 1;
      });
    }

    if (EmpresasState.selectedFilterId !== null) {
      filteredCompanies = filteredCompanies.filter(c => c.id === EmpresasState.selectedFilterId);
    }

    const filterBtnText = EmpresasState.filterManagedOnly ? "Mostrar Todas" : "Mostrar Apenas Geridas pelo Grupo";
    const filterBtnIcon = EmpresasState.filterManagedOnly ? "list" : "filter";

    let html = `
      <style>
        /* Hide number arrows */
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
        .empresas-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.95rem;
        }
        .empresas-table thead th {
          position: sticky;
          top: 0;
          background-color: #1b8253;
          color: #ffffff;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          z-index: 10;
          white-space: nowrap;
        }
        .empresas-table tbody tr {
          border-bottom: 1px solid #e0e5e0;
        }
        .empresas-table tbody tr:nth-child(even) {
          background-color: #f4f6f4;
        }
        .empresas-table tbody tr:hover {
          background-color: #eef2ef;
        }
        .empresas-table td {
          padding: 10px 12px;
          vertical-align: middle;
        }
        .inline-input {
          border: 1px solid #d1d5db;
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 0.9rem;
          width: 100%;
          transition: border-color 0.2s;
        }
        .inline-input:focus {
          outline: none;
          border-color: #1b8253;
        }
        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: .4s;
          border-radius: 24px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        input:checked + .slider {
          background-color: #1b8253;
        }
        input:focus + .slider {
          box-shadow: 0 0 1px #1b8253;
        }
        input:checked + .slider:before {
          transform: translateX(20px);
        }
      </style>
    `;

    let searchPill = '';
    if (EmpresasState.selectedFilterId !== null) {
        const emp = EmpresasState.companies.find(c => c.id === EmpresasState.selectedFilterId);
        searchPill = `<div style="background: #e0e0e0; border-radius: 16px; padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; font-weight: bold; color: #555; margin-right: 10px; max-width: 250px;">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${emp ? emp.id + ' - ' + emp.name : EmpresasState.selectedFilterId}</span>
            <span style="cursor: pointer; background: #999; color: white; border-radius: 50%; width: 16px; min-width: 16px; height: 16px; display: inline-flex; justify-content: center; align-items: center; font-size: 10px;" onclick="EmpresasApp.clearSearchFilter()">&times;</span>
        </div>`;
    }

    let optionsHtml = EmpresasState.companies.map(c => `<option value="${c.id} - ${c.name}"></option>`).join('');

    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; gap: 15px; flex-wrap: wrap;">
        <div style="flex-grow: 1; max-width: 500px; display: flex; align-items: center; background: white; border: 1px solid #ccc; border-radius: 6px; padding: 0 10px; height: 42px;">
           ${searchPill}
           <input list="emp-datalist" type="text" style="border: none; outline: none; background: transparent; width: 100%; font-size: 0.9rem; color: #555;" placeholder="Pesquisar por ID ou Nome..." onchange="
             const val = this.value;
             const match = EmpresasState.companies.find(c => (c.id + ' - ' + c.name) === val || c.id == val);
             if (match) { EmpresasApp.setSearchFilter(match.id); }
           ">
           <datalist id="emp-datalist">
              ${optionsHtml}
           </datalist>
        </div>
        <div style="display: flex; align-items: center; gap: 15px;">
          <button class="btn btn-primary" style="display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 16px; font-weight: 600; white-space: nowrap; border-radius: 6px; cursor: pointer; border: none;" onclick="EmpresasApp.loadData()">
            <i data-lucide="refresh-cw" style="width: 16px;"></i> Atualizar
          </button>
          <button class="btn btn-outline" onclick="EmpresasApp.toggleFilter()" style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 280px; padding: 0 16px; height: 42px;">
            <i data-lucide="${filterBtnIcon}" style="width: 16px;"></i> ${filterBtnText}
          </button>
        </div>
      </div>

      <div class="card" style="overflow: hidden; border-radius: 8px;">
        <div style="max-height: 65vh; overflow-y: auto;">
          <table class="empresas-table">
            <thead>
              <tr>
                <th style="width: 60px;">ID</th>
                <th style="min-width: 250px;">Empresa</th>
                <th style="white-space: nowrap;">CNPJ</th>
                <th style="width: 200px;">Nome Usual</th>
                <th style="width: 100px; text-align: center;">% MLDU</th>
                <th style="width: 130px; text-align: center;">Consolidação Padrão</th>
                <th style="width: 130px; text-align: center;">Gerida pelo Grupo</th>
                <th style="width: 130px; text-align: center;">Cobrança Interna</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (filteredCompanies.length === 0) {
      html += `<tr><td colspan="8" style="text-align: center; padding: 30px;">Nenhuma empresa corresponde ao filtro.</td></tr>`;
    }

    filteredCompanies.forEach(company => {
      const custom = this.customOf(company.id) || {};
      const usualName = custom.nome_usual || '';
      const percMldu = custom.percentual_mldu || 0;
      
      const checkedCons = custom.consolidacao_padrao ? 'checked' : '';
      const checkedGerida = custom.gerida_pelo_grupo ? 'checked' : '';
      const checkedCobInt = custom.cobranca_interna ? 'checked' : '';
      
      const bgCons = custom.consolidacao_padrao ? 'background-color: #e8f5e9;' : '';
      const bgGerida = custom.gerida_pelo_grupo ? 'background-color: #e8f5e9;' : '';
      const bgCobInt = custom.cobranca_interna ? 'background-color: #e8f5e9;' : '';

      html += `
        <tr>
          <td><strong>${company.id}</strong></td>
          <td>${company.name}</td>
          <td style="white-space: nowrap;">${company.cnpj || '-'}</td>
          <td>
            <input type="text" class="inline-input" value="${usualName}" placeholder="Nome usual..." onblur="EmpresasApp.saveInline(${company.id}, 'nome_usual', this.value)">
          </td>
          <td style="text-align: center;">
            <input type="number" class="inline-input" style="text-align: center;" value="${percMldu}" step="0.01" min="0" max="100" onblur="EmpresasApp.saveInline(${company.id}, 'percentual_mldu', this.value)">
          </td>
          <td style="text-align: center; ${bgCons} transition: background-color 0.3s;">
            <label class="switch">
              <input type="checkbox" id="chk-consolidacao_padrao-${company.id}" ${checkedCons} onchange="EmpresasApp.saveInline(${company.id}, 'consolidacao_padrao', this.checked)">
              <span class="slider"></span>
            </label>
          </td>
          <td style="text-align: center; ${bgGerida} transition: background-color 0.3s;">
            <label class="switch">
              <input type="checkbox" id="chk-gerida_pelo_grupo-${company.id}" ${checkedGerida} onchange="EmpresasApp.saveInline(${company.id}, 'gerida_pelo_grupo', this.checked)">
              <span class="slider"></span>
            </label>
          </td>
          <td style="text-align: center; ${bgCobInt} transition: background-color 0.3s;">
            <label class="switch">
              <input type="checkbox" id="chk-cobranca_interna-${company.id}" ${checkedCobInt} onchange="EmpresasApp.saveInline(${company.id}, 'cobranca_interna', this.checked)">
              <span class="slider"></span>
            </label>
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
  },

  isCobrancaInternaSet(custom) {
    if (!custom || typeof custom !== "object") return false;
    const v = custom.cobranca_interna;
    return v === 0 || v === 1 || v === true || v === false || v === "0" || v === "1";
  },

  persistCustomMap() {
    const toStore = { _v2: true };
    Object.values(EmpresasState.customFields || {}).forEach(item => {
      if (!item || typeof item !== "object" || item.company_id == null) return;
      toStore[String(item.company_id)] = item;
    });
    localStorage.setItem("crm_empresas_custom", JSON.stringify(toStore));
  },

  afterCompaniesFetched(comps, fromNetwork) {
    const list = Array.isArray(comps) ? comps : [];
    EmpresasState.companies = list.slice().sort((a, b) => Number(a.id) - Number(b.id));
    this.hydrateCustomFields(null, true);
    let changed = false;
    list.forEach(c => {
      const id = Number(c.id);
      let rec = this.customOf(id);
      if (!rec) {
        rec = {
          company_id: id,
          nome_usual: "",
          percentual_mldu: 0,
          consolidacao_padrao: 0,
          gerida_pelo_grupo: 0
        };
        EmpresasState.customFields[id] = rec;
        changed = true;
      }
      rec.company_id = id;
      if (!this.isCobrancaInternaSet(rec) && !rec.nova_empresa) {
        rec.nova_empresa = 1;
        changed = true;
      }
    });
    if (changed) {
      this.persistCustomMap();
      if (fromNetwork && window.forceUploadLocalConfig) window.forceUploadLocalConfig(true).catch(() => {});
    }
    this.renderFilaPrompt();
    if (document.getElementById("empresas-content")) this.render();
  },

  pendingCobrancaCompanies() {
    const companies = EmpresasState.companies.length
      ? EmpresasState.companies
      : (() => { try { return JSON.parse(localStorage.getItem("crm_companies_data") || "[]"); } catch (e) { return []; } })();
    return (companies || []).filter(c => !this.isCobrancaInternaSet(this.customOf(c.id)));
  },

  companyLabel(c) {
    return (c && (c.name || c.tradeName || c.corporateName)) || `Empresa ${c && c.id}`;
  },

  renderFilaPrompt() {
    const host = document.getElementById("fila-new-companies-banner");
    if (!host) return;
    const pending = this.pendingCobrancaCompanies();
    if (!pending.length) {
      host.style.display = "none";
      host.innerHTML = "";
      return;
    }
    host.style.display = "block";
    host.innerHTML = pending.map(c => {
      const name = this.companyLabel(c);
      return `<div style="margin-bottom:10px;padding:12px 14px;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="font-size:0.85rem;font-weight:600;line-height:1.4;">
          Nova empresa no Sienge: <strong>${c.id} — ${name}</strong><br>
          <span style="font-weight:500;">A cobrança desta empresa será interna?</span>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button type="button" class="btn btn-primary btn-sm" onclick="EmpresasApp.answerCobrancaInterna(${c.id}, true)">Sim, interna</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="EmpresasApp.answerCobrancaInterna(${c.id}, false)">Não</button>
        </div>
      </div>`;
    }).join("");
  },

  answerCobrancaInterna(companyId, isInternal) {
    const id = Number(companyId);
    const custom = this.customOf(id) || {
      company_id: id,
      nome_usual: "",
      percentual_mldu: 0,
      consolidacao_padrao: 0,
      gerida_pelo_grupo: 0
    };
    custom.cobranca_interna = isInternal ? 1 : 0;
    delete custom.nova_empresa;
    custom.updatedAt = Date.now();
    EmpresasState.customFields[id] = custom;
    this.saveInline(id, "cobranca_interna", isInternal);
    this.renderFilaPrompt();
    if (isInternal && window.AppState) {
      window.AppState.dashboardRendered = false;
      window.AppState.defaultersLoaded = false;
    }
  },

  async syncCompaniesDaily(force) {
    if (window.SiengeApiService && typeof SiengeApiService.getCompanies === "function") {
      await SiengeApiService.getCompanies(!!force);
    } else {
      await this.loadData();
    }
    if (!window._companySyncIv) {
      window._companySyncIv = setInterval(() => {
        const now = new Date();
        if (now.getHours() === 8 && now.getMinutes() < 3) {
          SiengeApiService.getCompanies(false).catch(() => {});
        }
      }, 60000);
    }
  }
};

function initEmpresasModule() {
  const root = document.getElementById('parametrizacoes-root');
  if (!root) return;

  root.innerHTML = `
    <div style="padding: 20px; max-width: 1400px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      </div>
      <div id="empresas-content">
        <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          <div class="spinner" style="margin-bottom: 15px;"></div>
          <p>Carregando dados das empresas...</p>
        </div>
      </div>
    </div>
  `;
  
  if (window.lucide) window.lucide.createIcons();

  EmpresasApp.hydrateCustomFields(null, true);
  if (EmpresasState.companies.length > 0) {
    EmpresasApp.render();
  } else {
    EmpresasApp.loadData();
  }
}

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'parametrizacoes') {
    initEmpresasModule();
  }
});

window.EmpresasApp = EmpresasApp;
