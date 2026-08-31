const { initializeApp } = require("firebase/app");
const {
  getFirestore, doc, setDoc, getDoc, deleteDoc
} = require("firebase/firestore");
const { isBusinessDaySP, todayIsoSP } = require("../lib/br-calendar");

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
  const allowed = [1, 2];
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

function normalizeBill(bill, underJudgmentIds) {
  let value = 0, interest = 0, fine = 0, daysDelay = 0;
  const installments = bill.defaulterInstallments || [];
  installments.forEach((inst) => {
    if (inst.correctedValueWithAdditions !== undefined) {
      value += inst.correctedValueWithAdditions;
    } else {
      value += inst.correctedValueWithoutAdditions !== undefined ? inst.correctedValueWithoutAdditions : (inst.value || 0);
      interest += inst.interest || 0;
      fine += inst.fine || 0;
    }
    const delay = inst.daysOfDelay !== undefined ? inst.daysOfDelay : (inst.daysDelay || 0);
    if (delay > daysDelay) daysDelay = delay;
  });
  return {
    id: bill.receivableBillId || String(bill.id),
    saleId: bill.receivableBillId ? Number(bill.receivableBillId) : (bill.saleId || 100),
    realSaleId: bill.saleId,
    customerId: bill.clientId ? Number(bill.clientId) : (bill.customerId || 0),
    clientName: bill.clientName || `Cliente #${bill.clientId}`,
    companyId: bill.companyId,
    costCentersId: bill.costCentersId || [],
    costCenterId: bill.costCenterId || (bill.costCentersId && bill.costCentersId[0]) || null,
    units: bill.units || "N/D",
    value, interest, fine, daysDelay,
    slipStatus: "Vencido",
    subjudice: underJudgmentIds.has(String(bill.receivableBillId || bill.id)) ? "S" : "N",
    defaulterInstallments: installments,
    defaulterJudicialActivities: bill.defaulterJudicialActivities || [],
    totalInstallmentsCount: (bill.defaulterInstallments ? bill.defaulterInstallments.length : 0)
      + (bill.normalInstallments ? bill.normalInstallments.length : 0)
      + (bill.inBillingInstallments ? bill.inBillingInstallments.length : 0)
      + (bill.underJudgmentInstallments ? bill.underJudgmentInstallments.length : 0)
  };
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

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const force = !!(req.query && (req.query.force === "1" || req.query.force === "true"));
  const day = isBusinessDaySP();
  if (!force && !day.ok) {
    return res.status(200).json({
      skipped: true,
      reason: day.reason,
      date: todayIsoSP(),
      message: "Fim de semana ou feriado: warmup só roda se alguém acessar o CRM."
    });
  }

  const today = todayIsoSP();
  const started = Date.now();
  const log = [];

  try {
    const metaToday = await getDoc(doc(db, "sienge_defaulters_history", today));
    if (!force && metaToday.exists() && metaToday.data() && metaToday.data().warmupDone) {
      return res.status(200).json({ done: true, skipped: false, date: today, message: "Cache do dia já gerado pelo warmup." });
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
      const cId = companies[state.companyIndex];
      if (cId == null) {
        state.step = "income";
        await saveState(state);
      } else {
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
        try {
          const resAll = await siengeFetch(qAll);
          await new Promise((r) => setTimeout(r, 1000));
          const resJudge = await siengeFetch(qJudge);
          rawAll = resAll.data || [];
          rawJudge = resJudge.data || [];
        } catch (e) {
          log.push(`defaulters emp ${cId} lote ${state.batchIndex}: ${e.message}`);
        }
        const under = new Set(rawJudge.map((b) => String(b.receivableBillId || b.id)));
        const normalized = rawAll.map((b) => normalizeBill(b, under)).filter((b) => b.daysDelay > 0);
        const chunkId = `${today}_warmup_${cId}_${state.batchIndex}`;
        await setDoc(doc(db, "sienge_defaulters_history", chunkId), {
          date: today,
          companyId: cId,
          batchIndex: state.batchIndex,
          data: JSON.stringify(normalized)
        });
        state.warmupChunks = state.warmupChunks || [];
        state.warmupChunks.push(chunkId);
        log.push(`emp ${cId} lote ${state.batchIndex + 1}/${ccBatches.length}: ${normalized.length} títulos`);
        state.batchIndex += 1;
        if (state.batchIndex >= ccBatches.length) {
          state.companyIndex += 1;
          state.batchIndex = 0;
        }
        if (state.companyIndex >= companies.length) state.step = "income";
        await saveState(state);
        if (Date.now() - started > BUDGET_MS || state.step === "defaulters") {
          return res.status(200).json({ done: false, date: today, step: state.step, companyIndex: state.companyIndex, batchIndex: state.batchIndex, log });
        }
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
      const idx = state.incomeIndex || 0;
      if (idx >= pairs.length) {
        state.step = "finalize";
        await saveState(state);
      } else {
        const p = pairs[idx];
        let paidEntries = [];
        try {
          const url = `${SIENGE_BULK_BASE}/bulk-data/v1/income?startDate=${p.start}&endDate=${p.end}&selectionType=P&companyId=${p.cid}`;
          const resInc = await siengeFetch(url);
          const rows = (resInc && resInc.data) || [];
          paidEntries = rows.map((item) => [String(item.customerId || item.clientId || ""), item.paymentDate || item.receiptDate || ""]);
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
        if (state.step !== "finalize") {
          return res.status(200).json({ done: false, date: today, step: state.step, incomeIndex: state.incomeIndex, log });
        }
      }
    }

    if (state.step === "finalize") {
      const bills = [];
      const paidMap = [];
      const toDelete = [...(state.warmupChunks || []), ...(state.incomeChunks || [])];
      for (const id of toDelete) {
        try {
          const snap = await getDoc(doc(db, "sienge_defaulters_history", id));
          if (!snap.exists()) continue;
          const d = snap.data() || {};
          if (id.indexOf("_warmup_") >= 0) {
            try { bills.push(...JSON.parse(d.data || "[]")); } catch (e) {}
          } else {
            try { paidMap.push(...JSON.parse(d.data || "[]")); } catch (e) {}
          }
        } catch (e) {}
      }
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
        warmupDone: true,
        createdAt: new Date().toISOString()
      });
      for (const id of toDelete) {
        try { await deleteDoc(doc(db, "sienge_defaulters_history", id)); } catch (e) {}
      }
      state.step = "done";
      await saveState({ date: today, step: "done" });
      log.push(`finalize: ${bills.length} títulos, ${numChunks} chunks`);
      return res.status(200).json({ done: true, date: today, bills: bills.length, log });
    }

    return res.status(200).json({ done: state.step === "done", date: today, step: state.step, log });
  } catch (error) {
    console.error("[morning-warmup]", error);
    return res.status(500).json({ error: error.message, log });
  }
};
