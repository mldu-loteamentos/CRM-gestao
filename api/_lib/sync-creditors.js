const { initializeApp, getApps } = require("firebase/app");
const { getFirestore, collection, doc, getDoc, setDoc, getDocs, writeBatch } = require("firebase/firestore");
const { todayIsoSP } = require("../../lib/br-calendar");

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

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const COL = "sienge_creditors";
const STATE_COL = "sienge_sync_state";
const STATE_ID = "creditors";
const PAGE = 200;
const BUDGET_MS = 45000;
const LOCK_MS = 90000;

function flag(req, key) {
  const from = req.query && req.query[key];
  if (from != null && String(from) !== "") return String(Array.isArray(from) ? from[0] : from);
  const raw = String((req && req.url) || "");
  const m = raw.match(new RegExp("[?&]" + key + "=([^&]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

function authorized(req) {
  const secret = process.env.CRON_SECRET || process.env.WARMUP_SECRET;
  if (!secret) return true;
  const auth = String((req.headers && req.headers.authorization) || "");
  const q = flag(req, "secret") || flag(req, "token");
  return auth === `Bearer ${secret}` || q === secret;
}

function originFromReq(req) {
  if (process.env.WARMUP_BASE_URL) return process.env.WARMUP_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const proto = (req.headers && (req.headers["x-forwarded-proto"] || "https")) || "https";
  const host = (req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "crm-gestao.vercel.app";
  return `${proto}://${host}`;
}

function novoLock() {
  return String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
}

function json(res, status, body) {
  res.status(status).json(body);
}

async function siengeGet(path) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(SIENGE_API_BASE + path, {
        headers: { Authorization: SIENGE_AUTH, Accept: "application/json" }
      });
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`Sienge ${res.status}`);
        await new Promise((r) => setTimeout(r, Math.min(3000 * 2 ** i, 12000)));
        continue;
      }
      if (!res.ok) throw new Error(`Sienge ${res.status}: ${await res.text()}`);
      return await res.json();
    } catch (e) {
      last = e;
      if (i < 3) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}

async function loadState() {
  const snap = await getDoc(doc(db, STATE_COL, STATE_ID));
  return snap.exists() ? (snap.data() || {}) : null;
}

async function saveState(state) {
  await setDoc(doc(db, STATE_COL, STATE_ID), state);
}

async function gravarPagina(rows, today) {
  const batch = writeBatch(db);
  let n = 0;
  rows.forEach((row) => {
    if (!row || row.id == null || row.id === "") return;
    batch.set(doc(db, COL, String(row.id)), Object.assign({}, row, { _batimentoDate: today }));
    n++;
  });
  if (n) await batch.commit();
  return n;
}

async function limparForaDoDia(today) {
  const snap = await getDocs(collection(db, COL));
  const stale = [];
  snap.forEach((d) => {
    const data = (d && d.data && d.data()) || {};
    if (data._batimentoDate === today) return;
    stale.push(d.ref);
  });
  let removed = 0;
  for (let i = 0; i < stale.length; i += 400) {
    const batch = writeBatch(db);
    const fatia = stale.slice(i, i + 400);
    fatia.forEach((ref) => batch.delete(ref));
    await batch.commit();
    removed += fatia.length;
  }
  return removed;
}

async function avancar(state, today, started) {
  if (state.phase !== "limpar") {
    while (Date.now() - started < BUDGET_MS) {
      const data = await siengeGet(`/creditors?limit=${PAGE}&offset=${state.offset || 0}`);
      const rows = data.results || [];
      const total = data.resultSetMetadata && data.resultSetMetadata.count != null
        ? Number(data.resultSetMetadata.count)
        : (state.offset || 0) + rows.length;
      state.total = total;
      if (!rows.length) {
        state.phase = "limpar";
        state.done = true;
        state.running = false;
        state.finishedAt = new Date().toISOString();
        state.updatedAt = state.finishedAt;
        await saveState(state);
        break;
      }
      const gravados = await gravarPagina(rows, today);
      state.gravados = (Number(state.gravados) || 0) + gravados;
      state.offset = (Number(state.offset) || 0) + rows.length;
      state.updatedAt = new Date().toISOString();
      if (state.offset >= total) {
        state.phase = "limpar";
        state.done = true;
        state.running = false;
        state.finishedAt = new Date().toISOString();
        state.updatedAt = state.finishedAt;
      }
      await saveState(state);
      if (state.done) break;
    }
  }
  if (state.done && state.phase === "limpar" && state.removidos == null && Date.now() - started < BUDGET_MS - 8000) {
    try {
      state.removidos = await limparForaDoDia(today);
      state.updatedAt = new Date().toISOString();
      await saveState(state);
    } catch (e) {
      state.erro = String((e && e.message) || e);
      await saveState(state);
    }
  }
  return state;
}

async function continuar(req, lock) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    await fetch(`${originFromReq(req)}/api/sync-creditors?cont=1&lock=${encodeURIComponent(lock)}`, {
      headers: { Authorization: (req.headers && req.headers.authorization) || "" },
      signal: ctrl.signal
    });
  } catch (e) {
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

  const today = todayIsoSP();
  const cont = flag(req, "cont") === "1";
  const lockPedido = flag(req, "lock");
  let state = await loadState();

  if (state && state.date === today && state.done) {
    return json(res, 200, {
      done: true,
      date: today,
      total: state.total || 0,
      gravados: state.gravados || 0,
      message: "Batimento de credores do dia já concluído."
    });
  }

  const updated = Date.parse((state && state.updatedAt) || "");
  const fresh = !!(state && state.running && state.date === today && Number.isFinite(updated) && Date.now() - updated < LOCK_MS);
  if (cont) {
    if (!state || state.date !== today || state.lock !== lockPedido) {
      return json(res, 200, { done: false, skipped: true, message: "Continuação antiga do batimento de credores." });
    }
  } else if (fresh) {
    return json(res, 200, { done: false, skipped: true, message: "Batimento de credores já está em andamento." });
  }

  if (!state || state.date !== today) {
    state = {
      date: today,
      offset: 0,
      total: 0,
      gravados: 0,
      removidos: 0,
      phase: "copiar",
      done: false
    };
  }
  state.lock = cont ? state.lock : novoLock();
  state.running = true;
  state.erro = "";
  state.updatedAt = new Date().toISOString();
  await saveState(state);

  try {
    state = await avancar(state, today, Date.now());
  } catch (e) {
    state.running = false;
    state.erro = String((e && e.message) || e);
    state.updatedAt = new Date().toISOString();
    await saveState(state);
    return json(res, 500, { error: state.erro, offset: state.offset || 0, total: state.total || 0 });
  }

  if (!state.done) await continuar(req, state.lock);
  return json(res, 200, {
    done: !!state.done,
    date: today,
    offset: state.offset || 0,
    total: state.total || 0,
    gravados: state.gravados || 0,
    removidos: state.removidos || 0,
    phase: state.phase || "",
    lock: state.done ? "" : (state.lock || "")
  });
}

module.exports = handler;
