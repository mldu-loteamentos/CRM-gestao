/**
 * Batimento diário da caução (segunda a sexta, 06:30, disparado pelo morning-warmup).
 * 1. Lê as cauções CAU no Sienge (bulk-data /outcome por vencimento).
 * 2. Prorroga no Sienge as retidas que vencem dentro do prazo mínimo da tesouraria.
 * 3. Grava a base do dia em caucao_base para a tela Gestão de caução abrir sem ir ao Sienge.
 * ?simular=1 monta o plano sem gravar no Sienge. ?force=1 roda de novo no mesmo dia.
 */
const { initializeApp, getApps } = require("firebase/app");
const {
  getFirestore, doc, setDoc, getDoc, deleteDoc, runTransaction
} = require("firebase/firestore");
const { saoPauloToday, isWeekend, todayIsoSP } = require("../lib/br-calendar");
const Core = require("../caucao-core");

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

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const COL = "caucao_base";
const META = "_meta";
const FB_DOC_BYTES = 650000;
/** Outra execução segurando a trava há menos que isso continua valendo. */
const TRAVA_MS = 4 * 60 * 1000;
/** Teto de parcelas prorrogadas por execução: acima disso algo saiu do normal. */
const MAX_PRORROGA = 80;
const ROTINA = "Rotina automática 06:30";
const PRORROGA_PADRAO = { antes: 10, dias: 30 };

function authorized(req) {
  const secret = process.env.CRON_SECRET || process.env.WARMUP_SECRET;
  if (!secret) return true;
  const auth = String(req.headers.authorization || "");
  const q = req.query && (req.query.secret || req.query.token);
  return auth === `Bearer ${secret}` || String(q || "") === secret;
}

function flag(req, name) {
  const v = req.query && req.query[name];
  return v === "1" || v === "true";
}

function parseJson(raw, fallback) {
  if (raw && typeof raw === "object") return raw;
  try { return JSON.parse(raw || "") || fallback; } catch (e) { return fallback; }
}

function prorrogacaoCfg(raw) {
  const obj = parseJson(raw, {});
  const clamp = (n, min, max, fb) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return fb;
    return Math.min(max, Math.max(min, Math.round(v)));
  };
  return {
    antes: clamp(obj.antes != null ? obj.antes : PRORROGA_PADRAO.antes, 0, 365, PRORROGA_PADRAO.antes),
    dias: clamp(obj.dias != null ? obj.dias : PRORROGA_PADRAO.dias, 1, 365, PRORROGA_PADRAO.dias)
  };
}

function fmtDate(iso) {
  const s = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : (s || "—");
}

function money(n) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function siengeGet(url, retries) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { Authorization: SIENGE_AUTH, Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`Sienge ${res.status}`);
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`Sienge ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch (e) {
      last = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

async function siengePatch(path, body) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${SIENGE_API_BASE}${path}`, {
      method: "PATCH",
      headers: { Authorization: SIENGE_AUTH, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.status === 429 && i < 3) {
      await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Sienge ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return true;
  }
  throw new Error("Sienge 429: limite de requisições.");
}

/** Mesmo caminho da tela: tenta as parcelas do título juntas e, se falhar, uma por uma. */
async function patchParcelas(billId, items) {
  const path = `/bills/${encodeURIComponent(billId)}/installments`;
  try {
    return await siengePatch(path, items);
  } catch (e) {
    if (items.length === 1) throw e;
    for (const item of items) await siengePatch(path, item);
    return true;
  }
}

async function auditar(r, status, summary, details) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const rec = {
    id,
    timestamp: new Date().toISOString(),
    user: ROTINA,
    userEmail: "",
    action: "CAUCAO_VENCIMENTO",
    module: "Engenharia",
    status,
    summary,
    customerId: "",
    customerLabel: r.credor || "",
    enterpriseId: r.ccId != null ? String(r.ccId) : "",
    enterpriseName: r.ccNome || "",
    unitId: "",
    unitName: "",
    titleId: String(r.titulo || ""),
    details: Object.assign({
      parcela: r.parcela || "",
      documento: r.documento || "",
      valor: r.valorAjustado,
      credor: r.credor || "",
      empresa: r.companyId != null ? String(r.companyId) : "",
      automatico: true
    }, details || {}),
    endpoint: `/bills/${r.titulo}/installments`,
    method: "PATCH"
  };
  try { await setDoc(doc(db, "auditoria_logs", id), rec); } catch (e) {}
}

/** Mesmo formato da fila que a tela envia por e-mail (crm_engenharia_caucao_avisos_v1). */
async function enfileirarAvisos(itens) {
  if (!itens.length) return 0;
  const ref = doc(db, "config", "global");
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const store = parseJson(snap.exists() ? snap.data().crm_engenharia_caucao_avisos_v1 : "", {});
    const sent = store.sent && typeof store.sent === "object" ? store.sent : {};
    const queue = Array.isArray(store.queue) ? store.queue : [];
    let n = 0;
    itens.forEach((item) => {
      const key = `prorrogacao|${item.titulo}|${item.parcela}|${item.vencimento}`;
      if (sent[key] || queue.some((q) => q && q.key === key)) return;
      queue.push({ key, kind: "prorrogacao", item });
      n += 1;
    });
    tx.set(ref, { crm_engenharia_caucao_avisos_v1: JSON.stringify({ sent, queue, lastTry: 0 }) }, { merge: true });
    return n;
  });
}

function chunkBySize(list) {
  const out = [];
  let cur = [];
  let bytes = 0;
  list.forEach((row) => {
    const size = JSON.stringify(row).length + 2;
    if (cur.length && bytes + size > FB_DOC_BYTES) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(row);
    bytes += size;
  });
  if (cur.length || !out.length) out.push(cur);
  return out;
}

async function salvarBase(today, rows, metaExtra, anterior) {
  const chunks = chunkBySize(rows);
  await Promise.all(chunks.map((part, n) => setDoc(doc(db, COL, `${today}_${n}`), {
    date: today,
    chunk: n,
    rows: part
  })));
  await setDoc(doc(db, COL, META), Object.assign({
    date: today,
    chunks: chunks.length,
    count: rows.length,
    running: false,
    done: true,
    geradoEm: new Date().toISOString()
  }, metaExtra));
  if (anterior && anterior.date && anterior.date !== today) {
    const n = Number(anterior.chunks) || 0;
    await Promise.all(Array.from({ length: n }, (_, i) => deleteDoc(doc(db, COL, `${anterior.date}_${i}`)).catch(() => {})));
  }
  return chunks.length;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });

  const force = flag(req, "force");
  const simular = flag(req, "simular");
  const today = todayIsoSP();
  if (!force && isWeekend(saoPauloToday())) {
    return res.status(200).json({ skipped: true, date: today, message: "Sábado ou domingo: o batimento da caução roda de segunda a sexta." });
  }

  const metaRef = doc(db, COL, META);
  let anterior = null;
  try {
    const travou = await runTransaction(db, async (tx) => {
      const snap = await tx.get(metaRef);
      const m = snap.exists() ? snap.data() : null;
      anterior = m;
      if (m && m.running && Date.now() - Date.parse(m.runningAt || 0) < TRAVA_MS) return "rodando";
      if (!force && !simular && m && m.date === today && m.done) return "feito";
      if (!simular) tx.set(metaRef, Object.assign({}, m || {}, { running: true, runningAt: new Date().toISOString() }));
      return "ok";
    });
    if (travou === "rodando") return res.status(200).json({ running: true, date: today, message: "Batimento da caução já está rodando." });
    if (travou === "feito") return res.status(200).json({ done: true, date: today, message: "Base da caução de hoje já gerada.", meta: anterior });
  } catch (e) {
    return res.status(500).json({ error: "Falha ao abrir o batimento: " + e.message });
  }

  const started = Date.now();
  const log = [];
  try {
    const cfgSnap = await getDoc(doc(db, "config", "global"));
    if (!cfgSnap.exists()) throw new Error("config/global não encontrado: sem liberações, nada é prorrogado.");
    const cfg = cfgSnap.data() || {};
    const liberated = parseJson(cfg.crm_engenharia_caucao_liberados_v1, {});
    const prazo = prorrogacaoCfg(cfg.crm_engenharia_caucao_prorrogacao_v1);
    const gerida = Core.geridaIdSet(cfg.crm_empresas_custom || "{}");

    const range = Core.defaultRange(today);
    const url = `${SIENGE_BULK_BASE}/bulk-data/v1/outcome?startDate=${range.startDate}&endDate=${range.endDate}`
      + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
    const payload = await siengeGet(url, 2);
    const rows = Core.transform({ data: Core.cauBills(payload) });
    const leituraMs = Date.now() - started;

    const plano = Core.planoProrrogacao(rows, { hoje: today, antes: prazo.antes, dias: prazo.dias, liberated, gerida });
    const fila = plano.slice(0, MAX_PRORROGA);
    const vencidasRetidas = rows.filter((r) => !r.pago && gerida.has(String(r.companyId))
      && !Core.isLiberated(liberated, r) && Core.isoDate(r.vencimento) && r.vencimento < today).length;

    let prorrogadas = 0;
    const falhas = [];
    const avisos = [];
    if (!simular) {
      const porTitulo = new Map();
      fila.forEach((p) => {
        const id = String(p.row.titulo);
        if (!porTitulo.has(id)) porTitulo.set(id, []);
        porTitulo.get(id).push(p);
      });
      for (const [billId, lista] of porTitulo.entries()) {
        if (Date.now() - started > 50000) {
          log.push(`tempo esgotado antes do título ${billId}`);
          break;
        }
        try {
          await patchParcelas(billId, lista.map((p) => Core.installmentPayload(p.row, p.novo)));
          for (const p of lista) {
            const resumo = `Prorrogação automática por falta de liberação: vencimento da caução de ${fmtDate(p.anterior)} para ${fmtDate(p.novo)}.`;
            rows.forEach((r) => { if (Core.rowKey(r) === Core.rowKey(p.row)) r.vencimento = p.novo; });
            prorrogadas += 1;
            avisos.push({
              titulo: String(p.row.titulo || ""),
              parcela: String(p.row.parcela || ""),
              credor: String(p.row.credor || ""),
              vencimento: fmtDate(p.novo),
              anterior: fmtDate(p.anterior),
              valor: money(p.row.valorAjustado)
            });
            await auditar(p.row, "ok", resumo, { vencimentoAnterior: p.anterior, vencimentoNovo: p.novo, prorrogada: true });
          }
        } catch (e) {
          const msg = (e && e.message) || String(e);
          falhas.push(`Título ${billId}: ${msg}`);
          for (const p of lista) {
            await auditar(p.row, "erro", `Falha na prorrogação automática da caução para ${fmtDate(p.novo)}. ${msg}`, { vencimentoAnterior: p.anterior, vencimentoNovo: p.novo, erro: msg });
          }
        }
      }
      try {
        await enfileirarAvisos(avisos);
      } catch (e) {
        log.push("fila de avisos: " + e.message);
      }
    }

    const resumoPlano = plano.map((p) => ({ titulo: p.row.titulo, parcela: p.row.parcela, credor: p.row.credor, anterior: p.anterior, novo: p.novo }));
    if (simular) {
      return res.status(200).json({ simulado: true, date: today, range, prazo, caucoes: rows.length, plano: resumoPlano, vencidasRetidas, leituraMs });
    }

    const chunks = await salvarBase(today, rows, {
      range,
      prazo,
      prorrogadas,
      planejadas: plano.length,
      adiadas: Math.max(0, plano.length - fila.length),
      falhas: falhas.slice(0, 20),
      vencidasRetidas,
      leituraMs,
      totalMs: Date.now() - started
    }, anterior);

    return res.status(200).json({
      done: true,
      date: today,
      count: rows.length,
      chunks,
      prorrogadas,
      planejadas: plano.length,
      falhas,
      vencidasRetidas,
      ms: Date.now() - started,
      log
    });
  } catch (error) {
    console.error("[caucao-batimento]", error);
    try {
      await setDoc(metaRef, { running: false, erro: error.message, erroEm: new Date().toISOString() }, { merge: true });
    } catch (e) {}
    return res.status(500).json({ error: error.message, log });
  }
};
