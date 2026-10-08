/**
 * Engenharia · Gestão de caução (documento CAU)
 * Lista títulos a pagar de caução, agrupa por credor e permite
 * ajustar vencimento e liberar para pagamento.
 */
var ECAU_LIBERA_LS = "crm_engenharia_caucao_liberados_v1";
var ECAU_AVISO_LS = "crm_engenharia_caucao_avisos_v1";
var ECAU_PRORROGA_LS = "crm_engenharia_caucao_prorrogacao_v1";
var ECAU_PRORROGA_DEFAULT = { antes: 10, dias: 30 };
var ECAU_EMISSAO_AVISO = "Não é possível liberar, pois a data de emissão do título é posterior ao vencimento. Contate o financeiro para ajustar.";

function parseCaucaoProrrogacao(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw || "{}") || {}; } catch (e) { obj = {}; }
  }
  if (!obj || typeof obj !== "object") obj = {};
  const clamp = (n, min, max, fallback) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, Math.round(v)));
  };
  return {
    antes: clamp(obj.antes != null ? obj.antes : ECAU_PRORROGA_DEFAULT.antes, 0, 365, ECAU_PRORROGA_DEFAULT.antes),
    dias: clamp(obj.dias != null ? obj.dias : ECAU_PRORROGA_DEFAULT.dias, 1, 365, ECAU_PRORROGA_DEFAULT.dias),
    updatedAt: Number(obj.updatedAt || 0)
  };
}

window.mergeEngenhariaCaucaoProrrogacao = function (localStr, cloudStr) {
  const local = parseCaucaoProrrogacao(localStr);
  const cloud = parseCaucaoProrrogacao(cloudStr);
  const picked = Number(local.updatedAt || 0) >= Number(cloud.updatedAt || 0) ? local : cloud;
  return JSON.stringify(picked);
};

window.EngenhariaCaucaoApp = {
  SKIP_OPS: {
    "Reaprop. Abatimento Adiantamento - entrada": 1,
    Recebimento: 1
  },
  SKIP_ACCOUNTS: { PAR: 1, "PAR-3": 1 },

  state: {
    inited: false,
    loading: false,
    consulted: false,
    error: "",
    startDate: "",
    endDate: "",
    updatedAt: "",
    companies: [],
    companyIds: [],
    creditorIds: [],
    ccIds: [],
    statusIds: ["aberto", "liberado"],
    openEmp: false,
    openCred: false,
    openCc: false,
    openSit: false,
    qEmp: "",
    qCred: "",
    qCc: "",
    qSit: "",
    qTitulo: "",
    qCredor: "",
    allRows: [],
    shown: [],
    billsByTitulo: {},
    selected: {},
    liberated: {},
    busy: false,
    modal: ""
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

  minDaysToday() {
    let prazo = { 0: 9, 1: 8, 2: 8, 3: 8, 4: 8, 5: 10, 6: 10 };
    try {
      if (typeof parseComprasPrazo === "function") {
        prazo = parseComprasPrazo(localStorage.getItem("crm_compras_prazo_lancamento_v1") || "{}");
      }
    } catch (e) { /* usa o padrão */ }
    return Number(prazo[new Date().getDay()] || 0);
  },

  vencimentoAntesDaEmissao(r, due) {
    const em = this.isoDate(r && r.emissao);
    const d = this.isoDate(due);
    return !!(em && d && d < em);
  },

  prorrogacao() {
    try { return parseCaucaoProrrogacao(localStorage.getItem(ECAU_PRORROGA_LS) || "{}"); }
    catch (e) { return parseCaucaoProrrogacao({}); }
  },

  saveProrrogacao(cfg) {
    const next = parseCaucaoProrrogacao(cfg);
    next.updatedAt = Date.now();
    try { localStorage.setItem(ECAU_PRORROGA_LS, JSON.stringify(next)); } catch (e) {}
    if (typeof window.forceUploadLocalConfig === "function") {
      window.forceUploadLocalConfig(true).catch(function () {});
    }
    return next;
  },

  dentroPrazoMinimo(r) {
    const due = this.isoDate(r && r.vencimento);
    const limite = this.addDaysIso(this.isoToday(), this.prorrogacao().antes);
    return !!(due && limite && due <= limite);
  },

  emissaoFutura(r) {
    const em = this.isoDate(r && r.emissao);
    return !!(em && em > this.isoToday());
  },

  emissaoAlertaHtml(r) {
    if (!this.emissaoFutura(r)) return "";
    const tip = this.esc(ECAU_EMISSAO_AVISO);
    return `<span class="ecau-emissao-alerta" data-ecau-tip="${tip}" role="img" aria-label="${tip}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>`;
  },

  addMonthsIso(iso, months) {
    const s = this.isoDate(iso) || this.isoToday();
    const d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1 + Number(months || 0), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const day = Math.min(Number(s.slice(8, 10)), last);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  },

  defaultRange() {
    const today = this.isoToday();
    return {
      startDate: this.addMonthsIso(today.slice(0, 8) + "01", -12),
      endDate: this.addMonthsIso(today.slice(0, 8) + "01", 18).replace(/\d{2}$/, (d) => {
        const y = Number(this.addMonthsIso(today.slice(0, 8) + "01", 18).slice(0, 4));
        const m = Number(this.addMonthsIso(today.slice(0, 8) + "01", 18).slice(5, 7));
        return String(new Date(y, m, 0).getDate()).padStart(2, "0");
      })
    };
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

  isCauDoc(docId, docName) {
    const id = this.docCode(docId);
    const token = this.docCode(this.firstWord(docId || docName));
    if (id === "CAU" || token === "CAU") return true;
    const nome = this.fold(docName);
    return nome.indexOf("CAUCAO") >= 0 || nome.indexOf("CAUÇAO") >= 0;
  },

  rowKey(r) {
    return String((r && r.titulo) || "") + "|" + String((r && r.parcela) || "");
  },

  operatorName() {
    const u = (typeof AppState !== "undefined" && AppState.currentUser) || {};
    return String(u.name || u.displayName || u.email || "Operador").trim();
  },

  loadLiberated() {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(ECAU_LIBERA_LS) || "{}") || {};
    } catch (e) {
      stored = {};
    }
    const mem = this.state.liberated && typeof this.state.liberated === "object" ? this.state.liberated : {};
    const merged = window.mergedCaucaoLiberados
      ? window.mergedCaucaoLiberados([mem, stored])
      : JSON.stringify(Object.assign({}, stored, mem));
    try { this.state.liberated = JSON.parse(merged) || {}; } catch (e) { this.state.liberated = Object.assign({}, stored, mem); }
    if (!this.state.liberated || typeof this.state.liberated !== "object") this.state.liberated = {};
  },

  async pullLiberated() {
    this.loadLiberated();
    const fc = window.firebaseCollections;
    if (!fc || !fc.getDoc || !fc.doc || !window.firebaseDb) return this.state.liberated;
    try {
      const snap = await fc.getDoc(fc.doc(window.firebaseDb, "config", "global"));
      const exists = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
      if (!exists) return this.state.liberated;
      const raw = (snap.data() || {}).crm_engenharia_caucao_liberados_v1 || "";
      if (!raw) return this.state.liberated;
      const merged = window.mergedCaucaoLiberados
        ? window.mergedCaucaoLiberados([this.state.liberated, raw])
        : raw;
      this.state.liberated = JSON.parse(merged) || this.state.liberated;
      try {
        const setter = window._originalSetItem || localStorage.setItem.bind(localStorage);
        setter.call(localStorage, ECAU_LIBERA_LS, JSON.stringify(this.state.liberated));
      } catch (e) {}
    } catch (e) {}
    return this.state.liberated;
  },

  persistLiberated() {
    const raw = JSON.stringify(this.state.liberated || {});
    try { localStorage.setItem(ECAU_LIBERA_LS, raw); } catch (e) {}
    const self = this;
    if (typeof window.persistCaucaoLiberadosNow !== "function") return Promise.resolve(raw);
    return window.persistCaucaoLiberadosNow(this.state.liberated).then(function (merged) {
      if (!merged) return raw;
      try { self.state.liberated = JSON.parse(merged) || self.state.liberated; } catch (e) { return merged; }
      try {
        const setter = window._originalSetItem || localStorage.setItem.bind(localStorage);
        setter.call(localStorage, ECAU_LIBERA_LS, merged);
      } catch (e) {}
      return merged;
    });
  },

  avisoStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(ECAU_AVISO_LS) || "{}") || {};
      return {
        sent: raw.sent && typeof raw.sent === "object" ? raw.sent : {},
        queue: Array.isArray(raw.queue) ? raw.queue : [],
        lastTry: Number(raw.lastTry) || 0
      };
    } catch (e) {
      return { sent: {}, queue: [], lastTry: 0 };
    }
  },

  saveAvisoStore(store) {
    try { localStorage.setItem(ECAU_AVISO_LS, JSON.stringify(store)); } catch (e) {}
    if (typeof window.forceUploadLocalConfig === "function") {
      window.forceUploadLocalConfig(true).catch(function () {});
    }
  },

  destinatariosCaucao() {
    let users = [];
    try { users = JSON.parse(localStorage.getItem("crm_users") || "[]") || []; } catch (e) { users = []; }
    const out = new Set();
    (users || []).forEach((u) => {
      if (!u) return;
      if (this.fold(u.status) === "INATIVO") return;
      if (this.fold(u.profile_name) !== "ENGENHARIA") return;
      const email = String(u.email || "").trim();
      const gestor = String(u.manager_email || "").trim();
      if (email) out.add(email);
      if (gestor) out.add(gestor);
    });
    return [...out];
  },

  avisoItem(r, extra) {
    return Object.assign({
      titulo: String(r && r.titulo || ""),
      parcela: String(r && r.parcela || ""),
      credor: String(r && r.credor || ""),
      vencimento: this.fmtDate(r && r.vencimento),
      anterior: "",
      valor: this.money(r && r.valorAjustado)
    }, extra || {});
  },

  enqueueAviso(kind, items) {
    const store = this.avisoStore();
    (items || []).forEach((item) => {
      if (!item || !item.titulo) return;
      const key = kind + "|" + item.titulo + "|" + item.parcela + "|" + (item.vencimento || "");
      if (store.sent[key] || store.queue.some((q) => q.key === key)) return;
      store.queue.push({ key: key, kind: kind, item: item });
    });
    this.saveAvisoStore(store);
  },

  async flushAvisos() {
    const store = this.avisoStore();
    if (!store.queue.length) return;
    if (store.lastTry && Date.now() - store.lastTry < 60 * 60 * 1000) return;
    const to = this.destinatariosCaucao();
    store.lastTry = Date.now();
    this.saveAvisoStore(store);
    if (!to.length) return;
    const kinds = [...new Set(store.queue.map((q) => q.kind))];
    const sentKeys = [];
    let blocked = false;
    for (const kind of kinds) {
      const batch = store.queue.filter((q) => q.kind === kind);
      try {
        const res = await fetch("/api/caucao/avisos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: kind,
            to: to,
            dias: this.prorrogacao().dias,
            items: batch.map((q) => q.item)
          })
        });
        const data = await res.json().catch(function () { return {}; });
        if (data && data.sent) sentKeys.push.apply(sentKeys, batch.map((q) => q.key));
        else blocked = true;
      } catch (e) {
        blocked = true;
      }
    }
    const next = this.avisoStore();
    sentKeys.forEach((k) => { next.sent[k] = this.isoToday(); });
    if (sentKeys.length) next.queue = next.queue.filter((q) => sentKeys.indexOf(q.key) < 0);
    next.lastTry = blocked ? Date.now() : 0;
    this.saveAvisoStore(next);
  },

  avisarPagamentosProximos() {
    const hoje = this.isoToday();
    const limite = this.addDaysIso(hoje, 3);
    const items = (this.state.allRows || []).filter((r) => {
      if (!r || r.pago || !this.isLiberated(r)) return false;
      const due = this.isoDate(r.vencimento);
      return !!(due && due > hoje && due <= limite);
    }).map((r) => this.avisoItem(r));
    if (!items.length) return Promise.resolve();
    this.enqueueAviso("pagamento", items);
    return this.flushAvisos();
  },

  isLiberated(r) {
    const hit = this.state.liberated && this.state.liberated[this.rowKey(r)];
    return !!(hit && !hit.removed);
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

  transform(payload) {
    const bills = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    const rows = [];
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      if (!this.isCauDoc(bill.documentIdentificationId, bill.documentIdentificationName)) return;
      this.listOrNull(bill.paymentsCategories).forEach((cat) => {
        this.listOrNull(bill.payments).forEach((pay) => {
          this.listOrNull(pay && pay.bankMovements).forEach((bm) => {
            this.listOrNull(bill.departamentsCosts).forEach((dep) => {
              this.listOrNull(bill.buildingsCosts).forEach((bld) => {
                const operacao = (bm && bm.operationName) || "";
                const conta = (bm && bm.accountNumber) || "";
                if (this.SKIP_OPS[operacao]) return;
                if (this.SKIP_ACCOUNTS[conta]) return;
                const titulo = String(bill.billId);
                const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
                const rateio = cat && cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) : 100;
                const valor = Number(bill.originalAmount) || 0;
                rows.push({
                  companyId: String(bill.companyId || ""),
                  credor: String(bill.creditorName || "").trim(),
                  creditorId: bill.creditorId != null ? String(bill.creditorId) : "",
                  titulo,
                  documento: String(bill.documentNumber || ""),
                  vencimento: String(bill.dueDate || "").slice(0, 10),
                  emissao: String(bill.issueDate || "").slice(0, 10),
                  parcela,
                  installmentId: bill.installmentId,
                  docId: this.docCode(bill.documentIdentificationId) || "CAU",
                  docNome: this.firstWord(bill.documentIdentificationName) || "CAU",
                  valor,
                  planoId: cat && cat.financialCategoryId != null ? String(cat.financialCategoryId) : "",
                  plano: (cat && cat.financialCategoryName) || "",
                  ccId: cat && cat.costCenterId != null ? String(cat.costCenterId) : "",
                  ccNome: (cat && cat.costCenterName) || "",
                  rateio,
                  dataPagamento: this.paymentDateOf(bill, pay, bm),
                  pago: this.isPago(bill, pay, bm),
                  saldo: this.billBalance(bill),
                  situacao: this.billSituation(bill, pay),
                  departamento: (dep && dep.name) || "",
                  idObra: bld && bld.buildingId != null ? String(bld.buildingId) : "",
                  valorAjustado: valor * ((Number.isFinite(rateio) ? rateio : 100) / 100)
                });
              });
            });
          });
        });
      });
    });
    const slices = new Map();
    rows.forEach((r) => {
      const sliceKey = [r.titulo, r.parcela, r.departamento, r.ccId, r.planoId].join("|");
      if (!slices.has(sliceKey)) slices.set(sliceKey, r);
    });
    const grouped = new Map();
    slices.forEach((r) => {
      const k = [r.titulo, r.parcela, r.departamento, r.ccId].join("|");
      const prev = grouped.get(k);
      if (!prev) {
        grouped.set(k, Object.assign({}, r));
        return;
      }
      prev.rateio = (Number(prev.rateio) || 0) + (Number(r.rateio) || 0);
      prev.valorAjustado = (Number(prev.valorAjustado) || 0) + (Number(r.valorAjustado) || 0);
      const cheio = Number(prev.valor) || 0;
      if (cheio && Math.abs(prev.rateio - 100) <= 0.05) prev.valorAjustado = cheio;
      else prev.valorAjustado = Math.round(prev.valorAjustado * 100) / 100;
    });
    return Array.from(grouped.values());
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

  empresaCustomMap() {
    const live = window.EmpresasState && EmpresasState.customFields;
    if (live && Object.keys(live).length) return live;
    try {
      const raw = JSON.parse(localStorage.getItem("crm_empresas_custom") || "{}") || {};
      const map = {};
      Object.keys(raw).forEach((k) => {
        if (k === "_v2") return;
        const item = raw[k];
        if (!item || typeof item !== "object") return;
        const id = item.company_id != null ? item.company_id : k;
        map[String(id)] = item;
      });
      return map;
    } catch (e) {
      return {};
    }
  },

  geridaIdSet() {
    const defaults = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 12: 1, 13: 1, 14: 1, 17: 1, 28: 1, 32: 1 };
    const map = this.empresaCustomMap();
    const yes = new Set();
    const seen = new Set();
    Object.keys(map).forEach((k) => {
      const item = map[k];
      if (!item || typeof item !== "object") return;
      const id = String(item.company_id != null ? item.company_id : k);
      seen.add(id);
      if (Number(item.gerida_pelo_grupo) === 1) yes.add(id);
    });
    Object.keys(defaults).forEach((id) => {
      if (!seen.has(String(id))) yes.add(String(id));
    });
    return yes;
  },

  activeCompanySet() {
    const gerida = this.geridaIdSet();
    const picked = (this.state.companyIds || []).map(String).filter((id) => gerida.has(id));
    return picked.length ? new Set(picked) : gerida;
  },

  tituloLock() {
    return String(this.state.qTitulo || "").trim().length > 0;
  },

  ccCompanyId(cc) {
    if (!cc) return "";
    const raw = cc.companyId != null && cc.companyId !== "" ? cc.companyId : cc.idCompany;
    return raw == null || raw === "" ? "" : String(raw);
  },

  empItems() {
    const allowed = this.geridaIdSet();
    const companies = (this.state.companies || []).filter((c) => allowed.has(String(c.id)));
    if (companies.length) {
      return companies.map((c) => ({
        id: String(c.id),
        name: String(c.name || "").toUpperCase(),
        label: c.id + " - " + String(c.name || "").toUpperCase()
      })).sort((a, b) => Number(a.id) - Number(b.id));
    }
    return this.uniqueItems(
      (this.state.allRows || []).filter((r) => allowed.has(String(r.companyId))),
      (r) => r.companyId,
      (r) => {
        const name = this.companyName(r.companyId) || r.companyId;
        return r.companyId + " - " + name;
      }
    );
  },

  credItems() {
    const companies = this.activeCompanySet();
    const rows = (this.state.allRows || []).filter((r) => companies.has(String(r.companyId)));
    return this.uniqueItems(rows, (r) => this.fold(r.credor), (r) => r.credor.toUpperCase());
  },

  unitEnterpriseIds() {
    if (this._unitEnterpriseIds && this._unitEnterpriseIds.size) return this._unitEnterpriseIds;
    const ids = new Set();
    const add = (id) => {
      const s = String(id == null ? "" : id).trim();
      if (s) ids.add(s);
    };
    const mem = window.EstoqueComercialApp && EstoqueComercialApp.state && EstoqueComercialApp.state.units;
    (mem || []).forEach((u) => { if (u) add(u.enterpriseId); });
    if (!ids.size) {
      try {
        const raw = JSON.parse(localStorage.getItem("crm_estoque_posicao_v1") || "null");
        const units = raw && (raw.units || (raw.data && raw.data.units));
        (units || []).forEach((u) => { if (u) add(u.enterpriseId); });
      } catch (e) {}
    }
    if (!ids.size) {
      try {
        const raw = JSON.parse(localStorage.getItem("crm_cc_ids_com_unidade") || "[]");
        (Array.isArray(raw) ? raw : []).forEach(add);
      } catch (e) {}
    }
    if (ids.size) this._unitEnterpriseIds = ids;
    return ids;
  },

  ccIsStockEnterprise(ccOrId, name) {
    const cc = ccOrId && typeof ccOrId === "object"
      ? ccOrId
      : { id: ccOrId, name: name || "" };
    const id = String(cc.id || cc.code || "").trim();
    if (!id) return false;
    const est = window.EstoqueComercialApp;
    if (est && typeof est.isEmpreendimentoCcId === "function") {
      if (!est.isEmpreendimentoCcId(id)) return false;
      if (typeof est.isDeptOnlyCc === "function" && est.isDeptOnlyCc(cc)) return false;
    } else if (id.charAt(0) !== "1" && id.charAt(0) !== "2") {
      return false;
    }
    try {
      const raw = JSON.parse(localStorage.getItem("crm_cc_ids_sem_unidade") || "[]");
      if ((Array.isArray(raw) ? raw : []).map(String).indexOf(id) >= 0) return false;
    } catch (e) {}
    const withUnits = this.unitEnterpriseIds();
    if (withUnits.size && !withUnits.has(id)) return false;
    return true;
  },

  ccItems() {
    const companies = this.activeCompanySet();
    const list = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    const catalog = list.filter((c) => {
      const companyId = this.ccCompanyId(c);
      return companyId && companies.has(companyId) && this.ccIsStockEnterprise(c);
    });
    const allowed = new Set(catalog.map((c) => String(c.id || c.code || "")));
    const rows = (this.state.allRows || []).filter((r) => r.ccId && companies.has(String(r.companyId)));
    const toItem = (id, nome, companyId) => {
      const name = String(nome || "").toUpperCase();
      return { id: String(id), name, label: id ? id + " - " + name : name, companyId: companyId || "" };
    };
    if (rows.length) {
      const stockRows = rows.filter((r) => {
        const id = String(r.ccId);
        return allowed.has(id) || this.ccIsStockEnterprise({ id: r.ccId, name: r.ccNome });
      });
      const source = stockRows.length ? stockRows : rows;
      return this.uniqueItems(source, (r) => r.ccId, (r) => {
        const name = String(r.ccNome || "").toUpperCase();
        return r.ccId + " - " + name;
      });
    }
    return catalog.map((c) => toItem(c.id || c.code, c.name || c.nome, this.ccCompanyId(c)))
      .filter((x) => x.id)
      .sort((a, b) => Number(a.id) - Number(b.id));
  },

  pruneCc() {
    const allowed = new Set(this.ccItems().map((x) => String(x.id)));
    this.state.ccIds = (this.state.ccIds || []).filter((id) => allowed.has(String(id)));
  },

  statusItems() {
    return [
      { id: "aberto", label: "Retidos" },
      { id: "liberado", label: "Liberados" },
      { id: "pago", label: "Pagos" }
    ];
  },

  defaultStatusIds() {
    return ["aberto", "liberado"];
  },

  resetStatusFilter() {
    this.state.statusIds = this.defaultStatusIds();
    this.state.qSit = "";
    this.state.openSit = false;
  },

  rowStatus(r) {
    if (r && r.pago) return "pago";
    if (r && this.isLiberated(r)) return "liberado";
    return "aberto";
  },

  applyFilters() {
    const emp = new Set((this.state.companyIds || []).map(String));
    const cred = new Set((this.state.creditorIds || []).map(String));
    const cc = new Set((this.state.ccIds || []).map(String));
    const statuses = new Set((this.state.statusIds || []).map(String));
    const statusAll = !statuses.size || statuses.size >= this.statusItems().length;
    const qTitulo = this.fold(this.state.qTitulo).replace(/\s+/g, "");
    const qCredor = this.fold(this.state.qCredor);
    const start = this.state.startDate || "";
    const end = this.state.endDate || "";
    const gerida = this.geridaIdSet();
    const byTitle = this.tituloLock();
    this.state.shown = (this.state.allRows || []).filter((r) => {
      if (!gerida.has(String(r.companyId))) return false;
      if (!byTitle) {
        if (emp.size && !emp.has(String(r.companyId))) return false;
        if (cc.size && !cc.has(String(r.ccId))) return false;
        if (cred.size && !cred.has(this.fold(r.credor))) return false;
        if (start && r.vencimento && r.vencimento < start) return false;
        if (end && r.vencimento && r.vencimento > end) return false;
      }
      if (!statusAll && !statuses.has(this.rowStatus(r))) return false;
      if (qTitulo) {
        const blob = this.fold([r.titulo, r.documento, r.parcela].join("")).replace(/\s+/g, "");
        if (blob.indexOf(qTitulo) < 0) return false;
      }
      if (qCredor && this.fold(r.credor).indexOf(qCredor) < 0) return false;
      return true;
    }).sort((a, b) =>
      String(a.credor || "").localeCompare(String(b.credor || ""), "pt-BR")
      || String(a.vencimento).localeCompare(String(b.vencimento))
      || String(a.titulo).localeCompare(String(b.titulo))
    );
  },

  selectedRows() {
    return (this.state.shown || []).filter((r) => this.state.selected[this.rowKey(r)]);
  },

  selectableRows() {
    return (this.state.shown || []).filter((r) => !r.pago);
  },

  toggleRow(key, on, ev) {
    if (ev) ev.stopPropagation();
    const k = String(key || "");
    if (!k) return;
    if (on) this.state.selected[k] = true;
    else delete this.state.selected[k];
    this.paintSelectionBar();
    this.syncHeaderCheck();
  },

  toggleAll(on) {
    if (on) {
      this.selectableRows().forEach((r) => { this.state.selected[this.rowKey(r)] = true; });
    } else {
      (this.state.shown || []).forEach((r) => { delete this.state.selected[this.rowKey(r)]; });
    }
    this.renderList();
  },

  selectedCount() {
    return this.selectedRows().length;
  },

  kpis() {
    const rows = this.state.shown || [];
    let total = 0;
    let aberto = 0;
    let liberado = 0;
    let pago = 0;
    rows.forEach((r) => {
      const v = Number(r.valorAjustado) || 0;
      total += v;
      if (r.pago) pago += v;
      else if (this.isLiberated(r)) liberado += v;
      else aberto += v;
    });
    return { qtd: rows.length, total, aberto, liberado, pago };
  },

  bindFilters() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    const bind = (id, key, openKey, qKey, itemsFn, nouns) => {
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          if (self.state.loading) return;
          if (!self.state.consulted && key !== "companyIds") return;
          if (self.tituloLock() && key !== "statusIds") return;
          const was = !!self.state[openKey];
          self.state.openEmp = false;
          self.state.openCred = false;
          self.state.openCc = false;
          self.state.openSit = false;
          self.state[openKey] = !was;
          self.paintFilters();
        },
        setQuery(q) {
          if (self.state.loading) return;
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
        toggleId(itemId, checked) {
          if (self.state.loading) return;
          if (!self.state.consulted && key !== "companyIds") return;
          if (self.tituloLock() && key !== "statusIds") return;
          const sid = String(itemId);
          const cur = self.state[key].slice();
          self.state[key] = checked ? (cur.includes(sid) ? cur : cur.concat(sid)) : cur.filter((x) => x !== sid);
          if (key === "companyIds") self.pruneCc();
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        },
        selectAll() {
          if (self.state.loading) return;
          if (!self.state.consulted && key !== "companyIds") return;
          if (self.tituloLock() && key !== "statusIds") return;
          self.state[key] = itemsFn().map((x) => String(x.id));
          if (key === "companyIds") self.pruneCc();
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        },
        selectNone() {
          if (self.state.loading) return;
          if (!self.state.consulted && key !== "companyIds") return;
          if (self.tituloLock() && key !== "statusIds") return;
          self.state[key] = [];
          if (key === "companyIds") self.pruneCc();
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        }
      });
    };
    bind("ecau-filter-emp", "companyIds", "openEmp", "qEmp", () => this.empItems(), { singular: "empresa", plural: "empresas" });
    bind("ecau-filter-cc", "ccIds", "openCc", "qCc", () => this.ccItems(), { singular: "empreendimento", plural: "empreendimentos" });
    bind("ecau-filter-cred", "creditorIds", "openCred", "qCred", () => this.credItems(), { singular: "credor", plural: "credores" });
    bind("ecau-filter-sit", "statusIds", "openSit", "qSit", () => this.statusItems(), { singular: "situação", plural: "situações" });
  },

  paintFilters() {
    if (!window.MlEmpresaFilter) return;
    if (!this.state.consulted || this.state.loading) {
      this.state.openCc = false;
      this.state.openCred = false;
      this.state.openSit = false;
    }
    this.bindFilters();
    const set = (slotId, html) => {
      const el = document.getElementById(slotId);
      if (el) el.innerHTML = html;
    };
    set("ecau-emp-slot", MlEmpresaFilter.html({
      id: "ecau-filter-emp",
      label: "Empresas",
      items: this.empItems(),
      selectedIds: this.state.companyIds,
      open: !!this.state.openEmp,
      query: this.state.qEmp,
      emptyMeansAll: true,
      nouns: { singular: "empresa", plural: "empresas" }
    }));
    set("ecau-cc-slot", MlEmpresaFilter.html({
      id: "ecau-filter-cc",
      label: "Empreendimento",
      items: this.ccItems(),
      selectedIds: this.state.ccIds,
      open: !!this.state.openCc,
      query: this.state.qCc,
      emptyMeansAll: true,
      nouns: { singular: "empreendimento", plural: "empreendimentos" }
    }));
    set("ecau-cred-slot", MlEmpresaFilter.html({
      id: "ecau-filter-cred",
      label: "Credor",
      items: this.credItems(),
      selectedIds: this.state.creditorIds,
      open: !!this.state.openCred,
      query: this.state.qCred,
      emptyMeansAll: true,
      nouns: { singular: "credor", plural: "credores" }
    }));
    set("ecau-sit-slot", MlEmpresaFilter.html({
      id: "ecau-filter-sit",
      label: "Situação",
      items: this.statusItems(),
      selectedIds: this.state.statusIds,
      open: !!this.state.openSit,
      query: this.state.qSit,
      emptyMeansAll: true,
      nouns: { singular: "situação", plural: "situações" }
    }));
    if (window.lucide) lucide.createIcons();
  },

  async loadCompanies() {
    if (!window.SiengeApiService || typeof SiengeApiService.getCompanies !== "function") return;
    try {
      const list = await SiengeApiService.getCompanies(false);
      const all = Array.isArray(list) ? list : ((list && list.results) || []);
      const gerida = this.geridaIdSet();
      this.state.companies = all.filter((c) => gerida.has(String(c.id)));
      this.state.companyIds = (this.state.companyIds || []).filter((id) => gerida.has(String(id)));
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
    this.loadLiberated();
    await this.pullLiberated();
    this.state.loading = true;
    this.state.error = "";
    this.state.consulted = true;
    this.state.selected = {};
    this.state.openEmp = false;
    this.state.openCred = false;
    this.state.openCc = false;
    this.state.openSit = false;
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
      this.state.error = (e && e.message) ? e.message : "Falha ao buscar cauções no Sienge.";
      this.state.allRows = [];
      this.state.shown = [];
      this.state.billsByTitulo = {};
    }
    this.state.loading = false;
    this.renderPage();
    if (!this.state.error) this.avisarPagamentosProximos().catch(function () {});
  },

  limpar() {
    if (this.state.loading) return;
    const range = this.defaultRange();
    this.state.startDate = range.startDate;
    this.state.endDate = range.endDate;
    this.state.companyIds = [];
    this.state.creditorIds = [];
    this.state.ccIds = [];
    this.state.statusIds = this.defaultStatusIds();
    this.state.qTitulo = "";
    this.state.qCredor = "";
    this.state.qCc = "";
    this.state.qSit = "";
    this.state.shown = [];
    this.state.allRows = [];
    this.state.billsByTitulo = {};
    this.state.selected = {};
    this.state.consulted = false;
    this.state.error = "";
    this.state.modal = "";
    this.renderPage();
  },

  syncTituloLock() {
    const lock = this.tituloLock();
    ["ecau-emp-slot", "ecau-cc-slot", "ecau-cred-slot"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("is-locked", lock);
    });
    document.querySelectorAll(".ecau-date input").forEach((el) => { el.disabled = lock; });
  },

  onField(field, val) {
    if (this.state.loading) return;
    if (!this.state.consulted && (field === "qTitulo" || field === "qCredor")) return;
    this.state[field] = val;
    if (field === "qTitulo" || field === "qCredor" || field === "startDate" || field === "endDate") {
      if (field === "qTitulo" && this.tituloLock()) {
        this.state.openEmp = false;
        this.state.openCc = false;
        this.state.openCred = false;
        this.paintFilters();
      }
      this.applyFilters();
      this.renderList();
      if (field === "qTitulo") this.syncTituloLock();
    }
  },

  credorRows(credor) {
    const name = credor || "Sem credor";
    return (this.state.shown || []).filter((r) => (r.credor || "Sem credor") === name && !r.pago);
  },

  toggleCredor(encoded) {
    let credor = "";
    try { credor = decodeURIComponent(String(encoded || "")); } catch (e) { credor = String(encoded || ""); }
    const rows = this.credorRows(credor);
    if (!rows.length) return;
    const allOn = rows.every((r) => this.state.selected[this.rowKey(r)]);
    rows.forEach((r) => {
      const key = this.rowKey(r);
      if (allOn) delete this.state.selected[key];
      else this.state.selected[key] = true;
    });
    this.renderList();
  },

  credorHeaderHtml(credor, totals) {
    const count = totals.count || 0;
    const countLabel = count === 1 ? "1 título" : count + " títulos";
    const valueLabel = (Number(totals.value) || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const selectable = this.credorRows(credor);
    const allOn = selectable.length > 0 && selectable.every((r) => this.state.selected[this.rowKey(r)]);
    const cell = "background:#f1f5f9;color:#475569;font-weight:700;font-size:0.75rem;letter-spacing:0.04em;text-transform:uppercase;padding:8px 12px;border:none;";
    return `<tr class="fila-group-header cprev-group-header is-neutral">
      <td class="ecau-col-chk" style="${cell}text-transform:none;">
        <input type="checkbox" ${selectable.length ? "" : "disabled"} ${allOn ? "checked" : ""}
          title="${allOn ? "Desmarcar este credor" : "Marcar todos deste credor"}"
          onclick="event.stopPropagation()"
          onchange="EngenhariaCaucaoApp.toggleCredor('${encodeURIComponent(credor || "Sem credor")}')">
      </td>
      <td colspan="5" style="${cell}">
        <div class="cprev-group-label">
          <span>${this.esc(credor || "Sem credor")}</span>
          <span class="ecau-group-tools">
            <span class="cprev-group-chip">${this.esc(countLabel)}</span>
          </span>
        </div>
      </td>
      <td colspan="5" style="${cell}"></td>
      <td style="${cell}text-align:right;white-space:nowrap;letter-spacing:0;text-transform:none;">
        <span class="cprev-group-chip">R$ ${this.esc(valueLabel)}</span>
      </td>
      <td style="${cell}"></td>
    </tr>`;
  },

  statusTip(r) {
    const venc = this.fmtDate(r && r.vencimento);
    if (r && r.pago) {
      const pag = this.fmtDate(r.dataPagamento);
      return pag && pag !== "—" ? ("Foi pago no dia " + pag) : "Foi pago";
    }
    if (this.isLiberated(r)) return "Será pago no dia " + venc;
    return "Provisionado para pagamento em " + venc;
  },

  statusTag(r) {
    const pago = !!(r && r.pago);
    const liberado = !pago && this.isLiberated(r);
    const kind = pago ? "pago" : (liberado ? "liberado" : "retido");
    const label = pago ? "Pago" : (liberado ? "Liberado" : "Retido");
    return `<span class="ecau-sit ecau-sit-${kind}" data-ecau-tip="${this.esc(this.statusTip(r))}">${label}</span>`;
  },

  ensureSitTip() {
    if (this._sitTipBound) return;
    this._sitTipBound = true;
    document.addEventListener("mouseover", (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-ecau-tip]") : null;
      if (!el) return;
      this.showSitTip(el);
    });
    document.addEventListener("mouseout", (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-ecau-tip]") : null;
      if (!el) return;
      const next = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest("[data-ecau-tip]") : null;
      if (next === el) return;
      this.hideSitTip();
    });
  },

  showSitTip(el) {
    let tip = document.getElementById("ecau-sit-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "ecau-sit-tip";
      tip.className = "ecau-sit-tip";
      document.body.appendChild(tip);
    }
    tip.textContent = el.getAttribute("data-ecau-tip") || "";
    tip.style.display = "block";
    const box = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = box.left + (box.width / 2) - (w / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = box.top - h - 8;
    if (top < 8) top = box.bottom + 8;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  },

  hideSitTip() {
    const tip = document.getElementById("ecau-sit-tip");
    if (tip) tip.style.display = "none";
  },

  renderList() {
    const box = document.getElementById("ecau-results");
    const kpi = document.getElementById("ecau-kpis");
    if (!box) return;
    if (this.state.loading) {
      box.innerHTML = `<div class="tvig-empty">Buscando cauções no Sienge…</div>`;
      if (kpi) kpi.innerHTML = "";
      this.paintSelectionBar();
      return;
    }
    if (this.state.error) {
      box.innerHTML = `<div class="tvig-empty">${this.esc(this.state.error)}</div>`;
      if (kpi) kpi.innerHTML = "";
      this.paintSelectionBar();
      return;
    }
    if (!this.state.consulted) {
      box.innerHTML = `<div class="tvig-empty">Use <strong>Consultar</strong> para carregar as cauções (documento CAU).</div>`;
      if (kpi) kpi.innerHTML = "";
      this.paintSelectionBar();
      return;
    }
    const rows = this.state.shown || [];
    const k = this.kpis();
    if (kpi) {
      kpi.innerHTML = `
        <div class="ccom-kpi"><span>Títulos</span><strong>${k.qtd}</strong></div>
        <div class="ccom-kpi"><span>Total</span><strong>${this.esc(this.money(k.total))}</strong></div>
        <div class="ccom-kpi"><span>Retidos</span><strong>${this.esc(this.money(k.aberto))}</strong></div>
        <div class="ccom-kpi"><span>Liberados</span><strong>${this.esc(this.money(k.liberado))}</strong></div>
        <div class="ccom-kpi"><span>Pagos</span><strong>${this.esc(this.money(k.pago))}</strong></div>`;
    }
    if (!rows.length) {
      box.innerHTML = `<div class="tvig-empty">Nenhuma caução CAU neste filtro.</div>`;
      this.paintSelectionBar();
      return;
    }
    const totals = {};
    rows.forEach((r) => {
      const g = r.credor || "Sem credor";
      if (!totals[g]) totals[g] = { count: 0, value: 0 };
      totals[g].count += 1;
      totals[g].value += Number(r.valorAjustado) || 0;
    });
    const selectable = this.selectableRows();
    const allOn = selectable.length > 0 && selectable.every((r) => this.state.selected[this.rowKey(r)]);
    let lastCredor = null;
    const body = rows.map((r, idx) => {
      let header = "";
      const credor = r.credor || "Sem credor";
      if (credor !== lastCredor) {
        lastCredor = credor;
        header = this.credorHeaderHtml(credor, totals[credor] || { count: 0, value: 0 });
      }
      const key = this.rowKey(r);
      const checked = !!this.state.selected[key];
      const late = !r.pago && r.vencimento && r.vencimento < this.isoToday();
      const ccLabel = (r.ccId ? r.ccId + " - " : "") + (r.ccNome || "—");
      return header + `<tr class="cprev-row${late ? " cprev-late" : ""}" data-key="${this.esc(key)}" data-idx="${idx}">
        <td class="ecau-col-chk" onclick="event.stopPropagation()">
          <input type="checkbox" ${r.pago ? "disabled" : ""} ${checked ? "checked" : ""}
            onchange="EngenhariaCaucaoApp.toggleRow('${this.esc(key)}', this.checked, event)">
        </td>
        <td class="cprev-col-id" title="${this.esc(r.companyId)}">${this.esc(r.companyId)}</td>
        <td class="cprev-col-cc" title="${this.esc(ccLabel)}">${this.esc(ccLabel)}</td>
        <td class="cprev-col-cred" title="${this.esc(r.credor || "—")}">${this.esc(r.credor || "—")}</td>
        <td class="cprev-col-tit" title="${this.esc(r.titulo)}">${this.esc(r.titulo)}</td>
        <td class="cprev-col-parc" title="${this.esc(r.parcela || "—")}">${this.esc(r.parcela || "—")}</td>
        <td class="cprev-col-doc" title="CAU">CAU</td>
        <td class="cprev-col-ndoc" title="${this.esc(r.documento || "—")}">${this.esc(r.documento || "—")}</td>
        <td class="ecau-col-emissao"><span class="ecau-emissao-wrap"><span>${this.esc(this.fmtDate(r.emissao))}</span>${this.emissaoAlertaHtml(r)}</span></td>
        <td class="cprev-col-venc" title="${this.esc(this.fmtDate(r.vencimento))}">${this.esc(this.fmtDate(r.vencimento))}</td>
        <td class="ecau-col-pag">${r.pago ? this.esc(this.fmtDate(r.dataPagamento)) : "—"}</td>
        <td class="cprev-col-val" title="${this.esc(this.money(r.valorAjustado))}">${this.esc(this.money(r.valorAjustado))}</td>
        <td class="ecau-col-sit">${this.statusTag(r)}</td>
      </tr>`;
    }).join("");
    box.innerHTML = `
      <div class="table-container cprev-table-wrap">
        <table class="custom-table cprev-table ecau-table" id="ecau-table">
          <colgroup>
            <col class="ecau-col-chk">
            <col class="cprev-col-id">
            <col class="cprev-col-cc">
            <col class="cprev-col-cred">
            <col class="cprev-col-tit">
            <col class="cprev-col-parc">
            <col class="cprev-col-doc">
            <col class="cprev-col-ndoc">
            <col class="ecau-col-emissao">
            <col class="cprev-col-venc">
            <col class="ecau-col-pag">
            <col class="cprev-col-val">
            <col class="ecau-col-sit">
          </colgroup>
          <thead>
            <tr>
              <th class="ecau-col-chk">
                <input type="checkbox" id="ecau-check-all" ${allOn ? "checked" : ""}
                  onchange="EngenhariaCaucaoApp.toggleAll(this.checked)" title="Marcar todos visíveis">
              </th>
              <th class="cprev-col-id" title="Id Empresa">Emp.</th>
              <th class="cprev-col-cc">Centro de custo</th>
              <th class="cprev-col-cred">Credor</th>
              <th class="cprev-col-tit">Título</th>
              <th class="cprev-col-parc">Parc.</th>
              <th class="cprev-col-doc">Doc.</th>
              <th class="cprev-col-ndoc">Nº doc.</th>
              <th class="ecau-col-emissao">Emissão</th>
              <th class="cprev-col-venc">Vencimento</th>
              <th class="ecau-col-pag">Pagamento</th>
              <th class="cprev-col-val">Valor</th>
              <th class="ecau-col-sit">Situação</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    this.paintSelectionBar();
    this.ensureSitTip();
    if (window.lucide) lucide.createIcons();
  },

  syncHeaderCheck() {
    const el = document.getElementById("ecau-check-all");
    if (!el) return;
    const selectable = this.selectableRows();
    el.checked = selectable.length > 0 && selectable.every((r) => this.state.selected[this.rowKey(r)]);
  },

  paintSelectionBar() {
    const open = this.selectedRows().filter((r) => !r.pago);
    const canAct = open.length > 0 && !this.state.busy;
    const canRetirar = open.some((r) => this.isLiberated(r)) && !this.state.busy;
    ["ecau-btn-due", "ecau-btn-liberar"].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !canAct;
    });
    const retirar = document.getElementById("ecau-btn-retirar");
    if (retirar) retirar.disabled = !canRetirar;
  },

  async retirarLiberacao() {
    const rows = this.selectedRows().filter((r) => !r.pago && this.isLiberated(r));
    if (!rows.length) return;
    const n = rows.length;
    const msg = "Retirar a liberação de " + n + " caução(ões)? O vencimento no Sienge permanece.";
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;
    const at = new Date().toISOString();
    rows.forEach((r) => {
      this.state.liberated[this.rowKey(r)] = {
        removed: true,
        at: at,
        titulo: r.titulo,
        parcela: r.parcela
      };
      this.logCaucao(
        "CAUCAO_LIBERACAO",
        r,
        "Liberação da caução retirada. Vencimento mantido em " + this.fmtDate(r.vencimento) + ".",
        "ok",
        { retirada: true, vencimento: r.vencimento }
      );
    });
    this.persistLiberated();
    this.applyFilters();
    this.renderList();
  },

  openDueModal() {
    const rows = this.selectedRows().filter((r) => !r.pago);
    if (!rows.length) {
      alert("Selecione ao menos uma caução em aberto.");
      return;
    }
    this.state.modal = "due";
    this.paintModal();
  },

  closeModal() {
    this.state.modal = "";
    const host = document.getElementById("ecau-modal");
    if (host) host.innerHTML = "";
  },

  paintModal() {
    const host = document.getElementById("ecau-modal");
    if (!host) return;
    if (this.state.modal !== "due") {
      host.innerHTML = "";
      return;
    }
    const n = this.selectedRows().filter((r) => !r.pago).length;
    host.innerHTML = `
      <div class="cprev-modal-overlay" onclick="if(event.target===this) EngenhariaCaucaoApp.closeModal()">
        <div class="cprev-modal" role="dialog" aria-modal="true" style="max-width:460px;">
          <div class="cprev-modal-head">
            <div>
              <h3>Ajustar vencimento</h3>
              <p>${n} caução(ões) selecionada(s). A data será gravada no Sienge.</p>
            </div>
          </div>
          <div class="cprev-modal-body" style="padding:18px;">
            <label for="ecau-new-due" style="display:block;font-size:0.75rem;font-weight:700;color:#64748b;margin-bottom:6px;">Novo vencimento</label>
            <input type="date" id="ecau-new-due" class="form-control" value="${this.esc(this.isoToday())}" oninput="EngenhariaCaucaoApp.syncDueWarn()" onkeydown="if(this.disabled){event.preventDefault();}">
            <p id="ecau-due-warn" class="ecau-due-warn" hidden>${this.esc(ECAU_EMISSAO_AVISO)}</p>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
              <button type="button" class="btn btn-cancel" onclick="EngenhariaCaucaoApp.closeModal()">Cancelar</button>
              <button type="button" class="btn btn-primary" id="ecau-due-apply" onclick="EngenhariaCaucaoApp.applyDueDate()">Aplicar no Sienge</button>
            </div>
          </div>
        </div>
      </div>`;
    this.syncDueWarn();
  },

  syncDueWarn() {
    const input = document.getElementById("ecau-new-due");
    const warn = document.getElementById("ecau-due-warn");
    const btn = document.getElementById("ecau-due-apply");
    const due = this.isoDate(input && input.value);
    const rows = this.selectedRows().filter((r) => !r.pago);
    const blocked = !!(due && rows.some((r) => this.vencimentoAntesDaEmissao(r, due)));
    if (warn) warn.hidden = !blocked;
    if (btn) btn.disabled = blocked;
    if (input) {
      input.disabled = blocked;
      input.classList.toggle("is-locked", blocked);
      if (blocked) input.blur();
    }
  },

  installmentPayload(r, dueDate) {
    return {
      dueDate,
      interestAmount: 0,
      fineAmount: 0,
      monetaryCorrectionAmount: 0,
      amount: Number(r.valor) || 0,
      discountAmount: 0,
      installmentId: Number(r.installmentId != null ? r.installmentId : r.parcela) || 1
    };
  },

  logCaucao(action, r, summary, status, extra) {
    if (!window.AuditService || typeof AuditService.logEvent !== "function" || !r) return;
    try {
      AuditService.logEvent({
        action: action,
        module: "Engenharia",
        status: status || "ok",
        summary: summary,
        customerLabel: r.credor || "",
        enterpriseId: r.ccId != null ? String(r.ccId) : "",
        enterpriseName: r.ccNome || "",
        titleId: r.titulo != null ? String(r.titulo) : "",
        details: Object.assign({
          parcela: r.parcela || "",
          documento: r.documento || "",
          valor: r.valorAjustado,
          credor: r.credor || "",
          empresa: r.companyId != null ? String(r.companyId) : ""
        }, extra || {})
      });
    } catch (e) {}
  },

  async patchBillInstallments(billId, items) {
    if (typeof window.siengePatch !== "function") {
      throw new Error("API Sienge indisponível para gravação.");
    }
    const path = "/bills/" + encodeURIComponent(billId) + "/installments";
    try {
      return await window.siengePatch(path, items);
    } catch (e) {
      if (items.length === 1) throw e;
      const out = [];
      for (const item of items) {
        out.push(await window.siengePatch(path, item));
      }
      return out;
    }
  },

  async applyDueDate() {
    const input = document.getElementById("ecau-new-due");
    const due = this.isoDate(input && input.value);
    if (!due) {
      alert("Informe a nova data de vencimento.");
      return;
    }
    const rows = this.selectedRows().filter((r) => !r.pago);
    if (!rows.length) {
      alert("Selecione ao menos uma caução em aberto.");
      return;
    }
    if (rows.some((r) => this.vencimentoAntesDaEmissao(r, due))) {
      this.syncDueWarn();
      return;
    }
    this.state.busy = true;
    this.paintSelectionBar();
    const byBill = new Map();
    rows.forEach((r) => {
      const id = String(r.titulo);
      if (!byBill.has(id)) byBill.set(id, []);
      byBill.get(id).push(r);
    });
    let ok = 0;
    const errors = [];
    for (const [billId, list] of byBill.entries()) {
      try {
        await this.patchBillInstallments(billId, list.map((r) => this.installmentPayload(r, due)));
        list.forEach((r) => {
          const anterior = r.vencimento;
          r.vencimento = due;
          ok += 1;
          this.logCaucao(
            "CAUCAO_VENCIMENTO",
            r,
            "Vencimento da caução alterado de " + this.fmtDate(anterior) + " para " + this.fmtDate(due) + ".",
            "ok",
            { vencimentoAnterior: anterior, vencimentoNovo: due }
          );
        });
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        errors.push("Título " + billId + ": " + msg);
        list.forEach((r) => {
          this.logCaucao(
            "CAUCAO_VENCIMENTO",
            r,
            "Falha ao alterar o vencimento da caução para " + this.fmtDate(due) + ". " + msg,
            "erro",
            { vencimentoAnterior: r.vencimento, vencimentoNovo: due, erro: msg }
          );
        });
      }
    }
    this.state.busy = false;
    this.closeModal();
    this.applyFilters();
    this.renderList();
    if (errors.length) {
      alert(ok + " parcela(s) atualizada(s).\n\nFalhas:\n" + errors.slice(0, 6).join("\n"));
    } else {
      alert(ok + " parcela(s) com vencimento ajustado no Sienge.");
    }
  },

  async liberarSelecionadas() {
    const rows = this.selectedRows().filter((r) => !r.pago);
    if (!rows.length) {
      alert("Selecione ao menos uma caução em aberto.");
      return;
    }
    const jaLiberadas = rows.filter((r) => this.isLiberated(r));
    const prorrogar = rows.filter((r) => !this.isLiberated(r) && this.dentroPrazoMinimo(r));
    const manter = rows.filter((r) => !this.isLiberated(r) && !this.dentroPrazoMinimo(r));
    const cfg = this.prorrogacao();
    const lines = [];
    if (prorrogar.length) lines.push(prorrogar.length + " caução(ões) com vencimento dentro de " + cfg.antes + " dias serão prorrogadas em " + cfg.dias + " dias e liberadas.");
    if (manter.length) lines.push(manter.length + " caução(ões) serão liberadas mantendo o vencimento atual.");
    if (jaLiberadas.length) lines.push(jaLiberadas.length + " já liberada(s) mantêm o vencimento para a tesouraria.");
    const msg = "Liberar as cauções selecionadas?\n\n" + lines.join("\n");
    const ok = typeof window.mouraConfirm === "function" ? await window.mouraConfirm(msg) : confirm(msg);
    if (!ok) return;

    this.state.busy = true;
    this.paintSelectionBar();
    const now = new Date().toISOString();
    const user = this.operatorName();
    const mark = (r) => {
      this.state.liberated[this.rowKey(r)] = {
        at: now,
        user,
        titulo: r.titulo,
        parcela: r.parcela,
        credor: r.credor,
        valor: r.valorAjustado,
        vencimento: r.vencimento
      };
    };
    let prorrogadas = 0;
    let liberadas = 0;
    const avisosProrroga = [];
    const errors = [];
    const byBill = new Map();
    prorrogar.forEach((r) => {
      const id = String(r.titulo);
      if (!byBill.has(id)) byBill.set(id, []);
      byBill.get(id).push(r);
    });
    for (const [billId, list] of byBill.entries()) {
      const nextByKey = {};
      list.forEach((r) => { nextByKey[this.rowKey(r)] = this.addDaysIso(r.vencimento, cfg.dias); });
      try {
        await this.patchBillInstallments(billId, list.map((r) => this.installmentPayload(r, nextByKey[this.rowKey(r)])));
        list.forEach((r) => {
          const anterior = r.vencimento;
          r.vencimento = nextByKey[this.rowKey(r)];
          mark(r);
          prorrogadas += 1;
          avisosProrroga.push(this.avisoItem(r, { anterior: this.fmtDate(anterior) }));
          this.logCaucao(
            "CAUCAO_LIBERACAO",
            r,
            "Caução liberada. Vencimento prorrogado de " + this.fmtDate(anterior) + " para " + this.fmtDate(r.vencimento) + ".",
            "ok",
            { vencimentoAnterior: anterior, vencimentoNovo: r.vencimento, prorrogada: true }
          );
        });
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        errors.push("Título " + billId + ": " + msg);
        list.forEach((r) => {
          this.logCaucao(
            "CAUCAO_LIBERACAO",
            r,
            "Falha ao liberar a caução. " + msg,
            "erro",
            { vencimento: r.vencimento, erro: msg }
          );
        });
      }
    }
    manter.forEach((r) => {
      mark(r);
      liberadas += 1;
      this.logCaucao(
        "CAUCAO_LIBERACAO",
        r,
        "Caução liberada. Vencimento mantido em " + this.fmtDate(r.vencimento) + ".",
        "ok",
        { vencimento: r.vencimento, prorrogada: false }
      );
    });
    try {
      await this.persistLiberated();
    } catch (e) {
      errors.push("A liberação não ficou salva. Não atualize a página antes de tentar de novo.");
    }
    if (avisosProrroga.length) {
      this.enqueueAviso("prorrogacao", avisosProrroga);
      this.flushAvisos().catch(function () {});
    }
    this.state.busy = false;
    this.applyFilters();
    this.renderList();
    const parts = [];
    if (prorrogadas) parts.push(prorrogadas + " prorrogada(s) em " + cfg.dias + " dias e liberada(s).");
    if (liberadas) parts.push(liberadas + " liberada(s) com o vencimento atual.");
    if (jaLiberadas.length) parts.push(jaLiberadas.length + " já liberada(s): vencimento mantido para a tesouraria.");
    if (errors.length) parts.push("Falhas:\n" + errors.slice(0, 6).join("\n"));
    alert(parts.join("\n") || "Nenhuma caução foi alterada.");
  },

  caucaoSituacao(r) {
    if (r && r.pago) return "Pago";
    if (this.isLiberated(r)) return "Liberado";
    return "Retido";
  },

  fillCaucaoSheet(ws, rows, imgId, host) {
    const paint = (cell, opts) => host.excelPaint(cell, opts);
    const moneyFmt = "#,##0.00";
    const heads = [
      "Credor", "Empresa", "Centro de custo", "Título", "Parcela",
      "Documento", "Nº documento", "Emissão", "Vencimento", "Pagamento", "Valor (R$)", "Situação"
    ];
    const sitStyle = {
      Retido: { color: "FF9A3412", fill: "FFFFF7ED" },
      Liberado: { color: "FF105436", fill: "FFECFDF5" },
      Pago: { color: "FFFFFFFF", fill: "FF475569" }
    };
    let retido = 0;
    let liberado = 0;
    let pago = 0;
    rows.forEach((r) => {
      const v = Number(r.valorAjustado) || 0;
      const sit = this.caucaoSituacao(r);
      if (sit === "Pago") pago += v;
      else if (sit === "Liberado") liberado += v;
      else retido += v;
    });
    const total = retido + liberado + pago;

    ws.properties.showGridLines = false;
    ws.views = [{
      state: "frozen",
      ySplit: 4,
      topLeftCell: "A5",
      activeCell: "A5",
      showGridLines: false
    }];
    ws.columns = [
      { width: 42 }, { width: 12 }, { width: 36 }, { width: 14 }, { width: 12 },
      { width: 14 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 16 }, { width: 14 }
    ];
    ws.mergeCells("A1:G2");
    ws.getRow(1).height = 28;
    ws.getRow(2).height = 22;
    const de = this.fmtDate(this.state.startDate);
    const ate = this.fmtDate(this.state.endDate);
    const title = ws.getCell("A1");
    title.value = {
      richText: [
        { font: { name: "Calibri", size: 16, bold: true, color: { argb: "FF105436" } }, text: "Gestão de caução\n" },
        { font: { name: "Calibri", size: 9, color: { argb: "FF64748B" } }, text: "Vencimento de " + de + " a " + ate }
      ]
    };
    paint(title, {
      fill: "FFFFFFFF",
      align: { vertical: "middle", horizontal: "left", wrapText: true, indent: 8 }
    });
    const logoCm = 1.54;
    const logoPx = Math.round(logoCm * 96 / 2.54);
    if (imgId != null) {
      try {
        ws.addImage(imgId, { tl: { col: 0.04, row: 0.08 }, ext: { width: logoPx, height: logoPx } });
      } catch (e) {}
    }
    [
      { label: "Títulos", value: rows.length, color: "FF0F172A", money: false },
      { label: "Retido", value: retido, color: "FF9A3412", money: true },
      { label: "Liberado", value: liberado, color: "FF105436", money: true },
      { label: "Pago", value: pago, color: "FF475569", money: true },
      { label: "Total", value: total, color: "FF0F172A", money: true }
    ].forEach((k, i) => {
      const col = 8 + i;
      const lab = ws.getRow(1).getCell(col);
      const val = ws.getRow(2).getCell(col);
      lab.value = k.label;
      val.value = k.value;
      paint(lab, {
        fill: "FFFFFFFF",
        font: { bold: true, size: 8, color: { argb: "FF94A3B8" } },
        align: { horizontal: "right", vertical: "bottom" }
      });
      paint(val, {
        fill: "FFFFFFFF",
        font: { bold: true, size: 12, color: { argb: k.color } },
        align: { horizontal: "right", vertical: "middle" },
        numFmt: k.money ? moneyFmt : "0"
      });
    });
    ws.getRow(3).height = 8;
    const head = ws.getRow(4);
    head.height = 20;
    heads.forEach((h, i) => {
      const cell = head.getCell(i + 1);
      cell.value = h;
      paint(cell, {
        fill: "FF105436",
        font: { bold: true, size: 9, color: { argb: "FFFFFFFF" } },
        align: { horizontal: i === 10 ? "right" : "left", vertical: "middle" },
        border: true
      });
    });

    const grouped = new Map();
    rows.forEach((r) => {
      const g = r.credor || "Sem credor";
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g).push(r);
    });
    let rowIdx = 5;
    [...grouped.keys()].sort((a, b) => a.localeCompare(b, "pt-BR")).forEach((credor) => {
      const list = grouped.get(credor);
      const soma = list.reduce((s, r) => s + (Number(r.valorAjustado) || 0), 0);
      const band = ws.getRow(rowIdx);
      band.height = 20;
      for (let c = 1; c <= 12; c++) {
        const cell = band.getCell(c);
        paint(cell, {
          fill: "FF334155",
          font: { bold: true, size: 9, color: { argb: "FFFFFFFF" } },
          align: { horizontal: c === 11 ? "right" : "left", vertical: "middle" },
          border: true,
          numFmt: c === 11 ? moneyFmt : undefined
        });
      }
      band.getCell(1).value = String(credor).toUpperCase();
      band.getCell(3).value = list.length + (list.length === 1 ? " título" : " títulos");
      band.getCell(11).value = soma;
      rowIdx += 1;
      list.forEach((r, i) => {
        const sit = this.caucaoSituacao(r);
        const tone = sitStyle[sit];
        const bg = i % 2 ? "FFF8FAFC" : "FFFFFFFF";
        const line = ws.getRow(rowIdx);
        line.height = 18;
        const values = [
          r.credor || "",
          r.companyId != null ? String(r.companyId) : "",
          (r.ccId ? r.ccId + " - " : "") + (r.ccNome || ""),
          r.titulo != null ? String(r.titulo) : "",
          r.parcela != null ? String(r.parcela) : "",
          "CAU",
          r.documento || "",
          this.fmtDate(r.emissao),
          this.fmtDate(r.vencimento),
          r.pago ? this.fmtDate(r.dataPagamento) : "",
          Number(r.valorAjustado) || 0,
          sit
        ];
        values.forEach((v, c) => {
          const cell = line.getCell(c + 1);
          cell.value = v;
          const isMoney = c === 10;
          const isSit = c === 11;
          paint(cell, {
            fill: isSit ? tone.fill : bg,
            font: {
              size: 9,
              bold: isMoney || isSit,
              color: { argb: isSit ? tone.color : (isMoney ? tone.color : "FF0F172A") }
            },
            align: { horizontal: isMoney ? "right" : "left", vertical: "middle" },
            border: true,
            numFmt: isMoney ? moneyFmt : undefined
          });
        });
        rowIdx += 1;
      });
    });
    rowIdx += 1;
    ws.mergeCells(rowIdx, 1, rowIdx, 12);
    const foot = ws.getCell(rowIdx, 1);
    foot.value = host.generatedAtLabel(new Date());
    paint(foot, {
      font: { italic: true, size: 8, color: { argb: "FF64748B" } },
      align: { vertical: "middle", horizontal: "left" }
    });
    ws.getRow(rowIdx).height = 18;
  },

  async exportExcel() {
    if (this.state.loading) return;
    const rows = this.state.shown || [];
    if (!rows.length) {
      alert("Não há cauções para exportar neste filtro.");
      return;
    }
    const host = window.InvestimentoApp;
    if (!host || typeof host.ensureExcelJS !== "function" || typeof host.excelPaint !== "function") {
      alert("Não foi possível carregar a biblioteca de Excel. Recarregue a página.");
      return;
    }
    let ExcelJS;
    try {
      ExcelJS = await host.ensureExcelJS();
    } catch (e) {
      alert("Não foi possível carregar a biblioteca de Excel. Recarregue a página.");
      return;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM Moura Leite";
    wb.created = new Date();
    let imgId = null;
    try {
      const logo = await host.logoDataUrl();
      if (logo && logo.dataUrl) imgId = wb.addImage({ base64: logo.dataUrl, extension: logo.extension || "png" });
    } catch (e) {}
    const ws = wb.addWorksheet("Caução", { properties: { showGridLines: false } });
    this.fillCaucaoSheet(ws, rows, imgId, host);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gestao-caucao-" + this.isoToday() + ".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  },


  renderPage() {
    const root = document.getElementById("engenharia-caucao-root");
    if (!root) return;
    const s = this.state;
    const busy = !!s.loading;
    const lockFilters = this.tituloLock() || busy;
    const refineLocked = !s.consulted || busy;
    root.innerHTML = `
      <div class="cprev-page ecau-page">
        <div class="search-filter-panel cprev-toolbar ecau-toolbar">
          <div class="ecau-grid${busy ? " is-consulting" : ""}">
            <div id="ecau-emp-slot" class="ecau-slot ecau-cell-emp${lockFilters ? " is-locked" : ""}"></div>
            <div id="ecau-cc-slot" class="ecau-slot ecau-cell-obra${refineLocked || this.tituloLock() ? " is-locked" : ""}"></div>
            <div id="ecau-cred-slot" class="ecau-slot ecau-cell-cred${refineLocked || this.tituloLock() ? " is-locked" : ""}"></div>
            <div class="form-group ecau-search ecau-cell-titulo${refineLocked ? " is-locked" : ""}">
              <label>Título</label>
              <input type="search" class="form-control" placeholder="Título ou nº do documento"
                value="${this.esc(s.qTitulo)}" ${refineLocked ? "disabled" : ""} oninput="EngenhariaCaucaoApp.onField('qTitulo', this.value)" autocomplete="off">
            </div>
            <div id="ecau-sit-slot" class="ecau-slot ecau-cell-sit${refineLocked ? " is-locked" : ""}"></div>
            <div class="ecau-cell-dates${busy ? " is-locked" : ""}">
              <div class="form-group ecau-date">
                <label>Vencimento de</label>
                <input type="date" class="form-control" value="${this.esc(s.startDate)}" ${lockFilters ? "disabled" : ""}
                  onchange="EngenhariaCaucaoApp.onField('startDate', this.value)">
              </div>
              <div class="form-group ecau-date">
                <label>Vencimento até</label>
                <input type="date" class="form-control" value="${this.esc(s.endDate)}" ${lockFilters ? "disabled" : ""}
                  onchange="EngenhariaCaucaoApp.onField('endDate', this.value)">
              </div>
            </div>
            <div class="ecau-actions">
              <div class="ecau-actions-main">
                <button type="button" class="btn btn-primary btn-sm" ${busy ? "disabled" : ""} onclick="EngenhariaCaucaoApp.consultar()">
                  ${busy
                    ? '<span class="ecau-spin" aria-hidden="true"></span>'
                    : '<i data-lucide="search" style="width:14px;height:14px;"></i>'}
                  Consultar
                </button>
                <button type="button" class="btn btn-cancel btn-sm" ${busy ? "disabled" : ""} onclick="EngenhariaCaucaoApp.limpar()">Limpar</button>
                <button type="button" class="btn btn-sm btn-excel" ${busy ? "disabled" : ""} onclick="EngenhariaCaucaoApp.exportExcel()" title="Exportar agrupado por credor">
                  <i data-lucide="download" style="width:14px;height:14px;"></i> Excel
                </button>
              </div>
            </div>
            <div class="ecau-release">
              <button type="button" id="ecau-btn-due" class="btn btn-primary btn-sm ecau-bar-btn" disabled onclick="EngenhariaCaucaoApp.openDueModal()">
                <i data-lucide="calendar-clock" style="width:14px;height:14px;"></i> Ajustar vencimento
              </button>
              <button type="button" id="ecau-btn-liberar" class="btn btn-secondary btn-sm ecau-bar-btn" disabled onclick="EngenhariaCaucaoApp.liberarSelecionadas()">
                <i data-lucide="unlock" style="width:14px;height:14px;"></i> Liberar para pagamento
              </button>
              <button type="button" id="ecau-btn-retirar" class="btn btn-sm ecau-bar-btn" disabled onclick="EngenhariaCaucaoApp.retirarLiberacao()">
                <i data-lucide="lock" style="width:14px;height:14px;"></i> Retirar liberação
              </button>
            </div>
          </div>
        </div>
        <div class="ccom-kpis cprev-kpis" id="ecau-kpis"></div>
        <div id="ecau-results" class="cprev-results"></div>
        <div id="ecau-modal"></div>
      </div>`;
    this.paintFilters();
    this.renderList();
    if (s.modal === "due") this.paintModal();
    if (window.lucide) lucide.createIcons();
  },

  async init() {
    let root = document.getElementById("engenharia-caucao-root");
    if (!root) {
      let pane = document.getElementById("tab-engenharia-caucao");
      if (!pane) {
        pane = document.createElement("section");
        pane.id = "tab-engenharia-caucao";
        pane.className = "tab-pane";
        pane.style.display = "block";
        const main = document.querySelector(".main-content");
        if (main) main.appendChild(pane);
      }
      root = document.createElement("div");
      root.id = "engenharia-caucao-root";
      pane.appendChild(root);
    }
    this.loadLiberated();
    this.resetStatusFilter();
    const boot = this.pullLiberated();
    if (!this.state.inited) {
      try {
        const range = this.defaultRange();
        this.state.startDate = range.startDate;
        this.state.endDate = range.endDate;
      } catch (e) {
        const t = this.isoToday();
        this.state.startDate = t.slice(0, 8) + "01";
        this.state.endDate = t;
      }
      this.state.inited = true;
      this.renderPage();
      await this.loadCompanies();
    }
    if (this.state.consulted) this.applyFilters();
    this.renderPage();
    boot.then(() => {
      if (!this.state.consulted) return;
      this.applyFilters();
      this.renderList();
    }).catch(function () {});
  },

  onProrrogaField(field, val) {
    const draft = parseCaucaoProrrogacao(this.state.prorrogaDraft || this.prorrogacao());
    draft[field] = val;
    draft.updatedAt = this.state.prorrogaDraft && this.state.prorrogaDraft.updatedAt;
    this.state.prorrogaDraft = parseCaucaoProrrogacao(draft);
  },

  cancelProrrogaEdit() {
    this.state.prorrogaDraft = this.prorrogacao();
    this.renderConfig();
  },

  restoreProrrogaDefault() {
    this.state.prorrogaDraft = parseCaucaoProrrogacao(ECAU_PRORROGA_DEFAULT);
    this.renderConfig();
  },

  saveProrrogaConfig() {
    const saved = this.saveProrrogacao(this.state.prorrogaDraft || this.prorrogacao());
    this.state.prorrogaDraft = saved;
    this.renderConfig();
    alert("Prorrogação de caução salva.");
  },

  renderConfig() {
    const root = document.getElementById("engenharia-config-root");
    if (!root) return;
    const cfg = parseCaucaoProrrogacao(this.state.prorrogaDraft || this.prorrogacao());
    this.state.prorrogaDraft = cfg;
    root.innerHTML = `
      <div class="cprev-config-page">
        <div class="crm-card cprev-config-card">
          <div class="cprev-config-help">
            <i data-lucide="info"></i>
            <p>O caução <strong>retido</strong> que estiver a vencer dentro do prazo abaixo é prorrogado no Sienge no momento da liberação. O primeiro campo diz com quantos dias de antecedência isso acontece. O segundo diz quantos dias o vencimento avança.</p>
          </div>
          <div class="cprev-prazo-list">
            <label class="cprev-prazo-row">
              <span class="cprev-prazo-day">
                <span class="cprev-prazo-name">Dias antes do vencimento</span>
              </span>
              <span class="cprev-prazo-field">
                <input type="number" min="0" max="365" step="1" value="${this.esc(cfg.antes)}"
                  aria-label="Dias antes do vencimento"
                  onchange="EngenhariaCaucaoApp.onProrrogaField('antes', this.value)">
                <span>dias</span>
              </span>
            </label>
            <label class="cprev-prazo-row">
              <span class="cprev-prazo-day">
                <span class="cprev-prazo-name">Dias para prorrogar</span>
              </span>
              <span class="cprev-prazo-field">
                <input type="number" min="1" max="365" step="1" value="${this.esc(cfg.dias)}"
                  aria-label="Dias para prorrogar no futuro"
                  onchange="EngenhariaCaucaoApp.onProrrogaField('dias', this.value)">
                <span>dias</span>
              </span>
            </label>
          </div>
          <div class="cprev-config-actions">
            <button type="button" class="btn btn-cancel" onclick="EngenhariaCaucaoApp.cancelProrrogaEdit()">Cancelar</button>
            <button type="button" class="btn btn-outline" onclick="EngenhariaCaucaoApp.restoreProrrogaDefault()">Restaurar padrão</button>
            <button type="button" class="btn btn-primary" onclick="EngenhariaCaucaoApp.saveProrrogaConfig()">Salvar</button>
          </div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  initConfig() {
    const root = document.getElementById("engenharia-config-root");
    if (!root) return;
    this.state.prorrogaDraft = this.prorrogacao();
    this.renderConfig();
  }
};

window.mergeEngenhariaCaucaoLiberados = function (localStr, cloudStr) {
  const parse = (raw) => {
    try { return JSON.parse(raw || "{}") || {}; } catch (e) { return {}; }
  };
  const local = parse(localStr);
  const cloud = parse(cloudStr);
  const out = Object.assign({}, cloud, local);
  Object.keys(cloud).forEach((k) => {
    const a = local[k];
    const b = cloud[k];
    if (!a) out[k] = b;
    else if (!b) out[k] = a;
    else out[k] = String(a.at || "") >= String(b.at || "") ? a : b;
  });
  return JSON.stringify(out);
};

window.mergeEngenhariaCaucaoAvisos = function (localStr, cloudStr) {
  const parse = (raw) => {
    try { return JSON.parse(raw || "{}") || {}; } catch (e) { return {}; }
  };
  const local = parse(localStr);
  const cloud = parse(cloudStr);
  const sent = Object.assign({}, cloud.sent || {}, local.sent || {});
  const queue = new Map();
  [].concat(cloud.queue || [], local.queue || []).forEach((q) => {
    if (q && q.key && !sent[q.key]) queue.set(q.key, q);
  });
  return JSON.stringify({
    sent: sent,
    queue: Array.from(queue.values()),
    lastTry: Math.max(Number(local.lastTry) || 0, Number(cloud.lastTry) || 0)
  });
};

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "engenharia-caucao" || e.detail === "construcao-engenharia") {
    EngenhariaCaucaoApp.init();
  }
  if (e.detail === "engenharia-config") {
    EngenhariaCaucaoApp.initConfig();
  }
});
