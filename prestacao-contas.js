// Prestação de Contas — DFC a partir do caixa/banco Sienge (bulk-data bank-movement)

const PrestacaoContasApp = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() === 0 ? 12 : new Date().getMonth(),
  companyId: "1",
  costCenterIds: ["13600", "13601"],
  selectionType: "M",
  ccSearch: "",
  loading: false,
  error: "",
  movements: [],
  lines: [],
  totals: { receitas: 0, custos: 0, despesas: 0, gco: 0 },
  expanded: new Set(["01", "01.01", "04", "04.01", "05", "05.03", "outros"]),
  selectedAccount: null,
  accountMovements: [],

  DEFAULT_DFC: [
    { id: "01", code: "01", name: "RECEITAS", kind: "total", parentId: null },
    { id: "01.01", code: "01.01", name: "VENDA DE IMOVEIS", kind: "group", parentId: "01" },
    { id: "04", code: "04", name: "CUSTOS", kind: "total", parentId: null },
    { id: "04.01", code: "04.01", name: "REPASSES TERRENISTAS", kind: "group", parentId: "04" },
    { id: "05", code: "05", name: "DESPESAS", kind: "total", parentId: null },
    { id: "05.03", code: "05.03", name: "ADMINISTRATIVAS", kind: "group", parentId: "05" }
  ],

  ACCOUNT_MAP: {
    "1.01.01.01": "01.01",
    "1.03.01.02": "01.01",
    "2.05.01.03": "01.01",
    "2.02.04.01": "04.01",
    "2.05.01.05": "05.03"
  },

  NAME_MAP: [
    { test: /venda de lote/i, group: "01.01" },
    { test: /juros ativos/i, group: "01.01" },
    { test: /desconto de juros/i, group: "01.01" },
    { test: /repasse/i, group: "04.01" },
    { test: /despesas banc/i, group: "05.03" }
  ],

  init() {
    if (this.month === 12 && new Date().getMonth() === 0) this.year = new Date().getFullYear() - 1;
    const companies = (window.AppState && AppState.companies) || [];
    if (companies.length && !companies.some(c => String(c.id) === String(this.companyId))) {
      this.companyId = String(companies[0].id);
    }
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

  allocate(mov) {
    const amount = Number(mov.bankMovementAmount) || 0;
    const wanted = this.costCenterIds.map(String);
    let cats = Array.isArray(mov.financialCategories) ? mov.financialCategories : [];
    if (wanted.length) {
      cats = cats.filter(fc => wanted.includes(String(fc.costCenterId)));
    }
    if (!cats.length) {
      if (wanted.length) return [];
      return [{
        amount,
        categoryId: "SEM_CONTA",
        categoryName: "Sem plano financeiro",
        costCenterId: mov.costCenterId || "",
        mov
      }];
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
        categoryName: fc.financialCategoryName || "Sem nome",
        costCenterId: fc.costCenterId,
        costCenterName: fc.costCenterName,
        mov
      };
    });
  },

  resolveGroup(categoryId, categoryName) {
    if (this.ACCOUNT_MAP[categoryId]) return this.ACCOUNT_MAP[categoryId];
    for (const rule of this.NAME_MAP) {
      if (rule.test.test(categoryName || "") || rule.test.test(categoryId || "")) return rule.group;
    }
    const visaoGroup = this.groupFromVisao(categoryId);
    if (visaoGroup) return visaoGroup;
    return "outros";
  },

  groupFromVisao(categoryId) {
    try {
      const visoes = JSON.parse(localStorage.getItem("crm_plano_visoes_v2") || "[]");
      const visao = visoes.find(v => v.type === "custom" && Array.isArray(v.groups)) || visoes[0];
      if (!visao || !visao.groups) return null;
      const hit = visao.groups.find(g => Array.isArray(g.accounts) && g.accounts.some(a => String(a) === String(categoryId)));
      return hit ? hit.id : null;
    } catch (e) {
      return null;
    }
  },

  buildTree(allocs) {
    const byAccount = {};
    allocs.forEach(a => {
      const key = a.categoryId;
      if (!byAccount[key]) byAccount[key] = { id: key, name: a.categoryName, amount: 0, items: [] };
      byAccount[key].amount += a.amount;
      byAccount[key].name = a.categoryName || byAccount[key].name;
      byAccount[key].items.push(a);
    });

    const nodes = this.DEFAULT_DFC.map(n => ({ ...n, amount: 0, accounts: [] }));
    nodes.push({ id: "outros", code: "", name: "CONTAS NÃO CLASSIFICADAS", kind: "group", parentId: null, amount: 0, accounts: [] });

    Object.values(byAccount).forEach(acc => {
      const gid = this.resolveGroup(acc.id, acc.name);
      let node = nodes.find(n => n.id === gid);
      if (!node) node = nodes.find(n => n.id === "outros");
      node.accounts.push(acc);
      node.amount += acc.amount;
    });

    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    nodes.forEach(n => {
      if (n.parentId && byId[n.parentId]) byId[n.parentId].amount += n.amount;
    });

    const receitas = (byId["01"] && byId["01"].amount) || 0;
    const custos = (byId["04"] && byId["04"].amount) || 0;
    const despesas = (byId["05"] && byId["05"].amount) || 0;
    const outros = (byId["outros"] && byId["outros"].amount) || 0;
    const custosDespesas = custos + despesas;
    const gco = receitas + custosDespesas + outros;

    this.totals = { receitas, custos, despesas, custosDespesas, outros, gco };
    this.accountIndex = byAccount;

    const rows = [];
    const pushNode = (node, level) => {
      const children = nodes.filter(n => n.parentId === node.id);
      const hasKids = children.length > 0 || (node.accounts && node.accounts.length > 0);
      rows.push({ ...node, level, hasKids, isAccount: false });
      if (!this.expanded.has(node.id)) return;
      children.forEach(ch => pushNode(ch, level + 1));
      (node.accounts || []).sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach(acc => {
        rows.push({
          id: acc.id,
          code: acc.id,
          name: acc.name,
          amount: acc.amount,
          level: level + 1,
          isAccount: true,
          hasKids: false,
          parentId: node.id
        });
      });
    };
    nodes.filter(n => !n.parentId && (n.amount !== 0 || n.id !== "outros")).forEach(n => pushNode(n, 0));

    rows.push({ id: "t_cd", code: "", name: "CUSTOS E DESPESAS", amount: custosDespesas, level: 0, isFormula: true });
    rows.push({ id: "06", code: "06", name: "GCO - GERAÇÃO DE CAIXA OPERACIONAL", amount: gco, level: 0, isFormula: true });
    rows.push({ id: "08", code: "08", name: "FCF - FLUXO DE CAIXA LIVRE", amount: gco, level: 0, isFormula: true });
    rows.push({ id: "10", code: "10", name: "GCO - LÍQUIDO DO RESULTADO", amount: gco, level: 0, isFormula: true });
    rows.push({ id: "12", code: "12", name: "VARIAÇÃO DE CAIXA", amount: gco, level: 0, isFormula: true });

    this.lines = rows;
  },

  async load() {
    if (!this.costCenterIds.length) {
      this.error = "Selecione ao menos um centro de custo / obra (ex.: 13600 e 13601).";
      this.render();
      return;
    }
    this.loading = true;
    this.error = "";
    this.selectedAccount = null;
    this.render();
    const { start, end } = this.periodBounds();
    try {
      if (!window.SiengeApiService || typeof SiengeApiService.getBankMovements !== "function") {
        throw new Error("API de caixa e banco indisponível.");
      }
      this.movements = await SiengeApiService.getBankMovements(start, end, {
        selectionType: this.selectionType || "M",
        companyId: this.companyId,
        costCentersId: this.costCenterIds
      });
      const allocs = [];
      (this.movements || []).forEach(mov => this.allocate(mov).forEach(a => allocs.push(a)));
      this.buildTree(allocs);
      if (!this.movements.length) {
        this.error = "Nenhum movimento de caixa/banco no período para os filtros selecionados.";
      }
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
    const allocs = [];
    (this.movements || []).forEach(mov => this.allocate(mov).forEach(a => allocs.push(a)));
    this.buildTree(allocs);
    this.render();
  },

  openAccount(id) {
    this.selectedAccount = id;
    const acc = this.accountIndex && this.accountIndex[id];
    this.accountMovements = acc ? acc.items : [];
    this.render();
  },

  render() {
    const root = document.getElementById("prestacao-contas-root");
    if (!root) return;
    const { start, end, label } = this.periodBounds();
    const companies = (window.AppState && AppState.companies) || [];
    const ccs = this.costCenters();
    const q = (this.ccSearch || "").toLowerCase().trim();
    const suggestions = [];
    const monthLabel = label.charAt(0).toUpperCase() + label.slice(1);
    const ccNames = this.costCenterIds.map(id => {
      const cc = ccs.find(c => String(c.id) === String(id));
      return cc ? `${id} - ${cc.name}` : id;
    });

    root.innerHTML = `
      <div class="crm-card" style="padding: 1.2rem 1.4rem;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div>
            <h2 style="margin:0;color:var(--color-primary);font-size:1.15rem;display:flex;align-items:center;gap:8px;">
              <i data-lucide="receipt" style="width:20px;"></i> Prestação de Contas
            </h2>
            <p style="margin:6px 0 0;color:#64748b;font-size:0.82rem;">
              Visão DFC · Realizado · valores em REAL · seleção pela data de movimento (caixa/banco Sienge)
            </p>
          </div>
          <button class="btn btn-primary" onclick="PrestacaoContasApp.load()" ${this.loading ? "disabled" : ""}
            style="display:inline-flex;align-items:center;gap:8px;height:38px;">
            ${this.loading
              ? '<span style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span> Consultando Sienge...'
              : '<i data-lucide="refresh-cw" style="width:14px;"></i> Carregar DFC'}
          </button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#475569;">
            Mês
            <select id="pc-month" onchange="PrestacaoContasApp.month=Number(this.value)"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
              ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${this.month === i + 1 ? "selected" : ""}>${String(i + 1).padStart(2, "0")}</option>`).join("")}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#475569;">
            Ano
            <input type="number" value="${this.year}" onchange="PrestacaoContasApp.year=Number(this.value)"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#475569;grid-column:span 2;">
            Empresa
            <select onchange="PrestacaoContasApp.companyId=this.value;PrestacaoContasApp.render()"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
              ${companies.map(c => `<option value="${c.id}" ${String(c.id) === String(this.companyId) ? "selected" : ""}>${c.id} — ${c.name}</option>`).join("") || '<option value="1">1</option>'}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:0.75rem;font-weight:700;color:#475569;grid-column:span 2;">
            Seleção por data
            <select onchange="PrestacaoContasApp.selectionType=this.value"
              style="height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;">
              <option value="M" ${this.selectionType === "M" ? "selected" : ""}>Movimento (caixa/banco)</option>
              <option value="P" ${this.selectionType === "P" ? "selected" : ""}>Pagamento / vencimento</option>
            </select>
          </label>
        </div>

        <div style="margin-top:12px;">
          <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:6px;">Obra / centros de custo</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
            ${this.costCenterIds.map(id => `
              <span style="display:inline-flex;align-items:center;gap:6px;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:4px 8px;border-radius:999px;font-size:0.78rem;font-weight:700;">
                ${id}
                <button onclick="PrestacaoContasApp.removeCostCenter('${id}')" style="border:none;background:transparent;cursor:pointer;color:#065f46;font-size:1rem;line-height:1;">×</button>
              </span>`).join("") || '<span style="color:#94a3b8;font-size:0.8rem;">Nenhum centro selecionado</span>'}
          </div>
          <input type="text" id="pc-cc-search" value="${this.ccSearch || ""}" placeholder="Buscar e adicionar centro (ex. 13600)..."
            oninput="PrestacaoContasApp.onCcSearch(this.value)"
            style="width:100%;max-width:480px;height:36px;border:1px solid #e2e8f0;border-radius:6px;padding:0 10px;">
          <div id="pc-cc-sugg">${this.ccSuggestionsHtml()}</div>
        </div>
      </div>

      ${this.error ? `<div class="crm-card" style="margin-top:12px;padding:12px 16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;">${this.error}</div>` : ""}

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px;">
        ${this.kpi("Receitas", this.totals.receitas, "#16a34a")}
        ${this.kpi("Custos e despesas", this.totals.custosDespesas, "#dc2626")}
        ${this.kpi("GCO / Variação de caixa", this.totals.gco, "#0f172a")}
        ${this.kpi("Movimentos", this.movements.length, "#0369a1", true)}
      </div>

      <div class="crm-card" style="margin-top:12px;padding:0;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:800;color:#0f172a;">Demonstrativo de Resultado</div>
            <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">
              Agrupado por obra · ${ccNames.join(" | ") || "—"} · ${start.split("-").reverse().join("/")} a ${end.split("-").reverse().join("/")}
            </div>
          </div>
          <div style="font-size:0.75rem;color:#64748b;text-transform:capitalize;">${monthLabel}</div>
        </div>
        <div class="table-container" style="max-height:calc(100vh - 280px);overflow:auto;box-shadow:none;">
          <table class="custom-table" style="font-size:0.82rem;">
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
                <tr><td colspan="4" style="text-align:center;padding:28px;color:#94a3b8;">
                  ${this.loading ? "Carregando movimentos de caixa..." : "Clique em Carregar DFC para consultar o Sienge."}
                </td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      ${this.selectedAccount ? this.renderAccountDetail() : ""}
    `;
    if (window.lucide) lucide.createIcons();
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
    const click = row.isAccount ? `onclick="PrestacaoContasApp.openAccount('${row.id}')" style="cursor:pointer;"` : "";
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
    const acc = this.accountIndex && this.accountIndex[this.selectedAccount];
    if (!acc) return "";
    return `
      <div class="crm-card" style="margin-top:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;font-size:0.95rem;color:var(--color-primary);">${acc.id} — ${acc.name}</h3>
          <button class="btn btn-secondary" onclick="PrestacaoContasApp.selectedAccount=null;PrestacaoContasApp.render()">Fechar</button>
        </div>
        <div class="table-container" style="box-shadow:none;max-height:280px;overflow:auto;">
          <table class="custom-table" style="font-size:0.8rem;">
            <thead><tr><th>Data</th><th>Histórico</th><th>Cliente / Credor</th><th>C.C.</th><th style="text-align:right;">Valor</th></tr></thead>
            <tbody>
              ${acc.items.map(it => {
                const d = String(it.mov.bankMovementDate || "").slice(0, 10).split("-").reverse().join("/");
                return `<tr>
                  <td>${d || "—"}</td>
                  <td>${it.mov.bankMovementHistoricName || it.mov.documentIdentificationName || "—"}</td>
                  <td>${it.mov.clientName || it.mov.creditorName || "—"}</td>
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
