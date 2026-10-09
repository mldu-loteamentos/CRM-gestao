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
  openTitulo: ""
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
    const k = [r.titulo, r.emissao, r.parcela, r.departamento].join("|");
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
  const rows = this.state.shown || [];
  const out = { qtd: rows.length, total: 0, pago: 0, programado: 0, processamento: 0, previsao: 0, vencido: 0 };
  rows.forEach((r) => {
    const v = Number(r.valorAjustado) || 0;
    out.total += v;
    const st = this.statusDe(r);
    if (st === "pago") out.pago += v;
    else if (st === "processamento") out.processamento += v;
    else if (st === "previsao") out.previsao += v;
    else if (st === "vencido") out.vencido += v;
    else out.programado += v;
  });
  return out;
};

ComprasControleApp.noteProgress = function (text, ratio) {
  const box = document.getElementById("cfin-results");
  if (!box) return;
  const pct = Math.max(0, Math.min(100, Math.round((Number(ratio) || 0) * 100)));
  let wrap = box.querySelector(".cfin-load");
  if (!wrap || wrap.getAttribute("data-phase") !== text) {
    box.innerHTML = '<div class="tvig-empty"><div class="cfin-load" data-phase="' + this.esc(text) + '" style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:400px;margin:0 auto;">'
      + '<span class="loading-status-text" style="font-weight:500;">' + this.esc(text) + '</span>'
      + '<div style="width:100%;background:#e2e8f0;border-radius:8px;height:10px;overflow:hidden;margin-top:5px;">'
      + '<div class="loading-progress-bar" style="width:0%;height:100%;background:#10b981;transition:width 0.25s linear;"></div>'
      + '</div></div></div>';
    wrap = box.querySelector(".cfin-load");
  }
  const bar = box.querySelector(".loading-progress-bar");
  if (bar) bar.style.width = pct + "%";
};

ComprasControleApp.departmentScopeNote = function () {
  const note = ComprasPrevisoesApp.departmentScopeNote.call(this);
  return String(note || "").replace(/previsões/g, "títulos").replace(/previsão/g, "título");
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
  if (typeof window.siengeFetchWithRetry !== "function") return;
  const cache = this.state.lotesByTitulo || (this.state.lotesByTitulo = {});
  const ids = [];
  (this.state.allRows || []).forEach((r) => {
    if (!r || r.natureza !== "programado" || r.forecast) return;
    const id = String(r.titulo || "");
    if (id && !Object.prototype.hasOwnProperty.call(cache, id) && ids.indexOf(id) < 0) ids.push(id);
  });
  if (!ids.length) return;
  let done = 0;
  const total = ids.length;
  const paintProgress = () => {
    if (this.state.loteGen !== gen) return;
    this.noteProgress("Buscando processamento bancário…", total ? done / total : 0);
  };
  paintProgress();
  await new Promise((r) => setTimeout(r, 0));
  const queue = ids.slice();
  const worker = async () => {
    while (queue.length && this.state.loteGen === gen) {
      const id = queue.shift();
      try {
        const data = await window.siengeFetchWithRetry("/bills/" + encodeURIComponent(id) + "/installments", 1);
        const map = {};
        ((data && data.results) || []).forEach((inst) => {
          const n = String(inst.installmentNumber != null ? inst.installmentNumber : "");
          const lote = this.loteEnviado(inst);
          if (n && lote) map[n] = lote;
        });
        cache[id] = map;
      } catch (e) {
        cache[id] = {};
      }
      (this.state.allRows || []).forEach((r) => {
        if (!r || String(r.titulo) !== id || r.natureza !== "programado" || r.forecast) return;
        const lote = (cache[id] || {})[String(r.parcela || "")];
        if (!lote) return;
        r.natureza = "processamento";
        r.lote = lote;
      });
      done += 1;
      paintProgress();
    }
  };
  const jobs = [];
  const workers = Math.min(3, total);
  for (let i = 0; i < workers; i++) jobs.push(worker());
  await Promise.all(jobs);
};

ComprasControleApp.fetchOutcome = async function (start, end) {
  const chunks = typeof siengeSplitDateRange === "function"
    ? siengeSplitDateRange(start, end)
    : [{ start: start, end: end }];
  const ids = (this.state.companyIds || []).map(String).filter(Boolean);
  const targets = ids.length ? ids : [""];
  const data = [];
  let step = 0;
  const total = Math.max(1, chunks.length * targets.length);
  for (const chunk of chunks) {
    for (const companyId of targets) {
      step += 1;
      this.noteProgress("Buscando contas a pagar no Sienge…", step / total);
      const bills = await this.outcomeRange(chunk.start, chunk.end, companyId);
      data.push.apply(data, bills);
    }
  }
  return { data: data };
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
  this.state.rastreando = false;
  this.state.error = "";
  this.state.consulted = true;
  this.state.loteGen = (this.state.loteGen || 0) + 1;
  this.renderPage();
  try {
    const payload = await this.fetchOutcome(start, end);
    this.indexBills(payload);
    this.state.allRows = this.transform(payload);
    this.state.updatedAt = new Date().toISOString();
    this.state.lotesByTitulo = {};
    await this.carregarLotes();
    this.applyFilters();
  } catch (e) {
    this.state.error = (e && e.message) ? e.message : "Falha ao buscar contas a pagar no Sienge.";
    this.state.allRows = [];
    this.state.shown = [];
    this.state.billsByTitulo = {};
  }
  this.state.loading = false;
  this.state.rastreando = false;
  const y = window.scrollY || 0;
  this.renderPage();
  if (y) window.scrollTo(0, y);
};

ComprasControleApp.limpar = function () {
  const range = this.defaultRange();
  this.state.startDate = range.startDate;
  this.state.endDate = range.endDate;
  this.state.companyIds = [];
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
  this.state.rastreando = false;
  this.state.loteGen = (this.state.loteGen || 0) + 1;
  this.state.consulted = false;
  this.state.error = "";
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
        if (self.state.loading) return;
        if (key === "deptIds" && self.departmentFilterLocked()) return;
        if (!self.state.consulted && key !== "companyIds") return;
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
        if (self.state.loading) return;
        if (key === "deptIds" && self.departmentFilterLocked()) return;
        if (!self.state.consulted && key !== "companyIds") return;
        const sid = String(itemId);
        const cur = self.state[key].slice();
        self.state[key] = on ? (cur.includes(sid) ? cur : cur.concat(sid)) : cur.filter((x) => x !== sid);
        self.state[openKey] = true;
        if (self.state.consulted) {
          self.applyFilters();
          self.renderList();
        }
        self.paintFilters();
      },
      selectAll() {
        if (self.state.loading) return;
        if (key === "deptIds" && self.departmentFilterLocked()) return;
        if (!self.state.consulted && key !== "companyIds") return;
        self.state[key] = itemsFn().map((x) => String(x.id));
        self.state[openKey] = true;
        if (self.state.consulted) {
          self.applyFilters();
          self.renderList();
        }
        self.paintFilters();
      },
      selectNone() {
        if (self.state.loading) return;
        if (key === "deptIds" && self.departmentFilterLocked()) return;
        if (!self.state.consulted && key !== "companyIds") return;
        if (key === "deptIds" && self.accessibleDepartments()) {
          self.state.deptIds = self.accessibleDepartments().map((a) => a.id);
        } else {
          self.state[key] = [];
        }
        self.state[openKey] = true;
        if (self.state.consulted) {
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
  set("cfin-cred-slot", MlEmpresaFilter.html({
    id: "cfin-filter-cred",
    label: "Credor",
    items: this.credItems(),
    selectedIds: this.state.creditorIds,
    open: !!this.state.openCred,
    query: this.state.qCred,
    emptyMeansAll: true,
    nouns: { singular: "credor", plural: "credores" }
  }));
  set("cfin-dept-slot", this.deptFilterHtml());
  bind("cfin-filter-emp", "companyIds", "openEmp", "qEmp", () => this.empItems(), { singular: "empresa", plural: "empresas" });
  bind("cfin-filter-cc", "ccIds", "openCc", "qCc", () => this.ccItems(), { singular: "empreendimento", plural: "empreendimentos" });
  bind("cfin-filter-cred", "creditorIds", "openCred", "qCred", () => this.credItems(), { singular: "credor", plural: "credores" });
  bind("cfin-filter-dept", "deptIds", "openDept", "qDept", () => this.deptItems(), { singular: "departamento", plural: "departamentos" });
  if (window.lucide) lucide.createIcons();
};

ComprasControleApp.renderList = function () {
  const box = document.getElementById("cfin-results");
  const kpi = document.getElementById("cfin-kpis");
  if (!box) return;
  if (this.state.loading) {
    if (kpi) kpi.innerHTML = "";
    this.noteProgress("Buscando contas a pagar no Sienge…", 0);
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
  const rows = this.state.shown || [];
  const k = this.kpis();
  if (kpi) {
    kpi.innerHTML = `
      <div class="ccom-kpi"><span>Títulos</span><strong>${k.qtd}</strong></div>
      <div class="ccom-kpi"><span>Pago</span><strong>${this.esc(this.money(k.pago))}</strong></div>
      <div class="ccom-kpi"><span>Processamento</span><strong>${this.esc(this.money(k.processamento))}</strong></div>
      <div class="ccom-kpi"><span>Programado</span><strong>${this.esc(this.money(k.programado))}</strong></div>
      <div class="ccom-kpi"><span>Vencido</span><strong>${this.esc(this.money(k.vencido))}</strong></div>
      <div class="ccom-kpi"><span>Previsão</span><strong>${this.esc(this.money(k.previsao))}</strong></div>
      <div class="ccom-kpi"><span>Total</span><strong>${this.esc(this.money(k.total))}</strong></div>`;
  }
  if (!rows.length) {
    box.innerHTML = '<div class="tvig-empty">Nenhum título neste filtro.</div>';
    return;
  }
  const th = (key, label, cls) => `<th class="${cls || ""}" onclick="ComprasControleApp.toggleSort('${key}')" style="cursor:pointer;user-select:none;">${label} <i data-lucide="chevrons-up-down" style="width:11px;vertical-align:middle;"></i></th>`;
  const body = rows.map((r) => {
    const subst = r.substituido
      ? `<span class="cprev-tag cprev-tag-subst">Substituído${r.tituloSubstituto ? " · " + this.esc(r.tituloSubstituto) : ""}</span>`
      : "";
    const ccLabel = (r.ccId ? r.ccId + " - " : "") + (r.ccNome || "—");
    const pago = r.natureza === "pago" && r.dataPagamento;
    const dataRaw = pago ? r.dataPagamento : r.vencimento;
    const dataTitle = pago ? "Pagamento " + this.fmtDate(dataRaw) : "Vencimento " + this.fmtDate(dataRaw);
    return `<tr class="cprev-row">
      <td class="cprev-col-id" title="${this.esc(r.companyId)}">${this.esc(r.companyId)}</td>
      <td class="cprev-col-cc" title="${this.esc(ccLabel)}">${this.esc(ccLabel)}</td>
      <td class="cprev-col-dept" title="${this.esc(r.departamento || "—")}">${this.esc(r.departamento || "—")}</td>
      <td class="cprev-col-cred" title="${this.esc(r.credor || "—")}">${this.esc(r.credor || "—")}</td>
      <td class="cprev-col-tit" title="${this.esc(r.titulo)}">${this.esc(r.titulo)}${subst}</td>
      <td class="cprev-col-parc">${this.esc(r.parcela || "—")}</td>
      <td class="cprev-col-doc">${this.esc(r.docId || "—")}</td>
      <td class="cprev-col-ndoc">${this.esc(r.documento || "—")}</td>
      <td class="cprev-col-venc" title="${this.esc(dataTitle)}">${this.esc(this.fmtDate(dataRaw))}</td>
      <td class="cprev-col-tipo">${this.tipoTag(r)}</td>
      <td class="cprev-col-val">${this.esc(this.money(r.valorAjustado))}</td>
    </tr>`;
  }).join("");
  box.innerHTML = `
    <style>
      #cfin-table thead th { white-space: nowrap; }
      #cfin-table tbody tr.cprev-row { cursor: default; }
      #cfin-table th.cprev-col-tipo,
      #cfin-table td.cprev-col-tipo { text-align: center; }
      #cfin-table td.cprev-col-tipo .cprev-tag { margin-left: 0; margin-right: 0; }
    </style>
    <div class="table-container cprev-table-wrap">
      <table class="custom-table cprev-table" id="cfin-table">
        <colgroup>
          <col class="cprev-col-id"><col class="cprev-col-cc"><col class="cprev-col-dept"><col class="cprev-col-cred">
          <col class="cprev-col-tit"><col class="cprev-col-parc"><col class="cprev-col-doc"><col class="cprev-col-ndoc">
          <col class="cprev-col-venc"><col class="cprev-col-tipo"><col class="cprev-col-val">
        </colgroup>
        <thead><tr>
          ${th("emp", "Emp.")}${th("cc", "Centro de custo")}${th("dept", "Depto")}${th("credor", "Credor")}${th("titulo", "Título")}
          ${th("parc", "Parc.")}${th("doc", "Doc.")}${th("ndoc", "Nº doc.")}${th("data", "Venc./Pagto")}${th("tipo", "Status", "cprev-col-tipo")}${th("valor", "Valor")}
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  if (window.lucide) lucide.createIcons();
};

ComprasControleApp.exportExcel = function () {
  const rows = this.state.shown || [];
  if (!rows.length || typeof XLSX === "undefined") {
    alert("Não há títulos para exportar. Consulte antes.");
    return;
  }
  const head = ["Empresa", "Centro de custo", "Departamento", "Credor", "Título", "Parcela", "Documento", "Nº documento", "Venc./Pagto", "Status", "Valor"];
  const tipo = { pago: "Pago", processamento: "Processamento bancário", programado: "Programado", previsao: "Previsão", vencido: "Vencido", rastreando: "Rastreando banco" };
  const aoa = [head].concat(rows.map((r) => [
    r.companyId,
    (r.ccId ? r.ccId + " - " : "") + (r.ccNome || ""),
    r.departamento || "",
    r.credor || "",
    r.titulo,
    r.parcela || "",
    r.docId || "",
    r.documento || "",
    this.fmtDate(this.dataRef(r)),
    tipo[this.statusDe(r)] || r.natureza,
    Number(r.valorAjustado) || 0
  ]));
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
          <div id="cfin-cc-slot" class="ecau-slot ecau-cell-obra${refineLocked ? " is-locked" : ""}"></div>
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
        <p class="cprev-hint">A consulta manda para a API a <strong>empresa</strong> e o <strong>vencimento</strong>. Empreendimento, credor, título, tipo e departamento ficam liberados depois e só filtram a lista. Em <strong>Venc./Pagto</strong>, o pago mostra o pagamento, e essa data também precisa estar no período.</p>
        ${this.departmentScopeNote() ? `<p class="cprev-hint">${this.esc(this.departmentScopeNote())}</p>` : ""}
      </div>
      <div id="cfin-kpis" class="ccom-kpis cprev-kpis"></div>
      <div id="cfin-results" class="cprev-results"></div>
    </div>`;
  this.paintFilters();
  this.renderList();
  if (window.lucide) lucide.createIcons();
};

ComprasControleApp.init = async function () {
  const root = document.getElementById("compras-controle-root");
  if (!root) return;
  if (!this.state.inited) {
    const range = this.defaultRange();
    this.state.startDate = range.startDate;
    this.state.endDate = range.endDate;
    this.state.inited = true;
    this.renderPage();
    await this.loadCompanies();
  }
  if (this.state.consulted) this.applyFilters();
  this.renderPage();
};

window.ComprasControleApp = ComprasControleApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "compras-controle" && window.ComprasControleApp) {
    ComprasControleApp.init();
  }
});
