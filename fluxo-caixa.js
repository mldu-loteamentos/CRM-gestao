// Fluxo de Caixa (DFC) — movimentos de caixa/banco Sienge × visão DFC Padrão × % MLDU

const FluxoCaixaApp = {
  startDate: "",
  endDate: "",
  selectionType: "P",
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
    });
  },

  visao() {
    let visoes = [];
    try { visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]") || []; } catch (e) { visoes = []; }
    if (typeof PlanoFinanceiroApp !== "undefined") {
      if (typeof PlanoFinanceiroApp.ensureDfcDefault === "function") PlanoFinanceiroApp.ensureDfcDefault();
      if (Array.isArray(PlanoFinanceiroApp.visoes) && PlanoFinanceiroApp.visoes.length) visoes = PlanoFinanceiroApp.visoes;
    }
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
    if (!cats.length) {
      return [{ amount, categoryId: "SEM_CONTA", categoryName: "Sem plano financeiro", month: this.movMonth(mov) }];
    }
    return cats.map(fc => {
      const rate = Number(fc.financialCategoryRate);
      let share = 1;
      if (rate > 1) share = rate / 100;
      else if (rate > 0) share = rate;
      else share = 1 / cats.length;
      return {
        amount: amount * share,
        categoryId: String(fc.financialCategoryId || "SEM_CONTA"),
        categoryName: fc.financialCategoryName || this.catName(fc.financialCategoryId) || "Sem nome",
        month: this.movMonth(mov)
      };
    });
  },

  movMonth(mov) {
    const d = String(mov.bankMovementDate || mov.date || "").slice(0, 7);
    return d;
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
      (g.accounts || []).forEach(id => { accToNode[String(id)] = g.id; });
    });

    const outros = { id: "g_outros", name: "CONTAS NÃO CLASSIFICADAS", type: "resultado", parentId: null, months: this.emptyMonths(this.months), total: 0, accountRows: [] };

    const accIndex = {};
    allocs.forEach(a => {
      const nid = accToNode[a.categoryId] || "g_outros";
      const node = nid === "g_outros" ? outros : byId[nid];
      if (!node) return;
      if (node.redutora && a.amount > 0) a.amount = -a.amount;
      this.addInto(node, a.month, a.amount);
      if (!accIndex[a.categoryId]) {
        accIndex[a.categoryId] = { id: a.categoryId, name: a.categoryName, months: this.emptyMonths(this.months), total: 0, parentId: node.id };
      }
      this.addInto(accIndex[a.categoryId], a.month, a.amount);
      accIndex[a.categoryId].name = a.categoryName || accIndex[a.categoryId].name;
    });

    Object.values(accIndex).forEach(acc => {
      const node = acc.parentId === "g_outros" ? outros : byId[acc.parentId];
      if (node) node.accountRows.push(acc);
    });

    groups.forEach(g => {
      (g.accounts || []).forEach(id => {
        if (accIndex[String(id)]) return;
        g.accountRows.push({
          id: String(id),
          name: this.catName(id),
          months: this.emptyMonths(this.months),
          total: 0,
          parentId: g.id,
          zero: true
        });
      });
      g.accountRows.sort((a, b) => String(a.id).localeCompare(String(b.id), "pt-BR", { numeric: true }));
    });

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

    if (this.expanded.size === 0) {
      groups.filter(g => !g.parentId).forEach(g => this.expanded.add(g.id));
    }

    const rows = [];
    const pushNode = (node, level) => {
      const children = groups.filter(g => g.parentId === node.id);
      const hasKids = children.length > 0 || (node.accountRows && node.accountRows.length > 0);
      rows.push({ ...node, level, hasKids, isAccount: false });
      if (!this.expanded.has(node.id)) return;
      children.forEach(ch => pushNode(ch, level + 1));
      (node.accountRows || []).forEach(acc => {
        rows.push({ ...acc, level: level + 1, isAccount: true, hasKids: false, name: `${acc.id} ${acc.name || ""}`.trim() });
      });
    };
    groups.filter(g => !g.parentId).forEach(g => pushNode(g, 0));
    if (outros.total !== 0) {
      rows.push({ ...outros, level: 0, hasKids: outros.accountRows.length > 0, isAccount: false });
      if (this.expanded.has("g_outros")) {
        outros.accountRows.forEach(acc => {
          rows.push({ ...acc, level: 1, isAccount: true, hasKids: false, name: `${acc.id} ${acc.name || ""}`.trim() });
        });
      }
    }
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
          selectionType: this.selectionType,
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
    const allocs = [];
    this.movements.forEach(mov => {
      const factor = this.factorForCompany(mov.companyId);
      if (factor <= 0) return;
      this.allocate(mov, factor).forEach(a => allocs.push(a));
    });
    this.build(allocs);
    this.render();
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

  cellStyle(val, isTotal) {
    const n = Number(val) || 0;
    const color = n < 0 ? "#b91c1c" : (n > 0 ? "#105436" : "#94a3b8");
    return `text-align:right;font-variant-numeric:tabular-nums;color:${color};font-weight:${isTotal ? 800 : 600};white-space:nowrap;`;
  },

  render() {
    const root = document.getElementById("fluxo-caixa-root");
    if (!root) return;
    const monthHeads = this.months.map(k => `<th style="padding:8px 10px;text-align:right;font-size:0.72rem;white-space:nowrap;">${this.monthLabel(k)}</th>`).join("");
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 85px);font-family:inherit;">
        <div style="background:#105436;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-radius:12px 12px 0 0;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="git-branch" style="width:18px;height:18px;color:#fff;"></i>
            </div>
            <div>
              <h2 style="margin:0;color:#fff;font-size:1.15rem;font-weight:600;">Fluxo de caixa (DFC)</h2>
              <p style="margin:2px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">DFC mensal · API caixa e banco · consolidação pelo % MLDU</p>
            </div>
          </div>
        </div>
        <div style="flex:1;min-height:0;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;display:flex;flex-direction:column;">
          <div style="padding:14px 16px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Início
              <input type="date" value="${this.startDate}" onchange="FluxoCaixaApp.startDate=this.value"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Fim
              <input type="date" value="${this.endDate}" onchange="FluxoCaixaApp.endDate=this.value"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Seleção
              <select onchange="FluxoCaixaApp.selectionType=this.value" style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
                <option value="P" ${this.selectionType === "P" ? "selected" : ""}>Data de vencimento (P)</option>
                <option value="M" ${this.selectionType === "M" ? "selected" : ""}>Data do movimento (M)</option>
              </select>
            </label>
            <button class="btn btn-primary" onclick="FluxoCaixaApp.load()" style="height:34px;">
              ${this.loading ? "Consultando..." : "Consultar"}
            </button>
            ${this.companyDropHtml()}
          </div>
          ${this.error ? `<div style="margin:12px 16px 0;padding:10px 12px;background:#fef2f2;color:#b91c1c;border-radius:8px;font-size:0.82rem;">${this.esc(this.error)}</div>` : ""}
          <div style="flex:1;overflow:auto;padding:12px 16px;">
            ${this.loading ? `<div style="text-align:center;padding:40px;color:#64748b;">Carregando movimentos de caixa e banco...</div>` : `
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:0.8rem;min-width:720px;">
                <thead>
                  <tr style="background:#f8fafc;position:sticky;top:0;z-index:1;">
                    <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Conta / nó</th>
                    ${monthHeads}
                    <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e2e8f0;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${(this.rows || []).map(r => this.rowHtml(r)).join("") || `<tr><td colspan="${2 + this.months.length}" style="padding:24px;text-align:center;color:#94a3b8;">Informe o período e consulte a API.</td></tr>`}
                </tbody>
              </table>
            </div>`}
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  rowHtml(r) {
    const pad = 10 + (r.level || 0) * 16;
    const isFormula = r.type === "formula";
    const isHead = r.type === "total_n1" || isFormula;
    const bg = r.isAccount ? "#fff" : (isFormula ? "#ecfdf5" : (r.type === "total_n1" ? "#f8fafc" : "#fff"));
    const chevron = r.hasKids
      ? `<button onclick="FluxoCaixaApp.toggle('${r.id}')" style="border:none;background:none;cursor:pointer;padding:0 4px 0 0;color:#64748b;"><i data-lucide="${this.expanded.has(r.id) ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i></button>`
      : `<span style="display:inline-block;width:18px;"></span>`;
    const monthCells = this.months.map(m => `<td style="padding:6px 10px;${this.cellStyle(r.months && r.months[m], isHead)}">${this.fmt(r.months && r.months[m])}</td>`).join("");
    return `<tr style="background:${bg};border-bottom:1px solid #f1f5f9;">
      <td style="padding:6px 12px;padding-left:${pad}px;font-weight:${isHead ? 800 : (r.isAccount ? 500 : 700)};color:${r.isAccount ? "#475569" : "#0f172a"};">
        ${chevron}${this.esc(r.name)}
      </td>
      ${monthCells}
      <td style="padding:6px 12px;${this.cellStyle(r.total, true)}">${this.fmt(r.total)}</td>
    </tr>`;
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
};

window.FluxoCaixaApp = FluxoCaixaApp;
