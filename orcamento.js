// Orçamento 2027 — receitas. Centro de custo primeiro, plano financeiro depois.
const OrcamentoApp = {
  year: 2027,
  query: "",
  selectedCompanyIds: [],
  companyDropOpen: false,
  companyQuery: "",
  expanded: new Set(),
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
        .orc-table th { position: sticky; top: 0; background: #105436; color: #fff; z-index: 2; padding: 8px 10px; text-align: right; font-weight: 700; white-space: nowrap; }
        .orc-table th:first-child { text-align: left; left: 0; z-index: 3; min-width: 420px; }
        .orc-table td { padding: 6px 10px; border-bottom: 1px solid #eef2f6; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .orc-table td:first-child { text-align: left; position: sticky; left: 0; z-index: 1; }
        .orc-emp td { background: #0c3d28; color: #fff; font-weight: 700; }
        .orc-cc td { background: #e8f5ee; font-weight: 700; color: #105436; }
        .orc-node td { background: #f8fafc; font-weight: 650; }
        .orc-leaf td { background: #fff; font-weight: 500; color: #1e293b; }
        .orc-neg { color: #b91c1c; }
        .orc-pair { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
        .orc-y26 { font-size: 0.75rem; }
        .orc-y27 { font-size: 0.75rem; color: #105436; }
        .orc-fc { color: #b45309; }
        .orc-emp .orc-y27, .orc-emp .orc-y26 { color: inherit; }
        .orc-legend { font-size: 0.68rem; font-weight: 600; color: #64748b; }
        .orc-exp { border: 0; background: transparent; cursor: pointer; width: 22px; color: inherit; font-size: 0.85rem; }
        .orc-code { font-family: ui-monospace, Consolas, monospace; margin-right: 8px; }
        .orc-sub { display: block; margin-left: 22px; font-weight: 500; color: #64748b; font-size: 0.72rem; }
        .orc-empty { padding: 28px; text-align: center; color: #64748b; }
      </style>
      <div class="orc-head">
        <div>
          <h2>Orçamento 2026 × 2027</h2>
          <p>Empresa, centro de custo e plano financeiro. Em cada mês, a linha de cima é 2026 — janeiro a setembro recebido, outubro a dezembro forecast — e a de baixo é o orçado 2027. O desconto de juros contratuais reduz o total.</p>
        </div>
      </div>
      <div class="orc-tools">
        <div id="orc-emp-box"></div>
        <input id="orc-search" class="orc-search" type="search" placeholder="Buscar empresa, centro de custo ou conta" value="${this.esc(this.query)}">
        <button type="button" class="orc-btn" id="orc-expand">Expandir todos</button>
        <button type="button" class="orc-btn" id="orc-collapse">Recolher todos</button>
      </div>
      <div class="orc-kpis" id="orc-kpis"></div>
      <div class="orc-scroll">
        <table class="orc-table">
          <thead>
            <tr>
              <th>Empresa / Centro de custo / Plano</th>
              ${months.map((m, i) => `<th>${m}${i >= 9 ? "*" : ""}</th>`).join("")}
              <th>2026</th>
              <th>2027</th>
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
          cc.accounts.forEach((acc) => {
            if (!showAll && !this.accountBlob(acc.conta).includes(q)) return;
            const parts = String(acc.conta).split(".");
            let code = "";
            parts.forEach((part, idx) => {
              code = code ? code + "." + part : part;
              if (idx < parts.length - 1) this.expanded.add(cc.key + "|" + code);
            });
          });
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
      emp.costCenters.forEach((cc) => {
        next.add(cc.key);
        this.collectKeys(cc.tree, cc.key, next);
      });
    });
    this.expanded = next;
    this.paint();
  },

  collectKeys(node, ccKey, bag) {
    (node.children || new Map()).forEach((child) => {
      if (child.children && child.children.size) bag.add(ccKey + "|" + child.code);
      this.collectKeys(child, ccKey, bag);
    });
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
      e26.forEach((v, i) => { y26[i] += v; });
      e27.forEach((v, i) => { y27[i] += v; });
      rows.push(this.rowHtml({
        kind: "emp",
        key: emp.key,
        depth: 0,
        label: emp.e + " — " + (emp.en || ""),
        m26: e26,
        m27: e27,
        expandable: true
      }));
      if (!this.expanded.has(emp.key)) return;
      emp.costCenters.forEach((cc) => {
        rows.push(this.rowHtml({
          kind: "cc",
          key: cc.key,
          depth: 1,
          label: cc.cc + " — " + cc.cn,
          m26: this.sumNode(cc.tree, "m26"),
          m27: this.sumNode(cc.tree, "m27"),
          expandable: true
        }));
        if (this.expanded.has(cc.key)) this.walk(cc.tree, cc.key, 2, rows);
      });
    });
    body.innerHTML = rows.join("") || '<tr><td class="orc-empty" colspan="16">Nenhuma empresa com essas contas.</td></tr>';
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
        <div class="orc-kpi"><span>VARIAÇÃO 2027 − 2026</span><strong class="${delta < 0 ? "orc-neg" : ""}">${this.money(delta)}</strong></div>
      `;
    }
  },

  walk(node, ccKey, depth, rows) {
    const children = [...(node.children || new Map()).values()]
      .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
    children.forEach((child) => {
      const key = ccKey + "|" + child.code;
      const hasKids = child.children && child.children.size > 0 && !child.leaf;
      const name = this.accountName(child.code);
      rows.push(this.rowHtml({
        kind: child.leaf ? "leaf" : "node",
        key,
        depth,
        label: child.code + (name ? "  " + name : ""),
        m26: child.m26,
        m27: child.m27,
        expandable: !!(child.children && child.children.size) && !child.leaf
      }));
      if (hasKids && this.expanded.has(key)) this.walk(child, ccKey, depth + 1, rows);
    });
  },

  pair(v26, v27, forecast) {
    const c26 = (v26 < 0 ? "orc-neg " : "") + "orc-y26" + (forecast ? " orc-fc" : "");
    const c27 = (v27 < 0 ? "orc-neg " : "") + "orc-y27";
    return '<div class="orc-pair"><span class="' + c26 + '">' + this.money(v26) + '</span><span class="' + c27 + '">' + this.money(v27) + "</span></div>";
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
    const cls = row.kind === "emp" ? "orc-emp" : (row.kind === "cc" ? "orc-cc" : (row.kind === "leaf" ? "orc-leaf" : "orc-node"));
    const cells = row.m26.map((v, i) => "<td>" + this.pair(v, row.m27[i], i >= 9) + "</td>").join("");
    return '<tr class="' + cls + '"><td style="padding-left:' + pad + 'px;">' + chevron + "<span>" + this.esc(row.label) + "</span></td>"
      + cells
      + '<td class="' + (t26 < 0 ? "orc-neg" : "") + '">' + this.money(t26) + "</td>"
      + '<td class="' + (t27 < 0 ? "orc-neg" : "") + '">' + this.money(t27) + "</td>"
      + '<td class="' + (delta < 0 ? "orc-neg" : "") + '">' + this.money(delta) + "</td></tr>";
  }
};

window.OrcamentoApp = OrcamentoApp;
