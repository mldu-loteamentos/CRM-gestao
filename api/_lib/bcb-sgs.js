const https = require("https");

/** Quando api.bcb.gov.br não resolve (DNS), usamos a variação mensal no Ipeadata. */
const IPEA_BY_BCB = {
  "433": "PRECOS12_IPCAG12",
  "189": "IGP12_IGPMG12",
  "7456": "IGP12_INCCMG12",
  "192": "IGP12_INCCG12"
};

function send(res, status, body, json) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  if (typeof res.status === "function") {
    if (json || typeof body !== "string") return res.status(status).json(body);
    return res.status(status).send(body);
  }
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function httpsGet(hostname, path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const reqHttps = https.get({
      hostname,
      path,
      headers: { Accept: "application/json", "User-Agent": "crm-gestao" }
    }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => resolve({
        status: r.statusCode || 200,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    reqHttps.on("error", reject);
    reqHttps.setTimeout(timeoutMs || 22000, () => {
      reqHttps.destroy();
      reject(new Error("Timeout"));
    });
  });
}

function parseBcb(body) {
  try {
    const json = JSON.parse(body);
    return Array.isArray(json) && json.length ? json : null;
  } catch (e) {
    return null;
  }
}

function brToIso(br) {
  const p = String(br || "").split("/");
  if (p.length !== 3) return "";
  return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
}

function parseIpea(body, dataInicial) {
  try {
    const json = JSON.parse(body);
    const rows = (json && json.value) || [];
    if (!rows.length) return null;
    const minIso = brToIso(dataInicial);
    const out = [];
    rows.forEach((r) => {
      const iso = String(r.VALDATA || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      if (minIso && iso < minIso) return;
      const v = Number(r.VALVALOR);
      if (!Number.isFinite(v)) return;
      const [y, m, d] = iso.split("-");
      out.push({ data: `${d}/${m}/${y}`, valor: String(v) });
    });
    return out.length ? out : null;
  } catch (e) {
    return null;
  }
}

async function fetchBcb(code, dataInicial, dataFinal) {
  let path = `/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${encodeURIComponent(dataInicial || "01/01/2018")}`;
  if (dataFinal) path += `&dataFinal=${encodeURIComponent(dataFinal)}`;
  const r = await httpsGet("api.bcb.gov.br", path);
  if (r.status >= 400) return null;
  return parseBcb(r.body);
}

async function fetchIpea(code, dataInicial) {
  const ser = IPEA_BY_BCB[String(code)];
  if (!ser) return null;
  const r = await httpsGet("www.ipeadata.gov.br", `/api/odata4/ValoresSerie(SERCODIGO='${ser}')`);
  if (r.status >= 400) return null;
  return parseIpea(r.body, dataInicial);
}

function simOptante(v) {
  const t = String(v || "").toLowerCase();
  if (t === "sim" || t === "true") return true;
  if (t === "não" || t === "nao" || t === "false") return false;
  return null;
}

function cnpjDaPublica(j) {
  const e = j && j.estabelecimento;
  if (!e) return null;
  const principal = e.atividade_principal || {};
  const cidade = e.cidade || {};
  const uf = e.estado || {};
  return {
    razao: j.razao_social || "",
    cnae: principal.id != null ? String(principal.id) : "",
    cnaeDesc: principal.descricao || "",
    secundarios: (Array.isArray(e.atividades_secundarias) ? e.atividades_secundarias : [])
      .filter((c) => c && c.id).map((c) => ({ codigo: String(c.id), descricao: c.descricao || "" })),
    simples: j.simples ? simOptante(j.simples.simples) : null,
    mei: !!(j.simples && simOptante(j.simples.mei)),
    situacao: e.situacao_cadastral || "",
    cidade: [cidade.nome, uf.sigla].filter(Boolean).join("/"),
    logradouro: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(" "),
    numero: e.numero != null ? String(e.numero) : "",
    bairro: e.bairro || "",
    municipio: cidade.nome || "",
    uf: uf.sigla || "",
    cep: e.cep != null ? String(e.cep) : ""
  };
}

function cnpjDaBrasil(j) {
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

async function consultarCnpj(res, cnpj) {
  if (cnpj.length !== 14) return send(res, 400, { erro: "CNPJ inválido" }, true);
  try {
    const pub = await httpsGet("publica.cnpj.ws", "/cnpj/" + cnpj, 12000);
    if (pub.status === 200) {
      const d = cnpjDaPublica(JSON.parse(pub.body));
      if (d) return send(res, 200, d, true);
    }
    if (pub.status === 404) return send(res, 404, { erro: "CNPJ não encontrado no cadastro da Receita" }, true);
  } catch (e) {}
  try {
    const br = await httpsGet("brasilapi.com.br", "/api/cnpj/v1/" + cnpj, 12000);
    if (br.status === 200) {
      const d = cnpjDaBrasil(JSON.parse(br.body));
      if (d) return send(res, 200, d, true);
    }
    if (br.status === 404) return send(res, 404, { erro: "CNPJ não encontrado no cadastro da Receita" }, true);
    return send(res, 502, { erro: "consulta do CNPJ falhou (" + br.status + ")" }, true);
  } catch (e) {
    return send(res, 502, { erro: "consulta do CNPJ falhou" }, true);
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }
  const url = new URL(req.url || "", "http://localhost");
  const cnpj = String((req.query && req.query.cnpj) || url.searchParams.get("cnpj") || "").replace(/\D/g, "");
  if (cnpj || /\/cnpj\b/.test(url.pathname)) return consultarCnpj(res, cnpj);
  const code = String(url.searchParams.get("code") || "4391").replace(/\D/g, "") || "4391";
  const dataInicial = url.searchParams.get("dataInicial") || "01/01/2015";
  const dataFinal = url.searchParams.get("dataFinal") || "";

  let lastErr = "";
  try {
    const data = await fetchBcb(code, dataInicial, dataFinal);
    if (data) {
      send(res, 200, data, true);
      return;
    }
  } catch (e) {
    lastErr = e.message || String(e);
  }
  try {
    const data = await fetchIpea(code, dataInicial);
    if (data) {
      send(res, 200, data, true);
      return;
    }
  } catch (e) {
    lastErr = e.message || String(e);
  }
  send(res, 502, { error: lastErr || "Série do Banco Central indisponível" }, true);
};
