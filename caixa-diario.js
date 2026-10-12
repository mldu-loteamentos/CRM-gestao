function caixaAddDays(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + Number(n || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function caixaEhUtil(iso) {
  return typeof window.isBusinessDayIso === "function"
    ? window.isBusinessDayIso(iso)
    : [0, 6].indexOf(new Date(iso + "T12:00:00").getDay()) < 0;
}

function caixaDiaUtil(iso, passo) {
  let d = String(iso || "").slice(0, 10);
  for (let i = 0; i < 15; i++) {
    if (caixaEhUtil(d)) return d;
    d = caixaAddDays(d, passo || 1);
  }
  return d;
}

function caixaMoney(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function caixaParseMoney(v) {
  const s = String(v == null ? "" : v).replace(/[^\d,.-]/g, "").trim();
  if (!s) return 0;
  const n = s.indexOf(",") >= 0 ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : 0;
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
  if (typeof window.siengeFetchWithRetry !== "function" || !window.BoletoCheck) return null;
  try {
    return await BoletoCheck.lerForma(billId, parcela || 1);
  } catch (e) {
    return { erro: (e && e.message) || "O Sienge não respondeu à consulta da forma de pagamento." };
  }
}

function caixaFormaHtml(payment, item) {
  if (payment && payment.erro) {
    return `<p style="color:#b45309;"><strong>Não foi possível consultar a forma de pagamento.</strong> ${caixaEsc(payment.erro)} Feche e abra o título de novo.</p>`;
  }
  if (payment && payment.data) {
    const d = payment.data;
    if (payment.kind === "pix") {
      if (window.BoletoCheck) return BoletoCheck.html(payment, { check: item && item.pagCheck }) + (d.notes ? `<p style="margin-top:6px;">${caixaEsc(d.notes)}</p>` : "");
      return `<p><strong>Forma:</strong> PIX</p><p>${caixaEsc(d.notes || "Chave do credor")}</p>`;
    }
    if (payment.kind === "boleto-bancario" || payment.kind === "boleto-concessionaria") {
      if (window.BoletoCheck) {
        const it = item || {};
        return BoletoCheck.html(payment, {
          valor: it.valorConferir != null ? it.valorConferir : (it.aPagar != null ? it.aPagar : it.valor),
          vencimento: it.vencimento,
          descontoTitulo: it.descontoTitulo,
          retido: it.retido
        });
      }
      return `<p><strong>Forma:</strong> ${payment.kind === "boleto-concessionaria" ? "Boleto de concessionária" : "Boleto"}</p><p>${caixaEsc(d.notes || d.boletoBancarioManualBarCodeNumber || d.boletoConcessionariaManualBarCodeNumber || "")}</p>`;
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
  outras: [],
  movs: [],
  payItems: [],
  progress: "",
  detail: null,
  detOpen: {},
  contasAbertas: { corrente: false, investimento: false },
  mostrarNaoUteis: false,
  compAberto: false,
  flags: {},
  tipos: {},
  ccExcl: {},
  _flagsLoaded: false,
  _types: {},
  _banks: {},
  _nomes: {},
  _custom: null,
  _gen: 0,
  avisoCaixa: null,
  _avisoDisparado: false,
  _avisoToken: 0,

  init() {
    if (!this.month) {
      const n = new Date();
      this.month = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
    }
    this.companyIds = [];
    this.avisoCaixa = null;
    this._avisoDisparado = false;
    this._avisoToken = (this._avisoToken || 0) + 1;
    this.render();
    this.load();
  },

  hoje() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  },

  /** Mês corrente e os três seguintes. A tela não escolhe competência. */
  monthBounds() {
    const n = new Date();
    const startD = new Date(n.getFullYear(), n.getMonth(), 1);
    const endD = new Date(n.getFullYear(), n.getMonth() + 4, 0);
    const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    return { start: iso(startD), end: iso(endD) };
  },

  rotuloPeriodo() {
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const b = this.monthBounds();
    const nome = (iso) => {
      const p = String(iso || "").split("-");
      return (meses[Number(p[1]) - 1] || "") + " de " + p[0];
    };
    return nome(b.start) + " a " + nome(b.end);
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

  /** Empresa 1, ou a primeira gerida cujo nome é Moura Leite. */
  empresaPadrao(ids) {
    const lista = ids || this.empresasGeridas().map((c) => String(c.id));
    if (lista.indexOf("1") >= 0) return "1";
    const porNome = this.empresasGeridas()
      .filter((c) => lista.indexOf(String(c.id)) >= 0 && /moura\s+leite/i.test(c.name || ""))
      .sort((a, b) => Number(a.id) - Number(b.id));
    if (porNome.length) return String(porNome[0].id);
    const sorted = lista.slice().sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)));
    return sorted[0] || "";
  },

  ensureCompany() {
    const ids = this.empresasGeridas().map((c) => String(c.id));
    if (this.companyIds.length === 1 && ids.indexOf(this.companyIds[0]) >= 0) return;
    const pick = this.empresaPadrao(ids);
    this.companyIds = pick ? [pick] : [];
    if (pick) {
      try { localStorage.setItem("cxd_company", pick); } catch (e) {}
    }
  },

  normNum(v) {
    return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
  },

  /**
   * Contas ligadas/desligadas, tipo e empreendimentos fora do caixa ficam no Firebase.
   * Relê a cada consulta (outro operador pode ter mudado) e espera o Firebase subir; sem isso, abrir a
   * tela logo após o login mostrava todas as contas ligadas.
   */
  async loadFlags() {
    for (let i = 0; i < 40 && !(window.firebaseDb && window.firebaseCollections && window.firebaseCollections.getDoc); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const fx = window.firebaseCollections;
    const db = window.firebaseDb;
    if (!fx || !db || typeof fx.getDoc !== "function") return;
    try {
      const snap = await fx.getDoc(fx.doc(db, "caixa_diario_config", "saldo_inicial"));
      const data = snap.exists() ? (snap.data() || {}) : {};
      this.flags = Object.assign({}, data.contas || {}, this._flagsPendentes || {});
      this.tipos = Object.assign({}, data.tipos || {}, this._tiposPendentes || {});
      this.ccExcl = Object.assign({}, data.empreendimentosExcluidos || {}, this._ccPendentes || {});
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
      return false;
    }
    const user = (window.AppState && AppState.currentUser) || {};
    try {
      await fx.setDoc(fx.doc(db, "caixa_diario_config", "saldo_inicial"), Object.assign({}, patch, {
        updatedAt: new Date().toISOString(),
        updatedBy: user.name || user.email || ""
      }), { merge: true });
      return true;
    } catch (e) {
      console.error("[Caixa diário] gravar configuração", e);
      alert(erroMsg || "Não consegui gravar a alteração no Firebase.");
      return false;
    }
  },

  /** Enquanto a gravação não confirma, a mudança vale sobre o que vier do Firebase. */
  async _salvarPendente(bucket, key, value, patch, erroMsg) {
    this[bucket] = this[bucket] || {};
    this[bucket][key] = value;
    const ok = await this.saveConfig(patch, erroMsg);
    if (ok && this[bucket][key] === value) delete this[bucket][key];
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
    await this._salvarPendente("_ccPendentes", co, this.ccExcl[co], { empreendimentosExcluidos: { [co]: this.ccExcl[co] } }, "Não consegui gravar os empreendimentos no Firebase.");
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
    await this._salvarPendente("_flagsPendentes", key, !!on, { contas: { [key]: !!on } }, "Não consegui gravar a marcação da conta no Firebase.");
  },

  async setTipo(key, tipo) {
    this.tipos[key] = tipo;
    this.accounts.forEach((a) => { if (this.accountKey(a) === key) a.tipo = tipo; });
    this.render();
    await this._salvarPendente("_tiposPendentes", key, tipo, { tipos: { [key]: tipo } }, "Não consegui gravar o tipo da conta no Firebase.");
  },

  async loadAccountTypes(companyId) {
    const id = String(companyId || "");
    if (!id) return {};
    if (this._types[id]) return this._types[id];
    const map = {};
    const banks = {};
    const nomes = {};
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
          const nome = [raw.accountName, raw.name, raw.description, raw.accountDescription]
            .map((s) => String(s || "").trim())
            .find((s) => s && this.normNum(s) !== num);
          if (num && nome) nomes[num] = nome;
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
    this._nomes[id] = nomes;
    return map;
  },

  accountTipo(types, number, name) {
    const sienge = types[this.normNum(number)] || types[this.normNum(name)] || "";
    if (sienge === "investimento") return sienge;
    const txt = String(number + " " + name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (/CDB|APLIC|INVEST|FUNDO|^FI[-\s]|\bFI\b|RENDA FIXA|\bRF\b|\bLCI\b|\bLCA\b|\bRDB\b|COMPROMISS|POUP/.test(txt)) return "investimento";
    return sienge || "corrente";
  },

  /** Conta do movimento: investimento ou conta corrente. Sem conta identificada, o previsto cai na corrente. */
  ladoConta(companyId, number) {
    if (!number) return "corrente";
    const key = this.accountKey({ companyId: companyId || "", number });
    const acc = (this.accounts || []).find((a) => this.accountKey(a) === key);
    if (acc && acc.tipo === "investimento") return "investimento";
    const types = (this._types && this._types[String(companyId || "")]) || {};
    return this.accountTipo(types, number, (acc && acc.name) || "") === "investimento" ? "investimento" : "corrente";
  },

  saldoPorTipo() {
    let corrente = 0;
    let investimento = 0;
    (this.accounts || []).forEach((a) => {
      if (!this.accountIncluded(a)) return;
      const v = this.saldoBase(a);
      if (a.tipo === "investimento") investimento += v;
      else corrente += v;
    });
    return { corrente, investimento, total: corrente + investimento };
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

  /** Cadastro de Empresas: só entra quem está com Gerida pelo Grupo ligada. */
  empresaGerida(id) {
    const sid = String(id == null ? "" : id).trim();
    if (!sid) return false;
    const num = String(Number(sid));
    const fontes = [];
    if (window.EmpresasState && EmpresasState.customFields) fontes.push(EmpresasState.customFields);
    try { fontes.push(JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {}); } catch (e) {}
    if (window.AppState && AppState.companiesCustom) fontes.push(AppState.companiesCustom);
    for (let i = 0; i < fontes.length; i++) {
      const map = fontes[i] || {};
      const cfg = map[sid] || map[num] || map[Number(sid)];
      if (!cfg || typeof cfg !== "object") continue;
      const v = cfg.gerida_pelo_grupo != null ? cfg.gerida_pelo_grupo : cfg.gerida_grupo;
      if (v == null) continue;
      return v === 1 || v === true || v === "1" || Number(v) === 1;
    }
    return false;
  },

  empresasGeridas() {
    return (this.companies || []).filter((c) => this.empresaGerida(c.id));
  },

  empItems() {
    return this.empresasGeridas().map((c) => ({
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
    this.outras = [];
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
      if (b.end >= hoje) await this.loadOutrasEntradas(gen, b, hoje);
      if (this._gen !== gen) return;
      this.progress = "";
      this.render();
      this.avisarCaixa();
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
    // Um título com mais de uma unidade (lote + casa) vem repetido em cada unidade do estoque.
    const vistos = {};
    (units || []).forEach((u) => {
      if (u.quitado || u.relFin === "quitado") return;
      const companyId = this._ccCompany[String(u.enterpriseId || "")] || "";
      if (!this.companyWanted(companyId)) return;
      const pmp = Number(u.pmp3m) || 0;
      const horizonte = b.end > caixaAddDays(hoje, 35) ? b.end : caixaAddDays(hoje, 35);
      const titulo = u.receivableBillId != null ? String(u.receivableBillId) : "";
      const local = {};
      (Array.isArray(u.openParcelas) ? u.openParcelas : []).forEach((p) => {
        if (!p || !p.due) return;
        if (titulo) {
          const k = [titulo, p.num || "", p.due, (Number(p.val) || 0).toFixed(2)].join("|");
          local[k] = (local[k] || 0) + 1;
          const ja = vistos[k];
          if (ja && local[k] <= ja.n) {
            const un = String(u.name || "").trim();
            const item = ja.itens[local[k] - 1];
            if (item && un && !item.unidades.includes(un)) {
              item.unidades.push(un);
              item.unidade = item.unidades.join(" + ");
            }
            return;
          }
        }
        // Ainda cabe no caixa enquanto o próximo dia útil do vencimento não passou.
        const vencEfetivo = caixaDiaUtil(p.due, 1);
        if (vencEfetivo < hoje) return;
        const bruto = caixaAddDays(p.due, pmp);
        const prev = caixaDiaUtil(bruto, 1);
        const fora = prev < b.start || prev > horizonte || prev < hoje;
        const un = String(u.name || "").trim();
        const item = fora ? null : {
          date: prev,
          vencEfetivo,
          deslocadoDe: prev !== bruto ? bruto : "",
          valor: Number(p.val) || 0,
          unidade: un,
          unidades: un ? [un] : [],
          cc: String(u.enterpriseId || ""),
          ccNome: u.enterpriseName || "",
          titulo,
          parcela: p.num ? [p.tipo, p.num].filter(Boolean).join(" ") : "",
          cliente: u.customerName || "",
          cpf: u.customerDoc || "",
          vencimento: p.due,
          pmp,
          customerId: u.customerId != null ? String(u.customerId) : "",
          billId: titulo
        };
        if (titulo) {
          const k = [titulo, p.num || "", p.due, (Number(p.val) || 0).toFixed(2)].join("|");
          const ja = vistos[k] || (vistos[k] = { n: 0, itens: [] });
          ja.n = local[k];
          ja.itens[local[k] - 1] = item;
        }
        if (item) out.push(item);
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
      const nomeCad = (this._nomes[String(acc.companyId)] || {})[this.normNum(acc.number)];
      acc.descricao = nomeCad || (acc.name && this.normNum(acc.name) !== this.normNum(acc.number) ? acc.name : "");
      delete acc._dt;
    }
    if (this._gen !== gen) return;
    accounts.sort((a, b2) => String(a.companyId).localeCompare(String(b2.companyId), "pt") || String(a.name).localeCompare(String(b2.name), "pt", { numeric: true }));
    this.accounts = accounts;
    this.openingDate = usaAbertura ? abertura : "";
    this.rebuild();
    this.render();
  },

  /** Parte de cada centro de custo no rateio (soma 1). */
  sharesDe(cats) {
    const pesos = {};
    let n = 0;
    (Array.isArray(cats) ? cats : []).forEach((fc) => {
      const cc = fc && fc.costCenterId != null && typeof fc.costCenterId !== "object" ? String(fc.costCenterId).trim() : "";
      const r = Number(fc && fc.financialCategoryRate);
      if (!(cc in pesos)) n++;
      pesos[cc] = (pesos[cc] || 0) + (Number.isFinite(r) && r > 0 ? r : 0);
    });
    const soma = Object.values(pesos).reduce((s, p) => s + p, 0);
    return Object.keys(pesos).map((cc) => ({ cc, share: soma > 0 ? pesos[cc] / soma : 1 / n }));
  },

  /** O extrato do Sienge pode trazer o valor sempre positivo, com crédito/débito no tipo da operação. */
  valorMov(m) {
    const raw = Number(m.bankMovementAmount) || 0;
    if (raw <= 0) return raw;
    const norm = (v) => (v == null || typeof v === "object") ? "" : String(v).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const tipo = norm(m.bankMovementOperationType || m.operationType);
    if (/^(S|D)$/.test(tipo) || /DEBIT|SAIDA/.test(tipo)) return -raw;
    if (/^(E|C)$/.test(tipo) || /CREDIT|ENTRADA/.test(tipo)) return raw;
    const op = norm(m.bankMovementOperationName);
    if (/PAGAMENTO|PAGTO|DEBITO|TARIFA|SAIDA/.test(op)) return -raw;
    if (/RECEBIMENTO|CREDITO|ENTRADA/.test(op)) return raw;
    if (norm(m.creditorName) && !norm(m.clientName)) return -raw;
    return raw;
  },

  /**
   * Origem do movimento no Sienge: título do contas a pagar/receber ou lançamento direto em caixa e bancos
   * (avulso, digitado à mão). O código de origem vale primeiro; sem ele, o título vinculado decide.
   */
  origemMov(m, valor) {
    const txt = (v) => (v == null || typeof v === "object") ? "" : String(v).trim();
    const cod = txt(m.bankMovementOriginId).toUpperCase();
    const temTitulo = !!txt(m.billId);
    if (/^CP/.test(cod)) return { tipo: "cp", rotulo: "Contas a pagar", cod };
    if (/^CR/.test(cod)) return { tipo: "cr", rotulo: "Contas a receber", cod };
    if (/^(CB|CX|BC)/.test(cod)) return { tipo: "cb", rotulo: "Caixa e bancos", cod };
    if (/^(TR|TB|TC)/.test(cod)) return { tipo: "tr", rotulo: "Transferência entre contas", cod };
    if (temTitulo) {
      if (txt(m.clientName) || txt(m.clientId)) return { tipo: "cr", rotulo: "Contas a receber", cod };
      if (txt(m.creditorName) || txt(m.creditorId)) return { tipo: "cp", rotulo: "Contas a pagar", cod };
      return valor >= 0 ? { tipo: "cr", rotulo: "Contas a receber", cod } : { tipo: "cp", rotulo: "Contas a pagar", cod };
    }
    if (cod) return { tipo: "outro", rotulo: "Origem " + cod, cod };
    return { tipo: "cb", rotulo: "Caixa e bancos", cod };
  },

  conciliadoMov(m) {
    const v = m.bankMovementReconcile;
    if (v === true || v === false) return v;
    const s = String(v == null ? "" : v).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/^(S|SIM|Y|YES|TRUE|1|C|CONCILIADO)$/.test(s)) return true;
    if (/^(N|NAO|NO|FALSE|0|NAO CONCILIADO)$/.test(s)) return false;
    return null;
  },

  normMov(m, i) {
    const txt = (v) => (v == null || typeof v === "object") ? "" : String(v).trim();
    const cats = Array.isArray(m.financialCategories) ? m.financialCategories : [];
    const shares = this.sharesDe(cats);
    const valor = this.valorMov(m);
    const planos = [...new Set(cats.map((fc) => txt(fc && fc.financialCategoryName)).filter(Boolean))];
    return {
      origem: this.origemMov(m, valor),
      conciliado: this.conciliadoMov(m),
      planos,
      movId: txt(m.bankMovementId),
      id: "m" + i,
      date: txt(m.bankMovementDate).slice(0, 10),
      valor,
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

  apiPagar() {
    return window.ComprasControleApp || window.ComprasPrevisoesApp;
  },

  async loadPayables(gen, b, hoje) {
    const app = this.apiPagar();
    if (!app || typeof app.outcomeRange !== "function" || typeof app.transform !== "function") {
      this.error = this.error || "O módulo de compras não está disponível para ler os títulos a pagar.";
      this.render();
      return;
    }
    const inicio = hoje > b.start ? hoje : b.start;
    const horizonte = b.end > caixaAddDays(hoje, 35) ? b.end : caixaAddDays(hoje, 35);
    // Títulos de fim de semana/feriado nas bordas do período podem entrar nele ao irem para o dia útil.
    // A folga de 35 dias serve para saber se o dinheiro da conta corrente zera o IOF do CDB.
    const buscaIni = caixaAddDays(inicio, -4);
    const buscaFim = caixaAddDays(horizonte, 4);
    const prevNote = app.noteProgress;
    app.noteProgress = (text) => {
      this.progress = text;
      this.paintProgress();
    };
    let rows = [];
    const rateios = {};
    try {
      const targets = this.companyIds.length ? this.companyIds.slice() : [""];
      const bills = [];
      for (let i = 0; i < targets.length; i++) {
        if (this._gen !== gen) return;
        this.progress = "Buscando contas a pagar…";
        this.paintProgress();
        const part = await app.outcomeRange(buscaIni, buscaFim, targets[i]);
        if (Array.isArray(part)) bills.push.apply(bills, part);
      }
      bills.forEach((bill) => {
        if (!bill || bill.billId == null) return;
        const k = String(bill.billId) + "|" + (bill.installmentId != null ? String(bill.installmentId) : "");
        if (!rateios[k]) rateios[k] = this.sharesDe(bill.paymentsCategories);
      });
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
      if (pagamento < inicio || pagamento > horizonte) return;
      if (!this.companyWanted(r.companyId)) return;
      const key = r.titulo + "|" + (r.parcela || "") + "|" + due;
      if (seen[key]) return;
      seen[key] = true;
      const saldo = Number(r.saldo);
      const valor = Number.isFinite(saldo) && saldo > 0 ? saldo : (Number(r.valor) || 0);
      if (!(valor > 0)) return;
      const rateio = rateios[r.titulo + "|" + (r.parcela || "")];
      pay.push({
        key,
        shares: rateio && rateio.length ? rateio : (r.ccId ? [{ cc: String(r.ccId), share: 1 }] : []),
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

  /** Recebimentos que não são contrato de venda (CT): distribuição, taxa, aluguel e demais previsões em aberto. */
  async loadOutrasEntradas(gen, b, hoje) {
    if (typeof window.siengeFetchWithRetry !== "function") return;
    const inicio = hoje > b.start ? hoje : b.start;
    const horizonte = b.end > caixaAddDays(hoje, 35) ? b.end : caixaAddDays(hoje, 35);
    const buscaIni = caixaAddDays(inicio, -4);
    const buscaFim = caixaAddDays(horizonte, 4);
    const fora = { CT: 1, PFIN: 1, TC: 1, CIPT: 1, CREG: 1, IPTU: 1 };
    const meio = (s, e) => {
      const dias = Math.round((new Date(e + "T12:00:00") - new Date(s + "T12:00:00")) / 86400000);
      return dias > 1 ? caixaAddDays(s, Math.floor(dias / 2)) : s;
    };
    const path = (s, e, companyId) => "/bulk-data/v1/income?startDate=" + encodeURIComponent(s)
      + "&endDate=" + encodeURIComponent(e)
      + "&selectionType=D&correctionIndexerId=0&correctionDate=2022-01-01"
      + (companyId ? "&companyId=" + encodeURIComponent(companyId) : "");
    const get = async (s, e, companyId, depth) => {
      try {
        const payload = await window.siengeFetchWithRetry(path(s, e, companyId), 2);
        return (payload && payload.data) || (Array.isArray(payload) ? payload : []);
      } catch (err) {
        if (Number(err && err.status) !== 507 || depth > 6) throw err;
        const m = meio(s, e);
        if (!m || m <= s || m >= e) throw err;
        const left = await get(s, m, companyId, depth + 1);
        const right = await get(caixaAddDays(m, 1), e, companyId, depth + 1);
        return left.concat(right);
      }
    };
    this.progress = "Lendo outras entradas previstas…";
    this.paintProgress();
    const alvos = this.companyIds.length ? this.companyIds.slice() : [""];
    const rows = [];
    try {
      for (let i = 0; i < alvos.length; i++) {
        if (this._gen !== gen) return;
        const part = await get(buscaIni, buscaFim, alvos[i], 0);
        if (Array.isArray(part)) rows.push.apply(rows, part);
      }
    } catch (e) {
      console.warn("[Caixa diário] outras entradas", e);
      this.error = this.error || ("Não consegui ler as outras entradas previstas: " + ((e && e.message) || e));
    }
    if (this._gen !== gen) return;
    const seen = {};
    const out = [];
    rows.forEach((r) => {
      if (!r) return;
      const doc = String(r.documentIdentificationId || "").trim().toUpperCase();
      if (fora[doc]) return;
      const numero = String(r.documentNumber || "");
      const numUp = numero.toUpperCase();
      if (numUp.indexOf("G1") >= 0 || numUp.indexOf("G2") >= 0 || numUp.indexOf("G3") >= 0) return;
      const recs = Array.isArray(r.receipts) ? r.receipts : [];
      if (recs.some((x) => x && x.operationTypeName)) return;
      const due = String(r.dueDate || "").slice(0, 10);
      if (!due) return;
      const prev = caixaDiaUtil(due, 1);
      if (prev < inicio || prev > horizonte) return;
      const companyId = r.companyId != null ? String(r.companyId) : "";
      if (companyId && !this.companyWanted(companyId)) return;
      const valor = Number(r.originalAmount) || 0;
      if (!(valor > 0.009)) return;
      const titulo = r.billId != null ? String(r.billId) : "";
      const parcela = r.installmentId != null ? String(r.installmentId) : "";
      const key = titulo + "|" + parcela + "|" + due;
      if (seen[key]) return;
      seen[key] = true;
      const cats = Array.isArray(r.receiptsCategories) ? r.receiptsCategories : (Array.isArray(r.paymentsCategories) ? r.paymentsCategories : []);
      const cat = cats.find((c) => c && (c.costCenterId != null || c.costCenterName)) || {};
      let pagarId = this.idPagarDe(r);
      if (pagarId === titulo) pagarId = "";
      out.push({
        outra: true,
        date: prev,
        deslocadoDe: prev !== due ? due : "",
        valor,
        saldo: r.correctedBalanceAmount != null ? Number(r.correctedBalanceAmount) : (r.balanceAmount != null ? Number(r.balanceAmount) : null),
        cliente: r.clientName || "",
        clientId: r.clientId != null ? String(r.clientId) : "",
        companyId,
        empresa: r.companyName || "",
        cc: cat.costCenterId != null ? String(cat.costCenterId) : "",
        ccNome: cat.costCenterName || "",
        unidade: String(r.mainUnit || r.unitName || r.unit || "").trim(),
        titulo,
        parcela,
        docId: doc,
        documento: numero,
        vencimento: due,
        emissao: String(r.issueDate || r.billDate || "").slice(0, 10),
        pagarId,
        billId: titulo
      });
    });
    this.outras = out;
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
    for (let iso = b.start; iso <= b.end; iso = caixaAddDays(iso, 1)) {
      const day = { date: iso, real: iso < hoje, entrar: 0, pagar: 0, entrarCc: 0, sairCc: 0, entrarInv: 0, sairInv: 0, itens: [], pagarItens: [] };
      days.push(day);
      byDay[iso] = day;
    }
    const lanca = (day, valor, inv, saida) => {
      if (saida) {
        if (inv) day.sairInv += valor;
        else day.sairCc += valor;
      } else if (inv) day.entrarInv += valor;
      else day.entrarCc += valor;
    };
    this.recItems.forEach((it) => {
      const day = byDay[it.date];
      if (!day || day.real || excl.has(String(it.cc))) return;
      day.entrar += it.valor;
      lanca(day, it.valor, false, false);
      day.itens.push(it);
    });
    (this.outras || []).forEach((it) => {
      const day = byDay[it.date];
      if (!day || day.real) return;
      day.entrar += it.valor;
      lanca(day, it.valor, false, false);
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
      const inv = this.ladoConta(m.companyId, m.conta) === "investimento";
      if (v > 0) {
        day.entrar += v;
        lanca(day, v, inv, false);
        day.itens.push(Object.assign({}, m, { real: true, valor: v, tipoConta: inv ? "investimento" : "corrente" }));
      } else {
        day.pagar += -v;
        lanca(day, -v, inv, true);
        day.pagarItens.push({
          key: m.id, real: true, natureza: "pago", date: m.date, valor: -v,
          titulo: m.billId, parcela: m.parcela, credor: m.party, documento: m.doc, historico: m.historico,
          conta: m.conta, companyId: m.companyId, plano: m.plano, planos: m.planos, ccNome: m.ccNome,
          origem: m.origem, conciliado: m.conciliado, movId: m.movId, tipoConta: inv ? "investimento" : "corrente"
        });
      }
    });
    this.payItems.forEach((p) => {
      const day = byDay[p.date];
      if (!day || day.real) return;
      const fora = (p.shares || []).reduce((s, x) => s + (excl.has(x.cc) ? x.share : 0), 0);
      const v = p.valor * (1 - fora);
      if (v < 0.005) return;
      const inv = this.ladoConta(p.companyId, p.conta) === "investimento";
      day.pagar += v;
      lanca(day, v, inv, true);
      const item = fora > 0 ? Object.assign({}, p, { valor: v }) : p;
      day.pagarItens.push(Object.assign({}, item, { tipoConta: inv ? "investimento" : "corrente" }));
    });
    this.days = days;
    this.totals.entrar = days.reduce((s, x) => s + x.entrar, 0);
    this.totals.pagar = days.reduce((s, x) => s + x.pagar, 0);
    this.recalcSaldo();
  },

  toggle(iso) {
    const mesmo = this.openDay === iso;
    this.openDay = mesmo ? "" : iso;
    if (!mesmo && this.openDay) this.detOpen = {};
    this.render();
    const det = this.openDay && document.querySelector("#fluxo-caixa-diario-root .cxd-daydet");
    if (det) det.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },

  toggleGrupo(tipo) {
    this.detOpen[tipo] = !this.detOpen[tipo];
    this.render();
  },

  toggleContas(id) {
    this.contasAbertas[id] = this.contasAbertas[id] === false;
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
    const unidade = (it.unidades && it.unidades[0]) || it.unidade;
    btn.dataset.unit = unidade ? (it.cc + " - " + unidade) : "";
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

  idPagarDe(o) {
    if (!o || typeof o !== "object") return "";
    const keys = ["payableBillId", "billPayableId", "accountPayableBillId", "payableId", "originPayableBillId", "sourceBillId", "linkedPayableBillId", "billIdPayable", "originBillId", "accountsPayableBillId"];
    const vistos = [o];
    Object.keys(o).forEach((k) => {
      const v = o[k];
      if (v && typeof v === "object" && !Array.isArray(v)) vistos.push(v);
    });
    const parece = /payable|originbill|sourcebill|linkedbill/i;
    for (let i = 0; i < vistos.length; i++) {
      const obj = vistos[i];
      for (let j = 0; j < keys.length; j++) {
        const n = obj[keys[j]];
        if (n != null && String(n).trim() && String(n) !== "0") return String(n).trim();
      }
      const nomes = Object.keys(obj);
      for (let j = 0; j < nomes.length; j++) {
        if (!parece.test(nomes[j])) continue;
        const n = obj[nomes[j]];
        if (n == null || typeof n === "object") continue;
        const s = String(n).trim();
        if (/^\d+$/.test(s) && s !== "0") return s;
      }
    }
    return "";
  },

  normGrupo(s) {
    return String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\b(LTDA|S A|SA|SPE|EIRELI|ME|EPP)\b/g, " ")
      .replace(/\s+/g, " ").trim();
  },

  /** Cliente e empresa do mesmo grupo: o dinheiro só muda de conta. */
  mesmoGrupo(a, b) {
    const na = this.normGrupo(a);
    const nb = this.normGrupo(b);
    if (na.length < 4 || nb.length < 4) return false;
    if (na === nb || na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) return true;
    return na.indexOf("MOURA LEITE") >= 0 && nb.indexOf("MOURA LEITE") >= 0;
  },

  async anexosDe(billId, fonte) {
    if (fonte === "pagar" && window.ComprasPrevisoesApp && typeof ComprasPrevisoesApp.anexosDoTitulo === "function") {
      const lista = await ComprasPrevisoesApp.anexosDoTitulo(billId);
      return (lista || []).map((a) => Object.assign({}, a, { billId: String(billId), fonte: "pagar" }));
    }
    const path = fonte === "receber"
      ? "/accounts-receivable/receivable-bills/" + encodeURIComponent(billId) + "/attachments"
      : "/bills/" + encodeURIComponent(billId) + "/attachments";
    const data = await window.siengeFetchWithRetry(path, 1);
    return ((data && data.results) || []).map((a) => ({
      id: a.attachmentid != null ? a.attachmentid : a.attachmentId,
      name: String(a.name || "anexo.pdf"),
      description: String(a.description || "PDF").trim() || "PDF",
      billId: String(billId),
      fonte
    })).filter((a) => a.id != null && a.id !== "");
  },

  async acharTituloPagar(item, bill) {
    const cliente = String((bill && (bill.customerName || bill.clientName)) || item.cliente || "").trim();
    const empresaNome = String(item.empresa || (bill && bill.companyName) || this.companyName(item.companyId) || "").trim();
    if (this.mesmoGrupo(cliente, empresaNome)) return { transferencia: true };
    const titulo = String(item.titulo || "");
    const direto = item.pagarId || this.idPagarDe(bill);
    if (direto && direto !== titulo) {
      try {
        const b = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(direto), 1);
        if (b && (b.id || b.creditorName || b.documentNumber)) return { id: String(b.id || direto), bill: b };
      } catch (e) { /* segue pela busca do documento */ }
    }
    const doc = String((bill && bill.documentNumber) || item.documento || "").trim();
    const empresaId = String((bill && bill.companyId) || item.companyId || "");
    const base = String(item.emissao || (bill && (bill.issueDate || bill.billDate)) || item.vencimento || "").slice(0, 10);
    if (doc.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(base)) {
      const largo = !item.emissao && !(bill && (bill.issueDate || bill.billDate));
      const ini = caixaAddDays(base, largo ? -240 : -60);
      const fim = caixaAddDays(base, largo ? 30 : 60);
      const tipo = String(item.docId || (bill && (bill.documentId || bill.documentIdentificationId)) || "").toUpperCase();
      const buscar = async (comEmpresa) => {
        let q = "/bills?startDate=" + encodeURIComponent(ini) + "&endDate=" + encodeURIComponent(fim)
          + "&documentNumber=" + encodeURIComponent(doc) + "&limit=50";
        if (comEmpresa && empresaId) q += "&debtorId=" + encodeURIComponent(empresaId);
        const data = await window.siengeFetchWithRetry(q, 1);
        return (data && data.results) || [];
      };
      let rows = [];
      try { rows = await buscar(true); } catch (e) { rows = []; }
      if (!rows.length && empresaId) {
        try { rows = await buscar(false); } catch (e2) { rows = []; }
      }
      const docUp = doc.toUpperCase();
      const hits = rows.filter((b) => b && String(b.documentNumber || "").trim().toUpperCase() === docUp && String(b.id) !== titulo);
      const typed = tipo ? hits.filter((b) => String(b.documentIdentificationId || "").toUpperCase() === tipo) : hits;
      const pool = typed.length === 1 ? typed : (typed.length ? [] : (hits.length === 1 ? hits : []));
      if (pool.length) return { id: String(pool[0].id), bill: pool[0] };
    }
    const porCredor = await this.pagarDoCredor(cliente, item, bill);
    if (porCredor) return porCredor;
    return this.pagarDaOutraEmpresa(cliente, empresaNome, item, bill);
  },

  /** O contas a receber não traz o título de origem. O cliente é o credor: procura o contas a pagar dele. */
  async pagarDoCredor(nome, item, bill) {
    if (!nome || nome.length < 3 || typeof window.siengeFetchWithRetry !== "function") return null;
    const alvo = this.normGrupo(nome);
    let creds = [];
    try {
      const data = await window.siengeFetchWithRetry("/creditors?limit=15&name=" + encodeURIComponent(nome), 1);
      creds = (data && data.results) || [];
    } catch (e) { return null; }
    const cred = creds.find((c) => {
      const n = this.normGrupo(c.name || "");
      return n && (n === alvo || n.indexOf(alvo) >= 0 || alvo.indexOf(n) >= 0);
    });
    if (!cred || cred.id == null) return null;
    return this.escolherPagar(item, bill, "&creditorId=" + encodeURIComponent(cred.id));
  },

  /** O pagamento pode estar na empresa do cliente, com credor igual à empresa que recebe. */
  async pagarDaOutraEmpresa(cliente, empresa, item, bill) {
    if (!cliente || typeof window.siengeFetchWithRetry !== "function") return null;
    const alvo = this.normGrupo(cliente);
    const devedora = (this.companies || []).find((c) => {
      const n = this.normGrupo(c.name);
      return n && String(c.id) !== String(item.companyId || "") && (n === alvo || n.indexOf(alvo) >= 0 || alvo.indexOf(n) >= 0);
    });
    if (!devedora) return null;
    const achado = await this.escolherPagar(item, bill, "&debtorId=" + encodeURIComponent(devedora.id));
    if (!achado || !achado.bill) return achado;
    const credor = this.normGrupo(achado.bill.creditorName || "");
    const recebe = this.normGrupo(empresa);
    if (recebe && credor && credor.indexOf(recebe) < 0 && recebe.indexOf(credor) < 0) return null;
    return achado;
  },

  async escolherPagar(item, bill, filtro) {
    const base = String(item.vencimento || item.emissao || item.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
    const ini = caixaAddDays(base, -120);
    const fim = caixaAddDays(base, 45);
    let rows = [];
    try {
      const data = await window.siengeFetchWithRetry(
        "/bills?startDate=" + encodeURIComponent(ini) + "&endDate=" + encodeURIComponent(fim) + filtro + "&limit=50",
        1
      );
      rows = (data && data.results) || [];
    } catch (e) { return null; }
    const titulo = String(item.titulo || "");
    rows = rows.filter((b) => b && String(b.id) !== titulo);
    const doc = String((bill && bill.documentNumber) || item.documento || "").trim().toUpperCase();
    const porDoc = doc.length >= 2 ? rows.filter((b) => String(b.documentNumber || "").trim().toUpperCase() === doc) : [];
    if (porDoc.length === 1) return { id: String(porDoc[0].id), bill: porDoc[0] };
    const valor = Number(item.valor) || 0;
    const porValor = valor > 0 ? rows.filter((b) => Math.abs((Number(b.totalInvoiceAmount) || 0) - valor) < 0.05) : [];
    if (porValor.length === 1) return { id: String(porValor[0].id), bill: porValor[0] };
    return null;
  },

  async openRecebimento(date, idx) {
    const day = this.days.find((d) => d.date === date);
    const item = day && day.itens[idx];
    if (!item || !item.outra || !item.titulo) return;
    const token = "rec:" + date + ":" + idx;
    this.detail = { receber: true, token, loading: true, error: "", item, bill: null, parcela: null, pagar: null, attachments: [] };
    this.render();
    try {
      const billId = item.titulo;
      let bill = null;
      try {
        bill = await window.siengeFetchWithRetry("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId), 1);
      } catch (e) {
        const st = Number(e && e.status) || 0;
        const msg = String((e && e.message) || "");
        if (st !== 404 && !/\b404\b/.test(msg)) throw e;
      }
      let inst = [];
      try {
        const res = await window.siengeFetchWithRetry("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId) + "/installments?limit=200", 1);
        inst = (res && res.results) || (Array.isArray(res) ? res : []);
      } catch (e2) { inst = []; }
      const parcelaId = String(item.parcela || "");
      const parcela = inst.find((p) => String(p && (p.installmentId != null ? p.installmentId : p.installmentNumber)) === parcelaId) || null;
      const pagar = await this.acharTituloPagar(item, bill);
      let attachments = [];
      if (pagar && pagar.transferencia) {
        if (!this.detail || this.detail.token !== token) return;
        this.detail.loading = false;
        this.detail.bill = bill;
        this.detail.parcela = parcela;
        this.detail.transferencia = true;
        this.detail.pagar = null;
        this.detail.attachments = [];
        if (!bill && !parcela) this.detail.error = "Não encontrei o título a receber " + billId + " no Sienge.";
        this.render();
        return;
      }
      if (pagar && pagar.id) {
        try { attachments = await this.anexosDe(pagar.id, "pagar"); } catch (e3) { attachments = []; }
      }
      if (!attachments.length) {
        try { attachments = await this.anexosDe(billId, "receber"); } catch (e4) { attachments = []; }
      }
      if (!this.detail || this.detail.token !== token) return;
      this.detail.loading = false;
      this.detail.bill = bill;
      this.detail.parcela = parcela;
      this.detail.pagar = pagar;
      this.detail.attachments = attachments;
      if (!bill && !parcela) this.detail.error = "Não encontrei o título a receber " + billId + " no Sienge.";
      this.render();
    } catch (e) {
      if (!this.detail || this.detail.token !== token) return;
      this.detail.loading = false;
      this.detail.error = (e && e.message) ? e.message : "Não consegui abrir o título a receber.";
      this.render();
    }
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

  async baixarAnexo(billId, attachmentId, name, fonte) {
    const base = (window.SIENGE_CONFIG && window.SIENGE_CONFIG.baseUrl) || "/api/sienge-proxy";
    const path = (fonte === "receber" ? "/accounts-receivable/receivable-bills/" : "/bills/")
      + encodeURIComponent(billId) + "/attachments/" + encodeURIComponent(attachmentId);
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

  detailReceberHtml(det) {
    const item = det.item || {};
    const bill = det.bill || {};
    const parc = det.parcela || {};
    const pagar = det.pagar;
    const pagarBill = (pagar && pagar.bill) || {};
    const cliente = item.cliente || bill.customerName || "—";
    const doc = [item.docId || bill.documentId || bill.documentIdentificationId, item.documento || bill.documentNumber].filter(Boolean).join(" ");
    const saldo = parc.currentBalance != null ? Number(parc.currentBalance) : (parc.balanceDue != null ? Number(parc.balanceDue) : (item.saldo != null ? Number(item.saldo) : null));
    const quitado = !!(bill.payOffDate || bill.payoffDate);
    const situacao = quitado ? "Quitado" : (saldo != null && saldo > 0.009 ? "Em aberto" : (saldo != null ? "Recebido" : "—"));
    const valorParc = parc.originalValue != null ? Number(parc.originalValue) : (parc.originalAmount != null ? Number(parc.originalAmount) : item.valor);
    const obs = bill.note || bill.notes || "";
    const dePagar = (det.attachments || []).some((a) => a.fonte === "pagar");
    const anexos = (det.attachments || []).map((a) => `
      <button type="button" class="btn btn-outline btn-sm" style="height:32px;" onclick="FluxoCaixaDiarioApp.baixarAnexo('${caixaEsc(a.billId || item.titulo)}','${caixaEsc(a.id)}','${caixaEsc(a.name || "anexo.pdf")}','${caixaEsc(a.fonte || "pagar")}')">${caixaEsc(a.description || a.name || "Anexo")}</button>
    `).join("");
    const semAnexo = dePagar
      ? "O título a pagar não tem anexo."
      : (pagar
        ? "Não há anexo no título a receber nem no contas a pagar de origem."
        : "Não há anexo neste título a receber. Quando ele nasce de um contas a pagar, os anexos ficam naquele título.");
    const origem = det.transferencia ? `
      <h4 style="margin:16px 0 6px;color:#105436;font-size:0.92rem;">Transferência entre contas</h4>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:0.86rem;color:#334155;">
        O valor sai do cliente ${caixaEsc(cliente)} e entra na empresa ${caixaEsc(item.empresa || this.companyName(item.companyId) || "—")}. É transferência entre contas do mesmo grupo. Anexo não se aplica.
      </div>` : (pagar ? `
      <h4 style="margin:16px 0 6px;color:#105436;font-size:0.92rem;">Origem no contas a pagar</h4>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:0.86rem;">
        Título ${caixaEsc(pagar.id)}${pagarBill.creditorName ? " · " + caixaEsc(pagarBill.creditorName) : ""}
        <div style="color:#64748b;margin-top:4px;">Os anexos deste recebimento ficam no contas a pagar.</div>
      </div>` : "");
    return `<div style="position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)FluxoCaixaDiarioApp.closeTitulo()">
      <div style="background:#fff;border-radius:12px;width:min(720px,96vw);max-height:86vh;overflow:auto;padding:18px 20px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <h3 style="margin:0;color:#105436;">Título a receber ${caixaEsc(item.titulo)}${item.parcela ? " · parcela " + caixaEsc(item.parcela) : ""}</h3>
          <button type="button" class="btn btn-cancel btn-sm" onclick="FluxoCaixaDiarioApp.closeTitulo()">Fechar</button>
        </div>
        ${det.loading ? `<p style="color:#64748b;">Abrindo o título a receber…</p>` : ""}
        ${det.error ? `<p style="color:#b91c1c;">${caixaEsc(det.error)}</p>` : ""}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-top:12px;font-size:0.86rem;">
          <div><span style="color:#64748b;">Cliente</span><div style="font-weight:700;">${caixaEsc(cliente)}</div></div>
          <div><span style="color:#64748b;">Documento</span><div style="font-weight:700;">${caixaEsc(doc || "—")}</div></div>
          <div><span style="color:#64748b;">Empresa</span><div>${caixaEsc(item.empresa || this.companyName(item.companyId) || item.companyId || "—")}</div></div>
          <div><span style="color:#64748b;">Vencimento</span><div>${caixaFmtDate(item.vencimento || (parc.dueDate || "").slice(0, 10) || item.date)}</div></div>
          <div><span style="color:#64748b;">Valor</span><div style="font-weight:700;color:#105436;">${caixaMoney(valorParc)}</div></div>
          <div><span style="color:#64748b;">Saldo</span><div>${saldo == null || !Number.isFinite(saldo) ? "—" : caixaMoney(saldo)}</div></div>
          <div><span style="color:#64748b;">Situação</span><div>${situacao}</div></div>
          <div><span style="color:#64748b;">Centro de custo</span><div>${caixaEsc(item.ccNome || "—")}</div></div>
          ${item.unidade ? `<div><span style="color:#64748b;">Unidade</span><div>${caixaEsc(item.unidade)}</div></div>` : ""}
        </div>
        ${obs ? `<p style="margin:12px 0 0;font-size:0.84rem;"><strong>Observação:</strong> ${caixaEsc(obs)}</p>` : ""}
        ${origem}
        ${det.transferencia ? "" : `<h4 style="margin:16px 0 6px;color:#105436;font-size:0.92rem;">${dePagar ? "Anexos do contas a pagar" : "Anexos"}</h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${det.loading ? "" : (anexos || `<span style="color:#64748b;font-size:0.84rem;">${semAnexo}</span>`)}</div>`}
      </div>
    </div>`;
  },

  detailHtml() {
    const det = this.detail;
    if (!det) return "";
    if (det.receber) return this.detailReceberHtml(det);
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
      const v = Number(a.amount) || 0;
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

  contaLabel(it) {
    if (it && it.conta) {
      const bank = this.bankInfo(it.companyId, it.conta);
      const key = this.accountKey({ companyId: it.companyId || "", number: it.conta });
      const acc = (this.accounts || []).find((a) => this.accountKey(a) === key);
      const nome = acc && acc.name && this.normNum(acc.name) !== this.normNum(it.conta) ? acc.name : "";
      const tipo = (it.tipoConta || this.ladoConta(it.companyId, it.conta)) === "investimento" ? "Investimento" : "Conta corrente";
      return [tipo, it.conta, nome, bank.bancoLabel].filter(Boolean).join(" · ");
    }
    return (it && it.tipoConta) === "investimento" ? "Investimento" : "Conta corrente";
  },

  ccNomeDe(id) {
    const hit = (this._ccAll || []).find((c) => String(c.id) === String(id || ""));
    return hit && hit.name ? String(hit.name).trim() : "";
  },

  nomeEmp(it) {
    return String((it && (it.ccNome || this.ccNomeDe(it.cc || it.ccId))) || "").trim();
  },

  rotuloEmp(it) {
    const id = String((it && (it.cc || it.ccId)) || "").trim();
    const nome = this.nomeEmp(it).toUpperCase();
    if (id && nome) return id + " - " + nome;
    return nome || id || "Sem empreendimento";
  },

  /** Conta a pagar: o PMP é de recebimento. A linha mostra o credor e o título. */
  ehPagar(it) {
    return !!(it && it.credor && !it.cliente);
  },

  /** empreendimento - unidade (título) NOME DO CLIENTE */
  resumoLinha(it) {
    if (!it) return "—";
    if (this.ehPagar(it)) {
      const credor = String(it.credor).trim().toUpperCase();
      const tit = [it.titulo || it.billId, it.parcela].filter(Boolean).join(" - ");
      return tit ? credor + " (" + tit + ")" : (credor || "—");
    }
    const emp = this.nomeEmp(it).toUpperCase() || String(it.cc || it.ccId || "").trim();
    const un = String(it.unidade || "").trim() || (it.outra ? String(it.documento || "").trim() : "");
    const prevista = !it.real && !it.outra && !!(it.titulo || it.billId);
    const tit = prevista
      ? ["Título " + (it.titulo || it.billId), it.parcela ? "Parcela " + it.parcela : (it.vencimento ? "venc. " + caixaFmtDate(it.vencimento) : "")].filter(Boolean).join(" · ")
      : [it.titulo || it.billId, it.parcela].filter(Boolean).join("/");
    const nome = String(it.cliente || it.credor || it.party || "").trim().toUpperCase();
    if (it.real && !un && !tit) return nome || String(it.historico || "Movimento").trim() || "—";
    const corpo = [emp, un].filter(Boolean).join(" - ");
    const comTit = tit ? (corpo ? corpo + " (" + tit + ")" : "(" + tit + ")") : corpo;
    return [comTit, nome].filter(Boolean).join(" ") || "—";
  },

  /** Vencimento original, PMP de 3 meses e o motivo da data no caixa. */
  dicaLinha(it) {
    if (!it || this.ehPagar(it)) return "";
    const linhas = [];
    if (it.vencimento) linhas.push("<b>Vencimento original</b> " + caixaEsc(caixaFmtDate(it.vencimento)));
    if (it.unidades && it.unidades.length > 1) {
      linhas.push("<b>Mesmo título</b> nas unidades " + caixaEsc(it.unidades.join(" e ")) + ". A parcela entra uma vez no caixa.");
    }
    if (!it.real && !it.outra) {
      const pmp = Number(it.pmp) || 0;
      const quando = pmp > 0 ? pmp + " dia(s) depois do vencimento" : (pmp < 0 ? Math.abs(pmp) + " dia(s) antes do vencimento" : "no próprio vencimento");
      linhas.push("<b>PMP</b> " + caixaEsc(String(pmp)) + " dia(s) · média de 3 meses, paga " + caixaEsc(quando));
      const passos = ["soma o PMP ao vencimento"];
      if (it.vencimento && !caixaEhUtil(it.vencimento)) passos.push("o vencimento não é dia útil, então parte de " + caixaFmtDate(it.vencEfetivo || caixaDiaUtil(it.vencimento, 1)));
      if (it.deslocadoDe && it.deslocadoDe !== it.date) passos.push("caiu em " + caixaFmtDate(it.deslocadoDe) + " e foi para " + caixaFmtDate(it.date));
      else passos.push("a previsão fica em " + caixaFmtDate(it.date));
      linhas.push(caixaEsc(passos.join("; ")) + ".");
    } else if (it.outra) {
      linhas.push(it.deslocadoDe
        ? caixaEsc("O vencimento não é dia útil. O recebimento entra em " + caixaFmtDate(it.date) + ".")
        : caixaEsc("Recebimento previsto em " + caixaFmtDate(it.date) + "."));
    } else if (!it.real && it.vencimento) {
      linhas.push(it.deslocadoDe
        ? caixaEsc("O pagamento foi para o dia útil " + caixaFmtDate(it.date) + ".")
        : caixaEsc("Pagamento previsto em " + caixaFmtDate(it.date) + "."));
    }
    return linhas.join("<br>");
  },

  /** Como o PMP deslocou a previsão: média de 3 meses e o próximo dia útil do vencimento. */
  pmpTitle(it) {
    if (!it || it.real || it.outra) return "";
    const pmp = Number(it.pmp) || 0;
    const habito = pmp > 0
      ? `paga em média ${pmp} dia(s) depois do vencimento`
      : (pmp < 0 ? `paga em média ${Math.abs(pmp)} dia(s) antes do vencimento` : "paga em média no próprio vencimento");
    const partes = [
      `PMP ${pmp}d: nos últimos 3 meses, cada recebimento entra com os dias entre o pagamento e o vencimento da parcela. A média arredondada desses dias é o PMP. Este cliente ${habito}.`
    ];
    if (it.vencimento && !caixaEhUtil(it.vencimento)) {
      partes.push(`O vencimento ${caixaFmtDate(it.vencimento)} cai em sábado, domingo ou feriado. O cliente paga no próximo dia útil, ${caixaFmtDate(it.vencEfetivo || caixaDiaUtil(it.vencimento, 1))}.`);
    } else if (it.vencimento) {
      partes.push(`Vencimento ${caixaFmtDate(it.vencimento)}.`);
    }
    if (it.deslocadoDe && it.deslocadoDe !== it.date) {
      partes.push(`Somando o PMP, a data caía em ${caixaFmtDate(it.deslocadoDe)} e passou para ${caixaFmtDate(it.date)}.`);
    } else {
      partes.push(`A previsão de caixa fica em ${caixaFmtDate(it.date)}.`);
    }
    return partes.join(" ");
  },

  contasHtml() {
    const grupos = this.contasComSaldo();
    if (!grupos.length) {
      return `<div class="cxd-vazio">${this.loading || this.progress ? "Lendo as contas…" : "Nenhuma conta com saldo disponível."}</div>`;
    }
    const sinal = (v) => (v < 0 ? "cxd-out" : "cxd-in");
    return `<div class="cxd-contas-grid">${grupos.map((g) => {
      const linhas = g.rows.map((a) => {
        const key = this.accountKey(a);
        const keyJs = encodeURIComponent(key).replace(/'/g, "%27");
        const bloq = this.accountBlocked(a);
        const on = this.accountIncluded(a);
        const outro = g.id === "investimento" ? "corrente" : "investimento";
        const titulo = bloq ? "Conta de parceria de um empreendimento fora do caixa" : (on ? "Considerada no saldo inicial" : "Fora do saldo inicial");
        const comp = this.ehCompromissada(a);
        const nomeConta = a.descricao || a.name || a.number || "Conta";
        const nomeJs = encodeURIComponent(nomeConta).replace(/'/g, "%27");
        return `<tr class="${on ? "" : "cxd-off"}${comp ? " cxd-comp-row" : ""}">
          <td class="cxd-flag">
            <label class="moura-switch" title="${titulo}">
              <input type="checkbox" ${on ? "checked" : ""} ${bloq ? "disabled" : ""} onchange="FluxoCaixaDiarioApp.setFlag(decodeURIComponent('${keyJs}'), this.checked)">
              <span class="moura-switch-track" aria-hidden="true"></span>
            </label>
          </td>
          <td class="cxd-conta${comp ? " cxd-comp-conta" : ""}" ${comp ? `title="Parametrizar prazo e saldo mínimo" onclick="FluxoCaixaDiarioApp.abrirComp(decodeURIComponent('${nomeJs}'))"` : ""}>
            <div title="${caixaEsc(nomeConta)}">${caixaEsc(nomeConta)}</div>
            ${a.descricao && a.number ? `<small>C/C ${caixaEsc(a.number)}</small>` : ""}
            ${comp ? `<small class="cxd-comp-dica">Clique para parametrizar</small>` : ""}
            ${bloq ? `<span class="cxd-bloq">empreendimento fora do caixa</span>` : ""}
          </td>
          <td class="cxd-banco">${a.banco ? caixaEsc(a.banco) : `<span class="cxd-zero">—</span>`}</td>
          <td class="cxd-num ${sinal(a.amount)}">${caixaMoney(a.amount)}</td>
          <td class="cxd-mover">
            <button type="button" title="Mover para ${outro === "investimento" ? "Investimento" : "Conta corrente"}" onclick="FluxoCaixaDiarioApp.setTipo(decodeURIComponent('${keyJs}'),'${outro}')">
              <i data-lucide="arrow-left-right" style="width:14px;height:14px;"></i>
            </button>
          </td>
        </tr>`;
      }).join("");
      const aberto = this.contasAbertas[g.id] !== false;
      return `<div class="cxd-gbox cxd-gbox-${g.id}${aberto ? "" : " is-fechado"}">
        <div class="cxd-gbox-head" role="button" tabindex="0" onclick="FluxoCaixaDiarioApp.toggleContas('${g.id}')">
          <i data-lucide="${aberto ? "chevron-down" : "chevron-right"}" style="width:16px;height:16px;"></i>
          <i data-lucide="${g.id === "investimento" ? "trending-up" : "landmark"}" style="width:15px;height:15px;"></i>
          <span>${caixaEsc(g.name)}</span>
          <small>${g.rows.length} conta(s) · ${g.ligadas} no caixa</small>
          <div class="cxd-gbox-tot">
            <div><label>Total do grupo</label><b>${caixaMoney(g.total)}</b></div>
            <div class="cxd-gbox-nocaixa"><label>No caixa do dia a dia</label><strong>${caixaMoney(g.marcado)}</strong></div>
          </div>
        </div>
        ${aberto ? `<div class="cxd-gbox-body">
          <table class="cxd-contas">
            <thead><tr>
              <th title="Considerar no saldo inicial">Caixa</th><th>Conta</th><th>Banco</th>
              <th>Saldo hoje</th><th></th>
            </tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>` : ""}
      </div>`;
    }).join("")}</div>`;
  },

  planoHtml(it) {
    const planos = it.planos && it.planos.length ? it.planos : (it.plano ? [it.plano] : []);
    if (!planos.length) return `<span class="cxd-muted">—</span>`;
    return `<span title="${caixaEsc(planos.join("\n"))}">${caixaEsc(planos[0])}${planos.length > 1 ? ` <small class="cxd-muted">+${planos.length - 1}</small>` : ""}</span>`;
  },

  origemHtml(it, lado) {
    if (it && it.outra) return `<span class="cxd-org cxd-org-outra" title="Recebimento previsto que não é contrato de venda">Outras entradas previstas</span>`;
    if (!it.real) return `<span class="cxd-org cxd-org-prev">${lado === "in" ? "Contas a receber" : "Contas a pagar"} · previsto</span>`;
    const o = it.origem || { tipo: "outro", rotulo: "—" };
    const dica = o.tipo === "cb"
      ? "Lançado direto em Caixa e bancos, sem título do contas a pagar/receber. Confira se não é inserção manual indevida."
      : (o.cod ? "Código de origem no Sienge: " + o.cod : "");
    return `<span class="cxd-org cxd-org-${o.tipo}" title="${caixaEsc(dica)}">${caixaEsc(o.rotulo)}</span>`;
  },

  conciliacaoHtml(it) {
    if (!it.real) return `<span class="cxd-muted">—</span>`;
    if (it.conciliado === true) return `<span class="cxd-conc cxd-conc-ok">Conciliado</span>`;
    if (it.conciliado === false) return `<span class="cxd-conc cxd-conc-no" title="Movimento ainda não conciliado com o extrato do banco no Sienge">Sem conciliação</span>`;
    return `<span class="cxd-muted" title="O Sienge não informou a conciliação deste movimento">—</span>`;
  },

  /** Lançamentos realizados do dia (ou do mês) que pedem atenção: avulsos de caixa e bancos e sem conciliação. */
  alertasMov(dias) {
    let manuais = 0;
    let semConc = 0;
    let valorSemConc = 0;
    (dias || []).forEach((d) => {
      (d.itens || []).concat(d.pagarItens || []).forEach((it) => {
        if (!it.real) return;
        if (it.origem && it.origem.tipo === "cb") manuais += 1;
        if (it.conciliado === false) {
          semConc += 1;
          valorSemConc += Math.abs(Number(it.valor) || 0);
        }
      });
    });
    return { manuais, semConc, valorSemConc };
  },

  /** Prazo mínimo da compromissada e piso que fica na conta corrente. */
  parametrosComp() {
    let prazo = 10;
    let piso = 200000;
    try {
      const raw = JSON.parse(localStorage.getItem("cxd_comp") || "{}");
      const p = Math.round(Number(raw.prazo));
      const s = Number(raw.piso);
      if (p >= 1) prazo = p;
      if (Number.isFinite(s) && s >= 0) piso = s;
    } catch (e) {}
    return { prazo, piso };
  },

  ehCompromissada(a) {
    const txt = [a && a.descricao, a && a.name, a && a.number].filter(Boolean).join(" ").toUpperCase();
    return /COMPROMISS/.test(txt);
  },

  abrirComp(nome) {
    this.compContaNome = nome || "Compromissada";
    this.compAberto = true;
    this.render();
  },

  fecharComp() {
    this.compAberto = false;
    this.render();
  },

  salvarComp() {
    const prazoEl = document.getElementById("cxd-comp-prazo");
    const pisoEl = document.getElementById("cxd-comp-piso");
    const prazo = Math.max(1, Math.round(Number(prazoEl && prazoEl.value) || 10));
    const piso = Math.max(0, caixaParseMoney(pisoEl && pisoEl.value));
    try { localStorage.setItem("cxd_comp", JSON.stringify({ prazo, piso })); } catch (e) {}
    this.compAberto = false;
    this.render();
  },

  resumoAlertaCaixa(a, limite) {
    const sem = a && a.semSaldo;
    const falta = sem && sem.date && sem.date <= limite ? sem : null;
    const cdb = a && a.cdb > 0.5 ? a.cdb : 0;
    const comp = a && a.comp > 0.5 ? a.comp : 0;
    if (!falta && !(cdb > 0.5) && !(comp > 0.5)) return null;
    return {
      falta,
      cdb,
      comp,
      fimCdb: (a && a.fimCdb) || "",
      fimComp: (a && a.fimComp) || ""
    };
  },

  /** Ao entrar na tela, avisa falta de caixa ou sobra para aplicar nas empresas geridas, nos próximos 30 dias. */
  async avisarCaixa() {
    if (this._avisoDisparado) return;
    this._avisoDisparado = true;
    const token = this._avisoToken;
    const hoje = this.hoje();
    const limite = caixaAddDays(hoje, 29);
    const empresas = this.empresasGeridas();
    const atual = this.companyKey();
    const itens = [];
    const guardar = (id, nome, a) => {
      const r = this.resumoAlertaCaixa(a, limite);
      if (!r) return;
      itens.push(Object.assign({ id: String(id), nome: nome || this.companyName(id) }, r));
    };
    if (atual) guardar(atual, this.companyName(atual), this.analiseCaixa(this.linhasProjecao().linhas));
    const outros = empresas.map((c) => String(c.id)).filter((id) => id !== atual);
    let cursor = 0;
    const worker = async () => {
      while (cursor < outros.length) {
        if (this._avisoToken !== token) return;
        const id = outros[cursor++];
        try {
          const r = await this.projetarEmpresa(id);
          if (this._avisoToken !== token) return;
          if (r && r.erro) continue;
          guardar(id, r && r.nome, r);
        } catch (e) {
          console.warn("[Caixa diário] aviso de caixa", id, e);
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (this._avisoToken !== token || !itens.length) return;
    itens.sort((a, b) => {
      const fa = a.falta ? 0 : 1;
      const fb = b.falta ? 0 : 1;
      if (fa !== fb) return fa - fb;
      if (a.falta && b.falta && a.falta.date !== b.falta.date) return String(a.falta.date).localeCompare(String(b.falta.date));
      return String(a.nome).localeCompare(String(b.nome), "pt");
    });
    this.avisoCaixa = itens;
    this.render();
  },

  fecharAviso() {
    this.avisoCaixa = null;
    this.render();
  },

  abrirEmpresaAviso(id) {
    const sid = String(id || "");
    this.avisoCaixa = null;
    if (!sid || this.companyIds[0] === sid) {
      this.render();
      return;
    }
    this.companyIds = [sid];
    try { localStorage.setItem("cxd_company", sid); } catch (e) {}
    this.openEmp = false;
    this.qEmp = "";
    this.openDay = "";
    this.load();
  },

  avisoHtml() {
    const itens = this.avisoCaixa;
    if (!itens || !itens.length) return "";
    const n = itens.length;
    const cards = itens.map((it) => {
      const blocos = [];
      if (it.falta) {
        const pior = it.falta.menorData && it.falta.menorData !== it.falta.date
          ? ` O ponto mais baixo é ${caixaFmtDate(it.falta.menorData)}, com ${caixaMoney(it.falta.menor)}.`
          : "";
        blocos.push(`<p class="cxd-sem-saldo"><b>Falta caixa em ${caixaFmtDate(it.falta.date)}</b>Conta corrente e aplicação somadas: ${caixaMoney(it.falta.valor)}.${pior}</p>`);
      }
      if (it.cdb > 0.5) {
        blocos.push(`<p class="cxd-aplica-cdb"><b>Aplicar em CDB:</b> ${caixaMoney(it.cdb)}${it.fimCdb ? `, até ${caixaFmtDate(it.fimCdb)}` : ""}.</p>`);
      }
      if (it.comp > 0.5) {
        blocos.push(`<p class="cxd-aplica-comp"><b>Aplicar na compromissada:</b> ${caixaMoney(it.comp)}${it.fimComp ? `, até ${caixaFmtDate(it.fimComp)}` : ""}.</p>`);
      }
      return `<article class="cxd-aviso-emp">
        <header>
          <strong>${caixaEsc(it.id)} - ${caixaEsc(it.nome)}</strong>
          <button type="button" class="btn btn-outline" onclick="FluxoCaixaDiarioApp.abrirEmpresaAviso('${caixaEsc(it.id)}')">Abrir</button>
        </header>
        ${blocos.join("")}
      </article>`;
    }).join("");
    return `<div class="cxd-aviso-modal" onclick="if(event.target===this)FluxoCaixaDiarioApp.fecharAviso()">
      <div class="cxd-aviso-dialog" role="dialog" aria-label="Caixa nos próximos 30 dias">
        <h3>Caixa nos próximos 30 dias</h3>
        <p>${n === 1 ? "1 empresa" : n + " empresas"} com falta de caixa ou dinheiro parado para aplicar.</p>
        <div class="cxd-aviso-lista">${cards}</div>
        <div class="cxd-comp-actions">
          <button type="button" class="btn btn-cancel" onclick="FluxoCaixaDiarioApp.fecharAviso()">Fechar</button>
        </div>
      </div>
    </div>`;
  },

  compModalHtml() {
    if (!this.compAberto) return "";
    const p = this.parametrosComp();
    const pisoTxt = p.piso.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<div class="cxd-comp-modal" onclick="if(event.target===this)FluxoCaixaDiarioApp.fecharComp()">
      <div class="cxd-comp-dialog" role="dialog" aria-label="Parametrizar compromissada">
        <h3>Parametrizar compromissada</h3>
        <p>${caixaEsc(this.compContaNome || "Compromissada")}</p>
        <label>Prazo mínimo
          <input id="cxd-comp-prazo" type="number" min="1" step="1" value="${p.prazo}">
          <small>dias</small>
        </label>
        <label>Saldo mínimo na conta corrente
          <input id="cxd-comp-piso" type="text" inputmode="decimal" value="${pisoTxt}">
        </label>
        <div class="cxd-comp-actions">
          <button type="button" class="btn btn-cancel" onclick="FluxoCaixaDiarioApp.fecharComp()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="FluxoCaixaDiarioApp.salvarComp()">Salvar</button>
        </div>
      </div>
    </div>`;
  },

  /**
   * Sobra da conta corrente acima do saldo mínimo.
   * De 10 a 31 dias, a sugestão é compromissada. Acima de 31 dias, CDB, porque o IOF zera.
   * O resgate olha só os próximos 30 dias corridos: o dia em que a conta corrente
   * ficaria negativa e o valor para cobrir as despesas de 7 dias úteis.
   */
  DIAS_SEM_SALDO: 60,

  /**
   * Leitura dos próximos dias: quanto da conta corrente pode ir para CDB ou compromissada,
   * os resgates dos próximos 30 dias e o primeiro dia, nos próximos 60, em que conta corrente
   * e aplicação somadas ficam negativas.
   */
  analiseCaixa(linhas) {
    const hoje = this.hoje();
    const fut = (linhas || []).filter((l) => l.d.date >= hoje);
    const par = this.parametrosComp();
    const vazio = { serie: [], par, cdb: 0, comp: 0, fimCdb: "", fimComp: "", diasCdb: 0, diasComp: 0, plano: [], semSaldo: null };
    if (!fut.length) return vazio;
    const IOF = 31;
    const serie = fut.map((l) => ({ date: l.d.date, cc: l.acumCc, inv: l.acumInv }));
    const minAte = (n) => {
      let m = Infinity;
      const fim = Math.min(n, serie.length);
      for (let i = 0; i < fim; i++) m = Math.min(m, serie[i].cc);
      return m;
    };
    const cabe = (n) => {
      if (n < 1 || !serie.length) return 0;
      const folga = minAte(n) - par.piso;
      return folga > 0.5 ? folga : 0;
    };
    const cdb = cabe(IOF + 1);
    const comp = Math.max(0, cabe(par.prazo) - cdb);
    const ate = (valor) => {
      let last = "";
      if (!(valor > 0.5)) return last;
      for (let i = 0; i < serie.length; i++) {
        if (serie[i].cc - par.piso + 0.05 < valor) break;
        last = serie[i].date;
      }
      return last;
    };
    const diasDe = (iso) => {
      if (!iso || !serie.length) return 0;
      const a = new Date(serie[0].date + "T12:00:00");
      const b = new Date(iso + "T12:00:00");
      return Math.round((b - a) / 86400000) + 1;
    };
    const fimCdb = ate(cdb);
    const fimComp = ate(comp);
    const plano = this.planoResgates(serie.filter((p) => p.date <= caixaAddDays(hoje, 29)));
    const limite = caixaAddDays(hoje, this.DIAS_SEM_SALDO - 1);
    let semSaldo = null;
    serie.forEach((p) => {
      if (p.date > limite) return;
      const total = p.cc + p.inv;
      if (total >= -0.5) return;
      if (!semSaldo) semSaldo = { date: p.date, valor: total, menor: total, menorData: p.date };
      else if (total < semSaldo.menor) {
        semSaldo.menor = total;
        semSaldo.menorData = p.date;
      }
    });
    return { serie, par, cdb, comp, fimCdb, fimComp, diasCdb: diasDe(fimCdb), diasComp: diasDe(fimComp), plano, semSaldo };
  },

  semSaldoHtml(s) {
    if (!s) return "";
    const pior = s.menorData !== s.date
      ? ` O ponto mais baixo é ${caixaFmtDate(s.menorData)}, com ${caixaMoney(s.menor)}.`
      : "";
    return `<div class="cxd-sem-saldo" role="alert"><b>Sem dinheiro em ${caixaFmtDate(s.date)}</b>Nos próximos ${this.DIAS_SEM_SALDO} dias, a conta corrente e a aplicação somadas ficam negativas: ${caixaMoney(s.valor)} nesse dia.${pior}</div>`;
  },

  aplicacaoHtml(linhas) {
    const a = this.analiseCaixa(linhas);
    if (!a.serie.length) return "";
    const par = a.par;
    const cdb = a.cdb;
    const comp = a.comp;
    const pisoTxt = caixaMoney(par.piso);
    const msgs = [];
    if (a.semSaldo) msgs.push(this.semSaldoHtml(a.semSaldo));
    if (cdb > 0.5) {
      msgs.push(`<p class="cxd-aplica-cdb"><b>Aplicar em CDB:</b> ${caixaMoney(cdb)}. Esse valor fica acima do mínimo da conta corrente por ${a.diasCdb} dias, até ${caixaFmtDate(a.fimCdb)}, mais do que os 31 dias em que o IOF zera. Mantenha ${pisoTxt} na conta corrente.</p>`);
    }
    if (comp > 0.5) {
      msgs.push(`<p class="cxd-aplica-comp"><b>Aplicar na compromissada:</b> ${caixaMoney(comp)}. Esse valor pode ficar aplicado por ${a.diasComp} dias, até ${caixaFmtDate(a.fimComp)}, entre o prazo mínimo de ${par.prazo} dias e os 31 dias em que o IOF do CDB zera. Mantenha ${pisoTxt} na conta corrente.</p>`);
    }
    const plano = a.plano;
    if (plano.length) {
      const itens = plano.map((r) => {
        const cobre = r.uteis >= 7
          ? `cobre as despesas de 7 dias úteis, até ${caixaFmtDate(r.fim)}`
          : `cobre as despesas de ${r.uteis} dia${r.uteis === 1 ? " útil" : "s úteis"}, até ${caixaFmtDate(r.fim)}`;
        const falta = r.falta > 0.5 ? ` O saldo da aplicação não alcança o restante (${caixaMoney(r.falta)}).` : "";
        return `<li><b>Resgatar em ${caixaFmtDate(r.dia)}:</b> ${caixaMoney(r.valor)}. Esse valor ${cobre}.${falta}</li>`;
      }).join("");
      msgs.push(`<div class="cxd-aplica-resgate"><b>Resgate da aplicação</b><ul>${itens}</ul></div>`);
    }
    return msgs.length ? `<div class="cxd-aplica">${msgs.join("")}</div>` : "";
  },

  /** Próximos resgates: no dia em que a conta corrente ficaria negativa, o valor do buraco dos 7 dias úteis seguintes. */
  planoResgates(serie) {
    const out = [];
    if (!serie.length) return out;
    let retirado = 0;
    let desde = 0;
    const setimo = (iso) => {
      let d = String(iso || "").slice(0, 10);
      let n = 0;
      for (let g = 0; g < 40 && n < 7; g++) {
        if (caixaEhUtil(d)) n += 1;
        if (n >= 7) return d;
        d = caixaAddDays(d, 1);
      }
      return d;
    };
    for (let volta = 0; volta < 40; volta++) {
      let i = -1;
      for (let k = desde; k < serie.length; k++) {
        if (serie[k].cc + retirado < -0.5 && serie[k].inv - retirado > 0.5) { i = k; break; }
      }
      if (i < 0) break;
      const queda = serie[i].date;
      let dia = caixaDiaUtil(queda, -1);
      if (dia < serie[0].date) dia = caixaEhUtil(serie[0].date) ? serie[0].date : caixaDiaUtil(serie[0].date, 1);
      const fimAlvo = setimo(dia);
      const fimSerie = serie[serie.length - 1].date;
      const fim = fimAlvo > fimSerie ? fimSerie : fimAlvo;
      const inicio = queda < dia ? queda : dia;
      let minCc = 0;
      let uteis = 0;
      for (let d = dia; d <= fim; d = caixaAddDays(d, 1)) {
        if (caixaEhUtil(d)) uteis += 1;
      }
      serie.forEach((p) => {
        if (p.date < inicio || p.date > fim) return;
        minCc = Math.min(minCc, p.cc + retirado);
      });
      const precisa = Math.max(0, -minCc);
      const disponivel = Math.max(0, serie[i].inv - retirado);
      const valor = Math.min(precisa, disponivel);
      if (!(valor > 0.5)) break;
      out.push({
        dia,
        valor: Math.round(valor * 100) / 100,
        fim,
        uteis,
        falta: Math.round(Math.max(0, precisa - valor) * 100) / 100
      });
      retirado += valor;
      desde = i + 1;
      if (valor + 0.5 < precisa) break;
    }
    return out;
  },

  linhaDetalhe(it, cls, click) {
    const dica = this.dicaLinha(it);
    return `<tr class="${cls}${click ? " cxd-click" : ""}" ${click || ""}>
      <td class="cxd-desc cxd-tip">${caixaEsc(this.resumoLinha(it))}${dica ? `<span class="cxd-tip-box">${dica}</span>` : ""}</td>
      <td class="cxd-num">${caixaMoney(it.valor)}</td>
    </tr>`;
  },

  tabelaLinhas(rows) {
    return `<table class="cxd-sheet cxd-analitico cxd-linhas"><tbody>${rows}</tbody></table>`;
  },

  grupoDetalhe(tipo, titulo, qtd, total, corpo, extra) {
    const open = this.detOpen[tipo] === true;
    return `<div class="cxd-grp cxd-grp-${extra || tipo}">
      <button type="button" class="cxd-grp-head" onclick="FluxoCaixaDiarioApp.toggleGrupo('${tipo}')">
        <i data-lucide="${open ? "chevron-down" : "chevron-right"}" style="width:16px;height:16px;"></i>
        <strong>${titulo}</strong>
        <span>${qtd} lançamento(s)</span>
        <b>${caixaMoney(total)}</b>
      </button>
      ${open ? corpo : ""}
    </div>`;
  },

  diaDetalheHtml(aberto) {
    const d = aberto.d;
    const lista = (d.itens || []).map((it, i) => ({ it, i }));
    const carteira = lista.filter((x) => !x.it.real && !x.it.outra);
    const outros = lista.filter((x) => x.it.outra);
    const reais = lista.filter((x) => x.it.real);
    const porEmp = [];
    const empMap = {};
    carteira.forEach((x) => {
      const key = String(x.it.cc || x.it.ccId || "");
      if (!empMap[key]) {
        empMap[key] = { key, rotulo: this.rotuloEmp(x.it), itens: [], total: 0 };
        porEmp.push(empMap[key]);
      }
      empMap[key].itens.push(x);
      empMap[key].total += Number(x.it.valor) || 0;
    });
    porEmp.sort((a, b) => b.total - a.total);
    porEmp.forEach((g) => g.itens.sort((a, b) => (Number(b.it.valor) || 0) - (Number(a.it.valor) || 0)));
    const linhaIn = (x) => {
      if (x.it.outra && (x.it.titulo || x.it.billId)) {
        return this.linhaDetalhe(x.it, "cxd-det-in", `onclick="FluxoCaixaDiarioApp.openRecebimento('${d.date}',${x.i})" title="Abrir o título a receber"`);
      }
      const abre = !!((x.it.customerId || x.it.clientId) && x.it.billId);
      return this.linhaDetalhe(x.it, "cxd-det-in", abre ? `onclick="FluxoCaixaDiarioApp.openEntrada('${d.date}',${x.i})"` : "");
    };
    const subs = porEmp.map((g) => {
      const id = "emp:" + g.key;
      const abertoEmp = this.detOpen[id] === true;
      const linhas = g.itens.map(linhaIn).join("");
      return `<div class="cxd-sub">
        <button type="button" class="cxd-grp-head" onclick="FluxoCaixaDiarioApp.toggleGrupo('${id}')">
          <i data-lucide="${abertoEmp ? "chevron-down" : "chevron-right"}" style="width:16px;height:16px;"></i>
          <strong>${caixaEsc(g.rotulo)}</strong>
          <span>${g.itens.length} lançamento(s)</span>
          <b>${caixaMoney(g.total)}</b>
        </button>
        ${abertoEmp ? this.tabelaLinhas(linhas) : ""}
      </div>`;
    }).join("");
    const totalCarteira = carteira.reduce((s, x) => s + (Number(x.it.valor) || 0), 0);
    const totalOutros = outros.reduce((s, x) => s + (Number(x.it.valor) || 0), 0);
    const totalReais = reais.reduce((s, x) => s + (Number(x.it.valor) || 0), 0);
    const porValor = (a, b) => (Number(b.it.valor) || 0) - (Number(a.it.valor) || 0);
    outros.sort(porValor);
    reais.sort(porValor);
    const linhasOutros = outros.map(linhaIn).join("");
    const linhasReais = reais.map(linhaIn).join("");
    const saidas = (d.pagarItens || []).slice().sort((a, b) => (Number(b.valor) || 0) - (Number(a.valor) || 0));
    const linhaSaida = (it) => {
      const abre = !!it.titulo;
      return this.linhaDetalhe(it, "cxd-det-out", abre ? `onclick="FluxoCaixaDiarioApp.openTitulo('${caixaEsc(it.key)}')"` : "");
    };
    const grupoSaida = (chave, rotulo, lista) => {
      if (!lista.length) return "";
      const total = lista.reduce((s, it) => s + (Number(it.valor) || 0), 0);
      const id = "saida:" + chave;
      const abertoGrp = this.detOpen[id] === true;
      return `<div class="cxd-sub">
        <button type="button" class="cxd-grp-head" onclick="FluxoCaixaDiarioApp.toggleGrupo('${id}')">
          <i data-lucide="${abertoGrp ? "chevron-down" : "chevron-right"}" style="width:16px;height:16px;"></i>
          <strong>${rotulo}</strong>
          <span>${lista.length} lançamento(s)</span>
          <b>${caixaMoney(total)}</b>
        </button>
        ${abertoGrp ? this.tabelaLinhas(lista.map(linhaSaida).join("")) : ""}
      </div>`;
    };
    const comprometidas = saidas.filter((it) => it.natureza !== "previsao");
    const previsoes = saidas.filter((it) => it.natureza === "previsao");
    const corpoSaidas = grupoSaida("comprometido", "Comprometido", comprometidas) + grupoSaida("previsao", "Previsões", previsoes);
    const blocos = [];
    if (carteira.length) blocos.push(this.grupoDetalhe("carteira", "Carteira Prevista", carteira.length, totalCarteira, subs, "in"));
    if (outros.length) blocos.push(this.grupoDetalhe("outros", "Outros Recebimentos", outros.length, totalOutros, this.tabelaLinhas(linhasOutros), "outros"));
    if (reais.length) blocos.push(this.grupoDetalhe("reais", "Entradas", reais.length, totalReais, this.tabelaLinhas(linhasReais), "in"));
    if (saidas.length) blocos.push(this.grupoDetalhe("saidas", "Saídas", saidas.length, aberto.sair, corpoSaidas, "out"));
    const al = this.alertasMov([d]);
    return `<div class="cxd-daydet">
      <div class="cxd-daydet-head">
        <strong>${caixaFmtDate(d.date)}</strong>
        <span class="cxd-chip ${d.real ? "cxd-chip-real" : "cxd-chip-prev"}">${d.real ? "Realizado · extrato bancário" : "Previsto"}</span>
        ${al.manuais ? `<span class="cxd-chip cxd-chip-cb" title="Lançamentos direto em Caixa e bancos, sem título do contas a pagar/receber">${al.manuais} lançamento(s) de caixa e bancos</span>` : ""}
        ${al.semConc ? `<span class="cxd-chip cxd-chip-nc" title="Movimentos ainda não conciliados com o extrato do banco">${al.semConc} sem conciliação · ${caixaMoney(al.valorSemConc)}</span>` : ""}
        <span class="cxd-daydet-res">Saldo do dia <b class="${aberto.movimento < 0 ? "cxd-out" : "cxd-in"}">${caixaMoney(aberto.movimento)}</b></span>
        <button type="button" class="btn btn-cancel btn-sm" onclick="FluxoCaixaDiarioApp.toggle('${d.date}')">Fechar</button>
      </div>
      ${blocos.join("")}
    </div>`;
  },

  /** Saldo de cada dia: começa nas contas ligadas e soma entradas e saídas da conta corrente e da aplicação. */
  linhasProjecao() {
    const saldoTipos = this.saldoPorTipo();
    let cc = saldoTipos.corrente;
    let inv = saldoTipos.investimento;
    const linhas = (this.days || []).map((d) => {
      const entrar = Number(d.entrar) || 0;
      const sair = Number(d.pagar) || 0;
      const movimento = entrar - sair;
      const inicialCc = cc;
      const inicialInv = inv;
      cc += (Number(d.entrarCc) || 0) - (Number(d.sairCc) || 0);
      inv += (Number(d.entrarInv) || 0) - (Number(d.sairInv) || 0);
      return {
        d, entrar, sair, movimento,
        inicial: inicialCc + inicialInv, inicialCc, inicialInv,
        acumCc: cc, acumInv: inv, acum: cc + inv, passado: d.real
      };
    });
    return { linhas, saldoTipos, fimCc: cc, fimInv: inv };
  },

  /** Caixa de uma empresa calculado sem desenhar a tela (painel da pagadoria). */
  async projetarEmpresa(companyId) {
    const id = String(companyId);
    const app = Object.create(FluxoCaixaDiarioApp);
    Object.assign(app, {
      companyIds: [id],
      days: [], accounts: [], recItems: [], outras: [], movs: [], payItems: [],
      totals: { saldo: 0, entrar: 0, pagar: 0 },
      openingDate: "", progress: "", error: "", loading: false,
      detOpen: {}, flags: {}, tipos: {}, ccExcl: {},
      _types: {}, _banks: {}, _nomes: {}, _gen: 0,
      render() {},
      paintProgress() {},
      ensureCompany() {},
      apiPagar() {
        const base = FluxoCaixaDiarioApp.apiPagar();
        if (!base) return base;
        const api = Object.create(base);
        api.noteProgress = () => {};
        return api;
      }
    });
    await app.load();
    const hoje = app.hoje();
    const proj = app.linhasProjecao();
    const a = app.analiseCaixa(proj.linhas);
    const agora = proj.linhas.find((l) => l.d.date === hoje);
    return {
      companyId: id,
      nome: app.companyName(id),
      contas: (app.accounts || []).filter((x) => app.accountIncluded(x)).length,
      cc: agora ? agora.inicialCc : proj.saldoTipos.corrente,
      inv: agora ? agora.inicialInv : proj.saldoTipos.investimento,
      cdb: a.cdb,
      comp: a.comp,
      fimCdb: a.fimCdb,
      fimComp: a.fimComp,
      resgates: a.plano.map((r) => ({ dia: r.dia, valor: r.valor, falta: r.falta || 0 })),
      semSaldo: a.semSaldo,
      erro: app.error || ""
    };
  },

  render() {
    const root = document.getElementById("fluxo-caixa-diario-root");
    if (!root) return;
    const hoje = this.hoje();
    const proj = this.linhasProjecao();
    const saldoTipos = proj.saldoTipos;
    const saldoInicial = saldoTipos.total;
    const linhas = proj.linhas;
    const fimCc = proj.fimCc;
    const fimInv = proj.fimInv;
    const fim = fimCc + fimInv;
    const visiveis = linhas.filter((l) => {
      const iso = l.d.date;
      if (caixaEhUtil(iso) || iso === hoje || iso === this.openDay) return true;
      return Math.abs(l.entrar) >= 0.005 || Math.abs(l.sair) >= 0.005;
    });
    const alMes = this.alertasMov(this.days);
    const prevWrap = root.querySelector(".cxd-wrap-mx");
    const prevScroll = prevWrap && prevWrap.scrollLeft > 0 ? prevWrap.scrollLeft : null;
    const prevBody = root.querySelector(".cxd-body");
    const prevTop = prevBody ? prevBody.scrollTop : 0;
    const prevContas = Array.from(root.querySelectorAll(".cxd-gbox-body")).map((el) => el.scrollTop);
    const prevListas = ["cxd-emp-list", "cxd-cc-list"].map((id) => {
      const el = document.getElementById(id);
      return el ? el.scrollTop : 0;
    });
    const totEntrar = Number(this.totals.entrar) || 0;
    const totSair = Number(this.totals.pagar) || 0;
    const semana = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const colCls = (line) => {
      const c = [];
      if (line.d.date === hoje) c.push("cxd-col-hoje");
      if (this.openDay === line.d.date) c.push("cxd-col-open");
      if (line.passado) c.push("cxd-col-past");
      if (!caixaEhUtil(line.d.date)) c.push("cxd-col-naoutil");
      return c.join(" ");
    };
    const cell = (line, html, cls, extra) => `<td class="${colCls(line)} ${cls || ""}" data-col="${line.d.date}" onclick="FluxoCaixaDiarioApp.toggle('${line.d.date}')"${extra || ""}>${html}</td>`;
    const cabecalho = visiveis.map((line) => {
      const d = line.d;
      const has = (d.itens && d.itens.length) || (d.pagarItens && d.pagarItens.length);
      const wd = semana[new Date(d.date + "T12:00:00").getDay()];
      const al = d.real ? this.alertasMov([d]) : { semConc: 0, manuais: 0 };
      const marcas = [al.semConc ? `${al.semConc} sem conciliação` : "", al.manuais ? `${al.manuais} de caixa e bancos` : ""].filter(Boolean).join(" · ");
      return `<th class="${colCls(line)}" data-col="${d.date}" onclick="FluxoCaixaDiarioApp.toggle('${d.date}')" title="${d.real ? "Realizado (extrato bancário)" : "Previsto"}${!caixaEhUtil(d.date) ? " · fim de semana ou feriado" : ""}${marcas ? " · " + marcas : ""}${has ? " · clique para ver entradas e saídas" : ""}">
        <div>${caixaFmtDate(d.date).slice(0, 5)}</div>
        <div class="cxd-wd">${d.date === hoje ? '<span class="cxd-tag">hoje</span>' : wd}${al.semConc ? '<span class="cxd-dot cxd-dot-nc"></span>' : (has ? '<span class="cxd-dot"></span>' : "")}</div>
      </th>`;
    }).join("");
    const sinal = (v) => (v < 0 ? "cxd-out" : (v > 0 ? "cxd-in" : "cxd-zero"));
    const linhaInicial = visiveis.map((l) => cell(l, caixaMoney(l.inicial), sinal(l.inicial))).join("");
    const linhaEntradas = visiveis.map((l) => cell(l, caixaMoney(l.entrar), l.entrar ? "cxd-in" : "cxd-zero")).join("");
    const linhaSaidas = visiveis.map((l) => cell(l, caixaMoney(l.sair), l.sair ? "cxd-out" : "cxd-zero")).join("");
    const linhaDia = visiveis.map((l) => cell(l, caixaMoney(l.movimento), sinal(l.movimento))).join("");
    const tipSaldo = (ccV, invV) => `<span class="cxd-tip-box"><b>Conta corrente</b> ${caixaMoney(ccV)}<br><b>Investimento</b> ${caixaMoney(invV)}</span>`;
    const linhaAcum = visiveis.map((l) => cell(l, caixaMoney(l.acum) + tipSaldo(l.acumCc, l.acumInv), `cxd-tip ${sinal(l.acum)}`)).join("");
    const linhaCc = visiveis.map((l) => cell(l, caixaMoney(l.acumCc), `${sinal(l.acumCc)}${l.acumCc < -0.5 ? " cxd-resgate" : ""}`)).join("");
    const avisoAplicacao = this.aplicacaoHtml(linhas);
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
    const iniLabel = this.openingDate
      ? `Saldo inicial · contas ligadas em ${caixaFmtDate(this.openingDate)}`
      : "Saldo inicial · contas ligadas";
    root.innerHTML = `
      <style>
        #fluxo-caixa-diario-root { color:#0f172a; }
        #fluxo-caixa-diario-root .cxd-page { display:flex; flex-direction:column; }
        #fluxo-caixa-diario-root .cxd-head { background:#105436; padding:16px 20px; border-radius:12px 12px 0 0; }
        #fluxo-caixa-diario-root .cxd-head h2 { margin:0; color:#fff; font-size:1.15rem; }
        #fluxo-caixa-diario-root .cxd-head p { margin:4px 0 0; color:rgba(255,255,255,.8); font-size:.75rem; }
        #fluxo-caixa-diario-root .cxd-body { background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:14px 16px; }
        #fluxo-caixa-diario-root .cxd-tools { display:flex; gap:12px; align-items:flex-end; margin-bottom:12px; flex-wrap:nowrap; }
        #fluxo-caixa-diario-root .cxd-tools label { font-size:.75rem; font-weight:700; color:#475569; flex:0 0 auto; }
        #fluxo-caixa-diario-root .cxd-tools input[type=month] { display:block; height:34px; border:1px solid #e2e8f0; border-radius:6px; padding:0 8px; margin-top:4px; }
        #fluxo-caixa-diario-root .cxd-tools .ml-emp-filter { flex:1 1 0; min-width:180px; width:auto; max-width:480px; }
        #fluxo-caixa-diario-root .cxd-fora { flex:0 0 auto; white-space:nowrap; font-size:.74rem; color:#9a3412; background:#ffedd5; border-radius:999px; padding:3px 10px; font-weight:600; align-self:center; }
        #fluxo-caixa-diario-root .cxd-sheet { width:100%; border-collapse:collapse; background:#fff; font-size:.82rem; font-variant-numeric:tabular-nums; }
        #fluxo-caixa-diario-root .cxd-sheet td { padding:7px 10px; border-bottom:1px solid #eef2f6; }
        #fluxo-caixa-diario-root .cxd-num { text-align:right; white-space:nowrap; }
        #fluxo-caixa-diario-root .cxd-in { color:#105436; }
        #fluxo-caixa-diario-root .cxd-out { color:#c2410c; }
        #fluxo-caixa-diario-root .cxd-zero { color:#94a3b8; }
        #fluxo-caixa-diario-root .cxd-tag { margin-left:8px; background:#105436; color:#fff; border-radius:999px; padding:1px 7px; font-size:.66rem; font-weight:700; }
        #fluxo-caixa-diario-root .cxd-wrap { border:1px solid #e2e8f0; border-radius:8px; overflow-x:auto; overflow-y:hidden; background:#fff; margin-bottom:14px; }
        #fluxo-caixa-diario-root .cxd-title { margin:0 0 6px; font-size:.78rem; font-weight:700; color:#105436; letter-spacing:.03em; }
        #fluxo-caixa-diario-root .cxd-title span { font-weight:500; color:#64748b; letter-spacing:0; }
        #fluxo-caixa-diario-root .cxd-vazio { padding:16px; color:#64748b; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:10px; font-size:.84rem; }
        #fluxo-caixa-diario-root .cxd-contas-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(520px, 1fr)); gap:12px; margin-bottom:10px; align-items:start; }
        #fluxo-caixa-diario-root .cxd-gbox { background:#fff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
        #fluxo-caixa-diario-root .cxd-gbox-head { display:flex; align-items:center; gap:8px; width:100%; padding:9px 12px; background:#e7f6ee; color:#105436; font-weight:700; font-size:.84rem; border:0; cursor:pointer; text-align:left; font-family:inherit; }
        #fluxo-caixa-diario-root .cxd-gbox-investimento .cxd-gbox-head { background:#fff7ed; color:#9a3412; }
        #fluxo-caixa-diario-root .cxd-gbox-head small { flex:1; font-weight:500; font-size:.74rem; opacity:.85; }
        #fluxo-caixa-diario-root .cxd-gbox-head strong { font-variant-numeric:tabular-nums; }
        #fluxo-caixa-diario-root .cxd-gbox-tot { display:flex; gap:18px; text-align:right; }
        #fluxo-caixa-diario-root .cxd-gbox-tot label { display:block; font-size:.62rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; opacity:.7; }
        #fluxo-caixa-diario-root .cxd-gbox-tot b { font-weight:600; font-variant-numeric:tabular-nums; opacity:.8; }
        #fluxo-caixa-diario-root .cxd-gbox-nocaixa strong { font-size:.95rem; }
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
        #fluxo-caixa-diario-root .cxd-mx .cxd-lbl { position:sticky; left:0; z-index:1; background:#fff; text-align:left; font-weight:700; color:#0f172a; min-width:210px; border-right:1px solid #e2e8f0; cursor:default; }
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
        #fluxo-caixa-diario-root .cxd-mx tr.cxd-row-hot td,
        #fluxo-caixa-diario-root .cxd-mx th.cxd-hot,
        #fluxo-caixa-diario-root .cxd-mx td.cxd-hot { box-shadow:inset 0 0 0 999px rgba(243,112,33,.16); }
        #fluxo-caixa-diario-root .cxd-mx tr.cxd-row-hot td.cxd-hot,
        #fluxo-caixa-diario-root .cxd-mx tr.cxd-row-hot th.cxd-hot { box-shadow:inset 0 0 0 999px rgba(243,112,33,.34); }
        #fluxo-caixa-diario-root .cxd-tip-box { display:none; }
        #cxd-float-tip { position:fixed; z-index:80; background:#0c3d28; color:#fff; padding:8px 10px; border-radius:8px; font-size:.72rem; font-weight:600; line-height:1.45; text-align:left; white-space:nowrap; box-shadow:0 8px 20px rgba(15,23,42,.2); pointer-events:none; }
        #cxd-float-tip b { font-weight:700; margin-right:6px; }
        #fluxo-caixa-diario-root .cxd-comp-conta { cursor:pointer; }
        #fluxo-caixa-diario-root tr.cxd-comp-row:hover td.cxd-comp-conta { background:#eff6ff; }
        #fluxo-caixa-diario-root .cxd-comp-dica { color:#1d4ed8; font-weight:700; }
        #fluxo-caixa-diario-root .cxd-comp-modal { position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:80; display:flex; align-items:center; justify-content:center; padding:16px; }
        #fluxo-caixa-diario-root .cxd-comp-dialog { background:#fff; border-radius:12px; width:min(420px, 96vw); padding:18px 20px; box-shadow:0 16px 40px rgba(15,23,42,.18); }
        #fluxo-caixa-diario-root .cxd-comp-dialog h3 { margin:0; color:#105436; font-size:1.05rem; }
        #fluxo-caixa-diario-root .cxd-comp-dialog > p { margin:4px 0 14px; color:#64748b; font-size:.82rem; }
        #fluxo-caixa-diario-root .cxd-comp-dialog label { display:block; margin-bottom:12px; font-size:.72rem; font-weight:700; color:#334155; text-transform:uppercase; }
        #fluxo-caixa-diario-root .cxd-comp-dialog input { display:block; width:100%; height:38px; margin-top:4px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:.9rem; box-sizing:border-box; text-transform:none; font-weight:600; }
        #fluxo-caixa-diario-root .cxd-comp-dialog small { display:block; margin-top:2px; font-weight:600; color:#64748b; text-transform:none; }
        #fluxo-caixa-diario-root .cxd-comp-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }
        #fluxo-caixa-diario-root .cxd-comp-actions .btn { height:36px; }
        #fluxo-caixa-diario-root .cxd-aviso-modal { position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:90; display:flex; align-items:center; justify-content:center; padding:16px; }
        #fluxo-caixa-diario-root .cxd-aviso-dialog { background:#fff; border-radius:12px; width:min(640px, 96vw); max-height:min(78vh, 720px); display:flex; flex-direction:column; padding:18px 20px; box-shadow:0 16px 40px rgba(15,23,42,.18); }
        #fluxo-caixa-diario-root .cxd-aviso-dialog h3 { margin:0; color:#105436; font-size:1.05rem; }
        #fluxo-caixa-diario-root .cxd-aviso-dialog > p { margin:4px 0 12px; color:#64748b; font-size:.82rem; }
        #fluxo-caixa-diario-root .cxd-aviso-lista { overflow:auto; display:flex; flex-direction:column; gap:10px; min-height:0; }
        #fluxo-caixa-diario-root .cxd-aviso-emp { border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:6px; }
        #fluxo-caixa-diario-root .cxd-aviso-emp header { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        #fluxo-caixa-diario-root .cxd-aviso-emp header strong { color:#0f172a; font-size:.86rem; }
        #fluxo-caixa-diario-root .cxd-aviso-emp header .btn { height:32px; padding:0 12px; }
        #fluxo-caixa-diario-root .cxd-aviso-emp p { margin:0; }
        #fluxo-caixa-diario-root .cxd-mx .cxd-col-tot { background:#f1f5f9; font-weight:800; border-left:1px solid #cbd5e1; cursor:default; }
        #fluxo-caixa-diario-root .cxd-mx th.cxd-col-tot { background:#0c3d28; }
        #fluxo-caixa-diario-root .cxd-mx tr.cxd-row-cc td { background:#f8fafc; }
        #fluxo-caixa-diario-root .cxd-mx tr.cxd-row-inv td { background:#fffaf5; }
        #fluxo-caixa-diario-root .cxd-mx tr.cxd-row-acum td { font-weight:800; border-top:2px solid #105436; }
        #fluxo-caixa-diario-root .cxd-mx td.cxd-resgate { box-shadow:inset 0 -2px 0 #c2410c; }
        #fluxo-caixa-diario-root .cxd-aplica { display:flex; flex-direction:column; gap:6px; margin:0 0 12px; }
        #fluxo-caixa-diario-root .cxd-aplica p { margin:0; padding:8px 12px; border-radius:8px; font-size:.8rem; font-weight:600; }
        #fluxo-caixa-diario-root .cxd-aplica-cdb { background:#e7f6ee; color:#105436; }
        #fluxo-caixa-diario-root .cxd-aplica-comp { background:#eff6ff; color:#1e3a8a; }
        #fluxo-caixa-diario-root .cxd-sem-saldo { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; border-left:4px solid #dc2626; padding:8px 12px; border-radius:8px; font-size:.8rem; font-weight:600; }
        #fluxo-caixa-diario-root .cxd-sem-saldo b { display:block; color:#b91c1c; font-size:.84rem; margin-bottom:2px; }
        #fluxo-caixa-diario-root .cxd-aplica-resgate { background:#fff7ed; color:#9a3412; padding:8px 12px; border-radius:8px; font-size:.8rem; font-weight:600; }
        #fluxo-caixa-diario-root .cxd-aplica-resgate > span { display:block; margin-top:2px; font-weight:500; }
        #fluxo-caixa-diario-root .cxd-aplica-resgate ul { margin:6px 0 0; padding-left:18px; }
        #fluxo-caixa-diario-root .cxd-aplica-resgate li { margin:4px 0; }
        #fluxo-caixa-diario-root .cxd-org-outra { background:#ecfeff; color:#0e7490; }
        #fluxo-caixa-diario-root .cxd-analitico td.cxd-conta { white-space:normal; color:#334155 !important; font-size:.74rem; }
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
        #fluxo-caixa-diario-root .cxd-grp-outros .cxd-grp-head { background:#ecfeff; color:#0e7490; border-left:4px solid #0891b2; }
        #fluxo-caixa-diario-root .cxd-grp-out .cxd-grp-head { background:#fff4ec; color:#c2410c; border-left:4px solid #f37021; }
        #fluxo-caixa-diario-root .cxd-sub { margin:0 10px 0 20px; }
        #fluxo-caixa-diario-root .cxd-sub .cxd-grp-head { background:#f8fafc; color:#0f172a; border-left:4px solid #105436; }
        #fluxo-caixa-diario-root .cxd-grp .cxd-linhas td:first-child { width:auto; font-weight:700; font-size:.8rem; }
        #fluxo-caixa-diario-root .cxd-linhas td.cxd-num { width:140px; font-weight:800; }
        #fluxo-caixa-diario-root .cxd-grp-in td { background:#f7fcf9; color:#105436; }
        #fluxo-caixa-diario-root .cxd-grp-out td { background:#fffaf6; color:#9a3412; }
        #fluxo-caixa-diario-root .cxd-grp td:first-child { width:96px; font-weight:700; font-size:.76rem; }
        #fluxo-caixa-diario-root .cxd-grp td { font-size:.78rem; }
        #fluxo-caixa-diario-root .cxd-grp-vazio { color:#94a3b8 !important; padding:12px !important; }
        #fluxo-caixa-diario-root tr.cxd-click { cursor:pointer; }
        #fluxo-caixa-diario-root tr.cxd-det-in.cxd-click:hover td { background:#e7f6ee; }
        #fluxo-caixa-diario-root tr.cxd-det-out.cxd-click:hover td { background:#ffedd5; }
        #fluxo-caixa-diario-root .cxd-conta-tag { margin-left:6px; font-size:.7rem; color:#64748b; }
        #fluxo-caixa-diario-root .cxd-mx-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0 0 6px; }
        #fluxo-caixa-diario-root .cxd-mx-bar .cxd-title { margin:0; flex:1 1 auto; }
        #fluxo-caixa-diario-root .cxd-naoutil-sw { margin-left:auto; }
        #fluxo-caixa-diario-root .cxd-mx th.cxd-col-naoutil:not(.cxd-col-open):not(.cxd-col-hoje) { background:#64748b; }
        #fluxo-caixa-diario-root .cxd-dot-nc { background:#dc2626; box-shadow:0 0 0 2px rgba(255,255,255,.7); }
        #fluxo-caixa-diario-root .cxd-chip-cb { background:#ffedd5; color:#9a3412; }
        #fluxo-caixa-diario-root .cxd-chip-nc { background:#fee2e2; color:#b91c1c; }
        #fluxo-caixa-diario-root .cxd-analitico { table-layout:fixed; }
        #fluxo-caixa-diario-root .cxd-analitico thead th { background:#f1f5f9; color:#475569; font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.03em; text-align:left; padding:6px 10px; border-bottom:1px solid #e2e8f0; }
        #fluxo-caixa-diario-root .cxd-analitico thead th.cxd-num { text-align:right; }
        #fluxo-caixa-diario-root .cxd-analitico td { overflow:hidden; text-overflow:ellipsis; }
        #fluxo-caixa-diario-root .cxd-analitico td.cxd-desc { white-space:normal; }
        #fluxo-caixa-diario-root .cxd-analitico td.cxd-plano { white-space:nowrap; color:#334155 !important; }
        #fluxo-caixa-diario-root .cxd-muted { color:#94a3b8; }
        #fluxo-caixa-diario-root .cxd-org, #fluxo-caixa-diario-root .cxd-conc { display:inline-block; font-size:.68rem; font-weight:700; border-radius:999px; padding:2px 8px; white-space:nowrap; }
        #fluxo-caixa-diario-root .cxd-org-cp { background:#fff4ec; color:#c2410c; }
        #fluxo-caixa-diario-root .cxd-org-cr { background:#e7f6ee; color:#105436; }
        #fluxo-caixa-diario-root .cxd-org-cb { background:#ffedd5; color:#9a3412; border:1px solid #fdba74; }
        #fluxo-caixa-diario-root .cxd-org-tr { background:#e0f2fe; color:#075985; }
        #fluxo-caixa-diario-root .cxd-org-outro, #fluxo-caixa-diario-root .cxd-org-prev { background:#f1f5f9; color:#64748b; }
        #fluxo-caixa-diario-root .cxd-conc-ok { background:#e7f6ee; color:#105436; }
        #fluxo-caixa-diario-root .cxd-conc-no { background:#fee2e2; color:#b91c1c; }
      </style>
      <div class="cxd-page">
        <div class="cxd-head">
          <p>Mês atual e os próximos 3 meses, de ${caixaEsc(this.rotuloPeriodo())}. Saldo inicial no 1º dia. Nos dias anteriores, o extrato das contas ligadas; de hoje em diante, a previsão.</p>
        </div>
        <div class="cxd-body">
          <div class="cxd-tools">
            ${filtro}
            ${filtroCc}
          </div>
          <p id="cxd-progress" style="margin:0 0 10px;color:#105436;font-size:0.8rem;font-weight:600;" ${this.progress ? "" : "hidden"}>${caixaEsc(this.progress || "")}</p>
          ${this.error ? `<div style="margin-bottom:10px;padding:10px;background:#fff7ed;color:#9a3412;border-radius:8px;font-size:0.82rem;">${caixaEsc(this.error)}</div>` : ""}
          <p class="cxd-title">CONTAS COM SALDO <span>· ligue as contas que entram no caixa</span></p>
          ${this.contasHtml()}
          <div class="cxd-saldo-ini"><span>${iniLabel}</span><span>${caixaMoney(saldoInicial)}</span></div>
          ${avisoAplicacao}
          ${this.loading ? `<p style="color:#64748b;">Montando o fluxo…</p>` : `
          <div class="cxd-mx-bar">
            <p class="cxd-title">MOVIMENTO <span>· ${caixaEsc(this.rotuloPeriodo())} · dias anteriores realizados, de hoje em diante previstos · clique no dia para ver entradas e saídas</span></p>
            ${alMes.manuais ? `<span class="cxd-chip cxd-chip-cb" title="Lançamentos direto em Caixa e bancos, sem título do contas a pagar/receber. Abra o dia para conferir.">${alMes.manuais} lançamento(s) de caixa e bancos no mês</span>` : ""}
            ${alMes.semConc ? `<span class="cxd-chip cxd-chip-nc" title="Movimentos ainda não conciliados com o extrato do banco. Os dias com ponto vermelho têm movimento sem conciliação.">${alMes.semConc} sem conciliação · ${caixaMoney(alMes.valorSemConc)}</span>` : ""}
          </div>
          <div class="cxd-wrap cxd-wrap-mx">
            <table class="cxd-mx">
              <thead><tr>
                <th class="cxd-lbl">Dia</th>
                ${cabecalho}
                <th class="cxd-col-tot" data-col="tot">Total</th>
              </tr></thead>
              <tbody>
                <tr><td class="cxd-lbl">Saldo inicial</td>${linhaInicial}<td class="cxd-col-tot" data-col="tot">${caixaMoney(saldoInicial)}</td></tr>
                <tr><td class="cxd-lbl">Entradas</td>${linhaEntradas}<td class="cxd-col-tot cxd-in" data-col="tot">${caixaMoney(totEntrar)}</td></tr>
                <tr><td class="cxd-lbl">Saídas</td>${linhaSaidas}<td class="cxd-col-tot cxd-out" data-col="tot">${caixaMoney(totSair)}</td></tr>
                <tr class="cxd-row-dia"><td class="cxd-lbl">Saldo do dia</td>${linhaDia}<td class="cxd-col-tot ${sinal(totEntrar - totSair)}" data-col="tot">${caixaMoney(totEntrar - totSair)}</td></tr>
                <tr class="cxd-row-cc"><td class="cxd-lbl" title="Saldo das contas correntes ligadas, depois das entradas e saídas do dia">Saldo acum. conta corrente</td>${linhaCc}<td class="cxd-col-tot ${sinal(fimCc)}" data-col="tot">${caixaMoney(fimCc)}</td></tr>
                <tr class="cxd-row-acum"><td class="cxd-lbl">Saldo total</td>${linhaAcum}<td class="cxd-col-tot cxd-tip ${sinal(fim)}" data-col="tot">${caixaMoney(fim)}${tipSaldo(fimCc, fimInv)}</td></tr>
              </tbody>
            </table>
          </div>
          ${detalheDia}`}
        </div>
      </div>
      ${this.detailHtml()}
      ${this.compModalHtml()}
      ${this.avisoHtml()}`;
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
    ["cxd-emp-list", "cxd-cc-list"].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el && prevListas[i]) el.scrollTop = prevListas[i];
    });
    this.bindCompanyFilter();
    this.bindMxHover();
    if (window.lucide) lucide.createIcons();
  },

  bindMxHover() {
    const table = document.querySelector("#fluxo-caixa-diario-root .cxd-mx");
    const dropTip = () => {
      const tip = document.getElementById("cxd-float-tip");
      if (tip) tip.remove();
    };
    if (!table) { dropTip(); return; }
    const clear = () => {
      table.querySelectorAll(".cxd-hot").forEach((el) => el.classList.remove("cxd-hot"));
      table.querySelectorAll("tr.cxd-row-hot").forEach((el) => el.classList.remove("cxd-row-hot"));
      dropTip();
    };
    const showTip = (cell) => {
      const tipCell = cell && cell.closest
        ? (cell.classList.contains("cxd-tip") ? cell : cell.closest(".cxd-tip"))
        : null;
      const box = tipCell ? tipCell.querySelector(".cxd-tip-box") : null;
      if (!box) { dropTip(); return; }
      let tip = document.getElementById("cxd-float-tip");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "cxd-float-tip";
        document.body.appendChild(tip);
      }
      tip.innerHTML = box.innerHTML;
      const r = tipCell.getBoundingClientRect();
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      tip.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + "px";
      tip.style.top = Math.max(8, r.top - h - 6) + "px";
    };
    table.addEventListener("mouseover", (ev) => {
      const cell = ev.target.closest("td, th");
      if (!cell || !table.contains(cell)) return;
      table.querySelectorAll(".cxd-hot").forEach((el) => el.classList.remove("cxd-hot"));
      table.querySelectorAll("tr.cxd-row-hot").forEach((el) => el.classList.remove("cxd-row-hot"));
      const tr = cell.parentElement;
      if (tr) tr.classList.add("cxd-row-hot");
      const col = cell.getAttribute("data-col");
      if (col != null) table.querySelectorAll('[data-col="' + col + '"]').forEach((el) => el.classList.add("cxd-hot"));
      showTip(cell);
    });
    table.addEventListener("mouseleave", clear);
    const det = document.querySelector("#fluxo-caixa-diario-root .cxd-daydet");
    if (det) {
      det.addEventListener("mouseover", (ev) => showTip(ev.target));
      det.addEventListener("mouseleave", dropTip);
    }
  }
};


window.CaixaPosicaoStore = CaixaPosicaoStore;
window.FluxoCaixaDiarioApp = FluxoCaixaDiarioApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "fluxo-caixa-diario") FluxoCaixaDiarioApp.init();
});
