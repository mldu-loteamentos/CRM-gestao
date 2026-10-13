const https = require("https");

function send(res, status, body) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  if (typeof res.status === "function") {
    if (typeof res.setHeader === "function") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    return res.status(status).send(json);
  }
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(json);
}

function httpsGet(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname,
      path,
      headers: { Accept: "application/json", "User-Agent": "crm-gestao" }
    }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => resolve({ status: r.statusCode || 200, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(12000, () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
  });
}

function sim(v) {
  const t = String(v || "").toLowerCase();
  if (t === "sim" || t === "true") return true;
  if (t === "não" || t === "nao" || t === "false") return false;
  return null;
}

function doPublica(j) {
  const e = j && j.estabelecimento;
  if (!e) return null;
  const principal = e.atividade_principal || {};
  const cidade = e.cidade || {};
  const uf = e.estado || {};
  const log = [e.tipo_logradouro, e.logradouro].filter(Boolean).join(" ");
  return {
    razao: j.razao_social || "",
    cnae: principal.id != null ? String(principal.id) : "",
    cnaeDesc: principal.descricao || "",
    secundarios: (Array.isArray(e.atividades_secundarias) ? e.atividades_secundarias : [])
      .filter((c) => c && c.id).map((c) => ({ codigo: String(c.id), descricao: c.descricao || "" })),
    simples: j.simples ? sim(j.simples.simples) : null,
    mei: !!(j.simples && sim(j.simples.mei)),
    situacao: e.situacao_cadastral || "",
    cidade: [cidade.nome, uf.sigla].filter(Boolean).join("/"),
    logradouro: log,
    numero: e.numero != null ? String(e.numero) : "",
    bairro: e.bairro || "",
    municipio: cidade.nome || "",
    uf: uf.sigla || "",
    cep: e.cep != null ? String(e.cep) : ""
  };
}

function doBrasil(j) {
  if (!j || !j.razao_social) return null;
  return {
    razao: j.razao_social || "",
    cnae: j.cnae_fiscal != null ? String(j.cnae_fiscal) : "",
    cnaeDesc: j.cnae_fiscal_descricao || "",
    secundarios: (Array.isArray(j.cnaes_secundarios) ? j.cnaes_secundarios : [])
      .filter((c) => c && Number(c.codigo)).map((c) => ({ codigo: String(c.codigo), descricao: c.descricao || "" })),
    simples: j.opcao_pelo_simples === true ? true : (j.opcao_pelo_simples === false ? false : null),
    mei: j.opcao_pelo_mei === true,
    situacao: j.descricao_situacao_cadastral || "",
    cidade: [j.municipio, j.uf].filter(Boolean).join("/"),
    logradouro: j.logradouro || "",
    numero: j.numero != null ? String(j.numero) : "",
    bairro: j.bairro || "",
    municipio: j.municipio || "",
    uf: j.uf || "",
    cep: j.cep != null ? String(j.cep) : ""
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const url = new URL(req.url || "", "http://localhost");
  const cnpj = String((req.query && req.query.cnpj) || url.searchParams.get("cnpj") || "").replace(/\D/g, "");
  if (cnpj.length !== 14) return send(res, 400, { erro: "CNPJ inválido" });

  try {
    const pub = await httpsGet("publica.cnpj.ws", "/cnpj/" + cnpj);
    if (pub.status === 200) {
      const d = doPublica(JSON.parse(pub.body));
      if (d) return send(res, 200, d);
    }
    if (pub.status === 404) return send(res, 404, { erro: "CNPJ não encontrado no cadastro da Receita" });
  } catch (e) {}

  try {
    const br = await httpsGet("brasilapi.com.br", "/api/cnpj/v1/" + cnpj);
    if (br.status === 200) {
      const d = doBrasil(JSON.parse(br.body));
      if (d) return send(res, 200, d);
    }
    if (br.status === 404) return send(res, 404, { erro: "CNPJ não encontrado no cadastro da Receita" });
    return send(res, 502, { erro: "consulta do CNPJ falhou (" + br.status + ")" });
  } catch (e) {
    return send(res, 502, { erro: "consulta do CNPJ falhou" });
  }
};
