const https = require("https");

function send(res, status, body, json) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", json ? "application/json" : "application/json; charset=utf-8");
  }
  if (typeof res.status === "function") {
    if (json) return res.status(status).json(body);
    return res.status(status).send(body);
  }
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
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
  let path = `/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${encodeURIComponent(dataInicial)}`;
  if (dataFinal) path += `&dataFinal=${encodeURIComponent(dataFinal)}`;

  await new Promise((resolve) => {
    const reqHttps = https.get({
      hostname: "api.bcb.gov.br",
      path,
      headers: { Accept: "application/json", "User-Agent": "crm-gestao" }
    }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        send(res, r.statusCode || 200, Buffer.concat(chunks).toString("utf8"), false);
        resolve();
      });
    });
    reqHttps.on("error", (e) => {
      send(res, 502, { error: e.message }, true);
      resolve();
    });
    reqHttps.setTimeout(25000, () => {
      reqHttps.destroy();
      send(res, 504, { error: "Timeout BCB" }, true);
      resolve();
    });
  });
};
