const https = require("https");

/** Quando api.bcb.gov.br não resolve (DNS), usamos a variação mensal no Ipeadata. */
const IPEA_BY_BCB = {
  "433": "PRECOS12_IPCAG12",
  "189": "IGP12_IGPMG12",
  "7456": "IGP12_INCCMG12",
  "192": "IGP12_INCCG12"
};

function send(res, status, body, json) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  if (typeof res.status === "function") {
    if (json || typeof body !== "string") return res.status(status).json(body);
    return res.status(status).send(body);
  }
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function httpsGet(hostname, path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const reqHttps = https.get({
      hostname,
      path,
      headers: { Accept: "application/json", "User-Agent": "crm-gestao" }
    }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => resolve({
        status: r.statusCode || 200,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    reqHttps.on("error", reject);
    reqHttps.setTimeout(timeoutMs || 22000, () => {
      reqHttps.destroy();
      reject(new Error("Timeout"));
    });
  });
}

function parseBcb(body) {
  try {
    const json = JSON.parse(body);
    return Array.isArray(json) && json.length ? json : null;
  } catch (e) {
    return null;
  }
}

function brToIso(br) {
  const p = String(br || "").split("/");
  if (p.length !== 3) return "";
  return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
}

function parseIpea(body, dataInicial) {
  try {
    const json = JSON.parse(body);
    const rows = (json && json.value) || [];
    if (!rows.length) return null;
    const minIso = brToIso(dataInicial);
    const out = [];
    rows.forEach((r) => {
      const iso = String(r.VALDATA || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      if (minIso && iso < minIso) return;
      const v = Number(r.VALVALOR);
      if (!Number.isFinite(v)) return;
      const [y, m, d] = iso.split("-");
      out.push({ data: `${d}/${m}/${y}`, valor: String(v) });
    });
    return out.length ? out : null;
  } catch (e) {
    return null;
  }
}

async function fetchBcb(code, dataInicial, dataFinal) {
  let path = `/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${encodeURIComponent(dataInicial || "01/01/2018")}`;
  if (dataFinal) path += `&dataFinal=${encodeURIComponent(dataFinal)}`;
  const r = await httpsGet("api.bcb.gov.br", path);
  if (r.status >= 400) return null;
  return parseBcb(r.body);
}

async function fetchIpea(code, dataInicial) {
  const ser = IPEA_BY_BCB[String(code)];
  if (!ser) return null;
  const r = await httpsGet("www.ipeadata.gov.br", `/api/odata4/ValoresSerie(SERCODIGO='${ser}')`);
  if (r.status >= 400) return null;
  return parseIpea(r.body, dataInicial);
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }
  const url = new URL(req.url || "", "http://localhost");
  const code = String(url.searchParams.get("code") || "4391").replace(/\D/g, "") || "4391";
  const dataInicial = url.searchParams.get("dataInicial") || "01/01/2015";
  const dataFinal = url.searchParams.get("dataFinal") || "";

  let lastErr = "";
  try {
    const data = await fetchBcb(code, dataInicial, dataFinal);
    if (data) {
      send(res, 200, data, true);
      return;
    }
  } catch (e) {
    lastErr = e.message || String(e);
  }
  try {
    const data = await fetchIpea(code, dataInicial);
    if (data) {
      send(res, 200, data, true);
      return;
    }
  } catch (e) {
    lastErr = e.message || String(e);
  }
  send(res, 502, { error: lastErr || "Série do Banco Central indisponível" }, true);
};
