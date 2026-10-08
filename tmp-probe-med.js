const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "sienge-api.js"), "utf8");
const user = (src.match(/user:\s*"([^"]+)"/) || [])[1];
const pass = (src.match(/\n\s*pass:\s*"([^"]+)"/) || [])[1];
if (!user || !pass) process.exit(1);
const auth = "Basic " + Buffer.from(user + ":" + pass).toString("base64");
const base = "https://api.sienge.com.br/mouraleite/public/api/v1";

async function get(p) {
  const res = await fetch(base + p, { headers: { Authorization: auth, Accept: "application/json" } });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 160) }; }
  return { status: res.status, data };
}

(async () => {
  const inst = await get("/bills/98710/installments");
  const rows = (inst.data && inst.data.results) || [];
  console.log(JSON.stringify({
    instStatus: inst.status,
    instKeys: rows[0] ? Object.keys(rows[0]) : [],
    inst: rows.map((r) => ({
      id: r.installmentId,
      due: r.dueDate,
      amount: r.originalAmount != null ? r.originalAmount : r.amount,
      balance: r.balanceAmount != null ? r.balanceAmount : r.balance,
      situation: r.situation || r.installmentSituation || r.status,
      doc: r.documentNumber || r.documentIdentificationId || "",
      measurement: r.measurementNumber || null,
      payDate: r.paymentDate || (r.payments && r.payments[0] && (r.payments[0].paymentDate || r.payments[0].date)) || null
    }))
  }));
  const bills = await get("/bills?startDate=2026-01-01&endDate=2026-10-08&creditorId=7&limit=200&offset=0");
  const list = (bills.data && bills.data.results) || [];
  const meta = bills.data && bills.data.resultSetMetadata;
  const match = list.filter((b) => String(b.contractNumber || "") === "930").map((b) => ({
    id: b.id,
    doc: String(b.documentIdentificationId || "").trim(),
    number: b.documentNumber,
    med: b.measurementNumber,
    issue: b.issueDate,
    amount: b.totalInvoiceAmount,
    status: b.status
  }));
  console.log(JSON.stringify({ billStatus: bills.status, meta, page: list.length, match }));
  const att = await get("/bills/99351/attachments");
  const atts = (att.data && att.data.results) || [];
  console.log(JSON.stringify({
    attStatus: att.status,
    atts: atts.map((a) => ({ id: a.attachmentid != null ? a.attachmentid : a.attachmentId, name: a.name, description: a.description, type: a.contentType }))
  }));
})();
