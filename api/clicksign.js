const https = require("https");

const HOST = String(process.env.CLICKSIGN_HOST || "sandbox.clicksign.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

function sendJson(res, status, data) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (typeof res.status === "function") return res.status(status).json(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
}

function detalhe(json, fallback) {
  const erros = json && json.errors;
  if (Array.isArray(erros) && erros[0]) return erros[0].detail || erros[0].title || fallback;
  if (json && typeof json.error === "string") return json.error;
  return fallback;
}

function click(method, path, token, body) {
  const data = body ? JSON.stringify(body) : "";
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST,
      port: 443,
      path,
      method,
      headers: {
        Authorization: token,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) { json = { raw: raw.slice(0, 400) }; }
        resolve({ status: res.statusCode || 0, json });
      });
    });
    req.setTimeout(50000, () => req.destroy(new Error("A ClickSign demorou para responder.")));
    req.on("error", reject);
    req.end(data);
  });
}

function lerBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string" && req.body) {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error("Pedido inválido.")); }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  if (req.method !== "POST") return sendJson(res, 405, { error: "Somente POST." });
  const token = String(process.env.CLICKSIGN_ACCESS_TOKEN || "").trim();
  if (!token) {
    return sendJson(res, 503, { error: "A chave de teste da ClickSign não está no servidor. Nenhum documento foi enviado." });
  }
  let body;
  try { body = await lerBody(req); } catch (e) { return sendJson(res, 400, { error: "Pedido inválido." }); }
  const nome = String((body && body.nome) || "Cessão de direitos").replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 180);
  let filename = String((body && body.filename) || (nome + ".pdf")).replace(/[\\/]/g, " ").trim();
  if (!/\.pdf$/i.test(filename)) filename += ".pdf";
  const b64 = String((body && body.contentBase64) || "").replace(/^data:application\/pdf;base64,/, "").replace(/\s/g, "");
  if (b64.length < 80 || b64.length > 6000000) {
    return sendJson(res, 400, { error: "O PDF da cessão não pôde ser enviado." });
  }
  const signatarios = Array.isArray(body && body.signatarios) ? body.signatarios.slice(0, 20) : [];
  try {
    const envelope = await click("POST", "/api/v3/envelopes", token, {
      data: {
        type: "envelopes",
        attributes: { name: nome, locale: "pt-BR", auto_close: true }
      }
    });
    if (envelope.status < 200 || envelope.status >= 300) {
      return sendJson(res, 502, { error: detalhe(envelope.json, "A ClickSign não abriu o envelope.") });
    }
    const envelopeId = envelope.json && envelope.json.data && envelope.json.data.id;
    if (!envelopeId) return sendJson(res, 502, { error: "A ClickSign não devolveu o envelope." });
    const doc = await click("POST", "/api/v3/envelopes/" + encodeURIComponent(envelopeId) + "/documents", token, {
      data: {
        type: "documents",
        attributes: {
          filename,
          content_base64: "data:application/pdf;base64," + b64
        }
      }
    });
    if (doc.status < 200 || doc.status >= 300) {
      return sendJson(res, 502, { error: detalhe(doc.json, "A ClickSign não guardou o PDF.") });
    }
    for (const s of signatarios) {
      const email = String(s && s.email || "").trim();
      const person = String(s && s.nome || "").trim();
      if (!email || !person || email.indexOf("@") < 0) continue;
      await click("POST", "/api/v3/envelopes/" + encodeURIComponent(envelopeId) + "/signers", token, {
        data: {
          type: "signers",
          attributes: { name: person.slice(0, 120), email, refusable: false }
        }
      });
    }
    const teste = /sandbox/i.test(HOST);
    return sendJson(res, 200, {
      ok: true,
      envelopeId,
      nome,
      onde: teste
        ? "Ambiente de teste: sandbox.clicksign.com, na lista de rascunhos. Envelope " + envelopeId + "."
        : "Conta ClickSign em " + HOST + ", na lista de rascunhos. Envelope " + envelopeId + "."
    });
  } catch (e) {
    return sendJson(res, 502, { error: e && e.message ? e.message : "Falha ao falar com a ClickSign." });
  }
};
