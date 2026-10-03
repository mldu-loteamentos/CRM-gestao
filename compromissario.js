// MÓDULO: COMPROMISSÁRIO (PREFEITURAS E ASSOCIAÇÕES)

function normalizePrefCityKey(city) {
  if (city === null || city === undefined) return "";
  return String(city).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cityConfigWeight(cfg) {
  if (!cfg || typeof cfg !== "object") return 0;
  let score = 0;
  if (cfg.email) score += 3;
  if (cfg.hasPortal) score += 2;
  if (cfg.portalUrl) score += 2;
  if (cfg.portalLogin) score += 1;
  if (cfg.portalSenha) score += 1;
  if (cfg.template) score += 2;
  if (cfg.reqEspecial) score += 1;
  if (cfg.agrupar) score += 1;
  return score;
}

function pickPrefCityConfig(localCfg, cloudCfg) {
  if (!localCfg) return cloudCfg;
  if (!cloudCfg) return localCfg;
  const localTs = Number(localCfg.updatedAt) || 0;
  const cloudTs = Number(cloudCfg.updatedAt) || 0;
  if (localTs && cloudTs) return localTs >= cloudTs ? localCfg : cloudCfg;
  if (localTs && !cloudTs) return cityConfigWeight(localCfg) >= cityConfigWeight(cloudCfg) ? localCfg : cloudCfg;
  if (cloudTs && !localTs) return cityConfigWeight(cloudCfg) >= cityConfigWeight(localCfg) ? cloudCfg : localCfg;
  return cityConfigWeight(localCfg) >= cityConfigWeight(cloudCfg) ? localCfg : cloudCfg;
}

window.mergeCompromissarioConfigs = function(localStr, cloudStr) {
  const parse = (raw) => {
    try { return JSON.parse(raw || "{}") || {}; } catch (e) { return {}; }
  };
  const normalizeMap = (obj) => {
    const out = {};
    Object.entries(obj || {}).forEach(([key, val]) => {
      const cityKey = normalizePrefCityKey(key);
      if (!cityKey) return;
      out[cityKey] = out[cityKey] ? pickPrefCityConfig(val, out[cityKey]) : val;
    });
    return out;
  };
  const local = normalizeMap(parse(localStr));
  const cloud = normalizeMap(parse(cloudStr));
  const merged = {};
  new Set([...Object.keys(local), ...Object.keys(cloud)]).forEach((key) => {
    merged[key] = pickPrefCityConfig(local[key], cloud[key]);
  });
  return JSON.stringify(merged);
};

/** Une declarações de cessão por mês/empresa (mais recente ganha). */
window.mergeCompromissarioCessao = function(localStr, cloudStr) {
  const parse = (raw) => {
    try { return JSON.parse(raw || "{}") || {}; } catch (e) { return {}; }
  };
  const declared = (row) => row && (row.status === "none" || row.status === "has");
  const stamp = (row) => Number((row && (row.declaredAt || row.uploadedAt)) || 0);
  const local = parse(localStr);
  const cloud = parse(cloudStr);
  const out = {};
  new Set([...Object.keys(local), ...Object.keys(cloud)]).forEach((month) => {
    const lm = local[month] && typeof local[month] === "object" ? local[month] : {};
    const cm = cloud[month] && typeof cloud[month] === "object" ? cloud[month] : {};
    out[month] = {};
    new Set([...Object.keys(lm), ...Object.keys(cm)]).forEach((id) => {
      const a = lm[id] || {};
      const b = cm[id] || {};
      if (declared(a) && !declared(b)) { out[month][id] = a; return; }
      if (declared(b) && !declared(a)) { out[month][id] = b; return; }
      if (!declared(a) && !declared(b)) { out[month][id] = stamp(a) >= stamp(b) ? a : b; return; }
      out[month][id] = stamp(a) >= stamp(b) ? a : b;
    });
  });
  return JSON.stringify(out);
};

const CompromissarioApp = {
  CESSAO_LS_KEY: 'crm_compromissario_cessao_v1',
  CESSAO_WORKING_MONTH_KEY: 'crm_compromissario_cessao_working_month',
  CESSAO_FILE_DB: 'crm_compromissario_cessao_files_v1',
  CESSAO_PARSE_VERSION: 8,
  FOLLOW_LS_KEY: 'crm_compromissario_followup_v1',

  state: {
    prefeituras: [],
    contracts: [],
    loading: false,
    files: {}, // contratoId -> file Object (temporary reference)
    openAccordions: new Set(),
    notifiedContracts: {},
    followups: [],
    uiTab: 'parametros',
    /** companyId -> { status: 'none'|'has'|null, fileName, records, uploadedAt } */
    cessaoByCompany: {},
    cessaoMonth: '',
    searchMonth: '',
    cessaoBlobs: {}
  },

  normalizeCityKey(city) {
    return normalizePrefCityKey(city);
  },

  persistConfigs(configs, upload) {
    localStorage.setItem('crm_compromissario_configs', JSON.stringify(configs || {}));
    if (upload !== false && window.forceUploadLocalConfig) {
      return window.forceUploadLocalConfig(true);
    }
    return Promise.resolve();
  },

  configHasSubstance(cfg) {
    return cityConfigWeight(cfg) > 0;
  },

  pushLocalConfigsToCloudIfNeeded() {
    const configs = this.loadConfigs();
    const hasSubstance = Object.values(configs || {}).some((cfg) => this.configHasSubstance(cfg));
    if (hasSubstance && window.forceUploadLocalConfig) {
      window.forceUploadLocalConfig(true).catch(() => {});
    }
  },

  loadConfigs() {
    const configsStr = localStorage.getItem('crm_compromissario_configs') || '{}';
    let raw = {};
    try {
      raw = JSON.parse(configsStr) || {};
    } catch (e) {
      raw = {};
    }

    // Normaliza as chaves salvas no localStorage para reduzir inconsistências
    const configs = {};
    let changed = false;
    for (const [key, val] of Object.entries(raw)) {
      const cityKey = this.normalizeCityKey(key);
      configs[cityKey] = val;
      if (key !== cityKey) changed = true;
    }

    if (changed) {
      localStorage.setItem('crm_compromissario_configs', JSON.stringify(configs));
    }
    return configs;
  },

  async init() {
    this.state.notifiedContracts = JSON.parse(localStorage.getItem('crm_compromissario_notified') || '{}');
    this.state.followups = this.loadFollowups();
    this.loadPrefeituras();
    const root = document.getElementById('compromissario-prefeitura-root');
    const monthEl = document.getElementById('comp-pref-month');
    const existingMonth = monthEl && monthEl.value ? monthEl.value : '';
    if (existingMonth) this.state.searchMonth = existingMonth;
    if (this.state.cessaoMonth) {
      this.persistCessaoMonth();
      this.scheduleCessaoReparse();
    }
    if (root) this.renderPrefeituraShell();
    this.pushLocalConfigsToCloudIfNeeded();
  },

  isPlaceholderOperator(name) {
    const n = this.normalizeCityKey(name);
    return !n || n === 'NAO ATRIBUIDO' || n === 'SEM CARTEIRA INADIMPLENTE' || n === 'NAO COBRAR' || n === 'OUTROS' || n === 'TODOS';
  },

  cityRuleHasOperator(rule) {
    if (!rule) return false;
    const ops = Array.isArray(rule.operator) ? rule.operator : [rule.operator];
    return ops.some((o) => !this.isPlaceholderOperator(o));
  },

  getCitiesWithAssignedOperator() {
    this.loadPrefeituras();
    const cities = new Set();
    const rules = (typeof AppState !== 'undefined' && AppState.rules) || {};
    Object.values(rules).forEach((rule) => {
      if (!rule || !rule.id || !String(rule.id).startsWith('CID_')) return;
      if (!this.cityRuleHasOperator(rule)) return;
      const name = String(rule.desc || String(rule.id).replace(/^CID_/, '').replace(/_/g, ' ')).trim().toUpperCase();
      if (name) cities.add(name);
    });
    const configs = this.loadConfigs();
    Object.keys(configs || {}).forEach((key) => {
      const match = (this.state.prefeituras || []).find((c) => this.normalizeCityKey(c) === this.normalizeCityKey(key));
      cities.add(match || String(key).toUpperCase());
    });
    return Array.from(cities).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  },

  loadPrefeituras() {
    if (!AppState.rules) return;
    const cities = new Set();
    Object.values(AppState.rules).forEach(rule => {
      if (rule.id && rule.id.startsWith('CID_') && rule.desc) {
        cities.add(rule.desc.trim().toUpperCase());
      }
    });
    this.state.prefeituras = Array.from(cities).sort();

    // Migra chaves antigas (com acentos/capitalização) para uma chave normalizada
    const configsStr = localStorage.getItem('crm_compromissario_configs') || '{}';
    try {
      const raw = JSON.parse(configsStr) || {};
      let configs = {};
      let changed = false;
      for (let key in raw) {
        const cityKey = this.normalizeCityKey(key);
        configs[cityKey] = raw[key];
        if (key !== cityKey) changed = true;
      }
      if (changed) localStorage.setItem('crm_compromissario_configs', JSON.stringify(configs));
    } catch (e) {}
  },

  competenciaValue() {
    return String(this.state.cessaoMonth || this.state.searchMonth || '').slice(0, 7);
  },

  cityIsConfigured(cfg) {
    if (!cfg) return false;
    if (cfg.hasPortal) return !!(cfg.portalUrl && String(cfg.portalUrl).trim());
    return !!(cfg.email && String(cfg.email).trim());
  },

  cityNotifyLabel(cfg) {
    if (!this.cityIsConfigured(cfg)) return 'Não configurada';
    return cfg.hasPortal ? 'Portal' : 'E-mail';
  },

  loadFollowups() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.FOLLOW_LS_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  },

  persistFollowups() {
    localStorage.setItem(this.FOLLOW_LS_KEY, JSON.stringify(this.state.followups || []));
  },

  setUiTab(tab) {
    const next = String(tab || 'parametros');
    if (next === 'cessoes' && !this.competenciaValue()) {
      alert('Informe a competência na aba Parâmetros antes de lançar as cessões.');
      this.state.uiTab = 'parametros';
    } else if (next === 'notificar' && !this.competenciaValue()) {
      alert('Informe a competência na aba Parâmetros.');
      this.state.uiTab = 'parametros';
    } else if (next === 'notificar' && !this.isCessaoGateReady()) {
      alert('Declare a cessão (ou a ausência) de todas as empresas na aba Cessões antes de notificar.');
      this.state.uiTab = 'cessoes';
    } else {
      this.state.uiTab = next;
    }
    this.renderPrefeituraShell();
    if (this.state.uiTab === 'notificar') this.ensureNotificarLoaded();
  },

  unconfiguredCities() {
    const configs = this.loadConfigs();
    return this.getCitiesWithAssignedOperator().filter((city) => !this.cityIsConfigured(configs[this.normalizeCityKey(city)]));
  },

  renderPrefeituraShell() {
    const root = document.getElementById('compromissario-prefeitura-root');
    if (!root) return;

    if (!this.state.cessaoMonth && !this.state.searchMonth) {
      const store = this.readCessaoStore();
      const best = this.pickBestCessaoMonth('');
      if (best && this.monthHasCessaoWork(store[best])) {
        this.ensureCessaoMonth(best);
      }
    } else if (this.state.cessaoMonth) {
      this.persistCessaoMonth();
    } else if (this.state.searchMonth) {
      this.ensureCessaoMonth(this.state.searchMonth);
    }

    const tab = this.state.uiTab || 'parametros';
    const competencia = this.competenciaValue();
    const gate = this.isCessaoGateReady();
    const tabs = [
      { id: 'parametros', label: 'Parâmetros', locked: false },
      { id: 'cessoes', label: 'Cessões', locked: !competencia },
      { id: 'notificar', label: 'Notificar', locked: !competencia || !gate },
      { id: 'followup', label: 'Follow-up', locked: false }
    ];

    root.innerHTML = `
      <div class="comp-pref-page">
        <div class="customer-tabs-menu comp-pref-tabs" role="tablist">
          ${tabs.map((t) => `
            <button type="button" class="customer-tab-btn ${tab === t.id ? 'active' : ''} ${t.locked ? 'is-locked' : ''}"
              ${t.locked ? 'disabled' : ''} onclick="CompromissarioApp.setUiTab('${t.id}')">${t.label}</button>
          `).join('')}
        </div>
        <div id="comp-pref-tab-body" class="comp-pref-tab-body"></div>
      </div>
    `;
    this.renderActiveTab();
    if (window.lucide) window.lucide.createIcons();
  },

  renderActiveTab() {
    const tab = this.state.uiTab || 'parametros';
    if (tab === 'cessoes') this.renderCessoesTab();
    else if (tab === 'notificar') this.renderNotificarTab();
    else if (tab === 'followup') this.renderFollowupTab();
    else this.renderParametrosTab();
    this.syncCessaoGateUi();
    if (window.lucide) window.lucide.createIcons();
  },

  renderParametrosTab() {
    const host = document.getElementById('comp-pref-tab-body');
    if (!host) return;
    const month = this.competenciaValue();
    const configs = this.loadConfigs();
    const cities = this.getCitiesWithAssignedOperator();
    const missing = this.unconfiguredCities();
    const rows = cities.map((city) => {
      const cfg = configs[this.normalizeCityKey(city)] || {};
      const ok = this.cityIsConfigured(cfg);
      const how = this.cityNotifyLabel(cfg);
      const detail = cfg.hasPortal
        ? (cfg.portalUrl || 'Portal sem URL')
        : (cfg.email || 'Sem e-mail');
      return `
        <tr>
          <td>${this.escHtml(city)}</td>
          <td><span class="comp-pref-pill ${ok ? 'is-ok' : 'is-warn'}">${this.escHtml(how)}</span></td>
          <td>${this.escHtml(detail)}</td>
          <td style="text-align:right;white-space:nowrap;">
            <button type="button" class="tvig-ico" title="Visualizar" onclick="CompromissarioApp.openCityConfig('${this.escHtml(city)}','view')">
              <i data-lucide="eye" style="width:15px;height:15px;"></i>
            </button>
            <button type="button" class="tvig-ico" title="Editar" onclick="CompromissarioApp.openCityConfig('${this.escHtml(city)}','edit')">
              <i data-lucide="pencil" style="width:15px;height:15px;"></i>
            </button>
          </td>
        </tr>`;
    }).join('');
    host.innerHTML = `
      <div class="search-filter-panel tvig-params">
        <h3 class="tvig-section-title">Competência</h3>
        <div class="tvig-filters">
          <div class="tvig-filter-slot tvig-comp-slot">
            <label class="tvig-comp-label" for="comp-pref-month">Mês de referência</label>
            <input type="month" id="comp-pref-month" class="tvig-comp-input" value="${this.escHtml(month)}"
              onchange="CompromissarioApp.onMonthChange()">
          </div>
          ${month ? `<div class="tvig-filter-actions"><button type="button" class="btn btn-primary" onclick="CompromissarioApp.setUiTab('cessoes')">Continuar para Cessões</button></div>` : ''}
        </div>
      </div>
      ${missing.length ? `
        <div class="comp-pref-alert">
          <strong>Cidades sem configuração:</strong> ${this.escHtml(missing.join(', '))}.
          Defina e-mail ou portal antes de notificar.
        </div>` : ''}
      <h3 class="tvig-section-title">Cidades cadastradas</h3>
      ${cities.length ? `
        <div class="crm-card" style="padding:0;overflow:hidden;">
          <table class="custom-table tvig-list-table">
            <thead>
              <tr>
                <th>Cidade</th>
                <th>Forma de notificar</th>
                <th>Destino</th>
                <th style="width:100px;text-align:right;">Ações</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : '<p style="color:#64748b;margin:0;">Nenhuma cidade com operador. Cadastre a carteira em Atribuição de Operadores.</p>'}
    `;
  },

  renderCessoesTab() {
    const host = document.getElementById('comp-pref-tab-body');
    if (!host) return;
    if (!this.competenciaValue()) {
      host.innerHTML = `<div class="comp-pref-card"><p>Informe a competência na aba Parâmetros.</p></div>`;
      return;
    }
    host.innerHTML = `
      <p id="comp-cessao-gate-hint" class="comp-pref-alert" style="display:none;"></p>
      <div id="comp-cessao-panel"></div>
    `;
    this.renderCessaoPanel();
  },

  renderNotificarTab() {
    const host = document.getElementById('comp-pref-tab-body');
    if (!host) return;
    host.innerHTML = `
      <div class="comp-pref-card" style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0 0 4px;">Notificar prefeituras</h3>
            <p class="comp-pref-help" style="margin:0;">Venda, distrato, troca e cessão da competência, agrupados por cidade.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" id="comp-pref-btn-search" onclick="CompromissarioApp.fetchContracts()">
              <i data-lucide="search" style="width:16px;"></i> <span>Carregar movimentos</span>
            </button>
          </div>
        </div>
        <input type="hidden" id="comp-pref-month" value="${this.escHtml(this.competenciaValue())}">
        <input type="hidden" id="comp-pref-type" value="ALL">
      </div>
      <div class="comp-pref-card" style="padding:0;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <strong>Movimentos</strong>
          <span id="comp-pref-count" style="font-size:0.78rem;color:#64748b;">0 encontrados</span>
        </div>
        <div id="comp-pref-tbody" class="comp-pref-mov-body">
          <div style="text-align:center;padding:32px;color:#94a3b8;">Clique em Carregar movimentos.</div>
        </div>
      </div>
    `;
    if (this.state.contracts && this.state.contracts.length) this.renderTable();
  },

  renderFollowupTab() {
    const host = document.getElementById('comp-pref-tab-body');
    if (!host) return;
    const month = this.competenciaValue();
    const rows = (this.state.followups || [])
      .filter((f) => !month || f.month === month)
      .sort((a, b) => String(b.notifiedAt || '').localeCompare(String(a.notifiedAt || '')));
    const body = rows.length ? rows.map((f) => {
      const done = f.status === 'concluido';
      return `<tr>
        <td>${this.escHtml(this.formatCessaoDate((f.notifiedAt || '').slice(0, 10)) || '—')}</td>
        <td>${this.escHtml(f.city || '—')}</td>
        <td>${this.escHtml(f.type || '—')}</td>
        <td>${this.escHtml(f.unit || f.contractLabel || f.id)}</td>
        <td>${this.escHtml(f.channel === 'portal' ? 'Portal' : 'E-mail')}</td>
        <td>
          <input type="text" class="form-control" value="${this.escHtml(f.protocol || '')}"
            placeholder="Nº protocolo" style="min-width:120px;padding:5px 8px;font-size:0.78rem;"
            onchange="CompromissarioApp.setMovementProtocol('${this.escHtml(f.id)}', this.value)">
        </td>
        <td><span class="comp-pref-pill ${done ? 'is-ok' : 'is-wait'}">${done ? 'Concluído' : 'Aguardando prefeitura'}</span></td>
        <td style="text-align:right;">${done ? '' : `<button type="button" class="btn btn-primary" style="padding:6px 10px;font-size:0.78rem;" onclick="CompromissarioApp.markFollowupDone('${this.escHtml(f.id)}')">Concluído</button>`}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px;">Nenhuma notificação neste mês.</td></tr>`;
    host.innerHTML = `
      <div class="comp-pref-card">
        <h3>Follow-up das notificações</h3>
        <p class="comp-pref-help">Quando a prefeitura confirmar, marque como concluído. Protocolo do portal fica registrado aqui.</p>
        <div class="table-container" style="overflow:auto;">
          <table class="custom-table" style="font-size:0.82rem;">
            <thead>
              <tr>
                <th>Data</th><th>Cidade</th><th>Tipo</th><th>Unidade / contrato</th>
                <th>Canal</th><th>Protocolo</th><th>Situação</th><th></th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  ensureNotificarLoaded() {
    if (!this.competenciaValue() || !this.isCessaoGateReady()) return;
    if (this.state.contracts && this.state.contracts.length) {
      this.renderTable();
      return;
    }
    this.fetchContracts();
  },

  normalizeUnitKey(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  },

  contractUnit(c) {
    return (c && c.salesContractUnits && c.salesContractUnits[0]) || {};
  },

  unitPairKey(c) {
    if (!c) return '';
    const unit = this.contractUnit(c);
    const emp = String(c.enterpriseId || '').trim();
    const uid = String(unit.id || unit.unitId || '').trim();
    const uname = this.normalizeUnitKey(unit.name || '');
    if (!emp) return uid || uname;
    return emp + '|' + (uid || uname);
  },

  customerNameOf(c) {
    if (c && c.salesContractCustomers && c.salesContractCustomers.length) {
      return c.salesContractCustomers[0].name || 'Cliente';
    }
    return 'Cliente';
  },

  unitNameOf(c) {
    if (c && c._unitName) return c._unitName;
    const unit = this.contractUnit(c);
    return unit.name || (unit.id ? ('Unidade ' + unit.id) : '—');
  },

  enterpriseLabel(c) {
    const id = c && c.enterpriseId != null ? String(c.enterpriseId) : '';
    const name = String((c && c.enterpriseName) || '').trim();
    if (id && name) return id + ' - ' + name;
    return name || (id ? ('Emp: ' + id) : 'Sem empreendimento');
  },

  cityFromEnterprise(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const parts = raw.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return raw.toUpperCase();
    let i = 0;
    if (/^\d+$/.test(parts[0])) i = 1;
    const city = parts[i] || parts[0];
    if (/^\d+$/.test(city) && parts[i + 1]) return parts[i + 1].toUpperCase();
    return String(city || raw).toUpperCase();
  },

  cityOfContract(c) {
    if (c && c._city) return String(c._city).toUpperCase();
    if (c && c._cessao) {
      const rec = c._cessao;
      const labeled = this.cityLabelFromCessao(rec);
      if (labeled && !/^\d+$/.test(labeled)) return String(labeled).toUpperCase();
      const fromCessao = this.cityFromEnterprise(c.enterpriseName || rec.enterpriseName || rec.empresa);
      if (fromCessao && !/^\d+$/.test(fromCessao)) return fromCessao;
    }
    return this.cityFromEnterprise((c && c.enterpriseName) || '');
  },

  async fetchContractPages(pathBase) {
    const all = [];
    let offset = 0;
    const limit = 200;
    while (offset < 2000) {
      const res = await siengeFetchWithRetry(pathBase + '&limit=' + limit + '&offset=' + offset).catch(() => ({ results: [] }));
      const rows = (res && res.results) || [];
      all.push.apply(all, rows);
      if (rows.length < limit) break;
      offset += limit;
    }
    return all;
  },

  buildMovements(vendas, distratos, monthPrefix) {
    const sameMonthIssue = (d) => !!(d && d.issueDate && String(d.issueDate).startsWith(monthPrefix));
    const destIds = new Set((distratos || []).map((d) => String(d.id)));
    const destKeep = (distratos || []).filter((d) => !sameMonthIssue(d) && this.shouldNotifyContract(d));
    const vendaKeep = (vendas || []).filter((v) => !destIds.has(String(v.id)) && this.shouldNotifyContract(v));

    const vendaByUnit = new Map();
    vendaKeep.forEach((v) => {
      const k = this.unitPairKey(v);
      if (!k) return;
      if (!vendaByUnit.has(k)) vendaByUnit.set(k, []);
      vendaByUnit.get(k).push(v);
    });

    const usedV = new Set();
    const usedD = new Set();
    const movements = [];

    destKeep.forEach((d) => {
      const k = this.unitPairKey(d);
      const match = (vendaByUnit.get(k) || []).find((v) => !usedV.has(String(v.id)));
      if (!match) return;
      usedV.add(String(match.id));
      usedD.add(String(d.id));
      movements.push({
        id: 'troca-' + d.id + '-' + match.id,
        _movementType: 'Troca',
        _operationType: 'Troca',
        _venda: match,
        _distrato: d,
        enterpriseId: match.enterpriseId || d.enterpriseId,
        enterpriseName: match.enterpriseName || d.enterpriseName,
        companyName: match.companyName || d.companyName,
        companyId: match.companyId || d.companyId,
        salesContractUnits: match.salesContractUnits || d.salesContractUnits,
        salesContractCustomers: match.salesContractCustomers
      });
    });

    vendaKeep.forEach((v) => {
      if (usedV.has(String(v.id))) return;
      movements.push(Object.assign({}, v, {
        _movementType: 'Venda',
        _operationType: 'Venda',
        _venda: v
      }));
    });
    destKeep.forEach((d) => {
      if (usedD.has(String(d.id))) return;
      movements.push(Object.assign({}, d, {
        _movementType: 'Distrato',
        _operationType: 'Distrato',
        _distrato: d
      }));
    });

    movements.sort((a, b) => this.enterpriseLabel(a).localeCompare(this.enterpriseLabel(b), 'pt-BR')
      || this.unitNameOf(a).localeCompare(this.unitNameOf(b), 'pt-BR', { numeric: true }));
    return movements;
  },

  movementDocs(m) {
    const docs = [];
    if (m && m._movementType === 'Cessão') {
      docs.push({ kind: 'CESSAO', contract: { id: m.id }, label: 'Cessão de direitos' });
      return docs;
    }
    if (m && m._distrato) docs.push({ kind: 'DISTRATO', contract: m._distrato, label: 'Distrato' });
    if (m && m._venda) docs.push({ kind: 'CONTRATO', contract: m._venda, label: 'Contrato (venda)' });
    if (!docs.length && m) {
      docs.push({
        kind: (m._operationType === 'Distrato' ? 'DISTRATO' : 'CONTRATO'),
        contract: m,
        label: m._operationType === 'Distrato' ? 'Distrato' : 'Contrato (venda)'
      });
    }
    return docs;
  },

  downloadStoredFile(file, fallbackName) {
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name || fallbackName || 'documento.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {}
  },

  downloadMovementFiles(m) {
    this.movementDocs(m).forEach((doc) => {
      const id = String((doc.contract && doc.contract.id) || '');
      const f = id && this.state.files[id];
      if (f) this.downloadStoredFile(f, (doc.kind || 'doc') + '-' + id + '.pdf');
    });
  },

  cessaoBadgeHtml(c) {
    if (c && (c._movementType === 'Cessão' || c._operationType === 'Cessão')) return '';
    const cessaoHist = this.findCessaoHistoryForContract(c);
    if (!cessaoHist.length) return '';
    const latest = cessaoHist[cessaoHist.length - 1];
    const atuais = (latest.atuais && latest.atuais.length)
      ? latest.atuais
      : (latest.clients || []).filter((x) => x.atual);
    const principal = latest.principal || atuais[0];
    const secundarios = atuais.filter((x) => principal && String(x.id) !== String(principal.id));
    const tipLines = cessaoHist.map((h) => {
      const names = (h.clients || []).map((cl) => {
        const marks = [cl.principal ? '(P)' : '', cl.atual ? '*' : ''].filter(Boolean).join('');
        return `${cl.id ? cl.id + ' - ' : ''}${cl.name}${marks ? ' ' + marks : ''}`;
      }).join(' / ');
      return `${h.data || '—'} → ${names}`;
    }).join(' | ');
    return `
      <div style="margin-top:6px;font-size:0.7rem;line-height:1.35;color:#6b21a8;background:#faf5ff;border:1px solid #e9d5ff;border-radius:4px;padding:4px 6px;" title="${this.escHtml(tipLines)}">
        <strong>Cessão:</strong> ${cessaoHist.length} contrato(s) cedido(s)
        ${principal ? `<br>Atual (P*): ${this.escHtml((principal.id ? principal.id + ' - ' : '') + (principal.name || ''))}` : ''}
        ${secundarios.length ? `<br>Secundário: ${this.escHtml(secundarios.map((s) => (s.id ? s.id + ' - ' : '') + s.name).join(', '))}` : ''}
      </div>`;
  },

  renderDocDropzone(contractId, label) {
    const id = String(contractId || '');
    const fileLoaded = !!(id && this.state.files[id]);
    const fromAnexos = !!(fileLoaded && this.state.files[id]._fromAnexos);
    const fileName = fileLoaded
      ? (fromAnexos ? `IntegrA: ${this.state.files[id].name}` : this.state.files[id].name)
      : (String(label || '').toLowerCase().includes('cess') ? 'Anexe o PDF da cessão' : 'Buscando PDF / arraste aqui...');
    const dropBorder = fileLoaded ? (fromAnexos ? '#0ea5e9' : '#10b981') : '#cbd5e1';
    const dropBg = fileLoaded ? (fromAnexos ? '#f0f9ff' : '#ecfdf5') : '#f8fafc';
    const dropColor = fileLoaded ? (fromAnexos ? '#0369a1' : '#047857') : '#64748b';
    const dropIcon = fileLoaded ? (fromAnexos ? 'cloud-download' : 'check-circle') : 'upload-cloud';
    return `
      <div style="margin-bottom:6px;">
        <div style="font-size:0.68rem;font-weight:700;color:#475569;margin-bottom:3px;text-transform:uppercase;letter-spacing:.02em;">${this.escHtml(label || 'Documento')}</div>
        <div
          id="comp-drop-${id}"
          style="border: 1.5px dashed ${dropBorder}; background: ${dropBg}; border-radius: 6px; padding: 8px 10px; font-size: 0.75rem; color: ${dropColor}; text-align: center; cursor: pointer; transition: all 0.2s;"
          ondragover="CompromissarioApp.onDragOver(event, '${id}')"
          ondragleave="CompromissarioApp.onDragLeave(event, '${id}')"
          ondrop="CompromissarioApp.onDrop(event, '${id}')"
          onclick="document.getElementById('comp-file-${id}').click()"
        >
          <i data-lucide="${dropIcon}" style="width: 14px; vertical-align: middle; margin-right: 4px;"></i>
          ${this.escHtml(fileName)}
        </div>
        <input type="file" id="comp-file-${id}" style="display: none;" onchange="CompromissarioApp.onFileSelect(event, '${id}')">
        ${fileLoaded ? `<button type="button" onclick="event.stopPropagation();CompromissarioApp.downloadStoredFile(CompromissarioApp.state.files['${id}'])" style="margin-top:4px;border:none;background:transparent;color:#0369a1;font-size:0.7rem;font-weight:600;cursor:pointer;padding:0;">Abrir PDF</button>` : ''}
      </div>`;
  },

  renderMovementRow(c, cityName, configs) {
    const id = c.id || '--';
    const opType = c._movementType || c._operationType || 'Desconhecido';
    const badgeMap = {
      Troca: { color: '#7c3aed', bg: '#f5f3ff' },
      Venda: { color: '#10b981', bg: '#ecfdf5' },
      Distrato: { color: '#f43f5e', bg: '#fff1f2' },
      Cessão: { color: '#a16207', bg: '#fefce8' }
    };
    const badge = badgeMap[opType] || { color: '#64748b', bg: '#f1f5f9' };
    const dest = c._distrato;
    const venda = c._venda;
    const unitInfo = this.unitNameOf(c);
    let buyerHtml = this.escHtml(this.customerNameOf(c));
    let idHtml = this.escHtml(String(id));
    if (opType === 'Troca') {
      const oldName = this.customerNameOf(dest);
      const newName = this.customerNameOf(venda);
      idHtml = `${dest && dest.id ? '#' + dest.id : '—'} → ${venda && venda.id ? '#' + venda.id : '—'}`;
      buyerHtml = `
        <div style="font-size:0.78rem;color:#64748b;">Anterior</div>
        <div style="font-weight:600;color:#334155;">${this.escHtml(oldName)}</div>
        <div style="font-size:0.78rem;color:#64748b;margin-top:6px;">Novo</div>
        <div style="font-weight:600;color:#334155;">${this.escHtml(newName)}</div>`;
    } else if (opType === 'Cessão') {
      const rec = c._cessao || {};
      const ant = (rec.anteriores || []).map((x) => (x.id ? x.id + ' - ' : '') + (x.name || '')).join(', ');
      const pri = rec.principal;
      const sec = (rec.atuais || []).filter((x) => !pri || String(x.id) !== String(pri.id));
      idHtml = this.escHtml(this.formatCessaoContrato(rec) || rec.documento || rec.titulo || id);
      buyerHtml = `
        ${ant ? `<div style="font-size:0.78rem;color:#64748b;">Anterior</div><div style="font-weight:600;color:#334155;">${this.escHtml(ant)}</div>` : ''}
        ${pri ? `<div style="font-size:0.78rem;color:#64748b;margin-top:6px;">Atual (P)*</div><div style="font-weight:600;color:#334155;">${this.escHtml((pri.id ? pri.id + ' - ' : '') + (pri.name || ''))}</div>` : ''}
        ${sec.length ? `<div style="font-size:0.78rem;color:#64748b;margin-top:6px;">Secundário *</div><div style="font-weight:600;color:#334155;">${this.escHtml(sec.map((s) => (s.id ? s.id + ' - ' : '') + s.name).join(', '))}</div>` : ''}`;
    }
    const docsHtml = this.movementDocs(c).map((doc) => this.renderDocDropzone(doc.contract && doc.contract.id, doc.label)).join('');
    const cityCfg = configs[this.normalizeCityKey(cityName)] || {};
    return `
      <tr class="comp-mov-row">
        <td class="comp-mov-ct">
          ${idHtml}
          <div class="comp-mov-badge-wrap">
            <span class="comp-mov-badge" style="background:${badge.bg};color:${badge.color};border-color:${badge.color}33;">${opType}</span>
          </div>
          ${this.cessaoBadgeHtml(c)}
        </td>
        <td class="comp-mov-buy"><div class="comp-mov-buyers">${buyerHtml}</div></td>
        <td class="comp-mov-unit">${this.escHtml(unitInfo)}</td>
        <td class="comp-mov-doc">${docsHtml}</td>
        <td class="comp-mov-act">
          <div class="comp-mov-actions">
          ${cityCfg.agrupar ? `
            <span class="comp-mov-grouped"><i data-lucide="layers" style="width: 12px;"></i> Agrupado</span>
          ` : `
            <button type="button" class="comp-mov-btn ${this.state.notifiedContracts[id] ? 'is-done' : 'is-notify'}" onclick="CompromissarioApp.sendEmail('${id}')" title="${this.state.notifiedContracts[id] ? 'Comunicação já realizada' : 'Iniciar Comunicação'}">
              <i data-lucide="${this.state.notifiedContracts[id] ? 'check-check' : (cityCfg.hasPortal ? 'external-link' : 'mail')}" style="width: 14px;"></i> ${this.state.notifiedContracts[id] ? 'Notificado' : (cityCfg.hasPortal ? 'Portal' : 'Notificar')}
            </button>
          `}
          ${cityCfg.hasPortal ? `
            <input type="text" id="comp-proto-${id}" class="form-control" placeholder="Nº protocolo"
              value="${this.escHtml(this.protocolOf(id))}"
              onchange="CompromissarioApp.setMovementProtocol('${id}', this.value)"
              title="Protocolo do portal da prefeitura">
          ` : ''}
          ${cityCfg.reqEspecial ? `
            <button type="button" class="comp-mov-btn is-req" onclick="CompromissarioApp.generateRequirement('${id}')" title="Gerar Documento de Requerimento Especial">
              <i data-lucide="file-text" style="width: 14px;"></i> Requerimento
            </button>
          ` : ''}
          </div>
        </td>
      </tr>`;
  },

  getActivePortfolioCompanies() {
    const ids = (typeof getConfiguredInternalCompanyIds === 'function'
      ? getConfiguredInternalCompanyIds()
      : [1, 2, 3, 6, 13, 28, 32]).map(Number).filter(Number.isFinite);
    const nameFn = typeof getCompanyName === 'function' ? getCompanyName : null;
    return ids
      .map((id) => ({
        id: String(id),
        name: nameFn ? nameFn(id, false) : `Empresa #${id}`
      }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  },

  readCessaoStore() {
    try {
      return JSON.parse(localStorage.getItem(this.CESSAO_LS_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  },

  writeCessaoStore(store) {
    try {
      localStorage.setItem(this.CESSAO_LS_KEY, JSON.stringify(store || {}));
    } catch (e) {
      console.warn('[Compromissario] falha ao salvar cessões', e);
    }
  },

  rowHasCessaoWork(row) {
    return !!(row && (
      row.status === 'none' ||
      row.status === 'has' ||
      row.fileName ||
      (Array.isArray(row.records) && row.records.length)
    ));
  },

  hasCessaoWorkInMemory() {
    return Object.values(this.state.cessaoByCompany || {}).some((r) => this.rowHasCessaoWork(r));
  },

  monthHasCessaoWork(monthMap) {
    if (!monthMap || typeof monthMap !== 'object') return false;
    return Object.values(monthMap).some((r) => this.rowHasCessaoWork(r));
  },

  getCessaoWorkingMonth() {
    try {
      return String(localStorage.getItem(this.CESSAO_WORKING_MONTH_KEY) || '').slice(0, 7);
    } catch (e) {
      return '';
    }
  },

  setCessaoWorkingMonth(month) {
    const m = String(month || '').slice(0, 7);
    if (!m) return;
    try {
      localStorage.setItem(this.CESSAO_WORKING_MONTH_KEY, m);
    } catch (e) {}
  },

  pickBestCessaoMonth(preferred) {
    const store = this.readCessaoStore();
    const working = this.getCessaoWorkingMonth();
    if (this.state.cessaoMonth && this.hasCessaoWorkInMemory()) return this.state.cessaoMonth;
    if (working && this.monthHasCessaoWork(store[working])) return working;
    const pref = String(preferred || '').slice(0, 7);
    if (pref && this.monthHasCessaoWork(store[pref])) return pref;
    let best = '';
    let bestTs = 0;
    Object.keys(store || {}).forEach((m) => {
      const map = store[m] || {};
      Object.values(map).forEach((r) => {
        if (!this.rowHasCessaoWork(r)) return;
        const ts = Number((r && (r.uploadedAt || r.declaredAt)) || 0);
        if (ts >= bestTs) {
          bestTs = ts;
          best = m;
        }
      });
    });
    return best || working || pref;
  },

  cessaoFileKey(month, companyId) {
    return String(month || this.state.cessaoMonth || '') + '|' + String(companyId);
  },

  openCessaoFileDb() {
    if (this._cessaoFileDb) return Promise.resolve(this._cessaoFileDb);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.CESSAO_FILE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      };
      req.onsuccess = () => {
        this._cessaoFileDb = req.result;
        resolve(this._cessaoFileDb);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async saveCessaoFileBlob(companyId, file) {
    if (!file || !companyId || !this.state.cessaoMonth) return;
    try {
      const buf = await file.arrayBuffer();
      const payload = { name: file.name, type: file.type || '', buf, savedAt: Date.now() };
      this.state.cessaoBlobs[String(companyId)] = payload;
      const db = await this.openCessaoFileDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(payload, this.cessaoFileKey(this.state.cessaoMonth, companyId));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[Compromissario] não gravou o arquivo da cessão', e);
    }
  },

  async deleteCessaoFileBlob(companyId) {
    const id = String(companyId);
    delete this.state.cessaoBlobs[id];
    if (!this.state.cessaoMonth) return;
    try {
      const db = await this.openCessaoFileDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete(this.cessaoFileKey(this.state.cessaoMonth, id));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  },

  cessaoPayloadToFile(payload) {
    if (!payload || payload.buf == null) return null;
    const name = payload.name || 'cessao.xlsx';
    const type = payload.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const buf = payload.buf;
    if (typeof File !== 'undefined') {
      if (buf instanceof Blob) return new File([buf], name, { type: buf.type || type });
      return new File([buf], name, { type });
    }
    return null;
  },

  async openCessaoFile(companyId) {
    const payload = await this.loadCessaoFileBlob(companyId);
    const file = this.cessaoPayloadToFile(payload);
    if (!file) {
      alert('Não foi possível abrir o Excel desta empresa.');
      return;
    }
    this.downloadStoredFile(file, file.name || 'cessao.xlsx');
  },

  async loadCessaoFileBlob(companyId) {
    const id = String(companyId);
    if (this.state.cessaoBlobs[id] && this.state.cessaoBlobs[id].buf) return this.state.cessaoBlobs[id];
    if (!this.state.cessaoMonth) return this.state.cessaoBlobs[id] || null;
    try {
      const db = await this.openCessaoFileDb();
      const payload = await new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(this.cessaoFileKey(this.state.cessaoMonth, id));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (payload && payload.buf) this.state.cessaoBlobs[id] = payload;
      return payload || null;
    } catch (e) {
      return this.state.cessaoBlobs[id] || null;
    }
  },

  scheduleCessaoReparse() {
    if (this._cessaoReparseTimer) clearTimeout(this._cessaoReparseTimer);
    this._cessaoReparseTimer = setTimeout(() => {
      this.reparseStoredCessaoFiles().catch((e) => {
        console.warn('[Compromissario] reparse cessão', e);
      });
    }, 0);
  },

  async reparseStoredCessaoFiles() {
    if (this._reparseCessaoBusy) return;
    this._reparseCessaoBusy = true;
    let changed = false;
    try {
      const jobs = Object.entries(this.state.cessaoByCompany || {}).map(async ([id, row]) => {
        if (!row || row.status !== 'has') return;
        const month = String(this.state.cessaoMonth || '').slice(0, 7);
        const recs = Array.isArray(row.records) ? row.records : [];
        const allInMonth = recs.length && recs.every((r) => {
          const iso = this.resolveCessaoIso(r);
          return iso && month && iso.slice(0, 7) === month;
        });
        const ver = Number(row.parseVersion || 0);
        const missingCedente = recs.some((r) => !(r.anteriores && r.anteriores.length));
        if (ver >= this.CESSAO_PARSE_VERSION && allInMonth && recs.length >= 1 && !missingCedente) return;
        const payload = await this.loadCessaoFileBlob(id);
        const file = this.cessaoPayloadToFile(payload);
        if (!file) return;
        try {
          const parsed = await this.parseCessaoReportFile(file);
          if (parsed.records && parsed.records.length) {
            row.records = parsed.records;
            row.parseNote = parsed.note || '';
            row.parseVersion = this.CESSAO_PARSE_VERSION;
            if (payload.name) row.fileName = payload.name;
            changed = true;
          }
        } catch (e) {
          console.warn('[Compromissario] reparse cessão', id, e);
        }
      });
      await Promise.all(jobs);
      if (changed) {
        this.persistCessaoMonth();
        this.renderCessaoPanel();
        this.syncCessaoGateUi();
      }
      await this.hydrateCessaoUnits();
      this.renderCessaoPanel();
    } finally {
      this._reparseCessaoBusy = false;
    }
  },

  ensureCessaoMonth(month) {
    const m = String(month || '').slice(0, 7);
    if (!m) return;
    if (this.state.cessaoMonth && this.state.cessaoMonth !== m) {
      this.persistCessaoMonth();
    }
    if (this.state.cessaoMonth === m && this.hasCessaoWorkInMemory()) {
      this.scheduleCessaoReparse();
      return;
    }
    this.state.cessaoMonth = m;
    this.setCessaoWorkingMonth(m);
    const store = this.readCessaoStore();
    const monthMap = store[m] || {};
    const pickPrev = (id) => {
      const sid = String(id);
      return monthMap[sid] || monthMap[Number(sid)] || monthMap[id] || {};
    };
    const next = {};
    this.getActivePortfolioCompanies().forEach((c) => {
      const prev = pickPrev(c.id);
      const records = this.normalizeCessaoRecords(Array.isArray(prev.records) ? prev.records : []);
      next[c.id] = {
        status: prev.status === 'none' || prev.status === 'has' ? prev.status : null,
        fileName: prev.fileName || '',
        records,
        uploadedAt: prev.uploadedAt || null,
        declaredAt: prev.declaredAt || null,
          parseNote: this.keepCessaoParseNote(prev.parseNote, records),
        parseVersion: prev.parseVersion || 0
      };
    });
    this.state.cessaoByCompany = next;
    this.scheduleCessaoReparse();
  },

  persistCessaoMonth() {
    const m = this.state.cessaoMonth;
    if (!m) return;
    const store = this.readCessaoStore();
    const prevMonth = store[m] && typeof store[m] === 'object' ? store[m] : {};
    const next = { ...prevMonth };
    Object.entries(this.state.cessaoByCompany || {}).forEach(([id, row]) => {
      if (!row) return;
      const prev = next[id] || next[String(id)] || next[Number(id)] || {};
      if ((row.status == null || row.status === '') && (prev.status === 'none' || prev.status === 'has')) {
        next[id] = prev;
        return;
      }
      const incomingEmpty = !row.fileName && row.status !== 'none' && !(Array.isArray(row.records) && row.records.length);
      const prevHasFile = !!(prev.fileName || (Array.isArray(prev.records) && prev.records.length));
      if (incomingEmpty && prevHasFile && row.status !== 'none') {
        const records = this.normalizeCessaoRecords(Array.isArray(prev.records) ? prev.records : []);
        next[id] = {
          ...prev,
          ...row,
          fileName: prev.fileName,
          records,
          uploadedAt: prev.uploadedAt || row.uploadedAt || null,
          parseNote: this.keepCessaoParseNote(row.parseNote || prev.parseNote, records)
        };
      } else {
        const records = this.normalizeCessaoRecords(Array.isArray(row.records) ? row.records : []);
        next[id] = Object.assign({}, row, {
          records,
          parseNote: this.keepCessaoParseNote(row.parseNote, records)
        });
      }
    });
    store[m] = next;
    this.writeCessaoStore(store);
    this.setCessaoWorkingMonth(m);
    if (window.forceUploadLocalConfig) {
      window.forceUploadLocalConfig(true).catch(() => {});
    }
  },

  keepCessaoParseNote(note, records) {
    const text = String(note || '');
    const warn = /nenhum em|outras datas|confira o mês|não identificado|falhou|parcial|PDF/i.test(text);
    if (warn) return text;
    const n = Array.isArray(records) ? records.length : 0;
    return n ? `${n} cessão(ões) na competência` : text;
  },

  sameCessaoCity(a, b) {
    const x = this.foldHeader(a);
    const y = this.foldHeader(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const short = x.length < y.length ? x : y;
    const long = x.length < y.length ? y : x;
    return short.length >= 8 && long.indexOf(short) >= 0;
  },

  cityHintFromCessao(rec) {
    const cidade = String((rec && rec.cidade) || '').trim();
    if (cidade && !/^\d+$/.test(cidade)) return cidade.toUpperCase();
    const emp = String((rec && rec.empresa) || '');
    const parts = emp.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) return String(parts[1] || '').toUpperCase();
    const folded = this.foldHeader(emp);
    if (parts.length === 1 && !/^\d+$/.test(parts[0]) && !/EMPREENDIMENTO|IMOBILIAR|SPE|LTDA|DESENVOLV/.test(folded)) {
      return parts[0].toUpperCase();
    }
    return '';
  },

  cityLabelFromCessao(rec) {
    const hint = this.cityHintFromCessao(rec);
    if (hint) return hint;
    const fromEmp = this.cityFromEnterprise((rec && rec.empresa) || '');
    if (fromEmp && !/^\d+$/.test(fromEmp)) return fromEmp;
    return '';
  },

  resolveCessaoEnterprise(rec, companyId) {
    const city = this.cityLabelFromCessao(rec);
    const empRaw = String((rec && rec.empresa) || '');
    const empId = (empRaw.match(/^(\d+)/) || [])[1] || '';
    let id = empId || String((rec && rec.enterpriseId) || '');
    let name = '';
    if (empId || (empRaw && empRaw !== city)) {
      name = this.enterpriseNameFromCessao({ empresa: empRaw, enterpriseName: '' });
    }
    const hydratedName = String((rec && rec.enterpriseName) || '');
    const hydratedId = String((rec && rec.enterpriseId) || '');
    const hydCity = this.cityFromEnterprise(hydratedName);
    if (hydratedName && (!city || this.sameCessaoCity(city, hydCity))) {
      name = hydratedName;
      if (hydratedId) id = hydratedId;
    } else if (city && hydCity && !this.sameCessaoCity(city, hydCity)) {
      if (!empId) id = '';
      if (this.sameCessaoCity(this.cityFromEnterprise(name), hydCity)) name = '';
    }
    if ((!id || !name) && city && window.AppState && Array.isArray(window.AppState.cachedCostCenters)) {
      const matches = window.AppState.cachedCostCenters.filter((c) =>
        this.sameCessaoCity(city, this.cityFromEnterprise(c.name || c.nome || ''))
      );
      if (id) {
        const hit = matches.find((c) => String(c.id) === String(id));
        if (hit) name = hit.name || name;
      } else if (matches.length === 1) {
        id = String(matches[0].id);
        name = matches[0].name || name;
      }
    }
    return {
      enterpriseId: id,
      enterpriseName: name,
      city: city || this.cityFromEnterprise(name) || ''
    };
  },

  cessaoCitySummary() {
    const cities = new Map();
    Object.values(this.state.cessaoByCompany || {}).forEach((row) => {
      if (!row || row.status !== 'has') return;
      this.normalizeCessaoRecords(row.records).forEach((rec) => {
        const city = this.cityLabelFromCessao(rec) || 'Cidade não identificada';
        cities.set(city, (cities.get(city) || 0) + 1);
      });
    });
    return [...cities.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  },

  onMonthChange() {
    const el = document.getElementById('comp-pref-month');
    const month = el ? el.value : '';
    if (this.state.cessaoMonth && this.state.cessaoMonth !== month) {
      this.persistCessaoMonth();
    }
    this.state.searchMonth = month;
    this.state.contracts = [];
    this.state.files = {};
    if (month) this.ensureCessaoMonth(month);
    else this.state.cessaoMonth = '';
    this.renderPrefeituraShell();
  },

  getCessaoPendingCompanies() {
    const companies = this.getActivePortfolioCompanies();
    return companies.filter((c) => {
      const row = this.state.cessaoByCompany[c.id] || {};
      if (row.status === 'none') return false;
      if (row.status === 'has' && row.fileName) return false;
      return true;
    });
  },

  isCessaoGateReady() {
    return this.getCessaoPendingCompanies().length === 0;
  },

  assertCessaoGate(actionLabel) {
    if (this.isCessaoGateReady()) return true;
    const pending = this.getCessaoPendingCompanies();
    const names = pending.slice(0, 5).map((c) => `${c.id} - ${c.name}`).join('\n');
    alert(
      `Antes de ${actionLabel || 'continuar'}, declare a cessão de todas as empresas com carteira ativa:\n` +
      `marque "Não teve cessão" ou envie o relatório Sienge quando houver.\n\nPendentes:\n${names}` +
      (pending.length > 5 ? `\n… e mais ${pending.length - 5}` : '')
    );
    this.syncCessaoGateUi();
    return false;
  },

  syncCessaoGateUi() {
    const ready = this.isCessaoGateReady();
    const btn = document.getElementById('comp-pref-btn-search');
    const hint = document.getElementById('comp-cessao-gate-hint');
    if (btn) {
      btn.disabled = !ready;
      btn.style.opacity = ready ? '1' : '0.55';
      btn.style.cursor = ready ? 'pointer' : 'not-allowed';
      btn.title = ready
        ? 'Buscar vendas e distratos do mês'
        : 'Declare cessão (ou ausência) de todas as empresas com carteira ativa';
    }
    if (hint) {
      hint.style.display = 'none';
      hint.textContent = '';
    }
  },

  captureCessaoScroll() {
    const list = document.getElementById('comp-cessao-list');
    const main = document.querySelector('.main-content');
    return {
      list: list ? list.scrollTop : 0,
      main: main ? main.scrollTop : 0,
      win: window.scrollY || document.documentElement.scrollTop || 0
    };
  },

  restoreCessaoScroll(saved, companyId) {
    const apply = () => {
      const list = document.getElementById('comp-cessao-list');
      const main = document.querySelector('.main-content');
      if (list && saved) list.scrollTop = saved.list || 0;
      if (main && saved) main.scrollTop = saved.main || 0;
      if (saved && typeof window.scrollTo === 'function') {
        try { window.scrollTo({ top: saved.win || 0, left: 0, behavior: 'instant' }); }
        catch (e) { window.scrollTo(0, saved.win || 0); }
      }
      if (companyId) {
        const el = document.querySelector('input[name="comp-cessao-' + companyId + '"]:checked');
        if (el && typeof el.focus === 'function') {
          try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
        }
      }
    };
    apply();
    requestAnimationFrame(apply);
  },

  renderCessaoPanel(opts) {
    const panel = document.getElementById('comp-cessao-panel');
    if (!panel) return;
    const saved = this.captureCessaoScroll();
    const focusId = opts && opts.focusCompanyId;
    const companies = this.getActivePortfolioCompanies();
    const month = this.state.cessaoMonth || '';
    const monthLabel = this.formatCessaoDate(month + '-01') || month;
    const ready = this.isCessaoGateReady();
    const pending = this.getCessaoPendingCompanies().length;
    const citySummary = this.cessaoCitySummary();
    const totalMonth = citySummary.reduce((n, x) => n + x[1], 0);

    const rows = companies.map((c) => {
      const row = this.state.cessaoByCompany[c.id] || {};
      const status = row.status;
      const hasFile = !!(row.fileName);
      const noneChecked = status === 'none' ? 'checked' : '';
      const hasChecked = status === 'has' ? 'checked' : '';
      const uploadDisabled = status !== 'has' ? 'disabled' : '';
      const tone = status === 'none' ? 'is-none' : (status === 'has' && hasFile ? 'is-has' : (status === 'has' ? 'is-wait' : 'is-pending'));
      const fileInput = `<input type="file" id="comp-cessao-file-${c.id}" accept=".xlsx,.xls,.csv,.txt,.pdf" ${uploadDisabled}
                onchange="CompromissarioApp.onCessaoFile('${c.id}', event)">`;
      let relHtml = fileInput;
      if (status === 'has' && hasFile) {
        relHtml = `
            <div class="comp-cessao-upload">
              ${fileInput}
              <button type="button" class="comp-cessao-xls" onclick="CompromissarioApp.openCessaoFile('${c.id}')" title="${this.escHtml(row.fileName || 'Abrir Excel')}">
                <i data-lucide="file-spreadsheet"></i>
                <span>Excel</span>
              </button>
              <button type="button" class="btn btn-cancel" style="padding:4px 10px;font-size:0.74rem;" onclick="CompromissarioApp.clearCessaoFile('${c.id}')">Remover</button>
            </div>`;
      } else if (status === 'has') {
        relHtml = `
            <div class="comp-cessao-upload">
              ${fileInput}
              <button type="button" class="comp-cessao-xls is-empty" onclick="document.getElementById('comp-cessao-file-${c.id}').click()">
                <i data-lucide="file-spreadsheet"></i>
                <span>Anexar Excel</span>
              </button>
            </div>`;
      }
      return `
        <tr class="comp-cessao-row ${tone}">
          <td class="comp-cessao-emp">
            <span class="comp-cessao-emp-id">${c.id}</span>
            <span class="comp-cessao-emp-name">${this.escHtml(c.name)}</span>
          </td>
          <td class="comp-cessao-mes">
            <div class="comp-cessao-choice">
              <label><input type="radio" name="comp-cessao-${c.id}" value="none" ${noneChecked}
                onchange="CompromissarioApp.setCessaoStatus('${c.id}','none')"> Não teve</label>
              <label><input type="radio" name="comp-cessao-${c.id}" value="has" ${hasChecked}
                onchange="CompromissarioApp.setCessaoStatus('${c.id}','has')"> Teve</label>
            </div>
          </td>
          <td class="comp-cessao-rel">${relHtml}</td>
        </tr>`;
    }).join('');

    panel.innerHTML = `
      <div class="search-filter-panel tvig-params">
        <h3 class="tvig-section-title">Cessões · ${this.escHtml(month || monthLabel)}</h3>
        <div class="comp-cessao-toolbar">
          <div class="comp-cessao-stats">
            ${pending ? `<span class="comp-pref-pill is-warn">${pending} empresa(s) sem declaração</span>` : `<span class="comp-pref-pill is-ok">Competência gravada</span>`}
            ${totalMonth ? `<span class="comp-pref-pill is-ok">${totalMonth} cessão(ões) no mês${citySummary.length ? ' · ' + citySummary.map(([city, n]) => this.escHtml(city) + ' (' + n + ')').join(', ') : ''}</span>` : ''}
          </div>
          ${ready ? `<button type="button" class="btn btn-primary" onclick="CompromissarioApp.setUiTab('notificar')">Continuar para Notificar</button>` : ''}
        </div>
      </div>
      <div class="crm-card" style="padding:0;overflow:hidden;" id="comp-cessao-list">
        ${companies.length ? `
          <table class="custom-table tvig-list-table comp-cessao-table">
            <colgroup>
              <col class="comp-cessao-col-emp">
              <col class="comp-cessao-col-mes">
              <col class="comp-cessao-col-rel">
            </colgroup>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Neste mês</th>
                <th>Relatório</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>` : '<p style="color:#64748b;padding:16px;">Nenhuma empresa com carteira ativa.</p>'}
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    this.restoreCessaoScroll(saved, focusId);
  },

  escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  setCessaoStatus(companyId, status) {
    const id = String(companyId);
    if (!this.state.cessaoByCompany[id]) {
      this.state.cessaoByCompany[id] = { status: null, fileName: '', records: [], uploadedAt: null, declaredAt: null, parseNote: '' };
    }
    const row = this.state.cessaoByCompany[id];
    row.status = status === 'none' || status === 'has' ? status : null;
    row.declaredAt = Date.now();
    if (row.status === 'none') {
      row.fileName = '';
      row.records = [];
      row.uploadedAt = null;
      row.parseNote = '';
      this.deleteCessaoFileBlob(id);
    }
    this.persistCessaoMonth();
    this.renderCessaoPanel({ focusCompanyId: id });
    this.syncCessaoGateUi();
  },

  clearCessaoFile(companyId) {
    const id = String(companyId);
    const row = this.state.cessaoByCompany[id];
    if (!row) return;
    row.fileName = '';
    row.records = [];
    row.uploadedAt = null;
    row.parseNote = '';
    if (row.status === 'has') {
      // permanece "has" até novo upload
    }
    this.deleteCessaoFileBlob(id);
    this.persistCessaoMonth();
    this.renderCessaoPanel({ focusCompanyId: id });
    this.syncCessaoGateUi();
  },

  async onCessaoFile(companyId, event) {
    const id = String(companyId);
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (!this.state.cessaoByCompany[id]) {
      this.state.cessaoByCompany[id] = { status: 'has', fileName: '', records: [], uploadedAt: null, parseNote: '' };
    }
    const row = this.state.cessaoByCompany[id];
    row.status = 'has';
    try {
      const parsed = await this.parseCessaoReportFile(file);
      row.fileName = file.name;
      row.records = parsed.records || [];
      row.parseNote = parsed.note || '';
      row.parseVersion = this.CESSAO_PARSE_VERSION;
      row.uploadedAt = Date.now();
      row.declaredAt = Date.now();
      await this.saveCessaoFileBlob(id, file);
      this.persistCessaoMonth();
      this.renderCessaoPanel({ focusCompanyId: id });
      this.syncCessaoGateUi();
      this.hydrateCessaoUnits().then(() => {
        this.renderCessaoPanel({ focusCompanyId: id });
      }).catch(() => {});
    } catch (e) {
      console.warn('[Compromissario] parse cessão', e);
      // Mesmo sem parse, o anexo vale para liberar o gate
      row.fileName = file.name;
      row.records = [];
      row.parseNote = 'Arquivo anexado (leitura parcial/indisponível)';
      row.uploadedAt = Date.now();
      await this.saveCessaoFileBlob(id, file);
      this.persistCessaoMonth();
      this.renderCessaoPanel({ focusCompanyId: id });
      this.syncCessaoGateUi();
      alert('Relatório anexado, mas a leitura automática falhou. O gate foi liberado para esta empresa. Detalhe: ' + (e && e.message ? e.message : e));
    } finally {
      if (input) input.value = '';
    }
  },

  async parseCessaoReportFile(file) {
    const name = String(file.name || '').toLowerCase();
    if (name.endsWith('.pdf')) {
      return {
        records: [],
        note: 'PDF anexado (para histórico automático, exporte XLS/CSV no Sienge)'
      };
    }
    let matrix = [];
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      const text = await file.text();
      matrix = this.matrixFromDelimitedText(text);
    } else {
      if (typeof XLSX === 'undefined') {
        throw new Error('Biblioteca XLSX indisponível');
      }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellText: true, raw: false });
      const merged = [];
      (wb.SheetNames || []).forEach((sheetName) => {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) return;
        const matrixA = this.excelSheetToMatrix(sheet, wb);
        const matrixB = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        merged.push(this.parseCessaoMatrix(matrixA));
        merged.push(this.parseCessaoMatrix(matrixB));
        merged.push(this.parseCessaoMatrixLoose(matrixA));
        merged.push(this.parseCessaoMatrixLoose(matrixB));
      });
      return this.mergeCessaoParses(merged);
    }
    return this.parseCessaoMatrix(matrix);
  },

  mergeCessaoParses(list) {
    const raw = [];
    (list || []).forEach((p) => {
      if (p && Array.isArray(p.raw) && p.raw.length) {
        p.raw.forEach((rec) => raw.push(rec));
      }
    });
    if (!raw.length) {
      (list || []).forEach((p) => {
        ((p && p.all) || (p && p.records) || []).forEach((rec) => raw.push(rec));
      });
    }
    const records = this.normalizeCessaoRecords(raw);
    const all = this.normalizeCessaoRecords(raw, { all: true });
    let note = records.length ? `${records.length} cessão(ões) na competência` : ((list[0] && list[0].note) || 'Nenhuma cessão lida na competência');
    if (!records.length && all.length) {
      const months = [...new Set(all.map((r) => (r.dataIso || '').slice(0, 7)).filter(Boolean))].join(', ');
      note = `O Sienge trouxe ${all.length} evento(s) em ${months || 'outras datas'}, nenhum em ${this.competenciaValue() || '—'}. Confira o mês em Parâmetros.`;
    }
    return { records, all, raw, note };
  },

  excelSheetToMatrix(sheet, wb) {
    if (!sheet || !sheet['!ref']) return [];
    const date1904 = !!(wb && wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rows = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        row.push(this.excelCellDisplay(cell, date1904));
      }
      rows.push(row);
    }
    (sheet['!merges'] || []).forEach((m) => {
      if (!m) return;
      const src = rows[m.s.r] && rows[m.s.r][m.s.c];
      if (src == null || src === '') return;
      for (let r = m.s.r; r <= m.e.r; r++) {
        if (!rows[r]) continue;
        for (let c = m.s.c; c <= m.e.c; c++) {
          if (rows[r][c] == null || rows[r][c] === '') rows[r][c] = src;
        }
      }
    });
    return rows;
  },

  excelCellDisplay(cell, date1904) {
    if (!cell) return '';
    const formatted = cell.w != null ? String(cell.w).trim() : '';
    if (formatted && formatted !== 'Invalid Date') return formatted;
    if (cell.t === 'd' && cell.v instanceof Date && !isNaN(cell.v.getTime())) {
      return this.formatDateBrFromDate(cell.v);
    }
    if (cell.t === 'n' && cell.v != null && this.excelLooksLikeDate(cell)) {
      return this.formatExcelSerialBr(Number(cell.v), date1904);
    }
    if (cell.v instanceof Date && !isNaN(cell.v.getTime())) {
      return this.formatDateBrFromDate(cell.v);
    }
    if (cell.v == null || cell.v === '') return '';
    return String(cell.v).trim();
  },

  excelLooksLikeDate(cell) {
    const z = String((cell && cell.z) || '').toLowerCase();
    if (/d+|m+|y+|aa|dd|mm/.test(z)) return true;
    return false;
  },

  formatExcelSerialBr(n, date1904) {
    if (!Number.isFinite(n) || n < 20000 || n > 80000) return '';
    const epoch = date1904 ? 24107 : 25569;
    const utc = new Date(Math.round((n - epoch) * 86400 * 1000));
    if (isNaN(utc.getTime())) return '';
    return this.pad2(utc.getUTCDate()) + '/' + this.pad2(utc.getUTCMonth() + 1) + '/' + utc.getUTCFullYear();
  },

  formatDateBrFromDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
      return this.pad2(d.getUTCDate()) + '/' + this.pad2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
    }
    return this.pad2(d.getDate()) + '/' + this.pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  },

  matrixFromDelimitedText(text) {
    const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    return lines.map((line) => line.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
  },

  foldHeader(s) {
    return String(s || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  isCessaoHeaderRow(cells) {
    const folded = (cells || []).map((c) => this.foldHeader(c));
    const hasData = folded.some((h) => h.includes('DATA CESSAO') || h.includes('DATA DA CESSAO') || (h.includes('CESSAO') && h.includes('DATA')) || h === 'DATA');
    const hasTitulo = folded.some((h) => h === 'TITULO' || h.includes('TITULO'));
    const hasCliente = folded.some((h) => h.includes('CLIENTE'));
    return hasData && hasTitulo && hasCliente;
  },

  isCessaoNoiseText(data, titulo, documento, clienteRaw) {
    const h = [data, titulo, documento, clienteRaw].map((x) => this.foldHeader(x)).join(' ');
    if (this.foldHeader(titulo) === 'TITULO') return true;
    if (this.foldHeader(data) === 'DATA CESSAO' || this.foldHeader(data) === 'DATA') return true;
    if (/CLIENTE ATUAL|CLIENTE PRINCIPAL|EM APROVACAO|CONJUGE/.test(h)) return true;
    return false;
  },

  extractContratoNumero(documento) {
    const s = String(documento || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    let m = s.match(/CVMOURALEIT\d+/i);
    if (m) return m[0].toUpperCase();
    m = s.match(/(?:CT|CV)\s*\/\s*([A-Z0-9]+)/i);
    if (m) return m[1];
    m = s.match(/\b(\d{4,6})\b/);
    if (m) return m[1];
    return s.replace(/[^\dA-Z]/gi, '');
  },

  formatCessaoContrato(rec) {
    const num = (rec && rec.contratoNumero) || this.extractContratoNumero(rec && rec.documento);
    if (!num) return String((rec && rec.titulo) || '').replace(/\.0$/, '');
    if (/^CV/i.test(num) || /MOURALEIT/i.test(num)) return num;
    return 'CT / ' + num;
  },

  digitsOnly(v) {
    return String(v == null ? '' : v).replace(/\.0$/, '').replace(/\D/g, '');
  },

  validIsoDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    const y = Number(m[1]);
    const a = Number(m[2]);
    const b = Number(m[3]);
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return this.dateToIsoParts(y, a, b);
    if (a > 12 && b >= 1 && b <= 12) return this.dateToIsoParts(y, b, a);
    return '';
  },

  pad2(n) {
    return String(n).padStart(2, '0');
  },

  dateToIsoParts(y, month, day) {
    if (!Number.isFinite(y) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return y + '-' + this.pad2(month) + '-' + this.pad2(day);
  },

  cellToText(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) return this.formatDateBrFromDate(v);
    const s = String(v).trim();
    if (!s || /^invalid date$/i.test(s)) return '';
    return s;
  },

  cessaoDateIso(raw) {
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      const br = this.formatDateBrFromDate(raw);
      return this.cessaoDateIso(br) || this.dateToIsoParts(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
    }
    const s = String(raw == null ? '' : raw).trim();
    if (!s || /^invalid date$/i.test(s)) return '';
    const valid = this.validIsoDate(s);
    if (valid) return valid;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const recovered = this.validIsoDate(s.slice(0, 10));
      if (recovered) return recovered;
    }
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      const serial = this.formatExcelSerialBr(n, false);
      if (serial) return this.cessaoDateIso(serial);
    }
    const long = s.match(/([A-Za-z]{3,})[ .,-]+(\d{1,2})[ .,-]+(\d{2,4})/)
      || s.match(/(\d{1,2})[ .,-]+([A-Za-z]{3,})[ .,-]+(\d{2,4})/);
    if (long) {
      const months = {
        JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5,
        JUN: 6, JUL: 7, AGO: 8, AUG: 8, SET: 9, SEP: 9, OUT: 10, OCT: 10,
        NOV: 11, DEZ: 12, DEC: 12
      };
      const a = long[1];
      const b = long[2];
      const y = Number(long[3]);
      const ma = months[String(a).slice(0, 3).toUpperCase()];
      const mb = months[String(b).slice(0, 3).toUpperCase()];
      if (ma) return this.dateToIsoParts(y, ma, Number(b));
      if (mb) return this.dateToIsoParts(y, mb, Number(a));
    }
    const sl = s.replace(/[\u200e\u200f\u00a0]/g, ' ').trim()
      .match(/^(\d{1,2})[\s/\-.](\d{1,2})[\s/\-.](\d{2,4})/);
    if (sl) {
      const dayOrMonth = Number(sl[1]);
      const monthOrDay = Number(sl[2]);
      const y = Number(sl[3]);
      // Relatório Sienge é sempre DD/MM/AAAA (21/09/2026 = 21 de setembro)
      if (monthOrDay >= 1 && monthOrDay <= 12 && dayOrMonth >= 1 && dayOrMonth <= 31) {
        return this.dateToIsoParts(y, monthOrDay, dayOrMonth);
      }
      // Só troca se o segundo número não puder ser mês (09/21/2026 gravado em US)
      if (dayOrMonth >= 1 && dayOrMonth <= 12 && monthOrDay > 12 && monthOrDay <= 31) {
        return this.dateToIsoParts(y, dayOrMonth, monthOrDay);
      }
    }
    return '';
  },

  formatCessaoDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
  },

  mergeCessaoClients(list) {
    const out = [];
    const seen = new Set();
    (list || []).forEach((c) => {
      if (!c) return;
      const key = String(c.id || '') + '|' + this.foldHeader(c.name);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(c);
    });
    return out;
  },

  buildCessaoEvent(rows, isoHint) {
    const list = (rows || []).filter(Boolean);
    if (!list.length) return null;
    const inheritedAnt = this.mergeCessaoClients(list.flatMap((r) => r.anteriores || []));
    const firstBuilt = list.find((r) => Array.isArray(r.atuais) && !r.clients);
    if (firstBuilt && list.every((r) => Array.isArray(r.atuais) && !r.clients)) {
      const iso = isoHint || this.resolveCessaoIso(firstBuilt);
      return Object.assign({}, firstBuilt, {
        dataIso: iso,
        data: firstBuilt.data || this.formatCessaoDate(iso),
        competencia: (iso || '').slice(0, 7) || firstBuilt.competencia || this.competenciaValue(),
        anteriores: inheritedAnt.length ? inheritedAnt : (firstBuilt.anteriores || [])
      });
    }
    const clients = this.mergeCessaoClients(list.flatMap((r) => r.clients || r.atuais || []));
    const atuais = clients.filter((c) => c.atual).length ? clients.filter((c) => c.atual) : clients;
    const iso = isoHint || this.resolveCessaoIso(list[0]) || this.pickCessaoGroupIso(list);
    const first = list.find((r) => r.titulo) || list[0];
    const documento = (list.find((r) => r.documento) || {}).documento || first.documento || '';
    return {
      data: this.formatCessaoDate(iso) || first.data || '',
      dataIso: iso,
      competencia: (iso || '').slice(0, 7) || this.competenciaValue(),
      empresa: (list.find((r) => r.empresa) || {}).empresa || first.empresa || '',
      cidade: (list.find((r) => r.cidade) || {}).cidade || first.cidade || '',
      titulo: String(first.titulo || '').replace(/\.0$/, ''),
      documento,
      contratoNumero: this.extractContratoNumero(documento),
      clients,
      principais: atuais.filter((c) => c.principal),
      principal: atuais.find((c) => c.principal) || atuais[0] || null,
      atuais,
      anteriores: inheritedAnt,
      unitName: first.unitName || '',
      enterpriseId: first.enterpriseId || '',
      enterpriseName: first.enterpriseName || ''
    };
  },

  buildCessaoGroup(rows) {
    return this.buildCessaoEvent(rows, this.pickCessaoGroupIso(rows));
  },

  pickCessaoGroupIso(list) {
    const rows = list || [];
    const allIsos = rows.map((r) => this.resolveCessaoIso(r)).filter(Boolean).sort();
    return allIsos[allIsos.length - 1] || '';
  },

  normalizeCessaoRecords(records, opts) {
    const raw = Array.isArray(records) ? records : [];
    const byLot = new Map();
    raw.forEach((rec) => {
      if (!rec || this.isCessaoNoiseText(rec.data, rec.titulo, rec.documento, '')) return;
      const titulo = String(rec.titulo || '').replace(/\.0$/, '').trim();
      if (!titulo || this.foldHeader(titulo) === 'TITULO') return;
      const contrato = rec.contratoNumero || this.extractContratoNumero(rec.documento);
      const lot = this.digitsOnly(titulo) || contrato || titulo;
      if (!byLot.has(lot)) byLot.set(lot, []);
      byLot.get(lot).push(rec);
    });
    const month = opts && opts.all ? '' : this.competenciaValue();
    const out = [];
    byLot.forEach((rows) => {
      const events = new Map();
      rows.forEach((rec) => {
        const iso = this.resolveCessaoIso(rec) || String(rec.data || '').trim() || 'sem-data';
        if (!events.has(iso)) events.set(iso, []);
        events.get(iso).push(rec);
      });
      const ordered = [...events.entries()]
        .map(([iso, list]) => this.buildCessaoEvent(list, /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso : this.resolveCessaoIso(list[0])))
        .filter(Boolean)
        .sort((a, b) => String(a.dataIso || '').localeCompare(String(b.dataIso || '')));
      ordered.forEach((ev, idx) => {
        const prev = idx > 0 ? ordered[idx - 1] : null;
        if (prev) {
          if (!(ev.anteriores && ev.anteriores.length)) {
            ev.anteriores = this.mergeCessaoClients(prev.clients || prev.atuais || []);
          }
          ev.historico = ordered.slice(0, idx).map((h) => ({
            data: h.data,
            dataIso: h.dataIso,
            clients: h.clients || h.atuais || []
          }));
        }
      });
      const inMonth = month
        ? ordered.filter((ev) => ev.dataIso && ev.dataIso.slice(0, 7) === month)
        : ordered;
      inMonth.forEach((ev) => out.push(ev));
    });
    return out;
  },

  parseCessaoMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    let col = { data: -1, empresa: -1, cidade: -1, titulo: -1, documento: -1, cliente: -1 };
    let foundHeader = false;

    const detectCols = (cells) => {
      const folded = (cells || []).map((c) => this.foldHeader(c));
      const find = (...needles) => folded.findIndex((h) => needles.some((n) => h.includes(n)));
      const data = find('DATA CESSAO', 'DATA');
      let empresa = find('EMPRESA-LOTEAMENTO', 'EMPRESA LOTEAMENTO', 'LOTEAMENTO');
      if (empresa < 0) empresa = find('EMPREENDIMENTO');
      if (empresa < 0) empresa = find('EMPRESA');
      const cidade = find('CIDADE', 'MUNICIPIO');
      const titulo = find('TITULO');
      const documento = find('DOCUMENTO');
      const cliente = find('CLIENTE');
      if (data >= 0 && titulo >= 0 && cliente >= 0) {
        col = { data, empresa, cidade, titulo, documento, cliente };
        return true;
      }
      return false;
    };

    const raw = [];
    let carry = { data: '', dataIso: '', empresa: '', cidade: '', titulo: '', documento: '' };
    let pending = [];
    const flushPending = () => {
      if (!carry.titulo || !pending.length) return;
      pending.forEach((p) => {
        raw.push({
          data: p.data || carry.data,
          dataIso: p.dataIso || carry.dataIso || this.cessaoDateIso(p.data || carry.data),
          empresa: p.empresa || carry.empresa,
          cidade: p.cidade || carry.cidade,
          titulo: carry.titulo,
          documento: p.documento || carry.documento,
          clients: p.clients
        });
      });
      pending = [];
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      if (this.isCessaoHeaderRow(r)) {
        flushPending();
        pending = [];
        detectCols(r);
        foundHeader = true;
        carry = { data: '', dataIso: '', empresa: '', cidade: '', titulo: '', documento: '' };
        continue;
      }
      if (!foundHeader && detectCols(r)) {
        foundHeader = true;
        continue;
      }
      if (!foundHeader) continue;
      const picked = this.pickCessaoRowDate(r, col.data);
      const data = picked.data;
      const dataIso = picked.dataIso;
      const empresa = col.empresa >= 0 ? this.cellToText(r[col.empresa]) : '';
      const cidade = col.cidade >= 0 ? this.cellToText(r[col.cidade]) : '';
      const titulo = this.cellToText(r[col.titulo]);
      const documento = col.documento >= 0 ? this.cellToText(r[col.documento]) : '';
      const clienteRaw = this.cellToText(r[col.cliente]);
      if (this.isCessaoNoiseText(data, titulo, documento, clienteRaw)) continue;
      if (!titulo && !clienteRaw && !documento) continue;
      if (data) carry.data = data;
      if (dataIso) carry.dataIso = dataIso;
      if (empresa) carry.empresa = empresa;
      if (cidade) carry.cidade = cidade;
      if (titulo && this.foldHeader(titulo) !== 'TITULO') {
        carry.titulo = String(titulo).replace(/\.0$/, '');
        flushPending();
      }
      if (documento) carry.documento = documento;
      const clients = this.parseCessaoClientCell(clienteRaw);
      if (!clients.length) continue;
      if (!carry.titulo) {
        pending.push({
          data: data || carry.data,
          dataIso: dataIso || carry.dataIso,
          empresa: empresa || carry.empresa,
          cidade: cidade || carry.cidade,
          documento: documento || carry.documento,
          clients
        });
        continue;
      }
      raw.push({
        data: carry.data,
        dataIso: carry.dataIso || this.cessaoDateIso(carry.data),
        empresa: carry.empresa,
        cidade: carry.cidade,
        titulo: carry.titulo,
        documento: carry.documento,
        clients
      });
    }
    flushPending();

    if (!foundHeader) {
      return { records: [], all: [], raw: [], note: 'Cabeçalho Sienge não identificado — arquivo guardado mesmo assim' };
    }

    const records = this.normalizeCessaoRecords(raw);
    const all = this.normalizeCessaoRecords(raw, { all: true });
    let note = records.length ? `${records.length} cessão(ões) na competência` : 'Nenhuma cessão lida na competência';
    if (!records.length && all.length) {
      const months = [...new Set(all.map((r) => (r.dataIso || '').slice(0, 7)).filter(Boolean))].join(', ');
      note = `O Sienge trouxe ${all.length} evento(s) em ${months || 'outras datas'}, nenhum em ${this.competenciaValue() || '—'}. Confira o mês em Parâmetros.`;
    }
    return { records, all, raw, note };
  },

  parseCessaoMatrixLoose(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const raw = [];
    let carry = { data: '', dataIso: '', empresa: '', cidade: '', titulo: '', documento: '' };
    let pending = [];
    const flushPending = () => {
      if (!carry.titulo || !pending.length) return;
      pending.forEach((p) => {
        raw.push({
          data: p.data || carry.data,
          dataIso: p.dataIso || carry.dataIso || this.cessaoDateIso(p.data || carry.data),
          empresa: p.empresa || carry.empresa,
          cidade: p.cidade || carry.cidade,
          titulo: carry.titulo,
          documento: p.documento || carry.documento,
          clients: p.clients
        });
      });
      pending = [];
    };
    rows.forEach((r) => {
      const cells = (r || []).map((c) => this.cellToText(c));
      if (this.isCessaoHeaderRow(cells)) {
        flushPending();
        pending = [];
        carry = { data: '', dataIso: '', empresa: '', cidade: '', titulo: '', documento: '' };
        return;
      }
      const picked = this.findCessaoBitsInRow(cells);
      if (this.isCessaoNoiseText(picked.data, picked.titulo, picked.documento, picked.clienteRaw)) return;
      if (!picked.titulo && !picked.clienteRaw && !picked.documento && !picked.data) return;
      if (picked.data) {
        carry.data = picked.data;
        carry.dataIso = picked.dataIso;
      }
      if (picked.empresa) carry.empresa = picked.empresa;
      if (picked.cidade) carry.cidade = picked.cidade;
      if (picked.titulo) {
        carry.titulo = picked.titulo;
        flushPending();
      }
      if (picked.documento) carry.documento = picked.documento;
      const clients = this.parseCessaoClientCell(picked.clienteRaw);
      if (!clients.length) return;
      if (!carry.titulo) {
        pending.push({
          data: picked.data || carry.data,
          dataIso: picked.dataIso || carry.dataIso,
          empresa: picked.empresa || carry.empresa,
          cidade: picked.cidade || carry.cidade,
          documento: picked.documento || carry.documento,
          clients
        });
        return;
      }
      raw.push({
        data: carry.data,
        dataIso: carry.dataIso || this.cessaoDateIso(carry.data),
        empresa: carry.empresa,
        cidade: carry.cidade,
        titulo: carry.titulo,
        documento: carry.documento,
        clients
      });
    });
    flushPending();
    const records = this.normalizeCessaoRecords(raw);
    const all = this.normalizeCessaoRecords(raw, { all: true });
    return {
      records,
      all,
      raw,
      note: records.length ? `${records.length} cessão(ões) na competência` : (raw.length ? 'Nenhuma cessão lida na competência' : '')
    };
  },

  findCessaoBitsInRow(cells) {
    const out = { data: '', dataIso: '', empresa: '', cidade: '', titulo: '', documento: '', clienteRaw: '' };
    (cells || []).forEach((raw) => {
      const text = this.cellToText(raw);
      if (!text) return;
      if (!out.dataIso) {
        const iso = this.cessaoDateIso(text);
        if (iso) {
          out.data = text;
          out.dataIso = iso;
          return;
        }
      }
      const folded = this.foldHeader(text);
      const looksEmpresa = /^\d+\s*-\s*.+\s-\s*.+/.test(text)
        || /EMPREENDIMENTO|LOTEAMENTO|RESERVA DO|SPE LTDA/.test(folded);
      if (!out.empresa && looksEmpresa) {
        out.empresa = text;
        return;
      }
      if (!out.cidade && /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,28}$/.test(text)
        && !/EMPREEND|CLIENTE|TITULO|DOCUMENTO|CESSAO|RELATORIO/.test(folded)) {
        out.cidade = text;
        return;
      }
      if (!out.clienteRaw && (/\*|(\(P\))/i.test(text)
        || (/^\d{3,6}\s*[-–]\s*[A-Za-zÀ-ÿ]/.test(text) && !/^\d+\s*-\s*.+\s-\s*/.test(text)))) {
        out.clienteRaw = text;
        return;
      }
      if (!out.documento && (/\bCT\s*\/|\bCV\s*\/|CVMOURALEIT/i.test(text))) {
        out.documento = text;
        return;
      }
      if (!out.titulo && /^\d{4,8}(?:\.0)?$/.test(text.replace(/\s/g, ''))) {
        out.titulo = text.replace(/\.0$/, '');
      }
    });
    return out;
  },

  pickCessaoRowDate(row, dataCol) {
    const cells = row || [];
    const tryCell = (v) => {
      const text = this.cellToText(v);
      const iso = this.cessaoDateIso(v) || this.cessaoDateIso(text);
      return { data: text || this.formatCessaoDate(iso), dataIso: iso };
    };
    const primary = tryCell(dataCol >= 0 ? cells[dataCol] : '');
    if (primary.dataIso) return primary;
    for (let c = 0; c < cells.length && c < 10; c++) {
      const text = this.cellToText(cells[c]);
      if (!/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(text)) continue;
      const alt = tryCell(cells[c]);
      if (alt.dataIso) return alt;
    }
    return primary;
  },

  parseCessaoClientCell(raw) {
    const text = String(raw || '')
      .replace(/\r/g, '\n')
      .replace(/(\S)\s+(?=\d{3,6}\s*[-–])/g, '$1\n')
      .replace(/\n+(?=\s*[\*(])/g, ' ');
    const parts = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    const flat = parts.length ? parts : [text.trim()].filter(Boolean);
    return flat.map((line) => {
      const atual = /\*/.test(line);
      const principal = /\(P\)/i.test(line);
      const conjuge = /\(C\)/i.test(line);
      const clean = line
        .replace(/\*/g, '')
        .replace(/\(P\)/gi, '')
        .replace(/\(C\)/gi, '')
        .replace(/\(\.\.\.\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const m = clean.match(/^(\d+)\s*[-–]\s*(.+)$/);
      return {
        id: m ? m[1] : '',
        name: m ? m[2].trim() : clean,
        atual,
        principal,
        conjuge
      };
    }).filter((c) => c.name || c.id);
  },

  contractMatchKeys(contract) {
    const keys = new Set();
    const add = (v) => {
      const raw = String(v == null ? '' : v).trim();
      if (!raw || raw.startsWith('troca-') || raw.startsWith('cessao-')) return;
      keys.add(raw);
      const digits = this.digitsOnly(raw);
      if (digits) keys.add(digits);
    };
    const addContract = (c) => {
      if (!c) return;
      add(c.id);
      add(c.number);
      add(c.contractNumber);
      add(c.receivableBillId);
      add(c._unitName);
      (c.salesContractUnits || []).forEach((u) => add(u && u.name));
    };
    addContract(contract);
    addContract(contract && contract._venda);
    addContract(contract && contract._distrato);
    addContract(contract && contract._cessao);
    return keys;
  },

  cessaoMatchesContract(rec, keys) {
    if (!rec || !keys || !keys.size) return false;
    const candidates = [
      rec.titulo,
      rec.documento,
      rec.contratoNumero,
      rec.receivableBillId,
      rec.contractId,
      rec.unitName
    ];
    return candidates.some((v) => {
      const raw = String(v == null ? '' : v).trim();
      if (!raw) return false;
      if (keys.has(raw)) return true;
      const digits = this.digitsOnly(raw);
      return !!(digits && keys.has(digits));
    });
  },

  findCessaoHistoryForContract(contract) {
    if (!contract) return [];
    const keys = this.contractMatchKeys(contract);
    if (!keys.size) return [];
    const companyId = contract.companyId != null ? String(contract.companyId) : null;
    const all = [];
    Object.entries(this.state.cessaoByCompany || {}).forEach(([cid, row]) => {
      if (row.status !== 'has' || !Array.isArray(row.records)) return;
      if (companyId && cid !== companyId) return;
      this.normalizeCessaoRecords(row.records).forEach((rec) => {
        if (this.cessaoMatchesContract(rec, keys)) all.push(rec);
      });
    });
    all.sort((a, b) => String(this.resolveCessaoIso(a) || '').localeCompare(String(this.resolveCessaoIso(b) || '')));
    return all;
  },

  pickCessaoSale(results, rec, companyId) {
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return null;
    const city = this.cityLabelFromCessao(rec);
    const wantedCo = companyId != null && companyId !== ''
      ? String(companyId)
      : (rec && rec.companyId != null ? String(rec.companyId) : '');
    const byCo = wantedCo
      ? list.filter((s) => s.companyId == null || String(s.companyId) === wantedCo)
      : list.slice();
    const pool = byCo.length ? byCo : [];
    const citySrc = pool.length ? pool : list;
    const cityPool = city
      ? citySrc.filter((s) => this.sameCessaoCity(city, this.cityFromEnterprise(s.enterpriseName)))
      : [];
    if (cityPool.length) return cityPool[0];
    if (pool.length === 1) {
      const only = pool[0];
      if (city && only.enterpriseName && !this.sameCessaoCity(city, this.cityFromEnterprise(only.enterpriseName))) {
        return null;
      }
      return only;
    }
    return null;
  },

  saleFitsCessao(sale, rec, companyId) {
    if (!sale) return false;
    const wantedCo = companyId != null && companyId !== '' ? String(companyId) : '';
    if (wantedCo && sale.companyId != null && String(sale.companyId) !== wantedCo) return false;
    const city = this.cityLabelFromCessao(rec);
    if (city && sale.enterpriseName && !this.sameCessaoCity(city, this.cityFromEnterprise(sale.enterpriseName))) {
      return false;
    }
    return true;
  },

  async lookupCessaoUnit(rec, cache, companyId) {
    const memo = cache || {};
    const titulo = this.digitsOnly(rec && rec.titulo);
    const contrato = (rec && rec.contratoNumero) || this.extractContratoNumero(rec && rec.documento);
    const cid = companyId != null && companyId !== '' ? String(companyId) : String((rec && rec.companyId) || '');
    const cacheKey = [titulo || '', contrato || '', cid].join('|');
    if (cacheKey && memo[cacheKey]) return Object.assign(rec, memo[cacheKey]);
    const fetchFn = window.siengeFetchWithRetry;
    if (typeof fetchFn !== 'function') return rec;
    const saleUrl = (number, extra) => {
      let url = '/sales-contracts?number=' + encodeURIComponent(number);
      if (cid) url += '&companyId=' + encodeURIComponent(cid);
      if (extra) url += extra;
      return url;
    };
    try {
      let sale = null;
      let bill = null;
      if (contrato) {
        const data = await fetchFn(saleUrl(contrato)).catch(() => null);
        sale = this.pickCessaoSale(data && data.results, rec, cid);
      }
      if (!sale && titulo) {
        bill = await fetchFn('/accounts-receivable/receivable-bills/' + encodeURIComponent(titulo)).catch(() => null);
        const billEnt = bill && (bill.enterpriseName || bill.costCenterName || '');
        const billCity = this.cityFromEnterprise(billEnt);
        const recCity = this.cityLabelFromCessao(rec);
        const billFits = !recCity || !billCity || this.sameCessaoCity(recCity, billCity);
        const docNum = bill && (bill.documentNumber || bill.number || bill.contractNumber);
        if (docNum && billFits) {
          const data = await fetchFn(saleUrl(docNum)).catch(() => null);
          sale = this.pickCessaoSale(data && data.results, rec, cid);
        }
        if (!sale && bill && bill.id && billFits) {
          const byBill = await fetchFn('/sales-contracts?receivableBillId=' + encodeURIComponent(bill.id)).catch(() => null);
          sale = this.pickCessaoSale(byBill && byBill.results, rec, cid);
        }
        if (sale && !this.saleFitsCessao(sale, rec, cid)) sale = null;
      }
      if (sale && !this.saleFitsCessao(sale, rec, cid)) sale = null;
      const unit = (sale && sale.salesContractUnits && sale.salesContractUnits[0]) || {};
      const resolved = this.resolveCessaoEnterprise(Object.assign({}, rec, {
        enterpriseId: (sale && sale.enterpriseId) || rec.enterpriseId || '',
        enterpriseName: (sale && sale.enterpriseName) || rec.enterpriseName || ''
      }), cid);
      const patch = {
        unitName: unit.name || rec.unitName || '',
        enterpriseId: resolved.enterpriseId || '',
        enterpriseName: resolved.enterpriseName || '',
        companyName: (sale && sale.companyName) || rec.companyName || '',
        companyId: cid || rec.companyId,
        contractId: (sale && sale.id) || rec.contractId,
        receivableBillId: (sale && sale.receivableBillId) || titulo || rec.receivableBillId,
        salesContractUnits: (sale && sale.salesContractUnits) || rec.salesContractUnits,
        salesContractCustomers: (sale && sale.salesContractCustomers) || rec.salesContractCustomers
      };
      if (cacheKey) memo[cacheKey] = patch;
      return Object.assign(rec, patch);
    } catch (e) {
      console.warn('[Compromissario] unidade da cessão', rec && rec.titulo, e);
      return rec;
    }
  },

  async hydrateCessaoUnits() {
    const cache = {};
    const jobs = [];
    Object.entries(this.state.cessaoByCompany || {}).forEach(([cid, row]) => {
      if (!row || row.status !== 'has' || !Array.isArray(row.records)) return;
      row.records = this.normalizeCessaoRecords(row.records);
      row.records.forEach((rec) => {
        const hint = this.cityLabelFromCessao(rec);
        const hydCity = this.cityFromEnterprise(rec.enterpriseName);
        const wrongCity = !!(hint && rec.enterpriseName && hydCity && !this.sameCessaoCity(hint, hydCity));
        const wrongCo = !!(cid && rec.companyId != null && rec.companyId !== '' && String(rec.companyId) !== String(cid) && rec.enterpriseName);
        if (wrongCity || wrongCo) {
          rec.enterpriseName = '';
          rec.enterpriseId = '';
          rec.unitName = '';
        }
        rec.companyId = cid;
        if (rec.unitName && rec.enterpriseName && !wrongCity && !wrongCo) return;
        jobs.push(this.lookupCessaoUnit(rec, cache, cid));
      });
    });
    if (jobs.length) await Promise.all(jobs);
    this.persistCessaoMonth();
  },

  enterpriseNameFromCessao(rec) {
    if (rec && rec.enterpriseName) return rec.enterpriseName;
    const emp = String((rec && rec.empresa) || '');
    const id = (emp.match(/^(\d+)/) || [])[1];
    if (id && window.AppState && window.AppState.cachedCostCenters) {
      const cc = window.AppState.cachedCostCenters.find((c) => String(c.id) === id);
      if (cc && cc.name) return cc.name;
    }
    return emp.replace(/^\d+\s*-\s*/, '');
  },

  resolveCessaoIso(rec) {
    if (!rec) return '';
    return this.validIsoDate(rec.dataIso) || this.cessaoDateIso(rec.dataIso) || this.cessaoDateIso(rec.data);
  },

  cessaoInSearchMonth(rec, monthVal) {
    if (!rec || !monthVal) return false;
    const iso = this.resolveCessaoIso(rec);
    return !!(iso && iso.slice(0, 7) === monthVal);
  },

  cessaoRowsForMonth(monthVal) {
    const out = {};
    const month = String(monthVal || '').slice(0, 7);
    const store = this.readCessaoStore();
    const disk = (month && store[month] && typeof store[month] === 'object') ? store[month] : {};
    Object.entries(disk).forEach(([id, row]) => { out[String(id)] = row; });
    Object.entries(this.state.cessaoByCompany || {}).forEach(([id, row]) => {
      if (row && (row.status === 'has' || (Array.isArray(row.records) && row.records.length))) {
        out[String(id)] = row;
      }
    });
    return out;
  },

  cessaoMovementKey(cid, rec, fallback) {
    return [
      String(cid || ''),
      this.digitsOnly(rec && rec.titulo) || (rec && rec.contratoNumero) || (rec && rec.documento) || '',
      this.resolveCessaoIso(rec) || (rec && rec.data) || '',
      fallback == null ? '' : String(fallback)
    ].join('|');
  },

  buildCessaoMovements(monthVal) {
    const movements = [];
    const seen = new Set();
    Object.entries(this.cessaoRowsForMonth(monthVal)).forEach(([cid, row]) => {
      if (!row || row.status !== 'has') return;
      this.normalizeCessaoRecords(row.records).forEach((rec, idx) => {
        if (!this.cessaoInSearchMonth(rec, monthVal)) return;
        const key = this.cessaoMovementKey(cid, rec, idx);
        if (seen.has(key)) return;
        seen.add(key);
        const atuais = rec.atuais || [];
        const resolved = this.resolveCessaoEnterprise(rec, cid);
        const enterpriseName = resolved.enterpriseName || '';
        const enterpriseId = resolved.enterpriseId || '';
        const city = resolved.city || this.cityLabelFromCessao(rec);
        movements.push({
          id: 'cessao-' + cid + '-' + (this.digitsOnly(rec.titulo) || rec.contratoNumero || idx) + '-' + (this.resolveCessaoIso(rec) || idx),
          _movementType: 'Cessão',
          _operationType: 'Cessão',
          _cessao: rec,
          _city: city,
          _unitName: rec.unitName || '',
          enterpriseId,
          enterpriseName,
          companyName: rec.companyName || '',
          companyId: cid,
          salesContractUnits: rec.salesContractUnits || (rec.unitName ? [{ name: rec.unitName }] : []),
          salesContractCustomers: atuais.length
            ? atuais.map((c) => ({ id: c.id, name: c.name, main: !!c.principal }))
            : rec.salesContractCustomers
        });
      });
    });
    return movements;
  },

  /**
   * Incorporação: não notifica prefeitura/associação, salvo lotes marcados
   * como exceção (fora da incorporação) no Centro de Custo.
   */
  shouldNotifyContract(c) {
    if (!c) return false;
    let unitName = '';
    if (c.salesContractUnits && c.salesContractUnits.length > 0) {
      unitName = c.salesContractUnits[0].name || '';
    }
    const enterpriseId = c.enterpriseId;
    const unitId = (c.salesContractUnits && c.salesContractUnits[0] && c.salesContractUnits[0].id) || '';
    if (typeof window.incorporacaoUnitUsesNormalFlow === 'function') {
      return window.incorporacaoUnitUsesNormalFlow(enterpriseId, unitName, unitId);
    }
    const cfg = (typeof window.nexCcConfig === 'function')
      ? window.nexCcConfig(enterpriseId, unitName)
      : {};
    if (String(cfg.tipo_cc || '') !== 'Incorporação') return true;

    const exceptions = Array.isArray(cfg.incorporacao_lotes_excecao)
      ? cfg.incorporacao_lotes_excecao
      : [];
    if (!exceptions.length) return false;

    const unitKey = this.normalizeUnitKey(unitName);
    if (!unitKey) return false;
    return exceptions.some((ex) => {
      const exName = typeof ex === 'string' ? ex : (ex && ex.name);
      const exId = typeof ex === 'object' && ex ? String(ex.id || '') : '';
      if (exId && c.salesContractUnits && c.salesContractUnits.some((u) => String(u.id) === exId)) return true;
      const exKey = this.normalizeUnitKey(exName);
      return exKey && (unitKey === exKey || unitKey.includes(exKey) || exKey.includes(unitKey));
    });
  },

  async fetchContracts() {
    if (this.state.loading) return;
    if (!this.assertCessaoGate('buscar vendas e distratos')) return;
    
    const monthEl = document.getElementById('comp-pref-month');
    const monthVal = (monthEl && monthEl.value) || this.competenciaValue();
    if (!monthVal) {
      alert("Por favor, selecione um mês de referência.");
      return;
    }
    this.state.searchMonth = monthVal;
    this.ensureCessaoMonth(monthVal);
    this.persistCessaoMonth();

    // Parse month to first and last day
    const [year, month] = monthVal.split('-');
    const firstDay = `${year}-${month}-01`;
    const lastDay = new Date(year, parseInt(month), 0).getDate();
    const finalDay = `${year}-${month}-${lastDay}`;

    const btn = document.getElementById('comp-pref-btn-search');
    if (btn) btn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 16px;"></i> <span>Buscando...</span>';
    this.state.loading = true;

    try {
      const [vendas, distratos] = await Promise.all([
        this.fetchContractPages(`/sales-contracts?situation=2&initialIssueDate=${firstDay}&finalIssueDate=${finalDay}`),
        this.fetchContractPages(`/sales-contracts?situation=3&initialCancelDate=${firstDay}&finalCancelDate=${finalDay}`)
      ]);

      vendas.forEach((v) => { v._operationType = 'Venda'; });
      distratos.forEach((d) => { d._operationType = 'Distrato'; });

      const destIds = new Set(distratos.map((d) => String(d.id)));
      const destRaw = distratos.filter((d) => !(d && d.issueDate && String(d.issueDate).startsWith(monthVal)));
      const vendaRaw = vendas.filter((v) => !destIds.has(String(v.id)));
      this.state._skippedIncorporacao = destRaw.filter((d) => !this.shouldNotifyContract(d)).length
        + vendaRaw.filter((v) => !this.shouldNotifyContract(v)).length;
      if (this._cessaoReparseTimer) {
        clearTimeout(this._cessaoReparseTimer);
        this._cessaoReparseTimer = null;
      }
      await this.reparseStoredCessaoFiles();
      await this.hydrateCessaoUnits();
      const movements = this.buildMovements(vendas, distratos, monthVal);
      const cessaoMoves = this.buildCessaoMovements(monthVal);
      this.state.contracts = movements.concat(cessaoMoves);

      this.renderTable();
      this.hydrateTermosFromAnexos().catch((e) => console.warn('[Compromissario] hydrate termos', e));

    } catch (e) {
      console.error("[Compromissario] Erro ao buscar contratos", e);
      alert("Falha ao buscar os contratos no Sienge.");
    } finally {
      this.state.loading = false;
      if (btn) btn.innerHTML = '<i data-lucide="search" style="width: 16px;"></i> <span>Carregar movimentos</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  },

  /** Baixa CONTRATO/DISTRATO já enviados pelo Assistente / IntegrA (unidade e contrato no Sienge). */
  async hydrateTermosFromAnexos() {
    const list = this.state.contracts || [];
    if (!list.length) return;
    const fetchFn = window.anexosFetchTermoBlobForContract;
    if (typeof fetchFn !== 'function') {
      console.warn('[Compromissario] anexosFetchTermoBlobForContract indisponível');
      return;
    }
    const jobs = [];
    list.forEach((m) => {
      this.movementDocs(m).forEach((doc) => {
        const id = String((doc.contract && doc.contract.id) || '');
        if (!id || this.state.files[id]) return;
        const payload = Object.assign({}, doc.contract, { _operationType: doc.kind === 'DISTRATO' ? 'Distrato' : 'Venda' });
        jobs.push({ id, payload });
      });
    });
    const concurrency = 3;
    let i = 0;
    const run = async () => {
      while (i < jobs.length) {
        const job = jobs[i++];
        try {
          const file = await fetchFn(job.payload);
          if (file) {
            file._fromAnexos = true;
            this.state.files[job.id] = file;
          }
        } catch (e) {
          console.warn('[Compromissario] termo', job.id, e);
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => run()));
    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('comp-pref-tbody');
    const countLabel = document.getElementById('comp-pref-count');

    if (!this.state.contracts || this.state.contracts.length === 0) {
      tbody.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
          Nenhum contrato encontrado para este período.
        </div>
      `;
      countLabel.textContent = '0 encontrados';
      return;
    }

    countLabel.textContent = `${this.state.contracts.length} movimento(s)`;

    const groups = {};
    let configs = this.loadConfigs();

    let configsChanged = false;

    this.state.contracts.forEach(c => {
      const cityName = this.cityOfContract(c) || 'SEM CIDADE';
      const cityKey = this.normalizeCityKey(cityName);
      const empLabel = this.enterpriseLabel(c);
      if (!groups[cityName]) groups[cityName] = {};
      if (!groups[cityName][empLabel]) groups[cityName][empLabel] = [];
      groups[cityName][empLabel].push(c);
      
      // Auto-ativar cidade se ela aparecer na busca
      if (!configs[cityKey]) {
        configs[cityKey] = { email: '', reqEspecial: false, ativo: true };
        configsChanged = true;
      } else if (!configs[cityKey].ativo) {
        configs[cityKey].ativo = true;
        configsChanged = true;
      }
    });

    if (configsChanged) {
      localStorage.setItem('crm_compromissario_configs', JSON.stringify(configs));
    }

    let html = '';

    // Alerta de cidades sem e-mail
    const missingEmails = Object.keys(groups).filter(city => {
      const cityKey = this.normalizeCityKey(city);
      return !configs[cityKey] || !configs[cityKey].email;
    });
    if (missingEmails.length > 0) {
      html += `
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #ef4444; border-radius: 6px; padding: 12px 15px; margin-bottom: 20px; display: flex; align-items: flex-start; gap: 10px;">
          <i data-lucide="alert-triangle" style="width: 20px; color: #ef4444; margin-top: 2px;"></i>
          <div>
            <h4 style="margin: 0 0 5px 0; color: #991b1b; font-size: 0.9rem;">Atenção: E-mails Não Cadastrados</h4>
            <p style="margin: 0; color: #b91c1c; font-size: 0.8rem;">As seguintes prefeituras possuem movimentos na fila, mas não têm e-mail ou portal configurado: <strong>${missingEmails.join(', ')}</strong>. Ajuste na aba Parâmetros.</p>
          </div>
        </div>
      `;
    }

    Object.keys(groups).sort().forEach(cityName => {
      const empMap = groups[cityName] || {};
      const empLabels = Object.keys(empMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const groupContracts = empLabels.reduce((acc, k) => acc.concat(empMap[k]), []);
      const accId = 'acc-' + cityName.replace(/[^a-zA-Z0-9]/g, '');
      const isOpen = this.state.openAccordions.has(accId);
      const isMissingEmail = missingEmails.includes(cityName);
      
      html += `
        <div style="margin-bottom: 12px; border: 1px solid ${isMissingEmail ? '#fca5a5' : '#e2e8f0'}; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
          <div style="padding: 12px 15px; background: ${isMissingEmail ? '#fff5f5' : '#f8fafc'}; border-bottom: 1px solid ${isMissingEmail ? '#fca5a5' : '#e2e8f0'}; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="CompromissarioApp.toggleAccordion('${accId}')">
            <h4 style="margin: 0; font-size: 0.95rem; color: ${isMissingEmail ? '#991b1b' : '#1e293b'}; display: flex; align-items: center; gap: 8px;">
              <i data-lucide="${isMissingEmail ? 'alert-circle' : 'building-2'}" style="width: 16px; color: ${isMissingEmail ? '#ef4444' : '#105436'};"></i> ${cityName}
            </h4>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 0.75rem; background: ${isMissingEmail ? '#fecaca' : '#e2e8f0'}; color: ${isMissingEmail ? '#991b1b' : '#475569'}; padding: 3px 8px; border-radius: 12px; font-weight: 600;">${groupContracts.length} movimento(s) · ${empLabels.length} emp.</span>
              <i data-lucide="chevron-down" style="width: 16px; color: #94a3b8; transition: transform 0.2s; transform: rotate(${isOpen ? '0deg' : '-90deg'});" id="icon-${accId}"></i>
            </div>
          </div>
          <div id="${accId}" style="display: ${isOpen ? 'block' : 'none'};">
            ${(configs[this.normalizeCityKey(cityName)] && configs[this.normalizeCityKey(cityName)].agrupar) ? `
              <div style="padding: 12px 15px; background: #f0fdf4; border-bottom: 1px solid #e2e8f0; text-align: right; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.8rem; color: #166534; font-weight: 600;"><i data-lucide="info" style="width: 14px; vertical-align: middle;"></i> Modo de Envio em Lote ativado para esta cidade.</span>
                <button onclick="CompromissarioApp.sendGroupedEmail('${cityName}')" style="background: #105436; color: #fff; border: none; border-radius: 6px; padding: 8px 15px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background 0.2s;" onmouseover="this.style.background='#166534'" onmouseout="this.style.background='#105436'" title="Abre a comunicação em lote">
                  <i data-lucide="${(configs[this.normalizeCityKey(cityName)] && configs[this.normalizeCityKey(cityName)].hasPortal) ? 'external-link' : 'file-spreadsheet'}" style="width: 16px;"></i> ${(configs[this.normalizeCityKey(cityName)] && configs[this.normalizeCityKey(cityName)].hasPortal) ? 'Gerar Planilha e Acessar Portal' : 'Gerar Planilha e Notificar Todos'}
                </button>
              </div>
            ` : ''}
      `;

      empLabels.forEach((empLabel) => {
        const empRows = empMap[empLabel] || [];
        const trocaN = empRows.filter((m) => m._movementType === 'Troca').length;
        html += `
          <div style="padding: 10px 15px 8px; background: #f1f5f9; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div style="font-size: 0.82rem; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              <i data-lucide="map-pin" style="width: 14px; color: #105436;"></i>
              ${this.escHtml(empLabel)}
            </div>
            <span style="font-size: 0.72rem; color: #475569; font-weight: 600;">${empRows.length} movimento(s)${trocaN ? ` · ${trocaN} troca(s)` : ''}</span>
          </div>
          <table class="comp-mov-table">
            <colgroup>
              <col class="comp-mov-col-ct">
              <col class="comp-mov-col-buy">
              <col class="comp-mov-col-unit">
              <col class="comp-mov-col-doc">
              <col class="comp-mov-col-act">
            </colgroup>
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Comprador</th>
                <th>Unidade</th>
                <th>Documento / Termo</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              ${empRows.map((c) => this.renderMovementRow(c, cityName, configs)).join('')}
            </tbody>
          </table>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  },

  onTypeChange() {
    this.state.contracts = [];
    this.renderTable();
  },

  openCityConfig(city, mode) {
    const cityName = String(city || '');
    if (!cityName) return;
    if (mode === 'edit') {
      this.openConfigModal(cityName);
      return;
    }
    const cfg = this.loadConfigs()[this.normalizeCityKey(cityName)] || {};
    const existing = document.getElementById('comp-city-view-modal');
    if (existing) existing.remove();
    const how = this.cityNotifyLabel(cfg);
    document.body.insertAdjacentHTML('beforeend', `
      <div id="comp-city-view-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;">
        <div style="background:#fff;border-radius:10px;width:520px;max-width:100%;box-shadow:0 8px 24px rgba(0,0,0,.12);">
          <div style="padding:16px 18px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;font-size:1.05rem;">${this.escHtml(cityName)}</h3>
            <button type="button" class="btn btn-outline" onclick="document.getElementById('comp-city-view-modal').remove()">Fechar</button>
          </div>
          <div style="padding:18px;display:flex;flex-direction:column;gap:10px;font-size:0.9rem;color:#334155;">
            <div><strong>Forma:</strong> ${this.escHtml(how)}</div>
            ${cfg.hasPortal ? `
              <div><strong>Portal:</strong> ${this.escHtml(cfg.portalUrl || '—')}</div>
              <div><strong>Login:</strong> ${this.escHtml(cfg.portalLogin || '—')}</div>
            ` : `<div><strong>E-mail:</strong> ${this.escHtml(cfg.email || '—')}</div>`}
            <div><strong>Requerimento especial:</strong> ${cfg.reqEspecial ? 'Sim' : 'Não'}</div>
            <div><strong>Agrupar em planilha:</strong> ${cfg.agrupar ? 'Sim' : 'Não'}</div>
          </div>
          <div style="padding:12px 18px;border-top:1px solid #e2e8f0;text-align:right;">
            <button type="button" class="btn btn-primary" onclick="document.getElementById('comp-city-view-modal').remove();CompromissarioApp.openCityConfig('${this.escHtml(cityName)}','edit')">Editar</button>
          </div>
        </div>
      </div>`);
  },

  recordFollowup(c, extras) {
    if (!c) return;
    const extra = extras || {};
    const rec = c._cessao || {};
    const item = {
      id: String(c.id),
      month: this.competenciaValue(),
      city: this.cityOfContract(c) || extra.city || '',
      type: c._movementType || c._operationType || 'Movimento',
      contractLabel: rec.titulo || rec.documento || String(c.id),
      unit: this.unitNameOf(c) || '',
      channel: extra.channel || 'email',
      protocol: extra.protocol || '',
      notifiedAt: extra.notifiedAt || new Date().toISOString(),
      status: extra.status || 'aguardando',
      confirmedAt: extra.confirmedAt || null
    };
    const list = this.state.followups || [];
    const idx = list.findIndex((x) => String(x.id) === item.id && x.month === item.month);
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], item);
    else list.push(item);
    this.state.followups = list;
    this.persistFollowups();
  },

  markFollowupDone(id) {
    const list = this.state.followups || [];
    const hit = list.find((x) => String(x.id) === String(id) && (!this.competenciaValue() || x.month === this.competenciaValue()));
    if (!hit) return;
    hit.status = 'concluido';
    hit.confirmedAt = new Date().toISOString();
    this.persistFollowups();
    this.renderFollowupTab();
  },

  protocolOf(id) {
    const hit = (this.state.followups || []).find((x) => String(x.id) === String(id) && x.month === this.competenciaValue());
    return (hit && hit.protocol) || '';
  },

  setMovementProtocol(id, value) {
    const c = (this.state.contracts || []).find((x) => String(x.id) === String(id));
    const protocol = String(value || '').trim();
    if (c) this.recordFollowup(c, { channel: 'portal', protocol, status: (this.state.notifiedContracts[id] ? 'aguardando' : 'rascunho') });
    else {
      const hit = (this.state.followups || []).find((x) => String(x.id) === String(id));
      if (hit) {
        hit.protocol = protocol;
        this.persistFollowups();
      }
    }
  },

  askPortalProtocol(cityName, movementId) {
    const typed = movementId ? this.protocolOf(movementId) : '';
    if (typed) return typed;
    const raw = window.prompt(
      'Informe o número de protocolo do portal da prefeitura (pode completar depois no Follow-up):',
      ''
    );
    return raw != null ? String(raw).trim() : '';
  },

  cfgSid(city) {
    return this.normalizeCityKey(city).replace(/[^A-Z0-9]+/g, '_');
  },

  openConfigModal(cityName) {
    const city = String(cityName || '');
    if (!city) return;
    const existingModal = document.getElementById('comp-config-modal');
    if (existingModal) existingModal.remove();

    const sid = this.cfgSid(city);
    const cityCfg = this.loadConfigs()[this.normalizeCityKey(city)] || {};
    const esc = this.escHtml(city);
    const modalHtml = `
      <div id="comp-config-modal" class="modal-overlay active" data-city="${esc}" style="z-index:9999;">
        <div class="modal-box" style="width:min(860px,96vw);max-height:90vh;padding:0;display:flex;flex-direction:column;" onclick="event.stopPropagation()">
          <div class="modal-header" style="margin:0;padding:16px 24px;">
            <h3 style="margin:0;">Editar ${esc}</h3>
            <button type="button" class="modal-close" onclick="document.getElementById('comp-config-modal').remove()">&times;</button>
          </div>
          <div style="padding:18px 24px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px;">
            <label class="moura-switch">
              <input type="checkbox" id="cfg-portal-${sid}" ${cityCfg.hasPortal ? 'checked' : ''}
                onchange="document.getElementById('portal-fields-${sid}').style.display=this.checked?'grid':'none';document.getElementById('email-field-${sid}').style.display=this.checked?'none':'block';">
              <span class="moura-switch-track" aria-hidden="true"></span>
              <span class="moura-switch-text">Usa portal online</span>
            </label>
            <div id="email-field-${sid}" style="display:${cityCfg.hasPortal ? 'none' : 'block'};">
              <label class="tvig-comp-label" for="cfg-email-${sid}">E-mail da prefeitura</label>
              <input type="text" id="cfg-email-${sid}" class="form-control comp-cfg-input" placeholder="protocolo@prefeitura.gov.br" value="${this.escHtml(cityCfg.email || '')}">
            </div>
            <div id="portal-fields-${sid}" style="display:${cityCfg.hasPortal ? 'grid' : 'none'};gap:14px;">
              <div>
                <label class="tvig-comp-label" for="cfg-url-${sid}">URL do portal</label>
                <input type="text" id="cfg-url-${sid}" class="form-control comp-cfg-input" placeholder="https://..." value="${this.escHtml(cityCfg.portalUrl || '')}">
              </div>
              <div>
                <label class="tvig-comp-label" for="cfg-login-${sid}">Login</label>
                <input type="text" id="cfg-login-${sid}" class="form-control comp-cfg-input" value="${this.escHtml(cityCfg.portalLogin || '')}">
              </div>
              <div>
                <label class="tvig-comp-label" for="cfg-senha-${sid}">Senha</label>
                <input type="password" id="cfg-senha-${sid}" class="form-control comp-cfg-input" value="${this.escHtml(cityCfg.portalSenha || '')}">
              </div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#334155;font-weight:600;">
              <input type="checkbox" id="cfg-req-${sid}" ${cityCfg.reqEspecial ? 'checked' : ''} style="accent-color:#105436;width:16px;height:16px;"
                onchange="document.getElementById('cfg-btn-tpl-${sid}').style.display=this.checked?'inline-flex':'none'">
              Exige requerimento
              <button type="button" id="cfg-btn-tpl-${sid}" class="btn btn-outline" style="display:${cityCfg.reqEspecial ? 'inline-flex' : 'none'};padding:4px 8px;font-size:0.72rem;" onclick="CompromissarioApp.editTemplate('${esc}')">Editar padrão</button>
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#334155;font-weight:600;">
              <input type="checkbox" id="cfg-agrupar-${sid}" ${cityCfg.agrupar ? 'checked' : ''} style="accent-color:#105436;width:16px;height:16px;">
              Agrupar em planilha
            </label>
          </div>
          <div class="tvig-editor-foot">
            <button type="button" class="btn btn-cancel" onclick="document.getElementById('comp-config-modal').remove()">Cancelar</button>
            <button type="button" class="btn btn-primary" onclick="CompromissarioApp.saveConfigModal()">Salvar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (window.lucide) window.lucide.createIcons();
  },

  async saveConfigModal() {
    const modal = document.getElementById('comp-config-modal');
    const city = modal && modal.getAttribute('data-city');
    if (!city) return;
    const sid = this.cfgSid(city);
    const cityKey = this.normalizeCityKey(city);
    const configs = this.loadConfigs();
    const emailEl = document.getElementById('cfg-email-' + sid);
    const reqEl = document.getElementById('cfg-req-' + sid);
    const agruparEl = document.getElementById('cfg-agrupar-' + sid);
    const portalEl = document.getElementById('cfg-portal-' + sid);
    const urlEl = document.getElementById('cfg-url-' + sid);
    const loginEl = document.getElementById('cfg-login-' + sid);
    const senhaEl = document.getElementById('cfg-senha-' + sid);
    configs[cityKey] = {
      ...(configs[cityKey] || {}),
      email: emailEl ? emailEl.value.trim() : '',
      reqEspecial: !!(reqEl && reqEl.checked),
      agrupar: !!(agruparEl && agruparEl.checked),
      ativo: true,
      hasPortal: !!(portalEl && portalEl.checked),
      portalUrl: urlEl ? urlEl.value : '',
      portalLogin: loginEl ? loginEl.value : '',
      portalSenha: senhaEl ? senhaEl.value : '',
      updatedAt: Date.now()
    };

    try {
      await this.persistConfigs(configs, true);
      if (modal) modal.remove();
      this.renderPrefeituraShell();
      alert("Configurações salvas e enviadas para a nuvem. Os demais operadores passam a ver ao atualizar a página.");
    } catch (err) {
      if (modal) modal.remove();
      this.renderPrefeituraShell();
      alert("Configurações ficaram neste computador, mas a nuvem falhou: " + (err && err.message ? err.message : err));
    }
  },

  toggleAccordion(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (!el) return;
    if (el.style.display === 'none') {
      el.style.display = 'block';
      if(icon) icon.style.transform = 'rotate(0deg)';
      this.state.openAccordions.add(id);
    } else {
      el.style.display = 'none';
      if(icon) icon.style.transform = 'rotate(-90deg)';
      this.state.openAccordions.delete(id);
    }
  },

  // Drag and Drop Logic
  onDragOver(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const el = document.getElementById(`comp-drop-${id}`);
    if(el) {
      el.style.borderColor = '#3b82f6';
      el.style.background = '#eff6ff';
    }
  },
  onDragLeave(e, id) {
    e.preventDefault();
    e.stopPropagation();
    this.renderTable(); // reset colors
  },
  onDrop(e, id) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0];
      f._fromAnexos = false;
      this.state.files[id] = f;
      this.renderTable();
    }
  },
  onFileSelect(e, id) {
    if (e.target.files && e.target.files.length > 0) {
      const f = e.target.files[0];
      f._fromAnexos = false;
      this.state.files[id] = f;
      this.renderTable();
    }
  },

  movementHasPdf(c) {
    return this.movementDocs(c).some((d) => this.state.files[String(d.contract && d.contract.id)]);
  },

  sendEmail(id) {
    if (!this.assertCessaoGate('notificar troca de venda/distrato')) return;
    const c = this.state.contracts.find(x => String(x.id) === String(id));
    if (!c) return;
    if ((c._movementType || c._operationType) === 'Cessão' && !this.movementHasPdf(c)) {
      alert('Anexe o PDF da cessão de direitos antes de notificar a prefeitura.');
      return;
    }

    if (this.state.notifiedContracts[id]) {
      if (!confirm("Você já preparou um rascunho de e-mail para este contrato anteriormente. Deseja criar um novo rascunho mesmo assim?")) {
        return;
      }
    }

    const opType = c._movementType || c._operationType || 'Venda';
    const dest = c._distrato;
    const venda = c._venda;
    let operationName = 'Venda Emitida (o lote saiu da empresa para o cliente)';
    if (opType === 'Distrato') operationName = 'Distrato Realizado (o lote saiu do cliente para a empresa)';
    if (opType === 'Troca') operationName = 'Troca de Compromissário (unidade distratada e vendida no mesmo mês)';
    if (opType === 'Cessão') operationName = 'Cessão de direitos (o contrato mudou de titular)';

    const customerName = this.customerNameOf(c);
    const oldName = dest ? this.customerNameOf(dest) : '';
    const newName = venda ? this.customerNameOf(venda) : customerName;
    const enterpriseName = this.enterpriseLabel(c);
    const cityName = this.cityOfContract(c);
    const unitId = this.unitNameOf(c);

    const configs = this.loadConfigs();
    const cityKey = this.normalizeCityKey(cityName);
    const cityConfig = configs[cityKey] || {};
    const defaultEmail = cityConfig.email || '';
    const hasSpecialReq = cityConfig.reqEspecial;

    const subject = `Troca de Compromissário - ${enterpriseName} - Unidade ${unitId}`;
    
    let body = `Olá,%0D%0A%0D%0A`;
    body += `Gostaríamos de notificar uma alteração no compromissário devido a um(a) ${operationName}.%0D%0A%0D%0A`;
    body += `Detalhes:%0D%0A`;
    body += `- Empreendimento: ${enterpriseName}%0D%0A`;
    body += `- Unidade: ${unitId}%0D%0A`;
    if (opType === 'Troca') {
      body += `- Contrato destato: ${dest && dest.id ? dest.id : '—'}%0D%0A`;
      body += `- Contrato venda: ${venda && venda.id ? venda.id : '—'}%0D%0A`;
      body += `- Cliente anterior: ${oldName}%0D%0A`;
      body += `- Cliente novo: ${newName}%0D%0A%0D%0A`;
    } else if (opType === 'Cessão' && c._cessao) {
      const rec = c._cessao;
      body += `- Título: ${rec.titulo || '—'}%0D%0A`;
      body += `- Contrato: ${rec.documento || rec.contratoNumero || '—'}%0D%0A`;
      body += `- Cliente anterior: ${(rec.anteriores || []).map((x) => x.name).join(', ') || '—'}%0D%0A`;
      body += `- Cliente atual: ${(rec.atuais || []).map((x) => x.name).join(', ') || '—'}%0D%0A%0D%0A`;
    } else {
      body += `- Contrato: ${venda && venda.id ? venda.id : (dest && dest.id ? dest.id : id)}%0D%0A`;
      body += `- Cliente envolvido: ${customerName}%0D%0A%0D%0A`;
    }
    body += `Segue(m) anexo(s) o(s) documento(s) necessário(s).`;

    // Trigger action
    if (cityConfig.hasPortal && cityConfig.portalUrl) {
      let msg = `ATENÇÃO OPERADOR:\n\nEsta prefeitura exige protocolo diretamente no site.\nUma nova aba será aberta agora.\n\nLogin: ${cityConfig.portalLogin || 'Não configurado'}\nSenha: ${cityConfig.portalSenha || 'Não configurado'}`;
      if (this.movementDocs(c).some((d) => this.state.files[String(d.contract && d.contract.id)])) {
        msg += `\n\nO(s) PDF(s) do IntegrA/Sienge serão baixados para você anexar no portal.`;
      }
      if (hasSpecialReq) msg += `\n\n⚠️ ALERTA IMPORTANTE ⚠️\nA prefeitura de ${cityName} exige um REQUERIMENTO ESPECIAL. Lembre-se de gerar e anexar.`;
      alert(msg);
      this.downloadMovementFiles(c);
      
      this.state.notifiedContracts[id] = true;
      localStorage.setItem('crm_compromissario_notified', JSON.stringify(this.state.notifiedContracts));
      const protocol = this.askPortalProtocol(cityName, id);
      this.recordFollowup(c, { channel: 'portal', protocol, status: 'aguardando' });
      this.renderTable();
      
      window.open(cityConfig.portalUrl, '_blank');
      return;
    }

    const hasPdf = this.movementDocs(c).some((d) => this.state.files[String(d.contract && d.contract.id)]);
    let alertMsg = hasPdf
      ? `ATENÇÃO OPERADOR:\n\nO(s) PDF(s) já foram carregados do IntegrA/Sienge e serão baixados agora. Anexe no rascunho de e-mail.`
      : `ATENÇÃO OPERADOR:\n\nUm rascunho de e-mail será aberto agora. Não se esqueça de anexar manualmente o arquivo da listagem.`;
    if (hasSpecialReq) {
      alertMsg += `\n\n⚠️ ALERTA IMPORTANTE ⚠️\nA prefeitura de ${cityName} exige um REQUERIMENTO ESPECIAL. Verifique se ele está preenchido e assinado corretamente antes de enviar.`;
    }

    alert(alertMsg);
    this.downloadMovementFiles(c);

    // Save state
    this.state.notifiedContracts[id] = true;
    localStorage.setItem('crm_compromissario_notified', JSON.stringify(this.state.notifiedContracts));
    this.recordFollowup(c, { channel: 'email', status: 'aguardando' });
    this.renderTable(); // Update button visually

    const mailtoLink = `mailto:${defaultEmail}?subject=${subject}&body=${body}`;
    window.location.href = mailtoLink;
  },

  generateRequirement(id) {
    if (!this.assertCessaoGate('gerar requerimento de troca')) return;
    const c = this.state.contracts.find(x => String(x.id) === String(id));
    if (!c) return;

    const dest = c._distrato;
    const venda = c._venda;
    const opType = c._movementType || c._operationType || 'Venda';
    let customerName = this.customerNameOf(c);
    if (opType === 'Troca') {
      customerName = `${this.customerNameOf(dest)} → ${this.customerNameOf(venda)}`;
    }

    const enterpriseName = c.companyName || 'MOURA LEITE DESENVOLVIMENTO E URBANIZACAO LTDA';
    const cityName = this.cityOfContract(c);
    const unitId = this.unitNameOf(c);

    const today = new Date();
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const dateStr = `${today.getDate()} de ${months[today.getMonth()]} de ${today.getFullYear()}`;

    const configs = this.loadConfigs();
    const cityKey = this.normalizeCityKey(cityName);
    const cityConfig = configs[cityKey] || {};
    const defaultTemplate = `EXMO. SR. PREFEITO MUNICIPAL DE ${cityName.toUpperCase()} – SP
N E S T A.

REQUERIMENTO

Naiara Iambasso, brasileiro(a), maior, abaixo assinado(a), portador(a) da Cédula de Identidade RG. n°. 42.863.712-7, inscrito(a) no C.P.F. sob n.° 227.003.988-23, residente à Rua Campos Salles, 2175 na cidade de Botucatu - SP, vem mui respeitosamente à presença de V. Excia., requerer: TRANSFERENCIA DE COMPROMISSARIO DEVIDO A [TIPO_OPERACAO] conforme cópias dos Cessão de direitos, em anexo, para: [EMPRESA] dos lotes a seguir:

Quadra-Lote: [UNIDADE] - [COMPRADOR]

______________________________________________________________________

TELEFONE= (14) 3880-5354
Justificativa: ___________________________________________________________

Endereço de entrega: ___________________________________________________

Nestes Termos,
P. Deferimento.
Botucatu, [DATA]
`;

    let template = cityConfig.template || defaultTemplate;
    let textOp = 'VENDA EMITIDA (o lote saiu da empresa para o cliente)';
    if (opType === 'Distrato') textOp = 'DISTRATO REALIZADO (o lote saiu do cliente para a empresa)';
    if (opType === 'Troca') textOp = 'TROCA DE COMPROMISSÁRIO (distrato e nova venda no mesmo mês)';

    const finalTemplate = template
      .replace(/\[EMPRESA\]/g, enterpriseName.toUpperCase())
      .replace(/\[UNIDADE\]/g, unitId)
      .replace(/\[COMPRADOR\]/g, customerName.toUpperCase())
      .replace(/\[DATA\]/g, dateStr)
      .replace(/\[TIPO_OPERACAO\]/g, textOp)
      .replace(/\n/g, '<br>');

    let existingModal = document.getElementById('comp-req-modal');
    if (existingModal) existingModal.remove();

    const modalHtml = `
      <div id="comp-req-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
        <div style="background: #fff; border-radius: 8px; width: 800px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b;">Gerar Requerimento Especial - ${cityName}</h3>
            <button onclick="document.getElementById('comp-req-modal').remove()" style="background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: #64748b;">&times;</button>
          </div>
          <div style="padding: 20px; overflow-y: auto; flex: 1;">
            <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 10px;">Revise e ajuste o texto se necessário antes de copiar para o seu documento oficial.</p>
            <textarea id="comp-req-text" style="width: 100%; height: 400px; padding: 15px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: 'Times New Roman', serif; font-size: 1rem; resize: vertical; line-height: 1.5;">${template
      .replace(/\[EMPRESA\]/g, enterpriseName.toUpperCase())
      .replace(/\[UNIDADE\]/g, unitId)
      .replace(/\[COMPRADOR\]/g, customerName.toUpperCase())
      .replace(/\[DATA\]/g, dateStr)
      .replace(/\[TIPO_OPERACAO\]/g, textOp)}</textarea>
          </div>
          <div style="padding: 15px 20px; border-top: 1px solid #e2e8f0; text-align: right; background: #f8fafc; border-radius: 0 0 8px 8px; display: flex; justify-content: flex-end; gap: 10px;">
            <button onclick="CompromissarioApp.copyRequirement()" style="padding: 8px 20px; background: #10b981; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 6px;">
              <i data-lucide="copy" style="width: 16px;"></i> Copiar Texto
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (window.lucide) window.lucide.createIcons();
  },

  copyRequirement() {
    const textEl = document.getElementById('comp-req-text');
    if (!textEl) return;
    textEl.select();
    document.execCommand("copy");
    alert("Texto copiado! Você já pode colar no Word ou no e-mail.");
  },

  sendGroupedEmail(cityName) {
    if (!this.assertCessaoGate('notificar vendas/distratos em lote')) return;
    const cityKey = this.normalizeCityKey(cityName);
    const groupContracts = this.state.contracts.filter(c => this.normalizeCityKey(this.cityOfContract(c)) === cityKey);

    if (groupContracts.length === 0) return;
    const missingCessaoPdf = groupContracts.filter((c) => (c._movementType || c._operationType) === 'Cessão' && !this.movementHasPdf(c));
    if (missingCessaoPdf.length) {
      alert('Anexe o PDF da cessão de direitos em ' + missingCessaoPdf.length + ' movimento(s) antes de notificar a prefeitura.');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,%EF%BB%BF";
    csvContent += "Tipo;Empreendimento;Contrato destato;Contrato venda;Comprador anterior;Comprador novo;Empresa;Unidade\n";

    groupContracts.forEach(c => {
      const tipo = c._movementType || c._operationType || '';
      const dest = c._distrato;
      const venda = c._venda;
      const destId = dest && dest.id ? dest.id : (tipo === 'Distrato' ? c.id : '');
      const vendaId = venda && venda.id ? venda.id : (tipo === 'Venda' ? c.id : '');
      const oldName = dest ? this.customerNameOf(dest) : (tipo === 'Distrato' ? this.customerNameOf(c) : '');
      const newName = venda ? this.customerNameOf(venda) : (tipo === 'Venda' ? this.customerNameOf(c) : '');
      csvContent += `${tipo};${this.enterpriseLabel(c)};${destId};${vendaId};${oldName};${newName};${c.companyName || ''};${this.unitNameOf(c)}\n`;
      this.state.notifiedContracts[c.id] = true;
    });
    
    localStorage.setItem('crm_compromissario_notified', JSON.stringify(this.state.notifiedContracts));

    // Trigger Download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Distratos_Lote_${cityName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Prepare Email
    const configs = this.loadConfigs();
    const cityConfig = configs[cityKey] || {};
    const defaultEmail = cityConfig.email || '';
    const hasSpecialReq = cityConfig.reqEspecial;

    const hasTroca = groupContracts.some(c => c._movementType === 'Troca');
    const hasVendas = groupContracts.some(c => (c._movementType || c._operationType) === 'Venda');
    const hasDistratos = groupContracts.some(c => (c._movementType || c._operationType) === 'Distrato');
    const hasCessoes = groupContracts.some(c => (c._movementType || c._operationType) === 'Cessão');
    const parts = [];
    if (hasTroca) parts.push('Trocas de Compromissário (distrato + venda no mesmo mês)');
    if (hasVendas) parts.push('Vendas Emitidas');
    if (hasDistratos) parts.push('Distratos Realizados');
    if (hasCessoes) parts.push('Cessões de direitos');
    const operationName = parts.join(', ') || 'alterações de compromissário';

    const subject = `Troca de Compromissários - Lote ${cityName}`;
    
    let body = `Olá,%0D%0A%0D%0A`;
    body += `Gostaríamos de notificar alterações de compromissário devido a ${operationName} em ${cityName}.%0D%0A%0D%0A`;
    body += `Os detalhes de todos os contratos, lotes e clientes envolvidos encontram-se na planilha anexa, junto com a documentação em PDF de cada contrato.%0D%0A%0D%0A`;

    // Trigger action
    groupContracts.forEach((m) => this.downloadMovementFiles(m));

    if (cityConfig.hasPortal && cityConfig.portalUrl) {
      let msg = `ATENÇÃO OPERADOR:\n\nEsta prefeitura exige protocolo diretamente no site.\nUma planilha e os PDFs já encontrados no IntegrA/Sienge foram baixados.\nUma nova aba do portal será aberta agora.\n\nLogin: ${cityConfig.portalLogin || 'Não configurado'}\nSenha: ${cityConfig.portalSenha || 'Não configurado'}`;
      if (hasSpecialReq) msg += `\n\nLembre-se de gerar e anexar os requerimentos no site!`;
      alert(msg);
      const protocol = this.askPortalProtocol(cityName);
      groupContracts.forEach((c) => this.recordFollowup(c, { channel: 'portal', protocol, city: cityName, status: 'aguardando' }));
      this.renderTable();
      window.open(cityConfig.portalUrl, '_blank');
      return;
    }

    let alertMsg = `ATENÇÃO OPERADOR:\n\nUma planilha com ${groupContracts.length} movimento(s) foi baixada, junto com os PDFs já encontrados no IntegrA/Sienge.\nO rascunho de e-mail será aberto agora. Anexe a planilha e os PDFs.`;
    if (hasSpecialReq) {
      alertMsg += `\n\n⚠️ ALERTA IMPORTANTE ⚠️\nA prefeitura de ${cityName} exige REQUERIMENTOS ESPECIAIS. Gere e anexe também os requerimentos.`;
    }

    alert(alertMsg);
    groupContracts.forEach((c) => this.recordFollowup(c, { channel: 'email', city: cityName, status: 'aguardando' }));
    this.renderTable();

    const mailtoLink = `mailto:${defaultEmail}?subject=${subject}&body=${body}`;
    window.location.href = mailtoLink;
  },

  editTemplate(city) {
    const configs = this.loadConfigs();
    const cityKey = this.normalizeCityKey(city);
    const cityConfig = configs[cityKey] || {};
    const defaultTemplate = `EXMO. SR. PREFEITO MUNICIPAL DE ${city.toUpperCase()} – SP
N E S T A.

REQUERIMENTO

Naiara Iambasso, brasileiro(a), maior, abaixo assinado(a), portador(a) da Cédula de Identidade RG. n°. 42.863.712-7, inscrito(a) no C.P.F. sob n.° 227.003.988-23, residente à Rua Campos Salles, 2175 na cidade de Botucatu - SP, vem mui respeitosamente à presença de V. Excia., requerer: TRANSFERENCIA DE COMPROMISSARIO DEVIDO A [TIPO_OPERACAO] conforme cópias dos Cessão de direitos, em anexo, para: [EMPRESA] dos lotes a seguir:

Quadra-Lote: [UNIDADE] - [COMPRADOR]

______________________________________________________________________

TELEFONE= (14) 3880-5354
Justificativa: ___________________________________________________________

Endereço de entrega: ___________________________________________________

Nestes Termos,
P. Deferimento.
Botucatu, [DATA]`;

    const templateText = cityConfig.template || defaultTemplate;

    const modalHtml = `
      <div id="comp-tpl-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div style="background: #fff; border-radius: 8px; width: 700px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b;">Editar Padrão de Requerimento - ${city}</h3>
            <button onclick="document.getElementById('comp-tpl-modal').remove()" style="background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: #64748b;">&times;</button>
          </div>
          <div style="padding: 20px; overflow-y: auto; flex: 1;">
            <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 10px;">Variáveis disponíveis: <b>[EMPRESA]</b>, <b>[UNIDADE]</b>, <b>[COMPRADOR]</b>, <b>[DATA]</b>, <b>[TIPO_OPERACAO]</b>.</p>
            <textarea id="comp-tpl-text" style="width: 100%; height: 350px; padding: 15px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: 'Times New Roman', serif; font-size: 0.95rem; resize: vertical; line-height: 1.5;">${templateText}</textarea>
          </div>
          <div style="padding: 15px 20px; border-top: 1px solid #e2e8f0; text-align: right; background: #f8fafc; border-radius: 0 0 8px 8px;">
            <button onclick="CompromissarioApp.saveTemplate('${city}')" style="padding: 8px 20px; background: #105436; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Salvar Padrão</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  async saveTemplate(city) {
    const text = document.getElementById('comp-tpl-text').value;

    let configs = this.loadConfigs();
    const cityKey = this.normalizeCityKey(city);
    if (!configs[cityKey]) configs[cityKey] = { ativo: true };
    configs[cityKey].template = text;
    configs[cityKey].updatedAt = Date.now();
    try {
      await this.persistConfigs(configs, true);
      document.getElementById('comp-tpl-modal').remove();
      alert("Padrão salvo e enviado para a nuvem. Clique em Gerar Requerimento na tabela para testar.");
    } catch (err) {
      document.getElementById('comp-tpl-modal').remove();
      alert("Padrão ficou neste computador, mas a nuvem falhou: " + (err && err.message ? err.message : err));
    }
  }
};

// Auto-init when document ready or tab switched
document.addEventListener('DOMContentLoaded', () => {
  CompromissarioApp.init();
});

document.addEventListener('tabChanged', (e) => {
  if (e.detail === 'compromissario_prefeitura') {
    CompromissarioApp.init();
  }
});
