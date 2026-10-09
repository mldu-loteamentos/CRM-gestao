// Orçamento 2027 — receitas. Centro de custo primeiro, plano financeiro depois.
const OrcamentoApp = {
  year: 2027,
  query: "",
  selectedCompanyIds: [],
  companyDropOpen: false,
  companyQuery: "",
  selectedPlanIds: [],
  planDropOpen: false,
  planQuery: "",
  quarterView: false,
  includeParceria: true,
  expanded: new Set(),
  pickedRows: new Set(),
  mouraView: false,
  ready: false,
  carteira: {},
  carteiraCompanies: {},
  _cartFlight: {},
  CART_LS: "crm_orcamento_carteira_2027",

  data() {
    return window.ORCAMENTO_RECEITA_2027 || { year: 2027, months: [], reducers: [], names: {}, lines: [] };
  },

  reducers() {
    return new Set((this.data().reducers || []).map(String));
  },

  months() {
    return this.data().months || ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  },

  accountName(code) {
    if (this._names && this._names[code]) return this._names[code];
    const names = this.data().names || {};
    return names[code] || "";
  },

  signed(conta, value) {
    const n = Number(value) || 0;
    if (this.reducers().has(String(conta))) return -Math.abs(n);
    return n;
  },

  sum(arr) {
    return (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
  },

  money(n) {
    const v = Number(n) || 0;
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  companies() {
    const map = new Map();
    (this.data().lines || []).forEach((line) => {
      const id = String(line.e || "");
      if (!id || map.has(id)) return;
      map.set(id, String(line.en || "").replace(/\s+/g, " ").trim());
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  },

  companyOn(id) {
    if (!this.selectedCompanyIds.length) return true;
    return this.selectedCompanyIds.includes(String(id));
  },

  init() {
    this.restoreCarteira();
    Object.keys(this.carteiraCompanies).forEach((id) => {
      if (this.carteiraCompanies[id] === "error") delete this.carteiraCompanies[id];
    });
    this.render();
  },

  restoreCarteira() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.CART_LS) || "null");
      const byCc = raw && raw.byCc;
      if (!byCc || typeof byCc !== "object") return;
      Object.keys(byCc).forEach((cc) => {
        const pack = byCc[cc];
        if (!pack || typeof pack !== "object") return;
        const months = Array.isArray(pack.months) ? pack.months.map((n) => Number(n) || 0) : this.blank();
        while (months.length < 12) months.push(0);
        this.carteira[cc] = {
          receber: Number(pack.receber) || 0,
          sub: Number(pack.sub) || 0,
          months: months.slice(0, 12)
        };
      });
    } catch (e) {}
  },

  saveCarteira() {
    const payload = { savedAt: Date.now(), byCc: this.carteira };
    if (typeof window.persistLargeCacheIfRoom === "function") {
      window.persistLargeCacheIfRoom(this.CART_LS, payload);
      return;
    }
    try { localStorage.setItem(this.CART_LS, JSON.stringify(payload)); } catch (e) {}
  },

  render() {
    const root = document.getElementById("orcamento-root");
    if (!root) return;
    root.innerHTML = `
      <style>
        #orcamento-root { font-family: inherit; color: #0f172a; }
        .orc-head { background: #0c3d28; color: #fff; border-radius: 12px; padding: 16px 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
        .orc-head h2 { margin: 0; font-size: 1.15rem; font-weight: 800; color: #fff; }
        .orc-head p { margin: 6px 0 0; font-size: 0.84rem; color: #fff; max-width: 820px; line-height: 1.4; }
        .orc-tools { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
        .orc-search { height: 40px; border: 1px solid #475569; border-radius: 8px; padding: 0 12px; min-width: 240px; font-size: 0.9rem; color: #0f172a; background: #fff; }
        #orcamento-root .ml-emp-filter { flex: 0 0 420px; width: 420px; max-width: none; min-width: 280px; }
        #orcamento-root #orc-plan-box .ml-emp-filter { flex: 0 0 340px; width: 340px; min-width: 240px; }
        #orcamento-root .btn-excel { height: 40px; }
        .orc-ghost { height: 40px; border-radius: 8px; border: 1px solid #105436; background: #fff; color: #105436; font-weight: 800; padding: 0 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; }
        .orc-ghost:hover { background: #d1fae5; }
        .orc-ghost-muted { border-color: #cbd5e1; color: #475569; }
        .orc-ghost-muted:hover { background: #f1f5f9; }
        .orc-ghost.is-on { background: #105436; color: #fff; }
        .orc-ghost.is-on:hover { background: #0c3d28; }
        .orc-ghost svg { width: 14px; height: 14px; }
        .orc-kpis { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .orc-kpi { background: #fff; border: 1px solid #94a3b8; border-top: 4px solid #105436; border-radius: 10px; padding: 12px 14px 10px; min-width: 150px; flex: 1; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08); }
        .orc-kpi span { display: block; color: #1e293b; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.03em; }
        .orc-kpi strong { display: block; margin-top: 4px; font-size: 1.15rem; font-weight: 800; color: #0c3d28; line-height: 1.2; }
        .orc-kpi strong .orc-pct { display: inline; margin-left: 6px; font-size: 0.95rem; }
        .orc-scroll { overflow: auto; max-height: calc(100vh - 280px); border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
        .orc-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 0.78rem; }
        .orc-table thead { background: #0c3d28; }
        .orc-table th { position: sticky; background: #105436; color: #fff; z-index: 2; padding: 0 10px; height: 36px; line-height: 36px; box-sizing: border-box; text-align: right; font-weight: 700; white-space: nowrap; }
        .orc-table thead tr:first-child th { top: 0; z-index: 4; box-shadow: 0 3px 0 #105436; }
        .orc-table thead tr:first-child th.orc-h26,
        .orc-table thead tr:first-child th.orc-h27,
        .orc-table thead tr:first-child th.orc-cmp { text-align: center; }
        .orc-table thead tr:first-child th.orc-h26 { box-shadow: 0 3px 0 #0c3d28; }
        .orc-table thead tr:first-child th.orc-h27 { box-shadow: 0 3px 0 #1a6b45; }
        .orc-table thead tr:nth-child(2) th { top: 36px; z-index: 3; text-align: center; box-shadow: 0 -3px 0 #105436; }
        .orc-table thead tr:nth-child(2) th.orc-h26 { box-shadow: 0 -3px 0 #0c3d28; }
        .orc-table thead tr:nth-child(2) th.orc-h27 { box-shadow: 0 -3px 0 #1a6b45; }
        .orc-table th.orc-label { text-align: left; left: 0; z-index: 5; min-width: 380px; }
        .orc-table th.orc-h26 { background: #0c3d28; }
        .orc-table th.orc-h27 { background: #1a6b45; }
        .orc-table th.orc-fc { color: #fde68a; }
        .orc-table td { padding: 6px 10px; border-bottom: 1px solid #eef2f6; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .orc-table td:first-child { text-align: left; position: sticky; left: 0; z-index: 1; }
        .orc-split { border-left: 2px solid rgba(15, 23, 42, 0.18); }
        .orc-emp td { background: #0c3d28; color: #fff; font-weight: 700; }
        .orc-table tbody tr:hover td:first-child { box-shadow: inset 4px 0 0 #f37021; }
        .orc-total td { position: sticky; bottom: 0; background: #134e3a; color: #fff; font-weight: 800; z-index: 2; border-top: 2px solid #0c3d28; }
        .orc-total td:first-child { z-index: 3; background: #134e3a; }
        .orc-var, .orc-pct { display: block; line-height: 1.2; }
        .orc-pct, .orc-pct-col { font-size: 0.78rem; font-weight: 800; }
        .orc-view { display: inline-flex; border: 1px solid #0c3d28; border-radius: 8px; overflow: hidden; background: #fff; }
        .orc-view button { height: 40px; border: 0; border-right: 1px solid #0c3d28; background: #fff; color: #0c3d28; font-weight: 800; padding: 0 14px; cursor: pointer; }
        .orc-view button:last-child { border-right: 0; }
        .orc-view button.is-on { background: #105436; color: #fff; }
        .orc-view button:hover:not(.is-on) { background: #d1fae5; }
        .orc-cc td { background: #d1fae5; font-weight: 700; color: #064e3b; }
        .orc-obra td { background: #a7f3d0; font-weight: 800; color: #064e3b; }
        .orc-leaf td { background: #fff; font-weight: 600; color: #0f172a; }
        .orc-neg { color: #991b1b; }
        .orc-table tbody tr[data-orc-row] { cursor: pointer; }
        .orc-table tbody tr.orc-picked td,
        .orc-table tbody tr.orc-picked .orc-y27,
        .orc-table tbody tr.orc-picked .orc-fc { background: #ffedd5; color: #7c2d12; }
        .orc-table tbody tr.orc-picked .orc-neg { color: #b91c1c; }
        .orc-table tbody tr.orc-picked:hover td { background: #fed7aa; }
        .orc-table tbody tr.orc-picked td:first-child { box-shadow: inset 4px 0 0 #f37021; }
        .orc-y27 { color: #064e3b; }
        .orc-fc { color: #9a3412; }
        .orc-table th.orc-fc { color: #fde68a; }
        .orc-kpi strong.orc-fc { color: #9a3412; }
        .orc-emp .orc-y27, .orc-emp .orc-fc, .orc-emp .orc-neg,
        .orc-total .orc-y27, .orc-total .orc-fc, .orc-total .orc-neg { color: #fff; }
        .orc-legend { font-size: 0.68rem; font-weight: 600; color: #64748b; }
        .orc-exp { border: 0; background: transparent; cursor: pointer; width: 22px; color: inherit; font-size: 0.85rem; }
        .orc-code { font-family: ui-monospace, Consolas, monospace; margin-right: 8px; }
        .orc-sub { display: block; margin-left: 22px; font-weight: 500; color: #64748b; font-size: 0.72rem; }
        .orc-origem { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 3px 0 0 22px; }
        .orc-tag { display: inline-block; border-radius: 999px; padding: 1px 7px; font-size: 0.66rem; font-weight: 800; letter-spacing: 0.01em; }
        .orc-tag-cart { background: #dbeafe; color: #1e3a8a; }
        .orc-tag-vend { background: #ffedd5; color: #c2410c; }
        .orc-origem .orc-sub { display: inline; margin: 0; }
        .orc-cart-col { color: #1e3a8a; }
        .orc-vend-col { color: #c2410c; }
        .orc-kpi strong.orc-cart-col { color: #1e3a8a; }
        .orc-kpi strong.orc-vend-col { color: #c2410c; }
        .orc-emp td.orc-cart-col, .orc-emp td.orc-vend-col,
        .orc-total td.orc-cart-col, .orc-total td.orc-vend-col { color: #fff; }
        .orc-cc td.orc-cart-col, .orc-cc td.orc-vend-col,
        .orc-obra td.orc-cart-col, .orc-obra td.orc-vend-col { color: #064e3b; }
        .orc-table tbody tr:hover td { background: #ffedd5; }
        .orc-table tbody tr.orc-emp:hover td, .orc-table tbody tr.orc-total:hover td,
        .orc-table tbody tr.orc-emp:hover td *, .orc-table tbody tr.orc-total:hover td * { color: #7c2d12; }
        .orc-table tbody tr:hover .orc-neg,
        .orc-table tbody tr.orc-emp:hover .orc-neg, .orc-table tbody tr.orc-total:hover .orc-neg { color: #b91c1c; }
        .orc-table tbody tr.orc-picked:hover td { background: #fed7aa; }
        .orc-table td.orc-vend-hover { cursor: help; text-decoration: underline dotted; text-underline-offset: 3px; }
        .orc-empty { padding: 28px; text-align: center; color: #64748b; }
        .orc-sienge { color: #1e3a8a; cursor: help; font-variant-numeric: tabular-nums; }
        .orc-emp .orc-sienge, .orc-total .orc-sienge { color: #dbeafe; }
        .orc-cart-tip { position: fixed; z-index: 80; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px 6px; pointer-events: none; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.2); }
        .orc-cart-tip table { border-collapse: collapse; font-size: 0.72rem; }
        .orc-cart-tip th { text-align: right; font-weight: 700; color: #fff; background: #105436; padding: 4px 8px; }
        .orc-cart-tip th:first-child { text-align: left; border-radius: 4px 0 0 0; }
        .orc-cart-tip th:last-child { border-radius: 0 4px 0 0; }
        .orc-cart-tip td { text-align: right; padding: 2px 8px; font-variant-numeric: tabular-nums; }
        .orc-cart-tip td:first-child { text-align: left; color: #475569; font-weight: 700; }
        .orc-cart-tip tr.orc-cart-total td { border-top: 1px solid #e2e8f0; font-weight: 800; color: #0f172a; padding-top: 4px; }
        .orc-cart-tip .orc-cart-note { margin: 4px 2px 0; font-size: 0.66rem; color: #64748b; }
      </style>
      <div class="orc-head">
        <div>
          <h2>Orçamento 2026 × 2027</h2>
          <p>Empresa, centro de custo e a conta do plano. Os meses de 2026 vêm primeiro — janeiro a setembro recebido, outubro a dezembro forecast (*) — depois os de 2027. Carteira e Novas vendas separam o orçado de 2027 pela observação da base. A variação em reais e o percentual ficam em colunas separadas. O total soma cada mês. Valor Moura Leite aplica o % MLDU de cada empresa.</p>
        </div>
      </div>
      <div class="orc-tools">
        <div id="orc-emp-box"></div>
        <div id="orc-plan-box"></div>
        <input id="orc-search" class="orc-search" type="search" placeholder="Buscar empresa, centro de custo ou conta" value="${this.esc(this.query)}">
        <div class="orc-view">
          <button type="button" id="orc-view-total" class="${this.mouraView ? "" : "is-on"}">Valor total</button>
          <button type="button" id="orc-view-moura" class="${this.mouraView ? "is-on" : ""}">Valor Moura Leite</button>
        </div>
        <button type="button" class="orc-ghost${this.quarterView ? " is-on" : ""}" id="orc-quarter" title="Recolher os meses em trimestres"><i data-lucide="calendar-range"></i> ${this.quarterView ? "Ver meses" : "Por trimestre"}</button>
        <button type="button" class="orc-ghost" id="orc-expand"><i data-lucide="chevrons-down"></i> Expandir todos</button>
        <button type="button" class="orc-ghost orc-ghost-muted" id="orc-collapse"><i data-lucide="chevrons-up"></i> Recolher todos</button>
        <label class="moura-switch" title="Ligado soma o centro de custo com PARCERIA no nome. Desligado deixa só o empreendimento.">
          <input type="checkbox" id="orc-parceria" ${this.includeParceria ? "checked" : ""}>
          <span class="moura-switch-track" aria-hidden="true"></span>
          <span class="moura-switch-text">Incluir parceria</span>
        </label>
        <button type="button" class="btn btn-excel" id="orc-excel" title="Exportar tabela atual para Excel"><i data-lucide="download" style="width:14px;height:14px;"></i> Excel</button>
      </div>
      <div class="orc-kpis" id="orc-kpis"></div>
      <div class="orc-scroll">
        <table class="orc-table">
          <thead>
            <tr>
              <th class="orc-label" rowspan="2">Empresa / Centro de custo / Plano</th>
              <th class="orc-h26" colspan="${this.periodCols(2026).length}">2026</th>
              <th class="orc-h27 orc-split" colspan="${this.periodCols(2027).length}">2027</th>
              <th class="orc-cmp orc-split" colspan="9">Comparativo</th>
            </tr>
            <tr>
              ${this.periodCols(2026).map((col) => `<th class="orc-h26${col.forecast ? " orc-fc" : ""}">${this.esc(col.label)}</th>`).join("")}
              ${this.periodCols(2027).map((col, i) => `<th class="orc-h27${i === 0 ? " orc-split" : ""}">${this.esc(col.label)}</th>`).join("")}
              <th class="orc-split">Total 2026</th>
              <th>Total 2027</th>
              <th title="Parcela do orçado 2027 marcada como carteira na observação">Carteira</th>
              <th title="Parcela do orçado 2027 marcada como vendas na observação">Novas vendas</th>
              <th title="Total 2027 − Total 2026">Variação</th>
              <th title="Total 2027 − Total 2026">Variação %</th>
              <th class="orc-split" title="Carteira em aberto em 2027, sem sub judice">Sienge 2027</th>
              <th title="Carteira orçada 2027 − Sienge 2027, sem novas vendas">Variação</th>
              <th title="(Carteira orçada 2027 − Sienge 2027) ÷ Sienge 2027">Variação %</th>
            </tr>
          </thead>
          <tbody id="orc-body"></tbody>
        </table>
      </div>
      <div id="orc-cart-tip" class="orc-cart-tip" hidden></div>
    `;
    this.paintCompany();
    this.paintPlan();
    this.bind();
    this.paint();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    this.ready = true;
    this.prefetchCarteira();
  },

  companyItems() {
    return this.companies().map((c) => ({
      id: c.id,
      label: `${c.id} - ${c.name.toUpperCase()}`
    }));
  },

  paintCompany() {
    const box = document.getElementById("orc-emp-box");
    if (!box || !window.MlEmpresaFilter) return;
    box.innerHTML = MlEmpresaFilter.html({
      id: "orc-emp",
      label: "Empresas",
      items: this.companyItems(),
      selectedIds: this.selectedCompanyIds.map(String),
      open: this.companyDropOpen,
      query: this.companyQuery,
      emptyMeansAll: true
    });
    MlEmpresaFilter.bind("orc-emp", {
      toggleOpen: () => {
        this.companyDropOpen = !this.companyDropOpen;
        if (this.companyDropOpen) {
          this.planDropOpen = false;
          this.paintPlan();
        }
        this.paintCompany();
      },
      setQuery: (q) => {
        this.companyQuery = q || "";
        const list = document.getElementById("orc-emp-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-emp",
            items: this.companyItems(),
            selectedIds: this.selectedCompanyIds,
            query: this.companyQuery
          });
        }
      },
      toggleId: (id, on) => {
        const sid = String(id);
        if (on) {
          if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid);
        } else {
          this.selectedCompanyIds = this.selectedCompanyIds.filter((x) => x !== sid);
        }
        this.companyDropOpen = true;
        this.paintCompany();
        this.paint();
        this.prefetchCarteira();
      },
      selectAll: () => {
        this.selectedCompanyIds = this.companies().map((c) => c.id);
        this.companyDropOpen = true;
        this.paintCompany();
        this.paint();
        this.prefetchCarteira();
      },
      selectNone: () => {
        this.selectedCompanyIds = [];
        this.companyDropOpen = true;
        this.paintCompany();
        this.paint();
        this.prefetchCarteira();
      }
    });
  },

  plans() {
    const map = new Map();
    const add = (line) => {
      const id = String((line && line.conta) || "");
      if (!id || map.has(id)) return;
      const nome = String((line && line.nome) || "").trim() || this.accountName(id);
      map.set(id, nome);
    };
    (this.data().lines || []).forEach(add);
    (this.received().lines || []).forEach(add);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), "pt-BR", { numeric: true }));
  },

  planItems() {
    return this.plans().map((p) => ({
      id: p.id,
      label: p.id + " - " + String(p.name || "").toUpperCase()
    }));
  },

  planOn(conta) {
    if (!this.selectedPlanIds.length) return true;
    const code = String(conta || "");
    return this.selectedPlanIds.some((id) => code === id || code.indexOf(id + ".") === 0);
  },

  paintPlan() {
    const box = document.getElementById("orc-plan-box");
    if (!box || !window.MlEmpresaFilter) return;
    box.innerHTML = MlEmpresaFilter.html({
      id: "orc-plan",
      label: "Planos",
      items: this.planItems(),
      selectedIds: this.selectedPlanIds.map(String),
      open: this.planDropOpen,
      query: this.planQuery,
      emptyMeansAll: true,
      nouns: { singular: "plano", plural: "planos" }
    });
    MlEmpresaFilter.bind("orc-plan", {
      toggleOpen: () => {
        this.planDropOpen = !this.planDropOpen;
        if (this.planDropOpen) {
          this.companyDropOpen = false;
          this.paintCompany();
        }
        this.paintPlan();
      },
      setQuery: (q) => {
        this.planQuery = q || "";
        const list = document.getElementById("orc-plan-list");
        if (list) {
          list.innerHTML = MlEmpresaFilter.listHtml({
            id: "orc-plan",
            items: this.planItems(),
            selectedIds: this.selectedPlanIds,
            query: this.planQuery
          });
        }
      },
      toggleId: (id, on) => {
        const sid = String(id);
        if (on) {
          if (!this.selectedPlanIds.includes(sid)) this.selectedPlanIds.push(sid);
        } else {
          this.selectedPlanIds = this.selectedPlanIds.filter((x) => x !== sid);
        }
        this.planDropOpen = true;
        this.paintPlan();
        this.paint();
      },
      selectAll: () => {
        this.selectedPlanIds = this.plans().map((p) => p.id);
        this.planDropOpen = true;
        this.paintPlan();
        this.paint();
      },
      selectNone: () => {
        this.selectedPlanIds = [];
        this.planDropOpen = true;
        this.paintPlan();
        this.paint();
      }
    });
  },

  periodCols(year) {
    const months = this.months();
    if (!this.quarterView) {
      return months.map((m, i) => ({
        label: m + (year === 2026 && i >= 9 ? "*" : ""),
        indexes: [i],
        forecast: year === 2026 && i >= 9
      }));
    }
    return ["1º tri", "2º tri", "3º tri", "4º tri"].map((label, q) => ({
      label: label + (year === 2026 && q === 3 ? "*" : ""),
      indexes: [q * 3, q * 3 + 1, q * 3 + 2],
      forecast: year === 2026 && q === 3
    }));
  },

  sumIndexes(arr, indexes) {
    return (indexes || []).reduce((s, i) => s + (Number(arr && arr[i]) || 0), 0);
  },

  tableSpan() {
    return 1 + this.periodCols(2026).length + this.periodCols(2027).length + 9;
  },

  bind() {
    const search = document.getElementById("orc-search");
    if (search) {
      search.addEventListener("input", () => {
        this.query = search.value || "";
        this.paint();
      });
    }
    const viewTotal = document.getElementById("orc-view-total");
    if (viewTotal) viewTotal.addEventListener("click", () => this.setMoura(false));
    const viewMoura = document.getElementById("orc-view-moura");
    if (viewMoura) viewMoura.addEventListener("click", () => this.setMoura(true));
    const quarter = document.getElementById("orc-quarter");
    if (quarter) quarter.addEventListener("click", () => {
      this.quarterView = !this.quarterView;
      this.render();
    });
    const expand = document.getElementById("orc-expand");
    if (expand) expand.addEventListener("click", () => this.expandAll(true));
    const collapse = document.getElementById("orc-collapse");
    if (collapse) collapse.addEventListener("click", () => this.expandAll(false));
    const parceria = document.getElementById("orc-parceria");
    if (parceria) parceria.addEventListener("change", () => {
      this.includeParceria = !!parceria.checked;
      this.paint();
    });
    const excel = document.getElementById("orc-excel");
    if (excel) excel.addEventListener("click", () => this.exportExcel());
    const body = document.getElementById("orc-body");
    if (body) {
      body.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-orc-key]");
        if (!btn) {
          const tr = ev.target.closest("tr[data-orc-row]");
          if (!tr) return;
          const rowKey = tr.getAttribute("data-orc-row");
          if (this.pickedRows.has(rowKey)) this.pickedRows.delete(rowKey);
          else this.pickedRows.add(rowKey);
          tr.classList.toggle("orc-picked", this.pickedRows.has(rowKey));
          return;
        }
        const key = btn.getAttribute("data-orc-key");
        if (this.expanded.has(key)) this.expanded.delete(key);
        else this.expanded.add(key);
        this.hideCartTip();
        this.paint();
      });
      body.addEventListener("mouseover", (ev) => {
        const cell = ev.target.closest("td[data-sienge], td[data-vend]");
        if (!cell || cell === this._cartCell) return;
        this._cartCell = cell;
        this.placeCartTip(cell);
        if (!cell.hasAttribute("data-sienge")) return;
        const row = this._rows && this._rows[Number(cell.getAttribute("data-sienge"))];
        (row && row.companyIds || []).forEach((id) => this.flightCarteira(id));
      });
      body.addEventListener("mouseout", (ev) => {
        const cell = ev.target.closest("td[data-sienge], td[data-vend]");
        if (!cell) return;
        const next = ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest("td[data-sienge], td[data-vend]");
        if (next === cell) return;
        this.hideCartTip();
      });
    }
  },

  visibleCompanyIds() {
    return this.companies().map((c) => c.id).filter((id) => this.companyOn(id));
  },

  prefetchCarteira() {
    this.visibleCompanyIds().forEach((id) => this.flightCarteira(id));
  },

  flightCarteira(companyId) {
    const id = String(companyId || "");
    if (!id) return Promise.resolve();
    if (this.carteiraCompanies[id] === "done" || this.carteiraCompanies[id] === "error") return Promise.resolve();
    if (this._cartFlight[id]) return this._cartFlight[id];
    this.carteiraCompanies[id] = "loading";
    this._cartFlight[id] = this.fetchCarteiraCompany(id).then((pack) => {
      Object.keys(pack).forEach((cc) => { this.carteira[cc] = pack[cc]; });
      this.carteiraCompanies[id] = "done";
      this.saveCarteira();
    }).catch(() => {
      this.carteiraCompanies[id] = "error";
    }).finally(() => {
      delete this._cartFlight[id];
      this.refreshSiengeColumn();
      if (this._cartCell) this.placeCartTip(this._cartCell);
    });
    return this._cartFlight[id];
  },

  async bulkRows(path) {
    const once = window.siengeFetchWithRetry;
    if (typeof once !== "function") throw new Error("API Sienge indisponível.");
    const payload = await once(path, 2);
    return (payload && payload.data) || (Array.isArray(payload) ? payload : []);
  },

  async bulkRowsRange(buildPath, start, end) {
    try {
      return await this.bulkRows(buildPath(start, end));
    } catch (err) {
      if (Number(err && err.status) !== 507 || start >= end) throw err;
      const s = new Date(start + "T12:00:00");
      const e = new Date(end + "T12:00:00");
      const midDate = new Date(s.getTime() + Math.floor((e - s) / 2));
      const mid = midDate.getFullYear() + "-" + String(midDate.getMonth() + 1).padStart(2, "0") + "-" + String(midDate.getDate()).padStart(2, "0");
      const nextDate = new Date(mid + "T12:00:00");
      nextDate.setDate(nextDate.getDate() + 1);
      const next = nextDate.getFullYear() + "-" + String(nextDate.getMonth() + 1).padStart(2, "0") + "-" + String(nextDate.getDate()).padStart(2, "0");
      if (mid < start || mid >= end || next > end) throw err;
      const left = await this.bulkRowsRange(buildPath, start, mid);
      const right = await this.bulkRowsRange(buildPath, next, end);
      return left.concat(right);
    }
  },

  isSubJudiceIncome(row) {
    const flag = String(row && row.subJudicie || "").trim().toUpperCase();
    if (flag === "S" || flag === "SIM" || flag === "TRUE" || flag === "1") return true;
    const situation = String(row && row.defaulterSituation || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return situation.indexOf("SUB") >= 0 && situation.indexOf("JUD") >= 0;
  },

  async fetchCarteiraCompany(companyId) {
    const id = encodeURIComponent(companyId);
    const income = await this.bulkRowsRange(
      (start, end) => "/bulk-data/v1/income?startDate=" + encodeURIComponent(start) + "&endDate=" + encodeURIComponent(end) + "&selectionType=D&companyId=" + id,
      "2027-01-01",
      "2027-12-31"
    );
    const subKeys = new Set();
    income.forEach((row) => {
      if (!this.isSubJudiceIncome(row)) return;
      subKeys.add(String(row.billId) + "|" + String(row.installmentId));
    });
    const extract = await this.bulkRowsRange(
      (start, end) => "/bulk-data/v1/customer-extract-history?startDueDate=" + encodeURIComponent(start)
        + "&endDueDate=" + encodeURIComponent(end)
        + "&companyId=" + id
        + "&documentsId=CT&includeRemadeInstallments=false&includeCanceledInstallments=false&includeRevokedInstallments=false&includeRenegotiatedDischarge=false",
      "2027-01-01",
      "2027-12-31"
    );
    const byCc = {};
    const add = (cc, field, value, month) => {
      const key = String(cc);
      if (!byCc[key]) byCc[key] = { receber: 0, sub: 0, months: this.blank() };
      byCc[key][field] += value;
      if (field === "receber" && month >= 0 && month < 12) byCc[key].months[month] += value;
    };
    extract.forEach((item) => {
      const nested = (item && (item.billsReceivable || item.bills)) || [];
      const bills = nested.length ? nested : ((item && item.installments) ? [item] : []);
      bills.forEach((bill) => {
        const cc = bill && bill.costCenter && bill.costCenter.id;
        if (cc == null || cc === "") return;
        (bill.installments || []).forEach((inst) => {
          const due = String(inst.dueDate || inst.originalDueDate || "").slice(0, 10);
          if (due < "2027-01-01" || due > "2027-12-31") return;
          const balance = Number(inst.currentBalance != null ? inst.currentBalance : inst.balanceDue || 0);
          if (!(balance > 0.009)) return;
          const marked = subKeys.has(String(bill.billReceivableId) + "|" + String(inst.id));
          const month = Number(due.slice(5, 7)) - 1;
          add(cc, marked ? "sub" : "receber", balance, month);
        });
      });
    });
    return byCc;
  },

  cartSum(row) {
    const ids = (row && row.companyIds) || [];
    const months = this.blank();
    let receber = 0;
    let any = false;
    (row && row.cartCcs || []).forEach((cc) => {
      const pack = this.carteira[String(cc)];
      if (!pack) return;
      any = true;
      receber += Number(pack.receber) || 0;
      (pack.months || []).forEach((v, i) => { months[i] += Number(v) || 0; });
    });
    if (!ids.length) return { loading: !any, error: false, receber, months };
    const states = ids.map((id) => this.carteiraCompanies[String(id)]);
    if (!any && states.every((status) => status === "error")) return { error: true, receber: 0, months };
    if (!any && states.some((status) => status !== "done")) return { loading: true, receber: 0, months };
    return { receber, months };
  },

  refreshSiengeColumn() {
    const body = document.getElementById("orc-body");
    if (!body || !this._rows) return;
    body.querySelectorAll("td[data-sienge]").forEach((td) => {
      const idx = td.getAttribute("data-sienge");
      const row = this._rows[Number(idx)];
      if (!row) return;
      const fig = this.siengeFigures(row);
      const svar = body.querySelector('td[data-svar="' + idx + '"]');
      const spct = body.querySelector('td[data-spct="' + idx + '"]');
      const paint = (el, text, neg) => {
        if (!el) return;
        el.textContent = text;
        el.classList.toggle("orc-neg", !!neg);
      };
      if (fig.loading) {
        td.textContent = "…";
        paint(svar, "…", false);
        paint(spct, "…", false);
        return;
      }
      if (fig.error) {
        td.textContent = "—";
        paint(svar, "—", false);
        paint(spct, "—", false);
        return;
      }
      td.textContent = this.money(fig.receber);
      paint(svar, this.money(fig.delta), fig.delta < 0);
      paint(spct, this.pctLabel(fig.delta, fig.receber), fig.delta < 0);
    });
  },

  siengeFigures(row) {
    const sum = this.cartSum(row);
    if (sum.loading) return { loading: true };
    if (sum.error) return { error: true };
    const orcado = Number(row && row.cart) || 0;
    return { receber: sum.receber, orcado, delta: orcado - sum.receber };
  },

  siengeTipHtml(row, sum) {
    if (sum.loading) return "Buscando a carteira de 2027…";
    if (sum.error) return "Não foi possível consultar a carteira de 2027.";
    const cm = row.cm || this.blank();
    const lines = this.months().map((name, i) => {
      return "<tr><td>" + this.esc(String(name).toLowerCase()) + "</td><td>"
        + this.money(row.m26 && row.m26[i]) + "</td><td>"
        + this.money(cm[i]) + "</td><td>"
        + this.money(sum.months[i]) + "</td></tr>";
    }).join("");
    return "<table><thead><tr><th></th><th>2026</th><th>Carteira 2027</th><th>Sienge</th></tr></thead><tbody>"
      + lines
      + '<tr class="orc-cart-total"><td>Total</td><td>' + this.money(this.sum(row.m26))
      + "</td><td>" + this.money(Number(row.cart) || 0)
      + "</td><td>" + this.money(sum.receber) + "</td></tr></tbody></table>"
      + '<div class="orc-cart-note">out–dez de 2026 são forecast. Carteira 2027 é o orçado marcado como carteira, sem novas vendas. Sienge é a carteira em aberto, sem sub judice.</div>';
  },

  vendTipHtml(row) {
    const vm = row.vm || this.blank();
    const lines = this.months().map((name, i) => "<tr><td>" + this.esc(String(name).toLowerCase()) + "</td><td>" + this.money(vm[i]) + "</td></tr>").join("");
    return "<table><thead><tr><th></th><th>Novas vendas 2027</th></tr></thead><tbody>"
      + lines
      + '<tr class="orc-cart-total"><td>Total</td><td>' + this.money(this.sum(vm)) + "</td></tr></tbody></table>"
      + '<div class="orc-cart-note">Orçado de vendas mês a mês, conforme a observação da base.</div>';
  },

  placeCartTip(cell) {
    const tip = document.getElementById("orc-cart-tip");
    if (!tip || !cell || !cell.isConnected) return;
    const vendIdx = cell.getAttribute("data-vend");
    const row = this._rows && this._rows[Number(vendIdx != null ? vendIdx : cell.getAttribute("data-sienge"))];
    if (!row) return;
    tip.innerHTML = vendIdx != null ? this.vendTipHtml(row) : this.siengeTipHtml(row, this.cartSum(row));
    tip.hidden = false;
    const rect = cell.getBoundingClientRect();
    const width = tip.offsetWidth || 280;
    const height = tip.offsetHeight || 280;
    let left = rect.left - width - 8;
    if (left < 8) left = Math.min(rect.right + 8, window.innerWidth - width - 8);
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    let top = rect.top;
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  },

  hideCartTip() {
    this._cartCell = null;
    const tip = document.getElementById("orc-cart-tip");
    if (tip) tip.hidden = true;
  },

  received() {
    return window.ORCAMENTO_RECEITA_2026 || { lines: [] };
  },

  blank() {
    return Array(12).fill(0);
  },

  setMoura(on) {
    this.mouraView = !!on;
    const total = document.getElementById("orc-view-total");
    const moura = document.getElementById("orc-view-moura");
    if (total) total.classList.toggle("is-on", !this.mouraView);
    if (moura) moura.classList.toggle("is-on", this.mouraView);
    this.paint();
  },

  participation(companyId) {
    const id = String(companyId);
    let custom = {};
    try { custom = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {}; } catch (e) { custom = {}; }
    const row = custom[id];
    if (row && row.percentual_mldu != null && row.percentual_mldu !== "") {
      const n = Number(row.percentual_mldu);
      return Number.isFinite(n) ? n : 0;
    }
    const defaults = { "1": 100, "5": 66, "6": 50, "12": 50, "13": 27.75, "32": 100 };
    return defaults[id] != null ? defaults[id] : 0;
  },

  shareFactor(companyId) {
    if (!this.mouraView) return 1;
    return this.participation(companyId) / 100;
  },

  scaleMonths(arr, factor) {
    return (arr || this.blank()).map((v) => (Number(v) || 0) * factor);
  },

  pctLabel(delta, base) {
    if (Math.abs(base) < 0.005) return "—";
    const p = (delta / base) * 100;
    const sign = p > 0 ? "+" : "";
    return sign + p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  },

  origemDe(line) {
    const map = window.ORCAMENTO_ORIGEM_2027 || {};
    const key = String(line.e || "") + "|" + String(line.cc || "") + "|" + String(line.conta || "");
    return map[key] || null;
  },

  addMonths(target, source, conta) {
    (source || []).forEach((v, i) => {
      target[i] += this.signed(conta, v);
    });
  },

  mergedAccounts() {
    const map = new Map();
    this._names = Object.assign({}, (this.data().names || {}));
    const touch = (line) => {
      const e = String(line.e || "");
      const cc = String(line.cc || "");
      const conta = String(line.conta || "");
      if (!e || !cc || !conta || !this.companyOn(e) || !this.planOn(conta)) return null;
      const key = e + "|" + cc + "|" + conta;
      let row = map.get(key);
      if (!row) {
        row = {
          e,
          en: String(line.en || "").replace(/\s+/g, " ").trim(),
          cc,
          cn: String(line.cn || "").replace(/\s+/g, " ").trim(),
          conta,
          nome: String(line.nome || "").trim(),
          m26: this.blank(),
          m27: this.blank(),
          cart: 0,
          cm: this.blank(),
          vend: 0,
          vm: this.blank(),
          notas: ""
        };
        map.set(key, row);
      }
      if (!row.en && line.en) row.en = String(line.en).replace(/\s+/g, " ").trim();
      if (!row.cn && line.cn) row.cn = String(line.cn).replace(/\s+/g, " ").trim();
      if (!row.nome && line.nome) row.nome = String(line.nome).trim();
      if (row.nome) this._names[row.conta] = row.nome;
      return row;
    };
    (this.data().lines || []).forEach((line) => {
      const row = touch(line);
      if (!row) return;
      this.addMonths(row.m27, line.m, line.conta);
      if (row._origem) return;
      const o = this.origemDe(line);
      if (!o) return;
      row.cart = this.signed(line.conta, o.cart);
      row.vend = this.signed(line.conta, o.vend);
      if (Array.isArray(o.cm)) row.cm = o.cm.map((v) => this.signed(line.conta, v));
      if (Array.isArray(o.vm)) row.vm = o.vm.map((v) => this.signed(line.conta, v));
      row.notas = (o.notas || []).join(" · ");
      row._origem = true;
    });
    (this.received().lines || []).forEach((line) => {
      const row = touch(line);
      if (row) this.addMonths(row.m26, line.m, line.conta);
    });
    return map;
  },

  obraPrefix(code) {
    const s = String(code || "").trim();
    if (!/^\d{4,}$/.test(s)) return "";
    return s.slice(0, -2);
  },

  isParceriaCc(cc) {
    const name = String((cc && cc.cn) || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return name.indexOf("PARCERIA") >= 0;
  },

  groupCostCenters(emp) {
    const buckets = new Map();
    const singles = [];
    (emp.costCenters || []).forEach((cc) => {
      const prefix = this.obraPrefix(cc.cc);
      if (!prefix || prefix === "147") {
        singles.push(cc);
        return;
      }
      if (!buckets.has(prefix)) buckets.set(prefix, []);
      buckets.get(prefix).push(cc);
    });
    const items = [];
    buckets.forEach((list, prefix) => {
      list.sort((a, b) => String(a.cc).localeCompare(String(b.cc), "pt-BR", { numeric: true }));
      if (list.length < 2) {
        singles.push(list[0]);
        return;
      }
      const first = list[0];
      const product = list.find((cc) => !this.isParceriaCc(cc) && /00$/.test(String(cc.cc)))
        || list.find((cc) => !this.isParceriaCc(cc))
        || first;
      items.push({
        grouped: true,
        key: emp.key + "|obra:" + prefix,
        prefix: prefix,
        label: product.cc + " — " + (product.cn || ""),
        centers: list,
        sort: String(first.cc)
      });
    });
    singles.forEach((cc) => items.push({ grouped: false, cc: cc, sort: String(cc.cc) }));
    items.sort((a, b) => String(a.sort).localeCompare(String(b.sort), "pt-BR", { numeric: true }));
    return items;
  },

  companiesTree() {
    const q = this.query.trim().toLowerCase();
    const byEmp = new Map();
    this.mergedAccounts().forEach((row) => {
      const blob = `${row.e} ${row.en} ${row.cc} ${row.cn} ${row.conta} ${this.accountName(row.conta)} ${row.notas || ""}`.toLowerCase();
      const empHit = !q || `${row.e} ${row.en}`.toLowerCase().includes(q);
      const ccHit = !q || `${row.cc} ${row.cn}`.toLowerCase().includes(q);
      const accHit = !q || this.accountBlob(row.conta).includes(q);
      if (q && !blob.includes(q)) return;
      if (!byEmp.has(row.e)) {
        byEmp.set(row.e, { key: "e:" + row.e, e: row.e, en: row.en, ccs: new Map() });
      }
      const emp = byEmp.get(row.e);
      if (!emp.en && row.en) emp.en = row.en;
      const ccKey = emp.key + "|cc:" + row.cc;
      if (!emp.ccs.has(row.cc)) {
        emp.ccs.set(row.cc, { key: ccKey, cc: row.cc, cn: row.cn, accounts: new Map(), empHit, ccHit });
      }
      const cc = emp.ccs.get(row.cc);
      if (!cc.cn && row.cn) cc.cn = row.cn;
      cc.empHit = cc.empHit || empHit;
      cc.ccHit = cc.ccHit || ccHit;
      cc.accounts.set(row.conta, row);
      if (!cc._accHit) cc._accHit = accHit;
      else cc._accHit = cc._accHit || accHit;
    });

    const companies = [...byEmp.values()].sort((a, b) => Number(a.e) - Number(b.e));
    companies.forEach((emp) => {
      emp.costCenters = [...emp.ccs.values()]
        .filter((cc) => {
          if (!q) return true;
          if (cc.empHit || cc.ccHit) return true;
          return [...cc.accounts.keys()].some((conta) => this.accountBlob(conta).includes(q));
        })
        .filter((cc) => this.includeParceria || !this.isParceriaCc(cc))
        .sort((a, b) => String(a.cc).localeCompare(String(b.cc), "pt-BR", { numeric: true }));
      emp.obras = this.groupCostCenters(emp);
      const openSearch = q && q !== this._openedFor;
      emp.costCenters.forEach((cc) => {
        const showAll = !q || cc.empHit || cc.ccHit;
        cc.tree = this.buildTree(cc.accounts, q, showAll);
      });
      if (openSearch) {
        this.expanded.add(emp.key);
        emp.obras.forEach((item) => {
          if (item.grouped) this.expanded.add(item.key);
          (item.grouped ? item.centers : [item.cc]).forEach((cc) => this.expanded.add(cc.key));
        });
      }
    });
    this._openedFor = q;
    return companies.filter((emp) => emp.costCenters.length);
  },

  accountBlob(conta) {
    return `${conta} ${this.accountName(conta)}`.toLowerCase();
  },

  buildTree(accounts, q, showAll) {
    const root = { children: new Map() };
    accounts.forEach((acc) => {
      if (!showAll && q && !this.accountBlob(acc.conta).includes(q)) return;
      const parts = String(acc.conta).split(".");
      let node = root;
      let code = "";
      parts.forEach((part, idx) => {
        code = code ? code + "." + part : part;
        if (!node.children.has(code)) {
          node.children.set(code, {
            code,
            m26: this.blank(),
            m27: this.blank(),
            cart: 0,
            cm: this.blank(),
            vend: 0,
            vm: this.blank(),
            leaf: false,
            children: new Map()
          });
        }
        const child = node.children.get(code);
        acc.m26.forEach((v, i) => { child.m26[i] += v; });
        acc.m27.forEach((v, i) => { child.m27[i] += v; });
        child.cart += Number(acc.cart) || 0;
        (acc.cm || []).forEach((v, i) => { child.cm[i] += Number(v) || 0; });
        child.vend += Number(acc.vend) || 0;
        (acc.vm || []).forEach((v, i) => { child.vm[i] += Number(v) || 0; });
        if (idx === parts.length - 1) child.leaf = true;
        node = child;
      });
    });
    return root;
  },

  expandAll(open) {
    if (!open) {
      this.expanded = new Set();
      this.paint();
      return;
    }
    const next = new Set();
    this.companiesTree().forEach((emp) => {
      next.add(emp.key);
      (emp.obras || []).forEach((item) => {
        if (item.grouped) next.add(item.key);
        (item.grouped ? item.centers : [item.cc]).forEach((cc) => next.add(cc.key));
      });
    });
    this.expanded = next;
    this.paint();
  },

  sumNode(node, field) {
    const totals = this.blank();
    (node.children || new Map()).forEach((child) => {
      child[field].forEach((v, i) => { totals[i] += v; });
    });
    return totals;
  },

  sumScalar(node, field) {
    let total = 0;
    (node.children || new Map()).forEach((child) => { total += Number(child[field]) || 0; });
    return total;
  },

  collect() {
    const companies = this.companiesTree();
    const rows = [];
    const y26 = this.blank();
    const y27 = this.blank();
    const yVm = this.blank();
    const yCm = this.blank();
    let yCart = 0;
    let yVend = 0;
    companies.forEach((emp) => {
      const e26 = this.blank();
      const e27 = this.blank();
      const eVm = this.blank();
      const eCm = this.blank();
      let eCart = 0;
      let eVend = 0;
      emp.costCenters.forEach((cc) => {
        this.sumNode(cc.tree, "m26").forEach((v, i) => { e26[i] += v; });
        this.sumNode(cc.tree, "m27").forEach((v, i) => { e27[i] += v; });
        this.sumNode(cc.tree, "vm").forEach((v, i) => { eVm[i] += v; });
        this.sumNode(cc.tree, "cm").forEach((v, i) => { eCm[i] += v; });
        eCart += this.sumScalar(cc.tree, "cart");
        eVend += this.sumScalar(cc.tree, "vend");
      });
      const factor = this.shareFactor(emp.e);
      const se26 = this.scaleMonths(e26, factor);
      const se27 = this.scaleMonths(e27, factor);
      const seVm = this.scaleMonths(eVm, factor);
      const seCm = this.scaleMonths(eCm, factor);
      const seCart = eCart * factor;
      const seVend = eVend * factor;
      se26.forEach((v, i) => { y26[i] += v; });
      se27.forEach((v, i) => { y27[i] += v; });
      seVm.forEach((v, i) => { yVm[i] += v; });
      seCm.forEach((v, i) => { yCm[i] += v; });
      yCart += seCart;
      yVend += seVend;
      const shareNote = this.mouraView ? (" · " + this.participation(emp.e).toLocaleString("pt-BR") + "% ML") : "";
      rows.push({
        kind: "emp",
        level: "Empresa",
        key: emp.key,
        depth: 0,
        label: emp.e + " — " + (emp.en || "") + shareNote,
        companyId: emp.e,
        companyIds: [String(emp.e)],
        cartCcs: emp.costCenters.map((cc) => cc.cc),
        m26: se26,
        m27: se27,
        cart: seCart,
        cm: seCm,
        vend: seVend,
        vm: seVm,
        expandable: true,
        parentEmp: "",
        parentObra: "",
        parentCc: ""
      });
      const pushCenter = (cc, depth, parentObra) => {
        rows.push({
          kind: "cc",
          level: "Centro de custo",
          key: cc.key,
          depth: depth,
          label: cc.cc + " — " + cc.cn,
          companyId: emp.e,
          companyIds: [String(emp.e)],
          cartCcs: [cc.cc],
          m26: this.scaleMonths(this.sumNode(cc.tree, "m26"), factor),
          m27: this.scaleMonths(this.sumNode(cc.tree, "m27"), factor),
          cart: this.sumScalar(cc.tree, "cart") * factor,
          cm: this.scaleMonths(this.sumNode(cc.tree, "cm"), factor),
          vend: this.sumScalar(cc.tree, "vend") * factor,
          vm: this.scaleMonths(this.sumNode(cc.tree, "vm"), factor),
          expandable: true,
          parentEmp: emp.key,
          parentObra: parentObra,
          parentCc: ""
        });
        this.leafAccounts(cc).forEach((acc) => {
          rows.push({
            kind: "leaf",
            level: "Conta",
            key: cc.key + "|" + acc.conta,
            depth: depth + 1,
            label: acc.conta + "  " + (acc.nome || this.accountName(acc.conta)),
            notas: acc.notas || "",
            m26: this.scaleMonths(acc.m26, factor),
            m27: this.scaleMonths(acc.m27, factor),
            cart: (Number(acc.cart) || 0) * factor,
            cm: this.scaleMonths(acc.cm, factor),
            vend: (Number(acc.vend) || 0) * factor,
            vm: this.scaleMonths(acc.vm, factor),
            expandable: false,
            parentEmp: emp.key,
            parentObra: parentObra,
            parentCc: cc.key
          });
        });
      };
      (emp.obras || []).forEach((item) => {
        if (!item.grouped) {
          pushCenter(item.cc, 1, "");
          return;
        }
        const g26 = this.blank();
        const g27 = this.blank();
        const gVm = this.blank();
        const gCm = this.blank();
        let gCart = 0;
        let gVend = 0;
        item.centers.forEach((cc) => {
          this.sumNode(cc.tree, "m26").forEach((v, i) => { g26[i] += v; });
          this.sumNode(cc.tree, "m27").forEach((v, i) => { g27[i] += v; });
          this.sumNode(cc.tree, "vm").forEach((v, i) => { gVm[i] += v; });
          this.sumNode(cc.tree, "cm").forEach((v, i) => { gCm[i] += v; });
          gCart += this.sumScalar(cc.tree, "cart");
          gVend += this.sumScalar(cc.tree, "vend");
        });
        rows.push({
          kind: "obra",
          level: "Obra",
          key: item.key,
          depth: 1,
          label: item.label,
          companyId: emp.e,
          companyIds: [String(emp.e)],
          cartCcs: item.centers.map((cc) => cc.cc),
          m26: this.scaleMonths(g26, factor),
          m27: this.scaleMonths(g27, factor),
          cart: gCart * factor,
          cm: this.scaleMonths(gCm, factor),
          vend: gVend * factor,
          vm: this.scaleMonths(gVm, factor),
          expandable: true,
          parentEmp: emp.key,
          parentObra: "",
          parentCc: ""
        });
        item.centers.forEach((cc) => pushCenter(cc, 2, item.key));
      });
    });
    if (companies.length) {
      const allCcs = [];
      const allIds = [];
      companies.forEach((emp) => {
        allIds.push(String(emp.e));
        (emp.costCenters || []).forEach((cc) => allCcs.push(cc.cc));
      });
      rows.push({
        kind: "total",
        level: "Total",
        key: "",
        depth: 0,
        label: "Total",
        companyIds: allIds,
        cartCcs: allCcs,
        m26: y26,
        m27: y27,
        cart: yCart,
        cm: yCm,
        vend: yVend,
        vm: yVm,
        expandable: false,
        parentEmp: "",
        parentObra: "",
        parentCc: ""
      });
    }
    return { companies, rows, y26, y27, yCart, yVend };
  },

  rowVisible(row) {
    if (row.kind === "emp" || row.kind === "total") return true;
    const empOpen = this.expanded.has(row.parentEmp);
    if (row.kind === "obra") return empOpen;
    if (row.kind === "cc") {
      if (row.parentObra) return empOpen && this.expanded.has(row.parentObra);
      return empOpen;
    }
    const ccOpen = this.expanded.has(row.parentCc);
    if (row.parentObra) return empOpen && this.expanded.has(row.parentObra) && ccOpen;
    return empOpen && ccOpen;
  },

  paint() {
    this.hideCartTip();
    const body = document.getElementById("orc-body");
    const kpis = document.getElementById("orc-kpis");
    if (!body) return;
    const data = this.collect();
    data.rows.forEach((row, i) => { row._i = i; });
    this._rows = data.rows;
    const html = data.rows.filter((row) => this.rowVisible(row)).map((row) => this.rowHtml(row));
    body.innerHTML = html.join("") || '<tr><td class="orc-empty" colspan="' + this.tableSpan() + '">Nenhuma empresa com essas contas.</td></tr>';
    if (kpis) {
      const y26 = data.y26;
      const y27 = data.y27;
      const rec = this.sum(y26.slice(0, 9));
      const fc = this.sum(y26.slice(9));
      const t26 = this.sum(y26);
      const t27 = this.sum(y27);
      const delta = t27 - t26;
      kpis.innerHTML = `
        <div class="orc-kpi"><span>EMPRESAS</span><strong>${data.companies.length}</strong></div>
        <div class="orc-kpi"><span>RECEBIDO JAN–SET 2026</span><strong>${this.money(rec)}</strong></div>
        <div class="orc-kpi"><span>FORECAST OUT–DEZ 2026</span><strong class="orc-fc">${this.money(fc)}</strong></div>
        <div class="orc-kpi"><span>2026 COMPLETO</span><strong>${this.money(t26)}</strong></div>
        <div class="orc-kpi"><span>ORÇADO 2027</span><strong>${this.money(t27)}</strong></div>
        <div class="orc-kpi"><span>CARTEIRA 2027</span><strong class="orc-cart-col">${this.money(data.yCart)}</strong></div>
        <div class="orc-kpi"><span>NOVAS VENDAS 2027</span><strong class="orc-vend-col">${this.money(data.yVend)}</strong></div>
        <div class="orc-kpi"><span>VARIAÇÃO 2027 − 2026</span><strong class="${delta < 0 ? "orc-neg" : ""}">${this.money(delta)} <span class="orc-pct">${this.pctLabel(delta, t26)}</span></strong></div>
      `;
    }
  },

  leafAccounts(cc) {
    const q = this.query.trim().toLowerCase();
    const showAll = !q || cc.empHit || cc.ccHit;
    return [...cc.accounts.values()]
      .filter((acc) => showAll || this.accountBlob(acc.conta).includes(q))
      .sort((a, b) => String(a.conta).localeCompare(String(b.conta), "pt-BR", { numeric: true }));
  },

  origemHtml(row) {
    if (row.kind !== "leaf") return "";
    const bits = [];
    if (row.cart) bits.push('<span class="orc-tag orc-tag-cart">Carteira</span>');
    if (row.vend) bits.push('<span class="orc-tag orc-tag-vend">Novas vendas</span>');
    if (row.notas) bits.push('<span class="orc-sub">' + this.esc(row.notas) + "</span>");
    return bits.length ? '<span class="orc-origem">' + bits.join("") + "</span>" : "";
  },

  origemCell(row, field) {
    const cart = Number(row.cart) || 0;
    const vend = Number(row.vend) || 0;
    if (!cart && !vend && !row.notas) return '<td>—</td>';
    if (field === "cart") return this.moneyCell(cart, "orc-cart-col");
    if (!vend) return this.moneyCell(vend, "orc-vend-col");
    const cls = ["orc-vend-col", "orc-vend-hover", vend < 0 ? "orc-neg" : ""].filter(Boolean).join(" ");
    return '<td class="' + cls + '" data-vend="' + row._i + '">' + this.money(vend) + "</td>";
  },

  moneyCell(value, extra) {
    const cls = [value < 0 ? "orc-neg" : "", extra || ""].filter(Boolean).join(" ");
    return '<td class="' + cls + '">' + this.money(value) + "</td>";
  },

  pctCell(delta, base) {
    const cls = delta < 0 ? "orc-neg orc-pct-col" : "orc-pct-col";
    return '<td class="' + cls + '">' + this.pctLabel(delta, base) + "</td>";
  },

  rowHtml(row) {
    const open = this.expanded.has(row.key);
    const chevron = row.expandable
      ? '<button type="button" class="orc-exp" data-orc-key="' + this.esc(row.key) + '">' + (open ? "▾" : "▸") + "</button>"
      : '<span class="orc-exp"></span>';
    const pad = 8 + row.depth * 18;
    const t26 = this.sum(row.m26);
    const t27 = this.sum(row.m27);
    const delta = t27 - t26;
    const cls = (row.kind === "emp" ? "orc-emp" : (row.kind === "total" ? "orc-total" : (row.kind === "obra" ? "orc-obra" : (row.kind === "cc" ? "orc-cc" : "orc-leaf"))))
      + (row.key && this.pickedRows.has(row.key) ? " orc-picked" : "");
    const cart = (row.cartCcs ? ' data-cart="' + row._i + '"' : "")
      + (row.key ? ' data-orc-row="' + this.esc(row.key) + '"' : "");
    const y26 = this.periodCols(2026).map((col) => this.moneyCell(this.sumIndexes(row.m26, col.indexes), col.forecast ? "orc-fc" : "")).join("");
    const y27 = this.periodCols(2027).map((col, i) => this.moneyCell(this.sumIndexes(row.m27, col.indexes), "orc-y27" + (i === 0 ? " orc-split" : ""))).join("");
    return '<tr class="' + cls + '"' + cart + '><td style="padding-left:' + pad + 'px;">' + chevron + "<span>" + this.esc(row.label) + "</span>" + this.origemHtml(row) + "</td>"
      + y26 + y27
      + this.moneyCell(t26, "orc-split")
      + this.moneyCell(t27, "orc-y27")
      + this.origemCell(row, "cart")
      + this.origemCell(row, "vend")
      + this.moneyCell(delta, delta < 0 ? "orc-neg" : "")
      + this.pctCell(delta, t26)
      + this.siengeCells(row)
      + "</tr>";
  },

  siengeCells(row) {
    if (!row.cartCcs) {
      return '<td class="orc-sienge orc-split">—</td><td>—</td><td>—</td>';
    }
    const fig = this.siengeFigures(row);
    const idx = row._i;
    if (fig.loading) {
      return '<td class="orc-sienge orc-split" data-sienge="' + idx + '">…</td>'
        + '<td data-svar="' + idx + '">…</td>'
        + '<td data-spct="' + idx + '">…</td>';
    }
    if (fig.error) {
      return '<td class="orc-sienge orc-split" data-sienge="' + idx + '">—</td>'
        + '<td data-svar="' + idx + '">—</td>'
        + '<td data-spct="' + idx + '">—</td>';
    }
    const neg = fig.delta < 0 ? " orc-neg" : "";
    return '<td class="orc-sienge orc-split" data-sienge="' + idx + '">' + this.money(fig.receber) + "</td>"
      + '<td class="' + neg.trim() + '" data-svar="' + idx + '">' + this.money(fig.delta) + "</td>"
      + '<td class="orc-pct-col' + neg + '" data-spct="' + idx + '">' + this.pctLabel(fig.delta, fig.receber) + "</td>";
  },

  async exportExcel() {
    const data = this.collect();
    if (!data.companies.length) {
      alert("Não há empresas para exportar com esse filtro.");
      return;
    }
    const inv = window.InvestimentoApp;
    if (!inv || !inv.ensureExcelJS) {
      alert("Não foi possível carregar a exportação. Recarregue a página.");
      return;
    }
    let ExcelJS;
    try {
      ExcelJS = await inv.ensureExcelJS();
    } catch (e) {
      alert("Não foi possível carregar a biblioteca de Excel. Recarregue a página.");
      return;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    wb.created = new Date();
    let imgId = null;
    try {
      const logo = await inv.logoDataUrl();
      imgId = wb.addImage({ base64: logo.dataUrl, extension: logo.extension || "png" });
    } catch (e) { /* logo opcional */ }

    const c26 = this.periodCols(2026);
    const c27 = this.periodCols(2027);
    const colCount = 2 + c26.length + c27.length + 9;
    const start27 = 3 + c26.length;
    const startCmp = start27 + c27.length;
    const ws = wb.addWorksheet("Orçamento", { properties: { showGridLines: false } });
    ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
    ws.views = [{
      state: "frozen",
      xSplit: 2,
      ySplit: 5,
      topLeftCell: "C6",
      activeCell: "C6",
      showGridLines: false
    }];
    ws.columns = [
      { width: 18 },
      { width: 52 },
      ...Array.from({ length: c26.length + c27.length }, () => ({ width: 14 })),
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
      { width: 14 }
    ];

    const logoPx = Math.round(1.54 * 96 / 2.54);
    ws.mergeCells("A1:B2");
    ws.getRow(1).height = 28;
    ws.getRow(2).height = 22;
    const view = this.mouraView ? "Valor Moura Leite" : "Valor total";
    const title = ws.getCell("A1");
    title.value = {
      richText: [
        { font: { name: "Calibri", size: 14, bold: true, color: { argb: "FF475569" } }, text: "Orçamento 2026 × 2027\n" },
        { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: view + " · empresa, centro de custo e conta" }
      ]
    };
    inv.excelPaint(title, {
      fill: "FFFFFFFF",
      align: { vertical: "middle", horizontal: "left", wrapText: true, indent: 8 }
    });
    if (imgId != null) {
      try {
        ws.addImage(imgId, { tl: { col: 0.04, row: 0.08 }, ext: { width: logoPx, height: logoPx } });
      } catch (e) { /* logo opcional */ }
    }

    const y26 = data.y26;
    const y27 = data.y27;
    const t26 = this.sum(y26);
    const t27 = this.sum(y27);
    const delta = t27 - t26;
    const kpis = [
      { label: "Empresas", value: data.companies.length, color: "FF0F172A", money: false },
      { label: "Recebido jan–set 2026", value: this.sum(y26.slice(0, 9)), color: "FF0F172A", money: true },
      { label: "Forecast out–dez 2026", value: this.sum(y26.slice(9)), color: "FF9A3412", money: true },
      { label: "2026 completo", value: t26, color: "FF0F172A", money: true },
      { label: "Orçado 2027", value: t27, color: "FF105436", money: true },
      { label: "Variação", value: delta, color: delta < 0 ? "FFB91C1C" : "FF105436", money: true }
    ];
    kpis.forEach((k, i) => {
      const col = 4 + i;
      const cellL = ws.getRow(1).getCell(col);
      const cellV = ws.getRow(2).getCell(col);
      cellL.value = k.label;
      cellV.value = k.value;
      inv.excelPaint(cellL, {
        fill: "FFFFFFFF",
        font: { bold: true, size: 8, color: { argb: "FF94A3B8" } },
        align: { horizontal: "right", vertical: "bottom" }
      });
      inv.excelPaint(cellV, {
        fill: "FFFFFFFF",
        font: { bold: true, size: 12, color: { argb: k.color } },
        align: { horizontal: "right", vertical: "middle" },
        numFmt: k.money ? "#,##0.00" : "0"
      });
    });
    const pctHead = ws.getRow(1).getCell(10);
    const pctVal = ws.getRow(2).getCell(10);
    pctHead.value = "Variação %";
    pctVal.value = Math.abs(t26) < 0.005 ? null : delta / t26;
    inv.excelPaint(pctHead, {
      fill: "FFFFFFFF",
      font: { bold: true, size: 8, color: { argb: "FF94A3B8" } },
      align: { horizontal: "right", vertical: "bottom" }
    });
    inv.excelPaint(pctVal, {
      fill: "FFFFFFFF",
      font: { bold: true, size: 12, color: { argb: delta < 0 ? "FFB91C1C" : "FF105436" } },
      align: { horizontal: "right", vertical: "middle" },
      numFmt: "0.0%"
    });

    ws.getRow(3).height = 8;
    ws.mergeCells(4, 1, 5, 1);
    ws.mergeCells(4, 2, 5, 2);
    ws.mergeCells(4, 3, 4, start27 - 1);
    ws.mergeCells(4, start27, 4, startCmp - 1);
    ws.mergeCells(4, startCmp, 4, colCount);
    const groupHeads = [
      [1, "Nível", "FF334155"],
      [2, "Empresa / Centro de custo / Plano", "FF334155"],
      [3, "2026", "FF0C3D28"],
      [start27, "2027", "FF1A6B45"],
      [startCmp, "Comparativo", "FF334155"]
    ];
    const fillSpan = (from, to, fill) => {
      for (let c = from; c <= to; c++) {
        inv.excelPaint(ws.getRow(4).getCell(c), {
          fill,
          font: { bold: true, size: 9, color: { argb: "FFFFFFFF" } },
          align: { horizontal: "center", vertical: "middle" },
          border: true
        });
      }
    };
    fillSpan(1, 2, "FF334155");
    fillSpan(3, start27 - 1, "FF0C3D28");
    fillSpan(start27, startCmp - 1, "FF1A6B45");
    fillSpan(startCmp, colCount, "FF334155");
    groupHeads.forEach(([col, text]) => {
      ws.getRow(4).getCell(col).value = text;
    });
    const heads = ["", ""].concat(c26.map((col) => col.label), c27.map((col) => col.label), ["Total 2026", "Total 2027", "Carteira", "Novas vendas", "Variação", "Variação %", "Sienge 2027", "Variação", "Variação %"]);
    const headRow = ws.getRow(5);
    headRow.height = 20;
    heads.forEach((h, i) => {
      if (i < 2) return;
      const cell = headRow.getCell(i + 1);
      cell.value = h;
      const in26 = i >= 2 && i < start27 - 1;
      const in27 = i >= start27 - 1 && i < startCmp - 1;
      const forecast = in26 && c26[i - 2] && c26[i - 2].forecast;
      inv.excelPaint(cell, {
        fill: in26 ? "FF0C3D28" : (in27 ? "FF1A6B45" : "FF334155"),
        font: { bold: true, size: 9, color: { argb: forecast ? "FFFDE68A" : "FFFFFFFF" } },
        align: { horizontal: "center", vertical: "middle" },
        border: true
      });
    });
    ws.getRow(4).height = 20;

    const moneyFmt = "#,##0.00";
    const paintMoney = (cell, n, kind, forecast) => {
      cell.value = Number(n) || 0;
      const dark = kind === "emp" || kind === "total";
      const band = kind === "cc" || kind === "obra";
      const bg = kind === "emp" ? "FF0C3D28" : (kind === "total" ? "FF134E3A" : (kind === "obra" ? "FFA7F3D0" : (kind === "cc" ? "FFD1FAE5" : "FFFFFFFF")));
      let color = dark ? "FFFFFFFF" : (n < 0 ? "FFB91C1C" : "FF0F172A");
      if (!dark && forecast) color = "FF9A3412";
      if (dark && forecast) color = "FFFDE68A";
      if (!dark && band && n >= 0 && !forecast) color = "FF064E3B";
      inv.excelPaint(cell, {
        fill: bg,
        font: { bold: kind !== "leaf", size: 9, color: { argb: color } },
        align: { horizontal: "right", vertical: "middle" },
        border: true,
        numFmt: moneyFmt
      });
    };
    const paintPct = (cell, d, base, kind) => {
      const dark = kind === "emp" || kind === "total";
      const bg = kind === "emp" ? "FF0C3D28" : (kind === "total" ? "FF134E3A" : (kind === "obra" ? "FFA7F3D0" : (kind === "cc" ? "FFD1FAE5" : "FFFFFFFF")));
      if (Math.abs(base) < 0.005) {
        cell.value = "—";
        inv.excelPaint(cell, {
          fill: bg,
          font: { bold: true, size: 9, color: { argb: dark ? "FFFFFFFF" : "FF64748B" } },
          align: { horizontal: "right", vertical: "middle" },
          border: true
        });
        return;
      }
      cell.value = d / base;
      const color = dark ? "FFFFFFFF" : (d < 0 ? "FFB91C1C" : "FF105436");
      inv.excelPaint(cell, {
        fill: bg,
        font: { bold: true, size: 9, color: { argb: color } },
        align: { horizontal: "right", vertical: "middle" },
        border: true,
        numFmt: "0.0%"
      });
    };

    let rowIdx = 6;
    data.rows.forEach((row) => {
      const excelRow = ws.getRow(rowIdx);
      excelRow.height = 18;
      if (row.kind === "obra") excelRow.outlineLevel = 1;
      if (row.kind === "cc") excelRow.outlineLevel = row.parentObra ? 2 : 1;
      if (row.kind === "leaf") excelRow.outlineLevel = row.parentObra ? 3 : 2;
      const bg = row.kind === "emp" ? "FF0C3D28" : (row.kind === "total" ? "FF134E3A" : (row.kind === "obra" ? "FFA7F3D0" : (row.kind === "cc" ? "FFD1FAE5" : "FFFFFFFF")));
      const color = (row.kind === "emp" || row.kind === "total") ? "FFFFFFFF" : ((row.kind === "cc" || row.kind === "obra") ? "FF064E3B" : "FF0F172A");
      const levelCell = excelRow.getCell(1);
      levelCell.value = row.level;
      inv.excelPaint(levelCell, {
        fill: bg,
        font: { bold: row.kind !== "leaf", size: 9, color: { argb: color } },
        align: { horizontal: "left", vertical: "middle" },
        border: true
      });
      const labelCell = excelRow.getCell(2);
      labelCell.value = row.notas ? (row.label + " · " + row.notas) : row.label;
      inv.excelPaint(labelCell, {
        fill: bg,
        font: { bold: row.kind !== "leaf", size: 9, color: { argb: color } },
        align: { horizontal: "left", vertical: "middle", indent: row.depth },
        border: true
      });
      c26.forEach((col, i) => paintMoney(excelRow.getCell(3 + i), this.sumIndexes(row.m26, col.indexes), row.kind, col.forecast));
      c27.forEach((col, i) => paintMoney(excelRow.getCell(start27 + i), this.sumIndexes(row.m27, col.indexes), row.kind, false));
      const a26 = this.sum(row.m26);
      const a27 = this.sum(row.m27);
      const d = a27 - a26;
      const paintDash = (cell) => {
        cell.value = "—";
        const dark = row.kind === "emp" || row.kind === "total";
        const fill = row.kind === "emp" ? "FF0C3D28" : (row.kind === "total" ? "FF134E3A" : (row.kind === "obra" ? "FFA7F3D0" : (row.kind === "cc" ? "FFD1FAE5" : "FFFFFFFF")));
        inv.excelPaint(cell, {
          fill,
          font: { bold: row.kind !== "leaf", size: 9, color: { argb: dark ? "FFFFFFFF" : "FF64748B" } },
          align: { horizontal: "right", vertical: "middle" },
          border: true
        });
      };
      paintMoney(excelRow.getCell(startCmp), a26, row.kind, false);
      paintMoney(excelRow.getCell(startCmp + 1), a27, row.kind, false);
      if (!(Number(row.cart) || Number(row.vend) || row.notas)) {
        paintDash(excelRow.getCell(startCmp + 2));
        paintDash(excelRow.getCell(startCmp + 3));
      } else {
        paintMoney(excelRow.getCell(startCmp + 2), row.cart, row.kind, false);
        paintMoney(excelRow.getCell(startCmp + 3), row.vend, row.kind, false);
      }
      paintMoney(excelRow.getCell(startCmp + 4), d, row.kind, false);
      paintPct(excelRow.getCell(startCmp + 5), d, a26, row.kind);
      if (!row.cartCcs) {
        paintDash(excelRow.getCell(startCmp + 6));
        paintDash(excelRow.getCell(startCmp + 7));
        paintDash(excelRow.getCell(startCmp + 8));
      } else {
        const fig = this.siengeFigures(row);
        if (fig.loading || fig.error) {
          paintDash(excelRow.getCell(startCmp + 6));
          paintDash(excelRow.getCell(startCmp + 7));
          paintDash(excelRow.getCell(startCmp + 8));
          if (fig.loading) {
            excelRow.getCell(startCmp + 6).value = "…";
            excelRow.getCell(startCmp + 7).value = "…";
            excelRow.getCell(startCmp + 8).value = "…";
          }
        } else {
          paintMoney(excelRow.getCell(startCmp + 6), fig.receber, row.kind, false);
          paintMoney(excelRow.getCell(startCmp + 7), fig.delta, row.kind, false);
          paintPct(excelRow.getCell(startCmp + 8), fig.delta, fig.receber, row.kind);
        }
      }
      rowIdx += 1;
    });

    rowIdx += 1;
    ws.mergeCells(rowIdx, 1, rowIdx, colCount);
    const foot = ws.getCell(rowIdx, 1);
    foot.value = inv.generatedAtLabel(new Date()) + " · meses com * em 2026 são forecast · grupos: empresa, centro de custo e conta";
    inv.excelPaint(foot, {
      font: { italic: true, size: 8, color: { argb: "FF64748B" } },
      align: { vertical: "middle", horizontal: "left" }
    });
    ws.getRow(rowIdx).height = 18;

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = "orcamento_2026_2027_" + stamp + ".xlsx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }
};

window.OrcamentoApp = OrcamentoApp;
