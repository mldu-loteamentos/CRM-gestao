const EstoqueComercialApp = {
  CACHE_KEY: "crm_estoque_posicao_v1",
  FB_COL: "estoque_comercial",
  LIMIT: 200,
  FB_CHUNK: 400,
  SOLD_CODES: ["V", "O", "G", "P", "L"],
  STATUS_PILLS: [
    { id: "all", label: "Todas" },
    { id: "D", label: "Disponível" },
    { id: "C", label: "Reservada" },
    { id: "R", label: "Reserva técnica" },
    { id: "E", label: "Permuta" },
    { id: "M", label: "Mútuo" },
    { id: "P", label: "Proposta" },
    { id: "V", label: "Vendida" },
    { id: "L", label: "Locado" },
    { id: "T", label: "Transferida" },
    { id: "G", label: "Terceiros" },
    { id: "O", label: "Vendida em pré-contrato" }
  ],
  STOCK_MAP: {
    C: "Reservada",
    D: "Disponível",
    R: "Reserva técnica",
    E: "Permuta",
    M: "Mútuo",
    P: "Proposta",
    V: "Vendida",
    L: "Locado",
    T: "Transferida",
    G: "Terceiros",
    O: "Vendida em pré-contrato"
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
    contractsEnriched: false,
    firebaseOk: false,
    inited: false,
    defaulterIndex: null
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

  mapStock(code) {
    const raw = String(code || "").trim().toUpperCase();
    if (this.STOCK_MAP[raw]) return this.STOCK_MAP[raw];
    return raw ? `Outros (${raw})` : "Sem status";
  },

  mapCode(map, code) {
    const raw = String(code || "").trim();
    if (!raw) return "—";
    return map[raw] || raw;
  },

  siengeFetch(path) {
    const fn = window.siengeFetchWithRetry;
    if (typeof fn === "function") return fn(path);
    throw new Error("Sienge fetch indisponível");
  },

  slimUnit(u, empName) {
    const stock = String(u.commercialStock || "").trim().toUpperCase();
    const contractNumber = u.contractNumber || u.contractnumber || u.currentSalesContractNumber || null;
    const bal = u.outstandingBalance;
    const quitado = bal === 0 || bal === "0";
    return {
      id: u.id,
      name: u.name || "",
      enterpriseId: String(u.enterpriseId || ""),
      enterpriseName: empName || "",
      commercialStock: stock,
      legalStock: u.legalStock || "",
      buildingStock: u.buildingStock || u.constructionStock || "",
      contractId: u.contractId || null,
      contractNumber: contractNumber || null,
      receivableBillId: u.receivableBillId || null,
      customerId: u.customerId || null,
      outstandingBalance: bal == null || bal === "" ? null : Number(bal),
      quitado: !!quitado && !!contractNumber,
      area: u.totalArea || u.privateArea || u.indexedPrivateArea || null
    };
  },

  loadCache() {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
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
      contractsEnriched: this.state.contractsEnriched,
      fetchedAt: this.state.fetchedAt || new Date().toISOString()
    };
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("[Estoque] localStorage cheio; Firebase permanece a fonte.", e);
    }
  },

  applyCache(data) {
    if (!data) return;
    this.state.units = Array.isArray(data.units) ? data.units : [];
    this.state.ccDone = Array.isArray(data.ccDone) ? data.ccDone.map(String) : [];
    this.state.complete = !!data.complete;
    this.state.contractsEnriched = !!data.contractsEnriched;
    this.state.fetchedAt = data.fetchedAt || null;
  },

  fbReady() {
    return !!(window.firebaseDb && window.firebaseCollections && window.firebaseCollections.doc);
  },

  async waitFirebase(ms) {
    const limit = ms || 5000;
    const t0 = Date.now();
    while (Date.now() - t0 < limit) {
      if (this.fbReady()) return true;
      await this.sleep(120);
    }
    return this.fbReady();
  },

  async loadFirebase() {
    if (!this.fbReady()) return null;
    const { doc, getDoc, getDocs, collection } = window.firebaseCollections;
    try {
      const metaSnap = await getDoc(doc(window.firebaseDb, this.FB_COL, "_meta"));
      const colSnap = await getDocs(collection(window.firebaseDb, this.FB_COL));
      const units = [];
      const ccDone = [];
      colSnap.forEach(d => {
        if (d.id === "_meta") return;
        const data = d.data() || {};
        if (Array.isArray(data.units)) units.push(...data.units);
        if (data.enterpriseId) ccDone.push(String(data.enterpriseId));
      });
      if (!units.length) return null;
      const meta = metaSnap.exists() ? metaSnap.data() : {};
      return {
        units,
        ccDone: [...new Set(ccDone.concat(meta.ccDone || []))],
        complete: meta.complete !== false,
        contractsEnriched: !!meta.contractsEnriched,
        fetchedAt: meta.fetchedAt || null
      };
    } catch (e) {
      console.error("[Estoque] leitura Firebase", e);
      return null;
    }
  },

  async saveFirebase() {
    if (!this.fbReady()) return false;
    const { doc, setDoc, getDocs, collection, deleteDoc } = window.firebaseCollections;
    try {
      const grouped = {};
      this.state.units.forEach(u => {
        const cc = String(u.enterpriseId || "0");
        if (!grouped[cc]) grouped[cc] = [];
        grouped[cc].push(u);
      });

      const keep = new Set(["_meta"]);
      const writes = [];
      Object.keys(grouped).forEach(cc => {
        const list = grouped[cc];
        const empName = (list[0] && list[0].enterpriseName) || this.empName(cc);
        for (let i = 0, n = 0; i < list.length; i += this.FB_CHUNK, n += 1) {
          const id = `cc_${cc}_${n}`;
          keep.add(id);
          writes.push(setDoc(doc(window.firebaseDb, this.FB_COL, id), {
            enterpriseId: cc,
            enterpriseName: empName,
            chunk: n,
            units: list.slice(i, i + this.FB_CHUNK),
            updatedAt: new Date().toISOString(),
            date: this.todayStr()
          }));
        }
      });
      writes.push(setDoc(doc(window.firebaseDb, this.FB_COL, "_meta"), {
        date: this.todayStr(),
        ccDone: this.state.ccDone,
        complete: this.state.complete,
        contractsEnriched: this.state.contractsEnriched,
        fetchedAt: this.state.fetchedAt || new Date().toISOString(),
        unitCount: this.state.units.length,
        updatedAt: new Date().toISOString()
      }));
      await Promise.all(writes);

      const existing = await getDocs(collection(window.firebaseDb, this.FB_COL));
      const leftovers = [];
      existing.forEach(d => {
        if (!keep.has(d.id)) leftovers.push(deleteDoc(d.ref));
      });
      if (leftovers.length) await Promise.all(leftovers);
      this.state.firebaseOk = true;
      return true;
    } catch (e) {
      console.error("[Estoque] gravação Firebase", e);
      this.state.firebaseOk = false;
      return false;
    }
  },

  persistAll() {
    this.saveCache();
    return this.saveFirebase();
  },

  async init() {
    this.renderPills();
    if (this.state.inited && this.state.units.length) {
      this.fillUnitSelect();
      this.updateMeta();
      this.renderTable();
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    await this.waitFirebase();
    const fb = await this.loadFirebase();
    const local = this.loadCache();
    if (fb && fb.units.length) {
      this.applyCache(fb);
    } else if (local && local.units && local.units.length) {
      this.applyCache(local);
    }
    await this.loadEnterprises();
    this.fillUnitSelect();
    this.updateMeta();
    if (this.state.units.length) this.renderTable();
    if (window.lucide) window.lucide.createIcons();

    if (this.state.units.length) {
      this.setProgress("Gravando estoque no Firebase…", 10);
      await this.persistAll();
      this.updateMeta();
      if (this.needsContractEnrich()) {
        await this.enrichContracts();
      }
      this.setProgress("");
      this.fillUnitSelect();
      this.updateMeta();
      this.renderTable();
    }
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
      `<button type="button" class="est-pill${this.state.status === p.id ? " is-active" : ""}" data-status="${this.esc(p.id)}" onclick="EstoqueComercialApp.setStatus('${p.id}')">${this.esc(p.label)}</button>`
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
    this.renderTable();
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
    if (!emp) return;
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
      el.textContent = "Ainda sem estoque. Consultar dispara o loop no Sienge e grava no Firebase.";
      return;
    }
    const when = this.state.fetchedAt ? new Date(this.state.fetchedAt).toLocaleString("pt-BR") : "hoje";
    const fb = this.state.firebaseOk ? " Firebase ok." : (this.fbReady() ? " Gravando/lendo Firebase." : " Firebase indisponível.");
    const extra = this.state.complete ? "" : ` Carga incompleta (${this.state.ccDone.length} empreendimentos).`;
    el.textContent = `${this.state.units.length} unidades · atualizado ${when}.${extra}${fb}`;
  },

  normName(name) {
    return String(name || "").replace(/\s+/g, "").toUpperCase();
  },

  buildDefaulterIndex() {
    const idx = { byRb: new Set(), byUnit: new Set() };
    const bills = (window.AppState && AppState.defaultersBills) || [];
    bills.forEach(b => {
      if (b.receivableBillId) idx.byRb.add(String(b.receivableBillId));
      if (b.id) idx.byRb.add(String(b.id));
      const cc = String(b.costCenterId || (b.costCentersId && b.costCentersId[0]) || "");
      const units = String(b.units || "");
      units.split(/[;,|/]/).forEach(part => {
        const n = this.normName(part);
        if (n && n !== "N/D") idx.byUnit.add(`${cc}|${n}`);
      });
      if (cc) idx.byUnit.add(`${cc}|${this.normName(units)}`);
    });
    this.state.defaulterIndex = idx;
    return idx;
  },

  isInadimplente(u) {
    const idx = this.state.defaulterIndex || this.buildDefaulterIndex();
    if (u.receivableBillId && idx.byRb.has(String(u.receivableBillId))) return true;
    const cc = String(u.enterpriseId || "");
    return idx.byUnit.has(`${cc}|${this.normName(u.name)}`);
  },

  financialStatus(u) {
    const code = String(u.commercialStock || "").toUpperCase();
    const sold = this.SOLD_CODES.includes(code) || !!u.contractNumber || !!u.contractId;
    if (!sold) return "—";
    if (u.quitado || (u.contractNumber && u.outstandingBalance === 0)) return "Quitado";
    if (this.isInadimplente(u)) return "Inadimplente";
    if (u.contractNumber || this.SOLD_CODES.includes(code)) {
      if (window.AppState && AppState.defaultersLoaded) return "Adimplente";
      return "Em aberto";
    }
    return "—";
  },

  selectedUnits() {
    const emp = (document.getElementById("est-filter-emp") || {}).value || "";
    const unitId = (document.getElementById("est-filter-unit") || {}).value || "";
    const q = String((document.getElementById("est-stock-search") || {}).value || "").trim().toLowerCase();
    let rows = this.state.units;
    if (emp) rows = rows.filter(u => String(u.enterpriseId) === String(emp));
    if (unitId) rows = rows.filter(u => String(u.id) === String(unitId));
    if (this.state.status && this.state.status !== "all") {
      const want = String(this.state.status).toUpperCase();
      rows = rows.filter(u => String(u.commercialStock || "").toUpperCase() === want);
    }
    if (q) {
      rows = rows.filter(u => {
        const hay = `${u.enterpriseId} ${u.enterpriseName} ${u.id} ${u.name} ${u.commercialStock} ${u.contractNumber || ""}`.toLowerCase();
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
      const k = this.mapStock(u.commercialStock);
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
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#94a3b8;">Nenhuma unidade para os filtros atuais.</td></tr>`;
      return;
    }
    const sorted = rows.slice().sort((a, b) => {
      const e = String(a.enterpriseId).localeCompare(String(b.enterpriseId), undefined, { numeric: true });
      if (e) return e;
      return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" });
    });
    tbody.innerHTML = sorted.map(u => {
      const status = this.mapStock(u.commercialStock);
      const area = u.area != null && u.area !== "" ? Number(u.area).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—";
      const empName = u.enterpriseName || this.empName(u.enterpriseId);
      const contrato = u.contractNumber || "—";
      const fin = this.financialStatus(u);
      const finClass = fin === "Em aberto" ? "est-fin-aberto" : "est-fin-" + fin;
      return `<tr>
        <td><span class="est-status-chip">${this.esc(status)}</span></td>
        <td>${this.esc(u.enterpriseId)} / ${this.esc(empName)}</td>
        <td>${this.esc(u.id)} / ${this.esc(u.name)}</td>
        <td>${this.esc(u.commercialStock || "—")}</td>
        <td>${this.esc(this.mapCode(this.LEGAL_MAP, u.legalStock))}</td>
        <td>${this.esc(this.mapCode(this.OBRA_MAP, u.buildingStock))}</td>
        <td>${this.esc(area)}</td>
        <td>${this.esc(contrato)}</td>
        <td><span class="est-fin-chip ${finClass}">${this.esc(fin)}</span></td>
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

  keepQuitado(prev, next) {
    const old = {};
    (prev || []).forEach(u => {
      if (u && u.quitado) old[String(u.id)] = u;
    });
    return (next || []).map(u => {
      const keep = old[String(u.id)];
      if (!keep) return u;
      return {
        ...u,
        quitado: true,
        contractNumber: u.contractNumber || keep.contractNumber,
        outstandingBalance: 0,
        receivableBillId: u.receivableBillId || keep.receivableBillId,
        customerId: u.customerId || keep.customerId
      };
    });
  },

  async fetchUnitsForCc(cc) {
    const empName = cc.name || "";
    const collected = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const path = `/units?limit=${this.LIMIT}&offset=${offset}&enterpriseId=${cc.id}&additionalData=NONE`;
      const data = await this.siengeFetch(path);
      const results = (data && data.results) || [];
      results.forEach(u => collected.push(this.slimUnit(u, empName)));
      if (results.length < this.LIMIT) hasMore = false;
      else offset += results.length;
    }
    return collected;
  },

  needsContract(u) {
    if (!u || u.quitado) return false;
    if (u.contractNumber) return false;
    const code = String(u.commercialStock || "").toUpperCase();
    return this.SOLD_CODES.includes(code) || !!u.contractId;
  },

  needsContractEnrich() {
    if (this.state.contractsEnriched) {
      return this.state.units.some(u => this.needsContract(u));
    }
    return this.state.units.some(u => this.needsContract(u));
  },

  applyContractInfo(u, info) {
    if (!info || u.quitado) return u;
    const bal = info.outstandingBalance;
    const quitado = Number(bal) === 0 && info.situation !== "Distratado";
    return {
      ...u,
      contractNumber: info.contractNumber || u.contractNumber,
      receivableBillId: info.receivableBillId || u.receivableBillId,
      customerId: info.customerId || u.customerId,
      outstandingBalance: bal == null ? u.outstandingBalance : Number(bal),
      quitado: !!quitado
    };
  },

  contractInfoFromSale(c) {
    const mainCust = (c.salesContractCustomers || []).find(x => x.main === true) || (c.salesContractCustomers || [])[0] || {};
    return {
      contractNumber: c.number || c.contractNumber || c.documentNumber || "",
      outstandingBalance: c.outstandingBalance,
      receivableBillId: c.receivableBillId || null,
      customerId: mainCust.id || c.customerId || null,
      situation: c.situation || c.status || ""
    };
  },

  async fetchContractsForCc(ccId) {
    const byId = {};
    const byName = {};
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const path = `/sales-contracts?limit=${this.LIMIT}&offset=${offset}&enterpriseId=${ccId}`;
      const data = await this.siengeFetch(path);
      const results = (data && data.results) || [];
      results.forEach(c => {
        const info = this.contractInfoFromSale(c);
        const units = c.salesContractUnits || [];
        units.forEach(su => {
          const uid = su.unitId || su.id;
          if (uid) byId[String(uid)] = info;
          if (su.name) byName[this.normName(su.name)] = info;
        });
        if (c.unitId) byId[String(c.unitId)] = info;
        if (c.unitName) byName[this.normName(c.unitName)] = info;
      });
      if (results.length < this.LIMIT) hasMore = false;
      else offset += results.length;
    }
    return { byId, byName };
  },

  async enrichContracts() {
    const ccs = [...new Set(this.state.units.filter(u => this.needsContract(u)).map(u => String(u.enterpriseId)))];
    if (!ccs.length) {
      this.state.contractsEnriched = true;
      await this.persistAll();
      return;
    }
    this.setBusy(true);
    try {
      for (let i = 0; i < ccs.length; i++) {
        const ccId = ccs[i];
        this.setProgress(`Cruzando contratos ${ccId} (${i + 1}/${ccs.length})…`, ((i + 1) / ccs.length) * 100);
        try {
          const maps = await this.fetchContractsForCc(ccId);
          this.state.units = this.state.units.map(u => {
            if (String(u.enterpriseId) !== String(ccId)) return u;
            if (u.quitado) return u;
            const info = maps.byId[String(u.id)] || maps.byName[this.normName(u.name)];
            return this.applyContractInfo(u, info);
          });
          await this.persistAll();
        } catch (e) {
          console.error("[Estoque] contratos CC", ccId, e);
        }
        await this.sleep(80);
      }
      this.state.contractsEnriched = true;
      this.state.fetchedAt = this.state.fetchedAt || new Date().toISOString();
      await this.persistAll();
    } finally {
      this.setBusy(false);
    }
  },

  async consultar(forceRefresh) {
    if (this.state.loading) return;
    if (!this.state.enterprises.length) await this.loadEnterprises();
    if (!this.state.enterprises.length) {
      alert("Nenhum centro de custo começando com 1, 2 ou 3.");
      return;
    }

    if (forceRefresh) {
      const prev = this.state.units.slice();
      this.state.units = [];
      this.state.ccDone = [];
      this.state.complete = false;
      this.state.contractsEnriched = false;
      this.state.fetchedAt = null;
      this._prevQuitados = prev;
    } else if (!this.state.units.length) {
      const fb = await this.loadFirebase();
      const local = this.loadCache();
      this.applyCache(fb && fb.units.length ? fb : local);
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
            let batch = await this.fetchUnitsForCc(cc);
            if (this._prevQuitados) batch = this.keepQuitado(this._prevQuitados, batch);
            else batch = this.keepQuitado(this.state.units, batch);
            this.state.units = this.state.units.filter(u => String(u.enterpriseId) !== String(cc.id)).concat(batch);
            this.state.ccDone.push(String(cc.id));
            this.state.fetchedAt = new Date().toISOString();
            await this.persistAll();
          } catch (e) {
            console.error("[Estoque] falha no CC", cc.id, e);
            this.setProgress(`Erro em ${cc.id}: ${e.message || e}. Continuando…`, (done / total) * 100);
            await this.sleep(400);
          }
          await this.sleep(80);
        }
        this.state.complete = this.state.ccDone.length >= this.state.enterprises.length;
        this._prevQuitados = null;
        await this.persistAll();
      }

      if (this.needsContractEnrich()) {
        await this.enrichContracts();
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
