// Fluxo de Caixa (DFC) — movimentos de caixa/banco Sienge × visão DFC Padrão × % MLDU

const FluxoCaixaApp = {
  startDate: "",
  endDate: "",
  // Sempre data do movimento/pagamento (M). Vencimento (P) não reflete o caixa
  // e a API bank-movement rejeita P com 422.
  selectionType: "M",
  selectedCompanyIds: [],
  companyDropOpen: false,
  companyQuery: "",
  loading: false,
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
    const cons = this.consolidacaoCompanies();
    if (!this.selectedCompanyIds.length) this.selectedCompanyIds = cons.map(c => String(c.id));
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

  consolidacaoCompanies() {
    const all = (window.AppState && AppState.companies) || [];
    const custom = this.empresasCustom();
    return all.filter(c => {
      const cfg = custom[c.id] || custom[String(c.id)] || {};
      return Number(cfg.consolidacao_padrao) === 1;
    }).map(c => {
      const cfg = custom[c.id] || custom[String(c.id)] || {};
      return {
        id: String(c.id),
        name: cfg.nome_usual || c.name || `Empresa ${c.id}`,
        pct: Number(cfg.percentual_mldu) || 0
      };
    }).sort((a, b) => Number(a.id) - Number(b.id));
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

  fmt(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  factorForCompany(companyId) {
    const c = this.consolidacaoCompanies().find(x => String(x.id) === String(companyId));
    return c ? (Number(c.pct) || 0) / 100 : 0;
  },

  /**
   * Rateio das categorias do movimento.
   * Sienge manda % (0–100). Se houver linhas duplicadas ou soma > 100,
   * normaliza — senão o DFC infla (caso visto em 2.11.03 Adiantamento a Parceiros).
   */
  categoryShareEntries(cats) {
    const list = Array.isArray(cats) ? cats : [];
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
        points = rateRaw > 1 ? rateRaw : rateRaw * 100;
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
    // Soma > 100: normaliza. Senão divide por 100 (rateio parcial permanece parcial).
    const denom = sum > 100.0001 ? sum : 100;
    return entries.map((e) => ({ fc: e.fc, share: e.points / denom }));
  },

  allocate(mov, factor) {
    // Reaprop./abatimento de adiantamento: só mata o título no Sienge — não é caixa no DFC
    if (this.movAdvanceRole(mov) === "abatimento") return [];
    const rawBank = Number(mov.bankMovementAmount) || 0;
    const cats = Array.isArray(mov.financialCategories) ? mov.financialCategories : [];
    // Sem plano financeiro = transferência / aplicação / movimento bancário puro — fora do DFC
    if (!cats.length) return [];
    const ignored = this.ignoredAccountKeys();
    return this.categoryShareEntries(cats).map(({ fc, share }) => {
      const categoryId = String(fc.financialCategoryId || "").trim();
      if (!categoryId) return null;
      const nk = this.normAccountKey(categoryId);
      if (ignored.has(categoryId) || (nk && ignored.has(nk))) return null;
      const rateRaw = Number(fc.financialCategoryRate);
      // Total do título/movimento (ex.: 52.200) × % apropriação C.C. (53% / 47%)
      const rateadoBruto = rawBank * share;
      // Depois aplica o fator MLDU da empresa consolidada
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
  isReducingAccount(categoryId, categoryName, node) {
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

  /**
   * Sinal no DFC (mesmo critério do demonstrativo Excel):
   * — grupo de saída (02/04/05/07/09.02/09.05) ou conta 2.x / tipo despesa → negativo
   * — redutora nesses grupos (retenção, desconto obtido, flag Sienge) → positivo
   * — redutora em RECEITAS (cancelamento) → negativo
   * Em geral usa módulo do valor (API costuma mandar saída positiva).
   *
   * Adiantamento × abatimento (reapropriação):
   * — adiantamento = saída de caixa → negativo (como demais custos em 04.01)
   * — reaprop./abatimento de adiant. = só contábil (mata o título no Sienge);
   *   não entra no DFC, senão reduz indevidamente 2.02.04.01 Repasses
   */
  signedAmount(node, categoryId, categoryName, amount, reducerFlag, categoryType, mov) {
    const raw = Number(amount) || 0;
    if (!raw) return 0;
    const role = mov ? this.movAdvanceRole(mov) : "";
    // Reapropriação/abatimento: fora do demonstrativo de caixa
    if (role === "abatimento") return 0;
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

  addInto(bucket, month, amount) {
    if (!bucket.months[month]) bucket.months[month] = 0;
    bucket.months[month] += amount;
    bucket.total += amount;
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
        this.addInto(unmatched, a.month, amount);
        if (unmatched.samples.length < 12) {
          unmatched.samples.push({ id: rawId, name: a.categoryName, amount });
        }
        return;
      }
      const node = byId[nid];
      const amount = this.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType, a.mov);
      this.addInto(node, a.month, amount);
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
      this.addInto(accIndex[idxKey], a.month, amount);
      accIndex[idxKey].name = a.categoryName || accIndex[idxKey].name;
      const item = { ...a, amount, signedAmount: amount };
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
      });
    });

    const sumNodes = (ids) => {
      const months = this.emptyMonths(this.months);
      let total = 0;
      ids.forEach(id => {
        const n = byId[id];
        if (!n) return;
        this.months.forEach(m => { months[m] += n.months[m] || 0; });
        total += n.total;
      });
      return { months, total };
    };
    const applySum = (id, parts) => {
      if (!byId[id]) return;
      const s = sumNodes(parts);
      byId[id].months = s.months;
      byId[id].total = s.total;
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
        rows.push({
          ...acc,
          level: level + 1,
          isAccount: true,
          hasKids: false,
          name: `${code} ${acc.name || ""}${redFlag}`.trim()
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
      this.error = "Selecione ao menos uma empresa da consolidação padrão.";
      this.render();
      return;
    }
    this.loading = true;
    this.error = "";
    this.render();
    await this.ensureCategories();
    this.months = this.monthKeys(this.startDate, this.endDate);
    try {
      const chunks = await Promise.all(this.selectedCompanyIds.map(async id => {
        const data = await SiengeApiService.getBankMovements(this.startDate, this.endDate, {
          selectionType: "M",
          companyId: id
        });
        return (data || []).map(m => ({ ...m, companyId: m.companyId || id }));
      }));
      this.movements = chunks.flat();
      // Dedupe entre empresas (API às vezes ignora companyId e devolve o mesmo movimento N vezes)
      if (typeof siengeDedupeBankMovements === "function") {
        this.movements = siengeDedupeBankMovements(this.movements);
      }
      // Garante período pelo data de caixa (não confiar só no filtro da API)
      this.movements = this.movements.filter((m) => {
        const d = this.cashDate(m);
        return d && d >= this.startDate && d <= this.endDate;
      });
      const allocs = [];
      this.movements.forEach(mov => {
        const factor = this.factorForCompany(mov.companyId);
        if (factor <= 0) return;
        this.allocate(mov, factor).forEach(a => allocs.push(a));
      });
      this.build(allocs);
      if (!this.movements.length) this.error = "Nenhum movimento de caixa/banco no período para as empresas selecionadas.";
    } catch (err) {
      console.error("[Fluxo de Caixa]", err);
      this.error = err && err.message ? err.message : "Falha ao consultar a API de caixa e banco.";
      this.rows = [];
    } finally {
      this.loading = false;
      this.render();
    }
  },

  toggle(id) {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.rebuildFromCache();
  },

  toggleCompany(id, on) {
    const sid = String(id);
    if (on) {
      if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid);
    } else {
      this.selectedCompanyIds = this.selectedCompanyIds.filter(x => x !== sid);
    }
    this.companyDropOpen = true;
    this.render();
  },

  companyFilterItems() {
    return this.consolidacaoCompanies().map(c => ({
      id: String(c.id),
      label: `${c.id} - ${String(c.name || "").toUpperCase()} · ${c.pct}%`
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
        this.selectedCompanyIds = this.consolidacaoCompanies().map(c => String(c.id));
        this.companyDropOpen = true;
        this.render();
      },
      selectNone: () => {
        this.selectedCompanyIds = [];
        this.companyDropOpen = true;
        this.render();
      }
    });
  },

  companyDropHtml() {
    const companies = this.consolidacaoCompanies();
    if (!companies.length) {
      return `<div style="flex:1;min-width:240px;"><div class="ml-emp-filter-label">Empresas</div><span style="color:#94a3b8;font-size:0.8rem;">Nenhuma empresa com consolidação padrão.</span></div>`;
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
  },

  collapseAll() {
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
    const allocs = [];
    this.movements.forEach(mov => {
      const factor = this.factorForCompany(mov.companyId);
      if (factor <= 0) return;
      this.allocate(mov, factor).forEach(a => allocs.push(a));
    });
    this.build(allocs);
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
    const unmatched = this.unmatchedInfo || { total: 0, samples: [] };
    const hasUnmatched = Math.abs(Number(unmatched.total) || 0) > 0.005;
    const byLevel = this.expandableByLevel();
    const canExpand = [...byLevel.values()].some(ids => ids.some(id => !this.expanded.has(id)));
    const canCollapse = [...byLevel.values()].some(ids => ids.some(id => this.expanded.has(id)));
    root.innerHTML = `
      <div class="fc-shell">
        <div class="fc-head">
          <div class="fc-head-left">
            <div class="fc-head-icon"><i data-lucide="git-branch"></i></div>
            <div>
              <h2>Fluxo de caixa (DFC)</h2>
              <p>Estrutura <strong>DFC Padrão</strong> do cadastro de visões · API caixa e banco · % MLDU</p>
            </div>
          </div>
          <button type="button" class="btn btn-outline fc-link-visoes" onclick="switchTab('plano-financeiro','Plano Financeiro e Visões')">
            <i data-lucide="settings-2" style="width:14px;height:14px;"></i> Cadastro de visões
          </button>
        </div>
        <div class="fc-body">
          <div class="fc-filters">
            <label class="fc-field">Início
              <input type="date" value="${this.startDate}" onchange="FluxoCaixaApp.startDate=this.value">
            </label>
            <label class="fc-field">Fim
              <input type="date" value="${this.endDate}" onchange="FluxoCaixaApp.endDate=this.value">
            </label>
            ${this.companyDropHtml()}
            <button type="button" class="btn btn-primary fc-consult-btn" onclick="FluxoCaixaApp.load()" ${this.loading ? "disabled" : ""}>
              Consultar
            </button>
          </div>
          ${this.error ? `<div class="fc-error">${this.esc(this.error)}</div>` : ""}
          <div class="fc-board">
            <div class="fc-tree-pane">
              <div class="fc-tree-toolbar">
                <strong>Estrutura DFC Padrão</strong>
                <div class="fc-tree-actions">
                  <button type="button" class="btn btn-outline fc-mini" onclick="FluxoCaixaApp.expandAll()" ${canExpand ? "" : "disabled"}>Expandir todos</button>
                  <button type="button" class="btn btn-outline fc-mini" onclick="FluxoCaixaApp.collapseAll()" ${canCollapse ? "" : "disabled"}>Recolher todos</button>
                </div>
              </div>
              ${hasUnmatched ? `
                <div class="fc-warn fc-warn-bar">
                  <i data-lucide="alert-triangle" style="width:14px;height:14px;"></i>
                  Há ${this.fmt(unmatched.total)} em contas ainda não vinculadas à visão.
                  <button type="button" class="btn btn-outline fc-mini" onclick="switchTab('plano-financeiro','Plano Financeiro e Visões')">Alocar</button>
                </div>` : ""}
              <div class="fc-tree-scroll">
                ${this.loading
                  ? `<div class="fc-loading"><span class="fc-loading-spin" aria-hidden="true"></span><span>buscando lançamentos</span></div>`
                  : ((this.rows || []).length
                    ? (this.rows || []).map(r => this.rowHtml(r)).join("")
                    : "")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  rowHtml(r) {
    const chrome = this.nodeChrome(r);
    const pad = (r.level || 0) * 18;
    const isHead = r.type === "total_n1" || r.type === "formula";
    const chevron = r.hasKids
      ? `<button type="button" class="fc-chevron" onclick="event.stopPropagation();FluxoCaixaApp.toggle('${r.id}')"><i data-lucide="${this.expanded.has(r.id) ? "chevron-down" : "chevron-right"}"></i></button>`
      : `<span class="fc-chevron-spacer"></span>`;
    const monthVals = this.months.map(m => {
      const v = r.months && r.months[m];
      return `<span class="fc-val" style="${this.cellStyle(v, isHead)}">${this.fmt(v)}</span>`;
    }).join("");
    const drillId = r.isAccount ? (r.id || "") : (r.id || "");
    const canDrill = !!(drillId && (r.isAccount || r.type === "resultado" || r.type === "total_n1" || r.type === "formula"));
    const click = canDrill
      ? `onclick="FluxoCaixaApp.openDrill('${String(drillId).replace(/'/g, "\\'")}', ${r.isAccount ? "true" : "false"})" title="Ver lançamentos que formam este valor" style="cursor:pointer;"`
      : "";
    const nameHint = r.isAccount ? ` <span style="font-size:0.65rem;color:#94a3b8;font-weight:500;">(clique p/ detalhar)</span>` : "";
    return `
      <div class="fc-node${canDrill ? " fc-node--drill" : ""}" style="margin-left:${pad}px;background:${chrome.bg};border-left-color:${chrome.border};" ${click}>
        <div class="fc-node-main">
          ${chevron}
          <i data-lucide="${chrome.icon}" class="fc-node-icon" style="color:${chrome.border};"></i>
          <span class="fc-node-name" style="font-weight:${isHead ? 800 : (r.isAccount ? 500 : 700)};">${this.esc(r.name)}${r.isAccount ? nameHint : ""}</span>
        </div>
        <div class="fc-node-vals">
          ${monthVals}
          <span class="fc-val fc-val-total" style="${this.cellStyle(r.total, true)}">${this.fmt(r.total)}</span>
        </div>
      </div>`;
  },

  collectNodeItems(nodeId) {
    const visao = this.visao();
    const groups = visao.groups || [];
    const byId = Object.fromEntries(groups.map(g => [g.id, g]));
    const items = [];
    const walk = (id) => {
      const direct = this.nodeItems[id] || [];
      direct.forEach(it => items.push(it));
      groups.filter(g => g.parentId === id).forEach(ch => walk(ch.id));
    };
    if (byId[nodeId] || this.nodeItems[nodeId]) walk(nodeId);
    return items;
  },

  resolveDrill(id, isAccount) {
    const sid = String(id || "");
    const nk = this.normAccountKey(sid);
    if (isAccount) {
      const acc = this.accountIndex[sid] || this.accountIndex[nk] || null;
      if (!acc) return { title: sid, subtitle: "Conta", items: [], total: 0 };
      return {
        title: `${acc.displayId || acc.id} ${acc.name || ""}`.trim(),
        subtitle: "Conta do plano financeiro",
        items: acc.items || [],
        total: acc.total || 0
      };
    }
    const row = (this.rows || []).find(r => !r.isAccount && String(r.id) === sid);
    const items = this.collectNodeItems(sid);
    const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    return {
      title: (row && row.name) || sid,
      subtitle: "Nó da visão DFC (lançamentos agregados)",
      items,
      total: row && row.total != null ? row.total : total
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
    if (billId && docLabel && String(billId) !== String(docLabel).replace(/\D/g, "") && String(billId) !== String(docLabel)) {
      parts.push(`id ${billId}`);
    }
    if (installment) parts.push(`parc. ${installment}`);

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
    const c = this.consolidacaoCompanies().find(x => String(x.id) === String(id));
    if (c) return `${c.id} - ${c.name} (${c.pct}%)`;
    return id != null ? String(id) : "—";
  },

  companyLabelShort(id) {
    const c = this.consolidacaoCompanies().find(x => String(x.id) === String(id));
    if (!c) return id != null ? String(id) : "—";
    const name = String(c.name || "").trim();
    const short = name.length > 28 ? name.slice(0, 26) + "…" : name;
    return `${c.id} · ${short} (${c.pct}%)`;
  },

  closeDrill() {
    const el = document.getElementById("fc-drill-modal");
    if (el && el.parentNode) el.parentNode.removeChild(el);
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
        { wch: 42 }, { wch: 32 }, { wch: 40 }, { wch: 16 }, { wch: 12 },
        { wch: 22 }, { wch: 12 }, { wch: 14 }
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

  openDrill(id, isAccount) {
    const info = this.resolveDrill(id, !!isAccount);
    const items = [...(info.items || [])].sort((a, b) => {
      const da = this.cashDate(a.mov || {}) || String(a.month || "");
      const db = this.cashDate(b.mov || {}) || String(b.month || "");
      return da.localeCompare(db);
    });
    const sum = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

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

    this._drillExport = {
      items,
      sum,
      lineTotal: info.total,
      title: info.title,
      subtitle: info.subtitle,
      startDate: this.startDate,
      endDate: this.endDate,
      sheetName: "Lancamentos",
      fileBase: `dfc_${info.title || "conta"}_${this.startDate}_${this.endDate}`
    };

    const th = "padding:10px 12px;background:#105436;color:#fff;text-align:left;font-size:0.75rem;white-space:nowrap;";
    const thr = "padding:10px 12px;background:#105436;color:#fff;text-align:right;font-size:0.75rem;white-space:nowrap;";

    const body = items.length
      ? `<div style="overflow:auto;max-height:calc(88vh - 160px);" class="crm-scroll-table">
          <table class="custom-table" style="width:100%;min-width:1380px;border-collapse:separate;border-spacing:0;font-size:0.8rem;">
            <thead>
              <tr>
                <th style="${th}">Data</th>
                <th style="${th}">Nº mov.</th>
                <th style="${th}">Título CP/CR</th>
                <th style="${th}">Empresa</th>
                <th style="${th}">C.C.</th>
                <th style="${th}">Histórico</th>
                <th style="${thr}">Total título</th>
                <th style="${thr}">% rateio</th>
                <th style="${thr}">Valor rateado</th>
                <th style="${thr}">Fator MLDU</th>
                <th style="${thr}">Valor no DFC</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => {
                const mov = it.mov || {};
                const amt = Number(it.amount) || 0;
                const raw = Number(it.rawBankAmount);
                const sharePct = (Number(it.share) || 0) * 100;
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
                const roleBadge = title.role === "adiantamento"
                  ? `<span style="display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:0.68rem;font-weight:800;vertical-align:middle;">ADIANT.</span>`
                  : (title.role === "abatimento"
                    ? `<span style="display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;background:#ffedd5;color:#c2410c;font-size:0.68rem;font-weight:800;vertical-align:middle;">ABATE</span>`
                    : "");
                const pairMark = title.titleKey && pairedTitles.has(title.titleKey)
                  ? `<span title="Mesmo título com adiantamento e abatimento" style="margin-left:4px;color:#ea580c;">↔</span>`
                  : "";
                const partyLine = title.party
                  ? `<div style="font-size:0.72rem;color:#64748b;margin-top:3px;line-height:1.35;">${this.esc(title.party)}</div>`
                  : "";
                const ccTxt = [it.costCenterId, it.costCenterName].filter(Boolean).join(" — ") || "—";
                return `<tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:10px 12px;white-space:nowrap;vertical-align:top;">${this.esc(this.fmtDatePt(this.cashDate(mov)))}</td>
                  <td style="padding:10px 12px;font-weight:700;color:#105436;white-space:nowrap;vertical-align:top;">${this.esc(this.movNumber(mov))}</td>
                  <td style="padding:10px 12px;min-width:200px;max-width:280px;vertical-align:top;">
                    <div style="font-weight:700;color:#0f172a;line-height:1.35;">${this.esc(title.label)}${pairMark}</div>
                    ${partyLine}
                  </td>
                  <td style="padding:10px 12px;min-width:150px;max-width:200px;vertical-align:top;line-height:1.35;" title="${this.esc(this.companyLabel(it.companyId || mov.companyId))}">${this.esc(this.companyLabelShort(it.companyId || mov.companyId))}</td>
                  <td style="padding:10px 12px;min-width:160px;max-width:220px;vertical-align:top;line-height:1.35;" title="${this.esc(ccTxt)}">${this.esc(ccTxt)}</td>
                  <td style="padding:10px 12px;min-width:220px;max-width:320px;vertical-align:top;line-height:1.4;">
                    <span>${this.esc(this.movHistoric(mov))}</span>${roleBadge}
                  </td>
                  <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;vertical-align:top;font-weight:600;color:${rawColor};" title="Valor integral do título/movimento na API">${Number.isFinite(raw) ? this.fmt(raw) : "—"}</td>
                  <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;vertical-align:top;">${sharePct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%${it.rateRaw != null ? `<div style="color:#94a3b8;font-size:0.7rem;">API ${this.esc(String(it.rateRaw))}</div>` : ""}</td>
                  <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;vertical-align:top;font-weight:700;color:${rateadoColor};" title="Total título × % rateio do C.C.">${Number.isFinite(rateado) ? this.fmt(rateado) : "—"}</td>
                  <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;vertical-align:top;">${factorPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
                  <td style="padding:10px 12px;text-align:right;font-weight:800;color:${color};font-variant-numeric:tabular-nums;white-space:nowrap;vertical-align:top;">${this.fmt(amt)}</td>
                </tr>`;
              }).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="10" style="padding:12px;font-weight:800;text-align:right;border-top:2px solid #e2e8f0;">Soma dos lançamentos (${items.length})</td>
                <td style="padding:12px;text-align:right;font-weight:800;font-variant-numeric:tabular-nums;border-top:2px solid #e2e8f0;color:${sum < 0 ? "#b91c1c" : "#105436"};">${this.fmt(sum)}</td>
              </tr>
              <tr>
                <td colspan="10" style="padding:4px 12px 12px;font-weight:700;text-align:right;color:#64748b;">Total exibido na linha</td>
                <td style="padding:4px 12px 12px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#64748b;">${this.fmt(info.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
      : `<div style="padding:28px;text-align:center;color:#64748b;">Nenhum lançamento agrupado nesta linha no período.</div>`;

    this.closeDrill();
    const overlay = document.createElement("div");
    overlay.id = "fc-drill-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:16px;";
    overlay.onclick = (e) => { if (e.target === overlay) this.closeDrill(); };
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:min(1680px,98vw);max-height:94vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.25);">
        <div style="padding:14px 18px;background:#105436;color:#fff;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-radius:12px 12px 0 0;flex-shrink:0;">
          <div style="min-width:0;">
            <div style="font-size:1.05rem;font-weight:800;">Lançamentos · ${this.esc(info.title)}</div>
            <div style="font-size:0.8rem;opacity:.9;margin-top:3px;">${this.esc(info.subtitle)} · ${this.esc(this.startDate)} a ${this.esc(this.endDate)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <button type="button" onclick="event.stopPropagation();FluxoCaixaApp.exportDrillExcel()" ${items.length ? "" : "disabled"}
              title="Exportar quadro em Excel"
              style="border:none;background:rgba(255,255,255,0.16);color:#fff;height:34px;padding:0 12px;border-radius:8px;cursor:${items.length ? "pointer" : "not-allowed"};font-size:0.82rem;font-weight:700;display:inline-flex;align-items:center;gap:6px;opacity:${items.length ? "1" : "0.55"};">
              <i data-lucide="file-spreadsheet" style="width:16px;height:16px;"></i> Excel
            </button>
            <button type="button" onclick="FluxoCaixaApp.closeDrill()" style="border:none;background:rgba(255,255,255,0.15);color:#fff;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:1.25rem;line-height:1;">×</button>
          </div>
        </div>
        <div style="padding:16px 18px 20px;overflow:auto;">${body}</div>
      </div>`;
    document.body.appendChild(overlay);
    try { if (window.lucide) lucide.createIcons({ nodes: [overlay] }); } catch (e) {}
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
};

window.FluxoCaixaApp = FluxoCaixaApp;
