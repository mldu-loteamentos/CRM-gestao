const { cvRequest } = require("./cvcrm-proxy");
const https = require("https");

const SIENGE_DOMAIN = "mouraleite";
const SIENGE_USER = "mouraleite-contas-a-pagar";
const SIENGE_PASS = "U2riBlrXuOPIpbb7TyRapoxSzaXWUisj";
const SIENGE_AUTH = "Basic " + Buffer.from(`${SIENGE_USER}:${SIENGE_PASS}`).toString("base64");
const COMISSAO_PLAN_KEY = "1020108";

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

function nameKey(s) {
  return fold(s).replace(/[^A-Z0-9]/g, "");
}

function namesMatch(a, b) {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length >= 8 && kb.indexOf(ka) >= 0) return true;
  if (kb.length >= 8 && ka.indexOf(kb) >= 0) return true;
  return false;
}

function accountKey(id) {
  return String(id || "").replace(/\D/g, "");
}

function isComissaoPlan(id, name) {
  if (accountKey(id) === COMISSAO_PLAN_KEY) return true;
  const n = fold(name);
  return n.indexOf("RECEITA DE COMISSAO") >= 0 && n.indexOf("CORRETAG") >= 0;
}

function isNfsDoc(bill) {
  const blob = [
    bill && bill.documentIdentificationId,
    bill && bill.documentId,
    bill && bill.documentType,
    bill && bill.document,
    bill && bill.documentIdentificationName
  ].filter(Boolean).join(" ");
  const t = fold(blob).replace(/[^A-Z0-9]/g, "");
  return t === "NFS" || t.indexOf("NFS") === 0;
}

function nearMoney(a, b) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.03;
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

function isoDay(ym, last) {
  const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  if (!last) return m[1] + "-" + m[2] + "-01";
  const d = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return m[1] + "-" + m[2] + "-" + String(d).padStart(2, "0");
}

function shiftYm(ym, delta) {
  const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function siengeGet(pathname) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.sienge.com.br",
      port: 443,
      path: pathname,
      method: "GET",
      headers: { Authorization: SIENGE_AUTH, Accept: "application/json" }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) { json = { raw }; }
        resolve({ status: res.statusCode || 0, json });
      });
    });
    req.on("error", reject);
    req.setTimeout(25000, () => {
      req.destroy(new Error("Sienge timeout"));
    });
    req.end();
  });
}

function partyName(obj) {
  if (!obj) return "";
  return String(
    obj.clientName || obj.customerName || obj.creditorName || obj.creditor
    || obj.client || obj.customer || obj.nomeCliente || obj.name || ""
  ).trim();
}

function billValue(obj) {
  return parseMoney(obj && (
    obj.receivableBillValue != null ? obj.receivableBillValue
      : (obj.totalInvoiceAmount != null ? obj.totalInvoiceAmount
        : (obj.amount != null ? obj.amount
          : (obj.value != null ? obj.value : obj.paidAmount)))
  ));
}

function catsOf(obj) {
  if (!obj) return [];
  const raw = obj.financialCategories || obj.budgetCategories || obj.costCenters
    || obj.accounts || obj.revenueAppropriations || obj.apropriacoes || [];
  return Array.isArray(raw) ? raw : [];
}

function billHasComissaoPlan(obj) {
  if (!obj) return false;
  if (isComissaoPlan(obj.financialCategoryId, obj.financialCategoryName)) return true;
  return catsOf(obj).some((fc) => isComissaoPlan(
    fc && (fc.financialCategoryId || fc.id || fc.accountId),
    fc && (fc.financialCategoryName || fc.name || fc.description)
  ));
}

function incomeShareForPlan(mov) {
  const cats = catsOf(mov);
  if (!cats.length) return billHasComissaoPlan(mov) ? 1 : 0;
  let hit = 0;
  let sum = 0;
  cats.forEach((fc) => {
    const rate = Number(fc && fc.financialCategoryRate);
    const pts = Number.isFinite(rate) && rate > 0 ? (rate > 1 ? rate : rate * 100) : 0;
    sum += pts;
    if (isComissaoPlan(fc && (fc.financialCategoryId || fc.id), fc && (fc.financialCategoryName || fc.name))) {
      hit += pts || 100;
    }
  });
  if (!hit) return 0;
  const denom = sum > 0 ? (sum > 100.0001 ? sum : 100) : 100;
  return Math.min(1, hit / denom);
}

async function listReceivableBills(start, end, selectionType) {
  const all = [];
  let offset = 0;
  const limit = 200;
  while (offset < 2000) {
    const qs = [
      "startDate=" + encodeURIComponent(start),
      "endDate=" + encodeURIComponent(end),
      "selectionType=" + encodeURIComponent(selectionType || "I"),
      "limit=" + limit,
      "offset=" + offset
    ].join("&");
    const out = await siengeGet("/mouraleite/public/api/v1/accounts-receivable/receivable-bills?" + qs);
    if (out.status >= 400) break;
    const rows = (out.json && (out.json.results || out.json.data || out.json.bills)) || [];
    if (!Array.isArray(rows) || !rows.length) break;
    all.push.apply(all, rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

async function fetchIncome(start, end, selectionType) {
  const out = await siengeGet(
    "/mouraleite/public/api/bulk-data/v1/income?startDate=" + encodeURIComponent(start)
    + "&endDate=" + encodeURIComponent(end)
    + "&selectionType=" + encodeURIComponent(selectionType || "P")
  );
  if (out.status >= 400) return [];
  const rows = (out.json && (out.json.data || out.json.results)) || [];
  return Array.isArray(rows) ? rows : [];
}

async function fetchBillDetail(id) {
  if (!id) return null;
  const out = await siengeGet("/mouraleite/public/api/v1/accounts-receivable/receivable-bills/" + encodeURIComponent(id));
  if (out.status >= 400) return null;
  return out.json || null;
}

function mapNfsRow(raw, valor) {
  return {
    nome: partyName(raw),
    valor: Number(valor) || 0,
    titulo: String(raw.receivableBillId || raw.billReceivableId || raw.id || raw.billId || ""),
    documento: String(raw.documentNumber || raw.documentIdentificationNumber || raw.number || ""),
    data: String(raw.payOffDate || raw.issueDate || raw.date || raw.dueDate || "").slice(0, 10)
  };
}

async function fetchNfsComissao(ym) {
  const start = isoDay(shiftYm(ym, -1), false);
  const end = isoDay(shiftYm(ym, 2), true);
  const seen = new Set();
  const rows = [];

  const pushRow = (row) => {
    if (!row || !row.nome || !(row.valor > 0)) return;
    const key = (row.titulo || "") + "|" + nameKey(row.nome) + "|" + row.valor.toFixed(2);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  try {
    const incomes = []
      .concat(await fetchIncome(start, end, "M"))
      .concat(await fetchIncome(start, end, "P"));
    incomes.forEach((mov) => {
      if (!isNfsDoc(mov)) return;
      const share = incomeShareForPlan(mov);
      if (!share) return;
      pushRow(mapNfsRow(mov, billValue(mov) * share));
    });
  } catch (e) {}

  if (rows.length) return rows;

  try {
    const bills = []
      .concat(await listReceivableBills(start, end, "I"))
      .concat(await listReceivableBills(start, end, "P"));
    const seenBill = new Set();
    const nfs = [];
    bills.forEach((b) => {
      const id = String(b.receivableBillId || b.id || "");
      if (id && seenBill.has(id)) return;
      if (id) seenBill.add(id);
      if (isNfsDoc(b)) nfs.push(b);
    });
    for (let i = 0; i < nfs.length && i < 40; i++) {
      let bill = nfs[i];
      if (!billHasComissaoPlan(bill)) {
        const detail = await fetchBillDetail(bill.receivableBillId || bill.id);
        if (detail) bill = Object.assign({}, bill, detail);
      }
      if (!billHasComissaoPlan(bill)) continue;
      const paid = !!(bill.payOffDate || bill.paymentDate || fold(bill.situation || bill.status).indexOf("QUIT") >= 0);
      if (!paid) continue;
      pushRow(mapNfsRow(bill, billValue(bill)));
    }
  } catch (e) {}

  return rows;
}

function applySiengeRecebido(contratos, nfsRows) {
  const pool = (nfsRows || []).map((n) => Object.assign({}, n, { left: Number(n.valor) || 0 }));
  (contratos || []).forEach((c) => {
    c.recebido = 0;
    c.nfsTitulos = [];
  });
  const take = (c, exact) => {
    let need = Math.max(0, (Number(c.mouraValor) || 0) - (Number(c.recebido) || 0));
    if (need <= 0.02) return;
    for (let i = 0; i < pool.length; i++) {
      const n = pool[i];
      if (n.left <= 0.02) continue;
      if (!namesMatch(c.pagador, n.nome)) continue;
      if (exact && !nearMoney(n.left, need) && !nearMoney(n.valor, need)) continue;
      const applied = Math.min(n.left, need);
      if (applied <= 0.02) continue;
      n.left = Math.round((n.left - applied) * 100) / 100;
      c.recebido = Math.round(((Number(c.recebido) || 0) + applied) * 100) / 100;
      need = Math.max(0, (Number(c.mouraValor) || 0) - (Number(c.recebido) || 0));
      c.nfsTitulos.push({
        titulo: n.titulo,
        documento: n.documento,
        valor: applied,
        data: n.data
      });
      if (need <= 0.02) break;
    }
  };
  (contratos || []).forEach((c) => take(c, true));
  (contratos || []).forEach((c) => take(c, false));
  (contratos || []).forEach((c) => {
    const moura = Number(c.mouraValor) || 0;
    c.recebido = Math.min(moura, Number(c.recebido) || 0);
    c.aReceber = Math.max(0, Math.round((moura - c.recebido) * 100) / 100);
  });
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
  const raw = Array.isArray(ben.programacao) ? ben.programacao
    : (Array.isArray(ben.programacoes) ? ben.programacoes : []);
  return raw.filter((p) => p && typeof p === "object" && !Array.isArray(p) && (p.valor != null || p.vencimento || p.idpagamento));
}

function mapParcelas(prog) {
  return (prog || []).filter((p) => p && !p.cancelado && !p.excluido).map((p) => ({
    id: p.idpagamento != null ? String(p.idpagamento) : "",
    vencimento: String(p.vencimento || p.data_medicao || p.data_pagamento || "").slice(0, 10),
    valor: parseMoney(p.valor != null ? p.valor : p.valor_pagamento),
    situacao: String(p.situacao || p.nome_situacao || ""),
    forma: String(p.forma_pagamento || ""),
    pago: isPago(p.situacao || p.nome_situacao)
  })).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || String(a.id).localeCompare(String(b.id)));
}

function programacaoLinhas(bens) {
  const linhas = [];
  (bens || []).forEach((b) => {
    const nome = benNome(b);
    mapParcelas(programacaoOf(b)).forEach((p) => {
      linhas.push({
        id: p.id,
        beneficiario: nome,
        vencimento: p.vencimento,
        valor: p.valor,
        situacao: p.situacao,
        pago: p.pago
      });
    });
  });
  return linhas;
}

function indexarProgramacao(linhas) {
  const by = new Map();
  (linhas || []).forEach((p) => {
    const k = fold(p && p.beneficiario);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(p);
  });
  const out = [];
  by.forEach((list) => {
    list.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || String(a.id).localeCompare(String(b.id)));
    list.forEach((p, i) => {
      out.push(Object.assign({}, p, { indice: i + 1, total: list.length }));
    });
  });
  out.sort((a, b) => String(a.beneficiario).localeCompare(String(b.beneficiario), "pt-BR") || a.indice - b.indice);
  return out;
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
  const mouraValor = use.reduce((s, b) => s + benValor(b, totalComissao, bens), 0)
    || (mouraBens.length === 1 && bens.length === 1 ? totalComissao : 0);
  const pagador = (c && c.pagador && (c.pagador.nome || c.pagador.name)) || pick(c, ["pagador_nome", "cliente"]) || "";
  const reserva = pick(c, ["idreserva_cv", "idreserva", "numero_venda", "idreserva_int"]);
  const todosNomes = bens.map(benNome).filter(Boolean);
  const beneficiariosDetalhe = bens.map((b) => ({
    nome: benNome(b),
    valor: benValor(b, totalComissao, bens)
  })).filter((x) => x.nome);
  return {
    reserva: reserva ? String(reserva) : "",
    empreendimento: pick(c, ["empreendimento"]) || "",
    unidade: pick(c, ["unidade"]) || "",
    serie: "",
    idserie: "",
    vencimento: "",
    valor: totalComissao || mouraValor,
    situacao: pick(c, ["nome_situacao", "situacao"]) || "",
    pago: false,
    pagador: pagador ? String(pagador) : "",
    beneficiario: "Moura Leite",
    beneficiarios: todosNomes.join(", "),
    beneficiariosDetalhe,
    aReceber: mouraValor,
    recebido: 0,
    mouraValor,
    parcelas: mapParcelas(prog),
    programacao: programacaoLinhas(bens),
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
        beneficiariosDetalhe: [],
        comissaoTotal: 0,
        mouraValor: 0,
        series: [],
        aReceber: 0,
        recebido: 0,
        qtdParcelas: 0,
        parcelas: [],
        programacao: []
      });
    }
    const g = by.get(key);
    if (r.empreendimento && !g.empreendimento) g.empreendimento = r.empreendimento;
    if (r.unidade && !g.unidade) g.unidade = r.unidade;
    if (r.pagador && !g.pagador) g.pagador = r.pagador;
    if (r.beneficiarios && !g.beneficiarios) g.beneficiarios = r.beneficiarios;
    (r.beneficiariosDetalhe || []).forEach((d) => {
      if (!d || !d.nome) return;
      const hit = g.beneficiariosDetalhe.find((x) => fold(x.nome) === fold(d.nome));
      if (hit) hit.valor += Number(d.valor) || 0;
      else g.beneficiariosDetalhe.push({ nome: d.nome, valor: Number(d.valor) || 0 });
    });
    if (r.serie && g.series.indexOf(r.serie) < 0) g.series.push(r.serie);
    (r.parcelas || []).forEach((p) => {
      if (p.id && g.parcelas.some((x) => x.id === p.id)) return;
      g.parcelas.push(p);
    });
    (r.programacao || []).forEach((p) => {
      if (p.id && g.programacao.some((x) => x.id === p.id)) return;
      g.programacao.push(p);
    });
    g.qtdParcelas = g.parcelas.length;
    g.comissaoTotal += Number(r.valor) || 0;
    g.mouraValor += Number(r.mouraValor) || 0;
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
    contratos.forEach((g) => {
      g.parcelas.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || String(a.id).localeCompare(String(b.id)));
      g.qtdParcelas = g.parcelas.length;
      g.programacao = indexarProgramacao(g.programacao);
    });
    let nfsRows = [];
    let nfsAviso = "";
    try {
      nfsRows = await fetchNfsComissao(ym);
      applySiengeRecebido(contratos, nfsRows);
    } catch (e) {
      nfsAviso = "Não foi possível cruzar os NFS de comissão no Sienge.";
      contratos.forEach((g) => {
        g.recebido = 0;
        g.aReceber = Number(g.mouraValor) || 0;
      });
    }
    const aReceber = contratos.reduce((s, r) => s + r.aReceber, 0);
    const recebido = contratos.reduce((s, r) => s + r.recebido, 0);

    return sendJson(res, 200, {
      competencia: ym,
      de,
      ate,
      totais: {
        contratos: contratos.length,
        parcelas: contratos.reduce((s, r) => s + (r.qtdParcelas || 0), 0),
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
      aviso: [
        seriesRes.error ? "Séries de tabela não puderam ser lidas." : "",
        !filtered.length ? "Nenhuma comissão com beneficiário Moura Leite nesta competência." : "",
        nfsAviso
      ].filter(Boolean).join(" ")
    });
  } catch (e) {
    return sendJson(res, 502, { error: "Falha ao consultar comissões no CV CRM", details: e.message });
  }
};
