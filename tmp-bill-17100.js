const fs = require("fs");
const https = require("https");
const src = fs.readFileSync("sienge-api.js", "utf8");
const user = (src.match(/user:\s*"([^"]+)"/) || [])[1];
const pass = (src.match(/pass:\s*"([^"]+)"/) || [])[1];
const auth = Buffer.from(user + ":" + pass).toString("base64");

function get(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: "api.sienge.com.br",
      path: "/mouraleite/public/api/v1" + path,
      headers: { Authorization: "Basic " + auth }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch (e) { resolve({ status: res.statusCode, body: text.slice(0, 400) }); }
      });
    }).on("error", reject);
  });
}

function briefInst(i) {
  return {
    id: i.installmentId || i.id,
    due: i.dueDate,
    sit: i.installmentSituation,
    amount: i.originalValue || i.amount || i.originalAmount,
    balance: i.currentBalance || i.balanceDue,
    cond: i.conditionType || i.paymentConditionType || i.paymentTerm || i.condition,
    receipts: (i.receipts || []).slice(0, 2).map((r) => ({
      date: r.date || r.receiptDate || r.paymentDate,
      value: r.value || r.receiptValue || r.netReceipt
    }))
  };
}

(async () => {
  const bill = await get("/accounts-receivable/receivable-bills/17100");
  const b = bill.body && bill.body.results ? bill.body.results[0] : bill.body;
  const keys = b && typeof b === "object" ? Object.keys(b) : [];
  const slim = {};
  ["id", "billId", "receivableBillId", "documentNumber", "documentIdentificationId", "customerName", "clientName", "enterpriseId", "enterpriseName", "companyId", "contractNumber", "salesContractNumber", "note"].forEach((k) => {
    if (b && b[k] != null) slim[k] = b[k];
  });
  if (b && b.units) slim.units = b.units;
  if (b && b.mainUnit) slim.mainUnit = b.mainUnit;
  console.log("BILL", bill.status, JSON.stringify(slim).slice(0, 1500));
  console.log("KEYS", keys.slice(0, 40).join(","));
  const inst = await get("/accounts-receivable/receivable-bills/17100/installments?limit=200");
  const list = (inst.body && inst.body.results) || [];
  console.log("INST", inst.status, list.length);
  console.log("UNITY", b && b.unityName, "ENT", b && b.enterpriseCode, "DOC", b && b.documentId);
  const units = await get("/units?enterpriseId=16103&limit=5");
  const ur = (units.body && units.body.results) || [];
  console.log("UNITS16103", units.status, ur.length, ur.slice(0, 3).map((u) => ({ name: u.name, bill: u.receivableBillId, ent: u.enterpriseId })));
  const ids = {};
  list.forEach((i) => { const id = String(i.conditionTypeId || ""); ids[id] = (ids[id] || 0) + 1; });
  console.log("CONDS", JSON.stringify(ids));
  const paid = list.filter((i) => Number(i.currentBalance || i.balanceDue || 0) === 0).slice(0, 3);
  paid.forEach((i) => {
    console.log("PAID", i.installmentId, i.dueDate, JSON.stringify({
      cond: i.conditionType, term: i.paymentTerm, pay: i.paymentCondition, type: i.installmentType, sit: i.installmentSituation
    }));
  });
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
