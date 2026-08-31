const EstoqueComercialApp = {
  CACHE_KEY: "crm_estoque_posicao_v1",
  LIMIT: 200,
  STATUS_PILLS: [
    { id: "all", label: "Todas" },
    { id: "Disponível", label: "Disponível" },
    { id: "Reservada", label: "Reservada" },
    { id: "Reserva técnica", label: "Reserva técnica" },
    { id: "Permuta", label: "Permuta" },
    { id: "Mútuo", label: "Mútuo" },
    { id: "Proposta", label: "Proposta" },
    { id: "Vendida", label: "Vendida" },
    { id: "Locado", label: "Locado" },
    { id: "Transferida", label: "Transferida" },
    { id: "Terceiros", label: "Terceiros" },
    { id: "Vendida em pré-contrato", label: "Vendida em pré-contrato" }
  ],
  STOCK_MAP: {
    D: "Disponível",
    S: "Reservada",
    R: "Reserva técnica",
    E: "Permuta",
    M: "Mútuo",
    P: "Proposta",
    V: "Vendida",
    L: "Locado",
    F: "Transferida",
    T: "Terceiros",
    C: "Vendida em pré-contrato"
  },
  LEGAL_MAP: { L: "Livre", B: "Bloqueado", I: "Indisponível" },
  OBRA_MAP: { P: "Projeto", A: "Andamento", C: "Concluído", O: "Obra" },

  state: {
    loading: false,
    enterprises: [],
    units: [],
    ccDone: [],
    status: "all",
    fetchedAt: null,
    complete: false,
    inited: false
  },

  todayStr() {
    return new Date().toISOString().split("T")[0];
  },

  isObraCc(id) {
    const s = String(id || "").trim();
    return s.charAt(0) === "1" || s.charAt(0) === "2" || s.charAt(0) === "3";
  },

  esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  ccLabel(cc) {
    return `${cc.id} - ${String(cc.name || "").toUpperCase()}`;
  },

  mapStock(code, extra) {
    const raw = String(code || "").trim();
    if (this.STOCK_MAP[raw]) return this.STOCK_MAP[raw];
    if (extra && extra.contractId) return "Vendida";
    return raw ? `Outros (${raw})` : "Sem status";
  },

  mapCode(map, code) {
    const raw = String(code || "").trim();
    if (!raw) return "—";
    return map[raw] || raw;
  },

  slimUnit(u, empName) {
    return {
      id: u.id,
      name: u.name || "",
      enterpriseId: String(u.enterpriseId || ""),
      enterpriseName: empName || "",
      commercialStock: u.commercialStock || "",
      legalStock: u.legalStock || "",
      buildingStock: u.buildingStock || u.constructionStock || "",
      contractId: u.contractId || null,
      area: u.totalArea || u.privateArea || u.indexedPrivateArea || null
    };
  },

  loadCache() {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.date !== this.todayStr()) return null;
      return data;
    } catch (e) {
      return null;
    }
  },

  saveCache() {
    const payload = {
      date: this.todayStr(),
      units: this.state.units,
      ccDone: this.state.ccDone,
      complete: this.state.complete,
      fetchedAt: this.state.fetchedAt || new Date().toISOString()
    };
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("[Estoque] Cache cheio ou indisponível", e);
    }
  },

  applyCache(data) {
    this.state.units = Array.isArray(data.units) ? data.units : [];
    this.state.ccDone = Array.isArray(data.ccDone) ? data.ccDone.map(String) : [];
    this.state.complete = !!data.complete;
    this.state.fetchedAt = data.fetchedAt || null;
  },

  async init() {
    this.renderPills();
    const cache = this.loadCache();
    if (cache) this.applyCache(cache);
    await this.loadEnterprises();
    this.fillUnitSelect();
    this.updateMeta();
    if (this.state.units.length) this.renderTable();
    if (window.lucide) window.lucide.createIcons();
    this.state.inited = true;
  },

  async loadEnterprises() {
    const sel = document.getElementById("est-filter-emp");
    const keep = sel ? sel.value : "";
    let list = [];
    try {
      if (window.SiengeApiService && typeof SiengeApiService.getCostCenters === "function") {
        list = await SiengeApiService.getCostCenters(false);
      }
    } catch (e) {
      console.error("[Estoque] centros de custo", e);
    }
    this.state.enterprises = (list || [])
      .filter(cc => this.isObraCc(cc.id))
      .sort((a, b) => Number(a.id) - Number(b.id));

    if (!sel) return;
    sel.innerHTML = '<option value="">Todos os empreendimentos</option>';
    this.state.enterprises.forEach(cc => {
      const opt = document.createElement("option");
      opt.value = String(cc.id);
      opt.textContent = this.ccLabel(cc);
      sel.appendChild(opt);
    });
    if (keep && this.state.enterprises.some(cc => String(cc.id) === keep)) sel.value = keep;
  },

  empName(id) {
    const cc = this.state.enterprises.find(c => String(c.id) === String(id));
    return cc ? cc.name : "";
  },

  renderPills() {
    const wrap = document.getElementById("est-stock-pills");
    if (!wrap) return;
    wrap.innerHTML = this.STATUS_PILLS.map(p =>
      `<button type="button" class="est-pill${this.state.status === p.id ? " is-active" : ""}" data-status="${this.esc(p.id)}" onclick="EstoqueComercialApp.setStatus('${p.id.replace(/'/g, "\\'")}')">${this.esc(p.label)}</button>`
    ).join("");
  },

  setStatus(id) {
    this.state.status = id;
    this.renderPills();
    this.fillUnitSelect();
    this.renderTable();
  },

  onEmpChange() {
    this.fillUnitSelect();
  },

  filteredByEmp(units) {
    const emp = (document.getElementById("est-filter-emp") || {}).value || "";
    if (!emp) return units;
    return units.filter(u => String(u.enterpriseId) === String(emp));
  },

  fillUnitSelect() {
    const sel = document.getElementById("est-filter-unit");
    if (!sel) return;
    const emp = (document.getElementById("est-filter-emp") || {}).value || "";
    const keep = sel.value;
    sel.innerHTML = '<option value="">Todas as unidades</option>';
    if (!emp) {
      sel.disabled = false;
      return;
    }
    const list = this.filteredByEmp(this.state.units).slice().sort((a, b) =>
      String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" })
    );
    const seen = new Set();
    list.forEach(u => {
      const key = String(u.id);
      if (seen.has(key)) return;
      seen.add(key);
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${u.id} - ${u.name}`;
      sel.appendChild(opt);
    });
    if (keep && seen.has(keep)) sel.value = keep;
  },

  setProgress(text, pct) {
    const el = document.getElementById("est-stock-progress");
    if (!el) return;
    if (!text) {
      el.style.display = "none";
      el.innerHTML = "";
      return;
    }
    el.style.display = "block";
    const bar = Number.isFinite(pct) ? `<div class="est-stock-bar"><span style="width:${Math.max(2, Math.min(100, pct))}%"></span></div>` : "";
    el.innerHTML = `<div>${this.esc(text)}</div>${bar}`;
  },

  updateMeta() {
    const el = document.getElementById("est-stock-meta");
    if (!el) return;
    if (!this.state.units.length) {
      el.textContent = this.state.complete
        ? "Nenhuma unidade encontrada nos empreendimentos 1/2/3."
        : "Ainda sem cache de hoje. Consultar dispara o loop no Sienge (limit 200 por página, um empreendimento por vez).";
      return;
    }
    const when = this.state.fetchedAt ? new Date(this.state.fetchedAt).toLocaleString("pt-BR") : "hoje";
    const extra = this.state.complete ? "" : ` Carga incompleta (${this.state.ccDone.length} empreendimentos). Consulte de novo para continuar.`;
    el.textContent = `${this.state.units.length} unidades em cache · atualizado ${when}.${extra}`;
  },

  selectedUnits() {
    const emp = (document.getElementById("est-filter-emp") || {}).value || "";
    const unitId = (document.getElementById("est-filter-unit") || {}).value || "";
    const q = String((document.getElementById("est-stock-search") || {}).value || "").trim().toLowerCase();
    let rows = this.state.units;
    if (emp) rows = rows.filter(u => String(u.enterpriseId) === String(emp));
    if (unitId) rows = rows.filter(u => String(u.id) === String(unitId));
    if (this.state.status && this.state.status !== "all") {
      rows = rows.filter(u => this.mapStock(u.commercialStock, u) === this.state.status);
    }
    if (q) {
      rows = rows.filter(u => {
        const hay = `${u.enterpriseId} ${u.enterpriseName} ${u.id} ${u.name} ${u.commercialStock}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return rows;
  },

  renderKpis(rows) {
    const el = document.getElementById("est-stock-kpis");
    if (!el) return;
    const counts = {};
    rows.forEach(u => {
      const k = this.mapStock(u.commercialStock, u);
      counts[k] = (counts[k] || 0) + 1;
    });
    const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (!keys.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = keys.map(k =>
      `<div class="est-kpi"><span>${this.esc(k)}</span><strong>${counts[k]}</strong></div>`
    ).join("");
  },

  renderTable() {
    const tbody = document.getElementById("est-stock-tbody");
    if (!tbody) return;
    const rows = this.selectedUnits();
    this.renderKpis(rows);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8;">Nenhuma unidade para os filtros atuais.</td></tr>`;
      return;
    }
    const sorted = rows.slice().sort((a, b) => {
      const e = String(a.enterpriseId).localeCompare(String(b.enterpriseId), undefined, { numeric: true });
      if (e) return e;
      return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" });
    });
    tbody.innerHTML = sorted.map(u => {
      const status = this.mapStock(u.commercialStock, u);
      const area = u.area != null && u.area !== "" ? Number(u.area).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—";
      const empName = u.enterpriseName || this.empName(u.enterpriseId);
      return `<tr>
        <td><span class="est-status-chip">${this.esc(status)}</span></td>
        <td>${this.esc(u.enterpriseId)} / ${this.esc(empName)}</td>
        <td>${this.esc(u.id)} / ${this.esc(u.name)}</td>
        <td>${this.esc(u.commercialStock || "—")}</td>
        <td>${this.esc(this.mapCode(this.LEGAL_MAP, u.legalStock))}</td>
        <td>${this.esc(this.mapCode(this.OBRA_MAP, u.buildingStock))}</td>
        <td>${this.esc(area)}</td>
        <td>${u.contractId ? this.esc(u.contractId) : "—"}</td>
      </tr>`;
    }).join("");
  },

  setBusy(on) {
    this.state.loading = !!on;
    ["est-btn-consultar", "est-btn-atualizar", "est-filter-emp", "est-filter-unit"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !!on;
    });
  },

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  },

  async fetchUnitsForCc(cc) {
    const empName = cc.name || "";
    const collected = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const path = `/units?limit=${this.LIMIT}&offset=${offset}&enterpriseId=${cc.id}&additionalData=NONE`;
      const data = await window.siengeFetchWithRetry(path);
      const results = (data && data.results) || [];
      results.forEach(u => collected.push(this.slimUnit(u, empName)));
      if (results.length < this.LIMIT) hasMore = false;
      else offset += results.length;
    }
    return collected;
  },

  async consultar(forceRefresh) {
    if (this.state.loading) return;
    if (!this.state.enterprises.length) await this.loadEnterprises();
    if (!this.state.enterprises.length) {
      alert("Nenhum centro de custo começando com 1, 2 ou 3.");
      return;
    }

    if (forceRefresh) {
      this.state.units = [];
      this.state.ccDone = [];
      this.state.complete = false;
      this.state.fetchedAt = null;
    } else {
      const cache = this.loadCache();
      if (cache) this.applyCache(cache);
    }

    const pending = this.state.enterprises.filter(cc => !this.state.ccDone.includes(String(cc.id)));
    this.setBusy(true);

    try {
      if (pending.length) {
        const total = this.state.enterprises.length;
        let done = this.state.ccDone.length;
        for (const cc of pending) {
          done += 1;
          this.setProgress(`Buscando ${this.ccLabel(cc)} (${done}/${total})…`, (done / total) * 100);
          try {
            const batch = await this.fetchUnitsForCc(cc);
            this.state.units = this.state.units.filter(u => String(u.enterpriseId) !== String(cc.id)).concat(batch);
            this.state.ccDone.push(String(cc.id));
            this.state.fetchedAt = new Date().toISOString();
            this.saveCache();
          } catch (e) {
            console.error("[Estoque] falha no CC", cc.id, e);
            this.setProgress(`Erro em ${cc.id}: ${e.message || e}. Continuando…`, (done / total) * 100);
            await this.sleep(400);
          }
          await this.sleep(80);
        }
        this.state.complete = this.state.ccDone.length >= this.state.enterprises.length;
        this.saveCache();
      }
      this.setProgress("");
      this.fillUnitSelect();
      this.updateMeta();
      this.renderTable();
    } finally {
      this.setBusy(false);
      if (window.lucide) window.lucide.createIcons();
    }
  }
};

window.EstoqueComercialApp = EstoqueComercialApp;

document.addEventListener("tabChanged", function(e) {
  if (e.detail === "estoque-comercial") {
    EstoqueComercialApp.init();
  }
});
