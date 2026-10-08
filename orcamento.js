// Orçamento 2027 — receitas. Centro de custo primeiro, plano financeiro depois.
const OrcamentoApp = {
  year: 2027,
  query: "",
  selectedCompanyIds: [],
  companyDropOpen: false,
  companyQuery: "",
  expanded: new Set(),
  mouraView: false,
  ready: false,

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
    this.render();
  },

  render() {
    const root = document.getElementById("orcamento-root");
    if (!root) return;
    const months = this.months();
    root.innerHTML = `
      <style>
        #orcamento-root { font-family: inherit; color: #0f172a; }
        .orc-head { background: #0c3d28; color: #fff; border-radius: 12px; padding: 16px 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
        .orc-head h2 { margin: 0; font-size: 1.15rem; font-weight: 800; color: #fff; }
        .orc-head p { margin: 6px 0 0; font-size: 0.84rem; color: #fff; max-width: 820px; line-height: 1.4; }
        .orc-tools { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
        .orc-search { height: 40px; border: 1px solid #475569; border-radius: 8px; padding: 0 12px; min-width: 240px; font-size: 0.9rem; color: #0f172a; background: #fff; }
        #orcamento-root .ml-emp-filter { flex: 0 0 460px; width: 460px; max-width: none; min-width: 420px; }
        #orcamento-root .btn-excel { height: 40px; }
        .orc-ghost { height: 40px; border-radius: 8px; border: 1px solid #105436; background: #fff; color: #105436; font-weight: 800; padding: 0 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; }
        .orc-ghost:hover { background: #d1fae5; }
        .orc-ghost-muted { border-color: #cbd5e1; color: #475569; }
        .orc-ghost-muted:hover { background: #f1f5f9; }
        .orc-ghost svg { width: 14px; height: 14px; }
        .orc-kpis { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .orc-kpi { background: #fff; border: 1px solid #94a3b8; border-top: 4px solid #105436; border-radius: 10px; padding: 12px 14px 10px; min-width: 150px; flex: 1; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08); }
        .orc-kpi span { display: block; color: #1e293b; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.03em; }
        .orc-kpi strong { display: block; margin-top: 4px; font-size: 1.15rem; font-weight: 800; color: #0c3d28; line-height: 1.2; }
        .orc-kpi strong .orc-pct { display: inline; margin-left: 6px; font-size: 0.95rem; }
        .orc-scroll { overflow: auto; max-height: calc(100vh - 280px); border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
        .orc-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 0.78rem; }
        .orc-table th { position: sticky; background: #105436; color: #fff; z-index: 2; padding: 8px 10px; text-align: right; font-weight: 700; white-space: nowrap; }
        .orc-table thead tr:first-child th { top: 0; z-index: 4; }
        .orc-table thead tr:first-child th.orc-h26,
        .orc-table thead tr:first-child th.orc-h27,
        .orc-table thead tr:first-child th.orc-cmp { text-align: center; }
        .orc-table thead tr:nth-child(2) th { top: 33px; z-index: 3; text-align: center; }
        .orc-table th.orc-label { text-align: left; left: 0; z-index: 5; min-width: 380px; }
        .orc-table th.orc-h26 { background: #0c3d28; }
        .orc-table th.orc-h27 { background: #1a6b45; }
        .orc-table th.orc-fc { color: #fde68a; }
        .orc-table td { padding: 6px 10px; border-bottom: 1px solid #eef2f6; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .orc-table td:first-child { text-align: left; position: sticky; left: 0; z-index: 1; }
        .orc-split { border-left: 2px solid rgba(15, 23, 42, 0.18); }
        .orc-emp td { background: #0c3d28; color: #fff; font-weight: 700; }
        .orc-table tbody tr.orc-leaf:hover td { background: #d1fae5; }
        .orc-table tbody tr.orc-cc:hover td { background: #6ee7b7; }
        .orc-table tbody tr.orc-emp:hover td { background: #166534; }
        .orc-table tbody tr.orc-total:hover td { background: #065f46; }
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
        .orc-leaf td { background: #fff; font-weight: 600; color: #0f172a; }
        .orc-neg { color: #991b1b; }
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
        .orc-empty { padding: 28px; text-align: center; color: #64748b; }
      </style>
      <div class="orc-head">
        <div>
          <h2>Orçamento 2026 × 2027</h2>
          <p>Empresa, centro de custo e a conta do plano. Os meses de 2026 vêm primeiro — janeiro a setembro recebido, outubro a dezembro forecast (*) — depois os de 2027. A variação em reais e o percentual ficam em colunas separadas. O total soma cada mês. Valor Moura Leite aplica o % MLDU de cada empresa.</p>
        </div>
      </div>
      <div class="orc-tools">
        <div id="orc-emp-box"></div>
        <input id="orc-search" class="orc-search" type="search" placeholder="Buscar empresa, centro de custo ou conta" value="${this.esc(this.query)}">
        <div class="orc-view">
          <button type="button" id="orc-view-total" class="${this.mouraView ? "" : "is-on"}">Valor total</button>
          <button type="button" id="orc-view-moura" class="${this.mouraView ? "is-on" : ""}">Valor Moura Leite</button>
        </div>
        <button type="button" class="orc-ghost" id="orc-expand"><i data-lucide="chevrons-down"></i> Expandir todos</button>
        <button type="button" class="orc-ghost orc-ghost-muted" id="orc-collapse"><i data-lucide="chevrons-up"></i> Recolher todos</button>
        <button type="button" class="btn btn-excel" id="orc-excel" title="Exportar tabela atual para Excel"><i data-lucide="download" style="width:14px;height:14px;"></i> Excel</button>
      </div>
      <div class="orc-kpis" id="orc-kpis"></div>
      <div class="orc-scroll">
        <table class="orc-table">
          <thead>
            <tr>
              <th class="orc-label" rowspan="2">Empresa / Centro de custo / Plano</th>
              <th class="orc-h26" colspan="12">2026</th>
              <th class="orc-h27 orc-split" colspan="12">2027</th>
              <th class="orc-cmp orc-split" colspan="4">Comparativo</th>
            </tr>
            <tr>
              ${months.map((m, i) => `<th class="orc-h26${i >= 9 ? " orc-fc" : ""}">${m}${i >= 9 ? "*" : ""}</th>`).join("")}
              ${months.map((m, i) => `<th class="orc-h27${i === 0 ? " orc-split" : ""}">${m}</th>`).join("")}
              <th class="orc-split">Total 2026</th>
              <th>Total 2027</th>
              <th>Variação</th>
              <th>Variação %</th>
            </tr>
          </thead>
          <tbody id="orc-body"></tbody>
        </table>
      </div>
    `;
    this.paintCompany();
    this.bind();
    this.paint();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    this.ready = true;
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
      },
      selectAll: () => {
        this.selectedCompanyIds = this.companies().map((c) => c.id);
        this.companyDropOpen = true;
        this.paintCompany();
        this.paint();
      },
      selectNone: () => {
        this.selectedCompanyIds = [];
        this.companyDropOpen = true;
        this.paintCompany();
        this.paint();
      }
    });
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
    const expand = document.getElementById("orc-expand");
    if (expand) expand.addEventListener("click", () => this.expandAll(true));
    const collapse = document.getElementById("orc-collapse");
    if (collapse) collapse.addEventListener("click", () => this.expandAll(false));
    const excel = document.getElementById("orc-excel");
    if (excel) excel.addEventListener("click", () => this.exportExcel());
    const body = document.getElementById("orc-body");
    if (body) {
      body.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-orc-key]");
        if (!btn) return;
        const key = btn.getAttribute("data-orc-key");
        if (this.expanded.has(key)) this.expanded.delete(key);
        else this.expanded.add(key);
        this.paint();
      });
    }
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
      if (!e || !cc || !conta || !this.companyOn(e)) return null;
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
          m27: this.blank()
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
      if (row) this.addMonths(row.m27, line.m, line.conta);
    });
    (this.received().lines || []).forEach((line) => {
      const row = touch(line);
      if (row) this.addMonths(row.m26, line.m, line.conta);
    });
    return map;
  },

  companiesTree() {
    const q = this.query.trim().toLowerCase();
    const byEmp = new Map();
    this.mergedAccounts().forEach((row) => {
      const blob = `${row.e} ${row.en} ${row.cc} ${row.cn} ${row.conta} ${this.accountName(row.conta)}`.toLowerCase();
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
        .sort((a, b) => String(a.cc).localeCompare(String(b.cc), "pt-BR", { numeric: true }));
      emp.costCenters.forEach((cc) => {
        const showAll = !q || cc.empHit || cc.ccHit;
        cc.tree = this.buildTree(cc.accounts, q, showAll);
        if (q && q !== this._openedFor) {
          this.expanded.add(emp.key);
          this.expanded.add(cc.key);
        }
      });
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
            leaf: false,
            children: new Map()
          });
        }
        const child = node.children.get(code);
        acc.m26.forEach((v, i) => { child.m26[i] += v; });
        acc.m27.forEach((v, i) => { child.m27[i] += v; });
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
      emp.costCenters.forEach((cc) => next.add(cc.key));
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

  collect() {
    const companies = this.companiesTree();
    const rows = [];
    const y26 = this.blank();
    const y27 = this.blank();
    companies.forEach((emp) => {
      const e26 = this.blank();
      const e27 = this.blank();
      emp.costCenters.forEach((cc) => {
        this.sumNode(cc.tree, "m26").forEach((v, i) => { e26[i] += v; });
        this.sumNode(cc.tree, "m27").forEach((v, i) => { e27[i] += v; });
      });
      const factor = this.shareFactor(emp.e);
      const se26 = this.scaleMonths(e26, factor);
      const se27 = this.scaleMonths(e27, factor);
      se26.forEach((v, i) => { y26[i] += v; });
      se27.forEach((v, i) => { y27[i] += v; });
      const shareNote = this.mouraView ? (" · " + this.participation(emp.e).toLocaleString("pt-BR") + "% ML") : "";
      rows.push({
        kind: "emp",
        level: "Empresa",
        key: emp.key,
        depth: 0,
        label: emp.e + " — " + (emp.en || "") + shareNote,
        m26: se26,
        m27: se27,
        expandable: true,
        parentEmp: "",
        parentCc: ""
      });
      emp.costCenters.forEach((cc) => {
        rows.push({
          kind: "cc",
          level: "Centro de custo",
          key: cc.key,
          depth: 1,
          label: cc.cc + " — " + cc.cn,
          m26: this.scaleMonths(this.sumNode(cc.tree, "m26"), factor),
          m27: this.scaleMonths(this.sumNode(cc.tree, "m27"), factor),
          expandable: true,
          parentEmp: emp.key,
          parentCc: ""
        });
        this.leafAccounts(cc).forEach((acc) => {
          rows.push({
            kind: "leaf",
            level: "Conta",
            key: cc.key + "|" + acc.conta,
            depth: 2,
            label: acc.conta + "  " + (acc.nome || this.accountName(acc.conta)),
            m26: this.scaleMonths(acc.m26, factor),
            m27: this.scaleMonths(acc.m27, factor),
            expandable: false,
            parentEmp: emp.key,
            parentCc: cc.key
          });
        });
      });
    });
    if (companies.length) {
      rows.push({
        kind: "total",
        level: "Total",
        key: "",
        depth: 0,
        label: "Total",
        m26: y26,
        m27: y27,
        expandable: false,
        parentEmp: "",
        parentCc: ""
      });
    }
    return { companies, rows, y26, y27 };
  },

  rowVisible(row) {
    if (row.kind === "emp" || row.kind === "total") return true;
    if (row.kind === "cc") return this.expanded.has(row.parentEmp);
    return this.expanded.has(row.parentEmp) && this.expanded.has(row.parentCc);
  },

  paint() {
    const body = document.getElementById("orc-body");
    const kpis = document.getElementById("orc-kpis");
    if (!body) return;
    const data = this.collect();
    const html = data.rows.filter((row) => this.rowVisible(row)).map((row) => this.rowHtml(row));
    body.innerHTML = html.join("") || '<tr><td class="orc-empty" colspan="29">Nenhuma empresa com essas contas.</td></tr>';
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
    const cls = row.kind === "emp" ? "orc-emp" : (row.kind === "total" ? "orc-total" : (row.kind === "cc" ? "orc-cc" : "orc-leaf"));
    const y26 = row.m26.map((v, i) => this.moneyCell(v, i >= 9 ? "orc-fc" : "")).join("");
    const y27 = row.m27.map((v, i) => this.moneyCell(v, "orc-y27" + (i === 0 ? " orc-split" : ""))).join("");
    return '<tr class="' + cls + '"><td style="padding-left:' + pad + 'px;">' + chevron + "<span>" + this.esc(row.label) + "</span></td>"
      + y26 + y27
      + this.moneyCell(t26, "orc-split")
      + this.moneyCell(t27, "orc-y27")
      + this.moneyCell(delta, delta < 0 ? "orc-neg" : "")
      + this.pctCell(delta, t26)
      + "</tr>";
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

    const months = this.months();
    const colCount = 2 + 24 + 4;
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
      ...Array.from({ length: 24 }, () => ({ width: 14 })),
      { width: 16 },
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
    ws.mergeCells(4, 3, 4, 14);
    ws.mergeCells(4, 15, 4, 26);
    ws.mergeCells(4, 27, 4, 30);
    const groupHeads = [
      [1, "Nível", "FF334155"],
      [2, "Empresa / Centro de custo / Plano", "FF334155"],
      [3, "2026", "FF0C3D28"],
      [15, "2027", "FF1A6B45"],
      [27, "Comparativo", "FF334155"]
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
    fillSpan(3, 14, "FF0C3D28");
    fillSpan(15, 26, "FF1A6B45");
    fillSpan(27, 30, "FF334155");
    groupHeads.forEach(([col, text]) => {
      ws.getRow(4).getCell(col).value = text;
    });
    const monthHeads = months.map((m, i) => m + (i >= 9 ? "*" : ""));
    const heads = ["", "", ...monthHeads, ...months, "Total 2026", "Total 2027", "Variação", "Variação %"];
    const headRow = ws.getRow(5);
    headRow.height = 20;
    heads.forEach((h, i) => {
      if (i < 2) return;
      const cell = headRow.getCell(i + 1);
      cell.value = h;
      const forecast = i >= 2 && i <= 13 && (i - 2) >= 9;
      inv.excelPaint(cell, {
        fill: i <= 13 ? "FF0C3D28" : (i <= 25 ? "FF1A6B45" : "FF334155"),
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
      const bg = kind === "emp" ? "FF0C3D28" : (kind === "total" ? "FF134E3A" : (kind === "cc" ? "FFD1FAE5" : "FFFFFFFF"));
      let color = dark ? "FFFFFFFF" : (n < 0 ? "FFB91C1C" : "FF0F172A");
      if (!dark && forecast) color = "FF9A3412";
      if (dark && forecast) color = "FFFDE68A";
      if (!dark && kind === "cc" && n >= 0 && !forecast) color = "FF064E3B";
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
      const bg = kind === "emp" ? "FF0C3D28" : (kind === "total" ? "FF134E3A" : (kind === "cc" ? "FFD1FAE5" : "FFFFFFFF"));
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
      if (row.kind === "cc") excelRow.outlineLevel = 1;
      if (row.kind === "leaf") excelRow.outlineLevel = 2;
      const bg = row.kind === "emp" ? "FF0C3D28" : (row.kind === "total" ? "FF134E3A" : (row.kind === "cc" ? "FFD1FAE5" : "FFFFFFFF"));
      const color = (row.kind === "emp" || row.kind === "total") ? "FFFFFFFF" : (row.kind === "cc" ? "FF064E3B" : "FF0F172A");
      const levelCell = excelRow.getCell(1);
      levelCell.value = row.level;
      inv.excelPaint(levelCell, {
        fill: bg,
        font: { bold: row.kind !== "leaf", size: 9, color: { argb: color } },
        align: { horizontal: "left", vertical: "middle" },
        border: true
      });
      const labelCell = excelRow.getCell(2);
      labelCell.value = row.label;
      inv.excelPaint(labelCell, {
        fill: bg,
        font: { bold: row.kind !== "leaf", size: 9, color: { argb: color } },
        align: { horizontal: "left", vertical: "middle", indent: row.depth },
        border: true
      });
      row.m26.forEach((v, i) => paintMoney(excelRow.getCell(3 + i), v, row.kind, i >= 9));
      row.m27.forEach((v, i) => paintMoney(excelRow.getCell(15 + i), v, row.kind, false));
      const a26 = this.sum(row.m26);
      const a27 = this.sum(row.m27);
      const d = a27 - a26;
      paintMoney(excelRow.getCell(27), a26, row.kind, false);
      paintMoney(excelRow.getCell(28), a27, row.kind, false);
      paintMoney(excelRow.getCell(29), d, row.kind, false);
      paintPct(excelRow.getCell(30), d, a26, row.kind);
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
