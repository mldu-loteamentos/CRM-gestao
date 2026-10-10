/* Financeiro · Contas a pagar · Gerar Pagamento
   Agrupa títulos a pagar (sem previsões) em lotes.
   Título com centro de custo de parceiro sai pela conta de parceria do CC. */
const GerarPagamentoApp = {
  state: {
    loading: false,
    error: "",
    companies: [],
    costCenters: [],
    customFields: {},
    started: false,
    startDate: "",
    endDate: "",
    consultando: false,
    consultado: false,
    erroTitulos: "",
    progresso: "",
    progressoPct: 0,
    progressoInicio: 0,
    titulos: [],
    previsoesIgnoradas: 0,
    filtro: "todos",
    visao: "lotes",
    abaLotes: "gerar",
    sel: {},
    selInit: {},
    lotes: [],
    loteSienge: {},
    formaSienge: {},
    pagInfo: {},
    selManual: {},
    validacao: { feitos: 0, total: 0, rodando: false },
    gerandoLote: "",
    roboLote: "",
    lotesAbertos: {},
    credores: {},
    gen: 0
  },

  LOTES_COLLECTION: "pagamento_lotes",
  LOTES_LOCAL: "crm_pagamento_lotes",
  ROBO_URL: "http://127.0.0.1:7788",
  ROBO_TOKEN_KEY: "gp_robo_token",

  FILTROS: [
    { id: "todos", label: "Todos" },
    { id: "ok", label: "Pago na conta de parceria" },
    { id: "outra", label: "Pago em outra conta" },
    { id: "aberto", label: "Em aberto" }
  ],

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  money(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  pct(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  },

  dataBr(iso) {
    const p = String(iso || "").slice(0, 10).split("-");
    return p.length === 3 && p[0] ? p[2] + "/" + p[1] + "/" + p[0] : "—";
  },

  iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  numConta(v) {
    return String(v == null ? "" : v).replace(/\D/g, "").replace(/^0+/, "");
  },

  customOf(id) {
    const map = this.state.customFields || {};
    return map[id] || map[String(id)] || {};
  },

  contaParceriaDe(cc) {
    const c = cc ? this.customOf(cc.id).conta_parceria : null;
    return c && (c.id || c.numero) ? c : null;
  },

  /** CC Corporativo não segue a regra de parceria, mesmo com "parceiro/parceria" no nome. */
  ehCorporativo(id) {
    return String(this.customOf(id).tipo_cc || "") === "Corporativo";
  },

  isParceiro(cc) {
    if (cc && !this.ehCorporativo(cc.id) && /parce(ir|ri)/i.test(String(cc.name || ""))) return true;
    return !!this.contaParceriaDe(cc);
  },

  companyIdOf(cc) {
    return cc && (cc.idCompany != null ? cc.idCompany : cc.companyId);
  },

  contaLabel(c) {
    if (window.CentrosCustoApp && typeof CentrosCustoApp.contaLabel === "function") {
      return CentrosCustoApp.contaLabel(c);
    }
    if (!c) return "";
    return [c.banco ? "Banco " + c.banco : "", c.agencia ? "Ag. " + c.agencia : "", c.numero ? "C/C " + c.numero : "", c.nome || ""]
      .filter(Boolean).join(" · ");
  },

  /* Título com CC de parceiro paga na conta de parceria cadastrada no centro de custo. */
  resolverContaPagamento(input) {
    const ccId = input && (input.costCenterId != null ? input.costCenterId : input.ccId);
    const cc = this.state.costCenters.find((c) => String(c.id) === String(ccId))
      || (input && input.costCenter) || null;
    if (!cc) {
      return { origem: "padrao", parceiro: false, conta: null, ok: true, motivo: "" };
    }
    const parceiro = this.isParceiro(cc);
    if (!parceiro) {
      return { origem: "padrao", parceiro: false, cc: cc, conta: null, ok: true, motivo: "" };
    }
    const conta = this.contaParceriaDe(cc);
    if (!conta) {
      return {
        origem: "parceria",
        parceiro: true,
        cc: cc,
        conta: null,
        ok: false,
        motivo: "Centro de custo de parceiro sem conta de parceria cadastrada."
      };
    }
    return { origem: "parceria", parceiro: true, cc: cc, conta: conta, ok: true, motivo: "" };
  },

  parceiros() {
    return this.state.costCenters
      .filter((cc) => this.isParceiro(cc))
      .slice()
      .sort((a, b) => {
        const ea = Number(this.companyIdOf(a) || 0) - Number(this.companyIdOf(b) || 0);
        if (ea) return ea;
        return Number(a.id) - Number(b.id);
      });
  },

  init() {
    if (!this.state.startDate || !this.state.endDate) {
      const d = new Date();
      this.state.startDate = this.iso(new Date(d.getFullYear(), d.getMonth(), 1));
      this.state.endDate = this.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    }
    if (this.state.started && this.state.costCenters.length) {
      this.recarregarCustom();
      this.render();
      this.sincronizarContas().then(() => {
        this.recarregarCustom();
        if (this.state.titulos && this.state.titulos.length) this.reclassificar();
        this.render();
      });
      return;
    }
    this.load();
  },

  recarregarCustom() {
    let custom = {};
    try {
      const raw = localStorage.getItem("crm_centros_custo_custom") || "{}";
      custom = (typeof window.parseCentrosCustoCustomMap === "function")
        ? window.parseCentrosCustoCustomMap(raw)
        : (JSON.parse(raw) || {});
    } catch (e) {
      custom = {};
    }
    if (window.CentrosCustoState && CentrosCustoState.customFields && Object.keys(CentrosCustoState.customFields).length) {
      custom = Object.assign({}, custom, CentrosCustoState.customFields);
    }
    const remoto = window._contasParceriaRemotas || {};
    Object.keys(remoto).forEach((id) => {
      const r = remoto[id] || {};
      const rec = custom[id] = Object.assign({ cc_id: id }, custom[id] || {});
      if (Number(r.updatedAt || 0) >= Number(rec.conta_parceria_at || 0)) {
        rec.conta_parceria = r.conta || null;
        rec.conta_parceria_at = Number(r.updatedAt) || 0;
      }
    });
    this.state.customFields = custom;
  },

  async sincronizarContas() {
    if (typeof window.carregarContasParceriaFirebase !== "function") return;
    try {
      await window.carregarContasParceriaFirebase();
    } catch (e) {
      console.warn("[Gerar Pagamento] contas de parceria", e);
    }
  },

  ccDe(id) {
    return this.state.costCenters.find((c) => String(c.id) === String(id)) || null;
  },

  /* Conta e situação são recalculadas na hora, para refletir a conta cadastrada depois da busca. */
  reclassificar() {
    this.state.titulos.forEach((r) => {
      const esperada = this.contaParceriaDe(this.ccDe(r.ccId));
      const alvo = esperada ? this.numConta(esperada.numero || esperada.id) : "";
      r.esperada = esperada;
      if (!r.contas.length) r.status = r.pago ? "pago-sem-conta" : "aberto";
      else if (!alvo) r.status = "sem-conta";
      else r.status = r.contas.every((c) => this.numConta(c) === alvo) ? "ok" : "outra";
    });
  },

  async load() {
    this.state.loading = true;
    this.state.error = "";
    this.render();
    try {
      const [ccs, companies] = await Promise.all([
        SiengeApiService.getCostCenters ? SiengeApiService.getCostCenters() : Promise.resolve([]),
        SiengeApiService.getCompanies ? SiengeApiService.getCompanies() : Promise.resolve([])
      ]);
      this.state.costCenters = Array.isArray(ccs) ? ccs : ((ccs && ccs.results) || []);
      this.state.companies = Array.isArray(companies) ? companies : ((companies && companies.results) || []);
      await this.sincronizarContas();
      this.recarregarCustom();
      this.state.started = true;
    } catch (e) {
      console.error("[Gerar Pagamento]", e);
      this.state.error = (e && e.message) ? e.message : "Não consegui carregar os centros de custo.";
    }
    this.state.loading = false;
    this.render();
  },

  abrirCentrosCusto() {
    if (window.CentrosCustoState) CentrosCustoState.somenteParceiros = true;
    if (typeof switchTab === "function") switchTab("centros-custo", "Gestão de Centros de Custo");
  },

  onField(key, value) {
    this.state[key] = value;
  },

  setFiltro(id) {
    this.state.filtro = this.state.filtro === id && id !== "todos" ? "todos" : id;
    this.paintTitulos();
  },

  pintarProgresso() {
    const s = this.state;
    const el = document.getElementById("gp-progresso");
    if (el) el.textContent = s.progresso || "";
    const bar = document.getElementById("gp-progresso-barra");
    if (bar) bar.style.width = Math.max(2, Math.min(99, Math.round((s.progressoPct || 0) * 100))) + "%";
    const tempo = document.getElementById("gp-progresso-tempo");
    if (tempo && s.progressoInicio) tempo.textContent = "Tempo decorrido: " + Math.floor((Date.now() - s.progressoInicio) / 1000) + "s";
  },

  /* Mesmo carregamento da Fila de cobrança: círculo girando e barra verde. */
  carregandoHtml() {
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:400px;margin:0 auto;padding:40px 0;color:var(--color-text-muted);">
        <div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <span id="gp-progresso" class="loading-status-text" style="font-weight:500;">${this.esc(this.state.progresso)}</span>
        <div style="width:100%;background:#e2e8f0;border-radius:8px;height:10px;overflow:hidden;margin-top:5px;">
          <div id="gp-progresso-barra" class="loading-progress-bar" style="width:${Math.max(2, Math.round((this.state.progressoPct || 0) * 100))}%;height:100%;background:#10b981;transition:width 0.4s linear;"></div>
        </div>
        <span id="gp-progresso-tempo" class="loading-time-text" style="font-size:0.85rem;color:#64748b;margin-top:4px;"></span>
      </div>`;
  },

  /* Lê no Sienge os títulos a pagar dos CCs de parceiro no período e confere a conta usada no pagamento. */
  async consultarTitulos() {
    const s = this.state;
    if (!s.startDate || !s.endDate) {
      alert("Informe o período.");
      return;
    }
    if (s.startDate > s.endDate) {
      alert("A data inicial não pode ser maior que a final.");
      return;
    }
    const base = window.ComprasControleApp || window.ComprasPrevisoesApp;
    if (!base || typeof base.outcomeRange !== "function") {
      alert("O módulo de contas a pagar não está disponível.");
      return;
    }
    await this.sincronizarContas();
    this.recarregarCustom();
    const parceiros = this.parceiros();
    if (!parceiros.length) {
      alert("Nenhum centro de custo de parceiro encontrado. Cadastre a conta de parceria em Centros de Custo.");
      return;
    }
    const gen = (s.gen += 1);
    s.consultando = true;
    s.consultado = true;
    s.erroTitulos = "";
    s.progresso = "Buscando títulos a pagar no Sienge…";
    s.progressoPct = 0;
    s.progressoInicio = Date.now();
    const relogio = setInterval(() => {
      if (gen !== s.gen || !s.consultando) clearInterval(relogio);
      else this.pintarProgresso();
    }, 1000);
    s.titulos = [];
    s.previsoesIgnoradas = 0;
    s.sel = {};
    s.selInit = {};
    s.selManual = {};
    s.loteSienge = {};
    s.formaSienge = {};
    s.pagInfo = {};
    s.credores = {};
    s.validacao = { feitos: 0, total: 0, rodando: false };
    this.render();

    const api = Object.create(base);
    api.outcomeEndpoint = (start, end, companyId) => "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=true&withBankMovements=true"
      + (companyId ? "&companyId=" + encodeURIComponent(companyId) : "");
    api.noteProgress = (text) => {
      if (gen !== s.gen) return;
      s.progresso = text;
      this.pintarProgresso();
    };

    try {
      const empresas = [...new Set(parceiros.map((cc) => String(this.companyIdOf(cc) || "")).filter(Boolean))];
      const alvos = empresas.length ? empresas : [""];
      const faixas = typeof siengeSplitDateRange === "function"
        ? siengeSplitDateRange(s.startDate, s.endDate)
        : [{ start: s.startDate, end: s.endDate }];
      const bills = [];
      let passo = 0;
      const total = faixas.length * alvos.length;
      for (const faixa of faixas) {
        for (const emp of alvos) {
          if (gen !== s.gen) return;
          passo += 1;
          s.progresso = "Buscando títulos a pagar no Sienge · " + passo + " de " + total;
          s.progressoPct = ((passo - 1) / total) * 0.85;
          this.pintarProgresso();
          const parte = await api.outcomeRange(faixa.start, faixa.end, emp);
          if (Array.isArray(parte)) bills.push.apply(bills, parte);
        }
      }
      if (gen !== s.gen) return;
      this.montarTitulos(base, bills, parceiros);
      s.progresso = "Conferindo lotes já gerados…";
      s.progressoPct = 0.9;
      this.pintarProgresso();
      await this.carregarLotes();
      await this.carregarLotesSienge(gen);
      if (window.DocumentosSiengeApp) {
        try { await DocumentosSiengeApp.garantirLista(false); } catch (e) { console.warn("[Gerar Pagamento] documentos do Sienge", e); }
      }
    } catch (e) {
      if (gen !== s.gen) return;
      console.error("[Gerar Pagamento] títulos", e);
      s.erroTitulos = (e && e.message) ? e.message : "Falha ao buscar os títulos a pagar no Sienge.";
    }
    s.consultando = false;
    s.progresso = "";
    this.render();
    if (!s.erroTitulos) this.validarPagamentos(gen);
  },

  montarTitulos(app, bills, parceiros) {
    const ccMap = {};
    parceiros.forEach((cc) => { ccMap[String(cc.id)] = cc; });
    const vistos = {};
    const linhas = [];
    let previsoes = 0;
    const lista = (x) => (Array.isArray(x) ? x : (x ? [x] : []));
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const docId = app.docCode(bill.documentIdentificationId);
      const docNome = bill.documentIdentificationName || "";
      const cats = lista(bill.paymentsCategories).filter((c) => c && c.costCenterId != null && ccMap[String(c.costCenterId)]);
      if (!cats.length) return;
      const titulo = String(bill.billId);
      const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
      if (app.ehPrevisao(docId, docNome, bill)) {
        if (!vistos["prev|" + titulo + "|" + parcela]) previsoes += 1;
        vistos["prev|" + titulo + "|" + parcela] = true;
        return;
      }
      const movs = [];
      let pago = false;
      lista(bill.payments).forEach((pay) => {
        const bms = lista(pay && pay.bankMovements);
        if (!bms.length) {
          if (app.isPago(bill, pay, null, docId, docNome)) pago = true;
          return;
        }
        bms.forEach((bm) => {
          if (!bm || app.SKIP_OPS[bm.operationName || ""]) return;
          if (app.isSubstituicao(bill, pay, bm, docId, docNome)) return;
          if (app.isPago(bill, pay, bm, docId, docNome)) pago = true;
          const conta = String(bm.accountNumber || "").trim();
          if (conta) movs.push({ conta, data: app.paymentDateOf(bill, pay, bm) });
        });
      });
      const saldo = app.billBalance(bill);
      const original = Number(bill.originalAmount) || 0;
      const ccsTitulo = [];
      lista(bill.paymentsCategories).forEach((c) => {
        if (!c || c.costCenterId == null) return;
        const id = String(c.costCenterId);
        const rate = c.financialCategoryRate != null && Number.isFinite(Number(c.financialCategoryRate)) ? Number(c.financialCategoryRate) : 100;
        const plano = { id: c.financialCategoryId != null ? String(c.financialCategoryId).trim() : "", nome: String(c.financialCategoryName || "").trim() };
        const ja = ccsTitulo.find((x) => x.id === id);
        if (ja) {
          ja.rateio += rate;
          if ((plano.id || plano.nome) && !ja.planos.some((p) => p.id === plano.id && p.nome === plano.nome)) ja.planos.push(plano);
          return;
        }
        const cad = ccMap[id] || this.ccDe(id);
        ccsTitulo.push({ id, nome: (cad && cad.name) || c.costCenterName || "", parceria: !!ccMap[id], rateio: rate, planos: plano.id || plano.nome ? [plano] : [] });
      });
      ccsTitulo.sort((a, b) => Number(a.id) - Number(b.id));
      const tituloAPagar = saldo != null ? Math.max(0, saldo) : (pago ? 0 : original);
      const autorizacao = this.autorizacaoDe(bill);
      cats.forEach((cat) => {
        const cc = ccMap[String(cat.costCenterId)];
        const chave = titulo + "|" + parcela + "|" + cc.id;
        if (vistos[chave]) return;
        vistos[chave] = true;
        const contas = [...new Set(movs.map((m) => m.conta))];
        const rateio = cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) : 100;
        const fat = (Number.isFinite(rateio) ? rateio : 100) / 100;
        const datas = movs.map((m) => m.data).filter(Boolean).sort();
        linhas.push({
          pago,
          aPagar: tituloAPagar * fat,
          tituloAPagar,
          tituloValor: original,
          ccsTitulo,
          titulo,
          parcela,
          credor: String(bill.creditorName || "").trim(),
          credorId: bill.creditorId != null ? String(bill.creditorId) : "",
          companyId: bill.companyId != null ? String(bill.companyId) : String(this.companyIdOf(cc) || ""),
          documento: [docId, bill.documentNumber].filter(Boolean).join(" "),
          docId: String(docId || "").trim(),
          docNome: String(docNome || bill.documentIdentificationName || "").trim(),
          emissao: String(bill.issueDate || "").slice(0, 10),
          vencimento: String(bill.dueDate || "").slice(0, 10),
          pagamento: datas.length ? datas[datas.length - 1] : "",
          valor: original * fat,
          saldo: saldo,
          ccId: String(cc.id),
          ccNome: cc.name || "",
          esperada: null,
          contas,
          autorizacao,
          status: ""
        });
      });
    });
    linhas.sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || "") || Number(a.titulo) - Number(b.titulo) || Number(a.parcela) - Number(b.parcela));
    this.state.titulos = linhas;
    this.state.previsoesIgnoradas = previsoes;
    if (window.DocumentosSiengeApp) DocumentosSiengeApp.registrarVistos(linhas.map((l) => ({ id: l.docId, nome: l.docNome })));
    this.reclassificar();
  },

  /* ---------- lotes a pagar por conta ---------- */
  chaveTitulo(titulo, parcela) {
    return String(titulo) + "|" + String(parcela || "");
  },

  lotesLocal() {
    try {
      const v = JSON.parse(localStorage.getItem(this.LOTES_LOCAL) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  },

  salvarLotesLocal(list) {
    try { localStorage.setItem(this.LOTES_LOCAL, JSON.stringify(list.slice(-300))); } catch (e) {}
  },

  async carregarLotes() {
    let list = null;
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.getDocs) {
      try {
        const snap = await fc.getDocs(fc.collection(window.firebaseDb, this.LOTES_COLLECTION));
        list = [];
        snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
        this.salvarLotesLocal(list);
      } catch (e) {
        console.warn("[Gerar Pagamento] lotes", e);
        list = null;
      }
    }
    this.state.lotes = (list || this.lotesLocal()).filter((l) => l && !l.cancelado);
    this.state.lotes.forEach((l) => this.auditarLote(l));
  },

  /* Parcelas que já estão em lote/pagamento escritural no Sienge. */
  async carregarLotesSienge(gen) {
    const s = this.state;
    if (typeof window.siengeFetchWithRetry !== "function") return;
    s.loteSiengeLidoEm = Date.now();
    const deLotes = s.lotes.filter((l) => this.loteNoSienge(l)).flatMap((l) => (l.itens || []).map((i) => String(i.titulo)));
    const abertos = [...new Set(s.titulos.filter((r) => !r.pago).map((r) => r.titulo).concat(deLotes))];
    const fila = abertos.slice();
    const worker = async () => {
      while (fila.length && gen === s.gen) {
        const billId = fila.shift();
        try {
          const res = await window.siengeFetchWithRetry(`/bills/${encodeURIComponent(billId)}/installments`, 1);
          const parcelas = (res && (res.results || res.data)) || (Array.isArray(res) ? res : []);
          parcelas.forEach((p) => {
            const num = p.installmentId != null ? p.installmentId : p.installmentNumber;
            if (num == null) return;
            s.formaSienge[this.chaveTitulo(billId, num)] = { tipo: String(p.paymentType || ""), tipoId: p.paymentTypeId != null ? String(p.paymentTypeId) : "" };
            if (p.batchNumber != null || p.sentToBank === true) {
              s.loteSienge[this.chaveTitulo(billId, num)] = p.batchNumber != null ? String(p.batchNumber) : "sim";
            }
          });
        } catch (e) {
          // sem a informação, o título continua disponível para lote
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (gen === s.gen) await this.conferirLotesExcluidosNoSienge();
  },

  /**
   * Lote que o Integra registrou no Sienge, mas cujas parcelas não estão mais naquele número de lote:
   * foi excluído direto no Sienge. Sai da lista e os títulos voltam a ficar livres.
   */
  async conferirLotesExcluidosNoSienge() {
    const s = this.state;
    const lidoEm = s.loteSiengeLidoEm || 0;
    const sumidos = s.lotes.filter((l) => {
      const sg = l.sienge || {};
      if (!this.loteNoSienge(l) || !sg.numero) return false;
      const desde = new Date(sg.geradoEm || l.criadoEm || 0).getTime();
      if (!(desde < lidoEm)) return false;
      const chaves = (l.itens || []).map((i) => this.chaveTitulo(i.titulo, i.parcela));
      if (!chaves.length || !chaves.every((k) => s.formaSienge[k])) return false;
      return chaves.every((k) => !s.loteSienge[k] || (s.loteSienge[k] !== "sim" && s.loteSienge[k] !== String(sg.numero)));
    });
    for (const l of sumidos) {
      const sg = l.sienge;
      const msg = `O lote nº ${sg.numero} não existe mais no Sienge (excluído direto no Sienge).`;
      sg.historico = (sg.historico || []).concat([{ acao: "excluir", por: this.usuarioAtual(), porEmail: this.emailAtual(), em: new Date().toISOString(), ok: true, msg }]).slice(-30);
      sg.status = "excluido";
      l.cancelado = true;
      l.canceladoEm = new Date().toISOString();
      l.canceladoMotivo = msg;
      await this.salvarLote(l);
      this.auditarLote(l);
    }
    if (sumidos.length) {
      const ids = new Set(sumidos.map((l) => l.id));
      s.lotes = s.lotes.filter((l) => !ids.has(l.id));
    }
  },

  /* ---------- forma de pagamento: boleto conferido (código, valor, vencimento, desconto) ---------- */
  tiposPagamento(tipo) {
    const t = String(tipo || "");
    if (/pix/i.test(t)) return ["pix"];
    if (/transf|ted\b|doc\b|cr[eé]dito em conta|dep[oó]sito/i.test(t)) return ["bank-transfer"];
    if (/concession|consumo|arrecad|tribut|guia|darf|gps|fgts|imposto/i.test(t)) return ["boleto-concessionaria", "boleto-tax", "boleto-bancario"];
    if (/boleto|bloqueto|cobran/i.test(t)) return ["boleto-bancario", "boleto-concessionaria"];
    return ["boleto-bancario", "bank-transfer", "pix", "boleto-concessionaria"];
  },

  async lerFormaPagamento(titulo, parcela, tipo) {
    const kinds = this.tiposPagamento(tipo);
    for (let i = 0; i < kinds.length; i++) {
      try {
        const data = await window.siengeFetchWithRetry(
          `/bills/${encodeURIComponent(titulo)}/installments/${encodeURIComponent(parcela || 1)}/payment-information/${kinds[i]}`, 1);
        if (data && typeof data === "object" && Object.keys(data).length) return { kind: kinds[i], data };
      } catch (e) {}
    }
    return null;
  },

  /** Cadastro do credor para conferir o titular da chave PIX: CPF/CNPJ, telefones, e-mails e chaves PIX cadastradas. */
  carregarCredor(id) {
    if (!id) return Promise.resolve({ erro: "título sem código do credor" });
    const cache = this.state.credores;
    if (!cache[id]) {
      const BC = window.BoletoCheck;
      const lista = (res) => (Array.isArray(res) ? res : ((res && (res.results || res.data)) || []));
      cache[id] = (async () => {
        const [cad, pix] = await Promise.all([
          window.siengeFetchWithRetry(`/creditors/${encodeURIComponent(id)}`, 1),
          window.siengeFetchWithRetry(`/creditors/${encodeURIComponent(id)}/pix-informations`, 1).catch(() => null)
        ]);
        if (!cad || typeof cad !== "object") return { erro: "credor não encontrado" };
        const telefones = []
          .concat(lista(cad.phones).map((p) => `${p.ddd || ""}${p.number || ""}`))
          .concat(lista(cad.contacts).map((c) => `${c.ddd || ""}${c.number || ""}`))
          .map((t) => BC.telNorm(t)).filter((t) => t.length >= 10);
        const emails = []
          .concat(lista(cad.otherContactMethods).filter((m) => ["1", "2"].includes(String(m.type))).map((m) => m.address))
          .concat(lista(cad.contacts).map((c) => c.email))
          .map((e) => String(e || "").trim().toLowerCase()).filter((e) => e.includes("@"));
        const chaves = lista(pix).map((p) => {
          const tipo = String(p.type || p.keyPixType || "").trim().toUpperCase();
          const b = p.beneficiary && typeof p.beneficiary === "object" ? p.beneficiary : {};
          const docBenef = BC.digits(p.cpf || p.cnpj || p.beneficiaryCpf || p.beneficiaryCnpj || b.cpf || b.cnpj || b.document || b.cpfCnpj || "");
          return {
            tipo,
            original: String(p.key || p.keyPix || "").trim(),
            chave: BC.chaveNorm(tipo, p.key || p.keyPix),
            doc: docBenef.length === 11 || docBenef.length === 14 ? docBenef : "",
            padrao: String(p.defaultFlag || "").toUpperCase() === "S"
          };
        }).filter((c) => c.tipo && c.chave);
        return { id, nome: cad.name || "", doc: BC.digits(cad.cnpj || cad.cpf), telefones, emails, chaves };
      })().catch((e) => ({ erro: (e && e.message) || "falha na consulta" }));
    }
    return cache[id];
  },

  /**
   * Autorização da parcela no Sienge (bulk com withAuthorizations=true). Vale o authorizationStatus da parcela
   * (S = autorizada, N = não autorizada); sem ele, a parcela está autorizada quando o último da alçada (isLastToAuthorize) autorizou.
   */
  autorizacaoDe(bill) {
    const lista = (Array.isArray(bill && bill.authorizations) ? bill.authorizations : []).filter(Boolean);
    const sim = (v) => v === true || /^(s|sim|y|yes|true|1)$/i.test(String(v == null ? "" : v).trim());
    const nome = (a) => String(a.authorizationUserName || a.authorizationUserId || "").trim();
    const recentes = lista.slice().sort((a, b) => String(b.authorizationDate || "").localeCompare(String(a.authorizationDate || "")));
    const status = String((bill && bill.authorizationStatus) == null ? "" : bill.authorizationStatus).trim().toUpperCase();
    if (status === "S") {
      const quem = recentes.find((a) => sim(a.isLastToAuthorize)) || recentes[0];
      return { ok: true, por: quem ? nome(quem) : "", em: quem ? String(quem.authorizationDate || "").slice(0, 10) : "" };
    }
    if (status === "N" && !lista.length) return { ok: false, motivo: "Título não autorizado no Sienge." };
    const ultima = status === "N" ? null : recentes.find((a) => sim(a.isLastToAuthorize));
    if (ultima) return { ok: true, por: nome(ultima), em: String(ultima.authorizationDate || "").slice(0, 10) };
    if (lista.length) {
      return { ok: false, parcial: true, motivo: `Autorização incompleta no Sienge: autorizado por ${[...new Set(lista.map(nome).filter(Boolean))].join(", ") || "parte da alçada"}, falta o último a autorizar.` };
    }
    return { ok: false, motivo: "Título não autorizado no Sienge." };
  },

  /**
   * Selo da coluna Autorização. Quando o documento exige ciência (Configurações → Apoio → Tipos de Documento),
   * mostra a ciência antes. A API do Sienge não informa a ciência; ela é dada antes da autorização,
   * então título com autorização (completa ou parcial) já teve ciência.
   */
  autorizacaoSeloHtml(it) {
    if (it.emLote) return `<span class="gp-muted">—</span>`;
    const aut = it.autorizacao || {};
    const doc = it.docId || "";
    const exige = !!doc && typeof window.documentoExigeCiencia === "function" && window.documentoExigeCiencia(doc);
    let ciencia = "";
    if (exige) {
      ciencia = aut.ok || aut.parcial
        ? `<span class="bchk bchk-ok" title="${this.esc(`O documento ${doc} exige ciência antes da autorização. O título já tem autorização no Sienge, então a ciência foi dada.`)}">Ciência ✓</span>`
        : `<span class="bchk bchk-info" title="${this.esc(`O documento ${doc} exige ciência antes da autorização. A API do Sienge não informa se a ciência já foi dada: confira no Sienge.`)}">Ciência ?</span>`;
    }
    const dica = aut.ok
      ? `Autorizado no Sienge por ${aut.por || "—"}${aut.em ? " em " + this.dataBr(aut.em) : ""}`
      : (aut.motivo || "Autorização não verificada no Sienge.");
    const cls = aut.ok ? "bchk-ok" : (aut.parcial ? "bchk-aviso" : "bchk-erro");
    const txt = aut.ok ? "Autorizado ✓" : (aut.parcial ? "Autorização incompleta" : "Não autorizado");
    return `<span class="gp-aut">${ciencia}${ciencia ? `<i data-lucide="chevron-right" class="gp-aut-seta"></i>` : ""}<span class="bchk ${cls}" title="${this.esc(dica)}">${txt}</span></span>`;
  },

  semAutorizacao(it) {
    return !it.emLote && !(it.autorizacao && it.autorizacao.ok);
  },

  /** Bloqueio que aponta problema no título (não só a espera da conferência da forma de pagamento). */
  bloqueioVisivel(it) {
    return !!it.bloqueio && !!(it.pag || this.bloqueioRateio(it.rateio) || this.semAutorizacao(it));
  },

  /** Motivo que impede o título de entrar em lote (sem autorização, rateio ou plano financeiro fora do padrão, forma de pagamento não conferida ou divergente). */
  bloqueioLote(it) {
    if (it.emLote) return "";
    if (this.semAutorizacao(it)) return (it.autorizacao && it.autorizacao.motivo) || "Autorização do título não verificada no Sienge.";
    const rateio = this.bloqueioRateio(it.rateio);
    if (rateio) return rateio;
    const p = it.pag;
    if (!p) return "Forma de pagamento ainda não conferida.";
    const c = p.check;
    if (c.nivel === "erro" || c.nivel === "aviso" || c.nivel === "sem") return c.resumo || "Possível divergência na forma de pagamento.";
    return "";
  },

  resumoTitulo(chave) {
    const rows = this.state.titulos.filter((r) => this.chaveTitulo(r.titulo, r.parcela) === chave);
    if (!rows.length) return null;
    const r0 = rows[0];
    return {
      rows,
      ctx: this.contextoRateio(r0),
      aPagar: r0.tituloAPagar != null ? r0.tituloAPagar : rows.reduce((t, r) => t + (Number(r.aPagar) || 0), 0),
      valor: r0.tituloValor != null ? r0.tituloValor : rows.reduce((t, r) => t + (Number(r.valor) || 0), 0),
      ccs: (r0.ccsTitulo && r0.ccsTitulo.length ? r0.ccsTitulo : rows.map((r) => ({ id: r.ccId, nome: r.ccNome, parceria: true })))
        .slice().sort((a, b) => Number(a.id) - Number(b.id))
    };
  },

  async validarPagamentos(gen) {
    const s = this.state;
    if (typeof window.siengeFetchWithRetry !== "function" || !window.BoletoCheck) return;
    const chaves = [...new Set(s.titulos.filter((r) => !r.pago && r.aPagar > 0.009 && r.autorizacao && r.autorizacao.ok).map((r) => this.chaveTitulo(r.titulo, r.parcela)))]
      .filter((k) => !s.loteSienge[k] && !this.loteIntegraDe(k));
    s.validacao = { feitos: 0, total: chaves.length, rodando: chaves.length > 0 };
    let ultima = Date.now();
    const fila = chaves.slice();
    const worker = async () => {
      while (fila.length && gen === s.gen) {
        const chave = fila.shift();
        const t = this.resumoTitulo(chave);
        if (!t) continue;
        const r = t.rows[0];
        const forma = s.formaSienge[chave] || {};
        const payment = await this.lerFormaPagamento(r.titulo, r.parcela, forma.tipo);
        if (gen !== s.gen) return;
        const credor = payment && payment.kind === "pix" ? await this.carregarCredor(r.credorId) : undefined;
        if (gen !== s.gen) return;
        const check = BoletoCheck.validar(payment, { valor: t.aPagar, vencimento: r.vencimento, credor });
        s.pagInfo[chave] = { payment, check, tipoSienge: forma.tipo || "" };
        if (["erro", "aviso", "sem"].includes(check.nivel)) {
          Object.keys(s.sel).forEach((k) => {
            if (k.endsWith("|" + chave)) s.sel[k] = false;
          });
        }
        s.validacao.feitos += 1;
        if (Date.now() - ultima > 1500) {
          ultima = Date.now();
          this.paintTitulos();
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (gen !== s.gen) return;
    s.validacao.rodando = false;
    this.paintTitulos();
  },

  /** Abre o mesmo resumo do título usado no Contas a Pagar (dados, anexos, forma de pagamento conferida). */
  abrirResumo(chave) {
    const app = window.ComprasControleApp;
    const t = this.resumoTitulo(chave);
    if (!t || !app || typeof app.abrirTituloRow !== "function") return;
    const r = t.rows[0];
    const doc = String(r.documento || "").trim();
    const esp = doc.indexOf(" ");
    const cc = this.ccDe(r.ccId);
    const situacao = r.pago
      ? (r.status === "ok" ? "Pago na conta de parceria" : (r.status === "outra" ? "Pago em outra conta" : "Pago"))
      : (s => s.loteIntegra ? "No lote " + s.loteIntegra.id : (s.loteSienge ? "Já em lote no Sienge" + (s.loteSienge !== "sim" ? " nº " + s.loteSienge : "") : "Em aberto"))({
        loteIntegra: this.loteIntegraDe(chave), loteSienge: this.state.loteSienge[chave] || ""
      });
    app.abrirTituloRow({
      titulo: r.titulo,
      parcela: r.parcela,
      credor: r.credor,
      docId: esp > 0 ? doc.slice(0, esp) : "",
      documento: esp > 0 ? doc.slice(esp + 1) : doc,
      vencimento: r.vencimento,
      saldo: t.aPagar,
      valor: t.valor,
      valorAjustado: t.valor,
      ccId: t.ccs.map((x) => x.id).join(" / "),
      ccNome: t.ccs.length > 1 ? "rateado" : (t.ccs[0] && t.ccs[0].nome) || r.ccNome,
      rateioHtml: this.rateioHtml(this.conferirRateio(t.ccs, t.valor, t.ctx)),
      companyId: cc ? this.companyIdOf(cc) : "",
      natureza: r.pago ? "pago" : "",
      dataPagamento: r.pagamento || "",
      conta: r.contas && r.contas.length ? "C/C " + r.contas.join(", ") : "",
      situacaoTexto: situacao + (r.pago || !r.autorizacao ? ""
        : ((r.docId && typeof window.documentoExigeCiencia === "function" && window.documentoExigeCiencia(r.docId)
          ? (r.autorizacao.ok || r.autorizacao.parcial ? " · ciência dada" : " · exige ciência antes da autorização")
          : "") + (r.autorizacao.ok
          ? ` · autorizado por ${r.autorizacao.por || "—"}${r.autorizacao.em ? " em " + this.dataBr(r.autorizacao.em) : ""}`
          : ` · ${r.autorizacao.parcial ? "autorização incompleta" : "não autorizado"} no Sienge`))),
      pagCheck: this.state.pagInfo[chave] ? this.state.pagInfo[chave].check : null
    });
  },

  loteNoSienge(l) {
    const st = l && l.sienge && l.sienge.status;
    return st === "gerado" || st === "aprovado";
  },

  temTitulo(l, chave) {
    return (l.itens || []).some((i) => this.chaveTitulo(i.titulo, i.parcela) === chave);
  },

  /* Só o lote confirmado no Sienge prende o título; o que ficou só no Integra não impede gerar de novo. */
  loteIntegraDe(chave) {
    return this.state.lotes.find((l) => this.loteNoSienge(l) && this.temTitulo(l, chave)) || null;
  },

  lotePendenteDe(chave) {
    return this.state.lotes.find((l) => !this.loteNoSienge(l) && this.temTitulo(l, chave)) || null;
  },

  /** Tira os títulos de lotes que não chegaram ao Sienge; lote que fica vazio é apagado. */
  async limparPendentes(chaves) {
    const s = this.state;
    const alvo = new Set(chaves);
    const fc = window.firebaseCollections;
    for (const l of s.lotes.filter((x) => !this.loteNoSienge(x) && (x.itens || []).some((i) => alvo.has(this.chaveTitulo(i.titulo, i.parcela))))) {
      const resto = (l.itens || []).filter((i) => !alvo.has(this.chaveTitulo(i.titulo, i.parcela)));
      if (resto.length) {
        l.itens = resto;
        l.total = Math.round(resto.reduce((t, i) => t + (Number(i.valor) || 0), 0) * 100) / 100;
        await this.salvarLote(l);
        continue;
      }
      s.lotes = s.lotes.filter((x) => x.id !== l.id);
      this.salvarLotesLocal(this.lotesLocal().filter((x) => x.id !== l.id));
      if (window.firebaseDb && fc && fc.deleteDoc) {
        try { await fc.deleteDoc(fc.doc(window.firebaseDb, this.LOTES_COLLECTION, l.id)); } catch (e) { console.warn("[Gerar Pagamento] apagar lote pendente", l.id, e); }
      }
    }
  },

  /* Títulos em aberto agrupados por conta de parceria e dia de vencimento (um lote por conta por dia).
     Título com CC de parceria entra inteiro: valor total e todos os CCs do rateio, inclusive os que não são de parceria.
     Se os CCs de parceria do título forem de contas diferentes, cada conta fica só com a sua parte. */
  gruposLote() {
    const grupos = {};
    const abertosTodos = this.state.titulos.filter((r) => !r.pago && r.aPagar > 0.009);
    // CC da obra com conta própria (ex.: 14000 na conta MLDU) só define a conta quando o título não tem CC de parceria.
    const comParceria = new Set(abertosTodos.filter((r) => this.ccDeParceriaPeloNome(r.ccId, r.ccNome)).map((r) => this.chaveTitulo(r.titulo, r.parcela)));
    const abertos = abertosTodos.filter((r) => !comParceria.has(this.chaveTitulo(r.titulo, r.parcela)) || this.ccDeParceriaPeloNome(r.ccId, r.ccNome));
    const contaKeyDe = (r) => (r.esperada ? this.numConta(r.esperada.numero || r.esperada.id) || String(r.esperada.id) : "");
    const contasDoTitulo = {};
    abertos.forEach((r) => {
      const chave = this.chaveTitulo(r.titulo, r.parcela);
      (contasDoTitulo[chave] = contasDoTitulo[chave] || new Set()).add(contaKeyDe(r));
    });
    abertos.forEach((r) => {
      const conta = r.esperada;
      const contaKey = contaKeyDe(r);
      const dia = String(r.vencimento || "").slice(0, 10);
      const key = conta ? contaKey + "@" + (dia || "sem-data") : "__sem";
      if (!grupos[key]) {
        const ccConta = this.ccDe(r.ccId);
        grupos[key] = { key, contaKey, dia: conta ? dia : "", conta, empresaConta: String((ccConta && this.companyIdOf(ccConta)) || ""), itens: {}, ordem: [] };
      }
      const g = grupos[key];
      const chave = this.chaveTitulo(r.titulo, r.parcela);
      const inteiro = contasDoTitulo[chave].size === 1 && r.tituloAPagar != null;
      if (!g.itens[chave]) {
        g.itens[chave] = {
          chave, titulo: r.titulo, parcela: r.parcela, credor: r.credor, credorId: r.credorId, companyId: r.companyId, documento: r.documento,
          vencimento: r.vencimento, valor: 0, aPagar: 0, ccs: [], inteiro, autorizacao: r.autorizacao || null
        };
        g.ordem.push(chave);
        if (inteiro) {
          Object.assign(g.itens[chave], {
            valor: r.tituloValor,
            aPagar: r.tituloAPagar,
            ccs: (r.ccsTitulo || []).map((c) => ({ id: c.id, nome: c.nome, parceria: c.parceria, rateio: c.rateio, planos: c.planos || [] }))
          });
        }
      }
      const it = g.itens[chave];
      if (it.inteiro) return;
      it.valor += r.valor;
      it.aPagar += r.aPagar;
      if (!it.ccs.some((c) => c.id === r.ccId)) it.ccs.push({ id: r.ccId, nome: r.ccNome, parceria: true });
    });
    return Object.values(grupos).map((g) => {
      const itens = g.ordem.map((k) => g.itens[k]).sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || "") || Number(a.titulo) - Number(b.titulo));
      itens.forEach((it) => {
        it.ccs.sort((a, b) => Number(a.id) - Number(b.id));
        const t = this.resumoTitulo(it.chave);
        it.rateio = t ? this.conferirRateio(t.ccs, t.valor, t.ctx) : null;
        it.loteIntegra = this.loteIntegraDe(it.chave);
        it.loteSienge = this.state.loteSienge[it.chave] || "";
        it.emLote = !!(it.loteIntegra || it.loteSienge);
        const selKey = g.key + "|" + it.chave;
        if (!this.state.selInit[selKey]) {
          this.state.selInit[selKey] = true;
          this.state.sel[selKey] = g.key !== "__sem" && !it.emLote;
        }
        it.selKey = selKey;
        it.pag = this.state.pagInfo[it.chave] || null;
        it.bloqueio = this.bloqueioLote(it);
        it.marcado = !it.emLote && !it.bloqueio && !!this.state.sel[selKey];
      });
      return { ...g, itens };
    }).sort((a, b) => (a.key === "__sem") - (b.key === "__sem")
      || this.contaLabel(a.conta).localeCompare(this.contaLabel(b.conta))
      || String(a.dia).localeCompare(String(b.dia)));
  },

  lotesDoGrupo(g) {
    const ids = [];
    g.itens.forEach((it) => {
      const nome = it.loteIntegra ? it.loteIntegra.id : (it.loteSienge ? "Sienge" + (it.loteSienge !== "sim" ? " nº " + it.loteSienge : "") : "");
      if (nome && !ids.includes(nome)) ids.push(nome);
    });
    return ids;
  },

  setVisao(v) {
    this.state.visao = v;
    this.paintTitulos();
  },

  toggleItem(selKey) {
    this.state.sel[selKey] = !this.state.sel[selKey];
    this.state.selManual[selKey] = true;
    this.paintTitulos();
  },

  setAbaLotes(v) {
    this.state.abaLotes = v;
    this.paintTitulos();
  },

  toggleLote(key) {
    const abertos = this.state.lotesAbertos;
    if (abertos[key]) delete abertos[key];
    else abertos[key] = true;
    this.paintTitulos();
  },

  toggleGrupo(key, marcar) {
    const g = this.gruposLote().find((x) => x.key === key);
    if (!g) return;
    g.itens.forEach((it) => {
      if (it.emLote || it.bloqueio) return;
      this.state.sel[it.selKey] = !!marcar;
    });
    this.paintTitulos();
  },

  async gerarLote(key) {
    const s = this.state;
    let g = this.gruposLote().find((x) => x.key === key);
    if (!g || !g.conta || s.gerandoLote) return;
    if (s.validacao && s.validacao.rodando) {
      alert("Aguarde terminar a conferência das formas de pagamento para gerar o lote.");
      return;
    }
    if (!g.itens.some((it) => it.marcado)) {
      alert(g.itens.every((it) => it.emLote) ? "Todos os títulos deste dia já estão em lote."
        : (g.itens.some((it) => !it.emLote && !it.bloqueio) ? "Marque ao menos um título para gerar o lote." : "Nenhum título deste dia pode entrar em lote: todos estão bloqueados (autorização, rateio, plano financeiro ou forma de pagamento). Corrija e busque de novo."));
      return;
    }
    s.gerandoLote = key;
    this.paintTitulos();
    // Relê os lotes antes de gravar: outro usuário pode ter gerado lote com estes títulos.
    await this.carregarLotes();
    g = this.gruposLote().find((x) => x.key === key);
    const itens = g ? g.itens.filter((it) => it.marcado && !it.emLote) : [];
    if (!itens.length) {
      s.gerandoLote = "";
      this.paintTitulos();
      alert("Estes títulos já foram incluídos em outro lote. A tela foi atualizada.");
      return;
    }
    const comBloqueio = itens.filter((it) => this.bloqueioLote(it));
    if (comBloqueio.length) {
      s.gerandoLote = "";
      this.paintTitulos();
      alert("Lote não gerado: há título bloqueado (autorização, rateio, plano financeiro ou forma de pagamento).\n\n" + comBloqueio.slice(0, 8).map((it) => `• ${it.titulo}/${it.parcela || 1} ${it.credor}: ${this.bloqueioLote(it)}`).join("\n"));
      return;
    }
    const total = itens.reduce((t, it) => t + it.aPagar, 0);
    const fora = g.itens.filter((it) => it.bloqueio);
    const alerta = fora.length
      ? `\n\n${fora.length} título(s) deste dia ficam fora por bloqueio:\n` + fora.slice(0, 8).map((it) => `• ${it.titulo}/${it.parcela || 1} ${it.credor}: ${it.bloqueio}`).join("\n") + (fora.length > 8 ? `\n• e mais ${fora.length - 8}` : "")
      : "";
    const pergunta = `Gerar lote do dia ${this.dataBr(g.dia)} com ${itens.length} título(s), total de ${this.money(total)}, pela conta ${this.contaLabel(g.conta)}?${alerta}`;
    const okConf = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(pergunta) : confirm(pergunta);
    if (!okConf) {
      s.gerandoLote = "";
      this.paintTitulos();
      return;
    }
    await this.limparPendentes(itens.map((it) => it.chave));
    const agora = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const id = "L" + agora.getFullYear() + pad(agora.getMonth() + 1) + pad(agora.getDate()) + "-" + pad(agora.getHours()) + pad(agora.getMinutes()) + pad(agora.getSeconds())
      + "-" + String(g.contaKey || "").replace(/[^\w]/g, "").slice(-6) + "-" + String(g.dia || "").replace(/-/g, "").slice(4);
    const usuario = this.usuarioAtual();
    const lote = JSON.parse(JSON.stringify({
      id,
      criadoEm: agora.toISOString(),
      criadoPor: usuario,
      criadoPorEmail: this.emailAtual(),
      contaKey: g.contaKey,
      dia: g.dia,
      conta: g.conta,
      empresaConta: g.empresaConta || "",
      total: Math.round(total * 100) / 100,
      itens: itens.map((it) => ({
        titulo: it.titulo, parcela: it.parcela, credor: it.credor, credorId: it.credorId || "", companyId: it.companyId || "", documento: it.documento,
        vencimento: it.vencimento, valor: Math.round(it.aPagar * 100) / 100,
        ccs: it.ccs.map((c) => c.id + " - " + c.nome).join(" / "),
        forma: it.pag ? it.pag.check.forma : "",
        linhaDigitavel: it.pag ? it.pag.check.linhaFmt || "" : "",
        conferencia: it.pag ? it.pag.check.resumo : "Não conferido",
        valida: this.validacoesDe(it.rateio, it.pag, it.autorizacao)
      })),
      sienge: { status: "pendente", historico: [] }
    }));
    s.lotes = s.lotes.concat([lote]);
    const salvoRemoto = await this.salvarLote(lote);
    this.auditarLote(lote);
    itens.forEach((it) => { s.sel[it.selKey] = false; });
    s.gerandoLote = "";
    this.paintTitulos();
    if (!salvoRemoto) alert("O lote foi gerado, mas ficou salvo só neste computador (não consegui gravar no Firebase).");
    await this.enviarAoSienge(id);
  },

  usuarioAtual() {
    try {
      const u = (window.MouraAuth && MouraAuth.getCurrentUser && MouraAuth.getCurrentUser()) || (window.AppState && AppState.currentUser);
      return (u && (u.name || u.email)) || "Usuário";
    } catch (e) {
      return "Usuário";
    }
  },

  /* O robô entra no Sienge com este e-mail: o lote é criado e aprovado com o acesso de quem está no Integra. */
  emailAtual() {
    try {
      const u = (window.MouraAuth && MouraAuth.getCurrentUser && MouraAuth.getCurrentUser()) || (window.AppState && AppState.currentUser);
      return String((u && u.email) || "").trim().toLowerCase();
    } catch (e) {
      return "";
    }
  },

  async salvarLote(lote) {
    this.salvarLotesLocal(this.lotesLocal().filter((l) => l.id !== lote.id).concat([lote]));
    const fc = window.firebaseCollections;
    if (!(window.firebaseDb && fc && fc.setDoc)) return false;
    try {
      await fc.setDoc(fc.doc(window.firebaseDb, this.LOTES_COLLECTION, lote.id), JSON.parse(JSON.stringify(lote)));
      return true;
    } catch (e) {
      console.warn("[Gerar Pagamento] salvar lote", e);
      return false;
    }
  },

  podeAprovar() {
    if (typeof window.isCrmSuperAdmin === "function" && window.isCrmSuperAdmin()) return true;
    return typeof window.hasCrmPerm === "function" && window.hasCrmPerm("sub_fin_cp_gerar_pagamento_editar");
  },

  async roboChamar(caminho, corpo) {
    const email = this.emailAtual();
    if (!email) return { ok: false, cancelado: true, erro: "Entre no Integra com sua conta Microsoft da Moura Leite: o robô usa o mesmo usuário no Sienge." };
    corpo = Object.assign({}, corpo, { usuario: this.usuarioAtual(), usuarioEmail: email });
    let token = "";
    try { token = localStorage.getItem(this.ROBO_TOKEN_KEY) || ""; } catch (e) {}
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      if (!token) token = await this.roboParear();
      if (!token) {
        token = String(prompt("Cole o código do robô do Sienge (fica no arquivo robo-token.txt da pasta robo-sienge deste computador):") || "").trim();
        if (!token) return { ok: false, cancelado: true, erro: "Código do robô não informado." };
        try { localStorage.setItem(this.ROBO_TOKEN_KEY, token); } catch (e) {}
      }
      let resp;
      try {
        resp = await fetch(this.ROBO_URL + caminho, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Robo-Token": token },
          body: JSON.stringify(corpo)
        });
      } catch (e) {
        return { ok: false, offline: true, erro: "O robô do Sienge não está ligado neste computador." };
      }
      const r = await resp.json().catch(() => ({ ok: false, erro: "Resposta inválida do robô." }));
      if (resp.status !== 401) return r;
      try { localStorage.removeItem(this.ROBO_TOKEN_KEY); } catch (e) {}
      token = "";
    }
    return { ok: false, erro: "O código do robô não confere. Confira o arquivo robo-token.txt na pasta robo-sienge." };
  },

  /* O robô entrega o código só para o endereço oficial do Integra; assim ninguém precisa copiar e colar. */
  async roboParear() {
    try {
      const resp = await fetch(this.ROBO_URL + "/parear", { method: "GET" });
      if (!resp.ok) return "";
      const r = await resp.json();
      const token = r && r.ok ? String(r.token || "") : "";
      if (token) {
        try { localStorage.setItem(this.ROBO_TOKEN_KEY, token); } catch (e) {}
      }
      return token;
    } catch (e) {
      return "";
    }
  },

  /* Lotes gravados antes de guardar a empresa: busca nos títulos carregados e no CC dono da conta. */
  completarLote(lote) {
    (lote.itens || []).forEach((it) => {
      if (it.companyId) return;
      const r = this.state.titulos.find((x) => x.titulo === String(it.titulo) && String(x.parcela) === String(it.parcela || ""));
      if (r && r.companyId) it.companyId = r.companyId;
    });
    if (lote.empresaConta) return;
    const alvo = this.numConta(lote.conta && (lote.conta.numero || lote.conta.id));
    const cc = alvo && this.state.costCenters.find((c) => {
      const conta = this.contaParceriaDe(c);
      return conta && this.numConta(conta.numero || conta.id) === alvo;
    });
    if (cc) lote.empresaConta = String(this.companyIdOf(cc) || "");
  },

  async registrarSienge(lote, acao, r, extra) {
    const sg = lote.sienge || { historico: [] };
    sg.historico = (sg.historico || []).concat([{
      acao, por: this.usuarioAtual(), porEmail: this.emailAtual(), em: new Date().toISOString(), ok: !!r.ok, msg: r.ok ? (r.numeroSienge ? "Lote Sienge nº " + r.numeroSienge : "OK") : r.erro || ""
    }]).slice(-30);
    Object.assign(sg, extra);
    lote.sienge = sg;
    await this.salvarLote(lote);
    this.auditarLote(lote);
  },

  /* ---------- auditoria: cada passo do lote vira um registro em Segurança › Auditoria ---------- */
  LOTE_AUDIT_KEY: "gp_lotes_auditados",

  /** Grava na auditoria os passos do lote que ainda não foram gravados (o id fixo evita registro em dobro). */
  auditarLote(lote) {
    if (!lote || !lote.id || !window.AuditService) return;
    const eventos = [{ tipo: "LOTE_GERADO", em: lote.criadoEm, por: lote.criadoPor, porEmail: lote.criadoPorEmail, ok: true }];
    ((lote.sienge && lote.sienge.historico) || []).forEach((h) => eventos.push({
      tipo: h.acao === "excluir" ? "LOTE_EXCLUIDO" : (!h.ok ? "LOTE_ERRO" : (h.acao === "aprovar" ? "LOTE_APROVADO" : "LOTE_SIENGE")),
      acao: h.acao, em: h.em, por: h.por, porEmail: h.porEmail || "", ok: !!h.ok, msg: h.ok && h.acao !== "excluir" ? "" : h.msg || ""
    }));
    let feitos;
    try { feitos = new Set(JSON.parse(localStorage.getItem(this.LOTE_AUDIT_KEY) || "[]")); } catch (e) { feitos = new Set(); }
    const remoto = !!window.firebaseDb;
    let novo = false;
    eventos.forEach((ev) => {
      const ms = new Date(ev.em || "").getTime();
      if (!Number.isFinite(ms)) return;
      const id = `lote-${lote.id}-${ev.tipo}-${ms}`;
      if (feitos.has(id)) return;
      this.auditarEvento(lote, ev, id);
      if (remoto) {
        feitos.add(id);
        novo = true;
      }
    });
    if (novo) {
      try { localStorage.setItem(this.LOTE_AUDIT_KEY, JSON.stringify([...feitos].slice(-3000))); } catch (e) {}
    }
  },

  auditarEvento(lote, ev, id) {
    const sg = lote.sienge || {};
    const itens = lote.itens || [];
    const titulos = itens.map((i) => `${i.titulo}/${i.parcela || 1}`);
    const credores = [...new Set(itens.map((i) => i.credor).filter(Boolean))];
    const titulo = {
      LOTE_GERADO: "Lote gerado no Integra",
      LOTE_SIENGE: "Lote criado no Sienge pelo robô",
      LOTE_APROVADO: "Lote aprovado no Sienge pelo robô",
      LOTE_ERRO: ev.acao === "aprovar" ? "O robô não aprovou o lote no Sienge" : "O robô não criou o lote no Sienge",
      LOTE_EXCLUIDO: ev.acao === "excluir" ? "Lote excluído no Sienge" : "Lote excluído no Integra"
    }[ev.tipo] || ev.tipo;
    const numero = (ev.tipo === "LOTE_SIENGE" || ev.tipo === "LOTE_APROVADO" || (ev.tipo === "LOTE_ERRO" && ev.acao === "aprovar")) && sg.numero ? ` (Sienge nº ${sg.numero})` : "";
    try {
      window.AuditService.logEvent({
        id,
        timestamp: new Date(ev.em).toISOString(),
        user: ev.por || "",
        userEmail: ev.porEmail || "",
        action: ev.tipo,
        module: "Gerar Pagamento",
        status: ev.ok ? "ok" : "erro",
        summary: `${titulo}: ${lote.id}${numero} · ${titulos.length} título(s) · ${this.money(lote.total)} · pagamento ${this.dataBr(lote.dia)} · ${this.contaLabel(lote.conta)}${ev.msg ? " · " + ev.msg : ""}`,
        customerLabel: credores.slice(0, 3).join(", ") + (credores.length > 3 ? ` e mais ${credores.length - 3}` : ""),
        enterpriseId: String((itens[0] && itens[0].ccs) || "").split(" - ")[0],
        titleId: titulos.join(", "),
        details: { lote: lote.id, numeroSienge: sg.numero || "", total: lote.total, pagamento: lote.dia, conta: this.contaLabel(lote.conta), titulos, mensagem: ev.msg || "" }
      });
    } catch (e) {
      console.warn("[Gerar Pagamento] auditoria", e);
    }
  },

  async enviarAoSienge(id) {
    const s = this.state;
    const lote = s.lotes.find((l) => l.id === id);
    if (!lote || s.roboLote) return;
    const sg = lote.sienge || {};
    if (sg.status === "gerado" || sg.status === "aprovado") return;
    const ocupados = (lote.itens || []).filter((i) => {
      const k = this.chaveTitulo(i.titulo, i.parcela);
      return s.loteSienge[k] || this.loteIntegraDe(k);
    });
    if (ocupados.length) {
      alert(`Não dá para enviar o lote ${id}: estes títulos já estão em outro lote no Sienge.\n\n${ocupados.slice(0, 8).map((i) => `• ${i.titulo}/${i.parcela || 1} ${i.credor || ""}`).join("\n")}\n\nExclua este lote e gere de novo com os títulos livres.`);
      return;
    }
    this.completarLote(lote);
    s.roboLote = id;
    this.paintTitulos();
    const r = await this.roboChamar("/lotes/gerar", { lote });
    s.roboLote = "";
    if (r.offline || r.cancelado) {
      this.paintTitulos();
      alert(`Lote ${id} salvo no Integra, mas ainda não foi criado no Sienge.\n\n${r.erro}` + (r.offline ? `\nNa pasta robo-sienge, dê dois cliques em "Ligar robô automático" (só uma vez neste computador) e clique em "Enviar ao Sienge" na lista de lotes gerados.` : ""));
      return;
    }
    if (r.ok) {
      await this.registrarSienge(lote, "gerar", r, { status: "gerado", numero: r.numeroSienge || "", geradoEm: new Date().toISOString(), geradoPor: this.usuarioAtual(), erro: "" });
    } else {
      await this.registrarSienge(lote, "gerar", r, { status: "erro", erro: r.erro || "Falha no robô." });
    }
    this.paintTitulos();
    if (!r.ok) alert(`O robô não conseguiu criar o lote ${id} no Sienge:\n\n${r.erro || "Falha no robô."}`);
  },

  async aprovarNoSienge(id) {
    const s = this.state;
    const lote = s.lotes.find((l) => l.id === id);
    if (!lote || s.roboLote) return;
    const sg = lote.sienge || {};
    if (sg.status !== "gerado") return;
    if (!this.podeAprovar()) {
      alert("Você não tem permissão para aprovar lotes de pagamento (precisa de Gerar Pagamento · editar).");
      return;
    }
    const pergunta = `Aprovar no Sienge o lote ${sg.numero ? "nº " + sg.numero : id}: ${(lote.itens || []).length} título(s), total de ${this.money(lote.total)}, pela conta ${this.contaLabel(lote.conta)}?\n\nA aprovação fica registrada em seu nome.`;
    const okConf = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(pergunta) : confirm(pergunta);
    if (!okConf) return;
    s.roboLote = id;
    this.paintTitulos();
    this.completarLote(lote);
    const r = await this.roboChamar("/lotes/aprovar", { lote, numeroSienge: sg.numero || "" });
    s.roboLote = "";
    if (r.offline || r.cancelado) {
      this.paintTitulos();
      alert(r.erro + (r.offline ? `\nNa pasta robo-sienge, dê dois cliques em "Ligar robô automático" (só uma vez neste computador) e tente aprovar de novo.` : ""));
      return;
    }
    if (r.ok) {
      await this.registrarSienge(lote, "aprovar", r, { status: "aprovado", aprovadoEm: new Date().toISOString(), aprovadoPor: this.usuarioAtual(), erro: "" });
    } else {
      await this.registrarSienge(lote, "aprovar", r, { erro: r.erro || "Falha no robô." });
    }
    this.paintTitulos();
    if (!r.ok) alert(`O robô não conseguiu aprovar o lote no Sienge:\n\n${r.erro || "Falha no robô."}`);
  },

  siengeHtml(l) {
    const sg = l.sienge || {};
    const rodando = this.state.roboLote === l.id;
    const hist = (sg.historico || []).map((h) => `${new Date(h.em).toLocaleString("pt-BR")} · ${h.acao === "aprovar" ? "Aprovar" : "Gerar"} · ${h.por} · ${h.ok ? "ok" : "erro"}${h.msg ? " · " + h.msg : ""}`).join("\n");
    if (rodando) return `<span class="gp-pill gp-wait"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;width:10px;height:10px;"></span> Robô no Sienge…</span>`;
    if (!l.sienge) return `<span class="gp-pill gp-warn" title="Lote salvo só no Integra (Excel); os títulos continuam livres para um novo lote">Não gerado no Sienge</span>`;
    if (sg.status === "aprovado") return `<span class="gp-pill gp-ok" title="${this.esc(hist)}">Aprovado${sg.numero ? " · nº " + this.esc(sg.numero) : ""}</span><small>${this.esc(String(sg.aprovadoPor || "").split(" ")[0])} · ${new Date(sg.aprovadoEm).toLocaleDateString("pt-BR")}</small>`;
    if (sg.status === "gerado") return `<span class="gp-pill gp-ok" title="${this.esc(hist)}">No Sienge${sg.numero ? " · nº " + this.esc(sg.numero) : ""}</span><small>${sg.erro ? `<b style="color:#b91c1c;">Aprovação falhou</b>` : "Aguardando aprovação"}</small>`;
    if (sg.status === "erro") return `<span class="gp-pill gp-bad" title="${this.esc(hist)}">Erro no Sienge</span><small title="${this.esc(sg.erro || "")}">${this.esc(String(sg.erro || "").slice(0, 60))}</small>`;
    return `<span class="gp-pill gp-warn" title="${this.esc(hist)}">Não gerado no Sienge</span><small>Aguardando robô</small>`;
  },

  siengeAcoesHtml(l) {
    const sg = l.sienge || {};
    if (this.state.roboLote) return "";
    if (!l.sienge || sg.status === "pendente" || sg.status === "erro") {
      return `<button type="button" class="btn btn-sm btn-primary" onclick="GerarPagamentoApp.enviarAoSienge('${this.esc(l.id)}')" title="Pedir ao robô deste computador para criar o lote no Sienge"><i data-lucide="send" style="width:14px;height:14px;"></i> Enviar ao Sienge</button>`;
    }
    if (sg.status === "gerado" && this.podeAprovar()) {
      return `<button type="button" class="btn btn-sm btn-primary" onclick="GerarPagamentoApp.aprovarNoSienge('${this.esc(l.id)}')" title="Aprovar o lote no Sienge (fica registrado em seu nome)"><i data-lucide="badge-check" style="width:14px;height:14px;"></i> Aprovar</button>`;
    }
    return "";
  },

  baixarLoteExcel(loteOuId) {
    const lote = typeof loteOuId === "string" ? this.state.lotes.find((l) => l.id === loteOuId) : loteOuId;
    if (!lote) return;
    if (typeof XLSX === "undefined") {
      alert("A biblioteca de Excel não carregou. Recarregue a página.");
      return;
    }
    const sg = lote.sienge || {};
    const emp = (this.state.companies || []).find((c) => String(c.id) === String(lote.empresaConta || ""));
    const empresa = lote.empresaConta ? `${String(lote.empresaConta).padStart(4, "0")}${emp ? " - " + (emp.name || emp.tradeName || "") : ""}` : "";
    const situacao = sg.status === "aprovado" ? "Aprovado no Sienge" : (sg.status === "gerado" ? "Programado no Sienge (aguardando aprovação)" : (sg.status === "erro" ? "Erro no Sienge" : "Só no Integra"));
    const quando = (iso, quem) => iso ? `${new Date(iso).toLocaleString("pt-BR")}${quem ? " · " + quem : ""}` : "—";
    const N = 14;
    const cab = ["Título/Parcela", "Documento", "Vencimento", "Valor", "Credor", "Rateio (CC e % do título)", "Plano financeiro", "Forma de pagamento", "Linha digitável / chave", "Autorização", "Plano financeiro", "Rateio parceiro", "Boleto / PIX", "Desconto"];
    const linhas = [
      ["Lote de Pagamento Escritural"],
      [],
      ["Empresa", empresa, "", "", "", "Situação", situacao],
      ["Lote Sienge", sg.numero ? String(sg.numero) : "—", "", "", "", "Lote Integra", lote.id],
      ["Conta corrente", this.contaLabel(lote.conta), "", "", "", "Data de pagamento", lote.dia ? this.dataBr(lote.dia) : ""],
      ["Gerado", quando(lote.criadoEm, lote.criadoPor), "", "", "", "Aprovado", quando(sg.aprovadoEm, sg.aprovadoPor)],
      [],
      cab
    ];
    const inicio = linhas.length;
    const itens = lote.itens || [];
    itens.forEach((i) => {
      const v = this.validacoesItem(i);
      linhas.push([`${i.titulo}/${i.parcela || 1}`, i.documento || "", this.dataBr(i.vencimento), Number(i.valor) || 0, i.credor || "",
        v.rateioTexto || i.ccs || "", v.planoTexto || "", i.forma || "", i.linhaDigitavel || "", v.autorizacao || "Não verificada", v.plano, v.rateio, v.pagamento, v.desconto]);
    });
    linhas.push(["", "", "Total do lote", Number(lote.total) || 0]);
    linhas.push([], [`Gerado pelo Integra em ${new Date().toLocaleString("pt-BR")}`]);
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 13 }, { wch: 34 }, { wch: 30 }, { wch: 34 }, { wch: 18 }, { wch: 50 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 13 }, { wch: 14 }];
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: N - 1 } },
      ...[2, 3, 4, 5].map((r) => ({ s: { r, c: 1 }, e: { r, c: 4 } })),
      ...[2, 3, 4, 5].map((r) => ({ s: { r, c: 6 }, e: { r, c: N - 1 } }))
    ];
    const borda = { style: "thin", color: { rgb: "B8C4BE" } };
    const bordas = { top: borda, bottom: borda, left: borda, right: borda };
    const cor = (txt) => /^(Conferido|Autorizado)$/.test(txt) ? { fg: "DCFCE7", fc: "166534" }
      : (/^(Não se aplica)$/.test(txt) ? { fg: "F1F5F9", fc: "475569" }
        : (/^(Com desconto|Sem plano|Sem padrão|Não conferido|Não verificada)$/.test(txt) ? { fg: "FEF3C7", fc: "92400E" } : { fg: "FEE2E2", fc: "991B1B" }));
    const pinta = (r, c, s) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      ws[ref].s = s;
    };
    pinta(0, 0, { font: { bold: true, sz: 16, color: { rgb: "105436" } }, alignment: { horizontal: "center" } });
    [2, 3, 4, 5].forEach((r) => {
      [0, 5].forEach((c) => pinta(r, c, { font: { bold: true }, fill: { fgColor: { rgb: "E2E8E5" } }, alignment: { horizontal: "right" }, border: bordas }));
      for (let c = 1; c < N; c++) if (c !== 5) pinta(r, c, { border: bordas });
    });
    cab.forEach((_, c) => pinta(inicio - 1, c, {
      font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: c >= 9 ? "0B3D27" : "105436" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: bordas
    }));
    itens.forEach((_, k) => {
      const r = inicio + k;
      for (let c = 0; c < N; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        const txt = ws[ref] ? String(ws[ref].v) : "";
        if (c >= 9) {
          const k2 = cor(txt);
          pinta(r, c, { font: { bold: true, color: { rgb: k2.fc } }, fill: { fgColor: { rgb: k2.fg } }, alignment: { horizontal: "center", vertical: "center" }, border: bordas });
        } else {
          pinta(r, c, Object.assign({ alignment: { vertical: "center", horizontal: c === 3 ? "right" : "left" }, border: bordas }, c === 3 ? { numFmt: "#,##0.00" } : {}));
        }
      }
    });
    const rTot = inicio + itens.length;
    [2, 3].forEach((c) => pinta(rTot, c, Object.assign({ font: { bold: true }, fill: { fgColor: { rgb: "E2E8E5" } }, alignment: { horizontal: "right" }, border: bordas }, c === 3 ? { numFmt: "#,##0.00" } : {})));
    pinta(rTot + 2, 0, { font: { italic: true, sz: 9, color: { rgb: "64748B" } } });
    ws["!rows"] = [{ hpt: 26 }];
    ws["!rows"][inicio - 1] = { hpt: 30 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lote");
    const conta = String((lote.conta && (lote.conta.numero || lote.conta.id)) || "").replace(/[^\w-]/g, "");
    XLSX.writeFile(wb, `lote_pagar_${lote.id}${conta ? "_cc" + conta : ""}.xlsx`);
  },

  async excluirLote(id) {
    const lote = this.state.lotes.find((l) => l.id === id);
    if (!lote) return;
    const sg = lote.sienge || {};
    if (this.state.roboLote === id) return;
    if (sg.status === "aprovado") {
      alert(`O lote ${id} já foi aprovado no Sienge${sg.numero ? " (nº " + sg.numero + ")" : ""}. Cancele primeiro no Sienge; aqui ele não pode ser excluído.`);
      return;
    }
    const aviso = sg.status === "gerado" ? `\n\nAtenção: este lote já existe no Sienge${sg.numero ? " (nº " + sg.numero + ")" : ""}. Excluir aqui NÃO exclui no Sienge.` : "";
    const okConf = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm(`Excluir o lote ${id}? Os títulos voltam a ficar disponíveis para um novo lote.${aviso}`)
      : confirm(`Excluir o lote ${id}?`);
    if (!okConf) return;
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.deleteDoc) {
      try {
        await fc.deleteDoc(fc.doc(window.firebaseDb, this.LOTES_COLLECTION, id));
      } catch (e) {
        console.warn("[Gerar Pagamento] excluir lote", e);
        alert("Não consegui excluir o lote no Firebase.");
        return;
      }
    }
    const em = new Date().toISOString();
    this.auditarEvento(lote, { tipo: "LOTE_EXCLUIDO", em, por: this.usuarioAtual(), porEmail: this.emailAtual(), ok: true,
      msg: sg.status === "gerado" ? "continua no Sienge — excluir lá também" : "" }, `lote-${id}-LOTE_EXCLUIDO-${new Date(em).getTime()}`);
    this.state.lotes = this.state.lotes.filter((l) => l.id !== id);
    this.salvarLotesLocal(this.lotesLocal().filter((l) => l.id !== id));
    Object.keys(this.state.selInit).forEach((k) => {
      if ((lote.itens || []).some((i) => k.endsWith("|" + this.chaveTitulo(i.titulo, i.parcela)))) delete this.state.selInit[k];
    });
    this.paintTitulos();
  },

  lotesHtml() {
    const s = this.state;
    const grupos = this.gruposLote();
    if (!grupos.length) {
      return `<div style="padding:22px 20px;color:#64748b;font-size:0.85rem;">Nenhum título em aberto dos centros de custo de parceiro no período.</div>`;
    }
    const card = (g) => {
      const sem = g.key === "__sem";
      const marcados = g.itens.filter((it) => it.marcado);
      const total = marcados.reduce((t, it) => t + it.aPagar, 0);
      const disponiveis = g.itens.filter((it) => !it.emLote);
      const liberados = disponiveis.filter((it) => !it.bloqueio);
      const divergentes = disponiveis.filter((it) => this.bloqueioVisivel(it)).length;
      const todos = liberados.length > 0 && liberados.every((it) => it.marcado);
      const gerando = s.gerandoLote === g.key;
      const conferindo = !!(s.validacao && s.validacao.rodando);
      const jaGerado = !sem && !disponiveis.length;
      const lotesDoDia = this.lotesDoGrupo(g);
      const linhas = g.itens.map((it) => {
        const tag = it.loteIntegra
          ? `<span class="gp-pill gp-ok">No lote ${this.esc(it.loteIntegra.id)}</span>`
          : (it.loteSienge ? `<span class="gp-pill gp-warn">Já em lote no Sienge${it.loteSienge !== "sim" ? " nº " + this.esc(it.loteSienge) : ""}</span>`
            : (this.lotePendenteDe(it.chave)
              ? `<span class="gp-pill gp-wait" title="Está no lote ${this.esc(this.lotePendenteDe(it.chave).id)}, que não foi gerado no Sienge. Ao gerar de novo, ele sai daquele lote.">Em aberto</span><small>Lote não gerado no Sienge</small>`
              : `<span class="gp-pill gp-wait">Em aberto</span>`));
        const pagSelo = it.emLote ? `<span class="gp-muted">—</span>` : (window.BoletoCheck ? BoletoCheck.seloHtml(it.pag ? it.pag.check : null) : "");
        return `<tr class="gp-click${it.emLote ? " gp-em-lote" : ""}${this.bloqueioVisivel(it) ? " gp-row-bad" : ""}" onclick="GerarPagamentoApp.abrirResumo('${this.esc(it.chave)}')" title="Clique para ver o resumo do título">
          <td style="text-align:center;" onclick="event.stopPropagation()"><input type="checkbox" ${it.marcado ? "checked" : ""} ${sem || it.emLote || it.bloqueio || gerando ? "disabled" : ""}
            title="${this.esc(it.emLote ? "Já está em lote; não pode entrar em outro." : (it.bloqueio ? "Bloqueado: " + it.bloqueio : ""))}"
            onchange="GerarPagamentoApp.toggleItem('${this.esc(it.selKey)}')"></td>
          <td>${this.dataBr(it.vencimento)}</td>
          <td><strong>${this.esc(it.titulo)}</strong>${it.parcela ? `<span class="gp-muted"> / ${this.esc(it.parcela)}</span>` : ""}</td>
          <td title="${this.esc(it.credor)}">${this.esc(it.credor)}</td>
          <td>${this.esc(it.documento || "—")}</td>
          <td class="gp-status">${this.ccsCelulaHtml(it)}${it.emLote ? "" : this.rateioSeloHtml(it.rateio)}</td>
          <td style="text-align:right;">${this.money(it.aPagar)}</td>
          <td class="gp-status">${pagSelo}</td>
          <td class="gp-status">${this.autorizacaoSeloHtml(it)}</td>
          <td class="gp-status">${tag}</td>
        </tr>`;
      }).join("");
      const resumo = sem
        ? "Cadastre a conta em Centros de Custo para incluir estes títulos em lote."
        : (jaGerado
          ? `${g.itens.length} título(s) · todos já em lote (${lotesDoDia.map((x) => this.esc(x)).join(", ")})`
          : `${g.itens.length} título(s) · ${disponiveis.length} disponível(is) · ${marcados.length} marcado(s)${lotesDoDia.length ? ` · ${g.itens.length - disponiveis.length} já em lote` : ""}${divergentes ? ` · <b class="gp-bloq">${divergentes} bloqueado(s) por divergência</b>` : ""}`);
      const somaGrupo = g.itens.reduce((t, it) => t + it.aPagar, 0);
      const aberto = !!s.lotesAbertos[g.key];
      return `<div class="gp-lote${sem ? " gp-lote-sem" : ""}${jaGerado ? " gp-lote-feito" : ""}${aberto ? " is-open" : ""}">
        <div class="gp-lote-h" role="button" tabindex="0" aria-expanded="${aberto}" title="${aberto ? "Clique para fechar o lote" : "Clique para ver os títulos do lote"}"
          onclick="GerarPagamentoApp.toggleLote('${this.esc(g.key)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();GerarPagamentoApp.toggleLote('${this.esc(g.key)}');}">
          <div class="gp-lote-tit">
            <i data-lucide="chevron-right" class="gp-lote-seta"></i>
            <div>
              <div class="gp-lote-conta">${sem ? "Sem conta de parceria cadastrada" : `${this.esc(this.contaLabel(g.conta))} <span class="gp-lote-dia"><i data-lucide="calendar" style="width:13px;height:13px;"></i> ${this.dataBr(g.dia)}</span>`}</div>
              <small>${resumo} · ${this.money(somaGrupo)}</small>
            </div>
          </div>
          ${sem ? "" : (jaGerado ? `<div class="gp-lote-acoes" onclick="event.stopPropagation()">
            <span class="gp-pill gp-ok" style="height:30px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;"><i data-lucide="check-circle-2" style="width:14px;height:14px;"></i> Lote já gerado</span>
          </div>` : `<div class="gp-lote-acoes" onclick="event.stopPropagation()">
            <label class="gp-lote-todos"><input type="checkbox" ${todos ? "checked" : ""} ${gerando || !liberados.length ? "disabled" : ""} onchange="GerarPagamentoApp.toggleGrupo('${this.esc(g.key)}', this.checked)"> Marcar todos</label>
            <strong class="gp-lote-total">${this.money(total)}</strong>
            <button type="button" class="btn btn-primary" ${s.gerandoLote || conferindo || !marcados.length ? "disabled" : ""} onclick="GerarPagamentoApp.gerarLote('${this.esc(g.key)}')"
              title="${conferindo ? "Aguarde a conferência das formas de pagamento" : (!marcados.length && divergentes ? "Os títulos disponíveis estão bloqueados (autorização, rateio, plano financeiro ou forma de pagamento)" : "")}"
              style="height:36px;width:150px;justify-content:center;display:inline-flex;align-items:center;gap:6px;">
              ${gerando ? '<span class="btn-spin"></span> Gerando…' : '<i data-lucide="layers" style="width:14px;"></i> Gerar lote'}
            </button>
          </div>`)}
        </div>
        <div class="gp-lote-corpo" style="overflow:auto;"${aberto ? "" : " hidden"}>
          <table class="gp-table gp-titulos">
            <colgroup><col style="width:3%"><col style="width:8%"><col style="width:7%"><col style="width:17%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:11%"><col style="width:15%"><col style="width:12%"></colgroup>
            <thead><tr><th></th><th>Vencimento</th><th>Título</th><th>Credor</th><th>Documento</th><th>Centro de custo</th><th style="text-align:right;">A pagar</th><th>Pagamento</th><th>Autorização</th><th>Situação</th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      </div>`;
    };
    const aGerar = grupos.map((g) => ({ ...g, itens: g.itens.filter((it) => !it.emLote) })).filter((g) => g.itens.length);
    const emLote = grupos.map((g) => ({ ...g, key: g.key + "#lote", itens: g.itens.filter((it) => it.emLote) })).filter((g) => g.itens.length);
    const nAGerar = aGerar.reduce((t, g) => t + g.itens.length, 0);
    const nEmLote = emLote.reduce((t, g) => t + g.itens.length, 0);
    const aba = s.abaLotes === "lote" ? "lote" : "gerar";
    const abas = `<div class="ml-tabs gp-abas-lote" role="tablist">
        <button type="button" role="tab" aria-selected="${aba === "gerar"}" class="ml-tab ${aba === "gerar" ? "is-active" : ""}" onclick="GerarPagamentoApp.setAbaLotes('gerar')"><i data-lucide="layers"></i> A gerar <span class="ml-tab-count">${nAGerar}</span></button>
        <button type="button" role="tab" aria-selected="${aba === "lote"}" class="ml-tab ${aba === "lote" ? "is-active" : ""}" onclick="GerarPagamentoApp.setAbaLotes('lote')"><i data-lucide="check-circle-2"></i> Já em lote <span class="ml-tab-count">${nEmLote}</span></button>
      </div>`;
    const vazio = (txt) => `<div style="padding:22px 20px;color:#64748b;font-size:0.85rem;">${txt}</div>`;
    const chaves = new Set(s.titulos.map((r) => this.chaveTitulo(r.titulo, r.parcela)));
    const gerados = s.lotes
      .filter((l) => (l.itens || []).some((i) => chaves.has(this.chaveTitulo(i.titulo, i.parcela))))
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const geradosHtml = gerados.length ? `<div class="gp-lote">
        <div class="gp-lote-h"><div><div class="gp-lote-conta">Lotes gerados com títulos deste período</div></div></div>
        <table class="gp-table gp-titulos">
          <colgroup><col style="width:17%"><col style="width:8%"><col style="width:19%"><col style="width:6%"><col style="width:9%"><col style="width:10%"><col style="width:14%"><col style="width:17%"></colgroup>
          <thead><tr><th>Lote</th><th>Vencimento</th><th>Conta</th><th>Títulos</th><th style="text-align:right;">Total</th><th>Gerado</th><th>Sienge</th><th></th></tr></thead>
          <tbody>${gerados.map((l) => `<tr>
            <td><strong>${this.esc(l.id)}</strong></td>
            <td>${l.dia ? this.dataBr(l.dia) : this.esc([...new Set((l.itens || []).map((i) => this.dataBr(i.vencimento)))].join(", "))}</td>
            <td title="${this.esc(this.contaLabel(l.conta))}">${this.esc(this.contaLabel(l.conta))}</td>
            <td>${(l.itens || []).length}</td>
            <td style="text-align:right;">${this.money(l.total)}</td>
            <td title="${this.esc(l.criadoPor || "")}">${new Date(l.criadoEm).toLocaleDateString("pt-BR")} · ${this.esc(String(l.criadoPor || "").split(" ")[0])}</td>
            <td class="gp-status">${this.siengeHtml(l)}</td>
            <td style="text-align:right;white-space:nowrap;">
              ${this.siengeAcoesHtml(l)}
              <button type="button" class="btn btn-sm btn-excel" onclick="GerarPagamentoApp.baixarLoteExcel('${this.esc(l.id)}')" title="Baixar o lote em Excel"><i data-lucide="download" style="width:14px;height:14px;"></i> Excel</button>
              <button type="button" class="btn btn-sm" onclick="GerarPagamentoApp.excluirLote('${this.esc(l.id)}')" style="color:#b91c1c;background:#fff;border:1px solid #fecaca;">Excluir</button>
            </td>
          </tr>`).join("")}</tbody>
        </table>
      </div>` : "";
    const v = s.validacao || {};
    const errosPag = Object.values(s.pagInfo).filter((p) => ["erro", "aviso", "sem"].includes(p.check.nivel)).length;
    const progressoPag = v.rodando
      ? `<span class="gp-valida"><span class="btn-spin" style="border-color:#cbd5e1;border-top-color:#105436;"></span> Conferindo forma de pagamento e boletos · ${v.feitos} de ${v.total}</span>`
      : (v.total ? `<span class="gp-valida">${errosPag ? `<b style="color:#b91c1c;">${errosPag} título(s) com possível divergência na forma de pagamento</b> (bloqueados para lote até corrigir no Sienge)` : "Formas de pagamento conferidas"}</span>` : "");
    const errosRateio = new Set(grupos.flatMap((g) => g.itens.filter((it) => !it.emLote && this.bloqueioRateio(it.rateio)).map((it) => it.chave))).size;
    const avisoRateio = errosRateio ? `<span class="gp-valida"><b style="color:#b91c1c;">${errosRateio} título(s) com rateio ou plano financeiro fora do padrão</b> (bloqueados para lote)</span>` : "";
    const semAut = new Set(grupos.flatMap((g) => g.itens.filter((it) => this.semAutorizacao(it)).map((it) => it.chave))).size;
    const avisoAut = semAut ? `<span class="gp-valida"><b style="color:#b91c1c;">${semAut} título(s) sem autorização no Sienge</b> (bloqueados para lote até autorizar)</span>` : "";
    if (aba === "lote") {
      return `${abas}<p class="gp-nota">Lotes gerados e títulos deste período que já estão em lote no Integra ou no Sienge. Eles não entram em outro lote. Clique na linha para ver o resumo do título.</p>${geradosHtml}${emLote.length ? emLote.map(card).join("") : (gerados.length ? "" : vazio("Nenhum título deste período está em lote."))}`;
    }
    return `${abas}<p class="gp-nota">Títulos em aberto que ainda não estão em lote, separados por conta de parceria e dia de vencimento: um lote por conta por dia. Só título autorizado no Sienge entra em lote. Clique na linha para ver o resumo do título. ${progressoPag}${avisoAut}${avisoRateio}</p>${aGerar.length ? aGerar.map(card).join("") : vazio("Nenhum título a gerar lote no período: todos já estão em lote.")}`;
  },

  grupoStatus(r) {
    if (r.status === "ok") return "ok";
    if (r.status === "outra" || r.status === "sem-conta") return "outra";
    return "aberto";
  },

  /* Uma linha por título/parcela: CC de parceiro sempre vem rateado com o CC da obra (13901 com 13900). */
  titulosAgrupados() {
    const ordem = [];
    const grupos = {};
    const prioridade = ["outra", "sem-conta", "aberto", "pago-sem-conta", "ok"];
    this.state.titulos.forEach((r) => {
      const chave = this.chaveTitulo(r.titulo, r.parcela);
      if (!grupos[chave]) {
        grupos[chave] = { ...r, linhas: [], valor: 0 };
        ordem.push(chave);
      }
      const g = grupos[chave];
      g.linhas.push(r);
      g.valor += r.valor;
      if (prioridade.indexOf(r.status) < prioridade.indexOf(g.status)) g.status = r.status;
    });
    return ordem.map((k) => {
      const g = grupos[k];
      if (g.tituloValor != null) g.valor = g.tituloValor;
      g.contasEsperadas = [...new Set(g.linhas.map((r) => (r.esperada ? String(r.esperada.numero || r.esperada.id) : "")).filter(Boolean))];
      return g;
    });
  },

  obra(ccId) {
    return String(ccId || "").slice(0, -2);
  },

  ccDeParceriaPeloNome(id, nome) {
    return !this.ehCorporativo(id) && /parce(ir|ri)/i.test(String(nome || ((this.ccDe(id) || {}).name) || ""));
  },

  num(v) {
    const n = parseFloat(String(v == null ? "" : v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  },

  /* Padrão da obra no cadastro: % Moura Leite no CC da obra (14000) e % Terrenista no CC do parceiro (14001). */
  rateioPadraoObra(baseId, parcId) {
    const ml = this.num(this.customOf(baseId).perc_ml);
    const terr = parcId ? this.num(this.customOf(parcId).perc_terrenista) : 0;
    if (terr > 0 && terr < 100) {
      const aviso = ml > 0 && ml < 100 && Math.abs(ml + terr - 100) > 0.01
        ? `Cadastro da obra ${this.obra(baseId)}: ${this.pct(ml)} Moura Leite (${baseId}) + ${this.pct(terr)} terrenista (${parcId}) não somam 100%. Usei ${this.pct(100 - terr)} / ${this.pct(terr)}.`
        : "";
      return { ml: 100 - terr, terr, aviso };
    }
    if (ml > 0 && ml < 100) return { ml, terr: 100 - ml, aviso: "" };
    return null;
  },

  /* Distrato emitido até esta data pode ficar só no CC do parceiro. */
  DISTRATO_PARCEIRO_ATE: "2025-12-31",

  contextoRateio(r) {
    return { emissao: (r && r.emissao) || "", docId: (r && r.docId) || "", docNome: (r && r.docNome) || "" };
  },

  ehDistrato(ccs, ctx) {
    const planos = (ccs || []).reduce((l, c) => l.concat((c.planos || []).map((p) => p.nome || "")), []);
    return /distrat/i.test([ctx && ctx.docId, ctx && ctx.docNome].concat(planos).join(" "));
  },

  /* O valor de cada obra no título é dividido entre o CC da obra e o do parceiro pelo padrão do cadastro. */
  conferirRateio(ccs, valor, ctx) {
    const distrato = this.ehDistrato(ccs, ctx);
    const emissao = String((ctx && ctx.emissao) || "");
    const distratoAntigo = distrato && !!emissao && emissao <= this.DISTRATO_PARCEIRO_ATE;
    const total = Number(valor) || 0;
    const soma = (ccs || []).reduce((t, c) => t + this.num(c.rateio), 0);
    const linhas = (ccs || []).map((c) => {
      const pct = soma > 0 ? this.num(c.rateio) * 100 / soma : 100 / ccs.length;
      return { id: String(c.id), nome: c.nome || ((this.ccDe(c.id) || {}).name) || "", parceria: !!c.parceria, pct, valor: total * pct / 100, planos: c.planos || [] };
    }).sort((a, b) => Number(a.id) - Number(b.id));
    // Obra e empresa: obra que virou SPE mantém o CC antigo (ex.: 14200 na empresa 1) fora do par 14201/14202.
    const empresaDe = (id) => String(this.companyIdOf(this.ccDe(id)) || "");
    const obras = [];
    const porObra = {};
    linhas.forEach((l) => {
      const ob = this.obra(l.id);
      const emp = empresaDe(l.id);
      const k = ob + "|" + emp;
      if (!porObra[k]) obras.push(porObra[k] = { obra: ob, empresa: emp, linhas: [] });
      porObra[k].linhas.push(l);
    });
    obras.forEach((o) => {
      o.rotulo = obras.some((x) => x !== o && x.obra === o.obra) && o.empresa ? `${o.obra} (empresa ${o.empresa})` : o.obra;
    });
    const problemas = [];
    const avisos = [];
    let erroRateio = false;
    let erroPlano = false;
    let semPadrao = false;
    obras.forEach((o) => {
      o.pct = o.linhas.reduce((t, l) => t + l.pct, 0);
      o.valor = total * o.pct / 100;
      const comPlano = o.linhas.filter((l) => l.planos.length);
      if (comPlano.length > 1 && new Set(comPlano.map((l) => this.chavePlanos(l.planos))).size > 1) {
        erroPlano = true;
        comPlano.forEach((l) => { l.planoErro = true; });
        problemas.push(`Plano financeiro diferente na obra ${o.rotulo}: ${comPlano.map((l) => `${l.id} em ${this.planosTexto(l.planos)}`).join("; ")}. O CC da obra e o do parceiro devem usar o mesmo plano.`);
      }
      // O CC da obra também pode ter conta de parceria cadastrada; o par do rateio é decidido pelo nome.
      const ehParc = (l) => this.ccDeParceriaPeloNome(l.id, l.nome);
      const daObra = this.state.costCenters.filter((c) => this.obra(c.id) === o.obra && (!o.empresa || empresaDe(c.id) === o.empresa))
        .slice().sort((a, b) => Number(a.id) - Number(b.id));
      const baseCad = daObra.find((c) => String(c.id) === o.obra + "00" && !this.ccDeParceriaPeloNome(c.id, c.name))
        || daObra.find((c) => !this.ccDeParceriaPeloNome(c.id, c.name));
      const base = (o.linhas.find((l) => l.id === o.obra + "00" && !ehParc(l)) || o.linhas.find((l) => !ehParc(l)) || {}).id
        || (baseCad ? String(baseCad.id) : o.obra + "00");
      const parcTitulo = o.linhas.find((l) => l.id !== base && ehParc(l));
      const parcCad = parcTitulo ? null : daObra.find((c) => String(c.id) !== base && this.ccDeParceriaPeloNome(c.id, c.name));
      const parc = parcTitulo ? parcTitulo.id : (parcCad ? String(parcCad.id) : "");
      // Título só no CC da Moura Leite é 100% dela, sem rateio. Só no CC do parceiro, apenas distrato emitido até 31/12/2025.
      const temBase = o.linhas.some((l) => l.id === base);
      const soParceiro = parc && !temBase && !!parcTitulo;
      if (soParceiro && !distratoAntigo) {
        problemas.push(distrato
          ? `Obra ${o.rotulo}: distrato lançado só no CC do parceiro ${parc} com emissão ${emissao ? this.dataBr(emissao) : "não informada"}. Só distrato emitido até ${this.dataBr(this.DISTRATO_PARCEIRO_ATE)} pode ficar só no CC do parceiro.`
          : `Obra ${o.rotulo}: título lançado só no CC do parceiro ${parc}. Ele precisa estar rateado com o ${base} (exceto distrato emitido até ${this.dataBr(this.DISTRATO_PARCEIRO_ATE)}).`);
      }
      if (parc && temBase !== !!parcTitulo && (temBase || distratoAntigo)) {
        o.exclusivo = temBase ? "ml" : "parceiro";
        o.padrao = { ml: temBase ? 100 : 0, terr: temBase ? 0 : 100, aviso: "", exclusivo: true };
        o.linhas.forEach((l) => {
          l.padrao = o.pct > 0 ? l.pct * 100 / o.pct : 100;
          l.esperado = l.valor;
          l.ok = true;
        });
        return;
      }
      const padrao = parc ? this.rateioPadraoObra(base, parc) : { ml: 100, terr: 0, aviso: "" };
      if (!padrao) {
        o.semPadrao = semPadrao = true;
        problemas.push(`Obra ${o.rotulo}: rateio padrão não cadastrado. Informe o % Moura Leite no ${base} e o % Terrenista no ${parc} em Centros de Custo.`);
        return;
      }
      o.padrao = padrao;
      if (padrao.aviso) avisos.push(padrao.aviso);
      [base, parc].filter(Boolean).forEach((id) => {
        if (o.linhas.some((l) => l.id === id) || !((id === base ? padrao.ml : padrao.terr) > 0)) return;
        o.linhas.push({ id, nome: (this.ccDe(id) || {}).name || "", parceria: id === parc, pct: 0, valor: 0, planos: [], ausente: true });
      });
      o.linhas.sort((a, b) => Number(a.id) - Number(b.id));
      o.linhas.forEach((l) => {
        l.padrao = l.id === base ? padrao.ml : (l.id === parc ? padrao.terr : 0);
        l.esperado = o.valor * l.padrao / 100;
        const pctObra = o.pct > 0 ? l.pct * 100 / o.pct : 0;
        l.ok = Math.abs(l.valor - l.esperado) < 0.02 || Math.abs(pctObra - l.padrao) < 0.006;
        if (l.ok) return;
        erroRateio = true;
        problemas.push(l.ausente
          ? `${l.id} não está no rateio; o padrão é ${this.pct(l.padrao)} da obra ${o.rotulo} = ${this.money(l.esperado)}.`
          : `${l.id}: lançado ${this.money(l.valor)}; o padrão é ${this.pct(l.padrao)} da obra ${o.rotulo} = ${this.money(l.esperado)}.`);
      });
    });
    return { total, obras, problemas, avisos, erroRateio, erroPlano, semPadrao, ok: !problemas.length };
  },

  /** Caixinhas do relatório do lote: plano financeiro, rateio do parceiro, boleto/PIX e desconto. */
  validacoesDe(conf, pag, aut) {
    const linhas = conf ? conf.obras.reduce((l, o) => l.concat(o.linhas.filter((x) => !x.ausente)), []) : [];
    const planos = [];
    linhas.forEach((l) => l.planos.forEach((p) => {
      const t = [p.id, p.nome].filter(Boolean).join(" ");
      if (t && !planos.includes(t)) planos.push(t);
    }));
    const temParceiro = !!conf && conf.obras.some((o) => o.linhas.some((l) => l.parceria) || (o.padrao && o.padrao.terr > 0));
    const c = pag && pag.check;
    return {
      autorizacao: !aut ? "Não verificada" : (aut.ok ? "Autorizado" : (aut.parcial ? "Autorização incompleta" : "Não autorizado")),
      autorizadoPor: aut && aut.ok ? `${aut.por || ""}${aut.em ? " em " + this.dataBr(aut.em) : ""}`.trim() : "",
      rateioTexto: linhas.map((l) => `${l.id} ${this.pct(l.pct)}`).join(" · "),
      planoTexto: planos.join(" / "),
      plano: !conf ? "Não conferido" : (conf.erroPlano ? "Divergente" : (planos.length ? "Conferido" : "Sem plano")),
      rateio: !conf ? "Não conferido" : (conf.erroRateio ? "Fora do padrão" : (conf.semPadrao ? "Sem padrão" : (temParceiro ? "Conferido" : "Não se aplica"))),
      pagamento: !c ? "Não conferido" : (["erro", "aviso", "sem"].includes(c.nivel) ? "Divergente" : "Conferido"),
      desconto: !c ? "Não conferido" : (c.desconto ? "Com desconto" : "Não se aplica")
    };
  },

  /** Validações gravadas no lote; lote antigo usa a conferência dos títulos carregados na tela. */
  validacoesItem(i) {
    if (i.valida) return i.valida;
    const chave = this.chaveTitulo(i.titulo, i.parcela);
    const t = this.resumoTitulo(chave);
    const v = this.validacoesDe(t ? this.conferirRateio(t.ccs, t.valor, t.ctx) : null, this.state.pagInfo[chave] || null, t ? t.rows[0].autorizacao : null);
    if (!t) v.rateioTexto = i.ccs || "";
    if (v.pagamento === "Não conferido" && /conferid/i.test(i.conferencia || "")) v.pagamento = "Conferido";
    return v;
  },

  chavePlanos(planos) {
    return (planos || []).map((p) => p.id || p.nome).sort().join("|");
  },

  planosTexto(planos) {
    return (planos || []).map((p) => [p.id, p.nome].filter(Boolean).join(" - ")).join(" + ") || "sem plano";
  },

  /* Motivo que impede o título de ir para lote por causa do rateio ou do plano financeiro. */
  bloqueioRateio(conf) {
    if (!conf || conf.ok) return "";
    return conf.problemas[0] + (conf.problemas.length > 1 ? ` (e mais ${conf.problemas.length - 1} divergência(s) no rateio)` : "");
  },

  /** Centros de custo do título em ordem crescente: % do título e % dentro da obra (rateio Moura Leite × parceiro). */
  ccsCelulaHtml(it) {
    const ccs = (it.ccs || []).slice().sort((a, b) => Number(a.id) - Number(b.id))
      .map((c) => ({ ...c, parceria: (it.ccs || []).length > 1 ? this.ccDeParceriaPeloNome(c.id, c.nome) : c.parceria }));
    const doRateio = {};
    const ausentes = [];
    ((it.rateio && it.rateio.obras) || []).forEach((o) => o.linhas.forEach((l) => {
      if (l.ausente) ausentes.push(l);
      else doRateio[l.id] = { titulo: l.pct, obra: o.pct > 0 ? l.pct * 100 / o.pct : 0, linha: l };
    }));
    const idHtml = (c) => (c.parceria ? `<strong>${this.esc(c.id)}</strong>` : `<span class="gp-cc-outro">${this.esc(c.id)}</span>`);
    const status = (l) => {
      if (!l) return `<span class="gp-muted">—</span>`;
      if (l.ausente) return `<span class="bchk bchk-erro">Falta ✗</span>`;
      if (l.ok === false || l.planoErro) return `<span class="bchk bchk-erro">${l.planoErro && l.ok !== false ? "Plano ✗" : "Rateio ✗"}</span>`;
      return l.ok || (l.ok == null && it.rateio && it.rateio.ok) ? `<span class="bchk bchk-ok">Rateio ✓</span>` : `<span class="gp-muted">—</span>`;
    };
    const linhas = ccs.map((c) => {
      const r = doRateio[c.id];
      return `<tr><td>${idHtml(c)} <span class="gp-cc-pop-nome">${this.esc(c.nome || "")}</span></td>
        <td class="num">${r ? this.pct(r.titulo) : "—"}</td>
        <td class="num">${r ? this.pct(r.obra) : "—"}</td>
        <td>${status(r && r.linha)}</td></tr>`;
    }).concat(ausentes.map((l) => `<tr><td><strong>${this.esc(l.id)}</strong> <span class="gp-cc-pop-nome">${this.esc(l.nome || "")}</span></td>
        <td class="num">—</td><td class="num">${l.padrao != null ? this.pct(l.padrao) : "—"}</td><td>${status(l)}</td></tr>`)).join("");
    const pop = `<table class="gp-cc-pop-tab"><thead><tr><th>Centro de custo</th><th class="num">Rateio título</th><th class="num">Rateio parceria</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table>`;
    return `<span class="gp-cc-lista" onmouseenter="GerarPagamentoApp.ccPopAbrir(this)" onmouseleave="GerarPagamentoApp.ccPopFechar()">${ccs.map(idHtml).join("")}<template>${pop}</template></span>`;
  },

  ccPopAbrir(el) {
    const tpl = el && el.querySelector("template");
    if (!tpl) return;
    let pop = document.getElementById("gp-cc-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "gp-cc-pop";
      pop.className = "gp-cc-pop";
      document.body.appendChild(pop);
    }
    pop.innerHTML = tpl.innerHTML;
    pop.style.display = "block";
    const r = el.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const top = r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  },

  ccPopFechar() {
    const pop = document.getElementById("gp-cc-pop");
    if (pop) pop.style.display = "none";
  },

  rateioSeloHtml(conf) {
    if (!conf || !conf.obras.length || conf.ok) return "";
    const rotulos = [
      conf.erroRateio ? "Rateio fora do padrão" : "",
      conf.erroPlano ? "Plano financeiro diferente" : "",
      conf.semPadrao ? "Sem rateio padrão no cadastro" : ""
    ].filter(Boolean);
    return `<small class="gp-bloq" title="${this.esc(conf.problemas.join("\n"))}">${this.esc((rotulos.length ? rotulos : ["Rateio fora do padrão"]).join(" · "))}</small>`;
  },

  rateioHtml(conf) {
    if (!conf || !conf.obras.length) return "";
    const corpo = conf.obras.map((o) => `
      <tr class="gp-rateio-obra"><td colspan="7">Obra ${this.esc(o.rotulo || o.obra)} · ${this.pct(o.pct)} do título · ${this.money(o.valor)}${o.exclusivo
        ? ` <span>· ${o.exclusivo === "ml" ? "CC exclusivo da Moura Leite: 100% Moura Leite, sem rateio" : `distrato emitido até ${this.dataBr(this.DISTRATO_PARCEIRO_ATE)}: 100% no CC do parceiro, sem rateio`}</span>`
        : (o.padrao
          ? ` <span>· padrão ${this.pct(o.padrao.ml)} Moura Leite${o.padrao.terr ? ` / ${this.pct(o.padrao.terr)} terrenista` : ""}</span>`
          : ` <span class="gp-rateio-x">· sem rateio padrão no cadastro</span>`)}</td></tr>
      ${o.linhas.map((l) => `<tr class="${l.ok === false || l.planoErro ? "is-bad" : ""}">
        <td><strong>${this.esc(l.id)}</strong> <span class="gp-rateio-nome">${this.esc(l.nome)}</span></td>
        <td class="gp-rateio-plano${l.planoErro ? " is-bad" : ""}">${l.planos.length
          ? l.planos.map((p) => `<div><span class="gp-rateio-cod">${this.esc(p.id || "")}</span> ${this.esc(p.nome || "")}</div>`).join("")
          : "—"}</td>
        <td class="num">${this.pct(l.pct)}</td>
        <td class="num">${this.money(l.valor)}</td>
        <td class="num">${o.exclusivo ? "exclusivo" : (l.padrao != null ? this.pct(l.padrao) + " da obra" : "—")}</td>
        <td class="num">${l.esperado != null ? this.money(l.esperado) : "—"}</td>
        <td class="ic">${l.ok == null && !l.planoErro ? "" : (l.ok && !l.planoErro ? `<span class="gp-rateio-ok">✓</span>` : `<span class="gp-rateio-x">✗</span>`)}</td>
      </tr>`).join("")}`).join("");
    const rodape = (conf.ok
      ? `<p class="gp-rateio-msg is-ok">O rateio e o plano financeiro conferem com o padrão cadastrado em Centros de Custo.</p>`
      : `<div class="gp-rateio-msg is-bad"><strong>Título bloqueado para lote até corrigir:</strong>${conf.problemas.map((p) => `<div>${this.esc(p)}</div>`).join("")}</div>`)
      + (conf.avisos.length ? `<div class="gp-rateio-msg is-warn">${conf.avisos.map((p) => `<div>${this.esc(p)}</div>`).join("")}</div>` : "");
    return `<h4>Rateio por centro de custo</h4>
      <table class="gp-rateio">
        <thead><tr><th>Centro de custo</th><th>Plano financeiro</th><th class="num">% do título</th><th class="num">Valor</th><th class="num">Padrão</th><th class="num">Esperado</th><th></th></tr></thead>
        <tbody>${corpo}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${this.pct(conf.obras.reduce((t, o) => t + o.pct, 0))}</td><td class="num">${this.money(conf.total)}</td><td colspan="3"></td></tr></tfoot>
      </table>${rodape}`;
  },

  ccsHtml(r) {
    const ccs = (r.ccsTitulo && r.ccsTitulo.length ? r.ccsTitulo : [{ id: r.ccId, nome: r.ccNome, parceria: true }])
      .slice().sort((a, b) => Number(a.id) - Number(b.id));
    const semObra = ccs.filter((c) => c.parceria && !ccs.some((o) => !o.parceria && this.obra(o.id) === this.obra(c.id)));
    const nomes = ccs.map((c) => `${c.id} ${c.nome}${c.rateio != null ? ` · ${this.pct(c.rateio)}` : ""}${c.parceria ? " (parceria)" : ""}`).join("\n");
    const conf = this.conferirRateio(ccs, r.tituloValor != null ? r.tituloValor : r.valor, this.contextoRateio(r));
    return `<span title="${this.esc(nomes)}">${ccs.map((c) => (c.parceria ? `<strong>${this.esc(c.id)}</strong>` : `<span class="gp-cc-outro">${this.esc(c.id)}</span>`)).join(" / ")} <span class="gp-muted">${this.esc(ccs.length === 1 ? ccs[0].nome : "rateado")}</span></span>`
      + (semObra.length ? `<small class="gp-bloq">Sem o CC da obra de ${semObra.map((c) => this.esc(c.id)).join(", ")}</small>` : "")
      + this.rateioSeloHtml(conf);
  },

  statusHtml(r) {
    const conta = r.contasEsperadas && r.contasEsperadas.length ? r.contasEsperadas.join(" / ") : (r.esperada ? (r.esperada.numero || r.esperada.id) : "");
    const alvos = (r.contasEsperadas || [conta]).map((c) => this.numConta(c));
    const outras = r.contas.filter((c) => !alvos.includes(this.numConta(c)));
    if (r.status === "ok") return `<span class="gp-pill gp-ok">Pago na conta de parceria</span>`;
    if (r.status === "outra") return `<span class="gp-pill gp-bad">Pago em outra conta</span><small>Saiu pela C/C ${this.esc(outras.join(", "))} · esperado C/C ${this.esc(conta)}</small>`;
    if (r.status === "sem-conta") return `<span class="gp-pill gp-bad">CC sem conta de parceria</span><small>Pago pela C/C ${this.esc(r.contas.join(", "))}</small>`;
    if (r.status === "pago-sem-conta") return `<span class="gp-pill gp-wait">Pago</span><small>O Sienge não informou a conta da baixa</small>`;
    return `<span class="gp-pill gp-wait">Em aberto</span><small>Deve sair pela C/C ${this.esc(conta || "—")}</small>`;
  },

  titulosHtml() {
    const s = this.state;
    if (s.consultando) return this.carregandoHtml();
    if (s.erroTitulos) return `<div style="padding:18px 20px;color:#b91c1c;">${this.esc(s.erroTitulos)}</div>`;
    if (!s.consultado) {
      return `<div style="padding:22px 20px;color:#64748b;font-size:0.85rem;">Escolha o período e clique em <strong>Buscar títulos</strong> para conferir em qual conta os títulos dos centros de custo de parceiro foram pagos.</div>`;
    }
    this.reclassificar();
    const nAbertos = new Set(s.titulos.filter((r) => !r.pago && r.aPagar > 0.009).map((r) => this.chaveTitulo(r.titulo, r.parcela))).size;
    const visoes = `<div class="gp-visoes">
        <button type="button" class="gp-visao${s.visao !== "lotes" ? " is-active" : ""}" onclick="GerarPagamentoApp.setVisao('titulos')"><i data-lucide="list" style="width:14px;"></i> Títulos</button>
        <button type="button" class="gp-visao${s.visao === "lotes" ? " is-active" : ""}" onclick="GerarPagamentoApp.setVisao('lotes')"><i data-lucide="layers" style="width:14px;"></i> Lotes por conta e dia <b>${nAbertos}</b></button>
      </div>`;
    if (s.visao === "lotes") return visoes + this.lotesHtml();
    const todos = this.titulosAgrupados();
    const cont = { todos: todos.length, ok: 0, outra: 0, aberto: 0 };
    todos.forEach((r) => { cont[this.grupoStatus(r)] += 1; });
    const visiveis = s.filtro === "todos" ? todos : todos.filter((r) => this.grupoStatus(r) === s.filtro);
    const filtros = this.FILTROS.map((f) => `<button type="button" class="gp-filtro${s.filtro === f.id ? " is-active" : ""}${f.id === "outra" ? " is-bad" : ""}" onclick="GerarPagamentoApp.setFiltro('${f.id}')">${this.esc(f.label)} <b>${cont[f.id]}</b></button>`).join("");
    const linhas = visiveis.length
      ? visiveis.map((r) => `<tr class="gp-click${r.status === "outra" || r.status === "sem-conta" ? " gp-row-bad" : ""}" onclick="GerarPagamentoApp.abrirResumo('${this.esc(this.chaveTitulo(r.titulo, r.parcela))}')" title="Clique para ver o resumo do título">
          <td>${this.dataBr(r.vencimento)}</td>
          <td>${r.pagamento ? this.dataBr(r.pagamento) : "—"}</td>
          <td><strong>${this.esc(r.titulo)}</strong>${r.parcela ? `<span class="gp-muted"> / ${this.esc(r.parcela)}</span>` : ""}</td>
          <td title="${this.esc(r.credor)}">${this.esc(r.credor)}</td>
          <td>${this.esc(r.documento || "—")}</td>
          <td class="gp-status">${this.ccsHtml(r)}</td>
          <td style="text-align:right;">${this.money(r.valor)}</td>
          <td class="gp-status">${this.statusHtml(r)}</td>
        </tr>`).join("")
      : `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">Nenhum título ${s.filtro === "todos" ? "dos centros de custo de parceiro" : "neste filtro"} no período.</td></tr>`;
    return `${visoes}
      <div class="gp-filtros">${filtros}</div>
      ${s.previsoesIgnoradas ? `<p class="gp-nota">${s.previsoesIgnoradas} previsão(ões) ignorada(s) — só entram títulos que não são previsão.</p>` : ""}
      <div style="max-height:56vh;overflow:auto;">
        <table class="gp-table gp-titulos">
          <colgroup><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:17%"><col style="width:10%"><col style="width:18%"><col style="width:10%"><col style="width:20%"></colgroup>
          <thead><tr>
            <th>Vencimento</th><th>Pagamento</th><th>Título</th><th>Credor</th><th>Documento</th><th>Centro de custo</th><th style="text-align:right;">Valor</th><th>Conta</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  },

  paintTitulos() {
    const box = document.getElementById("gp-titulos-box");
    if (box) box.innerHTML = this.titulosHtml();
    if (window.lucide) lucide.createIcons();
  },

  render() {
    const root = document.getElementById("gerar-pagamento-root");
    if (!root) return;
    const s = this.state;
    const list = this.parceiros();
    const semConta = list.filter((cc) => !this.contaParceriaDe(cc)).length;
    const busy = s.consultando;
    const body = s.loading
      ? `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 0;color:var(--color-text-muted);">
          <div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <span style="font-weight:500;">Carregando centros de custo de parceiro…</span>
        </div>`
      : (s.error
        ? `<div class="crm-card" style="padding:20px;color:#b91c1c;">${this.esc(s.error)}</div>`
        : `
        <style>
          #gerar-pagamento-root .gp-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
          #gerar-pagamento-root .gp-table thead th { position:sticky; top:0; background:#1b8253; color:#fff; padding:12px; text-align:left; font-weight:600; z-index:2; white-space:nowrap; }
          #gerar-pagamento-root .gp-table tbody tr { border-bottom:1px solid #e0e5e0; }
          #gerar-pagamento-root .gp-table tbody tr:nth-child(even) { background:#f4f6f4; }
          #gerar-pagamento-root .gp-table td { padding:10px 12px; vertical-align:middle; }
          #gerar-pagamento-root .gp-titulos { table-layout:fixed; min-width:1100px; font-size:0.82rem; }
          #gerar-pagamento-root .gp-titulos td { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          #gerar-pagamento-root .gp-titulos td.gp-status { white-space:normal; }
          #gerar-pagamento-root .gp-titulos tbody tr.gp-row-bad { background:#fef2f2; }
          #gerar-pagamento-root .gp-muted { color:#64748b; font-weight:400; }
          #gerar-pagamento-root .gp-pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700; }
          #gerar-pagamento-root .gp-ok { background:#dcfce7; color:#105436; }
          #gerar-pagamento-root .gp-bad { background:#fee2e2; color:#b91c1c; }
          #gerar-pagamento-root .gp-wait { background:#e2e8f0; color:#334155; }
          #gerar-pagamento-root .gp-status small { display:block; margin-top:3px; color:#64748b; font-size:0.72rem; line-height:1.3; }
          #gerar-pagamento-root .gp-busca { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; padding:16px 20px; border-bottom:1px solid #e2e8f0; }
          #gerar-pagamento-root .gp-busca .form-group { margin:0; display:flex; flex-direction:column; gap:4px; }
          #gerar-pagamento-root .gp-busca label { font-size:0.75rem; font-weight:700; color:#475569; }
          #gerar-pagamento-root .gp-busca .form-control { height:38px; min-width:150px; }
          #gerar-pagamento-root .gp-filtros { display:flex; gap:8px; flex-wrap:wrap; padding:14px 20px 4px; }
          #gerar-pagamento-root .gp-filtro { height:32px; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:0.8rem; font-weight:600; cursor:pointer; }
          #gerar-pagamento-root .gp-filtro b { margin-left:4px; }
          #gerar-pagamento-root .gp-filtro.is-active { background:#105436; border-color:#105436; color:#fff; }
          #gerar-pagamento-root .gp-filtro.is-bad.is-active { background:#b91c1c; border-color:#b91c1c; }
          #gerar-pagamento-root .gp-nota { margin:6px 20px 10px; color:#64748b; font-size:0.78rem; }
          #gerar-pagamento-root .gp-abas-lote { margin:6px 20px 4px; }
          #gerar-pagamento-root .gp-warn { background:#ffedd5; color:#c2410c; }
          #gerar-pagamento-root .btn:disabled { opacity:0.55; cursor:not-allowed; }
          #gerar-pagamento-root .gp-visoes { display:flex; gap:8px; padding:14px 20px 0; }
          #gerar-pagamento-root .gp-visao { height:34px; padding:0 14px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; font-size:0.82rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
          #gerar-pagamento-root .gp-visao.is-active { background:#105436; border-color:#105436; color:#fff; }
          #gerar-pagamento-root .gp-lote { margin:12px 20px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#fff; }
          #gerar-pagamento-root .gp-lote-sem { border-color:#fecaca; }
          #gerar-pagamento-root .gp-lote-h { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 14px; background:#f0f7f3; border-bottom:1px solid #e2e8f0; }
          #gerar-pagamento-root .gp-lote-h[role="button"] { cursor:pointer; user-select:none; }
          #gerar-pagamento-root .gp-lote-h[role="button"]:hover { filter:brightness(0.98); }
          #gerar-pagamento-root .gp-lote:not(.is-open) .gp-lote-h { border-bottom:0; }
          #gerar-pagamento-root .gp-lote-tit { display:flex; align-items:center; gap:10px; min-width:0; }
          #gerar-pagamento-root .gp-lote-seta { width:18px; height:18px; color:#105436; flex-shrink:0; transition:transform .15s ease; }
          #gerar-pagamento-root .gp-lote.is-open .gp-lote-seta { transform:rotate(90deg); }
          #gerar-pagamento-root .gp-cc-outro { color:#64748b; font-weight:600; }
          #gerar-pagamento-root .gp-aut { display:inline-flex; align-items:center; gap:2px; flex-wrap:wrap; }
          #gerar-pagamento-root .gp-aut-seta { width:12px; height:12px; color:#94a3b8; }
          #gerar-pagamento-root .gp-cc-lista { display:inline-flex; flex-direction:column; gap:1px; cursor:help; font-size:0.85rem; }
          .gp-cc-pop { display:none; position:fixed; z-index:3000; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 10px 30px rgba(15,23,42,.18); padding:8px 10px; pointer-events:none; }
          .gp-cc-pop-tab { border-collapse:collapse; font-size:0.8rem; color:#1e293b; }
          .gp-cc-pop-tab th { text-align:left; font-size:0.68rem; text-transform:uppercase; color:#64748b; font-weight:700; padding:4px 10px; border-bottom:1px solid #e2e8f0; white-space:nowrap; }
          .gp-cc-pop-tab td { padding:5px 10px; border-bottom:1px solid #f1f5f9; white-space:nowrap; }
          .gp-cc-pop-tab tr:last-child td { border-bottom:0; }
          .gp-cc-pop-tab .num { text-align:right; }
          .gp-cc-pop-tab .gp-cc-outro { color:#64748b; font-weight:600; }
          .gp-cc-pop-nome { color:#64748b; font-size:0.74rem; margin-left:4px; }
          .gp-cc-pop .bchk { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:700; }
          #gerar-pagamento-root .gp-bloq, #gerar-pagamento-root .gp-status small.gp-bloq { color:#b91c1c; font-weight:700; }
          #gerar-pagamento-root .gp-lote-sem .gp-lote-h { background:#fef2f2; }
          #gerar-pagamento-root .gp-lote-conta { font-weight:800; color:#105436; font-size:0.92rem; }
          #gerar-pagamento-root .gp-lote-sem .gp-lote-conta { color:#b91c1c; }
          #gerar-pagamento-root .gp-lote-dia { display:inline-flex; align-items:center; gap:4px; margin-left:8px; padding:2px 10px; border-radius:999px; background:#105436; color:#fff; font-size:0.78rem; font-weight:700; vertical-align:middle; }
          #gerar-pagamento-root .gp-lote-feito { opacity:0.8; }
          #gerar-pagamento-root .gp-lote-feito .gp-lote-h { background:#f1f5f9; }
          #gerar-pagamento-root .gp-lote-feito .gp-lote-dia { background:#64748b; }
          #gerar-pagamento-root tr.gp-click { cursor:pointer; }
          #gerar-pagamento-root tr.gp-click:hover td { background:#ecfdf5; }
          #gerar-pagamento-root .gp-valida { display:inline-flex; align-items:center; gap:6px; margin-left:6px; color:#475569; font-weight:600; }
          #gerar-pagamento-root tr.gp-em-lote td { color:#94a3b8; }
          #gerar-pagamento-root tr.gp-em-lote td strong { color:#64748b; }
          #gerar-pagamento-root .gp-lote-h small { color:#64748b; font-size:0.75rem; }
          #gerar-pagamento-root .gp-lote-acoes { display:flex; align-items:center; gap:14px; }
          #gerar-pagamento-root .gp-lote-todos { display:inline-flex; align-items:center; gap:6px; font-size:0.8rem; color:#334155; cursor:pointer; }
          #gerar-pagamento-root .gp-lote-total { font-size:1.05rem; color:#0f172a; min-width:120px; text-align:right; }
          #gerar-pagamento-root .gp-lote .gp-titulos { min-width:1000px; }
        </style>
        <div class="crm-card" style="overflow:hidden;padding:0;">
          <div class="gp-busca">
            <div style="flex:1 1 220px;">
              <h3 style="margin:0 0 4px;color:var(--color-primary);font-size:1rem;">Títulos a pagar dos centros de custo de parceiro</h3>
              <p style="margin:0;color:#64748b;font-size:0.78rem;">Busca pelo vencimento, para programar os lotes. Previsões ficam de fora.${semConta ? ` <b style="color:#b91c1c;">${semConta} centro(s) de parceiro sem conta de parceria cadastrada.</b>` : ""}</p>
            </div>
            <div class="form-group">
              <label>Vencimento de</label>
              <input type="date" class="form-control" value="${this.esc(s.startDate)}" ${busy ? "disabled" : ""}
                onchange="GerarPagamentoApp.onField('startDate', this.value)">
            </div>
            <div class="form-group">
              <label>Até</label>
              <input type="date" class="form-control" value="${this.esc(s.endDate)}" ${busy ? "disabled" : ""}
                onchange="GerarPagamentoApp.onField('endDate', this.value)">
            </div>
            <button type="button" class="btn btn-primary" ${busy ? "disabled" : ""} onclick="GerarPagamentoApp.consultarTitulos()"
              style="height:38px;width:150px;justify-content:center;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="search" style="width:14px;"></i> Buscar títulos
            </button>
          </div>
          <div id="gp-titulos-box">${this.titulosHtml()}</div>
        </div>`);

    root.innerHTML = `
      <div style="display:flex;flex-direction:column;min-height:calc(100vh - 85px);font-family:inherit;">
        <div style="background:#105436;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:12px 12px 0 0;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="wallet" style="width:18px;height:18px;color:#fff;"></i>
            </div>
            <div>
              <h2 style="margin:0;color:#fff;font-size:1.15rem;font-weight:600;">Gerar Pagamento</h2>
              <p style="margin:2px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Lotes de títulos a pagar · sem previsões · conta de parceria no centro de custo</p>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" onclick="GerarPagamentoApp.abrirCentrosCusto()" style="height:36px;">
              Cadastrar conta de parceria
            </button>
            <button type="button" class="btn" onclick="GerarPagamentoApp.load()" style="height:36px;background:#fff;color:#105436;border:none;font-weight:700;">
              <i data-lucide="refresh-cw" style="width:14px;"></i> Atualizar
            </button>
          </div>
        </div>
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:16px 18px;">
          ${body}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
};

window.GerarPagamentoApp = GerarPagamentoApp;
window.contaPagamentoDoCentroCusto = function (input) {
  return GerarPagamentoApp.resolverContaPagamento(input);
};

document.addEventListener("tabChanged", function (e) {
  if (e && e.detail === "gerar-pagamento") GerarPagamentoApp.init();
});
