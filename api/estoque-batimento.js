const { initializeApp } = require("firebase/app");
const {
  getFirestore, doc, setDoc, getDoc, getDocs, collection
} = require("firebase/firestore");
const { isBusinessDaySP, todayIsoSP } = require("../lib/br-calendar");
const { slimCaixaRow, isFinanceLike } = require("../lib/caixa-snapshot");
const {
  isFinanceUnit,
  isSettledUnit,
  extractRows,
  flattenStatements,
  classifyCustomerUnits,
  planBatimentoWork,
  stampInadimplenteFromFila,
  filaOverdueForUnit
} = require("../lib/estoque-batimento-core");

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
const BUDGET_MS = 42000;

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

async function saveCc(ccId, allUnits) {
  const cc = String(ccId);
  const list = allUnits.filter((u) => String(u.enterpriseId) === cc);
  const empName = (list[0] && list[0].enterpriseName) || "";
  const writes = [];
  for (let i = 0, n = 0; i < list.length; i += FB_CHUNK, n += 1) {
    writes.push(setDoc(doc(db, FB_COL, `cc_${cc}_${n}`), {
      enterpriseId: cc,
      enterpriseName: empName,
      chunk: n,
      units: list.slice(i, i + FB_CHUNK),
      updatedAt: new Date().toISOString(),
      date: todayIsoSP()
    }));
  }
  await Promise.all(writes);
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
  const day = isBusinessDaySP();
  if (!force && BATIMENTO_PAUSED) {
    return res.status(200).json({
      skipped: true,
      paused: true,
      reason: "batimento_pausado_cota_api",
      date: todayIsoSP(),
      message: "Batimento automático pausado (BATIMENTO_PAUSED=1)."
    });
  }
  if (!force && !day.ok) {
    return res.status(200).json({
      skipped: true,
      reason: day.reason,
      date: todayIsoSP(),
      message: "Fim de semana ou feriado: batimento de estoque só em dia útil (ou force=1)."
    });
  }

  const today = todayIsoSP();
  const started = Date.now();
  const log = [];

  try {
    const stateSnap = await getDoc(doc(db, FB_COL, STATE_ID));
    let state = stateSnap.exists() ? stateSnap.data() : null;
    if (!state || state.date !== today) {
      state = { date: today, cursor: 0, processed: 0, skippedSettled: 0, done: false };
    }
    if (state.done) {
      return res.status(200).json({
        done: true,
        date: today,
        processed: state.processed,
        skippedSettled: state.skippedSettled,
        message: "Batimento do dia já concluído."
      });
    }

    const units = await loadUnits();
    if (!units.length) {
      await setDoc(doc(db, FB_COL, STATE_ID), { ...state, done: true, mode: "empty", message: "sem unidades" });
      return res.status(200).json({ done: true, date: today, message: "Sem estoque no Firebase." });
    }

    const { bills: filaBills, paidMap } = await loadFilaAndPaidMap(today);
    const plan = planBatimentoWork(units, paidMap, filaBills, { deltaDays: DELTA_DAYS });
    const mode = plan.censusIds.length ? "census" : "daily";
    const queue = (mode === "census" ? plan.censusIds : plan.fichaIds)
      .map(String)
      .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

    if (!state.mode || state.mode !== mode) {
      state.mode = mode;
      state.cursor = 0;
    }

    const byId = new Map(units.map((u) => [String(u.id), u]));
    const dirtyCc = new Set();
    let stamped = 0;
    plan.stampUnitIds.forEach((id) => {
      const u = byId.get(String(id));
      if (!u) return;
      const ov = filaOverdueForUnit(u, plan.filaIdx);
      const next = stampInadimplenteFromFila(u, ov);
      byId.set(String(u.id), next);
      stamped += 1;
      if (u.enterpriseId) dirtyCc.add(String(u.enterpriseId));
    });

    const settledN = units.filter((u) => isFinanceUnit(u) && isSettledUnit(u)).length;
    const censusLeft = plan.censusIds.length;
    state.skippedSettled = settledN;
    state.censusLeft = censusLeft;
    state.fichaLeft = plan.fichaIds.length;
    state.stamped = stamped;

    const persistSnapshot = async (nextUnits, done) => {
      for (const cc of dirtyCc) await saveCc(cc, nextUnits);
      await setDoc(doc(db, FB_COL, STATE_ID), { ...state, done: !!done });
      await setDoc(doc(db, FB_COL, "_meta"), {
        batimentoAt: new Date().toISOString(),
        batimentoDate: today,
        batimentoDone: !!done,
        batimentoMode: mode,
        censusLeft,
        snapshotAt: new Date().toISOString()
      }, { merge: true });
      const n = await saveCaixaPosicao(nextUnits, today);
      return n;
    };

    if (state.cursor >= queue.length) {
      state.done = true;
      const nextUnits = [...byId.values()];
      const n = await persistSnapshot(nextUnits, true);
      return res.status(200).json({
        done: true,
        date: today,
        mode,
        processed: state.processed || 0,
        skippedSettled: settledN,
        stamped,
        pendingCustomers: 0,
        censusLeft: 0,
        caixaPosicao: n,
        message: mode === "census"
          ? "Censo concluído. Base do dia gravada."
          : "Batimento diário concluído. Base gravada (quitados pulados, inadimplentes pela fila, pagamentos recentes na ficha)."
      });
    }

    const pendingByCust = new Map();
    units.forEach((u) => {
      if (!isFinanceUnit(u) || isSettledUnit(u) || !u.customerId) return;
      const cid = String(u.customerId);
      if (!pendingByCust.has(cid)) pendingByCust.set(cid, []);
      pendingByCust.get(cid).push(u);
    });

    let i = Number(state.cursor) || 0;
    let processed = Number(state.processed) || 0;
    while (i < queue.length && Date.now() - started < BUDGET_MS) {
      const customerId = queue[i];
      const mine = pendingByCust.get(String(customerId)) || [];
      try {
        const billsRes = await siengeFetch(`${SIENGE_API_BASE}/accounts-receivable/receivable-bills?customerId=${encodeURIComponent(customerId)}&limit=100&offset=0`);
        const stmtRes = await siengeFetch(`${SIENGE_API_BASE}/customer-financial-statements?customerId=${encodeURIComponent(customerId)}&includeSubJudice=true&includeRemadeInstallments=N&includeRenegotiation=N`);
        const classified = classifyCustomerUnits(mine, extractRows(billsRes), flattenStatements(stmtRes));
        classified.forEach((u) => {
          byId.set(String(u.id), u);
          if (u.enterpriseId) dirtyCc.add(String(u.enterpriseId));
        });
        processed += 1;
      } catch (e) {
        log.push(`cliente ${customerId}: ${e.message}`);
      }
      i += 1;
    }
    state.cursor = i;
    state.processed = processed;
    state.done = state.cursor >= queue.length;
    const nextUnits = [...byId.values()];
    const n = await persistSnapshot(nextUnits, state.done);

    return res.status(200).json({
      done: !!state.done,
      date: today,
      mode,
      cursor: state.cursor,
      totalCustomers: queue.length,
      processed,
      skippedSettled: settledN,
      stamped,
      censusLeft: mode === "census" ? Math.max(0, queue.length - state.cursor) : 0,
      dirtyCc: dirtyCc.size,
      caixaPosicao: n,
      log
    });
  } catch (error) {
    console.error("[estoque-batimento]", error);
    return res.status(500).json({ error: error.message, log });
  }
};
