/* Marketing · Budget
   Verba = VGV da obra (Sienge) × % de marketing (definido em Configurações). Consome com os títulos a pagar
   dos planos financeiros de marketing dos centros de custo configurados para a obra (pagos = realizado,
   em aberto = comprometido) e mede o custo de aquisição por unidade vendida com os contratos de venda.
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
    startDate: "",
    endDate: "",
    loading: false,
    progress: "",
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

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    return cc ? `${cc.id} — ${cc.name || cc.nome || ""}` : "";
  },

  ccAtual() {
    return this.state.costCenters.find((c) => String(c.id) === String(this.state.ccId)) || null;
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
    this.render();
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
  onCcInput(raw) {
    const val = String(raw || "").trim();
    const cc = this.state.costCenters.find((c) => String(c.id) === val || this.ccLabel(c) === val || `${c.id} - ${c.name}` === val);
    this.state.ccId = cc ? String(cc.id) : "";
  },

  onField(key, value) {
    this.state[key] = value;
  },

  setProgress(text) {
    this.state.progress = text;
    const el = document.getElementById("mkb-progress");
    if (el) el.textContent = text;
  },

  async consultar() {
    const s = this.state;
    const input = document.getElementById("mkb-cc");
    if (input) this.onCcInput(input.value);
    const cc = this.ccAtual();
    if (!cc) { alert("Escolha o empreendimento (centro de custo)."); return; }
    if (!s.startDate || !s.endDate || s.startDate > s.endDate) { alert("Informe um período válido."); return; }
    const gen = (s.gen += 1);
    s.loading = true;
    s.error = "";
    s.consultado = true;
    s.rows = [];
    s.vendas = [];
    s.distratos = [];
    s.adimpl = { status: "", porVenda: {} };
    s.perfis = { status: "", map: {}, feitos: 0, total: 0 };
    this.render();
    try {
      this.setProgress("Lendo o cadastro da obra (VGV)…");
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
      const bills = [];
      for (let i = 0; i < s.ccsCfg.length; i++) {
        const alvo = s.costCenters.find((c) => String(c.id) === s.ccsCfg[i]) || { id: s.ccsCfg[i] };
        const rotulo = s.ccsCfg.length > 1 ? ` · centro ${alvo.id} (${i + 1} de ${s.ccsCfg.length})` : "";
        this.setProgress("Buscando os títulos a pagar" + rotulo + "…");
        const parte = await this.buscarTitulos(alvo, gen, rotulo);
        if (gen !== s.gen) return;
        bills.push.apply(bills, parte);
      }
      this.montarGastos(bills, s.ccsCfg);
      this.setProgress("Buscando as vendas do empreendimento…");
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

  async buscarTitulos(cc, gen, rotulo) {
    const base = window.ComprasControleApp || window.ComprasPrevisoesApp;
    if (!base || typeof base.outcomeRange !== "function") throw new Error("O módulo de contas a pagar não está disponível.");
    const s = this.state;
    const api = Object.create(base);
    api.outcomeEndpoint = (start, end, companyId) => "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false&withBankMovements=true"
      + "&costCentersId=" + encodeURIComponent(cc.id)
      + (companyId ? "&companyId=" + encodeURIComponent(companyId) : "");
    api.noteProgress = (t) => { if (gen === s.gen) this.setProgress(t); };
    const companyId = String(cc.idCompany != null ? cc.idCompany : (cc.companyId != null ? cc.companyId : ""));
    const faixas = typeof siengeSplitDateRange === "function" ? siengeSplitDateRange(s.startDate, s.endDate) : [{ start: s.startDate, end: s.endDate }];
    const bills = [];
    for (let i = 0; i < faixas.length; i++) {
      if (gen !== s.gen) return [];
      this.setProgress(`Buscando os títulos a pagar${rotulo || " do empreendimento"} · período ${i + 1} de ${faixas.length}`);
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
    const sel = new Set(this.categoriasSelecionadas());
    const rows = s.rows.filter((r) => sel.has(r.catId));
    const soma = (st) => rows.filter((r) => r.status === st).reduce((t, r) => t + r.valor, 0);
    const verba = (Number(s.obra && s.obra.vgv) || 0) * ((Number(s.pct) || 0) / 100);
    const realizado = soma("realizado");
    const comprometido = soma("comprometido");
    const previsto = soma("previsao");
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
    const box = document.getElementById("mkb-gastos");
    if (box) box.innerHTML = this.gastosHtml(this.resumo());
  },

  /* ---------- render ---------- */
  kpi(label, valor, sub, cor, extra) {
    return `<div class="mkb-kpi" style="border-top-color:${cor};">
      <span>${label}</span><strong>${valor}</strong>${sub ? `<small>${sub}</small>` : ""}${extra || ""}
    </div>`;
  },

  gastosHtml(r) {
    const s = this.state;
    const nomes = { realizado: "Realizado", comprometido: "Comprometido", previsao: "Previsão" };
    const cont = { todos: r.rows.length, realizado: 0, comprometido: 0, previsao: 0 };
    r.rows.forEach((x) => { cont[x.status] += 1; });
    const lista = s.filtroGasto === "todos" ? r.rows : r.rows.filter((x) => x.status === s.filtroGasto);
    const chips = ["todos", "realizado", "comprometido", "previsao"].map((id) => `<button type="button" class="mkb-chip${s.filtroGasto === id ? " is-on" : ""}" onclick="MarketingBudgetApp.setFiltroGasto('${id}')">${id === "todos" ? "Todos" : nomes[id]} <b>${cont[id]}</b></button>`).join("");
    const linhas = lista.length ? lista.map((x) => `<tr class="mkb-click" onclick="MarketingBudgetApp.abrirDespesa(${x.idx})" title="Clique para ver o resumo do título">
        <td>${this.dataBr(x.data)}</td>
        <td><span class="mkb-st mkb-st-${x.status}">${nomes[x.status]}</span></td>
        <td><strong>${this.esc(x.titulo)}</strong>${x.parcela ? `<span class="mkb-muted"> / ${this.esc(x.parcela)}</span>` : ""}</td>
        <td title="${this.esc(x.credor)}">${this.esc(x.credor)}</td>
        <td>${this.esc(x.documento || "—")}</td>
        <td>${this.esc(x.ccId || "—")}</td>
        <td title="${this.esc(x.catNome)}">${this.esc(x.catNome)}</td>
        <td style="text-align:right;">${this.money(x.valor)}</td>
      </tr>`).join("")
      : `<tr><td colspan="8" class="mkb-vazio">Nenhum gasto ${s.filtroGasto === "todos" ? "nos planos de marketing selecionados" : "nesta situação"} no período.</td></tr>`;
    return `<div class="mkb-chips">${chips}</div>
      <div class="mkb-tablewrap"><table class="mkb-table">
        <colgroup><col style="width:9%"><col style="width:11%"><col style="width:9%"><col style="width:20%"><col style="width:10%"><col style="width:8%"><col style="width:20%"><col style="width:13%"></colgroup>
        <thead><tr><th>Data</th><th>Situação</th><th>Título</th><th>Credor</th><th>Documento</th><th>Centro de custo</th><th>Plano financeiro</th><th style="text-align:right;">Valor</th></tr></thead>
        <tbody>${linhas}</tbody>
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
    if (!window.MlEmpresaFilter) return;
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
    const sel = new Set(this.categoriasSelecionadas());
    const marcados = Object.values(s.categorias).filter((c) => sel.has(c.id)).sort((a, b) => b.total - a.total);
    const resumo = marcados.length
      ? marcados.slice(0, 6).map((c) => `${this.esc(c.nome)} <b>${this.moneyShort(c.total)}</b>`).join(" · ") + (marcados.length > 6 ? ` · e mais ${marcados.length - 6}` : "")
      : "Nenhum plano marcado: os gastos ficam zerados.";
    return `<div class="mkb-cats-row">
        <div id="mkb-cats-slot">${window.MlEmpresaFilter ? MlEmpresaFilter.html(this.catOpts()) : ""}</div>
        <p class="mkb-cats-resumo">${resumo}</p>
      </div>`;
  },

  resultadoHtml() {
    const s = this.state;
    const r = this.resumo();
    const obra = s.obra || { vgv: 0, fonte: "sem" };
    const fonte = obra.fonte === "obra" ? "Cadastro da obra no Sienge" : (obra.fonte === "centro" ? "Digitado no centro de custo (a obra não tem VGV)" : "Sem VGV — preencha o Valor geral de vendas na obra no Sienge");
    const consumo = Math.min(r.consumo, 100);
    const corConsumo = r.consumo > 100 ? "#b91c1c" : (r.consumo >= 80 ? "#f37021" : "#105436");
    const ev = s.eventos || [];
    const evOrcado = ev.reduce((t, b) => t + (Number(b.plannedValue) || 0), 0);
    return `
      <div class="mkb-card mkb-config">
        <div class="mkb-cfg-item">
          <span>VGV do empreendimento</span>
          <strong>${obra.vgv > 0 ? this.money(obra.vgv) : "—"}</strong>
          <small>${fonte}</small>
        </div>
        <div class="mkb-cfg-item">
          <span>% do VGV para marketing</span>
          <strong>${s.pct > 0 ? String(s.pct).replace(".", ",") + "%" : "—"}</strong>
          <small title="${this.esc(s.ccsCfg.join(", "))}">${s.pct > 0 ? "Definido em Marketing › Configurações" : "Sem percentual · defina em Marketing › Configurações"} · gastos dos centros de custo ${this.esc(s.ccsCfg.join(", ") || "—")}</small>
        </div>
        <div class="mkb-cfg-item mkb-verba">
          <span>Verba de marketing</span>
          <strong>${this.money(r.verba)}</strong>
          <small>VGV × ${String(s.pct || 0).replace(".", ",")}%</small>
        </div>
      </div>

      <div class="mkb-kpis">
        ${this.kpi("Realizado", this.money(r.realizado), "Títulos pagos no período", "#105436")}
        ${this.kpi("Comprometido", this.money(r.comprometido), "Títulos em aberto", "#f37021")}
        ${this.kpi("Saldo da verba", this.money(r.saldo), r.saldo < 0 ? "Verba estourada" : "Verba − realizado − comprometido", r.saldo < 0 ? "#b91c1c" : "#0ea5e9")}
        ${this.kpi("Consumo da verba", r.verba > 0 ? r.consumo.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—", "Realizado + comprometido", corConsumo,
          `<div class="mkb-bar"><i style="width:${consumo}%;background:${corConsumo};"></i></div>`)}
        ${this.kpi("Unidades vendidas", r.liquidas.toLocaleString("pt-BR"), `${r.brutas} vendidas · ${r.distr} distratadas no período`, "#6366f1")}
        ${this.kpi("Custo por unidade vendida", r.cac != null ? this.money(r.cac) : "—", "Realizado ÷ unidades vendidas", "#105436")}
        ${this.kpi("Custo por unidade (c/ comprometido)", r.cacTotal != null ? this.money(r.cacTotal) : "—", "(Realizado + comprometido) ÷ unidades", "#f37021")}
        ${this.kpi("Vendido no período", this.moneyShort(r.vgvVendido), r.vgvVendido > 0 ? "Marketing = " + ((r.realizado / r.vgvVendido) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "% do vendido" : "Valor dos contratos", "#0f766e")}
      </div>
      ${r.previsto > 0 || ev.length ? `<p class="mkb-nota">${r.previsto > 0 ? `Previsões de marketing no período: <strong>${this.money(r.previsto)}</strong> (não entram no comprometido). ` : ""}${ev.length ? `Eventos cadastrados neste empreendimento: <strong>${ev.length}</strong> · orçado ${this.money(evOrcado)}.` : ""}</p>` : ""}

      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Planos financeiros considerados marketing</h3><small>Marque na lista; os números atualizam ao fechar. Vale para todos os empreendimentos.</small></div>
        ${this.categoriasHtml()}
      </div>

      <div class="mkb-charts">
        <div class="mkb-card mkb-chart-full"><div class="mkb-card-h"><h3>Verba × gastos por mês</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-mes"></canvas></div></div>
        <div class="mkb-card mkb-chart-full"><div class="mkb-card-h"><h3>Vendas e custo por unidade vendida</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-vendas"></canvas></div></div>
      </div>

      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Detalhamento dos gastos</h3><small>Realizado = pago · Comprometido = título em aberto · Previsão = documento de previsão</small></div>
        <div id="mkb-gastos">${this.gastosHtml(r)}</div>
      </div>

      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Vendas do empreendimento no período</h3><small>Contratos de venda do Sienge emitidos no período e distratos do período · Atrasado desde = parcela vencida mais antiga no Contas a Receber</small></div>
        <div id="mkb-vendas">${this.vendasHtml()}</div>
      </div>`;
  },

  /* ---------- aba Perfil da venda ---------- */
  setAba(aba) {
    if (this.state.aba === aba) return;
    this.state.aba = aba;
    this.render();
  },

  abasHtml() {
    const s = this.state;
    const aba = (id, rotulo, ic) => `<button type="button" class="mkb-tab${s.aba === id ? " is-active" : ""}" onclick="MarketingBudgetApp.setAba('${id}')"><i data-lucide="${ic}" style="width:14px;height:14px;"></i> ${rotulo}</button>`;
    return `<div class="mkb-tabs">${aba("budget", "Budget", "wallet")}${aba("contratos", "Contratos", "file-text")}${aba("perfil", "Perfil da venda", "users")}</div>`;
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
    const nada = L.filter((c) => c.pag.recebido < 0.01);
    const devEntrada = L.filter((c) => c.pag.entrada && c.pag.entrada.vencida > 0.009);
    const semEntrada = L.filter((c) => !(c.pag.entrada && c.pag.entrada.tem)).length;
    const risco = L.filter((c) => this.riscoDe(c).length)
      .sort((x, y) => (this.riscoDe(y).length - this.riscoDe(x).length) || ((y.pag.dias || 0) - (x.pag.dias || 0)));
    const emRisco = risco.reduce((t, c) => t + (Number(c.pag.aberto) || 0), 0);
    const vencido = atraso.reduce((t, c) => t + (Number(c.pag.vencido) || 0), 0);
    const tag = (m) => m === "nada" ? `<span class="mkb-st mkb-st-cancel">Não pagou nada</span>` : `<span class="mkb-st mkb-st-comprometido">Devendo a entrada</span>`;
    const linhas = risco.map((c) => `<tr>
        <td><strong>${this.esc(c.numero)}</strong></td>
        <td title="${this.esc(c.unidadeNomes)}">${this.esc(c.unidadeNomes || "—")}</td>
        <td title="${this.esc(c.cliente)}">${this.esc(c.cliente || "—")}</td>
        <td>${c.data ? this.dataBr(c.data) : "—"}</td>
        <td style="text-align:right;">${c.pag.pctPago.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
        <td>${c.pag.entrada && c.pag.entrada.vencida > 0.009 ? `<span class="mkb-atraso">${this.money(c.pag.entrada.vencida)} <small>desde ${this.dataBr(c.pag.entrada.desde)}</small></span>` : this.esc(this.situacaoEntrada(c.pag))}</td>
        <td>${this.atrasoHtml({ id: c.id, situacao: "", pagDireto: c.pag })}</td>
        <td style="text-align:right;">${this.money(c.pag.aberto)}</td>
        <td class="mkb-tags">${this.riscoDe(c).map(tag).join(" ")}</td>
      </tr>`).join("");
    return `<div class="mkb-card mkb-ctr-top">
        ${escopo}
        <small class="mkb-muted">Ativos = contratos não cancelados com saldo a pagar no Contas a Receber${todos ? "" : " · vendas emitidas no período"}. Entrada = parcelas de entrada, sinal ou ato.</small>
      </div>
      <div class="mkb-kpis">
        ${this.kpi("Contratos ativos", L.length.toLocaleString("pt-BR"), todos ? "Todos os títulos a receber do empreendimento" : "Vendas do período", "#6366f1")}
        ${this.kpi("Em dia", this.pct(emDia.length, L.length), `${emDia.length} de ${L.length} contrato(s)`, "#105436")}
        ${this.kpi("Em atraso", this.pct(atraso.length, L.length), `${atraso.length} contrato(s) · ${this.money(vencido)} vencido`, atraso.length ? "#b91c1c" : "#105436")}
        ${this.kpi("Não pagaram nada (0%)", nada.length.toLocaleString("pt-BR"), this.pct(nada.length, L.length) + " dos ativos", nada.length ? "#b91c1c" : "#105436")}
        ${this.kpi("Devendo a entrada", devEntrada.length.toLocaleString("pt-BR"), this.pct(devEntrada.length, L.length) + " dos ativos" + (semEntrada ? ` · ${semEntrada} sem entrada identificada` : ""), devEntrada.length ? "#f37021" : "#105436")}
        ${this.kpi("Possíveis cancelamentos", risco.length.toLocaleString("pt-BR"), "Não pagaram nada ou devem a entrada", risco.length ? "#b91c1c" : "#105436")}
        ${this.kpi("Saldo a receber em risco", this.moneyShort(emRisco), "Saldo dos possíveis cancelamentos", "#f37021")}
        ${this.kpi("Média já paga", (L.reduce((t, c) => t + c.pag.pctPago, 0) / L.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%", "Recebido ÷ (recebido + saldo)", "#0f766e")}
      </div>

      <div class="mkb-charts mkb-charts-2">
        <div class="mkb-card"><div class="mkb-card-h"><h3>Contratos ativos em dia × em atraso</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-ctr-dia"></canvas></div></div>
        <div class="mkb-card"><div class="mkb-card-h"><h3>Quanto do contrato já foi pago</h3><small>0% = não pagou nenhuma parcela</small></div><div class="mkb-canvas"><canvas id="mkb-ch-ctr-pago"></canvas></div></div>
        <div class="mkb-card"><div class="mkb-card-h"><h3>Situação da entrada</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-ctr-entrada"></canvas></div></div>
        <div class="mkb-card"><div class="mkb-card-h"><h3>Tempo de atraso</h3><small>Parcela vencida mais antiga</small></div><div class="mkb-canvas"><canvas id="mkb-ch-ctr-atraso"></canvas></div></div>
      </div>

      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Possíveis cancelamentos</h3><small>Clientes que não pagaram nada ou estão devendo a entrada · base para o marketing se programar</small></div>
        ${risco.length ? `<div class="mkb-tablewrap"><table class="mkb-table">
          <colgroup><col style="width:13%"><col style="width:9%"><col style="width:20%"><col style="width:8%"><col style="width:7%"><col style="width:15%"><col style="width:11%"><col style="width:9%"><col style="width:8%"></colgroup>
          <thead><tr><th>Contrato</th><th>Unidade</th><th>Cliente</th><th>Emissão</th><th style="text-align:right;">% pago</th><th>Entrada</th><th>Atrasado desde</th><th style="text-align:right;">Saldo</th><th>Motivo</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>` : `<p class="mkb-muted" style="margin:0;">Nenhum contrato ativo sem pagamento ou com entrada vencida.</p>`}
      </div>`;
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
    const elE = document.getElementById("mkb-ch-ctr-entrada");
    if (elE) {
      const nomes = ["Entrada paga", "Entrada a vencer", "Entrada vencida", "Sem entrada identificada"];
      const data = nomes.map((nm) => L.filter((c) => this.situacaoEntrada(c.pag) === nm).length);
      this.charts.ctrEntrada = barras(elE, nomes, data, ["#105436", "#0ea5e9", "#f37021", "#cbd5e1"], true);
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
    return `${aviso}
      ${erros.length ? `<div class="mkb-card" style="color:#b91c1c;font-size:0.82rem;">${erros.map((e) => this.esc(e)).join("<br>")}</div>` : ""}
      <div class="mkb-kpis">
        ${this.kpi("Contratos ativos", ativos.length.toLocaleString("pt-BR"), `${canc.length} cancelado(s) no período`, "#6366f1")}
        ${this.kpi("Mulheres", this.pct(mulheres, pf.length), `${mulheres} contrato(s) · pessoa física`, "#db2777")}
        ${this.kpi("Homens", this.pct(homens, pf.length), `${homens} contrato(s) · pessoa física`, "#0ea5e9")}
        ${this.kpi("Idade média", idadeMedia != null ? Math.round(idadeMedia) + " anos" : "—", `${comIdade.length} com data de nascimento`, "#0f766e")}
        ${this.kpi("Em atraso", this.pct(atraso.length, comPag.length), `${atraso.length} de ${comPag.length} contrato(s)${semTitulo ? ` · ${semTitulo} sem título` : ""}`, atraso.length ? "#b91c1c" : "#105436")}
        ${this.kpi("Valor vencido", this.money(vencido), "Parcelas vencidas e não pagas", "#f37021")}
        ${this.kpi("Cancelamentos", canc.length.toLocaleString("pt-BR"), this.pct(canc.length, L.length) + " dos contratos do período", "#b91c1c")}
        ${this.kpi("Tempo até cancelar", mediaMeses != null ? mediaMeses.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + (Math.abs(mediaMeses - 1) < 0.05 ? " mês" : " meses") : "—", "Média entre a venda e o cancelamento", "#64748b")}
      </div>

      <div class="mkb-charts mkb-charts-3">
        <div class="mkb-card"><div class="mkb-card-h"><h3>Vendas por sexo</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-sexo"></canvas></div></div>
        <div class="mkb-card"><div class="mkb-card-h"><h3>Vendas por faixa etária</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-faixa"></canvas></div></div>
        <div class="mkb-card"><div class="mkb-card-h"><h3>Em dia × em atraso por faixa etária</h3></div><div class="mkb-canvas"><canvas id="mkb-ch-pag"></canvas></div></div>
      </div>

      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Quem paga em dia e quem está em atraso</h3><small>Contratos ativos · em dia inclui os quitados · em atraso = tem parcela vencida e não paga</small></div>
        ${tabelaPag}
      </div>

      <div class="mkb-card">
        <div class="mkb-card-h"><h3>Perfil de quem cancelou</h3><small>Contratos cancelados no período · taxa = cancelados ÷ contratos do grupo</small></div>
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
  },

  desenharGraficosPerfil() {
    if (typeof Chart === "undefined") return;
    const L = this.linhasPerfil();
    const ativos = L.filter((x) => !x.cancelado);
    const canc = L.filter((x) => x.cancelado);
    const corSexo = { F: "#db2777", M: "#0ea5e9", PJ: "#6366f1", "?": "#cbd5e1" };
    const legenda = { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } };
    const elS = document.getElementById("mkb-ch-sexo");
    if (elS) {
      const ks = ["F", "M", "PJ", "?"].filter((k) => ativos.some((x) => x.sexo === k));
      this.charts.sexo = new Chart(elS, {
        type: "doughnut",
        data: { labels: ks.map((k) => this.SEXOS[k]), datasets: [{ data: ks.map((k) => ativos.filter((x) => x.sexo === k).length), backgroundColor: ks.map((k) => corSexo[k]) }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legenda } }
      });
    }
    const faixas = this.ordemFaixas().filter((f) => ativos.some((x) => x.faixa === f));
    const elF = document.getElementById("mkb-ch-faixa");
    if (elF) {
      const ks = ["F", "M", "PJ", "?"].filter((k) => ativos.some((x) => x.sexo === k));
      this.charts.faixa = new Chart(elF, {
        type: "bar",
        data: { labels: faixas, datasets: ks.map((k) => ({ label: this.SEXOS[k], data: faixas.map((f) => ativos.filter((x) => x.faixa === f && x.sexo === k).length), backgroundColor: corSexo[k], stack: "s" })) },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legenda }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }
      });
    }
    const elP = document.getElementById("mkb-ch-pag");
    if (elP) {
      const g = this.grupos(ativos, (x) => x.faixa, faixas);
      const base = (x) => x.emDia + x.atraso;
      this.charts.pag = new Chart(elP, {
        type: "bar",
        data: {
          labels: g.map((x) => x.nome),
          datasets: [
            { label: "Em dia", data: g.map((x) => base(x) ? (x.emDia / base(x)) * 100 : 0), backgroundColor: "#105436", stack: "p", n: g.map((x) => x.emDia) },
            { label: "Em atraso", data: g.map((x) => base(x) ? (x.atraso / base(x)) * 100 : 0), backgroundColor: "#f37021", stack: "p", n: g.map((x) => x.atraso) }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: legenda, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% (${c.dataset.n[c.dataIndex]})` } } },
          scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%" } } }
        }
      });
    }
    const elC = document.getElementById("mkb-ch-canc");
    if (elC && canc.length) {
      const fx = this.ordemFaixas().filter((f) => canc.some((x) => x.faixa === f));
      const ks = ["F", "M", "PJ", "?"].filter((k) => canc.some((x) => x.sexo === k));
      this.charts.canc = new Chart(elC, {
        type: "bar",
        data: { labels: fx, datasets: ks.map((k) => ({ label: this.SEXOS[k], data: fx.map((f) => canc.filter((x) => x.faixa === f && x.sexo === k).length), backgroundColor: corSexo[k], stack: "c" })) },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legenda, title: { display: true, text: "Cancelados por faixa etária e sexo", font: { size: 11 } } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }
      });
    }
  },

  render() {
    const root = document.getElementById("marketing-budget-root");
    if (!root) return;
    const s = this.state;
    const cc = this.ccAtual();
    const opts = s.costCenters.map((c) => `<option value="${this.esc(this.ccLabel(c))}"></option>`).join("");
    const corpo = s.loading
      ? `<div class="mkb-card" style="text-align:center;padding:40px;color:#64748b;"><div class="spinner" style="margin:0 auto 12px;"></div><p id="mkb-progress" style="margin:0;">${this.esc(s.progress)}</p></div>`
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
        #marketing-budget-root .mkb-card-h { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
        #marketing-budget-root .mkb-card-h h3 { margin:0; font-size:0.95rem; color:#105436; }
        #marketing-budget-root .mkb-card-h small, #marketing-budget-root .mkb-muted { color:#64748b; font-size:0.75rem; font-weight:400; }
        #marketing-budget-root .mkb-filtros { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
        #marketing-budget-root .mkb-filtros label { display:block; font-size:0.72rem; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:4px; }
        #marketing-budget-root .mkb-filtros input { height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font:inherit; font-size:0.85rem; box-sizing:border-box; background:#fff; }
        #marketing-budget-root .mkb-filtros .mkb-f-cc { flex:1 1 360px; }
        #marketing-budget-root .mkb-filtros .mkb-f-cc input { width:100%; }
        #marketing-budget-root .mkb-config { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:16px; }
        #marketing-budget-root .mkb-cfg-item span { display:block; font-size:0.72rem; font-weight:700; color:#64748b; text-transform:uppercase; }
        #marketing-budget-root .mkb-cfg-item strong { display:block; font-size:1.35rem; color:#0f172a; margin-top:4px; }
        #marketing-budget-root .mkb-cfg-item small { display:block; color:#64748b; font-size:0.72rem; margin-top:4px; }
        #marketing-budget-root .mkb-verba strong { color:#105436; }
        #marketing-budget-root .mkb-pct { display:flex; align-items:center; gap:6px; margin-top:4px; }
        #marketing-budget-root .mkb-pct input { width:90px; height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:1rem; font-weight:700; text-align:right; }
        #marketing-budget-root .mkb-pct em { font-style:normal; font-weight:700; color:#475569; }
        #marketing-budget-root .mkb-pct .btn { height:38px; }
        #marketing-budget-root .mkb-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
        #marketing-budget-root .mkb-kpi { background:#fff; border:1px solid #e2e8f0; border-top:4px solid #105436; border-radius:10px; padding:12px 14px; min-width:0; }
        #marketing-budget-root .mkb-kpi span { display:block; font-size:0.7rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.3px; }
        #marketing-budget-root .mkb-kpi strong { display:block; font-size:1.2rem; color:#0f172a; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #marketing-budget-root .mkb-kpi small { display:block; font-size:0.72rem; color:#64748b; margin-top:2px; }
        #marketing-budget-root .mkb-bar { height:6px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:8px; }
        #marketing-budget-root .mkb-bar i { display:block; height:100%; }
        #marketing-budget-root .mkb-nota { margin:0; font-size:0.8rem; color:#475569; }
        #marketing-budget-root .mkb-cats-row { display:flex; align-items:flex-end; gap:16px; }
        #marketing-budget-root .mkb-cats-row .ml-emp-filter { flex:0 0 440px; width:440px; max-width:100%; }
        #marketing-budget-root .mkb-cats-row .ml-emp-filter-btn { height:38px; min-height:38px; }
        #marketing-budget-root .mkb-cats-row .ml-emp-filter-list { max-height:300px; }
        #marketing-budget-root .mkb-cats-resumo { flex:1; min-width:0; margin:0 0 9px; font-size:0.76rem; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #marketing-budget-root .mkb-cats-resumo b { color:#105436; font-weight:700; }
        #marketing-budget-root tr.mkb-click { cursor:pointer; }
        #marketing-budget-root tr.mkb-click:hover td { background:#e7f6ee; }
        #marketing-budget-root .mkb-charts { display:grid; grid-template-columns:2fr 1fr; gap:14px; }
        #marketing-budget-root .mkb-canvas { position:relative; height:260px; }
        #marketing-budget-root .mkb-chart-full { grid-column:1 / -1; }
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
        #marketing-budget-root .mkb-tabs { display:flex; gap:6px; border-bottom:1px solid #e2e8f0; margin-bottom:-4px; }
        #marketing-budget-root .mkb-tab { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:8px 14px; font-weight:700; font-size:0.82rem; color:#64748b; border-bottom:3px solid transparent; cursor:pointer; }
        #marketing-budget-root .mkb-tab:hover { color:#105436; }
        #marketing-budget-root .mkb-tab.is-active { color:#105436; border-bottom-color:#105436; }
        #marketing-budget-root .mkb-atraso { color:#b91c1c; font-weight:700; }
        #marketing-budget-root .mkb-atraso small { color:#c2410c; font-weight:600; }
        #marketing-budget-root .mkb-perfil-aviso { display:flex; align-items:center; gap:10px; color:#475569; font-size:0.82rem; padding:10px 16px; }
        #marketing-budget-root .mkb-charts-3 { grid-template-columns:repeat(3, minmax(0,1fr)); }
        #marketing-budget-root .mkb-charts-2 { grid-template-columns:repeat(2, minmax(0,1fr)); }
        #marketing-budget-root .mkb-ctr-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:10px 16px; }
        #marketing-budget-root .mkb-table td.mkb-tags { white-space:normal; }
        #marketing-budget-root .mkb-table td.mkb-tags .mkb-st { margin:1px 0; }
        #marketing-budget-root .mkb-table-perfil { min-width:640px; }
        #marketing-budget-root .mkb-grp td { background:#e7f6ee !important; color:#105436; font-weight:700; font-size:0.76rem; text-transform:uppercase; }
        #marketing-budget-root .mkb-pbar { display:flex; align-items:center; gap:8px; }
        #marketing-budget-root .mkb-pbar .mkb-bar { flex:1; margin-top:0; }
        #marketing-budget-root .mkb-pbar b { min-width:48px; text-align:right; font-size:0.78rem; }
        #marketing-budget-root .mkb-canc { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
        @media (max-width: 1100px) {
          #marketing-budget-root .mkb-charts-3, #marketing-budget-root .mkb-charts-2, #marketing-budget-root .mkb-canc { grid-template-columns:1fr; }
          #marketing-budget-root .mkb-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
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
              <input id="mkb-cc" list="mkb-cc-list" placeholder="Digite o ID ou o nome do empreendimento" value="${this.esc(cc ? this.ccLabel(cc) : "")}" ${s.loading ? "disabled" : ""}
                onchange="MarketingBudgetApp.onCcInput(this.value)">
              <datalist id="mkb-cc-list">${opts}</datalist>
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
    const comp = porMes("comprometido");
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
      await this.carregarLista();
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

  onObraInput(raw) {
    const val = String(raw || "").trim();
    const cc = this.ccs().find((c) => String(c.id) === val || this.B.ccLabel(c) === val || `${c.id} - ${c.name}` === val);
    this.selecionar(cc ? String(cc.id) : "");
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
    if (!s.obra) return `<span>VGV da obra</span><strong>…</strong><small>Lendo o cadastro da obra no Sienge</small>`;
    const pct = this.pctNumero();
    const fonte = s.obra.fonte === "obra" ? "Cadastro da obra no Sienge" : (s.obra.fonte === "centro" ? "Digitado no centro de custo" : "Obra sem VGV no Sienge");
    const verba = s.obra.vgv > 0 && pct >= 0 ? s.obra.vgv * (pct / 100) : 0;
    return `<span>VGV da obra</span><strong>${s.obra.vgv > 0 ? B.money(s.obra.vgv) : "—"}</strong><small>${fonte}</small>
      <span style="margin-top:10px;">Verba de marketing</span><strong class="mkc-verba-v">${verba > 0 ? B.money(verba) : "—"}</strong><small>VGV × ${Number.isFinite(pct) ? String(pct).replace(".", ",") : "—"}%</small>`;
  },

  /* ---------- seleção de centros de custo (padrão Marcar Todos / Desmarcar Todos) ---------- */
  itensFiltro() {
    return this.ccs().map((c) => ({ id: String(c.id), label: `${c.id} - ${String(c.name || c.nome || "").toUpperCase()}` }));
  },

  filtroOpts() {
    const s = this.state;
    return {
      id: this.FILTRO_ID,
      label: "Centros de custo que compõem os gastos",
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
      return `<span class="mkc-chip${id === s.ccId ? " is-obra" : ""}" title="${B.esc(nome)}">${B.esc(nome)}
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
    const opts = this.ccs().map((c) => `<option value="${B.esc(B.ccLabel(c))}"></option>`).join("");
    this.bindFiltro();
    const form = s.ccId ? `
          <div class="mkc-grid">
            <div class="mkc-campo">
              <label for="mkc-pct">% do VGV para marketing</label>
              <div class="mkc-pct"><input id="mkc-pct" type="text" inputmode="decimal" placeholder="0,00" value="${B.esc(s.pct)}" oninput="MarketingConfigApp.onPct(this.value)"><em>%</em></div>
              <div class="mkc-campo" id="mkc-ccs-slot" style="margin-top:14px;">${MlEmpresaFilter.html(this.filtroOpts())}</div>
              <div class="mkc-sel" id="mkc-sel">${this.selecaoHtml()}</div>
              <small class="mkc-muted">Os títulos a pagar desses centros de custo, nos planos financeiros de marketing, entram como gasto de marketing desta obra.</small>
            </div>
            <div class="mkc-verba" id="mkc-verba">${this.verbaHtml()}</div>
          </div>
          <div class="mkc-acoes">
            ${s.salvoEm ? `<span class="mkc-ok"><i data-lucide="check-circle-2" style="width:14px;height:14px;"></i> Salvo às ${B.esc(s.salvoEm)}</span>` : ""}
            <button type="button" class="btn btn-primary" ${s.salvando ? "disabled" : ""} onclick="MarketingConfigApp.salvar()" style="height:38px;min-width:140px;display:inline-flex;align-items:center;justify-content:center;gap:6px;">
              ${s.salvando ? '<span class="btn-spin"></span> Salvando…' : '<i data-lucide="save" style="width:14px;"></i> Salvar'}
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
        #marketing-config-root .mkc-obra input { width:100%; max-width:560px; height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font:inherit; font-size:0.85rem; box-sizing:border-box; }
        #marketing-config-root .mkc-grid { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:20px; margin-top:16px; }
        #marketing-config-root .mkc-pct { display:flex; align-items:center; gap:6px; }
        #marketing-config-root .mkc-pct input { width:110px; height:38px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:1rem; font-weight:700; text-align:right; }
        #marketing-config-root .mkc-pct em { font-style:normal; font-weight:700; color:#475569; }
        #marketing-config-root .ml-emp-filter { max-width:560px; }
        #marketing-config-root .ml-emp-filter-btn { height:38px; min-height:38px; }
        #marketing-config-root .ml-emp-filter-list { max-height:320px; }
        #marketing-config-root .mkc-sel { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 8px; max-height:120px; overflow:auto; }
        #marketing-config-root .mkc-chip { display:inline-flex; align-items:center; gap:4px; max-width:100%; height:28px; padding:0 4px 0 10px; border-radius:999px; background:#e7f6ee; color:#105436; font-size:0.76rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #marketing-config-root .mkc-chip.is-obra { background:#105436; color:#fff; }
        #marketing-config-root .mkc-chip button { border:0; background:transparent; color:inherit; cursor:pointer; display:inline-flex; padding:2px; border-radius:50%; }
        #marketing-config-root .mkc-chip button:hover { background:rgba(0,0,0,0.1); }
        #marketing-config-root .mkc-verba { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; align-self:start; }
        #marketing-config-root .mkc-verba span { display:block; font-size:0.72rem; font-weight:700; color:#64748b; text-transform:uppercase; }
        #marketing-config-root .mkc-verba strong { display:block; font-size:1.3rem; color:#0f172a; margin-top:4px; }
        #marketing-config-root .mkc-verba .mkc-verba-v { color:#105436; }
        #marketing-config-root .mkc-verba small { display:block; color:#64748b; font-size:0.72rem; margin-top:2px; }
        #marketing-config-root .mkc-acoes { display:flex; justify-content:flex-end; align-items:center; gap:12px; margin-top:14px; padding-top:12px; border-top:1px solid #e2e8f0; }
        #marketing-config-root .mkc-ok { display:inline-flex; align-items:center; gap:4px; color:#105436; font-size:0.8rem; font-weight:600; }
        #marketing-config-root .mkc-tablewrap { max-height:50vh; overflow:auto; }
        #marketing-config-root .mkc-table { width:100%; min-width:760px; border-collapse:collapse; table-layout:fixed; font-size:0.82rem; }
        #marketing-config-root .mkc-table thead th { position:sticky; top:0; background:#1b8253; color:#fff; padding:10px; text-align:left; font-weight:600; z-index:1; }
        #marketing-config-root .mkc-table td { padding:8px 10px; border-bottom:1px solid #e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle; }
        #marketing-config-root .mkc-table tbody tr:nth-child(even) { background:#f8faf9; }
        #marketing-config-root .mkc-table tr.is-sel td { background:#e7f6ee; }
        @media (max-width: 1000px) { #marketing-config-root .mkc-grid { grid-template-columns:1fr; } }
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
              <input id="mkc-obra" list="mkc-obra-list" placeholder="Digite o ID ou o nome do empreendimento" value="${B.esc(cc ? B.ccLabel(cc) : (s.ccId || ""))}" ${s.carregando ? "disabled" : ""}
                onchange="MarketingConfigApp.onObraInput(this.value)">
              <datalist id="mkc-obra-list">${opts}</datalist>
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
