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
  DOC_SUBSTITUICAO: { PRV: 1, PRVR: 1, PRVC: 1 },
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
    SUBSTITUIDOS: "substituidos",
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
    ccIds: [],
    openEmp: false,
    openCred: false,
    openDept: false,
    openCc: false,
    qEmp: "",
    qCred: "",
    qDept: "",
    qCc: "",
    qTitulo: "",
    qCredor: "",
    status: "aberto",
    allRows: [],
    shown: [],
    billsByTitulo: {},
    pedidosByTitulo: {},
    notaByPedido: {},
    notaByContrato: {},
    baixasByTitulo: {},
    anexosByTitulo: {},
    notasByPedido: {},
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
      || this.isoDate(pay && (pay.paymentDate || pay.date || pay.payOffDate || pay.bankMovementDate));
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

  baixaBlob(bill, pay, bm) {
    const parts = [
      pay && pay.operationTypeName,
      pay && pay.operationName,
      pay && pay.operationType,
      pay && pay.paymentTypeName,
      pay && (pay.notes || pay.note || pay.observation || pay.observations || pay.historic || pay.history || pay.description || pay.complement),
      bm && (bm.operationName || bm.operationTypeName || bm.notes || bm.observation || bm.historic),
      bill && (bill.operationTypeName || bill.dischargeType || bill.writeOffType || bill.paymentTypeName),
      bill && (bill.notes || bill.observation || bill.historic || bill.history || bill.complement)
    ];
    return this.fold(parts.filter(Boolean).join(" "));
  },

  isDocSubstituivel(docId, docName) {
    const id = this.docCode(docId);
    const token = this.docCode(this.firstWord(docId || docName));
    return !!(this.DOC_SUBSTITUICAO[id] || this.DOC_SUBSTITUICAO[token]);
  },

  isSubstituicao(bill, pay, bm, docId, docName) {
    if (!/SUBSTITU/.test(this.baixaBlob(bill, pay, bm))) return false;
    if (!docId && !docName) return true;
    return this.isDocSubstituivel(docId, docName);
  },

  tituloSubstituto(bill, pay, bm) {
    const raw = [
      pay && (pay.relatedBillId || pay.substituteBillId || pay.replacedByBillId || pay.destinationBillId),
      pay && (pay.notes || pay.note || pay.observation || pay.observations || pay.historic || pay.history || pay.description || pay.complement),
      bm && (bm.notes || bm.observation || bm.historic),
      bill && (bill.notes || bill.observation || bill.historic || bill.complement)
    ].filter(Boolean).join(" ");
    const m = String(raw).match(/SUBSTITU[^\d]{0,24}(\d{3,})/i);
    if (m) return m[1];
    const n = Number(pay && (pay.relatedBillId || pay.substituteBillId || pay.replacedByBillId || pay.destinationBillId));
    return Number.isFinite(n) && n > 0 ? String(n) : "";
  },

  isSituacaoAberta(bill, pay) {
    const sit = this.billSituation(bill, pay);
    return sit === "NP" || /\b(NP|NAO PAGO|NAO PAGA|EM ABERTO|OPEN|PENDING|UNPAID)\b/.test(sit);
  },

  isPago(bill, pay, bm, docId, docName) {
    if (this.isSubstituicao(bill, pay, bm, docId, docName)) return false;
    if (this.isSituacaoAberta(bill, pay)) return false;
    if (this.paymentDateOf(bill, pay, bm)) return true;
    const sit = this.billSituation(bill, pay);
    if (sit === "PG" || /\b(PG|PAGO|PAGA|LIQUIDADO|QUITADO|PAID|SETTLED)\b/.test(sit)) return true;
    const tipo = this.fold((pay && (pay.operationTypeName || pay.operationName)) || (bm && bm.operationName) || "");
    if (tipo && /BAIXA|LIQUID|QUITAC/.test(tipo) && !/ESTORNO|CANCEL|SUBSTITU/.test(tipo)) return true;
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

  pedidoKey(doc) {
    const s = String(doc || "").trim();
    if (!/^\d{3,}$/.test(s)) return "";
    return String(Number(s));
  },

  indexPedidos() {
    const byTitle = {};
    const add = (titulo, doc) => {
      const key = this.pedidoKey(doc);
      if (!key) return;
      const id = String(titulo || "");
      if (!id) return;
      if (!byTitle[id]) byTitle[id] = {};
      byTitle[id][key] = 1;
    };
    Object.keys(this.state.billsByTitulo || {}).forEach((titulo) => {
      (this.state.billsByTitulo[titulo] || []).forEach((bill) => add(titulo, bill && bill.documentNumber));
    });
    (this.state.allRows || []).forEach((row) => add(row.titulo, row.documento));
    this.state.pedidosByTitulo = byTitle;
  },

  titleHasNota(titulo) {
    const id = String(titulo);
    const onBill = (this.state.billsByTitulo[id] || []).some((b) =>
      this.isNotaDoc(b.documentIdentificationId, b.documentIdentificationName, b)
    );
    if (onBill) return true;
    if (this.state.notaByContrato && this.state.notaByContrato[id]) return true;
    const pedidos = this.state.pedidosByTitulo[id] || {};
    return Object.keys(pedidos).some((pedido) => this.state.notaByPedido[pedido] === true);
  },

  notasFromDeliveries(data, orderId) {
    const rows = (data && data.results) || (Array.isArray(data) ? data : []);
    const order = String(orderId || "");
    const found = [];
    const seen = new Set();
    const push = (num, series, doc) => {
      const n = String(num == null ? "" : num).trim();
      if (!n || n === order || !/^\d+$/.test(n)) return;
      const kindRaw = this.docCode(doc);
      const kind = /^NF/.test(kindRaw) ? kindRaw : "NFS";
      const key = kind + "|" + n + "|" + String(series || "");
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ number: n, series: String(series || ""), label: kind + " " + n });
    };
    const looksInvoice = (obj) => {
      const keys = Object.keys(obj || {}).map((k) => k.toLowerCase());
      return keys.some((k) => k.includes("invoice") || k.includes("series") || k.includes("nota") || k === "issuedate");
    };
    const walk = (node, depth) => {
      if (!node || depth > 6) return;
      if (Array.isArray(node)) {
        node.forEach((item) => walk(item, depth + 1));
        return;
      }
      if (typeof node !== "object") return;
      ["purchaseInvoice", "invoice", "invoiceData", "notaFiscal", "invoices", "notes"].forEach((key) => {
        if (node[key]) walk(node[key], depth + 1);
      });
      const doc = node.documentId || node.documentIdentificationId || node.documentType || "";
      const series = node.series || node.invoiceSeries || "";
      ["invoiceNumber", "purchaseInvoiceNumber", "documentNumber", "notaNumber"].forEach((key) => {
        if (node[key] != null && typeof node[key] !== "object") push(node[key], series, doc);
      });
      if (node.number != null && typeof node.number !== "object" && looksInvoice(node)) {
        push(node.number, series, doc);
      }
      Object.keys(node).forEach((key) => {
        if (node[key] && typeof node[key] === "object") walk(node[key], depth + 1);
      });
    };
    rows.forEach((row) => walk(row, 0));
    return found;
  },

  samePedido(parcela, pedido) {
    return this.pedidoKey(parcela && parcela.documento) === String(pedido || "");
  },

  parcelaRecebeNota(parcela, pedido) {
    if (!parcela) return false;
    if (this.samePedido(parcela, pedido)) return false;
    if (!parcela.pago || parcela.substituido) return false;
    if (this.pedidoKey(parcela.documento)) return false;
    if (this.isNotaDoc(parcela.docId, parcela.docNome, null)) return false;
    return true;
  },

  async notasFromInvoiceSequentials(rows) {
    const ids = [];
    (rows || []).forEach((row) => {
      const id = row && row.sequentialNumber;
      if (id == null || id === "") return;
      const key = String(id);
      if (ids.indexOf(key) < 0) ids.push(key);
    });
    const notas = [];
    const seen = new Set();
    for (const seq of ids) {
      const delivery = (rows || []).find((row) => String(row.sequentialNumber) === seq);
      const inv = await window.siengeFetchWithRetry("/purchase-invoices/" + encodeURIComponent(seq), 1);
      const number = String(inv && inv.number || "").trim();
      if (!number) continue;
      const doc = this.docCode(inv && inv.documentId) || "NFS";
      const series = String(inv && inv.series || "").trim();
      const key = doc + "|" + number + "|" + series;
      if (seen.has(key)) continue;
      seen.add(key);
      const billId = inv && inv.billId != null && inv.billId !== "" ? String(inv.billId) : "";
      let attachments = [];
      if (billId) {
        try { attachments = await this.anexosDoTitulo(billId); } catch (e) { attachments = []; }
      }
      notas.push({
        number,
        series,
        label: doc + " " + number,
        billId,
        attachments,
        issueDate: inv && inv.issueDate ? String(inv.issueDate).slice(0, 10) : "",
        deliveryDate: delivery && delivery.deliveryDate ? String(delivery.deliveryDate).slice(0, 10) : ""
      });
    }
    return notas;
  },

  async anexosDoTitulo(billId) {
    const data = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(billId) + "/attachments", 1);
    return ((data && data.results) || []).map((a) => ({
      id: a.attachmentid != null ? a.attachmentid : a.attachmentId,
      name: String(a.name || "anexo.pdf"),
      description: String(a.description || "PDF").trim() || "PDF"
    })).filter((a) => a.id != null && a.id !== "");
  },

  notasDaParcela(parcela, pedido, notas) {
    if (!parcela || this.samePedido(parcela, pedido)) return [];
    const list = notas || [];
    const doc = String(parcela.documento || "").trim();
    if (doc) {
      const byNum = list.filter((n) => String(n.number) === doc);
      if (byNum.length) return byNum;
    }
    if (!this.parcelaRecebeNota(parcela, pedido) || !parcela.vencimento) return [];
    const due = String(parcela.vencimento).slice(0, 10);
    return list.filter((n) => n.deliveryDate && n.deliveryDate === due);
  },

  daySpan(fromIso, toIso) {
    const a = String(fromIso || "").slice(0, 10);
    const b = String(toIso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
    const ms = Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00");
    if (!Number.isFinite(ms)) return null;
    return Math.round(ms / 86400000);
  },

  pmpInfo(parcelas) {
    const parts = [];
    (parcelas || []).forEach((p) => {
      if (!p.pago || p.substituido || !p.dataPagamento) return;
      const nota = (p.notas || []).find((n) => n && n.issueDate);
      if (!nota) return;
      const days = this.daySpan(nota.issueDate, p.dataPagamento);
      if (days == null) return;
      parts.push({
        label: nota.label || ("NFS " + nota.number),
        days,
        issue: nota.issueDate,
        paid: p.dataPagamento
      });
    });
    if (!parts.length) return null;
    const avg = Math.round(parts.reduce((sum, part) => sum + part.days, 0) / parts.length);
    return { days: avg, parts };
  },

  pmpHtml(parcelas) {
    const info = this.pmpInfo(parcelas);
    if (!info) return "";
    const label = info.days === 1 ? "1 dia" : info.days + " dias";
    const title = info.parts.map((part) =>
      part.label + ": " + part.days + " dias (emissão " + this.fmtDate(part.issue) + ", pago " + this.fmtDate(part.paid) + ")"
    ).join(". ");
    return `<div class="cprev-pmp" title="${this.esc(title)}"><span>PMP</span><strong>${this.esc(label)}</strong></div>`;
  },

  docCellHtml(p) {
    if (this.pedidoKey(p.documento) && !this.isNotaDoc(p.docId, p.docNome, null)) {
      return this.esc(p.docId || "—");
    }
    const nota = (p.notas || [])[0];
    const virou = this.isNotaDoc(p.docId, p.docNome, null) || !!nota;
    if (!virou) return this.esc(p.docId || "—");
    const code = (nota && nota.docCode) || this.docCode(p.docId) || this.docCode(String((nota && nota.label) || "").split(" ")[0]) || "NFS";
    return `<span class="cprev-tag cprev-tag-nota cprev-doc-nota">${this.esc(code)}</span>`;
  },

  anexoPackHtml(n) {
    const bill = n.billId
      ? `<span class="cprev-anexo-bill">Tít. <strong>${this.esc(n.billId)}</strong></span>`
      : "";
    const files = (n.attachments || []).map((a) => {
      const label = a.description || "PDF";
      return `<button type="button" class="cprev-pdf-btn" title="Baixar ${this.esc(a.name)}" onclick="event.stopPropagation(); ComprasPrevisoesApp.baixarAnexoTitulo('${this.esc(n.billId)}','${this.esc(a.id)}')"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2v7.1M5.2 7.1 8 9.9l2.8-2.8M3.2 12.2h9.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${this.esc(label)}</button>`;
    }).join("");
    if (!bill && !files) return `<span class="cprev-anexo-vazio">—</span>`;
    return `<div class="cprev-anexos">${bill}<span class="cprev-anexo-list">${files}</span></div>`;
  },

  anexosCellHtml(p) {
    const packs = [];
    if (p.notas && p.notas.length) packs.push(p.notas.map((n) => this.anexoPackHtml(n)).join(""));
    if (p.anexoSubstituto) packs.push(this.anexoPackHtml(p.anexoSubstituto));
    if (packs.length) return packs.join("");
    if (p.notasLoading || p.anexosSubstitutoLoading) return `<span class="cprev-anexo-vazio">Buscando…</span>`;
    const erro = p.anexosSubstitutoErro || p.notasErro;
    if (erro) return `<span class="cprev-anexo-erro" title="${this.esc(erro)}">Sem anexo</span>`;
    return `<span class="cprev-anexo-vazio">—</span>`;
  },

  async baixarAnexoTitulo(billId, attachmentId, name) {
    let fileName = name ? String(name) : ("titulo-" + billId + ".pdf");
    const remember = (n) => {
      if (!n || String(n.billId) !== String(billId)) return;
      (n.attachments || []).forEach((a) => {
        if (String(a.id) === String(attachmentId) && a.name) fileName = a.name;
      });
    };
    Object.keys(this.state.notasByPedido || {}).forEach((pedido) => {
      const notas = (this.state.notasByPedido[pedido] && this.state.notasByPedido[pedido].notas) || [];
      notas.forEach(remember);
    });
    (this.state.parcelas || []).forEach((p) => remember(p && p.anexoSubstituto));
    Object.keys(this.state.parcelasCache || {}).forEach((key) => {
      (this.state.parcelasCache[key] || []).forEach((p) => remember(p && p.anexoSubstituto));
    });
    const base = (window.SIENGE_CONFIG && window.SIENGE_CONFIG.baseUrl) || "/api/sienge-proxy";
    const path = "/bills/" + encodeURIComponent(billId) + "/attachments/" + encodeURIComponent(attachmentId);
    const headers = {};
    if (typeof getBasicAuthHeader === "function") headers.Authorization = getBasicAuthHeader();
    try {
      const res = await fetch(base + path, { headers });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const type = String(res.headers.get("content-type") || blob.type || "");
      if (/json|text\/html/i.test(type)) throw new Error("resposta");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      alert("Não foi possível baixar o PDF deste título.");
    }
  },

  applyNotasDoPedido(titulo, pedido) {
    const pack = this.state.notasByPedido[String(pedido)] || { notas: [], error: "" };
    const stamp = (p) => {
      if (this.samePedido(p, pedido)) {
        return Object.assign({}, p, { notasLoading: false, notas: [], notasErro: "" });
      }
      const notas = this.notasDaParcela(p, pedido, pack.notas || []);
      if (!notas.length) {
        return Object.assign({}, p, {
          notasLoading: false,
          notasErro: this.parcelaRecebeNota(p, pedido) ? (pack.error || "") : ""
        });
      }
      return Object.assign({}, p, {
        notasLoading: false,
        notas,
        notasErro: "",
        virouNota: true
      });
    };
    const id = String(titulo || "");
    if (this.state.openTitulo === id) this.state.parcelas = (this.state.parcelas || []).map(stamp);
    if (this.state.parcelasCache[id]) this.state.parcelasCache[id] = this.state.parcelasCache[id].map(stamp);
  },

  docNumButton(r) {
    const doc = r && r.documento ? String(r.documento) : "";
    if (!doc) return this.esc("—");
    if (this.docCode(r.docId) === "PCT") {
      return `<button type="button" class="cprev-ppc-btn" onclick="event.stopPropagation(); ComprasPrevisoesApp.abrirPct('${this.esc(r.titulo)}')">${this.esc(doc)}</button>`;
    }
    const pedido = this.pedidoKey(doc);
    if (!pedido) return this.esc(doc);
    return `<button type="button" class="cprev-ppc-btn" onclick="event.stopPropagation(); ComprasPrevisoesApp.abrirPpc('${this.esc(r.titulo)}','${pedido}')">${this.esc(doc)}</button>`;
  },

  isLinhaPct(p, contract) {
    if (!p) return false;
    if (this.docCode(p.docId) === "PCT") return true;
    return !!(contract && String(p.documento || "").trim() === String(contract).trim() && this.pedidoKey(p.documento));
  },

  applyStoredNotas(titulo) {
    Object.keys(this.state.notasByPedido || {}).forEach((key) => {
      if (String(key).indexOf("ct:") === 0) this.applyNotasDoContrato(titulo, key);
      else this.applyNotasDoPedido(titulo, key);
    });
  },

  applyNotasDoContrato(titulo, cacheKey) {
    const pack = this.state.notasByPedido[cacheKey] || { notas: [], contract: "" };
    const notas = pack.notas || [];
    const used = new Set();
    const stamp = (p) => {
      if (this.isLinhaPct(p, pack.contract) || !p.pago || p.substituido) {
        return Object.assign({}, p, { notasLoading: false, notas: [], notasErro: "" });
      }
      const amount = Number(p.valor);
      let best = -1;
      let bestDist = Infinity;
      notas.forEach((n, idx) => {
        if (used.has(idx) || Math.abs(Number(n.amount) - amount) >= 0.02) return;
        const dist = this.daySpan(p.vencimento, n.dueDate);
        const score = dist == null ? 9999 : Math.abs(dist);
        if (score < bestDist) {
          bestDist = score;
          best = idx;
        }
      });
      if (best < 0) {
        return Object.assign({}, p, {
          notasLoading: false,
          notasErro: pack.error || ""
        });
      }
      used.add(best);
      const nota = notas[best];
      return Object.assign({}, p, {
        notasLoading: false,
        notas: [nota],
        notasErro: "",
        virouNota: this.isNotaDoc(nota.docCode, nota.label, null)
      });
    };
    const id = String(titulo || "");
    if (this.state.openTitulo === id) this.state.parcelas = (this.state.parcelas || []).map(stamp);
    if (this.state.parcelasCache[id]) this.state.parcelasCache[id] = this.state.parcelasCache[id].map(stamp);
  },

  async titulosDoContrato(creditorId, contract, start, end, selfId) {
    const found = [];
    let offset = 0;
    for (let page = 0; page < 8; page++) {
      const data = await window.siengeFetchWithRetry(
        "/bills?startDate=" + encodeURIComponent(start) +
        "&endDate=" + encodeURIComponent(end) +
        "&creditorId=" + encodeURIComponent(creditorId) +
        "&limit=200&offset=" + offset,
        1
      );
      const rows = (data && data.results) || [];
      rows.forEach((bill) => {
        if (!bill || String(bill.id) === String(selfId)) return;
        if (String(bill.contractNumber || "").trim() !== String(contract)) return;
        if (bill.measurementNumber == null || bill.measurementNumber === "") return;
        if (this.DOC_PREVISAO[this.docCode(bill.documentIdentificationId)]) return;
        found.push(bill);
      });
      const count = data && data.resultSetMetadata ? Number(data.resultSetMetadata.count) : 0;
      offset += rows.length;
      if (!rows.length || rows.length < 200 || (count && offset >= count)) break;
    }
    return found;
  },

  async buscarNotasContrato(titulo) {
    const titleId = String(titulo || this.state.openTitulo || "");
    const cacheKey = "ct:" + titleId;
    if (!titleId || typeof window.siengeFetchWithRetry !== "function") return;
    const cached = this.state.notasByPedido[cacheKey];
    if (cached && cached.done && !cached.error) {
      this.applyNotasDoContrato(titleId, cacheKey);
      this.paintParcelasModal();
      return;
    }
    if (this.state.notaLoadingPedido === cacheKey) return;
    this.state.notaLoadingPedido = cacheKey;
    const loading = (p) => (!this.isLinhaPct(p, "") && p.pago && !p.substituido)
      ? Object.assign({}, p, { notasLoading: true, notasErro: "" })
      : p;
    if (this.state.openTitulo === titleId) this.state.parcelas = (this.state.parcelas || []).map(loading);
    this.paintParcelasModal();
    let notas = [];
    let error = "";
    let contract = "";
    try {
      const bill = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(titleId), 1);
      contract = String(bill && bill.contractNumber || "").trim();
      const companyId = bill && (bill.companyId || bill.debtorId);
      const creditorId = bill && bill.creditorId;
      if (!contract || !companyId) throw new Error("sem contrato");
      const med = await window.siengeFetchWithRetry(
        "/supply-contracts/measurements/all?documentId=CT&contractNumber=" + encodeURIComponent(contract) +
        "&companyId=" + encodeURIComponent(companyId) + "&limit=200",
        1
      );
      const measurements = (med && med.results) || [];
      const byNumber = {};
      measurements.forEach((m) => { if (m && m.measurementNumber != null) byNumber[String(m.measurementNumber)] = m; });
      const dates = measurements.map((m) => String(m.measurementDate || "").slice(0, 10)).filter(Boolean).sort();
      const start = dates[0] || String(bill.issueDate || "").slice(0, 10) || this.isoToday();
      const linked = creditorId
        ? await this.titulosDoContrato(creditorId, contract, start, this.isoToday(), titleId)
        : [];
      for (const item of linked) {
        const docCode = this.docCode(item.documentIdentificationId) || "DOC";
        const number = String(item.documentNumber || "").trim();
        const billId = item.id != null ? String(item.id) : "";
        const measurement = byNumber[String(item.measurementNumber)] || null;
        let attachments = [];
        if (billId) {
          try { attachments = await this.anexosDoTitulo(billId); } catch (e) { attachments = []; }
        }
        notas.push({
          number: number || billId,
          series: "",
          docCode,
          label: (docCode + " " + (number || billId)).trim(),
          billId,
          attachments,
          issueDate: item.issueDate ? String(item.issueDate).slice(0, 10) : "",
          dueDate: measurement && measurement.dueDate ? String(measurement.dueDate).slice(0, 10) : "",
          amount: Number(item.totalInvoiceAmount) || Number(measurement && measurement.netValue) || 0,
          measurementNumber: item.measurementNumber
        });
      }
    } catch (e) {
      const msg = String((e && e.message) || e || "");
      error = /403/.test(msg)
        ? "Sem permissão para consultar as medições deste contrato no Sienge."
        : (/sem contrato/.test(msg)
          ? "Este PCT não tem número de contrato no Sienge."
          : "Não foi possível consultar as medições deste PCT.");
    }
    this.state.notasByPedido[cacheKey] = { done: true, notas, error, contract };
    if (!this.state.notaByContrato) this.state.notaByContrato = {};
    this.state.notaByContrato[titleId] = notas.some((n) => this.isNotaDoc(n.docCode, n.label, null));
    if (this.state.notaLoadingPedido === cacheKey) this.state.notaLoadingPedido = "";
    this.applyNotasDoContrato(titleId, cacheKey);
    if (error && this.state.openTitulo === titleId) {
      this.state.parcelas = (this.state.parcelas || []).map((p) => (
        !this.isLinhaPct(p, contract) && p.pago && !p.substituido
          ? Object.assign({}, p, { notasLoading: false, notasErro: error })
          : p
      ));
    }
    this.paintParcelasModal();
    if (this.state.consulted && !this.state.loading) this.renderList();
  },

  situacaoCellHtml(p) {
    if (p.baixasLoading) return `<span class="cprev-anexo-vazio">Buscando baixa…</span>`;
    if (p.substituido) {
      const quando = p.dataPagamento ? " · " + this.fmtDate(p.dataPagamento) : "";
      const tit = p.tituloSubstituto ? " · tít. " + this.esc(p.tituloSubstituto) : "";
      const title = "Baixada por substituição" + (p.tituloSubstituto ? ". Virou o título " + p.tituloSubstituto : "");
      return `<span class="cprev-tag cprev-tag-subst" title="${this.esc(title)}">Substituída${tit}${quando}</span>`;
    }
    if (p.cancelado) {
      const quando = p.dataPagamento ? " · " + this.fmtDate(p.dataPagamento) : "";
      const title = p.baixaMotivo || "Baixada por cancelamento";
      return `<span class="cprev-tag cprev-tag-cancel" title="${this.esc(title)}">Cancelada${quando}</span>`;
    }
    if (p.pago) {
      return `<span class="cprev-tag cprev-tag-pago">Paga${p.dataPagamento ? " · " + this.esc(this.fmtDate(p.dataPagamento)) : ""}</span>`;
    }
    return `<span class="cprev-tag cprev-tag-aberto">Em aberto</span>`;
  },

  tituloEhPrevisaoRestrita(titulo) {
    const id = String(titulo || "");
    const rows = (this.state.parcelas || []).concat((this.state.allRows || []).filter((r) => String(r.titulo) === id));
    return rows.some((row) => this.isDocSubstituivel(row && row.docId, row && row.docNome));
  },

  monthBounds(iso) {
    const s = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const last = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0).getDate();
    return { start: s.slice(0, 7) + "-01", end: s.slice(0, 7) + "-" + String(last).padStart(2, "0") };
  },

  async billsNoPeriodo(start, end, bill) {
    const rows = [];
    let offset = 0;
    for (let page = 0; page < 5; page++) {
      let path = "/bills?startDate=" + encodeURIComponent(start)
        + "&endDate=" + encodeURIComponent(end)
        + "&creditorId=" + encodeURIComponent(bill.creditorId)
        + "&limit=200&offset=" + offset;
      if (bill.debtorId != null && bill.debtorId !== "") path += "&debtorId=" + encodeURIComponent(bill.debtorId);
      const data = await window.siengeFetchWithRetry(path, 1);
      const chunk = (data && data.results) || [];
      rows.push.apply(rows, chunk);
      const count = data && data.resultSetMetadata && Number(data.resultSetMetadata.count);
      offset += chunk.length;
      if (!chunk.length || chunk.length < 200 || (Number.isFinite(count) && offset >= count)) break;
    }
    return rows;
  },

  candidatoSubstituto(bill, item) {
    if (!item || String(item.id) === String(bill.id)) return false;
    if (this.isDocSubstituivel(item.documentIdentificationId, item.documentNumber)) return false;
    if (bill.debtorId != null && item.debtorId != null && Number(item.debtorId) !== Number(bill.debtorId)) return false;
    if (bill.creditorId != null && item.creditorId != null && Number(item.creditorId) !== Number(bill.creditorId)) return false;
    return true;
  },

  mesmoDocumentoSubstituto(bill, item) {
    const wanted = this.fold(bill && bill.documentNumber).replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w.length >= 3);
    if (!wanted.length || !item) return false;
    const id = this.fold(item.documentIdentificationId).replace(/[^A-Z0-9]/g, "");
    const num = this.fold(item.documentNumber);
    return wanted.some((w) => id === w || num.indexOf(w) >= 0);
  },

  escolherSubstituto(rows, amount) {
    if (!rows.length) return "";
    const ranked = rows.slice().sort((a, b) =>
      Math.abs(Number(a.totalInvoiceAmount) - Number(amount)) - Math.abs(Number(b.totalInvoiceAmount) - Number(amount))
    );
    return String(ranked[0].id);
  },

  async tituloSubstitutoDaBaixa(bill, amount, paymentDate) {
    const start = String(bill && bill.issueDate || "").slice(0, 10);
    const end = String(paymentDate || "").slice(0, 10);
    if (!start || !end || !bill || !bill.creditorId || typeof window.siengeFetchWithRetry !== "function") return "";
    const rows = (await this.billsNoPeriodo(start, end, bill)).filter((item) => this.candidatoSubstituto(bill, item));
    const exact = rows.filter((item) => Math.abs(Number(item.totalInvoiceAmount) - Number(amount)) < 0.02);
    if (exact.length === 1) return String(exact[0].id);
    const sameDay = rows.filter((item) => String(item.issueDate || "").slice(0, 10) === end);
    const byDoc = sameDay.filter((item) => this.mesmoDocumentoSubstituto(bill, item));
    if (byDoc.length) return this.escolherSubstituto(byDoc, amount);
    if (sameDay.length) return this.escolherSubstituto(sameDay, amount);
    return "";
  },

  aplicarBaixas(titulo, map) {
    const id = String(titulo || "");
    const stamp = (p) => {
      const baixa = map && map[String(p.parcela)];
      if (!baixa) return Object.assign({}, p, { baixasLoading: false });
      const op = this.fold(baixa.op);
      const substituido = /SUBSTITU/.test(op);
      const cancelado = /CANCEL/.test(op);
      return Object.assign({}, p, {
        baixasLoading: false,
        tipoBaixa: baixa.op || "",
        dataPagamento: baixa.date || p.dataPagamento || "",
        baixaMotivo: baixa.auth || "",
        substituido,
        cancelado,
        tituloSubstituto: baixa.titulo || "",
        pago: substituido || cancelado ? false : p.pago,
        docId: p.docId || baixa.docId || "",
        documento: p.documento || baixa.documento || ""
      });
    };
    if (this.state.openTitulo === id) this.state.parcelas = (this.state.parcelas || []).map(stamp);
    if (this.state.parcelasCache[id]) this.state.parcelasCache[id] = this.state.parcelasCache[id].map(stamp);
  },

  async carregarBaixasPrevisao(titulo) {
    const id = String(titulo || "");
    if (!id || this.state.openTitulo !== id || !this.tituloEhPrevisaoRestrita(id)) return;
    if (typeof window.siengeFetchWithRetry !== "function") return;
    const cached = (this.state.baixasByTitulo || {})[id];
    if (cached && cached.done) {
      this.aplicarBaixas(id, cached.map);
      await this.carregarAnexosSubstitutos(id);
      this.paintParcelasModal();
      return;
    }
    const loading = (p) => (p.pago ? Object.assign({}, p, { baixasLoading: true }) : p);
    if (this.state.openTitulo === id) this.state.parcelas = (this.state.parcelas || []).map(loading);
    this.paintParcelasModal();
    const map = {};
    try {
      const bill = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(id), 1);
      const companyId = bill && (bill.debtorId || bill.companyId);
      const docId = this.docCode(bill && bill.documentIdentificationId);
      const documento = String(bill && bill.documentNumber || "").trim();
      const months = [];
      (this.state.parcelas || []).forEach((p) => {
        if (!p.pago) return;
        const bounds = this.monthBounds(p.vencimento);
        if (!bounds) return;
        const key = bounds.start;
        if (!months.some((m) => m.start === key)) months.push(bounds);
      });
      for (const bounds of months) {
        if (this.state.openTitulo !== id) return;
        let rows = [];
        try { rows = await this.outcomeBills(bounds.start, bounds.end, companyId); } catch (e) { rows = []; }
        (rows || []).forEach((row) => {
          if (!row || String(row.billId) !== id) return;
          const pay = (row.payments || [])[0];
          if (!pay) return;
          const parcela = String(row.installmentId != null ? row.installmentId : "");
          if (!parcela || map[parcela]) return;
          map[parcela] = {
            op: pay.operationTypeName || "",
            date: pay.paymentDate ? String(pay.paymentDate).slice(0, 10) : "",
            amount: pay.netAmount != null ? pay.netAmount : pay.grossAmount,
            auth: String(pay.paymentAuthentication || "").trim(),
            docId,
            documento
          };
        });
      }
      for (const parcela of Object.keys(map)) {
        const baixa = map[parcela];
        if (!/SUBSTITU/.test(this.fold(baixa.op))) continue;
        try { baixa.titulo = await this.tituloSubstitutoDaBaixa(bill, baixa.amount, baixa.date); } catch (e) { baixa.titulo = ""; }
      }
    } catch (e) {}
    if (!this.state.baixasByTitulo) this.state.baixasByTitulo = {};
    this.state.baixasByTitulo[id] = { done: true, map };
    this.aplicarBaixas(id, map);
    await this.carregarAnexosSubstitutos(id);
    this.paintParcelasModal();
  },

  async carregarAnexosSubstitutos(titulo) {
    const id = String(titulo || "");
    if (!id || this.state.openTitulo !== id) return;
    const ids = [];
    (this.state.parcelas || []).forEach((p) => {
      const billId = p && p.substituido ? String(p.tituloSubstituto || "") : "";
      if (billId && ids.indexOf(billId) < 0) ids.push(billId);
    });
    if (!ids.length || typeof window.siengeFetchWithRetry !== "function") return;
    if (!this.state.anexosByTitulo) this.state.anexosByTitulo = {};
    const stamp = (p) => {
      const billId = p && p.substituido ? String(p.tituloSubstituto || "") : "";
      if (!billId) return p;
      const cached = this.state.anexosByTitulo[billId];
      if (cached && cached.done) {
        return Object.assign({}, p, {
          anexosSubstitutoLoading: false,
          anexoSubstituto: cached.pack,
          anexosSubstitutoErro: cached.error || ""
        });
      }
      return Object.assign({}, p, { anexosSubstitutoLoading: true, anexosSubstitutoErro: "" });
    };
    this.state.parcelas = (this.state.parcelas || []).map(stamp);
    if (this.state.parcelasCache[id]) this.state.parcelasCache[id] = this.state.parcelasCache[id].map(stamp);
    this.paintParcelasModal();
    for (const billId of ids) {
      if (this.state.openTitulo !== id) return;
      const cached = this.state.anexosByTitulo[billId];
      if (cached && cached.done) continue;
      let attachments = [];
      let error = "";
      try {
        attachments = await this.anexosDoTitulo(billId);
      } catch (e) {
        error = "Não foi possível consultar os anexos do título " + billId + ".";
      }
      this.state.anexosByTitulo[billId] = {
        done: true,
        error,
        pack: { billId, attachments }
      };
    }
    if (this.state.openTitulo !== id) return;
    this.state.parcelas = (this.state.parcelas || []).map(stamp);
    if (this.state.parcelasCache[id]) this.state.parcelasCache[id] = this.state.parcelasCache[id].map(stamp);
  },

  async carregarDocumentosDoTitulo(titulo) {
    const id = String(titulo || "");
    if (!id || this.state.openTitulo !== id) return;
    const fontes = (this.state.parcelas || []).concat(
      (this.state.allRows || []).filter((r) => String(r.titulo) === id)
    );
    const pedidos = [];
    let hasPct = false;
    fontes.forEach((row) => {
      if (this.docCode(row && row.docId) === "PCT") {
        hasPct = true;
        return;
      }
      if (this.docCode(row && row.docId) !== "PPC") return;
      const key = this.pedidoKey(row && row.documento);
      if (key && pedidos.indexOf(key) < 0) pedidos.push(key);
    });
    if (hasPct) await this.buscarNotasContrato(id);
    for (const pedido of pedidos) {
      if (this.state.openTitulo !== id) return;
      await this.buscarNotasPedido(pedido, id);
    }
  },

  async abrirPct(titulo) {
    await this.openParcelas(titulo);
    await this.buscarNotasContrato(titulo);
  },

  async buscarNotasPedido(pedido, titulo) {
    const id = this.pedidoKey(pedido) || String(pedido || "");
    const titleId = String(titulo || this.state.openTitulo || "");
    if (!id || typeof window.siengeFetchWithRetry !== "function") return;
    const cached = this.state.notasByPedido[id];
    if (cached && cached.done && !cached.error) {
      this.applyNotasDoPedido(titleId, id);
      this.paintParcelasModal();
      return;
    }
    if (this.state.notaLoadingPedido === id) return;
    this.state.notaLoadingPedido = id;
    const loading = (p) => this.parcelaRecebeNota(p, id)
      ? Object.assign({}, p, { notasLoading: true, notasErro: "" })
      : p;
    if (this.state.openTitulo === titleId) this.state.parcelas = (this.state.parcelas || []).map(loading);
    this.paintParcelasModal();
    let notas = [];
    let error = "";
    let attended = false;
    try {
      const data = await window.siengeFetchWithRetry(
        "/purchase-invoices/deliveries-attended?purchaseOrderId=" + encodeURIComponent(id) + "&limit=200",
        1
      );
      const rows = (data && data.results) || [];
      attended = rows.length > 0;
      notas = await this.notasFromInvoiceSequentials(rows);
      if (attended && !notas.length) error = "O pedido foi atendido, mas a nota não veio em GET /purchase-invoices.";
    } catch (e) {
      const msg = String((e && e.message) || e || "");
      error = /403/.test(msg)
        ? "Sem permissão para consultar notas no Sienge."
        : "Não foi possível consultar as notas deste PPC.";
    }
    this.state.notasByPedido[id] = { done: true, notas, error };
    this.state.notaByPedido[id] = notas.length > 0 || attended;
    if (this.state.notaLoadingPedido === id) this.state.notaLoadingPedido = "";
    this.applyNotasDoPedido(titleId, id);
    this.paintParcelasModal();
    if (this.state.consulted && !this.state.loading) this.renderList();
  },

  async abrirPpc(titulo, pedido) {
    await this.openParcelas(titulo);
    await this.buscarNotasPedido(pedido, titulo);
  },

  refreshNotaView() {
    if (!this.state.consulted || this.state.loading) return;
    this.applyFilters();
    this.renderList();
    const titulo = this.state.openTitulo;
    if (!titulo) return;
    const flag = this.titleHasNota(titulo);
    const mark = (p) => Object.assign({}, p, {
      virouNota: !!(flag || p.virouNota || this.isNotaDoc(p.docId, p.docNome, null))
    });
    this.state.parcelas = (this.state.parcelas || []).map(mark);
    if (this.state.parcelasCache[titulo]) this.state.parcelasCache[titulo] = this.state.parcelasCache[titulo].map(mark);
    this.paintParcelasModal();
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
                const substituido = this.isSubstituicao(bill, pay, bm, docId, bill.documentIdentificationName);
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
                  dataPagamento: substituido ? "" : this.paymentDateOf(bill, pay, bm),
                  pago: this.isPago(bill, pay, bm, docId, bill.documentIdentificationName),
                  substituido,
                  tituloSubstituto: substituido ? this.tituloSubstituto(bill, pay, bm) : "",
                  saldo: this.billBalance(bill),
                  situacao: this.billSituation(bill, pay),
                  operacao,
                  conta,
                  departamento: (dep && dep.name) || this.ccDeptHint((cat && cat.costCenterName) || "") || "",
                  departamentoId: dep && (dep.id != null ? dep.id : (dep.departmentId != null ? dep.departmentId : dep.departamentId)) != null
                    ? String(dep.id != null ? dep.id : (dep.departmentId != null ? dep.departmentId : dep.departamentId))
                    : "",
                  idObra: bld && bld.buildingId != null ? String(bld.buildingId) : "",
                  valorAjustado: valor * ((Number.isFinite(rateio) ? rateio : 100) / 100)
                });
              });
            });
          });
        });
      });
    });
    const map = new Map();
    rows.forEach((r) => {
      const k = [r.titulo, r.emissao, r.parcela, r.departamento].join("|");
      const prev = map.get(k);
      if (!prev) {
        map.set(k, r);
        return;
      }
      map.set(k, this.preferParcela(prev, r));
    });
    return [...map.values()];
  },

  preferParcela(a, b) {
    const next = Object.assign({}, a);
    if (b.substituido) {
      next.substituido = true;
      next.pago = false;
      next.dataPagamento = "";
      if (b.tituloSubstituto) next.tituloSubstituto = b.tituloSubstituto;
      if (b.tipoBaixa) next.tipoBaixa = b.tipoBaixa;
    } else if (!next.substituido && b.pago) {
      next.pago = true;
      if (b.dataPagamento && !next.dataPagamento) next.dataPagamento = b.dataPagamento;
    }
    if (b.situacao && !next.situacao) next.situacao = b.situacao;
    if (b.virouNota) next.virouNota = true;
    if (b.tituloSubstituto && !next.tituloSubstituto) next.tituloSubstituto = b.tituloSubstituto;
    if (this.isSituacaoAberta({ situation: b.situacao }, null) && !next.substituido) next.pago = false;
    return next;
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

  sessionUser() {
    const cu = (window.AppState && AppState.currentUser) || null;
    if (!cu) return null;
    let list = [];
    try { list = JSON.parse(localStorage.getItem("crm_users") || "[]"); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    const email = String(cu.email || "").toLowerCase().trim();
    const found = email ? list.find((u) => String(u.email || "").toLowerCase().trim() === email) : null;
    return found || cu;
  },

  isPagadoriaProfile(name) {
    return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().includes("PAGADORIA");
  },

  /** null = pagadoria ou administrador, vê tudo. Lista vazia = sem departamento, não vê nada. */
  departmentWindows() {
    const u = this.sessionUser();
    if (!u) return [];
    const profile = u.profile_name || u.profile || u.role || "";
    if (this.isPagadoriaProfile(profile)) return null;
    if (typeof window.isCrmAdministrator === "function" && window.isCrmAdministrator(u)) return null;
    const folded = String(profile).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    if (folded === "ADMINISTRADOR") return null;
    const hist = Array.isArray(u.department_history) ? u.department_history : [];
    return hist.map((h) => ({
      id: String(h && h.id != null ? h.id : ""),
      name: this.fold(h && h.name),
      from: this.isoDate(h && h.from),
      to: this.isoDate(h && h.to),
      keep: !!(h && h.keep)
    })).filter((h) => (h.id || h.name) && h.from);
  },

  /** null = vê todos. Lista = departamentos que a pessoa pode consultar hoje. */
  accessibleDepartments() {
    const windows = this.departmentWindows();
    if (!windows) return null;
    const today = this.isoToday();
    const u = this.sessionUser();
    const hist = Array.isArray(u && u.department_history) ? u.department_history : [];
    const seen = new Set();
    const items = [];
    windows.forEach((w) => {
      if (w.from && w.from > today) return;
      const current = !w.to || w.to >= today;
      if (!current && !w.keep) return;
      const raw = hist.find((h) => String(h && h.id != null ? h.id : "") === w.id && this.isoDate(h && h.from) === w.from) || {};
      const id = w.name || w.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      const label = String((raw && raw.name) || w.name || w.id).toUpperCase();
      items.push({ id: id, name: label, label: label });
    });
    items.sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR"));
    return items;
  },

  departmentFilterLocked() {
    if (this.state.loading) return true;
    const access = this.accessibleDepartments();
    if (access) return access.length <= 1;
    return !this.state.consulted;
  },

  syncDepartmentSelection() {
    const access = this.accessibleDepartments();
    if (!access) return;
    const ids = access.map((a) => a.id);
    if (ids.length <= 1) {
      this.state.deptIds = ids.slice();
      this.state.openDept = false;
      return;
    }
    const allowed = new Set(ids);
    const cur = (this.state.deptIds || []).map(String).filter((id) => allowed.has(id));
    this.state.deptIds = cur.length ? cur : ids.slice();
  },

  rowMatchesDepartment(r) {
    const access = this.accessibleDepartments();
    if (access) {
      const sel = (this.state.deptIds || []).map(String);
      const allOn = !sel.length || access.every((a) => sel.indexOf(a.id) >= 0);
      if (allOn) return true;
      const windows = (this.departmentWindows() || []).filter((w) => sel.indexOf(w.name || w.id) >= 0 || sel.indexOf(w.id) >= 0);
      return this.rowInDepartmentWindows(r, windows);
    }
    const dept = new Set((this.state.deptIds || []).map(String));
    if (!dept.size) return true;
    const depFold = this.fold(r.departamento);
    const ccFold = this.fold(r.ccNome);
    return [...dept].some((id) => depFold === id || (id && ccFold.indexOf(id) >= 0));
  },

  /** Quem está no departamento hoje vê o histórico. Depois da saída, só continua se estiver marcado. */
  rowInDepartmentWindows(row, windows) {
    if (!windows) return true;
    const today = this.isoToday();
    const name = this.fold(row && row.departamento);
    const id = String(row && row.departamentoId != null ? row.departamentoId : "");
    return windows.some((w) => {
      const same = (id && w.id && id === w.id) || (name && w.name && name === w.name);
      if (!same) return false;
      if (w.from && w.from > today) return false;
      const current = !w.to || w.to >= today;
      if (current) return true;
      return !!w.keep;
    });
  },

  scopedRows() {
    const windows = this.departmentWindows();
    const rows = this.state.allRows || [];
    if (!windows) return rows;
    return rows.filter((r) => this.rowInDepartmentWindows(r, windows));
  },

  departmentScopeNote() {
    const windows = this.departmentWindows();
    if (!windows) return "";
    if (!windows.length) return "Seu usuário não tem departamento cadastrado, então não vê previsões.";
    const today = this.isoToday();
    const current = [];
    const kept = [];
    windows.forEach((w) => {
      const label = w.name || w.id;
      if (!w.to || w.to >= today) current.push(label);
      else if (w.keep) kept.push(label);
    });
    const bits = [];
    if (current.length) bits.push(current.join(", ") + " (incluindo as anteriores)");
    if (kept.length) bits.push("continua vendo " + kept.join(", ") + " depois da mudança");
    if (!bits.length) return "Seu departamento atual não libera previsões nesta consulta.";
    return "Você vê previsões de " + bits.join("; ") + ".";
  },

  empItems() {
    const fromRows = this.uniqueItems(this.scopedRows(), (r) => r.companyId, (r) => {
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
    return this.uniqueItems(this.scopedRows(), (r) => this.fold(r.credor), (r) => r.credor.toUpperCase());
  },

  deptItems() {
    const access = this.accessibleDepartments();
    if (access) return access;
    return this.uniqueItems(this.scopedRows(), (r) => this.fold(r.departamento), (r) => r.departamento.toUpperCase());
  },

  ccItems() {
    const fromRows = this.uniqueItems(this.scopedRows(), (r) => r.ccId, (r) => {
      const name = String(r.ccNome || "").toUpperCase();
      return r.ccId ? r.ccId + " - " + name : name;
    });
    if (fromRows.length) return fromRows;
    const list = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    return list.map((c) => {
      const id = String(c.id || c.code || "");
      const name = String(c.name || c.nome || "").toUpperCase();
      return { id, name, label: id ? id + " - " + name : name };
    }).filter((x) => x.id).sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR"));
  },

  rowGroup(r) {
    if (r.substituido) return this.GROUPS.SUBSTITUIDOS;
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
      substituidos: { label: "Substituídos (PRV / PRVR / PRVC)", bg: "#e0e7ff", color: "#3730a3", order: 4 },
      pagos: { label: "Pagos", bg: "#f1f5f9", color: "#475569", order: 5 }
    };
    return map[group] || map.avencer;
  },

  applyFilters() {
    const emp = new Set((this.state.companyIds || []).map(String));
    const cred = new Set((this.state.creditorIds || []).map(String));
    const cc = new Set((this.state.ccIds || []).map(String));
    const qTitulo = this.fold(this.state.qTitulo).replace(/\s+/g, "");
    const qCredor = this.fold(this.state.qCredor);
    const status = this.state.status;
    const start = this.state.startDate || "";
    const end = this.state.endDate || "";
    this.state.shown = this.scopedRows().filter((r) => {
      if (emp.size && !emp.has(String(r.companyId))) return false;
      if (cc.size && !cc.has(String(r.ccId))) return false;
      if (cred.size && !cred.has(this.fold(r.credor))) return false;
      if (!this.rowMatchesDepartment(r)) return false;
      if (start && r.vencimento && r.vencimento < start) return false;
      if (end && r.vencimento && r.vencimento > end) return false;
      if (status === "aberto" && (r.pago || r.substituido)) return false;
      if (status === "pago" && !r.pago) return false;
      if (status === "substituido" && !r.substituido) return false;
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
    let substituido = 0;
    rows.forEach((r) => {
      const v = Number(r.valorAjustado) || 0;
      total += v;
      if (r.grupo === this.GROUPS.VENCIDOS) vencido += v;
      else if (r.grupo === this.GROUPS.PRAZO) prazo += v;
      else if (r.grupo === this.GROUPS.AVENCER) aVencer += v;
      else if (r.grupo === this.GROUPS.SUBSTITUIDOS) substituido += v;
    });
    return { qtd: rows.length, total, vencido, prazo, aVencer, substituido };
  },

  bindFilters() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    const bind = (id, key, openKey, qKey, itemsFn, nouns) => {
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          if (self.state.loading) return;
          if (key === "deptIds" && self.departmentFilterLocked()) return;
          if (!self.state.consulted && key !== "companyIds" && key !== "deptIds") return;
          self.state[openKey] = !self.state[openKey];
          if (openKey === "openEmp") { self.state.openCred = false; self.state.openDept = false; self.state.openCc = false; }
          if (openKey === "openCred") { self.state.openEmp = false; self.state.openDept = false; self.state.openCc = false; }
          if (openKey === "openDept") { self.state.openEmp = false; self.state.openCred = false; self.state.openCc = false; }
          if (openKey === "openCc") { self.state.openEmp = false; self.state.openCred = false; self.state.openDept = false; }
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
          if (self.state.loading) return;
          if (key === "deptIds" && self.departmentFilterLocked()) return;
          if (!self.state.consulted && key !== "companyIds" && key !== "deptIds") return;
          const sid = String(itemId);
          const cur = self.state[key].slice();
          self.state[key] = on ? (cur.includes(sid) ? cur : cur.concat(sid)) : cur.filter((x) => x !== sid);
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        },
        selectAll() {
          if (self.state.loading) return;
          if (key === "deptIds" && self.departmentFilterLocked()) return;
          if (!self.state.consulted && key !== "companyIds" && key !== "deptIds") return;
          self.state[key] = itemsFn().map((x) => String(x.id));
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        },
        selectNone() {
          if (self.state.loading) return;
          if (key === "deptIds" && self.departmentFilterLocked()) return;
          if (!self.state.consulted && key !== "companyIds" && key !== "deptIds") return;
          if (key === "deptIds" && self.accessibleDepartments()) {
            self.state.deptIds = self.accessibleDepartments().map((a) => a.id);
          } else {
            self.state[key] = [];
          }
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        }
      });
    };
    bind("cprev-filter-emp", "companyIds", "openEmp", "qEmp", () => this.empItems(), { singular: "empresa", plural: "empresas" });
    bind("cprev-filter-cc", "ccIds", "openCc", "qCc", () => this.ccItems(), { singular: "empreendimento", plural: "empreendimentos" });
    bind("cprev-filter-cred", "creditorIds", "openCred", "qCred", () => this.credItems(), { singular: "credor", plural: "credores" });
    bind("cprev-filter-dept", "deptIds", "openDept", "qDept", () => this.deptItems(), { singular: "departamento", plural: "departamentos" });
  },

  deptFilterHtml() {
    const access = this.accessibleDepartments();
    if (access && access.length <= 1) {
      const label = access.length === 1 ? access[0].label : "Nenhum departamento";
      return `<div class="ml-emp-filter" id="cprev-filter-dept">
        <div class="ml-emp-filter-label">Departamento</div>
        <button type="button" class="ml-emp-filter-btn" disabled>
          <span>${this.esc(label)}</span>
        </button>
      </div>`;
    }
    const items = this.deptItems();
    if (!access && !items.length) {
      return `<div class="ml-emp-filter" id="cprev-filter-dept">
        <div class="ml-emp-filter-label">Departamento</div>
        <button type="button" class="ml-emp-filter-btn" disabled>
          <span>Todos</span>
        </button>
      </div>`;
    }
    return MlEmpresaFilter.html({
      id: "cprev-filter-dept",
      label: "Departamento",
      items: this.deptItems(),
      selectedIds: this.state.deptIds,
      open: !!this.state.openDept,
      query: this.state.qDept,
      emptyMeansAll: !access,
      nouns: { singular: "departamento", plural: "departamentos" }
    });
  },

  paintFilters() {
    if (!window.MlEmpresaFilter) return;
    this.syncDepartmentSelection();
    if (!this.state.consulted || this.state.loading) {
      this.state.openCc = false;
      this.state.openCred = false;
    }
    if (this.departmentFilterLocked()) this.state.openDept = false;
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
    set("cprev-cc-slot", MlEmpresaFilter.html({
      id: "cprev-filter-cc",
      label: "Empreendimento",
      items: this.ccItems(),
      selectedIds: this.state.ccIds,
      open: !!this.state.openCc,
      query: this.state.qCc,
      emptyMeansAll: true,
      nouns: { singular: "empreendimento", plural: "empreendimentos" }
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
    set("cprev-dept-slot", this.deptFilterHtml());
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

  isoShift(iso, days) {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  outcomeTooBig(err) {
    return Number(err && err.status) === 507 || /\b507\b/.test(String((err && err.message) || ""));
  },

  outcomeEndpoint(start, end, companyId) {
    let endpoint = "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
      + "&endDate=" + encodeURIComponent(end)
      + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
    if (companyId) endpoint += "&companyId=" + encodeURIComponent(companyId);
    return endpoint;
  },

  noteProgress(text) {
    const box = document.getElementById("cprev-results");
    if (box) box.innerHTML = '<div class="tvig-empty">' + this.esc(text) + "</div>";
  },

  async outcomeBills(start, end, companyId) {
    const endpoint = this.outcomeEndpoint(start, end, companyId);
    const once = typeof siengeFetch === "function" ? siengeFetch : window.siengeFetchWithRetry;
    if (typeof once !== "function") throw new Error("API Sienge indisponível.");
    let payload;
    try {
      payload = await once(endpoint);
    } catch (err) {
      if (this.outcomeTooBig(err) || typeof window.siengeFetchWithRetry !== "function") throw err;
      payload = await window.siengeFetchWithRetry(endpoint, 2);
    }
    return (payload && payload.data) || (Array.isArray(payload) ? payload : []);
  },

  async outcomeRange(start, end, companyId) {
    try {
      return await this.outcomeBills(start, end, companyId);
    } catch (err) {
      if (!this.outcomeTooBig(err)) throw err;
      if (start < end) {
        const s = new Date(start + "T12:00:00");
        const e = new Date(end + "T12:00:00");
        const midDate = new Date(s.getTime() + Math.floor((e - s) / 2));
        const mid = midDate.getFullYear() + "-" + String(midDate.getMonth() + 1).padStart(2, "0") + "-" + String(midDate.getDate()).padStart(2, "0");
        const next = this.isoShift(mid, 1);
        if (mid >= start && mid < end && next <= end) {
          const left = await this.outcomeRange(start, mid, companyId);
          const right = await this.outcomeRange(next, end, companyId);
          return left.concat(right);
        }
      }
      if (!companyId) {
        const companies = (this.state.companies || []).map((c) => String(c.id)).filter(Boolean);
        if (companies.length > 1) {
          const parts = [];
          for (let i = 0; i < companies.length; i++) {
            this.noteProgress("Buscando empresa " + (i + 1) + " de " + companies.length + "…");
            const rows = await this.outcomeRange(start, end, companies[i]);
            parts.push.apply(parts, rows);
          }
          return parts;
        }
      }
      throw err;
    }
  },

  async fetchOutcome(start, end) {
    const chunks = typeof siengeSplitDateRange === "function"
      ? siengeSplitDateRange(start, end)
      : [{ start: start, end: end }];
    const ids = (this.state.companyIds || []).map(String).filter(Boolean);
    const targets = ids.length ? ids : [""];
    const data = [];
    let step = 0;
    const total = Math.max(1, chunks.length * targets.length);
    for (const chunk of chunks) {
      for (const companyId of targets) {
        step += 1;
        this.noteProgress("Buscando previsões no Sienge… " + step + " de " + total);
        const bills = await this.outcomeRange(chunk.start, chunk.end, companyId);
        data.push.apply(data, bills);
      }
    }
    return { data: data };
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
      const payload = await this.fetchOutcome(start, end);
      this.indexBills(payload);
      this.state.allRows = this.transform(payload);
      this.indexPedidos();
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
    this.state.ccIds = [];
    this.state.qTitulo = "";
    this.state.qCredor = "";
    this.state.status = "aberto";
    this.state.shown = [];
    this.state.allRows = [];
    this.state.billsByTitulo = {};
    this.state.pedidosByTitulo = {};
    this.state.notaByPedido = {};
    this.state.notaByContrato = {};
    this.state.baixasByTitulo = {};
    this.state.anexosByTitulo = {};
    this.state.notasByPedido = {};
    this.state.notaLoadingPedido = "";
    this.state.parcelasCache = {};
    this._notaGen = (this._notaGen || 0) + 1;
    this.state.consulted = false;
    this.state.error = "";
    this.closeParcelas();
    this.renderPage();
  },

  onField(field, val) {
    if (this.state.loading) return;
    if (!this.state.consulted && (field === "qTitulo" || field === "status" || field === "qCredor")) return;
    this.state[field] = val;
    if (!this.state.consulted && (field === "startDate" || field === "endDate")) return;
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
        <div class="ccom-kpi"><span>A vencer</span><strong>${this.esc(this.money(k.aVencer))}</strong></div>
        <div class="ccom-kpi"><span>Substituídos</span><strong>${this.esc(this.money(k.substituido))}</strong></div>`;
    }
    if (!rows.length) {
      const windows = this.departmentWindows();
      const noDept = Array.isArray(windows) && !windows.length;
      const limited = !!windows && (this.state.allRows || []).length && !this.scopedRows().length;
      box.innerHTML = noDept
        ? `<div class="tvig-empty">Seu usuário não tem departamento cadastrado.</div>`
        : (limited
          ? `<div class="tvig-empty">Nenhuma previsão dos seus departamentos neste período.</div>`
          : `<div class="tvig-empty">Nenhum título neste filtro.</div>`);
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
      const subst = r.substituido
        ? `<span class="cprev-tag cprev-tag-subst">Substituído${r.tituloSubstituto ? " · " + this.esc(r.tituloSubstituto) : ""}</span>`
        : "";
      const pago = r.pago && !r.substituido
        ? `<span class="cprev-tag cprev-tag-pago">Pago</span>`
        : "";
      const ccLabel = (r.ccId ? r.ccId + " - " : "") + (r.ccNome || "—");
      return header + `<tr class="cprev-row${late ? " cprev-late" : ""}${open ? " is-open" : ""}" data-titulo="${this.esc(r.titulo)}" data-idx="${idx}" onclick="ComprasPrevisoesApp.openParcelas('${this.esc(r.titulo)}')">
        <td class="cprev-col-id" title="${this.esc(r.companyId)}">${this.esc(r.companyId)}</td>
        <td class="cprev-col-cc" title="${this.esc(ccLabel)}">${this.esc(ccLabel)}</td>
        <td class="cprev-col-dept" title="${this.esc(r.departamento || "—")}">${this.esc(r.departamento || "—")}</td>
        <td class="cprev-col-cred" title="${this.esc(r.credor || "—")}">${this.esc(r.credor || "—")}</td>
        <td class="cprev-col-tit" title="${this.esc(r.titulo)}">${this.esc(r.titulo)}${nota}${subst}${pago}</td>
        <td class="cprev-col-parc" title="${this.esc(r.parcela || "—")}">${this.esc(r.parcela || "—")}</td>
        <td class="cprev-col-doc" title="${this.esc(r.docId || "—")}">${this.esc(r.docId || "—")}</td>
        <td class="cprev-col-ndoc" title="${this.esc(r.documento || "—")}">${this.docNumButton(r)}</td>
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
    const pays = Array.isArray(pay) ? pay : (pay ? [pay] : [null]);
    const substPay = pays.find((p) => this.isSubstituicao(inst, p, null, inst.documentIdentificationId, inst.documentIdentificationName)) || null;
    const firstPay = substPay || pays[0] || null;
    const docId = this.docCode(inst.documentIdentificationId || inst.documentId || (inst.document && inst.document.id));
    const docName = inst.documentIdentificationName || inst.documentName || (inst.document && inst.document.name) || "";
    const substituido = this.isSubstituicao(inst, firstPay, null, docId, docName);
    const pago = this.isPago(inst, firstPay, null, docId, docName);
    return {
      titulo: String(titulo),
      parcela: inst.installmentId != null ? String(inst.installmentId) : (inst.installmentNumber != null ? String(inst.installmentNumber) : ""),
      vencimento: this.isoDate(inst.dueDate || inst.date),
      valor: Number(inst.originalAmount != null ? inst.originalAmount : inst.amount) || 0,
      documento: String(inst.documentNumber || inst.number || ""),
      docId,
      docNome: this.firstWord(docName),
      pago,
      substituido,
      tituloSubstituto: substituido ? this.tituloSubstituto(inst, firstPay, null) : "",
      dataPagamento: substituido ? "" : this.paymentDateOf(inst, firstPay, null),
      saldo: this.billBalance(inst),
      situacao: this.billSituation(inst, firstPay),
      virouNota: this.isNotaDoc(docId, docName, inst) || this.titleHasNota(titulo)
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
      else map.set(key, this.preferParcela(prev, p));
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
        substituido: !!r.substituido,
        tituloSubstituto: r.tituloSubstituto || "",
        dataPagamento: r.dataPagamento || "",
        saldo: r.saldo,
        situacao: r.situacao,
        virouNota: !!r.virouNota || this.isNotaDoc(r.docId, r.docNome, null)
      };
      if (!prev) map.set(key, next);
      else map.set(key, this.preferParcela(prev, next));
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
    const pedidos = Object.keys((this.state.pedidosByTitulo || {})[id] || {});
    (this.state.parcelas || []).forEach((p) => {
      const key = this.pedidoKey(p.documento);
      if (key && pedidos.indexOf(key) < 0) pedidos.push(key);
    });
    if (!this.state.pedidosByTitulo[id]) this.state.pedidosByTitulo[id] = {};
    pedidos.forEach((pedido) => { this.state.pedidosByTitulo[id][pedido] = 1; });
    if (this.state.parcelasCache[id]) {
      this.state.parcelas = this.state.parcelasCache[id];
      this.state.parcelasLoading = false;
      this.applyStoredNotas(id);
      this.paintParcelasModal();
      await this.carregarDocumentosDoTitulo(id);
      await this.carregarBaixasPrevisao(id);
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
            const merged = this.preferParcela(prev, p);
            if (p.virouNota) merged.virouNota = true;
            if (p.docId && !merged.docId) merged.docId = p.docId;
            if (p.documento && !merged.documento) merged.documento = p.documento;
            if (this.isSituacaoAberta({ situation: p.situacao }, null) && !merged.substituido) {
              merged.pago = false;
            }
            map.set(key, merged);
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
    this.applyStoredNotas(id);
    this.paintParcelasModal();
    await this.carregarDocumentosDoTitulo(id);
    await this.carregarBaixasPrevisao(id);
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
      ? parcelas.map((p) => {
          const pedido = this.pedidoKey(p.documento);
          const isPct = this.docCode(p.docId) === "PCT";
          const docNum = (p.notas && p.notas.length && !pedido && !isPct)
            ? p.notas.map((n) => n.number).join(", ")
            : (pedido && !isPct ? "" : (p.documento || "—"));
          const docNumHtml = isPct
            ? `<button type="button" class="cprev-ppc-btn" onclick="event.stopPropagation(); ComprasPrevisoesApp.buscarNotasContrato('${this.esc(p.titulo || titulo)}')">${this.esc(p.documento || "PCT")}</button>`
            : (pedido
            ? `<button type="button" class="cprev-ppc-btn" onclick="event.stopPropagation(); ComprasPrevisoesApp.buscarNotasPedido('${pedido}','${this.esc(p.titulo || titulo)}')">${this.esc(p.documento)}</button>`
            : this.esc(docNum));
          return `<tr class="cprev-parcela-row">
          <td>${this.esc(p.parcela || "—")}</td>
          <td>${this.docCellHtml(p)}</td>
          <td>${docNumHtml}</td>
          <td>${this.esc(this.fmtDate(p.vencimento))}</td>
          <td style="text-align:right;white-space:nowrap;">${this.esc(this.money(p.valor))}</td>
          <td>${this.situacaoCellHtml(p)}</td>
          <td>${this.anexosCellHtml(p)}</td>
        </tr>`;
        }).join("")
      : `<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">Nenhuma parcela encontrada para este título.</td></tr>`;
    host.innerHTML = `
      <div class="cprev-modal-overlay" onclick="if(event.target===this) ComprasPrevisoesApp.closeParcelas()">
        <div class="cprev-modal" role="dialog" aria-modal="true">
          <div class="cprev-modal-head">
            <div>
              <h3>Parcelas do título ${this.esc(titulo)}</h3>
              <p>${this.esc((sample && sample.credor) || "—")}${sample && sample.companyId ? " · Empresa " + this.esc(sample.companyId) : ""}</p>
            </div>
            <div class="cprev-modal-actions">
              ${this.pmpHtml(parcelas)}
              <button type="button" class="btn btn-cancel" onclick="ComprasPrevisoesApp.closeParcelas()">Fechar</button>
            </div>
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
                  <th>Anexos</th>
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
      Situação: r.substituido ? "Substituído" : (r.pago ? "Pago" : "Em aberto"),
      "Título substituto": r.tituloSubstituto || "",
      "Virou nota": r.virouNota ? "Sim" : "Não"
    }));
    const ws = XLSX.utils.json_to_sheet(rowsData);
    const range = XLSX.utils.decode_range(ws["!ref"]);
    ws["!cols"] = [
      { wch: 32 }, { wch: 12 }, { wch: 36 }, { wch: 22 }, { wch: 40 },
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
      { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }
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
    const busy = !!s.loading;
    const refineLocked = !s.consulted || busy;
    this.syncDepartmentSelection();
    const deptLocked = this.departmentFilterLocked();
    const minDays = this.minDaysToday();
    const minDue = this.minLaunchDue();
    root.innerHTML = `
      <div class="cprev-page">
        <div class="search-filter-panel cprev-toolbar">
          <div class="ecau-grid cprev-ecau${busy ? " is-consulting" : ""}">
            <div id="cprev-emp-slot" class="ecau-slot ecau-cell-emp${busy ? " is-locked" : ""}"></div>
            <div id="cprev-cc-slot" class="ecau-slot ecau-cell-obra${refineLocked ? " is-locked" : ""}"></div>
            <div id="cprev-cred-slot" class="ecau-slot ecau-cell-cred${refineLocked ? " is-locked" : ""}"></div>
            <div class="form-group ecau-search ecau-cell-titulo${refineLocked ? " is-locked" : ""}">
              <label>Título</label>
              <input type="search" class="form-control" placeholder="Título ou nº do documento"
                value="${this.esc(s.qTitulo)}" ${refineLocked ? "disabled" : ""}
                oninput="ComprasPrevisoesApp.onField('qTitulo', this.value)" autocomplete="off">
            </div>
            <div class="form-group ecau-search ecau-cell-sit${refineLocked ? " is-locked" : ""}">
              <label>Situação</label>
              <select class="form-control" ${refineLocked ? "disabled" : ""} onchange="ComprasPrevisoesApp.onField('status', this.value)">
                <option value="aberto" ${s.status === "aberto" ? "selected" : ""}>Em aberto</option>
                <option value="pago" ${s.status === "pago" ? "selected" : ""}>Pagos</option>
                <option value="substituido" ${s.status === "substituido" ? "selected" : ""}>Substituídos</option>
                <option value="todos" ${s.status === "todos" ? "selected" : ""}>Todos</option>
              </select>
            </div>
            <div class="ecau-cell-dates${busy ? " is-locked" : ""}">
              <div class="form-group ecau-date">
                <label>Vencimento de</label>
                <input type="date" class="form-control" value="${this.esc(s.startDate)}" ${busy ? "disabled" : ""}
                  onchange="ComprasPrevisoesApp.onField('startDate', this.value)">
              </div>
              <div class="form-group ecau-date">
                <label>Vencimento até</label>
                <input type="date" class="form-control" value="${this.esc(s.endDate)}" ${busy ? "disabled" : ""}
                  onchange="ComprasPrevisoesApp.onField('endDate', this.value)">
              </div>
            </div>
            <div id="cprev-dept-slot" class="ecau-slot cprev-cell-dept${deptLocked ? " is-locked" : ""}"></div>
            <div class="ecau-actions">
              <div class="ecau-actions-main">
                <button type="button" class="btn btn-primary btn-sm" ${busy ? "disabled" : ""} onclick="ComprasPrevisoesApp.consultar()">
                  ${busy
                    ? '<span class="ecau-spin" aria-hidden="true"></span>'
                    : '<i data-lucide="search" style="width:14px;height:14px;"></i>'}
                  Consultar
                </button>
                <button type="button" class="btn btn-cancel btn-sm" ${busy ? "disabled" : ""} onclick="ComprasPrevisoesApp.limpar()">Limpar</button>
                <button type="button" class="btn btn-sm btn-excel" ${busy || !s.consulted ? "disabled" : ""} onclick="ComprasPrevisoesApp.exportExcel()" title="Exportar tabela atual para Excel">
                  <i data-lucide="download" style="width:14px;height:14px;"></i> Excel
                </button>
              </div>
            </div>
          </div>
          <p class="cprev-hint">Lançando a nota hoje, o vencimento precisa de no mínimo <strong>${minDays} dias</strong> (até ${this.esc(this.fmtDate(minDue))}). Títulos abaixo desse prazo ficam em <strong>Prazo insuficiente para lançar</strong>.</p>
          ${this.departmentScopeNote() ? `<p class="cprev-hint">${this.esc(this.departmentScopeNote())}</p>` : ""}
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
