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
  kpis: { opening: 0, aportes: 0, resgates: 0, rendimento: 0, tarifas: 0, closing: 0 },

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
    const marked = all.filter(c => {
      const cfg = custom[c.id] || custom[String(c.id)] || {};
      return Number(cfg.consolidacao_padrao) === 1;
    });
    const source = marked.length ? marked : all;
    return source.map(c => {
      const cfg = custom[c.id] || custom[String(c.id)] || {};
      return {
        id: String(c.id),
        name: cfg.nome_usual || c.name || `Empresa ${c.id}`,
        pct: Number(cfg.percentual_mldu) || 0
      };
    });
  },

  companyName(id) {
    const c = this.consolidacaoCompanies().find(x => String(x.id) === String(id));
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
    try {
      const [balancesOpen, balancesClose, accountsChunks, movChunks] = await Promise.all([
        SiengeApiService.getAccountBalances(openingDate, { showLast: true }),
        SiengeApiService.getAccountBalances(this.endDate, { showLast: true }),
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
        }))
      ]);

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
        const net = row.aportes + row.resgates + row.rendimento + row.tarifas;
        const closingCalc = row.opening + net;
        const closing = row.closingApi || closingCalc;
        const implied = closing - row.opening - row.aportes - row.resgates - row.tarifas;
        if (Math.abs(row.rendimento) < 0.01 && Math.abs(implied) > 0.01) {
          row.rendimento = implied;
          row.rendimentoFromBalance = true;
        }
        row.closing = closing;
        row.variacao = closing - row.opening;
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

  toggleCompany(id, on) {
    const sid = String(id);
    if (on) {
      if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid);
    } else {
      this.selectedCompanyIds = this.selectedCompanyIds.filter(x => x !== sid);
    }
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
      running = opening + net;
      return { month: mk, opening, ...f, closing: running };
    });
  },

  render() {
    const root = document.getElementById("investimento-root");
    if (!root) return;
    const companies = this.consolidacaoCompanies();
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
              <p style="margin:2px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Saldos Sienge · movimento de caixa e banco · contas de aplicação</p>
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
            <div style="flex:1;min-width:240px;">
              <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:4px;">Empresas</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${companies.map(c => `
                  <label style="font-size:0.75rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:99px;padding:4px 10px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" ${this.selectedCompanyIds.includes(c.id) ? "checked" : ""}
                      onchange="InvestimentoApp.toggleCompany('${c.id}', this.checked)">
                    ${this.esc(c.name)}
                  </label>`).join("") || `<span style="color:#94a3b8;font-size:0.8rem;">Nenhuma empresa carregada.</span>`}
              </div>
            </div>
          </div>
          ${this.error ? `<div style="margin:12px 16px 0;padding:10px 12px;background:#fef2f2;color:#b91c1c;border-radius:8px;font-size:0.82rem;">${this.esc(this.error)}</div>` : ""}
          <div style="padding:12px 16px 0;display:flex;gap:10px;flex-wrap:wrap;">
            ${this.kpiCard("Saldo inicial", k.opening, "#0f172a")}
            ${this.kpiCard("Aportes", k.aportes, "#105436")}
            ${this.kpiCard("Resgates", k.resgates, "#b91c1c")}
            ${this.kpiCard("Rendimento da aplicação", k.rendimento, "#0369a1")}
            ${this.kpiCard("Saldo final", k.closing, "#0f172a")}
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
    const rows = this.accounts.map(r => {
      const open = this.expanded.has(r.key);
      const chevron = `<button type="button" onclick="InvestimentoApp.toggle('${this.esc(r.key)}')" style="border:none;background:none;cursor:pointer;padding:0 4px 0 0;color:#64748b;"><i data-lucide="${open ? "chevron-down" : "chevron-right"}" style="width:14px;height:14px;"></i></button>`;
      const flowRows = open ? this.monthFlowOf(r).map(f => `
        <tr style="background:#f8fafc;">
          <td style="padding:6px 12px 6px 42px;color:#64748b;font-size:0.78rem;">${this.monthLabel(f.month)}</td>
          <td style="padding:6px 10px;${this.cell(f.opening)}">${this.fmt(f.opening)}</td>
          <td style="padding:6px 10px;${this.cell(f.aportes)}">${this.fmt(f.aportes)}</td>
          <td style="padding:6px 10px;${this.cell(f.resgates)}">${this.fmt(f.resgates)}</td>
          <td style="padding:6px 10px;${this.cell(f.rendimento)}">${this.fmt(f.rendimento)}</td>
          <td style="padding:6px 10px;${this.cell(f.closing, true)}">${this.fmt(f.closing)}</td>
          <td></td>
        </tr>`).join("") : "";
      return `
        <tr style="background:#fff;border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 12px;">
            ${chevron}<span style="font-weight:700;color:#0f172a;">${this.esc(r.accountNumber)}</span>
            <div style="font-size:0.72rem;color:#64748b;padding-left:22px;">${this.esc(r.accountName)} · ${this.esc(r.companyName)}</div>
          </td>
          <td style="padding:8px 10px;${this.cell(r.opening)}">${this.fmt(r.opening)}</td>
          <td style="padding:8px 10px;${this.cell(r.aportes)}">${this.fmt(r.aportes)}</td>
          <td style="padding:8px 10px;${this.cell(r.resgates)}">${this.fmt(r.resgates)}</td>
          <td style="padding:8px 10px;${this.cell(r.rendimento)}">${this.fmt(r.rendimento)}${r.rendimentoFromBalance ? `<div style="font-size:0.65rem;color:#64748b;font-weight:500;">pelo saldo</div>` : ""}</td>
          <td style="padding:8px 10px;${this.cell(r.closing, true)}">${this.fmt(r.closing)}</td>
          <td style="padding:8px 10px;${this.cell(r.variacao, true)}">${this.fmt(r.variacao)}</td>
        </tr>
        ${flowRows}`;
    }).join("");
    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;min-width:860px;">
          <thead>
            <tr style="background:#f8fafc;position:sticky;top:0;z-index:1;">
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Conta</th>
              <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e2e8f0;">Saldo inicial</th>
              <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e2e8f0;">Aportes</th>
              <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e2e8f0;">Resgates</th>
              <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e2e8f0;">Rendimento</th>
              <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e2e8f0;">Saldo final</th>
              <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #e2e8f0;">Variação</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
};

window.InvestimentoApp = InvestimentoApp;
