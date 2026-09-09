/**
 * Comercial · Condições de Pagamento
 * Lista tipos do Sienge (GET /payment-condition-types) e flags:
 * — gera boleto no Sienge
 * — parcela gerada pela Webro
 */
const CondicoesPagamentoApp = {
  STORAGE_KEY: "crm_moura_condicoes_pagamento",
  items: [],
  flags: {},
  loading: false,
  error: "",
  q: "",
  saveTimer: null,
  saving: false,
  saveMsg: "",
  _inited: false,

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  apiUrl(path) {
    const host = window.location.hostname;
    const isLocal = !host || host === "localhost" || host === "127.0.0.1";
    const port = (window.location.port === "5500" || !window.location.port) ? "3000" : window.location.port;
    const origin = isLocal ? `http://localhost:${port}` : "";
    return origin + path;
  },

  parseFlagsPayload(raw) {
    try {
      const obj = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
      if (!obj || typeof obj !== "object") return { byId: {}, updatedAt: 0 };
      return {
        byId: (obj.byId && typeof obj.byId === "object") ? { ...obj.byId } : {},
        updatedAt: Number(obj.updatedAt || 0) || 0
      };
    } catch (e) {
      return { byId: {}, updatedAt: 0 };
    }
  },

  flagsToRaw() {
    return JSON.stringify({
      byId: this.flags || {},
      updatedAt: Number(this._flagsUpdatedAt || 0) || 0
    });
  },

  /**
   * Merge por updatedAt: o lado mais novo ganha por chave.
   * Não bumpa updatedAt com Date.now() (isso fazia o sync achar “mudança”
   * e reenviar defaults, resetando os toggles).
   */
  mergeFlagsPayload(localRaw, cloudRaw) {
    const local = this.parseFlagsPayload(localRaw);
    const cloud = this.parseFlagsPayload(cloudRaw);
    const byId = {};
    if (local.updatedAt > cloud.updatedAt) {
      Object.assign(byId, cloud.byId, local.byId);
    } else if (cloud.updatedAt > local.updatedAt) {
      Object.assign(byId, local.byId, cloud.byId);
    } else {
      // Empate: une as duas (preferência ao valor local em conflito)
      Object.assign(byId, cloud.byId, local.byId);
    }
    return {
      byId,
      updatedAt: Math.max(local.updatedAt || 0, cloud.updatedAt || 0)
    };
  },

  applyFlagsPayload(parsed, opts) {
    if (!parsed || typeof parsed !== "object") return;
    const incomingAt = Number(parsed.updatedAt || 0) || 0;
    const memAt = Number(this._flagsUpdatedAt || 0) || 0;
    const force = !!(opts && opts.force);
    // Não sobrescreve memória se o usuário acabou de alterar e ainda não sincronizou
    if (!force && memAt > incomingAt && this.flags && Object.keys(this.flags).length) {
      return false;
    }
    this.flags = (parsed.byId && typeof parsed.byId === "object") ? { ...parsed.byId } : {};
    this._flagsUpdatedAt = Math.max(memAt, incomingAt);
    return true;
  },

  loadFlagsFromLocal() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY) || "{}";
      const parsed = this.parseFlagsPayload(raw);
      this.applyFlagsPayload(parsed);
    } catch (e) {
      this.flags = this.flags || {};
    }
  },

  loadFlags() {
    this.loadFlagsFromLocal();
  },

  async loadFlagsFromCloud() {
    if (!window.firebaseDb || !window.firebaseCollections) return false;
    try {
      const docRef = window.firebaseCollections.doc(window.firebaseDb, "config", "global");
      const snap = await window.firebaseCollections.getDoc(docRef);
      const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (!exists) return false;
      const data = snap.data() || {};
      const cloudRaw = data[this.STORAGE_KEY];
      if (!cloudRaw) return false;
      const localRaw = (() => {
        try { return localStorage.getItem(this.STORAGE_KEY) || "{}"; } catch (e) { return "{}"; }
      })();
      const memRaw = this.flagsToRaw();
      // Memória (alteração recente) > localStorage > cloud
      let merged = this.mergeFlagsPayload(localRaw, cloudRaw);
      merged = this.mergeFlagsPayload(JSON.stringify(merged), memRaw);
      this.applyFlagsPayload(merged, { force: true });
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
          byId: this.flags,
          updatedAt: this._flagsUpdatedAt
        }));
      } catch (e) {
        /* cota cheia: mantém em memória + Firebase */
      }
      return true;
    } catch (e) {
      console.warn("[CondicoesPagamento] load cloud:", e);
      return false;
    }
  },

  flagOf(id) {
    const key = String(id == null ? "" : id).trim();
    const cur = this.flags[key] || {};
    return {
      boletoSienge: cur.boletoSienge !== false,
      parcelaWebro: cur.parcelaWebro === true
    };
  },

  async persistFlags(opts) {
    const silent = !!(opts && opts.silent);
    const payload = {
      byId: { ...(this.flags || {}) },
      updatedAt: Date.now()
    };
    this._flagsUpdatedAt = payload.updatedAt;
    this.flags = payload.byId;
    const json = JSON.stringify(payload);
    let localOk = false;
    let cloudOk = false;

    this.saving = true;
    this.saveMsg = "";
    this.renderStatus();

    // Firebase primeiro — fonte da verdade entre navegadores
    try {
      if (window.firebaseDb && window.firebaseCollections) {
        const docRef = window.firebaseCollections.doc(window.firebaseDb, "config", "global");
        await window.firebaseCollections.setDoc(docRef, { [this.STORAGE_KEY]: json }, { merge: true });
        cloudOk = true;
      }
    } catch (e) {
      console.warn("[CondicoesPagamento] sync cloud:", e);
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, json);
      localOk = true;
    } catch (e) {
      console.warn("[CondicoesPagamento] localStorage cheio:", e);
    }

    // Fallback: upload completo das configs (se o setDoc pontual falhar)
    if (!cloudOk && window.forceUploadLocalConfig) {
      try {
        // Garante que o upload leve a memória atual mesmo sem localStorage
        try { localStorage.setItem(this.STORAGE_KEY, json); } catch (e) {}
        await window.forceUploadLocalConfig(true);
        cloudOk = true;
      } catch (e) {
        console.warn("[CondicoesPagamento] forceUpload:", e);
      }
    }

    this.saving = false;
    if (localOk || cloudOk) {
      this.saveMsg = cloudOk ? "Salvo no Firebase" : "Salvo neste navegador";
      this.error = "";
    } else {
      this.saveMsg = "";
      this.error = "Não foi possível salvar (Firebase / armazenamento).";
      if (!silent) alert(this.error);
    }
    this.renderStatus();
    return localOk || cloudOk;
  },

  schedulePersist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.persistFlags({ silent: true });
    }, 180);
  },

  setFlag(id, field, on) {
    const key = String(id == null ? "" : id).trim();
    if (!key) return;
    const cur = this.flagOf(key);
    cur[field] = !!on;
    this.flags[key] = cur;
    this._flagsUpdatedAt = Date.now();
    this.saveMsg = "Salvando…";
    this.renderStatus();
    this.schedulePersist();
  },

  normalizeItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = raw.id != null ? String(raw.id) : (raw.code != null ? String(raw.code) : "");
    if (!id) return null;
    const name = raw.name || raw.description || raw.paymentConditionTypeName || raw.typeName || id;
    const description = raw.description && raw.description !== name ? raw.description : (raw.observation || raw.note || "");
    return {
      id,
      name: String(name),
      description: String(description || ""),
      raw
    };
  },

  async fetchAllTypes() {
    if (window.SiengeApiService && typeof SiengeApiService.getPaymentConditionTypes === "function") {
      const list = await SiengeApiService.getPaymentConditionTypes();
      return (list || []).map((x) => this.normalizeItem(x)).filter(Boolean);
    }
    const out = [];
    let offset = 0;
    const limit = 100;
    for (let page = 0; page < 50; page++) {
      const url = this.apiUrl(`/sienge-proxy/payment-condition-types?limit=${limit}&offset=${offset}`);
      const headers = { Accept: "application/json" };
      if (typeof getBasicAuthHeader === "function") headers.Authorization = getBasicAuthHeader();
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const batch = Array.isArray(data) ? data : (data.results || data.data || []);
      batch.forEach((row) => {
        const n = this.normalizeItem(row);
        if (n) out.push(n);
      });
      if (batch.length < limit) break;
      offset += limit;
    }
    return out;
  },

  filtered() {
    const q = String(this.q || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!q) return this.items;
    return this.items.filter((it) => {
      const blob = `${it.id} ${it.name} ${it.description}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return blob.includes(q);
    });
  },

  switchHtml(id, field, checked, label) {
    const idJs = JSON.stringify(String(id));
    return `<label class="moura-switch" title="${this.esc(label)}">
      <input type="checkbox" ${checked ? "checked" : ""} onchange="CondicoesPagamentoApp.setFlag(${idJs},'${field}',this.checked)">
      <span class="moura-switch-track" aria-hidden="true"></span>
      <span class="moura-switch-text">${this.esc(label)}</span>
    </label>`;
  },

  renderStatus() {
    const el = document.getElementById("cpag-status");
    if (!el) return;
    if (this.loading) el.textContent = "Carregando…";
    else if (this.saving) el.textContent = "Salvando…";
    else if (this.error) el.textContent = this.error;
    else if (this.saveMsg) el.textContent = `${this.items.length} tipo(s) · ${this.saveMsg}`;
    else el.textContent = `${this.items.length} tipo(s)`;
  },

  renderTable() {
    const tbody = document.getElementById("cpag-tbody");
    if (!tbody) return;
    const rows = this.filtered();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:28px;">
        ${this.loading ? "Carregando…" : (this.error ? this.esc(this.error) : "Nenhuma condição encontrada.")}
      </td></tr>`;
      this.renderStatus();
      return;
    }
    tbody.innerHTML = rows.map((it) => {
      const f = this.flagOf(it.id);
      return `<tr>
        <td style="padding:12px 14px;font-weight:800;color:#105436;white-space:nowrap;">${this.esc(it.id)}</td>
        <td style="padding:12px 14px;">
          <div style="font-weight:700;color:#0f172a;">${this.esc(it.name)}</div>
          ${it.description ? `<div style="font-size:0.78rem;color:#64748b;margin-top:3px;">${this.esc(it.description)}</div>` : ""}
        </td>
        <td style="padding:12px 14px;">
          ${this.switchHtml(it.id, "boletoSienge", f.boletoSienge, "Boleto Sienge")}
        </td>
        <td style="padding:12px 14px;">
          ${this.switchHtml(it.id, "parcelaWebro", f.parcelaWebro, "Parcela Webro")}
        </td>
      </tr>`;
    }).join("");
    this.renderStatus();
  },

  render() {
    const root = document.getElementById("condicoes-pagamento-root");
    if (!root) return;
    root.innerHTML = `
      <div style="padding:16px 18px 28px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
          <h2 style="margin:0;display:flex;align-items:center;gap:8px;font-size:1.15rem;font-weight:800;color:#0f172a;">
            <i data-lucide="file-text" style="width:22px;color:var(--color-primary);"></i>
            Condições de Pagamento
          </h2>
          <button type="button" class="btn btn-primary" onclick="CondicoesPagamentoApp.reload()" ${this.loading ? "disabled" : ""}>
            <i data-lucide="refresh-cw" style="width:16px;"></i> Atualizar
          </button>
        </div>

        <div class="crm-card" style="padding:12px 14px;margin-bottom:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input class="form-control" id="cpag-search" placeholder="Filtrar por código ou nome…" value="${this.esc(this.q)}"
            oninput="CondicoesPagamentoApp.q=this.value;CondicoesPagamentoApp.renderTable()" style="max-width:320px;font-size:0.85rem;">
          <span id="cpag-status" style="font-size:0.8rem;color:#64748b;"></span>
        </div>

        <div class="crm-card" style="padding:0;overflow:hidden;">
          <div style="overflow:auto;">
            <table class="custom-table" style="width:100%;border-collapse:collapse;font-size:0.85rem;">
              <thead>
                <tr>
                  <th style="padding:10px 14px;background:#105436;color:#fff;text-align:left;width:90px;">Código</th>
                  <th style="padding:10px 14px;background:#105436;color:#fff;text-align:left;">Condição</th>
                  <th style="padding:10px 14px;background:#105436;color:#fff;text-align:left;min-width:180px;">Gera boleto (Sienge)</th>
                  <th style="padding:10px 14px;background:#105436;color:#fff;text-align:left;min-width:180px;">Parcela Webro</th>
                </tr>
              </thead>
              <tbody id="cpag-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>`;
    this.renderTable();
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
  },

  async reload() {
    this.loading = true;
    this.error = "";
    this.render();
    try {
      await this.loadFlagsFromCloud();
      this.loadFlagsFromLocal();
      this.items = await this.fetchAllTypes();
      this.items.sort((a, b) => String(a.id).localeCompare(String(b.id), "pt-BR", { numeric: true }));
    } catch (e) {
      console.error("[CondicoesPagamento]", e);
      this.error = "Não foi possível carregar as condições no Sienge: " + (e.message || e);
      this.items = [];
    }
    this.loading = false;
    this.render();
  },

  async init() {
    if (this._inited && this.items.length) {
      this.render();
      await this.loadFlagsFromCloud();
      this.renderTable();
      return;
    }
    this._inited = true;
    await this.reload();
  }
};

window.CondicoesPagamentoApp = CondicoesPagamentoApp;

window.mergeCondicoesPagamento = function(localStr, cloudStr) {
  const app = window.CondicoesPagamentoApp;
  if (!app || typeof app.mergeFlagsPayload !== "function") {
    return localStr || cloudStr || "{}";
  }
  // Preferência: memória (toggle recente) → localStorage → cloud
  let merged = app.mergeFlagsPayload(localStr || "{}", cloudStr || "{}");
  try {
    if (app.flags && typeof app._flagsUpdatedAt === "number") {
      const memRaw = app.flagsToRaw ? app.flagsToRaw() : JSON.stringify({
        byId: app.flags,
        updatedAt: app._flagsUpdatedAt || 0
      });
      merged = app.mergeFlagsPayload(JSON.stringify(merged), memRaw);
    }
  } catch (e) {}
  return JSON.stringify(merged);
};

window.getPaymentConditionFlags = function(conditionId) {
  const app = window.CondicoesPagamentoApp;
  if (app) {
    const memAt = Number(app._flagsUpdatedAt || 0) || 0;
    let localAt = 0;
    try {
      localAt = app.parseFlagsPayload(localStorage.getItem(app.STORAGE_KEY) || "{}").updatedAt || 0;
    } catch (e) {}
    // Só relê localStorage se for mais novo (ou memória vazia)
    if (!memAt || localAt > memAt || !app.flags || !Object.keys(app.flags).length) {
      app.loadFlagsFromLocal();
    }
    return app.flagOf(conditionId);
  }
  return { boletoSienge: true, parcelaWebro: false };
};

window.paymentConditionAllowsBoleto = function(conditionId) {
  return window.getPaymentConditionFlags(conditionId).boletoSienge !== false;
};

window.paymentConditionIsWebro = function(conditionId) {
  return window.getPaymentConditionFlags(conditionId).parcelaWebro === true;
};

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "condicoes-pagamento") {
    CondicoesPagamentoApp.init();
  }
});
