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

  unmatchedInfo: { total: 0, samples: [] },

  init() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    if (!this.startDate) this.startDate = `${y}-${m}-01`;
    if (!this.endDate) {
      const last = new Date(y, now.getMonth() + 1, 0).getDate();
      this.endDate = `${y}-${m}-${String(last).padStart(2, "0")}`;
    }
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

  allocate(mov, factor) {
    const amount = (Number(mov.bankMovementAmount) || 0) * factor;
    const cats = Array.isArray(mov.financialCategories) ? mov.financialCategories : [];
    // Sem plano financeiro = transferência / aplicação / movimento bancário puro — fora do DFC
    if (!cats.length) return [];
    const ignored = this.ignoredAccountKeys();
    return cats.map(fc => {
      const categoryId = String(fc.financialCategoryId || "").trim();
      if (!categoryId) return null;
      const nk = this.normAccountKey(categoryId);
      if (ignored.has(categoryId) || (nk && ignored.has(nk))) return null;
      const rate = Number(fc.financialCategoryRate);
      let share = 1;
      if (rate > 1) share = rate / 100;
      else if (rate > 0) share = rate;
      else share = 1 / cats.length;
      return {
        amount: amount * share,
        categoryId,
        categoryName: fc.financialCategoryName || this.catName(fc.financialCategoryId) || "Sem nome",
        reducer: fc.financialCategoryReducer,
        categoryType: fc.financialCategoryType,
        month: this.movMonth(mov)
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
   * Usa módulo do valor para não depender do sinal cru da API.
   */
  signedAmount(node, categoryId, categoryName, amount, reducerFlag, categoryType) {
    const abs = Math.abs(Number(amount) || 0);
    if (!abs) return 0;
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
      const amount = this.signedAmount(node, a.categoryId, a.categoryName, a.amount, a.reducer, a.categoryType);
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
          redutora: !!(node.redutora || this.isReducingAccount(a.categoryId, a.categoryName, node)
            || /^(S|SIM|TRUE|1|Y|R)$/i.test(String(a.reducer || "").trim()))
        };
      }
      this.addInto(accIndex[idxKey], a.month, amount);
      accIndex[idxKey].name = a.categoryName || accIndex[idxKey].name;
    });
    this.unmatchedInfo = unmatched;

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
              <p>Mesma estrutura do cadastro de visões · API caixa e banco · % MLDU</p>
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
            <div class="fc-field">Seleção
              <div class="fc-selection-pill" title="Data em que o dinheiro saiu ou entrou">Data do pagamento / movimento</div>
            </div>
            <button class="btn btn-primary" onclick="FluxoCaixaApp.load()" style="height:34px;">
              ${this.loading ? "Consultando..." : "Consultar"}
            </button>
            ${this.companyDropHtml()}
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
                  ? `<div class="fc-empty">Carregando movimentos de caixa e banco...</div>`
                  : ((this.rows || []).length
                    ? (this.rows || []).map(r => this.rowHtml(r)).join("")
                    : `<div class="fc-empty">Informe o período e consulte a API.</div>`)}
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
      ? `<button type="button" class="fc-chevron" onclick="FluxoCaixaApp.toggle('${r.id}')"><i data-lucide="${this.expanded.has(r.id) ? "chevron-down" : "chevron-right"}"></i></button>`
      : `<span class="fc-chevron-spacer"></span>`;
    const monthVals = this.months.map(m => {
      const v = r.months && r.months[m];
      return `<span class="fc-val" style="${this.cellStyle(v, isHead)}">${this.fmt(v)}</span>`;
    }).join("");
    return `
      <div class="fc-node" style="margin-left:${pad}px;background:${chrome.bg};border-left-color:${chrome.border};">
        <div class="fc-node-main">
          ${chevron}
          <i data-lucide="${chrome.icon}" class="fc-node-icon" style="color:${chrome.border};"></i>
          <span class="fc-node-name" style="font-weight:${isHead ? 800 : (r.isAccount ? 500 : 700)};">${this.esc(r.name)}</span>
        </div>
        <div class="fc-node-vals">
          ${monthVals}
          <span class="fc-val fc-val-total" style="${this.cellStyle(r.total, true)}">${this.fmt(r.total)}</span>
        </div>
      </div>`;
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
};

window.FluxoCaixaApp = FluxoCaixaApp;
