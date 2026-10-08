const fs = require("fs");
const https = require("https");
const src = fs.readFileSync("sienge-api.js", "utf8");
const user = (src.match(/user:\s*"([^"]+)"/) || [])[1];
const pass = (src.match(/pass:\s*"([^"]+)"/) || [])[1];
if (!user || !pass) {
  console.log("missing auth fields");
  process.exit(1);
}
const auth = Buffer.from(user + ":" + pass).toString("base64");

function get(path) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.sienge.com.br",
      path: "/mouraleite/public/api/v1" + path,
      method: "GET",
      headers: { Authorization: "Basic " + auth, Accept: "application/json" }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch (e) {}
        resolve({ status: res.statusCode, json, text: text.slice(0, 280) });
      });
    });
    req.on("error", (e) => resolve({ status: 0, json: null, text: String(e.message || e) }));
    req.end();
  });
}

function brief(json) {
  if (!json || typeof json !== "object") return "";
  const rows = json.results || (Array.isArray(json) ? json : null);
  if (Array.isArray(rows)) {
    return "count=" + ((json.resultSetMetadata && json.resultSetMetadata.count) || rows.length)
      + " sampleKeys=" + (rows[0] ? Object.keys(rows[0]).slice(0, 18).join(",") : "-");
  }
  const msg = json.clientMessage || json.developerMessage || "";
  if (msg) return String(msg).slice(0, 180);
  return "keys=" + Object.keys(json).slice(0, 18).join(",");
}

(async () => {
  const bill = await get("/bills/98710");
  const b = bill.json || {};
  console.log("BILL", bill.status, JSON.stringify({
    id: b.id,
    documentIdentificationId: b.documentIdentificationId,
    documentNumber: b.documentNumber,
    contractNumber: b.contractNumber,
    measurementNumber: b.measurementNumber,
    purchaseOrderId: b.purchaseOrderId,
    formattedPurchaseOrderId: b.formattedPurchaseOrderId,
    status: b.status,
    creditorId: b.creditorId,
    companyId: b.companyId,
    issueDate: b.issueDate
  }));
  const inst = await get("/bills/98710/installments?limit=12");
  const rows = (inst.json && inst.json.results) || [];
  console.log("INST", inst.status, "n=" + rows.length);
  rows.slice(0, 3).forEach((row, i) => {
    const links = (row.links || []).map((l) => (l.rel || "") + " " + String(l.href || "").replace("https://api.sienge.com.br/mouraleite/public/api/v1", ""));
    console.log("INST" + i, JSON.stringify({
      installmentNumber: row.installmentNumber,
      situation: row.situation,
      dueDate: row.dueDate,
      amount: row.amount,
      keys: Object.keys(row),
      links
    }));
  });
  const tries = [
    "/supply-contracts?documentId=PCT&contractNumber=930&limit=1",
    "/supply-contracts?documentIdentificationId=PCT&number=930&limit=1",
    "/supply-contracts/PCT/930",
    "/supply-contracts/PCT /930",
    "/contracts/930",
    "/supply-contracts/measurements?contractNumber=930&limit=1",
    "/building-measurements?contractNumber=930&limit=1",
    "/purchase-invoices?supplierId=" + (b.creditorId || "") + "&companyId=1&startDate=2026-01-01&endDate=2026-10-08&limit=1"
  ];
  for (const path of tries) {
    const r = await get(path);
    const msg = r.json && (r.json.clientMessage || r.json.developerMessage || r.json.message);
    console.log(r.status, path, msg ? String(msg).slice(0, 160) : brief(r.json));
  }
})();
