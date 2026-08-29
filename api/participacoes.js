const fs = require("fs");
const path = require("path");
const part = require("./participacoes-fs");

module.exports.config = { api: { bodyParser: false } };

function projectDir() {
  return path.join(__dirname, "..");
}

function sendJson(res, status, data) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  if (typeof res.status === "function") return res.status(status).json(data);
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(data));
}

function routeOf(req) {
  const u = String(req.url || "");
  const pathOnly = u.split("?")[0];
  return pathOnly.replace(/^\/api\/participacoes\/?/, "") || "";
}

function queryOf(req) {
  try {
    return new URL(req.url || "", "http://localhost").searchParams;
  } catch (e) {
    return new URLSearchParams();
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  const route = routeOf(req);
  const q = queryOf(req);
  const dir = projectDir();

  try {
    if (req.method === "GET" && (route === "" || route === "companies")) {
      return sendJson(res, 200, part.listCompanyFolders(dir));
    }
    if (req.method === "GET" && route === "files") {
      const companyId = q.get("companyId");
      if (!companyId) return sendJson(res, 400, { error: "companyId obrigatório" });
      return sendJson(res, 200, part.listPdfFiles(dir, companyId));
    }
    if (req.method === "GET" && route === "file") {
      const { full } = part.filePath(dir, q.get("companyId"), q.get("file"));
      const buf = fs.readFileSync(full);
      if (typeof res.setHeader === "function") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline; filename=\"" + encodeURIComponent(path.basename(full)) + "\"");
        res.setHeader("Content-Length", String(buf.length));
      }
      if (typeof res.status === "function") return res.status(200).send(buf);
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/pdf",
        "Content-Length": buf.length
      });
      res.end(buf);
      return;
    }
    if (req.method === "POST" && (route === "upload" || route === "")) {
      const mp = await part.parseMultipart(req);
      const companyId = (mp.fields && mp.fields.companyId) || q.get("companyId") || "";
      if (!mp.file || !mp.file.buffer) return sendJson(res, 400, { error: "Arquivo PDF obrigatório" });
      const saved = part.saveUpload(dir, companyId, mp.file.filename, mp.file.buffer);
      return sendJson(res, 200, saved);
    }
    return sendJson(res, 404, { error: "Rota de participações não encontrada" });
  } catch (e) {
    return sendJson(res, 400, { error: e.message || String(e) });
  }
};
