// Fluxo de Caixa (DFC) — movimentos de caixa/banco Sienge × visão DFC Padrão × % MLDU

const FluxoCaixaApp = {
  startDate: "",
  endDate: "",
  // Sempre data do movimento/pagamento (M). Vencimento (P) não reflete o caixa
  // e a API bank-movement rejeita P com 422.
  selectionType: "M",
  selectedCompanyIds: [],
  loadedCompanyIds: null,
  loadedStart: "",
  loadedEnd: "",
  compararAno: "",
  loadedComparar: "",
  compMovements: [],
  compMonths: [],
  compMap: null,
  consolidacaoAtiva: false,
  companyMonthsOpen: null,
  agrupamento: "mes",
  escala: "nominal",
  grupoAberto: "",
  companyDropOpen: false,
  companyQuery: "",
  loading: false,
  drillRateioAberto: false,
  error: "",
  movements: [],
  months: [],
  rows: [],
  expanded: new Set(),
  categories: [],
  unmatchedInfo: { total: 0, samples: [], months: {} },
  accountIndex: {},
  nodeItems: {},
  lastAllocs: [],

  init() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    if (!this.startDate) this.startDate = `${y}-${m}-01`;
    if (!this.endDate) {
      const last = new Date(y, now.getMonth() + 1, 0).getDate();
      this.endDate = `${y}-${m}-${String(last).padStart(2, "0")}`;
    }
    // Sempre a visão DFC Padrão do cadastro de visões (Apoio / Integra)
    this.visao();
    if (!this.selectedCompanyIds.length) this.consolidacaoAtiva = false;
    if (!this.companyMonthsOpen) this.companyMonthsOpen = new Set();
    try {
      const escala = localStorage.getItem("fc_escala");
      if (escala === "inteiro" || escala === "milhoes" || escala === "nominal") this.escala = escala;
    } catch (e) {}
    this.noteCompanySet(true);
    this.render();
    this.ensureCategories();
    if (!window._fcEmpDropBound) {
      window._fcEmpDropBound = true;
      document.addEventListener("mousedown", (e) => {
        const t = e.target;
        if (FluxoCaixaApp.companyDropOpen && t && t.closest && !t.closest("#fc-emp")) {
          FluxoCaixaApp.companyDropOpen = false;
          FluxoCaixaApp.render();
        }
      });
    }
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
      console.warn("[Fluxo de Caixa] Plano financeiro:", e);
    }
  },

  empresasCustom() {
    try {
      if (typeof EmpresasState !== "undefined" && EmpresasState.customFields) return EmpresasState.customFields;
      return JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
    } catch (e) { return {}; }
  },

  allCompanies() {
    const all = (window.AppState && AppState.companies) || [];
    const custom = this.empresasCustom();
    return all.map(c => {
      const cfg = custom[c.id] || custom[String(c.id)] || {};
      return {
        id: String(c.id),
        fullName: c.name || c.tradeName || `Empresa ${c.id}`,
        usual: String(cfg.nome_usual || "").trim(),
        pct: Number(cfg.percentual_mldu) || 0,
        consolidacao: Number(cfg.consolidacao_padrao) === 1
      };
    }).sort((a, b) => Number(a.id) - Number(b.id));
  },

  consolidacaoCompanies() {
    return this.allCompanies().filter(c => c.consolidacao);
  },

  companyById(id) {
    return this.allCompanies().find(c => String(c.id) === String(id)) || null;
  },

  columnHeader(c) {
    if (!c) return "";
    const usual = c.usual || String(c.fullName || "").trim();
    return `${c.id}-${usual}`;
  },

  visao() {
    if (typeof PlanoFinanceiroApp !== "undefined") {
      if (!Array.isArray(PlanoFinanceiroApp.visoes) || !PlanoFinanceiroApp.visoes.length) {
        try {
          PlanoFinanceiroApp.visoes = JSON.parse(localStorage.getItem(PlanoFinanceiroApp.STORAGE_KEY || "crm_plano_visoes_v2") || "[]") || [];
        } catch (e) {
          PlanoFinanceiroApp.visoes = [];
        }
      }
      if (typeof PlanoFinanceiroApp.ensureDfcDefault === "function") PlanoFinanceiroApp.ensureDfcDefault();
      const dfc = (PlanoFinanceiroApp.visoes || []).find(v => v.id === "dfc_default");
      if (dfc) return dfc;
    }
    let visoes = [];
    try { visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]") || []; } catch (e) { visoes = []; }
    return visoes.find(v => v.id === "dfc_default") || visoes[0] || { groups: [] };
  },

  catName(id) {
    const c = this.categories.find(x => String(x.id) === String(id));
    return (c && (c.name || c.description)) || "";
  },

  fmtCheio(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  fmt(n) {
    let v = Number(n) || 0;
    if (this.escala === "milhoes") {
      v = v / 1000000;
      return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (this.escala === "inteiro") {
      const sinal = v < 0 ? -1 : 1;
      return (sinal * Math.round(Math.abs(v))).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
    }
    return this.fmtCheio(v);
  },

  setEscala(id) {
    this.escala = id === "milhoes" || id === "inteiro" ? id : "nominal";
    try { localStorage.setItem("fc_escala", this.escala); } catch (e) {}
    this.render();
  },

  escalaHtml() {
    const itens = [
      ["nominal", "Nominal", "Valor completo, com centavos"],
      ["inteiro", "Sem centavos", "Valor arredondado, sem centavos"],
      ["milhoes", "Milhões", "Valor em milhões de reais"]
    ];
    return `<div class="fc-agrupa" role="group" aria-label="Escala dos valores">${itens.map(([id, nome, title]) => {
      const on = (this.escala || "nominal") === id ? " is-on" : "";
      return `<button type="button" class="fc-agrupa-btn${on}" title="${title}" onclick="FluxoCaixaApp.setEscala('${id}')">${nome}</button>`;
    }).join("")}</div>`;
  },

  monthKeys(start, end) {
    const keys = [];
    const s = new Date(start + "T12:00:00");
    const e = new Date(end + "T12:00:00");
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    const last = new Date(e.getFullYear(), e.getMonth(), 1);
    while (cur <= last) {
      keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    return keys;
  },

  monthLabel(key) {
    const [y, m] = key.split("-");
    const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${names[Number(m) - 1]}/${y}`;
  },

  rotuloPeriodo(months) {
    const list = months || [];
    if (!list.length) return "";
    if (list.length === 1) return this.monthLabel(list[0]);
    const a = this.monthLabel(list[0]).split("/");
    const b = this.monthLabel(list[list.length - 1]).split("/");
    if (a[1] === b[1] && list.length === 12) return a[1];
    if (a[1] === b[1]) return `${a[0]}–${b[0]}/${a[1]}`;
    return `${a[0]}/${a[1]}–${b[0]}/${b[1]}`;
  },

  periodos() {
    const months = this.months || [];
    const modo = this.agrupamento || "mes";
    if (modo === "mes") {
      return months.map(m => ({ key: m, label: this.monthLabel(m), months: [m] }));
    }
    const buckets = new Map();
    months.forEach(m => {
      const [ys, ms] = m.split("-");
      const y = Number(ys);
      const mi = Number(ms);
      let key = String(y);
      if (modo === "bimestre") key = y + "-B" + (Math.floor((mi - 1) / 2) + 1);
      else if (modo === "trimestre") key = y + "-T" + (Math.floor((mi - 1) / 3) + 1);
      else if (modo === "semestre") key = y + "-S" + (mi <= 6 ? 1 : 2);
      if (!buckets.has(key)) buckets.set(key, { key, months: [] });
      buckets.get(key).months.push(m);
    });
    return [...buckets.values()].map(p => ({ key: p.key, months: p.months, label: this.rotuloPeriodo(p.months) }));
  },

  tempoCols() {
    const agrupado = (this.agrupamento || "mes") !== "mes";
    const cols = [];
    this.periodos().forEach((p, pi) => {
      const aberto = agrupado && this.grupoAberto === p.key;
      if (!agrupado || aberto) {
        p.months.forEach((m, i) => cols.push({ type: "month", month: m, edge: pi === 0 && i === 0 }));
      } else {
        cols.push({ type: "periodo", key: p.key, label: p.label, months: p.months.slice(), edge: pi === 0 });
      }
    });
    return cols;
  },

  setAgrupamento(modo) {
    const ok = ["mes", "bimestre", "trimestre", "semestre", "anual"];
    this.agrupamento = ok.indexOf(modo) >= 0 ? modo : "mes";
    this.grupoAberto = "";
    this.render();
  },

  toggleGrupo(key) {
    const k = String(key || "");
    this.grupoAberto = this.grupoAberto === k ? "" : k;
    this.render();
  },

  agrupaBotoesHtml() {
    const itens = [
      ["mes", "Mês"],
      ["bimestre", "Bimestre"],
      ["trimestre", "Trimestre"],
      ["semestre", "Semestre"],
      ["anual", "Anual"]
    ];
    return itens.map(([id, nome]) => {
      const on = (this.agrupamento || "mes") === id ? " is-on" : "";
      return `<button type="button" class="fc-agrupa-btn${on}" onclick="FluxoCaixaApp.setAgrupamento('${id}')">${nome}</button>`;
    }).join("");
  },

  factorForCompany(companyId) {
    if (!this.consolidacaoAtiva) return 1;
    const c = this.companyById(companyId);
    if (!c || !c.consolidacao) return 0;
    return (Number(c.pct) || 0) / 100;
  },

  /**
   * Sienge manda financialCategoryRate em % de 0–100 (pode ser < 1%,
   * ex. 0,653847605144% de pró-labore na guia INSS 109504).
   * Só trata como fração 0–1 quando nenhuma linha passa de 1 e a soma fecha ~100%.
   */
  categoryRatesAreFractions(rates) {
    const raw = (rates || []).map((r) => Number(r)).filter((r) => Number.isFinite(r) && r > 0);
    if (!raw.length) return false;
    const max = Math.max.apply(null, raw);
    const sum = raw.reduce((s, r) => s + r, 0);
    return max <= 1 && sum <= 1.0001;
  },

  /**
   * Rateio das categorias do movimento.
   * Percentual Sienge 0–100. Se houver linhas duplicadas ou soma > 100,
   * normaliza — senão o DFC infla (caso visto em 2.11.03 Adiantamento a Parceiros).
   * @param {object} [opts]
   * @param {boolean} [opts.renormalize] quando true, o % restante vira 100% do título
   *   (usado após remover linhas de abatimento/reapropriação do mesmo movimento).
   */
  categoryShareEntries(cats, opts) {
    const renormalize = !!(opts && opts.renormalize);
    const list = Array.isArray(cats) ? cats : [];
    const rawRates = list.map((fc) => Number(fc && fc.financialCategoryRate));
    const asFraction = this.categoryRatesAreFractions(rawRates);
    const merged = new Map();
    list.forEach((fc) => {
      if (!fc) return;
      const categoryId = String(fc.financialCategoryId || "").trim();
      if (!categoryId) return;
      const cc = String(fc.costCenterId || "");
      const key = categoryId + "|" + cc;
      const rateRaw = Number(fc.financialCategoryRate);
      let points = 0;
      if (Number.isFinite(rateRaw) && rateRaw > 0) {
        points = asFraction ? rateRaw * 100 : rateRaw;
      }
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, { fc, points });
      } else {
        prev.points += points;
        if (!prev.fc.financialCategoryName && fc.financialCategoryName) prev.fc = fc;
      }
    });
    const entries = [...merged.values()];
    if (!entries.length) return [];
    const sum = entries.reduce((s, e) => s + (e.points || 0), 0);
    if (sum <= 0) {
      const eq = 1 / entries.length;
      return entries.map((e) => ({ fc: e.fc, share: eq }));
    }
    // Com abatimento removido: o caixa do título fica 100% nas contas restantes.
    // Senão: soma > 100 normaliza; parcial (ex. 53%) permanece parcial.
    const denom = renormalize ? sum : (sum > 100.0001 ? sum : 100);
    return entries.map((e) => ({ fc: e.fc, share: e.points / denom }));
  },

  /** Conta / nome de linha de abatimento-reapropriação (não é caixa). */
  isAbatimentoCategory(fc) {
    if (!fc) return false;
    const n = String(fc.financialCategoryName || this.catName(fc.financialCategoryId) || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return /REAPROP|ABATIMENTO\s+DE\s+ADIANT|ABATIMENTO\s+ADIANT/.test(n);
  },

  isAdiantamentoParceirosAccount(categoryId, categoryName) {
    const nk = this.normAccountKey(categoryId);
    if (nk === "21103") return true;
    const n = String(categoryName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return /ADIANTAMENTO A PARCEIRO/.test(n);
  },

  /** Qualquer conta de adiantamento (2.11.01 fornecedor, 2.11.03 parceiro, nome ADIANTAMENTO/S). */
  isAdiantamentoAccount(categoryId, categoryName) {
    if (this.isAdiantamentoParceirosAccount(categoryId, categoryName)) return true;
    const nk = this.normAccountKey(categoryId);
    if (nk === "21101" || nk === "21103") return true;
    const n = String(categoryName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return /ADIANTAMENTOS?/.test(n);
  },

  /** Contas de saída de 04.01, sem o adiantamento (2.11.03). */
  isRepasseTerrenistaCashAccount(categoryId, categoryName) {
    const nk = this.normAccountKey(categoryId);
    if (nk === "21103") return false;
    if (["2020401", "2050110", "20708", "20108"].includes(nk)) return true;
    const n = String(categoryName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return /\bREPASSE/.test(n) && !/ADIANTAMENTO/.test(n);
  },

  creditorSettlementKey(mov) {
    if (!mov) return "";
    const title = this.movTitleInfo(mov);
    const cred = String(
      mov.creditorId
      || mov.creditor
      || (title && title.party)
      || ""
    ).trim();
    if (!cred) return "";
    return String(mov.companyId || "") + "|" + cred.toUpperCase();
  },

  /**
   * Créditos de reapropriação no período: matam adiantamentos do mesmo credor/título.
   * O movimento de abatimento em si não entra no DFC.
   * Par +/− no mesmo credor: usa max(positivos, negativos) para não dobrar a capacidade.
   */
  collectAdvanceSettlementPool(movements) {
    const pos = {};
    const neg = {};
    const byTitle = new Set();
    (movements || []).forEach((mov) => {
      if (this.movAdvanceRole(mov) !== "abatimento") return;
      const factor = this.factorForCompany(mov.companyId);
      if (factor <= 0) return;
      const title = this.movTitleInfo(mov);
      if (title.titleKey) byTitle.add(String(title.titleKey));
      const key = this.creditorSettlementKey(mov);
      const raw = Number(mov.bankMovementAmount) || 0;
      const amt = Math.abs(raw) * factor;
      if (!key || !(amt > 0)) return;
      if (raw >= 0) pos[key] = (pos[key] || 0) + amt;
      else neg[key] = (neg[key] || 0) + amt;
    });
    const byCreditor = {};
    new Set([...Object.keys(pos), ...Object.keys(neg)]).forEach((key) => {
      byCreditor[key] = Math.max(pos[key] || 0, neg[key] || 0);
    });
    return { byCreditor, byTitle };
  },

  /**
   * Reaprop/ABATE entra no DFC na conta do movimento (repasse, obras, marketing, pessoas).
   * Não reclassificar nem zerar.
   */
  settleAdvancesInAllocs(allocs) {
    return allocs;
  },

  allocate(mov, factor) {
    const rawBank = Number(mov.bankMovementAmount) || 0;
    const catsAll = Array.isArray(mov.financialCategories) ? mov.financialCategories : [];
    // Sem plano financeiro = transferência / aplicação / movimento bancário puro — fora do DFC
    if (!catsAll.length) return [];

    const ignored = this.ignoredAccountKeys();
    return this.categoryShareEntries(catsAll).map(({ fc, share }) => {
      const categoryId = String(fc.financialCategoryId || "").trim();
      if (!categoryId) return null;
      const nk = this.normAccountKey(categoryId);
      if (ignored.has(categoryId) || (nk && ignored.has(nk))) return null;
      const rateRaw = Number(fc.financialCategoryRate);
      const rateadoBruto = rawBank * share;
      const amount = rateadoBruto * factor;
      return {
        amount,
        rateadoBruto,
        rawBankAmount: rawBank,
        factor,
        share,
        rateRaw: Number.isFinite(rateRaw) ? rateRaw : null,
        categoryId,
        categoryName: fc.financialCategoryName || this.catName(fc.financialCategoryId) || "Sem nome",
        costCenterId: fc.costCenterId,
        costCenterName: fc.costCenterName,
        reducer: fc.financialCategoryReducer,
        categoryType: fc.financialCategoryType,
        month: this.movMonth(mov),
        companyId: mov.companyId,
        mov
      };
    }).filter(Boolean);
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

  cashDate(mov) {
    const raw = mov.paymentDate
      || mov.reconcileDate
      || mov.bankMovementDate
      || mov.date
      || mov.dueDate
      || "";
    return String(raw).slice(0, 10);
  },

  movMonth(mov) {
    return this.cashDate(mov).slice(0, 7);
  },

  isCashOutflowGroup(id) {
    const s = String(id || "");
    return s === "g_02" || s.startsWith("g_02_")
      || s === "g_04" || s.startsWith("g_04_")
      || s === "g_05" || s.startsWith("g_05_")
      || s === "g_07" || s.startsWith("g_07_")
      || s === "g_09_02" || s === "g_09_05";
  },

  isRevenueGroup(id) {
    const s = String(id || "");
    return s === "g_01" || s.startsWith("g_01_");
  },

  // Contas do plano que começam com 2 (despesas/saídas) entram sempre negativas no DFC
  isExpenseAccount(categoryId) {
    const digits = String(categoryId || "").replace(/\D/g, "");
    return digits.charAt(0) === "2";
  },

  /** Chave só dígitos para casar 1.02.01.01 com 1020101 */
  normAccountKey(id) {
    return String(id || "").replace(/\D/g, "");
  },

  /**
   * Conta redutora: reduz o total do nó pai (desconto, cancelamento, retenção, etc.).
   * Em grupo de saída, a redutora entra positiva (como no Excel: 05.09 Retenções).
   * Em RECEITAS, a redutora entra negativa (01.04 Cancelamentos).
   */
  isDescontoFolhaAccount(categoryId, categoryName) {
    const nk = this.normAccountKey(categoryId);
    if (nk === "2030126") return true;
    const n = String(categoryName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return /DESCONTO EM FOLHA/.test(n);
  },

  isReducingAccount(categoryId, categoryName, node) {
    if (this.isDescontoFolhaAccount(categoryId, categoryName)) return false;
    if (node && node.redutora) return true;
    const n = String(categoryName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (/DESCONT|CANCELAMENT|RETENC|DEDUC|ESTORNO DE (VENDA|RECEITA)|REDUTOR|\(\-\)|^\-\s/.test(n)) return true;
    if (node && this.isRevenueGroup(node.id) && this.isExpenseAccount(categoryId)) return true;
    return false;
  },

  isExpenseType(categoryType) {
    const t = String(categoryType || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
    return /^(D|2|DESPESA|SAIDA)$/.test(t) || t.includes("DESPESA") || t.includes("SAIDA");
  },

  isEstornoName(categoryName) {
    const n = String(categoryName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return /ESTORNO/.test(n);
  },

  /**
   * 11.01 (-) DIVIDENDOS reduz o caixa. 11.02 (+) DIVIDENDOS entra.
   * Estorno (nome ou valor cru negativo) inverte o sinal da linha.
   * Não usar a regra "conta 2.x redutora = positivo": isso vale para
   * retenção dentro de grupo de saída, e deixava 11.01 somando.
   */
  signedDividendLine(node, categoryName, raw) {
    const id = String(node && node.id || "");
    if (id !== "g_11_01" && id !== "g_11_02") return null;
    const abs = Math.abs(raw);
    const reversal = this.isEstornoName(categoryName) || raw < 0;
    if (id === "g_11_01") return reversal ? abs : -abs;
    return reversal ? -abs : abs;
  },

  /**
   * Sinal no DFC (mesmo critério do demonstrativo Excel):
   * — grupo de saída (02/04/05/07/09.02/09.05) ou conta 2.x / tipo despesa → negativo
   * — redutora nesses grupos (retenção, desconto obtido, flag Sienge) → positivo
   * — redutora em RECEITAS (cancelamento) → negativo
   * — 11.01 (-) DIVIDENDOS → negativo; 11.02 (+) DIVIDENDOS → positivo
   * Em geral usa módulo do valor (API costuma mandar saída positiva).
   *
   * Reaprop. / ABATE em conta que não é adiantamento: negativo no DFC.
   * Conta de adiantamento (2.11.01 fornecedor, 2.11.03 parceiro): sinal
   * oposto ao do banco. O adiantamento (banco positivo) entra negativo e a
   * reapropriação (banco negativo) entra positiva. Os dois se compensam.
   * Set/2026, 2.11.01: banco −36.489,00 → DFC +36.489,00.
   */
  signedAmount(node, categoryId, categoryName, amount, reducerFlag, categoryType, mov) {
    const raw = Number(amount) || 0;
    if (!raw) return 0;
    const role = mov ? this.movAdvanceRole(mov) : "";
    if (this.isAdiantamentoAccount(categoryId, categoryName)) return -raw;
    if (role === "adiantamento") return Math.abs(raw);
    if (this.isDescontoFolhaAccount(categoryId, categoryName)) return -Math.abs(raw);
    if (role === "abatimento") return -Math.abs(raw);
    const dividend = this.signedDividendLine(node, categoryName, raw);
    if (dividend !== null) return dividend;
    const abs = Math.abs(raw);
    const apiReducer = /^(S|SIM|TRUE|1|Y|R)$/i.test(String(reducerFlag || "").trim());
    const reduce = apiReducer || this.isReducingAccount(categoryId, categoryName, node);
    if (this.isRevenueGroup(node && node.id)) return reduce ? -abs : abs;
    const outflow = this.isCashOutflowGroup(node && node.id)
      || this.isExpenseAccount(categoryId)
      || this.isExpenseType(categoryType);
    if (outflow) return reduce ? abs : -abs;
    return reduce ? -abs : abs;
  },

  formatAccountCode(id) {
    const raw = String(id || "").trim();
    if (!raw) return "";
    if (typeof PlanoFinanceiroApp !== "undefined" && typeof PlanoFinanceiroApp.formatAccountCode === "function") {
      const cat = (this.categories || []).find(c => String(c.id) === raw)
        || { id: raw, _parentId: null };
      const formatted = PlanoFinanceiroApp.formatAccountCode(cat);
      if (formatted && formatted.includes(".")) return formatted;
    }
    if (raw.includes(".")) return raw.replace(/^\.+|\.+$/g, "");
    if (/^\d+$/.test(raw) && raw.length >= 3) {
      const first = raw.charAt(0);
      let rest = raw.slice(1);
      if (rest.length % 2 === 1) rest = "0" + rest;
      const pairs = rest.match(/.{1,2}/g) || [];
      return [first].concat(pairs).join(".");
    }
    return raw;
  },

  emptyMonths(keys) {
    const o = {};
    keys.forEach(k => { o[k] = 0; });
    return o;
  },

  addInto(bucket, month, amount, companyId) {
    if (!bucket.months) bucket.months = this.emptyMonths(this.months);
    if (!bucket.months[month]) bucket.months[month] = 0;
    bucket.months[month] += amount;
    bucket.total = (Number(bucket.total) || 0) + amount;
    const cid = companyId != null && companyId !== "" ? String(companyId) : "";
    if (!cid) return;
    if (!bucket.byCompany) bucket.byCompany = {};
    if (!bucket.byCompany[cid]) bucket.byCompany[cid] = { months: this.emptyMonths(this.months), total: 0 };
    const bag = bucket.byCompany[cid];
    if (!bag.months[month]) bag.months[month] = 0;
    bag.months[month] += amount;
    bag.total += amount;
  },

  costCenterRows(acc) {
    const map = {};
    (acc.items || []).forEach(it => {
      const id = it.costCenterId != null && String(it.costCenterId).trim() !== "" ? String(it.costCenterId) : "—";
      const name = String(it.costCenterName || "").trim();
      if (!map[id]) {
        map[id] = {
          id,
          ccName: name,
          months: this.emptyMonths(this.months),
          total: 0,
          byCompany: {},
          items: []
        };
      }
      const row = map[id];
      if (name && !row.ccName) row.ccName = name;
      this.addInto(row, it.month, Number(it.amount) || 0, it.companyId);
      row.items.push(it);
    });
    return Object.values(map).sort((a, b) => {
      const diff = Math.abs(Number(b.total) || 0) - Math.abs(Number(a.total) || 0);
      if (diff) return diff;
      return (Number(b.total) || 0) - (Number(a.total) || 0);
    });
  },

  mergeByCompany(dest, src) {
    if (!src || !src.byCompany) return;
    if (!dest.byCompany) dest.byCompany = {};
    Object.keys(src.byCompany).forEach(id => {
      const s = src.byCompany[id];
      if (!dest.byCompany[id]) dest.byCompany[id] = { months: this.emptyMonths(this.months), total: 0 };
      const d = dest.byCompany[id];
      this.months.forEach(m => { d.months[m] = (d.months[m] || 0) + ((s.months && s.months[m]) || 0); });
      d.total += Number(s.total) || 0;
    });
  },

  build(allocs) {
    const visao = this.visao();
    const groups = (visao.groups || []).map(g => ({
      ...g,
      months: this.emptyMonths(this.months),
      total: 0,
      accountRows: []
    }));
    const byId = Object.fromEntries(groups.map(g => [g.id, g]));
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

    // Não cria mais linha "CONTAS NÃO CLASSIFICADAS" — só alerta lateral
    const unmatched = { months: this.emptyMonths(this.months), total: 0, accountRows: [], samples: [] };

    const accIndex = {};
    const nodeItems = {};
    allocs.forEach(a => {
      const rawId = String(a.categoryId || "").trim();
      if (!rawId) return;
      const nk = this.normAccountKey(rawId);
      const dotted = this.formatAccountCode(rawId);
      const nid = accToNode[rawId] || (nk && accToNode[nk]) || (dotted && accToNode[dotted]) || null;
      if (!nid || !byId[nid]) {
        const amount = Number(a.amount) || 0;
        this.addInto(unmatched, a.month, amount, a.companyId);
        if (unmatched.samples.length < 12) {
          unmatched.samples.push({ id: rawId, name: a.categoryName, amount });
        }
        return;
      }
      const node = byId[nid];
      const amount = this.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov);
      this.addInto(node, a.month, amount, a.companyId);
      const idxKey = nk || rawId;
      if (!accIndex[idxKey]) {
        accIndex[idxKey] = {
          id: rawId,
          displayId: this.formatAccountCode(rawId),
          name: a.categoryName,
          months: this.emptyMonths(this.months),
          total: 0,
          parentId: node.id,
          items: [],
          redutora: !!(node.redutora || this.isReducingAccount(a.categoryId, a.categoryName, node)
            || /^(S|SIM|TRUE|1|Y|R)$/i.test(String(a.reducer || "").trim()))
        };
      }
      this.addInto(accIndex[idxKey], a.month, amount, a.companyId);
      accIndex[idxKey].name = a.categoryName || accIndex[idxKey].name;
      const item = { ...a, amount, signedAmount: amount, nodeId: nid };
      accIndex[idxKey].items.push(item);
      if (!nodeItems[nid]) nodeItems[nid] = [];
      nodeItems[nid].push(item);
    });
    this.unmatchedInfo = unmatched;
    this.accountIndex = accIndex;
    this.nodeItems = nodeItems;
    this.lastAllocs = allocs;

    Object.values(accIndex).forEach(acc => {
      const node = byId[acc.parentId];
      if (node) node.accountRows.push(acc);
    });

    groups.forEach(g => {
      (g.accounts || []).forEach(id => {
        const sid = String(id);
        const nk = this.normAccountKey(sid);
        if (accIndex[sid] || (nk && accIndex[nk])) return;
        g.accountRows.push({
          id: sid,
          displayId: this.formatAccountCode(sid),
          name: this.catName(id),
          months: this.emptyMonths(this.months),
          total: 0,
          parentId: g.id,
          zero: true,
          items: [],
          redutora: !!(g.redutora || this.isReducingAccount(sid, this.catName(id), g))
        });
      });
      g.accountRows.sort((a, b) => String(a.displayId || a.id).localeCompare(String(b.displayId || b.id), "pt-BR", { numeric: true }));
    });

    // Rollup bottom-up: pai = soma dos filhos (já com sinal correto das redutoras)
    const depthOf = (g) => {
      let d = 0, cur = g;
      while (cur && cur.parentId && byId[cur.parentId]) { d++; cur = byId[cur.parentId]; }
      return d;
    };
    [...groups].filter(g => g.type !== "formula").sort((a, b) => depthOf(b) - depthOf(a)).forEach(g => {
      const children = groups.filter(c => c.parentId === g.id && c.type !== "formula");
      children.forEach(ch => {
        this.months.forEach(m => { g.months[m] += ch.months[m] || 0; });
        g.total += ch.total;
        this.mergeByCompany(g, ch);
      });
    });

    const sumNodes = (ids) => {
      const months = this.emptyMonths(this.months);
      const acc = { months, total: 0, byCompany: {} };
      ids.forEach(id => {
        const n = byId[id];
        if (!n) return;
        this.months.forEach(m => { months[m] += n.months[m] || 0; });
        acc.total += n.total;
        this.mergeByCompany(acc, n);
      });
      return acc;
    };
    const applySum = (id, parts) => {
      if (!byId[id]) return;
      const s = sumNodes(parts);
      byId[id].months = s.months;
      byId[id].total = s.total;
      byId[id].byCompany = s.byCompany;
    };
    applySum("g_03", ["g_04", "g_05"]);
    applySum("g_06", ["g_01", "g_02", "g_03"]);
    applySum("g_08", ["g_06", "g_07"]);
    applySum("g_10", ["g_08", "g_09"]);
    applySum("g_12", ["g_10", "g_11"]);

    this.treeNodes = [];
    const walkMeta = (node, level) => {
      const children = groups.filter(g => g.parentId === node.id);
      const hasKids = children.length > 0 || (node.accountRows && node.accountRows.length > 0);
      this.treeNodes.push({ id: node.id, level, hasKids });
      children.forEach(ch => walkMeta(ch, level + 1));
    };
    groups.filter(g => !g.parentId).forEach(g => walkMeta(g, 0));
    if (!this._expandInited) {
      this.treeNodes.filter(n => n.hasKids && n.level === 0).forEach(n => this.expanded.add(n.id));
      this._expandInited = true;
    }

    const rows = [];
    const pushNode = (node, level) => {
      const children = groups.filter(g => g.parentId === node.id);
      const hasKids = children.length > 0 || (node.accountRows && node.accountRows.length > 0);
      rows.push({ ...node, level, hasKids, isAccount: false });
      if (!this.expanded.has(node.id)) return;
      children.forEach(ch => pushNode(ch, level + 1));
      (node.accountRows || []).forEach(acc => {
        const code = acc.displayId || this.formatAccountCode(acc.id);
        const redFlag = acc.redutora ? " (−)" : "";
        const toggleId = "acc:" + (acc.displayId || acc.id);
        const ccRows = this.costCenterRows(acc);
        rows.push({
          ...acc,
          level: level + 1,
          isAccount: true,
          isCostCenter: false,
          hasKids: ccRows.length > 0,
          toggleId,
          name: `${code} ${acc.name || ""}${redFlag}`.trim()
        });
        if (!ccRows.length || !this.expanded.has(toggleId)) return;
        ccRows.forEach(cc => {
          const label = cc.id === "—"
            ? "Sem centro de custo"
            : `${cc.id}${cc.ccName ? " - " + cc.ccName : ""}`;
          rows.push({
            ...cc,
            level: level + 2,
            isAccount: false,
            isCostCenter: true,
            hasKids: false,
            parentAccountId: acc.id,
            ccId: cc.id,
            name: label
          });
        });
      });
    };
    groups.filter(g => !g.parentId).forEach(g => pushNode(g, 0));
    this.rows = rows;
  },

  async load() {
    if (!this.startDate || !this.endDate) {
      this.error = "Informe o período.";
      this.render();
      return;
    }
    if (!this.selectedCompanyIds.length) {
      this.error = "Selecione ao menos uma empresa.";
      this.render();
      return;
    }
    this.loading = true;
    this.error = "";
    this.render();
    await this.ensureCategories();
    this.months = this.monthKeys(this.startDate, this.endDate);
    if (this.grupoAberto && !this.periodos().some(p => p.key === this.grupoAberto)) this.grupoAberto = "";
    const comp = this.periodoComparado();
    try {
      const [atual, anterior] = await Promise.all([
        this.buscarMovimentos(this.startDate, this.endDate),
        comp ? this.buscarMovimentos(comp.start, comp.end) : Promise.resolve([])
      ]);
      this.movements = atual;
      this.compMovements = anterior;
      this.compMonths = comp ? this.monthKeys(comp.start, comp.end) : [];
      const ids = this.selectedCompanyIds.map(String);
      this.build(this.alocar(this.movements, ids));
      this.montarComparacao(ids);
      if (!this.movements.length) this.error = "Nenhum movimento de caixa/banco no período para as empresas selecionadas.";
    } catch (err) {
      console.error("[Fluxo de Caixa]", err);
      this.error = err && err.message ? err.message : "Falha ao consultar a API de caixa e banco.";
      this.rows = [];
      this.compMap = null;
      this.compAccountIndex = null;
      this.compNodeItems = null;
    } finally {
      this.loadedCompanyIds = this.selectedCompanyIds.map(String);
      this.loadedStart = this.startDate;
      this.loadedEnd = this.endDate;
      this.loadedComparar = this.compararAno;
      this.noteCompanySet(true);
      this.loading = false;
      this.render();
    }
  },

  async buscarMovimentos(start, end) {
    const chunks = await Promise.all(this.selectedCompanyIds.map(async id => {
      const data = await SiengeApiService.getBankMovements(start, end, {
        selectionType: "M",
        companyId: id
      });
      return (data || []).map(m => ({ ...m, companyId: m.companyId || id }));
    }));
    let movs = chunks.flat();
    // Dedupe entre empresas (API às vezes ignora companyId e devolve o mesmo movimento N vezes)
    if (typeof siengeDedupeBankMovements === "function") movs = siengeDedupeBankMovements(movs);
    // Garante período pela data de caixa (não confiar só no filtro da API)
    return movs.filter((m) => {
      const d = this.cashDate(m);
      return d && d >= start && d <= end;
    });
  },

  alocar(movs, ids) {
    const selected = new Set((ids || []).map(String));
    const allocs = [];
    (movs || []).forEach(mov => {
      if (selected.size && !selected.has(String(mov.companyId))) return;
      const factor = this.factorForCompany(mov.companyId);
      if (factor <= 0) return;
      this.allocate(mov, factor).forEach(a => allocs.push(a));
    });
    this.settleAdvancesInAllocs(allocs, movs);
    return allocs;
  },

  /* 29/02 vira 28/02 quando o ano de comparação não é bissexto. */
  deslocarData(iso, anos) {
    const [y, m, d] = String(iso || "").split("-").map(Number);
    if (!y || !m || !d) return "";
    const ny = y + anos;
    const ultimo = new Date(ny, m, 0).getDate();
    return `${ny}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
  },

  periodoComparado() {
    const alvo = Number(this.compararAno) || 0;
    const base = Number(String(this.startDate || "").slice(0, 4)) || 0;
    if (!alvo || !base || alvo === base || !this.endDate) return null;
    const anos = alvo - base;
    return { start: this.deslocarData(this.startDate, anos), end: this.deslocarData(this.endDate, anos) };
  },

  anosComparacao() {
    const base = Number(String(this.startDate || "").slice(0, 4)) || new Date().getFullYear();
    const anos = [];
    for (let y = base - 1; y >= base - 6; y--) anos.push(String(y));
    if (this.compararAno && anos.indexOf(String(this.compararAno)) < 0) anos.unshift(String(this.compararAno));
    return anos;
  },

  setComparar(ano) {
    this.compararAno = String(ano || "");
    this.paintConsultDirty();
  },

  baseCaixaAtualizada(companyId, ym) {
    const comp = this.periodoComparado();
    if (!comp || this.loading) return;
    const ini = String(comp.start || "").slice(0, 7);
    const fim = String(comp.end || "").slice(0, 7);
    if (!ym || ym < ini || ym > fim) return;
    if (this.selectedCompanyIds.map(String).indexOf(String(companyId)) < 0) return;
    if (this._compBaseTimer) clearTimeout(this._compBaseTimer);
    this._compBaseTimer = setTimeout(() => {
      this._compBaseTimer = null;
      this.atualizarComparativoDaBase();
    }, 800);
  },

  async atualizarComparativoDaBase() {
    if (this.loading || this._compRefresh) return;
    const comp = this.periodoComparado();
    if (!comp || !(this.rows || []).length) return;
    this._compRefresh = true;
    try {
      const anterior = await this.buscarMovimentos(comp.start, comp.end);
      this.compMovements = anterior;
      this.compMonths = this.monthKeys(comp.start, comp.end);
      this.montarComparacao(this.selectedCompanyIds.map(String));
      this.render();
    } catch (e) {}
    this._compRefresh = false;
  },

  rowKey(r) {
    if (r.isCostCenter) return `c:${this.normAccountKey(r.parentAccountId) || r.parentAccountId}:${r.ccId}`;
    if (r.isAccount) return `a:${this.normAccountKey(r.id) || r.id}`;
    return `n:${r.id}`;
  },

  /* Monta a mesma árvore com os movimentos do período comparado e guarda o total de cada linha. */
  montarComparacao(ids) {
    this.compMap = null;
    this.compAccountIndex = null;
    this.compNodeItems = null;
    if (!(this.compMonths || []).length) return;
    const guarda = {
      months: this.months,
      rows: this.rows,
      unmatchedInfo: this.unmatchedInfo,
      accountIndex: this.accountIndex,
      nodeItems: this.nodeItems,
      lastAllocs: this.lastAllocs,
      treeNodes: this.treeNodes
    };
    const map = {};
    try {
      this.months = this.compMonths.slice();
      this.build(this.alocar(this.compMovements, ids || this.gridCompanyIds()));
      this.compAccountIndex = this.accountIndex;
      this.compNodeItems = this.nodeItems;
      (this.rows || []).forEach(r => { map[this.rowKey(r)] = Number(r.total) || 0; });
    } finally {
      Object.assign(this, guarda);
    }
    this.compMap = map;
  },

  rotuloComparado() {
    return this.rotuloPeriodo(this.compMonths || []);
  },

  totalRepetido() {
    return this.gridCompanyIds().length <= 1 && this.tempoCols().length === 1;
  },

  toggle(id) {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.rebuildFromCache();
  },

  noteCompanySet(force) {
    const key = this.selectedCompanyIds.map(String).slice().sort((a, b) => Number(a) - Number(b)).join(",");
    if (!force && key === this._companySetKey) return;
    this._companySetKey = key;
    if (this.selectedCompanyIds.length <= 1) this.companyMonthsOpen = new Set(this.selectedCompanyIds.map(String));
    else this.companyMonthsOpen = new Set();
  },

  toggleCompanyMonths(id) {
    const sid = String(id);
    if (!this.companyMonthsOpen) this.companyMonthsOpen = new Set();
    if (this.companyMonthsOpen.has(sid)) this.companyMonthsOpen.delete(sid);
    else this.companyMonthsOpen.add(sid);
    this.render();
  },

  aplicarConsolidacao() {
    if (this.consolidacaoAtiva) {
      this.consolidacaoAtiva = false;
    } else {
      const cons = this.consolidacaoCompanies();
      if (!cons.length) {
        this.error = "Nenhuma empresa está marcada como consolidação padrão no cadastro.";
        this.render();
        return;
      }
      this.consolidacaoAtiva = true;
      this.selectedCompanyIds = cons.map(c => String(c.id));
      this.error = "";
    }
    this.noteCompanySet(true);
    this.companyDropOpen = false;
    if (this.startDate && this.endDate && this.selectedCompanyIds.length) this.load();
    else this.render();
  },

  refreshAfterCompanyChange() {
    this.companyDropOpen = true;
    this.render();
  },

  setPeriod(which, value) {
    if (which === "start") this.startDate = value || "";
    else this.endDate = value || "";
    this.paintConsultDirty();
  },

  gridCompanyIds() {
    const src = this.loadedCompanyIds && this.loadedCompanyIds.length ? this.loadedCompanyIds : this.selectedCompanyIds;
    return src.map(String).slice().sort((a, b) => Number(a) - Number(b));
  },

  filtersDirty() {
    if (!this.loadedCompanyIds) return false;
    const loaded = this.loadedCompanyIds.map(String).slice().sort((a, b) => Number(a) - Number(b)).join(",");
    const now = this.selectedCompanyIds.map(String).slice().sort((a, b) => Number(a) - Number(b)).join(",");
    return loaded !== now || this.loadedStart !== this.startDate || this.loadedEnd !== this.endDate
      || String(this.loadedComparar || "") !== String(this.compararAno || "");
  },

  paintConsultDirty() {
    const dirty = this.filtersDirty();
    const btn = document.querySelector("#fluxo-caixa-root .fc-consult-btn");
    if (btn) {
      btn.classList.toggle("is-dirty", dirty);
      btn.title = dirty ? "A seleção ou o período mudou. Consulte de novo para atualizar a grade." : "";
    }
    let note = document.getElementById("fc-stale");
    if (dirty && !note) {
      const filters = document.querySelector("#fluxo-caixa-root .fc-filters");
      if (!filters) return;
      note = document.createElement("p");
      note.id = "fc-stale";
      note.className = "fc-stale";
      note.textContent = "A grade é da consulta anterior. Clique em Consultar para aplicar a empresa ou o período.";
      filters.insertAdjacentElement("afterend", note);
    } else if (!dirty && note) {
      note.remove();
    }
  },

  toggleCompany(id, on) {
    const sid = String(id);
    if (on) {
      if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid);
    } else {
      this.selectedCompanyIds = this.selectedCompanyIds.filter(x => x !== sid);
    }
    this.consolidacaoAtiva = false;
    this.refreshAfterCompanyChange();
  },

  companyFilterItems() {
    return this.allCompanies().map(c => ({
      id: String(c.id),
      label: `${c.id} - ${String(c.fullName || "").toUpperCase()}`
    }));
  },

  bindCompanyFilter() {
    if (!window.MlEmpresaFilter) return;
    MlEmpresaFilter.bind("fc-emp", {
      toggleOpen: () => {
        this.companyDropOpen = !this.companyDropOpen;
        this.render();
      },
      setQuery: (q) => {
        this.companyQuery = q || "";
        const box = document.getElementById("fc-emp-list");
        if (box && window.MlEmpresaFilter) {
          box.innerHTML = MlEmpresaFilter.listHtml({
            id: "fc-emp",
            items: this.companyFilterItems(),
            selectedIds: this.selectedCompanyIds,
            query: this.companyQuery
          });
        }
      },
      toggleId: (id, on) => this.toggleCompany(id, on),
      selectAll: () => {
        this.selectedCompanyIds = this.allCompanies().map(c => String(c.id));
        this.consolidacaoAtiva = false;
        this.refreshAfterCompanyChange();
      },
      selectNone: () => {
        this.selectedCompanyIds = [];
        this.consolidacaoAtiva = false;
        this.refreshAfterCompanyChange();
      }
    });
  },

  companyDropHtml() {
    const companies = this.allCompanies();
    if (!companies.length) {
      return `<div style="flex:1;min-width:240px;"><div class="ml-emp-filter-label">Empresas</div><span style="color:#94a3b8;font-size:0.8rem;">Nenhuma empresa cadastrada.</span></div>`;
    }
    this.bindCompanyFilter();
    if (window.MlEmpresaFilter) {
      return MlEmpresaFilter.html({
        id: "fc-emp",
        label: "Empresas",
        items: this.companyFilterItems(),
        selectedIds: this.selectedCompanyIds.map(String),
        open: this.companyDropOpen,
        query: this.companyQuery,
        emptyMeansAll: false
      });
    }
    return "";
  },

  expandableByLevel() {
    const map = new Map();
    (this.treeNodes || []).forEach(n => {
      if (!n || !n.hasKids || !n.id) return;
      const list = map.get(n.level) || [];
      list.push(n.id);
      map.set(n.level, list);
    });
    return map;
  },

  expandAll() {
    const byLevel = this.expandableByLevel();
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    for (const level of levels) {
      const missing = (byLevel.get(level) || []).filter(id => !this.expanded.has(id));
      if (missing.length) {
        missing.forEach(id => this.expanded.add(id));
        this.rebuildFromCache();
        return;
      }
    }
    const acc = [];
    (this.rows || []).forEach(r => {
      if (r.isAccount && r.hasKids && r.toggleId && !this.expanded.has(r.toggleId)) acc.push(r.toggleId);
    });
    if (acc.length) {
      acc.forEach(id => this.expanded.add(id));
      this.rebuildFromCache();
    }
  },

  collapseAll() {
    const acc = [];
    this.expanded.forEach(id => { if (String(id).indexOf("acc:") === 0) acc.push(id); });
    if (acc.length) {
      acc.forEach(id => this.expanded.delete(id));
      this.rebuildFromCache();
      return;
    }
    const byLevel = this.expandableByLevel();
    const levels = [...byLevel.keys()].sort((a, b) => b - a);
    for (const level of levels) {
      const open = (byLevel.get(level) || []).filter(id => this.expanded.has(id));
      if (open.length) {
        open.forEach(id => this.expanded.delete(id));
        this.rebuildFromCache();
        return;
      }
    }
  },

  rebuildFromCache() {
    const ids = this.gridCompanyIds();
    this.build(this.alocar(this.movements, ids));
    this.montarComparacao(ids);
    this.render();
  },

  cellStyle(val, isTotal) {
    const n = Number(val) || 0;
    const color = n < 0 ? "#b91c1c" : (n > 0 ? "#105436" : "#94a3b8");
    return `text-align:right;font-variant-numeric:tabular-nums;color:${color};font-weight:${isTotal ? 800 : 600};white-space:nowrap;`;
  },

  nodeChrome(r) {
    if (r.isAccount) return { bg: "#f8fafc", border: "#cbd5e1", icon: "hash" };
    if (r.type === "formula") return { bg: "#ecfdf5", border: "#105436", icon: "calculator" };
    if (r.type === "total_n1") return { bg: "#f8fafc", border: "#0f766e", icon: "layers" };
    if (r.type === "resultado") return { bg: "#fff", border: "#eab308", icon: "file-text" };
    return { bg: "#fff", border: "#cbd5e1", icon: "folder" };
  },

  render() {
    const root = document.getElementById("fluxo-caixa-root");
    if (!root) return;
    const prevScroll = root.querySelector(".fc-tree-scroll");
    const keepTop = prevScroll ? prevScroll.scrollTop : 0;
    const keepLeft = prevScroll ? prevScroll.scrollLeft : 0;
    const main = document.querySelector(".main-content");
    const keepMain = main ? main.scrollTop : 0;
    const keepWin = window.scrollY || document.documentElement.scrollTop || 0;
    const unmatched = this.unmatchedInfo || { total: 0, samples: [] };
    const hasUnmatched = Math.abs(Number(unmatched.total) || 0) > 0.005;
    const byLevel = this.expandableByLevel();
    const accPending = (this.rows || []).some(r => r.isAccount && r.hasKids && r.toggleId && !this.expanded.has(r.toggleId));
    const accOpen = [...this.expanded].some(id => String(id).indexOf("acc:") === 0);
    const canExpand = accPending || [...byLevel.values()].some(ids => ids.some(id => !this.expanded.has(id)));
    const canCollapse = accOpen || [...byLevel.values()].some(ids => ids.some(id => this.expanded.has(id)));
    const modo = this.consolidacaoAtiva
      ? "consolidação padrão · percentual Moura Leite"
      : "empresas selecionadas · 100% do valor";
    root.innerHTML = `
      <div class="fc-shell">
        <div class="fc-head">
          <div class="fc-head-left">
            <div class="fc-head-icon"><i data-lucide="git-branch"></i></div>
            <div>
              <h2>Fluxo de caixa (DFC)</h2>
              <p>Estrutura <strong>DFC Padrão</strong> · ${this.esc(modo)}${this.compMap ? ` · comparado com ${this.esc(this.rotuloComparado())}` : ""}</p>
            </div>
          </div>
          <button type="button" class="btn btn-outline fc-link-visoes" onclick="switchTab('plano-financeiro','Plano Financeiro e Visões')">
            <i data-lucide="settings-2" style="width:14px;height:14px;"></i> Cadastro de visões
          </button>
        </div>
        <div class="fc-body">
          <div class="fc-filters">
            <label class="fc-field">Início
              <input type="date" value="${this.startDate}" onchange="FluxoCaixaApp.setPeriod('start', this.value)">
            </label>
            <label class="fc-field">Fim
              <input type="date" value="${this.endDate}" onchange="FluxoCaixaApp.setPeriod('end', this.value)">
            </label>
            <label class="fc-field">Comparar com
              <select class="fc-comparar" onchange="FluxoCaixaApp.setComparar(this.value)">
                <option value="">Sem comparação</option>
                ${this.anosComparacao().map(y => `<option value="${y}" ${String(this.compararAno) === y ? "selected" : ""}>Mesmo período de ${y}</option>`).join("")}
              </select>
            </label>
            ${this.companyDropHtml()}
            <div class="fc-filter-actions">
              <button type="button" class="btn ${this.consolidacaoAtiva ? "btn-primary" : "btn-outline"} fc-cons-btn" onclick="FluxoCaixaApp.aplicarConsolidacao()" ${this.loading ? "disabled" : ""} title="Empresas marcadas como consolidação padrão, pelo percentual da Moura Leite">
                Consolidação padrão
              </button>
              <button type="button" class="btn btn-primary fc-consult-btn${this.filtersDirty() ? " is-dirty" : ""}" onclick="FluxoCaixaApp.load()" ${this.loading ? "disabled" : ""} title="${this.filtersDirty() ? "A seleção ou o período mudou. Consulte de novo para atualizar a grade." : ""}">
                Consultar
              </button>
            </div>
          </div>
          <p id="fc-base-caixa" class="fc-stale" style="${(window.SiengeApiService && SiengeApiService._baseCaixaStatus) ? "" : "display:none"}">${this.esc((window.SiengeApiService && SiengeApiService._baseCaixaStatus) || "")}</p>
          ${this.error ? `<div class="fc-error">${this.esc(this.error)}</div>` : ""}
          <div class="fc-board">
            <div class="fc-tree-pane">
              <div class="fc-tree-toolbar">
                <div class="fc-tool-group">
                  <span class="fc-tool-label">Valores</span>
                  ${this.escalaHtml()}
                </div>
                <div class="fc-tool-group">
                  <span class="fc-tool-label">Colunas</span>
                  <div class="fc-agrupa" role="group" aria-label="Agrupar colunas do período">
                    ${this.agrupaBotoesHtml()}
                  </div>
                </div>
                <div class="fc-tool-group">
                  <span class="fc-tool-label">Níveis</span>
                  <div class="fc-tool-row">
                    <button type="button" class="fc-fold fc-fold-open" onclick="FluxoCaixaApp.expandAll()" ${canExpand ? "" : "disabled"} title="Expandir todos os níveis">
                      <i data-lucide="chevrons-down"></i> Expandir todos
                    </button>
                    <button type="button" class="fc-fold fc-fold-shut" onclick="FluxoCaixaApp.collapseAll()" ${canCollapse ? "" : "disabled"} title="Recolher todos os níveis">
                      <i data-lucide="chevrons-up"></i> Recolher todos
                    </button>
                  </div>
                </div>
                <div class="fc-tool-group fc-tool-end">
                  <button type="button" class="btn btn-excel" onclick="FluxoCaixaApp.exportGridExcel()" ${(this.rows || []).length && !this.loading ? "" : "disabled"} title="Exportar tabela atual para Excel">
                    <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar em Excel
                  </button>
                </div>
              </div>
              ${hasUnmatched ? `
                <div class="fc-warn fc-warn-bar">
                  <i data-lucide="alert-triangle" style="width:14px;height:14px;"></i>
                  Há ${this.fmt(unmatched.total)} em contas ainda não vinculadas à visão.
                  <button type="button" class="btn btn-outline fc-mini" onclick="switchTab('plano-financeiro','Plano Financeiro e Visões')">Alocar</button>
                </div>` : ""}
              <div class="fc-tree-scroll">
                ${this.filtersDirty() ? `<p id="fc-stale" class="fc-stale">A grade é da consulta anterior. Clique em Consultar para aplicar a empresa ou o período.</p>` : ""}
                ${this.loading
                  ? `<div class="fc-loading"><span class="fc-loading-spin" aria-hidden="true"></span><span>buscando lançamentos</span></div>`
                  : ((this.rows || []).length ? this.gridHtml() : "")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const nextScroll = root.querySelector(".fc-tree-scroll");
    const restore = () => {
      if (nextScroll) {
        nextScroll.scrollTop = keepTop;
        nextScroll.scrollLeft = keepLeft;
      }
      if (main) main.scrollTop = keepMain;
      if (keepWin) window.scrollTo(0, keepWin);
    };
    restore();
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
    if (window.lucide) lucide.createIcons();
  },

  visibleColumns() {
    const ids = this.gridCompanyIds();
    const tempo = this.tempoCols();
    const comparacao = () => (this.compMap
      ? [{ type: "cmp", edge: true }, { type: "var" }, { type: "varpct" }]
      : []);
    if (ids.length <= 1) {
      const id = ids[0] || "";
      const cols = tempo.map(c => Object.assign({ companyId: id }, c));
      if (!this.totalRepetido()) cols.push({ type: "total", companyId: id });
      return cols.concat(comparacao());
    }
    const cols = [];
    ids.forEach((id, idx) => {
      if (idx > 0) cols.push({ type: "gap" });
      const band = idx % 2 ? "fc-band-1" : "";
      const open = this.companyMonthsOpen && this.companyMonthsOpen.has(id);
      if (open) {
        tempo.forEach(c => cols.push(Object.assign({ companyId: id, band }, c)));
      }
      cols.push({ type: "co", companyId: id, band, edge: !open });
    });
    cols.push({ type: "gap" });
    cols.push({ type: "total", edge: true });
    return cols.concat(comparacao());
  },

  valorComparado(row) {
    if (!this.compMap) return 0;
    return Number(this.compMap[this.rowKey(row)]) || 0;
  },

  /* Variação % sobre o módulo do comparado: a seta segue o efeito no caixa, inclusive nas saídas. */
  variacaoPct(row) {
    const antes = this.valorComparado(row);
    const agora = Number(row.total) || 0;
    if (Math.abs(antes) < 0.005) return null;
    return (agora - antes) / Math.abs(antes) * 100;
  },

  valueOf(row, col) {
    if (!col) return Number(row.total) || 0;
    if (col.type === "cmp") return this.valorComparado(row);
    if (col.type === "var") return (Number(row.total) || 0) - this.valorComparado(row);
    if (col.type === "varpct") return this.variacaoPct(row);
    if (col.type === "total" && !col.companyId) return Number(row.total) || 0;
    const uma = this.gridCompanyIds().length <= 1;
    const bag = col.companyId && row.byCompany ? row.byCompany[String(col.companyId)] : null;
    const monthsBag = (bag && bag.months) || (uma ? row.months : null);
    if (col.type === "periodo") {
      return (col.months || []).reduce((s, m) => s + (Number(monthsBag && monthsBag[m]) || 0), 0);
    }
    if (col.type === "month") return Number(monthsBag && monthsBag[col.month]) || 0;
    if (col.type === "total" && uma) return Number(row.total) || 0;
    if (col.type === "total" || col.type === "co") return bag ? (Number(bag.total) || 0) : 0;
    return Number(row.total) || 0;
  },

  valClass(n, strong) {
    const v = Number(n) || 0;
    const tone = v < 0 ? "is-neg" : (v > 0 ? "is-pos" : "is-zero");
    return `fc-num ${tone}${strong ? " is-strong" : ""}`;
  },

  rowClass(r) {
    if (r.isCostCenter) return "fc-r-cc";
    if (r.isAccount) return "fc-r-acc";
    if (r.type === "formula") return "fc-r-formula";
    if (r.type === "resultado") return "fc-r-res";
    if (r.type === "total_n1") return "fc-r-n1";
    return "fc-r-node";
  },

  thPeriodo(p, extra, aberto) {
    const mark = String(extra || "");
    const cls = `fc-th-num fc-th-periodo${mark.replace(" row2", "")}`;
    if (aberto) {
      return `<th class="${cls} is-open" colspan="${p.months.length}" title="Fechar os meses. Os outros períodos continuam fechados." onclick="FluxoCaixaApp.toggleGrupo('${p.key}')">▾ ${this.esc(p.label)}</th>`;
    }
    const span = mark.indexOf("row2") >= 0 ? ` rowspan="2"` : "";
    return `<th class="${cls}"${span} title="Abrir os meses deste período" onclick="FluxoCaixaApp.toggleGrupo('${p.key}')">▸ ${this.esc(p.label)}</th>`;
  },

  gridHtml() {
    const cols = this.visibleColumns();
    const ids = this.gridCompanyIds();
    const head = ids.length <= 1 ? this.headUmaEmpresa() : this.headVariasEmpresas(ids);
    const body = (this.rows || []).map(r => this.gridRowHtml(r, cols)).join("");
    const escala = this.escala === "milhoes" ? "milhoes" : (this.escala === "inteiro" ? "inteiro" : "nominal");
    return `<table class="fc-grid is-${escala}">${head}<tbody>${body}</tbody></table>`;
  },

  headUmaEmpresa() {
    const agrupado = (this.agrupamento || "mes") !== "mes";
    const periodos = this.periodos();
    const abertoKey = agrupado ? this.grupoAberto : "";
    const aberto = periodos.some(p => p.key === abertoKey);
    const total = (span) => (this.totalRepetido() ? "" : `<th class="fc-th-num fc-th-total"${span}>Total</th>`);
    if (!aberto) {
      const cells = periodos.map(p => (
        agrupado
          ? this.thPeriodo(p, "", false).replace(' rowspan="2"', "")
          : `<th class="fc-th-num">${this.esc(p.label)}</th>`
      )).join("");
      return `<thead><tr><th class="fc-th-name">Estrutura</th>${cells}${total("")}${this.thComparacao("")}</tr></thead>`;
    }
    const row1 = [`<th class="fc-th-name" rowspan="2">Estrutura</th>`];
    const row2 = [];
    periodos.forEach(p => {
      if (p.key === abertoKey) {
        row1.push(this.thPeriodo(p, "", true));
        p.months.forEach((m, i) => row2.push(`<th class="fc-th-num${i === 0 ? " fc-co-edge" : ""}">${this.esc(this.monthLabel(m))}</th>`));
      } else {
        row1.push(this.thPeriodo(p, " row2", false));
      }
    });
    row1.push(total(` rowspan="2"`));
    row1.push(this.thComparacao(` rowspan="2"`));
    return `<thead><tr>${row1.join("")}</tr><tr class="fc-months">${row2.join("")}</tr></thead>`;
  },

  thComparacao(span) {
    if (!this.compMap) return "";
    const rot = this.esc(this.rotuloComparado());
    const unidade = this.escala === "milhoes" ? " mi" : "";
    return `<th class="fc-th-num fc-th-cmp fc-co-edge"${span} title="Mesmo período em ${rot}">${rot}</th>`
      + `<th class="fc-th-num fc-th-cmp fc-th-var"${span} title="Período atual menos ${rot}. Verde melhora o caixa, vermelho piora.">Var.${unidade}</th>`
      + `<th class="fc-th-num fc-th-cmp fc-th-varpct"${span} title="Variação sobre ${rot}. Verde melhora o caixa, vermelho piora.">%</th>`;
  },

  headVariasEmpresas(ids) {
    const agrupado = (this.agrupamento || "mes") !== "mes";
    const periodos = this.periodos();
    const abertoKey = agrupado ? this.grupoAberto : "";
    const periodoAberto = periodos.some(p => p.key === abertoKey);
    const anyOpen = ids.some(id => this.companyMonthsOpen && this.companyMonthsOpen.has(id));
    const span = 1 + (anyOpen ? 1 : 0) + (anyOpen && periodoAberto ? 1 : 0);
    const row1 = [`<th class="fc-th-name" rowspan="${span}">Estrutura</th>`];
    const row2 = [];
    const row3 = [];
    ids.forEach((id, idx) => {
      const c = this.companyById(id);
      const open = this.companyMonthsOpen && this.companyMonthsOpen.has(id);
      const label = this.esc(this.columnHeader(c || { id, usual: "", fullName: "" }));
      const tip = this.esc((c && c.fullName) || label);
      const chev = open ? "▾" : "▸";
      const band = idx % 2 ? " fc-band-1" : "";
      if (idx > 0) row1.push(`<th class="fc-gap" rowspan="${span}"></th>`);
      if (!open) {
        row1.push(`<th class="fc-th-co fc-co-edge${band}" rowspan="${span}" title="${tip}" onclick="FluxoCaixaApp.toggleCompanyMonths('${id}')">${chev} ${label}</th>`);
        return;
      }
      const tempo = this.tempoCols();
      row1.push(`<th class="fc-th-co fc-co-edge${band}" colspan="${tempo.length + 1}" title="${tip}" onclick="FluxoCaixaApp.toggleCompanyMonths('${id}')">${chev} ${label}</th>`);
      if (!periodoAberto) {
        periodos.forEach((p, i) => {
          const edge = i === 0 ? " fc-co-edge" : "";
          if (!agrupado) row2.push(`<th class="fc-th-num${edge}${band}">${this.esc(p.label)}</th>`);
          else row2.push(this.thPeriodo(p, edge + band, false).replace(' rowspan="2"', ""));
        });
        row2.push(`<th class="fc-th-num${band}">Total</th>`);
      } else {
        periodos.forEach((p, i) => {
          const edge = i === 0 ? " fc-co-edge" : "";
          if (p.key === abertoKey) {
            row2.push(this.thPeriodo(p, edge + band, true));
            p.months.forEach((m, mi) => row3.push(`<th class="fc-th-num${mi === 0 ? " fc-co-edge" : ""}${band}">${this.esc(this.monthLabel(m))}</th>`));
          } else {
            row2.push(this.thPeriodo(p, " row2" + band, false));
          }
        });
        row2.push(`<th class="fc-th-num${band}" rowspan="2">Total</th>`);
      }
    });
    row1.push(`<th class="fc-gap" rowspan="${span}"></th>`);
    row1.push(`<th class="fc-th-total fc-th-num fc-co-edge" rowspan="${span}">Total</th>`);
    row1.push(this.thComparacao(` rowspan="${span}"`));
    const r2 = anyOpen ? `<tr class="fc-months">${row2.join("")}</tr>` : "";
    const r3 = anyOpen && periodoAberto ? `<tr class="fc-months fc-months-2">${row3.join("")}</tr>` : "";
    return `<thead><tr>${row1.join("")}</tr>${r2}${r3}</thead>`;
  },

  ehVendaImoveis(r) {
    if (!r) return false;
    if (r.id === "g_01_01" || r.parentId === "g_01_01") return true;
    if (r.isCostCenter && r.parentAccountId) {
      const key = this.normAccountKey(r.parentAccountId);
      const acc = this.accountIndex[r.parentAccountId] || (key && this.accountIndex[key]);
      return !!(acc && acc.parentId === "g_01_01");
    }
    return false;
  },

  abrirCentrosVenda(toggleId, isAccount) {
    const id = String(toggleId || "");
    if (!id) return;
    if (isAccount) {
      if (this.expanded.has(id)) this.expanded.delete(id);
      else this.expanded.add(id);
    } else {
      const accIds = Object.values(this.accountIndex || {})
        .filter(a => a && a.parentId === "g_01_01")
        .map(a => "acc:" + (a.displayId || a.id));
      const aberto = this.expanded.has(id) && accIds.length > 0 && accIds.every(x => this.expanded.has(x));
      if (aberto) {
        this.expanded.delete(id);
        accIds.forEach(x => this.expanded.delete(x));
      } else {
        this.expanded.add(id);
        accIds.forEach(x => this.expanded.add(x));
      }
    }
    this.rebuildFromCache();
  },

  gridRowHtml(r, cols) {
    const pad = (r.level || 0) * 12;
    const toggleId = r.toggleId || r.id;
    const open = !!(toggleId && this.expanded.has(toggleId));
    const safeToggle = String(toggleId || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const chevron = r.hasKids
      ? `<button type="button" class="fc-chevron" onclick="event.stopPropagation();FluxoCaixaApp.toggle('${safeToggle}')">${open ? "▾" : "▸"}</button>`
      : `<span class="fc-chevron-spacer"></span>`;
    const drillId = r.isCostCenter ? (r.parentAccountId || "") : (r.id || "");
    const venda = this.ehVendaImoveis(r);
    const canDrill = !venda && !!(drillId && (r.isAccount || r.isCostCenter || r.type === "resultado" || r.type === "total_n1" || r.type === "formula"));
    const safeId = String(drillId).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const ccArg = r.isCostCenter ? `'${String(r.ccId || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'` : "''";
    const isAccFlag = r.isAccount || r.isCostCenter;
    const cells = cols.map(col => {
      if (col.type === "gap") return `<td class="fc-gap"></td>`;
      if (col.type === "cmp" || col.type === "var" || col.type === "varpct") return this.celulaComparacao(r, col);
      const v = this.valueOf(r, col);
      const strong = col.type !== "month";
      const extra = `${col.band ? " " + col.band : ""}${col.edge ? " fc-co-edge" : ""}`;
      const co = col.companyId ? `'${String(col.companyId).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'` : "''";
      const mo = col.type === "month" && col.month
        ? `'${col.month}'`
        : (col.type === "periodo" && col.months && col.months.length ? `'${col.months.join(",")}'` : "''");
      let click = "";
      let tip = "";
      if (this.escala !== "nominal") tip = this.fmtCheio(v);
      if (canDrill) {
        click = `onclick="FluxoCaixaApp.openDrill('${safeId}', ${isAccFlag ? "true" : "false"}, ${r.isCostCenter ? ccArg : "''"}, ${co}, ${mo})"`;
        tip = (tip ? tip + " · " : "") + "Ver lançamentos desta célula";
      } else if (venda && !r.isCostCenter) {
        click = `onclick="FluxoCaixaApp.abrirCentrosVenda('${safeToggle}', ${r.isAccount ? "true" : "false"})"`;
        tip = "Abrir os centros de custo";
      }
      return `<td class="${this.valClass(v, strong)}${extra}${click ? " is-cell" : ""}" ${click} title="${tip}">${this.fmt(v)}</td>`;
    }).join("");
    return `<tr class="${this.rowClass(r)}">
      <td class="fc-td-name" style="padding-left:${6 + pad}px">${chevron}<span>${this.esc(r.name)}</span></td>
      ${cells}
    </tr>`;
  },

  fmtPct(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  },

  cliqueComparado(r) {
    const drillId = r.isCostCenter ? (r.parentAccountId || "") : (r.id || "");
    const venda = this.ehVendaImoveis(r);
    const canDrill = !venda && !!(drillId && (r.isAccount || r.isCostCenter || r.type === "resultado" || r.type === "total_n1" || r.type === "formula"));
    const safeId = String(drillId).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const ccArg = r.isCostCenter ? `'${String(r.ccId || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'` : "''";
    const isAccFlag = r.isAccount || r.isCostCenter;
    const ids = this.gridCompanyIds();
    const co = ids.length === 1 ? `'${String(ids[0]).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'` : "''";
    const mo = (this.compMonths || []).join(",");
    if (canDrill) {
      return {
        click: `onclick="FluxoCaixaApp.openDrill('${safeId}', ${isAccFlag ? "true" : "false"}, ${r.isCostCenter ? ccArg : "''"}, ${co}, '${mo}', true)"`,
        tip: "Ver lançamentos desta célula"
      };
    }
    if (venda && !r.isCostCenter) {
      const toggleId = r.toggleId || r.id;
      const safeToggle = String(toggleId || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      return {
        click: `onclick="FluxoCaixaApp.abrirCentrosVenda('${safeToggle}', ${r.isAccount ? "true" : "false"})"`,
        tip: "Abrir os centros de custo"
      };
    }
    return { click: "", tip: "" };
  },

  celulaComparacao(r, col) {
    const edge = col.edge ? " fc-co-edge" : "";
    if (col.type === "cmp") {
      const v = this.valorComparado(r);
      const drill = this.cliqueComparado(r);
      const partes = [];
      if (this.escala !== "nominal") partes.push(this.fmtCheio(v));
      if (drill.tip) partes.push(drill.tip);
      const dica = partes.length ? ` title="${this.esc(partes.join(" · "))}"` : "";
      return `<td class="${this.valClass(v, true)} fc-cmp${edge}${drill.click ? " is-cell" : ""}" ${drill.click}${dica}>${this.fmt(v)}</td>`;
    }
    const delta = (Number(r.total) || 0) - this.valorComparado(r);
    const tom = Math.abs(delta) < 0.005 ? "is-flat" : (delta > 0 ? "is-up" : "is-down");
    const seta = tom === "is-up" ? "▲" : (tom === "is-down" ? "▼" : "");
    let texto = "";
    let dica = "";
    let tipo = "fc-var-pct";
    if (col.type === "var") {
      texto = this.fmt(delta);
      tipo = "fc-var-rs";
      if (this.escala !== "nominal") dica = ` title="${this.fmtCheio(delta)}"`;
    } else {
      const pct = this.variacaoPct(r);
      texto = pct == null ? (tom === "is-flat" ? "0,0%" : "novo") : this.fmtPct(pct);
    }
    return `<td class="fc-num is-strong fc-var ${tipo}${edge}"${dica}><span class="fc-var-pill ${tom}">${seta ? `<b>${seta}</b>` : ""}${texto}</span></td>`;
  },

  collectNodeItems(nodeId, store) {
    const bag = store || this.nodeItems;
    const visao = this.visao();
    const groups = visao.groups || [];
    const byId = Object.fromEntries(groups.map(g => [g.id, g]));
    const items = [];
    const walk = (id) => {
      const direct = bag[id] || [];
      direct.forEach(it => items.push(it));
      groups.filter(g => g.parentId === id).forEach(ch => walk(ch.id));
    };
    if (byId[nodeId] || bag[nodeId]) walk(nodeId);
    return items;
  },

  resolveDrill(id, isAccount, ccId) {
    const sid = String(id || "");
    const nk = this.normAccountKey(sid);
    const comparado = !!this._drillComparado;
    const accIndex = comparado ? (this.compAccountIndex || {}) : this.accountIndex;
    const nodeStore = comparado ? (this.compNodeItems || {}) : this.nodeItems;
    let info;
    if (isAccount) {
      const acc = accIndex[sid] || accIndex[nk] || null;
      if (!acc) info = { title: sid, subtitle: "Conta", items: [], total: 0 };
      else info = {
        title: `${acc.displayId || acc.id} ${acc.name || ""}`.trim(),
        subtitle: "Conta do plano financeiro",
        items: acc.items || [],
        total: acc.total || 0
      };
    } else {
      const row = (this.rows || []).find(r => !r.isAccount && !r.isCostCenter && String(r.id) === sid);
      const items = this.collectNodeItems(sid, nodeStore);
      const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      info = {
        title: (row && row.name) || sid,
        subtitle: "Nó da visão DFC (lançamentos agregados)",
        items,
        total: row && row.total != null ? row.total : total
      };
    }
    if (!ccId) return info;
    const want = String(ccId);
    const items = (info.items || []).filter(it => {
      const got = it.costCenterId != null && String(it.costCenterId).trim() !== "" ? String(it.costCenterId) : "—";
      return got === want;
    });
    const sample = items[0];
    const ccLabel = want === "—" ? "Sem centro de custo" : [want, sample && sample.costCenterName].filter(Boolean).join(" - ");
    const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    return {
      title: `${info.title} · ${ccLabel}`,
      subtitle: "Centro de custo",
      items,
      total
    };
  },

  fmtDatePt(iso) {
    const s = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  },

  movNumber(m) {
    if (!m) return "—";
    return m.bankMovementId || m.id || m.movementId || m.documentNumber || m.documentIdentification || "—";
  },

  movHistoric(m) {
    if (!m) return "—";
    return m.historic || m.history || m.bankMovementHistoricName || m.bankMovementOperationName
      || m.documentIdentificationName || m.originDescription || m.observations || "—";
  },

  /** Classifica o histórico de adiantamento / abatimento (reapropriação). */
  movAdvanceRole(m) {
    const h = String(this.movHistoric(m) || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (/REAPROP|ABATIMENTO\s+DE\s+ADIANT|ABATIMENTO\s+ADIANT/.test(h)) return "abatimento";
    if (/ADIANTAMENTO/.test(h)) return "adiantamento";
    return "";
  },

  /**
   * Título de Contas a Pagar / Receber ligado ao movimento bancário (Sienge).
   * Campos típicos: billId, documentIdentificationId/Number, installmentId, creditor/client.
   */
  movTitleInfo(m) {
    if (!m) {
      return { tipo: "", label: "—", party: "", role: "", billId: "", titleKey: "" };
    }
    const billId = m.billId || m.billPayableId || m.billReceivableId
      || m.payableBillId || m.receivableBillId || m.titleId || "";
    const docId = String(m.documentIdentificationId || m.documentId || m.documentsId || "").trim();
    const docNum = String(m.documentIdentificationNumber || m.documentNumber || "").trim();
    const docName = String(m.documentIdentificationName || "").trim();
    const installment = m.installmentId || m.installmentNumber || m.installment || "";
    const origin = String(m.bankMovementOriginId || m.originId || m.origin || "").toUpperCase();
    const blob = `${docId} ${docName} ${origin}`.toUpperCase();

    let tipo = "";
    if (m.creditorId && !m.clientId) tipo = "CP";
    else if (m.clientId && !m.creditorId) tipo = "CR";
    else if (/PAGAR|PAYABLE|\bCP\b|\bNP\b|\bNF\b|FORNECEDOR|CREDOR/.test(blob)) tipo = "CP";
    else if (/RECEBER|RECEIVABLE|\bCR\b|\bCT\b|CLIENTE/.test(blob)) tipo = "CR";
    else if (m.creditorId) tipo = "CP";
    else if (m.clientId) tipo = "CR";

    const docLabel = `${docId}${docNum}`.trim() || docNum || docId;
    const parts = [];
    if (tipo) parts.push(tipo);
    if (docLabel) parts.push(docLabel);
    else if (billId) parts.push(`#${billId}`);
    if (billId) {
      const parc = installment ? `/${installment}` : "";
      parts.push(`Tit. ${billId}${parc}`);
    }

    const party = m.creditorName || m.creditor || m.clientName || m.customerName || m.client || "";
    const role = this.movAdvanceRole(m);
    const label = parts.length ? parts.join(" · ") : "—";
    const titleKey = String(billId || docLabel || "").trim();

    return {
      tipo,
      label,
      party: party ? String(party) : "",
      role,
      billId: billId ? String(billId) : "",
      titleKey
    };
  },

  companyLabel(id) {
    const c = this.companyById(id);
    if (!c) return id != null ? String(id) : "—";
    const pct = this.consolidacaoAtiva ? ` · ${c.pct}%` : "";
    return `${c.id} - ${c.fullName}${pct}`;
  },

  companyLabelShort(id) {
    const c = this.companyById(id);
    if (!c) return id != null ? String(id) : "—";
    return this.columnHeader(c);
  },

  closeDrill() {
    const el = document.getElementById("fc-drill-modal");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  toggleDrillRateio() {
    this.drillRateioAberto = !this.drillRateioAberto;
    const args = this._drillReplay;
    if (!args) return;
    this.openDrill(args[0], args[1], args[2], args[3], args[4], args[5]);
  },

  grupoVisaoDoItem(it) {
    if (!it) return "—";
    let nid = it.nodeId || "";
    if (!nid) {
      const rawId = String(it.categoryId || "").trim();
      const nk = this.normAccountKey(rawId);
      const comparado = !!this._drillComparado;
      const accIndex = comparado ? (this.compAccountIndex || {}) : (this.accountIndex || {});
      const acc = accIndex[nk] || accIndex[rawId] || null;
      if (acc && acc.parentId) nid = acc.parentId;
    }
    if (!nid) {
      const rawId = String(it.categoryId || "").trim();
      const nk = this.normAccountKey(rawId);
      const dotted = this.formatAccountCode(rawId);
      const groups = ((this.visao() || {}).groups) || [];
      const hit = groups.find((g) => (g.accounts || []).some((id) => {
        const sid = String(id || "").trim();
        return sid === rawId || sid === dotted || (nk && this.normAccountKey(sid) === nk);
      }));
      if (hit) nid = hit.id;
    }
    const nome = nid ? this.nomeGrupo(nid) : "";
    return nome || "—";
  },

  planoDoItem(it) {
    if (!it) return "—";
    const code = this.formatAccountCode(it.categoryId);
    const name = it.categoryName || this.catName(it.categoryId) || "";
    const txt = [code, name].filter(Boolean).join(" ").trim();
    return txt || "—";
  },

  exportDrillExcel() {
    const ctx = this._drillExport;
    if (!ctx || !Array.isArray(ctx.items) || !ctx.items.length) {
      alert("Não há lançamentos para exportar.");
      return;
    }
    if (typeof XLSX === "undefined") {
      alert("A biblioteca XLSX não foi carregada. Atualize a página e tente novamente.");
      return;
    }
    const rows = ctx.items.map((it) => {
      const mov = it.mov || {};
      const title = this.movTitleInfo(mov);
      const role =
        title.role === "adiantamento" ? "ADIANTAMENTO"
          : (title.role === "abatimento" ? "ABATIMENTO" : "");
      const sharePct = (Number(it.share) || 0) * 100;
      const factorPct = (Number(it.factor) || 0) * 100;
      const raw = Number(it.rawBankAmount);
      const rateado = Number.isFinite(Number(it.rateadoBruto))
        ? Number(it.rateadoBruto)
        : (Number.isFinite(raw) ? raw * (Number(it.share) || 0) : "");
      return {
        "Data": this.fmtDatePt(this.cashDate(mov)),
        "Nº mov.": this.movNumber(mov),
        "Título CP/CR": title.label || "",
        "Favorecido / parte": title.party || "",
        "Tipo (adiant./abate)": role,
        "Empresa": this.companyLabel(it.companyId || mov.companyId),
        "C.C.": [it.costCenterId, it.costCenterName].filter(Boolean).join(" - ") || "",
        "Grupo da visão": this.grupoVisaoDoItem(it),
        "Plano financeiro": this.planoDoItem(it),
        "Histórico": this.movHistoric(mov),
        "Total título (API)": Number.isFinite(raw) ? raw : "",
        "% rateio C.C.": sharePct,
        "Valor rateado (título × %)": rateado === "" ? "" : rateado,
        "Fator MLDU %": factorPct,
        "Valor no DFC": Number(it.amount) || 0
      };
    });
    rows.push({
      "Data": "",
      "Nº mov.": "",
      "Título CP/CR": "",
      "Favorecido / parte": "",
      "Tipo (adiant./abate)": "",
      "Empresa": "",
      "C.C.": "",
      "Grupo da visão": "",
      "Plano financeiro": "",
      "Histórico": `Soma dos lançamentos (${ctx.items.length})`,
      "Total título (API)": "",
      "% rateio C.C.": "",
      "Valor rateado (título × %)": "",
      "Fator MLDU %": "",
      "Valor no DFC": Number(ctx.sum) || 0
    });
    rows.push({
      "Data": "",
      "Nº mov.": "",
      "Título CP/CR": "",
      "Favorecido / parte": "",
      "Tipo (adiant./abate)": "",
      "Empresa": "",
      "C.C.": "",
      "Grupo da visão": "",
      "Plano financeiro": "",
      "Histórico": "Total exibido na linha",
      "Total título (API)": "",
      "% rateio C.C.": "",
      "Valor rateado (título × %)": "",
      "Fator MLDU %": "",
      "Valor no DFC": Number(ctx.lineTotal) || 0
    });

    try {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 12 }, { wch: 12 }, { wch: 42 }, { wch: 36 }, { wch: 14 },
        { wch: 42 }, { wch: 32 }, { wch: 36 }, { wch: 42 }, { wch: 40 },
        { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 14 }
      ];
      const wb = XLSX.utils.book_new();
      const sheetName = String(ctx.sheetName || "Lancamentos").slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const safeName = String(ctx.fileBase || "lancamentos_dfc")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
      XLSX.writeFile(wb, `${safeName || "lancamentos_dfc"}.xlsx`);
    } catch (e) {
      console.error("[FluxoCaixa] export drill:", e);
      alert("Erro ao exportar Excel: " + (e.message || e));
    }
  },

  openDrill(id, isAccount, ccId, companyId, month, comparado) {
    this._drillComparado = !!comparado;
    this._drillReplay = [id, isAccount, ccId, companyId, month, !!comparado];
    const prevDrill = document.querySelector("#fc-drill-modal .crm-scroll-table");
    const keepDrill = prevDrill ? prevDrill.scrollTop : 0;
    const tree = document.querySelector("#fluxo-caixa-root .fc-tree-scroll");
    const keepTop = tree ? tree.scrollTop : 0;
    const keepLeft = tree ? tree.scrollLeft : 0;
    const main = document.querySelector(".main-content");
    const keepMain = main ? main.scrollTop : 0;
    const keepWin = window.scrollY || document.documentElement.scrollTop || 0;
    const hold = () => {
      const box = document.querySelector("#fluxo-caixa-root .fc-tree-scroll");
      if (box) {
        box.scrollTop = keepTop;
        box.scrollLeft = keepLeft;
      }
      if (main) main.scrollTop = keepMain;
      if (keepWin) window.scrollTo(0, keepWin);
    };
    const info = this.resolveDrill(id, !!isAccount, ccId);
    const wantCo = companyId != null && String(companyId) !== "" ? String(companyId) : "";
    const wantMonths = String(month == null ? "" : month)
      .split(",")
      .map(s => s.trim().slice(0, 7))
      .filter(s => /^\d{4}-\d{2}$/.test(s));
    let items = [...(info.items || [])].filter((it) => {
      if (wantCo && String(it.companyId || "") !== wantCo) return false;
      if (wantMonths.length) {
        const mk = String(it.month || this.cashDate(it.mov || {}) || "").slice(0, 7);
        if (wantMonths.indexOf(mk) < 0) return false;
      }
      return true;
    });
    items.sort((a, b) => {
      const da = this.cashDate(a.mov || {}) || String(a.month || "");
      const db = this.cashDate(b.mov || {}) || String(b.month || "");
      return da.localeCompare(db);
    });
    const sum = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const partes = [];
    if (wantCo) partes.push(this.companyLabelShort(wantCo));
    if (wantMonths.length === 1) partes.push(this.monthLabel(wantMonths[0]));
    else if (wantMonths.length > 1) partes.push(this.rotuloPeriodo(wantMonths));
    if (partes.length) info.subtitle = `${info.subtitle} · ${partes.join(" · ")}`;
    info.total = sum;

    // Pares adiantamento × abatimento pelo mesmo título (billId / documento)
    const byTitle = {};
    items.forEach((it) => {
      const t = this.movTitleInfo(it.mov || {});
      if (!t.titleKey || !t.role) return;
      if (!byTitle[t.titleKey]) byTitle[t.titleKey] = { adiantamento: false, abatimento: false };
      byTitle[t.titleKey][t.role] = true;
    });
    const pairedTitles = new Set(
      Object.keys(byTitle).filter((k) => byTitle[k].adiantamento && byTitle[k].abatimento)
    );

    this._drillItems = items;
    const compPeriodo = this._drillComparado ? this.periodoComparado() : null;
    const periodoIni = compPeriodo && compPeriodo.start ? compPeriodo.start : this.startDate;
    const periodoFim = compPeriodo && compPeriodo.end ? compPeriodo.end : this.endDate;
    this._drillExport = {
      items,
      sum,
      lineTotal: info.total,
      title: info.title,
      subtitle: info.subtitle,
      startDate: periodoIni,
      endDate: periodoFim,
      sheetName: "Lancamentos",
      fileBase: `dfc_${info.title || "conta"}_${periodoIni}_${periodoFim}`
    };

    const rateioOn = !!this.drillRateioAberto;
    const leadSpan = rateioOn ? 12 : 8;
    const rateioHead = rateioOn
      ? `<th class="fc-drill-num">Total título</th>
                <th class="fc-drill-num">% rateio</th>
                <th class="fc-drill-num">Valor rateado</th>
                <th class="fc-drill-num">Fator MLDU</th>`
      : "";
    const rateioCols = rateioOn
      ? `<col class="fc-drill-c-num"><col class="fc-drill-c-num"><col class="fc-drill-c-num"><col class="fc-drill-c-pct">`
      : "";

    const body = items.length
      ? `<div style="overflow:auto;max-height:calc(88vh - 160px);" class="crm-scroll-table">
          <table class="custom-table fc-drill-table${rateioOn ? " is-wide" : ""}">
            <colgroup>
              <col class="fc-drill-c-data">
              <col class="fc-drill-c-mov">
              <col class="fc-drill-c-title">
              <col class="fc-drill-c-emp">
              <col class="fc-drill-c-cc">
              <col class="fc-drill-c-grupo">
              <col class="fc-drill-c-plano">
              <col class="fc-drill-c-hist">
              ${rateioCols}
              <col class="fc-drill-c-dfc">
            </colgroup>
            <thead>
              <tr>
                <th>Data</th>
                <th>Nº mov.</th>
                <th>Título CP/CR</th>
                <th>Empresa</th>
                <th>C.C.</th>
                <th>Grupo da visão</th>
                <th>Plano financeiro</th>
                <th>Histórico</th>
                ${rateioHead}
                <th class="fc-drill-num">Valor no DFC</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => {
                const mov = it.mov || {};
                const amt = Number(it.amount) || 0;
                const raw = Number(it.rawBankAmount);
                const sharePct = (Number(it.share) || 0) * 100;
                const shareTxt = sharePct.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: sharePct > 0 && sharePct < 1 ? 6 : 2
                });
                const factorPct = (Number(it.factor) || 0) * 100;
                const rateado = Number.isFinite(Number(it.rateadoBruto))
                  ? Number(it.rateadoBruto)
                  : (Number.isFinite(raw) ? raw * (Number(it.share) || 0) : NaN);
                const color = amt < 0 ? "#b91c1c" : (amt > 0 ? "#105436" : "#64748b");
                const rawColor = Number.isFinite(raw)
                  ? (raw < 0 ? "#b91c1c" : (raw > 0 ? "#105436" : "#64748b"))
                  : "#64748b";
                const rateadoColor = Number.isFinite(rateado)
                  ? (rateado < 0 ? "#b91c1c" : (rateado > 0 ? "#105436" : "#64748b"))
                  : "#64748b";
                const title = this.movTitleInfo(mov);
                const titleHtml = title.billId
                  ? `<button type="button" class="fc-title-btn fc-drill-share" onclick="event.stopPropagation();FluxoCaixaApp.abrirTituloDrill(${idx})">${this.esc(title.label)}</button>`
                  : `<span class="fc-drill-share">${this.esc(title.label)}</span>`;
                const roleBadge = title.role === "adiantamento"
                  ? `<span class="fc-drill-badge is-adiant">ADIANT.</span>`
                  : (title.role === "abatimento"
                    ? `<span class="fc-drill-badge is-abate">ABATE</span>`
                    : "");
                const pairMark = title.titleKey && pairedTitles.has(title.titleKey)
                  ? `<span class="fc-drill-pair" title="Mesmo título com adiantamento e abatimento">↔</span>`
                  : "";
                const partyHtml = title.party
                  ? `<span class="fc-drill-party fc-drill-share">${this.esc(title.party)}</span>`
                  : "";
                const ccTxt = [it.costCenterId, it.costCenterName].filter(Boolean).join(" — ") || "—";
                const grupoTxt = this.grupoVisaoDoItem(it);
                const planoTxt = this.planoDoItem(it);
                const hist = this.movHistoric(mov);
                const rateioCells = rateioOn
                  ? `<td class="fc-drill-num" style="font-weight:600;color:${rawColor};" title="Valor integral do título/movimento na API">${Number.isFinite(raw) ? this.fmt(raw) : "—"}</td>
                  <td class="fc-drill-num" title="${it.rateRaw != null ? "Percentual na API: " + this.esc(String(it.rateRaw)) : ""}">${shareTxt}%</td>
                  <td class="fc-drill-num" style="font-weight:700;color:${rateadoColor};" title="Total título × % rateio do C.C.">${Number.isFinite(rateado) ? this.fmt(rateado) : "—"}</td>
                  <td class="fc-drill-num">${factorPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>`
                  : "";
                return `<tr class="fc-drill-row${title.billId ? " is-open" : ""}" ${title.billId ? `onclick="FluxoCaixaApp.abrirTituloDrill(${idx})" title="Abrir o título"` : ""}>
                  <td class="fc-drill-fix">${this.esc(this.fmtDatePt(this.cashDate(mov)))}</td>
                  <td class="fc-drill-fix fc-drill-mov">${this.esc(this.movNumber(mov))}</td>
                  <td class="fc-drill-txt">
                    <div class="fc-drill-line" title="${this.esc(title.label + (title.party ? " · " + title.party : ""))}">${titleHtml}${pairMark}${partyHtml}</div>
                  </td>
                  <td class="fc-drill-txt" title="${this.esc(this.companyLabel(it.companyId || mov.companyId))}"><div class="fc-drill-line"><span class="fc-drill-share">${this.esc(this.companyLabelShort(it.companyId || mov.companyId))}</span></div></td>
                  <td class="fc-drill-txt" title="${this.esc(ccTxt)}"><div class="fc-drill-line"><span class="fc-drill-share">${this.esc(ccTxt)}</span></div></td>
                  <td class="fc-drill-txt" title="${this.esc(grupoTxt)}"><div class="fc-drill-line"><span class="fc-drill-share">${this.esc(grupoTxt)}</span></div></td>
                  <td class="fc-drill-txt" title="${this.esc(planoTxt)}"><div class="fc-drill-line"><span class="fc-drill-share">${this.esc(planoTxt)}</span></div></td>
                  <td class="fc-drill-txt" title="${this.esc(hist)}"><div class="fc-drill-line"><span class="fc-drill-share">${this.esc(hist)}</span>${roleBadge}</div></td>
                  ${rateioCells}
                  <td class="fc-drill-num" style="font-weight:800;color:${color};">${this.fmt(amt)}</td>
                </tr>`;
              }).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="${leadSpan}" style="padding:12px;font-weight:800;text-align:right;border-top:2px solid #e2e8f0;">Soma dos lançamentos (${items.length})</td>
                <td style="padding:12px;text-align:right;font-weight:800;font-variant-numeric:tabular-nums;border-top:2px solid #e2e8f0;color:${sum < 0 ? "#b91c1c" : "#105436"};">${this.fmt(sum)}</td>
              </tr>
              <tr>
                <td colspan="${leadSpan}" style="padding:4px 12px 12px;font-weight:700;text-align:right;color:#64748b;">Total exibido na linha</td>
                <td style="padding:4px 12px 12px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#64748b;">${this.fmt(info.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
      : `<div style="padding:28px;text-align:center;color:#64748b;">Nenhum lançamento agrupado nesta linha no período.</div>`;

    this.closeDrill();
    const overlay = document.createElement("div");
    overlay.id = "fc-drill-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:16px;";
    overlay.onclick = (e) => { if (e.target === overlay) this.closeDrill(); };
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:min(1680px,98vw);max-height:94vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.25);">
        <div style="padding:14px 18px;background:#105436;color:#fff;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-radius:12px 12px 0 0;flex-shrink:0;">
          <div style="min-width:0;">
            <div style="font-size:1.05rem;font-weight:800;">Lançamentos · ${this.esc(info.title)}</div>
            <div style="font-size:0.8rem;opacity:.9;margin-top:3px;">${this.esc(info.subtitle)} · ${this.esc(this.startDate)} a ${this.esc(this.endDate)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <button type="button" class="fc-rateio-btn${this.drillRateioAberto ? " is-on" : ""}" onclick="event.stopPropagation();FluxoCaixaApp.toggleDrillRateio()" title="Total do título, % de rateio, valor rateado e fator MLDU">
              <i data-lucide="${this.drillRateioAberto ? "chevrons-left" : "columns-3"}"></i>
              ${this.drillRateioAberto ? "Fechar rateio" : "Colunas de rateio"}
            </button>
            <button type="button" class="btn btn-sm btn-excel" onclick="event.stopPropagation();FluxoCaixaApp.exportDrillExcel()" ${items.length ? "" : "disabled"}
              title="Exportar quadro em Excel">
              <i data-lucide="download" style="width:14px;height:14px;"></i> Excel
            </button>
            <button type="button" onclick="FluxoCaixaApp.closeDrill()" style="border:none;background:rgba(255,255,255,0.15);color:#fff;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:1.25rem;line-height:1;">×</button>
          </div>
        </div>
        <div style="padding:16px 18px 20px;overflow:auto;">${body}</div>
      </div>`;
    document.body.appendChild(overlay);
    hold();
    requestAnimationFrame(hold);
    try { if (window.lucide) lucide.createIcons({ nodes: [overlay] }); } catch (e) {}
    const drillBox = overlay.querySelector(".crm-scroll-table");
    if (drillBox) drillBox.scrollTop = keepDrill;
    hold();
  },

  abrirTituloDrill(idx) {
    const it = (this._drillItems || [])[Number(idx)];
    if (!it) return;
    const mov = it.mov || {};
    const title = this.movTitleInfo(mov);
    if (!title.billId) return;
    if (title.tipo === "CR") {
      this.abrirReceber(title, mov, it);
      return;
    }
    if (window.ComprasControleApp && typeof ComprasControleApp.abrirTituloRow === "function") {
      ComprasControleApp.abrirTituloRow({
        titulo: title.billId,
        parcela: mov.installmentId || mov.installmentNumber || mov.installment || 1,
        credor: title.party || mov.creditorName || "",
        credorId: mov.creditorId || "",
        companyId: it.companyId || mov.companyId || "",
        documento: mov.documentIdentificationNumber || mov.documentNumber || "",
        docId: mov.documentIdentificationId || mov.documentId || "",
        docNome: mov.documentIdentificationName || "",
        valor: Number(it.rawBankAmount),
        valorAjustado: Number(it.rawBankAmount)
      });
      return;
    }
    this.abrirReceber(title, mov, it);
  },

  closeReceber() {
    const el = document.getElementById("fc-receber-modal");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  async abrirReceber(title, mov, it) {
    this.closeReceber();
    const overlay = document.createElement("div");
    overlay.id = "fc-receber-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:10040;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:16px;";
    overlay.onclick = (e) => { if (e.target === overlay) this.closeReceber(); };
    overlay.innerHTML = `<div class="fc-receber-box"><div style="font-weight:800;color:#105436;">Abrindo título ${this.esc(title.billId)}…</div></div>`;
    document.body.appendChild(overlay);
    const billId = title.billId;
    let bill = null;
    let anexos = [];
    let erro = "";
    try {
      if (typeof window.siengeFetchWithRetry !== "function") throw new Error("A API do Sienge não está disponível nesta tela.");
      bill = await window.siengeFetchWithRetry("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId), 1);
      try {
        if (window.FluxoCaixaDiarioApp && typeof FluxoCaixaDiarioApp.anexosDe === "function") {
          anexos = await FluxoCaixaDiarioApp.anexosDe(billId, "receber");
        }
      } catch (e2) {
        anexos = [];
      }
    } catch (e) {
      erro = (e && e.message) ? e.message : "Não consegui abrir o título.";
    }
    if (!document.getElementById("fc-receber-modal")) return;
    const b = bill || {};
    const cliente = b.customerName || b.clientName || title.party || "—";
    const doc = [b.documentIdentificationId || b.documentId || mov.documentIdentificationId, b.documentNumber || mov.documentNumber].filter(Boolean).join(" ");
    const valor = b.originalAmount != null ? b.originalAmount : (b.receivableBillValue != null ? b.receivableBillValue : it.rawBankAmount);
    const empresa = this.companyLabel(it.companyId || mov.companyId || b.companyId);
    const anexosHtml = (anexos || []).length
      ? (anexos || []).map(a => `<button type="button" class="btn btn-outline btn-sm" style="height:32px;" onclick="FluxoCaixaDiarioApp.baixarAnexo('${this.esc(billId)}','${this.esc(a.id)}','${this.esc(a.name || "anexo.pdf")}','receber')">${this.esc(a.description || a.name || "Anexo")}</button>`).join("")
      : `<span style="color:#64748b;">Nenhum anexo neste título.</span>`;
    const box = overlay.querySelector(".fc-receber-box");
    if (!box) return;
    box.innerHTML = erro
      ? `<div style="color:#b91c1c;font-weight:700;">${this.esc(erro)}</div><button type="button" class="btn btn-outline" style="margin-top:12px;" onclick="FluxoCaixaApp.closeReceber()">Fechar</button>`
      : `<div class="fc-receber-head">
          <div>
            <strong>Título ${this.esc(billId)}</strong>
            <span>${this.esc(doc || title.label || "")}</span>
          </div>
          <button type="button" onclick="FluxoCaixaApp.closeReceber()">×</button>
        </div>
        <dl class="fc-receber-dl">
          <dt>Cliente</dt><dd>${this.esc(cliente)}</dd>
          <dt>Empresa</dt><dd>${this.esc(empresa)}</dd>
          <dt>Emissão</dt><dd>${this.esc(this.fmtDatePt(b.issueDate || b.billDate || ""))}</dd>
          <dt>Vencimento</dt><dd>${this.esc(this.fmtDatePt(b.dueDate || mov.dueDate || ""))}</dd>
          <dt>Valor</dt><dd>${this.fmt(valor)}</dd>
          <dt>Histórico</dt><dd>${this.esc(this.movHistoric(mov))}</dd>
        </dl>
        <div class="fc-receber-anexos"><span>Anexos</span>${anexosHtml}</div>`;
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  rotuloColuna(col) {
    if (!col || col.type === "gap") return "";
    if (col.type === "cmp") return this.rotuloComparado();
    if (col.type === "var") return "Var. R$";
    if (col.type === "varpct") return "Var. %";
    if (col.type === "total" && !col.companyId) return "Total";
    if (col.type === "co" || (col.type === "total" && col.companyId && this.gridCompanyIds().length > 1 && col.type === "co")) {
      const c = this.companyById(col.companyId);
      return this.columnHeader(c || { id: col.companyId, usual: "", fullName: "" });
    }
    let base = "Total";
    if (col.type === "month") base = this.monthLabel(col.month);
    else if (col.type === "periodo") base = col.label || this.rotuloPeriodo(col.months);
    else if (col.type === "total") base = "Total";
    if (this.gridCompanyIds().length > 1 && col.companyId && col.type !== "co") {
      const c = this.companyById(col.companyId);
      const nome = this.columnHeader(c || { id: col.companyId, usual: "", fullName: "" });
      return `${nome} · ${base}`;
    }
    return base;
  },

  textoEmpresas() {
    const ids = this.gridCompanyIds();
    if (this.consolidacaoAtiva) return `Consolidação padrão · ${ids.length} ${ids.length === 1 ? "empresa" : "empresas"}`;
    if (ids.length <= 1) {
      const c = this.companyById(ids[0] || "");
      return c ? this.columnHeader(c) : "Empresa selecionada";
    }
    return `${ids.length} empresas`;
  },

  nomeGrupo(id) {
    const g = (((this.visao() || {}).groups) || []).find(x => x.id === id);
    return (g && g.name) || String(id || "");
  },

  contasVivas() {
    return Object.values(this.accountIndex || {}).filter(a => a && Math.abs(Number(a.total) || 0) > 0.5);
  },

  valsConta(a) {
    return (this.months || []).map(m => Number(a.months && a.months[m]) || 0);
  },

  metades(vals) {
    const mid = Math.max(1, Math.floor((vals || []).length / 2));
    return {
      mid,
      antes: vals.slice(0, mid).reduce((s, v) => s + v, 0),
      depois: vals.slice(mid).reduce((s, v) => s + v, 0)
    };
  },

  fichaConta(a) {
    const vals = this.valsConta(a);
    return {
      kind: "acc",
      id: a.id,
      nome: `${a.displayId || a.id} ${a.name || ""}`.trim(),
      grupo: this.nomeGrupo(a.parentId),
      parentId: a.parentId,
      total: Number(a.total) || 0,
      variacao: vals.length ? vals[vals.length - 1] - vals[0] : 0,
      primeiro: vals[0] || 0,
      ultimo: vals.length ? vals[vals.length - 1] : 0,
      vals
    };
  },

  papelReceita(parentId) {
    if (parentId === "g_01_01") return "Produto";
    if (parentId === "g_01_02") return "Serviço";
    if (parentId === "g_01_03") return "Não operacional";
    if (parentId === "g_01_04") return "Cancelamento";
    return "Receita";
  },

  ehSaidaConta(parentId) {
    return this.isCashOutflowGroup(parentId) || parentId === "g_11_01";
  },

  ehAplicacao(c) {
    if (c.parentId === "g_09_01" || c.parentId === "g_09_03") return true;
    const n = String(c.nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return /APLICAC|FUNDO DE INVEST|CDI|RENDIMENTO/.test(n);
  },

  mesBcb(data) {
    const s = String(data || "").trim();
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[3]}-${String(br[2]).padStart(2, "0")}`;
    const iso = s.match(/^(\d{4})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}`;
    return "";
  },

  async cdiDoPeriodo() {
    const months = this.months || [];
    this._cdiByMonth = this._cdiByMonth || {};
    if (window.InvestimentoApp && InvestimentoApp.cdiByMonth) {
      months.forEach(m => {
        const n = Number(InvestimentoApp.cdiByMonth[m]);
        if (n > 0) this._cdiByMonth[m] = n;
      });
    }
    const missing = months.filter(m => !(Number(this._cdiByMonth[m]) > 0));
    if (missing.length && months.length) {
      const [ys, ms] = months[0].split("-");
      const [ye, me] = months[months.length - 1].split("-");
      const dataInicial = `01/${ms}/${ys}`;
      const last = new Date(Number(ye), Number(me), 0);
      const dataFinal = `${String(last.getDate()).padStart(2, "0")}/${String(last.getMonth() + 1).padStart(2, "0")}/${last.getFullYear()}`;
      const q = `code=4391&dataInicial=${encodeURIComponent(dataInicial)}&dataFinal=${encodeURIComponent(dataFinal)}`;
      const urls = [
        `/api/bcb-sgs?${q}`,
        `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados?formato=json&dataInicial=${encodeURIComponent(dataInicial)}&dataFinal=${encodeURIComponent(dataFinal)}`
      ];
      for (let i = 0; i < urls.length; i++) {
        try {
          const res = await fetch(urls[i]);
          if (!res.ok) continue;
          const json = await res.json();
          if (!Array.isArray(json) || !json.length) continue;
          json.forEach(r => {
            const key = this.mesBcb(r && r.data);
            if (!key) return;
            const n = Number(String(r.valor == null ? "" : r.valor).replace(",", ".").replace("%", ""));
            if (Number.isFinite(n) && n !== 0) this._cdiByMonth[key] = n;
          });
          break;
        } catch (e) { /* tenta a próxima fonte */ }
      }
    }
    const vals = months.map(m => ({ m, n: Number(this._cdiByMonth[m]) || 0 })).filter(x => x.n > 0);
    const fmt = n => n.toFixed(2).replace(".", ",");
    if (!vals.length) {
      return { texto: "O CDI do período não veio da série 4391 do Banco Central.", media: null, meses: [] };
    }
    const media = vals.reduce((s, x) => s + x.n, 0) / vals.length;
    const lista = vals.map(x => `${this.monthLabel(x.m)} ${fmt(x.n)}%`).join(" · ");
    return {
      media,
      meses: vals,
      texto: `CDI médio ${fmt(media)}% a.m. (${vals.length} ${vals.length === 1 ? "mês" : "meses"}, série 4391 do Banco Central). ${lista}.`
    };
  },

  montarInsights(cdi) {
    const meses = (this.months || []).length;
    const contas = this.contasVivas().map(a => this.fichaConta(a));
    const porVar = contas.filter(c => meses >= 2 && Math.abs(c.variacao) > 0.5);
    const positivas = porVar.filter(c => c.variacao > 0).sort((a, b) => b.variacao - a.variacao).slice(0, 8);
    const negativas = porVar.filter(c => c.variacao < 0).sort((a, b) => a.variacao - b.variacao).slice(0, 8);
    const receitas = contas
      .filter(c => this.isRevenueGroup(c.parentId) && c.total > 0.5)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(c => Object.assign({ papel: this.papelReceita(c.parentId) }, c));
    const quedas = [];
    if (meses >= 2) {
      contas.filter(c => this.isRevenueGroup(c.parentId) && c.total > 0.5).forEach(c => {
        const h = this.metades(c.vals);
        const queda = h.antes - h.depois;
        if (h.antes > 500 && queda > 0 && queda / h.antes >= 0.15) {
          quedas.push(Object.assign({ antes: h.antes, depois: h.depois, queda }, c));
        }
      });
      quedas.sort((a, b) => b.queda - a.queda);
    }
    const servicos = contas
      .filter(c => c.parentId === "g_01_02" && Math.abs(c.total) > 0.5)
      .sort((a, b) => b.total - a.total);
    const aplicacoes = contas.filter(c => this.ehAplicacao(c)).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    const aumentos = [];
    if (meses >= 2) {
      contas.filter(c => this.ehSaidaConta(c.parentId)).forEach(c => {
        const h = this.metades(c.vals);
        const gasto = v => (v < 0 ? -v : 0);
        const antes = c.vals.slice(0, h.mid).reduce((s, v) => s + gasto(v), 0);
        const depois = c.vals.slice(h.mid).reduce((s, v) => s + gasto(v), 0);
        const aumento = depois - antes;
        if (aumento > 500) aumentos.push(Object.assign({ antes, depois, aumento }, c));
      });
      aumentos.sort((a, b) => b.aumento - a.aumento);
    }
    const lineares = [];
    if (meses >= 4) {
      contas.filter(c => this.ehSaidaConta(c.parentId)).forEach(c => {
        const vals = c.vals;
        const media = vals.reduce((s, v) => s + v, 0) / vals.length;
        if (Math.abs(media) < 500) return;
        const variance = vals.reduce((s, v) => s + (v - media) * (v - media), 0) / vals.length;
        const std = Math.sqrt(variance);
        if (std / Math.abs(media) > 0.22) return;
        let worst = null;
        vals.forEach((v, i) => {
          const dev = Math.abs(v - media);
          const lim = Math.max(Math.abs(media) * 0.45, std * 2, 1500);
          if (dev >= lim && (!worst || dev > worst.dev)) worst = { i, v, dev };
        });
        if (!worst) return;
        lineares.push(Object.assign({
          media,
          desvio: worst.dev,
          mes: this.monthLabel(this.months[worst.i]),
          mesKey: this.months[worst.i],
          valorMes: worst.v
        }, c));
      });
      lineares.sort((a, b) => b.desvio - a.desvio);
    }
    return {
      meses,
      periodo: `${this.startDate} a ${this.endDate}`,
      positivas,
      negativas,
      receitas,
      quedas: quedas.slice(0, 8),
      servicos: servicos.slice(0, 8),
      aplicacoes: aplicacoes.slice(0, 8),
      cdi: cdi || { texto: "", media: null, meses: [] },
      aumentos: aumentos.slice(0, 8),
      lineares: lineares.slice(0, 8)
    };
  },

  insightBtn(it, meta) {
    const id = encodeURIComponent(String(it.id || ""));
    const month = encodeURIComponent(String(it.mesKey || ""));
    const kind = it.kind === "node" ? "node" : "acc";
    return `<button type="button" class="fc-ins-item" onclick="FluxoCaixaApp.abrirInsight('${kind}','${id}','${month}')">
      <span>${this.esc(it.nome)}</span>
      <small>${this.esc(meta)}</small>
    </button>`;
  },

  listaInsights(itens, vazio, metaFn) {
    if (!itens || !itens.length) return `<p class="fc-ins-vazio">${this.esc(vazio)}</p>`;
    return `<div class="fc-ins-lista">${itens.map(it => this.insightBtn(it, metaFn(it))).join("")}</div>`;
  },

  async gerarInsights() {
    if (this.loading || !(this.rows || []).length) {
      alert("Consulte o fluxo antes de gerar os insights.");
      return;
    }
    const btn = document.querySelector("#fluxo-caixa-root .fc-insights-btn");
    if (btn) btn.disabled = true;
    try {
      const cdi = await this.cdiDoPeriodo();
      this._insights = this.montarInsights(cdi);
      this.abrirInsights();
    } catch (e) {
      console.warn("[Fluxo de Caixa] insights", e);
      alert("Não consegui montar os insights.");
    } finally {
      if (btn && btn.isConnected) btn.disabled = false;
    }
  },

  abrirInsight(kind, idEnc, monthEnc) {
    let id = "";
    let month = "";
    try { id = decodeURIComponent(idEnc || ""); } catch (e) { id = String(idEnc || ""); }
    try { month = decodeURIComponent(monthEnc || ""); } catch (e) { month = String(monthEnc || ""); }
    this.openDrill(id, kind === "acc", "", "", month);
  },

  fecharInsights() {
    const el = document.getElementById("fc-insights-modal");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  abrirInsights() {
    const ins = this._insights;
    if (!ins) return;
    this.fecharInsights();
    const produtos = ins.receitas.filter(c => c.papel === "Produto").slice(0, 3).map(c => c.nome);
    const fraseProdutos = produtos.length
      ? `Os produtos com mais recebimento são ${produtos.join(", ")}.`
      : "Nenhuma conta de venda de imóveis entrou entre as receitas do período.";
    const fraseServicos = ins.servicos.length
      ? `Houve recebimento de serviços em ${ins.servicos.length} ${ins.servicos.length === 1 ? "conta" : "contas"}.`
      : "Não houve recebimento classificado em 01.02 Receita de serviços.";
    const somaAplic = ins.aplicacoes.reduce((s, c) => s + c.total, 0);
    const fraseAplic = ins.aplicacoes.length
      ? `O caixa das aplicações e receitas financeiras somou ${this.fmt(somaAplic)}. ${ins.cdi.texto}`
      : `O DFC não tem movimentação classificada em aplicações ou receitas financeiras. ${ins.cdi.texto}`;
    const avisoMes = ins.meses < 2
      ? "O período tem um mês só. A variação, a queda e o desvio aparecem quando há pelo menos dois meses. O perfil linear pede quatro."
      : "Variação monetária = valor do último mês menos o valor do primeiro mês.";
    const overlay = document.createElement("div");
    overlay.id = "fc-insights-modal";
    overlay.innerHTML = `
      <div class="fc-ins-box" role="dialog" aria-label="Insights do fluxo de caixa">
        <div class="fc-ins-head">
          <div>
            <strong>Insights do fluxo de caixa</strong>
            <span>${this.esc(ins.periodo)} · ${this.esc(this.textoEmpresas())}</span>
          </div>
          <div class="fc-ins-actions">
            <button type="button" class="btn btn-outline fc-ins-pdf" onclick="FluxoCaixaApp.exportInsightsPdf()">PDF para a diretoria</button>
            <button type="button" class="btn btn-outline fc-ins-pdf" onclick="FluxoCaixaApp.fecharInsights()">Fechar</button>
            <button type="button" class="fc-ins-x" onclick="FluxoCaixaApp.fecharInsights()" aria-label="Fechar">×</button>
          </div>
        </div>
        <div class="fc-ins-body">
          <p class="fc-ins-lead">${this.esc(avisoMes)} Clique em um item para abrir os lançamentos.</p>
          <section class="fc-ins-sec">
            <h3>Maiores variações positivas</h3>
            ${this.listaInsights(ins.positivas, "Nenhuma conta melhorou o caixa de forma relevante.", c => `Variação ${this.fmt(c.variacao)} · ${c.grupo}`)}
          </section>
          <section class="fc-ins-sec">
            <h3>Maiores variações negativas</h3>
            ${this.listaInsights(ins.negativas, "Nenhuma conta piorou o caixa de forma relevante.", c => `Variação ${this.fmt(c.variacao)} · ${c.grupo}`)}
          </section>
          <section class="fc-ins-sec">
            <h3>Dez receitas mais relevantes</h3>
            <p>${this.esc(fraseProdutos)}</p>
            ${this.listaInsights(ins.receitas, "Não houve receita no período.", c => `${c.papel} · Total ${this.fmt(c.total)} · Variação ${this.fmt(c.variacao)}`)}
          </section>
          <section class="fc-ins-sec">
            <h3>Queda no recebimento</h3>
            <p>Segunda metade do período pelo menos 15% abaixo da primeira, em contas de receita.</p>
            ${this.listaInsights(ins.quedas, "Nenhuma receita teve queda relevante entre as duas metades.", c => `1ª metade ${this.fmt(c.antes)} · 2ª metade ${this.fmt(c.depois)} · Queda ${this.fmt(c.queda)}`)}
          </section>
          <section class="fc-ins-sec">
            <h3>Serviços</h3>
            <p>${this.esc(fraseServicos)}</p>
            ${ins.servicos.length ? this.listaInsights(ins.servicos, "", c => `Total ${this.fmt(c.total)}`) : ""}
          </section>
          <section class="fc-ins-sec">
            <h3>Aplicações e CDI</h3>
            <p>${this.esc(fraseAplic)}</p>
            ${ins.aplicacoes.length ? this.listaInsights(ins.aplicacoes, "", c => `${c.grupo} · Total ${this.fmt(c.total)}`) : ""}
          </section>
          <section class="fc-ins-sec">
            <h3>Aumento de gastos</h3>
            <p>Saídas em que a segunda metade gastou mais que a primeira.</p>
            ${this.listaInsights(ins.aumentos, "Nenhuma conta de saída aumentou o gasto de forma relevante.", c => `1ª metade ${this.fmt(c.antes)} · 2ª metade ${this.fmt(c.depois)} · Aumento ${this.fmt(c.aumento)}`)}
          </section>
          <section class="fc-ins-sec">
            <h3>Perfil linear com desvio</h3>
            <p>Conta de saída estável no período e um mês fora dessa média.</p>
            ${this.listaInsights(ins.lineares, ins.meses < 4 ? "São necessários pelo menos quatro meses para ler um perfil linear." : "Nenhuma conta de saída teve perfil linear com um mês fora da média.", c => `${c.mes} em ${this.fmt(c.valorMes)} · média ${this.fmt(c.media)}`)}
          </section>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  },

  exportInsightsPdf() {
    const ins = this._insights;
    if (!ins) return;
    const lib = window.jspdf;
    if (!lib || typeof lib.jsPDF !== "function") {
      alert("O gerador de PDF não carregou. Atualize a página com Ctrl+F5.");
      return;
    }
    const pdf = new lib.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const desenhaTopo = (titulo, pagina) => {
      pdf.setFillColor(16, 84, 54);
      pdf.rect(0, 0, 210, 16, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.text(titulo, 14, 10.5);
      pdf.setTextColor(71, 85, 105);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(`${ins.periodo}  ·  ${this.textoEmpresas()}`, 14, 22);
      pdf.text(`Moura Leite  ·  diretoria  ·  ${pagina}`, 14, 290);
    };
    const bloco = (y, titulo, linhas) => {
      let cursor = y;
      if (cursor > 276) return cursor;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(16, 84, 54);
      pdf.text(titulo, 14, cursor);
      cursor += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(15, 23, 42);
      (linhas || []).forEach(linha => {
        pdf.splitTextToSize(String(linha || ""), 182).forEach(parte => {
          if (cursor > 282) return;
          pdf.text(parte, 14, cursor);
          cursor += 4;
        });
      });
      return cursor + 3;
    };
    desenhaTopo("Fluxo de caixa — Entradas", "página 1 de 2");
    let y = 30;
    const positivasEnt = ins.positivas.filter(c => this.isRevenueGroup(c.parentId) || c.parentId === "g_09_01" || c.parentId === "g_09_03" || c.parentId === "g_11_02" || c.parentId === "g_11_03");
    y = bloco(y, "Variação positiva no recebimento", positivasEnt.length
      ? positivasEnt.map(c => `${c.nome} — variação ${this.fmt(c.variacao)} (${c.grupo})`)
      : ["Nenhuma conta de entrada melhorou o caixa de forma relevante."]);
    const produtos = ins.receitas.filter(c => c.papel === "Produto").slice(0, 3).map(c => c.nome);
    y = bloco(y, "Receitas mais relevantes", [
      produtos.length ? `Produtos com mais recebimento: ${produtos.join(", ")}.` : "Nenhuma conta de venda de imóveis entre as dez receitas.",
      ...ins.receitas.map(c => `${c.papel} · ${c.nome} — total ${this.fmt(c.total)} · variação ${this.fmt(c.variacao)}`)
    ].concat(ins.receitas.length ? [] : ["Não houve receita no período."]));
    y = bloco(y, "Queda no recebimento", ins.quedas.length
      ? ins.quedas.map(c => `${c.nome} — 1ª metade ${this.fmt(c.antes)} · 2ª metade ${this.fmt(c.depois)} · queda ${this.fmt(c.queda)}`)
      : ["Nenhuma receita caiu 15% ou mais da primeira para a segunda metade."]);
    y = bloco(y, "Serviços", ins.servicos.length
      ? ins.servicos.map(c => `${c.nome} — ${this.fmt(c.total)}`)
      : ["Não houve recebimento classificado em 01.02 Receita de serviços."]);
    const somaAplic = ins.aplicacoes.reduce((s, c) => s + c.total, 0);
    bloco(y, "Aplicações e CDI", [
      ins.aplicacoes.length ? `Caixa das aplicações e receitas financeiras: ${this.fmt(somaAplic)}.` : "Sem movimentação classificada em aplicações ou receitas financeiras.",
      ...ins.aplicacoes.map(c => `${c.nome} — ${this.fmt(c.total)}`),
      ins.cdi.texto
    ]);

    pdf.addPage();
    desenhaTopo("Fluxo de caixa — Saídas", "página 2 de 2");
    y = 30;
    const negativasSai = ins.negativas.filter(c => this.ehSaidaConta(c.parentId));
    y = bloco(y, "Variação negativa nas saídas", negativasSai.length
      ? negativasSai.map(c => `${c.nome} — variação ${this.fmt(c.variacao)} (${c.grupo})`)
      : ["Nenhuma conta de saída piorou o caixa de forma relevante."]);
    y = bloco(y, "Aumento de gastos ao longo do período", ins.aumentos.length
      ? ins.aumentos.map(c => `${c.nome} — 1ª metade ${this.fmt(c.antes)} · 2ª metade ${this.fmt(c.depois)} · aumento ${this.fmt(c.aumento)}`)
      : ["Nenhuma conta de saída aumentou o gasto entre as duas metades."]);
    bloco(y, "Perfil linear com desvio no mês", ins.lineares.length
      ? ins.lineares.map(c => `${c.nome} — ${c.mes} em ${this.fmt(c.valorMes)} · média do período ${this.fmt(c.media)}`)
      : [ins.meses < 4 ? "São necessários pelo menos quatro meses para ler um perfil linear." : "Nenhuma conta de saída teve perfil linear com um mês fora da média."]);
    pdf.save(`insights-fluxo-${this.startDate}-a-${this.endDate}.pdf`);
  },

  excelLetra(i) {
    if (window.InvestimentoApp && typeof InvestimentoApp.excelColLetter === "function") return InvestimentoApp.excelColLetter(i);
    let n = i;
    let s = "";
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  },

  excelPinta(cell, opts) {
    if (window.InvestimentoApp && typeof InvestimentoApp.excelPaint === "function") {
      InvestimentoApp.excelPaint(cell, opts);
    }
  },

  linhasParaExcel() {
    const guarda = new Set(this.expanded || []);
    try {
      const visao = this.visao();
      (visao.groups || []).forEach((g) => { if (g && g.id) this.expanded.add(g.id); });
      this.build(this.lastAllocs || []);
      (this.rows || []).forEach((r) => {
        if (r && r.id) this.expanded.add(r.id);
        if (r && r.toggleId) this.expanded.add(r.toggleId);
      });
      this.build(this.lastAllocs || []);
      return (this.rows || []).slice();
    } finally {
      this.expanded = guarda;
      this.build(this.lastAllocs || []);
    }
  },

  async exportGridExcel() {
    if (this.loading || !(this.rows || []).length) {
      alert("Consulte o fluxo antes de exportar.");
      return;
    }
    const ExcelJS = window.ExcelJS;
    if (!ExcelJS) {
      alert("A biblioteca de Excel não carregou. Atualize a página com Ctrl+F5.");
      return;
    }
    const btn = document.querySelector("#fluxo-caixa-root .btn-excel");
    if (btn) btn.disabled = true;
    try {
      const cols = this.visibleColumns().filter(c => c.type !== "gap");
      const headers = ["Estrutura"].concat(cols.map(c => this.rotuloColuna(c)));
      const colCount = Math.max(headers.length, 8);
      const moneyFmt = "#,##0.00";
      const wb = new ExcelJS.Workbook();
      wb.creator = "CRM Moura Leite";
      const ws = wb.addWorksheet("Fluxo de caixa", {
        views: [{ state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", activeCell: "B5", showGridLines: false }]
      });
      ws.properties.showGridLines = false;
      ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
      const linhasExcel = this.linhasParaExcel();
      const nivelMax = linhasExcel.reduce((m, r) => Math.max(m, Number(r.level) || 0), 0);
      ws.properties.outlineLevelRow = Math.min(nivelMax, 7);
      const widths = [{ width: 46 }];
      for (let i = 1; i < colCount; i++) widths.push({ width: 16 });
      ws.columns = widths;

      let imgId = null;
      if (window.InvestimentoApp && typeof InvestimentoApp.logoDataUrl === "function") {
        try {
          const logo = await InvestimentoApp.logoDataUrl();
          if (logo && logo.dataUrl) imgId = wb.addImage({ base64: logo.dataUrl, extension: logo.extension || "png" });
        } catch (e) { /* segue sem logo */ }
      }
      const modo = { mes: "Mês", bimestre: "Bimestre", trimestre: "Trimestre", semestre: "Semestre", anual: "Anual" }[this.agrupamento || "mes"] || "Mês";
      ws.mergeCells("A1:A2");
      ws.getRow(1).height = 28;
      ws.getRow(2).height = 22;
      const titleCell = ws.getCell("A1");
      titleCell.value = {
        richText: [
          { font: { name: "Calibri", size: 14, bold: true, color: { argb: "FF475569" } }, text: "Fluxo de caixa (DFC)\n" },
          { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: `${this.startDate} a ${this.endDate} · ${modo} · ${this.textoEmpresas()}` }
        ]
      };
      this.excelPinta(titleCell, {
        fill: "FFFFFFFF",
        align: { vertical: "middle", horizontal: "left", wrapText: true, indent: 8 }
      });
      if (imgId != null) {
        try {
          const logoPx = Math.round(1.54 * 96 / 2.54);
          ws.addImage(imgId, { tl: { col: 0.04, row: 0.08 }, ext: { width: logoPx, height: logoPx } });
        } catch (e) { /* logo opcional */ }
      }
      const kpis = [
        { label: "Período", value: `${this.startDate} a ${this.endDate}`, money: false },
        { label: "Agrupamento", value: modo, money: false },
        ...(this.compMap ? [{ label: "Comparado com", value: this.rotuloComparado(), money: false }] : []),
        { label: "Empresas", value: this.textoEmpresas(), money: false }
      ];
      kpis.forEach((k, i) => {
        const col = 4 + i;
        const top = ws.getRow(1).getCell(col);
        const val = ws.getRow(2).getCell(col);
        top.value = k.label;
        val.value = k.value;
        this.excelPinta(top, {
          fill: "FFFFFFFF",
          font: { bold: true, size: 8, color: { argb: "FF94A3B8" } },
          align: { horizontal: "right", vertical: "bottom" }
        });
        this.excelPinta(val, {
          fill: "FFFFFFFF",
          font: { bold: true, size: 12, color: { argb: "FF0F172A" } },
          align: { horizontal: "right", vertical: "middle", wrapText: true }
        });
      });
      ws.getRow(3).height = 8;
      const head = ws.getRow(4);
      head.height = 20;
      headers.forEach((h, i) => {
        const cell = head.getCell(i + 1);
        cell.value = h;
        this.excelPinta(cell, {
          fill: "FF334155",
          font: { bold: true, size: 9, color: { argb: "FFFFFFFF" } },
          align: { horizontal: i === 0 ? "left" : "right", vertical: "middle" },
          border: true
        });
      });
      let rowIndex = 5;
      linhasExcel.forEach(r => {
        const linha = ws.getRow(rowIndex);
        linha.height = 18;
        linha.outlineLevel = Math.min(Number(r.level) || 0, 7);
        const escuro = r.type === "formula" || r.type === "total_n1";
        const resultado = r.type === "resultado";
        const fill = escuro ? "FF0C3D28" : (resultado ? "FFE7F6EE" : (r.isCostCenter ? "FFF8FAFC" : "FFFFFFFF"));
        const baseColor = escuro ? "FFFFFFFF" : (resultado ? "FF105436" : "FF0F172A");
        const nome = linha.getCell(1);
        nome.value = r.name || "";
        this.excelPinta(nome, {
          fill,
          font: { bold: !r.isAccount && !r.isCostCenter, size: 9, color: { argb: baseColor } },
          align: { horizontal: "left", vertical: "middle", indent: Math.min(r.level || 0, 8) },
          border: true
        });
        cols.forEach((col, i) => {
          const cell = linha.getCell(i + 2);
          if (col.type === "var" || col.type === "varpct") {
            const delta = (Number(r.total) || 0) - this.valorComparado(r);
            const pct = col.type === "varpct" ? this.variacaoPct(r) : null;
            cell.value = col.type === "var" ? delta : (pct == null ? (Math.abs(delta) < 0.005 ? 0 : "novo") : pct / 100);
            const cor = Math.abs(delta) < 0.005 ? "FF94A3B8" : (delta > 0 ? "FF105436" : "FFB91C1C");
            this.excelPinta(cell, {
              fill: Math.abs(delta) < 0.005 ? fill : (delta > 0 ? "FFDCFCE7" : "FFFEE2E2"),
              font: { bold: true, size: 9, color: { argb: cor } },
              align: { horizontal: "right", vertical: "middle" },
              border: true,
              numFmt: col.type === "var" ? moneyFmt : "0.0%"
            });
            return;
          }
          const n = this.valueOf(r, col);
          cell.value = n;
          let color = baseColor;
          if (!escuro) {
            if (Math.abs(n) < 0.005) color = "FF94A3B8";
            else if (n < 0) color = "FFB91C1C";
          }
          this.excelPinta(cell, {
            fill,
            font: { bold: col.type !== "month" || escuro || resultado, size: 9, color: { argb: color } },
            align: { horizontal: "right", vertical: "middle" },
            border: true,
            numFmt: moneyFmt
          });
        });
        rowIndex += 1;
      });
      const foot = ws.getRow(rowIndex + 1);
      const quando = window.InvestimentoApp && typeof InvestimentoApp.generatedAtLabel === "function"
        ? InvestimentoApp.generatedAtLabel(new Date())
        : "Relatório gerado pelo CRM Moura Leite";
      foot.getCell(1).value = quando;
      this.excelPinta(foot.getCell(1), {
        font: { italic: true, size: 8, color: { argb: "FF64748B" } },
        align: { horizontal: "left", vertical: "middle" }
      });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `fluxo-de-caixa-${this.startDate}-a-${this.endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 1000);
    } catch (e) {
      console.warn("[Fluxo de Caixa] excel", e);
      alert("Não consegui gerar o Excel.");
    } finally {
      if (btn && btn.isConnected) btn.disabled = !(this.rows || []).length;
    }
  }
};

window.FluxoCaixaApp = FluxoCaixaApp;
