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

function isCancelada(c) {
  if (!c) return false;
  if (c.data_cancelamento) return true;
  const reserva = c.reserva && typeof c.reserva === "object" ? c.reserva : null;
  const t = fold([
    c.nome_situacao, c.situacao, c.situacao_reserva, c.nome_situacao_reserva,
    c.flag_cancelada, c.cancelada,
    reserva && (reserva.situacao || reserva.nome_situacao || reserva.flag_cancelada)
  ].filter(Boolean).join(" "));
  return t.indexOf("CANCEL") >= 0;
}

function pctNumber(raw) {
  const n = parseMoney(raw);
  if (!n) return 0;
  return n > 0 && n <= 1 ? n * 100 : n;
}

function isMoura(nome) {
  const compact = fold(nome).replace(/[^A-Z0-9]/g, "");
  if (!compact) return false;
  if (compact === "MOURALEITE") return true;
  if (compact.indexOf("MOURALEITE") < 0) return false;
  const rest = compact.replace(/IMOBILIARIA|IMOB|IMO|LTDA|EIRELI|SPE|DESENVOLVIMENTO|URBANIZACAO|INCORPORADORA|EMPREENDIMENTOS|HOLDING/g, "");
  return rest === "MOURALEITE";
}

function benText(b) {
  if (!b) return "";
  if (typeof b === "string") return b;
  return [
    b.nome, b.name, b.nome_pessoa, b.nome_beneficiario, b.pessoa,
    b.razao_social, b.nome_fantasia, b.email, b.email_pessoa, b.email_beneficiario
  ].filter(Boolean).join(" ");
}

function benNome(b) {
  if (!b) return "";
  if (typeof b === "string") return b;
  return String(b.nome || b.name || b.nome_pessoa || b.nome_beneficiario || b.pessoa || b.razao_social || "").trim();
}

function listBeneficiarios(c) {
  const raw = c && (c.beneficiarios || c.beneficiario);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw && typeof raw === "object") {
    if (benNome(raw) || raw.email) return [raw];
    return Object.values(raw).filter((x) => x && (typeof x === "object" || typeof x === "string"));
  }
  return [];
}

function benValor(b, totalComissao, allBens) {
  if (!b || typeof b !== "object") return 0;
  const direct = parseMoney(b.valor != null ? b.valor : (b.valor_comissao != null ? b.valor_comissao : b.valor_receber));
  const pct = pctNumber(b.percentual != null ? b.percentual : b.porcentagem);
  let fromShare = 0;
  if (pct && totalComissao && Array.isArray(allBens) && allBens.length) {
    const sumPct = allBens.reduce((s, x) => s + pctNumber(x && (x.percentual != null ? x.percentual : x.porcentagem)), 0);
    if (sumPct > 0) fromShare = totalComissao * (pct / sumPct);
  }
  const prog = programacaoOf(b).filter((p) => p && !p.cancelado && !p.excluido);
  const fromProg = prog.reduce((s, p) => s + parseMoney(p && (p.valor != null ? p.valor : p.valor_pagamento)), 0);
  return Math.max(direct, fromShare, fromProg);
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

async function fetchComissoes(de, ate) {
  const all = [];
  let offset = 0;
  let status = 200;
  let lastJson = null;
  const limit = 100;
  while (offset < 5000) {
    const out = await cvRequest("/v1/financeiro/comissoes", {
      limit,
      offset,
      a_partir_de: de,
      ate,
      cancelados_excluidos: true,
      mostrar_identificadores: true
    });
    status = out.status;
    lastJson = out.json;
    if (out.status >= 400) break;
    const rows = (out.json && (out.json.comissoes || out.json.dados || out.json.data)) || [];
    if (!rows.length) break;
    all.push.apply(all, rows);
    const total = Number(out.json && (out.json.total || out.json.total_de_registros)) || 0;
    if (total && all.length >= total) break;
    if (rows.length < limit) break;
    offset += limit;
  }
  return { items: all, status, lastJson };
}

function programacaoOf(ben) {
  if (!ben) return [];
  if (Array.isArray(ben.programacao)) return ben.programacao;
  if (Array.isArray(ben.programacoes)) return ben.programacoes;
  return [];
}

function splitProgramacao(rows) {
  let aReceber = 0;
  let recebido = 0;
  (rows || []).forEach((p) => {
    const v = parseMoney(p && (p.valor != null ? p.valor : p.valor_pagamento));
    if (isPago(p && (p.situacao || p.nome_situacao))) recebido += v;
    else aReceber += v;
  });
  return { aReceber, recebido };
}

function mapComissao(c) {
  const totalComissao = parseMoney(c && (c.valor_comissao != null ? c.valor_comissao : c.valor));
  let bens = listBeneficiarios(c);
  if (!bens.length && (c.nome_beneficiario || c.beneficiario_nome || c.email_beneficiario)) {
    bens = [{
      nome: c.nome_beneficiario || c.beneficiario_nome,
      email: c.email_beneficiario,
      valor: c.valor_beneficiario != null ? c.valor_beneficiario : c.valor,
      percentual: c.percentual,
      programacao: c.programacao
    }];
  }
  const mouraBens = bens.filter((b) => isMoura(benNome(b)));
  const mouraTop = isMoura(pick(c, ["beneficiario", "nome_beneficiario", "beneficiario_nome"]));
  const hasMoura = mouraBens.length > 0 || mouraTop;
  const use = mouraBens.length ? mouraBens : (mouraTop ? bens : []);
  const prog = use.reduce((acc, b) => acc.concat(programacaoOf(b).filter((p) => p && !p.cancelado && !p.excluido)), []);
  const splitProg = splitProgramacao(prog);
  const mouraValor = use.reduce((s, b) => s + benValor(b, totalComissao, bens), 0)
    || (mouraBens.length === 1 && bens.length === 1 ? totalComissao : 0);
  const recebido = Math.min(mouraValor, splitProg.recebido);
  let split;
  if (isPago(c && (c.nome_situacao || c.situacao)) || (c && c.data_finalizacao)) {
    split = { aReceber: 0, recebido: mouraValor };
  } else {
    split = { aReceber: Math.max(0, mouraValor - recebido), recebido };
  }
  const pagador = (c && c.pagador && (c.pagador.nome || c.pagador.name)) || pick(c, ["pagador_nome", "cliente"]) || "";
  const reserva = pick(c, ["idreserva_cv", "idreserva", "numero_venda", "idreserva_int"]);
  const todosNomes = bens.map(benNome).filter(Boolean);
  return {
    reserva: reserva ? String(reserva) : "",
    empreendimento: pick(c, ["empreendimento"]) || "",
    unidade: pick(c, ["unidade"]) || "",
    serie: "",
    idserie: "",
    vencimento: "",
    valor: totalComissao || (split.aReceber + split.recebido),
    situacao: pick(c, ["nome_situacao", "situacao"]) || "",
    pago: split.recebido > 0 && split.aReceber === 0,
    pagador: pagador ? String(pagador) : "",
    beneficiario: "Moura Leite",
    beneficiarios: todosNomes.join(", "),
    aReceber: split.aReceber,
    recebido: split.recebido,
    commissionSerie: true,
    moura: hasMoura
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
        unidade: r.unidade || "",
        pagador: r.pagador,
        beneficiario: "Moura Leite",
        beneficiarios: r.beneficiarios || r.beneficiario || "",
        comissaoTotal: 0,
        series: [],
        aReceber: 0,
        recebido: 0,
        parcelas: 0
      });
    }
    const g = by.get(key);
    if (r.empreendimento && !g.empreendimento) g.empreendimento = r.empreendimento;
    if (r.unidade && !g.unidade) g.unidade = r.unidade;
    if (r.pagador && !g.pagador) g.pagador = r.pagador;
    if (r.beneficiarios && !g.beneficiarios) g.beneficiarios = r.beneficiarios;
    if (r.serie && g.series.indexOf(r.serie) < 0) g.series.push(r.serie);
    g.parcelas += 1;
    g.comissaoTotal += Number(r.valor) || 0;
    g.aReceber += Number(r.aReceber) || 0;
    g.recebido += Number(r.recebido) || 0;
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

    const parc = await fetchComissoes(de, ate);
    if (parc.status >= 400 && !parc.items.length) {
      return sendJson(res, parc.status || 502, {
        error: (parc.lastJson && (parc.lastJson.mensagem || parc.lastJson.error)) || "Falha ao buscar comissões no CV.",
        detalhe: parc.lastJson,
        seriesError: seriesRes.error || null
      });
    }

    const mapped = (parc.items || []).filter((c) => !isCancelada(c)).map((p) => mapComissao(p, seriesMap));
    const filtered = mapped.filter((r) => r.moura);

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
        ? "Séries de tabela não puderam ser lidas."
        : (!filtered.length ? "Nenhuma comissão com beneficiário Moura Leite nesta competência." : "")
    });
  } catch (e) {
    return sendJson(res, 502, { error: "Falha ao consultar comissões no CV CRM", details: e.message });
  }
};
