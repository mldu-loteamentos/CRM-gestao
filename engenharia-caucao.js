/**
 * Engenharia · Gestão de caução (documento CAU)
 * Lista títulos a pagar de caução, agrupa por credor e permite
 * ajustar vencimento e liberar para pagamento.
 */
var ECAU_LIBERA_LS = "crm_engenharia_caucao_liberados_v1";

window.EngenhariaCaucaoApp = {
  SKIP_OPS: {
    "Reaprop. Abatimento Adiantamento - entrada": 1,
    Recebimento: 1
  },
  SKIP_ACCOUNTS: { PAR: 1, "PAR-3": 1 },

  state: {
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
    ccIds: [],
    statusIds: ["aberto"],
    openEmp: false,
    openCred: false,
    openCc: false,
    openSit: false,
    qEmp: "",
    qCred: "",
    qCc: "",
    qSit: "",
    qTitulo: "",
    qCredor: "",
    allRows: [],
    shown: [],
    billsByTitulo: {},
    selected: {},
    liberated: {},
    busy: false,
    modal: ""
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  },

  isoToday() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  isoDate(v) {
    const s = String(v == null ? "" : v).trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  },

  addMonthsIso(iso, months) {
    const s = this.isoDate(iso) || this.isoToday();
    const d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1 + Number(months || 0), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const day = Math.min(Number(s.slice(8, 10)), last);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  },

  defaultRange() {
    const today = this.isoToday();
    return {
      startDate: this.addMonthsIso(today.slice(0, 8) + "01", -12),
      endDate: this.addMonthsIso(today.slice(0, 8) + "01", 18).replace(/\d{2}$/, (d) => {
        const y = Number(this.addMonthsIso(today.slice(0, 8) + "01", 18).slice(0, 4));
        const m = Number(this.addMonthsIso(today.slice(0, 8) + "01", 18).slice(5, 7));
        return String(new Date(y, m, 0).getDate()).padStart(2, "0");
      })
    };
  },

  fmtDate(raw) {
    const s = String(raw || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
    return s || "—";
  },

  money(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  companyName(id) {
    const c = (this.state.companies || []).find((x) => String(x.id) === String(id));
    return c ? String(c.name || c.tradeName || "").toUpperCase() : "";
  },

  listOrNull(x) {
    if (x == null) return [null];
    if (Array.isArray(x)) return x.length ? x : [null];
    return [x];
  },

  firstWord(s) {
    return String(s || "").trim().split(/\s+/)[0] || "";
  },

  docCode(s) {
    return String(s == null ? "" : s).trim().toUpperCase();
  },

  isCauDoc(docId, docName) {
    const id = this.docCode(docId);
    const token = this.docCode(this.firstWord(docId || docName));
    if (id === "CAU" || token === "CAU") return true;
    const nome = this.fold(docName);
    return nome.indexOf("CAUCAO") >= 0 || nome.indexOf("CAUÇAO") >= 0;
  },

  rowKey(r) {
    return String((r && r.titulo) || "") + "|" + String((r && r.parcela) || "");
  },

  operatorName() {
    const u = (typeof AppState !== "undefined" && AppState.currentUser) || {};
    return String(u.name || u.displayName || u.email || "Operador").trim();
  },

  loadLiberated() {
    try {
      const raw = JSON.parse(localStorage.getItem(ECAU_LIBERA_LS) || "{}") || {};
      this.state.liberated = raw && typeof raw === "object" ? raw : {};
    } catch (e) {
      this.state.liberated = {};
    }
  },

  persistLiberated() {
    try { localStorage.setItem(ECAU_LIBERA_LS, JSON.stringify(this.state.liberated || {})); } catch (e) {}
    if (typeof window.forceUploadLocalConfig === "function") {
      window.forceUploadLocalConfig(true).catch(function () {});
    }
  },

  isLiberated(r) {
    return !!(this.state.liberated && this.state.liberated[this.rowKey(r)]);
  },

  paymentDateOf(bill, pay, bm) {
    return this.isoDate(bm && bm.bankMovementDate)
      || this.isoDate(pay && (pay.paymentDate || pay.date || pay.payOffDate || pay.bankMovementDate))
      || this.isoDate(bill && (bill.paymentDate || bill.payOffDate || bill.payoffDate || bill.liquidationDate || bill.settlementDate));
  },

  billBalance(bill) {
    if (!bill) return null;
    const raw = bill.balanceAmount != null ? bill.balanceAmount
      : (bill.outstandingBalance != null ? bill.outstandingBalance
        : (bill.currentBalance != null ? bill.currentBalance
          : (bill.remainingAmount != null ? bill.remainingAmount : null)));
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },

  billSituation(bill, pay) {
    return this.fold(
      (bill && (bill.situation || bill.status || bill.billStatus || bill.installmentStatus || bill.paymentStatus))
      || (pay && (pay.situation || pay.status))
      || ""
    );
  },

  isPago(bill, pay, bm) {
    if (this.paymentDateOf(bill, pay, bm)) return true;
    const sit = this.billSituation(bill, pay);
    if (sit === "PG" || /\b(PG|PAGO|PAGA|LIQUIDADO|BAIXADO|QUITADO|PAID|SETTLED)\b/.test(sit)) return true;
    const bal = this.billBalance(bill);
    if (bal != null && Math.abs(bal) <= 0.009) return true;
    return false;
  },

  indexBills(payload) {
    const bills = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    const map = {};
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      const id = String(bill.billId);
      if (!map[id]) map[id] = [];
      map[id].push(bill);
    });
    this.state.billsByTitulo = map;
  },

  transform(payload) {
    const bills = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
    const rows = [];
    (bills || []).forEach((bill) => {
      if (!bill || bill.billId == null) return;
      if (!this.isCauDoc(bill.documentIdentificationId, bill.documentIdentificationName)) return;
      this.listOrNull(bill.paymentsCategories).forEach((cat) => {
        this.listOrNull(bill.payments).forEach((pay) => {
          this.listOrNull(pay && pay.bankMovements).forEach((bm) => {
            this.listOrNull(bill.departamentsCosts).forEach((dep) => {
              this.listOrNull(bill.buildingsCosts).forEach((bld) => {
                const operacao = (bm && bm.operationName) || "";
                const conta = (bm && bm.accountNumber) || "";
                if (this.SKIP_OPS[operacao]) return;
                if (this.SKIP_ACCOUNTS[conta]) return;
                const titulo = String(bill.billId);
                const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
                const rateio = cat && cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) : 100;
                const valor = Number(bill.originalAmount) || 0;
                rows.push({
                  companyId: String(bill.companyId || ""),
                  credor: String(bill.creditorName || "").trim(),
                  creditorId: bill.creditorId != null ? String(bill.creditorId) : "",
                  titulo,
                  documento: String(bill.documentNumber || ""),
                  vencimento: String(bill.dueDate || "").slice(0, 10),
                  emissao: String(bill.issueDate || "").slice(0, 10),
                  parcela,
                  installmentId: bill.installmentId,
                  docId: this.docCode(bill.documentIdentificationId) || "CAU",
                  docNome: this.firstWord(bill.documentIdentificationName) || "CAU",
                  valor,
                  planoId: cat && cat.financialCategoryId != null ? String(cat.financialCategoryId) : "",
                  plano: (cat && cat.financialCategoryName) || "",
                  ccId: cat && cat.costCenterId != null ? String(cat.costCenterId) : "",
                  ccNome: (cat && cat.costCenterName) || "",
                  rateio,
                  dataPagamento: this.paymentDateOf(bill, pay, bm),
                  pago: this.isPago(bill, pay, bm),
                  saldo: this.billBalance(bill),
                  situacao: this.billSituation(bill, pay),
                  departamento: (dep && dep.name) || "",
                  idObra: bld && bld.buildingId != null ? String(bld.buildingId) : "",
                  valorAjustado: valor * ((Number.isFinite(rateio) ? rateio : 100) / 100)
                });
              });
            });
          });
        });
      });
    });
    const seen = new Set();
    return rows.filter((r) => {
      const k = [r.titulo, r.parcela, r.departamento, r.ccId].join("|");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  },

  uniqueItems(rows, idFn, labelFn) {
    const map = new Map();
    (rows || []).forEach((r) => {
      const id = idFn(r);
      if (!id) return;
      if (!map.has(id)) map.set(id, { id, name: labelFn(r), label: labelFn(r) });
    });
    return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR"));
  },

  empItems() {
    const fromRows = this.uniqueItems(this.state.allRows, (r) => r.companyId, (r) => {
      const name = this.companyName(r.companyId) || r.companyId;
      return r.companyId + " - " + name;
    });
    if (fromRows.length) return fromRows;
    return (this.state.companies || []).map((c) => ({
      id: String(c.id),
      name: String(c.name || "").toUpperCase(),
      label: c.id + " - " + String(c.name || "").toUpperCase()
    }));
  },

  credItems() {
    return this.uniqueItems(this.state.allRows, (r) => this.fold(r.credor), (r) => r.credor.toUpperCase());
  },

  ccItems() {
    const fromRows = this.uniqueItems(this.state.allRows, (r) => r.ccId, (r) => {
      const name = String(r.ccNome || "").toUpperCase();
      return r.ccId ? r.ccId + " - " + name : name;
    });
    if (fromRows.length) return fromRows;
    const list = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    return list.map((c) => {
      const id = String(c.id || c.code || "");
      const name = String(c.name || c.nome || "").toUpperCase();
      return { id, name, label: id ? id + " - " + name : name };
    }).filter((x) => x.id).sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR"));
  },

  statusItems() {
    return [
      { id: "aberto", label: "Retidos" },
      { id: "liberado", label: "Liberados" },
      { id: "pago", label: "Pagos" }
    ];
  },

  rowStatus(r) {
    if (r && r.pago) return "pago";
    if (r && this.isLiberated(r)) return "liberado";
    return "aberto";
  },

  applyFilters() {
    const emp = new Set((this.state.companyIds || []).map(String));
    const cred = new Set((this.state.creditorIds || []).map(String));
    const cc = new Set((this.state.ccIds || []).map(String));
    const statuses = new Set((this.state.statusIds || []).map(String));
    const statusAll = !statuses.size || statuses.size >= this.statusItems().length;
    const qTitulo = this.fold(this.state.qTitulo).replace(/\s+/g, "");
    const qCredor = this.fold(this.state.qCredor);
    const start = this.state.startDate || "";
    const end = this.state.endDate || "";
    this.state.shown = (this.state.allRows || []).filter((r) => {
      if (emp.size && !emp.has(String(r.companyId))) return false;
      if (cc.size && !cc.has(String(r.ccId))) return false;
      if (cred.size && !cred.has(this.fold(r.credor))) return false;
      if (start && r.vencimento && r.vencimento < start) return false;
      if (end && r.vencimento && r.vencimento > end) return false;
      if (!statusAll && !statuses.has(this.rowStatus(r))) return false;
      if (qTitulo) {
        const blob = this.fold([r.titulo, r.documento, r.parcela].join("")).replace(/\s+/g, "");
        if (blob.indexOf(qTitulo) < 0) return false;
      }
      if (qCredor && this.fold(r.credor).indexOf(qCredor) < 0) return false;
      return true;
    }).sort((a, b) =>
      String(a.credor || "").localeCompare(String(b.credor || ""), "pt-BR")
      || String(a.vencimento).localeCompare(String(b.vencimento))
      || String(a.titulo).localeCompare(String(b.titulo))
    );
  },

  selectedRows() {
    return (this.state.shown || []).filter((r) => this.state.selected[this.rowKey(r)]);
  },

  selectableRows() {
    return (this.state.shown || []).filter((r) => !r.pago);
  },

  toggleRow(key, on, ev) {
    if (ev) ev.stopPropagation();
    const k = String(key || "");
    if (!k) return;
    if (on) this.state.selected[k] = true;
    else delete this.state.selected[k];
    this.paintSelectionBar();
    this.syncHeaderCheck();
  },

  toggleAll(on) {
    if (on) {
      this.selectableRows().forEach((r) => { this.state.selected[this.rowKey(r)] = true; });
    } else {
      (this.state.shown || []).forEach((r) => { delete this.state.selected[this.rowKey(r)]; });
    }
    this.renderList();
  },

  selectedCount() {
    return this.selectedRows().length;
  },

  kpis() {
    const rows = this.state.shown || [];
    let total = 0;
    let aberto = 0;
    let liberado = 0;
    let pago = 0;
    rows.forEach((r) => {
      const v = Number(r.valorAjustado) || 0;
      total += v;
      if (r.pago) pago += v;
      else if (this.isLiberated(r)) liberado += v;
      else aberto += v;
    });
    return { qtd: rows.length, total, aberto, liberado, pago };
  },

  bindFilters() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    const bind = (id, key, openKey, qKey, itemsFn, nouns) => {
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          const was = !!self.state[openKey];
          self.state.openEmp = false;
          self.state.openCred = false;
          self.state.openCc = false;
          self.state.openSit = false;
          self.state[openKey] = !was;
          self.paintFilters();
        },
        setQuery(q) {
          self.state[qKey] = q || "";
          const box = document.getElementById(id + "-list");
          if (box) {
            box.innerHTML = MlEmpresaFilter.listHtml({
              id,
              items: itemsFn(),
              selectedIds: self.state[key],
              query: self.state[qKey],
              nouns
            });
          }
        },
        toggleId(itemId, checked) {
          const sid = String(itemId);
          const cur = self.state[key].slice();
          self.state[key] = checked ? (cur.includes(sid) ? cur : cur.concat(sid)) : cur.filter((x) => x !== sid);
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        },
        selectAll() {
          self.state[key] = itemsFn().map((x) => String(x.id));
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        },
        selectNone() {
          self.state[key] = [];
          self.state[openKey] = true;
          self.applyFilters();
          self.renderList();
          self.paintFilters();
        }
      });
    };
    bind("ecau-filter-emp", "companyIds", "openEmp", "qEmp", () => this.empItems(), { singular: "empresa", plural: "empresas" });
    bind("ecau-filter-cc", "ccIds", "openCc", "qCc", () => this.ccItems(), { singular: "empreendimento", plural: "empreendimentos" });
    bind("ecau-filter-cred", "creditorIds", "openCred", "qCred", () => this.credItems(), { singular: "credor", plural: "credores" });
    bind("ecau-filter-sit", "statusIds", "openSit", "qSit", () => this.statusItems(), { singular: "situação", plural: "situações" });
  },

  paintFilters() {
    if (!window.MlEmpresaFilter) return;
    this.bindFilters();
    const set = (slotId, html) => {
      const el = document.getElementById(slotId);
      if (el) el.innerHTML = html;
    };
    set("ecau-emp-slot", MlEmpresaFilter.html({
      id: "ecau-filter-emp",
      label: "Empresas",
      items: this.empItems(),
      selectedIds: this.state.companyIds,
      open: !!this.state.openEmp,
      query: this.state.qEmp,
      emptyMeansAll: true,
      nouns: { singular: "empresa", plural: "empresas" }
    }));
    set("ecau-cc-slot", MlEmpresaFilter.html({
      id: "ecau-filter-cc",
      label: "Empreendimento",
      items: this.ccItems(),
      selectedIds: this.state.ccIds,
      open: !!this.state.openCc,
      query: this.state.qCc,
      emptyMeansAll: true,
      nouns: { singular: "empreendimento", plural: "empreendimentos" }
    }));
    set("ecau-cred-slot", MlEmpresaFilter.html({
      id: "ecau-filter-cred",
      label: "Credor",
      items: this.credItems(),
      selectedIds: this.state.creditorIds,
      open: !!this.state.openCred,
      query: this.state.qCred,
      emptyMeansAll: true,
      nouns: { singular: "credor", plural: "credores" }
    }));
    set("ecau-sit-slot", MlEmpresaFilter.html({
      id: "ecau-filter-sit",
      label: "Situação",
      items: this.statusItems(),
      selectedIds: this.state.statusIds,
      open: !!this.state.openSit,
      query: this.state.qSit,
      emptyMeansAll: true,
      nouns: { singular: "situação", plural: "situações" }
    }));
    if (window.lucide) lucide.createIcons();
  },

  async loadCompanies() {
    if (!window.SiengeApiService || typeof SiengeApiService.getCompanies !== "function") return;
    try {
      const list = await SiengeApiService.getCompanies(false);
      this.state.companies = Array.isArray(list) ? list : ((list && list.results) || []);
    } catch (e) {
      this.state.companies = [];
    }
  },

  async consultar() {
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
    this.state.selected = {};
    this.renderPage();
    try {
      let endpoint = "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
        + "&endDate=" + encodeURIComponent(end)
        + "&selectionType=D&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
      if ((this.state.companyIds || []).length === 1) {
        endpoint += "&companyId=" + encodeURIComponent(this.state.companyIds[0]);
      }
      if (typeof window.siengeFetchWithRetry !== "function") {
        throw new Error("API Sienge indisponível.");
      }
      const payload = await window.siengeFetchWithRetry(endpoint, 2);
      this.indexBills(payload);
      this.state.allRows = this.transform(payload);
      this.state.updatedAt = new Date().toISOString();
      this.applyFilters();
    } catch (e) {
      this.state.error = (e && e.message) ? e.message : "Falha ao buscar cauções no Sienge.";
      this.state.allRows = [];
      this.state.shown = [];
      this.state.billsByTitulo = {};
    }
    this.state.loading = false;
    this.renderPage();
  },

  limpar() {
    const range = this.defaultRange();
    this.state.startDate = range.startDate;
    this.state.endDate = range.endDate;
    this.state.companyIds = [];
    this.state.creditorIds = [];
    this.state.ccIds = [];
    this.state.statusIds = ["aberto"];
    this.state.qTitulo = "";
    this.state.qCredor = "";
    this.state.qCc = "";
    this.state.qSit = "";
    this.state.shown = [];
    this.state.allRows = [];
    this.state.billsByTitulo = {};
    this.state.selected = {};
    this.state.consulted = false;
    this.state.error = "";
    this.state.modal = "";
    this.renderPage();
  },

  onField(field, val) {
    this.state[field] = val;
    if (field === "qTitulo" || field === "qCredor" || field === "startDate" || field === "endDate") {
      this.applyFilters();
      this.renderList();
    }
  },

  credorHeaderHtml(credor, totals) {
    const count = totals.count || 0;
    const countLabel = count === 1 ? "1 título" : count + " títulos";
    const valueLabel = (Number(totals.value) || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const cell = "background:#f1f5f9;color:#475569;font-weight:700;font-size:0.75rem;letter-spacing:0.04em;text-transform:uppercase;padding:8px 12px;border:none;";
    return `<tr class="fila-group-header cprev-group-header is-neutral">
      <td colspan="6" style="${cell}">
        <div class="cprev-group-label">
          <span>${this.esc(credor || "Sem credor")}</span>
          <span class="cprev-group-chip">${this.esc(countLabel)}</span>
        </div>
      </td>
      <td colspan="4" style="${cell}"></td>
      <td style="${cell}text-align:right;white-space:nowrap;letter-spacing:0;text-transform:none;">
        <span class="cprev-group-chip">R$ ${this.esc(valueLabel)}</span>
      </td>
    </tr>`;
  },

  statusTag(r) {
    if (r.pago) return `<span class="cprev-tag cprev-tag-pago">Pago</span>`;
    if (this.isLiberated(r)) return `<span class="cprev-tag cprev-tag-liberado">Liberado</span>`;
    return `<span class="cprev-tag cprev-tag-aberto">Retido</span>`;
  },

  renderList() {
    const box = document.getElementById("ecau-results");
    const kpi = document.getElementById("ecau-kpis");
    if (!box) return;
    if (this.state.loading) {
      box.innerHTML = `<div class="tvig-empty">Buscando cauções no Sienge…</div>`;
      if (kpi) kpi.innerHTML = "";
      this.paintSelectionBar();
      return;
    }
    if (this.state.error) {
      box.innerHTML = `<div class="tvig-empty">${this.esc(this.state.error)}</div>`;
      if (kpi) kpi.innerHTML = "";
      this.paintSelectionBar();
      return;
    }
    if (!this.state.consulted) {
      box.innerHTML = `<div class="tvig-empty">Use <strong>Consultar</strong> para carregar as cauções (documento CAU).</div>`;
      if (kpi) kpi.innerHTML = "";
      this.paintSelectionBar();
      return;
    }
    const rows = this.state.shown || [];
    const k = this.kpis();
    if (kpi) {
      kpi.innerHTML = `
        <div class="ccom-kpi"><span>Títulos</span><strong>${k.qtd}</strong></div>
        <div class="ccom-kpi"><span>Total</span><strong>${this.esc(this.money(k.total))}</strong></div>
        <div class="ccom-kpi"><span>Retidos</span><strong>${this.esc(this.money(k.aberto))}</strong></div>
        <div class="ccom-kpi"><span>Liberados</span><strong>${this.esc(this.money(k.liberado))}</strong></div>
        <div class="ccom-kpi"><span>Pagos</span><strong>${this.esc(this.money(k.pago))}</strong></div>`;
    }
    if (!rows.length) {
      box.innerHTML = `<div class="tvig-empty">Nenhuma caução CAU neste filtro.</div>`;
      this.paintSelectionBar();
      return;
    }
    const totals = {};
    rows.forEach((r) => {
      const g = r.credor || "Sem credor";
      if (!totals[g]) totals[g] = { count: 0, value: 0 };
      totals[g].count += 1;
      totals[g].value += Number(r.valorAjustado) || 0;
    });
    const selectable = this.selectableRows();
    const allOn = selectable.length > 0 && selectable.every((r) => this.state.selected[this.rowKey(r)]);
    let lastCredor = null;
    const body = rows.map((r, idx) => {
      let header = "";
      const credor = r.credor || "Sem credor";
      if (credor !== lastCredor) {
        lastCredor = credor;
        header = this.credorHeaderHtml(credor, totals[credor] || { count: 0, value: 0 });
      }
      const key = this.rowKey(r);
      const checked = !!this.state.selected[key];
      const late = !r.pago && r.vencimento && r.vencimento < this.isoToday();
      const ccLabel = (r.ccId ? r.ccId + " - " : "") + (r.ccNome || "—");
      return header + `<tr class="cprev-row${late ? " cprev-late" : ""}" data-key="${this.esc(key)}" data-idx="${idx}">
        <td class="ecau-col-chk" onclick="event.stopPropagation()">
          <input type="checkbox" ${r.pago ? "disabled" : ""} ${checked ? "checked" : ""}
            onchange="EngenhariaCaucaoApp.toggleRow('${this.esc(key)}', this.checked, event)">
        </td>
        <td class="cprev-col-id" title="${this.esc(r.companyId)}">${this.esc(r.companyId)}</td>
        <td class="cprev-col-cc" title="${this.esc(ccLabel)}">${this.esc(ccLabel)}</td>
        <td class="cprev-col-cred" title="${this.esc(r.credor || "—")}">${this.esc(r.credor || "—")}</td>
        <td class="cprev-col-tit" title="${this.esc(r.titulo)}">${this.esc(r.titulo)}</td>
        <td class="cprev-col-parc" title="${this.esc(r.parcela || "—")}">${this.esc(r.parcela || "—")}</td>
        <td class="cprev-col-doc" title="CAU">CAU</td>
        <td class="cprev-col-ndoc" title="${this.esc(r.documento || "—")}">${this.esc(r.documento || "—")}</td>
        <td class="cprev-col-venc" title="${this.esc(this.fmtDate(r.vencimento))}">${this.esc(this.fmtDate(r.vencimento))}</td>
        <td class="cprev-col-val" title="${this.esc(this.money(r.valorAjustado))}">${this.esc(this.money(r.valorAjustado))}</td>
        <td class="ecau-col-sit">${this.statusTag(r)}</td>
      </tr>`;
    }).join("");
    box.innerHTML = `
      <div class="table-container cprev-table-wrap">
        <table class="custom-table cprev-table ecau-table" id="ecau-table">
          <colgroup>
            <col class="ecau-col-chk">
            <col class="cprev-col-id">
            <col class="cprev-col-cc">
            <col class="cprev-col-cred">
            <col class="cprev-col-tit">
            <col class="cprev-col-parc">
            <col class="cprev-col-doc">
            <col class="cprev-col-ndoc">
            <col class="cprev-col-venc">
            <col class="cprev-col-val">
            <col class="ecau-col-sit">
          </colgroup>
          <thead>
            <tr>
              <th class="ecau-col-chk">
                <input type="checkbox" id="ecau-check-all" ${allOn ? "checked" : ""}
                  onchange="EngenhariaCaucaoApp.toggleAll(this.checked)" title="Marcar todos visíveis">
              </th>
              <th class="cprev-col-id" title="Id Empresa">Emp.</th>
              <th class="cprev-col-cc">Centro de custo</th>
              <th class="cprev-col-cred">Credor</th>
              <th class="cprev-col-tit">Título</th>
              <th class="cprev-col-parc">Parc.</th>
              <th class="cprev-col-doc">Doc.</th>
              <th class="cprev-col-ndoc">Nº doc.</th>
              <th class="cprev-col-venc">Vencimento</th>
              <th class="cprev-col-val">Valor</th>
              <th class="ecau-col-sit">Situação</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    this.paintSelectionBar();
    if (window.lucide) lucide.createIcons();
  },

  syncHeaderCheck() {
    const el = document.getElementById("ecau-check-all");
    if (!el) return;
    const selectable = this.selectableRows();
    el.checked = selectable.length > 0 && selectable.every((r) => this.state.selected[this.rowKey(r)]);
  },

  paintSelectionBar() {
    const bar = document.getElementById("ecau-selection-bar");
    if (!bar) return;
    const n = this.selectedCount();
    const busy = this.state.busy;
    bar.innerHTML = n
      ? `<strong>${n} selecionada${n === 1 ? "" : "s"}</strong>
         <button type="button" class="btn btn-primary btn-sm ecau-bar-btn" ${busy ? "disabled" : ""} onclick="EngenhariaCaucaoApp.openDueModal()">
           <i data-lucide="calendar-clock"></i> Ajustar vencimento
         </button>
         <button type="button" class="btn btn-secondary btn-sm ecau-bar-btn" ${busy ? "disabled" : ""} onclick="EngenhariaCaucaoApp.liberarSelecionadas()">
           <i data-lucide="unlock"></i> Liberar para pagamento
         </button>`
      : `<span>Selecione uma ou várias cauções para ajustar o vencimento ou liberar para pagamento.</span>`;
    if (window.lucide) lucide.createIcons();
  },

  openDueModal() {
    const rows = this.selectedRows().filter((r) => !r.pago);
    if (!rows.length) {
      alert("Selecione ao menos uma caução em aberto.");
      return;
    }
    this.state.modal = "due";
    this.paintModal();
  },

  closeModal() {
    this.state.modal = "";
    const host = document.getElementById("ecau-modal");
    if (host) host.innerHTML = "";
  },

  paintModal() {
    const host = document.getElementById("ecau-modal");
    if (!host) return;
    if (this.state.modal !== "due") {
      host.innerHTML = "";
      return;
    }
    const n = this.selectedRows().filter((r) => !r.pago).length;
    host.innerHTML = `
      <div class="cprev-modal-overlay" onclick="if(event.target===this) EngenhariaCaucaoApp.closeModal()">
        <div class="cprev-modal" role="dialog" aria-modal="true" style="max-width:460px;">
          <div class="cprev-modal-head">
            <div>
              <h3>Ajustar vencimento</h3>
              <p>${n} caução(ões) selecionada(s). A data será gravada no Sienge.</p>
            </div>
            <button type="button" class="btn btn-cancel" onclick="EngenhariaCaucaoApp.closeModal()">Cancelar</button>
          </div>
          <div class="cprev-modal-body" style="padding:18px;">
            <label for="ecau-new-due" style="display:block;font-size:0.75rem;font-weight:700;color:#64748b;margin-bottom:6px;">Novo vencimento</label>
            <input type="date" id="ecau-new-due" class="form-control" value="${this.esc(this.isoToday())}">
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
              <button type="button" class="btn btn-cancel" onclick="EngenhariaCaucaoApp.closeModal()">Cancelar</button>
              <button type="button" class="btn btn-primary" onclick="EngenhariaCaucaoApp.applyDueDate()">Aplicar no Sienge</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  installmentPayload(r, dueDate) {
    return {
      dueDate,
      interestAmount: 0,
      fineAmount: 0,
      monetaryCorrectionAmount: 0,
      amount: Number(r.valor) || 0,
      discountAmount: 0,
      installmentId: Number(r.installmentId != null ? r.installmentId : r.parcela) || 1
    };
  },

  async patchBillInstallments(billId, items) {
    if (typeof window.siengePatch !== "function") {
      throw new Error("API Sienge indisponível para gravação.");
    }
    const path = "/bills/" + encodeURIComponent(billId) + "/installments";
    try {
      return await window.siengePatch(path, items);
    } catch (e) {
      if (items.length === 1) throw e;
      const out = [];
      for (const item of items) {
        out.push(await window.siengePatch(path, item));
      }
      return out;
    }
  },

  async applyDueDate() {
    const input = document.getElementById("ecau-new-due");
    const due = this.isoDate(input && input.value);
    if (!due) {
      alert("Informe a nova data de vencimento.");
      return;
    }
    const rows = this.selectedRows().filter((r) => !r.pago);
    if (!rows.length) {
      alert("Selecione ao menos uma caução em aberto.");
      return;
    }
    this.state.busy = true;
    this.paintSelectionBar();
    const byBill = new Map();
    rows.forEach((r) => {
      const id = String(r.titulo);
      if (!byBill.has(id)) byBill.set(id, []);
      byBill.get(id).push(r);
    });
    let ok = 0;
    const errors = [];
    for (const [billId, list] of byBill.entries()) {
      try {
        await this.patchBillInstallments(billId, list.map((r) => this.installmentPayload(r, due)));
        list.forEach((r) => { r.vencimento = due; ok += 1; });
      } catch (e) {
        errors.push("Título " + billId + ": " + (e && e.message ? e.message : e));
      }
    }
    this.state.busy = false;
    this.closeModal();
    this.applyFilters();
    this.renderList();
    if (errors.length) {
      alert(ok + " parcela(s) atualizada(s).\n\nFalhas:\n" + errors.slice(0, 6).join("\n"));
    } else {
      alert(ok + " parcela(s) com vencimento ajustado no Sienge.");
    }
  },

  async liberarSelecionadas() {
    const rows = this.selectedRows().filter((r) => !r.pago);
    if (!rows.length) {
      alert("Selecione ao menos uma caução em aberto.");
      return;
    }
    if (!confirm("Liberar " + rows.length + " caução(ões) para pagamento?\nO financeiro passa a ver esses títulos como liberados pela engenharia.")) {
      return;
    }
    const now = new Date().toISOString();
    const user = this.operatorName();
    rows.forEach((r) => {
      this.state.liberated[this.rowKey(r)] = {
        at: now,
        user,
        titulo: r.titulo,
        parcela: r.parcela,
        credor: r.credor,
        valor: r.valorAjustado
      };
    });
    this.persistLiberated();
    this.applyFilters();
    this.renderList();
    alert(rows.length + " caução(ões) liberada(s) para pagamento.");
  },

  exportExcel() {
    if (typeof XLSX === "undefined") {
      alert("Biblioteca de Excel indisponível.");
      return;
    }
    const rows = this.state.shown || [];
    if (!rows.length) {
      alert("Não há cauções para exportar neste filtro.");
      return;
    }
    const grouped = new Map();
    rows.forEach((r) => {
      const g = r.credor || "Sem credor";
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g).push(r);
    });
    const aoa = [[
      "Credor", "Id Empresa", "Centro de custo", "Título", "Parcela",
      "Documento", "Nº documento", "Vencimento", "Valor (R$)", "Situação"
    ]];
    const headerRows = new Set([0]);
    const groupRows = new Set();
    [...grouped.keys()].sort((a, b) => a.localeCompare(b, "pt-BR")).forEach((credor) => {
      const list = grouped.get(credor);
      const total = list.reduce((s, r) => s + (Number(r.valorAjustado) || 0), 0);
      groupRows.add(aoa.length);
      aoa.push([
        credor.toUpperCase(),
        "",
        list.length + (list.length === 1 ? " título" : " títulos"),
        "", "", "", "", "",
        total,
        ""
      ]);
      list.forEach((r) => {
        aoa.push([
          r.credor || "",
          r.companyId,
          (r.ccId ? r.ccId + " - " : "") + (r.ccNome || ""),
          r.titulo,
          r.parcela || "",
          "CAU",
          r.documento || "",
          this.fmtDate(r.vencimento),
          Number(r.valorAjustado) || 0,
          r.pago ? "Pago" : (this.isLiberated(r) ? "Liberado" : "Retido")
        ]);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const range = XLSX.utils.decode_range(ws["!ref"]);
    ws["!cols"] = [
      { wch: 40 }, { wch: 12 }, { wch: 36 }, { wch: 12 }, { wch: 10 },
      { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }
    ];
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = ws[addr];
        if (!cell) { cell = { t: "s", v: "" }; ws[addr] = cell; }
        cell.s = {
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
          },
          alignment: { vertical: "center", wrapText: true },
          font: { name: "Calibri", sz: 11 }
        };
        if (headerRows.has(R)) {
          cell.s.fill = { fgColor: { rgb: "E2E8F0" } };
          cell.s.font.bold = true;
          cell.s.alignment.horizontal = "center";
        }
        if (groupRows.has(R)) {
          cell.s.fill = { fgColor: { rgb: "D1FAE5" } };
          cell.s.font.bold = true;
        }
        if (R > 0 && C === 8 && cell.t === "n") cell.z = "#,##0.00";
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Caução por credor");
    XLSX.writeFile(wb, "gestao-caucao-" + this.isoToday() + ".xlsx");
  },

  renderPage() {
    const root = document.getElementById("engenharia-caucao-root");
    if (!root) return;
    const s = this.state;
    const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleString("pt-BR") : "—";
    root.innerHTML = `
      <div class="cprev-page ecau-page">
        <div class="search-filter-panel cprev-toolbar ecau-toolbar">
          <div class="ecau-toolbar-meta">
            <span class="cprev-updated">Atualização: ${this.esc(updated)}</span>
          </div>
          <div class="ecau-grid">
            <div id="ecau-emp-slot" class="ecau-slot ecau-cell-emp"></div>
            <div id="ecau-cc-slot" class="ecau-slot ecau-cell-obra"></div>
            <div id="ecau-cred-slot" class="ecau-slot ecau-cell-cred"></div>
            <div class="form-group ecau-search ecau-cell-titulo">
              <label>Título</label>
              <input type="search" class="form-control" placeholder="Título ou nº do documento"
                value="${this.esc(s.qTitulo)}" oninput="EngenhariaCaucaoApp.onField('qTitulo', this.value)" autocomplete="off">
            </div>
            <div id="ecau-sit-slot" class="ecau-slot ecau-cell-sit"></div>
            <div class="ecau-cell-dates">
              <div class="form-group ecau-date">
                <label>Vencimento de</label>
                <input type="date" class="form-control" value="${this.esc(s.startDate)}"
                  onchange="EngenhariaCaucaoApp.onField('startDate', this.value)">
              </div>
              <div class="form-group ecau-date">
                <label>Vencimento até</label>
                <input type="date" class="form-control" value="${this.esc(s.endDate)}"
                  onchange="EngenhariaCaucaoApp.onField('endDate', this.value)">
              </div>
              <div class="ecau-actions">
                <button type="button" class="btn btn-primary btn-sm" ${s.loading ? "disabled" : ""} onclick="EngenhariaCaucaoApp.consultar()">
                  <i data-lucide="search" style="width:14px;height:14px;"></i> ${s.loading ? "Consultando…" : "Consultar"}
                </button>
                <button type="button" class="btn btn-cancel btn-sm" onclick="EngenhariaCaucaoApp.limpar()">Limpar</button>
                <button type="button" class="btn btn-sm cprev-excel-btn" onclick="EngenhariaCaucaoApp.exportExcel()" title="Exportar agrupado por credor">
                  <i data-lucide="download" style="width:14px;height:14px;"></i> Excel
                </button>
              </div>
            </div>
          </div>
        </div>
        <div id="ecau-selection-bar" class="ecau-selection-bar"></div>
        <div class="ccom-kpis cprev-kpis" id="ecau-kpis"></div>
        <div id="ecau-results" class="cprev-results"></div>
        <div id="ecau-modal"></div>
      </div>`;
    this.paintFilters();
    this.renderList();
    if (s.modal === "due") this.paintModal();
    if (window.lucide) lucide.createIcons();
  },

  async init() {
    let root = document.getElementById("engenharia-caucao-root");
    if (!root) {
      let pane = document.getElementById("tab-engenharia-caucao");
      if (!pane) {
        pane = document.createElement("section");
        pane.id = "tab-engenharia-caucao";
        pane.className = "tab-pane";
        pane.style.display = "block";
        const main = document.querySelector(".main-content");
        if (main) main.appendChild(pane);
      }
      root = document.createElement("div");
      root.id = "engenharia-caucao-root";
      pane.appendChild(root);
    }
    this.loadLiberated();
    if (!this.state.inited) {
      try {
        const range = this.defaultRange();
        this.state.startDate = range.startDate;
        this.state.endDate = range.endDate;
      } catch (e) {
        const t = this.isoToday();
        this.state.startDate = t.slice(0, 8) + "01";
        this.state.endDate = t;
      }
      this.state.inited = true;
      this.renderPage();
      await this.loadCompanies();
    }
    if (this.state.consulted) this.applyFilters();
    this.renderPage();
  }
};

window.mergeEngenhariaCaucaoLiberados = function (localStr, cloudStr) {
  const parse = (raw) => {
    try { return JSON.parse(raw || "{}") || {}; } catch (e) { return {}; }
  };
  const local = parse(localStr);
  const cloud = parse(cloudStr);
  const out = Object.assign({}, cloud, local);
  Object.keys(cloud).forEach((k) => {
    const a = local[k];
    const b = cloud[k];
    if (!a) out[k] = b;
    else if (!b) out[k] = a;
    else out[k] = String(a.at || "") >= String(b.at || "") ? a : b;
  });
  return JSON.stringify(out);
};

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "engenharia-caucao" || e.detail === "construcao-engenharia") {
    EngenhariaCaucaoApp.init();
  }
});
