/** Classificação de estoque (ficha: vencidas + a vencer). Usado no cron 07:30 e no browser. */

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

function kpisFromInstallments(installments) {
  let paid = 0;
  let due = 0;
  let upcoming = 0;
  const today = new Date().toISOString().split("T")[0];
  (installments || []).forEach((inst) => {
    const cb = Number(inst.currentBalance != null ? inst.currentBalance : inst.balanceDue || 0);
    (inst.receipts || []).forEach((rec) => {
      const rType = String(rec.type || rec.receiptType || rec.receiptTypeId || rec.typeId || rec.receiptId || "").toLowerCase();
      if (rType.includes("distrato") || rType.includes("cancel") || rType === "3" || rType === "7") return;
      paid += Number(rec.receiptValue || 0);
    });
    const dueDate = String(inst.dueDate || inst.originalDueDate || "").slice(0, 10);
    if (cb > 0.009 && dueDate && dueDate < today) due += cb;
    else if (cb > 0.009) upcoming += cb;
  });
  return { kpiPago: paid, kpiVencidas: due, kpiAVencer: upcoming };
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

function billMatchesEstoqueUnit(b, u) {
  if (!b || !u) return false;
  const bid = String(b.id || b.receivableBillId || b.billReceivableId || "");
  if (u.receivableBillId && bid && String(u.receivableBillId) === bid) return true;
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
    next.quitacaoDate = isoDate(bill && (bill.payOffDate || bill.payoffDate)) || u.quitacaoDate || null;
  } else if (status === "distratado") {
    next.quitado = false;
    next.quitacaoDate = null;
    next.situation = u.situation || "Distratado";
  } else {
    next.quitado = false;
    next.quitacaoDate = null;
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
  const kpis = kpisFromInstallments(installments);
  const aReceber = (Number(kpis.kpiVencidas) || 0) + (Number(kpis.kpiAVencer) || 0);
  const received = Number(kpis.kpiPago) || 0;
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
    if (fin === "quitado") {
      next.quitado = true;
      next.outstandingBalance = 0;
      next.presentDebitBalance = 0;
      next.quitacaoDate = lastBaixaFromInstallments(installments)
        || isoDate(rb && (rb.payOffDate || rb.payoffDate))
        || u.quitacaoDate
        || null;
    }
    return attachCashFields(next, installments, rb);
  }

function classifyCustomerUnits(units, bills, statements) {
  const open = (units || []).filter((u) => !isSettledUnit(u));
  const unitIds = new Set(open.map((u) => String(u.id)));
  return (units || []).map((u) => {
    if (!unitIds.has(String(u.id))) return u;
    const mine = (bills || []).filter((b) => billMatchesEstoqueUnit(b, u));
    const stmt = (statements || []).find((s) => {
      const sid = String(s.billReceivableId || s.receivableBillId || s.id || "").replace(/^B-/, "").split("-")[0];
      if (mine.some((b) => String(b.id || b.receivableBillId || "") === sid)) return true;
      return billMatchesEstoqueUnit(s, u);
    }) || ((statements || []).length === 1 && unitIds.size === 1 ? statements[0] : null);
    const status = classifyUnitBills(mine)
      || ((u.contractId || u.contractNumber) ? "adimplente" : "quitado");
    const rb = mine
      .filter((b) => classifyReceivableBill(b) === status)
      .sort((a, b) => String(b.payOffDate || "").localeCompare(String(a.payOffDate || "")))[0]
      || mine[0]
      || null;
    if (stmt && (stmt.installments || []).length) {
      return applyFichaMoney(u, stmt.installments, status || "adimplente", rb || stmt);
    }
    return applyRelFin(u, status, rb);
  });
}

module.exports = {
  SOLD_CODES,
  isSoldUnit,
  isFinanceUnit,
  isSettledUnit,
  extractRows,
  flattenStatements,
  classifyCustomerUnits
};
