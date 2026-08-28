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
  accountQuery: "",
  companyDropOpen: false,
  groupByCompany: true,
  collapsedCompanies: new Set(),
  collapsedAccounts: new Set(),
  cdiByMonth: {},
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
    if (!window._invDropBound) {
      window._invDropBound = true;
      document.addEventListener("mousedown", (e) => {
        if (!InvestimentoApp.companyDropOpen) return;
        if (e.target && e.target.closest && e.target.closest("#inv-emp-drop")) return;
        InvestimentoApp.companyDropOpen = false;
        InvestimentoApp.render();
      });
    }
    this.render();
  },

  empresasCustom() {
    let fromLs = {};
    try {
      fromLs = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
    } catch (e) { fromLs = {}; }
    let fromState = {};
    if (typeof EmpresasState !== "undefined" && EmpresasState.customFields && typeof EmpresasState.customFields === "object") {
      fromState = EmpresasState.customFields;
    }
    const merged = {};
    const put = (item) => {
      if (!item || typeof item !== "object" || item.company_id == null) return;
      merged[item.company_id] = item;
      merged[String(item.company_id)] = item;
    };
    Object.values(fromLs).forEach(put);
    Object.values(fromState).forEach(put);
    Object.keys(fromLs).forEach(k => {
      if (k === "_v2") return;
      const item = fromLs[k];
      if (item && typeof item === "object") {
        merged[k] = Object.assign({}, merged[k] || {}, item);
        put(merged[k]);
      }
    });
    Object.keys(fromState).forEach(k => {
      const item = fromState[k];
      if (item && typeof item === "object") {
        merged[k] = Object.assign({}, merged[k] || {}, item);
        put(merged[k]);
      }
    });
    return merged;
  },

  isGeridaFlag(cfg) {
    if (!cfg) return false;
    const v = cfg.gerida_pelo_grupo != null ? cfg.gerida_pelo_grupo : cfg.gerida_grupo;
    return v === 1 || v === true || v === "1" || Number(v) === 1;
  },

  geridasCompanies() {
    const custom = this.empresasCustom();
    const all = (window.AppState && AppState.companies) || [];
    const seen = new Set();
    const out = [];
    const add = (id, usual, legal) => {
      const sid = String(id);
      if (!sid || seen.has(sid)) return;
      seen.add(sid);
      const legalName = legal || usual || `Empresa ${sid}`;
      out.push({ id: sid, name: usual || legalName, legalName });
    };
    all.forEach(c => {
      const cfg = custom[c.id] || custom[String(c.id)] || {};
      if (this.isGeridaFlag(cfg)) add(c.id, cfg.nome_usual, c.name);
    });
    Object.values(custom).forEach(cfg => {
      if (!cfg || typeof cfg !== "object" || cfg.company_id == null) return;
      const found = all.find(x => String(x.id) === String(cfg.company_id));
      if (this.isGeridaFlag(cfg)) add(cfg.company_id, cfg.nome_usual, found && found.name);
    });
    return out.sort((a, b) => Number(a.id) - Number(b.id));
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

  accIdentity(accountNumber, extra) {
    const raw = String(accountNumber || (extra && (extra.accountNumber || extra.account || extra.code)) || "").trim();
    const digits = this.normAcc(raw);
    if (digits) return digits;
    if (raw) return raw.toUpperCase();
    const fallback = extra && (extra.checkingAccountId || extra.idCheckingAccount || extra.id);
    return fallback != null ? String(fallback) : "";
  },

  accKey(companyId, accountNumber, extra) {
    return `${companyId}|${this.accIdentity(accountNumber, extra)}`;
  },

  accTextBlob(acc) {
    const type = acc && acc.accountType;
    const typeBits = type && typeof type === "object"
      ? [type.id, type.description, type.name, type.label]
      : [type];
    return [
      acc && acc.accountNumber,
      acc && acc.accountName,
      acc && acc.name,
      acc && acc.description,
      acc && acc.nickname,
      acc && acc.mask,
      acc && acc.accountCode,
      acc && acc.code,
      ...typeBits,
      acc && acc.accountKind,
      acc && acc.type
    ].map(x => String(x == null ? "" : x)).join(" ").toUpperCase();
  },

  isInvestmentAccount(acc) {
    const blob = this.accTextBlob(acc);
    if (/APLIC|INVEST|SAVING|POUPAN|APPLICATION|FUNDO|CDB|TESOURO|LCI|LCA|RDB|COMPROMISSADA|\bC\/I\b|C\/I\s|- C\/I|COMPR-/.test(blob)) return true;
    const typeId = acc && acc.accountType && typeof acc.accountType === "object" ? String(acc.accountType.id || "").toUpperCase() : "";
    if (typeId === "I" || typeId === "INV" || typeId === "INVESTMENT" || typeId === "2") return true;
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

  async ensureCdi() {
    if (this.cdiByMonth && Object.keys(this.cdiByMonth).length) return;
    this.cdiByMonth = {};
    try {
      const res = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados?formato=json");
      if (!res.ok) return;
      const json = await res.json();
      (json || []).forEach(r => {
        const parts = String(r.data || "").split("/");
        if (parts.length !== 3) return;
        const key = `${parts[2]}-${parts[1]}`;
        this.cdiByMonth[key] = Number(String(r.valor).replace(",", ".")) || 0;
      });
    } catch (e) {
      console.warn("[Investimento] CDI BCB 4391:", e);
    }
  },

  cdiTip(rendimento, opening, mk) {
    const cdi = Number(this.cdiByMonth[mk]) || 0;
    const yld = opening > 0.009 ? (Number(rendimento) / opening) * 100 : null;
    if (yld == null && !cdi) return "CDI do mês indisponível";
    if (yld == null) return `CDI ${cdi.toFixed(2).replace(".", ",")}% a.m.`;
    if (!cdi) return `Rendimento ${yld.toFixed(2).replace(".", ",")}% no mês · CDI indisponível`;
    const pct = (yld / cdi) * 100;
    return `Rendimento ${yld.toFixed(2).replace(".", ",")}% no mês · CDI ${cdi.toFixed(2).replace(".", ",")}% a.m. · ${pct.toFixed(0)}% do CDI`;
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
    await this.ensureCdi();
    const openingDate = this.addDaysIso(this.startDate, -1);
    const monthEndDates = this.months.map(mk => this.clampDate(this.lastDayOfMonth(mk), this.endDate));
    try {
      const uniqueBalDates = [...new Set(monthEndDates)];
      const [balancesOpen, accountsChunks, movChunks, ...monthBalResults] = await Promise.all([
        SiengeApiService.getAccountBalances(openingDate, { showLast: true }),
        Promise.all(this.selectedCompanyIds.map(async id => {
          const res = await SiengeApiService.getCheckingAccounts(id, { allStatuses: true });
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
        const key = this.accKey(a.companyId, a.accountNumber, a);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const investKeys = new Set(catalog.map(a => this.accKey(a.companyId, a.accountNumber, a)));
      const movements = movChunks.flat().filter(m => {
        const raw = this.movAccount(m);
        const key = this.accKey(m.companyId, raw, m);
        if (!this.accIdentity(raw, m)) return false;
        if (!catalog.length) return false;
        if (!this.onlyInvestment) {
          return this.selectedCompanyIds.includes(String(m.companyId));
        }
        return investKeys.has(key);
      });

      if (!catalog.length && this.onlyInvestment) {
        this.accounts = [];
        this.kpis = { opening: 0, aportes: 0, resgates: 0, rendimento: 0, tarifas: 0, closing: 0 };
        this.error = "Nenhuma conta de investimento/aplicação identificada nas empresas selecionadas.";
        return;
      }

      const byAcc = new Map();
      const ensure = (acc) => {
        const num = String(acc.accountNumber || acc.accountName || acc.name || "").trim();
        const key = this.accKey(acc.companyId, num, acc);
        if (!byAcc.has(key)) {
          const opening = this.pickBalance(balancesOpen, num, acc.companyId);
          const closingApi = this.pickBalance(balancesClose, num, acc.companyId);
          byAcc.set(key, {
            key,
            companyId: acc.companyId,
            companyName: this.companyName(acc.companyId),
            accountNumber: num,
            accountName: acc.accountName || acc.name || acc.description || "Conta",
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
        const key = this.accKey(mov.companyId, num, mov);
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
      this.collapsedAccounts = new Set(accounts.map(r => r.key));
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

  allCompaniesSelected() {
    const all = this.geridasCompanies();
    return all.length > 0 && this.selectedCompanyIds.length === all.length;
  },

  companyDropLabel() {
    const all = this.geridasCompanies();
    const n = this.selectedCompanyIds.length;
    if (!all.length) return "Nenhuma empresa gerida";
    if (n === all.length) return `Todas (${n})`;
    if (n === 1) {
      const c = all.find(x => String(x.id) === String(this.selectedCompanyIds[0]));
      return c ? this.companyFullLabel(c) : this.companyName(this.selectedCompanyIds[0]);
    }
    if (n === 0) return "Selecione empresas";
    return `${n} empresas`;
  },

  toggleCompanyDrop(ev) {
    if (ev) ev.stopPropagation();
    this.companyDropOpen = !this.companyDropOpen;
    this.render();
  },

  filterCompanyList(q) {
    this.companyQuery = q || "";
    const box = document.getElementById("inv-emp-list");
    if (!box) return;
    box.innerHTML = this.companyListHtml();
  },

  companyFullLabel(c) {
    const legal = (c && (c.legalName || c.name)) || "";
    return `${c.id} - ${legal}`;
  },

  companyListHtml() {
    const companies = this.geridasCompanies();
    const q = (this.companyQuery || "").toLowerCase().trim();
    const filtered = companies.filter(c => {
      if (!q) return true;
      const blob = `${c.id} ${c.name} ${c.legalName || ""}`.toLowerCase();
      return blob.includes(q);
    });
    if (!filtered.length) return `<div style="padding:10px;color:#94a3b8;font-size:0.78rem;">Nenhuma empresa com esse nome.</div>`;
    return filtered.map(c => {
      const on = this.selectedCompanyIds.includes(c.id);
      return `<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:0.8rem;background:${on ? "#ecfdf5" : "#fff"};">
        <input type="checkbox" ${on ? "checked" : ""} onchange="InvestimentoApp.toggleCompany('${c.id}', this.checked)" style="margin-top:3px;flex-shrink:0;">
        <span style="font-weight:${on ? 700 : 600};color:#334155;line-height:1.35;white-space:normal;">${this.esc(this.companyFullLabel(c))}</span>
      </label>`;
    }).join("");
  },

  companyDropHtml() {
    const companies = this.geridasCompanies();
    if (!companies.length) {
      return `<div style="padding:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;font-size:0.8rem;">Nenhuma empresa com a flag <strong>Gerida pelo grupo</strong> no cadastro de empresas.</div>`;
    }
    return `<div id="inv-emp-drop" style="position:relative;flex:1;min-width:420px;max-width:640px;" onmousedown="event.stopPropagation()">
      <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:4px;">Empresas geridas pelo grupo</div>
      <button type="button" onclick="InvestimentoApp.toggleCompanyDrop(event)"
        style="width:100%;min-height:34px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:6px 10px;cursor:pointer;font-size:0.82rem;font-weight:700;color:#0f172a;text-align:left;gap:8px;">
        <span style="white-space:normal;line-height:1.3;">${this.esc(this.companyDropLabel())}</span>
        <i data-lucide="chevron-down" style="width:16px;height:16px;color:#64748b;flex-shrink:0;"></i>
      </button>
      ${this.companyDropOpen ? `
        <div style="position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:40;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 12px 28px rgba(15,23,42,0.12);overflow:hidden;">
          <div style="display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
            <button type="button" onclick="event.stopPropagation();InvestimentoApp.selectAllGeridas()" style="flex:1;height:30px;border:1px solid #86efac;background:#ecfdf5;color:#105436;border-radius:6px;font-size:0.75rem;font-weight:800;cursor:pointer;">Marcar todas</button>
            <button type="button" onclick="event.stopPropagation();InvestimentoApp.clearGeridas()" style="flex:1;height:30px;border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:6px;font-size:0.75rem;font-weight:800;cursor:pointer;">Desmarcar todas</button>
          </div>
          <input id="inv-emp-search" placeholder="Buscar por ID ou nome..." value="${this.esc(this.companyQuery)}"
            onclick="event.stopPropagation()"
            oninput="InvestimentoApp.filterCompanyList(this.value)"
            style="width:100%;height:32px;border:none;border-bottom:1px solid #e2e8f0;padding:0 10px;box-sizing:border-box;font-size:0.8rem;">
          <div id="inv-emp-list" style="max-height:280px;overflow:auto;">
            ${this.companyListHtml()}
          </div>
        </div>` : ""}
    </div>`;
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

  selectAllGeridas() {
    this.selectedCompanyIds = this.geridasCompanies().map(c => c.id);
    this.companyDropOpen = true;
    this.groupByCompany = true;
    this.render();
  },

  clearGeridas() {
    this.selectedCompanyIds = [];
    this.companyDropOpen = true;
    this.render();
  },

  toggleGroupByCompany() {
    this.groupByCompany = !this.groupByCompany;
    this.render();
  },

  toggleCompanyCollapse(id) {
    const s = String(id);
    if (this.collapsedCompanies.has(s)) this.collapsedCompanies.delete(s);
    else this.collapsedCompanies.add(s);
    this.render();
  },

  toggleAccountCollapse(key) {
    const s = String(key);
    if (this.collapsedAccounts.has(s)) this.collapsedAccounts.delete(s);
    else this.collapsedAccounts.add(s);
    this.render();
  },

  companyAccounts(companyId, list) {
    return (list || this.accounts).filter(r => String(r.companyId) === String(companyId));
  },

  visibleAccounts() {
    const q = (this.accountQuery || "").toLowerCase().trim();
    const nq = this.normAcc(this.accountQuery);
    if (!q) return this.accounts;
    return this.accounts.filter(r => {
      const blob = `${r.accountNumber} ${r.accountName} ${r.companyName}`.toLowerCase();
      if (blob.includes(q)) return true;
      return !!(nq && this.normAcc(r.accountNumber).includes(nq));
    });
  },

  aggregateFlow(accs) {
    const keys = this.months;
    const opening = accs.reduce((s, r) => s + (Number(r.opening) || 0), 0);
    let running = opening;
    const months = keys.map(mk => {
      const f = accs.reduce((acc, r) => {
        const m = (r.months && r.months[mk]) || this.emptyFlow();
        acc.aportes += m.aportes || 0;
        acc.resgates += m.resgates || 0;
        acc.rendimento += m.rendimento || 0;
        acc.tarifas += m.tarifas || 0;
        return acc;
      }, this.emptyFlow());
      const monthOpening = running;
      const net = f.aportes + f.resgates + f.rendimento + f.tarifas;
      running = monthOpening + net;
      return { month: mk, opening: monthOpening, ...f, closing: running };
    });
    return { opening, months };
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
            ${this.companyDropHtml()}
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Início
              <input type="date" value="${this.startDate}" onchange="InvestimentoApp.startDate=this.value"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Fim
              <input type="date" value="${this.endDate}" onchange="InvestimentoApp.endDate=this.value"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Conta
              <input type="search" id="inv-acc-search" placeholder="Nº ou nome da conta" value="${this.esc(this.accountQuery)}"
                oninput="InvestimentoApp.accountQuery=this.value;InvestimentoApp._focusAcc=true;InvestimentoApp.render()"
                style="display:block;height:34px;min-width:200px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <button class="btn btn-primary" onclick="InvestimentoApp.load()" style="height:34px;">
              ${this.loading ? "Consultando..." : "Consultar"}
            </button>
            <button type="button" class="btn btn-outline" onclick="InvestimentoApp.exportExcel()" ${this.accounts.length ? "" : "disabled"}
              style="height:34px;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="file-spreadsheet" style="width:14px;height:14px;"></i> Exportar Excel
            </button>
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
    if (this._focusAcc) {
      this._focusAcc = false;
      const a = document.getElementById("inv-acc-search");
      if (a) {
        a.focus();
        try { a.setSelectionRange(a.value.length, a.value.length); } catch (e) {}
      }
    }
    if (this.companyDropOpen) {
      const s = document.getElementById("inv-emp-search");
      if (s) {
        s.focus();
        try { s.setSelectionRange(s.value.length, s.value.length); } catch (e) {}
      }
    }
  },

  tableHtml() {
    if (!this.accounts.length) {
      return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:28px;text-align:center;color:#94a3b8;">Informe o período e clique em Consultar.</div>`;
    }
    const accounts = this.visibleAccounts();
    if (!accounts.length) {
      return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:28px;text-align:center;color:#94a3b8;">Nenhuma conta com esse filtro.</div>`;
    }
    const visKpis = accounts.reduce((acc, r) => {
      acc.opening += r.opening || 0;
      return acc;
    }, { opening: 0 });
    const visFlow = (() => {
      const keys = this.months;
      let running = visKpis.opening;
      return keys.map(mk => {
        const f = accounts.reduce((acc, r) => {
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
    })();
    const months = this.months;
    const th = (label, extra) => `<th style="padding:8px 8px;text-align:right;border-bottom:2px solid #d1fae5;background:#105436;color:#fff;font-size:0.72rem;font-weight:700;white-space:nowrap;${extra || ""}">${label}</th>`;
    const money = (n, bold) => `<td style="padding:6px 8px;${this.cell(n, bold)}">${this.fmt(n)}</td>`;
    const empty = `<td style="padding:6px 8px;text-align:right;color:#cbd5e1;">—</td>`;
    const rendTd = (n, opening, mk, bold) => {
      const tip = this.esc(this.cdiTip(n, opening, mk));
      return `<td title="${tip}" style="padding:6px 8px;${this.cell(n, bold)};cursor:help;">${this.fmt(n)}</td>`;
    };

    const groupRows = (label, sub, opening, monthFlow, isTotal, opts) => {
      opts = opts || {};
      const collapseKey = opts.collapseKey;
      const collapsed = collapseKey && this.collapsedAccounts.has(collapseKey);
      const bgHead = isTotal ? "#ecfdf5" : "#f8fafc";
      const sticky = "position:sticky;left:0;z-index:1;";
      const chevron = collapseKey
        ? `<button type="button" onclick="InvestimentoApp.toggleAccountCollapse(decodeURIComponent('${encodeURIComponent(collapseKey)}'))" style="border:none;background:none;cursor:pointer;padding:0;color:#64748b;display:inline-flex;align-items:center;margin-right:4px;">
             <i data-lucide="${collapsed ? "chevron-right" : "chevron-down"}" style="width:14px;height:14px;"></i>
           </button>`
        : "";
      const labelCell = `
        <td rowspan="${collapsed ? 1 : 4}" style="padding:8px 10px;vertical-align:top;min-width:180px;max-width:260px;${sticky}background:${bgHead};border-right:1px solid #e2e8f0;">
          <div style="display:flex;align-items:flex-start;gap:2px;">
            ${chevron}
            <div>
              <div style="font-weight:800;color:#0f172a;font-size:0.82rem;">${this.esc(label)}</div>
              ${sub ? `<div style="font-size:0.7rem;color:#64748b;margin-top:2px;">${this.esc(sub)}</div>` : ""}
            </div>
          </div>
        </td>`;
      const saldos = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).closing || 0);
      if (collapsed) {
        return `<tr style="background:${bgHead};border-top:2px solid #e2e8f0;">
          ${labelCell}
          <td style="padding:6px 10px;font-weight:800;color:#0f172a;">Saldo</td>
          ${money(opening, true)}
          ${saldos.map(n => money(n, true)).join("")}
        </tr>`;
      }
      const entradas = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).aportes || 0);
      const saidas = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).resgates || 0);
      const rends = months.map(mk => monthFlow.find(f => f.month === mk) || { rendimento: 0, opening: 0, month: mk });
      return `
        <tr style="background:${bgHead};border-top:2px solid #e2e8f0;">
          ${labelCell}
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
          ${rends.map(f => rendTd(f.rendimento || 0, f.opening || 0, f.month)).join("")}
        </tr>
        <tr style="background:${isTotal ? "#d1fae5" : "#f1f5f9"};">
          <td style="padding:6px 10px;font-weight:800;color:#0f172a;white-space:nowrap;">Saldo</td>
          ${money(opening, true)}
          ${saldos.map(n => money(n, true)).join("")}
        </tr>`;
    };

    const consolidado = groupRows("Consolidado", "Empresas selecionadas", visKpis.opening, visFlow, true);
    let body = consolidado;
    const showGroup = this.groupByCompany && this.selectedCompanyIds.length > 1;
    if (showGroup) {
      const ids = [...new Set(accounts.map(a => String(a.companyId)))];
      ids.sort((a, b) => this.companyName(a).localeCompare(this.companyName(b), "pt-BR"));
      ids.forEach(cid => {
        const accs = this.companyAccounts(cid, accounts);
        if (!accs.length) return;
        const agg = this.aggregateFlow(accs);
        const closed = this.collapsedCompanies.has(String(cid));
        const colCount = 3 + months.length;
        body += `<tr style="background:#0f766e;">
          <td colspan="${colCount}" style="padding:8px 10px;color:#fff;font-weight:800;font-size:0.8rem;">
            <button type="button" onclick="InvestimentoApp.toggleCompanyCollapse('${cid}')" style="border:none;background:none;color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font:inherit;font-weight:800;">
              <i data-lucide="${closed ? "chevron-right" : "chevron-down"}" style="width:14px;height:14px;"></i>
              ${this.esc(this.companyName(cid))}
              <span style="font-weight:600;opacity:.85;">· ${accs.length} conta(s)</span>
            </button>
          </td>
        </tr>`;
        if (!closed) {
          body += groupRows("Total da empresa", this.companyName(cid), agg.opening, agg.months, true, { collapseKey: "co-" + cid });
          body += accs.map(r =>
            groupRows(r.accountNumber || r.accountName, r.accountName, r.opening, this.monthFlowOf(r), false, { collapseKey: r.key })
          ).join("");
        }
      });
    } else {
      body += accounts.map(r =>
        groupRows(r.accountNumber || r.accountName, `${r.accountName} · ${r.companyName}`, r.opening, this.monthFlowOf(r), false, { collapseKey: r.key })
      ).join("");
    }

    const canGroup = this.selectedCompanyIds.length > 1;
    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:auto;">
        <div style="padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:0.82rem;font-weight:800;color:#0f172a;">Kardex — conta × movimento · saldo inicial e meses</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${canGroup ? `<label style="font-size:0.75rem;font-weight:700;color:#334155;display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" ${this.groupByCompany ? "checked" : ""} onchange="InvestimentoApp.toggleGroupByCompany()">
              Agrupar por empresa
            </label>` : ""}
            <span style="font-size:0.7rem;color:#64748b;">Passe o mouse no rendimento para ver % do CDI</span>
          </div>
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
            ${body}
          </tbody>
        </table>
      </div>`;
  },

  exportExcel() {
    if (!this.accounts.length) {
      alert("Consulte o período antes de exportar.");
      return;
    }
    if (typeof XLSX === "undefined") {
      alert("Biblioteca de Excel não carregou. Recarregue a página.");
      return;
    }
    const months = this.months;
    const header = ["Empresa", "Conta", "Nº conta", "Movimento", "Saldo inicial", ...months.map(mk => this.monthLabel(mk))];
    const rows = [header];
    const push = (empresa, conta, num, opening, monthFlow) => {
      const find = mk => monthFlow.find(f => f.month === mk) || {};
      rows.push([empresa, conta, num, "Entrada", "", ...months.map(mk => Number(find(mk).aportes) || 0)]);
      rows.push([empresa, conta, num, "Saída", "", ...months.map(mk => Number(find(mk).resgates) || 0)]);
      rows.push([empresa, conta, num, "Rendimento", "", ...months.map(mk => Number(find(mk).rendimento) || 0)]);
      rows.push([empresa, conta, num, "Saldo", Number(opening) || 0, ...months.map(mk => Number(find(mk).closing) || 0)]);
    };
    push("Consolidado", "Empresas selecionadas", "", this.kpis.opening, this.consolidatedFlow());
    if (this.groupByCompany && this.selectedCompanyIds.length > 1) {
      const ids = [...new Set(this.accounts.map(a => String(a.companyId)))];
      ids.sort((a, b) => this.companyName(a).localeCompare(this.companyName(b), "pt-BR"));
      ids.forEach(cid => {
        const accs = this.companyAccounts(cid);
        const agg = this.aggregateFlow(accs);
        const emp = this.companyName(cid);
        push(emp, "Total da empresa", "", agg.opening, agg.months);
        accs.forEach(r => push(emp, r.accountName, r.accountNumber, r.opening, this.monthFlowOf(r)));
      });
    } else {
      this.accounts.forEach(r => push(r.companyName, r.accountName, r.accountNumber, r.opening, this.monthFlowOf(r)));
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, this.groupByCompany ? "Por empresa" : "Kardex");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `investimento_${stamp}.xlsx`);
  }
};

window.InvestimentoApp = InvestimentoApp;
