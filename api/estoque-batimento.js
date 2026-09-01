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
  classifyCustomerUnits
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
      await setDoc(doc(db, FB_COL, STATE_ID), { ...state, done: true, message: "sem unidades" });
      return res.status(200).json({ done: true, date: today, message: "Sem estoque no Firebase." });
    }

    const pending = units.filter((u) => isFinanceUnit(u) && !isSettledUnit(u) && u.customerId);
    const settledN = units.filter((u) => isFinanceUnit(u) && isSettledUnit(u)).length;
    const custIds = [...new Set(pending.map((u) => String(u.customerId)))].sort((a, b) => Number(a) - Number(b));
    state.skippedSettled = settledN;

    if (state.cursor >= custIds.length) {
      state.done = true;
      await setDoc(doc(db, FB_COL, STATE_ID), state);
      await setDoc(doc(db, FB_COL, "_meta"), {
        batimentoAt: new Date().toISOString(),
        batimentoDate: today,
        batimentoDone: true
      }, { merge: true });
      const n = await saveCaixaPosicao(units, today);
      return res.status(200).json({
        done: true,
        date: today,
        processed: state.processed,
        skippedSettled: settledN,
        pendingCustomers: 0,
        caixaPosicao: n
      });
    }

    const byId = new Map(units.map((u) => [String(u.id), u]));
    const dirtyCc = new Set();
    let i = state.cursor;
    while (i < custIds.length && Date.now() - started < BUDGET_MS) {
      const customerId = custIds[i];
      const mine = pending.filter((u) => String(u.customerId) === customerId);
      try {
        const billsRes = await siengeFetch(`${SIENGE_API_BASE}/accounts-receivable/receivable-bills?customerId=${customerId}&limit=100&offset=0`);
        const stmtRes = await siengeFetch(`${SIENGE_API_BASE}/customer-financial-statements?customerId=${customerId}&includeSubJudice=true&includeRemadeInstallments=N&includeRenegotiation=N`);
        const classified = classifyCustomerUnits(mine, extractRows(billsRes), flattenStatements(stmtRes));
        classified.forEach((u) => {
          byId.set(String(u.id), u);
          if (u.enterpriseId) dirtyCc.add(String(u.enterpriseId));
        });
        state.processed += 1;
      } catch (e) {
        log.push(`cliente ${customerId}: ${e.message}`);
      }
      i += 1;
    }
    state.cursor = i;
    if (state.cursor >= custIds.length) state.done = true;

    const nextUnits = [...byId.values()];
    for (const cc of dirtyCc) {
      await saveCc(cc, nextUnits);
    }
    await setDoc(doc(db, FB_COL, STATE_ID), state);
    if (state.done) {
      await setDoc(doc(db, FB_COL, "_meta"), {
        batimentoAt: new Date().toISOString(),
        batimentoDate: today,
        batimentoDone: true
      }, { merge: true });
      const n = await saveCaixaPosicao(nextUnits, today);
      log.push(`caixa_posicao ${today}: ${n} contratos`);
    }

    return res.status(200).json({
      done: !!state.done,
      date: today,
      cursor: state.cursor,
      totalCustomers: custIds.length,
      processed: state.processed,
      skippedSettled: settledN,
      dirtyCc: dirtyCc.size,
      log
    });
  } catch (error) {
    console.error("[estoque-batimento]", error);
    return res.status(500).json({ error: error.message, log });
  }
};
