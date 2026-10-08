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
        .orc-head { background: #105436; color: #fff; border-radius: 12px; padding: 16px 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
        .orc-head h2 { margin: 0; font-size: 1.15rem; font-weight: 700; }
        .orc-head p { margin: 4px 0 0; font-size: 0.8rem; opacity: 0.9; max-width: 720px; }
        .orc-tools { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
        .orc-search { height: 38px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 12px; min-width: 240px; font-size: 0.9rem; }
        .orc-btn { height: 38px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #105436; font-weight: 650; padding: 0 12px; cursor: pointer; }
        .orc-btn:hover { background: #f0fdf4; }
        .orc-kpis { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .orc-kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; min-width: 140px; }
        .orc-kpi span { display: block; color: #64748b; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; }
        .orc-kpi strong { font-size: 1rem; color: #105436; }
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
        .orc-total td { position: sticky; bottom: 0; background: #134e3a; color: #fff; font-weight: 800; z-index: 2; border-top: 2px solid #0c3d28; }
        .orc-total td:first-child { z-index: 3; background: #134e3a; }
        .orc-var, .orc-pct { display: block; line-height: 1.2; }
        .orc-pct { font-size: 0.68rem; font-weight: 700; }
        .orc-view { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
        .orc-view button { height: 38px; border: 0; background: #fff; color: #105436; font-weight: 700; padding: 0 12px; cursor: pointer; }
        .orc-view button.is-on { background: #105436; color: #fff; }
        .orc-cc td { background: #e8f5ee; font-weight: 700; color: #105436; }
        .orc-leaf td { background: #fff; font-weight: 500; color: #1e293b; }
        .orc-neg { color: #b91c1c; }
        .orc-y27 { color: #105436; }
        .orc-fc { color: #b45309; }
        .orc-emp .orc-y27, .orc-emp .orc-fc, .orc-emp .orc-neg { color: inherit; }
        .orc-legend { font-size: 0.68rem; font-weight: 600; color: #64748b; }
        .orc-exp { border: 0; background: transparent; cursor: pointer; width: 22px; color: inherit; font-size: 0.85rem; }
        .orc-code { font-family: ui-monospace, Consolas, monospace; margin-right: 8px; }
        .orc-sub { display: block; margin-left: 22px; font-weight: 500; color: #64748b; font-size: 0.72rem; }
        .orc-empty { padding: 28px; text-align: center; color: #64748b; }
      </style>
      <div class="orc-head">
        <div>
          <h2>Orçamento 2026 × 2027</h2>
          <p>Empresa, centro de custo e a conta do plano. Os meses de 2026 vêm primeiro — janeiro a setembro recebido, outubro a dezembro forecast (*) — depois os de 2027. A variação traz o valor e o percentual. O total soma cada mês. Valor Moura Leite aplica o % MLDU de cada empresa.</p>
        </div>
      </div>
      <div class="orc-tools">
        <div id="orc-emp-box"></div>
        <input id="orc-search" class="orc-search" type="search" placeholder="Buscar empresa, centro de custo ou conta" value="${this.esc(this.query)}">
        <div class="orc-view">
          <button type="button" id="orc-view-total" class="${this.mouraView ? "" : "is-on"}">Valor total</button>
          <button type="button" id="orc-view-moura" class="${this.mouraView ? "is-on" : ""}">Valor Moura Leite</button>
        </div>
        <button type="button" class="orc-btn" id="orc-expand">Expandir todos</button>
        <button type="button" class="orc-btn" id="orc-collapse">Recolher todos</button>
      </div>
      <div class="orc-kpis" id="orc-kpis"></div>
      <div class="orc-scroll">
        <table class="orc-table">
          <thead>
            <tr>
              <th class="orc-label" rowspan="2">Empresa / Centro de custo / Plano</th>
              <th class="orc-h26" colspan="12">2026</th>
              <th class="orc-h27 orc-split" colspan="12">2027</th>
              <th class="orc-cmp orc-split" colspan="3">Comparativo</th>
            </tr>
            <tr>
              ${months.map((m, i) => `<th class="orc-h26${i >= 9 ? " orc-fc" : ""}">${m}${i >= 9 ? "*" : ""}</th>`).join("")}
              ${months.map((m, i) => `<th class="orc-h27${i === 0 ? " orc-split" : ""}">${m}</th>`).join("")}
              <th class="orc-split">Total 2026</th>
              <th>Total 2027</th>
              <th>Variação</th>
            </tr>
          </thead>
          <tbody id="orc-body"></tbody>
        </table>
      </div>
    `;
    this.paintCompany();
    this.bind();
    this.paint();
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

  paint() {
    const body = document.getElementById("orc-body");
    const kpis = document.getElementById("orc-kpis");
    if (!body) return;
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
      rows.push(this.rowHtml({
        kind: "emp",
        key: emp.key,
        depth: 0,
        label: emp.e + " — " + (emp.en || "") + shareNote,
        m26: se26,
        m27: se27,
        expandable: true
      }));
      if (!this.expanded.has(emp.key)) return;
      emp.costCenters.forEach((cc) => {
        rows.push(this.rowHtml({
          kind: "cc",
          key: cc.key,
          depth: 1,
          label: cc.cc + " — " + cc.cn,
          m26: this.scaleMonths(this.sumNode(cc.tree, "m26"), factor),
          m27: this.scaleMonths(this.sumNode(cc.tree, "m27"), factor),
          expandable: true
        }));
        if (!this.expanded.has(cc.key)) return;
        this.leafAccounts(cc).forEach((acc) => {
          rows.push(this.rowHtml({
            kind: "leaf",
            key: cc.key + "|" + acc.conta,
            depth: 2,
            label: acc.conta + "  " + (acc.nome || this.accountName(acc.conta)),
            m26: this.scaleMonths(acc.m26, factor),
            m27: this.scaleMonths(acc.m27, factor),
            expandable: false
          }));
        });
      });
    });
    if (companies.length) {
      rows.push(this.rowHtml({
        kind: "total",
        key: "",
        depth: 0,
        label: "Total",
        m26: y26,
        m27: y27,
        expandable: false
      }));
    }
    body.innerHTML = rows.join("") || '<tr><td class="orc-empty" colspan="28">Nenhuma empresa com essas contas.</td></tr>';
    if (kpis) {
      const rec = this.sum(y26.slice(0, 9));
      const fc = this.sum(y26.slice(9));
      const t26 = this.sum(y26);
      const t27 = this.sum(y27);
      const delta = t27 - t26;
      kpis.innerHTML = `
        <div class="orc-kpi"><span>EMPRESAS</span><strong>${companies.length}</strong></div>
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

  varCell(delta, base, extra) {
    const cls = [delta < 0 ? "orc-neg" : "", extra || ""].filter(Boolean).join(" ");
    return '<td class="' + cls + '"><span class="orc-var">' + this.money(delta) + '</span><span class="orc-pct">' + this.pctLabel(delta, base) + "</span></td>";
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
      + this.varCell(delta, t26, "")
      + "</tr>";
  }
};

window.OrcamentoApp = OrcamentoApp;
