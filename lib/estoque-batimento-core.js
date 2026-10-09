/** Classificação de estoque (ficha: vencidas + a vencer). Usado no cron 06:30 e no browser. */

const SOLD_CODES = ["V", "O", "G", "P", "L"];

function isSoldUnit(u) {
  const code = String((u && u.commercialStock) || "").toUpperCase();
  return SOLD_CODES.includes(code) || !!(u && u.contractId);
}

function isFinanceUnit(u) {
  if (!u) return false;
  const code = String(u.commercialStock || "").toUpperCase();
  return code === "V" || code === "O" || !!(u.contractId || u.contractNumber);
}

function isSettledUnit(u) {
  if (!u) return false;
  return u.relFin === "quitado" || u.quitado === true;
}

function isoDate(s) {
  if (!s) return null;
  const d = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isoQuitacao(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (br) return `${br[3]}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")}`;
  return isoDate(s);
}

function sealQuitacao(u, ...candidates) {
  const locked = isoQuitacao(u && u.quitacaoDate);
  if (locked) return locked;
  for (let i = 0; i < candidates.length; i++) {
    const iso = isoQuitacao(candidates[i]);
    if (iso) return iso;
  }
  if (u && (u.quitado || u.relFin === "quitado")) {
    return isoQuitacao(u.finAt) || todayStr();
  }
  return null;
}

function lastBaixaFromReceipts(receipts) {
  let last = null;
  (receipts || []).forEach((rec) => {
    const t = String(rec.type || rec.receiptType || rec.receiptTypeId || rec.typeId || "").toLowerCase();
    if (t.includes("distrato") || t.includes("cancel") || t === "3" || t === "7") return;
    const d = isoDate(rec.date || rec.receiptDate || rec.paymentDate || rec.netReceiptDate);
    if (d && (!last || d > last)) last = d;
  });
  return last;
}

function lastBaixaFromInstallments(installments) {
  let last = null;
  (installments || []).forEach((inst) => {
    const d = lastBaixaFromReceipts(inst.receipts);
    if (d && (!last || d > last)) last = d;
  });
  return last;
}

function isWriteOffReceipt(rec) {
  if (!rec) return false;
  const rType = String(rec.type || rec.receiptType || rec.receiptTypeId || rec.typeId || "").toLowerCase();
  const extra = String(rec.typeName || rec.receiptTypeName || rec.description || rec.historic || rec.history || "").toLowerCase();
  const blob = (rType + " " + extra).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (blob.includes("distrato") || blob.includes("cancel")) return true;
  return rType === "3" || rType === "7";
}

function instOverdueAmount(inst) {
  const cb = Number(inst.currentBalance != null ? inst.currentBalance : inst.balanceDue || 0);
  const withAdd = Number(
    inst.currentBalanceWithAddition != null ? inst.currentBalanceWithAddition
      : (inst.correctedValueWithAdditions != null ? inst.correctedValueWithAdditions : NaN)
  );
  if (Number.isFinite(withAdd) && withAdd > 0.009) return withAdd;
  const add = Number(inst.additionalValue || inst.additionsValue || inst.interestValue || inst.interest || 0)
    + Number(inst.fine || inst.fineValue || 0);
  return cb + (add > 0 ? add : 0);
}

function kpisFromInstallments(installments) {
  const today = new Date().toISOString().split("T")[0];
  let kpiPago = 0;
  let kpiAcrescimo = 0;
  let kpiDesconto = 0;
  let kpiLiquido = 0;
  let kpiVencidas = 0;
  let kpiVencidasOriginal = 0;
  let kpiAVencer = 0;
  (installments || []).forEach((inst) => {
    const cb = Number(inst.currentBalance != null ? inst.currentBalance : inst.balanceDue || 0);
    const ov = Number(inst.originalValue || inst.value || 0);
    const dueDate = String(inst.dueDate || inst.originalDueDate || "").slice(0, 10);
    if (cb > 0.009 && dueDate && dueDate < today) {
      kpiVencidas += instOverdueAmount(inst);
      kpiVencidasOriginal += ov || cb;
    } else if (cb > 0.009) {
      kpiAVencer += cb;
    }
    (inst.receipts || []).forEach((rec) => {
      if (isWriteOffReceipt(rec)) return;
      kpiPago += Number(rec.receiptValue || 0);
      kpiAcrescimo += Number(rec.additionalValue || 0);
      kpiDesconto += Number(rec.discountValue || 0);
      kpiLiquido += Number(rec.netReceiptValue || 0);
    });
  });
  if (kpiLiquido <= 0.009 && kpiPago > 0) kpiLiquido = Math.max(0, kpiPago + kpiAcrescimo - kpiDesconto);
  const kpiTotalContrato = Math.max(0, kpiPago - kpiDesconto) + kpiVencidasOriginal + kpiAVencer;
  return {
    kpiPago,
    kpiAcrescimo,
    kpiDesconto,
    kpiLiquido,
    recebido: kpiLiquido,
    kpiVencidas,
    kpiVencidasOriginal,
    kpiAVencer,
    kpiTotalContrato
  };
}

function extractRows(res) {
  if (!res) return [];
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.results)) return res.results;
  return [];
}

function flattenStatements(res) {
  const raw = (res && (res.results || res.data)) || [];
  const out = [];
  raw.forEach((item) => {
    if (!item) return;
    if (Array.isArray(item.billsReceivable) && item.billsReceivable.length) {
      item.billsReceivable.forEach((b) => out.push(b));
      return;
    }
    if (Array.isArray(item.bills) && item.bills.length) {
      item.bills.forEach((b) => out.push(b));
      return;
    }
    if (item.installments || item.billReceivableId || item.receivableBillId) out.push(item);
  });
  return out;
}

function cleanUnitKey(name, entId) {
  if (!name) return "";
  let clean = String(name).trim();
  if (entId) {
    const eStr = String(entId);
    if (clean === eStr) return "";
    if (clean.startsWith(eStr + " - ")) clean = clean.substring(eStr.length + 3);
    else if (clean.startsWith(eStr + "-")) clean = clean.substring(eStr.length + 1);
    else if (clean.startsWith(eStr + " ")) clean = clean.substring(eStr.length + 1);
  }
  return clean.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function normName(name) {
  return String(name || "").replace(/\s+/g, "").toUpperCase();
}

function classifyReceivableBill(b) {
  if (!b) return "adimplente";
  const sit = String(b.status || b.situation || "").toUpperCase();
  if ((b.active === false && !b.payOffDate) || sit === "CANCELED" || sit === "DISTRATO") return "distratado";
  if (b.payOffDate || sit === "QUIT" || sit === "QUITADO") return "quitado";
  if (b.defaulting) return "inadimplente";
  if (b.active !== false && !b.payOffDate && b.dueDate) {
    try {
      const due = new Date(b.dueDate).toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];
      if (due < today) return "inadimplente";
    } catch (e) {}
  }
  return "adimplente";
}

function classifyUnitBills(bills) {
  const list = (bills || []).filter(Boolean);
  if (!list.length) return null;
  const ranks = list.map((b) => classifyReceivableBill(b));
  if (ranks.every((s) => s === "distratado")) return "distratado";
  if (ranks.every((s) => s === "quitado")) return "quitado";
  if (ranks.some((s) => s === "inadimplente")) return "inadimplente";
  return "adimplente";
}

function digitsKey(s) {
  return String(s || "").replace(/\D/g, "");
}

function docMatchesContract(doc, num) {
  if (!doc || !num) return false;
  const a = String(doc).replace(/\s/g, "").toUpperCase();
  const b = String(num).replace(/\s/g, "").toUpperCase();
  if (a.includes(b) || b.includes(a)) return true;
  const da = digitsKey(doc);
  const db = digitsKey(num);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}

function billMatchesEstoqueUnit(b, u) {
  if (!b || !u) return false;
  const bid = String(b.id || b.receivableBillId || b.billReceivableId || "").replace(/^B-/, "").split("-")[0];
  const uBill = String(u.receivableBillId || "").replace(/^B-/, "").split("-")[0];
  if (uBill && bid && uBill === bid) return true;
  const sale = String(u.contractId || u.saleId || "");
  const bSale = String(b.saleId || b.salesContractId || b.contractId || "");
  if (sale && bSale && sale === bSale) return true;
  const num = u.contractNumber || "";
  const docs = [b.document, b.documentNumber, b.contractNumber, b.salesContractNumber, b.number];
  if (num && docs.some((d) => docMatchesContract(d, num))) return true;
  const bEnt = String(b.enterpriseId || b.costCenterId || "");
  if (bEnt && String(u.enterpriseId) !== bEnt) return false;
  const bName = b.unityName || b.unitName || b.unit || "";
  const uk = cleanUnitKey(u.name, u.enterpriseId);
  const bk = cleanUnitKey(bName, bEnt || u.enterpriseId);
  if (uk && bk && uk === bk) return true;
  const a = normName(bName);
  const bn = normName(u.name);
  return !!(a && bn && a === bn);
}

function applyRelFin(u, status, bill) {
  const next = {
    ...u,
    relFin: status,
    statementDone: true,
    finAt: new Date().toISOString()
  };
  if (bill) {
    const bid = bill.id || bill.receivableBillId || bill.billReceivableId;
    if (bid) next.receivableBillId = u.receivableBillId || bid;
  }
  if (status === "quitado") {
    next.quitado = true;
    next.outstandingBalance = 0;
    next.presentDebitBalance = 0;
    next.quitacaoDate = sealQuitacao(u, bill && (bill.payOffDate || bill.payoffDate));
  } else if (status === "distratado") {
    next.quitado = false;
    next.quitacaoDate = null;
    next.situation = u.situation || "Distratado";
  } else {
    next.quitado = false;
    next.quitacaoDate = isoQuitacao(u.quitacaoDate);
  }
  return next;
}

function openParcelasFromInstallments(installments) {
  const today = new Date().toISOString().split("T")[0];
  const horizon = new Date();
  horizon.setMonth(horizon.getMonth() + 18);
  const lim = horizon.toISOString().split("T")[0];
  const out = [];
  (installments || []).forEach((inst) => {
    const cb = Number(inst.currentBalance != null ? inst.currentBalance : inst.balanceDue || 0);
    const due = String(inst.dueDate || inst.originalDueDate || "").slice(0, 10);
    if (cb <= 0.009 || !due || due > lim) return;
    out.push({ due, val: cb, overdue: due < today });
  });
  out.sort((a, b) => String(a.due).localeCompare(String(b.due)));
  return out.slice(0, 24);
}

function pmpLastMonths(installments, months) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (months || 3));
  const cut = cutoff.toISOString().split("T")[0];
  let days = 0;
  let n = 0;
  (installments || []).forEach((inst) => {
    const due = String(inst.dueDate || inst.originalDueDate || "").slice(0, 10);
    (inst.receipts || []).forEach((rec) => {
      const t = String(rec.type || rec.receiptType || rec.receiptTypeId || rec.typeId || "").toLowerCase();
      if (t.includes("distrato") || t.includes("cancel") || t === "3" || t === "7") return;
      const pay = isoDate(rec.date || rec.receiptDate || rec.paymentDate || rec.netReceiptDate);
      if (!pay || pay < cut || !due) return;
      const diff = Math.round((new Date(pay + "T12:00:00") - new Date(due + "T12:00:00")) / 86400000);
      if (!Number.isFinite(diff)) return;
      days += diff;
      n += 1;
    });
  });
  return n ? Math.round(days / n) : 0;
}

function attachCashFields(next, installments, rb) {
  next.pmp3m = pmpLastMonths(installments, 3);
  next.openParcelas = next.quitado ? [] : openParcelasFromInstallments(installments);
  if (rb && (rb.clientName || rb.customerName || rb.name)) {
    next.customerName = rb.clientName || rb.customerName || rb.name;
  }
  return next;
}

function applyFichaMoney(u, installments, status, rb) {
  const kpis = kpisFromInstallments(installments);
  const aReceber = (Number(kpis.kpiVencidas) || 0) + (Number(kpis.kpiAVencer) || 0);
  const received = Number(kpis.recebido != null ? kpis.recebido : kpis.kpiLiquido) || 0;
  let fin = status;
  if (kpis.kpiVencidas <= 0.009 && kpis.kpiAVencer <= 0.009) fin = "quitado";
  else if (kpis.kpiVencidas > 0.009) fin = "inadimplente";
  else if (aReceber > 0.009) fin = "adimplente";
  const next = applyRelFin(u, fin, rb);
  next.receivedAmount = received;
  next.receivedLocked = true;
  next.outstandingBalance = aReceber;
  next.presentDebitBalance = aReceber;
  next.kpiVencidas = kpis.kpiVencidas;
  next.kpiAVencer = kpis.kpiAVencer;
  next.kpiPago = kpis.kpiPago;
  next.kpiAcrescimo = kpis.kpiAcrescimo;
  next.kpiDesconto = kpis.kpiDesconto;
  next.kpiLiquido = kpis.kpiLiquido;
  if (kpis.kpiTotalContrato > 0.009) next.contractValue = kpis.kpiTotalContrato;
  if (fin === "quitado") {
    next.quitado = true;
    next.outstandingBalance = 0;
    next.presentDebitBalance = 0;
    next.quitacaoDate = sealQuitacao(
      { ...u, ...next, quitado: true },
      lastBaixaFromInstallments(installments),
      rb && (rb.payOffDate || rb.payoffDate)
    );
  }
  return attachCashFields(next, installments, rb);
}

function hasCensus(u) {
  if (!u) return false;
  return !!(u.statementDone && u.relFin && (u.receivedLocked || u.censusAt));
}

function needsCensus(u) {
  return isFinanceUnit(u) && !!u.customerId && !hasCensus(u);
}

function paidDaysForUnit(u, paidMap) {
  if (!u || !paidMap || typeof paidMap.get !== "function") return null;
  const keys = [u.receivableBillId, u.billId, u.contractId, u.contractNumber]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  let best = null;
  keys.forEach((raw) => {
    [raw, raw.replace(/^B-/, ""), raw.replace(/^B-/, "").split("-")[0]].forEach((c) => {
      if (!c || !paidMap.has(c)) return;
      const n = Number(paidMap.get(c));
      if (!Number.isFinite(n)) return;
      if (best == null || n < best) best = n;
    });
  });
  return best;
}

function filaBillAmount(b) {
  if (!b) return 0;
  const charges = Number(b.overdueCharges);
  const principal = Number(b.overdueValue != null ? b.overdueValue : b.value) || 0;
  if (Number.isFinite(charges) && charges > 0.009) return principal + charges;
  const interest = Number(b.interest || b.interestValue || 0);
  const fine = Number(b.fine || b.fineValue || 0);
  if (interest + fine > 0.009) return principal + interest + fine;
  const insts = b.defaulterInstallments || [];
  if (insts.length) {
    return insts.reduce((s, inst) => {
      if (inst.correctedValueWithAdditions != null) return s + Number(inst.correctedValueWithAdditions || 0);
      return s + Number(inst.value || inst.correctedValueWithoutAdditions || 0)
        + Number(inst.interest || 0) + Number(inst.fine || 0);
    }, 0);
  }
  return principal;
}

function buildFilaIndex(bills) {
  const byRb = new Map();
  const byUnit = new Map();
  const byCustomer = new Map();
  (bills || []).forEach((b) => {
    const val = filaBillAmount(b);
    const rb = String(b.receivableBillId || b.id || "");
    if (rb) byRb.set(rb, (byRb.get(rb) || 0) + val);
    const cust = String(b.customerId || b.clientId || "");
    if (cust) byCustomer.set(cust, (byCustomer.get(cust) || 0) + val);
    const cc = String(b.costCenterId || (b.costCentersId && b.costCentersId[0]) || "");
    String(b.units || "").split(/[;,|/]/).forEach((part) => {
      const n = normName(part);
      if (n && n !== "N/D") {
        const k = cc + "|" + n;
        byUnit.set(k, (byUnit.get(k) || 0) + val);
      }
    });
  });
  return { byRb, byUnit, byCustomer };
}

function filaOverdueForUnit(u, idx) {
  if (!u || !idx) return 0;
  if (u.receivableBillId && idx.byRb.has(String(u.receivableBillId))) {
    return idx.byRb.get(String(u.receivableBillId)) || 0;
  }
  const k = String(u.enterpriseId || "") + "|" + normName(u.name);
  if (idx.byUnit.has(k)) return idx.byUnit.get(k) || 0;
  const cust = String(u.customerId || "");
  if (cust && idx.byCustomer.has(cust)) return idx.byCustomer.get(cust) || 0;
  return 0;
}

function stampInadimplenteFromFila(u, overdueVal) {
  const ov = Number(overdueVal) || 0;
  const aReceber = Math.max(Number(u.outstandingBalance) || 0, ov);
  return {
    ...u,
    relFin: "inadimplente",
    quitado: false,
    kpiVencidas: ov,
    outstandingBalance: aReceber,
    presentDebitBalance: aReceber,
    filaAt: new Date().toISOString(),
    finAt: new Date().toISOString()
  };
}

function planBatimentoWork(units, paidMap, filaBills, opts) {
  const deltaDays = (opts && Number(opts.deltaDays)) || 5;
  const filaIdx = buildFilaIndex(filaBills);
  const census = [];
  const ficha = [];
  const stamp = [];
  (units || []).forEach((u) => {
    if (!isFinanceUnit(u) || !u.customerId) return;
    if (isSettledUnit(u)) return;
    const cid = String(u.customerId);
    if (needsCensus(u)) {
      census.push(cid);
      return;
    }
    const paid = paidDaysForUnit(u, paidMap);
    const ov = filaOverdueForUnit(u, filaIdx);
    if (paid != null && paid <= deltaDays) {
      ficha.push(cid);
      return;
    }
    if (ov > 0.009) {
      stamp.push(String(u.id));
      return;
    }
    if (u.relFin === "inadimplente") ficha.push(cid);
  });
  return {
    censusIds: [...new Set(census)],
    fichaIds: [...new Set(ficha)],
    stampUnitIds: stamp,
    filaIdx
  };
}

function pickStatementForUnit(u, statements, bills) {
  const list = statements || [];
  const mine = (bills || []).filter((b) => billMatchesEstoqueUnit(b, u));
  const byRb = list.find((s) => {
    const sid = String(s.billReceivableId || s.receivableBillId || s.id || "").replace(/^B-/, "").split("-")[0];
    const uBill = String(u.receivableBillId || "").replace(/^B-/, "").split("-")[0];
    if (uBill && sid && uBill === sid) return true;
    return mine.some((b) => String(b.id || b.receivableBillId || "").replace(/^B-/, "").split("-")[0] === sid);
  });
  if (byRb) return byRb;
  const byDoc = list.find((s) => billMatchesEstoqueUnit(s, u));
  if (byDoc) return byDoc;
  if (list.length === 1 && mine.length <= 1) return list[0];
  return null;
}

function classifyCustomerUnits(units, bills, statements, opts) {
  const includeSettled = !!(opts && opts.includeSettled);
  const censusAt = (opts && opts.censusAt) || todayStr();
  const unitIds = new Set((units || [])
    .filter((u) => includeSettled || !isSettledUnit(u))
    .map((u) => String(u.id)));
  return (units || []).map((u) => {
    if (!unitIds.has(String(u.id))) return u;
    const mine = (bills || []).filter((b) => billMatchesEstoqueUnit(b, u));
    const stmt = pickStatementForUnit(u, statements, bills);
    const status = classifyUnitBills(mine)
      || ((u.contractId || u.contractNumber) ? "adimplente" : "quitado");
    const rb = mine
      .filter((b) => classifyReceivableBill(b) === status)
      .sort((a, b) => String(b.payOffDate || "").localeCompare(String(a.payOffDate || "")))[0]
      || mine[0]
      || null;
    const next = (stmt && (stmt.installments || []).length)
      ? applyFichaMoney(u, stmt.installments, status || "adimplente", rb || stmt)
      : applyRelFin(u, status, rb);
    next.censusAt = censusAt;
    return next;
  });
}

module.exports = {
  SOLD_CODES,
  isSoldUnit,
  isFinanceUnit,
  isSettledUnit,
  extractRows,
  flattenStatements,
  classifyCustomerUnits,
  applyFichaMoney,
  kpisFromInstallments,
  hasCensus,
  needsCensus,
  paidDaysForUnit,
  buildFilaIndex,
  filaBillAmount,
  filaOverdueForUnit,
  stampInadimplenteFromFila,
  planBatimentoWork,
  billMatchesEstoqueUnit,
  pickStatementForUnit
};
