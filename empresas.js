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
          "21": { company_id: 21, nome_usual: "YPÊS IV", percentual_mldu: 23.8, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 0 },
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
          if (!cur.nome_usual && def.nome_usual && !cur.nome_usual_edited) cur.nome_usual = def.nome_usual;
          if (cur.percentual_mldu == null && def.percentual_mldu != null && !cur.percentual_mldu_edited) cur.percentual_mldu = def.percentual_mldu;
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

  flagOn(custom, field) {
    const v = custom && custom[field];
    return v === 1 || v === true || v === "1";
  },

  rowLocked(custom) {
    return this.flagOn(custom, "spe_socios") || this.flagOn(custom, "gestao_elenco");
  },

  activeLock(custom) {
    if (this.flagOn(custom, "gestao_elenco")) return "gestao_elenco";
    if (this.flagOn(custom, "spe_socios")) return "spe_socios";
    return "";
  },

  parsePct(value) {
    const raw = String(value == null ? "" : value).trim().replace(/\s/g, "").replace(",", ".");
    if (raw === "" || raw === ".") return { empty: true };
    if (!/^\d+(\.\d+)?$/.test(raw)) return { invalid: true };
    let n = Number(raw);
    if (!Number.isFinite(n)) return { invalid: true };
    n = Math.min(100, Math.max(0, n));
    n = Math.round((n + Number.EPSILON) * 10000) / 10000;
    return { n: n };
  },

  fmtPct(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    const rounded = Math.round((x + Number.EPSILON) * 10000) / 10000;
    return rounded.toFixed(4).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
  },

  commitPct(input, companyId, field) {
    const key = field === "percentual_liquido_mldu" ? "percentual_liquido_mldu" : "percentual_mldu";
    const parsed = this.parsePct(input.value);
    if (parsed.invalid) {
      const cur = this.customOf(companyId);
      input.value = this.fmtPct(cur && cur[key]);
      return;
    }
    input.value = parsed.empty ? "0" : this.fmtPct(parsed.n);
    input.dataset.userEdited = "1";
    this.saveInline(companyId, key, input.value);
  },

  clearOtherFlags(custom, keep) {
    const fields = ["consolidacao_padrao", "gerida_pelo_grupo", "cobranca_interna", "spe_socios", "gestao_elenco"];
    let cobrancaCleared = false;
    fields.forEach((field) => {
      if (field === keep) return;
      if (field === "cobranca_interna" && this.flagOn(custom, field)) cobrancaCleared = true;
      custom[field] = 0;
    });
    if (cobrancaCleared && window.AppState) {
      window.AppState.dashboardRendered = false;
      window.AppState.defaultersLoaded = false;
    }
  },

  flushRowInputs(id, custom) {
    const tr = document.querySelector('#empresas-content tr[data-company-id="' + id + '"]');
    const rec = custom || this.customOf(id);
    if (!tr || !rec) return;
    const inputs = tr.querySelectorAll(".inline-input");
    const nome = inputs[0];
    const perc = inputs[1];
    if (nome && !nome.disabled) {
      const typed = nome.dataset.userEdited === "1";
      const val = nome.value == null ? "" : String(nome.value);
      const stored = rec.nome_usual == null ? "" : String(rec.nome_usual);
      if (val !== stored && (typed || val.trim() !== "" || !stored.trim())) {
        rec.nome_usual = val;
        if (typed) rec.nome_usual_edited = 1;
      }
    }
    this.flushPctInput(rec, perc, "percentual_mldu");
    this.flushPctInput(rec, tr.querySelector('.inline-input[data-field="percentual_liquido_mldu"]'), "percentual_liquido_mldu");
  },

  flushPctInput(rec, input, field) {
    if (!rec || !input || input.disabled) return;
    const typed = input.dataset.userEdited === "1";
    const parsed = this.parsePct(input.value);
    if (parsed.invalid) return;
    if (parsed.empty) {
      if (typed && Number(rec[field]) !== 0) {
        rec[field] = 0;
        rec[field + "_edited"] = 1;
      }
      return;
    }
    if (Number(rec[field]) === parsed.n) return;
    if (!typed && parsed.n === 0 && Number(rec[field]) > 0) return;
    rec[field] = parsed.n;
    if (typed) rec[field + "_edited"] = 1;
  },

  schedulePaint(id) {
    this._paintQueued = this._paintQueued || {};
    const key = String(id);
    if (this._paintQueued[key]) return;
    this._paintQueued[key] = true;
    const run = () => {
      this._paintQueued[key] = false;
      this.paintRowState(id);
    };
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else setTimeout(run, 0);
  },

  scheduleCloudUpload(debounce) {
    const run = () => {
      this._uploadTimer = null;
      if (typeof window.persistEmpresasCustomToFirebase === "function") {
        window.persistEmpresasCustomToFirebase().catch(() => {});
        return;
      }
      if (typeof window.forceUploadLocalConfig === "function") window.forceUploadLocalConfig(true).catch(() => {});
    };
    if (!debounce) {
      clearTimeout(this._uploadTimer);
      run();
      return;
    }
    clearTimeout(this._uploadTimer);
    this._uploadTimer = setTimeout(run, 250);
  },

  flushCloudUpload() {
    if (this._uploadTimer) {
      clearTimeout(this._uploadTimer);
      this._uploadTimer = null;
    }
    if (typeof window.persistEmpresasCustomToFirebase === "function") {
      window.persistEmpresasCustomToFirebase().catch(() => {});
    }
  },

  paintRowState(id) {
    const custom = this.customOf(id) || {};
    const locked = this.rowLocked(custom);
    const active = this.activeLock(custom);
    const tr = document.querySelector('#empresas-content tr[data-company-id="' + id + '"]');
    if (tr) {
      tr.classList.toggle("is-spe-locked", locked);
      tr.querySelectorAll(".inline-input").forEach((input) => { input.disabled = locked; });
      tr.querySelectorAll(".emp-lock-cell").forEach((td) => {
        td.classList.toggle("is-lock-on", td.dataset.lock === active);
      });
    }
    ["consolidacao_padrao", "gerida_pelo_grupo", "cobranca_interna", "spe_socios", "gestao_elenco"].forEach((field) => {
      const checkbox = document.getElementById("chk-" + field + "-" + id);
      if (!checkbox) return;
      checkbox.checked = this.flagOn(custom, field);
      checkbox.disabled = locked && field !== active;
    });
  },

  escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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
    if (this._empresasRendering) return;
    const id = Number(companyId);
    const custom = this.customOf(id) || {
      company_id: id,
      nome_usual: '',
      percentual_mldu: 0,
      consolidacao_padrao: 0,
      gerida_pelo_grupo: 0
    };
    const isText = field === "nome_usual" || field === "percentual_mldu" || field === "percentual_liquido_mldu";
    const locked = this.rowLocked(custom);
    const active = this.activeLock(custom);
    if (locked && !isText && field !== active) {
      this.schedulePaint(id);
      return;
    }
    if (!isText) {
      const bit = value ? 1 : 0;
      const now = Date.now();
      const prev = this._lastFlag;
      if (prev && prev.id === id && prev.field === field && (now - prev.at) < 80 && prev.value !== bit) {
        this.schedulePaint(id);
        return;
      }
      this._lastFlag = { id: id, field: field, at: now, value: bit };
    }

    if (field === "nome_usual") {
      const next = value == null ? "" : String(value);
      if (next === String(custom.nome_usual || "")) return;
      custom.nome_usual = next;
      custom.nome_usual_edited = 1;
    }
    if (field === "percentual_mldu" || field === "percentual_liquido_mldu") {
      const parsed = this.parsePct(value);
      if (parsed.invalid) return;
      const n = parsed.empty ? 0 : parsed.n;
      if (Number(custom[field]) === n) return;
      custom[field] = n;
      custom[field + "_edited"] = 1;
    }
    if (field === "consolidacao_padrao") custom.consolidacao_padrao = value ? 1 : 0;
    if (field === "gerida_pelo_grupo") custom.gerida_pelo_grupo = value ? 1 : 0;
    if (field === "spe_socios" || field === "gestao_elenco") {
      if (value) this.clearOtherFlags(custom, field);
      custom[field] = value ? 1 : 0;
    }
    if (field === "cobranca_interna") {
      custom.cobranca_interna = value ? 1 : 0;
      if (window.AppState) {
        window.AppState.dashboardRendered = false;
        window.AppState.defaultersLoaded = false;
      }
    }
    if (!isText) this.flushRowInputs(id, custom);
    custom.company_id = id;
    custom.updatedAt = Date.now();

    EmpresasState.customFields[id] = custom;
    this.persistCustomMap();
    this.scheduleCloudUpload(isText);
    if (!isText && typeof this.renderFilaPrompt === "function") this.renderFilaPrompt();
    this.schedulePaint(id);
  },

  render() {
    const contentDiv = document.getElementById('empresas-content');
    if (!contentDiv) return;
    const prevScroll = document.getElementById("empresas-scroll");
    const scrollTop = prevScroll ? prevScroll.scrollTop : 0;

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

    let searchPill = "";
    if (EmpresasState.selectedFilterId !== null) {
      const emp = EmpresasState.companies.find(c => c.id === EmpresasState.selectedFilterId);
      searchPill = `<span class="emp-pill"><span>${this.escAttr(emp ? emp.id + " - " + emp.name : EmpresasState.selectedFilterId)}</span><button type="button" onclick="EmpresasApp.clearSearchFilter()" title="Limpar">&times;</button></span>`;
    }

    const optionsHtml = EmpresasState.companies.map(c => `<option value="${this.escAttr(c.id + " - " + c.name)}"></option>`).join("");
    const geridasOn = EmpresasState.filterManagedOnly ? "checked" : "";

    let html = `
      <div class="emp-toolbar">
        <div class="emp-busca">
          <div class="ml-emp-filter-label">Empresa</div>
          <div class="emp-busca-campo">
            ${searchPill}
            <input list="emp-datalist" type="text" placeholder="Pesquisar por ID ou nome" onchange="
              const val = this.value;
              const match = EmpresasState.companies.find(c => (c.id + ' - ' + c.name) === val || String(c.id) === val);
              if (match) EmpresasApp.setSearchFilter(match.id);
            ">
            <datalist id="emp-datalist">${optionsHtml}</datalist>
          </div>
        </div>
        <div class="cc-toolbar-actions">
          <label class="cc-parceiros">
            <input type="checkbox" ${geridasOn} onchange="EmpresasApp.toggleFilter()">
            Somente geridas pelo grupo
          </label>
          <button type="button" class="btn btn-primary cc-atualizar" onclick="EmpresasApp.loadData()">
            <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Atualizar
          </button>
        </div>
      </div>

      <div id="empresas-scroll" class="emp-scroll">
        <table class="emp-table">
          <colgroup>
            <col class="emp-c-id"><col class="emp-c-nome"><col class="emp-c-cnpj"><col class="emp-c-usual">
            <col class="emp-c-pct"><col class="emp-c-pct"><col class="emp-c-flag"><col class="emp-c-flag"><col class="emp-c-flag"><col class="emp-c-flag"><col class="emp-c-flag">
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>Empresa</th>
              <th>CNPJ</th>
              <th>Nome usual</th>
              <th class="is-center">% Consolidação</th>
              <th class="is-center">% Líquido MLDU</th>
              <th class="is-center">Consolidação</th>
              <th class="is-center">Gerida pelo grupo</th>
              <th class="is-center">Cobrança interna</th>
              <th class="is-center">SPE sócios</th>
              <th class="is-center">Gestão Ellenco</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (filteredCompanies.length === 0) {
      html += `<tr><td colspan="11" style="text-align: center; padding: 30px;">Nenhuma empresa corresponde ao filtro.</td></tr>`;
    }

    filteredCompanies.forEach(company => {
      const custom = this.customOf(company.id) || {};
      const usualName = custom.nome_usual || '';
      const percMldu = this.fmtPct(custom.percentual_mldu || 0);
      const percLiq = this.fmtPct(custom.percentual_liquido_mldu || 0);
      const locked = this.rowLocked(custom);
      const active = this.activeLock(custom);
      const lock = locked ? "disabled" : "";
      const checkedCons = this.flagOn(custom, "consolidacao_padrao") ? "checked" : "";
      const checkedGerida = this.flagOn(custom, "gerida_pelo_grupo") ? "checked" : "";
      const checkedCobInt = this.flagOn(custom, "cobranca_interna") ? "checked" : "";
      const checkedSpe = this.flagOn(custom, "spe_socios") ? "checked" : "";
      const checkedEllenco = this.flagOn(custom, "gestao_elenco") ? "checked" : "";

      const interruptor = (field, checked) => {
        const dis = locked && field !== active ? "disabled" : "";
        return `<label class="moura-switch"><input type="checkbox" id="chk-${field}-${company.id}" ${checked} ${dis} onchange="EmpresasApp.saveInline(${company.id}, '${field}', this.checked)"><span class="moura-switch-track" aria-hidden="true"></span></label>`;
      };

      html += `
        <tr data-company-id="${company.id}" class="${locked ? "is-spe-locked" : ""}">
          <td><strong>${company.id}</strong></td>
          <td class="emp-nome" title="${this.escAttr(company.name)}">${this.escAttr(company.name)}</td>
          <td class="emp-cnpj">${this.escAttr(company.cnpj || "-")}</td>
          <td>
            <input type="text" class="inline-input" value="${this.escAttr(usualName)}" placeholder="Nome usual" ${lock} oninput="this.dataset.userEdited='1'; EmpresasApp.saveInline(${company.id}, 'nome_usual', this.value)" onblur="EmpresasApp.saveInline(${company.id}, 'nome_usual', this.value)">
          </td>
          <td class="is-center">
            <input type="text" inputmode="decimal" data-field="percentual_mldu" class="inline-input emp-pct" value="${this.escAttr(percMldu)}" ${lock} oninput="this.dataset.userEdited='1'; EmpresasApp.saveInline(${company.id}, 'percentual_mldu', this.value)" onblur="EmpresasApp.commitPct(this, ${company.id})">
          </td>
          <td class="is-center">
            <input type="text" inputmode="decimal" data-field="percentual_liquido_mldu" class="inline-input emp-pct" value="${this.escAttr(percLiq)}" ${lock} oninput="this.dataset.userEdited='1'; EmpresasApp.saveInline(${company.id}, 'percentual_liquido_mldu', this.value)" onblur="EmpresasApp.commitPct(this, ${company.id}, 'percentual_liquido_mldu')">
          </td>
          <td class="is-center">${interruptor("consolidacao_padrao", checkedCons)}</td>
          <td class="is-center">${interruptor("gerida_pelo_grupo", checkedGerida)}</td>
          <td class="is-center">${interruptor("cobranca_interna", checkedCobInt)}</td>
          <td class="is-center emp-lock-cell${active === "spe_socios" ? " is-lock-on" : ""}" data-lock="spe_socios">${interruptor("spe_socios", checkedSpe)}</td>
          <td class="is-center emp-lock-cell${active === "gestao_elenco" ? " is-lock-on" : ""}" data-lock="gestao_elenco">${interruptor("gestao_elenco", checkedEllenco)}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
      </div>
    `;

    this._empresasRendering = true;
    try {
      contentDiv.innerHTML = html;
      const nextScroll = document.getElementById("empresas-scroll");
      if (nextScroll) {
        nextScroll.scrollTop = scrollTop;
        requestAnimationFrame(() => {
          if (nextScroll.isConnected) nextScroll.scrollTop = scrollTop;
        });
      }
      if (window.lucide) window.lucide.createIcons();
    } finally {
      this._empresasRendering = false;
    }
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

  /** Garante flags padrão de cobrança interna antes da fila (evita fallback só 1+2). */
  ensureDefaultCobrancaFlags() {
    const defaultCustom = {
      "1": { company_id: 1, nome_usual: "MLDU", percentual_mldu: 100, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 },
      "2": { company_id: 2, nome_usual: "EMPREENDIMENTOS", percentual_mldu: 0, consolidacao_padrao: 0, gerida_pelo_grupo: 1, cobranca_interna: 1 },
      "3": { company_id: 3, nome_usual: "TERRA DO ARAÇARI", percentual_mldu: 0, consolidacao_padrao: 0, gerida_pelo_grupo: 1, cobranca_interna: 1 },
      "4": { company_id: 4, nome_usual: "TERRAS DE ITU", percentual_mldu: 0, consolidacao_padrao: 0, gerida_pelo_grupo: 1, cobranca_interna: 0 },
      "5": { company_id: 5, nome_usual: "MLES", percentual_mldu: 66, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 0 },
      "6": { company_id: 6, nome_usual: "ARAÇARI SPE", percentual_mldu: 50, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 },
      "12": { company_id: 12, nome_usual: "ELLENCO & MLDU BOI", percentual_mldu: 50, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 0 },
      "13": { company_id: 13, nome_usual: "VERCELLINO", percentual_mldu: 27.75, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 },
      "21": { company_id: 21, nome_usual: "YPÊS IV", percentual_mldu: 23.8, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 0 },
      "14": { company_id: 14, nome_usual: "PIRAPITINGUI", percentual_mldu: 0, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 0 },
      "28": { company_id: 28, nome_usual: "RAMOS I", percentual_mldu: 0, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 },
      "32": { company_id: 32, nome_usual: "ITATINGA", percentual_mldu: 100, consolidacao_padrao: 1, gerida_pelo_grupo: 1, cobranca_interna: 1 }
    };
    let customData = {};
    try {
      customData = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
    } catch (e) {
      customData = {};
    }
    let changed = false;
    Object.keys(defaultCustom).forEach((k) => {
      if (!customData[k] || typeof customData[k] !== "object") {
        customData[k] = { ...defaultCustom[k] };
        changed = true;
      } else {
        const cur = customData[k];
        const def = defaultCustom[k];
        if (!cur.nome_usual && def.nome_usual && !cur.nome_usual_edited) {
          cur.nome_usual = def.nome_usual;
          changed = true;
        }
        if (!this.isCobrancaInternaSet(cur) && this.isCobrancaInternaSet(def)) {
          cur.cobranca_interna = def.cobranca_interna;
          changed = true;
        }
      }
    });
    this.hydrateCustomFields(customData, true);
    if (changed) this.persistCustomMap();
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
          percentual_mldu: 0
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
    if (changed) this.persistCustomMap();
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
    <div class="emp-page">
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
window.EmpresasState = EmpresasState;

window.empresasCustomPayload = function() {
  const fromMem = { _v2: true };
  let n = 0;
  Object.values((window.EmpresasState && EmpresasState.customFields) || {}).forEach((item) => {
    if (!item || typeof item !== "object" || item.company_id == null) return;
    fromMem[String(item.company_id)] = item;
    n++;
  });
  if (n) return JSON.stringify(fromMem);
  try { return localStorage.getItem("crm_empresas_custom") || "{}"; } catch (e) { return "{}"; }
};

window.persistEmpresasCustomToFirebase = async function() {
  const fc = window.firebaseCollections;
  if (!fc || !fc.runTransaction || !fc.doc || !window.firebaseDb || typeof window.mergeEmpresasCustom !== "function") return "";
  const docRef = fc.doc(window.firebaseDb, "config", "global");
  let saved = "";
  await fc.runTransaction(window.firebaseDb, async (tx) => {
    const snap = await tx.get(docRef);
    const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
    const cloud = exists ? (snap.data() || {}) : {};
    const mem = window.empresasCustomPayload();
    saved = window.mergeEmpresasCustom(mem, cloud.crm_empresas_custom || "{}");
    tx.set(docRef, { crm_empresas_custom: saved }, { merge: true });
  });
  if (saved && typeof window._originalSetItem === "function") {
    try { window._originalSetItem.call(localStorage, "crm_empresas_custom", saved); } catch (e) {}
  }
  return saved;
};

window.addEventListener("pagehide", () => {
  if (window.EmpresasApp && typeof EmpresasApp.flushCloudUpload === "function") EmpresasApp.flushCloudUpload();
});
