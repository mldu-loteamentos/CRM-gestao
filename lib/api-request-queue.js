// Fila compartilhada das chamadas ao Sienge.
// Operador de cobrança (incluindo back office e terceirizado) e Time relacionamento
// entram na frente. Os demais perfis seguem na ordem de chegada.
// A cada 8 atendimentos prioritários com alguém esperando, 1 requisição comum passa,
// para o restante do Integra não ficar parado.

const CORS_ALLOW_HEADERS = "Content-Type, Authorization, X-Crm-Profile";

function readPositiveInt(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeProfileName(name) {
  return String(name || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " E ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPriorityApiProfile(name) {
  const n = normalizeProfileName(name).replace(/\bDE\b/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return false;
  if (n.includes("OPERADOR COBRANCA")) return true;
  if (n.includes("TIME") && n.includes("RELACIONAMENTO")) return true;
  return false;
}

function profileHeader(req) {
  const headers = (req && req.headers) || {};
  const raw = headers["x-crm-profile"] || headers["X-Crm-Profile"] || "";
  const value = Array.isArray(raw) ? raw[0] : raw;
  return normalizeProfileName(String(value || "").replace(/[\r\n]/g, " ")).slice(0, 120);
}

function stripCrmProfileHeader(headers) {
  if (!headers) return headers;
  delete headers["x-crm-profile"];
  delete headers["X-Crm-Profile"];
  return headers;
}

function createApiRequestGate(options) {
  const opts = options || {};
  const maxConcurrent = opts.maxConcurrent || 16;
  const waitMs = opts.waitMs || 25000;
  const maxQueue = opts.maxQueue || 150;
  const priorityBurst = opts.priorityBurst || 8;
  const silent = !!opts.silent;
  let active = 0;
  let highStreak = 0;
  const high = [];
  const normal = [];

  function waiting() {
    return high.length + normal.length;
  }

  function remove(list, job) {
    const i = list.indexOf(job);
    if (i >= 0) list.splice(i, 1);
  }

  function releaseSlot() {
    active = Math.max(0, active - 1);
    pump();
  }

  function grant(job) {
    if (!silent && job.priority && normal.length > 0) {
      console.log("[SIENGE FILA] " + (job.label || "perfil prioritário") + " passou na frente de " + normal.length + " requisição(ões).");
    }
    let released = false;
    job.settle(() => {
      if (released) return;
      released = true;
      releaseSlot();
    });
  }

  function pump() {
    while (active < maxConcurrent && (high.length || normal.length)) {
      let list = high;
      if (high.length && normal.length && highStreak >= priorityBurst) {
        list = normal;
        highStreak = 0;
      } else if (!high.length) {
        list = normal;
        highStreak = 0;
      } else if (normal.length > 0) {
        highStreak += 1;
      } else {
        highStreak = 0;
      }
      const job = list.shift();
      active += 1;
      grant(job);
    }
  }

  function acquire(priority, label, registerCancel) {
    const lanePriority = !!priority;
    if (active < maxConcurrent && high.length === 0 && normal.length === 0) {
      active += 1;
      if (!lanePriority) highStreak = 0;
      let released = false;
      return Promise.resolve(() => {
        if (released) return;
        released = true;
        releaseSlot();
      });
    }
    if (waiting() >= maxQueue) {
      const err = new Error("Fila de requisições da API cheia.");
      err.status = 429;
      return Promise.reject(err);
    }
    return new Promise((resolve, reject) => {
      const list = lanePriority ? high : normal;
      const job = {
        priority: lanePriority,
        label: String(label || "").slice(0, 120),
        done: false,
        settle(release) {
          if (job.done) return;
          job.done = true;
          clearTimeout(timer);
          resolve(release);
        },
        cancel() {
          if (job.done) return;
          job.done = true;
          clearTimeout(timer);
          remove(list, job);
          const err = new Error("Requisição cancelada.");
          err.status = 499;
          reject(err);
        }
      };
      const timer = setTimeout(() => {
        if (job.done) return;
        job.done = true;
        remove(list, job);
        const err = new Error("Tempo esgotado na fila de requisições da API.");
        err.status = 429;
        reject(err);
      }, waitMs);
      list.push(job);
      if (typeof registerCancel === "function") registerCancel(() => job.cancel());
      pump();
    });
  }

  return {
    acquire,
    stats() {
      return { active, high: high.length, normal: normal.length, highStreak };
    }
  };
}

let sharedGate = null;
function getSiengeApiGate() {
  if (!sharedGate) {
    sharedGate = createApiRequestGate({
      maxConcurrent: readPositiveInt("SIENGE_API_CONCURRENCY", 16),
      waitMs: readPositiveInt("SIENGE_API_QUEUE_WAIT_MS", 25000),
      maxQueue: readPositiveInt("SIENGE_API_QUEUE_MAX", 150),
      priorityBurst: readPositiveInt("SIENGE_API_PRIORITY_BURST", 8)
    });
  }
  return sharedGate;
}

function acquireSiengeSlot(req) {
  const profile = profileHeader(req);
  if (req && req.aborted) {
    const err = new Error("Requisição cancelada.");
    err.status = 499;
    return Promise.reject(err);
  }
  let cancel = null;
  if (req && typeof req.once === "function") {
    req.once("aborted", () => { if (typeof cancel === "function") cancel(); });
  }
  return getSiengeApiGate().acquire(isPriorityApiProfile(profile), profile, (fn) => { cancel = fn; });
}

async function takeSiengeSlot(req, res) {
  const release = await acquireSiengeSlot(req);
  if (req && req.aborted) {
    release();
    const err = new Error("Requisição cancelada.");
    err.status = 499;
    throw err;
  }
  return bindSiengeSlotRelease(res, release);
}

function bindSiengeSlotRelease(res, release) {
  let done = false;
  let safety = null;
  const finish = () => {
    if (done) return;
    done = true;
    if (safety) clearTimeout(safety);
    try { release(); } catch (e) {}
  };
  safety = setTimeout(finish, readPositiveInt("SIENGE_API_SLOT_MS", 55000));
  if (typeof safety.unref === "function") safety.unref();
  if (res && typeof res.on === "function") {
    res.on("finish", finish);
    res.on("close", finish);
  }
  return finish;
}

function sendSiengeQueueBusy(res) {
  console.warn("[SIENGE FILA] fila cheia ou tempo esgotado — requisição recusada (429).");
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Retry-After": "2"
  };
  const body = JSON.stringify({
    error: "Fila de requisições da API ocupada. Tente de novo em instantes."
  });
  if (res && typeof res.status === "function") {
    if (typeof res.setHeader === "function") {
      Object.keys(headers).forEach((key) => res.setHeader(key, headers[key]));
    }
    res.status(429).end(body);
    return;
  }
  res.writeHead(429, headers);
  res.end(body);
}

function writeSiengePreflight(res) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Max-Age": "86400"
  };
  if (res && typeof res.setHeader === "function" && typeof res.status === "function") {
    Object.keys(headers).forEach((key) => res.setHeader(key, headers[key]));
    res.status(204).end();
    return;
  }
  res.writeHead(204, headers);
  res.end();
}

module.exports = {
  CORS_ALLOW_HEADERS,
  normalizeProfileName,
  isPriorityApiProfile,
  profileHeader,
  stripCrmProfileHeader,
  createApiRequestGate,
  getSiengeApiGate,
  acquireSiengeSlot,
  takeSiengeSlot,
  bindSiengeSlotRelease,
  sendSiengeQueueBusy,
  writeSiengePreflight
};
