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
        .orc-cc td { background: #e8f5ee; font-weight: 700; color: #105436; }
        .orc-node td { background: #f8fafc; font-weight: 650; }
        .orc-leaf td { background: #fff; font-weight: 500; color: #1e293b; }
        .orc-neg { color: #b91c1c; }
        .orc-exp { border: 0; background: transparent; cursor: pointer; width: 22px; color: inherit; font-size: 0.85rem; }
        .orc-code { font-family: ui-monospace, Consolas, monospace; margin-right: 8px; }
        .orc-sub { display: block; margin-left: 22px; font-weight: 500; color: #64748b; font-size: 0.72rem; }
        .orc-empty { padding: 28px; text-align: center; color: #64748b; }
      </style>
      <div class="orc-head">
        <div>
          <h2>Orçamento ${this.year}</h2>
          <p>Receitas da compilação 2027. Cada centro de custo abre o plano financeiro, só com as contas que têm orçamento.</p>
        </div>
      </div>
      <div class="orc-tools">
        <div id="orc-emp-box"></div>
        <input id="orc-search" class="orc-search" type="search" placeholder="Buscar centro de custo ou conta" value="${this.esc(this.query)}">
        <button type="button" class="orc-btn" id="orc-expand">Expandir todos</button>
        <button type="button" class="orc-btn" id="orc-collapse">Recolher todos</button>
      </div>
      <div class="orc-kpis" id="orc-kpis"></div>
      <div class="orc-scroll">
        <table class="orc-table">
          <thead>
            <tr>
              <th>Centro de custo / Plano</th>
              ${months.map((m) => `<th>${m}</th>`).join("")}
              <th>Total</th>
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

  filteredLines() {
    return (this.data().lines || []).filter((line) => this.companyOn(line.e));
  },

  groups() {
    const q = this.query.trim().toLowerCase();
    const byCc = new Map();
    this.filteredLines().forEach((line) => {
      const key = `${line.e}|${line.cc}`;
      if (!byCc.has(key)) {
        byCc.set(key, {
          key,
          e: line.e,
          en: line.en,
          cc: line.cc,
          cn: String(line.cn || "").replace(/\s+/g, " ").trim(),
          accounts: new Map()
        });
      }
      const group = byCc.get(key);
      const prev = group.accounts.get(line.conta) || { conta: line.conta, m: Array(12).fill(0) };
      (line.m || []).forEach((v, i) => {
        prev.m[i] += this.signed(line.conta, v);
      });
      group.accounts.set(line.conta, prev);
    });

    const groups = [...byCc.values()].filter((group) => {
      if (!q) return true;
      const ccBlob = `${group.cc} ${group.cn} ${group.en}`.toLowerCase();
      if (ccBlob.includes(q)) return true;
      return [...group.accounts.keys()].some((conta) => this.accountBlob(conta).includes(q));
    }).sort((a, b) => String(a.cc).localeCompare(String(b.cc), "pt-BR", { numeric: true }));

    groups.forEach((group) => {
      const ccBlob = `${group.cc} ${group.cn} ${group.en}`.toLowerCase();
      const ccHit = !q || ccBlob.includes(q);
      group.tree = this.buildTree(group.accounts, q, ccHit);
      if (q && q !== this._openedFor) {
        this.expanded.add(group.key);
        group.accounts.forEach((acc) => {
          if (!ccHit && !this.accountBlob(acc.conta).includes(q)) return;
          const parts = String(acc.conta).split(".");
          let code = "";
          parts.forEach((part, idx) => {
            code = code ? `${code}.${part}` : part;
            if (idx < parts.length - 1) this.expanded.add(`${group.key}|${code}`);
          });
        });
      }
    });
    this._openedFor = q;
    return groups;
  },

  accountBlob(conta) {
    return `${conta} ${this.accountName(conta)}`.toLowerCase();
  },

  buildTree(accounts, q, ccHit) {
    const root = { children: new Map() };
    accounts.forEach((acc) => {
      if (!ccHit && q && !this.accountBlob(acc.conta).includes(q)) return;
      const parts = String(acc.conta).split(".");
      let node = root;
      let code = "";
      parts.forEach((part, idx) => {
        code = code ? `${code}.${part}` : part;
        if (!node.children.has(code)) {
          node.children.set(code, { code, m: Array(12).fill(0), leaf: false, children: new Map() });
        }
        const child = node.children.get(code);
        acc.m.forEach((v, i) => { child.m[i] += v; });
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
    this.groups().forEach((group) => {
      next.add(group.key);
      this.collectKeys(group.tree, group.key, next);
    });
    this.expanded = next;
    this.paint();
  },

  collectKeys(node, ccKey, bag) {
    (node.children || new Map()).forEach((child) => {
      if (child.children && child.children.size) bag.add(`${ccKey}|${child.code}`);
      this.collectKeys(child, ccKey, bag);
    });
  },

  paint() {
    const body = document.getElementById("orc-body");
    const kpis = document.getElementById("orc-kpis");
    if (!body) return;
    const groups = this.groups();
    const totals = Array(12).fill(0);
    const rows = [];
    groups.forEach((group) => {
      const ccMonths = Array(12).fill(0);
      (group.tree.children || new Map()).forEach((child) => {
        child.m.forEach((v, i) => { ccMonths[i] += v; });
      });
      ccMonths.forEach((v, i) => { totals[i] += v; });
      rows.push(this.rowHtml({
        kind: "cc",
        key: group.key,
        depth: 0,
        label: `${group.cc} — ${group.cn}`,
        sub: `${group.e} - ${group.en}`,
        months: ccMonths,
        expandable: true
      }));
      if (this.expanded.has(group.key)) {
        this.walk(group.tree, group.key, 1, rows);
      }
    });
    body.innerHTML = rows.join("") || `<tr><td class="orc-empty" colspan="14">Nenhum centro de custo com essas contas.</td></tr>`;
    if (kpis) {
      const year = this.sum(totals);
      const contas = new Set();
      groups.forEach((group) => group.accounts.forEach((_, conta) => contas.add(conta)));
      kpis.innerHTML = `
        <div class="orc-kpi"><span>CENTROS DE CUSTO</span><strong>${groups.length}</strong></div>
        <div class="orc-kpi"><span>ORÇADO ${this.year}</span><strong class="${year < 0 ? "orc-neg" : ""}">${this.money(year)}</strong></div>
        <div class="orc-kpi"><span>CONTAS DO PLANO</span><strong>${contas.size}</strong></div>
      `;
    }
  },

  walk(node, ccKey, depth, rows) {
    const children = [...(node.children || new Map()).values()]
      .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
    children.forEach((child) => {
      const key = `${ccKey}|${child.code}`;
      const hasKids = child.children && child.children.size > 0 && !child.leaf;
      const name = this.accountName(child.code);
      rows.push(this.rowHtml({
        kind: child.leaf ? "leaf" : "node",
        key,
        depth,
        label: `${child.code}${name ? "  " + name : ""}`,
        months: child.m,
        expandable: !!(child.children && child.children.size) && !child.leaf
      }));
      if (hasKids && this.expanded.has(key)) this.walk(child, ccKey, depth + 1, rows);
    });
  },

  rowHtml(row) {
    const open = this.expanded.has(row.key);
    const chevron = row.expandable
      ? `<button type="button" class="orc-exp" data-orc-key="${this.esc(row.key)}">${open ? "▾" : "▸"}</button>`
      : `<span class="orc-exp"></span>`;
    const pad = 8 + row.depth * 18;
    const total = this.sum(row.months);
    const cls = row.kind === "cc" ? "orc-cc" : (row.kind === "leaf" ? "orc-leaf" : "orc-node");
    const cells = row.months.map((v) => `<td class="${v < 0 ? "orc-neg" : ""}">${this.money(v)}</td>`).join("");
    const sub = row.sub ? `<span class="orc-sub">${this.esc(row.sub)}</span>` : "";
    return `<tr class="${cls}">
      <td style="padding-left:${pad}px;">${chevron}<span class="${row.kind === "leaf" ? "orc-code" : ""}">${this.esc(row.label)}</span>${sub}</td>
      ${cells}
      <td class="${total < 0 ? "orc-neg" : ""}">${this.money(total)}</td>
    </tr>`;
  }
};

window.OrcamentoApp = OrcamentoApp;
