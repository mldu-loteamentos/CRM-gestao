function caixaAddDays(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + Number(n || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function caixaDiaUtil(iso, passo) {
  let d = String(iso || "").slice(0, 10);
  for (let i = 0; i < 15; i++) {
    const util = typeof window.isBusinessDayIso === "function"
      ? window.isBusinessDayIso(d)
      : [0, 6].indexOf(new Date(d + "T12:00:00").getDay()) < 0;
    if (util) return d;
    d = caixaAddDays(d, passo || 1);
  }
  return d;
}

function caixaMoney(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function caixaEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function caixaBalance(b) {
  if (!b) return null;
  const list = [b.amount, b.balance, b.balanceAmount, b.currentBalance, b.lastBalance, b.lastBalanceAmount, b.availableAmount, b.availableBalance, b.value];
  for (let i = 0; i < list.length; i++) {
    if (list[i] == null || list[i] === "") continue;
    const n = Number(String(list[i]).replace(/\./g, "").replace(",", "."));
    const raw = Number(list[i]);
    if (Number.isFinite(raw)) return raw;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function caixaFormaPagamento(billId, parcela) {
  if (typeof window.siengeFetchWithRetry !== "function") return null;
  const id = parcela || 1;
  const kinds = ["bank-transfer", "pix", "boleto-bancario", "boleto-concessionaria"];
  for (let i = 0; i < kinds.length; i++) {
    try {
      const data = await window.siengeFetchWithRetry(
        "/bills/" + encodeURIComponent(billId) + "/installments/" + encodeURIComponent(id) + "/payment-information/" + kinds[i],
        1
      );
      if (data && typeof data === "object") return { kind: kinds[i], data: data };
    } catch (e) {}
  }
  return null;
}

function caixaFormaHtml(payment, item) {
  if (payment && payment.data) {
    const d = payment.data;
    if (payment.kind === "pix") {
      return `<p><strong>Forma:</strong> PIX</p><p>${caixaEsc(d.notes || "Chave do credor")}</p>`;
    }
    if (payment.kind === "boleto-bancario" || payment.kind === "boleto-concessionaria") {
      return `<p><strong>Forma:</strong> ${payment.kind === "boleto-concessionaria" ? "Boleto de concessionária" : "Boleto"}</p><p>${caixaEsc(d.notes || d.digitableNumber || d.barCode || "")}</p>`;
    }
    const banco = [d.beneficiaryBankCode, d.beneficiaryBankName].filter(Boolean).join(" — ");
    const ag = [d.beneficiaryBankBranchNumber, d.beneficiaryBankBranchDigit].filter(Boolean).join("-");
    const conta = [d.beneficiaryAccountNumber, d.beneficiaryAccountDigit].filter(Boolean).join("-");
    const tipo = d.beneficiaryAccountType === "P" ? "Poupança" : "Conta corrente";
    return `<p><strong>Forma:</strong> Transferência</p>
      <p><strong>Banco:</strong> ${caixaEsc(banco || "—")}</p>
      <p><strong>Agência:</strong> ${caixaEsc(ag || "—")}</p>
      <p><strong>${caixaEsc(tipo)}:</strong> ${caixaEsc(conta || "—")}</p>
      <p><strong>Favorecido:</strong> ${caixaEsc(d.beneficiaryName || "—")}</p>
      ${d.notes ? `<pre style="white-space:pre-wrap;font-family:inherit;margin:8px 0 0;">${caixaEsc(d.notes)}</pre>` : ""}`;
  }
  if (item && (item.tipoBaixa || item.conta || item.operacao)) {
    return `<p><strong>Programação na consulta:</strong> ${caixaEsc([item.tipoBaixa, item.operacao, item.conta].filter(Boolean).join(" · "))}</p>`;
  }
  return `<p>O pagamento ainda não está programado neste título.</p>`;
}

function caixaFmtDate(iso) {
  if (!iso) return "—";
  const p = String(iso).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}

function caixaSlim(u, date) {
  const present = u.presentDebitBalance != null ? Number(u.presentDebitBalance) : Number(u.outstandingBalance || 0);
  return {
    d: date,
    uid: String(u.id || ""),
    un: u.name || "",
    cc: String(u.enterpriseId || ""),
    cn: u.enterpriseName || "",
    cid: u.customerId != null ? String(u.customerId) : "",
    cpf: String(u.customerDoc || "").replace(/\D/g, ""),
    nome: u.customerName || "",
    rec: Number(u.receivedAmount) || 0,
    ven: Number(u.kpiVencidas) || 0,
    av: Number(u.kpiAVencer) || 0,
    vp: Number.isFinite(present) ? present : 0,
    pmp: Number(u.pmp3m) || 0,
    st: u.relFin || (u.quitado ? "quitado" : ""),
    parc: Array.isArray(u.openParcelas) ? u.openParcelas.slice(0, 18) : []
  };
}

const CaixaPosicaoStore = {
  FB: "caixa_posicao",
  CHUNK: 120,

  fbReady() {
    return !!(window.firebaseDb && window.firebaseCollections);
  },

  async loadEstoqueUnits() {
    if (window.EstoqueComercialApp) {
      if (!EstoqueComercialApp.state.units.length) await EstoqueComercialApp.init();
      if (EstoqueComercialApp.state.units.length) return EstoqueComercialApp.state.units;
    }
    if (!this.fbReady()) return [];
    const { collection, getDocs } = window.firebaseCollections;
    const snap = await getDocs(collection(window.firebaseDb, "estoque_comercial"));
    const units = [];
    snap.forEach((d) => {
      if (d.id === "_meta" || d.id === "_batimento_state") return;
      const data = d.data() || {};
      if (Array.isArray(data.units)) units.push(...data.units);
    });
    return units;
  },

  async saveFromUnits(units, date) {
    if (!this.fbReady()) throw new Error("Firebase indisponível.");
    const { doc, setDoc } = window.firebaseCollections;
    const rows = (units || [])
      .filter((u) => {
        const code = String(u.commercialStock || "").toUpperCase();
        return code === "V" || code === "O" || u.contractId || u.contractNumber;
      })
      .map((u) => caixaSlim(u, date));
    const nChunks = Math.max(1, Math.ceil(rows.length / this.CHUNK) || 1);
    const writes = [];
    for (let c = 0; c < nChunks; c++) {
      writes.push(setDoc(doc(window.firebaseDb, this.FB, `${date}_${c}`), {
        date, chunk: c, rows: rows.slice(c * this.CHUNK, (c + 1) * this.CHUNK), updatedAt: new Date().toISOString()
      }));
    }
    writes.push(setDoc(doc(window.firebaseDb, this.FB, "_meta"), {
      lastDate: date, chunks: nChunks, count: rows.length, updatedAt: new Date().toISOString()
    }, { merge: true }));
    await Promise.all(writes);
    return rows;
  },

  async loadDate(date) {
    if (!this.fbReady() || !date) return [];
    const { collection, getDocs } = window.firebaseCollections;
    const snap = await getDocs(collection(window.firebaseDb, this.FB));
    const rows = [];
    snap.forEach((d) => {
      if (d.id === "_meta") return;
      const data = d.data() || {};
      if (String(data.date) === String(date) && Array.isArray(data.rows)) rows.push(...data.rows);
    });
    return rows;
  },

  async listDates() {
    if (!this.fbReady()) return [];
    const { collection, getDocs } = window.firebaseCollections;
    const snap = await getDocs(collection(window.firebaseDb, this.FB));
    const set = new Set();
    snap.forEach((d) => {
      if (d.id === "_meta") return;
      const data = d.data() || {};
      if (data.date) set.add(String(data.date));
    });
    return [...set].sort().reverse();
  }
};

const FluxoCaixaDiarioApp = {
  month: "",
  loading: false,
  error: "",
  days: [],
  openDay: "",
  totals: { saldo: 0, entrar: 0, pagar: 0 },
  companyIds: [],
  companies: [],
  openEmp: false,
  qEmp: "",
  openCc: false,
  qCc: "",
  accounts: [],
  openingDate: "",
  recItems: [],
  movs: [],
  payItems: [],
  progress: "",
  detail: null,
  detOpen: { in: true, out: true },
  flags: {},
  tipos: {},
  ccExcl: {},
  _flagsLoaded: false,
  _types: {},
  _banks: {},
  _custom: null,
  _gen: 0,

  init() {
    if (!this.month) {
      const n = new Date();
      this.month = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
    }
    this.render();
    this.load();
  },

  hoje() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  },

  monthBounds() {
    const [y, m] = String(this.month || "").split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
      start: `${this.month}-01`,
      end: `${this.month}-${String(last).padStart(2, "0")}`,
      last
    };
  },

  companyWanted(id) {
    if (!this.companyIds.length) return true;
    return this.companyIds.indexOf(String(id || "")) >= 0;
  },

  companyKey() {
    return String(this.companyIds[0] || "");
  },

  async ensureCompanies() {
    if (this.companies.length) return;
    const local = (window.AppState && AppState.companies) || [];
    if (local.length) {
      this.companies = local.map((c) => ({ id: String(c.id), name: c.name || c.tradeName || "" }));
      return;
    }
    if (window.SiengeApiService && typeof SiengeApiService.getCompanies === "function") {
      try {
        const list = await SiengeApiService.getCompanies(false);
        const rows = Array.isArray(list) ? list : ((list && list.results) || []);
        this.companies = rows.map((c) => ({ id: String(c.id), name: c.name || c.tradeName || "" }));
      } catch (e) {
        this.companies = [];
      }
    }
  },

  async ensureCcCompany() {
    if (this._ccCompany) return;
    const map = {};
    const all = [];
    let list = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    if (!list.length && window.SiengeApiService && typeof SiengeApiService.getCostCenters === "function") {
      try { list = await SiengeApiService.getCostCenters(); } catch (e) { list = []; }
    }
    (list || []).forEach((c) => {
      const id = String(c.id || "");
      const co = c.companyId || c.idCompany || (c.company && c.company.id);
      if (id && co != null && co !== "") map[id] = String(co);
      if (id) all.push({ id, name: String(c.name || c.description || "").trim(), companyId: co != null ? String(co) : "" });
    });
    this._ccCompany = map;
    this._ccAll = all;
  },

  ensureCompany() {
    const ids = this.companies.map((c) => String(c.id));
    if (this.companyIds.length === 1 && ids.indexOf(this.companyIds[0]) >= 0) return;
    let saved = "";
    try { saved = localStorage.getItem("cxd_company") || ""; } catch (e) {}
    const sorted = ids.slice().sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    const pick = ids.indexOf(saved) >= 0 ? saved : (sorted[0] || "");
    this.companyIds = pick ? [pick] : [];
  },

  normNum(v) {
    return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
  },

  async loadFlags() {
    if (this._flagsLoaded) return;
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || typeof fx.getDoc !== "function") return;
    try {
      const snap = await fx.getDoc(fx.doc(db, "caixa_diario_config", "saldo_inicial"));
      const data = snap.exists() ? (snap.data() || {}) : {};
      this.flags = data.contas || {};
      this.tipos = data.tipos || {};
      this.ccExcl = data.empreendimentosExcluidos || {};
      this._flagsLoaded = true;
    } catch (e) {
      console.warn("[Caixa diário] configuração do caixa", e);
    }
  },

  async saveConfig(patch, erroMsg) {
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || typeof fx.setDoc !== "function") {
      alert("O Firebase não está disponível. A alteração vale só nesta consulta.");
      return;
    }
    const user = (window.AppState && AppState.currentUser) || {};
    try {
      await fx.setDoc(fx.doc(db, "caixa_diario_config", "saldo_inicial"), Object.assign({}, patch, {
        updatedAt: new Date().toISOString(),
        updatedBy: user.name || user.email || ""
      }), { merge: true });
    } catch (e) {
      console.error("[Caixa diário] gravar configuração", e);
      alert(erroMsg || "Não consegui gravar a alteração no Firebase.");
    }
  },

  readCustom() {
    let custom = {};
    try {
      const raw = localStorage.getItem("crm_centros_custo_custom") || "{}";
      custom = (typeof window.parseCentrosCustoCustomMap === "function")
        ? window.parseCentrosCustoCustomMap(raw)
        : (JSON.parse(raw) || {});
    } catch (e) {
      custom = {};
    }
    if (window.CentrosCustoState && CentrosCustoState.customFields && Object.keys(CentrosCustoState.customFields).length) {
      custom = Object.assign({}, custom, CentrosCustoState.customFields);
    }
    return custom || {};
  },

  excludedCcs() {
    return new Set((this.ccExcl[this.companyKey()] || []).map(String));
  },

  ccItems() {
    return (this._ccAll || [])
      .filter((c) => this.companyWanted(c.companyId))
      .map((c) => ({ id: c.id, name: c.name.toUpperCase(), label: c.id + " - " + c.name.toUpperCase() }));
  },

  ccIncluidos() {
    const excl = this.excludedCcs();
    return this.ccItems().map((c) => c.id).filter((id) => !excl.has(id));
  },

  /** Conta de parceria (cadastro do centro de custo) dos empreendimentos fora do caixa. */
  contasBloqueadas() {
    const custom = this._custom || {};
    const set = new Set();
    this.excludedCcs().forEach((id) => {
      const cp = custom[id] && custom[id].conta_parceria;
      if (cp && cp.numero) set.add(this.normNum(cp.numero));
    });
    return set;
  },

  async setCcExcl(ids) {
    const co = this.companyKey();
    this.ccExcl[co] = ids.map(String);
    this.rebuild();
    this.render();
    await this.saveConfig({ empreendimentosExcluidos: { [co]: this.ccExcl[co] } }, "Não consegui gravar os empreendimentos no Firebase.");
  },

  accountKey(a) {
    return String(a.companyId || "") + "|" + String(a.number || a.name || "").trim().toUpperCase();
  },

  accountBlocked(a) {
    return (this._bloq || this.contasBloqueadas()).has(this.normNum(a.number));
  },

  accountIncluded(a) {
    return !this.accountBlocked(a) && this.flags[this.accountKey(a)] !== false;
  },

  saldoBase(a) {
    return Number(this.openingDate ? a.opening : a.amount) || 0;
  },

  recalcSaldo() {
    this.totals.saldo = (this.accounts || [])
      .filter((a) => this.accountIncluded(a))
      .reduce((s, a) => s + this.saldoBase(a), 0);
  },

  async setFlag(key, on) {
    this.flags[key] = !!on;
    this.rebuild();
    this.render();
    await this.saveConfig({ contas: { [key]: !!on } }, "Não consegui gravar a marcação da conta no Firebase.");
  },

  async setTipo(key, tipo) {
    this.tipos[key] = tipo;
    this.accounts.forEach((a) => { if (this.accountKey(a) === key) a.tipo = tipo; });
    this.render();
    await this.saveConfig({ tipos: { [key]: tipo } }, "Não consegui gravar o tipo da conta no Firebase.");
  },

  async loadAccountTypes(companyId) {
    const id = String(companyId || "");
    if (!id) return {};
    if (this._types[id]) return this._types[id];
    const map = {};
    const banks = {};
    if (window.SiengeApiService && typeof SiengeApiService.getCheckingAccounts === "function") {
      try {
        const res = await SiengeApiService.getCheckingAccounts(id, { allStatuses: true });
        ((res && res.results) || []).forEach((raw) => {
          const type = raw && raw.accountType;
          const typeId = String((type && typeof type === "object" ? type.id : raw.accountTypeId) || "").trim().toUpperCase();
          const desc = String((type && typeof type === "object" ? (type.description || type.name) : type) || raw.accountKind || "")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
          const invest = typeId === "I" || typeId === "A" || raw.investment === true || raw.isInvestment === true || /INVEST|APLIC|POUP/.test(desc);
          [raw.accountNumber, raw.number, raw.accountName, raw.name].forEach((k) => {
            const key = this.normNum(k);
            if (key && !map[key]) map[key] = invest ? "investimento" : "corrente";
          });
          const num = this.normNum(raw.accountNumber || raw.number);
          if (num && window.RelacionamentoApp && typeof RelacionamentoApp._bancoDaConta === "function") {
            const info = RelacionamentoApp._bancoDaConta(raw);
            if (info && info.bancoLabel) banks[num] = info;
          }
        });
      } catch (e) {
        console.warn("[Caixa diário] tipos de conta", id, e);
      }
    }
    this._types[id] = map;
    this._banks[id] = banks;
    return map;
  },

  accountTipo(types, number, name) {
    const sienge = types[this.normNum(number)] || types[this.normNum(name)] || "";
    if (sienge === "investimento") return sienge;
    const txt = String(number + " " + name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (/CDB|APLIC|INVEST|FUNDO|^FI[-\s]|\bFI\b|RENDA FIXA|\bRF\b|\bLCI\b|\bLCA\b|\bRDB\b|COMPROMISS|POUP/.test(txt)) return "investimento";
    return sienge || "corrente";
  },

  bankInfo(companyId, number) {
    const cad = window.RelacionamentoApp && typeof RelacionamentoApp._contaCadastrada === "function"
      ? RelacionamentoApp._contaCadastrada(number, companyId) : null;
    if (cad && cad.bancoLabel) return { bancoLabel: cad.bancoLabel, agencia: cad.agencia || "" };
    return (this._banks[String(companyId || "")] || {})[this.normNum(number)] || { bancoLabel: "", agencia: "" };
  },

  companyName(id) {
    const hit = this.companies.find((c) => String(c.id) === String(id));
    return hit ? hit.name : (id ? ("Empresa " + id) : "");
  },

  empItems() {
    return this.companies.map((c) => ({
      id: String(c.id),
      name: String(c.name || "").toUpperCase(),
      label: c.id + " - " + String(c.name || "").toUpperCase()
    }));
  },

  paintProgress() {
    const el = document.getElementById("cxd-progress");
    if (!el) return;
    el.textContent = this.progress || "";
    el.hidden = !this.progress;
  },

  async load() {
    const gen = (this._gen || 0) + 1;
    this._gen = gen;
    this.loading = true;
    this.error = "";
    this.days = [];
    this.accounts = [];
    this.recItems = [];
    this.movs = [];
    this.payItems = [];
    this.openingDate = "";
    this.progress = "Lendo as previsões de recebimento…";
    this.render();
    try {
      await this.ensureCompanies();
      this.ensureCompany();
      await this.ensureCcCompany();
      await this.loadFlags();
      this._custom = this.readCustom();
      if (this._gen !== gen) return;
      const b = this.monthBounds();
      const hoje = this.hoje();
      if (b.end >= hoje) {
        const units = await CaixaPosicaoStore.loadEstoqueUnits();
        if (this._gen !== gen) return;
        this.recItems = this.previsoesRecebimento(units, b, hoje);
      }
      this.loading = false;
      this.rebuild();
      this.render();
      await this.loadBalances(gen, b, hoje);
      if (this._gen !== gen) return;
      if (b.start < hoje) await this.loadActuals(gen, b, hoje);
      if (this._gen !== gen) return;
      if (b.end >= hoje) await this.loadPayables(gen, b, hoje);
      if (this._gen !== gen) return;
      this.progress = "";
      this.render();
    } catch (e) {
      if (this._gen !== gen) return;
      this.error = e.message || String(e);
      this.loading = false;
      this.progress = "";
      this.render();
    }
  },

  previsoesRecebimento(units, b, hoje) {
    const out = [];
    (units || []).forEach((u) => {
      if (u.quitado || u.relFin === "quitado") return;
      const companyId = this._ccCompany[String(u.enterpriseId || "")] || "";
      if (!this.companyWanted(companyId)) return;
      const pmp = Number(u.pmp3m) || 0;
      (Array.isArray(u.openParcelas) ? u.openParcelas : []).forEach((p) => {
        if (!p || !p.due || p.overdue) return;
        const bruto = caixaAddDays(p.due, pmp);
        const prev = caixaDiaUtil(bruto);
        if (prev < b.start || prev > b.end || prev < hoje) return;
        out.push({
          date: prev,
          deslocadoDe: prev !== bruto ? bruto : "",
          valor: Number(p.val) || 0,
          unidade: u.name || "",
          cc: String(u.enterpriseId || ""),
          cliente: u.customerName || "",
          cpf: u.customerDoc || "",
          vencimento: p.due,
          pmp,
          customerId: u.customerId != null ? String(u.customerId) : "",
          billId: u.receivableBillId != null ? String(u.receivableBillId) : ""
        });
      });
    });
    return out;
  },

  async loadBalances(gen, b, hoje) {
    this.progress = "Lendo o saldo das contas…";
    this.paintProgress();
    const abertura = caixaAddDays(b.start, -1);
    const usaAbertura = b.start <= hoje;
    const ler = async (date) => {
      if (!window.SiengeApiService || typeof SiengeApiService.getAccountBalances !== "function") return [];
      const out = [];
      if (this.companyIds.length) {
        const parts = await Promise.all(this.companyIds.map((id) => SiengeApiService.getAccountBalances(date, { companyId: id })));
        parts.forEach((list) => { if (Array.isArray(list)) out.push.apply(out, list); });
      } else {
        const list = await SiengeApiService.getAccountBalances(date);
        if (Array.isArray(list)) out.push.apply(out, list);
      }
      return out;
    };
    const [rowsHoje, rowsIni] = await Promise.all([ler(hoje), usaAbertura ? ler(abertura) : Promise.resolve([])]);
    if (this._gen !== gen) return;
    const typesByCo = {};
    for (const id of this.companyIds) typesByCo[id] = await this.loadAccountTypes(id);
    if (this._gen !== gen) return;
    const byKey = {};
    const put = (row, campo, limite) => {
      const companyId = String(row.companyId || row.company || "");
      if (!this.companyWanted(companyId)) return;
      const number = String(row.accountNumber || row.number || "").trim();
      const amount = caixaBalance(row);
      if (amount == null) return;
      const dt = String(row.balanceDate || "").slice(0, 10);
      if (dt && dt > limite) return;
      const name = row.accountName || row.name || number || "Conta";
      const key = this.accountKey({ companyId, number: number || name });
      const acc = byKey[key] || (byKey[key] = { companyId, company: this.companyName(companyId), number, name, amount: 0, opening: 0, _dt: {} });
      if (acc._dt[campo] && dt && dt < acc._dt[campo]) return;
      acc._dt[campo] = dt || acc._dt[campo] || "";
      acc[campo] = amount;
    };
    rowsHoje.forEach((r) => put(r, "amount", hoje));
    rowsIni.forEach((r) => put(r, "opening", abertura));
    const accounts = Object.values(byKey);
    for (const acc of accounts) {
      if (!typesByCo[acc.companyId]) typesByCo[acc.companyId] = await this.loadAccountTypes(acc.companyId);
      const key = this.accountKey(acc);
      acc.tipo = this.tipos[key] || this.accountTipo(typesByCo[acc.companyId] || {}, acc.number, acc.name);
      const bank = this.bankInfo(acc.companyId, acc.number);
      acc.banco = bank.bancoLabel || "";
      acc.agencia = bank.agencia || "";
      delete acc._dt;
    }
    if (this._gen !== gen) return;
    accounts.sort((a, b2) => String(a.companyId).localeCompare(String(b2.companyId), "pt") || String(a.name).localeCompare(String(b2.name), "pt", { numeric: true }));
    this.accounts = accounts;
    this.openingDate = usaAbertura ? abertura : "";
    this.rebuild();
    this.render();
  },

  normMov(m, i) {
    const txt = (v) => (v == null || typeof v === "object") ? "" : String(v).trim();
    const cats = Array.isArray(m.financialCategories) ? m.financialCategories : [];
    const pesos = cats.map((fc) => {
      const r = Number(fc && fc.financialCategoryRate);
      return { cc: txt(fc && fc.costCenterId), peso: Number.isFinite(r) && r > 0 ? r : 0 };
    });
    const soma = pesos.reduce((s, p) => s + p.peso, 0);
    const shares = pesos.map((p) => ({ cc: p.cc, share: soma > 0 ? p.peso / soma : 1 / pesos.length }));
    return {
      id: "m" + i,
      date: txt(m.bankMovementDate).slice(0, 10),
      valor: Number(m.bankMovementAmount) || 0,
      conta: txt(m.accountNumber),
      companyId: txt(m.companyId),
      shares,
      billId: txt(m.billId || m.billPayableId || m.billReceivableId || m.payableBillId || m.receivableBillId || m.titleId),
      parcela: txt(m.installmentId || m.installmentNumber || m.installment),
      clientId: txt(m.clientId || m.customerId),
      party: txt(m.creditorName) || txt(m.creditor) || txt(m.clientName) || txt(m.customerName) || txt(m.client),
      doc: [txt(m.documentIdentificationId || m.documentId), txt(m.documentIdentificationNumber || m.documentNumber)].filter(Boolean).join(" "),
      historico: txt(m.historic) || txt(m.history) || txt(m.bankMovementHistoricName) || txt(m.bankMovementOperationName) || txt(m.documentIdentificationName) || txt(m.observations),
      plano: cats.map((fc) => txt(fc && fc.financialCategoryName)).filter(Boolean)[0] || "",
      ccNome: cats.map((fc) => txt(fc && fc.costCenterName)).filter(Boolean)[0] || ""
    };
  },

  async loadActuals(gen, b, hoje) {
    const ontem = caixaAddDays(hoje, -1);
    const fim = ontem < b.end ? ontem : b.end;
    if (fim < b.start || !window.SiengeApiService || typeof SiengeApiService.getBankMovements !== "function") return;
    this.progress = "Lendo o que entrou e saiu das contas nos dias anteriores…";
    this.paintProgress();
    try {
      const targets = this.companyIds.length ? this.companyIds.slice() : [""];
      const list = [];
      for (const co of targets) {
        const part = await SiengeApiService.getBankMovements(b.start, fim, co ? { companyId: co } : {});
        if (this._gen !== gen) return;
        if (Array.isArray(part)) list.push.apply(list, part);
      }
      this.movs = list.map((m, i) => this.normMov(m, i))
        .filter((m) => m.date && Math.abs(m.valor) >= 0.005 && (!m.companyId || this.companyWanted(m.companyId)));
    } catch (e) {
      console.warn("[Caixa diário] movimentos bancários", e);
      this.error = "Não consegui ler os movimentos bancários dos dias anteriores: " + ((e && e.message) || e);
    }
    if (this._gen !== gen) return;
    this.rebuild();
    this.render();
  },

  /** Folha, distribuição, aportes e tributos federais são pagos no dia útil anterior; os demais, no seguinte. */
  pagaAntes(r) {
    const SEM_DESLOCAR = /^(FPAG|DIST|APOR|PIS|COFINS|IRPJ|CSLL)$/;
    const cod = String((r && r.docId) || "").trim().toUpperCase();
    const nome = String((r && r.docNome) || "").trim().toUpperCase().split(/[\s-]+/)[0];
    return SEM_DESLOCAR.test(cod) || SEM_DESLOCAR.test(nome);
  },

  async loadPayables(gen, b, hoje) {
    const app = window.ComprasControleApp || window.ComprasPrevisoesApp;
    if (!app || typeof app.outcomeRange !== "function" || typeof app.transform !== "function") {
      this.error = this.error || "O módulo de compras não está disponível para ler os títulos a pagar.";
      this.render();
      return;
    }
    const inicio = hoje > b.start ? hoje : b.start;
    // Títulos de fim de semana/feriado nas bordas do período podem entrar nele ao irem para o dia útil.
    const buscaIni = caixaAddDays(inicio, -4);
    const buscaFim = caixaAddDays(b.end, 4);
    const prevNote = app.noteProgress;
    app.noteProgress = (text) => {
      this.progress = text;
      this.paintProgress();
    };
    let rows = [];
    try {
      const targets = this.companyIds.length ? this.companyIds.slice() : [""];
      const bills = [];
      for (let i = 0; i < targets.length; i++) {
        if (this._gen !== gen) return;
        this.progress = "Buscando contas a pagar · " + (i + 1) + " de " + targets.length;
        this.paintProgress();
        const part = await app.outcomeRange(buscaIni, buscaFim, targets[i]);
        if (Array.isArray(part)) bills.push.apply(bills, part);
      }
      rows = app.transform({ data: bills }) || [];
    } finally {
      app.noteProgress = prevNote;
    }
    if (this._gen !== gen) return;
    const seen = {};
    const pay = [];
    rows.forEach((r) => {
      if (!r || r.pago || r.substituido) return;
      if (r.natureza !== "programado" && r.natureza !== "previsao") return;
      const due = String(r.vencimento || "").slice(0, 10);
      if (!due) return;
      let pagamento = caixaDiaUtil(due, this.pagaAntes(r) ? -1 : 1);
      // Antecipado para um dia que já passou, mas ainda em aberto: entra no primeiro dia do período.
      if (pagamento < inicio && due >= inicio) pagamento = inicio;
      if (pagamento < inicio || pagamento > b.end) return;
      if (!this.companyWanted(r.companyId)) return;
      const key = r.titulo + "|" + (r.parcela || "") + "|" + due;
      if (seen[key]) return;
      seen[key] = true;
      const saldo = Number(r.saldo);
      const valor = Number.isFinite(saldo) && saldo > 0 ? saldo : (Number(r.valor) || 0);
      if (!(valor > 0)) return;
      pay.push({
        key,
        date: pagamento,
        vencimento: due,
        deslocadoDe: pagamento !== due ? due : "",
        valor,
        titulo: r.titulo,
        parcela: r.parcela || "",
        credor: r.credor || "",
        documento: r.documento || "",
        docId: r.docId || "",
        docNome: r.docNome || "",
        companyId: r.companyId || "",
        plano: r.plano || "",
        ccId: r.ccId || "",
        ccNome: r.ccNome || "",
        natureza: r.natureza,
        tipoBaixa: r.tipoBaixa || "",
        conta: r.conta || "",
        operacao: r.operacao || ""
      });
    });
    this.payItems = pay;
    this.rebuild();
    this.render();
  },

  /** Dias anteriores: extrato das contas ligadas. Hoje em diante: previsões. */
  rebuild() {
    const hoje = this.hoje();
    const b = this.monthBounds();
    this._bloq = this.contasBloqueadas();
    const excl = this.excludedCcs();
    const accByKey = {};
    (this.accounts || []).forEach((a) => { accByKey[this.accountKey(a)] = a; });
    const days = [];
    const byDay = {};
    for (let d = 1; d <= b.last; d++) {
      const iso = `${this.month}-${String(d).padStart(2, "0")}`;
      const day = { date: iso, real: iso < hoje, entrar: 0, pagar: 0, itens: [], pagarItens: [] };
      days.push(day);
      byDay[iso] = day;
    }
    this.recItems.forEach((it) => {
      const day = byDay[it.date];
      if (!day || day.real || excl.has(String(it.cc))) return;
      day.entrar += it.valor;
      day.itens.push(it);
    });
    this.movs.forEach((m) => {
      const day = byDay[m.date];
      if (!day || !day.real) return;
      if (m.conta) {
        const key = this.accountKey({ companyId: m.companyId, number: m.conta });
        const acc = accByKey[key];
        const ok = acc ? this.accountIncluded(acc) : (!this._bloq.has(this.normNum(m.conta)) && this.flags[key] !== false);
        if (!ok) return;
      }
      const fora = m.shares.reduce((s, x) => s + (excl.has(x.cc) ? x.share : 0), 0);
      const v = m.valor * (1 - fora);
      if (Math.abs(v) < 0.005) return;
      if (v > 0) {
        day.entrar += v;
        day.itens.push(Object.assign({}, m, { real: true, valor: v }));
      } else {
        day.pagar += -v;
        day.pagarItens.push({
          key: m.id, real: true, natureza: "pago", date: m.date, valor: -v,
          titulo: m.billId, parcela: m.parcela, credor: m.party, documento: m.doc, historico: m.historico,
          conta: m.conta, companyId: m.companyId, plano: m.plano, ccNome: m.ccNome
        });
      }
    });
    this.payItems.forEach((p) => {
      const day = byDay[p.date];
      if (!day || day.real) return;
      day.pagar += p.valor;
      day.pagarItens.push(p);
    });
    this.days = days;
    this.totals.entrar = days.reduce((s, x) => s + x.entrar, 0);
    this.totals.pagar = days.reduce((s, x) => s + x.pagar, 0);
    this.recalcSaldo();
  },

  toggle(iso) {
    this.openDay = this.openDay === iso ? "" : iso;
    this.render();
    const det = this.openDay && document.querySelector("#fluxo-caixa-diario-root .cxd-daydet");
    if (det) det.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },

  toggleGrupo(tipo) {
    this.detOpen[tipo] = !this.detOpen[tipo];
    this.render();
  },

  openEntrada(date, idx) {
    const day = this.days.find((d) => d.date === date);
    const it = day && day.itens[idx];
    if (!it) return;
    const customerId = it.customerId || it.clientId;
    if (!customerId || !it.billId || typeof window.visualizarExtratoDireto !== "function") {
      alert("Este recebimento não está ligado a um cliente e a um título no Sienge, então não há extrato para abrir.");
      return;
    }
    const btn = document.createElement("button");
    btn.dataset.customerId = customerId;
    btn.dataset.title = it.billId;
    btn.dataset.name = it.cliente || it.party || "Cliente";
    btn.dataset.unit = it.unidade ? (it.cc + " - " + it.unidade) : "";
    btn.dataset.cc = it.cc || (it.shares && it.shares[0] && it.shares[0].cc) || "";
    const msg = "Abrindo o extrato do cliente…";
    this.progress = msg;
    this.paintProgress();
    setTimeout(() => {
      if (this.progress !== msg) return;
      this.progress = "";
      this.paintProgress();
    }, 6000);
    window.visualizarExtratoDireto(btn);
  },

  bindCompanyFilter() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    MlEmpresaFilter.bind("cxd-emp", {
      toggleOpen() {
        self.openEmp = !self.openEmp;
        if (self.openEmp) self.openCc = false;
        self.render();
      },
      setQuery(q) {
        self.qEmp = q || "";
        const box = document.getElementById("cxd-emp-list");
        if (box && window.MlEmpresaFilter) {
          box.innerHTML = MlEmpresaFilter.listHtml({
            id: "cxd-emp",
            items: self.empItems(),
            selectedIds: self.companyIds,
            query: self.qEmp,
            single: true
          });
        }
      },
      toggleId(id, on) {
        if (!on) return;
        const sid = String(id);
        self.companyIds = [sid];
        try { localStorage.setItem("cxd_company", sid); } catch (e) {}
        self.openEmp = false;
        self.qEmp = "";
        self.openDay = "";
        self.load();
      },
      selectAll() {},
      selectNone() {}
    });
    const nouns = { singular: "empreendimento", plural: "empreendimentos", none: "Nenhum empreendimento" };
    MlEmpresaFilter.bind("cxd-cc", {
      toggleOpen() {
        self.openCc = !self.openCc;
        if (self.openCc) self.openEmp = false;
        self.render();
      },
      setQuery(q) {
        self.qCc = q || "";
        const box = document.getElementById("cxd-cc-list");
        if (box && window.MlEmpresaFilter) {
          box.innerHTML = MlEmpresaFilter.listHtml({ id: "cxd-cc", items: self.ccItems(), selectedIds: self.ccIncluidos(), query: self.qCc, nouns });
        }
      },
      toggleId(id, on) {
        const excl = self.excludedCcs();
        if (on) excl.delete(String(id));
        else excl.add(String(id));
        self.setCcExcl([...excl]);
      },
      selectAll() { self.setCcExcl([]); },
      selectNone() { self.setCcExcl(self.ccItems().map((c) => c.id)); }
    });
  },

  async openTitulo(key) {
    let item = null;
    this.days.some((d) => {
      item = (d.pagarItens || []).find((p) => p.key === key) || null;
      return !!item;
    });
    if (!item || !item.titulo) return;
    this.detail = { loading: true, error: "", item, bill: null, attachments: [], payment: null };
    this.render();
    try {
      const billId = item.titulo;
      const bill = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(billId), 1);
      let attachments = [];
      if (window.ComprasPrevisoesApp && typeof ComprasPrevisoesApp.anexosDoTitulo === "function") {
        try { attachments = await ComprasPrevisoesApp.anexosDoTitulo(billId); } catch (e) { attachments = []; }
      }
      const payment = await caixaFormaPagamento(billId, item.parcela || 1);
      if (!this.detail || this.detail.item.key !== key) return;
      this.detail.loading = false;
      this.detail.bill = bill || null;
      this.detail.attachments = attachments;
      this.detail.payment = payment;
      this.render();
    } catch (e) {
      if (!this.detail || this.detail.item.key !== key) return;
      this.detail.loading = false;
      this.detail.error = (e && e.message) ? e.message : "Não consegui abrir o título.";
      this.render();
    }
  },

  closeTitulo() {
    this.detail = null;
    this.render();
  },

  async baixarAnexo(billId, attachmentId, name) {
    const base = (window.SIENGE_CONFIG && window.SIENGE_CONFIG.baseUrl) || "/api/sienge-proxy";
    const path = "/bills/" + encodeURIComponent(billId) + "/attachments/" + encodeURIComponent(attachmentId);
    const headers = {};
    if (typeof getBasicAuthHeader === "function") headers.Authorization = getBasicAuthHeader();
    try {
      const res = await fetch(base + path, { headers });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name || ("titulo-" + billId + ".pdf");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      alert("Não foi possível baixar o anexo deste título.");
    }
  },

  detailHtml() {
    const det = this.detail;
    if (!det) return "";
    const item = det.item || {};
    const bill = det.bill || {};
    const pago = item.natureza === "pago";
    const credor = bill.creditorName || item.credor || "—";
    const doc = [item.docId || bill.documentIdentificationId, item.documento || bill.documentNumber].filter(Boolean).join(" ");
    const anexos = (det.attachments || []).map((a) => `
      <button type="button" class="btn btn-outline btn-sm" style="height:32px;" onclick="FluxoCaixaDiarioApp.baixarAnexo('${caixaEsc(item.titulo)}','${caixaEsc(a.id)}','${caixaEsc(a.name || "anexo.pdf")}')">${caixaEsc(a.description || a.name || "Anexo")}</button>
    `).join("");
    const situacao = pago ? "Pago" : (item.natureza === "previsao" ? "Previsão" : "Programado");
    return `<div style="position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)FluxoCaixaDiarioApp.closeTitulo()">
      <div style="background:#fff;border-radius:12px;width:min(720px,96vw);max-height:86vh;overflow:auto;padding:18px 20px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <h3 style="margin:0;color:#105436;">Título ${caixaEsc(item.titulo)}${item.parcela ? " · parcela " + caixaEsc(item.parcela) : ""}</h3>
          <button type="button" class="btn btn-cancel btn-sm" onclick="FluxoCaixaDiarioApp.closeTitulo()">Fechar</button>
        </div>
        ${det.loading ? `<p style="color:#64748b;">Abrindo título, anexos e forma de pagamento…</p>` : ""}
        ${det.error ? `<p style="color:#b91c1c;">${caixaEsc(det.error)}</p>` : ""}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-top:12px;font-size:0.86rem;">
          <div><span style="color:#64748b;">Credor</span><div style="font-weight:700;">${caixaEsc(credor)}</div></div>
          <div><span style="color:#64748b;">Documento</span><div style="font-weight:700;">${caixaEsc(doc || "—")}</div></div>
          <div><span style="color:#64748b;">Empresa</span><div>${caixaEsc(this.companyName(item.companyId) || item.companyId || "—")}</div></div>
          <div><span style="color:#64748b;">${pago ? "Pagamento" : "Vencimento"}</span><div>${caixaFmtDate(pago ? item.date : (item.vencimento || item.date))}${item.deslocadoDe ? ` <span style="color:#64748b;font-size:.78rem;">(pagamento ${item.date < item.deslocadoDe ? "antecipado" : "no próximo dia útil"}, ${caixaFmtDate(item.date)})</span>` : ""}</div></div>
          <div><span style="color:#64748b;">${pago ? "Valor pago" : "Valor a pagar"}</span><div style="font-weight:700;color:#c2410c;">${caixaMoney(item.valor)}</div></div>
          <div><span style="color:#64748b;">Situação</span><div>${situacao}</div></div>
          <div><span style="color:#64748b;">Centro de custo</span><div>${caixaEsc(item.ccNome || "—")}</div></div>
          <div><span style="color:#64748b;">Plano financeiro</span><div>${caixaEsc(item.plano || "—")}</div></div>
        </div>
        ${bill.notes ? `<p style="margin:12px 0 0;font-size:0.84rem;"><strong>Observação:</strong> ${caixaEsc(bill.notes)}</p>` : ""}
        <h4 style="margin:16px 0 6px;color:#105436;font-size:0.92rem;">Forma de pagamento</h4>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:0.86rem;">${det.loading ? "" : caixaFormaHtml(det.payment, item)}</div>
        <h4 style="margin:16px 0 6px;color:#105436;font-size:0.92rem;">Anexos</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${anexos || `<span style="color:#64748b;font-size:0.84rem;">Este título não tem anexo.</span>`}</div>
      </div>
    </div>`;
  },

  contasComSaldo() {
    const tipos = [
      { id: "corrente", name: "Conta corrente", rows: [], total: 0, marcado: 0, ligadas: 0 },
      { id: "investimento", name: "Investimento", rows: [], total: 0, marcado: 0, ligadas: 0 }
    ];
    (this.accounts || []).forEach((a) => {
      if (!a || (Math.abs(Number(a.amount) || 0) < 0.005 && Math.abs(Number(a.opening) || 0) < 0.005)) return;
      const g = a.tipo === "investimento" ? tipos[1] : tipos[0];
      const v = this.saldoBase(a);
      g.rows.push(a);
      g.total += v;
      if (this.accountIncluded(a)) {
        g.marcado += v;
        g.ligadas++;
      }
    });
    return tipos.filter((g) => g.rows.length);
  },

  contaTag(companyId, conta) {
    const bank = this.bankInfo(companyId, conta);
    return `<span class="cxd-conta-tag">C/C ${caixaEsc(conta)}${bank.bancoLabel ? " · " + caixaEsc(bank.bancoLabel) : ""}</span>`;
  },

  contasHtml() {
    const grupos = this.contasComSaldo();
    if (!grupos.length) {
      return `<div class="cxd-vazio">${this.loading || this.progress ? "Lendo as contas…" : "Nenhuma conta com saldo disponível."}</div>`;
    }
    const ini = this.openingDate;
    const sinal = (v) => (v < 0 ? "cxd-out" : "cxd-in");
    return `<div class="cxd-contas-grid">${grupos.map((g) => {
      const linhas = g.rows.map((a) => {
        const key = this.accountKey(a);
        const keyJs = encodeURIComponent(key).replace(/'/g, "%27");
        const bloq = this.accountBlocked(a);
        const on = this.accountIncluded(a);
        const outro = g.id === "investimento" ? "corrente" : "investimento";
        const titulo = bloq ? "Conta de parceria de um empreendimento fora do caixa" : (on ? "Considerada no saldo inicial" : "Fora do saldo inicial");
        return `<tr class="${on ? "" : "cxd-off"}">
          <td class="cxd-flag">
            <label class="moura-switch" title="${titulo}">
              <input type="checkbox" ${on ? "checked" : ""} ${bloq ? "disabled" : ""} onchange="FluxoCaixaDiarioApp.setFlag(decodeURIComponent('${keyJs}'), this.checked)">
              <span class="moura-switch-track" aria-hidden="true"></span>
            </label>
          </td>
          <td class="cxd-conta">
            <div>${caixaEsc(a.name || a.number || "Conta")}</div>
            ${a.number && a.number !== a.name ? `<small>${caixaEsc(a.number)}</small>` : ""}
            ${bloq ? `<span class="cxd-bloq">empreendimento fora do caixa</span>` : ""}
          </td>
          <td class="cxd-banco">${a.banco ? caixaEsc(a.banco) : `<span class="cxd-zero">—</span>`}${a.agencia ? `<small>Agência ${caixaEsc(a.agencia)}</small>` : ""}</td>
          ${ini ? `<td class="cxd-num ${sinal(a.opening)}">${caixaMoney(a.opening)}</td>` : ""}
          <td class="cxd-num ${sinal(a.amount)}">${caixaMoney(a.amount)}</td>
          <td class="cxd-mover">
            <button type="button" title="Mover para ${outro === "investimento" ? "Investimento" : "Conta corrente"}" onclick="FluxoCaixaDiarioApp.setTipo(decodeURIComponent('${keyJs}'),'${outro}')">
              <i data-lucide="arrow-left-right" style="width:14px;height:14px;"></i>
            </button>
          </td>
        </tr>`;
      }).join("");
      return `<div class="cxd-gbox cxd-gbox-${g.id}">
        <div class="cxd-gbox-head">
          <i data-lucide="${g.id === "investimento" ? "trending-up" : "landmark"}" style="width:15px;height:15px;"></i>
          <span>${caixaEsc(g.name)}</span>
          <small>${g.rows.length} conta(s) · ${g.ligadas} no caixa</small>
          <strong>${caixaMoney(g.marcado)}</strong>
        </div>
        <div class="cxd-gbox-body">
          <table class="cxd-contas">
            <thead><tr>
              <th title="Considerar no saldo inicial">Caixa</th><th>Conta</th><th>Banco</th>
              ${ini ? `<th>Saldo ${caixaFmtDate(ini).slice(0, 5)}</th>` : ""}<th>Saldo hoje</th><th></th>
            </tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      </div>`;
    }).join("")}</div>`;
  },

  diaDetalheHtml(aberto) {
    const d = aberto.d;
    const entradas = (d.itens || []).map((it, i) => {
      const clicavel = !!((it.customerId || it.clientId) && it.billId);
      const desc = it.real
        ? `${caixaEsc(it.party || it.historico || "Crédito em conta")}${it.billId ? " · tít. " + caixaEsc(it.billId) + (it.parcela ? "/" + caixaEsc(it.parcela) : "") : ""}${it.party && it.historico ? " · " + caixaEsc(it.historico) : ""}${it.conta ? this.contaTag(it.companyId, it.conta) : ""}`
        : `${caixaEsc(it.cc)} / ${caixaEsc(it.unidade)} · ${caixaEsc(it.cliente || "—")}${it.cpf ? " · CPF " + caixaEsc(it.cpf) : ""} · venc. ${caixaFmtDate(it.vencimento)} + PMP ${it.pmp}d${it.deslocadoDe ? ` · caía em ${caixaFmtDate(it.deslocadoDe)}, passou para o próximo dia útil` : ""}`;
      return `<tr class="cxd-det-in${clicavel ? " cxd-click" : ""}" ${clicavel ? `onclick="FluxoCaixaDiarioApp.openEntrada('${d.date}',${i})" title="Ver o extrato do cliente"` : ""}>
        <td>${it.real ? "Recebido" : "Previsto"}</td>
        <td>${desc}</td>
        <td class="cxd-num">${caixaMoney(it.valor)}</td>
      </tr>`;
    }).join("");
    const saidas = (d.pagarItens || []).map((it) => {
      const clicavel = !!it.titulo;
      const tipo = it.real ? "Pago" : (it.natureza === "previsao" ? "Previsão" : "Programado");
      const desc = it.real
        ? `${caixaEsc(it.credor || it.historico || "Débito em conta")}${it.titulo ? " · tít. " + caixaEsc(it.titulo) + (it.parcela ? "/" + caixaEsc(it.parcela) : "") : ""}${it.documento ? " · " + caixaEsc(it.documento) : ""}${it.conta ? this.contaTag(it.companyId, it.conta) : ""}`
        : `tít. ${caixaEsc(it.titulo)}${it.parcela ? "/" + caixaEsc(it.parcela) : ""} · ${caixaEsc(it.credor || "—")}${(it.docId || it.documento) ? " · " + caixaEsc([it.docId, it.documento].filter(Boolean).join(" ")) : ""}${it.deslocadoDe ? ` · vencia em ${caixaFmtDate(it.deslocadoDe)}, ${it.date < it.deslocadoDe ? "antecipado para o dia útil anterior" : "passou para o próximo dia útil"}` : ""}`;
      return `<tr class="cxd-det-out${clicavel ? " cxd-click" : ""}" ${clicavel ? `onclick="FluxoCaixaDiarioApp.openTitulo('${caixaEsc(it.key)}')" title="Ver o título, os anexos e a forma de pagamento"` : ""}>
        <td>${tipo}</td>
        <td>${desc}</td>
        <td class="cxd-num">${caixaMoney(it.valor)}</td>
      </tr>`;
    }).join("");
    const grupo = (tipo, titulo, qtd, total, linhas, vazio) => {
      const open = this.detOpen[tipo] !== false;
      return `<div class="cxd-grp cxd-grp-${tipo}">
        <button type="button" class="cxd-grp-head" onclick="FluxoCaixaDiarioApp.toggleGrupo('${tipo}')">
          <i data-lucide="${open ? "chevron-down" : "chevron-right"}" style="width:16px;height:16px;"></i>
          <strong>${titulo}</strong>
          <span>${qtd} lançamento(s)</span>
          <b>${caixaMoney(total)}</b>
        </button>
        ${open ? `<table class="cxd-sheet"><tbody>${linhas || `<tr><td colspan="3" class="cxd-grp-vazio">${vazio}</td></tr>`}</tbody></table>` : ""}
      </div>`;
    };
    return `<div class="cxd-daydet">
      <div class="cxd-daydet-head">
        <strong>${caixaFmtDate(d.date)}</strong>
        <span class="cxd-chip ${d.real ? "cxd-chip-real" : "cxd-chip-prev"}">${d.real ? "Realizado · extrato bancário" : "Previsto"}</span>
        <span class="cxd-daydet-res">Saldo do dia <b class="${aberto.movimento < 0 ? "cxd-out" : "cxd-in"}">${caixaMoney(aberto.movimento)}</b></span>
        <button type="button" class="btn btn-cancel btn-sm" onclick="FluxoCaixaDiarioApp.toggle('${d.date}')">Fechar</button>
      </div>
      ${grupo("in", "Entradas", (d.itens || []).length, aberto.entrar, entradas, "Nenhuma entrada neste dia.")}
      ${grupo("out", "Saídas", (d.pagarItens || []).length, aberto.sair, saidas, "Nenhuma saída neste dia.")}
    </div>`;
  },

  render() {
    const root = document.getElementById("fluxo-caixa-diario-root");
    if (!root) return;
    const hoje = this.hoje();
    const saldoInicial = Number(this.totals.saldo) || 0;
    let acumulado = saldoInicial;
    const linhas = (this.days || []).map((d) => {
      const entrar = Number(d.entrar) || 0;
      const sair = Number(d.pagar) || 0;
      const movimento = entrar - sair;
      const inicial = acumulado;
      acumulado = inicial + movimento;
      return { d, entrar, sair, movimento, inicial, acum: acumulado, passado: d.real };
    });
    const fim = acumulado;
    const prevWrap = root.querySelector(".cxd-wrap-mx");
    const prevScroll = prevWrap && prevWrap.scrollLeft > 0 ? prevWrap.scrollLeft : null;
    const prevBody = root.querySelector(".cxd-body");
    const prevTop = prevBody ? prevBody.scrollTop : 0;
    const prevContas = Array.from(root.querySelectorAll(".cxd-gbox-body")).map((el) => el.scrollTop);
    const totEntrar = Number(this.totals.entrar) || 0;
    const totSair = Number(this.totals.pagar) || 0;
    const semana = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const colCls = (line) => {
      const c = [];
      if (line.d.date === hoje) c.push("cxd-col-hoje");
      if (this.openDay === line.d.date) c.push("cxd-col-open");
      if (line.passado) c.push("cxd-col-past");
      return c.join(" ");
    };
    const cell = (line, html, cls) => `<td class="${colCls(line)} ${cls || ""}" onclick="FluxoCaixaDiarioApp.toggle('${line.d.date}')">${html}</td>`;
    const cabecalho = linhas.map((line) => {
      const d = line.d;
      const has = (d.itens && d.itens.length) || (d.pagarItens && d.pagarItens.length);
      const wd = semana[new Date(d.date + "T12:00:00").getDay()];
      return `<th class="${colCls(line)}" onclick="FluxoCaixaDiarioApp.toggle('${d.date}')" title="${d.real ? "Realizado (extrato bancário)" : "Previsto"}${has ? " · clique para ver entradas e saídas" : ""}">
        <div>${caixaFmtDate(d.date).slice(0, 5)}</div>
        <div class="cxd-wd">${d.date === hoje ? '<span class="cxd-tag">hoje</span>' : wd}${has ? '<span class="cxd-dot"></span>' : ""}</div>
      </th>`;
    }).join("");
    const sinal = (v) => (v < 0 ? "cxd-out" : (v > 0 ? "cxd-in" : "cxd-zero"));
    const linhaInicial = linhas.map((l) => cell(l, caixaMoney(l.inicial), sinal(l.inicial))).join("");
    const linhaEntradas = linhas.map((l) => cell(l, caixaMoney(l.entrar), l.entrar ? "cxd-in" : "cxd-zero")).join("");
    const linhaSaidas = linhas.map((l) => cell(l, caixaMoney(l.sair), l.sair ? "cxd-out" : "cxd-zero")).join("");
    const linhaDia = linhas.map((l) => cell(l, caixaMoney(l.movimento), sinal(l.movimento))).join("");
    const linhaAcum = linhas.map((l) => cell(l, caixaMoney(l.acum), sinal(l.acum))).join("");
    const aberto = linhas.find((l) => l.d.date === this.openDay);
    const detalheDia = aberto ? this.diaDetalheHtml(aberto) : "";
    const filtro = window.MlEmpresaFilter ? MlEmpresaFilter.html({
      id: "cxd-emp",
      label: "EMPRESA",
      items: this.empItems(),
      selectedIds: this.companyIds,
      open: this.openEmp,
      query: this.qEmp,
      emptyMeansAll: false,
      single: true
    }) : "";
    const filtroCc = window.MlEmpresaFilter ? MlEmpresaFilter.html({
      id: "cxd-cc",
      label: "EMPREENDIMENTOS NO CAIXA",
      items: this.ccItems(),
      selectedIds: this.ccIncluidos(),
      open: this.openCc,
      query: this.qCc,
      countMode: true,
      nouns: { singular: "empreendimento", plural: "empreendimentos", none: "Nenhum empreendimento" }
    }) : "";
    const b = this.monthBounds();
    const iniLabel = this.openingDate
      ? `Saldo inicial · contas ligadas em ${caixaFmtDate(this.openingDate)}`
      : (b.start > hoje ? "Saldo inicial · mês futuro, parte do saldo de hoje" : "Saldo inicial · contas ligadas");
    const qtdFora = this.excludedCcs().size;
    root.innerHTML = `
      <style>
        #fluxo-caixa-diario-root { color:#0f172a; }
        #fluxo-caixa-diario-root .cxd-page { display:flex; flex-direction:column; height:calc(100vh - 85px); }
        #fluxo-caixa-diario-root .cxd-head { background:#105436; padding:16px 20px; border-radius:12px 12px 0 0; }
        #fluxo-caixa-diario-root .cxd-head h2 { margin:0; color:#fff; font-size:1.15rem; }
        #fluxo-caixa-diario-root .cxd-head p { margin:4px 0 0; color:rgba(255,255,255,.8); font-size:.75rem; }
        #fluxo-caixa-diario-root .cxd-body { flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:14px 16px; overflow:auto; }
        #fluxo-caixa-diario-root .cxd-tools { display:flex; gap:12px; align-items:flex-end; margin-bottom:12px; flex-wrap:wrap; }
        #fluxo-caixa-diario-root .cxd-tools label { font-size:.75rem; font-weight:700; color:#475569; }
        #fluxo-caixa-diario-root .cxd-tools input[type=month] { display:block; height:34px; border:1px solid #e2e8f0; border-radius:6px; padding:0 8px; margin-top:4px; }
        #fluxo-caixa-diario-root .cxd-fora { font-size:.74rem; color:#9a3412; background:#ffedd5; border-radius:999px; padding:3px 10px; font-weight:600; align-self:center; }
        #fluxo-caixa-diario-root .cxd-sheet { width:100%; border-collapse:collapse; background:#fff; font-size:.82rem; font-variant-numeric:tabular-nums; }
        #fluxo-caixa-diario-root .cxd-sheet td { padding:7px 10px; border-bottom:1px solid #eef2f6; }
        #fluxo-caixa-diario-root .cxd-num { text-align:right; white-space:nowrap; }
        #fluxo-caixa-diario-root .cxd-in { color:#105436; }
        #fluxo-caixa-diario-root .cxd-out { color:#c2410c; }
        #fluxo-caixa-diario-root .cxd-zero { color:#94a3b8; }
        #fluxo-caixa-diario-root .cxd-tag { margin-left:8px; background:#105436; color:#fff; border-radius:999px; padding:1px 7px; font-size:.66rem; font-weight:700; }
        #fluxo-caixa-diario-root .cxd-wrap { border:1px solid #e2e8f0; border-radius:8px; overflow:auto; background:#fff; margin-bottom:14px; }
        #fluxo-caixa-diario-root .cxd-title { margin:0 0 6px; font-size:.78rem; font-weight:700; color:#105436; letter-spacing:.03em; }
        #fluxo-caixa-diario-root .cxd-title span { font-weight:500; color:#64748b; letter-spacing:0; }
        #fluxo-caixa-diario-root .cxd-vazio { padding:16px; color:#64748b; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:10px; font-size:.84rem; }
        #fluxo-caixa-diario-root .cxd-contas-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(520px, 1fr)); gap:12px; margin-bottom:10px; align-items:start; }
        #fluxo-caixa-diario-root .cxd-gbox { background:#fff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
        #fluxo-caixa-diario-root .cxd-gbox-head { display:flex; align-items:center; gap:8px; padding:9px 12px; background:#e7f6ee; color:#105436; font-weight:700; font-size:.84rem; }
        #fluxo-caixa-diario-root .cxd-gbox-investimento .cxd-gbox-head { background:#fff7ed; color:#9a3412; }
        #fluxo-caixa-diario-root .cxd-gbox-head small { flex:1; font-weight:500; font-size:.74rem; opacity:.85; }
        #fluxo-caixa-diario-root .cxd-gbox-head strong { font-variant-numeric:tabular-nums; }
        #fluxo-caixa-diario-root .cxd-gbox-body { max-height:250px; overflow:auto; }
        #fluxo-caixa-diario-root .cxd-contas { width:100%; border-collapse:collapse; font-size:.8rem; font-variant-numeric:tabular-nums; }
        #fluxo-caixa-diario-root .cxd-contas th { background:#f1f5f9; color:#475569; font-weight:700; font-size:.72rem; text-align:left; padding:6px 10px; position:sticky; top:0; z-index:1; white-space:nowrap; }
        #fluxo-caixa-diario-root .cxd-contas th.cxd-r, #fluxo-caixa-diario-root .cxd-contas th:nth-last-child(2), #fluxo-caixa-diario-root .cxd-contas th:nth-last-child(3) { text-align:right; }
        #fluxo-caixa-diario-root .cxd-contas th:nth-child(2), #fluxo-caixa-diario-root .cxd-contas th:nth-child(3) { text-align:left; }
        #fluxo-caixa-diario-root .cxd-contas td { padding:6px 10px; border-bottom:1px solid #eef2f6; vertical-align:middle; }
        #fluxo-caixa-diario-root .cxd-contas td.cxd-flag { width:56px; padding:4px 6px 4px 12px; }
        #fluxo-caixa-diario-root .cxd-conta small, #fluxo-caixa-diario-root .cxd-banco small { display:block; font-size:.7rem; color:#64748b; }
        #fluxo-caixa-diario-root .cxd-banco { white-space:nowrap; }
        #fluxo-caixa-diario-root .cxd-bloq { display:inline-block; margin-top:2px; font-size:.64rem; font-weight:700; color:#9a3412; background:#ffedd5; border-radius:999px; padding:1px 7px; }
        #fluxo-caixa-diario-root .cxd-contas tr.cxd-off td.cxd-conta,
        #fluxo-caixa-diario-root .cxd-contas tr.cxd-off td.cxd-banco,
        #fluxo-caixa-diario-root .cxd-contas tr.cxd-off td.cxd-num { opacity:.45; }
        #fluxo-caixa-diario-root .cxd-mover { width:34px; text-align:right; }
        #fluxo-caixa-diario-root .cxd-mover button { border:0; background:transparent; color:#94a3b8; cursor:pointer; padding:4px; border-radius:6px; display:inline-flex; }
        #fluxo-caixa-diario-root .cxd-mover button:hover { color:#105436; background:#f1f5f9; }
        #fluxo-caixa-diario-root .cxd-saldo-ini { display:flex; justify-content:space-between; align-items:center; background:#0c3d28; color:#fff; font-weight:700; padding:9px 14px; border-radius:8px; margin-bottom:16px; font-size:.84rem; font-variant-numeric:tabular-nums; }
        #fluxo-caixa-diario-root .cxd-wrap-mx { width:0; min-width:100%; }
        #fluxo-caixa-diario-root .cxd-mx { border-collapse:separate; border-spacing:0; background:#fff; font-size:.8rem; font-variant-numeric:tabular-nums; }
        #fluxo-caixa-diario-root .cxd-mx th, #fluxo-caixa-diario-root .cxd-mx td { padding:7px 10px; text-align:right; white-space:nowrap; border-bottom:1px solid #e2e8f0; min-width:108px; }
        #fluxo-caixa-diario-root .cxd-mx th { background:#105436; color:#fff; font-weight:600; position:sticky; top:0; z-index:2; cursor:pointer; vertical-align:top; }
        #fluxo-caixa-diario-root .cxd-mx td { cursor:pointer; }
        #fluxo-caixa-diario-root .cxd-mx .cxd-lbl { position:sticky; left:0; z-index:1; background:#fff; text-align:left; font-weight:700; color:#0f172a; min-width:150px; border-right:1px solid #e2e8f0; cursor:default; }
        #fluxo-caixa-diario-root .cxd-mx th.cxd-lbl { z-index:3; background:#105436; color:#fff; }
        #fluxo-caixa-diario-root .cxd-mx .cxd-wd { font-size:.68rem; font-weight:500; opacity:.85; margin-top:2px; display:flex; justify-content:flex-end; align-items:center; gap:5px; }
        #fluxo-caixa-diario-root .cxd-mx .cxd-wd .cxd-tag { margin-left:0; background:#fff; color:#105436; }
        #fluxo-caixa-diario-root .cxd-dot { width:6px; height:6px; border-radius:50%; background:#f37021; display:inline-block; }
        #fluxo-caixa-diario-root .cxd-mx th.cxd-col-past { background:#2f5d48; }
        #fluxo-caixa-diario-root .cxd-mx th.cxd-col-hoje { background:#0c3d28; }
        #fluxo-caixa-diario-root .cxd-mx td.cxd-col-hoje { background:#e7f6ee; }
        #fluxo-caixa-diario-root .cxd-mx th.cxd-col-open { background:#f37021; }
        #fluxo-caixa-diario-root .cxd-mx td.cxd-col-open { background:#fff4ec; }
        #fluxo-caixa-diario-root .cxd-mx td.cxd-col-past { background:#fafafa; }
        #fluxo-caixa-diario-root .cxd-mx td:not(.cxd-lbl):hover { background:#f1f5f9; }
        #fluxo-caixa-diario-root .cxd-mx .cxd-col-tot { background:#f1f5f9; font-weight:800; border-left:1px solid #cbd5e1; cursor:default; }
        #fluxo-caixa-diario-root .cxd-mx th.cxd-col-tot { background:#0c3d28; }
        #fluxo-caixa-diario-root .cxd-mx tr.cxd-row-acum td { font-weight:800; border-top:2px solid #105436; }
        #fluxo-caixa-diario-root .cxd-mx tr.cxd-row-dia td { font-weight:700; }
        #fluxo-caixa-diario-root .cxd-daydet { border:1px solid #e2e8f0; border-radius:8px; background:#fff; margin-bottom:14px; overflow:hidden; }
        #fluxo-caixa-diario-root .cxd-daydet-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 12px; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
        #fluxo-caixa-diario-root .cxd-daydet-head strong { color:#0f172a; font-size:.92rem; }
        #fluxo-caixa-diario-root .cxd-daydet-res { flex:1; text-align:right; color:#475569; font-size:.82rem; }
        #fluxo-caixa-diario-root .cxd-chip { font-size:.7rem; font-weight:700; border-radius:999px; padding:2px 9px; }
        #fluxo-caixa-diario-root .cxd-chip-real { background:#e2e8f0; color:#334155; }
        #fluxo-caixa-diario-root .cxd-chip-prev { background:#e7f6ee; color:#105436; }
        #fluxo-caixa-diario-root .cxd-grp-head { width:100%; display:flex; align-items:center; gap:10px; border:0; padding:9px 12px; cursor:pointer; font-size:.84rem; text-align:left; font-family:inherit; }
        #fluxo-caixa-diario-root .cxd-grp-head span { flex:1; font-weight:500; opacity:.85; font-size:.78rem; }
        #fluxo-caixa-diario-root .cxd-grp-head b { font-variant-numeric:tabular-nums; }
        #fluxo-caixa-diario-root .cxd-grp-in .cxd-grp-head { background:#e7f6ee; color:#105436; border-left:4px solid #105436; }
        #fluxo-caixa-diario-root .cxd-grp-out .cxd-grp-head { background:#fff4ec; color:#c2410c; border-left:4px solid #f37021; }
        #fluxo-caixa-diario-root .cxd-grp-in td { background:#f7fcf9; color:#105436; }
        #fluxo-caixa-diario-root .cxd-grp-out td { background:#fffaf6; color:#9a3412; }
        #fluxo-caixa-diario-root .cxd-grp td:first-child { width:96px; font-weight:700; font-size:.76rem; }
        #fluxo-caixa-diario-root .cxd-grp td { font-size:.78rem; }
        #fluxo-caixa-diario-root .cxd-grp-vazio { color:#94a3b8 !important; padding:12px !important; }
        #fluxo-caixa-diario-root tr.cxd-click { cursor:pointer; }
        #fluxo-caixa-diario-root tr.cxd-det-in.cxd-click:hover td { background:#e7f6ee; }
        #fluxo-caixa-diario-root tr.cxd-det-out.cxd-click:hover td { background:#ffedd5; }
        #fluxo-caixa-diario-root .cxd-conta-tag { margin-left:6px; font-size:.7rem; color:#64748b; }
      </style>
      <div class="cxd-page">
        <div class="cxd-head">
          <h2>Fluxo de caixa diário</h2>
          <p>Saldo inicial no 1º dia do mês. Nos dias anteriores, o que entrou e saiu de fato das contas ligadas (extrato bancário); de hoje em diante, a previsão. Clique no dia para ver as entradas e as saídas.</p>
        </div>
        <div class="cxd-body">
          <div class="cxd-tools">
            <label>Mês
              <input type="month" value="${this.month}" onchange="FluxoCaixaDiarioApp.month=this.value;FluxoCaixaDiarioApp.openDay='';FluxoCaixaDiarioApp.load()">
            </label>
            ${filtro}
            ${filtroCc}
            ${qtdFora ? `<span class="cxd-fora" title="Entradas, movimentos e conta de parceria desses empreendimentos não entram no caixa">${qtdFora} empreendimento(s) fora do caixa</span>` : ""}
          </div>
          <p id="cxd-progress" style="margin:0 0 10px;color:#105436;font-size:0.8rem;font-weight:600;" ${this.progress ? "" : "hidden"}>${caixaEsc(this.progress || "")}</p>
          ${this.error ? `<div style="margin-bottom:10px;padding:10px;background:#fff7ed;color:#9a3412;border-radius:8px;font-size:0.82rem;">${caixaEsc(this.error)}</div>` : ""}
          <p class="cxd-title">CONTAS COM SALDO <span>· ligue as contas que entram no caixa</span></p>
          ${this.contasHtml()}
          <div class="cxd-saldo-ini"><span>${iniLabel}</span><span>${caixaMoney(saldoInicial)}</span></div>
          ${this.loading ? `<p style="color:#64748b;">Montando o fluxo…</p>` : `
          <p class="cxd-title">MOVIMENTO DO MÊS <span>· dias anteriores realizados, de hoje em diante previstos · clique no dia para ver entradas e saídas</span></p>
          <div class="cxd-wrap cxd-wrap-mx">
            <table class="cxd-mx">
              <thead><tr>
                <th class="cxd-lbl">Dia</th>
                ${cabecalho}
                <th class="cxd-col-tot">Total</th>
              </tr></thead>
              <tbody>
                <tr><td class="cxd-lbl">Saldo inicial</td>${linhaInicial}<td class="cxd-col-tot">${caixaMoney(saldoInicial)}</td></tr>
                <tr><td class="cxd-lbl">Entradas</td>${linhaEntradas}<td class="cxd-col-tot cxd-in">${caixaMoney(totEntrar)}</td></tr>
                <tr><td class="cxd-lbl">Saídas</td>${linhaSaidas}<td class="cxd-col-tot cxd-out">${caixaMoney(totSair)}</td></tr>
                <tr class="cxd-row-dia"><td class="cxd-lbl">Saldo do dia</td>${linhaDia}<td class="cxd-col-tot ${sinal(totEntrar - totSair)}">${caixaMoney(totEntrar - totSair)}</td></tr>
                <tr class="cxd-row-acum"><td class="cxd-lbl">Saldo acumulado</td>${linhaAcum}<td class="cxd-col-tot ${sinal(fim)}">${caixaMoney(fim)}</td></tr>
              </tbody>
            </table>
          </div>
          ${detalheDia}`}
        </div>
      </div>
      ${this.detailHtml()}`;
    const wrap = root.querySelector(".cxd-wrap-mx");
    if (wrap) {
      if (prevScroll != null) wrap.scrollLeft = prevScroll;
      else {
        const th = wrap.querySelector("th.cxd-col-hoje");
        const lbl = wrap.querySelector("th.cxd-lbl");
        if (th) wrap.scrollLeft = Math.max(0, th.offsetLeft - (lbl ? lbl.offsetWidth : 0) - th.offsetWidth);
      }
    }
    const body = root.querySelector(".cxd-body");
    if (body && prevTop) body.scrollTop = prevTop;
    root.querySelectorAll(".cxd-gbox-body").forEach((el, i) => { if (prevContas[i]) el.scrollTop = prevContas[i]; });
    this.bindCompanyFilter();
    if (window.lucide) lucide.createIcons();
  }
};

const ResultadoCaixaApp = {
  date: "",
  compareDate: "",
  loading: false,
  saving: false,
  error: "",
  rows: [],
  compare: [],
  dates: [],

  init() {
    if (!this.date) this.date = new Date().toISOString().slice(0, 10);
    this.render();
    this.refresh();
  },

  async refresh() {
    this.loading = true;
    this.error = "";
    this.render();
    try {
      this.dates = await CaixaPosicaoStore.listDates();
      this.rows = await CaixaPosicaoStore.loadDate(this.date);
      this.compare = this.compareDate ? await CaixaPosicaoStore.loadDate(this.compareDate) : [];
    } catch (e) {
      this.error = e.message || String(e);
    }
    this.loading = false;
    this.render();
  },

  async gravarHoje() {
    this.saving = true;
    this.error = "";
    this.render();
    try {
      const units = await CaixaPosicaoStore.loadEstoqueUnits();
      const today = (window.EstoqueComercialApp && typeof EstoqueComercialApp.todayStr === "function")
        ? EstoqueComercialApp.todayStr()
        : new Date().toISOString().slice(0, 10);
      await CaixaPosicaoStore.saveFromUnits(units, today);
      this.date = today;
      await this.refresh();
    } catch (e) {
      this.error = e.message || String(e);
      this.saving = false;
      this.render();
    }
  },

  sum(list, k) {
    return (list || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  },

  render() {
    const root = document.getElementById("resultado-caixa-root");
    if (!root) return;
    const rec = this.sum(this.rows, "rec");
    const ven = this.sum(this.rows, "ven");
    const av = this.sum(this.rows, "av");
    const vp = this.sum(this.rows, "vp");
    const rec2 = this.sum(this.compare, "rec");
    const ven2 = this.sum(this.compare, "ven");
    const av2 = this.sum(this.compare, "av");
    const vp2 = this.sum(this.compare, "vp");
    const dateOpts = this.dates.map((d) => `<option value="${d}" ${d === this.compareDate ? "selected" : ""}>${caixaFmtDate(d)}</option>`).join("");
    const body = this.rows.slice(0, 400).map((r) => `
      <tr>
        <td>${caixaEsc(r.cc)} / ${caixaEsc(r.un)}</td>
        <td>${caixaEsc(r.nome || "—")}</td>
        <td>${caixaEsc(r.cpf || "—")}</td>
        <td style="text-align:right;">${caixaMoney(r.rec)}</td>
        <td style="text-align:right;">${caixaMoney(r.ven)}</td>
        <td style="text-align:right;">${caixaMoney(r.av)}</td>
        <td style="text-align:right;">${caixaMoney(r.vp)}</td>
        <td style="text-align:right;">${r.pmp} d</td>
      </tr>`).join("");
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 85px);">
        <div style="background:#105436;padding:16px 20px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;color:#fff;font-size:1.15rem;">Resultado de caixa</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:0.75rem;">Posição diária no Firebase: unidade, cliente, CPF, recebido, vencido, a vencer e valor presente. O cron das 6:30 grava após o batimento.</p>
        </div>
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:14px 16px;overflow:auto;">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Posição
              <input type="date" value="${this.date}" onchange="ResultadoCaixaApp.date=this.value;ResultadoCaixaApp.refresh()"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
            </label>
            <label style="font-size:0.75rem;font-weight:700;color:#475569;">Comparar com
              <select onchange="ResultadoCaixaApp.compareDate=this.value;ResultadoCaixaApp.refresh()"
                style="display:block;height:34px;border:1px solid #e2e8f0;border-radius:6px;padding:0 8px;margin-top:4px;">
                <option value="">Nenhuma</option>${dateOpts}
              </select>
            </label>
            <button class="btn btn-primary" onclick="ResultadoCaixaApp.gravarHoje()" ${this.saving ? "disabled" : ""}>${this.saving ? "Gravando…" : "Gravar posição de hoje"}</button>
          </div>
          ${this.error ? `<div style="margin-bottom:10px;padding:10px;background:#fef2f2;color:#b91c1c;border-radius:8px;font-size:0.82rem;">${caixaEsc(this.error)}</div>` : ""}
          <div class="est-stock-kpis" style="margin-bottom:12px;">
            <div class="est-fin-card is-ok"><label>Recebido</label><strong>${caixaMoney(rec)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(rec2)}</small>` : ""}</div>
            <div class="est-fin-card is-warn"><label>Vencido</label><strong>${caixaMoney(ven)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(ven2)}</small>` : ""}</div>
            <div class="est-fin-card"><label>A vencer / a pagar</label><strong>${caixaMoney(av)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(av2)}</small>` : ""}</div>
            <div class="est-fin-card"><label>Valor presente</label><strong>${caixaMoney(vp)}</strong>${this.compare.length ? `<small>vs ${caixaMoney(vp2)}</small>` : ""}</div>
          </div>
          ${this.loading ? `<p style="color:#64748b;">Carregando posição…</p>` : `
          <div class="table-container crm-scroll-table" style="max-height:52vh;background:#fff;border-radius:8px;">
            <table class="custom-table">
              <thead><tr>
                <th>Unidade</th><th>Cliente</th><th>CPF</th>
                <th>Recebido</th><th>Vencido</th><th>A vencer</th><th>Valor presente</th><th>PMP 3m</th>
              </tr></thead>
              <tbody>${body || `<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">Sem posição nesta data. Grave hoje ou aguarde o batimento das 6:30.</td></tr>`}</tbody>
            </table>
          </div>
          ${this.rows.length > 400 ? `<p style="font-size:0.8rem;color:#64748b;">Exibindo 400 de ${this.rows.length} contratos.</p>` : ""}`}
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }
};

window.CaixaPosicaoStore = CaixaPosicaoStore;
window.FluxoCaixaDiarioApp = FluxoCaixaDiarioApp;
window.ResultadoCaixaApp = ResultadoCaixaApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "fluxo-caixa-diario") FluxoCaixaDiarioApp.init();
  if (e.detail === "resultado-caixa") ResultadoCaixaApp.init();
});
