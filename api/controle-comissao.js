const { cvRequest } = require("./cvcrm-proxy");

function sendJson(res, status, data) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (typeof res.status === "function") return res.status(status).json(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
}

function fold(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function parseMoney(raw) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  let s = String(raw).trim();
  if (!s) return 0;
  if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pick(obj, keys) {
  if (!obj) return "";
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v != null && String(v).trim() !== "") return v;
  }
  return "";
}

function isSim(v) {
  const t = fold(v);
  return t === "S" || t === "SIM" || t === "TRUE" || t === "1";
}

function isPago(v) {
  const t = fold(v);
  return t.indexOf("PAGO") >= 0 || t.indexOf("QUIT") >= 0 || t === "S" || t === "SIM";
}

function isMoura(nome) {
  const t = fold(nome);
  return t.indexOf("MOURA LEITE") >= 0 || t.indexOf("MOURA LEITE") >= 0;
}

function namesOf(list) {
  if (!Array.isArray(list)) {
    if (list && typeof list === "object") return [list.nome || list.name || ""].filter(Boolean);
    return list ? [String(list)] : [];
  }
  return list.map((x) => (x && (x.nome || x.name)) || "").filter(Boolean);
}

function firstDay(ym) {
  const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  return "01/" + m[2] + "/" + m[1];
}

function lastDay(ym) {
  const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = new Date(y, mo, 0).getDate();
  return String(d).padStart(2, "0") + "/" + m[2] + "/" + y;
}

function todayYm() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

async function fetchSeries() {
  const first = await cvRequest("/v1/comercial/seriestabeladepreco", { pagina: 1, registros_por_pagina: 500 });
  if (first.status >= 400) return { error: first.json || { status: first.status }, items: [] };
  const root = first.json || {};
  let items = root.dados || root.data || root.series || (Array.isArray(root) ? root : []);
  const pages = Number(root.total_de_paginas || root.total_paginas || 1) || 1;
  for (let p = 2; p <= Math.min(pages, 20); p++) {
    const next = await cvRequest("/v1/comercial/seriestabeladepreco", { pagina: p, registros_por_pagina: 500 });
    if (next.status >= 400) break;
    const more = (next.json && (next.json.dados || next.json.data)) || [];
    items = items.concat(more);
  }
  return { items: items || [], rawStatus: first.status };
}

async function fetchParcelas(de, ate) {
  const all = [];
  let page = 1;
  let status = 200;
  let lastJson = null;
  while (page <= 30) {
    const out = await cvRequest("/v1/financeiro/parcelas-reservas", {
      limite: 100,
      pagina: page,
      tipoFiltro: "vencimento",
      de,
      ate
    });
    status = out.status;
    lastJson = out.json;
    if (out.status >= 400) break;
    const pagamentos = (out.json && (out.json.pagamentos || out.json.dados || out.json.data)) || [];
    if (!pagamentos.length) break;
    all.push.apply(all, pagamentos);
    const total = Number(out.json && (out.json.total || out.json.total_de_registros)) || 0;
    if (total && all.length >= total) break;
    if (pagamentos.length < 100) break;
    page += 1;
  }
  return { items: all, status, lastJson };
}

function mapPagamento(p, seriesMap) {
  const parcelas = Array.isArray(p.parcelas) ? p.parcelas : [];
  const valorParcelas = parcelas.reduce((s, x) => s + parseMoney(x && x.valor), 0);
  const valor = parseMoney(p.valorTotal != null ? p.valorTotal : (p.valor || valorParcelas));
  const bens = namesOf(p.beneficiario || p.beneficiarios);
  const pags = namesOf(p.pagador || p.pagadores);
  const idserie = pick(p, ["idserie", "idSerie", "serie_id", "id_serie"]);
  const serieNome = pick(p, ["serie", "nome_serie", "serie_nome"]) || (seriesMap[String(idserie)] && seriesMap[String(idserie)].nome) || "";
  const serie = seriesMap[String(idserie)] || null;
  const reserva = pick(p, ["idreserva", "idReserva", "reserva", "contrato", "idcontrato", "numero_contrato", "codigo"]);
  const emp = pick(p, ["empreendimento", "empreendimento_nome", "imovel", "unidade"]);
  const situacao = pick(p, ["situacao", "status", "situacao_pagamento", "pago"]);
  const commissionSerie = !!(serie && (isSim(serie.comissao) || isSim(serie.retirar_valor_comissao)));
  const moura = bens.some(isMoura) || isMoura(pick(p, ["beneficiario_nome"]));
  return {
    reserva: reserva ? String(reserva) : "",
    empreendimento: emp ? String(emp) : "",
    serie: serieNome ? String(serieNome) : (idserie ? String(idserie) : ""),
    idserie: idserie ? String(idserie) : "",
    vencimento: pick(p, ["vencimento", "data_vencimento"]) || "",
    valor,
    situacao: situacao ? String(situacao) : "",
    pago: isPago(situacao),
    pagador: pags.join(", "),
    beneficiario: bens.join(", "),
    commissionSerie,
    moura
  };
}

function aggregate(rows) {
  const by = new Map();
  rows.forEach((r) => {
    const key = r.reserva || (r.pagador + "|" + r.empreendimento) || r.vencimento + "|" + r.valor;
    if (!by.has(key)) {
      by.set(key, {
        contrato: r.reserva || "—",
        empreendimento: r.empreendimento,
        pagador: r.pagador,
        beneficiario: r.beneficiario,
        series: [],
        aReceber: 0,
        recebido: 0,
        parcelas: 0
      });
    }
    const g = by.get(key);
    if (r.empreendimento && !g.empreendimento) g.empreendimento = r.empreendimento;
    if (r.pagador && !g.pagador) g.pagador = r.pagador;
    if (r.beneficiario && !g.beneficiario) g.beneficiario = r.beneficiario;
    if (r.serie && g.series.indexOf(r.serie) < 0) g.series.push(r.serie);
    g.parcelas += 1;
    if (r.pago) g.recebido += r.valor;
    else g.aReceber += r.valor;
  });
  return [...by.values()].sort((a, b) => b.aReceber - a.aReceber || String(a.contrato).localeCompare(String(b.contrato), "pt-BR"));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    if (typeof res.status === "function") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(204).end();
    }
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    return res.end();
  }
  try {
    const u = new URL(req.url, "http://localhost");
    const ym = u.searchParams.get("competencia") || todayYm();
    const de = u.searchParams.get("de") || firstDay(ym);
    const ate = u.searchParams.get("ate") || lastDay(ym);

    const seriesRes = await fetchSeries();
    const seriesMap = {};
    (seriesRes.items || []).forEach((s) => {
      const id = s && (s.idserie != null ? s.idserie : s.id);
      if (id == null) return;
      seriesMap[String(id)] = s;
    });
    const commissionSeries = (seriesRes.items || []).filter((s) => isSim(s && s.comissao) || isSim(s && s.retirar_valor_comissao));

    const parc = await fetchParcelas(de, ate);
    if (parc.status >= 400 && !parc.items.length) {
      return sendJson(res, parc.status || 502, {
        error: (parc.lastJson && (parc.lastJson.mensagem || parc.lastJson.error)) || "Falha ao buscar parcelas no CV.",
        detalhe: parc.lastJson,
        seriesError: seriesRes.error || null
      });
    }

    const mapped = (parc.items || []).map((p) => mapPagamento(p, seriesMap));
    const hasSerieLink = mapped.some((r) => r.idserie);
    const filtered = mapped.filter((r) => {
      if (hasSerieLink) return r.commissionSerie || r.moura;
      if (mapped.some((x) => x.moura)) return r.moura;
      return true;
    });

    const contratos = aggregate(filtered);
    const aReceber = contratos.reduce((s, r) => s + r.aReceber, 0);
    const recebido = contratos.reduce((s, r) => s + r.recebido, 0);

    return sendJson(res, 200, {
      competencia: ym,
      de,
      ate,
      totais: {
        contratos: contratos.length,
        parcelas: filtered.length,
        aReceber,
        recebido
      },
      seriesComissao: commissionSeries.map((s) => ({
        idserie: s.idserie,
        nome: s.nome,
        sigla: s.sigla,
        comissao: s.comissao,
        retirar_valor_comissao: s.retirar_valor_comissao
      })),
      contratos,
      aviso: seriesRes.error
        ? "Séries de tabela não puderam ser lidas; a lista usa beneficiário/parcelas."
        : (hasSerieLink ? "" : "As parcelas não vieram com série. Filtro por beneficiário Moura Leite quando houver.")
    });
  } catch (e) {
    return sendJson(res, 502, { error: "Falha ao consultar comissões no CV CRM", details: e.message });
  }
};
