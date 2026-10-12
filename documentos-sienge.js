/**
 * Configurações · Apoio · Tipos de Documento
 * Lista os documentos do Sienge (GET /document-identifications) e mostra quais exigem ciência
 * no título a pagar antes da autorização, conforme o cadastro do Sienge (requireAcknowledgementOnPayableBill).
 */
const DocumentosSiengeApp = {
  CACHE_KEY: "crm_documentos_sienge_cache",
  VISTOS_KEY: "crm_documentos_vistos",
  CACHE_HORAS: 24,
  items: [],
  loading: false,
  error: "",
  semAcesso: false,
  q: "",
  inativos: false,
  _carregando: null,

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  cache() {
    try {
      const v = JSON.parse(localStorage.getItem(this.CACHE_KEY) || "{}");
      return v && Array.isArray(v.items) ? v : { at: 0, items: [] };
    } catch (e) {
      return { at: 0, items: [] };
    }
  },

  vistos() {
    try {
      const v = JSON.parse(localStorage.getItem(this.VISTOS_KEY) || "{}");
      return v && typeof v.byId === "object" ? v : { byId: {}, updatedAt: 0 };
    } catch (e) {
      return { byId: {}, updatedAt: 0 };
    }
  },

  /** Documentos que aparecem nos títulos a pagar: base da lista quando o Sienge nega a API de documentos. */
  registrarVistos(lista) {
    const v = this.vistos();
    let mudou = false;
    (lista || []).forEach((d) => {
      const id = String((d && d.id) || "").trim().toUpperCase();
      if (!id) return;
      const nome = String((d && d.nome) || "").trim();
      const atual = v.byId[id];
      if (!atual || (nome && atual.nome !== nome)) {
        v.byId[id] = { nome: nome || (atual && atual.nome) || id };
        mudou = true;
      }
    });
    if (!mudou) return;
    v.updatedAt = Date.now();
    try { localStorage.setItem(this.VISTOS_KEY, JSON.stringify(v)); } catch (e) {}
  },

  listaDosTitulos() {
    return Object.entries(this.vistos().byId)
      .map(([id, d]) => ({ id, nome: (d && d.nome) || id, ativo: true, pagamento: true, cienciaSienge: false, soDosTitulos: true }))
      .sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
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
    if (!forcar && this.semAcesso && Date.now() - (this._negadoEm || 0) < 3600000) {
      this.items = c.items.length ? c.items : this.listaDosTitulos();
      return this.items;
    }
    if (this._carregando) return this._carregando;
    this._carregando = this.buscarNoSienge()
      .then((list) => { this.items = list; this.semAcesso = false; return list; })
      .catch((e) => {
        this.semAcesso = /\b403\b/.test(String((e && e.message) || e));
        if (this.semAcesso) this._negadoEm = Date.now();
        if (c.items.length) {
          this.items = c.items;
          return this.items;
        }
        const dosTitulos = this.listaDosTitulos();
        if (this.semAcesso && dosTitulos.length) {
          this.items = dosTitulos;
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
    const doc = (this.items.length ? this.items : this.cache().items).find((d) => d.id.toUpperCase() === id);
    return !!(doc && doc.cienciaSienge);
  },

  filtrados() {
    const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = fold(this.q).trim();
    return this.items.filter((d) => (this.inativos || d.ativo) && (!q || fold(`${d.id} ${d.nome}`).includes(q)));
  },

  renderTable() {
    const tbody = document.getElementById("dsg-tbody");
    if (!tbody) return;
    const rows = this.filtrados();
    tbody.innerHTML = rows.length ? rows.map((d) => {
      const sienge = d.soDosTitulos
        ? `<span class="dsg-tag">Sem acesso à API</span>`
        : `<span class="dsg-tag${d.cienciaSienge ? " is-on" : ""}">${d.cienciaSienge ? "Exige ciência" : "Não exige"}</span>`;
      const notas = [
        d.ativo ? "" : "Inativo no Sienge",
        d.soDosTitulos || d.pagamento ? "" : "Não usado em contas a pagar"
      ].filter(Boolean).join(" · ");
      return `<tr class="${d.ativo ? "" : "dsg-inativo"}">
        <td class="dsg-cod">${this.esc(d.id)}</td>
        <td class="dsg-nome">${this.esc(d.nome)}${notas ? `<small>${notas}</small>` : ""}</td>
        <td>${sienge}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="3" class="dsg-vazio">${this.loading ? "Carregando…" : this.esc(this.error || "Nenhum documento encontrado.")}</td></tr>`;
  },

  render() {
    const root = document.getElementById("documentos-sienge-root");
    if (!root) return;
    root.innerHTML = `
      <div class="cc-page">
        <div class="cc-toolbar ppcc-toolbar">
          <div class="ppcc-busca">
            <i data-lucide="search" class="ppcc-busca-ico"></i>
            <input type="search" placeholder="Buscar por código ou nome" value="${this.esc(this.q)}" aria-label="Buscar documento"
              oninput="DocumentosSiengeApp.q=this.value;DocumentosSiengeApp.renderTable()">
          </div>
          <div class="cc-toolbar-actions">
            <label class="cc-parceiros">
              <input type="checkbox" ${this.inativos ? "checked" : ""} onchange="DocumentosSiengeApp.inativos=this.checked;DocumentosSiengeApp.renderTable()">
              Mostrar inativos
            </label>
            <button type="button" class="btn btn-primary cc-atualizar" onclick="DocumentosSiengeApp.reload()" ${this.loading ? "disabled" : ""}>
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> ${this.loading ? "Atualizando…" : "Atualizar do Sienge"}
            </button>
          </div>
        </div>
        ${this.semAcesso ? `<div class="dsg-aviso">
          <i data-lucide="shield-alert" style="width:18px;height:18px;flex-shrink:0;"></i>
          <div>
            <b>O Sienge negou acesso à lista de documentos (erro 403).</b> O usuário de API do CRM não tem permissão no recurso
            <b>Documentos</b> (<code>document-identifications</code>). Peça para liberar em Sienge &gt; Integrações &gt; Usuários de API &gt; editar o usuário &gt; recursos permitidos, e depois clique em Atualizar do Sienge.
            ${this.items.length ? `<br>Enquanto isso, a lista abaixo traz os documentos que já apareceram nos títulos do Gerar Pagamento, sem a informação de ciência.` : `<br>Enquanto isso, os documentos aparecem aqui depois que o Gerar Pagamento for aberto uma vez, sem a informação de ciência.`}
          </div>
        </div>` : ""}
        <div class="cc-scroll dsg-scroll">
          <table class="cc-table dsg-table">
            <colgroup><col class="dsg-c-cod"><col><col class="dsg-c-sienge"></colgroup>
            <thead><tr>
              <th>Código</th>
              <th>Documento</th>
              <th>Exige ciência</th>
            </tr></thead>
            <tbody id="dsg-tbody"></tbody>
          </table>
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
      this.error = this.semAcesso
        ? "Sem permissão na API de documentos do Sienge e nenhum documento visto nos títulos ainda."
        : "Não foi possível carregar os documentos do Sienge: " + (e.message || e);
    }
    this.loading = false;
    this.render();
  },

  init() {
    try { localStorage.removeItem("crm_documentos_ciencia"); } catch (e) {}
    if (this.items.length) this.render();
    this.reload(!this.cache().items.length);
  }
};

window.DocumentosSiengeApp = DocumentosSiengeApp;
window.documentoExigeCiencia = (docId) => DocumentosSiengeApp.exigeCiencia(docId);

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "documentos-sienge") DocumentosSiengeApp.init();
});
