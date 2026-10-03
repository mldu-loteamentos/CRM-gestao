/**
 * Compras · Follow-up de previsões (padrão Fila de Cobrança)
 * + Configurações: mínimo de dias para lançar o documento a pagar.
 */
const COMPRAS_PRAZO_LS = "crm_compras_prazo_lancamento_v1";
const COMPRAS_PRAZO_DEFAULT = { 0: 9, 1: 8, 2: 8, 3: 8, 4: 8, 5: 10, 6: 10 };

function parseComprasPrazo(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw || "{}") || {}; } catch (e) { obj = {}; }
  }
  if (!obj || typeof obj !== "object") obj = {};
  const days = {};
  for (let i = 0; i <= 6; i++) {
    const n = Number(obj[i] != null ? obj[i] : COMPRAS_PRAZO_DEFAULT[i]);
    days[i] = Number.isFinite(n) && n >= 0 ? Math.round(n) : COMPRAS_PRAZO_DEFAULT[i];
  }
  days.updatedAt = Number(obj.updatedAt || 0);
  return days;
}

window.mergeComprasPrazoLancamento = function (localStr, cloudStr) {
  const local = parseComprasPrazo(localStr);
  const cloud = parseComprasPrazo(cloudStr);
  const picked = Number(local.updatedAt || 0) >= Number(cloud.updatedAt || 0) ? local : cloud;
  return JSON.stringify(picked);
};

const ComprasPrevisoesApp = {
  SKIP_OPS: {
    "Reaprop. Abatimento Adiantamento - entrada": 1,
    Recebimento: 1
  },
  SKIP_ACCOUNTS: { PAR: 1, "PAR-3": 1 },
  SKIP_TITULO_PARCELA: {
    "76367-3": 1, "76367-4": 1, "76367-5": 1, "76367-6": 1,
    "76366-3": 1, "76366-4": 1, "76366-5": 1, "76366-6": 1,
    "76364-3": 1, "76364-4": 1, "76364-5": 1, "76364-6": 1,
    "76363-3": 1, "76363-4": 1, "76363-5": 1, "76363-6": 1,
    "76074-3": 1, "76074-4": 1, "76074-5": 1, "76074-6": 1
  },
  DOC_PREVISAO: {
    PRCOMC: 1, PRDIST: 1, PFATDIR: 1, PFINBAN: 1,
    PRV: 1, PRVC: 1, PRVR: 1, PCT: 1, PPC: 1, PFPCC: 1, PFPC: 1
  },
  DOC_NAO_PREVISAO: {
    NF: 1, NFE: 1, NFS: 1, NFSE: 1, NFF: 1,
    REP: 1, REPF: 1, REPASSE: 1,
    DIST: 1, DISTR: 1,
    DEV: 1, DEVO: 1
  },
  WEEKDAYS: [
    { id: 0, label: "Domingo", short: "Dom", weekend: true },
    { id: 6, label: "Sábado", short: "Sáb", weekend: true },
    { id: 1, label: "Segunda-feira", short: "Seg" },
    { id: 2, label: "Terça-feira", short: "Ter" },
    { id: 3, label: "Quarta-feira", short: "Qua" },
    { id: 4, label: "Quinta-feira", short: "Qui" },
    { id: 5, label: "Sexta-feira", short: "Sex" }
  ],
  GROUPS: {
    VENCIDOS: "vencidos",
    PRAZO: "prazo",
    AVENCER: "avencer",
    PAGOS: "pagos"
  },

  state: {
    inited: false,
    configInited: false,
    loading: false,
    consulted: false,
    error: "",
    startDate: "",
    endDate: "",
    updatedAt: "",
    companies: [],
    companyIds: [],
    creditorIds: [],
    deptIds: [],
    openEmp: false,
    openCred: false,
    openDept: false,
    qEmp: "",
    qCred: "",
    qDept: "",
    qTitulo: "",
    qCredor: "",
    status: "aberto",
    allRows: [],
    shown: [],
    billsByTitulo: {},
    parcelasCache: {},
    openTitulo: "",
    parcelas: [],
    parcelasLoading: false,
    parcelasError: "",
    prazoDraft: null
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  },

  isoToday() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  isoDate(v) {
    const s = String(v == null ? "" : v).trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  },

  addDaysIso(iso, days) {
    const s = this.isoDate(iso);
    if (!s) return "";
    const d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
    d.setDate(d.getDate() + Number(days || 0));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  weekdayOf(iso) {
    const s = this.isoDate(iso) || this.isoToday();
    return new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))).getDay();
  },

  loadPrazo() {
    try { return parseComprasPrazo(localStorage.getItem(COMPRAS_PRAZO_LS) || "{}"); }
    catch (e) { return parseComprasPrazo({}); }
  },

  savePrazo(days) {
    const next = parseComprasPrazo(days);
    next.updatedAt = Date.now();
    try { localStorage.setItem(COMPRAS_PRAZO_LS, JSON.stringify(next)); } catch (e) {}
    if (typeof window.forceUploadLocalConfig === "function") {
      window.forceUploadLocalConfig(true).catch(function () {});
    }
    return next;
  },

  minDaysToday() {
    const prazo = this.loadPrazo();
    return Number(prazo[this.weekdayOf(this.isoToday())] || 0);
  },

  minLaunchDue() {
    return this.addDaysIso(this.isoToday(), this.minDaysToday());
  },

  paymentDateOf(bill, pay, bm) {
    return this.isoDate(bm && bm.bankMovementDate)
      || this.isoDate(pay && (pay.paymentDate || pay.date || pay.payOffDate || pay.bankMovementDate))
      || this.isoDate(bill && (bill.paymentDate || bill.payOffDate || bill.payoffDate || bill.liquidationDate || bill.settlementDate));
  },

  billBalance(bill) {
    if (!bill) return null;
    const raw = bill.balanceAmount != null ? bill.balanceAmount
      : (bill.outstandingBalance != null ? bill.outstandingBalance
        : (bill.currentBalance != null ? bill.currentBalance
          : (bill.remainingAmount != null ? bill.remainingAmount : null)));
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },

  billSituation(bill, pay) {
    return this.fold(
      (bill && (bill.situation || bill.status || bill.billStatus || bill.installmentStatus || bill.paymentStatus))
      || (pay && (pay.situation || pay.status))
      || ""
    );
  },

  isPago(bill, pay, bm) {
    if (this.paymentDateOf(bill, pay, bm)) return true;
    const sit = this.billSituation(bill, pay);
    if (sit === "PG" || /\b(PG|PAGO|PAGA|LIQUIDADO|BAIXADO|QUITADO|PAID|SETTLED)\b/.test(sit)) return true;
    const bal = this.billBalance(bill);
    if (bal != null && Math.abs(bal) <= 0.009) return true;
    const tipo = this.fold((pay && (pay.operationTypeName || pay.operationName)) || (bm && bm.operationName) || "");
    if (tipo && /BAIXA|LIQUID|QUITAC/.test(tipo) && !/ESTORNO|CANCEL/.test(tipo)) return true;
    return false;
  },

  defaultRange() {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const iso = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
    return { startDate: iso(start), endDate: iso(end) };
  },

  fmtDate(raw) {
    const s = String(raw || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
    return s || "—";
  },

  money(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  companyName(id) {
    const c = (this.state.companies || []).find((x) => String(x.id) === String(id));
    return c ? String(c.name || c.tradeName || "").toUpperCase() : "";
  },

  listOrNull(x) {
    if (x == null) return [null];
    if (Array.isArray(x)) return x.length ? x : [null];
    return [x];
  },

  firstWord(s) {
    return String(s || "").trim().split(/\s+/)[0] || "";
  },

  docCode(s) {
    return String(s == null ? "" : s).trim().toUpperCase();
  },

  forecastFlag(bill) {
    const raw = bill && (bill.forecastDocument != null ? bill.forecastDocument : bill.documentForecast);
    if (raw == null || raw === "") return null;
    if (raw === true || raw === 1) return true;
    if (raw === false || raw === 0) return false;
    const s = String(raw).trim().toUpperCase();
    if (s === "S" || s === "SIM" || s === "Y" || s === "YES" || s === "TRUE" || s === "1") return true;
    if (s === "N" || s === "NAO" || s === "NÃO" || s === "NO" || s === "FALSE" || s === "0") return false;
    return null;
  },

  ccDeptHint(ccNome) {
    const parts = String(ccNome || "").split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 1] : "";
  },

  isDocPrevisao(docId, docName, bill) {
    const flag = this.forecastFlag(bill);
    if (flag === true) return true;
    const id = this.docCode(docId);
    const nome = this.fold(docName);
    const token = this.docCode(this.firstWord(docId || docName));
    if (this.DOC_PREVISAO[id] || this.DOC_PREVISAO[token]) return true;
    if (nome.indexOf("PREVISAO") >= 0 || nome.indexOf("PREVIS") >= 0) return true;
    if (flag === false) return false;
    if (this.DOC_NAO_PREVISAO[id] || this.DOC_NAO_PREVISAO[token]) return false;
    return !!id;
  },

  isNotaDoc(docId, docName, bill) {
    const id = this.docCode(docId);
    const token = this.docCode(this.firstWord(docId || docName));
    if (/^NF/.test(id) || /^NF/.test(token)) return true;
    const nome = this.fold(docName);
    if (nome.indexOf("NOTA FISCAL") >= 0) return true;
    if (bill && this.forecastFlag(bill) === false && this.DOC_NAO_PREVISAO[id] && /^NF/.test(id)) return true;
    return false;
  },

  indexBills(payload) {
    const bills = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    const map = {};
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const id = String(bill.billId);
      if (!map[id]) map[id] = [];
      map[id].push(bill);
    });
    this.state.billsByTitulo = map;
  },

  titleHasNota(titulo) {
    return (this.state.billsByTitulo[String(titulo)] || []).some((b) =>
      this.isNotaDoc(b.documentIdentificationId, b.documentIdentificationName, b)
    );
  },

  transform(payload) {
    const bills = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    const rows = [];
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      this.listOrNull(bill.paymentsCategories).forEach((cat) => {
        this.listOrNull(bill.payments).forEach((pay) => {
          this.listOrNull(pay && pay.bankMovements).forEach((bm) => {
            this.listOrNull(bill.departamentsCosts).forEach((dep) => {
              this.listOrNull(bill.buildingsCosts).forEach((bld) => {
                const operacao = (bm && bm.operationName) || "";
                const conta = (bm && bm.accountNumber) || "";
                if (this.SKIP_OPS[operacao]) return;
                if (this.SKIP_ACCOUNTS[conta]) return;
                const docId = this.docCode(bill.documentIdentificationId);
                const docNome = this.firstWord(bill.documentIdentificationName);
                if (!this.isDocPrevisao(docId, bill.documentIdentificationName, bill)) return;
                const titulo = String(bill.billId);
                const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
                if (this.SKIP_TITULO_PARCELA[titulo + "-" + parcela]) return;
                const rateio = cat && cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) : 100;
                const valor = Number(bill.originalAmount) || 0;
                rows.push({
                  companyId: String(bill.companyId || ""),
                  credor: String(bill.creditorName || "").trim(),
                  titulo,
                  documento: String(bill.documentNumber || ""),
                  vencimento: String(bill.dueDate || "").slice(0, 10),
                  emissao: String(bill.issueDate || "").slice(0, 10),
                  parcela,
                  docId,
                  docNome,
                  valor,
                  planoId: cat && cat.financialCategoryId != null ? String(cat.financialCategoryId) : "",
                  plano: (cat && cat.financialCategoryName) || "",
                  ccId: cat && cat.costCenterId != null ? String(cat.costCenterId) : "",
                  ccNome: (cat && cat.costCenterName) || "",
                  rateio,
                  tipoBaixa: (pay && pay.operationTypeName) || "",
                  dataPagamento: this.paymentDateOf(bill, pay, bm),
                  pago: this.isPago(bill, pay, bm),
                  saldo: this.billBalance(bill),
                  situacao: this.billSituation(bill, pay),
                  operacao,
                  conta,
                  departamento: (dep && dep.name) || this.ccDeptHint((cat && cat.costCenterName) || "") || "",
                  idObra: bld && bld.buildingId != null ? String(bld.buildingId) : "",
                  valorAjustado: valor * ((Number.isFinite(rateio) ? rateio : 100) / 100)
                });
              });
            });
          });
        });
      });
    });
    const seen = new Set();
    return rows.filter((r) => {
      const k = [r.titulo, r.emissao, r.parcela, r.departamento].join("|");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  },

  uniqueItems(rows, idFn, labelFn) {
    const map = new Map();
    (rows || []).forEach((r) => {
      const id = idFn(r);
      if (!id) return;
      if (!map.has(id)) map.set(id, { id, name: labelFn(r), label: labelFn(r) });
    });
    return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR"));
  },

  empItems() {
    const fromRows = this.uniqueItems(this.state.allRows, (r) => r.companyId, (r) => {
      const name = this.companyName(r.companyId) || r.companyId;
      return r.companyId + " - " + name;
    });
    if (fromRows.length) return fromRows;
    return (this.state.companies || []).map((c) => ({
      id: String(c.id),
      name: String(c.name || "").toUpperCase(),
      label: c.id + " - " + String(c.name || "").toUpperCase()
    }));
  },

  credItems() {
    return this.uniqueItems(this.state.allRows, (r) => this.fold(r.credor), (r) => r.credor.toUpperCase());
  },

  deptItems() {
    return this.uniqueItems(this.state.allRows, (r) => this.fold(r.departamento), (r) => r.departamento.toUpperCase());
  },

  rowGroup(r) {
    if (r.pago) return this.GROUPS.PAGOS;
    const today = this.isoToday();
    if (r.vencimento && r.vencimento < today) return this.GROUPS.VENCIDOS;
    const minDue = this.minLaunchDue();
    if (r.vencimento && minDue && r.vencimento < minDue) return this.GROUPS.PRAZO;
    return this.GROUPS.AVENCER;
  },

  groupMeta(group) {
    const map = {
      vencidos: { label: "Vencidos", bg: "#fee2e2", color: "#991b1b", order: 1 },
      prazo: { label: "Prazo insuficiente para lançar", bg: "#ffedd5", color: "#9a3412", order: 2 },
      avencer: { label: "A vencer", bg: "#ecfdf5", color: "#047857", order: 3 },
      pagos: { label: "Pagos", bg: "#f1f5f9", color: "#475569", order: 4 }
    };
    return map[group] || map.avencer;
  },

  applyFilters() {
    const emp = new Set((this.state.companyIds || []).map(String));
    const cred = new Set((this.state.creditorIds || []).map(String));
    const dept = new Set((this.state.deptIds || []).map(String));
    const qTitulo = this.fold(this.state.qTitulo).replace(/\s+/g, "");
    const qCredor = this.fold(this.state.qCredor);
    const status = this.state.status;
    const start = this.state.startDate || "";
    const end = this.state.endDate || "";
    this.state.shown = (this.state.allRows || []).filter((r) => {
      if (emp.size && !emp.has(String(r.companyId))) return false;
      if (cred.size && !cred.has(this.fold(r.credor))) return false;
      if (dept.size) {
        const depFold = this.fold(r.departamento);
        const ccFold = this.fold(r.ccNome);
        const okDept = [...dept].some((id) => depFold === id || (id && ccFold.indexOf(id) >= 0));
        if (!okDept) return false;
      }
      if (start && r.vencimento && r.vencimento < start) return false;
      if (end && r.vencimento && r.vencimento > end) return false;
      if (status === "aberto" && r.pago) return false;
      if (status === "pago" && !r.pago) return false;
      if (qTitulo) {
        const blob = this.fold([r.titulo, r.documento, r.parcela].join("")).replace(/\s+/g, "");
        if (blob.indexOf(qTitulo) < 0) return false;
      }
      if (qCredor && this.fold(r.credor).indexOf(qCredor) < 0) return false;
      r.virouNota = this.titleHasNota(r.titulo);
      r.grupo = this.rowGroup(r);
      return true;
    }).sort((a, b) => {
      const ga = this.groupMeta(a.grupo).order;
      const gb = this.groupMeta(b.grupo).order;
      if (ga !== gb) return ga - gb;
      return String(a.vencimento).localeCompare(String(b.vencimento))
        || String(a.credor).localeCompare(String(b.credor), "pt-BR")
        || String(a.titulo).localeCompare(String(b.titulo));
    });
  },

  kpis() {
    const rows = this.state.shown || [];
    let total = 0;
    let vencido = 0;
    let prazo = 0;
    let aVencer = 0;
    rows.forEach((r) => {
      const v = Number(r.valorAjustado) || 0;
      total += v;
      if (r.grupo === this.GROUPS.VENCIDOS) vencido += v;
      else if (r.grupo === this.GROUPS.PRAZO) prazo += v;
      else if (r.grupo === this.GROUPS.AVENCER) aVencer += v;
    });
    return { qtd: rows.length, total, vencido, prazo, aVencer };
  },

  bindFilters() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    const bind = (id, key, openKey, qKey, itemsFn, nouns) => {
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          self.state[openKey] = !self.state[openKey];
          if (openKey === "openEmp") { self.state.openCred = false; self.state.openDept = false; }
          if (openKey === "openCred") { self.state.openEmp = false; self.state.openDept = false; }
          if (openKey === "openDept") { self.state.openEmp = false; self.state.openCred = false; }
          self.paintFilters();
        },
        setQuery(q) {
          self.state[qKey] = q || "";
          const box = document.getElementById(id + "-list");
          if (box) {
            box.innerHTML = MlEmpresaFilter.listHtml({
              id,
              items: itemsFn(),
              selectedIds: self.state[key],
              query: self.state[qKey],
              nouns
            });
          }
        },
        toggleId(itemId, on) {
          const sid = String(itemId);
          const cur = self.state[key].slice();
          self.state[key] = on ? (cur.includes(sid) ? cur : cur.concat(sid)) : cur.filter((x) => x !== sid);
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        },
        selectAll() {
          self.state[key] = itemsFn().map((x) => String(x.id));
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        },
        selectNone() {
          self.state[key] = [];
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        }
      });
    };
    bind("cprev-filter-emp", "companyIds", "openEmp", "qEmp", () => this.empItems(), { singular: "empresa", plural: "empresas" });
    bind("cprev-filter-cred", "creditorIds", "openCred", "qCred", () => this.credItems(), { singular: "credor", plural: "credores" });
    bind("cprev-filter-dept", "deptIds", "openDept", "qDept", () => this.deptItems(), { singular: "departamento", plural: "departamentos" });
  },

  paintFilters() {
    if (!window.MlEmpresaFilter) return;
    this.bindFilters();
    const set = (slotId, html) => {
      const el = document.getElementById(slotId);
      if (el) el.innerHTML = html;
    };
    set("cprev-emp-slot", MlEmpresaFilter.html({
      id: "cprev-filter-emp",
      label: "Empresas",
      items: this.empItems(),
      selectedIds: this.state.companyIds,
      open: !!this.state.openEmp,
      query: this.state.qEmp,
      emptyMeansAll: true,
      nouns: { singular: "empresa", plural: "empresas" }
    }));
    set("cprev-cred-slot", MlEmpresaFilter.html({
      id: "cprev-filter-cred",
      label: "Credor",
      items: this.credItems(),
      selectedIds: this.state.creditorIds,
      open: !!this.state.openCred,
      query: this.state.qCred,
      emptyMeansAll: true,
      nouns: { singular: "credor", plural: "credores" }
    }));
    set("cprev-dept-slot", MlEmpresaFilter.html({
      id: "cprev-filter-dept",
      label: "Departamento",
      items: this.deptItems(),
      selectedIds: this.state.deptIds,
      open: !!this.state.openDept,
      query: this.state.qDept,
      emptyMeansAll: true,
      nouns: { singular: "departamento", plural: "departamentos" }
    }));
    if (window.lucide) lucide.createIcons();
  },

  async loadCompanies() {
    if (!window.SiengeApiService || typeof SiengeApiService.getCompanies !== "function") return;
    try {
      const list = await SiengeApiService.getCompanies(false);
      this.state.companies = Array.isArray(list) ? list : ((list && list.results) || []);
    } catch (e) {
      this.state.companies = [];
    }
  },

  async consultar() {
    const start = this.state.startDate;
    const end = this.state.endDate;
    if (!start || !end) {
      alert("Informe o intervalo de datas.");
      return;
    }
    if (start > end) {
      alert("A data inicial não pode ser maior que a final.");
      return;
    }
    this.state.loading = true;
    this.state.error = "";
    this.state.consulted = true;
    this.state.parcelasCache = {};
    this.renderPage();
    try {
      let endpoint = "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
        + "&endDate=" + encodeURIComponent(end)
        + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
      if ((this.state.companyIds || []).length === 1) {
        endpoint += "&companyId=" + encodeURIComponent(this.state.companyIds[0]);
      }
      if (typeof window.siengeFetchWithRetry !== "function") {
        throw new Error("API Sienge indisponível.");
      }
      const payload = await window.siengeFetchWithRetry(endpoint, 2);
      this.indexBills(payload);
      this.state.allRows = this.transform(payload);
      this.state.updatedAt = new Date().toISOString();
      this.applyFilters();
    } catch (e) {
      this.state.error = (e && e.message) ? e.message : "Falha ao buscar previsões no Sienge.";
      this.state.allRows = [];
      this.state.shown = [];
      this.state.billsByTitulo = {};
    }
    this.state.loading = false;
    this.renderPage();
  },

  limpar() {
    const range = this.defaultRange();
    this.state.startDate = range.startDate;
    this.state.endDate = range.endDate;
    this.state.companyIds = [];
    this.state.creditorIds = [];
    this.state.deptIds = [];
    this.state.qTitulo = "";
    this.state.qCredor = "";
    this.state.status = "aberto";
    this.state.shown = [];
    this.state.allRows = [];
    this.state.billsByTitulo = {};
    this.state.parcelasCache = {};
    this.state.consulted = false;
    this.state.error = "";
    this.closeParcelas();
    this.renderPage();
  },

  onField(field, val) {
    this.state[field] = val;
    if (field === "qTitulo" || field === "qCredor" || field === "status" || field === "startDate" || field === "endDate") {
      this.applyFilters();
      this.renderList();
    }
  },

  groupHeaderHtml(group, totals) {
    const meta = this.groupMeta(group);
    const count = totals.count || 0;
    const countLabel = count === 1 ? "1 título" : count + " títulos";
    const valueLabel = (Number(totals.value) || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const cell = "background:" + meta.bg + ";color:" + meta.color + ";font-weight:700;font-size:0.75rem;letter-spacing:0.04em;text-transform:uppercase;padding:8px 12px;border:none;";
    return `<tr class="fila-group-header cprev-group-header">
      <td colspan="6" style="${cell}">
        <div class="cprev-group-label">
          <span>${this.esc(meta.label)}</span>
          <span class="cprev-group-chip">${this.esc(countLabel)}</span>
        </div>
      </td>
      <td colspan="3" style="${cell}"></td>
      <td style="${cell}text-align:right;white-space:nowrap;letter-spacing:0;text-transform:none;">
        <span class="cprev-group-chip">R$ ${this.esc(valueLabel)}</span>
      </td>
    </tr>`;
  },

  renderList() {
    const box = document.getElementById("cprev-results");
    const kpi = document.getElementById("cprev-kpis");
    if (!box) return;
    if (this.state.loading) {
      box.innerHTML = `<div class="tvig-empty">Buscando títulos no Sienge…</div>`;
      if (kpi) kpi.innerHTML = "";
      return;
    }
    if (this.state.error) {
      box.innerHTML = `<div class="tvig-empty">${this.esc(this.state.error)}</div>`;
      if (kpi) kpi.innerHTML = "";
      return;
    }
    if (!this.state.consulted) {
      box.innerHTML = `<div class="tvig-empty">Use <strong>Consultar</strong> para carregar o follow-up de previsões.</div>`;
      if (kpi) kpi.innerHTML = "";
      return;
    }
    const rows = this.state.shown || [];
    const k = this.kpis();
    if (kpi) {
      kpi.innerHTML = `
        <div class="ccom-kpi"><span>Títulos</span><strong>${k.qtd}</strong></div>
        <div class="ccom-kpi"><span>Total</span><strong>${this.esc(this.money(k.total))}</strong></div>
        <div class="ccom-kpi"><span>Vencidos</span><strong>${this.esc(this.money(k.vencido))}</strong></div>
        <div class="ccom-kpi"><span>Prazo insuficiente</span><strong>${this.esc(this.money(k.prazo))}</strong></div>
        <div class="ccom-kpi"><span>A vencer</span><strong>${this.esc(this.money(k.aVencer))}</strong></div>`;
    }
    if (!rows.length) {
      box.innerHTML = `<div class="tvig-empty">Nenhum título neste filtro.</div>`;
      return;
    }
    const totals = {};
    rows.forEach((r) => {
      const g = r.grupo || this.rowGroup(r);
      if (!totals[g]) totals[g] = { count: 0, value: 0 };
      totals[g].count += 1;
      totals[g].value += Number(r.valorAjustado) || 0;
    });
    let lastGroup = null;
    const body = rows.map((r, idx) => {
      let header = "";
      if (r.grupo !== lastGroup) {
        lastGroup = r.grupo;
        header = this.groupHeaderHtml(r.grupo, totals[r.grupo] || { count: 0, value: 0 });
      }
      const late = r.grupo === this.GROUPS.VENCIDOS;
      const open = String(this.state.openTitulo) === String(r.titulo);
      const nota = r.virouNota
        ? `<span class="cprev-tag cprev-tag-nota">Virou nota</span>`
        : "";
      const pago = r.pago
        ? `<span class="cprev-tag cprev-tag-pago">Pago</span>`
        : "";
      const ccLabel = (r.ccId ? r.ccId + " - " : "") + (r.ccNome || "—");
      return header + `<tr class="cprev-row${late ? " cprev-late" : ""}${open ? " is-open" : ""}" data-titulo="${this.esc(r.titulo)}" data-idx="${idx}" onclick="ComprasPrevisoesApp.openParcelas('${this.esc(r.titulo)}')">
        <td class="cprev-col-id" title="${this.esc(r.companyId)}">${this.esc(r.companyId)}</td>
        <td class="cprev-col-cc" title="${this.esc(ccLabel)}">${this.esc(ccLabel)}</td>
        <td class="cprev-col-dept" title="${this.esc(r.departamento || "—")}">${this.esc(r.departamento || "—")}</td>
        <td class="cprev-col-cred" title="${this.esc(r.credor || "—")}">${this.esc(r.credor || "—")}</td>
        <td class="cprev-col-tit" title="${this.esc(r.titulo)}">${this.esc(r.titulo)}${nota}${pago}</td>
        <td class="cprev-col-parc" title="${this.esc(r.parcela || "—")}">${this.esc(r.parcela || "—")}</td>
        <td class="cprev-col-doc" title="${this.esc(r.docId || "—")}">${this.esc(r.docId || "—")}</td>
        <td class="cprev-col-ndoc" title="${this.esc(r.documento || "—")}">${this.esc(r.documento || "—")}</td>
        <td class="cprev-col-venc" title="${this.esc(this.fmtDate(r.vencimento))}">${this.esc(this.fmtDate(r.vencimento))}</td>
        <td class="cprev-col-val" title="${this.esc(this.money(r.valorAjustado))}">${this.esc(this.money(r.valorAjustado))}</td>
      </tr>`;
    }).join("");
    box.innerHTML = `
      <div class="table-container cprev-table-wrap">
        <table class="custom-table cprev-table" id="cprev-table">
          <colgroup>
            <col class="cprev-col-id">
            <col class="cprev-col-cc">
            <col class="cprev-col-dept">
            <col class="cprev-col-cred">
            <col class="cprev-col-tit">
            <col class="cprev-col-parc">
            <col class="cprev-col-doc">
            <col class="cprev-col-ndoc">
            <col class="cprev-col-venc">
            <col class="cprev-col-val">
          </colgroup>
          <thead>
            <tr>
              <th class="cprev-col-id" title="Id Empresa">Emp.</th>
              <th class="cprev-col-cc">Centro de custo</th>
              <th class="cprev-col-dept">Depto</th>
              <th class="cprev-col-cred">Credor</th>
              <th class="cprev-col-tit">Título</th>
              <th class="cprev-col-parc">Parc.</th>
              <th class="cprev-col-doc">Doc.</th>
              <th class="cprev-col-ndoc">Nº doc.</th>
              <th class="cprev-col-venc">Vencimento</th>
              <th class="cprev-col-val">Valor</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    this.paintParcelasModal();
  },

  installmentToParcela(titulo, inst) {
    const pay = inst && (inst.payments || inst.payment) || null;
    const firstPay = Array.isArray(pay) ? pay[0] : pay;
    const docId = this.docCode(inst.documentIdentificationId || inst.documentId || (inst.document && inst.document.id));
    const docName = inst.documentIdentificationName || inst.documentName || (inst.document && inst.document.name) || "";
    const pago = this.isPago(inst, firstPay, null);
    return {
      titulo: String(titulo),
      parcela: inst.installmentId != null ? String(inst.installmentId) : (inst.installmentNumber != null ? String(inst.installmentNumber) : ""),
      vencimento: this.isoDate(inst.dueDate || inst.date),
      valor: Number(inst.originalAmount != null ? inst.originalAmount : inst.amount) || 0,
      documento: String(inst.documentNumber || inst.number || ""),
      docId,
      docNome: this.firstWord(docName),
      pago,
      dataPagamento: this.paymentDateOf(inst, firstPay, null),
      saldo: this.billBalance(inst),
      situacao: this.billSituation(inst, firstPay),
      virouNota: this.isNotaDoc(docId, docName, inst)
    };
  },

  parcelasFromBills(titulo) {
    const bills = this.state.billsByTitulo[String(titulo)] || [];
    const map = new Map();
    bills.forEach((bill) => {
      const p = this.installmentToParcela(titulo, bill);
      const key = p.parcela || p.vencimento || String(map.size);
      const prev = map.get(key);
      if (!prev) map.set(key, p);
      else {
        if (p.pago) prev.pago = true;
        if (p.virouNota) prev.virouNota = true;
        if (p.dataPagamento && !prev.dataPagamento) prev.dataPagamento = p.dataPagamento;
      }
    });
    (this.state.allRows || []).filter((r) => String(r.titulo) === String(titulo)).forEach((r) => {
      const key = r.parcela || r.vencimento;
      const prev = map.get(key);
      const next = {
        titulo: r.titulo,
        parcela: r.parcela,
        vencimento: r.vencimento,
        valor: Number(r.valor) || Number(r.valorAjustado) || 0,
        documento: r.documento,
        docId: r.docId,
        docNome: r.docNome,
        pago: !!r.pago,
        dataPagamento: r.dataPagamento || "",
        saldo: r.saldo,
        situacao: r.situacao,
        virouNota: !!r.virouNota || this.isNotaDoc(r.docId, r.docNome, null)
      };
      if (!prev) map.set(key, next);
      else {
        if (next.pago) prev.pago = true;
        if (next.virouNota) prev.virouNota = true;
      }
    });
    return [...map.values()].sort((a, b) =>
      String(a.parcela).localeCompare(String(b.parcela), undefined, { numeric: true })
      || String(a.vencimento).localeCompare(String(b.vencimento))
    );
  },

  async openParcelas(titulo) {
    const id = String(titulo || "");
    if (!id) return;
    this.state.openTitulo = id;
    this.state.parcelasLoading = true;
    this.state.parcelasError = "";
    this.state.parcelas = this.parcelasFromBills(id);
    document.querySelectorAll("#cprev-table tr.cprev-row.is-open").forEach((el) => el.classList.remove("is-open"));
    const active = document.querySelector('#cprev-table tr.cprev-row[data-titulo="' + id + '"]');
    if (active) active.classList.add("is-open");
    this.paintParcelasModal();
    if (this.state.parcelasCache[id]) {
      this.state.parcelas = this.state.parcelasCache[id];
      this.state.parcelasLoading = false;
      this.paintParcelasModal();
      return;
    }
    try {
      if (typeof window.siengeFetchWithRetry === "function") {
        const data = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(id) + "/installments", 2);
        const raw = (data && (data.results || data.data || data.installments)) || (Array.isArray(data) ? data : []);
        const fetched = (raw || []).map((inst) => this.installmentToParcela(id, inst));
        const local = this.parcelasFromBills(id);
        const map = new Map();
        local.concat(fetched).forEach((p) => {
          const key = p.parcela || p.vencimento;
          const prev = map.get(key);
          if (!prev) map.set(key, p);
          else {
            if (p.pago) prev.pago = true;
            if (p.virouNota) prev.virouNota = true;
            if (p.dataPagamento && !prev.dataPagamento) prev.dataPagamento = p.dataPagamento;
            if (p.docId && !prev.docId) prev.docId = p.docId;
            if (p.documento && !prev.documento) prev.documento = p.documento;
          }
        });
        const merged = [...map.values()].sort((a, b) =>
          String(a.parcela).localeCompare(String(b.parcela), undefined, { numeric: true })
          || String(a.vencimento).localeCompare(String(b.vencimento))
        );
        this.state.parcelasCache[id] = merged;
        if (this.state.openTitulo === id) this.state.parcelas = merged;
      }
    } catch (e) {
      if (this.state.openTitulo === id) {
        this.state.parcelasError = "Não foi possível carregar todas as parcelas no Sienge. Exibindo o que já está na consulta.";
      }
    }
    if (this.state.openTitulo === id) this.state.parcelasLoading = false;
    this.paintParcelasModal();
  },

  closeParcelas() {
    this.state.openTitulo = "";
    this.state.parcelas = [];
    this.state.parcelasLoading = false;
    this.state.parcelasError = "";
    const modal = document.getElementById("cprev-parcelas-modal");
    if (modal) modal.innerHTML = "";
    const rows = document.querySelectorAll("#cprev-table tr.cprev-row.is-open");
    rows.forEach((el) => el.classList.remove("is-open"));
  },

  paintParcelasModal() {
    const host = document.getElementById("cprev-parcelas-modal");
    if (!host) return;
    const titulo = this.state.openTitulo;
    if (!titulo) {
      host.innerHTML = "";
      return;
    }
    const sample = (this.state.shown || []).find((r) => String(r.titulo) === String(titulo))
      || (this.state.allRows || []).find((r) => String(r.titulo) === String(titulo));
    const parcelas = this.state.parcelas || [];
    const rowsHtml = parcelas.length
      ? parcelas.map((p) => `<tr>
          <td>${this.esc(p.parcela || "—")}</td>
          <td>${this.esc(p.docId || "—")}</td>
          <td>${this.esc(p.documento || "—")}</td>
          <td>${this.esc(this.fmtDate(p.vencimento))}</td>
          <td style="text-align:right;white-space:nowrap;">${this.esc(this.money(p.valor))}</td>
          <td>${p.pago
            ? `<span class="cprev-tag cprev-tag-pago">Paga${p.dataPagamento ? " · " + this.esc(this.fmtDate(p.dataPagamento)) : ""}</span>`
            : `<span class="cprev-tag cprev-tag-aberto">Em aberto</span>`}</td>
          <td>${p.virouNota
            ? `<span class="cprev-tag cprev-tag-nota">Sim</span>`
            : `<span class="cprev-tag">Não</span>`}</td>
        </tr>`).join("")
      : `<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">Nenhuma parcela encontrada para este título.</td></tr>`;
    host.innerHTML = `
      <div class="cprev-modal-overlay" onclick="if(event.target===this) ComprasPrevisoesApp.closeParcelas()">
        <div class="cprev-modal" role="dialog" aria-modal="true">
          <div class="cprev-modal-head">
            <div>
              <h3>Parcelas do título ${this.esc(titulo)}</h3>
              <p>${this.esc((sample && sample.credor) || "—")}${sample && sample.companyId ? " · Empresa " + this.esc(sample.companyId) : ""}</p>
            </div>
            <button type="button" class="btn btn-cancel" onclick="ComprasPrevisoesApp.closeParcelas()">Fechar</button>
          </div>
          ${this.state.parcelasLoading ? `<div class="tvig-empty" style="padding:16px;">Carregando parcelas…</div>` : ""}
          ${this.state.parcelasError ? `<div class="ccom-aviso">${this.esc(this.state.parcelasError)}</div>` : ""}
          <div class="cprev-modal-body">
            <table class="custom-table cprev-table">
              <thead>
                <tr>
                  <th>Parcela</th>
                  <th>Documento</th>
                  <th>Nº documento</th>
                  <th>Vencimento</th>
                  <th style="text-align:right;">Valor</th>
                  <th>Situação</th>
                  <th>Virou nota</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  exportExcel() {
    if (typeof XLSX === "undefined") {
      alert("Biblioteca de Excel indisponível.");
      return;
    }
    const rows = this.state.shown || [];
    if (!rows.length) {
      alert("Não há títulos para exportar neste filtro.");
      return;
    }
    const rowsData = rows.map((r) => ({
      Grupo: this.groupMeta(r.grupo).label,
      "Id Empresa": r.companyId,
      "Centro de custo": (r.ccId ? r.ccId + " - " : "") + (r.ccNome || ""),
      Departamento: r.departamento || "",
      Credor: r.credor || "",
      Título: r.titulo,
      Parcela: r.parcela || "",
      Documento: r.docId || "",
      "Nº documento": r.documento || "",
      Vencimento: this.fmtDate(r.vencimento),
      "Valor (R$)": Number(r.valorAjustado) || 0,
      Situação: r.pago ? "Pago" : "Em aberto",
      "Virou nota": r.virouNota ? "Sim" : "Não"
    }));
    const ws = XLSX.utils.json_to_sheet(rowsData);
    const range = XLSX.utils.decode_range(ws["!ref"]);
    ws["!cols"] = [
      { wch: 32 }, { wch: 12 }, { wch: 36 }, { wch: 22 }, { wch: 40 },
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
      { wch: 16 }, { wch: 12 }, { wch: 12 }
    ];
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = ws[addr];
        if (!cell) { cell = { t: "s", v: "" }; ws[addr] = cell; }
        cell.s = {
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
          },
          alignment: { vertical: "center", wrapText: true },
          font: { name: "Calibri", sz: 11 }
        };
        if (R === 0) {
          cell.s.fill = { fgColor: { rgb: "E2E8F0" } };
          cell.s.font.bold = true;
          cell.s.alignment.horizontal = "center";
        }
        if (R > 0 && C === 10 && cell.t === "n") cell.z = "#,##0.00";
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Follow-up previsões");
    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, "follow-up-previsoes-" + dateStr + ".xlsx");
  },

  renderPage() {
    const root = document.getElementById("compras-previsoes-root");
    if (!root) return;
    const s = this.state;
    const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleString("pt-BR") : "—";
    const minDays = this.minDaysToday();
    const minDue = this.minLaunchDue();
    root.innerHTML = `
      <div class="cprev-page">
        <div class="search-filter-panel cprev-toolbar">
          <div class="cprev-toolbar-head">
            <h2 class="tvig-page-title">
              <i data-lucide="clipboard-list" style="width:22px;height:22px;color:var(--color-primary);"></i>
              Follow-up de previsões
            </h2>
            <span class="cprev-updated">Atualização: ${this.esc(updated)}</span>
          </div>
          <div class="cprev-filters">
            <div id="cprev-emp-slot" class="tvig-filter-slot"></div>
            <div id="cprev-dept-slot" class="tvig-filter-slot"></div>
            <div class="form-group cprev-date-field">
              <label>Vencimento de</label>
              <input type="date" class="form-control" value="${this.esc(s.startDate)}"
                onchange="ComprasPrevisoesApp.onField('startDate', this.value)">
            </div>
            <div class="form-group cprev-date-field">
              <label>Vencimento até</label>
              <input type="date" class="form-control" value="${this.esc(s.endDate)}"
                onchange="ComprasPrevisoesApp.onField('endDate', this.value)">
            </div>
            <div class="tvig-filter-actions">
              <button type="button" class="btn btn-primary fila-align-btn" ${s.loading ? "disabled" : ""} onclick="ComprasPrevisoesApp.consultar()">
                <i data-lucide="search" style="width:16px;"></i> ${s.loading ? "Consultando…" : "Consultar"}
              </button>
              <button type="button" class="btn btn-cancel fila-align-btn" onclick="ComprasPrevisoesApp.limpar()">Limpar</button>
              <button type="button" class="btn btn-secondary fila-align-btn cprev-excel-btn" onclick="ComprasPrevisoesApp.exportExcel()" title="Exportar tabela atual para Excel">
                <i data-lucide="download" style="width:14px;"></i> Exportar em Excel
              </button>
            </div>
          </div>
          <div class="cprev-extra">
            <div class="form-group cprev-search-field">
              <label>Título</label>
              <input type="search" class="form-control" placeholder="Filtrar por título ou nº do documento"
                value="${this.esc(s.qTitulo)}" oninput="ComprasPrevisoesApp.onField('qTitulo', this.value)" autocomplete="off">
            </div>
            <div class="form-group cprev-search-field">
              <label>Credor</label>
              <input type="search" class="form-control" placeholder="Filtrar pelo nome do credor"
                value="${this.esc(s.qCredor)}" oninput="ComprasPrevisoesApp.onField('qCredor', this.value)" autocomplete="off">
            </div>
            <div id="cprev-cred-slot" class="tvig-filter-slot"></div>
            <div class="form-group cprev-status-field">
              <label>Situação</label>
              <select class="form-control" onchange="ComprasPrevisoesApp.onField('status', this.value)">
                <option value="aberto" ${s.status === "aberto" ? "selected" : ""}>Em aberto</option>
                <option value="pago" ${s.status === "pago" ? "selected" : ""}>Pagos</option>
                <option value="todos" ${s.status === "todos" ? "selected" : ""}>Todos</option>
              </select>
            </div>
          </div>
          <p class="cprev-hint">Lançando a nota hoje, o vencimento precisa de no mínimo <strong>${minDays} dias</strong> (até ${this.esc(this.fmtDate(minDue))}). Títulos abaixo desse prazo ficam em <strong>Prazo insuficiente para lançar</strong>.</p>
        </div>
        <div id="cprev-kpis" class="ccom-kpis cprev-kpis"></div>
        <div id="cprev-results" class="cprev-results"></div>
        <div id="cprev-parcelas-modal"></div>
      </div>`;
    this.paintFilters();
    this.renderList();
    if (window.lucide) lucide.createIcons();
  },

  onPrazoField(day, val) {
    const draft = parseComprasPrazo(this.state.prazoDraft || this.loadPrazo());
    const n = Number(val);
    draft[day] = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    this.state.prazoDraft = draft;
  },

  restorePrazoDefault() {
    this.state.prazoDraft = Object.assign({}, COMPRAS_PRAZO_DEFAULT, { updatedAt: Date.now() });
    this.renderConfig();
  },

  cancelPrazoEdit() {
    this.state.prazoDraft = this.loadPrazo();
    this.renderConfig();
  },

  savePrazoConfig() {
    const saved = this.savePrazo(this.state.prazoDraft || this.loadPrazo());
    this.state.prazoDraft = saved;
    if (this.state.shown && this.state.shown.length) {
      this.applyFilters();
    }
    this.renderConfig();
    alert("Calendário de vencimento salvo.");
  },

  renderConfig() {
    const root = document.getElementById("compras-config-root");
    if (!root) return;
    const prazo = parseComprasPrazo(this.state.prazoDraft || this.loadPrazo());
    this.state.prazoDraft = prazo;
    root.innerHTML = `
      <div class="cprev-config-page">
        <div class="crm-card cprev-config-card">
          <div class="cprev-config-help">
            <i data-lucide="info"></i>
            <p>Ao lançar a nota hoje, o documento a pagar precisa respeitar o mínimo de dias do <strong>dia da semana em que o documento entra</strong>. Previsões cujo vencimento já não cabe nesse prazo aparecem no follow-up em <strong>Prazo insuficiente para lançar</strong>.</p>
          </div>
          <div class="cprev-prazo-list">
            <div class="cprev-prazo-head">
              <span>Dia da semana</span>
              <span>Mínimo de dias para vencimento</span>
            </div>
            ${this.WEEKDAYS.map((d) => `<label class="cprev-prazo-row${d.weekend ? " is-weekend" : ""}">
              <span class="cprev-prazo-day">
                <span class="cprev-prazo-chip">${this.esc(d.short)}</span>
                <span class="cprev-prazo-name">${this.esc(d.label)}</span>
              </span>
              <span class="cprev-prazo-field">
                <input type="number" min="0" max="60" step="1" value="${this.esc(prazo[d.id])}"
                  aria-label="Mínimo de dias para ${this.esc(d.label)}"
                  onchange="ComprasPrevisoesApp.onPrazoField(${d.id}, this.value)">
                <span>dias</span>
              </span>
            </label>`).join("")}
          </div>
          <div class="cprev-config-actions">
            <button type="button" class="btn btn-cancel" onclick="ComprasPrevisoesApp.cancelPrazoEdit()">Cancelar</button>
            <button type="button" class="btn btn-outline" onclick="ComprasPrevisoesApp.restorePrazoDefault()">Restaurar padrão</button>
            <button type="button" class="btn btn-primary" onclick="ComprasPrevisoesApp.savePrazoConfig()">Salvar</button>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  async init() {
    const root = document.getElementById("compras-previsoes-root");
    if (!root) return;
    if (!this.state.inited) {
      const range = this.defaultRange();
      this.state.startDate = range.startDate;
      this.state.endDate = range.endDate;
      this.state.inited = true;
      this.renderPage();
      await this.loadCompanies();
    }
    if (this.state.consulted) this.applyFilters();
    this.renderPage();
  },

  initConfig() {
    const root = document.getElementById("compras-config-root");
    if (!root) return;
    this.state.prazoDraft = this.loadPrazo();
    this.state.configInited = true;
    this.renderConfig();
  }
};

window.ComprasPrevisoesApp = ComprasPrevisoesApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "compras-previsoes" || e.detail === "construcao-compras") {
    ComprasPrevisoesApp.init();
  }
  if (e.detail === "compras-config") {
    ComprasPrevisoesApp.initConfig();
  }
  if (e.detail === "engenharia-caucao" || e.detail === "construcao-engenharia") {
    if (window.EngenhariaCaucaoApp && typeof EngenhariaCaucaoApp.init === "function") {
      EngenhariaCaucaoApp.init();
    } else if (typeof window.bootEngenhariaCaucao === "function") {
      window.bootEngenhariaCaucao();
    }
  }
});
