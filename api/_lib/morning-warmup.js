const { initializeApp } = require("firebase/app");
const {
  getFirestore, doc, setDoc, getDoc, deleteDoc
} = require("firebase/firestore");
const { todayIsoSP } = require("../../lib/br-calendar");
const caucaoHandler = require("../../lib/caucao-batimento");

const SIENGE_DOMAIN = "mouraleite";
const SIENGE_USER = "mouraleite-contas-a-pagar";
const SIENGE_PASS = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj";
const SIENGE_AUTH = "Basic " + Buffer.from(`${SIENGE_USER}:${SIENGE_PASS}`).toString("base64");
const SIENGE_API_BASE = `https://api.sienge.com.br/${SIENGE_DOMAIN}/public/api/v1`;
const SIENGE_BULK_BASE = `https://api.sienge.com.br/${SIENGE_DOMAIN}/public/api`;

const firebaseConfig = {
  apiKey: "AIzaSyBlBCaXn4y3sJDENW0GXw3ck_D2h3qknHc",
  authDomain: "crm-gestao-mldu.firebaseapp.com",
  projectId: "crm-gestao-mldu",
  storageBucket: "crm-gestao-mldu.firebasestorage.app",
  messagingSenderId: "1040392341069",
  appId: "1:1040392341069:web:6acf1beb34af663cfffe04"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const STATE_ID = "_warmup_state";
const BATCH_CC = 2;
const BUDGET_MS = 42000;

function authorized(req) {
  const secret = process.env.CRON_SECRET || process.env.WARMUP_SECRET;
  if (!secret) return true;
  const auth = String(req.headers.authorization || "");
  const q = req.query && (req.query.secret || req.query.token);
  return auth === `Bearer ${secret}` || String(q || "") === secret;
}

function originFromReq(req) {
  if (process.env.WARMUP_BASE_URL) return process.env.WARMUP_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "crm-gestao.vercel.app";
  return `${proto}://${host}`;
}

/**
 * O plano da Vercel tem duas rotinas agendadas e as duas já estão em uso: o batimento da
 * caução sai daqui. A chamada é abandonada depois de enviada; a função da caução segue sozinha.
 */
async function dispararCaucao(req) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    await fetch(`${originFromReq(req)}/api/caucao-batimento`, {
      headers: { Authorization: req.headers.authorization || "" },
      signal: ctrl.signal
    });
  } catch (e) {
  } finally {
    clearTimeout(timer);
  }
}

async function siengeFetch(url, retries = 5) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { Authorization: SIENGE_AUTH, Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`Sienge ${res.status}`);
        await new Promise((r) => setTimeout(r, Math.min(4000 * 2 ** i, 20000)));
        continue;
      }
      if (!res.ok) throw new Error(`Sienge ${res.status}: ${await res.text()}`);
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch (e) {
      last = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw last;
}

async function fetchAllPages(path, pageSize = 200) {
  const all = [];
  let offset = 0;
  let total = null;
  const sep = path.includes("?") ? "&" : "?";
  do {
    const res = await siengeFetch(`${SIENGE_API_BASE}${path}${sep}limit=${pageSize}&offset=${offset}`);
    const results = res.results || [];
    if (total == null) total = res.resultSetMetadata && res.resultSetMetadata.count != null
      ? res.resultSetMetadata.count : results.length;
    all.push(...results);
    offset += pageSize;
    if (offset < total) await new Promise((r) => setTimeout(r, 400));
  } while (offset < total);
  return all;
}

function internalCompanyIds(customRaw) {
  const allowed = [1, 2, 3, 6, 13, 28, 32];
  try {
    const custom = typeof customRaw === "string" ? JSON.parse(customRaw || "{}") : (customRaw || {});
    const ids = Object.entries(custom)
      .filter(([, c]) => c && typeof c === "object" && (c.cobranca_interna === 1 || c.cobranca_interna === true || c.cobranca_interna === "1"))
      .map(([, c]) => Number(c.company_id ?? c.id))
      .filter(Number.isFinite);
    if (ids.length) return [...new Set(ids)];
  } catch (e) {}
  return allowed;
}

function installmentDueIso(inst) {
  return String((inst && inst.dueDate) || "").slice(0, 10);
}

function installmentIsSettled(inst) {
  if (!inst) return true;
  const sit = String(inst.installmentSituation || inst.situation || inst.status || "").toLowerCase();
  if (sit === "2" || sit === "paid" || /quitad|paga/.test(sit)) return true;
  if (inst.isValidReceipt === true) return true;
  const cb = inst.currentBalance;
  if (cb !== undefined && cb !== null && Number(cb) <= 0.009) return true;
  const recs = Array.isArray(inst.receipts) ? inst.receipts : [];
  return recs.some((r) => {
    const op = String(r.operationTypeId || r.typeId || r.type || "");
    const val = Number(r.netReceiptValue || r.receiptValue || r.value || 0);
    const dt = r.paymentDate || r.receiptDate || r.date;
    return dt && (String(op) === "2" || val > 0.009);
  });
}

function installmentOverdueAmount(inst) {
  if (inst.correctedValueWithAdditions !== undefined && inst.correctedValueWithAdditions !== null) {
    return Number(inst.correctedValueWithAdditions) || 0;
  }
  if (inst.correctedValueWithoutAdditions !== undefined && inst.correctedValueWithoutAdditions !== null) {
    return (Number(inst.correctedValueWithoutAdditions) || 0) + (Number(inst.interest) || 0) + (Number(inst.fine) || 0);
  }
  return (Number(inst.value) || 0) + (Number(inst.interest) || 0) + (Number(inst.fine) || 0);
}

function summarizeOpenDefaulterBill(bill) {
  const todayIso = todayIsoSP();
  const all = (bill && bill.defaulterInstallments) || [];
  const open = all.filter((inst) => {
    if (installmentIsSettled(inst)) return false;
    const due = installmentDueIso(inst);
    if (due && due > todayIso) return false;
    return true;
  });
  let value = 0, interest = 0, fine = 0, daysDelay = 0;
  open.forEach((inst) => {
    value += installmentOverdueAmount(inst);
    interest += Number(inst.interest) || 0;
    fine += Number(inst.fine) || 0;
    const delay = inst.daysOfDelay !== undefined ? inst.daysOfDelay : (inst.daysDelay || 0);
    if (Number(delay) > daysDelay) daysDelay = Number(delay) || 0;
  });
  return { value, interest, fine, daysDelay, installments: open };
}

function paidDaysFromDate(dateStr, today) {
  const clean = String(dateStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const rDate = new Date(clean + "T12:00:00");
  const todayDate = new Date(today + "T12:00:00");
  const diffDays = Math.floor((todayDate - rDate) / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(diffDays) || diffDays < 0) return null;
  return diffDays;
}

function collectIncomePaidEntries(rows, today) {
  const map = new Map();
  (rows || []).forEach((item) => {
    const bId = item.billReceivableId || item.receivableBillId || item.billId || item.documentId || item.invoiceId || item.id;
    if (!bId) return;
    const dates = [];
    if (item.receipts && Array.isArray(item.receipts)) {
      item.receipts.forEach((receipt) => {
        if (String(receipt.operationTypeId) === "2" && receipt.paymentDate) dates.push(receipt.paymentDate);
      });
    }
    if (!dates.length && (item.paymentDate || item.receiptDate)) dates.push(item.paymentDate || item.receiptDate);
    dates.forEach((dateStr) => {
      const days = paidDaysFromDate(dateStr, today);
      if (days == null) return;
      const key = String(bId);
      const cur = map.get(key);
      if (cur === undefined || days < cur) map.set(key, days);
    });
  });
  return Array.from(map.entries());
}

function linhasBulk(res) {
  if (!res || typeof res !== "object") return null;
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.results)) return res.results;
  if (res.data && Array.isArray(res.data.results)) return res.data.results;
  return null;
}

function idTitulo(bill) {
  return String((bill && (bill.receivableBillId || bill.id || bill.saleId)) || "");
}

function tituloTrazSubJudice(bill, ids) {
  const id = idTitulo(bill);
  if (id && ids && ids.has(id)) return true;
  return !!(bill && Array.isArray(bill.underJudgmentInstallments) && bill.underJudgmentInstallments.length);
}

function normalizeBill(bill, underJudgmentIds) {
  const installments = []
    .concat(bill.defaulterInstallments || [])
    .concat(bill.underJudgmentInstallments || []);
  const mapped = {
    id: bill.receivableBillId || String(bill.id),
    saleId: bill.receivableBillId ? Number(bill.receivableBillId) : (bill.saleId || 100),
    realSaleId: bill.saleId,
    customerId: bill.clientId ? Number(bill.clientId) : (bill.customerId || 0),
    clientName: bill.clientName || `Cliente #${bill.clientId}`,
    companyId: bill.companyId,
    costCentersId: bill.costCentersId || [],
    costCenterId: bill.costCenterId || (bill.costCentersId && bill.costCentersId[0]) || null,
    units: bill.units || "N/D",
    value: 0, interest: 0, fine: 0, daysDelay: 0,
    slipStatus: "Vencido",
    subjudice: tituloTrazSubJudice(bill, underJudgmentIds) ? "S" : "N",
    defaulterInstallments: installments,
    defaulterJudicialActivities: bill.defaulterJudicialActivities || [],
    totalInstallmentsCount: (bill.defaulterInstallments ? bill.defaulterInstallments.length : 0)
      + (bill.normalInstallments ? bill.normalInstallments.length : 0)
      + (bill.inBillingInstallments ? bill.inBillingInstallments.length : 0)
      + (bill.underJudgmentInstallments ? bill.underJudgmentInstallments.length : 0)
  };
  const open = summarizeOpenDefaulterBill(mapped);
  mapped.value = open.value;
  mapped.interest = open.interest;
  mapped.fine = open.fine;
  mapped.daysDelay = open.daysDelay;
  mapped.defaulterInstallments = open.installments || [];
  return mapped;
}

const DEFAULTERS_CACHE_REV = 5;

function documentoExtratoEhCt(row) {
  const tipo = String((row && (row.documentIdentificationId || row.documentId || row.documentsId)) || "").trim().toUpperCase();
  if (!tipo || /^\d+$/.test(tipo)) return true;
  return tipo === "CT";
}

function idTituloExtrato(row) {
  return String((row && (row.billReceivableId || row.receivableBillId)) || "").replace(/^B-/, "").split("-")[0];
}

function diasAtrasoParcela(due, today) {
  const iso = String(due || "").slice(0, 10);
  if (!iso || iso > today) return 0;
  const a = new Date(iso + "T12:00:00");
  const b = new Date(today + "T12:00:00");
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function rotuloUnidadesExtrato(row) {
  if (!row) return "N/D";
  if (typeof row.units === "string" && row.units.trim()) return row.units;
  if (Array.isArray(row.units)) {
    const names = row.units.map((u) => u && (u.name || u.unitName || u.id)).filter(Boolean);
    if (names.length) return names.join(", ");
  }
  return row.unitName || "N/D";
}

function linhasDoExtrato(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.results)) return res.results;
  return [];
}

async function siengeFetchOnce(url) {
  const res = await fetch(url, { headers: { Authorization: SIENGE_AUTH, Accept: "application/json" } });
  if (!res.ok) {
    const err = new Error("Sienge " + res.status);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function fetchExtratoVencidoCc(ccId, today) {
  const url = (s, e) => `${SIENGE_BULK_BASE}/bulk-data/v1/customer-extract-history?startDueDate=${s}&endDueDate=${e}&costCenterId=${encodeURIComponent(ccId)}`
    + "&documentsId=CT&includeRemadeInstallments=false&includeCanceledInstallments=false&includeRevokedInstallments=false&includeRenegotiatedDischarge=false";
  const get = async (s, e, depth) => {
    try {
      return linhasDoExtrato(await siengeFetchOnce(url(s, e)));
    } catch (err) {
      const status = Number(err && err.status);
      if (status === 429 && depth < 4) {
        await new Promise((r) => setTimeout(r, 2000));
        return get(s, e, depth + 1);
      }
      if (status === 404) return [];
      const sy = Number(String(s).slice(0, 4));
      const ey = Number(String(e).slice(0, 4));
      if (status !== 507 || depth > 6 || ey - sy < 1) throw err;
      const mid = Math.floor((sy + ey) / 2);
      const left = await get(s, mid + "-12-31", depth + 1);
      const right = await get((mid + 1) + "-01-01", e, depth + 1);
      return left.concat(right);
    }
  };
  return get("1996-01-01", today, 0);
}

function incluirParcelasForaDaCobranca(normalized, rows, today, companyId) {
  const porId = new Set();
  const porVencimento = new Set();
  const porTitulo = new Map();
  (normalized || []).forEach((b) => {
    const billId = String(b.id);
    porTitulo.set(billId, b);
    (b.defaulterInstallments || []).forEach((inst) => {
      const id = String(inst.installmentId || inst.id || "");
      const due = String(inst.dueDate || "").slice(0, 10);
      if (id) porId.add(billId + "|" + id);
      if (due) porVencimento.add(billId + "|" + due);
    });
  });
  const extras = new Map();
  (rows || []).forEach((row) => {
    if (!row || !documentoExtratoEhCt(row)) return;
    const billId = idTituloExtrato(row);
    if (!billId) return;
    (row.installments || []).forEach((p) => {
      if (!p) return;
      const due = String(p.dueDate || "").slice(0, 10);
      if (!due || due >= today) return;
      const saldo = Number(p.currentBalance);
      const comAcr = Number(p.currentBalanceWithAddition);
      const valor = Number.isFinite(comAcr) && comAcr > 0.009 ? comAcr : (Number.isFinite(saldo) ? saldo : 0);
      if (!(valor > 0.009)) return;
      const instId = String(p.id || p.installmentId || "");
      if (instId && porId.has(billId + "|" + instId)) return;
      if (due && porVencimento.has(billId + "|" + due)) return;
      const chave = billId + "|" + (instId || due) + "|" + due;
      let acc = extras.get(chave);
      if (!acc) {
        const cliente = row.customer || {};
        acc = {
          billId,
          instId,
          due,
          saldo: 0,
          valor: 0,
          companyId: row.companyId || companyId,
          customerId: cliente.id != null ? Number(cliente.id) : (row.clientId != null ? Number(row.clientId) : 0),
          clientName: cliente.name || cliente.tradeName || row.clientName || "Cliente",
          costCenterId: row.costCenterId || null,
          units: rotuloUnidadesExtrato(row),
          conditionType: p.conditionType || p.paymentConditionType || p.paymentCondition || ""
        };
        extras.set(chave, acc);
      }
      acc.saldo += Number.isFinite(saldo) ? saldo : valor;
      acc.valor += valor;
    });
  });
  let acrescentadas = 0;
  extras.forEach((acc) => {
    if (!(acc.valor > 0.009)) return;
    const inst = {
      id: acc.instId || undefined,
      installmentId: acc.instId || undefined,
      dueDate: acc.due,
      currentBalance: acc.saldo,
      correctedValueWithAdditions: acc.valor,
      conditionType: acc.conditionType,
      receipts: [],
      daysOfDelay: diasAtrasoParcela(acc.due, today),
      foraDaCobranca: true
    };
    let bill = porTitulo.get(acc.billId);
    if (!bill) {
      bill = {
        id: acc.billId,
        saleId: Number(acc.billId) || acc.billId,
        realSaleId: null,
        customerId: acc.customerId,
        clientName: acc.clientName,
        companyId: acc.companyId,
        costCentersId: acc.costCenterId ? [acc.costCenterId] : [],
        costCenterId: acc.costCenterId,
        units: acc.units,
        value: 0,
        interest: 0,
        fine: 0,
        daysDelay: 0,
        slipStatus: "Vencido",
        subjudice: "N",
        defaulterInstallments: [],
        defaulterJudicialActivities: [],
        totalInstallmentsCount: 0,
        foraDaCobranca: true
      };
      porTitulo.set(acc.billId, bill);
      normalized.push(bill);
    }
    bill.defaulterInstallments = bill.defaulterInstallments || [];
    bill.defaulterInstallments.push(inst);
    bill.totalInstallmentsCount = (Number(bill.totalInstallmentsCount) || 0) + 1;
    const open = summarizeOpenDefaulterBill(bill);
    bill.value = open.value;
    bill.interest = open.interest;
    bill.fine = open.fine;
    bill.daysDelay = open.daysDelay;
    bill.defaulterInstallments = open.installments || bill.defaulterInstallments;
    if (acc.instId) porId.add(acc.billId + "|" + acc.instId);
    porVencimento.add(acc.billId + "|" + acc.due);
    acrescentadas += 1;
  });
  return acrescentadas;
}

function mesclarTitulosInadimplentes(bills) {
  const porId = new Map();
  const semId = [];
  (bills || []).forEach((bill) => {
    if (!bill) return;
    const id = String(bill.receivableBillId || bill.id || "");
    if (!id) { semId.push(bill); return; }
    const prev = porId.get(id);
    if (!prev) { porId.set(id, bill); return; }
    const insts = new Map();
    const add = (inst) => {
      if (!inst) return;
      const key = String(inst.installmentId || inst.id || "") + "|" + String(inst.dueDate || "").slice(0, 10);
      const cur = insts.get(key);
      const v = Number(inst.correctedValueWithAdditions);
      const cv = cur ? Number(cur.correctedValueWithAdditions) : -1;
      if (!cur || (Number.isFinite(v) && v > cv)) insts.set(key, inst);
    };
    (prev.defaulterInstallments || []).forEach(add);
    (bill.defaulterInstallments || []).forEach(add);
    prev.defaulterInstallments = Array.from(insts.values());
    if ((!prev.underJudgmentInstallments || !prev.underJudgmentInstallments.length) && bill.underJudgmentInstallments && bill.underJudgmentInstallments.length) {
      prev.underJudgmentInstallments = bill.underJudgmentInstallments;
    }
  });
  return Array.from(porId.values()).concat(semId);
}

function mesclarNormalizados(bills) {
  const porId = new Map();
  (bills || []).forEach((bill) => {
    if (!bill) return;
    const id = String(bill.id || bill.saleId || "");
    if (!id) return;
    const prev = porId.get(id);
    if (!prev) { porId.set(id, bill); return; }
    const insts = new Map();
    const add = (inst) => {
      if (!inst) return;
      const key = String(inst.installmentId || inst.id || "") + "|" + String(inst.dueDate || "").slice(0, 10);
      const cur = insts.get(key);
      const v = Number(inst.correctedValueWithAdditions != null ? inst.correctedValueWithAdditions : inst.currentBalanceWithAddition);
      const cv = cur ? Number(cur.correctedValueWithAdditions != null ? cur.correctedValueWithAdditions : cur.currentBalanceWithAddition) : -1;
      if (!cur || (Number.isFinite(v) && v >= cv)) insts.set(key, inst);
    };
    (prev.defaulterInstallments || []).forEach(add);
    (bill.defaulterInstallments || []).forEach(add);
    prev.defaulterInstallments = Array.from(insts.values());
    const open = summarizeOpenDefaulterBill(prev);
    prev.value = open.value;
    prev.interest = open.interest;
    prev.fine = open.fine;
    prev.daysDelay = open.daysDelay;
    prev.defaulterInstallments = open.installments || prev.defaulterInstallments;
  });
  return Array.from(porId.values()).filter((b) => (b.daysDelay || 0) > 0 && (b.value || 0) > 0.009);
}

/** Posição do dia do Dashboard de cobrança, no mesmo formato que a tela grava ao abrir a fila. */
async function salvarSnapshotCobranca(today, bills) {
  const lista = Array.isArray(bills) ? bills : [];
  if (!lista.length) return "sem títulos";
  const d = new Date(today + "T12:00:00-03:00");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  let uteis = 0;
  let segundo = 0;
  for (let day = 1; day <= 31; day++) {
    const cur = new Date(Date.UTC(y, m, day, 15, 0, 0));
    if (cur.getUTCMonth() !== m) break;
    const wd = cur.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    uteis += 1;
    if (uteis === 2) { segundo = day; break; }
  }
  const wd = d.getUTCDay();
  let totalValue = 0;
  let subjudiceCount = 0;
  let subjudiceValue = 0;
  const companyMap = {};
  const operatorMap = {};
  const clientes = new Set();
  const sjClients = {};
  const sjCenters = {};
  lista.forEach((b) => {
    const billVal = Number(b.value != null ? b.value : b.overdueValue) || 0;
    totalValue += billVal;
    if (b.customerId != null) clientes.add(String(b.customerId));
    const sub = b.subjudice === "S" || b.subjudice === true;
    if (sub) {
      subjudiceCount += 1;
      subjudiceValue += billVal;
    }
    const compId = b.companyId != null ? String(b.companyId) : "N/D";
    if (!companyMap[compId]) {
      companyMap[compId] = {
        company_id: b.companyId,
        count: 0,
        value: 0,
        cost_centers: {},
        aging: {
          d0_30: { count: 0, value: 0 },
          d31_60: { count: 0, value: 0 },
          d61_90: { count: 0, value: 0 },
          d91_120: { count: 0, value: 0 },
          d120p: { count: 0, value: 0 }
        }
      };
    }
    const comp = companyMap[compId];
    comp.count += 1;
    comp.value += billVal;
    const cc = String(b.costCenterId || "N/D");
    if (!comp.cost_centers[cc]) comp.cost_centers[cc] = { id: cc, count: 0, value: 0 };
    comp.cost_centers[cc].count += 1;
    comp.cost_centers[cc].value += billVal;
    const delay = Number(b.daysDelay != null ? b.daysDelay : b.maxDaysDelay) || 0;
    const agingKey = delay <= 30 ? "d0_30" : delay <= 60 ? "d31_60" : delay <= 90 ? "d61_90" : delay <= 120 ? "d91_120" : "d120p";
    comp.aging[agingKey].count += 1;
    comp.aging[agingKey].value += billVal;
    const opName = String(b.assignedOperator || "NÃO ATRIBUÍDO").toUpperCase().trim();
    if (!operatorMap[opName]) operatorMap[opName] = { name: opName, total_count: 0, total_value: 0, above31_count: 0, above31_value: 0 };
    operatorMap[opName].total_count += 1;
    operatorMap[opName].total_value += billVal;
    if (delay >= 31) {
      operatorMap[opName].above31_count += 1;
      operatorMap[opName].above31_value += billVal;
    }
    if (!sub) return;
    const cid = String(b.customerId || "");
    if (!cid) return;
    if (!sjClients[cid]) {
      sjClients[cid] = {
        id: cid,
        name: b.clientName || b.customerName || "",
        value: 0,
        titles: 0,
        cc: cc
      };
    }
    sjClients[cid].value += billVal;
    sjClients[cid].titles += 1;
    if (!sjCenters[cc]) sjCenters[cc] = { id: cc, value: 0, titles: 0, clients: 0 };
    sjCenters[cc].value += billVal;
    sjCenters[cc].titles += 1;
  });
  Object.keys(sjClients).forEach((cid) => {
    const c = sjClients[cid];
    if (sjCenters[c.cc]) sjCenters[c.cc].clients += 1;
  });
  const ref = doc(db, "inadimplencia_snapshots", today);
  let prev = null;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) prev = snap.data() || {};
  } catch (e) {}
  if (prev) {
    const prevVal = Number(prev.total_value) || 0;
    const prevCnt = Number(prev.total_count) || 0;
    if ((prevVal > 0 && totalValue < prevVal * 0.85) || (prevCnt > 0 && lista.length < prevCnt * 0.85)) {
      return "mantido: carga menor que a do dia";
    }
  }
  const payload = {
    date: today,
    is_month_close: segundo > 0 && d.getUTCDate() === segundo,
    is_week_start: wd === 1,
    is_week_end: wd === 5,
    total_count: lista.length,
    total_customers: clientes.size,
    total_value: totalValue,
    avg_ticket: lista.length ? totalValue / lista.length : 0,
    subjudice_count: subjudiceCount,
    subjudice_customers: Object.keys(sjClients).length,
    subjudice_value: subjudiceValue,
    subjudice_detail: {
      clients: Object.keys(sjClients).map((k) => sjClients[k]),
      cost_centers: Object.keys(sjCenters).map((k) => sjCenters[k])
    },
    new_count: 0,
    recovered_count: 0,
    data_json: {
      companies: Object.keys(companyMap).map((k) => {
        const c = companyMap[k];
        return Object.assign({}, c, { cost_centers: Object.keys(c.cost_centers).map((id) => c.cost_centers[id]) });
      }),
      operators: Object.keys(operatorMap).map((k) => operatorMap[k])
    },
    saved_at: new Date().toISOString(),
    source_count: lista.length,
    source: "morning-7h"
  };
  if (prev && prev.sprint_clients != null && prev.sprint_titles != null && prev.sprint_value != null) {
    payload.total_value = Number(prev.sprint_value) || prev.total_value;
    payload.total_customers = Number(prev.sprint_clients) || prev.total_customers;
    payload.total_count = Number(prev.sprint_titles) || prev.total_count;
    payload.sprint_value = prev.sprint_value;
    payload.sprint_clients = prev.sprint_clients;
    payload.sprint_titles = prev.sprint_titles;
    payload.sprint_avg_delay = prev.sprint_avg_delay;
    payload.sprint_saved_at = prev.sprint_saved_at;
  }
  await setDoc(ref, payload, { merge: true });
  return lista.length + " títulos";
}

function buildDefaulterQuery(cId, today, extraParams, billTypeParams) {
  return `${SIENGE_BULK_BASE}/bulk-data/v1/defaulters-receivable-bills?companyId=${cId}`
    + `&dueDateLimit=${today}&documentsId=CT&correctionDate=${today}`
    + billTypeParams
    + `&normalActivities=false&inBillingActivities=false&defaultersActivities=true&underJudgmentActivities=true`
    + `&includeResidueInstallment=true&includePartiallyPaidInstallments=true`
    + `&showOnlyDefaulters=false&includeUnderJudgment=true&showSentToSPCSerasa=true`
    + `&positionDate=${today}${extraParams}`;
}

async function loadConfigCustom() {
  try {
    const snap = await getDoc(doc(db, "config", "global"));
    if (!snap.exists()) return "{}";
    return snap.data().crm_empresas_custom || "{}";
  } catch (e) {
    return "{}";
  }
}

async function loadState(today) {
  const snap = await getDoc(doc(db, "sienge_defaulters_history", STATE_ID));
  if (!snap.exists()) return null;
  const s = snap.data();
  if (s.date !== today) return null;
  return s;
}

async function saveState(state) {
  await setDoc(doc(db, "sienge_defaulters_history", STATE_ID), state);
}

const CFIN_STATE_ID = "_cfin_state";
const CFIN_JSON_MAX = 700000;

function isoDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function parseIso(iso) {
  return new Date(String(iso).slice(0, 10) + "T12:00:00");
}

function shiftDays(iso, days) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

const CFIN_INICIO = "2026-01-01";
const CFIN_DIAS_API = 60;
const CFIN_CORTE_ID = "_corte";

function ymSeguinte(ym) {
  const parts = String(ym || "2025-12").split("-").map(Number);
  const d = new Date(parts[0], parts[1], 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function empresasGeridas(customRaw) {
  let custom = {};
  try {
    custom = typeof customRaw === "string" ? JSON.parse(customRaw || "{}") : (customRaw || {});
  } catch (e) {
    custom = {};
  }
  const ids = [];
  const seen = {};
  Object.keys(custom || {}).forEach((k) => {
    if (k === "_v2") return;
    const cfg = custom[k];
    if (!cfg || typeof cfg !== "object") return;
    const v = cfg.gerida_pelo_grupo != null ? cfg.gerida_pelo_grupo : cfg.gerida_grupo;
    const ligada = v === 1 || v === true || v === "1" || Number(v) === 1;
    if (!ligada) return;
    const id = String(cfg.company_id != null ? cfg.company_id : k);
    if (!/^\d+$/.test(id) || seen[id]) return;
    seen[id] = true;
    ids.push(id);
  });
  return ids;
}

/** Meses de 01/01/2026 até o dia que ficou fora dos últimos 60 dias. O mês do corte entra incompleto. */
function mesesHistorico(corte, ymFechado) {
  const out = [];
  if (!corte || corte < CFIN_INICIO) return out;
  let d = parseIso(CFIN_INICIO);
  const last = parseIso(corte);
  const fechadoAte = String(ymFechado || "2025-12");
  while (d <= last) {
    const monthStart = isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
    const monthEnd = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const ym = monthStart.slice(0, 7);
    const fechado = monthEnd <= corte;
    if (!(fechado && ym <= fechadoAte)) {
      out.push({
        ym: ym,
        start: monthStart < CFIN_INICIO ? CFIN_INICIO : monthStart,
        end: monthEnd < corte ? monthEnd : corte,
        companyId: "",
        fechado: fechado,
        tentativas: 0
      });
    }
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return out;
}

function outcomeUrl(start, end, companyId) {
  let url = `${SIENGE_BULK_BASE}/bulk-data/v1/outcome?startDate=${encodeURIComponent(start)}`
    + `&endDate=${encodeURIComponent(end)}`
    + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
  if (companyId) url += "&companyId=" + encodeURIComponent(companyId);
  return url;
}

function isTooBig(err) {
  return /\b507\b/.test(String((err && err.message) || ""));
}

async function continuarWarmup(req) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    await fetch(`${originFromReq(req)}/api/morning-warmup`, {
      headers: { Authorization: req.headers.authorization || "" },
      signal: ctrl.signal
    });
  } catch (e) {
  } finally {
    clearTimeout(timer);
  }
}

async function loadCfinState(today) {
  const snap = await getDoc(doc(db, "sienge_defaulters_history", CFIN_STATE_ID));
  if (!snap.exists()) return null;
  const s = snap.data() || {};
  if (s.date !== today) return null;
  return s;
}

async function saveCfinState(state) {
  await setDoc(doc(db, "sienge_defaulters_history", CFIN_STATE_ID), state);
}

function fatiarContas(lista) {
  const fatias = [];
  let atual = [];
  let tamanho = 2;
  (lista || []).forEach((row) => {
    let limpo = row;
    try { limpo = JSON.parse(JSON.stringify(row)); } catch (e) { limpo = null; }
    if (!limpo) return;
    const pedaco = JSON.stringify(limpo);
    if (atual.length && tamanho + pedaco.length > CFIN_JSON_MAX) {
      fatias.push(atual);
      atual = [];
      tamanho = 2;
    }
    atual.push(limpo);
    tamanho += pedaco.length + 1;
  });
  if (atual.length || !fatias.length) fatias.push(atual);
  return fatias;
}

async function gravarMesPago(companyId, ym, bills, extra) {
  const fatias = fatiarContas(bills);
  const n = fatias.reduce((s, fatia) => s + fatia.length, 0);
  const id = String(companyId) + "_" + ym;
  const base = {
    companyId: String(companyId),
    ym: ym,
    ate: extra && extra.ate ? extra.ate : "",
    fechado: !!(extra && extra.fechado),
    em: new Date().toISOString()
  };
  await setDoc(doc(db, "cfin_pagos", id), Object.assign({}, base, {
    n: n,
    partes: fatias.length,
    bills: fatias[0] || []
  }));
  for (let i = 1; i < fatias.length; i++) {
    await setDoc(doc(db, "cfin_pagos", id + "_p" + (i + 1)), {
      companyId: String(companyId),
      ym: ym,
      parte: i + 1,
      bills: fatias[i]
    });
  }
}

async function gravarMesEmpresas(companies, ym, bills, extra) {
  const grupos = {};
  (companies || []).forEach((id) => { grupos[String(id)] = []; });
  (bills || []).forEach((bill) => {
    const id = String(bill && bill.companyId != null ? bill.companyId : "");
    if (!/^\d+$/.test(id)) return;
    if (!grupos[id]) grupos[id] = [];
    grupos[id].push(bill);
  });
  const ids = Object.keys(grupos);
  for (let i = 0; i < ids.length; i++) {
    await gravarMesPago(ids[i], ym, grupos[ids[i]], extra);
  }
  return ids.length;
}

async function marcarCorte(ate, ymFechado) {
  await setDoc(doc(db, "cfin_pagos", CFIN_CORTE_ID), {
    ate: ate || "",
    ymFechado: ymFechado || "2025-12",
    em: new Date().toISOString()
  });
}

async function fetchOutcomeBills(start, end, companyId) {
  const res = await siengeFetch(outcomeUrl(start, end, companyId), 3);
  return (res && res.data) || [];
}

/**
 * Grava no Firebase as contas de 01/01/2026 até o dia que saiu dos últimos 60 dias.
 * Mês já fechado não volta para o Sienge. O mês do corte é regravado todo dia, e o corte anda um dia.
 * Roda depois da fila, na mesma rotina das 7h.
 */
async function advanceControleFinanceiro(req, res, today, started, log) {
  const corte = shiftDays(today, -CFIN_DIAS_API);
  let state = await loadCfinState(today);
  if (state && state.mode !== "cfin-60") state = null;
  if (state && state.ready) {
    return res.status(200).json({
      done: true,
      filaPronta: true,
      date: today,
      step: "cfin",
      ready: true,
      corte: state.corte || corte,
      message: "Base do controle financeiro já gravada até " + (state.corte || corte) + ".",
      log
    });
  }
  if (!state) {
    let companies = empresasGeridas(await loadConfigCustom());
    if (!companies.length) {
      try {
        const list = await fetchAllPages("/companies");
        companies = [...new Set(list.map((c) => String(c.id || c.companyId || "")).filter((id) => /^\d+$/.test(id)))];
      } catch (e) {
        log.push("empresas: " + e.message);
      }
    }
    let ymFechado = "2025-12";
    try {
      const corteSnap = await getDoc(doc(db, "cfin_pagos", CFIN_CORTE_ID));
      if (corteSnap.exists()) ymFechado = String((corteSnap.data() || {}).ymFechado || ymFechado);
    } catch (e) {}
    const pairs = mesesHistorico(corte, ymFechado);
    state = {
      date: today,
      mode: "cfin-60",
      corte: corte,
      companies: companies,
      pairs: pairs,
      index: 0,
      ymFechado: ymFechado,
      failed: 0,
      ready: pairs.length === 0
    };
    log.push("corte " + corte + " · " + pairs.length + " meses · " + companies.length + " empresas");
    if (!pairs.length) {
      await saveCfinState(state);
      log.push("nada novo até " + corte);
    }
  }
  if (!Array.isArray(state.pairs)) state.pairs = [];
  if (!Array.isArray(state.companies)) state.companies = [];

  while (state.index < state.pairs.length && Date.now() - started < BUDGET_MS - 8000) {
    const pair = state.pairs[state.index];
    if (!pair.companyId && !(state.companies || []).length) {
      pair.tentativas = (Number(pair.tentativas) || 0) + 1;
      log.push("sem empresas para gravar " + pair.ym);
      if (pair.tentativas < 3) break;
      state.furos = state.furos || [];
      if (!state.furos.includes(pair.ym)) state.furos.push(pair.ym);
      state.index += 1;
      continue;
    }
    try {
      const bills = (await fetchOutcomeBills(pair.start, pair.end, pair.companyId)).filter((bill) => {
        const d = String((bill && bill.dueDate) || "").slice(0, 10);
        return !d || (d >= pair.start && d <= pair.end);
      });
      const extra = { ate: pair.end, fechado: !!pair.fechado };
      if (pair.companyId) {
        await gravarMesPago(pair.companyId, pair.ym, bills, extra);
        log.push("empresa " + pair.companyId + " " + pair.ym + " " + pair.start + ".." + pair.end + ": " + bills.length);
      } else {
        const n = await gravarMesEmpresas(state.companies, pair.ym, bills, extra);
        log.push(pair.ym + " " + pair.start + ".." + pair.end + ": " + bills.length + " títulos em " + n + " empresas");
      }
      state.index += 1;
      const ainda = state.pairs.slice(state.index).some((p) => p && p.ym === pair.ym);
      if (!ainda) {
        const esperado = ymSeguinte(state.ymFechado || "2025-12");
        if (pair.fechado && pair.ym === esperado && !(state.furos || []).includes(pair.ym)) {
          state.ymFechado = pair.ym;
        }
        await marcarCorte(pair.end, state.ymFechado || "2025-12");
      }
    } catch (e) {
      if (isTooBig(e) && pair.start < pair.end) {
        const s = parseIso(pair.start);
        const en = parseIso(pair.end);
        const mid = new Date(s.getTime() + Math.floor((en - s) / 2));
        const midIso = isoDate(mid);
        const next = shiftDays(midIso, 1);
        if (midIso >= pair.start && midIso < pair.end && next <= pair.end) {
          state.pairs.splice(state.index, 1,
            Object.assign({}, pair, { start: pair.start, end: midIso, tentativas: 0 }),
            Object.assign({}, pair, { start: next, end: pair.end, tentativas: 0 })
          );
          log.push("divide " + pair.start + ".." + pair.end);
          continue;
        }
      }
      if (isTooBig(e) && !pair.companyId && state.companies && state.companies.length) {
        state.pairs.splice(state.index, 1, ...state.companies.map((cid) => Object.assign({}, pair, {
          companyId: String(cid),
          tentativas: 0
        })));
        log.push("divide empresas " + pair.ym);
        continue;
      }
      pair.tentativas = (Number(pair.tentativas) || 0) + 1;
      log.push("falha " + (pair.companyId || "todas") + " " + pair.ym + ": " + e.message);
      if (pair.tentativas < 3) break;
      state.failed = (Number(state.failed) || 0) + 1;
      state.furos = state.furos || [];
      if (!state.furos.includes(pair.ym)) state.furos.push(pair.ym);
      state.index += 1;
    }
  }

  if (state.index >= state.pairs.length) {
    state.ready = true;
    await saveCfinState(state);
    log.push("base pronta até " + corte);
  } else {
    await saveCfinState(state);
    log.push("segue " + state.index + "/" + state.pairs.length);
  }

  const finished = !!state.ready;
  if (!finished) {
    await continuarWarmup(req);
    return res.status(200).json({
      done: false,
      filaPronta: true,
      date: today,
      step: "cfin",
      ready: !!state.ready,
      index: state.index,
      total: state.pairs.length,
      log
    });
  }
  const advancePainelDiario = require("./painel-diario");
  return advancePainelDiario({
    req: req,
    res: res,
    today: today,
    started: started,
    log: log,
    db: db,
    fetchAllPages: fetchAllPages,
    continuar: function () { return continuarWarmup(req); }
  });
}

module.exports = async function handler(req, res) {
  if (String(req.url || "").indexOf("caucao-batimento") >= 0) return caucaoHandler(req, res);
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  await dispararCaucao(req);

  const force = !!(req.query && (req.query.force === "1" || req.query.force === "true"));
  const today = todayIsoSP();
  const started = Date.now();
  const log = [];

  try {
    const metaToday = await getDoc(doc(db, "sienge_defaulters_history", today));
    if (!force && metaToday.exists() && metaToday.data() && metaToday.data().warmupDone) {
      return advanceControleFinanceiro(req, res, today, started, log);
    }

    let state = await loadState(today);
    if (!state) {
      state = { date: today, step: "customers", companyIndex: 0, batchIndex: 0, companies: [], incomeIndex: 0, warmupChunks: [], incomeChunks: [] };
    }

    if (state.step === "customers") {
      const base = originFromReq(req);
      try {
        const syncRes = await fetch(`${base}/api/sync-customers`, { headers: { Authorization: req.headers.authorization || "" } });
        const body = await syncRes.text();
        log.push("sync-customers: " + body.slice(0, 180));
      } catch (e) {
        log.push("sync-customers falhou: " + e.message);
      }
      state.step = "defaulters";
      await saveState(state);
      if (Date.now() - started > BUDGET_MS) {
        return res.status(200).json({ done: false, date: today, step: state.step, log });
      }
    }

    if (state.step === "defaulters") {
      const customRaw = await loadConfigCustom();
      const companies = internalCompanyIds(customRaw);
      state.companies = companies;
      const costCenters = await fetchAllPages("/cost-centers");
      while (state.step === "defaulters" && Date.now() - started < BUDGET_MS - 8000) {
        const cId = companies[state.companyIndex];
        if (cId == null) {
          state.step = "income";
          break;
        }
        const companyCcs = costCenters
          .filter((cc) => Number(cc.companyId) === Number(cId))
          .map((cc) => String(cc.id || cc.costCenterId || "").trim())
          .filter(Boolean)
          .filter((id) => Number(cId) === 1 ? true : (id.startsWith("1") || id.startsWith("2") || id.startsWith("3")));
        const ccBatches = [];
        if (!companyCcs.length) ccBatches.push([]);
        else {
          for (let i = 0; i < companyCcs.length; i += BATCH_CC) ccBatches.push(companyCcs.slice(i, i + BATCH_CC));
        }
        const batch = ccBatches[state.batchIndex] || [];
        const extraParams = batch.length ? `&enterpriseId=${batch.join(",")}` : "";
        const qAll = buildDefaulterQuery(cId, today, extraParams, "&normalReceivableBills=true&inBillingReceivableBills=true&defaultersReceivableBills=true&underJudgmentReceivableBills=true");
        const qJudge = buildDefaulterQuery(cId, today, extraParams, "&normalReceivableBills=false&inBillingReceivableBills=false&defaultersReceivableBills=false&underJudgmentReceivableBills=true");
        let rawAll = [];
        let rawJudge = [];
        let allOk = false;
        let judgeOk = false;
        try {
          const resAll = await siengeFetch(qAll);
          const allRows = linhasBulk(resAll);
          if (allRows) {
            rawAll = allRows;
            allOk = true;
          }
        } catch (e) {
          log.push(`defaulters emp ${cId} lote ${state.batchIndex}: ${e.message}`);
        }
        if (allOk) {
          try {
            await new Promise((r) => setTimeout(r, 1000));
            const resJudge = await siengeFetch(qJudge);
            const judgeRows = linhasBulk(resJudge);
            if (judgeRows) {
              rawJudge = judgeRows;
              judgeOk = true;
            }
          } catch (e) {
            log.push(`sub judice emp ${cId} lote ${state.batchIndex}: ${e.message}`);
          }
        }
        const under = new Set(rawJudge.map((b) => idTitulo(b)).filter(Boolean));
        if (rawAll.length && !judgeOk) {
          log.push(`emp ${cId} lote ${state.batchIndex + 1}: sub judice não confirmado`);
        }
        const idsNaCarteira = new Set(rawAll.map((b) => String(b.receivableBillId || b.id || "")));
        rawJudge.forEach((b) => {
          const id = String(b.receivableBillId || b.id || "");
          if (!id || idsNaCarteira.has(id)) return;
          idsNaCarteira.add(id);
          rawAll.push(b);
        });
        rawAll = mesclarTitulosInadimplentes(rawAll);
        const normalized = rawAll.map((b) => normalizeBill(b, under)).filter((b) => b.subjudice === "S" || (b.daysDelay > 0 && (b.value || 0) > 0.009));
        let foraDaCobranca = 0;
        for (const cc of batch) {
          try {
            const rows = await fetchExtratoVencidoCc(cc, today);
            foraDaCobranca += incluirParcelasForaDaCobranca(normalized, rows, today, cId);
          } catch (e) {
            log.push(`extrato ${cc}: ${e.message}`);
          }
        }
        const prontos = normalized.filter((b) => b.subjudice === "S" || (b.daysDelay > 0 && (b.value || 0) > 0.009));
        log.push(`emp ${cId} lote ${state.batchIndex + 1}: ${foraDaCobranca} parcela(s) sem cobrança`);
        const chunkId = `${today}_warmup_${cId}_${state.batchIndex}`;
        await setDoc(doc(db, "sienge_defaulters_history", chunkId), {
          date: today,
          companyId: cId,
          batchIndex: state.batchIndex,
          data: JSON.stringify(prontos)
        });
        state.warmupChunks = state.warmupChunks || [];
        state.warmupChunks.push(chunkId);
        log.push(`emp ${cId} lote ${state.batchIndex + 1}/${ccBatches.length}: ${prontos.length} títulos`);
        state.batchIndex += 1;
        if (state.batchIndex >= ccBatches.length) {
          state.companyIndex += 1;
          state.batchIndex = 0;
        }
        if (state.companyIndex >= companies.length) state.step = "income";
        await saveState(state);
      }
      await saveState(state);
      if (state.step === "defaulters") {
        return res.status(200).json({ done: false, filaPronta: false, date: today, step: state.step, companyIndex: state.companyIndex, batchIndex: state.batchIndex, log });
      }
    }

    if (state.step === "income") {
      const companies = state.companies && state.companies.length ? state.companies : internalCompanyIds(await loadConfigCustom());
      const chunks = [];
      const now = new Date(`${today}T12:00:00-03:00`);
      for (let i = 0; i < 30; i += 6) {
        const end = new Date(now);
        end.setDate(end.getDate() - i);
        const start = new Date(now);
        start.setDate(start.getDate() - Math.min(i + 5, 29));
        const iso = (d) => d.toISOString().slice(0, 10);
        chunks.push({ start: iso(start), end: iso(end) });
      }
      const pairs = [];
      companies.forEach((cid) => chunks.forEach((ch) => pairs.push({ cid, ...ch })));
      while (state.step === "income" && Date.now() - started < BUDGET_MS - 8000) {
        const idx = state.incomeIndex || 0;
        if (idx >= pairs.length) {
          state.step = "finalize";
          break;
        }
        const p = pairs[idx];
        let paidEntries = [];
        try {
          const url = `${SIENGE_BULK_BASE}/bulk-data/v1/income?startDate=${p.start}&endDate=${p.end}&selectionType=P&companyId=${p.cid}`;
          const resInc = await siengeFetch(url);
          const rows = (resInc && resInc.data) || [];
          paidEntries = collectIncomePaidEntries(rows, today);
        } catch (e) {
          log.push("income: " + e.message);
        }
        await setDoc(doc(db, "sienge_defaulters_history", `${today}_income_${idx}`), {
          date: today, idx, data: JSON.stringify(paidEntries)
        });
        state.incomeChunks = state.incomeChunks || [];
        state.incomeChunks.push(`${today}_income_${idx}`);
        state.incomeIndex = idx + 1;
        if (state.incomeIndex >= pairs.length) state.step = "finalize";
        await saveState(state);
        log.push(`income ${idx + 1}/${pairs.length}`);
      }
      await saveState(state);
      if (state.step === "income") {
        return res.status(200).json({ done: false, filaPronta: false, date: today, step: state.step, incomeIndex: state.incomeIndex, log });
      }
    }

    if (state.step === "finalize") {
      const billsRaw = [];
      const paidMerged = new Map();
      const toDelete = [...(state.warmupChunks || []), ...(state.incomeChunks || [])];
      for (const id of toDelete) {
        try {
          const snap = await getDoc(doc(db, "sienge_defaulters_history", id));
          if (!snap.exists()) continue;
          const d = snap.data() || {};
          if (id.indexOf("_warmup_") >= 0) {
            try { billsRaw.push(...JSON.parse(d.data || "[]")); } catch (e) {}
          } else {
            try {
              JSON.parse(d.data || "[]").forEach((pair) => {
                if (!pair || !pair[0]) return;
                const days = Number(pair[1]);
                if (!Number.isFinite(days)) return;
                const key = String(pair[0]);
                const cur = paidMerged.get(key);
                if (cur === undefined || days < cur) paidMerged.set(key, days);
              });
            } catch (e) {}
          }
        } catch (e) {}
      }
      const bills = mesclarNormalizados(billsRaw);
      const subCount = bills.filter((b) => b && b.subjudice === "S").length;
      if (bills.length >= 200 && subCount === 0) {
        log.push(`finalize adiado: ${bills.length} títulos e nenhum sub judice`);
        await saveState(state);
        return res.status(200).json({ done: false, filaPronta: false, date: today, step: "finalize", log });
      }
      const paidMap = Array.from(paidMerged.entries());
      const CHUNK = 100;
      const numChunks = Math.max(1, Math.ceil(bills.length / CHUNK));
      for (let i = 0; i < numChunks; i++) {
        const slice = bills.slice(i * CHUNK, (i + 1) * CHUNK);
        await setDoc(doc(db, "sienge_defaulters_history", `${today}_chunk_${i}`), { data: JSON.stringify(slice) });
      }
      const timestampStr = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await setDoc(doc(db, "sienge_defaulters_history", today), {
        date: today,
        chunks: numChunks,
        timestampStr,
        paidMap: JSON.stringify(paidMap.filter((x) => x && x[0])),
        companyIds: state.companies || [],
        warmupDone: true,
        cacheRev: DEFAULTERS_CACHE_REV,
        createdAt: new Date().toISOString()
      });
      for (const id of toDelete) {
        try { await deleteDoc(doc(db, "sienge_defaulters_history", id)); } catch (e) {}
      }
      state.step = "done";
      await saveState({ date: today, step: "done" });
      log.push(`finalize: ${bills.length} títulos, ${numChunks} chunks`);
      try {
        const snapMsg = await salvarSnapshotCobranca(today, bills);
        log.push("dashboard cobrança: " + snapMsg);
      } catch (e) {
        log.push("dashboard cobrança falhou: " + e.message);
      }
      return advanceControleFinanceiro(req, res, today, started, log);
    }

    return res.status(200).json({ done: state.step === "done", date: today, step: state.step, log });
  } catch (error) {
    console.error("[morning-warmup]", error);
    return res.status(500).json({ error: error.message, log });
  }
};
