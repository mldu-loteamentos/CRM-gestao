/**
 * Regras da caução (documento CAU) usadas pela tela Gestão de caução e pela
 * rotina diária api/caucao-batimento.js. Roda no navegador e no Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CaucaoCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const SKIP_OPS = { "Reaprop. Abatimento Adiantamento - entrada": 1, Recebimento: 1 };
  const SKIP_ACCOUNTS = { PAR: 1, "PAR-3": 1 };
  const GERIDAS_PADRAO = ["1", "2", "3", "4", "5", "6", "12", "13", "14", "17", "28", "32"];

  function fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }

  function isoDate(v) {
    const s = String(v == null ? "" : v).trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function addDaysIso(iso, days) {
    const s = isoDate(iso);
    if (!s) return "";
    const d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)) + Number(days || 0)));
    return d.toISOString().slice(0, 10);
  }

  function addMonthsIso(iso, months) {
    const s = isoDate(iso);
    const d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1 + Number(months || 0), 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const day = Math.min(Number(s.slice(8, 10)), last);
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  /** De 12 meses atrás (dia 1) até o fim do 18º mês à frente. */
  function defaultRange(todayIso) {
    const first = todayIso.slice(0, 8) + "01";
    const fim = addMonthsIso(first, 18);
    const y = Number(fim.slice(0, 4));
    const m = Number(fim.slice(5, 7));
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { startDate: addMonthsIso(first, -12), endDate: fim.slice(0, 8) + String(last).padStart(2, "0") };
  }

  function listOrNull(x) {
    if (x == null) return [null];
    if (Array.isArray(x)) return x.length ? x : [null];
    return [x];
  }

  function firstWord(s) {
    return String(s || "").trim().split(/\s+/)[0] || "";
  }

  function docCode(s) {
    return String(s == null ? "" : s).trim().toUpperCase();
  }

  function isCauDoc(docId, docName) {
    const id = docCode(docId);
    const token = docCode(firstWord(docId || docName));
    if (id === "CAU" || token === "CAU") return true;
    const nome = fold(docName);
    return nome.indexOf("CAUCAO") >= 0;
  }

  function paymentDateOf(bill, pay, bm) {
    return isoDate(bm && bm.bankMovementDate)
      || isoDate(pay && (pay.paymentDate || pay.date || pay.payOffDate || pay.bankMovementDate))
      || isoDate(bill && (bill.paymentDate || bill.payOffDate || bill.payoffDate || bill.liquidationDate || bill.settlementDate));
  }

  function billBalance(bill) {
    if (!bill) return null;
    const raw = bill.balanceAmount != null ? bill.balanceAmount
      : (bill.outstandingBalance != null ? bill.outstandingBalance
        : (bill.currentBalance != null ? bill.currentBalance
          : (bill.remainingAmount != null ? bill.remainingAmount : null)));
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function billSituation(bill, pay) {
    return fold(
      (bill && (bill.situation || bill.status || bill.billStatus || bill.installmentStatus || bill.paymentStatus))
      || (pay && (pay.situation || pay.status))
      || ""
    );
  }

  function isPago(bill, pay, bm) {
    if (paymentDateOf(bill, pay, bm)) return true;
    const sit = billSituation(bill, pay);
    if (sit === "PG" || /\b(PG|PAGO|PAGA|LIQUIDADO|BAIXADO|QUITADO|PAID|SETTLED)\b/.test(sit)) return true;
    const bal = billBalance(bill);
    if (bal != null && Math.abs(bal) <= 0.009) return true;
    return false;
  }

  function billsOf(payload) {
    return (payload && payload.data) || (Array.isArray(payload) ? payload : []);
  }

  /** Só os títulos CAU do bulk-data /outcome, já no formato enxuto da base diária. */
  function cauBills(payload) {
    return (billsOf(payload) || []).filter((b) => b && b.billId != null && isCauDoc(b.documentIdentificationId, b.documentIdentificationName));
  }

  /** Linhas da tela: uma por título, parcela, departamento e centro de custo. */
  function transform(payload) {
    const rows = [];
    (billsOf(payload) || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      if (!isCauDoc(bill.documentIdentificationId, bill.documentIdentificationName)) return;
      listOrNull(bill.paymentsCategories).forEach((cat) => {
        listOrNull(bill.payments).forEach((pay) => {
          listOrNull(pay && pay.bankMovements).forEach((bm) => {
            listOrNull(bill.departamentsCosts).forEach((dep) => {
              listOrNull(bill.buildingsCosts).forEach((bld) => {
                const operacao = (bm && bm.operationName) || "";
                const conta = (bm && bm.accountNumber) || "";
                if (SKIP_OPS[operacao]) return;
                if (SKIP_ACCOUNTS[conta]) return;
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
                  docId: docCode(bill.documentIdentificationId) || "CAU",
                  docNome: firstWord(bill.documentIdentificationName) || "CAU",
                  valor,
                  planoId: cat && cat.financialCategoryId != null ? String(cat.financialCategoryId) : "",
                  plano: (cat && cat.financialCategoryName) || "",
                  ccId: cat && cat.costCenterId != null ? String(cat.costCenterId) : "",
                  ccNome: (cat && cat.costCenterName) || "",
                  rateio,
                  dataPagamento: paymentDateOf(bill, pay, bm),
                  pago: isPago(bill, pay, bm),
                  saldo: billBalance(bill),
                  situacao: billSituation(bill, pay),
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
  }

  function rowKey(r) {
    return String((r && r.titulo) || "") + "|" + String((r && r.parcela) || "");
  }

  function isLiberated(liberated, r) {
    const hit = liberated && liberated[rowKey(r)];
    return !!(hit && !hit.removed);
  }

  /** Empresas geridas pelo grupo, pelo cadastro de empresas (crm_empresas_custom). */
  function geridaIdSet(customRaw) {
    let raw = customRaw;
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw || "{}") || {}; } catch (e) { raw = {}; }
    }
    const yes = new Set();
    const seen = new Set();
    Object.keys(raw || {}).forEach((k) => {
      if (k === "_v2") return;
      const item = raw[k];
      if (!item || typeof item !== "object") return;
      const id = String(item.company_id != null ? item.company_id : k);
      seen.add(id);
      if (Number(item.gerida_pelo_grupo) === 1) yes.add(id);
    });
    GERIDAS_PADRAO.forEach((id) => { if (!seen.has(id)) yes.add(id); });
    return yes;
  }

  function installmentPayload(r, dueDate) {
    return {
      dueDate,
      interestAmount: 0,
      fineAmount: 0,
      monetaryCorrectionAmount: 0,
      amount: Number(r.valor) || 0,
      discountAmount: 0,
      installmentId: Number(r.installmentId != null ? r.installmentId : r.parcela) || 1
    };
  }

  /**
   * Retidas (sem liberação e sem pagamento) que vencem de hoje até hoje + antes.
   * O vencimento avança em blocos de `dias` até passar desse limite.
   * Uma parcela com rateio aparece em várias linhas: entra uma vez só.
   */
  function planoProrrogacao(rows, opts) {
    const hoje = opts.hoje;
    const antes = Math.max(0, Number(opts.antes) || 0);
    const dias = Math.max(1, Number(opts.dias) || 30);
    const limite = addDaysIso(hoje, antes);
    const gerida = opts.gerida;
    const vistos = new Set();
    const plano = [];
    (rows || []).forEach((r) => {
      if (!r || r.pago) return;
      if (gerida && !gerida.has(String(r.companyId))) return;
      if (isLiberated(opts.liberated, r)) return;
      const due = isoDate(r.vencimento);
      if (!due || due < hoje || due > limite) return;
      const key = rowKey(r);
      if (vistos.has(key)) return;
      vistos.add(key);
      let novo = addDaysIso(due, dias);
      while (novo <= limite) novo = addDaysIso(novo, dias);
      plano.push({ row: r, anterior: due, novo });
    });
    return plano.sort((a, b) => a.anterior.localeCompare(b.anterior) || rowKey(a.row).localeCompare(rowKey(b.row)));
  }

  return {
    SKIP_OPS,
    SKIP_ACCOUNTS,
    fold,
    isoDate,
    addDaysIso,
    defaultRange,
    isCauDoc,
    cauBills,
    transform,
    rowKey,
    isLiberated,
    geridaIdSet,
    installmentPayload,
    planoProrrogacao
  };
});
