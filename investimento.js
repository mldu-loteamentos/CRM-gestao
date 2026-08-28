// Investimento — saldos (accounts-balances) × movimento de caixa/banco das contas de aplicação

const InvestimentoApp = {
  startDate: "",
  endDate: "",
  selectedCompanyIds: [],
  onlyInvestment: true,
  loading: false,
  error: "",
  accounts: [],
  months: [],
  expanded: new Set(),
  companyQuery: "",
  kpis: { opening: 0, aportes: 0, resgates: 0, rendimento: 0, tarifas: 0, closing: 0 },

  init() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    if (!this.startDate) {
      this.startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
    }
    if (!this.endDate) {
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      this.endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    }
    const geridas = this.geridasCompanies();
    const allowed = new Set(geridas.map(c => c.id));
    this.selectedCompanyIds = this.selectedCompanyIds.filter(id => allowed.has(String(id)));
    if (!this.selectedCompanyIds.length) this.selectedCompanyIds = geridas.map(c => String(c.id));
    this.render();
  },

  empresasCustom() {
    try {
      if (typeof EmpresasState !== "undefined" && EmpresasState.customFields) return EmpresasState.customFields;
      return JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
    } catch (e) { return {}; }
  },

  geridasCompanies() {
    const all = (window.AppState && AppState.companies) || [];
    const custom = this.empresasCustom();
    return all.filter(c => {
      const cfg = custom[c.id] || custom[String(c.id)] || {};
      return Number(cfg.gerida_pelo_grupo) === 1;
    }).map(c => {
      const cfg = custom[c.id] || custom[String(c.id)] || {};
      return {
        id: String(c.id),
        name: cfg.nome_usual || c.name || `Empresa ${c.id}`
      };
    });
  },

  consolidacaoCompanies() {
    return this.geridasCompanies();
  },

  companyName(id) {
    const custom = this.empresasCustom();
    const cfg = custom[id] || custom[String(id)] || {};
    if (cfg.nome_usual) return cfg.nome_usual;
    const c = ((window.AppState && AppState.companies) || []).find(x => String(x.id) === String(id));
    return (c && c.name) || `Empresa ${id}`;
  },

  fmt(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  addDaysIso(iso, n) {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    d.setDate(d.getDate() + n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
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

  lastDayOfMonth(ym) {
    const [y, m] = String(ym).split("-").map(Number);
    const d = new Date(y, m, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  clampDate(iso, maxIso) {
    return iso > maxIso ? maxIso : iso;
  },

  monthLabel(key) {
    const [y, m] = String(key).split("-");
    const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${names[Number(m) - 1]}/${y}`;
  },

  normAcc(s) {
    return String(s || "").replace(/\D/g, "");
  },

  movAccount(mov) {
    return String(
      mov.accountNumber ||
      mov.bankAccountNumber ||
      mov.checkingAccountNumber ||
      mov.account ||
      ""
    ).trim();
  },

  isInvestmentAccount(acc) {
    const type = String(acc.accountType || acc.type || acc.accountKind || "").toUpperCase();
    const name = String(acc.accountName || acc.name || acc.description || "").toUpperCase();
    if (/APLIC|INVEST|SAVING|POUPAN|APPLICATION|FUNDO/.test(type)) return true;
    if (/APLIC|INVEST|CDB|FUNDO|POUPAN|TESOURO|LCI|LCA|RDB|COMPROMISSADA/.test(name)) return true;
    return false;
  },

  classifyMovement(mov) {
    const amount = Number(mov.bankMovementAmount) || 0;
    const blob = [
      mov.historic, mov.history, mov.origin, mov.originDescription,
      mov.documentType, mov.documentIdentification, mov.observations, mov.note,
      ...((mov.financialCategories || []).map(c => `${c.financialCategoryName || ""} ${c.financialCategoryId || ""}`))
    ].join(" ").toUpperCase();
    if (/TARIF|IOF|IRRF|DESPESA BANC|TAXA BANC/.test(blob)) return amount < 0 ? "tarifa" : "aporte";
    if (/RENDIM|RENDTO|JUROS|RECEITA FINANCEIRA|RENDIMENTOS/.test(blob) && amount > 0) return "rendimento";
    if (amount >= 0) return "aporte";
    return "resgate";
  },

  pickBalance(list, accountNumber, companyId) {
    const want = this.normAcc(accountNumber);
    const rows = (list || []).filter(b => {
      const num = this.normAcc(b.accountNumber || b.number);
      if (want && num && want !== num) return false;
      if (companyId && b.companyId != null && String(b.companyId) !== String(companyId)) return false;
      return true;
    });
    if (!rows.length) return 0;
    rows.sort((a, b) => String(b.balanceDate || "").localeCompare(String(a.balanceDate || "")));
    return Number(rows[0].amount != null ? rows[0].amount : rows[0].reconciledAmount) || 0;
  },

  emptyFlow() {
    return { aportes: 0, resgates: 0, rendimento: 0, tarifas: 0 };
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
    this.months = this.monthKeys(this.startDate, this.endDate);
    const openingDate = this.addDaysIso(this.startDate, -1);
    const monthEndDates = this.months.map(mk => this.clampDate(this.lastDayOfMonth(mk), this.endDate));
    try {
      const uniqueBalDates = [...new Set(monthEndDates)];
      const [balancesOpen, accountsChunks, movChunks, ...monthBalResults] = await Promise.all([
        SiengeApiService.getAccountBalances(openingDate, { showLast: true }),
        Promise.all(this.selectedCompanyIds.map(async id => {
          const res = await SiengeApiService.getCheckingAccounts(id);
          return ((res && res.results) || []).map(a => ({ ...a, companyId: a.companyId || id }));
        })),
        Promise.all(this.selectedCompanyIds.map(async id => {
          const data = await SiengeApiService.getBankMovements(this.startDate, this.endDate, {
            selectionType: "M",
            companyId: id
          });
          return (data || []).map(m => ({ ...m, companyId: m.companyId || id }));
        })),
        ...uniqueBalDates.map(d => SiengeApiService.getAccountBalances(d, { showLast: true }).then(b => [d, b]).catch(() => [d, []]))
      ]);
      const balancesByDate = {};
      monthBalResults.forEach(([d, b]) => { balancesByDate[d] = b; });
      const balancesClose = balancesByDate[this.endDate] || balancesByDate[monthEndDates[monthEndDates.length - 1]] || [];

      let catalog = accountsChunks.flat();
      if (this.onlyInvestment) catalog = catalog.filter(a => this.isInvestmentAccount(a));
      const seen = new Set();
      catalog = catalog.filter(a => {
        const key = `${a.companyId}|${this.normAcc(a.accountNumber) || a.checkingAccountId || a.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const investKeys = new Set(catalog.map(a => `${a.companyId}|${this.normAcc(a.accountNumber)}`));
      const movements = movChunks.flat().filter(m => {
        const num = this.normAcc(this.movAccount(m));
        if (!num) return false;
        if (!catalog.length) return false;
        if (!this.onlyInvestment) {
          return this.selectedCompanyIds.includes(String(m.companyId));
        }
        return investKeys.has(`${m.companyId}|${num}`) || [...investKeys].some(k => k.endsWith("|" + num));
      });

      if (!catalog.length && this.onlyInvestment) {
        this.accounts = [];
        this.kpis = { opening: 0, aportes: 0, resgates: 0, rendimento: 0, tarifas: 0, closing: 0 };
        this.error = "Nenhuma conta de investimento/aplicação identificada nas empresas selecionadas. Desmarque o filtro para ver todas as contas.";
        return;
      }

      const byAcc = new Map();
      const ensure = (acc) => {
        const num = String(acc.accountNumber || "").trim();
        const key = `${acc.companyId}|${this.normAcc(num)}`;
        if (!byAcc.has(key)) {
          const opening = this.pickBalance(balancesOpen, num, acc.companyId);
          const closingApi = this.pickBalance(balancesClose, num, acc.companyId);
          byAcc.set(key, {
            key,
            companyId: acc.companyId,
            companyName: this.companyName(acc.companyId),
            accountNumber: num,
            accountName: acc.accountName || acc.name || "Conta",
            accountType: acc.accountType || "",
            opening,
            closingApi,
            aportes: 0,
            resgates: 0,
            rendimento: 0,
            tarifas: 0,
            months: {},
            movements: []
          });
          this.months.forEach(mk => { byAcc.get(key).months[mk] = this.emptyFlow(); });
        }
        return byAcc.get(key);
      };
      catalog.forEach(a => ensure(a));

      movements.forEach(mov => {
        const num = this.movAccount(mov);
        const key = `${mov.companyId}|${this.normAcc(num)}`;
        let row = byAcc.get(key);
        if (!row) {
          row = ensure({ companyId: mov.companyId, accountNumber: num, accountName: mov.accountName || num });
        }
        const kind = this.classifyMovement(mov);
        const amount = Number(mov.bankMovementAmount) || 0;
        const mk = String(mov.bankMovementDate || "").slice(0, 7);
        if (!row.months[mk]) row.months[mk] = this.emptyFlow();
        if (kind === "aporte") { row.aportes += amount; row.months[mk].aportes += amount; }
        else if (kind === "resgate") { row.resgates += amount; row.months[mk].resgates += amount; }
        else if (kind === "rendimento") { row.rendimento += amount; row.months[mk].rendimento += amount; }
        else { row.tarifas += amount; row.months[mk].tarifas += amount; }
        row.movements.push(mov);
      });

      const accounts = [...byAcc.values()].map(row => {
        let run = row.opening;
        this.months.forEach((mk, i) => {
          const f = row.months[mk] || this.emptyFlow();
          row.months[mk] = f;
          const closeDate = monthEndDates[i];
          const closeApi = this.pickBalance(balancesByDate[closeDate] || [], row.accountNumber, row.companyId);
          if (Math.abs(f.rendimento) < 0.01 && closeApi) {
            const implied = closeApi - run - f.aportes - f.resgates - f.tarifas;
            if (Math.abs(implied) > 0.01) {
              f.rendimento = implied;
              row.rendimentoFromBalance = true;
            }
          }
          run = (closeApi || (run + f.aportes + f.resgates + f.tarifas + f.rendimento));
          f.closing = run;
        });
        row.aportes = this.months.reduce((s, mk) => s + ((row.months[mk] && row.months[mk].aportes) || 0), 0);
        row.resgates = this.months.reduce((s, mk) => s + ((row.months[mk] && row.months[mk].resgates) || 0), 0);
        row.rendimento = this.months.reduce((s, mk) => s + ((row.months[mk] && row.months[mk].rendimento) || 0), 0);
        row.tarifas = this.months.reduce((s, mk) => s + ((row.months[mk] && row.months[mk].tarifas) || 0), 0);
        const closingApi = this.pickBalance(balancesClose, row.accountNumber, row.companyId);
        row.closing = closingApi || run;
        row.variacao = row.closing - row.opening;
        return row;
      }).sort((a, b) => b.closing - a.closing);

      this.accounts = accounts;
      this.kpis = accounts.reduce((acc, r) => {
        acc.opening += r.opening;
        acc.aportes += r.aportes;
        acc.resgates += r.resgates;
        acc.rendimento += r.rendimento;
        acc.tarifas += r.tarifas;
        acc.closing += r.closing;
        return acc;
      }, { opening: 0, aportes: 0, resgates: 0, rendimento: 0, tarifas: 0, closing: 0 });
      if (!accounts.length) this.error = "Nenhum movimento ou saldo de investimento no período.";
    } catch (err) {
      console.error("[Investimento]", err);
      this.error = err && err.message ? err.message : "Falha ao consultar saldos e movimentos de caixa/banco.";
      this.accounts = [];
    } finally {
      this.loading = false;
      this.render();
    }
  },

  toggle(key) {
    if (this.expanded.has(key)) this.expanded.delete(key);
    else this.expanded.add(key);
    this.render();
  },

  filterCompanyList(q) {
    this.companyQuery = q || "";
    const box = document.getElementById("inv-emp-list");
    if (!box) return;
    box.innerHTML = this.companyListHtml();
  },

  companyListHtml() {
    const companies = this.geridasCompanies();
    const q = (this.companyQuery || "").toLowerCase().trim();
    const filtered = companies.filter(c => {
      if (!q) return true;
      return String(c.name).toLowerCase().includes(q) || String(c.id).includes(q);
    });
    if (!filtered.length) return `<div style="padding:10px;color:#94a3b8;font-size:0.78rem;">Nenhuma empresa com esse nome.</div>`;
    return filtered.map(c => {
      const on = this.selectedCompanyIds.includes(c.id);
      return `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:0.8rem;background:${on ? "#ecfdf5" : "#fff"};">
        <input type="checkbox" ${on ? "checked" : ""} onchange="InvestimentoApp.toggleCompany('${c.id}', this.checked)">
        <span style="font-weight:${on ? 700 : 500};color:#334155;">${this.esc(c.name)}</span>
      </label>`;
    }).join("");
  },
    const sid = String(id);
    if (on) {
      if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid);
    } else {
      this.selectedCompanyIds = this.selectedCompanyIds.filter(x => x !== sid);
    }
    this.render();
  },

  selectAllGeridas() {
    this.selectedCompanyIds = this.geridasCompanies().map(c => c.id);
    this.render();
  },

  clearGeridas() {
    this.selectedCompanyIds = [];
    this.render();
  },

  cell(n, bold) {
    const color = n < 0 ? "#b91c1c" : (n > 0 ? "#105436" : "#94a3b8");
    return `text-align:right;font-variant-numeric:tabular-nums;color:${color};font-weight:${bold ? 800 : 600};white-space:nowrap;`;
  },

  kpiCard(label, value, color) {
    return `<div style="flex:1;min-width:140px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;">
      <div style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;">${label}</div>
      <div style="margin-top:4px;font-size:1.15rem;font-weight:800;color:${color};">${this.fmt(value)}</div>
    </div>`;
  },

  monthFlowOf(row) {
    const keys = this.months.length ? this.months : Object.keys(row.months || {}).sort();
    let running = row.opening;
    return keys.map(mk => {
      const f = (row.months && row.months[mk]) || this.emptyFlow();
      const opening = running;
      const net = (f.aportes || 0) + (f.resgates || 0) + (f.rendimento || 0) + (f.tarifas || 0);
      running = f.closing != null ? f.closing : (opening + net);
      return { month: mk, opening, ...f, closing: running };
    });
  },

  consolidatedFlow() {
    const keys = this.months;
    let running = this.kpis.opening;
    return keys.map(mk => {
      const f = this.accounts.reduce((acc, r) => {
        const m = (r.months && r.months[mk]) || this.emptyFlow();
        acc.aportes += m.aportes || 0;
        acc.resgates += m.resgates || 0;
        acc.rendimento += m.rendimento || 0;
        acc.tarifas += m.tarifas || 0;
        return acc;
      }, this.emptyFlow());
      const opening = running;
      const net = f.aportes + f.resgates + f.rendimento + f.tarifas;
      running = opening + net;
      return { month: mk, opening, ...f, closing: running };
    });
  },

  render() {
    const root = document.getElementById("investimento-root");
    if (!root) return;
    const companies = this.geridasCompanies();
    const k = this.kpis;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 85px);font-family:inherit;">
        <div style="background:#105436;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-radius:12px 12px 0 0;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="trending-up" style="width:18px;height:18px;color:#fff;"></i>
            </div>
            <div>
              <h2 style="margin:0;color:#fff;font-size:1.15rem;font-weight:600;">Investimento</h2>
              <p style="margin:2px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Aplicações das empresas geridas pelo grupo · fluxo mês a mês</p>
            </div>
          </div>
        </div>
        <div style="flex:1;min-height:0;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;display:flex;flex-direction:column;">
          <div style="padding:14px 16px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Início
              <input type="date" value="${this.startDate}" onchange="InvestimentoApp.startDate=this.value"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Fim
              <input type="date" value="${this.endDate}" onchange="InvestimentoApp.endDate=this.value"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;display:flex;align-items:center;gap:6px;height:34px;">
              <input type="checkbox" ${this.onlyInvestment ? "checked" : ""} onchange="InvestimentoApp.onlyInvestment=this.checked">
              Somente aplicação / investimento
            </label>
            <button class="btn btn-primary" onclick="InvestimentoApp.load()" style="height:34px;">
              ${this.loading ? "Consultando..." : "Consultar"}
            </button>
            <div style="flex:1;min-width:280px;max-width:360px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                <span style="display:inline-flex;align-items:center;gap:6px;background:#e8f5ee;color:#105436;border:1px solid #86efac;border-radius:99px;padding:3px 10px;font-size:0.7rem;font-weight:800;letter-spacing:0.2px;">
                  Gerida pelo grupo
                </span>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span id="inv-emp-count" style="font-size:0.72rem;color:#64748b;font-weight:700;">${this.selectedCompanyIds.length}/${companies.length}</span>
                  <button type="button" onclick="InvestimentoApp.selectAllGeridas()" style="border:none;background:none;color:#105436;font-size:0.72rem;font-weight:700;cursor:pointer;">Todas</button>
                  <button type="button" onclick="InvestimentoApp.clearGeridas()" style="border:none;background:none;color:#64748b;font-size:0.72rem;font-weight:700;cursor:pointer;">Limpar</button>
                </div>
              </div>
              ${companies.length ? `
                <input id="inv-emp-search" placeholder="Buscar empresa..." value="${this.esc(this.companyQuery)}"
                  oninput="InvestimentoApp.filterCompanyList(this.value)"
                  style="width:100%;height:32px;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;padding:0 10px;box-sizing:border-box;font-size:0.8rem;">
                <div id="inv-emp-list" style="max-height:168px;overflow:auto;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;background:#fff;">
                  ${this.companyListHtml()}
                </div>
              ` : `<div style="padding:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;font-size:0.8rem;">Nenhuma empresa com a flag <strong>Gerida pelo grupo</strong> no cadastro de empresas.</div>`}
            </div>
          </div>
          ${this.error ? `<div style="margin:12px 16px 0;padding:10px 12px;background:#fef2f2;color:#b91c1c;border-radius:8px;font-size:0.82rem;">${this.esc(this.error)}</div>` : ""}
          <div style="padding:12px 16px 0;display:flex;gap:10px;flex-wrap:wrap;">
            ${this.kpiCard("Saldo inicial", k.opening, "#0f172a")}
            ${this.kpiCard("Entradas", k.aportes, "#105436")}
            ${this.kpiCard("Saídas", k.resgates, "#b91c1c")}
            ${this.kpiCard("Rendimento", k.rendimento, "#0369a1")}
            ${this.kpiCard("Saldo acumulado", k.closing, "#0f172a")}
          </div>
          <div style="flex:1;overflow:auto;padding:12px 16px;">
            ${this.loading ? `<div style="text-align:center;padding:40px;color:#64748b;">Carregando saldos e movimentos das contas de investimento...</div>` : this.tableHtml()}
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  tableHtml() {
    if (!this.accounts.length) {
      return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:28px;text-align:center;color:#94a3b8;">Informe o período e clique em Consultar.</div>`;
    }
    const months = this.months;
    const th = (label, extra) => `<th style="padding:8px 8px;text-align:right;border-bottom:2px solid #d1fae5;background:#105436;color:#fff;font-size:0.72rem;font-weight:700;white-space:nowrap;${extra || ""}">${label}</th>`;
    const money = (n, bold) => `<td style="padding:6px 8px;${this.cell(n, bold)}">${this.fmt(n)}</td>`;
    const empty = `<td style="padding:6px 8px;text-align:right;color:#cbd5e1;">—</td>`;

    const groupRows = (label, sub, opening, monthFlow, isTotal) => {
      const bgHead = isTotal ? "#ecfdf5" : "#f8fafc";
      const entradas = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).aportes || 0);
      const saidas = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).resgates || 0);
      const rends = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).rendimento || 0);
      const saldos = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).closing || 0);
      const rowspan = 4;
      const sticky = "position:sticky;left:0;z-index:1;";
      return `
        <tr style="background:${bgHead};border-top:2px solid #e2e8f0;">
          <td rowspan="${rowspan}" style="padding:8px 10px;vertical-align:top;min-width:180px;max-width:240px;${sticky}background:${bgHead};border-right:1px solid #e2e8f0;">
            <div style="font-weight:800;color:#0f172a;font-size:0.82rem;">${this.esc(label)}</div>
            ${sub ? `<div style="font-size:0.7rem;color:#64748b;margin-top:2px;">${this.esc(sub)}</div>` : ""}
          </td>
          <td style="padding:6px 10px;font-weight:700;color:#105436;white-space:nowrap;">Entrada</td>
          ${empty}
          ${entradas.map(n => money(n)).join("")}
        </tr>
        <tr style="background:#fff;">
          <td style="padding:6px 10px;font-weight:700;color:#b91c1c;white-space:nowrap;">Saída</td>
          ${empty}
          ${saidas.map(n => money(n)).join("")}
        </tr>
        <tr style="background:#fff;">
          <td style="padding:6px 10px;font-weight:700;color:#0369a1;white-space:nowrap;">Rendimento</td>
          ${empty}
          ${rends.map(n => money(n)).join("")}
        </tr>
        <tr style="background:${isTotal ? "#d1fae5" : "#f1f5f9"};">
          <td style="padding:6px 10px;font-weight:800;color:#0f172a;white-space:nowrap;">Saldo</td>
          ${money(opening, true)}
          ${saldos.map(n => money(n, true)).join("")}
        </tr>`;
    };

    const consolidado = groupRows("Consolidado", "Empresas selecionadas", this.kpis.opening, this.consolidatedFlow(), true);
    const contas = this.accounts.map(r =>
      groupRows(r.accountNumber || r.accountName, `${r.accountName} · ${r.companyName}`, r.opening, this.monthFlowOf(r), false)
    ).join("");

    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:auto;">
        <div style="padding:10px 12px;font-size:0.82rem;font-weight:800;color:#0f172a;border-bottom:1px solid #e2e8f0;">
          Kardex — conta × movimento · saldo inicial e meses
        </div>
        <table class="custom-table" style="width:max-content;min-width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead>
            <tr>
              <th style="padding:8px 10px;text-align:left;background:#105436;color:#fff;font-size:0.72rem;position:sticky;left:0;z-index:2;">Conta</th>
              <th style="padding:8px 10px;text-align:left;background:#105436;color:#fff;font-size:0.72rem;">Movimento</th>
              ${th("Saldo inicial")}
              ${months.map(mk => th(this.monthLabel(mk))).join("")}
            </tr>
          </thead>
          <tbody>
            ${consolidado}
            ${contas}
          </tbody>
        </table>
      </div>`;
  }
};

window.InvestimentoApp = InvestimentoApp;
