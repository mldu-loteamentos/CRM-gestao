// Investimento — saldos (accounts-balances) × movimento de caixa/banco das contas de aplicação

const InvestimentoApp = {
  startDate: "",
  endDate: "",
  selectedCompanyIds: [],
  onlyInvestment: true,
  loading: false,
  loadingHint: "",
  error: "",
  accounts: [],
  months: [],
  expanded: new Set(),
  companyQuery: "",
  accountQuery: "",
  companyDropOpen: false,
  accountDropOpen: false,
  selectedAccountKeys: null,
  filterCatalog: [],
  catalogByCompany: {},
  catalogLoading: false,
  _catalogGen: 0,
  groupByCompany: true,
  collapsedCompanies: new Set(),
  collapsedAccounts: new Set(),
  cdiByMonth: {},
  kpis: { opening: 0, aportes: 0, resgates: 0, rendimento: 0, tarifas: 0, closing: 0 },

  FILTER_KEY: "crm_investimento_periodo",

  defaultStartDate() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  },

  defaultEndDate() {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  },

  isIsoDate(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
  },

  persistPeriod() {
    try {
      let prev = {};
      try { prev = JSON.parse(localStorage.getItem(this.FILTER_KEY) || "null") || {}; } catch (e) { prev = {}; }
      const companies = (this.selectedCompanyIds || []).map(String).filter(Boolean);
      const selectedCompanyIds = (companies.length || this._clearedCompanies)
        ? companies
        : (Array.isArray(prev.selectedCompanyIds) ? prev.selectedCompanyIds : []);
      let selectedAccountKeys = this.selectedAccountKeys;
      if (this._clearedAccounts) {
        selectedAccountKeys = [];
      } else if (!Array.isArray(selectedAccountKeys)) {
        selectedAccountKeys = prev.selectedAccountKeys;
      } else if (!selectedAccountKeys.length && Array.isArray(prev.selectedAccountKeys) && prev.selectedAccountKeys.length && !this.filterCatalog.length) {
        selectedAccountKeys = prev.selectedAccountKeys;
      }
      localStorage.setItem(this.FILTER_KEY, JSON.stringify({
        startDate: this.startDate,
        endDate: this.endDate,
        consultStart: this.consultStart || prev.consultStart || "",
        consultEnd: this.consultEnd || prev.consultEnd || "",
        selectedCompanyIds,
        selectedAccountKeys,
        groupByCompany: this.groupByCompany !== false
      }));
    } catch (e) { /* ignore quota */ }
  },

  restorePeriod() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.FILTER_KEY) || "null");
      if (!saved || typeof saved !== "object") return;
      const start = this.isIsoDate(saved.consultStart) ? saved.consultStart : saved.startDate;
      const end = this.isIsoDate(saved.consultEnd) ? saved.consultEnd : saved.endDate;
      if (this.isIsoDate(start)) this.startDate = start;
      if (this.isIsoDate(end)) this.endDate = end;
      if (this.isIsoDate(saved.consultStart)) this.consultStart = saved.consultStart;
      if (this.isIsoDate(saved.consultEnd)) this.consultEnd = saved.consultEnd;
      if (Array.isArray(saved.selectedCompanyIds) && saved.selectedCompanyIds.length) {
        this.selectedCompanyIds = saved.selectedCompanyIds.map(String).filter(Boolean);
        this._hadSavedCompanyIds = true;
      }
      if (Array.isArray(saved.selectedAccountKeys)) {
        this.selectedAccountKeys = saved.selectedAccountKeys.map(String).filter(Boolean);
        this._hadSavedAccountKeys = true;
      }
      if (typeof saved.groupByCompany === "boolean") this.groupByCompany = saved.groupByCompany;
    } catch (e) { /* ignore */ }
  },

  setStartDate(v) {
    this.startDate = v;
    this.persistPeriod();
  },

  setEndDate(v) {
    this.endDate = v;
    this.persistPeriod();
  },

  syncGeridasSelection() {
    const geridas = this.geridasCompanies();
    if (!geridas.length) return;
    const allowed = new Set(geridas.map(c => String(c.id)));
    const kept = (this.selectedCompanyIds || []).filter(id => allowed.has(String(id)));
    if (kept.length) {
      this.selectedCompanyIds = kept;
      return;
    }
    this.selectedCompanyIds = geridas.map(c => String(c.id));
  },

  init() {
    if (!this._filtersReady) {
      this.restorePeriod();
      if (!this.isIsoDate(this.startDate)) this.startDate = this.defaultStartDate();
      if (!this.isIsoDate(this.endDate)) this.endDate = this.defaultEndDate();
      if (this.startDate && this.endDate && this.startDate > this.endDate) {
        const tmp = this.startDate;
        this.startDate = this.endDate;
        this.endDate = tmp;
      }
      this._filtersReady = true;
    }
    this.syncGeridasSelection();
    if (!window._invDropBound) {
      window._invDropBound = true;
      document.addEventListener("mousedown", (e) => {
        const t = e.target;
        const inEmp = t && t.closest && t.closest("#inv-emp-drop");
        const inAcc = t && t.closest && t.closest("#inv-acc-drop");
        let changed = false;
        if (InvestimentoApp.companyDropOpen && !inEmp) {
          InvestimentoApp.companyDropOpen = false;
          changed = true;
        }
        if (InvestimentoApp.accountDropOpen && !inAcc) {
          InvestimentoApp.accountDropOpen = false;
          changed = true;
        }
        if (changed) InvestimentoApp.render();
      });
    }
    this.render();
    this.refreshFilterCatalog();
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

  catalogAccount(raw, companyId) {
    const type = raw && raw.accountType;
    const typeId = type && typeof type === "object" ? type.id : (raw.accountTypeId || raw.accountKind || "");
    const typeDesc = type && typeof type === "object"
      ? (type.description || type.name || type.label || "")
      : (type || raw.accountKind || raw.type || "");
    const accountNumber = String(
      raw.accountNumber ||
      raw.number ||
      raw.bankAccountNumber ||
      raw.checkingAccountNumber ||
      raw.code ||
      ""
    ).trim();
    const accountName = String(raw.accountName || raw.name || raw.description || "").trim();
    return {
      ...raw,
      companyId: raw.companyId || raw.idCompany || companyId,
      accountNumber: accountNumber || accountName,
      accountName: accountName || accountNumber || "Conta",
      mask: raw.mask || raw.accountMask || raw.nickname || "",
      accountType: type && typeof type === "object" ? type : typeDesc,
      accountTypeId: typeId,
      accountTypeLabel: typeDesc
    };
  },

  accKey(companyId, accountNumber, extra) {
    return `${companyId}|${this.accIdentity(accountNumber, extra)}`;
  },

  siengeAccountType(acc) {
    const type = acc && acc.accountType;
    const id = String(
      (type && typeof type === "object" && type.id) ||
      acc.accountTypeId ||
      ""
    ).trim().toUpperCase();
    const desc = String(
      (type && typeof type === "object" && (type.description || type.name || type.label)) ||
      acc.accountTypeLabel ||
      (typeof type === "string" ? type : "") ||
      acc.accountKind ||
      acc.type ||
      ""
    ).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    return { id, desc };
  },

  isInvestmentAccount(acc) {
    const { id, desc } = this.siengeAccountType(acc);
    if (id === "I" || id === "A") return true;
    if (/^INVEST/.test(desc) || desc.includes("INVESTIMENTO")) return true;
    if (/^APLIC/.test(desc) || desc === "APPLICATION" || desc === "INVESTMENT") return true;
    return false;
  },

  keysForAccount(acc) {
    const cid = acc.companyId;
    const keys = new Set();
    [
      acc.accountNumber,
      acc.accountName,
      acc.code,
      acc.mask,
      acc.checkingAccountId,
      acc.idCheckingAccount,
      acc.id
    ].forEach(v => {
      const id = this.accIdentity(v, acc);
      if (id) keys.add(`${cid}|${id}`);
    });
    const sid = acc.checkingAccountId || acc.idCheckingAccount || acc.id;
    if (sid != null && sid !== "") keys.add(`${cid}|id:${sid}`);
    return keys;
  },

  filterAccKey(acc) {
    return this.accKey(acc.companyId, acc.accountNumber, acc);
  },

  async fetchCompanyInvestmentAccounts(id) {
    const sid = String(id);
    if (this.catalogByCompany[sid]) return this.catalogByCompany[sid];
    let res = await SiengeApiService.getCheckingAccounts(sid, { allStatuses: true });
    let list = (res && res.results) || [];
    if (!list.length) {
      res = await SiengeApiService.getCheckingAccounts(sid);
      list = (res && res.results) || [];
    }
    const mapped = list
      .map(a => this.catalogAccount(a, sid))
      .filter(a => this.isInvestmentAccount(a));
    const seen = new Set();
    const unique = mapped.filter(a => {
      const key = this.filterAccKey(a);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) => String(a.accountNumber).localeCompare(String(b.accountNumber), "pt-BR"));
    this.catalogByCompany[sid] = unique;
    return unique;
  },

  syncSelectedAccountKeys() {
    const available = this.filterCatalog.map(a => this.filterAccKey(a));
    const availSet = new Set(available);
    if (this.selectedAccountKeys == null) {
      this.selectedAccountKeys = available;
      return;
    }
    if (!available.length) return;
    const kept = this.selectedAccountKeys.filter(k => availSet.has(k));
    this.selectedAccountKeys = kept.length ? kept : available;
  },

  async refreshFilterCatalog() {
    const gen = ++this._catalogGen;
    const ids = (this.selectedCompanyIds || []).map(String);
    if (!ids.length) {
      this.filterCatalog = [];
      this.catalogLoading = false;
      this.render();
      return;
    }
    this.catalogLoading = true;
    this.render();
    try {
      const chunks = await Promise.all(ids.map(id => this.fetchCompanyInvestmentAccounts(id)));
      if (gen !== this._catalogGen) return;
      this.filterCatalog = chunks.flat();
      this.syncSelectedAccountKeys();
      this.persistPeriod();
    } catch (e) {
      console.warn("[Investimento] Catálogo de contas:", e);
    } finally {
      if (gen === this._catalogGen) {
        this.catalogLoading = false;
        this.render();
      }
    }
  },

  classifyByHistoric(mov) {
    const blob = [
      mov.historic, mov.history, mov.bankMovementHistoricName, mov.bankMovementOperationName,
      mov.origin, mov.originDescription, mov.originId, mov.bankMovementOriginId,
      mov.documentType, mov.documentIdentification, mov.documentIdentificationName, mov.observations, mov.note,
      ...((mov.financialCategories || []).map(c => `${c.financialCategoryName || ""} ${c.financialCategoryId || ""}`))
    ].join(" ").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/IRRF|\bIOF\b|TARIFA|IMPOSTO DE RENDA|\bIR SOBRE|RETIDO NA FONTE/.test(blob)) return "tarifas";
    if (/RENDIM|RENDTO|\bJUROS\b|RECEITA FINANCEIRA/.test(blob)) return "rendimento";
    if (/RESGATE/.test(blob)) return "resgate";
    if (/APLICA|APORTE/.test(blob)) return "aporte";
    return "";
  },

  movAmount(mov) {
    const raw = Number(mov.bankMovementAmount);
    if (!Number.isFinite(raw) || raw === 0) return 0;
    const abs = Math.abs(raw);
    const hint = this.classifyByHistoric(mov);
    if (hint === "resgate" || hint === "tarifas") return -abs;
    if (hint === "aporte" || hint === "rendimento") return abs;
    const type = String(mov.bankMovementOperationType || mov.operationType || mov.bankMovementOperationName || "")
      .trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/^(S|D)$/.test(type) || /DEBITO|DEBIT|^SAIDA$/.test(type) || type.includes("SAIDA")) return -abs;
    if (/^(E|C)$/.test(type) || /CREDITO|CREDIT|^ENTRADA$/.test(type) || type.includes("ENTRADA")) return abs;
    return raw;
  },

  classifyMovement(mov) {
    const hint = this.classifyByHistoric(mov);
    if (hint) return hint;
    const amount = this.movAmount(mov);
    if (!amount) return "aporte";
    if (amount >= 0) return "aporte";
    return "resgate";
  },

  compactName(s) {
    return String(s || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, "");
  },

  parseMoney(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const s = String(v).trim().replace(/\s/g, "");
    if (!s) return null;
    let n;
    if (s.includes(",") && s.includes(".")) {
      n = s.lastIndexOf(",") > s.lastIndexOf(".")
        ? Number(s.replace(/\./g, "").replace(",", "."))
        : Number(s.replace(/,/g, ""));
    } else if (s.includes(",")) {
      n = Number(s.replace(/\./g, "").replace(",", "."));
    } else {
      n = Number(s);
    }
    return Number.isFinite(n) ? n : null;
  },

  bankToken(s) {
    const t = this.compactName(s);
    const banks = ["BANCODOBRASIL", "SANTANDER", "BRADESCO", "BANRISUL", "SICOOB", "SICREDI", "ORIGINAL", "NUBANK", "SAFRA", "CAIXA", "ITAU", "BTG", "C6", "CEF"];
    return banks.find(b => t.includes(b)) || "";
  },

  productToken(s) {
    const t = this.compactName(s);
    if (t.includes("COMPROMISSADA") || t.includes("COMPR")) return "COMPR";
    if (t.includes("CDBDI")) return "CDBDI";
    if (t.includes("CDB")) return "CDB";
    return "";
  },

  shapeBalance(b, cid) {
    return {
      companyId: cid,
      accountNumber: b.accountNumber || b.number || b.account || b.bankAccountNumber || "",
      accountName: b.accountName || b.name || b.description || "",
      mask: b.mask || b.accountMask || "",
      checkingAccountId: b.checkingAccountId || b.idCheckingAccount || b.idAccount,
      idCheckingAccount: b.idCheckingAccount,
      id: b.id || b.idAccount || b.idCheckingAccount
    };
  },

  scoreOpeningBalance(acc, b) {
    const cid = String(acc.companyId);
    const shaped = this.shapeBalance(b, cid);
    const blobA = `${acc.accountNumber || ""} ${acc.accountName || ""} ${acc.mask || ""}`;
    const blobB = `${shaped.accountNumber} ${shaped.accountName} ${shaped.mask}`;
    const fullA = this.compactName(blobA);
    const fullB = this.compactName(blobB);
    const idA = String(acc.checkingAccountId || acc.idCheckingAccount || acc.id || "").trim();
    const idB = String(shaped.checkingAccountId || shaped.idCheckingAccount || shaped.id || b.accountId || "").trim();
    if (idA && idB && idA === idB) return 1000;
    const bankA = this.bankToken(blobA);
    const bankB = this.bankToken(blobB);
    if (bankA && bankB && bankA !== bankB) return 0;
    const prodA = this.productToken(blobA);
    const prodB = this.productToken(blobB);
    if (prodA && prodB && prodA !== prodB) return 0;
    const nameA = this.compactName(acc.accountName || acc.name || "");
    const nameB = this.compactName(shaped.accountName);
    const numA = this.compactName(acc.accountNumber || acc.mask || "");
    const numB = this.compactName(shaped.accountNumber);
    const digA = this.normAcc(acc.accountNumber || acc.mask || "");
    const digB = this.normAcc(shaped.accountNumber);
    let score = 0;
    if (digA && digB && digA === digB && digA.length >= 5) score += 200;
    if (nameA && nameB && nameA === nameB) score += 160;
    if (fullA && fullB && fullA.length >= 8 && fullB.includes(fullA)) score += 180;
    if (nameA && fullB && nameA.length >= 8 && fullB.includes(nameA)) score += 140;
    if (bankA && (bankB === bankA || fullB.includes(bankA))) score += 80;
    if (prodA && prodB && prodA === prodB) score += 50;
    if (fullA.includes("MLDU") && fullB.includes("MLDU")) score += 40;
    if (numA && numB && numA === numB) score += numA.length >= 6 ? 80 : 45;
    if (nameA.length >= 14 && nameB.length >= 14 && (nameA.includes(nameB) || nameB.includes(nameA))) score += 40;
    return score;
  },

  balanceAmount(b) {
    const candidates = [
      b.amount,
      b.balance,
      b.balanceAmount,
      b.currentBalance,
      b.lastBalance,
      b.lastBalanceAmount,
      b.availableAmount,
      b.availableBalance,
      b.reconciledAmount,
      b.reconciledBalance,
      b.value
    ];
    for (let i = 0; i < candidates.length; i++) {
      const n = this.parseMoney(candidates[i]);
      if (n != null) return n;
    }
    return null;
  },

  pickOpeningBalance(list, acc) {
    const cid = String(acc.companyId);
    const seen = new Set();
    const ranked = (list || []).map(b => {
      const bCid = b.companyId != null ? String(b.companyId) : (b.idCompany != null ? String(b.idCompany) : "");
      if (bCid && bCid !== cid) return null;
      const ident = `${bCid}|${this.accIdentity(b.accountNumber || b.number, b)}|${String(b.balanceDate || b.date || "")}|${this.balanceAmount(b)}`;
      if (seen.has(ident)) return null;
      seen.add(ident);
      return { b, score: this.scoreOpeningBalance(acc, b) };
    }).filter(x => x && x.score >= 70);
    if (!ranked.length) return null;
    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = String(a.b.balanceDate || a.b.date || "");
      const dbd = String(b.b.balanceDate || b.b.date || "");
      return dbd.localeCompare(da);
    });
    return this.balanceAmount(ranked[0].b);
  },

  isNamedInvestAccount(acc) {
    const dig = this.normAcc(acc.accountNumber || acc.mask || "");
    return !dig || dig.length < 5;
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

  periodRendimento(monthFlow) {
    return (monthFlow || []).reduce((s, f) => s + (Number(f.rendimento) || 0), 0);
  },

  periodImposto(monthFlow) {
    return (monthFlow || []).reduce((s, f) => s + (Number(f.tarifas) || 0), 0);
  },

  avgCdiPeriod() {
    const keys = this.months || [];
    const vals = keys.map(mk => Number(this.cdiByMonth[mk]) || 0).filter(n => n > 0);
    if (!vals.length) return null;
    return vals.reduce((s, n) => s + n, 0) / vals.length;
  },

  accountPeriodMetaHtml(monthFlow, source) {
    const rend = this.periodRendimento(monthFlow);
    const imposto = Math.abs(this.periodImposto(monthFlow));
    const avg = this.avgCdiPeriod();
    const n = (this.months || []).filter(mk => Number(this.cdiByMonth[mk]) > 0).length;
    const cdiTxt = avg == null
      ? "CDI médio indisponível no período"
      : `CDI médio ${avg.toFixed(2).replace(".", ",")}% a.m. (${n} ${n === 1 ? "mês" : "meses"})`;
    const src = encodeURIComponent(source || "");
    return `<div style="margin-top:8px;padding:6px 8px;background:#fef9c3;border:1px solid #facc15;border-radius:6px;line-height:1.4;">
      <div role="button" onclick="event.stopPropagation();InvestimentoApp.openMovimentos('${src}','rendimento','period')" style="font-size:0.68rem;font-weight:800;color:#0369a1;cursor:pointer;text-decoration:underline;text-decoration-color:#93c5fd;">Rendimento ${this.fmt(rend)}</div>
      <div role="button" onclick="event.stopPropagation();InvestimentoApp.openMovimentos('${src}','tarifas','period')" style="font-size:0.65rem;font-weight:700;color:#9a3412;margin-top:2px;cursor:pointer;text-decoration:underline;text-decoration-color:#fdba74;">Imposto retido ${this.fmt(imposto)}</div>
      <div style="font-size:0.65rem;font-weight:700;color:#854d0e;margin-top:2px;">${this.esc(cdiTxt)}</div>
    </div>`;
  },

  accountPeriodMetaLines(monthFlow) {
    const rend = this.periodRendimento(monthFlow);
    const imposto = Math.abs(this.periodImposto(monthFlow));
    const avg = this.avgCdiPeriod();
    const cdiTxt = avg == null ? "CDI médio indisponível" : `CDI médio ${avg.toFixed(2).replace(".", ",")}% a.m.`;
    return [
      `Rendimento ${this.fmt(rend)}`,
      `Imposto retido ${this.fmt(imposto)}`,
      cdiTxt
    ];
  },

  accountPeriodMetaText(monthFlow) {
    return this.accountPeriodMetaLines(monthFlow).join("\n");
  },

  excelSplitDot(text) {
    return String(text || "")
      .split(/\s*·\s*|\n/)
      .map(p => p.trim())
      .filter(Boolean);
  },

  excelAccountCell(label, sub, monthFlow) {
    const lines = [String(label || "").trim()].filter(Boolean);
    this.excelSplitDot(sub).forEach(p => {
      if (p && p !== label) lines.push(p);
    });
    this.accountPeriodMetaLines(monthFlow).forEach(l => lines.push(l));
    return lines.join("\n");
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
    if (this.catalogLoading) {
      await this.refreshFilterCatalog();
    }
    if (!(this.selectedAccountKeys || []).length) {
      this.error = "Selecione ao menos uma conta de investimento.";
      this.render();
      return;
    }
    this.loading = true;
    this.loadingHint = "Preparando consulta em fatias de semana/mês...";
    this.error = "";
    this.consultStart = this.startDate;
    this.consultEnd = this.endDate;
    this.persistPeriod();
    this.render();
    this.months = this.monthKeys(this.startDate, this.endDate);
    await this.ensureCdi();
    const openingDate = this.addDaysIso(this.startDate, -1);
    const histStart = this.addDaysIso(this.startDate, -730);
    try {
      const companyIds = this.selectedCompanyIds.slice();
      let movDone = 0;
      const movTotal = Math.max(1, companyIds.length);
      const [accountsChunks, movChunks, balGlobal, balByCo] = await Promise.all([
        Promise.all(companyIds.map(id => this.fetchCompanyInvestmentAccounts(id))),
        (async () => {
          const rows = [];
          const limit = Math.min(2, companyIds.length);
          let next = 0;
          const worker = async () => {
            while (next < companyIds.length) {
              const id = companyIds[next++];
              const data = await SiengeApiService.getBankMovements(histStart, this.endDate, {
                selectionType: "M",
                companyId: id,
                concurrency: 3,
                onChunk: (c, idx, total) => {
                  this.loadingHint = `Empresa ${id}: movimentos ${idx + 1}/${total} (${String(c.start).slice(0, 7)} → ${String(c.end).slice(0, 7)}) · ${movDone + 1}/${movTotal} empresas`;
                  this.render();
                }
              });
              movDone++;
              rows.push((data || []).map(m => ({ ...m, companyId: m.companyId || id })));
            }
          };
          await Promise.all(Array.from({ length: limit }, worker));
          return rows;
        })(),
        SiengeApiService.getAccountBalances(openingDate),
        Promise.all(companyIds.map(id => SiengeApiService.getAccountBalances(openingDate, { companyId: id })))
      ]);
      const balances = [...(balGlobal || []), ...(balByCo || []).flat()];

      let catalog = accountsChunks.flat();
      const wantAcc = new Set(this.selectedAccountKeys || []);
      if (wantAcc.size) catalog = catalog.filter(a => wantAcc.has(this.filterAccKey(a)));
      const seen = new Set();
      catalog = catalog.filter(a => {
        const rawNum = String(a.accountNumber || "").trim().toUpperCase();
        const key = rawNum
          ? `${a.companyId}|${rawNum}`
          : this.accKey(a.companyId, a.accountNumber, a);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const investKeys = new Set();
      catalog.forEach(a => this.keysForAccount(a).forEach(k => investKeys.add(k)));
      const movements = movChunks.flat().filter(m => {
        const raw = this.movAccount(m);
        const key = this.accKey(m.companyId, raw, m);
        const idKey = m.checkingAccountId != null ? `${m.companyId}|id:${m.checkingAccountId}` : "";
        if (!this.accIdentity(raw, m) && !idKey) return false;
        if (!catalog.length) return false;
        if (!this.onlyInvestment) {
          return this.selectedCompanyIds.includes(String(m.companyId));
        }
        return investKeys.has(key) || (idKey && investKeys.has(idKey));
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
          byAcc.set(key, {
            key,
            companyId: acc.companyId,
            companyName: this.companyName(acc.companyId),
            accountNumber: num,
            accountName: acc.accountName || acc.name || acc.description || "Conta",
            accountType: acc.accountType || "",
            checkingAccountId: acc.checkingAccountId || acc.idCheckingAccount || acc.id || "",
            mask: acc.mask || "",
            opening: 0,
            closingApi: 0,
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
      catalog.forEach(a => {
        const row = ensure(a);
        const apiOpen = this.pickOpeningBalance(balances, a);
        if (apiOpen != null) {
          row.opening = apiOpen;
          row.openingFromApi = true;
        }
      });

      movements.forEach(mov => {
        const num = this.movAccount(mov);
        const key = this.accKey(mov.companyId, num, mov);
        let row = byAcc.get(key);
        if (!row) {
          row = ensure({ companyId: mov.companyId, accountNumber: num, accountName: mov.accountName || num });
          if (!row.openingFromApi) {
            const apiOpen = this.pickOpeningBalance(balances, row);
            if (apiOpen != null) {
              row.opening = apiOpen;
              row.openingFromApi = true;
            }
          }
        }
        const kind = this.classifyMovement(mov);
        const amount = this.movAmount(mov);
        const day = String(mov.bankMovementDate || "").slice(0, 10);
        if (day && day < this.startDate) {
          if (!row.openingFromApi && !this.isNamedInvestAccount(row)) row.opening += amount;
          return;
        }
        const mk = String(mov.bankMovementDate || "").slice(0, 7);
        if (!row.months[mk]) row.months[mk] = this.emptyFlow();
        if (kind === "aporte") { row.aportes += amount; row.months[mk].aportes += amount; }
        else if (kind === "resgate") { row.resgates += amount; row.months[mk].resgates += amount; }
        else if (kind === "rendimento") { row.rendimento += amount; row.months[mk].rendimento += amount; }
        else { row.tarifas += amount; row.months[mk].tarifas += amount; }
        row.movements.push({ ...mov, _kind: kind, _amount: amount });
      });

      byAcc.forEach(row => {
        if (row.openingFromApi) return;
        const sample = (row.movements || [])[0];
        const probe = sample
          ? Object.assign({}, row, { accountNumber: this.movAccount(sample) })
          : row;
        const apiOpen = this.pickOpeningBalance(balances, probe);
        if (apiOpen != null) {
          row.opening = apiOpen;
          row.openingFromApi = true;
        }
      });

      const accounts = [...byAcc.values()].map(row => {
        let run = row.opening;
        this.months.forEach(mk => {
          const f = row.months[mk] || this.emptyFlow();
          row.months[mk] = f;
          run = run + f.aportes + f.resgates + f.tarifas + f.rendimento;
          f.closing = run;
        });
        row.aportes = this.months.reduce((s, mk) => s + ((row.months[mk] && row.months[mk].aportes) || 0), 0);
        row.resgates = this.months.reduce((s, mk) => s + ((row.months[mk] && row.months[mk].resgates) || 0), 0);
        row.rendimento = this.months.reduce((s, mk) => s + ((row.months[mk] && row.months[mk].rendimento) || 0), 0);
        row.tarifas = this.months.reduce((s, mk) => s + ((row.months[mk] && row.months[mk].tarifas) || 0), 0);
        row.closing = run;
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
    if (this.companyDropOpen) this.accountDropOpen = false;
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
      const on = this.selectedCompanyIds.includes(String(c.id));
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
    return `<div id="inv-emp-drop" style="position:relative;flex:1;min-width:280px;max-width:480px;" onmousedown="event.stopPropagation()">
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

  accountDropLabel() {
    if (!this.selectedCompanyIds.length) return "Selecione uma empresa";
    if (this.catalogLoading) return "Carregando contas...";
    const all = this.filterCatalog;
    const n = (this.selectedAccountKeys || []).length;
    if (!all.length) return "Nenhuma conta de investimento";
    if (n === all.length) return `Todas (${n})`;
    if (n === 1) {
      const key = this.selectedAccountKeys[0];
      const a = all.find(x => this.filterAccKey(x) === key);
      if (a) return `${a.accountNumber} · ${a.accountName}`;
    }
    if (n === 0) return "Selecione contas";
    return `${n} de ${all.length} contas`;
  },

  toggleAccountDrop(ev) {
    if (ev) ev.stopPropagation();
    if (!this.selectedCompanyIds.length) return;
    this.accountDropOpen = !this.accountDropOpen;
    if (this.accountDropOpen) this.companyDropOpen = false;
    this.render();
  },

  filterAccountList(q) {
    this.accountQuery = q || "";
    const box = document.getElementById("inv-acc-list");
    if (!box) return;
    box.innerHTML = this.accountListHtml();
  },

  toggleFilterAccount(key, on) {
    const k = String(key);
    const cur = this.selectedAccountKeys || [];
    this._clearedAccounts = false;
    if (on) {
      if (!cur.includes(k)) this.selectedAccountKeys = cur.concat([k]);
    } else {
      this.selectedAccountKeys = cur.filter(x => x !== k);
    }
    this.accountDropOpen = true;
    this.persistPeriod();
    this.render();
  },

  selectAllFilterAccounts() {
    this._clearedAccounts = false;
    this.selectedAccountKeys = this.filterCatalog.map(a => this.filterAccKey(a));
    this.accountDropOpen = true;
    this.persistPeriod();
    this.render();
  },

  clearFilterAccounts() {
    this._clearedAccounts = true;
    this.selectedAccountKeys = [];
    this.accountDropOpen = true;
    this.persistPeriod();
    this.render();
  },

  accountListHtml() {
    const q = (this.accountQuery || "").toLowerCase().trim();
    const nq = this.normAcc(this.accountQuery);
    const grouped = [];
    const byCo = {};
    this.filterCatalog.forEach(a => {
      const blob = `${a.accountNumber} ${a.accountName} ${this.companyName(a.companyId)}`.toLowerCase();
      if (q && !blob.includes(q) && !(nq && this.normAcc(a.accountNumber).includes(nq))) return;
      const cid = String(a.companyId);
      if (!byCo[cid]) {
        byCo[cid] = [];
        grouped.push(cid);
      }
      byCo[cid].push(a);
    });
    if (!this.filterCatalog.length) {
      return `<div style="padding:10px;color:#94a3b8;font-size:0.78rem;">Nenhuma conta tipo Investimento nas empresas selecionadas.</div>`;
    }
    if (!grouped.length) return `<div style="padding:10px;color:#94a3b8;font-size:0.78rem;">Nenhuma conta com esse filtro.</div>`;
    const showGroup = this.selectedCompanyIds.length > 1;
    const want = new Set(this.selectedAccountKeys || []);
    return grouped.map(cid => {
      const rows = byCo[cid].map(a => {
        const key = this.filterAccKey(a);
        const on = want.has(key);
        return `<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:0.8rem;background:${on ? "#ecfdf5" : "#fff"};">
          <input type="checkbox" ${on ? "checked" : ""} onchange="InvestimentoApp.toggleFilterAccount(decodeURIComponent('${encodeURIComponent(key)}'), this.checked)" style="margin-top:3px;flex-shrink:0;">
          <span style="line-height:1.35;">
            <span style="font-weight:${on ? 700 : 600};color:#0f172a;">${this.esc(a.accountNumber)}</span>
            <span style="display:block;font-size:0.72rem;color:#64748b;">${this.esc(a.accountName)}</span>
          </span>
        </label>`;
      }).join("");
      if (!showGroup) return rows;
      return `<div style="padding:6px 12px;background:#f8fafc;font-size:0.7rem;font-weight:800;color:#0f766e;border-bottom:1px solid #e2e8f0;">${this.esc(this.companyName(cid))}</div>${rows}`;
    }).join("");
  },

  accountDropHtml() {
    const disabled = !this.selectedCompanyIds.length;
    return `<div id="inv-acc-drop" style="position:relative;flex:1;min-width:280px;max-width:420px;" onmousedown="event.stopPropagation()">
      <div style="font-size:0.75rem;font-weight:700;color:#475569;margin-bottom:4px;">Contas de investimento</div>
      <button type="button" onclick="InvestimentoApp.toggleAccountDrop(event)" ${disabled ? "disabled" : ""}
        style="width:100%;min-height:34px;border:1px solid #e2e8f0;border-radius:6px;background:${disabled ? "#f8fafc" : "#fff"};display:flex;align-items:center;justify-content:space-between;padding:6px 10px;cursor:${disabled ? "not-allowed" : "pointer"};font-size:0.82rem;font-weight:700;color:#0f172a;text-align:left;gap:8px;">
        <span style="white-space:normal;line-height:1.3;">${this.esc(this.accountDropLabel())}</span>
        <i data-lucide="chevron-down" style="width:16px;height:16px;color:#64748b;flex-shrink:0;"></i>
      </button>
      ${this.accountDropOpen && !disabled ? `
        <div style="position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:40;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 12px 28px rgba(15,23,42,0.12);overflow:hidden;">
          <div style="display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
            <button type="button" onclick="event.stopPropagation();InvestimentoApp.selectAllFilterAccounts()" style="flex:1;height:30px;border:1px solid #86efac;background:#ecfdf5;color:#105436;border-radius:6px;font-size:0.75rem;font-weight:800;cursor:pointer;">Marcar todas</button>
            <button type="button" onclick="event.stopPropagation();InvestimentoApp.clearFilterAccounts()" style="flex:1;height:30px;border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:6px;font-size:0.75rem;font-weight:800;cursor:pointer;">Desmarcar todas</button>
          </div>
          <input id="inv-acc-search" placeholder="Buscar conta..." value="${this.esc(this.accountQuery)}"
            onclick="event.stopPropagation()"
            oninput="InvestimentoApp.filterAccountList(this.value)"
            style="width:100%;height:32px;border:none;border-bottom:1px solid #e2e8f0;padding:0 10px;box-sizing:border-box;font-size:0.8rem;">
          <div id="inv-acc-list" style="max-height:280px;overflow:auto;">
            ${this.catalogLoading ? `<div style="padding:10px;color:#64748b;font-size:0.78rem;">Carregando contas do cadastro...</div>` : this.accountListHtml()}
          </div>
        </div>` : ""}
    </div>`;
  },

  toggleCompany(id, on) {
    const sid = String(id);
    this._clearedCompanies = false;
    if (on) {
      if (!this.selectedCompanyIds.includes(sid)) this.selectedCompanyIds.push(sid);
    } else {
      this.selectedCompanyIds = this.selectedCompanyIds.filter(x => x !== sid);
      this.selectedAccountKeys = (this.selectedAccountKeys || []).filter(k => String(k).split("|")[0] !== sid);
    }
    this.companyDropOpen = true;
    this.persistPeriod();
    this.render();
    this.refreshFilterCatalog().then(() => {
      if (!on) return;
      this.filterCatalog.forEach(a => {
        if (String(a.companyId) !== sid) return;
        const k = this.filterAccKey(a);
        if (!(this.selectedAccountKeys || []).includes(k)) {
          this.selectedAccountKeys = this.selectedAccountKeys || [];
          this.selectedAccountKeys.push(k);
        }
      });
      this.persistPeriod();
      this.render();
    });
  },

  selectAllGeridas() {
    this._clearedCompanies = false;
    this.selectedCompanyIds = this.geridasCompanies().map(c => String(c.id));
    this.companyDropOpen = true;
    this.groupByCompany = true;
    this.persistPeriod();
    this.render();
    this.refreshFilterCatalog().then(() => {
      this.selectedAccountKeys = this.filterCatalog.map(a => this.filterAccKey(a));
      this.persistPeriod();
      this.render();
    });
  },

  clearGeridas() {
    this._clearedCompanies = true;
    this._clearedAccounts = true;
    this.selectedCompanyIds = [];
    this.selectedAccountKeys = [];
    this.filterCatalog = [];
    this.companyDropOpen = true;
    this.persistPeriod();
    this.render();
  },

  toggleGroupByCompany() {
    this.groupByCompany = !this.groupByCompany;
    this.persistPeriod();
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

  kindLabel(kind) {
    return ({
      aporte: "Entrada",
      resgate: "Saída",
      rendimento: "Rendimento",
      tarifas: "Imposto retido",
      saldo: "Saldo (lançamentos do mês)",
      opening: "Saldo inicial"
    })[kind] || kind;
  },

  fmtDatePt(iso) {
    const s = String(iso || "").slice(0, 10);
    const p = s.split("-");
    if (p.length !== 3) return s || "—";
    return `${p[2]}/${p[1]}/${p[0]}`;
  },

  accountsForSource(source) {
    const vis = this.visibleAccounts();
    const s = String(source || "");
    if (!s || s === "all") return vis;
    if (s.indexOf("co-") === 0) return this.companyAccounts(s.slice(3), vis);
    return vis.filter(r => String(r.key) === s);
  },

  movementsFor(source, kind, month) {
    const rows = this.accountsForSource(source);
    const list = [];
    rows.forEach(r => {
      (r.movements || []).forEach(m => {
        const day = String(m.bankMovementDate || "").slice(0, 10);
        const mk = day.slice(0, 7);
        if (month && month !== "period" && mk !== month) return;
        const k = m._kind || this.classifyMovement(m);
        if (kind && kind !== "saldo" && kind !== "opening" && k !== kind) return;
        list.push({
          ...m,
          _kind: k,
          _amount: m._amount != null ? m._amount : this.movAmount(m),
          _accLabel: r.accountNumber || r.accountName,
          _accName: r.accountName
        });
      });
    });
    list.sort((a, b) => String(a.bankMovementDate || "").localeCompare(String(b.bankMovementDate || "")));
    return list;
  },

  movNumber(m) {
    return m.bankMovementId || m.id || m.movementId || m.documentNumber || m.documentIdentification || m.document || "—";
  },

  movHistoric(m) {
    return m.historic || m.history || m.bankMovementHistoricName || m.bankMovementOperationName || m.originDescription || m.observations || m.note || "";
  },

  closeMovimentos() {
    const el = document.getElementById("inv-mov-modal");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  openMovimentos(sourceEnc, kind, monthEnc) {
    const source = decodeURIComponent(sourceEnc || "");
    const month = decodeURIComponent(monthEnc || "");
    const rows = this.accountsForSource(source);
    const titleAcc = rows.length === 1
      ? `${rows[0].accountNumber || ""} — ${rows[0].accountName || ""}`
      : (source.indexOf("co-") === 0 ? this.companyName(source.slice(3)) : "Consolidado");
    const periodLabel = !month || month === "period"
      ? "período consultado"
      : this.monthLabel(month);
    const list = kind === "opening" ? [] : this.movementsFor(source, kind, month);
    const total = list.reduce((s, m) => s + (Number(m._amount) || 0), 0);
    const displayTotal = kind === "resgate" || kind === "tarifas" ? Math.abs(total) : total;
    const openingHint = kind === "opening"
      ? `<div style="padding:10px 12px;background:#fef9c3;border:1px solid #facc15;border-radius:8px;margin-bottom:12px;font-size:0.82rem;color:#854d0e;">
          Saldo inicial da posição no Sienge em ${this.esc(this.fmtDatePt(this.addDaysIso(this.startDate, -1)))}:
          <strong>${this.fmt(rows.reduce((s, r) => s + (Number(r.opening) || 0), 0))}</strong>
          ${rows.some(r => r.openingFromApi) ? " (saldo oficial da conta, não é soma de lançamentos do período)." : " (quando não há saldo oficial, o sistema soma movimentos anteriores ao início)."}
        </div>`
      : "";
    const body = list.length
      ? `<div style="overflow:auto;max-height:calc(80vh - 160px);">
          <table class="custom-table" style="width:100%;border-collapse:collapse;font-size:0.78rem;">
            <thead>
              <tr>
                <th style="padding:8px;background:#105436;color:#fff;text-align:left;">Data</th>
                <th style="padding:8px;background:#105436;color:#fff;text-align:left;">Nº movimento</th>
                <th style="padding:8px;background:#105436;color:#fff;text-align:left;">Documento</th>
                <th style="padding:8px;background:#105436;color:#fff;text-align:left;">Histórico</th>
                <th style="padding:8px;background:#105436;color:#fff;text-align:left;">Tipo</th>
                ${rows.length > 1 ? `<th style="padding:8px;background:#105436;color:#fff;text-align:left;">Conta</th>` : ""}
                <th style="padding:8px;background:#105436;color:#fff;text-align:right;">Valor</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(m => {
                const amt = Number(m._amount) || 0;
                const shown = kind === "resgate" || kind === "tarifas" ? Math.abs(amt) : amt;
                const color = amt < 0 ? "#b91c1c" : (m._kind === "rendimento" ? "#0369a1" : (m._kind === "tarifas" ? "#9a3412" : "#0f172a"));
                return `<tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:7px 8px;white-space:nowrap;">${this.esc(this.fmtDatePt(m.bankMovementDate))}</td>
                  <td style="padding:7px 8px;font-weight:700;color:#105436;">${this.esc(this.movNumber(m))}</td>
                  <td style="padding:7px 8px;">${this.esc(m.documentIdentification || m.documentNumber || m.document || "—")}</td>
                  <td style="padding:7px 8px;max-width:360px;">${this.esc(this.movHistoric(m))}</td>
                  <td style="padding:7px 8px;white-space:nowrap;">${this.esc(this.kindLabel(m._kind))}</td>
                  ${rows.length > 1 ? `<td style="padding:7px 8px;">${this.esc(m._accLabel || "")}</td>` : ""}
                  <td style="padding:7px 8px;text-align:right;font-weight:700;color:${color};font-variant-numeric:tabular-nums;">${this.fmt(shown)}</td>
                </tr>`;
              }).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="${rows.length > 1 ? 6 : 5}" style="padding:8px;font-weight:800;text-align:right;">Total (${list.length} lançamento${list.length === 1 ? "" : "s"})</td>
                <td style="padding:8px;text-align:right;font-weight:800;font-variant-numeric:tabular-nums;">${this.fmt(displayTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
      : `<div style="padding:28px;text-align:center;color:#64748b;">Nenhum lançamento neste recorte.</div>`;
    this.closeMovimentos();
    const overlay = document.createElement("div");
    overlay.id = "inv-mov-modal";
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:24px;";
    overlay.onclick = (e) => { if (e.target === overlay) this.closeMovimentos(); };
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:min(1100px,96vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.25);">
        <div style="padding:14px 16px;background:#105436;color:#fff;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-radius:12px 12px 0 0;">
          <div>
            <div style="font-size:1rem;font-weight:800;">${this.esc(this.kindLabel(kind))} · ${this.esc(periodLabel)}</div>
            <div style="font-size:0.78rem;opacity:.9;margin-top:3px;">${this.esc(titleAcc)}</div>
          </div>
          <button type="button" onclick="InvestimentoApp.closeMovimentos()" style="border:none;background:rgba(255,255,255,0.15);color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:1.2rem;line-height:1;">×</button>
        </div>
        <div style="padding:14px 16px 18px;">
          ${openingHint}
          ${body}
        </div>
      </div>`;
    document.body.appendChild(overlay);
  },

  companyAccounts(companyId, list) {
    return (list || this.accounts).filter(r => String(r.companyId) === String(companyId));
  },

  visibleAccounts() {
    const q = (this.accountQuery || "").toLowerCase().trim();
    const nq = this.normAcc(this.accountQuery);
    const want = new Set(this.selectedAccountKeys || []);
    return this.accounts.filter(r => {
      if (want.size && !want.has(r.key) && !want.has(this.accKey(r.companyId, r.accountNumber, r))) return false;
      if (!q) return true;
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
    const k = this.accounts.length ? this.visibleAccounts().reduce((acc, r) => {
      acc.opening += r.opening || 0;
      acc.aportes += r.aportes || 0;
      acc.resgates += r.resgates || 0;
      acc.rendimento += r.rendimento || 0;
      acc.tarifas += r.tarifas || 0;
      acc.closing += r.closing || 0;
      return acc;
    }, { opening: 0, aportes: 0, resgates: 0, rendimento: 0, tarifas: 0, closing: 0 }) : this.kpis;
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
              <input type="date" value="${this.startDate}" onchange="InvestimentoApp.setStartDate(this.value)"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Fim
              <input type="date" value="${this.endDate}" onchange="InvestimentoApp.setEndDate(this.value)"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            ${this.accountDropHtml()}
            <button class="btn btn-primary" onclick="InvestimentoApp.load()" style="height:34px;display:inline-flex;align-items:center;gap:8px;" ${this.loading ? "disabled" : ""}>
              ${this.loading
                ? `<span class="loading-spinner" style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span> Consultando...`
                : "Consultar"}
            </button>
            <button type="button" class="btn btn-outline" onclick="InvestimentoApp.exportExcel()" ${this.visibleAccounts().length ? "" : "disabled"}
              style="height:34px;display:inline-flex;align-items:center;gap:6px;">
              <i data-lucide="file-spreadsheet" style="width:14px;height:14px;"></i> Exportar Excel
            </button>
          </div>
          ${this.error ? `<div style="margin:12px 16px 0;padding:10px 12px;background:#fef2f2;color:#b91c1c;border-radius:8px;font-size:0.82rem;">${this.esc(this.error)}</div>` : ""}
          <div style="padding:12px 16px 0;display:flex;gap:10px;flex-wrap:wrap;">
            ${this.kpiCard("Saldo inicial", k.opening, "#0f172a")}
            ${this.kpiCard("Entradas", k.aportes, "#105436")}
            ${this.kpiCard("Saídas", Math.abs(k.resgates), "#b91c1c")}
            ${this.kpiCard("Imposto retido", Math.abs(k.tarifas), "#9a3412")}
            ${this.kpiCard("Rendimento", k.rendimento, "#0369a1")}
            ${this.kpiCard("Saldo acumulado", k.closing, "#0f172a")}
          </div>
          <div style="flex:1;overflow:auto;padding:12px 16px;">
            ${this.loading ? `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px 16px;color:var(--color-text-muted);">
              <div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(16,84,54,0.15);border-top-color:var(--color-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
              <span style="font-weight:500;">Carregando saldos e movimentos das contas de investimento...</span>
              <div style="font-size:0.82rem;color:#105436;font-weight:700;">${this.esc(this.loadingHint || "Consultando Sienge em partes menores...")}</div>
            </div>` : this.tableHtml()}
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
    if (this.accountDropOpen) {
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
    const clickTd = (n, kind, mk, source, opts) => {
      opts = opts || {};
      const abs = !!opts.abs;
      const bold = !!opts.bold;
      const v = abs ? Math.abs(Number(n) || 0) : (Number(n) || 0);
      const src = encodeURIComponent(source || "all");
      const k = encodeURIComponent(kind || "");
      const m = encodeURIComponent(mk || "");
      const tip = this.esc(opts.title || "Clique para ver os lançamentos");
      const color = abs
        ? (v ? "#b91c1c" : "#94a3b8")
        : (n < 0 ? "#b91c1c" : (n > 0 ? (opts.color || "#105436") : "#94a3b8"));
      return `<td onclick="event.stopPropagation();InvestimentoApp.openMovimentos('${src}','${k}','${m}')" title="${tip}"
        style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;color:${color};font-weight:${bold ? 800 : 600};white-space:nowrap;cursor:pointer;text-decoration:underline;text-decoration-color:#cbd5e1;text-underline-offset:2px;">${this.fmt(v)}</td>`;
    };
    const empty = `<td style="padding:6px 8px;text-align:right;color:#cbd5e1;">—</td>`;

    const groupRows = (label, sub, opening, monthFlow, isTotal, opts) => {
      opts = opts || {};
      const collapseKey = opts.collapseKey;
      const source = opts.source || "all";
      const collapsed = collapseKey && this.collapsedAccounts.has(collapseKey);
      const bgHead = isTotal ? "#ecfdf5" : "#f8fafc";
      const sticky = "position:sticky;left:0;z-index:1;";
      const chevron = collapseKey
        ? `<button type="button" onclick="InvestimentoApp.toggleAccountCollapse(decodeURIComponent('${encodeURIComponent(collapseKey)}'))" style="border:none;background:none;cursor:pointer;padding:0;color:#64748b;display:inline-flex;align-items:center;margin-right:4px;">
             <i data-lucide="${collapsed ? "chevron-right" : "chevron-down"}" style="width:14px;height:14px;"></i>
           </button>`
        : "";
      const labelCell = `
        <td rowspan="${collapsed ? 1 : 5}" style="padding:8px 10px;vertical-align:top;min-width:200px;max-width:280px;${sticky}background:${bgHead};border-right:1px solid #e2e8f0;">
          <div style="display:flex;align-items:flex-start;gap:2px;">
            ${chevron}
            <div>
              <div style="font-weight:800;color:#0f172a;font-size:0.82rem;">${this.esc(label)}</div>
              ${sub ? `<div style="font-size:0.7rem;color:#64748b;margin-top:2px;">${this.esc(sub)}</div>` : ""}
              ${!collapsed ? this.accountPeriodMetaHtml(monthFlow, source) : ""}
            </div>
          </div>
        </td>`;
      const saldos = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).closing || 0);
      if (collapsed) {
        return `<tr style="background:${bgHead};border-top:2px solid #e2e8f0;">
          ${labelCell}
          <td style="padding:6px 10px;font-weight:800;color:#0f172a;">Saldo</td>
          ${clickTd(opening, "opening", "", source, { bold: true })}
          ${saldos.map((n, i) => clickTd(n, "saldo", months[i], source, { bold: true })).join("")}
        </tr>`;
      }
      const entradas = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).aportes || 0);
      const saidas = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).resgates || 0);
      const impostos = months.map(mk => (monthFlow.find(f => f.month === mk) || {}).tarifas || 0);
      const rends = months.map(mk => monthFlow.find(f => f.month === mk) || { rendimento: 0, opening: 0, month: mk });
      return `
        <tr style="background:${bgHead};border-top:2px solid #e2e8f0;">
          ${labelCell}
          <td style="padding:6px 10px;font-weight:700;color:#105436;white-space:nowrap;">Entrada</td>
          ${empty}
          ${entradas.map((n, i) => clickTd(n, "aporte", months[i], source, { color: "#105436" })).join("")}
        </tr>
        <tr style="background:#fff;">
          <td style="padding:6px 10px;font-weight:700;color:#b91c1c;white-space:nowrap;">Saída</td>
          ${empty}
          ${saidas.map((n, i) => clickTd(n, "resgate", months[i], source, { abs: true })).join("")}
        </tr>
        <tr style="background:#fff;">
          <td style="padding:6px 10px;font-weight:700;color:#0369a1;white-space:nowrap;">Rendimento</td>
          ${empty}
          ${rends.map(f => clickTd(f.rendimento || 0, "rendimento", f.month, source, { color: "#0369a1", title: this.cdiTip(f.rendimento || 0, f.opening || 0, f.month) + " — clique para ver lançamentos" })).join("")}
        </tr>
        <tr style="background:#fff7ed;">
          <td style="padding:6px 10px;font-weight:700;color:#9a3412;white-space:nowrap;">Imposto retido</td>
          ${empty}
          ${impostos.map((n, i) => clickTd(n, "tarifas", months[i], source, { abs: true })).join("")}
        </tr>
        <tr style="background:${isTotal ? "#d1fae5" : "#f1f5f9"};">
          <td style="padding:6px 10px;font-weight:800;color:#0f172a;white-space:nowrap;">Saldo</td>
          ${clickTd(opening, "opening", "", source, { bold: true })}
          ${saldos.map((n, i) => clickTd(n, "saldo", months[i], source, { bold: true })).join("")}
        </tr>`;
    };

    const consolidado = groupRows("Consolidado", "Empresas selecionadas", visKpis.opening, visFlow, true, { source: "all" });
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
          body += groupRows("Total da empresa", this.companyName(cid), agg.opening, agg.months, true, { collapseKey: "co-" + cid, source: "co-" + cid });
          body += accs.map(r =>
            groupRows(r.accountNumber || r.accountName, r.accountName, r.opening, this.monthFlowOf(r), false, { collapseKey: r.key, source: r.key })
          ).join("");
        }
      });
    } else {
      body += accounts.map(r =>
        groupRows(r.accountNumber || r.accountName, `${r.accountName} · ${r.companyName}`, r.opening, this.monthFlowOf(r), false, { collapseKey: r.key, source: r.key })
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
            <span style="font-size:0.7rem;color:#64748b;">Clique em um valor para ver os lançamentos</span>
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
    const accounts = this.visibleAccounts();
    if (!accounts.length) {
      alert("Consulte o período antes de exportar.");
      return;
    }
    if (typeof XLSX === "undefined") {
      alert("Biblioteca de Excel não carregou. Recarregue a página.");
      return;
    }
    const months = this.months;
    const kpis = accounts.reduce((acc, r) => {
      acc.opening += r.opening || 0;
      acc.aportes += r.aportes || 0;
      acc.resgates += r.resgates || 0;
      acc.rendimento += r.rendimento || 0;
      acc.tarifas += r.tarifas || 0;
      acc.closing += r.closing || 0;
      return acc;
    }, { opening: 0, aportes: 0, resgates: 0, rendimento: 0, tarifas: 0, closing: 0 });
    const visAgg = this.aggregateFlow(accounts);
    const colCount = 3 + months.length;
    const border = {
      top: { style: "thin", color: { rgb: "D1E3D6" } },
      bottom: { style: "thin", color: { rgb: "D1E3D6" } },
      left: { style: "thin", color: { rgb: "D1E3D6" } },
      right: { style: "thin", color: { rgb: "D1E3D6" } }
    };
    const fill = (rgb) => ({ patternType: "solid", fgColor: { rgb } });
    const font = (opts) => Object.assign({ name: "Calibri", sz: 8, color: { rgb: "0F172A" } }, opts || {});
    const moneyFmt = "#,##0.00";
    const aoa = [];
    const merges = [];
    const styles = {};
    const mark = (r, c, s) => { styles[r + "|" + c] = s; };

    const pushRow = (cells) => {
      const row = [];
      for (let i = 0; i < colCount; i++) row.push(cells[i] == null ? "" : cells[i]);
      aoa.push(row);
      return aoa.length - 1;
    };

    const titleR = pushRow(["Kardex — conta × movimento\nsaldo inicial e meses"]);
    merges.push({ s: { r: titleR, c: 0 }, e: { r: titleR, c: colCount - 1 } });
    mark(titleR, 0, { font: font({ bold: true, sz: 14, color: { rgb: "FFFFFF" } }), fill: fill("105436"), alignment: { vertical: "center", wrapText: true } });

    const subR = pushRow([`Período ${this.startDate.split("-").reverse().join("/")} a ${this.endDate.split("-").reverse().join("/")}\nempresas geridas pelo grupo`]);
    merges.push({ s: { r: subR, c: 0 }, e: { r: subR, c: colCount - 1 } });
    mark(subR, 0, { font: font({ sz: 9, color: { rgb: "D1FAE5" } }), fill: fill("105436") });

    pushRow([]);
    const kpiLabelR = pushRow(["Saldo inicial", "Entradas", "Saídas", "Imposto retido", "Rendimento", "Saldo acumulado"]);
    const kpiValR = pushRow([kpis.opening, kpis.aportes, Math.abs(kpis.resgates), Math.abs(kpis.tarifas), kpis.rendimento, kpis.closing]);
    [
      { c: 0, color: "0F172A" },
      { c: 1, color: "105436" },
      { c: 2, color: "B91C1C" },
      { c: 3, color: "9A3412" },
      { c: 4, color: "0369A1" },
      { c: 5, color: "0F172A" }
    ].forEach(x => {
      mark(kpiLabelR, x.c, { font: font({ bold: true, sz: 8, color: { rgb: "64748B" } }), fill: fill("F8FAFC"), alignment: { horizontal: "center" } });
      mark(kpiValR, x.c, { font: font({ bold: true, sz: 12, color: { rgb: x.color } }), fill: fill("FFFFFF"), alignment: { horizontal: "right" }, numFmt: moneyFmt });
    });

    pushRow([]);
    const headR = pushRow(["Conta", "Movimento", "Saldo inicial", ...months.map(mk => this.monthLabel(mk))]);
    for (let c = 0; c < colCount; c++) {
      mark(headR, c, {
        font: font({ bold: true, sz: 8, color: { rgb: "FFFFFF" } }),
        fill: fill("105436"),
        alignment: { horizontal: c < 2 ? "left" : "right", vertical: "center" },
        border
      });
    }

    const moneyStyle = (n, extra) => Object.assign({
      font: font({
        bold: !!(extra && extra.bold),
        color: { rgb: n < 0 ? "B91C1C" : (extra && extra.color) || (n === 0 ? "94A3B8" : "0F172A") }
      }),
      fill: fill((extra && extra.bg) || "FFFFFF"),
      alignment: { horizontal: "right", vertical: "center" },
      border,
      numFmt: moneyFmt
    }, extra && extra.s || {});

    const labelStyle = (color, bg, bold) => ({
      font: font({ bold: !!bold, sz: 8, color: { rgb: color } }),
      fill: fill(bg),
      alignment: { vertical: "center", wrapText: true, horizontal: "left" },
      border
    });

    const wrapRows = new Set([titleR, subR]);
    const rowHeights = {};
    const setRowH = (r, hpt) => { rowHeights[r] = Math.max(rowHeights[r] || 0, hpt); };
    setRowH(titleR, 26);
    setRowH(subR, 22);
    setRowH(kpiLabelR, 14);
    setRowH(kpiValR, 18);
    const pushBlock = (label, sub, opening, monthFlow, kind) => {
      const find = mk => monthFlow.find(f => f.month === mk) || {};
      const entradas = months.map(mk => Number(find(mk).aportes) || 0);
      const saidas = months.map(mk => Math.abs(Number(find(mk).resgates) || 0));
      const rends = months.map(mk => Number(find(mk).rendimento) || 0);
      const impostos = months.map(mk => Math.abs(Number(find(mk).tarifas) || 0));
      const saldos = months.map(mk => Number(find(mk).closing) || 0);
      const isTotal = kind === "total";
      const headBg = isTotal ? "ECFDF5" : "F8FAFC";
      const saldoBg = isTotal ? "D1FAE5" : "F1F5F9";
      const contaTxt = this.excelAccountCell(label, sub, monthFlow);
      const r0 = pushRow([contaTxt, "Entrada", "", ...entradas]);
      wrapRows.add(r0);
      const r1 = pushRow(["", "Saída", "", ...saidas]);
      const r2 = pushRow(["", "Rendimento", "", ...rends]);
      const r3 = pushRow(["", "Imposto retido", "", ...impostos]);
      const r4 = pushRow(["", "Saldo", Number(opening) || 0, ...saldos]);
      const lines = String(contaTxt).split(/\n/).filter(Boolean).length;
      const mergeH = Math.max(80, lines * 11 + 10);
      const hEach = Math.max(16, Math.ceil(mergeH / 5));
      [r0, r1, r2, r3, r4].forEach(r => setRowH(r, hEach));
      merges.push({ s: { r: r0, c: 0 }, e: { r: r4, c: 0 } });
      mark(r0, 0, labelStyle("0F172A", headBg, true));
      mark(r0, 1, labelStyle("105436", headBg, true));
      mark(r1, 1, labelStyle("B91C1C", "FFFFFF", true));
      mark(r2, 1, labelStyle("0369A1", "FFFFFF", true));
      mark(r3, 1, labelStyle("9A3412", "FFF7ED", true));
      mark(r4, 1, labelStyle("0F172A", saldoBg, true));
      mark(r0, 2, moneyStyle(0, { bg: headBg, color: "CBD5E1" }));
      mark(r1, 2, moneyStyle(0, { color: "CBD5E1" }));
      mark(r2, 2, moneyStyle(0, { color: "CBD5E1" }));
      mark(r3, 2, moneyStyle(0, { bg: "FFF7ED", color: "CBD5E1" }));
      mark(r4, 2, moneyStyle(opening, { bold: true, bg: saldoBg }));
      months.forEach((_, i) => {
        mark(r0, 3 + i, moneyStyle(entradas[i], { bg: headBg }));
        mark(r1, 3 + i, moneyStyle(saidas[i], { color: saidas[i] ? "B91C1C" : "94A3B8" }));
        mark(r2, 3 + i, moneyStyle(rends[i], { color: "0369A1" }));
        mark(r3, 3 + i, moneyStyle(impostos[i], { bg: "FFF7ED", color: impostos[i] ? "9A3412" : "94A3B8" }));
        mark(r4, 3 + i, moneyStyle(saldos[i], { bold: true, bg: saldoBg }));
      });
    };

    const pushCompanyBar = (text) => {
      const r = pushRow([text]);
      wrapRows.add(r);
      merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
      mark(r, 0, { font: font({ bold: true, sz: 8, color: { rgb: "FFFFFF" } }), fill: fill("0F766E"), alignment: { vertical: "center", wrapText: true } });
      setRowH(r, Math.max(20, String(text).split(/\n/).length * 12 + 6));
    };

    pushBlock("Consolidado", "Empresas selecionadas", visAgg.opening, visAgg.months, "total");
    if (this.groupByCompany && this.selectedCompanyIds.length > 1) {
      const ids = [...new Set(accounts.map(a => String(a.companyId)))];
      ids.sort((a, b) => this.companyName(a).localeCompare(this.companyName(b), "pt-BR"));
      ids.forEach(cid => {
        const accs = this.companyAccounts(cid, accounts);
        if (!accs.length) return;
        const agg = this.aggregateFlow(accs);
        pushCompanyBar(this.companyName(cid) + "\n" + accs.length + " conta(s)");
        pushBlock("Total da empresa", this.companyName(cid), agg.opening, agg.months, "total");
        accs.forEach(r => pushBlock(r.accountNumber || r.accountName, r.accountName, r.opening, this.monthFlowOf(r), "acc"));
      });
    } else {
      accounts.forEach(r => pushBlock(r.accountNumber || r.accountName, `${r.accountName}\n${r.companyName}`, r.opening, this.monthFlowOf(r), "acc"));
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"] = [{ wch: 36 }, { wch: 14 }, { wch: 14 }, ...months.map(() => ({ wch: 13 }))];
    ws["!rows"] = aoa.map((_, i) => {
      if (rowHeights[i] != null) return { hpt: rowHeights[i] };
      if (i === titleR) return { hpt: 26 };
      if (wrapRows.has(i)) return { hpt: 22 };
      return { hpt: 16 };
    });
    Object.keys(styles).forEach(key => {
      const [r, c] = key.split("|").map(Number);
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      const st = styles[key];
      ws[addr].s = st;
      if (st.numFmt && typeof ws[addr].v === "number") {
        ws[addr].t = "n";
        ws[addr].z = st.numFmt;
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kardex");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `investimento_kardex_${stamp}.xlsx`);
  }
};

window.InvestimentoApp = InvestimentoApp;
