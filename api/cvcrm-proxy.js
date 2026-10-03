const https = require("https");

const CVCRM_HOST = process.env.CVCRM_HOST || "mouraleite.cvcrm.com.br";
const FALLBACK_EMAIL = "israel@mouraleite.com.br";
const FALLBACK_TOKEN = "6696627a9041eff6f9134d64bd0cb621305ed7fe";

function resolveEmail() {
  const env = String(process.env.CVCRM_EMAIL || "").trim();
  return env.indexOf("@") > 0 ? env : FALLBACK_EMAIL;
}

function resolveToken() {
  const env = String(process.env.CVCRM_TOKEN || "").trim();
  return /^[a-f0-9]{40}$/i.test(env) ? env : FALLBACK_TOKEN;
}

const CVCRM_EMAIL = resolveEmail();
const CVCRM_TOKEN = resolveToken();

function sendJson(res, status, data) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (typeof res.status === "function") return res.status(status).json(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
}

function toApiPath(pathname) {
  let path = String(pathname || "");
  if (!path.startsWith("/")) path = "/" + path;
  if (path.startsWith("/api/")) return path;
  return "/api" + path;
}

function cvRequest(pathname, query) {
  const qs = query && Object.keys(query).length
    ? "?" + Object.keys(query).filter((k) => query[k] != null && String(query[k]) !== "")
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(query[k]))
      .join("&")
    : "";
  const path = toApiPath(pathname) + qs;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: CVCRM_HOST,
      port: 443,
      path,
      method: "GET",
      headers: {
        Accept: "application/json",
        email: CVCRM_EMAIL,
        token: CVCRM_TOKEN,
        Email: CVCRM_EMAIL,
        Token: CVCRM_TOKEN
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) { json = { raw }; }
        resolve({ status: res.statusCode || 0, json, raw, path });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    if (typeof res.status === "function") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return res.status(204).end();
    }
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    return res.end();
  }
  if (!CVCRM_EMAIL || !CVCRM_TOKEN) {
    return sendJson(res, 500, { error: "CVCRM_EMAIL e CVCRM_TOKEN não configurados." });
  }
  const url = String(req.url || "");
  const qAt = url.indexOf("?");
  const pathname = (qAt >= 0 ? url.slice(0, qAt) : url).replace(/^\/api\/cvcrm-proxy\/?/, "");
  const search = qAt >= 0 ? url.slice(qAt + 1) : "";
  const query = {};
  if (search) {
    search.split("&").forEach((part) => {
      const eq = part.indexOf("=");
      if (eq < 0) return;
      query[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
    });
  }
  try {
    const out = await cvRequest("/" + pathname.replace(/^\//, ""), query);
    return sendJson(res, out.status || 200, out.json == null ? { raw: out.raw } : out.json);
  } catch (e) {
    return sendJson(res, 502, { error: "Falha ao consultar o CV CRM", details: e.message });
  }
};

module.exports.cvRequest = cvRequest;
module.exports.CVCRM_HOST = CVCRM_HOST;
