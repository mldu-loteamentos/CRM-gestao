const fs = require("fs");
const path = require("path");
const { graphMailConfigured, sendMail } = require("../../lib/graph-mail");

const FINANCEIRO = "financeiro@mouraleite.com.br";
const ASSINATURAS = {
  naiara: { arquivo: "naiara.png", cid: "assinatura-naiara", alt: "Naiara Iambasso" },
  danielle: { arquivo: "danielle.png", cid: "assinatura-danielle", alt: "Danielle Martins" }
};

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

function emailsDe(value) {
  return [...new Set(String(value || "").split(/[,;]/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)))];
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function assinaturasDe(body) {
  const pedidas = Array.isArray(body && body.assinaturas) ? body.assinaturas : ["danielle"];
  const lista = [];
  pedidas.forEach((nome) => {
    const item = ASSINATURAS[String(nome || "").toLowerCase()];
    if (item && !lista.includes(item)) lista.push(item);
  });
  if (!lista.length) lista.push(ASSINATURAS.danielle);
  return lista;
}

function htmlDo(body, assinaturas) {
  const pagamento = esc(body.pagamento);
  const imgs = assinaturas.map((a) =>
    `<img src="cid:${a.cid}" alt="${esc(a.alt)}" style="display:block;max-width:640px;height:auto;margin:8px 0 0;">`
  ).join("");
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.45;color:#1c2e24;">
    <p style="margin:0 0 14px;">Boa tarde!<br>Tudo bem?</p>
    <p style="margin:0 0 14px;">Encaminho em anexo o relatório do Rydoo para sua conferência.<br>Data do pagamento: ${pagamento}</p>
    <p style="margin:0 0 14px;">Em caso de dúvidas, estou à disposição</p>
    <p style="margin:0 0 8px;">Atenciosamente,</p>
    ${imgs}
  </div>`;
}

function anexoAssinatura(item) {
  const arquivo = path.join(__dirname, "..", "..", "assinaturas-rydoo", item.arquivo);
  const bytes = fs.readFileSync(arquivo);
  return {
    name: item.arquivo,
    contentType: "image/png",
    contentBytes: bytes.toString("base64"),
    contentId: item.cid,
    isInline: true
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  if (req.method !== "POST") return sendJson(res, 405, { error: "Somente POST." });
  let body;
  try { body = await lerBody(req); } catch (e) { return sendJson(res, 400, { error: "Pedido inválido." }); }
  const para = emailsDe(body && body.para);
  const pagamento = String((body && body.pagamento) || "").trim();
  const assunto = String((body && body.assunto) || "").trim().slice(0, 180);
  const nomePdf = String((body && body.nomePdf) || "reembolso.pdf").replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 160) || "reembolso.pdf";
  const pdf = String((body && body.pdf) || "").replace(/\s/g, "");
  if (!para.length) return sendJson(res, 400, { error: "O credor não tem e-mail." });
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(pagamento)) return sendJson(res, 400, { error: "Data do pagamento inválida." });
  if (!assunto || assunto.indexOf("Reembolso Rydoo") !== 0) return sendJson(res, 400, { error: "Assunto do reembolso inválido." });
  if (!pdf || pdf.length < 80 || pdf.length > 4 * 1024 * 1024) return sendJson(res, 400, { error: "O PDF do fechamento não veio no pedido." });
  if (!graphMailConfigured()) return sendJson(res, 503, { error: "O envio de e-mail não está configurado no servidor." });
  const assinaturas = assinaturasDe(body);
  const cc = emailsDe(FINANCEIRO).filter((e) => para.indexOf(e) < 0);
  try {
    await sendMail({
      to: para.join(", "),
      cc: cc.join(", "),
      subject: assunto,
      html: htmlDo(body, assinaturas),
      attachments: assinaturas.map(anexoAssinatura).concat([{
        name: nomePdf,
        contentType: "application/pdf",
        contentBytes: pdf,
        isInline: false
      }])
    });
  } catch (e) {
    const detalhe = String((e && (e.detail || e.message)) || "Falha ao enviar e-mail").slice(0, 280);
    return sendJson(res, 502, { error: detalhe });
  }
  return sendJson(res, 200, { sent: true, para: para, cc: cc });
};
