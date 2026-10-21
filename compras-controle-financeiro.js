/**
 * Compras · Controle financeiro
 * Mesma consulta de contas a pagar do follow-up, sem filtrar só previsão:
 * pago, programado (título real em aberto) e previsão.
 */
const ComprasControleApp = Object.create(ComprasPrevisoesApp);

ComprasControleApp.state = {
  inited: false,
  loading: false,
  consulted: false,
  error: "",
  startDate: "",
  endDate: "",
  updatedAt: "",
  companies: [],
  companyIds: [],
  creditorIds: [],
  deptIds: [],
  ccIds: [],
  openEmp: false,
  openCred: false,
  openDept: false,
  openCc: false,
  qEmp: "",
  qCred: "",
  qDept: "",
  qCc: "",
  qTitulo: "",
  qCredor: "",
  status: "todos",
  sortKey: "data",
  sortDir: "asc",
  allRows: [],
  shown: [],
  billsByTitulo: {},
  pedidosByTitulo: {},
  notaByPedido: {},
  notaByContrato: {},
  baixasByTitulo: {},
  anexosByTitulo: {},
  notasByPedido: {},
  parcelasCache: {},
  openTitulo: "",
  banco: null,
  agrupados: {}
};

ComprasControleApp.ehPrevisao = function (docId, docName, bill) {
  const flag = this.forecastFlag(bill);
  if (flag === true) return true;
  if (flag === false) return false;
  const id = this.docCode(docId);
  const token = this.docCode(this.firstWord(docId || docName));
  const nome = this.fold(docName);
  if (this.DOC_PREVISAO[id] || this.DOC_PREVISAO[token]) return true;
  if (nome.indexOf("PREVIS") >= 0) return true;
  return false;
};

ComprasControleApp.naturezaDe = function (bill, pay, bm, docId, docName) {
  if (this.isPago(bill, pay, bm, docId, docName)) return "pago";
  if (this.ehPrevisao(docId, docName, bill)) return "previsao";
  return "programado";
};

ComprasControleApp.transform = function (payload) {
  const bills = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
  const rows = [];
  (bills || []).forEach((bill) => {
    if (!bill || bill.billId == null) return;
    this.listOrNull(bill.paymentsCategories).forEach((cat) => {
      this.listOrNull(bill.payments).forEach((pay) => {
        this.listOrNull(pay && pay.bankMovements).forEach((bm) => {
          this.listOrNull(bill.departamentsCosts).forEach((dep) => {
            this.listOrNull(bill.buildingsCosts).forEach((bld) => {
              const operacao = (bm && bm.operationName) || "";
              const conta = (bm && bm.accountNumber) || "";
              if (this.SKIP_OPS[operacao]) return;
              if (this.SKIP_ACCOUNTS[conta]) return;
              const docId = this.docCode(bill.documentIdentificationId);
              const docNome = this.firstWord(bill.documentIdentificationName);
              const titulo = String(bill.billId);
              const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
              if (this.SKIP_TITULO_PARCELA[titulo + "-" + parcela]) return;
              const rateio = cat && cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) : 100;
              const valor = Number(bill.originalAmount) || 0;
              const substituido = this.isSubstituicao(bill, pay, bm, docId, bill.documentIdentificationName);
              const natureza = this.naturezaDe(bill, pay, bm, docId, bill.documentIdentificationName);
              const forecast = this.ehPrevisao(docId, bill.documentIdentificationName, bill);
              rows.push({
                companyId: String(bill.companyId || ""),
                credor: String(bill.creditorName || "").trim(),
                titulo,
                documento: String(bill.documentNumber || ""),
                vencimento: String(bill.dueDate || "").slice(0, 10),
                emissao: String(bill.issueDate || "").slice(0, 10),
                parcela,
                docId,
                docNome,
                valor,
                planoId: cat && cat.financialCategoryId != null ? String(cat.financialCategoryId) : "",
                plano: (cat && cat.financialCategoryName) || "",
                ccId: cat && cat.costCenterId != null ? String(cat.costCenterId) : "",
                ccNome: (cat && cat.costCenterName) || "",
                rateio,
                tipoBaixa: (pay && pay.operationTypeName) || "",
                dataPagamento: substituido ? "" : this.paymentDateOf(bill, pay, bm),
                pago: natureza === "pago",
                natureza,
                forecast,
                substituido,
                tituloSubstituto: substituido ? this.tituloSubstituto(bill, pay, bm) : "",
                saldo: this.billBalance(bill),
                situacao: this.billSituation(bill, pay),
                operacao,
                conta,
                departamento: (dep && dep.name) || this.ccDeptHint((cat && cat.costCenterName) || "") || "",
                departamentoId: dep && (dep.id != null ? dep.id : (dep.departmentId != null ? dep.departmentId : dep.departamentId)) != null
                  ? String(dep.id != null ? dep.id : (dep.departmentId != null ? dep.departmentId : dep.departamentId))
                  : "",
                idObra: bld && bld.buildingId != null ? String(bld.buildingId) : "",
                valorAjustado: valor * ((Number.isFinite(rateio) ? rateio : 100) / 100)
              });
            });
          });
        });
      });
    });
  });
  const map = new Map();
  rows.forEach((r) => {
    // Cada centro de custo do título é uma fatia do valor. Juntar só pelo
    // departamento deixava uma fração e escondia o restante do rateio.
    const k = [r.titulo, r.parcela, r.ccId, r.planoId, r.rateio].join("|");
    const prev = map.get(k);
    if (!prev) {
      map.set(k, r);
      return;
    }
    const merged = this.preferParcela(prev, r);
    merged.forecast = !!(prev.forecast || r.forecast);
    if (merged.pago && !merged.substituido) merged.natureza = "pago";
    else if (merged.forecast) merged.natureza = "previsao";
    else merged.natureza = "programado";
    map.set(k, merged);
  });
  return [...map.values()];
};

ComprasControleApp.rowGroup = function (r) {
  return r && r.natureza ? r.natureza : "programado";
};

ComprasControleApp.groupMeta = function (group) {
  const map = {
    pago: { label: "Pago", bg: "#f1f5f9", color: "#475569", order: 1 },
    programado: { label: "Programado", bg: "#dbeafe", color: "#1e3a8a", order: 2 },
    previsao: { label: "Previsão", bg: "#ffedd5", color: "#9a3412", order: 3 }
  };
  return map[group] || map.programado;
};

ComprasControleApp.hojeIso = function () {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

ComprasControleApp.vencido = function (r) {
  if (!r || r.forecast) return false;
  const due = String(r.vencimento || "").slice(0, 10);
  return !!due && due < this.hojeIso();
};

ComprasControleApp.statusDe = function (r) {
  if (!r) return "programado";
  if (r.natureza === "pago" || r.natureza === "previsao" || r.natureza === "processamento") return r.natureza;
  const id = String(r.titulo || "");
  const cache = this.state.lotesByTitulo || {};
  if (this.state.rastreando && id && !Object.prototype.hasOwnProperty.call(cache, id)) return "rastreando";
  if (this.vencido(r)) return "vencido";
  return "programado";
};

ComprasControleApp.tipoTag = function (r) {
  const st = this.statusDe(r);
  if (st === "pago") return '<span class="cprev-tag cprev-tag-pago">Pago</span>';
  if (st === "previsao") return '<span class="cprev-tag cprev-tag-previsao">Previsão</span>';
  if (st === "processamento") {
    const lote = r.lote ? " title=\"Lote " + this.esc(r.lote) + " enviado ao banco\"" : "";
    return '<span class="cprev-tag cprev-tag-banco"' + lote + ">Processamento bancário</span>";
  }
  if (st === "rastreando") {
    return '<span class="cprev-tag cprev-tag-rastreando" title="Consultando se o título já foi enviado ao banco"><span class="cfin-spin" aria-hidden="true"></span>Rastreando banco</span>';
  }
  if (st === "vencido") return '<span class="cprev-tag cprev-tag-vencido">Vencido</span>';
  return '<span class="cprev-tag cprev-tag-nota">Programado</span>';
};

/** PPC consulta o pedido de compra. PCT consulta o contrato de suprimentos. Os dois não usam o mesmo número. */
ComprasControleApp.autorizacaoChave = function (r) {
  if (!r || this.statusDe(r) !== "previsao") return "";
  const num = this.pedidoKey(r.documento);
  if (!num) return "";
  const doc = this.docCode(r.docId);
  if (doc === "PPC") return "ppc:" + num;
  if (doc === "PCT") return "ct:" + num;
  return "";
};

ComprasControleApp.autorizacaoRotulo = function (aut) {
  if (!aut) return { texto: "Consultando…", title: "Lendo a autorização no Sienge", cls: "cprev-tag-rastreando" };
  if (aut.limite) return { texto: "Limite do Sienge", title: "O Sienge recusou a consulta por excesso de chamadas (429). Consulte de novo em instantes.", cls: "cprev-tag-rastreando" };
  if (aut.ausente) return { texto: "Não encontrado", title: "Não encontrado no Sienge", cls: "cprev-tag-rastreando" };
  if (aut.erro) return { texto: "Não lida", title: aut.erro, cls: "cprev-tag-rastreando" };
  if (!aut.ok) return { texto: "Não", title: "Ainda não autorizado no Sienge", cls: "cprev-tag-previsao" };
  return { texto: "Sim", title: "Autorizado no Sienge", cls: "cprev-tag-pago" };
};

/** Nota já lançada no Sienge (a inserção é a validação fiscal) ligada a este título. */
ComprasControleApp.notaValidadaDoTitulo = function (row) {
  const lista = this._filaFiscal || [];
  if (!row || !lista.length) return null;
  const titulo = String(row.titulo || "");
  const num = String(row.documento || "").replace(/\D/g, "");
  const servico = !!(window.NotaFiscalCheck && NotaFiscalCheck.ehNfsOuNfj(row.docId, row.docNome));
  return lista.find((x) => {
    if (!x || x.status !== "lancada") return false;
    if (x.billId && titulo && String(x.billId) === titulo) return true;
    if (servico && num && String(x.numeroNota || "").replace(/\D/g, "") === num) return true;
    return false;
  }) || null;
};

ComprasControleApp.notaValidadaHtml = function (item) {
  const quem = item.validadoPor || item.lancadoPor || "fiscal";
  const quando = item.validadoEm || item.lancadoEm;
  const data = quando ? new Date(quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
  const nota = item.numeroNota ? `NF ${item.numeroNota}` : "A nota";
  return `<p><strong>${this.esc(nota)}</strong> validada por <strong>${this.esc(quem)}</strong>${data ? " em " + this.esc(data) : ""}.</p>
    <p>Lançada no Sienge${item.seqSienge ? " · sequencial " + this.esc(item.seqSienge) : ""}${item.billId ? " · título " + this.esc(item.billId) : ""}.</p>`;
};

/** PPC em aberto ou em previsão pode ir ao fiscal quando o pedido está autorizado. */
ComprasControleApp.chaveEnvioFiscal = function (row) {
  if (!row || this.statusDe(row) === "pago") return "";
  if (this.statusDe(row) === "previsao") return this.autorizacaoChave(row);
  const num = this.pedidoKey(row.documento);
  if (!num || this.docCode(row.docId) !== "PPC") return "";
  return "ppc:" + num;
};

ComprasControleApp.pedirAutorizacao = function (chave, companyId) {
  if (!chave) return;
  this._autPedidos = this._autPedidos || {};
  this._autFila = this._autFila || {};
  if (this._autPedidos[chave] || this._autFila[chave]) return;
  this._autFila[chave] = true;
  this.lerAutorizacao(chave, companyId).then(() => {
    if (this._tituloDetalhe) this.pintarTitulo();
  });
};
ComprasControleApp.autorizacaoHtml = function (r) {
  const chave = this.autorizacaoChave(r);
  if (!chave) return '<span class="cfin-vazio">—</span>';
  const rot = this.autorizacaoRotulo((this._autPedidos || {})[chave]);
  return `<span class="cprev-tag ${rot.cls}" title="${this.esc(rot.title)}">${rot.texto}</span>`;
};

/** Coluna Fiscal: situação da nota e o envio, quando o pedido de compra está autorizado. */
ComprasControleApp.fiscalHtml = function (r) {
  const chave = this.autorizacaoChave(r);
  if (!chave || chave.indexOf("ppc:") !== 0) return '<span class="cfin-vazio">—</span>';
  const aut = (this._autPedidos || {})[chave];
  if (!aut || !aut.ok) return '<span class="cfin-vazio">—</span>';
  const ped = chave.slice(4);
  const envio = window.FilaNotasFiscais ? FilaNotasFiscais.acaoPedidoHtml(ped, this._filaFiscal) : "";
  return envio || '<span class="cfin-vazio">—</span>';
};

ComprasControleApp.autorizacaoTexto = function (r) {
  const chave = this.autorizacaoChave(r);
  if (!chave) return "";
  return this.autorizacaoRotulo((this._autPedidos || {})[chave]).texto.replace("…", "");
};

ComprasControleApp.fiscalTexto = function (r) {
  const chave = this.autorizacaoChave(r);
  if (!chave || chave.indexOf("ppc:") !== 0) return "";
  const ped = chave.slice(4);
  const aut = (this._autPedidos || {})[chave];
  if (!aut || !aut.ok || !window.FilaNotasFiscais) return "";
  const item = FilaNotasFiscais.doPedido(this._filaFiscal, ped);
  if (!item) return "Enviar ao fiscal";
  if (item.status === "pendente" || item.status === "em_lancamento") return "Em análise fiscal";
  if (item.status === "devolvida") return "Nota devolvida";
  if (item.status === "lancada") return "Lançada no Sienge";
  return "";
};

ComprasControleApp.carregarAutorizacoes = function (rows) {
  const fila = [];
  this._autPedidos = this._autPedidos || {};
  this._autFila = this._autFila || {};
  (rows || []).forEach((r) => {
    const chave = this.autorizacaoChave(r);
    if (!chave || this._autPedidos[chave] || this._autFila[chave]) return;
    this._autFila[chave] = true;
    fila.push({ chave, companyId: r.companyId });
  });
  if (!fila.length) return;
  const lote = async () => {
    const conc = 2;
    for (let i = 0; i < fila.length; i += conc) {
      await Promise.all(fila.slice(i, i + conc).map((item) => this.lerAutorizacao(item.chave, item.companyId)));
      if (this.state && this.state.consulted && !this.state.loading) this.renderList();
      if (this._tituloDetalhe) this.pintarTitulo();
      if (i + conc < fila.length) await new Promise((resolve) => setTimeout(resolve, 350));
    }
  };
  lote();
};

ComprasControleApp.flagAutorizada = function (flag, approval) {
  const texto = String(approval || "");
  if (/reprov/i.test(texto)) return false;
  if (flag === true || flag === 1 || /^(S|Y|SIM|TRUE)$/i.test(String(flag || ""))) return true;
  return /autoriz/i.test(texto) && !/aguard|pend/i.test(texto);
};

ComprasControleApp.lerAutorizacao = async function (chave, companyId) {
  const partes = String(chave || "").split(":");
  const tipo = partes[0];
  const num = partes[1];
  try {
    if (!num || typeof window.siengeFetchWithRetry !== "function") throw new Error("API do Sienge indisponível");
    if (tipo === "ct") {
      const data = await window.siengeFetchWithRetry("/supply-contracts?documentId=CT&contractNumber=" + encodeURIComponent(num), 4);
      let lista = (data && data.results) || (data && (data.contractNumber != null || data.isAuthorized != null) ? [data] : []);
      if (companyId) {
        const daEmpresa = lista.filter((x) => String(x && x.companyId) === String(companyId));
        if (daEmpresa.length) lista = daEmpresa;
      }
      const item = lista[0];
      if (!item) {
        this._autPedidos[chave] = { ok: false, ausente: true };
        return;
      }
      const approval = item.statusApproval || item.authorization || item.status || "";
      this._autPedidos[chave] = { ok: this.flagAutorizada(item.isAuthorized != null ? item.isAuthorized : item.authorized, approval) };
      return;
    }
    const id = window.InserirNotaApp && typeof InserirNotaApp.idApi === "function" ? InserirNotaApp.idApi(num) : num;
    const pedido = await window.siengeFetchWithRetry("/purchase-orders/" + encodeURIComponent(id), 4);
    this._autPedidos[chave] = { ok: this.flagAutorizada(pedido && pedido.authorized, "") };
  } catch (e) {
    const msg = String((e && e.message) || e || "");
    const status = Number(e && e.status) || 0;
    if (status === 404 || /\b404\b/.test(msg)) this._autPedidos[chave] = { ok: false, ausente: true };
    else if (status === 429 || /\b429\b/.test(msg)) this._autPedidos[chave] = { ok: false, limite: true };
    else this._autPedidos[chave] = { ok: false, erro: msg || "falha" };
  } finally {
    if (this._autFila) delete this._autFila[chave];
  }
};

ComprasControleApp.pedidosConsumidosPorAdiantamento = function (rows) {
  const set = new Set();
  (rows || []).forEach((r) => {
    if (!r || r.forecast) return;
    if (this.docCode(r.docId) !== "ADTO") return;
    const nums = String(r.documento || "").match(/\d{3,}/g) || [];
    nums.forEach((n) => {
      const ped = String(Number(n));
      if (!ped || ped === "NaN") return;
      set.add(String(r.companyId) + "|" + this.fold(r.credor) + "|" + ped);
    });
  });
  return set;
};

ComprasControleApp.previsaoConsumidaPorAdiantamento = function (r, consumidos) {
  if (!r || !r.forecast || !consumidos) return false;
  if (this.docCode(r.docId) !== "PPC") return false;
  const ped = this.pedidoKey(r.documento);
  if (!ped) return false;
  return consumidos.has(String(r.companyId) + "|" + this.fold(r.credor) + "|" + ped);
};

ComprasControleApp.applyFilters = function () {
  const emp = new Set((this.state.companyIds || []).map(String));
  const cred = new Set((this.state.creditorIds || []).map(String));
  const cc = new Set((this.state.ccIds || []).map(String));
  const qTitulo = this.fold(this.state.qTitulo).replace(/\s+/g, "");
  const status = this.state.status || "todos";
  const start = this.state.startDate || "";
  const end = this.state.endDate || "";
  const consumidos = this.pedidosConsumidosPorAdiantamento(this.scopedRows());
  this.state.shown = this.scopedRows().filter((r) => {
    if (emp.size && !emp.has(String(r.companyId))) return false;
    if (cc.size && !cc.has(String(r.ccId))) return false;
    if (cred.size && !cred.has(this.fold(r.credor))) return false;
    if (!this.rowMatchesDepartment(r)) return false;
    const shownDate = this.dataRef(r);
    if (start && (!shownDate || shownDate < start)) return false;
    if (end && (!shownDate || shownDate > end)) return false;
    if (r.substituido) return false;
    if (this.previsaoConsumidaPorAdiantamento(r, consumidos)) return false;
    if (r.forecast && r.pago) return false;
    if (status !== "todos" && this.statusDe(r) !== status) return false;
    if (qTitulo) {
      const blob = this.fold([r.titulo, r.documento, r.parcela].join("")).replace(/\s+/g, "");
      if (blob.indexOf(qTitulo) < 0) return false;
    }
    return true;
  });
  this.sortShown();
};

ComprasControleApp.dataRef = function (r) {
  if (r && r.natureza === "pago" && r.dataPagamento) return String(r.dataPagamento).slice(0, 10);
  return String((r && r.vencimento) || "").slice(0, 10);
};

ComprasControleApp.sortValue = function (r, key) {
  if (key === "emp") return Number(r.companyId) || 0;
  if (key === "cc") return this.fold((r.ccId ? r.ccId + " " : "") + (r.ccNome || ""));
  if (key === "dept") return this.fold(r.departamento || "");
  if (key === "credor") return this.fold(r.credor || "");
  if (key === "titulo") return Number(r.titulo) || 0;
  if (key === "parc") return Number(r.parcela) || 0;
  if (key === "doc") return this.fold(r.docId || "");
  if (key === "ndoc") return this.fold(r.documento || "");
  if (key === "data") return this.dataRef(r);
  if (key === "tipo") return this.statusDe(r);
  if (key === "aut") return this.autorizacaoTexto(r);
  if (key === "fiscal") return this.fiscalTexto(r);
  if (key === "valor") return Number(r.valorAjustado) || 0;
  return "";
};

ComprasControleApp.sortShown = function () {
  const key = this.state.sortKey || "data";
  const dir = this.state.sortDir === "desc" ? -1 : 1;
  const numeric = key === "emp" || key === "titulo" || key === "parc" || key === "valor";
  const rows = this.state.shown || [];
  rows.sort((a, b) => {
    const va = this.sortValue(a, key);
    const vb = this.sortValue(b, key);
    let cmp = 0;
    if (numeric) cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    if (cmp === 0) cmp = String(a.titulo).localeCompare(String(b.titulo), "pt-BR", { numeric: true });
    return cmp * dir;
  });
};

ComprasControleApp.gruposDaLista = function (rows) {
  const lista = rows || [];
  const map = new Map();
  const order = [];
  lista.forEach((r, i) => {
    const key = String(r.titulo || "") + "|" + String(r.parcela || "");
    let g = map.get(key);
    if (!g) {
      g = { key: key, idx: i, partes: [] };
      map.set(key, g);
      order.push(g);
    }
    g.partes.push(r);
  });
  return order;
};

ComprasControleApp.valorGrupo = function (g) {
  const n = (g && g.partes || []).reduce((s, r) => s + (Number(r.valorAjustado) || 0), 0);
  return Math.round(n * 100) / 100;
};

ComprasControleApp.rotuloUnico = function (partes, campo) {
  const vals = [];
  (partes || []).forEach((r) => {
    const v = String((r && r[campo]) || "").trim();
    if (v && vals.indexOf(v) < 0) vals.push(v);
  });
  if (vals.length === 1) return vals[0];
  return vals.length ? vals.join(" · ") : "—";
};

ComprasControleApp.valorOrdenacaoGrupo = function (g, key) {
  const r = (g && g.partes && g.partes[0]) || {};
  if (key === "valor") return this.valorGrupo(g);
  if (key === "cc") {
    return (g.partes || []).map((p) => (p.ccId ? p.ccId + " " : "") + (p.ccNome || "")).join(" ");
  }
  if (key === "dept") return this.rotuloUnico(g.partes, "departamento");
  return this.sortValue(r, key);
};

ComprasControleApp.ordenarGrupos = function (grupos) {
  const key = this.state.sortKey || "data";
  const dir = this.state.sortDir === "desc" ? -1 : 1;
  const numeric = key === "emp" || key === "titulo" || key === "parc" || key === "valor";
  (grupos || []).sort((a, b) => {
    const va = this.valorOrdenacaoGrupo(a, key);
    const vb = this.valorOrdenacaoGrupo(b, key);
    let cmp = 0;
    if (numeric) cmp = (Number(va) || 0) - (Number(vb) || 0);
    else cmp = String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    if (cmp === 0) {
      const ta = String((a.partes[0] && a.partes[0].titulo) || "");
      const tb = String((b.partes[0] && b.partes[0].titulo) || "");
      cmp = ta.localeCompare(tb, "pt-BR", { numeric: true });
    }
    return cmp * dir;
  });
  return grupos;
};

ComprasControleApp.toggleAgrupamento = function (key) {
  if (!this.state.agrupados) this.state.agrupados = {};
  if (this.state.agrupados[key]) delete this.state.agrupados[key];
  else this.state.agrupados[key] = true;
  this.renderListKeepingScroll();
};

ComprasControleApp.toggleSort = function (key) {
  if (this.state.loading || !this.state.consulted) return;
  if (this.state.sortKey === key) {
    this.state.sortDir = this.state.sortDir === "desc" ? "asc" : "desc";
  } else {
    this.state.sortKey = key;
    this.state.sortDir = "desc";
  }
  this.sortShown();
  this.renderList();
};

ComprasControleApp.kpis = function () {
  const grupos = this.gruposDaLista(this.state.shown || []);
  const out = { qtd: grupos.length, total: 0, pago: 0, programado: 0, processamento: 0, previsao: 0, vencido: 0 };
  grupos.forEach((g) => {
    const v = this.valorGrupo(g);
    out.total += v;
    const st = this.statusDe(g.partes[0]);
    if (st === "pago") out.pago += v;
    else if (st === "processamento") out.processamento += v;
    else if (st === "previsao") out.previsao += v;
    else if (st === "vencido") out.vencido += v;
    else out.programado += v;
  });
  out.total = Math.round(out.total * 100) / 100;
  return out;
};

ComprasControleApp.noteProgress = function (text, ratio) {
  const box = document.getElementById("cfin-results");
  if (!box) return;
  const pct = Math.max(0, Math.min(100, Math.round((Number(ratio) || 0) * 100)));
  let wrap = box.querySelector(".cfin-load");
  if (!wrap || wrap.getAttribute("data-phase") !== text) {
    box.innerHTML = '<div class="tvig-empty"><div class="cfin-load" data-phase="' + this.esc(text) + '" style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:400px;margin:0 auto;">'
      + '<div class="loading-spinner" aria-hidden="true"></div>'
      + '<span class="loading-status-text" style="font-weight:500;">' + this.esc(text) + '</span>'
      + '<div style="width:100%;background:#e2e8f0;border-radius:8px;height:10px;overflow:hidden;margin-top:5px;">'
      + '<div class="loading-progress-bar" style="width:0%;height:100%;background:#10b981;transition:width 0.25s linear;"></div>'
      + '</div></div></div>';
    wrap = box.querySelector(".cfin-load");
  }
  const bar = box.querySelector(".loading-progress-bar");
  if (bar) bar.style.width = pct + "%";
};

ComprasControleApp.paintBanco = function () {
  const el = document.getElementById("cfin-banco");
  if (!el) return;
  const b = this.state.banco;
  if (!b || !b.active || !b.total) {
    el.hidden = true;
    return;
  }
  const pct = Math.max(0, Math.min(100, Math.round((b.done / b.total) * 100)));
  el.hidden = false;
  let text = el.querySelector(".cfin-banco-text");
  let fill = el.querySelector(".cfin-banco-fill");
  if (!text || !fill) {
    el.innerHTML = '<span class="cfin-banco-text"></span><div class="cfin-banco-track" aria-hidden="true"><div class="cfin-banco-fill"></div></div>';
    text = el.querySelector(".cfin-banco-text");
    fill = el.querySelector(".cfin-banco-fill");
  }
  text.textContent = "Processando o banco…";
  fill.style.width = pct + "%";
};

ComprasControleApp.paintKpis = function () {
  const kpi = document.getElementById("cfin-kpis");
  if (!kpi) return;
  if (this.state.loading || this.state.error || !this.state.consulted) {
    kpi.innerHTML = "";
    return;
  }
  const k = this.kpis();
  const values = [
    String(k.qtd),
    this.money(k.pago),
    this.money(k.processamento),
    this.money(k.programado),
    this.money(k.vencido),
    this.money(k.previsao),
    this.money(k.total)
  ];
  const nodes = kpi.querySelectorAll(".ccom-kpi strong");
  if (nodes.length === values.length) {
    values.forEach((v, i) => {
      if (nodes[i].textContent !== v) nodes[i].textContent = v;
    });
    return;
  }
  const labels = ["Títulos", "Pago", "Processamento", "Programado", "Vencido", "Previsão", "Total"];
  kpi.innerHTML = labels.map((label, i) =>
    '<div class="ccom-kpi"><span>' + label + "</span><strong>" + this.esc(values[i]) + "</strong></div>"
  ).join("");
};

ComprasControleApp.patchStatuses = function () {
  const grupos = this.ordenarGrupos(this.gruposDaLista(this.state.shown || []));
  const trs = document.querySelectorAll("#cfin-table tbody tr.cprev-row");
  if (!trs.length || trs.length !== grupos.length) return false;
  trs.forEach((tr, i) => {
    const cell = tr.querySelector("td.cprev-col-tipo");
    const r = grupos[i] && grupos[i].partes[0];
    if (!cell || !r) return;
    const sig = this.statusDe(r) + "|" + (r.lote || "");
    if (cell.getAttribute("data-st") === sig) return;
    cell.setAttribute("data-st", sig);
    cell.innerHTML = this.tipoTag(r);
  });
  this.paintKpis();
  return true;
};

ComprasControleApp.renderListKeepingScroll = function () {
  const wrap = document.querySelector("#cfin-results .cprev-table-wrap");
  const top = wrap ? wrap.scrollTop : 0;
  const left = wrap ? wrap.scrollLeft : 0;
  const y = window.scrollY || 0;
  this.renderList();
  const next = document.querySelector("#cfin-results .cprev-table-wrap");
  if (next) {
    next.scrollTop = top;
    next.scrollLeft = left;
  }
  if (y) window.scrollTo(0, y);
};

ComprasControleApp.refreshBancoRows = function () {
  if (!this.state.consulted || this.state.loading) return;
  const status = this.state.status || "todos";
  const membership = status === "programado" || status === "vencido" || status === "processamento";
  const resort = this.state.sortKey === "tipo";
  if (membership || resort || !this.patchStatuses()) {
    this.applyFilters();
    this.renderListKeepingScroll();
  }
};

ComprasControleApp.departmentScopeNote = function () {
  const note = ComprasPrevisoesApp.departmentScopeNote.call(this);
  return String(note || "").replace(/previsões/g, "títulos").replace(/previsão/g, "título");
};

ComprasControleApp.perfilFold = function (name) {
  return String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, " E ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/** Pagamento sem departamento: administrador, gerente FP&A e analistas de pagadoria I e II. */
ComprasControleApp.veTituloSemDepartamento = function () {
  const imp = typeof window.crmImpersonacaoAtual === "function" ? window.crmImpersonacaoAtual() : null;
  if (!imp && typeof window.crmAdministradorReal === "function" && window.crmAdministradorReal()) return true;
  const u = this.sessionUser();
  if (!u) return false;
  if (typeof window.isCrmAdministrator === "function" && window.isCrmAdministrator(u)) return true;
  const n = this.perfilFold(u.profile_name || u.profile || u.role || "");
  if (n === "ADMINISTRADOR") return true;
  if (n.includes("GERENTE") && (n.includes("FP E A") || n.includes("FPA"))) return true;
  return n.includes("ANALISTA") && n.includes("PAGADORIA") && /\b(I|II|1|2)\b/.test(n);
};

ComprasControleApp.tituloSemDepartamento = function (r) {
  const nome = String((r && r.departamento) || "").trim();
  const id = r && r.departamentoId != null ? String(r.departamentoId).trim() : "";
  return !nome && !id;
};

ComprasControleApp.scopedRows = function () {
  const rows = this.state.allRows || [];
  const windows = this.departmentWindows();
  const veSem = this.veTituloSemDepartamento();
  return rows.filter((r) => {
    if (this.tituloSemDepartamento(r)) return veSem;
    if (!windows) return true;
    return this.rowInDepartmentWindows(r, windows);
  });
};

ComprasControleApp.groupHeaderHtml = function (group, totals) {
  const meta = this.groupMeta(group);
  const count = totals.count || 0;
  const countLabel = count === 1 ? "1 título" : count + " títulos";
  const valueLabel = (Number(totals.value) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const cell = "background:" + meta.bg + ";color:" + meta.color + ";font-weight:700;font-size:0.75rem;letter-spacing:0.04em;text-transform:uppercase;padding:8px 12px;border:none;";
  return `<tr class="fila-group-header cprev-group-header">
    <td colspan="6" style="${cell}">
      <div class="cprev-group-label">
        <span>${this.esc(meta.label)}</span>
        <span class="cprev-group-chip">${this.esc(countLabel)}</span>
      </div>
    </td>
    <td colspan="4" style="${cell}"></td>
    <td style="${cell}text-align:right;white-space:nowrap;letter-spacing:0;text-transform:none;">
      <span class="cprev-group-chip">R$ ${this.esc(valueLabel)}</span>
    </td>
  </tr>`;
};

ComprasControleApp.loteEnviado = function (inst) {
  if (!inst || inst.batchNumber == null || inst.batchNumber === "") return null;
  const sent = inst.sentToBank === true || inst.sentToBank === 1 || inst.sentToBank === "S" || inst.sentToBank === "true";
  if (!sent) return null;
  const n = Number(inst.batchNumber);
  return Number.isFinite(n) && n > 0 ? n : null;
};

ComprasControleApp.carregarLotes = async function () {
  const gen = (this.state.loteGen = (this.state.loteGen || 0) + 1);
  if (this._lotePaint) {
    clearTimeout(this._lotePaint);
    this._lotePaint = null;
  }
  const stop = () => this.state.loteGen !== gen || !this.state.consulted;
  if (typeof window.siengeFetchWithRetry !== "function") return;
  const cache = this.state.lotesByTitulo || (this.state.lotesByTitulo = {});
  const ids = [];
  const rowsByTitulo = new Map();
  (this.state.allRows || []).forEach((r) => {
    if (!r || r.natureza !== "programado" || r.forecast) return;
    const id = String(r.titulo || "");
    if (!id) return;
    const list = rowsByTitulo.get(id);
    if (list) list.push(r);
    else {
      rowsByTitulo.set(id, [r]);
      if (!Object.prototype.hasOwnProperty.call(cache, id)) ids.push(id);
    }
  });
  if (!ids.length || stop()) return;
  let done = 0;
  let changed = false;
  const total = ids.length;
  this.state.banco = { active: true, done: 0, total: total };
  this.paintBanco();
  const schedule = () => {
    if (this._lotePaint || stop()) return;
    this._lotePaint = setTimeout(() => {
      this._lotePaint = null;
      if (stop()) return;
      this.state.banco = { active: true, done: done, total: total };
      this.paintBanco();
      if (!changed) return;
      changed = false;
      this.refreshBancoRows();
    }, 400);
  };
  const queue = ids.slice();
  const worker = async () => {
    while (queue.length && !stop()) {
      const id = queue.shift();
      try {
        const data = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(id) + "/installments", 4);
        await new Promise((r) => setTimeout(r, 350));
        if (stop()) return;
        const map = {};
        ((data && data.results) || []).forEach((inst) => {
          const n = String(inst.installmentNumber != null ? inst.installmentNumber : "");
          const lote = this.loteEnviado(inst);
          if (n && lote) map[n] = lote;
        });
        cache[id] = map;
      } catch (e) {
        if (stop()) return;
        cache[id] = {};
      }
      (rowsByTitulo.get(id) || []).forEach((r) => {
        if (!r || r.natureza !== "programado" || r.forecast) return;
        const lote = (cache[id] || {})[String(r.parcela || "")];
        if (!lote) return;
        r.natureza = "processamento";
        r.lote = lote;
        changed = true;
      });
      done += 1;
      this.state.banco = { active: true, done: done, total: total };
      this.paintBanco();
      if (changed) schedule();
    }
  };
  const jobs = [];
  const workers = 1;
  for (let i = 0; i < workers; i++) jobs.push(worker());
  try {
    await Promise.all(jobs);
  } finally {
    if (this._lotePaint) {
      clearTimeout(this._lotePaint);
      this._lotePaint = null;
    }
    if (!stop()) {
      const pending = changed;
      this.state.banco = null;
      this.paintBanco();
      if (pending) this.refreshBancoRows();
    }
  }
};

ComprasControleApp.isoShiftDay = function (iso, days) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

ComprasControleApp.baseCobre = function (chunks, start, end, companyIds) {
  const req = (companyIds || []).map(String).filter(Boolean);
  const needed = req.length ? req : [""];
  let cursor = start;
  while (cursor && cursor <= end) {
    const ok = needed.every((cid) => (chunks || []).some((c) => {
      if (!c || c.start > cursor || c.end < cursor) return false;
      if (!c.companyId) return true;
      return !!cid && String(c.companyId) === cid;
    }));
    if (!ok) return false;
    cursor = this.isoShiftDay(cursor, 1);
  }
  return true;
};

ComprasControleApp.lerMetaBase = async function () {
  const fx = window.firebaseCollections;
  const db = window.firebaseDb;
  if (!fx || !db || typeof fx.getDoc !== "function" || typeof fx.doc !== "function") return null;
  const snap = await fx.getDoc(fx.doc(db, "sienge_defaulters_history", "_cfin_meta"));
  if (!snap || !snap.exists || !snap.exists()) return null;
  const meta = snap.data() || {};
  if (!meta.ready || !meta.start || !meta.end || !Array.isArray(meta.chunks) || !meta.chunks.length) return null;
  return meta;
};

ComprasControleApp.lerBlocoBase = async function (id) {
  if (!id) return [];
  this._cfinBlocos = this._cfinBlocos || {};
  if (this._cfinBlocos[id]) return this._cfinBlocos[id];
  const fx = window.firebaseCollections;
  const db = window.firebaseDb;
  const snap = await fx.getDoc(fx.doc(db, "sienge_defaulters_history", id));
  let bills = [];
  if (snap && snap.exists && snap.exists()) {
    try { bills = JSON.parse((snap.data() || {}).data || "[]"); } catch (e) { bills = []; }
  }
  if (!Array.isArray(bills)) bills = [];
  this._cfinBlocos[id] = bills;
  return bills;
};

ComprasControleApp.idsGeridasPeloGrupo = function () {
  let raw = "";
  if (typeof window.empresasCustomPayload === "function") raw = window.empresasCustomPayload() || "";
  if (!raw) {
    try { raw = localStorage.getItem("crm_empresas_custom") || "{}"; } catch (e) { raw = "{}"; }
  }
  let custom = {};
  try { custom = JSON.parse(raw) || {}; } catch (e) { custom = {}; }
  const ids = [];
  const seen = {};
  Object.keys(custom).forEach((k) => {
    if (k === "_v2") return;
    const cfg = custom[k];
    if (!cfg || typeof cfg !== "object") return;
    const v = cfg.gerida_pelo_grupo != null ? cfg.gerida_pelo_grupo : cfg.gerida_grupo;
    const ligada = v === 1 || v === true || v === "1" || Number(v) === 1;
    if (!ligada) return;
    const id = cfg.company_id != null ? cfg.company_id : k;
    const sid = String(id);
    if (!/^\d+$/.test(sid) || seen[sid]) return;
    seen[sid] = true;
    ids.push(sid);
  });
  return ids;
};

// Vazio ou "Marcar Todos" consulta só as empresas com Gerida pelo grupo.
// Uma escolha explícita de algumas empresas continua valendo, mesmo sem a flag.
ComprasControleApp.empresasDaConsulta = async function () {
  const selecionadas = (this.state.companyIds || []).map(String).filter(Boolean);
  const geridas = this.idsGeridasPeloGrupo();
  if (!selecionadas.length) return geridas;
  if (!this.state.companies || !this.state.companies.length) {
    try { await this.loadCompanies(); } catch (e) {}
  }
  const catalogo = (this.state.companies || []).map((c) => String(c && c.id != null ? c.id : "")).filter(Boolean);
  const setSel = new Set(selecionadas);
  if (catalogo.length && catalogo.every((id) => setSel.has(id))) return geridas;
  return selecionadas;
};

ComprasControleApp.billsDaBase = async function (start, end) {
  let meta;
  try {
    meta = await this.lerMetaBase();
  } catch (e) {
    return null;
  }
  if (!meta || start < meta.start || end > meta.end) return null;
  const companies = await this.empresasDaConsulta();
  if (!companies.length) return [];
  const required = companies;
  const chunks = meta.chunks.filter((c) => c && c.end >= start && c.start <= end && (
    !companies.length || !c.companyId || companies.indexOf(String(c.companyId)) >= 0
  ));
  if (!this.baseCobre(chunks, start, end, required)) return null;
  const bills = [];
  const seen = {};
  let done = 0;
  for (const chunk of chunks) {
    done += 1;
    this.noteProgress("Carregando contas a pagar da base…", done / chunks.length);
    let rows = [];
    try {
      rows = await this.lerBlocoBase(chunk.id);
    } catch (e) {
      return null;
    }
    rows.forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const due = String(bill.dueDate || "").slice(0, 10);
      if (due && (due < start || due > end)) return;
      if (companies.length && companies.indexOf(String(bill.companyId || "")) < 0) return;
      const key = String(bill.billId) + ":" + String(bill.installmentId || "") + ":" + due;
      if (seen[key]) return;
      seen[key] = true;
      bills.push(bill);
    });
  }
  this.state.baseEm = meta.updatedAt || meta.date || "";
  return bills;
};

ComprasControleApp.fetchOutcome = async function (start, end) {
  const targets = await this.empresasDaConsulta();
  if (!targets.length) return { data: [] };
  const data = [];
  let step = 0;
  const total = targets.length;
  let cursor = 0;
  const self = this;
  const worker = async function () {
    while (cursor < targets.length) {
      const companyId = targets[cursor++];
      const bills = await self.outcomeRange(start, end, companyId);
      if (bills && bills.length) data.push.apply(data, bills);
      step += 1;
      self.noteProgress("Buscando contas a pagar no Sienge…", step / total);
    }
  };
  const n = Math.min(4, targets.length);
  await Promise.all(Array.from({ length: n }, function () { return worker(); }));
  return { data: data };
};

ComprasControleApp._cfinHistDe = "2017-01-01";
ComprasControleApp.apiDias = 60;

// Até 60 dias atrás a consulta lê o Firebase. Os últimos 60 dias, e o que vence depois, saem do Sienge.
// A rotina das 7h grava de 01/01/2026 até esse corte e avança um dia por manhã.
ComprasControleApp.histAte = function () {
  return this.isoShiftDay(this.hojeIso(), -this.apiDias);
};

ComprasControleApp.histVivoDe = function () {
  return this.isoShiftDay(this.histAte(), 1);
};

ComprasControleApp.fmtDataBr = function (iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  return p.length >= 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso || "");
};

ComprasControleApp.empresasDoHistorico = async function () {
  return this.empresasDaConsulta();
};

ComprasControleApp.noteProgress = function (text, ratio) {
  const box = document.getElementById("cfin-results");
  if (!box) return;
  if (!document.getElementById("cfin-load-style")) {
    const st = document.createElement("style");
    st.id = "cfin-load-style";
    st.textContent = ".cfin-load{background:#fff;border:1px dashed #cbd5e1;border-radius:8px;padding:36px 20px;display:flex;flex-direction:column;align-items:center;gap:14px;color:#64748b;text-align:center;}"
      + ".cfin-load p{margin:0;font-size:.9rem;font-weight:600;color:#105436;}"
      + ".cfin-load-track{width:100%;max-width:420px;height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden;}"
      + ".cfin-load-bar{height:100%;width:0;background:#105436;border-radius:99px;transition:width .25s linear;}";
    document.head.appendChild(st);
  }
  const clean = this.textoProgresso(text) || "Carregando contas a pagar…";
  let wrap = box.querySelector(".cfin-load");
  if (!wrap) {
    box.innerHTML = '<div class="cfin-load"><div class="loading-spinner"></div><p class="cfin-load-text"></p><div class="cfin-load-track"><div class="cfin-load-bar"></div></div></div>';
    wrap = box.querySelector(".cfin-load");
  }
  const label = wrap.querySelector(".cfin-load-text");
  if (label) label.textContent = clean;
  const bar = wrap.querySelector(".cfin-load-bar");
  if (bar && Number.isFinite(Number(ratio))) bar.style.width = Math.max(0, Math.min(100, Math.round(Number(ratio) * 100))) + "%";
};

ComprasControleApp._mesesHist = function (start, end) {
  const out = [];
  let ym = String(start || "").slice(0, 7);
  const fim = String(end || "").slice(0, 7);
  while (ym && fim && ym <= fim && out.length < 240) {
    out.push(ym);
    const parts = ym.split("-").map(Number);
    const d = new Date(parts[0], parts[1], 1);
    ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  return out;
};

ComprasControleApp._fimMes = function (ym) {
  const parts = String(ym).split("-").map(Number);
  return ym + "-" + String(new Date(parts[0], parts[1], 0).getDate()).padStart(2, "0");
};

ComprasControleApp._lerMesPago = async function (companyId, ym) {
  const fx = window.firebaseCollections;
  const db = window.firebaseDb;
  if (!fx || !db || !fx.getDoc) return null;
  const id = String(companyId || "todas") + "_" + ym;
  try {
    const snap = await fx.getDoc(fx.doc(db, "cfin_pagos", id));
    if (!snap || typeof snap.exists !== "function" || !snap.exists()) return null;
    const data = snap.data() || {};
    const partes = Math.max(1, Number(data.partes) || 1);
    let bills = Array.isArray(data.bills) ? data.bills.slice() : [];
    for (let i = 2; i <= partes; i++) {
      const pedaco = await fx.getDoc(fx.doc(db, "cfin_pagos", id + "_p" + i));
      if (pedaco && typeof pedaco.exists === "function" && pedaco.exists()) {
        const extra = pedaco.data() || {};
        if (Array.isArray(extra.bills)) bills = bills.concat(extra.bills);
      }
    }
    return bills;
  } catch (e) {
    return null;
  }
};

ComprasControleApp._gravarMesPago = async function (companyId, ym, bills) {
  const fx = window.firebaseCollections;
  const db = window.firebaseDb;
  if (!fx || !db || !fx.setDoc || !companyId) return;
  if (ym > this.histAte().slice(0, 7)) return;
  const lista = Array.isArray(bills) ? bills : [];
  const fatias = [];
  let atual = [];
  let tamanho = 2;
  lista.forEach((row) => {
    const pedaco = JSON.stringify(row || {});
    if (atual.length && tamanho + pedaco.length > 700000) {
      fatias.push(atual);
      atual = [];
      tamanho = 2;
    }
    atual.push(row);
    tamanho += pedaco.length + 1;
  });
  if (atual.length || !fatias.length) fatias.push(atual);
  const id = String(companyId || "todas") + "_" + ym;
  await fx.setDoc(fx.doc(db, "cfin_pagos", id), {
    companyId: String(companyId || "todas"),
    ym: ym,
    n: lista.length,
    partes: fatias.length,
    em: new Date().toISOString(),
    bills: fatias[0] || []
  });
  for (let i = 1; i < fatias.length; i++) {
    await fx.setDoc(fx.doc(db, "cfin_pagos", id + "_p" + (i + 1)), {
      companyId: String(companyId || "todas"),
      ym: ym,
      parte: i + 1,
      bills: fatias[i]
    });
  }
};

ComprasControleApp._billNoPeriodo = function (bill, start, end) {
  const datas = [];
  const add = (v) => {
    const d = String(v || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) datas.push(d);
  };
  add(bill && bill.dueDate);
  add(bill && bill.issueDate);
  (bill && bill.installments || []).forEach((inst) => add(inst && inst.dueDate));
  (bill && bill.payments || []).forEach((pay) => {
    add(pay && pay.dueDate);
    add(pay && pay.paymentDate);
  });
  if (!datas.length) return true;
  return datas.some((d) => d >= start && d <= end);
};

ComprasControleApp._prefetchMesesPagos = async function (targets, meses) {
  const jobs = [];
  (targets || []).forEach((companyId) => {
    (meses || []).forEach((ym) => {
      const chave = String(companyId) + "_" + ym;
      if (this._cfinMesMem && Object.prototype.hasOwnProperty.call(this._cfinMesMem, chave)) return;
      if (this._cfinMesAusente && this._cfinMesAusente[chave]) return;
      jobs.push({ companyId: companyId, ym: ym, chave: chave });
    });
  });
  if (!jobs.length) return;
  let cursor = 0;
  const self = this;
  const worker = async function () {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const bills = await self._lerMesPago(job.companyId, job.ym);
      if (bills != null) {
        if (!self._cfinMesMem) self._cfinMesMem = {};
        self._cfinMesMem[job.chave] = bills;
      } else {
        if (!self._cfinMesAusente) self._cfinMesAusente = {};
        self._cfinMesAusente[job.chave] = true;
      }
    }
  };
  const n = Math.min(8, jobs.length);
  await Promise.all(Array.from({ length: n }, function () { return worker(); }));
};

ComprasControleApp.contasHistoricas = async function (start, end) {
  this._cfinFalhas = [];
  this._cfinFalhasBase = [];
  const ate = this.histAte();
  const rotulo = this.fmtDataBr(ate);
  const ini = start < this._cfinHistDe ? this._cfinHistDe : start;
  const fim = end > ate ? ate : end;
  if (!ini || !fim || ini > fim) return [];
  const targets = await this.empresasDoHistorico();
  if (!targets.length) throw new Error("Nenhuma empresa disponível para gravar as contas pagas.");
  const meses = this._mesesHist(ini, fim);
  await this._prefetchMesesPagos(targets, meses);
  const out = [];
  const vistos = new Set();
  const falhas = [];
  const falhasBase = [];
  let step = 0;
  const total = Math.max(1, meses.length * targets.length);
  const siengeCheio = (e) => {
    const st = Number(e && e.status) || 0;
    return st === 429 || st === 504 || st >= 500 || /429|504/.test(String((e && e.message) || ""));
  };
  for (let c = 0; c < targets.length; c++) {
    const companyId = targets[c];
    for (let i = 0; i < meses.length; i++) {
      step += 1;
      const ym = meses[i];
      const chave = String(companyId) + "_" + ym;
      let bills = this._cfinMesMem && Object.prototype.hasOwnProperty.call(this._cfinMesMem, chave)
        ? this._cfinMesMem[chave]
        : null;
      if (bills == null && !(this._cfinMesAusente && this._cfinMesAusente[chave])) {
        bills = await this._lerMesPago(companyId, ym);
      }
      if (bills == null) {
        if (ym >= "2026-01") {
          falhasBase.push("empresa " + companyId + " " + ym);
          continue;
        }
        const mesIni = ym + "-01";
        const mesFim = this._fimMes(ym);
        let ok = false;
        for (let t = 0; t < 4 && !ok; t++) {
          this.noteProgress((t ? "Sienge ocupado, tentando de novo · " : "Gravando contas até " + rotulo + " · ") + "empresa " + companyId + " · " + ym, step / total);
          try {
            bills = await this.outcomeRange(mesIni, mesFim, companyId);
            ok = true;
          } catch (e) {
            if (!siengeCheio(e) || t === 3) break;
            await new Promise((r) => setTimeout(r, 5000 * (t + 1)));
          }
        }
        if (!ok) {
          falhas.push("empresa " + companyId + " " + ym);
          continue;
        }
        try { await this._gravarMesPago(companyId, ym, bills || []); } catch (e) {
          falhas.push("empresa " + companyId + " " + ym);
          continue;
        }
        await new Promise((r) => setTimeout(r, 400));
      } else if (step === 1 || step % 6 === 0) {
        this.noteProgress("Lendo contas até " + rotulo + " no Firebase · empresa " + companyId + " · " + ym, step / total);
      }
      if (!this._cfinMesMem) this._cfinMesMem = {};
      this._cfinMesMem[chave] = bills || [];
      (bills || []).forEach((bill) => {
        if (!bill) return;
        const id = bill.billId != null ? String(companyId || bill.companyId || "") + "|" + String(bill.billId) : "";
        if (id && vistos.has(id)) return;
        if (!this._billNoPeriodo(bill, ini, fim)) return;
        if (id) vistos.add(id);
        out.push(bill);
      });
    }
  }
  this._cfinFalhas = falhas;
  this._cfinFalhasBase = falhasBase;
  return out;
};

ComprasControleApp.consultar = async function () {
  const start = this.state.startDate;
  const end = this.state.endDate;
  if (!start || !end) {
    alert("Informe o intervalo de datas.");
    return;
  }
  if (start > end) {
    alert("A data inicial não pode ser maior que a final.");
    return;
  }
  this.state.loading = true;
  this.state.loadingMsg = "Carregando contas a pagar da base…";
  this.state.fonte = "";
  this.state.rastreando = false;
  this.state.banco = null;
  this.state.error = "";
  this.state.falhaHist = "";
  this.state.openEmp = false;
  this.state.openCred = false;
  this.state.openCc = false;
  this.state.openDept = false;
  const alvos = await this.empresasDaConsulta();
  if (!alvos.length) {
    this.state.loading = false;
    this.state.error = "Nenhuma empresa com Gerida pelo grupo ligada no cadastro de empresas.";
    this.state.consulted = true;
    this.renderPage();
    return;
  }
  this.state.consulted = true;
  this.state.loteGen = (this.state.loteGen || 0) + 1;
  this.fecharTitulo();
  this.renderPage();
  try {
    const contas = [];
    let fonte = "";
    const ate = this.histAte();
    const vivoDe = this.histVivoDe();
    if (start <= ate) {
      this.state.loadingMsg = "Lendo contas até " + this.fmtDataBr(ate) + " no Firebase…";
      this.noteProgress(this.state.loadingMsg, 0);
      const hist = await this.contasHistoricas(start, end < ate ? end : ate);
      contas.push.apply(contas, hist);
      fonte = "base";
      const falhas = this._cfinFalhas || [];
      const faltam = this._cfinFalhasBase || [];
      const avisos = [];
      if (faltam.length) {
        avisos.push("O Firebase ainda não tem " + faltam.length + " mês(es) até " + this.fmtDataBr(ate) + ". A rotina das 7h grava de 01/01/2026 até essa data e avança um dia por manhã.");
      }
      if (falhas.length) {
        avisos.push("O Sienge não devolveu " + falhas.length + " mês(es) anteriores a 2026. O que já foi gravado continua no Firebase. Consulte de novo para completar. " + falhas.slice(0, 4).join(", ") + (falhas.length > 4 ? "…" : ""));
      }
      this.state.falhaHist = avisos.join(" ");
    }
    if (end >= vivoDe) {
      const vivoIni = start > vivoDe ? start : vivoDe;
      this.state.fonte = fonte ? "mista" : "sienge";
      this.state.loadingMsg = "Buscando contas a pagar de " + this.fmtDataBr(vivoIni) + " no Sienge…";
      this.noteProgress(this.state.loadingMsg, 0);
      const live = await this.fetchOutcome(vivoIni, end);
      contas.push.apply(contas, (live && live.data) || []);
      fonte = fonte ? "mista" : "sienge";
    }
    const payload = { data: contas };
    this.state.fonte = fonte || "base";
    this.indexBills(payload);
    this.state.allRows = this.transform(payload);
    this.state.updatedAt = new Date().toISOString();
    this.state.lotesByTitulo = {};
    this.applyFilters();
  } catch (e) {
    this.state.error = (e && e.message) ? e.message : "Falha ao buscar contas a pagar no Sienge.";
    this.state.allRows = [];
    this.state.shown = [];
    this.state.billsByTitulo = {};
    this.state.banco = null;
  }
  this.state.loading = false;
  this.state.rastreando = false;
  const y = window.scrollY || 0;
  this.renderPage();
  if (y) window.scrollTo(0, y);
  if (!this.state.error) this.carregarLotes();
};

ComprasControleApp.limpar = function () {
  const range = this.defaultRange();
  this.state.startDate = range.startDate;
  this.state.endDate = range.endDate;
  this.state.companyIds = [];
  this.state.empPelosCentros = false;
  this.state.creditorIds = [];
  this.state.deptIds = [];
  this.state.ccIds = [];
  this.state.qTitulo = "";
  this.state.status = "todos";
  this.state.sortKey = "data";
  this.state.sortDir = "asc";
  this.state.shown = [];
  this.state.allRows = [];
  this.state.billsByTitulo = {};
  this.state.lotesByTitulo = {};
  this.state.banco = null;
  this.state.rastreando = false;
  this.state.loteGen = (this.state.loteGen || 0) + 1;
  this.state.consulted = false;
  this.state.error = "";
  this.fecharTitulo();
  this.renderPage();
};

ComprasControleApp.deptFilterHtml = function () {
  const access = this.accessibleDepartments();
  if (access && access.length <= 1) {
    const label = access.length === 1 ? access[0].label : "Nenhum departamento";
    return `<div class="ml-emp-filter" id="cfin-filter-dept">
      <div class="ml-emp-filter-label">Departamento</div>
      <button type="button" class="ml-emp-filter-btn" disabled><span>${this.esc(label)}</span></button>
    </div>`;
  }
  const items = this.deptItems();
  if (!access && !items.length) {
    return `<div class="ml-emp-filter" id="cfin-filter-dept">
      <div class="ml-emp-filter-label">Departamento</div>
      <button type="button" class="ml-emp-filter-btn" disabled><span>Todos</span></button>
    </div>`;
  }
  return MlEmpresaFilter.html({
    id: "cfin-filter-dept",
    label: "Departamento",
    items: this.deptItems(),
    selectedIds: this.state.deptIds,
    open: !!this.state.openDept,
    query: this.state.qDept,
    emptyMeansAll: !access,
    nouns: { singular: "departamento", plural: "departamentos" }
  });
};

ComprasControleApp.paintFilters = function () {
  const self = this;
  const bind = (id, key, openKey, qKey, itemsFn, nouns) => {
    if (!window.MlEmpresaFilter) return;
    MlEmpresaFilter.bind(id, {
      toggleOpen() {
        const escolheAntes = key === "ccIds";
        if (self.state.loading) return;
        if (key === "deptIds" && self.departmentFilterLocked()) return;
        if (!self.state.consulted && key !== "companyIds" && !escolheAntes) return;
        self.state[openKey] = !self.state[openKey];
        if (openKey === "openEmp") { self.state.openCred = false; self.state.openDept = false; self.state.openCc = false; }
        if (openKey === "openCred") { self.state.openEmp = false; self.state.openDept = false; self.state.openCc = false; }
        if (openKey === "openDept") { self.state.openEmp = false; self.state.openCred = false; self.state.openCc = false; }
        if (openKey === "openCc") { self.state.openEmp = false; self.state.openCred = false; self.state.openDept = false; }
        self.paintFilters();
      },
      setQuery(q) {
        self.state[qKey] = q || "";
        const box = document.getElementById(id + "-list");
        if (!box) return;
        box.innerHTML = MlEmpresaFilter.listHtml({
          id: id,
          items: itemsFn(),
          selectedIds: self.state[key],
          query: self.state[qKey],
          nouns: nouns
        });
      },
      toggleId(itemId, on) {
        const escolheAntes = key === "ccIds";
        if (self.state.loading) return;
        if (key === "deptIds" && self.departmentFilterLocked()) return;
        if (!self.state.consulted && key !== "companyIds" && !escolheAntes) return;
        const sid = String(itemId);
        const cur = self.state[key].slice();
        self.state[key] = on ? (cur.includes(sid) ? cur : cur.concat(sid)) : cur.filter((x) => x !== sid);
        self.aposFiltro(key);
        self.state[openKey] = true;
        if (self.state.consulted && !self.state.loading) {
          self.applyFilters();
          self.renderList();
        }
        self.paintFilters();
      },
      selectAll() {
        const escolheAntes = key === "ccIds";
        if (self.state.loading) return;
        if (key === "deptIds" && self.departmentFilterLocked()) return;
        if (!self.state.consulted && key !== "companyIds" && !escolheAntes) return;
        self.state[key] = itemsFn().map((x) => String(x.id));
        self.aposFiltro(key);
        self.state[openKey] = true;
        if (self.state.consulted && !self.state.loading) {
          self.applyFilters();
          self.renderList();
        }
        self.paintFilters();
      },
      selectNone() {
        const escolheAntes = key === "ccIds";
        if (self.state.loading) return;
        if (key === "deptIds" && self.departmentFilterLocked()) return;
        if (!self.state.consulted && key !== "companyIds" && !escolheAntes) return;
        if (key === "deptIds" && self.accessibleDepartments()) {
          self.state.deptIds = self.accessibleDepartments().map((a) => a.id);
        } else {
          self.state[key] = [];
        }
        self.aposFiltro(key);
        self.state[openKey] = true;
        if (self.state.consulted && !self.state.loading) {
          self.applyFilters();
          self.renderList();
        }
        self.paintFilters();
      }
    });
  };
  const set = (slotId, html) => {
    const slot = document.getElementById(slotId);
    if (slot) slot.innerHTML = html;
  };
  if (!window.MlEmpresaFilter) return;
  set("cfin-emp-slot", MlEmpresaFilter.html({
    id: "cfin-filter-emp",
    label: "Empresas",
    items: this.empItems(),
    selectedIds: this.state.companyIds,
    open: !!this.state.openEmp,
    query: this.state.qEmp,
    emptyMeansAll: true,
    literalAll: !!this.state.empPelosCentros,
    nouns: { singular: "empresa", plural: "empresas" }
  }));
  set("cfin-cc-slot", MlEmpresaFilter.html({
    id: "cfin-filter-cc",
    label: "Empreendimento",
    items: this.ccItems(),
    selectedIds: this.state.ccIds,
    open: !!this.state.openCc,
    query: this.state.qCc,
    emptyMeansAll: true,
    nouns: { singular: "empreendimento", plural: "empreendimentos" }
  }));
  const credoresProntos = typeof this.credoresProntos === "function"
    ? this.credoresProntos()
    : !!(this.state.consulted && !this.state.loading);
  const nounsCredor = typeof this.nounsCredor === "function"
    ? this.nounsCredor()
    : { singular: "credor", plural: "credores", none: "Nenhum credor", noMatch: "Nenhum credor com esse nome." };
  set("cfin-cred-slot", MlEmpresaFilter.html({
    id: "cfin-filter-cred",
    label: "Credor",
    items: typeof this.credItems === "function" ? this.credItems() : [],
    selectedIds: this.state.creditorIds,
    open: !!this.state.openCred && credoresProntos,
    query: this.state.qCred,
    emptyMeansAll: true,
    emptyLabel: credoresProntos ? "" : "Consulte para listar",
    nouns: nounsCredor
  }));
  set("cfin-dept-slot", this.deptFilterHtml());
  bind("cfin-filter-emp", "companyIds", "openEmp", "qEmp", () => this.empItems(), { singular: "empresa", plural: "empresas" });
  bind("cfin-filter-cc", "ccIds", "openCc", "qCc", () => this.ccItems(), { singular: "empreendimento", plural: "empreendimentos" });
  bind("cfin-filter-cred", "creditorIds", "openCred", "qCred", () => this.credItems(), { singular: "credor", plural: "credores" });
  bind("cfin-filter-dept", "deptIds", "openDept", "qDept", () => this.deptItems(), { singular: "departamento", plural: "departamentos" });
  if (window.lucide) lucide.createIcons();
};

ComprasControleApp.comEscolha = function (daLista, catalogo, selectedIds) {
  const lista = Array.isArray(daLista) ? daLista : [];
  const extraFonte = Array.isArray(catalogo) ? catalogo : [];
  if (!lista.length) return extraFonte;
  const ids = new Set(lista.map((x) => String(x.id)));
  const sel = new Set((selectedIds || []).map(String));
  const extra = extraFonte.filter((x) => sel.has(String(x.id)) && !ids.has(String(x.id)));
  return extra.length ? lista.concat(extra) : lista;
};

ComprasControleApp.catalogoEmpreendimentos = function () {
  return ComprasPrevisoesApp.centrosDaEmpresa(this.state.companyIds);
};

ComprasControleApp.podarCentrosForaDaEmpresa = function () {
  const ok = {};
  this.ccItems().forEach((x) => { ok[String(x.id)] = true; });
  this.state.ccIds = (this.state.ccIds || []).filter((id) => ok[String(id)]);
};

ComprasControleApp.ccItems = function () {
  const daLista = ComprasPrevisoesApp.ccItems.call(this);
  return this.comEscolha(daLista, this.catalogoEmpreendimentos(), this.state.ccIds);
};

ComprasControleApp.credoresProntos = function () {
  return !!(this.state && this.state.consulted && !this.state.loading);
};

ComprasControleApp.nounsCredor = function () {
  const pronto = this.credoresProntos();
  return {
    singular: "credor",
    plural: "credores",
    none: pronto ? "Nenhum credor" : "Consulte para listar os credores",
    noMatch: "Nenhum credor com esse nome."
  };
};

ComprasControleApp.credItems = function () {
  if (!this.credoresProntos()) return [];
  return ComprasPrevisoesApp.credItems.call(this);
};

ComprasControleApp.garantirEmpreendimentos = async function () {
  if ((this.catalogoEmpreendimentos() || []).length) return;
  if (!window.SiengeApiService || typeof SiengeApiService.getCostCenters !== "function") return;
  try {
    const list = await SiengeApiService.getCostCenters();
    if (window.AppState && Array.isArray(list) && list.length) AppState.cachedCostCenters = list;
    if ((this.state.ccIds || []).length) this.aplicarEmpresasDosCentros();
    if (!this.state.openCc) this.paintFilters();
  } catch (e) {}
};

/** { kind, data } da forma programada, null sem forma, ou { erro } quando o Sienge não respondeu. */
ComprasControleApp.formaPagamento = async function (billId, parcela) {
  if (typeof window.siengeFetchWithRetry !== "function" || !window.BoletoCheck) return null;
  try {
    return await BoletoCheck.lerForma(billId, parcela || 1);
  } catch (e) {
    return { erro: (e && e.message) || "O Sienge não respondeu à consulta da forma de pagamento." };
  }
};

ComprasControleApp.temDadosForma = function (data) {
  return !!window.BoletoCheck && BoletoCheck.temDadosForma(data);
};

ComprasControleApp.textoErroSienge = function (msg) {
  const m = String(msg || "").trim();
  if (/\b429\b/.test(m)) return "O Sienge limitou as consultas (429). A leitura parou por excesso de chamadas. Feche e abra o título de novo em instantes.";
  return m || "O Sienge não respondeu.";
};

ComprasControleApp.formaFalhaHtml = function (payment) {
  return `<p style="color:#b45309;"><strong>Não foi possível consultar a forma de pagamento.</strong> ${this.esc(this.textoErroSienge(payment.erro))}</p>`;
};

ComprasControleApp.formaHtml = function (payment, row) {
  if (payment && payment.erro) return this.formaFalhaHtml(payment);
  if (payment && payment.data) {
    const d = payment.data;
    if (payment.kind === "pix") {
      if (window.BoletoCheck) return BoletoCheck.html(payment, { check: row && row.pagCheck }) + (d.notes ? `<p style="margin-top:6px;">${this.esc(d.notes)}</p>` : "");
      return `<p><strong>Forma:</strong> PIX</p><p>${this.esc(d.notes || "Chave do credor")}</p>`;
    }
    if (payment.kind === "boleto-bancario" || payment.kind === "boleto-concessionaria") {
      if (window.BoletoCheck) {
        const r = row || {};
        return BoletoCheck.html(payment, { valor: r.valorConferir, vencimento: r.vencimento, descontoTitulo: r.descontoTitulo, retido: r.retido });
      }
      const nome = payment.kind === "boleto-concessionaria" ? "Boleto de concessionária" : "Boleto";
      return `<p><strong>Forma:</strong> ${nome}</p><p>${this.esc(d.notes || d.boletoBancarioManualBarCodeNumber || d.boletoConcessionariaManualBarCodeNumber || "")}</p>`;
    }
    const banco = [d.beneficiaryBankCode, d.beneficiaryBankName].filter(Boolean).join(" — ");
    const ag = [d.beneficiaryBankBranchNumber, d.beneficiaryBankBranchDigit].filter(Boolean).join("-");
    const conta = [d.beneficiaryAccountNumber, d.beneficiaryAccountDigit].filter(Boolean).join("-");
    const tipo = d.beneficiaryAccountType === "P" ? "Poupança" : "Conta corrente";
    return `<p><strong>Forma:</strong> Transferência</p>
      <p><strong>Banco:</strong> ${this.esc(banco || "—")}</p>
      <p><strong>Agência:</strong> ${this.esc(ag || "—")}</p>
      <p><strong>${this.esc(tipo)}:</strong> ${this.esc(conta || "—")}</p>
      <p><strong>Favorecido:</strong> ${this.esc(d.beneficiaryName || "—")}</p>
      ${d.notes ? `<pre style="white-space:pre-wrap;font-family:inherit;margin:8px 0 0;">${this.esc(d.notes)}</pre>` : ""}`;
  }
  if (row && (row.tipoBaixa || row.conta || row.operacao)) {
    return `<p><strong>Programação na consulta:</strong> ${this.esc([row.tipoBaixa, row.operacao, row.conta].filter(Boolean).join(" · "))}</p>`;
  }
  return `<p>O pagamento ainda não está programado neste título.</p>`;
};

ComprasControleApp.statusLabel = function (row) {
  const map = {
    pago: "Pago",
    processamento: "Processamento bancário",
    programado: "Programado",
    previsao: "Previsão",
    vencido: "Vencido",
    rastreando: "Rastreando banco"
  };
  return map[this.statusDe(row)] || "Programado";
};

ComprasControleApp.fecharTitulo = function () {
  this._tituloGen = (this._tituloGen || 0) + 1;
  this._tituloDetalhe = null;
  const el = document.getElementById("cfin-titulo");
  if (el) el.remove();
};

ComprasControleApp.abrirTitulo = async function (index) {
  return this.abrirTituloRow((this.state.shown || [])[Number(index)]);
};

/** Abre o resumo do título (dados, anexos e forma de pagamento) a partir de uma linha de qualquer tela. */
ComprasControleApp.abrirTituloRow = async function (row) {
  if (!row || !row.titulo) return;
  const gen = (this._tituloGen || 0) + 1;
  this._tituloGen = gen;
  this._tituloDetalhe = { loading: true, error: "", row: row, bill: null, attachments: [], payment: null };
  this.pintarTitulo();
  try {
    if (typeof window.siengeFetchWithRetry !== "function") throw new Error("A API do Sienge não está disponível nesta tela.");
    const billId = row.titulo;
    const semFiscal = !!row.semFiscal;
    const pago = this.statusDe(row) === "pago";
    const docIdRow = String(row.docId || "").trim();
    const docNomeRow = String(row.docNome || "").trim();
    const pareceServico = !!(window.NotaFiscalCheck && NotaFiscalCheck.ehNfsOuNfj(docIdRow, docNomeRow));
    if (window.FilaNotasFiscais && typeof this.ouvirFilaFiscal === "function") this.ouvirFilaFiscal();
    const jaValidada = !pago && pareceServico && this.notaValidadaDoTitulo(row);
    const impostosP = !semFiscal && !pago && pareceServico && !jaValidada && window.NotaFiscalCheck && typeof NotaFiscalCheck.impostosDoTitulo === "function"
      ? NotaFiscalCheck.impostosDoTitulo(billId).catch(() => [])
      : Promise.resolve([]);
    const [bill, attachments, payment, impostos] = await Promise.all([
      window.siengeFetchWithRetry("/bills/" + encodeURIComponent(billId), 1),
      this.anexosDoTitulo(billId).catch(() => []),
      row.pagPayment && !row.pagPayment.erro ? Promise.resolve(row.pagPayment) : this.formaPagamento(billId, row.parcela || 1),
      impostosP
    ]);
    if (this._tituloGen !== gen) return;
    this._tituloDetalhe.loading = false;
    this._tituloDetalhe.bill = bill || null;
    this._tituloDetalhe.attachments = attachments || [];
    this._tituloDetalhe.payment = payment;
    this._tituloDetalhe.impostos = Array.isArray(impostos) ? impostos : [];
    const docIdFiscal = String(row.docId || (bill && bill.documentIdentificationId) || "").trim();
    const docNomeFiscal = String(row.docNome || (bill && bill.documentIdentificationName) || "").trim();
    const notaServico = !!(window.NotaFiscalCheck && NotaFiscalCheck.ehNfsOuNfj(docIdFiscal, docNomeFiscal));
    const notaValidada = !pago && notaServico && this.notaValidadaDoTitulo(Object.assign({}, row, {
      documento: row.documento || (bill && bill.documentNumber) || "",
      docId: docIdFiscal,
      docNome: docNomeFiscal
    }));
    const mostraFiscal = !semFiscal && !pago && notaServico;
    this._tituloDetalhe.mostraFiscal = mostraFiscal;
    this._tituloDetalhe.notaValidada = notaValidada;
    const fiscalVelho = row.fiscal && !(row.fiscal.infos || []).some((t) => /\b404\b/.test(String(t)));
    this._tituloDetalhe.fiscal = mostraFiscal && !notaValidada && fiscalVelho ? row.fiscal : null;
    this._tituloDetalhe.fiscalLoading = !!mostraFiscal && !notaValidada && !this._tituloDetalhe.fiscal;
    this.pintarTitulo();
    if (mostraFiscal && !notaValidada) {
      NotaFiscalCheck.analisar({
        billId,
        credorId: row.credorId || (bill && bill.creditorId) || "",
        bruto: Number(row.valor) || Number(row.valorAjustado) || 0,
        anexos: this._tituloDetalhe.attachments
      }).then((fiscal) => {
        if (this._tituloGen !== gen || !this._tituloDetalhe) return;
        this._tituloDetalhe.fiscal = fiscal;
        this._tituloDetalhe.fiscalLoading = false;
        if (fiscal && Array.isArray(fiscal.impostos) && fiscal.impostos.length) this._tituloDetalhe.impostos = fiscal.impostos;
        this.pintarTitulo();
      }).catch((e) => {
        if (this._tituloGen !== gen || !this._tituloDetalhe) return;
        this._tituloDetalhe.fiscalLoading = false;
        this._tituloDetalhe.fiscalErro = this.textoErroSienge(e && e.message);
        this.pintarTitulo();
      });
    }
    const chaveFiscal = this.chaveEnvioFiscal(row);
    if (chaveFiscal) {
      if (typeof this.ouvirFilaFiscal === "function") this.ouvirFilaFiscal();
      this.pedirAutorizacao(chaveFiscal, row.companyId);
    }
  } catch (e) {
    if (this._tituloGen !== gen) return;
    this._tituloDetalhe.loading = false;
    this._tituloDetalhe.error = this.textoErroSienge((e && e.message) || "Não consegui abrir o título.");
    this.pintarTitulo();
  }
};

ComprasControleApp.companyLabel = function (id) {
  const sid = id == null || id === "" ? "" : String(id);
  const name = this.companyName(sid);
  if (name) return sid + " — " + name;
  return sid || "—";
};

/** "Nome em dd/mm/aaaa às hh:mm" a partir do usuário e da data do Sienge (yyyy-MM-dd HH:mm:ss ou ISO). */
ComprasControleApp.quemQuando = function (quem, quando) {
  const m = String(quando || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  const data = m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` às ${m[4]}:${m[5]}` : ""}` : "";
  const nome = String(quem || "").trim();
  if (!nome && !data) return "—";
  return [nome || "—", data].filter(Boolean).join(" em ");
};

ComprasControleApp.lerPct = function (txt) {
  const s = String(txt || "").replace("%", "").replace(/\s/g, "").trim();
  if (!s || s === "—" || s === "-") return null;
  const n = Number(s.indexOf(",") >= 0 ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

/** Na linha do rateio, embaixo do valor e do esperado: imposto retido e o que de fato será pago. */
ComprasControleApp.anotarRateioImposto = function (html, impostos, retido, bruto) {
  if (!html || !(retido > 0.009) || !(bruto > 0.009)) return html;
  const lista = (impostos || []).filter((t) => t && Number(t.valor) > 0.009);
  const dica = lista.map((t) => `${t.tipo || t.nome || "Imposto"} ${this.money(t.valor)}`).join(" · ");
  const re = /<tr(?![^>]*\bgp-rateio-obra\b)([^>]*)>([\s\S]*?)<\/tr>/g;
  const found = [];
  let m;
  while ((m = re.exec(html))) {
    const tds = m[2].match(/<td\b[\s\S]*?<\/td>/g);
    if (!tds || tds.length < 6) continue;
    const pct = this.lerPct(tds[2].replace(/<[^>]+>/g, ""));
    if (pct == null) continue;
    found.push({ start: m.index, end: m.index + m[0].length, attrs: m[1] || "", tds, pct });
  }
  if (!found.length) return html;
  const soma = found.reduce((s, f) => s + f.pct, 0) || 100;
  let restoRet = retido;
  let restoLiq = Math.round((bruto - retido) * 100) / 100;
  found.forEach((f, i) => {
    const ultimo = i === found.length - 1;
    const parte = f.pct / soma;
    const ret = ultimo ? Math.round(restoRet * 100) / 100 : Math.round(retido * parte * 100) / 100;
    const base = Math.round(bruto * parte * 100) / 100;
    const pagar = ultimo ? Math.round(restoLiq * 100) / 100 : Math.round((base - ret) * 100) / 100;
    restoRet = Math.round((restoRet - ret) * 100) / 100;
    restoLiq = Math.round((restoLiq - pagar) * 100) / 100;
    f.tds[3] = f.tds[3].replace(/<\/td>$/i, `<div class="gp-rateio-ret" title="${this.esc(dica)}">imposto retido ${this.esc(this.money(ret))}</div></td>`);
    f.tds[5] = f.tds[5].replace(/<\/td>$/i, `<div class="gp-rateio-liq">líquido ${this.esc(this.money(pagar))}</div></td>`);
    f.html = `<tr${f.attrs}>${f.tds.join("")}</tr>`;
  });
  let out = "";
  let cursor = 0;
  found.forEach((f) => {
    out += html.slice(cursor, f.start) + f.html;
    cursor = f.end;
  });
  return out + html.slice(cursor);
};

ComprasControleApp.irEtapa = function (id) {
  if (!this._tituloDetalhe || !id) return;
  this._tituloDetalhe.etapa = id;
  this.pintarTitulo();
};

ComprasControleApp.impostosRetidosHtml = function (det, row) {
  if (det.fiscal && window.NotaFiscalCheck) return NotaFiscalCheck.html(det.fiscal);
  if (det.fiscalErro) return `<p style="color:#b45309;"><strong>A conferência fiscal parou.</strong> ${this.esc(det.fiscalErro)}</p>`;
  if (det.fiscalLoading) return `<p class="cfin-titulo-wait">Lendo os impostos retidos no Sienge e na nota…</p>`;
  const docId = String((row && row.docId) || "").trim();
  const docNome = String((row && row.docNome) || "").trim();
  if (window.NotaFiscalCheck && NotaFiscalCheck.semRetencao(docId, docNome)) {
    return `<p>Este documento não tem retenção de imposto na fonte.</p>`;
  }
  const impostos = Array.isArray(det.impostos) ? det.impostos.filter((t) => t && Number(t.valor) > 0.009) : [];
  if (!impostos.length) return `<p><strong>Nenhum imposto retido lançado neste título no Sienge.</strong></p>`;
  const total = Math.round(impostos.reduce((s, t) => s + (Number(t.valor) || 0), 0) * 100) / 100;
  const linhas = impostos.map((t) => `<tr>
    <td>${this.esc(t.tipo || t.nome || "Imposto")}</td>
    <td>${t.base != null ? this.esc(this.money(t.base)) : "—"}</td>
    <td>${t.aliquota != null ? this.esc(String(t.aliquota).replace(".", ",") + "%") : "—"}</td>
    <td>${this.esc(this.money(t.valor))}</td>
  </tr>`).join("");
  return `<p><strong>Impostos retidos no Sienge:</strong> ${this.esc(this.money(total))}</p>
    <table class="nfchk-tab"><thead><tr><th>Imposto</th><th>Base</th><th>Alíquota</th><th>Valor retido</th></tr></thead><tbody>${linhas}</tbody></table>`;
};

ComprasControleApp.pintarTitulo = function () {
  const det = this._tituloDetalhe;
  let el = document.getElementById("cfin-titulo");
  if (!det) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.id = "cfin-titulo";
    document.body.appendChild(el);
  }
  const row = det.row || {};
  const bill = det.bill || {};
  const credor = bill.creditorName || row.credor || "—";
  const doc = [row.docId || bill.documentIdentificationId, row.documento || bill.documentNumber].filter(Boolean).join(" ");
  const cc = [row.ccId, row.ccNome].filter(Boolean).join(" — ") || "—";
  const plano = [row.planoId, row.plano].filter(Boolean).join(" — ") || "—";
  const empresaId = row.companyId || bill.companyId || "";
  const pago = row.natureza === "pago" && row.dataPagamento;
  const valor = pago ? (row.valorAjustado != null ? row.valorAjustado : row.valor) : (Number(row.saldo) > 0 ? row.saldo : row.valorAjustado);
  const impostos = Array.isArray(det.impostos) ? det.impostos : [];
  const retidoCheio = Math.round(impostos.reduce((s, t) => s + (Number(t.valor) || 0), 0) * 100) / 100;
  const bruto = Number(row.valor) || Number(row.valorAjustado) || Number(valor) || 0;
  const aberto = Number(valor) || 0;
  const bases = impostos.map((t) => Number(t.base)).filter((n) => n > 0.009);
  const baseImp = bases.length ? Math.max.apply(null, bases) : 0;
  const referencia = baseImp > 0.009 ? baseImp : bruto;
  const liquidoCalc = Math.round((referencia - retidoCheio) * 100) / 100;
  const jaLiquido = retidoCheio > 0.009 && Math.abs(aberto - liquidoCalc) <= 0.05 && Math.abs(aberto - referencia) > 0.05;
  const casaComBruto = Math.abs(aberto - referencia) <= 0.05 || Math.abs(aberto - bruto) <= 0.05;
  const retido = !pago && retidoCheio > 0.009 && !jaLiquido && casaComBruto ? retidoCheio : 0;
  const aPagar = pago ? valor : (retido > 0.009 ? Math.round((aberto - retido) * 100) / 100 : aberto);
  const obs = bill.notes || bill.observation || bill.historic || bill.history || bill.complement || "";
  const conferir = Object.assign({}, row, {
    valorConferir: pago ? null : aberto,
    descontoTitulo: Number(bill.discount) || 0,
    retido,
    pagCheck: row.pagPayment && row.pagPayment === det.payment ? row.pagCheck : undefined
  });
  const forma = typeof caixaFormaHtml === "function"
    ? caixaFormaHtml(det.payment, conferir)
    : this.formaHtml(det.payment, conferir);
  const anexos = (det.attachments || []).map((a) => `
    <button type="button" class="btn btn-outline btn-sm" style="height:32px;" onclick="event.stopPropagation(); ComprasControleApp.baixarAnexoTitulo('${this.esc(row.titulo)}','${this.esc(a.id)}','${this.esc(a.name || "anexo.pdf")}')"><i data-lucide="file-down" style="width:14px;height:14px;"></i> ${this.esc(a.description || a.name || "Anexo")}</button>
  `).join("");

  let formaNivel = "";
  if (det.payment && det.payment.erro) formaNivel = "aviso";
  else if (det.payment && window.BoletoCheck) {
    const v = det.payment.kind === "pix" ? conferir.pagCheck
      : (BoletoCheck.ehBoleto(det.payment) ? BoletoCheck.validar(det.payment, { valor: conferir.valorConferir, vencimento: row.vencimento, descontoTitulo: conferir.descontoTitulo, retido: conferir.retido }) : null);
    formaNivel = v ? v.nivel : "";
  }
  const rateio = this.anotarRateioImposto(String(row.rateioHtml || "").replace(/^\s*<h4>[^<]*<\/h4>/, ""), impostos, retido, bruto);
  const rateioNivel = !rateio ? "" : (/is-bad/.test(rateio) ? "erro" : (/is-warn/.test(rateio) ? "aviso" : "ok"));
  const selo = (nivel) => ({
    ok: `<span class="bchk bchk-ok">Conferido ✓</span>`,
    erro: `<span class="bchk bchk-erro">Erro</span>`,
    aviso: `<span class="bchk bchk-aviso">Atenção</span>`,
    sem: `<span class="bchk bchk-aviso">Atenção</span>`,
    info: `<span class="bchk bchk-info">Não conferido</span>`,
    espera: `<span class="bchk bchk-wait">Consultando…</span>`,
    autorizada: `<span class="bchk bchk-ok">Autorizada</span>`,
    negada: `<span class="bchk bchk-erro">Não autorizada</span>`,
    analise: `<span class="bchk bchk-analise">Em análise</span>`
  }[nivel] || "");
  const bloco = (icone, titulo, nivel, corpo, extra) => `<section class="cfin-sec${nivel === "erro" ? " is-erro" : (nivel === "aviso" || nivel === "sem" ? " is-aviso" : "")}${extra ? " " + extra : ""}">
      <header class="cfin-sec-h"><i data-lucide="${icone}"></i><span>${titulo}</span>${selo(nivel)}</header>
      <div class="cfin-sec-b">${corpo}</div>
    </section>`;

  const dados = `<div class="cfin-dados-topo">
          <div class="cfin-titulo-destaque"><span>${pago ? "Valor pago" : "Valor a pagar"}</span><div class="cfin-titulo-valor">${this.esc(this.money(pago ? valor : aPagar))}</div>${retido > 0.009 ? `<small>bruto ${this.esc(this.money(referencia))} − imposto retido ${this.esc(this.money(retido))}</small>` : ""}</div>
          <div class="cfin-titulo-destaque"><span>Vencimento</span><div class="cfin-titulo-strong">${this.esc(this.fmtDate(row.vencimento || bill.dueDate))}</div></div>
          <div class="cfin-titulo-destaque"><span>Situação</span><div>${this.esc(row.situacaoTexto || this.statusLabel(row))}</div></div>
        </div>
        <div class="cfin-titulo-grid">
          <div><span>Credor</span><div class="cfin-titulo-strong">${this.esc(credor)}</div></div>
          <div><span>Documento</span><div class="cfin-titulo-strong">${this.esc(doc || "—")}</div></div>
          <div><span>Empresa</span><div>${this.esc(this.companyLabel(empresaId))}</div></div>
          ${row.rateioHtml ? "" : `<div><span>Centro de custo</span><div>${this.esc(cc)}</div></div>
          <div><span>Plano financeiro</span><div>${this.esc(plano)}</div></div>`}
          <div><span>Emissão</span><div>${this.esc(this.fmtDate(row.emissao || bill.issueDate))}</div></div>
          <div><span>Departamento</span><div>${this.esc(row.departamento || "—")}</div></div>
          ${det.loading ? "" : `<div><span>Criado por</span><div>${this.esc(this.quemQuando(bill.registeredBy || bill.registeredUserId, bill.registeredDate))}</div></div>
          <div><span>Última alteração</span><div>${this.esc(this.quemQuando(bill.changedBy || bill.changedUserId, bill.changedDate))}</div></div>`}
          ${pago ? `<div><span>Pagamento</span><div>${this.esc(this.fmtDate(row.dataPagamento))}</div></div>` : ""}
          ${row.conta || row.operacao || row.tipoBaixa ? `<div><span>Conta / operação</span><div>${this.esc([row.tipoBaixa, row.operacao, row.conta].filter(Boolean).join(" · "))}</div></div>` : ""}
        </div>
        ${obs ? `<p class="cfin-titulo-obs"><strong>Observação:</strong> ${this.esc(obs)}</p>` : ""}`;

  const chave = this.chaveEnvioFiscal(row);
  const ped = chave.indexOf("ppc:") === 0 ? chave.slice(4) : "";
  const contrato = chave.indexOf("ct:") === 0 ? chave.slice(3) : "";
  let autBloco = "";
  let fiscalBloco = "";
  let autNivel = "";
  let fiscalNivel = "";
  if (chave && !det.loading) {
    const aut = (this._autPedidos || {})[chave];
    const item = ped && window.FilaNotasFiscais ? FilaNotasFiscais.doPedido(this._filaFiscal, ped) : null;
    const emAnalise = item && (item.status === "pendente" || item.status === "em_lancamento");
    const nome = contrato ? "Autorização do contrato " + this.esc(contrato) : "Autorização do pedido " + this.esc(ped);
    const botaoEnvio = (rotulo, id) => `<div class="cfin-aut-acao"><button type="button" class="cprev-fiscal-btn" onclick="event.stopPropagation(); FilaNotasFiscais.abrirEnvio('${this.esc(ped)}','${this.esc(id || "")}')">${rotulo}</button></div>`;
    if (!aut) {
      autNivel = "espera";
      autBloco = bloco("badge-check", nome, "espera", "<p>Consultando a autorização no Sienge…</p>");
      if (ped) { fiscalNivel = "espera"; fiscalBloco = bloco("clipboard-check", "Envio da nota", "espera", "<p>Aguardando a leitura da autorização.</p>"); }
    } else if (aut.limite) {
      autNivel = "aviso";
      autBloco = bloco("badge-check", nome, "aviso", "<p>O Sienge limitou as consultas (429). Consulte de novo em instantes.</p>");
    } else if (aut.ausente) {
      autNivel = "aviso";
      autBloco = bloco("badge-check", nome, "aviso", `<p>${contrato ? "Contrato" : "Pedido"} não encontrado no Sienge.</p>`);
    } else if (aut.erro) {
      autNivel = "aviso";
      autBloco = bloco("badge-check", nome, "aviso", `<p>Não consegui ler a autorização: ${this.esc(aut.erro)}</p>`);
    } else if (!aut.ok) {
      autNivel = "negada";
      autBloco = bloco("badge-check", nome, "negada", `<p>${contrato ? "O contrato" : "O pedido"} ainda não está autorizado.</p>`);
      if (ped) fiscalBloco = bloco("clipboard-check", "Envio da nota", "", "<p>O envio da nota fica disponível depois da autorização.</p>");
    } else if (contrato) {
      autNivel = "autorizada";
      autBloco = bloco("badge-check", nome, "autorizada", "<p>Contrato autorizado no Sienge.</p>");
    } else {
      autNivel = "autorizada";
      autBloco = bloco("badge-check", nome, "autorizada", "<p>Pedido autorizado no Sienge.</p>");
      if (emAnalise) {
        fiscalNivel = "analise";
        fiscalBloco = bloco("clipboard-check", "Envio da nota", "analise", "<p>A nota deste pedido já está com o fiscal.</p>");
      } else if (item && item.status === "devolvida") {
        fiscalNivel = "aviso";
        fiscalBloco = bloco("clipboard-check", "Envio da nota", "aviso", `<p>A nota foi devolvida${item.motivoDevolucao ? ": " + this.esc(item.motivoDevolucao) : "."}</p>${botaoEnvio("Corrigir envio", item.id)}`);
      } else if (item && item.status === "lancada") {
        fiscalNivel = "ok";
        fiscalBloco = bloco("clipboard-check", "Envio da nota", "ok", "<p>A nota já foi lançada no Sienge.</p>");
      } else {
        fiscalBloco = bloco("clipboard-check", "Envio da nota", "", `<p>Este pedido ainda não tem nota no fiscal.</p>${botaoEnvio("Enviar nota para o fiscal")}`);
      }
    }
  }

  const etapas = [
    { id: "dados", label: "Dados", icon: "file-text", nivel: "", html: bloco("file-text", "Dados do título", "", dados, "cfin-sec-dados") }
  ];
  if (rateio) etapas.push({ id: "rateio", label: "Rateio", icon: "pie-chart", nivel: rateioNivel, html: bloco("pie-chart", "Rateio por centro de custo", rateioNivel, rateio) });
  if (!det.loading) {
    const docIdAba = String(row.docId || (det.bill && det.bill.documentIdentificationId) || "").trim();
    const docNomeAba = String(row.docNome || (det.bill && det.bill.documentIdentificationName) || "").trim();
    const mostraFiscal = det.mostraFiscal != null
      ? !!det.mostraFiscal
      : (!row.semFiscal && this.statusDe(row) !== "pago" && !!(window.NotaFiscalCheck && NotaFiscalCheck.ehNfsOuNfj(docIdAba, docNomeAba)));
    const validada = this.statusDe(row) === "pago" ? null : (det.notaValidada || this.notaValidadaDoTitulo(Object.assign({}, row, {
      docId: docIdAba,
      docNome: docNomeAba
    })));
    const nivelImp = det.fiscalErro ? "aviso" : (det.fiscalLoading && !det.fiscal ? "espera" : (det.fiscal ? (det.fiscal.nivel === "info" ? "aviso" : det.fiscal.nivel) : ""));
    const rank = { erro: 6, negada: 6, aviso: 5, sem: 5, info: 4, analise: 3, espera: 2, ok: 1 };
    const nivelAba = validada ? "ok" : ((rank[nivelImp] || 0) >= (rank[fiscalNivel] || 0) ? nivelImp : fiscalNivel);
    if (mostraFiscal && validada) etapas.push({
      id: "fiscal",
      label: "Validado",
      icon: "badge-check",
      nivel: "ok",
      html: bloco("badge-check", "Validado", "ok", this.notaValidadaHtml(validada))
    });
    else if (mostraFiscal) etapas.push({
      id: "fiscal",
      label: "Fiscal",
      icon: "receipt",
      nivel: nivelAba,
      html: bloco("receipt", "Impostos retidos", nivelImp, this.impostosRetidosHtml(det, row)) + (fiscalBloco || "")
    });
    etapas.push({ id: "pagamento", label: "Pagamento", icon: "credit-card", nivel: formaNivel, html: bloco("credit-card", "Forma de pagamento programada", formaNivel, forma) });
    const temAnexo = (det.attachments || []).length > 0;
    etapas.push({ id: "anexos", label: "Anexos", icon: "paperclip", nivel: temAnexo ? "ok" : "aviso", html: bloco("paperclip", "Anexos", temAnexo ? "ok" : "aviso", `<div class="cfin-titulo-files">${anexos || `<span>Este título não tem anexo.</span>`}</div>`) });
    if (autBloco) etapas.push({ id: "autorizacao", label: contrato ? "Contrato" : "Autorização", icon: "badge-check", nivel: autNivel, html: autBloco });
  }
  if (!etapas.some((e) => e.id === det.etapa)) det.etapa = etapas[0].id;
  const indice = Math.max(0, etapas.findIndex((e) => e.id === det.etapa));
  const atual = etapas[indice];
  const alerta = (nivel) => (nivel === "erro" || nivel === "negada" || nivel === "aviso" || nivel === "sem") ? "!" : "";
  const abas = `<div class="ml-tabs cfin-etapas" role="tablist">${etapas.map((t, n) => {
    const ativa = t.id === atual.id;
    const marca = alerta(t.nivel);
    return `<button type="button" role="tab" class="ml-tab${ativa ? " is-active" : ""}" aria-selected="${ativa}" title="${marca ? "Esta etapa precisa de atenção" : t.label}" onclick="ComprasControleApp.irEtapa('${t.id}')"><i data-lucide="${t.icon}"></i> ${n + 1}. ${t.label}${marca ? `<span class="ml-tab-count">${marca}</span>` : ""}</button>`;
  }).join("")}</div>`;
  const anterior = etapas[indice - 1];
  const seguinte = etapas[indice + 1];
  const chaveFiscal = this.chaveEnvioFiscal(row);
  const pedidoFiscal = chaveFiscal.indexOf("ppc:") === 0 ? chaveFiscal.slice(4) : "";
  const enviarFiscal = this.statusDe(row) === "previsao" && pedidoFiscal
    ? `<button type="button" class="cfin-enviar-fiscal" onclick="event.stopPropagation(); if(window.FilaNotasFiscais) FilaNotasFiscais.abrirEnvio('${this.esc(pedidoFiscal)}','')">ENVIAR NOTA PARA FISCAL</button>`
    : "";
  const nav = etapas.length > 1 ? `<div class="cfin-etapas-nav"><span>Etapa ${indice + 1} de ${etapas.length}</span>${enviarFiscal}<button type="button" class="btn btn-outline" ${anterior ? "" : "disabled"} onclick="ComprasControleApp.irEtapa('${anterior ? anterior.id : ""}')">Voltar</button><button type="button" class="btn btn-primary" ${seguinte ? "" : "disabled"} onclick="ComprasControleApp.irEtapa('${seguinte ? seguinte.id : ""}')">Próxima etapa</button></div>` : "";

  el.innerHTML = `
    <div class="cfin-titulo-back" onclick="if(event.target===this)ComprasControleApp.fecharTitulo()">
      <div class="cfin-titulo-card${row.rateioHtml ? " is-largo" : ""}" onclick="event.stopPropagation()">
        <div class="cfin-titulo-head">
          <h3>Título ${this.esc(row.titulo)}${row.parcela ? " · parcela " + this.esc(row.parcela) : ""}</h3>
          <button type="button" class="btn btn-cancel btn-sm" onclick="ComprasControleApp.fecharTitulo()">Fechar</button>
        </div>
        ${det.loading ? `<p class="cfin-titulo-wait">Abrindo título, anexos e forma de pagamento…</p>` : abas}
        ${det.error ? `<p class="cfin-titulo-erro">${this.esc(det.error)}</p>` : ""}
        <div class="cfin-etapa-corpo">${det.loading ? "" : atual.html}</div>
        ${det.loading ? "" : nav}
      </div>
    </div>
    <style>
      #cfin-titulo .cfin-titulo-back { position:fixed; inset:0; z-index:10020; background:rgba(15,23,42,.45); display:flex; align-items:center; justify-content:center; padding:16px; }
      #cfin-titulo .cfin-titulo-card { background:#fff; border-radius:12px; width:min(720px,96vw); max-height:86vh; overflow:hidden; padding:18px 20px; display:flex; flex-direction:column; min-height:min(560px, 82vh); }
      #cfin-titulo .cfin-titulo-card.is-largo { width:min(1180px,96vw); max-height:92vh; min-height:min(680px, 86vh); padding:20px 26px; }
      #cfin-titulo .cfin-titulo-card.is-largo .cfin-titulo-grid { grid-template-columns:repeat(3, minmax(0, 1fr)); }
      #cfin-titulo .cfin-dados-topo { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; }
      #cfin-titulo .cfin-titulo-destaque > span { display:block; color:#64748b; font-size:0.75rem; }
      #cfin-titulo .cfin-etapas { margin-top:14px; flex:none; }
      #cfin-titulo .cfin-etapa-corpo { flex:1; min-height:0; overflow:auto; margin-top:4px; }
      #cfin-titulo .cfin-etapas .ml-tab-count { background:#fee2e2; color:#b91c1c; }
      #cfin-titulo .cfin-etapas .ml-tab.is-active .ml-tab-count { background:#fee2e2; color:#b91c1c; }
      #cfin-titulo .cfin-etapas-nav { display:flex; justify-content:flex-end; align-items:center; gap:8px; flex:none; margin-top:0; padding-top:14px; border-top:1px solid #e2e8f0; }
      #cfin-titulo .cfin-etapas-nav span { margin-right:auto; color:#64748b; font-size:0.8rem; font-weight:700; }
      #cfin-titulo .cfin-enviar-fiscal { height:36px; padding:0 14px; border-radius:8px; border:1px solid #f37021; background:#f37021; color:#fff; font-weight:800; cursor:pointer; white-space:nowrap; }
      @media (max-width: 900px) {
        #cfin-titulo .cfin-titulo-card.is-largo .cfin-titulo-grid,
        #cfin-titulo .cfin-dados-topo { grid-template-columns:1fr 1fr; }
      }
      #cfin-titulo .cfin-titulo-head { display:flex; justify-content:space-between; gap:12px; align-items:center; }
      #cfin-titulo h3 { margin:0; color:#105436; font-size:1.05rem; }
      #cfin-titulo h4 { margin:16px 0 6px; color:#105436; font-size:0.92rem; }
      #cfin-titulo .cfin-titulo-wait { color:#64748b; margin:12px 0 0; }
      #cfin-titulo .cfin-titulo-erro { color:#b91c1c; margin:12px 0 0; }
      #cfin-titulo .cfin-titulo-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; margin-top:12px; font-size:0.86rem; }
      #cfin-titulo .cfin-titulo-grid span { display:block; color:#64748b; font-size:0.75rem; }
      #cfin-titulo .cfin-titulo-strong { font-weight:700; }
      #cfin-titulo .cfin-titulo-valor { font-weight:700; color:#c2410c; }
      #cfin-titulo .cfin-titulo-obs { margin:10px 0 0; padding-top:8px; border-top:1px dashed #e2e8f0; font-size:0.84rem; }
      #cfin-titulo .cfin-titulo-files { display:flex; flex-wrap:wrap; gap:8px; color:#64748b; font-size:0.84rem; }
      #cfin-titulo .cfin-titulo-files .btn { display:inline-flex; align-items:center; gap:6px; }
      #cfin-titulo .cfin-sec { border:1px solid #e2e8f0; border-radius:10px; margin-top:12px; overflow:hidden; background:#fff; }
      #cfin-titulo .cfin-sec-h { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f1f5f9; border-bottom:1px solid #e2e8f0; color:#105436; font-weight:800; font-size:0.86rem; }
      #cfin-titulo .cfin-sec-h svg { width:16px; height:16px; flex:none; }
      #cfin-titulo .cfin-sec-h .bchk { margin-left:auto; }
      #cfin-titulo .cfin-sec-b { padding:10px 14px 12px; font-size:0.86rem; }
      #cfin-titulo .cfin-sec-b p { margin:0 0 4px; }
      #cfin-titulo .cfin-sec-b .cfin-titulo-grid { margin-top:0; }
      #cfin-titulo .cfin-sec-b .gp-rateio { margin-top:0; }
      #cfin-titulo .gp-rateio-ret { display:block; margin-top:3px; color:#9a3412; font-weight:700; font-size:0.75rem; white-space:nowrap; }
      #cfin-titulo .gp-rateio-liq { display:block; margin-top:3px; color:#105436; font-weight:800; font-size:0.78rem; white-space:nowrap; }
      #cfin-titulo .cfin-sec.is-erro { border-color:#fecaca; }
      #cfin-titulo .cfin-sec.is-erro .cfin-sec-h { background:#fef2f2; color:#b91c1c; border-bottom-color:#fecaca; }
      #cfin-titulo .cfin-sec.is-aviso { border-color:#fed7aa; }
      #cfin-titulo .cfin-sec.is-aviso .cfin-sec-h { background:#fff7ed; color:#c2410c; border-bottom-color:#fed7aa; }
      #cfin-titulo .cfin-sec-par { display:grid; grid-template-columns:minmax(0, 1.7fr) minmax(0, 1fr); gap:12px; }
      #cfin-titulo .cfin-sec-par > .cfin-sec { margin-top:12px; }
      @media (max-width: 900px) { #cfin-titulo .cfin-sec-par { grid-template-columns:1fr; gap:0; } }
      #cfin-titulo .cfin-titulo-destaque { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; }
      #cfin-titulo .cfin-titulo-destaque small { display:block; color:#64748b; font-size:0.72rem; }
      #cfin-titulo .cfin-aut-acao { margin-top:8px; }
      #cfin-titulo .bchk-analise { background:#fff7ed; color:#c2410c; }
    </style>`;
  try { if (window.lucide) lucide.createIcons(); } catch (e) {}
};

ComprasControleApp.renderList = function () {
  const box = document.getElementById("cfin-results");
  const kpi = document.getElementById("cfin-kpis");
  if (!box) return;
  if (this.state.loading) {
    if (kpi) kpi.innerHTML = "";
    this.noteProgress(this.state.loadingMsg || "Carregando contas a pagar da base…", 0);
    return;
  }
  if (this.state.error) {
    box.innerHTML = '<div class="tvig-empty">' + this.esc(this.state.error) + "</div>";
    if (kpi) kpi.innerHTML = "";
    return;
  }
  if (!this.state.consulted) {
    box.innerHTML = '<div class="tvig-empty">Use <strong>Consultar</strong> para carregar o controle financeiro.</div>';
    if (kpi) kpi.innerHTML = "";
    return;
  }
  const avisoHist = this.state.falhaHist
    ? '<div class="tvig-empty" style="margin-bottom:10px;color:#9a3412;border-color:#fdba74;">' + this.esc(this.state.falhaHist) + "</div>"
    : "";
  const rows = this.state.shown || [];
  this.paintKpis();
  if (!rows.length) {
    box.innerHTML = avisoHist + '<div class="tvig-empty">Nenhum título neste filtro.</div>';
    return;
  }
  const grupos = this.ordenarGrupos(this.gruposDaLista(rows));
  const th = (key, label, cls) => `<th class="${cls || ""}" onclick="ComprasControleApp.toggleSort('${key}')" style="cursor:pointer;user-select:none;">${label} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
  const body = grupos.map((g) => {
    const r = g.partes[0];
    const subst = r.substituido
      ? `<span class="cprev-tag cprev-tag-subst">Substituído${r.tituloSubstituto ? " · " + this.esc(r.tituloSubstituto) : ""}</span>`
      : "";
    const varios = g.partes.length > 1;
    const aberto = !!(this.state.agrupados && this.state.agrupados[g.key]);
    let ccCell;
    if (!varios) {
      const ccLabel = (r.ccId ? r.ccId + " - " : "") + (r.ccNome || "—");
      ccCell = `<td class="cprev-col-cc" title="${this.esc(ccLabel)}">${this.esc(ccLabel)}</td>`;
    } else {
      ccCell = `<td class="cprev-col-cc"><button type="button" class="cfin-agrupado${aberto ? " is-open" : ""}" data-k="${this.esc(g.key)}" title="${aberto ? "Ocultar o rateio por centro de custo" : "Ver o rateio por centro de custo"}" onclick="event.stopPropagation(); ComprasControleApp.toggleAgrupamento(this.getAttribute('data-k'))"><i data-lucide="${aberto ? "chevron-up" : "layers"}" style="width:13px;height:13px;"></i> Agrupado · ${g.partes.length}</button></td>`;
    }
    const dept = this.rotuloUnico(g.partes, "departamento");
    const pago = r.natureza === "pago" && r.dataPagamento;
    const dataRaw = pago ? r.dataPagamento : r.vencimento;
    const dataTitle = pago ? "Pagamento " + this.fmtDate(dataRaw) : "Vencimento " + this.fmtDate(dataRaw);
    const sig = this.statusDe(r) + "|" + (r.lote || "");
    const detalhe = aberto && varios ? g.partes.map((p) => {
      const nome = (p.ccId ? p.ccId + " - " : "") + (p.ccNome || "—");
      const pct = Number(p.rateio);
      const pctTxt = Number.isFinite(pct) ? " · " + pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%" : "";
      return `<tr class="cfin-rateio" onclick="event.stopPropagation()">
        <td class="cprev-col-tit"></td>
        <td class="cprev-col-parc"></td>
        <td class="cprev-col-id"></td>
        <td class="cprev-col-cc" title="${this.esc(nome)}">${this.esc(nome + pctTxt)}</td>
        <td class="cprev-col-dept" title="${this.esc(p.departamento || "—")}">${this.esc(p.departamento || "—")}</td>
        <td class="cprev-col-cred"></td>
        <td class="cprev-col-doc"></td>
        <td class="cprev-col-ndoc"></td>
        <td class="cprev-col-venc"></td>
        <td class="cprev-col-tipo"></td>
        <td class="cprev-col-aut"></td>
        <td class="cprev-col-fiscal"></td>
        <td class="cprev-col-val">${this.esc(this.money(p.valorAjustado))}</td>
      </tr>`;
    }).join("") : "";
    return `<tr class="cprev-row" title="Abrir título, anexos e forma de pagamento" onclick="ComprasControleApp.abrirTitulo(${g.idx})">
      <td class="cprev-col-tit" title="${this.esc(r.titulo)}">${this.esc(r.titulo)}${subst}</td>
      <td class="cprev-col-parc">${this.esc(r.parcela || "—")}</td>
      <td class="cprev-col-id" title="${this.esc(r.companyId)}">${this.esc(r.companyId)}</td>
      ${ccCell}
      <td class="cprev-col-dept" title="${this.esc(dept)}">${this.esc(dept)}</td>
      <td class="cprev-col-cred" title="${this.esc(r.credor || "—")}">${this.esc(r.credor || "—")}</td>
      <td class="cprev-col-doc">${this.esc(r.docId || "—")}</td>
      <td class="cprev-col-ndoc">${this.esc(r.documento || "—")}</td>
      <td class="cprev-col-venc" title="${this.esc(dataTitle)}">${this.esc(this.fmtDate(dataRaw))}</td>
      <td class="cprev-col-tipo" data-st="${this.esc(sig)}">${this.tipoTag(r)}</td>
      <td class="cprev-col-aut">${this.autorizacaoHtml(r)}</td>
      <td class="cprev-col-fiscal">${this.fiscalHtml(r)}</td>
      <td class="cprev-col-val">${this.esc(this.money(this.valorGrupo(g)))}</td>
    </tr>${detalhe}`;
  }).join("");
  box.innerHTML = avisoHist + `
    <style>
      #cfin-table thead th { white-space: nowrap; }
      #cfin-table tbody tr.cprev-row { cursor: pointer; }
      #cfin-table tbody tr.cprev-row:hover td { background: #f3faf6; }
      #cfin-table th.cprev-col-tipo,
      #cfin-table td.cprev-col-tipo { text-align: center; }
      #cfin-table td.cprev-col-tipo .cprev-tag { margin-left: 0; margin-right: 0; }
      #cfin-table td.cprev-col-cc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #cfin-table button.cfin-agrupado { display:inline-flex; align-items:center; gap:4px; height:26px; padding:0 8px; border:1px solid #105436; border-radius:6px; background:#f3faf6; color:#105436; font-size:0.72rem; font-weight:700; cursor:pointer; white-space:nowrap; }
      #cfin-table button.cfin-agrupado.is-open { background:#105436; color:#fff; }
      #cfin-table tr.cfin-rateio td { background:#f8fafc; color:#334155; font-size:0.72rem; }
      #cfin-table tr.cfin-rateio td.cprev-col-cc { box-shadow: inset 3px 0 0 #105436; }
    </style>
    <div class="table-container cprev-table-wrap">
      <table class="custom-table cprev-table" id="cfin-table">
        <colgroup>
          <col class="cprev-col-tit"><col class="cprev-col-parc"><col class="cprev-col-id"><col class="cprev-col-cc">
          <col class="cprev-col-dept"><col class="cprev-col-cred"><col class="cprev-col-doc"><col class="cprev-col-ndoc">
          <col class="cprev-col-venc"><col class="cprev-col-tipo"><col class="cprev-col-aut"><col class="cprev-col-fiscal"><col class="cprev-col-val">
        </colgroup>
        <thead><tr>
          ${th("titulo", "Título", "cprev-col-tit")}${th("parc", "Parc.", "cprev-col-parc")}
          <th class="cprev-col-id" title="Id. da empresa" onclick="ComprasControleApp.toggleSort('emp')" style="cursor:pointer;user-select:none;text-align:center;"><div class="cfin-id-head">Id. <i data-lucide="info" style="width:11px;height:11px;cursor:help;color:#64748b;"></i> <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></div></th>${th("cc", "Centro de custo")}${th("dept", "Depto")}${th("credor", "Credor")}
          ${th("doc", "Doc.")}${th("ndoc", "Nº doc.")}${th("data", "Venc./Pagto")}${th("tipo", "Status", "cprev-col-tipo")}${th("aut", "Autorizado", "cprev-col-aut")}${th("fiscal", "Fiscal", "cprev-col-fiscal")}${th("valor", "Valor", "cprev-col-val")}
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  if (window.lucide) lucide.createIcons();
  this.carregarAutorizacoes(rows);
};

ComprasControleApp.exportExcel = function () {
  const rows = this.state.shown || [];
  if (!rows.length || typeof XLSX === "undefined") {
    alert("Não há títulos para exportar. Consulte antes.");
    return;
  }
  const head = ["Título", "Parcela", "Empresa", "Centro de custo", "Departamento", "Credor", "Documento", "Nº documento", "Venc./Pagto", "Status", "Autorizado", "Fiscal", "Valor"];
  const tipo = { pago: "Pago", processamento: "Processamento bancário", programado: "Programado", previsao: "Previsão", vencido: "Vencido", rastreando: "Rastreando banco" };
  const grupos = this.ordenarGrupos(this.gruposDaLista(rows));
  const aoa = [head].concat(grupos.map((g) => {
    const r = g.partes[0];
    const centros = g.partes.map((p) => {
      const nome = (p.ccId ? p.ccId + " - " : "") + (p.ccNome || "");
      return g.partes.length > 1 ? nome + " (" + this.money(p.valorAjustado) + ")" : nome;
    }).join(" | ");
    return [
      r.titulo,
      r.parcela || "",
      r.companyId,
      centros,
      this.rotuloUnico(g.partes, "departamento"),
      r.credor || "",
      r.docId || "",
      r.documento || "",
      this.fmtDate(this.dataRef(r)),
      tipo[this.statusDe(r)] || r.natureza,
      this.autorizacaoTexto(r),
      this.fiscalTexto(r),
      this.valorGrupo(g)
    ];
  }));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Controle financeiro");
  XLSX.writeFile(wb, "controle-financeiro-" + new Date().toISOString().slice(0, 10) + ".xlsx");
};

ComprasControleApp.renderPage = function () {
  const root = document.getElementById("compras-controle-root");
  if (!root) return;
  const s = this.state;
  const busy = !!s.loading;
  const refineLocked = !s.consulted || busy;
  this.syncDepartmentSelection();
  const deptLocked = this.departmentFilterLocked();
  const status = s.status || "todos";
  root.innerHTML = `
    <div class="cprev-page">
      <div class="search-filter-panel cprev-toolbar">
        <div class="ecau-grid cprev-ecau${busy ? " is-consulting" : ""}">
          <div id="cfin-emp-slot" class="ecau-slot ecau-cell-emp${busy ? " is-locked" : ""}"></div>
          <div id="cfin-cc-slot" class="ecau-slot ecau-cell-obra${busy ? " is-locked" : ""}"></div>
          <div id="cfin-cred-slot" class="ecau-slot ecau-cell-cred${refineLocked ? " is-locked" : ""}"></div>
          <div class="form-group ecau-search ecau-cell-titulo${refineLocked ? " is-locked" : ""}">
            <label>Título</label>
            <input type="search" class="form-control" placeholder="Título ou nº do documento"
              value="${this.esc(s.qTitulo)}" ${refineLocked ? "disabled" : ""}
              oninput="ComprasControleApp.onField('qTitulo', this.value)" autocomplete="off">
          </div>
          <div class="form-group ecau-search ecau-cell-sit${refineLocked ? " is-locked" : ""}">
            <label>Status</label>
            <select class="form-control" ${refineLocked ? "disabled" : ""} onchange="ComprasControleApp.onField('status', this.value)">
              <option value="todos" ${status === "todos" ? "selected" : ""}>Todos</option>
              <option value="pago" ${status === "pago" ? "selected" : ""}>Pago</option>
              <option value="processamento" ${status === "processamento" ? "selected" : ""}>Processamento bancário</option>
              <option value="programado" ${status === "programado" ? "selected" : ""}>Programado</option>
              <option value="vencido" ${status === "vencido" ? "selected" : ""}>Vencido</option>
              <option value="previsao" ${status === "previsao" ? "selected" : ""}>Previsão</option>
            </select>
          </div>
          <div class="ecau-cell-dates${busy ? " is-locked" : ""}">
            <div class="form-group ecau-date">
              <label>Vencimento de</label>
              <input type="date" class="form-control" value="${this.esc(s.startDate)}" ${busy ? "disabled" : ""}
                onchange="ComprasControleApp.onField('startDate', this.value)">
            </div>
            <div class="form-group ecau-date">
              <label>Vencimento até</label>
              <input type="date" class="form-control" value="${this.esc(s.endDate)}" ${busy ? "disabled" : ""}
                onchange="ComprasControleApp.onField('endDate', this.value)">
            </div>
          </div>
          <div id="cfin-dept-slot" class="ecau-slot cprev-cell-dept${refineLocked || deptLocked ? " is-locked" : ""}"></div>
          <div class="ecau-actions">
            <div class="ecau-actions-main">
              <button type="button" class="btn btn-primary btn-sm" ${busy ? "disabled" : ""} onclick="ComprasControleApp.consultar()">
                ${busy ? '<span class="ecau-spin" aria-hidden="true"></span>' : '<i data-lucide="search" style="width:14px;height:14px;"></i>'}
                Consultar
              </button>
              <button type="button" class="btn btn-cancel btn-sm" ${busy ? "disabled" : ""} onclick="ComprasControleApp.limpar()">Limpar</button>
              <button type="button" class="btn btn-sm btn-excel" ${busy || !s.consulted ? "disabled" : ""} onclick="ComprasControleApp.exportExcel()" title="Exportar tabela atual para Excel">
                <i data-lucide="download" style="width:14px;height:14px;"></i> Excel
              </button>
            </div>
          </div>
        </div>
        ${this.departmentScopeNote() ? `<p class="cprev-hint">${this.esc(this.departmentScopeNote())}</p>` : ""}
      </div>
      <div id="cfin-kpis" class="ccom-kpis cprev-kpis"></div>
      <div id="cfin-banco" class="cfin-banco" hidden></div>
      <div id="cfin-results" class="cprev-results"></div>
    </div>`;
  this.paintFilters();
  this.renderList();
  this.paintBanco();
  if (window.lucide) lucide.createIcons();
};

ComprasControleApp.init = async function () {
  const root = document.getElementById("compras-controle-root");
  if (!root) return;
  if (this.state.consulted && !this.state.loading) {
    this.applyFilters();
    this.renderPage();
  }
  if (this._boot) return;
  this._boot = true;
  this.garantirEmpreendimentos();
  if (!this.state.inited) {
    const range = this.defaultRange();
    this.state.startDate = range.startDate;
    this.state.endDate = range.endDate;
    this.state.inited = true;
    this.renderPage();
    this.ouvirFilaFiscal();
    await this.loadCompanies();
    this.renderPage();
  }
};

ComprasControleApp.ouvirFilaFiscal = function () {
  if (this._filaOuvida || !window.FilaNotasFiscais) return;
  this._filaOuvida = true;
  FilaNotasFiscais.ouvir((lista) => {
    this._filaFiscal = lista || [];
    if (this.state && this.state.consulted && !this.state.loading) this.renderList();
    if (this._tituloDetalhe && !this._tituloDetalhe.loading) this.pintarTitulo();
  });
};

window.ComprasControleApp = ComprasControleApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "compras-controle" && window.ComprasControleApp) {
    ComprasControleApp.init();
  }
});
