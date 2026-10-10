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
    tipoData: "D",
    consultando: false,
    consultado: false,
    erroTitulos: "",
    progresso: "",
    titulos: [],
    previsoesIgnoradas: 0,
    filtro: "todos",
    visao: "lotes",
    sel: {},
    selInit: {},
    lotes: [],
    loteSienge: {},
    formaSienge: {},
    pagInfo: {},
    selManual: {},
    validacao: { feitos: 0, total: 0, rodando: false },
    gerandoLote: "",
    lotesAbertos: {},
    credores: {},
    gen: 0
  },

  LOTES_COLLECTION: "pagamento_lotes",
  LOTES_LOCAL: "crm_pagamento_lotes",

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

  isParceiro(cc) {
    if (window.CentrosCustoApp && typeof CentrosCustoApp.isParceiro === "function" && CentrosCustoApp.isParceiro(cc)) return true;
    if (/parce(ir|ri)/i.test(String((cc && cc.name) || ""))) return true;
    return !!this.contaParceriaDe(cc);
  },

  companyIdOf(cc) {
    return cc && (cc.idCompany != null ? cc.idCompany : cc.companyId);
  },

  companyName(id) {
    const hit = this.state.companies.find((c) => String(c.id) === String(id));
    return hit ? hit.name : "";
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
    const el = document.getElementById("gp-progresso");
    if (el) el.textContent = this.state.progresso || "";
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

    const tipo = s.tipoData === "P" ? "P" : "D";
    const api = Object.create(base);
    api.outcomeEndpoint = (start, end, companyId) => "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=" + tipo + "&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false&withBankMovements=true"
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
          this.pintarProgresso();
          const parte = await api.outcomeRange(faixa.start, faixa.end, emp);
          if (Array.isArray(parte)) bills.push.apply(bills, parte);
        }
      }
      if (gen !== s.gen) return;
      this.montarTitulos(base, bills, parceiros);
      s.progresso = "Conferindo lotes já gerados…";
      this.pintarProgresso();
      await Promise.all([this.carregarLotes(), this.carregarLotesSienge(gen)]);
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
        const ja = ccsTitulo.find((x) => x.id === id);
        if (ja) { ja.rateio += rate; return; }
        const cad = ccMap[id] || this.ccDe(id);
        ccsTitulo.push({ id, nome: (cad && cad.name) || c.costCenterName || "", parceria: !!ccMap[id], rateio: rate });
      });
      const tituloAPagar = saldo != null ? Math.max(0, saldo) : (pago ? 0 : original);
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
          documento: [docId, bill.documentNumber].filter(Boolean).join(" "),
          vencimento: String(bill.dueDate || "").slice(0, 10),
          pagamento: datas.length ? datas[datas.length - 1] : "",
          valor: original * fat,
          saldo: saldo,
          ccId: String(cc.id),
          ccNome: cc.name || "",
          esperada: null,
          contas,
          status: ""
        });
      });
    });
    linhas.sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || "") || Number(a.titulo) - Number(b.titulo) || Number(a.parcela) - Number(b.parcela));
    this.state.titulos = linhas;
    this.state.previsoesIgnoradas = previsoes;
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
  },

  /* Parcelas que já estão em lote/pagamento escritural no Sienge. */
  async carregarLotesSienge(gen) {
    const s = this.state;
    if (typeof window.siengeFetchWithRetry !== "function") return;
    const abertos = [...new Set(s.titulos.filter((r) => !r.pago).map((r) => r.titulo))];
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

  /** Motivo que impede o título de entrar em lote (forma de pagamento não conferida ou com possível divergência). */
  bloqueioLote(it) {
    if (it.emLote) return "";
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
      aPagar: r0.tituloAPagar != null ? r0.tituloAPagar : rows.reduce((t, r) => t + (Number(r.aPagar) || 0), 0),
      valor: r0.tituloValor != null ? r0.tituloValor : rows.reduce((t, r) => t + (Number(r.valor) || 0), 0),
      ccs: r0.ccsTitulo && r0.ccsTitulo.length ? r0.ccsTitulo : rows.map((r) => ({ id: r.ccId, nome: r.ccNome, parceria: true }))
    };
  },

  async validarPagamentos(gen) {
    const s = this.state;
    if (typeof window.siengeFetchWithRetry !== "function" || !window.BoletoCheck) return;
    const chaves = [...new Set(s.titulos.filter((r) => !r.pago && r.aPagar > 0.009).map((r) => this.chaveTitulo(r.titulo, r.parcela)))]
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
      companyId: cc ? this.companyIdOf(cc) : "",
      natureza: r.pago ? "pago" : "",
      dataPagamento: r.pagamento || "",
      conta: r.contas && r.contas.length ? "C/C " + r.contas.join(", ") : "",
      situacaoTexto: situacao,
      pagCheck: this.state.pagInfo[chave] ? this.state.pagInfo[chave].check : null
    });
  },

  loteIntegraDe(chave) {
    return this.state.lotes.find((l) => (l.itens || []).some((i) => this.chaveTitulo(i.titulo, i.parcela) === chave)) || null;
  },

  /* Títulos em aberto agrupados por conta de parceria e dia de vencimento (um lote por conta por dia).
     Título com CC de parceria entra inteiro: valor total e todos os CCs do rateio, inclusive os que não são de parceria.
     Se os CCs de parceria do título forem de contas diferentes, cada conta fica só com a sua parte. */
  gruposLote() {
    const grupos = {};
    const abertos = this.state.titulos.filter((r) => !r.pago && r.aPagar > 0.009);
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
      if (!grupos[key]) grupos[key] = { key, contaKey, dia: conta ? dia : "", conta, itens: {}, ordem: [] };
      const g = grupos[key];
      const chave = this.chaveTitulo(r.titulo, r.parcela);
      const inteiro = contasDoTitulo[chave].size === 1 && r.tituloAPagar != null;
      if (!g.itens[chave]) {
        g.itens[chave] = {
          chave, titulo: r.titulo, parcela: r.parcela, credor: r.credor, documento: r.documento,
          vencimento: r.vencimento, valor: 0, aPagar: 0, ccs: [], inteiro
        };
        g.ordem.push(chave);
        if (inteiro) {
          Object.assign(g.itens[chave], {
            valor: r.tituloValor,
            aPagar: r.tituloAPagar,
            ccs: (r.ccsTitulo || []).map((c) => ({ id: c.id, nome: c.nome, parceria: c.parceria, rateio: c.rateio }))
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
        : (g.itens.some((it) => !it.emLote && !it.bloqueio) ? "Marque ao menos um título para gerar o lote." : "Nenhum título deste dia pode entrar em lote: todos têm possível divergência na forma de pagamento. Corrija no Sienge e busque de novo."));
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
      alert("Lote não gerado: há título com possível divergência na forma de pagamento.\n\n" + comBloqueio.slice(0, 8).map((it) => `• ${it.titulo}/${it.parcela || 1} ${it.credor}: ${this.bloqueioLote(it)}`).join("\n"));
      return;
    }
    const total = itens.reduce((t, it) => t + it.aPagar, 0);
    const fora = g.itens.filter((it) => it.bloqueio);
    const alerta = fora.length
      ? `\n\n${fora.length} título(s) deste dia ficam fora por possível divergência na forma de pagamento:\n` + fora.slice(0, 8).map((it) => `• ${it.titulo}/${it.parcela || 1} ${it.credor}: ${it.bloqueio}`).join("\n") + (fora.length > 8 ? `\n• e mais ${fora.length - 8}` : "")
      : "";
    const pergunta = `Gerar lote do dia ${this.dataBr(g.dia)} com ${itens.length} título(s), total de ${this.money(total)}, pela conta ${this.contaLabel(g.conta)}?${alerta}`;
    const okConf = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(pergunta) : confirm(pergunta);
    if (!okConf) {
      s.gerandoLote = "";
      this.paintTitulos();
      return;
    }
    const agora = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const id = "L" + agora.getFullYear() + pad(agora.getMonth() + 1) + pad(agora.getDate()) + "-" + pad(agora.getHours()) + pad(agora.getMinutes()) + pad(agora.getSeconds())
      + "-" + String(g.contaKey || "").replace(/[^\w]/g, "").slice(-6) + "-" + String(g.dia || "").replace(/-/g, "").slice(4);
    let usuario = "Usuário";
    try {
      const u = window.MouraAuth && MouraAuth.getCurrentUser && MouraAuth.getCurrentUser();
      usuario = (u && (u.name || u.email)) || usuario;
    } catch (e) {}
    const lote = JSON.parse(JSON.stringify({
      id,
      criadoEm: agora.toISOString(),
      criadoPor: usuario,
      contaKey: g.contaKey,
      dia: g.dia,
      conta: g.conta,
      total: Math.round(total * 100) / 100,
      itens: itens.map((it) => ({
        titulo: it.titulo, parcela: it.parcela, credor: it.credor, documento: it.documento,
        vencimento: it.vencimento, valor: Math.round(it.aPagar * 100) / 100,
        ccs: it.ccs.map((c) => c.id + " - " + c.nome).join(" / "),
        forma: it.pag ? it.pag.check.forma : "",
        linhaDigitavel: it.pag ? it.pag.check.linhaFmt || "" : "",
        conferencia: it.pag ? it.pag.check.resumo : "Não conferido"
      }))
    }));
    let salvoRemoto = false;
    const fc = window.firebaseCollections;
    if (window.firebaseDb && fc && fc.setDoc) {
      try {
        await fc.setDoc(fc.doc(window.firebaseDb, this.LOTES_COLLECTION, id), lote);
        salvoRemoto = true;
      } catch (e) {
        console.warn("[Gerar Pagamento] salvar lote", e);
      }
    }
    s.lotes = s.lotes.concat([lote]);
    this.salvarLotesLocal(this.lotesLocal().filter((l) => l.id !== id).concat([lote]));
    itens.forEach((it) => { s.sel[it.selKey] = false; });
    this.baixarLoteExcel(lote);
    s.gerandoLote = "";
    this.paintTitulos();
    if (!salvoRemoto) alert("O lote foi gerado e baixado, mas ficou salvo só neste computador (não consegui gravar no Firebase).");
  },

  baixarLoteExcel(loteOuId) {
    const lote = typeof loteOuId === "string" ? this.state.lotes.find((l) => l.id === loteOuId) : loteOuId;
    if (!lote) return;
    if (typeof XLSX === "undefined") {
      alert("A biblioteca de Excel não carregou. Recarregue a página.");
      return;
    }
    const linhas = [
      ["Lote a pagar", lote.id],
      ["Conta de parceria", this.contaLabel(lote.conta)],
      ["Vencimento", lote.dia ? this.dataBr(lote.dia) : ""],
      ["Gerado em", new Date(lote.criadoEm).toLocaleString("pt-BR")],
      ["Gerado por", lote.criadoPor || ""],
      [],
      ["Vencimento", "Título", "Parcela", "Credor", "Documento", "Centro de custo", "Valor a pagar", "Forma de pagamento", "Linha digitável", "Conferência"]
    ];
    (lote.itens || []).forEach((i) => {
      linhas.push([this.dataBr(i.vencimento), Number(i.titulo) || i.titulo, Number(i.parcela) || i.parcela, i.credor, i.documento, i.ccs, Number(i.valor) || 0,
        i.forma || "", i.linhaDigitavel || "", i.conferencia || ""]);
    });
    linhas.push([], ["", "", "", "", "", "Total", Number(lote.total) || 0]);
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 40 }, { wch: 18 }, { wch: 44 }, { wch: 16 }, { wch: 22 }, { wch: 58 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lote");
    const conta = String((lote.conta && (lote.conta.numero || lote.conta.id)) || "").replace(/[^\w-]/g, "");
    XLSX.writeFile(wb, `lote_pagar_${lote.id}${conta ? "_cc" + conta : ""}.xlsx`);
  },

  async excluirLote(id) {
    const lote = this.state.lotes.find((l) => l.id === id);
    if (!lote) return;
    const okConf = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm(`Excluir o lote ${id}? Os títulos voltam a ficar disponíveis para um novo lote.`)
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
    const cards = grupos.map((g) => {
      const sem = g.key === "__sem";
      const marcados = g.itens.filter((it) => it.marcado);
      const total = marcados.reduce((t, it) => t + it.aPagar, 0);
      const disponiveis = g.itens.filter((it) => !it.emLote);
      const liberados = disponiveis.filter((it) => !it.bloqueio);
      const divergentes = disponiveis.filter((it) => it.pag && it.bloqueio).length;
      const todos = liberados.length > 0 && liberados.every((it) => it.marcado);
      const gerando = s.gerandoLote === g.key;
      const conferindo = !!(s.validacao && s.validacao.rodando);
      const jaGerado = !sem && !disponiveis.length;
      const lotesDoDia = this.lotesDoGrupo(g);
      const linhas = g.itens.map((it) => {
        const tag = it.loteIntegra
          ? `<span class="gp-pill gp-ok">No lote ${this.esc(it.loteIntegra.id)}</span>`
          : (it.loteSienge ? `<span class="gp-pill gp-warn">Já em lote no Sienge${it.loteSienge !== "sim" ? " nº " + this.esc(it.loteSienge) : ""}</span>` : `<span class="gp-pill gp-wait">Em aberto</span>`);
        const pagSelo = it.emLote ? `<span class="gp-muted">—</span>` : (window.BoletoCheck ? BoletoCheck.seloHtml(it.pag ? it.pag.check : null) : "");
        return `<tr class="gp-click${it.emLote ? " gp-em-lote" : ""}${it.pag && it.bloqueio ? " gp-row-bad" : ""}" onclick="GerarPagamentoApp.abrirResumo('${this.esc(it.chave)}')" title="Clique para ver o resumo do título">
          <td style="text-align:center;" onclick="event.stopPropagation()"><input type="checkbox" ${it.marcado ? "checked" : ""} ${sem || it.emLote || it.bloqueio || gerando ? "disabled" : ""}
            title="${this.esc(it.emLote ? "Já está em lote; não pode entrar em outro." : (it.bloqueio ? "Bloqueado: " + it.bloqueio : ""))}"
            onchange="GerarPagamentoApp.toggleItem('${this.esc(it.selKey)}')"></td>
          <td>${this.dataBr(it.vencimento)}</td>
          <td><strong>${this.esc(it.titulo)}</strong>${it.parcela ? `<span class="gp-muted"> / ${this.esc(it.parcela)}</span>` : ""}</td>
          <td title="${this.esc(it.credor)}">${this.esc(it.credor)}</td>
          <td>${this.esc(it.documento || "—")}</td>
          <td title="${this.esc(it.ccs.map((c) => `${c.id} ${c.nome}${c.rateio != null ? ` · ${this.pct(c.rateio)}` : ""}${c.parceria ? " (parceria)" : ""}`).join("\n"))}">${it.ccs.map((c) => (c.parceria ? `<strong>${this.esc(c.id)}</strong>` : `<span class="gp-cc-outro">${this.esc(c.id)}</span>`)).join(" / ")} <span class="gp-muted">${this.esc(it.ccs.length === 1 ? it.ccs[0].nome : "rateado")}</span></td>
          <td style="text-align:right;">${this.money(it.aPagar)}</td>
          <td class="gp-status">${pagSelo}</td>
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
              title="${conferindo ? "Aguarde a conferência das formas de pagamento" : (!marcados.length && divergentes ? "Os títulos disponíveis têm possível divergência na forma de pagamento" : "")}"
              style="height:36px;width:150px;justify-content:center;display:inline-flex;align-items:center;gap:6px;">
              ${gerando ? '<span class="btn-spin"></span> Gerando…' : '<i data-lucide="layers" style="width:14px;"></i> Gerar lote'}
            </button>
          </div>`)}
        </div>
        <div class="gp-lote-corpo" style="overflow:auto;"${aberto ? "" : " hidden"}>
          <table class="gp-table gp-titulos">
            <colgroup><col style="width:3%"><col style="width:8%"><col style="width:8%"><col style="width:19%"><col style="width:10%"><col style="width:17%"><col style="width:9%"><col style="width:12%"><col style="width:14%"></colgroup>
            <thead><tr><th></th><th>Vencimento</th><th>Título</th><th>Credor</th><th>Documento</th><th>Centro de custo</th><th style="text-align:right;">A pagar</th><th>Pagamento</th><th>Situação</th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      </div>`;
    }).join("");
    const chaves = new Set(s.titulos.map((r) => this.chaveTitulo(r.titulo, r.parcela)));
    const gerados = s.lotes
      .filter((l) => (l.itens || []).some((i) => chaves.has(this.chaveTitulo(i.titulo, i.parcela))))
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const geradosHtml = gerados.length ? `<div class="gp-lote">
        <div class="gp-lote-h"><div><div class="gp-lote-conta">Lotes gerados com títulos deste período</div></div></div>
        <table class="gp-table gp-titulos">
          <colgroup><col style="width:20%"><col style="width:10%"><col style="width:24%"><col style="width:7%"><col style="width:11%"><col style="width:13%"><col style="width:15%"></colgroup>
          <thead><tr><th>Lote</th><th>Vencimento</th><th>Conta</th><th>Títulos</th><th style="text-align:right;">Total</th><th>Gerado</th><th></th></tr></thead>
          <tbody>${gerados.map((l) => `<tr>
            <td><strong>${this.esc(l.id)}</strong></td>
            <td>${l.dia ? this.dataBr(l.dia) : this.esc([...new Set((l.itens || []).map((i) => this.dataBr(i.vencimento)))].join(", "))}</td>
            <td title="${this.esc(this.contaLabel(l.conta))}">${this.esc(this.contaLabel(l.conta))}</td>
            <td>${(l.itens || []).length}</td>
            <td style="text-align:right;">${this.money(l.total)}</td>
            <td title="${this.esc(l.criadoPor || "")}">${new Date(l.criadoEm).toLocaleDateString("pt-BR")} · ${this.esc(String(l.criadoPor || "").split(" ")[0])}</td>
            <td style="text-align:right;white-space:nowrap;">
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
    return `<p class="gp-nota">Títulos em aberto separados por conta de parceria e dia de vencimento: um lote por conta por dia. Título que já está em lote (no Integra ou no Sienge) não entra em outro. Clique na linha para ver o resumo do título. ${progressoPag}</p>${cards}${geradosHtml}`;
  },

  grupoStatus(r) {
    if (r.status === "ok") return "ok";
    if (r.status === "outra" || r.status === "sem-conta") return "outra";
    return "aberto";
  },

  statusHtml(r) {
    const conta = r.esperada ? (r.esperada.numero || r.esperada.id) : "";
    const outras = r.contas.filter((c) => this.numConta(c) !== this.numConta(conta));
    if (r.status === "ok") return `<span class="gp-pill gp-ok">Pago na conta de parceria</span>`;
    if (r.status === "outra") return `<span class="gp-pill gp-bad">Pago em outra conta</span><small>Saiu pela C/C ${this.esc(outras.join(", "))} · esperado C/C ${this.esc(conta)}</small>`;
    if (r.status === "sem-conta") return `<span class="gp-pill gp-bad">CC sem conta de parceria</span><small>Pago pela C/C ${this.esc(r.contas.join(", "))}</small>`;
    if (r.status === "pago-sem-conta") return `<span class="gp-pill gp-wait">Pago</span><small>O Sienge não informou a conta da baixa</small>`;
    return `<span class="gp-pill gp-wait">Em aberto</span><small>Deve sair pela C/C ${this.esc(conta || "—")}</small>`;
  },

  titulosHtml() {
    const s = this.state;
    if (s.consultando) {
      return `<div style="text-align:center;padding:30px;color:#64748b;">
        <div class="spinner" style="margin:0 auto 12px;"></div>
        <p id="gp-progresso" style="margin:0;">${this.esc(s.progresso)}</p>
      </div>`;
    }
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
    const todos = s.titulos;
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
          <td title="${this.esc(r.ccNome)}"><strong>${this.esc(r.ccId)}</strong> <span class="gp-muted">${this.esc(r.ccNome)}</span></td>
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

  rowsHtml() {
    const list = this.parceiros();
    if (!list.length) {
      return `<tr><td colspan="5" style="text-align:center;padding:28px;color:#64748b;">
        Nenhum centro de custo de parceiro. Cadastre a conta de parceria em Centros de Custo.
      </td></tr>`;
    }
    return list.map((cc) => {
      const empId = this.companyIdOf(cc);
      const conta = this.contaParceriaDe(cc);
      const status = conta
        ? `<span style="color:#105436;font-weight:700;">${this.esc(this.contaLabel(conta))}</span>`
        : `<span style="color:#b91c1c;font-weight:700;">Sem conta — cadastre em Centros de Custo</span>`;
      return `<tr>
        <td>${this.esc(empId || "-")}</td>
        <td><strong>${this.esc(cc.id)}</strong></td>
        <td>${this.esc(cc.name || "")}</td>
        <td>${this.esc(this.companyName(empId) || "")}</td>
        <td>${status}</td>
      </tr>`;
    }).join("");
  },

  render() {
    const root = document.getElementById("gerar-pagamento-root");
    if (!root) return;
    const s = this.state;
    const list = this.parceiros();
    const semConta = list.filter((cc) => !this.contaParceriaDe(cc)).length;
    const busy = s.consultando;
    const body = s.loading
      ? `<div style="text-align:center;padding:40px;color:#64748b;">
          <div class="spinner" style="margin:0 auto 12px;"></div>
          <p>Carregando centros de custo de parceiro…</p>
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
          #gerar-pagamento-root .gp-bloq { color:#b91c1c; }
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
        <div class="crm-card" style="padding:18px 20px;margin-bottom:16px;">
          <h3 style="margin:0 0 8px;color:var(--color-primary);font-size:1rem;">Conta de parceria</h3>
          <p style="margin:0;color:#475569;font-size:0.85rem;line-height:1.5;">
            Centros de custo com <strong>parceiro/parceria</strong> no nome ou com conta de parceria cadastrada.
            Quando o título a pagar tiver um desses centros de custo, o pagamento sai pela
            <strong>conta de parceria</strong> cadastrada no próprio centro de custo — não pela conta padrão da empresa.
          </p>
          <p style="margin:10px 0 0;color:#64748b;font-size:0.8rem;">
            ${list.length} centro(s) de parceiro ·
            ${semConta ? `<span style="color:#b91c1c;font-weight:700;">${semConta} sem conta cadastrada</span>` : `<span style="color:#105436;font-weight:700;">todos com conta</span>`}
          </p>
        </div>
        <div class="crm-card" style="overflow:hidden;padding:0;">
          <div style="max-height:40vh;overflow:auto;">
            <table class="gp-table">
              <thead>
                <tr>
                  <th style="width:90px;">Empresa</th>
                  <th style="width:80px;">ID CC</th>
                  <th>Centro de custo</th>
                  <th style="min-width:180px;">Nome da empresa</th>
                  <th style="min-width:220px;">Conta de parceria</th>
                </tr>
              </thead>
              <tbody>${this.rowsHtml()}</tbody>
            </table>
          </div>
        </div>
        <div class="crm-card" style="overflow:hidden;padding:0;margin-top:16px;">
          <div class="gp-busca">
            <div style="flex:1 1 220px;">
              <h3 style="margin:0 0 4px;color:var(--color-primary);font-size:1rem;">Títulos a pagar dos centros de custo de parceiro</h3>
              <p style="margin:0;color:#64748b;font-size:0.78rem;">Confere se o pagamento saiu pela conta de parceria cadastrada. Previsões ficam de fora.</p>
            </div>
            <div class="form-group">
              <label>Data de</label>
              <select class="form-control" ${busy ? "disabled" : ""} onchange="GerarPagamentoApp.onField('tipoData', this.value)">
                <option value="D" ${s.tipoData !== "P" ? "selected" : ""}>Vencimento</option>
                <option value="P" ${s.tipoData === "P" ? "selected" : ""}>Pagamento</option>
              </select>
            </div>
            <div class="form-group">
              <label>De</label>
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
