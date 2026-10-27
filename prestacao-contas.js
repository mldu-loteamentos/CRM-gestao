// Prestação de Contas — DFC Padrão (cadastro de visões) × caixa/banco Sienge × parametrização de parceiro

const PrestacaoContasApp = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() === 0 ? 12 : new Date().getMonth(),
  companyId: "",
  companyIds: [],
  empOpen: false,
  empQuery: "",
  costCenterIds: [],
  partnershipId: "",
  ccSearch: "",
  loading: false,
  loadMsg: "Carregando títulos…",
  loadPct: 8,
  error: "",
  movements: [],
  lines: [],
  totals: { receitas: 0, custos: 0, despesas: 0, custosDespesas: 0, gco: 0 },
  expanded: new Set(),
  _expandInited: false,
  selectedAccount: null,
  accountMovements: [],
  accountIndex: {},
  unmatchedInfo: { total: 0, samples: [] },
  categories: [],
  aba: "obra",
  conferencias: null,
  confFiltro: "",
  confAberta: "",
  gruposAbertos: new Set(),
  guias: {},
  rastreio: null,
  GUIAS_CACHE: "crm_pcx_guias_v2",
  dash: null,
  dashGen: 0,
  dashSort: { key: "", dir: 1 },
  retencaoMista: null,
  saldoCc: null,

  competenciaPadrao() {
    const now = new Date();
    if (now.getMonth() === 0) return { year: now.getFullYear() - 1, month: 12 };
    return { year: now.getFullYear(), month: now.getMonth() };
  },

  init() {
    const comp = this.competenciaPadrao();
    this.year = comp.year;
    this.month = comp.month;
    this.companyId = "";
    this.companyIds = [];
    this.costCenterIds = [];
    this.partnershipId = "";
    this.ccSearch = "";
    this.empOpen = false;
    this.empQuery = "";
    this.ensureDfcReady();
    this.ensureCategories();
    if (typeof ParametrizacaoParceiroApp !== "undefined" && (!ParametrizacaoParceiroApp.items || !ParametrizacaoParceiroApp.items.length)) {
      ParametrizacaoParceiroApp.loadItems().then(() => {
        this.restringirEmpresas();
        if (this.movements.length) this.conferencias = this.montarConferencia();
        this.render();
      }).catch(() => {});
    } else {
      this.restringirEmpresas();
    }
    this.render();
  },

  ensureDfcReady() {
    if (typeof PlanoFinanceiroApp === "undefined") return;
    if (!Array.isArray(PlanoFinanceiroApp.visoes) || !PlanoFinanceiroApp.visoes.length) {
      try {
        PlanoFinanceiroApp.visoes = JSON.parse(localStorage.getItem(PlanoFinanceiroApp.STORAGE_KEY || "crm_plano_visoes_v2") || "[]") || [];
      } catch (e) {
        PlanoFinanceiroApp.visoes = [];
      }
    }
    if (typeof PlanoFinanceiroApp.ensureDfcDefault === "function") PlanoFinanceiroApp.ensureDfcDefault();
  },

  async ensureCategories() {
    if (this.categories.length) return;
    try {
      if (typeof PlanoFinanceiroApp !== "undefined" && PlanoFinanceiroApp.categories && PlanoFinanceiroApp.categories.length) {
        this.categories = PlanoFinanceiroApp.categories;
        return;
      }
      if (window.SiengeApiService) {
        const cats = await SiengeApiService.getPaymentCategories();
        this.categories = (cats || []).map(c => ({ ...c, name: c.name || c.description || "" }));
      }
    } catch (e) {
      console.warn("[Prestação de Contas] Plano financeiro:", e);
    }
  },

  /** Mesma visão DFC Padrão do Fluxo de Caixa / cadastro de visões. */
  visao() {
    if (typeof FluxoCaixaApp !== "undefined" && typeof FluxoCaixaApp.visao === "function") {
      return FluxoCaixaApp.visao();
    }
    this.ensureDfcReady();
    if (typeof PlanoFinanceiroApp !== "undefined") {
      const dfc = (PlanoFinanceiroApp.visoes || []).find(v => v.id === "dfc_default");
      if (dfc) return dfc;
    }
    let visoes = [];
    try { visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]") || []; } catch (e) { visoes = []; }
    return visoes.find(v => v.id === "dfc_default") || visoes[0] || { groups: [] };
  },

  fc() {
    return typeof FluxoCaixaApp !== "undefined" ? FluxoCaixaApp : null;
  },

  normAccountKey(id) {
    const fc = this.fc();
    if (fc && fc.normAccountKey) return fc.normAccountKey(id);
    return String(id || "").replace(/\D/g, "");
  },

  formatAccountCode(id) {
    const fc = this.fc();
    if (fc && fc.formatAccountCode) {
      const prev = fc.categories;
      fc.categories = this.categories;
      const out = fc.formatAccountCode(id);
      fc.categories = prev;
      return out;
    }
    const raw = String(id || "").trim();
    if (raw.includes(".")) return raw;
    return raw;
  },

  catName(id) {
    const c = this.categories.find(x => String(x.id) === String(id));
    return (c && (c.name || c.description)) || "";
  },

  activePartnership() {
    if (!this.partnershipId || typeof ParametrizacaoParceiroApp === "undefined") return null;
    const p = (ParametrizacaoParceiroApp.items || []).find(x => x.id === this.partnershipId);
    return p ? ParametrizacaoParceiroApp.normalizeItem(p) : null;
  },

  applyPartnership(id) {
    this.partnershipId = id || "";
    if (!id || typeof ParametrizacaoParceiroApp === "undefined") {
      this.render();
      return;
    }
    const p = (ParametrizacaoParceiroApp.items || []).find(x => x.id === id);
    if (!p) { this.render(); return; }
    const part = ParametrizacaoParceiroApp.normalizeItem(p);
    const emp = this.empresaDaParceria(part);
    this.companyId = emp || String(part.companyId || "");
    this.companyIds = this.companyId ? [this.companyId] : [];
    this.empOpen = false;
    this.retencaoMista = null;
    const obras = Array.isArray(part.obras) && part.obras.length ? part.obras : [];
    const ids = [];
    obras.forEach((o) => {
      (o.costCenters || []).forEach((c) => {
        if (!c || !c.inAccount || !c.id) return;
        const id = String(c.id).replace(/\D/g, "");
        if (!id) return;
        ids.push(id);
        if (/01$/.test(id)) ids.push(id.slice(0, -2) + "00");
      });
    });
    this.costCenterIds = [...new Set(ids)].sort((a, b) => Number(a) - Number(b));
    this.render();
  },

  empresaDaParceria(part) {
    if (!part || typeof ParametrizacaoParceiroApp === "undefined") return "";
    const p = ParametrizacaoParceiroApp.normalizeItem ? ParametrizacaoParceiroApp.normalizeItem(part) : part;
    const empresas = new Set();
    (p.obras || []).forEach((o) => {
      (o.costCenters || []).forEach((c) => {
        const cat = ParametrizacaoParceiroApp.catalogoCentros && ParametrizacaoParceiroApp.catalogoCentros();
        const cc = cat && cat.get(String(c.id).replace(/\D/g, ""));
        const emp = ParametrizacaoParceiroApp.empresaDoCentro ? ParametrizacaoParceiroApp.empresaDoCentro(cc) : "";
        if (emp) empresas.add(emp);
      });
    });
    if (empresas.size === 1) return [...empresas][0];
    if (p.companyId) return String(p.companyId);
    return [...empresas][0] || "";
  },

  empresasCatalogo() {
    return (window.AppState && AppState.companies) || [];
  },

  temParceiroOuSocio(p) {
    if (!p) return false;
    if (String(p.partnerName || "").trim()) return true;
    if (p.creditor && (p.creditor.id || String(p.creditor.name || "").trim())) return true;
    return (p.socios || []).some((s) => s && (s.id || String(s.name || "").trim()));
  },

  empresasComCadastro() {
    const app = window.ParametrizacaoParceiroApp;
    const items = (app && app.items) || [];
    const ids = new Set();
    const nomes = {};
    items.forEach((raw) => {
      const p = app && app.normalizeItem ? app.normalizeItem(raw) : raw;
      if (!this.temParceiroOuSocio(p)) return;
      [String(p.companyId || ""), String(this.empresaDaParceria(p) || "")].forEach((emp) => {
        if (!emp) return;
        ids.add(emp);
        if (p.companyName && !nomes[emp]) nomes[emp] = p.companyName;
      });
    });
    return { ids, nomes };
  },

  restringirEmpresas() {
    const ok = this.empresasComCadastro().ids;
    const ids = (this.companyIds || []).map(String).filter((id) => ok.has(id));
    this.companyIds = ids;
    this.companyId = ids.length === 1 ? ids[0] : "";
    const part = this.activePartnership();
    if (part && !ok.has(String(this.empresaDaParceria(part) || part.companyId || ""))) {
      this.partnershipId = "";
      this.costCenterIds = [];
    }
  },

  empresasPermitidas() {
    const todas = this.empresasCatalogo();
    const cad = this.empresasComCadastro();
    const base = [];
    const visto = new Set();
    todas.forEach((c) => {
      const id = String(c.id);
      if (!cad.ids.has(id) || visto.has(id)) return;
      visto.add(id);
      base.push(c);
    });
    cad.ids.forEach((id) => {
      if (visto.has(id)) return;
      visto.add(id);
      base.push({ id, name: cad.nomes[id] || ("Empresa " + id) });
    });
    base.sort((a, b) => Number(a.id) - Number(b.id) || String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
    const part = this.activePartnership();
    if (!part) return base;
    const emp = String(this.empresaDaParceria(part) || part.companyId || "");
    const daObra = base.filter((c) => String(c.id) === emp);
    if (daObra.length) return daObra;
    if (!emp) return [];
    return [{ id: emp, name: part.companyName || cad.nomes[emp] || ("Empresa " + emp) }];
  },

  parceriasVisiveis() {
    const todas = (typeof ParametrizacaoParceiroApp !== "undefined" && ParametrizacaoParceiroApp.items) || [];
    const ids = new Set((this.companyIds || []).map(String).filter(Boolean));
    if (!ids.size) return [];
    return todas.filter((p) => ids.has(this.empresaDaParceria(p)));
  },

  sincronizarEmpresa() {
    const ids = (this.companyIds || []).map(String).filter(Boolean);
    this.companyId = ids.length === 1 ? ids[0] : "";
    const part = this.activePartnership();
    if (part && this.empresaDaParceria(part) !== this.companyId) {
      this.partnershipId = "";
      this.costCenterIds = [];
    }
  },

  toggleEmpresa(id, on) {
    const permitidas = new Set(this.empresasPermitidas().map((c) => String(c.id)));
    const item = String(id);
    if (!permitidas.has(item)) return;
    if (this.activePartnership()) {
      const emp = this.empresaDaParceria(this.activePartnership());
      this.companyIds = emp ? [emp] : [];
      this.sincronizarEmpresa();
      this.render();
      return;
    }
    const set = new Set((this.companyIds || []).map(String));
    if (on) set.add(item);
    else set.delete(item);
    this.companyIds = this.empresasPermitidas().map((c) => String(c.id)).filter((x) => set.has(x));
    this.sincronizarEmpresa();
    this.render();
  },

  marcarEmpresas() {
    const part = this.activePartnership();
    if (part) {
      const emp = this.empresaDaParceria(part);
      this.companyIds = emp ? [emp] : [];
    } else {
      this.companyIds = this.empresasPermitidas().map((c) => String(c.id));
    }
    this.sincronizarEmpresa();
    this.render();
  },

  desmarcarEmpresas() {
    const part = this.activePartnership();
    if (part) {
      const emp = this.empresaDaParceria(part);
      this.companyIds = emp ? [emp] : [];
      this.sincronizarEmpresa();
      this.render();
      return;
    }
    this.companyIds = [];
    this.companyId = "";
    this.partnershipId = "";
    this.costCenterIds = [];
    this.render();
  },

  pintarEmpresas() {
    const list = document.getElementById("pc-emp-list");
    if (!list || !window.MlEmpresaFilter) return;
    list.innerHTML = MlEmpresaFilter.listHtml({
      id: "pc-emp",
      items: this.empresasFiltroItens(),
      selectedIds: this.companyIds || [],
      query: this.empQuery || ""
    });
  },

  empresasFiltroItens() {
    return this.empresasPermitidas().map((c) => ({
      id: String(c.id),
      label: String(c.id) + " - " + String(c.name || c.tradeName || "").toUpperCase()
    }));
  },

  empresaFiltroHtml() {
    if (!window.MlEmpresaFilter) {
      const companies = this.empresasPermitidas();
      return `<label class="pcx-field pcx-field-emp">
        <span class="ml-emp-filter-label">Empresa</span>
        <select class="pcx-input" onchange="PrestacaoContasApp.toggleEmpresa(this.value, true)">
          ${companies.map((c) => `<option value="${this.esc(c.id)}" ${String(c.id) === String(this.companyId) ? "selected" : ""}>${this.esc(c.id)} - ${this.esc(c.name)}</option>`).join("")}
        </select>
      </label>`;
    }
    return `<div class="pcx-field pcx-field-emp">${MlEmpresaFilter.html({
      id: "pc-emp",
      label: "Empresa",
      items: this.empresasFiltroItens(),
      selectedIds: this.companyIds || [],
      open: !!this.empOpen,
      query: this.empQuery || "",
      emptyMeansAll: false
    })}</div>`;
  },

  ligarEmpresaFiltro() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    MlEmpresaFilter.bind("pc-emp", {
      toggleOpen() {
        self.empOpen = !self.empOpen;
        self.render();
      },
      close() {
        self.empOpen = false;
        self.render();
      },
      setQuery(q) {
        self.empQuery = q;
        self.pintarEmpresas();
      },
      toggleId(id, on) { self.toggleEmpresa(id, on); },
      selectAll() { self.marcarEmpresas(); },
      selectNone() { self.desmarcarEmpresas(); }
    });
  },

  periodBounds() {
    const y = Number(this.year);
    const m = Number(this.month);
    const last = new Date(y, m, 0).getDate();
    const pad = n => String(n).padStart(2, "0");
    return {
      start: `${y}-${pad(m)}-01`,
      end: `${y}-${pad(m)}-${pad(last)}`,
      label: new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    };
  },

  fmt(val) {
    return (Number(val) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  costCenters() {
    const all = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) ||
      (window.MOCK_DATA && window.MOCK_DATA.COST_CENTERS) || [];
    const escolhidas = new Set((this.companyIds || []).map(String).filter(Boolean));
    return all.filter(cc => {
      const emp = String(cc.companyId == null ? "" : cc.companyId);
      if (!escolhidas.size) return false;
      return escolhidas.has(emp) || cc.companyId == null;
    });
  },

  ccSuggestionsHtml() {
    const q = (this.ccSearch || "").toLowerCase().trim();
    if (!q) return "";
    const suggestions = this.costCenters()
      .filter(cc => String(cc.id).includes(q) || String(cc.name || "").toLowerCase().includes(q))
      .slice(0, 12);
    if (!suggestions.length) return "";
    return `<div style="margin-top:6px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;max-width:480px;overflow:hidden;">
      ${suggestions.map(cc => `<button onclick="PrestacaoContasApp.addCostCenter('${cc.id}')"
        style="display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:#fff;cursor:pointer;font-size:0.8rem;border-bottom:1px solid #f1f5f9;">
        <strong>${cc.id}</strong> — ${cc.name || ""}
      </button>`).join("")}
    </div>`;
  },

  onCcSearch(val) {
    this.ccSearch = val;
    const box = document.getElementById("pc-cc-sugg");
    if (box) box.innerHTML = this.ccSuggestionsHtml();
  },

  addCostCenter(id) {
    const cid = String(id || "").trim();
    if (!cid || this.costCenterIds.includes(cid)) return;
    this.costCenterIds.push(cid);
    this.ccSearch = "";
    this.render();
  },

  removeCostCenter(id) {
    this.costCenterIds = this.costCenterIds.filter(x => String(x) !== String(id));
    this.render();
  },

  setAba(id) {
    const ok = { obra: 1, repasse: 1, vendas: 1, estoque: 1, carteira: 1, inad: 1 };
    this.aba = ok[id] ? id : "obra";
    this.confFiltro = "";
    this.confAberta = "";
    this.gruposAbertos = new Set();
    this.dashSort = { key: "", dir: 1 };
    this.render();
    if (this.loading) return;
    if (this.aba === "vendas" || this.aba === "estoque" || this.aba === "carteira" || this.aba === "inad") {
      this.carregarPainel(this.aba);
    }
  },

  ordenarDash(key) {
    if (this.dashSort.key === key) this.dashSort.dir *= -1;
    else this.dashSort = { key, dir: key === "valor" || key.endsWith(".valor") || key.endsWith(".n") ? -1 : 1 };
    this.render();
  },

  setConfFiltro(status) {
    this.confFiltro = this.confFiltro === status ? "" : status;
    this.confAberta = "";
    this.gruposAbertos = new Set();
    this.render();
  },

  toggleGrupo(id) {
    const k = String(id || "");
    if (this.gruposAbertos.has(k)) this.gruposAbertos.delete(k);
    else this.gruposAbertos.add(k);
    this.render();
  },

  toggleConf(key) {
    this.confAberta = this.confAberta === key ? "" : key;
    this.render();
  },

  setCompetencia(v) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(v || ""));
    if (!m) return;
    this.year = Number(m[1]);
    this.month = Number(m[2]);
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  SOLTOS: { "14703": 1, "14704": 1, "14304": 1, "14305": 1 },

  obraDe(id) {
    const d = String(id || "").replace(/\D/g, "");
    return d.length >= 5 ? d.slice(0, -2) : d;
  },

  /** Centros irmãos (12900 e 12901) ficam na mesma obra. 14304, 14305, 14703 e 14704 seguem separados. */
  chaveObra(id) {
    const s = String(id || "").replace(/\D/g, "");
    if (this.SOLTOS[s]) return s;
    if (s.length >= 5) return s.slice(0, 3) + "00";
    return s;
  },

  rotuloObra(id) {
    const bruto = String(this.ccNome(id) || "").trim().replace(/\s*-\s*PARCERIA\b.*$/i, "").trim();
    if (!bruto) return String(id);
    const semId = bruto.replace(new RegExp("^" + id + "\\s*[-–]\\s*"), "").trim();
    return id + " - " + (semId || bruto);
  },

  noDfc(codigo, nome) {
    const plano = typeof PlanoFinanceiroApp !== "undefined" ? PlanoFinanceiroApp : null;
    if (!plano) return "";
    const cod = this.formatAccountCode(codigo) || String(codigo || "");
    let gid = "";
    try {
      if (typeof plano.lookupDfcByCode === "function") gid = plano.lookupDfcByCode(cod) || "";
    } catch (e) { gid = ""; }
    if (!gid && typeof plano.suggestGroup === "function") {
      try { gid = plano.suggestGroup({ id: cod, name: nome || "" }) || ""; } catch (e) { gid = ""; }
    }
    return String(gid || "");
  },

  classeConta(conta, nome, sinal) {
    const cod = String(this.formatAccountCode(conta) || conta || "").replace(/\s/g, "");
    const gid = this.noDfc(cod, nome);
    const sob = (raiz) => gid === raiz || gid.indexOf(raiz + "_") === 0;
    if (sob("g_04_01") || /REPASSE|DISTRIBUICAO DE LUCRO|DISTRIBUIÇÃO DE LUCRO/i.test(nome || "")) return "repasse";
    if (sob("g_01") || cod === "2.05.01.03" || /DESCONTO DE JUROS CONTRAT/i.test(nome || "")) return "receita";
    return this.naturezaConta(conta, sinal);
  },

  ccNome(id) {
    const all = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    const cc = all.find(c => String(c.id) === String(id));
    return (cc && cc.name) || "";
  },

  fmtPct(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  },

  /** Distrato e distrato/permuta: o nome do documento ou do plano financeiro traz "distrato". */
  ehDistratoMov(mov) {
    const cats = (mov && mov.financialCategories) || [];
    const txt = [mov && mov.documentIdentificationId, mov && mov.documentIdentificationName, mov && mov.documentNumber]
      .concat(cats.map((c) => (c && (c.financialCategoryName || c.financialCategoryId)) || ""))
      .join(" ");
    return /distrat/i.test(txt);
  },

  emissaoDireta(mov) {
    const s = String((mov && (mov.issueDate || mov.billDate || mov.documentIssueDate)) || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  },

  emissaoDoMov(mov) {
    return this.emissaoDireta(mov) || (this.emissaoDistrato && this.emissaoDistrato[String((mov && mov.billId) || "")]) || "";
  },

  /** Emissão dos títulos de distrato que o extrato não traz. O corte é 01/01/2026 pela emissão, não pelo pagamento. */
  async carregarEmissoesDistrato() {
    this.emissaoDistrato = this.emissaoDistrato || {};
    if (typeof window.siengeFetchWithRetry !== "function") return;
    const ids = [...new Set((this.movements || []).filter((m) => this.ehDistratoMov(m) && m.billId && !this.emissaoDireta(m)).map((m) => String(m.billId)))]
      .filter((id) => !Object.prototype.hasOwnProperty.call(this.emissaoDistrato, id));
    await this.mapLimit(ids, 2, async (id) => {
      try {
        const b = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(id), 2);
        this.emissaoDistrato[id] = String((b && b.issueDate) || "").slice(0, 10);
      } catch (e) {
        this.emissaoDistrato[id] = "";
      }
    });
  },

  /**
   * Distrato emitido a partir de 01/01/2026 sai 100% no CC da obra.
   * A prestação mostra o rateio padrão (parte do parceiro) para descontar dos recebimentos.
   * Devolve as linhas virtuais ou null quando a regra não se aplica.
   */
  rateioDistratoNovo(g) {
    const emissao = g.emissao || "";
    if (!emissao || emissao < "2026-01-01") return null;
    const padrao = this.padraoObra(g.obra);
    if (!padrao) return null;
    const baseId = String(g.obra) + "00";
    const ids = Object.keys(g.porCc || {});
    if (ids.length !== 1 || ids[0] !== baseId || padrao[baseId] == null) return null;
    const parceiros = Object.keys(padrao).filter((id) => id !== baseId);
    if (!parceiros.length) return null;
    const total = g.porCc[baseId];
    const linhas = Object.keys(padrao).map((id) => ({
      id,
      nome: this.ccNome(id),
      valor: id === baseId ? total : 0,
      atual: id === baseId ? 100 : 0,
      esperado: padrao[id]
    })).sort((a, b) => Number(a.id) - Number(b.id));
    return {
      linhas,
      nota: `Distrato emitido em ${this.dataBr(emissao)}: lançado 100% no ${baseId}. A prestação de contas aplica o rateio padrão e desconta ${parceiros.map((id) => this.fmtPct(padrao[id]) + " no " + id).join(", ")} dos valores do parceiro.`
    };
  },

  /** Percentual cadastrado nos centros da obra: Moura Leite no CC da obra e terrenista no do parceiro. */
  padraoObra(obra) {
    const PP = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : null;
    if (!PP || typeof PP.centrosDaObra !== "function" || typeof PP.customCc !== "function") return null;
    const lista = PP.centrosDaObra(obra);
    if (!lista.length) return null;
    const ehParc = (cc) => {
      const terr = Number(PP.customCc(cc.id).perc_terrenista) || 0;
      return (typeof PP.ehCcParceiro === "function" && PP.ehCcParceiro(cc)) || (terr > 0 && !String(cc.id).endsWith("00"));
    };
    const parceiros = lista.filter(ehParc);
    const base = lista.find(cc => String(cc.id).replace(/\D/g, "") === String(obra) + "00" && !ehParc(cc))
      || lista.find(cc => !parceiros.some(p => String(p.id) === String(cc.id)));
    const map = {};
    let terrSum = 0;
    parceiros.forEach(cc => {
      const t = Number(PP.customCc(cc.id).perc_terrenista) || 0;
      if (t > 0 && t <= 100) {
        map[String(cc.id)] = t;
        terrSum += t;
      }
    });
    let ml = base ? Number(PP.customCc(base.id).perc_ml) || 0 : 0;
    if (!(ml > 0) && terrSum > 0 && terrSum < 100) ml = Number((100 - terrSum).toFixed(2));
    if (base && ml > 0 && ml <= 100) map[String(base.id)] = ml;
    return Object.keys(map).length ? map : null;
  },

  /** O extrato do Sienge pode trazer o valor sempre positivo, com crédito/débito no tipo da operação. */
  sinalMov(m) {
    const raw = Number(m.bankMovementAmount) || 0;
    if (raw < 0) return -1;
    const norm = (v) => (v == null || typeof v === "object") ? "" : String(v).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const tipo = norm(m.bankMovementOperationType || m.operationType);
    if (/^(S|D)$/.test(tipo) || /DEBIT|SAIDA/.test(tipo)) return -1;
    if (/^(E|C)$/.test(tipo) || /CREDIT|ENTRADA/.test(tipo)) return 1;
    const op = norm(m.bankMovementOperationName);
    if (/PAGAMENTO|PAGTO|DEBITO|TARIFA|SAIDA/.test(op)) return -1;
    if (/RECEBIMENTO|CREDITO|ENTRADA/.test(op)) return 1;
    if (norm(m.creditorName) && !norm(m.clientName)) return -1;
    return 1;
  },

  /** Contas 1.xxx são recebimento e 2.xxx pagamento, como no Rateio DFC das Configurações. */
  naturezaConta(conta, sinal) {
    const d = String(conta || "").replace(/\D/g, "").charAt(0);
    if (d === "1") return "receita";
    if (d === "2") return "despesa";
    return sinal < 0 ? "despesa" : "receita";
  },

  /** Parceria das Configurações que tem este centro de custo (a selecionada vale primeiro). */
  parceriaDoCc(cc, cache) {
    const PP = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : null;
    if (!PP || typeof PP.obraForCostCenter !== "function") return null;
    const id = String(cc);
    if (cache && Object.prototype.hasOwnProperty.call(cache, id)) return cache[id];
    let hit = null;
    const ativa = this.activePartnership();
    if (ativa) {
      const obra = PP.obraForCostCenter(ativa, id);
      if (obra) hit = { part: ativa, obra };
    }
    if (!hit) {
      for (const raw of (PP.items || [])) {
        const part = PP.normalizeItem(raw);
        const obra = part && PP.obraForCostCenter(part, id);
        if (obra) { hit = { part, obra }; break; }
      }
    }
    if (cache) cache[id] = hit;
    return hit;
  },

  /** A conta do plano financeiro está amarrada nas Configurações? Sem amarração não há rateio a conferir. */
  contaAmarrada(conta, cc, ctx) {
    const PP = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : null;
    if (!PP) return { ok: true, motivo: "" };
    if (ctx.temVisao && !PP.accountParentIdLoose(conta)) {
      return { ok: false, motivo: "Conta fora da visão DFC" };
    }
    const hit = this.parceriaDoCc(cc, ctx.cache);
    if (hit && !PP.accountEntersPartnership(hit.part, hit.obra, conta)) {
      return { ok: false, motivo: `Conta fora da parceria ${hit.part.partnerName || ""}`.trim() };
    }
    return { ok: true, motivo: "" };
  },

  /** Pagamento de guia de impostos retidos de terceiros (ISS, IR, PCC, INSS). */
  ehMovGuia(mov) {
    if (!mov || !mov.billId) return false;
    const doc = String(mov.documentIdentificationId || "").trim().toUpperCase();
    if (["GUIA", "GPS", "DARF", "DAM"].includes(doc)) return true;
    return (mov.financialCategories || []).some(c =>
      String(c.financialCategoryId || "").replace(/\D/g, "").startsWith("20903")
      || /RECOLHIMENTO DE .*TERCEIROS/i.test(String(c.financialCategoryName || "")));
  },

  /** Notas de origem do imposto pago na guia, no centro de custo informado. */
  origemGuia(mov, cc) {
    if (!this.ehMovGuia(mov)) return null;
    const g = this.guias && this.guias[String(mov.billId)];
    if (!g || !g.itens) return null;
    const itens = g.itens.filter(i => String(i.cc) === String(cc));
    const soma = itens.reduce((s, i) => s + i.valor, 0);
    return soma > 0.004 ? { guia: g, itens, soma } : null;
  },

  lerCacheGuias() {
    try { return JSON.parse(localStorage.getItem(this.GUIAS_CACHE) || "{}") || {}; } catch (e) { return {}; }
  },

  gravarCacheGuias(mapa) {
    const ids = Object.keys(mapa).sort((a, b) => (mapa[b].em || 0) - (mapa[a].em || 0)).slice(0, 300);
    const out = {};
    ids.forEach(k => { out[k] = mapa[k]; });
    try { localStorage.setItem(this.GUIAS_CACHE, JSON.stringify(out)); } catch (e) {}
  },

  async mapLimit(itens, limite, fn) {
    if (typeof window.siengeMapLimit === "function") return window.siengeMapLimit(itens, limite, fn);
    const out = new Array(itens.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, async () => {
      while (i < itens.length) { const k = i++; out[k] = await fn(itens[k], k); }
    }));
    return out;
  },

  /** Valor do pagamento por centro de custo, como o movimento foi rateado no Sienge. */
  valorPorCc(mov) {
    const fcApp = this.fc();
    const cats = Array.isArray(mov.financialCategories) ? mov.financialCategories : [];
    const entries = (fcApp && typeof fcApp.categoryShareEntries === "function")
      ? fcApp.categoryShareEntries(cats)
      : cats.map(fc => ({ fc, share: 1 / cats.length }));
    const out = {};
    entries.forEach(({ fc, share }) => {
      if (!fc || fc.costCenterId == null) return;
      const cc = String(fc.costCenterId);
      out[cc] = (out[cc] || 0) + Math.abs(Number(mov.bankMovementAmount) || 0) * (Number(share) || 0);
    });
    return out;
  },

  /**
   * Cada imposto retido numa nota aponta a guia em que foi recolhido (taxGuideBill em /bills/{id}/taxes).
   * Quando a nota foi rateada entre centros com uma guia por centro, o Sienge repete o imposto cheio em cada guia:
   * nesse caso vale só a parte do centro da guia.
   */
  async rastrearGuias() {
    if (!window.siengeFetchWithRetry) return;
    const wanted = new Set((this.costCenterIds || []).map(String));
    const movs = (this.movements || []).filter(m => this.ehMovGuia(m)
      && (m.financialCategories || []).some(c => wanted.has(String(c.costCenterId))));
    if (!movs.length) return;
    const cache = this.lerCacheGuias();
    const guias = {};
    const pendentes = [];
    [...new Set(movs.map(m => String(m.billId)))].forEach(id => {
      const c = cache[id];
      const mov = movs.find(m => String(m.billId) === id);
      const precisa = Object.keys(this.valorPorCc(mov)).filter(cc => wanted.has(cc));
      if (c && c.itens && precisa.every(cc => (c.ccsAlvo || []).includes(cc))) guias[id] = c;
      else pendentes.push(id);
    });
    this.guias = Object.assign({}, this.guias, guias);
    if (!pendentes.length) return;

    this.rastreio = { msg: `Rastreando a origem de ${pendentes.length} guia(s) de impostos…` };
    this.render();
    const lista = pendentes;
    const cabecalhos = await this.mapLimit(lista, 3, async (id) => {
      try { return await window.siengeFetchWithRetry(`/bills/${encodeURIComponent(id)}`, 3); } catch (e) { return null; }
    });
    const novas = {};
    cabecalhos.forEach((b, i) => {
      if (!b || String(b.originId || "").toUpperCase() !== "GI") return;
      const mov = movs.find(m => String(m.billId) === lista[i]);
      novas[lista[i]] = {
        id: lista[i],
        doc: [String(b.documentIdentificationId || "").trim(), String(b.documentNumber || "").trim()].filter(Boolean).join(" "),
        emissao: String(b.issueDate || "").slice(0, 10),
        total: Number(b.totalInvoiceAmount) || 0,
        porCcPago: mov ? this.valorPorCc(mov) : {},
        itens: []
      };
    });
    const ids = Object.keys(novas);
    if (!ids.length) { this.rastreio = null; return; }

    ids.forEach(id => { novas[id].ccsAlvo = Object.keys(novas[id].porCcPago).filter(cc => wanted.has(cc)); });
    const ccs = [...new Set(ids.flatMap(id => novas[id].ccsAlvo))];
    if (!ccs.length) { this.rastreio = null; return; }
    const emissoes = ids.map(id => novas[id].emissao).filter(Boolean).sort();
    const fim = emissoes[emissoes.length - 1] || this.periodBounds().end;
    const ini = new Date(Number(emissoes[0].slice(0, 4)), Number(emissoes[0].slice(5, 7)) - 5, 1);
    const pad = n => String(n).padStart(2, "0");
    const inicio = `${ini.getFullYear()}-${pad(ini.getMonth() + 1)}-01`;
    const url = `/bulk-data/v1/outcome?startDate=${inicio}&endDate=${fim}&selectionType=I&correctionIndexerId=0&correctionDate=2023-01-01`
      + `&companyId=${encodeURIComponent(this.companyId)}&costCentersId=${ccs.join(",")}`;
    const res = await window.siengeFetchWithRetry(url, 4);
    const linhas = (res && (res.data || res)) || [];
    const notas = new Map();
    (Array.isArray(linhas) ? linhas : []).forEach(b => {
      if (!b || b.billId == null || notas.has(String(b.billId))) return;
      if (!(Number(b.taxAmount) > 0.004)) return;
      if (String(b.originId || "").toUpperCase() === "GI") return;
      notas.set(String(b.billId), {
        doc: [String(b.documentIdentificationId || "").trim(), String(b.documentNumber || "").trim()].filter(Boolean).join("/"),
        credor: String(b.creditorName || "").trim(),
        emissao: String(b.issueDate || "").slice(0, 10),
        cats: (b.paymentsCategories || []).map(c => ({
          cc: String(c.costCenterId),
          conta: String(c.financialCategoryId || "").trim(),
          nome: c.financialCategoryName || this.catName(c.financialCategoryId) || "",
          rate: Number(c.financialCategoryRate) || 0
        }))
      });
    });
    const candidatas = [...notas.keys()];
    let feitas = 0;
    let falhou = false;
    this.rastreio = { msg: `Rastreando a origem das guias: lendo os impostos de ${candidatas.length} nota(s)…` };
    this.render();
    const impostos = await this.mapLimit(candidatas, 4, async (billId) => {
      let r = null;
      try {
        r = await window.siengeFetchWithRetry(`/bills/${encodeURIComponent(billId)}/taxes?limit=100`, 5);
      } catch (e) {
        if (!(Number(e && e.status) === 404 || /\b404\b/.test(String(e && e.message || "")))) falhou = true;
        r = null;
      }
      feitas++;
      if (feitas % 10 === 0) {
        this.rastreio = { msg: "Rastreando a origem das guias…" };
        const el = document.getElementById("pc-rastreio");
        if (el) el.textContent = this.rastreio.msg;
      }
      return ((r && (r.results || r.data)) || []).filter(t => t && t.taxGuideBill != null);
    });
    candidatas.forEach((billId, i) => {
      const nota = notas.get(billId);
      const taxas = impostos[i] || [];
      taxas.forEach(t => {
        const g = novas[String(t.taxGuideBill)];
        if (!g) return;
        const valor = Number(t.amount) || 0;
        if (!(valor > 0.004)) return;
        const repetido = taxas.filter(x => x.taxId === t.taxId && Math.abs((Number(x.amount) || 0) - valor) < 0.005
          && String(x.taxGuideBill) !== String(t.taxGuideBill)).length > 0;
        const ccsGuia = new Set(g.ccsAlvo);
        nota.cats.filter(c => ccsGuia.has(c.cc)).forEach(c => {
          const parte = valor * c.rate / 100;
          if (!(parte > 0.004)) return;
          g.itens.push({
            billId, doc: nota.doc, credor: nota.credor, emissao: nota.emissao, imposto: String(t.taxId || "").toUpperCase(),
            cc: c.cc, conta: c.conta, nome: c.nome, valor: parte, repetido
          });
        });
      });
    });
    const agora = Date.now();
    ids.forEach(id => {
      const g = novas[id];
      g.em = agora;
      g.somaOrigens = g.itens.reduce((s, it) => s + it.valor, 0);
      g.pagoAlvo = g.ccsAlvo.reduce((s, cc) => s + (g.porCcPago[cc] || 0), 0);
      g.fechou = Math.abs(g.somaOrigens - g.pagoAlvo) <= 0.05;
      if (g.itens.length && !falhou) cache[id] = g;
    });
    this.gravarCacheGuias(cache);
    this.guias = Object.assign({}, this.guias, novas);
    this.rastreio = null;
  },

  montarConferencia() {
    const vazio = { receitas: [], despesas: [], repasses: [] };
    const wanted = new Set((this.costCenterIds || []).map(String));
    if (!wanted.size) return vazio;
    const fcApp = this.fc();
    const PP = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : null;
    const temVisao = !!(PP && typeof PP.accountParentIdLoose === "function" && typeof PP.dfcGroups === "function"
      && (PP.dfcGroups() || []).some(g => (g.accounts || []).length));
    const ctx = { temVisao, cache: {} };
    const txt = (v) => (v == null || typeof v === "object") ? "" : String(v).trim();
    const receitas = [];
    const despesas = [];
    const repasses = [];
    (this.movements || []).forEach((mov, idx) => {
      const amount = Number(mov.bankMovementAmount) || 0;
      if (!amount) return;
      const cats = Array.isArray(mov.financialCategories) ? mov.financialCategories : [];
      if (!cats.length) return;
      const entries = (fcApp && typeof fcApp.categoryShareEntries === "function")
        ? fcApp.categoryShareEntries(cats)
        : cats.map(fc => ({ fc, share: 1 / cats.length }));
      const sinal = this.sinalMov(mov);
      const grupos = {};
      entries.forEach(({ fc, share }) => {
        if (!fc || fc.costCenterId == null || String(fc.costCenterId) === "") return;
        const cc = String(fc.costCenterId);
        const obra = this.obraDe(cc);
        const grupo = this.chaveObra(cc);
        if (!obra || !grupo) return;
        const conta = String(fc.financialCategoryId || "").trim();
        const nomeConta = fc.financialCategoryName || this.catName(conta) || "";
        const classe = this.classeConta(conta, nomeConta, sinal);
        const k = grupo + "|" + classe;
        const g = grupos[k] || (grupos[k] = { obra, grupo, classe, porCc: {}, contas: [], foraTotal: 0, guia: null });
        const valor = Math.abs(amount) * (Number(share) || 0);
        const og = this.origemGuia(mov, cc);
        if (og) {
          g.guia = og.guia;
          og.itens.forEach(it => {
            const parte = valor * it.valor / og.soma;
            const am = this.contaAmarrada(it.conta, cc, ctx);
            g.contas.push({
              codigo: it.conta ? this.formatAccountCode(it.conta) : "—",
              nome: it.nome || this.catName(it.conta) || "Sem nome",
              cc,
              ccNome: fc.costCenterName || this.ccNome(cc),
              valor: parte,
              amarrada: am.ok,
              motivo: am.motivo,
              origem: { doc: it.doc, credor: it.credor, imposto: it.imposto, billId: it.billId, emissao: it.emissao }
            });
            if (am.ok) g.porCc[cc] = (g.porCc[cc] || 0) + parte;
            else g.foraTotal += parte;
          });
          return;
        }
        const amarra = this.contaAmarrada(conta, cc, ctx);
        g.contas.push({
          codigo: conta ? this.formatAccountCode(conta) : "—",
          nome: fc.financialCategoryName || this.catName(conta) || "Sem nome",
          cc,
          ccNome: fc.costCenterName || this.ccNome(cc),
          valor,
          amarrada: amarra.ok,
          motivo: amarra.motivo
        });
        if (amarra.ok) g.porCc[cc] = (g.porCc[cc] || 0) + valor;
        else g.foraTotal += valor;
      });
      Object.values(grupos).forEach(g => {
        if (!g.contas.some(c => wanted.has(c.cc))) return;
        const idsMov = Object.keys(g.porCc);
        const total = idsMov.reduce((s, id) => s + g.porCc[id], 0);
        const totalGeral = total + g.foraTotal;
        if (!(totalGeral > 0.004)) return;
        let linhas = [];
        let status = "na";
        let distratoNota = "";
        if (this.ehDistratoMov(mov)) g.emissao = this.emissaoDoMov(mov);
        if (total > 0.004 && !this.SOLTOS[g.grupo]) {
          const padrao = this.padraoObra(g.obra);
          const todos = [...new Set(idsMov.concat(padrao ? Object.keys(padrao) : []))];
          linhas = todos.map(id => {
            const valor = g.porCc[id] || 0;
            return {
              id,
              nome: this.ccNome(id),
              valor,
              atual: total > 0 ? valor * 100 / total : 0,
              esperado: padrao && padrao[id] != null ? padrao[id] : null
            };
          }).sort((a, b) => Number(a.id) - Number(b.id));
          status = "sem";
          if (padrao) {
            const ok = linhas.every(l => {
              const esp = l.esperado == null ? 0 : l.esperado;
              return Math.abs(l.atual - esp) < 0.06 || Math.abs(l.valor - total * esp / 100) < 0.02;
            });
            status = ok ? "ok" : "fora";
          }
          const virtual = this.rateioDistratoNovo(g);
          if (virtual) {
            linhas = virtual.linhas;
            status = "ok";
            distratoNota = virtual.nota;
          }
        }
        const parceria = this.activePartnership();
        const soBanco = parceria && PP && PP.isMista(parceria) && g.contas.length
          && g.contas.every((c) => PP.ehDespesaBancaria(c.codigo, c.nome));
        if (soBanco) {
          status = "na";
          distratoNota = "Despesa bancária fica 100% com o empreendedor, mesmo quando a liquidação da tarifa do boleto rateia pelo centro de custo.";
        }
        const motivos = [...new Set(g.contas.filter(c => !c.amarrada).map(c => c.motivo))];
        const row = {
          key: idx + "|" + g.grupo + "|" + g.classe,
          data: String(mov.bankMovementDate || mov.paymentDate || "").slice(0, 10),
          historico: txt(mov.bankMovementHistoricName) || txt(mov.documentIdentificationName) || "—",
          pessoa: txt(mov.clientName) || txt(mov.creditorName),
          titulo: txt(mov.billId || mov.billPayableId || mov.billReceivableId || mov.payableBillId || mov.receivableBillId || mov.titleId),
          parcela: txt(mov.installmentId || mov.installmentNumber || mov.installment),
          documento: [txt(mov.documentIdentificationId || mov.documentId), txt(mov.documentIdentificationNumber || mov.documentNumber)].filter(Boolean).join(" "),
          contaBanco: txt(mov.accountNumber || mov.account || ""),
          contaNome: txt(mov.accountName || mov.checkingAccountName || ""),
          obra: g.obra,
          grupo: g.grupo,
          classe: g.classe,
          redutora: g.classe === "receita" && g.contas.every((c) => String(c.codigo || "").replace(/\D/g, "").charAt(0) === "2"),
          total: totalGeral,
          totalRateio: total,
          foraTotal: g.foraTotal,
          linhas,
          contas: g.contas,
          guia: g.guia,
          motivo: distratoNota || motivos.join(" · "),
          distratoNota,
          status
        };
        (g.classe === "repasse" ? repasses : g.classe === "despesa" ? despesas : receitas).push(row);
      });
    });
    const ord = (a, b) => {
      const rank = { fora: 0, sem: 1, ok: 2, na: 3 };
      const d = (rank[a.status] == null ? 9 : rank[a.status]) - (rank[b.status] == null ? 9 : rank[b.status]);
      if (d) return d;
      return String(b.data).localeCompare(String(a.data));
    };
    receitas.sort(ord);
    despesas.sort(ord);
    repasses.sort(ord);
    return { receitas, despesas, repasses };
  },

  ignoredAccountKeys() {
    const set = new Set();
    const v = this.visao();
    (v.ignoredAccounts || []).forEach(id => {
      const sid = String(id || "").trim();
      if (!sid) return;
      set.add(sid);
      const nk = this.normAccountKey(sid);
      if (nk) set.add(nk);
    });
    return set;
  },

  signedAmount(node, categoryId, categoryName, amount, reducerFlag, categoryType, mov) {
    const fc = this.fc();
    if (fc && typeof fc.signedAmount === "function") {
      return fc.signedAmount(node, categoryId, categoryName, amount, reducerFlag, categoryType, mov);
    }
    const abs = Math.abs(Number(amount) || 0);
    const digits = String(categoryId || "").replace(/\D/g, "");
    return digits.charAt(0) === "2" ? -abs : abs;
  },

  isReducingAccount(categoryId, categoryName, node) {
    const fc = this.fc();
    if (fc && typeof fc.isReducingAccount === "function") {
      return fc.isReducingAccount(categoryId, categoryName, node);
    }
    return !!(node && node.redutora);
  },

  allocate(mov) {
    const fcApp = this.fc();
    const amount = Number(mov.bankMovementAmount) || 0;
    const wanted = this.costCenterIds.map(String);
    let cats = Array.isArray(mov.financialCategories) ? mov.financialCategories : [];
    // Sem plano financeiro = transferência / aplicação — fora do DFC
    if (!cats.length) return [];
    if (wanted.length) {
      cats = cats.filter(fc => wanted.includes(String(fc.costCenterId)));
    }
    if (!cats.length) return [];

    const ignored = this.ignoredAccountKeys();
    const part = this.activePartnership();
    const PP = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : null;
    const shareEntries = (fcApp && typeof fcApp.categoryShareEntries === "function")
      ? fcApp.categoryShareEntries(cats)
      : cats.map((fc) => ({ fc, share: 1 / cats.length }));

    return shareEntries.map(({ fc, share }) => {
      const categoryId = String(fc.financialCategoryId || "").trim();
      if (!categoryId) return null;
      const nk = this.normAccountKey(categoryId);
      if (ignored.has(categoryId) || (nk && ignored.has(nk))) return null;

      let factor = 1;
      if (part && PP) {
        const obra = PP.obraForCostCenter(part, fc.costCenterId)
          || (part.obras && part.obras[0])
          || null;
        const og = obra ? this.origemGuia(mov, fc.costCenterId) : null;
        if (og) {
          factor = og.itens.reduce((s, it) => s + it.valor * PP.partnershipAmountFactor(part, obra, it.conta, it.nome), 0) / og.soma;
          if (!(factor > 0)) return null;
        } else if (obra) {
          const nomeConta = fc.financialCategoryName || this.catName(categoryId) || "";
          if (PP.isMista(part) && PP.ehDespesaBancaria(categoryId, nomeConta)) return null;
          if (!PP.accountEntersPartnership(part, obra, categoryId)) return null;
          factor = PP.partnershipAmountFactor(part, obra, categoryId, nomeConta);
          if (!factor) return null;
        }
      }

      return {
        amount: amount * share * factor,
        categoryId,
        categoryName: fc.financialCategoryName || this.catName(fc.financialCategoryId) || "Sem nome",
        costCenterId: fc.costCenterId,
        costCenterName: fc.costCenterName,
        reducer: fc.financialCategoryReducer,
        categoryType: fc.financialCategoryType,
        mov
      };
    }).filter(Boolean);
  },

  buildTree(allocs) {
    this.ensureDfcReady();
    const visao = this.visao();
    const groups = (visao.groups || []).map(g => ({
      ...g,
      amount: 0,
      accountRows: []
    }));
    const byId = Object.fromEntries(groups.map(g => [g.id, g]));
    const part = this.activePartnership();
    const PP = typeof ParametrizacaoParceiroApp !== "undefined" ? ParametrizacaoParceiroApp : null;

    const accToNode = {};
    groups.forEach(g => {
      (g.accounts || []).forEach(id => {
        const sid = String(id).trim();
        if (!sid) return;
        accToNode[sid] = g.id;
        const nk = this.normAccountKey(sid);
        if (nk) accToNode[nk] = g.id;
        const dotted = this.formatAccountCode(sid);
        if (dotted) {
          accToNode[dotted] = g.id;
          const nk2 = this.normAccountKey(dotted);
          if (nk2) accToNode[nk2] = g.id;
        }
      });
    });

    const unmatched = { total: 0, samples: [] };
    const accIndex = {};

    allocs.forEach(a => {
      const rawId = String(a.categoryId || "").trim();
      if (!rawId) return;
      const nk = this.normAccountKey(rawId);
      const dotted = this.formatAccountCode(rawId);
      const nid = accToNode[rawId] || (nk && accToNode[nk]) || (dotted && accToNode[dotted]) || null;
      if (!nid || !byId[nid]) {
        unmatched.total += Number(a.amount) || 0;
        if (unmatched.samples.length < 12) {
          unmatched.samples.push({ id: rawId, name: a.categoryName, amount: a.amount });
        }
        return;
      }
      const node = byId[nid];
      const amount = this.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov);
      node.amount += amount;

      const idxKey = nk || rawId;
      if (!accIndex[idxKey]) {
        accIndex[idxKey] = {
          id: rawId,
          displayId: this.formatAccountCode(rawId),
          name: a.categoryName,
          amount: 0,
          items: [],
          parentId: node.id,
          redutora: !!(node.redutora || this.isReducingAccount(a.categoryId, a.categoryName, node)
            || /^(S|SIM|TRUE|1|Y|R)$/i.test(String(a.reducer || "").trim()))
        };
      }
      accIndex[idxKey].amount += amount;
      accIndex[idxKey].name = a.categoryName || accIndex[idxKey].name;
      accIndex[idxKey].items.push({ ...a, amount });
    });
    this.unmatchedInfo = unmatched;
    this.accountIndex = accIndex;

    Object.values(accIndex).forEach(acc => {
      const node = byId[acc.parentId];
      if (node) node.accountRows.push(acc);
    });

    groups.forEach(g => {
      g.accountRows.sort((a, b) => String(a.displayId || a.id).localeCompare(String(b.displayId || b.id), "pt-BR", { numeric: true }));
    });

    // Rollup bottom-up
    const depthOf = (g) => {
      let d = 0, cur = g;
      while (cur && cur.parentId && byId[cur.parentId]) { d++; cur = byId[cur.parentId]; }
      return d;
    };
    [...groups].filter(g => g.type !== "formula").sort((a, b) => depthOf(b) - depthOf(a)).forEach(g => {
      const children = groups.filter(c => c.parentId === g.id && c.type !== "formula");
      children.forEach(ch => { g.amount += ch.amount; });
    });

    const sumNodes = (ids) => ids.reduce((s, id) => s + ((byId[id] && byId[id].amount) || 0), 0);
    const applySum = (id, parts) => {
      if (!byId[id]) return;
      byId[id].amount = sumNodes(parts);
    };
    applySum("g_03", ["g_04", "g_05"]);
    applySum("g_06", ["g_01", "g_02", "g_03"]);
    applySum("g_08", ["g_06", "g_07"]);
    applySum("g_10", ["g_08", "g_09"]);
    applySum("g_12", ["g_10", "g_11"]);

    const hideNode = (node) => {
      if (!part || !PP || !node) return false;
      return PP.isDfcHiddenForParceria(part, node);
    };

    if (!this._expandInited) {
      groups.filter(g => !g.parentId && g.type !== "formula").forEach(g => this.expanded.add(g.id));
      this._expandInited = true;
    }

    const rows = [];
    const pushNode = (node, level) => {
      if (hideNode(node)) return;
      const children = groups.filter(g => g.parentId === node.id && !hideNode(g));
      const hasKids = children.length > 0 || (node.accountRows && node.accountRows.length > 0);
      rows.push({
        id: node.id,
        code: node.code || "",
        name: node.name || "",
        amount: node.amount,
        level,
        hasKids,
        isAccount: false,
        isFormula: node.type === "formula",
        type: node.type
      });
      if (!this.expanded.has(node.id)) return;
      children.forEach(ch => pushNode(ch, level + 1));
      (node.accountRows || []).forEach(acc => {
        const code = acc.displayId || this.formatAccountCode(acc.id);
        const redFlag = acc.redutora ? " (−)" : "";
        rows.push({
          id: acc.id,
          code,
          name: `${acc.name || ""}${redFlag}`.trim(),
          amount: acc.amount,
          level: level + 1,
          isAccount: true,
          hasKids: false,
          parentId: node.id
        });
      });
    };
    groups.filter(g => !g.parentId).forEach(g => pushNode(g, 0));

    const receitas = (byId.g_01 && byId.g_01.amount) || 0;
    const custos = (byId.g_04 && byId.g_04.amount) || 0;
    const despesas = (byId.g_05 && byId.g_05.amount) || 0;
    const gco = (byId.g_06 && byId.g_06.amount) || (receitas + custos + despesas);
    const custosDespesas = custos + despesas;
    this.totals = { receitas, custos, despesas, custosDespesas, gco };
    this.lines = rows;
  },

  rebuildFromMovements() {
    const allocs = [];
    (this.movements || []).forEach(mov => this.allocate(mov).forEach(a => allocs.push(a)));
    const fcApp = this.fc();
    if (fcApp && typeof fcApp.settleAdvancesInAllocs === "function") {
      fcApp.settleAdvancesInAllocs(allocs, this.movements);
    }
    this.buildTree(allocs);
    this.conferencias = this.montarConferencia();
  },

  async load() {
    if (!this.costCenterIds.length) {
      this.error = "Selecione ao menos um centro de custo / obra (ex.: 13600 e 13601).";
      this.render();
      return;
    }
    if ((this.companyIds || []).length !== 1 || !this.companyId) {
      this.error = "Selecione uma empresa. A prestação consulta uma empresa por vez, a da obra do parceiro.";
      this.render();
      return;
    }
    this.loading = true;
    this.loadMsg = "Carregando títulos…";
    this.loadPct = 12;
    this.error = "";
    this.rastreio = null;
    this.selectedAccount = null;
    this.saldoCc = null;
    const gen = ++this.dashGen;
    this.render();
    const { start, end } = this.periodBounds();
    const saldoP = this.carregarSaldoParceria(gen);
    try {
      await this.ensureCategories();
      this.ensureDfcReady();
      if (!window.SiengeApiService || typeof SiengeApiService.getBankMovements !== "function") {
        throw new Error("API de caixa e banco indisponível.");
      }
      const movimentos = await SiengeApiService.getBankMovements(start, end, {
        selectionType: "M",
        companyId: this.companyId,
        costCentersId: this.costCenterIds
      });
      if (gen !== this.dashGen) return;
      this.movements = movimentos;
      await this.carregarEmissoesDistrato();
      if (gen !== this.dashGen) return;
      this.rebuildFromMovements();
      if (!this.movements.length) {
        this.error = "Nenhum movimento de caixa/banco no período para os filtros selecionados.";
      } else if (this.unmatchedInfo && Math.abs(this.unmatchedInfo.total) > 0.005) {
        this.error = "";
      }
      try {
        await this.rastrearGuias();
      } catch (e) {
        console.warn("[Prestação de Contas] Origem das guias:", e);
        this.rastreio = { msg: "Não foi possível rastrear a origem das guias de impostos. Elas seguem pela conta da própria guia.", erro: true };
      }
      if (gen !== this.dashGen) return;
      this.rebuildFromMovements();
      try {
        await this.carregarRetencaoMista();
      } catch (e) {
        console.warn("[Prestação de Contas] Retenção da conta de distribuição:", e);
      }
      await saldoP;
    } catch (err) {
      if (gen !== this.dashGen) return;
      console.error("[Prestação de Contas]", err);
      this.error = err && err.message ? err.message : "Falha ao consultar a API de movimento bancário.";
      this.movements = [];
      this.lines = [];
      try { await saldoP; } catch (e) {}
    }
    if (gen !== this.dashGen) return;
    try {
      await this.carregarPaineis();
    } catch (err) {
      console.error("[Prestação de Contas] Painéis:", err);
      if (this.dash) this.dash.erro = (err && err.message) || "Falha ao consultar o Sienge.";
    } finally {
      if (gen !== this.dashGen) return;
      this.loading = false;
      this.render();
    }
  },

  reiniciar() {
    const comp = this.competenciaPadrao();
    this.dashGen++;
    this.loading = false;
    this.year = comp.year;
    this.month = comp.month;
    this.companyId = "";
    this.companyIds = [];
    this.partnershipId = "";
    this.costCenterIds = [];
    this.ccSearch = "";
    this.empOpen = false;
    this.empQuery = "";
    this.aba = "obra";
    this.confFiltro = "";
    this.confAberta = "";
    this.movements = [];
    this.lines = [];
    this.conferencias = { receitas: [], despesas: [], repasses: [] };
    this.totals = { receitas: 0, custos: 0, despesas: 0, custosDespesas: 0, gco: 0 };
    this.error = "";
    this.rastreio = null;
    this.retencaoMista = null;
    this.saldoCc = null;
    this.selectedAccount = null;
    this.dash = null;
    this.gruposAbertos = new Set();
    if (this._chartTempo) {
      this._chartTempo.destroy();
      this._chartTempo = null;
    }
    this.render();
  },

  limpar() {
    if (this.loading) return;
    this.reiniciar();
  },

  setLoad(txt, pct) {
    this.loadMsg = txt;
    this.loadPct = pct;
    const t = document.getElementById("pc-load-txt");
    const b = document.getElementById("pc-load-bar");
    if (t) t.textContent = txt;
    if (b) b.style.width = pct + "%";
  },

  loadHtml() {
    const pct = Math.max(4, Math.min(100, Number(this.loadPct) || 8));
    return `<div class="ml-load pcx-load">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-status-text" id="pc-load-txt">${this.esc(this.loadMsg || "Carregando títulos…")}</div>
      <div class="ml-load-track"><div class="loading-progress-bar" id="pc-load-bar" style="width:${pct}%"></div></div>
    </div>`;
  },

  render() {
    const root = document.getElementById("prestacao-contas-root");
    if (!root) return;
    const prevScroll = document.getElementById("pc-conf-scroll");
    const prevTop = prevScroll ? prevScroll.scrollTop : 0;
    const partnerships = this.parceriasVisiveis();
    const conf = this.conferencias || { receitas: [], despesas: [], repasses: [] };
    const nFora = (rows) => (rows || []).filter(r => r.status === "fora").length;
    const pad = n => String(n).padStart(2, "0");
    const abas = { obra: 1, repasse: 1, vendas: 1, estoque: 1, carteira: 1, inad: 1 };
    const aba = abas[this.aba] ? this.aba : "obra";
    const tab = (id, icon, txt, count) => `<button type="button" role="tab" aria-selected="${aba === id}" class="ml-tab${aba === id ? " is-active" : ""}" onclick="PrestacaoContasApp.setAba('${id}')"><i data-lucide="${icon}"></i> ${txt}${count ? ` <span class="ml-tab-count">${count}</span>` : ""}</button>`;
    const ccs = this.costCenters();

    root.innerHTML = `
      <div class="pcx-page">
        <div class="pcx-head">
        <div class="cc-toolbar pcx-toolbar">
          ${this.empresaFiltroHtml()}
          ${partnerships.length || this.companyIds.length ? `<label class="pcx-field pcx-field-parc">
            <span class="ml-emp-filter-label">Parceria</span>
            <select class="pcx-input" onchange="PrestacaoContasApp.applyPartnership(this.value)">
              <option value="">Todas (opcional)</option>
              ${partnerships.map(p => {
                const obras = (p.obras && p.obras.map(o => o.code).filter(Boolean).join(", ")) || p.obraCode || "";
                return `<option value="${this.esc(p.id)}" ${this.partnershipId === p.id ? "selected" : ""}>${this.esc(p.partnerName)}${obras ? " · obras " + this.esc(obras) : ""}</option>`;
              }).join("")}
            </select>
          </label>` : `<label class="pcx-field pcx-field-parc">
            <span class="ml-emp-filter-label">Parceria</span>
            <select class="pcx-input" disabled><option>Selecione a empresa</option></select>
          </label>`}
          <div class="tvig-filter-slot tvig-comp-slot">
            <label class="tvig-comp-label" for="pc-comp">Mês de referência</label>
            <input type="month" id="pc-comp" class="tvig-comp-input" title="Consulta pela data de pagamento" value="${this.year}-${pad(this.month)}" onchange="PrestacaoContasApp.setCompetencia(this.value)">
          </div>
          <div class="cc-toolbar-actions">
            <button type="button" class="btn btn-primary" onclick="PrestacaoContasApp.exportar()" ${this.loading ? "disabled" : ""} title="Gerar a prestação em PDF, retrato">
              <i data-lucide="download" style="width:14px;height:14px;"></i> PDF
            </button>
            <button type="button" class="btn btn-cancel pcx-limpar" onclick="PrestacaoContasApp.limpar()" ${this.loading ? "disabled" : ""}>Limpar</button>
            <button type="button" class="btn btn-primary cc-atualizar" onclick="PrestacaoContasApp.load()" ${this.loading ? "disabled" : ""}>
              <i data-lucide="refresh-cw"></i> Carregar
            </button>
          </div>
        </div>

        <div class="pcx-ccs">
          <span class="ml-emp-filter-label">Centros de custo</span>
          <div class="pcx-cc-box">
            ${this.costCenterIds.map(id => {
              const cc = ccs.find(c => String(c.id) === String(id));
              return `<span class="pcx-chip" title="${this.esc(cc ? cc.name : "")}">${this.esc(id)}
                <button type="button" onclick="PrestacaoContasApp.removeCostCenter('${this.esc(id)}')" aria-label="Remover">×</button>
              </span>`;
            }).join("") || '<span class="pcx-mute">Nenhum centro selecionado</span>'}
            <span class="pcx-cc-search">
              <i data-lucide="search"></i>
              <input type="text" placeholder="Adicionar centro de custo..." value="${this.esc(this.ccSearch || "")}" oninput="PrestacaoContasApp.onCcSearch(this.value)">
            </span>
          </div>
          <div id="pc-cc-sugg">${this.ccSuggestionsHtml()}</div>
        </div>
        </div>

        ${this.error ? `<div class="pcx-alert is-error">${this.esc(this.error)}</div>` : ""}
        ${this.rastreio && this.rastreio.erro ? `<div class="pcx-alert is-warn"><span>${this.esc(this.rastreio.msg)}</span></div>` : ""}

        <div class="ml-tabs pcx-tabs" role="tablist">
          ${tab("obra", "clipboard-check", "Validação", nFora(conf.receitas) + nFora(conf.despesas))}
          ${tab("vendas", "handshake", "Vendas e distratos")}
          ${tab("estoque", "warehouse", "Estoque")}
          ${tab("carteira", "wallet", "Carteira")}
          ${tab("inad", "alert-circle", "Inadimplência")}
          ${tab("repasse", "split", "Repasse anterior", nFora(conf.repasses))}
        </div>

        ${this.loading ? this.loadHtml() : (aba === "obra" || aba === "repasse" ? this.conferirHtml(aba) : this.painelHtml(aba))}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    this.ligarEmpresaFiltro();
    if (!this.loading && aba === "carteira") this.desenharTempo();
    const novoScroll = document.getElementById("pc-conf-scroll");
    if (novoScroll && prevTop) novoScroll.scrollTop = prevTop;
  },

  seloRateio(status, motivo, prestacao) {
    const ok = status === "ok" || prestacao;
    const txt = prestacao ? "Rateio da prestação" : ({ ok: "Conferido", fora: "Fora do padrão", sem: "Sem % no centro", na: "Não se aplica rateio" }[status] || "—");
    const tip = prestacao ? motivo : (status === "na" ? (motivo || "Conta do plano financeiro que não entra no rateio da parceria") : "");
    const cls = prestacao ? "ok" : status;
    const ico = ok ? `<i data-lucide="check"></i>` : "";
    return `<span class="pcx-selo is-${cls}"${tip ? ` title="${this.esc(tip)}"` : ""}>${ico}${txt}</span>`;
  },

  seloGrupo(fora, n) {
    if (fora) return `<span class="pcx-selo is-fora">${fora} fora</span>`;
    if (!n) return "";
    return `<span class="pcx-selo is-ok"><i data-lucide="check"></i> Conferido</span>`;
  },

  textoCentros(linhas, campo) {
    const lista = (linhas || []).filter(l => campo === "atual" ? l.valor > 0.004 : l.esperado != null);
    if (!lista.length) return campo === "esperado" ? "Não cadastrado" : "—";
    return lista.map(l => `${this.esc(l.id)} ${this.fmtPct(l[campo])}`).join(" · ");
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 && p[0].length === 4 ? `${p[2]}/${p[1]}/${p[0]}` : "—";
  },

  isoMaisDias(iso, dias) {
    const p = String(iso || "").slice(0, 10).split("-");
    if (p.length !== 3) return "";
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + (Number(dias) || 0));
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  },

  chaveConta(s) {
    return String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  },

  /* Resultado do terrenista nesta competência. Despesa bancária sai inteira do empreendedor e não entra aqui. */
  baseMista() {
    const PP = window.ParametrizacaoParceiroApp;
    const part = this.activePartnership();
    if (!part || !PP || typeof PP.isMista !== "function" || !PP.isMista(part)) return null;
    const wanted = (this.costCenterIds || []).map(String);
    const fcApp = this.fc();
    let valor = 0;
    let bancarias = 0;
    (this.movements || []).forEach((mov) => {
      const amount = Number(mov.bankMovementAmount) || 0;
      if (!amount) return;
      let cats = Array.isArray(mov.financialCategories) ? mov.financialCategories : [];
      if (!cats.length) return;
      if (wanted.length) cats = cats.filter((fc) => wanted.includes(String(fc.costCenterId)));
      if (!cats.length) return;
      const entries = (fcApp && typeof fcApp.categoryShareEntries === "function")
        ? fcApp.categoryShareEntries(cats)
        : cats.map((fc) => ({ fc, share: 1 / Math.max(cats.length, 1) }));
      const sinal = this.sinalMov(mov);
      entries.forEach(({ fc, share }) => {
        const categoryId = String((fc && fc.financialCategoryId) || "").trim();
        if (!categoryId) return;
        const nome = (fc && fc.financialCategoryName) || this.catName(categoryId) || "";
        if (this.classeConta(categoryId, nome, sinal) === "repasse") return;
        const parte = Math.abs(amount) * (Number(share) || 0);
        if (PP.ehDespesaBancaria(categoryId, nome)) {
          bancarias += parte;
          return;
        }
        const obra = PP.obraForCostCenter(part, fc.costCenterId) || (part.obras && part.obras[0]) || null;
        if (!obra || !PP.accountEntersPartnership(part, obra, categoryId)) return;
        const factor = PP.partnershipAmountFactor(part, obra, categoryId, nome);
        if (!(factor > 0)) return;
        valor += this.signedAmount(null, categoryId, nome, parte * factor, fc.financialCategoryReducer, fc.financialCategoryType, mov);
      });
    });
    return { valor, bancarias };
  },

  tipoRetencao(id, nome) {
    const PP = window.ParametrizacaoParceiroApp;
    const n = String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (/DISTRIBUICAO DE LUCRO|\bREPASSE\b/.test(n)) return "";
    if (PP && PP.ehDespesaBancaria(id, nome)) return "";
    const gid = this.noDfc(id, nome);
    if (gid.indexOf("g_02") === 0 || /\bPIS\b|\bCOFINS\b|\bIRPJ\b|\bCSLL\b|\bIRRF\b|IMPOSTO DE RENDA/.test(n)) return "imposto";
    if (gid === "g_05_03" || gid.indexOf("g_05_03_") === 0 || /ADMINISTRATIV|DESPESAS OPERACIONAIS|DESPESA OPERACIONAL/.test(n)) return "despesa";
    return "";
  },

  contaDoTitulo(bill) {
    const nums = [];
    const push = (v) => {
      const s = String(v || "").trim();
      if (s) nums.push(s);
    };
    push(bill && (bill.accountNumber || bill.checkingAccountNumber || bill.bankAccountNumber));
    (bill && bill.payments || []).forEach((pay) => {
      push(pay && (pay.accountNumber || pay.checkingAccountNumber));
      (pay && pay.bankMovements || []).forEach((bm) => push(bm && bm.accountNumber));
    });
    return nums;
  },

  async outcomeFaixa(start, end, companyId, depth) {
    const fetchFn = window.siengeFetchWithRetry || window.siengeFetch;
    if (typeof fetchFn !== "function") throw new Error("A consulta ao Sienge não está disponível.");
    let endpoint = "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
    if (companyId) endpoint += "&companyId=" + encodeURIComponent(companyId);
    try {
      const payload = await fetchFn(endpoint, 2);
      return (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    } catch (err) {
      const grande = Number(err && err.status) === 507 || /\b507\b/.test(String((err && err.message) || ""));
      if (!grande || (depth || 0) > 5 || start >= end) throw err;
      const s = new Date(start + "T12:00:00");
      const e = new Date(end + "T12:00:00");
      const midDate = new Date(s.getTime() + Math.floor((e - s) / 2));
      const pad = (n) => String(n).padStart(2, "0");
      const mid = midDate.getFullYear() + "-" + pad(midDate.getMonth() + 1) + "-" + pad(midDate.getDate());
      const next = this.isoMaisDias(mid, 1);
      if (!(mid >= start && mid < end && next <= end)) throw err;
      const left = await this.outcomeFaixa(start, mid, companyId, (depth || 0) + 1);
      const right = await this.outcomeFaixa(next, end, companyId, (depth || 0) + 1);
      return left.concat(right);
    }
  },

  reterDaConta(part, bills) {
    const PP = window.ParametrizacaoParceiroApp;
    const alvo = this.chaveConta(part && part.contaDistribuicao);
    const ccs = new Set((PP ? PP.sociosPorPapel(part, "empreendedor") : []).map((s) => String(s.ccTitulo || "").replace(/\D/g, "")).filter(Boolean));
    const tot = { impostos: 0, despesas: 0 };
    (bills || []).forEach((bill) => {
      if (!bill) return;
      if (part && part.companyId && String(bill.companyId || "") && String(bill.companyId) !== String(part.companyId)) return;
      const doc = String(bill.documentIdentificationId || "").toUpperCase();
      if (doc === "DIST") return;
      const saldo = bill.balanceAmount != null ? Number(bill.balanceAmount) : (Number(bill.originalAmount) || 0);
      if (!(saldo > 0.009)) return;
      const contas = this.contaDoTitulo(bill).map((c) => this.chaveConta(c)).filter(Boolean);
      if (alvo && contas.length && !contas.some((c) => c === alvo || c.indexOf(alvo) >= 0 || alvo.indexOf(c) >= 0)) return;
      const cats = Array.isArray(bill.paymentsCategories) ? bill.paymentsCategories : [];
      if (!cats.length) return;
      if (alvo && !contas.length) {
        const noCc = cats.some((c) => ccs.has(String(c.costCenterId || "").replace(/\D/g, "")));
        if (ccs.size && !noCc) return;
      }
      const rates = cats.map((c) => Number(c && c.financialCategoryRate));
      const soma = rates.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
      cats.forEach((c, i) => {
        const tipo = this.tipoRetencao(c && c.financialCategoryId, c && c.financialCategoryName);
        if (!tipo) return;
        const rate = soma > 0 ? ((Number.isFinite(rates[i]) ? rates[i] : 0) / soma) : (1 / cats.length);
        tot[tipo] += saldo * rate;
      });
    });
    return tot;
  },

  async carregarRetencaoMista() {
    const PP = window.ParametrizacaoParceiroApp;
    const part = this.activePartnership();
    if (!part || !PP || !PP.isMista(part)) {
      this.retencaoMista = null;
      return;
    }
    const base = this.baseMista() || { valor: 0, bancarias: 0 };
    const data = PP.dataPagamentoMista(part, this.year, this.month);
    const pack = { base, data, impostos: 0, despesas: 0, erro: "", carregou: false };
    this.retencaoMista = pack;
    if (!data) return;
    const fim = this.isoMaisDias(data, 30);
    if (!fim) return;
    try {
      const bills = await this.outcomeFaixa(data, fim, this.companyId || part.companyId, 0);
      const tot = this.reterDaConta(part, bills);
      pack.impostos = tot.impostos;
      pack.despesas = tot.despesas;
      pack.carregou = true;
    } catch (e) {
      pack.erro = "Não foi possível ler os títulos a pagar dos próximos 30 dias.";
    }
    this.retencaoMista = pack;
  },

  distribuicaoMistaHtml() {
    const PP = window.ParametrizacaoParceiroApp;
    const part = this.activePartnership();
    if (!part || !PP || !PP.isMista(part)) return "";
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const mesNome = meses[(Number(this.month) || 1) - 1] || "";
    const pack = this.retencaoMista;
    const base = (pack && pack.base) || this.baseMista() || { valor: 0, bancarias: 0 };
    const dist = PP.distribuicaoEmpreendedores(part, base.valor, pack ? pack.impostos : 0, pack ? pack.despesas : 0);
    const origem = part.contaTerrenista || "conta do terrenista";
    const destino = part.contaDistribuicao || "conta de distribuição";
    const data = (pack && pack.data) || PP.dataPagamentoMista(part, this.year, this.month);
    const quando = data ? this.dataBr(data) : "no dia do pagamento do terrenista";
    const docNum = "DISTRIBUIÇÃO " + String(this.month).padStart(2, "0") + " " + this.year;
    const linhas = dist.linhas || [];
    const alerta = !linhas.length
      ? `<div class="pcx-alert is-warn">Cadastre os credores empreendedores e a parte de cada um na fatia de ${this.esc(PP.fmtPctCurto(dist.fatiaEmp))}%.</div>`
      : (!this.movements.length
        ? ""
        : (!(base.valor > 0.009)
          ? `<div class="pcx-alert is-warn">Nesta competência o terrenista não tem valor a receber, então não há transferência para a conta ${this.esc(destino)}.</div>`
          : `<div class="pcx-alert pcx-dist-alerta"><div><strong>Transferência no dia do terrenista.</strong> Em ${this.esc(quando)}, ao pagar o terrenista na conta ${this.esc(origem)}, transferir para a conta ${this.esc(destino)}, um lançamento para cada empreendedor:${linhas.map((row) => `<div>${this.esc(row.socio.name)} · R$ ${this.esc(PP.dinheiro(row.bruto))}</div>`).join("")}</div></div>`));
    const corpo = linhas.map((row) => {
      const s = row.socio;
      const texto = PP.textoObservacaoDistribuicao(mesNome, this.year, row.bruto, row.impostos, row.despesas, row.liquido);
      const plano = [s.planoId, s.planoNome].filter(Boolean).join(" — ");
      return `<tr>
        <td>${this.esc(s.name)}<div class="pcx-dist-sub">ID ${this.esc(s.id)} · ${this.esc(PP.fmtPctCurto(row.share))}% da fatia · efetivo ${this.esc(PP.fmtPctCurto(row.efetivo))}%</div></td>
        <td>${this.esc(s.ccTitulo || "—")}${s.ccTituloNome ? `<div class="pcx-dist-sub">${this.esc(s.ccTituloNome)}</div>` : ""}</td>
        <td>${this.esc(plano || "—")}<div class="pcx-dist-sub">${this.esc(s.docTipo || "DIST")} ${this.esc(docNum)}</div></td>
        <td class="is-right">${this.fmt(row.bruto)}</td>
        <td class="is-right">${this.fmt(row.impostos)}</td>
        <td class="is-right">${this.fmt(row.despesas)}</td>
        <td class="is-right pcx-valor">${this.fmt(row.liquido)}</td>
        <td class="pcx-dist-obs">${this.esc(texto)}</td>
      </tr>`;
    }).join("");
    const avisoRet = !data
      ? "Defina o dia do pagamento do terrenista para calcular os 30 dias de caixa."
      : (pack && pack.erro
        ? pack.erro
        : (pack && pack.carregou
          ? "Impostos e despesas administrativas com vencimento de " + this.dataBr(data) + " a " + this.dataBr(this.isoMaisDias(data, 30)) + " na conta " + destino + "."
          : "Carregue a competência para buscar as retenções dos próximos 30 dias."));
    return `<section class="pcx-dist">
      <h3>Distribuição dos empreendedores</h3>
      <p>O terrenista tem ${this.esc(PP.fmtPctCurto(dist.terrPct))}% e, nesta competência, ${this.fmt(base.valor)} a receber. Cada empreendedor sai dessa base: 50% de uma fatia de ${this.esc(PP.fmtPctCurto(dist.fatiaEmp))}% são ${this.esc(PP.fmtPctCurto(dist.fatiaEmp / 2))}% do negócio. Despesas bancárias do período: ${this.fmt(base.bancarias)}, por conta do empreendedor, fora desse rateio.</p>
      ${alerta}
      <p class="pcx-dist-sub">${this.esc(avisoRet)} O líquido é o que a empresa paga a cada sócio, já com a parte dele do imposto e da despesa.</p>
      ${corpo ? `<div class="cc-scroll"><table class="cc-table pcx-table pcx-dist-table">
        <thead><tr><th>Empreendedor</th><th>Centro de custo</th><th>Plano / documento</th><th class="is-right">Apurado</th><th class="is-right">PIS/COFINS/IR</th><th class="is-right">Despesas</th><th class="is-right">A pagar</th><th>Observação do título</th></tr></thead>
        <tbody>${corpo}</tbody>
      </table></div>` : ""}
    </section>`;
  },

  numeroConta(v) {
    return String(v || "").replace(/\D/g, "");
  },

  lerNumero(v) {
    if (v == null || v === "") return null;
    const raw = Number(v);
    if (Number.isFinite(raw)) return raw;
    const n = Number(String(v).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  },

  valorPosicao(row) {
    if (!row) return null;
    const list = [row.amount, row.balance, row.balanceAmount, row.currentBalance, row.lastBalance, row.lastBalanceAmount, row.availableAmount, row.availableBalance, row.value];
    for (let i = 0; i < list.length; i++) {
      const n = this.lerNumero(list[i]);
      if (n != null) return n;
    }
    return null;
  },

  valorCorrente(row) {
    if (!row) return null;
    const list = [row.balance, row.accountBalance, row.currentBalance, row.balanceAmount, row.lastBalance];
    for (let i = 0; i < list.length; i++) {
      const n = this.lerNumero(list[i]);
      if (n != null) return n;
    }
    return null;
  },

  valorExtrato(row) {
    const n = this.lerNumero(row && (row.value != null ? row.value : (row.amount != null ? row.amount : row.bankMovementAmount)));
    const abs = Math.abs(n || 0);
    const tipo = String((row && (row.type || row.operationType || row.bankMovementOperationType || row.nature)) || "").trim().toUpperCase();
    if (/^(S|D|DEBIT|DEBITO|DÉBITO|SAIDA|SAÍDA|OUT|OUTPUT|PAYMENT)$/.test(tipo)) return -abs;
    if (/^(E|C|CREDIT|CREDITO|CRÉDITO|ENTRADA|IN|INPUT|RECEIPT)$/.test(tipo)) return abs;
    return n || 0;
  },

  fmtData(iso) {
    const m = String(iso || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  },

  datasSaldo() {
    const y = Number(this.year);
    const m = Number(this.month);
    const pad = (n) => String(n).padStart(2, "0");
    // Fechamento escolhido em setembro: o saldo anterior é o último dia de agosto.
    const prev = new Date(y, m - 1, 0);
    const dataAnterior = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
    const per = this.periodBounds();
    const agora = new Date();
    const hoje = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
    let dataAtual = per.end;
    if (hoje < per.end) dataAtual = hoje < per.start ? dataAnterior : hoje;
    return { dataAnterior, dataAtual, inicioMov: per.start > dataAtual ? "" : per.start, atualEhHoje: dataAtual === hoje };
  },

  contasParceria() {
    const CC = window.CentrosCustoApp;
    if (!CC || typeof CC.customOf !== "function") return [];
    const ids = new Set((this.costCenterIds || []).map(String));
    const todos = (window.CentrosCustoState && CentrosCustoState.costCenters) || [];
    ids.forEach((id) => {
      const cc = todos.find((c) => String(c.id) === id);
      const par = cc && typeof CC.parDoRateio === "function" ? CC.parDoRateio(cc) : null;
      if (par && par.outro) ids.add(String(par.outro.id));
    });
    const porChave = new Map();
    ids.forEach((id) => {
      const conta = (CC.customOf(id) || {}).conta_parceria;
      const numero = String((conta && conta.numero) || "").trim();
      if (!numero) return;
      const cc = todos.find((c) => String(c.id) === String(id));
      const companyId = String((cc && (cc.companyId || cc.idCompany)) || this.companyId || "").trim();
      const chave = (companyId ? companyId + "|" : "") + (this.numeroConta(numero) || numero.toUpperCase());
      const item = porChave.get(chave) || {
        numero,
        nome: String(conta.nome || "").trim(),
        banco: String(conta.banco || "").trim(),
        agencia: String(conta.agencia || "").trim(),
        companyId,
        centros: []
      };
      if (item.centros.indexOf(id) < 0) item.centros.push(id);
      porChave.set(chave, item);
    });
    return [...porChave.values()].sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
  },

  acharPosicao(rows, numero, limite, companyId) {
    const alvo = this.numeroConta(numero);
    const cru = String(numero || "").trim().toUpperCase();
    const emp = String(companyId || "").trim();
    let melhor = null;
    (rows || []).forEach((row) => {
      const num = String(row.accountNumber || row.number || "").trim();
      if (!num) return;
      if (this.numeroConta(num) !== alvo && num.toUpperCase() !== cru) return;
      const dono = String(row.companyId || row.company || "").trim();
      if (emp && dono && dono !== emp) return;
      const amount = this.valorPosicao(row);
      if (amount == null) return;
      const dt = String(row.balanceDate || row.date || "").slice(0, 10);
      if (dt && limite && dt > limite) return;
      if (!melhor || (dt || "") >= (melhor.dt || "")) melhor = { amount, dt };
    });
    return melhor;
  },

  linhasExtrato(lista, numero, inicio, fim) {
    const alvo = this.numeroConta(numero);
    const out = [];
    const visitar = (row, herdado) => {
      if (!row || typeof row !== "object") return;
      const aninhado = row.movements || row.statements || row.entries || row.bankMovements;
      if (Array.isArray(aninhado) && aninhado.length) {
        const base = row.accountNumber || row.number || herdado || "";
        aninhado.forEach((m) => visitar(Object.assign({}, m, { accountNumber: m.accountNumber || m.number || base }), base));
        return;
      }
      const num = String(row.accountNumber || row.number || herdado || "");
      if (alvo && this.numeroConta(num) && this.numeroConta(num) !== alvo) return;
      const data = String(row.date || row.movementDate || row.bankMovementDate || "").slice(0, 10);
      if (!data || (inicio && data < inicio) || (fim && data > fim)) return;
      out.push({
        data,
        historico: String(row.description || row.historic || row.history || row.bankMovementHistoricName || row.documentIdentificationName || "—").trim() || "—",
        valor: this.valorExtrato(row),
        saldo: this.valorCorrente(row)
      });
    };
    (lista || []).forEach((row) => visitar(row, numero));
    out.sort((a, b) => a.data.localeCompare(b.data) || a.historico.localeCompare(b.historico, "pt-BR"));
    return out;
  },

  async carregarSaldoParceria(gen) {
    const datas = this.datasSaldo();
    const contas = this.contasParceria();
    if (!contas.length || !this.companyId) {
      if (gen === this.dashGen) this.saldoCc = { ...datas, contas: [], erro: "" };
      return;
    }
    if (!window.SiengeApiService || typeof SiengeApiService.getAccountBalances !== "function") {
      if (gen === this.dashGen) this.saldoCc = { ...datas, contas: [], erro: "A consulta de saldo do Sienge não está disponível." };
      return;
    }
    try {
      const empresas = [...new Set(contas.map((c) => String(c.companyId || this.companyId || "")).filter(Boolean))];
      const lerSaldos = (data) => Promise.all(empresas.map((id) => SiengeApiService.getAccountBalances(data, { companyId: id, showLast: true })))
        .then((listas) => listas.reduce((acc, lista) => acc.concat(Array.isArray(lista) ? lista : []), []));
      const [antes, agora] = await Promise.all([
        lerSaldos(datas.dataAnterior),
        lerSaldos(datas.dataAtual)
      ]);
      if (gen !== this.dashGen) return;
      const extratos = await Promise.all(contas.map(async (conta) => {
        if (!datas.inicioMov || typeof SiengeApiService.getAccountStatements !== "function") return [];
        try {
          return await SiengeApiService.getAccountStatements(datas.inicioMov, datas.dataAtual, {
            companyId: conta.companyId || this.companyId,
            accountNumber: conta.numero,
            rethrow: true
          });
        } catch (e) {
          return { erro: (e && e.message) || "Falha ao ler o extrato." };
        }
      }));
      if (gen !== this.dashGen) return;
      const montadas = await Promise.all(contas.map(async (conta, i) => {
        const pack = extratos[i];
        const falhou = pack && !Array.isArray(pack);
        const movimentos = falhou ? [] : this.linhasExtrato(pack, conta.numero, datas.inicioMov, datas.dataAtual);
        const posAnt = this.acharPosicao(antes, conta.numero, datas.dataAnterior, conta.companyId);
        const posAtu = this.acharPosicao(agora, conta.numero, datas.dataAtual, conta.companyId);
        let anterior = posAnt ? posAnt.amount : null;
        if (anterior == null && typeof SiengeApiService.getAccountStatements === "function") {
          try {
            const ate = await SiengeApiService.getAccountStatements(datas.dataAnterior.slice(0, 8) + "01", datas.dataAnterior, {
              companyId: conta.companyId || this.companyId,
              accountNumber: conta.numero,
              rethrow: true
            });
            const ateLinhas = this.linhasExtrato(ate, conta.numero, "", datas.dataAnterior);
            const ultimoAnt = [...ateLinhas].reverse().find((m) => m.saldo != null);
            if (ultimoAnt) anterior = ultimoAnt.saldo;
          } catch (e) {}
        }
        let atual = posAtu ? posAtu.amount : null;
        if (atual == null) {
          const ultimo = [...movimentos].reverse().find((m) => m.saldo != null);
          if (ultimo) atual = ultimo.saldo;
        }
        return {
          numero: conta.numero,
          rotulo: (window.CentrosCustoApp && CentrosCustoApp.contaLabel)
            ? CentrosCustoApp.contaLabel(conta)
            : [conta.banco ? "Banco " + conta.banco : "", conta.agencia ? "Ag. " + conta.agencia : "", "C/C " + conta.numero, conta.nome].filter(Boolean).join(" · "),
          centros: conta.centros.slice().sort((a, b) => Number(a) - Number(b)),
          anterior,
          atual,
          movimentos,
          erroExtrato: falhou ? pack.erro : ""
        };
      }));
      if (gen !== this.dashGen) return;
      this.saldoCc = { ...datas, erro: "", contas: montadas };
    } catch (e) {
      if (gen !== this.dashGen) return;
      console.warn("[Prestação de Contas] Saldo da conta da parceria:", e);
      this.saldoCc = { ...datas, contas: [], erro: (e && e.message) || "Falha ao consultar o saldo da conta da parceria." };
    }
  },

  saldoParceriaHtml(soFechamento) {
    const s = this.saldoCc;
    if (!s) return "";
    if (s.erro) return `<div class="pcx-alert is-warn">${this.esc(s.erro)}</div>`;
    if (!s.contas.length) {
      return `<p class="pcx-ajuda">Nenhum centro selecionado tem conta corrente de parceria. O saldo aparece aqui quando a conta está cadastrada no centro.</p>`;
    }
    const cor = (v) => (v == null ? "" : (v < -0.004 ? "is-neg" : "is-pos"));
    const money = (v) => (v == null ? "—" : this.fmt(v));
    const rotuloAtual = s.atualEhHoje ? "Saldo atual" : "Saldo no fim do mês";
    const dataFechamento = this.fmtData(s.dataAnterior);
    return `<section class="pcx-cc">${s.contas.map((c) => {
      const soma = c.movimentos.reduce((acc, m) => acc + (Number(m.valor) || 0), 0);
      const linhas = c.movimentos.map((m) => `<tr>
        <td>${this.esc(this.fmtData(m.data))}</td>
        <td>${this.esc(m.historico)}</td>
        <td class="is-right ${cor(m.valor)}">${this.fmt(m.valor)}</td>
        <td class="is-right">${m.saldo == null ? "—" : this.fmt(m.saldo)}</td>
      </tr>`).join("");
      const corpo = soFechamento ? "" : (c.erroExtrato
        ? `<p class="pcx-ajuda">${this.esc(c.erroExtrato)}</p>`
        : (c.movimentos.length
          ? `<div class="pcx-cc-mov"><table><thead><tr><th>Data</th><th>Histórico</th><th class="is-right">Valor</th><th class="is-right">Saldo</th></tr></thead><tbody>${linhas}</tbody></table></div>`
          : `<p class="pcx-ajuda">Nenhum movimento nesta conta entre ${this.esc(this.fmtData(s.inicioMov || s.dataAtual))} e ${this.esc(this.fmtData(s.dataAtual))}.</p>`));
      const demais = soFechamento ? "" : `
          <div><small>${rotuloAtual} · ${this.esc(this.fmtData(s.dataAtual))}</small><strong class="${cor(c.atual)}">${money(c.atual)}</strong></div>
          <div><small>${c.movimentos.length} movimento(s)</small><strong class="${cor(soma)}">${c.movimentos.length ? this.fmt(soma) : "—"}</strong></div>`;
      return `<article class="pcx-cc-card">
        <header>
          <strong>${this.esc(c.rotulo)}</strong>
          <span>Centros ${this.esc(c.centros.join(", "))}</span>
        </header>
        <div class="pcx-cc-saldos">
          <div><small>Último fechamento · ${this.esc(dataFechamento)}</small><strong class="${cor(c.anterior)}">${money(c.anterior)}</strong></div>
          ${demais}
        </div>
        ${corpo}
      </article>`;
    }).join("")}</section>`;
  },

  conferirHtml(aba) {
    const conf = this.conferencias || { receitas: [], despesas: [], repasses: [] };
    const repasse = aba === "repasse";
    const todas = repasse ? (conf.repasses || []) : (conf.receitas || []).concat(conf.despesas || []);
    const filtro = this.confFiltro;
    const rows = filtro ? todas.filter(r => r.status === filtro) : todas;
    const resultado = rows.reduce((s, r) => {
      const v = Number(r.total) || 0;
      if (r.classe === "despesa") return s - v;
      return s + (r.redutora ? -v : v);
    }, 0);
    const pill = (st, txt) => {
      const n = todas.filter(r => r.status === st).length;
      return `<button type="button" class="pcx-pill is-${st}${filtro === st ? " is-on" : ""}" onclick="PrestacaoContasApp.setConfFiltro('${st}')" ${n || filtro === st ? "" : "disabled"}>${n} ${txt}</button>`;
    };
    const vazio = this.loading ? "Carregando movimentos de caixa..."
      : (!this.movements.length ? "Clique em Carregar para consultar o Sienge."
        : (filtro ? "Nenhum lançamento nesta situação."
          : (repasse ? "Nenhum repasse pago nesta competência." : "Nenhum lançamento nos centros selecionados.")));
    const corpo = rows.length ? this.obrasHtml(rows, repasse) : `<tr><td colspan="8" class="pcx-vazio">${vazio}</td></tr>`;
    const corTotal = resultado < -0.004 ? "#b91c1c" : "#15803d";
    const dist = repasse ? "" : this.distribuicaoMistaHtml();
    const saldo = this.saldoParceriaHtml(!repasse);
    return `
      ${saldo}
      ${dist}
      <div class="pcx-resumo">
        <div class="pcx-pills">
          ${pill("fora", "fora do padrão")}
          ${pill("sem", "sem % no centro")}
          ${pill("ok", "conferidos")}
        </div>
        <div class="pcx-total">${rows.length} lançamento(s) · <strong style="color:${corTotal};">${this.fmt(resultado)}</strong></div>
      </div>
      <p class="pcx-ajuda">
        ${repasse
          ? "Pago neste mês, mas é a distribuição do mês anterior. Não entra nas despesas da obra."
          : "Cada obra começa fechada. Centros irmãos, como a parceria, ficam na mesma obra. 14304, 14305, 14703 e 14704 aparecem separados. O desconto de juros contratuais entra em Venda de imóveis, nas receitas."}
      </p>
      <div class="cc-scroll pcx-scroll" id="pc-conf-scroll">
        <table class="cc-table pcx-table">
          <colgroup>
            <col style="width:84px"><col style="width:118px"><col><col style="width:150px">
            <col style="width:16%"><col style="width:16%"><col style="width:112px"><col style="width:150px">
          </colgroup>
          <thead>
            <tr>
              <th>Data</th>
              <th>Título / parcela</th>
              <th>Histórico</th>
              <th>Conta corrente</th>
              <th>Lançado nos centros</th>
              <th>Padrão do centro</th>
              <th class="is-right">Valor</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>`;
  },

  somaLado(rows, despesa) {
    return (rows || []).reduce((s, r) => {
      const v = Number(r.total) || 0;
      if (despesa) return s + v;
      return s + (r.redutora ? -v : v);
    }, 0);
  },

  obrasHtml(rows, repasse) {
    const map = {};
    (rows || []).forEach((r) => {
      const id = r.grupo || r.obra || "—";
      const g = map[id] || (map[id] = { id, receitas: [], despesas: [], repasses: [] });
      if (r.classe === "despesa") g.despesas.push(r);
      else if (r.classe === "repasse") g.repasses.push(r);
      else g.receitas.push(r);
    });
    return Object.keys(map).sort((a, b) => Number(a) - Number(b)).map((id) => {
      const g = map[id];
      const lista = repasse ? g.repasses : g.receitas.concat(g.despesas);
      const fora = lista.filter((r) => r.status === "fora").length;
      const rec = this.somaLado(g.receitas, false);
      const desp = this.somaLado(g.despesas, true);
      const resultado = repasse ? this.somaLado(g.repasses, true) : rec - desp;
      const cor = resultado < -0.004 ? "#b91c1c" : "#15803d";
      const oid = "obra|" + id;
      const aberto = this.gruposAbertos.has(oid);
      let html = `<tr class="pcx-grupo" onclick="PrestacaoContasApp.toggleGrupo('${this.esc(oid)}')">
        <td colspan="6">
          <span class="pcx-grupo-nome">
            <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}" class="pcx-chev"></i>
            <strong>${this.esc(this.rotuloObra(id))}</strong>
            <span class="pcx-mute">${lista.length} lançamento(s)</span>
          </span>
        </td>
        <td class="is-right pcx-valor" style="color:${cor};">${this.fmt(resultado)}</td>
        <td>${this.seloGrupo(fora, lista.length)}</td>
      </tr>`;
      if (!aberto) return html;
      if (repasse) {
        html += this.arvoreHtml(g.repasses, "#b91c1c", oid);
        return html;
      }
      html += this.faixaObra(oid + "|rec", "Receitas", rec, g.receitas, "#15803d", false);
      html += this.faixaObra(oid + "|desp", "Despesas", desp, g.despesas, "#b91c1c", true);
      html += `<tr class="pcx-grupo is-conta">
        <td colspan="6"><span class="pcx-grupo-nome" style="padding-left:16px"><strong>Resultado financeiro</strong></span></td>
        <td class="is-right pcx-valor" style="color:${cor};">${this.fmt(resultado)}</td>
        <td>${this.seloGrupo(fora, lista.length)}</td>
      </tr>`;
      return html;
    }).join("");
  },

  faixaObra(id, nome, valor, rows, cor, despesa) {
    const aberto = this.gruposAbertos.has(id);
    const fora = (rows || []).filter((r) => r.status === "fora").length;
    let html = `<tr class="pcx-grupo is-conta" onclick="PrestacaoContasApp.toggleGrupo('${this.esc(id)}')">
      <td colspan="6">
        <span class="pcx-grupo-nome" style="padding-left:16px">
          <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}" class="pcx-chev"></i>
          <strong>${nome}</strong>
          <span class="pcx-mute">${(rows || []).length} lançamento(s)</span>
        </span>
      </td>
      <td class="is-right pcx-valor" style="color:${cor};">${this.fmt(despesa ? valor : valor)}</td>
      <td>${this.seloGrupo(fora, (rows || []).length)}</td>
    </tr>`;
    if (aberto && (rows || []).length) html += this.arvoreHtml(rows, cor, id);
    return html;
  },

  arvoreHtml(rows, cor, prefix) {
    const arvore = this.arvorePlano(rows);
    const contas = [];
    const visita = (node) => {
      Object.values(node.contas || {}).forEach((b) => contas.push(b));
      (arvore.nos || []).filter((c) => c.parentId === node.id).forEach(visita);
    };
    (arvore.raizes || []).forEach(visita);
    contas.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "pt-BR", { numeric: true }));
    return contas.map((b) => {
      const cid = (prefix ? prefix + ">" : "") + "conta|" + b.codigo;
      const aberto = this.gruposAbertos.has(cid);
      let html = `<tr class="pcx-grupo is-conta" onclick="PrestacaoContasApp.toggleGrupo('${this.esc(cid)}')">
        <td colspan="6">
          <span class="pcx-grupo-nome" style="padding-left:32px">
            <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}" class="pcx-chev"></i>
            <span class="pcx-cod">${this.esc(b.codigo)}</span>
            <strong>${this.esc(b.nome || "Conta")}</strong>
            <span class="pcx-mute">${b.rows.length}</span>
          </span>
        </td>
        <td class="is-right pcx-valor" style="color:${cor};">${this.fmt(b.amount)}</td>
        <td>${this.seloGrupo(b.fora, b.rows.length)}</td>
      </tr>`;
      if (aberto) b.rows.forEach((r) => { html += this.confLinhaHtml(r, cor); });
      return html;
    }).join("");
  },

  chaveConta(codigo) {
    const dotted = this.formatAccountCode(codigo);
    const partes = String(dotted || "").split(".").map(p => String(p).replace(/\D/g, "")).filter(Boolean);
    if (!partes.length) return "";
    return partes.map(p => String(Number(p))).join(".");
  },

  codigoDoNo(g) {
    const m = String((g && (g.code || g.name)) || "").match(/^(\d+(?:\.\d+)*)/);
    return m ? m[1] : "";
  },

  mapaContaNo() {
    const accToNode = {};
    const prefixos = [];
    ((this.visao().groups) || []).forEach(g => {
      if (!g || g.type === "formula") return;
      const cod = this.codigoDoNo(g);
      const chave = this.chaveConta(cod);
      if (chave) prefixos.push({ chave, id: g.id });
      (g.accounts || []).forEach(id => {
        const sid = String(id || "").trim();
        if (!sid) return;
        accToNode[sid] = g.id;
        const nk = this.normAccountKey(sid);
        if (nk) accToNode[nk] = g.id;
        const dotted = this.formatAccountCode(sid);
        if (dotted) accToNode[dotted] = g.id;
      });
    });
    prefixos.sort((a, b) => b.chave.length - a.chave.length);
    return { accToNode, prefixos };
  },

  arvorePlano(rows) {
    const groups = ((this.visao().groups) || []).filter(g => g && g.type !== "formula").map(g => ({
      id: g.id,
      parentId: g.parentId || "",
      code: this.codigoDoNo(g),
      name: g.name || "",
      contas: {}
    }));
    const byId = Object.fromEntries(groups.map(g => [g.id, g]));
    const mapa = this.mapaContaNo();
    const achar = (codigo, nome) => {
      const gid = this.noDfc(codigo, nome);
      if (gid && byId[gid]) return gid;
      const raw = String(codigo || "").trim();
      if (!raw || raw === "—") return "";
      const nk = this.normAccountKey(raw);
      const direto = mapa.accToNode[raw] || (nk && mapa.accToNode[nk]) || "";
      if (direto && byId[direto]) return direto;
      const chave = this.chaveConta(raw);
      if (!chave) return "";
      const hit = mapa.prefixos.find(p => chave === p.chave || chave.startsWith(p.chave + "."));
      return hit && byId[hit.id] ? hit.id : "";
    };
    const soltas = { id: "_soltas", parentId: "", code: "", name: "Sem conta no plano", contas: {} };
    (rows || []).forEach(r => {
      const principal = (r.contas || []).filter(c => c && c.codigo && c.codigo !== "—")
        .slice().sort((a, b) => (Number(b.valor) || 0) - (Number(a.valor) || 0))[0];
      const nid = principal ? achar(principal.codigo, principal.nome) : "";
      const node = (nid && byId[nid]) || soltas;
      const cod = principal ? String(principal.codigo) : "—";
      const bucket = node.contas[cod] || (node.contas[cod] = {
        codigo: cod, nome: principal ? (principal.nome || "") : "", rows: [], amount: 0, fora: 0
      });
      if (principal && principal.nome) bucket.nome = principal.nome;
      bucket.rows.push(r);
      const sinal = r.redutora ? -1 : 1;
      bucket.amount += (Number(r.total) || 0) * sinal;
      if (r.status === "fora") bucket.fora += 1;
    });
    const keep = new Set();
    groups.forEach(g => {
      if (!Object.keys(g.contas).length) return;
      keep.add(g.id);
      let cur = g;
      while (cur && cur.parentId && byId[cur.parentId]) {
        keep.add(cur.parentId);
        cur = byId[cur.parentId];
      }
    });
    const nos = groups.filter(g => keep.has(g.id));
    if (Object.keys(soltas.contas).length) nos.push(soltas);
    const roll = (node) => {
      const kids = nos.filter(c => c.parentId === node.id);
      let amount = 0, n = 0, fora = 0;
      Object.values(node.contas).forEach(b => {
        amount += b.amount;
        n += b.rows.length;
        fora += b.fora;
      });
      kids.forEach(ch => {
        const t = roll(ch);
        amount += t.amount;
        n += t.n;
        fora += t.fora;
      });
      node.amount = amount;
      node.n = n;
      node.fora = fora;
      return { amount, n, fora };
    };
    const ordem = (a, b) => String(a.code || a.codigo || "").localeCompare(String(b.code || b.codigo || ""), "pt-BR", { numeric: true });
    const raizes = nos.filter(g => !g.parentId || !nos.some(x => x.id === g.parentId)).sort(ordem);
    raizes.forEach(roll);
    return { nos, raizes };
  },

  grupoHtml(node, nos, level, cor, prefix) {
    const gid = (prefix ? prefix + ">" : "") + node.id;
    const aberto = this.gruposAbertos.has(gid);
    const kids = nos.filter(c => c.parentId === node.id)
      .sort((a, b) => String(a.code).localeCompare(String(b.code), "pt-BR", { numeric: true }));
    const contas = Object.values(node.contas)
      .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "pt-BR", { numeric: true }));
    const pad = 16 + level * 16;
    let html = `<tr class="pcx-grupo" onclick="PrestacaoContasApp.toggleGrupo('${this.esc(gid)}')">
      <td colspan="6">
        <span class="pcx-grupo-nome" style="padding-left:${pad}px">
          <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}" class="pcx-chev"></i>
          <strong>${this.esc(node.name)}</strong>
          <span class="pcx-mute">${node.n} lançamento(s)</span>
        </span>
      </td>
      <td class="is-right pcx-valor" style="color:${cor};">${this.fmt(node.amount)}</td>
      <td>${this.seloGrupo(node.fora, node.n)}</td>
    </tr>`;
    if (!aberto) return html;
    kids.forEach(ch => { html += this.grupoHtml(ch, nos, level + 1, cor, prefix); });
    contas.forEach(b => {
      const cid = gid + "|" + b.codigo;
      const a2 = this.gruposAbertos.has(cid);
      html += `<tr class="pcx-grupo is-conta" onclick="PrestacaoContasApp.toggleGrupo('${this.esc(cid)}')">
        <td colspan="6">
          <span class="pcx-grupo-nome" style="padding-left:${pad + 16}px">
            <i data-lucide="${a2 ? "chevron-down" : "chevron-right"}" class="pcx-chev"></i>
            <span class="pcx-cod">${this.esc(b.codigo)}</span>
            <strong>${this.esc(b.nome || "Conta")}</strong>
            <span class="pcx-mute">${b.rows.length}</span>
          </span>
        </td>
        <td class="is-right pcx-valor" style="color:${cor};">${this.fmt(b.amount)}</td>
        <td>${this.seloGrupo(b.fora, b.rows.length)}</td>
      </tr>`;
      if (a2) b.rows.forEach(r => { html += this.confLinhaHtml(r, cor); });
    });
    return html;
  },

  confLinhaHtml(r, cor) {
    const aberta = this.confAberta === r.key;
    const tit = r.titulo ? `${r.titulo}${r.parcela ? " / " + r.parcela : ""}` : "—";
    const semRateio = r.status === "na";
    const lancado = semRateio ? "—" : this.textoCentros(r.linhas, "atual");
    const padrao = semRateio ? "—" : this.textoCentros(r.linhas, "esperado");
    const contaTxt = [r.contaBanco, r.contaNome].filter(Boolean).join(" · ") || "—";
    const valor = (Number(r.total) || 0) * (r.redutora ? -1 : 1);
    let html = `<tr class="pcx-row is-${r.status}${aberta ? " is-open" : ""}" onclick="PrestacaoContasApp.toggleConf('${this.esc(r.key)}')">
      <td>${this.dataBr(r.data)}</td>
      <td class="pcx-tit"><i data-lucide="${aberta ? "chevron-down" : "chevron-right"}" class="pcx-chev"></i>${this.esc(tit)}</td>
      <td class="cc-nome">${this.esc(r.historico)}${r.pessoa ? `<div class="pcx-pessoa">${this.esc(r.pessoa)}</div>` : ""}</td>
      <td>${this.esc(contaTxt)}</td>
      <td title="${this.esc(lancado)}">${lancado}</td>
      <td title="${this.esc(padrao)}">${padrao}</td>
      <td class="is-right pcx-valor" style="color:${cor};">${this.fmt(valor)}</td>
      <td>${this.seloRateio(r.status, r.motivo, !!r.distratoNota)}</td>
    </tr>`;
    if (aberta) html += `<tr class="pcx-det-row"><td colspan="8">${this.confDetalheHtml(r)}</td></tr>`;
    return html;
  },

  confDetalheHtml(r) {
    const info = [
      ["Data", this.dataBr(r.data)],
      ["Título", r.titulo || "—"],
      ["Parcela", r.parcela || "—"],
      ["Documento", r.documento || "—"],
      ["Cliente / credor", r.pessoa || "—"],
      ["Conta bancária", r.contaBanco || "—"]
    ];
    const aviso = r.distratoNota
      ? r.distratoNota
      : (r.status === "na"
      ? (r.guia
        ? "Nenhuma nota de origem desta guia tem plano financeiro que entra no rateio da parceria, por isso o imposto não vai para o parceiro."
        : "Este lançamento não entra no rateio da parceria: nenhuma conta dele está amarrada nas Configurações. Não há nada a conferir.")
      : (r.foraTotal > 0.004
        ? (r.guia
          ? `${this.fmt(r.foraTotal)} do imposto vêm de notas cujo plano financeiro não entra no rateio e ficaram fora.`
          : `${this.fmt(r.foraTotal)} em contas que não entram no rateio ficaram fora da conferência.`)
        : ""));
    const g = r.guia;
    const configHtml = (c) => c.amarrada
      ? '<span class="pcx-selo is-ok">Entra no rateio</span>'
      : `<span class="pcx-selo is-na">${this.esc(c.motivo || "Fora da configuração")}</span>`;
    let guiaHtml = "";
    if (g) {
      const pago = Number(g.pagoAlvo) || 0;
      const soma = Number(g.somaOrigens) || 0;
      const dif = soma - pago;
      const temDif = Math.abs(dif) > 0.05;
      const lista = (r.contas || []).filter(c => c.origem)
        .sort((a, b) => String(a.origem.billId).localeCompare(String(b.origem.billId), "pt-BR", { numeric: true }));
      const nTitulos = new Set(lista.map(c => String(c.origem.billId))).size;
      const totalGuia = lista.reduce((s, c) => s + c.valor, 0);
      const origens = lista.map(c => `<tr>
        <td class="pcx-orig-tit">${this.esc(c.origem.billId || "—")}</td>
        <td class="pcx-orig-doc">${this.esc(c.origem.doc || "—")}</td>
        <td class="pcx-nowrap">${c.origem.emissao ? this.dataBr(c.origem.emissao) : "—"}</td>
        <td>${this.esc(c.origem.credor)}</td>
        <td class="is-center">${this.esc(c.origem.imposto)}</td>
        <td><span class="pcx-cod">${this.esc(c.codigo)}</span> ${this.esc(c.nome)}</td>
        <td class="is-center">${this.esc(c.cc)}</td>
        <td class="is-right">${this.fmt(c.valor)}</td>
        <td>${configHtml(c)}</td>
      </tr>`).join("");
      guiaHtml = `
        <div class="pcx-det-sec">
          <div class="pcx-det-head">
            <div class="pcx-det-tit">Origem do imposto</div>
            <span class="pcx-det-sub">Guia unificada <strong>${this.esc(g.doc)}</strong>. O imposto foi distribuído pelas notas fiscais de origem e vai para o parceiro só o das notas cujo plano financeiro entra no rateio.</span>
          </div>
          <div class="pcx-guia-resumo">
            <div><span>Títulos de origem</span><strong>${nTitulos}</strong></div>
            <div><span>Imposto das notas nestes centros</span><strong>${this.fmt(soma)}</strong></div>
            <div><span>Pago pela guia nestes centros</span><strong>${this.fmt(pago)}</strong></div>
            <div class="${temDif ? "is-warn" : "is-ok"}"><span>Diferença</span><strong>${temDif ? this.fmt(Math.abs(dif)) : "Fechou"}</strong></div>
          </div>
          ${temDif ? `<div class="pcx-det-aviso is-warn">A diferença de ${this.fmt(Math.abs(dif))} foi distribuída na mesma proporção das notas. A guia pode ter sido ajustada à mão no Sienge.</div>` : ""}
          <table class="pcx-mini">
            <thead><tr><th>Título</th><th>Nota</th><th>Emissão</th><th>Credor</th><th class="is-center">Imposto</th><th>Plano financeiro da nota</th><th class="is-center">C.C.</th><th class="is-right">Valor nesta guia</th><th>Configuração</th></tr></thead>
            <tbody>${origens || '<tr><td colspan="9" class="pcx-mute">Nenhuma nota de origem encontrada</td></tr>'}</tbody>
            ${lista.length > 1 ? `<tfoot><tr><td colspan="7">Total</td><td class="is-right">${this.fmt(totalGuia)}</td><td></td></tr></tfoot>` : ""}
          </table>
        </div>`;
    }
    const contasLista = (r.contas || []).filter(c => !c.origem);
    const contas = contasLista.map(c => `<tr>
      <td class="pcx-cod">${this.esc(c.codigo)}</td>
      <td>${this.esc(c.nome)}</td>
      <td>${this.esc(c.cc)}${c.ccNome ? ` · ${this.esc(c.ccNome)}` : ""}</td>
      <td class="is-right">${this.fmt(c.valor)}</td>
      <td>${configHtml(c)}</td>
    </tr>`).join("");
    const linhas = r.linhas || [];
    const centros = linhas.map(l => {
      const dif = l.esperado == null ? null : l.atual - l.esperado;
      const ruim = dif != null && Math.abs(dif) >= 0.06;
      return `<tr>
        <td>${this.esc(l.id)}${l.nome ? ` · ${this.esc(l.nome)}` : ""}</td>
        <td class="is-right">${this.fmt(l.valor)}</td>
        <td class="is-right">${this.fmtPct(l.atual)}</td>
        <td class="is-right">${l.esperado == null ? "—" : this.fmtPct(l.esperado)}</td>
        <td class="is-right${ruim ? " pcx-dif" : " pcx-dif-ok"}">${dif == null ? "—" : (dif > 0 ? "+" : "") + this.fmtPct(dif)}</td>
      </tr>`;
    }).join("");
    const somaCentros = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    const temPadrao = linhas.some(l => l.esperado != null);
    const blocoContas = g && !contas ? "" : `<div>
          <div class="pcx-det-tit">Plano financeiro</div>
          <table class="pcx-mini">
            <thead><tr><th>Código</th><th>Conta</th><th>Centro de custo</th><th class="is-right">Valor</th><th>Configuração</th></tr></thead>
            <tbody>${contas || '<tr><td colspan="5" class="pcx-mute">Sem contas</td></tr>'}</tbody>
          </table>
        </div>`;
    const blocoCentros = centros ? `<div>
          <div class="pcx-det-tit">Rateio nos centros</div>
          <table class="pcx-mini">
            <thead><tr><th>Centro</th><th class="is-right">Valor</th><th class="is-right">Lançado</th><th class="is-right">Padrão</th><th class="is-right">Diferença</th></tr></thead>
            <tbody>${centros}</tbody>
            ${linhas.length > 1 ? `<tfoot><tr><td>Total</td><td class="is-right">${this.fmt(somaCentros)}</td><td class="is-right">${this.fmtPct(100)}</td><td class="is-right">${temPadrao ? this.fmtPct(linhas.reduce((s, l) => s + (Number(l.esperado) || 0), 0)) : "—"}</td><td></td></tr></tfoot>` : ""}
          </table>
        </div>` : "";
    return `<div class="pcx-det">
      <div class="pcx-det-info">
        ${info.map(([k, v]) => `<div><span>${k}</span><strong>${this.esc(v)}</strong></div>`).join("")}
      </div>
      ${aviso ? `<div class="pcx-det-aviso${r.status === "na" ? " is-na" : ""}">${aviso}</div>` : ""}
      ${guiaHtml}
      ${blocoContas || blocoCentros ? `<div class="pcx-det-grid pcx-det-sec${blocoContas && blocoCentros ? "" : " is-uma"}">${blocoContas}${blocoCentros}</div>` : ""}
    </div>`;
  },

  chaveDash() {
    const pad = (n) => String(n).padStart(2, "0");
    return [this.companyIds.join(","), this.costCenterIds.join(","), this.year + "-" + pad(this.month)].join("|");
  },

  periodoMes() {
    const y = this.year;
    const m = this.month;
    const pad = (n) => String(n).padStart(2, "0");
    const last = new Date(y, m, 0).getDate();
    return { start: y + "-" + pad(m) + "-01", end: y + "-" + pad(m) + "-" + pad(last) };
  },

  thDash(rot, key, right) {
    return `<th class="${right ? "is-right" : ""}" onclick="PrestacaoContasApp.ordenarDash('${key}')" style="cursor:pointer;user-select:none;">${rot} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
  },

  ordenarLista(lista, prefix, pick) {
    const key = this.dashSort.key;
    if (!key || key.indexOf(prefix + ".") !== 0 || !pick[key]) return lista;
    const dir = this.dashSort.dir || 1;
    const fn = pick[key];
    return lista.slice().sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va == null ? "" : va).localeCompare(String(vb == null ? "" : vb), "pt-BR", { numeric: true }) * dir;
    });
  },

  kpisHtml(itens) {
    return `<div class="pcx-kpis">${itens.map((k) => `<div class="pcx-kpi"><span>${k.rot}</span><strong class="${k.cls || ""}">${k.val}</strong><small>${k.nota || ""}</small></div>`).join("")}</div>`;
  },

  blocoHtml(titulo, nota, corpo) {
    return `<section class="pcx-bloco"><div class="pcx-bloco-tit">${titulo}${nota ? `<span>${nota}</span>` : ""}</div>${corpo}</section>`;
  },

  painelHtml(aba) {
    if (!this.costCenterIds.length) {
      return `<div class="pcx-alert is-warn">Selecione ao menos um centro de custo.</div>`;
    }
    const d = this.dash;
    const chave = this.chaveDash();
    const campo = aba === "inad" ? "carteira" : aba;
    const pronto = d && d.chave === chave && d[campo] && d.loading !== aba;
    if (!pronto) {
      if (d && d.chave === chave && d.erro && !d.loading) {
        return `<div class="pcx-alert is-error">${this.esc(d.erro)}</div>`;
      }
      const msg = (d && d.chave === chave && d.msg) || "Consultando o Sienge…";
      return `<div class="pcx-alert is-info"><span class="pcx-spin"></span><span id="pc-dash-msg">${this.esc(msg)}</span></div>`;
    }
    if (aba === "vendas") return this.vendasHtml(d.vendas);
    if (aba === "estoque") return this.estoqueHtml(d.estoque);
    if (aba === "carteira") return this.carteiraHtml(d.carteira);
    return this.inadHtml(d.carteira);
  },

  async paginarSienge(base) {
    const fn = window.siengeFetchWithRetry;
    if (typeof fn !== "function") throw new Error("Consulta ao Sienge indisponível.");
    let out = [];
    let offset = 0;
    for (let g = 0; g < 40; g++) {
      const sep = base.indexOf("?") >= 0 ? "&" : "?";
      const res = await fn(base + sep + "limit=200&offset=" + offset);
      const rs = (res && res.results) || [];
      out = out.concat(rs);
      if (rs.length < 200) break;
      offset += 200;
    }
    return out;
  },

  avisoDash(txt) {
    this.dash.msg = txt;
    const el = document.getElementById("pc-dash-msg");
    if (el) el.textContent = txt;
  },

  async carregarPainel(qual) {
    if (!this.costCenterIds.length) return;
    const chave = this.chaveDash();
    const pronto = this.dash && this.dash.chave === chave && !this.dash.loading;
    if (pronto && qual === "vendas" && this.dash.vendas) return;
    if (pronto && qual === "estoque" && this.dash.estoque) return;
    if (pronto && (qual === "carteira" || qual === "inad") && this.dash.carteira) return;
    const gen = ++this.dashGen;
    const anterior = this.dash && this.dash.chave === chave ? this.dash : { chave };
    this.dash = Object.assign({}, anterior, { chave, loading: qual, erro: "", msg: "Consultando o Sienge…" });
    this.render();
    try {
      if (qual === "vendas") await this.buscarVendasPainel(gen);
      else if (qual === "estoque") await this.buscarEstoquePainel(gen);
      else await this.buscarCarteiraPainel(gen);
    } catch (e) {
      if (gen !== this.dashGen) return;
      this.dash.loading = "";
      this.dash.erro = (e && e.message) || "Falha ao consultar o Sienge.";
      this.render();
    }
  },

  async buscarVendasPainel(gen) {
    const p = this.periodoMes();
    const slim = (c) => {
      const units = c.salesContractUnits || c.units || [];
      const cust = (c.salesContractCustomers || [])[0] || {};
      const base = (window.MarketingBudgetApp && typeof MarketingBudgetApp.slimVenda === "function")
        ? MarketingBudgetApp.slimVenda(c)
        : {
          id: String(c.id),
          numero: c.number || c.contractNumber || String(c.id),
          data: String(c.issueDate || "").slice(0, 10),
          dataCancel: String(c.cancellationDate || "").slice(0, 10),
          unidadeNomes: units.map((u) => u.name).filter(Boolean).join(", "),
          cliente: cust.name || "",
          valor: Number(c.totalSellingValue || c.value || 0) || 0,
          situacao: String(c.situation) === "3" ? "Cancelado" : (String(c.situation) === "4" ? "Quitado" : "Emitido")
        };
      base.parcelas = this.planoParcelas(c);
      base.motivo = this.motivoCancel(c);
      return base;
    };
    const vendas = [];
    const distratos = [];
    const vistos = new Set();
    const dVistos = new Set();
    for (const cc of this.costCenterIds) {
      if (gen !== this.dashGen) return;
      this.avisoDash("Lendo vendas de " + cc + "…");
      const q = "enterpriseId=" + encodeURIComponent(cc);
      const [emitidos, cancelados, quitados, dist] = await Promise.all([
        this.paginarSienge("/sales-contracts?" + q + "&situation=2&initialIssueDate=" + p.start + "&finalIssueDate=" + p.end),
        this.paginarSienge("/sales-contracts?" + q + "&situation=3&initialIssueDate=" + p.start + "&finalIssueDate=" + p.end),
        this.paginarSienge("/sales-contracts?" + q + "&situation=4&initialIssueDate=" + p.start + "&finalIssueDate=" + p.end),
        this.paginarSienge("/sales-contracts?" + q + "&situation=3&initialCancelDate=" + p.start + "&finalCancelDate=" + p.end)
      ]);
      emitidos.concat(cancelados, quitados).forEach((c) => {
        const id = String(c && c.id != null ? c.id : "");
        if (!id || vistos.has(id)) return;
        if (c.enterpriseId && String(c.enterpriseId) !== String(cc)) return;
        vistos.add(id);
        vendas.push(Object.assign(slim(c), { cc }));
      });
      dist.forEach((c) => {
        const id = String(c && c.id != null ? c.id : "");
        if (!id || dVistos.has(id)) return;
        if (c.enterpriseId && String(c.enterpriseId) !== String(cc)) return;
        dVistos.add(id);
        distratos.push(Object.assign(slim(c), { cc }));
      });
    }
    if (gen !== this.dashGen) return;
    this.dash.vendas = { vendas, distratos, periodo: p };
    this.dash.loading = "";
    if (!this.loading) this.render();
  },

  vendasHtml(pack) {
    const vendas = (pack && pack.vendas) || [];
    const distratos = (pack && pack.distratos) || [];
    const vgv = vendas.reduce((s, v) => s + (Number(v.valor) || 0), 0);
    const vgvD = distratos.reduce((s, v) => s + (Number(v.valor) || 0), 0);
    const liq = vgv - vgvD;
    const ticket = vendas.length ? vgv / vendas.length : 0;
    const planos = vendas.map((v) => Number(v.parcelas) || 0).filter((n) => n > 0);
    const planoMedio = planos.length ? planos.reduce((s, n) => s + n, 0) / planos.length : 0;
    const motivos = this.motivosDistrato(distratos);
    const p = (pack && pack.periodo) || this.periodoMes();
    const pick = {
      "venda.numero": (x) => x.numero,
      "venda.data": (x) => x.data || "",
      "venda.cliente": (x) => x.cliente || "",
      "venda.unidade": (x) => x.unidadeNomes || "",
      "venda.cc": (x) => x.cc || "",
      "venda.valor": (x) => Number(x.valor) || 0,
      "venda.sit": (x) => x.situacao || ""
    };
    const lista = this.ordenarLista(vendas, "venda", pick);
    const dist = this.ordenarLista(distratos, "dist", {
      "dist.numero": (x) => x.numero,
      "dist.data": (x) => x.dataCancel || x.data || "",
      "dist.cliente": (x) => x.cliente || "",
      "dist.unidade": (x) => x.unidadeNomes || "",
      "dist.cc": (x) => x.cc || "",
      "dist.valor": (x) => Number(x.valor) || 0
    });
    const linha = (v, cancel) => `<tr>
      <td>${this.esc(v.numero)}</td>
      <td>${this.dataBr(cancel ? (v.dataCancel || v.data) : v.data)}</td>
      <td>${this.esc(v.cliente || "—")}</td>
      <td>${this.esc(v.unidadeNomes || "—")}</td>
      <td>${this.esc(v.cc || "—")}</td>
      <td class="is-right pcx-valor">${this.fmt(v.valor)}</td>
      ${cancel ? `<td>${this.esc(v.motivo || "Não informado")}</td>` : `<td>${this.esc(v.situacao || "—")}</td><td class="is-right">${v.parcelas ? String(v.parcelas) : "—"}</td>`}
    </tr>`;
    const head = (pref, cancel) => this.thDash("Contrato", pref + ".numero") + this.thDash(cancel ? "Cancelamento" : "Emissão", pref + ".data") + this.thDash("Cliente", pref + ".cliente") + this.thDash("Unidade", pref + ".unidade") + this.thDash("Centro", pref + ".cc") + this.thDash("Valor", pref + ".valor", true) + (cancel ? "<th>Motivo</th>" : this.thDash("Situação", pref + ".sit") + "<th class=\"is-right\">Parcelas</th>");
    const motivoTabela = `<div class="cc-scroll pcx-dash-scroll"><table class="cc-table pcx-table"><thead><tr><th>Motivo</th><th class="is-right">Contratos</th><th class="is-right">VGV</th></tr></thead><tbody>${motivos.map((m) => `<tr><td>${this.esc(m.motivo)}</td><td class="is-right">${m.qtd}</td><td class="is-right pcx-valor">${this.fmt(m.vgv)}</td></tr>`).join("") || `<tr><td colspan="3" class="pcx-vazio">Nenhum distrato neste mês.</td></tr>`}</tbody></table></div>`;
    return `
      ${this.kpisHtml([
        { rot: "Vendas", val: String(vendas.length), nota: "Emitidas no mês", cls: "is-in" },
        { rot: "Distratos", val: String(distratos.length), nota: "Cancelados no mês", cls: "is-out" },
        { rot: "Ticket médio", val: this.fmt(ticket), nota: "VGV das vendas dividido pela quantidade" },
        { rot: "Plano médio", val: planoMedio ? planoMedio.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " parcelas" : "—", nota: "Média das parcelas mensais do contrato" },
        { rot: "VGV líquido", val: this.fmt(liq), nota: "Vendas menos distratos", cls: liq < -0.004 ? "is-out" : "is-in" }
      ])}
      <p class="pcx-ajuda">Contratos dos centros selecionados com emissão ou cancelamento entre ${this.dataBr(p.start)} e ${this.dataBr(p.end)}.</p>
      ${this.blocoHtml("Vendas", vendas.length + " contrato(s)", `<div class="cc-scroll pcx-dash-scroll"><table class="cc-table pcx-table"><thead><tr>${head("venda", false)}</tr></thead><tbody>${lista.map((v) => linha(v, false)).join("") || `<tr><td colspan="8" class="pcx-vazio">Nenhuma venda neste mês.</td></tr>`}</tbody></table></div>`)}
      ${this.blocoHtml("Motivos de cancelamento", motivos.length + " motivo(s)", motivoTabela)}
      ${this.blocoHtml("Distratos", distratos.length + " contrato(s)", `<div class="cc-scroll pcx-dash-scroll"><table class="cc-table pcx-table"><thead><tr>${head("dist", true)}</tr></thead><tbody>${dist.map((v) => linha(v, true)).join("") || `<tr><td colspan="7" class="pcx-vazio">Nenhum distrato neste mês.</td></tr>`}</tbody></table></div>`)}
    `;
  },

  async buscarEstoquePainel(gen) {
    const est = window.EstoqueComercialApp;
    const units = [];
    for (const cc of this.costCenterIds) {
      if (gen !== this.dashGen) return;
      this.avisoDash("Lendo estoque de " + cc + "…");
      const nome = this.ccNome(cc);
      const pagina = await this.paginarSienge("/units?enterpriseId=" + encodeURIComponent(cc) + "&additionalData=NONE");
      pagina.forEach((u) => {
        if (u && u.enterpriseId && String(u.enterpriseId) !== String(cc)) return;
        const slim = est && typeof est.slimUnit === "function" ? est.slimUnit(u, nome) : {
          id: u.id,
          name: u.name || "",
          enterpriseId: String(cc),
          commercialStock: String(u.commercialStock || "").toUpperCase(),
          contractNumber: u.contractNumber || u.currentSalesContractNumber || "",
          outstandingBalance: Number(u.outstandingBalance) || 0
        };
        units.push(slim);
      });
    }
    if (gen !== this.dashGen) return;
    this.dash.estoque = units;
    this.dash.loading = "";
    if (!this.loading) this.render();
  },

  estoqueHtml(units) {
    const lista0 = units || [];
    const est = window.EstoqueComercialApp;
    const rotulo = (code) => (est && typeof est.mapStock === "function" ? est.mapStock(code) : (code || "Sem status"));
    const contagem = {};
    lista0.forEach((u) => {
      const r = rotulo(u.commercialStock);
      contagem[r] = (contagem[r] || 0) + 1;
    });
    const n = (nome) => contagem[nome] || 0;
    const pick = {
      "un.id": (x) => x.id,
      "un.nome": (x) => x.name || "",
      "un.cc": (x) => x.enterpriseId || "",
      "un.sit": (x) => rotulo(x.commercialStock),
      "un.contrato": (x) => x.contractNumber || "",
      "un.saldo": (x) => Number(x.outstandingBalance) || 0
    };
    const lista = this.ordenarLista(lista0, "un", pick);
    const saldo = lista0.reduce((s, u) => s + (Number(u.outstandingBalance) || 0), 0);
    return `
      ${this.kpisHtml([
        { rot: "Unidades", val: String(lista0.length), nota: "Cadastro atual" },
        { rot: "Disponíveis", val: String(n("Disponível")), nota: "Prontas para venda", cls: "is-in" },
        { rot: "Vendidas", val: String(n("Vendida") + n("Vendida em pré-contrato")), nota: "Inclui pré-contrato" },
        { rot: "Reservadas", val: String(n("Reservada") + n("Reserva técnica") + n("Proposta")), nota: "Reserva, técnica e proposta" },
        { rot: "Saldo em aberto", val: this.fmt(saldo), nota: "Outstanding das unidades", cls: saldo > 0.004 ? "is-out" : "" }
      ])}
      <p class="pcx-ajuda">Posição atual do estoque comercial. ${Object.keys(contagem).map((k) => k + ": " + contagem[k]).join(" · ") || "Nenhuma unidade."}</p>
      ${this.blocoHtml("Unidades", lista0.length + " linha(s)", `<div class="cc-scroll pcx-dash-scroll"><table class="cc-table pcx-table"><thead><tr>${this.thDash("Id", "un.id")}${this.thDash("Unidade", "un.nome")}${this.thDash("Centro", "un.cc")}${this.thDash("Situação", "un.sit")}${this.thDash("Contrato", "un.contrato")}${this.thDash("Saldo", "un.saldo", true)}</tr></thead><tbody>${lista.map((u) => `<tr><td>${this.esc(u.id)}</td><td>${this.esc(u.name || "—")}</td><td>${this.esc(u.enterpriseId || "—")}</td><td>${this.esc(rotulo(u.commercialStock))}</td><td>${this.esc(u.contractNumber || "—")}</td><td class="is-right pcx-valor">${u.outstandingBalance ? this.fmt(u.outstandingBalance) : "—"}</td></tr>`).join("") || `<tr><td colspan="6" class="pcx-vazio">Nenhuma unidade nestes centros.</td></tr>`}</tbody></table></div>`)}
    `;
  },

  async buscarCarteiraPainel(gen) {
    const est = window.EstoqueComercialApp;
    if (!est || typeof est.fetchExtratoCc !== "function" || typeof est.agruparExtratoCc !== "function") {
      throw new Error("O extrato de contas a receber não está disponível nesta sessão.");
    }
    const rows = [];
    for (const cc of this.costCenterIds) {
      if (gen !== this.dashGen) return;
      this.avisoDash("Lendo carteira de " + cc + "…");
      const parte = await est.fetchExtratoCc(cc);
      (parte || []).forEach((r) => rows.push(Object.assign({}, r, { _cc: String(cc) })));
    }
    if (gen !== this.dashGen) return;
    this.dash.carteira = est.agruparExtratoCc(rows);
    this.dash.loading = "";
    if (!this.loading) this.render();
  },

  async carregarPaineis() {
    if (!this.costCenterIds.length) return;
    const gen = this.dashGen;
    const chave = this.chaveDash();
    this.dash = { chave, loading: "todos", erro: "", msg: "" };
    const etapas = [
      ["Carregando títulos…", 36, () => this.buscarVendasPainel(gen)],
      ["Consultando estoque…", 62, () => this.buscarEstoquePainel(gen)],
      ["Analisando carteira…", 84, () => this.buscarCarteiraPainel(gen)]
    ];
    for (const [txt, pct, fn] of etapas) {
      if (gen !== this.dashGen) return;
      this.setLoad(txt, pct);
      try {
        await fn();
      } catch (e) {
        if (gen !== this.dashGen) return;
        console.error("[Prestação de Contas]", txt, e);
        if (this.dash) {
          this.dash.loading = "";
          this.dash.erro = (e && e.message) || "Falha ao consultar o Sienge.";
        }
      }
    }
    if (gen !== this.dashGen || !this.dash) return;
    this.dash.loading = "";
    this.setLoad("Analisando carteira…", 100);
  },

  ccsDoParceiro() {
    const ids = (this.costCenterIds || []).map(String);
    const cat = this.costCenters();
    const app = window.CentrosCustoApp;
    const marcados = ids.filter((id) => {
      const cc = cat.find((c) => String(c.id) === id);
      if (!cc) return false;
      if (app && typeof app.isParceiro === "function") return app.isParceiro(cc);
      return /parce(ir|ri)/i.test(String(cc.name || ""));
    });
    if (marcados.length) return marcados;
    const irmaos = ids.filter((id) => !/00$/.test(id));
    return irmaos.length ? irmaos : ids;
  },

  nomeCurtoObra(obra) {
    const nome = this.nomeObra(obra);
    const pedacos = String(nome).split(/\s[-–]\s/);
    return pedacos[pedacos.length - 1] || nome || "Obra";
  },

  serieTempo() {
    const pack = this.dash && this.dash.carteira;
    if (!pack) return null;
    const parceiro = new Set(this.ccsDoParceiro());
    const porAno = new Map();
    const obras = new Map();
    (pack.bills || []).forEach((b) => {
      Object.values(b.parcelas || {}).forEach((partes) => {
        const base = Object.values(partes || {})[0] || {};
        const ano = String(base.dueDate || "").slice(0, 4);
        if (!/^\d{4}$/.test(ano)) return;
        Object.entries(partes || {}).forEach(([cc, inst]) => {
          if (!parceiro.has(String(cc))) return;
          const saldo = Number(inst && inst.currentBalance != null ? inst.currentBalance : 0) || 0;
          if (saldo <= 0.009) return;
          const obra = this.chaveObra(cc);
          if (!obras.has(obra)) obras.set(obra, this.nomeCurtoObra(obra));
          if (!porAno.has(ano)) porAno.set(ano, new Map());
          const m = porAno.get(ano);
          m.set(obra, (m.get(obra) || 0) + saldo);
        });
      });
    });
    const anosNum = [...porAno.keys()].map(Number).sort((a, b) => a - b);
    if (!anosNum.length) return { anos: [], obras: [] };
    const anos = [];
    for (let y = anosNum[0]; y <= anosNum[anosNum.length - 1]; y++) anos.push(String(y));
    const lista = [...obras.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
    return {
      anos,
      obras: lista.map(([id, nome]) => ({
        id,
        nome,
        valores: anos.map((ano) => (porAno.get(ano) && porAno.get(ano).get(id)) || 0)
      }))
    };
  },

  desenharTempo() {
    const canvas = document.getElementById("pc-chart-tempo");
    if (!canvas || typeof Chart === "undefined") return;
    if (this._chartTempo) {
      this._chartTempo.destroy();
      this._chartTempo = null;
    }
    const serie = this.serieTempo();
    if (!serie || !serie.anos.length) return;
    const cores = ["#105436", "#dc2626", "#f37021", "#14532d", "#0f766e", "#b45309"];
    const fmtMi = (v) => (Number(v) / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " Mi";
    this._chartTempo = new Chart(canvas, {
      type: "bar",
      data: {
        labels: serie.anos,
        datasets: serie.obras.map((o, i) => ({
          label: o.nome,
          data: o.valores,
          backgroundColor: cores[i % cores.length],
          stack: "receber",
          maxBarThickness: 46
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 22 } },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: (c) => " " + c.dataset.label + ": " + fmtMi(c.parsed.y || 0) } }
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            ticks: { callback: (v) => (Number(v) / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " Mi" }
          }
        }
      },
      plugins: [{
        id: "pcxTopo",
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          ctx.save();
          ctx.fillStyle = "#334155";
          ctx.font = "600 11px sans-serif";
          ctx.textAlign = "center";
          serie.anos.forEach((_, i) => {
            let soma = 0;
            let y = null;
            let x = null;
            serie.obras.forEach((_, di) => {
              soma += Number(chart.data.datasets[di].data[i]) || 0;
              const bar = chart.getDatasetMeta(di).data[i];
              if (!bar) return;
              if (y == null || bar.y < y) y = bar.y;
              x = bar.x;
            });
            if (soma > 0.5 && y != null && x != null) ctx.fillText(fmtMi(soma), x, y - 6);
          });
          ctx.restore();
        }
      }]
    });
  },

  nomeObra(id) {
    const rot = this.rotuloObra(id || "");
    return String(rot).replace(/^\d+\s*[-–]\s*/, "") || rot || "Sem obra";
  },

  medirTitulo(b) {
    const p = this.periodoMes();
    let recebidoMes = 0;
    const ccs = [];
    Object.values(b.parcelas || {}).forEach((partes) => {
      Object.keys(partes || {}).forEach((cc) => {
        if (cc && ccs.indexOf(cc) < 0) ccs.push(cc);
        const parc = partes[cc];
        ((parc && parc.receipts) || []).forEach((rc) => {
          if (/distrat|cancel|reparcel|repactu/i.test(String(rc && rc.type || ""))) return;
          const d = String((rc && (rc.date || rc.receiptDate || rc.paymentDate)) || "").slice(0, 10);
          if (d >= p.start && d <= p.end) recebidoMes += Number(rc.netReceipt != null ? rc.netReceipt : rc.value) || 0;
        });
      });
    });
    const cc = ccs[0] || "";
    const obra = cc ? this.chaveObra(cc) : "";
    const aberto = Number(b.aberto) || 0;
    const vencido = Number(b.vencido) || 0;
    const unidade = (b.units || []).map((u) => u.name).filter(Boolean).sort((a, c) => a.localeCompare(c, "pt-BR", { numeric: true })).join(", ");
    return {
      cc,
      obra,
      obraNome: obra ? this.nomeObra(obra) : "Sem obra",
      unidade,
      status: aberto > 0.009 ? "Ativo" : "Quitado",
      recebidoMes,
      aVencer: Math.max(0, aberto - vencido),
      vencido
    };
  },

  loteTransferido(u) {
    const code = String((u && u.commercialStock) || "").trim().toUpperCase();
    if (code === "T") return true;
    const est = window.EstoqueComercialApp;
    const rot = est && typeof est.mapStock === "function" ? est.mapStock(code) : "";
    return /transfer/i.test(String(rot || ""));
  },

  anelLotes(bills) {
    const ativosIds = new Set();
    const titulosAtivos = new Set();
    (bills || []).forEach((b) => {
      if ((Number(b.aberto) || 0) <= 0.009) return;
      titulosAtivos.add(String(b.id));
      (b.units || []).forEach((u) => {
        if (u && u.id != null) ativosIds.add(String(u.id));
      });
    });
    const grupos = {};
    ((this.dash && this.dash.estoque) || []).forEach((u) => {
      if (!u || this.loteTransferido(u)) return;
      const obra = this.chaveObra(u.enterpriseId);
      const g = grupos[obra] || (grupos[obra] = { obraNome: this.nomeObra(obra), total: 0, ativos: 0 });
      g.total += 1;
      const saldo = Number(u.outstandingBalance) > 0.009;
      const noTitulo = ativosIds.has(String(u.id)) || (u.receivableBillId && titulosAtivos.has(String(u.receivableBillId)));
      if (saldo || noTitulo) g.ativos += 1;
    });
    return Object.values(grupos).sort((a, b) => a.obraNome.localeCompare(b.obraNome, "pt-BR", { numeric: true }));
  },

  graficoCarteiraHtml(bills) {
    const cores = ["#105436", "#f37021", "#c2410c", "#14532d"];
    const cards = this.anelLotes(bills).map((g, i) => {
      const ativos = g.ativos;
      const demais = g.total - ativos;
      const total = g.total;
      const pAt = total ? (ativos / total) * 100 : 0;
      const pQ = total ? Math.round((demais / total) * 100) : 0;
      const pA = total ? Math.round(pAt) : 0;
      const cor = cores[i % cores.length];
      return `<article class="pcx-don">
        <h3>${this.esc(g.obraNome)}</h3>
        <div class="pcx-don-anel">
          <div class="pcx-don-ring" style="background:conic-gradient(${cor} 0 ${pAt.toFixed(2)}%, #c5cdd6 ${pAt.toFixed(2)}% 100%)"></div>
          ${ativos ? `<span class="pcx-don-tag is-ativo">${ativos} (${pA}%)</span>` : ""}
          ${demais ? `<span class="pcx-don-tag is-quit">${demais} (${pQ}%)</span>` : ""}
          <div class="pcx-don-hole"><strong>${total}</strong><span>Lotes</span></div>
        </div>
        <div class="pcx-don-leg">
          <span><i style="background:#c5cdd6"></i>Sem parcela a pagar ${demais} (${pQ}%)</span>
          <span><i style="background:${cor}"></i>Carteira ativa ${ativos} (${pA}%)</span>
        </div>
      </article>`;
    }).join("");
    if (!cards) return "";
    return `<div class="pcx-don-titulo">Lotes vendáveis</div><div class="pcx-dons">${cards}</div>`;
  },

  graficoTempoHtml() {
    const serie = this.serieTempo();
    if (!serie || !serie.anos.length) {
      return `<section class="pcx-tempo"><h3>Distribuição da carteira no tempo</h3><p class="pcx-ajuda">Sem saldo a receber nos centros de custo do parceiro.</p></section>`;
    }
    return `<section class="pcx-tempo">
      <h3>Distribuição da carteira no tempo</h3>
      <p class="pcx-ajuda">Quanto o centro de custo do parceiro tem a receber em cada ano, até a última parcela.</p>
      <div class="pcx-tempo-canvas"><canvas id="pc-chart-tempo"></canvas></div>
    </section>`;
  },

  carteiraHtml(bills) {
    const lista0 = (bills || []).map((b) => Object.assign({}, b, this.medirTitulo(b)));
    const ativos = lista0.filter((b) => b.status === "Ativo").length;
    const quitados = lista0.length - ativos;
    const recebido = lista0.reduce((s, b) => s + (Number(b.recebido) || 0), 0);
    const recebidoMes = lista0.reduce((s, b) => s + (Number(b.recebidoMes) || 0), 0);
    const aVencer = lista0.reduce((s, b) => s + (Number(b.aVencer) || 0), 0);
    const vencido = lista0.reduce((s, b) => s + (Number(b.vencido) || 0), 0);
    const pick = {
      "cart.un": (x) => x.unidade || "",
      "cart.cliente": (x) => (x.cliente && x.cliente.name) || "",
      "cart.id": (x) => x.id,
      "cart.sit": (x) => x.status || "",
      "cart.recebido": (x) => Number(x.recebido) || 0,
      "cart.mes": (x) => Number(x.recebidoMes) || 0,
      "cart.avencer": (x) => Number(x.aVencer) || 0,
      "cart.vencido": (x) => Number(x.vencido) || 0
    };
    const gruposMap = {};
    lista0.forEach((b) => {
      const id = b.obra || "—";
      const g = gruposMap[id] || (gruposMap[id] = { id, obraNome: b.obraNome, rows: [] });
      g.rows.push(b);
    });
    const grupos = Object.values(gruposMap).sort((a, b) => a.obraNome.localeCompare(b.obraNome, "pt-BR", { numeric: true }));
    const ordenado = this.dashSort.key && this.dashSort.key.indexOf("cart.") === 0;
    grupos.forEach((g) => {
      g.rows = ordenado
        ? this.ordenarLista(g.rows, "cart", pick)
        : g.rows.slice().sort((a, b) => String(a.unidade || "").localeCompare(String(b.unidade || ""), "pt-BR", { numeric: true }));
    });
    const head = this.thDash("Unidade", "cart.un") + this.thDash("Cliente", "cart.cliente") + this.thDash("Título", "cart.id") + this.thDash("Status", "cart.sit") + this.thDash("Recebido acumulado", "cart.recebido", true) + this.thDash("Recebido no mês", "cart.mes", true) + this.thDash("Em aberto", "cart.avencer", true) + this.thDash("Vencido", "cart.vencido", true);
    const linha = (b) => {
      const cli = (b.cliente && (b.cliente.name || b.cliente.id)) || "—";
      const sit = b.status === "Ativo" ? "is-ativo" : "is-quit";
      return `<tr><td>${this.esc(b.unidade || "—")}</td><td>${this.esc(cli)}</td><td>${this.esc(b.id)}</td><td><span class="pcx-sit ${sit}">${this.esc(b.status)}</span></td><td class="is-right pcx-valor is-in">${this.fmt(b.recebido)}</td><td class="is-right pcx-valor is-in">${this.fmt(b.recebidoMes)}</td><td class="is-right pcx-valor">${this.fmt(b.aVencer)}</td><td class="is-right pcx-valor is-out">${this.fmt(b.vencido)}</td></tr>`;
    };
    const tabelas = grupos.map((g) => this.blocoHtml(g.obraNome, g.rows.length + " contrato(s)", `<div class="cc-scroll pcx-dash-scroll"><table class="cc-table pcx-table"><thead><tr>${head}</tr></thead><tbody>${g.rows.map(linha).join("")}</tbody></table></div>`)).join("");
    const p = this.periodoMes();
    return `
      ${this.kpisHtml([
        { rot: "Contratos", val: String(lista0.length), nota: ativos + " ativos · " + quitados + " quitados" },
        { rot: "Recebido acumulado", val: this.fmt(recebido), nota: "Baixas do contrato", cls: "is-in" },
        { rot: "Recebido no mês", val: this.fmt(recebidoMes), nota: this.dataBr(p.start) + " a " + this.dataBr(p.end), cls: "is-in" },
        { rot: "Em aberto", val: this.fmt(aVencer), nota: "Saldo que ainda não venceu" },
        { rot: "Vencido", val: this.fmt(vencido), nota: "Saldo com vencimento passado", cls: "is-out" }
      ])}
      <p class="pcx-ajuda">Posição de hoje dos contratos de venda. O anel conta os lotes de cada obra, menos os transferidos. Os demais status entram como vendáveis. Carteira ativa é o lote vendável que ainda tem parcela a pagar. Recebido no mês usa a data da baixa dentro do mês de referência. Em aberto é o saldo a vencer; vencido é o saldo atrasado.</p>
      ${this.graficoTempoHtml()}
      ${this.graficoCarteiraHtml(lista0)}
      ${tabelas || `<div class="pcx-alert is-info">Nenhum título de venda nestes centros.</div>`}
    `;
  },

  inadHtml(bills) {
    const hoje = (window.EstoqueComercialApp && EstoqueComercialApp.todayStr) ? EstoqueComercialApp.todayStr() : "";
    const lista0 = (bills || []).filter((b) => (Number(b.vencido) || 0) > 0.009);
    const vencido = lista0.reduce((s, b) => s + (Number(b.vencido) || 0), 0);
    const acres = lista0.reduce((s, b) => s + (Number(b.vencidoComAcrescimo) || 0), 0);
    const maisAntiga = lista0.reduce((m, b) => {
      const d = ((b.abertas || []).find((p) => p.overdue) || {}).due || "";
      return d && (!m || d < m) ? d : m;
    }, "");
    const pick = {
      "inad.cliente": (x) => (x.cliente && x.cliente.name) || "",
      "inad.id": (x) => x.id,
      "inad.vencido": (x) => Number(x.vencido) || 0,
      "inad.acres": (x) => Number(x.vencidoComAcrescimo) || 0,
      "inad.aberto": (x) => Number(x.aberto) || 0,
      "inad.antiga": (x) => ((x.abertas || []).find((p) => p.overdue) || {}).due || "",
      "inad.un": (x) => (x.units || []).map((u) => u.name).join(", ")
    };
    const lista = this.ordenarLista(lista0, "inad", pick);
    return `
      ${this.kpisHtml([
        { rot: "Contratos em atraso", val: String(lista0.length), nota: "Com parcela vencida", cls: "is-out" },
        { rot: "Valor vencido", val: this.fmt(vencido), nota: "Saldo das parcelas atrasadas", cls: "is-out" },
        { rot: "Com acréscimo", val: this.fmt(acres), nota: "Saldo corrigido", cls: "is-out" },
        { rot: "Vencimento mais antigo", val: maisAntiga ? this.dataBr(maisAntiga) : "—", nota: hoje ? "Posição " + this.dataBr(hoje) : "Posição de hoje" }
      ])}
      <p class="pcx-ajuda">Inadimplência dos contratos de venda dos centros selecionados. O valor vencido é o saldo da parcela; o acréscimo é o saldo corrigido do Sienge.</p>
      ${this.blocoHtml("Em atraso", lista0.length + " título(s)", `<div class="cc-scroll pcx-dash-scroll"><table class="cc-table pcx-table"><thead><tr>${this.thDash("Título", "inad.id")}${this.thDash("Cliente", "inad.cliente")}${this.thDash("Unidades", "inad.un")}${this.thDash("Mais antiga", "inad.antiga")}${this.thDash("Vencido", "inad.vencido", true)}${this.thDash("Com acréscimo", "inad.acres", true)}${this.thDash("Em aberto", "inad.aberto", true)}</tr></thead><tbody>${lista.map((b) => {
        const cli = (b.cliente && (b.cliente.name || b.cliente.id)) || "—";
        const uns = (b.units || []).map((u) => u.name).filter(Boolean).join(", ") || "—";
        const antiga = ((b.abertas || []).find((p) => p.overdue) || {}).due || "";
        return `<tr><td>${this.esc(b.id)}</td><td>${this.esc(cli)}</td><td>${this.esc(uns)}</td><td>${this.dataBr(antiga)}</td><td class="is-right pcx-valor is-out">${this.fmt(b.vencido)}</td><td class="is-right pcx-valor is-out">${this.fmt(b.vencidoComAcrescimo)}</td><td class="is-right pcx-valor">${this.fmt(b.aberto)}</td></tr>`;
      }).join("") || `<tr><td colspan="7" class="pcx-vazio">Nenhum contrato em atraso nestes centros.</td></tr>`}</tbody></table></div>`)}
    `;
  },

  planoParcelas(c) {
    if (window.ComercialApp && typeof ComercialApp.parcelasContrato === "function") {
      const n = ComercialApp.parcelasContrato(c);
      return n > 0 ? n : 0;
    }
    const conds = Array.isArray(c && c.paymentConditions) ? c.paymentConditions : [];
    let n = 0;
    conds.forEach((cond) => {
      n += Number(cond && (cond.installmentsNumber || cond.numberOfInstallments || cond.quantity)) || 0;
    });
    return n > 0 ? n : (Number(c && (c.numberOfInstallments || c.installmentsNumber)) || 0);
  },

  motivoCancel(c) {
    const bruto = c && (c.cancellationReason || c.cancelReason || c.cancellationMotive || c.motivoCancelamento || c.reason || "");
    const texto = bruto && typeof bruto === "object"
      ? (bruto.description || bruto.name || bruto.reason || "")
      : bruto;
    const txt = String(texto || "").replace(/\s+/g, " ").trim();
    return txt || "Não informado";
  },

  motivosDistrato(distratos) {
    const map = {};
    (distratos || []).forEach((v) => {
      const motivo = v.motivo || "Não informado";
      const g = map[motivo] || (map[motivo] = { motivo, qtd: 0, vgv: 0 });
      g.qtd += 1;
      g.vgv += Number(v.valor) || 0;
    });
    return Object.values(map).sort((a, b) => b.qtd - a.qtd || b.vgv - a.vgv);
  },

  resumoObras() {
    const conf = this.conferencias || { receitas: [], despesas: [] };
    const map = {};
    const por = (rows, campo) => {
      (rows || []).forEach((r) => {
        const id = r.grupo || r.obra || "—";
        const g = map[id] || (map[id] = { id, nome: this.rotuloObra(id), recebidos: 0, pagos: 0 });
        const v = Number(r.total) || 0;
        if (campo === "pagos") g.pagos += v;
        else g.recebidos += r.redutora ? -v : v;
      });
    };
    por(conf.receitas, "recebidos");
    por(conf.despesas, "pagos");
    return Object.values(map).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
  },

  estoquePorObra(units) {
    const est = window.EstoqueComercialApp;
    const code = (u) => String((u && u.commercialStock) || "").trim().toUpperCase();
    const map = {};
    (units || []).forEach((u) => {
      if (code(u) === "T") return;
      const id = this.chaveObra(u.enterpriseId);
      const g = map[id] || (map[id] = { id, nome: this.rotuloObra(id), total: 0, vendidos: 0, disponiveis: 0, reserva: 0 });
      g.total += 1;
      const c = code(u);
      if (c === "V" || c === "O") g.vendidos += 1;
      else if (c === "D") g.disponiveis += 1;
      else if (c === "R") g.reserva += 1;
      else if (est && typeof est.mapStock === "function") {
        const rot = est.mapStock(c);
        if (rot === "Vendida" || rot === "Vendida em pré-contrato") g.vendidos += 1;
        else if (rot === "Disponível") g.disponiveis += 1;
        else if (rot === "Reserva técnica") g.reserva += 1;
      }
    });
    return Object.values(map).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
  },

  carteiraPorObra() {
    const bills = (this.dash && this.dash.carteira) || [];
    const lista = (Array.isArray(bills) ? bills : []).map((b) => Object.assign({}, b, this.medirTitulo(b)));
    const map = {};
    lista.forEach((b) => {
      const id = b.obra || "—";
      const g = map[id] || (map[id] = { id, nome: b.obraNome || this.rotuloObra(id), contratos: 0, ativos: 0, recebidoMes: 0, aberto: 0, vencido: 0 });
      g.contratos += 1;
      if (b.status === "Ativo") g.ativos += 1;
      g.recebidoMes += Number(b.recebidoMes) || 0;
      g.aberto += (Number(b.aVencer) || 0) + (Number(b.vencido) || 0);
      g.vencido += Number(b.vencido) || 0;
    });
    const obras = Object.values(map).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
    const atrasados = lista.filter((b) => (Number(b.vencido) || 0) > 0.009);
    return { obras, atrasados, lista };
  },

  nomeParceiroRelatorio() {
    const p = this.activePartnership();
    if (p && String(p.partnerName || "").trim()) return String(p.partnerName).trim();
    const ids = new Set((this.costCenterIds || []).map(String));
    const lista = typeof this.parceriasVisiveis === "function" ? (this.parceriasVisiveis() || []) : [];
    const hit = lista.find((item) => (item.obras || []).some((o) => (o.costCenters || []).some((c) => ids.has(String(c.id)))));
    if (hit && String(hit.partnerName || "").trim()) return String(hit.partnerName).trim();
    return this.rotuloEmpresa();
  },

  temParceriaRelatorio() {
    if (this.activePartnership()) return true;
    const parc = this.ccsDoParceiro();
    return parc.length > 0 && parc.length < (this.costCenterIds || []).length;
  },

  listaCarteira() {
    const raw = this.dash && this.dash.carteira;
    if (Array.isArray(raw)) return raw;
    return (raw && raw.bills) || [];
  },

  dataRefCarteira() {
    const fim = this.periodBounds().end;
    const hoje = new Date().toISOString().slice(0, 10);
    return fim < hoje ? fim : hoje;
  },

  visitarSaldos(fn) {
    const wanted = new Set((this.costCenterIds || []).map(String));
    this.listaCarteira().forEach((b) => {
      Object.values(b.parcelas || {}).forEach((partes) => {
        const base = Object.values(partes || {})[0] || {};
        const due = String(base.dueDate || "").slice(0, 10);
        Object.entries(partes || {}).forEach(([cc, inst]) => {
          if (wanted.size && !wanted.has(String(cc))) return;
          const saldo = Number(inst && inst.currentBalance != null ? inst.currentBalance : 0) || 0;
          if (saldo <= 0.009) return;
          fn({ b, cc: String(cc), due, saldo, inst });
        });
      });
    });
  },

  tituloNoJuridico(b) {
    const flag = (v) => v === true || v === 1 || String(v || "").trim().toUpperCase() === "S";
    const marcado = (obj) => {
      if (!obj || typeof obj !== "object") return false;
      if (flag(obj.subjudice) || flag(obj.subJudice) || flag(obj.underJudgment) || flag(obj.judgment)) return true;
      const sit = String(obj.defaulterSituation || obj.situation || obj.defaulterStatus || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      return sit.indexOf("SUB") >= 0 && sit.indexOf("JUD") >= 0;
    };
    if (marcado(b) || marcado(b.cliente)) return true;
    let achou = false;
    Object.values(b.parcelas || {}).forEach((partes) => {
      Object.values(partes || {}).forEach((p) => { if (marcado(p)) achou = true; });
    });
    if (achou) return true;
    const sid = String(b.id || "").replace(/^B-/i, "").split("-")[0];
    const bag = (window.subjudiceIntegraData && window.subjudiceIntegraData.clients) || {};
    const cid = String((b.cliente && (b.cliente.id || b.cliente.customerId)) || "");
    if (cid && bag[cid + "-" + sid] && bag[cid + "-" + sid].on !== false) return true;
    return Object.keys(bag).some((k) => {
      const item = bag[k];
      if (!item || item.on === false) return false;
      const id = String(item.saleId || "").replace(/^B-/i, "").split("-")[0];
      return !!id && id === sid;
    });
  },

  classificarIniciativa(motivo) {
    const t = String(motivo || "").trim();
    const m = t.match(/^([12])\d{2}(?!\d)/);
    if (m) return m[1];
    if (/iniciativa da empresa/i.test(t)) return "2";
    if (/iniciativa do cliente/i.test(t)) return "1";
    return "";
  },

  saidasPorPlano() {
    const conf = this.conferencias || { despesas: [] };
    const map = {};
    (conf.despesas || []).forEach((r) => {
      const contas = r.contas || [];
      if (!contas.length) {
        const g = map["—"] || (map["—"] = { codigo: "—", nome: "Sem plano financeiro", valor: 0 });
        g.valor += Number(r.total) || 0;
        return;
      }
      contas.forEach((c) => {
        const codigo = c.codigo || "—";
        const nome = c.nome || "Sem nome";
        const k = codigo + "|" + nome;
        const g = map[k] || (map[k] = { codigo, nome, valor: 0 });
        g.valor += Number(c.valor) || 0;
      });
    });
    return Object.values(map).filter((g) => g.valor > 0.004).sort((a, b) => b.valor - a.valor);
  },

  mesesSeguintes(qtd) {
    const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const curtos = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const out = [];
    let y = Number(this.year);
    let m = Number(this.month);
    for (let i = 0; i < qtd; i++) {
      const chave = y + "-" + String(m).padStart(2, "0");
      out.push({ chave, rotulo: curtos[m - 1] + "/" + y, nome: nomes[m - 1] + " de " + y });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  },

  montarCarteiraPdf() {
    const ref = this.dataRefCarteira();
    const parcSet = new Set(this.ccsDoParceiro().map(String));
    const parceria = this.temParceriaRelatorio();
    const porObra = {};
    const meses = {};
    this.mesesSeguintes(12).forEach((m) => { meses[m.chave] = { chave: m.chave, rotulo: m.rotulo, nome: m.nome, empresa: 0, parceiro: 0 }; });
    const aging = [
      { rot: "Até 30 dias", ate: 30, valor: 0 },
      { rot: "Até 60 dias", ate: 60, valor: 0 },
      { rot: "Até 90 dias", ate: 90, valor: 0 },
      { rot: "Até 120 dias", ate: 120, valor: 0 },
      { rot: "Acima de 120 dias", ate: 99999, valor: 0 }
    ];
    let atraso = 0;
    const garantir = (cc) => {
      const id = this.chaveObra(cc);
      return porObra[id] || (porObra[id] = { id, nome: this.rotuloObra(id), empresa: 0, parceiro: 0, ultima: "", ateUltima: 0 });
    };
    this.visitarSaldos((item) => {
      const g = garantir(item.cc);
      const doParc = parceria && parcSet.has(item.cc);
      g.empresa += item.saldo;
      if (doParc) {
        g.parceiro += item.saldo;
        if (item.due && item.due > g.ultima) g.ultima = item.due;
      }
      if (item.due && meses[item.due.slice(0, 7)]) {
        meses[item.due.slice(0, 7)].empresa += item.saldo;
        if (doParc) meses[item.due.slice(0, 7)].parceiro += item.saldo;
      }
      if (item.due && item.due < ref) {
        atraso += item.saldo;
        const dias = Math.round((new Date(ref + "T12:00:00") - new Date(item.due + "T12:00:00")) / 86400000);
        const faixa = aging.find((f) => dias <= f.ate) || aging[aging.length - 1];
        faixa.valor += item.saldo;
      }
    });
    Object.values(porObra).forEach((g) => {
      if (!g.ultima) { g.ateUltima = g.empresa; return; }
      g.ateUltima = 0;
    });
    this.visitarSaldos((item) => {
      const g = porObra[this.chaveObra(item.cc)];
      if (!g || !g.ultima) return;
      if (item.due && item.due <= g.ultima) g.ateUltima += item.saldo;
    });
    const obras = Object.values(porObra).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
    let juridico = 0;
    let juridicoN = 0;
    this.listaCarteira().forEach((b) => {
      if (!this.tituloNoJuridico(b)) return;
      const med = this.medirTitulo(b);
      const aberto = (Number(med.aVencer) || 0) + (Number(med.vencido) || 0);
      if (aberto <= 0.009) return;
      juridico += aberto;
      juridicoN += 1;
    });
    const empresa = obras.reduce((s, o) => s + o.empresa, 0);
    const parceiro = obras.reduce((s, o) => s + o.parceiro, 0);
    return { ref, parceria, obras, meses: Object.values(meses), aging, atraso, juridico, juridicoN, empresa, parceiro };
  },

  contratosPorObra() {
    const map = {};
    this.listaCarteira().forEach((b) => {
      const m = this.medirTitulo(b);
      const id = m.obra || "—";
      const g = map[id] || (map[id] = { id, nome: this.rotuloObra(id), ativos: 0, quitados: 0 });
      if (m.status === "Ativo") g.ativos += 1;
      else g.quitados += 1;
    });
    return Object.values(map).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
  },

  pdfMoeda(v) {
    const n = Number(v) || 0;
    const neg = n < -0.004;
    return (neg ? "−" : "") + "R$ " + this.fmt(Math.abs(n));
  },

  pdfCasca(miolo, pagina, total, capa) {
    const per = this.periodBounds();
    const parceiro = this.nomeParceiroRelatorio();
    const rodape = `<div style="position:absolute;left:0;right:0;bottom:0;height:42px;background:#fff;border-top:1px solid #e5e7eb;color:#64748b;display:flex;align-items:center;justify-content:space-between;padding:0 36px;box-sizing:border-box;font-size:11px;">
        <span style="color:#105436;font-weight:700;letter-spacing:0.02em;">${this.esc(parceiro)}</span>
        <span>${pagina} / ${total}</span>
      </div>`;
    if (capa) {
      return `<div style="position:relative;width:794px;height:1123px;background:#fff;overflow:hidden;font-family:'Segoe UI',Calibri,sans-serif;color:#0f172a;">
        <div class="pcx-pdf-miolo" style="height:1081px;box-sizing:border-box;overflow:hidden;">${miolo}</div>
        ${rodape}
      </div>`;
    }
    return `<div style="position:relative;width:794px;height:1123px;background:#fff;overflow:hidden;font-family:'Segoe UI',Calibri,sans-serif;color:#0f172a;">
      <div style="height:62px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 36px;box-sizing:border-box;">
        <img src="Banner/logo%20moura%20leite%20loteamentos.png" alt="" style="height:34px;object-fit:contain;">
        <div style="text-align:right;">
          <div style="font-size:12px;font-weight:700;color:#105436;letter-spacing:0.04em;">Prestação de contas</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${this.esc(per.label)}</div>
        </div>
      </div>
      <div style="height:3px;background:linear-gradient(90deg,#105436 0%,#105436 78%,#f37021 78%,#f37021 100%);"></div>
      <div class="pcx-pdf-miolo" style="height:1016px;padding:22px 36px 16px;box-sizing:border-box;overflow:hidden;background:#fff;">${miolo}</div>
      ${rodape}
    </div>`;
  },

  pdfKpis(itens) {
    return `<div style="display:flex;gap:10px;margin:0 0 14px;">${itens.map((k) => `<div style="flex:1;background:#fff;border:1px solid #e7e5e4;border-top:3px solid ${k.cor};border-radius:8px;padding:10px 12px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#78716c;">${this.esc(k.rot)}</div>
      <div style="font-size:18px;font-weight:800;color:${k.cor};margin-top:4px;">${k.val}</div>
      ${k.nota ? `<div style="font-size:10px;color:#78716c;margin-top:2px;">${this.esc(k.nota)}</div>` : ""}
    </div>`).join("")}</div>`;
  },

  pdfTabela(colunas, linhas) {
    const th = colunas.map((c, i) => `<th style="text-align:${i ? "right" : "left"};padding:6px 8px;font-size:10px;font-weight:700;">${this.esc(c)}</th>`).join("");
    const body = linhas.length ? linhas.map((ln, ri) => `<tr style="background:${ri % 2 ? "#f8fafc" : "#fff"};">${ln.map((c, i) => `<td style="text-align:${i ? "right" : "left"};padding:5px 8px;font-size:11px;border-top:1px solid #e2e8f0;color:${c.cor || "#0f172a"};font-weight:${c.bold ? "700" : "500"};">${c.html != null ? c.html : this.esc(c.v)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${colunas.length}" style="padding:8px;font-size:11px;color:#78716c;">Nenhum lançamento neste recorte.</td></tr>`;
    return `<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">
      <thead><tr style="background:#105436;color:#fff;">${th}</tr></thead><tbody>${body}</tbody></table>`;
  },

  pdfTitulo(txt) {
    return `<h2 style="margin:0 0 12px;font-size:20px;color:#0c3d28;font-weight:800;">${this.esc(txt)}</h2>`;
  },

  pdfPaginaCapa() {
    const per = this.periodBounds();
    const parceiro = this.nomeParceiroRelatorio();
    const empresa = this.rotuloEmpresa();
    return `<div style="height:100%;background:#fff;display:flex;flex-direction:column;padding:78px 68px 72px;box-sizing:border-box;">
      <img src="Banner/logo%20moura%20leite%20loteamentos.png" alt="" style="height:46px;object-fit:contain;align-self:flex-start;">
      <div style="margin-top:auto;max-width:620px;">
        <div style="width:56px;height:4px;background:#f37021;border-radius:2px;"></div>
        <div style="margin-top:22px;font-size:13px;letter-spacing:0.22em;text-transform:uppercase;color:#105436;font-weight:700;">Prestação de contas</div>
        <div style="margin-top:14px;font-size:40px;line-height:1.12;font-weight:700;color:#0f172a;">${this.esc(parceiro)}</div>
        <div style="margin-top:36px;display:flex;gap:48px;">
          <div>
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Competência</div>
            <div style="margin-top:6px;font-size:22px;font-weight:700;color:#105436;">${this.esc(per.label)}</div>
          </div>
          <div>
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Empresa</div>
            <div style="margin-top:6px;font-size:16px;font-weight:600;color:#334155;max-width:280px;">${this.esc(empresa)}</div>
          </div>
        </div>
      </div>
      <div style="margin-top:auto;font-size:12px;color:#94a3b8;">Moura Leite · documento de acompanhamento</div>
    </div>`;
  },

  pdfPaginaCaixa() {
    if (!this.conferencias && this.movements.length) this.rebuildFromMovements();
    const obras = this.resumoObras();
    const entrada = obras.reduce((s, o) => s + o.recebidos, 0);
    const saida = obras.reduce((s, o) => s + o.pagos, 0);
    const saldo = entrada - saida;
    const linhas = obras.map((o) => {
      const s = o.recebidos - o.pagos;
      return [{ v: o.nome }, { v: this.pdfMoeda(o.recebidos) }, { v: this.pdfMoeda(o.pagos) }, { v: this.pdfMoeda(s), cor: s < -0.004 ? "#b91c1c" : "#105436", bold: true }];
    });
    linhas.push([{ v: "Total", bold: true }, { v: this.pdfMoeda(entrada), bold: true }, { v: this.pdfMoeda(saida), bold: true }, { v: this.pdfMoeda(saldo), cor: saldo < -0.004 ? "#b91c1c" : "#105436", bold: true }]);
    const planos = this.saidasPorPlano();
    const linhasPlano = planos.map((p) => [{ v: (p.codigo && p.codigo !== "—" ? p.codigo + "  " : "") + p.nome }, { v: this.pdfMoeda(p.valor) }]);
    return this.pdfTitulo("Entradas e saídas")
      + this.pdfKpis([
        { rot: "Entrada", val: this.pdfMoeda(entrada), cor: "#105436", nota: "Recebido no mês" },
        { rot: "Saída", val: this.pdfMoeda(saida), cor: "#b91c1c", nota: "Pago no mês" },
        { rot: "Saldo", val: this.pdfMoeda(saldo), cor: saldo < -0.004 ? "#b91c1c" : "#105436", nota: "Entrada menos saída" }
      ])
      + `<div style="font-size:13px;font-weight:800;color:#0c3d28;margin:0 0 6px;">Por empreendimento</div>`
      + this.pdfTabela(["Empreendimento", "Entrada", "Saída", "Saldo"], linhas)
      + `<div style="font-size:13px;font-weight:800;color:#0c3d28;margin:14px 0 6px;">Saídas por plano financeiro</div>`
      + this.pdfTabela(["Plano financeiro", "Saída"], linhasPlano);
  },

  pdfPaginaVendas() {
    const pack = (this.dash && this.dash.vendas) || { vendas: [], distratos: [] };
    const vendas = pack.vendas || [];
    const distratos = pack.distratos || [];
    const vgv = vendas.reduce((s, v) => s + (Number(v.valor) || 0), 0);
    const ticket = vendas.length ? vgv / vendas.length : 0;
    const dias = distratos.map((v) => {
      const a = String(v.data || "").slice(0, 10);
      const b = String(v.dataCancel || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
      const n = (new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000;
      return n >= 0 ? n : null;
    }).filter((n) => n != null);
    const mediaDias = dias.length ? dias.reduce((s, n) => s + n, 0) / dias.length : 0;
    const tempo = dias.length ? (mediaDias / 30.4375).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " meses" : "—";
    const grupos = { "1": { qtd: 0, vgv: 0 }, "2": { qtd: 0, vgv: 0 }, "": { qtd: 0, vgv: 0 } };
    distratos.forEach((v) => {
      const k = this.classificarIniciativa(v.motivo);
      const g = grupos[k] || grupos[""];
      g.qtd += 1;
      g.vgv += Number(v.valor) || 0;
    });
    const motivos = this.motivosDistrato(distratos).map((m) => [{ v: m.motivo }, { v: String(m.qtd) }, { v: this.pdfMoeda(m.vgv) }]);
    return this.pdfTitulo("Vendas e distratos")
      + this.pdfKpis([
        { rot: "Vendas", val: String(vendas.length), cor: "#105436", nota: "Emitidas na competência" },
        { rot: "Distratos", val: String(distratos.length), cor: "#b91c1c", nota: "Cancelados na competência" },
        { rot: "Ticket médio", val: this.pdfMoeda(ticket), cor: "#0c3d28", nota: "VGV das vendas" },
        { rot: "Tempo médio", val: tempo, cor: "#0c3d28", nota: dias.length ? "Da emissão ao distrato" : "Sem data de cancelamento" }
      ])
      + `<div style="display:flex;gap:10px;margin:0 0 14px;">
        <div style="flex:1;background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:10px 12px;">
          <div style="font-size:11px;font-weight:800;color:#105436;">Iniciativa do cliente · prefixo 1</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${grupos["1"].qtd} distrato(s)</div>
          <div style="font-size:12px;color:#57534e;">${this.pdfMoeda(grupos["1"].vgv)}</div>
        </div>
        <div style="flex:1;background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:10px 12px;">
          <div style="font-size:11px;font-weight:800;color:#b45309;">Iniciativa da empresa · prefixo 2</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;">${grupos["2"].qtd} distrato(s)</div>
          <div style="font-size:12px;color:#57534e;">${this.pdfMoeda(grupos["2"].vgv)}</div>
        </div>
      </div>`
      + (grupos[""].qtd ? `<p style="margin:-6px 0 10px;font-size:11px;color:#78716c;">${grupos[""].qtd} distrato(s) sem o prefixo 1 ou 2 no motivo.</p>` : "")
      + `<div style="font-size:13px;font-weight:800;color:#0c3d28;margin:0 0 6px;">Motivos de cancelamento</div>`
      + this.pdfTabela(["Motivo", "Contratos", "VGV"], motivos);
  },

  pdfAnel(ativos, quitados, cor) {
    const total = ativos + quitados;
    const r = 38;
    const c = 2 * Math.PI * r;
    const frac = total ? ativos / total : 0;
    const dash = (frac * c).toFixed(2);
    const resto = (c - frac * c).toFixed(2);
    const pctA = total ? Math.round(ativos * 100 / total) : 0;
    const pctQ = total ? 100 - pctA : 0;
    return `<div style="width:148px;text-align:center;">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r="${r}" fill="none" stroke="#d6d3d1" stroke-width="14"></circle>
        <circle cx="55" cy="55" r="${r}" fill="none" stroke="${cor}" stroke-width="14" stroke-dasharray="${dash} ${resto}" transform="rotate(-90 55 55)"></circle>
        <text x="55" y="52" text-anchor="middle" font-size="18" font-weight="700" fill="#1c1917">${total}</text>
        <text x="55" y="66" text-anchor="middle" font-size="9" fill="#78716c">contratos</text>
      </svg>
      <div style="font-size:10px;color:#44403c;line-height:1.35;">
        <span style="color:${cor};font-weight:700;">●</span> ${ativos} ativos (${pctA}%)<br>
        <span style="color:#a8a29e;font-weight:700;">●</span> ${quitados} quitados (${pctQ}%)
      </div>
    </div>`;
  },

  pdfBarras(obras) {
    const max = Math.max(1, ...obras.map((o) => o.vendidos));
    if (!obras.length) return `<p style="font-size:12px;color:#78716c;">Nenhum lote vendido neste recorte.</p>`;
    return `<div>${obras.map((o) => {
      const w = Math.max(4, Math.round(o.vendidos * 280 / max));
      return `<div style="display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:11px;">
        <div style="width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.esc(o.nome)}</div>
        <div style="width:${w}px;height:14px;background:#105436;border-radius:3px;"></div>
        <strong>${o.vendidos}</strong>
      </div>`;
    }).join("")}</div>`;
  },

  pdfPaginaEstoque() {
    const obras = this.estoquePorObra((this.dash && this.dash.estoque) || []);
    const linhas = obras.map((o) => [{ v: o.nome }, { v: String(o.total) }, { v: String(o.vendidos) }, { v: String(o.disponiveis) }, { v: String(o.reserva) }]);
    const tot = obras.reduce((s, o) => ({ total: s.total + o.total, vendidos: s.vendidos + o.vendidos, disponiveis: s.disponiveis + o.disponiveis, reserva: s.reserva + o.reserva }), { total: 0, vendidos: 0, disponiveis: 0, reserva: 0 });
    linhas.push([{ v: "Total", bold: true }, { v: String(tot.total), bold: true }, { v: String(tot.vendidos), bold: true }, { v: String(tot.disponiveis), bold: true }, { v: String(tot.reserva), bold: true }]);
    const contratos = this.contratosPorObra();
    const cores = ["#105436", "#f37021", "#0f766e", "#b45309", "#14532d", "#9a3412"];
    const aneis = contratos.map((c, i) => `<div style="width:160px;margin:0 8px 10px;text-align:center;">
      <div style="font-size:11px;font-weight:800;color:#0c3d28;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.esc(c.nome)}</div>
      ${this.pdfAnel(c.ativos, c.quitados, cores[i % cores.length])}
    </div>`).join("");
    return this.pdfTitulo("Posição de estoque")
      + this.pdfTabela(["Empreendimento", "Lotes", "Vendidos", "Disponíveis", "Reserva técnica"], linhas)
      + `<div style="font-size:13px;font-weight:800;color:#0c3d28;margin:14px 0 8px;">Total vendido</div>`
      + this.pdfBarras(obras)
      + `<div style="font-size:13px;font-weight:800;color:#0c3d28;margin:14px 0 8px;">Contratos ativos e quitados</div>`
      + `<div style="display:flex;flex-wrap:wrap;">${aneis || `<p style="font-size:12px;color:#78716c;">Nenhum contrato na carteira destes centros.</p>`}</div>`;
  },

  pdfPaginaCarteira() {
    const c = this.montarCarteiraPdf();
    const kpis = [
      { rot: "A receber", val: this.pdfMoeda(c.empresa), cor: "#105436", nota: "Saldo dos empreendimentos" },
      { rot: "Em atraso", val: this.pdfMoeda(c.atraso), cor: "#b91c1c", nota: "Posição " + this.dataBr(c.ref) },
      { rot: "No jurídico", val: this.pdfMoeda(c.juridico), cor: "#9a3412", nota: c.juridicoN + " título(s)" }
    ];
    if (c.parceria) kpis.splice(1, 0, { rot: "Parceiro", val: this.pdfMoeda(c.parceiro), cor: "#f37021", nota: "Centro de custo do parceiro" });
    const colMes = c.parceria ? ["Mês", "Empreendimento", "Parceiro"] : ["Mês", "A receber"];
    const linhasMes = c.meses.map((m) => {
      const ln = [{ v: m.nome }, { v: this.pdfMoeda(m.empresa) }];
      if (c.parceria) ln.push({ v: this.pdfMoeda(m.parceiro) });
      return ln;
    });
    const linhasObra = c.obras.map((o) => [
      { v: o.nome },
      { v: o.ultima ? this.dataBr(o.ultima) : "—" },
      { v: this.pdfMoeda(o.ateUltima) }
    ]);
    const maxAge = Math.max(1, ...c.aging.map((f) => f.valor));
    const aging = c.aging.map((f) => {
      const w = Math.max(4, Math.round(f.valor * 220 / maxAge));
      return `<div style="display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:11px;">
        <div style="width:118px;">${this.esc(f.rot)}</div>
        <div style="width:${w}px;height:12px;background:#b91c1c;border-radius:3px;"></div>
        <span>${this.pdfMoeda(f.valor)}</span>
      </div>`;
    }).join("");
    return this.pdfTitulo("Posição de carteira")
      + this.pdfKpis(kpis)
      + `<div style="display:flex;gap:16px;align-items:flex-start;">
        <div style="flex:1.15;">
          <div style="font-size:13px;font-weight:800;color:#0c3d28;margin:0 0 6px;">Próximos 12 meses</div>
          ${this.pdfTabela(colMes, linhasMes)}
        </div>
        <div style="flex:0.85;">
          <div style="font-size:13px;font-weight:800;color:#0c3d28;margin:0 0 6px;">Aging do atraso</div>
          <div style="background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:10px 12px;margin:0 0 12px;">${aging}</div>
          <div style="font-size:13px;font-weight:800;color:#0c3d28;margin:0 0 6px;">Até a última parcela do parceiro</div>
          ${this.pdfTabela(["Empreendimento", "Última", "A receber"], linhasObra)}
        </div>
      </div>`;
  },

  async baixarPdf() {
    if (typeof html2canvas !== "function" || !window.jspdf) throw new Error("Gerador de PDF indisponível.");
    if (typeof window.loadSubjudiceIntegra === "function") {
      try { await window.loadSubjudiceIntegra(); } catch (e) {}
    }
    const blocos = [
      this.pdfPaginaCapa(),
      this.pdfPaginaCaixa(),
      this.pdfPaginaVendas(),
      this.pdfPaginaEstoque(),
      this.pdfPaginaCarteira()
    ];
    const total = blocos.length;
    const W = 794;
    const H = 1123;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < blocos.length; i++) {
      const page = document.createElement("div");
      page.style.cssText = "position:fixed;left:-14000px;top:0;width:" + W + "px;height:" + H + "px;z-index:0;";
      page.innerHTML = this.pdfCasca(blocos[i], i + 1, total, i === 0);
      document.body.appendChild(page);
      try {
        await Promise.all(Array.from(page.querySelectorAll("img")).map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
        const miolo = page.querySelector(".pcx-pdf-miolo");
        if (miolo && miolo.scrollHeight > miolo.clientHeight + 4) {
          const s = miolo.clientHeight / miolo.scrollHeight;
          miolo.style.transformOrigin = "top left";
          miolo.style.transform = "scale(" + s + ")";
          miolo.style.width = (100 / s) + "%";
          miolo.style.height = miolo.scrollHeight + "px";
        }
        const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, width: W, height: H });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageW, pageH);
      } finally {
        page.remove();
      }
    }
    const per = this.periodBounds();
    pdf.save("prestacao-contas-" + String(this.companyId || "empresa") + "-" + per.start.slice(0, 7) + ".pdf");
  },

  async exportar() {
    if (this.loading) return;
    if (!this.costCenterIds.length) {
      if (window.showToast) window.showToast("Selecione ao menos um centro de custo.", "warning");
      return;
    }
    if ((this.companyIds || []).length !== 1 || !this.companyId) {
      if (window.showToast) window.showToast("Selecione uma empresa.", "warning");
      return;
    }
    const d = this.dash;
    const chave = this.chaveDash();
    const pronto = this.movements.length && d && d.chave === chave && d.vendas && d.estoque && d.carteira && !d.loading;
    if (!pronto) await this.load();
    if (this.loading) return;
    try {
      await this.baixarPdf();
      if (window.showToast) window.showToast("Prestação gerada em PDF.", "success");
    } catch (e) {
      if (window.showToast) window.showToast((e && e.message) || "Não consegui gerar a prestação.", "error");
    }
  },

  async baixarPrestacao() {
    const xl = window.InvestimentoApp;
    if (!xl || typeof xl.ensureExcelJS !== "function") throw new Error("O Excel não está disponível nesta tela.");
    const ExcelJS = await xl.ensureExcelJS();
    const logo = await xl.logoDataUrl();
    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    wb.created = new Date();
    const imgId = wb.addImage({ base64: logo.dataUrl, extension: logo.extension || "png" });
    const per = this.periodBounds();
    const empresa = this.rotuloEmpresa();
    const sub = empresa + " · " + per.label;
    this.folhaResumo(wb, xl, imgId, sub);
    this.folhaVendas(wb, xl, imgId, sub);
    this.folhaEstoque(wb, xl, imgId, sub);
    this.folhaCarteira(wb, xl, imgId, sub);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "prestacao-contas-" + String(this.companyId || "empresa") + "-" + per.start.slice(0, 7) + ".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  },

  rotuloEmpresa() {
    const id = String(this.companyId || "");
    const lista = (window.AppState && AppState.cachedCompanies) || [];
    const c = lista.find((x) => String(x.id) === id);
    const nome = c ? String(c.name || c.tradeName || "").trim() : "";
    return nome ? id + " - " + nome : (id || "Empresa");
  },

  abrirFolha(wb, nome, colunas) {
    const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", activeCell: "B5", showGridLines: false }] });
    ws.properties.showGridLines = false;
    ws.columns = colunas.map((w) => ({ width: w }));
    return ws;
  },

  pintarCabeca(ws, xl, imgId, titulo, subtitulo, kpis) {
    const logoPx = Math.round(1.54 * 96 / 2.54);
    ws.mergeCells("A1:A2");
    ws.getRow(1).height = 28;
    ws.getRow(2).height = 22;
    ws.getRow(3).height = 8;
    const title = ws.getCell("A1");
    title.value = {
      richText: [
        { font: { name: "Calibri", size: 14, bold: true, color: { argb: "FF475569" } }, text: titulo + "\n" },
        { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: subtitulo }
      ]
    };
    xl.excelPaint(title, { fill: "FFFFFFFF", align: { vertical: "middle", horizontal: "left", wrapText: true, indent: 8 } });
    try {
      ws.addImage(imgId, { tl: { col: 0.04, row: 0.08 }, ext: { width: logoPx, height: logoPx } });
    } catch (e) {}
    (kpis || []).forEach((k, i) => {
      const col = 4 + i;
      const colObj = ws.getColumn(col);
      if (!colObj.width || colObj.width < 16) colObj.width = 18;
      const rot = ws.getRow(1).getCell(col);
      const val = ws.getRow(2).getCell(col);
      rot.value = k.label;
      val.value = k.value;
      xl.excelPaint(rot, { font: { size: 8, bold: true, color: { argb: "FF94A3B8" } }, align: { horizontal: "right", vertical: "middle" } });
      xl.excelPaint(val, { font: { size: 12, bold: true, color: { argb: k.color || "FF0F172A" } }, align: { horizontal: "right", vertical: "middle" }, numFmt: k.numFmt || "" });
    });
  },

  pintarGrade(ws, xl, headers, linhas, total) {
    const head = ws.getRow(4);
    head.height = 20;
    headers.forEach((h, i) => {
      const cell = head.getCell(i + 1);
      cell.value = h;
      xl.excelPaint(cell, {
        font: { size: 9, bold: true, color: { argb: "FFFFFFFF" } },
        fill: "FF334155",
        align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
        border: true
      });
    });
    let row = 5;
    linhas.forEach((linha) => {
      const r = ws.getRow(row);
      linha.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        cell.value = c.v;
        const neg = typeof c.v === "number" && c.v < -0.004;
        xl.excelPaint(cell, {
          font: { size: 9, bold: !!c.bold, color: { argb: neg ? "FFB91C1C" : (c.color || "FF0F172A") } },
          fill: c.fill || "FFFFFFFF",
          align: { horizontal: i === 0 || c.text ? "left" : "right", vertical: "middle" },
          border: true,
          numFmt: c.fmt || ""
        });
      });
      row += 1;
    });
    if (total) {
      const r = ws.getRow(row);
      total.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        cell.value = c.v;
        const neg = typeof c.v === "number" && c.v < -0.004;
        xl.excelPaint(cell, {
          font: { size: 9, bold: true, color: { argb: neg ? "FFFFE4E6" : "FFFFFFFF" } },
          fill: "FF475569",
          align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
          border: true,
          numFmt: c.fmt || ""
        });
      });
      row += 1;
    }
    return row;
  },

  rodapeFolha(ws, xl, row) {
    const foot = ws.getRow(row + 1).getCell(1);
    foot.value = xl.generatedAtLabel(new Date());
    xl.excelPaint(foot, { font: { size: 8, italic: true, color: { argb: "FF64748B" } }, align: { horizontal: "left" } });
  },

  num(v) { return Math.round((Number(v) || 0) * 100) / 100; },

  folhaResumo(wb, xl, imgId, sub) {
    const obras = this.resumoObras();
    const rec = obras.reduce((s, o) => s + o.recebidos, 0);
    const pag = obras.reduce((s, o) => s + o.pagos, 0);
    const saldo = rec - pag;
    const ws = this.abrirFolha(wb, "Resumo", [42, 18, 18, 18]);
    this.pintarCabeca(ws, xl, imgId, "Prestação de contas — Resumo", sub, [
      { label: "Recebidos", value: this.num(rec), color: "FF105436", numFmt: "#,##0.00" },
      { label: "Pagos", value: this.num(pag), color: "FFB91C1C", numFmt: "#,##0.00" },
      { label: "Saldo", value: this.num(saldo), color: saldo < 0 ? "FFB91C1C" : "FF105436", numFmt: "#,##0.00" }
    ]);
    const linhas = obras.map((o) => [
      { v: o.nome, text: true },
      { v: this.num(o.recebidos), fmt: "#,##0.00" },
      { v: this.num(o.pagos), fmt: "#,##0.00" },
      { v: this.num(o.recebidos - o.pagos), fmt: "#,##0.00" }
    ]);
    const fim = this.pintarGrade(ws, xl, ["Empreendimento", "Recebidos", "Pagos", "Saldo"], linhas, [
      { v: "Total" },
      { v: this.num(rec), fmt: "#,##0.00" },
      { v: this.num(pag), fmt: "#,##0.00" },
      { v: this.num(saldo), fmt: "#,##0.00" }
    ]);
    this.rodapeFolha(ws, xl, fim);
  },

  folhaVendas(wb, xl, imgId, sub) {
    const pack = (this.dash && this.dash.vendas) || { vendas: [], distratos: [] };
    const vendas = pack.vendas || [];
    const distratos = pack.distratos || [];
    const vgv = vendas.reduce((s, v) => s + (Number(v.valor) || 0), 0);
    const planos = vendas.map((v) => Number(v.parcelas) || 0).filter((n) => n > 0);
    const plano = planos.length ? planos.reduce((s, n) => s + n, 0) / planos.length : 0;
    const ticket = vendas.length ? vgv / vendas.length : 0;
    const ws = this.abrirFolha(wb, "Vendas e distratos", [28, 16, 36, 22, 28, 16, 18]);
    this.pintarCabeca(ws, xl, imgId, "Prestação de contas — Vendas e distratos", sub, [
      { label: "Vendas", value: vendas.length, color: "FF105436", numFmt: "0" },
      { label: "Distratos", value: distratos.length, color: "FFB91C1C", numFmt: "0" },
      { label: "Ticket médio", value: this.num(ticket), color: "FF0F172A", numFmt: "#,##0.00" },
      { label: "Plano médio", value: plano ? Math.round(plano * 10) / 10 : 0, color: "FF0F172A", numFmt: "0.0" }
    ]);
    const porObra = {};
    const garantir = (cc) => {
      const id = this.chaveObra(cc);
      return porObra[id] || (porObra[id] = { nome: this.rotuloObra(id), vendas: 0, vgv: 0, parcelas: 0, comPlano: 0, distratos: 0, vgvD: 0 });
    };
    vendas.forEach((v) => {
      const g = garantir(v.cc);
      g.vendas += 1;
      g.vgv += Number(v.valor) || 0;
      if (Number(v.parcelas) > 0) { g.parcelas += Number(v.parcelas); g.comPlano += 1; }
    });
    distratos.forEach((v) => {
      const g = garantir(v.cc);
      g.distratos += 1;
      g.vgvD += Number(v.valor) || 0;
    });
    const linhas = Object.values(porObra).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })).map((g) => [
      { v: g.nome, text: true },
      { v: g.vendas, fmt: "0" },
      { v: this.num(g.vgv), fmt: "#,##0.00" },
      { v: g.vendas ? this.num(g.vgv / g.vendas) : 0, fmt: "#,##0.00" },
      { v: g.comPlano ? Math.round((g.parcelas / g.comPlano) * 10) / 10 : 0, fmt: "0.0" },
      { v: g.distratos, fmt: "0" },
      { v: this.num(g.vgvD), fmt: "#,##0.00" }
    ]);
    let row = this.pintarGrade(ws, xl, ["Empreendimento", "Vendas", "VGV", "Ticket médio", "Plano médio", "Distratos", "VGV distrato"], linhas, [
      { v: "Total" },
      { v: vendas.length, fmt: "0" },
      { v: this.num(vgv), fmt: "#,##0.00" },
      { v: this.num(ticket), fmt: "#,##0.00" },
      { v: plano ? Math.round(plano * 10) / 10 : 0, fmt: "0.0" },
      { v: distratos.length, fmt: "0" },
      { v: this.num(distratos.reduce((s, v) => s + (Number(v.valor) || 0), 0)), fmt: "#,##0.00" }
    ]);
    row = this.faixaFolha(ws, xl, row + 1, "Motivos de cancelamento", 7);
    row = this.tabelaFolha(ws, xl, row, ["Motivo", "Contratos", "VGV"], this.motivosDistrato(distratos).map((m) => [
      { v: m.motivo, text: true }, { v: m.qtd, fmt: "0" }, { v: this.num(m.vgv), fmt: "#,##0.00" }
    ]));
    row = this.faixaFolha(ws, xl, row + 1, "Vendas do mês", 7);
    row = this.tabelaFolha(ws, xl, row, ["Contrato", "Emissão", "Cliente", "Unidade", "Empreendimento", "Valor", "Parcelas"], vendas.map((v) => [
      { v: v.numero, text: true },
      { v: this.dataBr(v.data), text: true },
      { v: v.cliente || "—", text: true },
      { v: v.unidadeNomes || "—", text: true },
      { v: this.rotuloObra(this.chaveObra(v.cc)), text: true },
      { v: this.num(v.valor), fmt: "#,##0.00" },
      { v: Number(v.parcelas) || 0, fmt: "0" }
    ]));
    row = this.faixaFolha(ws, xl, row + 1, "Distratos do mês", 7);
    row = this.tabelaFolha(ws, xl, row, ["Contrato", "Cancelamento", "Cliente", "Unidade", "Empreendimento", "Valor", "Motivo"], distratos.map((v) => [
      { v: v.numero, text: true },
      { v: this.dataBr(v.dataCancel || v.data), text: true },
      { v: v.cliente || "—", text: true },
      { v: v.unidadeNomes || "—", text: true },
      { v: this.rotuloObra(this.chaveObra(v.cc)), text: true },
      { v: this.num(v.valor), fmt: "#,##0.00" },
      { v: v.motivo || "Não informado", text: true }
    ]));
    this.rodapeFolha(ws, xl, row);
  },

  faixaFolha(ws, xl, row, texto, cols) {
    const r = ws.getRow(row);
    r.getCell(1).value = texto;
    xl.excelPaint(r.getCell(1), {
      font: { size: 9, bold: true, color: { argb: "FFFFFFFF" } },
      fill: "FF0C3D28",
      align: { horizontal: "left", vertical: "middle" }
    });
    if (cols > 1) ws.mergeCells(row, 1, row, cols);
    return row + 1;
  },

  tabelaFolha(ws, xl, row, headers, linhas) {
    const head = ws.getRow(row);
    head.height = 20;
    headers.forEach((h, i) => {
      const cell = head.getCell(i + 1);
      cell.value = h;
      xl.excelPaint(cell, {
        font: { size: 9, bold: true, color: { argb: "FFFFFFFF" } },
        fill: "FF334155",
        align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
        border: true
      });
    });
    row += 1;
    if (!linhas.length) {
      const cell = ws.getRow(row).getCell(1);
      cell.value = "Nenhum lançamento neste período.";
      xl.excelPaint(cell, { font: { size: 9, italic: true, color: { argb: "FF64748B" } }, align: { horizontal: "left" } });
      return row + 1;
    }
    linhas.forEach((linha) => {
      const r = ws.getRow(row);
      linha.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        cell.value = c.v;
        const neg = typeof c.v === "number" && c.v < -0.004;
        xl.excelPaint(cell, {
          font: { size: 9, color: { argb: neg ? "FFB91C1C" : "FF0F172A" } },
          fill: "FFFFFFFF",
          align: { horizontal: i === 0 || c.text ? "left" : "right", vertical: "middle" },
          border: true,
          numFmt: c.fmt || ""
        });
      });
      row += 1;
    });
    return row;
  },

  folhaEstoque(wb, xl, imgId, sub) {
    const obras = this.estoquePorObra((this.dash && this.dash.estoque) || []);
    const tot = obras.reduce((s, o) => {
      s.total += o.total; s.vendidos += o.vendidos; s.disponiveis += o.disponiveis; s.reserva += o.reserva;
      return s;
    }, { total: 0, vendidos: 0, disponiveis: 0, reserva: 0 });
    const pct = tot.total ? tot.disponiveis / tot.total : 0;
    const ws = this.abrirFolha(wb, "Estoque", [42, 14, 14, 16, 18, 16]);
    this.pintarCabeca(ws, xl, imgId, "Prestação de contas — Estoque", sub + " · posição atual, sem unidades transferidas. Vendidos inclui pré-contrato.", [
      { label: "Total", value: tot.total, numFmt: "0" },
      { label: "Vendidos", value: tot.vendidos, numFmt: "0" },
      { label: "Disponíveis", value: tot.disponiveis, color: "FF105436", numFmt: "0" },
      { label: "% disponível", value: pct, color: "FF105436", numFmt: "0.0%" }
    ]);
    this.pintarGrade(ws, xl, ["Empreendimento", "Total", "Vendidos", "Disponíveis", "Reserva técnica", "% disponível"], obras.map((o) => [
      { v: o.nome, text: true },
      { v: o.total, fmt: "0" },
      { v: o.vendidos, fmt: "0" },
      { v: o.disponiveis, fmt: "0" },
      { v: o.reserva, fmt: "0" },
      { v: o.total ? o.disponiveis / o.total : 0, fmt: "0.0%" }
    ]), [
      { v: "Total" },
      { v: tot.total, fmt: "0" },
      { v: tot.vendidos, fmt: "0" },
      { v: tot.disponiveis, fmt: "0" },
      { v: tot.reserva, fmt: "0" },
      { v: pct, fmt: "0.0%" }
    ]);
    this.rodapeFolha(ws, xl, ws.lastRow ? ws.lastRow.number : 6);
  },

  folhaCarteira(wb, xl, imgId, sub) {
    const pack = this.carteiraPorObra();
    const aberto = pack.obras.reduce((s, o) => s + o.aberto, 0);
    const vencido = pack.obras.reduce((s, o) => s + o.vencido, 0);
    const inad = aberto > 0.5 ? vencido / aberto : 0;
    const ws = this.abrirFolha(wb, "Carteira", [36, 14, 14, 18, 18, 18, 16]);
    this.pintarCabeca(ws, xl, imgId, "Prestação de contas — Carteira e inadimplência", sub + " · posição de hoje", [
      { label: "Em aberto", value: this.num(aberto), numFmt: "#,##0.00" },
      { label: "Vencido", value: this.num(vencido), color: "FFB91C1C", numFmt: "#,##0.00" },
      { label: "Inadimplência", value: inad, color: "FFB91C1C", numFmt: "0.0%" }
    ]);
    let row = this.pintarGrade(ws, xl, ["Empreendimento", "Contratos", "Ativos", "Recebido no mês", "Em aberto", "Vencido", "Inadimplência"], pack.obras.map((o) => [
      { v: o.nome, text: true },
      { v: o.contratos, fmt: "0" },
      { v: o.ativos, fmt: "0" },
      { v: this.num(o.recebidoMes), fmt: "#,##0.00" },
      { v: this.num(o.aberto), fmt: "#,##0.00" },
      { v: this.num(o.vencido), fmt: "#,##0.00" },
      { v: o.aberto > 0.5 ? o.vencido / o.aberto : 0, fmt: "0.0%" }
    ]), [
      { v: "Total" },
      { v: pack.obras.reduce((s, o) => s + o.contratos, 0), fmt: "0" },
      { v: pack.obras.reduce((s, o) => s + o.ativos, 0), fmt: "0" },
      { v: this.num(pack.obras.reduce((s, o) => s + o.recebidoMes, 0)), fmt: "#,##0.00" },
      { v: this.num(aberto), fmt: "#,##0.00" },
      { v: this.num(vencido), fmt: "#,##0.00" },
      { v: inad, fmt: "0.0%" }
    ]);
    row = this.faixaFolha(ws, xl, row + 1, "Inadimplência", 7);
    row = this.tabelaFolha(ws, xl, row, ["Título", "Cliente", "Unidade", "Empreendimento", "Vencimento mais antigo", "Vencido", "Em aberto"], pack.atrasados.map((b) => {
      const antiga = ((b.abertas || []).find((p) => p.overdue) || {}).due || "";
      return [
        { v: String(b.id || ""), text: true },
        { v: (b.cliente && (b.cliente.name || b.cliente.id)) || (typeof b.cliente === "string" ? b.cliente : "—"), text: true },
        { v: b.unidade || "—", text: true },
        { v: b.obraNome || "—", text: true },
        { v: this.dataBr(antiga), text: true },
        { v: this.num(b.vencido), fmt: "#,##0.00" },
        { v: this.num((Number(b.aVencer) || 0) + (Number(b.vencido) || 0)), fmt: "#,##0.00" }
      ];
    }));
    this.rodapeFolha(ws, xl, row);
  }
};

window.PrestacaoContasApp = PrestacaoContasApp;
