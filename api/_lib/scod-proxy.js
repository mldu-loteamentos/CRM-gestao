const https = require("https");

const SCOD_HOST = process.env.SCOD_HOST || "api.scod.com.br";

function sendJson(res, status, data) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (typeof res.status === "function") return res.status(status).json(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
}

function scodRequest(path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: SCOD_HOST,
      port: 443,
      path,
      method: "GET",
      headers: { Accept: "application/json", authorization: token }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) { json = { raw }; }
        resolve({ status: res.statusCode || 0, json, retryAfter: res.headers["retry-after"] || "" });
      });
    });
    req.setTimeout(45000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  // Só leitura: a integração ainda está em teste e a API também insere/apaga imóveis.
  if (req.method !== "GET") return sendJson(res, 405, { error: "Somente GET." });
  const token = String(process.env.SCOD_API_TOKEN || "").trim();
  if (!token) return sendJson(res, 500, { error: "SCOD_API_TOKEN não configurado no servidor." });

  const url = String(req.url || "");
  const qAt = url.indexOf("?");
  const pathname = (qAt >= 0 ? url.slice(0, qAt) : url).replace(/^\/api\/scod-proxy\/?/, "");
  const search = qAt >= 0 ? url.slice(qAt) : "";
  if (!/^v3\/[\w\-/]+$/.test(pathname) || /\/delete\//i.test(pathname)) {
    return sendJson(res, 400, { error: "Caminho SCOD inválido." });
  }
  try {
    const out = await scodRequest("/" + pathname + search, token);
    if (out.retryAfter && typeof res.setHeader === "function") res.setHeader("Retry-After", String(out.retryAfter));
    return sendJson(res, out.status || 200, out.json == null ? {} : out.json);
  } catch (e) {
    return sendJson(res, 502, { error: "Falha ao consultar a SCOD", details: e.message });
  }
};
