/**
 * Configurações · Apoio · Departamentos
 * GET /public/api/v1/departments
 */
const DepartamentosApp = {
  state: {
    inited: false,
    loading: false,
    error: "",
    all: [],
    shown: [],
    q: ""
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  },

  async init() {
    const root = document.getElementById("departamentos-root");
    if (!root) return;
    this.state.inited = true;
    this.renderPage();
    if (!this.state.all.length) this.consultar(false);
  },

  renderPage() {
    const root = document.getElementById("departamentos-root");
    if (!root) return;
    root.innerHTML = `
      <div class="tvig-page">
        <div class="search-filter-panel tvig-params">
          <h2 class="tvig-page-title">
            <i data-lucide="building-2" style="width:22px;height:22px;color:var(--color-primary);"></i>
            Departamentos
          </h2>
          <h3 class="tvig-section-title">Cadastro Sienge</h3>
          <div class="tvig-filters" style="grid-template-columns: minmax(240px, 1fr) auto;">
            <div class="form-group" style="margin:0;">
              <label class="ml-emp-filter-label">Buscar</label>
              <input type="text" id="depto-q" class="form-control tvig-comp-input" placeholder="ID ou nome do departamento"
                value="${this.esc(this.state.q)}"
                oninput="DepartamentosApp.onQuery(this.value)">
            </div>
            <div class="tvig-filter-actions">
              <button type="button" class="btn btn-primary" ${this.state.loading ? "disabled" : ""} onclick="DepartamentosApp.consultar(true)">
                <i data-lucide="refresh-cw" style="width:16px;"></i> ${this.state.loading ? "Buscando…" : "Atualizar do Sienge"}
              </button>
            </div>
          </div>
        </div>
        <h3 class="tvig-section-title">Resultados</h3>
        <div id="depto-results"></div>
      </div>`;
    this.renderList();
    if (window.lucide) lucide.createIcons();
  },

  onQuery(q) {
    this.state.q = q || "";
    this.applyFilter();
    this.renderList();
  },

  applyFilter() {
    const needle = this.fold(this.state.q);
    this.state.shown = (this.state.all || []).filter((d) => {
      if (!needle) return true;
      return this.fold(d.id).indexOf(needle) >= 0
        || this.fold(d.name).indexOf(needle) >= 0
        || this.fold(d.companyName).indexOf(needle) >= 0;
    });
  },

  async consultar(forceRefresh) {
    if (this.state.loading) return;
    this.state.loading = true;
    this.state.error = "";
    this.renderPage();
    try {
      const fetchFn = window.SiengeApiService && SiengeApiService.getDepartments;
      if (typeof fetchFn !== "function") throw new Error("API Sienge indisponível.");
      this.state.all = await fetchFn.call(SiengeApiService, !!forceRefresh);
      this.applyFilter();
    } catch (e) {
      console.error("[Departamentos]", e);
      this.state.error = (e && e.message) ? e.message : String(e);
      this.state.all = [];
      this.state.shown = [];
    } finally {
      this.state.loading = false;
      this.renderPage();
    }
  },

  renderList() {
    const box = document.getElementById("depto-results");
    if (!box) return;
    if (this.state.loading) {
      box.innerHTML = `<div class="tvig-empty">Buscando departamentos no Sienge…</div>`;
      return;
    }
    if (this.state.error) {
      box.innerHTML = `<div class="tvig-empty">${this.esc(this.state.error)}</div>`;
      return;
    }
    const rows = this.state.shown || [];
    if (!rows.length) {
      box.innerHTML = `<div class="tvig-empty">${this.state.all.length ? "Nenhum departamento com esse filtro." : "Nenhum departamento retornado pela API."}</div>`;
      return;
    }
    const hasCompany = rows.some((d) => d.companyId || d.companyName);
    box.innerHTML = `
      <div class="crm-card" style="padding:0;overflow:hidden;">
        <table class="custom-table tvig-list-table">
          <thead>
            <tr>
              <th style="width:90px;">ID</th>
              <th>Departamento</th>
              ${hasCompany ? "<th>Empresa</th>" : ""}
              <th style="width:120px;">Situação</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((d) => `
              <tr>
                <td>${this.esc(d.id)}</td>
                <td>${this.esc(d.name || "—")}</td>
                ${hasCompany ? `<td>${this.esc(d.companyName || (d.companyId != null ? ("#" + d.companyId) : "—"))}</td>` : ""}
                <td>${d.active === false ? "Inativo" : "Ativo"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p style="margin:10px 0 0;font-size:0.78rem;color:#64748b;">${rows.length} de ${this.state.all.length} departamento(s) · GET /departments</p>`;
  }
};

window.DepartamentosApp = DepartamentosApp;

document.addEventListener("tabChanged", (e) => {
  if (e.detail === "departamentos") DepartamentosApp.init();
});
