const fs = require("fs");
const path = require("path");

function prestacaoRoot(projectDir) {
  const names = fs.readdirSync(projectDir);
  const hit = names.find((n) => /PRESTA/i.test(n) && /CONTAS/i.test(n));
  return path.join(projectDir, hit || "PRESTAÇÃO DE CONTAS");
}

function safeJoinRoot(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error("Caminho inválido");
  }
  return resolved;
}

function listCompanyFolders(projectDir) {
  const root = prestacaoRoot(projectDir);
  if (!fs.existsSync(root)) return { root, companies: [] };
  const companies = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const m = String(d.name).match(/^(\d+)\s*[-–]\s*(.+)$/);
      return {
        folder: d.name,
        companyId: m ? String(Number(m[1])) : "",
        label: m ? m[2].trim() : d.name
      };
    })
    .filter((c) => c.companyId)
    .sort((a, b) => Number(a.companyId) - Number(b.companyId));
  return { root, companies };
}

function listPdfFiles(projectDir, companyId) {
  const { root, companies } = listCompanyFolders(projectDir);
  const company = companies.find((c) => String(c.companyId) === String(companyId));
  if (!company) return { company: null, files: [] };
  const dir = safeJoinRoot(root, company.folder);
  const files = fs.readdirSync(dir)
    .filter((n) => /\.pdf$/i.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      const ym = String(name).match(/(\d{4})_(\d{2})/);
      return {
        name,
        size: st.size,
        mtime: st.mtimeMs,
        year: ym ? Number(ym[1]) : null,
        month: ym ? Number(ym[2]) : null,
        closing: ym ? `${ym[1]}-${ym[2]}` : ""
      };
    })
    .sort((a, b) => String(b.closing).localeCompare(String(a.closing)) || b.name.localeCompare(a.name));
  return { company, files };
}

function filePath(projectDir, companyId, fileName) {
  const { root, companies } = listCompanyFolders(projectDir);
  const company = companies.find((c) => String(c.companyId) === String(companyId));
  if (!company) throw new Error("Empresa não encontrada na pasta");
  const base = path.basename(String(fileName || ""));
  if (!base || !/\.pdf$/i.test(base)) throw new Error("Arquivo inválido");
  const full = safeJoinRoot(root, company.folder, base);
  if (!fs.existsSync(full)) throw new Error("Arquivo não encontrado");
  return { full, company };
}

function saveUpload(projectDir, companyId, fileName, buffer) {
  const { root, companies } = listCompanyFolders(projectDir);
  const company = companies.find((c) => String(c.companyId) === String(companyId));
  if (!company) throw new Error("Pasta da empresa não encontrada. Crie a pasta no formato ID - NOME.");
  const base = path.basename(String(fileName || "prestacao.pdf")).replace(/[\\/:*?"<>|]+/g, "-");
  const dest = safeJoinRoot(root, company.folder, base.endsWith(".pdf") ? base : base + ".pdf");
  fs.writeFileSync(dest, buffer);
  return { name: path.basename(dest), company };
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers["content-type"] || "");
    const bm = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    const boundary = (bm && (bm[1] || bm[2]) || "").trim();
    if (!boundary) return reject(new Error("Multipart sem boundary"));
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("error", reject);
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      const sep = Buffer.from("--" + boundary);
      const parts = [];
      let start = buf.indexOf(sep);
      while (start >= 0) {
        const next = buf.indexOf(sep, start + sep.length);
        if (next < 0) break;
        parts.push(buf.slice(start + sep.length, next));
        start = next;
      }
      const fields = {};
      let file = null;
      parts.forEach((p) => {
        let body = p;
        if (body[0] === 13 && body[1] === 10) body = body.slice(2);
        const splitAt = body.indexOf(Buffer.from("\r\n\r\n"));
        if (splitAt < 0) return;
        const header = body.slice(0, splitAt).toString("utf8");
        let content = body.slice(splitAt + 4);
        if (content.length >= 2 && content[content.length - 2] === 13) content = content.slice(0, -2);
        const nameM = header.match(/name="([^"]+)"/i);
        const fileM = header.match(/filename="([^"]*)"/i);
        const name = nameM ? nameM[1] : "";
        if (fileM) {
          file = { field: name, filename: fileM[1] || "arquivo.pdf", buffer: content };
        } else if (name) {
          fields[name] = content.toString("utf8").trim();
        }
      });
      resolve({ fields, file });
    });
  });
}

module.exports = {
  prestacaoRoot,
  listCompanyFolders,
  listPdfFiles,
  filePath,
  saveUpload,
  parseMultipart
};
