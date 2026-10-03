/**
 * Comercial · Tabelas vigentes
 * Cadastro de tabela de preços/condições por competência, cidade e empreendimento.
 */
const TabelasVigentesApp = {
  FB_COL: "tabelas_vigentes",
  STORAGE_KEY: "crm_moura_tabelas_vigentes",
  DEFAULT_PLANOS: [
    { plano: "Boleto único", intermediarias: false, entradaMin: "", parcelamentoEntrada: "", taxaJuros: "", reajuste: "", descontoOn: false, descontoPct: "" },
    { plano: "12", intermediarias: false, entradaMin: "10", parcelamentoEntrada: "3", taxaJuros: "0", reajuste: "0", descontoOn: false, descontoPct: "" },
    { plano: "24", intermediarias: false, entradaMin: "15", parcelamentoEntrada: "3", taxaJuros: "0", reajuste: "0", descontoOn: false, descontoPct: "" },
    { plano: "36", intermediarias: false, entradaMin: "15", parcelamentoEntrada: "3", taxaJuros: "0,4074", reajuste: "0", descontoOn: false, descontoPct: "" },
    { plano: "48", intermediarias: false, entradaMin: "15", parcelamentoEntrada: "3", taxaJuros: "0,4074", reajuste: "IPCA", descontoOn: false, descontoPct: "" },
    { plano: "60", intermediarias: false, entradaMin: "25", parcelamentoEntrada: "3", taxaJuros: "0,4074", reajuste: "IPCA", descontoOn: false, descontoPct: "" },
    { plano: "60", intermediarias: false, entradaMin: "50", parcelamentoEntrada: "3", taxaJuros: "0,0000", reajuste: "IPCA", descontoOn: false, descontoPct: "" },
    { plano: "120", intermediarias: false, entradaMin: "7", parcelamentoEntrada: "1", taxaJuros: "0,9489", reajuste: "IPCA", descontoOn: false, descontoPct: "" },
    { plano: "168", intermediarias: false, entradaMin: "7", parcelamentoEntrada: "1", taxaJuros: "0,9489", reajuste: "IPCA", descontoOn: false, descontoPct: "" },
    { plano: "168", intermediarias: false, entradaMin: "7", parcelamentoEntrada: "3", taxaJuros: "0,9489", reajuste: "IPCA", descontoOn: false, descontoPct: "" }
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

  readIdSet(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      return new Set((Array.isArray(raw) ? raw : []).map(String).filter(Boolean));
    } catch (e) {
      return new Set();
    }
  },

  unitsByEnterprise() {
    const ids = new Set();
    const est = window.EstoqueComercialApp && EstoqueComercialApp.state && EstoqueComercialApp.state.units;
    (est || []).forEach((u) => {
      if (u && u.enterpriseId) ids.add(String(u.enterpriseId));
    });
    if (ids.size) return ids;
    try {
      const raw = JSON.parse(localStorage.getItem("crm_estoque_posicao_v1") || "null");
      const units = raw && (raw.units || (raw.data && raw.data.units));
      (units || []).forEach((u) => {
        if (u && u.enterpriseId) ids.add(String(u.enterpriseId));
      });
    } catch (e) {}
    this.readIdSet("crm_cc_ids_com_unidade").forEach((id) => ids.add(String(id)));
    return ids;
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

  ccHasUnits(cc) {
    const id = String((cc && cc.id) || "").trim();
    if (!id) return false;
    const empty = this.readIdSet("crm_cc_ids_sem_unidade");
    if (empty.has(id)) return false;
    const withUnits = this.unitsByEnterprise();
    if (withUnits.size) return withUnits.has(id);
    return true;
  },

  async loadCatalog() {
    let list = (window.AppState && (AppState.cachedCostCenters || AppState.costCenters)) || [];
    if ((!list || !list.length) && window.SiengeApiService && typeof SiengeApiService.getCostCenters === "function") {
      try { list = await SiengeApiService.getCostCenters(false); } catch (e) { list = []; }
    }
    if (window.EstoqueComercialApp && typeof EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento === "function") {
      try { list = EstoqueComercialApp.filterEmpreendimentosLikeRelacionamento(list || []); } catch (e) {}
    }
    const catalog = (list || []).filter((cc) => this.isEmpCc(cc) && this.ccHasUnits(cc)).map((cc) => {
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

  stripDash(s) {
    const t = String(s == null ? "" : s).trim();
    return (t === "—" || t === "-" || t === "–") ? "" : t;
  },

  stripSuffix(s) {
    return this.stripDash(s).replace(/%/g, "").replace(/x$/i, "").trim();
  },

  sanitizeDec(raw, maxDec) {
    let s = this.stripSuffix(raw).replace(/[^\d,.]/g, "").replace(".", ",");
    const i = s.indexOf(",");
    if (i >= 0) {
      s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, "");
      const parts = s.split(",");
      if (parts[1] && parts[1].length > maxDec) s = parts[0] + "," + parts[1].slice(0, maxDec);
    }
    return s;
  },

  sanitizeInt(raw) {
    return this.stripSuffix(raw).replace(/\D/g, "");
  },

  sanitizePlano(raw) {
    const s = String(raw == null ? "" : raw);
    if (/^\d*$/.test(s.trim())) return s.trim();
    const fold = this.fold(s).replace(/\s+/g, " ");
    if (!fold) return "";
    if ("BOLETO UNICO".startsWith(fold) || fold.startsWith("BOLETO")) return s;
    if (/^\d+$/.test(s.replace(/\s/g, ""))) return s.replace(/\D/g, "");
    return s.replace(/[^\d]/g, "");
  },

  normalizePlano(raw) {
    const s = String(raw == null ? "" : raw).trim();
    const fold = this.fold(s).replace(/\s+/g, " ");
    if (fold === "BOLETO UNICO" || fold === "BOLETOUNICO") return "Boleto único";
    const n = s.replace(/\D/g, "");
    return n ? String(parseInt(n, 10)) : "";
  },

  migrateRow(r) {
    const src = r || {};
    const planoRaw = String(src.plano || "");
    const interFromText = /intermed/i.test(planoRaw);
    let plano = planoRaw.replace(/\s*c\/\s*intermedi[aá]rias?/i, "").trim();
    plano = this.normalizePlano(plano) || (this.fold(planoRaw).includes("BOLETO") ? "Boleto único" : plano);
    const cond = String(src.condicaoEspecial || "");
    const m = cond.match(/(\d+(?:[.,]\d+)?)\s*%/);
    const descontoOn = src.descontoOn != null ? !!src.descontoOn : !!m;
    return {
      id: src.id || this.uid(),
      plano,
      intermediarias: src.intermediarias != null ? !!src.intermediarias : interFromText,
      entradaMin: this.stripSuffix(src.entradaMin),
      parcelamentoEntrada: this.sanitizeInt(src.parcelamentoEntrada),
      taxaJuros: this.stripSuffix(src.taxaJuros),
      reajuste: this.stripDash(src.reajuste),
      descontoOn,
      descontoPct: src.descontoPct != null && String(src.descontoPct) !== ""
        ? this.stripSuffix(src.descontoPct)
        : (m ? String(m[1]).replace(".", ",") : ""),
      condicaoEspecial: src.condicaoEspecial || ""
    };
  },

  defaultRows() {
    return this.DEFAULT_PLANOS.map((r) => this.migrateRow(Object.assign({ id: this.uid() }, r)));
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

  prefillFromFilters(draft) {
    const emps = (this.state.empIds || []).map(String);
    const cities = (this.state.cityIds || []).map(String);
    if (emps.length === 1) {
      const emp = this.state.enterprises.find((e) => String(e.id) === emps[0]);
      if (emp) {
        draft.enterpriseId = emp.id;
        draft.enterpriseName = emp.name;
        draft.cityId = emp.cityId;
        draft.city = emp.cityId;
        return draft;
      }
    }
    if (cities.length === 1) {
      draft.cityId = cities[0];
      draft.city = cities[0];
    }
    return draft;
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

  isDuplicate(d) {
    return (this.state.tables || []).some((t) =>
      String(t.id) !== String(d.id)
      && String(t.competencia || "") === String(d.competencia || "")
      && String(t.enterpriseId || "") === String(d.enterpriseId || "")
    );
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
      this.prefillFromFilters(draft);
    }
    draft.rows = ((draft.rows && draft.rows.length) ? draft.rows : this.defaultRows()).map((r) => this.migrateRow(r));
    this.state.editor = {
      draft,
      mode: src ? (asCopy ? "copy" : "edit") : "new",
      title: src ? (asCopy ? "Copiar tabela vigente" : "Editar tabela vigente") : "Nova tabela vigente",
      openCity: false,
      openEmp: false,
      qCity: "",
      qEmp: "",
      sel: null
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
    const empId = this.state.editor && this.state.editor.draft && this.state.editor.draft.enterpriseId;
    if (empId) {
      const emp = this.state.enterprises.find((e) => String(e.id) === String(empId));
      if (emp) return this.state.cities.filter((c) => c.id === emp.cityId);
    }
    return this.state.cities;
  },

  editorEmpOptions() {
    const d = this.state.editor && this.state.editor.draft;
    const cityId = d && d.cityId;
    if (!cityId) return this.state.enterprises;
    return this.state.enterprises.filter((e) => e.cityId === cityId);
  },

  bindEditorFilters() {
    if (!window.MlEmpresaFilter || !this.state.editor) return;
    const self = this;
    const ed = this.state.editor;
    const bind = (id, kind) => {
      MlEmpresaFilter.bind(id, {
        toggleOpen() {
          if (kind === "city") {
            ed.openCity = !ed.openCity;
            ed.openEmp = false;
          } else {
            ed.openEmp = !ed.openEmp;
            ed.openCity = false;
          }
          self.paintEditorFilters();
        },
        setQuery(q) {
          if (kind === "city") ed.qCity = q || "";
          else ed.qEmp = q || "";
          const box = document.getElementById(id + "-list");
          if (box) {
            box.innerHTML = MlEmpresaFilter.listHtml({
              id,
              items: kind === "city" ? self.editorCityOptions() : self.editorEmpOptions(),
              selectedIds: kind === "city"
                ? (ed.draft.cityId ? [ed.draft.cityId] : [])
                : (ed.draft.enterpriseId ? [ed.draft.enterpriseId] : []),
              query: kind === "city" ? ed.qCity : ed.qEmp,
              nouns: kind === "city"
                ? { singular: "cidade", plural: "cidades" }
                : { singular: "empreendimento", plural: "empreendimentos" }
            });
          }
        },
        toggleId(itemId, on) {
          if (kind === "city") {
            ed.draft.cityId = on ? String(itemId) : "";
            ed.draft.city = ed.draft.cityId;
            const emps = self.editorEmpOptions();
            if (!emps.some((e) => String(e.id) === String(ed.draft.enterpriseId))) {
              ed.draft.enterpriseId = "";
              ed.draft.enterpriseName = "";
            }
            ed.openCity = true;
          } else if (on) {
            const emp = self.state.enterprises.find((e) => String(e.id) === String(itemId));
            ed.draft.enterpriseId = String(itemId);
            ed.draft.enterpriseName = emp ? emp.name : "";
            if (emp && emp.cityId) {
              ed.draft.cityId = emp.cityId;
              ed.draft.city = emp.cityId;
            }
            ed.openEmp = true;
          } else {
            ed.draft.enterpriseId = "";
            ed.draft.enterpriseName = "";
            ed.openEmp = true;
          }
          self.paintEditorFilters();
        },
        selectAll() {
          const items = kind === "city" ? self.editorCityOptions() : self.editorEmpOptions();
          if (items.length === 1) this.toggleId(items[0].id, true);
        },
        selectNone() {
          this.toggleId(kind === "city" ? ed.draft.cityId : ed.draft.enterpriseId, false);
        }
      });
    };
    bind("tvig-ed-city", "city");
    bind("tvig-ed-emp", "emp");
  },

  paintEditorFilters() {
    const citySlot = document.getElementById("tvig-ed-city-slot");
    const empSlot = document.getElementById("tvig-ed-emp-slot");
    const ed = this.state.editor;
    if (!citySlot || !empSlot || !ed || !window.MlEmpresaFilter) return;
    this.bindEditorFilters();
    citySlot.innerHTML = MlEmpresaFilter.html({
      id: "tvig-ed-city",
      label: "Cidade",
      items: this.editorCityOptions(),
      selectedIds: ed.draft.cityId ? [ed.draft.cityId] : [],
      open: !!ed.openCity,
      query: ed.qCity || "",
      emptyMeansAll: false,
      nouns: { singular: "cidade", plural: "cidades" }
    });
    empSlot.innerHTML = MlEmpresaFilter.html({
      id: "tvig-ed-emp",
      label: "Empreendimento",
      items: this.editorEmpOptions(),
      selectedIds: ed.draft.enterpriseId ? [ed.draft.enterpriseId] : [],
      open: !!ed.openEmp,
      query: ed.qEmp || "",
      emptyMeansAll: false,
      nouns: { singular: "empreendimento", plural: "empreendimentos" }
    });
    if (window.lucide) lucide.createIcons();
  },

  onEditorField(field, val) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d) return;
    d[field] = val;
  },

  onSheetInput(idx, field, el) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d || !d.rows[idx]) return;
    let v = el.value;
    if (field === "plano") v = this.sanitizePlano(v);
    else if (field === "entradaMin" || field === "descontoPct") v = this.sanitizeDec(v, 2);
    else if (field === "taxaJuros") v = this.sanitizeDec(v, 4);
    else if (field === "parcelamentoEntrada") v = this.sanitizeInt(v);
    if (el.value !== v) el.value = v;
    d.rows[idx][field] = v;
  },

  onPlanoBlur(idx, el) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d || !d.rows[idx]) return;
    const n = this.normalizePlano(el.value);
    el.value = n;
    d.rows[idx].plano = n;
  },

  onEditorFlag(idx, field, on) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d || !d.rows[idx]) return;
    d.rows[idx][field] = !!on;
    if (field === "descontoOn") {
      const wrap = document.querySelector('td[data-row="' + idx + '"][data-field="desconto"] .tvig-affix');
      const input = document.querySelector('td[data-row="' + idx + '"][data-field="desconto"] input.tvig-sheet-input');
      if (wrap) wrap.classList.toggle("is-off", !on);
      if (input) input.disabled = !on;
    }
  },

  addEditorRow() {
    const d = this.state.editor && this.state.editor.draft;
    if (!d) return;
    d.rows.push(this.migrateRow({ id: this.uid() }));
    this.paintEditor();
  },

  removeEditorRow(idx) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d) return;
    d.rows.splice(idx, 1);
    this.paintEditor();
  },

  sheetCell(idx, field, value, opts) {
    const o = opts || {};
    const affix = o.affix ? `<span class="tvig-affix-mark">${this.esc(o.affix)}</span>` : "";
    const extra = o.affix ? " tvig-affix" : "";
    const off = o.off ? " is-off" : "";
    return `<td class="tvig-sheet-td" data-row="${idx}" data-field="${field}">
      <div class="tvig-sheet-cell${extra}${off}">
        <input class="tvig-sheet-input${o.center ? " tvig-cell-center" : ""}" value="${this.esc(value || "")}"
          ${o.off ? "disabled" : ""}
          oninput="TabelasVigentesApp.onSheetInput(${idx},'${field}',this)"
          ${field === "plano" ? `onblur="TabelasVigentesApp.onPlanoBlur(${idx},this)"` : ""}>
        ${affix}
      </div>
    </td>`;
  },

  paintEditor() {
    const ov = document.getElementById("tvig-editor-overlay");
    const ed = this.state.editor;
    if (!ov || !ed) return;
    const d = ed.draft;
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
            <div id="tvig-ed-city-slot" class="tvig-ed-filter-slot"></div>
            <div id="tvig-ed-emp-slot" class="tvig-ed-filter-slot"></div>
          </div>
          <h4 class="tvig-plan-title">Planos de pagamento</h4>
          <div class="tvig-editor-table-wrap">
            <table class="tvig-plan-table">
              <colgroup>
                <col class="tvig-col-plano">
                <col class="tvig-col-flag">
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
                  <th>Intermediárias</th>
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
                    ${this.sheetCell(i, "plano", r.plano)}
                    <td class="tvig-sheet-td tvig-td-flag" data-row="${i}" data-field="intermediarias">
                      <label class="moura-switch" title="Parcelas intermediárias">
                        <input type="checkbox" ${r.intermediarias ? "checked" : ""}
                          onchange="TabelasVigentesApp.onEditorFlag(${i},'intermediarias',this.checked)">
                        <span class="moura-switch-track" aria-hidden="true"></span>
                      </label>
                    </td>
                    ${this.sheetCell(i, "entradaMin", r.entradaMin, { affix: "%", center: true })}
                    ${this.sheetCell(i, "parcelamentoEntrada", r.parcelamentoEntrada, { affix: "x", center: true })}
                    ${this.sheetCell(i, "taxaJuros", r.taxaJuros, { affix: "%", center: true })}
                    ${this.sheetCell(i, "reajuste", r.reajuste, { center: true })}
                    <td class="tvig-sheet-td" data-row="${i}" data-field="desconto">
                      <div class="tvig-desc-cell">
                        <label class="moura-switch" title="Desconto especial">
                          <input type="checkbox" ${r.descontoOn ? "checked" : ""}
                            onchange="TabelasVigentesApp.onEditorFlag(${i},'descontoOn',this.checked)">
                          <span class="moura-switch-track" aria-hidden="true"></span>
                        </label>
                        <div class="tvig-sheet-cell tvig-affix${r.descontoOn ? "" : " is-off"}">
                          <input class="tvig-sheet-input tvig-cell-center" value="${this.esc(r.descontoPct || "")}"
                            ${r.descontoOn ? "" : "disabled"}
                            oninput="TabelasVigentesApp.onSheetInput(${i},'descontoPct',this)">
                          <span class="tvig-affix-mark">%</span>
                        </div>
                      </div>
                    </td>
                    <td class="tvig-td-del">
                      <button type="button" class="tvig-ico is-danger" title="Remover linha" onclick="TabelasVigentesApp.removeEditorRow(${i})"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                    </td>
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
    this.paintEditorFilters();
    this.ensureSheetEvents();
    if (window.lucide) lucide.createIcons();
  },

  selectSheetTd(td) {
    document.querySelectorAll(".tvig-sheet-td.is-selected").forEach((el) => el.classList.remove("is-selected"));
    document.querySelectorAll(".tvig-fill-handle").forEach((el) => el.remove());
    if (!td || !td.dataset.field) return;
    td.classList.add("is-selected");
    const h = document.createElement("span");
    h.className = "tvig-fill-handle";
    h.title = "Arraste para copiar";
    td.appendChild(h);
    if (this.state.editor) this.state.editor.sel = { row: Number(td.dataset.row), field: td.dataset.field };
  },

  applyFill(field, from, to) {
    const d = this.state.editor && this.state.editor.draft;
    if (!d || !d.rows[from]) return;
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    const src = d.rows[from];
    for (let i = a; i <= b; i++) {
      if (!d.rows[i]) continue;
      if (field === "intermediarias") {
        d.rows[i].intermediarias = !!src.intermediarias;
      } else if (field === "desconto") {
        d.rows[i].descontoOn = !!src.descontoOn;
        d.rows[i].descontoPct = src.descontoPct;
      } else {
        d.rows[i][field] = src[field];
      }
    }
    this.paintEditor();
  },

  ensureSheetEvents() {
    const ov = document.getElementById("tvig-editor-overlay");
    if (!ov || ov.dataset.sheetBound === "1") return;
    ov.dataset.sheetBound = "1";
    const self = this;
    ov.addEventListener("mousedown", (e) => {
      const handle = e.target.closest(".tvig-fill-handle");
      const td = e.target.closest(".tvig-sheet-td");
      if (handle && td) {
        e.preventDefault();
        self._fill = { field: td.dataset.field, from: Number(td.dataset.row), to: Number(td.dataset.row) };
        return;
      }
      if (td && td.closest(".tvig-plan-table")) self.selectSheetTd(td);
    });
    window.addEventListener("mousemove", (e) => {
      if (!self._fill) return;
      const td = e.target.closest && e.target.closest(".tvig-sheet-td");
      if (!td || td.dataset.field !== self._fill.field) return;
      self._fill.to = Number(td.dataset.row);
      const a = Math.min(self._fill.from, self._fill.to);
      const b = Math.max(self._fill.from, self._fill.to);
      document.querySelectorAll(".tvig-sheet-td.is-fill").forEach((el) => el.classList.remove("is-fill"));
      document.querySelectorAll('.tvig-sheet-td[data-field="' + self._fill.field + '"]').forEach((el) => {
        const r = Number(el.dataset.row);
        if (r >= a && r <= b) el.classList.add("is-fill");
      });
    });
    window.addEventListener("mouseup", () => {
      if (!self._fill) return;
      const job = self._fill;
      self._fill = null;
      document.querySelectorAll(".tvig-sheet-td.is-fill").forEach((el) => el.classList.remove("is-fill"));
      if (job.from !== job.to) self.applyFill(job.field, job.from, job.to);
    });
  },

  formatPctSave(raw, maxDec) {
    const s = this.sanitizeDec(raw, maxDec);
    if (!s) return "";
    return s + "%";
  },

  formatXSave(raw) {
    const s = this.sanitizeInt(raw);
    return s ? (s + "x") : "";
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
    if (this.isDuplicate(d)) {
      alert("Já existe uma tabela nesta competência para o empreendimento " + (d.enterpriseName || d.enterpriseId) + ".");
      return;
    }
    d.city = d.cityId;
    const emp = this.state.enterprises.find((e) => String(e.id) === String(d.enterpriseId));
    if (emp) d.enterpriseName = emp.name;
    d.rows = (d.rows || []).map((r) => {
      const row = this.migrateRow(r);
      row.plano = this.normalizePlano(row.plano);
      row.entradaMin = this.formatPctSave(row.entradaMin, 2);
      row.parcelamentoEntrada = this.formatXSave(row.parcelamentoEntrada);
      row.taxaJuros = this.formatPctSave(row.taxaJuros, 4);
      row.descontoPct = row.descontoOn ? this.formatPctSave(row.descontoPct, 2) : "";
      row.condicaoEspecial = row.descontoOn && row.descontoPct ? ("Até " + row.descontoPct + " de desconto") : "";
      return row;
    }).filter((r) => String(r.plano || "").trim());
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
