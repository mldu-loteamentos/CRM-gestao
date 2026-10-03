/**
 * Compras · Follow-up de previsões
 * Mesma base do Power BI Controle de Previsões (Sienge bulk-data/v1/outcome).
 */
const ComprasPrevisoesApp = {
  SKIP_OPS: {
    "Reaprop. Abatimento Adiantamento - entrada": 1,
    Recebimento: 1
  },
  SKIP_ACCOUNTS: { PAR: 1, "PAR-3": 1 },
  SKIP_TITULO_PARCELA: {
    "76367-3": 1, "76367-4": 1, "76367-5": 1, "76367-6": 1,
    "76366-3": 1, "76366-4": 1, "76366-5": 1, "76366-6": 1,
    "76364-3": 1, "76364-4": 1, "76364-5": 1, "76364-6": 1,
    "76363-3": 1, "76363-4": 1, "76363-5": 1, "76363-6": 1,
    "76074-3": 1, "76074-4": 1, "76074-5": 1, "76074-6": 1
  },

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
    deptIds: [],
    openEmp: false,
    openCred: false,
    openDept: false,
    qEmp: "",
    qCred: "",
    qDept: "",
    q: "",
    status: "aberto",
    page: 1,
    pageSize: 80,
    allRows: [],
    shown: []
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

  defaultRange() {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 2, 0);
    const iso = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
    return { startDate: iso(start), endDate: iso(end) };
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
    return String(s == null ? "" : s).trim();
  },

  transform(payload) {
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
                if (docId === "DEV") return;
                const titulo = String(bill.billId);
                const parcela = bill.installmentId != null ? String(bill.installmentId) : "";
                if (this.SKIP_TITULO_PARCELA[titulo + "-" + parcela]) return;
                const rateio = cat && cat.financialCategoryRate != null ? Number(cat.financialCategoryRate) : 100;
                const valor = Number(bill.originalAmount) || 0;
                rows.push({
                  companyId: String(bill.companyId || ""),
                  credor: String(bill.creditorName || "").trim(),
                  titulo,
                  documento: String(bill.documentNumber || ""),
                  vencimento: String(bill.dueDate || "").slice(0, 10),
                  emissao: String(bill.issueDate || "").slice(0, 10),
                  parcela,
                  docId,
                  docNome: this.firstWord(bill.documentIdentificationName),
                  valor,
                  planoId: cat && cat.financialCategoryId != null ? String(cat.financialCategoryId) : "",
                  plano: (cat && cat.financialCategoryName) || "",
                  ccId: cat && cat.costCenterId != null ? String(cat.costCenterId) : "",
                  ccNome: (cat && cat.costCenterName) || "",
                  rateio,
                  tipoBaixa: (pay && pay.operationTypeName) || "",
                  dataPagamento: bm && bm.bankMovementDate ? String(bm.bankMovementDate).slice(0, 10) : "",
                  operacao,
                  conta,
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
      const k = [r.titulo, r.emissao, r.parcela, r.departamento].join("|");
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

  deptItems() {
    return this.uniqueItems(this.state.allRows, (r) => this.fold(r.departamento), (r) => r.departamento.toUpperCase());
  },

  applyFilters() {
    const emp = new Set((this.state.companyIds || []).map(String));
    const cred = new Set((this.state.creditorIds || []).map(String));
    const dept = new Set((this.state.deptIds || []).map(String));
    const q = this.fold(this.state.q);
    const status = this.state.status;
    this.state.shown = (this.state.allRows || []).filter((r) => {
      if (emp.size && !emp.has(String(r.companyId))) return false;
      if (cred.size && !cred.has(this.fold(r.credor))) return false;
      if (dept.size && !dept.has(this.fold(r.departamento))) return false;
      if (status === "aberto" && r.dataPagamento) return false;
      if (status === "pago" && !r.dataPagamento) return false;
      if (q) {
        const blob = this.fold([r.credor, r.titulo, r.documento, r.docId, r.ccNome, r.plano].join(" "));
        if (blob.indexOf(q) < 0) return false;
      }
      return true;
    }).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))
      || String(a.credor).localeCompare(String(b.credor), "pt-BR"));
    this.state.page = 1;
  },

  kpis() {
    const rows = this.state.shown || [];
    const today = this.isoToday();
    let total = 0;
    let vencido = 0;
    let aVencer = 0;
    rows.forEach((r) => {
      const v = Number(r.valorAjustado) || 0;
      total += v;
      if (!r.dataPagamento && r.vencimento && r.vencimento < today) vencido += v;
      else if (!r.dataPagamento) aVencer += v;
    });
    return { qtd: rows.length, total, vencido, aVencer };
  },

  bindFilters() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    const bind = (id, key, openKey, qKey, itemsFn, nouns) => {
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          self.state[openKey] = !self.state[openKey];
          if (openKey === "openEmp") { self.state.openCred = false; self.state.openDept = false; }
          if (openKey === "openCred") { self.state.openEmp = false; self.state.openDept = false; }
          if (openKey === "openDept") { self.state.openEmp = false; self.state.openCred = false; }
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
        toggleId(itemId, on) {
          const sid = String(itemId);
          const cur = self.state[key].slice();
          self.state[key] = on ? (cur.includes(sid) ? cur : cur.concat(sid)) : cur.filter((x) => x !== sid);
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
    bind("cprev-filter-emp", "companyIds", "openEmp", "qEmp", () => this.empItems(), { singular: "empresa", plural: "empresas" });
    bind("cprev-filter-cred", "creditorIds", "openCred", "qCred", () => this.credItems(), { singular: "credor", plural: "credores" });
    bind("cprev-filter-dept", "deptIds", "openDept", "qDept", () => this.deptItems(), { singular: "departamento", plural: "departamentos" });
  },

  paintFilters() {
    if (!window.MlEmpresaFilter) return;
    this.bindFilters();
    const set = (slotId, html) => {
      const el = document.getElementById(slotId);
      if (el) el.innerHTML = html;
    };
    set("cprev-emp-slot", MlEmpresaFilter.html({
      id: "cprev-filter-emp",
      label: "Empresas",
      items: this.empItems(),
      selectedIds: this.state.companyIds,
      open: !!this.state.openEmp,
      query: this.state.qEmp,
      emptyMeansAll: true,
      nouns: { singular: "empresa", plural: "empresas" }
    }));
    set("cprev-cred-slot", MlEmpresaFilter.html({
      id: "cprev-filter-cred",
      label: "Credor",
      items: this.credItems(),
      selectedIds: this.state.creditorIds,
      open: !!this.state.openCred,
      query: this.state.qCred,
      emptyMeansAll: true,
      nouns: { singular: "credor", plural: "credores" }
    }));
    set("cprev-dept-slot", MlEmpresaFilter.html({
      id: "cprev-filter-dept",
      label: "Departamento",
      items: this.deptItems(),
      selectedIds: this.state.deptIds,
      open: !!this.state.openDept,
      query: this.state.qDept,
      emptyMeansAll: true,
      nouns: { singular: "departamento", plural: "departamentos" }
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
    this.renderPage();
    try {
      let endpoint = "/bulk-data/v1/outcome?startDate=" + encodeURIComponent(start)
        + "&endDate=" + encodeURIComponent(end)
        + "&selectionType=I&correctionIndexerId=0&correctionDate=2023-01-01&withAuthorizations=false";
      if ((this.state.companyIds || []).length === 1) {
        endpoint += "&companyId=" + encodeURIComponent(this.state.companyIds[0]);
      }
      const fn = window.siengeFetchWithRetry || (window.SiengeApiService && SiengeApiService.fetch);
      if (!fn && typeof window.siengeFetchWithRetry !== "function") {
        throw new Error("API Sienge indisponível.");
      }
      const payload = await window.siengeFetchWithRetry(endpoint, 2);
      this.state.allRows = this.transform(payload);
      this.state.updatedAt = new Date().toISOString();
      this.applyFilters();
    } catch (e) {
      this.state.error = (e && e.message) ? e.message : "Falha ao buscar previsões no Sienge.";
      this.state.allRows = [];
      this.state.shown = [];
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
    this.state.deptIds = [];
    this.state.q = "";
    this.state.status = "aberto";
    this.state.page = 1;
    this.state.shown = [];
    this.state.allRows = [];
    this.state.consulted = false;
    this.state.error = "";
    this.renderPage();
  },

  onField(field, val) {
    this.state[field] = val;
    if (field === "q" || field === "status") {
      this.applyFilters();
      this.renderList();
    }
  },

  goPage(p) {
    const max = Math.max(1, Math.ceil((this.state.shown || []).length / this.state.pageSize));
    this.state.page = Math.min(max, Math.max(1, p));
    this.renderList();
  },

  renderList() {
    const box = document.getElementById("cprev-results");
    const kpi = document.getElementById("cprev-kpis");
    if (!box) return;
    if (this.state.loading) {
      box.innerHTML = `<div class="tvig-empty">Buscando títulos no Sienge…</div>`;
      if (kpi) kpi.innerHTML = "";
      return;
    }
    if (this.state.error) {
      box.innerHTML = `<div class="tvig-empty">${this.esc(this.state.error)}</div>`;
      if (kpi) kpi.innerHTML = "";
      return;
    }
    if (!this.state.consulted) {
      box.innerHTML = `<div class="tvig-empty">Use <strong>Consultar</strong> para carregar o follow-up de previsões.</div>`;
      if (kpi) kpi.innerHTML = "";
      return;
    }
    const rows = this.state.shown || [];
    const k = this.kpis();
    if (kpi) {
      kpi.innerHTML = `
        <div class="ccom-kpi"><span>Títulos</span><strong>${k.qtd}</strong></div>
        <div class="ccom-kpi"><span>Total</span><strong>${this.esc(this.money(k.total))}</strong></div>
        <div class="ccom-kpi"><span>Vencido</span><strong>${this.esc(this.money(k.vencido))}</strong></div>
        <div class="ccom-kpi"><span>A vencer</span><strong>${this.esc(this.money(k.aVencer))}</strong></div>`;
    }
    if (!rows.length) {
      box.innerHTML = `<div class="tvig-empty">Nenhum título neste filtro.</div>`;
      return;
    }
    const size = this.state.pageSize;
    const max = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(this.state.page, max);
    this.state.page = page;
    const slice = rows.slice((page - 1) * size, page * size);
    const today = this.isoToday();
    box.innerHTML = `
      <div class="crm-card" style="padding:0;overflow:auto;">
        <table class="custom-table cprev-table">
          <thead>
            <tr>
              <th>Id Empresa</th>
              <th>Centro de custo</th>
              <th>Departamento</th>
              <th>Credor</th>
              <th>Título</th>
              <th>Parcela</th>
              <th>Documento</th>
              <th>Nº documento</th>
              <th>Vencimento</th>
              <th style="text-align:right;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${slice.map((r) => {
              const late = !r.dataPagamento && r.vencimento && r.vencimento < today;
              return `<tr class="${late ? "cprev-late" : ""}">
                <td>${this.esc(r.companyId)}</td>
                <td>${this.esc((r.ccId ? r.ccId + " - " : "") + (r.ccNome || "—"))}</td>
                <td>${this.esc(r.departamento || "—")}</td>
                <td>${this.esc(r.credor || "—")}</td>
                <td>${this.esc(r.titulo)}</td>
                <td>${this.esc(r.parcela || "—")}</td>
                <td>${this.esc(r.docId || "—")}</td>
                <td>${this.esc(r.documento || "—")}</td>
                <td>${this.esc(this.fmtDate(r.vencimento))}</td>
                <td style="text-align:right;white-space:nowrap;">${this.esc(this.money(r.valorAjustado))}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="cprev-pager">
        <button type="button" class="btn btn-outline" ${page <= 1 ? "disabled" : ""} onclick="ComprasPrevisoesApp.goPage(${page - 1})">Anterior</button>
        <span>Página ${page} de ${max}</span>
        <button type="button" class="btn btn-outline" ${page >= max ? "disabled" : ""} onclick="ComprasPrevisoesApp.goPage(${page + 1})">Próxima</button>
      </div>`;
  },

  renderPage() {
    const root = document.getElementById("compras-previsoes-root");
    if (!root) return;
    const s = this.state;
    const updated = s.updatedAt
      ? new Date(s.updatedAt).toLocaleString("pt-BR")
      : "—";
    root.innerHTML = `
      <div class="tvig-page">
        <div class="search-filter-panel tvig-params">
          <h2 class="tvig-page-title">
            <i data-lucide="clipboard-list" style="width:22px;height:22px;color:var(--color-primary);"></i>
            Follow-up de previsões
          </h2>
          <h3 class="tvig-section-title">Parâmetros da consulta</h3>
          <div class="cprev-filters">
            <div id="cprev-emp-slot" class="tvig-filter-slot"></div>
            <div id="cprev-cred-slot" class="tvig-filter-slot"></div>
            <div id="cprev-dept-slot" class="tvig-filter-slot"></div>
            <div class="form-group">
              <label>Início</label>
              <input type="date" class="form-control" value="${this.esc(s.startDate)}"
                onchange="ComprasPrevisoesApp.onField('startDate', this.value)">
            </div>
            <div class="form-group">
              <label>Fim</label>
              <input type="date" class="form-control" value="${this.esc(s.endDate)}"
                onchange="ComprasPrevisoesApp.onField('endDate', this.value)">
            </div>
            <div class="tvig-filter-actions">
              <button type="button" class="btn btn-primary" ${s.loading ? "disabled" : ""} onclick="ComprasPrevisoesApp.consultar()">
                <i data-lucide="search" style="width:16px;"></i> ${s.loading ? "Consultando…" : "Consultar"}
              </button>
              <button type="button" class="btn btn-cancel" onclick="ComprasPrevisoesApp.limpar()">Limpar</button>
            </div>
          </div>
          <div class="cprev-extra">
            <input type="search" class="form-control" placeholder="Buscar credor, título ou documento…"
              value="${this.esc(s.q)}" oninput="ComprasPrevisoesApp.onField('q', this.value)">
            <select class="form-control" onchange="ComprasPrevisoesApp.onField('status', this.value)">
              <option value="aberto" ${s.status === "aberto" ? "selected" : ""}>Em aberto</option>
              <option value="pago" ${s.status === "pago" ? "selected" : ""}>Pagos</option>
              <option value="todos" ${s.status === "todos" ? "selected" : ""}>Todos</option>
            </select>
            <span class="cprev-updated">Atualização: ${this.esc(updated)}</span>
          </div>
        </div>
        <div id="cprev-kpis" class="ccom-kpis cprev-kpis"></div>
        <h3 class="tvig-section-title">Títulos</h3>
        <div id="cprev-results"></div>
      </div>`;
    this.paintFilters();
    this.renderList();
    if (window.lucide) lucide.createIcons();
  },

  async init() {
    const root = document.getElementById("compras-previsoes-root");
    if (!root) return;
    if (!this.state.inited) {
      const range = this.defaultRange();
      this.state.startDate = range.startDate;
      this.state.endDate = range.endDate;
      this.state.inited = true;
      this.renderPage();
      await this.loadCompanies();
    }
    this.renderPage();
  }
};

window.ComprasPrevisoesApp = ComprasPrevisoesApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "compras-previsoes" || e.detail === "construcao-compras") {
    ComprasPrevisoesApp.init();
  }
});
