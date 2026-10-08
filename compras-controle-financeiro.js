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
    if (merged.pago && !merged.substituido) merged.natureza = "pago";
    else if (prev.natureza === "previsao" || r.natureza === "previsao") merged.natureza = "previsao";
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

ComprasControleApp.tipoTag = function (r) {
  if (r.natureza === "pago") return '<span class="cprev-tag cprev-tag-pago">Pago</span>';
  if (r.natureza === "previsao") return '<span class="cprev-tag cprev-tag-subst">Previsão</span>';
  return '<span class="cprev-tag cprev-tag-nota">Programado</span>';
};

ComprasControleApp.applyFilters = function () {
  const emp = new Set((this.state.companyIds || []).map(String));
  const cred = new Set((this.state.creditorIds || []).map(String));
  const cc = new Set((this.state.ccIds || []).map(String));
  const qTitulo = this.fold(this.state.qTitulo).replace(/\s+/g, "");
  const status = this.state.status || "todos";
  const start = this.state.startDate || "";
  const end = this.state.endDate || "";
  this.state.shown = this.scopedRows().filter((r) => {
    if (emp.size && !emp.has(String(r.companyId))) return false;
    if (cc.size && !cc.has(String(r.ccId))) return false;
    if (cred.size && !cred.has(this.fold(r.credor))) return false;
    if (!this.rowMatchesDepartment(r)) return false;
    if (start && r.vencimento && r.vencimento < start) return false;
    if (end && r.vencimento && r.vencimento > end) return false;
    if (status !== "todos" && r.natureza !== status) return false;
    if (qTitulo) {
      const blob = this.fold([r.titulo, r.documento, r.parcela].join("")).replace(/\s+/g, "");
      if (blob.indexOf(qTitulo) < 0) return false;
    }
    r.grupo = this.rowGroup(r);
    return true;
  }).sort((a, b) => {
    const ga = this.groupMeta(a.grupo).order;
    const gb = this.groupMeta(b.grupo).order;
    if (ga !== gb) return ga - gb;
    return String(a.vencimento).localeCompare(String(b.vencimento))
      || String(a.credor).localeCompare(String(b.credor), "pt-BR")
      || String(a.titulo).localeCompare(String(b.titulo));
  });
};

ComprasControleApp.kpis = function () {
  const rows = this.state.shown || [];
  const out = { qtd: rows.length, total: 0, pago: 0, programado: 0, previsao: 0 };
  rows.forEach((r) => {
    const v = Number(r.valorAjustado) || 0;
    out.total += v;
    if (r.natureza === "pago") out.pago += v;
    else if (r.natureza === "previsao") out.previsao += v;
    else out.programado += v;
  });
  return out;
};

ComprasControleApp.noteProgress = function (text) {
  const box = document.getElementById("cfin-results");
  if (box) box.innerHTML = '<div class="tvig-empty">' + this.esc(text) + "</div>";
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
      this.noteProgress("Buscando contas a pagar no Sienge… " + step + " de " + total);
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
  this.state.error = "";
  this.state.consulted = true;
  this.renderPage();
  try {
    const payload = await this.fetchOutcome(start, end);
    this.indexBills(payload);
    this.state.allRows = this.transform(payload);
    this.state.updatedAt = new Date().toISOString();
    this.applyFilters();
  } catch (e) {
    this.state.error = (e && e.message) ? e.message : "Falha ao buscar contas a pagar no Sienge.";
    this.state.allRows = [];
    this.state.shown = [];
    this.state.billsByTitulo = {};
  }
  this.state.loading = false;
  this.renderPage();
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
  this.state.shown = [];
  this.state.allRows = [];
  this.state.billsByTitulo = {};
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
    MlEmpresaFilter.bind({
      id: id,
      onToggleOpen() {
        if (self.state.loading) return;
        if (key !== "companyIds" && key !== "deptIds" && !self.state.consulted) return;
        self.state[openKey] = !self.state[openKey];
        self.paintFilters();
      },
      onQuery(q) { self.state[qKey] = q; },
      onList() {
        const box = document.querySelector("#" + id + " .ml-emp-filter-list");
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
        if (!self.state.consulted && key !== "companyIds" && key !== "deptIds") return;
        const sid = String(itemId);
        const cur = self.state[key].slice();
        self.state[key] = on ? (cur.includes(sid) ? cur : cur.concat(sid)) : cur.filter((x) => x !== sid);
        self.state[openKey] = true;
        self.applyFilters();
        self.renderList();
        self.paintFilters();
      },
      selectAll() {
        if (self.state.loading) return;
        if (!self.state.consulted && key !== "companyIds" && key !== "deptIds") return;
        self.state[key] = itemsFn().map((x) => String(x.id));
        self.state[openKey] = true;
        self.applyFilters();
        self.renderList();
        self.paintFilters();
      },
      selectNone() {
        if (self.state.loading) return;
        if (key === "deptIds" && self.accessibleDepartments()) {
          self.state.deptIds = self.accessibleDepartments().map((a) => a.id);
        } else {
          self.state[key] = [];
        }
        self.state[openKey] = true;
        self.applyFilters();
        self.renderList();
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
    box.innerHTML = '<div class="tvig-empty">Buscando contas a pagar no Sienge…</div>';
    if (kpi) kpi.innerHTML = "";
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
      <div class="ccom-kpi"><span>Programado</span><strong>${this.esc(this.money(k.programado))}</strong></div>
      <div class="ccom-kpi"><span>Previsão</span><strong>${this.esc(this.money(k.previsao))}</strong></div>
      <div class="ccom-kpi"><span>Total</span><strong>${this.esc(this.money(k.total))}</strong></div>`;
  }
  if (!rows.length) {
    box.innerHTML = '<div class="tvig-empty">Nenhum título neste filtro.</div>';
    return;
  }
  const totals = {};
  rows.forEach((r) => {
    const g = r.grupo || this.rowGroup(r);
    if (!totals[g]) totals[g] = { count: 0, value: 0 };
    totals[g].count += 1;
    totals[g].value += Number(r.valorAjustado) || 0;
  });
  let lastGroup = null;
  const body = rows.map((r) => {
    let header = "";
    if (r.grupo !== lastGroup) {
      lastGroup = r.grupo;
      header = this.groupHeaderHtml(r.grupo, totals[r.grupo] || { count: 0, value: 0 });
    }
    const subst = r.substituido
      ? `<span class="cprev-tag cprev-tag-subst">Substituído${r.tituloSubstituto ? " · " + this.esc(r.tituloSubstituto) : ""}</span>`
      : "";
    const ccLabel = (r.ccId ? r.ccId + " - " : "") + (r.ccNome || "—");
    return header + `<tr class="cprev-row">
      <td class="cprev-col-id" title="${this.esc(r.companyId)}">${this.esc(r.companyId)}</td>
      <td class="cprev-col-cc" title="${this.esc(ccLabel)}">${this.esc(ccLabel)}</td>
      <td class="cprev-col-dept" title="${this.esc(r.departamento || "—")}">${this.esc(r.departamento || "—")}</td>
      <td class="cprev-col-cred" title="${this.esc(r.credor || "—")}">${this.esc(r.credor || "—")}</td>
      <td class="cprev-col-tit" title="${this.esc(r.titulo)}">${this.esc(r.titulo)}${subst}</td>
      <td class="cprev-col-parc">${this.esc(r.parcela || "—")}</td>
      <td class="cprev-col-doc">${this.esc(r.docId || "—")}</td>
      <td class="cprev-col-ndoc">${this.esc(r.documento || "—")}</td>
      <td class="cprev-col-venc">${this.esc(this.fmtDate(r.vencimento))}</td>
      <td class="cprev-col-tipo">${this.tipoTag(r)}</td>
      <td class="cprev-col-val">${this.esc(this.money(r.valorAjustado))}</td>
    </tr>`;
  }).join("");
  box.innerHTML = `
    <div class="table-container cprev-table-wrap">
      <table class="custom-table cprev-table" id="cfin-table">
        <colgroup>
          <col class="cprev-col-id"><col class="cprev-col-cc"><col class="cprev-col-dept"><col class="cprev-col-cred">
          <col class="cprev-col-tit"><col class="cprev-col-parc"><col class="cprev-col-doc"><col class="cprev-col-ndoc">
          <col class="cprev-col-venc"><col class="cprev-col-tipo"><col class="cprev-col-val">
        </colgroup>
        <thead><tr>
          <th>Emp.</th><th>Centro de custo</th><th>Depto</th><th>Credor</th><th>Título</th>
          <th>Parc.</th><th>Doc.</th><th>Nº doc.</th><th>Vencimento</th><th>Tipo</th><th>Valor</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
};

ComprasControleApp.exportExcel = function () {
  const rows = this.state.shown || [];
  if (!rows.length || typeof XLSX === "undefined") {
    alert("Não há títulos para exportar. Consulte antes.");
    return;
  }
  const head = ["Empresa", "Centro de custo", "Departamento", "Credor", "Título", "Parcela", "Documento", "Nº documento", "Vencimento", "Tipo", "Valor"];
  const tipo = { pago: "Pago", programado: "Programado", previsao: "Previsão" };
  const aoa = [head].concat(rows.map((r) => [
    r.companyId,
    (r.ccId ? r.ccId + " - " : "") + (r.ccNome || ""),
    r.departamento || "",
    r.credor || "",
    r.titulo,
    r.parcela || "",
    r.docId || "",
    r.documento || "",
    this.fmtDate(r.vencimento),
    tipo[r.natureza] || r.natureza,
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
            <label>Tipo</label>
            <select class="form-control" ${refineLocked ? "disabled" : ""} onchange="ComprasControleApp.onField('status', this.value)">
              <option value="todos" ${status === "todos" ? "selected" : ""}>Todos</option>
              <option value="pago" ${status === "pago" ? "selected" : ""}>Pago</option>
              <option value="programado" ${status === "programado" ? "selected" : ""}>Programado</option>
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
          <div id="cfin-dept-slot" class="ecau-slot cprev-cell-dept${deptLocked ? " is-locked" : ""}"></div>
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
        <p class="cprev-hint"><strong>Pago</strong> já baixou. <strong>Programado</strong> é título real em aberto. <strong>Previsão</strong> ainda é só documento de previsão. A consulta traz os três.</p>
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
