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
  needsCensus,
  needsSaldo,
  aplicarExtratoObra
} = require("../../lib/estoque-batimento-core");

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

const FB_COL = "estoque_comercial";
const STATE_ID = "_batimento_state";
const FB_CHUNK = 400;
/** Firestore recusa documento acima de 1 MiB. */
const FB_DOC_BYTES = 650000;
/** maxDuration é 60s. O restante fica para gravar e chamar a passagem seguinte. */
const BUDGET_MS = 40000;
const CONCURRENCY = 3;

/** Só pausa se BATIMENTO_PAUSED=1. O censo/diário já evita varredura cega. */
const BATIMENTO_PAUSED = process.env.BATIMENTO_PAUSED === "1";
const DELTA_DAYS = 5;

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

/** A tela pede o batimento sem o segredo do cron. O botão de forçar fica valendo por 4 horas. */
async function pedidoRecente(semFila) {
  const snap = await getDoc(doc(db, "sienge_defaulters_history", todayIsoSP()));
  if (!snap.exists()) return false;
  const data = snap.data() || {};
  const pronta = Number(data.chunks) > 0 && !!(data.paidMap || data.warmupDone || data.atFull || data.timestampStr);
  if (!semFila && !pronta) return false;
  const at = Date.parse(data.batimentoPedidoEm || "");
  return Number.isFinite(at) && Date.now() - at < 4 * 60 * 60 * 1000;
}

async function filaPronta(today) {
  const filaMeta = await getDoc(doc(db, "sienge_defaulters_history", today));
  const filaData = filaMeta.exists() ? (filaMeta.data() || {}) : null;
  const cache = !!(filaData && Number(filaData.chunks) > 0 && (filaData.atFull || filaData.paidMap || filaData.timestampStr));
  return !!(filaData && (filaData.warmupDone || cache));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Manda o primeiro byte na hora. Quem chamou sabe que a passagem começou e pode soltar; esta função segue até o fim. */
function soltar(res) {
  if (!res || res.headersSent || res._solto) return;
  res._solto = true;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try { if (typeof res.flushHeaders === "function") res.flushHeaders(); } catch (e) {}
  try { res.write(" "); } catch (e) {}
}

function terminar(res, code, body) {
  const texto = JSON.stringify(body == null ? {} : body);
  if (res && (res._solto || res.headersSent)) {
    try { res.end(texto); } catch (e) {}
    return;
  }
  res.statusCode = code || 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try { res.end(texto); } catch (e) {}
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

async function fetchExtratoCc(ccId, start, end, depth) {
  const url = `${SIENGE_BULK_BASE}/bulk-data/v1/customer-extract-history?startDueDate=${start}&endDueDate=${end}&costCenterId=${encodeURIComponent(ccId)}`
    + "&documentsId=CT&includeRemadeInstallments=false&includeCanceledInstallments=false&includeRevokedInstallments=false&includeRenegotiatedDischarge=false";
  try {
    return extractRows(await siengeFetch(url, 3));
  } catch (e) {
    const msg = String((e && e.message) || e);
    const sy = Number(String(start).slice(0, 4));
    const ey = Number(String(end).slice(0, 4));
    if (!/507/.test(msg) || depth > 6 || !(ey - sy >= 1)) throw e;
    const mid = Math.floor((sy + ey) / 2);
    const left = await fetchExtratoCc(ccId, start, mid + "-12-31", depth + 1);
    const right = await fetchExtratoCc(ccId, (mid + 1) + "-01-01", end, depth + 1);
    return left.concat(right);
  }
}

async function extratoDaObra(ccId) {
  const ano = Number(todayIsoSP().slice(0, 4));
  const fim = (ano + 15) + "-12-31";
  return fetchExtratoCc(ccId, "1996-01-01", fim, 0);
}

function originFromReq(req) {
  if (process.env.WARMUP_BASE_URL) return String(process.env.WARMUP_BASE_URL).replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const proto = (req.headers && (req.headers["x-forwarded-proto"] || "https")) || "https";
  const host = (req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "crm-gestao.vercel.app";
  return `${proto}://${host}`;
}

async function continuarBatimento(req, extra) {
  const secret = process.env.CRON_SECRET || process.env.WARMUP_SECRET || "";
  const q = new URLSearchParams({ cont: "1" });
  if (extra && extra.espera) q.set("espera", String(extra.espera));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    // Resolve quando o próximo envia o cabeçalho. Não aborta depois disso: a passagem segue sozinha.
    await fetch(`${originFromReq(req)}/api/estoque-batimento?${q}`, {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      signal: ctrl.signal
    });
    clearTimeout(timer);
  } catch (e) {
    clearTimeout(timer);
  }
}

function segueSozinho(req) {
  return flag(req, "local") !== "1";
}

function semVazio(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

async function saveCc(ccId, allUnits) {
  const cc = String(ccId);
  const list = allUnits.filter((u) => String(u.enterpriseId) === cc);
  const empName = (list[0] && list[0].enterpriseName) || "";
  const chunks = chunkBySize(list);
  await Promise.all(chunks.map((units, n) => setDoc(doc(db, FB_COL, `cc_${cc}_${n}`), semVazio({
    enterpriseId: cc,
    enterpriseName: empName,
    chunk: n,
    units,
    updatedAt: new Date().toISOString(),
    date: todayIsoSP()
  }))));
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

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }
  const force = flag(req, "force") === "1" || flag(req, "force") === "true";
  if (!authorized(req)) {
    const querPedido = flag(req, "pedido") === "1";
    if (!querPedido || !(await pedidoRecente(force))) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

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
  let started = Date.now();
  const log = [];

  if (!force) {
    let pronta = await filaPronta(today);
    if (!pronta) {
      soltar(res);
      const limite = Date.now() + 20000;
      while (!pronta && Date.now() < limite) {
        await sleep(4000);
        pronta = await filaPronta(today);
      }
      if (!pronta) {
        const espera = Number(flag(req, "espera")) || 0;
        if (espera < 40 && segueSozinho(req)) await continuarBatimento(req, { espera: espera + 1 });
        return terminar(res, 200, {
          done: false,
          waiting: "fila",
          date: today,
          espera,
          message: "A fila de cobrança ainda está fechando. O batimento tenta de novo sozinho até ela fechar."
        });
      }
    }
  }
  started = Date.now();

  try {
    const stateSnap = await getDoc(doc(db, FB_COL, STATE_ID));
    let state = stateSnap.exists() ? stateSnap.data() : null;
    if (!state || state.date !== today) {
      state = { date: today, seen: [], processed: 0, failed: 0, passes: 0, skippedSettled: 0, done: false };
    }
    if (!Array.isArray(state.seen)) state.seen = [];
    if (state.done && !force) {
      return res.status(200).json({
        done: true,
        date: today,
        processed: state.processed,
        skippedSettled: state.skippedSettled,
        message: "Batimento do dia já concluído."
      });
    }
    if (state.done && force) {
      state.done = false;
      state.saldoSeen = [];
      state.saldoFalhas = {};
      state.censoFalhas = {};
    }
    const continuacao = flag(req, "cont") === "1";
    if (!force && !continuacao && Number(state.passes) > 0) {
      const touched = Date.parse(state.touchedAt || "");
      if (Number.isFinite(touched) && Date.now() - touched < 90000) {
        return res.status(200).json({
          done: false,
          running: true,
          date: today,
          pass: state.passes,
          message: "O batimento deste dia já está em andamento."
        });
      }
    }
    soltar(res);
    state.touchedAt = new Date().toISOString();
    state.passes = (Number(state.passes) || 0) + 1;
    if (!state.obraFalhas || typeof state.obraFalhas !== "object") state.obraFalhas = {};
    if (!state.censoFalhas || typeof state.censoFalhas !== "object") state.censoFalhas = {};
    await setDoc(doc(db, FB_COL, STATE_ID), { ...state, done: false });

    let units = await loadUnits();
    if (!units.length) {
      return terminar(res, 200, { done: false, date: today, message: "Sem estoque no Firebase. A posição não foi fechada para o dia poder tentar de novo." });
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
        if (segueSozinho(req)) await continuarBatimento(req);
        return terminar(res, 200, {
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
    const mode = censusQueue.length ? "census" : "daily";
    state.mode = mode;

    const byId = new Map(units.map((u) => [String(u.id), u]));
    const dirtyCc = new Set();
    let stamped = 0;
    if (mode === "census") plan.stampUnitIds.forEach((id) => {
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
        obrasLeft: state.obrasLeft || 0,
        unitsSavedDate: done ? today : (state.unitsSavedDate || null),
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

    const fetchSaldo = async (customerId) => {
      const mine = [...byId.values()].filter((u) => String(u.customerId) === String(customerId) && needsSaldo(u));
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
    let obrasFeitas = 0;
    const obrasAtivas = [...new Set(units
      .filter((u) => isFinanceUnit(u) && !isSettledUnit(u))
      .map((u) => String(u.enterpriseId || ""))
      .filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    if (!Array.isArray(state.obrasVistas)) state.obrasVistas = [];
    const obrasVistas = new Set(state.obrasVistas.map(String));

    if (censusQueue.length) {
      while (i < censusQueue.length && Date.now() - started < BUDGET_MS) {
        const batch = censusQueue.slice(i, i + CONCURRENCY);
        i += batch.length;
        const results = await Promise.allSettled(batch.map((cid) => fetchCustomer(cid)));
        results.forEach((r, k) => {
          const cid = String(batch[k]);
          if (r.status === "fulfilled") {
            seen.add(cid);
            delete state.censoFalhas[cid];
            processed += 1;
          } else {
            // Cliente que falhou (ex.: 429 do Sienge) volta na próxima passada. Depois de 3 falhas segue sem ele, para o dia fechar.
            failed += 1;
            const nFail = (Number(state.censoFalhas[cid]) || 0) + 1;
            state.censoFalhas[cid] = nFail;
            if (nFail >= 3) seen.add(cid);
            log.push(`cliente ${cid}: ${(r.reason && r.reason.message) || r.reason}`);
          }
        });
      }
    } else {
      const pendentes = obrasAtivas.filter((id) => !obrasVistas.has(id));
      for (const ccId of pendentes) {
        if (Date.now() - started >= BUDGET_MS) break;
        try {
          const rows = await extratoDaObra(ccId);
          const aplicado = aplicarExtratoObra([...byId.values()], rows, ccId);
          aplicado.units.forEach((u) => {
            if (u && u.id != null) byId.set(String(u.id), u);
          });
          dirtyCc.add(String(ccId));
          obrasVistas.add(String(ccId));
          obrasFeitas += 1;
          processed += aplicado.atualizadas;
          delete state.obraFalhas[String(ccId)];
          log.push(`obra ${ccId}: ${aplicado.atualizadas} contratos, ${aplicado.semExtrato} sem título no extrato`);
        } catch (e) {
          failed += 1;
          const nFail = (Number(state.obraFalhas[String(ccId)]) || 0) + 1;
          state.obraFalhas[String(ccId)] = nFail;
          log.push(`obra ${ccId}: ${(e && e.message) || e}`);
          if (nFail >= 2) {
            obrasVistas.add(String(ccId));
            log.push(`obra ${ccId}: segue sem ela depois de ${nFail} falhas, para o restante fechar`);
          }
        }
      }
    }

    state.seen = [...seen];
    state.obrasVistas = [...obrasVistas];
    state.processed = processed;
    state.failed = failed;
    const restCensus = plan.censusIds.map(String).filter((id) => !seen.has(id)).length;
    const restObras = obrasAtivas.filter((id) => !obrasVistas.has(id)).length;
    state.censusLeft = restCensus;
    state.fichaLeft = restObras;
    state.obrasLeft = restObras;

    if (!Array.isArray(state.saldoSeen)) state.saldoSeen = [];
    if (!state.saldoFalhas || typeof state.saldoFalhas !== "object") state.saldoFalhas = {};
    const saldoSeen = new Set(state.saldoSeen.map(String));
    let saldoLeft = 0;
    if (restCensus === 0 && restObras === 0) {
      const filaSaldo = [];
      const ja = new Set();
      byId.forEach((u) => {
        if (!needsSaldo(u)) return;
        const cid = String(u.customerId);
        if (saldoSeen.has(cid) || ja.has(cid)) return;
        ja.add(cid);
        filaSaldo.push(cid);
      });
      let s = 0;
      while (s < filaSaldo.length && Date.now() - started < BUDGET_MS) {
        const batch = filaSaldo.slice(s, s + CONCURRENCY);
        s += batch.length;
        const results = await Promise.allSettled(batch.map((cid) => fetchSaldo(cid)));
        results.forEach((r, k) => {
          const cid = String(batch[k]);
          if (r.status === "fulfilled") {
            saldoSeen.add(cid);
            delete state.saldoFalhas[cid];
            processed += 1;
          } else {
            failed += 1;
            const nFail = (Number(state.saldoFalhas[cid]) || 0) + 1;
            state.saldoFalhas[cid] = nFail;
            if (nFail >= 2) saldoSeen.add(cid);
            log.push(`saldo ${cid}: ${(r.reason && r.reason.message) || r.reason}`);
          }
        });
      }
      state.saldoSeen = [...saldoSeen];
      saldoLeft = filaSaldo.filter((id) => !saldoSeen.has(String(id))).length;
    }
    state.saldoLeft = saldoLeft;
    state.done = restCensus === 0 && restObras === 0 && saldoLeft === 0;
    state.obrasPuladas = Object.keys(state.obraFalhas || {}).filter((id) => Number(state.obraFalhas[id]) >= 2);
    const nextUnits = [...byId.values()];
    const n = await persistSnapshot(nextUnits, state.done);

    if (!state.done && state.passes < 800 && segueSozinho(req)) await continuarBatimento(req);
    return terminar(res, 200, {
      done: !!state.done,
      date: today,
      mode,
      pass: state.passes,
      processedThisPass: censusQueue.length ? i : obrasFeitas,
      processed,
      failed,
      skippedSettled: settledN,
      stamped,
      censusLeft: restCensus,
      fichaLeft: restObras,
      obrasLeft: restObras,
      saldoLeft,
      dirtyCc: dirtyCc.size,
      caixaPosicao: n,
      message: state.done
        ? "Batimento do dia concluído. Contratos ativos conferidos pelo extrato do empreendimento."
        : (restCensus
          ? `Faltam ${restCensus} cliente(s) no censo.`
          : (restObras
            ? `Faltam ${restObras} empreendimento(s) na conferência de vencido e a vencer.`
            : `Faltam ${saldoLeft} cliente(s) ainda sem saldo.`)),
      log: log.slice(0, 30)
    });
  } catch (error) {
    console.error("[estoque-batimento]", error);
    const espera = Number(flag(req, "espera")) || 0;
    if (espera < 8 && segueSozinho(req)) await continuarBatimento(req, { espera: espera + 1 });
    return terminar(res, 500, { error: error.message, log });
  }
}

function chamarLocal(query) {
  return new Promise((resolve) => {
    const qs = Object.keys(query).map((k) => k + "=" + encodeURIComponent(query[k])).join("&");
    const req = { method: "GET", headers: {}, query, url: "/api/estoque-batimento?" + qs };
    const res = {
      status() { return this; },
      setHeader() {},
      json(body) { resolve(body); },
      end() { resolve({ ended: true }); }
    };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ error: String((e && e.message) || e) }));
  });
}

/** Roda o batimento neste processo, uma passada atrás da outra, até fechar o dia. */
async function runDaily(maxPasses) {
  const limit = maxPasses || 80;
  const logs = [];
  for (let n = 0; n < limit; n++) {
    const body = await chamarLocal({
      local: "1",
      cont: n ? "1" : "0",
      force: n === 0 && process.env.ESTOQUE_FORCE === "1" ? "1" : "0"
    });
    logs.push(body);
    console.log("[estoque-batimento]", JSON.stringify({
      pass: n + 1,
      done: body && body.done,
      phase: body && body.phase,
      mode: body && body.mode,
      message: body && body.message,
      censusLeft: body && body.censusLeft,
      fichaLeft: body && body.fichaLeft,
      waiting: body && body.waiting,
      error: body && body.error
    }));
    if (!body || body.done || body.waiting || body.skipped || body.running || body.error) break;
  }
  return logs;
}

handler.runDaily = runDaily;
module.exports = handler;
