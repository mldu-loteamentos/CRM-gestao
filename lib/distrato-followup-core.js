/**
 * Documentos pendentes de assinatura (distrato, cessão e aditamento) que o Sienge já lançou
 * saem da fila "Aguardando". Roda no batimento das 7h, junto com os demais.
 * Distrato: título cancelado, baixa de distrato ou anexo DISTRATO na unidade.
 * Cessão: o titular do título deixou de ser o cedente gravado na geração.
 * Aditamento: reparcelamento no dia do documento ou plano de parcelas diferente.
 */
const COL = "relacionamento_docs_assinatura";

function digitos(v) {
  return String(v || "").replace(/\D/g, "");
}

function baixaDeDistrato(rec) {
  if (!rec) return false;
  const tipo = String(rec.type || rec.receiptType || rec.receiptTypeId || rec.typeId || "").toLowerCase();
  const extra = String(rec.typeName || rec.receiptTypeName || rec.description || rec.historic || rec.history || "").toLowerCase();
  const blob = (tipo + " " + extra).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (blob.includes("distrato") || blob.includes("cancel")) return true;
  return tipo === "3" || tipo === "7";
}

function tituloCancelado(bill) {
  if (!bill || typeof bill !== "object") return false;
  const sit = String(bill.status || bill.situation || "").toUpperCase();
  const data = bill.cancellationDate || bill.revokedDate || bill.revokedBillReceivableDate || bill.cancelDate;
  if (data) return true;
  if (sit === "CANCELED" || sit === "DISTRATO") return true;
  return bill.active === false && !bill.payOffDate && !bill.payoffDate;
}

function parcelasBaixadas(inst) {
  const lista = Array.isArray(inst) ? inst : [];
  if (!lista.length) return false;
  let aberto = 0;
  let baixa = false;
  lista.forEach((p) => {
    aberto += Number(p && (p.currentBalance != null ? p.currentBalance : p.balanceDue)) || 0;
    ((p && p.receipts) || []).forEach((rc) => {
      if (baixaDeDistrato(rc)) baixa = true;
    });
  });
  return baixa && aberto <= 0.009;
}

async function tituloBaixado(siengeFetch, billId) {
  const id = digitos(billId);
  if (!id) return false;
  let bill = null;
  try {
    bill = await siengeFetch("/accounts-receivable/receivable-bills/" + encodeURIComponent(id));
  } catch (e) {
    const msg = String((e && e.message) || e || "");
    if (/\b404\b/.test(msg)) return false;
    throw e;
  }
  if (tituloCancelado(bill)) return true;
  let inst = [];
  try {
    const res = await siengeFetch("/accounts-receivable/receivable-bills/" + encodeURIComponent(id) + "/installments?limit=200");
    inst = (res && res.results) || (Array.isArray(res) ? res : []);
  } catch (e) {
    inst = [];
  }
  if (parcelasBaixadas(inst)) return true;
  const customerId = bill && bill.customerId;
  if (!customerId) return false;
  try {
    const res = await siengeFetch("/sales-contracts?customerId=" + encodeURIComponent(customerId) + "&situation=3&limit=200");
    const lista = (res && res.results) || [];
    return lista.some((c) => digitos(c && c.receivableBillId) === id);
  } catch (e) {
    return false;
  }
}

function normNome(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function mesmoNome(a, b) {
  const x = normNome(a);
  const y = normNome(b);
  if (!x || !y || x === "—" || y === "—") return false;
  if (x === y) return true;
  const curto = x.length <= y.length ? x : y;
  const longo = x.length <= y.length ? y : x;
  return curto.length >= 8 && longo.indexOf(curto) === 0;
}

function centroDe(row) {
  const salvo = digitos(row && row.centroId);
  if (salvo) return salvo;
  const u = String((row && row.unidade) || "");
  const direto = u.match(/^(\d{4,6})\b/);
  if (direto) return direto[1];
  const unidade = u.match(/U-(\d{4,6})/i);
  return unidade ? unidade[1] : "";
}

function nomeUnidade(row) {
  const u = String((row && row.unidade) || "").trim();
  const cc = centroDe(row);
  if (/^U-\d+/i.test(u)) {
    const rest = u.replace(/^U-/i, "");
    if (cc && rest.indexOf(cc + "-") === 0) return rest.slice(cc.length + 1).replace(/-/g, " ");
    const partes = rest.split("-");
    return partes.slice(1).join("-").replace(/-/g, " ") || rest;
  }
  if (u.indexOf(" - ") >= 0) return u.split(" - ").slice(1).join(" - ").trim();
  return u;
}

function normUn(v) {
  return String(v || "").replace(/[\s-]+/g, "").toUpperCase();
}

function listaSienge(res) {
  if (Array.isArray(res)) return res;
  return (res && (res.results || res.data)) || [];
}

function planoDeParcelas(lista) {
  return (lista || []).map((p) => {
    if (!p) return "";
    const id = String(p.installmentId != null ? p.installmentId : (p.installmentNumber != null ? p.installmentNumber : ""));
    const due = String(p.dueDate || p.originalDueDate || "").slice(0, 10);
    const valor = Number(p.originalValue != null ? p.originalValue : (p.originalAmount != null ? p.originalAmount : (p.amount || 0))) || 0;
    return [id, due, valor.toFixed(2)].join(":");
  }).filter(Boolean).sort().join("|");
}

function datasDe(lista, keys) {
  const out = [];
  (lista || []).forEach((item) => {
    if (!item || typeof item !== "object") return;
    for (let i = 0; i < keys.length; i++) {
      const d = String(item[keys[i]] || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        out.push(d);
        break;
      }
    }
  });
  return out;
}

function aditamentoMudou(row, datas, planoAtual) {
  const dia = String((row && row.createdAt) || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dia) && (datas || []).some((d) => String(d).slice(0, 10) >= dia)) return true;
  const salvo = String((row && row.plano) || "");
  const atual = String(planoAtual || "");
  return !!(salvo && atual && salvo !== atual);
}

async function mapaTemDistrato(fx, db, row) {
  if (!fx.getDoc) return false;
  const centro = centroDe(row);
  if (!centro) return false;
  const un = normUn(nomeUnidade(row));
  const titulo = digitos(row.titulo);
  let data = {};
  try {
    const snap = await fx.getDoc(fx.doc(db, "anexos_mapa", centro));
    const existe = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists);
    if (!existe) return false;
    data = (snap.data() || {}).byKey || {};
  } catch (e) {
    return false;
  }
  return Object.keys(data).some((k) => {
    const rec = data[k];
    if (!rec || String(rec.tag || k.split("_").pop() || "").toUpperCase() !== "DISTRATO") return false;
    const nome = normUn(rec.unitName || rec.unidade || "");
    const ids = [rec.contractId, rec.contractNumber, rec.receivableBillId, rec.titulo].map((v) => digitos(v));
    if (titulo && ids.indexOf(titulo) >= 0) return true;
    return !!(un && nome && (nome === un || nome.indexOf(un) >= 0 || un.indexOf(nome) >= 0));
  });
}

async function anexoDistratoNaUnidade(siengeFetch, row) {
  const centro = centroDe(row);
  const nome = nomeUnidade(row);
  if (!centro || !nome) return false;
  let unidades = [];
  try {
    const res = await siengeFetch("/units?limit=50&offset=0&enterpriseId=" + encodeURIComponent(centro) + "&name=" + encodeURIComponent(nome) + "&additionalData=NONE");
    unidades = listaSienge(res);
  } catch (e) {
    return false;
  }
  const want = normUn(nome);
  const hit = unidades.find((u) => {
    const n = normUn(u && u.name);
    return n && want && (n === want || n.indexOf(want) >= 0 || want.indexOf(n) >= 0);
  }) || (unidades.length === 1 ? unidades[0] : null);
  if (!hit || !hit.id) return false;
  try {
    const res = await siengeFetch("/units/" + encodeURIComponent(hit.id) + "/attachments?limit=200&offset=0");
    return listaSienge(res).some((a) => /DISTRATO/i.test(String((a && (a.description || a.name || a.fileName)) || "")));
  } catch (e) {
    return false;
  }
}

async function titularAtual(siengeFetch, billId, cache) {
  if (cache.has(billId)) return cache.get(billId);
  let atual = null;
  try {
    const bill = await siengeFetch("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId));
    if (bill && typeof bill === "object") {
      const pessoa = bill.customer || bill.client || {};
      const id = digitos(bill.customerId || bill.clientId || pessoa.id || pessoa.customerId || pessoa.clientId);
      let nome = String(bill.clientName || bill.customerName || pessoa.name || pessoa.clientName || "").trim();
      if (!nome && id) {
        try {
          const cli = await siengeFetch("/customers/" + encodeURIComponent(id));
          nome = String((cli && (cli.name || cli.clientName)) || "").trim();
        } catch (e) {}
      }
      if (id) atual = { id: id, nome: nome };
    }
  } catch (e) {
    atual = null;
  }
  cache.set(billId, atual);
  return atual;
}

function nomeCedente(row) {
  return String((row && (row.cedenteNome || row.titularNome)) || "").trim();
}

function cessaoMudou(row, atual) {
  if (!row || !atual) return false;
  const salvo = digitos(row.titularId);
  const agora = digitos(atual.id);
  if (salvo && agora) return salvo !== agora;
  const base = nomeCedente(row) || String(row.cliente || "").trim();
  if (!base || !atual.nome) return false;
  return !mesmoNome(base, atual.nome);
}

async function aditamentoLancado(siengeFetch, row) {
  const billId = digitos(row.titulo);
  if (!billId) return false;
  let datas = [];
  try {
    const remade = await siengeFetch("/remade-installments?billReceivableId=" + encodeURIComponent(billId));
    datas = datasDe(listaSienge(remade), ["remadeDate", "calculationDate", "date", "generatedDate", "negotiationDate", "generationDate", "createdAt", "registerDate"]);
  } catch (e) {}
  let planoAtual = "";
  if (row.plano || !datas.length) {
    try {
      const res = await siengeFetch("/accounts-receivable/receivable-bills/" + encodeURIComponent(billId) + "/installments?limit=200");
      const inst = listaSienge(res);
      if (inst.length) {
        planoAtual = planoDeParcelas(inst);
        datas = datas.concat(datasDe(inst, ["generationDate", "generatedDate", "remadeDate", "remadeInstallmentsDate", "createdDate"]));
      }
    } catch (e) {}
  }
  return aditamentoMudou(row, datas, planoAtual);
}

async function documentoLancado(siengeFetch, fx, db, row, caches) {
  const tipo = String(row.tipo || "");
  const titulo = digitos(row.titulo);
  if (tipo === "distrato") {
    if (!caches.distrato.has(titulo)) {
      let baixado = false;
      try { baixado = await tituloBaixado(siengeFetch, titulo); } catch (e) { baixado = false; }
      if (!baixado) {
        try { baixado = await mapaTemDistrato(fx, db, row); } catch (e) { baixado = false; }
      }
      if (!baixado) {
        try { baixado = await anexoDistratoNaUnidade(siengeFetch, row); } catch (e) { baixado = false; }
      }
      caches.distrato.set(titulo, baixado);
    }
    return caches.distrato.get(titulo);
  }
  if (tipo === "cessao") {
    if (!titulo) return false;
    const atual = await titularAtual(siengeFetch, titulo, caches.titular);
    return cessaoMudou(row, atual);
  }
  if (tipo === "aditamento") return aditamentoLancado(siengeFetch, row);
  return false;
}

async function marcarBaixados(opts) {
  const db = opts.db;
  const siengeFetch = opts.siengeFetch;
  const fx = opts.fx;
  const snap = await fx.getDocs(fx.collection(db, COL));
  const pendentes = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const tipo = String(data.tipo || "");
    if (tipo !== "distrato" && tipo !== "cessao" && tipo !== "aditamento") return;
    if (String(data.status || "") === "lancado") return;
    if (!digitos(data.titulo)) return;
    pendentes.push(Object.assign({ id: d.id }, data));
  });
  const caches = { distrato: new Map(), titular: new Map() };
  let marcados = 0;
  const titulos = [];
  const porTipo = { distrato: 0, cessao: 0, aditamento: 0 };
  for (let i = 0; i < pendentes.length; i++) {
    const row = pendentes[i];
    let lancado = false;
    try { lancado = await documentoLancado(siengeFetch, fx, db, row, caches); } catch (e) { lancado = false; }
    if (!lancado) continue;
    await fx.updateDoc(fx.doc(db, COL, row.id), {
      status: "lancado",
      lancadoEm: new Date().toISOString(),
      lancadoPor: "batimento-7h"
    });
    marcados += 1;
    porTipo[row.tipo] = (porTipo[row.tipo] || 0) + 1;
    const titulo = digitos(row.titulo);
    if (titulos.indexOf(titulo) < 0) titulos.push(titulo);
    if (i < pendentes.length - 1) await new Promise((r) => setTimeout(r, 180));
  }
  return { olhados: pendentes.length, marcados: marcados, porTipo: porTipo, titulos: titulos };
}

module.exports = { marcarBaixados, tituloBaixado, COL };
