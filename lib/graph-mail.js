const https = require("https");

function graphMailConfigured() {
  const secret = String(process.env.GRAPH_CLIENT_SECRET || "").trim();
  if (String(process.env.GRAPH_MAIL_ENABLED || "true").toLowerCase() === "false") return false;
  return !!(process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID && secret && process.env.GRAPH_MAILBOX);
}

function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function graphToken() {
  const form = new URLSearchParams({
    client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials"
  }).toString();
  const res = await request(
    "POST",
    "https://login.microsoftonline.com/" + process.env.GRAPH_TENANT_ID + "/oauth2/v2.0/token",
    { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(form) },
    form
  );
  let json = {};
  try { json = JSON.parse(res.body); } catch (e) {}
  if (!json.access_token) {
    const err = new Error(json.error || "Falha ao autenticar o aplicativo de e-mail");
    err.status = res.status;
    err.detail = String(json.error_description || "").split("\n")[0].slice(0, 280);
    throw err;
  }
  return json.access_token;
}

function addrList(value) {
  return String(value || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

async function sendMail(opts) {
  const access = await graphToken();
  const mailbox = String(process.env.GRAPH_MAILBOX || "").trim();
  const html = opts && opts.html;
  const anexos = (Array.isArray(opts && opts.attachments) ? opts.attachments : [])
    .filter((a) => a && a.contentBytes)
    .map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name || "anexo",
      contentType: a.contentType || "application/octet-stream",
      contentBytes: a.contentBytes,
      contentId: a.contentId || undefined,
      isInline: !!a.isInline
    }));
  const message = {
    subject: (opts && opts.subject) || "",
    body: { contentType: html ? "HTML" : "Text", content: html || (opts && opts.text) || "" },
    toRecipients: addrList(opts && opts.to),
    ccRecipients: addrList(opts && opts.cc)
  };
  if (anexos.length) message.attachments = anexos;
  const payload = JSON.stringify({ message, saveToSentItems: true });
  const res = await request(
    "POST",
    "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(mailbox) + "/sendMail",
    {
      Authorization: "Bearer " + access,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    },
    payload
  );
  if (res.status !== 202 && res.status !== 200) {
    const err = new Error("Falha ao enviar e-mail");
    err.status = res.status;
    err.detail = String(res.body || "").slice(0, 400);
    throw err;
  }
}

async function mailboxReadable() {
  const access = await graphToken();
  const mailbox = String(process.env.GRAPH_MAILBOX || "").trim();
  const res = await request(
    "GET",
    "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(mailbox) + "/mailFolders/inbox?$select=displayName",
    { Authorization: "Bearer " + access }
  );
  if (res.status !== 200) {
    const err = new Error("Falha ao ler a caixa");
    err.status = res.status;
    err.detail = String(res.body || "").slice(0, 400);
    throw err;
  }
  return true;
}

module.exports = { graphMailConfigured, sendMail, mailboxReadable };
