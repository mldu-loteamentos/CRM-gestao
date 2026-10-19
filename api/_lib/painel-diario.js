const { doc, setDoc, getDoc } = require("firebase/firestore");

const COM_COL = "comercial_batimento";
const VIS_COL = "vistoria_batimento";
const JSON_MAX = 650000;

function pad(n) {
  return String(n).padStart(2, "0");
}

function monthsUntil(today) {
  const d = new Date(String(today).slice(0, 10) + "T12:00:00-03:00");
  const endY = d.getFullYear();
  const endM = d.getMonth() + 1;
  const out = [];
  for (let y = endY - 3; y <= endY; y++) {
    const last = y === endY ? endM : 12;
    for (let m = 1; m <= last; m++) out.push({ year: y, month: m, id: y + "-" + pad(m) });
  }
  return out;
}

function lastDay(year, month) {
  return pad(new Date(year, month, 0).getDate());
}

function slimUnit(u) {
  if (!u) return null;
  return {
    id: u.id || u.unitId || "",
    unitId: u.unitId || u.id || "",
    enterpriseId: u.enterpriseId || u.costCenterId || "",
    costCenterId: u.costCenterId || u.enterpriseId || "",
    enterpriseName: u.enterpriseName || "",
    privateArea: u.privateArea || u.indexedPrivateArea || u.totalArea || u.area || 0
  };
}

function slimContract(c) {
  if (!c) return null;
  const units = (c.salesContractUnits || c.units || []).map(slimUnit).filter(Boolean);
  return {
    id: c.id,
    enterpriseId: c.enterpriseId || c.costCenterId || "",
    costCenterId: c.costCenterId || c.enterpriseId || "",
    enterpriseName: c.enterpriseName || "",
    unitId: c.unitId || "",
    totalArea: c.totalArea || c.privateArea || c.indexedPrivateArea || 0,
    issueDate: String(c.issueDate || c.contractDate || c.saleDate || "").slice(0, 10),
    cancellationDate: String(c.cancellationDate || c.cancelDate || "").slice(0, 10),
    salesContractUnits: units
  };
}

async function fetchPages(fetchAllPages, path) {
  try {
    const rows = await fetchAllPages(path);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

async function fetchMonth(fetchAllPages, year, month) {
  const first = year + "-" + pad(month) + "-01";
  const last = year + "-" + pad(month) + "-" + lastDay(year, month);
  const [ativas, canceladas, quitadas, distratos] = await Promise.all([
    fetchPages(fetchAllPages, "/sales-contracts?situation=2&initialIssueDate=" + first + "&finalIssueDate=" + last),
    fetchPages(fetchAllPages, "/sales-contracts?situation=3&initialIssueDate=" + first + "&finalIssueDate=" + last),
    fetchPages(fetchAllPages, "/sales-contracts?situation=4&initialIssueDate=" + first + "&finalIssueDate=" + last),
    fetchPages(fetchAllPages, "/sales-contracts?situation=3&initialCancelDate=" + first + "&finalCancelDate=" + last)
  ]);
  const seen = new Set();
  const vendas = [];
  ativas.concat(canceladas).concat(quitadas).forEach((c) => {
    const id = String(c && c.id != null ? c.id : "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    const slim = slimContract(c);
    if (slim) vendas.push(slim);
  });
  return {
    year: year,
    month: month,
    vendas: vendas,
    distratos: distratos.map(slimContract).filter(Boolean)
  };
}

async function saveJsonParts(db, col, id, payload) {
  const raw = JSON.stringify(payload);
  const old = await getDoc(doc(db, col, id + "_parts"));
  const prev = old.exists() ? Number((old.data() || {}).parts) || 1 : 1;
  if (raw.length <= JSON_MAX) {
    await setDoc(doc(db, col, id), { data: raw, parts: 1, updatedAt: new Date().toISOString() });
    for (let i = 1; i < prev; i++) {
      try { await setDoc(doc(db, col, id + "_p" + i), { data: "[]" }); } catch (e) {}
    }
    return 1;
  }
  const parts = [];
  let buf = [];
  let size = 2;
  const items = payload.vendas ? null : payload;
  if (payload.vendas) {
    await setDoc(doc(db, col, id), {
      year: payload.year,
      month: payload.month,
      vendas: "[]",
      distratos: JSON.stringify(payload.distratos || []),
      splitVendas: true,
      updatedAt: new Date().toISOString()
    });
    const list = payload.vendas || [];
    for (let i = 0; i < list.length; i++) {
      const piece = JSON.stringify(list[i]);
      if (size + piece.length > JSON_MAX && buf.length) {
        parts.push(buf);
        buf = [];
        size = 2;
      }
      buf.push(list[i]);
      size += piece.length + 1;
    }
    if (buf.length) parts.push(buf);
    for (let i = 0; i < parts.length; i++) {
      await setDoc(doc(db, col, id + "_p" + i), { data: JSON.stringify(parts[i]) });
    }
    await setDoc(doc(db, col, id), {
      year: payload.year,
      month: payload.month,
      distratos: JSON.stringify(payload.distratos || []),
      splitVendas: true,
      parts: parts.length,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return parts.length;
  }
  for (let i = 0; i < items.length; i++) {
    const piece = JSON.stringify(items[i]);
    if (size + piece.length > JSON_MAX && buf.length) {
      parts.push(buf);
      buf = [];
      size = 2;
    }
    buf.push(items[i]);
    size += piece.length + 1;
  }
  if (buf.length) parts.push(buf);
  if (!parts.length) parts.push([]);
  for (let i = 0; i < parts.length; i++) {
    await setDoc(doc(db, col, id + "_p" + i), { data: JSON.stringify(parts[i]) });
  }
  await setDoc(doc(db, col, id + "_parts"), { parts: parts.length });
  return parts.length;
}

async function saveMonth(db, row) {
  const id = row.year + "-" + pad(row.month);
  const raw = JSON.stringify({ vendas: row.vendas, distratos: row.distratos });
  if (raw.length <= JSON_MAX) {
    await setDoc(doc(db, COM_COL, id), {
      year: row.year,
      month: row.month,
      vendas: JSON.stringify(row.vendas),
      distratos: JSON.stringify(row.distratos),
      splitVendas: false,
      updatedAt: new Date().toISOString()
    });
    return;
  }
  await saveJsonParts(db, COM_COL, id, row);
}

function clientFromBill(b, acc) {
  const sale = String(b.saleId || b.id || "");
  if (!sale) return;
  const cur = acc.get(sale) || {
    customerId: b.customerId || 0,
    customerName: b.clientName || "",
    saleId: b.saleId || b.id,
    contractId: b.saleId || b.id,
    id: b.saleId || b.id,
    billIds: [],
    saleCode: b.realSaleId || "",
    contractNumber: b.realSaleId || "",
    realSaleId: b.realSaleId || "",
    unitName: b.units || "",
    unit: b.units || "",
    companyId: b.companyId || "",
    costCenterId: b.costCenterId || "",
    maxDaysDelay: 0,
    billCount: 0,
    overdueValue: 0,
    overdueCharges: 0,
    subjudice: false
  };
  if (!cur.billIds.includes(String(b.id))) cur.billIds.push(String(b.id));
  cur.maxDaysDelay = Math.max(cur.maxDaysDelay, Number(b.daysDelay) || 0);
  cur.billCount += (b.defaulterInstallments && b.defaulterInstallments.length) || 1;
  cur.overdueValue += Number(b.value) || 0;
  cur.overdueCharges += (Number(b.interest) || 0) + (Number(b.fine) || 0);
  if (b.subjudice === "S" || b.subjudice === true) cur.subjudice = true;
  if (b.clientName) cur.customerName = b.clientName;
  acc.set(sale, cur);
}

async function buildVistoriaClients(db, today) {
  const meta = await getDoc(doc(db, "sienge_defaulters_history", today));
  if (!meta.exists()) return [];
  const n = Number((meta.data() || {}).chunks) || 0;
  const acc = new Map();
  for (let i = 0; i < n; i++) {
    const snap = await getDoc(doc(db, "sienge_defaulters_history", today + "_chunk_" + i));
    if (!snap.exists()) continue;
    let bills = [];
    try { bills = JSON.parse((snap.data() || {}).data || "[]"); } catch (e) { bills = []; }
    (bills || []).forEach((b) => clientFromBill(b, acc));
  }
  return Array.from(acc.values());
}

async function saveVistoria(db, today, clients) {
  const parts = [];
  let buf = [];
  let size = 2;
  for (let i = 0; i < clients.length; i++) {
    const piece = JSON.stringify(clients[i]);
    if (size + piece.length > JSON_MAX && buf.length) {
      parts.push(buf);
      buf = [];
      size = 2;
    }
    buf.push(clients[i]);
    size += piece.length + 1;
  }
  if (buf.length || !parts.length) parts.push(buf);
  for (let i = 0; i < parts.length; i++) {
    await setDoc(doc(db, VIS_COL, today + "_p" + i), { data: JSON.stringify(parts[i]) });
  }
  await setDoc(doc(db, VIS_COL, "_meta"), {
    date: today,
    parts: parts.length,
    total: clients.length,
    updatedAt: new Date().toISOString()
  });
}

module.exports = async function advancePainelDiario(ctx) {
  const { req, res, today, started, log, db, fetchAllPages, continuar } = ctx;
  const budget = 42000;
  const stateRef = doc(db, COM_COL, "_state");
  let state = null;
  try {
    const snap = await getDoc(stateRef);
    if (snap.exists() && (snap.data() || {}).date === today) state = snap.data();
  } catch (e) {}
  if (!state) {
    state = { date: today, step: "comercial", index: 0, months: monthsUntil(today).map((m) => m.id) };
  }
  if (state.step === "done") {
    return res.status(200).json({ done: true, filaPronta: true, date: today, step: "painel", log: log });
  }

  if (state.step === "comercial") {
    const months = state.months && state.months.length ? state.months : monthsUntil(today).map((m) => m.id);
    state.months = months;
    const id = months[state.index || 0];
    if (!id) {
      state.step = "vistoria";
    } else if (Date.now() - started < budget) {
      const parts = id.split("-");
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      try {
        const row = await fetchMonth(fetchAllPages, year, month);
        await saveMonth(db, row);
        log.push("comercial " + id + ": " + row.vendas.length + " vendas, " + row.distratos.length + " distratos");
      } catch (e) {
        log.push("comercial " + id + " falhou: " + e.message);
      }
      state.index = (state.index || 0) + 1;
      if (state.index >= months.length) state.step = "vistoria";
      await setDoc(stateRef, state);
    }
    if (state.step === "comercial") {
      await continuar();
      return res.status(200).json({ done: false, filaPronta: true, date: today, step: "comercial", index: state.index, total: state.months.length, log: log });
    }
  }

  if (state.step === "vistoria") {
    try {
      const clients = await buildVistoriaClients(db, today);
      await saveVistoria(db, today, clients);
      log.push("vistoria: " + clients.length + " contratos");
    } catch (e) {
      log.push("vistoria falhou: " + e.message);
    }
    state.step = "done";
    await setDoc(stateRef, state);
    await setDoc(doc(db, COM_COL, "_meta"), {
      date: today,
      done: true,
      months: state.months || [],
      updatedAt: new Date().toISOString()
    });
  }

  return res.status(200).json({ done: true, filaPronta: true, date: today, step: "painel", log: log });
};
