/* Marketing · Budget
   Verba = VGV da obra (Sienge) × % de marketing (definido em Configurações).
   Centro de custo com MARKETING no nome: 100% das despesas entram no budget.
   Centro sem MARKETING no nome: títulos pagos, em aberto e previsões nas contas do grupo 2.03.05 MARKETING
   (a conta, as filhas e as contas alocadas em 05.02 MARKETING na visão DFC).
   Previsão entra no comprometido junto com o título em aberto.
   A aba Contratos mostra quem está em dia, quem não pagou nada e quem deve a entrada (possíveis cancelamentos).
   A aba Perfil da venda cruza sexo e idade dos clientes com a situação de pagamento e os cancelamentos. */
const MarketingBudgetApp = {
  CONFIG_COLLECTION: "marketing_budget_config",
  CONFIG_LOCAL: "crm_marketing_budget_config",
  CAT_DOC: "_categorias",
  CAT_PADRAO: /MARKET|PUBLICI|PROPAGAND|M[IÍ]DIA|EVENTO|BRINDE|PATROCIN|STAND|PANFLET|OUTDOOR|ANUNCI|DIVULGA/i,

  state: {
    costCenters: [],
    ccId: "",
    verbas: {},
    startDate: "",
    endDate: "",
    loading: false,
    progress: "",
    progressRatio: 0,
    error: "",
    consultado: false,
    obra: null,
    pct: 0,
    catSel: null,
    categorias: {},
    rows: [],
    vendas: [],
    distratos: [],
    eventos: [],
    filtroGasto: "todos",
    buscaCredor: "",
    filtroPlano: "",
    sortGasto: "data",
    sortGastoDir: "desc",
    ccsCfg: [],
    aba: "budget",
    ctrEscopo: "periodo",
    catOpen: false,
    catQuery: "",
    catPend: null,
    adimpl: { status: "", porVenda: {} },
    perfis: { status: "", map: {}, feitos: 0, total: 0 },
    gen: 0
  },
  charts: {},
  PERFIL_LOCAL: "crm_mkt_perfil_clientes",
  FAIXAS: ["Até 25", "26 a 35", "36 a 45", "46 a 55", "56 a 65", "Acima de 65", "Sem nascimento"],
  SEXOS: { F: "Feminino", M: "Masculino", PJ: "Pessoa jurídica", "?": "Não informado" },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  },

  /** Centro de marketing: o nome do centro de custo contém MARKETING. */
  ccTemMarketing(ccId, ccNome) {
    const cc = (this.state.costCenters || []).find((c) => String(c.id) === String(ccId));
    const nome = (cc && (cc.name || cc.nome)) || ccNome || "";
    return this.fold(nome).includes("MARKETING");
  },

  /**
   * Grupo de marketing do plano: conta 2.03.05 MARKETING e as filhas,
   * mais as contas colocadas no grupo 05.02 MARKETING da visão DFC.
   */
  async carregarGrupoMarketing() {
    let cats = (window.PlanoFinanceiroApp && Array.isArray(PlanoFinanceiroApp.categories) && PlanoFinanceiroApp.categories) || [];
    if (!cats.length && window.SiengeApiService && typeof SiengeApiService.getPaymentCategories === "function") {
      try { cats = await SiengeApiService.getPaymentCategories() || []; } catch (e) { cats = []; }
    }
    const prefixos = new Set(["2.03.05"]);
    const ids = new Set();
    (cats || []).forEach((c) => {
      const id = String(c && c.id || "").trim();
      const nome = this.fold(c && (c.name || c.description || c.financialCategoryName));
      if (!id) return;
      const partes = id.split(".").filter(Boolean).length;
      if (id === "2.03.05" || id.replace(/\D/g, "") === "20305" || (nome === "MARKETING" && partes >= 3)) prefixos.add(id);
    });
    let visoes = [];
    try { visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]") || []; } catch (e) { visoes = []; }
    if (window.PlanoFinanceiroApp && Array.isArray(PlanoFinanceiroApp.visoes) && PlanoFinanceiroApp.visoes.length) visoes = PlanoFinanceiroApp.visoes;
    visoes.forEach((v) => {
      (v.groups || []).forEach((g) => {
        const nome = this.fold(g && g.name);
        if (!g || (g.id !== "g_05_02" && !nome.includes("MARKETING"))) return;
        (g.accounts || []).forEach((id) => ids.add(String(id)));
      });
    });
    this._grupoMkt = { prefixos: [...prefixos], ids };
  },

  /** Conta paga entra no budget quando pertence ao grupo MARKETING (código, filha ou visão). */
  contaNoGrupoMarketing(catId) {
    const id = String(catId || "").trim();
    if (!id) return false;
    const grupo = this._grupoMkt || { prefixos: ["2.03.05"], ids: new Set() };
    if (grupo.ids && grupo.ids.has(id)) return true;
    const dig = id.replace(/\D/g, "");
    return (grupo.prefixos || []).some((p) => {
      if (id === p || id.startsWith(p + ".")) return true;
      const pd = String(p).replace(/\D/g, "");
      return !!(pd && dig && (dig === pd || dig.startsWith(pd)));
    });
  },

  /** Centro com MARKETING no nome: todas as despesas. Os demais: pago, em aberto e previsão do grupo. */
  gastoEntraNoBudget(r) {
    if (!r) return false;
    if (this.ccTemMarketing(r.ccId, r.ccNome)) return true;
    return this.contaNoGrupoMarketing(r.catId);
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  /** Número no padrão brasileiro, sem o símbolo R$. */
  valorLista(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  moneyShort(v) {
    const n = Number(v) || 0;
    const a = Math.abs(n);
    if (a >= 1e6) return "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi";
    if (a >= 1e3) return "R$ " + (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return this.money(n);
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : "—";
  },

  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  ccLabel(cc) {
    if (!cc) return "";
    const nome = String(cc.name || cc.nome || "").trim().toUpperCase();
    return nome ? `${cc.id} - ${nome}` : String(cc.id);
  },

  ccAtual() {
    return this.state.costCenters.find((c) => String(c.id) === String(this.state.ccId)) || null;
  },

  idsComUnidade() {
    const ids = new Set(this.state.ccsComUnidade || []);
    const E = window.EstoqueComercialApp;
    ((E && E.state && E.state.units) || []).forEach((u) => { if (u && u.enterpriseId) ids.add(String(u.enterpriseId)); });
    try {
      const raw = JSON.parse(localStorage.getItem("crm_estoque_posicao_v1") || "null");
      ((raw && (raw.units || (raw.data && raw.data.units))) || []).forEach((u) => { if (u && u.enterpriseId) ids.add(String(u.enterpriseId)); });
    } catch (e) {}
    try {
      const salvos = JSON.parse(localStorage.getItem("crm_cc_ids_com_unidade") || "[]");
      (Array.isArray(salvos) ? salvos : []).forEach((id) => id && ids.add(String(id)));
    } catch (e) {}
    return ids;
  },

  idsComCarteira() {
    const ids = new Set();
    const clientes = (window.AppState && AppState.customers) || {};
    Object.values(clientes).forEach((c) => { if (c && c.costCenterId != null && c.costCenterId !== "") ids.add(String(c.costCenterId)); });
    return ids;
  },

  /** Empreendimentos no padrão Moura Leite (tipo loteamento/incorporação no cadastro de centros de custo, sem CC de departamento) que têm unidades no estoque ou carteira. */
  empreendimentos() {
    const E = window.EstoqueComercialApp;
    let custom = {};
    try { custom = JSON.parse(localStorage.getItem("crm_centros_custo_custom") || "{}") || {}; } catch (e) {}
    const TIPOS = ["Loteamento Aberto", "Loteamento Fechado", "Incorporação"];
    const base = this.state.costCenters.filter((c) => {
      const id = String((c && c.id) || "").trim();
      if (!(E && E.isEmpreendimentoCcId ? E.isEmpreendimentoCcId(id) : /^[12]/.test(id))) return false;
      return !(E && E.isDeptOnlyCc && E.isDeptOnlyCc(c));
    });
    const tipados = base.filter((c) => TIPOS.includes((custom[c.id] || custom[String(c.id)] || {}).tipo_cc || ""));
    const lista = tipados.length ? tipados : base;
    const unidades = this.idsComUnidade();
    const carteira = this.idsComCarteira();
    if (!unidades.size && !carteira.size) return lista;
    return lista.filter((c) => unidades.has(String(c.id)) || carteira.has(String(c.id)));
  },

  temCadastroVerba(cfg) {
    if (!cfg || typeof cfg !== "object") return false;
    if (cfg.pct != null && cfg.pct !== "" && Number.isFinite(Number(cfg.pct))) return true;
    return Array.isArray(cfg.ccs) && cfg.ccs.length > 0;
  },

  idsComVerba() {
    const ids = new Set();
    const add = (map) => {
      Object.keys(map || {}).forEach((k) => {
        if (k === this.CAT_DOC) return;
        if (this.temCadastroVerba(map[k])) ids.add(String(k));
      });
    };
    add(this.state.verbas);
    add(this.configLocal());
    if (window.MarketingConfigApp && MarketingConfigApp.state) add(MarketingConfigApp.state.lista);
    return ids;
  },

  async carregarVerbas() {
    const lista = {};
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.getDocs) {
      try {
        const snap = await fc.getDocs(fc.collection(window.firebaseDb, this.CONFIG_COLLECTION));
        snap.forEach((d) => { if (d.id !== this.CAT_DOC) lista[d.id] = d.data() || {}; });
      } catch (e) {
        console.warn("[Budget] verbas", e);
      }
    }
    const local = this.configLocal();
    Object.keys(local).forEach((k) => {
      if (k !== this.CAT_DOC && !lista[k]) lista[k] = local[k];
    });
    this.state.verbas = lista;
  },

  empreendimentoOptions(selId, opts) {
    const sel = String(selId || "");
    let lista = this.empreendimentos();
    if (opts && opts.somenteVerba) {
      const ids = this.idsComVerba();
      lista = lista.filter((c) => ids.has(String(c.id)));
    }
    const atual = sel && !lista.some((c) => String(c.id) === sel) ? this.state.costCenters.find((c) => String(c.id) === sel) : null;
    const vazio = opts && opts.somenteVerba ? "Nenhum empreendimento com verba cadastrada" : "Selecione o empreendimento";
    return `<option value="">${vazio}</option>`
      + (atual ? [atual] : []).concat(lista).map((c) => `<option value="${this.esc(c.id)}" ${String(c.id) === sel ? "selected" : ""}>${this.esc(this.ccLabel(c))}</option>`).join("");
  },

  lotesDoEmpreendimento() {
    const id = String(this.state.ccId || "");
    if (!id) return { total: 0, vendidos: 0, faltam: 0 };
    const E = window.EstoqueComercialApp;
    let units = ((E && E.state && E.state.units) || []).filter((u) => String(u.enterpriseId) === id);
    if (!units.length) {
      try {
        const raw = JSON.parse(localStorage.getItem("crm_estoque_posicao_v1") || "null");
        units = ((raw && (raw.units || (raw.data && raw.data.units))) || []).filter((u) => String(u.enterpriseId) === id);
      } catch (e) { units = []; }
    }
    const vendido = (u) => {
      if (E && typeof E.isSoldUnit === "function") return E.isSoldUnit(u);
      const code = String((u && u.commercialStock) || "").toUpperCase();
      return ["V", "O", "G", "P", "L"].includes(code) || !!(u && u.contractId);
    };
    const vendidos = units.filter(vendido).length;
    return { total: units.length, vendidos, faltam: Math.max(0, units.length - vendidos) };
  },

  /** Sem estoque nem carteira carregados nesta sessão, lê do Firebase quais empreendimentos têm unidades. */
  async carregarUnidades() {
    const s = this.state;
    if (s.ccsComUnidade || this.idsComUnidade().size || this.idsComCarteira().size) return false;
    const fc = window.firebaseCollections;
    if (!(window.firebaseDb && fc && fc.getDocs)) return false;
    try {
      const snap = await fc.getDocs(fc.collection(window.firebaseDb, "estoque_comercial"));
      const ids = new Set();
      snap.forEach((d) => {
        const data = d.data() || {};
        if (d.id !== "_meta" && data.enterpriseId && Array.isArray(data.units) && data.units.length) ids.add(String(data.enterpriseId));
      });
      s.ccsComUnidade = [...ids];
      return ids.size > 0;
    } catch (e) {
      console.warn("[Budget] unidades por empreendimento", e);
      s.ccsComUnidade = [];
      return false;
    }
  },

  async carregarCcs() {
    const s = this.state;
    if (!s.costCenters.length) {
      try {
        const list = window.SiengeApiService && SiengeApiService.getCostCenters ? await SiengeApiService.getCostCenters() : [];
        s.costCenters = (Array.isArray(list) ? list : []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id), "pt-BR", { numeric: true }));
      } catch (e) {
        s.costCenters = [];
      }
    }
    return s.costCenters;
  },

  async init() {
    const s = this.state;
    if (!s.startDate) {
      const d = new Date();
      s.startDate = d.getFullYear() + "-01-01";
      s.endDate = d.getFullYear() + "-12-31";
    }
    await this.carregarCcs();
    await this.carregarVerbas();
    this.render();
    if (await this.carregarUnidades()) this.render();
  },

  /** Centros de custo que compõem os gastos da obra; sem configuração, só o centro da própria obra. */
  ccsDaConfig(cfg, obraId) {
    const ids = cfg && Array.isArray(cfg.ccs) && cfg.ccs.length ? cfg.ccs.map(String) : [String(obraId)];
    return [...new Set(ids)];
  },

  abrirConfig() {
    if (window.MarketingConfigApp) MarketingConfigApp.state.ccId = String(this.state.ccId || "");
    if (typeof switchTab === "function") switchTab("marketing-config", "Configurações");
  },

  /* ---------- configuração (% de marketing e planos financeiros) ---------- */
  configLocal() {
    try { return JSON.parse(localStorage.getItem(this.CONFIG_LOCAL) || "{}") || {}; } catch (e) { return {}; }
  },

  salvarConfigLocal(key, value) {
    const all = this.configLocal();
    all[key] = value;
    try { localStorage.setItem(this.CONFIG_LOCAL, JSON.stringify(all)); } catch (e) {}
  },

  async lerConfig(key) {
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.getDoc) {
      try {
        const snap = await fc.getDoc(fc.doc(window.firebaseDb, this.CONFIG_COLLECTION, key));
        if (snap.exists()) {
          const data = snap.data();
          this.salvarConfigLocal(key, data);
          return data;
        }
      } catch (e) {
        console.warn("[Budget] config", key, e);
      }
    }
    return this.configLocal()[key] || null;
  },

  async gravarConfig(key, data) {
    const payload = { ...data, updatedAt: new Date().toISOString(), updatedBy: (window.MarketingApp && MarketingApp.currentUserName()) || "" };
    this.salvarConfigLocal(key, payload);
    const fc = window.firebaseCollections;
    if (!window.firebaseDb || !fc || !fc.setDoc) return false;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, this.CONFIG_COLLECTION, key), payload, { merge: true });
      return true;
    } catch (e) {
      console.warn("[Budget] gravar config", key, e);
      return false;
    }
  },

  categoriasSelecionadas() {
    const s = this.state;
    if (Array.isArray(s.catSel)) return s.catSel;
    return Object.values(s.categorias).filter((c) => this.CAT_PADRAO.test(c.nome)).map((c) => c.id);
  },

  /* ---------- consulta ---------- */
  onCcSelect(id) {
    this.state.ccId = String(id || "");
  },

  onField(key, value) {
    this.state[key] = value;
  },

  textoProgresso(text) {
    return String(text || "")
      .replace(/\s*\(\s*\d+\s+de\s+\d+\s*\)/gi, "")
      .replace(/\s*·\s*período\s+\d+\s+de\s+\d+/gi, "")
      .replace(/\s*·\s*centro\s+[\d.\-]+/gi, "")
      .replace(/\s+\d+\s+de\s+\d+/gi, "")
      .replace(/\d+/g, "")
      .replace(/\s*·\s*(·\s*)+/g, " · ")
      .replace(/\s{2,}/g, " ")
      .trim();
  },

  setProgress(text, ratio) {
    const clean = this.textoProgresso(text);
    this.state.progress = clean;
    if (Number.isFinite(Number(ratio))) {
      this.state.progressRatio = Math.max(0, Math.min(1, Number(ratio)));
    }
    const el = document.getElementById("mkb-progress");
    if (el) el.textContent = clean;
    const bar = document.getElementById("mkb-progress-bar");
    if (bar) bar.style.width = Math.round((this.state.progressRatio || 0) * 100) + "%";
  },

  async consultar() {
    const s = this.state;
    const input = document.getElementById("mkb-cc");
    if (input) this.onCcSelect(input.value);
    const cc = this.ccAtual();
    if (!cc) { alert("Escolha o empreendimento (centro de custo)."); return; }
    if (!s.startDate || !s.endDate || s.startDate > s.endDate) { alert("Informe um período válido."); return; }
    const gen = (s.gen += 1);
    s.loading = true;
    s.error = "";
    s.consultado = true;
    s.progress = "Lendo o cadastro da obra (VGV)…";
    s.progressRatio = 0.06;
    s.rows = [];
    s.buscaCredor = "";
    s.filtroPlano = "";
    s.vendas = [];
    s.distratos = [];
    s.adimpl = { status: "", porVenda: {} };
    s.perfis = { status: "", map: {}, feitos: 0, total: 0 };
    this.render();
    try {
      this.setProgress("Lendo o cadastro da obra (VGV)…", 0.06);
      const [obra, cfg, catCfg] = await Promise.all([
        this.lerVgv(cc),
        this.lerConfig(String(cc.id)),
        this.lerConfig(this.CAT_DOC)
      ]);
      if (gen !== s.gen) return;
      s.obra = obra;
      s.pct = cfg && Number.isFinite(Number(cfg.pct)) ? Number(cfg.pct) : 0;
      s.ccsCfg = this.ccsDaConfig(cfg, cc.id);
      s.catSel = catCfg && Array.isArray(catCfg.ids) ? catCfg.ids.map(String) : null;
      s.eventos = await this.lerEventos(cc.id);
      this.setProgress("Lendo o grupo de marketing do plano financeiro…", 0.16);
      await this.carregarGrupoMarketing();
      if (gen !== s.gen) return;
      const faixas = typeof siengeSplitDateRange === "function"
        ? siengeSplitDateRange(s.startDate, s.endDate)
        : [{ start: s.startDate, end: s.endDate }];
      const totalPassos = Math.max(1, s.ccsCfg.length * faixas.length);
      const bills = [];
      for (let i = 0; i < s.ccsCfg.length; i++) {
        const alvo = s.costCenters.find((c) => String(c.id) === s.ccsCfg[i]) || { id: s.ccsCfg[i] };
        const parte = await this.buscarTitulos(alvo, gen, "", (idx) => {
          const passo = i * faixas.length + idx + 1;
          this.setProgress("Buscando os títulos a pagar…", 0.16 + 0.72 * (passo / totalPassos));
        });
        if (gen !== s.gen) return;
        bills.push.apply(bills, parte);
      }
      this.montarGastos(bills, s.ccsCfg);
      this.setProgress("Buscando as vendas do empreendimento…", 0.94);
      await this.buscarVendas(cc, gen);
    } catch (e) {
      if (gen !== s.gen) return;
      console.error("[Budget]", e);
      s.error = (e && e.message) ? e.message : "Falha ao consultar o Sienge.";
    }
    if (gen !== s.gen) return;
    s.loading = false;
    s.progress = "";
    this.render();
    if (!s.error) this.carregarComplementos(cc, gen);
  },

  /** Depois do budget na tela: situação de pagamento das vendas e perfil dos clientes. */
  async carregarComplementos(cc, gen) {
    const s = this.state;
    if (!s.vendas.length && !s.distratos.length) return;
    try {
      await this.carregarAdimplencia(cc, gen);
    } catch (e) {
      console.warn("[Budget] adimplência", e);
      if (gen === s.gen) s.adimpl.status = "erro";
    }
    if (gen !== s.gen) return;
    this.repintarVendas();
    if (s.aba === "perfil" || s.aba === "contratos") this.render();
    try {
      await this.carregarPerfis(gen);
    } catch (e) {
      console.warn("[Budget] perfil", e);
      if (gen === s.gen) s.perfis.status = "erro";
    }
    if (gen === s.gen && s.aba === "perfil") this.render();
  },

  async lerVgv(cc) {
    let obra = null;
    try {
      obra = window.SiengeApiService && SiengeApiService.getEnterpriseVgv ? await SiengeApiService.getEnterpriseVgv(cc.id) : null;
    } catch (e) {
      console.warn("[Budget] obra", cc.id, e);
    }
    if (obra && obra.vgv > 0) return { vgv: obra.vgv, fonte: "obra", nome: obra.nome || "" };
    let custom = {};
    try {
      const raw = localStorage.getItem("crm_centros_custo_custom") || "{}";
      custom = typeof window.parseCentrosCustoCustomMap === "function" ? window.parseCentrosCustoCustomMap(raw) : (JSON.parse(raw) || {});
    } catch (e) {}
    if (window.CentrosCustoState && CentrosCustoState.customFields) custom = Object.assign({}, custom, CentrosCustoState.customFields);
    const manual = parseFloat((custom[cc.id] || custom[String(cc.id)] || {}).valor_vgv) || 0;
    if (manual > 0) return { vgv: manual, fonte: "centro", nome: "" };
    return { vgv: 0, fonte: "sem", nome: (obra && obra.nome) || "" };
  },

  async lerEventos(ccId) {
    let list = (window.MarketingState && MarketingState.budgets) || [];
    if (!list.length && window.firebaseDb && window.firebaseCollections) {
      try {
        const { collection, getDocs } = window.firebaseCollections;
        const snap = await getDocs(collection(window.firebaseDb, "marketing_budgets"));
        list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      } catch (e) {
        list = [];
      }
    }
    return list.filter((b) => String(b.costCenterId) === String(ccId));
  },

  async buscarTitulos(cc, gen, rotulo, onStep) {
    const base = window.ComprasControleApp || window.ComprasPrevisoesApp;
    if (!base || typeof base.outcomeRange !== "function") throw new Error("O módulo de contas a pagar não está disponível.");
    const s = this.state;
    const api = Object.create(base);
    api.outcomeEndpoint = (start, end, companyId) => "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false&withBankMovements=true"
      + "&costCentersId=" + encodeURIComponent(cc.id)
      + (companyId ? "&companyId=" + encodeURIComponent(companyId) : "");
    const fase = "Buscando os títulos a pagar…";
    api.noteProgress = () => { if (gen === s.gen) this.setProgress(fase); };
    const companyId = String(cc.idCompany != null ? cc.idCompany : (cc.companyId != null ? cc.companyId : ""));
    const faixas = typeof siengeSplitDateRange === "function" ? siengeSplitDateRange(s.startDate, s.endDate) : [{ start: s.startDate, end: s.endDate }];
    const bills = [];
    for (let i = 0; i < faixas.length; i++) {
      if (gen !== s.gen) return [];
      if (typeof onStep === "function") onStep(i, faixas.length);
      else this.setProgress(fase);
      const parte = await api.outcomeRange(faixas[i].start, faixas[i].end, companyId);
      if (Array.isArray(parte)) bills.push.apply(bills, parte);
    }
    return bills;
  },

  montarGastos(bills, ccIds) {
    const app = window.ComprasControleApp || window.ComprasPrevisoesApp;
    const ccSet = new Set((ccIds || []).map(String));
    const lista = (x) => (Array.isArray(x) ? x : (x ? [x] : []));
    const cats = {};
    const rows = [];
    const vistos = {};
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const docId = app.docCode(bill.documentIdentificationId);
      const docNome = bill.documentIdentificationName || "";
      const minhas = lista(bill.paymentsCategories).filter((c) => c && ccSet.has(String(c.costCenterId)));
      if (!minhas.length) return;
      const pays = lista(bill.payments);
      const movsDe = (p) => {
        const bms = lista(p && p.bankMovements);
        return bms.length ? bms : [null];
      };
      if (pays.some((p) => movsDe(p).some((bm) => app.isSubstituicao(bill, p, bm, docId, docNome)))) return;
      const previsao = app.ehPrevisao(docId, docNome, bill);
      let pago = false;
      let dataPg = "";
      pays.forEach((p) => {
        movsDe(p).forEach((bm) => {
          if (bm && app.SKIP_OPS[bm.operationName || ""]) return;
          if (app.isPago(bill, p, bm, docId, docNome)) {
            pago = true;
            const d = app.paymentDateOf(bill, p, bm);
            if (d && d > dataPg) dataPg = d;
          }
        });
      });
      const original = Number(bill.originalAmount) || 0;
      const saldo = app.billBalance(bill);
      let realizado = 0;
      if (!previsao && pago) realizado = saldo != null && saldo > 0.009 ? Math.max(0, original - saldo) : original;
      const aberto = Math.max(0, original - realizado);
      const titulo = String(bill.billId);
      const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
      const venc = String(bill.dueDate || "").slice(0, 10);
      const tituloInfo = {
        companyId: bill.companyId != null ? String(bill.companyId) : "",
        docId, docNum: String(bill.documentNumber || ""),
        emissao: String(bill.issueDate || "").slice(0, 10),
        tOriginal: original, tRealizado: realizado, tAberto: aberto, dataPg
      };
      minhas.forEach((cat) => {
        const catId = String(cat.financialCategoryId != null ? cat.financialCategoryId : (cat.financialCategoryName || "?"));
        const catNome = cat.financialCategoryName || "Sem plano financeiro";
        const rate = cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) / 100 : 1;
        const fat = Number.isFinite(rate) ? rate : 1;
        const ccId = String(cat.costCenterId);
        const push = (status, valor, data) => {
          if (!(valor > 0.009)) return;
          const key = [titulo, parcela, ccId, catId, status].join("|");
          if (vistos[key]) return;
          vistos[key] = true;
          rows.push({
            titulo, parcela, ccId, catId, catNome, status, data, vencimento: venc, valor,
            ccNome: cat.costCenterName || "",
            credor: String(bill.creditorName || "").trim(),
            documento: [docId, bill.documentNumber].filter(Boolean).join(" "),
            ...tituloInfo
          });
          if (!cats[catId]) cats[catId] = { id: catId, nome: catNome, total: 0 };
          cats[catId].total += valor;
        };
        if (previsao) push("previsao", original * fat, venc);
        else {
          push("realizado", realizado * fat, dataPg || venc);
          push("comprometido", aberto * fat, venc);
        }
      });
    });
    rows.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    rows.forEach((r, i) => { r.idx = i; });
    this.state.rows = rows;
    this.state.categorias = cats;
  },

  async buscarVendas(cc, gen) {
    const s = this.state;
    const todas = async (base) => {
      let out = [];
      let offset = 0;
      for (let guard = 0; guard < 50; guard++) {
        if (gen !== s.gen) return out;
        const res = await siengeFetchWithRetry(`${base}&limit=200&offset=${offset}`).catch(() => ({ results: [] }));
        const rs = (res && res.results) || [];
        out = out.concat(rs);
        if (rs.length < 200) break;
        offset += 200;
      }
      return out;
    };
    const q = `enterpriseId=${encodeURIComponent(cc.id)}`;
    const [emitidos, cancelados, quitados, distratos] = await Promise.all([
      todas(`/sales-contracts?${q}&situation=2&initialIssueDate=${s.startDate}&finalIssueDate=${s.endDate}`),
      todas(`/sales-contracts?${q}&situation=3&initialIssueDate=${s.startDate}&finalIssueDate=${s.endDate}`),
      todas(`/sales-contracts?${q}&situation=4&initialIssueDate=${s.startDate}&finalIssueDate=${s.endDate}`),
      todas(`/sales-contracts?${q}&situation=3&initialCancelDate=${s.startDate}&finalCancelDate=${s.endDate}`)
    ]);
    const doEmp = (c) => !c.enterpriseId || String(c.enterpriseId) === String(cc.id);
    const vistos = new Set();
    const vendas = [];
    emitidos.concat(cancelados, quitados).forEach((c) => {
      const id = String(c && c.id != null ? c.id : "");
      if (!id || vistos.has(id) || !doEmp(c)) return;
      vistos.add(id);
      vendas.push(this.slimVenda(c));
    });
    const dVistos = new Set();
    s.distratos = distratos.filter((c) => {
      const id = String(c && c.id != null ? c.id : "");
      if (!id || dVistos.has(id) || !doEmp(c)) return false;
      dVistos.add(id);
      return true;
    }).map((c) => this.slimVenda(c));
    s.vendas = vendas.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  },

  slimVenda(c) {
    const units = (c.salesContractUnits || c.units || []);
    const cust = (c.salesContractCustomers || []).find((x) => x.main) || (c.salesContractCustomers || [])[0] || {};
    const sit = String(c.situation == null ? "" : c.situation);
    return {
      id: String(c.id),
      numero: c.number || c.contractNumber || String(c.id),
      data: String(c.issueDate || c.contractDate || "").slice(0, 10),
      dataCancel: String(c.cancellationDate || "").slice(0, 10),
      unidades: units.length || 1,
      unidadeNomes: units.map((u) => u.name).filter(Boolean).join(", "),
      unidadeIds: units.map((u) => String(u.id != null ? u.id : "")).filter(Boolean),
      billId: c.receivableBillId != null ? String(c.receivableBillId) : "",
      clienteId: cust.id != null ? String(cust.id) : "",
      cliente: cust.name || "",
      valor: Number(c.totalSellingValue || c.value || 0) || 0,
      situacao: sit === "3" || /cancel/i.test(sit) ? "Cancelado" : (sit === "4" ? "Quitado" : "Emitido")
    };
  },

  /* ---------- situação de pagamento (extrato do Contas a Receber) ---------- */
  hoje() {
    return window.EstoqueComercialApp && EstoqueComercialApp.todayStr ? EstoqueComercialApp.todayStr() : this.iso(new Date());
  },

  async carregarAdimplencia(cc, gen) {
    const s = this.state;
    const est = window.EstoqueComercialApp;
    if (!est || typeof est.fetchExtratoCc !== "function") {
      s.adimpl.status = "erro";
      return;
    }
    s.adimpl = { status: "carregando", porVenda: {} };
    this.repintarVendas();
    const bills = est.agruparExtratoCc(await est.fetchExtratoCc(cc.id));
    if (gen !== s.gen) return;
    const porId = {};
    const porCliUnid = {};
    bills.forEach((b) => {
      porId[b.id] = b;
      const cli = String((b.cliente && b.cliente.id) || "");
      b.units.forEach((u) => {
        porCliUnid[cli + "|" + u.id] = b;
        if (u.name) porCliUnid[cli + "|n:" + String(u.name).trim().toUpperCase()] = b;
      });
    });
    const hoje = this.hoje();
    const porVenda = {};
    s.vendas.concat(s.distratos).forEach((v) => {
      if (porVenda[v.id]) return;
      if (v.situacao === "Cancelado") { porVenda[v.id] = { status: "cancelado" }; return; }
      let b = v.billId ? porId[v.billId] : null;
      if (!b) b = v.unidadeIds.map((u) => porCliUnid[v.clienteId + "|" + u]).find(Boolean) || null;
      if (!b && v.unidadeNomes) b = v.unidadeNomes.split(",").map((n) => porCliUnid[v.clienteId + "|n:" + n.trim().toUpperCase()]).find(Boolean) || null;
      if (!b) { porVenda[v.id] = { status: "sem-titulo" }; return; }
      porVenda[v.id] = this.analisarTitulo(b, hoje);
    });
    const contratos = bills
      .filter((b) => !b.revoked && b.nParcelas > 0 && (b.aberto > 0.009 || b.recebido > 0.009))
      .map((b) => ({
        id: "t" + b.id,
        numero: "Título " + b.id,
        data: "",
        unidadeNomes: b.units.map((u) => u.name).filter(Boolean).join(", "),
        cliente: (b.cliente && b.cliente.name) || "",
        valor: b.aberto + b.recebido,
        pag: this.analisarTitulo(b, hoje)
      }));
    s.adimpl = { status: "ok", porVenda, contratos };
  },

  /** Parcela de entrada pelo tipo de condição do Sienge (E1, E2…, entrada, sinal, ato). */
  ehEntrada(p) {
    const fold = (x) => String(x == null ? "" : (typeof x === "object" ? (x.id || x.code || x.description || x.name || "") : x))
      .toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const key = fold(typeof window.installmentConditionKey === "function" ? window.installmentConditionKey(p) : "");
    if (/^(E\d*|SI|AT)$/.test(key)) return true;
    const txt = [p.conditionType, p.conditionTypeName, p.paymentConditionType, p.paymentConditionTypeName, p.paymentTerm, p.installmentType].map(fold).join(" ");
    return /\bENTRADA\b|\bSINAL\b|\bATO\b|\bE\d+\b/.test(txt);
  },

  /** Situação do título a receber: atraso, quanto já foi pago e se a entrada está paga. */
  analisarTitulo(b, hoje) {
    const pago = Number(b.recebido) || 0;
    const aberto = Number(b.aberto) || 0;
    const total = pago + aberto;
    const entrada = { tem: false, aberta: 0, vencida: 0, desde: "" };
    Object.values(b.parcelas || {}).forEach((p) => {
      if (!p || !this.ehEntrada(p)) return;
      entrada.tem = true;
      const saldo = Number(p.currentBalance) || 0;
      if (!(saldo > 0.009)) return;
      const due = String(p.dueDate || "").slice(0, 10);
      entrada.aberta += saldo;
      if (due && due < hoje) {
        entrada.vencida += saldo;
        if (!entrada.desde || due < entrada.desde) entrada.desde = due;
      }
    });
    const base = { recebido: pago, aberto, pctPago: total > 0.009 ? (pago / total) * 100 : 0, entrada };
    const atrasada = (b.abertas || []).find((p) => p.overdue);
    if (atrasada) {
      const dias = Math.max(1, Math.round((new Date(hoje + "T12:00:00") - new Date(atrasada.due + "T12:00:00")) / 86400000));
      return { ...base, status: "inadimplente", desde: atrasada.due, dias, vencido: b.vencido };
    }
    return { ...base, status: aberto > 0.009 ? "adimplente" : "quitado" };
  },

  atrasoHtml(v) {
    const a = this.state.adimpl;
    if (v.situacao === "Cancelado") return `<span class="mkb-muted">—</span>`;
    if (a.status === "carregando" || a.status === "") return `<span class="mkb-muted">Consultando…</span>`;
    if (a.status === "erro") return `<span class="mkb-muted" title="Não consegui ler o Contas a Receber">—</span>`;
    const p = v.pagDireto || a.porVenda[v.id] || {};
    if (p.status === "inadimplente") {
      return `<span class="mkb-atraso" title="Inadimplente · ${this.money(p.vencido)} vencido">${this.dataBr(p.desde)} <small>(${p.dias} dia${p.dias === 1 ? "" : "s"})</small></span>`;
    }
    if (p.status === "adimplente") return `<span class="mkb-st mkb-st-realizado" title="Adimplente">Em dia</span>`;
    if (p.status === "quitado") return `<span class="mkb-st mkb-st-previsao" title="Todas as parcelas pagas">Quitado</span>`;
    return `<span class="mkb-muted" title="Não achei o título a receber deste contrato">Sem título</span>`;
  },

  repintarVendas() {
    const box = document.getElementById("mkb-vendas");
    if (box) box.innerHTML = this.vendasHtml();
  },

  /* ---------- perfil dos clientes (sexo e idade) ---------- */
  perfilCache() {
    try { return JSON.parse(localStorage.getItem(this.PERFIL_LOCAL) || "{}") || {}; } catch (e) { return {}; }
  },

  perfilDe(c) {
    if (!c || typeof c !== "object") return null;
    const doc = String(c.cnpj || "").replace(/\D/g, "");
    const pj = /jur/i.test(String(c.personType || "")) || doc.length === 14;
    const sx = String(c.sex || c.gender || "").trim().toUpperCase();
    const sexo = pj ? "PJ" : (sx === "F" || sx.startsWith("FEM") ? "F" : (sx === "M" || sx.startsWith("MASC") ? "M" : "?"));
    const nasc = /^\d{4}-\d{2}-\d{2}/.test(String(c.birthDate || "")) ? String(c.birthDate).slice(0, 10) : "";
    return { sexo, nasc: pj ? "" : nasc };
  },

  async lerPerfilCliente(id) {
    const fc = window.firebaseCollections;
    let p = null;
    if (window.firebaseDb && fc && fc.getDoc) {
      try {
        const snap = await fc.getDoc(fc.doc(window.firebaseDb, "sienge_customers", String(id)));
        if (snap.exists()) p = this.perfilDe(snap.data());
      } catch (e) {}
    }
    if ((!p || p.sexo === "?" || (p.sexo !== "PJ" && !p.nasc)) && typeof window.siengeFetchWithRetry === "function") {
      try {
        const q = this.perfilDe(await window.siengeFetchWithRetry(`/customers/${encodeURIComponent(id)}`));
        if (q) p = { sexo: q.sexo !== "?" ? q.sexo : ((p && p.sexo) || "?"), nasc: q.nasc || (p && p.nasc) || "" };
      } catch (e) {}
    }
    return p;
  },

  async carregarPerfis(gen) {
    const s = this.state;
    const ids = [...new Set(s.vendas.concat(s.distratos).map((v) => v.clienteId).filter(Boolean))];
    const cache = this.perfilCache();
    const limite = Date.now() - 30 * 86400000;
    const map = {};
    const faltam = [];
    ids.forEach((id) => {
      const c = cache[id];
      if (c && c.at > limite) map[id] = c;
      else faltam.push(id);
    });
    s.perfis = { status: faltam.length ? "carregando" : "ok", map, feitos: ids.length - faltam.length, total: ids.length };
    if (s.aba === "perfil") this.render();
    let i = 0;
    let ultimaPintura = Date.now();
    const worker = async () => {
      while (i < faltam.length) {
        if (gen !== s.gen) return;
        const id = faltam[i++];
        const p = await this.lerPerfilCliente(id);
        if (p) {
          map[id] = { ...p, at: Date.now() };
          cache[id] = map[id];
        }
        s.perfis.feitos += 1;
        const el = document.getElementById("mkb-perfil-prog");
        if (el) el.textContent = `Lendo o cadastro dos clientes · ${s.perfis.feitos} de ${s.perfis.total}`;
        if (s.aba === "perfil" && Date.now() - ultimaPintura > 4000) {
          ultimaPintura = Date.now();
          this.render();
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (gen !== s.gen) return;
    try { localStorage.setItem(this.PERFIL_LOCAL, JSON.stringify(cache)); } catch (e) {}
    s.perfis.status = "ok";
  },

  idade(nasc, data) {
    if (!nasc) return null;
    const ref = data || this.hoje();
    let a = Number(ref.slice(0, 4)) - Number(nasc.slice(0, 4));
    if (ref.slice(5, 10) < nasc.slice(5, 10)) a -= 1;
    return a >= 14 && a <= 110 ? a : null;
  },

  faixa(idade) {
    if (idade == null) return "Sem nascimento";
    if (idade <= 25) return "Até 25";
    if (idade <= 35) return "26 a 35";
    if (idade <= 45) return "36 a 45";
    if (idade <= 55) return "46 a 55";
    if (idade <= 65) return "56 a 65";
    return "Acima de 65";
  },

  /** Cada contrato com sexo, faixa etária, situação de pagamento e (se cancelado) tempo até o cancelamento. */
  linhasPerfil() {
    const s = this.state;
    const vistos = new Set();
    return s.vendas.concat(s.distratos).filter((v) => !vistos.has(v.id) && vistos.add(v.id)).map((v) => {
      const p = s.perfis.map[v.clienteId] || null;
      const sexo = p ? p.sexo : "?";
      const idade = p && sexo !== "PJ" ? this.idade(p.nasc, v.data) : null;
      const pag = s.adimpl.porVenda[v.id] || {};
      const cancelado = v.situacao === "Cancelado";
      let meses = null;
      if (cancelado && v.data && v.dataCancel) {
        meses = Math.max(0, Math.round((new Date(v.dataCancel + "T12:00:00") - new Date(v.data + "T12:00:00")) / (30.44 * 86400000)));
      }
      return {
        v, sexo, idade, cancelado, meses,
        faixa: sexo === "PJ" ? "Pessoa jurídica" : this.faixa(idade),
        pag: pag.status || "",
        vencido: pag.vencido || 0
      };
    });
  },

  /* ---------- números ---------- */
  resumo() {
    const s = this.state;
    const rows = s.rows.filter((r) => this.gastoEntraNoBudget(r));
    const soma = (st) => rows.filter((r) => r.status === st).reduce((t, r) => t + r.valor, 0);
    const verba = (Number(s.obra && s.obra.vgv) || 0) * ((Number(s.pct) || 0) / 100);
    const realizado = soma("realizado");
    const previsto = soma("previsao");
    const comprometido = soma("comprometido") + previsto;
    const brutas = s.vendas.reduce((t, v) => t + v.unidades, 0);
    const distr = s.distratos.reduce((t, v) => t + v.unidades, 0);
    const liquidas = Math.max(0, brutas - distr);
    return {
      rows, verba, realizado, comprometido, previsto,
      saldo: verba - realizado - comprometido,
      consumo: verba > 0 ? ((realizado + comprometido) / verba) * 100 : 0,
      brutas, distr, liquidas,
      vgvVendido: s.vendas.filter((v) => v.situacao !== "Cancelado").reduce((t, v) => t + v.valor, 0),
      cac: liquidas > 0 ? realizado / liquidas : null,
      cacTotal: liquidas > 0 ? (realizado + comprometido) / liquidas : null
    };
  },

  meses() {
    const s = this.state;
    const out = [];
    let d = new Date(s.startDate.slice(0, 7) + "-01T12:00:00");
    const fim = s.endDate.slice(0, 7);
    for (let i = 0; i < 60; i++) {
      const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      out.push(k);
      if (k >= fim) break;
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  },

  setFiltroGasto(id) {
    this.state.filtroGasto = this.state.filtroGasto === id && id !== "todos" ? "todos" : id;
    this.pintarGastos();
  },

  setBuscaCredor(v) {
    this.state.buscaCredor = v;
    this.pintarGastosCorpo();
  },

  setFiltroPlano(id) {
    this.state.filtroPlano = id || "";
    this.pintarGastos();
  },

  ordenarGasto(col) {
    const s = this.state;
    if (s.sortGasto === col) s.sortGastoDir = s.sortGastoDir === "asc" ? "desc" : "asc";
    else {
      s.sortGasto = col;
      s.sortGastoDir = col === "plano" ? "asc" : "desc";
    }
    this.pintarGastos();
  },

  pintarGastos() {
    const box = document.getElementById("mkb-gastos");
    if (!box) return;
    box.innerHTML = this.gastosHtml(this.resumo());
    if (window.lucide) lucide.createIcons();
  },

  pintarGastosCorpo() {
    const body = document.getElementById("mkb-gastos-body");
    const sel = document.getElementById("mkb-sel-val");
    if (!body || !sel) { this.pintarGastos(); return; }
    const view = this.gastosView(this.resumo());
    body.innerHTML = this.gastosLinhas(view.lista);
    sel.innerHTML = this.gastosSelecaoHtml(view.lista);
  },

  gastosView(r) {
    const s = this.state;
    const base = s.filtroGasto === "todos" ? r.rows : r.rows.filter((x) => x.status === s.filtroGasto);
    const planos = new Map();
    base.forEach((x) => { if (!planos.has(String(x.catId))) planos.set(String(x.catId), x.catNome || "Sem plano financeiro"); });
    const q = String(s.buscaCredor || "").trim().toLowerCase();
    let lista = base;
    if (q) lista = lista.filter((x) => String(x.credor || "").toLowerCase().includes(q));
    if (s.filtroPlano) lista = lista.filter((x) => String(x.catId) === String(s.filtroPlano));
    const dir = s.sortGastoDir === "asc" ? 1 : -1;
    const campo = s.sortGasto === "plano" ? "catNome" : "data";
    lista = lista.slice().sort((a, b) => {
      const c = String(a[campo] || "").localeCompare(String(b[campo] || ""), "pt-BR", { numeric: true, sensitivity: "base" });
      return c * dir;
    });
    return { lista, planos: [...planos.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR", { sensitivity: "base" })) };
  },

  gastosSelecaoHtml(lista) {
    const total = lista.reduce((t, x) => t + (Number(x.valor) || 0), 0);
    const n = lista.length;
    return `<span>Seleção</span><strong>${this.valorLista(total)}</strong><small>${n.toLocaleString("pt-BR")} título${n === 1 ? "" : "s"}</small>`;
  },

  gastosLinhas(lista) {
    const s = this.state;
    const nomes = { realizado: "Realizado", comprometido: "Comprometido", previsao: "Previsão" };
    if (!lista.length) {
      const vazio = s.buscaCredor || s.filtroPlano ? "com esse filtro" : (s.filtroGasto === "todos" ? "no período" : "nesta situação");
      return `<tr><td colspan="7" class="mkb-vazio">Nenhum gasto ${vazio}.</td></tr>`;
    }
    return lista.map((x) => `<tr class="mkb-click" onclick="MarketingBudgetApp.abrirDespesa(${x.idx})" title="Clique para ver o resumo do título">
        <td>${this.dataBr(x.data)}</td>
        <td><span class="mkb-st mkb-st-${x.status}">${nomes[x.status]}</span></td>
        <td><strong>${this.esc(x.titulo)}</strong>${x.parcela ? `<span class="mkb-muted"> / ${this.esc(x.parcela)}</span>` : ""}</td>
        <td title="${this.esc(x.credor)}">${this.esc(x.credor)}</td>
        <td>${this.esc(x.documento || "—")}</td>
        <td title="${this.esc(x.catNome)}">${this.esc(x.catNome)}</td>
        <td style="text-align:right;">${this.valorLista(x.valor)}</td>
      </tr>`).join("");
  },

  exportarGastos() {
    if (typeof XLSX === "undefined") {
      alert("A biblioteca XLSX não foi carregada. Atualize a página e tente novamente.");
      return;
    }
    const nomes = { realizado: "Realizado", comprometido: "Comprometido", previsao: "Previsão" };
    const lista = this.gastosView(this.resumo()).lista;
    const aoa = [["Data", "Situação", "Título", "Parcela", "Credor", "Documento", "Plano financeiro", "Valor"]];
    lista.forEach((x) => aoa.push([
      this.dataBr(x.data), nomes[x.status] || x.status, x.titulo, x.parcela || "",
      x.credor || "", x.documento || "", x.catNome || "", Number(x.valor) || 0
    ]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (let i = 1; i < aoa.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: i, c: 7 })];
      if (cell) cell.z = "#,##0.00";
    }
    ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 36 }, { wch: 16 }, { wch: 36 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Títulos");
    XLSX.writeFile(wb, "budget_titulos_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  },

  /* ---------- render ---------- */
  kpi(label, valor, sub, cor, extra) {
    return `<div class="mkb-kpi" style="border-top-color:${cor};">
      <span>${label}</span><strong>${valor}</strong>${sub ? `<small>${sub}</small>` : ""}${extra || ""}
    </div>`;
  },

  secao(titulo, texto, miolo) {
    return `<section class="mkb-sec">
      <div class="mkb-sec-h"><h3>${titulo}</h3>${texto ? `<small>${texto}</small>` : ""}</div>
      ${miolo}
    </section>`;
  },

  gastosHtml(r) {
    const s = this.state;
    const nomes = { realizado: "Realizado", comprometido: "Comprometido", previsao: "Previsão" };
    const cont = { todos: r.rows.length, realizado: 0, comprometido: 0, previsao: 0 };
    r.rows.forEach((x) => { cont[x.status] += 1; });
    const view = this.gastosView(r);
    const chips = ["todos", "realizado", "comprometido", "previsao"].map((id) => `<button type="button" class="mkb-chip${s.filtroGasto === id ? " is-on" : ""}" onclick="MarketingBudgetApp.setFiltroGasto('${id}')">${id === "todos" ? "Todos" : nomes[id]} <b>${cont[id]}</b></button>`).join("");
    const thSort = (col, rotulo, direita) => `<th onclick="MarketingBudgetApp.ordenarGasto('${col}')" style="cursor:pointer;user-select:none;${direita ? "text-align:right;" : ""}">${rotulo} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
    const planos = view.planos.some(([id]) => String(id) === String(s.filtroPlano)) || !s.filtroPlano
      ? view.planos
      : view.planos.concat([[s.filtroPlano, s.filtroPlano]]);
    return `<div class="mkb-gastos-bar">
      <div class="mkb-chips">${chips}</div>
      <input id="mkb-credor" class="mkb-busca" type="search" placeholder="Credor" value="${this.esc(s.buscaCredor)}" oninput="MarketingBudgetApp.setBuscaCredor(this.value)">
      <select id="mkb-plano" class="mkb-plano" onchange="MarketingBudgetApp.setFiltroPlano(this.value)">
        <option value="">Plano financeiro</option>
        ${planos.map(([id, nome]) => `<option value="${this.esc(id)}"${String(s.filtroPlano) === String(id) ? " selected" : ""}>${this.esc(nome)}</option>`).join("")}
      </select>
      <div class="mkb-gastos-tools">
        <div class="mkb-sel-val" id="mkb-sel-val">${this.gastosSelecaoHtml(view.lista)}</div>
        <button type="button" class="btn btn-excel" onclick="MarketingBudgetApp.exportarGastos()" title="Exportar tabela atual para Excel">
          <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel
        </button>
      </div>
    </div>
      <div class="mkb-tablewrap"><table class="mkb-table">
        <colgroup><col style="width:10%"><col style="width:12%"><col style="width:12%"><col style="width:22%"><col style="width:12%"><col style="width:20%"><col style="width:12%"></colgroup>
        <thead><tr>${thSort("data", "Data")}<th>Situação</th><th>Título</th><th>Credor</th><th>Documento</th>${thSort("plano", "Plano financeiro")}<th style="text-align:right;">Valor</th></tr></thead>
        <tbody id="mkb-gastos-body">${this.gastosLinhas(view.lista)}</tbody>
      </table></div>`;
  },

  /** Mesmo resumo do título do Controle financeiro (Compras): dados, anexos e forma de pagamento. */
  abrirDespesa(idx) {
    const x = this.state.rows[Number(idx)];
    if (!x) return;
    const app = window.ComprasControleApp;
    if (!app || typeof app.abrirTituloRow !== "function") {
      alert("O módulo de compras não está disponível para abrir o título.");
      return;
    }
    const pago = x.status === "realizado";
    app.abrirTituloRow({
      titulo: x.titulo,
      parcela: x.parcela,
      credor: x.credor,
      docId: x.docId,
      documento: x.docNum,
      vencimento: x.vencimento,
      emissao: x.emissao,
      companyId: x.companyId,
      ccId: x.ccId,
      ccNome: x.ccNome,
      planoId: x.catId,
      plano: x.catNome,
      natureza: pago ? "pago" : (x.status === "previsao" ? "previsao" : "programado"),
      dataPagamento: pago ? (x.dataPg || x.data) : "",
      valor: x.tOriginal,
      valorAjustado: pago ? x.tRealizado : x.tOriginal,
      saldo: x.status === "comprometido" ? x.tAberto : 0,
      situacaoTexto: pago ? "Pago" : (x.status === "previsao" ? "Previsão" : "Em aberto")
    });
  },

  vendasHtml() {
    const s = this.state;
    const lista = s.vendas.concat(s.distratos.filter((d) => !s.vendas.some((v) => v.id === d.id)));
    const linhas = lista.length ? lista.map((v) => `<tr>
        <td>${this.dataBr(v.data)}</td>
        <td><strong>${this.esc(v.numero)}</strong></td>
        <td title="${this.esc(v.unidadeNomes)}">${this.esc(v.unidadeNomes || v.unidades + " unid.")}</td>
        <td title="${this.esc(v.cliente)}">${this.esc(v.cliente || "—")}</td>
        <td style="text-align:right;">${this.money(v.valor)}</td>
        <td><span class="mkb-st ${v.situacao === "Cancelado" ? "mkb-st-cancel" : "mkb-st-realizado"}">${v.situacao}${v.situacao === "Cancelado" && v.dataCancel ? " em " + this.dataBr(v.dataCancel) : ""}</span></td>
        <td>${this.atrasoHtml(v)}</td>
      </tr>`).join("")
      : `<tr><td colspan="7" class="mkb-vazio">Nenhuma venda deste empreendimento no período.</td></tr>`;
    return `<div class="mkb-tablewrap"><table class="mkb-table">
        <colgroup><col style="width:9%"><col style="width:13%"><col style="width:10%"><col style="width:22%"><col style="width:11%"><col style="width:17%"><col style="width:18%"></colgroup>
        <thead><tr><th>Emissão</th><th>Contrato</th><th>Unidade</th><th>Cliente</th><th style="text-align:right;">Valor</th><th>Situação</th><th>Atrasado desde</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>`;
  },

  /* ---------- planos financeiros de marketing (lista com Marcar Todos / Desmarcar Todos) ---------- */
  CAT_FILTRO: "mkb-cats",

  catItens() {
    return Object.values(this.state.categorias).map((c) => ({ id: c.id, label: `${c.nome} · ${this.moneyShort(c.total)}` }));
  },

  catOpts() {
    const s = this.state;
    return {
      id: this.CAT_FILTRO,
      label: "Planos financeiros considerados marketing",
      items: this.catItens(),
      selectedIds: s.catOpen && s.catPend ? s.catPend : this.categoriasSelecionadas(),
      open: !!s.catOpen,
      query: s.catQuery || "",
      emptyMeansAll: false,
      countMode: true,
      nouns: { singular: "plano financeiro", plural: "planos financeiros", none: "Nenhum plano financeiro", noMatch: "Nenhum plano financeiro com esse nome." }
    };
  },

  pintarCatFiltro() {
    const slot = document.getElementById("mkb-cats-slot");
    if (!slot) return;
    const lista = document.getElementById(this.CAT_FILTRO + "-list");
    const top = lista ? lista.scrollTop : 0;
    slot.innerHTML = MlEmpresaFilter.html(this.catOpts());
    const nova = document.getElementById(this.CAT_FILTRO + "-list");
    if (nova && top) nova.scrollTop = top;
    if (window.lucide) lucide.createIcons();
  },

  pintarCatLista() {
    const el = document.getElementById(this.CAT_FILTRO + "-list");
    if (!el) return;
    const top = el.scrollTop;
    el.innerHTML = MlEmpresaFilter.listHtml(this.catOpts());
    el.scrollTop = top;
    const o = this.catOpts();
    const btn = document.querySelector(`#${this.CAT_FILTRO} .ml-emp-filter-btn span`);
    if (btn) btn.textContent = MlEmpresaFilter.buttonLabel(o.items, o.selectedIds, false, true, o.nouns);
  },

  /** Aplica a seleção ao fechar a lista: recalcula o budget uma vez e grava para todos os empreendimentos. */
  async fecharCatFiltro() {
    const s = this.state;
    if (!s.catOpen) return;
    const antes = this.categoriasSelecionadas().slice().sort().join("|");
    const pend = (s.catPend || []).slice();
    s.catOpen = false;
    s.catQuery = "";
    s.catPend = null;
    if (pend.slice().sort().join("|") === antes) {
      this.pintarCatFiltro();
      return;
    }
    s.catSel = pend;
    this.render();
    await this.gravarConfig(this.CAT_DOC, { ids: s.catSel });
  },

  bindCatFiltro() {
    if (!window.MlEmpresaFilter || !document.getElementById(this.CAT_FILTRO)) return;
    const self = this;
    const s = this.state;
    MlEmpresaFilter.bind(this.CAT_FILTRO, {
      toggleOpen() {
        if (s.catOpen) { self.fecharCatFiltro(); return; }
        s.catOpen = true;
        s.catPend = self.categoriasSelecionadas().slice();
        self.pintarCatFiltro();
        const q = document.getElementById(self.CAT_FILTRO + "-search");
        if (q) q.focus();
      },
      close() { self.fecharCatFiltro(); },
      setQuery(q) { s.catQuery = q || ""; self.pintarCatLista(); },
      toggleId(id, on) {
        const set = new Set(s.catPend || []);
        if (on) set.add(String(id)); else set.delete(String(id));
        s.catPend = [...set];
        self.pintarCatLista();
      },
      selectAll() {
        const q = String(s.catQuery || "").toLowerCase().trim();
        const set = new Set(s.catPend || []);
        self.catItens().forEach((it) => { if (!q || `${it.id} ${it.label}`.toLowerCase().includes(q)) set.add(String(it.id)); });
        s.catPend = [...set];
        self.pintarCatLista();
      },
      selectNone() { s.catPend = []; self.pintarCatLista(); }
    });
  },

  categoriasHtml() {
    const s = this.state;
    if (!Object.keys(s.categorias).length) return `<p class="mkb-muted" style="margin:0;">Nenhum título a pagar ${s.ccsCfg.length > 1 ? "destes centros de custo" : "deste centro de custo"} no período.</p>`;
    const nenhum = !this.categoriasSelecionadas().length;
    return `<div class="mkb-cats-dir">
        ${nenhum ? `<span class="mkb-cats-aviso">Nenhum plano marcado: os gastos ficam zerados.</span>` : ""}
        <div id="mkb-cats-slot">${window.MlEmpresaFilter ? MlEmpresaFilter.html(this.catOpts()) : ""}</div>
      </div>`;
  },

  resultadoHtml() {
    const s = this.state;
    const r = this.resumo();
    const obra = s.obra || { vgv: 0, fonte: "sem" };
    const consumo = Math.min(r.consumo, 100);
    const corConsumo = r.consumo > 100 ? "#b91c1c" : (r.consumo >= 80 ? "#f37021" : "#105436");
    const verba = `
      <div class="mkb-card mkb-config">
        <div class="mkb-cfg-item">
          <span>VGV do empreendimento</span>
          <strong>${obra.vgv > 0 ? this.money(obra.vgv) : "—"}</strong>
        </div>
        <div class="mkb-cfg-item">
          <span>% do VGV para marketing</span>
          <strong>${s.pct > 0 ? String(s.pct).replace(".", ",") + "%" : "—"}</strong>
        </div>
        <div class="mkb-cfg-item mkb-verba">
          <span>Verba de marketing</span>
          <strong>${this.money(r.verba)}</strong>
          <small>VGV × ${String(s.pct || 0).replace(".", ",")}%</small>
        </div>
      </div>`;
    const uso = `
      <div class="mkb-kpis">
        ${this.kpi("Realizado", this.money(r.realizado), "Títulos de marketing já pagos no período", "#105436")}
        ${this.kpi("Comprometido", this.money(r.comprometido), "Em aberto e previsão, ainda não pagos", "#f37021")}
        ${this.kpi("Saldo da verba", this.money(r.saldo), r.saldo < 0 ? "A verba já foi ultrapassada" : "O que ainda cabe na verba", r.saldo < 0 ? "#b91c1c" : "#0ea5e9")}
        ${this.kpi("Consumo da verba", r.verba > 0 ? r.consumo.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—", "Pago + comprometido, em relação à verba", corConsumo,
          `<div class="mkb-bar"><i style="width:${consumo}%;background:${corConsumo};"></i></div>`)}
      </div>
      <div class="mkb-card mkb-chart-full"><div class="mkb-card-h"><h3>Verba e gastos mês a mês</h3><small>Barras = o que foi pago e o que está comprometido · linha = acumulado comparado com a verba</small></div><div class="mkb-canvas"><canvas id="mkb-ch-mes"></canvas></div></div>
      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Títulos que compõem a verba</h3><small>Pago entra no realizado · em aberto e previsão entram no comprometido</small></div>
        <div id="mkb-gastos">${this.gastosHtml(r)}</div>
      </div>`;
    const vendas = `
      <div class="mkb-kpis mkb-kpis-3">
        ${this.kpi("Unidades vendidas", r.liquidas.toLocaleString("pt-BR"), `${r.brutas} contratos emitidos · ${r.distr} distratados no período`, "#6366f1")}
        ${this.kpi("Custo por unidade vendida", r.cac != null ? this.money(r.cac) : "—", "Só o que já foi pago de marketing, dividido pelas unidades", "#105436")}
        ${this.kpi("Custo por unidade com o em aberto", r.cacTotal != null ? this.money(r.cacTotal) : "—", "Marketing já pago e o que ainda está comprometido, dividido pelas unidades vendidas", "#f37021")}
      </div>
      <div class="mkb-card mkb-chart-full"><div class="mkb-card-h"><h3>Vendas e custo por unidade</h3><small>Quantas unidades venderam em cada mês e quanto de marketing cada uma consumiu</small></div><div class="mkb-canvas"><canvas id="mkb-ch-vendas"></canvas></div></div>
      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Contratos vendidos no período</h3><small>Emitidos e distratados no período · Atrasado desde é a parcela vencida mais antiga no Contas a Receber</small></div>
        <div id="mkb-vendas">${this.vendasHtml()}</div>
      </div>`;
    return this.secao("De onde vem a verba", "", verba)
      + this.secao("Uso da verba", "Quanto desse teto já foi pago e quanto ainda está comprometido.", uso)
      + this.secao("Vendas do período", "As unidades vendidas servem para ver quanto de marketing cada venda consumiu.", vendas);
  },

  /* ---------- aba Perfil da venda ---------- */
  setAba(aba) {
    if (this.state.aba === aba) return;
    this.state.aba = aba;
    this.render();
  },

  abasHtml() {
    const s = this.state;
    const aba = (id, rotulo, ic) => `<button type="button" role="tab" aria-selected="${s.aba === id}" class="ml-tab${s.aba === id ? " is-active" : ""}" onclick="MarketingBudgetApp.setAba('${id}')"><i data-lucide="${ic}"></i> ${rotulo}</button>`;
    return `<div class="ml-tabs mkb-tabs" role="tablist">${aba("budget", "Budget", "wallet")}${aba("contratos", "Contratos", "file-text")}${aba("perfil", "Perfil da venda", "users")}</div>`;
  },

  /* ---------- aba Contratos: em dia, nada pago e entrada em aberto (possíveis cancelamentos) ---------- */
  setEscopoCtr(escopo) {
    if (this.state.ctrEscopo === escopo) return;
    this.state.ctrEscopo = escopo;
    this.render();
  },

  /** Contratos ativos (não cancelados, com saldo a pagar) do escopo escolhido, com a situação de pagamento. */
  contratosAtivos() {
    const s = this.state;
    const a = s.adimpl;
    if (s.ctrEscopo === "todos") return (a.contratos || []).filter((c) => c.pag.status === "adimplente" || c.pag.status === "inadimplente");
    const vistos = new Set();
    return s.vendas.filter((v) => v.situacao !== "Cancelado" && !vistos.has(v.id) && vistos.add(v.id))
      .map((v) => ({ ...v, pag: a.porVenda[v.id] || {} }))
      .filter((c) => c.pag.status === "adimplente" || c.pag.status === "inadimplente");
  },

  riscoDe(c) {
    const p = c.pag;
    const motivos = [];
    if (p.recebido < 0.01) motivos.push("nada");
    if (p.entrada && p.entrada.vencida > 0.009) motivos.push("entrada");
    return motivos;
  },

  FAIXAS_PAGO: [
    { id: "0", nome: "0% · nada pago", ok: (p) => p.recebido < 0.01 },
    { id: "10", nome: "Até 10%", ok: (p) => p.pctPago <= 10 },
    { id: "25", nome: "10% a 25%", ok: (p) => p.pctPago <= 25 },
    { id: "50", nome: "25% a 50%", ok: (p) => p.pctPago <= 50 },
    { id: "75", nome: "50% a 75%", ok: (p) => p.pctPago <= 75 },
    { id: "100", nome: "Acima de 75%", ok: () => true }
  ],

  faixaPago(p) {
    return this.FAIXAS_PAGO.find((f) => f.ok(p)).nome;
  },

  FAIXAS_ATRASO: ["1 a 30 dias", "31 a 60 dias", "61 a 90 dias", "Mais de 90 dias"],

  faixaAtraso(dias) {
    if (dias <= 30) return this.FAIXAS_ATRASO[0];
    if (dias <= 60) return this.FAIXAS_ATRASO[1];
    if (dias <= 90) return this.FAIXAS_ATRASO[2];
    return this.FAIXAS_ATRASO[3];
  },

  situacaoEntrada(p) {
    const e = p.entrada || {};
    if (!e.tem) return "Sem entrada identificada";
    if (e.vencida > 0.009) return "Entrada vencida";
    if (e.aberta > 0.009) return "Entrada a vencer";
    return "Entrada paga";
  },

  contratosHtml() {
    const s = this.state;
    const a = s.adimpl;
    if (a.status === "carregando" || a.status === "") {
      return `<div class="mkb-card mkb-perfil-aviso"><div class="spinner" style="width:18px;height:18px;border-width:3px;margin:0;"></div><span>Lendo o Contas a Receber para saber quem paga em dia…</span></div>`;
    }
    if (a.status === "erro") return `<div class="mkb-card" style="color:#b91c1c;">Não consegui ler o Contas a Receber deste empreendimento.</div>`;
    const todos = s.ctrEscopo === "todos";
    const nPeriodo = s.vendas.filter((v) => v.situacao !== "Cancelado").length;
    const nTodos = (a.contratos || []).length;
    const escopo = `<div class="mkb-chips" style="margin:0;">
        <button type="button" class="mkb-chip${todos ? "" : " is-on"}" onclick="MarketingBudgetApp.setEscopoCtr('periodo')">Vendas do período <b>${nPeriodo}</b></button>
        <button type="button" class="mkb-chip${todos ? " is-on" : ""}" onclick="MarketingBudgetApp.setEscopoCtr('todos')">Todos os contratos do empreendimento <b>${nTodos}</b></button>
      </div>`;
    const L = this.contratosAtivos();
    if (!L.length) return `<div class="mkb-card">${escopo}<p class="mkb-vazio" style="margin:12px 0 0;">Nenhum contrato ativo com saldo a pagar ${todos ? "neste empreendimento" : "entre as vendas do período"}.</p></div>`;
    const emDia = L.filter((c) => c.pag.status === "adimplente");
    const atraso = L.filter((c) => c.pag.status === "inadimplente");
    const risco = L.filter((c) => this.riscoDe(c).length)
      .sort((x, y) => (this.riscoDe(y).length - this.riscoDe(x).length) || ((y.pag.dias || 0) - (x.pag.dias || 0)));
    const vencido = atraso.reduce((t, c) => t + (Number(c.pag.vencido) || 0), 0);
    const lotes = this.lotesDoEmpreendimento();
    const pctLotes = lotes.total ? Math.round((lotes.vendidos / lotes.total) * 1000) / 10 : 0;
    const tag = (m) => m === "nada" ? `<span class="mkb-st mkb-st-cancel">Não pagou nada</span>` : `<span class="mkb-st mkb-st-comprometido">Devendo a entrada</span>`;
    const linhas = risco.map((c) => `<tr>
        <td><strong>${this.esc(c.numero)}</strong></td>
        <td title="${this.esc(c.unidadeNomes)}">${this.esc(c.unidadeNomes || "—")}</td>
        <td title="${this.esc(c.cliente)}">${this.esc(c.cliente || "—")}</td>
        <td>${c.data ? this.dataBr(c.data) : "—"}</td>
        <td style="text-align:right;">${c.pag.pctPago.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
        <td>${c.pag.entrada && c.pag.entrada.vencida > 0.009 ? `<span class="mkb-atraso">${this.money(c.pag.entrada.vencida)} <small>desde ${this.dataBr(c.pag.entrada.desde)}</small></span>` : this.esc(this.situacaoEntrada(c.pag))}</td>
        <td>${this.atrasoHtml({ id: c.id, situacao: "", pagDireto: c.pag })}</td>
        <td class="mkb-motivo">${this.riscoDe(c).map(tag).join(" ")}</td>
      </tr>`).join("");
    const qtdDistrato = risco.length.toLocaleString("pt-BR");
    const pagamento = `
      <div class="mkb-kpis">
        ${this.kpi("Contratos ativos", L.length.toLocaleString("pt-BR"), todos ? "Títulos a receber ainda em aberto neste empreendimento" : "Vendas do período que ainda têm saldo", "#6366f1")}
        ${this.kpi("Em dia", this.pct(emDia.length, L.length), `${emDia.length} contrato(s) sem parcela vencida`, "#105436")}
        ${this.kpi("Em atraso", this.pct(atraso.length, L.length), `${atraso.length} contrato(s) · ${this.money(vencido)} já vencido`, atraso.length ? "#b91c1c" : "#105436")}
        ${this.kpi("Lotes vendidos", lotes.total ? lotes.vendidos.toLocaleString("pt-BR") : "—", lotes.total ? `${lotes.faltam.toLocaleString("pt-BR")} faltam · ${lotes.total.toLocaleString("pt-BR")} no empreendimento` : "Estoque deste empreendimento ainda não foi carregado", "#6366f1",
          lotes.total ? `<div class="mkb-bar" title="${lotes.vendidos} vendidos · ${lotes.faltam} faltam"><i style="width:${pctLotes}%;background:#6366f1;"></i></div>` : "")}
      </div>
      <div class="mkb-charts mkb-charts-3">
        <div class="mkb-card"><div class="mkb-card-h"><h3>Em dia e em atraso</h3><small>Dos contratos ativos, quantos pagam no prazo</small></div><div class="mkb-canvas mkb-canvas-curto"><canvas id="mkb-ch-ctr-dia"></canvas></div></div>
        <div class="mkb-card"><div class="mkb-card-h"><h3>Quanto do contrato já foi pago</h3><small>0% significa que nenhuma parcela entrou</small></div><div class="mkb-canvas mkb-canvas-curto"><canvas id="mkb-ch-ctr-pago"></canvas></div></div>
        <div class="mkb-card"><div class="mkb-card-h"><h3>Há quanto tempo está vencido</h3><small>Conta a partir da parcela vencida mais antiga de cada contrato</small></div><div class="mkb-canvas mkb-canvas-curto"><canvas id="mkb-ch-ctr-atraso"></canvas></div></div>
      </div>`;
    const distrato = `
      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Lista dos ${qtdDistrato} título(s)</h3><small>Cada linha é um contrato que o marketing pode tratar como possível distrato</small></div>
        ${risco.length ? `<div class="mkb-tablewrap"><table class="mkb-table">
          <colgroup><col style="width:13%"><col style="width:8%"><col style="width:18%"><col style="width:9%"><col style="width:6%"><col style="width:14%"><col style="width:11%"><col style="width:21%"></colgroup>
          <thead><tr><th>Contrato</th><th>Unidade</th><th>Cliente</th><th>Emissão</th><th style="text-align:right;">% pago</th><th>Entrada</th><th>Atrasado desde</th><th>Motivo</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>` : `<p class="mkb-muted" style="margin:0;">Nenhum contrato ativo sem pagamento ou com entrada vencida.</p>`}
      </div>`;
    return `<div class="mkb-card mkb-ctr-top">
        ${escopo}
        <small class="mkb-muted">Contrato ativo é o que não foi cancelado e ainda tem saldo no Contas a Receber${todos ? "" : ", entre as vendas emitidas no período"}.</small>
      </div>
      ${this.secao("Situação de pagamento", "Quem está em dia, quem está atrasado e quanto do contrato já entrou.", pagamento)}
      ${this.secao(`Títulos que podem distratar <b class="mkb-qtd">${qtdDistrato}</b>`, "Não pagaram nenhuma parcela ou estão com a entrada vencida.", distrato)}`;
  },

  desenharGraficosContratos() {
    if (typeof Chart === "undefined") return;
    const L = this.contratosAtivos();
    if (!L.length) return;
    const n = L.length;
    const legenda = { display: false };
    const pctTip = { callbacks: { label: (c) => `${c.raw} contrato(s) · ${this.pct(c.raw, n)}` } };
    const barras = (el, labels, data, cores, horizontal) => new Chart(el, {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: cores, borderRadius: 4 }] },
      options: {
        indexAxis: horizontal ? "y" : "x",
        responsive: true, maintainAspectRatio: false,
        layout: { padding: horizontal ? { right: 52 } : { top: 20 } },
        plugins: { legend: legenda, tooltip: pctTip },
        scales: horizontal
          ? { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { ticks: { font: { size: 11 } } } }
          : { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { font: { size: 10 } } } }
      },
      plugins: [{
        id: "mkbRotulo",
        afterDatasetsDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.save();
          ctx.font = "600 11px sans-serif";
          ctx.fillStyle = "#0f172a";
          chart.getDatasetMeta(0).data.forEach((bar, i) => {
            const v = data[i];
            if (!v) return;
            const txt = this.pct(v, n);
            if (horizontal) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, bar.x + 6, bar.y); }
            else { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(txt, bar.x, bar.y - 4); }
          });
          ctx.restore();
        }
      }]
    });
    const elD = document.getElementById("mkb-ch-ctr-dia");
    if (elD) {
      const emDia = L.filter((c) => c.pag.status === "adimplente").length;
      this.charts.ctrDia = barras(elD, ["Em dia", "Em atraso"], [emDia, n - emDia], ["#105436", "#b91c1c"], true);
    }
    const elP = document.getElementById("mkb-ch-ctr-pago");
    if (elP) {
      const nomes = this.FAIXAS_PAGO.map((f) => f.nome);
      const data = nomes.map((nm) => L.filter((c) => this.faixaPago(c.pag) === nm).length);
      this.charts.ctrPago = barras(elP, nomes, data, nomes.map((_, i) => (i === 0 ? "#b91c1c" : (i === 1 ? "#f37021" : "#105436"))), false);
    }
    const elA = document.getElementById("mkb-ch-ctr-atraso");
    if (elA) {
      const atr = L.filter((c) => c.pag.status === "inadimplente");
      const nomes = ["Em dia"].concat(this.FAIXAS_ATRASO);
      const data = [L.length - atr.length].concat(this.FAIXAS_ATRASO.map((f) => atr.filter((c) => this.faixaAtraso(c.pag.dias || 0) === f).length));
      this.charts.ctrAtraso = barras(elA, nomes, data, ["#105436", "#eab308", "#f37021", "#dc2626", "#7f1d1d"], false);
    }
  },

  pct(n, d) {
    return d > 0 ? ((n / d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—";
  },

  grupos(lista, chave, ordem) {
    const g = {};
    lista.forEach((x) => {
      const k = chave(x);
      const o = g[k] || (g[k] = { nome: k, total: 0, emDia: 0, atraso: 0, vencido: 0, cancelados: 0, valor: 0 });
      o.total += 1;
      o.valor += x.v.valor;
      if (x.cancelado) o.cancelados += 1;
      else if (x.pag === "inadimplente") { o.atraso += 1; o.vencido += x.vencido; }
      else if (x.pag === "adimplente" || x.pag === "quitado") o.emDia += 1;
    });
    return ordem.filter((k) => g[k]).map((k) => g[k]);
  },

  ordemFaixas() {
    return this.FAIXAS.concat(["Pessoa jurídica"]);
  },

  ordemSexos() {
    return ["Feminino", "Masculino", "Pessoa jurídica", "Não informado"];
  },

  linhaGrupoHtml(g) {
    const base = g.emDia + g.atraso;
    const p = base > 0 ? (g.atraso / base) * 100 : 0;
    const cor = p >= 20 ? "#b91c1c" : (p >= 10 ? "#f37021" : "#105436");
    return `<tr>
      <td>${this.esc(g.nome)}</td>
      <td style="text-align:right;">${g.total}</td>
      <td style="text-align:right;">${g.emDia}</td>
      <td style="text-align:right;">${g.atraso}</td>
      <td><div class="mkb-pbar"><div class="mkb-bar"><i style="width:${Math.min(100, p)}%;background:${cor};"></i></div><b style="color:${cor};">${base > 0 ? this.pct(g.atraso, base) : "—"}</b></div></td>
      <td style="text-align:right;">${g.vencido > 0 ? this.money(g.vencido) : "—"}</td>
    </tr>`;
  },

  perfilHtml() {
    const s = this.state;
    const L = this.linhasPerfil();
    const ativos = L.filter((x) => !x.cancelado);
    const canc = L.filter((x) => x.cancelado);
    if (!L.length) return `<div class="mkb-card mkb-vazio">Nenhuma venda nem distrato deste empreendimento no período.</div>`;
    const carregando = [];
    if (s.adimpl.status === "carregando" || s.adimpl.status === "") carregando.push("Lendo o Contas a Receber para saber quem paga em dia…");
    if (s.perfis.status === "carregando" || s.perfis.status === "") carregando.push(`Lendo o cadastro dos clientes · ${s.perfis.feitos} de ${s.perfis.total}`);
    const aviso = carregando.length ? `<div class="mkb-card mkb-perfil-aviso"><div class="spinner" style="width:18px;height:18px;border-width:3px;margin:0;"></div><span id="mkb-perfil-prog">${this.esc(carregando[carregando.length - 1])}</span></div>` : "";
    const erros = [];
    if (s.adimpl.status === "erro") erros.push("Não consegui ler o Contas a Receber; a situação de pagamento ficou de fora.");
    if (s.perfis.status === "erro") erros.push("Não consegui ler o cadastro de parte dos clientes.");
    const pf = ativos.filter((x) => x.sexo === "F" || x.sexo === "M");
    const mulheres = pf.filter((x) => x.sexo === "F").length;
    const homens = pf.length - mulheres;
    const comIdade = ativos.filter((x) => x.idade != null);
    const idadeMedia = comIdade.length ? comIdade.reduce((t, x) => t + x.idade, 0) / comIdade.length : null;
    const comPag = ativos.filter((x) => ["adimplente", "inadimplente", "quitado"].includes(x.pag));
    const atraso = comPag.filter((x) => x.pag === "inadimplente");
    const vencido = atraso.reduce((t, x) => t + x.vencido, 0);
    const semTitulo = ativos.filter((x) => x.pag === "sem-titulo").length;
    const cancMeses = canc.filter((x) => x.meses != null);
    const mediaMeses = cancMeses.length ? cancMeses.reduce((t, x) => t + x.meses, 0) / cancMeses.length : null;
    const sexoNome = (x) => this.SEXOS[x.sexo] || "Não informado";
    const gSexo = this.grupos(ativos, sexoNome, this.ordemSexos());
    const gFaixa = this.grupos(ativos, (x) => x.faixa, this.ordemFaixas());
    const cSexo = this.grupos(L, sexoNome, this.ordemSexos());
    const cFaixa = this.grupos(L, (x) => x.faixa, this.ordemFaixas());
    const tabelaPag = `<div class="mkb-tablewrap"><table class="mkb-table mkb-table-perfil">
        <colgroup><col style="width:24%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:26%"><col style="width:17%"></colgroup>
        <thead><tr><th>Grupo</th><th style="text-align:right;">Contratos</th><th style="text-align:right;">Em dia</th><th style="text-align:right;">Em atraso</th><th>% em atraso</th><th style="text-align:right;">Vencido</th></tr></thead>
        <tbody>
          <tr class="mkb-grp"><td colspan="6">Por sexo</td></tr>${gSexo.map((g) => this.linhaGrupoHtml(g)).join("")}
          <tr class="mkb-grp"><td colspan="6">Por faixa etária (idade na data da venda)</td></tr>${gFaixa.map((g) => this.linhaGrupoHtml(g)).join("")}
        </tbody>
      </table></div>`;
    const taxa = (lista) => lista.map((g) => `<tr><td>${this.esc(g.nome)}</td><td style="text-align:right;">${g.cancelados}</td><td style="text-align:right;">${g.total}</td><td style="text-align:right;"><b style="color:${g.cancelados ? "#b91c1c" : "#64748b"};">${this.pct(g.cancelados, g.total)}</b></td></tr>`).join("");
    const listaCanc = canc.slice().sort((a, b) => String(b.v.dataCancel || "").localeCompare(String(a.v.dataCancel || ""))).map((x) => `<tr>
        <td>${this.dataBr(x.v.dataCancel)}</td>
        <td><strong>${this.esc(x.v.numero)}</strong></td>
        <td title="${this.esc(x.v.cliente)}">${this.esc(x.v.cliente || "—")}</td>
        <td>${this.esc(sexoNome(x))}</td>
        <td style="text-align:right;">${x.idade != null ? x.idade + " anos" : "—"}</td>
        <td>${this.dataBr(x.v.data)}</td>
        <td style="text-align:right;">${x.meses == null ? "—" : (x.meses === 0 ? "menos de 1 mês" : x.meses + (x.meses === 1 ? " mês" : " meses"))}</td>
        <td style="text-align:right;">${this.money(x.v.valor)}</td>
      </tr>`).join("");
    const quem = `
      <div class="mkb-kpis">
        ${this.kpi("Contratos ativos", ativos.length.toLocaleString("pt-BR"), `${canc.length} já cancelado(s) neste período`, "#6366f1")}
        ${this.kpi("Mulheres", this.pct(mulheres, pf.length), `${mulheres} contrato(s) de pessoa física`, "#db2777")}
        ${this.kpi("Homens", this.pct(homens, pf.length), `${homens} contrato(s) de pessoa física`, "#0ea5e9")}
        ${this.kpi("Idade média na venda", idadeMedia != null ? Math.round(idadeMedia) + " anos" : "—", `${comIdade.length} cliente(s) com data de nascimento`, "#0f766e")}
      </div>
      <div class="mkb-par mkb-par-sexo">
        <div class="mkb-card"><div class="mkb-card-h"><h3>Vendas por sexo</h3><small>Quantidade de contratos ativos em cada grupo</small></div><div class="mkb-canvas"><canvas id="mkb-ch-sexo"></canvas></div></div>
        <div class="mkb-card"><div class="mkb-card-h"><h3>Vendas por faixa etária</h3><small>Idade na data da venda · o número em cada cor é a quantidade, e o de cima é o total</small></div><div class="mkb-canvas mkb-canvas-alto"><canvas id="mkb-ch-faixa"></canvas></div></div>
      </div>`;
    const pagando = `
      <div class="mkb-kpis mkb-kpis-2">
        ${this.kpi("Em atraso", this.pct(atraso.length, comPag.length), `${atraso.length} de ${comPag.length} contrato(s) com parcela vencida${semTitulo ? ` · ${semTitulo} sem título no Contas a Receber` : ""}`, atraso.length ? "#b91c1c" : "#105436")}
        ${this.kpi("Valor vencido", this.money(vencido), "Soma das parcelas vencidas e ainda não pagas", "#f37021")}
      </div>
      <div class="mkb-par">
        <div class="mkb-card"><div class="mkb-card-h"><h3>Em dia e em atraso por idade</h3><small>O número verde é quem está em dia e o laranja é quem está atrasado</small></div><div class="mkb-canvas mkb-canvas-alto"><canvas id="mkb-ch-pag"></canvas></div></div>
        <div class="mkb-card">
          <div class="mkb-card-h"><h3>A mesma conta, em tabela</h3><small>Em dia inclui quem já quitou · em atraso é quem tem parcela vencida</small></div>
          ${tabelaPag}
        </div>
      </div>`;
    const cancelou = `
      <div class="mkb-kpis mkb-kpis-2">
        ${this.kpi("Cancelamentos", canc.length.toLocaleString("pt-BR"), this.pct(canc.length, L.length) + " dos contratos do período", "#b91c1c")}
        ${this.kpi("Tempo até cancelar", mediaMeses != null ? mediaMeses.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + (Math.abs(mediaMeses - 1) < 0.05 ? " mês" : " meses") : "—", "Média de meses entre a venda e o cancelamento", "#64748b")}
      </div>
      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Perfil de quem cancelou</h3><small>Taxa = cancelados do grupo ÷ contratos do grupo no período</small></div>
        ${canc.length ? `<div class="mkb-canc">
          <div class="mkb-canvas"><canvas id="mkb-ch-canc"></canvas></div>
          <div class="mkb-tablewrap"><table class="mkb-table mkb-table-perfil" style="min-width:0;">
            <thead><tr><th>Grupo</th><th style="text-align:right;">Cancelados</th><th style="text-align:right;">Contratos</th><th style="text-align:right;">Taxa</th></tr></thead>
            <tbody>
              <tr class="mkb-grp"><td colspan="4">Por sexo</td></tr>${taxa(cSexo)}
              <tr class="mkb-grp"><td colspan="4">Por faixa etária</td></tr>${taxa(cFaixa)}
            </tbody>
          </table></div>
        </div>
        <div class="mkb-tablewrap" style="margin-top:12px;"><table class="mkb-table">
          <colgroup><col style="width:11%"><col style="width:14%"><col style="width:25%"><col style="width:11%"><col style="width:9%"><col style="width:10%"><col style="width:9%"><col style="width:11%"></colgroup>
          <thead><tr><th>Cancelamento</th><th>Contrato</th><th>Cliente</th><th>Sexo</th><th style="text-align:right;">Idade</th><th>Venda</th><th style="text-align:right;">Durou</th><th style="text-align:right;">Valor</th></tr></thead>
          <tbody>${listaCanc}</tbody>
        </table></div>` : `<p class="mkb-muted" style="margin:0;">Nenhum cancelamento deste empreendimento no período.</p>`}
      </div>`;
    return `${aviso}
      ${erros.length ? `<div class="mkb-card" style="color:#b91c1c;font-size:0.82rem;">${erros.map((e) => this.esc(e)).join("<br>")}</div>` : ""}
      ${this.secao("Quem comprou", "Sexo e idade dos clientes dos contratos que continuam ativos.", quem)}
      ${this.secao("Quem está pagando", "Dos contratos ativos, quem segue em dia e quem já tem parcela vencida.", pagando)}
      ${this.secao("Quem cancelou", "Distratos do período e quanto tempo o contrato durou antes do cancelamento.", cancelou)}`;
  },

  /** Escreve a quantidade em cada pedaço do gráfico, para não depender do mouse. */
  pluginNumeros() {
    return {
      id: "mkbNumeros",
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        const tipo = chart.config.type;
        ctx.save();
        ctx.font = "700 11px sans-serif";
        ctx.textAlign = "center";
        if (tipo === "doughnut") {
          const ds = chart.data.datasets[0];
          const meta = chart.getDatasetMeta(0);
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff";
          meta.data.forEach((arc, i) => {
            const v = Number(ds.data[i]) || 0;
            if (!v || Math.abs(arc.endAngle - arc.startAngle) < 0.35) return;
            const p = arc.tooltipPosition();
            ctx.fillText(String(v), p.x, p.y);
          });
          ctx.restore();
          return;
        }
        const totais = chart.data.labels.map(() => 0);
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((bar, i) => {
            const v = Number(ds.data[i]) || 0;
            if (!v) return;
            totais[i] += v;
            const altura = Math.abs((bar.base != null ? bar.base : bar.y) - bar.y);
            if (altura < 16) return;
            ctx.fillStyle = "#fff";
            ctx.textBaseline = "middle";
            ctx.fillText(String(v), bar.x, ((bar.base != null ? bar.base : bar.y) + bar.y) / 2);
          });
        });
        if (chart.data.datasets.length > 1) {
          ctx.fillStyle = "#0f172a";
          ctx.textBaseline = "bottom";
          chart.getDatasetMeta(0).data.forEach((bar, i) => {
            if (!totais[i]) return;
            const topo = Math.min(...chart.data.datasets.map((_, di) => {
              const meta = chart.getDatasetMeta(di);
              return meta.hidden || !meta.data[i] ? Infinity : meta.data[i].y;
            }));
            ctx.fillText(String(totais[i]), bar.x, topo - 2);
          });
        }
        ctx.restore();
      }
    };
  },

  desenharGraficosPerfil() {
    if (typeof Chart === "undefined") return;
    const L = this.linhasPerfil();
    const ativos = L.filter((x) => !x.cancelado);
    const canc = L.filter((x) => x.cancelado);
    const corSexo = { F: "#db2777", M: "#0ea5e9", PJ: "#6366f1", "?": "#cbd5e1" };
    const legenda = { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } };
    const eixoX = { stacked: true, ticks: { font: { size: 11 }, maxRotation: 0, minRotation: 0, autoSkip: false } };
    const eixoY = { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grace: "12%" };
    const numeros = this.pluginNumeros();
    const elS = document.getElementById("mkb-ch-sexo");
    if (elS) {
      const ks = ["F", "M", "PJ", "?"].filter((k) => ativos.some((x) => x.sexo === k));
      const data = ks.map((k) => ativos.filter((x) => x.sexo === k).length);
      const total = data.reduce((t, n) => t + n, 0);
      this.charts.sexo = new Chart(elS, {
        type: "doughnut",
        data: { labels: ks.map((k) => this.SEXOS[k]), datasets: [{ data, backgroundColor: ks.map((k) => corSexo[k]) }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "58%",
          plugins: {
            legend: {
              ...legenda,
              labels: {
                ...legenda.labels,
                generateLabels: (chart) => {
                  const ds = chart.data.datasets[0];
                  return chart.data.labels.map((label, i) => ({
                    text: `${label} · ${ds.data[i]} (${this.pct(ds.data[i], total)})`,
                    fillStyle: ds.backgroundColor[i],
                    strokeStyle: ds.backgroundColor[i],
                    index: i
                  }));
                }
              }
            }
          }
        },
        plugins: [numeros]
      });
    }
    const faixas = this.ordemFaixas().filter((f) => ativos.some((x) => x.faixa === f));
    const elF = document.getElementById("mkb-ch-faixa");
    if (elF) {
      const ks = ["F", "M", "PJ", "?"].filter((k) => ativos.some((x) => x.sexo === k));
      this.charts.faixa = new Chart(elF, {
        type: "bar",
        data: { labels: faixas, datasets: ks.map((k) => ({ label: this.SEXOS[k], data: faixas.map((f) => ativos.filter((x) => x.faixa === f && x.sexo === k).length), backgroundColor: corSexo[k], stack: "s" })) },
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: legenda }, scales: { x: eixoX, y: eixoY } },
        plugins: [numeros]
      });
    }
    const elP = document.getElementById("mkb-ch-pag");
    if (elP) {
      const g = this.grupos(ativos, (x) => x.faixa, faixas);
      this.charts.pag = new Chart(elP, {
        type: "bar",
        data: {
          labels: g.map((x) => x.nome),
          datasets: [
            { label: "Em dia", data: g.map((x) => x.emDia), backgroundColor: "#105436", stack: "p" },
            { label: "Em atraso", data: g.map((x) => x.atraso), backgroundColor: "#f37021", stack: "p" }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: legenda }, scales: { x: eixoX, y: eixoY } },
        plugins: [numeros]
      });
    }
    const elC = document.getElementById("mkb-ch-canc");
    if (elC && canc.length) {
      const fx = this.ordemFaixas().filter((f) => canc.some((x) => x.faixa === f));
      const ks = ["F", "M", "PJ", "?"].filter((k) => canc.some((x) => x.sexo === k));
      this.charts.canc = new Chart(elC, {
        type: "bar",
        data: { labels: fx, datasets: ks.map((k) => ({ label: this.SEXOS[k], data: fx.map((f) => canc.filter((x) => x.faixa === f && x.sexo === k).length), backgroundColor: corSexo[k], stack: "c" })) },
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: legenda }, scales: { x: eixoX, y: eixoY } },
        plugins: [numeros]
      });
    }
  },

  render() {
    const root = document.getElementById("marketing-budget-root");
    if (!root) return;
    const s = this.state;
    const cc = this.ccAtual();
    const corpo = s.loading
      ? `<div class="mkb-card mkb-load"><div class="loading-spinner"></div><p id="mkb-progress">${this.esc(s.progress)}</p><div class="mkb-load-track"><div id="mkb-progress-bar" style="width:${Math.round((s.progressRatio || 0) * 100)}%"></div></div></div>`
      : (s.error ? `<div class="mkb-card" style="color:#b91c1c;">${this.esc(s.error)}</div>`
        : (s.consultado ? this.abasHtml() + (s.aba === "perfil" ? this.perfilHtml() : (s.aba === "contratos" ? this.contratosHtml() : this.resultadoHtml()))
          : `<div class="mkb-card mkb-vazio">Escolha o empreendimento e o período e clique em <strong>Consultar</strong>. A verba vem do VGV da obra no Sienge × o percentual de marketing definido em <a href="#" onclick="event.preventDefault();MarketingBudgetApp.abrirConfig()">Configurações</a>.</div>`));
    this.destruirGraficos();
    root.innerHTML = `
      <style>
        #marketing-budget-root .mkb-wrap { padding:8px 4px 24px; }
        #marketing-budget-root .mkb-head { background:#105436; padding:16px 20px; border-radius:12px 12px 0 0; display:flex; align-items:center; gap:12px; color:#fff; }
        #marketing-budget-root .mkb-head-ic { width:36px; height:36px; background:rgba(255,255,255,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; }
        #marketing-budget-root .mkb-body { background:#f8fafc; border:1px solid #e2e8f0; border-top:none; padding:16px; border-radius:0 0 12px 12px; display:flex; flex-direction:column; gap:14px; }
        #marketing-budget-root .mkb-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; }
        #marketing-budget-root .mkb-load { display:flex; flex-direction:column; align-items:center; gap:14px; padding:40px 24px; color:#64748b; text-align:center; }
        #marketing-budget-root .mkb-load p { margin:0; font-size:0.9rem; }
        #marketing-budget-root .mkb-load-track { width:100%; max-width:420px; height:8px; background:#e2e8f0; border-radius:99px; overflow:hidden; }
        #marketing-budget-root .mkb-load-bar, #marketing-budget-root #mkb-progress-bar { height:100%; background:#105436; border-radius:99px; transition:width 0.25s linear; }
        #marketing-budget-root .mkb-card-h { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
        #marketing-budget-root .mkb-card-h h3 { margin:0; font-size:0.95rem; color:#105436; }
        #marketing-budget-root .mkb-card-h small, #marketing-budget-root .mkb-muted { color:#64748b; font-size:0.75rem; font-weight:400; }
        #marketing-budget-root .mkb-filtros { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
        #marketing-budget-root .mkb-filtros label { display:block; font-size:0.72rem; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:4px; }
        #marketing-budget-root .mkb-filtros input, #marketing-budget-root .mkb-filtros select { height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font:inherit; font-size:0.85rem; box-sizing:border-box; background:#fff; }
        #marketing-budget-root .mkb-filtros .mkb-f-cc { flex:1 1 720px; min-width:min(100%, 640px); }
        #marketing-budget-root .mkb-filtros .mkb-f-cc select { width:100%; cursor:pointer; white-space:nowrap; }
        #marketing-budget-root .mkb-config { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:16px; }
        #marketing-budget-root .mkb-cfg-item span { display:block; font-size:0.72rem; font-weight:700; color:#64748b; text-transform:uppercase; }
        #marketing-budget-root .mkb-cfg-item strong { display:block; font-size:1.35rem; color:#0f172a; margin-top:4px; }
        #marketing-budget-root .mkb-cfg-item small { display:block; color:#64748b; font-size:0.72rem; margin-top:4px; }
        #marketing-budget-root .mkb-verba strong { color:#105436; }
        #marketing-budget-root .mkb-pct { display:flex; align-items:center; gap:6px; margin-top:4px; }
        #marketing-budget-root .mkb-pct input { width:90px; height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:1rem; font-weight:700; text-align:right; }
        #marketing-budget-root .mkb-pct em { font-style:normal; font-weight:700; color:#475569; }
        #marketing-budget-root .mkb-pct .btn { height:38px; }
        #marketing-budget-root .mkb-sec { display:flex; flex-direction:column; gap:12px; }
        #marketing-budget-root .mkb-sec-h h3 { margin:0; color:#105436; font-size:1rem; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        #marketing-budget-root .mkb-sec-h small { display:block; color:#64748b; font-size:0.78rem; margin-top:2px; font-weight:400; }
        #marketing-budget-root .mkb-qtd { display:inline-flex; align-items:center; justify-content:center; min-width:1.7rem; height:1.7rem; padding:0 8px; border-radius:999px; background:#b91c1c; color:#fff; font-size:0.95rem; }
        #marketing-budget-root .mkb-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
        #marketing-budget-root .mkb-kpis-2 { grid-template-columns:repeat(2, minmax(0, 280px)); }
        #marketing-budget-root .mkb-kpis.mkb-kpis-3 { grid-template-columns:repeat(3, minmax(0,1fr)); }
        #marketing-budget-root .mkb-par { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:stretch; }
        #marketing-budget-root .mkb-par-sexo { grid-template-columns:minmax(280px, 0.85fr) minmax(0, 1.4fr); }
        #marketing-budget-root .mkb-canvas-alto { height:340px; }
        #marketing-budget-root .mkb-kpi { background:#fff; border:1px solid #e2e8f0; border-top:4px solid #105436; border-radius:10px; padding:12px 14px; min-width:0; }
        #marketing-budget-root .mkb-kpi span { display:block; font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.3px; }
        #marketing-budget-root .mkb-kpi strong { display:block; font-size:1.2rem; color:#0f172a; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #marketing-budget-root .mkb-kpi small { display:block; font-size:0.72rem; color:#64748b; margin-top:2px; }
        #marketing-budget-root .mkb-bar { height:6px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:8px; }
        #marketing-budget-root .mkb-bar i { display:block; height:100%; }
        #marketing-budget-root .mkb-nota { margin:0; font-size:0.8rem; color:#475569; }
        #marketing-budget-root .mkb-cats-row { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        #marketing-budget-root .mkb-cats-tit h3 { margin:0; font-size:0.95rem; color:#105436; }
        #marketing-budget-root .mkb-cats-tit small { color:#64748b; font-size:0.75rem; }
        #marketing-budget-root .mkb-cats-dir { display:flex; align-items:center; gap:12px; flex-wrap:wrap; justify-content:flex-end; }
        #marketing-budget-root .mkb-cats-aviso { color:#b91c1c; font-size:0.78rem; font-weight:700; }
        #marketing-budget-root .mkb-cats-row .ml-emp-filter { width:360px; max-width:100%; }
        #marketing-budget-root .mkb-cats-row .ml-emp-filter-label { display:none; }
        #marketing-budget-root .mkb-cats-row .ml-emp-filter-btn { height:38px; min-height:38px; }
        #marketing-budget-root .mkb-cats-row .ml-emp-filter-list { max-height:300px; }
        #marketing-budget-root tr.mkb-click { cursor:pointer; }
        #marketing-budget-root tr.mkb-click:hover td { background:#e7f6ee; }
        #marketing-budget-root .mkb-charts { display:grid; grid-template-columns:2fr 1fr; gap:14px; }
        #marketing-budget-root .mkb-canvas { position:relative; height:260px; }
        #marketing-budget-root .mkb-canvas-curto { height:190px; }
        #marketing-budget-root .mkb-chart-full { grid-column:1 / -1; }
        #marketing-budget-root .mkb-gastos-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
        #marketing-budget-root .mkb-gastos-bar .mkb-chips { margin:0; flex:0 1 auto; }
        #marketing-budget-root .mkb-busca, #marketing-budget-root .mkb-plano { height:36px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#334155; font:inherit; font-size:0.8rem; box-sizing:border-box; }
        #marketing-budget-root .mkb-busca { width:220px; padding:0 10px; }
        #marketing-budget-root .mkb-plano { width:240px; padding:0 8px; }
        #marketing-budget-root .mkb-gastos-tools { margin-left:auto; display:flex; align-items:center; gap:8px; }
        #marketing-budget-root .mkb-sel-val { display:flex; align-items:baseline; gap:8px; min-height:36px; padding:0 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; box-sizing:border-box; }
        #marketing-budget-root .mkb-sel-val span { font-size:0.68rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.02em; }
        #marketing-budget-root .mkb-sel-val strong { color:#105436; font-size:1rem; }
        #marketing-budget-root .mkb-sel-val small { color:#64748b; font-size:0.72rem; }
        #marketing-budget-root .mkb-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
        #marketing-budget-root .mkb-chip { height:32px; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:0.8rem; font-weight:600; cursor:pointer; }
        #marketing-budget-root .mkb-chip.is-on { background:#105436; border-color:#105436; color:#fff; }
        #marketing-budget-root .mkb-tablewrap { max-height:52vh; overflow:auto; }
        #marketing-budget-root .mkb-table { width:100%; min-width:900px; border-collapse:collapse; table-layout:fixed; font-size:0.82rem; }
        #marketing-budget-root .mkb-table thead th { position:sticky; top:0; background:#1b8253; color:#fff; padding:10px; text-align:left; font-weight:600; z-index:1; }
        #marketing-budget-root .mkb-table td { padding:9px 10px; border-bottom:1px solid #e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #marketing-budget-root .mkb-table tbody tr:nth-child(even) { background:#f8faf9; }
        #marketing-budget-root .mkb-st { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700; }
        #marketing-budget-root .mkb-st-realizado { background:#dcfce7; color:#105436; }
        #marketing-budget-root .mkb-st-comprometido { background:#ffedd5; color:#c2410c; }
        #marketing-budget-root .mkb-st-previsao { background:#e2e8f0; color:#334155; }
        #marketing-budget-root .mkb-st-cancel { background:#fee2e2; color:#b91c1c; }
        #marketing-budget-root .mkb-vazio { text-align:center; color:#64748b; padding:24px; }
        #marketing-budget-root .mkb-tabs { margin-bottom:-4px; }
        #marketing-budget-root .mkb-atraso { color:#b91c1c; font-weight:700; }
        #marketing-budget-root .mkb-atraso small { color:#c2410c; font-weight:600; }
        #marketing-budget-root .mkb-perfil-aviso { display:flex; align-items:center; gap:10px; color:#475569; font-size:0.82rem; padding:10px 16px; }
        #marketing-budget-root .mkb-charts-3 { grid-template-columns:repeat(3, minmax(0,1fr)); }
        #marketing-budget-root .mkb-charts-2 { grid-template-columns:repeat(2, minmax(0,1fr)); }
        #marketing-budget-root .mkb-ctr-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:10px 16px; }
        #marketing-budget-root .mkb-table td.mkb-tags { white-space:normal; }
        #marketing-budget-root .mkb-table td.mkb-motivo { white-space:nowrap; overflow:visible; text-overflow:clip; }
        #marketing-budget-root .mkb-table td.mkb-motivo .mkb-st { white-space:nowrap; }
        #marketing-budget-root .mkb-table td.mkb-tags .mkb-st { margin:1px 0; }
        #marketing-budget-root .mkb-table-perfil { min-width:640px; }
        #marketing-budget-root .mkb-grp td { background:#e7f6ee !important; color:#105436; font-weight:700; font-size:0.76rem; text-transform:uppercase; }
        #marketing-budget-root .mkb-pbar { display:flex; align-items:center; gap:8px; }
        #marketing-budget-root .mkb-pbar .mkb-bar { flex:1; margin-top:0; }
        #marketing-budget-root .mkb-pbar b { min-width:48px; text-align:right; font-size:0.78rem; }
        #marketing-budget-root .mkb-canc { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
        @media (max-width: 1100px) {
          #marketing-budget-root .mkb-charts-3, #marketing-budget-root .mkb-charts-2, #marketing-budget-root .mkb-canc, #marketing-budget-root .mkb-par, #marketing-budget-root .mkb-par-sexo { grid-template-columns:1fr; }
          #marketing-budget-root .mkb-kpis, #marketing-budget-root .mkb-kpis.mkb-kpis-3 { grid-template-columns:1fr; }
          #marketing-budget-root .mkb-charts, #marketing-budget-root .mkb-config { grid-template-columns:1fr; }
        }
      </style>
      <div class="mkb-wrap">
        <div class="mkb-head">
          <div class="mkb-head-ic"><i data-lucide="wallet" style="width:18px;height:18px;color:#fff;"></i></div>
          <div>
            <div style="font-weight:800;font-size:1.05rem;">Budget de marketing</div>
            <div style="font-size:0.8rem;opacity:0.85;">Verba pelo VGV da obra · gastos realizados e comprometidos · custo por unidade vendida</div>
          </div>
        </div>
        <div class="mkb-body">
          <div class="mkb-card mkb-filtros">
            <div class="mkb-f-cc">
              <label for="mkb-cc">Empreendimento</label>
              <select id="mkb-cc" ${s.loading ? "disabled" : ""} onchange="MarketingBudgetApp.onCcSelect(this.value)">${this.empreendimentoOptions(cc ? cc.id : "", { somenteVerba: true })}</select>
            </div>
            <div>
              <label for="mkb-de">De (vencimento)</label>
              <input id="mkb-de" type="date" value="${this.esc(s.startDate)}" ${s.loading ? "disabled" : ""} onchange="MarketingBudgetApp.onField('startDate', this.value)">
            </div>
            <div>
              <label for="mkb-ate">Até</label>
              <input id="mkb-ate" type="date" value="${this.esc(s.endDate)}" ${s.loading ? "disabled" : ""} onchange="MarketingBudgetApp.onField('endDate', this.value)">
            </div>
            <button type="button" class="btn btn-primary" ${s.loading ? "disabled" : ""} onclick="MarketingBudgetApp.consultar()"
              style="height:38px;width:140px;justify-content:center;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="search" style="width:14px;"></i> Consultar
            </button>
          </div>
          ${corpo}
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    this.bindCatFiltro();
    if (s.consultado && !s.loading && !s.error) {
      if (s.aba === "perfil") this.desenharGraficosPerfil();
      else if (s.aba === "contratos") this.desenharGraficosContratos();
      else this.desenharGraficos();
    }
  },

  destruirGraficos() {
    Object.keys(this.charts).forEach((k) => {
      try { this.charts[k].destroy(); } catch (e) {}
    });
    this.charts = {};
  },

  desenharGraficos() {
    if (typeof Chart === "undefined") return;
    const r = this.resumo();
    const meses = this.meses();
    const rot = meses.map((m) => ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m.slice(5)) - 1] + "/" + m.slice(2, 4));
    const porMes = (st) => meses.map((m) => r.rows.filter((x) => x.status === st && String(x.data).slice(0, 7) === m).reduce((t, x) => t + x.valor, 0));
    const real = porMes("realizado");
    const prev = porMes("previsao");
    const comp = porMes("comprometido").map((v, i) => v + prev[i]);
    let acc = 0;
    const acum = meses.map((_, i) => (acc += real[i] + comp[i]));
    const tick = { callback: (v) => this.moneyShort(v) };
    const tip = { callbacks: { label: (c) => `${c.dataset.label}: ${this.money(c.parsed.y != null ? c.parsed.y : c.parsed)}` } };
    const elMes = document.getElementById("mkb-ch-mes");
    if (elMes) {
      const ds = [
        { type: "bar", label: "Realizado", data: real, backgroundColor: "#105436", stack: "g", order: 2 },
        { type: "bar", label: "Comprometido", data: comp, backgroundColor: "#f37021", stack: "g", order: 2 },
        { type: "line", label: "Acumulado", data: acum, borderColor: "#0ea5e9", backgroundColor: "#0ea5e9", tension: 0.25, pointRadius: 2, order: 1 }
      ];
      if (r.verba > 0) ds.push({ type: "line", label: "Verba", data: meses.map(() => r.verba), borderColor: "#b91c1c", borderDash: [6, 4], pointRadius: 0, order: 0 });
      this.charts.mes = new Chart(elMes, {
        data: { labels: rot, datasets: ds },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: tip, legend: { position: "bottom" } }, scales: { x: { stacked: true }, y: { stacked: false, beginAtZero: true, ticks: tick } } }
      });
    }
    const elV = document.getElementById("mkb-ch-vendas");
    if (elV) {
      const s = this.state;
      const vend = meses.map((m) => s.vendas.filter((v) => v.data.slice(0, 7) === m).reduce((t, v) => t + v.unidades, 0));
      const dist = meses.map((m) => s.distratos.filter((v) => (v.dataCancel || v.data).slice(0, 7) === m).reduce((t, v) => t + v.unidades, 0));
      let accR = 0;
      let accU = 0;
      const cac = meses.map((_, i) => {
        accR += real[i];
        accU += vend[i] - dist[i];
        return accU > 0 ? accR / accU : null;
      });
      this.charts.vendas = new Chart(elV, {
        data: {
          labels: rot,
          datasets: [
            { type: "bar", label: "Unidades vendidas", data: vend, backgroundColor: "#6366f1", yAxisID: "u", order: 2 },
            { type: "bar", label: "Distratos", data: dist.map((d) => -d), backgroundColor: "#fca5a5", yAxisID: "u", order: 2 },
            { type: "line", label: "Custo por unidade (acumulado)", data: cac, borderColor: "#105436", backgroundColor: "#105436", tension: 0.25, pointRadius: 2, spanGaps: true, yAxisID: "cac", order: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => c.dataset.yAxisID === "cac" ? `${c.dataset.label}: ${this.money(c.parsed.y)}` : `${c.dataset.label}: ${Math.abs(c.parsed.y)}` } } },
          scales: {
            u: { type: "linear", position: "left", beginAtZero: true, ticks: { precision: 0, callback: (v) => Math.abs(v) } },
            cac: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, ticks: tick }
          }
        }
      });
    }
  }
};

window.MarketingBudgetApp = MarketingBudgetApp;

/* Marketing · Configurações
   Por empreendimento: % do VGV para marketing e quais centros de custo compõem os gastos de marketing da obra.
   Grava em marketing_budget_config/{empreendimento} = { pct, ccs }. */
const MarketingConfigApp = {
  FILTRO_ID: "mkc-ccs",

  state: {
    ccId: "",
    pct: "",
    ccs: [],
    open: false,
    query: "",
    lista: {},
    carregando: false,
    salvando: false,
    obra: null,
    salvoEm: ""
  },

  get B() {
    return window.MarketingBudgetApp;
  },

  ccs() {
    return this.B.state.costCenters || [];
  },

  ccDe(id) {
    return this.ccs().find((c) => String(c.id) === String(id)) || null;
  },

  async init() {
    const s = this.state;
    try {
      s.carregando = true;
      this.render();
      await this.B.carregarCcs();
      await Promise.all([this.carregarLista(), this.B.carregarUnidades()]);
      s.carregando = false;
      if (s.ccId) await this.selecionar(s.ccId);
      else this.render();
    } catch (e) {
      s.carregando = false;
      console.error("[Marketing Config]", e);
      this.erro(e);
    }
  },

  erro(e) {
    const root = document.getElementById("marketing-config-root");
    if (!root) return;
    const msg = String((e && e.message) || e || "erro desconhecido").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    root.innerHTML = `<div class="crm-card" style="padding:20px;border-left:4px solid #dc2626;">
      <strong style="color:#b91c1c;">Não foi possível abrir as Configurações do marketing.</strong>
      <div style="margin-top:6px;color:#475569;font-size:0.85rem;">Atualize a página com Ctrl+F5. Se continuar, envie esta mensagem: <code>${msg}</code></div>
    </div>`;
  },

  async carregarLista() {
    const B = this.B;
    const fc = window.firebaseCollections;
    const lista = {};
    let ok = false;
    if (window.firebaseDb && fc && fc.getDocs) {
      try {
        const snap = await fc.getDocs(fc.collection(window.firebaseDb, B.CONFIG_COLLECTION));
        snap.forEach((d) => { if (d.id !== B.CAT_DOC) lista[d.id] = d.data() || {}; });
        ok = true;
      } catch (e) {
        console.warn("[Marketing Config] lista", e);
      }
    }
    if (!ok) {
      const local = B.configLocal();
      Object.keys(local).forEach((k) => { if (k !== B.CAT_DOC) lista[k] = local[k] || {}; });
    }
    this.state.lista = lista;
  },

  onObraSelect(id) {
    this.selecionar(String(id || ""));
  },

  async selecionar(id) {
    const s = this.state;
    s.ccId = id ? String(id) : "";
    s.open = false;
    s.query = "";
    s.salvoEm = "";
    s.obra = null;
    if (!s.ccId) {
      s.pct = "";
      s.ccs = [];
      this.render();
      return;
    }
    const cfg = s.lista[s.ccId] || await this.B.lerConfig(s.ccId);
    s.pct = cfg && Number.isFinite(Number(cfg.pct)) && cfg.pct !== "" ? String(cfg.pct).replace(".", ",") : "";
    s.ccs = this.B.ccsDaConfig(cfg, s.ccId);
    this.render();
    const cc = this.ccDe(s.ccId) || { id: s.ccId };
    const alvo = s.ccId;
    const obra = await this.B.lerVgv(cc);
    if (this.state.ccId !== alvo) return;
    s.obra = obra;
    this.pintarVerba();
  },

  pctNumero() {
    const n = Number(String(this.state.pct || "").replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  },

  onPct(v) {
    this.state.pct = v;
    this.pintarVerba();
  },

  pintarVerba() {
    const el = document.getElementById("mkc-verba");
    if (el) el.innerHTML = this.verbaHtml();
  },

  verbaHtml() {
    const B = this.B;
    const s = this.state;
    const vazio = (tit, val, nota, verba) => `<div class="mkc-passo${verba ? " mkc-passo-verba" : " mkc-passo-fixo"}"><span>${tit}</span><strong${verba ? ' class="mkc-verba-v"' : ""}>${val}</strong><small>${nota}</small></div>`;
    if (!s.obra) return `${vazio("VGV da obra", "…", "Lendo o cadastro da obra no Sienge")}<div class="mkc-op" aria-hidden="true">=</div>${vazio("Verba de marketing", "…", "Percentual × VGV", true)}`;
    const pct = this.pctNumero();
    const fonte = s.obra.fonte === "obra" ? "Cadastro da obra no Sienge" : (s.obra.fonte === "centro" ? "Digitado no centro de custo" : "Obra sem VGV no Sienge");
    const verba = s.obra.vgv > 0 && pct >= 0 ? s.obra.vgv * (pct / 100) : 0;
    const pctTxt = Number.isFinite(pct) ? String(pct).replace(".", ",") : "—";
    return `${vazio("VGV da obra", s.obra.vgv > 0 ? B.money(s.obra.vgv) : "—", fonte)}
      <div class="mkc-op" aria-hidden="true">=</div>
      ${vazio("Verba de marketing", verba > 0 ? B.money(verba) : "—", `${pctTxt}% do VGV`, true)}`;
  },

  /* ---------- seleção de centros de custo (padrão Marcar Todos / Desmarcar Todos) ---------- */
  itensFiltro() {
    return this.ccs().map((c) => ({ id: String(c.id), label: `${c.id} - ${String(c.name || c.nome || "").toUpperCase()}` }));
  },

  filtroOpts() {
    const s = this.state;
    return {
      id: this.FILTRO_ID,
      label: "Selecionar centros de custo",
      items: this.itensFiltro(),
      selectedIds: s.ccs,
      open: s.open,
      query: s.query,
      emptyMeansAll: false,
      countMode: true,
      nouns: { singular: "centro de custo", plural: "centros de custo", none: "Nenhum centro de custo", noMatch: "Nenhum centro de custo com esse nome." }
    };
  },

  bindFiltro() {
    const self = this;
    MlEmpresaFilter.bind(this.FILTRO_ID, {
      toggleOpen() { self.state.open = !self.state.open; self.pintarFiltro(); },
      close() { if (self.state.open) { self.state.open = false; self.pintarFiltro(); } },
      setQuery(q) { self.state.query = q; self.pintarLista(); },
      toggleId(itemId, on) {
        const set = new Set(self.state.ccs);
        if (on) set.add(String(itemId)); else set.delete(String(itemId));
        self.state.ccs = [...set];
        self.pintarSelecao();
      },
      selectAll() {
        const q = String(self.state.query || "").toLowerCase().trim();
        const set = new Set(self.state.ccs);
        self.itensFiltro().forEach((it) => { if (!q || `${it.id} ${it.label}`.toLowerCase().includes(q)) set.add(it.id); });
        self.state.ccs = [...set];
        self.pintarLista();
        self.pintarSelecao();
      },
      selectNone() {
        self.state.ccs = [];
        self.pintarLista();
        self.pintarSelecao();
      }
    });
  },

  pintarFiltro() {
    const slot = document.getElementById("mkc-ccs-slot");
    if (!slot) return;
    slot.innerHTML = MlEmpresaFilter.html(this.filtroOpts());
    if (window.lucide) lucide.createIcons();
    if (this.state.open) {
      const q = document.getElementById(this.FILTRO_ID + "-search");
      if (q) q.focus();
    }
  },

  pintarLista() {
    const el = document.getElementById(this.FILTRO_ID + "-list");
    if (el) el.innerHTML = MlEmpresaFilter.listHtml(this.filtroOpts());
  },

  pintarSelecao() {
    const o = this.filtroOpts();
    const btn = document.querySelector(`#${this.FILTRO_ID} .ml-emp-filter-btn span`);
    if (btn) btn.textContent = MlEmpresaFilter.buttonLabel(o.items, o.selectedIds, false, true, o.nouns);
    const sel = document.getElementById("mkc-sel");
    if (sel) sel.innerHTML = this.selecaoHtml();
  },

  remover(id) {
    this.state.ccs = this.state.ccs.filter((x) => x !== String(id));
    this.pintarLista();
    this.pintarSelecao();
  },

  selecaoHtml() {
    const B = this.B;
    const s = this.state;
    if (!s.ccs.length) return `<span class="mkc-muted">Nenhum centro de custo marcado.</span>`;
    return s.ccs.slice().sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).map((id) => {
      const cc = this.ccDe(id);
      const nome = cc ? B.ccLabel(cc) : id;
      const integral = B.ccTemMarketing(id, nome);
      return `<span class="mkc-chip${id === s.ccId ? " is-obra" : ""}${integral ? " is-mkt" : ""}" title="${B.esc(nome)}">
        ${integral ? `<em>100%</em>` : `<em>Grupo</em>`}
        <b>${B.esc(nome)}</b>
        <button type="button" onclick="MarketingConfigApp.remover('${B.esc(id)}')" title="Tirar"><i data-lucide="x" style="width:12px;height:12px;"></i></button></span>`;
    }).join("");
  },

  async salvar() {
    const B = this.B;
    const s = this.state;
    if (!s.ccId) { alert("Escolha o empreendimento."); return; }
    const pct = this.pctNumero();
    if (String(s.pct || "").trim() === "" || !Number.isFinite(pct) || pct < 0 || pct > 100) { alert("Informe o percentual de marketing entre 0 e 100."); return; }
    if (!s.ccs.length) { alert("Marque pelo menos um centro de custo."); return; }
    s.salvando = true;
    this.render();
    const ccs = s.ccs.slice().sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    const ok = await B.gravarConfig(s.ccId, { pct, ccs });
    s.salvando = false;
    s.lista[s.ccId] = { ...(s.lista[s.ccId] || {}), pct, ccs, updatedAt: new Date().toISOString(), updatedBy: (window.MarketingApp && MarketingApp.currentUserName()) || "" };
    s.salvoEm = ok ? new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
    if (B.state.ccId === s.ccId && B.state.consultado) {
      B.state.pct = pct;
      const mudouCcs = ccs.join(",") !== B.state.ccsCfg.slice().sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).join(",");
      if (mudouCcs) B.state.consultado = false;
    }
    this.render();
    if (!ok) alert("A configuração ficou salva só neste computador: não consegui gravar no Firebase. Tente salvar de novo.");
  },

  editar(id) {
    this.selecionar(id);
    const el = document.getElementById("marketing-config-root");
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  listaHtml() {
    const B = this.B;
    const s = this.state;
    const ids = Object.keys(s.lista).filter((id) => s.lista[id] && (s.lista[id].pct != null || Array.isArray(s.lista[id].ccs)))
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    if (!ids.length) return `<p class="mkc-muted" style="margin:0;">Nenhum empreendimento configurado ainda.</p>`;
    return `<div class="mkc-tablewrap"><table class="mkc-table">
      <colgroup><col style="width:30%"><col style="width:10%"><col style="width:36%"><col style="width:16%"><col style="width:8%"></colgroup>
      <thead><tr><th>Empreendimento</th><th style="text-align:right;">% marketing</th><th>Centros de custo considerados</th><th>Atualizado</th><th></th></tr></thead>
      <tbody>${ids.map((id) => {
        const c = s.lista[id];
        const cc = this.ccDe(id);
        const ccs = B.ccsDaConfig(c, id);
        const quando = c.updatedAt ? new Date(c.updatedAt).toLocaleDateString("pt-BR") : "—";
        return `<tr class="${id === s.ccId ? "is-sel" : ""}">
          <td title="${B.esc(cc ? B.ccLabel(cc) : id)}"><strong>${B.esc(cc ? B.ccLabel(cc) : id)}</strong></td>
          <td style="text-align:right;">${c.pct != null && c.pct !== "" ? String(c.pct).replace(".", ",") + "%" : "—"}</td>
          <td title="${B.esc(ccs.map((x) => { const o = this.ccDe(x); return o ? B.ccLabel(o) : x; }).join("\n"))}">${B.esc(ccs.join(", "))}${Array.isArray(c.ccs) && c.ccs.length ? "" : ' <span class="mkc-muted">(só a obra)</span>'}</td>
          <td>${B.esc(quando)}${c.updatedBy ? `<div class="mkc-muted">${B.esc(c.updatedBy)}</div>` : ""}</td>
          <td style="text-align:right;"><button type="button" class="btn btn-outline btn-sm" onclick="MarketingConfigApp.editar('${B.esc(id)}')">Editar</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  },

  render() {
    const root = document.getElementById("marketing-config-root");
    if (!root) return;
    const B = this.B;
    const s = this.state;
    const cc = this.ccDe(s.ccId);
    this.bindFiltro();
    const form = s.ccId ? `
          <div class="mkc-conta">
            <div class="mkc-passo">
              <label for="mkc-pct">% do VGV</label>
              <div class="mkc-pct"><input id="mkc-pct" type="text" inputmode="decimal" placeholder="0,00" value="${B.esc(s.pct)}" oninput="MarketingConfigApp.onPct(this.value)"><em>%</em></div>
              <small>De 0 a 100</small>
            </div>
            <div class="mkc-op" aria-hidden="true">×</div>
            <div class="mkc-resultados" id="mkc-verba">${this.verbaHtml()}</div>
          </div>
          <div class="mkc-bloco">
            <div class="mkc-bloco-t">
              <strong>Gastos que entram na verba</strong>
              <span>Marque os centros de custo desta obra. Cada linha mostra se entra o gasto inteiro ou só o grupo de marketing.</span>
            </div>
            <div class="mkc-campo" id="mkc-ccs-slot">${MlEmpresaFilter.html(this.filtroOpts())}</div>
            <div class="mkc-sel" id="mkc-sel">${this.selecaoHtml()}</div>
            <div class="mkc-legenda">
              <span><em>100%</em> O nome tem MARKETING e todo o gasto entra.</span>
              <span><em>Grupo</em> Só as contas 2.03.05: pago, em aberto e previsão.</span>
            </div>
          </div>
          <div class="mkc-rodape">
            ${s.salvoEm ? `<span class="mkc-ok"><i data-lucide="check-circle-2" style="width:14px;height:14px;"></i> Salvo às ${B.esc(s.salvoEm)}</span>` : `<span></span>`}
            <button type="button" class="btn btn-primary" ${s.salvando ? "disabled" : ""} onclick="MarketingConfigApp.salvar()">
              ${s.salvando ? '<span class="btn-spin"></span> Salvando…' : '<i data-lucide="save" style="width:14px;height:14px;"></i> Salvar'}
            </button>
          </div>` : `<p class="mkc-muted" style="margin:12px 0 0;">Escolha o empreendimento para definir o percentual de marketing e os centros de custo.</p>`;
    root.innerHTML = `
      <style>
        #marketing-config-root .mkc-wrap { padding:8px 4px 24px; }
        #marketing-config-root .mkc-head { background:#105436; padding:16px 20px; border-radius:12px 12px 0 0; display:flex; align-items:center; gap:12px; color:#fff; }
        #marketing-config-root .mkc-head-ic { width:36px; height:36px; background:rgba(255,255,255,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; }
        #marketing-config-root .mkc-body { background:#f8fafc; border:1px solid #e2e8f0; border-top:none; padding:16px; border-radius:0 0 12px 12px; display:flex; flex-direction:column; gap:14px; }
        #marketing-config-root .mkc-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; }
        #marketing-config-root .mkc-card h3 { margin:0 0 10px; font-size:0.95rem; color:#105436; }
        #marketing-config-root .mkc-muted { color:#64748b; font-size:0.75rem; font-weight:400; }
        #marketing-config-root label, #marketing-config-root .ml-emp-filter-label { display:block; font-size:0.72rem; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:4px; }
        #marketing-config-root .mkc-obra select { cursor:pointer; background:#fff; width:100%; height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font:inherit; font-size:0.85rem; box-sizing:border-box; white-space:nowrap; }
        #marketing-config-root .mkc-conta { display:grid; grid-template-columns:200px 36px minmax(0,1fr); gap:8px; margin-top:16px; align-items:stretch; }
        #marketing-config-root .mkc-resultados { display:grid; grid-template-columns:minmax(0,1fr) 36px minmax(0,1fr); gap:8px; align-items:stretch; min-width:0; }
        #marketing-config-root .mkc-op { display:flex; align-items:center; justify-content:center; font-size:1.25rem; font-weight:800; color:#105436; }
        #marketing-config-root .mkc-passo { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; min-width:0; }
        #marketing-config-root .mkc-passo-fixo { background:#f8fafc; }
        #marketing-config-root .mkc-passo-verba { background:#e7f6ee; border-color:#9ed9b8; }
        #marketing-config-root .mkc-passo > span, #marketing-config-root .mkc-passo > label { margin-bottom:4px; }
        #marketing-config-root .mkc-passo strong { display:block; min-height:38px; line-height:38px; font-size:1.2rem; color:#0f172a; white-space:nowrap; }
        #marketing-config-root .mkc-passo .mkc-verba-v { color:#105436; }
        #marketing-config-root .mkc-passo small, #marketing-config-root .mkc-passo > small { display:block; margin-top:4px; color:#64748b; font-size:0.72rem; }
        #marketing-config-root .mkc-pct { display:flex; align-items:center; gap:6px; }
        #marketing-config-root .mkc-pct input { width:100%; height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:1rem; font-weight:700; text-align:right; box-sizing:border-box; }
        #marketing-config-root .mkc-pct em { font-style:normal; font-weight:700; color:#475569; }
        #marketing-config-root .mkc-bloco { margin-top:16px; padding-top:14px; border-top:1px solid #e2e8f0; display:flex; flex-direction:column; gap:10px; }
        #marketing-config-root .mkc-bloco-t strong { display:block; color:#105436; font-size:0.95rem; }
        #marketing-config-root .mkc-bloco-t span { display:block; color:#64748b; font-size:0.78rem; margin-top:2px; }
        #marketing-config-root .ml-emp-filter { max-width:none; width:100%; }
        #marketing-config-root .ml-emp-filter-btn { height:38px; min-height:38px; width:100%; }
        #marketing-config-root .ml-emp-filter-list { max-height:320px; }
        #marketing-config-root .mkc-sel { display:flex; flex-direction:column; gap:6px; margin:0; }
        #marketing-config-root .mkc-chip { display:flex; align-items:center; gap:8px; height:36px; padding:0 6px 0 8px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; color:#105436; font-size:0.8rem; font-weight:600; min-width:0; }
        #marketing-config-root .mkc-chip em { font-style:normal; font-size:0.62rem; font-weight:800; letter-spacing:0.02em; text-transform:uppercase; background:#e7f6ee; color:#105436; border-radius:999px; padding:3px 7px; flex:none; }
        #marketing-config-root .mkc-chip b { font-weight:600; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #marketing-config-root .mkc-chip.is-obra { background:#105436; border-color:#105436; color:#fff; }
        #marketing-config-root .mkc-chip.is-obra em { background:rgba(255,255,255,0.18); color:#fff; }
        #marketing-config-root .mkc-chip button { border:0; background:transparent; color:inherit; cursor:pointer; display:inline-flex; padding:4px; border-radius:50%; flex:none; margin-left:auto; }
        #marketing-config-root .mkc-chip button:hover { background:rgba(0,0,0,0.08); }
        #marketing-config-root .mkc-legenda { display:flex; flex-wrap:wrap; gap:8px 18px; }
        #marketing-config-root .mkc-legenda span { color:#64748b; font-size:0.75rem; }
        #marketing-config-root .mkc-legenda em { font-style:normal; font-weight:800; color:#105436; }
        #marketing-config-root .mkc-rodape { display:flex; align-items:center; justify-content:flex-end; gap:12px; margin-top:4px; padding-top:12px; border-top:1px solid #e2e8f0; }
        #marketing-config-root .mkc-rodape .btn { height:38px; min-width:140px; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
        #marketing-config-root .mkc-ok { display:inline-flex; align-items:center; gap:4px; margin-right:auto; color:#105436; font-size:0.8rem; font-weight:600; }
        #marketing-config-root .mkc-tablewrap { max-height:50vh; overflow:auto; }
        #marketing-config-root .mkc-table { width:100%; min-width:760px; border-collapse:collapse; table-layout:fixed; font-size:0.82rem; }
        #marketing-config-root .mkc-table thead th { position:sticky; top:0; background:#1b8253; color:#fff; padding:10px; text-align:left; font-weight:600; z-index:1; }
        #marketing-config-root .mkc-table td { padding:8px 10px; border-bottom:1px solid #e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle; }
        #marketing-config-root .mkc-table tbody tr:nth-child(even) { background:#f8faf9; }
        #marketing-config-root .mkc-table tr.is-sel td { background:#e7f6ee; }
        @media (max-width: 900px) {
          #marketing-config-root .mkc-conta, #marketing-config-root .mkc-resultados { grid-template-columns:1fr; }
          #marketing-config-root .mkc-op { height:28px; }
        }
      </style>
      <div class="mkc-wrap">
        <div class="mkc-head">
          <div class="mkc-head-ic"><i data-lucide="settings" style="width:18px;height:18px;color:#fff;"></i></div>
          <div>
            <div style="font-weight:800;font-size:1.05rem;">Configurações do marketing</div>
            <div style="font-size:0.8rem;opacity:0.85;">Percentual de marketing e centros de custo que compõem os gastos de cada obra</div>
          </div>
        </div>
        <div class="mkc-body">
          <div class="mkc-card">
            <div class="mkc-obra">
              <label for="mkc-obra">Empreendimento</label>
              <select id="mkc-obra" ${s.carregando ? "disabled" : ""} onchange="MarketingConfigApp.onObraSelect(this.value)">${B.empreendimentoOptions(s.ccId)}</select>
            </div>
            ${s.carregando ? `<p class="mkc-muted" style="margin:12px 0 0;">Carregando…</p>` : form}
          </div>
          <div class="mkc-card">
            <h3>Empreendimentos configurados</h3>
            ${s.carregando ? `<p class="mkc-muted" style="margin:0;">Carregando…</p>` : this.listaHtml()}
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }
};

window.MarketingConfigApp = MarketingConfigApp;
