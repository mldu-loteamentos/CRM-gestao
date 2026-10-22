const { initializeApp } = require("firebase/app");
const {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, deleteDoc
} = require("firebase/firestore");
const { todayIsoSP } = require("../../lib/br-calendar");
const { slimCaixaRow, isFinanceLike } = require("../../lib/caixa-snapshot");
const {
  isFinanceUnit,
  isSettledUnit,
  extractRows,
  flattenStatements,
  classifyCustomerUnits,
  planBatimentoWork,
  stampInadimplenteFromFila,
  filaOverdueForUnit,
  needsCensus
} = require("../../lib/estoque-batimento-core");

const SIENGE_DOMAIN = "mouraleite";
const SIENGE_USER = "mouraleite-contas-a-pagar";
const SIENGE_PASS = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj";
const SIENGE_AUTH = "Basic " + Buffer.from(`${SIENGE_USER}:${SIENGE_PASS}`).toString("base64");
const SIENGE_API_BASE = `https://api.sienge.com.br/${SIENGE_DOMAIN}/public/api/v1`;

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

const FB_COL = "estoque_comercial";
const STATE_ID = "_batimento_state";
const FB_CHUNK = 400;
/** Firestore recusa documento acima de 1 MiB. */
const FB_DOC_BYTES = 650000;
/** maxDuration é 60s: sobra tempo para ler e gravar o estoque no Firebase. */
const BUDGET_MS = 30000;
const CONCURRENCY = 3;

/** Só pausa se BATIMENTO_PAUSED=1. O censo/diário já evita varredura cega. */
const BATIMENTO_PAUSED = process.env.BATIMENTO_PAUSED === "1";
const DELTA_DAYS = 5;

function authorized(req) {
  const secret = process.env.CRON_SECRET || process.env.WARMUP_SECRET;
  if (!secret) return true;
  const auth = String(req.headers.authorization || "");
  const q = req.query && (req.query.secret || req.query.token);
  return auth === `Bearer ${secret}` || String(q || "") === secret;
}

async function siengeFetch(url, retries = 4) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { Authorization: SIENGE_AUTH, Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`Sienge ${res.status}`);
        await new Promise((r) => setTimeout(r, Math.min(3000 * 2 ** i, 15000)));
        continue;
      }
      if (res.status === 404) return {};
      if (!res.ok) throw new Error(`Sienge ${res.status}: ${await res.text()}`);
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch (e) {
      last = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

async function loadUnits() {
  const colSnap = await getDocs(collection(db, FB_COL));
  const units = [];
  colSnap.forEach((d) => {
    if (d.id === "_meta" || d.id === STATE_ID) return;
    const data = d.data() || {};
    if (Array.isArray(data.units)) units.push(...data.units);
  });
  return units;
}

async function loadFilaAndPaidMap(today) {
  const metaSnap = await getDoc(doc(db, "sienge_defaulters_history", today));
  if (!metaSnap.exists()) return { bills: [], paidMap: new Map() };
  const meta = metaSnap.data() || {};
  const bills = [];
  const chunks = Number(meta.chunks) || 0;
  for (let i = 0; i < chunks; i++) {
    try {
      const snap = await getDoc(doc(db, "sienge_defaulters_history", `${today}_chunk_${i}`));
      if (!snap.exists()) continue;
      const raw = snap.data().data;
      const arr = typeof raw === "string" ? JSON.parse(raw || "[]") : (raw || []);
      if (Array.isArray(arr)) bills.push(...arr);
    } catch (e) {}
  }
  let paidMap = new Map();
  if (meta.paidMap) {
    try { paidMap = new Map(JSON.parse(meta.paidMap)); } catch (e) { paidMap = new Map(); }
  }
  return { bills, paidMap };
}

function chunkBySize(list) {
  const out = [];
  let cur = [];
  let bytes = 0;
  list.forEach((u) => {
    const size = JSON.stringify(u || null).length + 2;
    if (cur.length && (cur.length >= FB_CHUNK || bytes + size > FB_DOC_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(u);
    bytes += size;
  });
  if (cur.length) out.push(cur);
  return out;
}

const SOLD_CODES = new Set(["V", "O", "G", "P", "L"]);

function displayContract(u) {
  if (!u) return "";
  if (u.contractNumber != null && String(u.contractNumber).trim() !== "") return String(u.contractNumber);
  if (u.receivableBillId && String(u.receivableBillId) !== String(u.contractId || "")) return String(u.receivableBillId);
  return "";
}

function unitBalance(u) {
  if (!u) return null;
  if (u.presentDebitBalance != null && !Number.isNaN(Number(u.presentDebitBalance))) return Number(u.presentDebitBalance);
  if (u.outstandingBalance != null && !Number.isNaN(Number(u.outstandingBalance))) return Number(u.outstandingBalance);
  return null;
}

function needsContract(u) {
  if (!u || isSettledUnit(u)) return false;
  const code = String(u.commercialStock || "").toUpperCase();
  if (!SOLD_CODES.has(code) && !u.contractId) return false;
  if (!displayContract(u)) return true;
  return unitBalance(u) == null;
}

function normName(name) {
  return String(name || "").replace(/\s+/g, "").toUpperCase();
}

function normNameLoose(name) {
  return normName(name).replace(/-0+/g, "-").replace(/^0+/, "") || normName(name);
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

function isoDate(s) {
  if (!s) return null;
  const d = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function salePayable(c) {
  const v = c.outstandingBalance ?? c.currentBalance ?? c.balance ?? c.receivableBalance
    ?? c.totalOutstandingBalance ?? c.presentValue ?? c.debtBalance;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function contractInfoFromSale(c) {
  const mainCust = (c.salesContractCustomers || []).find((x) => x.main === true) || (c.salesContractCustomers || [])[0] || {};
  const num = c.number || c.contractNumber || c.documentNumber || c.salesContractNumber || "";
  const doc = mainCust.cpf || mainCust.cnpj || mainCust.cpfCnpj || c.customerCpf || c.customerCnpj || "";
  return {
    saleId: c.id,
    contractNumber: num ? String(num) : "",
    outstandingBalance: salePayable(c),
    contractValue: c.totalSellingValue || c.value || null,
    receivableBillId: c.receivableBillId || null,
    customerId: mainCust.id || c.customerId || null,
    customerDoc: String(doc || "").replace(/\D/g, ""),
    customerName: mainCust.name || c.customerName || "",
    situation: c.situation || c.status || ""
  };
}

function rememberContractNames(byName, raw, info) {
  if (!raw) return;
  const n = normName(raw);
  const l = normNameLoose(raw);
  if (n) byName[n] = info;
  if (l) byName[l] = info;
  const c = cleanUnitKey(raw);
  if (c) byName[c] = info;
}

async function fetchContractsForCc(ccId) {
  const byId = {};
  const byName = {};
  const bySaleId = {};
  const byNumber = {};
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const data = await siengeFetch(`${SIENGE_API_BASE}/sales-contracts?limit=200&offset=${offset}&enterpriseId=${encodeURIComponent(ccId)}`);
    const results = (data && data.results) || [];
    results.forEach((c) => {
      const info = contractInfoFromSale(c);
      if (c.id != null) bySaleId[String(c.id)] = info;
      if (info.contractNumber) byNumber[String(info.contractNumber)] = info;
      if (info.receivableBillId) byNumber[String(info.receivableBillId)] = info;
      const linked = c.salesContractUnits || c.units || c.salesContractBuildings || [];
      linked.forEach((su) => {
        const uid = su.unitId || su.buildingUnitId || su.id;
        if (uid) byId[String(uid)] = info;
        rememberContractNames(byName, su.name || su.unitName || su.unityName || su.unit, info);
      });
      if (c.unitId) byId[String(c.unitId)] = info;
      rememberContractNames(byName, c.unitName || c.unityName || c.unit, info);
    });
    if (results.length < 200) hasMore = false;
    else offset += results.length;
  }
  return { byId, byName, bySaleId, byNumber };
}

function pickSale(u, maps) {
  if (!u || !maps) return null;
  const clean = cleanUnitKey(u.name, u.enterpriseId);
  return maps.byId[String(u.id)]
    || (u.contractId != null ? maps.bySaleId[String(u.contractId)] : null)
    || (displayContract(u) ? maps.byNumber[displayContract(u)] : null)
    || (u.contractNumber ? maps.byNumber[String(u.contractNumber)] : null)
    || (u.receivableBillId ? maps.byNumber[String(u.receivableBillId)] : null)
    || maps.byName[normName(u.name)]
    || maps.byName[normNameLoose(u.name)]
    || (clean ? maps.byName[clean] : null)
    || null;
}

function applyContractInfo(u, info) {
  if (!info) return u;
  const bal = info.outstandingBalance;
  const num = info.contractNumber ? String(info.contractNumber) : "";
  const nextBal = bal == null ? u.outstandingBalance : Number(bal);
  return {
    ...u,
    contractId: info.saleId || u.contractId,
    contractNumber: num || u.contractNumber || null,
    receivableBillId: info.receivableBillId || u.receivableBillId,
    customerId: info.customerId || u.customerId,
    customerDoc: info.customerDoc || u.customerDoc,
    customerName: info.customerName || u.customerName,
    outstandingBalance: nextBal,
    presentDebitBalance: bal == null ? u.presentDebitBalance : Number(bal),
    contractValue: info.contractValue != null ? Number(info.contractValue) : u.contractValue,
    situation: info.situation || u.situation,
    finAt: new Date().toISOString()
  };
}

function originFromReq(req) {
  if (process.env.WARMUP_BASE_URL) return String(process.env.WARMUP_BASE_URL).replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const proto = (req.headers && (req.headers["x-forwarded-proto"] || "https")) || "https";
  const host = (req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "crm-gestao.vercel.app";
  return `${proto}://${host}`;
}

function continuarBatimento(req) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  const secret = process.env.CRON_SECRET || process.env.WARMUP_SECRET || "";
  fetch(`${originFromReq(req)}/api/estoque-batimento`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    signal: ctrl.signal
  }).catch(() => {}).finally(() => clearTimeout(timer));
}

async function saveCc(ccId, allUnits) {
  const cc = String(ccId);
  const list = allUnits.filter((u) => String(u.enterpriseId) === cc);
  const empName = (list[0] && list[0].enterpriseName) || "";
  const chunks = chunkBySize(list);
  await Promise.all(chunks.map((units, n) => setDoc(doc(db, FB_COL, `cc_${cc}_${n}`), {
    enterpriseId: cc,
    enterpriseName: empName,
    chunk: n,
    units,
    updatedAt: new Date().toISOString(),
    date: todayIsoSP()
  })));
  const stale = [];
  for (let n = chunks.length; n < chunks.length + 4; n++) {
    stale.push(deleteDoc(doc(db, FB_COL, `cc_${cc}_${n}`)).catch(() => {}));
  }
  await Promise.all(stale);
}

async function saveCaixaPosicao(units, today) {
  const pos = (units || []).filter(isFinanceLike).map((u) => slimCaixaRow(u, today));
  const CHUNK = 120;
  const nChunks = Math.max(1, Math.ceil(pos.length / CHUNK) || 1);
  for (let c = 0; c < nChunks; c++) {
    await setDoc(doc(db, "caixa_posicao", `${today}_${c}`), {
      date: today,
      chunk: c,
      rows: pos.slice(c * CHUNK, (c + 1) * CHUNK),
      updatedAt: new Date().toISOString()
    });
  }
  await setDoc(doc(db, "caixa_posicao", "_meta"), {
    lastDate: today,
    chunks: nChunks,
    count: pos.length,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  return pos.length;
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
  if (!force && BATIMENTO_PAUSED) {
    return res.status(200).json({
      skipped: true,
      paused: true,
      reason: "batimento_pausado_cota_api",
      date: todayIsoSP(),
      message: "Batimento automático pausado (BATIMENTO_PAUSED=1)."
    });
  }
  const today = todayIsoSP();
  const started = Date.now();
  const log = [];

  if (!force) {
    const filaMeta = await getDoc(doc(db, "sienge_defaulters_history", today));
    const filaData = filaMeta.exists() ? (filaMeta.data() || {}) : null;
    const filaCachePronto = !!(filaData && Number(filaData.chunks) > 0 && (filaData.atFull || filaData.paidMap || filaData.timestampStr));
    const filaPronta = !!(filaData && (filaData.warmupDone || filaCachePronto));
    if (!filaPronta) {
      return res.status(200).json({
        done: false,
        waiting: "fila",
        date: today,
        message: "A fila de cobrança ainda está fechando inadimplentes e último pagamento. O PMP começa em seguida."
      });
    }
  }

  try {
    const stateSnap = await getDoc(doc(db, FB_COL, STATE_ID));
    let state = stateSnap.exists() ? stateSnap.data() : null;
    if (!state || state.date !== today) {
      state = { date: today, seen: [], processed: 0, failed: 0, passes: 0, skippedSettled: 0, done: false };
    }
    if (!Array.isArray(state.seen)) state.seen = [];
    if (state.done) {
      return res.status(200).json({
        done: true,
        date: today,
        processed: state.processed,
        skippedSettled: state.skippedSettled,
        message: "Batimento do dia já concluído."
      });
    }
    state.passes = (Number(state.passes) || 0) + 1;

    let units = await loadUnits();
    if (!units.length) {
      await setDoc(doc(db, FB_COL, STATE_ID), { ...state, done: true, mode: "empty", message: "sem unidades" });
      return res.status(200).json({ done: true, date: today, message: "Sem estoque no Firebase." });
    }

    if (!Array.isArray(state.contractsSeen)) state.contractsSeen = [];
    const seenCc = new Set(state.contractsSeen.map(String));
    const pendingCc = [...new Set(units.filter(needsContract).map((u) => String(u.enterpriseId || "")).filter(Boolean))]
      .filter((id) => !seenCc.has(id))
      .sort((a, b) => Number(a) - Number(b));
    if (pendingCc.length) {
      const byUnit = new Map(units.map((u) => [String(u.id), u]));
      let crossed = 0;
      for (const ccId of pendingCc) {
        if (Date.now() - started >= BUDGET_MS) break;
        try {
          const maps = await fetchContractsForCc(ccId);
          let dirty = false;
          units.forEach((u) => {
            if (String(u.enterpriseId) !== String(ccId) || isSettledUnit(u)) return;
            const info = pickSale(u, maps);
            if (!info) return;
            byUnit.set(String(u.id), applyContractInfo(u, info));
            dirty = true;
          });
          units = [...byUnit.values()];
          if (dirty) await saveCc(ccId, units);
        } catch (e) {
          log.push(`contratos ${ccId}: ${(e && e.message) || e}`);
        }
        seenCc.add(String(ccId));
        crossed += 1;
      }
      state.contractsSeen = [...seenCc];
      const contractsLeft = pendingCc.filter((id) => !seenCc.has(id)).length;
      state.contractsLeft = contractsLeft;
      await setDoc(doc(db, FB_COL, STATE_ID), { ...state, done: false });
      if (contractsLeft > 0 && state.passes < 800) {
        continuarBatimento(req);
        return res.status(200).json({
          done: false,
          phase: "contratos",
          date: today,
          pass: state.passes,
          crossed,
          contractsLeft,
          message: `Cruzamento de contratos no batimento diário. Faltam ${contractsLeft} empreendimento(s).`,
          log: log.slice(0, 30)
        });
      }
    }

    const { bills: filaBills, paidMap } = await loadFilaAndPaidMap(today);
    const plan = planBatimentoWork(units, paidMap, filaBills, { deltaDays: DELTA_DAYS });
    const seen = new Set(state.seen.map(String));
    const sortIds = (ids) => ids.map(String).filter((id) => !seen.has(id))
      .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    const censusQueue = sortIds(plan.censusIds);
    const queue = censusQueue.length ? censusQueue : sortIds(plan.fichaIds);
    const mode = censusQueue.length ? "census" : "daily";
    state.mode = mode;

    const byId = new Map(units.map((u) => [String(u.id), u]));
    const dirtyCc = new Set();
    let stamped = 0;
    plan.stampUnitIds.forEach((id) => {
      const u = byId.get(String(id));
      if (!u) return;
      const ov = filaOverdueForUnit(u, plan.filaIdx);
      if (u.relFin === "inadimplente" && Math.abs((Number(u.kpiVencidas) || 0) - ov) < 0.01) return;
      const next = stampInadimplenteFromFila(u, ov);
      byId.set(String(u.id), next);
      stamped += 1;
      if (u.enterpriseId) dirtyCc.add(String(u.enterpriseId));
    });

    const settledN = units.filter((u) => isFinanceUnit(u) && isSettledUnit(u)).length;
    state.skippedSettled = settledN;
    state.stamped = stamped;

    const persistSnapshot = async (nextUnits, done) => {
      await Promise.all([...dirtyCc].map((cc) => saveCc(cc, nextUnits)));
      await setDoc(doc(db, FB_COL, STATE_ID), { ...state, done: !!done });
      await setDoc(doc(db, FB_COL, "_meta"), {
        batimentoAt: new Date().toISOString(),
        batimentoDate: today,
        batimentoDone: !!done,
        batimentoMode: mode,
        censusLeft: state.censusLeft || 0,
        snapshotAt: new Date().toISOString()
      }, { merge: true });
      if (!done && state.passes % 20 !== 0) return null;
      return saveCaixaPosicao(nextUnits, today);
    };

    const pendingByCust = new Map();
    units.forEach((u) => {
      if (!isFinanceUnit(u) || !u.customerId || isSettledUnit(u)) return;
      const cid = String(u.customerId);
      if (!pendingByCust.has(cid)) pendingByCust.set(cid, []);
      pendingByCust.get(cid).push(u);
    });

    const fetchCustomer = async (customerId) => {
      const mine = pendingByCust.get(String(customerId)) || [];
      if (!mine.length) return;
      const [billsRes, stmtRes] = await Promise.all([
        siengeFetch(`${SIENGE_API_BASE}/accounts-receivable/receivable-bills?customerId=${encodeURIComponent(customerId)}&limit=100&offset=0`, 3),
        siengeFetch(`${SIENGE_API_BASE}/customer-financial-statements?customerId=${encodeURIComponent(customerId)}&includeSubJudice=true&includeRemadeInstallments=N&includeRenegotiation=N`, 3)
      ]);
      const classified = classifyCustomerUnits(mine, extractRows(billsRes), flattenStatements(stmtRes), { includeSettled: true, censusAt: today });
      classified.forEach((u) => {
        byId.set(String(u.id), u);
        if (u.enterpriseId) dirtyCc.add(String(u.enterpriseId));
      });
    };

    let i = 0;
    let processed = Number(state.processed) || 0;
    let failed = Number(state.failed) || 0;
    while (i < queue.length && Date.now() - started < BUDGET_MS) {
      const batch = queue.slice(i, i + CONCURRENCY);
      i += batch.length;
      const results = await Promise.allSettled(batch.map((cid) => fetchCustomer(cid)));
      results.forEach((r, k) => {
        seen.add(String(batch[k]));
        if (r.status === "fulfilled") processed += 1;
        else {
          failed += 1;
          log.push(`cliente ${batch[k]}: ${(r.reason && r.reason.message) || r.reason}`);
        }
      });
    }
    state.seen = [...seen];
    state.processed = processed;
    state.failed = failed;
    const restCensus = plan.censusIds.map(String).filter((id) => !seen.has(id)).length;
    const restFicha = plan.fichaIds.map(String).filter((id) => !seen.has(id)).length;
    state.censusLeft = restCensus;
    state.fichaLeft = restFicha;
    state.done = restCensus === 0 && restFicha === 0;
    const nextUnits = [...byId.values()];
    const n = await persistSnapshot(nextUnits, state.done);

    if (!state.done && state.passes < 800) continuarBatimento(req);
    return res.status(200).json({
      done: !!state.done,
      date: today,
      mode,
      pass: state.passes,
      processedThisPass: i,
      processed,
      failed,
      skippedSettled: settledN,
      stamped,
      censusLeft: restCensus,
      fichaLeft: restFicha,
      dirtyCc: dirtyCc.size,
      caixaPosicao: n,
      message: state.done
        ? "Batimento do dia concluído. Quitados ficam de fora das próximas consultas."
        : `Faltam ${restCensus} cliente(s) no censo e ${restFicha} na ficha diária.`,
      log: log.slice(0, 30)
    });
  } catch (error) {
    console.error("[estoque-batimento]", error);
    return res.status(500).json({ error: error.message, log });
  }
};
