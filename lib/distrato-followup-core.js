/**
 * Distratos do follow-up que o Sienge já baixou saem da fila "Aguardando".
 * Um título baixado é contrato cancelado/distratado, ou parcelas zeradas por baixa de distrato.
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

async function marcarBaixados(opts) {
  const db = opts.db;
  const siengeFetch = opts.siengeFetch;
  const fx = opts.fx;
  const snap = await fx.getDocs(fx.collection(db, COL));
  const pendentes = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    if (String(data.tipo || "") !== "distrato") return;
    if (String(data.status || "") === "lancado") return;
    const titulo = digitos(data.titulo);
    if (!titulo) return;
    pendentes.push({ id: d.id, titulo: titulo });
  });
  const baixadoPorTitulo = new Map();
  let marcados = 0;
  const titulos = [];
  for (let i = 0; i < pendentes.length; i++) {
    const row = pendentes[i];
    if (!baixadoPorTitulo.has(row.titulo)) {
      let baixado = false;
      try { baixado = await tituloBaixado(siengeFetch, row.titulo); } catch (e) { baixado = false; }
      baixadoPorTitulo.set(row.titulo, baixado);
      if (baixado) titulos.push(row.titulo);
    }
    if (!baixadoPorTitulo.get(row.titulo)) continue;
    await fx.updateDoc(fx.doc(db, COL, row.id), {
      status: "lancado",
      lancadoEm: new Date().toISOString(),
      lancadoPor: "batimento-7h"
    });
    marcados += 1;
  }
  return { olhados: pendentes.length, marcados: marcados, titulos: titulos };
}

module.exports = { marcarBaixados, tituloBaixado, COL };
