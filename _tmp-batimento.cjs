const fs = require("fs");
const cfg = fs.readFileSync("firebase-config.js", "utf8");
const key = cfg.match(/apiKey:\s*"([^"]+)"/)[1];
const base = "https://firestore.googleapis.com/v1/projects/crm-gestao-mldu/databases/(default)/documents";

function flat(fields) {
  const out = {};
  Object.entries(fields || {}).forEach(([k, v]) => {
    if (v.stringValue != null) out[k] = v.stringValue;
    else if (v.integerValue != null) out[k] = Number(v.integerValue);
    else if (v.doubleValue != null) out[k] = v.doubleValue;
    else if (v.booleanValue != null) out[k] = v.booleanValue;
    else if (v.timestampValue != null) out[k] = v.timestampValue;
    else if (v.arrayValue) out[k] = (v.arrayValue.values || []).length;
    else out[k] = Object.keys(v)[0];
  });
  return out;
}

(async () => {
  const ids = [
    "estoque_comercial/_meta",
    "estoque_comercial/_batimento_state",
    "sienge_defaulters_history/2026-10-22",
    "sienge_defaulters_history/2026-10-21",
    "sienge_defaulters_history/2026-10-20"
  ];
  for (const id of ids) {
    const res = await fetch(base + "/" + id + "?key=" + key);
    const doc = await res.json();
    console.log("\n==", id, res.status);
    if (!doc.fields) {
      console.log(JSON.stringify(doc).slice(0, 300));
      continue;
    }
    const f = flat(doc.fields);
    const keep = ["batimentoDate", "batimentoAt", "batimentoDone", "batimentoMode", "censusLeft", "snapshotAt", "fetchedAt", "unitsSavedDate", "date", "done", "passes", "processed", "failed", "mode", "contractsLeft", "fichaLeft", "message", "warmupDone", "atFull", "timestampStr", "chunks", "cacheRev"];
    const slim = {};
    keep.forEach((k) => { if (f[k] !== undefined) slim[k] = f[k]; });
    console.log(JSON.stringify(slim, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
