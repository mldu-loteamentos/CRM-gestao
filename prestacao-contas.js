// Prestação de Contas — DFC Padrão (cadastro de visões) × caixa/banco Sienge × parametrização de parceiro

const PrestacaoContasApp = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() === 0 ? 12 : new Date().getMonth(),
  companyId: "1",
  costCenterIds: ["13600", "13601"],
  partnershipId: "",
  ccSearch: "",
  loading: false,
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
  aba: "receb",
  conferencias: null,
  confFiltro: "",
  confAberta: "",
  guias: {},
  rastreio: null,
  GUIAS_CACHE: "crm_pcx_guias_v1",

  init() {
    if (this.month === 12 && new Date().getMonth() === 0) this.year = new Date().getFullYear() - 1;
    const companies = (window.AppState && AppState.companies) || [];
    if (companies.length && !companies.some(c => String(c.id) === String(this.companyId))) {
      this.companyId = String(companies[0].id);
    }
    this.ensureDfcReady();
    this.ensureCategories();
    if (typeof ParametrizacaoParceiroApp !== "undefined" && (!ParametrizacaoParceiroApp.items || !ParametrizacaoParceiroApp.items.length)) {
      ParametrizacaoParceiroApp.loadItems().then(() => {
        if (this.movements.length) this.conferencias = this.montarConferencia();
        this.render();
      }).catch(() => {});
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
    this.companyId = String(part.companyId);
    const obras = Array.isArray(part.obras) && part.obras.length ? part.obras : [];
    this.costCenterIds = [...new Set(obras.flatMap(o => (o.costCenters || []).filter(c => c.inAccount).map(c => String(c.id))))];
    this.render();
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
    return all.filter(cc => !this.companyId || String(cc.companyId) === String(this.companyId) || cc.companyId == null);
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
    this.aba = ["receb", "pag", "dfc"].includes(id) ? id : "receb";
    this.confFiltro = "";
    this.confAberta = "";
    this.render();
  },

  setConfFiltro(status) {
    this.confFiltro = this.confFiltro === status ? "" : status;
    this.confAberta = "";
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

  obraDe(id) {
    const d = String(id || "").replace(/\D/g, "");
    return d.length >= 5 ? d.slice(0, -2) : d;
  },

  ccNome(id) {
    const all = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    const cc = all.find(c => String(c.id) === String(id));
    return (cc && cc.name) || "";
  },

  fmtPct(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
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
        this.rastreio = { msg: `Rastreando a origem das guias: ${feitas} de ${candidatas.length} nota(s)…` };
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
            billId, doc: nota.doc, credor: nota.credor, imposto: String(t.taxId || "").toUpperCase(),
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
    const vazio = { receitas: [], despesas: [] };
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
        if (!obra) return;
        const conta = String(fc.financialCategoryId || "").trim();
        const nat = this.naturezaConta(conta, sinal);
        const k = obra + "|" + nat;
        const g = grupos[k] || (grupos[k] = { obra, nat, porCc: {}, contas: [], foraTotal: 0, guia: null });
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
              origem: { doc: it.doc, credor: it.credor, imposto: it.imposto, billId: it.billId }
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
        if (total > 0.004) {
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
        }
        const motivos = [...new Set(g.contas.filter(c => !c.amarrada).map(c => c.motivo))];
        const row = {
          key: idx + "|" + g.obra + "|" + g.nat,
          data: String(mov.bankMovementDate || mov.paymentDate || "").slice(0, 10),
          historico: txt(mov.bankMovementHistoricName) || txt(mov.documentIdentificationName) || "—",
          pessoa: txt(mov.clientName) || txt(mov.creditorName),
          titulo: txt(mov.billId || mov.billPayableId || mov.billReceivableId || mov.payableBillId || mov.receivableBillId || mov.titleId),
          parcela: txt(mov.installmentId || mov.installmentNumber || mov.installment),
          documento: [txt(mov.documentIdentificationId || mov.documentId), txt(mov.documentIdentificationNumber || mov.documentNumber)].filter(Boolean).join(" "),
          contaBanco: txt(mov.accountNumber),
          obra: g.obra,
          total: totalGeral,
          totalRateio: total,
          foraTotal: g.foraTotal,
          linhas,
          contas: g.contas,
          guia: g.guia,
          motivo: motivos.join(" · "),
          status
        };
        (g.nat === "despesa" ? despesas : receitas).push(row);
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
    return { receitas, despesas };
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
          factor = og.itens.reduce((s, it) => s + it.valor * PP.partnershipAmountFactor(part, obra, it.conta), 0) / og.soma;
          if (!(factor > 0)) return null;
        } else if (obra) {
          if (!PP.accountEntersPartnership(part, obra, categoryId)) return null;
          factor = PP.partnershipAmountFactor(part, obra, categoryId);
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
    this.loading = true;
    this.error = "";
    this.rastreio = null;
    this.selectedAccount = null;
    this.render();
    const { start, end } = this.periodBounds();
    try {
      await this.ensureCategories();
      this.ensureDfcReady();
      if (!window.SiengeApiService || typeof SiengeApiService.getBankMovements !== "function") {
        throw new Error("API de caixa e banco indisponível.");
      }
      this.movements = await SiengeApiService.getBankMovements(start, end, {
        selectionType: "M",
        companyId: this.companyId,
        costCentersId: this.costCenterIds
      });
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
      this.rebuildFromMovements();
    } catch (err) {
      console.error("[Prestação de Contas]", err);
      this.error = err && err.message ? err.message : "Falha ao consultar a API de movimento bancário.";
      this.movements = [];
      this.lines = [];
    } finally {
      this.loading = false;
      this.render();
    }
  },

  toggle(id) {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.rebuildFromMovements();
    this.render();
  },

  openAccount(id) {
    this.selectedAccount = id;
    const nk = this.normAccountKey(id);
    const acc = (this.accountIndex && (this.accountIndex[id] || this.accountIndex[nk])) || null;
    this.accountMovements = acc ? acc.items : [];
    this.render();
  },

  render() {
    const root = document.getElementById("prestacao-contas-root");
    if (!root) return;
    const prevScroll = document.getElementById("pc-conf-scroll");
    const prevTop = prevScroll ? prevScroll.scrollTop : 0;
    const companies = (window.AppState && AppState.companies) || [];
    const partnerships = (typeof ParametrizacaoParceiroApp !== "undefined" && ParametrizacaoParceiroApp.items) || [];
    const conf = this.conferencias || { receitas: [], despesas: [] };
    const nFora = (rows) => (rows || []).filter(r => r.status === "fora").length;
    const pad = n => String(n).padStart(2, "0");
    const aba = this.aba;
    const tab = (id, icon, txt, count) => `<button type="button" role="tab" aria-selected="${aba === id}" class="ml-tab${aba === id ? " is-active" : ""}" onclick="PrestacaoContasApp.setAba('${id}')"><i data-lucide="${icon}"></i> ${txt}${count ? ` <span class="ml-tab-count">${count}</span>` : ""}</button>`;
    const ccs = this.costCenters();

    root.innerHTML = `
      <div class="pcx-page">
        <div class="cc-toolbar pcx-toolbar">
          ${partnerships.length ? `<label class="pcx-field pcx-field-parc">
            <span class="ml-emp-filter-label">Parceria</span>
            <select class="pcx-input" onchange="PrestacaoContasApp.applyPartnership(this.value)">
              <option value="">Todas (opcional)</option>
              ${partnerships.map(p => {
                const obras = (p.obras && p.obras.map(o => o.code).filter(Boolean).join(", ")) || p.obraCode || "";
                return `<option value="${this.esc(p.id)}" ${this.partnershipId === p.id ? "selected" : ""}>${this.esc(p.partnerName)}${obras ? " · obras " + this.esc(obras) : ""}</option>`;
              }).join("")}
            </select>
          </label>` : ""}
          <label class="pcx-field pcx-field-emp">
            <span class="ml-emp-filter-label">Empresa</span>
            <select class="pcx-input" onchange="PrestacaoContasApp.companyId=this.value;PrestacaoContasApp.render()">
              ${companies.map(c => `<option value="${this.esc(c.id)}" ${String(c.id) === String(this.companyId) ? "selected" : ""}>${this.esc(c.id)} - ${this.esc(c.name)}</option>`).join("") || '<option value="1">1</option>'}
            </select>
          </label>
          <div class="tvig-filter-slot tvig-comp-slot">
            <label class="tvig-comp-label" for="pc-comp">Mês de referência</label>
            <input type="month" id="pc-comp" class="tvig-comp-input" title="Consulta pela data de pagamento" value="${this.year}-${pad(this.month)}" onchange="PrestacaoContasApp.setCompetencia(this.value)">
          </div>
          <div class="cc-toolbar-actions">
            <button type="button" class="btn btn-outline cc-atualizar" onclick="switchTab('plano-financeiro','Plano Financeiro e Visões')" title="Cadastro de visões DFC">
              <i data-lucide="settings-2"></i> Visões DFC
            </button>
            <button type="button" class="btn btn-primary cc-atualizar" onclick="PrestacaoContasApp.load()" ${this.loading ? "disabled" : ""}>
              ${this.loading
                ? '<span class="pcx-spin"></span> Consultando Sienge...'
                : '<i data-lucide="refresh-cw"></i> Carregar'}
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

        ${this.error ? `<div class="pcx-alert is-error">${this.esc(this.error)}</div>` : ""}
        ${this.rastreio ? `<div class="pcx-alert ${this.rastreio.erro ? "is-warn" : "is-info"}">${this.rastreio.erro ? "" : '<span class="pcx-spin"></span>'}<span id="pc-rastreio">${this.esc(this.rastreio.msg)}</span></div>` : ""}

        <div class="ml-tabs pcx-tabs" role="tablist">
          ${tab("receb", "arrow-down-circle", "Recebimentos", nFora(conf.receitas))}
          ${tab("pag", "arrow-up-circle", "Pagamentos", nFora(conf.despesas))}
          ${tab("dfc", "line-chart", "DFC")}
        </div>

        ${aba === "dfc" ? this.dfcHtml() : this.conferirHtml(aba === "pag" ? "despesas" : "receitas")}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    const novoScroll = document.getElementById("pc-conf-scroll");
    if (novoScroll && prevTop) novoScroll.scrollTop = prevTop;
  },

  dfcHtml() {
    const { start, end, label } = this.periodBounds();
    const monthLabel = label.charAt(0).toUpperCase() + label.slice(1);
    const visao = this.visao();
    const unmatched = this.unmatchedInfo || { total: 0, samples: [] };
    const hasUnmatched = Math.abs(Number(unmatched.total) || 0) > 0.005;
    const part = this.activePartnership();
    return `
      <div class="pcx-resumo">
        <div class="pcx-ajuda" style="margin:0;">
          Visão <strong>${this.esc(visao.name || "DFC Padrão")}</strong> · realizado no caixa/banco Sienge
          ${part ? ` · parceiro <strong>${this.esc(part.partnerName || "")}</strong>` : ""}
          · ${start.split("-").reverse().join("/")} a ${end.split("-").reverse().join("/")}
        </div>
      </div>
      ${hasUnmatched ? `<div class="pcx-alert is-warn">
        <span><strong>${this.fmt(unmatched.total)}</strong> em contas ainda não alocadas na visão DFC Padrão.</span>
        <button type="button" class="btn btn-outline" style="height:30px;font-size:0.75rem;" onclick="switchTab('plano-financeiro','Plano Financeiro e Visões')">Alocar no Apoio</button>
      </div>` : ""}
      <div class="pcx-kpis">
        ${this.kpi("Receitas", this.totals.receitas, "#16a34a")}
        ${this.kpi("Custos e despesas", this.totals.custosDespesas, "#dc2626")}
        ${this.kpi("GCO / Variação de caixa", this.totals.gco, "#0f172a")}
        ${this.kpi("Movimentos", this.movements.length, "#0369a1", true)}
      </div>
      <div class="cc-scroll pcx-scroll">
        <table class="custom-table pcx-dfc-table">
          <thead>
            <tr>
              <th style="width:140px;">Código</th>
              <th>Conta</th>
              <th style="text-align:right;">${monthLabel}</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${this.lines.length ? this.lines.map(row => this.renderRow(row)).join("") : `
              <tr><td colspan="4" class="pcx-vazio">
                ${this.loading ? "Carregando movimentos de caixa..." : "Clique em Carregar para consultar o Sienge."}
              </td></tr>`}
          </tbody>
        </table>
      </div>
      ${this.selectedAccount ? this.renderAccountDetail() : ""}`;
  },

  seloRateio(status, motivo) {
    const txt = { ok: "Conferido", fora: "Fora do padrão", sem: "Sem % no centro", na: "Sem rateio" }[status] || "—";
    const tip = status === "na" ? (motivo || "Conta do plano financeiro sem amarração nas Configurações") : "";
    return `<span class="pcx-selo is-${status}"${tip ? ` title="${this.esc(tip)}"` : ""}>${txt}</span>`;
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

  conferirHtml(lado) {
    const conf = this.conferencias || { receitas: [], despesas: [] };
    const todas = conf[lado] || [];
    const ehRec = lado === "receitas";
    const cor = ehRec ? "#15803d" : "#b91c1c";
    const filtro = this.confFiltro;
    const rows = filtro ? todas.filter(r => r.status === filtro) : todas;
    const total = rows.reduce((s, r) => s + r.total, 0);
    const pill = (st, txt) => {
      const n = todas.filter(r => r.status === st).length;
      return `<button type="button" class="pcx-pill is-${st}${filtro === st ? " is-on" : ""}" onclick="PrestacaoContasApp.setConfFiltro('${st}')" ${n || filtro === st ? "" : "disabled"}>${n} ${txt}</button>`;
    };
    const vazio = this.loading ? "Carregando movimentos de caixa..."
      : (!this.movements.length ? "Clique em Carregar para consultar o Sienge."
        : (filtro ? "Nenhum lançamento nesta situação."
          : (ehRec ? "Nenhum recebimento nos centros selecionados." : "Nenhum pagamento nos centros selecionados.")));
    const corpo = rows.length
      ? rows.map(r => this.confLinhaHtml(r, cor)).join("")
      : `<tr><td colspan="8" class="pcx-vazio">${vazio}</td></tr>`;
    return `
      <div class="pcx-resumo">
        <div class="pcx-pills">
          ${pill("fora", "fora do padrão")}
          ${pill("sem", "sem % no centro")}
          ${pill("ok", "conferidos")}
          ${pill("na", "sem rateio")}
        </div>
        <div class="pcx-total">${rows.length} lançamento(s) · <strong style="color:${cor};">${this.fmt(total)}</strong></div>
      </div>
      <p class="pcx-ajuda">
        Confere se cada ${ehRec ? "recebimento" : "pagamento"} foi lançado nos centros com o percentual cadastrado (Moura Leite e terrenista).
        Contas do plano financeiro sem amarração nas Configurações ficam como <strong>Sem rateio</strong>. Clique na linha para ver título, parcela e contas.
      </p>
      <div class="cc-scroll pcx-scroll" id="pc-conf-scroll">
        <table class="cc-table pcx-table">
          <colgroup>
            <col style="width:84px"><col style="width:118px"><col><col style="width:60px">
            <col style="width:18%"><col style="width:18%"><col style="width:112px"><col style="width:132px">
          </colgroup>
          <thead>
            <tr>
              <th>Data</th>
              <th>Título / parcela</th>
              <th>Histórico</th>
              <th class="is-center">Obra</th>
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

  confLinhaHtml(r, cor) {
    const aberta = this.confAberta === r.key;
    const tit = r.titulo ? `${r.titulo}${r.parcela ? " / " + r.parcela : ""}` : "—";
    const semRateio = r.status === "na";
    const lancado = semRateio ? "—" : this.textoCentros(r.linhas, "atual");
    const padrao = semRateio ? "—" : this.textoCentros(r.linhas, "esperado");
    let html = `<tr class="pcx-row is-${r.status}${aberta ? " is-open" : ""}" onclick="PrestacaoContasApp.toggleConf('${this.esc(r.key)}')">
      <td>${this.dataBr(r.data)}</td>
      <td class="pcx-tit"><i data-lucide="${aberta ? "chevron-down" : "chevron-right"}" class="pcx-chev"></i>${this.esc(tit)}</td>
      <td class="cc-nome">${this.esc(r.historico)}${r.pessoa ? `<div class="pcx-pessoa">${this.esc(r.pessoa)}</div>` : ""}</td>
      <td class="is-center pcx-obra">${this.esc(r.obra)}</td>
      <td title="${this.esc(lancado)}">${lancado}</td>
      <td title="${this.esc(padrao)}">${padrao}</td>
      <td class="is-right pcx-valor" style="color:${cor};">${this.fmt(r.total)}</td>
      <td>${this.seloRateio(r.status, r.motivo)}</td>
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
    const aviso = r.status === "na"
      ? (r.guia
        ? "Nenhuma nota de origem desta guia tem plano financeiro amarrado nas Configurações, por isso o imposto não vai para o parceiro."
        : "Nenhuma conta deste lançamento está amarrada nas Configurações, por isso não há rateio a conferir.")
      : (r.foraTotal > 0.004
        ? (r.guia
          ? `${this.fmt(r.foraTotal)} do imposto vêm de notas cujo plano financeiro não entra no rateio e ficaram fora.`
          : `${this.fmt(r.foraTotal)} em contas sem amarração ficaram fora da conferência.`)
        : "");
    const g = r.guia;
    const configHtml = (c) => c.amarrada
      ? '<span class="pcx-selo is-ok">Entra no rateio</span>'
      : `<span class="pcx-selo is-na">${this.esc(c.motivo || "Fora da configuração")}</span>`;
    let guiaHtml = "";
    let guiaAviso = "";
    if (g) {
      const pago = Number(g.pagoAlvo) || 0;
      const dif = (g.somaOrigens || 0) - pago;
      const origens = (r.contas || []).filter(c => c.origem).map(c => `<tr>
        <td class="pcx-orig-doc">${this.esc(c.origem.doc)}</td>
        <td>${this.esc(c.origem.credor)}</td>
        <td>${this.esc(c.origem.imposto)}</td>
        <td><span class="pcx-cod">${this.esc(c.codigo)}</span> ${this.esc(c.nome)}</td>
        <td>${this.esc(c.cc)}</td>
        <td class="is-right">${this.fmt(c.valor)}</td>
        <td>${configHtml(c)}</td>
      </tr>`).join("");
      guiaAviso = `
        <div class="pcx-det-aviso">Guia unificada <strong>${this.esc(g.doc)}</strong>: o imposto foi distribuído pelas notas fiscais de origem. Vai para o parceiro só o imposto das notas cujo plano financeiro entra no rateio.</div>
        ${Math.abs(dif) > 0.05 ? `<div class="pcx-det-aviso is-warn">As notas de origem somam ${this.fmt(g.somaOrigens)} e a guia pagou ${this.fmt(pago)} nestes centros. A diferença de ${this.fmt(Math.abs(dif))} foi distribuída na mesma proporção das notas. A guia pode ter sido ajustada à mão no Sienge.</div>` : ""}`;
      guiaHtml = `
        <div class="pcx-det-full">
          <div class="pcx-det-tit">Origem do imposto</div>
          <table class="pcx-mini">
            <thead><tr><th>Nota</th><th>Credor</th><th>Imposto</th><th>Plano financeiro da nota</th><th>C.C.</th><th class="is-right">Valor nesta guia</th><th>Configuração</th></tr></thead>
            <tbody>${origens}</tbody>
          </table>
        </div>`;
    }
    const contas = (r.contas || []).filter(c => !c.origem).map(c => `<tr>
      <td class="pcx-cod">${this.esc(c.codigo)}</td>
      <td>${this.esc(c.nome)}</td>
      <td>${this.esc(c.cc)}${c.ccNome ? ` · ${this.esc(c.ccNome)}` : ""}</td>
      <td class="is-right">${this.fmt(c.valor)}</td>
      <td>${configHtml(c)}</td>
    </tr>`).join("");
    const centros = (r.linhas || []).map(l => {
      const dif = l.esperado == null ? null : l.atual - l.esperado;
      const ruim = dif != null && Math.abs(dif) >= 0.06;
      return `<tr>
        <td>${this.esc(l.id)}${l.nome ? ` · ${this.esc(l.nome)}` : ""}</td>
        <td class="is-right">${this.fmt(l.valor)}</td>
        <td class="is-right">${this.fmtPct(l.atual)}</td>
        <td class="is-right">${l.esperado == null ? "—" : this.fmtPct(l.esperado)}</td>
        <td class="is-right${ruim ? " pcx-dif" : ""}">${dif == null ? "—" : (dif > 0 ? "+" : "") + this.fmtPct(dif)}</td>
      </tr>`;
    }).join("");
    return `<div class="pcx-det">
      <div class="pcx-det-info">
        ${info.map(([k, v]) => `<div><span>${k}</span><strong>${this.esc(v)}</strong></div>`).join("")}
      </div>
      ${guiaAviso}
      ${aviso ? `<div class="pcx-det-aviso">${aviso}</div>` : ""}
      ${guiaHtml}
      <div class="pcx-det-grid${g ? " pcx-det-full" : ""}">
        ${g && !contas ? "" : `<div>
          <div class="pcx-det-tit">Plano financeiro</div>
          <table class="pcx-mini">
            <thead><tr><th>Código</th><th>Conta</th><th>Centro de custo</th><th class="is-right">Valor</th><th>Configuração</th></tr></thead>
            <tbody>${contas || '<tr><td colspan="5" class="pcx-mute">Sem contas</td></tr>'}</tbody>
          </table>
        </div>`}
        ${centros ? `<div>
          <div class="pcx-det-tit">Rateio nos centros</div>
          <table class="pcx-mini">
            <thead><tr><th>Centro</th><th class="is-right">Valor</th><th class="is-right">Lançado</th><th class="is-right">Padrão</th><th class="is-right">Diferença</th></tr></thead>
            <tbody>${centros}</tbody>
          </table>
        </div>` : ""}
      </div>
    </div>`;
  },

  kpi(label, value, color, raw) {
    return `<div class="crm-card" style="padding:12px 14px;">
      <div style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;">${label}</div>
      <div style="font-size:1.25rem;font-weight:800;color:${color};margin-top:4px;">${raw ? value : this.fmt(value)}</div>
    </div>`;
  },

  renderRow(row) {
    const isBold = !row.isAccount;
    const color = row.isFormula ? "#0f172a" : (row.amount < 0 ? "#b91c1c" : "#0f172a");
    const bg = row.isFormula ? "#fff7ed" : (row.level === 0 && !row.isAccount ? "#f8fafc" : "#fff");
    const pad = 12 + (row.level || 0) * 16;
    const chevron = row.hasKids
      ? `<button onclick="PrestacaoContasApp.toggle('${row.id}')" style="border:none;background:transparent;cursor:pointer;padding:0 4px 0 0;color:#64748b;">
           <i data-lucide="${this.expanded.has(row.id) ? "chevron-down" : "chevron-right"}" style="width:14px;"></i>
         </button>`
      : "";
    const click = row.isAccount ? `onclick="PrestacaoContasApp.openAccount('${String(row.id).replace(/'/g, "\\'")}')" style="cursor:pointer;"` : "";
    return `<tr style="background:${bg};" ${click}>
      <td style="font-weight:${isBold ? 800 : 500};color:#64748b;white-space:nowrap;">${row.code || ""}</td>
      <td style="padding-left:${pad}px;font-weight:${isBold ? 800 : 500};">
        ${chevron}${row.name}
      </td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:${isBold ? 800 : 600};color:${color};">${this.fmt(row.amount)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:${isBold ? 800 : 600};color:${color};">${this.fmt(row.amount)}</td>
    </tr>`;
  },

  renderAccountDetail() {
    const nk = this.normAccountKey(this.selectedAccount);
    const acc = this.accountIndex && (this.accountIndex[this.selectedAccount] || this.accountIndex[nk]);
    if (!acc) return "";
    return `
      <div class="crm-card" style="margin-top:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;font-size:0.95rem;color:var(--color-primary);">${acc.displayId || acc.id} — ${acc.name}</h3>
          <button class="btn btn-cancel" onclick="PrestacaoContasApp.selectedAccount=null;PrestacaoContasApp.render()">Fechar</button>
        </div>
        <div class="table-container" style="box-shadow:none;max-height:280px;overflow:auto;">
          <table class="custom-table" style="font-size:0.8rem;">
            <thead><tr><th>Data</th><th>Histórico</th><th>Cliente / Credor</th><th>C.C.</th><th style="text-align:right;">Valor</th></tr></thead>
            <tbody>
              ${(acc.items || []).map(it => {
                const d = String((it.mov && (it.mov.bankMovementDate || it.mov.paymentDate)) || "").slice(0, 10).split("-").reverse().join("/");
                return `<tr>
                  <td>${d || "—"}</td>
                  <td>${(it.mov && (it.mov.bankMovementHistoricName || it.mov.documentIdentificationName)) || "—"}</td>
                  <td>${(it.mov && (it.mov.clientName || it.mov.creditorName)) || "—"}</td>
                  <td>${it.costCenterId || "—"}</td>
                  <td style="text-align:right;font-weight:700;color:${it.amount < 0 ? "#b91c1c" : "#16a34a"};">${this.fmt(it.amount)}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }
};

window.PrestacaoContasApp = PrestacaoContasApp;
