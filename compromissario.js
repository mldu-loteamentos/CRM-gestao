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
      const aOk = a.status === "none" || a.status === "has";
      const bOk = b.status === "none" || b.status === "has";
      if (aOk && !bOk) { out[month][id] = a; return; }
      if (bOk && !aOk) { out[month][id] = b; return; }
      const aAt = Number(a.declaredAt || a.uploadedAt || 0);
      const bAt = Number(b.declaredAt || b.uploadedAt || 0);
      out[month][id] = aAt >= bAt ? a : b;
    });
  });
  return JSON.stringify(out);
};

const CompromissarioApp = {
  CESSAO_LS_KEY: 'crm_compromissario_cessao_v1',

  state: {
    prefeituras: [],
    contracts: [],
    loading: false,
    files: {}, // contratoId -> file Object (temporary reference)
    openAccordions: new Set(),
    notifiedContracts: {},
    /** companyId -> { status: 'none'|'has'|null, fileName, records, uploadedAt } */
    cessaoByCompany: {},
    cessaoMonth: ''
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
    this.loadPrefeituras();
    const root = document.getElementById('compromissario-prefeitura-root');
    const monthEl = document.getElementById('comp-pref-month');
    const existingMonth = monthEl && monthEl.value ? monthEl.value : '';
    // Reentrar na aba: não apaga a tela — só recarrega declarações salvas do período
    if (root && root.querySelector('#comp-cessao-panel') && existingMonth) {
      this.ensureCessaoMonth(existingMonth);
      this.renderCessaoPanel();
      this.syncCessaoGateUi();
    } else {
      this.renderPrefeituraShell();
    }
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

  renderPrefeituraShell() {
    const root = document.getElementById('compromissario-prefeitura-root');
    if (!root) return;

    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM
    this.ensureCessaoMonth(currentMonth);

    root.innerHTML = `
      <div style="padding: 20px; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; height: 100%;">

        <div id="comp-cessao-panel" style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"></div>
        
        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="filter" style="width: 18px; color: #64748b;"></i> Filtros de Busca
          </h3>
          <div style="display: flex; gap: 15px; align-items: flex-end; flex-wrap: wrap;">
            <div style="width: 200px;">
              <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 5px;">Mês Referência (Competência)</label>
              <input type="month" id="comp-pref-month" value="${currentMonth}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;" onchange="CompromissarioApp.onMonthChange()">
            </div>
            <div style="flex: 1; min-width: 200px; display: none;">
              <input type="hidden" id="comp-pref-type" value="ALL">
            </div>
            <div>
              <button onclick="CompromissarioApp.openConfigModal()" style="padding: 8px 15px; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600; transition: background 0.2s; margin-right: 10px;" title="Configurar e-mails e requerimentos por cidade">
                <i data-lucide="settings" style="width: 16px;"></i> Configurações
              </button>
            </div>
            <div>
              <button onclick="CompromissarioApp.fetchContracts()" style="padding: 8px 20px; background: #105436; color: #fff; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: auto; white-space: nowrap; gap: 6px; font-weight: 600; transition: background 0.2s;" id="comp-pref-btn-search">
                <i data-lucide="search" style="width: 16px;"></i> <span>Buscar Contratos</span>
              </button>
            </div>
          </div>
          <p id="comp-cessao-gate-hint" style="display:none; margin: 12px 0 0; font-size: 0.8rem; color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 8px 10px;"></p>
        </div>

        <div style="flex: 1; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="padding: 15px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; color: #1e293b; font-size: 0.95rem; font-weight: 700;">Resultados da Busca (Agrupados por Cidade/Empreendimento)</h3>
            <span style="font-size: 0.8rem; color: #64748b; background: #e2e8f0; padding: 2px 8px; border-radius: 10px;" id="comp-pref-count">0 encontrados</span>
          </div>
          <div style="flex: 1; overflow-y: auto; padding: 15px;" id="comp-pref-tbody">
            <div style="text-align: center; padding: 40px; color: #94a3b8;">
              <i data-lucide="inbox" style="width: 32px; height: 32px; margin-bottom: 10px; opacity: 0.5;"></i><br>
              Utilize os filtros acima para buscar contratos.
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderCessaoPanel();
    this.syncCessaoGateUi();
    if (window.lucide) window.lucide.createIcons();
  },

  normalizeUnitKey(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
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

  ensureCessaoMonth(month) {
    const m = String(month || '').slice(0, 7);
    if (!m) return;
    this.state.cessaoMonth = m;
    const store = this.readCessaoStore();
    const monthMap = store[m] || {};
    const pickPrev = (id) => {
      const sid = String(id);
      return monthMap[sid] || monthMap[Number(sid)] || monthMap[id] || {};
    };
    const next = {};
    this.getActivePortfolioCompanies().forEach((c) => {
      const prev = pickPrev(c.id);
      next[c.id] = {
        status: prev.status === 'none' || prev.status === 'has' ? prev.status : null,
        fileName: prev.fileName || '',
        records: Array.isArray(prev.records) ? prev.records : [],
        uploadedAt: prev.uploadedAt || null,
        declaredAt: prev.declaredAt || null,
        parseNote: prev.parseNote || ''
      };
    });
    this.state.cessaoByCompany = next;
  },

  persistCessaoMonth() {
    const m = this.state.cessaoMonth;
    if (!m) return;
    const store = this.readCessaoStore();
    // Mantém empresas já gravadas no mês (mesmo se saírem da carteira ativa)
    const prevMonth = store[m] && typeof store[m] === 'object' ? store[m] : {};
    store[m] = { ...prevMonth, ...(this.state.cessaoByCompany || {}) };
    this.writeCessaoStore(store);
    if (window.forceUploadLocalConfig) {
      window.forceUploadLocalConfig(true).catch(() => {});
    }
  },

  onMonthChange() {
    const el = document.getElementById('comp-pref-month');
    const month = el ? el.value : '';
    this.ensureCessaoMonth(month);
    this.state.contracts = [];
    this.renderCessaoPanel();
    this.syncCessaoGateUi();
    const tbody = document.getElementById('comp-pref-tbody');
    const countLabel = document.getElementById('comp-pref-count');
    if (tbody) {
      tbody.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
          Utilize os filtros acima para buscar contratos.
        </div>`;
    }
    if (countLabel) countLabel.textContent = '0 encontrados';
    if (window.lucide) window.lucide.createIcons();
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
    const pending = this.getCessaoPendingCompanies();
    if (btn) {
      btn.disabled = !ready;
      btn.style.opacity = ready ? '1' : '0.55';
      btn.style.cursor = ready ? 'pointer' : 'not-allowed';
      btn.title = ready
        ? 'Buscar vendas e distratos do mês'
        : 'Declare cessão (ou ausência) de todas as empresas com carteira ativa';
    }
    if (hint) {
      if (ready) {
        hint.style.display = 'none';
        hint.textContent = '';
      } else {
        hint.style.display = 'block';
        hint.textContent = `Pendência de cessão: ${pending.length} empresa(s). Informe se houve cessão e anexe o relatório Sienge quando houver — sem isso não é permitido buscar vendas/distratos.`;
      }
    }
  },

  renderCessaoPanel() {
    const panel = document.getElementById('comp-cessao-panel');
    if (!panel) return;
    const companies = this.getActivePortfolioCompanies();
    const month = this.state.cessaoMonth || '';
    const ready = this.isCessaoGateReady();
    const badge = ready
      ? '<span style="font-size:0.72rem;font-weight:700;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:2px 8px;border-radius:999px;">Pronto para buscar</span>'
      : '<span style="font-size:0.72rem;font-weight:700;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;padding:2px 8px;border-radius:999px;">Obrigatório antes da busca</span>';

    const rows = companies.map((c) => {
      const row = this.state.cessaoByCompany[c.id] || {};
      const status = row.status;
      const hasFile = !!(row.fileName);
      const recCount = Array.isArray(row.records) ? row.records.length : 0;
      const noneChecked = status === 'none' ? 'checked' : '';
      const hasChecked = status === 'has' ? 'checked' : '';
      const uploadDisabled = status !== 'has' ? 'disabled' : '';
      let statusLine = '<span style="color:#94a3b8;">Aguardando declaração</span>';
      if (status === 'none') statusLine = '<span style="color:#047857;font-weight:600;">Sem cessão neste período (salvo)</span>';
      if (status === 'has' && hasFile) {
        statusLine = `<span style="color:#0369a1;font-weight:600;">Relatório: ${this.escHtml(row.fileName)}</span>` +
          (recCount ? ` <span style="color:#64748b;">· ${recCount} evento(s) / título(s)</span>` : '') +
          (row.parseNote ? ` <span style="color:#b45309;">· ${this.escHtml(row.parseNote)}</span>` : '');
      } else if (status === 'has' && !hasFile) {
        statusLine = '<span style="color:#b45309;font-weight:600;">Envie o relatório padrão Sienge (XLS/XLSX/CSV)</span>';
      }

      return `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#f8fafc;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline;">
            <div style="font-weight:700;color:#0f172a;font-size:0.9rem;">${c.id} — ${this.escHtml(c.name)}</div>
            <div style="font-size:0.78rem;">${statusLine}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;">
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;color:#334155;cursor:pointer;font-weight:600;">
              <input type="radio" name="comp-cessao-${c.id}" value="none" ${noneChecked}
                onchange="CompromissarioApp.setCessaoStatus('${c.id}','none')">
              Não teve cessão
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;color:#334155;cursor:pointer;font-weight:600;">
              <input type="radio" name="comp-cessao-${c.id}" value="has" ${hasChecked}
                onchange="CompromissarioApp.setCessaoStatus('${c.id}','has')">
              Teve cessão — anexar relatório
            </label>
            <div style="display:inline-flex;align-items:center;gap:8px;">
              <input type="file" id="comp-cessao-file-${c.id}" accept=".xlsx,.xls,.csv,.txt,.pdf"
                style="font-size:0.78rem;max-width:220px;" ${uploadDisabled}
                onchange="CompromissarioApp.onCessaoFile('${c.id}', event)">
              ${hasFile ? `<button type="button" onclick="CompromissarioApp.clearCessaoFile('${c.id}')" style="padding:4px 10px;border:1px solid #f37021;background:#fff7ed;color:#c2410c;border-radius:6px;font-size:0.75rem;font-weight:600;cursor:pointer;">Remover</button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div>
          <h3 style="margin:0 0 6px 0;color:#1e293b;font-size:1rem;display:flex;align-items:center;gap:8px;">
            <i data-lucide="file-stack" style="width:18px;color:#64748b;"></i>
            Relatórios de Cessão por Empresa
          </h3>
          <p style="margin:0;font-size:0.8rem;color:#64748b;max-width:720px;line-height:1.45;">
            Para o mês <strong>${this.escHtml(month)}</strong>, declare cada empresa com carteira ativa.
            Se houve cessão, envie o relatório padrão do Sienge (colunas Data, Empresa-loteamento, Título, Documento, Cliente — com <code>(P)</code>, <code>*</code> e comprador secundário).
            Preferência: XLS/XLSX/CSV para ler o histórico; PDF também libera o gate.
            A resposta <strong>Não teve cessão</strong> fica salva neste período (local + nuvem) e não será pedida de novo ao consultar o mesmo mês.
            Sem declaração ou anexo, a busca de vendas e distratos fica bloqueada.
          </p>
        </div>
        ${badge}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;max-height:320px;overflow:auto;">
        ${companies.length ? rows : '<p style="color:#64748b;font-size:0.85rem;margin:0;">Nenhuma empresa com carteira ativa configurada.</p>'}
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
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
    }
    this.persistCessaoMonth();
    this.renderCessaoPanel();
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
    this.persistCessaoMonth();
    this.renderCessaoPanel();
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
      row.uploadedAt = Date.now();
      row.declaredAt = Date.now();
      this.persistCessaoMonth();
      this.renderCessaoPanel();
      this.syncCessaoGateUi();
    } catch (e) {
      console.warn('[Compromissario] parse cessão', e);
      // Mesmo sem parse, o anexo vale para liberar o gate
      row.fileName = file.name;
      row.records = [];
      row.parseNote = 'Arquivo anexado (leitura parcial/indisponível)';
      row.uploadedAt = Date.now();
      this.persistCessaoMonth();
      this.renderCessaoPanel();
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
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    }
    return this.parseCessaoMatrix(matrix);
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

  parseCessaoMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    let headerIdx = -1;
    let col = { data: -1, empresa: -1, titulo: -1, documento: -1, cliente: -1 };

    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const cells = (rows[i] || []).map((c) => this.foldHeader(c));
      const find = (...needles) => cells.findIndex((h) => needles.some((n) => h.includes(n)));
      const data = find('DATA');
      const empresa = find('EMPRESA-LOTEAMENTO', 'EMPRESA LOTEAMENTO', 'EMPRESA');
      const titulo = find('TITULO');
      const documento = find('DOCUMENTO');
      const cliente = find('CLIENTE');
      if (data >= 0 && titulo >= 0 && cliente >= 0) {
        headerIdx = i;
        col = { data, empresa, titulo, documento, cliente };
        break;
      }
    }

    if (headerIdx < 0) {
      return { records: [], note: 'Cabeçalho Sienge não identificado — arquivo guardado mesmo assim' };
    }

    const records = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const data = String(r[col.data] != null ? r[col.data] : '').trim();
      const empresa = col.empresa >= 0 ? String(r[col.empresa] != null ? r[col.empresa] : '').trim() : '';
      const titulo = String(r[col.titulo] != null ? r[col.titulo] : '').trim();
      const documento = col.documento >= 0 ? String(r[col.documento] != null ? r[col.documento] : '').trim() : '';
      const clienteRaw = String(r[col.cliente] != null ? r[col.cliente] : '').trim();
      if (!titulo && !clienteRaw) continue;
      if (!titulo) continue;
      const clients = this.parseCessaoClientCell(clienteRaw);
      records.push({
        data,
        empresa,
        titulo: String(titulo).replace(/\.0$/, ''),
        documento,
        clients,
        principal: clients.find((c) => c.principal) || clients.find((c) => c.atual) || clients[0] || null,
        atuais: clients.filter((c) => c.atual)
      });
    }

    return {
      records,
      note: records.length
        ? `${new Set(records.map((r) => r.titulo)).size} título(s) no relatório`
        : 'Nenhuma linha de cessão lida'
    };
  },

  parseCessaoClientCell(raw) {
    const text = String(raw || '').replace(/\r/g, '\n');
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

  findCessaoHistoryForContract(contract) {
    if (!contract) return [];
    const titulo = String(contract.id || '').trim();
    if (!titulo) return [];
    const companyId = contract.companyId != null ? String(contract.companyId) : null;
    const all = [];
    Object.entries(this.state.cessaoByCompany || {}).forEach(([cid, row]) => {
      if (row.status !== 'has' || !Array.isArray(row.records)) return;
      if (companyId && cid !== companyId) return;
      row.records.forEach((rec) => {
        if (String(rec.titulo) === titulo) all.push(rec);
      });
    });
    // Ordena por data DD/MM/YYYY se possível
    all.sort((a, b) => {
      const pa = String(a.data || '').split('/');
      const pb = String(b.data || '').split('/');
      const da = pa.length === 3 ? `${pa[2]}${pa[1]}${pa[0]}` : String(a.data || '');
      const db = pb.length === 3 ? `${pb[2]}${pb[1]}${pb[0]}` : String(b.data || '');
      return da.localeCompare(db);
    });
    return all;
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
    
    const monthVal = document.getElementById('comp-pref-month').value;
    if (!monthVal) {
      alert("Por favor, selecione um mês de referência.");
      return;
    }
    this.ensureCessaoMonth(monthVal);

    // Parse month to first and last day
    const [year, month] = monthVal.split('-');
    const firstDay = `${year}-${month}-01`;
    const lastDay = new Date(year, parseInt(month), 0).getDate();
    const finalDay = `${year}-${month}-${lastDay}`;

    const btn = document.getElementById('comp-pref-btn-search');
    btn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 16px;"></i> <span>Buscando...</span>';
    this.state.loading = true;

    try {
      // Endpoint 1: Vendas do mês
      const endpointVendas = `/sales-contracts?limit=200&offset=0&situation=2&initialIssueDate=${firstDay}&finalIssueDate=${finalDay}`;
      // Endpoint 2: Distratos do mês
      const endpointDistratos = `/sales-contracts?limit=200&offset=0&situation=3&initialCancelDate=${firstDay}&finalCancelDate=${finalDay}`;

      const [resVendas, resDistratos] = await Promise.all([
        siengeFetchWithRetry(endpointVendas).catch(() => ({ results: [] })),
        siengeFetchWithRetry(endpointDistratos).catch(() => ({ results: [] }))
      ]);

      let vendas = resVendas.results || [];
      let distratos = resDistratos.results || [];

      // Marca o tipo em cada um
      vendas.forEach(v => v._operationType = 'Venda');
      distratos.forEach(d => d._operationType = 'Distrato');

      // Cruzamento: remover contratos que foram emitidos e distratados no mesmo mês
      const currentMonthPrefix = monthVal; // YYYY-MM
      
      const distratosValidos = distratos.filter(d => {
        // Se a data de emissão também for do mesmo mês do distrato, ignora
        if (d.issueDate && d.issueDate.startsWith(currentMonthPrefix)) {
          return false;
        }
        return true;
      });

      // Se por algum motivo o distratado do mês aparecer nas vendas (improvável por causa da situation=2), removemos também
      const distratadosIds = new Set(distratos.map(d => d.id));
      const vendasValidas = vendas.filter(v => !distratadosIds.has(v.id));

      let mergedResults = [...vendasValidas, ...distratosValidos];

      const beforeFilter = mergedResults.length;
      mergedResults = mergedResults.filter((c) => this.shouldNotifyContract(c));
      const skippedIncorp = beforeFilter - mergedResults.length;
      this.state._skippedIncorporacao = skippedIncorp;

      this.state.contracts = mergedResults;

      this.renderTable();
      this.hydrateTermosFromAnexos().catch((e) => console.warn('[Compromissario] hydrate termos', e));

    } catch (e) {
      console.error("[Compromissario] Erro ao buscar contratos", e);
      alert("Falha ao buscar os contratos no Sienge.");
    } finally {
      this.state.loading = false;
      btn.innerHTML = '<i data-lucide="search" style="width: 16px;"></i> <span>Buscar Contratos</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  },

  /** Baixa CONTRATO/DISTRATO já enviados pelo Assistente de Anexos (unidade no Sienge). */
  async hydrateTermosFromAnexos() {
    const list = this.state.contracts || [];
    if (!list.length) return;
    const fetchFn = window.anexosFetchTermoBlobForContract;
    if (typeof fetchFn !== 'function') {
      console.warn('[Compromissario] anexosFetchTermoBlobForContract indisponível');
      return;
    }
    const concurrency = 3;
    let i = 0;
    const run = async () => {
      while (i < list.length) {
        const idx = i++;
        const c = list[idx];
        const id = String(c.id || '');
        if (!id || this.state.files[id]) continue;
        try {
          const file = await fetchFn(c);
          if (file) {
            file._fromAnexos = true;
            this.state.files[id] = file;
          }
        } catch (e) {
          console.warn('[Compromissario] termo', id, e);
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
      const skippedEmpty = Number(this.state._skippedIncorporacao) || 0;
      tbody.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
          Nenhum contrato encontrado para este período.
          ${skippedEmpty > 0 ? `<div style="margin-top:12px;color:#166534;font-size:0.85rem;">${skippedEmpty} contrato(s) de Incorporação foram omitidos (sem lotes de exceção).</div>` : ''}
        </div>
      `;
      countLabel.textContent = '0 encontrados';
      return;
    }

    countLabel.textContent = `${this.state.contracts.length} encontrados`;
    const skipped = Number(this.state._skippedIncorporacao) || 0;

    // Agrupar por Cidade (parte antes do ' - ' no enterpriseName)
    const groups = {};
    let configs = this.loadConfigs();

    let configsChanged = false;

    this.state.contracts.forEach(c => {
      const enterpriseName = c.enterpriseName || `Emp: ${c.enterpriseId}`;
      const cityName = enterpriseName.includes(' - ') ? enterpriseName.split(' - ')[0].trim().toUpperCase() : enterpriseName.toUpperCase();
      const cityKey = this.normalizeCityKey(cityName);
      if (!groups[cityName]) groups[cityName] = [];
      groups[cityName].push(c);
      
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

    if (skipped > 0) {
      html += `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 6px; padding: 12px 15px; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px;">
          <i data-lucide="building-2" style="width: 20px; color: #16a34a; margin-top: 2px;"></i>
          <div>
            <h4 style="margin: 0 0 5px 0; color: #14532d; font-size: 0.9rem;">Incorporação — notificação dispensada</h4>
            <p style="margin: 0; color: #166534; font-size: 0.8rem;">${skipped} contrato(s) de empreendimento(s) tipo Incorporação foram ocultados. Só entram na fila lotes marcados como exceção (fora da incorporação) no Centro de Custo.</p>
          </div>
        </div>
      `;
    } 
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
            <p style="margin: 0; color: #b91c1c; font-size: 0.8rem;">As seguintes prefeituras possuem distratos na fila, mas não têm um e-mail configurado: <strong>${missingEmails.join(', ')}</strong>. Por favor, clique em "Configurações" no topo para preencher.</p>
          </div>
        </div>
      `;
    }

    Object.keys(groups).sort().forEach(cityName => {
      const groupContracts = groups[cityName];
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
              <span style="font-size: 0.75rem; background: ${isMissingEmail ? '#fecaca' : '#e2e8f0'}; color: ${isMissingEmail ? '#991b1b' : '#475569'}; padding: 3px 8px; border-radius: 12px; font-weight: 600;">${groupContracts.length} contratos</span>
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
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
              <thead>
                <tr style="background: #fff; border-bottom: 1px solid #e2e8f0;">
                  <th style="padding: 10px 15px; text-align: left; color: #64748b; font-weight: 600;">Contrato</th>
                  <th style="padding: 10px 15px; text-align: left; color: #64748b; font-weight: 600;">Comprador</th>
                  <th style="padding: 10px 15px; text-align: left; color: #64748b; font-weight: 600;">Empresa / Unidade</th>
                  <th style="padding: 10px 15px; text-align: left; color: #64748b; font-weight: 600; width: 250px;">Documento / Termo</th>
                  <th style="padding: 10px 15px; text-align: center; color: #64748b; font-weight: 600; width: 120px;">Ação</th>
                </tr>
              </thead>
              <tbody>
      `;

      html += groupContracts.map(c => {
        const id = c.id || '--';
        
        let customerName = 'Cliente Indisponível';
        if (c.salesContractCustomers && c.salesContractCustomers.length > 0) {
          customerName = c.salesContractCustomers[0].name || customerName;
        }

        const companyName = c.companyName || '';
        
        let unitInfo = '';
        if (c.salesContractUnits && c.salesContractUnits.length > 0) {
          unitInfo = c.salesContractUnits[0].name || `Unidade ${c.salesContractUnits[0].id || '--'}`;
        }

        const fileLoaded = this.state.files[id] ? true : false;
        const fromAnexos = !!(fileLoaded && this.state.files[id]._fromAnexos);
        const fileName = fileLoaded
          ? (fromAnexos ? `Assistente: ${this.state.files[id].name}` : this.state.files[id].name)
          : 'Buscando do Assistente / arraste o termo...';

        const opType = c._operationType || 'Desconhecido';
        const badgeColor = opType === 'Venda' ? '#10b981' : '#f43f5e';
        const badgeBg = opType === 'Venda' ? '#ecfdf5' : '#fff1f2';
        const dropBorder = fileLoaded ? (fromAnexos ? '#0ea5e9' : '#10b981') : '#cbd5e1';
        const dropBg = fileLoaded ? (fromAnexos ? '#f0f9ff' : '#ecfdf5') : '#f8fafc';
        const dropColor = fileLoaded ? (fromAnexos ? '#0369a1' : '#047857') : '#64748b';
        const dropIcon = fileLoaded ? (fromAnexos ? 'cloud-download' : 'check-circle') : 'upload-cloud';
        const cessaoHist = this.findCessaoHistoryForContract(c);
        let cessaoBadge = '';
        if (cessaoHist.length) {
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
          cessaoBadge = `
            <div style="margin-top:6px;font-size:0.7rem;line-height:1.35;color:#6b21a8;background:#faf5ff;border:1px solid #e9d5ff;border-radius:4px;padding:4px 6px;" title="${this.escHtml(tipLines)}">
              <strong>Cessão:</strong> ${cessaoHist.length} evento(s)
              ${principal ? `<br>Atual (P*): ${this.escHtml((principal.id ? principal.id + ' - ' : '') + (principal.name || ''))}` : ''}
              ${secundarios.length ? `<br>Secundário: ${this.escHtml(secundarios.map((s) => (s.id ? s.id + ' - ' : '') + s.name).join(', '))}` : ''}
            </div>`;
        }

        return `
          <tr style="border-bottom: 1px solid #f0f0f0; transition: background 0.1s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor='transparent'">
            <td style="padding: 12px 15px; font-weight: 600; color: #1e293b;">
              ${id}
              <div style="margin-top: 4px;">
                <span style="font-size: 0.7rem; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${badgeColor}33; display: inline-block;">${opType}</span>
              </div>
              ${cessaoBadge}
            </td>
            <td style="padding: 12px 15px; color: #334155;">${customerName}</td>
            <td style="padding: 12px 15px; color: #475569; font-size: 0.8rem;">
              <span style="color: #64748b;">${companyName}</span><br>
              <strong style="color: #0f172a;">${unitInfo}</strong>
            </td>
            <td style="padding: 12px 15px;">
              <div 
                id="comp-drop-${id}"
                style="border: 1.5px dashed ${dropBorder}; background: ${dropBg}; border-radius: 6px; padding: 8px 10px; font-size: 0.75rem; color: ${dropColor}; text-align: center; cursor: pointer; transition: all 0.2s;"
                ondragover="CompromissarioApp.onDragOver(event, '${id}')"
                ondragleave="CompromissarioApp.onDragLeave(event, '${id}')"
                ondrop="CompromissarioApp.onDrop(event, '${id}')"
                onclick="document.getElementById('comp-file-${id}').click()"
              >
                <i data-lucide="${dropIcon}" style="width: 14px; vertical-align: middle; margin-right: 4px;"></i>
                ${fileName}
              </div>
              <input type="file" id="comp-file-${id}" style="display: none;" onchange="CompromissarioApp.onFileSelect(event, '${id}')">
            </td>
            <td style="padding: 12px 15px; text-align: center; display: flex; flex-direction: column; gap: 6px; justify-content: center; align-items: center; height: 100%;">
              ${(configs[this.normalizeCityKey(cityName)] && configs[this.normalizeCityKey(cityName)].agrupar) ? `
                <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 600; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="layers" style="width: 12px;"></i> Agrupado</span>
              ` : `
                <button onclick="CompromissarioApp.sendEmail('${id}')" style="background: ${this.state.notifiedContracts[id] ? '#f1f5f9' : '#e0f2fe'}; color: ${this.state.notifiedContracts[id] ? '#64748b' : '#0284c7'}; border: 1px solid ${this.state.notifiedContracts[id] ? '#cbd5e1' : '#bae6fd'}; border-radius: 6px; padding: 6px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: background 0.2s; width: 100px; justify-content: center;" title="${this.state.notifiedContracts[id] ? 'Comunicação já realizada' : 'Iniciar Comunicação'}">
                  <i data-lucide="${this.state.notifiedContracts[id] ? 'check-check' : ((configs[this.normalizeCityKey(cityName)] && configs[this.normalizeCityKey(cityName)].hasPortal) ? 'external-link' : 'mail')}" style="width: 14px;"></i> ${this.state.notifiedContracts[id] ? 'Notificado' : ((configs[this.normalizeCityKey(cityName)] && configs[this.normalizeCityKey(cityName)].hasPortal) ? 'Portal' : 'Notificar')}
                </button>
              `}
              ${(configs[this.normalizeCityKey(cityName)] && configs[this.normalizeCityKey(cityName)].reqEspecial) ? `
                <button onclick="CompromissarioApp.generateRequirement('${id}')" style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: background 0.2s; width: 100px; justify-content: center;" title="Gerar Documento de Requerimento Especial">
                  <i data-lucide="file-text" style="width: 14px;"></i> Requerimento
                </button>
              ` : ''}
            </td>
          </tr>
        `;
      }).join('');

      html += `
              </tbody>
            </table>
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

  openConfigModal() {
    let existingModal = document.getElementById('comp-config-modal');
    if (existingModal) existingModal.remove();

    let configs = this.loadConfigs();

    const sortedCities = this.getCitiesWithAssignedOperator().sort((a, b) => {
      const activeA = configs[this.normalizeCityKey(a)]?.ativo ? 1 : 0;
      const activeB = configs[this.normalizeCityKey(b)]?.ativo ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA;
      return a.localeCompare(b);
    });

    const citiesListHtml = sortedCities.map(city => {
      const cityCfg = configs[this.normalizeCityKey(city)] || {};
      const currentEmail = cityCfg.email || '';
      const currentReq = cityCfg.reqEspecial ? 'checked' : '';
      const isActive = cityCfg.ativo ? 'checked' : '';
      const opacity = cityCfg.ativo ? '1' : '0.5';
      const bgColor = cityCfg.ativo ? '#10b981' : '#cbd5e1';
      const transX = cityCfg.ativo ? '16px' : '0px';

      return `
        <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e2e8f0; transition: opacity 0.2s;" id="cfg-row-${city}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h5 style="margin: 0; font-size: 0.85rem; color: #1e293b;">${city}</h5>
          </div>
          <div style="display: flex; gap: 20px; align-items: flex-start;">
            <div style="flex: 1;">
              <div id="email-field-${city}" style="display: ${cityCfg.hasPortal ? 'none' : 'block'};">
                <input type="text" id="cfg-email-${city}" placeholder="E-mail da prefeitura" value="${currentEmail}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem;">
              </div>
              <div id="portal-fields-${city}" style="display: ${cityCfg.hasPortal ? 'flex' : 'none'}; gap: 10px; flex-wrap: wrap;">
                <input type="text" id="cfg-url-${city}" placeholder="URL do site (ex: https://...)" value="${cityCfg.portalUrl || ''}" style="flex: 2; min-width: 150px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem;">
                <input type="text" id="cfg-login-${city}" placeholder="Login" value="${cityCfg.portalLogin || ''}" style="flex: 1; min-width: 80px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem;">
                <input type="password" id="cfg-senha-${city}" placeholder="Senha" value="${cityCfg.portalSenha || ''}" style="flex: 1; min-width: 80px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.85rem;">
              </div>
            </div>
            <div style="width: 250px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 5px;">
                  <input type="checkbox" id="cfg-req-${city}" ${currentReq} style="accent-color: #105436; width: 16px; height: 16px; cursor: pointer;" onchange="document.getElementById('cfg-btn-tpl-${city}').style.display = this.checked ? 'inline-block' : 'none'">
                  <label for="cfg-req-${city}" style="font-size: 0.85rem; color: #475569; cursor: pointer; font-weight: 500;">Exige Requerimento</label>
                </div>
                <button id="cfg-btn-tpl-${city}" style="display: ${cityCfg.reqEspecial ? 'inline-block' : 'none'}; padding: 2px 8px; font-size: 0.7rem; border-radius: 4px; background: #e2e8f0; border: 1px solid #cbd5e1; cursor: pointer; color: #475569;" onclick="CompromissarioApp.editTemplate('${city}')">Editar Padrão</button>
              </div>
              <div style="display: flex; align-items: center; gap: 5px;">
                <input type="checkbox" id="cfg-agrupar-${city}" ${cityCfg.agrupar ? 'checked' : ''} style="accent-color: #105436; width: 16px; height: 16px; cursor: pointer;">
                <label for="cfg-agrupar-${city}" style="font-size: 0.85rem; color: #475569; cursor: pointer; font-weight: 500;">Agrupar em Planilha</label>
              </div>
              <div style="display: flex; align-items: center; gap: 5px;">
                <input type="checkbox" id="cfg-portal-${city}" ${cityCfg.hasPortal ? 'checked' : ''} style="accent-color: #105436; width: 16px; height: 16px; cursor: pointer;" onchange="
                  document.getElementById('portal-fields-${city}').style.display = this.checked ? 'flex' : 'none';
                  document.getElementById('email-field-${city}').style.display = this.checked ? 'none' : 'block';
                ">
                <label for="cfg-portal-${city}" style="font-size: 0.85rem; color: #475569; cursor: pointer; font-weight: 500;">Usa Portal Online</label>
              </div>
            </div>
            
          </div>
        </div>
      `;
    }).join('');

    const modalHtml = `
      <div id="comp-config-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
        <div style="background: #fff; border-radius: 8px; width: 800px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b;">Configurações de Prefeituras</h3>
            <button onclick="document.getElementById('comp-config-modal').remove()" style="background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: #64748b;">&times;</button>
          </div>
          <div style="padding: 20px; overflow-y: auto; flex: 1;">
            ${sortedCities.length === 0 ? '<p style="color:#64748b; font-size:0.9rem;">Nenhuma cidade com operador atrelado. Cadastre a carteira em Atribuição de Operadores para configurar as prefeituras com antecedência.</p>' : citiesListHtml}
          </div>
          <div style="padding: 15px 20px; border-top: 1px solid #e2e8f0; text-align: right; background: #f8fafc; border-radius: 0 0 8px 8px;">
            <button onclick="CompromissarioApp.saveConfigModal()" style="padding: 8px 20px; background: #105436; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Salvar Configurações</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  async saveConfigModal() {
    let configs = this.loadConfigs();

    const citiesToSave = this.getCitiesWithAssignedOperator();
    citiesToSave.forEach(city => {
      const cityKey = this.normalizeCityKey(city);
      const emailEl = document.getElementById(`cfg-email-${city}`);
      const reqEl = document.getElementById(`cfg-req-${city}`);
      const agruparEl = document.getElementById(`cfg-agrupar-${city}`);
      const ativoEl = document.getElementById(`cfg-ativo-${city}`);
      const portalEl = document.getElementById(`cfg-portal-${city}`);
      const urlEl = document.getElementById(`cfg-url-${city}`);
      const loginEl = document.getElementById(`cfg-login-${city}`);
      const senhaEl = document.getElementById(`cfg-senha-${city}`);

      if (emailEl) {
        configs[cityKey] = {
          ...(configs[cityKey] || {}), // Keep previous properties like template
          email: emailEl.value.trim(),
          reqEspecial: reqEl.checked,
          agrupar: agruparEl.checked,
          ativo: ativoEl ? ativoEl.checked : true,
          hasPortal: portalEl ? portalEl.checked : false,
          portalUrl: urlEl ? urlEl.value : '',
          portalLogin: loginEl ? loginEl.value : '',
          portalSenha: senhaEl ? senhaEl.value : '',
          updatedAt: Date.now()
        };
      }
    });

    const modal = document.getElementById('comp-config-modal');
    try {
      await this.persistConfigs(configs, true);
      if (modal) modal.remove();
      alert("Configurações salvas e enviadas para a nuvem. Os demais operadores passam a ver ao atualizar a página.");
    } catch (err) {
      if (modal) modal.remove();
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

  sendEmail(id) {
    if (!this.assertCessaoGate('notificar troca de venda/distrato')) return;
    const c = this.state.contracts.find(x => String(x.id) === String(id));
    if (!c) return;

    if (this.state.notifiedContracts[id]) {
      if (!confirm("Você já preparou um rascunho de e-mail para este contrato anteriormente. Deseja criar um novo rascunho mesmo assim?")) {
        return;
      }
    }

    const opType = c._operationType || 'Venda';
    const operationName = opType === 'Venda' ? 'Venda Emitida (o lote saiu da empresa para o cliente)' : 'Distrato Realizado (o lote saiu do cliente para a empresa)';

    let customerName = 'Cliente';
    if (c.salesContractCustomers && c.salesContractCustomers.length > 0) {
      customerName = c.salesContractCustomers[0].name || customerName;
    }
    
    const enterpriseName = c.enterpriseName || '';
    const cityName = enterpriseName.includes(' - ') ? enterpriseName.split(' - ')[0].trim().toUpperCase() : enterpriseName.toUpperCase();
    
    let unitId = '';
    if (c.salesContractUnits && c.salesContractUnits.length > 0) {
      unitId = c.salesContractUnits[0].name || `Unidade ${c.salesContractUnits[0].id || ''}`;
    }

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
    body += `- Cliente Envolvido: ${customerName}%0D%0A%0D%0A`;
    body += `Segue(m) anexo(s) o(s) documento(s) necessário(s).`;

    // Trigger action
    if (cityConfig.hasPortal && cityConfig.portalUrl) {
      let msg = `ATENÇÃO OPERADOR:\n\nEsta prefeitura exige protocolo diretamente no site.\nUma nova aba será aberta agora.\n\nLogin: ${cityConfig.portalLogin || 'Não configurado'}\nSenha: ${cityConfig.portalSenha || 'Não configurado'}`;
      if (this.state.files[id]) msg += `\n\nO termo do Assistente/Sienge será baixado para você anexar no portal.`;
      if (hasSpecialReq) msg += `\n\n⚠️ ALERTA IMPORTANTE ⚠️\nA prefeitura de ${cityName} exige um REQUERIMENTO ESPECIAL. Lembre-se de gerar e anexar.`;
      alert(msg);

      if (this.state.files[id]) {
        try {
          const f = this.state.files[id];
          const url = URL.createObjectURL(f);
          const a = document.createElement('a');
          a.href = url;
          a.download = f.name || `termo-${id}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) {}
      }
      
      this.state.notifiedContracts[id] = true;
      localStorage.setItem('crm_compromissario_notified', JSON.stringify(this.state.notifiedContracts));
      this.renderTable();
      
      window.open(cityConfig.portalUrl, '_blank');
      return;
    }

    let alertMsg = this.state.files[id]
      ? `ATENÇÃO OPERADOR:\n\nO termo já foi carregado do Assistente/Sienge e será baixado agora. Anexe esse arquivo no rascunho de e-mail.`
      : `ATENÇÃO OPERADOR:\n\nUm rascunho de e-mail será aberto agora. Não se esqueça de anexar manualmente o arquivo da listagem.`;
    if (hasSpecialReq) {
      alertMsg += `\n\n⚠️ ALERTA IMPORTANTE ⚠️\nA prefeitura de ${cityName} exige um REQUERIMENTO ESPECIAL. Verifique se ele está preenchido e assinado corretamente antes de enviar.`;
    }

    alert(alertMsg);

    if (this.state.files[id]) {
      try {
        const f = this.state.files[id];
        const url = URL.createObjectURL(f);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name || `termo-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) {
        console.warn('[Compromissario] download termo', e);
      }
    }

    // Save state
    this.state.notifiedContracts[id] = true;
    localStorage.setItem('crm_compromissario_notified', JSON.stringify(this.state.notifiedContracts));
    this.renderTable(); // Update button visually

    const mailtoLink = `mailto:${defaultEmail}?subject=${subject}&body=${body}`;
    window.location.href = mailtoLink;
  },

  generateRequirement(id) {
    if (!this.assertCessaoGate('gerar requerimento de troca')) return;
    const c = this.state.contracts.find(x => String(x.id) === String(id));
    if (!c) return;

    let customerName = 'Cliente';
    if (c.salesContractCustomers && c.salesContractCustomers.length > 0) {
      customerName = c.salesContractCustomers[0].name || customerName;
    }

    const enterpriseName = c.companyName || 'MOURA LEITE DESENVOLVIMENTO E URBANIZACAO LTDA';
    const originalEnterpriseName = c.enterpriseName || '';
    const cityName = originalEnterpriseName.includes(' - ') ? originalEnterpriseName.split(' - ')[0].trim().toUpperCase() : originalEnterpriseName.toUpperCase();
    
    let unitId = '';
    if (c.salesContractUnits && c.salesContractUnits.length > 0) {
      unitId = c.salesContractUnits[0].name || `Unidade ${c.salesContractUnits[0].id || ''}`;
    }

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
    const opType = c._operationType || 'Venda';
    const textOp = opType === 'Venda' ? 'VENDA EMITIDA (o lote saiu da empresa para o cliente)' : 'DISTRATO REALIZADO (o lote saiu do cliente para a empresa)';

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
            <textarea id="comp-req-text" style="width: 100%; height: 400px; padding: 15px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: 'Times New Roman', serif; font-size: 1rem; resize: vertical; line-height: 1.5;">${template}</textarea>
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
    const groupContracts = this.state.contracts.filter(c => {
      const entName = c.enterpriseName || '';
      const cName = entName.includes(' - ') ? entName.split(' - ')[0].trim().toUpperCase() : entName.toUpperCase();
      return this.normalizeCityKey(cName) === cityKey;
    });

    if (groupContracts.length === 0) return;

    // Build CSV Content
    let csvContent = "data:text/csv;charset=utf-8,%EF%BB%BF"; // BOM for excel
    csvContent += "Contrato;Comprador;Empresa;Unidade\n";

    groupContracts.forEach(c => {
      let customerName = 'Cliente';
      if (c.salesContractCustomers && c.salesContractCustomers.length > 0) {
        customerName = c.salesContractCustomers[0].name || customerName;
      }
      const companyName = c.companyName || '';
      let unitId = '';
      if (c.salesContractUnits && c.salesContractUnits.length > 0) {
        unitId = c.salesContractUnits[0].name || c.salesContractUnits[0].id || '';
      }
      csvContent += `${c.id};${customerName};${companyName};${unitId}\n`;
      
      // Mark as notified visually
      this.state.notifiedContracts[c.id] = true;
    });
    
    localStorage.setItem('crm_compromissario_notified', JSON.stringify(this.state.notifiedContracts));
    this.renderTable();

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

    const hasVendas = groupContracts.some(c => c._operationType === 'Venda');
    const hasDistratos = groupContracts.some(c => c._operationType === 'Distrato');
    let operationName = '';
    if (hasVendas && hasDistratos) operationName = 'Vendas Emitidas e Distratos Realizados';
    else if (hasVendas) operationName = 'Vendas Emitidas (lotes saindo da empresa para clientes)';
    else operationName = 'Distratos Realizados (lotes retornando dos clientes para a empresa)';

    const subject = `Troca de Compromissários - Lote ${cityName}`;
    
    let body = `Olá,%0D%0A%0D%0A`;
    body += `Gostaríamos de notificar alterações de compromissário devido a ${operationName} em ${cityName}.%0D%0A%0D%0A`;
    body += `Os detalhes de todos os contratos, lotes e clientes envolvidos encontram-se na planilha anexa, junto com a documentação em PDF de cada contrato.%0D%0A%0D%0A`;

    // Trigger action
    if (cityConfig.hasPortal && cityConfig.portalUrl) {
      let msg = `ATENÇÃO OPERADOR:\n\nEsta prefeitura exige protocolo diretamente no site.\nUma planilha foi baixada no seu computador.\nUma nova aba do portal será aberta agora.\n\nLogin: ${cityConfig.portalLogin || 'Não configurado'}\nSenha: ${cityConfig.portalSenha || 'Não configurado'}`;
      if (hasSpecialReq) msg += `\n\nLembre-se de gerar e anexar os requerimentos no site!`;
      alert(msg);
      window.open(cityConfig.portalUrl, '_blank');
      return;
    }

    let alertMsg = `ATENÇÃO OPERADOR:\n\nUma planilha com ${groupContracts.length} contratos foi baixada no seu computador.\nO rascunho de e-mail será aberto agora. NÃO SE ESQUEÇA de arrastar a planilha E todos os termos de distrato para dentro dele!`;
    if (hasSpecialReq) {
      alertMsg += `\n\n⚠️ ALERTA IMPORTANTE ⚠️\nA prefeitura de ${cityName} exige REQUERIMENTOS ESPECIAIS. Gere e anexe também os requerimentos.`;
    }

    alert(alertMsg);

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
