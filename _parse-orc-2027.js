const fs = require("fs");
const dir = process.env.TEMP + "/orc2027";
const sstXml = fs.readFileSync(dir + "/xl_sharedStrings.xml", "utf8");
const sheet = fs.readFileSync(dir + "/xl_worksheets_sheet3.xml", "utf8");

function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

const strings = [];
const siRe = /<si>([\s\S]*?)<\/si>/g;
let m;
while ((m = siRe.exec(sstXml))) {
  const parts = [];
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let t;
  while ((t = tRe.exec(m[1]))) parts.push(decode(t[1]));
  strings.push(parts.join(""));
}

function colOf(ref) {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

const rows = [];
const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
while ((m = rowRe.exec(sheet))) {
  const r = Number(m[1]);
  const cells = {};
  const cRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  let c;
  while ((c = cRe.exec(m[2]))) {
    const attrs = c[1];
    const ref = (attrs.match(/\br="([^"]+)"/) || [])[1];
    if (!ref) continue;
    const t = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
    const v = (c[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    if (v == null) continue;
    const col = colOf(ref);
    cells[col] = t === "s" ? strings[Number(v)] : v;
  }
  rows.push({ r, cells });
}

const header = rows[0];
const out = [];
for (const row of rows.slice(1)) {
  const g = (i) => String(row.cells[i] == null ? "" : row.cells[i]).trim();
  const emp = g(1);
  const cc = g(2);
  const en = g(3);
  const conta = g(4);
  const cn = g(5);
  if (!emp && !conta) continue;
  const meses = [];
  for (let i = 6; i <= 17; i++) {
    const n = Number(String(row.cells[i] || "").replace(",", "."));
    meses.push(Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
  }
  if (!meses.some((n) => n)) continue;
  const id = (emp.match(/^(\d+)\s*-/) || [])[1] || "";
  out.push({ e: id, enome: emp.replace(/^\d+\s*-\s*/, ""), cc, en, conta: conta.trim(), cn, m: meses });
}

const contas = {};
out.forEach((l) => { contas[l.conta + " | " + l.cn] = (contas[l.conta + " | " + l.cn] || 0) + 1; });
console.log("rows", out.length, "empresas", new Set(out.map((l) => l.e)).size, "cc", new Set(out.map((l) => l.cc)).size);
console.log("--- contas ---");
Object.keys(contas).sort().forEach((k) => console.log(k));
fs.writeFileSync(dir + "/linhas.json", JSON.stringify(out));
console.log("bytes", fs.statSync(dir + "/linhas.json").size);
