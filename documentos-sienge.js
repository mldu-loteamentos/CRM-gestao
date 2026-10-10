/**
 * Configurações · Apoio · Tipos de Documento
 * Lista os documentos do Sienge (GET /document-identifications) e define quais exigem ciência
 * no título a pagar antes da autorização. O padrão vem do cadastro do Sienge
 * (requireAcknowledgementOnPayableBill); o que for alterado aqui fica em crm_documentos_ciencia.
 */
const DocumentosSiengeApp = {
  STORAGE_KEY: "crm_documentos_ciencia",
  CACHE_KEY: "crm_documentos_sienge_cache",
  CACHE_HORAS: 24,
  items: [],
  loading: false,
  error: "",
  q: "",
  inativos: false,
  _carregando: null,

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  ajustes() {
    try {
      const v = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "{}");
      return v && typeof v.byId === "object" ? v : { byId: {}, updatedAt: 0 };
    } catch (e) {
      return { byId: {}, updatedAt: 0 };
    }
  },

  cache() {
    try {
      const v = JSON.parse(localStorage.getItem(this.CACHE_KEY) || "{}");
      return v && Array.isArray(v.items) ? v : { at: 0, items: [] };
    } catch (e) {
      return { at: 0, items: [] };
    }
  },

  normalizar(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.documentIdentificationId || raw.id || "").trim();
    if (!id) return null;
    return {
      id,
      nome: String(raw.name || id),
      ativo: raw.active !== false,
      pagamento: raw.allowPayment !== false,
      cienciaSienge: raw.requireAcknowledgementOnPayableBill === true
    };
  },

  async buscarNoSienge() {
    if (typeof window.siengeFetchWithRetry !== "function") throw new Error("A API do Sienge não está disponível.");
    const out = [];
    const limit = 200;
    for (let offset = 0; offset < 5000; offset += limit) {
      const data = await window.siengeFetchWithRetry(`/document-identifications?limit=${limit}&offset=${offset}`, 3);
      const lote = (data && (data.results || data.data)) || (Array.isArray(data) ? data : []);
      lote.forEach((r) => {
        const n = this.normalizar(r);
        if (n) out.push(n);
      });
      if (lote.length < limit) break;
    }
    out.sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
    try { localStorage.setItem(this.CACHE_KEY, JSON.stringify({ at: Date.now(), items: out })); } catch (e) {}
    return out;
  },

  /** Lista de documentos (cache de 24h); usada também pelo Gerar Pagamento sem abrir esta tela. */
  async garantirLista(forcar) {
    const c = this.cache();
    if (!forcar && c.items.length && Date.now() - (c.at || 0) < this.CACHE_HORAS * 3600000) {
      this.items = c.items;
      return this.items;
    }
    if (this._carregando) return this._carregando;
    this._carregando = this.buscarNoSienge()
      .then((list) => { this.items = list; return list; })
      .catch((e) => {
        if (c.items.length) {
          this.items = c.items;
          return this.items;
        }
        throw e;
      })
      .finally(() => { this._carregando = null; });
    return this._carregando;
  },

  exigeCiencia(docId) {
    const id = String(docId || "").trim().toUpperCase();
    if (!id) return false;
    const aj = this.ajustes().byId[id];
    if (aj && typeof aj.ciencia === "boolean") return aj.ciencia;
    const doc = (this.items.length ? this.items : this.cache().items).find((d) => d.id.toUpperCase() === id);
    return !!(doc && doc.cienciaSienge);
  },

  setCiencia(id, on) {
    const doc = this.items.find((d) => d.id === id);
    const aj = this.ajustes();
    if (doc && doc.cienciaSienge === !!on) delete aj.byId[id];
    else aj.byId[id] = { ciencia: !!on, updatedAt: Date.now() };
    aj.updatedAt = Date.now();
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(aj));
    this.renderTable();
  },

  filtrados() {
    const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = fold(this.q).trim();
    return this.items.filter((d) => (this.inativos || d.ativo) && (!q || fold(`${d.id} ${d.nome}`).includes(q)));
  },

  renderStatus() {
    const el = document.getElementById("dsg-status");
    if (!el) return;
    const n = this.items.filter((d) => this.exigeCiencia(d.id)).length;
    el.textContent = this.loading ? "Carregando…" : (this.error || `${this.items.length} documento(s) · ${n} exige(m) ciência`);
  },

  renderTable() {
    const tbody = document.getElementById("dsg-tbody");
    if (!tbody) return;
    const rows = this.filtrados();
    const ajustes = this.ajustes().byId;
    tbody.innerHTML = rows.length ? rows.map((d) => {
      const on = this.exigeCiencia(d.id);
      const mudado = ajustes[d.id] && typeof ajustes[d.id].ciencia === "boolean";
      return `<tr${d.ativo ? "" : ' style="opacity:.55"'}>
        <td class="cpag-td-code">${this.esc(d.id)}</td>
        <td><div class="cpag-name">${this.esc(d.nome)}</div>${d.ativo ? "" : `<div class="cpag-desc">Inativo no Sienge</div>`}</td>
        <td><span class="cpag-desc">${d.cienciaSienge ? "Exige ciência" : "Não exige"}</span></td>
        <td>
          <label class="moura-switch" title="Exige ciência antes da autorização">
            <input type="checkbox" ${on ? "checked" : ""} onchange="DocumentosSiengeApp.setCiencia('${this.esc(d.id)}', this.checked)">
            <span class="moura-switch-track" aria-hidden="true"></span>
            <span class="moura-switch-text">${on ? "Exige ciência" : "Não exige"}</span>
          </label>
          ${mudado ? `<div class="cpag-desc">Diferente do Sienge</div>` : ""}
        </td>
      </tr>`;
    }).join("") : `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:28px;">${this.loading ? "Carregando…" : this.esc(this.error || "Nenhum documento encontrado.")}</td></tr>`;
    this.renderStatus();
  },

  render() {
    const root = document.getElementById("documentos-sienge-root");
    if (!root) return;
    root.innerHTML = `
      <div class="cpag-page">
        <div class="cpag-toolbar">
          <input class="form-control cpag-search" placeholder="Filtrar por código ou nome…" value="${this.esc(this.q)}"
            oninput="DocumentosSiengeApp.q=this.value;DocumentosSiengeApp.renderTable()">
          <label class="cpag-status" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" ${this.inativos ? "checked" : ""} onchange="DocumentosSiengeApp.inativos=this.checked;DocumentosSiengeApp.renderTable()"> Mostrar inativos
          </label>
          <span id="dsg-status" class="cpag-status"></span>
          <button type="button" class="btn btn-primary cpag-refresh" onclick="DocumentosSiengeApp.reload()" ${this.loading ? "disabled" : ""}>
            <i data-lucide="refresh-cw" style="width:14px;"></i> Atualizar do Sienge
          </button>
        </div>
        <p class="cpag-desc" style="margin:0 0 10px;">A ciência é dada no Sienge antes da autorização do título. O padrão de cada documento vem do cadastro do Sienge; o que for alterado aqui vale para o Gerar Pagamento.</p>
        <div class="crm-card cpag-card">
          <div class="crm-scroll-table cpag-table-wrap">
            <table class="custom-table cpag-table">
              <thead><tr>
                <th class="cpag-col-code">Código</th>
                <th>Documento</th>
                <th class="cpag-col-flag">No Sienge</th>
                <th class="cpag-col-flag">Ciência no título a pagar</th>
              </tr></thead>
              <tbody id="dsg-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>`;
    this.renderTable();
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
  },

  async reload(forcar = true) {
    this.loading = true;
    this.error = "";
    this.render();
    try {
      await this.garantirLista(forcar);
    } catch (e) {
      this.error = "Não foi possível carregar os documentos do Sienge: " + (e.message || e);
    }
    this.loading = false;
    this.render();
  },

  init() {
    if (this.items.length) this.render();
    this.reload(!this.cache().items.length);
  }
};

window.DocumentosSiengeApp = DocumentosSiengeApp;
window.documentoExigeCiencia = (docId) => DocumentosSiengeApp.exigeCiencia(docId);

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "documentos-sienge") DocumentosSiengeApp.init();
});
