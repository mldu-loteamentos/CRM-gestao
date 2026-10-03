/**
 * Comercial · Tabelas vigentes
 * Cadastro de tabela de preços/condições por competência, cidade e empreendimento.
 */
const TabelasVigentesApp = {
  FB_COL: "tabelas_vigentes",
  STORAGE_KEY: "crm_moura_tabelas_vigentes",
  DEFAULT_PLANOS: [
    { plano: "Boleto único", entradaMin: "—", parcelamentoEntrada: "—", taxaJuros: "—", reajuste: "—", condicaoEspecial: "Até 15% de desconto" },
    { plano: "12", entradaMin: "10%", parcelamentoEntrada: "3x", taxaJuros: "0", reajuste: "0", condicaoEspecial: "Até 10% de desconto" },
    { plano: "24", entradaMin: "15%", parcelamentoEntrada: "3x", taxaJuros: "0", reajuste: "0", condicaoEspecial: "Até 10% de desconto" },
    { plano: "36", entradaMin: "15%", parcelamentoEntrada: "3x", taxaJuros: "0,4074%", reajuste: "0", condicaoEspecial: "" },
    { plano: "48", entradaMin: "15%", parcelamentoEntrada: "3x", taxaJuros: "0,4074%", reajuste: "IPCA", condicaoEspecial: "" },
    { plano: "60", entradaMin: "25%", parcelamentoEntrada: "3x", taxaJuros: "0,4074%", reajuste: "IPCA", condicaoEspecial: "" },
    { plano: "60", entradaMin: "50%", parcelamentoEntrada: "3x", taxaJuros: "0,0000%", reajuste: "IPCA", condicaoEspecial: "" },
    { plano: "120 c/ intermediárias", entradaMin: "7%", parcelamentoEntrada: "1x", taxaJuros: "0,9489%", reajuste: "IPCA", condicaoEspecial: "" },
    { plano: "168 c/ intermediárias", entradaMin: "7%", parcelamentoEntrada: "1x", taxaJuros: "0,9489%", reajuste: "IPCA", condicaoEspecial: "" },
    { plano: "168", entradaMin: "7%", parcelamentoEntrada: "3x", taxaJuros: "0,9489%", reajuste: "IPCA", condicaoEspecial: "" }
  ],

  state: {
    inited: false,
    loading: false,
    tables: [],
    shown: [],
    consulted: false,
    catalog: [],
    cities: [],
    enterprises: [],
    cityIds: [],
    empIds: [],
    openCity: false,
    openEmp: false,
    qCity: "",
    qEmp: "",
    editor: null
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  uid() {
    return "tv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  },

  fbReady() {
    return !!(window.firebaseDb && window.firebaseCollections && window.firebaseCollections.doc);
  },

  fold(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  },

  cityOfCc(cc) {
    const id = cc && (cc.id || cc.code);
    const name = (cc && cc.name) || "";
    const raw = (cc && (cc.city || cc.cidade))
      || (typeof window.extractCityDisplayName === "function" ? window.extractCityDisplayName(id, name) : "")
      || "";
    return this.fold(raw).replace(/\s*-\s*SP$/, "") || "SEM CIDADE";
  },

  isEmpCc(cc) {
    const id = String((cc && cc.id) || "").trim();
    if (window.EstoqueComercialApp && typeof EstoqueComercialApp.isEmpreendimentoCcId === "function") {
      if (!EstoqueComercialApp.isEmpreendimentoCcId(id)) return false;
      if (typeof EstoqueComercialApp.isDeptOnlyCc === "function" && EstoqueComercialApp.isDeptOnlyCc(cc)) return false;
      return true;
    }
    return id.charAt(0) === "1" || id.charAt(0) === "2";
  },

  async loadCatalog() {
    let list = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    if ((!list || !list.length) && window.SiengeApiService && typeof SiengeApiService.getCostCenters === "function") {
      try { list = await SiengeApiService.getCostCenters(false); } catch (e) { list = []; }
    }
    if (window.EstoqueComercialApp && typeof EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento === "function") {
      try { list = EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento(list || []); } catch (e) {}
    }
    const catalog = (list || []).filter((cc) => this.isEmpCc(cc)).map((cc) => {
      const city = this.cityOfCc(cc);
      return {
        id: String(cc.id),
        name: String(cc.name || "").toUpperCase(),
        city,
        cityId: city
      };
    });
    catalog.sort((a, b) => Number(a.id) - Number(b.id) || a.name.localeCompare(b.name, "pt-BR"));
    this.state.catalog = catalog;
    const citySet = new Map();
    catalog.forEach((e) => {
      if (!citySet.has(e.cityId)) citySet.set(e.cityId, e.city);
    });
    this.state.cities = [...citySet.keys()].sort((a, b) => a.localeCompare(b, "pt-BR")).map((id) => ({ id, name: id, label: id }));
    this.state.enterprises = catalog.map((e) => ({ id: e.id, name: e.name, cityId: e.cityId, label: e.id + " - " + e.name }));
  },

  visibleCities() {
    const empSel = new Set((this.state.empIds || []).map(String));
    if (!empSel.size) return this.state.cities;
    const cities = new Set();
    this.state.catalog.forEach((e) => {
      if (empSel.has(String(e.id))) cities.add(e.cityId);
    });
    return this.state.cities.filter((c) => cities.has(c.id));
  },

  visibleEmps() {
    const citySel = new Set((this.state.cityIds || []).map(String));
    if (!citySel.size) return this.state.enterprises;
    return this.state.enterprises.filter((e) => citySel.has(e.cityId));
  },

  pruneFilters() {
    const cities = new Set(this.visibleCities().map((c) => String(c.id)));
    const emps = new Set(this.visibleEmps().map((e) => String(e.id)));
    this.state.cityIds = (this.state.cityIds || []).filter((id) => cities.has(String(id)));
    this.state.empIds = (this.state.empIds || []).filter((id) => emps.has(String(id)));
  },

  bindFilters() {
    if (!window.MlEmpresaFilter) return;
    const self = this;
    const bind = (id, key, openKey, qKey, itemsFn, nouns) => {
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          self.state[openKey] = !self.state[openKey];
          if (openKey === "openCity") self.state.openEmp = false;
          if (openKey === "openEmp") self.state.openCity = false;
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
          self.pruneFilters();
          self.state[openKey] = true;
          self.paintFilters();
        },
        selectAll() {
          self.state[key] = itemsFn().map((x) => String(x.id));
          self.pruneFilters();
          self.state[openKey] = true;
          self.paintFilters();
        },
        selectNone() {
          self.state[key] = [];
          self.pruneFilters();
          self.state[openKey] = true;
          self.paintFilters();
        }
      });
    };
    bind("tvig-filter-city", "cityIds", "openCity", "qCity", () => this.visibleCities(), { singular: "cidade", plural: "cidades" });
    bind("tvig-filter-emp", "empIds", "openEmp", "qEmp", () => this.visibleEmps(), { singular: "empreendimento", plural: "empreendimentos" });
  },

  paintFilters() {
    const citySlot = document.getElementById("tvig-city-slot");
    const empSlot = document.getElementById("tvig-emp-slot");
    if (!citySlot || !empSlot || !window.MlEmpresaFilter) return;
    this.bindFilters();
    citySlot.innerHTML = MlEmpresaFilter.html({
      id: "tvig-filter-city",
      label: "Cidades",
      items: this.visibleCities(),
      selectedIds: this.state.cityIds,
      open: !!this.state.openCity,
      query: this.state.qCity,
      emptyMeansAll: true,
      nouns: { singular: "cidade", plural: "cidades" }
    });
    empSlot.innerHTML = MlEmpresaFilter.html({
      id: "tvig-filter-emp",
      label: "Empreendimentos",
      items: this.visibleEmps(),
      selectedIds: this.state.empIds,
      open: !!this.state.openEmp,
      query: this.state.qEmp,
      emptyMeansAll: true,
      nouns: { singular: "empreendimento", plural: "empreendimentos" }
    });
    if (window.lucide) lucide.createIcons();
  },

  competenciaLabel(ym) {
    const s = String(ym || "");
    if (/^\d{4}-\d{2}$/.test(s)) return s.slice(5, 7) + "/" + s.slice(0, 4);
    return s || "—";
  },

  defaultRows() {
    return this.DEFAULT_PLANOS.map((r) => Object.assign({ id: this.uid() }, r));
  },

  emptyTable() {
    const ym = new Date().toISOString().slice(0, 7);
    return {
      id: this.uid(),
      competencia: ym,
      cityId: "",
      city: "",
      enterpriseId: "",
      enterpriseName: "",
      rows: this.defaultRows(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },

  loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "[]");
      this.state.tables = Array.isArray(raw) ? raw : [];
    } catch (e) {
      this.state.tables = [];
    }
  },

  saveLocal() {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state.tables)); } catch (e) {}
  },

  async loadCloud() {
    if (!this.fbReady()) return;
    try {
      const { collection, getDocs } = window.firebaseCollections;
      const snap = await getDocs(collection(window.firebaseDb, this.FB_COL));
      const list = [];
      snap.forEach((d) => {
        if (!d.id || d.id.charAt(0) === "_") return;
        list.push(Object.assign({ id: d.id }, d.data() || {}));
      });
      if (list.length) {
        this.state.tables = list;
        this.saveLocal();
      }
    } catch (e) {
      console.warn("[TabelasVigentes] Firebase", e);
    }
  },

  async persistOne(row) {
    this.saveLocal();
    if (!this.fbReady()) return;
    try {
      const { doc, setDoc } = window.firebaseCollections;
      await setDoc(doc(window.firebaseDb, this.FB_COL, String(row.id)), row);
    } catch (e) {
      console.warn("[TabelasVigentes] save", e);
    }
  },

  async deleteOne(id) {
    this.state.tables = this.state.tables.filter((t) => String(t.id) !== String(id));
    this.saveLocal();
    if (!this.fbReady()) return;
    try {
      const { doc, deleteDoc } = window.firebaseCollections;
      await deleteDoc(doc(window.firebaseDb, this.FB_COL, String(id)));
    } catch (e) {
      console.warn("[TabelasVigentes] delete", e);
    }
  },

  consultar() {
    const cities = new Set((this.state.cityIds || []).map(String));
    const emps = new Set((this.state.empIds || []).map(String));
    this.state.shown = (this.state.tables || []).filter((t) => {
      if (cities.size && !cities.has(String(t.cityId || t.city))) return false;
      if (emps.size && !emps.has(String(t.enterpriseId))) return false;
      return true;
    }).slice().sort((a, b) => String(b.competencia || "").localeCompare(String(a.competencia || ""))
      || String(a.city || "").localeCompare(String(b.city || ""), "pt-BR")
      || String(a.enterpriseName || "").localeCompare(String(b.enterpriseName || ""), "pt-BR"));
    this.state.consulted = true;
    this.renderList();
  },

  limpar() {
    this.state.cityIds = [];
    this.state.empIds = [];
    this.state.openCity = false;
    this.state.openEmp = false;
    this.state.qCity = "";
    this.state.qEmp = "";
    this.state.shown = [];
    this.state.consulted = false;
    this.paintFilters();
    this.renderList();
  },

  renderList() {
    const box = document.getElementById("tvig-results");
    if (!box) return;
    if (!this.state.consulted) {
      box.innerHTML = `<div class="tvig-empty">Use <strong>Consultar</strong> para ver as tabelas cadastradas.</div>`;
      return;
    }
    const rows = this.state.shown || [];
    if (!rows.length) {
      box.innerHTML = `<div class="tvig-empty">Não há tabelas cadastradas${this.state.cityIds.length || this.state.empIds.length ? " para o filtro selecionado" : ""}.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="crm-card" style="padding:0;overflow:hidden;">
        <table class="custom-table tvig-list-table">
          <thead>
            <tr>
              <th>Competência</th>
              <th>Cidade</th>
              <th>Empreendimento</th>
              <th style="width:140px;text-align:right;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((t) => `
              <tr>
                <td>${this.esc(this.competenciaLabel(t.competencia))}</td>
                <td>${this.esc(t.city || t.cityId || "—")}</td>
                <td>${this.esc((t.enterpriseId ? t.enterpriseId + " - " : "") + (t.enterpriseName || "—"))}</td>
                <td style="text-align:right;white-space:nowrap;">
                  <button type="button" class="tvig-ico" title="Editar" onclick="TabelasVigentesApp.openEditor('${this.esc(t.id)}')">
                    <i data-lucide="pencil" style="width:15px;height:15px;"></i>
                  </button>
                  <button type="button" class="tvig-ico" title="Copiar" onclick="TabelasVigentesApp.copyTable('${this.esc(t.id)}')">
                    <i data-lucide="copy" style="width:15px;height:15px;"></i>
                  </button>
                  <button type="button" class="tvig-ico is-danger" title="Excluir" onclick="TabelasVigentesApp.removeTable('${this.esc(t.id)}')">
                    <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
                  </button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  renderPage() {
    const root = document.getElementById("tabelas-vigentes-root");
    if (!root) return;
    root.innerHTML = `
      <div class="tvig-page">
        <div class="search-filter-panel tvig-params">
          <h2 class="tvig-page-title">
            <i data-lucide="table" style="width:22px;height:22px;color:var(--color-primary);"></i>
            Tabelas vigentes
          </h2>
          <h3 class="tvig-section-title">Parâmetros da consulta</h3>
          <div class="tvig-filters">
            <div id="tvig-city-slot" class="tvig-filter-slot"></div>
            <div id="tvig-emp-slot" class="tvig-filter-slot"></div>
            <div class="tvig-filter-actions">
              <button type="button" class="btn btn-primary" onclick="TabelasVigentesApp.consultar()">
                <i data-lucide="search" style="width:16px;"></i> Consultar
              </button>
              <button type="button" class="btn btn-cancel" onclick="TabelasVigentesApp.limpar()">Limpar</button>
              <button type="button" class="btn btn-primary" onclick="TabelasVigentesApp.openEditor()">
                <i data-lucide="plus" style="width:16px;"></i> Adicionar nova tabela
              </button>
            </div>
          </div>
        </div>
        <h3 class="tvig-section-title">Resultados da consulta</h3>
        <div id="tvig-results"></div>
      </div>
      <div id="tvig-editor-overlay" class="modal-overlay tvig-editor-overlay" style="display:none;"></div>`;
    this.paintFilters();
    this.renderList();
    if (window.lucide) lucide.createIcons();
  },

  findTable(id) {
    return (this.state.tables || []).find((t) => String(t.id) === String(id)) || null;
  },

  openEditor(id, asCopy) {
    const src = id ? this.findTable(id) : null;
    let draft;
    if (src) {
      draft = JSON.parse(JSON.stringify(src));
      if (asCopy) {
        draft.id = this.uid();
        draft.createdAt = new Date().toISOString();
      }
    } else {
      draft = this.emptyTable();
    }
    draft.rows = (draft.rows && draft.rows.length) ? draft.rows : this.defaultRows();
    this.state.editor = {
      draft,
      mode: src ? (asCopy ? "copy" : "edit") : "new",
      title: src ? (asCopy ? "Copiar tabela vigente" : "Editar tabela vigente") : "Nova tabela vigente"
    };
    this.paintEditor();
  },

  copyTable(id) {
    this.openEditor(id, true);
  },

  async removeTable(id) {
    const t = this.findTable(id);
    const label = t
      ? (this.competenciaLabel(t.competencia) + " · " + (t.enterpriseName || t.enterpriseId || ""))
      : "esta tabela";
    const ok = typeof window.mouraConfirm === "function"
      ? await window.mouraConfirm("Excluir a tabela " + label + "? Esta ação não pode ser desfeita.")
      : window.confirm("Excluir a tabela " + label + "?");
    if (!ok) return;
    await this.deleteOne(id);
    if (this.state.consulted) this.consultar();
    else this.renderList();
  },

  closeEditor() {
    this.state.editor = null;
    const ov = document.getElementById("tvig-editor-overlay");
    if (ov) {
      ov.classList.remove("active");
      ov.style.display = "none";
      ov.innerHTML = "";
    }
  },

  editorCityOptions() {
    return this.state.cities;
  },

  editorEmpOptions(cityId) {
    if (!cityId) return this.state.enterprises;
    return this.state.enterprises.filter((e) => e.cityId === cityId);
  },

  onEditorCity(val) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d) return;
    d.cityId = val;
    d.city = val;
    const emps = this.editorEmpOptions(val);
    if (!emps.some((e) => String(e.id) === String(d.enterpriseId))) {
      d.enterpriseId = "";
      d.enterpriseName = "";
    }
    this.paintEditor();
  },

  onEditorEmp(val) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d) return;
    const emp = this.state.enterprises.find((e) => String(e.id) === String(val));
    d.enterpriseId = val;
    d.enterpriseName = emp ? emp.name : "";
    if (emp && emp.cityId) {
      d.cityId = emp.cityId;
      d.city = emp.cityId;
    }
    this.paintEditor();
  },

  onEditorField(field, val) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d) return;
    d[field] = val;
  },

  onEditorRow(idx, field, val) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d || !d.rows[idx]) return;
    d.rows[idx][field] = val;
  },

  addEditorRow() {
    const d = this.state.editor && this.state.editor.draft;
    if (!d) return;
    d.rows.push({
      id: this.uid(),
      plano: "",
      entradaMin: "",
      parcelamentoEntrada: "",
      taxaJuros: "",
      reajuste: "",
      condicaoEspecial: ""
    });
    this.paintEditor();
  },

  removeEditorRow(idx) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d) return;
    d.rows.splice(idx, 1);
    this.paintEditor();
  },

  paintEditor() {
    const ov = document.getElementById("tvig-editor-overlay");
    const ed = this.state.editor;
    if (!ov || !ed) return;
    const d = ed.draft;
    const cities = this.editorCityOptions();
    const emps = this.editorEmpOptions(d.cityId);
    ov.style.display = "flex";
    ov.classList.add("active");
    ov.innerHTML = `
      <div class="modal-box tvig-editor-box" onclick="event.stopPropagation()">
        <div class="modal-header tvig-editor-head">
          <h3>${this.esc(ed.title)}</h3>
          <button type="button" class="modal-close" onclick="TabelasVigentesApp.closeEditor()"><i data-lucide="x"></i></button>
        </div>
        <div class="tvig-editor-body">
          <div class="tvig-editor-grid">
            <div class="form-group">
              <label>Competência</label>
              <input type="month" class="form-control" value="${this.esc(d.competencia || "")}"
                onchange="TabelasVigentesApp.onEditorField('competencia', this.value)">
            </div>
            <div class="form-group">
              <label>Cidade</label>
              <select class="form-control" onchange="TabelasVigentesApp.onEditorCity(this.value)">
                <option value="">Selecione a cidade</option>
                ${cities.map((c) => `<option value="${this.esc(c.id)}" ${c.id === d.cityId ? "selected" : ""}>${this.esc(c.name)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>Empreendimento</label>
              <select class="form-control" onchange="TabelasVigentesApp.onEditorEmp(this.value)">
                <option value="">Selecione o empreendimento</option>
                ${emps.map((e) => `<option value="${this.esc(e.id)}" ${String(e.id) === String(d.enterpriseId) ? "selected" : ""}>${this.esc(e.label || (e.id + " - " + e.name))}</option>`).join("")}
              </select>
            </div>
          </div>
          <h4 class="tvig-plan-title">Planos de pagamento</h4>
          <div class="tvig-editor-table-wrap">
            <table class="custom-table tvig-plan-table">
              <colgroup>
                <col class="tvig-col-plano">
                <col class="tvig-col-entrada">
                <col class="tvig-col-parc">
                <col class="tvig-col-taxa">
                <col class="tvig-col-reaj">
                <col class="tvig-col-cond">
                <col class="tvig-col-acao">
              </colgroup>
              <thead>
                <tr>
                  <th>Plano de pagamento</th>
                  <th>Entrada mínima</th>
                  <th>Parcelamento da entrada</th>
                  <th>Taxa de juros</th>
                  <th>Reajuste</th>
                  <th>Condição especial</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${(d.rows || []).map((r, i) => `
                  <tr>
                    <td><input class="form-control" value="${this.esc(r.plano)}" oninput="TabelasVigentesApp.onEditorRow(${i},'plano',this.value)"></td>
                    <td><input class="form-control tvig-cell-center" value="${this.esc(r.entradaMin)}" oninput="TabelasVigentesApp.onEditorRow(${i},'entradaMin',this.value)"></td>
                    <td><input class="form-control tvig-cell-center" value="${this.esc(r.parcelamentoEntrada)}" oninput="TabelasVigentesApp.onEditorRow(${i},'parcelamentoEntrada',this.value)"></td>
                    <td><input class="form-control tvig-cell-center" value="${this.esc(r.taxaJuros)}" oninput="TabelasVigentesApp.onEditorRow(${i},'taxaJuros',this.value)"></td>
                    <td><input class="form-control tvig-cell-center" value="${this.esc(r.reajuste)}" oninput="TabelasVigentesApp.onEditorRow(${i},'reajuste',this.value)"></td>
                    <td><input class="form-control" value="${this.esc(r.condicaoEspecial)}" oninput="TabelasVigentesApp.onEditorRow(${i},'condicaoEspecial',this.value)"></td>
                    <td><button type="button" class="tvig-ico is-danger" title="Remover linha" onclick="TabelasVigentesApp.removeEditorRow(${i})"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
          <button type="button" class="btn btn-outline" onclick="TabelasVigentesApp.addEditorRow()">
            <i data-lucide="plus" style="width:14px;"></i> Adicionar plano
          </button>
        </div>
        <div class="tvig-editor-foot">
          <button type="button" class="btn btn-cancel" onclick="TabelasVigentesApp.closeEditor()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="TabelasVigentesApp.saveEditor()">
            <i data-lucide="save" style="width:16px;"></i> Salvar tabela
          </button>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
  },

  async saveEditor() {
    const ed = this.state.editor;
    if (!ed || !ed.draft) return;
    const d = ed.draft;
    if (!d.competencia) {
      alert("Informe a competência.");
      return;
    }
    if (!d.cityId) {
      alert("Selecione a cidade.");
      return;
    }
    if (!d.enterpriseId) {
      alert("Selecione o empreendimento.");
      return;
    }
    d.city = d.cityId;
    const emp = this.state.enterprises.find((e) => String(e.id) === String(d.enterpriseId));
    if (emp) d.enterpriseName = emp.name;
    d.rows = (d.rows || []).filter((r) => String(r.plano || "").trim());
    if (!d.rows.length) {
      alert("Inclua ao menos um plano de pagamento.");
      return;
    }
    d.updatedAt = new Date().toISOString();
    const idx = this.state.tables.findIndex((t) => String(t.id) === String(d.id));
    if (idx >= 0) this.state.tables[idx] = d;
    else this.state.tables.push(d);
    await this.persistOne(d);
    this.closeEditor();
    this.state.consulted = true;
    this.consultar();
  },

  async init() {
    const root = document.getElementById("tabelas-vigentes-root");
    if (!root) return;
    if (!this.state.inited) {
      this.loadLocal();
      this.renderPage();
      this.state.loading = true;
      await this.loadCatalog();
      await this.loadCloud();
      this.state.loading = false;
      this.state.inited = true;
    }
    this.renderPage();
  }
};

window.TabelasVigentesApp = TabelasVigentesApp;

document.addEventListener("tabChanged", function (e) {
  if (e.detail === "tabelas-vigentes") TabelasVigentesApp.init();
});
